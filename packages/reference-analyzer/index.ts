import { CostEventSchema, ModelRunSchema, ReferenceFingerprintV11Schema } from "../contracts/index.js";
import type { EventScope, ReferenceFingerprintV11, ModelRun } from "../domain/index.js";
import type { Telemetry } from "../telemetry/index.js";
import type { AnalysisContext, VideoEmbeddingProvider } from "../providers/index.js";
import { contentId, hashAsset, pacingMetrics, selectSamples, timelineFromCuts } from "./features.js";
import { ANALYZER_VERSION, AuthorizationManifestSchema, DetectorConfigSchema, EmbeddingConfigSchema, MetadataSchema, MeasurementSchema, type DetectorConfig, type EmbeddingConfig, type Measurement, type MediaMetadata, type Sample, type Shot } from "./protocol.js";
import type { Clock, EmbeddingBatch, ReferenceEmbeddingInput } from "./embeddings.js";

export type AnalysisStage = "authorization" | "identity" | "metadata" | "detect" | "sample" | "embed" | "fingerprint";
const codes: Record<AnalysisStage, string> = { authorization: "AUTHORIZATION_FAILED", identity: "MEDIA_UNREADABLE", metadata: "METADATA_EXTRACTION_FAILED", detect: "SHOT_DETECTION_FAILED", sample: "FRAME_EXTRACTION_FAILED", embed: "EMBEDDING_FAILED", fingerprint: "FINGERPRINT_VALIDATION_FAILED" };
export class ReferenceAnalysisError extends Error {
  constructor(public readonly stage: AnalysisStage, public readonly code: string = codes[stage], diagnostic = "The reference analysis stage failed.") { super(diagnostic); this.name = "ReferenceAnalysisError"; }
}
export interface ShotDetector { detect(metadata: MediaMetadata, config: DetectorConfig): Promise<{ cuts: readonly number[]; version: string }> }
export interface ReferenceMediaProvider extends ShotDetector {
  metadata(): Promise<{ value: MediaMetadata; version: string }>;
  sample(samples: readonly Sample[]): Promise<{ measurements: readonly Measurement[]; version: string }>;
}
export interface AnalyzerOptions { manifest: unknown; bytes: () => AsyncIterable<Uint8Array>; detector: DetectorConfig; embedding: EmbeddingConfig; jobId: string }
export interface AnalyzerServices { media: ReferenceMediaProvider; embeddings: VideoEmbeddingProvider<ReferenceEmbeddingInput, EmbeddingBatch>; telemetry: Telemetry; clock: Clock }

export function buildFingerprint(input: { assetId: string; metadata: MediaMetadata; shots: readonly Shot[]; embeddings: EmbeddingBatch; createdAt: string; modelRunIds: string[]; configurationId: string }): ReferenceFingerprintV11 {
  const pacing = pacingMetrics(input.shots, input.metadata.durationSeconds);
  const refs = new Map(input.embeddings.shots.map((item) => [item.shotId, item.reference]));
  if (refs.size !== input.shots.length || input.shots.some((shot) => !refs.has(shot.shotId))) throw new ReferenceAnalysisError("fingerprint");
  return ReferenceFingerprintV11Schema.parse({
    contractType: "ReferenceFingerprint", schemaVersion: "1.1.0", fingerprintId: contentId("reference", [input.assetId, ANALYZER_VERSION, input.configurationId, input.shots, input.embeddings.batchId]),
    assetId: input.assetId, durationSeconds: input.metadata.durationSeconds, fps: input.metadata.fps, aspectRatio: input.metadata.aspectRatio,
    shots: input.shots.map((shot) => ({ shotId: shot.shotId, sourceRange: { startSeconds: shot.startSeconds, endSeconds: shot.endSeconds }, role: "unknown", transitionOut: { type: "unknown" },
      shotType: "unknown", subjectCount: null, motion: { camera: "unknown", subject: "unknown" }, composition: { framing: "unknown", subjectPosition: "unknown" },
      quality: { sharpness: null, exposure: null, stability: null }, semantics: { description: "", tags: [] }, semanticEmbedding: refs.get(shot.shotId) })),
    structure: [], pacing: { averageShotLengthSeconds: pacing.averageShotLengthSeconds, shotsPerSecond: pacing.shotsPerSecond, trend: "unknown" }, audioFingerprintId: null,
    captions: { density: "unknown", position: "unknown", styleHint: "unknown" }, style: { family: null, category: "unknown", energy: null },
    provenance: { producer: "reference_analyzer", producerVersion: ANALYZER_VERSION, modelRunIds: input.modelRunIds, createdAt: input.createdAt },
  });
}

export async function analyzeReference(options: AnalyzerOptions, services: AnalyzerServices) {
  const started = services.clock.milliseconds();
  const authorization = AuthorizationManifestSchema.safeParse(options.manifest);
  if (!authorization.success || !authorization.data.allowedPurposes.includes("local_reference_analysis") || authorization.data.dateAdded > services.clock.now()) throw new ReferenceAnalysisError("authorization");
  const manifest = authorization.data;
  const config = { detector: DetectorConfigSchema.parse(options.detector), embedding: EmbeddingConfigSchema.parse(options.embedding), analyzerVersion: ANALYZER_VERSION };
  if (config.embedding.mode === "stub" && manifest.sourceType !== "synthetic") throw new ReferenceAnalysisError("authorization", "SYNTHETIC_PROVIDER_FORBIDDEN");
  const scope: EventScope = { projectId: manifest.projectId, creatorId: manifest.creatorId, jobId: options.jobId, environment: manifest.sourceType === "synthetic" ? "synthetic" : "production" };
  const runs: ModelRun[] = [];
  const timings: { stage: AnalysisStage; durationMilliseconds: number; toolVersion: string; outputIds: string[] }[] = [];
  const context = (stage: AnalysisStage): AnalysisContext => ({ scope, operationId: `${options.jobId}.${stage}`, attempt: 1 });
  async function stage<T>(name: AnalysisStage, tool: string, action: () => Promise<{ value: T; version: string; units: { unit: "bytes" | "frames" | "video_seconds" | "operations"; quantity: number }[]; modelRun?: ModelRun; outputIds?: string[] }>): Promise<T> {
    const operation = context(name), start = services.clock.milliseconds(), startedAt = services.clock.now();
    let version = name === "embed" ? config.embedding.revision : name === "identity" ? "sha256-v1" : name === "fingerprint" ? ANALYZER_VERSION : "unmeasured";
    let units: { unit: "bytes" | "frames" | "video_seconds" | "operations"; quantity: number }[] = [{ unit: "operations", quantity: 1 }];
    let run: ModelRun | undefined;
    try {
      const result = await action(); version = result.version; units = result.units;
      run = result.modelRun ?? ModelRunSchema.parse({ contractType: "ModelRun", schemaVersion: "1.0.0", runId: `${operation.operationId}.model`, scope, provider: "local", model: tool, modelVersion: version, adapterVersion: ANALYZER_VERSION, operation: "reference_analysis", inputIds: [`asset_${manifest.contentHash}`], outputIds: result.outputIds ?? [contentId("analysis", [manifest.contentHash, name, version])], startedAt, endedAt: services.clock.now(), status: "succeeded", errorCode: null });
      return result.value;
    } catch (error) {
      const failure = error instanceof ReferenceAnalysisError ? error : new ReferenceAnalysisError(name);
      const attemptedModel = name === "embed" ? config.embedding.mode === "stub" ? "synthetic_frame_statistics" : config.embedding.model.includes("so400m") ? "siglip2_so400m_naflex" : "siglip2_base_naflex" : tool;
      run = ModelRunSchema.parse({ contractType: "ModelRun", schemaVersion: "1.0.0", runId: `${operation.operationId}.model`, scope, provider: name === "embed" ? "local_video_embedding" : "local", model: attemptedModel, modelVersion: version, adapterVersion: ANALYZER_VERSION, operation: name === "embed" ? "embedding" : "reference_analysis", inputIds: [`asset_${manifest.contentHash}`], outputIds: [], startedAt, endedAt: services.clock.now(), status: "failed", errorCode: failure.code });
      throw failure;
    } finally {
      const durationMilliseconds = Math.max(0, Math.round(services.clock.milliseconds() - start));
      if (run !== undefined) { services.telemetry.recordModelRun(run); runs.push(run); }
      services.telemetry.record(CostEventSchema.parse({ contractType: "CostEvent", schemaVersion: "1.0.0", eventId: `${operation.operationId}.cost`, scope, occurredAt: services.clock.now(), operationId: operation.operationId, attempt: 1,
        provider: run?.provider ?? "local", tool, model: run?.model ?? null, modelRunId: run?.runId ?? null, operation: name === "embed" ? "embedding" : "reference_analysis", durationMilliseconds, units, costInrMicros: 0, costSource: scope.environment === "synthetic" ? "synthetic" : "measured" }));
      timings.push({ stage: name, durationMilliseconds, toolVersion: version, outputIds: run?.outputIds ?? [] });
    }
  }
  const identity = await stage("identity", "sha256", async () => {
    const value = await hashAsset(options.bytes());
    if (value.contentHash !== manifest.contentHash || value.sizeBytes !== manifest.sizeBytes) throw new ReferenceAnalysisError("authorization", "AUTHORIZATION_HASH_MISMATCH");
    return { value, version: "sha256-v1", units: [{ unit: "bytes", quantity: value.sizeBytes }] };
  });
  const metadata = await stage("metadata", "ffprobe", async () => { const result = await services.media.metadata(); return { value: MetadataSchema.parse(result.value), version: result.version, units: [{ unit: "video_seconds", quantity: result.value.durationSeconds }] }; });
  const shots = await stage("detect", "pyscenedetect", async () => { const result = await services.media.detect(metadata, config.detector); return { value: timelineFromCuts(identity.assetId, metadata, result.cuts), version: result.version, units: [{ unit: "frames", quantity: metadata.frameCount }] }; });
  const sampled = await stage("sample", "opencv_ffmpeg", async () => {
    const samples = selectSamples(shots, metadata); const result = await services.media.sample(samples);
    const measurements = result.measurements.map((value) => MeasurementSchema.parse(value));
    const ids = new Set(measurements.map((item) => item.sampleId));
    if (ids.size !== samples.length || measurements.length !== samples.length || samples.some((sample) => !ids.has(sample.sampleId))) throw new Error("Frame measurement identities do not match requested samples.");
    const afterSampling = await hashAsset(options.bytes());
    if (afterSampling.contentHash !== identity.contentHash || afterSampling.sizeBytes !== identity.sizeBytes) throw new ReferenceAnalysisError("identity", "MEDIA_CHANGED_DURING_ANALYSIS");
    return { value: { samples, measurements }, version: result.version, units: [{ unit: "frames", quantity: samples.length }] };
  });
  const embeddings = await stage("embed", "video_embedding", async () => {
    const result = await services.embeddings.embed({ contentHash: identity.contentHash, shots, samples: sampled.samples }, context("embed"));
    return { value: result.value, modelRun: result.modelRun, version: result.modelRun.modelVersion, units: [{ unit: "frames", quantity: result.value.framesEmbedded }] };
  });
  const configurationId = contentId("configuration", config);
  const fingerprint = await stage("fingerprint", "reference_builder", async () => {
    const value = buildFingerprint({ assetId: identity.assetId, metadata, shots, embeddings, createdAt: services.clock.now(), modelRunIds: [...runs.map((run) => run.runId), `${context("fingerprint").operationId}.model`], configurationId });
    return { value, version: ANALYZER_VERSION, units: [{ unit: "operations", quantity: 1 }], outputIds: [value.fingerprintId] };
  });
  const runtimeMilliseconds = Math.max(0, Math.round(services.clock.milliseconds() - started));
  return { fingerprint, analysis: { artifactType: "ReferenceAnalysis", artifactVersion: "1.0.0", identity, authorization: manifest, config, configurationId, metadata, samples: sampled.samples, measurements: sampled.measurements,
    pacing: pacingMetrics(shots, metadata.durationSeconds), embeddingBatch: embeddings, timings, externalApiCostInrMicros: 0, infrastructureCostMeasured: false },
    evaluation: { artifactType: "ReferenceEvaluation", artifactVersion: "1.0.0", schemaValid: true, schemaValidFingerprintRate: 1, analyzedAssets: 1, runtimeMilliseconds,
      runtimeMillisecondsPerSourceMinute: runtimeMilliseconds * 60 / metadata.durationSeconds, sampledFrames: sampled.samples.length, embeddingCacheHitRate: embeddings.cache.hits / sampled.samples.length,
      boundaryMetrics: null, boundaryMetricsMissingReason: "No manually labeled benchmark supplied.", semanticAccuracy: null, embeddingQuality: null,
      determinism: "Timeline, samples, IDs and configuration are structural; timestamps/timings vary; embedding arithmetic uses numerical tolerance." } };
}
