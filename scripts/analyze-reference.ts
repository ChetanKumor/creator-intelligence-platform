import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { analyzeReference, ReferenceAnalysisError } from "../packages/reference-analyzer/index.js";
import { AuthorizationManifestSchema, DEFAULT_DETECTOR, STUB_EMBEDDING } from "../packages/reference-analyzer/protocol.js";
import { CachedReferenceEmbeddingProvider } from "../packages/reference-analyzer/embeddings.js";
import { siglipConfiguration } from "../packages/reference-analyzer/models.js";
import { InMemoryTelemetry } from "../packages/telemetry/index.js";
import { boundaryMetrics, verifyReferenceBenchmark } from "../packages/evaluation/reference.js";
import { atomicJson, authorizedLocalPath, FileArtifactCache, LocalReferenceMedia, localBytes, localClock, PROJECT_ROOT, PythonWorker, readLocalJson } from "./reference-local.js";

const args = process.argv.slice(2);
const mediaArgument = args.shift(), manifestArgument = args.shift();
const flags = new Map<string, string>();
let invalidOption = false;
for (let index = 0; index < args.length; index++) {
  const name = args[index]!;
  if (["--stub", "--cpu-fallback"].includes(name)) flags.set(name, "true");
  else if (["--detector", "--model", "--device", "--benchmark"].includes(name) && args[index + 1] !== undefined) flags.set(name, args[++index]!);
  else invalidOption = true;
}
const jobId = `reference_${randomUUID()}`;
const directory = join(PROJECT_ROOT, ".local-runs", jobId);
const telemetry = new InMemoryTelemetry();
let worker: PythonWorker | undefined;
try {
  if (invalidOption) throw new ReferenceAnalysisError("authorization", "CONFIGURATION_INVALID", "Unsupported or incomplete CLI option.");
  if (mediaArgument === undefined || manifestArgument === undefined) throw new ReferenceAnalysisError("authorization", "USAGE", "Usage: analyze-reference local-file authorization-manifest [--stub] [--detector content|adaptive] [--model base|so400m] [--device cpu|cuda] [--cpu-fallback] [--benchmark manifest]");
  let manifest: unknown;
  try { manifest = AuthorizationManifestSchema.parse(await readLocalJson(manifestArgument, 65536)); } catch { throw new ReferenceAnalysisError("authorization"); }
  const mediaPath = await authorizedLocalPath(mediaArgument);
  const detector = flags.get("--detector") ?? "content", model = flags.get("--model") ?? "base", device = flags.get("--device") ?? "cpu";
  if (!["content", "adaptive"].includes(detector) || !["base", "so400m"].includes(model) || !["cpu", "cuda"].includes(device)) throw new ReferenceAnalysisError("authorization", "CONFIGURATION_INVALID");
  const embedding = flags.has("--stub") ? STUB_EMBEDDING : siglipConfiguration(model as "base" | "so400m", device as "cpu" | "cuda", flags.has("--cpu-fallback"));
  worker = new PythonWorker();
  const media = new LocalReferenceMedia(worker, mediaPath);
  const provider = new CachedReferenceEmbeddingProvider(media, new FileArtifactCache(), embedding, localClock);
  const result = await analyzeReference({ manifest, bytes: () => localBytes(mediaPath), detector: { ...DEFAULT_DETECTOR, kind: detector as "content" | "adaptive" }, embedding, jobId }, { media, embeddings: provider, telemetry, clock: localClock });
  let benchmark: { benchmarkId: string; version: string; casesDigest: string; metrics: ReturnType<typeof boundaryMetrics> } | null = null;
  if (flags.has("--benchmark")) {
    let manifest;
    try { manifest = verifyReferenceBenchmark(await readLocalJson(flags.get("--benchmark")!, 16 * 1024 * 1024)); }
    catch { throw new ReferenceAnalysisError("authorization", "BENCHMARK_INVALID", "Boundary benchmark failed schema or digest validation."); }
    const item = manifest.cases.find((entry) => entry.contentHash === result.analysis.identity.contentHash);
    if (item === undefined || !result.analysis.authorization.allowedPurposes.includes("local_evaluation")) throw new ReferenceAnalysisError("authorization", "EVALUATION_NOT_AUTHORIZED");
    const fps = item.fps.numerator / item.fps.denominator;
    if (Math.abs(item.durationSeconds - result.fingerprint.durationSeconds) > 1e-6 || Math.abs(fps - result.fingerprint.fps.numerator / result.fingerprint.fps.denominator) > 1e-6) throw new ReferenceAnalysisError("authorization", "BENCHMARK_MEDIA_MISMATCH");
    benchmark = { benchmarkId: manifest.benchmarkId, version: manifest.version, casesDigest: manifest.casesDigest, metrics: boundaryMetrics(result.fingerprint.shots.slice(1).map((shot) => shot.sourceRange.startSeconds), item.boundariesSeconds, manifest.toleranceFrames / fps) };
  }
  await atomicJson(join(directory, "analysis.json"), result.analysis);
  await atomicJson(join(directory, "evaluation.json"), { ...result.evaluation, benchmark, boundaryMetrics: benchmark?.metrics ?? null,
    boundaryMetricsMissingReason: benchmark === null ? result.evaluation.boundaryMetricsMissingReason : null });
  await atomicJson(join(directory, "run.json"), { jobId, status: "succeeded", modelRuns: telemetry.modelRuns(), events: telemetry.snapshot() });
  await atomicJson(join(directory, "ReferenceFingerprint.json"), result.fingerprint);
  process.stdout.write(JSON.stringify({ asset: result.fingerprint.assetId, durationSeconds: result.fingerprint.durationSeconds, shots: result.fingerprint.shots.length, representativeFrames: result.evaluation.sampledFrames,
    embeddingModel: embedding.model, syntheticEmbeddings: embedding.mode === "stub", runtimeMilliseconds: result.evaluation.runtimeMilliseconds, fingerprintValidation: "PASS", cache: result.analysis.embeddingBatch.cache, artifacts: `.local-runs/${jobId}` }) + "\n");
} catch (error) {
  const failure = error instanceof ReferenceAnalysisError ? error : new ReferenceAnalysisError("fingerprint", "ANALYSIS_OR_ARTIFACT_FAILED");
  try { await atomicJson(join(directory, "run.json"), { jobId, status: "failed", error: { stage: failure.stage, code: failure.code, diagnostic: failure.message }, modelRuns: telemetry.modelRuns(), events: telemetry.snapshot() }); }
  catch { process.stderr.write(JSON.stringify({ stage: "artifacts", code: "ARTIFACT_WRITE_FAILED", diagnostic: "Run metadata could not be persisted." }) + "\n"); }
  process.stderr.write(JSON.stringify({ stage: failure.stage, code: failure.code, diagnostic: failure.message, artifacts: `.local-runs/${jobId}` }) + "\n");
  process.exitCode = 1;
} finally { await worker?.close(); }
