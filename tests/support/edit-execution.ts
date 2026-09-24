// Synthetic Gate-7 Batch-1 helpers over the accepted Gate-4/5/6 synthetic chain. No media, renderer, model, provider or network execution.
import type { ArtifactRef, SuppliedArtifact } from "../../packages/editorial/common.js";
import { budget, reserve } from "../../packages/routing/index.js";
import { supplied, type EditGraph } from "../../packages/edit-graph/index.js";
import { admitExecution, buildExecutionDag, createExecutionGrant, createExecutionMediaGrant, createExecutionPolicy, createExecutionRenderProfile,
  createExecutionRuntimeAttestation, createExecutionWorkEstimate, createSourceAccessReceipt, type RenderIntent } from "../../packages/edit-execution/index.js";
import { ENVIRONMENT, EXECUTOR, artifact, attestation, capabilitySnapshot, declarations, scope, snapshotAttestations, videoUses, type DeclarationBody,
  type GraphFixture } from "./edit-graph.js";

export { scope };
/** Execution-time chronology: every Gate-7 observation follows the Gate-6 capability observation (2026-09-24T00:00Z). */
export const T7 = {
  mediaGrant: "2026-09-24T00:30:00.000Z", capability: "2026-09-24T00:50:00.000Z", estimate: "2026-09-24T00:52:00.000Z",
  receipt: "2026-09-24T00:55:00.000Z", issued: "2026-09-24T00:58:00.000Z", admitted: "2026-09-24T01:00:00.000Z", expires: "2026-09-24T02:00:00.000Z",
} as const;
export const OPERATION = "operation_render_synthetic";
const OWNER = { kind: "owner", actorId: "owner_synthetic" } as const, OPERATOR = { kind: "operator", actorId: "operator_synthetic" } as const;
const envelope = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: "0.1.0" as const, stability: "internal_pre_stable" as const });
export const evidenceRef = (item: SuppliedArtifact) => ({ artifact: item.ref, pointer: "" });
export function mergeArtifacts(...groups: readonly (readonly SuppliedArtifact[])[]): SuppliedArtifact[] {
  const merged = new Map<string, SuppliedArtifact>();
  for (const group of groups) for (const item of group) if (!merged.has(item.ref.objectId)) merged.set(item.ref.objectId, item);
  return [...merged.values()];
}

// ---------------------------------------------------------------- scope-bearing synthetic evidence (never measured, never executed)
export const mediaAuthority = artifact("gate7_media_authority", "Evidence", { scope, basis: "synthetic_owner_render_authorization_record_not_real" });
export const resolverRun = artifact("gate7_resolver_run", "Evidence", { scope, basis: "synthetic_resolver_hash_record_not_executed" });
export const estimateBasis = artifact("gate7_estimate_basis", "Evidence", { scope, basis: "synthetic_attributed_estimate_not_measured" });
export const reservationPolicy = artifact("gate7_reservation_policy", "Evidence", { scope, basis: "synthetic_gate7_execution_reservation_policy" });
export const runtimeConformance = artifact("gate7_runtime_conformance", "Evidence", { scope, basis: "synthetic_encoding_conformance_record_not_executed" });
export const runtimeConfiguration = artifact("gate7_runtime_configuration", "Evidence", { scope, basis: "synthetic_runtime_configuration_record_not_probed" });
const GATE7_EVIDENCE = [mediaAuthority, resolverRun, estimateBasis, reservationPolicy, runtimeConformance, runtimeConfiguration];

// ---------------------------------------------------------------- owner policy and render profiles
export function executionPolicy(patch: Record<string, unknown> = {}) {
  return createExecutionPolicy({ ...envelope("ExecutionPolicy"), scope, author: OWNER,
    admission: "single_selected_executor_fresh_evidence_v0", sourceRecheck: "per_unique_source_full_byte_hash_and_current_lifecycle_v0",
    frameConformance: "exact_output_frame_grid_all_intents_v0", workload: "derived_render_work_plus_attributed_estimate_v0",
    budget: "separate_execution_budget_replayed_reservation_v0", dag: "provider_neutral_typed_nodes_v0",
    freshness: { maxSourceReceiptAgeMilliseconds: 900_000, maxCapabilityEvidenceAgeMilliseconds: 1_800_000 }, ...patch });
}
export const FINAL_RESOLUTION = { width: 1080, height: 1920 }, PREVIEW_RESOLUTION = { width: 540, height: 960 };
export function renderProfile(intent: RenderIntent = "final", patch: Record<string, unknown> = {}) {
  return createExecutionRenderProfile({ ...envelope("ExecutionRenderProfile"), scope, author: OWNER, intent,
    resolution: intent === "final" ? FINAL_RESOLUTION : PREVIEW_RESOLUTION, frameRate: { numerator: 30, denominator: 1 },
    video: { codecFamily: "h264", pixelFormat: "yuv420p", encodingProfile: "deterministic_constant_quality_v0" },
    audio: { policy: "graph_linked_source_audio_v0", codecFamily: "aac", sampleRateHz: 48000, channelLayout: "stereo" }, ...patch });
}

// ---------------------------------------------------------------- fresh execution-time capability evidence
export function freshExecutorBody(decls: DeclarationBody[] = declarations(), identity: typeof EXECUTOR = EXECUTOR, observedAt: string = T7.capability,
  environment: string = ENVIRONMENT) {
  return { ...identity, declarations: decls.map(claim => ({ capabilityId: claim.capabilityId, attestation: attestation(claim, identity, { observedAt, environment }).ref })) };
}
export function freshSnapshot(executors: unknown[] = [freshExecutorBody()], patch: Record<string, unknown> = {}) {
  return capabilitySnapshot(executors, { asOf: T7.capability, ...patch });
}

// ---------------------------------------------------------------- attributed runtime-encoding attestation (no probe, no runtime executed)
export const RUNTIME = { runtimeId: "synthetic_encoding_runtime", version: "0.1.0", implementationDigest: "d".repeat(64) };
export const availableRuntime = () => ({ state: "available", licensing: { eligiblePurposes: [scope.purpose] },
  conformance: { meaning: "attested_encoding_matches_declared_semantics", evidence: [evidenceRef(runtimeConformance)] },
  configuration: { meaning: "runtime_configured_in_environment", evidence: [evidenceRef(runtimeConfiguration)] } });
export function runtimeAttestation(input: { executor: typeof EXECUTOR; profile: { video: unknown; audio: unknown }; environment?: string }, patch: Record<string, unknown> = {}) {
  return createExecutionRuntimeAttestation({ ...envelope("ExecutionRuntimeAttestation"), scope, environment: input.environment ?? ENVIRONMENT, observedAt: T7.capability,
    executor: input.executor, runtime: RUNTIME, encoding: { video: input.profile.video, audio: input.profile.audio }, attester: OPERATOR,
    basis: "attester_supplied_runtime_check_results_no_probe", outcome: availableRuntime(), ...patch });
}

// ---------------------------------------------------------------- sources, media grants and receipts
export interface GraphSource { assetId: string; contentHash: string; sizeBytes: number; analysis: ArtifactRef; mediaAsset: SuppliedArtifact }
export function graphSources(g: GraphFixture): GraphSource[] {
  const byAsset = new Map<string, GraphSource>();
  for (const clip of videoUses(g.graph)) {
    if (byAsset.has(clip.source.assetId)) continue;
    const analysis = g.artifacts.find(a => a.ref.objectId === clip.source.analysis.objectId)!.value as { authorization: { sizeBytes: number } };
    const mediaAsset = g.artifacts.find(a => a.ref.artifactType === "MediaAsset" && (a.value as { assetId: string }).assetId === clip.source.assetId)!;
    byAsset.set(clip.source.assetId, { assetId: clip.source.assetId, contentHash: clip.source.sourceHash, sizeBytes: analysis.authorization.sizeBytes,
      analysis: clip.source.analysis, mediaAsset });
  }
  return [...byAsset.values()].sort((a, b) => a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);
}
export function mediaGrant(source: { assetId: string; contentHash: string }, renderIntents: RenderIntent[] = ["final", "preview"], patch: Record<string, unknown> = {}) {
  return createExecutionMediaGrant({ ...envelope("ExecutionMediaGrant"), scope, grant: "render_authorized_source_media_v0",
    source: { assetId: source.assetId, contentHash: source.contentHash }, renderIntents,
    authority: { actor: OWNER, evidence: [evidenceRef(mediaAuthority)] }, issuedAt: T7.mediaGrant, expiresAt: null, ...patch });
}
/** A copy of the pinned MediaAsset as re-read at check time; identity fields stay, retention may change. */
export function currentMediaAsset(source: GraphSource, patch: Record<string, unknown> = {}, objectId = "gate7_current_media") {
  return artifact(objectId, "MediaAsset", { ...(source.mediaAsset.value as Record<string, unknown>), ...patch }, "1.0.0");
}
export function sourceReceipt(input: { editGraph: ArtifactRef; intent: RenderIntent; source: GraphSource; mediaGrant: ArtifactRef }, patch: Record<string, unknown> = {}) {
  const { source } = input;
  return createSourceAccessReceipt({ ...envelope("SourceAccessReceipt"), scope, editGraph: input.editGraph, renderIntent: input.intent,
    source: { assetId: source.assetId, mediaAsset: source.mediaAsset.ref, analysis: source.analysis }, mediaGrant: input.mediaGrant,
    expected: { contentHash: source.contentHash, sizeBytes: source.sizeBytes }, observed: { contentHash: source.contentHash, sizeBytes: source.sizeBytes, hashScope: "full_source_bytes" },
    checkedAt: T7.receipt, resolver: { resolverId: "synthetic_source_resolver", version: "0.1.0", implementationDigest: "c".repeat(64) }, attester: OPERATOR,
    basis: "runtime_resolver_supplied_full_byte_hash_no_core_io", evidence: [evidenceRef(resolverRun)], ...patch });
}

// ---------------------------------------------------------------- separate execution budget, allocation and reservation (Gate-3 machinery, unmodified)
export const EXECUTION_LIMITS = { cpuMilliseconds: 600_000, gpuMilliseconds: 0, peakRamBytes: 8_000_000_000, peakVramBytes: 0, apiSpendInrMicros: 0,
  totalCostInrMicros: 1_000_000, wallClockMilliseconds: 900_000, modelCalls: 0, renderWork: { frames: 100_000, pixelFrames: 100_000_000_000, audioMilliseconds: 3_600_000 } };
export type Limits = typeof EXECUTION_LIMITS;
export const HALF_LIMITS: Limits = { ...EXECUTION_LIMITS, cpuMilliseconds: 300_000, totalCostInrMicros: 500_000,
  renderWork: { frames: 50_000, pixelFrames: 50_000_000_000, audioMilliseconds: 1_800_000 } };
export interface BudgetOptions { allocations?: Limits[]; reserveIndex?: number; operationId?: string; attempt?: number; prefix?: string; scope?: typeof scope }
/** An execution-only ComputeAuthorization, a parent execution budget and explicit child allocations, then one Gate-3 reservation for this attempt. */
export function budgetChain(options: BudgetOptions = {}) {
  const prefix = options.prefix ?? "gate7", chainScope = options.scope ?? scope;
  // Gate 3 requires reservation-policy evidence of the budget's own scope, so a foreign chain carries its own.
  const policy = options.scope ? artifact(`${prefix}_reservation_policy`, "Evidence", { scope: chainScope, basis: "synthetic_gate7_execution_reservation_policy" }) : reservationPolicy;
  const authorization = artifact(`${prefix}_execution_compute_grant`, "ComputeAuthorization", { version: "0.1.0", scope: chainScope, grant: "compute",
    qualityTier: "tier_synthetic", ...EXECUTION_LIMITS, premiumOperations: [], retryLimit: 1, directorRevisionLimit: 0, reservationPolicy: evidenceRef(policy) });
  const body = (limits: Limits, childAllocations: ArtifactRef[] = []) => ({ version: "0.1.0", scope: chainScope, authorizationRef: authorization.ref,
    qualityTier: "tier_synthetic", ...limits, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0, childAllocations, reservationPolicy: evidenceRef(policy) });
  const base = [authorization, policy];
  const allocations = (options.allocations ?? [EXECUTION_LIMITS]).map((limits, i) => {
    const value = budget(body(limits), base);
    return { value, artifact: artifact(`${prefix}_allocation_${i}`, "ComputeBudget", value) };
  });
  const parentValue = budget(body(EXECUTION_LIMITS, allocations.map(a => a.artifact.ref)), [...base, ...allocations.map(a => a.artifact)]);
  const parent = { value: parentValue, artifact: artifact(`${prefix}_execution_budget`, "ComputeBudget", parentValue) };
  const history = artifact(`${prefix}_reservation_history`, "ReservationHistory", { version: "0.1.0", scope: chainScope, budgetRef: parent.artifact.ref, prior: [] });
  const allocation = allocations[options.reserveIndex ?? 0]!;
  const routing = [...base, ...allocations.map(a => a.artifact), parent.artifact, history];
  const reservation = reserve({ scope: chainScope, budget: parent.value, budgetArtifact: parent.artifact.ref, allocation: allocation.value,
    allocationArtifact: allocation.artifact.ref, historyArtifact: history.ref, operationId: options.operationId ?? OPERATION, attempt: options.attempt ?? 1 }, routing);
  const reservationArtifact = artifact(`${prefix}_reservation`, "Reservation", reservation);
  return { authorization, parent, allocations, allocation, history, reservation, reservationArtifact, artifacts: [...routing, reservationArtifact] };
}
export type BudgetChain = ReturnType<typeof budgetChain>;

// ---------------------------------------------------------------- attributed estimate and explicit execution grant
export const ESTIMATE = { cpuMilliseconds: 60_000, gpuMilliseconds: 0, peakRamBytes: 2_000_000_000, peakVramBytes: 0, wallClockMilliseconds: 120_000,
  apiSpendInrMicros: 0, totalCostInrMicros: 5_000 };
/** An estimate is made only once the exact runtime build and execution environment it estimates for are known. */
export function workEstimate(input: { editGraph: ArtifactRef; executor: typeof EXECUTOR; runtime: typeof RUNTIME; environment: string; renderProfile: ArtifactRef;
  intent: RenderIntent; policy: ArtifactRef; sources: { assetId: string; contentHash: string }[] }, patch: Record<string, unknown> = {}) {
  return createExecutionWorkEstimate({ ...envelope("ExecutionWorkEstimate"), scope, editGraph: input.editGraph, executor: input.executor, runtime: input.runtime,
    environment: input.environment, renderProfile: input.renderProfile, renderIntent: input.intent, policy: input.policy, sources: input.sources, estimate: ESTIMATE,
    estimator: OPERATOR, basis: "attributed_estimate_not_measured", estimatedAt: T7.estimate, evidence: [evidenceRef(estimateBasis)], ...patch });
}

export interface ExecutionOptions {
  intent?: RenderIntent; profile?: Record<string, unknown>; policy?: Record<string, unknown>;
  snapshot?: ReturnType<typeof capabilitySnapshot>; executor?: typeof EXECUTOR;
  mediaIntents?: RenderIntent[]; mediaGrant?: Record<string, unknown>;
  mediaGrants?: (made: SuppliedArtifact[]) => SuppliedArtifact[];
  receipt?: (source: GraphSource) => Record<string, unknown>;
  receipts?: (made: SuppliedArtifact[]) => SuppliedArtifact[];
  budget?: BudgetOptions; budgetRefs?: Partial<Record<"executionBudget" | "allocation" | "reservation", ArtifactRef>>;
  estimate?: Record<string, unknown>; estimateRef?: ArtifactRef; grant?: Record<string, unknown>;
  runtime?: Record<string, unknown>; runtimeRef?: ArtifactRef;
  /** The execution environment the grant and runtime attestation name; a coherent snapshot for it is supplied separately. */
  environment?: string;
  admittedAt?: string; extra?: SuppliedArtifact[]; omit?: string[];
}
export function executionInputs(g: GraphFixture, o: ExecutionOptions = {}) {
  const intent = o.intent ?? "final", executor = o.executor ?? EXECUTOR, environment = o.environment ?? ENVIRONMENT;
  const policy = executionPolicy(o.policy), policyArtifact = supplied(policy, policy.policyId);
  const profile = renderProfile(intent, o.profile), profileArtifact = supplied(profile, profile.renderProfileId);
  const snapshot = o.snapshot ?? freshSnapshot(), snapshotArtifact = supplied(snapshot, snapshot.snapshotId);
  const sources = graphSources(g);
  const madeGrants = sources.map(source => { const value = mediaGrant(source, o.mediaIntents, o.mediaGrant); return supplied(value, value.grantId); });
  const grantArtifacts = o.mediaGrants ? o.mediaGrants(madeGrants) : madeGrants;
  const madeReceipts = sources.map((source, i) => {
    const value = sourceReceipt({ editGraph: g.graphArtifact.ref, intent, source, mediaGrant: madeGrants[i]!.ref }, o.receipt?.(source));
    return supplied(value, value.receiptId);
  });
  const receiptArtifacts = o.receipts ? o.receipts(madeReceipts) : madeReceipts;
  const chain = budgetChain(o.budget);
  const runtime = runtimeAttestation({ executor, profile, environment }, o.runtime), runtimeArtifact = supplied(runtime, runtime.attestationId);
  const estimate = workEstimate({ editGraph: g.graphArtifact.ref, executor, runtime: runtime.runtime, environment, renderProfile: profileArtifact.ref, intent,
    policy: policyArtifact.ref, sources: sources.map(s => ({ assetId: s.assetId, contentHash: s.contentHash })) }, o.estimate);
  const estimateArtifact = supplied(estimate, estimate.estimateId);
  const grant = createExecutionGrant({ ...envelope("ExecutionGrant"), scope, editGraph: g.graphArtifact.ref,
    graph: { editGraphId: g.graph.editGraphId, revision: g.graph.revision }, executor, environment, renderIntent: intent,
    renderProfile: profileArtifact.ref, policy: policyArtifact.ref, capabilitySnapshot: snapshotArtifact.ref, runtimeAttestation: o.runtimeRef ?? runtimeArtifact.ref,
    budget: { executionBudget: chain.parent.artifact.ref, allocation: chain.allocation.artifact.ref, reservation: chain.reservationArtifact.ref, ...o.budgetRefs,
      meaning: "gate7_execution_budget_not_planning_budget" },
    mediaGrants: grantArtifacts.map(a => a.ref), sourceReceipts: receiptArtifacts.map(a => a.ref), workEstimate: o.estimateRef ?? estimateArtifact.ref,
    operationId: OPERATION, attempt: 1, issuedAt: T7.issued, expiresAt: T7.expires, authorizer: OPERATOR,
    basis: "explicit_owner_or_operator_execution_authorization_v0", ...o.grant });
  const grantArtifact = supplied(grant, grant.grantId);
  const omit = new Set(o.omit ?? []);
  const artifacts = mergeArtifacts(o.extra ?? [], g.artifacts, GATE7_EVIDENCE, snapshotAttestations(snapshot), [snapshotArtifact, policyArtifact, profileArtifact],
    grantArtifacts, madeGrants, receiptArtifacts, chain.artifacts, [estimateArtifact, runtimeArtifact, grantArtifact]).filter(a => !omit.has(a.ref.objectId));
  const request = { executionGrant: grantArtifact.ref, admittedAt: o.admittedAt ?? T7.admitted };
  return { g, request, artifacts, intent, executor, policy, policyArtifact, profile, profileArtifact, snapshot, snapshotArtifact, sources,
    mediaGrants: madeGrants, receipts: madeReceipts, chain, estimate, estimateArtifact, runtime, runtimeArtifact, grant, grantArtifact };
}
export type ExecutionInputs = ReturnType<typeof executionInputs>;
export function admissionOf(g: GraphFixture, o: ExecutionOptions = {}) {
  const x = executionInputs(g, o), admission = admitExecution(x.request, x.artifacts), admissionArtifact = supplied(admission, admission.admissionId);
  return { ...x, admission, admissionArtifact, artifacts: [...x.artifacts, admissionArtifact] };
}
export type AdmissionFixture = ReturnType<typeof admissionOf>;
export function dagOf(a: AdmissionFixture) {
  const dag = buildExecutionDag({ admission: a.admissionArtifact.ref }, a.artifacts), dagArtifact = supplied(dag, dag.dagId);
  return { ...a, dag, dagArtifact, artifacts: [...a.artifacts, dagArtifact] };
}
export type DagFixture = ReturnType<typeof dagOf>;
export type VideoUse = Extract<EditGraph["clipUses"][number], { medium: "video" }>;
