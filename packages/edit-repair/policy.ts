/**
 * The owner's repair policy: which typed actions may be proposed, which finding producers may drive a repair, and a hard budget for one
 * repair (operations, clips touched, exact affected output, exact source trim per operation, attempts, explanation and plan size). Every
 * duration is exact time; nothing is rounded to fit.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, compareText, identify } from "../editorial/common.js";
import { CanonicalTimeSchema, ScopeSchema } from "../edit-graph/common.js";
import { REPAIR_ACTIONS, REPAIR_HARD_LIMITS, envelope, header, parse } from "./common.js";

const bounded = (maximum: number) => z.number().int().min(1).max(maximum);
const Duration = CanonicalTimeSchema.refine(t => t.value > 0, "A positive exact duration.");
const set = <const T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).min(1).max(values.length)
  .refine(v => new Set(v).size === v.length, "Duplicate entries.").transform(v => [...v].sort(compareText));
export const FINDING_PRODUCERS = ["deterministic_check", "semantic_critic"] as const;
const PolicyFields = { scope: ScopeSchema, author: z.strictObject({ kind: z.literal("owner"), actorId: IdSchema }), actions: set(REPAIR_ACTIONS),
  findings: z.strictObject({ producers: set(FINDING_PRODUCERS) }),
  budget: z.strictObject({ maxOperations: bounded(REPAIR_HARD_LIMITS.maxOperations), maxClipsTouched: bounded(REPAIR_HARD_LIMITS.maxClipsTouched),
    maxAffectedOutput: Duration, maxSourceTrimPerOperation: Duration, maxRepairAttempts: bounded(REPAIR_HARD_LIMITS.maxRepairAttempts),
    maxExplanationCharacters: bounded(REPAIR_HARD_LIMITS.maxExplanationCharacters), maxPlanBytes: bounded(REPAIR_HARD_LIMITS.maxPlanBytes) }) };
export const RepairPolicySchema = z.strictObject({ ...envelope("RepairPolicy"), ...PolicyFields, policyId: IdSchema })
  .refine(v => checkIdentity(v, "policyId", "repair_policy_v0"), "Repair policy identity mismatch.");
export type RepairPolicy = z.infer<typeof RepairPolicySchema>;
export function createRepairPolicy(input: unknown): RepairPolicy {
  const body = parse(z.strictObject(PolicyFields), input, "repair_policy_invalid");
  return parse(RepairPolicySchema, identify("repair_policy_v0", "policyId", { ...header("RepairPolicy"), ...body }), "repair_policy_invalid");
}
