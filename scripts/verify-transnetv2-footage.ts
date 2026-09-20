// Explicit, local-only Phase 2.6B verification composition. No detector defaults change.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import { DEFAULT_FOOTAGE_CONFIG, FootageManifestSchema, FootageAuthorizationSchema } from "../packages/footage-analyzer/protocol.js";
import { contentId, hashAsset, timelineFromCuts, validateTimeline } from "../packages/reference-analyzer/features.js";
import { MetadataSchema, type MediaMetadata } from "../packages/reference-analyzer/protocol.js";
import { TRANSNETV2_ADAPTER_VERSION, TRANSNETV2_SOURCE_COMMIT, TRANSNETV2_SOURCE_SHA256,
  TRANSNETV2_WEIGHT_SET_SHA256, type TransNetV2DetectionResponse } from "../packages/footage-analyzer/transnetv2-protocol.js";
import { LocalFootageServices, readFootageJson, writeFootageJson } from "./footage-local.js";
import { LocalTransNetV2Detector } from "./transnetv2-local.js";
import { PythonWorker, PROJECT_ROOT } from "./reference-local.js";

const LaunchSchema = z.strictObject({ projectRootWsl: z.string().min(1), pythonPathWsl: z.string().min(1),
  repositoryPathWsl: z.string().min(1), weightsPathWsl: z.string().min(1), timeoutMilliseconds: z.number().int().positive().max(300000).default(180000) });
const detector = { kind: "transnetv2" as const, threshold: 0.5 };
const config = { ...DEFAULT_FOOTAGE_CONFIG, detector };
type FreshRecord = Awaited<ReturnType<typeof hashAsset>> & {
  metadata: MediaMetadata; requestedDetector: string; executedDetector: string;
  freshInference: boolean; cacheHit: boolean; silentFallback: boolean; cacheKey: string;
  result: { cuts: readonly number[]; version: string }; shots: ReturnType<typeof timelineFromCuts>;
  elapsedMilliseconds: number; provider: TransNetV2DetectionResponse;
};

function detectionKey(hash: string, frames: number) {
  return contentId("cache", ["footage-detection-transnetv2-v1", hash, detector, frames,
    TRANSNETV2_ADAPTER_VERSION, TRANSNETV2_SOURCE_COMMIT, TRANSNETV2_SOURCE_SHA256,
    TRANSNETV2_WEIGHT_SET_SHA256, "ffmpeg-9.0.1", "rgb48x27-passthrough-v1"]);
}
function validateShots(assetId: string, metadata: MediaMetadata, cuts: readonly number[]) {
  const shots = timelineFromCuts(assetId, metadata, cuts);
  validateTimeline(shots, metadata.durationSeconds);
  assert.equal(shots.length, cuts.length + 1);
  assert.equal(shots[0]!.startSeconds, 0);
  assert.equal(shots.at(-1)!.endSeconds, metadata.durationSeconds);
  for (const [i, shot] of shots.entries()) {
    assert.ok(shot.startSeconds >= 0 && shot.endSeconds > shot.startSeconds && shot.endSeconds <= metadata.durationSeconds);
    if (i > 0) { assert.equal(shot.startSeconds, metadata.frameTimes[cuts[i - 1]!]); assert.equal(shot.startSeconds, shots[i - 1]!.endSeconds); }
  }
  return shots;
}

async function main() {
  const [manifestInput, launchInput, outputInput, historicalInput] = process.argv.slice(2);
  assert.ok(manifestInput && launchInput && outputInput && historicalInput, "VERIFICATION_ARGUMENTS_REQUIRED");
  const manifestPath = resolve(manifestInput), output = resolve(outputInput);
  assert.ok(output.startsWith(resolve(PROJECT_ROOT, ".local-runs") + "/") || output.startsWith(resolve(PROJECT_ROOT, ".local-runs") + "\\"), "LOCAL_OUTPUT_REQUIRED");
  await mkdir(output, { recursive: true });
  // Exclusive marker prevents accidentally reusing a previous fresh-run directory.
  await writeFile(join(output, "started.json"), JSON.stringify({ startedAt: new Date().toISOString() }), { flag: "wx" });
  const parsed = FootageManifestSchema.parse(await readFootageJson(manifestPath, 256 * 1024));
  const manifest = { ...parsed, assets: parsed.assets.map(entry => ({ ...entry, authorization: FootageAuthorizationSchema.parse(entry.authorization) })) };
  const launch = LaunchSchema.parse(await readFootageJson(launchInput, 65536));
  for (const entry of manifest.assets) {
    const a = entry.authorization;
    assert.notEqual(a.sourceType, "synthetic");
    assert.equal(a.projectId, manifest.projectId); assert.equal(a.creatorId, manifest.creatorId);
    assert.ok(a.allowedPurposes.includes("local_footage_analysis") && a.dateAdded <= new Date().toISOString());
  }
  const providerCalls: { startedAt: string; elapsedMilliseconds: number; response: TransNetV2DetectionResponse }[] = [];
  const pythonOperations: { operation: string; startedAt: string }[] = [];
  const ownedDetect = LocalTransNetV2Detector.prototype.detect;
  const ownedRequest = PythonWorker.prototype.request;
  // Observation only: the exact owned methods execute with unchanged requests/results.
  LocalTransNetV2Detector.prototype.detect = async function(request) {
    const startedAt = new Date().toISOString(), start = performance.now();
    const response = await ownedDetect.call(this, request);
    providerCalls.push({ startedAt, elapsedMilliseconds: performance.now() - start, response: structuredClone(response) });
    await writeFootageJson(join(output, "provider-responses.json"), providerCalls);
    return response;
  };
  PythonWorker.prototype.request = async function(request, timeout) {
    pythonOperations.push({ operation: request.operation, startedAt: new Date().toISOString() });
    // This detector gate may reuse genuine SigLIP cache data but never starts a new semantic model.
    // The unchanged production guard remains in place; an unexpected miss stops this harness first.
    assert.notEqual(request.operation, "embed", "FRESH_SIGLIP_NOT_PART_OF_DETECTOR_GATE");
    return ownedRequest.call(this, request, timeout);
  };
  const services = new LocalFootageServices(manifestPath, join(output, "capacity.json"), join(output, "frames"), join(output, "cache"), launch);
  const records: FreshRecord[] = [];
  let applicationServices: LocalFootageServices | undefined;
  try {
    // All sources are validated before the first expensive detector call.
    const prepared = [];
    for (const entry of manifest.assets) {
      const opened = await services.open(entry, entry.authorization, config);
      const identity = await hashAsset(opened.bytes());
      assert.equal(identity.contentHash, entry.authorization.contentHash); assert.equal(identity.sizeBytes, entry.authorization.sizeBytes);
      const metadata = MetadataSchema.parse((await opened.media.metadata()).value);
      prepared.push({ entry, opened, identity, metadata });
    }
    await writeFootageJson(join(output, "media-preflight.json"), prepared.map(p => ({ ...p.identity, metadata: p.metadata, authorization: p.entry.authorization })));
    assert.equal(providerCalls.length, 0);
    for (const p of prepared) {
      const { opened, identity, metadata } = p;
      const key = detectionKey(identity.contentHash, metadata.frameCount);
      assert.equal(await services.cache.read(key), null);
      const before: number = providerCalls.length, start = performance.now();
      const result = await opened.media.detect(metadata, detector);
      const elapsedMilliseconds = performance.now() - start;
      assert.equal(providerCalls.length, before + 1);
      const response = providerCalls.at(-1)!.response;
      assert.deepEqual(result.cuts, response.value.cuts);
      assert.equal(response.model.provider, "transnetv2"); assert.equal(response.model.device, "cuda");
      assert.equal(response.model.gpuName, "NVIDIA GeForce RTX 4050 Laptop GPU");
      assert.equal(response.model.sourceSha256, TRANSNETV2_SOURCE_SHA256);
      assert.equal(response.model.weightSetSha256, TRANSNETV2_WEIGHT_SET_SHA256);
      assert.equal(response.media.decodedFrameCount, metadata.frameCount);
      assert.equal(response.config.threshold, detector.threshold);
      const shots = validateShots(identity.assetId, metadata, result.cuts);
      records.push({ ...identity, metadata, requestedDetector: "transnetv2", executedDetector: response.model.provider,
        freshInference: true, cacheHit: false, silentFallback: false, cacheKey: key, result, shots, elapsedMilliseconds, provider: response });
      await writeFootageJson(join(output, "fresh-timelines.json"), records);
      process.stdout.write(JSON.stringify({ stage: "fresh", assetId: identity.assetId, frames: metadata.frameCount, cuts: result.cuts, shots: shots.length }) + "\n");
    }
    assert.equal(pythonOperations.filter(p => p.operation === "detect" || p.operation === "embed").length, 0);
    const repeats = [];
    for (const [i, p] of prepared.entries()) {
      const before: number = providerCalls.length, start = performance.now();
      const result = await p.opened.media.detect(p.metadata, detector);
      assert.equal(providerCalls.length, before);
      assert.deepEqual(result, records[i]!.result);
      const shots = validateShots(p.identity.assetId, p.metadata, result.cuts);
      assert.deepEqual(shots, records[i]!.shots);
      repeats.push({ assetId: p.identity.assetId, cacheKey: records[i]!.cacheKey, cacheHit: true, freshInference: false,
        cuts: result.cuts, shots, version: result.version, elapsedMilliseconds: performance.now() - start });
    }
    await writeFootageJson(join(output, "cache-repeat.json"), repeats);
    await services.close(); // release CUDA before any other application stage

    const baseline = [];
    for (const p of prepared) {
      const before = pythonOperations.filter(v => v.operation === "detect").length;
      const start = performance.now();
      const result = await p.opened.media.detect(p.metadata, DEFAULT_FOOTAGE_CONFIG.detector);
      assert.equal(pythonOperations.filter(v => v.operation === "detect").length, before + 1);
      const shots = validateShots(p.identity.assetId, p.metadata, result.cuts);
      baseline.push({ ...p.identity, requestedDetector: "pyscenedetect", executedDetector: "pyscenedetect", cacheHit: false,
        config: DEFAULT_FOOTAGE_CONFIG.detector, cuts: result.cuts, version: result.version, shots, elapsedMilliseconds: performance.now() - start });
      await writeFootageJson(join(output, "pyscenedetect.json"), baseline);
      process.stdout.write(JSON.stringify({ stage: "pyscenedetect", assetId: p.identity.assetId, cuts: result.cuts, shots: shots.length }) + "\n");
    }
    await services.close();
    assert.deepEqual(await readdir(join(output, "frames")), []); // no RGB/frame dumps

    // Complete application proof on a same-boundary source with existing genuine semantic evidence.
    const historical: { contentHash: string; shots: unknown }[] = [];
    for (const name of await readdir(resolve(historicalInput))) {
      if (name.endsWith(".json")) historical.push(JSON.parse(await readFile(join(resolve(historicalInput), name), "utf8")) as { contentHash: string; shots: unknown });
    }
    applicationServices = new LocalFootageServices(manifestPath, join(output, "application-capacity.json"), undefined, undefined, launch);
    let chosen: (typeof prepared)[number] | undefined;
    for (const [i, p] of prepared.entries()) {
      if (historical.some(h => h.contentHash === p.identity.contentHash && contentId("shots", h.shots) === contentId("shots", records[i]!.shots))
        && await applicationServices.cache.read(detectionKey(p.identity.contentHash, p.metadata.frameCount)) === null) {
        chosen = p; break;
      }
    }
    assert.ok(chosen, "SAME_BOUNDARY_ASSET_WITH_FRESH_APPLICATION_CACHE_REQUIRED");
    const before = providerCalls.length;
    const app = await analyzeFootage({ ...manifest, assets: [chosen.entry] }, config, "phase2_6b_application_fresh", applicationServices);
    await writeFootageJson(join(output, "application-fresh.json"), { ...app, modelRuns: applicationServices.telemetry.modelRuns(), events: applicationServices.telemetry.snapshot() });
    assert.deepEqual(app.inventory.failures, []); assert.equal(app.analyses.length, 1);
    assert.equal(providerCalls.length, before + 1);
    assert.equal(app.cacheStats[0]!.semanticFramesEmbedded, 0);
    const corpusRecord = records.find(r => r.contentHash === chosen.identity.contentHash)!;
    assert.deepEqual(app.analyses[0]!.shots, corpusRecord.shots);
    assert.deepEqual(providerCalls.at(-1)!.response.value.cuts, corpusRecord.result.cuts);
    assert.deepEqual(providerCalls.at(-1)!.response.model, corpusRecord.provider.model);
    const appRepeat = await analyzeFootage({ ...manifest, assets: [chosen.entry] }, config, "phase2_6b_application_repeat", applicationServices);
    await writeFootageJson(join(output, "application-repeat.json"), appRepeat);
    assert.deepEqual(appRepeat.inventory.failures, []); assert.equal(providerCalls.length, before + 1);
    assert.deepEqual(appRepeat.analyses[0]!.shots, app.analyses[0]!.shots);
    assert.equal(appRepeat.analyses[0]!.analysisId, app.analyses[0]!.analysisId);
    assert.equal(appRepeat.cacheStats[0]!.semanticFramesEmbedded, 0);
    await applicationServices.close();
    for (const p of prepared) assert.deepEqual(await hashAsset(p.opened.bytes()), p.identity);
    await writeFootageJson(join(output, "proof.json"), { status: "PASS", phase: "2.6B", realFootage: true,
      manifestSha256: createHash("sha256").update(await readFile(manifestPath)).digest("hex"),
      servicePath: "analyzeFootage -> LocalFootageServices -> LocalTransNetV2Detector -> transnet_detector -> TensorFlow CUDA -> integer cuts -> timelineFromCuts(metadata.frameTimes)",
      requestedDetector: "transnetv2", executedDetector: "transnetv2", freshInference: true, silentFallback: false,
      mediaTruthAuthority: true, footageDefault: "pyscenedetect", referenceAnalyzerModified: false,
      corpusAssets: records.length, providerCalls: providerCalls.length, freshCorpusAssets: records.length,
      cacheRepeatAssets: repeats.length, fullApplicationAsset: chosen.identity.assetId,
      fullApplicationFreshProviderCalls: 1, fullApplicationCacheRepeatProviderCalls: 0,
      freshRunBoundaryDeterminism: true, applicationAnalysisIdStable: true, freshSiglipCalls: 0,
      rawRgbDumps: 0, applicationCheapFramesDecoded: app.cacheStats[0]!.cheapFramesDecoded,
      sourceBytesUnchanged: true, pythonOperations,
      detectorQualitySuperiority: "UNPROVEN", regressionGate: "pending post-inference suite" });
    process.stdout.write(JSON.stringify({ stage: "application", assetId: chosen.identity.assetId, status: "PASS", freshProviderCalls: 1, repeatProviderCalls: 0 }) + "\n");
  } finally {
    await services.close(); await applicationServices?.close();
    LocalTransNetV2Detector.prototype.detect = ownedDetect;
    PythonWorker.prototype.request = ownedRequest;
    await writeFootageJson(join(output, "finished.json"), { finishedAt: new Date().toISOString() });
  }
}

main().catch(() => { process.stderr.write("PHASE_2_6B_VERIFICATION_FAILED: inspect local evidence; no fallback or closure claimed.\n"); process.exitCode = 1; });
