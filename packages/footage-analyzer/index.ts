import { CostEventSchema, IdSchema, ModelRunSchema } from "../contracts/index.js";
import type { ClipSegment, CostEvent, EventScope, ModelRun } from "../domain/index.js";
import type { Telemetry } from "../telemetry/index.js";
import { contentId, hashAsset, timelineFromCuts } from "../reference-analyzer/features.js";
import { MetadataSchema, type MediaMetadata, type Sample } from "../reference-analyzer/protocol.js";
import type { ReferenceMediaProvider } from "../reference-analyzer/index.js";
import type { ArtifactCache, Clock, EmbeddingBackend } from "../reference-analyzer/embeddings.js";
import { EMBEDDING_IMPLEMENTATION } from "../reference-analyzer/embeddings.js";
import { assertCompatibleEmbeddingSpaces } from "../validation/index.js";
import { allocateBudget, selectCheapLattice, selectSemanticLattice } from "./lattice.js";
import { buildFrameFeatureBank } from "./frame-bank.js";
import { CandidateSegmentProposer } from "./candidates.js";
import { CandidateFeatureAggregator, ClipSegmentBuilder, pruneCandidates } from "./aggregation.js";
import { CheapEvidenceSchema, FOOTAGE_VERSION, FootageAnalysisSchema, FootageAuthorizationSchema, FootageConfigSchema, FootageInventorySchema, FootageManifestSchema, type CheapEvidence, type FootageAuthorization, type FootageConfig, type FootageDetectorConfig, type FootageFailure, type FootageManifest } from "./protocol.js";
import type { z } from "zod";

export type FootageStage = "authorization" | "identity" | "metadata" | "detect" | "sample" | "visual" | "selection" | "embedding" | "proposal" | "aggregation" | "deduplication" | "validation";
const codes: Record<FootageStage, string> = { authorization: "AUTHORIZATION_FAILED", identity: "MEDIA_UNREADABLE", metadata: "METADATA_EXTRACTION_FAILED", detect: "SOURCE_SEGMENTATION_FAILED", sample: "FRAME_EXTRACTION_FAILED", visual: "VISUAL_ANALYSIS_FAILED", selection: "SEMANTIC_SELECTION_FAILED", embedding: "EMBEDDING_FAILED", proposal: "CANDIDATE_PROPOSAL_FAILED", aggregation: "CANDIDATE_AGGREGATION_FAILED", deduplication: "CANDIDATE_DEDUPLICATION_FAILED", validation: "CLIPSEGMENT_VALIDATION_FAILED" };
export class FootageAnalysisError extends Error {
  constructor(public readonly stage: FootageStage, public readonly code = codes[stage]) { super(`Footage ${stage} could not complete (${code}).`); this.name = "FootageAnalysisError"; }
}
const safeWorkerCodes = new Set(["MEDIA_UNREADABLE", "MEDIA_UNSUPPORTED", "METADATA_EXTRACTION_FAILED", "FRAME_EXTRACTION_FAILED", "EMBEDDING_FAILED", "EMBEDDING_MODEL_UNAVAILABLE", "EMBEDDING_ENVIRONMENT_CAPACITY", "EMBEDDING_OUT_OF_MEMORY", "EMBEDDING_DEVICE_UNAVAILABLE", "WORKER_TIMEOUT", "WORKER_UNAVAILABLE", "WORKER_EXITED", "WORKER_OUTPUT_LIMIT", "INTERCHANGE_INVALID", "FRAME_COUNT_MISMATCH", "MODEL_PROVENANCE_INVALID", "CUDA_UNAVAILABLE", "TRANSNET_ANALYSIS_FAILED"]);
function failureAt(stage: FootageStage, error: unknown): FootageAnalysisError {
  if (error instanceof FootageAnalysisError) return error;
  if (error instanceof Error && ["CHEAP_MINIMUM_COVERAGE_EXCEEDS_BUDGET", "SEMANTIC_MINIMUM_COVERAGE_EXCEEDS_BUDGET"].includes(error.message)) return new FootageAnalysisError(stage, error.message);
  if (error instanceof Error && "code" in error && typeof error.code === "string" && safeWorkerCodes.has(error.code)) return new FootageAnalysisError(stage, error.code);
  return new FootageAnalysisError(stage);
}
export interface FootageMedia extends Pick<ReferenceMediaProvider, "metadata"> {
  detect(metadata: MediaMetadata, config: FootageDetectorConfig): Promise<{ cuts: readonly number[]; version: string }>;
  sampleFootage(samples: readonly Sample[]): Promise<{ features: CheapEvidence[]; version: string; cacheHit: boolean; decodedFrames: number }>;
  setDeadline?(atMilliseconds: number): void;
}
export interface OpenFootageAsset {
  bytes(): AsyncIterable<Uint8Array>; media: FootageMedia; backend: EmbeddingBackend;
  expectedDimensions(): Promise<number>;
}
export interface FootageServices {
  open(entry: FootageManifest["assets"][number], authorization: FootageAuthorization, config: FootageConfig): Promise<OpenFootageAsset>;
  cache: ArtifactCache; clock: Clock; telemetry: Telemetry;
}
type Analysis = z.infer<typeof FootageAnalysisSchema>;
type Timing = { entryId: string; stage: FootageStage; durationMilliseconds: number; toolVersion: string; status: "succeeded" | "failed" };

export async function analyzeFootage(manifestInput: unknown, configInput: unknown, jobIdInput: string, services: FootageServices) {
  const manifest = FootageManifestSchema.parse(manifestInput), config = FootageConfigSchema.parse(configInput), jobId = IdSchema.parse(jobIdInput);
  const configurationId = contentId("configuration", config), started = services.clock.milliseconds();
  const timings: Timing[] = [], failures: FootageFailure[] = [], duplicates: { entryId: string; assetId: string }[] = [], analyses: Analysis[] = [], segments: ClipSegment[] = [];
  const cacheStats: { assetId: string; frameHits: number; frameMisses: number; corruptFrames: number; aggregateHits: number; aggregateMisses: number; cheapCacheHit: boolean; cheapFramesDecoded: number; device: string | null; semanticFramesEmbedded: number }[] = [];
  const prepared: { entry: FootageManifest["assets"][number]; authorization: FootageAuthorization; opened: OpenFootageAsset; identity: Awaited<ReturnType<typeof hashAsset>>; runs: ModelRun[] }[] = [];
  const seen = new Set<string>();
  async function stage<T>(entryId: string, authorization: FootageAuthorization | null, runs: ModelRun[], name: FootageStage, tool: string, action: () => Promise<{ value: T; version: string; units?: CostEvent["units"] }>): Promise<T> {
    const scope: EventScope = { projectId: manifest.projectId, creatorId: manifest.creatorId, jobId, environment: authorization?.sourceType === "synthetic" ? "synthetic" : "production" };
    const operationId = contentId("operation", [jobId, entryId, name]), start = services.clock.milliseconds(), startedAt = services.clock.now();
    let version = "unmeasured", errorCode: string | null = null, units: CostEvent["units"] = [{ unit: "operations", quantity: 1 }];
    try { const result = await action(); version = result.version; units = result.units ?? units; return result.value; }
    catch (error) { const failure = failureAt(name, error); errorCode = failure.code; throw failure; }
    finally {
      const durationMilliseconds = Math.max(0, Math.round(services.clock.milliseconds() - start));
      // Full TransNet provenance exceeds the frozen 80-character version label.
      // Bind it by digest in telemetry; retain the complete value in stage timings/cache.
      const modelVersion = name === "embedding" ? config.embedding.revision
        : name === "detect" && config.detector.kind === "transnetv2" && errorCode === null ? contentId("transnetv2", version) : version;
      const run = ModelRunSchema.parse({ contractType: "ModelRun", schemaVersion: "1.0.0", runId: `${operationId}.model`, scope, provider: "local", model: tool, modelVersion,
        adapterVersion: FOOTAGE_VERSION, operation: name === "embedding" ? "embedding" : "footage_analysis", inputIds: authorization === null ? [] : [`asset_${authorization.contentHash}`], outputIds: errorCode === null ? [contentId("stage", [entryId, configurationId, name])] : [], startedAt, endedAt: services.clock.now(), status: errorCode === null ? "succeeded" : "failed", errorCode });
      services.telemetry.recordModelRun(run); runs.push(run);
      services.telemetry.record(CostEventSchema.parse({ contractType: "CostEvent", schemaVersion: "1.0.0", eventId: `${operationId}.cost`, scope, occurredAt: services.clock.now(), operationId, attempt: 1, provider: "local", tool, model: tool, modelRunId: run.runId, operation: run.operation, durationMilliseconds, units, costInrMicros: 0, costSource: scope.environment === "synthetic" ? "synthetic" : "measured" }));
      timings.push({ entryId, stage: name, durationMilliseconds, toolVersion: version, status: run.status });
    }
  }
  const recordFailure = (entryId: string, assetId: string | null, error: unknown, fallback: FootageStage) => { const failure = failureAt(fallback, error); failures.push({ entryId, assetId, stage: failure.stage, code: failure.code, diagnostic: failure.message }); };
  for (const entry of manifest.assets) {
    const runs: ModelRun[] = []; let verifiedAssetId: string | null = null;
    try {
      const declaredAuthorization = FootageAuthorizationSchema.safeParse(entry.authorization);
      const authorization = await stage(entry.entryId, declaredAuthorization.success ? declaredAuthorization.data : null, runs, "authorization", "local_authorization", async () => {
        const a = FootageAuthorizationSchema.parse(entry.authorization);
        if (a.projectId !== manifest.projectId || a.creatorId !== manifest.creatorId || !a.allowedPurposes.includes("local_footage_analysis") || a.dateAdded > services.clock.now() || (config.embedding.mode === "stub" && a.sourceType !== "synthetic")) throw new FootageAnalysisError("authorization");
        return { value: a, version: "footage-authorization-v1" };
      });
      const value = await stage(entry.entryId, authorization, runs, "identity", "sha256", async () => {
        const opened = await services.open(entry, authorization, config), identity = await hashAsset(opened.bytes());
        if (identity.contentHash !== authorization.contentHash || identity.sizeBytes !== authorization.sizeBytes) throw new FootageAnalysisError("identity", "AUTHORIZATION_HASH_MISMATCH");
        return { value: { opened, identity }, version: "sha256-v1", units: [{ unit: "bytes", quantity: identity.sizeBytes }] };
      });
      verifiedAssetId = value.identity.assetId;
      if (seen.has(verifiedAssetId)) { duplicates.push({ entryId: entry.entryId, assetId: verifiedAssetId }); continue; }
      seen.add(verifiedAssetId); prepared.push({ entry, authorization, ...value, runs });
    } catch (error) { recordFailure(entry.entryId, verifiedAssetId, error, "identity"); }
  }
  prepared.sort((a, b) => a.identity.assetId.localeCompare(b.identity.assetId, "en"));
  const allocations = allocateBudget(prepared.map(() => 1), prepared.map(() => config.proposal.maximumPerAsset), config.proposal.maximumPerProject);
  for (const [index, asset] of prepared.entries()) {
    const { entry, authorization, opened, identity, runs } = asset, assetStarted = services.clock.milliseconds();
    opened.media.setDeadline?.(assetStarted + config.assetTimeoutMilliseconds);
    const runStage = <T>(name: FootageStage, tool: string, action: () => Promise<{ value: T; version: string; units?: CostEvent["units"] }>) => stage(entry.entryId, authorization, runs, name, tool, async () => {
      if (services.clock.milliseconds() - assetStarted >= config.assetTimeoutMilliseconds) throw new FootageAnalysisError(name, "ASSET_TIMEOUT");
      const result = await action();
      if (services.clock.milliseconds() - assetStarted > config.assetTimeoutMilliseconds) throw new FootageAnalysisError(name, "ASSET_TIMEOUT");
      return result;
    });
    try {
      const metadata = await runStage("metadata", "ffprobe", async () => { const result = await opened.media.metadata(); return { value: MetadataSchema.parse(result.value), version: result.version, units: [{ unit: "video_seconds", quantity: result.value.durationSeconds }] }; });
      const shots = await runStage("detect", config.detector.kind === "transnetv2" ? "transnetv2" : "pyscenedetect", async () => { const result = await opened.media.detect(metadata, config.detector); return { value: timelineFromCuts(identity.assetId, metadata, result.cuts), version: result.version, units: [{ unit: "frames", quantity: metadata.frameCount }] }; });
      const sampled = await runStage("sample", "ffmpeg_opencv", async () => {
        if (allocations[index] === 0) throw new FootageAnalysisError("proposal", "PROJECT_CANDIDATE_BUDGET_EXHAUSTED");
        const lattice = selectCheapLattice(identity.assetId, shots, metadata, config.cheap);
        const result = await opened.media.sampleFootage(lattice.samples);
        const after = await hashAsset(opened.bytes());
        if (after.contentHash !== identity.contentHash || after.sizeBytes !== identity.sizeBytes) throw new FootageAnalysisError("identity", "MEDIA_CHANGED_DURING_ANALYSIS");
        return { value: { lattice, result }, version: result.version, units: [{ unit: "frames", quantity: result.decodedFrames }] };
      });
      const cheap = await runStage("visual", "opencv_measurements", async () => {
        const values = sampled.result.features.map((f) => CheapEvidenceSchema.parse(f)), expected = new Map(sampled.lattice.samples.map((s) => [s.sampleId, s]));
        if (values.length !== expected.size || new Set(values.map((f) => f.sample.sampleId)).size !== expected.size) throw new Error("Measurement count mismatch.");
        const byId = new Map(values.map((f) => [f.sample.sampleId, f]));
        for (const frame of values) {
          const s = expected.get(frame.sample.sampleId), m = frame.measurement;
          if (!s || contentId("sample_check", s) !== contentId("sample_check", frame.sample) || m.sampleId !== s.sampleId) throw new Error("Measurement identity mismatch.");
          if (m.comparisonSampleId !== null) { const prior = byId.get(m.comparisonSampleId); if (!prior || prior.sample.shotId !== s.shotId || prior.sample.atSeconds >= s.atSeconds || m.comparisonIntervalSeconds === null || Math.abs(m.comparisonIntervalSeconds - s.atSeconds + prior.sample.atSeconds) > 1e-6) throw new Error("Invalid temporal measurement lineage."); }
          else if (m.comparisonIntervalSeconds !== null || m.frameDifferenceMean !== null || m.opticalFlowMeanPixels !== null) throw new Error("Motion measurement lacks its comparison frame.");
        }
        return { value: values, version: "opencv-temporal-v1", units: [{ unit: "frames", quantity: values.length }] };
      });
      const selected = await runStage("selection", "semantic_event_selector", async () => ({ value: selectSemanticLattice(shots, cheap, config.semantic), version: config.semantic.version }));
      const bank = await runStage("embedding", config.embedding.mode === "stub" ? "synthetic_frame_statistics" : "siglip2_so400m_naflex", async () => {
        const value = await buildFrameFeatureBank(identity.contentHash, cheap, selected.selection, config.embedding, opened.backend, services.cache, await opened.expectedDimensions());
        return { value, version: config.embedding.revision, units: [{ unit: "frames", quantity: value.framesEmbedded }] };
      });
      const proposal = await runStage("proposal", "candidate_proposer", async () => ({ value: new CandidateSegmentProposer().propose(identity.assetId, shots, cheap, config.proposal, allocations[index]!), version: config.proposal.version }));
      const aggregate = await runStage("aggregation", "candidate_aggregator", async () => ({ value: await new CandidateFeatureAggregator(services.cache).aggregate(proposal.candidates, cheap, bank, identity.contentHash, config.embedding), version: config.aggregationVersion }));
      const deduplication = await runStage("deduplication", "candidate_deduplicator", async () => ({ value: pruneCandidates(aggregate.values, aggregate.vectors, shots, config.deduplication), version: config.deduplication.version }));
      const analysisId = contentId("footage", [identity.assetId, configurationId, cheap.map((f) => f.measurementId), bank.frames, aggregate.values.map((v) => v.aggregationId)]);
      const built = await runStage("validation", "clip_segment_builder", async () => {
        const builder = new ClipSegmentBuilder(), modelRunIds = [...runs.map((r) => r.runId), `${contentId("operation", [jobId, entry.entryId, "validation"])}.model`];
        const clips = deduplication.kept.map((e) => builder.build(e, metadata.durationSeconds, modelRunIds, services.clock.now()));
        for (const clip of clips) assertCompatibleEmbeddingSpaces(bank.space, clip.semanticEmbedding!);
        if (analyses[0] !== undefined) assertCompatibleEmbeddingSpaces(analyses[0].inventory.embeddingSpace, bank.space);
        const inventory = { assetId: identity.assetId, analysisId, durationSeconds: metadata.durationSeconds, sourceShots: shots.length, cheapFramesAnalyzed: cheap.length,
          semanticSamplesRequested: selected.semanticSamplesRequested, semanticSamplesSelected: selected.semanticSamplesSelected, semanticSamplesEmbedded: bank.framesEmbedded, uniqueSemanticFrames: bank.uniqueFrames,
          reducedCheapResolution: sampled.lattice.reducedResolution, reducedSemanticCoverage: selected.reducedCoverage, candidatesBeforeDeduplication: proposal.candidates.length, candidatesAfterDeduplication: clips.length,
          coverageBefore: proposal.coverage, coverageAfter: deduplication.coverageAfter, embeddingSpace: bank.space };
        const analysis = FootageAnalysisSchema.parse({ artifactType: "FootageAnalysis", artifactVersion: "1.0.0", analysisId, assetId: identity.assetId, contentHash: identity.contentHash, authorization, configuration: config, configurationId, embeddingImplementation: EMBEDDING_IMPLEMENTATION, metadata, shots, cheapFeatures: cheap,
          semanticFrames: bank.frames, candidates: aggregate.values, keptCandidateIds: clips.map((c) => c.segmentId), prunedCandidates: deduplication.pruned, inventory });
        return { value: { clips, analysis }, version: FOOTAGE_VERSION };
      });
      analyses.push(built.analysis); segments.push(...built.clips);
      cacheStats.push({ assetId: identity.assetId, frameHits: bank.cache.hits, frameMisses: bank.cache.misses, corruptFrames: bank.cache.corrupt, aggregateHits: aggregate.cache.hits, aggregateMisses: aggregate.cache.misses, cheapCacheHit: sampled.result.cacheHit, cheapFramesDecoded: sampled.result.decodedFrames, device: bank.device, semanticFramesEmbedded: bank.framesEmbedded });
    } catch (error) { recordFailure(entry.entryId, identity.assetId, error, "validation"); }
  }
  if (segments.length > config.proposal.maximumPerProject) throw new FootageAnalysisError("validation", "PROJECT_CANDIDATE_LIMIT_EXCEEDED");
  const inventory = FootageInventorySchema.parse({ artifactType: "FootageInventory", artifactVersion: "1.0.0", inventoryId: contentId("inventory", [configurationId, analyses.map((a) => a.analysisId), failures.map((f) => [f.entryId, f.code]), duplicates]), analyzerVersion: FOOTAGE_VERSION, configurationId,
    creatorId: manifest.creatorId, projectId: manifest.projectId, assets: analyses.map((a) => a.inventory), failures, duplicateAssets: duplicates, candidateCount: segments.length, totalSourceDurationSeconds: analyses.reduce((sum, a) => sum + a.metadata.durationSeconds, 0), referenceSpecificSufficiency: null });
  return { segments, analyses, inventory, timings, cacheStats, runtimeMilliseconds: Math.max(0, Math.round(services.clock.milliseconds() - started)), externalApiCostInrMicros: 0, infrastructureCostMeasured: false };
}
export type FootageResult = Awaited<ReturnType<typeof analyzeFootage>>;
