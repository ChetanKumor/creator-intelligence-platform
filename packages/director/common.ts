import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EvidenceRefSchema, compareText, ensure, equal, type ArtifactRef, type EditorialArtifactMap } from "../editorial/common.js";

export const DIRECTOR_VERSION = "0.1.0" as const;
export const DirectorScopeSchema = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, purpose: IdSchema });
export type DirectorScope = z.infer<typeof DirectorScopeSchema>;
export const DirectorDomainSchema = z.enum(["talking_head", "event", "narrative"]);
export const DirectorTextSchema = z.string().min(1).max(1000);
export const DirectorIdSetSchema = z.array(IdSchema).max(256).refine(
  values => values.every((value, index) => index === 0 || compareText(values[index - 1]!, value) < 0),
  "IDs must be unique and canonically sorted.",
);
export const DirectorEvidenceSetSchema = z.array(EvidenceRefSchema).max(256).refine(
  values => values.every((value, index) => index === 0 || compareText(canonicalSerialize(values[index - 1]!), canonicalSerialize(value)) < 0),
  "Evidence references must be unique and canonically sorted.",
);
export const DirectorRefSetSchema = z.array(ArtifactRefSchema).max(256).refine(
  values => values.every((value, index) => index === 0 || compareText(values[index - 1]!.objectId, value.objectId) < 0),
  "Artifact references must be unique and canonically sorted.",
);
export const DirectorUncertaintySchema = z.strictObject({
  state: z.enum(["unknown", "qualitative"]),
  reasonCode: IdSchema,
  evidenceRefs: DirectorEvidenceSetSchema,
});
export const DirectorFailureSchema = z.strictObject({
  code: IdSchema,
  stage: z.enum(["request", "direction", "grounding", "adapter", "runtime"]),
  retryable: z.boolean(),
  affectedRefs: DirectorRefSetSchema,
  evidenceRefs: DirectorEvidenceSetSchema.refine(values => values.length > 0, "Failure requires evidence."),
  dependencyFailures: DirectorRefSetSchema,
});
export function directorEnvelope<const T extends string>(artifactType: T) {
  return { artifactType: z.literal(artifactType), artifactVersion: z.literal(DIRECTOR_VERSION), stability: z.literal("internal_pre_stable") };
}
export function exactArtifact(map: EditorialArtifactMap, refInput: ArtifactRef, kind: string, version = DIRECTOR_VERSION): unknown {
  const ref = ArtifactRefSchema.parse(refInput);
  ensure(ref.artifactType === kind && ref.artifactVersion === version, `Exact ${kind} artifact required.`);
  return map.get(ref);
}
export function sameScope(a: DirectorScope, b: DirectorScope): boolean { return equal(a, b); }
export function canonicalIds(values: readonly string[]): string[] { return [...values].sort(compareText); }
export function canonicalEvidence<T>(values: readonly T[]): T[] { return [...values].sort((a, b) => compareText(canonicalSerialize(a), canonicalSerialize(b))); }
export function canonicalRefs<T extends ArtifactRef>(values: readonly T[]): T[] { return [...values].sort((a, b) => compareText(a.objectId, b.objectId)); }
