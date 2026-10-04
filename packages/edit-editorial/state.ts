import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EditorialArtifactMap, equal, exactDigest, type ArtifactRef, type SuppliedArtifact } from "../editorial/common.js";
import { HashSchema, Nat, ScopeSchema } from "../edit-graph/common.js";
import { parseAnyEditGraph, supplied, validateAnyEditGraph, type AnyEditGraph, type GraphDiff } from "../edit-graph/index.js";
import { LIMITS, canonical, check, envelope, header, identity, parse, record } from "./common.js";

export const IntervalSchema = z.strictObject({ startTicks: Nat, endTicks: Nat }).refine(v => v.endTicks > v.startTicks, "Nonempty exact interval.");
export const GraphBindingSchema = z.strictObject({ artifact: ArtifactRefSchema, revision: Nat });
export const TargetSchema = z.strictObject({ kind: z.literal("clip_region"), graph: GraphBindingSchema, clipUseId: IdSchema,
  interval: IntervalSchema, ticksPerSecond: z.number().int().positive().safe() });
export type EditorialTarget = z.infer<typeof TargetSchema>;
export const ProvenanceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("manual"), actorId: IdSchema, actionId: IdSchema }),
  z.strictObject({ kind: z.literal("editorial_intent"), intent: ArtifactRefSchema }),
]);
export const StateOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add_hard_lock"), target: TargetSchema }),
  z.strictObject({ op: z.literal("remove_hard_lock"), lockId: IdSchema }),
  z.strictObject({ op: z.literal("set_preference"), target: TargetSchema, value: z.enum(["liked", "rejected"]) }),
  z.strictObject({ op: z.literal("clear_preference"), target: TargetSchema }),
]);
export type StateOperation = z.infer<typeof StateOperationSchema>;
const LockSchema = z.strictObject({ lockId: IdSchema, semantics: z.literal("hard_exact"), target: TargetSchema,
  protectedSemantics: HashSchema, createdBy: ArtifactRefSchema });
const PreferenceSchema = z.strictObject({ target: TargetSchema, value: z.enum(["liked", "rejected"]), setBy: ArtifactRefSchema });
const StateBody = z.strictObject({ ...envelope("EditorialState"), scope: ScopeSchema, stateRevision: Nat.max(LIMITS.headRevisions),
  currentGraph: GraphBindingSchema, parentState: ArtifactRefSchema.nullable(),
  change: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("initial") }),
    z.strictObject({ kind: z.literal("state_diff"), diff: ArtifactRefSchema }), z.strictObject({ kind: z.literal("graph_rebase"), diff: ArtifactRefSchema })]),
  hardLocks: z.array(LockSchema).max(LIMITS.stateEntries), preferences: z.array(PreferenceSchema).max(LIMITS.stateEntries) });
export const EditorialStateSchema = StateBody.extend({ stateId: IdSchema }).refine(identity("stateId", "editorial_state_v0"));
export type EditorialState = z.infer<typeof EditorialStateSchema>;
const DiffBody = z.strictObject({ ...envelope("EditorialStateDiff"), scope: ScopeSchema, parentState: ArtifactRefSchema,
  parentRevision: Nat.max(LIMITS.headRevisions - 1), currentGraph: GraphBindingSchema, operation: StateOperationSchema, provenance: ProvenanceSchema });
export const EditorialStateDiffSchema = DiffBody.extend({ diffId: IdSchema }).refine(identity("diffId", "editorial_state_diff_v0"));
export type EditorialStateDiff = z.infer<typeof EditorialStateDiffSchema>;
export const graphBinding = (g: AnyEditGraph) => ({ artifact: supplied(g, g.editGraphId).ref, revision: g.revision });
export const stateRef = (s: EditorialState) => supplied(s, s.stateId).ref;
export function artifactMap(artifacts: readonly SuppliedArtifact[]): EditorialArtifactMap {
  check(Array.isArray(artifacts) && artifacts.length <= LIMITS.artifacts, "editorial_budget_exceeded"); return new EditorialArtifactMap(artifacts);
}
/**
 * Gate 7 Batch 3E-A: one full replay per immutable graph inside one top-level validation. While an exported validator of this module runs,
 * each successful graph validation over its exact artifact list is remembered under the content digest of the validated graph, with every
 * ancestor that validation replayed: a revision validates only by replaying its exact parent (named by reference and SHA-256) down to the
 * Gate-5 root, so each graph reached through `parent.editGraph` has itself validated over the same list. Only an input whose canonical
 * content is exactly a remembered graph reuses it. A failure is never remembered, and nothing outlives the outermost call or comes from a caller.
 */
let scope: { artifacts: readonly SuppliedArtifact[]; graphs: Map<string, AnyEditGraph> } | undefined;
function scoped<T>(artifacts: readonly SuppliedArtifact[], run: () => T): T {
  if (scope !== undefined) return run();
  scope = { artifacts, graphs: new Map() };
  try { return run(); } finally { scope = undefined; }
}
function digestOf(value: unknown): string | undefined {
  try { return exactDigest(new TextEncoder().encode(canonicalSerialize(value))); } catch { return undefined; }
}
function graphOf(input: unknown, artifacts: readonly SuppliedArtifact[]): AnyEditGraph {
  const memo = scope !== undefined && scope.artifacts === artifacts ? scope.graphs : undefined, key = memo === undefined ? undefined : digestOf(input);
  const known = key === undefined ? undefined : memo?.get(key);
  if (known !== undefined) return structuredClone(known);
  const graph = validateAnyEditGraph(input, artifacts);
  if (memo !== undefined) remember(memo, graph, artifacts);
  return graph;
}
/** Records a validated graph and the ancestors its validation replayed. An optimisation only: it never refuses, and anything it does not
 * record is simply replayed in full. The map is the one validateAnyEditGraph has just built over the same list. */
function remember(memo: Map<string, AnyEditGraph>, graph: AnyEditGraph, artifacts: readonly SuppliedArtifact[]): void {
  try {
    const map = new EditorialArtifactMap(artifacts);
    for (let g: AnyEditGraph | undefined = graph; g !== undefined;) {
      const key = digestOf(g); if (key === undefined || memo.has(key)) return;
      memo.set(key, structuredClone(g));
      g = g.parent.state === "present" ? parseAnyEditGraph(map.get(g.parent.editGraph)) : undefined;
    }
  } catch { return; }
}
export function targetOf(graph: AnyEditGraph, clipUseId: string, interval?: z.infer<typeof IntervalSchema>): EditorialTarget {
  const clip = graph.clipUses.find(c => c.clipUseId === clipUseId && c.medium === "video"); check(clip, "editorial_target_invalid");
  const target = parse(TargetSchema, { kind: "clip_region", graph: graphBinding(graph), clipUseId, interval: interval ?? clip.output,
    ticksPerSecond: graph.output.clock.ticksPerSecond });
  check(target.interval.startTicks >= clip.output.startTicks && target.interval.endTicks <= clip.output.endTicks, "editorial_target_range_invalid");
  return target;
}
export function graphForTarget(input: unknown, current: AnyEditGraph, artifacts: readonly SuppliedArtifact[], historical: boolean): AnyEditGraph {
  return scoped(artifacts, () => targetGraph(input, current, artifacts, historical));
}
function targetGraph(input: unknown, current: AnyEditGraph, artifacts: readonly SuppliedArtifact[], historical: boolean): AnyEditGraph {
  const t = canonical(TargetSchema, input), map = artifactMap(artifacts); let graph = current;
  while (!equal(t.graph, graphBinding(graph))) {
    check(historical && graph.parent.state === "present", "editorial_target_not_ancestor");
    graph = graphOf(map.get(graph.parent.editGraph), artifacts);
  }
  check(equal(graph.scope, current.scope), "editorial_scope_mismatch");
  check(equal(targetOf(graph, t.clipUseId, t.interval), t), "editorial_target_invalid"); return graph;
}
/** Hash a protected clip's complete current semantics, including placement, linked audio, and every touching operation's extent.
 * IDs of neighbouring uses are references, not protected neighbour contents. A cut protects its own exact boundary and parameters. */
export function protectedSemantics(graph: AnyEditGraph, target: EditorialTarget): string {
  const clip = graph.clipUses.find(c => c.medium === "video" && c.clipUseId === target.clipUseId); check(clip, "editorial_target_invalid");
  check(equal(target.interval, clip.output), "hard_lock_requires_whole_clip");
  const operations = graph.operations.flatMap<unknown>(op => {
    if (op.primitive === "color_look") return op.target.kind === "whole_output" || op.target.clipUseIds.includes(clip.clipUseId)
      ? [{ primitive: op.primitive, parameters: op.parameters, extents: op.extents, resolvedFrom: op.resolvedFrom }] : [];
    return op.target.fromClipUseId === clip.clipUseId || op.target.toClipUseId === clip.clipUseId
      ? [{ primitive: op.primitive, parameters: op.parameters, atTicks: op.atTicks, resolvedFrom: op.resolvedFrom }] : [];
  });
  const audio = graph.clipUses.filter(c => c.medium === "source_audio" && c.linkedVideoClipUseId === clip.clipUseId);
  return exactDigest(new TextEncoder().encode(canonicalSerialize({ clip, audio, operations, outputProfile: graph.outputProfile, clock: graph.output.clock })));
}
export function createRootEditorialState(graphInput: unknown, artifacts: readonly SuppliedArtifact[]): EditorialState {
  return scoped(artifacts, () => rootState(graphInput, artifacts));
}
function rootState(graphInput: unknown, artifacts: readonly SuppliedArtifact[]): EditorialState {
  const g = graphOf(graphInput, artifacts);
  return record(EditorialStateSchema, "stateId", "editorial_state_v0", { ...header("EditorialState"), scope: g.scope, stateRevision: 0,
    currentGraph: graphBinding(g), parentState: null, change: { kind: "initial" }, hardLocks: [], preferences: [] });
}
export function createEditorialStateDiff(stateInput: unknown, operation: unknown, provenance: unknown): EditorialStateDiff {
  const state = canonical(EditorialStateSchema, stateInput);
  return record(EditorialStateDiffSchema, "diffId", "editorial_state_diff_v0", { ...header("EditorialStateDiff"), scope: state.scope,
    parentState: stateRef(state), parentRevision: state.stateRevision, currentGraph: state.currentGraph,
    operation: parse(StateOperationSchema, operation), provenance: parse(ProvenanceSchema, provenance) });
}
export function applyEditorialStateDiff(stateInput: unknown, diffInput: unknown, artifacts: readonly SuppliedArtifact[]): EditorialState {
  return scoped(artifacts, () => appliedState(stateInput, diffInput, artifacts));
}
function appliedState(stateInput: unknown, diffInput: unknown, artifacts: readonly SuppliedArtifact[]): EditorialState {
  const state = canonical(EditorialStateSchema, stateInput), diff = canonical(EditorialStateDiffSchema, diffInput);
  check(equal(diff.parentState, stateRef(state)) && diff.parentRevision === state.stateRevision && equal(diff.currentGraph, state.currentGraph), "stale_editorial_state");
  check(equal(diff.scope, state.scope), "editorial_scope_mismatch");
  const graph = graphOf(artifactMap(artifacts).get(state.currentGraph.artifact), artifacts);
  const op = diff.operation, hardLocks = structuredClone(state.hardLocks), preferences = structuredClone(state.preferences), by = supplied(diff, diff.diffId).ref;
  if (op.op === "add_hard_lock") {
    graphForTarget(op.target, graph, artifacts, false);
    check(!hardLocks.some(l => equal(l.target, op.target)), "duplicate_hard_lock");
    hardLocks.push({ lockId: `hard_lock_${by.sha256}`, semantics: "hard_exact", target: op.target, protectedSemantics: protectedSemantics(graph, op.target), createdBy: by });
  } else if (op.op === "remove_hard_lock") {
    const i = hardLocks.findIndex(l => l.lockId === op.lockId); check(i >= 0, "hard_lock_unknown"); hardLocks.splice(i, 1);
  } else {
    graphForTarget(op.target, graph, artifacts, true);
    const i = preferences.findIndex(p => equal(p.target, op.target));
    if (op.op === "clear_preference") { check(i >= 0, "preference_unknown"); preferences.splice(i, 1); }
    else { const p = { target: op.target, value: op.value, setBy: by }; if (i >= 0) preferences[i] = p; else preferences.push(p); }
  }
  hardLocks.sort((a, b) => a.lockId.localeCompare(b.lockId));
  preferences.sort((a, b) => canonicalSerialize(a.target).localeCompare(canonicalSerialize(b.target)));
  return record(EditorialStateSchema, "stateId", "editorial_state_v0", { ...header("EditorialState"), scope: state.scope, stateRevision: state.stateRevision + 1,
    currentGraph: state.currentGraph, parentState: stateRef(state), change: { kind: "state_diff", diff: by }, hardLocks, preferences });
}
/** Rebase only by correspondence proven by the current trim primitive and exact protected semantics. Preferences keep their historical targets. */
export function rebaseEditorialState(stateInput: unknown, childInput: unknown, diff: GraphDiff, artifacts: readonly SuppliedArtifact[]): EditorialState {
  return scoped(artifacts, () => rebasedState(stateInput, childInput, diff, artifacts));
}
function rebasedState(stateInput: unknown, childInput: unknown, diff: GraphDiff, artifacts: readonly SuppliedArtifact[]): EditorialState {
  const state = canonical(EditorialStateSchema, stateInput), child = graphOf(childInput, artifacts);
  check(child.parent.state === "present" && child.changeSet.kind === "graph_diff" && equal(child.parent.editGraph, state.currentGraph.artifact)
    && equal(child.changeSet.graphDiff, supplied(diff, diff.graphDiffId).ref), "editorial_rebase_invalid");
  const parent = graphOf(artifactMap(artifacts).get(state.currentGraph.artifact), artifacts);
  const hardLocks = state.hardLocks.map(lock => {
    graphForTarget(lock.target, parent, artifacts, false);
    check(protectedSemantics(parent, lock.target) === lock.protectedSemantics, "hard_lock_corrupt");
    const old = parent.clipUses.find(c => c.clipUseId === lock.target.clipUseId)!;
    const next = child.clipUses.filter(c => c.medium === "video" && c.planningUse.useId === old.planningUse.useId);
    check(next.length === 1, "hard_lock_conflict");
    const target = targetOf(child, next[0]!.clipUseId);
    check(protectedSemantics(child, target) === lock.protectedSemantics, "hard_lock_conflict");
    return { ...lock, target };
  });
  return record(EditorialStateSchema, "stateId", "editorial_state_v0", { ...header("EditorialState"), scope: state.scope, stateRevision: state.stateRevision + 1,
    currentGraph: graphBinding(child), parentState: stateRef(state), change: { kind: "graph_rebase", diff: supplied(diff, diff.graphDiffId).ref },
    hardLocks, preferences: state.preferences });
}
export function validateEditorialState(input: unknown, artifacts: readonly SuppliedArtifact[], depth = 0): EditorialState {
  return scoped(artifacts, () => replayedState(input, artifacts, depth));
}
function replayedState(input: unknown, artifacts: readonly SuppliedArtifact[], depth: number): EditorialState {
  check(depth <= LIMITS.headRevisions, "editorial_budget_exceeded"); const state = canonical(EditorialStateSchema, input), map = artifactMap(artifacts);
  const graph = graphOf(map.get(state.currentGraph.artifact), artifacts); check(equal(state.scope, graph.scope), "editorial_scope_mismatch");
  let expected: EditorialState;
  if (state.change.kind === "initial") expected = createRootEditorialState(graph, artifacts);
  else {
    check(state.parentState !== null, "editorial_state_parent_missing");
    const parent = validateEditorialState(map.get(state.parentState), artifacts, depth + 1);
    expected = state.change.kind === "state_diff" ? applyEditorialStateDiff(parent, map.get(state.change.diff), artifacts)
      : rebaseEditorialState(parent, graph, map.get(state.change.diff) as GraphDiff, artifacts);
  }
  check(equal(state, expected), "editorial_state_replay_mismatch"); return state;
}
/** Gate 7 Batch 3E-A: a head's graph, then its state, read and validated exactly as two separate calls would, inside one validation scope. */
export function validateGraphAndState(graph: ArtifactRef, state: ArtifactRef, artifacts: readonly SuppliedArtifact[]): { graph: AnyEditGraph; state: EditorialState } {
  return scoped(artifacts, () => {
    const map = artifactMap(artifacts), validated = graphOf(map.get(graph), artifacts);
    return { graph: validated, state: validateEditorialState(map.get(state), artifacts) };
  });
}
export function joinArtifacts(...groups: (readonly SuppliedArtifact[])[]): SuppliedArtifact[] {
  const map = new Map<string, SuppliedArtifact>();
  for (const a of groups.flat()) { const prior = map.get(a.ref.objectId); check(!prior || equal(prior.ref, a.ref), "editorial_artifact_conflict"); map.set(a.ref.objectId, a); }
  return [...map.values()];
}
export function namedRef(type: string, ref: ArtifactRef): void { check(ref.artifactType === type && ref.artifactVersion === "0.1.0", "editorial_reference_invalid"); }
