import assert from "node:assert/strict";
import { test } from "node:test";
import { identify, equal } from "../packages/editorial/common.js";
import { supplied, GraphDiffSchema, EditGraphRevisionSchema, validateAnyEditGraph } from "../packages/edit-graph/index.js";
import * as E from "../packages/edit-editorial/index.js";
import { MANUAL, clipTarget, context, editProposal, requestFor, stateAction } from "./support/edit-editorial.js";
import { cfrMetadata, renderGraph } from "./support/edit-render.js";
function changed<T extends object>(v: T, key: string, prefix: string, patch: Record<string, unknown>): T {
  const body = { ...structuredClone(v), ...patch } as Record<string, unknown>; delete body[key]; return identify(prefix, key, body) as T;
}
let cached: E.CurrentEditingContext | undefined;
const base = () => cached ??= context();
test("3C-A03 deterministic root, exact graph, no timeline or execution authority in state", () => {
  const c = base(); assert.deepEqual(E.createRootEditorialState(c.graph, c.artifacts), c.state);
  for (const field of ["clipUses", "operations", "ffmpeg", "conversation", "qc", "modelVectors", "renderProgram"]) {
    assert.equal(E.EditorialStateSchema.safeParse({ ...c.state, [field]: [] }).success, false, field);
  }
  assert.throws(() => E.validateEditorialState(changed(c.state, "stateId", "editorial_state_v0", { stateRevision: 1 }), c.artifacts));
});
test("3C-B03 wrong exact parent, wrong revision, repeat diff and multiple operations refused", () => {
  const c = base(), op = { op: "add_hard_lock" as const, target: clipTarget(c, 0) };
  const diff = E.createEditorialStateDiff(c.state, op, { kind: "manual", actorId: "owner", actionId: "lock" });
  const s1 = E.applyEditorialStateDiff(c.state, diff, c.artifacts);
  assert.throws(() => E.applyEditorialStateDiff(s1, diff, c.artifacts), /stale_editorial_state/);
  for (const patch of [{ parentRevision: 1 }, { parentState: supplied(s1, s1.stateId).ref }]) {
    assert.throws(() => E.applyEditorialStateDiff(c.state, changed(diff, "diffId", "editorial_state_diff_v0", patch), c.artifacts), /stale_editorial_state/);
  }
  assert.equal(E.EditorialStateDiffSchema.safeParse({ ...diff, operations: [op, op] }).success, false);
});
test("3C-C02 duplicate locks, invalid IDs, partial and foreign targets refuse", () => {
  const c = base(), target = clipTarget(c, 0), locked = stateAction(c, { op: "add_hard_lock", target });
  assert.throws(() => stateAction(locked, { op: "add_hard_lock", target }), /duplicate_hard_lock/);
  assert.throws(() => E.targetOf(c.graph, "missing_clip"), /editorial_target_invalid/);
  assert.throws(() => stateAction(c, { op: "add_hard_lock", target: { ...target, clipUseId: "missing_clip" } }));
  assert.throws(() => stateAction(c, { op: "add_hard_lock", target: { ...target, interval: { startTicks: 0, endTicks: 1 } } }), /hard_lock_requires_whole_clip/);
  assert.throws(() => stateAction(c, { op: "add_hard_lock", target: { ...target, graph: { ...target.graph, revision: 9 } } }));
});
test("3C-C03 locked source trim and upstream placement shift refuse, unrelated final trim rebases", () => {
  const c = base(), a = stateAction(c, { op: "add_hard_lock", target: clipTarget(c, 0) });
  assert.throws(() => editProposal(a, 0, true), /hard_lock_conflict/);
  const p = editProposal(a, 1);
  assert.equal(p.state.hardLocks[0]!.lockId, a.state.hardLocks[0]!.lockId);
  assert.equal(p.state.hardLocks[0]!.target.graph.artifact.objectId, p.child.editGraphId);
  assert.deepEqual(E.validateEditorialState(p.state, p.artifacts), p.state);
  const b = stateAction(c, { op: "add_hard_lock", target: clipTarget(c, 1) });
  assert.throws(() => editProposal(b, 0, true), /hard_lock_conflict/);
});
test("3C-C04 HARD_EXACT fingerprint binds source, placement, framing, operation parameters and extent", () => {
  const c = base(), target = clipTarget(c, 0), expected = E.protectedSemantics(c.graph, target);
  const copies = [structuredClone(c.graph), structuredClone(c.graph), structuredClone(c.graph), structuredClone(c.graph)];
  copies[0]!.clipUses[0]!.source.sourceHash = "f".repeat(64);
  copies[1]!.clipUses[0]!.mapping.sourceStartTicks += 1;
  copies[2]!.clipUses[0]!.output.endTicks -= 1;
  const cut = copies[3]!.operations.find(o => o.primitive === "cut_transition"); assert.ok(cut); cut.atTicks -= 1;
  for (const g of copies) assert.notEqual(E.protectedSemantics(g, E.targetOf(g, g.clipUses[0]!.clipUseId)), expected);
  const colored = renderGraph({ sources: [{ key: "locked_look", hash: "d".repeat(64), metadata: cfrMetadata() }], look: { look: "warm", target: [0] } }).graph;
  const colorTarget = E.targetOf(colored, colored.clipUses[0]!.clipUseId), colorDigest = E.protectedSemantics(colored, colorTarget);
  for (const field of ["parameters", "extent", "linked_audio", "profile"] as const) {
    const changed = structuredClone(colored), look = changed.operations.find(o => o.primitive === "color_look"); assert.ok(look);
    if (field === "parameters") look.parameters.intensityPerMille += 1;
    if (field === "extent") look.extents[0]!.endTicks -= 1;
    if (field === "linked_audio") changed.clipUses.find(v => v.medium === "source_audio")!.mapping.sourceStartTicks += 1;
    if (field === "profile") changed.outputProfile.sha256 = "e".repeat(64);
    assert.notEqual(E.protectedSemantics(changed, colorTarget), colorDigest, field);
  }
});
for (const value of ["liked", "rejected"] as const) test(`3C-D02 ${value} remains soft when its own clip is trimmed`, () => {
  const c = base(), preferred = stateAction(c, { op: "set_preference", target: clipTarget(c, 1), value }), p = editProposal(preferred, 1);
  assert.equal(p.state.preferences[0]!.value, value); assert.equal(p.state.hardLocks.length, 0);
  assert.equal(p.state.preferences[0]!.target.graph.artifact.objectId, c.graph.editGraphId);
});
test("3C-D03 historical ancestor accepted; invalid range, fabricated and sibling revision refused", () => {
  const c = base(), first = editProposal(c, 1), sibling = editProposal(c, 0, true), target = clipTarget(c, 0);
  assert.deepEqual(E.graphForTarget(target, first.child, first.artifacts, true), c.graph);
  const siblingTarget = E.targetOf(sibling.child, sibling.child.clipUses[0]!.clipUseId);
  assert.throws(() => E.graphForTarget(siblingTarget, first.child, E.joinArtifacts(first.artifacts, sibling.artifacts), true), /editorial_target_not_ancestor/);
  assert.throws(() => E.graphForTarget({ ...target, interval: { startTicks: 0, endTicks: c.graph.output.durationTicks + 1 } }, c.graph, c.artifacts, true));
  assert.throws(() => E.graphForTarget({ ...target, graph: { ...target.graph, artifact: { ...target.graph.artifact, sha256: "f".repeat(64) } } }, c.graph, c.artifacts, true));
});
test("3C-F01 strict bounded request and deterministic identity", () => {
  const c = base(), request = requestFor(c);
  assert.deepEqual(requestFor(c), request);
  assert.equal(E.EditorialRequestSchema.safeParse({ ...request, rawUserText: "a".repeat(E.LIMITS.text + 1) }).success, false);
  assert.equal(E.EditorialRequestSchema.safeParse({ ...request, shell: "execute_me" }).success, false);
  assert.equal(E.EditorialRequestSchema.safeParse({ ...request, rawUserText: "\0" }).success, false);
  assert.throws(() => E.validateCurrentRequest(changed(request, "requestId", "editorial_request_v0", { scope: { ...request.scope, projectId: "foreign" } }), c), /editorial_scope_mismatch/);
});
for (const field of ["baseHead", "baseGraph", "baseState"] as const) test(`3C-P02 stale ${field} refused independently`, () => {
  const c = base(), request = requestFor(c);
  const patch = field === "baseGraph" ? { ...request.baseGraph, revision: 9 } : { ...request[field], sha256: "f".repeat(64) };
  assert.throws(() => E.validateCurrentRequest(changed(request, "requestId", "editorial_request_v0", { [field]: patch }), c), /stale_editing_head/);
});
test("3C-G01 interpreter receives frozen bounded preferences, snapshot survives caller mutation during await", async () => {
  const c = stateAction(base(), { op: "set_preference", target: clipTarget(base(), 0), value: "liked" }), mutable = structuredClone(c), request = requestFor(mutable);
  let release: (value: unknown) => void = () => { throw new Error("interpreter was not called"); };
  const response = { kind: "lock_target", target: clipTarget(c, 0) };
  const pending = E.interpretEditorialRequest(request, mutable, { identity: { ...MANUAL, basis: "deterministic_fixture" },
    interpret(ctx) { assert.equal(ctx.state.preferences[0]!.value, "liked"); assert.ok(Object.isFrozen(ctx.graph));
      return new Promise(resolve => { release = resolve; }); } });
  mutable.state.preferences.length = 0; request.rawUserText = "changed after call";
  release(response); const intent = await pending; response.target.clipUseId = "mutated_after_acceptance";
  assert.equal(intent.action.kind, "lock_target"); assert.ok(!equal(intent.action, response));
  assert.notEqual(intent.request, request); assert.equal(c.state.preferences.length, 1);
});
for (const text of ["Make it more cinematic", "Add a 3D camera move", "Put text behind the person"]) test(`3C-G02 unsupported abstention: ${text}`, async () => {
  const c = base(), request = requestFor(c, clipTarget(c, 0), null, text);
  const intent = await E.interpretEditorialRequest(request, c, { identity: { ...MANUAL, basis: "deterministic_fixture" },
    async interpret() { return { kind: "unsupported", reason: "unsupported_capability" }; } });
  assert.equal(intent.action.kind, "unsupported");
  assert.throws(() => E.proposeEditorialRevision(request, intent, E.createEditorialPolicy(c.head.scope, { kind: "owner", actorId: "owner" }), c), /editorial_edit_required/);
});
test("3C-G03 arbitrary response, multiple actions, model unlock plus edit, floats and scope widening refused", async () => {
  const c = base(), request = requestFor(c);
  for (const response of [{ op: "replace", path: "/hardLocks", value: [] }, [{ kind: "unlock_target", lockId: "x" }, { kind: "request_edit" }],
    { kind: "lock_target", target: clipTarget(c, 0), allowedScope: "all" }, { kind: "request_edit", target: clipTarget(c, 0), operation: "trim_clip_source_range", keep: { startSeconds: 0, endSeconds: 0.5 } }]) {
    await assert.rejects(E.interpretEditorialRequest(request, c, { identity: { ...MANUAL, basis: "deterministic_fixture" }, async interpret() { return response; } }));
  }
});
test("3C-G04 provider response bytes, compound actions, selected targets and revision counts are bounded", async () => {
  const c = base(), request = requestFor(c);
  await assert.rejects(E.interpretEditorialRequest(request, c, { identity: MANUAL, async interpret() { return "x".repeat(E.LIMITS.responseBytes + 1); } }), /editorial_budget_exceeded/);
  await assert.rejects(E.interpretEditorialRequest(request, c, { identity: MANUAL, async interpret() { throw new Error("fixture provider failure"); } }), /editorial_interpreter_failed/);
  for (const patch of [{ selectedTargets: [clipTarget(c, 0), clipTarget(c, 1)] }, { referencedRevisions: [c.head.currentGraph] }]) {
    assert.equal(E.EditorialRequestSchema.safeParse({ ...request, ...patch }).success, false);
  }
  const abstained = E.createEditorialIntent(request, { kind: "unsupported", reason: "compound_request" }, MANUAL, c);
  assert.equal(abstained.action.kind, "unsupported");
});
test("3C-H01 plan replay binds every authority reference, rejects code and arbitrary scope", () => {
  const c = base(), p = editProposal(c, 1);
  assert.deepEqual(E.validateEditorialRevisionPlan(p.plan, p.artifacts), p.plan);
  for (const field of ["head", "graph", "state", "request", "intent", "policy"] as const) {
    const forged = changed(p.plan, "planId", "editorial_revision_plan_v0", { [field]: { ...p.plan[field], sha256: "f".repeat(64) } });
    assert.throws(() => E.validateEditorialRevisionPlan(forged, p.artifacts), field);
  }
  assert.equal(E.EditorialRevisionPlanSchema.safeParse({ ...p.plan, ffmpeg: "-i file", code: "execute()" }).success, false);
  assert.throws(() => E.validateEditorialRevisionPlan(changed(p.plan, "planId", "editorial_revision_plan_v0", {
    allowedScope: { ...p.plan.allowedScope, interval: { startTicks: 0, endTicks: c.graph.output.durationTicks } } }), p.artifacts), /editorial_plan_replay_mismatch/);
});
test("3C-I01/J02 editorial lineage requires exact plan, legacy strict readers remain closed", () => {
  const c = base(), p = editProposal(c, 1); E.validateRevisionLineage(p.child, p.artifacts);
  assert.equal(GraphDiffSchema.safeParse(p.diff).success, false); assert.equal(EditGraphRevisionSchema.safeParse(p.child).success, false);
  assert.throws(() => E.validateRevisionLineage(p.child, p.artifacts.filter(a => a.ref.objectId !== p.plan.planId)));
  assert.throws(() => E.validateRevisionLineage(p.child, p.artifacts.filter(a => a.ref.objectId !== p.request.requestId)));
  assert.deepEqual(validateAnyEditGraph(p.child, p.artifacts), p.child);
});
