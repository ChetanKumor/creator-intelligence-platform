import { z } from "zod";
import { ensure, identify, missing } from "../editorial/common.js";
import { BoundaryAuthoritySchema, BoundaryBodySchema, BoundarySampleSchema, BoundarySetBodySchema, PlanningBoundarySchema, PlanningBoundarySetSchema,
  header, type PlanningBoundary, type PlanningBoundarySet } from "./common.js";
import { candidateBinding, groundedCandidate, type PlanningInputs } from "./context.js";

/** Only candidate endpoints and actual supplied sample PTS enter the proposal domain. */
export function propose(input: PlanningInputs, candidateId: string): PlanningBoundarySet {
  const binding = candidateBinding(input, candidateId), token = input.tokens.get(candidateId)!, analysis = input.analyses.get(candidateId)!;
  const grounded = groundedCandidate(input, candidateId);
  const base = { ...header("PlanningBoundarySet"), contextSnapshot: input.contextRef, policy: input.context.policy, ...binding, coverage: "bounded_proposals_only" as const };
  if (!grounded) return PlanningBoundarySetSchema.parse(identify("planning_boundary_set_v0", "boundarySetId", BoundarySetBodySchema.parse({ ...base,
    options: [], missing: [missing("unavailable", "world_support_unavailable")], evidencePointsAvailable: 0, evidencePointsUsed: 0, truncated: false })));
  const range = token.candidate.sourceRange, source = token.analysis.artifact;
  const candidateIndex = analysis.candidates.findIndex(c => c.candidate.candidateId === candidateId);
  const shotIndex = analysis.shots.findIndex(s => s.shotId === token.candidate.shotId), shot = analysis.shots[shotIndex];
  ensure(candidateIndex >= 0 && shot && range.startSeconds >= shot.startSeconds && range.endSeconds <= shot.endSeconds, "Boundary candidate exceeds trusted source shot.");
  const at = (pointer: string) => ({ artifact: source, pointer });
  const sampleByTime = new Map<number, z.infer<typeof BoundarySampleSchema>>();
  const recordSample = (sample: { sampleId: string; frameIndex: number; atSeconds: number; shotId: string }, frameHash: string, pointer: string) => {
    if (sample.shotId !== token.candidate.shotId || sample.atSeconds < range.startSeconds || sample.atSeconds > range.endSeconds) return;
    ensure(analysis.metadata.frameTimes[sample.frameIndex] === sample.atSeconds, "Sample boundary does not match actual source PTS.");
    if (!sampleByTime.has(sample.atSeconds)) sampleByTime.set(sample.atSeconds, { sampleId: sample.sampleId, frameIndex: sample.frameIndex, atSeconds: sample.atSeconds, frameHash, evidence: at(pointer) });
  };
  analysis.cheapFeatures.forEach((f, i) => recordSample(f.sample, f.frameContentHash, `/cheapFeatures/${i}`));
  analysis.semanticFrames.forEach((f, i) => recordSample(f, f.frameContentHash, `/semanticFrames/${i}`));
  const interior = [...sampleByTime.keys()].filter(t => t > range.startSeconds && t < range.endSeconds).sort((a, b) => a - b);
  const points = [range.startSeconds, ...interior.slice(0, input.policy.boundary.maxEvidencePoints - 2), range.endSeconds];
  const authority = (seconds: number): z.infer<typeof BoundaryAuthoritySchema> => {
    const frameIndex = analysis.metadata.frameTimes.indexOf(seconds);
    if (frameIndex >= 0) return { kind: "frame_pts", frameIndex, evidence: at(`/metadata/frameTimes/${frameIndex}`) };
    ensure(seconds === range.startSeconds || seconds === range.endSeconds, "No source authority for proposed boundary.");
    return { kind: "candidate_endpoint", evidence: at(`/candidates/${candidateIndex}/candidate/sourceRange/${seconds === range.startSeconds ? "startSeconds" : "endSeconds"}`) };
  };
  const options: PlanningBoundary[] = [];
  const append = (startSeconds: number, endSeconds: number, generation: "candidate_full_range" | "sample_pts_pair") => {
    ensure(endSeconds > startSeconds && startSeconds >= range.startSeconds && endSeconds <= range.endSeconds
      && startSeconds >= grounded.support.range.startSeconds && endSeconds <= grounded.support.range.endSeconds, "Boundary exceeds candidate or grounded support.");
    const startAuthority = authority(startSeconds), endAuthority = authority(endSeconds);
    const precision = startAuthority.kind === "frame_pts" && endAuthority.kind === "frame_pts" ? "frame_pts_exact" : "source_seconds";
    const body = BoundaryBodySchema.parse({ ...header("PlanningBoundary"), contextSnapshot: input.contextRef, policy: input.context.policy, ...binding,
      assetId: token.candidate.assetId, sourceHash: token.sourceHash, analysis: source, support: grounded.support,
      supportEvidence: { artifact: input.context.worldView, pointer: `/returned/${grounded.entityIndex}/support/value` },
      candidateRangeEvidence: at(`/candidates/${candidateIndex}/candidate/sourceRange`), shotEvidence: at(`/shots/${shotIndex}`),
      sourceRange: { startSeconds, endSeconds }, startAuthority, endAuthority, timebase: at("/metadata/frameTimes"), precision,
      sampleEvidence: [sampleByTime.get(startSeconds), sampleByTime.get(endSeconds)].filter((v): v is z.infer<typeof BoundarySampleSchema> => v !== undefined),
      uncertainty: missing("unavailable", precision === "frame_pts_exact" ? "editorial_boundary_merit_unverified" : "frame_exact_endpoints_unavailable"), generation });
    options.push(PlanningBoundarySchema.parse(identify("planning_boundary_v0", "boundaryId", body)));
  };
  append(range.startSeconds, range.endSeconds, "candidate_full_range");
  outer: for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (i === 0 && j === points.length - 1) continue;
    if (options.length >= input.policy.boundary.maxOptionsPerCandidate) break outer;
    append(points[i]!, points[j]!, "sample_pts_pair");
  }
  return PlanningBoundarySetSchema.parse(identify("planning_boundary_set_v0", "boundarySetId", BoundarySetBodySchema.parse({ ...base, options, missing: [],
    evidencePointsAvailable: interior.length + 2,
    evidencePointsUsed: new Set(options.flatMap(option => [option.sourceRange.startSeconds, option.sourceRange.endSeconds])).size,
    truncated: interior.length + 2 > points.length || options.length < points.length * (points.length - 1) / 2 })));
}
