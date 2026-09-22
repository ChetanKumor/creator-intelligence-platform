import { z } from "zod";
import { IdSchema, SecondsSchema, TimeRangeSchema, TimestampSchema, VersionLabelSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import {
  ArtifactRefSchema,
  EvidenceRefSchema,
  availability,
  compareText,
  equal,
  type ArtifactRef,
} from "../editorial/common.js";
import { contentId } from "../reference-analyzer/features.js";
import { HashSchema } from "../reference-analyzer/protocol.js";

export const PERCEPTION_VERSION = "0.1.0" as const;
export const COMPUTATION_IDENTITY_VERSION = "perception-computation-1.0.0" as const;
export const ComputationKeySchema = z.string().regex(/^perception_computation_v1_[a-f0-9]{64}$/);

const applicable = <T extends z.ZodType>(schema: T) => availability(schema).refine(
  (value) => value.state === "present" || value.state === "not_applicable",
  "Optional semantic identity must be present or explicitly not_applicable.",
);

const SourceSupportSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("whole_source") }),
  z.strictObject({ kind: z.literal("range"), range: TimeRangeSchema, timebase: ArtifactRefSchema }),
  z.strictObject({
    kind: z.literal("frame"),
    sampleId: IdSchema,
    frameIndex: z.number().int().nonnegative().safe(),
    atSeconds: SecondsSchema,
    frameHash: HashSchema,
    timebase: ArtifactRefSchema,
  }),
  z.strictObject({
    kind: z.literal("sample"),
    sampleId: IdSchema,
    atSeconds: SecondsSchema,
    sampleHash: HashSchema,
    timebase: ArtifactRefSchema,
  }),
]);

export const OrderedInputIdentitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("source"),
    assetId: IdSchema,
    contentHash: HashSchema,
    sizeBytes: z.number().int().positive().safe(),
    support: SourceSupportSchema,
  }),
  z.strictObject({ kind: z.literal("artifact"), role: IdSchema, artifact: ArtifactRefSchema }),
]);

const AdapterIdentitySchema = z.strictObject({ adapterId: IdSchema, adapterVersion: VersionLabelSchema });
const ModelIdentitySchema = z.strictObject({
  modelId: IdSchema,
  providerId: IdSchema,
  exactRevision: z.string().min(1).max(160).refine(
    (value) => !["latest", "main", "master", "head", "current"].includes(value.toLowerCase()),
    "Model revision must be immutable and exact.",
  ),
  revisionEvidence: ArtifactRefSchema,
});
const PreprocessingIdentitySchema = z.strictObject({ version: VersionLabelSchema, configurationDigest: HashSchema });
const SemanticSpaceIdentitySchema = z.strictObject({ spaceId: IdSchema, spaceVersion: VersionLabelSchema });

/** Semantic compatibility only. Job/attempt IDs, clocks, paths, hostnames and duration
 * belong to attempt evidence. Settings that can change output compatibility are bound
 * through exact digests or immutable EvidenceRef artifacts below.
 */
export const ComputationIdentitySchema = z.strictObject({
  identityVersion: z.literal(COMPUTATION_IDENTITY_VERSION),
  operationKind: IdSchema,
  computationClass: z.enum(["deterministic_tool", "learned_model"]),
  inputs: z.array(OrderedInputIdentitySchema).min(1).max(4096),
  producer: z.strictObject({
    producerId: IdSchema,
    implementationVersion: VersionLabelSchema,
    implementationDigest: HashSchema,
    adapter: applicable(AdapterIdentitySchema),
  }),
  model: applicable(ModelIdentitySchema),
  preprocessing: applicable(PreprocessingIdentitySchema),
  configurationDigest: HashSchema,
  semanticExecutionSettings: EvidenceRefSchema,
  outputSchema: z.strictObject({
    artifactType: VersionLabelSchema,
    artifactVersion: VersionLabelSchema,
    semanticSpace: applicable(SemanticSpaceIdentitySchema),
  }),
  determinism: z.strictObject({
    kind: z.enum(["deterministic", "seeded", "stochastic"]),
    policy: EvidenceRefSchema,
  }),
}).superRefine((identity, ctx) => {
  if (identity.computationClass === "learned_model" && identity.model.state !== "present") {
    ctx.addIssue({ code: "custom", path: ["model"], message: "Learned computations require exact model revision evidence." });
  }
  if (identity.computationClass === "deterministic_tool" && identity.model.state !== "not_applicable") {
    ctx.addIssue({ code: "custom", path: ["model"], message: "Model-free deterministic tools require explicit not_applicable model identity." });
  }
  if (identity.computationClass === "deterministic_tool" && identity.determinism.kind !== "deterministic") {
    ctx.addIssue({ code: "custom", path: ["determinism", "kind"], message: "Deterministic tools require deterministic policy." });
  }
});
export type ComputationIdentity = z.infer<typeof ComputationIdentitySchema>;

export function computationKey(input: ComputationIdentity): string {
  return contentId("perception_computation_v1", ComputationIdentitySchema.parse(input));
}

function pushUnique(target: Map<string, ArtifactRef>, input: ArtifactRef): void {
  const ref = ArtifactRefSchema.parse(input);
  const previous = target.get(ref.objectId);
  if (previous !== undefined && !equal(previous, ref)) throw new Error("Conflicting computation dependency object ID.");
  target.set(ref.objectId, ref);
}

export function computationDependencies(input: ComputationIdentity): ArtifactRef[] {
  const identity = ComputationIdentitySchema.parse(input);
  const dependencies = new Map<string, ArtifactRef>();
  for (const item of identity.inputs) {
    if (item.kind === "artifact") pushUnique(dependencies, item.artifact);
    else if (item.support.kind !== "whole_source") pushUnique(dependencies, item.support.timebase);
  }
  if (identity.model.state === "present") pushUnique(dependencies, identity.model.value.revisionEvidence);
  pushUnique(dependencies, identity.semanticExecutionSettings.artifact);
  pushUnique(dependencies, identity.determinism.policy.artifact);
  return [...dependencies.values()].sort((left, right) => compareText(left.objectId, right.objectId));
}

const envelope = <T extends string>(artifactType: T) => ({
  artifactType: z.literal(artifactType),
  artifactVersion: z.literal(PERCEPTION_VERSION),
  stability: z.literal("internal_pre_stable"),
});

export const PerceptionAttemptSchema = z.strictObject({
  ...envelope("PerceptionAttempt"),
  attemptId: IdSchema,
  computationKey: ComputationKeySchema,
  startedAt: TimestampSchema,
  endedAt: TimestampSchema,
  outcome: z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("succeeded"), output: ArtifactRefSchema }),
    z.strictObject({ state: z.literal("failed"), failure: EvidenceRefSchema }),
  ]),
}).refine((attempt) => attempt.endedAt >= attempt.startedAt, { path: ["endedAt"], message: "Attempt cannot end before it starts." });
export type PerceptionAttempt = z.infer<typeof PerceptionAttemptSchema>;

export const PerceptionOutputSelectionSchema = z.strictObject({
  ...envelope("PerceptionOutputSelection"),
  selectionId: IdSchema,
  computationKey: ComputationKeySchema,
  selectedAttempt: ArtifactRefSchema,
  selectedOutput: ArtifactRefSchema,
  policyVersion: VersionLabelSchema,
  evidence: EvidenceRefSchema,
});
export type PerceptionOutputSelection = z.infer<typeof PerceptionOutputSelectionSchema>;

const sortedUniqueRefs = z.array(ArtifactRefSchema).max(4096)
  .refine((refs) => new Set(refs.map((ref) => ref.objectId)).size === refs.length, "Duplicate artifact object IDs.")
  .refine((refs) => refs.every((ref, index) => index === 0 || compareText(refs[index - 1]!.objectId, ref.objectId) < 0), "Artifact references must use canonical object-ID order.");
const uniqueAttemptRefs = z.array(ArtifactRefSchema).max(4096)
  .refine((refs) => new Set(refs.map((ref) => ref.objectId)).size === refs.length, "Duplicate attempt artifact object IDs.");
const PurposeSetSchema = z.array(IdSchema).min(1).max(32)
  .refine((values) => new Set(values).size === values.length, "Duplicate purposes.")
  .refine((values) => values.every((value, index) => index === 0 || compareText(values[index - 1]!, value) < 0), "Purposes must use canonical order.");

export const PerceptionArtifactEntrySchema = z.strictObject({
  ...envelope("PerceptionArtifactEntry"),
  computationKey: ComputationKeySchema,
  identity: ComputationIdentitySchema,
  accepted: availability(z.strictObject({
    output: ArtifactRefSchema,
    attempt: ArtifactRefSchema,
    selection: ArtifactRefSchema,
  })),
  dependencies: sortedUniqueRefs,
  attemptRefs: uniqueAttemptRefs,
  producerLifecycle: z.strictObject({
    producerId: IdSchema,
    producerVersion: VersionLabelSchema,
    state: z.enum(["active", "stale", "retired"]),
    evidence: ArtifactRefSchema,
  }),
  accessBindings: z.array(z.strictObject({
    projectId: IdSchema,
    creatorId: IdSchema,
    purposes: PurposeSetSchema,
    state: z.enum(["eligible", "revoked", "expired"]),
    evidence: ArtifactRefSchema,
  })).min(1).max(256).refine(
    (bindings) => new Set(bindings.map((binding) => canonicalSerialize([binding.projectId, binding.creatorId, binding.purposes]))).size === bindings.length,
    "Duplicate access bindings.",
  ),
}).superRefine((entry, ctx) => {
  if (entry.computationKey !== computationKey(entry.identity)) {
    ctx.addIssue({ code: "custom", path: ["computationKey"], message: "Computation key does not match canonical identity." });
  }
  try {
    if (!equal(entry.dependencies, computationDependencies(entry.identity))) {
      ctx.addIssue({ code: "custom", path: ["dependencies"], message: "Dependency manifest does not match computation identity." });
    }
  } catch {
    ctx.addIssue({ code: "custom", path: ["dependencies"], message: "Computation identity contains conflicting dependency references." });
  }
  if (entry.producerLifecycle.producerId !== entry.identity.producer.producerId || entry.producerLifecycle.producerVersion !== entry.identity.producer.implementationVersion) {
    ctx.addIssue({ code: "custom", path: ["producerLifecycle"], message: "Producer lifecycle does not bind the computation producer." });
  }
  for (const [index, ref] of entry.attemptRefs.entries()) {
    if (ref.artifactType !== "PerceptionAttempt" || ref.artifactVersion !== PERCEPTION_VERSION) {
      ctx.addIssue({ code: "custom", path: ["attemptRefs", index], message: "Expected a PerceptionAttempt reference." });
    }
  }
  if (entry.accepted.state === "present") {
    const accepted = entry.accepted.value;
    if (accepted.output.artifactType !== entry.identity.outputSchema.artifactType || accepted.output.artifactVersion !== entry.identity.outputSchema.artifactVersion) {
      ctx.addIssue({ code: "custom", path: ["accepted", "value", "output"], message: "Accepted output schema is incompatible with the computation identity." });
    }
    if (accepted.attempt.artifactType !== "PerceptionAttempt" || accepted.attempt.artifactVersion !== PERCEPTION_VERSION || !entry.attemptRefs.some((ref) => equal(ref, accepted.attempt))) {
      ctx.addIssue({ code: "custom", path: ["accepted", "value", "attempt"], message: "Accepted attempt must be in the immutable attempt lineage." });
    }
    if (accepted.selection.artifactType !== "PerceptionOutputSelection" || accepted.selection.artifactVersion !== PERCEPTION_VERSION) {
      ctx.addIssue({ code: "custom", path: ["accepted", "value", "selection"], message: "Accepted output requires an explicit selection reference." });
    }
  }
});
export type PerceptionArtifactEntry = z.infer<typeof PerceptionArtifactEntrySchema>;

export const PerceptionAccessRequestSchema = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, purpose: IdSchema });
export type PerceptionAccessRequest = z.infer<typeof PerceptionAccessRequestSchema>;

export const PerceptionReuseReceiptSchema = z.strictObject({
  receiptType: z.literal("PerceptionReuseReceipt"),
  receiptVersion: z.literal(PERCEPTION_VERSION),
  computationKey: ComputationKeySchema,
  output: ArtifactRefSchema,
  selectedAttempt: ArtifactRefSchema,
  selection: ArtifactRefSchema,
  scope: PerceptionAccessRequestSchema,
  reuseStatus: z.literal("reused"),
  modelRunCreated: z.literal(false),
});
export type PerceptionReuseReceipt = z.infer<typeof PerceptionReuseReceiptSchema>;
