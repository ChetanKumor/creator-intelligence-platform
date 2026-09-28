/**
 * Phase 5 Gate 7 Batch 1 shared records: strict envelopes, owned refusal codes, exact supplied artifacts and explicit
 * time arithmetic. Nothing here reads a clock, the environment, a filesystem or a network.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, compareText, equal, type EvidenceRef, type SuppliedArtifact } from "../editorial/common.js";
import { EditGraphError } from "../edit-graph/index.js";
import { HashSchema, ScopeSchema, type Scope } from "../edit-graph/common.js";

export { ScopeSchema, type Scope };
export const EDIT_EXECUTION_VERSION = "0.1.0" as const;
/** The ExecutionDag record's own schema version: 0.2.0 carries exact source time (Gate 7 Batch 3A-F); every other Batch-1 artifact keeps 0.1.0. */
export const EXECUTION_DAG_VERSION = "0.2.0" as const;
export const envelope = <const T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(EDIT_EXECUTION_VERSION),
  stability: z.literal("internal_pre_stable") });
export const header = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: EDIT_EXECUTION_VERSION, stability: "internal_pre_stable" as const });
export const RENDER_INTENTS = ["final", "preview"] as const;
export const RenderIntentSchema = z.enum(RENDER_INTENTS);
export type RenderIntent = z.infer<typeof RenderIntentSchema>;
export const ActorSchema = z.strictObject({ kind: z.enum(["owner", "operator"]), actorId: IdSchema });
export const PositiveSafeInt = z.number().int().positive().safe();
/** A version label that can never be a location or an invocation: no separator, drive or scheme colon, whitespace, quote or leading dot. */
export const LocationFreeVersionSchema = z.string().regex(/^[0-9A-Za-z][0-9A-Za-z._+-]{0,79}$/);
/**
 * The executor build selected for execution. Gate 6 keeps its accepted free-text version for capability evidence; an executor carried into
 * Gate-7 execution authority, runtime evidence or DAG state must have an execution-safe version, or it is ineligible for execution.
 */
export const ExecutionExecutorIdentitySchema = z.strictObject({ executorId: IdSchema, version: LocationFreeVersionSchema, implementationDigest: HashSchema });
export type ExecutionExecutorIdentity = z.infer<typeof ExecutionExecutorIdentitySchema>;
/** A declared set of artifact references: unique object IDs in canonical order. Supplied bytes must already be canonical. */
export const refSet = (maximum: number) => z.array(ArtifactRefSchema).max(maximum)
  .refine(values => new Set(values.map(v => v.objectId)).size === values.length, "Duplicate artifact references.")
  .transform(values => [...values].sort((a, b) => compareText(a.objectId, b.objectId)));

export const EDIT_EXECUTION_ERROR_CODES = [
  "input_invalid", "scope_mismatch", "limit_exceeded", "execution_grant_window_invalid", "evidence_postdates_admission", "evidence_postdates_execution_grant",
  "graph_replay_failed", "graph_binding_mismatch", "graph_obligation_unresolved", "graph_source_inconsistent",
  "render_profile_incompatible", "render_intent_mismatch", "output_frame_alignment_unproven",
  "media_grant_missing", "media_grant_invalid", "media_grant_window_invalid", "render_intent_not_granted",
  "source_receipt_missing", "source_receipt_invalid", "source_receipt_stale", "source_analysis_mismatch", "source_hash_mismatch", "source_size_mismatch",
  "media_asset_mismatch", "media_asset_foreign_scope", "media_asset_not_video", "source_deletion_requested", "source_expired",
  "capability_snapshot_invalid", "capability_snapshot_stale", "capability_environment_mismatch",
  "executor_not_execution_safe", "executor_not_in_snapshot", "executor_version_mismatch", "executor_digest_mismatch",
  "capability_partial", "capability_unavailable", "capability_unsupported", "capability_failed", "capability_split_across_executors",
  "runtime_attestation_missing", "runtime_attestation_invalid", "runtime_attestation_mismatch", "runtime_attestation_unavailable", "runtime_attestation_failed",
  "runtime_attestation_stale",
  "execution_budget_missing", "execution_budget_invalid", "planning_budget_reused",
  "reservation_missing", "reservation_invalid", "reservation_attempt_mismatch", "reservation_allocation_mismatch",
  "work_estimate_missing", "work_estimate_mismatch", "workload_exceeds_reservation",
  "admission_replay_mismatch", "dag_replay_mismatch", "operation_not_executable",
] as const;
export type EditExecutionErrorCode = (typeof EDIT_EXECUTION_ERROR_CODES)[number];
/** Every Gate-7 refusal carries one owned code. There is no partial or "authorized with warnings" outcome. */
export class EditExecutionError extends Error {
  constructor(public readonly code: EditExecutionErrorCode, message: string) { super(message); this.name = "EditExecutionError"; }
}
export function refuse(code: EditExecutionErrorCode, message: string): never { throw new EditExecutionError(code, message); }
export function check(condition: unknown, code: EditExecutionErrorCode, message: string): asserts condition { if (!condition) refuse(code, message); }
/** Maps foreign failures (schema, missing artifact, accepted-gate replay) onto one owned code without hiding owned codes. */
export function guard<T>(code: EditExecutionErrorCode, run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof EditExecutionError) throw error;
    throw new EditExecutionError(code, error instanceof Error ? error.message : "Invalid Gate-7 input.");
  }
}
/** Accepted Gate-6 helpers keep their meaning: their scope and limit refusals stay scope and limit refusals here. */
export function guardGate6<T>(code: EditExecutionErrorCode, run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof EditExecutionError) throw error;
    if (error instanceof EditGraphError && (error.code === "scope_mismatch" || error.code === "limit_exceeded")) throw new EditExecutionError(error.code, error.message);
    throw new EditExecutionError(code, error instanceof Error ? error.message : "Invalid Gate-6 input.");
  }
}
export function parse<S extends z.ZodType>(schema: S, value: unknown, code: EditExecutionErrorCode = "input_invalid"): z.output<S> {
  return guard(code, () => schema.parse(value));
}
/** A supplied artifact must already be canonical: parsing may not reorder or rewrite what its exact bytes address. */
export function parseCanonical<S extends z.ZodType>(schema: S, value: unknown, code: EditExecutionErrorCode = "input_invalid"): z.output<S> {
  const parsed = parse(schema, value, code);
  check(equal(parsed, value), code, "Supplied artifact bytes must already be in canonical form.");
  return parsed;
}
export const sameScope = (a: Scope, b: Scope): boolean => equal(a, b);

/** Exact, explicitly supplied artifacts only. An absent object is distinguishable from a present artifact of the wrong type or bytes. */
export class SuppliedArtifacts {
  readonly map: EditorialArtifactMap;
  private readonly objectIds: ReadonlySet<string>;
  constructor(readonly artifacts: readonly SuppliedArtifact[]) {
    this.map = guard("input_invalid", () => new EditorialArtifactMap(artifacts));
    this.objectIds = new Set(artifacts.map(a => a.ref.objectId));
  }
  exact(refInput: unknown, kind: string, version: string, invalid: EditExecutionErrorCode = "input_invalid", absent: EditExecutionErrorCode = invalid): unknown {
    const ref = parse(ArtifactRefSchema, refInput, invalid);
    check(ref.artifactType === kind && ref.artifactVersion === version, invalid, `Exact ${kind} ${version} reference required.`);
    check(this.objectIds.has(ref.objectId), absent, `Missing explicitly supplied ${kind}.`);
    return guard(invalid, () => this.map.get(ref));
  }
  /** Supporting evidence resolves, declares the exact scope and is never itself an execution authority artifact. */
  scoped(refs: readonly EvidenceRef[], scope: Scope, code: EditExecutionErrorCode): void {
    for (const input of refs) {
      const ref = parse(EvidenceRefSchema, input, code);
      check(this.objectIds.has(ref.artifact.objectId), code, "Supporting evidence must be explicitly supplied.");
      const root = guard(code, () => this.map.get(ref.artifact));
      const record = root !== null && typeof root === "object" && !Array.isArray(root) ? root as Record<string, unknown> : {};
      const declared = ScopeSchema.safeParse(record.scope);
      check(declared.success && sameScope(declared.data, scope), code, "Supporting evidence must declare the exact execution scope.");
      check(!AUTHORITY_ARTIFACT_TYPES.includes(ref.artifact.artifactType), code, "An authority artifact cannot be reused as supporting evidence.");
      guard(code, () => this.map.resolve(ref));
    }
  }
}
const AUTHORITY_ARTIFACT_TYPES: readonly string[] = ["CapabilityAttestation", "CapabilitySnapshot", "ExecutionAdmission", "ExecutionDag", "ExecutionGrant",
  "ExecutionMediaGrant", "ExecutionRuntimeAttestation", "ExecutionWorkEstimate", "SourceAccessReceipt"];

/**
 * Exact UTC epoch milliseconds of a validated `YYYY-MM-DDTHH:mm:ss.sssZ` timestamp by civil-calendar arithmetic. No clock,
 * locale or date object is consulted, and impossible calendar values are rejected rather than normalized.
 */
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
export function epochMilliseconds(timestamp: string): number {
  const match = TIMESTAMP.exec(timestamp);
  check(match !== null, "input_invalid", "Timestamps must be exact UTC milliseconds.");
  const [year, month, day, hour, minute, second, millisecond] = match.slice(1).map(Number) as [number, number, number, number, number, number, number];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  check(year >= 1970 && monthDays !== undefined && day >= 1 && day <= monthDays && hour <= 23 && minute <= 59 && second <= 59, "input_invalid", "Impossible calendar timestamp.");
  const shifted = month <= 2 ? year - 1 : year, era = Math.floor(shifted / 400), yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const days = era * 146097 + yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear - 719468;
  return ((days * 24 + hour) * 60 + minute) * 60_000 + second * 1000 + millisecond;
}
