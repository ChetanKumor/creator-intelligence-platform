import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { identify } from "../packages/editorial/common.js";
import { applyGraphDiff, createGraphDiff, supplied } from "../packages/edit-graph/index.js";
import * as E from "../packages/edit-editorial/index.js";
import { EditorialExecutionAuthorization, openLocalEditingProject } from "../scripts/edit-editorial-local.js";
import { MANUAL, clipTarget, context, editProposal, editorialFixture, requestFor, stateAction } from "./support/edit-editorial.js";
import { planningInput, repaired, reviewedChain } from "./support/edit-repair.js";
async function projectFor(t: TestContext) {
  await mkdir(".test-artifacts", { recursive: true }); const root = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3c-hostile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const g = editorialFixture(), project = await openLocalEditingProject({ root, scope: g.graph.scope,
    policy: E.createEditorialPolicy(g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) }); return { project, g };
}
test("3C-HR1 C22 local interpreter captures producer and callable before its first await", async t => {
  const { project, g } = await projectFor(t), c = await project.initialize(g.graph, g.artifacts), r = requestFor(c), target = clipTarget(c, 0);
  const identity = { implementationId: "original_fixture", version: "0.1.0", basis: "deterministic_fixture" as const };
  const port: E.EditorialInterpreterPort = { identity, async interpret() { return { kind: "lock_target", target }; } };
  const pending = project.interpret(r, port);
  identity.implementationId = "caller_replacement";
  port.interpret = async () => ({ kind: "unsupported", reason: "unsupported_capability" });
  const accepted = await pending;
  assert.equal(accepted.producer.implementationId, "original_fixture");
  assert.equal(accepted.action.kind, "lock_target");
});
test("3C-HR2 C2/C26 initialization cannot promote an unrendered revision through a fresh head", async t => {
  const { project } = await projectFor(t), c = context(), p = editProposal(c, 1);
  await assert.rejects(project.initialize(p.child, p.artifacts), /initial_graph_required/);
  await assert.rejects(project.current(), /editing_head_missing/);
});
test("3C-HR3 C21 malformed provider data always becomes a structured refusal", async () => {
  const c = context(), r = requestFor(c);
  await assert.rejects(E.interpretEditorialRequest(r, c, { identity: { ...MANUAL, basis: "deterministic_fixture" },
    async interpret() { return { kind: "unsupported", reason: 1n }; } }), (e: unknown) => e instanceof E.EditorialControlError);
});
test("3C-HC1 C1/C2 caller-selected unlocked state or valid alternate head cannot bypass a stored lock", async t => {
  const { project, g } = await projectFor(t), root = await project.initialize(g.graph, g.artifacts), target = clipTarget(root, 0), r = requestFor(root);
  const locked = await project.applyStateIntent(r, E.createEditorialIntent(r, { kind: "lock_target", target }, MANUAL, root));
  const alternative = stateAction(locked, { op: "remove_hard_lock", lockId: locked.state.hardLocks[0]!.lockId });
  const p = editProposal(alternative, 0, true);
  await assert.rejects(project.propose(p.request, p.intent), /stale_editing_head/);
  const mixed = { ...p.request, baseHead: E.headRef(locked.head) }; const body = { ...mixed } as Record<string, unknown>; delete body.requestId;
  const request = identify("editorial_request_v0", "requestId", body);
  await assert.rejects(project.propose(request, p.intent), /stale_editing_head/);
  assert.equal((await project.current()).state.hardLocks.length, 1);
  assert.equal((await project.current()).head.headId, locked.head.headId);
});
test("3C-HC2 C13/C14 reidentified child state cannot drop or retarget a carried lock", () => {
  const c = context(), locked = stateAction(c, { op: "add_hard_lock", target: clipTarget(c, 0) }), p = editProposal(locked, 1);
  for (const hardLocks of [[], [{ ...p.state.hardLocks[0]!, target: E.targetOf(p.child, p.child.clipUses.filter(c => c.medium === "video")[1]!.clipUseId) }]]) {
    const body = { ...p.state, hardLocks } as Record<string, unknown>; delete body.stateId;
    assert.throws(() => E.validateEditorialState(identify("editorial_state_v0", "stateId", body), p.artifacts), /editorial_state_replay_mismatch/);
  }
});
test("3C-HC3 C7/C20/C25/C26 arbitrary mutation/origin has no revision authorization", () => {
  const c = context(), p = editProposal(c, 1), body = { ...p.diff } as Record<string, unknown>; delete body.graphDiffId;
  assert.throws(() => createGraphDiff({ ...body, operations: [{ op: "remove_hard_lock", lockId: "x" }] }));
  assert.throws(() => createGraphDiff({ ...body, operations: "trim the tail" }));
  assert.throws(() => createGraphDiff({ ...body, origin: { kind: "user_text", text: "do it" } }));
  const missing = { objectId: "repair_plan_missing", sha256: "f".repeat(64), artifactType: "RepairPlan", artifactVersion: "0.1.0" };
  const diff = createGraphDiff({ ...body, origin: { kind: "repair_plan", repairPlan: missing, repairPlanId: missing.objectId } });
  const artifacts = [...c.artifacts, supplied(diff, diff.graphDiffId)], child = applyGraphDiff(c.graph, diff, artifacts);
  assert.throws(() => E.validateRevisionLineage(child, artifacts));
});
test("3C-HC4 C8/C9/C33 graph/state mismatch and composition duplication refuse", () => {
  const c = context(), p = editProposal(c, 1);
  assert.throws(() => E.createEditingHead(p.child, c.state, c.head, { kind: "state_only", diff: supplied(p.diff, p.diff.graphDiffId).ref }), /head_graph_state_mismatch/);
  assert.equal(E.EditorialStateSchema.safeParse({ ...c.state, timeline: c.graph.clipUses }).success, false);
  assert.throws(() => E.createRootEditorialState({ ...c.graph, hardLocks: [] }, c.artifacts));
});
test("3C-HC5 C36 off-grid and float trim authority fail before a plan", () => {
  const c = context(), target = clipTarget(c, 0), r = requestFor(c, target, { graph: c.head.currentGraph, clipUseIds: [target.clipUseId],
    interval: target.interval, ticksPerSecond: target.ticksPerSecond });
  for (const end of [0.5, { value: 1, rate: { numerator: 7, denominator: 1 } }, { value: 1, rate: { numerator: 100, denominator: 1 } }]) {
    assert.throws(() => E.createEditorialIntent(r, { kind: "request_edit", target, operation: "trim_clip_source_range",
      keep: { start: c.graph.clipUses[0]!.source.range.start, end } }, MANUAL, c));
  }
});
test("3C-HC6 C39/C40 code, paths and future targets cannot enter typed authority", async () => {
  const c = context(), r = requestFor(c, clipTarget(c, 0), null, "ffmpeg -i C:\\private\\x.mov; remove something");
  const intent = await E.interpretEditorialRequest(r, c, { identity: { ...MANUAL, basis: "deterministic_fixture" },
    async interpret() { return { kind: "unsupported", reason: "unsupported_capability" }; } });
  assert.equal(intent.action.kind, "unsupported");
  assert.equal(E.TargetSchema.safeParse({ ...clipTarget(c, 0), kind: "motion_keyframe" }).success, false);
  assert.equal(E.IntentActionSchema.safeParse({ kind: "request_edit", shell: "ffmpeg", code: "execute()", path: "C:\\private" }).success, false);
  await assert.rejects(EditorialExecutionAuthorization.assertCurrent({ graph: c.graph }, c.graph), /current_revision_authorization_required/);
});
test("3C-HC7 C27/C28 mixed repair and editorial ancestry keeps complete OR1 repair evidence mandatory", async t => {
  const parent = await reviewedChain(t), repair = await repaired(parent);
  const state = E.createRootEditorialState(repair.child, repair.artifacts), head = E.createEditingHead(repair.child, state, null, { kind: "initial" });
  // Pure records describe ancestry; this historical context is deliberately not an initialized current project.
  const c = { graph: repair.child, state, head, artifacts: [...repair.artifacts, supplied(state, state.stateId), supplied(head, head.headId)] };
  const p = editProposal(c, 1), step = planningInput(parent);
  E.validateRevisionLineage(p.child, p.artifacts, [step]);
  assert.equal(p.child.revision, 2); assert.equal(p.child.artifactVersion, "0.4.0");
  assert.throws(() => E.validateRevisionLineage(p.child, p.artifacts), /repair_lineage_invalid/);
  assert.throws(() => E.validateRevisionLineage(p.child, p.artifacts, [{ ...step, observations: [] }]));
});
