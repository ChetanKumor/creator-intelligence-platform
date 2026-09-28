// Phase 5 Gate 7 Batch 3B actual-media integration. Tiny synthetic sources are generated with the accepted fixture generator (source A has a
// deliberately black tail from 1.5 s). The parent is rendered through the accepted chain (registration, claim, staging, lifecycle, probes,
// permit, pinned FFmpeg, publication, independent QC) by segmented execution and, separately, by the accepted one-pass executor; the accepted
// Batch-3A review observes the ACTUAL bytes and the deterministic critic measures the black run. The Batch-3B core turns that finding into a
// RepairPlan, a typed GraphDiff and an immutable child revision, which is rendered again: its changed segment is recomputed, its unchanged
// segment is reused from the parent's verified intermediate, and the final output is assembled, QC'd and re-observed. Synthetic media only; the
// repair planner is a deterministic synthetic fixture rule, not a model; no real footage, provider or network.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify, type SuppliedArtifact } from "../packages/editorial/common.js";
import { canonicalTime, frameTime } from "../packages/edit-graph/common.js";
import { applyGraphDiff, createGraphDiff, supplied, type AnyEditGraph, type EditGraphRevision } from "../packages/edit-graph/index.js";
import { acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, type RuntimeCall, type StagedSourceReceipt,
  type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import { AnyRenderExecutionReceiptSchema, compileRenderProgram, type AnyRenderExecutionReceipt, type RenderProgram, type SegmentedRenderExecutionReceipt,
  type TechnicalMediaQcReceipt } from "../packages/edit-render/index.js";
import { createReviewPolicy, planReview, runCriticReview, type CriticReport, type EditorialObservation, type ReviewPolicy } from "../packages/edit-review/index.js";
import { compileRepairPlan, deriveDependencyImpact, planRepair, validateRepairRevision, type RepairPlan } from "../packages/edit-repair/index.js";
import { executeAuthorizedRender, executeAuthorizedSegmentedRender, issueExecutablePermit, probePinnedMediaRuntime, probeStagedInputs,
  type SegmentedRenderResult } from "../scripts/edit-render-local.js";
import { runTechnicalMediaQc } from "../scripts/edit-media-qc-local.js";
import { createSyntheticFixtureLifecycleAuthority, type SyntheticFixtureLifecycleAuthority, type TrustedLifecycleObservation } from "../scripts/edit-render-fixture-authority-local.js";
import { createLocalEditRuntime, systemRuntimeClock, type LocalEditRuntime } from "../scripts/edit-runtime-local.js";
import { observeReviewTargets } from "../scripts/edit-observation-local.js";
import type { DagFixture } from "./support/edit-execution.js";
import type { GraphFixture } from "./support/edit-graph.js";
import { cfrMetadata, realPolicy, renderDag, renderGraph } from "./support/edit-render.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, decodeGrayFrames, decodeMonoAudio, dominantTones, frameIndexOf, generateSource, isSolidFrame,
  type SourceSpec } from "./support/edit-render-media.js";
import { BoundaryTrimFixturePlanner, repairPolicyFor, revisionDag } from "./support/edit-repair.js";

const EVIDENCE = join(PROJECT_ROOT, ".test-artifacts", "phase5-gate7-batch3b");
async function persist(name: string, value: unknown): Promise<void> {
  await mkdir(EVIDENCE, { recursive: true });
  await writeFile(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}
const LOCATION = /[A-Za-z]:[\\/]|\\\\|\/\/|https?:|\.(?:exe|bin|mp4|mov|json|yuv|f32)\b/i;
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}

// ---------------------------------------------------------------- one isolated media environment per test (test-owned, removed afterwards)
interface Fixture { name: string; path: string; assetId: string; contentHash: string; sizeBytes: number; spec: SourceSpec }
interface MediaEnv { base: string; runtime: LocalEditRuntime; authority: SyntheticFixtureLifecycleAuthority; fixtures: Map<string, Fixture> }
async function mediaEnv(t: TestContext, specs: Record<string, SourceSpec>): Promise<MediaEnv> {
  await mkdir(join(PROJECT_ROOT, ".test-artifacts"), { recursive: true });
  const base = await mkdtemp(join(PROJECT_ROOT, ".test-artifacts", "b3b-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const authority = await createSyntheticFixtureLifecycleAuthority({ root: base, clock: systemRuntimeClock });
  const fixtures = new Map<string, Fixture>();
  for (const [name, spec] of Object.entries(specs)) {
    const path = await generateSource(authority.fixtureDirectory, `${name}.mov`, spec);
    fixtures.set(name, { name, path, spec, ...await authority.registerGeneratedFixture(`${name}.mov`) });
  }
  await mkdir(join(base, "runtime"));
  const runtime = await createLocalEditRuntime({ runtimeRoot: join(base, "runtime"), allowedSourceRoots: [authority.fixtureDirectory], clock: systemRuntimeClock,
    sources: [...fixtures.values()].map(f => ({ assetId: f.assetId, path: f.path })) });
  return { base, runtime, authority, fixtures };
}
const source = (f: Fixture, range?: { startSeconds: number; endSeconds: number }) =>
  ({ key: `media_${f.name}`, hash: f.contentHash, sizeBytes: f.sizeBytes, metadata: cfrMetadata({ hasAudio: f.spec.tone !== null }), ...(range ? { range } : {}) });
/** The scenario's sources: A is a moving pattern with a black tail from 1.5 s and a 440 Hz tone; B is a solid blue shot with a 660 Hz tone. */
const SCENARIO: Record<string, SourceSpec> = { a: { video: { pattern: "testsrc2" }, tone: 440, blackFromSeconds: 1.5 }, b: { video: { pattern: "color", color: "0x3060c0" }, tone: 660 } };
const chainAt = (g: GraphFixture, o: Parameters<typeof renderDag>[1] = {}) => renderDag(g, { now: systemRuntimeClock.now(), ...o });

interface Prepared { v: ValidatedExecutionDag; call: RuntimeCall; staged: StagedSourceReceipt[]; issue: () => ReturnType<typeof issueExecutablePermit> }
/** One repair step's bindings: the exact render of the parent revision its RepairPlan was made from (the plan itself names its finding). */
interface LineageStep { dag: ValidatedExecutionDag; artifacts: readonly SuppliedArtifact[]; receipt: unknown; qc: unknown; report: unknown; observations: readonly unknown[];
  policy: unknown }
/** The accepted chain up to a live executable permit: registration, claim, staging, lifecycle, runtime and conformance probes. */
async function prepare(m: MediaEnv, x: DagFixture, repair?: readonly LineageStep[]): Promise<Prepared> {
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(v, x.artifacts, m.runtime);
  const { ownership } = await acquireExecutionClaim(v, { workerId: "worker_batch3b" }, m.runtime);
  const call: RuntimeCall = { dag: v, runtime: m.runtime, ownership, artifacts: x.artifacts };
  const staged: StagedSourceReceipt[] = [];
  for (const s of v.admission.sources) staged.push(await stageClaimedSource(call, { assetId: s.assetId }));
  const lifecycle: TrustedLifecycleObservation[] = [];
  for (const s of staged) lifecycle.push(await m.authority.observe(call, s));
  const media = await probePinnedMediaRuntime(call, { toolRoot: PINNED_TOOL_ROOT });
  const conformance = await probeStagedInputs(call, media, staged);
  // A revision's repair lineage travels with the permit request (owner review OR1); a root graph carries none.
  const request: Parameters<typeof issueExecutablePermit>[0] & { repair?: readonly LineageStep[] } = { call, media, staged, lifecycle, conformance, policy: realPolicy(),
    ...(repair === undefined ? {} : { repair }) };
  return { v, call, staged, issue: () => issueExecutablePermit(request) };
}
interface Rendered { x: DagFixture; v: ValidatedExecutionDag; receipt: AnyRenderExecutionReceipt; qc: TechnicalMediaQcReceipt; renderMs: number; qcMs: number }
async function qcOf(m: MediaEnv, p: Prepared, receipt: AnyRenderExecutionReceipt): Promise<{ qc: TechnicalMediaQcReceipt; qcMs: number }> {
  const started = performance.now(), qc = await runTechnicalMediaQc({ dag: p.v, receipt, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT });
  assert.equal(qc.verdict, "pass", JSON.stringify(qc.checks.filter(c => c.outcome !== "pass")));
  return { qc, qcMs: Math.round(performance.now() - started) };
}
async function renderSegmented(m: MediaEnv, x: DagFixture, prior: { receipt: unknown; qc: unknown } | null = null, repair?: readonly LineageStep[]):
  Promise<Rendered & { result: SegmentedRenderResult }> {
  const p = await prepare(m, x, repair), permit = await p.issue(), started = performance.now();
  const result = await executeAuthorizedSegmentedRender(permit, { prior });
  const renderMs = Math.round(performance.now() - started);
  assert.equal(result.outcome, "succeeded", result.outcome === "failed" ? JSON.stringify({ stage: result.failure.stage, code: result.failure.failureCode }) : "");
  const receipt = (result as { receipt: SegmentedRenderExecutionReceipt }).receipt;
  return { x, v: p.v, receipt, renderMs, ...await qcOf(m, p, receipt), result };
}
async function renderOnePass(m: MediaEnv, x: DagFixture, repair?: readonly LineageStep[]): Promise<Rendered> {
  const p = await prepare(m, x, repair), permit = await p.issue(), started = performance.now(), result = await executeAuthorizedRender(permit);
  const renderMs = Math.round(performance.now() - started);
  assert.equal(result.outcome, "succeeded", result.outcome === "failed" ? JSON.stringify({ stage: result.failure.stage, code: result.failure.failureCode }) : "");
  const receipt = (result as { receipt: AnyRenderExecutionReceipt }).receipt;
  return { x, v: p.v, receipt, renderMs, ...await qcOf(m, p, receipt) };
}
const outputPath = (m: MediaEnv, contentHash: string) => join(m.runtime.layout.root, "render-outputs", `${contentHash}.mp4`);
const segmentPath = (m: MediaEnv, contentHash: string, kind: "yuv" | "f32") => join(m.runtime.layout.root, "render-segments", `${contentHash}.${kind}`);

// ---- the accepted Batch-3A review of actual bytes, plus one whole-output drill-down so the black-frame check covers every frame
const reviewPolicy = (r: Rendered): ReviewPolicy => createReviewPolicy({ scope: r.v.dag.scope, author: { kind: "owner", actorId: "owner_synthetic" },
  windows: { boundaryHalfWindowFrames: 15, globalWindowFrames: 30, interiorSamples: 3 },
  budget: { maxObservations: 16, maxDeliveredFrames: 64, maxDecodedPixelFrames: 1_000_000_000, maxEvidenceBytes: 8_388_608, maxFindings: 32, maxExplanationCharacters: 400,
    maxReviewAttempts: 2, maxTranscriptCharacters: 16_384, maxDecodeMilliseconds: 120_000 } });
interface Reviewed { policy: ReviewPolicy; observations: EditorialObservation[]; report: CriticReport; observeMs: number }
async function review(m: MediaEnv, r: Rendered): Promise<Reviewed> {
  const policy = reviewPolicy(r), plan = planReview({ dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy }), started = performance.now();
  const base = { dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy, plan, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT };
  const items = await observeReviewTargets(base);
  const whole = await observeReviewTargets({ ...base, targets: [{ kind: "rendered_drill_down", request: { window: { startFrame: 0, endFrame: plan.facts.frames }, frames: [0],
    audio: "none" } }] });
  const observations = [...items.observations, ...whole.observations], observeMs = Math.round(performance.now() - started);
  for (const o of observations) assert.ok(o.media.kind === "rendered_output" && o.media.contentHash === r.receipt.output.contentHash, "every observation is of these exact bytes");
  const report = await runCriticReview({ dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy, observations, attempt: 1 });
  return { policy, observations, report, observeMs };
}
const nearBlack = (report: CriticReport) => report.findings.filter(f => f.producer.kind === "deterministic_check" && f.producer.checkId === "near_black_frames");

// ================================================================ M01 the full Batch-3B chain on actual synthetic media
test("M01 a measured black tail is repaired end to end: finding -> plan -> GraphDiff -> revision -> localized rerender -> QC -> re-observation", async t => {
  const m = await mediaEnv(t, SCENARIO), a = m.fixtures.get("a")!, b = m.fixtures.get("b")!;
  const parentGraph = renderGraph({ sources: [source(a), source(b, { startSeconds: 1, endSeconds: 3 })], cut: true });
  // Parent: segmented execution (every segment computed) and the accepted one-pass executor, each its own claimed attempt.
  const parent = await renderSegmented(m, chainAt(parentGraph, { budget: { attempt: 1, prefix: "gate7_b3b_parent" } }));
  const parentOnePass = await renderOnePass(m, chainAt(parentGraph, { budget: { attempt: 2, prefix: "gate7_b3b_parent_onepass" } }));
  const ps = parent.receipt as SegmentedRenderExecutionReceipt;
  assert.equal(ps.artifactVersion, "0.2.0");
  assert.deepEqual(ps.segments.map(s => s.disposition), ["computed_by_this_execution", "computed_by_this_execution"]);
  assert.equal(parent.receipt.output.contentHash, parentOnePass.receipt.output.contentHash, "segmented execution reproduces the accepted one-pass bytes exactly");
  // The accepted review of the actual parent bytes: the deterministic critic measures exactly the black run 45-59.
  const pr = await review(m, parent);
  const [finding, ...others] = nearBlack(pr.report);
  assert.ok(finding !== undefined && others.length === 0);
  assert.deepEqual(finding.affectedOutput, { startFrame: 45, endFrame: 60 });
  // Finding -> RepairPlan (fixture planner, owner policy) -> typed GraphDiff -> immutable revision 1 (validated through its whole lineage).
  const repairPolicy = repairPolicyFor(parent.v.dag.scope), planner = new BoundaryTrimFixturePlanner();
  const plan = await planRepair({ graph: parentGraph.graph, dag: parent.v, artifacts: parent.x.artifacts, receipt: parent.receipt, qc: parent.qc, report: pr.report,
    observations: pr.observations, findingId: finding.findingId, policy: repairPolicy, planner });
  const planArtifact = supplied(plan, plan.planId), withPlan = [...parent.x.artifacts, planArtifact];
  const diff = compileRepairPlan(plan, parentGraph.graph, withPlan), diffArtifact = supplied(diff, diff.graphDiffId);
  const child: EditGraphRevision = applyGraphDiff(parentGraph.graph, diff, [...withPlan, diffArtifact]), childArtifact = supplied(child, child.editGraphId);
  const lineage = validateRepairRevision(child, [...withPlan, diffArtifact, childArtifact]);
  assert.deepEqual([lineage.plan.planId, lineage.diff.graphDiffId, child.revision, child.parent.editGraphId], [plan.planId, diff.graphDiffId, 1, parentGraph.graph.editGraphId]);
  // Child: a new attempt through the unchanged admission, claim, staging and permit path; the prior segmented receipt with its passing QC is
  // the only reuse authority. The permit is issued only for the child's complete repair lineage: the parent render the plan was made from.
  const repairLineage: LineageStep[] = [{ dag: parent.v, artifacts: parent.x.artifacts, receipt: parent.receipt, qc: parent.qc, report: pr.report,
    observations: pr.observations, policy: repairPolicy }];
  const childDag = revisionDag(parentGraph, child, [planArtifact, diffArtifact], { now: systemRuntimeClock.now(), budget: { attempt: 3, prefix: "gate7_b3b_child" } });
  const repaired = await renderSegmented(m, childDag, { receipt: parent.receipt, qc: parent.qc }, repairLineage);
  const childOnePass = await renderOnePass(m, revisionDag(parentGraph, child, [planArtifact, diffArtifact], { now: systemRuntimeClock.now(),
    budget: { attempt: 4, prefix: "gate7_b3b_child_onepass" } }), repairLineage);
  const cs = repaired.receipt as SegmentedRenderExecutionReceipt;
  assert.deepEqual(cs.segments.map(s => s.disposition), ["computed_by_this_execution", "reused_verified_prior_artifact"]);
  assert.deepEqual(cs.processes.map(p => [p.role, p.position]), [["segment_stage", 0], ["assembly", null]], "exactly one stage process ran: the changed segment");
  assert.deepEqual(cs.segments[1]!.artifact, ps.segments[1]!.artifact, "the reused artifact is exactly the parent's verified intermediate");
  assert.equal(repaired.receipt.output.contentHash, childOnePass.receipt.output.contentHash, "the localized rerender is byte-identical to a full one-pass render of the child");
  assert.notEqual(repaired.receipt.output.contentHash, parent.receipt.output.contentHash, "visible content changed, so the output identity changed");
  assert.notEqual(repaired.qc.qcReceiptId, parent.qc.qcReceiptId);
  // The actual child bytes: output frames 0-44 are source A frames 0-44 (none black), 45-104 are source B frames 30-89; audio switches at 1.5 s.
  const frames = await decodeGrayFrames(outputPath(m, repaired.receipt.output.contentHash), 180, 320);
  assert.equal(frames.length, 105);
  assert.deepEqual(frames.map(f => frameIndexOf(f, 180, 320)), [...Array.from({ length: 45 }, (_, i) => i), ...Array.from({ length: 60 }, (_, i) => 30 + i)]);
  assert.ok(frames.slice(0, 45).every(f => !isSolidFrame(f, 180, 320)) && frames.slice(45).every(f => isSolidFrame(f, 180, 320)));
  const tones = dominantTones(await decodeMonoAudio(outputPath(m, repaired.receipt.output.contentHash)), [440, 660]);
  assert.ok(tones.length >= 349 && tones.slice(0, 149).every(v => v === 440) && tones.slice(151, 349).every(v => v === 660), "linked audio follows the repaired cut exactly");
  // Fresh review of the NEW bytes: the measured black run is gone from every frame of the output.
  const cr = await review(m, repaired);
  assert.deepEqual(nearBlack(cr.report), [], "the deterministic defect is no longer detected anywhere in the repaired output");
  for (const o of cr.observations) assert.equal(o.media.kind === "rendered_output" ? o.media.contentHash : null, repaired.receipt.output.contentHash);
  // Dependency impact, derived from both graphs, DAGs and programs.
  const programOf = (r: Rendered): RenderProgram => compileRenderProgram(r.v, r.x.artifacts);
  const impact = deriveDependencyImpact({ parent: { graph: parentGraph.graph, dag: parent.v.dag, program: programOf(parent) },
    child: { graph: child, dag: repaired.v.dag, program: programOf(repaired) }, diff });
  assert.deepEqual(impact.segments.map(s => s.decision), ["recompute_changed_computation", "reusable_identical_computation"]);
  assert.deepEqual(impact.changedRegion.parent, { startTicks: 1_500_000_000, endTicks: 4_000_000_000, startFrame: 45, endFrame: 120 });
  const strings = allStrings([ps, cs, plan, diff, child, impact]);
  assert.equal(strings.filter(s => LOCATION.test(s)).length, 0, "no persisted record carries a location");
  await persist("m01-repair.json", {
    parent: { graph: { version: parentGraph.graph.artifactVersion, revision: 0, editGraphId: parentGraph.graph.editGraphId }, dagId: parent.v.dag.dagId,
      programId: ps.program.programId, renderComputationId: ps.renderComputationId, output: ps.output, onePassOutput: parentOnePass.receipt.output, qc: parent.qc.qcReceiptId,
      finding: { findingId: finding.findingId, affectedOutput: finding.affectedOutput, evidenceRefs: finding.evidenceRefs }, reportId: pr.report.reportId,
      observations: pr.observations.map(o => o.observationId), segments: ps.segments, processes: ps.processes,
      measurements: ps.measurements, accounting: ps.accounting, reuse: ps.reuse, renderMs: parent.renderMs, onePassRenderMs: parentOnePass.renderMs, qcMs: parent.qcMs,
      observeMs: pr.observeMs },
    repairPlan: { planId: plan.planId, actions: plan.actions, effect: plan.effect, attempt: plan.attempt }, graphDiff: { graphDiffId: diff.graphDiffId, operations: diff.operations },
    child: { graph: { version: child.artifactVersion, revision: child.revision, editGraphId: child.editGraphId, parent: child.parent }, dagId: repaired.v.dag.dagId,
      programId: cs.program.programId, renderComputationId: cs.renderComputationId, output: cs.output, onePassOutput: childOnePass.receipt.output, qc: repaired.qc.qcReceiptId,
      reportId: cr.report.reportId, observations: cr.observations.map(o => ({ observationId: o.observationId, contentHash: o.media.kind === "rendered_output" ? o.media.contentHash : null })),
      nearBlackFindings: nearBlack(cr.report).length, segments: cs.segments, processes: cs.processes, measurements: cs.measurements,
      accounting: cs.accounting, reuse: cs.reuse, renderMs: repaired.renderMs, onePassRenderMs: childOnePass.renderMs, qcMs: repaired.qcMs, observeMs: cr.observeMs },
    impact });
});

// ================================================================ M02 reuse trust on actual files: absent, corrupt, substituted and forged state
interface Store { m: MediaEnv; parentGraph: GraphFixture; parent: Rendered & { result: SegmentedRenderResult }; plan: RepairPlan; child: EditGraphRevision;
  extra: SuppliedArtifact[]; lineage: LineageStep[] }
/** The parent rendered by segments and reviewed, and its measured black tail repaired through the accepted chain (the permit needs that lineage). */
async function reuseStore(t: TestContext): Promise<Store> {
  const m = await mediaEnv(t, SCENARIO), a = m.fixtures.get("a")!, b = m.fixtures.get("b")!;
  const parentGraph = renderGraph({ sources: [source(a), source(b, { startSeconds: 1, endSeconds: 3 })], cut: true });
  const parent = await renderSegmented(m, chainAt(parentGraph, { budget: { attempt: 1, prefix: "gate7_b3b_store" } }));
  const pr = await review(m, parent), [finding] = nearBlack(pr.report), policy = repairPolicyFor(parent.v.dag.scope);
  assert.ok(finding !== undefined);
  const plan = await planRepair({ graph: parentGraph.graph, dag: parent.v, artifacts: parent.x.artifacts, receipt: parent.receipt, qc: parent.qc, report: pr.report,
    observations: pr.observations, findingId: finding.findingId, policy, planner: new BoundaryTrimFixturePlanner() });
  const planArtifact = supplied(plan, plan.planId), withPlan = [...parent.x.artifacts, planArtifact];
  const diff = compileRepairPlan(plan, parentGraph.graph, withPlan), diffArtifact = supplied(diff, diff.graphDiffId);
  const lineage = [{ dag: parent.v, artifacts: parent.x.artifacts, receipt: parent.receipt, qc: parent.qc, report: pr.report, observations: pr.observations, policy }];
  return { m, parentGraph, parent, plan, child: applyGraphDiff(parentGraph.graph, diff, [...withPlan, diffArtifact]), extra: [planArtifact, diffArtifact], lineage };
}
/** An arbitrary typed tail trim of A to [0, 1.5 s) whose origin names a RepairPlan that exists nowhere: an attack (M04), never a repair. */
const PLAN_REF = { objectId: `repair_plan_v0_${"e".repeat(64)}`, sha256: "f".repeat(64), artifactType: "RepairPlan", artifactVersion: "0.1.0" };
function tailTrimDiff(g: GraphFixture) {
  const a = g.graph.clipUses.find(c => c.medium === "video")!;
  return createGraphDiff({ artifactType: "GraphDiff", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope: g.graph.scope,
    parent: { editGraph: g.graphArtifact.ref, editGraphId: g.graph.editGraphId, revision: 0 },
    operations: [{ op: "trim_clip_source_range", clipUseId: a.clipUseId, expected: { range: a.source.range },
      replacement: { range: { start: a.source.range.start, end: { value: 3, rate: { numerator: 2, denominator: 1 } } } } }],
    origin: { kind: "repair_plan", repairPlan: PLAN_REF, repairPlanId: PLAN_REF.objectId }, semantics: "typed_graph_diff_v0" });
}
let attempt = 10;
async function childRender(s: Store, o: { prior?: { receipt: unknown; qc: unknown } | null; limits?: { maxArtifactBytesPerExecution?: number } } = {}) {
  attempt += 1;
  const x = revisionDag(s.parentGraph, s.child, s.extra, { now: systemRuntimeClock.now(), budget: { attempt, prefix: `gate7_b3b_reuse_${attempt}` } });
  const p = await prepare(s.m, x, s.lineage), permit = await p.issue();
  const result = await executeAuthorizedSegmentedRender(permit, { prior: o.prior === undefined ? { receipt: s.parent.receipt, qc: s.parent.qc } : o.prior,
    ...(o.limits ? { limits: o.limits } : {}) });
  return { x, p, result };
}
const failure = (result: SegmentedRenderResult) => result.outcome === "failed" ? [result.failure.stage, result.failure.failureCode, result.failure.executionStarted] : ["succeeded"];

test("M02 a reused intermediate must be exactly the certified bytes: absent is recomputed, mutated, substituted or forged state is refused", async t => {
  const s = await reuseStore(t), reused = (s.parent.receipt as SegmentedRenderExecutionReceipt).segments[1]!.artifact;
  const video = segmentPath(s.m, reused.video.contentHash, "yuv"), outputs = () => readdir(join(s.m.runtime.layout.root, "render-outputs"));
  const baseline = (await childRender(s)).result;
  assert.equal(baseline.outcome, "succeeded");
  const good = (baseline as { receipt: SegmentedRenderExecutionReceipt }).receipt;
  const before = new Set(await outputs());
  // Mutated in place (one byte), then restored read-only: refused before the execution start, nothing new published.
  const bytes = await readFile(video);
  await chmod(video, 0o644); bytes[1000] = bytes[1000]! ^ 0xff; await writeFile(video, bytes); await chmod(video, 0o444);
  assert.deepEqual(failure((await childRender(s)).result), ["segment_verification", "segment_artifact_corrupt", false]);
  // Substituted by other bytes of the same size under the same name.
  await chmod(video, 0o644); await unlink(video); await writeFile(video, new Uint8Array(reused.video.sizeBytes).fill(7)); await chmod(video, 0o444);
  assert.deepEqual(failure((await childRender(s)).result), ["segment_verification", "segment_artifact_corrupt", false]);
  assert.deepEqual(new Set(await outputs()), before, "no refused execution published an output");
  // Absent: the certified artifact is gone, so the segment is recomputed (never silently counted as a hit) and the output is identical.
  await chmod(video, 0o644); await unlink(video);
  const recomputed = await childRender(s);
  assert.equal(recomputed.result.outcome, "succeeded");
  const again = (recomputed.result as { receipt: SegmentedRenderExecutionReceipt }).receipt;
  assert.deepEqual(again.segments.map(x => x.disposition), ["computed_by_this_execution", "computed_by_this_execution"]);
  assert.deepEqual([again.reuse.reused, again.reuse.computed, again.reuse.reuseUnavailable], [0, 2, 1]);
  assert.equal(again.output.contentHash, good.output.contentHash, "deterministic: the recomputed intermediate reproduces the same output");
  // A forged durable record naming other bytes contradicts the prior certification: refused.
  const recordDir = join(s.m.runtime.layout.root, "render-segment-records"), records = await readdir(recordDir);
  const recordPath = join(recordDir, records.find(r => r.startsWith(good.segments[1]!.segmentComputationId.slice(-64)))!);
  const record = JSON.parse(await readFile(recordPath, "utf8")) as { video: { contentHash: string } };
  await chmod(recordPath, 0o644); await writeFile(recordPath, JSON.stringify({ ...record, video: { ...record.video, contentHash: "5".repeat(64) } })); await chmod(recordPath, 0o444);
  assert.deepEqual(failure((await childRender(s)).result), ["segment_verification", "segment_artifact_corrupt", false]);
});

test("M03 bytes changed after verification are detected, the reuse store cannot be redirected, and the per-execution intermediate bound holds", async t => {
  const s = await reuseStore(t), reused = (s.parent.receipt as SegmentedRenderExecutionReceipt).segments[1]!.artifact;
  // The whole segment namespace redirected through a junction to a copy holding identical bytes: a location is never authority.
  const segments = join(s.m.runtime.layout.root, "render-segments"), moved = join(s.m.base, "moved-segments");
  await rename(segments, moved); await symlink(moved, segments, "junction");
  assert.deepEqual(failure((await childRender(s)).result).slice(0, 2), ["segment_verification", "segment_store_invalid"]);
  await unlink(segments); await rename(moved, segments);
  // The owner's per-execution intermediate bound is checked before any process: a bound below one segment refuses.
  assert.deepEqual(failure((await childRender(s, { limits: { maxArtifactBytesPerExecution: 1_000_000 } })).result), ["reuse_planning", "segment_store_bound_exceeded", false]);
  // No prior: nothing is reused, both segments are computed.
  const cold = await childRender(s, { prior: null });
  assert.equal(cold.result.outcome, "succeeded");
  assert.deepEqual((cold.result as { receipt: SegmentedRenderExecutionReceipt }).receipt.reuse.reused, 0);
  // The reused artifact changes in place after it was verified and before the assembly: the post-exit re-hash refuses the output.
  const video = segmentPath(s.m, reused.video.contentHash, "yuv"), size = (await stat(video)).size;
  attempt += 1;
  const x = revisionDag(s.parentGraph, s.child, s.extra, { now: systemRuntimeClock.now(), budget: { attempt, prefix: `gate7_b3b_reuse_${attempt}` } });
  const p = await prepare(s.m, x, s.lineage), permit = await p.issue();
  const mutated = await executeAuthorizedSegmentedRender(permit, { prior: { receipt: s.parent.receipt, qc: s.parent.qc }, instrumentation: { beforeAssembly: async () => {
    const bytes = await readFile(video); bytes[size - 1] = bytes[size - 1]! ^ 0x01; await chmod(video, 0o644); await writeFile(video, bytes); await chmod(video, 0o444);
  } } });
  assert.deepEqual(failure(mutated), ["input_reverification", "segment_input_mutated_during_execution", true]);
  assert.ok(mutated.outcome === "failed" && mutated.failure.output === "none_published", "a changed input never becomes a certified output");
  assert.equal(AnyRenderExecutionReceiptSchema.safeParse(mutated.outcome === "failed" ? mutated.failure : null).success, false, "a failure is never a receipt");
  assert.ok(canonicalSerialize(mutated).length > 0);
});

// ================================================================ M04 (owner review OR1) a revision executes only through its validated repair lineage
/** A record re-identified after `mutate`: self-consistent bytes and identity, whatever it claims. */
function reidentify<T extends object>(value: T, key: string, namespace: string, mutate: (copy: T) => void): T {
  const copy = structuredClone(value); mutate(copy);
  const body = { ...copy } as Record<string, unknown>; delete body[key];
  return identify(namespace, key, body) as unknown as T;
}
const refusalOf = (error: unknown) => error instanceof Error && "code" in error ? `${error.name}:${String(error.code)}` : `unowned:${String(error)}`;
test("M04 a revision executes only through its complete validated repair lineage: an arbitrary GraphDiff, a fabricated plan or foreign bindings get no permit", async t => {
  const s = await reuseStore(t), outputs = () => readdir(join(s.m.runtime.layout.root, "render-outputs")), before = new Set(await outputs());
  const graph = s.parentGraph.graph, b = graph.clipUses.filter(c => c.medium === "video")[1]!;
  // An arbitrary typed GraphDiff: a valid trim whose origin names a RepairPlan that exists nowhere.
  const arbitrary = tailTrimDiff(s.parentGraph), arbitraryDiff = supplied(arbitrary, arbitrary.graphDiffId);
  const arbitraryChild = applyGraphDiff(graph, arbitrary, [...s.parentGraph.artifacts, arbitraryDiff]);
  // A fabricated RepairPlan: self-identified and compiling exactly to its GraphDiff, but never made from this render's finding (it trims B's head).
  const forged = reidentify(s.plan, "planId", "repair_plan_v0", p => {
    p.actions = [{ action: "trim_clip_source_range", clipUseId: b.clipUseId, keep: { start: canonicalTime(frameTime(36, { numerator: 30, denominator: 1 })), end: b.source.range.end } }];
  });
  const forgedPlan = supplied(forged, forged.planId), forgedGraphDiff = compileRepairPlan(forged, graph, s.parentGraph.artifacts);
  const forgedDiff = supplied(forgedGraphDiff, forgedGraphDiff.graphDiffId), forgedChild = applyGraphDiff(graph, forgedGraphDiff, [...s.parentGraph.artifacts, forgedDiff]);
  // The genuine plan's render bindings under another owner repair policy than the one it was made under.
  const foreign = [{ ...s.lineage[0]!, policy: repairPolicyFor(s.parent.v.dag.scope, { budget: { maxRepairAttempts: 3 } }) }];
  const cases: [string, AnyEditGraph, SuppliedArtifact[], readonly LineageStep[] | undefined][] = [
    ["arbitrary_diff_without_lineage", arbitraryChild, [arbitraryDiff], undefined],
    ["arbitrary_diff_with_genuine_bindings", arbitraryChild, [arbitraryDiff], s.lineage],
    ["fabricated_plan_with_genuine_bindings", forgedChild, [forgedPlan, forgedDiff], s.lineage],
    ["genuine_child_with_foreign_bindings", s.child, s.extra, foreign],
    ["genuine_child_without_lineage", s.child, s.extra, undefined],
    ["root_graph_with_a_lineage", graph, [], s.lineage],
  ];
  const outcomes: Record<string, string> = {};
  for (const [label, g, extra, repair] of cases) {
    attempt += 1;
    const o = { now: systemRuntimeClock.now(), budget: { attempt, prefix: `gate7_b3b_gate_${attempt}` } };
    const p = await prepare(s.m, g.revision === 0 ? chainAt(s.parentGraph, o) : revisionDag(s.parentGraph, g, extra, o), repair);
    // An issued permit is executed: what it renders is exactly what the gate must prevent.
    outcomes[label] = await p.issue().then(async permit => {
      const result = await executeAuthorizedRender(permit);
      return result.outcome === "succeeded" ? `rendered:${result.receipt.output.contentHash}` : `failed:${result.failure.failureCode}`;
    }, refusalOf);
  }
  assert.deepEqual(outcomes, {
    arbitrary_diff_without_lineage: "EditRepairError:repair_lineage_invalid", arbitrary_diff_with_genuine_bindings: "EditRepairError:repair_lineage_invalid",
    fabricated_plan_with_genuine_bindings: "EditRepairError:repair_action_unrelated_to_finding", genuine_child_with_foreign_bindings: "EditRepairError:repair_plan_invalid",
    genuine_child_without_lineage: "EditRepairError:repair_lineage_invalid", root_graph_with_a_lineage: "EditRenderError:input_invalid" });
  assert.deepEqual(new Set(await outputs()), before, "no revision without its validated lineage was rendered");
  // The genuine child with its genuine lineage is permitted (M01-M03 execute it).
  attempt += 1;
  const genuine = await prepare(s.m, revisionDag(s.parentGraph, s.child, s.extra, { now: systemRuntimeClock.now(), budget: { attempt, prefix: `gate7_b3b_gate_${attempt}` } }),
    s.lineage);
  assert.ok(await genuine.issue());
});
