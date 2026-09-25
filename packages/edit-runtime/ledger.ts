/**
 * The durable local runtime ledger: one authoritative AttemptRegistration per logical attempt, and one immutable
 * ExecutionClaim per Batch-1 claim target. Both are acquired only through the ledger's atomic no-overwrite publication
 * primitive, never by a read-then-write. An occupied record that is empty, truncated, malformed, non-canonical, filed under
 * another owned key or of the wrong identity fails closed as consumed runtime authority: it is never deleted, repaired,
 * stolen, released or timed out. A retry needs attempt + 1 and a new truthful Gate-3 reservation.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, equal, type SuppliedArtifact } from "../editorial/common.js";
import { ComputeBudgetSchema, ROUTING_VERSION, ReservationSchema, reserve } from "../routing/index.js";
import type { ExecutionGrant } from "../edit-execution/index.js";
import { MAX_RUNTIME_RECORD_BYTES, RUNTIME_IMPLEMENTATION, RuntimeArtifacts, check, guard, guardAsync, header, millisecondsOf, ownedKey, parse, parseCanonical, refuse,
  type EditRuntimeErrorCode, type LedgerNamespace } from "./common.js";
import type { EditRuntime } from "./ports.js";
import { AttemptRegistrationSchema, ExecutionClaimSchema, attemptSlot, createAttemptRegistration, createExecutionClaim, type AttemptRegistration, type AttemptSlot,
  type ExecutionClaim } from "./records.js";
import { requireValidated, type ValidatedExecutionDag } from "./validated.js";

// ---------------------------------------------------------------- canonical durable records
const encoder = new TextEncoder();
function persisted(record: unknown): Uint8Array {
  const bytes = encoder.encode(`${canonicalSerialize(record)}\n`);
  check(bytes.length <= MAX_RUNTIME_RECORD_BYTES, "limit_exceeded", "A runtime record exceeds the record size bound.");
  return bytes;
}
/** Exact canonical JSON plus one newline, strict schema, content identity; anything else in an occupied slot fails closed. */
function decodeRecord<S extends z.ZodType>(bytes: Uint8Array, schema: S, code: EditRuntimeErrorCode): z.output<S> {
  const text = guard(code, () => new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  check(text.endsWith("\n"), code, "The occupied runtime record is empty, truncated or incomplete; it stays consumed and is never repaired.");
  const record = parse(schema, guard(code, () => JSON.parse(text.slice(0, -1)) as unknown), code);
  check(`${canonicalSerialize(record)}\n` === text, code, "The occupied runtime record is not in canonical form.");
  return record;
}
async function readRecord<S extends z.ZodType>(runtime: EditRuntime, namespace: LedgerNamespace, key: string, schema: S, code: EditRuntimeErrorCode): Promise<z.output<S> | null> {
  const read = await guardAsync("runtime_storage_unavailable", () => runtime.ledger.read(namespace, key, MAX_RUNTIME_RECORD_BYTES));
  if (read.state === "absent") return null;
  if (read.state === "unusable") refuse(code, `The occupied runtime record is unusable (${read.reason}); it stays consumed and is never repaired.`);
  return decodeRecord(read.bytes, schema, code);
}
async function publish(runtime: EditRuntime, namespace: LedgerNamespace, key: string, record: unknown): Promise<"published" | "exists"> {
  const outcome = await guardAsync("runtime_storage_unavailable", () => runtime.ledger.publishExclusive(namespace, key, persisted(record)));
  check(outcome === "published" || outcome === "exists", "runtime_storage_unavailable", "The ledger returned no publication outcome.");
  return outcome;
}
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Runtime-now from the runtime's own clock, validated; a caller-claimed time is never runtime truth. */
export function runtimeNow(runtime: EditRuntime): string {
  const now = guard("input_invalid", () => runtime.clock.now());
  check(typeof now === "string" && TIMESTAMP.test(now), "input_invalid", "The runtime clock must report exact UTC milliseconds.");
  millisecondsOf(now);
  return now;
}
export function checkGrantWindow(grant: ExecutionGrant, at: string): void {
  check(grant.issuedAt <= at && (grant.expiresAt === null || at < grant.expiresAt), "execution_grant_expired", "The execution grant is not valid at runtime-now.");
}

// ---------------------------------------------------------------- the logical attempt registry
async function readRegistration(runtime: EditRuntime, slot: AttemptSlot): Promise<AttemptRegistration | null> {
  const registration = await readRecord(runtime, "attempt_registration", ownedKey(slot.attemptSlotId, "execution_attempt_slot_v0"), AttemptRegistrationSchema, "attempt_registration_corrupt");
  check(registration === null || equal(registration.attemptSlot, slot), "attempt_registration_corrupt",
    "The record filed under this attempt slot names another slot; the slot stays consumed.");
  return registration;
}
/** Same slot: only the identical semantic reservation is the same registration. Purpose, budget, allocation or history never mint another. */
function sameRegistration(existing: AttemptRegistration, desired: AttemptRegistration): void {
  check(equal(existing.scope, desired.scope), "attempt_registration_conflict", "Another purpose already owns this logical attempt; a purpose never mints another attempt.");
  check(existing.budget.budgetId === desired.budget.budgetId, "attempt_registration_conflict", "Another execution budget already owns this logical attempt.");
  check(existing.allocation.budgetId === desired.allocation.budgetId, "attempt_registration_conflict", "Another allocation already owns this logical attempt.");
  check(existing.reservation.reservationId === desired.reservation.reservationId, "reservation_fork_conflict",
    "Another replay-valid reservation, from a forked reservation history, already owns this logical attempt.");
}
export type AttemptRegistrationResult = { outcome: "registered"; registration: AttemptRegistration } | { outcome: "observed_existing"; registration: AttemptRegistration };
const RegisterRequestSchema = z.strictObject({ reservation: ArtifactRefSchema });
/**
 * Registers the first replay-valid Gate-3 reservation for its logical attempt. The winner is whoever atomically publishes the
 * complete record first; a later call with the identical semantic reservation observes that record, and any other reservation
 * for the same slot conflicts. A supplied ReservationHistory is evidence, never the global source of truth.
 */
export async function registerAttempt(requestInput: unknown, artifacts: readonly SuppliedArtifact[], runtime: EditRuntime): Promise<AttemptRegistrationResult> {
  const request = parse(RegisterRequestSchema, requestInput);
  const supplied = new RuntimeArtifacts(artifacts);
  const reservation = parseCanonical(ReservationSchema, supplied.exact(request.reservation, "Reservation", ROUTING_VERSION, "reservation_invalid"), "reservation_invalid");
  const budgetAt = (ref: unknown) => parse(ComputeBudgetSchema, supplied.exact(ref, "ComputeBudget", ROUTING_VERSION, "reservation_invalid"), "reservation_invalid");
  const execution = budgetAt(reservation.budgetRef), allocation = budgetAt(reservation.allocationRef);
  check(execution.budgetId === reservation.budgetId, "reservation_invalid", "The reservation names another execution budget.");
  const replayed = guard("reservation_invalid", () => reserve({ scope: reservation.scope, budget: execution, budgetArtifact: reservation.budgetRef, allocation,
    allocationArtifact: reservation.allocationRef, historyArtifact: reservation.historyRef, operationId: reservation.operationId, attempt: reservation.attempt }, artifacts));
  check(equal(replayed, reservation), "reservation_invalid", "The reservation contradicts exact Gate-3 replay from its own references.");
  const slot = attemptSlot({ projectId: reservation.scope.projectId, creatorId: reservation.scope.creatorId, operationId: reservation.operationId, attempt: reservation.attempt });
  const registration = createAttemptRegistration({ ...header("AttemptRegistration"), attemptSlot: slot, scope: reservation.scope,
    budget: { budgetId: execution.budgetId, executionBudget: reservation.budgetRef }, allocation: { budgetId: allocation.budgetId, allocation: reservation.allocationRef },
    reservation: { reservationId: reservation.reservationId, history: reservation.historyRef, firstObservedArtifact: request.reservation },
    registeredAt: runtimeNow(runtime), registrar: { implementation: RUNTIME_IMPLEMENTATION, durability: runtime.ledger.durability },
    basis: "first_replay_valid_gate3_reservation_owns_attempt_slot_v0" });
  if (await publish(runtime, "attempt_registration", ownedKey(slot.attemptSlotId, "execution_attempt_slot_v0"), registration) === "published") {
    const stored = await readRegistration(runtime, slot);
    check(stored !== null && equal(stored, registration), "attempt_registration_corrupt", "The published registration does not read back exactly.");
    return { outcome: "registered", registration };
  }
  const existing = await readRegistration(runtime, slot);
  check(existing !== null, "attempt_registration_corrupt", "The occupied attempt slot has no readable record; it stays consumed.");
  sameRegistration(existing, registration);
  return { outcome: "observed_existing", registration: existing };
}
/** Registers the exact reservation a replay-validated DAG was admitted under. */
export async function registerDagAttempt(dag: ValidatedExecutionDag, artifacts: readonly SuppliedArtifact[], runtime: EditRuntime): Promise<AttemptRegistrationResult> {
  const validated = requireValidated(dag);
  return registerAttempt({ reservation: validated.admission.budget.reservation }, artifacts, runtime);
}
const SlotInputSchema = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, operationId: IdSchema, attempt: z.number().int().positive().safe(),
  attemptSlotId: IdSchema.optional() });
/** Reads the authoritative registration of a logical attempt: null only when no record occupies the slot. */
export async function observeAttemptRegistration(input: unknown, runtime: EditRuntime): Promise<AttemptRegistration | null> {
  const requested = parse(SlotInputSchema, input);
  const slot = attemptSlot(requested);
  check(requested.attemptSlotId === undefined || requested.attemptSlotId === slot.attemptSlotId, "input_invalid", "The attempt slot identity contradicts its fields.");
  return readRegistration(runtime, slot);
}
/** The registered winner must be exactly the reservation this DAG was admitted and claims under. */
function checkAuthoritative(dag: ValidatedExecutionDag, registration: AttemptRegistration): void {
  check(equal(registration.scope, dag.dag.scope), "attempt_registration_conflict", "The logical attempt is registered for another purpose.");
  check(registration.reservation.reservationId === dag.dag.dispatch.claimTarget.reservationId, "reservation_not_authoritative",
    "This DAG's reservation is not the registered winner of its logical attempt.");
  check(equal(registration.budget.executionBudget, dag.admission.budget.executionBudget) && equal(registration.allocation.allocation, dag.admission.budget.allocation),
    "reservation_not_authoritative", "This DAG's execution budget or allocation is not the registered one.");
}
async function authoritativeRegistration(runtime: EditRuntime, dag: ValidatedExecutionDag): Promise<AttemptRegistration> {
  const registration = await readRegistration(runtime, dag.slot);
  check(registration !== null, "attempt_registration_missing", "No authoritative registration exists for this logical attempt; register it before claiming.");
  checkAuthoritative(dag, registration);
  return registration;
}

// ---------------------------------------------------------------- the atomic execution claim
const OWNERSHIP = Symbol("claim-ownership");
const ownerDigest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
/**
 * Proof, held only in memory by the one caller that acquired a claim, that it owns that claim. Observing the durable claim
 * never yields ownership. If the owner process ends, its ownership ends with it and the claim stays consumed.
 */
export class ClaimOwnership {
  readonly #token: string;
  readonly claimTargetId: string;
  readonly claimId: string;
  constructor(construction: symbol, claimTargetId: string, claimId: string, token: string) {
    if (construction !== OWNERSHIP) refuse("claim_ownership_required", "Claim ownership is produced only by winning an acquisition.");
    this.#token = token; this.claimTargetId = claimTargetId; this.claimId = claimId;
    Object.freeze(this);
  }
  static is(value: unknown): value is ClaimOwnership { return typeof value === "object" && value !== null && #token in value; }
  /** True only for the exact recorded claim whose owner proof this ownership produces. */
  proves(claim: ExecutionClaim): boolean {
    const expected = Buffer.from(claim.ownerProof.digest, "hex"), actual = Buffer.from(ownerDigest(this.#token), "hex");
    return claim.claimId === this.claimId && claim.claimTarget.claimTargetId === this.claimTargetId && expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
async function readClaim(runtime: EditRuntime, claimTargetId: string): Promise<ExecutionClaim | null> {
  const claim = await readRecord(runtime, "execution_claim", ownedKey(claimTargetId, "execution_claim_target_v0"), ExecutionClaimSchema, "claim_record_corrupt");
  check(claim === null || claim.claimTarget.claimTargetId === claimTargetId, "claim_record_corrupt",
    "The record filed under this claim target names another target; the target stays consumed.");
  return claim;
}
export interface AcquiredClaim { claim: ExecutionClaim; ownership: ClaimOwnership }
const ClaimRequestSchema = z.strictObject({ workerId: IdSchema });
/**
 * Acquires the exact Batch-1 claim target, atomically and durably. Exactly one caller acquires; every other caller, whatever
 * render computation, DAG or worker it presents, receives `claim_already_acquired` and must not dispatch. Acquisition is not
 * idempotent: a matching desired record never makes a second caller an owner.
 */
export async function acquireExecutionClaim(dagInput: ValidatedExecutionDag, requestInput: unknown, runtime: EditRuntime): Promise<AcquiredClaim> {
  const dag = requireValidated(dagInput);
  const request = parse(ClaimRequestSchema, requestInput);
  const registration = await authoritativeRegistration(runtime, dag);
  const claimedAt = runtimeNow(runtime);
  check(claimedAt >= dag.admission.admittedAt, "evidence_chronology_invalid", "Runtime-now precedes the admission it would claim.");
  // Causal order: a claim is never recorded before the registration it claims under, whatever the clock later reads.
  check(claimedAt >= registration.registeredAt, "evidence_chronology_invalid", "Runtime-now precedes the registration this claim would rest on.");
  checkGrantWindow(dag.grant, claimedAt);
  const token = guard("input_invalid", () => runtime.entropy.ownershipToken());
  check(typeof token === "string" && /^[a-f0-9]{64}$/.test(token), "input_invalid", "An ownership token is 256 bits of fresh entropy.");
  const target = dag.dag.dispatch.claimTarget;
  const claim = createExecutionClaim({ ...header("ExecutionClaim"), scope: dag.dag.scope, claimTarget: target,
    attemptRegistration: { registrationId: registration.registrationId, attemptSlotId: registration.attemptSlot.attemptSlotId },
    renderBinding: dag.dag.dispatch.renderBinding, dag: { dagId: dag.dag.dagId, artifact: dag.dagRef },
    admission: { admissionId: dag.admission.admissionId, artifact: dag.admissionRef }, executionGrant: { grantId: dag.grant.grantId, artifact: dag.grantRef },
    claimant: { workerId: request.workerId }, ownerProof: { scheme: "sha256_of_ephemeral_ownership_token_v0", digest: ownerDigest(token) },
    claimedAt, runtime: { implementation: RUNTIME_IMPLEMENTATION, durability: runtime.ledger.durability }, basis: "first_exclusive_publication_owns_claim_target_v0" });
  if (await publish(runtime, "execution_claim", ownedKey(target.claimTargetId, "execution_claim_target_v0"), claim) === "exists") {
    const existing = await readClaim(runtime, target.claimTargetId);
    check(existing !== null, "claim_record_corrupt", "The occupied claim target has no readable record; it stays consumed.");
    refuse("claim_already_acquired", "The claim target is already owned; this caller must not dispatch.");
  }
  const stored = await readClaim(runtime, target.claimTargetId);
  check(stored !== null && equal(stored, claim), "claim_record_corrupt", "The published claim does not read back exactly.");
  return { claim, ownership: new ClaimOwnership(OWNERSHIP, target.claimTargetId, claim.claimId, token) };
}
/** Reads the immutable winning claim, if any. Observation never yields ownership. */
export async function observeExecutionClaim(claimTargetId: string, runtime: EditRuntime): Promise<ExecutionClaim | null> {
  return readClaim(runtime, parse(IdSchema, claimTargetId));
}
/**
 * The claim-bound check every later Batch-2A step makes: the presented ownership proves the durable claim, the claim binds
 * this exact DAG, render computation, admission and grant, and the registration it names is still the authoritative winner.
 */
export async function verifyClaim(dag: ValidatedExecutionDag, runtime: EditRuntime, ownership: unknown): Promise<{ claim: ExecutionClaim; registration: AttemptRegistration }> {
  check(ClaimOwnership.is(ownership), "claim_ownership_required", "Only the caller that acquired the claim holds its ownership.");
  check(ownership.claimTargetId === dag.dag.dispatch.claimTarget.claimTargetId, "claim_mismatch", "The ownership is for another claim target.");
  const claim = await readClaim(runtime, ownership.claimTargetId);
  check(claim !== null, "claim_missing", "No claim for this target exists in this runtime ledger.");
  check(ownership.proves(claim), "claim_ownership_required", "The presented ownership does not prove the recorded claim.");
  check(equal(claim.scope, dag.dag.scope) && equal(claim.claimTarget, dag.dag.dispatch.claimTarget) && equal(claim.renderBinding, dag.dag.dispatch.renderBinding)
    && claim.dag.dagId === dag.dag.dagId && claim.admission.admissionId === dag.admission.admissionId && claim.executionGrant.grantId === dag.grant.grantId,
  "claim_mismatch", "The claim binds another DAG, render computation, admission or grant.");
  const registration = await readRegistration(runtime, dag.slot);
  check(registration !== null && registration.registrationId === claim.attemptRegistration.registrationId
    && registration.attemptSlot.attemptSlotId === claim.attemptRegistration.attemptSlotId, "reservation_not_authoritative",
  "The claim's registration is no longer the authoritative record of its logical attempt.");
  checkAuthoritative(dag, registration);
  return { claim, registration };
}
