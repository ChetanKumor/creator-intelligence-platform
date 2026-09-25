/**
 * DispatchPreparation: the short-lived, claim-bound statement that every runtime authority check passed at one runtime-now
 * instant, over exactly the staged bytes a future renderer may consume. It exists only when the replay-validated DAG, the
 * authoritative registration, the owned claim, the current execution and media grants, one verified staged object per
 * admitted source, a post-stage lifecycle observation per source and post-claim capability and runtime rechecks all pass,
 * all fresh by the owner dispatch policy. Freshness is one exclusive rule, `observedAt <= now < observedAt + maxAge`, and
 * `validUntil` is bounded by every evidence freshness expiry as well as every authority window, so `preparedAt <= now < validUntil`
 * alone never admits evidence older than its policy. It holds no location, starts no media execution, accepts only synthetic
 * Batch-2A evidence and grades itself so. It is not a claim: an expired preparation releases nothing and needs new rechecks and a
 * new preparation.
 */
import { z } from "zod";
import { ArtifactRefSchema, compareText, equal, type ArtifactRef } from "../editorial/common.js";
import { MAX_RUNTIME_SOURCES, RuntimeArtifacts, check, freshUntil, header, isFresh, millisecondsOf, ownedKey, parse, parseCanonical, refuse,
  timestampAt } from "./common.js";
import { checkMediaGrantAt, requireCall, type RuntimeCall } from "./call.js";
import { checkGrantWindow, runtimeNow, verifyClaim } from "./ledger.js";
import type { StagedObjectLocation } from "./ports.js";
import { DispatchCapabilityRecheckSchema, DispatchPreparationSchema, DispatchRuntimeRecheckSchema, RuntimeDispatchPolicySchema, SYNTHETIC_EVIDENCE_GRADE,
  SYNTHETIC_TEST_PROVENANCE, SourceLifecycleObservationSchema, StagedSourceReceiptSchema, createDispatchPreparation, type DispatchPreparation,
  type SourceLifecycleObservation, type StagedSourceReceipt } from "./records.js";
import { verifyStagedObject } from "./staging.js";

const V = "0.1.0";
const HANDLE = Symbol("prepared-staged-source-handle");
/**
 * Execution-only: the verified staged object a future renderer may read, never the original source. It is produced only
 * after its receipt and bytes are verified, and it can never be serialized or persisted as authority.
 */
export class PreparedStagedSourceHandle {
  readonly #location: StagedObjectLocation;
  readonly assetId: string;
  readonly stagedObjectId: string;
  constructor(construction: symbol, assetId: string, stagedObjectId: string, location: StagedObjectLocation) {
    check(construction === HANDLE, "input_invalid", "A staged source handle is produced only by a verified preparation.");
    this.#location = location; this.assetId = assetId; this.stagedObjectId = stagedObjectId;
    Object.freeze(this);
  }
  get localPath(): string { return this.#location.localPath; }
  toJSON(): never { refuse("input_invalid", "An execution-only staged source handle is never serialized or persisted."); }
}
export interface PreparedDispatch { preparation: DispatchPreparation; stagedSources: PreparedStagedSourceHandle[] }
const RequestSchema = z.strictObject({ policy: ArtifactRefSchema, stagedSources: z.array(ArtifactRefSchema).min(1).max(MAX_RUNTIME_SOURCES),
  lifecycleObservations: z.array(ArtifactRefSchema).min(1).max(MAX_RUNTIME_SOURCES), capabilityRecheck: ArtifactRefSchema, runtimeRecheck: ArtifactRefSchema });
export type DispatchPreparationRequest = z.input<typeof RequestSchema>;

interface Located<T> { ref: ArtifactRef; value: T }
async function evaluate(call: RuntimeCall, requestInput: unknown, preparedAt: string): Promise<PreparedDispatch> {
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  const request = parse(RequestSchema, requestInput, "dispatch_preparation_invalid");
  const { claim, registration } = await verifyClaim(dag, runtime, ownership);
  const supplied = new RuntimeArtifacts(artifacts), scope = dag.dag.scope, now = millisecondsOf(preparedAt), admitted = dag.admission.sources;
  check(preparedAt >= claim.claimedAt, "evidence_chronology_invalid", "A preparation cannot precede the claim it is bound to.");

  // Current execution authority at runtime-now: the exact Batch-1 grants are rechecked, never rewritten.
  checkGrantWindow(dag.grant, preparedAt);
  for (const source of admitted) checkMediaGrantAt(dag, source.assetId, preparedAt);
  const policy = parseCanonical(RuntimeDispatchPolicySchema, supplied.exact(request.policy, "RuntimeDispatchPolicy", V, "dispatch_policy_invalid"), "dispatch_policy_invalid");
  check(equal(policy.scope, scope), "scope_mismatch", "A dispatch policy for another project, creator or purpose never governs this preparation.");
  const syntheticOnly = (kind: string, what: string) => check(kind === SYNTHETIC_TEST_PROVENANCE, "evidence_provenance_unsupported",
    `Batch 2A accepts only synthetic, test-only ${what}; real provenance is never Batch-2A authority.`);

  // Exactly one verified staged object per admitted source, staged under this claim, re-verified in full now.
  const staged: Located<StagedSourceReceipt>[] = request.stagedSources.map(ref => ({ ref,
    value: parseCanonical(StagedSourceReceiptSchema, supplied.exact(ref, "StagedSourceReceipt", V, "staged_source_invalid", "staged_source_missing"), "staged_source_invalid") }));
  for (const { value: receipt } of staged) {
    check(equal(receipt.scope, scope), "scope_mismatch", "A staged source for another project, creator or purpose never authorizes this execution.");
    check(receipt.claim.claimId === claim.claimId && receipt.claim.claimTargetId === claim.claimTarget.claimTargetId && equal(receipt.attemptRegistration, claim.attemptRegistration)
      && equal(receipt.dag, claim.dag) && equal(receipt.admission, claim.admission), "claim_mismatch", "The staged source was staged under another claim or DAG.");
    const source = admitted.find(s => s.assetId === receipt.source.assetId);
    check(source !== undefined && equal(receipt.source.sourceAccessReceipt, source.receipt), "staged_source_invalid", "The staged source is not an admitted source of this DAG.");
    check(receipt.expected.contentHash === source.contentHash && receipt.expected.sizeBytes === source.sizeBytes, "staged_object_mismatch",
      "The staged object is not the admitted source's exact bytes.");
    check(receipt.stagingStartedAt >= claim.claimedAt && receipt.stagedAt >= receipt.stagingStartedAt, "evidence_chronology_invalid",
      "Staging cannot start before the claim, or complete before it starts.");
    check(receipt.stagedAt <= preparedAt, "evidence_postdates_preparation", "A staged source cannot postdate the preparation.");
  }
  check(new Set(staged.map(s => s.value.source.assetId)).size === staged.length, "staged_source_invalid", "Exactly one staged source per admitted source.");
  for (const source of admitted) check(staged.some(s => s.value.source.assetId === source.assetId), "staged_source_missing", `No staged source for ${source.assetId}.`);
  for (const { value: receipt } of staged) await verifyStagedObject(runtime, receipt.expected);
  const stagedFor = (assetId: string) => staged.find(s => s.value.source.assetId === assetId)!;

  // A post-stage current lifecycle observation per source: after the claim, after its staging, fresh, not deleted, not expired.
  const observations: Located<SourceLifecycleObservation>[] = request.lifecycleObservations.map(ref => ({ ref,
    value: parseCanonical(SourceLifecycleObservationSchema, supplied.exact(ref, "SourceLifecycleObservation", V, "lifecycle_observation_invalid", "lifecycle_observation_missing"),
      "lifecycle_observation_invalid") }));
  for (const { value: observation } of observations) {
    check(equal(observation.scope, scope), "scope_mismatch", "A lifecycle observation for another project, creator or purpose never authorizes this execution.");
    check(observation.claim.claimId === claim.claimId && observation.claim.claimTargetId === claim.claimTarget.claimTargetId, "claim_mismatch",
      "The lifecycle observation belongs to another claim.");
    syntheticOnly(observation.observer.kind, "lifecycle observations");
    const source = admitted.find(s => s.assetId === observation.source.assetId);
    check(source !== undefined && observation.source.contentHash === source.contentHash && equal(observation.source.mediaAsset, source.mediaAsset)
      && equal(observation.source.sourceAccessReceipt, source.receipt), "lifecycle_observation_invalid", "The lifecycle observation is not of an admitted source's exact identity.");
    const receipt = stagedFor(source.assetId).value;
    check(observation.stagedSource.stagedSourceReceiptId === receipt.stagedSourceReceiptId && observation.stagedSource.stagedAt === receipt.stagedAt,
      "lifecycle_observation_invalid", "The lifecycle observation was made for another staged source.");
    // Causal bounds on the check window, then the exclusive freshness window of the observation instant itself.
    check(observation.checkStartedAt >= claim.claimedAt, "lifecycle_stale", "A lifecycle check begun before the claim is not dispatch-time evidence.");
    check(observation.checkStartedAt >= receipt.stagedAt, "lifecycle_stale", "A lifecycle check begun before staging completed is not dispatch-time evidence.");
    check(observation.checkCompletedAt <= preparedAt, "evidence_postdates_preparation", "A lifecycle observation cannot postdate the preparation.");
    check(isFresh(observation.observedAt, policy.freshness.maxLifecycleObservationAgeMilliseconds, preparedAt), "lifecycle_stale",
      "The lifecycle observation is outside its freshness window.");
    check(observation.lifecycle.deletionRequestedAt === null, "lifecycle_deleted", "Deletion of the source has been requested.");
    check(observation.lifecycle.expiresAt === null || preparedAt < observation.lifecycle.expiresAt, "lifecycle_expired", "The source's retention has expired.");
    supplied.scoped(observation.evidence, scope, "lifecycle_observation_invalid");
  }
  check(new Set(observations.map(o => o.value.source.assetId)).size === observations.length, "lifecycle_observation_invalid", "Exactly one lifecycle observation per source.");
  for (const source of admitted) check(observations.some(o => o.value.source.assetId === source.assetId), "lifecycle_observation_missing",
    `No post-stage lifecycle observation for ${source.assetId}.`);

  // Post-claim capability recheck: this claim and render, the admitted executor build and environment, fresh and AVAILABLE for exactly the admitted requirements.
  const capability = parseCanonical(DispatchCapabilityRecheckSchema, supplied.exact(request.capabilityRecheck, "DispatchCapabilityRecheck", V, "capability_recheck_invalid",
    "capability_recheck_missing"), "capability_recheck_invalid");
  check(equal(capability.scope, scope), "scope_mismatch", "A capability recheck for another scope never authorizes this execution.");
  check(capability.claim.claimId === claim.claimId && capability.claim.claimTargetId === claim.claimTarget.claimTargetId && equal(capability.dag, claim.dag)
    && capability.renderComputationId === claim.renderBinding.renderComputationId, "claim_mismatch", "The capability recheck belongs to another claim or render computation.");
  syntheticOnly(capability.checker.kind, "capability rechecks");
  check(equal(capability.executor, dag.admission.executor) && capability.environment === dag.admission.environment, "capability_recheck_mismatch",
    "The capability recheck observed another executor build or environment.");
  check(capability.checkStartedAt >= claim.claimedAt, "capability_recheck_stale", "Capability evidence from before the claim is never a post-claim recheck.");
  check(capability.checkCompletedAt <= preparedAt, "evidence_postdates_preparation", "A capability recheck cannot postdate the preparation.");
  check(isFresh(capability.observedAt, policy.freshness.maxCapabilityRecheckAgeMilliseconds, preparedAt), "capability_recheck_stale",
    "The capability recheck is outside its freshness window.");
  check(capability.outcome.state === "available", "capability_recheck_unavailable", `The post-claim capability recheck is ${capability.outcome.state}.`);
  const requirementKey = (r: { requirementId: string; capabilityId: string }) => `${r.requirementId}|${r.capabilityId}`;
  check(equal(capability.outcome.requirements.map(requirementKey).sort(compareText), dag.admission.capability.requirements.map(requirementKey).sort(compareText)),
    "capability_recheck_mismatch", "The capability recheck covers another requirement set than the admission.");
  supplied.scoped(capability.outcome.evidence, scope, "capability_recheck_invalid");

  // Post-claim runtime recheck: the admitted executor, runtime build, environment and exact encoding, intent and profile.
  const runtimeCheck = parseCanonical(DispatchRuntimeRecheckSchema, supplied.exact(request.runtimeRecheck, "DispatchRuntimeRecheck", V, "runtime_recheck_invalid",
    "runtime_recheck_missing"), "runtime_recheck_invalid");
  check(equal(runtimeCheck.scope, scope), "scope_mismatch", "A runtime recheck for another scope never authorizes this execution.");
  check(runtimeCheck.claim.claimId === claim.claimId && runtimeCheck.claim.claimTargetId === claim.claimTarget.claimTargetId && equal(runtimeCheck.dag, claim.dag)
    && runtimeCheck.renderComputationId === claim.renderBinding.renderComputationId, "claim_mismatch", "The runtime recheck belongs to another claim or render computation.");
  syntheticOnly(runtimeCheck.checker.kind, "runtime rechecks");
  check(equal(runtimeCheck.executor, dag.admission.executor) && runtimeCheck.environment === dag.admission.environment && equal(runtimeCheck.runtime, dag.admission.runtime.identity)
    && equal(runtimeCheck.encoding, { video: dag.dag.settings.video, audio: dag.dag.settings.audio }) && runtimeCheck.renderIntent === dag.dag.renderIntent
    && equal(runtimeCheck.renderProfile, dag.dag.renderProfile), "runtime_recheck_mismatch",
  "The runtime recheck observed another executor, environment, runtime build, encoding, intent or profile.");
  check(runtimeCheck.checkStartedAt >= claim.claimedAt, "runtime_recheck_stale", "Runtime evidence from before the claim is never a post-claim recheck.");
  check(runtimeCheck.checkCompletedAt <= preparedAt, "evidence_postdates_preparation", "A runtime recheck cannot postdate the preparation.");
  check(isFresh(runtimeCheck.observedAt, policy.freshness.maxRuntimeRecheckAgeMilliseconds, preparedAt), "runtime_recheck_stale",
    "The runtime recheck is outside its freshness window.");
  check(runtimeCheck.outcome.state === "available", "runtime_recheck_unavailable", `The post-claim runtime recheck is ${runtimeCheck.outcome.state}.`);
  supplied.scoped(runtimeCheck.outcome.evidence, scope, "runtime_recheck_invalid");

  // Never outlive an authority or freshness window: the policy lifetime, the execution grant, every media grant, every retention
  // bound, and the exclusive freshness expiry of every lifecycle observation and of both rechecks.
  const lifecycleFreshUntil = (o: SourceLifecycleObservation) => freshUntil(o.observedAt, policy.freshness.maxLifecycleObservationAgeMilliseconds);
  const capabilityFreshUntil = freshUntil(capability.observedAt, policy.freshness.maxCapabilityRecheckAgeMilliseconds);
  const runtimeFreshUntil = freshUntil(runtimeCheck.observedAt, policy.freshness.maxRuntimeRecheckAgeMilliseconds);
  const bounds = [now + policy.preparationLifetimeMilliseconds, ...[dag.grant.expiresAt, ...dag.mediaGrants.map(m => m.value.expiresAt),
    ...observations.map(o => o.value.lifecycle.expiresAt), ...observations.map(o => lifecycleFreshUntil(o.value)), capabilityFreshUntil, runtimeFreshUntil]
    .filter((at): at is string => at !== null).map(millisecondsOf)];
  const validUntil = timestampAt(Math.min(...bounds));
  check(validUntil > preparedAt, "dispatch_preparation_expired", "No authority or freshness window remains open for a preparation.");

  const sources = admitted.map(source => {
    const receipt = stagedFor(source.assetId), observation = observations.find(o => o.value.source.assetId === source.assetId)!;
    const media = dag.mediaGrants.find(m => m.assetId === source.assetId)!;
    return { assetId: source.assetId, contentHash: source.contentHash, sizeBytes: source.sizeBytes, stagedObjectId: receipt.value.stagedObject.stagedObjectId,
      stagedSource: { stagedSourceReceiptId: receipt.value.stagedSourceReceiptId, artifact: receipt.ref, stagedAt: receipt.value.stagedAt },
      lifecycle: { observationId: observation.value.observationId, artifact: observation.ref, observedAt: observation.value.observedAt,
        freshUntil: lifecycleFreshUntil(observation.value), provenance: observation.value.observer.kind },
      mediaGrant: { grantId: media.value.grantId, artifact: media.ref } };
  });
  const preparation = createDispatchPreparation({ ...header("DispatchPreparation"), scope,
    attemptRegistration: { registrationId: registration.registrationId, attemptSlotId: registration.attemptSlot.attemptSlotId },
    claim: { claimId: claim.claimId, claimTargetId: claim.claimTarget.claimTargetId, claimedAt: claim.claimedAt }, claimTarget: claim.claimTarget,
    dag: claim.dag, admission: claim.admission, executionGrant: claim.executionGrant, renderComputationId: claim.renderBinding.renderComputationId,
    renderIntent: dag.dag.renderIntent, renderProfile: dag.dag.renderProfile, executor: dag.admission.executor, runtime: dag.admission.runtime.identity,
    environment: dag.admission.environment, policy: { policyId: policy.policyId, artifact: request.policy }, sources,
    capabilityRecheck: { recheckId: capability.recheckId, artifact: request.capabilityRecheck, observedAt: capability.observedAt, freshUntil: capabilityFreshUntil,
      provenance: capability.checker.kind },
    runtimeRecheck: { recheckId: runtimeCheck.recheckId, artifact: request.runtimeRecheck, observedAt: runtimeCheck.observedAt, freshUntil: runtimeFreshUntil,
      provenance: runtimeCheck.checker.kind },
    // Only synthetic evidence reaches this point in Batch 2A, so only the synthetic grade can be produced.
    preparedAt, validUntil, validity: "prepared_at_inclusive_valid_until_exclusive_v0", evidenceGrade: SYNTHETIC_EVIDENCE_GRADE,
    mediaExecution: "not_started", publicContracts: "none_emitted_no_plan_render_result_qc_result_decision_event_or_confidence",
    basis: "claim_bound_post_stage_dispatch_preparation_v0" });
  const stagedSources = sources.map(s => new PreparedStagedSourceHandle(HANDLE, s.assetId, s.stagedObjectId, runtime.staging.locate(ownedKey(s.stagedObjectId, "staged_source_object_v0"))));
  return { preparation, stagedSources };
}

/** Prepares dispatch at runtime-now, read from the runtime's own clock. */
export async function prepareDispatch(call: RuntimeCall, request: DispatchPreparationRequest): Promise<PreparedDispatch> {
  return evaluate(call, request, runtimeNow(requireCall(call).runtime));
}
async function replayed(call: RuntimeCall, input: unknown): Promise<PreparedDispatch> {
  const preparation = parse(DispatchPreparationSchema, input, "dispatch_preparation_invalid");
  const replay = await evaluate(call, { policy: preparation.policy.artifact, stagedSources: preparation.sources.map(s => s.stagedSource.artifact),
    lifecycleObservations: preparation.sources.map(s => s.lifecycle.artifact), capabilityRecheck: preparation.capabilityRecheck.artifact,
    runtimeRecheck: preparation.runtimeRecheck.artifact }, preparation.preparedAt);
  check(equal(replay.preparation, preparation), "dispatch_preparation_replay_mismatch", "The preparation contradicts deterministic replay from its own evidence at its own instant.");
  return replay;
}
/**
 * Deterministic semantic replay at the preparation's own instant: the ledger, the staged bytes and every binding are
 * re-read and re-verified, so a coordinated rewrite and re-identification of any binding fails.
 */
export async function replayDispatchPreparation(call: RuntimeCall, preparation: unknown): Promise<DispatchPreparation> {
  return (await replayed(call, preparation)).preparation;
}
/**
 * Replay, then the current-time rule `preparedAt <= now < validUntil` on the runtime clock. A later dispatcher must call this
 * again immediately before any media work; an expired preparation needs new post-claim rechecks and a new preparation.
 */
export async function confirmDispatchPreparationCurrent(call: RuntimeCall, preparation: unknown): Promise<PreparedDispatch> {
  const current = await replayed(call, preparation);
  const now = runtimeNow(requireCall(call).runtime);
  check(current.preparation.preparedAt <= now && now < current.preparation.validUntil, "dispatch_preparation_expired",
    "The dispatch preparation is not current; prepare again from new post-claim rechecks.");
  return current;
}
