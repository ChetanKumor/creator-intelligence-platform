import { z } from "zod";
import { EmbeddingReferenceSchema, IdSchema, SecondsSchema, TimeRangeSchema } from "../contracts/common.js";
import { CandidateSchema, NumericSignalsSchema } from "../footage-analyzer/protocol.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { ArtifactRefSchema, EvidenceRefSchema, MissingSchema, ProducerSchema, availability, checkIdentity, compareText, editorialEnvelope, feature, identify, unique } from "./common.js";

const RatioSchema = z.number().finite().min(0).max(1);
export const CheapSignalNameSchema = NumericSignalsSchema.keyof();
export type CheapSignalName = z.infer<typeof CheapSignalNameSchema>;
export const TemporalContextSchema = z.strictObject({
  sourceDurationSeconds: z.number().finite().positive(), shotRange: TimeRangeSchema,
  sourcePosition: z.strictObject({ startFraction: RatioSchema, endFraction: RatioSchema }),
  shotPosition: TimeRangeSchema, previousShot: availability(EvidenceRefSchema), nextShot: availability(EvidenceRefSchema),
});
export const LocalitySchema = z.strictObject({
  support: z.enum(["within_segment", "same_shot_context"]),
  supports: z.array(z.strictObject({ semanticFrameId: IdSchema, distanceToIntervalSeconds: SecondsSchema })).min(1).max(256)
    .refine((s) => unique(s.map((v) => v.semanticFrameId)), "Duplicate semantic support IDs."),
  nearestEvidenceDistanceSeconds: SecondsSchema,
  distancePolicy: z.literal("interval-distance-half-open-membership-v1"),
}).superRefine((v, ctx) => {
  if (Math.abs(Math.min(...v.supports.map((s) => s.distanceToIntervalSeconds)) - v.nearestEvidenceDistanceSeconds) > 1e-6) ctx.addIssue({ code: "custom", message: "Nearest support distance mismatch." });
  if (v.support === "within_segment" && v.supports.some((s) => s.distanceToIntervalSeconds !== 0)) ctx.addIssue({ code: "custom", message: "Inside support requires zero distances." });
  if (v.support === "same_shot_context" && v.supports.length !== 1) ctx.addIssue({ code: "custom", message: "Borrowed support requires one nearest frame." });
});
export const SemanticChannelSchema = z.strictObject({
  embedding: EmbeddingReferenceSchema, modelConfiguration: EvidenceRefSchema,
  aggregationId: IdSchema, aggregationVersion: z.literal("footage-evidence-v1"), locality: LocalitySchema,
});
export const CheapChannelSchema = z.strictObject({
  signals: EvidenceRefSchema, contributions: EvidenceRefSchema, support: z.enum(["within_segment", "same_shot_context"]),
  missingSignals: z.array(z.strictObject({ signal: CheapSignalNameSchema, ...MissingSchema.shape })).max(9)
    .refine((signals) => unique(signals.map((v) => v.signal)), "Duplicate missing signal IDs.")
    .refine((signals) => signals.every((s) => s.state !== "failed" || s.evidenceRefs.length > 0), "Failed signals require error evidence.")
    .transform((signals) => [...signals].sort((a, b) => compareText(a.signal, b.signal))),
});
// Frozen future slots accept missingness only; no future producer or payload is executed.
const DeferredFeatureSchema = z.strictObject({ provenance: ProducerSchema, data: MissingSchema });
export const FutureChannelsSchema = z.strictObject({
  temporalMotion: DeferredFeatureSchema, qualityAesthetic: DeferredFeatureSchema,
  speechAudio: DeferredFeatureSchema, music: DeferredFeatureSchema, referenceStyle: DeferredFeatureSchema,
});
export const EditorialTokenBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialToken"), projectId: IdSchema, sourceHash: HashSchema, candidate: CandidateSchema,
  analysis: z.strictObject({ analysisId: IdSchema, configurationId: IdSchema, artifact: ArtifactRefSchema }),
  producingRun: z.strictObject({ jobId: IdSchema, artifact: ArtifactRefSchema }),
  candidateEvidence: EvidenceRefSchema, clipSegment: availability(EvidenceRefSchema),
  temporal: feature(TemporalContextSchema), semantic: feature(SemanticChannelSchema), cheap: feature(CheapChannelSchema), future: FutureChannelsSchema,
});
export const EditorialTokenSchema = EditorialTokenBodySchema.extend({ tokenId: IdSchema }).superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!checkIdentity(v, "tokenId", "editorial_token")) fail("Token identity mismatch.");
  if (v.candidate.assetId !== `asset_${v.sourceHash}`) fail("Candidate asset/source hash mismatch.");
  if (v.analysis.artifact.artifactType !== "FootageAnalysis" || v.analysis.artifact.artifactVersion !== "1.0.0") fail("Expected exact FootageAnalysis reference.");
  if (v.producingRun.artifact.artifactType !== "FootageRun" || v.producingRun.artifact.artifactVersion !== "legacy-unversioned") fail("Expected explicit legacy FootageRun descriptor.");
  if (v.temporal.data.state === "present") {
    const t = v.temporal.data.value, r = v.candidate.sourceRange;
    if (r.startSeconds < t.shotRange.startSeconds || r.endSeconds > t.shotRange.endSeconds || t.shotRange.endSeconds > t.sourceDurationSeconds) fail("Candidate temporal bounds conflict.");
    const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
    if (!near(t.sourcePosition.startFraction, r.startSeconds / t.sourceDurationSeconds) || !near(t.sourcePosition.endFraction, r.endSeconds / t.sourceDurationSeconds) || !near(t.shotPosition.startSeconds, r.startSeconds - t.shotRange.startSeconds) || !near(t.shotPosition.endSeconds, r.endSeconds - t.shotRange.startSeconds)) fail("Temporal projections disagree with source PTS.");
  }
});
export type EditorialToken = z.infer<typeof EditorialTokenSchema>;
export type Locality = z.infer<typeof LocalitySchema>;
export function createEditorialToken(input: z.input<typeof EditorialTokenBodySchema>): EditorialToken {
  return EditorialTokenSchema.parse(identify("editorial_token", "tokenId", EditorialTokenBodySchema.parse(input)));
}
export function temporalGetters(tokenInput: EditorialToken) {
  const token = EditorialTokenSchema.parse(tokenInput);
  const durationSeconds = token.candidate.sourceRange.endSeconds - token.candidate.sourceRange.startSeconds;
  if (token.temporal.data.state !== "present") return { durationSeconds, temporal: token.temporal.data };
  const t = token.temporal.data.value, shotDurationSeconds = t.shotRange.endSeconds - t.shotRange.startSeconds;
  return { durationSeconds, temporal: { state: "present" as const, value: { shotDurationSeconds, shotStartFraction: t.shotPosition.startSeconds / shotDurationSeconds, shotEndFraction: t.shotPosition.endSeconds / shotDurationSeconds } } };
}

// No vector storage or implicit retrieval. A later scorer must explicitly supply a resolver.
export interface EditorialVectorResolver {
  resolve(reference: z.infer<typeof EmbeddingReferenceSchema>): Promise<import("./common.js").Availability<readonly number[]>>;
}
