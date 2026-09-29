import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import * as E from "../packages/edit-editorial/index.js";
import { openLocalEditingProject } from "../scripts/edit-editorial-local.js";
import { cfrMetadata, renderGraph } from "./support/edit-render.js";
import { openValidatedDag } from "../packages/edit-runtime/index.js";
import { renderDag } from "./support/edit-render.js";
import { reviewedChain, repaired, planningInput, revisionDag } from "./support/edit-repair.js";
import { MANUAL, clipTarget, editProposal, editorialFixture, requestFor } from "./support/edit-editorial.js";
import { observeMediaSpawns } from "./support/edit-render-media.js";
const producer = { implementationId: "manual_editor", version: "0.1.0", basis: "manual_typed_action" as const };
test("3C-E01/E02/P01 current store refuses alternate initialization and concurrent state CAS", async t => {
  await mkdir(".test-artifacts", { recursive: true }); const root = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3c-head-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const g = renderGraph({ sources: [{ key: "head_a", hash: "a".repeat(64), metadata: cfrMetadata() }] });
  const project = await openLocalEditingProject({ root, scope: g.graph.scope, policy: E.createEditorialPolicy(g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) });
  const c = await project.initialize(g.graph, g.artifacts);
  await assert.rejects(project.initialize(g.graph, g.artifacts), /head_already_initialized/);
  const target = E.targetOf(c.graph, c.graph.clipUses[0]!.clipUseId);
  const request = E.createEditorialRequest({ scope: c.head.scope, requestKey: "lock_a", rawUserText: "Keep the first shot exactly as it is.",
    baseHead: E.headRef(c.head), baseGraph: c.head.currentGraph, baseState: c.head.currentState, selectedTarget: target, referencedRevision: null, allowedScope: null });
  const intent = E.createEditorialIntent(request, { kind: "lock_target", target }, producer, c);
  const results = await Promise.allSettled([project.applyStateIntent(request, intent), project.applyStateIntent(request, intent)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  const current = await project.current();
  assert.equal(current.head.headRevision, 1); assert.equal(current.state.hardLocks.length, 1);
  assert.equal(current.graph.editGraphId, c.graph.editGraphId);
  await assert.rejects(project.applyStateIntent(request, intent), /stale_editing_head/);
  const reopened = await openLocalEditingProject({ root, scope: g.graph.scope, policy: E.createEditorialPolicy(g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) });
  assert.deepEqual((await reopened.current()).head, current.head);
});

test("3C-L01 only A refuses downstream placement spill even without a lock", async t => {
  await mkdir(".test-artifacts", { recursive: true }); const root = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3c-scope-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const g = editorialFixture(), x = renderDag(g), v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  const project = await openLocalEditingProject({ root, scope: g.graph.scope, policy: E.createEditorialPolicy(g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) });
  const c = await project.initialize(g.graph, x.artifacts), p = editProposal(c, 0);
  const child = revisionDag(g, p.child, p.artifacts), cv = openValidatedDag({ dag: child.dagArtifact.ref }, child.artifacts);
  await assert.rejects(project.authorize({ ...p, artifacts: child.artifacts, parentDag: v, childDag: cv }), /editorial_scope_spill/);
  assert.equal((await project.current()).head.headId, c.head.headId);
});

test("3C-K01 accepted critic RepairPlan lineage cannot advance a locked project", async t => {
  const reviewed = await reviewedChain(t), p = await repaired(reviewed);
  await mkdir(".test-artifacts", { recursive: true }); const root = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3c-critic-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = await openLocalEditingProject({ root, scope: reviewed.g.graph.scope,
    policy: E.createEditorialPolicy(reviewed.g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) });
  const c = await project.initialize(reviewed.g.graph, reviewed.c.artifacts), target = clipTarget(c, 0), request = requestFor(c, target);
  const locked = await project.applyStateIntent(request, E.createEditorialIntent(request, { kind: "lock_target", target }, MANUAL, c));
  const child = revisionDag(reviewed.g, p.child, p.artifacts), cv = openValidatedDag({ dag: child.dagArtifact.ref }, child.artifacts);
  await assert.rejects(project.authorize({ diff: p.diff, child: p.child, artifacts: child.artifacts, parentDag: reviewed.c.v, childDag: cv,
    repair: [planningInput(reviewed)] }), /hard_lock_conflict/);
  assert.equal((await project.current()).head.headId, locked.head.headId);
});

test("3C-C05/N01 explicit unlock and preference turns invoke zero native processes", async t => {
  await mkdir(".test-artifacts", { recursive: true }); const root = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3c-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const g = editorialFixture(), project = await openLocalEditingProject({ root, scope: g.graph.scope,
    policy: E.createEditorialPolicy(g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) });
  let c = await project.initialize(g.graph, g.artifacts);
  const observer = observeMediaSpawns(); t.after(observer.restore);
  const initialRenderArtifacts = c.artifacts.filter(a => ["RenderProgram", "RenderExecutionReceipt"].includes(a.ref.artifactType));
  for (const kind of ["lock_target", "set_preference", "unlock_target", "clear_preference"] as const) {
    const target = clipTarget(c, 0), request = requestFor(c, target);
    const action = kind === "unlock_target" ? { kind, lockId: c.state.hardLocks[0]!.lockId }
      : kind === "set_preference" ? { kind, target, value: "rejected" as const } : { kind, target };
    c = await project.applyStateIntent(request, E.createEditorialIntent(request, action, MANUAL, c));
  }
  assert.equal(observer.calls.length, 0); assert.equal(c.head.headRevision, 4);
  assert.deepEqual(c.artifacts.filter(a => ["RenderProgram", "RenderExecutionReceipt"].includes(a.ref.artifactType)), initialRenderArtifacts);
  assert.equal(c.state.hardLocks.length, 0); assert.equal(c.state.preferences.length, 0); assert.equal(c.graph.editGraphId, g.graph.editGraphId);
});
