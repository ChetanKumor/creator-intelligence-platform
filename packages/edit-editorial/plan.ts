import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { ArtifactRefSchema, equal, type SuppliedArtifact } from "../editorial/common.js";
import { ScopeSchema, SourceRangeSchema } from "../edit-graph/common.js";
import { AnyGraphDiffSchema, applyGraphDiff, createGraphDiff, supplied, validateAnyEditGraph, type GraphDiff, type AnyEditGraph } from "../edit-graph/index.js";
import { deriveDependencyImpact, validateRepairRevision, validateRepairPlan, type RepairLineageStep, type ImpactSide } from "../edit-repair/index.js";
import { canonical, check, envelope, header, identity, record } from "./common.js";
import { artifactMap, graphBinding, joinArtifacts, rebaseEditorialState, validateEditorialState } from "./state.js";
import { AllowedScopeSchema, EditingHeadSchema, EditorialIntentSchema, EditorialPolicySchema, EditorialRequestSchema, createEditorialIntent,
  headRef, validateCurrentRequest, type CurrentEditingContext, type EditorialIntent, type EditorialPolicy } from "./request.js";

const Implementation = { implementationId: "gate7_batch3c_editorial_revision", version: "0.1.0" } as const;
const PlanBody = z.strictObject({ ...envelope("EditorialRevisionPlan"), scope: ScopeSchema, head: ArtifactRefSchema, graph: ArtifactRefSchema,
  state: ArtifactRefSchema, request: ArtifactRefSchema, intent: ArtifactRefSchema, policy: ArtifactRefSchema, allowedScope: AllowedScopeSchema,
  operation: z.strictObject({ op: z.literal("trim_clip_source_range"), clipUseId: IdSchema, expected: z.strictObject({ range: SourceRangeSchema }),
    replacement: z.strictObject({ range: SourceRangeSchema }) }),
  planner: z.strictObject({ implementationId: z.literal(Implementation.implementationId), version: z.literal(Implementation.version) }),
  outcome: z.literal("proposal_requires_locks_scope_render_qc_and_current_head_cas") });
export const EditorialRevisionPlanSchema = PlanBody.extend({ planId: IdSchema }).refine(identity("planId", "editorial_revision_plan_v0"));
export type EditorialRevisionPlan = z.infer<typeof EditorialRevisionPlanSchema>;
/** Mechanical planning boundary receives the entire current preference state; V0 invents no learned taste or preference weights. */
export function planEditorialRevision(requestInput: unknown, intentInput: unknown, policyInput: unknown, c: CurrentEditingContext): EditorialRevisionPlan {
  const request = validateCurrentRequest(requestInput, c), intent = canonical(EditorialIntentSchema, intentInput), policy = canonical(EditorialPolicySchema, policyInput);
  check(equal(createEditorialIntent(request, intent.action, intent.producer, c), intent), "editorial_intent_mismatch");
  check(equal(policy.scope, c.head.scope), "editorial_scope_mismatch");
  const action = intent.action; check(action.kind === "request_edit" && request.allowedScope !== null, "editorial_edit_required");
  const clip = c.graph.clipUses.find(v => v.clipUseId === action.target.clipUseId)!;
  return record(EditorialRevisionPlanSchema, "planId", "editorial_revision_plan_v0", { ...header("EditorialRevisionPlan"), scope: c.head.scope,
    head: headRef(c.head), graph: c.head.currentGraph.artifact, state: c.head.currentState, request: supplied(request, request.requestId).ref,
    intent: supplied(intent, intent.intentId).ref, policy: supplied(policy, policy.policyId).ref, allowedScope: request.allowedScope,
    operation: { op: action.operation, clipUseId: clip.clipUseId, expected: { range: clip.source.range }, replacement: { range: action.keep } },
    planner: Implementation, outcome: "proposal_requires_locks_scope_render_qc_and_current_head_cas" });
}
export function validateEditorialRevisionPlan(input: unknown, artifacts: readonly SuppliedArtifact[]): EditorialRevisionPlan {
  const plan = canonical(EditorialRevisionPlanSchema, input), map = artifactMap(artifacts);
  const c: CurrentEditingContext = { head: canonical(EditingHeadSchema, map.get(plan.head)),
    graph: validateAnyEditGraph(map.get(plan.graph), artifacts), state: validateEditorialState(map.get(plan.state), artifacts), artifacts };
  const expected = planEditorialRevision(map.get(plan.request), map.get(plan.intent), map.get(plan.policy), c);
  check(equal(plan, expected), "editorial_plan_replay_mismatch"); return plan;
}
export function compileEditorialRevisionPlan(planInput: unknown, artifacts: readonly SuppliedArtifact[]): GraphDiff {
  const plan = validateEditorialRevisionPlan(planInput, artifacts), graph = validateAnyEditGraph(artifactMap(artifacts).get(plan.graph), artifacts);
  return createGraphDiff({ artifactType: "GraphDiff", artifactVersion: "0.2.0", stability: "internal_pre_stable", scope: plan.scope,
    parent: { editGraph: plan.graph, editGraphId: graph.editGraphId, revision: graph.revision }, operations: [plan.operation],
    origin: { kind: "editorial_revision_plan", editorialRevisionPlan: supplied(plan, plan.planId).ref, editorialRevisionPlanId: plan.planId }, semantics: "typed_graph_diff_v0" });
}
export function proposeEditorialRevision(request: unknown, intent: EditorialIntent, policy: EditorialPolicy, c: CurrentEditingContext) {
  const r = canonical(EditorialRequestSchema, request), plan = planEditorialRevision(r, intent, policy, c);
  const base = joinArtifacts(c.artifacts, [supplied(c.head, c.head.headId), supplied(c.state, c.state.stateId), supplied(r, r.requestId),
    supplied(intent, intent.intentId), supplied(policy, policy.policyId), supplied(plan, plan.planId)]);
  const diff = compileEditorialRevisionPlan(plan, base), artifacts = joinArtifacts(base, [supplied(diff, diff.graphDiffId)]);
  const child = applyGraphDiff(c.graph, diff, artifacts); artifacts.push(supplied(child, child.editGraphId));
  const state = rebaseEditorialState(c.state, child, diff, artifacts); artifacts.push(supplied(state, state.stateId));
  return { plan, diff, child, state, artifacts };
}
/** Whole ancestry dispatch, preserving every OR1 repair-plan replay check at repair-origin steps. */
export function validateRevisionLineage(childInput: unknown, artifacts: readonly SuppliedArtifact[], repairSteps: readonly RepairLineageStep[] = []): void {
  const graph = validateAnyEditGraph(childInput, artifacts); let current: AnyEditGraph = graph; const map = artifactMap(artifacts); let used = 0;
  while (current.parent.state === "present") {
    check(current.changeSet.kind === "graph_diff", "editorial_lineage_invalid");
    const diff = canonical(AnyGraphDiffSchema, map.get(current.changeSet.graphDiff));
    if (diff.origin.kind === "repair_plan") {
      const { plan } = validateRepairRevision(current, artifacts);
      const matches = repairSteps.filter(s => s.dag.dag.graph.editGraphId === plan.parent.editGraphId && s.dag.dag.graph.revision === plan.parent.revision);
      check(matches.length === 1, "repair_lineage_invalid");
      validateRepairPlan(plan, { ...matches[0]!, graph: map.get(current.parent.editGraph), findingId: plan.critic.finding.findingId }); used += 1;
    } else {
      const plan = validateEditorialRevisionPlan(map.get(diff.origin.editorialRevisionPlan), artifacts);
      check(equal(compileEditorialRevisionPlan(plan, artifacts), diff), "editorial_lineage_invalid");
    }
    current = validateAnyEditGraph(map.get(current.parent.editGraph), artifacts);
  }
  check(used === repairSteps.length, "repair_lineage_invalid");
}
/** Derive impact from replayed graph/DAG/program evidence, then refuse any spill or protected computation change. */
export function validateEditorialImpact(c: CurrentEditingContext, diff: GraphDiff, parent: ImpactSide, child: ImpactSide,
  allowedScope: z.infer<typeof AllowedScopeSchema> | null) {
  check(equal(graphBinding(c.graph), graphBinding(validateAnyEditGraph(parent.graph, c.artifacts))), "editorial_impact_invalid");
  const impact = deriveDependencyImpact({ parent, child, diff });
  for (const lock of c.state.hardLocks) {
    const row = impact.clips.find(v => v.parentClipUseId === lock.target.clipUseId);
    check(row && row.change === "unchanged" && impact.segments.some(s => s.position === row.position && s.decision === "reusable_identical_computation"), "hard_lock_conflict");
  }
  if (allowedScope) {
    const s = canonical(AllowedScopeSchema, allowedScope), p = impact.changedRegion.parent, n = impact.changedRegion.child;
    check(equal(s.graph, c.head.currentGraph) && s.ticksPerSecond === impact.changedRegion.ticksPerSecond, "editorial_scope_invalid");
    check(p.startTicks >= s.interval.startTicks && p.endTicks <= s.interval.endTicks && n.startTicks >= s.interval.startTicks && n.endTicks <= s.interval.endTicks,
      "editorial_scope_spill");
    check(impact.clips.filter(v => v.medium === "video" && v.change !== "unchanged").every(v => s.clipUseIds.includes(v.parentClipUseId)), "editorial_scope_spill");
  }
  return impact;
}
