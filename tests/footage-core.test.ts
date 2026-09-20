import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { ClipSegmentSchema } from "../packages/contracts/index.js";
import { aggregateEmbeddings, contentId, timelineFromCuts } from "../packages/reference-analyzer/features.js";
import { embeddingReference, embeddingSpaceId } from "../packages/reference-analyzer/embeddings.js";
import { siglipConfiguration } from "../packages/reference-analyzer/models.js";
import { assertCompatibleEmbeddingSpaces } from "../packages/validation/index.js";
import { selectCheapLattice, selectSemanticLattice } from "../packages/footage-analyzer/lattice.js";
import { buildFrameFeatureBank } from "../packages/footage-analyzer/frame-bank.js";
import { CandidateSegmentProposer, candidateCoverage } from "../packages/footage-analyzer/candidates.js";
import { CandidateFeatureAggregator, ClipSegmentBuilder, pruneCandidates } from "../packages/footage-analyzer/aggregation.js";
import { DEFAULT_FOOTAGE_CONFIG, FootageAnalysisSchema, FootageAuthorizationSchema, FootageConfigSchema, FootageInventorySchema } from "../packages/footage-analyzer/protocol.js";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import { evaluateFootage, temporalRegionCoverage } from "../packages/evaluation/footage.js";
import { InMemoryTelemetry } from "../packages/telemetry/index.js";
import { cheapEvidence, CountingBackend, FOOTAGE_TIME, footageEnvironment, footageMetadata, MemoryCache, stubConfig } from "./support/footage.js";

function lattices(duration = 30, changing = true) {
  const metadata = footageMetadata(duration), config = stubConfig(), shots = timelineFromCuts("asset_test", metadata, []);
  const cheap = selectCheapLattice("asset_test", shots, metadata, config.cheap), features = cheapEvidence(cheap.samples, changing);
  return { metadata, config, shots, cheap, features, semantic: selectSemanticLattice(shots, features, config.semantic) };
}
test("cheap and event-driven semantic lattices are separate; static footage selects fewer frames", () => {
  const moving = lattices(), still = lattices(30, false);
  assert.equal(moving.cheap.samples.length, 120);
  assert.ok(still.semantic.semanticSamplesSelected < moving.semantic.semanticSamplesSelected);
  assert.ok(moving.semantic.semanticSamplesSelected <= 32);
  assert.ok(moving.semantic.selection.some((s) => s.selectionReasons.includes("visual_change")));
  assert.ok(still.semantic.selection.every((s) => !s.selectionReasons.includes("visual_change")));
  assert.deepEqual(moving.semantic, selectSemanticLattice(moving.shots, moving.features, moving.config.semantic));
});
test("long footage reduces cheap and semantic resolution without exceeding budgets or losing source shots", () => {
  const env = lattices(600);
  assert.equal(env.cheap.samples.length, 480); assert.equal(env.cheap.reducedResolution, true);
  assert.equal(env.semantic.semanticSamplesSelected, 32); assert.equal(env.semantic.reducedCoverage, true);
  assert.ok(env.semantic.semanticSamplesRequested > 32);
  assert.ok(env.cheap.samples[0]!.atSeconds < 2 && env.cheap.samples.at(-1)!.atSeconds > 598);
  const shots = timelineFromCuts("asset_test", env.metadata, [1000, 2000, 3000, 4000, 5000]);
  const cheap = selectCheapLattice("asset_test", shots, env.metadata, env.config.cheap);
  const selection = selectSemanticLattice(shots, cheapEvidence(cheap.samples), env.config.semantic);
  assert.equal(new Set(selection.selection.map((s) => cheap.samples.find((f) => f.sampleId === s.sampleId)!.shotId)).size, 6);
  assert.throws(() => selectSemanticLattice(shots, cheapEvidence(cheap.samples), { ...env.config.semantic, maximumFrames: 5 }), /MINIMUM_COVERAGE/);
  const long = lattices(150, false);
  const proposed = new CandidateSegmentProposer().propose("asset_test", long.shots, long.features, long.config.proposal, 256);
  assert.equal(proposed.candidates.length, 64); assert.ok(proposed.coverage.temporalCoverage > 0.999999);
  assert.equal(new Set(proposed.candidates.map((c) => Math.round((c.sourceRange.endSeconds - c.sourceRange.startSeconds) * 10))).size, 4);
});
test("very short, single-frame and VFR sources use actual timestamps and truthful unknown motion", async () => {
  const metadata = { ...footageMetadata(0.1), frameCount: 1, frameTimes: [0] };
  const shots = timelineFromCuts("asset_short", metadata, []), config = stubConfig(), cheap = selectCheapLattice("asset_short", shots, metadata, config.cheap);
  assert.equal(cheap.samples.length, 1);
  const features = cheapEvidence(cheap.samples), selection = selectSemanticLattice(shots, features, config.semantic);
  const bank = await buildFrameFeatureBank("a".repeat(64), features, selection.selection, config.embedding, new CountingBackend(), new MemoryCache(), 8);
  const proposal = new CandidateSegmentProposer().propose("asset_short", shots, features, config.proposal, 256);
  const aggregate = await new CandidateFeatureAggregator(new MemoryCache()).aggregate(proposal.candidates, features, bank, "a".repeat(64), config.embedding);
  assert.equal(proposal.candidates.length, 1); assert.equal(aggregate.values[0]!.signals.stabilityIndicator, null);
  const clip = new ClipSegmentBuilder().build(aggregate.values[0]!, 0.1, [], FOOTAGE_TIME);
  assert.ok(ClipSegmentSchema.safeParse(clip).success); assert.deepEqual(clip.poseTags, ["unknown"]);
  const vfr = { ...footageMetadata(1), frameTimes: [0, 0.07, 0.19, 0.6, 0.95], frameCount: 5, variableFrameRate: true };
  const selected = selectCheapLattice("asset_vfr", timelineFromCuts("asset_vfr", vfr, []), vfr, config.cheap);
  assert.ok(selected.samples.every((s) => s.atSeconds === vfr.frameTimes[s.frameIndex]));
});
test("18 unique semantic frames supply 200 overlapping candidates with exactly 18 frame embedding operations", async () => {
  const env = lattices(), samples = Array.from({ length: 18 }, (_, i) => ({ sampleId: contentId("sample", i), shotId: env.shots[0]!.shotId, frameIndex: i * 10, atSeconds: (i + 0.5) * 30 / 18 }));
  const features = cheapEvidence(samples, true), backend = new CountingBackend(), cache = new MemoryCache();
  const selection = samples.map((s) => ({ sampleId: s.sampleId, selectionReasons: ["temporal_coverage" as const], noveltyScore: 0 }));
  const bank = await buildFrameFeatureBank("a".repeat(64), features, selection, env.config.embedding, backend, cache, 8);
  const config = { ...env.config.proposal, maximumPerShot: 200 };
  const proposed = new CandidateSegmentProposer().propose("asset_test", env.shots, features, config, 200);
  assert.equal(proposed.candidates.length, 200);
  const aggregated = await new CandidateFeatureAggregator(cache).aggregate(proposed.candidates, features, bank, "a".repeat(64), env.config.embedding);
  assert.equal(aggregated.values.length, 200); assert.equal(backend.frames, 18); assert.equal(backend.calls, 1);
  for (const item of aggregated.values) {
    const expected = aggregateEmbeddings(item.contributingSemanticFrameIds.map((id) => bank.vectors.get(id)!));
    assert.deepEqual(aggregated.vectors.get(item.candidate.candidateId), expected);
  }
  const second = await buildFrameFeatureBank("a".repeat(64), features, selection, env.config.embedding, backend, cache, 8);
  assert.equal(second.framesEmbedded, 0); assert.equal(second.cache.hits, 18); assert.equal(backend.frames, 18);
  await mkdir(".test-artifacts/phase2", { recursive: true });
  await writeFile(".test-artifacts/phase2/inference-invariant.json", JSON.stringify({ uniqueSemanticFrames: 18, overlappingCandidates: 200, frameEmbeddingOperations: backend.frames, backendBatchCalls: backend.calls, repeatFrameCacheHits: second.cache.hits, aggregationInvokedProvider: false }, null, 2) + "\n");
});
test("identical decoded frames share embeddings while retaining every temporal sample identity", async () => {
  const env = lattices(30, false), backend = new CountingBackend();
  const bank = await buildFrameFeatureBank("a".repeat(64), env.features, env.semantic.selection, env.config.embedding, backend, new MemoryCache(), 8);
  assert.ok(bank.frames.length > 1); assert.equal(backend.frames, 1); assert.equal(bank.uniqueFrames, 1);
  assert.equal(new Set(bank.frames.map((f) => f.sampleId)).size, bank.frames.length);
  assert.equal(new Set(bank.frames.map((f) => f.embedding.objectId)).size, 1);
});
test("candidate proposal has deterministic IDs, configurable hard ceilings and no reference input", () => {
  const env = lattices(), proposer = new CandidateSegmentProposer();
  const a = proposer.propose("asset_test", env.shots, env.features, env.config.proposal, 256);
  assert.equal(a.candidates.length, 64); assert.equal(a.coverage.temporalCoverage, 1);
  assert.deepEqual(a, proposer.propose("asset_test", env.shots, env.features, env.config.proposal, 256));
  assert.equal(FootageConfigSchema.safeParse({ ...env.config, referenceFingerprint: {} }).success, false);
  const metadata = footageMetadata(300), shots = timelineFromCuts("asset_many", metadata, Array.from({ length: 9 }, (_, i) => (i + 1) * 300));
  const cheap = selectCheapLattice("asset_many", shots, metadata, env.config.cheap), features = cheapEvidence(cheap.samples, true);
  const many = proposer.propose("asset_many", shots, features, env.config.proposal, 256);
  assert.ok(many.candidates.length <= 256);
  assert.ok(shots.every((shot) => many.candidates.filter((c) => c.shotId === shot.shotId).length <= 64));
  const limited = proposer.propose("asset_many", shots, features, env.config.proposal, 17);
  assert.ok(limited.candidates.length <= 17);
  const regions = Array.from({ length: 10 }, (_, i) => ({ startSeconds: i * 3, endSeconds: i * 3 + 3 }));
  assert.equal(temporalRegionCoverage(a.candidates, regions, 0.5).coverage, 1);
});
test("pruning measures coverage first and preserves separated but semantically identical moments", async () => {
  const env = lattices(), backend = new CountingBackend(), cache = new MemoryCache();
  const bank = await buildFrameFeatureBank("a".repeat(64), env.features, env.semantic.selection, env.config.embedding, backend, cache, 8);
  const proposed = new CandidateSegmentProposer().propose("asset_test", env.shots, env.features, { ...env.config.proposal, maximumPerShot: 200 }, 200);
  const middle = proposed.candidates.find((c) => c.sourceRange.startSeconds > 5 && Math.abs(c.sourceRange.endSeconds - c.sourceRange.startSeconds - 3) < 1e-6)!;
  const nearDuplicate = { ...middle, candidateId: contentId("segment", "near-duplicate"), sourceRange: { startSeconds: middle.sourceRange.startSeconds + 0.01, endSeconds: middle.sourceRange.endSeconds + 0.01 } };
  const aggregated = await new CandidateFeatureAggregator(cache).aggregate([...proposed.candidates, nearDuplicate], env.features, bank, "a".repeat(64), env.config.embedding);
  const pruned = pruneCandidates(aggregated.values, aggregated.vectors, env.shots, env.config.deduplication);
  assert.ok(pruned.pruned.length > 0);
  assert.deepEqual(pruned.coverageBefore, proposed.coverage); assert.deepEqual(pruned.coverageAfter, proposed.coverage);
  const first = aggregated.values.find((v) => v.candidate.sourceRange.startSeconds === 0)!, last = aggregated.values.find((v) => v.candidate.sourceRange.startSeconds > 25)!;
  assert.equal(pruneCandidates([first, last], aggregated.vectors, env.shots, env.config.deduplication).kept.length, 2);
  assert.equal(candidateCoverage(pruned.kept.map((v) => v.candidate), env.shots, 30).temporalCoverage, 1);
});
test("cache invalidation binds pixels and model configuration; wrong observed dimensions fail before writes", async () => {
  const env = lattices(), cache = new MemoryCache(), backend = new CountingBackend();
  await assert.rejects(buildFrameFeatureBank("a".repeat(64), env.features, env.semantic.selection, env.config.embedding, backend, cache, 9), /dimensions/);
  assert.equal(cache.values.size, 0);
  await buildFrameFeatureBank("a".repeat(64), env.features, env.semantic.selection, env.config.embedding, backend, cache, 8);
  const after = backend.frames;
  await buildFrameFeatureBank("a".repeat(64), env.features, env.semantic.selection, { ...env.config.embedding, maxPatches: 512 }, backend, cache, 8);
  assert.ok(backend.frames > after);
  const key = [...cache.values.keys()][0]!; cache.values.set(key, { corrupt: true });
  const repaired = await buildFrameFeatureBank("a".repeat(64), env.features, env.semantic.selection, env.config.embedding, backend, cache, 8);
  assert.equal(repaired.cache.corrupt, 1); assert.equal(repaired.framesEmbedded, 1);
});
test("the footprint uses the frozen Phase 1 embedding space and rejects incompatible comparisons", async () => {
  const fixture = JSON.parse(await readFile("tests/fixtures/phase1-embedding-space.json", "utf8"));
  const config = siglipConfiguration("so400m"), vector = Array.from({ length: fixture.reference.dimensions }, (_, i) => i === 0 ? 1 : 0);
  const reference = embeddingReference(contentId("cache", "space-test"), vector, config);
  assert.equal(reference.spaceId, fixture.reference.spaceId);
  assert.doesNotThrow(() => assertCompatibleEmbeddingSpaces(reference, fixture.reference));
  assert.notEqual(embeddingSpaceId({ ...config, revision: "a".repeat(40) }), reference.spaceId);
  assert.throws(() => assertCompatibleEmbeddingSpaces(reference, { ...reference, dimensions: 8 }), /immutable space/);
  assert.notEqual(embeddingSpaceId({ ...config, maxPatches: 512 }), reference.spaceId);
});
test("coherent multi-asset pipeline deduplicates bytes and isolates failures with complete telemetry", async () => {
  const env = await footageEnvironment(["good", "duplicate", "other", "corrupt"]);
  const result = await analyzeFootage(env.manifest, env.config, "job_footage", env.services);
  assert.equal(result.analyses.length, 2); assert.equal(result.inventory.duplicateAssets.length, 1); assert.equal(result.inventory.failures.length, 1);
  assert.equal(result.inventory.failures[0]!.stage, "metadata"); assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(env.metadataCalls(), 3);
  assert.ok(FootageInventorySchema.safeParse(result.inventory).success);
  for (const analysis of result.analyses) assert.ok(FootageAnalysisSchema.safeParse(analysis).success);
  assert.ok(result.segments.every((s) => ClipSegmentSchema.safeParse(s).success && s.semanticEmbedding !== null));
  assert.ok(env.telemetry.modelRuns().some((r) => r.status === "failed"));
  assert.equal(env.telemetry.snapshot().length, env.telemetry.modelRuns().length);
  assert.ok(env.telemetry.snapshot().every((event) => event.contractType === "CostEvent" && event.costInrMicros === 0));
  assert.equal(evaluateFootage(result).schemaValidClipSegmentRate, 1);
  assert.equal(result.inventory.referenceSpecificSufficiency, null);
});
test("candidate configuration changes reuse the same selected semantic embeddings through the full pipeline", async () => {
  const env = await footageEnvironment();
  const first = await analyzeFootage(env.manifest, env.config, "job_first", env.services), before = env.backend.frames;
  const config = { ...env.config, proposal: { ...env.config.proposal, maximumPerShot: 200 } };
  const second = await analyzeFootage(env.manifest, config, "job_second", { ...env.services, telemetry: new InMemoryTelemetry() });
  assert.ok(second.analyses[0]!.candidates.length > first.analyses[0]!.candidates.length);
  assert.equal(env.backend.frames, before); assert.equal(second.inventory.assets[0]!.semanticSamplesEmbedded, 0);
  assert.deepEqual(first.analyses[0]!.semanticFrames, second.analyses[0]!.semanticFrames);
  const repeat = await analyzeFootage(env.manifest, env.config, "job_repeat", { ...env.services, telemetry: new InMemoryTelemetry() });
  assert.deepEqual(first.segments.map((s) => s.segmentId), repeat.segments.map((s) => s.segmentId));
});
test("project candidate ceilings cannot be exceeded by multiple unique assets", async () => {
  const env = await footageEnvironment(Array.from({ length: 16 }, (_, i) => `asset${i}`), 3);
  const result = await analyzeFootage(env.manifest, { ...env.config, proposal: { ...env.config.proposal, maximumPerProject: 17 } }, "job_limits", env.services);
  assert.equal(result.inventory.failures.length, 0); assert.ok(result.segments.length <= 17); assert.equal(result.analyses.length, 16);
  assert.ok(result.inventory.assets.every((a) => a.candidatesBeforeDeduplication >= 1));
  assert.equal(DEFAULT_FOOTAGE_CONFIG.proposal.maximumPerProject, 1024);
});
test("authorization purpose, hash, owner scope and future dates are checked before decoding", async () => {
  for (const patch of [{ allowedPurposes: ["local_reference_analysis"] }, { contentHash: "a".repeat(64) }, { dateAdded: "2099-01-01T00:00:00.000Z" }, { projectId: "wrong" }, { sourceType: "owner_supplied", authorizationBasis: "owner_created" }]) {
    const env = await footageEnvironment();
    env.manifest.assets[0]!.authorization = { ...FootageAuthorizationSchema.parse(env.manifest.assets[0]!.authorization), ...patch };
    const result = await analyzeFootage(env.manifest, env.config, "job_auth", env.services);
    assert.equal(result.segments.length, 0); assert.equal(env.metadataCalls(), 0); assert.equal(env.backend.frames, 0); assert.equal(result.inventory.failures.length, 1);
  }
});
test("candidate evidence retains source, feature joins, versions and explicit context borrowing", async () => {
  const env = await footageEnvironment();
  env.config.semantic.coverageGapSeconds = 600; env.config.semantic.maximumFrames = 1;
  const result = await analyzeFootage(env.manifest, env.config, "job_lineage", env.services), analysis = result.analyses[0]!;
  assert.ok(analysis.candidates.some((c) => c.semanticSupport === "same_shot_context"));
  assert.equal(JSON.stringify(analysis).includes('"vector"'), false);
  for (const candidate of analysis.candidates) {
    assert.equal(candidate.candidate.assetId, analysis.assetId);
    assert.ok(candidate.contributingSemanticFrameIds.every((id) => analysis.semanticFrames.some((f) => f.sampleId === id)));
    assert.ok(candidate.contributingMeasurementIds.every((id) => analysis.cheapFeatures.some((f) => f.measurementId === id)));
    assert.equal(candidate.aggregationVersion, analysis.configuration.aggregationVersion);
    assert.ok(candidate.candidate.proposalConfigurationId.startsWith("proposal_"));
  }
  assert.ok(result.segments.every((s) => analysis.keptCandidateIds.includes(s.segmentId)));
});

test("persisted analysis rejects broken learning lineage and inconsistent inventory totals", async () => {
  const env = await footageEnvironment(), result = await analyzeFootage(env.manifest, env.config, "job_validate", env.services);
  const analysis = result.analyses[0]!;
  const mutations: ((value: typeof analysis) => void)[] = [
    (v) => { v.candidates[0]!.contributingSemanticFrameIds[0] = "missing_frame"; },
    (v) => { v.candidates[0]!.contributingMeasurementIds[0] = "missing_measurement"; },
    (v) => { v.cheapFeatures[0]!.measurement.brightnessMean = 0.01; },
    (v) => { v.semanticFrames[0]!.embedding.spaceId = "incompatible_space"; },
    (v) => { v.candidates[0]!.candidate.sourceRange.endSeconds = 300; },
    (v) => { v.keptCandidateIds.push(v.keptCandidateIds[0]!); },
    (v) => { v.configuration.semantic.maximumFrames = 1; },
    (v) => { v.inventory.candidatesAfterDeduplication++; },
  ];
  for (const mutate of mutations) { const changed = structuredClone(analysis); mutate(changed); assert.equal(FootageAnalysisSchema.safeParse(changed).success, false); }
  assert.equal(FootageInventorySchema.safeParse({ ...result.inventory, candidateCount: result.inventory.candidateCount + 1 }).success, false);
  assert.equal(FootageInventorySchema.safeParse({ ...result.inventory, totalSourceDurationSeconds: 0 }).success, false);
  assert.equal(analysis.embeddingImplementation.preprocessing, "rgb-square-pixels-512-v1");
});

test("media mutation and forged temporal measurements fail before expensive inference", async () => {
  for (const mutation of ["bytes", "measurements"] as const) {
    const env = await footageEnvironment();
    const services = { ...env.services, async open(...args: Parameters<typeof env.services.open>) {
      const opened = await env.services.open(...args);
      return { ...opened, media: { ...opened.media, async sampleFootage(samples: Parameters<typeof opened.media.sampleFootage>[0]) {
        const result = await opened.media.sampleFootage(samples);
        if (mutation === "bytes") env.contents.get("good")![0] = 0;
        else result.features[1]!.measurement.comparisonSampleId = "unknown_sample";
        return result;
      } } };
    } };
    const result = await analyzeFootage(env.manifest, env.config, `job_mutation_${mutation}`, services);
    assert.equal(result.analyses.length, 0); assert.equal(env.backend.frames, 0);
    assert.equal(result.inventory.failures[0]!.code, mutation === "bytes" ? "MEDIA_CHANGED_DURING_ANALYSIS" : "VISUAL_ANALYSIS_FAILED");
  }
});

test("the approved 1024 project ceiling holds when sixteen assets each request sixty-four candidates", async () => {
  const env = await footageEnvironment(Array.from({ length: 16 }, (_, i) => `large${i}`), 30);
  const result = await analyzeFootage(env.manifest, env.config, "job_default_limits", env.services);
  assert.equal(result.analyses.length, 16); assert.equal(result.inventory.failures.length, 0);
  assert.equal(result.inventory.assets.reduce((n, a) => n + a.candidatesBeforeDeduplication, 0), 1024);
  assert.ok(result.segments.length <= 1024);
  assert.ok(result.analyses.every((a) => a.candidates.length <= 256 && a.shots.every((s) => a.candidates.filter((c) => c.candidate.shotId === s.shotId).length <= 64)));
});
