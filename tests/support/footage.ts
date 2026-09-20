import { contentId, hashAsset } from "../../packages/reference-analyzer/features.js";
import { STUB_EMBEDDING, type MediaMetadata, type Sample } from "../../packages/reference-analyzer/protocol.js";
import type { ArtifactCache, EmbeddingBackend } from "../../packages/reference-analyzer/embeddings.js";
import { InMemoryTelemetry } from "../../packages/telemetry/index.js";
import { DEFAULT_FOOTAGE_CONFIG, MEASUREMENT_VERSION, type CheapEvidence, type FootageAuthorization, type FootageConfig, type FootageManifest } from "../../packages/footage-analyzer/protocol.js";
import type { FootageServices } from "../../packages/footage-analyzer/index.js";

export const FOOTAGE_TIME = "2026-09-14T00:00:00.000Z";
export const stubConfig = (): FootageConfig => structuredClone({ ...DEFAULT_FOOTAGE_CONFIG, embedding: STUB_EMBEDDING });
export class MemoryCache implements ArtifactCache {
  readonly values = new Map<string, unknown>();
  async read(key: string) { return structuredClone(this.values.get(key) ?? null); }
  async write(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
}
export function footageMetadata(duration = 30, fps = 10): MediaMetadata {
  const frameCount = Math.ceil(duration * fps);
  return { durationSeconds: duration, width: 90, height: 160, codedWidth: 90, codedHeight: 160, fps: { numerator: fps, denominator: 1 }, frameCount,
    frameTimes: Array.from({ length: frameCount }, (_, i) => i / fps), codec: "h264", rotation: 0, aspectRatio: { width: 9, height: 16 }, hasAudio: false, variableFrameRate: false };
}
export function cheapEvidence(samples: readonly Sample[], changing = false): CheapEvidence[] {
  const previous = new Map<string, Sample>();
  return samples.map((sample, i) => {
    const prior = previous.get(sample.shotId);
    const change = changing && i % 5 === 0 ? 0.4 : 0;
    const measurement = { sampleId: sample.sampleId, brightnessMean: changing ? i % 5 === 0 ? 0.9 : 0.4 : 0.5, darkPixelFraction: 0, brightPixelFraction: 0,
      laplacianVariance: changing && i % 5 === 0 ? 300 : 100, comparisonSampleId: prior?.sampleId ?? null, comparisonIntervalSeconds: prior ? sample.atSeconds - prior.atSeconds : null,
      frameDifferenceMean: prior ? change : null, opticalFlowMeanPixels: prior ? change * 30 : null };
    previous.set(sample.shotId, sample);
    const frameContentHash = contentId("frame", changing ? sample.sampleId : "static").slice(6);
    return { sample, measurement, frameContentHash, measurementId: contentId("measurement", [sample, measurement, frameContentHash, MEASUREMENT_VERSION]) };
  });
}
export class CountingBackend implements EmbeddingBackend {
  frames = 0;
  calls = 0;
  async embed(ids: readonly string[]) {
    this.frames += ids.length; this.calls++;
    return { vectors: ids.map((sampleId) => ({ sampleId, vector: [1, 0.2, 0.1, 0.3, 0.4, 0.5, 0.6, 0.7] })), version: "stub-v1", device: "cpu" as const, fallback: false };
  }
}
export async function syntheticAuthorization(bytes: Uint8Array): Promise<FootageAuthorization> {
  const identity = await hashAsset((async function* () { yield bytes; })());
  return { manifestType: "AuthorizedFootage", schemaVersion: "1.0.0", contentHash: identity.contentHash, sizeBytes: identity.sizeBytes, sourceType: "synthetic", authorizationBasis: "synthetic_generated", allowedPurposes: ["local_footage_analysis", "local_evaluation"], dateAdded: FOOTAGE_TIME, creatorId: "creator_footage_test", projectId: "project_footage_test" };
}
export async function footageEnvironment(names = ["good"], duration = 30) {
  const contents = new Map<string, Uint8Array>();
  for (const name of names) contents.set(name, new TextEncoder().encode(name === "duplicate" ? "good" : name));
  const assets = await Promise.all(names.map(async (name) => ({ entryId: `entry_${name}`, path: `${name}.mp4`, authorization: await syntheticAuthorization(contents.get(name)!) })));
  const manifest: FootageManifest = { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: "creator_footage_test", projectId: "project_footage_test", assets };
  const cache = new MemoryCache(), backend = new CountingBackend(), telemetry = new InMemoryTelemetry();
  let metadataCalls = 0;
  const services: FootageServices = { cache, telemetry, clock: { now: () => FOOTAGE_TIME, milliseconds: () => 100 }, async open(entry) {
    const name = entry.entryId.slice(6), bytes = contents.get(name)!;
    return { bytes: () => (async function* () { yield bytes; })(), expectedDimensions: async () => 8, backend, media: {
      async metadata() { metadataCalls++; if (name === "corrupt") throw new Error("C:/private/untrusted.mp4"); return { value: footageMetadata(duration), version: "test" }; },
      async detect() { return { cuts: [], version: "test" }; },
      async sampleFootage(samples) { return { features: cheapEvidence(samples, true), version: "test", cacheHit: false, decodedFrames: samples.length }; },
    } };
  } };
  return { manifest, config: stubConfig(), services, cache, backend, telemetry, contents, metadataCalls: () => metadataCalls };
}
