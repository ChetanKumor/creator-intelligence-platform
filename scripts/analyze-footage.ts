import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_FOOTAGE_CONFIG, FootageConfigSchema, FootageManifestSchema } from "../packages/footage-analyzer/protocol.js";
import { analyzeFootage, FootageAnalysisError } from "../packages/footage-analyzer/index.js";
import { evaluateFootage } from "../packages/evaluation/footage.js";
import { STUB_EMBEDDING } from "../packages/reference-analyzer/protocol.js";
import { PROJECT_ROOT } from "./reference-local.js";
import { LocalFootageServices, readFootageJson, writeFootageJson } from "./footage-local.js";

const args = process.argv.slice(2), manifestPath = args.shift(), jobId = `footage_${randomUUID()}`, directory = join(PROJECT_ROOT, ".local-runs", jobId);
let services: LocalFootageServices | undefined;
try {
  if (manifestPath === undefined) throw new FootageAnalysisError("authorization", "USAGE_ANALYZE_FOOTAGE_MANIFEST");
  let stub = false, configPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--stub" && !stub) stub = true;
    else if (args[i] === "--config" && configPath === undefined && args[i + 1] !== undefined) configPath = args[++i];
    else throw new FootageAnalysisError("authorization", "CONFIGURATION_INVALID");
  }
  const manifest = FootageManifestSchema.parse(await readFootageJson(manifestPath, 256 * 1024));
  let config = configPath === undefined ? DEFAULT_FOOTAGE_CONFIG : FootageConfigSchema.parse(await readFootageJson(configPath, 65536));
  if (stub) config = { ...config, embedding: STUB_EMBEDDING };
  services = new LocalFootageServices(manifestPath, join(directory, "capacity.json"));
  const result = await analyzeFootage(manifest, config, jobId, services), evaluation = evaluateFootage(result);
  for (const analysis of result.analyses) await writeFootageJson(join(directory, "assets", `${analysis.analysisId}.json`), analysis);
  await writeFootageJson(join(directory, "FootageInventory.json"), result.inventory);
  await writeFootageJson(join(directory, "evaluation.json"), evaluation);
  await writeFootageJson(join(directory, "run.json"), { jobId, status: result.inventory.failures.length ? result.analyses.length ? "partial" : "failed" : "succeeded", modelRuns: services.telemetry.modelRuns(), events: services.telemetry.snapshot(), timings: result.timings, cache: result.cacheStats, configuration: config });
  await writeFootageJson(join(directory, "ClipSegments.json"), result.segments);
  process.stdout.write(JSON.stringify({ assetsAnalyzed: result.analyses.length, assetsFailed: result.inventory.failures.length, duplicateAssets: result.inventory.duplicateAssets.length, sourceDurationSeconds: result.inventory.totalSourceDurationSeconds,
    sourceShots: result.inventory.assets.reduce((n, a) => n + a.sourceShots, 0), cheapFramesAnalyzed: evaluation.cheapFramesAnalyzed, semanticSamplesRequested: evaluation.semanticSamplesRequested, semanticSamplesSelected: evaluation.semanticSamplesSelected,
    semanticSamplesEmbedded: evaluation.semanticSamplesEmbedded, semanticFramesEmbedded: evaluation.semanticFramesEmbedded, frameCacheHits: evaluation.frameCacheHits, frameCacheMisses: evaluation.frameCacheMisses,
    candidatesBeforeDeduplication: evaluation.candidatesBeforeDeduplication, candidatesAfterDeduplication: evaluation.candidatesAfterDeduplication, validatedClipSegments: evaluation.validatedClipSegments, runtimeMilliseconds: result.runtimeMilliseconds,
    failures: result.inventory.failures.map((f) => ({ entryId: f.entryId, stage: f.stage, code: f.code })), artifacts: `.local-runs/${jobId}` }) + "\n");
  if (result.inventory.failures.length) process.exitCode = 1;
} catch (error) {
  const failure = error instanceof FootageAnalysisError ? error : new FootageAnalysisError("authorization", "FOOTAGE_INPUT_OR_ARTIFACT_INVALID");
  const diagnostic = { stage: failure.stage, code: failure.code, diagnostic: failure.message };
  try { await writeFootageJson(join(directory, "run.json"), { jobId, status: "failed", error: diagnostic, modelRuns: services?.telemetry.modelRuns() ?? [], events: services?.telemetry.snapshot() ?? [] }); } catch { /* Report a sanitized error even when the output directory is unavailable. */ }
  process.stderr.write(JSON.stringify({ ...diagnostic, artifacts: `.local-runs/${jobId}` }) + "\n"); process.exitCode = 1;
} finally { await services?.close(); }
