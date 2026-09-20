import { z } from "zod";
import { EmbeddingReferenceSchema, ModelRunSchema } from "../contracts/index.js";
import type { EmbeddingReference, ModelRun } from "../domain/index.js";
import type { AnalysisContext, VideoEmbeddingProvider } from "../providers/index.js";
import { aggregateEmbeddings, contentId, normalize } from "./features.js";
import { EmbeddingConfigSchema, type EmbeddingConfig, type Sample, type Shot } from "./protocol.js";

export interface ArtifactCache { read(key: string): Promise<unknown | null>; write(key: string, value: unknown): Promise<void> }
export interface Clock { now(): string; milliseconds(): number }
export type EmbeddingDevice = "cpu" | "cuda" | "mixed";
export interface EmbeddingBackend {
  embed(sampleIds: readonly string[], config: EmbeddingConfig): Promise<{ vectors: readonly { sampleId: string; vector: readonly number[] }[]; version: string; device: EmbeddingDevice; fallback: boolean }>;
}
export interface ReferenceEmbeddingInput { contentHash: string; shots: readonly Shot[]; samples: readonly Sample[] }
export interface EmbeddingBatch {
  shots: readonly { shotId: string; reference: EmbeddingReference }[];
  cache: { hits: number; misses: number; corrupt: number; shotHits: number; shotMisses: number };
  framesEmbedded: number; device: EmbeddingDevice | null; fallback: boolean; model: EmbeddingConfig;
  batchId: string;
}
const CacheEntrySchema = z.strictObject({ version: z.literal("1"), key: z.string(), vector: z.array(z.number().finite()).min(1).max(65536), checksum: z.string() });
export const EMBEDDING_IMPLEMENTATION = { adapter: "siglip-local-1", preprocessing: "rgb-square-pixels-512-v1", ffmpeg: "9.0.1", pillow: "11.3.0", transformers: "4.57.1", torch: "2.8.0", imageProcessor: "slow", inferenceBatchSize: 1 } as const;
export function embeddingCacheKey(contentHash: string, sampleIds: readonly string[], config: EmbeddingConfig, aggregation: "frame" | "normalized-mean-v1"): string {
  return contentId("cache", { contentHash, sampleIds, config: EmbeddingConfigSchema.parse(config), aggregation, implementation: EMBEDDING_IMPLEMENTATION });
}
// Shared by reference and footage analysis. Preserve the released space/key formulas.
export function embeddingSpaceId(config: EmbeddingConfig): string {
  return contentId("space", { config: EmbeddingConfigSchema.parse(config), implementation: EMBEDDING_IMPLEMENTATION, aggregation: "normalized-mean-v1" });
}
export function embeddingReference(key: string, vector: readonly number[], config: EmbeddingConfig): EmbeddingReference {
  return EmbeddingReferenceSchema.parse({ embeddingId: contentId("embedding", [key, contentId("digest", vector)]), spaceId: embeddingSpaceId(config), spaceVersion: "normalized-mean-v1", dimensions: vector.length, distance: "cosine", objectId: key });
}
export class EmbeddingVectorCache {
  corrupt = 0;
  constructor(private readonly cache: ArtifactCache) {}
  async read(key: string): Promise<number[] | null> {
    const raw = await this.cache.read(key);
    if (raw === null) return null;
    const parsed = CacheEntrySchema.safeParse(raw);
    if (!parsed.success || parsed.data.key !== key || parsed.data.checksum !== contentId("digest", parsed.data.vector) || Math.abs(Math.hypot(...parsed.data.vector) - 1) > 1e-6) { this.corrupt++; return null; }
    return parsed.data.vector;
  }
  async write(key: string, vector: number[]): Promise<void> { await this.cache.write(key, { version: "1", key, vector, checksum: contentId("digest", vector) }); }
}
export async function embedCachedFrames(backend: EmbeddingBackend, cache: ArtifactCache, contentHash: string, sampleIds: readonly string[], configInput: EmbeddingConfig, expectedDimensions?: number) {
  const config = EmbeddingConfigSchema.parse(configInput), entries = new EmbeddingVectorCache(cache);
  if (sampleIds.length < 1 || new Set(sampleIds).size !== sampleIds.length) throw new Error("Frame embedding requests require unique sample identities.");
  const vectors = new Map<string, number[]>(), missing: string[] = [];
  for (const sampleId of sampleIds) {
    const vector = await entries.read(embeddingCacheKey(contentHash, [sampleId], config, "frame"));
    if (vector === null) missing.push(sampleId); else vectors.set(sampleId, vector);
  }
  let device: EmbeddingDevice | null = null, fallback = false;
  if (missing.length) {
    const result = await backend.embed(missing, config);
    device = result.device; fallback = result.fallback;
    const expected = new Set(missing);
    if (result.vectors.length !== missing.length || new Set(result.vectors.map((item) => item.sampleId)).size !== expected.size || result.vectors.some((item) => !expected.has(item.sampleId))) throw new Error("Embedding backend returned inconsistent sample identities.");
    for (const item of result.vectors) vectors.set(item.sampleId, normalize(item.vector));
  }
  if (new Set([...vectors.values()].map((vector) => vector.length)).size !== 1) throw new Error("Embedding backend mixed incompatible dimensions.");
  if (expectedDimensions !== undefined && [...vectors.values()].some((v) => v.length !== expectedDimensions)) throw new Error("Observed model dimensions disagree with the installed model configuration.");
  for (const sampleId of missing) await entries.write(embeddingCacheKey(contentHash, [sampleId], config, "frame"), vectors.get(sampleId)!);
  return { vectors, device, fallback, framesEmbedded: missing.length, cache: { hits: sampleIds.length - missing.length, misses: missing.length, corrupt: entries.corrupt } };
}
export class CachedReferenceEmbeddingProvider implements VideoEmbeddingProvider<ReferenceEmbeddingInput, EmbeddingBatch> {
  readonly id = "local_video_embedding";
  readonly version = "1.0.0";
  constructor(private readonly backend: EmbeddingBackend, private readonly cache: ArtifactCache, private readonly config: EmbeddingConfig, private readonly clock: Clock) {}

  async embed(input: ReferenceEmbeddingInput, context: AnalysisContext): Promise<{ value: EmbeddingBatch; modelRun: ModelRun }> {
    const startedAt = this.clock.now();
    const config = EmbeddingConfigSchema.parse(this.config);
    const counters = { hits: 0, misses: 0, corrupt: 0, shotHits: 0, shotMisses: 0 };
    const frames = await embedCachedFrames(this.backend, this.cache, input.contentHash, input.samples.map((sample) => sample.sampleId), config);
    const { vectors, device, fallback } = frames;
    Object.assign(counters, frames.cache);
    const entries = new EmbeddingVectorCache(this.cache);
    const dimensions = new Set([...vectors.values()].map((vector) => vector.length));
    if (dimensions.size !== 1) throw new Error("Embedding backend mixed incompatible dimensions.");
    const references: { shotId: string; reference: EmbeddingReference }[] = [];
    for (const shot of input.shots) {
      const samples = input.samples.filter((sample) => sample.shotId === shot.shotId);
      const key = embeddingCacheKey(input.contentHash, samples.map((sample) => sample.sampleId), config, "normalized-mean-v1");
      let vector = await entries.read(key);
      if (vector === null) { counters.shotMisses++; vector = aggregateEmbeddings(samples.map((sample) => { const value = vectors.get(sample.sampleId); if (value === undefined) throw new Error("Missing sample embedding."); return value; })); await entries.write(key, vector); }
      else counters.shotHits++;
      if (!dimensions.has(vector.length)) throw new Error("Cached shot embedding dimension mismatch.");
      references.push({ shotId: shot.shotId, reference: embeddingReference(key, vector, config) });
    }
    const batchId = contentId("batch", references);
    counters.corrupt += entries.corrupt;
    return {
      value: { shots: references, cache: counters, framesEmbedded: frames.framesEmbedded, device, fallback, model: config, batchId },
      modelRun: ModelRunSchema.parse({ contractType: "ModelRun", schemaVersion: "1.0.0", runId: `${context.operationId}.model`, scope: context.scope, provider: this.id,
        model: config.mode === "stub" ? "synthetic_frame_statistics" : config.model.includes("so400m") ? "siglip2_so400m_naflex" : "siglip2_base_naflex",
        modelVersion: config.revision, adapterVersion: this.version, operation: "embedding", inputIds: [`asset_${input.contentHash}`], outputIds: [batchId], startedAt, endedAt: this.clock.now(), status: "succeeded", errorCode: null }),
    };
  }
}
