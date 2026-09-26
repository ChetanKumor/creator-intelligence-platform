// Phase 5 Gate 7 Batch 2B actual-media integration: tiny synthetic sources generated locally, entered into the accepted chain
// (fixture registration, analysis evidence, EditGraph, admission, DAG, registration, claim, staging), then the trusted Batch-2B
// boundary (real fixture-lifecycle observation, pinned runtime and capability probe, staged-input conformance, executable permit),
// the exact pinned FFmpeg, immutable publication, receipts and independent technical QC. Synthetic media only; no real footage.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { chmod, copyFile, cp, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { identify } from "../packages/editorial/common.js";
import { acquireExecutionClaim, observeExecutionClaim, openValidatedDag, ownedKey, registerDagAttempt, stageClaimedSource, type RuntimeCall, type RuntimeClock,
  type StagedSourceReceipt, type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import { EDIT_RENDER_ERROR_CODES, EditRenderError, PINNED_MEDIA_RUNTIME, RenderExecutionFailureSchema, RenderExecutionReceiptSchema, TechnicalMediaQcReceiptSchema,
  accountingOfReceipt, argvDigestOf, compileFfmpegArguments, compileRenderProgram, deriveOutputByteBound, outputArtifactIdOf,
  type RenderExecutionFailure, type RenderExecutionReceipt, type TechnicalMediaQcReceipt } from "../packages/edit-render/index.js";
import { ExecutablePermit, TrustedInputConformance, TrustedMediaRuntime, completedProbeRun, executeAuthorizedRender, issueExecutablePermit, probePinnedMediaRuntime,
  probeStagedInputs, processFailureCodeOf, supervisePinnedProcess, type ProbeRunOutcome, type RenderExecutionResult } from "../scripts/edit-render-local.js";
import { QC_PROCESS_LIMITS, reportedVersionOf, runTechnicalMediaQc, superviseQcProcess, type QcRun } from "../scripts/edit-media-qc-local.js";
import { TrustedLifecycleObservation, createSyntheticFixtureLifecycleAuthority, type SyntheticFixtureLifecycleAuthority } from "../scripts/edit-render-fixture-authority-local.js";
import { createLocalEditRuntime, systemRuntimeClock, type LocalEditRuntime } from "../scripts/edit-runtime-local.js";
import { EXECUTION_LIMITS, type DagFixture } from "./support/edit-execution.js";
import { ManualRuntimeClock } from "./support/edit-runtime.js";
import { cfrMetadata, realPolicy, renderDag, renderGraph, vfrMetadata, type Look } from "./support/edit-render.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, decodeGrayFrames, decodeMonoAudio, dominantTones, frameIndexOf, framePts, generateSource, generateWrongOutput, isSolidFrame,
  sha256Of, type SourceSpec } from "./support/edit-render-media.js";

const EVIDENCE = join(PROJECT_ROOT, ".test-artifacts", "phase5-gate7-batch2b");
async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof EditRenderError) { assert.ok((EDIT_RENDER_ERROR_CODES as readonly string[]).includes(error.code), error.code); return error.code; }
    if (error instanceof Error && "code" in error && typeof error.code === "string") return `runtime:${error.code}`;
    assert.fail(`expected an owned refusal, received ${String(error)}`);
  }
  assert.fail("expected an owned refusal");
}
/** A coherent receipt forgery naming other output bytes: every derived field and the content identity are recomputed. */
function forgeReceiptOutput(receipt: RenderExecutionReceipt, identity: { contentHash: string; sizeBytes: number }): RenderExecutionReceipt {
  const copy = structuredClone(receipt);
  copy.output = { ...copy.output, contentHash: identity.contentHash, sizeBytes: identity.sizeBytes, outputArtifactId: outputArtifactIdOf(identity) };
  copy.measurements = { ...copy.measurements, outputBytes: identity.sizeBytes };
  copy.accounting = accountingOfReceipt(copy);
  const { receiptId: _id, ...body } = copy;
  return identify("render_execution_receipt_v0", "receiptId", body) as unknown as RenderExecutionReceipt;
}
async function persist(name: string, value: unknown): Promise<void> {
  await mkdir(EVIDENCE, { recursive: true });
  await writeFile(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------- one isolated media environment per test (test-owned, removed afterwards)
interface Fixture { name: string; path: string; assetId: string; contentHash: string; sizeBytes: number; spec: SourceSpec }
interface MediaEnv { base: string; runtime: LocalEditRuntime; clock: RuntimeClock; authority: SyntheticFixtureLifecycleAuthority; fixtures: Map<string, Fixture> }
async function mediaEnv(t: TestContext, specs: Record<string, SourceSpec>, clock: RuntimeClock = systemRuntimeClock): Promise<MediaEnv> {
  await mkdir(join(PROJECT_ROOT, ".test-artifacts"), { recursive: true });
  const base = await mkdtemp(join(PROJECT_ROOT, ".test-artifacts", "b2b-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const authority = await createSyntheticFixtureLifecycleAuthority({ root: base, clock });
  const fixtures = new Map<string, Fixture>();
  for (const [name, spec] of Object.entries(specs)) {
    const path = await generateSource(authority.fixtureDirectory, `${name}.mov`, spec);
    const registered = await authority.registerGeneratedFixture(`${name}.mov`);
    fixtures.set(name, { name, path, spec, ...registered });
  }
  await mkdir(join(base, "runtime"));
  const runtime = await createLocalEditRuntime({ runtimeRoot: join(base, "runtime"), allowedSourceRoots: [authority.fixtureDirectory], clock,
    sources: [...fixtures.values()].map(f => ({ assetId: f.assetId, path: f.path })) });
  return { base, runtime, clock, authority, fixtures };
}
const source = (f: Fixture, o: { range?: { startSeconds: number; endSeconds: number }; metadata?: ReturnType<typeof cfrMetadata> } = {}) =>
  ({ key: `media_${f.name}`, hash: f.contentHash, sizeBytes: f.sizeBytes, metadata: o.metadata ?? cfrMetadata({ hasAudio: f.spec.tone !== null }), ...(o.range ? { range: o.range } : {}) });

interface Flow { x: DagFixture; v: ValidatedExecutionDag; call: RuntimeCall; staged: StagedSourceReceipt[]; lifecycle: TrustedLifecycleObservation[]; media: TrustedMediaRuntime;
  conformance: TrustedInputConformance[] }
/** The accepted chain up to the trusted Batch-2B evidence: registration, claim, staging, then real lifecycle, runtime and conformance evidence. */
async function prepare(m: MediaEnv, x: DagFixture, workerId = "worker_media"): Promise<Flow> {
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(v, x.artifacts, m.runtime);
  const { ownership } = await acquireExecutionClaim(v, { workerId }, m.runtime);
  const call: RuntimeCall = { dag: v, runtime: m.runtime, ownership, artifacts: x.artifacts };
  const staged: StagedSourceReceipt[] = [];
  for (const s of v.admission.sources) staged.push(await stageClaimedSource(call, { assetId: s.assetId }));
  const lifecycle: TrustedLifecycleObservation[] = [];
  for (const s of staged) lifecycle.push(await m.authority.observe(call, s));
  const media = await probePinnedMediaRuntime(call, { toolRoot: PINNED_TOOL_ROOT });
  const conformance = await probeStagedInputs(call, media, staged);
  return { x, v, call, staged, lifecycle, media, conformance };
}
async function permitFor(f: Flow, policy = realPolicy()): Promise<ExecutablePermit> {
  return issueExecutablePermit({ call: f.call, media: f.media, staged: f.staged, lifecycle: f.lifecycle, conformance: f.conformance, policy });
}
const succeeded = (r: RenderExecutionResult): RenderExecutionReceipt => {
  assert.equal(r.outcome, "succeeded", r.outcome === "failed" ? JSON.stringify({ stage: r.failure.stage, code: r.failure.failureCode, excerpt: r.failure.diagnostics.excerpt }) : "");
  return (r as { receipt: RenderExecutionReceipt }).receipt;
};
const outputPath = (m: MediaEnv, contentHash: string) => join(m.runtime.layout.root, "render-outputs", `${contentHash}.mp4`);
async function qc(m: MediaEnv, v: ValidatedExecutionDag, receipt: RenderExecutionReceipt) {
  return runTechnicalMediaQc({ dag: v, receipt, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT });
}
const nowChain = (g: ReturnType<typeof renderGraph>, o: Parameters<typeof renderDag>[1] = {}) => renderDag(g, { now: systemRuntimeClock.now(), ...o });
/**
 * Source A: the moving pattern, 440 Hz until its 1.5 s instant, then 550 Hz. Source B: a solid colour, 660 Hz until 1 s, 880 Hz until
 * 2.5 s, then 990 Hz. Every frame carries its generated frame number, and the tones identify the source instant of any audio window.
 */
const TWO_SOURCES = {
  a: { video: { pattern: "testsrc2" }, tone: 440, toneChanges: [{ atSeconds: 1.5, frequency: 550 }] },
  b: { video: { pattern: "color", color: "0x3060c0" }, tone: 660, toneChanges: [{ atSeconds: 1, frequency: 880 }, { atSeconds: 2.5, frequency: 990 }] },
} satisfies Record<string, SourceSpec>;
const TONES = [440, 550, 660, 880, 990] as const;
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
/** Every 10 ms window lying wholly inside a span carries that span's tone; windows near a switch or a cut are not judged. */
function assertTones(tones: readonly (number | null)[], spans: readonly (readonly [number, number, number])[]): void {
  for (const [from, to, frequency] of spans) for (const [w, tone] of tones.entries()) {
    if (w / 100 >= from - 1e-9 && (w + 1) / 100 <= to + 1e-9) assert.equal(tone, frequency, `10 ms window at ${(w / 100).toFixed(2)} s`);
  }
}
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}

// ================================================================ M01 the pinned runtime: exact identity, never PATH
test("M01 the trusted probe verifies the exact pinned binaries inside the approved tool root and never falls back to PATH", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] }), x = nowChain(g);
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(v, x.artifacts, m.runtime);
  const { ownership } = await acquireExecutionClaim(v, { workerId: "worker_probe" }, m.runtime);
  const call: RuntimeCall = { dag: v, runtime: m.runtime, ownership, artifacts: x.artifacts };
  const media = await probePinnedMediaRuntime(call, { toolRoot: PINNED_TOOL_ROOT });
  assert.ok(TrustedMediaRuntime.is(media));
  const probe = media.runtimeProbe;
  assert.equal(probe.outcome.state, "available");
  assert.equal(probe.binaries.ffmpeg.sha256, PINNED_MEDIA_RUNTIME.ffmpeg.sha256);
  assert.equal(probe.binaries.ffprobe.sha256, PINNED_MEDIA_RUNTIME.ffprobe.sha256);
  assert.equal(probe.binaries.ffmpeg.reportedVersion, "9.0.1-essentials_build-www.gyan.dev");
  assert.ok(probe.binaries.ffmpeg.buildConfiguration.includes("--enable-libx264"));
  assert.equal(media.capabilityProbe.outcome.state, "available");
  assert.ok(media.proves(probe) && media.proves(media.capabilityProbe));
  await persist("m01-runtime-probe.json", { runtimeProbe: probe, capabilityProbe: media.capabilityProbe });
  // A decoy directory first on PATH, and tool roots that are missing, relative or outside the approved root, are refused before any process starts.
  const decoy = join(m.base, "decoy"); await mkdir(decoy); await writeFile(join(decoy, "ffmpeg.exe"), "not an executable");
  const previous = process.env["PATH"];
  process.env["PATH"] = `${decoy};${previous ?? ""}`;
  try {
    for (const toolRoot of [join(m.base, "missing"), "ffmpeg", ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build", decoy, join(PINNED_TOOL_ROOT, "bin"), join(PINNED_TOOL_ROOT, "..")]) {
      assert.equal(await refusal(() => probePinnedMediaRuntime(call, { toolRoot })), "runtime_config_invalid", toolRoot);
    }
  } finally { process.env["PATH"] = previous; }
  assert.equal(TrustedMediaRuntime.is({ ...media }), false);
  assert.equal(TrustedMediaRuntime.is(structuredClone(media)), false);
});

// ================================================================ M02 the canonical actual-media execution
test("M02 two synthetic sources, a hard cut, a non-zero trim and a clip-scoped warm look render exactly through the whole authority chain", async t => {
  const m = await mediaEnv(t, TWO_SOURCES);
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!), source(m.fixtures.get("b")!, { range: { startSeconds: 1, endSeconds: 3 } })], cut: true,
    look: { look: "warm", target: [0] } });
  const graphBefore = JSON.stringify(g.graph), x = nowChain(g), f = await prepare(m, x);
  const permit = await permitFor(f);
  assert.ok(ExecutablePermit.is(permit));
  const result = await executeAuthorizedRender(permit), receipt = succeeded(result);
  RenderExecutionReceiptSchema.parse(receipt);
  assert.equal(receipt.output.publication, "published_by_this_execution");
  assert.equal(receipt.process.exitCode, 0);
  assert.equal(receipt.inputs.length, 2);
  assert.ok(receipt.inputs.every(i => i.verification === "fresh_handle_full_sha256_immediately_before_spawn_and_after_exit"));
  const bytes = await readFile(outputPath(m, receipt.output.contentHash));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), receipt.output.contentHash);
  assert.equal(bytes.length, receipt.output.sizeBytes);
  const program = compileRenderProgram(f.v, f.call.artifacts);
  assert.equal(receipt.program.programId, program.programId);
  assert.equal(receipt.process.outputByteBound, deriveOutputByteBound(program, realPolicy()));
  assert.ok(bytes.length <= receipt.process.outputByteBound);
  assert.equal(receipt.process.argvDigest, argvDigestOf(compileFfmpegArguments(program, { maxOutputBytes: receipt.process.outputByteBound }).argv));
  // Independent technical QC of the published artifact.
  const report = await qc(m, f.v, receipt);
  TechnicalMediaQcReceiptSchema.parse(report);
  assert.equal(report.verdict, "pass", JSON.stringify(report.checks.filter(c => c.outcome !== "pass")));
  assert.equal(report.observed.videoFrames, 120);
  assert.equal(report.observed.audioSamples, 192_000);
  // Every output frame is exactly the source frame the program selected, read back from the frame-number band each generated frame
  // carries: A's frames 0-59, then B's frames 30-89 (the non-zero trim), none dropped, repeated or shifted, and the cut exactly at 60.
  const out = outputPath(m, receipt.output.contentHash), frames = await decodeGrayFrames(out, 180, 320);
  const frameIndexes = frames.map(frame => frameIndexOf(frame, 180, 320)), solid = frames.map(frame => isSolidFrame(frame, 180, 320));
  assert.deepEqual(frameIndexes, [...range(0, 60), ...range(30, 90)]);
  assert.deepEqual(solid, [...range(0, 60).map(() => false), ...range(60, 120).map(() => true)], "A's moving pattern, then B's solid colour");
  // Linked audio follows the same selection and stays aligned to the end: A plays 440 Hz until its 1.5 s instant and 550 Hz after;
  // B's 880 Hz spans its source [1, 2.5) s, so it must fill output [2, 3.5) s, then B's 990 Hz; B's 660 Hz (before its trim) never plays.
  const tones = dominantTones(await decodeMonoAudio(out), TONES);
  assert.equal(tones.length, 400);
  assertTones(tones, [[0.02, 1.47, 440], [1.53, 1.97, 550], [2.03, 3.47, 880], [3.53, 3.97, 990]]);
  assert.ok(!tones.includes(660), "no audio from before B's trim");
  assert.equal(JSON.stringify(g.graph), graphBefore, "the EditGraph is never mutated by execution");
  // No local location, command, protocol or URL survives into any actual record (attack 72).
  const records = { receipt, report, binding: permit.binding, runtimeProbe: f.media.runtimeProbe, capabilityProbe: f.media.capabilityProbe,
    conformance: f.conformance.map(c => c.record), lifecycle: f.lifecycle.map(l => l.record) };
  for (const value of allStrings(records)) {
    assert.doesNotMatch(value, /[\\]|:\/|\/\/|https?:|file:|fd:|\.exe|\.mp4|\.mov|filter_complex|creator-intelligence-platform|KOUSHIK/i, value);
  }
  await persist("m02-canonical.json", { fixtures: [...m.fixtures.values()].map(({ path: _path, ...rest }) => rest), dagId: x.dag.dagId,
    renderComputationId: x.dag.renderIdentity.renderComputationId, binding: permit.binding, receipt, qc: report, conformance: f.conformance.map(c => c.record),
    lifecycle: f.lifecycle.map(l => l.record), frameIndexes, solid, tones });
  // The canonical local execution reconciles to PASS under the owner's accounting ruling (M19 checks every dimension).
  assert.deepEqual({ status: receipt.accounting.status, ruling: (receipt.accounting as { ruling?: unknown }).ruling },
    { status: "PASS", ruling: "owner_local_non_metered_pinned_executor_ruling_v0" });
  // The claim is consumed: no second execution of this attempt, whatever permit is presented.
  assert.equal(await refusal(() => executeAuthorizedRender(permit)), "permit_consumed");
  assert.equal(await refusal(() => permitFor(f)), "execution_already_started");
});

// ================================================================ M03-M04 determinism, content addressing, preview and final
test("M03 a new attempt of the same edit reproduces identical bytes and reverifies the existing content-addressed output", async t => {
  const m = await mediaEnv(t, TWO_SOURCES);
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!), source(m.fixtures.get("b")!, { range: { startSeconds: 1, endSeconds: 3 } })], cut: true });
  const first = succeeded(await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g)))));
  const second = succeeded(await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g, { budget: { attempt: 2, prefix: "gate7_attempt_2" } })))));
  assert.notEqual(second.renderComputationId, first.renderComputationId);
  assert.equal(second.output.contentHash, first.output.contentHash);
  assert.equal(second.output.publication, "existing_output_reverified");
  assert.notEqual(first.output.outputArtifactId.slice(-64), first.renderComputationId.slice(-64));
  await persist("m03-determinism.json", { first: first.output, second: second.output, firstRender: first.renderComputationId, secondRender: second.renderComputationId });
});

test("M04 preview and final are separate render computations under separate claims; the same attempt cannot render both", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] });
  const final = nowChain(g), preview = nowChain(g, { intent: "preview" });
  const fin = await prepare(m, final);
  const v = openValidatedDag({ dag: preview.dagArtifact.ref }, preview.artifacts);
  assert.equal(await refusal(() => acquireExecutionClaim(v, { workerId: "worker_preview" }, m.runtime)), "runtime:claim_already_acquired");
  const finalReceipt = succeeded(await executeAuthorizedRender(await permitFor(fin)));
  const pf = await prepare(m, nowChain(g, { intent: "preview", budget: { attempt: 2, prefix: "gate7_preview" } }));
  const previewReceipt = succeeded(await executeAuthorizedRender(await permitFor(pf)));
  assert.equal(previewReceipt.renderIntent, "preview");
  assert.notEqual(previewReceipt.renderComputationId, finalReceipt.renderComputationId);
  assert.notEqual(previewReceipt.output.contentHash, finalReceipt.output.contentHash);
  const previewQc = await qc(m, pf.v, previewReceipt), finalQc = await qc(m, fin.v, finalReceipt);
  assert.equal(previewQc.verdict, "pass"); assert.equal(finalQc.verdict, "pass");
  assert.deepEqual(previewQc.observed.resolution, { width: 90, height: 160 });
  assert.deepEqual(finalQc.observed.resolution, { width: 180, height: 320 });
});

// ================================================================ M05-M06 exact looks and intensity boundaries
test("M05 every V0 look renders deterministically; intensity 0 is byte-identical to neutral; whole-output and clip-scoped targets differ", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const hashes = new Map<string, string>();
  let attempt = 0;
  for (const [look, intensity, target] of [["neutral", 500, "whole_output"], ["warm", 0, "whole_output"], ["warm", 1000, "whole_output"], ["cool", 1000, "whole_output"],
    ["contrast", 1000, "whole_output"], ["warm", 1000, [0]]] as const) {
    attempt += 1;
    const g = renderGraph({ sources: [source(m.fixtures.get("a")!)], look: { look: look as Look, intensityPerMille: intensity, target } });
    const f = await prepare(m, nowChain(g, { budget: { attempt, prefix: `gate7_look_${attempt}` } }));
    const receipt = succeeded(await executeAuthorizedRender(await permitFor(f)));
    const report = await qc(m, f.v, receipt);
    assert.equal(report.verdict, "pass", `${look} ${intensity}`);
    hashes.set(`${look}:${intensity}:${target === "whole_output" ? "whole" : "clip"}`, receipt.output.contentHash);
  }
  assert.equal(hashes.get("warm:0:whole"), hashes.get("neutral:500:whole"));
  assert.equal(new Set([hashes.get("neutral:500:whole"), hashes.get("warm:1000:whole"), hashes.get("cool:1000:whole"), hashes.get("contrast:1000:whole")]).size, 4);
  assert.equal(hashes.get("warm:1000:clip"), hashes.get("warm:1000:whole"), "a single-clip edit: clip scope and whole output cover the same frames");
  await persist("m05-looks.json", Object.fromEntries(hashes));
});

// ================================================================ M06-M09 timing and audio truth on actual bytes
test("M06 a variable-frame-rate source is refused by the real capability probe and the compiler; nothing is spawned", async t => {
  const m = await mediaEnv(t, { v: { video: { pattern: "testsrc2" }, tone: 440, timing: "vfr" } });
  const pts = await framePts(m.fixtures.get("v")!.path);
  assert.equal(pts.length, 80); assert.equal(pts[61]! - pts[60]!, 3 * (pts[1]! - pts[0]!));
  // The attributed Gate-6 and Batch-1 evidence claims variable-rate support; the real probe of the V0 executor overrules it.
  const x = nowChain(renderGraph({ sources: [source(m.fixtures.get("v")!, { metadata: vfrMetadata() })], vfr: true }));
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(v, x.artifacts, m.runtime);
  const { ownership } = await acquireExecutionClaim(v, { workerId: "worker_vfr" }, m.runtime);
  const call: RuntimeCall = { dag: v, runtime: m.runtime, ownership, artifacts: x.artifacts };
  const staged = [await stageClaimedSource(call, { assetId: v.admission.sources[0]!.assetId })];
  const media = await probePinnedMediaRuntime(call, { toolRoot: PINNED_TOOL_ROOT });
  assert.equal(media.capabilityProbe.outcome.state, "unavailable");
  assert.equal(media.capabilityProbe.findings.find(finding => finding.capabilityId === "timeline_video_clip")!.reasonCode, "predicate_unsupported");
  assert.equal(await refusal(() => probeStagedInputs(call, media, staged)), "source_frame_grid_unsupported");
  const lifecycle = [await m.authority.observe(call, staged[0]!)];
  assert.equal(await refusal(() => issueExecutablePermit({ call, media, staged, lifecycle, conformance: [], policy: realPolicy() })), "capability_unavailable");
});

test("M07 bytes whose timestamps contradict the admitted constant-rate table are refused by staged-input conformance", async t => {
  const m = await mediaEnv(t, { v: { video: { pattern: "testsrc2" }, tone: 440, timing: "vfr" } });
  const g = renderGraph({ sources: [source(m.fixtures.get("v")!, { metadata: cfrMetadata() })] }), f = await prepare(m, nowChain(g));
  assert.equal(f.conformance[0]!.record.outcome.state === "nonconforming" && f.conformance[0]!.record.outcome.reasonCode, "source_timebase_mismatch");
  assert.equal(await refusal(() => permitFor(f)), "input_conformance_failed");
});

test("M08 a source missing the audio the graph links is refused; a graph without audio renders a video-only output", async t => {
  const m = await mediaEnv(t, { s: { video: { pattern: "testsrc2" }, tone: null } });
  const lying = renderGraph({ sources: [source(m.fixtures.get("s")!, { metadata: cfrMetadata({ hasAudio: true }) })] });
  const f = await prepare(m, nowChain(lying));
  assert.equal(f.conformance[0]!.record.outcome.state === "nonconforming" && f.conformance[0]!.record.outcome.reasonCode, "source_audio_missing");
  assert.equal(await refusal(() => permitFor(f)), "input_conformance_failed");
  const honest = renderGraph({ sources: [source(m.fixtures.get("s")!, { metadata: cfrMetadata({ hasAudio: false }) })] });
  const h = await prepare(m, nowChain(honest, { budget: { attempt: 2, prefix: "gate7_silent" } }));
  const receipt = succeeded(await executeAuthorizedRender(await permitFor(h)));
  const report = await qc(m, h.v, receipt);
  assert.equal(report.verdict, "pass", JSON.stringify(report.checks.filter(c => c.outcome !== "pass")));
  assert.equal(report.observed.audioStreams, 0);
});

test("M09 a source_seconds trim renders exactly the PTS-member frames with audio following them", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!, { range: { startSeconds: 0.05, endSeconds: 2.05 } })] }), f = await prepare(m, nowChain(g));
  const receipt = succeeded(await executeAuthorizedRender(await permitFor(f)));
  const report = await qc(m, f.v, receipt);
  assert.equal(report.verdict, "pass");
  assert.equal(report.observed.videoFrames, 60); assert.equal(report.observed.audioSamples, 96_000);
  // [0.05, 2.05) s holds exactly the frames whose PTS is inside it: 2 (0.0667 s) to 61 (2.0333 s), never promoted to other endpoints.
  const out = outputPath(m, receipt.output.contentHash);
  assert.deepEqual((await decodeGrayFrames(out, 180, 320)).map(frame => frameIndexOf(frame, 180, 320)), range(2, 62));
  // The audio starts at the first selected frame's instant (sample 3200), so A's 440/550 Hz switch at 1.5 s lands at output 1.4333 s.
  const tones = dominantTones(await decodeMonoAudio(out), TONES);
  assert.equal(tones.length, 200);
  assertTones(tones, [[0.02, 1.41, 440], [1.46, 1.98, 550]]);
});

// ================================================================ M10-M14 permit and trust-handle forgery, expiry and claim consumption
test("M10 forged, serialized, cloned or prototype-built permits and trust handles never execute", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const f = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const permit = await permitFor(f);
  for (const forged of [{ ...permit }, JSON.parse(JSON.stringify({ binding: permit.binding })), structuredClone(permit), Object.create(ExecutablePermit.prototype) as unknown,
    { binding: permit.binding, call: f.call }]) {
    assert.equal(await refusal(() => executeAuthorizedRender(forged as ExecutablePermit)), "permit_required");
  }
  assert.throws(() => JSON.stringify(permit), (e: unknown) => e instanceof EditRenderError && e.code === "permit_not_serializable");
  for (const [field, value] of [["media", { ...f.media }], ["media", { runtimeProbe: f.media.runtimeProbe, capabilityProbe: f.media.capabilityProbe }],
    ["lifecycle", f.lifecycle.map(l => ({ record: l.record }))], ["conformance", f.conformance.map(c => ({ record: c.record }))]] as const) {
    assert.equal(await refusal(() => issueExecutablePermit({ call: f.call, media: f.media, staged: f.staged, lifecycle: f.lifecycle, conformance: f.conformance, policy: realPolicy(),
      [field]: value } as never)), "trust_handle_required", field);
  }
  // The genuine permit still executes exactly once.
  succeeded(await executeAuthorizedRender(permit));
  assert.equal(await refusal(() => executeAuthorizedRender(permit)), "permit_consumed");
});

test("M11 a permit is refused exactly at validUntil, before any process starts, and the claim stays unexecuted", async t => {
  const clock = new ManualRuntimeClock(systemRuntimeClock.now());
  const m = await mediaEnv(t, { a: TWO_SOURCES.a }, clock);
  const f = await prepare(m, renderDag(renderGraph({ sources: [source(m.fixtures.get("a")!)] }), { now: clock.now() }));
  const permit = await permitFor(f);
  clock.set(permit.binding.validUntil);
  const result = await executeAuthorizedRender(permit);
  assert.equal(result.outcome, "failed");
  assert.equal(result.outcome === "failed" && result.failure.failureCode, "permit_expired");
  assert.equal(result.outcome === "failed" && result.failure.executionStarted, false);
  assert.equal(result.outcome === "failed" && result.failure.process, null);
  RenderExecutionFailureSchema.parse((result as { failure: unknown }).failure);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-execution-starts")), []);
});

// ================================================================ M12-M16 staged-byte TOCTOU and process failures
test("M12 staged bytes tampered after the permit and before execution refuse without a process; the original source never substitutes", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const f = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const permit = await permitFor(f);
  const staged = m.runtime.staging.locate(ownedKey(f.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  await chmod(staged, 0o644); const original = await readFile(staged); original[4096] = original[4096]! ^ 0xff; await writeFile(staged, original);
  const result = await executeAuthorizedRender(permit);
  assert.equal(result.outcome === "failed" && result.failure.failureCode, "staged_input_corrupt");
  assert.equal(result.outcome === "failed" && result.failure.process, null);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
});

test("M13 an in-place mutation at the latest practical moment is detected after exit and nothing is published; a path swap cannot redirect the handle", async t => {
  const m = await mediaEnv(t, TWO_SOURCES);
  const mutate = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const staged = m.runtime.staging.locate(ownedKey(mutate.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  const mutated = await executeAuthorizedRender(await permitFor(mutate), { instrumentation: { afterInputsVerified: async () => {
    await chmod(staged, 0o644); const bytes = await readFile(staged); bytes.fill(0, 64, 4096); await writeFile(staged, bytes);
  } } });
  assert.equal(mutated.outcome, "failed");
  assert.ok(mutated.outcome === "failed" && ["staged_input_mutated_during_execution", "process_nonzero_exit"].includes(mutated.failure.failureCode), JSON.stringify(mutated));
  assert.equal(mutated.outcome === "failed" && mutated.failure.inputReverification, "changed_after_verification");
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
  // A rename over the staged path after verification either is refused by the platform or cannot affect the already-verified handle.
  const swap = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("b")!)] }), { budget: { attempt: 2, prefix: "gate7_swap" } }));
  const swapPath = m.runtime.staging.locate(ownedKey(swap.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  let swapOutcome = "not_attempted";
  const swapped = await executeAuthorizedRender(await permitFor(swap), { instrumentation: { afterInputsVerified: async () => {
    const decoy = `${swapPath}.decoy`; await copyFile(m.fixtures.get("a")!.path, decoy);
    try { await rename(decoy, swapPath); swapOutcome = "renamed_over_path"; } catch (error) { swapOutcome = `refused_${(error as { code?: string }).code ?? "unknown"}`; await rm(decoy, { force: true }); }
  } } });
  t.diagnostic(`rename over the verified staged path at the latest moment: ${swapOutcome}`);
  // Refused by the platform, or renamed: either way FFmpeg reads the already-verified handle, so the verified bytes render.
  assert.equal(swapped.outcome, "succeeded", JSON.stringify(swapped));
  await persist("m13-toctou.json", { inPlaceMutation: mutated, pathSwap: { attempt: swapOutcome, outcome: swapped.outcome } });
});

test("M14 changing or deleting the original source after staging never changes what renders", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] });
  const reference = succeeded(await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g)))));
  const f = await prepare(m, nowChain(g, { budget: { attempt: 2, prefix: "gate7_after_staging" } }));
  await writeFile(m.fixtures.get("a")!.path, "the original upload changed after staging");
  await rm(m.fixtures.get("a")!.path);
  const receipt = succeeded(await executeAuthorizedRender(await permitFor(f)));
  assert.equal(receipt.output.contentHash, reference.output.contentHash);
});

test("M15 a timeout terminates the process, a nonzero exit and a spawn failure each leave failure evidence, no output and a consumed claim", async t => {
  const m = await mediaEnv(t, TWO_SOURCES);
  const g = (key: string) => renderGraph({ sources: [source(m.fixtures.get(key)!)] });
  const timeout = await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g("a"))), realPolicy({ process: { maxWallClockMilliseconds: 1 } })));
  assert.equal(timeout.outcome === "failed" && timeout.failure.failureCode, "process_timeout");
  assert.equal(timeout.outcome === "failed" && timeout.failure.executionStarted, true);
  const nonzero = await prepare(m, nowChain(g("b"), { budget: { attempt: 2, prefix: "gate7_nonzero" } }));
  const nzPath = m.runtime.staging.locate(ownedKey(nonzero.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  const failed = await executeAuthorizedRender(await permitFor(nonzero), { instrumentation: { afterInputsVerified: async () => {
    await chmod(nzPath, 0o644); const bytes = await readFile(nzPath); await writeFile(nzPath, Buffer.alloc(bytes.length, 0x41));
  } } });
  assert.equal(failed.outcome === "failed" && failed.failure.failureCode, "process_nonzero_exit");
  const spawnFailure = await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g("a"), { budget: { attempt: 3, prefix: "gate7_spawn" } }))),
    { instrumentation: { afterInputsVerified: async context => { await rm(context.workingDirectory, { recursive: true, force: true }); } } });
  assert.equal(spawnFailure.outcome === "failed" && spawnFailure.failure.failureCode, "spawn_failed");
  for (const r of [timeout, failed, spawnFailure]) RenderExecutionFailureSchema.parse((r as { failure: unknown }).failure);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-pending")), []);
  await persist("m15-process-failures.json", { timeout, nonzero: failed, spawnFailure });
});

test("M16 an output over the derived bound is never published", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const f = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const result = await executeAuthorizedRender(await permitFor(f, realPolicy({ output: { maxOutputBytes: 10_000 } })));
  assert.equal(result.outcome === "failed" && result.failure.failureCode, "output_oversized");
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
});

// ================================================================ M17 content-addressed publication fails closed on corruption
test("M17 a corrupt object occupying the output identity fails closed as storage corruption and is never overwritten", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] });
  const reference = succeeded(await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g)))));
  const occupied = outputPath(m, reference.output.contentHash);
  await chmod(occupied, 0o644); await writeFile(occupied, "corrupt bytes planted under the content identity");
  const f = await prepare(m, nowChain(g, { budget: { attempt: 2, prefix: "gate7_corrupt" } }));
  const result = await executeAuthorizedRender(await permitFor(f));
  assert.equal(result.outcome === "failed" && result.failure.failureCode, "output_publication_corrupt");
  assert.equal(await readFile(occupied, "utf8"), "corrupt bytes planted under the content identity");
});

// ================================================================ M18 independent technical QC attacks
test("M18 QC independently fails wrong geometry, rate, frame count, audio presence or format, corrupt or truncated containers and altered bytes", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a, s: { video: { pattern: "testsrc2" }, tone: null } });
  const f = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const good = succeeded(await executeAuthorizedRender(await permitFor(f)));
  assert.equal((await qc(m, f.v, good)).verdict, "pass");
  // An attacker who can write the store publishes other bytes and a coherently re-identified receipt naming them; QC derives every
  // expectation from the DAG, never from the receipt, and re-hashes the object itself.
  const planted = async (name: string, make: (path: string) => Promise<void>) => {
    const scratch = join(m.base, `${name}.mp4`); await make(scratch);
    const identity = await sha256Of(scratch); await copyFile(scratch, outputPath(m, identity.contentHash));
    return forgeReceiptOutput(good, identity);
  };
  const cases: [string, (path: string) => Promise<void>, string][] = [
    ["wrong_geometry", p => generateWrongOutput(p, { width: 176, frames: 60 }), "video_geometry"],
    ["wrong_rate", p => generateWrongOutput(p, { rate: 25, frames: 50 }), "video_frame_rate"],
    ["wrong_frames", p => generateWrongOutput(p, { frames: 59 }), "video_frame_count"],
    ["missing_audio", p => generateWrongOutput(p, { frames: 60, audio: null }), "stream_layout"],
    ["wrong_rate_audio", p => generateWrongOutput(p, { frames: 60, audio: { rate: 44100, layout: "stereo" } }), "audio_format"],
    ["wrong_layout", p => generateWrongOutput(p, { frames: 60, audio: { rate: 48000, layout: "mono" } }), "audio_format"],
    ["corrupt", p => writeFile(p, "not an mp4 container"), "probe_output"],
    ["truncated", async p => { const bytes = await readFile(outputPath(m, good.output.contentHash)); await writeFile(p, bytes.subarray(0, Math.floor(bytes.length / 2))); }, "probe_output"],
  ];
  const verdicts: Record<string, string[]> = {};
  for (const [name, make, check] of cases) {
    const report = await qc(m, f.v, await planted(name, make));
    verdicts[name] = report.checks.filter(c => c.outcome === "fail").map(c => c.checkId);
    assert.equal(report.verdict, "fail", name);
    assert.ok(verdicts[name]!.includes(check), `${name}: ${JSON.stringify(verdicts[name])}`);
  }
  // A parseable container whose coded media payload is damaged: the full decode with errors fatal fails it (attack 83).
  const damaged = await planted("damaged_payload", async p => {
    const bytes = Buffer.from(await readFile(outputPath(m, good.output.contentHash)));
    for (let i = Math.floor(bytes.length * 0.3); i < Math.floor(bytes.length * 0.3) + 512; i += 1) bytes[i] = bytes[i]! ^ 0x5a;
    await writeFile(p, bytes);
  });
  const damagedReport = await qc(m, f.v, damaged);
  verdicts["damaged_payload"] = damagedReport.checks.filter(c => c.outcome === "fail").map(c => c.checkId);
  assert.equal(damagedReport.verdict, "fail");
  assert.ok(verdicts["damaged_payload"]!.includes("complete_decode"), JSON.stringify(verdicts["damaged_payload"]));
  // Unexpected audio (attack 79): a graph without source audio expects no audio stream, and an output that has one fails.
  const silent = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("s")!)] }), { budget: { attempt: 2, prefix: "gate7_qc_silent" } }));
  const silentGood = succeeded(await executeAuthorizedRender(await permitFor(silent)));
  assert.equal((await qc(m, silent.v, silentGood)).verdict, "pass");
  const scratch = join(m.base, "unexpected_audio.mp4");
  await generateWrongOutput(scratch, { frames: 60, audio: { rate: 48000, layout: "stereo" } });
  const identity = await sha256Of(scratch); await copyFile(scratch, outputPath(m, identity.contentHash));
  const unexpected = await qc(m, silent.v, forgeReceiptOutput(silentGood, identity));
  verdicts["unexpected_audio"] = unexpected.checks.filter(c => c.outcome === "fail").map(c => c.checkId);
  assert.equal(unexpected.verdict, "fail");
  assert.ok(verdicts["unexpected_audio"]!.includes("stream_layout"), JSON.stringify(verdicts["unexpected_audio"]));
  const altered = outputPath(m, good.output.contentHash);
  await chmod(altered, 0o644); const bytes = await readFile(altered); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff; await writeFile(altered, bytes);
  const alteredReport = await qc(m, f.v, good);
  assert.equal(alteredReport.verdict, "fail");
  assert.ok(alteredReport.checks.some(c => c.checkId === "output_identity" && c.outcome === "fail"));
  await persist("m18-qc-attacks.json", verdicts);
});

// ================================================================ M19 accounting truth on an actual run
test("M19 actual accounting reconciles to PASS under the owner's local ruling with attributed FFmpeg reports and no invented cost; an exceeded FFmpeg-reported CPU ceiling fails without publication", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] });
  // First, before any output exists: a reservation ceiling exceeded by FFmpeg-reported CPU work fails the accounting stage before
  // publication, so nothing can occupy the output identity, and the claim stays consumed.
  const tight = { ...EXECUTION_LIMITS, cpuMilliseconds: 1 };
  const x = nowChain(g, { budget: { attempt: 2, prefix: "gate7_tight", allocations: [tight] }, estimate: { estimate: { cpuMilliseconds: 1, gpuMilliseconds: 0,
    peakRamBytes: 2_000_000_000, peakVramBytes: 0, wallClockMilliseconds: 120_000, apiSpendInrMicros: 0, totalCostInrMicros: 5_000 } } });
  const result = await executeAuthorizedRender(await permitFor(await prepare(m, x)));
  const afterExceeded = { outputs: await readdir(join(m.runtime.layout.root, "render-outputs")), pending: await readdir(join(m.runtime.layout.root, "render-pending")) };
  // Then the canonical local execution inside its reservation.
  const receipt = succeeded(await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g)))));
  await persist("m19-accounting.json", { accounting: receipt.accounting, exceeded: result, afterExceeded });
  assert.equal(result.outcome === "failed" && result.failure.failureCode, "reservation_consumption_exceeded");
  const failure = (result as { failure: RenderExecutionFailure }).failure;
  assert.deepEqual({ stage: failure.stage, status: failure.accounting.status, exceeded: failure.accounting.dimensions.filter(d => d.withinReservation === false).map(d => d.dimension),
    cpu: failure.accounting.dimensions.find(d => d.dimension === "cpuMilliseconds")!.coverage, output: failure.output },
  { stage: "accounting", status: "FAIL", exceeded: ["cpuMilliseconds"], cpu: "ffmpeg_reported", output: "none_published" });
  assert.deepEqual(afterExceeded, { outputs: [], pending: [] }, "nothing is published and no pending output remains");
  assert.ok(await observeExecutionClaim(x.dag.dispatch.claimTarget.claimTargetId, m.runtime) !== null, "a failed attempt keeps its claim consumed");
  const byName = Object.fromEntries(receipt.accounting.dimensions.map(d => [d.dimension, d]));
  assert.deepEqual({ status: receipt.accounting.status, ruling: (receipt.accounting as { ruling?: unknown }).ruling },
    { status: "PASS", ruling: "owner_local_non_metered_pinned_executor_ruling_v0" });
  assert.equal(byName["wallClockMilliseconds"]!.coverage, "measured");
  assert.ok(byName["wallClockMilliseconds"]!.value! > 0);
  // FFmpeg's own reports stay attributed to FFmpeg and are never relabelled measured; peak memory keeps its PeakPagefileUsage meaning.
  assert.deepEqual([byName["cpuMilliseconds"]!.coverage, byName["cpuMilliseconds"]!.basis], ["ffmpeg_reported", "ffmpeg_benchmark_win32_process_user_plus_kernel_time_self_reported_v0"]);
  assert.deepEqual([byName["peakRamBytes"]!.coverage, byName["peakRamBytes"]!.basis], ["ffmpeg_reported", "ffmpeg_benchmark_maxrss_win32_peak_pagefile_usage_self_reported_v0"]);
  for (const name of ["gpuMilliseconds", "peakVramBytes", "apiSpendInrMicros", "modelCalls"]) assert.equal(byName[name]!.coverage, "not_applicable", name);
  // Total monetary cost is not applicable to this local, non-metered execution: it carries no value, never a zero.
  assert.deepEqual([byName["totalCostInrMicros"]!.coverage, byName["totalCostInrMicros"]!.value], ["not_applicable", null]);
  assert.equal(byName["outputBytes"]!.value, receipt.output.sizeBytes);
  assert.ok(receipt.accounting.dimensions.every(d => d.withinReservation !== false), "every dimension is within its reservation");
});

// ================================================================ M20-M23 self-review regressions
const noExecution = async (m: MediaEnv, result: RenderExecutionResult, code: string, stage: string) => {
  assert.equal(result.outcome, "failed", JSON.stringify(result.outcome === "succeeded" ? result.receipt.output : null));
  const failure = (result as { failure: { failureCode: string; stage: string; executionStarted: boolean; process: unknown } }).failure;
  assert.equal(failure.failureCode, code); assert.equal(failure.stage, stage);
  assert.equal(failure.executionStarted, false); assert.equal(failure.process, null);
  RenderExecutionFailureSchema.parse(failure);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-execution-starts")), [], "the claim's one execution is not consumed");
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
};

// Self-review D1: the fixture lifecycle authority is queried at execution time, not only when the observation is recorded.
test("M20 deletion or expiry recorded after the lifecycle observation is honoured at permit issue and at execution start", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a, b: TWO_SOURCES.b, c: { video: { pattern: "color", color: "0x20a040" }, tone: 330 } });
  // One logical operation in one runtime: each flow is its own accepted attempt.
  const flow = async (key: string, attempt: number) => prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get(key)!)] }),
    { budget: { attempt, prefix: `gate7_lifecycle_${key}` } }));
  // Deleted after the permit is issued: refused at execution start, before any process.
  const deleted = await flow("a", 1), deletedPermit = await permitFor(deleted);
  m.authority.requestDeletion(m.fixtures.get("a")!.assetId);
  await noExecution(m, await executeAuthorizedRender(deletedPermit), "lifecycle_deleted", "authority_recheck");
  // Retention ended after the permit is issued: refused the same way.
  const expired = await flow("b", 2), expiredPermit = await permitFor(expired);
  m.authority.setExpiry(m.fixtures.get("b")!.assetId, m.clock.now());
  await noExecution(m, await executeAuthorizedRender(expiredPermit), "lifecycle_expired", "authority_recheck");
  // Deleted after the observation but before the permit: no permit is issued from the stale observation.
  const stale = await flow("c", 3);
  m.authority.requestDeletion(m.fixtures.get("c")!.assetId);
  assert.equal(await refusal(() => permitFor(stale)), "lifecycle_deleted");
});

// Self-review D2 (and attack 65): only the verified output object is ever linked under its content identity.
test("M21 a pending output replaced or removed during execution is never published, and the private pending name is cleaned", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] }), pending = join(m.runtime.layout.root, "render-pending");
  const pendingOutput = async () => { const names = (await readdir(pending)).filter(n => n.endsWith(".mp4")); assert.equal(names.length, 1); return join(pending, names[0]!); };
  // Replaced: the pending name now holds foreign bytes while FFmpeg keeps writing the verified, still-open object.
  const replaced = await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g))), { instrumentation: { afterInputsVerified: async () => {
    const path = await pendingOutput(); await rm(path); await writeFile(path, "foreign bytes placed under the private pending name");
  } } });
  assert.equal(replaced.outcome === "failed" && replaced.failure.failureCode, "output_publication_corrupt", JSON.stringify(replaced.outcome));
  assert.equal(replaced.outcome === "failed" && replaced.failure.stage, "publication");
  assert.equal(replaced.outcome === "failed" && replaced.failure.process?.exitCode, 0);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), [], "nothing is linked under the content identity");
  assert.deepEqual(await readdir(pending), [], "the private pending name is cleaned");
  // Removed: the output is missing at publication despite a zero exit.
  const removed = await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g, { budget: { attempt: 2, prefix: "gate7_pending_removed" } }))),
    { instrumentation: { afterInputsVerified: async () => { await rm(await pendingOutput()); } } });
  assert.equal(removed.outcome === "failed" && removed.failure.failureCode, "output_missing", JSON.stringify(removed.outcome === "failed" ? removed.failure.failureCode : null));
  assert.equal(removed.outcome === "failed" && removed.failure.process?.exitCode, 0);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
  // Both claims stay consumed, the store is not poisoned, and a new attempt publishes normally.
  const later = succeeded(await executeAuthorizedRender(await permitFor(await prepare(m, nowChain(g, { budget: { attempt: 3, prefix: "gate7_pending_later" } })))));
  assert.equal(later.output.publication, "published_by_this_execution");
  await persist("m21-pending-attacks.json", { replaced, removed, later: later.output });
});

// Attack 39 and self-review D5: a staged object is consumed only as a regular file inside the runtime-owned staging namespace.
test("M22 a staged object behind a link or a reparse point never renders, even over identical bytes", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const f = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const permit = await permitFor(f);
  const staged = m.runtime.staging.locate(ownedKey(f.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  // A file symbolic link needs a privilege this user may not hold: the platform's answer is recorded, never assumed.
  let fileLink = "created";
  try { await symlink(m.fixtures.get("a")!.path, join(m.base, "probe.link"), "file"); } catch (error) { fileLink = `refused_${(error as { code?: string }).code ?? "unknown"}`; }
  t.diagnostic(`file symbolic link for this user: ${fileLink}`);
  // A directory junction needs no privilege: the staging namespace is replaced by a junction to a directory holding the very same
  // verified bytes under the same name. The bytes would verify; the object is not runtime-owned, so it must never render.
  const namespace = dirname(staged), elsewhere = join(m.base, "elsewhere");
  await mkdir(elsewhere); await copyFile(staged, join(elsewhere, basename(staged)));
  await rename(namespace, `${namespace}.moved`); await symlink(elsewhere, namespace, "junction");
  let result: RenderExecutionResult;
  try { result = await executeAuthorizedRender(permit); } finally { await rm(namespace).catch(() => undefined); }
  assert.equal(result.outcome, "failed", JSON.stringify(result.outcome));
  assert.equal(result.outcome === "failed" && result.failure.stage, "input_verification");
  assert.equal(result.outcome === "failed" && result.failure.failureCode, "staged_input_corrupt");
  assert.equal(result.outcome === "failed" && result.failure.process, null);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
  await persist("m22-link-attacks.json", { fileLink, junction: result });
});

// ================================================================ M23-M26 owner-review regressions
/** Mutates a record in place, as any caller holding that object could, then coherently recomputes its content identity in place. */
function mutateInPlace<T extends object>(record: T, key: string, namespace: string, mutate: (value: T) => void): T {
  mutate(record);
  const { [key]: _old, ...body } = record as Record<string, unknown>;
  (record as Record<string, unknown>)[key] = (identify(namespace, key, body) as Record<string, unknown>)[key];
  return record;
}
const retime = (at: string) => (r: { checkStartedAt: string; observedAt: string; checkCompletedAt: string }) => { r.checkStartedAt = at; r.observedAt = at; r.checkCompletedAt = at; };
async function outcomeOf(run: () => Promise<unknown>): Promise<string> {
  try { const value = await run(); return typeof value === "string" ? value : "permit_issued"; } catch (error) {
    return error instanceof EditRenderError ? error.code : `unexpected:${error instanceof Error ? error.message.slice(0, 80) : String(error)}`;
  }
}

// Owner-review finding 1 (critical): the records a genuine trusted handle exposes are never its evidence. Every sub-case's observed
// behaviour is recorded before any assertion, so a red run documents exactly which record classes can escalate authority.
test("M23 records reached through genuine trusted handles cannot be mutated into authority: conformance and freshness stay the probe's own", async t => {
  const clock = new ManualRuntimeClock(systemRuntimeClock.now());
  const m = await mediaEnv(t, { a: TWO_SOURCES.a, v: { video: { pattern: "testsrc2" }, tone: 440, timing: "vfr" } }, clock);
  const observed: Record<string, string> = {};
  // (1) Genuinely nonconforming staged bytes (a variable-rate file under an admitted constant-rate table), mutated to "conforms".
  const bad = await prepare(m, renderDag(renderGraph({ sources: [source(m.fixtures.get("v")!, { metadata: cfrMetadata() })] }),
    { now: clock.now(), budget: { attempt: 1, prefix: "gate7_handle_bad" } }));
  assert.equal(bad.conformance[0]!.record.outcome.state, "nonconforming");
  mutateInPlace(bad.conformance[0]!.record, "conformanceId", "staged_input_conformance_v0", r => { r.outcome = { state: "conforms" }; });
  observed["conformance_outcome_mutated"] = await outcomeOf(async () => `permit_issued_then_execution_${(await executeAuthorizedRender(await permitFor(bad))).outcome}`);
  // (2) Genuine runtime, capability, lifecycle and conformance evidence made stale by the clock, then re-timed through the handle.
  const good = await prepare(m, renderDag(renderGraph({ sources: [source(m.fixtures.get("a")!)] }), { now: clock.now(), budget: { attempt: 2, prefix: "gate7_handle_good" } }));
  clock.advance(6_000);
  const now = clock.now();
  const cases = [
    ["runtime", "maxRuntimeProbeAgeMilliseconds", () => mutateInPlace(good.media.runtimeProbe, "probeId", "real_runtime_probe_v0", retime(now))],
    ["capability", "maxCapabilityProbeAgeMilliseconds", () => mutateInPlace(good.media.capabilityProbe, "probeId", "real_capability_probe_v0", retime(now))],
    ["lifecycle", "maxLifecycleObservationAgeMilliseconds", () => mutateInPlace(good.lifecycle[0]!.record, "observationId", "fixture_lifecycle_observation_v0", retime(now))],
    ["conformance", "maxInputConformanceAgeMilliseconds", () => mutateInPlace(good.conformance[0]!.record, "conformanceId", "staged_input_conformance_v0", retime(now))],
  ] as const;
  for (const [name, field, mutate] of cases) {
    const policy = realPolicy({ freshness: { maxRuntimeProbeAgeMilliseconds: 60_000, maxCapabilityProbeAgeMilliseconds: 60_000,
      maxLifecycleObservationAgeMilliseconds: 60_000, maxInputConformanceAgeMilliseconds: 60_000, [field]: 5_000 } });
    observed[`${name}_stale_unmutated`] = await outcomeOf(() => permitFor(good, policy));
    mutate();
    observed[`${name}_stale_after_mutation`] = await outcomeOf(() => permitFor(good, policy));
  }
  await persist("m23-trust-handle-attacks.json", observed);
  assert.deepEqual(observed, { conformance_outcome_mutated: "input_conformance_failed",
    runtime_stale_unmutated: "runtime_probe_stale", runtime_stale_after_mutation: "runtime_probe_stale",
    capability_stale_unmutated: "capability_probe_stale", capability_stale_after_mutation: "capability_probe_stale",
    lifecycle_stale_unmutated: "lifecycle_stale", lifecycle_stale_after_mutation: "lifecycle_stale",
    conformance_stale_unmutated: "input_conformance_stale", conformance_stale_after_mutation: "input_conformance_stale" });
  // A coherently re-identified mutated copy is never certified; the handles' own records still are.
  const copies = [[good.media.runtimeProbe, "probeId", "real_runtime_probe_v0"], [good.media.capabilityProbe, "probeId", "real_capability_probe_v0"]] as const;
  for (const [copy, key, namespace] of copies) { mutateInPlace(copy, key, namespace, retime(now)); assert.equal(good.media.proves(copy), false, namespace); }
  assert.ok(good.media.proves(good.media.runtimeProbe) && good.media.proves(good.media.capabilityProbe));
  const conformanceCopy = mutateInPlace(good.conformance[0]!.record, "conformanceId", "staged_input_conformance_v0", retime(now));
  assert.equal(good.conformance[0]!.proves(conformanceCopy), false);
  const lifecycleCopy = mutateInPlace(good.lifecycle[0]!.record, "observationId", "fixture_lifecycle_observation_v0", retime(now));
  assert.equal(good.lifecycle[0]!.proves(lifecycleCopy), false);
  assert.ok(good.conformance[0]!.proves(good.conformance[0]!.record) && good.lifecycle[0]!.proves(good.lifecycle[0]!.record));
  // The genuine, unmutated evidence still authorizes and executes.
  const receipt = succeeded(await executeAuthorizedRender(await permitFor(good)));
  assert.equal(receipt.output.publication, "published_by_this_execution");
});

// Owner-review finding 2 (high): QC supervision is bounded. A controlled stand-in for an already-spawned child exercises the exact
// supervision the pinned QC processes use; no executable enters the QC API.
const standInChild = (onKill: () => void) => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => { onKill(); return true; } });
test("M24 QC settles after its timeout and a bounded grace even when the child never closes, and records the termination truthfully", async () => {
  const limits = { timeoutMilliseconds: 50, terminationGraceMilliseconds: 200 };
  let kills = 0;
  const stubborn = standInChild(() => { kills += 1; });
  const settled = await Promise.race([superviseQcProcess(stubborn, limits), new Promise<"still_pending">(resolve => setTimeout(() => resolve("still_pending"), 2_000))]);
  assert.notEqual(settled, "still_pending", "QC never waits forever after its timeout");
  const run = settled as QcRun;
  assert.deepEqual({ code: run.code, timedOut: run.timedOut, terminationConfirmed: run.terminationConfirmed }, { code: null, timedOut: true, terminationConfirmed: false });
  assert.equal(kills, 1);
  // Terminated within the grace: the termination is confirmed, still a timeout.
  const polite: ReturnType<typeof standInChild> = standInChild(() => { setTimeout(() => polite.emit("close", null), 20); });
  const confirmed = await superviseQcProcess(polite, limits);
  assert.deepEqual({ timedOut: confirmed.timedOut, terminationConfirmed: confirmed.terminationConfirmed }, { timedOut: true, terminationConfirmed: true });
  // A child that completes in time is untouched.
  const prompt = standInChild(() => assert.fail("a completed child is never killed"));
  setTimeout(() => { prompt.stdout.end("done"); setTimeout(() => prompt.emit("close", 0), 10); }, 10);
  const completed = await superviseQcProcess(prompt, limits);
  assert.deepEqual({ code: completed.code, stdout: completed.stdout, timedOut: completed.timedOut }, { code: 0, stdout: "done", timedOut: false });
  assert.deepEqual(QC_PROCESS_LIMITS, { timeoutMilliseconds: 120_000, terminationGraceMilliseconds: 10_000 });
});

test("M25 a QC tool version is read only from a fixed query that completed: nonzero exit, spawn error, overflow and timeout fail closed", async () => {
  const banner = `ffprobe version ${PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion} Copyright (c) 2007-2026 the FFmpeg developers\n`;
  const completed: QcRun = { code: 0, stdout: banner, stderr: "", overflow: false, spawnError: false, errorAfterSpawn: false, timedOut: false, terminationConfirmed: true };
  assert.equal(reportedVersionOf(completed, "ffprobe"), PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion);
  const observed: Record<string, string> = {};
  for (const [name, bad] of [["nonzero_exit", { ...completed, code: 1 }], ["spawn_error", { ...completed, code: null, spawnError: true }], ["stdout_overflow", { ...completed, overflow: true }],
    ["timeout", { ...completed, code: null, timedOut: true }], ["termination_unconfirmed", { ...completed, code: null, timedOut: true, terminationConfirmed: false }],
    ["error_after_spawn_exit_0", { ...completed, errorAfterSpawn: true }]] as const) {
    observed[name] = await outcomeOf(async () => `version_read_${reportedVersionOf(bad, "ffprobe")}`);
  }
  assert.deepEqual(observed, { nonzero_exit: "qc_tool_unavailable", spawn_error: "qc_tool_unavailable", stdout_overflow: "qc_tool_unavailable", timeout: "qc_tool_unavailable",
    termination_unconfirmed: "qc_tool_unavailable", error_after_spawn_exit_0: "qc_tool_unavailable" });
});

// Owner-review finding 3 (high): after the durable execution start, a catchable failure ends in truthful terminal evidence.
async function settle(run: () => Promise<RenderExecutionResult>): Promise<{ result: RenderExecutionResult | null; raw: string | null }> {
  try { return { result: await run(), raw: null }; } catch (error) { return { result: null, raw: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }; }
}
test("M26 a failure after the durable execution start ends in a truthful failure record, never a raw exception; nothing is published", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const f = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const settled = await settle(async () => executeAuthorizedRender(await permitFor(f), { instrumentation: { afterInputsVerified: async () => {
    throw new Error("instrumentation failure after the execution start");
  } } }));
  await persist("m26-post-start-failure.json", settled);
  assert.equal(settled.raw, null, "no raw exception escapes after the durable execution start");
  const failure = (settled.result as { failure: RenderExecutionFailure }).failure;
  RenderExecutionFailureSchema.parse(failure);
  assert.deepEqual({ outcome: settled.result!.outcome, stage: failure.stage, code: failure.failureCode, started: failure.executionStarted, process: failure.process, output: failure.output },
    { outcome: "failed", stage: "process", code: "execution_interrupted", started: true, process: null, output: "none_published" });
  assert.equal((await readdir(join(m.runtime.layout.root, "render-execution-starts"))).length, 1, "the claim's one execution stays consumed");
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-pending")), []);
  assert.equal(await refusal(() => permitFor(f)), "execution_already_started");
});

/** A runtime clock that stays still and, once armed, steps back an hour on its Nth later reading, as a system clock can be stepped. */
class SteppingClock implements RuntimeClock {
  #milliseconds: number; #countdown = 0;
  constructor(at: string) { this.#milliseconds = Date.parse(at); }
  now(): string { if (this.#countdown > 0 && --this.#countdown === 0) this.#milliseconds -= 3_600_000; return new Date(this.#milliseconds).toISOString(); }
  stepBackOnReading(n: number): void { this.#countdown = n; }
}
test("M27 an execution whose output this attempt published but whose evidence cannot be certified names that output truthfully", async t => {
  const clock = new SteppingClock(systemRuntimeClock.now());
  const m = await mediaEnv(t, { a: TWO_SOURCES.a }, clock);
  const f = await prepare(m, renderDag(renderGraph({ sources: [source(m.fixtures.get("a")!)] }), { now: clock.now() }));
  // After the hook the adapter reads the runtime clock at spawn, at completion and when recording: the third reading steps back.
  const settled = await settle(async () => executeAuthorizedRender(await permitFor(f), { instrumentation: { afterInputsVerified: async () => { clock.stepBackOnReading(3); } } }));
  const published = await readdir(join(m.runtime.layout.root, "render-outputs"));
  await persist("m27-post-publication-terminal-evidence.json", { ...settled, published });
  assert.equal(settled.raw, null, "no raw exception escapes after publication");
  assert.equal(published.length, 1, "the output was published and verified before the evidence could not be certified");
  const failure = (settled.result as { failure: RenderExecutionFailure }).failure;
  RenderExecutionFailureSchema.parse(failure);
  const bytes = await sha256Of(join(m.runtime.layout.root, "render-outputs", published[0]!));
  assert.deepEqual({ outcome: settled.result!.outcome, stage: failure.stage, code: failure.failureCode, exit: failure.process?.exitCode, output: failure.output },
    { outcome: "failed", stage: "receipt_certification", code: "evidence_chronology_invalid", exit: 0, output: { state: "published_by_this_execution_uncertified",
      contentHash: bytes.contentHash, sizeBytes: bytes.sizeBytes, meaning: "this_execution_linked_an_object_under_this_content_identity_but_no_success_receipt_certifies_it_v0" } });
});

test("M28 a clock stepped back before spawn fails before any process; stepped back while the process runs, the owned refusal comes before any publication", async t => {
  const clock = new SteppingClock(systemRuntimeClock.now());
  const m = await mediaEnv(t, { a: TWO_SOURCES.a }, clock);
  const flow = (attempt: number) => prepare(m, renderDag(renderGraph({ sources: [source(m.fixtures.get("a")!)] }), { now: clock.now(), budget: { attempt, prefix: `gate7_clock_${attempt}` } }));
  // Stepped back on the reading taken at spawn: the chronology can never be certified, so nothing is spawned.
  const before = await settle(async () => executeAuthorizedRender(await permitFor(await flow(1)), { instrumentation: { afterInputsVerified: async () => { clock.stepBackOnReading(1); } } }));
  assert.equal(before.raw, null);
  const failure = (before.result as { failure: RenderExecutionFailure }).failure;
  assert.deepEqual({ stage: failure.stage, code: failure.failureCode, process: failure.process, output: failure.output, started: failure.executionStarted },
    { stage: "process", code: "evidence_chronology_invalid", process: null, output: "none_published", started: true });
  // Stepped back on the reading taken when the process completes: its timing cannot be recorded truthfully. The adapter raises the owned
  // refusal (the documented residual) before anything is published, and the claim stays consumed.
  const during = await settle(async () => executeAuthorizedRender(await permitFor(await flow(2)), { instrumentation: { afterInputsVerified: async () => { clock.stepBackOnReading(2); } } }));
  assert.equal(during.result, null);
  assert.match(during.raw ?? "", /^EditRenderError: The runtime clock ran backwards while the process ran/);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-outputs")), []);
  assert.deepEqual(await readdir(join(m.runtime.layout.root, "render-pending")), []);
  assert.equal((await readdir(join(m.runtime.layout.root, "render-execution-starts"))).length, 2);
  await persist("m28-clock-steps.json", { before, during });
});

// ================================================================ M29-M31 owner-review repair #2 regressions
// Owner-review 2, finding 1 (critical): a permit executes under exactly the policy whose policyId its binding names. The caller's
// policy object is theirs; mutating it after issuance must change nothing. Observations are recorded before any assertion.
test("M29 a permit executes under the exact policy its binding names: mutating the caller's policy object after issuance changes nothing", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] });
  const flow = (attempt: number) => prepare(m, nowChain(g, { budget: { attempt, prefix: `gate7_policy_${attempt}` } }));
  const describe = (r: RenderExecutionResult) => r.outcome === "succeeded" ? "succeeded" : `failed:${r.failure.failureCode}`;
  const observed: Record<string, string> = {};
  // The process bound: issued under 1 ms, then widened in the caller's object.
  const tight = realPolicy({ process: { maxWallClockMilliseconds: 1 } });
  const timeoutPermit = await permitFor(await flow(1), tight);
  tight.process.maxWallClockMilliseconds = 120_000;
  observed["timeout_widened_after_issue"] = await outcomeOf(async () => describe(await executeAuthorizedRender(timeoutPermit)));
  // The output bound: issued under 10 000 bytes, then widened and the caller's policy coherently re-identified.
  const small = realPolicy({ output: { maxOutputBytes: 10_000 } });
  const outputPermit = await permitFor(await flow(2), small);
  mutateInPlace(small, "policyId", "real_execution_policy_v0", p => { p.output.maxOutputBytes = 64 * 1024 * 1024; });
  observed["output_bound_widened_and_reidentified_after_issue"] = await outcomeOf(async () => describe(await executeAuthorizedRender(outputPermit)));
  // Invalid values written into the caller's object after issuance.
  const normal = realPolicy();
  const invalidPermit = await permitFor(await flow(3), normal);
  normal.process.maxWallClockMilliseconds = -5; normal.output.maxOutputBytes = 0;
  observed["invalid_values_after_issue"] = await outcomeOf(async () => describe(await executeAuthorizedRender(invalidPermit)));
  // Fields consumed only at issuance (freshness and permit lifetime fix the binding's validUntil) are not reread by execution.
  const fresh = realPolicy();
  const freshPermit = await permitFor(await flow(4), fresh);
  fresh.permitLifetimeMilliseconds = 1; fresh.freshness.maxRuntimeProbeAgeMilliseconds = 1;
  observed["issuance_only_fields_after_issue"] = await outcomeOf(async () => describe(await executeAuthorizedRender(freshPermit)));
  await persist("m29-policy-snapshot.json", observed);
  assert.deepEqual(observed, { timeout_widened_after_issue: "failed:process_timeout", output_bound_widened_and_reidentified_after_issue: "failed:output_oversized",
    invalid_values_after_issue: "succeeded", issuance_only_fields_after_issue: "succeeded" });
});

// Owner-review 2, finding 2 (high): trusted probe evidence comes only from a fixed query that completed normally inside its bound. The
// one acceptance rule every runtime query, listing, version query and staged-input probe uses is exercised over controlled run outcomes.
test("M30 a timed-out, unconfirmed or signaled run is never trusted probe evidence, even when it reports exit 0", () => {
  const completed: ProbeRunOutcome = { spawnError: null, errorAfterSpawn: null, exitCode: 0, signal: null, timedOut: false, terminationConfirmed: true, stdoutOverflow: false };
  assert.equal(completedProbeRun(completed), true);
  const cases: [string, ProbeRunOutcome][] = [
    ["timed_out_exit_0", { ...completed, timedOut: true }],
    ["timed_out_unconfirmed", { ...completed, exitCode: null, timedOut: true, terminationConfirmed: false }],
    ["unconfirmed_exit_0", { ...completed, terminationConfirmed: false }],
    ["signaled_exit_0", { ...completed, signal: "SIGTERM" }],
    ["nonzero_exit", { ...completed, exitCode: 1 }],
    ["spawn_error", { ...completed, spawnError: "ENOENT", exitCode: null }],
    ["stdout_overflow", { ...completed, stdoutOverflow: true }],
    ["error_after_spawn_exit_0", { ...completed, errorAfterSpawn: "EPERM" }],
  ];
  const observed = Object.fromEntries(cases.map(([name, run]) => [name, completedProbeRun(run)]));
  assert.deepEqual(observed, { timed_out_exit_0: false, timed_out_unconfirmed: false, unconfirmed_exit_0: false, signaled_exit_0: false, nonzero_exit: false,
    spawn_error: false, stdout_overflow: false, error_after_spawn_exit_0: false });
});

// Owner-review 2, finding 3 (high): QC's identity, probes and full decode describe one and the same held output object.
test("M31 QC hashes, probes and fully decodes one held output object: a pathname swap after identity changes nothing, an in-place change fails", async t => {
  const m = await mediaEnv(t, { a: TWO_SOURCES.a });
  const f = await prepare(m, nowChain(renderGraph({ sources: [source(m.fixtures.get("a")!)] })));
  const receipt = succeeded(await executeAuthorizedRender(await permitFor(f)));
  const path = outputPath(m, receipt.output.contentHash), genuine = await readFile(path), at = Math.floor(genuine.length * 0.3);
  // A compatible object: the same container, streams and frame structure, with a damaged coded payload (it probes alike, decodes badly).
  const damaged = Buffer.from(genuine);
  for (let i = at; i < at + 512; i += 1) damaged[i] = damaged[i]! ^ 0x5a;
  const summarize = (report: TechnicalMediaQcReceipt) => ({ verdict: report.verdict, failing: report.checks.filter(c => c.outcome === "fail").map(c => c.checkId),
    identity: report.observedIdentity.contentHash === receipt.output.contentHash ? "claimed_output" : "other_bytes" });
  const qcWith = (afterIdentityEstablished: () => Promise<void>) => runTechnicalMediaQc({ dag: f.v, receipt, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT,
    instrumentation: { afterIdentityEstablished } });
  const observed: Record<string, ReturnType<typeof summarize>> = {};
  // (1) Once identity is established, the pathname is replaced by the compatible damaged object.
  observed["pathname_swapped_after_identity"] = summarize(await qcWith(async () => { await chmod(path, 0o644); await rm(path); await writeFile(path, damaged); }));
  await chmod(path, 0o644); await rm(path); await writeFile(path, genuine);
  // (2) Once identity is established, the very object at the name is changed in place.
  observed["object_changed_in_place_after_identity"] = summarize(await qcWith(async () => {
    await chmod(path, 0o644);
    const handle = await open(path, "r+");
    try { await handle.write(damaged, at, 512, at); } finally { await handle.close(); }
  }));
  await persist("m31-qc-exact-object.json", observed);
  assert.deepEqual(observed["pathname_swapped_after_identity"], { verdict: "pass", failing: [], identity: "claimed_output" },
    "a pathname swap after identity never changes what QC inspects");
  assert.equal(observed["object_changed_in_place_after_identity"]!.verdict, "fail");
  assert.ok(observed["object_changed_in_place_after_identity"]!.failing.includes("output_identity"), "the bytes QC inspected are re-verified after inspection");
  assert.equal(observed["object_changed_in_place_after_identity"]!.identity, "other_bytes");
});

// ================================================================ M32-M34 owner-review repair #3 regressions
// Owner-review 3, finding 1 (critical): a permit executes only in the call context it was issued in. The RuntimeCall container is the
// caller's; replacing its members after issuance must change nothing. Every sub-case's outcome is recorded before any assertion.
test("M32 a permit executes only in the context it was issued in: replacing the runtime, DAG, ownership or artifacts in the caller's container changes nothing", async t => {
  const clock = new ManualRuntimeClock(systemRuntimeClock.now());
  const m = await mediaEnv(t, { a: TWO_SOURCES.a }, clock);
  const g = renderGraph({ sources: [source(m.fixtures.get("a")!)] });
  const flow = (attempt: number) => prepare(m, renderDag(g, { now: clock.now(), budget: { attempt, prefix: `gate7_context_${attempt}` } }));
  const replace = (f: Flow, member: keyof RuntimeCall, value: unknown) => { (f.call as unknown as Record<string, unknown>)[member] = value; };
  const runtimeOver = (root: string, at: RuntimeClock) => createLocalEditRuntime({ runtimeRoot: root, allowedSourceRoots: [m.authority.fixtureDirectory], clock: at,
    sources: [...m.fixtures.values()].map(f => ({ assetId: f.assetId, path: f.path })) });
  const attempt = async (permit: ExecutablePermit) => {
    try {
      const r = await executeAuthorizedRender(permit);
      return r.outcome === "succeeded" ? "succeeded" : `failed:${r.failure.stage}:${r.failure.failureCode}:${r.failure.executionStarted ? "started" : "not_started"}`;
    } catch (error) { return `raised:${error instanceof Error && "code" in error ? String(error.code) : String(error)}`; }
  };
  const observed: Record<string, string> = {};
  // (1) The issuing runtime's trusted clock passes validUntil; another LocalEditRuntime over the same root, ledger and staging namespace,
  // whose separate clock still reads inside the permit window, is put into the caller's container.
  const expired = await flow(1), expiredPermit = await permitFor(expired);
  clock.set(expiredPermit.binding.validUntil); clock.advance(1_000);
  replace(expired, "runtime", await runtimeOver(m.runtime.layout.root, new ManualRuntimeClock(expiredPermit.binding.authorizedAt)));
  observed["stale_clock_runtime_over_same_root"] = await attempt(expiredPermit);
  // (2) Only the clock port replaced: the genuine runtime's other ports in another object, whose clock reads inside the window.
  const port = await flow(2), portPermit = await permitFor(port);
  clock.set(portPermit.binding.validUntil); clock.advance(1_000);
  replace(port, "runtime", { ...m.runtime, clock: new ManualRuntimeClock(portPermit.binding.authorizedAt) });
  observed["stale_clock_port_in_another_runtime_object"] = await attempt(portPermit);
  // (3) Two permits of one claim. The runtime root is copied before the claim's single execution is recorded, the first permit executes,
  // and the second is presented with a runtime over the copy.
  const twice = await flow(3), firstPermit = await permitFor(twice), secondPermit = await permitFor(twice);
  const copied = join(m.base, "runtime-copy");
  await cp(m.runtime.layout.root, copied, { recursive: true });
  observed["first_permit_of_claim"] = await attempt(firstPermit);
  replace(twice, "runtime", await runtimeOver(copied, clock));
  observed["second_permit_of_same_claim_runtime_over_copied_root"] = await attempt(secondPermit);
  // (4)-(7) The DAG, the ownership, both together (another coherent claim this caller holds) and the artifacts, replaced after issuance.
  const x = renderDag(g, { now: clock.now(), budget: { attempt: 4, prefix: "gate7_context_other" } }), other = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(other, x.artifacts, m.runtime);
  const { ownership: otherOwnership } = await acquireExecutionClaim(other, { workerId: "worker_other" }, m.runtime);
  const members: [string, number, [keyof RuntimeCall, unknown][]][] = [
    ["dag_replaced_by_another_claimed_dag", 5, [["dag", other]]],
    ["ownership_replaced_by_another_claims_ownership", 6, [["ownership", otherOwnership]]],
    ["dag_and_ownership_replaced_by_another_coherent_claim", 7, [["dag", other], ["ownership", otherOwnership]]],
    ["artifacts_removed", 8, [["artifacts", null]]],
  ];
  for (const [name, n, replacements] of members) {
    const f = await flow(n), permit = await permitFor(f);
    for (const [member, value] of replacements) replace(f, member, value);
    observed[name] = await attempt(permit);
  }
  const starts = { original: (await readdir(join(m.runtime.layout.root, "render-execution-starts"))).length,
    copy: (await readdir(join(copied, "render-execution-starts"))).length };
  await persist("m32-permit-context.json", { observed, starts });
  assert.deepEqual(observed, {
    stale_clock_runtime_over_same_root: "failed:permit_validation:permit_expired:not_started",
    stale_clock_port_in_another_runtime_object: "failed:permit_validation:permit_expired:not_started",
    first_permit_of_claim: "succeeded",
    second_permit_of_same_claim_runtime_over_copied_root: "failed:execution_start:execution_already_started:not_started",
    dag_replaced_by_another_claimed_dag: "succeeded",
    ownership_replaced_by_another_claims_ownership: "succeeded",
    dag_and_ownership_replaced_by_another_coherent_claim: "succeeded",
    artifacts_removed: "succeeded" });
  // Only the legitimate executions consumed their claims, all in the issuing runtime's root; nothing started in the copy.
  assert.deepEqual(starts, { original: 5, copy: 0 });
});

// Owner-review 3, finding 2 (high): QC is timed only by the clock of the runtime it inspects; a caller never supplies its chronology.
test("M33 QC is timed only by the inspected runtime's clock: a separate caller-supplied clock never times a QC receipt", async t => {
  const clock = new ManualRuntimeClock(systemRuntimeClock.now());
  const m = await mediaEnv(t, { a: TWO_SOURCES.a }, clock);
  const f = await prepare(m, renderDag(renderGraph({ sources: [source(m.fixtures.get("a")!)] }), { now: clock.now() }));
  const receipt = succeeded(await executeAuthorizedRender(await permitFor(f)));
  const year = 365 * 86_400_000, runtimeAt = clock.now();
  const observed: Record<string, { checkStartedAt: string; checkCompletedAt: string; timedBy: string; verdict: string }> = {};
  for (const [name, offset] of [["caller_clock_one_year_later", year], ["caller_clock_one_year_earlier", -year]] as const) {
    const callerClock = new ManualRuntimeClock(new Date(Date.parse(runtimeAt) + offset).toISOString());
    // A materially different clock beside the genuine runtime; the cast keeps this call compiling whatever the QC input type admits.
    const report = await runTechnicalMediaQc({ dag: f.v, receipt, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT, clock: callerClock } as Parameters<typeof runTechnicalMediaQc>[0]);
    const by = (at: string) => at === runtimeAt ? "runtime_clock" : at === callerClock.now() ? "caller_clock" : "neither";
    observed[name] = { checkStartedAt: report.checkStartedAt, checkCompletedAt: report.checkCompletedAt, timedBy: `${by(report.checkStartedAt)}/${by(report.checkCompletedAt)}`,
      verdict: report.verdict };
  }
  await persist("m33-qc-clock.json", { runtimeClock: runtimeAt, renderRecordedAt: receipt.recordedAt, observed });
  assert.deepEqual(Object.fromEntries(Object.entries(observed).map(([name, o]) => [name, `${o.timedBy}:${o.verdict}`])),
    { caller_clock_one_year_later: "runtime_clock/runtime_clock:pass", caller_clock_one_year_earlier: "runtime_clock/runtime_clock:pass" });
});

// Owner-review 3, finding 3 (high): an error after the child started proves nothing about its termination. Controlled stand-ins for an
// already-spawned child exercise the exact supervision the render and QC processes use; observations are recorded before any assertion.
test("M34 an error after spawn never confirms termination: render and QC supervision report only what they observed, and only close confirms", async () => {
  const limits = { timeoutMilliseconds: 50, terminationGraceMilliseconds: 200 };
  const failure = (code: string) => Object.assign(new Error(`stand-in ${code}`), { code });
  type StandIn = { child: ReturnType<typeof standInChild>; kills: () => number };
  const scenarios: [string, () => StandIn][] = [
    // Never started: the error comes without a spawn event, then a close, as Node reports a failed spawn.
    ["never_spawned_error", () => { let kills = 0; const child = standInChild(() => { kills += 1; });
      setImmediate(() => { child.emit("error", failure("ENOENT")); child.emit("close", -4058, null); }); return { child, kills: () => kills }; }],
    // Started and silent past the timeout; the termination request fails with an error, and the child closes shortly after.
    ["spawned_timeout_kill_error_then_close", () => { let kills = 0; const child: ReturnType<typeof standInChild> = standInChild(() => {
      kills += 1; child.emit("error", failure("EPERM")); setTimeout(() => child.emit("close", null, "SIGTERM"), 20); });
    setImmediate(() => child.emit("spawn")); return { child, kills: () => kills }; }],
    // The owner's case: started and silent past the timeout; the termination request fails with an error, and no close ever follows.
    ["spawned_timeout_kill_error_no_close", () => { let kills = 0; const child: ReturnType<typeof standInChild> = standInChild(() => {
      kills += 1; child.emit("error", failure("EPERM")); });
    setImmediate(() => child.emit("spawn")); return { child, kills: () => kills }; }],
    // Started; an error arrives while it runs, before any timeout, and no close ever follows.
    ["spawned_error_while_running_no_close", () => { let kills = 0; const child = standInChild(() => { kills += 1; });
      setImmediate(() => { child.emit("spawn"); setTimeout(() => child.emit("error", failure("EPIPE")), 10); }); return { child, kills: () => kills }; }],
  ];
  const within = async <T>(run: Promise<T>): Promise<T | "still_pending"> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([run, new Promise<"still_pending">(resolve => { timer = setTimeout(() => resolve("still_pending"), 2_000); })]); } finally { clearTimeout(timer); }
  };
  const facts = (run: object) => Object.fromEntries(Object.entries(run).filter(([key]) => !["stdout", "stderr", "stdoutOverflow", "stderrTruncated", "overflow",
    "wallClockMilliseconds"].includes(key)));
  const banner = `ffprobe version ${PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion} Copyright (c) 2007-2026 the FFmpeg developers\n`;
  const observed: Record<string, unknown> = {};
  for (const [name, make] of scenarios) {
    const render = make(), renderRun = await within(supervisePinnedProcess(render.child, { ...limits, stdoutLimit: 65_536 }));
    const qcChild = make(), qcRun = await within(superviseQcProcess(qcChild.child, limits));
    observed[name] = {
      renderer: renderRun === "still_pending" ? "still_pending" : { ...facts(renderRun), terminationRequests: render.kills(), failureCode: processFailureCodeOf(renderRun),
        trustedEvidence: completedProbeRun(renderRun) },
      qc: qcRun === "still_pending" ? "still_pending" : { ...facts(qcRun), terminationRequests: qcChild.kills(),
        versionQuery: await outcomeOf(async () => `version_read_${reportedVersionOf({ ...qcRun, stdout: banner }, "ffprobe")}`) },
    };
  }
  await persist("m34-termination-truth.json", observed);
  assert.deepEqual(observed, {
    never_spawned_error: {
      renderer: { spawnError: "ENOENT", exitCode: null, signal: null, timedOut: false, terminationConfirmed: true, errorAfterSpawn: null, terminationRequests: 0,
        failureCode: "spawn_failed", trustedEvidence: false },
      qc: { code: null, spawnError: true, errorAfterSpawn: false, timedOut: false, terminationConfirmed: true, terminationRequests: 0, versionQuery: "qc_tool_unavailable" } },
    spawned_timeout_kill_error_then_close: {
      renderer: { spawnError: null, exitCode: null, signal: "SIGTERM", timedOut: true, terminationConfirmed: true, errorAfterSpawn: "EPERM", terminationRequests: 1,
        failureCode: "process_timeout", trustedEvidence: false },
      qc: { code: null, spawnError: false, errorAfterSpawn: true, timedOut: true, terminationConfirmed: true, terminationRequests: 1, versionQuery: "qc_tool_unavailable" } },
    spawned_timeout_kill_error_no_close: {
      renderer: { spawnError: null, exitCode: null, signal: null, timedOut: true, terminationConfirmed: false, errorAfterSpawn: "EPERM", terminationRequests: 1,
        failureCode: "process_termination_unconfirmed", trustedEvidence: false },
      qc: { code: null, spawnError: false, errorAfterSpawn: true, timedOut: true, terminationConfirmed: false, terminationRequests: 1, versionQuery: "qc_tool_unavailable" } },
    spawned_error_while_running_no_close: {
      renderer: { spawnError: null, exitCode: null, signal: null, timedOut: false, terminationConfirmed: false, errorAfterSpawn: "EPIPE", terminationRequests: 1,
        failureCode: "process_termination_unconfirmed", trustedEvidence: false },
      qc: { code: null, spawnError: false, errorAfterSpawn: true, timedOut: false, terminationConfirmed: false, terminationRequests: 1, versionQuery: "qc_tool_unavailable" } },
  });
});
