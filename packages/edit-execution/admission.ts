/**
 * ExecutionAdmission: the single fail-closed boundary between an accepted EditGraph and any attempt to render it. An
 * admission exists only when every Gate-7 Batch-1 rule passes against exact supplied evidence; any failure is a refusal
 * with one owned code, never a partial authorization. Admission executes nothing: no media, decoder, renderer, provider,
 * model or subprocess runs, and no legacy plan, render result, QC result, job state, decision event or confidence exists.
 * An admission is eligibility only. It is replayable and therefore never an exclusive right to start the media executor:
 * its `dispatch` state stays `not_claimed` until a later runtime claims the exact attempt atomically.
 */
import { z } from "zod";
import { IdSchema, MediaAssetSchema, TimestampSchema } from "../contracts/common.js";
import { ArtifactRefSchema, EvidenceRefSchema, checkIdentity, compareText, equal, identify, type ArtifactRef, type SuppliedArtifact } from "../editorial/common.js";
import { EditGraphSchema, validateEditGraph, type EditGraph } from "../edit-graph/index.js";
import { FrameRateBoundsSchema, HashSchema, Nat, ResolutionBoundsSchema } from "../edit-graph/common.js";
import { CapabilityIdSchema, CapabilitySnapshotSchema, ExecutorIdentitySchema, assessRequirement, bindSnapshotAttestations, checkSnapshotLimits,
  type CapabilityAttestation, type CapabilityState } from "../edit-graph/capability.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { PlanningContextSchema } from "../planning/index.js";
import { ComputeBudgetSchema, ReservationSchema, budget, reserve, type ComputeBudget } from "../routing/index.js";
import { EDIT_EXECUTION_VERSION, ExecutionExecutorIdentitySchema, PositiveSafeInt, RenderIntentSchema, ScopeSchema, SuppliedArtifacts, check, envelope, epochMilliseconds,
  guard, guardGate6, header, parse, parseCanonical, refuse, sameScope, type EditExecutionErrorCode, type Scope } from "./common.js";
import { ExecutionGrantSchema, ExecutionWorkEstimateSchema, MAX_SOURCES, WORK_QUANTITIES, type ExecutionGrant } from "./grant.js";
import { ExecutionPolicySchema, ExecutionRenderProfileSchema, type ExecutionPolicy, type ExecutionRenderProfile } from "./policy.js";
import { ExecutionRuntimeAttestationSchema, RuntimeIdentitySchema, runtimeEvidence } from "./runtime.js";
import { ExecutionMediaGrantSchema, SourceAccessReceiptSchema } from "./source.js";
import { deriveRenderWork } from "./workload.js";

const V = EDIT_EXECUTION_VERSION;
/** The only dispatch state Batch 1 can express: nothing is claimed, and an atomic runtime claim is still required. */
export const DispatchSchema = z.strictObject({ state: z.literal("not_claimed"), requirement: z.literal("atomic_runtime_claim_required") });
export const DISPATCH_NOT_CLAIMED = { state: "not_claimed", requirement: "atomic_runtime_claim_required" } as const;
const AdmittedRequirementSchema = z.strictObject({ requirementId: IdSchema, capabilityId: CapabilityIdSchema, state: z.literal("AVAILABLE"),
  declaration: EvidenceRefSchema, attestation: ArtifactRefSchema, observedAt: TimestampSchema });
const AdmittedSourceSchema = z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, analysis: ArtifactRefSchema,
  mediaAsset: ArtifactRefSchema, mediaGrant: ArtifactRefSchema, receipt: ArtifactRefSchema, checkedAt: TimestampSchema, clipUseIds: z.array(IdSchema).min(1).max(32) });
const WorkloadSchema = z.strictObject({
  renderIntent: RenderIntentSchema, ticksPerSecond: PositiveSafeInt, outputDurationTicks: PositiveSafeInt, frameRate: FrameRateBoundsSchema, outputFrames: PositiveSafeInt,
  resolution: ResolutionBoundsSchema, pixelFrames: PositiveSafeInt,
  linkedSourceAudio: z.strictObject({ ticks: Nat, milliseconds: Nat, rounding: z.literal("ceiling_of_exact_linked_duration") }),
  uniqueSourceAssets: PositiveSafeInt, videoClipUses: PositiveSafeInt, audioClipUses: Nat, operations: Nat,
  estimate: ArtifactRefSchema, estimateBasis: z.literal("attributed_estimate_not_measured"), fit: z.literal("derived_and_attributed_work_within_reservation"),
});
const AdmissionBodySchema = z.strictObject({
  ...envelope("ExecutionAdmission"), scope: ScopeSchema, outcome: z.literal("admitted"),
  executionGrant: ArtifactRefSchema, admittedAt: TimestampSchema,
  editGraph: ArtifactRefSchema, graph: z.strictObject({ editGraphId: IdSchema, revision: z.literal(0) }),
  policy: ArtifactRefSchema, renderProfile: ArtifactRefSchema, renderIntent: RenderIntentSchema, executor: ExecutionExecutorIdentitySchema, environment: IdSchema,
  capability: z.strictObject({ snapshot: ArtifactRefSchema, asOf: TimestampSchema,
    planningObservation: z.strictObject({ snapshot: ArtifactRefSchema, asOf: TimestampSchema }), requirements: z.array(AdmittedRequirementSchema).min(1).max(128) }),
  runtime: z.strictObject({ attestation: ArtifactRefSchema, identity: RuntimeIdentitySchema, observedAt: TimestampSchema }),
  sources: z.array(AdmittedSourceSchema).min(1).max(MAX_SOURCES),
  // The exact reservation reference is lineage; its Gate-3 content identity names the reservation independent of storage label or byte form.
  budget: z.strictObject({ executionBudget: ArtifactRefSchema, allocation: ArtifactRefSchema, reservation: ArtifactRefSchema, reservationId: IdSchema,
    planningBudget: ArtifactRefSchema, separation: z.literal("distinct_budget_allocation_authorization_and_tree_from_planning_budget") }),
  workload: WorkloadSchema,
  frames: z.strictObject({ conformance: z.literal("exact_output_frame_grid"), checkedInstants: PositiveSafeInt }),
  operationId: IdSchema, attempt: PositiveSafeInt,
  publicContracts: z.literal("none_emitted_no_plan_render_result_qc_result_decision_event_or_confidence"),
  mediaExecution: z.literal("not_started_in_batch1"),
  // Admission is eligibility, never an exclusive right to start the media executor: Batch 2 must claim atomically first.
  dispatch: DispatchSchema,
});
export const ExecutionAdmissionSchema = AdmissionBodySchema.extend({ admissionId: IdSchema })
  .refine(v => checkIdentity(v, "admissionId", "execution_admission_v0"), "Execution admission identity mismatch.");
export type ExecutionAdmission = z.infer<typeof ExecutionAdmissionSchema>;
const RequestSchema = z.strictObject({ executionGrant: ArtifactRefSchema, admittedAt: TimestampSchema });
export type ExecutionAdmissionRequest = z.input<typeof RequestSchema>;

interface Context { supplied: SuppliedArtifacts; grant: ExecutionGrant; graph: EditGraph; policy: ExecutionPolicy; scope: Scope; admittedAt: string; now: number }
interface GraphSource { assetId: string; contentHash: string; analysis: ArtifactRef; clipUseIds: string[] }

// ---------------------------------------------------------------- render profile: never a silent reframe, resize or retime of the graph
function checkProfile(profile: ExecutionRenderProfile, graph: EditGraph): void {
  const output = graph.output;
  check(equal(profile.frameRate, output.frameRate), "render_profile_incompatible", "The render frame rate must be the graph's exact declared frame rate.");
  check(profile.resolution.width * output.aspectRatio.height === profile.resolution.height * output.aspectRatio.width, "render_profile_incompatible",
    "The render profile would reframe the graph's output aspect.");
  if (profile.intent === "final") check(equal(profile.resolution, output.resolution), "render_profile_incompatible", "A final render keeps the graph's exact output resolution.");
  else check(profile.resolution.width <= output.resolution.width && profile.resolution.height <= output.resolution.height, "render_profile_incompatible",
    "A preview may scale down, never up.");
}

// ---------------------------------------------------------------- sources: explicit media grants and fresh execution-time receipts
function graphSources(graph: EditGraph): GraphSource[] {
  const byAsset = new Map<string, GraphSource>();
  for (const use of graph.clipUses) {
    const known = byAsset.get(use.source.assetId);
    if (known === undefined) { byAsset.set(use.source.assetId, { assetId: use.source.assetId, contentHash: use.source.sourceHash, analysis: use.source.analysis, clipUseIds: [use.clipUseId] }); continue; }
    check(known.contentHash === use.source.sourceHash && equal(known.analysis, use.source.analysis), "graph_source_inconsistent",
      "Every clip use of one asset must name the same exact source hash and FootageAnalysis.");
    known.clipUseIds.push(use.clipUseId);
  }
  return [...byAsset.values()].map(s => ({ ...s, clipUseIds: [...s.clipUseIds].sort(compareText) })).sort((a, b) => compareText(a.assetId, b.assetId));
}
const assetIdentity = (asset: z.infer<typeof MediaAssetSchema>) => { const { retention: _retention, ...identity } = asset; return identity; };
function admitSources(x: Context, sources: readonly GraphSource[]) {
  const { supplied, grant, graph, scope, admittedAt, now, policy } = x, intent = grant.renderIntent;
  const context = parse(PlanningContextSchema, supplied.exact(graph.lineage.context, "PlanningContext", "0.1.0", "graph_replay_failed"), "graph_replay_failed");
  const pinned = context.worldQuery.currentAccess.map(ref => parse(MediaAssetSchema, supplied.exact(ref, "MediaAsset", "1.0.0", "graph_replay_failed"), "graph_replay_failed"));
  const mediaGrants = grant.mediaGrants.map(ref => {
    const value = parseCanonical(ExecutionMediaGrantSchema, supplied.exact(ref, "ExecutionMediaGrant", V, "media_grant_invalid", "media_grant_missing"), "media_grant_invalid");
    check(sameScope(value.scope, scope), "scope_mismatch", "A media grant for another project, creator or purpose never authorizes this execution.");
    check(sources.some(s => s.assetId === value.source.assetId && s.contentHash === value.source.contentHash), "media_grant_invalid",
      "A media grant names a source outside the graph or another content hash.");
    return { ref, value };
  });
  const receipts = grant.sourceReceipts.map(ref => {
    const value = parseCanonical(SourceAccessReceiptSchema, supplied.exact(ref, "SourceAccessReceipt", V, "source_receipt_invalid", "source_receipt_missing"), "source_receipt_invalid");
    check(sameScope(value.scope, scope), "scope_mismatch", "Source evidence cannot move across project, creator or purpose.");
    check(sources.some(s => s.assetId === value.source.assetId), "source_receipt_invalid", "A source receipt names an asset outside the graph.");
    return { ref, value };
  });
  return sources.map(source => {
    const grants = mediaGrants.filter(g => g.value.source.assetId === source.assetId);
    check(grants.length > 0, "media_grant_missing", `No execution-media grant authorizes ${source.assetId}.`);
    check(grants.length === 1, "media_grant_invalid", "Exactly one media grant per source.");
    const mediaGrant = grants[0]!;
    check(mediaGrant.value.renderIntents.includes(intent), "render_intent_not_granted", `The media grant does not authorize a ${intent} render.`);
    check(mediaGrant.value.issuedAt <= admittedAt && (mediaGrant.value.expiresAt === null || admittedAt < mediaGrant.value.expiresAt), "media_grant_window_invalid",
      "The media grant is not valid at admission.");
    check(mediaGrant.value.issuedAt <= grant.issuedAt, "evidence_postdates_execution_grant", "A media grant cannot postdate the execution grant that binds it.");
    supplied.scoped(mediaGrant.value.authority.evidence, scope, "media_grant_invalid");

    const matching = receipts.filter(r => r.value.source.assetId === source.assetId);
    check(matching.length > 0, "source_receipt_missing", `No execution-time source receipt for ${source.assetId}; the pinned Gate-5 access time is not a recheck.`);
    check(matching.length === 1, "source_receipt_invalid", "Exactly one source receipt per source.");
    const { ref: receiptRef, value: receipt } = matching[0]!;
    check(equal(receipt.editGraph, grant.editGraph), "source_receipt_invalid", "The receipt was made for another graph.");
    check(receipt.renderIntent === intent, "render_intent_mismatch", "The receipt was made for another render intent.");
    check(equal(receipt.mediaGrant, mediaGrant.ref), "source_receipt_invalid", "The receipt checked another media grant.");
    check(equal(receipt.source.analysis, source.analysis), "source_analysis_mismatch", "The receipt names another FootageAnalysis.");
    const analysis = parse(FootageAnalysisSchema, supplied.exact(source.analysis, "FootageAnalysis", "1.0.0", "graph_replay_failed"), "graph_replay_failed");
    check(analysis.assetId === source.assetId && analysis.contentHash === source.contentHash, "graph_source_inconsistent", "The graph source contradicts its analysis.");
    const media = parse(MediaAssetSchema, supplied.exact(receipt.source.mediaAsset, "MediaAsset", "1.0.0", "media_asset_mismatch"), "media_asset_mismatch");
    check(media.assetId === source.assetId, "media_asset_mismatch", "The receipt's MediaAsset is another asset.");
    check(media.projectId === scope.projectId && media.creatorId === scope.creatorId, "media_asset_foreign_scope", "No cross-project or cross-creator content-hash rescue.");
    check(media.kind === "video", "media_asset_not_video", "Only a video MediaAsset can source a video clip.");
    const pinnedAsset = pinned.find(asset => asset.assetId === source.assetId);
    check(pinnedAsset !== undefined && equal(assetIdentity(media), assetIdentity(pinnedAsset)), "media_asset_mismatch",
      "The current MediaAsset must keep the pinned Gate-5 identity; only retention may change.");
    check(receipt.expected.contentHash === analysis.contentHash && receipt.observed.contentHash === receipt.expected.contentHash, "source_hash_mismatch",
      "The observed full-byte hash must equal the accepted analysis hash.");
    check(receipt.expected.sizeBytes === analysis.authorization.sizeBytes && receipt.observed.sizeBytes === receipt.expected.sizeBytes, "source_size_mismatch",
      "The observed byte size must equal the accepted analysis size.");
    check(media.retention.deletionRequestedAt === null, "source_deletion_requested", "Deletion of the source was requested.");
    check(media.retention.expiresAt === null || (receipt.checkedAt < media.retention.expiresAt && admittedAt < media.retention.expiresAt), "source_expired",
      "The source is expired at its check or at admission.");
    check(receipt.checkedAt <= admittedAt, "evidence_postdates_admission", "A source receipt cannot postdate admission.");
    check(receipt.checkedAt <= grant.issuedAt, "evidence_postdates_execution_grant", "A source receipt cannot postdate the execution grant that binds it.");
    check(receipt.checkedAt >= graph.sourceAccess.accessAsOf && now - epochMilliseconds(receipt.checkedAt) <= policy.freshness.maxSourceReceiptAgeMilliseconds,
      "source_receipt_stale", "The source receipt is not fresh execution-time evidence.");
    check(mediaGrant.value.issuedAt <= receipt.checkedAt, "media_grant_window_invalid", "The receipt predates the media grant it claims to have checked.");
    supplied.scoped(receipt.evidence, scope, "source_receipt_invalid");
    return { assetId: source.assetId, contentHash: source.contentHash, sizeBytes: analysis.authorization.sizeBytes, analysis: source.analysis, mediaAsset: receipt.source.mediaAsset,
      mediaGrant: mediaGrant.ref, receipt: receiptRef, checkedAt: receipt.checkedAt, clipUseIds: source.clipUseIds };
  });
}

// ---------------------------------------------------------------- capability: one selected executor, freshly AVAILABLE for every graph requirement
const STATE_CODES: Record<Exclude<CapabilityState, "AVAILABLE">, EditExecutionErrorCode> = {
  PARTIAL: "capability_partial", UNAVAILABLE: "capability_unavailable", UNSUPPORTED: "capability_unsupported", FAILED: "capability_failed" };
function admitCapability(x: Context) {
  const { supplied, grant, graph, scope, admittedAt, now } = x, maxAge = x.policy.freshness.maxCapabilityEvidenceAgeMilliseconds;
  const value = supplied.exact(grant.capabilitySnapshot, "CapabilitySnapshot", "0.1.0", "capability_snapshot_invalid");
  guardGate6("capability_snapshot_invalid", () => checkSnapshotLimits(value));
  const snapshot = parseCanonical(CapabilitySnapshotSchema, value, "capability_snapshot_invalid");
  check(sameScope(snapshot.scope, scope), "scope_mismatch", "Foreign capability snapshot.");
  check(snapshot.environment === grant.environment, "capability_environment_mismatch", "The snapshot describes another execution environment.");
  const planning = parse(CapabilitySnapshotSchema, supplied.exact(graph.capability.snapshot, "CapabilitySnapshot", "0.1.0", "graph_replay_failed"), "graph_replay_failed");
  check(snapshot.snapshotId !== planning.snapshotId, "capability_snapshot_stale", "The planning-time capability observation is not an execution-time recheck.");
  check(snapshot.asOf >= graph.capability.asOf, "capability_snapshot_stale", "The execution-time snapshot predates the graph's capability observation.");
  check(snapshot.asOf <= admittedAt, "evidence_postdates_admission", "A capability snapshot cannot postdate admission.");
  check(snapshot.asOf <= grant.issuedAt, "evidence_postdates_execution_grant", "A capability snapshot cannot postdate the execution grant that binds it.");
  check(now - epochMilliseconds(snapshot.asOf) <= maxAge, "capability_snapshot_stale", "The capability snapshot is too old for the execution policy.");
  const attestations = guardGate6("capability_snapshot_invalid", () => bindSnapshotAttestations(snapshot, supplied.map));
  const sameId = snapshot.executors.filter(e => e.executorId === grant.executor.executorId);
  check(sameId.length > 0, "executor_not_in_snapshot", "The selected executor is not in the execution-time snapshot.");
  check(sameId.some(e => e.version === grant.executor.version), "executor_version_mismatch", "The selected executor version is not the attested one.");
  const index = snapshot.executors.findIndex(e => equal({ executorId: e.executorId, version: e.version, implementationDigest: e.implementationDigest }, grant.executor));
  check(index >= 0, "executor_digest_mismatch", "The selected executor implementation digest is not the attested one.");
  const assessments = graph.capabilityRequirements.map(requirement =>
    guardGate6("capability_snapshot_invalid", () => assessRequirement(requirement, snapshot, grant.capabilitySnapshot, attestations, scope.purpose)));
  const failing = assessments.find(a => a.executors[index]!.state !== "AVAILABLE");
  if (failing !== undefined) {
    const everyRequirementSomewhere = assessments.every(a => a.executors.some(e => e.state === "AVAILABLE"));
    const oneExecutorForAll = snapshot.executors.some((_, i) => assessments.every(a => a.executors[i]!.state === "AVAILABLE"));
    check(!everyRequirementSomewhere || oneExecutorForAll, "capability_split_across_executors", "Requirements proven only across different executors authorize nothing.");
    const state = failing.executors[index]!.state as Exclude<CapabilityState, "AVAILABLE">;
    refuse(STATE_CODES[state], `Requirement ${failing.requirementId} is ${state} for the selected executor.`);
  }
  const requirements = graph.capabilityRequirements.map((requirement, i) => {
    const finding = assessments[i]!.executors[index]!;
    check(finding.declaration.state === "present" && finding.attestation.state === "present", "capability_snapshot_invalid", "AVAILABLE requires a bound attestation.");
    const attestation = attestations.get(finding.attestation.value.objectId);
    check(attestation !== undefined, "capability_snapshot_invalid", "AVAILABLE requires a bound attestation.");
    check(attestation.observedAt >= graph.capability.asOf && now - epochMilliseconds(attestation.observedAt) <= maxAge, "capability_snapshot_stale",
      "Capability evidence for the selected executor is not fresh execution-time evidence.");
    return { requirementId: requirement.requirementId, capabilityId: requirement.capabilityId, state: "AVAILABLE" as const, declaration: finding.declaration.value,
      attestation: finding.attestation.value, observedAt: attestation.observedAt };
  });
  return { record: { snapshot: grant.capabilitySnapshot, asOf: snapshot.asOf, planningObservation: { snapshot: graph.capability.snapshot, asOf: graph.capability.asOf },
    requirements }, attestations };
}

// ---------------------------------------------------------------- runtime: the exact encoding the render profile requests, attested for this executor build
function admitRuntime(x: Context, profile: ExecutionRenderProfile, snapshotAttestations: ReadonlyMap<string, CapabilityAttestation>) {
  const { supplied, grant, graph, scope, admittedAt, now } = x;
  const attestation = parseCanonical(ExecutionRuntimeAttestationSchema,
    supplied.exact(grant.runtimeAttestation, "ExecutionRuntimeAttestation", V, "runtime_attestation_invalid", "runtime_attestation_missing"), "runtime_attestation_invalid");
  check(sameScope(attestation.scope, scope), "scope_mismatch", "Foreign runtime attestation.");
  check(attestation.environment === grant.environment, "runtime_attestation_mismatch", "The runtime attestation describes another execution environment.");
  check(equal(attestation.executor, grant.executor), "runtime_attestation_mismatch", "The runtime attestation names another executor build.");
  check(equal(attestation.encoding, { video: profile.video, audio: profile.audio }), "runtime_attestation_mismatch",
    "The runtime attestation covers other encoding semantics than the render profile requests.");
  check(attestation.observedAt <= admittedAt, "evidence_postdates_admission", "A runtime attestation cannot postdate admission.");
  check(attestation.observedAt <= grant.issuedAt, "evidence_postdates_execution_grant", "A runtime attestation cannot postdate the execution grant that binds it.");
  // The capability-evidence freshness rule: never older than the graph's own capability observation, and within the policy age.
  check(attestation.observedAt >= graph.capability.asOf && now - epochMilliseconds(attestation.observedAt) <= x.policy.freshness.maxCapabilityEvidenceAgeMilliseconds,
    "runtime_attestation_stale", "The runtime attestation is not fresh execution-time evidence.");
  const outcome = attestation.outcome;
  if (outcome.state === "failed") refuse("runtime_attestation_failed", `The runtime check failed: ${outcome.failureCode}.`);
  if (outcome.state === "unavailable") refuse("runtime_attestation_unavailable", `The runtime is unavailable: ${outcome.reasonCode}.`);
  check(outcome.licensing.eligiblePurposes.includes(scope.purpose), "runtime_attestation_unavailable", "The runtime is not licensed for this purpose.");
  const evidence = runtimeEvidence(outcome);
  supplied.scoped(evidence, scope, "runtime_attestation_invalid");
  // Evidence of an unavailable or failed execution-time check can never also prove availability.
  const negative = new Set([...snapshotAttestations.values()].filter(a => a.outcome.state !== "available")
    .flatMap(a => a.outcome.state === "failed" ? a.outcome.attempt.evidence : a.outcome.state === "unavailable" ? a.outcome.evidence : []).map(e => e.artifact.objectId));
  check(evidence.every(e => !negative.has(e.artifact.objectId)), "runtime_attestation_invalid", "Evidence of an unavailable or failed check cannot prove availability.");
  return { attestation: grant.runtimeAttestation, identity: attestation.runtime, observedAt: attestation.observedAt };
}

// ---------------------------------------------------------------- operations: every accepted operation is executable in V0, or admission refuses
function checkOperations(graph: EditGraph): void {
  const joins = new Set<string>();
  for (const operation of graph.operations) {
    if (operation.primitive === "cut_transition") {
      const join = `${operation.target.fromClipUseId}|${operation.target.toClipUseId}`;
      check(!joins.has(join), "operation_not_executable", "Several resolved cut operations target one join; V0 neither chooses nor merges them.");
      joins.add(join);
    } else check(operation.primitive === "color_look", "operation_not_executable", "Unregistered operation primitive.");
  }
}

// ---------------------------------------------------------------- budget: a separate execution budget and an exact replayed reservation
function admitBudget(x: Context) {
  const { supplied, grant, graph, scope } = x;
  const planningRef = graph.executability.budget.planningBudget;
  const planning = parse(ComputeBudgetSchema, supplied.exact(planningRef, "ComputeBudget", "0.1.0", "graph_replay_failed"), "graph_replay_failed");
  const read = (ref: unknown): ComputeBudget =>
    parse(ComputeBudgetSchema, supplied.exact(ref, "ComputeBudget", "0.1.0", "execution_budget_invalid", "execution_budget_missing"), "execution_budget_invalid");
  const executionRef = grant.budget.executionBudget, allocationRef = grant.budget.allocation;
  const execution = read(executionRef), allocation = read(allocationRef);
  const isPlanning = (ref: ArtifactRef, value: ComputeBudget) => ref.objectId === planningRef.objectId || ref.sha256 === planningRef.sha256 || value.budgetId === planning.budgetId;
  const sameAuthority = (value: ComputeBudget) => value.authorizationRef.objectId === planning.authorizationRef.objectId || value.authorizationRef.sha256 === planning.authorizationRef.sha256;
  check(!isPlanning(executionRef, execution) && !isPlanning(allocationRef, allocation), "planning_budget_reused", "The Gate-5 planning budget is not an execution budget.");
  check(!sameAuthority(execution) && !sameAuthority(allocation), "planning_budget_reused", "An execution budget must rest on its own execution authorization.");
  const pending = [...execution.childAllocations], visited = new Set<string>();
  while (pending.length) {
    const ref = pending.pop()!;
    if (visited.has(ref.objectId)) continue;
    check(visited.size < 256, "limit_exceeded", "The execution allocation tree is too large.");
    visited.add(ref.objectId);
    const child = read(ref);
    check(!isPlanning(ref, child), "planning_budget_reused", "An execution budget cannot allocate the planning budget.");
    pending.push(...child.childAllocations);
  }
  for (const value of [execution, allocation]) {
    const { budgetId: _budgetId, ...body } = value;
    check(guard("execution_budget_invalid", () => equal(budget(body, supplied.artifacts), value)), "execution_budget_invalid", "The execution budget fails Gate-3 authorization replay.");
  }
  check(sameScope(execution.scope, scope) && sameScope(allocation.scope, scope), "scope_mismatch", "Foreign execution budget.");
  const reservationRef = grant.budget.reservation;
  const reservation = parse(ReservationSchema, supplied.exact(reservationRef, "Reservation", "0.1.0", "reservation_invalid", "reservation_missing"), "reservation_invalid");
  check(sameScope(reservation.scope, scope), "scope_mismatch", "Foreign reservation.");
  check(equal(reservation.budgetRef, executionRef) && reservation.budgetId === execution.budgetId && equal(reservation.allocationRef, allocationRef),
    "reservation_allocation_mismatch", "The reservation holds another budget or allocation.");
  check(reservation.operationId === grant.operationId && reservation.attempt === grant.attempt, "reservation_attempt_mismatch", "The reservation holds another operation attempt.");
  const replayed = guard("reservation_invalid", () => reserve({ scope: reservation.scope, budget: execution, budgetArtifact: reservation.budgetRef, allocation,
    allocationArtifact: reservation.allocationRef, historyArtifact: reservation.historyRef, operationId: reservation.operationId, attempt: reservation.attempt }, supplied.artifacts));
  check(equal(replayed, reservation), "reservation_invalid", "The reservation contradicts exact Gate-3 replay from its own refs.");
  return { reservation, record: { executionBudget: executionRef, allocation: allocationRef, reservation: reservationRef, reservationId: reservation.reservationId,
    planningBudget: planningRef, separation: "distinct_budget_allocation_authorization_and_tree_from_planning_budget" as const } };
}

export function admitExecution(requestInput: unknown, artifacts: readonly SuppliedArtifact[]): ExecutionAdmission {
  const request = parse(RequestSchema, requestInput);
  const supplied = new SuppliedArtifacts(artifacts), admittedAt = request.admittedAt, now = epochMilliseconds(admittedAt);

  // Explicit authority is the only source of execution permission. Gate 6 accepts free-text executor versions for capability
  // evidence; an executor selected for execution without an execution-safe identity is ineligible, before anything else is read.
  const grantValue = supplied.exact(request.executionGrant, "ExecutionGrant", V);
  const selected = ExecutorIdentitySchema.safeParse(grantValue !== null && typeof grantValue === "object" ? (grantValue as Record<string, unknown>).executor : undefined);
  check(!selected.success || ExecutionExecutorIdentitySchema.safeParse(selected.data).success, "executor_not_execution_safe",
    "The selected executor's version is not an execution-safe label; the executor is ineligible for execution.");
  const grant = parseCanonical(ExecutionGrantSchema, grantValue);
  const scope = grant.scope;
  check(grant.issuedAt <= admittedAt && (grant.expiresAt === null || admittedAt < grant.expiresAt), "execution_grant_window_invalid", "Admission falls outside the execution grant window.");

  // The accepted graph: exact scope and identity first, then full Gate-6 semantic replay; no unresolved obligation survives.
  const claimed = parse(EditGraphSchema, supplied.exact(grant.editGraph, "EditGraph", "0.1.0", "graph_replay_failed"), "graph_replay_failed");
  check(sameScope(claimed.scope, scope), "scope_mismatch", "The graph and the execution grant are in different scopes.");
  check(claimed.editGraphId === grant.graph.editGraphId && claimed.revision === grant.graph.revision, "graph_binding_mismatch", "The grant names another graph identity or revision.");
  const graph = guard("graph_replay_failed", () => validateEditGraph(claimed, artifacts));
  check(graph.unresolved.length === 0, "graph_obligation_unresolved", "Unresolved Gate-6 obligations, deferred hard checks or framing block execution.");
  checkOperations(graph);

  const policy = parseCanonical(ExecutionPolicySchema, supplied.exact(grant.policy, "ExecutionPolicy", V));
  check(sameScope(policy.scope, scope), "scope_mismatch", "Foreign execution policy.");
  const profile = parseCanonical(ExecutionRenderProfileSchema, supplied.exact(grant.renderProfile, "ExecutionRenderProfile", V));
  check(sameScope(profile.scope, scope), "scope_mismatch", "Foreign render profile.");
  check(profile.intent === grant.renderIntent, "render_intent_mismatch", "The render profile is declared for another intent.");
  checkProfile(profile, graph);
  const { work, frames } = deriveRenderWork(graph, profile);

  const x: Context = { supplied, grant, graph, policy, scope, admittedAt, now };
  const sourceSet = graphSources(graph);
  check(sourceSet.length <= MAX_SOURCES, "limit_exceeded", "Too many unique sources.");
  const sources = admitSources(x, sourceSet);
  const { record: capability, attestations } = admitCapability(x);
  const runtime = admitRuntime(x, profile, attestations);
  const { reservation, record: budgetRecord } = admitBudget(x);

  // The attributed estimate: bound to this exact graph, executor build, runtime build, environment, profile, intent, policy and
  // source set; never measured and never capability evidence.
  const estimate = parseCanonical(ExecutionWorkEstimateSchema, supplied.exact(grant.workEstimate, "ExecutionWorkEstimate", V, "input_invalid", "work_estimate_missing"));
  check(sameScope(estimate.scope, scope), "scope_mismatch", "Foreign work estimate.");
  check(equal(estimate.editGraph, grant.editGraph) && equal(estimate.executor, grant.executor) && equal(estimate.runtime, runtime.identity)
    && estimate.environment === grant.environment && equal(estimate.renderProfile, grant.renderProfile)
    && estimate.renderIntent === grant.renderIntent && equal(estimate.policy, grant.policy)
    && equal(estimate.sources, sourceSet.map(s => ({ assetId: s.assetId, contentHash: s.contentHash }))), "work_estimate_mismatch",
    "The estimate is bound to another graph, executor build, runtime build, environment, render profile, intent, policy or source set.");
  check(estimate.estimatedAt <= admittedAt, "evidence_postdates_admission", "A work estimate cannot postdate admission.");
  check(estimate.estimatedAt <= grant.issuedAt, "evidence_postdates_execution_grant", "A work estimate cannot postdate the execution grant that binds it.");
  supplied.scoped(estimate.evidence, scope, "input_invalid");

  // Derived work and attributed quantities must both fit the exact reservation; nothing is silently lowered to fit.
  check(work.outputFrames <= reservation.renderWork.frames && work.pixelFrames <= reservation.renderWork.pixelFrames
    && work.linkedSourceAudio.milliseconds <= reservation.renderWork.audioMilliseconds, "workload_exceeds_reservation", "Derived render work exceeds the reservation.");
  for (const quantity of WORK_QUANTITIES) check(estimate.estimate[quantity] <= reservation[quantity], "workload_exceeds_reservation", `Attributed ${quantity} exceeds the reservation.`);

  const body = { ...header("ExecutionAdmission"), scope, outcome: "admitted", executionGrant: request.executionGrant, admittedAt,
    editGraph: grant.editGraph, graph: grant.graph, policy: grant.policy, renderProfile: grant.renderProfile, renderIntent: grant.renderIntent,
    executor: grant.executor, environment: grant.environment, capability, runtime, sources, budget: budgetRecord,
    workload: { ...work, estimate: grant.workEstimate, estimateBasis: estimate.basis, fit: "derived_and_attributed_work_within_reservation" }, frames,
    operationId: grant.operationId, attempt: grant.attempt,
    publicContracts: "none_emitted_no_plan_render_result_qc_result_decision_event_or_confidence", mediaExecution: "not_started_in_batch1",
    dispatch: DISPATCH_NOT_CLAIMED };
  return parse(ExecutionAdmissionSchema, identify("execution_admission_v0", "admissionId", body));
}

/** Semantic replay from the admission's own exact inputs; a rehashed admission cannot change a check, number or ref. */
export function validateExecutionAdmission(input: unknown, artifacts: readonly SuppliedArtifact[]): ExecutionAdmission {
  const admission = parse(ExecutionAdmissionSchema, input);
  const replayed = admitExecution({ executionGrant: admission.executionGrant, admittedAt: admission.admittedAt }, artifacts);
  check(equal(replayed, admission), "admission_replay_mismatch", "The admission contradicts deterministic replay from its exact inputs.");
  return structuredClone(admission);
}
