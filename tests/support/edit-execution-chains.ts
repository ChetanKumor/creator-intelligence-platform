// Test-only Gate-7 source chains built solely from accepted Gate 1–6 APIs: custom frame tables and several source assets.
// A parameterized generalization of the accepted variant chain (tests/support/edit-graph.ts). No media, model or network.
import { EditorialArtifactMap, missing, present, type ArtifactRef, type Producer, type SuppliedArtifact } from "../../packages/editorial/common.js";
import { contentId } from "../../packages/reference-analyzer/features.js";
import { EMBEDDING_IMPLEMENTATION, embeddingCacheKey, embeddingSpaceId } from "../../packages/reference-analyzer/embeddings.js";
import type { MediaMetadata } from "../../packages/reference-analyzer/protocol.js";
import { FootageAnalysisSchema, MEASUREMENT_VERSION, type Candidate, type CandidateEvidence } from "../../packages/footage-analyzer/protocol.js";
import { candidateCoverage } from "../../packages/footage-analyzer/candidates.js";
import { resolveEditorialToken, type TokenResolutionInput } from "../../packages/editorial/resolve.js";
import { createEditorialCandidateSet } from "../../packages/editorial/decision.js";
import { createWorldSnapshot, linkEditorialToken, queryWorld, type GroundedSupport } from "../../packages/world-model/index.js";
import { budget, profile, selectModel } from "../../packages/routing/index.js";
import { CANON_V0, createCanonView, createCandidateSummary, createCreativeDirectionGraph, createDirectorGroundingReport, createDirectorProducerRun, createDirectorRequest,
  createDirectorResult, createIntentSpec, directorSelectionInputDigest } from "../../packages/director/index.js";
import { artifact as editorialArtifact } from "./editorial.js";
import { cheapEvidence, footageMetadata, stubConfig } from "./footage.js";
import { artifact, directionFixture } from "./planning.js";

type Source = ReturnType<typeof directionFixture>;
const TIME = "2026-09-21T00:00:00.000Z", WORLD_TIME = "2026-09-23T00:00:00.000Z", H = "a".repeat(64);
const envelope = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: "0.1.0" as const, stability: "internal_pre_stable" as const });
const scope = { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" };

export interface ChainSource {
  /** Distinguishes this source's artifact object IDs inside one chain. */
  key: string;
  hash: string;
  /** Default: `asset_<hash>`, as the accepted fixtures derive it. */
  assetId?: string;
  /** Default: the accepted 4-second, 10 fps synthetic frame table. */
  metadata?: MediaMetadata;
  /** The single candidate range; default [0, 2) seconds. */
  range?: { startSeconds: number; endSeconds: number };
  /** Source-level authorization scope; default the synthetic scope. */
  owner?: { projectId: string; creatorId: string };
}
/** A 4-second frame table at 20 fps on [0, 2) then 10 fps on [2, 4): equal seconds, different frame endpoints and timebase. */
export function variableFrameMetadata(): MediaMetadata {
  const frameTimes = [...Array.from({ length: 40 }, (_, i) => i / 20), ...Array.from({ length: 20 }, (_, i) => 2 + i / 10)];
  return { ...footageMetadata(4), fps: { numerator: 15, denominator: 1 }, frameCount: frameTimes.length, frameTimes, variableFrameRate: true };
}

/** One source: its analysis (one retained candidate), run, token and producers, exactly as the accepted token fixture builds them. */
function sourceOf(spec: ChainSource) {
  const configuration = stubConfig(), hash = spec.hash, assetId = spec.assetId ?? `asset_${hash}`, shotId = "shot_synthetic";
  const range = spec.range ?? { startSeconds: 0, endSeconds: 2 }, metadata = spec.metadata ?? footageMetadata(4), owner = spec.owner ?? scope;
  const frameIndex = (atSeconds: number) => {
    const index = metadata.frameTimes.indexOf(atSeconds);
    if (index < 0) throw new Error(`Test chain: no source frame at ${atSeconds} s.`);
    return index;
  };
  const cheap = cheapEvidence([0.5, 1.5, 2, 3.5].map((atSeconds, i) => ({ sampleId: `sample_${i}`, shotId, atSeconds, frameIndex: frameIndex(atSeconds) })));
  for (const f of cheap) { f.measurement.brightnessMean = 0; f.measurementId = contentId("measurement", [f.sample, f.measurement, f.frameContentHash, MEASUREMENT_VERSION]); }
  const reference = (objectId: string) => ({ embeddingId: contentId("embedding", objectId), objectId, spaceId: embeddingSpaceId(configuration.embedding), spaceVersion: "normalized-mean-v1",
    dimensions: 8, distance: "cosine" as const });
  const frames = [cheap[0]!, cheap[2]!, cheap[3]!].map(f => ({ ...f.sample, frameContentHash: f.frameContentHash,
    embedding: reference(embeddingCacheKey(hash, [contentId("sample", ["decoded-png-v1", f.frameContentHash])], configuration.embedding, "frame")), selectionReasons: ["temporal_coverage" as const] }));
  const proposalConfigurationId = contentId("proposal", [configuration.proposal, cheap.map(f => f.measurementId)]);
  const candidate: Candidate = { assetId, shotId, sourceRange: range, proposalConfigurationId, proposalVersion: "coverage-multiscale-v1",
    candidateId: contentId("segment", [assetId, shotId, range, proposalConfigurationId]) };
  function select<T extends { atSeconds: number }>(all: T[]) {
    const inside = all.filter(f => f.atSeconds >= range.startSeconds && f.atSeconds < range.endSeconds);
    const middle = (range.startSeconds + range.endSeconds) / 2;
    return inside.length ? inside : [[...all].sort((a, b) => Math.abs(a.atSeconds - middle) - Math.abs(b.atSeconds - middle) || a.atSeconds - b.atSeconds)[0]!];
  }
  const semantic = select(frames), samples = select(cheap.map(f => f.sample)), ids = samples.map(f => f.sampleId), measurements = cheap.filter(f => ids.includes(f.sample.sampleId));
  const within = (t: number) => t >= range.startSeconds && t < range.endSeconds;
  const hasPair = measurements.some(f => within(f.sample.atSeconds) && f.measurement.comparisonSampleId !== null && ids.includes(f.measurement.comparisonSampleId));
  const evidence: CandidateEvidence = { candidate, contributingSemanticFrameIds: semantic.map(f => f.sampleId), contributingMeasurementIds: measurements.map(f => f.measurementId),
    contributingCheapSampleIds: ids, semanticEmbedding: reference(embeddingCacheKey(hash, semantic.map(f => f.embedding.embeddingId), configuration.embedding, "normalized-mean-v1")),
    semanticSupport: within(semantic[0]!.atSeconds) ? "within_segment" : "same_shot_context",
    semanticContextDistanceSeconds: Math.min(...semantic.map(f => Math.max(range.startSeconds - f.atSeconds, f.atSeconds - range.endSeconds, 0))),
    cheapSupport: within(samples[0]!.atSeconds) ? "within_segment" : "same_shot_context", aggregationVersion: "footage-evidence-v1",
    aggregationId: contentId("aggregation", [candidate, semantic.map(f => f.embedding), measurements.map(f => f.measurementId), "footage-evidence-v1"]),
    signals: { brightnessMean: 0, darkPixelFraction: 0, brightPixelFraction: 0, laplacianVariance: 100, frameDifferenceMean: hasPair ? 0 : null, opticalFlowPixelsPerSecond: hasPair ? 0 : null,
      sharpnessIndicator: 0.5, unclippedPixelFraction: 1, stabilityIndicator: hasPair ? 1 : null } };
  const shots = [{ shotId, startSeconds: 0, endSeconds: metadata.durationSeconds }], coverage = candidateCoverage([candidate], shots, metadata.durationSeconds);
  const analysisId = `analysis_${spec.key}`;
  const analysis = FootageAnalysisSchema.parse({ artifactType: "FootageAnalysis", artifactVersion: "1.0.0", analysisId, assetId, contentHash: hash,
    authorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.0.0", contentHash: hash, sizeBytes: 1, sourceType: "synthetic", authorizationBasis: "synthetic_generated",
      allowedPurposes: ["local_footage_analysis", "local_evaluation"], dateAdded: TIME, creatorId: owner.creatorId, projectId: owner.projectId },
    configuration, configurationId: contentId("configuration", configuration), embeddingImplementation: EMBEDDING_IMPLEMENTATION, metadata, shots, cheapFeatures: cheap,
    semanticFrames: frames, candidates: [evidence], keptCandidateIds: [candidate.candidateId], prunedCandidates: [],
    inventory: { assetId, analysisId, durationSeconds: metadata.durationSeconds, sourceShots: 1, cheapFramesAnalyzed: 4, semanticSamplesRequested: 3, semanticSamplesSelected: 3,
      semanticSamplesEmbedded: 0, uniqueSemanticFrames: 1, reducedCheapResolution: false, reducedSemanticCoverage: false, candidatesBeforeDeduplication: 1, candidatesAfterDeduplication: 1,
      coverageBefore: coverage, coverageAfter: coverage, embeddingSpace: frames[0]!.embedding } });
  const modelRun = { contractType: "ModelRun", schemaVersion: "1.0.0", runId: "run_synthetic", scope: { projectId: owner.projectId, creatorId: owner.creatorId, jobId: "job_synthetic",
    environment: "synthetic" }, provider: "footage_analyzer", model: "stub", modelVersion: "stub-v1", adapterVersion: "0.2.0", operation: "footage_analysis", inputIds: [assetId],
    outputIds: [], startedAt: TIME, endedAt: TIME, status: "succeeded", errorCode: null };
  const analysisArtifact = editorialArtifact(`gate7_analysis_${spec.key}`, "FootageAnalysis", analysis, "1.0.0");
  const runArtifact = editorialArtifact(`gate7_run_${spec.key}`, "FootageRun", { jobId: "job_synthetic", status: "succeeded", configuration, modelRuns: [modelRun] });
  const policyArtifact = editorialArtifact("gate7_editorial_policy", "EditorialPolicy", { policyId: "synthetic_policy", policyVersion: "0.1.0" });
  const implementationArtifact = editorialArtifact("gate7_implementation", "ImplementationDescriptor", { implementationId: "CandidateFeatureAggregator",
    aggregationVersion: "footage-evidence-v1", sourceSha256: "46024d6af6743868e30504cf35cb26c1acfcc1eb5025e35544744edd273c0cf8" });
  const at = (pointer: string) => ({ artifact: analysisArtifact.ref, pointer }), policyRef = { artifact: policyArtifact.ref, pointer: "" };
  const featureProducer: Producer = { producerId: "footage_analyzer", producerVersion: "0.2.0", configuration: at("/configuration"), implementation: present(at("/embeddingImplementation")),
    sourceEvidence: [at("/candidates/0"), at("/authorization")], mediaBasis: "synthetic", computationBasis: "synthetic_stub", runEvidence: present([{ artifact: runArtifact.ref, pointer: "" }]) };
  const adapter: Producer = { ...featureProducer, producerId: "editorial_adapter", producerVersion: "0.1.0", computationBasis: "deterministic", configuration: policyRef };
  const input: TokenResolutionInput = { projectId: owner.projectId, candidate, analysis: analysisArtifact.ref, producingRun: { jobId: "job_synthetic", artifact: runArtifact.ref },
    clipSegment: missing("unavailable", "clip_not_supplied"), featureProducer, adapter, aggregationImplementation: present({ artifact: implementationArtifact.ref, pointer: "" }) };
  const supplied = [analysisArtifact, runArtifact, policyArtifact, implementationArtifact];
  const token = resolveEditorialToken(input, new EditorialArtifactMap(supplied));
  return { spec, analysis, analysisArtifact, runArtifact, policyRef, adapter, input, token, supplied, owner };
}

function unique(artifacts: readonly SuppliedArtifact[]): SuppliedArtifact[] {
  return [...new Map(artifacts.map(a => [a.ref.objectId, a])).values()];
}
const byText = <T>(key: (value: T) => string) => (a: T, b: T) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;

/**
 * A replay-valid Gate-4 direction chain over several sources. Each source has one candidate, bound to its own hard story
 * node; consecutive nodes carry an `intended_order` edge, so Gate-5 search chooses exactly one ordered sequence. The world
 * snapshot, access query, Director request and planning budget follow the accepted variant chain.
 */
export function chainFixture(sources: readonly ChainSource[]): Source {
  const built = sources.map(sourceOf), owner = built[0]!.owner, chainScope = { ...owner, purpose: scope.purpose };
  const suppliedSource = unique(built.flatMap(b => b.supplied));
  const tokenArtifacts = built.map(b => artifact(`gate7_token_${b.spec.key}`, "EditorialToken", b.token));
  const set = createEditorialCandidateSet({ artifactType: "EditorialCandidateSet", artifactVersion: "0.1.0", stability: "internal_pre_stable", projectId: owner.projectId,
    candidates: tokenArtifacts.map((item, i) => ({ candidateId: built[i]!.token.candidate.candidateId, token: item.ref })),
    analysisRefs: built.map(b => b.analysisArtifact.ref), runRefs: built.map(b => b.runArtifact.ref), selectionPolicy: built[0]!.policyRef,
    universe: "retained", sourceRunStatus: "succeeded", failureEvidence: [] });
  const setArtifact = artifact("gate7_candidate_set", "EditorialCandidateSet", set);
  const media = built.map(b => artifact(`gate7_media_${b.spec.key}`, "MediaAsset", { contractType: "MediaAsset", schemaVersion: "1.0.0", assetId: b.analysis.assetId,
    projectId: owner.projectId, creatorId: owner.creatorId, kind: "video", objectId: `source_${b.spec.key}`, durationSeconds: b.analysis.metadata.durationSeconds,
    origin: "synthetic", retention: { expiresAt: null, deletionRequestedAt: null } }, "1.0.0"));
  const first = built[0]!, firstAnalysis = first.analysisArtifact.ref;
  const channels = [{ channel: "source_index", state: "complete" as const, evidence: present({ artifact: firstAnalysis, pointer: "/metadata/frameTimes" }) }];
  const analysisRefs = built.map(b => b.analysisArtifact.ref).sort(byText<ArtifactRef>(r => r.objectId));
  const coverageArtifact = artifact("gate7_coverage", "WorldCoverageEvidence", { artifactType: "WorldCoverageEvidence", artifactVersion: "0.1.0", ...chainScope,
    sourceAnalysisRefs: analysisRefs, channels, producer: first.adapter });
  const initial = [...suppliedSource, ...tokenArtifacts, setArtifact, ...media, coverageArtifact];
  const map = new EditorialArtifactMap(initial);
  const tokenLinks = tokenArtifacts.map(item => linkEditorialToken(item.ref, map, chainScope)).sort(byText(t => t.tokenId));
  const supports: GroundedSupport[] = built.map(b => ({ assetId: b.analysis.assetId, sourceHash: b.analysis.contentHash, analysis: b.analysisArtifact.ref, shotId: b.token.candidate.shotId,
    range: b.token.candidate.sourceRange, rangeEvidence: { artifact: b.analysisArtifact.ref, pointer: "/candidates/0/candidate/sourceRange" },
    timebase: { artifact: b.analysisArtifact.ref, pointer: "/metadata/frameTimes" }, sample: missing("not_applicable", "range_support") }));
  const authorization = { artifact: firstAnalysis, pointer: "/authorization" };
  const world = createWorldSnapshot({ ...chainScope, authorization, revision: 0, parent: missing("not_applicable", "initial_snapshot"), asOf: WORLD_TIME,
    mediaTruthRefs: analysisRefs, observed: [], derived: [],
    entities: supports.map((value, i) => ({ entityId: `entity_candidate_${i}`, authority: "MediaTruth" as const, kind: "source_range", artifact: value.analysis, support: present(value) })),
    relationships: [], perceptionBindings: [], tokenLinks,
    candidateLinks: tokenArtifacts.map((item, i) => ({ candidateId: built[i]!.token.candidate.candidateId, token: item.ref, entityId: `entity_candidate_${i}` }))
      .sort(byText(l => l.candidateId)),
    candidateSetRefs: [setArtifact.ref], coverage: { evidence: { artifact: coverageArtifact.ref, pointer: "" }, channels },
    changeSet: { evidence: authorization, added: [], superseded: [], invalidated: [], unchanged: [] }, builder: first.adapter }, new EditorialArtifactMap(initial));
  const worldArtifact = artifact("gate7_world", "ProjectWorldModel", world);
  const worldQuery = { worldId: world.worldId, ...chainScope, currentAuthorization: authorization, currentAccess: media.map(m => m.ref).sort(byText<ArtifactRef>(r => r.objectId)),
    accessAsOf: WORLD_TIME, queryVersion: "0.1.0", authority: ["MediaTruth"], channels: ["source_index"], limit: 8, offset: 0 };
  const view = queryWorld(world, worldQuery, new EditorialArtifactMap([...initial, worldArtifact]));
  const viewArtifact = artifact("gate7_view", "ProjectWorldView", view);
  const canonArtifacts = CANON_V0.slice(0, 2).map(e => artifact(`gate7_${e.entryKey}`, "CanonEntry", e));
  const canonView = createCanonView({ scope: chainScope, domain: "talking_head", selectionPolicy: "explicit_required_set", entries: canonArtifacts.map(item => item.ref) },
    new EditorialArtifactMap(canonArtifacts));
  const canonViewArtifact = artifact("gate7_canon_view", "CanonView", canonView);
  const intent = createIntentSpec({ ...envelope("IntentSpec"), scope: chainScope, revision: 0, parent: missing("not_applicable", "initial_intent"),
    author: { kind: "owner", actorId: "owner_synthetic" }, goal: "Make a clear short story.", domain: "talking_head", audience: "Interested viewers",
    outputRequirements: [{ requirementId: "output_short", description: "A concise output", priority: "hard" }],
    mustInclude: [{ requirementId: "include_subject", description: "Include the supplied speaker", priority: "hard" }], mustExclude: [] });
  const intentArtifact = artifact("gate7_intent", "IntentSpec", intent);
  const summary = createCandidateSummary({ ...envelope("DirectorCandidateSummary"), scope: chainScope, candidateSet: setArtifact.ref, worldSnapshot: worldArtifact.ref,
    worldView: viewArtifact.ref, coverage: "complete_declared_set", candidates: set.candidates, omittedCandidateIds: [], selectionPolicy: "explicit_supplied" },
    new EditorialArtifactMap([...initial, worldArtifact, viewArtifact]), world, view);
  const summaryArtifact = artifact("gate7_summary", "DirectorCandidateSummary", summary);
  const routingPolicy = artifact("gate7_routing_policy", "Evidence", { scope: chainScope, order: "cost_then_latency_then_profile_id", requireEstimates: true });
  const routingPolicyRef = { artifact: routingPolicy.ref, pointer: "" };
  const computeGrant = artifact("gate7_planning_compute_grant", "ComputeAuthorization", { version: "0.1.0", scope: chainScope, grant: "compute", qualityTier: "tier_synthetic",
    cpuMilliseconds: 1000, gpuMilliseconds: 0, peakRamBytes: 10000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 1000, wallClockMilliseconds: 1000,
    modelCalls: 1, renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0, reservationPolicy: routingPolicyRef });
  const target = { modelId: "synthetic_director_model", exactRevision: H, adapterId: "synthetic_adapter", adapterVersion: "1.0.0", implementationDigest: H, capability: "director_reasoning" };
  const evaluationGrant = artifact("gate7_evaluation_grant", "EvaluationAuthorization", { version: "0.1.0", scope: chainScope, grant: "model_capability_evaluation",
    qualityTier: "tier_synthetic", authorizedModels: [target] });
  const evaluation = artifact("gate7_evaluation", "ModelEvaluation", { version: "0.1.0", scope: chainScope, authorizationRef: evaluationGrant.ref, qualityTier: "tier_synthetic",
    eligibleModels: [target] });
  const quality = artifact("gate7_quality", "QualityRequirement", { version: "0.1.0", scope: chainScope, capability: "director_reasoning", qualityTier: "tier_synthetic", policy: routingPolicyRef });
  const availabilityEvidence = artifact("gate7_availability", "ModelAvailability", { version: "0.1.0", scope: chainScope, modelId: target.modelId, exactRevision: H,
    adapterId: target.adapterId, adapterVersion: target.adapterVersion, implementationDigest: H, available: true, observedAt: WORLD_TIME });
  const availabilitySnapshot = artifact("gate7_availability_snapshot", "AvailabilitySnapshot", { version: "0.1.0", scope: chainScope, observedAt: WORLD_TIME,
    profiles: [{ modelId: target.modelId, exactRevision: H, adapterId: target.adapterId, adapterVersion: target.adapterVersion, implementationDigest: H, available: true }] });
  const revisionEvidence = artifact("gate7_revision_evidence", "Evidence", { revision: H });
  const resourceEvidence = artifact("gate7_resource_evidence", "Evidence", { scope: chainScope, cpuMilliseconds: 10, gpuMilliseconds: 0, peakRamBytes: 100, peakVramBytes: 0 });
  const licenseEvidence = artifact("gate7_license_evidence", "Evidence", { commercial: true });
  const contextEvidence = artifact("gate7_context_evidence", "Evidence", { maximumTokens: 100 });
  const routing = [routingPolicy, computeGrant, evaluationGrant, evaluation, quality, availabilityEvidence, availabilitySnapshot, revisionEvidence, resourceEvidence, licenseEvidence, contextEvidence];
  const computeBudget = budget({ version: "0.1.0", scope: chainScope, authorizationRef: computeGrant.ref, qualityTier: "tier_synthetic", cpuMilliseconds: 100, gpuMilliseconds: 0,
    peakRamBytes: 1000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 100, wallClockMilliseconds: 100, modelCalls: 1,
    renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0, childAllocations: [], reservationPolicy: routingPolicyRef }, routing);
  const budgetArtifact = artifact("gate7_planning_budget", "ComputeBudget", computeBudget);
  const modelProfile = profile({ version: "0.1.0", scope: chainScope, modelId: target.modelId, exactRevision: H, revisionEvidence: revisionEvidence.ref,
    adapter: { adapterId: target.adapterId, version: "1.0.0", implementationDigest: H }, capabilities: ["director_reasoning"], modalities: ["text"], deployment: "local",
    qualityTier: "tier_synthetic", qualityEvidence: present(evaluation.ref), contextLimits: { artifact: contextEvidence.ref, pointer: "" },
    expectedLatency: present({ value: 20, unit: "milliseconds", evidence: routingPolicyRef }), estimatedCost: present({ value: 30, unit: "inr_micros", evidence: routingPolicyRef }),
    resourceRequirements: { artifact: resourceEvidence.ref, pointer: "" }, licensing: { artifact: licenseEvidence.ref, pointer: "" }, commercialEligibility: present(true),
    availability: present({ artifact: availabilityEvidence.ref, pointer: "" }), observedAt: WORLD_TIME }, routing);
  const profileArtifact = artifact("gate7_profile", "ModelProfile", modelProfile);
  const capability = artifact("gate7_director_capability", "DirectorCapabilitySnapshot", { ...envelope("DirectorCapabilitySnapshot"), scope: chainScope,
    capability: "director_reasoning", executionStatus: "selection_only_no_execution" });
  const preselection = { ...envelope("DirectorRequest"), scope: chainScope, intent: intentArtifact.ref, worldView: viewArtifact.ref, candidateSummaryView: summaryArtifact.ref,
    audioMusicView: missing("not_computed", "audio_not_supplied"), referenceGrammar: missing("not_computed", "reference_not_supplied"), canonView: canonViewArtifact.ref,
    editingDNA: missing("not_computed", "editing_dna_not_implemented"), computeBudget: budgetArtifact.ref, capabilitySnapshot: capability.ref, modelSelection: profileArtifact.ref,
    outputRequirements: { artifact: intentArtifact.ref, pointer: "/outputRequirements" }, priorDirection: missing("not_applicable", "initial_direction"),
    revisionScope: missing("not_applicable", "initial_direction") };
  const modelSelection = selectModel({ scope: chainScope, capability: "director_reasoning", qualityRequirement: { artifact: quality.ref, pointer: "" }, budget: computeBudget,
    budgetArtifact: budgetArtifact.ref, candidates: [{ profile: modelProfile, artifact: profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" },
    availabilitySnapshot: availabilitySnapshot.ref, policy: routingPolicyRef, fallbackEscalationPolicy: routingPolicyRef, inputViewDigest: directorSelectionInputDigest(preselection) },
    [...routing, budgetArtifact, profileArtifact]);
  const selectionArtifact = artifact("gate7_selection", "ModelSelection", modelSelection);
  const suppliedAll = [...initial, worldArtifact, viewArtifact, ...canonArtifacts, canonViewArtifact, intentArtifact, summaryArtifact, ...routing, budgetArtifact, profileArtifact,
    capability, selectionArtifact];
  const authority = { artifacts: suppliedAll, worldQuery };
  const request = createDirectorRequest({ ...preselection, modelSelection: selectionArtifact.ref }, authority);
  const requestArtifact = artifact("gate7_request", "DirectorRequest", request);
  suppliedAll.push(requestArtifact);
  const bindings = set.candidates;
  const nodes = built.map((b, i) => {
    const binding = bindings.find(c => c.candidateId === b.token.candidate.candidateId)!;
    return { nodeId: `node_source_${String(i).padStart(2, "0")}`, intent: { kind: "story_beat" as const, role: i === 0 ? "hook" as const : "build" as const,
      description: `Source ${b.spec.key}.` }, priority: "hard" as const, scope: { kind: "candidate" as const, candidate: binding }, candidates: [binding],
      evidenceRefs: [{ artifact: b.analysisArtifact.ref, pointer: "/candidates/0" }], canonEntryKeys: ["narrative_arc"], hypotheses: [],
      requirementIds: ["include_subject", "output_short"], uncertainty: { state: "unknown" as const, reasonCode: "synthetic_evidence", evidenceRefs: [] } };
  });
  const edges = nodes.slice(1).map((node, i) => ({ edgeId: `edge_order_${String(i).padStart(2, "0")}`, type: "intended_order" as const, from: nodes[i]!.nodeId, to: node.nodeId }));
  const directionBody = { ...envelope("CreativeDirectionGraph"), scope: chainScope, request: requestArtifact.ref, worldSnapshot: worldArtifact.ref, candidateUniverse: setArtifact.ref,
    revision: 0, parent: missing("not_applicable", "initial_direction"), nodes, edges, constraints: [], alternatives: [], hypotheses: [], unresolvedRequirements: [] };
  const direction = createCreativeDirectionGraph(directionBody, requestArtifact.ref, authority);
  const directionArtifact = artifact("gate7_direction", "CreativeDirectionGraph", direction);
  suppliedAll.push(directionArtifact);
  const grounding = createDirectorGroundingReport(requestArtifact.ref, present(directionArtifact.ref), authority);
  const groundingArtifact = artifact("gate7_grounding", "DirectorGroundingReport", grounding);
  suppliedAll.push(groundingArtifact);
  const producerRun = createDirectorProducerRun({ ...envelope("DirectorProducerRun"), scope: chainScope, request: requestArtifact.ref, selection: selectionArtifact.ref,
    groundingReport: groundingArtifact.ref, direction: present(directionArtifact.ref), outcome: "succeeded", failure: missing("not_applicable", "no_failure"), basis: "synthetic_test",
    evidenceRefs: [] });
  const producerArtifact = artifact("gate7_producer", "DirectorProducerRun", producerRun);
  suppliedAll.push(producerArtifact);
  createDirectorResult({ outcome: "succeeded", direction: present(directionArtifact.ref), unresolvedRequirements: [],
    uncertainty: { state: "unknown", reasonCode: "synthetic_test_only", evidenceRefs: [] }, failure: missing("not_applicable", "no_failure") },
    { request: requestArtifact.ref, producerRun: producerArtifact.ref, groundingReport: groundingArtifact.ref, modelRun: missing("not_applicable", "no_director_model_run"),
      costTrace: missing("not_applicable", "no_truthful_director_telemetry_operation") }, authority);
  // The shape consumed by the accepted planningFixture: only these fields are read.
  const shaped = { supplied: suppliedAll, request, requestArtifact, directionArtifact, worldArtifact, viewArtifact, worldQuery, setArtifact, set, budgetArtifact,
    direction, directionBody, authority, candidate: bindings[0]! };
  return shaped as unknown as Source;
}
/** Planning bounds that choose exactly the ordered full-range sequence of every chain source once. */
export function orderedSourcesPolicy(totalSeconds: number, sources: number) {
  return { duration: { minimumSeconds: totalSeconds, maximumSeconds: totalSeconds, preferredSeconds: totalSeconds },
    boundary: { method: "candidate_and_sample_pts_v0", maxEvidencePoints: 8, maxOptionsPerCandidate: 1 },
    search: { algorithm: "bounded_beam_v0", maximumDepth: sources, frontierWidth: 8, maximumExpandedStates: 128, maximumOptionsRetained: 16, manifestLimit: 128 },
    reuse: { maximumUsesPerCandidate: 1, precedingUsePolicy: "count_for_reuse_and_repetition" } };
}
