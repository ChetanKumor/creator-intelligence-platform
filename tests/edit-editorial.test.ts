// Batch 3C acceptance starts on the unchanged 3B graph implementation. No provider or media operation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createGraphDiff, applyGraphDiff, supplied, validateAnyEditGraph } from "../packages/edit-graph/index.js";
import { canonicalTime, tickTime } from "../packages/edit-graph/common.js";
import { cfrMetadata, renderGraph } from "./support/edit-render.js";
import * as E from "../packages/edit-editorial/index.js";

const fixture = () => renderGraph({ sources: [
  { key: "editorial_a", hash: "a".repeat(64), metadata: cfrMetadata() },
  { key: "editorial_b", hash: "b".repeat(64), metadata: cfrMetadata() },
], cut: true });
const ref = (v: E.EditorialState) => supplied(v, v.stateId);

test("3C-A01/B01/C01 state root, typed lock, replay, immutable parent, explicit unlock", () => {
  const g = fixture(), s0 = E.createRootEditorialState(g.graph, g.artifacts);
  const a = E.targetOf(g.graph, g.graph.clipUses[0]!.clipUseId);
  const provenance = { kind: "manual" as const, actorId: "owner_synthetic", actionId: "click_lock_a" };
  const diff = E.createEditorialStateDiff(s0, { op: "add_hard_lock", target: a }, provenance);
  const artifacts = [...g.artifacts, ref(s0), supplied(diff, diff.diffId)];
  const s1 = E.applyEditorialStateDiff(s0, diff, artifacts);
  assert.equal(s1.stateRevision, 1);
  assert.equal(s0.hardLocks.length, 0);
  assert.equal(s1.hardLocks.length, 1);
  assert.deepEqual(E.validateEditorialState(s1, artifacts), s1);
  assert.throws(() => E.applyEditorialStateDiff(s1, diff, artifacts));
  const unlock = E.createEditorialStateDiff(s1, { op: "remove_hard_lock", lockId: s1.hardLocks[0]!.lockId },
    { ...provenance, actionId: "click_unlock_a" });
  const s2 = E.applyEditorialStateDiff(s1, unlock, [...artifacts, ref(s1)]);
  assert.equal(s2.hardLocks.length, 0);
});

test("3C-A02/B02 strict state and state diff reject timeline duplication and arbitrary patch", () => {
  const g = fixture(), state = E.createRootEditorialState(g.graph, g.artifacts);
  assert.equal(E.EditorialStateSchema.safeParse({ ...state, clipUses: g.graph.clipUses }).success, false);
  assert.throws(() => E.createEditorialStateDiff(state, { op: "replace", path: "/hardLocks", value: [] },
    { kind: "manual", actorId: "owner_synthetic", actionId: "bad_patch" }));
});

test("3C-D01 liked to rejected to clear are explicit soft state operations", () => {
  const g = fixture(); let state = E.createRootEditorialState(g.graph, g.artifacts);
  const target = E.targetOf(g.graph, g.graph.clipUses[0]!.clipUseId);
  for (const value of ["liked", "rejected"] as const) {
    const diff = E.createEditorialStateDiff(state, { op: "set_preference", target, value },
      { kind: "manual", actorId: "owner_synthetic", actionId: value });
    state = E.applyEditorialStateDiff(state, diff, g.artifacts);
    assert.equal(state.preferences[0]!.value, value);
    assert.equal(state.hardLocks.length, 0);
  }
  const diff = E.createEditorialStateDiff(state, { op: "clear_preference", target },
    { kind: "manual", actorId: "owner_synthetic", actionId: "clear" });
  state = E.applyEditorialStateDiff(state, diff, g.artifacts);
  assert.equal(state.preferences.length, 0);
});

test("3C-J01 editorial-origin exact trim creates a replay-valid explicitly versioned child", () => {
  const g = renderGraph({ sources: [
    { key: "editorial_a", hash: "a".repeat(64), metadata: cfrMetadata() },
    { key: "editorial_b", hash: "b".repeat(64), metadata: cfrMetadata() },
  ], cut: true });
  const b = g.graph.clipUses.filter(c => c.medium === "video")[1]!;
  const planId = `editorial_revision_plan_v0_${"c".repeat(64)}`;
  const diff = createGraphDiff({ artifactType: "GraphDiff", artifactVersion: "0.2.0", stability: "internal_pre_stable", scope: g.graph.scope,
    parent: { editGraph: g.graphArtifact.ref, editGraphId: g.graph.editGraphId, revision: 0 },
    operations: [{ op: "trim_clip_source_range", clipUseId: b.clipUseId, expected: { range: b.source.range },
      replacement: { range: { start: b.source.range.start, end: canonicalTime(tickTime(3, 2)) } } }],
    origin: { kind: "editorial_revision_plan", editorialRevisionPlan: { objectId: planId, sha256: "d".repeat(64),
      artifactType: "EditorialRevisionPlan", artifactVersion: "0.1.0" }, editorialRevisionPlanId: planId }, semantics: "typed_graph_diff_v0" });
  const artifacts = [...g.artifacts, supplied(diff, diff.graphDiffId)];
  const child = applyGraphDiff(g.graph, diff, artifacts);
  assert.equal(child.artifactVersion, "0.4.0");
  assert.equal(child.revision, 1);
  assert.deepEqual(validateAnyEditGraph(child, artifacts), child);
  assert.equal(g.graph.output.durationTicks - child.output.durationTicks, g.graph.output.clock.ticksPerSecond / 2);
});
