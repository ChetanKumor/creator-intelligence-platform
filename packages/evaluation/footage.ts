import { ClipSegmentSchema } from "../contracts/index.js";
import { temporalIoU } from "../footage-analyzer/candidates.js";
import type { FootageResult } from "../footage-analyzer/index.js";

export function temporalRegionCoverage(candidates: readonly { sourceRange: { startSeconds: number; endSeconds: number } }[], regions: readonly { startSeconds: number; endSeconds: number }[], minimumIoU = 0.5) {
  if (!(minimumIoU > 0 && minimumIoU <= 1) || regions.some((r) => !Number.isFinite(r.startSeconds) || !Number.isFinite(r.endSeconds) || r.startSeconds < 0 || r.endSeconds <= r.startSeconds)) throw new Error("Invalid region coverage protocol.");
  const represented = regions.filter((region) => candidates.some((candidate) => temporalIoU(region, candidate.sourceRange) >= minimumIoU)).length;
  return { minimumIoU, regions: regions.length, represented, coverage: regions.length ? represented / regions.length : null };
}
export function evaluateFootage(result: FootageResult) {
  const assets = result.inventory.assets, duration = result.inventory.totalSourceDurationSeconds, candidates = result.segments.length;
  const sampled = assets.reduce((n, a) => n + a.cheapFramesAnalyzed, 0), selected = assets.reduce((n, a) => n + a.semanticSamplesSelected, 0), embedded = assets.reduce((n, a) => n + a.semanticSamplesEmbedded, 0);
  const before = assets.reduce((n, a) => n + a.candidatesBeforeDeduplication, 0), hits = result.cacheStats.reduce((n, c) => n + c.frameHits, 0), misses = result.cacheStats.reduce((n, c) => n + c.frameMisses, 0);
  const valid = result.segments.filter((s) => ClipSegmentSchema.safeParse(s).success).length;
  return { artifactType: "FootageEvaluation", artifactVersion: "1.0.0", analyzedAssets: assets.length, failedAssets: result.inventory.failures.length, duplicateAssets: result.inventory.duplicateAssets.length,
    schemaValidClipSegmentRate: candidates ? valid / candidates : null, validatedClipSegments: valid,
    cheapFramesAnalyzed: sampled, semanticSamplesRequested: assets.reduce((n, a) => n + a.semanticSamplesRequested, 0), semanticSamplesSelected: selected, semanticSamplesEmbedded: embedded, semanticFramesEmbedded: embedded,
    candidatesBeforeDeduplication: before, candidatesAfterDeduplication: candidates, deduplicationRatio: before ? (before - candidates) / before : null,
    frameCacheHits: hits, frameCacheMisses: misses, embeddingCacheHitRate: hits + misses ? hits / (hits + misses) : null,
    runtimeMilliseconds: result.runtimeMilliseconds, runtimeMillisecondsPerSourceMinute: duration ? result.runtimeMilliseconds * 60 / duration : null,
    cheapFramesPerSourceMinute: duration ? sampled * 60 / duration : null, embeddingOperationsPerSourceMinute: duration ? embedded * 60 / duration : null,
    coverage: assets.map((a) => ({ assetId: a.assetId, before: a.coverageBefore, after: a.coverageAfter })),
    referenceSpecificSufficiency: null, humanCandidateQuality: null, boundaryAccuracy: null,
    missingEvidence: "Human usefulness and reference-specific sufficiency are unmeasured. Synthetic coverage tests provide separate labeled evidence.",
    externalApiCostInrMicros: result.externalApiCostInrMicros, infrastructureCostMeasured: false };
}
