// Gate 7 Batch 3E-A: multi-revision execution freshness on actual synthetic media (pinned FFmpeg over generated fixtures; no owner footage,
// no model), always on the real system clock. A true revision 1 → 2 child executes through LocalEditingProject with fresh evidence under the
// accepted 60 s ceiling (F2); evidence that has really aged past the ceiling, foreign-bound evidence and head-moved attempts are refused before
// any render process (F3-F6). The 60 s maximum, evidence timestamps and permit order are unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import * as E from "../packages/edit-editorial/index.js";
import { openValidatedDag } from "../packages/edit-runtime/index.js";
import { EditorialExecutionAuthorization, openLocalEditingProject, type LocalEditingProject } from "../scripts/edit-editorial-local.js";
import { systemRuntimeClock } from "../scripts/edit-runtime-local.js";
import { realPolicy, renderDag } from "./support/edit-render.js";
import { revisionDag } from "./support/edit-repair.js";
import { editorialMedia, prepareEditorialMedia, renderEditorialParent, type EditorialMedia } from "./support/edit-editorial-media.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, observeMediaSpawns } from "./support/edit-render-media.js";
import { MANUAL, clipTarget, editProposal, requestFor } from "./support/edit-editorial.js";

const OWNER = { kind: "owner" as const, actorId: "owner_synthetic" };
/** The accepted maximum for every evidence class (records.ts Age.max(60_000)); nothing here relaxes it. */
const CEILING = 60_000;
const POLICY = realPolicy({ freshness: { maxRuntimeProbeAgeMilliseconds: CEILING, maxCapabilityProbeAgeMilliseconds: CEILING,
  maxLifecycleObservationAgeMilliseconds: CEILING, maxInputConformanceAgeMilliseconds: CEILING } });
const now = () => systemRuntimeClock.now();
/** The owned refusal code (EditRenderError and EditorialControlError both carry one), else the error text. */
const codeOf = (error: unknown) => error instanceof Error && "code" in error ? String(error.code) : String(error);
type Request = Awaited<ReturnType<typeof prepareEditorialMedia>>["request"];
const renderSpawns = (calls: readonly { tool: string; arguments: string[] }[]) => calls.filter(c => c.tool === "ffmpeg" && c.arguments.includes("-benchmark")).length;
const evidenceObservedAt = (p: Awaited<ReturnType<typeof prepareEditorialMedia>>) => [p.request.media.runtimeProbe.observedAt, p.request.media.capabilityProbe.observedAt,
  ...p.request.lifecycle.map(l => l.record.observedAt), ...p.request.conformance.map(c => c.record.observedAt)];
/**
 * The project at graph revision 1: render the revision-0 parent, lock clip 0 (state only), execute and publish a revision 0 → 1 trim of clip 1,
 * then record a preference (state only). Returns the head, the published revision-1 DAG and its receipt/QC (the next child's prior).
 */
async function atRevisionOne(m: EditorialMedia, tag: string) {
  const x = renderDag(m.g, { now: now(), budget: { attempt: 1, prefix: `${tag}_r0` } }), parent = await renderEditorialParent(m, x);
  const project = await openLocalEditingProject({ root: m.runtime.layout.root, scope: m.g.graph.scope, policy: E.createEditorialPolicy(m.g.graph.scope, OWNER) });
  const h0 = await project.initialize(m.g.graph, x.artifacts), target = clipTarget(h0, 0), lock = requestFor(h0, target);
  const h1 = await project.applyStateIntent(lock, E.createEditorialIntent(lock, { kind: "lock_target", target }, MANUAL, h0));
  const p1 = editProposal(h1, 1), cx1 = revisionDag(m.g, p1.child, p1.artifacts, { now: now(), budget: { attempt: 2, prefix: `${tag}_r1` } });
  const cv1 = openValidatedDag({ dag: cx1.dagArtifact.ref }, cx1.artifacts);
  const a1 = await project.authorize({ ...p1, artifacts: cx1.artifacts, parentDag: parent.v, childDag: cv1 }), prep1 = await prepareEditorialMedia(m, cx1);
  const r1 = await project.execute(a1, { ...prep1.request, policy: POLICY, toolRoot: PINNED_TOOL_ROOT, prior: { receipt: parent.receipt, qc: parent.qc } });
  assert.equal(r1.outcome, "published", "F1: the revision 0 → 1 child publishes"); if (r1.outcome !== "published") throw new Error("revision 1 did not publish");
  assert.equal(r1.current.graph.revision, 1);
  const pref = requestFor(r1.current, clipTarget(r1.current, 0));
  const h3 = await project.applyStateIntent(pref, E.createEditorialIntent(pref, { kind: "set_preference", target: clipTarget(r1.current, 0), value: "liked" }, MANUAL, r1.current));
  return { project, h3, cv1, prior: { receipt: r1.result.receipt, qc: r1.qc }, revisionOneRequest: prep1.request };
}
/** One revision 1 → 2 proposal from the given head and its DAG (one attempt). */
function revisionTwoDag(m: EditorialMedia, c: E.CurrentEditingContext, attempt: number, tag: string) {
  const p2 = editProposal(c, 1), cx2 = revisionDag(m.g, p2.child, p2.artifacts, { now: now(), budget: { attempt, prefix: `${tag}_r2_${attempt}` } });
  return { p2, cx2, cv2: openValidatedDag({ dag: cx2.dagArtifact.ref }, cx2.artifacts) };
}
/** ... authorized at the current head against the published revision-1 DAG. */
async function revisionTwo(m: EditorialMedia, project: LocalEditingProject, c: E.CurrentEditingContext, cv1: ReturnType<typeof openValidatedDag>, attempt: number, tag: string) {
  const d = revisionTwoDag(m, c, attempt, tag);
  return { ...d, authorization: await project.authorize({ ...d.p2, artifacts: d.cx2.artifacts, parentDag: cv1, childDag: d.cv2 }) };
}

test("3E-F2 a true revision 1 → 2 child publishes with fresh evidence under the accepted 60 s ceiling, on the real clock", async t => {
  const m = await editorialMedia(t), observer = observeMediaSpawns(); t.after(observer.restore);
  const r = await atRevisionOne(m, "b3ea_f2"), two = await revisionTwo(m, r.project, r.h3, r.cv1, 3, "b3ea_f2");
  assert.equal(two.p2.child.revision, 2);
  // The two current-head checks execute and the permit run, timed after authorization and before any evidence exists (so they never age it).
  let at = performance.now(); await EditorialExecutionAuthorization.assertCurrent(two.authorization, two.p2.child); const firstAssertCurrentMs = performance.now() - at;
  at = performance.now(); await EditorialExecutionAuthorization.assertCurrent(two.authorization, two.p2.child); const permitAssertCurrentMs = performance.now() - at;
  const beforeRender = renderSpawns(observer.calls);
  at = performance.now(); const prep = await prepareEditorialMedia(m, two.cx2); const prepareMs = performance.now() - at;
  assert.equal(renderSpawns(observer.calls), beforeRender, "preparation probes; it never renders");
  at = performance.now();
  const published = await r.project.execute(two.authorization, { ...prep.request, policy: POLICY, toolRoot: PINNED_TOOL_ROOT, prior: r.prior });
  const executeMs = performance.now() - at;
  assert.equal(published.outcome, "published"); if (published.outcome !== "published") throw new Error("revision 2 did not publish");
  const observedAt = evidenceObservedAt(prep), authorizedAt = published.result.receipt.permitBinding.authorizedAt;
  const evidenceAgeAtPermitMs = Date.parse(authorizedAt) - Math.min(...observedAt.map(v => Date.parse(v)));
  assert.ok(evidenceAgeAtPermitMs >= 0 && evidenceAgeAtPermitMs < CEILING, `evidence age at the permit: ${evidenceAgeAtPermitMs} ms`);
  assert.equal(published.qc.verdict, "pass");
  assert.equal(published.current.graph.revision, 2); assert.equal(published.current.head.headRevision, 4);
  assert.equal(published.current.state.hardLocks.length, 1, "the lock is carried through both rebases");
  assert.deepEqual(published.result.receipt.segments.map(s => s.disposition), ["reused_verified_prior_artifact", "computed_by_this_execution"]);
  assert.equal(renderSpawns(observer.calls) - beforeRender, 2, "one changed segment and one assembly");
  const evidence = { basis: "actual_synthetic_media_pinned_ffmpeg_real_system_clock_no_owner_footage_no_model", ceilingMs: CEILING,
    policy: POLICY.freshness, observedAt, authorizedAt, evidenceAgeAtPermitMs, timingsMs: { firstAssertCurrentMs, permitAssertCurrentMs, prepareMs, executeMs, ...published.timings },
    head: published.current.head, childGraph: { editGraphId: published.current.graph.editGraphId, revision: published.current.graph.revision },
    segments: published.result.receipt.segments.map(s => s.disposition) };
  const directory = join(PROJECT_ROOT, ".test-artifacts", "phase5-gate7-batch3e-a"); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "f2-revision-1-2.json"), JSON.stringify(evidence, null, 2));
});

test("3E-F3/F6 revision 1 → 2 evidence that has really aged past 60 s refuses at the permit; no render starts and the head stays", async t => {
  const m = await editorialMedia(t), observer = observeMediaSpawns(); t.after(observer.restore);
  const r = await atRevisionOne(m, "b3ea_f3"), two = await revisionTwo(m, r.project, r.h3, r.cv1, 3, "b3ea_f3");
  const prep = await prepareEditorialMedia(m, two.cx2), before = renderSpawns(observer.calls), oldest = Math.min(...evidenceObservedAt(prep).map(v => Date.parse(v)));
  await wait(CEILING + 1_000);
  assert.ok(Date.parse(now()) - oldest > CEILING, "the evidence is genuinely older than the ceiling on the real clock");
  await assert.rejects(r.project.execute(two.authorization, { ...prep.request, policy: POLICY, toolRoot: PINNED_TOOL_ROOT, prior: r.prior }),
    (error: unknown) => codeOf(error) === "runtime_probe_stale");
  assert.equal(renderSpawns(observer.calls), before, "F6: nothing renders without a valid permit");
  assert.equal((await r.project.current()).head.headId, r.h3.head.headId);
});

test("3E-F4/F5/F6 foreign-bound evidence, a moved head and a CAS loser refuse; no render starts before a valid permit", async t => {
  const m = await editorialMedia(t), observer = observeMediaSpawns(); t.after(observer.restore);
  const r = await atRevisionOne(m, "b3ea_f4"), before = renderSpawns(observer.calls), observed: Record<string, string> = {};
  let attempt = 3;
  const outcome = async (name: string, authorization: EditorialExecutionAuthorization, request: Request) => {
    try { observed[name] = `accepted:${(await r.project.execute(authorization, { ...request, policy: POLICY, toolRoot: PINNED_TOOL_ROOT, prior: r.prior })).outcome}`; }
    catch (error) { observed[name] = codeOf(error); }
  };
  // Every case gets its own authorized attempt and a foreign claim, both prepared immediately before the attempt: the case's own evidence is
  // fresh whatever the machine's speed, so only the named binding can refuse (each check precedes the freshness check it would otherwise race).
  const fresh = async () => {
    const own = await revisionTwo(m, r.project, r.h3, r.cv1, attempt++, "b3ea_f4"), ownPrep = await prepareEditorialMedia(m, own.cx2);
    const foreign = await prepareEditorialMedia(m, revisionTwoDag(m, r.h3, attempt++, "b3ea_f4").cx2);
    return { authorization: own.authorization, own: ownPrep.request, foreign: foreign.request };
  };
  await outcome("f4_dag_of_another_revision", (await revisionTwo(m, r.project, r.h3, r.cv1, attempt++, "b3ea_f4")).authorization, r.revisionOneRequest);
  let f = await fresh(); await outcome("f4_runtime_probe_of_another_claim", f.authorization, { ...f.own, media: f.foreign.media });
  f = await fresh(); await outcome("f4_lifecycle_of_another_claim", f.authorization, { ...f.own, lifecycle: f.foreign.lifecycle });
  f = await fresh(); await outcome("f4_conformance_of_another_claim", f.authorization, { ...f.own, conformance: f.foreign.conformance });
  // F5: the head moves after authorization and preparation (another instance records a preference); the old authorization is stale.
  f = await fresh();
  const sibling = await openLocalEditingProject({ root: m.runtime.layout.root, scope: m.g.graph.scope, policy: E.createEditorialPolicy(m.g.graph.scope, OWNER) });
  const c = await sibling.current(), pref = requestFor(c, clipTarget(c, 0));
  const moved = await sibling.applyStateIntent(pref, E.createEditorialIntent(pref, { kind: "set_preference", target: clipTarget(c, 0), value: "rejected" }, MANUAL, c));
  await outcome("f5_head_moved_before_execute", f.authorization, f.own);
  assert.deepEqual(observed, { f4_dag_of_another_revision: "editorial_execution_graph_mismatch", f4_runtime_probe_of_another_claim: "claim_mismatch",
    f4_lifecycle_of_another_claim: "lifecycle_observation_invalid", f4_conformance_of_another_claim: "input_conformance_invalid",
    f5_head_moved_before_execute: "stale_editing_head" });
  assert.equal(renderSpawns(observer.calls), before, "F6: no refused attempt started a render process");
  assert.equal((await r.project.current()).head.headId, moved.head.headId);
  // F5 CAS loser: a fresh revision 1 → 2 attempt renders and passes QC, but the head moves before publication; publication refuses.
  const three = await revisionTwo(m, r.project, moved, r.cv1, attempt++, "b3ea_f5"), prep3 = await prepareEditorialMedia(m, three.cx2);
  let expected = moved.head.headId;
  await assert.rejects(r.project.execute(three.authorization, { ...prep3.request, policy: POLICY, toolRoot: PINNED_TOOL_ROOT, prior: r.prior,
    instrumentation: { async beforeAssembly() {
      const d = await sibling.current(), q = requestFor(d, clipTarget(d, 0));
      expected = (await sibling.applyStateIntent(q, E.createEditorialIntent(q, { kind: "clear_preference", target: clipTarget(d, 0) }, MANUAL, d))).head.headId;
    } } }), /stale_editing_head/);
  const final = await r.project.current();
  assert.equal(final.head.headId, expected); assert.equal(final.graph.revision, 1, "the CAS loser's revision 2 never became current");
});
