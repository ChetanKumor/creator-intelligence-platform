import { lstat, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { z } from "zod";
import { IdSchema } from "../packages/contracts/index.js";
import { contentId, hashAsset } from "../packages/reference-analyzer/features.js";
import { DetectorConfigSchema, MetadataSchema, type EmbeddingConfig, type MediaMetadata, type Sample, type WorkerRequest } from "../packages/reference-analyzer/protocol.js";
import { EMBEDDING_IMPLEMENTATION, type ArtifactCache } from "../packages/reference-analyzer/embeddings.js";
import { CheapEvidenceSchema, MEASUREMENT_VERSION, type FootageAuthorization, type FootageConfig, type FootageDetectorConfig, type FootageManifest } from "../packages/footage-analyzer/protocol.js";
import { FootageAnalysisError, type FootageServices } from "../packages/footage-analyzer/index.js";
import { LocalTransNetV2Detector, type TransNetV2Launch } from "./transnetv2-local.js";
import { TRANSNETV2_ADAPTER_VERSION, TRANSNETV2_PROTOCOL_VERSION, TRANSNETV2_SOURCE_COMMIT, TRANSNETV2_SOURCE_SHA256, TRANSNETV2_WEIGHT_SET_SHA256 } from "../packages/footage-analyzer/transnetv2-protocol.js";
import { InMemoryTelemetry } from "../packages/telemetry/index.js";
import { atomicJson, authorizedLocalPath, containedPath, FileArtifactCache, LocalReferenceMedia, localBytes, localClock, localPaths, PROJECT_ROOT, PythonWorker, readLocalJson } from "./reference-local.js";

export async function assertNoLinkedParents(filename: string): Promise<void> {
  let current = resolve(filename), root = parse(current).root;
  while (current !== root) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Filesystem links are not allowed for footage inputs or artifacts."); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
    current = dirname(current);
  }
}
export async function resolveFootagePath(manifestPath: string, supplied: string): Promise<string> {
  try {
    const parts = supplied.split(/[\\/]/);
    if (isAbsolute(supplied) || parts.some((part) => !part || part === "." || part === ".." || /[:\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("Invalid relative asset path.");
    const path = containedPath(dirname(resolve(manifestPath)), parts.join("/"));
    await assertNoLinkedParents(path);
    return await authorizedLocalPath(path);
  } catch { throw new FootageAnalysisError("identity", "MEDIA_UNREADABLE"); }
}
const MemoSchema = z.strictObject({ version: z.literal("footage-cache-v1"), key: IdSchema, checksum: IdSchema, value: z.unknown() });
async function memo<T>(cache: ArtifactCache, key: string, validate: (v: unknown) => T, calculate: () => Promise<T>) {
  const entry = MemoSchema.safeParse(await cache.read(key));
  if (entry.success && entry.data.key === key && entry.data.checksum === contentId("digest", entry.data.value)) {
    try { return { value: validate(entry.data.value), hit: true }; } catch { /* Recompute invalid cache data. */ }
  }
  const value = validate(await calculate());
  await cache.write(key, { version: "footage-cache-v1", key, value, checksum: contentId("digest", value) });
  return { value, hit: false };
}
export async function installedEmbeddingDimensions(config: EmbeddingConfig): Promise<number> {
  if (config.mode === "stub") return 8;
  const snapshot = join(localPaths.models, `models--${config.model.replace("/", "--")}`, "snapshots", config.revision);
  const file = join(snapshot, "config.json");
  try {
    await assertNoLinkedParents(file);
    const identity = await hashAsset(localBytes(file));
    const receipt = z.object({ model: z.string(), revision: z.string(), files: z.array(z.object({ name: z.string(), sha256: z.string() })) }).parse(await readLocalJson(join(localPaths.models, "so400m-download-receipt.json"), 65536));
    if (receipt.model !== config.model || receipt.revision !== config.revision || receipt.files.find((f) => f.name === "config.json")?.sha256 !== identity.contentHash) throw new Error("Pinned model config checksum mismatch.");
    const data = z.object({ model_type: z.literal("siglip2"), vision_config: z.object({ hidden_size: z.number().int().positive().max(65536) }) }).parse(await readLocalJson(file, 65536));
    return data.vision_config.hidden_size;
  } catch { throw new FootageAnalysisError("embedding", "EMBEDDING_MODEL_UNAVAILABLE"); }
}
export class LocalFootageServices implements FootageServices {
  readonly clock = localClock;
  readonly telemetry = new InMemoryTelemetry();
  readonly cache: FileArtifactCache;
  private worker: PythonWorker | undefined;
  private transnetWorker: LocalTransNetV2Detector | undefined;
  private readonly transnetLaunch: TransNetV2Launch | undefined;

  constructor(
    private readonly manifestPath: string,
    private readonly capacityReport: string,
    private readonly frameRoot = join(PROJECT_ROOT, ".reference-cache/footage-frames"),
    private readonly cacheRoot = join(PROJECT_ROOT, ".reference-cache/embeddings"),
    transnetLaunch?: TransNetV2Launch,
  ) {
    this.cache = new FileArtifactCache(cacheRoot, 16 * 1024 * 1024);
    this.transnetLaunch = transnetLaunch;
  }
  async open(entry: FootageManifest["assets"][number], authorization: FootageAuthorization, config: FootageConfig) {
    const mediaPath = await resolveFootagePath(this.manifestPath, entry.path);
    await assertNoLinkedParents(this.frameRoot); await assertNoLinkedParents(this.capacityReport); await assertNoLinkedParents(this.cacheRoot);
    await mkdir(this.frameRoot, { recursive: true });
    let deadline = Number.POSITIVE_INFINITY;
    const service = this;
    const worker = { request: async (request: WorkerRequest) => {
      if (deadline <= this.clock.milliseconds()) throw new FootageAnalysisError("sample", "ASSET_TIMEOUT");
      this.worker ??= new PythonWorker(config.workerTimeoutMilliseconds, this.capacityReport);
      try { return await this.worker.request(request, Math.min(config.workerTimeoutMilliseconds, deadline - this.clock.milliseconds())); }
      catch (error) {
        await this.worker.close(); this.worker = undefined;
        try { const report = request.operation === "embed" ? await readLocalJson(this.capacityReport, 65536) : null; if (typeof report === "object" && report !== null && "status" in report && ["pending_environment_capacity", "memory_guard_stop"].includes(String(report.status))) throw new FootageAnalysisError("embedding", "EMBEDDING_ENVIRONMENT_CAPACITY"); }
        catch (capacityError) { if (capacityError instanceof FootageAnalysisError) throw capacityError; }
        throw error;
      }
    } };
    const media = new LocalReferenceMedia(worker, mediaPath, this.frameRoot), cache = this.cache;
    const metaSchema = z.strictObject({ value: MetadataSchema, version: z.string() });
    const detectedSchema = z.strictObject({ cuts: z.array(z.number().int().positive()).max(999), version: z.string() });
    const featuresSchema = z.strictObject({ features: z.array(CheapEvidenceSchema).min(1).max(3000), version: z.string() });
    return { bytes: () => localBytes(mediaPath), backend: media, expectedDimensions: () => installedEmbeddingDimensions(config.embedding), media: {
      setDeadline(at: number) { deadline = at; },
      async metadata() { return (await memo(cache, contentId("cache", ["footage-metadata-v1", authorization.contentHash, "ffprobe-9.0.1"]), (v) => metaSchema.parse(v), () => media.metadata())).value; },
      async detect(metadata: MediaMetadata, detector: FootageDetectorConfig): Promise<{ cuts: readonly number[]; version: string }> {
        if (detector.kind !== "transnetv2") {
          const referenceDetector = DetectorConfigSchema.parse(detector);

          return (
            await memo(
              cache,
              contentId("cache", [
                "footage-detection-v1",
                authorization.contentHash,
                referenceDetector,
                metadata.frameCount,
                "scenedetect-0.6.7.1",
              ]),
              (value) => detectedSchema.parse(value),
              async (): Promise<{ cuts: number[]; version: string }> => {
                const result = await media.detect(metadata, referenceDetector);

                return {
                  cuts: [...result.cuts],
                  version: result.version,
                };
              },
            )
          ).value;
        }

        if (deadline <= service.clock.milliseconds()) {
          throw new FootageAnalysisError("detect", "ASSET_TIMEOUT");
        }

        const launch = service.transnetLaunch;

        if (launch === undefined) {
          throw new FootageAnalysisError("detect", "TRANSNETV2_NOT_CONFIGURED");
        }

        const key = contentId("cache", [
          "footage-detection-transnetv2-v1",
          authorization.contentHash,
          detector,
          metadata.frameCount,
          TRANSNETV2_ADAPTER_VERSION,
          TRANSNETV2_SOURCE_COMMIT,
          TRANSNETV2_SOURCE_SHA256,
          TRANSNETV2_WEIGHT_SET_SHA256,
          "ffmpeg-9.0.1",
          "rgb48x27-passthrough-v1",
        ]);

        return (
          await memo(
            cache,
            key,
            (value) => detectedSchema.parse(value),
            async (): Promise<{ cuts: number[]; version: string }> => {
              service.transnetWorker ??=
                new LocalTransNetV2Detector({
                  ...launch,
                  timeoutMilliseconds:
                    Math.min(
                      launch.timeoutMilliseconds ??
                        config.workerTimeoutMilliseconds,
                      config.workerTimeoutMilliseconds,
                    ),
                });

              try {
                const result =
                  await service.transnetWorker.detect({
                    protocolVersion:
                      TRANSNETV2_PROTOCOL_VERSION,

                    operation:
                      "detect",

                    mediaPath,

                    ffmpegPath:
                      join(
                        PROJECT_ROOT,
                        ".tools",
                        "ffmpeg",
                        "ffmpeg-9.0.1-essentials_build",
                        "bin",
                        "ffmpeg.exe",
                      ),

                    expectedFrameCount:
                      metadata.frameCount,

                    threshold:
                      detector.threshold,
                  });

                if (
                  result.model.sourceCommit !==
                    TRANSNETV2_SOURCE_COMMIT ||
                  result.model.sourceSha256 !==
                    TRANSNETV2_SOURCE_SHA256 ||
                  result.model.weightSetSha256 !==
                    TRANSNETV2_WEIGHT_SET_SHA256
                ) {
                  throw new FootageAnalysisError(
                    "detect",
                    "MODEL_PROVENANCE_INVALID",
                  );
                }

                return {
                  cuts: [...result.value.cuts],

                  version:
                    `${result.toolVersion}:${result.model.sourceCommit}:${result.model.weightSetSha256}`,
                };

              } catch (error) {
                const failed =
                  service.transnetWorker;

                service.transnetWorker =
                  undefined;

                try {
                  await failed?.close();
                } catch {
                  // Preserve the original detector failure.
                }

                throw error;
              }
            },
          )
        ).value;
      },
      sampleFootage: async (samples: readonly Sample[]) => {
        const key = contentId("cache", ["footage-measurements-v1", authorization.contentHash, samples, MEASUREMENT_VERSION, "opencv-4.12.0", EMBEDDING_IMPLEMENTATION.preprocessing, EMBEDDING_IMPLEMENTATION.ffmpeg]);
        const calculate = async () => {
          const measured = await media.sample(samples), byId = new Map(measured.measurements.map((m) => [m.sampleId, m]));
          const features = [];
          for (const sample of samples) {
            const filename = containedPath(this.frameRoot, `${sample.sampleId}.png`);
            await assertNoLinkedParents(filename);
            const frameContentHash = (await hashAsset(localBytes(filename))).contentHash;
            const measurement = byId.get(sample.sampleId);
            if (measurement === undefined) throw new Error("Missing measurement.");
            features.push({ sample, measurement, frameContentHash, measurementId: contentId("measurement", [sample, measurement, frameContentHash, MEASUREMENT_VERSION]) });
          }
          return { features, version: measured.version };
        };
        let result = await memo(cache, key, (v) => featuresSchema.parse(v), calculate);
        if (result.hit) {
          try {
            for (const frame of result.value.features) {
              const filename = containedPath(this.frameRoot, `${frame.sample.sampleId}.png`);
              await assertNoLinkedParents(filename);
              const info = await lstat(filename);
              if (!info.isFile() || info.size > 2 * 1024 * 1024 || (await hashAsset(localBytes(filename))).contentHash !== frame.frameContentHash) throw new Error("Frame artifact changed.");
            }
          } catch {
            const value = featuresSchema.parse(await calculate());
            await cache.write(key, { version: "footage-cache-v1", key, value, checksum: contentId("digest", value) });
            result = { value, hit: false };
          }
        }
        return { ...result.value, cacheHit: result.hit, decodedFrames: result.hit ? 0 : samples.length };
      },
    } };
  }
  async close(): Promise<void> {
    let firstFailure: unknown;

    try {
      await this.worker?.close();
    } catch (error) {
      firstFailure = error;
    } finally {
      this.worker = undefined;
    }

    try {
      await this.transnetWorker?.close();
    } catch (error) {
      if (firstFailure === undefined) {
        firstFailure = error;
      }
    } finally {
      this.transnetWorker = undefined;
    }

    if (firstFailure !== undefined) {
      throw firstFailure;
    }
  }
}

export async function writeFootageJson(filename: string, value: unknown): Promise<void> { await assertNoLinkedParents(filename); await atomicJson(filename, value); }
export async function readFootageJson(filename: string, maximumBytes: number): Promise<unknown> { await assertNoLinkedParents(filename); return readLocalJson(filename, maximumBytes); }
