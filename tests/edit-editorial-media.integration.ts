import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFile, chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import * as E from "../packages/edit-editorial/index.js";
import { canonicalTime, subtractTimes, tickTime } from "../packages/edit-graph/common.js";
import { compileRenderProgram } from "../packages/edit-render/index.js";
import { openValidatedDag } from "../packages/edit-runtime/index.js";
import { openLocalEditingProject } from "../scripts/edit-editorial-local.js";
import { systemRuntimeClock } from "../scripts/edit-runtime-local.js";
import { renderDag } from "./support/edit-render.js";
import { revisionDag } from "./support/edit-repair.js";
import { editorialMedia, observeEditorialOutput, prepareEditorialMedia, renderEditorialParent } from "./support/edit-editorial-media.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, observeMediaSpawns } from "./support/edit-render-media.js";
import { MANUAL, clipTarget, editProposal, requestFor } from "./support/edit-editorial.js";

const IDENTITY = { implementationId: "synthetic_conversation_fixture", version: "0.1.0", basis: "deterministic_fixture" as const };
function request(c: E.CurrentEditingContext, key: string, text: string, target: E.EditorialTarget, allowedScope: E.EditorialRequest["allowedScope"] = null) {
  return E.createEditorialRequest({ scope: c.head.scope, requestKey: key, rawUserText: text, baseHead: E.headRef(c.head), baseGraph: c.head.currentGraph,
    baseState: c.head.currentState, selectedTarget: target, referencedRevision: target.graph.artifact.objectId === c.graph.editGraphId ? null : target.graph, allowedScope });
}
test("3C-M01 five-turn actual no-speech synthetic revision: state-only, reuse, rerender, QC, history and stale refusal", async t => {
  const m = await editorialMedia(t, true), x = renderDag(m.g, { now: systemRuntimeClock.now(), budget: { attempt: 1, prefix: "batch3c_parent" } });
  const parent = await renderEditorialParent(m, x), parentProgram = compileRenderProgram(parent.v, x.artifacts);
  const project = await openLocalEditingProject({ root: m.runtime.layout.root, scope: m.g.graph.scope,
    policy: E.createEditorialPolicy(m.g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) });
  const h0 = await project.initialize(m.g.graph, x.artifacts), a = E.targetOf(h0.graph, h0.graph.clipUses[0]!.clipUseId);
  const observer = observeMediaSpawns(); t.after(observer.restore);
  let fixtureLatency = 0;
  const interpret = async (r: E.EditorialRequest, action: E.IntentAction) => project.interpret(r, { identity: IDENTITY,
    async interpret(context) { const at = performance.now(); assert.ok(Object.isFrozen(context)); fixtureLatency += performance.now() - at; return action; } });
  const first = request(h0, "turn1", "Keep the first shot exactly as it is.", a), firstIntent = await interpret(first, { kind: "lock_target", target: a });
  const started = performance.now(), filesBefore = await readdir(join(m.runtime.layout.root, "render-outputs"));
  const h1 = await project.applyStateIntent(first, firstIntent), stateOnlyMs = performance.now() - started;
  assert.equal(observer.calls.length, 0); assert.equal(h1.graph.editGraphId, h0.graph.editGraphId); assert.equal(h1.state.hardLocks.length, 1);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), filesBefore);
  const b = h1.graph.clipUses.filter(c => c.medium === "video")[1]!, target = E.targetOf(h1.graph, b.clipUseId);
  const allowedScope = { graph: h1.head.currentGraph, clipUseIds: [b.clipUseId], interval: { startTicks: h1.graph.output.durationTicks - h1.graph.output.clock.ticksPerSecond / 2,
    endTicks: h1.graph.output.durationTicks }, ticksPerSecond: h1.graph.output.clock.ticksPerSecond };
  const second = request(h1, "turn2", "Only trim half a second from the end of the second shot.", target, allowedScope);
  const keep = { start: b.source.range.start, end: canonicalTime(subtractTimes(b.source.range.end, tickTime(1, 2))) };
  const intent = await interpret(second, { kind: "request_edit", target, operation: "trim_clip_source_range", keep });
  const planStarted = performance.now(), proposed = await project.propose(second, intent), planMs = performance.now() - planStarted;
  assert.equal(proposed.child.artifactVersion, "0.4.0"); assert.equal(proposed.state.hardLocks.length, 1);
  const cx = revisionDag(m.g, proposed.child, proposed.artifacts, { now: systemRuntimeClock.now(), budget: { attempt: 2, prefix: "batch3c_child" } });
  const cv = openValidatedDag({ dag: cx.dagArtifact.ref }, cx.artifacts), childProgram = compileRenderProgram(cv, cx.artifacts);
  const lockStarted = performance.now(), authorization = await project.authorize({ ...proposed, artifacts: cx.artifacts, parentDag: parent.v, childDag: cv });
  const lockMs = performance.now() - lockStarted;
  assert.equal(observer.calls.length, 0, "proposal and current-head authorization start no media process");
  assert.equal(parentProgram.segments[0]!.segmentComputationId, childProgram.segments[0]!.segmentComputationId);
  assert.notEqual(parentProgram.segments[1]!.segmentComputationId, childProgram.segments[1]!.segmentComputationId);
  const prep = await prepareEditorialMedia(m, cx), renderStartCalls = observer.calls.length, renderStarted = performance.now();
  const accepted = await project.execute(authorization, { ...prep.request, toolRoot: PINNED_TOOL_ROOT, prior: { receipt: parent.receipt, qc: parent.qc } });
  const executionAndPublicationMs = performance.now() - renderStarted;
  assert.equal(accepted.outcome, "published"); if (accepted.outcome !== "published") throw new Error("child did not publish");
  const h2 = accepted.current;
  assert.equal(accepted.qc.verdict, "pass"); assert.equal(h2.state.hardLocks[0]!.lockId, h1.state.hardLocks[0]!.lockId);
  assert.notEqual(accepted.result.receipt.output.contentHash, parent.receipt.output.contentHash);
  assert.deepEqual(accepted.result.receipt.segments.map(s => s.disposition), ["reused_verified_prior_artifact", "computed_by_this_execution"]);
  const renderCalls = observer.calls.slice(renderStartCalls).filter(c => c.tool === "ffmpeg" && c.arguments.includes("-benchmark"));
  assert.equal(renderCalls.length, 2, "one changed segment stage and one whole-output assembly actually spawned");
  const beforeThird = observer.calls.length, thirdTarget = E.targetOf(h2.graph, h2.graph.clipUses[0]!.clipUseId);
  const third = request(h2, "turn3", "Trim half a second from the first shot.", thirdTarget,
    { graph: h2.head.currentGraph, clipUseIds: h2.graph.clipUses.filter(c => c.medium === "video").map(c => c.clipUseId),
      interval: { startTicks: 0, endTicks: h2.graph.output.durationTicks }, ticksPerSecond: h2.graph.output.clock.ticksPerSecond });
  const thirdClip = h2.graph.clipUses[0]!;
  const thirdIntent = await interpret(third, { kind: "request_edit", target: thirdTarget, operation: "trim_clip_source_range",
    keep: { start: thirdClip.source.range.start, end: canonicalTime(subtractTimes(thirdClip.source.range.end, tickTime(1, 2))) } });
  await assert.rejects(project.propose(third, thirdIntent), /hard_lock_conflict/);
  assert.equal(observer.calls.length, beforeThird); assert.equal((await project.current()).head.headId, h2.head.headId);
  const fourth = request(h2, "turn4", "I liked the intro from revision 0.", a), fourthIntent = await interpret(fourth, { kind: "set_preference", target: a, value: "liked" });
  const h3 = await project.applyStateIntent(fourth, fourthIntent);
  assert.equal(h3.graph.editGraphId, h2.graph.editGraphId); assert.deepEqual(h3.state.preferences[0]!.target, a);
  assert.equal(observer.calls.length, beforeThird); await assert.rejects(project.propose(second, intent), /stale_editing_head/);
  assert.equal((await project.current()).head.headId, h3.head.headId); assert.equal(observer.calls.length, beforeThird);
  const observations = await observeEditorialOutput(m, cx, accepted.result.receipt, accepted.qc);
  assert.ok(observations.observations.length > 0);
  const evidence = { basis: "actual_synthetic_media_deterministic_fixture_no_speech_no_model", retainedSyntheticRoot: m.base,
    retainedRuntimeRoot: m.runtime.layout.root, h0, h1, request: second, intent, proposed, h2, h3,
    parentProgram, childProgram, parentReceipt: parent.receipt, childReceipt: accepted.result.receipt, parentQc: parent.qc, childQc: accepted.qc,
    observations, impact: authorization.impact, renderCalls, measurements: { stateOnlyMs, fixtureLatency, planMs, lockMs, executionAndPublicationMs, renderProcessCount: renderCalls.length,
      segmentsReused: 1, segmentsRecomputed: 1, ...accepted.timings }, finalCurrentHead: (await project.current()).head };
  const directory = join(PROJECT_ROOT, ".test-artifacts", "phase5-gate7-batch3c"); await mkdir(directory, { recursive: true });
  // Evidence excludes duplicate supplied byte arrays; all named native records and exact references remain present.
  await writeFile(join(directory, "scenario.json"), JSON.stringify(evidence, (key, value: unknown) => key === "artifacts" ? undefined : value, 2));
});

for (const failure of ["render", "qc", "cas"] as const) test(`3C-M02-${failure} failed ${failure} leaves graph and state coherent and current`, async t => {
  const m = await editorialMedia(t), x = renderDag(m.g, { now: systemRuntimeClock.now(), budget: { attempt: 1, prefix: `batch3c_${failure}_parent` } });
  const parent = await renderEditorialParent(m, x), project = await openLocalEditingProject({ root: m.runtime.layout.root, scope: m.g.graph.scope,
    policy: E.createEditorialPolicy(m.g.graph.scope, { kind: "owner", actorId: "owner_synthetic" }) });
  const c = await project.initialize(m.g.graph, x.artifacts), p = editProposal(c, 1);
  const cx = revisionDag(m.g, p.child, p.artifacts, { now: systemRuntimeClock.now(), budget: { attempt: 2, prefix: `batch3c_${failure}_child` } });
  const cv = openValidatedDag({ dag: cx.dagArtifact.ref }, cx.artifacts);
  const auth = await project.authorize({ ...p, artifacts: cx.artifacts, parentDag: parent.v, childDag: cv }), prep = await prepareEditorialMedia(m, cx);
  let expectedHead = c.head.headId;
  const run = project.execute(auth, { ...prep.request, toolRoot: PINNED_TOOL_ROOT, prior: { receipt: parent.receipt, qc: parent.qc },
    instrumentation: { async beforeAssembly() {
      if (failure === "render") throw new Error("deliberate synthetic render failure");
      if (failure === "cas") {
        const target = clipTarget(c, 0), r = requestFor(c, target), intent = E.createEditorialIntent(r, { kind: "set_preference", target, value: "liked" }, MANUAL, c);
        expectedHead = (await project.applyStateIntent(r, intent)).head.headId;
      }
    } }, qcInstrumentation: { async afterIdentityEstablished() {
      if (failure !== "qc") return;
      const dir = join(m.runtime.layout.root, "render-outputs"), names = await readdir(dir);
      const child = names.find(name => name !== `${parent.receipt.output.contentHash}.mp4` && name.endsWith(".mp4")); assert.ok(child);
      const path = join(dir, child); await chmod(path, 0o666); await appendFile(path, new Uint8Array([0, 1, 2, 3]));
    } } });
  if (failure === "cas") await assert.rejects(run, /stale_editing_head/);
  else assert.equal((await run).outcome, failure === "render" ? "render_failed" : "qc_failed");
  const current = await project.current(); assert.equal(current.head.headId, expectedHead); assert.equal(current.graph.editGraphId, c.graph.editGraphId);
  assert.deepEqual(current.state.currentGraph, c.state.currentGraph);
});
