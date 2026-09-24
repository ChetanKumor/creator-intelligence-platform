/** Owner-authored output profile and graph-construction policy. Both are explicit, versioned and identity bearing. */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, identify } from "../editorial/common.js";
import { AspectSchema, ClockSchema, FrameRateBoundsSchema, OwnerSchema, ResolutionBoundsSchema, ScopeSchema, envelope, parse } from "./common.js";

const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
const OutputProfileBodySchema = z.strictObject({
  ...envelope("EditOutputProfile"), scope: ScopeSchema, author: OwnerSchema,
  aspectRatio: AspectSchema, resolution: ResolutionBoundsSchema, frameRate: FrameRateBoundsSchema, clock: ClockSchema,
});
type OutputProfileBody = z.infer<typeof OutputProfileBodySchema>;
/** The graph profile is not the UEP profile: any consistent profile may be represented; UEP fit is judged separately. */
function consistentProfile(v: OutputProfileBody): boolean {
  return gcd(v.aspectRatio.width, v.aspectRatio.height) === 1
    && v.resolution.width * v.aspectRatio.height === v.resolution.height * v.aspectRatio.width
    && v.frameRate.numerator >= v.frameRate.denominator && v.frameRate.numerator <= 240 * v.frameRate.denominator;
}
export const EditOutputProfileSchema = OutputProfileBodySchema.extend({ profileId: IdSchema })
  .refine(consistentProfile, "Aspect must be reduced, resolution must match it exactly and frame rate must be 1-240 fps.")
  .refine(v => checkIdentity(v, "profileId", "edit_output_profile_v0"), "Output profile identity mismatch.");
export type EditOutputProfile = z.infer<typeof EditOutputProfileSchema>;
export function createEditOutputProfile(input: unknown): EditOutputProfile {
  return parse(EditOutputProfileSchema, identify("edit_output_profile_v0", "profileId", parse(OutputProfileBodySchema, input)));
}

const EditGraphPolicyBodySchema = z.strictObject({
  ...envelope("EditGraphPolicy"), scope: ScopeSchema, author: OwnerSchema,
  construction: z.literal("chosen_gate5_sequence_v0"), placement: z.literal("contiguous_cuts_from_zero_v0"),
  timeMapping: z.literal("constant_speed_identity_v0"), framing: z.literal("source_display_aspect_must_equal_output_v0"),
  sourceAudio: z.enum(["linked_identity", "excluded"]),
  // V0 has no optional-operation relaxation and verifies no deferred Gate-5 relationship semantics: both fail closed.
  obligationRelaxation: z.literal("none_fail_closed_v0"), deferredCheckVerification: z.literal("none_fail_closed_v0"),
  executability: z.literal("single_executor_all_requirements_available_v0"),
});
export const EditGraphPolicySchema = EditGraphPolicyBodySchema.extend({ policyId: IdSchema })
  .refine(v => checkIdentity(v, "policyId", "edit_graph_policy_v0"), "Edit graph policy identity mismatch.");
export type EditGraphPolicy = z.infer<typeof EditGraphPolicySchema>;
export function createEditGraphPolicy(input: unknown): EditGraphPolicy {
  return parse(EditGraphPolicySchema, identify("edit_graph_policy_v0", "policyId", parse(EditGraphPolicyBodySchema, input)));
}
