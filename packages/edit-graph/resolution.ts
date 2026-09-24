/**
 * An explicitly supplied, attributed resolution of one exact Gate-5 deferred obligation into one typed V0 primitive.
 * It has no free text: Director prose can never become parameters, executors or commands. Consistency with the typed
 * intention, the exact decision and the chosen sequence is enforced where the graph is built.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { ArtifactRefSchema, EvidenceRefSchema, checkIdentity, identify } from "../editorial/common.js";
import { ScopeSchema, envelope, idSet, parse } from "./common.js";

export const LookSchema = z.enum(["neutral", "warm", "cool", "contrast"]);
const ColorLookResolutionSchema = z.strictObject({
  primitive: z.literal("color_look"), look: LookSchema, intensityPerMille: z.number().int().min(0).max(1000),
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("whole_output") }),
    z.strictObject({ kind: z.literal("planning_uses"), useIds: idSet(16, 1) }),
  ]),
});
const CutResolutionSchema = z.strictObject({ primitive: z.literal("cut_transition"), join: z.strictObject({ fromUseId: IdSchema, toUseId: IdSchema }) });
const ResolutionBodySchema = z.strictObject({
  ...envelope("TechniqueResolution"), scope: ScopeSchema, author: z.strictObject({ kind: z.enum(["owner", "editor"]), actorId: IdSchema }),
  planningDecision: ArtifactRefSchema, direction: ArtifactRefSchema,
  obligation: z.strictObject({ nodeId: IdSchema, directionNode: EvidenceRefSchema }),
  // Only intentions with a registered V0 primitive are resolvable. Graphics, sound design, technique and music stay unresolved.
  intentionKind: z.enum(["color_intention", "transition_intention"]),
  operation: z.discriminatedUnion("primitive", [ColorLookResolutionSchema, CutResolutionSchema]),
  rules: z.literal("typed_intention_exact_v0"),
});
export const TechniqueResolutionSchema = ResolutionBodySchema.extend({ resolutionId: IdSchema })
  .refine(v => (v.intentionKind === "color_intention") === (v.operation.primitive === "color_look"), "Intention kind and primitive disagree.")
  .refine(v => checkIdentity(v, "resolutionId", "technique_resolution_v0"), "Technique resolution identity mismatch.");
export type TechniqueResolution = z.infer<typeof TechniqueResolutionSchema>;
export function createTechniqueResolution(input: unknown): TechniqueResolution {
  return parse(TechniqueResolutionSchema, identify("technique_resolution_v0", "resolutionId", parse(ResolutionBodySchema, input)));
}
