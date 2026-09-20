import { z } from "zod";
import { FrameRateSchema, IdSchema, ResolutionSchema, SecondsSchema, TimestampSchema, VersionLabelSchema, envelope } from "./common.js";

const renderFields = {
  ...envelope("RenderResult"),
  renderId: IdSchema,
  projectId: IdSchema,
  jobId: IdSchema,
  planId: IdSchema,
  planRevision: z.number().int().nonnegative(),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  renderer: IdSchema,
  rendererVersion: VersionLabelSchema,
  completedAt: TimestampSchema,
};
export const RenderResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...renderFields, kind: z.literal("dry_run"), status: z.literal("simulated"), plannedDurationSeconds: SecondsSchema, plannedClipCount: z.number().int().positive() }),
  z.strictObject({ ...renderFields, kind: z.literal("media"), status: z.literal("succeeded"), artifact: z.strictObject({ objectId: IdSchema, mimeType: z.literal("video/mp4") }) }),
  z.strictObject({ ...renderFields, kind: z.literal("failure"), status: z.literal("failed"), errorCode: IdSchema, retryable: z.boolean() }),
]);

export const QC_CHECKS = ["plan_digest", "timeline_duration", "non_zero_file", "duration", "frame_count", "codec", "resolution", "audio_present", "black_frames", "av_sync"] as const;
export const QCCheckNameSchema = z.enum(QC_CHECKS);
export const QCMeasurementSchema = z.discriminatedUnion("unit", [
  z.strictObject({ unit: z.literal("seconds"), value: SecondsSchema }),
  z.strictObject({ unit: z.literal("milliseconds"), value: z.number().finite() }),
  z.strictObject({ unit: z.literal("count"), value: z.number().int().nonnegative().safe() }),
  z.strictObject({ unit: z.literal("bytes"), value: z.number().int().nonnegative().safe() }),
  z.strictObject({ unit: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({ unit: z.literal("codec"), value: z.enum(["h264", "hevc", "av1", "unknown"]) }),
  z.strictObject({ unit: z.literal("resolution"), value: ResolutionSchema }),
  z.strictObject({ unit: z.literal("frame_rate"), value: FrameRateSchema }),
]);
export const QCResultSchema = z.strictObject({
  ...envelope("QCResult"),
  qcId: IdSchema,
  renderId: IdSchema,
  projectId: IdSchema,
  jobId: IdSchema,
  planId: IdSchema,
  planRevision: z.number().int().nonnegative(),
  mode: z.enum(["plan_only", "media"]),
  policyVersion: VersionLabelSchema,
  outcome: z.enum(["passed", "failed", "incomplete"]),
  deliveryAllowed: z.boolean(),
  checks: z.array(z.strictObject({
    name: QCCheckNameSchema,
    status: z.enum(["passed", "failed", "not_checked"]),
    expected: QCMeasurementSchema.nullable(),
    observed: QCMeasurementSchema.nullable(),
    reasonCode: IdSchema,
  })).length(QC_CHECKS.length),
  checkedAt: TimestampSchema,
}).superRefine((qc, ctx) => {
  if (new Set(qc.checks.map((check) => check.name)).size !== QC_CHECKS.length) ctx.addIssue({ code: "custom", path: ["checks"], message: "Each required QC check must appear exactly once." });
  const hasFailure = qc.checks.some((check) => check.status === "failed");
  const hasUnchecked = qc.checks.some((check) => check.status === "not_checked");
  const expectedOutcome = hasFailure ? "failed" : hasUnchecked ? "incomplete" : "passed";
  if (qc.outcome !== expectedOutcome) ctx.addIssue({ code: "custom", path: ["outcome"], message: "QC outcome must be derived from checks." });
  if (qc.deliveryAllowed !== (qc.mode === "media" && expectedOutcome === "passed")) ctx.addIssue({ code: "custom", path: ["deliveryAllowed"], message: "Delivery requires every media QC check to pass." });
  qc.checks.forEach((check, index) => {
    const units = { plan_digest: "boolean", timeline_duration: "seconds", non_zero_file: "bytes", duration: "seconds", frame_count: "count", codec: "codec", resolution: "resolution", audio_present: "boolean", black_frames: "seconds", av_sync: "milliseconds" } as const;
    if ((check.observed !== null && check.observed.unit !== units[check.name]) || (check.expected !== null && check.expected.unit !== units[check.name])) ctx.addIssue({ code: "custom", path: ["checks", index], message: "Measurement unit does not match the QC check." });
    if (check.status === "not_checked" && check.observed !== null) ctx.addIssue({ code: "custom", path: ["checks", index, "observed"], message: "Unchecked tests cannot claim observations." });
    if (check.status === "passed" && check.observed === null) ctx.addIssue({ code: "custom", path: ["checks", index, "observed"], message: "Passing checks require observations." });
    if (check.status === "passed" && check.expected === null) ctx.addIssue({ code: "custom", path: ["checks", index, "expected"], message: "Passing checks require an expected value or policy threshold." });
    if (check.observed !== null && check.expected !== null && check.observed.unit !== check.expected.unit) ctx.addIssue({ code: "custom", path: ["checks", index], message: "QC measurement units must match." });
    if (qc.mode === "plan_only" && !["plan_digest", "timeline_duration"].includes(check.name) && check.status !== "not_checked") ctx.addIssue({ code: "custom", path: ["checks", index], message: "Plan-only QC cannot claim media checks." });
  });
});
