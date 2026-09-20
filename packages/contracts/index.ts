import { AudioFingerprintSchema } from "./audio.js";
import { MediaAssetSchema } from "./common.js";
import { ClipSegmentSchema, ReferenceFingerprintSchema } from "./creative.js";
import { UniversalEditPlanSchema } from "./edit-plan.js";
import { CostEventSchema, CreatorPreferenceEventSchema, DecisionEventSchema, FeedbackEventSchema, ModelRunSchema } from "./events.js";
import { QCResultSchema, RenderResultSchema } from "./execution.js";
import { JobStateSchema } from "./job.js";

export * from "./common.js";
export * from "./audio.js";
export * from "./creative.js";
export * from "./edit-plan.js";
export * from "./events.js";
export * from "./execution.js";
export * from "./job.js";
export * from "./reference-v11.js";

// New versions need an explicit schema and migration. Unknown versions never fall back.
export const contractSchemas = {
  ReferenceFingerprint: ReferenceFingerprintSchema,
  ClipSegment: ClipSegmentSchema,
  AudioFingerprint: AudioFingerprintSchema,
  UniversalEditPlan: UniversalEditPlanSchema,
  DecisionEvent: DecisionEventSchema,
  FeedbackEvent: FeedbackEventSchema,
  CostEvent: CostEventSchema,
  ModelRun: ModelRunSchema,
  CreatorPreferenceEvent: CreatorPreferenceEventSchema,
  RenderResult: RenderResultSchema,
  QCResult: QCResultSchema,
  JobState: JobStateSchema,
  MediaAsset: MediaAssetSchema,
} as const;
export type ContractName = keyof typeof contractSchemas;
