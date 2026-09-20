import { ClipSegmentSchema } from "../contracts/index.js";
import { aggregateEmbeddings, contentId } from "../reference-analyzer/features.js";
import { EmbeddingVectorCache, embeddingCacheKey, embeddingReference, type ArtifactCache } from "../reference-analyzer/embeddings.js";
import type { EmbeddingConfig, Shot } from "../reference-analyzer/protocol.js";
import { assertCompatibleEmbeddingSpaces } from "../validation/index.js";
import { AGGREGATION_VERSION, CandidateEvidenceSchema, DedupConfigSchema, FOOTAGE_VERSION, type Candidate, type CandidateEvidence, type CheapEvidence, type FootageConfig } from "./protocol.js";
import type { FrameFeatureBank } from "./frame-bank.js";
import { candidateCoverage, coveredDuration, temporalIoU } from "./candidates.js";

const average = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
function supporting<T>(items: readonly T[], candidate: Candidate, sample: (item: T) => { shotId: string; atSeconds: number }): { values: T[]; support: "within_segment" | "same_shot_context"; distance: number } {
  const group = items.filter((item) => sample(item).shotId === candidate.shotId);
  if (!group.length) throw new Error("Candidate has no source-shot evidence.");
  const { startSeconds: start, endSeconds: end } = candidate.sourceRange;
  const inside = group.filter((item) => sample(item).atSeconds >= start && sample(item).atSeconds < end);
  if (inside.length) return { values: inside, support: "within_segment", distance: 0 };
  const closest = group.reduce((a, b) => Math.abs(sample(a).atSeconds - (start + end) / 2) <= Math.abs(sample(b).atSeconds - (start + end) / 2) ? a : b);
  return { values: [closest], support: "same_shot_context", distance: Math.max(start - sample(closest).atSeconds, sample(closest).atSeconds - end, 0) };
}
// Deliberately has no embedding provider dependency. All inference precedes proposal/aggregation.
export class CandidateFeatureAggregator {
  constructor(private readonly cache: ArtifactCache) {}
  async aggregate(candidates: readonly Candidate[], cheap: readonly CheapEvidence[], bank: FrameFeatureBank, contentHash: string, config: EmbeddingConfig) {
    const entries = new EmbeddingVectorCache(this.cache), values: CandidateEvidence[] = [], vectors = new Map<string, number[]>();
    let hits = 0, misses = 0;
    for (const candidate of candidates) {
      const semantic = supporting(bank.frames, candidate, (f) => f), measurements = supporting(cheap, candidate, (f) => f.sample);
      for (const frame of semantic.values) assertCompatibleEmbeddingSpaces(bank.space, frame.embedding);
      const key = embeddingCacheKey(contentHash, semantic.values.map((f) => f.embedding.embeddingId), config, "normalized-mean-v1");
      let vector = await entries.read(key);
      if (vector === null) {
        misses++;
        vector = aggregateEmbeddings(semantic.values.map((frame) => { const v = bank.vectors.get(frame.sampleId); if (v === undefined) throw new Error("Missing frame vector."); return v; }));
        await entries.write(key, vector);
      } else hits++;
      const reference = embeddingReference(key, vector, config);
      assertCompatibleEmbeddingSpaces(bank.space, reference);
      const sampleIds = new Set(measurements.values.map((f) => f.sample.sampleId));
      const motion = measurements.support === "within_segment" ? measurements.values.map((f) => f.measurement).filter((m) => m.comparisonSampleId !== null && sampleIds.has(m.comparisonSampleId)) : [];
      const flow = motion.filter((m) => m.opticalFlowMeanPixels !== null && m.comparisonIntervalSeconds !== null).map((m) => m.opticalFlowMeanPixels! / m.comparisonIntervalSeconds!);
      const difference = motion.filter((m) => m.frameDifferenceMean !== null).map((m) => m.frameDifferenceMean!);
      const mean = (name: "brightnessMean" | "darkPixelFraction" | "brightPixelFraction" | "laplacianVariance") => average(measurements.values.map((f) => f.measurement[name]));
      const laplacianVariance = mean("laplacianVariance"), darkPixelFraction = mean("darkPixelFraction"), brightPixelFraction = mean("brightPixelFraction");
      const contributingMeasurementIds = measurements.values.map((f) => f.measurementId);
      const evidence = CandidateEvidenceSchema.parse({ candidate, contributingSemanticFrameIds: semantic.values.map((f) => f.sampleId), contributingMeasurementIds, contributingCheapSampleIds: [...sampleIds],
        semanticEmbedding: reference, semanticSupport: semantic.support, semanticContextDistanceSeconds: semantic.distance, cheapSupport: measurements.support,
        aggregationVersion: AGGREGATION_VERSION, aggregationId: contentId("aggregation", [candidate, semantic.values.map((f) => f.embedding), contributingMeasurementIds, AGGREGATION_VERSION]),
        signals: { brightnessMean: mean("brightnessMean"), darkPixelFraction, brightPixelFraction, laplacianVariance, frameDifferenceMean: difference.length ? average(difference) : null,
          opticalFlowPixelsPerSecond: flow.length ? average(flow) : null, sharpnessIndicator: laplacianVariance / (laplacianVariance + 100), unclippedPixelFraction: Math.max(0, 1 - darkPixelFraction - brightPixelFraction), stabilityIndicator: flow.length ? 1 / (1 + average(flow) / 10) : null } });
      values.push(evidence); vectors.set(candidate.candidateId, vector);
    }
    return { values, vectors, cache: { hits, misses, corrupt: entries.corrupt } };
  }
}

export function pruneCandidates(values: readonly CandidateEvidence[], vectors: ReadonlyMap<string, readonly number[]>, shots: readonly Shot[], configInput: FootageConfig["deduplication"]) {
  const config = DedupConfigSchema.parse(configInput), duration = shots.at(-1)!.endSeconds;
  const before = candidateCoverage(values.map((v) => v.candidate), shots, duration);
  const kept = [...values], pruned: { candidateId: string; representedBy: string }[] = [];
  for (let i = kept.length - 1; i >= 0; i--) {
    const current = kept[i]!, a = current.candidate, length = a.sourceRange.endSeconds - a.sourceRange.startSeconds;
    const replacement = kept.slice(0, i).find((other) => {
      const b = other.candidate, otherLength = b.sourceRange.endSeconds - b.sourceRange.startSeconds;
      if (a.assetId !== b.assetId || a.shotId !== b.shotId || Math.min(length, otherLength) / Math.max(length, otherLength) < config.durationRatio || temporalIoU(a.sourceRange, b.sourceRange) < config.temporalIoU || Math.abs(a.sourceRange.startSeconds + a.sourceRange.endSeconds - b.sourceRange.startSeconds - b.sourceRange.endSeconds) / 2 > config.maximumCenterDistanceSeconds) return false;
      assertCompatibleEmbeddingSpaces(current.semanticEmbedding, other.semanticEmbedding);
      const left = vectors.get(a.candidateId), right = vectors.get(b.candidateId);
      if (!left || !right || left.length !== right.length) throw new Error("Deduplication is missing compatible vectors.");
      return left.reduce((sum, v, k) => sum + v * right[k]!, 0) >= config.cosineSimilarity;
    });
    if (replacement === undefined) continue;
    // Protect union coverage separately at each duration scale, before removing anything.
    const scale = (v: CandidateEvidence) => v.candidate.shotId === a.shotId && Math.abs(v.candidate.sourceRange.endSeconds - v.candidate.sourceRange.startSeconds - length) < 1e-6;
    const withCurrent = kept.filter(scale).map((v) => v.candidate.sourceRange), without = kept.filter((v, k) => k !== i && scale(v)).map((v) => v.candidate.sourceRange);
    if (coveredDuration(withCurrent) - coveredDuration(without) > 1e-9) continue;
    pruned.push({ candidateId: a.candidateId, representedBy: replacement.candidate.candidateId }); kept.splice(i, 1);
  }
  // Resolve any pruning chain to a retained candidate for durable learning lineage.
  const links = new Map(pruned.map((p) => [p.candidateId, p.representedBy]));
  for (const item of pruned) while (links.has(item.representedBy)) item.representedBy = links.get(item.representedBy)!;
  const after = candidateCoverage(kept.map((v) => v.candidate), shots, duration);
  if (before.coveredSeconds - after.coveredSeconds > 1e-9 || before.representedShots !== after.representedShots) throw new Error("Deduplication removed temporal coverage.");
  return { kept, pruned, coverageBefore: before, coverageAfter: after };
}
export class ClipSegmentBuilder {
  build(evidence: CandidateEvidence, sourceDuration: number, modelRunIds: readonly string[], createdAt: string) {
    const input = CandidateEvidenceSchema.parse(evidence), c = input.candidate;
    if (c.sourceRange.endSeconds > sourceDuration) throw new Error("Candidate exceeds its source asset.");
    return ClipSegmentSchema.parse({ contractType: "ClipSegment", schemaVersion: "1.0.0", segmentId: c.candidateId, assetId: c.assetId, sourceRange: c.sourceRange,
      shotType: "unknown", subjectCount: null, facePresence: "unknown", personPresence: "unknown", poseTags: ["unknown"], motion: { camera: "unknown", subject: "unknown" }, composition: { framing: "unknown", subjectPosition: "unknown" },
      quality: { sharpness: null, exposure: null, stability: null }, semantics: { description: "", tags: [] }, semanticEmbedding: input.semanticEmbedding, motionEmbedding: null,
      provenance: { producer: "footage_analyzer", producerVersion: FOOTAGE_VERSION, modelRunIds: [...modelRunIds], createdAt } });
  }
}
