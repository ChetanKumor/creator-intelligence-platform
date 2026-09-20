import { createHash } from "node:crypto";
import { canonicalSerialize } from "../domain/serialization.js";
import { MetadataSchema, ShotSchema, type MediaMetadata, type Sample, type Shot } from "./protocol.js";

export function contentId(prefix: string, value: unknown): string { return `${prefix}_${createHash("sha256").update(canonicalSerialize(value)).digest("hex")}`; }
export async function hashAsset(bytes: AsyncIterable<Uint8Array>): Promise<{ contentHash: string; sizeBytes: number; assetId: string }> {
  const hash = createHash("sha256"); let sizeBytes = 0;
  for await (const chunk of bytes) { hash.update(chunk); sizeBytes += chunk.byteLength; if (!Number.isSafeInteger(sizeBytes) || sizeBytes > 8 * 1024 ** 3) throw new Error("Media exceeds the local 8 GiB input limit."); }
  const contentHash = hash.digest("hex");
  return { contentHash, sizeBytes, assetId: `asset_${contentHash}` };
}
export function validateTimeline(input: readonly Shot[], duration: number): Shot[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600 || input.length < 1 || input.length > 1000) throw new Error("Unsupported timeline bounds.");
  const shots = input.map((shot) => ShotSchema.parse(shot));
  const seen = new Set<string>(); let previous = 0;
  for (const shot of shots) {
    if (seen.has(shot.shotId) || shot.endSeconds <= shot.startSeconds || Math.abs(shot.startSeconds - previous) > 1e-6 || shot.endSeconds > duration) throw new Error("Invalid shot partition.");
    previous = shot.endSeconds; seen.add(shot.shotId);
  }
  if (Math.abs(previous - duration) > 1e-6) throw new Error("Final shot must end at video duration.");
  return shots;
}
export function timelineFromCuts(assetId: string, metadata: MediaMetadata, cuts: readonly number[]): Shot[] {
  MetadataSchema.parse(metadata);
  if (cuts.some((frame, i) => !Number.isInteger(frame) || frame <= 0 || frame >= metadata.frameCount || (i > 0 && frame <= cuts[i - 1]!))) throw new Error("Invalid detector frame boundaries.");
  const boundaries = [0, ...cuts.map((index) => metadata.frameTimes[index]!), metadata.durationSeconds];
  return validateTimeline(boundaries.slice(0, -1).map((startSeconds, index) => ({ shotId: contentId("shot", [assetId, startSeconds, boundaries[index + 1]]), startSeconds, endSeconds: boundaries[index + 1]! })), metadata.durationSeconds);
}
export const SAMPLING_VERSION = "interior-pts-v1";
export function selectSamples(shots: readonly Shot[], metadata: MediaMetadata): Sample[] {
  validateTimeline(shots, metadata.durationSeconds);
  return shots.flatMap((shot) => {
    const frames = metadata.frameTimes.map((atSeconds, frameIndex) => ({ atSeconds, frameIndex })).filter((frame) => frame.atSeconds >= shot.startSeconds && frame.atSeconds < shot.endSeconds);
    if (frames.length === 0) throw new Error("Shot has no decodable frame.");
    const interior = frames.length >= 3 ? frames.slice(1, -1) : frames;
    const fractions = shot.endSeconds - shot.startSeconds < 0.75 || interior.length < 3 ? [0.5] : [0.25, 0.5, 0.75];
    const selected = fractions.map((fraction) => {
      const target = shot.startSeconds + fraction * (shot.endSeconds - shot.startSeconds);
      return interior.reduce((a, b) => Math.abs(a.atSeconds - target) <= Math.abs(b.atSeconds - target) ? a : b);
    });
    return [...new Map(selected.map((frame) => [frame.frameIndex, frame])).values()].map((frame) => ({ ...frame, shotId: shot.shotId, sampleId: contentId("sample", [shot.shotId, SAMPLING_VERSION, frame.frameIndex, frame.atSeconds]) }));
  });
}
export function normalize(vector: readonly number[]): number[] {
  if (vector.length === 0 || vector.length > 65536 || vector.some((value) => !Number.isFinite(value))) throw new Error("Invalid embedding values.");
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm < 1e-12) throw new Error("Embedding has no usable norm.");
  return vector.map((value) => value / norm);
}
export function aggregateEmbeddings(vectors: readonly (readonly number[])[]): number[] {
  if (vectors.length === 0 || vectors.some((vector) => vector.length !== vectors[0]!.length)) throw new Error("Embedding dimensions must agree.");
  const normalized = vectors.map(normalize);
  return normalize(normalized[0]!.map((_, dimension) => normalized.reduce((sum, vector) => sum + vector[dimension]!, 0) / vectors.length));
}
export function pacingMetrics(shots: readonly Shot[], duration: number) {
  validateTimeline(shots, duration);
  const lengths = shots.map((shot) => shot.endSeconds - shot.startSeconds);
  const sorted = [...lengths].sort((a, b) => a - b);
  const windows = [0, 1, 2].map((index) => {
    const start = duration * index / 3, end = duration * (index + 1) / 3;
    const cuts = shots.slice(1).filter((shot) => shot.startSeconds >= start && shot.startSeconds < end).length;
    return { startSeconds: start, endSeconds: end, cuts, cutsPerSecond: cuts / (end - start) };
  });
  return { shotCount: shots.length, averageShotLengthSeconds: duration / shots.length, medianShotLengthSeconds: (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2,
    minimumShotLengthSeconds: sorted[0]!, maximumShotLengthSeconds: sorted.at(-1)!, shotDurationsSeconds: lengths,
    cutsPerSecond: (shots.length - 1) / duration, shotsPerSecond: shots.length / duration, windows,
    endingMinusOpeningCutsPerSecond: windows[2]!.cutsPerSecond - windows[0]!.cutsPerSecond };
}
