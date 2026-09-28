/**
 * RepairPlan -> typed GraphDiff -> new EditGraph revision. Compilation is mechanical: one plan action becomes one registered GraphDiff
 * operation that compares and swaps the parent's exact prior value, and the diff names the plan as its origin. The child is made only by the
 * EditGraph's own pure application of that diff. Lineage validation proves the whole chain: the child replays from its exact parent and
 * GraphDiff, the GraphDiff is exactly the compilation of its RepairPlan, and the plan names that parent. (The plan's own bindings to the
 * rendered output, QC, critic report and evidence are proven by validateRepairPlan, which needs those records.)
 */
import { EditorialArtifactMap, equal, type SuppliedArtifact } from "../editorial/common.js";
import { GRAPH_DIFF_VERSION, GraphDiffSchema, applyGraphDiff, createGraphDiff, supplied, validateAnyEditGraph, validateEditGraphRevision, type AnyEditGraph,
  type EditGraphRevision, type GraphDiff } from "../edit-graph/index.js";
import { check, guard, parseCanonical } from "./common.js";
import { requireRepairPlan, validateRepairPlan, type RepairPlan, type RepairPlanningInput } from "./plan.js";

function diffOf(plan: RepairPlan, parent: AnyEditGraph): GraphDiff {
  check(equal(plan.parent, { editGraph: supplied(parent, parent.editGraphId).ref, editGraphId: parent.editGraphId, revision: parent.revision }), "repair_plan_stale",
    "The plan was made for another graph, revision or parent bytes; a stale plan never compiles against the current head.");
  check(equal(plan.scope, parent.scope), "scope_mismatch", "A repair plan never crosses project, creator or purpose.");
  const operations = plan.actions.map(action => {
    const clip = parent.clipUses.find(c => c.clipUseId === action.clipUseId);
    check(clip !== undefined && clip.medium === "video", "repair_action_invalid", "The action names no video clip use of the exact parent.");
    return { op: action.action, clipUseId: action.clipUseId, expected: { range: clip.source.range }, replacement: { range: action.keep } };
  });
  return guard("graph_diff_mismatch", () => createGraphDiff({ artifactType: "GraphDiff", artifactVersion: GRAPH_DIFF_VERSION, stability: "internal_pre_stable",
    scope: parent.scope, parent: { editGraph: supplied(parent, parent.editGraphId).ref, editGraphId: parent.editGraphId, revision: parent.revision }, operations,
    origin: { kind: "repair_plan", repairPlan: supplied(plan, plan.planId).ref, repairPlanId: plan.planId }, semantics: "typed_graph_diff_v0" }));
}
/** Compiles a plan to its one GraphDiff against the exact parent it names (validated by replay first). Deterministic; nothing is applied. */
export function compileRepairPlan(planInput: unknown, parentInput: unknown, artifacts: readonly SuppliedArtifact[]): GraphDiff {
  const plan = requireRepairPlan(planInput), parent = guard("repair_lineage_invalid", () => validateAnyEditGraph(parentInput, artifacts));
  return diffOf(plan, parent);
}
/** Compiles and applies: the only way a plan reaches the project, and only as a new immutable revision of its exact parent. */
export function applyRepairPlan(planInput: unknown, parentInput: unknown, artifacts: readonly SuppliedArtifact[]): { diff: GraphDiff; child: EditGraphRevision } {
  const diff = compileRepairPlan(planInput, parentInput, artifacts);
  const child = applyGraphDiff(parentInput, diff, [...artifacts, supplied(diff, diff.graphDiffId)]);
  return { diff, child };
}
/**
 * Proves a revision's repair lineage from supplied bytes only: the child replays from its exact parent and GraphDiff, the GraphDiff's origin
 * is an exactly supplied RepairPlan, and compiling that plan against that parent gives exactly that GraphDiff.
 */
export function validateRepairRevision(childInput: unknown, artifacts: readonly SuppliedArtifact[]): { child: EditGraphRevision; diff: GraphDiff; plan: RepairPlan } {
  const child = validateEditGraphRevision(childInput, artifacts);
  const map = guard("repair_lineage_invalid", () => new EditorialArtifactMap(artifacts));
  const parent = guard("repair_lineage_invalid", () => validateAnyEditGraph(map.get(child.parent.editGraph), artifacts));
  const diff = parseCanonical(GraphDiffSchema, guard("repair_lineage_invalid", () => map.get(child.changeSet.graphDiff)), "repair_lineage_invalid");
  check(diff.graphDiffId === child.changeSet.graphDiffId, "repair_lineage_invalid", "The change set names another GraphDiff.");
  const origin = diff.origin;
  const plan = guard("repair_lineage_invalid", () => requireRepairPlan(map.get(origin.repairPlan)));
  check(plan.planId === origin.repairPlanId, "repair_lineage_invalid", "The GraphDiff's origin names another RepairPlan.");
  check(equal(diffOf(plan, parent), diff), "graph_diff_mismatch", "The GraphDiff is not exactly the compilation of its RepairPlan against its exact parent.");
  return { child, diff, plan };
}
/**
 * One repair step's bindings (owner review OR1): the exact render of the parent revision its RepairPlan was made from, meaning its validated
 * DAG and artifacts, receipt, passing technical QC, critic report, the observations holding the finding's evidence, and the owner's repair
 * policy. The plan itself names its parent graph and its finding.
 */
export type RepairLineageStep = Omit<RepairPlanningInput, "planner" | "graph" | "findingId">;
/**
 * Proves a revision's complete repair lineage, down to its initial graph. At every revision k the GraphDiff is exactly the compilation of its
 * supplied RepairPlan against the exact parent (validateRepairRevision), and that plan replays from steps[k - 1], the exact render of that parent
 * (validateRepairPlan: one exact finding of that render, its evidence, passing QC and the owner's policy). A GraphDiff whose origin is not such a
 * plan authorizes nothing: only a revision whose whole lineage validates may be executed.
 */
export function validateRepairLineage(childInput: unknown, artifacts: readonly SuppliedArtifact[], steps: readonly RepairLineageStep[]):
  { child: EditGraphRevision; plans: RepairPlan[] } {
  check(Array.isArray(steps), "repair_lineage_invalid", "A repair lineage is a list of repair steps, one per revision.");
  const { child, plan } = guard("repair_lineage_invalid", () => validateRepairRevision(childInput, artifacts));
  check(steps.length === child.revision, "repair_lineage_invalid", "Every revision needs exactly its own repair step: the render its plan was made from.");
  const step = steps[child.revision - 1];
  check(step !== null && typeof step === "object", "repair_lineage_invalid", "A repair step names the render its plan was made from.");
  const parent = guard("repair_lineage_invalid", () => new EditorialArtifactMap(artifacts).get(child.parent.editGraph));
  validateRepairPlan(plan, { ...step, graph: parent, findingId: plan.critic.finding.findingId });
  const earlier = child.parent.revision === 0 ? [] : validateRepairLineage(parent, step.artifacts, steps.slice(0, -1)).plans;
  return { child, plans: [...earlier, plan] };
}
