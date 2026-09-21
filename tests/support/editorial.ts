import { z } from "zod";
import { canonicalSerialize } from "../../packages/domain/serialization.js";
import { contentId } from "../../packages/reference-analyzer/features.js";
import { EMBEDDING_IMPLEMENTATION, embeddingCacheKey, embeddingSpaceId } from "../../packages/reference-analyzer/embeddings.js";
import { FootageAnalysisSchema, MEASUREMENT_VERSION, type Candidate, type CandidateEvidence } from "../../packages/footage-analyzer/protocol.js";
import { EditorialArtifactMap, exactDigest, missing, present, type ArtifactRef, type EvidenceRef, type Producer, type SuppliedArtifact } from "../../packages/editorial/common.js";
import { resolveEditorialToken, type TokenResolutionInput } from "../../packages/editorial/resolve.js";
import { createEditorialCandidateSet, createEditorialDecision, EditorialDecisionBodySchema } from "../../packages/editorial/decision.js";
import { taskRef } from "../../packages/editorial/taxonomy.js";
import { cheapEvidence, footageMetadata, stubConfig } from "./footage.js";

export const TIME = "2026-09-21T00:00:00.000Z";
export function artifact(objectId: string, artifactType: string, value: unknown, artifactVersion = "legacy-unversioned"): SuppliedArtifact {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  return { ref: { objectId, artifactType, artifactVersion, sha256: exactDigest(bytes) }, value, bytes };
}
export function tokenFixture(range = { startSeconds: 0, endSeconds: 2 }, runStatus: "succeeded" | "partial" = "succeeded") {
  const configuration = stubConfig(), hash = "a".repeat(64), assetId = `asset_${hash}`, shotId = "shot_synthetic";
  const cheap = cheapEvidence([0.5, 1.5, 2, 3.5].map((atSeconds, i) => ({ sampleId: `sample_${i}`, shotId, atSeconds, frameIndex: atSeconds * 10 })));
  for (const f of cheap) { f.measurement.brightnessMean = 0; f.measurementId = contentId("measurement", [f.sample, f.measurement, f.frameContentHash, MEASUREMENT_VERSION]); }
  const reference = (objectId: string) => ({ embeddingId: contentId("embedding", objectId), objectId, spaceId: embeddingSpaceId(configuration.embedding), spaceVersion: "normalized-mean-v1", dimensions: 8, distance: "cosine" as const });
  const frames = [cheap[0]!, cheap[2]!, cheap[3]!].map((f) => ({ ...f.sample, frameContentHash: f.frameContentHash, embedding: reference(embeddingCacheKey(hash, [contentId("sample", ["decoded-png-v1", f.frameContentHash])], configuration.embedding, "frame")), selectionReasons: ["temporal_coverage" as const] }));
  const proposalConfigurationId = contentId("proposal", [configuration.proposal, cheap.map((f) => f.measurementId)]);
  const candidate: Candidate = { assetId, shotId, sourceRange: range, proposalConfigurationId, proposalVersion: "coverage-multiscale-v1", candidateId: contentId("segment", [assetId, shotId, range, proposalConfigurationId]) };
  function select<T extends { atSeconds: number }>(all: T[]) {
    const inside = all.filter((f) => f.atSeconds >= range.startSeconds && f.atSeconds < range.endSeconds);
    return inside.length ? inside : [[...all].sort((a, b) => Math.abs(a.atSeconds - (range.startSeconds + range.endSeconds) / 2) - Math.abs(b.atSeconds - (range.startSeconds + range.endSeconds) / 2) || a.atSeconds - b.atSeconds)[0]!];
  }
  const semantic = select(frames), samples = select(cheap.map((f) => f.sample)), ids = samples.map((f) => f.sampleId), measurements = cheap.filter((f) => ids.includes(f.sample.sampleId));
  const within = (t: number) => t >= range.startSeconds && t < range.endSeconds;
  const hasPair = measurements.some((f) => within(f.sample.atSeconds) && f.measurement.comparisonSampleId !== null && ids.includes(f.measurement.comparisonSampleId));
  const evidence: CandidateEvidence = { candidate, contributingSemanticFrameIds: semantic.map((f) => f.sampleId), contributingMeasurementIds: measurements.map((f) => f.measurementId), contributingCheapSampleIds: ids,
    semanticEmbedding: reference(embeddingCacheKey(hash, semantic.map((f) => f.embedding.embeddingId), configuration.embedding, "normalized-mean-v1")), semanticSupport: within(semantic[0]!.atSeconds) ? "within_segment" : "same_shot_context",
    semanticContextDistanceSeconds: Math.min(...semantic.map((f) => Math.max(range.startSeconds - f.atSeconds, f.atSeconds - range.endSeconds, 0))), cheapSupport: within(samples[0]!.atSeconds) ? "within_segment" : "same_shot_context",
    aggregationVersion: "footage-evidence-v1", aggregationId: contentId("aggregation", [candidate, semantic.map((f) => f.embedding), measurements.map((f) => f.measurementId), "footage-evidence-v1"]),
    signals: { brightnessMean: 0, darkPixelFraction: 0, brightPixelFraction: 0, laplacianVariance: 100, frameDifferenceMean: hasPair ? 0 : null, opticalFlowPixelsPerSecond: hasPair ? 0 : null, sharpnessIndicator: 0.5, unclippedPixelFraction: 1, stabilityIndicator: hasPair ? 1 : null } };
  const coverage = { durationSeconds: 4, coveredSeconds: range.endSeconds - range.startSeconds, temporalCoverage: (range.endSeconds - range.startSeconds) / 4, maximumGapSeconds: 4 - range.endSeconds, representedShots: 1, sourceShots: 1 };
  const analysis = FootageAnalysisSchema.parse({ artifactType: "FootageAnalysis", artifactVersion: "1.0.0", analysisId: "analysis_synthetic", assetId, contentHash: hash,
    authorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.0.0", contentHash: hash, sizeBytes: 1, sourceType: "synthetic", authorizationBasis: "synthetic_generated", allowedPurposes: ["local_footage_analysis", "local_evaluation"], dateAdded: TIME, creatorId: "creator_synthetic", projectId: "project_synthetic" },
    configuration, configurationId: contentId("configuration", configuration), embeddingImplementation: EMBEDDING_IMPLEMENTATION, metadata: footageMetadata(4), shots: [{ shotId, startSeconds: 0, endSeconds: 4 }], cheapFeatures: cheap, semanticFrames: frames, candidates: [evidence], keptCandidateIds: [candidate.candidateId], prunedCandidates: [],
    inventory: { assetId, analysisId: "analysis_synthetic", durationSeconds: 4, sourceShots: 1, cheapFramesAnalyzed: 4, semanticSamplesRequested: 3, semanticSamplesSelected: 3, semanticSamplesEmbedded: 0, uniqueSemanticFrames: 1, reducedCheapResolution: false, reducedSemanticCoverage: false, candidatesBeforeDeduplication: 1, candidatesAfterDeduplication: 1, coverageBefore: coverage, coverageAfter: coverage, embeddingSpace: frames[0]!.embedding } });
  const modelRun = { contractType: "ModelRun", schemaVersion: "1.0.0", runId: "run_synthetic", scope: { projectId: "project_synthetic", creatorId: "creator_synthetic", jobId: "job_synthetic", environment: "synthetic" }, provider: "footage_analyzer", model: "stub", modelVersion: "stub-v1", adapterVersion: "0.2.0", operation: "footage_analysis", inputIds: [assetId], outputIds: [], startedAt: TIME, endedAt: TIME, status: "succeeded", errorCode: null };
  const run = { jobId: "job_synthetic", status: runStatus, configuration, modelRuns: [modelRun] };
  const implementation = { implementationId: "CandidateFeatureAggregator", aggregationVersion: "footage-evidence-v1", sourceSha256: "46024d6af6743868e30504cf35cb26c1acfcc1eb5025e35544744edd273c0cf8" };
  const policy = { policyId: "synthetic_policy", policyVersion: "0.1.0" };
  const analysisArtifact = artifact("object_analysis", "FootageAnalysis", analysis, "1.0.0"), runArtifact = artifact("object_run", "FootageRun", run), policyArtifact = artifact("object_policy", "EditorialPolicy", policy), implementationArtifact = artifact("object_implementation", "ImplementationDescriptor", implementation);
  const at = (pointer: string): EvidenceRef => ({ artifact: analysisArtifact.ref, pointer });
  const policyRef = { artifact: policyArtifact.ref, pointer: "" };
  const featureProducer: Producer = { producerId: "footage_analyzer", producerVersion: "0.2.0", configuration: at("/configuration"), implementation: present(at("/embeddingImplementation")), sourceEvidence: [at("/candidates/0"), at("/authorization")], mediaBasis: "synthetic", computationBasis: "synthetic_stub", runEvidence: present([{ artifact: runArtifact.ref, pointer: "" }]) };
  const adapter: Producer = { ...featureProducer, producerId: "editorial_adapter", producerVersion: "0.1.0", computationBasis: "deterministic", configuration: policyRef };
  const input: TokenResolutionInput = { projectId: "project_synthetic", candidate, analysis: analysisArtifact.ref, producingRun: { jobId: "job_synthetic", artifact: runArtifact.ref }, clipSegment: missing("unavailable", "clip_not_supplied"), featureProducer, adapter, aggregationImplementation: present({ artifact: implementationArtifact.ref, pointer: "" }) };
  const supplied = [analysisArtifact, runArtifact, policyArtifact, implementationArtifact];
  const map = () => new EditorialArtifactMap(supplied);
  const token = resolveEditorialToken(input, map());
  return { input, analysis, run, policyRef, supplied, map, token, adapter, evidence, frames };
}
export function decisionFixture(runStatus: "succeeded" | "partial" = "succeeded") {
  const fixture = tokenFixture(undefined, runStatus);
  const other = tokenFixture({ startSeconds: 2, endSeconds: 3 });
  // Each candidate snapshot has explicitly separate analysis/run objects.
  const second = structuredClone(other.token);
  const secondRefs = new Map<string, ArtifactRef>();
  const supplied = [...fixture.supplied];
  for (const item of other.supplied) { const added = { ...item, ref: { ...item.ref, objectId: `${item.ref.objectId}_second` } }; secondRefs.set(item.ref.objectId, added.ref); supplied.push(added); }
  function remap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(remap);
    if (value !== null && typeof value === "object") {
      const r = value as Record<string, unknown>;
      if (typeof r.objectId === "string" && secondRefs.has(r.objectId) && "sha256" in r) return secondRefs.get(r.objectId);
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, remap(v)]));
    }
    return value;
  }
  const secondInput = remap(other.input) as TokenResolutionInput;
  const secondToken = resolveEditorialToken(secondInput, new EditorialArtifactMap(supplied));
  void second;
  const tokenArtifacts = [fixture.token, secondToken].map((t, i) => artifact(`object_token_${i}`, "EditorialToken", t, "0.1.0"));
  supplied.push(...tokenArtifacts);
  const set = createEditorialCandidateSet({ artifactType: "EditorialCandidateSet", artifactVersion: "0.1.0", stability: "internal_pre_stable", projectId: "project_synthetic", candidates: tokenArtifacts.map((t, i) => ({ candidateId: [fixture.token, secondToken][i]!.candidate.candidateId, token: t.ref })), analysisRefs: [fixture.token.analysis.artifact, secondToken.analysis.artifact], runRefs: [fixture.token.producingRun.artifact, secondToken.producingRun.artifact], selectionPolicy: fixture.policyRef, universe: "explicit_subset", sourceRunStatus: "succeeded", failureEvidence: [] });
  const setArtifact = artifact("object_set", "EditorialCandidateSet", set, "0.1.0"); supplied.push(setArtifact);
  const body: z.input<typeof EditorialDecisionBodySchema> = {
    artifactType: "EditorialDecision", artifactVersion: "0.1.0", stability: "internal_pre_stable", projectId: "project_synthetic", task: taskRef("candidate_ranking"), decisionType: "rank", availableCandidates: setArtifact.ref,
    options: set.candidates.map((c, i) => ({ optionId: `option_${i}`, kind: "candidate", candidateId: c.candidateId })), presentation: missing("unavailable", "not_recorded"), previousContext: missing("not_applicable", "initial_decision"), actor: { kind: "system", pseudonymId: "system_synthetic", namespaceId: "namespace_test" },
    observed: { completion: "completed", selectedCandidateIds: [], rejectedCandidateIds: [], chosenOptionIds: [], rejectedOptionIds: [], observations: [], finalTrims: missing("not_applicable", "ranking_only") },
    judgment: present({ kind: "ranking", tieGroups: [["option_0"], ["option_1"]], unjudgedOptionIds: [], completeness: "complete", basis: "synthetic_fixture", sourceEvidence: [fixture.policyRef], labelProtocol: fixture.policyRef }),
    editorExplanation: missing("not_applicable", "system_actor"), producing: { analysisRefs: set.analysisRefs, runRefs: set.runRefs, captureProducer: fixture.adapter, decisionConfiguration: fixture.policyRef }, finalTimelineLinkage: missing("not_computed", "no_timeline"), legacyEventRefs: [], supersedes: missing("not_applicable", "initial_decision") };
  return { ...fixture, supplied, set, setArtifact, tokenArtifacts, body, decision: createEditorialDecision(body), map: () => new EditorialArtifactMap(supplied) };
}
