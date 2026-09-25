/**
 * The strict, versioned, content-identified Batch-2A runtime records. Each record's ID hashes every other field, unknown
 * fields fail, declared sets are canonical, and no record holds a filesystem location, URL, command or executable name.
 * Records are immutable once created; persisted records are exactly their canonical JSON plus one newline.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { ArtifactRefSchema, checkIdentity, compareText, identify } from "../editorial/common.js";
import { HashSchema, OwnerSchema, evidenceSet } from "../edit-graph/common.js";
import { ExecutionExecutorIdentitySchema, LocationFreeVersionSchema, PositiveSafeInt, RenderIntentSchema } from "../edit-execution/common.js";
import { RuntimeEncodingSchema, RuntimeIdentitySchema } from "../edit-execution/runtime.js";
import { MAX_RUNTIME_EVIDENCE, MAX_RUNTIME_SOURCES, RuntimeImplementationSchema, ScopeSchema, StorageDurabilitySchema, envelope, parse } from "./common.js";

const Evidence = evidenceSet(MAX_RUNTIME_EVIDENCE, 1);
const RecorderSchema = z.strictObject({ implementation: RuntimeImplementationSchema, durability: StorageDurabilitySchema });

// ---------------------------------------------------------------- the logical attempt slot
/**
 * The uniqueness identity of one logical execution attempt: project, creator, operation and attempt only. Purpose, budget,
 * allocation, reservation, history and storage labels are bound by the winning registration but can never mint another slot.
 */
const SlotBodySchema = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, operationId: IdSchema, attempt: PositiveSafeInt });
export const AttemptSlotSchema = SlotBodySchema.extend({ attemptSlotId: IdSchema })
  .refine(v => checkIdentity(v, "attemptSlotId", "execution_attempt_slot_v0"), "Attempt slot identity mismatch.");
export type AttemptSlot = z.infer<typeof AttemptSlotSchema>;
export function attemptSlot(input: { projectId: string; creatorId: string; operationId: string; attempt: number }): AttemptSlot {
  const body = parse(SlotBodySchema, { projectId: input.projectId, creatorId: input.creatorId, operationId: input.operationId, attempt: input.attempt });
  return parse(AttemptSlotSchema, identify("execution_attempt_slot_v0", "attemptSlotId", body));
}

// ---------------------------------------------------------------- AttemptRegistration
const RegistrationBodySchema = z.strictObject({
  ...envelope("AttemptRegistration"), attemptSlot: AttemptSlotSchema, scope: ScopeSchema,
  budget: z.strictObject({ budgetId: IdSchema, executionBudget: ArtifactRefSchema }),
  allocation: z.strictObject({ budgetId: IdSchema, allocation: ArtifactRefSchema }),
  // The Gate-3 content identity is the reservation's semantic authority; the first artifact reference is provenance only.
  reservation: z.strictObject({ reservationId: IdSchema, history: ArtifactRefSchema, firstObservedArtifact: ArtifactRefSchema }),
  registeredAt: TimestampSchema, registrar: RecorderSchema,
  basis: z.literal("first_replay_valid_gate3_reservation_owns_attempt_slot_v0"),
});
export const AttemptRegistrationSchema = RegistrationBodySchema.extend({ registrationId: IdSchema })
  .refine(v => v.attemptSlot.projectId === v.scope.projectId && v.attemptSlot.creatorId === v.scope.creatorId, "The slot and the scope name another project or creator.")
  .refine(v => checkIdentity(v, "registrationId", "attempt_registration_v0"), "Attempt registration identity mismatch.");
export type AttemptRegistration = z.infer<typeof AttemptRegistrationSchema>;
export function createAttemptRegistration(body: unknown): AttemptRegistration {
  return parse(AttemptRegistrationSchema, identify("attempt_registration_v0", "registrationId", parse(RegistrationBodySchema, body)));
}

// ---------------------------------------------------------------- ExecutionClaim
export const ClaimTargetSchema = z.strictObject({ claimTargetId: IdSchema, reservationId: IdSchema, operationId: IdSchema, attempt: PositiveSafeInt })
  .refine(v => checkIdentity(v, "claimTargetId", "execution_claim_target_v0"), "Claim target identity mismatch.");
const RegistrationBindingSchema = z.strictObject({ registrationId: IdSchema, attemptSlotId: IdSchema });
const ClaimBindingSchema = z.strictObject({ claimId: IdSchema, claimTargetId: IdSchema });
const DagBindingSchema = z.strictObject({ dagId: IdSchema, artifact: ArtifactRefSchema });
const AdmissionBindingSchema = z.strictObject({ admissionId: IdSchema, artifact: ArtifactRefSchema });
const GrantBindingSchema = z.strictObject({ grantId: IdSchema, artifact: ArtifactRefSchema });
const ClaimBodySchema = z.strictObject({
  ...envelope("ExecutionClaim"), scope: ScopeSchema, claimTarget: ClaimTargetSchema, attemptRegistration: RegistrationBindingSchema,
  renderBinding: z.strictObject({ renderComputationId: IdSchema }),
  dag: DagBindingSchema, admission: AdmissionBindingSchema, executionGrant: GrantBindingSchema,
  claimant: z.strictObject({ workerId: IdSchema }),
  // Only the acquiring caller holds the ephemeral token whose digest this is; observing the claim never yields ownership.
  ownerProof: z.strictObject({ scheme: z.literal("sha256_of_ephemeral_ownership_token_v0"), digest: HashSchema }),
  claimedAt: TimestampSchema, runtime: RecorderSchema,
  basis: z.literal("first_exclusive_publication_owns_claim_target_v0"),
});
export const ExecutionClaimSchema = ClaimBodySchema.extend({ claimId: IdSchema })
  .refine(v => checkIdentity(v, "claimId", "execution_claim_v0"), "Execution claim identity mismatch.");
export type ExecutionClaim = z.infer<typeof ExecutionClaimSchema>;
export function createExecutionClaim(body: unknown): ExecutionClaim {
  return parse(ExecutionClaimSchema, identify("execution_claim_v0", "claimId", parse(ClaimBodySchema, body)));
}

// ---------------------------------------------------------------- content-addressed staged objects and their receipts
/** Semantic byte identity only: never a path, basename, mtime, filename, caller object ID or project path. Never access authorization. */
export function stagedObjectIdOf(expected: { contentHash: string; sizeBytes: number }): string {
  const body = parse(z.strictObject({ contentHash: HashSchema, sizeBytes: PositiveSafeInt }), { contentHash: expected.contentHash, sizeBytes: expected.sizeBytes });
  return identify("staged_source_object_v0", "stagedObjectId", { stagingVersion: "staged_source_object_v0", ...body }).stagedObjectId;
}
const StagedBodySchema = z.strictObject({
  ...envelope("StagedSourceReceipt"), scope: ScopeSchema, claim: ClaimBindingSchema, attemptRegistration: RegistrationBindingSchema,
  dag: DagBindingSchema, admission: AdmissionBindingSchema,
  source: z.strictObject({ assetId: IdSchema, sourceAccessReceipt: ArtifactRefSchema }),
  expected: z.strictObject({ contentHash: HashSchema, sizeBytes: PositiveSafeInt }),
  observed: z.strictObject({ contentHash: HashSchema, sizeBytes: PositiveSafeInt, hashScope: z.literal("exact_bytes_copied_from_one_opened_source_handle") }),
  stagedObject: z.strictObject({ stagedObjectId: IdSchema, publication: z.enum(["published_by_this_stage", "existing_object_reverified"]),
    verification: z.literal("reopened_final_object_full_sha256_and_size") }),
  // Both read from the runtime clock: when the claim-bound stage began (before any source work) and when it completed.
  staging: RecorderSchema, stagingStartedAt: TimestampSchema, stagedAt: TimestampSchema,
  basis: z.literal("claim_bound_same_handle_copy_hash_no_overwrite_publication_v0"),
});
export const StagedSourceReceiptSchema = StagedBodySchema.extend({ stagedSourceReceiptId: IdSchema })
  .refine(v => v.stagingStartedAt <= v.stagedAt, "A stage cannot complete before it starts.")
  .refine(v => v.observed.contentHash === v.expected.contentHash && v.observed.sizeBytes === v.expected.sizeBytes, "A staged receipt exists only for exactly the expected bytes.")
  .refine(v => v.stagedObject.stagedObjectId === stagedObjectIdOf(v.expected), "The staged object identity must derive from the expected bytes.")
  .refine(v => checkIdentity(v, "stagedSourceReceiptId", "staged_source_receipt_v0"), "Staged source receipt identity mismatch.");
export type StagedSourceReceipt = z.infer<typeof StagedSourceReceiptSchema>;
export function createStagedSourceReceipt(body: unknown): StagedSourceReceipt {
  return parse(StagedSourceReceiptSchema, identify("staged_source_receipt_v0", "stagedSourceReceiptId", parse(StagedBodySchema, body)));
}

// ---------------------------------------------------------------- evidence provenance and check timing
/**
 * Typed evidence provenance. The record contract can represent a truthful future real observation or probe, with exact
 * implementation identity; that is a contract shape only. Batch 2A records, and accepts for dispatch, only `synthetic_test`
 * provenance: a real-looking provenance from a provider or a caller refuses as `evidence_provenance_unsupported`, and only a
 * separately owner-reviewed Batch-2B trusted adapter may ever produce or accept a real variant.
 */
export const SYNTHETIC_TEST_PROVENANCE = "synthetic_test" as const;
export const LifecycleObserverSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(SYNTHETIC_TEST_PROVENANCE), observerId: IdSchema, version: LocationFreeVersionSchema,
    basis: z.literal("synthetic_test_lifecycle_provider_no_external_query_v0") }),
  z.strictObject({ kind: z.literal("real_authoritative_observation"), observerId: IdSchema, version: LocationFreeVersionSchema, implementationDigest: HashSchema,
    basis: z.literal("authoritative_media_lifecycle_record_query_v0") }),
]);
/**
 * When a check's observation applies. `checkStartedAt` and `checkCompletedAt` are read from the runtime clock around the provider
 * call; `observedAt` lies between them. A provider that reports its own instant is recorded as `provider_reported_within_check_window`;
 * one that reports none is recorded at the check start, the conservative lower bound (`check_started_lower_bound`), never as an
 * exact observation instant.
 */
export const OBSERVED_AT_BASES = ["check_started_lower_bound", "provider_reported_within_check_window"] as const;
const CheckTimingFields = { checkStartedAt: TimestampSchema, observedAt: TimestampSchema, checkCompletedAt: TimestampSchema, observedAtBasis: z.enum(OBSERVED_AT_BASES) };
const orderedCheck = (v: { checkStartedAt: string; observedAt: string; checkCompletedAt: string; observedAtBasis: string }) =>
  v.checkStartedAt <= v.observedAt && v.observedAt <= v.checkCompletedAt && (v.observedAtBasis !== "check_started_lower_bound" || v.observedAt === v.checkStartedAt);
const ORDERED_CHECK = "A check's observation instant lies inside its check window, and a lower-bound instant is the check start.";

// ---------------------------------------------------------------- post-stage source lifecycle observation
export const LifecycleStateSchema = z.strictObject({ deletionRequestedAt: TimestampSchema.nullable(), expiresAt: TimestampSchema.nullable() });
const LifecycleBodySchema = z.strictObject({
  ...envelope("SourceLifecycleObservation"), scope: ScopeSchema, claim: ClaimBindingSchema,
  stagedSource: z.strictObject({ stagedSourceReceiptId: IdSchema, stagedAt: TimestampSchema }),
  source: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, mediaAsset: ArtifactRefSchema, sourceAccessReceipt: ArtifactRefSchema }),
  lifecycle: LifecycleStateSchema, ...CheckTimingFields, observer: LifecycleObserverSchema, recorder: RuntimeImplementationSchema, evidence: Evidence,
  basis: z.literal("post_claim_post_stage_current_lifecycle_observation_v0"),
});
export const SourceLifecycleObservationSchema = LifecycleBodySchema.extend({ observationId: IdSchema })
  .refine(orderedCheck, ORDERED_CHECK)
  .refine(v => checkIdentity(v, "observationId", "source_lifecycle_observation_v0"), "Source lifecycle observation identity mismatch.");
export type SourceLifecycleObservation = z.infer<typeof SourceLifecycleObservationSchema>;
export function createSourceLifecycleObservation(body: unknown): SourceLifecycleObservation {
  return parse(SourceLifecycleObservationSchema, identify("source_lifecycle_observation_v0", "observationId", parse(LifecycleBodySchema, body)));
}

// ---------------------------------------------------------------- post-claim capability and runtime recheck seams (synthetic in Batch 2A)
const UNAVAILABLE_REASONS = ["unconfigured", "unverified", "resource_blocked", "permission_unavailable", "inaccessible"] as const;
const RequirementFindingsSchema = z.array(z.strictObject({ requirementId: IdSchema, capabilityId: IdSchema, state: z.literal("AVAILABLE") })).min(1).max(128)
  .refine(v => new Set(v.map(r => r.requirementId)).size === v.length, "Duplicate requirement.")
  .transform(v => [...v].sort((a, b) => compareText(a.requirementId, b.requirementId)));
export const CapabilityRecheckOutcomeSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("available"), requirements: RequirementFindingsSchema, evidence: Evidence }),
  z.strictObject({ state: z.literal("unavailable"), reasonCode: z.enum(UNAVAILABLE_REASONS), evidence: Evidence }),
  z.strictObject({ state: z.literal("failed"), failureCode: IdSchema, evidence: Evidence }),
]);
export const RuntimeRecheckOutcomeSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("available"), evidence: Evidence }),
  z.strictObject({ state: z.literal("unavailable"), reasonCode: z.enum(UNAVAILABLE_REASONS), evidence: Evidence }),
  z.strictObject({ state: z.literal("failed"), failureCode: IdSchema, evidence: Evidence }),
]);
/**
 * Batch 2A probes nothing: it records only `synthetic_test` rechecks. The `real_local_probe` variant is the Batch-2B contract shape
 * for a pinned local probe with exact implementation identity; Batch 2A never produces or accepts it.
 */
export const CapabilityCheckerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(SYNTHETIC_TEST_PROVENANCE), checkerId: IdSchema, version: LocationFreeVersionSchema,
    basis: z.literal("synthetic_test_capability_rechecker_no_real_executor_probe_v0") }),
  z.strictObject({ kind: z.literal("real_local_probe"), checkerId: IdSchema, version: LocationFreeVersionSchema, implementationDigest: HashSchema,
    basis: z.literal("pinned_local_executor_capability_probe_v0") }),
]);
export const RuntimeCheckerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(SYNTHETIC_TEST_PROVENANCE), checkerId: IdSchema, version: LocationFreeVersionSchema,
    basis: z.literal("synthetic_test_runtime_rechecker_no_real_runtime_probe_v0") }),
  z.strictObject({ kind: z.literal("real_local_probe"), checkerId: IdSchema, version: LocationFreeVersionSchema, implementationDigest: HashSchema,
    basis: z.literal("pinned_local_runtime_encoding_probe_v0") }),
]);
const CapabilityBodySchema = z.strictObject({
  ...envelope("DispatchCapabilityRecheck"), scope: ScopeSchema, claim: ClaimBindingSchema, dag: DagBindingSchema, renderComputationId: IdSchema,
  executor: ExecutionExecutorIdentitySchema, environment: IdSchema, ...CheckTimingFields, checker: CapabilityCheckerSchema, recorder: RuntimeImplementationSchema,
  outcome: CapabilityRecheckOutcomeSchema, basis: z.literal("post_claim_capability_recheck_v0"),
});
export const DispatchCapabilityRecheckSchema = CapabilityBodySchema.extend({ recheckId: IdSchema })
  .refine(orderedCheck, ORDERED_CHECK)
  .refine(v => checkIdentity(v, "recheckId", "dispatch_capability_recheck_v0"), "Dispatch capability recheck identity mismatch.");
export type DispatchCapabilityRecheck = z.infer<typeof DispatchCapabilityRecheckSchema>;
export function createDispatchCapabilityRecheck(body: unknown): DispatchCapabilityRecheck {
  return parse(DispatchCapabilityRecheckSchema, identify("dispatch_capability_recheck_v0", "recheckId", parse(CapabilityBodySchema, body)));
}
const RuntimeBodySchema = z.strictObject({
  ...envelope("DispatchRuntimeRecheck"), scope: ScopeSchema, claim: ClaimBindingSchema, dag: DagBindingSchema, renderComputationId: IdSchema,
  executor: ExecutionExecutorIdentitySchema, environment: IdSchema, runtime: RuntimeIdentitySchema, encoding: RuntimeEncodingSchema,
  renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema, ...CheckTimingFields, checker: RuntimeCheckerSchema, recorder: RuntimeImplementationSchema,
  outcome: RuntimeRecheckOutcomeSchema, basis: z.literal("post_claim_runtime_recheck_v0"),
});
export const DispatchRuntimeRecheckSchema = RuntimeBodySchema.extend({ recheckId: IdSchema })
  .refine(orderedCheck, ORDERED_CHECK)
  .refine(v => checkIdentity(v, "recheckId", "dispatch_runtime_recheck_v0"), "Dispatch runtime recheck identity mismatch.");
export type DispatchRuntimeRecheck = z.infer<typeof DispatchRuntimeRecheckSchema>;
export function createDispatchRuntimeRecheck(body: unknown): DispatchRuntimeRecheck {
  return parse(DispatchRuntimeRecheckSchema, identify("dispatch_runtime_recheck_v0", "recheckId", parse(RuntimeBodySchema, body)));
}

// ---------------------------------------------------------------- owner dispatch policy
/** Conservative maxima: a recheck is at most one minute old, and a preparation lives at most thirty seconds. */
export const MAX_RECHECK_AGE_MILLISECONDS = 60_000, MAX_PREPARATION_LIFETIME_MILLISECONDS = 30_000;
const PolicyBodySchema = z.strictObject({
  ...envelope("RuntimeDispatchPolicy"), scope: ScopeSchema, author: OwnerSchema,
  freshness: z.strictObject({
    maxCapabilityRecheckAgeMilliseconds: z.number().int().min(1).max(MAX_RECHECK_AGE_MILLISECONDS),
    maxRuntimeRecheckAgeMilliseconds: z.number().int().min(1).max(MAX_RECHECK_AGE_MILLISECONDS),
    maxLifecycleObservationAgeMilliseconds: z.number().int().min(1).max(MAX_RECHECK_AGE_MILLISECONDS),
  }),
  preparationLifetimeMilliseconds: z.number().int().min(1).max(MAX_PREPARATION_LIFETIME_MILLISECONDS),
});
export const RuntimeDispatchPolicySchema = PolicyBodySchema.extend({ policyId: IdSchema })
  .refine(v => checkIdentity(v, "policyId", "runtime_dispatch_policy_v0"), "Runtime dispatch policy identity mismatch.");
export type RuntimeDispatchPolicy = z.infer<typeof RuntimeDispatchPolicySchema>;
export function createRuntimeDispatchPolicy(input: unknown): RuntimeDispatchPolicy {
  return parse(RuntimeDispatchPolicySchema, identify("runtime_dispatch_policy_v0", "policyId", parse(PolicyBodySchema, input, "dispatch_policy_invalid")), "dispatch_policy_invalid");
}

// ---------------------------------------------------------------- DispatchPreparation
/**
 * The grade of a preparation's post-claim evidence. Batch 2A can only produce the synthetic grade. The real grade is the
 * Batch-2B contract shape, and it requires real provenance on every capability, runtime and lifecycle binding.
 */
export const SYNTHETIC_EVIDENCE_GRADE = "synthetic_post_claim_rechecks_not_real_probes_batch2a" as const;
export const EVIDENCE_GRADES = [SYNTHETIC_EVIDENCE_GRADE, "real_post_claim_probe_evidence_v0"] as const;
// Each evidence binding carries its exclusive freshness expiry (`observedAt` + the policy's maximum age) and its provenance kind.
const PreparedSourceSchema = z.strictObject({
  assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, stagedObjectId: IdSchema,
  stagedSource: z.strictObject({ stagedSourceReceiptId: IdSchema, artifact: ArtifactRefSchema, stagedAt: TimestampSchema }),
  lifecycle: z.strictObject({ observationId: IdSchema, artifact: ArtifactRefSchema, observedAt: TimestampSchema, freshUntil: TimestampSchema,
    provenance: z.enum([SYNTHETIC_TEST_PROVENANCE, "real_authoritative_observation"]) }),
  mediaGrant: GrantBindingSchema,
});
const RecheckBindingSchema = z.strictObject({ recheckId: IdSchema, artifact: ArtifactRefSchema, observedAt: TimestampSchema, freshUntil: TimestampSchema,
  provenance: z.enum([SYNTHETIC_TEST_PROVENANCE, "real_local_probe"]) });
type PreparationBody = z.infer<typeof PreparationBodySchema>;
const evidenceBindings = (v: PreparationBody) => [v.capabilityRecheck, v.runtimeRecheck, ...v.sources.map(s => s.lifecycle)];
/** The grade names exactly the provenance of every evidence binding: all synthetic, or all real. */
function gradeMatchesProvenance(v: PreparationBody): boolean {
  if (v.evidenceGrade === SYNTHETIC_EVIDENCE_GRADE) return evidenceBindings(v).every(b => b.provenance === SYNTHETIC_TEST_PROVENANCE);
  return v.capabilityRecheck.provenance === "real_local_probe" && v.runtimeRecheck.provenance === "real_local_probe"
    && v.sources.every(s => s.lifecycle.provenance === "real_authoritative_observation");
}
const PreparationBodySchema = z.strictObject({
  ...envelope("DispatchPreparation"), scope: ScopeSchema, attemptRegistration: RegistrationBindingSchema,
  claim: z.strictObject({ claimId: IdSchema, claimTargetId: IdSchema, claimedAt: TimestampSchema }), claimTarget: ClaimTargetSchema,
  dag: DagBindingSchema, admission: AdmissionBindingSchema, executionGrant: GrantBindingSchema,
  renderComputationId: IdSchema, renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema,
  executor: ExecutionExecutorIdentitySchema, runtime: RuntimeIdentitySchema, environment: IdSchema,
  policy: z.strictObject({ policyId: IdSchema, artifact: ArtifactRefSchema }),
  sources: z.array(PreparedSourceSchema).min(1).max(MAX_RUNTIME_SOURCES)
    .refine(v => v.every((s, i) => i === 0 || compareText(v[i - 1]!.assetId, s.assetId) < 0), "Prepared sources are unique and in canonical asset order."),
  capabilityRecheck: RecheckBindingSchema, runtimeRecheck: RecheckBindingSchema,
  preparedAt: TimestampSchema, validUntil: TimestampSchema, validity: z.literal("prepared_at_inclusive_valid_until_exclusive_v0"),
  evidenceGrade: z.enum(EVIDENCE_GRADES),
  mediaExecution: z.literal("not_started"),
  publicContracts: z.literal("none_emitted_no_plan_render_result_qc_result_decision_event_or_confidence"),
  basis: z.literal("claim_bound_post_stage_dispatch_preparation_v0"),
});
export const DispatchPreparationSchema = PreparationBodySchema.extend({ preparationId: IdSchema })
  .refine(v => v.preparedAt < v.validUntil, "A preparation must end after it is prepared.")
  .refine(v => evidenceBindings(v).every(b => b.observedAt <= v.preparedAt && v.validUntil <= b.freshUntil),
    "A preparation never outlives the exclusive freshness window of any evidence it binds.")
  .refine(gradeMatchesProvenance, "The evidence grade must name exactly the provenance of every evidence binding.")
  .refine(v => checkIdentity(v, "preparationId", "dispatch_preparation_v0"), "Dispatch preparation identity mismatch.");
export type DispatchPreparation = z.infer<typeof DispatchPreparationSchema>;
export function createDispatchPreparation(body: unknown): DispatchPreparation {
  return parse(DispatchPreparationSchema, identify("dispatch_preparation_v0", "preparationId", parse(PreparationBodySchema, body, "dispatch_preparation_invalid")),
    "dispatch_preparation_invalid");
}
