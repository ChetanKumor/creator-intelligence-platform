/**
 * Claim-bound post-stage and post-claim evidence. Each check runs inside a window the runtime clock measures around the provider
 * call: it starts strictly after the claim it binds (and, for a lifecycle observation, after the staged source it binds), its
 * provider response is parsed as untrusted input, and it completes no earlier than it started. The record keeps the start, the
 * completion and the instant its observation applies, and says whether that instant was provider-reported or is the start's lower
 * bound. Batch 2A has no real lifecycle source, executor probe or runtime probe: it records only synthetic, test-only provenance,
 * and a provider claiming real provenance refuses. Pre-claim Batch-1 evidence is never relabeled into a post-claim observation.
 */
import type { z } from "zod";
import { equal } from "../editorial/common.js";
import { RUNTIME_IMPLEMENTATION, RuntimeArtifacts, check, guardAsync, header, parse, parseCanonical, type EditRuntimeErrorCode } from "./common.js";
import { requireCall, type RuntimeCall } from "./call.js";
import { runtimeNow, verifyClaim } from "./ledger.js";
import { CapabilityRecheckResponseSchema, LifecycleResponseSchema, RuntimeRecheckResponseSchema, type CapabilityRechecker, type EditRuntime, type LifecycleProvider,
  type RuntimeRechecker } from "./ports.js";
import { SYNTHETIC_TEST_PROVENANCE, StagedSourceReceiptSchema, createDispatchCapabilityRecheck, createDispatchRuntimeRecheck, createSourceLifecycleObservation,
  type DispatchCapabilityRecheck, type DispatchRuntimeRecheck, type SourceLifecycleObservation } from "./records.js";

const hasMethod = (value: unknown, method: string) => value !== null && typeof value === "object" && typeof (value as Record<string, unknown>)[method] === "function";
interface CheckTiming { checkStartedAt: string; observedAt: string; checkCompletedAt: string;
  observedAtBasis: "check_started_lower_bound" | "provider_reported_within_check_window" }
/**
 * One provider call inside a runtime-clock check window. The check starts no earlier than every causal lower bound; a clock that
 * runs backwards during the call refuses; a provider-reported instant must lie inside the window. Without one, the observation is
 * recorded at the check start, a conservative lower bound, and never presented as an exact observation instant.
 */
async function timedCheck<S extends z.ZodType<{ observedAt?: string | undefined }>>(runtime: EditRuntime, notBefore: readonly string[], schema: S,
  invalid: EditRuntimeErrorCode, run: () => Promise<unknown>): Promise<{ response: z.output<S>; timing: CheckTiming }> {
  const checkStartedAt = runtimeNow(runtime);
  check(notBefore.every(bound => checkStartedAt >= bound), "evidence_chronology_invalid",
    "A post-claim check starts only after its claim, and a lifecycle observation only after its staging.");
  const response = parse(schema, await guardAsync(invalid, run), invalid);
  const checkCompletedAt = runtimeNow(runtime);
  check(checkCompletedAt >= checkStartedAt, "evidence_chronology_invalid", "The runtime clock ran backwards during the check; no record is made.");
  const reported = response.observedAt;
  check(reported === undefined || (checkStartedAt <= reported && reported <= checkCompletedAt), "evidence_chronology_invalid",
    "A provider-reported observation instant must lie inside its check window.");
  return { response, timing: { checkStartedAt, observedAt: reported ?? checkStartedAt, checkCompletedAt,
    observedAtBasis: reported === undefined ? "check_started_lower_bound" : "provider_reported_within_check_window" } };
}
/** Batch 2A accepts only synthetic, test-only provenance: a real-looking provenance is never Batch-2A authority. */
function syntheticOnly(kind: string, what: string): void {
  check(kind === SYNTHETIC_TEST_PROVENANCE, "evidence_provenance_unsupported",
    `Batch 2A records only synthetic, test-only ${what}; real provenance needs the separately reviewed Batch-2B trusted adapter.`);
}

export async function observeSourceLifecycle(call: RuntimeCall, request: { stagedSource: unknown; provider: LifecycleProvider }): Promise<SourceLifecycleObservation> {
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  check(request !== null && typeof request === "object" && hasMethod(request.provider, "observe"), "input_invalid", "A lifecycle provider is required.");
  const { claim } = await verifyClaim(dag, runtime, ownership);
  const receipt = parseCanonical(StagedSourceReceiptSchema, request.stagedSource, "staged_source_invalid");
  check(receipt.claim.claimId === claim.claimId && receipt.claim.claimTargetId === claim.claimTarget.claimTargetId && equal(receipt.dag, claim.dag), "claim_mismatch",
    "The staged source was staged under another claim.");
  const source = dag.admission.sources.find(s => s.assetId === receipt.source.assetId);
  check(source !== undefined && equal(receipt.source.sourceAccessReceipt, source.receipt) && receipt.expected.contentHash === source.contentHash
    && receipt.expected.sizeBytes === source.sizeBytes, "staged_source_invalid", "The staged source is not an admitted source of this DAG.");
  const scope = dag.dag.scope;
  const { response, timing } = await timedCheck(runtime, [claim.claimedAt, receipt.stagedAt], LifecycleResponseSchema, "lifecycle_observation_invalid",
    () => request.provider.observe(structuredClone({ scope, assetId: source.assetId, contentHash: source.contentHash, mediaAsset: source.mediaAsset })));
  syntheticOnly(response.observer.kind, "lifecycle observations");
  check(equal(response.scope, scope), "scope_mismatch", "The lifecycle observation belongs to another project, creator or purpose.");
  check(response.assetId === source.assetId && response.contentHash === source.contentHash, "lifecycle_observation_invalid",
    "The lifecycle observation names another asset or content hash.");
  new RuntimeArtifacts(artifacts).scoped(response.evidence, scope, "lifecycle_observation_invalid");
  return createSourceLifecycleObservation({ ...header("SourceLifecycleObservation"), scope, claim: receipt.claim,
    stagedSource: { stagedSourceReceiptId: receipt.stagedSourceReceiptId, stagedAt: receipt.stagedAt },
    source: { assetId: source.assetId, contentHash: source.contentHash, mediaAsset: source.mediaAsset, sourceAccessReceipt: source.receipt },
    lifecycle: response.lifecycle, ...timing, observer: response.observer, recorder: RUNTIME_IMPLEMENTATION, evidence: response.evidence,
    basis: "post_claim_post_stage_current_lifecycle_observation_v0" });
}

export async function recheckDispatchCapability(call: RuntimeCall, request: { checker: CapabilityRechecker }): Promise<DispatchCapabilityRecheck> {
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  check(request !== null && typeof request === "object" && hasMethod(request.checker, "recheck"), "input_invalid", "A capability rechecker is required.");
  const { claim } = await verifyClaim(dag, runtime, ownership);
  const scope = dag.dag.scope, admission = dag.admission;
  const { response, timing } = await timedCheck(runtime, [claim.claimedAt], CapabilityRecheckResponseSchema, "capability_recheck_invalid",
    () => request.checker.recheck(structuredClone({ scope, executor: admission.executor, environment: admission.environment,
      requirements: admission.capability.requirements.map(r => ({ requirementId: r.requirementId, capabilityId: r.capabilityId })) })));
  syntheticOnly(response.checker.kind, "capability rechecks");
  new RuntimeArtifacts(artifacts).scoped(response.outcome.evidence, scope, "capability_recheck_invalid");
  return createDispatchCapabilityRecheck({ ...header("DispatchCapabilityRecheck"), scope, claim: { claimId: claim.claimId, claimTargetId: claim.claimTarget.claimTargetId },
    dag: claim.dag, renderComputationId: claim.renderBinding.renderComputationId, executor: response.executor, environment: response.environment, ...timing,
    checker: response.checker, recorder: RUNTIME_IMPLEMENTATION, outcome: response.outcome, basis: "post_claim_capability_recheck_v0" });
}

export async function recheckDispatchRuntime(call: RuntimeCall, request: { checker: RuntimeRechecker }): Promise<DispatchRuntimeRecheck> {
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  check(request !== null && typeof request === "object" && hasMethod(request.checker, "recheck"), "input_invalid", "A runtime rechecker is required.");
  const { claim } = await verifyClaim(dag, runtime, ownership);
  const scope = dag.dag.scope, admission = dag.admission, settings = dag.dag.settings;
  const { response, timing } = await timedCheck(runtime, [claim.claimedAt], RuntimeRecheckResponseSchema, "runtime_recheck_invalid",
    () => request.checker.recheck(structuredClone({ scope, executor: admission.executor, environment: admission.environment, runtime: admission.runtime.identity,
      encoding: { video: settings.video, audio: settings.audio }, renderIntent: dag.dag.renderIntent, renderProfile: dag.dag.renderProfile })));
  syntheticOnly(response.checker.kind, "runtime rechecks");
  new RuntimeArtifacts(artifacts).scoped(response.outcome.evidence, scope, "runtime_recheck_invalid");
  return createDispatchRuntimeRecheck({ ...header("DispatchRuntimeRecheck"), scope, claim: { claimId: claim.claimId, claimTargetId: claim.claimTarget.claimTargetId },
    dag: claim.dag, renderComputationId: claim.renderBinding.renderComputationId, executor: response.executor, environment: response.environment,
    runtime: response.runtime, encoding: response.encoding, renderIntent: response.renderIntent, renderProfile: response.renderProfile, ...timing,
    checker: response.checker, recorder: RUNTIME_IMPLEMENTATION, outcome: response.outcome, basis: "post_claim_runtime_recheck_v0" });
}
