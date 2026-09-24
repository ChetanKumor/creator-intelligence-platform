// Synthetic Gate-4 construction retained as a separate Gate-5 test helper. No media or model execution.
import { EditorialArtifactMap, exactDigest, missing, present, type SuppliedArtifact } from "../../packages/editorial/common.js";
import { canonicalSerialize } from "../../packages/domain/serialization.js";
import { createEditorialCandidateSet } from "../../packages/editorial/decision.js";
import { tokenFixture } from "./editorial.js";
import { resolveEditorialToken } from "../../packages/editorial/resolve.js";
import { candidateCoverage } from "../../packages/footage-analyzer/candidates.js";
import { PerceptionEvidenceStore, computationKey, computationDependencies, type ComputationIdentity } from "../../packages/perception/index.js";
import { createWorldSnapshot, linkEditorialToken, queryWorld } from "../../packages/world-model/index.js";
import { budget, profile, selectModel } from "../../packages/routing/index.js";
import { CANON_V0, createCanonView, createCandidateSummary, createCreativeDirectionGraph, createDirectorGroundingReport, createDirectorProducerRun, createDirectorRequest, createDirectorResult, createIntentSpec, directorSelectionInputDigest } from "../../packages/director/index.js";

export function artifact(objectId: string, artifactType: string, value: unknown, artifactVersion = "0.1.0"): SuppliedArtifact {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  return { ref: { objectId, artifactType, artifactVersion, sha256: exactDigest(bytes) }, bytes, value };
}

export const scope = { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" };
const TIME = "2026-09-23T00:00:00.000Z";
const H = "a".repeat(64);
const envelope = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: "0.1.0" as const, stability: "internal_pre_stable" as const });

function sourceFixture(range: { startSeconds: number; endSeconds: number }, secondCandidate: boolean) {
  const f = tokenFixture(range), others = secondCandidate ? [tokenFixture({ startSeconds: 2, endSeconds: 3 })] : [];
  const analysis = structuredClone(f.analysis);
  analysis.candidates = [f.evidence, ...others.map(o => o.evidence)];
  analysis.keptCandidateIds = analysis.candidates.map(c => c.candidate.candidateId);
  analysis.inventory.candidatesBeforeDeduplication = analysis.candidates.length;
  analysis.inventory.candidatesAfterDeduplication = analysis.candidates.length;
  const coverage = candidateCoverage(analysis.candidates.map(c => c.candidate), analysis.shots, analysis.metadata.durationSeconds);
  analysis.inventory.coverageBefore = coverage;
  analysis.inventory.coverageAfter = coverage;
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
  const supplied = [analysisArtifact, ...f.supplied.filter(a => a.ref.objectId !== analysisArtifact.ref.objectId)];
  const input = remap(f.input) as typeof f.input, adapter = remap(f.adapter) as typeof f.adapter;
  const tokens = analysis.candidates.map((e, i) => {
    const sourceEvidence = [{ artifact: analysisArtifact.ref, pointer: `/candidates/${i}` }, { artifact: analysisArtifact.ref, pointer: "/authorization" }];
    return resolveEditorialToken({ ...input, candidate: e.candidate, featureProducer: { ...input.featureProducer, sourceEvidence },
      adapter: { ...adapter, sourceEvidence } }, new EditorialArtifactMap(supplied));
  });
  return { ...f, analysis, input, adapter, supplied, token: tokens[0]!, tokens };
}

function perceptionFixture(f: ReturnType<typeof sourceFixture>, support: import("../../packages/world-model/index.js").GroundedSupport) {
  const evidence = { artifact: f.input.analysis, pointer: "/authorization" };
  const identity: ComputationIdentity = { identityVersion: "perception-computation-1.0.0", operationKind: "synthetic_fixture_snapshot", computationClass: "deterministic_tool",
    inputs: [{ kind: "source", assetId: support.assetId, contentHash: support.sourceHash, sizeBytes: 1, support: { kind: "range", range: support.range, timebase: support.analysis } }],
    producer: { producerId: "synthetic_fixture_builder", implementationVersion: "0.1.0", implementationDigest: H, adapter: missing("not_applicable", "fixture") },
    model: missing("not_applicable", "synthetic_fixture_no_model"), preprocessing: missing("not_applicable", "fixture"), configurationDigest: H,
    semanticExecutionSettings: evidence, outputSchema: { artifactType: "FootageAnalysis", artifactVersion: "1.0.0", semanticSpace: missing("not_applicable", "fixture") },
    determinism: { kind: "deterministic", policy: evidence } };
  const key = computationKey(identity);
  const attempt = artifact("planning_fixture_attempt", "PerceptionAttempt", { ...envelope("PerceptionAttempt"), attemptId: "synthetic_fixture_attempt", computationKey: key,
    startedAt: TIME, endedAt: TIME, outcome: { state: "succeeded", output: f.input.analysis } });
  const selection = artifact("planning_fixture_selection", "PerceptionOutputSelection", { ...envelope("PerceptionOutputSelection"), selectionId: "synthetic_fixture_selection", computationKey: key,
    selectedAttempt: attempt.ref, selectedOutput: f.input.analysis, policyVersion: "0.1.0", evidence });
  const entry = { ...envelope("PerceptionArtifactEntry"), computationKey: key, identity, accepted: present({ output: f.input.analysis, attempt: attempt.ref, selection: selection.ref }),
    dependencies: computationDependencies(identity), attemptRefs: [attempt.ref],
    producerLifecycle: { producerId: identity.producer.producerId, producerVersion: identity.producer.implementationVersion, state: "active", evidence: f.input.analysis },
    accessBindings: [{ projectId: scope.projectId, creatorId: scope.creatorId, purposes: [scope.purpose], state: "eligible", evidence: f.input.analysis }] };
  const artifacts = [attempt, selection];
  const lookup = new PerceptionEvidenceStore([entry], [...f.supplied, ...artifacts]).lookup(identity, scope);
  if (lookup.status !== "cache_hit") throw new Error("Synthetic Gate-1 fixture lookup failed.");
  return { artifacts, lookup, binding: { receipt: lookup.receipt, identity, currentAuthorization: evidence, support } };
}

export function directionFixture(revisionLimit = 0, noEligibleModel = false, range = { startSeconds: 0, endSeconds: 2 }, secondCandidate = false, exclusion = false, omitSourceView = false) {
  const f = sourceFixture(range, secondCandidate);
  const tokenArtifacts = f.tokens.map((token, index) => artifact(`gate4_token_${index}`, "EditorialToken", token));
  const tokenArtifact = tokenArtifacts[0]!;
  const set = createEditorialCandidateSet({ artifactType: "EditorialCandidateSet", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    projectId: scope.projectId, candidates: tokenArtifacts.map((item, i) => ({ candidateId: f.tokens[i]!.candidate.candidateId, token: item.ref })),
    analysisRefs: [f.input.analysis], runRefs: [f.token.producingRun.artifact], selectionPolicy: f.policyRef,
    universe: "retained", sourceRunStatus: "succeeded", failureEvidence: [] });
  const setArtifact = artifact("gate4_candidate_set", "EditorialCandidateSet", set);
  const media = artifact("gate4_media", "MediaAsset", { contractType: "MediaAsset", schemaVersion: "1.0.0", assetId: f.analysis.assetId,
    projectId: scope.projectId, creatorId: scope.creatorId, kind: "video", objectId: "source_synthetic", durationSeconds: 4,
    origin: "synthetic", retention: { expiresAt: null, deletionRequestedAt: null } }, "1.0.0");
  const channels = [{ channel: "source_index", state: "complete" as const, evidence: present({ artifact: f.input.analysis, pointer: "/metadata/frameTimes" }) }];
  const coverage = artifact("gate4_coverage", "WorldCoverageEvidence", { artifactType: "WorldCoverageEvidence", artifactVersion: "0.1.0",
    ...scope, sourceAnalysisRefs: [f.input.analysis], channels, producer: f.adapter });
  const initial = [...f.supplied, ...tokenArtifacts, setArtifact, media, coverage];
  const map = new EditorialArtifactMap(initial);
  const tokenLinks = tokenArtifacts.map(item => linkEditorialToken(item.ref, map, scope)).sort((a,b) => a.tokenId < b.tokenId ? -1 : 1);
  const supports = f.tokens.map((token, i) => ({ assetId: f.analysis.assetId, sourceHash: f.analysis.contentHash, analysis: f.input.analysis,
    shotId: token.candidate.shotId, range: token.candidate.sourceRange,
    rangeEvidence: { artifact: f.input.analysis, pointer: `/candidates/${i}/candidate/sourceRange` },
    timebase: { artifact: f.input.analysis, pointer: "/metadata/frameTimes" }, sample: missing("not_applicable", "range_support") }));
  const support = supports[0]!;
  const perception = perceptionFixture(f, support);
  initial.push(...perception.artifacts);
  const world = createWorldSnapshot({ ...scope, authorization: { artifact: f.input.analysis, pointer: "/authorization" },
    revision: 0, parent: missing("not_applicable", "initial_snapshot"), asOf: TIME, mediaTruthRefs: [f.input.analysis],
    observed: [], derived: [], entities: supports.map((value,i) => ({ entityId: `entity_candidate_${i}`, authority: "MediaTruth" as const, kind: "source_range", artifact: f.input.analysis, support: present(value) })),
    relationships: [], perceptionBindings: [perception.binding], tokenLinks, candidateLinks: tokenArtifacts.map((item,i) => ({ candidateId: f.tokens[i]!.candidate.candidateId, token: item.ref, entityId: `entity_candidate_${i}` })).sort((a,b) => a.candidateId < b.candidateId ? -1 : 1),
    candidateSetRefs: [setArtifact.ref], coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels },
    changeSet: { evidence: { artifact: f.input.analysis, pointer: "/authorization" }, added: [], superseded: [], invalidated: [], unchanged: [] }, builder: f.adapter }, new EditorialArtifactMap(initial));
  const worldArtifact = artifact("gate4_world", "ProjectWorldModel", world);
  const worldQuery = { worldId: world.worldId, ...scope, currentAuthorization: { artifact: f.input.analysis, pointer: "/authorization" },
    currentAccess: [media.ref], accessAsOf: TIME, queryVersion: "0.1.0", authority: [omitSourceView ? "ObservedFact" : "MediaTruth"], channels: ["source_index"], limit: 8, offset: 0 };
  const view = queryWorld(world, worldQuery, new EditorialArtifactMap([...initial, worldArtifact]));
  const viewArtifact = artifact("gate4_view", "ProjectWorldView", view);
  const canonArtifacts = CANON_V0.slice(0, 2).map(entry => artifact(`gate4_${entry.entryKey}`, "CanonEntry", entry));
  const canonView = createCanonView({ scope, domain: "talking_head", selectionPolicy: "explicit_required_set", entries: canonArtifacts.map(item => item.ref) }, new EditorialArtifactMap(canonArtifacts));
  const canonViewArtifact = artifact("gate4_canon_view", "CanonView", canonView);
  const intent = createIntentSpec({ ...envelope("IntentSpec"), scope, revision: 0, parent: missing("not_applicable", "initial_intent"),
    author: { kind: "owner", actorId: "owner_synthetic" }, goal: "Make a clear short story.", domain: "talking_head", audience: "Interested viewers",
    outputRequirements: [{ requirementId: "output_short", description: "A concise output", priority: "hard" }],
    mustInclude: [{ requirementId: "include_subject", description: "Include the supplied speaker", priority: "hard" }],
    mustExclude: exclusion ? [{ requirementId: "exclude_unknown", description: "Exclude unsupported content", priority: "hard" }] : [] });
  const intentArtifact = artifact("gate4_intent", "IntentSpec", intent);
  const candidate = { candidateId: f.token.candidate.candidateId, token: tokenArtifact.ref };
  const summary = createCandidateSummary({ ...envelope("DirectorCandidateSummary"), scope, candidateSet: setArtifact.ref,
    worldSnapshot: worldArtifact.ref, worldView: viewArtifact.ref, coverage: "complete_declared_set", candidates: set.candidates,
    omittedCandidateIds: [], selectionPolicy: "explicit_supplied" }, new EditorialArtifactMap([...initial, worldArtifact, viewArtifact]), world, view);
  const summaryArtifact = artifact("gate4_summary", "DirectorCandidateSummary", summary);
  const routingPolicy = artifact("gate4_routing_policy", "Evidence", { scope, order: "cost_then_latency_then_profile_id", requireEstimates: true });
  const routingPolicyRef = { artifact: routingPolicy.ref, pointer: "" };
  const computeGrant = artifact("gate4_compute_grant", "ComputeAuthorization", { version: "0.1.0", scope, grant: "compute", qualityTier: "tier_synthetic",
    cpuMilliseconds: 1000, gpuMilliseconds: 0, peakRamBytes: 10000, peakVramBytes: 0, apiSpendInrMicros: 0,
    totalCostInrMicros: 1000, wallClockMilliseconds: 1000, modelCalls: 1, renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 },
    premiumOperations: [], retryLimit: 0, directorRevisionLimit: revisionLimit, reservationPolicy: routingPolicyRef });
  const evaluationTarget = { modelId: "synthetic_director_model", exactRevision: H, adapterId: "synthetic_adapter", adapterVersion: "1.0.0",
    implementationDigest: H, capability: "director_reasoning" };
  const evaluationGrant = artifact("gate4_evaluation_grant", "EvaluationAuthorization", { version: "0.1.0", scope, grant: "model_capability_evaluation",
    qualityTier: "tier_synthetic", authorizedModels: [evaluationTarget] });
  const evaluation = artifact("gate4_evaluation", "ModelEvaluation", { version: "0.1.0", scope, authorizationRef: evaluationGrant.ref,
    qualityTier: "tier_synthetic", eligibleModels: [evaluationTarget] });
  const quality = artifact("gate4_quality", "QualityRequirement", { version: "0.1.0", scope, capability: "director_reasoning",
    qualityTier: "tier_synthetic", policy: routingPolicyRef });
  const availabilityEvidence = artifact("gate4_availability", "ModelAvailability", { version: "0.1.0", scope, modelId: evaluationTarget.modelId,
    exactRevision: H, adapterId: evaluationTarget.adapterId, adapterVersion: evaluationTarget.adapterVersion,
    implementationDigest: H, available: true, observedAt: TIME });
  const availabilitySnapshot = artifact("gate4_availability_snapshot", "AvailabilitySnapshot", { version: "0.1.0", scope, observedAt: TIME,
    profiles: [{ modelId: evaluationTarget.modelId, exactRevision: H, adapterId: evaluationTarget.adapterId,
      adapterVersion: evaluationTarget.adapterVersion, implementationDigest: H, available: true }] });
  const revisionEvidence = artifact("gate4_revision_evidence", "Evidence", { revision: H });
  const resourceEvidence = artifact("gate4_resource_evidence", "Evidence", { scope, cpuMilliseconds: 10, gpuMilliseconds: 0, peakRamBytes: 100, peakVramBytes: 0 });
  const licenseEvidence = artifact("gate4_license_evidence", "Evidence", { commercial: true });
  const contextEvidence = artifact("gate4_context_evidence", "Evidence", { maximumTokens: 100 });
  const routing = [routingPolicy, computeGrant, evaluationGrant, evaluation, quality, availabilityEvidence, availabilitySnapshot,
    revisionEvidence, resourceEvidence, licenseEvidence, contextEvidence];
  const computeBudget = budget({ version: "0.1.0", scope, authorizationRef: computeGrant.ref, qualityTier: "tier_synthetic",
    cpuMilliseconds: 100, gpuMilliseconds: 0, peakRamBytes: 1000, peakVramBytes: 0, apiSpendInrMicros: 0,
    totalCostInrMicros: 100, wallClockMilliseconds: 100, modelCalls: 1, renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 },
    premiumOperations: [], retryLimit: 0, directorRevisionLimit: revisionLimit, childAllocations: [], reservationPolicy: routingPolicyRef }, routing);
  const budgetArtifact = artifact("gate4_budget", "ComputeBudget", computeBudget);
  const modelProfile = profile({ version: "0.1.0", scope, modelId: evaluationTarget.modelId, exactRevision: H, revisionEvidence: revisionEvidence.ref,
    adapter: { adapterId: evaluationTarget.adapterId, version: "1.0.0", implementationDigest: H }, capabilities: ["director_reasoning"], modalities: ["text"],
    deployment: "local", qualityTier: "tier_synthetic", qualityEvidence: present(evaluation.ref), contextLimits: { artifact: contextEvidence.ref, pointer: "" },
    expectedLatency: present({ value: 20, unit: "milliseconds", evidence: routingPolicyRef }), estimatedCost: present({ value: 30, unit: "inr_micros", evidence: routingPolicyRef }),
    resourceRequirements: { artifact: resourceEvidence.ref, pointer: "" }, licensing: { artifact: licenseEvidence.ref, pointer: "" }, commercialEligibility: present(true),
    availability: present({ artifact: availabilityEvidence.ref, pointer: "" }), observedAt: TIME }, routing);
  const profileArtifact = artifact("gate4_profile", "ModelProfile", modelProfile);
  const capability = artifact("gate4_capability", "DirectorCapabilitySnapshot", { ...envelope("DirectorCapabilitySnapshot"), scope,
    capability: "director_reasoning", executionStatus: "selection_only_no_execution" });
  const preselection = { ...envelope("DirectorRequest"), scope, intent: intentArtifact.ref, worldView: viewArtifact.ref,
    candidateSummaryView: summaryArtifact.ref, audioMusicView: missing("not_computed", "audio_not_supplied"),
    referenceGrammar: missing("not_computed", "reference_not_supplied"), canonView: canonViewArtifact.ref,
    editingDNA: missing("not_computed", "editing_dna_not_implemented"), computeBudget: budgetArtifact.ref,
    capabilitySnapshot: capability.ref, modelSelection: profileArtifact.ref,
    outputRequirements: { artifact: intentArtifact.ref, pointer: "/outputRequirements" },
    priorDirection: missing("not_applicable", "initial_direction"), revisionScope: missing("not_applicable", "initial_direction") };
  const modelSelection = selectModel({ scope, capability: "director_reasoning", qualityRequirement: { artifact: quality.ref, pointer: "" },
    budget: computeBudget, budgetArtifact: budgetArtifact.ref, candidates: noEligibleModel ? [] : [{ profile: modelProfile, artifact: profileArtifact.ref }],
    evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: routingPolicyRef, fallbackEscalationPolicy: routingPolicyRef, inputViewDigest: directorSelectionInputDigest(preselection) }, [...routing, budgetArtifact, profileArtifact]);
  const selectionArtifact = artifact("gate4_selection", "ModelSelection", modelSelection);
  const requestBody = { ...preselection, modelSelection: selectionArtifact.ref };
  const supplied = [...initial, worldArtifact, viewArtifact, ...canonArtifacts, canonViewArtifact, intentArtifact, summaryArtifact,
    ...routing, budgetArtifact, profileArtifact, capability, selectionArtifact];
  const authority = { artifacts: supplied, worldQuery };
  const request = createDirectorRequest(requestBody, authority);
  const requestArtifact = artifact("gate4_request", "DirectorRequest", request);
  supplied.push(requestArtifact);
  const node = { nodeId: "node_hook", intent: { kind: "story_beat" as const, role: "hook" as const, description: "Hold longer near the words 'at 12 seconds'." },
    priority: "hard" as const, scope: { kind: "candidate" as const, candidate }, candidates: set.candidates,
    evidenceRefs: omitSourceView ? [] : [{ artifact: f.input.analysis, pointer: "/candidates/0" }], canonEntryKeys: ["narrative_arc"], hypotheses: [],
    requirementIds: ["include_subject", "output_short"], uncertainty: { state: "unknown" as const, reasonCode: "synthetic_evidence", evidenceRefs: [] } };
  const directionBody = { ...envelope("CreativeDirectionGraph"), scope, request: requestArtifact.ref, worldSnapshot: worldArtifact.ref,
    candidateUniverse: setArtifact.ref, revision: 0, parent: missing("not_applicable", "initial_direction"), nodes: [node], edges: [],
    constraints: exclusion ? [{ constraintId: "constraint_exclusion", subjectId: "exclude_unknown", stance: "exclude" as const, priority: "hard" as const, nodeId: "node_hook" }] : [],
    alternatives: [], hypotheses: [], unresolvedRequirements: [] };
  const direction = createCreativeDirectionGraph(directionBody, requestArtifact.ref, authority);
  const directionArtifact = artifact("gate4_direction", "CreativeDirectionGraph", direction);
  supplied.push(directionArtifact);
  const grounding = createDirectorGroundingReport(requestArtifact.ref, present(directionArtifact.ref), authority);
  const groundingArtifact = artifact("gate4_grounding", "DirectorGroundingReport", grounding);
  supplied.push(groundingArtifact);
  const producerRun = createDirectorProducerRun({ ...envelope("DirectorProducerRun"), scope, request: requestArtifact.ref,
    selection: selectionArtifact.ref, groundingReport: groundingArtifact.ref, direction: present(directionArtifact.ref),
    outcome: "succeeded", failure: missing("not_applicable", "no_failure"), basis: "synthetic_test", evidenceRefs: [] });
  const producerArtifact = artifact("gate4_producer", "DirectorProducerRun", producerRun);
  supplied.push(producerArtifact);
  const runtime = { request: requestArtifact.ref, producerRun: producerArtifact.ref, groundingReport: groundingArtifact.ref,
    modelRun: missing("not_applicable", "no_director_model_run"), costTrace: missing("not_applicable", "no_truthful_director_telemetry_operation") };
  const proposal = { outcome: "succeeded", direction: present(directionArtifact.ref), unresolvedRequirements: [],
    uncertainty: { state: "unknown", reasonCode: "synthetic_test_only", evidenceRefs: [] }, failure: missing("not_applicable", "no_failure") };
  const result = createDirectorResult(proposal, runtime, authority);
  return { f, support, perception, tokenArtifacts, set, setArtifact, world, worldArtifact, worldQuery, view, viewArtifact, canonArtifacts, canonView, canonViewArtifact,
    intent, intentArtifact, summary, summaryArtifact, candidate, computeBudget, budgetArtifact, modelSelection, selectionArtifact,
    routing, routingPolicyRef, quality, evaluation, availabilitySnapshot, modelProfile, profileArtifact,
    capability, requestBody, request, requestArtifact, directionBody, direction, directionArtifact, grounding, groundingArtifact,
    producerRun, producerArtifact, runtime, proposal, result, supplied, authority };
}
