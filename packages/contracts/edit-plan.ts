import { z } from "zod";
import { ConfidenceSchema, FrameRateSchema, IdSchema, LanguageSchema, ResolutionSchema, RoleSchema, SecondsSchema, TIME_EPSILON_SECONDS, TimeRangeSchema, TimestampSchema, TransitionSchema, VersionLabelSchema, envelope } from "./common.js";

export const CropTransformSchema = z.strictObject({
  fit: z.enum(["cover", "contain"]),
  focalPoint: z.strictObject({ x: ConfidenceSchema, y: ConfidenceSchema }),
  scale: z.number().min(1).max(4),
});
export const TimelineClipSchema = z.strictObject({
  clipId: IdSchema,
  segmentId: IdSchema,
  assetId: IdSchema,
  sourceRange: TimeRangeSchema,
  outputStartSeconds: SecondsSchema,
  role: RoleSchema,
  speed: z.number().min(0.25).max(4),
  transform: CropTransformSchema,
  sourceAudioGain: z.number().min(0).max(2),
  transitionOut: TransitionSchema,
  reason: z.string().min(1).max(500),
  confidence: ConfidenceSchema,
  decisionId: IdSchema,
});
export const CaptionSchema = z.strictObject({
  captionId: IdSchema,
  range: TimeRangeSchema,
  text: z.string().min(1).max(500),
  language: LanguageSchema,
  position: z.enum(["upper", "middle", "lower"]),
  style: z.enum(["clean", "emphasis"]),
});
export const OverlaySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), overlayId: IdSchema, range: TimeRangeSchema, text: z.string().min(1).max(120), position: z.enum(["upper", "middle", "lower"]) }),
]);
export const EffectSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("color_preset"), effectId: IdSchema, range: TimeRangeSchema, preset: z.enum(["neutral", "warm", "cool"]), intensity: ConfidenceSchema }),
]);
export const UniversalEditPlanSchema = z.strictObject({
  ...envelope("UniversalEditPlan"),
  planId: IdSchema,
  projectId: IdSchema,
  revision: z.number().int().nonnegative(),
  parentPlanId: IdSchema.nullable(),
  output: z.strictObject({
    aspectRatio: z.literal("9:16"),
    resolution: ResolutionSchema,
    fps: FrameRateSchema,
    targetDurationSeconds: z.number().min(15).max(30),
  }),
  clips: z.array(TimelineClipSchema).min(1).max(120),
  music: z.strictObject({
    assetId: IdSchema,
    audioFingerprintId: IdSchema,
    sourceRange: TimeRangeSchema,
    outputStartSeconds: SecondsSchema,
    gain: z.number().min(0).max(2),
    fadeInSeconds: SecondsSchema,
    fadeOutSeconds: SecondsSchema,
  }).nullable(),
  captions: z.array(CaptionSchema).max(120),
  overlays: z.array(OverlaySchema).max(32),
  effects: z.array(EffectSchema).max(16),
  metadata: z.strictObject({
    planner: IdSchema,
    plannerVersion: VersionLabelSchema,
    modelRunIds: z.array(IdSchema).max(32),
    referenceFingerprintId: IdSchema.nullable(),
    createdAt: TimestampSchema,
  }),
}).superRefine((plan, ctx) => {
  if (plan.output.resolution.width * 16 !== plan.output.resolution.height * 9) {
    ctx.addIssue({ code: "custom", path: ["output", "resolution"], message: "Resolution must match the 9:16 aspect ratio." });
  }
  if ((plan.revision === 0) !== (plan.parentPlanId === null) || plan.parentPlanId === plan.planId) {
    ctx.addIssue({ code: "custom", path: ["parentPlanId"], message: "Revisions require a distinct parent plan; initial plans must have no parent." });
  }
  let expectedStart = 0;
  const seen = new Set<string>();
  plan.clips.forEach((clip, index) => {
    if (seen.has(clip.clipId)) ctx.addIssue({ code: "custom", path: ["clips", index, "clipId"], message: "Duplicate timeline clip ID." });
    seen.add(clip.clipId);
    const duration = (clip.sourceRange.endSeconds - clip.sourceRange.startSeconds) / clip.speed;
    if (Math.abs(clip.outputStartSeconds - expectedStart) > TIME_EPSILON_SECONDS) {
      ctx.addIssue({ code: "custom", path: ["clips", index, "outputStartSeconds"], message: "Timeline must be ordered and continuous, overlapping only for the declared transition." });
    }
    const end = clip.outputStartSeconds + duration;
    const overlap = clip.transitionOut.type === "dissolve" ? clip.transitionOut.durationSeconds : 0;
    const incoming = plan.clips[index - 1]?.transitionOut;
    const incomingOverlap = incoming?.type === "dissolve" ? incoming.durationSeconds : 0;
    if (overlap + incomingOverlap >= duration) {
      ctx.addIssue({ code: "custom", path: ["clips", index, "transitionOut"], message: "Transitions cannot consume an entire clip or cause a triple overlap." });
    }
    if (index === plan.clips.length - 1 && overlap !== 0) {
      ctx.addIssue({ code: "custom", path: ["clips", index, "transitionOut"], message: "The last clip must end with a cut." });
    }
    expectedStart = end - overlap;
  });
  if (Math.abs(expectedStart - plan.output.targetDurationSeconds) > TIME_EPSILON_SECONDS) {
    ctx.addIssue({ code: "custom", path: ["output", "targetDurationSeconds"], message: "Target duration must equal the speed- and transition-adjusted timeline duration." });
  }
  for (const key of ["captions", "overlays", "effects"] as const) {
    const ids = new Set<string>();
    plan[key].forEach((item, index) => {
      const id = "captionId" in item ? item.captionId : "overlayId" in item ? item.overlayId : item.effectId;
      if (ids.has(id)) ctx.addIssue({ code: "custom", path: [key, index], message: "Duplicate item ID." });
      ids.add(id);
      if (item.range.endSeconds > plan.output.targetDurationSeconds) {
        ctx.addIssue({ code: "custom", path: [key, index, "range"], message: "Item exceeds the output duration." });
      }
    });
  }
  if (plan.music !== null) {
    const duration = plan.music.sourceRange.endSeconds - plan.music.sourceRange.startSeconds;
    if (plan.music.outputStartSeconds + duration > plan.output.targetDurationSeconds + TIME_EPSILON_SECONDS || plan.music.fadeInSeconds + plan.music.fadeOutSeconds > duration) {
      ctx.addIssue({ code: "custom", path: ["music"], message: "Music must fit the timeline, with fades fitting its duration." });
    }
  }
});
