/**
 * Phase 5 Gate 7 Batch 3B repair layer, shared rules: owned refusal codes, strict envelopes and hard bounds. Nothing here reads a clock, the
 * environment, a file, a network or a model. A repair proposal is data: it can only become a typed GraphDiff, and only the EditGraph's own
 * pure application of that GraphDiff makes a new revision.
 */
import { z } from "zod";
import { equal } from "../editorial/common.js";

export const EDIT_REPAIR_VERSION = "0.1.0" as const;
export const envelope = <const T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(EDIT_REPAIR_VERSION),
  stability: z.literal("internal_pre_stable") });
export const header = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: EDIT_REPAIR_VERSION, stability: "internal_pre_stable" as const });
/** The implementation identity every Batch-3B repair record binds. */
export const REPAIR_IMPLEMENTATION = { implementationId: "gate7_batch3b_edit_repair", version: "0.1.0" } as const;
export const RepairImplementationSchema = z.strictObject({ implementationId: z.literal(REPAIR_IMPLEMENTATION.implementationId), version: z.literal(REPAIR_IMPLEMENTATION.version) });
/** The typed repair actions V0 may propose; each compiles to exactly one registered GraphDiff operation. */
export const REPAIR_ACTIONS = ["trim_clip_source_range"] as const;
/** Ceilings an owner repair policy chooses inside. They bound one repair; nothing here loops or retries. */
export const REPAIR_HARD_LIMITS = Object.freeze({ maxOperations: 16, maxClipsTouched: 16, maxRepairAttempts: 8, maxExplanationCharacters: 400, maxPlanBytes: 262_144,
  maxEvidenceBytes: 262_144 });

export const EDIT_REPAIR_ERROR_CODES = [
  "input_invalid", "scope_mismatch", "limit_exceeded", "repair_policy_invalid",
  "render_binding_mismatch", "technical_qc_missing", "technical_qc_invalid", "technical_qc_failed", "technical_qc_linkage_mismatch",
  "critic_report_invalid", "critic_report_mismatch", "finding_unknown", "finding_evidence_missing", "finding_producer_not_allowed",
  "planner_failed", "planner_abstained", "planner_response_invalid",
  "repair_action_unsupported", "repair_action_invalid", "repair_action_unrelated_to_finding", "repair_budget_exceeded", "repair_attempts_exhausted",
  "repair_plan_invalid", "repair_plan_stale", "graph_diff_mismatch", "repair_lineage_invalid", "impact_input_invalid",
] as const;
export type EditRepairErrorCode = (typeof EDIT_REPAIR_ERROR_CODES)[number];
/** Every Batch-3B repair refusal carries one owned code; messages never carry a location. */
export class EditRepairError extends Error {
  constructor(public readonly code: EditRepairErrorCode, message: string) { super(message); this.name = "EditRepairError"; }
}
export function refuse(code: EditRepairErrorCode, message: string): never { throw new EditRepairError(code, message); }
export function check(condition: unknown, code: EditRepairErrorCode, message: string): asserts condition { if (!condition) refuse(code, message); }
/** Maps a foreign failure (schema, accepted Gate-6/7 layer) onto one owned code, naming the foreign code; a message that could carry a location is replaced. */
export function guard<T>(code: EditRepairErrorCode, run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof EditRepairError) throw error;
    const detail = error instanceof Error && !/[\\/]/.test(error.message) ? error.message.slice(0, 400) : "Invalid Gate-7 Batch-3B input.";
    const foreign = error instanceof Error && "code" in error && typeof error.code === "string" ? `${error.code}: ` : "";
    throw new EditRepairError(code, `${foreign}${detail}`);
  }
}
export function parse<S extends z.ZodType>(schema: S, value: unknown, code: EditRepairErrorCode = "input_invalid"): z.output<S> {
  return guard(code, () => schema.parse(value));
}
/** A supplied record must already be canonical: parsing may not reorder or rewrite what its identity addresses. */
export function parseCanonical<S extends z.ZodType>(schema: S, value: unknown, code: EditRepairErrorCode = "input_invalid"): z.output<S> {
  const parsed = parse(schema, value, code);
  check(equal(parsed, value), code, "The record is not in canonical form.");
  return parsed;
}
/** A deep-frozen structured copy: data only, no shared references and no way to mutate what a callee is handed. */
export function frozenCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}
