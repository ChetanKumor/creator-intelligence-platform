/**
 * The Batch-2B permit binding: the serializable statement of exactly what one real execution would be authorized to do, made only
 * when every authority and every piece of real post-claim evidence holds at one runtime-now instant. It rechecks, through the
 * accepted Batch-2A mechanisms and never by rewriting them: claim ownership and registration authority, the execution and media
 * grant windows, and the full bytes of every staged object. It then checks every real-evidence record for binding, provenance,
 * outcome, causal chronology and exclusive freshness, and recompiles the RenderProgram. `validUntil` is the earliest of the permit
 * lifetime, every grant, retention and freshness expiry.
 *
 * A binding is data. It holds no location and starts nothing, and it is never itself executable: only the render adapter's
 * non-serializable ExecutablePermit, minted from live trusted handles, can reach a process.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { ArtifactRefSchema, checkIdentity, compareText, equal, identify } from "../editorial/common.js";
import { HashSchema, Nat, ScopeSchema } from "../edit-graph/common.js";
import { ExecutionExecutorIdentitySchema, PositiveSafeInt, RenderIntentSchema } from "../edit-execution/common.js";
import { RuntimeIdentitySchema } from "../edit-execution/runtime.js";
import { freshUntil, isFresh, millisecondsOf, timestampAt } from "../edit-runtime/common.js";
import { checkMediaGrantAt, requireCall, type RuntimeCall } from "../edit-runtime/call.js";
import { checkGrantWindow, runtimeNow, verifyClaim } from "../edit-runtime/ledger.js";
import { ClaimTargetSchema, type StagedSourceReceipt } from "../edit-runtime/records.js";
import { verifyStagedObject } from "../edit-runtime/staging.js";
import { RenderImplementationSchema, RENDER_IMPLEMENTATION, check, envelope, header, parse, parseCanonical, refuse, type EditRenderErrorCode } from "./common.js";
import { RenderProgramSchema, compileRenderProgram, type RenderProgram } from "./program.js";
import { FixtureLifecycleObservationSchema, RealCapabilityProbeSchema, RealExecutionPolicySchema, RealRuntimeProbeSchema, StagedInputConformanceSchema, stagedFor,
  type FixtureLifecycleObservation, type RealCapabilityProbe, type RealExecutionPolicy, type RealRuntimeProbe, type StagedInputConformance } from "./records.js";
import { RENDER_SEMANTICS_DIGEST } from "./semantics.js";

export interface RealEvidenceBundle {
  policy: RealExecutionPolicy;
  program: RenderProgram;
  runtimeProbe: RealRuntimeProbe;
  capabilityProbe: RealCapabilityProbe;
  staged: readonly StagedSourceReceipt[];
  lifecycle: readonly FixtureLifecycleObservation[];
  conformance: readonly StagedInputConformance[];
}
const Fresh = z.strictObject({ observedAt: TimestampSchema, freshUntil: TimestampSchema });
const BindingBodySchema = z.strictObject({
  ...envelope("ExecutablePermitBinding"), scope: ScopeSchema,
  attemptRegistration: z.strictObject({ registrationId: IdSchema, attemptSlotId: IdSchema }),
  claim: z.strictObject({ claimId: IdSchema, claimTargetId: IdSchema, claimedAt: TimestampSchema }), claimTarget: ClaimTargetSchema,
  logicalOperation: z.strictObject({ operationId: IdSchema, attempt: PositiveSafeInt }),
  dag: z.strictObject({ dagId: IdSchema, artifact: ArtifactRefSchema }), admission: z.strictObject({ admissionId: IdSchema, artifact: ArtifactRefSchema }),
  executionGrant: z.strictObject({ grantId: IdSchema, artifact: ArtifactRefSchema }), editGraph: z.strictObject({ editGraphId: IdSchema, revision: Nat, artifact: ArtifactRefSchema }),
  renderComputationId: IdSchema, renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema,
  executor: ExecutionExecutorIdentitySchema, runtime: RuntimeIdentitySchema, environment: IdSchema,
  program: z.strictObject({ programId: IdSchema, semanticsDigest: HashSchema }), policy: z.strictObject({ policyId: IdSchema }),
  reservation: z.strictObject({ reservationId: IdSchema, artifact: ArtifactRefSchema }),
  sources: z.array(z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, stagedObjectId: IdSchema, stagedSourceReceiptId: IdSchema,
    mediaGrantId: IdSchema, lifecycle: Fresh.extend({ observationId: IdSchema }), conformance: Fresh.extend({ conformanceId: IdSchema }) })).min(1).max(16)
    .refine(v => v.every((s, i) => i === 0 || compareText(v[i - 1]!.assetId, s.assetId) < 0), "Sources are unique and canonical."),
  runtimeProbe: Fresh.extend({ probeId: IdSchema, ffmpegSha256: HashSchema, ffprobeSha256: HashSchema }), capabilityProbe: Fresh.extend({ probeId: IdSchema }),
  authorizedAt: TimestampSchema, validUntil: TimestampSchema, validity: z.literal("authorized_at_inclusive_valid_until_exclusive_v0"),
  evidenceGrade: z.literal("real_post_claim_probe_evidence_v0"), lifecycleAuthority: z.literal("synthetic_fixture_registry_only_not_production_v0"),
  mediaExecution: z.literal("authorized_not_started"), recorder: RenderImplementationSchema, basis: z.literal("claim_bound_real_evidence_executable_permit_binding_v0"),
});
type BindingBody = z.infer<typeof BindingBodySchema>;
const freshness = (b: BindingBody) => [b.runtimeProbe, b.capabilityProbe, ...b.sources.flatMap(s => [s.lifecycle, s.conformance])];
export const ExecutablePermitBindingSchema = BindingBodySchema.extend({ bindingId: IdSchema })
  .refine(v => v.authorizedAt < v.validUntil, "A binding must end after it is made.")
  .refine(v => freshness(v).every(f => f.observedAt <= v.authorizedAt && v.validUntil <= f.freshUntil), "A binding never outlives any evidence's exclusive freshness window.")
  .refine(v => v.program.semanticsDigest === RENDER_SEMANTICS_DIGEST, "The binding names the current executor semantics.")
  .refine(v => checkIdentity(v, "bindingId", "executable_permit_binding_v0"), "Executable permit binding identity mismatch.");
export type ExecutablePermitBinding = z.infer<typeof ExecutablePermitBindingSchema>;

interface Timed { claim: { claimId: string; claimTargetId: string }; checkStartedAt: string; observedAt: string; checkCompletedAt: string }
/** Claim binding, causal lower bounds, no postdating, and the exclusive freshness window, in that order. */
function timely(record: Timed, claim: { claimId: string; claimTarget: { claimTargetId: string }; claimedAt: string }, notBefore: readonly string[], now: string,
  maxAge: number, stale: EditRenderErrorCode): string {
  check(record.claim.claimId === claim.claimId && record.claim.claimTargetId === claim.claimTarget.claimTargetId, "claim_mismatch", "The evidence belongs to another claim.");
  check([claim.claimedAt, ...notBefore].every(bound => record.checkStartedAt >= bound), stale, "Evidence begun before its claim or staging is not post-claim evidence.");
  check(record.checkCompletedAt <= now, "evidence_chronology_invalid", "Evidence cannot postdate the permit binding.");
  check(isFresh(record.observedAt, maxAge, now), stale, "The evidence is outside its exclusive freshness window.");
  return freshUntil(record.observedAt, maxAge);
}
/** Evaluates complete real evidence at runtime-now and returns the permit binding, or refuses with one owned code. */
export async function evaluateRealExecutionEvidence(call: RuntimeCall, evidence: RealEvidenceBundle): Promise<ExecutablePermitBinding> {
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  const { claim, registration } = await verifyClaim(dag, runtime, ownership);
  const now = runtimeNow(runtime);
  check(now >= claim.claimedAt, "evidence_chronology_invalid", "A permit binding cannot precede its claim.");
  checkGrantWindow(dag.grant, now);
  for (const source of dag.admission.sources) checkMediaGrantAt(dag, source.assetId, now);
  check(evidence !== null && typeof evidence === "object", "input_invalid", "A complete evidence bundle is required.");
  const policy = parseCanonical(RealExecutionPolicySchema, evidence.policy, "policy_invalid");
  check(equal(policy.scope, dag.dag.scope), "scope_mismatch", "A policy for another scope never governs this execution.");
  const f = policy.freshness, admitted = dag.admission.sources;

  // The program is exactly deterministic compilation from this validated DAG.
  const program = parseCanonical(RenderProgramSchema, evidence.program, "render_program_invalid");
  check(equal(program, compileRenderProgram(dag, artifacts)), "render_program_mismatch", "The program is not the deterministic compilation of this DAG.");

  // Exactly one staged object per admitted source, staged under this claim, re-verified in full now.
  check(Array.isArray(evidence.staged) && evidence.staged.length <= admitted.length, "staged_source_invalid", "At most one staged source per admitted source.");
  const staged = evidence.staged.map(s => stagedFor(dag, claim, s));
  for (const s of staged) check(s.stagedAt <= now, "evidence_chronology_invalid", "A staged source cannot postdate the permit binding.");
  check(new Set(staged.map(s => s.source.assetId)).size === staged.length, "staged_source_invalid", "Exactly one staged source per admitted source.");
  for (const source of admitted) check(staged.some(s => s.source.assetId === source.assetId), "staged_source_missing", "Every admitted source must be staged.");
  for (const s of staged) await verifyStagedObject(runtime, s.expected);
  const stagedOf = (assetId: string) => staged.find(s => s.source.assetId === assetId)!;

  // The real pinned runtime probe: this claim, available, and exactly the admitted executor, environment and runtime.
  const runtimeProbe = parseCanonical(RealRuntimeProbeSchema, evidence.runtimeProbe, "runtime_probe_invalid");
  check(runtimeProbe.claim.claimId === claim.claimId && runtimeProbe.dag.dagId === dag.dag.dagId && runtimeProbe.renderComputationId === claim.renderBinding.renderComputationId,
    "claim_mismatch", "The runtime probe belongs to another claim, DAG or render computation.");
  if (runtimeProbe.outcome.state !== "available") refuse(runtimeProbe.outcome.reasonCode, "The real runtime probe did not find the pinned runtime available.");
  check(equal(runtimeProbe.executor, dag.admission.executor) && runtimeProbe.environment === dag.admission.environment && equal(runtimeProbe.runtime, dag.admission.runtime.identity)
    && equal(runtimeProbe.encoding, { video: dag.dag.settings.video, audio: dag.dag.settings.audio }), "runtime_probe_mismatch",
  "The runtime probe observed another executor, environment, runtime build or encoding.");
  const runtimeFresh = timely(runtimeProbe, claim, [], now, f.maxRuntimeProbeAgeMilliseconds, "runtime_probe_stale");

  // The real capability probe: every admitted requirement available on this executor, environment and runtime.
  const capability = parseCanonical(RealCapabilityProbeSchema, evidence.capabilityProbe, "capability_probe_invalid");
  check(capability.claim.claimId === claim.claimId && capability.dag.dagId === dag.dag.dagId && capability.renderComputationId === claim.renderBinding.renderComputationId,
    "claim_mismatch", "The capability probe belongs to another claim, DAG or render computation.");
  check(capability.outcome.state === "available", "capability_unavailable", "A required capability is unavailable on the pinned runtime under the V0 semantics.");
  check(equal(capability.executor, dag.admission.executor) && capability.environment === dag.admission.environment && equal(capability.runtime, dag.admission.runtime.identity),
    "capability_probe_mismatch", "The capability probe observed another executor, environment or runtime.");
  const key = (r: { requirementId: string; capabilityId: string }) => `${r.requirementId}|${r.capabilityId}`;
  check(equal(capability.findings.map(key).sort(compareText), dag.admission.capability.requirements.map(key).sort(compareText)), "capability_probe_mismatch",
    "The capability probe covers another requirement set than the admission.");
  const capabilityFresh = timely(capability, claim, [], now, f.maxCapabilityProbeAgeMilliseconds, "capability_probe_stale");

  // One real fixture-registry lifecycle observation per source, after its staging: fresh, not deleted, not expired.
  check(Array.isArray(evidence.lifecycle), "lifecycle_observation_invalid", "Lifecycle observations are a list.");
  const lifecycle = evidence.lifecycle.map(o => parseCanonical(FixtureLifecycleObservationSchema, o, "lifecycle_observation_invalid"));
  check(new Set(lifecycle.map(o => o.source.assetId)).size === lifecycle.length, "lifecycle_observation_invalid", "Exactly one lifecycle observation per source.");
  const lifecycleFresh = new Map<string, string>();
  for (const source of admitted) {
    const o = lifecycle.find(l => l.source.assetId === source.assetId);
    check(o !== undefined, "lifecycle_observation_missing", "Every admitted source needs a post-stage lifecycle observation.");
    const receipt = stagedOf(source.assetId);
    check(equal(o.scope, dag.dag.scope) && o.source.contentHash === source.contentHash && equal(o.source.mediaAsset, source.mediaAsset) && equal(o.source.sourceAccessReceipt, source.receipt)
      && o.stagedSource.stagedSourceReceiptId === receipt.stagedSourceReceiptId && o.stagedSource.stagedAt === receipt.stagedAt, "lifecycle_observation_invalid",
    "The lifecycle observation is not of this source's exact identity and staging.");
    lifecycleFresh.set(source.assetId, timely(o, claim, [receipt.stagedAt], now, f.maxLifecycleObservationAgeMilliseconds, "lifecycle_stale"));
    check(o.lifecycle.deletionRequestedAt === null, "lifecycle_deleted", "Deletion of the source has been requested.");
    check(o.lifecycle.expiresAt === null || now < o.lifecycle.expiresAt, "lifecycle_expired", "The source's retention has expired.");
  }
  check(lifecycle.length === admitted.length, "lifecycle_observation_invalid", "No lifecycle observation of an unadmitted source.");

  // One conforming staged-input probe per source, of exactly this program input and staging.
  check(Array.isArray(evidence.conformance), "input_conformance_invalid", "Conformance records are a list.");
  const conformance = evidence.conformance.map(c => parseCanonical(StagedInputConformanceSchema, c, "input_conformance_invalid"));
  const conformanceFresh = new Map<string, string>();
  for (const source of admitted) {
    const c = conformance.find(r => r.source.assetId === source.assetId);
    check(c !== undefined, "input_conformance_missing", "Every admitted source needs a staged-input conformance probe.");
    const receipt = stagedOf(source.assetId), slot = program.inputs.find(i => i.assetId === source.assetId)!;
    check(equal(c.scope, dag.dag.scope) && c.dag.dagId === dag.dag.dagId && c.stagedSource.stagedSourceReceiptId === receipt.stagedSourceReceiptId && c.stagedSource.stagedAt === receipt.stagedAt
      && c.program.programId === program.programId && c.program.input === slot.input && equal(c.expected, { video: slot.video, audio: slot.audio })
      && c.source.stagedObjectId === slot.stagedObjectId, "input_conformance_invalid", "The conformance record is not of this program input and staging.");
    check(c.outcome.state === "conforms", "input_conformance_failed", "The staged bytes do not conform to what the program assumes of them.");
    conformanceFresh.set(source.assetId, timely(c, claim, [receipt.stagedAt], now, f.maxInputConformanceAgeMilliseconds, "input_conformance_stale"));
  }
  check(conformance.length === admitted.length, "input_conformance_invalid", "No conformance record of an unadmitted source.");

  // Never outlive an authority, retention or freshness window.
  const bounds = [millisecondsOf(now) + policy.permitLifetimeMilliseconds, ...[dag.grant.expiresAt, ...dag.mediaGrants.map(m => m.value.expiresAt),
    ...lifecycle.map(o => o.lifecycle.expiresAt), runtimeFresh, capabilityFresh, ...lifecycleFresh.values(), ...conformanceFresh.values()]
    .filter((at): at is string => at !== null).map(millisecondsOf)];
  const validUntil = timestampAt(Math.min(...bounds));
  check(validUntil > now, "permit_expired", "No authority or freshness window remains open.");
  const reservation = dag.admission.budget;
  const body: BindingBody = { ...header("ExecutablePermitBinding"), scope: dag.dag.scope,
    attemptRegistration: { registrationId: registration.registrationId, attemptSlotId: registration.attemptSlot.attemptSlotId },
    claim: { claimId: claim.claimId, claimTargetId: claim.claimTarget.claimTargetId, claimedAt: claim.claimedAt }, claimTarget: claim.claimTarget,
    logicalOperation: { operationId: dag.admission.operationId, attempt: dag.admission.attempt }, dag: claim.dag, admission: claim.admission, executionGrant: claim.executionGrant,
    editGraph: { editGraphId: dag.dag.graph.editGraphId, revision: dag.dag.graph.revision, artifact: dag.dag.editGraph }, renderComputationId: claim.renderBinding.renderComputationId,
    renderIntent: dag.dag.renderIntent, renderProfile: dag.dag.renderProfile, executor: dag.admission.executor, runtime: dag.admission.runtime.identity,
    environment: dag.admission.environment, program: { programId: program.programId, semanticsDigest: program.semantics.digest }, policy: { policyId: policy.policyId },
    reservation: { reservationId: reservation.reservationId, artifact: reservation.reservation },
    sources: admitted.map(source => {
      const receipt = stagedOf(source.assetId), o = lifecycle.find(l => l.source.assetId === source.assetId)!, c = conformance.find(r => r.source.assetId === source.assetId)!;
      return { assetId: source.assetId, contentHash: source.contentHash, sizeBytes: source.sizeBytes, stagedObjectId: receipt.stagedObject.stagedObjectId,
        stagedSourceReceiptId: receipt.stagedSourceReceiptId, mediaGrantId: dag.mediaGrants.find(m => m.assetId === source.assetId)!.value.grantId,
        lifecycle: { observationId: o.observationId, observedAt: o.observedAt, freshUntil: lifecycleFresh.get(source.assetId)! },
        conformance: { conformanceId: c.conformanceId, observedAt: c.observedAt, freshUntil: conformanceFresh.get(source.assetId)! } };
    }).sort((a, b) => compareText(a.assetId, b.assetId)),
    runtimeProbe: { probeId: runtimeProbe.probeId, observedAt: runtimeProbe.observedAt, freshUntil: runtimeFresh, ffmpegSha256: runtimeProbe.binaries.ffmpeg.sha256,
      ffprobeSha256: runtimeProbe.binaries.ffprobe.sha256 },
    capabilityProbe: { probeId: capability.probeId, observedAt: capability.observedAt, freshUntil: capabilityFresh },
    authorizedAt: now, validUntil, validity: "authorized_at_inclusive_valid_until_exclusive_v0", evidenceGrade: "real_post_claim_probe_evidence_v0",
    lifecycleAuthority: "synthetic_fixture_registry_only_not_production_v0", mediaExecution: "authorized_not_started", recorder: RENDER_IMPLEMENTATION,
    basis: "claim_bound_real_evidence_executable_permit_binding_v0" };
  return parse(ExecutablePermitBindingSchema, identify("executable_permit_binding_v0", "bindingId", body), "input_invalid");
}
/** The current-time rule `authorizedAt <= now < validUntil`; `validUntil` itself is expired. */
export function confirmPermitBindingCurrent(input: ExecutablePermitBinding, now: string): ExecutablePermitBinding {
  const binding = parse(ExecutablePermitBindingSchema, input, "permit_required");
  check(binding.authorizedAt <= now && now < binding.validUntil, "permit_expired", "The permit is not current.");
  return binding;
}
