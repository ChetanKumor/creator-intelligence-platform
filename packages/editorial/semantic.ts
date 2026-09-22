import { z } from "zod";
import { EmbeddingReferenceSchema } from "../contracts/common.js";
import type { EmbeddingReference } from "../domain/index.js";
import { contentId } from "../reference-analyzer/features.js";
import { InputValidationError, assertCompatibleEmbeddingSpaces } from "../validation/index.js";
import { MissingSchema, availability, missing, present, type Availability, type EvidenceRef } from "./common.js";
import type { EditorialVectorResolver } from "./token.js";

export const EDITORIAL_SEMANTIC_POLICY_VERSION = "owned-cosine-v1" as const;

const SimilaritySchema = z.number().finite().min(-1).max(1);

export const EditorialSemanticComparisonSchema = z.strictObject({
  left: EmbeddingReferenceSchema,
  right: EmbeddingReferenceSchema,
  metric: z.literal("cosine_similarity"),
  policyVersion: z.literal(EDITORIAL_SEMANTIC_POLICY_VERSION),
  similarity: availability(SimilaritySchema),
});
export type EditorialSemanticComparison = z.infer<typeof EditorialSemanticComparisonSchema>;

function validateResolvedVector(reference: EmbeddingReference, vector: readonly number[]): readonly number[] {
  if (!Array.isArray(vector) || vector.length !== reference.dimensions || vector.length === 0) {
    throw new InputValidationError("semantic_vector_dimension_mismatch", "Resolved semantic vector dimensions disagree with its embedding reference.");
  }
  let squaredNorm = 0;
  for (const value of vector) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new InputValidationError("semantic_vector_non_finite", "Resolved semantic vector values must be finite.");
    }
    squaredNorm += value * value;
  }
  const norm = Math.sqrt(squaredNorm);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-6) {
    throw new InputValidationError("semantic_vector_not_unit", "Resolved semantic vectors must have unit Euclidean norm within 1e-6.");
  }
  const expectedEmbeddingId = contentId("embedding", [reference.objectId, contentId("digest", vector)]);
  if (expectedEmbeddingId !== reference.embeddingId) {
    throw new InputValidationError("semantic_vector_identity_mismatch", "Resolved semantic vector digest does not match its embeddingId.");
  }
  return vector;
}

function validateResolution(reference: EmbeddingReference, resolution: Availability<readonly number[]>): Availability<readonly number[]> {
  if (resolution.state !== "present") return MissingSchema.parse(resolution);
  return present(validateResolvedVector(reference, resolution.value));
}

function combinedEvidence(resolutions: readonly Availability<readonly number[]>[]): EvidenceRef[] {
  const refs = resolutions.flatMap((resolution) => resolution.state === "present" ? [] : resolution.evidenceRefs);
  return [...new Map(refs.map((ref) => [JSON.stringify(ref), ref])).values()];
}

function cosine(left: readonly number[], right: readonly number[]): number {
  let similarity = 0;
  for (let index = 0; index < left.length; index++) similarity += left[index]! * right[index]!;
  if (!Number.isFinite(similarity)) throw new InputValidationError("semantic_similarity_non_finite", "Cosine similarity must be finite.");
  return Math.max(-1, Math.min(1, similarity));
}

export async function compareEditorialSemantics(
  leftInput: EmbeddingReference,
  rightInput: EmbeddingReference,
  resolver: EditorialVectorResolver,
): Promise<EditorialSemanticComparison> {
  const left = EmbeddingReferenceSchema.parse(leftInput), right = EmbeddingReferenceSchema.parse(rightInput);
  assertCompatibleEmbeddingSpaces(left, right);
  if (left.distance !== "cosine") {
    throw new InputValidationError("semantic_distance_unsupported", "Gate 2 semantic comparison requires cosine distance references.");
  }
  if (left.spaceVersion !== "normalized-mean-v1") {
    throw new InputValidationError("semantic_space_version_unsupported", "Gate 2 semantic comparison requires normalized-mean-v1 references.");
  }

  const leftResolution = validateResolution(left, await resolver.resolve(left));
  const rightResolution = validateResolution(right, await resolver.resolve(right));
  const similarity = leftResolution.state === "present" && rightResolution.state === "present"
    ? present(cosine(leftResolution.value, rightResolution.value))
    : missing("unavailable", "semantic_vector_unavailable", combinedEvidence([leftResolution, rightResolution]));

  return EditorialSemanticComparisonSchema.parse({
    left,
    right,
    metric: "cosine_similarity",
    policyVersion: EDITORIAL_SEMANTIC_POLICY_VERSION,
    similarity,
  });
}
