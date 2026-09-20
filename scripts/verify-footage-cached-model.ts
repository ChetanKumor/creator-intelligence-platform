// Explicit local evidence check; never loads a model and is excluded from normal tests.
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ReferenceFingerprintV11Schema } from "../packages/contracts/reference-v11.js";
import { AuthorizationManifestSchema, EmbeddingConfigSchema, MetadataSchema, MeasurementSchema, SampleSchema } from "../packages/reference-analyzer/protocol.js";
import { contentId, hashAsset, timelineFromCuts } from "../packages/reference-analyzer/features.js";
import { EmbeddingVectorCache, embeddingCacheKey } from "../packages/reference-analyzer/embeddings.js";
import { assertCompatibleEmbeddingSpaces } from "../packages/validation/index.js";
import { buildFrameFeatureBank } from "../packages/footage-analyzer/frame-bank.js";
import { CandidateSegmentProposer } from "../packages/footage-analyzer/candidates.js";
import { CandidateFeatureAggregator, ClipSegmentBuilder } from "../packages/footage-analyzer/aggregation.js";
import { CheapEvidenceSchema, DEFAULT_FOOTAGE_CONFIG, MEASUREMENT_VERSION } from "../packages/footage-analyzer/protocol.js";
import { FileArtifactCache, localBytes, localPaths, localClock, PROJECT_ROOT } from "./reference-local.js";
import { installedEmbeddingDimensions, readFootageJson, writeFootageJson } from "./footage-local.js";

const runDirectory = process.argv[2];
if (!runDirectory) throw new Error("Usage: verify-footage-cached-model.js <authorized-Phase1-run-directory>");
const source = z.object({ authorization: AuthorizationManifestSchema, config: z.object({ embedding: EmbeddingConfigSchema }), identity: z.object({ assetId: z.string(), contentHash: z.string() }), metadata: MetadataSchema, samples: z.array(SampleSchema), measurements: z.array(MeasurementSchema) }).parse(await readFootageJson(join(runDirectory, "analysis.json"), 16 * 1024 * 1024));
assert.equal(source.authorization.sourceType, "synthetic"); assert.equal(source.config.embedding.mode, "siglip");
const fingerprint = ReferenceFingerprintV11Schema.parse(await readFootageJson(join(runDirectory, "ReferenceFingerprint.json"), 16 * 1024 * 1024));
const baseline = fingerprint.shots[0]!.semanticEmbedding!;
const dimensions = await installedEmbeddingDimensions(source.config.embedding);
assert.equal(dimensions, baseline.dimensions);
await mkdir(join(PROJECT_ROOT, ".test-artifacts/phase2"), { recursive: true });
const directory = await mkdtemp(join(PROJECT_ROOT, ".test-artifacts/phase2/cached-model-"));
const oldCache = new EmbeddingVectorCache(new FileArtifactCache()), cache = new FileArtifactCache(join(directory, "cache")), newCache = new EmbeddingVectorCache(cache);
const cheap = [];
for (const sample of source.samples) {
  const vector = await oldCache.read(embeddingCacheKey(source.identity.contentHash, [sample.sampleId], source.config.embedding, "frame"));
  assert.ok(vector); assert.equal(vector.length, dimensions);
  const frameContentHash = (await hashAsset(localBytes(join(localPaths.frames, `${sample.sampleId}.png`)))).contentHash;
  const measurement = source.measurements.find((m) => m.sampleId === sample.sampleId)!;
  cheap.push(CheapEvidenceSchema.parse({ sample, measurement, frameContentHash, measurementId: contentId("measurement", [sample, measurement, frameContentHash, MEASUREMENT_VERSION]) }));
  const canonicalId = contentId("sample", ["decoded-png-v1", frameContentHash]);
  await newCache.write(embeddingCacheKey(source.identity.contentHash, [canonicalId], source.config.embedding, "frame"), vector);
}
let providerCalls = 0;
const bank = await buildFrameFeatureBank(source.identity.contentHash, cheap, source.samples.map((s) => ({ sampleId: s.sampleId, selectionReasons: ["source_shot"], noveltyScore: 0 })), source.config.embedding,
  { async embed() { providerCalls++; throw new Error("Cached compatibility verification must never invoke a provider."); } }, cache, dimensions);
assert.equal(providerCalls, 0); assert.equal(bank.framesEmbedded, 0); assertCompatibleEmbeddingSpaces(baseline, bank.space);
const cuts = fingerprint.shots.slice(1).map((s) => source.metadata.frameTimes.indexOf(s.sourceRange.startSeconds));
const shots = timelineFromCuts(source.identity.assetId, source.metadata, cuts);
const proposal = new CandidateSegmentProposer().propose(source.identity.assetId, shots, cheap, DEFAULT_FOOTAGE_CONFIG.proposal, 256);
const aggregate = await new CandidateFeatureAggregator(cache).aggregate(proposal.candidates, cheap, bank, source.identity.contentHash, source.config.embedding);
const clips = aggregate.values.map((e) => new ClipSegmentBuilder().build(e, source.metadata.durationSeconds, [], localClock.now()));
for (const clip of clips) assertCompatibleEmbeddingSpaces(baseline, clip.semanticEmbedding!);
const report = { status: "PASS", evidence: "Existing real Phase 1 vectors reused through the Phase 2 frame bank and candidate aggregator; no fresh model inference.", cachedSourceFramesValidated: cheap.length,
  uniqueSemanticFrames: bank.uniqueFrames, providerCalls, framesEmbedded: bank.framesEmbedded, candidates: clips.length, dimensions, spaceId: bank.space.spaceId, freshRealModelVerified: false };
await writeFootageJson(join(directory, "ClipSegments.json"), clips);
await writeFootageJson(join(PROJECT_ROOT, ".test-artifacts/phase2/cached-model-verification.json"), report);
process.stdout.write(JSON.stringify(report) + "\n");
