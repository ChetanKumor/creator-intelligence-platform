import { supplied } from "../../packages/edit-graph/index.js";
import { canonicalTime, subtractTimes, tickTime } from "../../packages/edit-graph/common.js";
import * as E from "../../packages/edit-editorial/index.js";
import { cfrMetadata, renderGraph } from "./edit-render.js";
export const MANUAL = { implementationId: "manual_editor", version: "0.1.0", basis: "manual_typed_action" as const };
let cached: ReturnType<typeof renderGraph> | undefined;
export const editorialFixture = () => cached ??= renderGraph({ sources: [
  { key: "editorial_a", hash: "a".repeat(64), metadata: cfrMetadata() },
  { key: "editorial_b", hash: "b".repeat(64), metadata: cfrMetadata() },
], cut: true });
export function context(): E.CurrentEditingContext {
  const g = editorialFixture(), state = E.createRootEditorialState(g.graph, g.artifacts), head = E.createEditingHead(g.graph, state, null, { kind: "initial" });
  return { graph: g.graph, state, head, artifacts: [...g.artifacts, supplied(state, state.stateId), supplied(head, head.headId)] };
}
export function stateAction(c: E.CurrentEditingContext, op: E.StateOperation): E.CurrentEditingContext {
  const diff = E.createEditorialStateDiff(c.state, op, { kind: "manual", actorId: "owner_synthetic", actionId: `action_${c.state.stateRevision}` });
  const artifacts = [...c.artifacts, supplied(diff, diff.diffId)], state = E.applyEditorialStateDiff(c.state, diff, artifacts);
  const head = E.createEditingHead(c.graph, state, c.head, { kind: "state_only", diff: supplied(diff, diff.diffId).ref });
  return { graph: c.graph, state, head, artifacts: [...artifacts, supplied(state, state.stateId), supplied(head, head.headId)] };
}
export const clipTarget = (c: E.CurrentEditingContext, i: number) => E.targetOf(c.graph, c.graph.clipUses.filter(v => v.medium === "video")[i]!.clipUseId);
export function requestFor(c: E.CurrentEditingContext, target = clipTarget(c, 0), allowedScope: E.EditorialRequest["allowedScope"] = null, text = "A typed manual action") {
  return E.createEditorialRequest({ scope: c.head.scope, requestKey: `request_${c.head.headRevision}`, rawUserText: text,
    baseHead: E.headRef(c.head), baseGraph: c.head.currentGraph, baseState: c.head.currentState, selectedTarget: target,
    referencedRevision: target.graph.artifact.objectId === c.graph.editGraphId ? null : target.graph, allowedScope });
}
export function editProposal(c: E.CurrentEditingContext, i: number, wholeScope = false) {
  const target = clipTarget(c, i), clip = c.graph.clipUses.find(v => v.clipUseId === target.clipUseId)!;
  const allowed = { graph: c.head.currentGraph, clipUseIds: wholeScope ? c.graph.clipUses.filter(v => v.medium === "video").map(v => v.clipUseId) : [target.clipUseId],
    interval: wholeScope ? { startTicks: 0, endTicks: c.graph.output.durationTicks } : target.interval, ticksPerSecond: target.ticksPerSecond };
  const request = requestFor(c, target, allowed), policy = E.createEditorialPolicy(c.head.scope, { kind: "owner", actorId: "owner_synthetic" });
  const intent = E.createEditorialIntent(request, { kind: "request_edit", target, operation: "trim_clip_source_range",
    keep: { start: clip.source.range.start, end: canonicalTime(subtractTimes(clip.source.range.end, tickTime(1, 2))) } }, MANUAL, c);
  return { ...E.proposeEditorialRevision(request, intent, policy, c), request, intent, policy };
}
