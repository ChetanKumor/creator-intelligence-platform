// Synthetic Gate-6 helpers over the accepted Gate-4/5 synthetic chain. No media, model, provider or network execution.
import { EditorialArtifactMap, missing, present, type ArtifactRef, type SuppliedArtifact } from "../../packages/editorial/common.js";
import { createEditorialCandidateSet } from "../../packages/editorial/decision.js";
import { resolveEditorialToken } from "../../packages/editorial/resolve.js";
import { candidateCoverage } from "../../packages/footage-analyzer/candidates.js";
import { FOOTAGE_VERSION } from "../../packages/footage-analyzer/protocol.js";
import { PerceptionEvidenceStore, computationKey, computationDependencies, type ComputationIdentity } from "../../packages/perception/index.js";
import { createWorldSnapshot, linkEditorialToken, queryWorld, type GroundedSupport } from "../../packages/world-model/index.js";
import { budget, profile, selectModel } from "../../packages/routing/index.js";
import { CANON_V0, createCanonView, createCandidateSummary, createCreativeDirectionGraph, createDirectorGroundingReport, createDirectorProducerRun, createDirectorRequest, createDirectorResult, createIntentSpec, directorSelectionInputDigest } from "../../packages/director/index.js";
import { createPlanningContext, createPlanningPolicy, runPlanning } from "../../packages/planning/index.js";
import { assessUepCompatibility, buildEditGraph, createCapabilityAttestation, createCapabilitySnapshot, createEditGraphPolicy, createEditOutputProfile,
  createTechniqueResolution, createUepProjectionPolicy, supplied, type EditGraph } from "../../packages/edit-graph/index.js";
import { tokenFixture } from "./editorial.js";
import { artifact, directionFixture, scope } from "./planning.js";

export { artifact, scope };
export const TIME6 = "2026-09-24T00:00:00.000Z";
const H = "a".repeat(64);
const envelope = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: "0.1.0" as const, stability: "internal_pre_stable" as const });

/** The accepted Gate-5 synthetic policy body, repeated here because test modules are not importable fixtures. */
export const planningPolicyBody = {
  artifactType: "PlanningPolicy", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope,
  author: { kind: "owner", actorId: "owner_synthetic" },
  retrieval: { method: "exact_direction_bindings_v0", maxCandidatesPerNode: 8 },
  boundary: { method: "candidate_and_sample_pts_v0", maxEvidencePoints: 8, maxOptionsPerCandidate: 16 },
  duration: { minimumSeconds: 2, maximumSeconds: 3, preferredSeconds: 2 },
  trim: { minimumSeconds: 0.25, maximumSeconds: 4 },
  search: { algorithm: "bounded_beam_v0", maximumDepth: 3, frontierWidth: 8, maximumExpandedStates: 128, maximumOptionsRetained: 16, manifestLimit: 128 },
  reuse: { maximumUsesPerCandidate: 2, precedingUsePolicy: "count_for_reuse_and_repetition" },
  objectives: [
    { name: "direction_coverage", definitionVersion: "0.1.0", preference: "higher", missing: "block" },
    { name: "duration_deviation", definitionVersion: "0.1.0", preference: "lower", missing: "block" },
    { name: "repetition_count", definitionVersion: "0.1.0", preference: "lower", missing: "block" },
  ],
  scoring: "lexicographic_components_v0", tie: { epsilon: 0, policy: "retain_all_within_component_epsilon" },
  seed: { kind: "deterministic", policyVersion: "0.1.0", ordering: "canonical_ids" },
  stopping: "declared_bounds_or_empty_frontier", requirementSemantics: "structural_node_coverage_only", executionAssessment: "deferred",
};
/** A chosen sequence of `uses` full-range uses of the 2-second synthetic candidate: the only way this chain reaches UEP durations. */
export const repeatedUses = (uses: number) => ({
  duration: { minimumSeconds: 2 * uses, maximumSeconds: 2 * uses, preferredSeconds: 2 * uses },
  boundary: { ...planningPolicyBody.boundary, maxOptionsPerCandidate: 1 },
  search: { ...planningPolicyBody.search, maximumDepth: uses },
  reuse: { ...planningPolicyBody.reuse, maximumUsesPerCandidate: uses },
});
export const singleUse = { boundary: { ...planningPolicyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...planningPolicyBody.search, maximumDepth: 1 } };

type Source = ReturnType<typeof directionFixture>;
export function planningFixture(patch: Record<string, unknown> = {}, source: Source = directionFixture()) {
  const policy = createPlanningPolicy({ ...planningPolicyBody, ...patch });
  const policyArtifact = artifact(policy.policyId, "PlanningPolicy", policy);
  const artifacts = [...source.supplied, policyArtifact];
  const contextBody = { artifactType: "PlanningContext", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope: source.request.scope,
    direction: source.directionArtifact.ref, directorRequest: source.requestArtifact.ref, worldSnapshot: source.worldArtifact.ref,
    worldView: source.viewArtifact.ref, worldQuery: source.worldQuery, candidateUniverse: source.setArtifact.ref, candidates: source.set.candidates,
    policy: policyArtifact.ref, computeBudget: source.budgetArtifact.ref, previousDecisions: [], precedingUses: [] };
  const context = createPlanningContext(contextBody, artifacts), contextArtifact = artifact(context.contextId, "PlanningContext", context);
  artifacts.push(contextArtifact);
  return { source, policy, policyArtifact, context, contextBody, contextArtifact, artifacts };
}
export type PlanningFixture = ReturnType<typeof planningFixture>;
export type DirectionNode = PlanningFixture["source"]["direction"]["nodes"][number];
export function withDirection(x: PlanningFixture, patch: Partial<Parameters<typeof createCreativeDirectionGraph>[0]>): PlanningFixture {
  const direction = createCreativeDirectionGraph({ ...x.source.directionBody, ...patch }, x.source.requestArtifact.ref, x.source.authority);
  const directionArtifact = artifact(direction.directionId, "CreativeDirectionGraph", direction);
  const artifacts = [...x.artifacts, directionArtifact];
  const contextBody = { ...x.contextBody, direction: directionArtifact.ref };
  const context = createPlanningContext(contextBody, artifacts), contextArtifact = artifact(context.contextId, "PlanningContext", context);
  artifacts.push(contextArtifact);
  return { ...x, contextBody, context, contextArtifact, artifacts };
}
/** A whole-edit typed operation node without source bindings; Gate 5 retains it as a deferred obligation. */
export function operationNode(x: PlanningFixture, nodeId: string, intent: DirectionNode["intent"], priority: "hard" | "soft" = "hard"): DirectionNode {
  return { ...x.source.direction.nodes[0]!, nodeId, intent, priority, scope: { kind: "whole_edit" }, candidates: [], requirementIds: [] };
}
export function plan(x: PlanningFixture) {
  const run = runPlanning(x.contextArtifact.ref, x.artifacts);
  const all = [...x.artifacts, ...run.artifacts];
  const decisionRef = run.artifacts.find(a => a.ref.artifactType === "PlanningDecision")!.ref;
  return { ...x, run, all, decisionRef };
}
export type Planned = ReturnType<typeof plan>;
export function chosenOption(p: Planned) {
  const outcome = p.run.decision.outcome;
  if (outcome.kind !== "chosen") throw new Error("Test fixture expected a chosen Gate-5 decision.");
  return p.run.manifest.options.find(e => e.option.optionId === outcome.optionId)!.option;
}

// ---------------------------------------------------------------- Gate-6 inputs
export const EXECUTOR = { executorId: "synthetic_executor", version: "0.1.0", implementationDigest: "b".repeat(64) };
export const ENVIRONMENT = "synthetic_local_declared";
export const conformance = artifact("gate6_conformance", "Evidence", { scope, basis: "synthetic_declared_test_evidence_not_measured", executorId: EXECUTOR.executorId });
export const configuration = artifact("gate6_configuration", "Evidence", { scope, basis: "synthetic_declared_test_configuration_not_measured" });
export const resources = artifact("gate6_resources", "Evidence", { scope, basis: "synthetic_declared_test_resources_not_measured" });
export const unavailability = artifact("gate6_unavailability", "Evidence", { scope, basis: "synthetic_declared_unavailability_not_measured" });
export const failedAttempt = artifact("gate6_failed_attempt", "Evidence", { scope, basis: "synthetic_capability_check_attempt", outcome: "failed", code: "probe_rejected" });
export const conformanceRefs = [{ artifact: conformance.ref, pointer: "" }];
export const unavailableRefs = [{ artifact: unavailability.ref, pointer: "" }];
const configurationRefs = [{ artifact: configuration.ref, pointer: "" }], resourceRefs = [{ artifact: resources.ref, pointer: "" }];
export const member = (name: string, ...values: string[]) => ({ name, kind: "member" as const, values });
export const atMost = (name: string, max: number) => ({ name, kind: "at_most" as const, max });
export type Support = ReturnType<typeof member> | ReturnType<typeof atMost>;
/** A test-side claim that executorBody turns into one attributed CapabilityAttestation; supports and licensing apply only when available. */
export type DeclarationBody = { capabilityId: string; status: Record<string, unknown>; supports: Support[]; licensing: { eligiblePurposes: string[] } };
export function declaration(capabilityId: string, supports: Support[], status: Record<string, unknown> = { state: "available", evidence: conformanceRefs },
  eligiblePurposes = ["local_evaluation"]): DeclarationBody {
  return { capabilityId, status, supports, licensing: { eligiblePurposes } };
}
function attestationOutcome(claim: DeclarationBody): Record<string, unknown> {
  const { state, evidence, attempt, ...rest } = claim.status as { state: string; evidence?: unknown; attempt?: unknown } & Record<string, unknown>;
  if (state === "available") return { state, supports: claim.supports, licensing: claim.licensing,
    conformance: { meaning: "every_declared_support_passed_attested_checks", evidence },
    configuration: { meaning: "executor_configured_in_environment", evidence: configurationRefs },
    resources: { meaning: "required_resources_present_at_observation", evidence: resourceRefs } };
  if (state === "failed") return { state, ...rest, attempt: { attemptedAt: TIME6, evidence: attempt } };
  return { state, ...rest, evidence };
}
/** Attestation bytes made by executorBody, keyed by objectId; graphInputs supplies exactly those its snapshot references. */
const attestations = new Map<string, SuppliedArtifact>();
export function attestation(claim: DeclarationBody, identity: typeof EXECUTOR = EXECUTOR, patch: Record<string, unknown> = {}) {
  const value = createCapabilityAttestation({ ...envelope("CapabilityAttestation"), scope, environment: ENVIRONMENT, observedAt: TIME6, executor: identity,
    capabilityId: claim.capabilityId, attester: { kind: "operator", actorId: "operator_synthetic" }, basis: "attester_supplied_check_results_no_probe",
    outcome: attestationOutcome(claim), ...patch });
  const item = supplied(value, value.attestationId);
  attestations.set(item.ref.objectId, item);
  return item;
}
export const VIDEO_SUPPORTS: Support[] = [member("time_mapping", "constant_speed_identity"), member("framing", "source_aspect_matches_output"),
  member("source_endpoint_precision", "frame_pts_exact", "source_seconds"), member("source_rotation", "rotation_0"), member("source_frame_timing", "constant_frame_rate"),
  member("source_codec", "codec_h264"), member("output_aspect", "aspect_9_16"), member("output_frame_rate", "fps_30_1"),
  atMost("output_width", 1080), atMost("output_height", 1920), atMost("output_duration_seconds_ceiling", 60), atMost("clip_count", 120)];
export function declarations(overrides: Record<string, DeclarationBody | null> = {}): DeclarationBody[] {
  const base: Record<string, DeclarationBody> = {
    timeline_video_clip: declaration("timeline_video_clip", VIDEO_SUPPORTS),
    timeline_source_audio: declaration("timeline_source_audio", [member("audio_linkage", "linked_identity"), atMost("clip_count", 120)]),
    transition_cut: declaration("transition_cut", [member("transition_kind", "cut"), atMost("join_count", 119)]),
    color_look: declaration("color_look", [member("look", "neutral", "warm", "cool"), member("target_kind", "whole_output", "clip_uses")]),
  };
  const merged = { ...base, ...overrides };
  return Object.values(merged).filter((d): d is DeclarationBody => d !== null);
}
export function executorBody(decls: DeclarationBody[] = declarations(), identity: typeof EXECUTOR = EXECUTOR) {
  return { ...identity, declarations: decls.map(claim => ({ capabilityId: claim.capabilityId, attestation: attestation(claim, identity).ref })) };
}
export function capabilitySnapshot(executors: unknown[] = [executorBody()], patch: Record<string, unknown> = {}) {
  return createCapabilitySnapshot({ ...envelope("CapabilitySnapshot"), scope, environment: ENVIRONMENT, asOf: TIME6,
    observation: "supplied_evidence_no_probe", executors, ...patch });
}
/** The attestation artifacts a snapshot references and executorBody or attestation() made; unknown references stay unsupplied. */
export function snapshotAttestations(snapshot: { executors: { declarations: { attestation: { objectId: string } }[] }[] }): SuppliedArtifact[] {
  const ids = new Set(snapshot.executors.flatMap(e => e.declarations.map(d => d.attestation.objectId)));
  return [...ids].sort().flatMap(id => attestations.has(id) ? [attestations.get(id)!] : []);
}
export function outputProfile(patch: Record<string, unknown> = {}) {
  return createEditOutputProfile({ ...envelope("EditOutputProfile"), scope, author: { kind: "owner", actorId: "owner_synthetic" },
    aspectRatio: { width: 9, height: 16 }, resolution: { width: 1080, height: 1920 }, frameRate: { numerator: 30, denominator: 1 },
    clock: { ticksPerSecond: 1_000_000_000 }, ...patch });
}
export function graphPolicy(patch: Record<string, unknown> = {}) {
  return createEditGraphPolicy({ ...envelope("EditGraphPolicy"), scope, author: { kind: "owner", actorId: "owner_synthetic" },
    construction: "chosen_gate5_sequence_v0", placement: "contiguous_cuts_from_zero_v0", timeMapping: "constant_speed_identity_v0",
    framing: "source_display_aspect_must_equal_output_v0", sourceAudio: "linked_identity", obligationRelaxation: "none_fail_closed_v0",
    deferredCheckVerification: "none_fail_closed_v0", executability: "single_executor_all_requirements_available_v0", ...patch });
}
export function obligation(p: Planned, nodeId: string) {
  const record = p.run.manifest.deferredObligations.find(o => o.nodeId === nodeId);
  if (!record) throw new Error(`Fixture node ${nodeId} is not a Gate-5 deferred obligation.`);
  return { nodeId, directionNode: record.directionNode };
}
export function resolution(p: Planned, nodeId: string, intentionKind: string, operation: Record<string, unknown>, patch: Record<string, unknown> = {}) {
  return createTechniqueResolution({ ...envelope("TechniqueResolution"), scope, author: { kind: "editor", actorId: "editor_synthetic" },
    planningDecision: p.decisionRef, direction: p.run.decision.direction, obligation: obligation(p, nodeId), intentionKind, operation,
    rules: "typed_intention_exact_v0", ...patch });
}
export const colorLook = (look: string, target: Record<string, unknown> = { kind: "whole_output" }, intensityPerMille = 500) =>
  ({ primitive: "color_look", look, intensityPerMille, target });
export function cutAt(p: Planned, fromIndex: number) {
  const uses = chosenOption(p).uses;
  return { primitive: "cut_transition", join: { fromUseId: uses[fromIndex]!.useId, toUseId: uses[fromIndex + 1]!.useId } };
}

export interface GraphOptions { profile?: Record<string, unknown>; policy?: Record<string, unknown>; snapshot?: ReturnType<typeof capabilitySnapshot>; resolutions?: ReturnType<typeof resolution>[]; extra?: SuppliedArtifact[] }
export function graphInputs(p: Planned, options: GraphOptions = {}) {
  const profileValue = outputProfile(options.profile), policyValue = graphPolicy(options.policy), snapshot = options.snapshot ?? capabilitySnapshot();
  const resolutions = options.resolutions ?? [];
  const profileArtifact = supplied(profileValue, profileValue.profileId), policyArtifact = supplied(policyValue, policyValue.policyId);
  const snapshotArtifact = supplied(snapshot, snapshot.snapshotId), resolutionArtifacts = resolutions.map(r => supplied(r, r.resolutionId));
  const artifacts = [...p.all, conformance, configuration, resources, unavailability, failedAttempt, profileArtifact, policyArtifact, snapshotArtifact,
    ...snapshotAttestations(snapshot), ...resolutionArtifacts, ...(options.extra ?? [])];
  const request = { planningDecision: p.decisionRef, policy: policyArtifact.ref, outputProfile: profileArtifact.ref,
    techniqueResolutions: resolutionArtifacts.map(a => a.ref), capabilitySnapshot: snapshotArtifact.ref };
  return { request, artifacts, profile: profileValue, policy: policyValue, snapshot, resolutions };
}
export function graphOf(p: Planned, options: GraphOptions = {}) {
  const inputs = graphInputs(p, options), graph = buildEditGraph(inputs.request, inputs.artifacts);
  const graphArtifact = supplied(graph, graph.editGraphId);
  return { ...inputs, graph, graphArtifact, artifacts: [...inputs.artifacts, graphArtifact] };
}
export type GraphFixture = ReturnType<typeof graphOf>;
export function projectionPolicy(patch: Record<string, unknown> = {}) {
  return createUepProjectionPolicy({ ...envelope("UepProjectionPolicy"), scope, author: { kind: "owner", actorId: "owner_synthetic" },
    target: { contractType: "UniversalEditPlan", schemaVersion: "1.0.0" }, subset: "frozen_uep_1_0_0_lossless_subset_v0",
    roleMapping: "exact_story_beat_role_names_v0", framingEncoding: "identity_cover_center_unit_scale_v0", sourceAudioEncoding: "linked_unity_else_zero_v0",
    telemetry: "truthful_public_decision_events_required_v0", reference: "legacy_validator_reference_1_0_0_only_v0", ...patch });
}
const referencePresent = (reference: unknown) => (reference as { state?: unknown } | null)?.state === "present";
export function reportOf(g: GraphFixture, reference: unknown = missing("not_applicable", "no_reference_required"), extra: SuppliedArtifact[] = [], policy = projectionPolicy(),
  referenceJoins: unknown = referencePresent(reference) ? missing("unavailable", "reference_join_evidence_not_supplied") : missing("not_applicable", "no_reference_required")) {
  const policyArtifact = supplied(policy, policy.projectionPolicyId);
  const artifacts = [...g.artifacts, policyArtifact, ...extra];
  const request = { editGraph: g.graphArtifact.ref, policy: policyArtifact.ref, reference, referenceJoins };
  const report = assessUepCompatibility(request, artifacts);
  return { report, request, artifacts, reportArtifact: supplied(report, report.reportId) };
}
export type VideoUse = Extract<EditGraph["clipUses"][number], { medium: "video" }>;
export function videoUses(graph: EditGraph): VideoUse[] {
  const track = graph.tracks.find(t => t.kind === "video")!;
  return track.clipUseIds.map(id => graph.clipUses.find(u => u.clipUseId === id)!).filter((u): u is VideoUse => u.medium === "video");
}

// ---------------------------------------------------------------- variant source chain
/**
 * A parameterized copy of the accepted Gate-4 synthetic direction chain (tests/support/planning.ts) for evidence the
 * accepted fixture cannot express: an audio stream, a verified public ClipSegment on each token, or a pinned source
 * MediaAsset of another kind. With no options it must reproduce the accepted fixture byte for byte; a focused test
 * asserts that equivalence.
 */
export function variantDirectionFixture(options: { hasAudio?: boolean; clipSegments?: boolean; assetKind?: "video" | "audio" } = {}) {
  const range = { startSeconds: 0, endSeconds: 2 };
  const f = tokenFixture(range);
  const analysis = structuredClone(f.analysis);
  analysis.candidates = [f.evidence];
  analysis.keptCandidateIds = analysis.candidates.map(c => c.candidate.candidateId);
  analysis.inventory.candidatesBeforeDeduplication = analysis.candidates.length;
  analysis.inventory.candidatesAfterDeduplication = analysis.candidates.length;
  const coverage = candidateCoverage(analysis.candidates.map(c => c.candidate), analysis.shots, analysis.metadata.durationSeconds);
  analysis.inventory.coverageBefore = coverage;
  analysis.inventory.coverageAfter = coverage;
  if (options.hasAudio) analysis.metadata = { ...analysis.metadata, hasAudio: true };
  const analysisArtifact = artifact(f.input.analysis.objectId, "FootageAnalysis", analysis, "1.0.0");
  const remap = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (record.objectId === f.input.analysis.objectId && "sha256" in record) return analysisArtifact.ref;
      return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, remap(v)]));
    }
    return value;
  };
  const suppliedSource = [analysisArtifact, ...f.supplied.filter(a => a.ref.objectId !== analysisArtifact.ref.objectId)];
  const input = remap(f.input) as typeof f.input, adapter = remap(f.adapter) as typeof f.adapter;
  const tokens = analysis.candidates.map((e, i) => {
    const sourceEvidence = [{ artifact: analysisArtifact.ref, pointer: `/candidates/${i}` }, { artifact: analysisArtifact.ref, pointer: "/authorization" }];
    let clipSegment = input.clipSegment;
    if (options.clipSegments) {
      const clip = { contractType: "ClipSegment", schemaVersion: "1.0.0", segmentId: e.candidate.candidateId, assetId: e.candidate.assetId, sourceRange: e.candidate.sourceRange,
        shotType: "unknown", subjectCount: null, motion: { camera: "unknown", subject: "unknown" }, composition: { framing: "unknown", subjectPosition: "unknown" },
        quality: { sharpness: null, exposure: null, stability: null }, semantics: { description: "", tags: [] }, facePresence: "unknown", personPresence: "unknown",
        poseTags: [], semanticEmbedding: e.semanticEmbedding, motionEmbedding: null,
        provenance: { producer: "footage_analyzer", producerVersion: FOOTAGE_VERSION, modelRunIds: ["run_synthetic"], createdAt: TIME6 } };
      const clipArtifact = artifact(`gate6_clip_segment_${i}`, "ClipSegment", clip, "1.0.0");
      suppliedSource.push(clipArtifact);
      clipSegment = present({ artifact: clipArtifact.ref, pointer: "" });
    }
    return resolveEditorialToken({ ...input, clipSegment, candidate: e.candidate, featureProducer: { ...input.featureProducer, sourceEvidence },
      adapter: { ...adapter, sourceEvidence } }, new EditorialArtifactMap(suppliedSource));
  });
  const token = tokens[0]!;
  const tokenArtifacts = tokens.map((t, index) => artifact(`gate4_token_${index}`, "EditorialToken", t));
  const tokenArtifact = tokenArtifacts[0]!;
  const set = createEditorialCandidateSet({ artifactType: "EditorialCandidateSet", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    projectId: scope.projectId, candidates: tokenArtifacts.map((item, i) => ({ candidateId: tokens[i]!.candidate.candidateId, token: item.ref })),
    analysisRefs: [input.analysis], runRefs: [token.producingRun.artifact], selectionPolicy: f.policyRef,
    universe: "retained", sourceRunStatus: "succeeded", failureEvidence: [] });
  const setArtifact = artifact("gate4_candidate_set", "EditorialCandidateSet", set);
  const media = artifact("gate4_media", "MediaAsset", { contractType: "MediaAsset", schemaVersion: "1.0.0", assetId: analysis.assetId,
    projectId: scope.projectId, creatorId: scope.creatorId, kind: options.assetKind ?? "video", objectId: "source_synthetic", durationSeconds: 4,
    origin: "synthetic", retention: { expiresAt: null, deletionRequestedAt: null } }, "1.0.0");
  const channels = [{ channel: "source_index", state: "complete" as const, evidence: present({ artifact: input.analysis, pointer: "/metadata/frameTimes" }) }];
  const coverageArtifact = artifact("gate4_coverage", "WorldCoverageEvidence", { artifactType: "WorldCoverageEvidence", artifactVersion: "0.1.0",
    ...scope, sourceAnalysisRefs: [input.analysis], channels, producer: adapter });
  const initial = [...suppliedSource, ...tokenArtifacts, setArtifact, media, coverageArtifact];
  const map = new EditorialArtifactMap(initial);
  const tokenLinks = tokenArtifacts.map(item => linkEditorialToken(item.ref, map, scope)).sort((a, b) => a.tokenId < b.tokenId ? -1 : 1);
  const supports: GroundedSupport[] = tokens.map((t, i) => ({ assetId: analysis.assetId, sourceHash: analysis.contentHash, analysis: input.analysis,
    shotId: t.candidate.shotId, range: t.candidate.sourceRange, rangeEvidence: { artifact: input.analysis, pointer: `/candidates/${i}/candidate/sourceRange` },
    timebase: { artifact: input.analysis, pointer: "/metadata/frameTimes" }, sample: missing("not_applicable", "range_support") }));
  const support = supports[0]!;
  const evidence = { artifact: input.analysis, pointer: "/authorization" };
  const identity: ComputationIdentity = { identityVersion: "perception-computation-1.0.0", operationKind: "synthetic_fixture_snapshot", computationClass: "deterministic_tool",
    inputs: [{ kind: "source", assetId: support.assetId, contentHash: support.sourceHash, sizeBytes: 1, support: { kind: "range", range: support.range, timebase: support.analysis } }],
    producer: { producerId: "synthetic_fixture_builder", implementationVersion: "0.1.0", implementationDigest: H, adapter: missing("not_applicable", "fixture") },
    model: missing("not_applicable", "synthetic_fixture_no_model"), preprocessing: missing("not_applicable", "fixture"), configurationDigest: H,
    semanticExecutionSettings: evidence, outputSchema: { artifactType: "FootageAnalysis", artifactVersion: "1.0.0", semanticSpace: missing("not_applicable", "fixture") },
    determinism: { kind: "deterministic", policy: evidence } };
  const key = computationKey(identity);
  const attempt = artifact("planning_fixture_attempt", "PerceptionAttempt", { ...envelope("PerceptionAttempt"), attemptId: "synthetic_fixture_attempt", computationKey: key,
    startedAt: "2026-09-23T00:00:00.000Z", endedAt: "2026-09-23T00:00:00.000Z", outcome: { state: "succeeded", output: input.analysis } });
  const selection = artifact("planning_fixture_selection", "PerceptionOutputSelection", { ...envelope("PerceptionOutputSelection"), selectionId: "synthetic_fixture_selection", computationKey: key,
    selectedAttempt: attempt.ref, selectedOutput: input.analysis, policyVersion: "0.1.0", evidence });
  const entry = { ...envelope("PerceptionArtifactEntry"), computationKey: key, identity, accepted: present({ output: input.analysis, attempt: attempt.ref, selection: selection.ref }),
    dependencies: computationDependencies(identity), attemptRefs: [attempt.ref],
    producerLifecycle: { producerId: identity.producer.producerId, producerVersion: identity.producer.implementationVersion, state: "active", evidence: input.analysis },
    accessBindings: [{ projectId: scope.projectId, creatorId: scope.creatorId, purposes: [scope.purpose], state: "eligible", evidence: input.analysis }] };
  const lookup = new PerceptionEvidenceStore([entry], [...suppliedSource, attempt, selection]).lookup(identity, scope);
  if (lookup.status !== "cache_hit") throw new Error("Synthetic Gate-1 fixture lookup failed.");
  initial.push(attempt, selection);
  const world = createWorldSnapshot({ ...scope, authorization: evidence, revision: 0, parent: missing("not_applicable", "initial_snapshot"), asOf: "2026-09-23T00:00:00.000Z",
    mediaTruthRefs: [input.analysis], observed: [], derived: [],
    entities: supports.map((value, i) => ({ entityId: `entity_candidate_${i}`, authority: "MediaTruth" as const, kind: "source_range", artifact: input.analysis, support: present(value) })),
    relationships: [], perceptionBindings: [{ receipt: lookup.receipt, identity, currentAuthorization: evidence, support }], tokenLinks,
    candidateLinks: tokenArtifacts.map((item, i) => ({ candidateId: tokens[i]!.candidate.candidateId, token: item.ref, entityId: `entity_candidate_${i}` })).sort((a, b) => a.candidateId < b.candidateId ? -1 : 1),
    candidateSetRefs: [setArtifact.ref], coverage: { evidence: { artifact: coverageArtifact.ref, pointer: "" }, channels },
    changeSet: { evidence, added: [], superseded: [], invalidated: [], unchanged: [] }, builder: adapter }, new EditorialArtifactMap(initial));
  const worldArtifact = artifact("gate4_world", "ProjectWorldModel", world);
  const worldQuery = { worldId: world.worldId, ...scope, currentAuthorization: evidence, currentAccess: [media.ref], accessAsOf: "2026-09-23T00:00:00.000Z",
    queryVersion: "0.1.0", authority: ["MediaTruth"], channels: ["source_index"], limit: 8, offset: 0 };
  const view = queryWorld(world, worldQuery, new EditorialArtifactMap([...initial, worldArtifact]));
  const viewArtifact = artifact("gate4_view", "ProjectWorldView", view);
  const canonArtifacts = CANON_V0.slice(0, 2).map(e => artifact(`gate4_${e.entryKey}`, "CanonEntry", e));
  const canonView = createCanonView({ scope, domain: "talking_head", selectionPolicy: "explicit_required_set", entries: canonArtifacts.map(item => item.ref) }, new EditorialArtifactMap(canonArtifacts));
  const canonViewArtifact = artifact("gate4_canon_view", "CanonView", canonView);
  const intent = createIntentSpec({ ...envelope("IntentSpec"), scope, revision: 0, parent: missing("not_applicable", "initial_intent"),
    author: { kind: "owner", actorId: "owner_synthetic" }, goal: "Make a clear short story.", domain: "talking_head", audience: "Interested viewers",
    outputRequirements: [{ requirementId: "output_short", description: "A concise output", priority: "hard" }],
    mustInclude: [{ requirementId: "include_subject", description: "Include the supplied speaker", priority: "hard" }], mustExclude: [] });
  const intentArtifact = artifact("gate4_intent", "IntentSpec", intent);
  const candidate = { candidateId: token.candidate.candidateId, token: tokenArtifact.ref };
  const summary = createCandidateSummary({ ...envelope("DirectorCandidateSummary"), scope, candidateSet: setArtifact.ref, worldSnapshot: worldArtifact.ref,
    worldView: viewArtifact.ref, coverage: "complete_declared_set", candidates: set.candidates, omittedCandidateIds: [], selectionPolicy: "explicit_supplied" },
    new EditorialArtifactMap([...initial, worldArtifact, viewArtifact]), world, view);
  const summaryArtifact = artifact("gate4_summary", "DirectorCandidateSummary", summary);
  const routingPolicy = artifact("gate4_routing_policy", "Evidence", { scope, order: "cost_then_latency_then_profile_id", requireEstimates: true });
  const routingPolicyRef = { artifact: routingPolicy.ref, pointer: "" };
  const computeGrant = artifact("gate4_compute_grant", "ComputeAuthorization", { version: "0.1.0", scope, grant: "compute", qualityTier: "tier_synthetic",
    cpuMilliseconds: 1000, gpuMilliseconds: 0, peakRamBytes: 10000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 1000, wallClockMilliseconds: 1000,
    modelCalls: 1, renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0, reservationPolicy: routingPolicyRef });
  const evaluationTarget = { modelId: "synthetic_director_model", exactRevision: H, adapterId: "synthetic_adapter", adapterVersion: "1.0.0", implementationDigest: H, capability: "director_reasoning" };
  const evaluationGrant = artifact("gate4_evaluation_grant", "EvaluationAuthorization", { version: "0.1.0", scope, grant: "model_capability_evaluation", qualityTier: "tier_synthetic", authorizedModels: [evaluationTarget] });
  const evaluation = artifact("gate4_evaluation", "ModelEvaluation", { version: "0.1.0", scope, authorizationRef: evaluationGrant.ref, qualityTier: "tier_synthetic", eligibleModels: [evaluationTarget] });
  const quality = artifact("gate4_quality", "QualityRequirement", { version: "0.1.0", scope, capability: "director_reasoning", qualityTier: "tier_synthetic", policy: routingPolicyRef });
  const availabilityEvidence = artifact("gate4_availability", "ModelAvailability", { version: "0.1.0", scope, modelId: evaluationTarget.modelId, exactRevision: H,
    adapterId: evaluationTarget.adapterId, adapterVersion: evaluationTarget.adapterVersion, implementationDigest: H, available: true, observedAt: "2026-09-23T00:00:00.000Z" });
  const availabilitySnapshot = artifact("gate4_availability_snapshot", "AvailabilitySnapshot", { version: "0.1.0", scope, observedAt: "2026-09-23T00:00:00.000Z",
    profiles: [{ modelId: evaluationTarget.modelId, exactRevision: H, adapterId: evaluationTarget.adapterId, adapterVersion: evaluationTarget.adapterVersion, implementationDigest: H, available: true }] });
  const revisionEvidence = artifact("gate4_revision_evidence", "Evidence", { revision: H });
  const resourceEvidence = artifact("gate4_resource_evidence", "Evidence", { scope, cpuMilliseconds: 10, gpuMilliseconds: 0, peakRamBytes: 100, peakVramBytes: 0 });
  const licenseEvidence = artifact("gate4_license_evidence", "Evidence", { commercial: true });
  const contextEvidence = artifact("gate4_context_evidence", "Evidence", { maximumTokens: 100 });
  const routing = [routingPolicy, computeGrant, evaluationGrant, evaluation, quality, availabilityEvidence, availabilitySnapshot, revisionEvidence, resourceEvidence, licenseEvidence, contextEvidence];
  const computeBudget = budget({ version: "0.1.0", scope, authorizationRef: computeGrant.ref, qualityTier: "tier_synthetic", cpuMilliseconds: 100, gpuMilliseconds: 0,
    peakRamBytes: 1000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 100, wallClockMilliseconds: 100, modelCalls: 1,
    renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0, childAllocations: [], reservationPolicy: routingPolicyRef }, routing);
  const budgetArtifact = artifact("gate4_budget", "ComputeBudget", computeBudget);
  const modelProfile = profile({ version: "0.1.0", scope, modelId: evaluationTarget.modelId, exactRevision: H, revisionEvidence: revisionEvidence.ref,
    adapter: { adapterId: evaluationTarget.adapterId, version: "1.0.0", implementationDigest: H }, capabilities: ["director_reasoning"], modalities: ["text"], deployment: "local",
    qualityTier: "tier_synthetic", qualityEvidence: present(evaluation.ref), contextLimits: { artifact: contextEvidence.ref, pointer: "" },
    expectedLatency: present({ value: 20, unit: "milliseconds", evidence: routingPolicyRef }), estimatedCost: present({ value: 30, unit: "inr_micros", evidence: routingPolicyRef }),
    resourceRequirements: { artifact: resourceEvidence.ref, pointer: "" }, licensing: { artifact: licenseEvidence.ref, pointer: "" }, commercialEligibility: present(true),
    availability: present({ artifact: availabilityEvidence.ref, pointer: "" }), observedAt: "2026-09-23T00:00:00.000Z" }, routing);
  const profileArtifact = artifact("gate4_profile", "ModelProfile", modelProfile);
  const capability = artifact("gate4_capability", "DirectorCapabilitySnapshot", { ...envelope("DirectorCapabilitySnapshot"), scope, capability: "director_reasoning", executionStatus: "selection_only_no_execution" });
  const preselection = { ...envelope("DirectorRequest"), scope, intent: intentArtifact.ref, worldView: viewArtifact.ref, candidateSummaryView: summaryArtifact.ref,
    audioMusicView: missing("not_computed", "audio_not_supplied"), referenceGrammar: missing("not_computed", "reference_not_supplied"), canonView: canonViewArtifact.ref,
    editingDNA: missing("not_computed", "editing_dna_not_implemented"), computeBudget: budgetArtifact.ref, capabilitySnapshot: capability.ref, modelSelection: profileArtifact.ref,
    outputRequirements: { artifact: intentArtifact.ref, pointer: "/outputRequirements" }, priorDirection: missing("not_applicable", "initial_direction"), revisionScope: missing("not_applicable", "initial_direction") };
  const modelSelection = selectModel({ scope, capability: "director_reasoning", qualityRequirement: { artifact: quality.ref, pointer: "" }, budget: computeBudget, budgetArtifact: budgetArtifact.ref,
    candidates: [{ profile: modelProfile, artifact: profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: routingPolicyRef, fallbackEscalationPolicy: routingPolicyRef, inputViewDigest: directorSelectionInputDigest(preselection) }, [...routing, budgetArtifact, profileArtifact]);
  const selectionArtifact = artifact("gate4_selection", "ModelSelection", modelSelection);
  const suppliedAll = [...initial, worldArtifact, viewArtifact, ...canonArtifacts, canonViewArtifact, intentArtifact, summaryArtifact, ...routing, budgetArtifact, profileArtifact, capability, selectionArtifact];
  const authority = { artifacts: suppliedAll, worldQuery };
  const request = createDirectorRequest({ ...preselection, modelSelection: selectionArtifact.ref }, authority);
  const requestArtifact = artifact("gate4_request", "DirectorRequest", request);
  suppliedAll.push(requestArtifact);
  const node = { nodeId: "node_hook", intent: { kind: "story_beat" as const, role: "hook" as const, description: "Hold longer near the words 'at 12 seconds'." },
    priority: "hard" as const, scope: { kind: "candidate" as const, candidate }, candidates: set.candidates, evidenceRefs: [{ artifact: input.analysis, pointer: "/candidates/0" }],
    canonEntryKeys: ["narrative_arc"], hypotheses: [], requirementIds: ["include_subject", "output_short"], uncertainty: { state: "unknown" as const, reasonCode: "synthetic_evidence", evidenceRefs: [] } };
  const directionBody = { ...envelope("CreativeDirectionGraph"), scope, request: requestArtifact.ref, worldSnapshot: worldArtifact.ref, candidateUniverse: setArtifact.ref,
    revision: 0, parent: missing("not_applicable", "initial_direction"), nodes: [node], edges: [], constraints: [], alternatives: [], hypotheses: [], unresolvedRequirements: [] };
  const direction = createCreativeDirectionGraph(directionBody, requestArtifact.ref, authority);
  const directionArtifact = artifact("gate4_direction", "CreativeDirectionGraph", direction);
  suppliedAll.push(directionArtifact);
  const grounding = createDirectorGroundingReport(requestArtifact.ref, present(directionArtifact.ref), authority);
  const groundingArtifact = artifact("gate4_grounding", "DirectorGroundingReport", grounding);
  suppliedAll.push(groundingArtifact);
  const producerRun = createDirectorProducerRun({ ...envelope("DirectorProducerRun"), scope, request: requestArtifact.ref, selection: selectionArtifact.ref,
    groundingReport: groundingArtifact.ref, direction: present(directionArtifact.ref), outcome: "succeeded", failure: missing("not_applicable", "no_failure"), basis: "synthetic_test", evidenceRefs: [] });
  const producerArtifact = artifact("gate4_producer", "DirectorProducerRun", producerRun);
  suppliedAll.push(producerArtifact);
  const runtime = { request: requestArtifact.ref, producerRun: producerArtifact.ref, groundingReport: groundingArtifact.ref,
    modelRun: missing("not_applicable", "no_director_model_run"), costTrace: missing("not_applicable", "no_truthful_director_telemetry_operation") };
  createDirectorResult({ outcome: "succeeded", direction: present(directionArtifact.ref), unresolvedRequirements: [],
    uncertainty: { state: "unknown", reasonCode: "synthetic_test_only", evidenceRefs: [] }, failure: missing("not_applicable", "no_failure") }, runtime, authority);
  // The shape consumed by planningFixture: only these fields are read.
  const shaped = { supplied: suppliedAll, request, requestArtifact, directionArtifact, worldArtifact, viewArtifact, worldQuery, setArtifact, set, budgetArtifact,
    direction, directionBody, authority, candidate };
  return shaped as unknown as Source;
}
export function suppliedRefs(artifacts: readonly SuppliedArtifact[]): ArtifactRef[] { return artifacts.map(a => a.ref); }
