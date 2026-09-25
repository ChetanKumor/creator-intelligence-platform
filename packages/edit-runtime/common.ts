/**
 * Phase 5 Gate 7 Batch 2A shared runtime rules: owned refusal codes, strict envelopes, exact supplied artifacts, owned
 * storage keys, conservative limits and pure UTC arithmetic. Nothing here reads a clock, the environment, a filesystem or a
 * network: runtime side effects enter only through the narrow ports in ports.ts, which a separate local adapter implements.
 */
import { z } from "zod";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, equal, type EvidenceRef, type SuppliedArtifact } from "../editorial/common.js";
import { ScopeSchema, type Scope } from "../edit-graph/common.js";
import { epochMilliseconds } from "../edit-execution/common.js";

export { ScopeSchema, type Scope };
export const EDIT_RUNTIME_VERSION = "0.1.0" as const;
export const envelope = <const T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(EDIT_RUNTIME_VERSION),
  stability: z.literal("internal_pre_stable") });
export const header = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: EDIT_RUNTIME_VERSION, stability: "internal_pre_stable" as const });

/** The implementation identity every Batch-2A runtime record binds. */
export const RUNTIME_IMPLEMENTATION = { implementationId: "gate7_batch2a_edit_runtime", version: "0.1.0" } as const;
export const RuntimeImplementationSchema = z.strictObject({ implementationId: z.literal(RUNTIME_IMPLEMENTATION.implementationId),
  version: z.literal(RUNTIME_IMPLEMENTATION.version) });
/**
 * The durability a storage adapter actually provides. The local adapter syncs a record's or object's bytes before it
 * publishes the name, but cannot sync the directory entry on this platform, so power-loss durability of a freshly
 * published name is not claimed.
 */
export const STORAGE_DURABILITY = ["file_bytes_synced_before_publication_directory_entry_not_synced_v0"] as const;
export const StorageDurabilitySchema = z.enum(STORAGE_DURABILITY);
export type StorageDurability = z.infer<typeof StorageDurabilitySchema>;
export const LEDGER_NAMESPACES = ["attempt_registration", "execution_claim"] as const;
export type LedgerNamespace = (typeof LEDGER_NAMESPACES)[number];

// ---------------------------------------------------------------- conservative limits
/** The maximum bytes of one persisted runtime record. */
export const MAX_RUNTIME_RECORD_BYTES = 65_536;
/** The accepted local source limit (the 8 GiB bound of the accepted source hashing path). */
export const MAX_STAGED_SOURCE_BYTES = 8 * 1024 ** 3;
/** At most as many sources as a Batch-1 admission admits. */
export const MAX_RUNTIME_SOURCES = 16;
export const MAX_RUNTIME_EVIDENCE = 16;
/** Bytes copied and hashed per read from the one opened source handle. */
export const STAGING_CHUNK_BYTES = 1_048_576;
/**
 * The largest supplied-artifact universe any Batch-2A step accepts, enforced before any artifact map is built. Measured accepted
 * universes: 82-88 artifacts for a Batch-1 admission and DAG over one or two sources, 104 over four (about eight more per source),
 * and at most 98 for a Batch-2A preparation call. The Batch-1 maximum of 16 sources extrapolates to about 240 with every Batch-2A
 * record; 512 keeps more than twice that headroom and stays finite.
 */
export const MAX_RUNTIME_ARTIFACTS = 512;

export const EDIT_RUNTIME_ERROR_CODES = [
  "input_invalid", "scope_mismatch", "limit_exceeded", "execution_dag_invalid", "evidence_chronology_invalid", "evidence_postdates_preparation",
  "evidence_provenance_unsupported",
  "runtime_root_invalid", "runtime_storage_corrupt", "runtime_storage_unavailable",
  "reservation_invalid", "attempt_registration_missing", "attempt_registration_conflict", "attempt_registration_corrupt", "reservation_fork_conflict",
  "reservation_not_authoritative",
  "claim_ownership_required", "claim_already_acquired", "claim_record_corrupt", "claim_missing", "claim_mismatch",
  "source_not_admitted", "source_location_invalid", "source_outside_allowed_root", "source_not_regular", "source_symlink", "source_unavailable", "source_changed",
  "source_empty", "source_hash_mismatch", "source_size_mismatch",
  "staged_object_corrupt", "staged_object_missing", "staged_object_mismatch", "staged_source_missing", "staged_source_invalid",
  "lifecycle_observation_missing", "lifecycle_observation_invalid", "lifecycle_stale", "lifecycle_deleted", "lifecycle_expired",
  "execution_grant_expired", "media_grant_expired", "media_grant_invalid",
  "capability_recheck_missing", "capability_recheck_invalid", "capability_recheck_mismatch", "capability_recheck_stale", "capability_recheck_unavailable",
  "runtime_recheck_missing", "runtime_recheck_invalid", "runtime_recheck_mismatch", "runtime_recheck_stale", "runtime_recheck_unavailable",
  "dispatch_policy_invalid", "dispatch_preparation_invalid", "dispatch_preparation_replay_mismatch", "dispatch_preparation_expired",
] as const;
export type EditRuntimeErrorCode = (typeof EDIT_RUNTIME_ERROR_CODES)[number];
/** Every Batch-2A refusal carries one owned code. There is no partial authorization. Messages never carry a location. */
export class EditRuntimeError extends Error {
  constructor(public readonly code: EditRuntimeErrorCode, message: string) { super(message); this.name = "EditRuntimeError"; }
}
export function refuse(code: EditRuntimeErrorCode, message: string): never { throw new EditRuntimeError(code, message); }
export function check(condition: unknown, code: EditRuntimeErrorCode, message: string): asserts condition { if (!condition) refuse(code, message); }
/** Maps a foreign failure onto one owned code without its detail (which may carry a location), keeping owned codes. */
export function guard<T>(code: EditRuntimeErrorCode, run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof EditRuntimeError) throw error;
    throw new EditRuntimeError(code, error instanceof Error && !/[\\/]/.test(error.message) ? error.message : "Invalid Gate-7 runtime input.");
  }
}
export async function guardAsync<T>(code: EditRuntimeErrorCode, run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof EditRuntimeError) throw error;
    throw new EditRuntimeError(code, "A runtime port failed; its detail is not propagated.");
  }
}
export function parse<S extends z.ZodType>(schema: S, value: unknown, code: EditRuntimeErrorCode = "input_invalid"): z.output<S> {
  return guard(code, () => schema.parse(value));
}
/** A supplied or persisted record must already be canonical: parsing may not reorder or rewrite what its exact bytes address. */
export function parseCanonical<S extends z.ZodType>(schema: S, value: unknown, code: EditRuntimeErrorCode = "input_invalid"): z.output<S> {
  const parsed = parse(schema, value, code);
  check(equal(parsed, value), code, "The record is not in canonical form.");
  return parsed;
}

/** The only content-identity namespaces that name durable runtime state. */
export const OWNED_NAMESPACES = ["execution_attempt_slot_v0", "execution_claim_target_v0", "staged_source_object_v0"] as const;
export type OwnedNamespace = (typeof OWNED_NAMESPACES)[number];
/**
 * An owned storage key: the 64-hex digest of a runtime-derived content identity of exactly the expected namespace. Raw
 * project, creator, operation, asset, worker or file names never become storage names, and an identity of another
 * namespace never addresses runtime state, so no caller-chosen string can traverse, collide with or address a runtime file.
 */
export function ownedKey(id: string, namespace: OwnedNamespace): string {
  check((OWNED_NAMESPACES as readonly string[]).includes(namespace), "input_invalid", "Unknown owned runtime namespace.");
  const match = typeof id === "string" ? id.match(/^([a-z][a-z0-9_]*)_([a-f0-9]{64})$/) : null;
  check(match !== null && match[1] === namespace && match[2] !== undefined, "input_invalid",
    "Only a runtime-derived content identity of the expected namespace names durable runtime state.");
  return match[2];
}

// ---------------------------------------------------------------- exact UTC milliseconds (pure arithmetic, no clock)
export function millisecondsOf(timestamp: string): number {
  return guard("input_invalid", () => epochMilliseconds(timestamp));
}
const pad = (value: number, width: number) => String(value).padStart(width, "0");
/** The exact `YYYY-MM-DDTHH:mm:ss.sssZ` timestamp of UTC epoch milliseconds, by civil-calendar arithmetic. */
export function timestampAt(milliseconds: number): string {
  check(Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds < 253_402_300_800_000, "limit_exceeded", "Timestamp out of range.");
  const days = Math.floor(milliseconds / 86_400_000), rest = milliseconds - days * 86_400_000;
  const shifted = days + 719_468, era = Math.floor(shifted / 146_097), dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1_460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153), day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9, year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const hour = Math.floor(rest / 3_600_000), minute = Math.floor(rest / 60_000) % 60, second = Math.floor(rest / 1_000) % 60, millisecond = rest % 1_000;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}.${pad(millisecond, 3)}Z`;
}
/**
 * The one freshness rule: evidence observed at `observedAt` under a maximum age `maxAge` is fresh exactly while
 * `observedAt <= now < observedAt + maxAge`. The expiry instant itself is stale, like every exclusive window end in Batch 2A.
 */
export function freshUntil(observedAt: string, maxAgeMilliseconds: number): string {
  return timestampAt(millisecondsOf(observedAt) + maxAgeMilliseconds);
}
export function isFresh(observedAt: string, maxAgeMilliseconds: number, now: string): boolean {
  return observedAt <= now && now < freshUntil(observedAt, maxAgeMilliseconds);
}

// ---------------------------------------------------------------- exact, explicitly supplied artifacts
/** A bounded supplied-artifact universe: the bound is enforced before any artifact is hashed, parsed or indexed. */
export function checkArtifactUniverse(artifacts: unknown): asserts artifacts is readonly SuppliedArtifact[] {
  check(Array.isArray(artifacts), "input_invalid", "Supplied artifacts are an explicit list.");
  check(artifacts.length <= MAX_RUNTIME_ARTIFACTS, "limit_exceeded", `At most ${MAX_RUNTIME_ARTIFACTS} supplied artifacts.`);
}
/** Authority artifacts are never supporting evidence of another claim, in Batch 1 or Batch 2A. */
const AUTHORITY_TYPES: ReadonlySet<string> = new Set(["CapabilityAttestation", "CapabilitySnapshot", "ExecutionAdmission", "ExecutionDag", "ExecutionGrant",
  "ExecutionMediaGrant", "ExecutionRuntimeAttestation", "ExecutionWorkEstimate", "SourceAccessReceipt", "ExecutionPolicy", "ExecutionRenderProfile", "EditGraph",
  "Reservation", "ReservationHistory", "ComputeBudget", "ComputeAuthorization", "MediaAsset", "FootageAnalysis", "AttemptRegistration", "ExecutionClaim",
  "StagedSourceReceipt", "SourceLifecycleObservation", "DispatchCapabilityRecheck", "DispatchRuntimeRecheck", "RuntimeDispatchPolicy", "DispatchPreparation"]);
export class RuntimeArtifacts {
  readonly map: EditorialArtifactMap;
  private readonly objectIds: ReadonlySet<string>;
  constructor(readonly artifacts: readonly SuppliedArtifact[]) {
    checkArtifactUniverse(artifacts);
    this.map = guard("input_invalid", () => new EditorialArtifactMap(artifacts));
    this.objectIds = new Set(artifacts.map(a => a.ref.objectId));
  }
  exact(refInput: unknown, kind: string, version: string, invalid: EditRuntimeErrorCode, absent: EditRuntimeErrorCode = invalid): unknown {
    const ref = parse(ArtifactRefSchema, refInput, invalid);
    check(ref.artifactType === kind && ref.artifactVersion === version, invalid, `An exact ${kind} ${version} reference is required.`);
    check(this.objectIds.has(ref.objectId), absent, `The ${kind} must be explicitly supplied.`);
    return guard(invalid, () => this.map.get(ref));
  }
  /** Supporting evidence resolves, declares the exact scope and is never itself an authority artifact. */
  scoped(refs: readonly EvidenceRef[], scope: Scope, code: EditRuntimeErrorCode): void {
    for (const input of refs) {
      const ref = parse(EvidenceRefSchema, input, code);
      check(this.objectIds.has(ref.artifact.objectId), code, "Supporting evidence must be explicitly supplied.");
      const root = guard(code, () => this.map.get(ref.artifact));
      const record = root !== null && typeof root === "object" && !Array.isArray(root) ? root as Record<string, unknown> : {};
      const declared = ScopeSchema.safeParse(record["scope"]);
      check(declared.success && equal(declared.data, scope), code, "Supporting evidence must declare the exact execution scope.");
      check(!AUTHORITY_TYPES.has(ref.artifact.artifactType), code, "An authority artifact is never supporting evidence.");
      guard(code, () => this.map.resolve(ref));
    }
  }
}
