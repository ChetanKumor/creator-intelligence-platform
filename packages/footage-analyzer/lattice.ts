import { contentId, validateTimeline } from "../reference-analyzer/features.js";
import { MetadataSchema, type MediaMetadata, type Sample, type Shot } from "../reference-analyzer/protocol.js";
import { CheapConfigSchema, SemanticConfigSchema, type CheapEvidence, type FootageConfig, type SelectionReason, type SemanticSelection } from "./protocol.js";

// Allocate minimum coverage first, then the largest remaining temporal interval.
export function allocateBudget(weights: readonly number[], desired: readonly number[], maximum: number): number[] {
  if (weights.length !== desired.length || maximum < 0 || !Number.isSafeInteger(maximum)) throw new Error("Invalid allocation budget.");
  const counts = weights.map(() => 0);
  for (let used = 0; used < Math.min(maximum, desired.reduce((a, b) => a + b, 0)); used++) {
    let best = -1, score = -1;
    for (let i = 0; i < weights.length; i++) if (counts[i]! < desired[i]!) {
      const next = counts[i] === 0 ? Number.MAX_VALUE - i : weights[i]! / (counts[i]! + 1);
      if (next > score) { best = i; score = next; }
    }
    if (best < 0) break;
    counts[best]!++;
  }
  return counts;
}
function nearest<T extends { atSeconds: number }>(items: readonly T[], target: number): T {
  if (!items.length) throw new Error("No temporal evidence exists.");
  return items.reduce((a, b) => Math.abs(a.atSeconds - target) <= Math.abs(b.atSeconds - target) ? a : b);
}
export function selectCheapLattice(assetId: string, shots: readonly Shot[], metadataInput: MediaMetadata, configInput: FootageConfig["cheap"]) {
  const metadata = MetadataSchema.parse(metadataInput), config = CheapConfigSchema.parse(configInput);
  validateTimeline(shots, metadata.durationSeconds);
  if (shots.length > config.maximumFrames) throw new Error("CHEAP_MINIMUM_COVERAGE_EXCEEDS_BUDGET");
  const available = shots.map((shot) => metadata.frameTimes.map((atSeconds, frameIndex) => ({ atSeconds, frameIndex })).filter((frame) => frame.atSeconds >= shot.startSeconds && frame.atSeconds < shot.endSeconds));
  if (available.some((frames) => !frames.length)) throw new Error("A source shot has no decoded frame.");
  const weights = shots.map((s) => s.endSeconds - s.startSeconds);
  const requested = weights.map((duration, i) => Math.min(available[i]!.length, Math.max(1, Math.ceil(duration * config.targetSamplesPerSecond))));
  const allocation = allocateBudget(weights, requested, config.maximumFrames);
  const samples: Sample[] = shots.flatMap((shot, i) => {
    const selected = Array.from({ length: allocation[i]! }, (_, k) => nearest(available[i]!, shot.startSeconds + weights[i]! * (k + 0.5) / allocation[i]!));
    return [...new Map(selected.map((frame) => [frame.frameIndex, frame])).values()].map((frame) => ({ ...frame, shotId: shot.shotId, sampleId: contentId("sample", [assetId, config, frame.frameIndex, frame.atSeconds]) }));
  });
  return { samples, framesRequested: requested.reduce((a, b) => a + b, 0), reducedResolution: allocation.some((count, i) => count < requested[i]!), configurationId: contentId("lattice", config) };
}

export function selectSemanticLattice(shots: readonly Shot[], features: readonly CheapEvidence[], configInput: FootageConfig["semantic"]) {
  const config = SemanticConfigSchema.parse(configInput);
  if (shots.length > config.maximumFrames) throw new Error("SEMANTIC_MINIMUM_COVERAGE_EXCEEDS_BUDGET");
  const requested = new Map<string, SemanticSelection>(), mandatory = new Set<string>(), coverage = new Set<string>();
  const positions = new Map(features.map((f) => [f.sample.sampleId, f.sample]));
  const add = (id: string, reason: SelectionReason, score = 0) => {
    const item = requested.get(id) ?? { sampleId: id, selectionReasons: [], noveltyScore: 0 };
    if (!item.selectionReasons.includes(reason)) item.selectionReasons.push(reason);
    item.noveltyScore = Math.max(item.noveltyScore, score); requested.set(id, item);
  };
  for (const shot of shots) {
    const group = features.filter((f) => f.sample.shotId === shot.shotId).sort((a, b) => a.sample.atSeconds - b.sample.atSeconds);
    if (!group.length) throw new Error("A source shot has no cheap evidence.");
    const samples = group.map((f) => f.sample);
    const middle = nearest(samples, (shot.startSeconds + shot.endSeconds) / 2).sampleId;
    add(middle, "source_shot"); mandatory.add(middle);
    const count = Math.ceil((shot.endSeconds - shot.startSeconds) / config.coverageGapSeconds);
    for (let i = 0; i < count; i++) {
      const id = nearest(samples, shot.startSeconds + (shot.endSeconds - shot.startSeconds) * (i + 0.5) / count).sampleId;
      add(id, "temporal_coverage"); coverage.add(id);
    }
    const changes = group.map((frame, i) => {
      const previous = group[i - 1]?.measurement, m = frame.measurement;
      const flowRate = (value: typeof m) => value.opticalFlowMeanPixels === null || value.comparisonIntervalSeconds === null ? null : value.opticalFlowMeanPixels / value.comparisonIntervalSeconds / 512;
      const currentFlow = flowRate(m), previousFlow = previous === undefined ? null : flowRate(previous);
      const signals: [SelectionReason, number][] = [
        ["visual_change", (m.frameDifferenceMean ?? 0) / config.changeThreshold],
        ["exposure_change", previous === undefined ? 0 : Math.abs(m.brightnessMean - previous.brightnessMean) / config.exposureChangeThreshold],
        ["sharpness_change", previous === undefined ? 0 : Math.abs(Math.log1p(m.laplacianVariance) - Math.log1p(previous.laplacianVariance)) / config.sharpnessLogChangeThreshold],
        ["motion_change", currentFlow === null || previousFlow === null ? 0 : Math.abs(currentFlow - previousFlow) / config.motionChangeThreshold],
      ];
      return { id: frame.sample.sampleId, score: Math.max(...signals.map((s) => s[1])), reasons: signals.filter((s) => s[1] >= 1).map((s) => s[0]) };
    });
    changes.forEach((change, i) => {
      // A plateau contributes its first peak, rather than every frame in a moving take.
      if (change.score >= 1 && change.score > (changes[i - 1]?.score ?? -1) && change.score >= (changes[i + 1]?.score ?? -1)) for (const reason of change.reasons) add(change.id, reason, change.score);
    });
  }
  const selected = new Set(mandatory);
  function distanceToSelected(id: string): number {
    const sample = positions.get(id)!;
    const sameShot = [...selected].map((key) => positions.get(key)!).filter((s) => s.shotId === sample.shotId);
    return Math.min(...sameShot.map((s) => Math.abs(s.atSeconds - sample.atSeconds)));
  }
  function fillCoverage(limit: number): void {
    while (selected.size < limit) {
      const next = [...coverage].filter((id) => !selected.has(id)).sort((a, b) => distanceToSelected(b) - distanceToSelected(a) || positions.get(a)!.atSeconds - positions.get(b)!.atSeconds)[0];
      if (next === undefined) break;
      selected.add(next);
    }
  }
  fillCoverage(Math.max(mandatory.size, Math.ceil(config.maximumFrames / 2)));
  const events = [...requested.values()].filter((s) => s.noveltyScore >= 1).sort((a, b) => b.noveltyScore - a.noveltyScore || positions.get(a.sampleId)!.atSeconds - positions.get(b.sampleId)!.atSeconds);
  for (const event of events) {
    if (selected.size >= config.maximumFrames) break;
    if (distanceToSelected(event.sampleId) >= config.minimumEventSeparationSeconds) selected.add(event.sampleId);
  }
  fillCoverage(config.maximumFrames);
  const selection = [...selected].sort((a, b) => positions.get(a)!.atSeconds - positions.get(b)!.atSeconds).map((id) => requested.get(id)!);
  return { selection, semanticSamplesRequested: requested.size, semanticSamplesSelected: selection.length,
    reducedCoverage: [...coverage].some((id) => !selected.has(id)), budgetLimited: requested.size > config.maximumFrames,
    configurationId: contentId("selection", config) };
}
