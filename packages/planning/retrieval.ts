import { z } from "zod";
import { ensure, identify, missing, present } from "../editorial/common.js";
import { NumericSignalsSchema } from "../footage-analyzer/protocol.js";
import { FeatureEvidenceSchema, PlanningRetrievalSchema, RetrievalBodySchema, header, type PlanningRetrieval } from "./common.js";
import { groundedCandidate, type PlanningInputs } from "./context.js";

export function candidateFeatures(input: PlanningInputs, candidateId: string): z.infer<typeof FeatureEvidenceSchema>[] {
  const token = input.tokens.get(candidateId)!;
  return (["sharpnessIndicator", "unclippedPixelFraction", "stabilityIndicator"] as const).map(name => {
    const cheap = token.cheap.data;
    if (cheap.state !== "present") return { name, value: cheap, evidenceRefs: cheap.evidenceRefs, locality: "unavailable" as const, extent: "candidate_snapshot_not_trim_recomputed" as const };
    const signals = NumericSignalsSchema.parse(input.map.resolve(cheap.value.signals));
    const value = signals[name];
    const evidenceRefs = [{ artifact: cheap.value.signals.artifact, pointer: `${cheap.value.signals.pointer}/${name}` }];
    const absent = cheap.value.missingSignals.find(s => s.signal === name);
    return { name, value: value === null ? (absent ? { state: absent.state, reasonCode: absent.reasonCode, evidenceRefs: absent.evidenceRefs } : missing("unavailable", "legacy_reason_unknown", evidenceRefs)) : present(value),
      evidenceRefs, locality: cheap.value.support, extent: "candidate_snapshot_not_trim_recomputed" as const };
  });
}

/** Relevance is the exact Director candidate link plus accessible grounded support; no inferred semantic score. */
export function retrieve(input: PlanningInputs, directionNodeId: string): PlanningRetrieval {
  const node = input.direction.nodes.find(n => n.nodeId === directionNodeId);
  ensure(node, "Unknown direction node.");
  let included = 0;
  const entries = input.context.candidates.map(binding => {
    const grounded = groundedCandidate(input, binding.candidateId);
    const relevant = node.candidates.some(c => c.candidateId === binding.candidateId);
    const inScope = node.scope.kind === "whole_edit" || node.scope.candidate.candidateId === binding.candidateId;
    const reason = !relevant ? "not_bound_to_direction" as const : !inScope ? "outside_direction_scope" as const : !grounded ? "world_support_unavailable" as const
      : included >= input.policy.retrieval.maxCandidatesPerNode ? "retrieval_limit" as const : "exact_direction_binding" as const;
    if (reason === "exact_direction_binding") included++;
    const token = input.tokens.get(binding.candidateId)!;
    const evidenceRefs = [token.candidateEvidence, { artifact: input.context.worldSnapshot, pointer: "/candidateLinks" },
      ...(grounded ? [{ artifact: input.context.worldView, pointer: `/returned/${grounded.entityIndex}/support` }] : []),
      ...node.evidenceRefs];
    const unique = new Map(evidenceRefs.map(e => [JSON.stringify(e), e]));
    return { ...binding, directionNodeId, requirementIds: node.requirementIds, included: reason === "exact_direction_binding", reason,
      evidenceRefs: [...unique.values()], features: candidateFeatures(input, binding.candidateId), missingSemanticPrediction: missing("not_computed", "phase4_prediction_not_supplied") };
  });
  return PlanningRetrievalSchema.parse(identify("planning_retrieval_v0", "retrievalId", RetrievalBodySchema.parse({ ...header("PlanningRetrieval"), contextSnapshot: input.contextRef,
    scope: input.context.scope, policy: input.context.policy, directionNodeId, candidateUniverse: input.context.candidateUniverse, entries,
    completeness: "exact_supplied_universe_accounted", relevanceMeaning: "explicit_direction_link_not_quality" })));
}
