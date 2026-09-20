import type { EmbeddingReference } from "../domain/index.js";
import { contentId } from "../reference-analyzer/features.js";
import { embedCachedFrames, embeddingCacheKey, embeddingReference, type ArtifactCache, type EmbeddingBackend, type EmbeddingDevice } from "../reference-analyzer/embeddings.js";
import type { EmbeddingConfig } from "../reference-analyzer/protocol.js";
import { assertCompatibleEmbeddingSpaces } from "../validation/index.js";
import { SemanticFrameSchema, type CheapEvidence, type SemanticFrame, type SemanticSelection } from "./protocol.js";

export interface FrameFeatureBank {
  frames: SemanticFrame[];
  vectors: Map<string, number[]>; // Execution-only; never serialize this map into a domain artifact.
  framesEmbedded: number; uniqueFrames: number; cache: { hits: number; misses: number; corrupt: number };
  device: EmbeddingDevice | null; fallback: boolean; space: EmbeddingReference;
}
export async function buildFrameFeatureBank(contentHash: string, features: readonly CheapEvidence[], selection: readonly SemanticSelection[], config: EmbeddingConfig, backend: EmbeddingBackend, cache: ArtifactCache, expectedDimensions?: number): Promise<FrameFeatureBank> {
  const evidence = new Map(features.map((f) => [f.sample.sampleId, f]));
  if (!selection.length || new Set(selection.map((s) => s.sampleId)).size !== selection.length) throw new Error("Semantic selection must contain unique frames.");
  // Exact extracted PNG identity shares expensive work across repeated static frames.
  const canonical = new Map<string, string>(), aliases = new Map<string, string>();
  for (const item of selection) {
    const frame = evidence.get(item.sampleId);
    if (frame === undefined) throw new Error("Semantic selection is missing its cheap frame evidence.");
    const key = contentId("sample", ["decoded-png-v1", frame.frameContentHash]);
    if (!canonical.has(key)) canonical.set(key, item.sampleId);
    aliases.set(item.sampleId, key);
  }
  const translated: EmbeddingBackend = { async embed(ids, requestedConfig) {
    const result = await backend.embed(ids.map((id) => canonical.get(id)!), requestedConfig);
    const reverse = new Map(ids.map((id) => [canonical.get(id)!, id]));
    return { ...result, vectors: result.vectors.map((item) => ({ ...item, sampleId: reverse.get(item.sampleId) ?? "unexpected_sample" })) };
  } };
  const result = await embedCachedFrames(translated, cache, contentHash, [...canonical.keys()], config, expectedDimensions);
  const vectors = new Map<string, number[]>();
  const frames = selection.map((item) => {
    const frame = evidence.get(item.sampleId)!, canonicalId = aliases.get(item.sampleId)!;
    const vector = result.vectors.get(canonicalId)!;
    if (expectedDimensions !== undefined && vector.length !== expectedDimensions) throw new Error("Observed model dimensions disagree with the installed model configuration.");
    vectors.set(item.sampleId, vector);
    return SemanticFrameSchema.parse({ ...frame.sample, frameContentHash: frame.frameContentHash, selectionReasons: item.selectionReasons,
      embedding: embeddingReference(embeddingCacheKey(contentHash, [canonicalId], config, "frame"), vector, config) });
  });
  const space = frames[0]!.embedding;
  for (const frame of frames) assertCompatibleEmbeddingSpaces(space, frame.embedding);
  return { frames, vectors, framesEmbedded: result.framesEmbedded, uniqueFrames: canonical.size, cache: result.cache, device: result.device, fallback: result.fallback, space };
}
