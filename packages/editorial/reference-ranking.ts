import { z } from "zod";
import { EmbeddingReferenceSchema, IdSchema, VersionLabelSchema } from "../contracts/common.js";
import { ReferenceFingerprintV11Schema } from "../contracts/reference-v11.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { embeddingSpaceId } from "../reference-analyzer/embeddings.js";
import { contentId } from "../reference-analyzer/features.js";
import { AuthorizationManifestSchema, DetectorConfigSchema, EmbeddingConfigSchema, HashSchema } from "../reference-analyzer/protocol.js";
import {
  ArtifactRefSchema,
  EvidenceRefSchema,
  IdSetSchema,
  availability,
  checkIdentity,
  compareText,
  editorialEnvelope,
  ensure,
  equal,
  identify,
  missing,
  present,
  unique,
  type ArtifactRef,
  type EditorialArtifactMap,
} from "./common.js";
import { EditorialCandidateSetSchema, validateCandidateSet } from "./decision.js";
import { resolveTokenView } from "./resolve.js";
import { EDITORIAL_SEMANTIC_POLICY_VERSION, compareEditorialSemantics } from "./semantic.js";
import { LocalitySchema, type EditorialVectorResolver } from "./token.js";
import { TaskRefSchema, taskRef } from "./taxonomy.js";

export const REFERENCE_SEMANTIC_FEATURE_SET_VERSION = "reference-semantic-0.1.0" as const;
export const REFERENCE_SEMANTIC_POLICY = { kind: "rule", name: "reference_semantic_similarity", version: "0.1.0" } as const;

const SimilaritySchema = z.number().finite().min(-1).max(1);
const CandidateSetRefSchema = ArtifactRefSchema.refine(
  (ref) => ref.artifactType === "EditorialCandidateSet" && ref.artifactVersion === "0.1.0",
  "Expected internal EditorialCandidateSet reference.",
);
const ReferenceFingerprintRefSchema = ArtifactRefSchema.refine(
  (ref) => ref.artifactType === "ReferenceFingerprint" && ref.artifactVersion === "1.1.0",
  "Expected ReferenceFingerprint 1.1.0 reference.",
);
const ReferenceAnalysisRefSchema = ArtifactRefSchema.refine(
  (ref) => ref.artifactType === "ReferenceAnalysis" && ref.artifactVersion === "1.0.0",
  "Expected ReferenceAnalysis 1.0.0 reference.",
);
const CandidateRankingTaskSchema = TaskRefSchema.refine(
  (task) => equal(task, taskRef("candidate_ranking")),
  "Expected candidate_ranking task.",
);
const ReferenceSemanticPolicySchema = z.strictObject({
  kind: z.literal("rule"),
  name: z.literal("reference_semantic_similarity"),
  version: z.literal("0.1.0"),
});

const ReferenceTargetSchema = z.strictObject({
  fingerprint: ReferenceFingerprintRefSchema,
  analysis: ReferenceAnalysisRefSchema,
  authorization: EvidenceRefSchema,
  shotId: IdSchema,
  embedding: availability(EmbeddingReferenceSchema),
}).superRefine((target, ctx) => {
  if (!equal(target.authorization.artifact, target.analysis) || target.authorization.pointer !== "/authorization") {
    ctx.addIssue({ code: "custom", message: "Reference authorization evidence must identify the supplied analysis authorization." });
  }
});

const CandidateSemanticSchema = availability(z.strictObject({
  embedding: EmbeddingReferenceSchema,
  locality: LocalitySchema,
}));

export const EditorialReferenceSemanticRankingCandidateResultSchema = z.strictObject({
  candidateId: IdSchema,
  semantic: CandidateSemanticSchema,
  similarity: availability(SimilaritySchema),
});
export type EditorialReferenceSemanticRankingCandidateResult = z.infer<typeof EditorialReferenceSemanticRankingCandidateResultSchema>;

const RankedTieGroupSchema = z.strictObject({
  score: SimilaritySchema,
  candidateIds: IdSetSchema.refine((ids) => ids.length > 0, "Ranked tie groups cannot be empty."),
});

export const EditorialReferenceSemanticRankingPredictionBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialReferenceSemanticRankingPrediction"),
  projectId: IdSchema,
  candidateSet: CandidateSetRefSchema,
  task: CandidateRankingTaskSchema,
  featureSetVersion: z.literal(REFERENCE_SEMANTIC_FEATURE_SET_VERSION),
  policy: ReferenceSemanticPolicySchema,
  comparisonPolicyVersion: z.literal(EDITORIAL_SEMANTIC_POLICY_VERSION),
  referenceTarget: ReferenceTargetSchema,
  candidateResults: z.array(EditorialReferenceSemanticRankingCandidateResultSchema).max(4096)
    .refine((results) => unique(results.map((result) => result.candidateId)), "Duplicate candidate results.")
    .transform((results) => [...results].sort((left, right) => compareText(left.candidateId, right.candidateId))),
  rankedTieGroups: z.array(RankedTieGroupSchema).max(4096),
});

export const EditorialReferenceSemanticRankingPredictionSchema = EditorialReferenceSemanticRankingPredictionBodySchema.extend({
  predictionId: IdSchema,
}).superRefine((prediction, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!checkIdentity(prediction, "predictionId", "editorial_reference_semantic_ranking_prediction")) fail("Reference semantic ranking prediction identity mismatch.");
  const results = new Map(prediction.candidateResults.map((result) => [result.candidateId, result]));
  const rankedIds: string[] = [];
  for (const [index, group] of prediction.rankedTieGroups.entries()) {
    if (index > 0 && prediction.rankedTieGroups[index - 1]!.score <= group.score) fail("Ranked tie-group scores must be strictly descending.");
    for (const candidateId of group.candidateIds) {
      const result = results.get(candidateId);
      if (!result || result.similarity.state !== "present" || result.similarity.value !== group.score) fail("Ranked tie group must contain only candidates with its exact present similarity.");
      rankedIds.push(candidateId);
    }
  }
  if (!unique(rankedIds)) fail("A scored candidate may appear in exactly one rank group.");
  const scoredIds = prediction.candidateResults.filter((result) => result.similarity.state === "present").map((result) => result.candidateId).sort(compareText);
  if (!equal([...rankedIds].sort(compareText), scoredIds)) fail("Rank groups must contain every scored candidate exactly once.");
});
export type EditorialReferenceSemanticRankingPrediction = z.infer<typeof EditorialReferenceSemanticRankingPredictionSchema>;

const ReferenceAnalysisProjectionSchema = z.strictObject({
  artifactType: z.literal("ReferenceAnalysis"),
  artifactVersion: z.literal("1.0.0"),
  identity: z.strictObject({ contentHash: HashSchema, sizeBytes: z.number().int().positive().safe(), assetId: IdSchema }),
  authorization: AuthorizationManifestSchema,
  config: z.strictObject({ detector: DetectorConfigSchema, embedding: EmbeddingConfigSchema, analyzerVersion: VersionLabelSchema }),
  configurationId: IdSchema,
  embeddingBatch: z.strictObject({
    shots: z.array(z.strictObject({ shotId: IdSchema, reference: EmbeddingReferenceSchema })).min(1).max(1000)
      .refine((shots) => unique(shots.map((shot) => shot.shotId)), "Duplicate ReferenceAnalysis embeddingBatch shot IDs."),
    model: EmbeddingConfigSchema,
    batchId: IdSchema,
  }),
});
type ReferenceAnalysisProjection = z.infer<typeof ReferenceAnalysisProjectionSchema>;

function object(input: unknown): Record<string, unknown> {
  ensure(input !== null && typeof input === "object" && !Array.isArray(input), "Expected ReferenceAnalysis object.");
  return input as Record<string, unknown>;
}

function projectReferenceAnalysis(input: unknown): ReferenceAnalysisProjection {
  const raw = object(input), identity = object(raw.identity), config = object(raw.config), batch = object(raw.embeddingBatch);
  return ReferenceAnalysisProjectionSchema.parse({
    artifactType: raw.artifactType,
    artifactVersion: raw.artifactVersion,
    identity: { contentHash: identity.contentHash, sizeBytes: identity.sizeBytes, assetId: identity.assetId },
    authorization: raw.authorization,
    config: { detector: config.detector, embedding: config.embedding, analyzerVersion: config.analyzerVersion },
    configurationId: raw.configurationId,
    embeddingBatch: { shots: batch.shots, model: batch.model, batchId: batch.batchId },
  });
}

function validateAuthorizations(
  set: z.infer<typeof EditorialCandidateSetSchema>,
  reference: ReferenceAnalysisProjection,
  artifacts: EditorialArtifactMap,
): void {
  ensure(reference.authorization.allowedPurposes.includes("local_evaluation"), "Reference authorization must include local_evaluation.");
  ensure(reference.authorization.projectId === set.projectId, "Reference/candidate project mismatch.");
  for (const analysisRef of set.analysisRefs) {
    const analysis = FootageAnalysisSchema.parse(artifacts.get(analysisRef));
    ensure(analysis.authorization.allowedPurposes.includes("local_evaluation"), "Candidate footage authorization must include local_evaluation.");
    ensure(analysis.authorization.projectId === set.projectId, "Candidate footage project mismatch.");
    ensure(analysis.authorization.creatorId === reference.authorization.creatorId, "Reference/candidate creator scope mismatch.");
  }
}

function referenceTarget(
  fingerprintRef: ArtifactRef,
  analysisRef: ArtifactRef,
  shotId: string,
  artifacts: EditorialArtifactMap,
) {
  const fingerprint = ReferenceFingerprintV11Schema.parse(artifacts.get(fingerprintRef));
  const analysis = projectReferenceAnalysis(artifacts.get(analysisRef));
  ensure(analysis.configurationId === contentId("configuration", analysis.config), "ReferenceAnalysis configuration identity mismatch.");
  ensure(equal(analysis.embeddingBatch.model, analysis.config.embedding), "ReferenceAnalysis embedding batch model/configuration mismatch.");
  ensure(analysis.embeddingBatch.batchId === contentId("batch", analysis.embeddingBatch.shots), "ReferenceAnalysis embedding batch identity mismatch.");
  ensure(fingerprint.assetId === analysis.identity.assetId, "Reference fingerprint/analysis asset mismatch.");
  ensure(analysis.identity.contentHash === analysis.authorization.contentHash, "Reference analysis/authorization content hash mismatch.");
  ensure(analysis.identity.sizeBytes === analysis.authorization.sizeBytes, "Reference analysis/authorization size mismatch.");
  ensure(fingerprint.assetId === `asset_${analysis.authorization.contentHash}`, "Reference fingerprint is not bound to the authorized content hash.");
  const shotIndex = fingerprint.shots.findIndex((shot) => shot.shotId === shotId);
  ensure(shotIndex >= 0, "Unknown explicitly selected reference shot.");
  const selected = fingerprint.shots[shotIndex]!;
  const authorization = { artifact: analysisRef, pointer: "/authorization" };
  if (selected.semanticEmbedding === null) {
    return {
      fingerprint,
      analysis,
      target: ReferenceTargetSchema.parse({
        fingerprint: fingerprintRef,
        analysis: analysisRef,
        authorization,
        shotId,
        embedding: missing("unavailable", "reference_embedding_unavailable", [{ artifact: fingerprintRef, pointer: `/shots/${shotIndex}/semanticEmbedding` }]),
      }),
    };
  }
  const batchShot = analysis.embeddingBatch.shots.find((shot) => shot.shotId === shotId);
  ensure(batchShot !== undefined, "Selected reference shot is missing from the embedding batch.");
  ensure(equal(selected.semanticEmbedding, batchShot.reference), "Selected fingerprint embedding contradicts the same-shot ReferenceAnalysis embedding.");
  ensure(selected.semanticEmbedding.spaceVersion === "normalized-mean-v1", "Reference target requires normalized-mean-v1 semantic space.");
  ensure(selected.semanticEmbedding.distance === "cosine", "Reference target requires cosine distance.");
  ensure(selected.semanticEmbedding.spaceId === embeddingSpaceId(analysis.config.embedding), "Reference target embedding space disagrees with ReferenceAnalysis configuration.");
  return {
    fingerprint,
    analysis,
    target: ReferenceTargetSchema.parse({ fingerprint: fingerprintRef, analysis: analysisRef, authorization, shotId, embedding: present(selected.semanticEmbedding) }),
  };
}

function rankGroups(candidateResults: readonly EditorialReferenceSemanticRankingCandidateResult[]) {
  const scores = new Map<number, string[]>();
  for (const result of candidateResults) {
    if (result.similarity.state !== "present") continue;
    const ids = scores.get(result.similarity.value) ?? [];
    ids.push(result.candidateId);
    scores.set(result.similarity.value, ids);
  }
  return [...scores.entries()]
    .sort(([left], [right]) => right - left)
    .map(([score, candidateIds]) => RankedTieGroupSchema.parse({ score, candidateIds }));
}

async function buildPrediction(
  input: {
    candidateSet: ArtifactRef;
    referenceFingerprint: ArtifactRef;
    referenceAnalysis: ArtifactRef;
    referenceShotId: string;
  },
  artifacts: EditorialArtifactMap,
  resolver: EditorialVectorResolver,
) {
  const candidateSet = CandidateSetRefSchema.parse(input.candidateSet);
  const fingerprint = ReferenceFingerprintRefSchema.parse(input.referenceFingerprint);
  const analysis = ReferenceAnalysisRefSchema.parse(input.referenceAnalysis);
  const { set, tokens } = validateCandidateSet(EditorialCandidateSetSchema.parse(artifacts.get(candidateSet)), artifacts);
  const reference = referenceTarget(fingerprint, analysis, IdSchema.parse(input.referenceShotId), artifacts);
  validateAuthorizations(set, reference.analysis, artifacts);
  const candidateResults: EditorialReferenceSemanticRankingCandidateResult[] = [];
  for (const { candidateId } of set.candidates) {
    const view = resolveTokenView(tokens.get(candidateId)!, artifacts);
    if (view.token.semantic.data.state !== "present") {
      const sourceMissing = view.token.semantic.data;
      const similarityMissing = missing(
        "unavailable",
        "candidate_semantic_unavailable",
        sourceMissing.evidenceRefs,
      );
      candidateResults.push(EditorialReferenceSemanticRankingCandidateResultSchema.parse({
        candidateId,
        semantic: sourceMissing,
        similarity: similarityMissing,
      }));
      continue;
    }
    const semantic = present({ embedding: view.token.semantic.data.value.embedding, locality: view.token.semantic.data.value.locality });
    if (reference.target.embedding.state !== "present") {
      candidateResults.push(EditorialReferenceSemanticRankingCandidateResultSchema.parse({ candidateId, semantic, similarity: reference.target.embedding }));
      continue;
    }
    const comparison = await compareEditorialSemantics(reference.target.embedding.value, semantic.value.embedding, resolver);
    candidateResults.push(EditorialReferenceSemanticRankingCandidateResultSchema.parse({ candidateId, semantic, similarity: comparison.similarity }));
  }
  const canonicalResults = EditorialReferenceSemanticRankingPredictionBodySchema.shape.candidateResults.parse(candidateResults);
  return { set, referenceTarget: reference.target, candidateResults: canonicalResults, rankedTieGroups: rankGroups(canonicalResults) };
}

export async function createEditorialReferenceSemanticRankingPrediction(
  input: {
    candidateSet: ArtifactRef;
    referenceFingerprint: ArtifactRef;
    referenceAnalysis: ArtifactRef;
    referenceShotId: string;
  },
  artifacts: EditorialArtifactMap,
  resolver: EditorialVectorResolver,
): Promise<EditorialReferenceSemanticRankingPrediction> {
  const built = await buildPrediction(input, artifacts, resolver);
  const body = EditorialReferenceSemanticRankingPredictionBodySchema.parse({
    artifactType: "EditorialReferenceSemanticRankingPrediction",
    artifactVersion: "0.1.0",
    stability: "internal_pre_stable",
    projectId: built.set.projectId,
    candidateSet: input.candidateSet,
    task: taskRef("candidate_ranking"),
    featureSetVersion: REFERENCE_SEMANTIC_FEATURE_SET_VERSION,
    policy: REFERENCE_SEMANTIC_POLICY,
    comparisonPolicyVersion: EDITORIAL_SEMANTIC_POLICY_VERSION,
    referenceTarget: built.referenceTarget,
    candidateResults: built.candidateResults,
    rankedTieGroups: built.rankedTieGroups,
  });
  return EditorialReferenceSemanticRankingPredictionSchema.parse(identify("editorial_reference_semantic_ranking_prediction", "predictionId", body));
}

export async function validateEditorialReferenceSemanticRankingPrediction(
  input: unknown,
  artifacts: EditorialArtifactMap,
  resolver: EditorialVectorResolver,
): Promise<EditorialReferenceSemanticRankingPrediction> {
  const prediction = EditorialReferenceSemanticRankingPredictionSchema.parse(input);
  const expected = await createEditorialReferenceSemanticRankingPrediction({
    candidateSet: prediction.candidateSet,
    referenceFingerprint: prediction.referenceTarget.fingerprint,
    referenceAnalysis: prediction.referenceTarget.analysis,
    referenceShotId: prediction.referenceTarget.shotId,
  }, artifacts, resolver);
  ensure(equal(prediction, expected), "Reference semantic ranking prediction contradicts supplied evidence or deterministic comparison results.");
  return prediction;
}
