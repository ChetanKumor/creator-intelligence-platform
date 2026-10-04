// Gate 7 Batch 3E-A: exact-identity validation reuse at the current-head boundary (A01-A08), one replay per immutable ancestor inside one
// top-level validation (A09-A14), reuse that never refuses on its own (A15), and refusal parity (P00-P17). Structural counts, never wall-clock,
// decide every assertion here.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import type { ArtifactRef } from "../packages/editorial/common.js";
import { supplied, validateAnyEditGraph, type AnyEditGraph, type GraphDiff } from "../packages/edit-graph/index.js";
import { addTimes, canonicalTime, tickTime, type ExactRange } from "../packages/edit-graph/common.js";
import * as E from "../packages/edit-editorial/index.js";
import { openValidatedDag } from "../packages/edit-runtime/index.js";
import { EditorialExecutionAuthorization, openLocalEditingProject, type LocalEditingProject } from "../scripts/edit-editorial-local.js";
import { renderDag } from "./support/edit-render.js";
import { revisionDag } from "./support/edit-repair.js";
import { MANUAL, clipTarget, editProposal, editorialFixture, requestFor } from "./support/edit-editorial.js";
import { artifactName, buildChain, counted, forgeAccessTime, forgeGraphChain, forgeState, nextHead, reidentify, slotBytes, slotName, stepsFor, summary,
  writeStore } from "./support/edit-editorial-chains.js";

const OWNER = { kind: "owner" as const, actorId: "owner_synthetic" };
let chain: E.CurrentEditingContext[] | undefined;
/** Heads 0..6 of one synthetic history: lock, trim, preference, trim, preference, trim (graph revisions 0..3). Built once per file. */
const heads = () => chain ??= buildChain(stepsFor(6));
const uniqueGraphs = (c: E.CurrentEditingContext) => c.graph.revision + 1;
async function store(t: TestContext, prefix: readonly E.CurrentEditingContext[], scope: unknown = prefix[0]!.head.scope) {
  await mkdir(".test-artifacts", { recursive: true });
  const base = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3e-a-")); t.after(() => rm(base, { recursive: true, force: true }));
  const { root, key } = await writeStore(base, prefix);
  return { base, root, key, project: await open(base, scope) };
}
const open = (base: string, scope: unknown): Promise<LocalEditingProject> => openLocalEditingProject({ root: base, scope,
  policy: E.createEditorialPolicy(scope, OWNER) });
/** A forged head at the same slot: the given graph/state bindings, re-identified; its previous-head linkage is unchanged. */
function forgedHead(c: E.CurrentEditingContext, o: { graph?: AnyEditGraph; state?: E.EditorialState; transition?: E.EditingHead["transition"] }): E.CurrentEditingContext {
  const graph = o.graph ?? c.graph, state = o.state ?? c.state;
  const head = reidentify(c.head, "headId", "editing_head_v0", body => {
    body.currentGraph = E.graphBinding(graph); body.currentState = E.stateRef(state); if (o.transition) body.transition = o.transition;
  });
  return { graph, state, head, artifacts: E.joinArtifacts(c.artifacts, [supplied(graph, graph.editGraphId), supplied(state, state.stateId), supplied(head, head.headId)]) };
}
/** Rewrites one slot (and adds its artifacts) in place. */
async function replaceSlot(s: { root: string; key: string }, c: E.CurrentEditingContext): Promise<void> {
  for (const a of c.artifacts) await writeFile(join(s.root, artifactName(a.ref)), a.bytes);
  await writeFile(join(s.root, slotName(s.key, c.head.headRevision)), slotBytes(c));
}
const graphsOf = (h: readonly E.CurrentEditingContext[]) => h.filter((c, i) => i === 0 || c.graph.editGraphId !== h[i - 1]!.graph.editGraphId).map(c => c.graph);
/** A schema-valid state forgery that only replay refuses: one extra soft preference on the state's own graph. */
const extraPreference = (c: E.CurrentEditingContext) => (body: Record<string, unknown>) => {
  body.preferences = [...(body.preferences as unknown[]), { target: clipTarget(c, 1), value: "rejected", setBy: E.graphBinding(c.graph).artifact }];
};

// ================================================================ A1: exact-identity reuse of a successful current() replay
test("3E-A01 an unchanged exact head reuses its successful replay; every slot and artifact is still read and hashed", async t => {
  const h = heads(), s = await store(t, h.slice(0, 5));
  const cold = await counted(() => s.project.current()), warm = await counted(() => s.project.current());
  assert.equal(cold.error, undefined); assert.equal(warm.error, undefined);
  assert.equal(cold.value!.head.headId, h[4]!.head.headId);
  assert.ok(cold.counts.constructions > 0, "the first call replays");
  assert.deepEqual(summary(warm.counts).constructions, 0, "an unchanged exact head is not replayed again");
  assert.equal(warm.counts.applications.size, 0);
  assert.equal(warm.counts.fileOpens, cold.counts.fileOpens, "every slot and artifact is re-read");
  assert.equal(warm.counts.bytesRead, cold.counts.bytesRead);
  assert.ok(warm.counts.hashes > 0 && warm.counts.hashes < cold.counts.hashes, "every byte is re-hashed; only the replay is reused");
  assert.deepEqual(warm.value!.head, cold.value!.head); assert.deepEqual(warm.value!.graph, cold.value!.graph);
  assert.deepEqual(warm.value!.state, cold.value!.state); assert.deepEqual(warm.value!.artifacts.map(a => a.ref), cold.value!.artifacts.map(a => a.ref));
  // Results stay defensive copies: a caller mutating one result changes nothing another call returns.
  cold.value!.graph.clipUses.length = 0; cold.value!.state.hardLocks.length = 0; warm.value!.graph.operations.length = 0;
  const again = await s.project.current();
  assert.deepEqual(again.graph, h[4]!.graph); assert.deepEqual(again.state, h[4]!.state);
});

test("3E-A02 any changed head-slot byte misses: a whitespace-only change is replayed again, a corrupting change is refused", async t => {
  const h = heads(), s = await store(t, h.slice(0, 5)); await s.project.current();
  const latest = join(s.root, slotName(s.key, 4)), first = join(s.root, slotName(s.key, 0)), bytes = await readFile(latest), firstBytes = await readFile(first);
  await writeFile(latest, Buffer.concat([bytes, Buffer.from(" ")]));
  const changed = await counted(() => s.project.current());
  assert.equal(changed.value?.head.headId, h[4]!.head.headId); assert.ok(changed.counts.constructions > 0, "a changed latest slot is replayed");
  await writeFile(first, Buffer.concat([Buffer.from("\n"), firstBytes]));
  const older = await counted(() => s.project.current());
  assert.equal(older.value?.head.headId, h[4]!.head.headId); assert.ok(older.counts.constructions > 0, "a changed earlier slot is replayed");
  await writeFile(latest, Buffer.from(bytes.toString("utf8").replace("\"headRevision\":4", "\"headRevision\":3")));
  assert.equal((await counted(() => s.project.current())).error, "editorial_input_invalid");
  await writeFile(latest, Buffer.from(bytes.toString("utf8").replace("\"headRevision\":4", "\"headRevision\":5")));
  assert.equal((await counted(() => s.project.current())).error, "editorial_input_invalid");
  await writeFile(latest, bytes); await writeFile(first, firstBytes);
  assert.equal((await s.project.current()).head.headId, h[4]!.head.headId);
});

test("3E-A03 a replaced, re-encoded or missing referenced artifact is refused fail-closed, never answered from a prior replay", async t => {
  const h = heads(), s = await store(t, h.slice(0, 5)); await s.project.current();
  const statePath = join(s.root, artifactName(E.stateRef(h[4]!.state))), graphPath = join(s.root, artifactName(E.graphBinding(h[4]!.graph).artifact));
  const stateBytes = await readFile(statePath), graphBytes = await readFile(graphPath);
  await writeFile(statePath, Buffer.from(JSON.stringify(JSON.parse(stateBytes.toString("utf8")), null, 1)));
  assert.equal((await counted(() => s.project.current())).error, "editing_store_corrupt", "a JSON-equivalent re-encoding is other bytes");
  await writeFile(statePath, stateBytes);
  await writeFile(graphPath, await readFile(join(s.root, artifactName(E.graphBinding(h[2]!.graph).artifact))));
  assert.equal((await counted(() => s.project.current())).error, "editing_store_corrupt", "another genuine graph under this name is refused");
  await writeFile(graphPath, graphBytes);
  await unlink(statePath);
  assert.equal((await counted(() => s.project.current())).error, "editing_store_corrupt", "a missing artifact is refused");
  await writeFile(statePath, stateBytes);
  assert.equal((await s.project.current()).head.headId, h[4]!.head.headId);
});

test("3E-A04 an appended head slot is replayed on its own; a prior replay never validates the new head", async t => {
  const h = heads(), s = await store(t, h.slice(0, 5)); await s.project.current();
  await replaceSlot(s, h[5]!);
  const next = await counted(() => s.project.current());
  assert.equal(next.value?.head.headId, h[5]!.head.headId); assert.ok(next.counts.constructions > 0, "the new head is replayed");
  const f = await store(t, h.slice(0, 5)); await f.project.current();
  await replaceSlot(f, forgeState(h[5]!, h[4]!.head, extraPreference(h[5]!)));
  const forged = await counted(() => f.project.current());
  assert.equal(forged.error, "editorial_state_replay_mismatch"); assert.ok(forged.counts.constructions > 0);
});

test("3E-A05 changed graph, state or reference linkage misses and keeps the exact accepted refusal", async t => {
  const h = heads(), s = await store(t, h.slice(0, 5)); await s.project.current();
  const cases: [string, E.CurrentEditingContext, string][] = [];
  cases.push(["forged state", forgeState(h[4]!, h[3]!.head, extraPreference(h[4]!)), "editorial_state_replay_mismatch"]);
  const graph = reidentify(h[4]!.graph, "editGraphId", "edit_graph_v0", forgeAccessTime);
  cases.push(["forged graph", forgedHead(h[4]!, { graph, state: reidentify(h[4]!.state, "stateId", "editorial_state_v0", b => { b.currentGraph = E.graphBinding(graph); }) }),
    "graph_replay_mismatch"]);
  cases.push(["state of the previous head", forgedHead(h[4]!, { state: h[3]!.state }), "head_graph_state_mismatch"]);
  cases.push(["transition of the previous head", forgedHead(h[4]!, { transition: h[3]!.head.transition }), "head_transition_invalid"]);
  for (const [name, forged, code] of cases) {
    await replaceSlot(s, forged);
    const result = await counted(() => s.project.current());
    assert.equal(result.error, code, name);
  }
  await replaceSlot(s, h[4]!);
  assert.equal((await s.project.current()).head.headId, h[4]!.head.headId);
});

test("3E-A06 a failed validation is never memoized: every repeat replays in full and refuses identically", async t => {
  const h = heads(), s = await store(t, [...h.slice(0, 4), forgeState(h[4]!, h[3]!.head, extraPreference(h[4]!))]);
  const first = await counted(() => s.project.current()), second = await counted(() => s.project.current());
  assert.equal(first.error, "editorial_state_replay_mismatch"); assert.equal(second.error, first.error);
  assert.ok(first.counts.constructions > 0); assert.equal(second.counts.constructions, first.counts.constructions, "no partial success is reused");
  // A head whose replay succeeds but whose transition check then fails is not remembered either.
  await replaceSlot(s, forgedHead(h[4]!, { transition: h[3]!.head.transition }));
  const late = await counted(() => s.project.current()), lateAgain = await counted(() => s.project.current());
  assert.equal(late.error, "head_transition_invalid"); assert.equal(lateAgain.error, late.error);
  assert.ok(late.counts.constructions > 0); assert.equal(lateAgain.counts.constructions, late.counts.constructions, "a replay followed by a refusal is not reused");
  await replaceSlot(s, h[4]!);
  const valid = await counted(() => s.project.current());
  assert.equal(valid.value?.head.headId, h[4]!.head.headId); assert.ok(valid.counts.constructions > 0);
});

test("3E-A07 a replay is private to one project instance, root and scope; swapped store content is replayed", async t => {
  const h = heads(), s = await store(t, h.slice(0, 5)); await s.project.current();
  assert.equal(JSON.stringify(s.project), "{}", "a project exposes no serializable state"); assert.deepEqual(Object.keys(s.project), []);
  const sibling = await counted(async () => (await open(s.base, h[0]!.head.scope)).current());
  assert.equal(sibling.value?.head.headId, h[4]!.head.headId); assert.ok(sibling.counts.constructions > 0, "another instance replays");
  await mkdir(".test-artifacts", { recursive: true });
  const copy = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3e-a-copy-")); t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(join(s.base, "editing-control"), join(copy, "editing-control"), { recursive: true });
  const copied = await counted(async () => (await open(copy, h[0]!.head.scope)).current());
  assert.equal(copied.value?.head.headId, h[4]!.head.headId); assert.ok(copied.counts.constructions > 0, "another root replays");
  const other = { ...h[0]!.head.scope, projectId: "project_b3e_a_other" };
  assert.equal((await counted(async () => (await open(s.base, other)).current())).error, "editing_head_missing", "another scope sees none of this project");
  // The same instance over other store content at the same head revision: a different exact history is replayed, never reused.
  const y = buildChain(["lock", "pref", "pref", "pref"]);
  for (const c of y.slice(2)) await replaceSlot(s, c);
  const swapped = await counted(() => s.project.current());
  assert.equal(swapped.value?.head.headId, y[4]!.head.headId); assert.notEqual(y[4]!.head.headId, h[4]!.head.headId);
  assert.ok(swapped.counts.constructions > 0);
});

test("3E-A08 stale-head refusals are unchanged: a moved head refuses an old authorization, request and proposal", async t => {
  await mkdir(".test-artifacts", { recursive: true }); const root = await mkdtemp(join(process.cwd(), ".test-artifacts", "b3e-a-stale-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const g = editorialFixture(), x = renderDag(g), v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  const project = await open(root, g.graph.scope), c0 = await project.initialize(g.graph, x.artifacts);
  const lockTarget = clipTarget(c0, 0), lock = requestFor(c0, lockTarget), c1 = await project.applyStateIntent(lock, E.createEditorialIntent(lock, { kind: "lock_target", target: lockTarget }, MANUAL, c0));
  const p = editProposal(c1, 1), child = revisionDag(g, p.child, p.artifacts), cv = openValidatedDag({ dag: child.dagArtifact.ref }, child.artifacts);
  const authorization = await project.authorize({ ...p, artifacts: child.artifacts, parentDag: v, childDag: cv });
  await EditorialExecutionAuthorization.assertCurrent(authorization, p.child); await EditorialExecutionAuthorization.assertCurrent(authorization, p.child);
  const pref = requestFor(c1, clipTarget(c1, 0)), c2 = await project.applyStateIntent(pref, E.createEditorialIntent(pref, { kind: "set_preference", target: clipTarget(c1, 0), value: "liked" }, MANUAL, c1));
  assert.equal(c2.head.headRevision, 2);
  await assert.rejects(EditorialExecutionAuthorization.assertCurrent(authorization, p.child), /stale_editing_head/);
  await assert.rejects(project.applyStateIntent(lock, E.createEditorialIntent(lock, { kind: "lock_target", target: lockTarget }, MANUAL, c0)), /stale_editing_head/);
  await assert.rejects(project.propose(p.request, p.intent), /stale_editing_head/);
  await assert.rejects(EditorialExecutionAuthorization.assertCurrent(authorization, p.child), /stale_editing_head/, "a repeat refuses identically");
  const reopened = await open(root, g.graph.scope);
  assert.equal((await reopened.current()).head.headId, c2.head.headId);
  await assert.rejects(EditorialExecutionAuthorization.assertCurrent(authorization, p.child), /stale_editing_head/);
});

// ================================================================ A2: one replay per immutable ancestor inside one top-level validation
test("3E-A09 a cold state validation replays each state ancestor once", async t => {
  for (const depth of [2, 4, 6]) {
    const h = heads().slice(0, depth + 1), top = h[depth]!;
    const pure = summary((await counted(() => E.validateEditorialState(top.state, top.artifacts))).counts);
    assert.equal(pure.stateDiffReplays, h.filter(c => c.state.change.kind === "state_diff").length, `depth ${depth}`);
    assert.equal(pure.maxReplaysPerStateDiff, 1, `depth ${depth}: no state diff replays twice`);
    assert.ok(pure.maxParsesPerState <= 3, `depth ${depth}: each state is read for its own replay and once as a parent`);
    const s = await store(t, h), cold = summary((await counted(() => s.project.current())).counts);
    assert.equal(cold.maxReplaysPerStateDiff, 1, `depth ${depth}: current()`); assert.ok(cold.maxParsesPerState <= 3, `depth ${depth}: current()`);
  }
});

test("3E-A10 a cold validation constructs each immutable graph ancestor exactly once", async t => {
  const h = heads(), top = h[6]!;
  const pure = summary((await counted(() => E.validateEditorialState(top.state, top.artifacts))).counts);
  assert.deepEqual({ constructions: pure.constructions, root: pure.rootConstructions, revisions: pure.revisionsApplied, maxPerRevision: pure.maxApplicationsPerRevision },
    { constructions: uniqueGraphs(top), root: 1, revisions: top.graph.revision, maxPerRevision: 1 });
  const s = await store(t, h), cold = summary((await counted(() => s.project.current())).counts);
  assert.deepEqual({ constructions: cold.constructions, root: cold.rootConstructions, revisions: cold.revisionsApplied, maxPerRevision: cold.maxApplicationsPerRevision },
    { constructions: uniqueGraphs(top), root: 1, revisions: top.graph.revision, maxPerRevision: 1 });
});

test("3E-A11 deeper history adds only its new graph constructions: no visited ancestor is constructed again in the same call", async t => {
  const observed: Record<string, number> = {}, expected: Record<string, number> = {};
  for (const depth of [1, 2, 3, 4, 5, 6]) {
    const h = heads().slice(0, depth + 1), top = h[depth]!, s = await store(t, h);
    observed[`pure_${depth}`] = (await counted(() => E.validateEditorialState(top.state, top.artifacts))).counts.constructions;
    observed[`current_${depth}`] = (await counted(() => s.project.current())).counts.constructions;
    expected[`pure_${depth}`] = expected[`current_${depth}`] = uniqueGraphs(top);
  }
  assert.deepEqual(observed, expected);
});

test("3E-A12 a malformed state ancestor at every depth and a malformed graph ancestor at every revision are still found and refused", async t => {
  const h = heads();
  for (let k = 0; k < 6; k += 1) {
    const forged = forgeState(h[k]!, k === 0 ? null : h[k - 1]!.head, extraPreference(h[k]!));
    const history = [...h.slice(0, k), ...buildChain(Array.from({ length: 6 - k }, () => "pref" as const), forged)], top = history[6]!;
    assert.equal((await counted(() => E.validateEditorialState(top.state, top.artifacts))).error, "editorial_state_replay_mismatch", `state ancestor at depth ${k}`);
    const s = await store(t, history);
    assert.equal((await counted(() => s.project.current())).error, "editorial_state_replay_mismatch", `current() with a state ancestor forged at depth ${k}`);
  }
  const graphs = graphsOf(h);
  assert.equal(graphs.length, 4);
  for (let k = 0; k < graphs.length; k += 1) {
    const forged = forgeGraphChain(graphs, k), artifacts = E.joinArtifacts(h[6]!.artifacts, forged.map(g => supplied(g, g.editGraphId)));
    assert.equal((await counted(() => validateAnyEditGraph(forged[forged.length - 1], artifacts))).error, "graph_replay_mismatch", `graph ancestor at revision ${k}`);
  }
});

test("3E-A13 a malformed graph named by a valid-looking state still refuses, in pure validation and at the current head", async t => {
  const h = heads(), top = h[6]!, graphs = graphsOf(h);
  for (const k of [0, 1, 3]) {
    const forged = forgeGraphChain(graphs, k), graph = forged[forged.length - 1]!;
    const state = reidentify(top.state, "stateId", "editorial_state_v0", b => { b.currentGraph = E.graphBinding(graph); });
    const artifacts = E.joinArtifacts(top.artifacts, [...forged.map(g => supplied(g, g.editGraphId)), supplied(state, state.stateId)]);
    assert.equal((await counted(() => E.validateEditorialState(state, artifacts))).error, "graph_replay_mismatch", `pure, forged revision ${k}`);
    const s = await store(t, [...h.slice(0, 6), forgedHead({ ...top, artifacts }, { graph, state })]);
    assert.equal((await counted(() => s.project.current())).error, "graph_replay_mismatch", `current(), forged revision ${k}`);
  }
  // Reuse never outlives its call: right after a successful validation, the same list, damaged in place (an ancestor's GraphDiff removed),
  // refuses exactly as before.
  const list = [...top.artifacts], firstDiff = (h[2]!.head.transition as { diff: ArtifactRef }).diff;
  assert.equal((await counted(() => E.validateEditorialState(top.state, list))).error, undefined);
  list.splice(list.findIndex(a => a.ref.objectId === firstDiff.objectId), 1);
  assert.equal((await counted(() => E.validateEditorialState(top.state, list))).error, "graph_replay_mismatch");
});

test("3E-A14 impossible ancestry still refuses exactly as before", async t => {
  const h = heads(), observed: Record<string, string | undefined> = {};
  const descendantParent = reidentify(h[2]!.state, "stateId", "editorial_state_v0", b => { b.parentState = E.stateRef(h[3]!.state); });
  observed["state_parent_is_descendant"] = (await counted(() => E.validateEditorialState(descendantParent, E.joinArtifacts(h[3]!.artifacts,
    [supplied(descendantParent, descendantParent.stateId)])))).error;
  const wrongDigest = reidentify(h[3]!.state, "stateId", "editorial_state_v0", b => { b.parentState = { ...E.stateRef(h[2]!.state), sha256: "0".repeat(64) }; });
  observed["state_parent_wrong_digest"] = (await counted(() => E.validateEditorialState(wrongDigest, E.joinArtifacts(h[3]!.artifacts,
    [supplied(wrongDigest, wrongDigest.stateId)])))).error;
  const graphs = graphsOf(h), g1 = graphs[1]!, g2 = graphs[2]!;
  const graphParentIsDescendant = reidentify(g1, "editGraphId", "edit_graph_v0", b => {
    b.parent = { state: "present", editGraph: supplied(g2, g2.editGraphId).ref, editGraphId: g2.editGraphId, revision: g2.revision };
  });
  observed["graph_parent_is_descendant"] = (await counted(() => validateAnyEditGraph(graphParentIsDescendant, h[4]!.artifacts))).error;
  const graphParentIsSelfRevision = reidentify(g2, "editGraphId", "edit_graph_v0", b => { b.revision = 1; });
  observed["graph_revision_not_after_parent"] = (await counted(() => validateAnyEditGraph(graphParentIsSelfRevision, h[4]!.artifacts))).error;
  const s = await store(t, [...h.slice(0, 3), forgedHead(h[3]!, { state: wrongDigest })]);
  observed["current_state_parent_wrong_digest"] = (await counted(() => s.project.current())).error;
  assert.deepEqual(observed, {
    state_parent_is_descendant: "editorial_rebase_invalid",
    state_parent_wrong_digest: "Error: Conflicting artifact identity.",
    graph_parent_is_descendant: "input_invalid",
    graph_revision_not_after_parent: "input_invalid",
    current_state_parent_wrong_digest: "Error: Conflicting artifact identity.",
  });
});

const diffOf = (c: E.CurrentEditingContext) => E.artifactMap(c.artifacts).get((c.head.transition as { diff: ArtifactRef }).diff) as GraphDiff;
test("3E-A15 the reuse machinery never raises a refusal of its own: over-budget artifact lists keep their exact accepted outcome", async () => {
  const h = heads(), observed: Record<string, string> = {};
  const padding = Array.from({ length: E.LIMITS.artifacts + 1 }, (_, i) => {
    const value = { artifactType: "Padding3EA", artifactVersion: "0.1.0", index: i }; return supplied(value, `padding_3ea_${i}`);
  });
  const big = [...h[2]!.artifacts, ...padding];
  observed["root_state"] = (await counted(() => E.createRootEditorialState(h[0]!.graph, big))).error ?? "accepted";
  observed["invalid_rebase"] = (await counted(() => E.rebaseEditorialState(h[2]!.state, h[2]!.graph, diffOf(h[2]!), big))).error ?? "accepted";
  observed["valid_rebase"] = (await counted(() => E.rebaseEditorialState(h[1]!.state, h[2]!.graph, diffOf(h[2]!), big))).error ?? "accepted";
  assert.deepEqual(observed, { root_state: "accepted", invalid_rebase: "editorial_rebase_invalid", valid_rebase: "editorial_budget_exceeded" });
});

// ================================================================ refusal parity over a mutation corpus (expected outcomes are the accepted 4f85b55 behaviour)
test("3E-A parity: the mutation corpus is accepted or refused exactly as the accepted bytes do, warm or cold", async t => {
  const h = heads(), base = h.slice(0, 5), observed: Record<string, string> = {};
  const outcome = async (s: { project: LocalEditingProject }) => {
    const r = await counted(() => s.project.current());
    return r.error ?? `accepted:${r.value!.head.headRevision}`;
  };
  const mutate = async (name: string, change: (s: Awaited<ReturnType<typeof store>>) => Promise<void>, prefix: readonly E.CurrentEditingContext[] = base) => {
    for (const warmth of ["cold", "warm"] as const) {
      const s = await store(t, prefix); if (warmth === "warm") await s.project.current();
      await change(s); const result = await outcome(s);
      observed[`${name}`] ??= result;
      assert.equal(result, observed[name], `${name}: warm and cold agree`);
    }
  };
  const slot = (s: { root: string; key: string }, revision: number) => join(s.root, slotName(s.key, revision));
  await mutate("P00_unchanged", async () => undefined);
  await mutate("P01_stale_request", async s => {
    const target = clipTarget(h[3]!, 0), r = requestFor(h[3]!, target), intent = E.createEditorialIntent(r, { kind: "set_preference", target, value: "liked" }, MANUAL, h[3]!);
    await assert.rejects(s.project.applyStateIntent(r, intent), /stale_editing_head/);
  });
  await mutate("P02_latest_slot_whitespace", async s => { await writeFile(slot(s, 4), Buffer.concat([await readFile(slot(s, 4)), Buffer.from("\n")])); });
  await mutate("P03_latest_slot_head_revision", async s => {
    await writeFile(slot(s, 4), Buffer.from((await readFile(slot(s, 4))).toString("utf8").replace("\"headRevision\":4", "\"headRevision\":5")));
  });
  await mutate("P04_earlier_slot_whitespace", async s => { await writeFile(slot(s, 1), Buffer.concat([Buffer.from(" "), await readFile(slot(s, 1))])); });
  await mutate("P05_missing_artifact", async s => { await unlink(join(s.root, artifactName(E.stateRef(h[4]!.state)))); });
  await mutate("P06_changed_artifact", async s => {
    const path = join(s.root, artifactName(E.graphBinding(h[4]!.graph).artifact));
    await writeFile(path, Buffer.from(JSON.stringify(JSON.parse((await readFile(path)).toString("utf8")), null, 2)));
  });
  const g2 = h[4]!.graph, g0 = h[0]!.graph;
  const wrongParent = reidentify(g2, "editGraphId", "edit_graph_v0", b => {
    b.revision = 1; b.parent = { state: "present", editGraph: supplied(g0, g0.editGraphId).ref, editGraphId: g0.editGraphId, revision: 0 };
  });
  await mutate("P07_wrong_graph_parent", async s => {
    await replaceSlot(s, forgedHead(h[4]!, { graph: wrongParent, state: reidentify(h[4]!.state, "stateId", "editorial_state_v0", b => { b.currentGraph = E.graphBinding(wrongParent); }) }));
  });
  await mutate("P08_wrong_state_parent", async s => {
    await replaceSlot(s, forgedHead(h[4]!, { state: reidentify(h[4]!.state, "stateId", "editorial_state_v0", b => { b.parentState = E.stateRef(h[2]!.state); }) }));
  });
  const diff = E.artifactMap(h[4]!.artifacts).get((h[4]!.head.transition as { diff: ArtifactRef }).diff) as GraphDiff;
  const forgedDiff = reidentify(diff, "graphDiffId", "graph_diff_v0", b => {
    const op = (b.operations as { expected: { range: ExactRange }; replacement: { range: ExactRange } }[])[0]!;
    op.replacement = { range: { start: op.expected.range.start, end: canonicalTime(addTimes(op.expected.range.end, tickTime(1, 1))) } };
  });
  const badDiffArtifact = supplied(forgedDiff, forgedDiff.graphDiffId);
  const badDiffGraph = reidentify(g2, "editGraphId", "edit_graph_v0", b => {
    b.changeSet = { kind: "graph_diff", graphDiff: badDiffArtifact.ref, graphDiffId: badDiffArtifact.ref.objectId };
  });
  await mutate("P09_invalid_graph_diff", async s => {
    const forged = forgedHead({ ...h[4]!, artifacts: E.joinArtifacts(h[4]!.artifacts, [badDiffArtifact]) },
      { graph: badDiffGraph, state: reidentify(h[4]!.state, "stateId", "editorial_state_v0", b => { b.currentGraph = E.graphBinding(badDiffGraph); }) });
    await replaceSlot(s, forged);
  });
  const stateDiff = E.artifactMap(h[3]!.artifacts).get((h[3]!.state.change as { diff: ArtifactRef }).diff) as E.EditorialStateDiff;
  const badStateDiff = reidentify(stateDiff, "diffId", "editorial_state_diff_v0", b => { b.parentRevision = 1; });
  await mutate("P10_invalid_state_diff", async s => {
    const ref = supplied(badStateDiff, badStateDiff.diffId);
    const state = reidentify(h[3]!.state, "stateId", "editorial_state_v0", b => { b.change = { kind: "state_diff", diff: ref.ref }; });
    await replaceSlot(s, forgedHead({ ...h[3]!, artifacts: E.joinArtifacts(h[3]!.artifacts, [ref]) }, { state, transition: { kind: "state_only", diff: ref.ref } }));
  }, h.slice(0, 4));
  await mutate("P11_hard_lock_corruption", async s => {
    await replaceSlot(s, forgeState(h[4]!, h[3]!.head, b => { (b.hardLocks as Record<string, unknown>[])[0]!.protectedSemantics = "0".repeat(64); }));
  });
  await mutate("P12_target_rebase_corruption", async s => {
    await replaceSlot(s, forgeState(h[4]!, h[3]!.head, b => { (b.hardLocks as Record<string, unknown>[])[0]!.target = clipTarget(h[4]!, 1); }));
  });
  await mutate("P13_foreign_scope_slot", async s => {
    const other = { ...h[4]!.head.scope, projectId: "project_b3e_a_other" };
    await writeFile(slot(s, 4), new TextEncoder().encode(canonicalSerialize({ head: reidentify(h[4]!.head, "headId", "editing_head_v0", b => { b.scope = other; }),
      artifacts: h[4]!.artifacts.map(a => a.ref) })));
  });
  await mutate("P14a_missing_middle_slot", async s => { await unlink(slot(s, 2)); });
  await mutate("P14b_incomplete_artifact_list", async s => {
    const refs = h[4]!.artifacts.map(a => a.ref).filter(r => r.objectId !== (diff.graphDiffId as string));
    await writeFile(slot(s, 4), new TextEncoder().encode(canonicalSerialize({ head: h[4]!.head, artifacts: refs })));
  });
  await mutate("P15_cas_loser", async s => {
    const target = clipTarget(h[4]!, 0), r = requestFor(h[4]!, target), intent = E.createEditorialIntent(r, { kind: "set_preference", target, value: "liked" }, MANUAL, h[4]!);
    const results = await Promise.allSettled([s.project.applyStateIntent(r, intent), s.project.applyStateIntent(r, intent)]);
    assert.deepEqual(results.map(x => x.status).sort(), ["fulfilled", "rejected"]);
    assert.match(String((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason), /stale_editing_head/);
  });
  await mutate("P16_head_moved_by_another_instance", async s => {
    const other = await open(s.base, h[0]!.head.scope), c = await other.current(), target = clipTarget(c, 0), r = requestFor(c, target);
    await other.applyStateIntent(r, E.createEditorialIntent(r, { kind: "set_preference", target, value: "rejected" }, MANUAL, c));
  });
  await mutate("P17_next_head_appended", async s => { await replaceSlot(s, nextHead(h[4]!, "pref", "parity")); });
  assert.deepEqual(observed, {
    P00_unchanged: "accepted:4", P01_stale_request: "accepted:4", P02_latest_slot_whitespace: "accepted:4", P03_latest_slot_head_revision: "editorial_input_invalid",
    P04_earlier_slot_whitespace: "accepted:4", P05_missing_artifact: "editing_store_corrupt", P06_changed_artifact: "editing_store_corrupt",
    P07_wrong_graph_parent: "graph_diff_parent_mismatch", P08_wrong_state_parent: "editorial_state_replay_mismatch",
    P09_invalid_graph_diff: "graph_diff_outside_authorized_range", P10_invalid_state_diff: "stale_editorial_state",
    P11_hard_lock_corruption: "editorial_state_replay_mismatch", P12_target_rebase_corruption: "editorial_state_replay_mismatch",
    P13_foreign_scope_slot: "editing_store_corrupt", P14a_missing_middle_slot: "accepted:1", P14b_incomplete_artifact_list: "graph_replay_mismatch",
    P15_cas_loser: "accepted:5", P16_head_moved_by_another_instance: "accepted:5", P17_next_head_appended: "accepted:5",
  });
});
