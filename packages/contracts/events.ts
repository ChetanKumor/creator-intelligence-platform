import { z } from "zod";
import { ConfidenceSchema, IdSchema, LanguageSchema, TimeRangeSchema, TimestampSchema, TransitionSchema, VersionLabelSchema, envelope } from "./common.js";

export const EventScopeSchema = z.strictObject({
  projectId: IdSchema,
  jobId: IdSchema,
  creatorId: IdSchema,
  environment: z.enum(["synthetic", "production"]),
});
const eventFields = { eventId: IdSchema, scope: EventScopeSchema, occurredAt: TimestampSchema };

// Learning payloads contain IDs and bounded features, never media bytes or caption/prompt text.
export const FeatureSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("numeric"), name: IdSchema, value: z.number().finite() }),
  z.strictObject({ kind: z.literal("category"), name: IdSchema, value: IdSchema }),
  z.strictObject({ kind: z.literal("boolean"), name: IdSchema, value: z.boolean() }),
]);
export const DecisionValueSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("clip_segment"), segmentId: IdSchema }),
  z.strictObject({ kind: z.literal("transition"), transition: TransitionSchema }),
  z.strictObject({ kind: z.literal("speed"), speed: z.number().min(0.25).max(4) }),
  z.strictObject({ kind: z.literal("trim"), segmentId: IdSchema, sourceRange: TimeRangeSchema }),
  z.strictObject({ kind: z.literal("caption"), captionId: IdSchema, contentRevisionId: IdSchema, language: LanguageSchema, style: z.enum(["clean", "emphasis"]) }),
]);
const DecisionKindSchema = z.enum(["clip_selection", "transition_selection", "speed_selection", "trim_selection", "caption_selection"]);
const valueKindForDecision = {
  clip_selection: "clip_segment", transition_selection: "transition", speed_selection: "speed", trim_selection: "trim", caption_selection: "caption",
} as const;

export const DecisionEventSchema = z.strictObject({
  ...envelope("DecisionEvent"), ...eventFields,
  decisionId: IdSchema,
  decisionKind: DecisionKindSchema,
  context: z.strictObject({
    planId: IdSchema,
    revision: z.number().int().nonnegative(),
    slotId: IdSchema,
    referenceFingerprintId: IdSchema.nullable(),
    audioFingerprintId: IdSchema.nullable(),
    creatorMemoryRevision: IdSchema.nullable(),
    featureSetVersion: VersionLabelSchema,
    features: z.array(FeatureSchema).max(64),
  }),
  candidates: z.array(z.strictObject({
    candidateId: IdSchema,
    value: DecisionValueSchema,
    features: z.array(FeatureSchema).max(64),
    score: z.number().finite(),
  })).min(1).max(256),
  winnerCandidateId: IdSchema,
  confidence: ConfidenceSchema,
  policy: z.strictObject({ kind: z.enum(["rule", "model", "human"]), name: IdSchema, version: VersionLabelSchema }),
  modelRunIds: z.array(IdSchema).max(32),
}).superRefine((event, ctx) => {
  const ids = event.candidates.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["candidates"], message: "Candidate IDs must be unique." });
  if (!ids.includes(event.winnerCandidateId)) ctx.addIssue({ code: "custom", path: ["winnerCandidateId"], message: "Winner must be a recorded candidate." });
  event.candidates.forEach((candidate, index) => {
    if (candidate.value.kind !== valueKindForDecision[event.decisionKind]) ctx.addIssue({ code: "custom", path: ["candidates", index, "value"], message: "Candidate value does not match the decision kind." });
    if (new Set(candidate.features.map((feature) => feature.name)).size !== candidate.features.length) ctx.addIssue({ code: "custom", path: ["candidates", index, "features"], message: "Feature names must be unique." });
  });
  if (new Set(event.context.features.map((feature) => feature.name)).size !== event.context.features.length) ctx.addIssue({ code: "custom", path: ["context", "features"], message: "Feature names must be unique." });
});

export const FeedbackActionSchema = z.enum(["accepted", "rejected", "replaced", "regenerated", "trimmed", "transition_changed", "speed_changed", "caption_changed", "downloaded"]);
export const FeedbackEventSchema = z.strictObject({
  ...envelope("FeedbackEvent"), ...eventFields,
  action: FeedbackActionSchema,
  planId: IdSchema,
  revision: z.number().int().nonnegative(),
  renderId: IdSchema.nullable(),
  decisionId: IdSchema.nullable(),
  oldValue: DecisionValueSchema.nullable(),
  newValue: DecisionValueSchema.nullable(),
  interventionMilliseconds: z.number().int().nonnegative().safe().nullable(),
}).superRefine((event, ctx) => {
  const expected = {
    replaced: "clip_segment", trimmed: "trim", transition_changed: "transition", speed_changed: "speed", caption_changed: "caption",
  } as const;
  if (event.action in expected) {
    const kind = expected[event.action as keyof typeof expected];
    if (event.decisionId === null || event.oldValue?.kind !== kind || event.newValue?.kind !== kind) {
      ctx.addIssue({ code: "custom", path: ["newValue"], message: "Corrections require a decision ID and old/new values matching the action." });
    }
    if (event.oldValue?.kind === "clip_segment" && event.newValue?.kind === "clip_segment" && event.oldValue.segmentId === event.newValue.segmentId) {
      ctx.addIssue({ code: "custom", path: ["newValue"], message: "Replacement must select a different segment." });
    }
  } else if (event.oldValue !== null || event.newValue !== null) {
    ctx.addIssue({ code: "custom", path: ["oldValue"], message: "Outcome feedback does not carry correction values." });
  }
  if (["accepted", "downloaded"].includes(event.action) && event.renderId === null) {
    ctx.addIssue({ code: "custom", path: ["renderId"], message: "Accepted/downloaded feedback must identify a render." });
  }
});

export const OperationSchema = z.enum(["reference_analysis", "footage_analysis", "audio_analysis", "embedding", "speech", "matching", "planning", "rendering", "qc", "storage"]);
export const CostEventSchema = z.strictObject({
  ...envelope("CostEvent"), ...eventFields,
  operationId: IdSchema,
  attempt: z.number().int().positive(),
  provider: IdSchema,
  tool: IdSchema,
  model: IdSchema.nullable(),
  modelRunId: IdSchema.nullable(),
  operation: OperationSchema,
  durationMilliseconds: z.number().int().nonnegative().safe(),
  units: z.array(z.strictObject({ unit: z.enum(["input_tokens", "output_tokens", "frames", "audio_seconds", "video_seconds", "cpu_seconds", "gpu_seconds", "bytes", "operations"]), quantity: z.number().finite().nonnegative() })).min(1).max(16),
  costInrMicros: z.number().int().nonnegative().safe(),
  costSource: z.enum(["measured", "estimated", "synthetic"]),
}).superRefine((event, ctx) => {
  if (new Set(event.units.map((unit) => unit.unit)).size !== event.units.length) ctx.addIssue({ code: "custom", path: ["units"], message: "Unit types must be unique per operation." });
  if ((event.scope.environment === "synthetic") !== (event.costSource === "synthetic")) ctx.addIssue({ code: "custom", path: ["costSource"], message: "Synthetic costs must be isolated from production costs." });
});

export const ModelRunSchema = z.strictObject({
  ...envelope("ModelRun"),
  runId: IdSchema,
  scope: EventScopeSchema,
  provider: IdSchema,
  model: IdSchema,
  modelVersion: VersionLabelSchema,
  adapterVersion: VersionLabelSchema,
  operation: OperationSchema,
  inputIds: z.array(IdSchema).max(256),
  outputIds: z.array(IdSchema).max(256),
  startedAt: TimestampSchema,
  endedAt: TimestampSchema,
  status: z.enum(["succeeded", "failed"]),
  errorCode: IdSchema.nullable(),
}).superRefine((run, ctx) => {
  if (run.endedAt < run.startedAt) ctx.addIssue({ code: "custom", path: ["endedAt"], message: "Run must end after it starts." });
  if ((run.status === "failed") !== (run.errorCode !== null)) ctx.addIssue({ code: "custom", path: ["errorCode"], message: "Failed runs require a sanitized error code; successful runs have none." });
});

export const CreatorPreferenceEventSchema = z.strictObject({
  ...envelope("CreatorPreferenceEvent"), ...eventFields,
  preferenceId: IdSchema,
  basisFeedbackEventIds: z.array(IdSchema).min(1).max(256),
  signal: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("pairwise_clip"), preferredSegmentId: IdSchema, disfavoredSegmentId: IdSchema, contextDecisionId: IdSchema }),
    z.strictObject({ kind: z.literal("transition_affinity"), transition: TransitionSchema, direction: z.enum(["positive", "negative"]) }),
    z.strictObject({ kind: z.literal("caption_language"), language: LanguageSchema }),
    z.strictObject({ kind: z.literal("pacing"), preference: z.enum(["faster", "slower"]) }),
  ]),
  evidenceStrength: z.enum(["explicit_correction", "implicit_outcome"]),
  derivationVersion: VersionLabelSchema,
}).superRefine((event, ctx) => {
  if (new Set(event.basisFeedbackEventIds).size !== event.basisFeedbackEventIds.length) ctx.addIssue({ code: "custom", path: ["basisFeedbackEventIds"], message: "Evidence IDs must be unique." });
  if (event.signal.kind === "pairwise_clip" && event.signal.preferredSegmentId === event.signal.disfavoredSegmentId) ctx.addIssue({ code: "custom", path: ["signal"], message: "Pairwise preference requires distinct segments." });
});
