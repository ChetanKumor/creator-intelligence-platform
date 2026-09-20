import { z } from "zod";
import { AspectRatioSchema, CompositionSchema, ConfidenceSchema, EmbeddingReferenceSchema, FrameRateSchema, IdSchema, MotionSchema, ProvenanceSchema, QualitySchema, RoleSchema, TimeRangeSchema, TransitionSchema, envelope } from "./common.js";

const SemanticFeaturesSchema = z.strictObject({
  description: z.string().max(1000),
  tags: z.array(IdSchema).max(32),
});
const ShotAnnotationsSchema = {
  shotType: z.enum(["close_up", "medium", "wide", "detail", "aerial", "unknown"]),
  subjectCount: z.number().int().nonnegative().max(1000).nullable(),
  motion: MotionSchema,
  composition: CompositionSchema,
  quality: QualitySchema,
  semantics: SemanticFeaturesSchema,
};

export const ReferenceFingerprintSchema = z.strictObject({
  ...envelope("ReferenceFingerprint"),
  fingerprintId: IdSchema,
  assetId: IdSchema,
  durationSeconds: z.number().positive().max(600),
  fps: FrameRateSchema,
  aspectRatio: AspectRatioSchema,
  shots: z.array(z.strictObject({
    shotId: IdSchema,
    sourceRange: TimeRangeSchema,
    role: RoleSchema,
    ...ShotAnnotationsSchema,
    transitionOut: TransitionSchema,
  })).min(1).max(1000),
  structure: z.array(z.strictObject({ role: RoleSchema, range: TimeRangeSchema })).max(100),
  pacing: z.strictObject({
    averageShotLengthSeconds: z.number().positive(),
    shotsPerSecond: z.number().positive(),
    trend: z.enum(["accelerating", "steady", "decelerating", "mixed", "unknown"]),
  }),
  audioFingerprintId: IdSchema.nullable(),
  captions: z.strictObject({
    density: z.enum(["none", "sparse", "moderate", "dense", "unknown"]),
    position: z.enum(["upper", "middle", "lower", "mixed", "unknown"]),
    styleHint: z.enum(["clean", "emphasis", "unknown"]),
  }),
  style: z.strictObject({
    family: IdSchema.nullable(),
    category: z.enum(["fashion", "lifestyle", "gym", "dance", "travel", "college", "talking_head", "ad", "product", "brand", "other", "unknown"]),
    energy: ConfidenceSchema.nullable(),
  }),
  provenance: ProvenanceSchema,
}).superRefine((reference, ctx) => {
  const seen = new Set<string>();
  reference.shots.forEach((shot, index) => {
    const previousEnd = reference.shots[index - 1]?.sourceRange.endSeconds ?? 0;
    if (seen.has(shot.shotId)) ctx.addIssue({ code: "custom", path: ["shots", index, "shotId"], message: "Duplicate shot ID." });
    seen.add(shot.shotId);
    if (Math.abs(shot.sourceRange.startSeconds - previousEnd) > 0.000001 || shot.sourceRange.endSeconds > reference.durationSeconds) {
      ctx.addIssue({ code: "custom", path: ["shots", index, "sourceRange"], message: "Reference shots must partition the full reference without gaps or overlaps." });
    }
  });
  if (Math.abs((reference.shots.at(-1)?.sourceRange.endSeconds ?? 0) - reference.durationSeconds) > 0.000001) {
    ctx.addIssue({ code: "custom", path: ["shots"], message: "Shots must end at reference duration." });
  }
  reference.structure.forEach((section, index) => {
    if (section.range.endSeconds > reference.durationSeconds || (index > 0 && section.range.startSeconds < (reference.structure[index - 1]?.range.endSeconds ?? 0))) {
      ctx.addIssue({ code: "custom", path: ["structure", index], message: "Structural sections must be ordered, non-overlapping, and inside the reference." });
    }
  });
  if (Math.abs(reference.pacing.averageShotLengthSeconds - reference.durationSeconds / reference.shots.length) > 0.000001 ||
      Math.abs(reference.pacing.shotsPerSecond - reference.shots.length / reference.durationSeconds) > 0.000001) {
    ctx.addIssue({ code: "custom", path: ["pacing"], message: "Pacing summaries must agree with the shot partition." });
  }
});

export const ClipSegmentSchema = z.strictObject({
  ...envelope("ClipSegment"),
  segmentId: IdSchema,
  assetId: IdSchema,
  sourceRange: TimeRangeSchema,
  ...ShotAnnotationsSchema,
  facePresence: z.enum(["present", "absent", "unknown"]),
  personPresence: z.enum(["present", "absent", "unknown"]),
  poseTags: z.array(z.enum(["standing", "seated", "hands_raised", "walking", "unknown"])).max(5),
  semanticEmbedding: EmbeddingReferenceSchema.nullable(),
  motionEmbedding: EmbeddingReferenceSchema.nullable(),
  provenance: ProvenanceSchema,
});
