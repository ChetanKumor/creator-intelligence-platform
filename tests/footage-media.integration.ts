import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import { FootageAnalysisSchema, FootageAuthorizationSchema, FootageInventorySchema } from "../packages/footage-analyzer/protocol.js";
import { ClipSegmentSchema } from "../packages/contracts/index.js";
import { boundaryMetrics } from "../packages/evaluation/reference.js";
import { evaluateFootage, temporalRegionCoverage } from "../packages/evaluation/footage.js";
import { LocalFootageServices } from "../scripts/footage-local.js";
import { PROJECT_ROOT, atomicJson } from "../scripts/reference-local.js";
import { stubConfig } from "./support/footage.js";
import { createFootageMedia, mediaCommand } from "./support/footage-media.js";

test("real synthetic footage: scene boundaries, long adaptive coverage, quality, VFR, byte deduplication, failure isolation and full cache reuse", { timeout: 300000 }, async () => {
  const env = await createFootageMedia(true), config = stubConfig();
  const services = new LocalFootageServices(env.manifestPath, join(env.directory, "capacity.json"), join(env.directory, "frames"), join(env.directory, "cache"));
  try {
    const first = await analyzeFootage(env.manifest, config, "job_media_first", services);
    assert.deepEqual(first.inventory.failures.map((f) => f.code).sort(), ["MEDIA_UNSUPPORTED", "METADATA_EXTRACTION_FAILED"]);
    assert.equal(first.analyses.length, 5); assert.equal(first.inventory.duplicateAssets.length, 1);
    assert.ok(first.inventory.failures.every((f) => !f.diagnostic.includes(env.directory)));
    const asset = (name: string) => first.analyses.find((a) => a.contentHash === FootageAuthorizationSchema.parse(env.manifest.assets.find((e) => e.path === name)!.authorization).contentHash)!;
    const primary = asset(env.primary), long = asset("long-static.mp4"), short = asset("single-frame.mp4"), moving = asset("moving-blurred.mp4"), variable = asset("variable.mp4");
    assert.equal(primary.metadata.width, 90); assert.equal(primary.metadata.height, 160);
    const boundaries = boundaryMetrics(primary.shots.slice(1).map((s) => s.startSeconds), [1, 2], 0.1);
    assert.equal(boundaries.f1, 1); assert.equal(boundaries.meanAbsoluteTimingErrorSeconds, 0);
    assert.equal(long.shots.length, 1); assert.equal(long.inventory.cheapFramesAnalyzed, 480); assert.equal(long.inventory.reducedCheapResolution, true);
    assert.ok(long.inventory.coverageAfter.temporalCoverage > 0.999999); assert.ok(long.inventory.candidatesAfterDeduplication <= 64);
    assert.ok(long.inventory.semanticSamplesSelected < 32); assert.equal(long.inventory.uniqueSemanticFrames, 1); assert.equal(long.inventory.semanticSamplesEmbedded, 1);
    assert.ok(long.cheapFeatures.every((f) => f.measurement.darkPixelFraction > 0.99));
    assert.equal(short.cheapFeatures.length, 1); assert.equal(short.candidates.length, 1); assert.equal(short.candidates[0]!.signals.opticalFlowPixelsPerSecond, null);
    assert.equal(variable.metadata.variableFrameRate, true); assert.ok(variable.cheapFeatures.every((f) => variable.metadata.frameTimes[f.sample.frameIndex] === f.sample.atSeconds));
    const meanSharpness = (start: number, end: number) => { const values = moving.cheapFeatures.filter((f) => f.sample.atSeconds >= start && f.sample.atSeconds < end); return values.reduce((n, f) => n + f.measurement.laplacianVariance, 0) / values.length; };
    assert.ok(meanSharpness(0, 2) > meanSharpness(2, 4) * 3);
    assert.ok(moving.cheapFeatures.some((f) => (f.measurement.opticalFlowMeanPixels ?? 0) > 0.01));
    const regions = primary.shots.map((s) => ({ startSeconds: s.startSeconds, endSeconds: s.endSeconds }));
    const coverage = temporalRegionCoverage(primary.candidates.filter((c) => primary.keptCandidateIds.includes(c.candidate.candidateId)).map((c) => c.candidate), regions);
    assert.equal(coverage.coverage, 1);
    for (const analysis of first.analyses) { FootageAnalysisSchema.parse(analysis); assert.equal(analysis.inventory.coverageBefore.coveredSeconds, analysis.inventory.coverageAfter.coveredSeconds); await atomicJson(join(env.directory, `${analysis.analysisId}.json`), analysis); }
    assert.ok(first.segments.every((s) => ClipSegmentSchema.safeParse(s).success));
    assert.equal(JSON.stringify(first.segments).includes('"vector"'), false);
    assert.ok(services.telemetry.snapshot().every((e) => e.scope.environment === "synthetic"));
    const repeat = await analyzeFootage(env.manifest, config, "job_media_repeat", services);
    assert.equal(repeat.analyses.length, 5); assert.ok(repeat.cacheStats.every((c) => c.cheapCacheHit && c.cheapFramesDecoded === 0 && c.frameMisses === 0 && c.semanticFramesEmbedded === 0 && c.aggregateMisses === 0));
    assert.deepEqual(first.segments.map((s) => s.segmentId), repeat.segments.map((s) => s.segmentId));
    // Persisted PNG corruption must invalidate cheap evidence, while unchanged pixels still reuse embeddings.
    const frame = primary.cheapFeatures[0]!;
    await writeFile(join(env.directory, "frames", `${frame.sample.sampleId}.png`), "corrupt cached PNG");
    const one = { ...env.manifest, assets: [env.manifest.assets[0]!] };
    const repaired = await analyzeFootage(one, config, "job_media_repair", services);
    assert.equal(repaired.analyses.length, 1); assert.equal(repaired.cacheStats[0]!.cheapCacheHit, false); assert.equal(repaired.cacheStats[0]!.semanticFramesEmbedded, 0);
    const receipt = { fixture: env.directory.slice(PROJECT_ROOT.length), first: evaluateFootage(first), repeat: evaluateFootage(repeat), cache: first.cacheStats, repeatCache: repeat.cacheStats, boundaries, labeledRegionCoverage: coverage,
      longTake: long.inventory, movingSharpnessBefore: meanSharpness(0, 2), movingSharpnessAfter: meanSharpness(2, 4), allSynthetic: true, realModel: false };
    await atomicJson(join(PROJECT_ROOT, ".test-artifacts/phase2/media-verification.json"), receipt);
    process.stdout.write(`Footage synthetic evidence: assets=5, duplicates=1, isolated failures=2, boundary F1=1, labeled coverage=1, repeat embedding operations=0; ${env.directory.slice(PROJECT_ROOT.length)}\n`);
  } finally { await services.close(); }
});

test("offline footage CLI writes validated sidecars and segments, with explicit partial success", { timeout: 180000 }, async () => {
  const env = await createFootageMedia();
  const broken = { ...env.manifest.assets[0]!, entryId: "entry_missing", path: "missing.mp4" };
  await atomicJson(env.manifestPath, { ...env.manifest, assets: [broken, ...env.manifest.assets] });
  const args = ["--import", pathToFileURL(join(PROJECT_ROOT, "scripts/no-network.mjs")).href, join(PROJECT_ROOT, "dist/scripts/analyze-footage.js"), env.manifestPath, "--stub"];
  const first = await mediaCommand(process.execPath, args, true), printed = JSON.parse(first.stdout);
  assert.equal(first.exitCode, 1); assert.equal(printed.assetsAnalyzed, 1); assert.equal(printed.assetsFailed, 1);
  const output = join(PROJECT_ROOT, printed.artifacts), inventory = FootageInventorySchema.parse(JSON.parse(await readFile(join(output, "FootageInventory.json"), "utf8")));
  const segments: unknown[] = JSON.parse(await readFile(join(output, "ClipSegments.json"), "utf8"));
  assert.equal(segments.length, inventory.candidateCount); assert.ok(segments.every((s) => ClipSegmentSchema.safeParse(s).success));
  const sidecar = FootageAnalysisSchema.parse(JSON.parse(await readFile(join(output, "assets", `${inventory.assets[0]!.analysisId}.json`), "utf8")));
  assert.ok(sidecar.candidates.length > sidecar.shots.length);
  const run = JSON.parse(await readFile(join(output, "run.json"), "utf8")); assert.equal(run.status, "partial");
  const repeat = JSON.parse((await mediaCommand(process.execPath, args, true)).stdout);
  assert.equal(repeat.semanticFramesEmbedded, 0); assert.equal(repeat.frameCacheMisses, 0);
  await atomicJson(join(PROJECT_ROOT, ".test-artifacts/phase2/cli-verification.json"), { first: printed, repeat, partialSuccessExitCode: first.exitCode });
});
