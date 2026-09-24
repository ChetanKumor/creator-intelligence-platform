/**
 * Owner-authored execution policy and render profiles. Both are explicit, versioned and identity bearing. A profile holds
 * bounded owned settings only: no command, filter description, path or executor instruction can be expressed.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, identify } from "../editorial/common.js";
import { FrameRateBoundsSchema, OwnerSchema, ResolutionBoundsSchema } from "../edit-graph/common.js";
import { RenderIntentSchema, ScopeSchema, envelope, parse } from "./common.js";

const WEEK_MILLISECONDS = 604_800_000;
const PolicyBodySchema = z.strictObject({
  ...envelope("ExecutionPolicy"), scope: ScopeSchema, author: OwnerSchema,
  admission: z.literal("single_selected_executor_fresh_evidence_v0"),
  sourceRecheck: z.literal("per_unique_source_full_byte_hash_and_current_lifecycle_v0"),
  // V0 declares no preview relaxation: preview and final both require every boundary on the output frame grid.
  frameConformance: z.literal("exact_output_frame_grid_all_intents_v0"),
  workload: z.literal("derived_render_work_plus_attributed_estimate_v0"),
  budget: z.literal("separate_execution_budget_replayed_reservation_v0"),
  dag: z.literal("provider_neutral_typed_nodes_v0"),
  freshness: z.strictObject({
    maxSourceReceiptAgeMilliseconds: z.number().int().min(1).max(WEEK_MILLISECONDS),
    maxCapabilityEvidenceAgeMilliseconds: z.number().int().min(1).max(WEEK_MILLISECONDS),
  }),
});
export const ExecutionPolicySchema = PolicyBodySchema.extend({ policyId: IdSchema })
  .refine(v => checkIdentity(v, "policyId", "execution_policy_v0"), "Execution policy identity mismatch.");
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;
export function createExecutionPolicy(input: unknown): ExecutionPolicy {
  return parse(ExecutionPolicySchema, identify("execution_policy_v0", "policyId", parse(PolicyBodySchema, input)));
}

/** Registered V0 encoding vocabulary. An executor adapter maps these owned identifiers to its own allowlisted settings. */
export const VideoEncodingSchema = z.strictObject({ codecFamily: z.enum(["h264"]), pixelFormat: z.enum(["yuv420p"]), encodingProfile: z.enum(["deterministic_constant_quality_v0"]) });
export const AudioEncodingSchema = z.strictObject({ policy: z.literal("graph_linked_source_audio_v0"), codecFamily: z.enum(["aac"]),
  sampleRateHz: z.union([z.literal(44100), z.literal(48000)]), channelLayout: z.enum(["mono", "stereo"]) });
const ProfileBodySchema = z.strictObject({
  ...envelope("ExecutionRenderProfile"), scope: ScopeSchema, author: OwnerSchema, intent: RenderIntentSchema,
  resolution: ResolutionBoundsSchema, frameRate: FrameRateBoundsSchema, video: VideoEncodingSchema, audio: AudioEncodingSchema,
});
type ProfileBody = z.infer<typeof ProfileBodySchema>;
function consistentProfile(v: ProfileBody): boolean {
  return v.frameRate.numerator >= v.frameRate.denominator && v.frameRate.numerator <= 240 * v.frameRate.denominator
    && v.resolution.width % 2 === 0 && v.resolution.height % 2 === 0;
}
export const ExecutionRenderProfileSchema = ProfileBodySchema.extend({ renderProfileId: IdSchema })
  .refine(consistentProfile, "Frame rate must be 1-240 fps and 4:2:0 output needs even dimensions.")
  .refine(v => checkIdentity(v, "renderProfileId", "execution_render_profile_v0"), "Render profile identity mismatch.");
export type ExecutionRenderProfile = z.infer<typeof ExecutionRenderProfileSchema>;
export function createExecutionRenderProfile(input: unknown): ExecutionRenderProfile {
  return parse(ExecutionRenderProfileSchema, identify("execution_render_profile_v0", "renderProfileId", parse(ProfileBodySchema, input)));
}
