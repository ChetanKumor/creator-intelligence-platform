import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;
export const TIME_EPSILON_SECONDS = 0.000001;
export const IdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/);
export const VersionLabelSchema = z.string().min(1).max(80);
export const TimestampSchema = z.iso.datetime({ precision: 3 });
export const SecondsSchema = z.number().finite().nonnegative();
export const ConfidenceSchema = z.number().finite().min(0).max(1);
export const LanguageSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
export const RoleSchema = z.enum(["hook", "setup", "build", "reveal", "hero", "outro", "supporting"]);

export function envelope<const T extends string>(contractType: T) {
  return { contractType: z.literal(contractType), schemaVersion: z.literal(CONTRACT_VERSION) };
}

export const TimeRangeSchema = z.strictObject({
  startSeconds: SecondsSchema,
  endSeconds: SecondsSchema,
}).superRefine((range, ctx) => {
  if (range.endSeconds <= range.startSeconds) {
    ctx.addIssue({ code: "custom", path: ["endSeconds"], message: "End must be after start." });
  }
});

export const FrameRateSchema = z.strictObject({
  numerator: z.number().int().positive().max(120000),
  denominator: z.number().int().positive().max(1001),
}).refine((fps) => fps.numerator / fps.denominator >= 1 && fps.numerator / fps.denominator <= 120, "Frame rate must be between 1 and 120 fps.");

export const ResolutionSchema = z.strictObject({
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
});
export const AspectRatioSchema = z.strictObject({
  width: z.number().int().positive().max(10000),
  height: z.number().int().positive().max(10000),
});
export const TransitionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("cut") }),
  z.strictObject({ type: z.literal("dissolve"), durationSeconds: z.number().positive().max(2) }),
]);
export const MotionSchema = z.strictObject({
  camera: z.enum(["static", "pan", "tilt", "tracking", "handheld", "zoom", "unknown"]),
  subject: z.enum(["still", "low", "medium", "high", "unknown"]),
});
export const CompositionSchema = z.strictObject({
  framing: z.enum(["close_up", "medium", "wide", "detail", "unknown"]),
  subjectPosition: z.enum(["left", "center", "right", "unknown"]),
});
export const QualitySchema = z.strictObject({
  sharpness: ConfidenceSchema.nullable(),
  exposure: ConfidenceSchema.nullable(),
  stability: ConfidenceSchema.nullable(),
});
export const EmbeddingReferenceSchema = z.strictObject({
  embeddingId: IdSchema,
  spaceId: IdSchema,
  spaceVersion: VersionLabelSchema,
  dimensions: z.number().int().positive().max(65536),
  distance: z.enum(["cosine", "euclidean", "dot"]),
  objectId: IdSchema,
});
export const ProvenanceSchema = z.strictObject({
  producer: IdSchema,
  producerVersion: VersionLabelSchema,
  modelRunIds: z.array(IdSchema).max(32),
  createdAt: TimestampSchema,
});
export const EnergyPointSchema = z.strictObject({ atSeconds: SecondsSchema, energy: ConfidenceSchema });

export function checkTimestamps(values: readonly number[], duration: number, ctx: z.RefinementCtx, path: string) {
  values.forEach((value, index) => {
    if (value > duration || (index > 0 && value <= (values[index - 1] ?? 0))) {
      ctx.addIssue({ code: "custom", path: [path, index], message: "Timestamps must increase strictly and stay within duration." });
    }
  });
}

export const MediaAssetSchema = z.strictObject({
  ...envelope("MediaAsset"),
  assetId: IdSchema,
  projectId: IdSchema,
  creatorId: IdSchema,
  kind: z.enum(["video", "audio"]),
  objectId: IdSchema,
  durationSeconds: z.number().positive().max(86400),
  origin: z.enum(["creator_upload", "synthetic"]),
  retention: z.strictObject({ expiresAt: TimestampSchema.nullable(), deletionRequestedAt: TimestampSchema.nullable() }),
});
