import { z } from "zod";
import { canonicalSerialize } from "../domain/serialization.js";
import { compareText, equal, identify, missing, present, type EvidenceRef } from "../editorial/common.js";
import { contentId } from "../reference-analyzer/features.js";
import { ComponentSchema, ConstraintCheckSchema, DeferredObligationsSchema, PlanningSequenceSchema, SequenceBodySchema, header, type PlanningBoundary, type PlanningSequence, type PlanningUse } from "./common.js";
import { type PlanningInputs } from "./context.js";
import { candidateFeatures } from "./retrieval.js";

const uniqueEvidence = (refs: EvidenceRef[]) => [...new Map(refs.map(ref => [canonicalSerialize(ref), ref])).values()];
type DirectionNode = PlanningInputs["direction"]["nodes"][number];
const hasSourceBinding = (node: DirectionNode) => node.candidates.length > 0;
function deferredReason(node: DirectionNode): "no_source_binding" | "operation_intention" | undefined {
  // Only accepted typed intentions are classified. Prose and source availability never determine ownership.
  if (["transition_intention", "sound_design_intention", "graphics_intention", "color_intention", "technique_intention", "music_relationship"].includes(node.intent.kind)) {
    return hasSourceBinding(node) ? "operation_intention" : "no_source_binding";
  }
  return undefined;
}
const needsSourceBinding = (node: DirectionNode) => hasSourceBinding(node) || deferredReason(node) === undefined;
const hardSourceObligation = (input: PlanningInputs, node: DirectionNode) => node.priority === "hard"
  || input.direction.constraints.some(c => c.nodeId === node.nodeId && c.priority === "hard" && c.stance === "include");
function requirementNodes(input: PlanningInputs, requirementId: string): DirectionNode[] {
  return input.direction.nodes.filter(node => node.requirementIds.includes(requirementId)
    || input.direction.constraints.some(c => c.subjectId === requirementId && c.nodeId === node.nodeId));
}
function onlyDeferredExclusion(input: PlanningInputs, requirementId: string): boolean {
  const nodes = requirementNodes(input, requirementId);
  return nodes.length > 0 && nodes.every(node => !hasSourceBinding(node) && deferredReason(node) !== undefined);
}
export function deferredObligations(input: PlanningInputs): z.infer<typeof DeferredObligationsSchema> {
  return DeferredObligationsSchema.parse(input.direction.nodes.flatMap((node, index) => {
    const reasonCode = deferredReason(node);
    return reasonCode ? [{ nodeId: node.nodeId, priority: node.priority,
      requirementIds: [...new Set([...node.requirementIds, ...input.direction.constraints.filter(c => c.nodeId === node.nodeId).map(c => c.subjectId)])],
      directionNode: { artifact: input.context.direction, pointer: `/nodes/${index}` }, reasonCode, state: "deferred",
      capabilityAssessment: "not_performed", executionAssessment: "deferred" }] : [];
  }));
}
export function missingRequiredContext(input: PlanningInputs, noFeasibleSequence: boolean): boolean {
  const branchNodes = new Set(input.direction.alternatives.flatMap(b => b.choices.flatMap(c => c.nodeIds)));
  return input.direction.unresolvedRequirements.some(f => f.severity === "blocking")
    // Empty searches still bind the exact missing source obligation through context/direction lineage.
    // An unselected alternative must not block an otherwise feasible source choice.
    || input.direction.nodes.some(n => !hasSourceBinding(n) && needsSourceBinding(n)
      && hardSourceObligation(input, n)
      && (noFeasibleSequence || !branchNodes.has(n.nodeId)))
    || noFeasibleSequence && input.direction.edges.some(edge => {
      if (edge.type !== "requires") return false;
      const from = input.direction.nodes.find(n => n.nodeId === edge.from)!, to = input.direction.nodes.find(n => n.nodeId === edge.to)!;
      return hardSourceObligation(input, from) && !hasSourceBinding(to) && needsSourceBinding(to);
    })
    || input.intent.mustExclude.some(r => r.priority === "hard" && !onlyDeferredExclusion(input, r.requirementId))
    || input.direction.constraints.some(c => c.priority === "hard" && c.stance === "exclude"
      && (hasSourceBinding(input.direction.nodes.find(n => n.nodeId === c.nodeId)!) || deferredReason(input.direction.nodes.find(n => n.nodeId === c.nodeId)!) === undefined));
}

export function extendSequence(input: PlanningInputs, parent: PlanningSequence | null, boundary: PlanningBoundary, directionNodeId: string): PlanningSequence {
  const previous = parent?.uses.at(-1) ?? input.preceding.at(-1);
  const use: PlanningUse = { useId: contentId("planning_use_v0", { context: input.contextRef, parent: parent?.optionId ?? null,
    position: parent?.uses.length ?? 0, boundary: boundary.boundaryId, directionNodeId }), candidateId: boundary.candidateId, token: boundary.token, boundary,
    directionNodeId, durationSeconds: boundary.sourceRange.endSeconds - boundary.sourceRange.startSeconds,
    precedingUseId: previous ? present(previous.useId) : missing("not_applicable", "first_occurrence") };
  const uses = [...(parent?.uses ?? []), use], covered = new Set(uses.map(u => u.directionNodeId));
  // An operation's target may already be selected for a source/story purpose. It does not require a duplicate occurrence.
  const sourceCovered = (node: DirectionNode) => deferredReason(node) === "operation_intention"
    ? uses.some(u => node.candidates.some(c => c.candidateId === u.candidateId && equal(c.token, u.token))
      && (node.scope.kind === "whole_edit" || node.scope.candidate.candidateId === u.candidateId))
    : covered.has(node.nodeId);
  const durationSeconds = uses.reduce((sum, u) => sum + u.durationSeconds, 0);
  const allUses = [...input.preceding, ...uses], counts = new Map<string, number>();
  for (const u of allUses) counts.set(u.candidateId, (counts.get(u.candidateId) ?? 0) + 1);
  const hardConstraints: z.infer<typeof ConstraintCheckSchema>[] = [], softFindings: z.infer<typeof ConstraintCheckSchema>[] = [];
  const check = (key: string, state: z.infer<typeof ConstraintCheckSchema>["state"], reasonCode: string, evidenceRefs: EvidenceRef[], extensionBlocking = false, soft = false) => {
    (soft ? softFindings : hardConstraints).push({ checkId: contentId("planning_check_v0", key), state, reasonCode, evidenceRefs, extensionBlocking });
  };
  const policyEvidence = (pointer: string): EvidenceRef[] => [{ artifact: input.context.policy, pointer }];
  const directionEvidence = (pointer: string): EvidenceRef[] => [{ artifact: input.context.direction, pointer }];
  check("duration_min", durationSeconds >= input.policy.duration.minimumSeconds ? "pass" : "pending", "duration_minimum", policyEvidence("/duration"));
  check("duration_max", durationSeconds <= input.policy.duration.maximumSeconds ? "pass" : "fail", "duration_above_maximum", policyEvidence("/duration"), durationSeconds > input.policy.duration.maximumSeconds);
  uses.forEach((u, i) => {
    const valid = u.durationSeconds >= input.policy.trim.minimumSeconds && u.durationSeconds <= input.policy.trim.maximumSeconds;
    check(`trim_${i}`, valid ? "pass" : "fail", "trim_duration_out_of_bounds", policyEvidence("/trim"), !valid);
  });
  for (const [id, count] of counts) check(`reuse_${id}`, count <= input.policy.reuse.maximumUsesPerCandidate ? "pass" : "fail", "candidate_reuse_bound", policyEvidence("/reuse"), count > input.policy.reuse.maximumUsesPerCandidate);
  const inactiveNodes = new Set<string>(), branchNodes = new Set(input.direction.alternatives.flatMap(b => b.choices.flatMap(c => c.nodeIds)));
  input.direction.alternatives.forEach((branch, index) => {
    const selected = branch.choices.filter(c => c.nodeIds.some(id => covered.has(id)));
    const sourceIds = (ids: string[]) => ids.filter(id => needsSourceBinding(input.direction.nodes.find(n => n.nodeId === id)!));
    const required = branch.choices.some(c => sourceIds(c.nodeIds).some(id => hardSourceObligation(input, input.direction.nodes.find(n => n.nodeId === id)!)));
    const laterChoice = branch.choices.some(c => sourceIds(c.nodeIds).length === 0);
    const selectedDeferred = selected.length === 1 && selected[0]!.nodeIds.some(id => deferredReason(input.direction.nodes.find(n => n.nodeId === id)!) !== undefined);
    const state = selected.length > 1 ? "fail" : selected.length === 1 ? (sourceIds(selected[0]!.nodeIds).every(id => sourceCovered(input.direction.nodes.find(n => n.nodeId === id)!)) ? selectedDeferred ? "deferred" : "pass" : "pending")
      : required ? "pending" : laterChoice ? "deferred" : "pass";
    check(`branch_${branch.branchId}`, state, "mutually_exclusive_complete_branch", directionEvidence(`/alternatives/${index}`), state === "fail");
    // No chosen source branch does not authorize silently excluding every branch's source obligations.
    if (selected.length) for (const choice of branch.choices) if (!selected.includes(choice)) for (const id of choice.nodeIds) inactiveNodes.add(id);
  });
  const applicable = (nodeId: string) => !branchNodes.has(nodeId) || !inactiveNodes.has(nodeId);
  input.direction.nodes.forEach((node, index) => {
    if (applicable(node.nodeId)) {
      if (hasSourceBinding(node)) check(`source_binding_${node.nodeId}`, sourceCovered(node) ? "pass" : "pending",
        deferredReason(node) ? "structural_source_binding_coverage" : "structural_direction_coverage", directionEvidence(`/nodes/${index}`), false, node.priority === "soft");
      else if (needsSourceBinding(node)) check(`source_binding_${node.nodeId}`, "unknown", "source_binding_unavailable",
        directionEvidence(`/nodes/${index}`), false, node.priority === "soft");
      if (deferredReason(node)) check(`node_${node.nodeId}`, "deferred", "later_gate_obligation", directionEvidence(`/nodes/${index}`), false, node.priority === "soft");
    }
  });
  const requirements = [...input.intent.outputRequirements, ...input.intent.mustInclude];
  let hardCovered = 0;
  requirements.forEach(req => {
    const nodes = input.direction.nodes.filter(n => n.requirementIds.includes(req.requirementId) && (req.priority === "soft" || n.priority === "hard"));
    const sourceNodes = nodes.filter(n => needsSourceBinding(n) && (!branchNodes.has(n.nodeId) || !inactiveNodes.has(n.nodeId)));
    const deferred = nodes.some(n => deferredReason(n) !== undefined);
    const coveredSource = sourceNodes.some(sourceCovered);
    const missingSource = !coveredSource && sourceNodes.some(n => !hasSourceBinding(n));
    if (coveredSource && !deferred && req.priority === "hard") hardCovered++;
    if (sourceNodes.length || !deferred) check(`requirement_source_${req.requirementId}`, coveredSource ? "pass" : missingSource ? "unknown" : "pending",
      missingSource ? "source_binding_unavailable" : "structural_requirement_coverage", directionEvidence("/nodes"), false, req.priority === "soft");
    if (deferred) check(`requirement_${req.requirementId}`, "deferred", "structural_requirement_coverage", directionEvidence("/nodes"), false, req.priority === "soft");
  });
  for (const req of input.intent.mustExclude) {
    const deferred = onlyDeferredExclusion(input, req.requirementId);
    check(`exclusion_${req.requirementId}`, deferred ? "deferred" : "unknown", deferred ? "later_gate_obligation" : "exclusion_evidence_unavailable", directionEvidence("/constraints"), false, req.priority === "soft");
  }
  input.direction.constraints.forEach((constraint, index) => {
    const node = input.direction.nodes.find(n => n.nodeId === constraint.nodeId)!;
    // Alternative include obligations follow the actual source choice; global exclusions remain enforced.
    if (constraint.stance === "include" && !applicable(node.nodeId)) return;
    const deferred = deferredReason(node) !== undefined && (!hasSourceBinding(node) || constraint.stance === "include");
    if (deferred && hasSourceBinding(node) && constraint.stance === "include") check(`constraint_source_${constraint.constraintId}`,
      sourceCovered(node) ? "pass" : "pending", "structural_source_binding_coverage", directionEvidence(`/constraints/${index}`), false, constraint.priority === "soft");
    const state = deferred ? "deferred" : constraint.stance === "exclude" || !hasSourceBinding(node) ? "unknown" : covered.has(constraint.nodeId) ? "pass" : "pending";
    check(`creative_constraint_${constraint.constraintId}`, state, deferred ? "later_gate_obligation" : constraint.stance === "exclude" ? "exclusion_evidence_unavailable" : !hasSourceBinding(node) ? "source_binding_unavailable" : "structural_constraint_coverage",
      directionEvidence(`/constraints/${index}`), false, constraint.priority === "soft");
  });
  input.direction.edges.forEach((edge, index) => {
    const fromNode = input.direction.nodes.find(n => n.nodeId === edge.from)!, toNode = input.direction.nodes.find(n => n.nodeId === edge.to)!;
    const deferred = deferredReason(fromNode) !== undefined || deferredReason(toNode) !== undefined;
    const from = uses.map((u, i) => u.directionNodeId === edge.from ? i : -1).filter(i => i >= 0);
    const to = uses.map((u, i) => u.directionNodeId === edge.to ? i : -1).filter(i => i >= 0);
    if (edge.type === "requires" && deferredReason(toNode) === undefined) {
      const required = from.length > 0 || deferredReason(fromNode) !== undefined && applicable(fromNode.nodeId) && hardSourceObligation(input, fromNode);
      const missingSource = required && !hasSourceBinding(toNode);
      check(`requires_${edge.edgeId}`, !required || to.length ? "pass" : missingSource ? "unknown" : "pending",
        missingSource ? "source_binding_unavailable" : "required_direction_dependency", directionEvidence(`/edges/${index}`));
      if (!deferred) return;
    }
    if (deferred && edge.type !== "alternative_to") {
      check(`edge_${edge.edgeId}`, "deferred", "later_gate_relationship", directionEvidence(`/edges/${index}`), false, !["intended_order", "requires"].includes(edge.type));
      return;
    }
    if (edge.type === "intended_order") {
      const valid = !from.length || !to.length || from.at(-1)! < to[0]!;
      check(`order_${edge.edgeId}`, valid ? "pass" : "fail", "intended_order", directionEvidence(`/edges/${index}`), !valid);
    } else if (edge.type !== "alternative_to") {
      check(`relation_${edge.edgeId}`, "unknown", "creative_relationship_not_measured", directionEvidence(`/edges/${index}`), false, true);
    }
  });
  input.direction.unresolvedRequirements.forEach((finding, index) => check(`finding_${finding.findingId}`, "unknown", finding.code,
    directionEvidence(`/unresolvedRequirements/${index}`), false, finding.severity !== "blocking"));
  const components: z.infer<typeof ComponentSchema>[] = input.policy.objectives.map((objective, index) => {
    let value: z.infer<typeof ComponentSchema>["value"];
    let evidenceRefs = policyEvidence(`/objectives/${index}`);
    if (objective.name === "direction_coverage") { value = present(covered.size); evidenceRefs.push(...directionEvidence("/nodes")); }
    else if (objective.name === "hard_requirement_coverage") { value = present(hardCovered); evidenceRefs.push(...directionEvidence("/nodes")); }
    else if (objective.name === "duration_deviation") value = present(Math.abs(durationSeconds - input.policy.duration.preferredSeconds));
    else if (objective.name === "repetition_count") value = present(allUses.length - counts.size);
    else {
      const name = objective.name === "mean_sharpness" ? "sharpnessIndicator" : objective.name === "mean_unclipped_pixels" ? "unclippedPixelFraction" : "stabilityIndicator";
      const features = uses.map(u => candidateFeatures(input, u.candidateId).find(f => f.name === name)!);
      evidenceRefs = uniqueEvidence([...evidenceRefs, ...features.flatMap(f => f.evidenceRefs)]);
      const absent = features.filter(f => f.value.state !== "present");
      if (absent.length) value = missing("unavailable", "objective_candidate_evidence_missing", uniqueEvidence(absent.flatMap(f => f.evidenceRefs)));
      else value = present(features.reduce((sum, f) => sum + (f.value.state === "present" ? f.value.value : NaN), 0) / features.length);
    }
    return { name: objective.name, value, evidenceRefs, meaning: "declared_objective_not_confidence" as const };
  });
  const body = SequenceBodySchema.parse({ ...header("PlanningSequenceOption"), contextSnapshot: input.contextRef, uses, precedingUses: input.context.precedingUses,
    durationSeconds, coveredNodeIds: [...covered], candidateReuseCounts: [...counts].sort((a, b) => compareText(a[0], b[0])).map(([candidateId, count]) => ({ candidateId, count })),
    components, hardConstraints, softFindings, deferredObligations: deferredObligations(input), durationMeaning: "sum_of_selected_source_durations_no_output_time_mapping" });
  return PlanningSequenceSchema.parse(identify("planning_sequence_v0", "optionId", body));
}

/** Exact lexicographic order is transitive. Epsilon is used only for final comparisons against the exact best option. */
export function compareOptions(input: PlanningInputs, a: PlanningSequence, b: PlanningSequence): number {
  for (const [i, objective] of input.policy.objectives.entries()) {
    const av = a.components[i]!.value, bv = b.components[i]!.value;
    // This is an explicit frontier ordering rule, never zero imputation or final preference over unknown evidence.
    if (av.state !== "present" || bv.state !== "present") {
      if (av.state === "present") return -1;
      if (bv.state === "present") return 1;
      continue;
    }
    const sign = objective.preference === "higher" ? -1 : 1;
    if (av.value !== bv.value) return (av.value < bv.value ? -1 : 1) * sign;
  }
  return compareText(a.optionId, b.optionId);
}
export function tied(input: PlanningInputs, a: PlanningSequence, b: PlanningSequence): boolean {
  return a.components.every((component, i) => {
    const other = b.components[i]!.value;
    return component.value.state === "present" && other.state === "present" && Math.abs(component.value.value - other.value) <= input.policy.tie.epsilon;
  });
}
