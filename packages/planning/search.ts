import { z } from "zod";
import { identify } from "../editorial/common.js";
import { ManifestBodySchema, ManifestEntrySchema, PlanningAlternativesSchema, header,
  type PlanningBoundarySet, type PlanningOutcome, type PlanningRetrieval, type PlanningSequence, type PlanningSearchRun } from "./common.js";
import { type PlanningInputs } from "./context.js";
import { compareOptions, deferredObligations, extendSequence, missingRequiredContext, tied } from "./scoring.js";

type Entry = z.infer<typeof ManifestEntrySchema>;
function immediateReason(input: PlanningInputs, option: PlanningSequence): Entry["expansionReason"] {
  const blocking = option.hardConstraints.find(c => c.extensionBlocking && c.state === "fail");
  if (blocking) return blocking.reasonCode === "candidate_reuse_bound" ? "candidate_reuse_bound"
    : ["duration_above_maximum", "trim_duration_out_of_bounds"].includes(blocking.reasonCode) ? "duration_bound" : "hard_constraint";
  if (option.components.some((c, i) => c.value.state !== "present" && input.policy.objectives[i]!.missing === "block")) return "incomplete_required_evidence";
  return null;
}
function selectionReason(input: PlanningInputs, option: PlanningSequence): Entry["selectionReason"] {
  const immediate = immediateReason(input, option);
  if (immediate) return immediate;
  if (option.hardConstraints.some(c => c.state === "unknown")) return "incomplete_required_evidence";
  if (option.hardConstraints.some(c => c.state === "fail")) return "hard_constraint";
  if (option.hardConstraints.some(c => c.state === "pending")) return "incomplete_sequence";
  return null;
}

/** Bounds count every generated successor, including rejected successors. No ungenerated option enters the manifest. */
export function search(input: PlanningInputs, retrievals: PlanningRetrieval[], boundaries: PlanningBoundarySet[]) {
  const orderedRetrievals = [...retrievals];
  if (input.policy.seed.ordering === "reverse_canonical_ids") orderedRetrievals.reverse();
  const byCandidate = new Map(boundaries.map(b => [b.candidateId, b]));
  function* actions() {
    for (const retrieval of orderedRetrievals) {
      const candidates = retrieval.entries.filter(e => e.included);
      if (input.policy.seed.ordering === "reverse_canonical_ids") candidates.reverse();
      for (const candidate of candidates) {
        const options = [...byCandidate.get(candidate.candidateId)!.options];
        if (input.policy.seed.ordering === "reverse_canonical_ids") options.reverse();
        for (const boundary of options) yield { boundary, nodeId: retrieval.directionNodeId };
      }
    }
  }
  const entries: Entry[] = [];
  let frontier: (Entry | null)[] = [null], stoppingReason: PlanningSearchRun["stoppingReason"] = "empty_frontier", maximumDepthReached = 0;
  let hitLimit = false;
  for (let depth = 1; depth <= input.policy.search.maximumDepth; depth++) {
    const next: Entry[] = [];
    for (const parent of frontier) {
      let expanded = false;
      for (const action of actions()) {
        if (entries.length >= input.policy.search.maximumExpandedStates) {
          hitLimit = true;
          if (parent) { parent.expansion = "stopped"; parent.expansionReason = "search_limit"; }
          break;
        }
        expanded = true;
        const option = extendSequence(input, parent?.option ?? null, action.boundary, action.nodeId);
        const reason = immediateReason(input, option), finalReason = selectionReason(input, option);
        const entry: Entry = { option, parentOptionId: parent?.option.optionId ?? null, ordinal: entries.length,
          expansion: reason ? "pruned" : "frontier", expansionReason: reason,
          selection: finalReason ? "pruned" : "retained", selectionReason: finalReason };
        entries.push(entry);
        maximumDepthReached = depth;
        if (!reason) next.push(entry);
      }
      if (parent && expanded && !hitLimit) { parent.expansion = "expanded"; parent.expansionReason = null; }
      if (hitLimit) break;
    }
    if (hitLimit) { stoppingReason = "expanded_state_limit"; break; }
    if (!next.length) { stoppingReason = "empty_frontier"; break; }
    if (depth === input.policy.search.maximumDepth) { stoppingReason = "maximum_depth"; break; }
    next.sort((a, b) => compareOptions(input, a.option, b.option));
    frontier = next.slice(0, input.policy.search.frontierWidth);
    for (const entry of next.slice(input.policy.search.frontierWidth)) { entry.expansion = "pruned"; entry.expansionReason = "frontier_limit"; }
  }
  // Every not-expanded generated state retains the actual reason expansion stopped.
  for (const entry of entries) if (entry.expansion === "frontier") {
    entry.expansion = "stopped";
    entry.expansionReason = hitLimit ? "search_limit" : "depth_bound";
  }
  const feasible = entries.filter(e => e.selection === "retained").sort((a, b) => compareOptions(input, a.option, b.option));
  const retained = feasible.slice(0, input.policy.search.maximumOptionsRetained);
  for (const entry of feasible.slice(input.policy.search.maximumOptionsRetained)) { entry.selection = "pruned"; entry.selectionReason = "options_limit"; }
  let outcome: PlanningOutcome;
  if (missingRequiredContext(input, feasible.length === 0)) outcome = { kind: "abstained", reasonCode: "required_evidence_missing" };
  else if (!feasible.length) outcome = entries.some(e => e.selectionReason === "incomplete_required_evidence")
    || retrievals.some(r => r.entries.some(e => e.reason === "world_support_unavailable"))
    ? { kind: "abstained", reasonCode: "required_evidence_missing" }
    : hitLimit ? { kind: "abstained", reasonCode: "search_limit" } : { kind: "infeasible", reasonCode: "no_feasible_considered_sequence" };
  else if (feasible.some(e => e.option.components.some(c => c.value.state !== "present"))) outcome = { kind: "abstained", reasonCode: "objective_evidence_missing" };
  else {
    const best = feasible[0]!.option;
    const ties = feasible.filter(e => tied(input, best, e.option)).map(e => e.option.optionId);
    if (ties.some(id => !retained.some(e => e.option.optionId === id))) outcome = { kind: "abstained", reasonCode: "tie_exceeds_retention_bound" };
    else outcome = ties.length === 1 ? { kind: "chosen", optionId: ties[0]! } : { kind: "tie", optionIds: ties.sort() };
  }
  const manifest = PlanningAlternativesSchema.parse(identify("planning_alternatives_v0", "manifestId", ManifestBodySchema.parse({ ...header("PlanningAlternatives"),
    contextSnapshot: input.contextRef, options: entries, retainedOptionIds: retained.map(e => e.option.optionId), manifestLimit: input.policy.search.manifestLimit,
    deferredObligations: deferredObligations(input),
    coverage: "actually_generated_only", globalOptimality: false, exhaustive: false })));
  return { manifest, outcome, stoppingReason, expandedStates: entries.length, maximumDepthReached };
}
