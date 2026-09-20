import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ReferenceFingerprintV11Schema } from "../packages/contracts/index.js";
import { hashAsset, timelineFromCuts, validateTimeline, selectSamples, aggregateEmbeddings, pacingMetrics, contentId } from "../packages/reference-analyzer/features.js";
import { AuthorizationManifestSchema, MetadataSchema, WorkerResponseSchema, DEFAULT_DETECTOR, STUB_EMBEDDING, type MediaMetadata, type Measurement } from "../packages/reference-analyzer/protocol.js";
import { CachedReferenceEmbeddingProvider, embeddingCacheKey, type ArtifactCache, type Clock } from "../packages/reference-analyzer/embeddings.js";
import { analyzeReference, ReferenceAnalysisError, type ReferenceMediaProvider } from "../packages/reference-analyzer/index.js";
import { InMemoryTelemetry } from "../packages/telemetry/index.js";
import { boundaryMetrics, verifyReferenceBenchmark } from "../packages/evaluation/reference.js";
import { siglipConfiguration } from "../packages/reference-analyzer/models.js";

const bytes = new TextEncoder().encode("Authorized synthetic bytes; no real media.");
async function* source() { yield bytes.subarray(0, 10); yield bytes.subarray(10); }
const time = "2026-09-13T00:00:00.000Z";
const clock: Clock = { now: () => time, milliseconds: () => 100 };
const metadata: MediaMetadata = { durationSeconds: 3, width: 180, height: 320, codedWidth: 180, codedHeight: 320, fps: { numerator: 10, denominator: 1 }, frameCount: 30,
  frameTimes: Array.from({ length: 30 }, (_, i) => i / 10), codec: "h264", rotation: 0, aspectRatio: { width: 9, height: 16 }, hasAudio: false, variableFrameRate: false };
class MemoryCache implements ArtifactCache {
  readonly values = new Map<string, unknown>();
  async read(key: string) { return this.values.get(key) ?? null; }
  async write(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
}
async function setup() {
  const identity = await hashAsset(source());
  const manifest = { manifestType: "AuthorizedReference", schemaVersion: "1.0.0", contentHash: identity.contentHash, sizeBytes: bytes.length, sourceType: "synthetic", authorizationBasis: "synthetic_generated", allowedPurposes: ["local_reference_analysis", "local_evaluation"], dateAdded: time, creatorId: "creator_test", projectId: "project_test" };
  const cache = new MemoryCache(); let calls = 0;
  const backend = { async embed(ids: readonly string[]) { calls++; return { vectors: ids.map((sampleId) => ({ sampleId, vector: [1, sampleId.charCodeAt(sampleId.length - 1), 2, 3] })), version: "stub-v1", device: "cpu" as const, fallback: false }; } };
  const provider = new CachedReferenceEmbeddingProvider(backend, cache, STUB_EMBEDDING, clock);
  const media: ReferenceMediaProvider = {
    async metadata() { return { value: metadata, version: "9.0.1" }; },
    async detect() { return { cuts: [10, 20], version: "0.6.7.1" }; },
    async sample(samples) { return { version: "test", measurements: samples.map((sample): Measurement => ({ sampleId: sample.sampleId, comparisonSampleId: null, comparisonIntervalSeconds: null, brightnessMean: 0.5, darkPixelFraction: 0, brightPixelFraction: 0, laplacianVariance: 3, frameDifferenceMean: null, opticalFlowMeanPixels: null })) }; },
  };
  const options = { manifest, bytes: source, detector: DEFAULT_DETECTOR, embedding: STUB_EMBEDDING, jobId: "job_reference_test" };
  const telemetry = new InMemoryTelemetry();
  return { identity, manifest, cache, provider, media, options, telemetry, calls: () => calls, services: { media, embeddings: provider, telemetry, clock } };
}

test("released Phase 0 contracts, JSON schemas and fixture bytes remain frozen", () => {
  const digests = JSON.parse(readFileSync("tests/fixtures/phase0-frozen-digests.json", "utf8")) as Record<string, string>;
  for (const [file, hash] of Object.entries(digests)) assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), hash, file);
});
test("streamed asset hashing identifies bytes independently of chunk boundaries", async () => {
  const identity = await hashAsset(source());
  assert.equal(identity.contentHash, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(identity.sizeBytes, bytes.length);
  assert.deepEqual(identity, await hashAsset((async function* () { yield bytes; })()));
});
test("authorization validates purpose, content, provenance and synthetic provider restrictions before decoding", async () => {
  for (const patch of [{ allowedPurposes: ["local_evaluation"] }, { contentHash: "a".repeat(64) }, { dateAdded: "2099-01-01T00:00:00.000Z" }, { sourceType: "owner_supplied", authorizationBasis: "owner_created" }]) {
    const env = await setup(); let decoded = false;
    env.media.metadata = async () => { decoded = true; return { value: metadata, version: "test" }; };
    await assert.rejects(analyzeReference({ ...env.options, manifest: { ...env.manifest, ...patch } }, env.services), ReferenceAnalysisError);
    assert.equal(decoded, false);
  }
  const env = await setup();
  assert.equal(AuthorizationManifestSchema.safeParse({ ...env.manifest, sourceType: "owner_supplied" }).success, false);
  assert.equal(AuthorizationManifestSchema.safeParse({ ...env.manifest, localPath: "private" }).success, false);
});
test("metadata and narrow interchange reject invalid timestamps, NaN, versions and leaked fields", () => {
  assert.ok(MetadataSchema.safeParse(metadata).success);
  for (const patch of [{ frameCount: 29 }, { frameTimes: [0, 0] }, { durationSeconds: Number.NaN }, { rotation: 45 }, { fps: { numerator: 240, denominator: 1 } }]) assert.equal(MetadataSchema.safeParse({ ...metadata, ...patch }).success, false);
  assert.equal(WorkerResponseSchema.safeParse({ protocolVersion: "2", operation: "metadata", value: metadata, toolVersion: "1" }).success, false);
  assert.equal(WorkerResponseSchema.safeParse({ protocolVersion: "1.0.0", operation: "metadata", value: metadata, toolVersion: "1", providerPayload: {} }).success, false);
});
test("shot boundaries form a complete ordered partition; impossible timelines fail", () => {
  const shots = timelineFromCuts("asset_test", metadata, [10, 20]);
  assert.equal(shots.length, 3); assert.equal(shots[2]!.endSeconds, 3);
  for (const cuts of [[20, 10], [10, 10], [0], [30], [1.2]]) assert.throws(() => timelineFromCuts("asset_test", metadata, cuts));
  assert.throws(() => validateTimeline([{ ...shots[0]!, startSeconds: 0.1 }, ...shots.slice(1)], 3));
  assert.throws(() => validateTimeline(shots.slice(0, 2), 3));
});
test("representative sampling caps samples, avoids boundary frames when possible and uses actual VFR timestamps", () => {
  const shots = timelineFromCuts("asset_test", metadata, [2, 10]);
  const samples = selectSamples(shots, metadata);
  assert.equal(samples.filter((sample) => sample.shotId === shots[0]!.shotId).length, 1);
  assert.ok(shots.every((shot) => samples.filter((sample) => sample.shotId === shot.shotId).length <= 3));
  assert.deepEqual(samples, selectSamples(shots, metadata));
  assert.ok(samples.every((sample) => sample.atSeconds === metadata.frameTimes[sample.frameIndex]));
  const vfr = { ...metadata, durationSeconds: 1, frameCount: 4, frameTimes: [0, 0.05, 0.4, 0.9], variableFrameRate: true };
  const selected = selectSamples(timelineFromCuts("asset_vfr", vfr, []), vfr);
  assert.ok(selected.every((sample) => [0.05, 0.4].includes(sample.atSeconds)));
});
test("normalized mean aggregation is deterministic and rejects unusable vectors", () => {
  assert.ok(aggregateEmbeddings([[2, 0], [0, 2]]).every((value) => Math.abs(value - Math.SQRT1_2) < 1e-12));
  for (const vectors of [[], [[0, 0]], [[1, 0], [1]], [[1, 0], [-1, 0]], [[Number.NaN]]]) assert.throws(() => aggregateEmbeddings(vectors));
});
test("cache keys bind content, model, revision, sampling, device and preprocessing configuration", () => {
  const key = embeddingCacheKey("a".repeat(64), ["sample_a"], STUB_EMBEDDING, "frame");
  for (const changed of [embeddingCacheKey("b".repeat(64), ["sample_a"], STUB_EMBEDDING, "frame"), embeddingCacheKey("a".repeat(64), ["sample_b"], STUB_EMBEDDING, "frame"), embeddingCacheKey("a".repeat(64), ["sample_a"], { ...STUB_EMBEDDING, maxPatches: 512 }, "frame"), embeddingCacheKey("a".repeat(64), ["sample_a"], STUB_EMBEDDING, "normalized-mean-v1")]) assert.notEqual(key, changed);
  const base = siglipConfiguration();
  const realKey = embeddingCacheKey("a".repeat(64), ["sample_a"], base, "frame");
  for (const changed of [{ ...base, revision: "b".repeat(40) }, { ...base, device: "cuda" as const }, siglipConfiguration("so400m")]) assert.notEqual(realKey, embeddingCacheKey("a".repeat(64), ["sample_a"], changed, "frame"));
});
test("pacing distinguishes cut density from shots per second and leaves empty boundary metrics unavailable", () => {
  const shots = timelineFromCuts("asset_test", metadata, [10, 20]);
  const metrics = pacingMetrics(shots, 3);
  assert.equal(metrics.cutsPerSecond, 2 / 3); assert.equal(metrics.shotsPerSecond, 1); assert.equal(metrics.medianShotLengthSeconds, 1);
  assert.equal(boundaryMetrics([], [], 0.1).f1, null);
  assert.equal(boundaryMetrics([], [1], 0.1).f1, 0);
  const measured = boundaryMetrics([0.98, 1.03, 2.5], [1, 2], 0.05);
  assert.equal(measured.truePositives, 1); assert.equal(measured.falsePositives, 2); assert.equal(measured.falseNegatives, 1);
});
test("boundary benchmark labels are immutable, manually attributable and separate from predictions", () => {
  const cases = [{ contentHash: "a".repeat(64), creatorGroupId: "creator_a", durationSeconds: 3, fps: { numerator: 30, denominator: 1 }, labelSource: "manually_reviewed", annotatorId: "owner", boundariesSeconds: [1, 2] }];
  const manifest = { manifestType: "ReferenceBoundaryBenchmark", schemaVersion: "1.0.0", benchmarkId: "benchmark_a", version: "1", frozenAt: time, toleranceFrames: 1, cases, casesDigest: contentId("benchmark", cases) };
  assert.doesNotThrow(() => verifyReferenceBenchmark(manifest));
  assert.throws(() => verifyReferenceBenchmark({ ...manifest, cases: [{ ...cases[0], boundariesSeconds: [1.1, 2] }] }));
  assert.throws(() => verifyReferenceBenchmark({ ...manifest, toleranceFrames: 15 }));
});
test("coherent orchestrator builds validated unknown semantics, links telemetry and reuses embeddings", async () => {
  const env = await setup();
  const first = await analyzeReference(env.options, env.services);
  assert.ok(ReferenceFingerprintV11Schema.safeParse(first.fingerprint).success);
  assert.equal(first.fingerprint.shots.length, 3);
  assert.ok(first.fingerprint.shots.every((shot) => shot.role === "unknown" && shot.transitionOut.type === "unknown" && shot.semanticEmbedding !== null));
  assert.equal(JSON.stringify(first.fingerprint).includes('"vector"'), false);
  assert.equal(env.telemetry.modelRuns().length, 6); assert.equal(env.telemetry.snapshot().length, 6);
  assert.deepEqual(first.fingerprint.provenance.modelRunIds, env.telemetry.modelRuns().map((run) => run.runId));
  assert.equal(first.evaluation.boundaryMetrics, null);
  const second = await analyzeReference(env.options, { ...env.services, telemetry: new InMemoryTelemetry() });
  assert.equal(env.calls(), 1);
  assert.equal(second.evaluation.embeddingCacheHitRate, 1);
  assert.equal(second.analysis.embeddingBatch.framesEmbedded, 0);
  assert.equal(second.analysis.embeddingBatch.device, null);
  assert.deepEqual(first.fingerprint, second.fingerprint);
  const entry = env.cache.values.keys().next().value!; env.cache.values.set(entry, { broken: true });
  const recovered = await analyzeReference(env.options, { ...env.services, telemetry: new InMemoryTelemetry() });
  assert.equal(recovered.analysis.embeddingBatch.cache.corrupt, 1);
  assert.equal(env.calls(), 2);
});

test("media changes during decoding are rejected before embedding-cache writes", async () => {
  const env = await setup(); let reads = 0;
  const changingBytes = async function* () { reads++; yield reads === 1 ? bytes : new TextEncoder().encode("changed"); };
  await assert.rejects(analyzeReference({ ...env.options, bytes: changingBytes }, env.services), (error: unknown) => error instanceof ReferenceAnalysisError && error.code === "MEDIA_CHANGED_DURING_ANALYSIS");
  assert.equal(env.calls(), 0); assert.equal(env.cache.values.size, 0);
});

test("fingerprint acceptance rejects missing embedding joins and broken media measurements", async () => {
  const env = await setup();
  const broken = { id: env.provider.id, version: env.provider.version, async embed(input: Parameters<typeof env.provider.embed>[0], context: Parameters<typeof env.provider.embed>[1]) {
    const result = await env.provider.embed(input, context); return { ...result, value: { ...result.value, shots: [] } };
  } };
  await assert.rejects(analyzeReference(env.options, { ...env.services, embeddings: broken }), (error: unknown) => error instanceof ReferenceAnalysisError && error.code === "FINGERPRINT_VALIDATION_FAILED");
  const other = await setup(); other.media.sample = async () => ({ measurements: [], version: "bad" });
  await assert.rejects(analyzeReference(other.options, other.services), (error: unknown) => error instanceof ReferenceAnalysisError && error.stage === "sample");
});
test("stage failures retain stage codes and emit failure runs/costs without leaking provider errors", async () => {
  for (const stage of ["metadata", "detect", "sample"] as const) {
    const env = await setup();
    env.media[stage] = async () => { throw new Error("C:/secret/private-video.mp4"); };
    await assert.rejects(analyzeReference(env.options, env.services), (error: unknown) => error instanceof ReferenceAnalysisError && error.stage === stage && !error.message.includes("secret"));
    assert.equal(env.telemetry.modelRuns().at(-1)!.status, "failed");
    assert.equal(env.telemetry.snapshot().at(-1)!.contractType, "CostEvent");
    assert.equal(JSON.stringify(env.telemetry.modelRuns()).includes("secret"), false);
  }
  const env = await setup();
  const embeddings = { id: "failed_provider", version: "1", async embed(): Promise<never> { throw new ReferenceAnalysisError("embed", "EMBEDDING_MODEL_UNAVAILABLE"); } };
  await assert.rejects(analyzeReference(env.options, { ...env.services, embeddings }), (error: unknown) => error instanceof ReferenceAnalysisError && error.code === "EMBEDDING_MODEL_UNAVAILABLE");
});
