import { contentId, validateTimeline } from "../reference-analyzer/features.js";
import type { Shot } from "../reference-analyzer/protocol.js";
import { allocateBudget } from "./lattice.js";
import { CandidateSchema, CoverageSchema, ProposalConfigSchema, type Candidate, type CheapEvidence, type FootageConfig } from "./protocol.js";

export function coveredDuration(ranges: readonly { startSeconds: number; endSeconds: number }[]): number {
  const sorted = [...ranges].sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);
  let end = 0, total = 0;
  for (const range of sorted) { total += Math.max(0, range.endSeconds - Math.max(end, range.startSeconds)); end = Math.max(end, range.endSeconds); }
  return total;
}
export function candidateCoverage(candidates: readonly Candidate[], shots: readonly Shot[], durationSeconds: number) {
  const sorted = candidates.map((c) => c.sourceRange).sort((a, b) => a.startSeconds - b.startSeconds);
  let end = 0, gap = 0;
  for (const range of sorted) { gap = Math.max(gap, range.startSeconds - end); end = Math.max(end, range.endSeconds); }
  const coveredSeconds = coveredDuration(sorted);
  return CoverageSchema.parse({ durationSeconds, coveredSeconds, temporalCoverage: durationSeconds ? Math.min(1, coveredSeconds / durationSeconds) : 0, maximumGapSeconds: Math.max(gap, durationSeconds - end), representedShots: new Set(candidates.map((c) => c.shotId)).size, sourceShots: shots.length });
}
export function temporalIoU(a: Candidate["sourceRange"], b: Candidate["sourceRange"]): number {
  const intersection = Math.max(0, Math.min(a.endSeconds, b.endSeconds) - Math.max(a.startSeconds, b.startSeconds));
  return intersection / (a.endSeconds - a.startSeconds + b.endSeconds - b.startSeconds - intersection);
}

export class CandidateSegmentProposer {
  propose(assetId: string, shots: readonly Shot[], features: readonly CheapEvidence[], configInput: FootageConfig["proposal"], projectAllocation: number) {
    const config = ProposalConfigSchema.parse(configInput), duration = shots.at(-1)?.endSeconds ?? 0;
    validateTimeline(shots, duration);
    if (!Number.isSafeInteger(projectAllocation) || projectAllocation < 0 || projectAllocation > config.maximumPerProject) throw new Error("Invalid project candidate allocation.");
    const proposalConfigurationId = contentId("proposal", [config, features.map((f) => f.measurementId)]);
    const scales = shots.map((shot) => {
      const length = shot.endSeconds - shot.startSeconds;
      const eligible = config.durationsSeconds.filter((d) => d <= length);
      return eligible.length ? eligible : [length];
    });
    const requested = shots.map((shot, i) => scales[i]!.map((d) => Math.floor((shot.endSeconds - shot.startSeconds - d + 1e-9) / (d * config.strideFraction)) + 1));
    const allocation = allocateBudget(shots.map((s) => s.endSeconds - s.startSeconds), requested.map((r) => Math.min(config.maximumPerShot, r.reduce((a, b) => a + b, 0))), Math.min(config.maximumPerAsset, projectAllocation));
    const candidates = new Map<string, Candidate>();
    shots.forEach((shot, i) => {
      const perScale = allocateBudget(scales[i]!.map(() => 1), requested[i]!, allocation[i]!);
      const longest = perScale.length - 1;
      // Coverage takes precedence over an equal duration mix on long sources.
      // Keep a slot for every feasible duration, then transfer spare short-window
      // slots to the longest duration until union coverage is possible or capped.
      if (allocation[i]! < perScale.length) {
        perScale.fill(0);
        for (let k = 0; k < allocation[i]!; k++) perScale[longest - k] = 1;
      }
      const coverageTarget = Math.min(Math.ceil((shot.endSeconds - shot.startSeconds) / scales[i]![longest]!), Math.max(0, allocation[i]! - Math.min(perScale.length - 1, Math.max(0, allocation[i]! - 1))));
      while (perScale[longest]! < coverageTarget) {
        let donor = -1;
        for (let k = 0; k < longest; k++) if (perScale[k]! > 1 && (donor < 0 || perScale[k]! > perScale[donor]!)) donor = k;
        if (donor < 0) break;
        perScale[donor]!--; perScale[longest]!++;
      }
      scales[i]!.forEach((length, j) => {
        const count = perScale[j]!;
        if (!count) return;
        const span = Math.max(0, shot.endSeconds - shot.startSeconds - length);
        // Where the budget permits, any same-duration window has an anchor within
        // duration/3 (IoU >= 0.5). Event anchors use only the remaining slots.
        const minimumCoverageCount = span > 0 ? Math.ceil(span / (length * 2 / 3)) + 1 : 1;
        const coverageCount = Math.min(count, Math.max(minimumCoverageCount, Math.ceil(count * 0.75)));
        const anchors = Array.from({ length: coverageCount }, (_, k) => shot.startSeconds + (coverageCount === 1 ? span / 2 : span * k / (coverageCount - 1)));
        const peaks = features.filter((f) => f.sample.shotId === shot.shotId && (f.measurement.frameDifferenceMean ?? 0) > 0).sort((a, b) => (b.measurement.frameDifferenceMean ?? 0) - (a.measurement.frameDifferenceMean ?? 0) || a.sample.atSeconds - b.sample.atSeconds);
        for (const peak of peaks) {
          if (anchors.length >= count) break;
          const at = Math.max(shot.startSeconds, Math.min(shot.startSeconds + span, peak.sample.atSeconds - length / 2));
          if (anchors.every((old) => Math.abs(old - at) > Math.min(length * config.strideFraction / 2, 0.25))) anchors.push(at);
        }
        // Fill unused peak slots by repeatedly bisecting the largest temporal gap.
        while (anchors.length < count && span > 1e-9) {
          const ordered = [...anchors].sort((a, b) => a - b);
          let left = shot.startSeconds, right = shot.startSeconds, gap = -1;
          for (let k = 1; k < ordered.length; k++) if (ordered[k]! - ordered[k - 1]! > gap) { left = ordered[k - 1]!; right = ordered[k]!; gap = right - left; }
          if (gap <= 1e-6) break;
          anchors.push((left + right) / 2);
        }
        for (const anchor of anchors) {
          const startSeconds = Math.max(shot.startSeconds, Math.min(shot.endSeconds - length, Math.round(anchor * 1e6) / 1e6));
          const sourceRange = { startSeconds, endSeconds: Math.min(shot.endSeconds, startSeconds + length) };
          const candidateId = contentId("segment", [assetId, shot.shotId, sourceRange, proposalConfigurationId]);
          candidates.set(candidateId, CandidateSchema.parse({ candidateId, assetId, shotId: shot.shotId, sourceRange, proposalConfigurationId, proposalVersion: config.version }));
        }
      });
    });
    const proposed = [...candidates.values()].sort((a, b) => a.sourceRange.startSeconds - b.sourceRange.startSeconds || a.sourceRange.endSeconds - b.sourceRange.endSeconds);
    if (proposed.length > config.maximumPerAsset || proposed.length > projectAllocation || shots.some((s) => proposed.filter((c) => c.shotId === s.shotId).length > config.maximumPerShot)) throw new Error("Candidate proposal exceeded its hard budget.");
    return { candidates: proposed, requestedWithoutCaps: requested.flat().reduce((a, b) => a + b, 0), coverage: candidateCoverage(proposed, shots, duration), proposalConfigurationId };
  }
}
