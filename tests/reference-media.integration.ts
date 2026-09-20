import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { analyzeReference, ReferenceAnalysisError } from "../packages/reference-analyzer/index.js";
import { CachedReferenceEmbeddingProvider } from "../packages/reference-analyzer/embeddings.js";
import { DEFAULT_DETECTOR, STUB_EMBEDDING } from "../packages/reference-analyzer/protocol.js";
import { hashAsset, timelineFromCuts, selectSamples, contentId } from "../packages/reference-analyzer/features.js";
import { boundaryMetrics } from "../packages/evaluation/reference.js";
import { InMemoryTelemetry } from "../packages/telemetry/index.js";
import { FileArtifactCache, LocalReferenceMedia, PythonWorker, PROJECT_ROOT, localPaths, localBytes, localClock, atomicJson, authorizedLocalPath } from "../scripts/reference-local.js";

async function command(executable: string, args: string[]) {
  return await new Promise<string>((accept, reject) => { execFile(executable, args, { cwd: PROJECT_ROOT, windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => error === null ? accept(stdout) : reject(new Error(`Synthetic media tool failed: ${stderr.slice(0, 1000)}`))); });
}
async function environment() {
  const base = join(PROJECT_ROOT, ".test-artifacts"); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "media-"));
  const mediaPath = join(directory, "synthetic video & (local).mp4");
  await command(localPaths.ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=red:s=90x160:r=10:d=1", "-f", "lavfi", "-i", "color=c=white:s=90x160:r=10:d=1", "-f", "lavfi", "-i", "color=c=blue:s=90x160:r=10:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]", "-map", "[out]", "-map", "3:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1", "-c:a", "aac", "-shortest", mediaPath]);
  const identity = await hashAsset(localBytes(mediaPath));
  const manifest = { manifestType: "AuthorizedReference", schemaVersion: "1.0.0", contentHash: identity.contentHash, sizeBytes: identity.sizeBytes,
    sourceType: "synthetic", authorizationBasis: "synthetic_generated", allowedPurposes: ["local_reference_analysis", "local_evaluation"], dateAdded: "2026-09-13T00:00:00.000Z", creatorId: "creator_synthetic", projectId: "project_synthetic_reference" };
  await atomicJson(join(directory, "authorization.json"), manifest);
  const cases = [{ contentHash: identity.contentHash, creatorGroupId: "creator_synthetic", durationSeconds: 3, fps: { numerator: 10, denominator: 1 }, labelSource: "synthetic_generated", annotatorId: "synthetic_generator_v1", boundariesSeconds: [1, 2] }];
  await atomicJson(join(directory, "benchmark.json"), { manifestType: "ReferenceBoundaryBenchmark", schemaVersion: "1.0.0", benchmarkId: "synthetic_three_scenes", version: "1", frozenAt: manifest.dateAdded, toleranceFrames: 1, cases, casesDigest: contentId("benchmark", cases) });
  return { directory, mediaPath, manifest };
}

test("real media pipeline: both detectors, measured frames, validated fingerprint, cache reuse and offline CLI", { timeout: 180000 }, async () => {
  const env = await environment();
  const worker = new PythonWorker();
  try {
    const media = new LocalReferenceMedia(worker, env.mediaPath, join(env.directory, "frames"));
    const cache = new FileArtifactCache(join(env.directory, "embeddings"));
    const provider = new CachedReferenceEmbeddingProvider(media, cache, STUB_EMBEDDING, localClock);
    const results = [];
    for (const kind of ["content", "adaptive", "content"] as const) {
      const telemetry = new InMemoryTelemetry();
      const result = await analyzeReference({ manifest: env.manifest, bytes: () => localBytes(env.mediaPath), detector: { ...DEFAULT_DETECTOR, kind }, embedding: STUB_EMBEDDING, jobId: `job_${randomUUID()}` }, { media, embeddings: provider, telemetry, clock: localClock });
      assert.equal(result.fingerprint.shots.length, 3);
      assert.equal(result.analysis.metadata.hasAudio, true);
      assert.equal(result.analysis.metadata.frameCount, 30);
      assert.equal(result.analysis.metadata.width, 90);
      assert.equal(result.evaluation.sampledFrames, 9);
      assert.equal(telemetry.modelRuns().length, 6);
      assert.ok(telemetry.snapshot().some((event) => event.contractType === "CostEvent" && event.durationMilliseconds > 0));
      const metrics = boundaryMetrics(result.fingerprint.shots.slice(1).map((shot) => shot.sourceRange.startSeconds), [1, 2], 0.1);
      assert.equal(metrics.f1, 1); assert.equal(metrics.meanAbsoluteTimingErrorSeconds, 0);
      const png = await readFile(join(env.directory, "frames", `${result.analysis.samples[0]!.sampleId}.png`));
      assert.equal(png.readUInt32BE(16), 288); assert.equal(png.readUInt32BE(20), 512);
      await atomicJson(join(env.directory, `${kind}-${results.length}.fingerprint.json`), result.fingerprint);
      await atomicJson(join(env.directory, `${kind}-${results.length}.evaluation.json`), { ...result.evaluation, boundaryMetrics: metrics, boundaryMetricsMissingReason: null });
      results.push(result);
    }
    assert.equal(results[0]!.analysis.embeddingBatch.cache.misses, 9);
    assert.equal(results[2]!.analysis.embeddingBatch.cache.hits, 9);
    assert.equal(results[2]!.analysis.embeddingBatch.framesEmbedded, 0);
    assert.deepEqual(results[0]!.fingerprint.shots, results[2]!.fingerprint.shots);
    assert.equal(results[0]!.fingerprint.fingerprintId, results[2]!.fingerprint.fingerprintId);
    const output = JSON.parse(await command(process.execPath, ["--import", pathToFileURL(join(PROJECT_ROOT, "scripts/no-network.mjs")).href, join(PROJECT_ROOT, "dist/scripts/analyze-reference.js"), env.mediaPath, join(env.directory, "authorization.json"), "--stub", "--benchmark", join(env.directory, "benchmark.json")]));
    assert.equal(output.fingerprintValidation, "PASS"); assert.equal(output.syntheticEmbeddings, true); assert.equal(output.shots, 3);
    const evaluation = JSON.parse(await readFile(join(PROJECT_ROOT, output.artifacts, "evaluation.json"), "utf8"));
    assert.equal(evaluation.benchmark.metrics.f1, 1);
    assert.deepEqual(evaluation.boundaryMetrics, evaluation.benchmark.metrics);
    assert.equal(evaluation.boundaryMetricsMissingReason, null);
    process.stdout.write(`Synthetic evidence: ${env.directory.substring(PROJECT_ROOT.length)}; Content/Adaptive F1=1 at +/-1 frame; repeat cache hits=9/9.\n`);
  } finally { await worker.close(); }
});

test("phone rotation and VFR timestamps survive the real Python/TypeScript boundary", { timeout: 120000 }, async () => {
  const env = await environment(); const worker = new PythonWorker();
  try {
    const rotated = join(env.directory, "rotated.mov");
    await command(localPaths.ffmpeg, ["-loglevel", "error", "-nostdin", "-y", "-display_rotation:v:0", "90", "-i", env.mediaPath, "-c", "copy", rotated]);
    const media = new LocalReferenceMedia(worker, rotated, join(env.directory, "rotated-frames"));
    const result = await media.metadata();
    assert.equal(result.value.width, 160); assert.equal(result.value.height, 90);
    const samples = selectSamples(timelineFromCuts("asset_rotated", result.value, []), result.value);
    await media.sample(samples);
    const png = await readFile(join(env.directory, "rotated-frames", `${samples[0]!.sampleId}.png`));
    assert.equal(png.readUInt32BE(16), 512); assert.equal(png.readUInt32BE(20), 288);
    const vfrPath = join(env.directory, "variable.mp4");
    await command(localPaths.ffmpeg, ["-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc2=s=90x160:r=10:d=2", "-vf", "setpts=if(lt(N\\,10)\\,N/(10*TB)\\,1/TB+(N-10)/(5*TB))", "-fps_mode", "vfr", "-c:v", "libx264", "-threads", "1", vfrPath]);
    const vfr = new LocalReferenceMedia(worker, vfrPath);
    const data = await vfr.metadata(); assert.equal(data.value.variableFrameRate, true);
    const detected = await vfr.detect(data.value, DEFAULT_DETECTOR);
    const chosen = selectSamples(timelineFromCuts("asset_vfr", data.value, detected.cuts), data.value);
    assert.ok(chosen.every((sample) => sample.atSeconds === data.value.frameTimes[sample.frameIndex]));
  } finally { await worker.close(); }
});

test("corrupt, missing and unsupported files fail explicitly without path disclosure", { timeout: 60000 }, async () => {
  const directory = join(PROJECT_ROOT, ".test-artifacts", `corrupt-${randomUUID()}`); await mkdir(directory, { recursive: true });
  await assert.rejects(authorizedLocalPath(join(directory, "missing.mp4")), (error: unknown) => error instanceof ReferenceAnalysisError && error.code === "MEDIA_UNREADABLE");
  await assert.rejects(authorizedLocalPath("\\\\example.invalid\\share\\video.mp4"), (error: unknown) => error instanceof ReferenceAnalysisError && error.code === "MEDIA_UNREADABLE");
  const worker = new PythonWorker();
  try {
    for (const extension of ["mp4", "txt"]) {
      const filename = join(directory, `private-${extension}.${extension}`); await writeFile(filename, "This is corrupt synthetic media.");
      const media = new LocalReferenceMedia(worker, filename);
      await assert.rejects(media.metadata(), (error: unknown) => error instanceof ReferenceAnalysisError && ["METADATA_EXTRACTION_FAILED", "MEDIA_UNSUPPORTED"].includes(error.code) && !error.message.includes(filename));
    }
  } finally { await worker.close(); }
});

test("fast vertical cuts remain detectable with the explicit two-frame minimum", { timeout: 60000 }, async () => {
  const directory = join(PROJECT_ROOT, ".test-artifacts", `fast-${randomUUID()}`); await mkdir(directory, { recursive: true });
  const filename = join(directory, "fast.mp4");
  await command(localPaths.ffmpeg, ["-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=black:s=90x160:r=30:d=0.2", "-f", "lavfi", "-i", "color=c=white:s=90x160:r=30:d=0.2", "-f", "lavfi", "-i", "color=c=black:s=90x160:r=30:d=0.2", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]", "-map", "[out]", "-c:v", "libx264", "-threads", "1", filename]);
  const worker = new PythonWorker();
  try {
    const media = new LocalReferenceMedia(worker, filename); const metadata = (await media.metadata()).value;
    for (const kind of ["content", "adaptive"] as const) {
      const cuts = await media.detect(metadata, { ...DEFAULT_DETECTOR, kind });
      const shots = timelineFromCuts("asset_fast", metadata, cuts.cuts);
      assert.equal(boundaryMetrics(shots.slice(1).map((shot) => shot.startSeconds), [0.2, 0.4], 1 / 30).f1, 1);
      assert.equal(selectSamples(shots, metadata).length, 3);
    }
  } finally { await worker.close(); }
});
