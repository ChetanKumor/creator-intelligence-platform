// Phase 5 Gate 7 Batch 3A actual-media integration. Tiny synthetic sources are generated with the accepted Batch-2B fixture generator (a
// frequency-0 tone segment is digital silence), rendered through the accepted Batch-2B chain and independently QC'd. The review plan is then
// derived from the executed program, and the Batch-3A observation adapter decodes the ACTUAL published bytes with the pinned FFmpeg. The
// semantic critic here is the synthetic fixture critic, not a model. Synthetic media only; no real footage, no provider, no network.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { appendFile, chmod, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, type RuntimeCall, type StagedSourceReceipt,
  type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import type { RenderExecutionReceipt, TechnicalMediaQcReceipt } from "../packages/edit-render/index.js";
import { EDIT_REVIEW_ERROR_CODES, EditReviewError, ObservationCache, buildTranscriptPack, createEvidenceRequest, createReviewPolicy, createTranscriptEvidence, planReview,
  renderTranscriptText, runCriticReview, selectEvidence, type EditorialObservation, type ReviewPlan, type ReviewPolicy, type TranscriptEvidence } from "../packages/edit-review/index.js";
import { executeAuthorizedRender, issueExecutablePermit, probePinnedMediaRuntime, probeStagedInputs, type RenderExecutionResult } from "../scripts/edit-render-local.js";
import { runTechnicalMediaQc } from "../scripts/edit-media-qc-local.js";
import { createSyntheticFixtureLifecycleAuthority, type SyntheticFixtureLifecycleAuthority, type TrustedLifecycleObservation } from "../scripts/edit-render-fixture-authority-local.js";
import { createLocalEditRuntime, systemRuntimeClock, type LocalEditRuntime } from "../scripts/edit-runtime-local.js";
import { observeReviewTargets, type ObservationRun } from "../scripts/edit-observation-local.js";
import type { DagFixture } from "./support/edit-execution.js";
import { cfrMetadata, realPolicy, renderDag, renderGraph } from "./support/edit-render.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, decodeGrayFrames, frameIndexOf, generateSource, isSolidFrame, sha256Of, type SourceSpec } from "./support/edit-render-media.js";
import { SyntheticFixtureCritic } from "./support/edit-review.js";

const EVIDENCE = join(PROJECT_ROOT, ".test-artifacts", "phase5-gate7-batch3a");
async function persist(name: string, value: unknown): Promise<void> {
  await mkdir(EVIDENCE, { recursive: true });
  await writeFile(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}
async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof EditReviewError) { assert.ok((EDIT_REVIEW_ERROR_CODES as readonly string[]).includes(error.code), error.code); return error.code; }
    assert.fail(`expected an owned refusal, received ${String(error)}`);
  }
  assert.fail("expected an owned refusal");
}
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}
const LOCATION = /[A-Za-z]:[\\/]|\\\\|\/\/|https?:|\.(?:exe|bin|mp4|mov|json)\b/i;

// ---------------------------------------------------------------- one isolated media environment per test (test-owned, removed afterwards)
interface Fixture { name: string; path: string; assetId: string; contentHash: string; sizeBytes: number; spec: SourceSpec }
interface MediaEnv { base: string; runtime: LocalEditRuntime; authority: SyntheticFixtureLifecycleAuthority; fixtures: Map<string, Fixture> }
async function mediaEnv(t: TestContext, specs: Record<string, SourceSpec>): Promise<MediaEnv> {
  await mkdir(join(PROJECT_ROOT, ".test-artifacts"), { recursive: true });
  const base = await mkdtemp(join(PROJECT_ROOT, ".test-artifacts", "b3a-"));
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
interface Rendered { x: DagFixture; v: ValidatedExecutionDag; receipt: RenderExecutionReceipt; qc: TechnicalMediaQcReceipt; staged: StagedSourceReceipt[] }
/** The accepted Batch-2B chain, unchanged: registration, claim, staging, real evidence, permit, pinned FFmpeg, publication, independent QC. */
async function render(m: MediaEnv, x: DagFixture): Promise<Rendered> {
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(v, x.artifacts, m.runtime);
  const { ownership } = await acquireExecutionClaim(v, { workerId: "worker_batch3a" }, m.runtime);
  const call: RuntimeCall = { dag: v, runtime: m.runtime, ownership, artifacts: x.artifacts };
  const staged: StagedSourceReceipt[] = [];
  for (const s of v.admission.sources) staged.push(await stageClaimedSource(call, { assetId: s.assetId }));
  const lifecycle: TrustedLifecycleObservation[] = [];
  for (const s of staged) lifecycle.push(await m.authority.observe(call, s));
  const media = await probePinnedMediaRuntime(call, { toolRoot: PINNED_TOOL_ROOT });
  const conformance = await probeStagedInputs(call, media, staged);
  const result: RenderExecutionResult = await executeAuthorizedRender(await issueExecutablePermit({ call, media, staged, lifecycle, conformance, policy: realPolicy() }));
  assert.equal(result.outcome, "succeeded", result.outcome === "failed" ? JSON.stringify({ stage: result.failure.stage, code: result.failure.failureCode }) : "");
  const receipt = (result as { receipt: RenderExecutionReceipt }).receipt;
  const qc = await runTechnicalMediaQc({ dag: v, receipt, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT });
  assert.equal(qc.verdict, "pass", JSON.stringify(qc.checks.filter(c => c.outcome !== "pass")));
  return { x, v, receipt, qc, staged };
}
const chainAt = (g: ReturnType<typeof renderGraph>, o: Parameters<typeof renderDag>[1] = {}) => renderDag(g, { now: systemRuntimeClock.now(), ...o });
const outputPath = (m: MediaEnv, contentHash: string) => join(m.runtime.layout.root, "render-outputs", `${contentHash}.mp4`);

/** The owner's Batch-3A acceptance review policy (implementation policy for these tests, not an architecture constant). */
const reviewPolicy = (r: Rendered, budget: Partial<ReviewPolicy["budget"]> = {}): ReviewPolicy => createReviewPolicy({ scope: r.v.dag.scope,
  author: { kind: "owner", actorId: "owner_synthetic" }, windows: { boundaryHalfWindowFrames: 15, globalWindowFrames: 30, interiorSamples: 3 },
  budget: { maxObservations: 16, maxDeliveredFrames: 64, maxDecodedPixelFrames: 1_000_000_000, maxEvidenceBytes: 4_194_304, maxFindings: 32, maxExplanationCharacters: 400,
    maxReviewAttempts: 2, maxTranscriptCharacters: 16_384, maxDecodeMilliseconds: 120_000, ...budget } });
const planFor = (r: Rendered, policy: ReviewPolicy) => planReview({ dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy });
const observe = (m: MediaEnv, r: Rendered, policy: ReviewPolicy, plan: ReviewPlan, o: Partial<Parameters<typeof observeReviewTargets>[0]> = {}): Promise<ObservationRun> =>
  observeReviewTargets({ dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy, plan, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT, ...o });
const madAt = (o: EditorialObservation, frame: number) => o.result.frames.find(f => f.frame === frame)!.madFromPreviousMilli!;
/** Words on a 48 kHz tick clock bound to one generated fixture. */
const TPS = 48_000;
function transcriptOf(f: Fixture, words: [string, number, number, string][]): TranscriptEvidence {
  return createTranscriptEvidence({ source: { assetId: f.assetId, contentHash: f.contentHash, durationTicks: 4 * TPS }, clock: { ticksPerSecond: TPS }, language: "en",
    producer: { producerId: "synthetic_transcript_fixture", producerVersion: "0.1.0", computationBasis: "synthetic_stub", mediaBasis: "synthetic" },
    entries: words.map(([text, start, end, speakerId]) => ({ kind: "word" as const, startTicks: Math.round(start * TPS), endTicks: Math.round(end * TPS), text, speakerId })) });
}
const tones = (initial: number, changes: [number, number][]) => ({ tone: initial, toneChanges: changes.map(([atSeconds, frequency]) => ({ atSeconds, frequency })) });

// ================================================================ O01 speech-like dialogue: transcript evidence, pack, routing, drill-down, fixture critic
test("O01 a speech-like two-shot edit is reviewed from its actual rendered bytes with exact transcript lineage and a bounded source drill-down", async t => {
  const m = await mediaEnv(t, {
    sp: { video: { pattern: "testsrc2" }, ...tones(0, [[0.2, 440], [0.7, 0], [1.0, 440], [1.5, 0], [1.9, 440], [2.3, 0]]) },
    sq: { video: { pattern: "color", color: "0x3060c0" }, ...tones(0, [[1.1, 660], [1.4, 0], [1.8, 660], [2.4, 0]]) },
  });
  const sp = m.fixtures.get("sp")!, sq = m.fixtures.get("sq")!;
  const r = await render(m, chainAt(renderGraph({ sources: [source(sp), source(sq, { startSeconds: 1, endSeconds: 3 })] })));
  const policy = reviewPolicy(r), plan = planFor(r, policy);
  assert.deepEqual(plan.joins.map(j => [j.atFrame, j.classification, j.review]), [[60, "source_change", "reviewed"]]);
  const tsp = transcriptOf(sp, [["hello", 0.2, 0.45, "S1"], ["there", 0.45, 0.7, "S1"], ["this", 1.0, 1.2, "S1"], ["is", 1.2, 1.5, "S1"], ["cut", 1.9, 2.1, "S1"],
    ["gone", 2.1, 2.3, "S1"]]);
  const tsq = transcriptOf(sq, [["yes", 1.1, 1.4, "S2"], ["right", 1.8, 2.1, "S2"], ["now", 2.1, 2.4, "S2"]]);
  const packs = [tsp, tsq].map(evidence => ({ evidence, pack: buildTranscriptPack(evidence, { silenceGapTicks: 12_000, maxPhraseEntries: 64 }) }));
  const run = await observe(m, r, policy, plan, { transcripts: [tsp, tsq] });
  assert.equal(run.observations.length, plan.items.length);
  for (const o of run.observations) {
    assert.ok(o.media.kind === "rendered_output");
    assert.deepEqual({ contentHash: o.media.contentHash, sizeBytes: o.media.sizeBytes, receipt: o.media.receiptId, qc: o.media.qcReceiptId },
      { contentHash: r.receipt.output.contentHash, sizeBytes: r.receipt.output.sizeBytes, receipt: r.receipt.receiptId, qc: r.qc.qcReceiptId });
    assert.equal(o.acquisition.basis, "pinned_ffmpeg_decode_of_verified_held_object_v0");
    assert.deepEqual(o.result.frames.map(f => f.frame), Array.from({ length: o.request.window.endFrame - o.request.window.startFrame }, (_, k) => o.request.window.startFrame + k));
  }
  const boundary = run.observations[0]!;
  assert.ok(boundary.result.transcript.state === "present");
  assert.deepEqual(boundary.result.transcript.words.map(w => [w.text, w.segmentPosition, w.coverage]), [["cut", 0, "clipped_end"], ["yes", 1, "whole"]]);
  // The waveform follows the actual audio: SP's last burst runs into the cut, SQ is silent until its 1.1 s instant (output frame 63).
  assert.ok(boundary.result.waveform.state === "present");
  const rms = boundary.result.waveform.bins.map(b => b.rmsQ15);
  assert.ok(rms[57 - 45]! > 10_000 && rms[58 - 45]! > 10_000, "SP's burst before the cut");
  assert.ok(rms[61 - 45]! < 200 && rms[62 - 45]! < 200, "SQ silent after the cut");
  // A speech-selection question about the source is routed to a bounded drill-down on the staged source bytes, not a whole-video scan.
  const input = plan.inputs.find(i => i.contentHash === sp.contentHash)!;
  const selection = selectEvidence(createEvidenceRequest({ decision: "speech_selection", media: [{ kind: "staged_source", assetId: sp.assetId, contentHash: sp.contentHash }],
    interval: { startFrame: 54, endFrame: 66 }, available: { transcript: { state: "present", transcriptEvidenceId: tsp.transcriptEvidenceId, speechCoveragePerMille: 350 },
      observationIds: [] }, maxAdditionalObservations: 1 }));
  assert.equal(selection.transcript.use, "transcript_pack");
  const drill = await observe(m, r, policy, plan, { targets: selection.observations.map(o => ({ kind: "staged_source" as const, inputSlot: input.inputSlot, request: o.request })),
    transcripts: [tsp] });
  const [sourceObservation] = drill.observations;
  assert.ok(sourceObservation?.media.kind === "staged_source");
  assert.deepEqual({ contentHash: sourceObservation.media.contentHash, stagedObjectId: sourceObservation.media.stagedObjectId }, { contentHash: sp.contentHash,
    stagedObjectId: input.stagedObjectId });
  assert.ok(sourceObservation.result.transcript.state === "present");
  assert.deepEqual(sourceObservation.result.transcript.words.map(w => [w.text, w.coverage, w.coverageBasis]), [["cut", "whole", "observation_window"],
    ["gone", "clipped_end", "observation_window"]]);
  // The critic: deterministic checks, the synthetic fixture critic, exact QC linkage.
  const critic = new SyntheticFixtureCritic();
  const report = await runCriticReview({ dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy, observations: [...run.observations, ...drill.observations],
    transcripts: packs, port: critic, attempt: 1 });
  assert.equal(report.evidenceBasis, "actual_pinned_decodes_only");
  assert.deepEqual(report.findings.map(f => [f.producer.kind === "deterministic_check" ? f.producer.checkId : f.producer.criticId, f.dimension, f.joinIndex, f.basis]), [
    ["audio_level_step_at_cut", "sound", 0, "measured"], ["synthetic_fixture_critic", "trim_timing", 0, "model_assessed"]]);
  assert.equal(critic.seen[0]!.transcripts.length, 2);
  for (const record of [plan, ...run.observations, ...drill.observations, report]) assert.equal(allStrings(record).filter(s => LOCATION.test(s)).length, 0);
  await persist("o01-speech.json", { plan, observations: [...run.observations, ...drill.observations], report, accounting: { plan: run.accounting, drill: drill.accounting },
    packs: packs.map(p => ({ packId: p.pack.packId, text: renderTranscriptText(p.pack) })) });
});

// ================================================================ O02 two-shot visual cut, clean control, audio level step; cache and cross-receipt reuse
test("O02 cuts are reviewed at their exact frames from the actual bytes; evidence is reused only by computation identity, across receipts", async t => {
  const m = await mediaEnv(t, {
    a: { video: { pattern: "testsrc2" }, tone: 440 },
    b: { video: { pattern: "color", color: "0x3060c0" }, tone: 660 },
    c: { video: { pattern: "color", color: "0x3060c0" }, tone: 661 },
    z: { video: { pattern: "color", color: "0x3060c0" }, tone: 0 },
  });
  const f = (name: string) => m.fixtures.get(name)!;
  // z plays [3, 4): its frame band continues c's numbering, so the audio-step cut at frame 90 is visually continuous. (With z on [2, 3) the
  // accepted Gate-5 bounded search finds no plan for these exact fixtures; see batch3a-o02-planner-probe-2.log.)
  const g = renderGraph({ sources: [source(f("a"), { startSeconds: 0, endSeconds: 1 }), source(f("b"), { startSeconds: 1, endSeconds: 2 }),
    source(f("c"), { startSeconds: 2, endSeconds: 3 }), source(f("z"), { startSeconds: 3, endSeconds: 4 })] });
  const r = await render(m, chainAt(g)), policy = reviewPolicy(r), plan = planFor(r, policy);
  assert.deepEqual(plan.segments.map(s => s.contentHash), ["a", "b", "c", "z"].map(n => f(n).contentHash));
  assert.deepEqual(plan.joins.map(j => [j.joinIndex, j.atFrame, j.atTicks, j.atSample, j.classification]), [[0, 30, 1_000_000_000, 48_000, "source_change"],
    [1, 60, 2_000_000_000, 96_000, "source_change"], [2, 90, 3_000_000_000, 144_000, "source_change"]]);
  const cache = new ObservationCache();
  const first = await observe(m, r, policy, plan, { cache });
  const [cut, control, audioStep] = first.observations;
  assert.ok(cut !== undefined && control !== undefined && audioStep !== undefined);
  // Exact frame positions: the largest picture change in the first boundary window is exactly at the cut frame, while at the control cut
  // (identical solid pictures whose frame-number band simply continues) the cut frame is not the largest change of its own window.
  const largest = (o: EditorialObservation) => o.result.frames.filter(fr => fr.madFromPreviousMilli !== null)
    .reduce((best, fr) => fr.madFromPreviousMilli! > best.madFromPreviousMilli! ? fr : best);
  assert.equal(largest(cut).frame, 30, JSON.stringify(cut.result.frames.map(fr => [fr.frame, fr.madFromPreviousMilli])));
  assert.notEqual(largest(control).frame, 60, JSON.stringify(control.result.frames.map(fr => [fr.frame, fr.madFromPreviousMilli])));
  assert.ok(madAt(control, 60) < madAt(cut, 30), "the control cut between identical pictures is not a visual jump");
  // An independent decode of the same published bytes agrees: output frame 29 is A's pattern, frame 30 is B's solid picture.
  const frames = await decodeGrayFrames(outputPath(m, r.receipt.output.contentHash), 180, 320);
  assert.deepEqual([isSolidFrame(frames[29]!, 180, 320), isSolidFrame(frames[30]!, 180, 320), frameIndexOf(frames[59]!, 180, 320), frameIndexOf(frames[60]!, 180, 320)],
    [false, true, 59, 60]);
  // The audio level step is measured only where the audio really steps (loud B2 into Z's digital silence).
  const report = await runCriticReview({ dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy, observations: first.observations, attempt: 1 });
  assert.deepEqual(report.findings.map(fi => [fi.producer.kind === "deterministic_check" ? fi.producer.checkId : null, fi.joinIndex, fi.measurement?.values[1]! < 200]), [
    ["audio_level_step_at_cut", 2, true]]);
  assert.equal(report.evidenceBasis, "actual_pinned_decodes_only");
  // Cache: a second pass over the same receipt decodes nothing; results are identical.
  const second = await observe(m, r, policy, plan, { cache });
  assert.deepEqual({ hits: second.accounting.cacheHits, misses: second.accounting.cacheMisses, decodes: second.accounting.decodeProcesses },
    { hits: plan.items.length, misses: 0, decodes: 0 });
  assert.deepEqual(second.observations.map(o => canonicalSerialize(o.result)), first.observations.map(o => canonicalSerialize(o.result)));
  // A new attempt of the same edit publishes the same bytes; its evidence is reused under a new lineage without decoding.
  const again = await render(m, chainAt(g, { budget: { attempt: 2, prefix: "gate7_batch3a_attempt_2" } }));
  assert.equal(again.receipt.output.contentHash, r.receipt.output.contentHash);
  assert.notEqual(again.receipt.receiptId, r.receipt.receiptId);
  const againPolicy = reviewPolicy(again), againPlan = planFor(again, againPolicy);
  const reused = await observe(m, again, againPolicy, againPlan, { cache });
  assert.deepEqual({ hits: reused.accounting.cacheHits, decodes: reused.accounting.decodeProcesses }, { hits: againPlan.items.length, decodes: 0 });
  for (const o of reused.observations) {
    assert.ok(o.media.kind === "rendered_output");
    assert.equal(o.media.receiptId, again.receipt.receiptId);
    assert.deepEqual(o.acquisition.reusedFrom?.basis, "pinned_ffmpeg_decode_of_verified_held_object_v0");
  }
  const againReport = await runCriticReview({ dag: again.v, artifacts: again.x.artifacts, receipt: again.receipt, qc: again.qc, policy: againPolicy,
    observations: reused.observations, attempt: 1 });
  assert.equal(againReport.evidenceBasis, "actual_pinned_decodes_only");
  assert.deepEqual(againReport.findings.map(fi => fi.measurement), report.findings.map(fi => fi.measurement));
  await persist("o02-cuts.json", { plan, report, accounting: { first: first.accounting, second: second.accounting, reused: reused.accounting },
    mad: first.observations.slice(0, 3).map(o => o.result.frames.map(fr => [fr.frame, fr.madFromPreviousMilli])), rms: audioStep.result.waveform });
});

// ================================================================ O03 no-speech music/montage: no transcript anywhere, rhythmic audio, a black shot
test("O03 a no-speech montage is a first-class review: routing needs no transcript, black frames and level steps are measured, never judged", async t => {
  const pulses = tones(880, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].map((at, i): [number, number] => [at, i % 2 === 0 ? 0 : 880]));
  const m = await mediaEnv(t, { m1: { video: { pattern: "testsrc2" }, ...pulses }, k: { video: { pattern: "color", color: "black" }, ...pulses },
    m2: { video: { pattern: "color", color: "0x60c030" }, ...pulses } });
  const f = (name: string) => m.fixtures.get(name)!;
  const r = await render(m, chainAt(renderGraph({ sources: [source(f("m1"), { startSeconds: 0, endSeconds: 1 }), source(f("k"), { startSeconds: 1, endSeconds: 2 }),
    source(f("m2"), { startSeconds: 2, endSeconds: 3 })] })));
  const policy = reviewPolicy(r), plan = planFor(r, policy);
  assert.deepEqual(plan.joins.map(j => j.atFrame), [30, 60]);
  const selection = selectEvidence(createEvidenceRequest({ decision: "music_sync", media: [{ kind: "rendered_output", outputArtifactId: r.receipt.output.outputArtifactId,
    contentHash: r.receipt.output.contentHash }], interval: { startFrame: 20, endFrame: 40 }, available: { transcript: { state: "absent" }, observationIds: [] },
  maxAdditionalObservations: 1 }));
  assert.deepEqual({ profile: selection.profile, transcript: selection.transcript.use }, { profile: "visual_music_driven", transcript: "not_required" });
  const run = await observe(m, r, policy, plan);
  const drill = await observe(m, r, policy, plan, { targets: selection.observations.map(o => ({ kind: "rendered_drill_down" as const, request: o.request })) });
  const report = await runCriticReview({ dag: r.v, artifacts: r.x.artifacts, receipt: r.receipt, qc: r.qc, policy, observations: [...run.observations, ...drill.observations], attempt: 1 });
  assert.deepEqual(report.findings.map(fi => [fi.producer.kind === "deterministic_check" ? fi.producer.checkId : null, fi.affectedOutput.startFrame, fi.affectedOutput.endFrame]), [
    ["audio_level_step_at_cut", 27, 33], ["near_black_frames", 30, 60], ["audio_level_step_at_cut", 57, 63]]);
  assert.ok(report.findings.every(fi => fi.severity === "info" && fi.basis === "measured"), "a measured signal on a cut-on-the-beat is not an editorial verdict");
  assert.deepEqual(report.semanticCritic, { state: "not_computed", reasonCode: "no_semantic_critic_port_supplied" });
  assert.ok(run.observations.every(o => o.result.transcript.state === "not_supplied"));
  await persist("o03-montage.json", { plan, report, accounting: { plan: run.accounting, drill: drill.accounting } });
});

// ================================================================ O04 exact media binding, TOCTOU, tool pinning and hard bounds
test("O04 observation refuses mutated, replaced or missing output bytes, foreign plans and QC, non-pinned tools and decodes past their bound", async t => {
  const m = await mediaEnv(t, { a: { video: { pattern: "testsrc2" }, tone: 440 } });
  const r = await render(m, chainAt(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const policy = reviewPolicy(r), plan = planFor(r, policy), path = outputPath(m, r.receipt.output.contentHash);
  const observed: Record<string, string> = {};
  const attempt = async (label: string, run: () => Promise<unknown>) => { observed[label] = await refusal(run); };
  // Tools come only from the approved pinned distribution: no search path, relative root, decoy or sub-directory.
  const decoy = join(m.base, "decoy-tools");
  await mkdir(join(decoy, "bin"), { recursive: true });
  await writeFile(join(decoy, "bin", "ffmpeg.exe"), "not the pinned build");
  for (const [label, toolRoot] of [["relative_root", ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build"], ["decoy_root", decoy], ["bin_directory", join(PINNED_TOOL_ROOT, "bin")],
    ["bare_name", "ffmpeg"]] as const) await attempt(`tool_${label}`, () => observe(m, r, policy, plan, { toolRoot }));
  // The plan must be the one this receipt, QC and policy derive; QC must be this output's.
  const tighter = reviewPolicy(r, { maxObservations: 15 });
  await attempt("plan_of_another_policy", () => observe(m, r, policy, planFor(r, tighter)));
  const other = await render(m, chainAt(renderGraph({ sources: [source(m.fixtures.get("a")!, { startSeconds: 0, endSeconds: 1 })] }), { budget: { attempt: 2, prefix: "gate7_b3a_other" } }));
  await attempt("qc_of_another_output", () => observe(m, r, policy, plan, { qc: other.qc }));
  // A decode that cannot finish inside its bound is refused and yields no observation.
  const instant = reviewPolicy(r, { maxDecodeMilliseconds: 1 });
  await attempt("decode_timeout", () => observe(m, r, instant, planFor(r, instant)));
  // Added with the self-review D4 repair: a drill-down counts against the same review budget as the planned items, before any process starts.
  const exact = reviewPolicy(r, { maxDeliveredFrames: plan.projection.deliveredFrames }), exactPlan = planFor(r, exact);
  await attempt("drill_down_over_budget", () => observe(m, r, exact, exactPlan, { targets: [...exactPlan.items.map(i => ({ kind: "plan_item" as const, itemIndex: i.itemIndex })),
    { kind: "rendered_drill_down" as const, request: { window: { startFrame: 0, endFrame: 1 }, frames: [0], audio: "none" as const } }] }));
  // Bytes changed during observation (after the identity check, before the decode) are detected by the closing re-verification.
  await attempt("changed_during_observation", () => observe(m, r, policy, plan, { instrumentation: { afterIdentityEstablished: async () => {
    await chmod(path, 0o644); await appendFile(path, Buffer.from("appended after the identity check")); } } }));
  // Bytes that no longer match the receipt are refused before any decode; a missing object is refused as missing.
  await attempt("mutated_before_observation", () => observe(m, r, policy, plan));
  await rename(path, `${path}.moved`);
  await attempt("output_missing", () => observe(m, r, policy, plan));
  assert.deepEqual(observed, { tool_relative_root: "observation_tool_unavailable", tool_decoy_root: "observation_tool_unavailable", tool_bin_directory: "observation_tool_unavailable",
    tool_bare_name: "observation_tool_unavailable", plan_of_another_policy: "review_plan_mismatch", qc_of_another_output: "technical_qc_linkage_mismatch",
    decode_timeout: "observation_decode_failed", drill_down_over_budget: "review_budget_exceeded", changed_during_observation: "observation_media_changed",
    mutated_before_observation: "observation_media_mismatch",
    output_missing: "observation_media_missing" });
  // Nothing is left behind in the runtime's private work area.
  const work = await readdir(join(m.runtime.layout.root, "render-work")).catch(() => [] as string[]);
  assert.deepEqual(work.filter(name => name.startsWith("observation-")), []);
  // The unchanged second output still observes cleanly and its records carry no location.
  const clean = await observe(m, other, reviewPolicy(other), planFor(other, reviewPolicy(other)));
  assert.equal(clean.observations.length, planFor(other, reviewPolicy(other)).items.length);
  assert.equal(allStrings(clean.observations).filter(s => LOCATION.test(s)).length, 0);
  assert.deepEqual(await sha256Of(outputPath(m, other.receipt.output.contentHash)), { contentHash: other.receipt.output.contentHash, sizeBytes: other.receipt.output.sizeBytes });
  await persist("o04-refusals.json", { observed, cleanAccounting: clean.accounting });
});

// ================================================================ O05 the persisted Batch-3A evidence carries no location
test("O05 every persisted Batch-3A evidence file is location-free", async () => {
  const names = (await readdir(EVIDENCE)).filter(n => n.endsWith(".json"));
  assert.ok(["o01-speech.json", "o02-cuts.json", "o03-montage.json", "o04-refusals.json"].every(n => names.includes(n)), names.join(","));
  let strings = 0;
  for (const name of names) {
    const all = allStrings(JSON.parse(await readFile(join(EVIDENCE, name), "utf8")));
    strings += all.length;
    assert.deepEqual(all.filter(s => LOCATION.test(s)), [], name);
  }
  await persist("o05-evidence-scan.json", { files: names.length, strings, locationLike: 0 });
});

// ================================================================ O06 self-review D7: the adapter never reads caller-owned state after the run starts
test("O06 self-review D7: an observation run uses private snapshots of the caller's policy and targets", async t => {
  const m = await mediaEnv(t, { a: { video: { pattern: "testsrc2" }, tone: 440 } });
  const r = await render(m, chainAt(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const outcome = async (run: () => Promise<unknown>) => { try { await run(); return "accepted"; } catch (error) {
    return error instanceof EditReviewError ? `refused:${error.code}` : `raw:${String(error)}`; } };
  const observed: Record<string, string> = {};
  // (1) A 1 ms decode bound widened in the caller's policy object after the identity check: the decode must still run under 1 ms.
  const instant = reviewPolicy(r, { maxDecodeMilliseconds: 1 }), instantPlan = planFor(r, instant);
  observed["widened_timeout"] = await outcome(() => observe(m, r, instant, instantPlan, { instrumentation: { afterIdentityEstablished: async () => {
    (instant.budget as { maxDecodeMilliseconds: number }).maxDecodeMilliseconds = 120_000; } } }));
  // (2) A target swapped in the caller's array after the identity check: the record must describe exactly the target resolved at the call.
  const policy = reviewPolicy(r), plan = planFor(r, policy), ending = plan.items.findIndex(i => i.purpose === "global_ending");
  assert.equal(plan.items[0]!.request.window.endFrame - plan.items[0]!.request.window.startFrame,
    plan.items[ending]!.request.window.endFrame - plan.items[ending]!.request.window.startFrame, "the two windows decode to the same byte count");
  const targets: { kind: "plan_item"; itemIndex: number }[] = [{ kind: "plan_item", itemIndex: 0 }];
  const swapped = await observe(m, r, policy, plan, { targets, instrumentation: { afterIdentityEstablished: async () => { targets[0] = { kind: "plan_item", itemIndex: ending }; } } });
  observed["swapped_target"] = `observation_for_item_${swapped.observations[0]!.planItem!.itemIndex}`;
  assert.deepEqual(observed, { widened_timeout: "refused:observation_decode_failed", swapped_target: "observation_for_item_0" });
});

// ================================================================ O07 self-review D9: accounting states whether a cache was consulted and counts only real misses
test("O07 self-review D9: run accounting counts a cache miss only for a lookup that missed and says when no cache was consulted", async t => {
  const m = await mediaEnv(t, { a: { video: { pattern: "testsrc2" }, tone: 440 } });
  const r = await render(m, chainAt(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const policy = reviewPolicy(r), plan = planFor(r, policy), n = plan.items.length, cache = new ObservationCache();
  assert.ok(plan.items.every(i => i.request.audio === "window"), "every item decodes one video and one audio window");
  const stated = (run: ObservationRun) => ({ cache: "cache" in run.accounting ? run.accounting.cache : "not_stated", hits: run.accounting.cacheHits,
    misses: run.accounting.cacheMisses, decodes: run.accounting.decodeProcesses });
  const without = await observe(m, r, policy, plan), first = await observe(m, r, policy, plan, { cache }), second = await observe(m, r, policy, plan, { cache });
  assert.deepEqual({ without: stated(without), first: stated(first), second: stated(second) }, { without: { cache: "not_supplied", hits: 0, misses: 0, decodes: 2 * n },
    first: { cache: "consulted", hits: 0, misses: n, decodes: 2 * n }, second: { cache: "consulted", hits: n, misses: 0, decodes: 0 } });
});

// ================================================================ O08 final hostile pass A1: a mutable stand-in runtime swapped to a copied root mid-run
test("O08 self-review A1: a stand-in runtime whose root is swapped mid-run to a copied root never yields an observation of other bytes", async t => {
  const m = await mediaEnv(t, { a: { video: { pattern: "testsrc2" }, tone: 440 } });
  const r = await render(m, chainAt(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const policy = reviewPolicy(r), plan = planFor(r, policy), slot = plan.inputs[0]!.inputSlot;
  // A copy of the runtime root under the same names, whose staged object then carries other bytes.
  const copied = join(m.base, "copied-runtime");
  await cp(m.runtime.layout.root, copied, { recursive: true });
  const [stagedName] = await readdir(join(copied, "staged-objects"));
  const stagedCopy = join(copied, "staged-objects", stagedName!);
  await chmod(stagedCopy, 0o644); await appendFile(stagedCopy, Buffer.from("other bytes under the same name"));
  const standIn = (root: string): { runtime: LocalEditRuntime; layout: { root: string } } => {
    const layout = { ...m.runtime.layout, root }; return { runtime: { ...m.runtime, layout }, layout };
  };
  const targets = [{ kind: "plan_item" as const, itemIndex: 0 },
    { kind: "staged_source" as const, inputSlot: slot, request: { window: { startFrame: 0, endFrame: 2 }, frames: [0], audio: "none" as const } }];
  // After the output's identity is established, the stand-in's root moves to the copy; the staged source is then found there.
  const swapped = standIn(m.runtime.layout.root);
  assert.equal(await refusal(() => observe(m, r, policy, plan, { runtime: swapped.runtime, targets, instrumentation: { afterIdentityEstablished: async () => {
    swapped.layout.root = copied; } } })), "observation_media_mismatch");
  // Control: identical output bytes found through the copied root are the same evidence, because content identity, not location, is authority.
  const direct = await observe(m, r, policy, plan, { targets: [targets[0]!] });
  const viaCopy = await observe(m, r, policy, plan, { runtime: standIn(copied).runtime, targets: [targets[0]!] });
  assert.deepEqual([viaCopy.observations[0]!.computationId, canonicalSerialize(viaCopy.observations[0]!.result)],
    [direct.observations[0]!.computationId, canonicalSerialize(direct.observations[0]!.result)]);
});
