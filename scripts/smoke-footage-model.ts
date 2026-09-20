// Explicit final gate only. A new cache guarantees this cannot pass on old embeddings.
import assert from "node:assert/strict";
import { join } from "node:path";
import { z } from "zod";
import { EmbeddingReferenceSchema } from "../packages/contracts/index.js";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import { DEFAULT_FOOTAGE_CONFIG } from "../packages/footage-analyzer/protocol.js";
import { evaluateFootage } from "../packages/evaluation/footage.js";
import { EmbeddingVectorCache } from "../packages/reference-analyzer/embeddings.js";
import { assertCompatibleEmbeddingSpaces } from "../packages/validation/index.js";
import { LocalFootageServices, readFootageJson, writeFootageJson } from "./footage-local.js";
import { PROJECT_ROOT } from "./reference-local.js";
import { createFootageMedia, mediaCommand } from "../tests/support/footage-media.js";

const preflight = z.object({ safeToLoad: z.boolean() }).passthrough().parse(JSON.parse((await mediaCommand(join(PROJECT_ROOT, ".venv/Scripts/python.exe"), ["-B", "scripts/check-footage-capacity.py"])).stdout));
const reportFile = join(PROJECT_ROOT, ".test-artifacts/phase2/real-model-verification.json");
if (!preflight.safeToLoad) {
  const report = { status: "PENDING ENVIRONMENT CAPACITY", freshInferenceAttempted: false, preflight };
  await writeFootageJson(reportFile, report); process.stdout.write(JSON.stringify(report) + "\n");
} else {
  const env = await createFootageMedia(), config = structuredClone(DEFAULT_FOOTAGE_CONFIG);
  config.semantic.maximumFrames = 4;
  const capacityFile = join(env.directory, "capacity.json"), services = new LocalFootageServices(env.manifestPath, capacityFile, join(env.directory, "frames"), join(env.directory, "fresh-cache"));
  try {
    const first = await analyzeFootage(env.manifest, config, "job_real_footage_first", services);
    if (first.inventory.failures.some((f) => f.code === "EMBEDDING_ENVIRONMENT_CAPACITY")) {
      const report = { status: "PENDING ENVIRONMENT CAPACITY", freshInferenceAttempted: true, failures: first.inventory.failures, memory: await readFootageJson(capacityFile, 65536) };
      await writeFootageJson(reportFile, report); process.stdout.write(JSON.stringify(report) + "\n");
    } else {
      assert.deepEqual(first.inventory.failures, []); assert.equal(first.analyses.length, 1);
      assert.ok(first.inventory.assets[0]!.semanticSamplesEmbedded > 0);
      const baseline = z.object({ reference: EmbeddingReferenceSchema }).parse(await readFootageJson(join(PROJECT_ROOT, "tests/fixtures/phase1-embedding-space.json"), 65536)).reference;
      const vectors = new EmbeddingVectorCache(services.cache);
      for (const frame of first.analyses[0]!.semanticFrames) {
        assertCompatibleEmbeddingSpaces(baseline, frame.embedding);
        const vector = await vectors.read(frame.embedding.objectId!); assert.ok(vector); assert.equal(vector.length, frame.embedding.dimensions);
      }
      for (const clip of first.segments) {
        assertCompatibleEmbeddingSpaces(baseline, clip.semanticEmbedding!);
        const vector = await vectors.read(clip.semanticEmbedding!.objectId!); assert.ok(vector); assert.equal(vector.length, baseline.dimensions);
      }
      const repeat = await analyzeFootage(env.manifest, config, "job_real_footage_repeat", services);
      assert.deepEqual(repeat.inventory.failures, []); assert.equal(repeat.inventory.assets[0]!.semanticSamplesEmbedded, 0);
      assert.deepEqual(first.segments.map((s) => s.segmentId), repeat.segments.map((s) => s.segmentId));
      const report = { status: "PASS", freshInferenceAttempted: true, offline: true, model: config.embedding, dimensions: first.inventory.assets[0]!.embeddingSpace.dimensions,
        first: evaluateFootage(first), repeat: evaluateFootage(repeat), memory: await readFootageJson(capacityFile, 65536), fixture: env.directory.slice(PROJECT_ROOT.length) };
      await writeFootageJson(join(env.directory, "ClipSegments.json"), first.segments);
      await writeFootageJson(join(env.directory, "FootageAnalysis.json"), first.analyses[0]);
      await writeFootageJson(join(env.directory, "FootageInventory.json"), first.inventory);
      await writeFootageJson(join(env.directory, "run.json"), { modelRuns: services.telemetry.modelRuns(), events: services.telemetry.snapshot(), firstCache: first.cacheStats, repeatCache: repeat.cacheStats, timings: first.timings });
      await writeFootageJson(reportFile, report); process.stdout.write(JSON.stringify(report) + "\n");
    }
  } catch (error) {
    await writeFootageJson(reportFile, { status: "FAILED", freshInferenceAttempted: true, diagnostic: error instanceof Error ? error.message.slice(0, 240) : "Smoke verification failed." });
    throw error;
  } finally { await services.close(); }
}
