// Gate 7 Batch 3E-B2-A1, Parts 5-13: the typed CanonicalizationPlan v1, its identity, the pure planner, CanonicalMediaDerivation 0.2.0
// with its computation and derivation identities, the derived-authorization rule, backward compatibility, and hostile forgeries. Pure:
// typed facts records, label digests and opaque hashes only. No media, process, FFmpeg/ffprobe, model, clock or network. New exports are
// read through the module namespace, so against the pre-B2-A1 bytes every new behaviour fails in its own test, while the compatibility
// pins (C03-C09, D12's v0 literals) hold before and after.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import * as ownerMedia from "../packages/edit-render/owner-media.js";
import { identify } from "../packages/editorial/common.js";
import * as protocol from "../packages/footage-analyzer/protocol.js";
import * as ingest from "../packages/media-ingest/index.js";
import { acceptedHRendererBytes } from "./support/registered-derivative-render-preservation.js";
import { ANALYSIS, CREATOR, DAY0, DAY2, EVALUATION, PROJECT, canonicalChain, classify, derivative, probeOf, registrationV2, reidentified, root,
  rootWithoutConsent, v1 } from "./support/canonical-media.js";
import { FX, HASH_OUT, MATRICES, SAR_UNSPECIFIED, SIZE_OUT, X264_UUID, asset05Audio, audioFrames, audioStream, cfr, clone, composedSource, facts, gap500, jittered,
  movText, ntscIn600, oneTickPairs, ownerN1Like, planChain, remuxedFacts, sei, sha, sixtyThenTen, timecode, videoStream, withVideo, type Json } from "./support/canonical-facts.js";

type Planning = { outcome: string; plan: Json | null; evaluation: Json; factsDigest: string | null };
const planOf = (value: unknown): Planning => ingest.planCanonicalizationV1(value) as unknown as Planning;
const opsOf = (plan: Json | null): string[] => ((plan?.operations ?? []) as Json[]).map(o => String(o.op));
const opOf = (plan: Json, name: string): Json => (plan.operations as Json[]).find(o => o.op === name)!;
const planParses = (value: unknown): boolean => ingest.CanonicalizationPlanSchema.safeParse(value).success;
/** A coordinated plan forgery: mutate the body, then recompute the plan identity exactly as an attacker with the public algorithm could. */
function reidentifiedPlan(plan: Json, mutate: (body: Json) => void): Json {
  const body = clone(plan);
  delete body.planId;
  mutate(body);
  return { ...body, planId: ingest.canonicalizationPlanIdOf(body) };
}
/** The same for a 0.2.0 derivation: both identities recomputed. Only the rule under test can then refuse it. */
function reidentifiedDerivation(derivation: Json, mutate: (d: Json) => void): Json {
  const d = clone(derivation);
  delete d.derivationId;
  mutate(d);
  const source = d.source as Json;
  d.computationId = ingest.canonicalPlanComputationIdOf({ source: { assetId: String(source.assetId), contentHash: String(source.contentHash), sizeBytes: Number(source.sizeBytes) },
    plan: d.plan as never, toolchain: d.toolchain as never });
  return identify(ingest.CANONICAL_PLAN_DERIVATION_IDENTITY, "derivationId", d);
}
const derivationParses = (value: unknown): boolean => ingest.CanonicalMediaPlanDerivationSchema.safeParse(value).success;
const refusesWith = (code: string) => (error: unknown): boolean => error instanceof ingest.MediaIngestError && error.code === code;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const reduced = (n: number, d: number) => ({ numerator: n / gcd(n, d), denominator: d / gcd(n, d) });
const videoTimelineDigest = (den: number, pts: readonly number[]): string => sha(canonicalSerialize({ timeBase: { numerator: 1, denominator: den }, presentationTimestamps: [...pts] }));
const audioTimelineDigest = (den: number, frames: readonly Json[]): string => sha(canonicalSerialize({ timeBase: { numerator: 1, denominator: den }, frames: [...frames] }));
// H permits only the five proved lifecycle requery insertions; the historical renderer golden stays exact.
const fileSha = (path: string): string => createHash("sha256").update(acceptedHRendererBytes(path, readFileSync(path))).digest("hex");
const CANONICAL_ORDER = ["SELECT_AV_STREAMS", "REBASE_TIMELINE_ZERO", "DECLARE_SQUARE_SAMPLE_ASPECT", "SNAP_VIDEO_TIMESTAMPS", "RETIME_AUDIO_CONTIGUOUS"];

// ================================================================ PLAN
test("B2A1-L01 conforming media is DIRECT and has no plan", () => {
  // Owner asset_07 shape: 720x1280, B-frames (edit list compensated), exactly 30000/1001 in 1/30000, explicit 1:1, BT.709, AAC LC 44.1 kHz.
  const asset07 = facts([videoStream({ geometry: { declared: { width: 720, height: 1280 }, decoded: [{ width: 720, height: 1280 }] }, decodeReordering: true,
    timeBase: { numerator: 1, denominator: 30_000 }, declaredFrameRate: { numerator: 30_000, denominator: 1001 }, presentationTimestamps: cfr(90, 1001) }),
  audioStream({ sampleRateHz: 44_100, timeBase: { numerator: 1, denominator: 44_100 }, frames: audioFrames(130) })]);
  for (const value of [facts(), asset07, withVideo({ sideData: [sei(X264_UUID)] })]) {
    const result = planOf(value);
    assert.equal(result.outcome, "DIRECT");
    assert.equal(result.plan, null);
    assert.equal(result.evaluation.outcome, "CONFORMS");
  }
  assert.deepEqual(ingest.CANONICALIZATION_OPERATIONS, CANONICAL_ORDER, "the closed vocabulary, in its one canonical order");
});

test("B2A1-L02 only extra timecode/subtitle streams: one SELECT_AV_STREAMS that keeps the A/V pair", () => {
  const result = planOf(facts([videoStream(), audioStream(), timecode(2), movText(3)]));
  assert.equal(result.outcome, "PLAN");
  assert.deepEqual(opsOf(result.plan), ["SELECT_AV_STREAMS"]);
  assert.deepEqual(opOf(result.plan!, "SELECT_AV_STREAMS"), { op: "SELECT_AV_STREAMS", dropped: [{ index: 2, kind: "timecode", codec: "tmcd" },
    { index: 3, kind: "subtitle", codec: "mov_text" }] });
  assert.deepEqual(result.plan!.streams, { videoIndex: 0, audioIndex: 1 });
  const silent = planOf(facts([videoStream(), timecode(1)]));
  assert.deepEqual([opsOf(silent.plan), silent.plan!.streams], [["SELECT_AV_STREAMS"], { videoIndex: 0, audioIndex: null }]);
});

test("B2A1-L03 an unspecified SAR plans exactly DECLARE_SQUARE_SAMPLE_ASPECT under the accepted square-pixel assumption", () => {
  const result = planOf(ownerN1Like());
  assert.deepEqual(opsOf(result.plan), ["DECLARE_SQUARE_SAMPLE_ASPECT"]);
  assert.deepEqual(opOf(result.plan!, "DECLARE_SQUARE_SAMPLE_ASPECT"), { op: "DECLARE_SQUARE_SAMPLE_ASPECT", sampleAspectRatio: { numerator: 1, denominator: 1 },
    assumption: ingest.N1_ASSUMPTION });
  // Unlike N1, the plan keeps the x264 user-data SEI it preserves (e04 SD01: NORMALIZE_N1 refuses it).
  const withSei = withVideo({ sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED }, sideData: [sei(X264_UUID)] });
  assert.deepEqual(opsOf(planOf(withSei).plan), ["DECLARE_SQUARE_SAMPLE_ASPECT"]);
});

test("B2A1-L04 an exact common non-zero start plans REBASE_TIMELINE_ZERO with exact per-stream offsets (e03 G1, H3)", () => {
  const g1 = planOf(facts([videoStream({ presentationTimestamps: cfr(60, 512, 15_360) }), audioStream({ frames: audioFrames(94, 1024, 48_000) })]));
  assert.deepEqual(opsOf(g1.plan), ["REBASE_TIMELINE_ZERO"]);
  assert.deepEqual(opOf(g1.plan!, "REBASE_TIMELINE_ZERO"), { op: "REBASE_TIMELINE_ZERO", start: { numerator: 1, denominator: 1 }, offsets: [
    { streamIndex: 0, timeBase: { numerator: 1, denominator: 15_360 }, offsetTicks: 15_360 }, { streamIndex: 1, timeBase: { numerator: 1, denominator: 48_000 }, offsetTicks: 48_000 }] });
  const h3 = planOf(withVideo({ decodeReordering: true, presentationTimestamps: cfr(60, 512, 1024) }, null));
  assert.deepEqual(opOf(h3.plan!, "REBASE_TIMELINE_ZERO"), { op: "REBASE_TIMELINE_ZERO", start: { numerator: 1, denominator: 15 }, offsets: [
    { streamIndex: 0, timeBase: { numerator: 1, denominator: 15_360 }, offsetTicks: 1024 }] });
});

test("B2A1-L05 near-CFR within a quarter period plans SNAP_VIDEO_TIMESTAMPS with the exact grid, displacement and source table (e03 C2, B4)", () => {
  const c2 = jittered(60, 3000, 630), worst = Math.max(...c2.map((t, i) => Math.abs(t - 3000 * i)));
  const result = planOf(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, declaredFrameRate: { numerator: 90_000, denominator: 1 }, presentationTimestamps: c2 }));
  assert.deepEqual(opsOf(result.plan), ["SNAP_VIDEO_TIMESTAMPS"]);
  assert.deepEqual(opOf(result.plan!, "SNAP_VIDEO_TIMESTAMPS"), { op: "SNAP_VIDEO_TIMESTAMPS", streamIndex: 0, frameCount: 60,
    sourceTimeBase: { numerator: 1, denominator: 90_000 }, sourcePresentationDigest: videoTimelineDigest(90_000, c2), targetFrameRate: { numerator: 30, denominator: 1 },
    outputTimeBase: { numerator: 1, denominator: 90_000 }, gridPeriodTicks: 3000, maxDisplacementSeconds: reduced(worst, 90_000),
    approvedMaxDisplacementSeconds: { numerator: 1, denominator: 120 } });
  // e03 B4: 30000/1001 in 1/600 snaps in 1/30000 (the least common timescale holding both), never at 30/1 although 30/1 is also within bound.
  const b4 = ntscIn600(60), b4Worst = Math.max(...b4.map((t, i) => Math.abs(50 * t - 1001 * i)));
  const snapped = opOf(planOf(withVideo({ timeBase: { numerator: 1, denominator: 600 }, declaredFrameRate: { numerator: 30_000, denominator: 1001 }, presentationTimestamps: b4 })).plan!,
    "SNAP_VIDEO_TIMESTAMPS");
  assert.deepEqual([snapped.targetFrameRate, snapped.outputTimeBase, snapped.gridPeriodTicks, snapped.maxDisplacementSeconds, snapped.approvedMaxDisplacementSeconds],
    [{ numerator: 30_000, denominator: 1001 }, { numerator: 1, denominator: 30_000 }, 1001, reduced(b4Worst, 30_000), { numerator: 1001, denominator: 120_000 }]);
  assert.deepEqual(ingest.CANONICAL_SNAP_RATES, [[24_000, 1001], [24, 1], [25, 1], [30_000, 1001], [30, 1], [48, 1], [50, 1], [60_000, 1001], [60, 1], [100, 1],
    [120_000, 1001], [120, 1]], "exactly the B2R canonical rate set (instruments/timing.mjs)");
});

test("B2A1-L06 a tiny audio timestamp defect within the proven 9-sample bound plans RETIME_AUDIO_CONTIGUOUS (e07c asset_05, e11)", () => {
  const audio = asset05Audio(), result = planOf(facts([videoStream(), audio]));
  assert.deepEqual(opsOf(result.plan), ["RETIME_AUDIO_CONTIGUOUS"]);
  assert.deepEqual(opOf(result.plan!, "RETIME_AUDIO_CONTIGUOUS"), { op: "RETIME_AUDIO_CONTIGUOUS", streamIndex: 1, sampleRateHz: 44_100, frameCount: 90,
    sampleCount: 90 * 1024, sourceStartTicks: 0, sourceTimingDigest: audioTimelineDigest(44_100, audio.frames as Json[]), maxObservedDisplacementSamples: 9,
    approvedMaxDisplacementSamples: 9 });
  assert.equal(ingest.AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES, 9, "the exact e11 bound");
  const asset02 = planOf(facts([videoStream(), audioStream({ frames: audioFrames(94, 1024, 0, [{ at: 50, delta: 1 }]) })]));
  assert.equal(opOf(asset02.plan!, "RETIME_AUDIO_CONTIGUOUS").maxObservedDisplacementSamples, 1, "e07c asset_02: one +1 sample gap");
});

test("B2A1-L07 independent exact problems compose into ONE plan in the canonical order, never a recipe per combination", () => {
  const near = { timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: jittered(60, 3000, 630) };
  const noSar = { sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED } };
  for (const [value, expected] of [
    [facts([videoStream(noSar), audioStream(), timecode(2)]), ["SELECT_AV_STREAMS", "DECLARE_SQUARE_SAMPLE_ASPECT"]],
    [facts([videoStream({ ...noSar, presentationTimestamps: cfr(60, 512, 15_360) }), audioStream({ frames: audioFrames(94, 1024, 48_000) })]),
      ["REBASE_TIMELINE_ZERO", "DECLARE_SQUARE_SAMPLE_ASPECT"]],
    [facts([videoStream({ ...noSar, ...near }), audioStream()]), ["DECLARE_SQUARE_SAMPLE_ASPECT", "SNAP_VIDEO_TIMESTAMPS"]],
    [facts([videoStream(near), asset05Audio({ sampleRateHz: 48_000, timeBase: { numerator: 1, denominator: 48_000 } })]), ["SNAP_VIDEO_TIMESTAMPS", "RETIME_AUDIO_CONTIGUOUS"]],
    [composedSource(), CANONICAL_ORDER]] as const) {
    const result = planOf(value);
    assert.equal(result.outcome, "PLAN");
    assert.deepEqual(opsOf(result.plan), expected);
    assert.deepEqual([result.plan!.planType, result.plan!.planVersion, result.plan!.executionClass, result.plan!.encodeProfile], ["CanonicalizationPlan", "1.0.0", "remux", null]);
    assert.ok(planParses(result.plan));
  }
  const composed = planOf(composedSource()).plan!;
  assert.deepEqual(opOf(composed, "REBASE_TIMELINE_ZERO").start, { numerator: 1, denominator: 1 });
  assert.deepEqual(opOf(composed, "SNAP_VIDEO_TIMESTAMPS").targetFrameRate, { numerator: 30, denominator: 1 }, "the garbage declared 90000/1 (e03 C2) is not a target");
  assert.equal(opOf(composed, "RETIME_AUDIO_CONTIGUOUS").sourceStartTicks, 48_000);
});

test("B2A1-L08 operations can never be reordered", () => {
  const plan = planOf(composedSource()).plan!;
  for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 4], [0, 4]] as const) {
    const swapped = reidentifiedPlan(plan, body => { const ops = body.operations as Json[]; [ops[i], ops[j]] = [ops[j]!, ops[i]!]; });
    assert.equal(planParses(swapped), false, `${i}<->${j}`);
  }
});

test("B2A1-L09 a duplicated operation refuses", () => {
  const plan = planOf(composedSource()).plan!;
  for (const name of CANONICAL_ORDER) {
    const twice = reidentifiedPlan(plan, body => { const ops = body.operations as Json[]; const at = ops.findIndex(o => o.op === name); ops.splice(at + 1, 0, clone(ops[at]!)); });
    assert.equal(planParses(twice), false, name);
  }
});

test("B2A1-L10 an arbitrary or unknown operation, parameter or command string refuses", () => {
  const plan = planOf(ownerN1Like()).plan!;
  for (const forged of [{ op: "SCALE_VIDEO", width: 1920 }, { op: "BAKE_ORIENTATION", element: "rotate_90_cw" }, { op: "RESAMPLE_FRAME_TIMELINE", map: [] },
    { op: "FFMPEG", argv: ["-vf", "setsar=1"] }, { op: "DECLARE_SQUARE_SAMPLE_ASPECT", sampleAspectRatio: { numerator: 1, denominator: 1 }, assumption: ingest.N1_ASSUMPTION,
      filter: "setsar=1" }, { op: "DECLARE_SQUARE_SAMPLE_ASPECT", sampleAspectRatio: { numerator: 4, denominator: 3 }, assumption: ingest.N1_ASSUMPTION }]) {
    assert.equal(planParses(reidentifiedPlan(plan, body => { body.operations = [forged]; })), false, canonicalSerialize(forged).slice(0, 60));
  }
  for (const patch of [{ executionClass: "reencode" }, { encodeProfile: { codec: "libx264" } }, { argv: ["-c", "copy"] }, { operations: [] }]) {
    assert.equal(planParses(reidentifiedPlan(plan, body => Object.assign(body, patch))), false, canonicalSerialize(patch));
  }
});

test("B2A1-L11 a caller can never request an unnecessary operation: the planner derives every plan from the facts", () => {
  assert.equal(ingest.planCanonicalizationV1.length, 1, "the planner takes only the facts");
  const request = { operations: [{ op: "DECLARE_SQUARE_SAMPLE_ASPECT" }] };
  assert.equal((ingest.planCanonicalizationV1 as (a: unknown, b: unknown) => Planning)(facts(), request).outcome, "DIRECT", "a request is ignored");
  const source = ownerN1Like(), plan = planOf(source).plan!;
  const inserted = reidentifiedPlan(plan, body => { (body.operations as Json[]).unshift({ op: "SELECT_AV_STREAMS", dropped: [{ index: 2, kind: "timecode", codec: "tmcd" }] }); });
  assert.equal(ingest.revalidateCanonicalizationPlan(inserted, source), false);
  assert.throws(() => planChain(source, { plan: inserted }), refusesWith("derivation_invalid"));
  assert.equal(ingest.revalidateCanonicalizationPlan(plan, source), true);
  // Structurally empty operations are never valid, whatever the facts.
  const noop = reidentifiedPlan(planOf(facts([videoStream(), audioStream(), timecode(2)])).plan!, body => { (body.operations as Json[])[0] = { op: "SELECT_AV_STREAMS", dropped: [] }; });
  assert.equal(planParses(noop), false);
});

test("B2A1-L12 a caller can never omit a required operation", () => {
  const source = composedSource(), plan = planOf(source).plan!;
  for (const name of CANONICAL_ORDER) {
    const omitted = reidentifiedPlan(plan, body => { body.operations = (body.operations as Json[]).filter(o => o.op !== name); });
    assert.equal(ingest.revalidateCanonicalizationPlan(omitted, source), false, name);
    assert.throws(() => planChain(source, { plan: omitted }), refusesWith("derivation_invalid"), name);
  }
});

test("B2A1-L13 a start that is not one exact common instant refuses: no rebase, no plan", () => {
  // 1024/15360 s (1/15 s) against 3199/48000 s: the nearest audio sample, not the same instant.
  const mismatch = planOf(facts([videoStream({ presentationTimestamps: cfr(60, 512, 1024) }), audioStream({ frames: audioFrames(94, 1024, 3199) })]));
  assert.deepEqual([mismatch.outcome, mismatch.plan, (mismatch.evaluation.findings as Json[]).map(f => f.code)], ["REFUSE", null, ["audio_av_start_mismatch"]]);
  const negative = planOf(facts([videoStream({ presentationTimestamps: cfr(60, 512, -512) }), audioStream({ frames: audioFrames(94, 1024, -1600) })]));
  assert.deepEqual([negative.outcome, (negative.evaluation.findings as Json[]).map(f => f.code)], ["REFUSE", ["timeline_start_negative"]]);
});

test("B2A1-L14 a displacement beyond a quarter period is never snapped; exactly a quarter period is", () => {
  const at = (delta: number) => { const pts = cfr(60, 3000); pts[59] = pts[59]! + delta; return withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: pts }); };
  const edge = planOf(at(-750));
  assert.deepEqual(opOf(edge.plan!, "SNAP_VIDEO_TIMESTAMPS").maxDisplacementSeconds, { numerator: 1, denominator: 120 }, "P/4 is inside the bound");
  const beyond = planOf(at(-751));
  assert.deepEqual([beyond.outcome, beyond.plan, (beyond.evaluation.findings as Json[]).map(f => f.code)], ["DEFER", null, ["true_vfr"]]);
  assert.deepEqual([planOf(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: jittered(60, 3000, 1080) })).outcome], ["DEFER"]);
});

test("B2A1-L15 a timeline that would need a dropped, duplicated or inserted frame is never snapped", () => {
  for (const pts of [gap500(), sixtyThenTen()]) {
    const result = planOf(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: pts }));
    assert.deepEqual([result.outcome, result.plan], ["DEFER", null]);
  }
  const pairs = planOf(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: oneTickPairs() }));
  assert.deepEqual([pairs.outcome, pairs.plan], ["REFUSE", null]);
});

test("B2A1-L16 an audio displacement above the proven 9-sample bound refuses", () => {
  for (const steps of [[{ at: 3, delta: -7 }, { at: 26, delta: -3 }], [{ at: 10, delta: 10 }], [{ at: 3, delta: -9 }, { at: 40, delta: 19 }]]) {
    const result = planOf(facts([videoStream(), audioStream({ frames: audioFrames(94, 1024, 0, steps) })]));
    assert.deepEqual([result.outcome, result.plan, (result.evaluation.findings as Json[]).map(f => f.code)], ["REFUSE", null, ["audio_timestamp_discontinuity_unsupported"]],
      canonicalSerialize(steps));
  }
  const nine = planOf(facts([videoStream(), audioStream({ frames: audioFrames(94, 1024, 0, [{ at: 10, delta: 9 }]) })]));
  assert.equal(opOf(nine.plan!, "RETIME_AUDIO_CONTIGUOUS").maxObservedDisplacementSamples, 9);
});

test("B2A1-L17 an A/V start mismatch that would need padding or trimming refuses (e06 A09, A10, A11)", () => {
  for (const value of [facts([videoStream(), audioStream({ frames: audioFrames(72, 1024, 22_976) })]),
    facts([videoStream({ presentationTimestamps: cfr(60, 512, 7680) }), audioStream()]),
    facts([videoStream(), audioStream({ codec: "pcm_s16le", frames: audioFrames(70, 1024, 24_000) })])]) {
    const result = planOf(value);
    assert.deepEqual([result.outcome, result.plan], ["REFUSE", null]);
    assert.ok((result.evaluation.findings as Json[]).some(f => f.code === "audio_av_start_mismatch"));
  }
});

test("B2A1-L18 several video or audio streams are never silently selected (e04 L03)", () => {
  const audio2 = facts([videoStream(), audioStream(), audioStream({ index: 2 })]);
  const video2 = facts([videoStream(), audioStream(), videoStream({ index: 2 })]);
  for (const [value, code] of [[audio2, "multiple_audio_streams"], [video2, "multiple_video_streams"]] as const) {
    const result = planOf(value);
    assert.deepEqual([result.outcome, result.plan], ["REFUSE", null]);
    assert.ok((result.evaluation.findings as Json[]).some(f => f.code === code), code);
  }
  assert.ok((planOf(facts([audioStream({ index: 0 })])).evaluation.findings as Json[]).some(f => f.code === "video_stream_absent"));
});

test("B2A1-L19 dropping safe non-A/V streams can never mean dropping a content A/V stream", () => {
  const plan = planOf(facts([videoStream(), audioStream(), timecode(2)])).plan!;
  for (const dropped of [[{ index: 1, kind: "audio", codec: "aac" }], [{ index: 1, kind: "timecode", codec: "tmcd" }], [{ index: 0, kind: "subtitle", codec: "mov_text" }],
    [{ index: 2, kind: "data", codec: "gpmd" }], [{ index: 2, kind: "subtitle", codec: "dvb_subtitle" }], [{ index: 2, kind: "timecode", codec: "tmcd" }, { index: 2, kind: "timecode", codec: "tmcd" }]]) {
    assert.equal(planParses(reidentifiedPlan(plan, body => { (body.operations as Json[])[0] = { op: "SELECT_AV_STREAMS", dropped }; })), false, canonicalSerialize(dropped));
  }
  for (const extra of [{ kind: "data", index: 2 }, { kind: "attachment", index: 2 }, { kind: "subtitle", index: 2, codec: "other" }]) {
    const result = planOf(facts([videoStream(), audioStream(), extra]));
    assert.deepEqual([result.outcome, (result.evaluation.findings as Json[]).map(f => f.code)], ["REFUSE", ["unsupported_stream"]], canonicalSerialize(extra));
  }
});

test("B2A1-L20 the plan identity carries no path, location, clock, scope or attempt", () => {
  const first = planOf(composedSource()).plan!, second = planOf(clone(composedSource())).plan!;
  assert.equal(first.planId, second.planId);
  assert.match(String(first.planId), /^canonicalization_plan_v1_[a-f0-9]{64}$/);
  const text = canonicalSerialize(first);
  assert.doesNotMatch(text, /[\\/]|\d{4}-\d{2}-\d{2}T\d{2}/, "no path separator or instant");
  const keys = new Set<string>();
  const walk = (value: unknown): void => { if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child); } };
  walk(first);
  for (const key of ["path", "location", "directory", "file", "creatorId", "projectId", "scope", "user", "host", "attempt", "createdAt", "startedAt", "nonce",
    "contentHash", "assetId", "sizeBytes"]) assert.equal(keys.has(key), false, key);
});

test("B2A1-L21 the plan identity changes with any operation, parameter, target profile or plan semantics", () => {
  const plan = planOf(composedSource()).plan!, body = clone(plan);
  delete body.planId;
  assert.equal(ingest.canonicalizationPlanIdOf(body), plan.planId);
  const variants: [string, (b: Json) => void][] = [
    ["an operation removed", b => { b.operations = (b.operations as Json[]).slice(1); }],
    ["a snap parameter", b => { opOf(b, "SNAP_VIDEO_TIMESTAMPS").gridPeriodTicks = 3001; }],
    ["a rebase offset", b => { ((opOf(b, "REBASE_TIMELINE_ZERO").offsets as Json[])[0]!).offsetTicks = 90_001; }],
    ["a retime count", b => { opOf(b, "RETIME_AUDIO_CONTIGUOUS").frameCount = 95; }],
    ["a dropped stream", b => { opOf(b, "SELECT_AV_STREAMS").dropped = [{ index: 2, kind: "timecode", codec: "tmcd" }]; }],
    ["the target profile", b => { b.targetProfile = { ...(b.targetProfile as Json), profileId: `canonical_media_profile_v1_${"0".repeat(64)}` }; }],
    ["the plan semantics", b => { b.semantics = { ...(b.semantics as Json), semanticsDigest: "0".repeat(64) }; }],
    ["the stream layout", b => { b.streams = { videoIndex: 1, audioIndex: 0 }; }]];
  for (const [label, mutate] of variants) {
    const changed = clone(body);
    mutate(changed);
    assert.notEqual(ingest.canonicalizationPlanIdOf(changed), plan.planId, label);
  }
});

test("B2A1-L22 one semantic plan applied to different source bytes keeps one planId; the computation identity separates the bytes", () => {
  const a = ownerN1Like();
  const b = facts([videoStream({ geometry: { declared: { width: 1080, height: 1920 }, decoded: [{ width: 1080, height: 1920 }] },
    sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED }, declaredFrameRate: { numerator: 60, denominator: 1 },
    timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: cfr(240, 1500) }), audioStream({ frames: audioFrames(200) })]);
  const planA = planOf(a).plan!, planB = planOf(b).plan!;
  assert.notEqual(canonicalSerialize(a), canonicalSerialize(b));
  assert.equal(planA.planId, planB.planId, "the same DECLARE-only plan");
  const source = (hash: string) => ({ assetId: `asset_${hash}`, contentHash: hash, sizeBytes: 1000 });
  const computeA = ingest.canonicalPlanComputationIdOf({ source: source(sha("bytes-a")), plan: planA as never, toolchain: ingest.CANONICAL_PLAN_TOOLCHAIN as never });
  const computeB = ingest.canonicalPlanComputationIdOf({ source: source(sha("bytes-b")), plan: planB as never, toolchain: ingest.CANONICAL_PLAN_TOOLCHAIN as never });
  assert.notEqual(computeA, computeB);
});

// ================================================================ DERIVATION
test("B2A1-D01 the accepted N1 0.1.0 derivation still builds and validates byte-identically", () => {
  const chain = canonicalChain();
  assert.equal(chain.derivation.computationId, "canonical_media_computation_v0_18bc33167706caaa7a3e6cec7fe8458d1978ff0ad8cede76fef83b6564ddf1ad", "baseline 01a58d8");
  assert.equal(chain.derivation.derivationId, "canonical_media_derivation_v0_930fb1d3aae50fd455cac483b019493c85a75ae3d233a917fb65ff325276d383", "baseline 01a58d8");
  assert.equal(sha(canonicalSerialize(chain.derivation)), "c6a886e55430336bcf847fe8b14ed9750fbbaa224742627997b2e5f18613923d");
  assert.equal(canonicalSerialize(ingest.CanonicalMediaDerivationSchema.parse(chain.derivation)), canonicalSerialize(chain.derivation));
  assert.equal(canonicalSerialize(ingest.AnyCanonicalMediaDerivationSchema.parse(chain.derivation)), canonicalSerialize(chain.derivation));
  assert.equal(ingest.CanonicalMediaDerivationSchema.safeParse(planChain(ownerN1Like()).derivation).success, false, "0.1.0 never reads a 0.2.0 record");
});

test("B2A1-D02 a plan-based 0.2.0 derivation builds deterministically and validates", () => {
  for (const source of [ownerN1Like(), composedSource(), facts([videoStream(), audioStream(), timecode(2)]), facts([videoStream(), asset05Audio()]),
    withVideo({ timeBase: { numerator: 1, denominator: 600 }, declaredFrameRate: { numerator: 30_000, denominator: 1001 }, presentationTimestamps: ntscIn600(60) }, null),
    facts([videoStream({ presentationTimestamps: cfr(60, 512, 15_360) }), audioStream({ frames: audioFrames(94, 1024, 48_000) })])]) {
    const first = planChain(source), second = planChain(clone(source)), d = first.derivation;
    assert.equal(canonicalSerialize(d), canonicalSerialize(second.derivation), "deterministic");
    assert.equal(canonicalSerialize(ingest.CanonicalMediaPlanDerivationSchema.parse(d)), canonicalSerialize(d), "already canonical");
    assert.ok(ingest.AnyCanonicalMediaDerivationSchema.safeParse(d).success);
    assert.deepEqual([d.artifactType, d.artifactVersion, d.stability], ["CanonicalMediaDerivation", "0.2.0", "internal_pre_stable"]);
    assert.match(String(d.computationId), /^canonical_media_computation_v1_[a-f0-9]{64}$/);
    assert.match(String(d.derivationId), /^canonical_media_derivation_v1_[a-f0-9]{64}$/);
    assert.deepEqual(d.plan, first.planning.plan);
    assert.deepEqual(d.toolchain, ingest.CANONICAL_PLAN_TOOLCHAIN);
    assert.deepEqual((d.plan as Json).targetProfile, { profileId: ingest.CANONICAL_MEDIA_PROFILE_V1.profileId, profileVersion: "1.0.0" });
    assert.equal(((d.source as Json).evaluation as Json).outcome, "CANONICALIZABLE_EXACT_REMUX");
    assert.equal((((d.output as Json).verification as Json).output as Json).outcome, "CONFORMS");
    assert.deepEqual(d.scope, { creatorId: CREATOR, projectId: PROJECT });
  }
});

test("B2A1-D03 the 0.2.0 computation identity changes with the source bytes", () => {
  const { derivation } = planChain(ownerN1Like()), s = derivation.source as Json;
  const inputs = { source: { assetId: String(s.assetId), contentHash: String(s.contentHash), sizeBytes: Number(s.sizeBytes) }, plan: derivation.plan as never,
    toolchain: ingest.CANONICAL_PLAN_TOOLCHAIN as never };
  assert.equal(ingest.canonicalPlanComputationIdOf(inputs), derivation.computationId);
  for (const source of [{ ...inputs.source, contentHash: sha("other"), assetId: `asset_${sha("other")}` }, { ...inputs.source, sizeBytes: inputs.source.sizeBytes + 1 }]) {
    assert.notEqual(ingest.canonicalPlanComputationIdOf({ ...inputs, source }), derivation.computationId);
  }
});

test("B2A1-D04 the 0.2.0 computation identity changes with the plan", () => {
  const a = planChain(ownerN1Like()).derivation, b = planChain(facts([videoStream({ sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED } }),
    audioStream(), timecode(2)])).derivation;
  assert.equal((a.source as Json).contentHash, (b.source as Json).contentHash, "the same root bytes");
  assert.notEqual(a.computationId, b.computationId);
});

test("B2A1-D05 the 0.2.0 computation identity changes with the pinned toolchain", () => {
  const { derivation } = planChain(ownerN1Like()), s = derivation.source as Json, t = ingest.CANONICAL_PLAN_TOOLCHAIN as unknown as Json;
  const id = (toolchain: Json) => ingest.canonicalPlanComputationIdOf({ source: { assetId: String(s.assetId), contentHash: String(s.contentHash), sizeBytes: Number(s.sizeBytes) },
    plan: derivation.plan as never, toolchain: toolchain as never });
  assert.equal(id(t), derivation.computationId);
  for (const changed of [{ ...t, ffmpeg: { ...(t.ffmpeg as Json), sha256: sha("other ffmpeg") } }, { ...t, canonicalizer: { ...(t.canonicalizer as Json), implementationDigest: sha("x") } },
    { ...t, ffprobe: { ...(t.ffprobe as Json), reportedVersion: "9.0.2" } }, ingest.CANONICAL_TOOLCHAIN as unknown as Json]) {
    assert.notEqual(id(changed), derivation.computationId);
  }
  assert.notDeepEqual(ingest.CANONICAL_PLAN_TOOLCHAIN.canonicalizer, ingest.CANONICAL_TOOLCHAIN.canonicalizer, "the plan path is its own canonicalizer");
  assert.deepEqual([ingest.CANONICAL_PLAN_TOOLCHAIN.ffmpeg, ingest.CANONICAL_PLAN_TOOLCHAIN.ffprobe, ingest.CANONICAL_PLAN_TOOLCHAIN.runtime,
    ingest.CANONICAL_PLAN_TOOLCHAIN.environment], [ingest.CANONICAL_TOOLCHAIN.ffmpeg, ingest.CANONICAL_TOOLCHAIN.ffprobe, ingest.CANONICAL_TOOLCHAIN.runtime,
    ingest.CANONICAL_TOOLCHAIN.environment], "on the same pinned runtime");
});

test("B2A1-D06 the 0.2.0 computation identity ignores path, scope and time; the record names no location", () => {
  const base = planChain(ownerN1Like()).derivation;
  for (const rootAuthorization of [root({ creatorId: "creator_other", projectId: "project_other" }), root({ dateAdded: DAY0, authorizationBasis: "permission_granted" }),
    root({ allowedPurposes: [ANALYSIS] })]) {
    const other = planChain(ownerN1Like(), { rootAuthorization }).derivation;
    assert.equal(other.computationId, base.computationId);
    assert.notEqual(other.derivationId, base.derivationId);
  }
  const text = canonicalSerialize(base);
  assert.doesNotMatch(text, /[\\/]/);
  assert.deepEqual(text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g), ["2026-10-01T00:00:00.000Z"], "only the root's own dateAdded");
});

test("B2A1-D07 the 0.2.0 derivation identity changes with the output evidence", () => {
  const base = planChain(ownerN1Like()).derivation;
  for (const o of [{ outputHash: sha("other-output") }, { outputSize: SIZE_OUT + 1 },
    { decoded: { sourceDigest: sha("frames-2"), outputDigest: sha("frames-2") } }, { audioPackets: { sourceDigest: sha("audio-2"), outputDigest: sha("audio-2") } }]) {
    const other = planChain(ownerN1Like(), o).derivation;
    assert.equal(other.computationId, base.computationId);
    assert.notEqual(other.derivationId, base.derivationId, canonicalSerialize(o));
  }
});

test("B2A1-D08 the 0.2.0 verification binds the exact temporal mapping", () => {
  for (const source of [composedSource(), facts([videoStream({ presentationTimestamps: cfr(60, 512, 15_360) }), audioStream({ frames: audioFrames(94, 1024, 48_000) })])]) {
    const plan = planOf(source).plan!, good = remuxedFacts(source, plan);
    for (const [label, mutate] of [["one video frame one tick late", (f: Json) => { const pts = (f.streams as Json[])[0]!.presentationTimestamps as number[]; pts[7] = pts[7]! + 1; }],
      ["one audio frame one sample late", (f: Json) => { const a = (f.streams as Json[])[1]!; ((a.frames as Json[])[9]!).pts = Number(((a.frames as Json[])[9]!).pts) + 1; }],
      ["one audio frame's samples changed", (f: Json) => { const a = (f.streams as Json[])[1]!; ((a.frames as Json[])[5]!).samples = 1023; }]] as const) {
      const output = clone(good);
      mutate(output);
      assert.throws(() => planChain(source, { output }), (error: unknown) => error instanceof ingest.MediaIngestError, label);
    }
  }
  const { derivation } = planChain(composedSource()), verification = () => ((derivation.output as Json).verification as Json);
  assert.deepEqual([(verification().video as Json).timing, ((verification().audio as Json).timing as Json).mapping],
    [{ mapping: "rebase_then_snap", sourceDigest: opOf(derivation.plan as Json, "SNAP_VIDEO_TIMESTAMPS").sourcePresentationDigest,
      outputDigest: videoTimelineDigest(90_000, cfr(60, 3000)) }, "rebase_then_retime"]);
  for (const mutate of [(d: Json) => { (((d.output as Json).verification as Json).video as Json).timing = { ...((((d.output as Json).verification as Json).video as Json).timing as Json), mapping: "snap" }; },
    (d: Json) => { (((d.output as Json).verification as Json).video as Json).timing = { ...((((d.output as Json).verification as Json).video as Json).timing as Json), outputDigest: sha("x") }; },
    (d: Json) => { const a = ((d.output as Json).verification as Json).audio as Json; a.timing = { ...(a.timing as Json), mapping: "rebase" }; }]) {
    assert.equal(derivationParses(reidentifiedDerivation(derivation, mutate)), false);
  }
});

test("B2A1-D09 the 0.2.0 verification binds the dropped-stream declaration", () => {
  const source = composedSource(), { derivation } = planChain(source);
  assert.deepEqual(((derivation.output as Json).verification as Json).droppedStreams, [{ index: 2, kind: "timecode", codec: "tmcd" }, { index: 3, kind: "subtitle", codec: "mov_text" }]);
  for (const dropped of [[{ index: 2, kind: "timecode", codec: "tmcd" }], [], [{ index: 3, kind: "subtitle", codec: "mov_text" }, { index: 2, kind: "timecode", codec: "tmcd" }]]) {
    assert.equal(derivationParses(reidentifiedDerivation(derivation, d => { ((d.output as Json).verification as Json).droppedStreams = dropped; })), false, canonicalSerialize(dropped));
  }
  const kept = remuxedFacts(source, planOf(source).plan!);
  (kept.streams as Json[]).push(movText(2));
  assert.throws(() => planChain(source, { output: kept }), refusesWith("classification_invalid"), "an output that still carries the subtitle is not canonical");
});

test("B2A1-D10 the 0.2.0 output must satisfy the target profile, and change nothing but what the plan says", () => {
  const source = ownerN1Like(), good = remuxedFacts(source, planOf(source).plan!);
  const variants: [string, (v: Json) => void, string][] = [
    ["SAR still unspecified", v => { v.sampleAspectRatio = { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED }; }, "classification_invalid"],
    ["colour range lost", v => { v.color = { ...(v.color as Json), range: null }; }, "classification_invalid"],
    ["geometry changed", v => { v.geometry = { declared: { width: 1920, height: 1080 }, decoded: [{ width: 1920, height: 1080 }] }; }, "derivation_invalid"],
    ["an informational SEI appeared", v => { v.sideData = [sei(X264_UUID)]; }, "derivation_invalid"],
    ["the frame count changed", v => { v.presentationTimestamps = (v.presentationTimestamps as number[]).slice(0, -1); }, "derivation_invalid"]];
  for (const [label, mutate, code] of variants) {
    const output = clone(good);
    mutate((output.streams as Json[])[0]!);
    assert.throws(() => planChain(source, { output }), refusesWith(code), label);
  }
  for (const [label, o] of [["decoded frames differ", { decoded: { sourceDigest: sha("a"), outputDigest: sha("b") } }],
    ["audio payload differs", { audioPackets: { sourceDigest: sha("a"), outputDigest: sha("b") } }], ["audio claimed absent", { audioPackets: null }],
    ["the root's own bytes", { outputHash: String((root() as Json).contentHash) }]] as const) {
    assert.throws(() => planChain(source, o as never), (error: unknown) => error instanceof ingest.MediaIngestError, label);
  }
  const bitstream = composedSource();
  assert.throws(() => planChain(bitstream, { videoPackets: { sourceDigest: sha("v"), outputDigest: sha("v") } }), refusesWith("derivation_invalid"),
    "DECLARE rewrites parameter sets: no packet-identity claim");
  const selectOnly = facts([videoStream(), audioStream(), timecode(2)]);
  assert.throws(() => planChain(selectOnly, { videoPackets: null }), refusesWith("derivation_invalid"), "without DECLARE the video packets are identical");
  assert.throws(() => planChain(selectOnly, { videoPackets: { sourceDigest: sha("v"), outputDigest: sha("w") } }), refusesWith("derivation_invalid"));
});

test("B2A1-D11 the derived authorization of a 0.2.0 derivation names the planId as its recipeId and inherits exactly", () => {
  const { derivation } = planChain(composedSource());
  const authorization = ingest.buildCanonicalPlanDerivedAuthorization({ derivation, dateAdded: DAY2 }) as unknown as Json;
  assert.ok(protocol.FootageAuthorizationSchema.safeParse(authorization).success);
  assert.deepEqual(authorization, { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", contentHash: HASH_OUT, sizeBytes: SIZE_OUT, sourceType: "system_canonicalized",
    authorizationBasis: "owner_created", allowedPurposes: [ANALYSIS, EVALUATION], dateAdded: DAY2, creatorId: CREATOR, projectId: PROJECT,
    derivedFrom: { rootAuthorization: root(), derivationId: derivation.derivationId, recipeId: (derivation.plan as Json).planId } });
  assert.deepEqual((ingest.buildCanonicalPlanDerivedAuthorization({ derivation, dateAdded: DAY2, allowedPurposes: [EVALUATION] }) as unknown as Json).allowedPurposes, [EVALUATION]);
  for (const patch of [{ dateAdded: DAY0 }, { allowedPurposes: ["local_media_canonicalization"] }, { derivation: { ...derivation, derivationId: "forged" } },
    { derivation: canonicalChain().derivation }]) {
    assert.throws(() => ingest.buildCanonicalPlanDerivedAuthorization({ derivation, dateAdded: DAY2, ...patch } as never),
      (error: unknown) => error instanceof ingest.MediaIngestError, canonicalSerialize(patch).slice(0, 60));
  }
  for (const rootAuthorization of [rootWithoutConsent(), v1()]) {
    assert.throws(() => planChain(composedSource(), { rootAuthorization }), refusesWith("derivation_invalid"), "only a consenting 1.1.0 root");
  }
});

test("B2A1-D12 the v0 identity domains and every N1 identity stay exactly as accepted; the v1 domains are distinct", () => {
  assert.equal(ingest.CANONICAL_COMPUTATION_IDENTITY, "canonical_media_computation_v0");
  assert.equal(ingest.CANONICAL_DERIVATION_IDENTITY, "canonical_media_derivation_v0");
  assert.equal(ingest.CANONICAL_PLAN_COMPUTATION_IDENTITY, "canonical_media_computation_v1");
  assert.equal(ingest.CANONICAL_PLAN_DERIVATION_IDENTITY, "canonical_media_derivation_v1");
  assert.equal(ingest.CANONICAL_PLAN_DERIVATION_VERSION, "0.2.0");
  const pins = { N1_SEMANTICS: "21aa304a15e6a79bd7a75e31c78839817e50aab52ed773749a45431774ee0809", N1_ARGV_TEMPLATE: "36626b4de733a29a7f1341095881c4c0abccb6f838dcded665f7a5ecaeafc091",
    N1_RECIPE: "032cef65abda299de58b552e61ee517d7a5466a9069aef61e87ff9a389f2667d", CANONICALIZER_DESCRIPTOR: "9e175dfc0c39e45336d0b2754094ddd2a40900b0ca2f34d11a4dc0995dadfa3f",
    CANONICAL_TOOLCHAIN: "cc438b522ffb82fa4490caf4a8c2750a869619b2a6b6c78f9f2a3c965848443d" };
  assert.deepEqual({ N1_SEMANTICS: sha(canonicalSerialize(ingest.N1_SEMANTICS)), N1_ARGV_TEMPLATE: sha(JSON.stringify(ingest.N1_ARGV_TEMPLATE)),
    N1_RECIPE: sha(canonicalSerialize(ingest.N1_RECIPE)), CANONICALIZER_DESCRIPTOR: sha(canonicalSerialize(ingest.CANONICALIZER_DESCRIPTOR)),
    CANONICAL_TOOLCHAIN: sha(canonicalSerialize(ingest.CANONICAL_TOOLCHAIN)) }, pins, "baseline 01a58d8 fingerprints");
  assert.deepEqual(ingest.CANONICAL_RECIPES, [ingest.N1_RECIPE], "N1 stays the one recipe; plans are not recipes");
});

// ================================================================ COMPATIBILITY
test("B2A1-C01 the accepted B1 classifier is unchanged and remains the legacy N1 classifier", () => {
  const pins = { n1: "b561768ad23c50fbf23996a284785f85630a450110b1bb56b80989c2c178c09a", direct: "1dcd3e37f3549c0c24a0d7865930b6f57d645513445fefb515a906b3bc9c6464",
    refused: "cbc7b00f5e28fc5d7d97e751c19342f0a9b89c353071a63fe7cd3236b0aa188d" };
  assert.deepEqual({ n1: sha(canonicalSerialize(classify(probeOf({ sar: null })))), direct: sha(canonicalSerialize(classify(probeOf({ sar: "1:1" })))),
    refused: sha(canonicalSerialize(classify(probeOf({ sar: "4:3" })))) }, pins, "baseline 01a58d8 classifications");
  // The same x264-SEI shape: B1 refuses it for N1; the profile planner may plan it. Neither changes the other.
  assert.equal(classify(probeOf({ sar: null, frameSideData: [{ side_data_type: "H.26[45] User Data Unregistered SEI message" }] })).reasonCode, "frame_side_data_present");
});

test("B2A1-C02 original 0.1.0 registration remains compatible beside A2's authorized 0.2.0 registration", () => {
  const accepted = registrationV2();
  assert.ok(ownerMedia.OwnerMediaCanonicalRegistrationSchema.safeParse(accepted).success);
  const planBased = planChain(ownerN1Like());
  const authorization = ingest.buildCanonicalPlanDerivedAuthorization({ derivation: planBased.derivation, dateAdded: DAY2 }) as unknown as Json;
  const registration = registrationV2({ derivatives: [derivative("clip_a_canonical", "clip_a", { authorization, derivation: planBased.derivation })] });
  assert.equal(ownerMedia.OwnerMediaCanonicalRegistrationSchema.safeParse(registration).success, true, "B2-A2 now wires the accepted plan derivation");
});

const PINNED_FILES: [string, string][] = [
  ["packages/footage-analyzer/protocol.ts", "c16bee57b8b671e233b9afb149bb85415769f6ae8d1d410df45c7c468f7baf7d"],
  ["schemas/interchange/AuthorizedFootage.schema.json", "7d234ec046f823891e9f1bddc55e99070ce37999138012f9e061cc5b390c6933"],
  ["schemas/interchange/FootageAnalysis.schema.json", "90039407505bc1a5b98caf3d17f4f6a1ad30696f7eb68982716d065553526ab7"],
  ["packages/reference-analyzer/protocol.ts", "6e44865f5e7c7a2e7f6055cbfc18a885c4898d30091d909712458e8d19904649"],
  ["packages/contracts/common.ts", "d97f0b05ac818cc7d721c96446c7b830a6a294145b486287edc2fd8e9e09a172"],
  ["packages/edit-render/probe.ts", "db2c965fa5161ef406245a764ee07ab0c8c02cb381f7e6b230390f72e9d6cc04"],
  ["packages/edit-render/semantics.ts", "f1c32dc1f5b53367e6f28eca17db673ed6fcef2ee639147e8198a3fa5b9c8ca1"],
  ["packages/edit-render/authorize.ts", "c57accc5ff585ab85f833942b2a017c05ba0c903b24877d4e017905390da37ca"],
  ["packages/edit-render/records.ts", "f3b717e49bf83645573d0d96334212ea613d48c9634e9eaff93532c8bf8eac2f"],
  ["packages/edit-render/common.ts", "b449777d5bf9800ae109e8f2a3185128691d724e5eeefa1747b31316f097e549"],
  ["packages/media-ingest/canonical.ts", "f7b2cae9410625c426bd579ae43d93228eb0adbd053459221ba14320d8cc0332"],
  ["scripts/edit-render-local.ts", "57e4d4159520acdb9e9955a565303f42bf6fa38f1eea631b8b0eeb2a61e42b7b"],
  // A2: the only audit delta registers its hostile-child test harness; production capabilities remain identical.
  ["scripts/audit-workspace.mjs", "d2d48aefacca80874310814f412657f22f3605a277b1db64a09c85a2b7ff3a74"],
  ["package.json", "4789fe849b56e800b402bbbe2a6a67871e7ee398fecd4132f11248cad1269084"],
  ["package-lock.json", "96a41979781463cb304934b47bb0de6685af01c953eef0618467a0e590059691"],
];
const pinned = (path: string): void => { assert.equal(fileSha(path), PINNED_FILES.find(([p]) => p === path)![1], `${path} is byte-identical to baseline 01a58d8`); };

test("B2A1-C03 the FootageAuthorization schemas are unchanged", () => {
  for (const path of ["packages/footage-analyzer/protocol.ts", "schemas/interchange/AuthorizedFootage.schema.json", "schemas/interchange/FootageAnalysis.schema.json"]) pinned(path);
});
test("B2A1-C04 AuthorizedReference is unchanged", () => { pinned("packages/reference-analyzer/protocol.ts"); });
test("B2A1-C05 MediaAsset is unchanged", () => { pinned("packages/contracts/common.ts"); });
test("B2A1-C06 the renderer probe is unchanged", () => { pinned("packages/edit-render/probe.ts"); });
test("B2A1-C07 renderer admission, the permit, the 60 s evidence policy and the binding literals are unchanged", () => {
  for (const path of ["packages/edit-render/semantics.ts", "packages/edit-render/authorize.ts", "packages/edit-render/records.ts", "packages/edit-render/common.ts"]) pinned(path);
  assert.match(readFileSync("packages/edit-render/records.ts", "utf8"), /^const Age = z\.number\(\)\.int\(\)\.min\(1\)\.max\(60_000\);$/m);
  assert.equal(ownerMedia.OWNER_MEDIA_LIFECYCLE_AUTHORITY, "owner_local_media_manifest_registry_not_production_v0");
  assert.equal(ownerMedia.OWNER_RENDER_AUTHORIZATION_STATEMENT, "owner_authorizes_local_render_of_exactly_the_declared_sources_v0");
  assert.equal(ownerMedia.OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT,
    "owner_authorizes_local_render_of_exactly_the_declared_sources_and_their_declared_verified_canonical_derivatives_v0");
  assert.equal(ownerMedia.OWNER_MEDIA_AUTHORITY_DIGEST, "0cd89b68e42aca92acdfba826dff4c1dfe471134506712f20188343cec0a2f37");
  assert.equal(sha(canonicalSerialize(ownerMedia.CANONICAL_STORE)), "2e8f117c41883b1b40aaa71731e70b7ed8edd5116ef871ca3f32fcfb60bbf2dc");
});
test("B2A1-C08 protected rendering, N1 and the audited boundary stay pinned during A2 integration", () => {
  // A2 explicitly authorizes the ingest and owner-media adapters. Their A1 'not yet wired' source pins are historical phase evidence;
  // the protected renderer and exact N1 contract retain their original byte pins. A2's execution and registry suites cover the integration.
  for (const path of ["scripts/edit-render-local.ts", "packages/media-ingest/canonical.ts"]) pinned(path);
  // B2-B1 explicitly authorizes this single generated-research process registration. Reverse only that addition and retain the old pin.
  // E–F grants one additional hostile generated-media process harness; all old auditor bytes stay pinned after this exact delta.
  const audit = readFileSync("scripts/audit-workspace.mjs", "utf8").replace('"tests/media-ingest-plan-trust-media.integration.ts", "tests/media-ingest-lossless-cache-media.integration.ts",',
    '"tests/media-ingest-plan-trust-media.integration.ts",');
  const registration = /,\r?\n  "tests\/support\/canonical-reencode-media\.ts"/g;
  assert.equal([...audit.matchAll(registration)].length, 1);
  assert.equal(sha(audit.replace(registration, "")), "d2d48aefacca80874310814f412657f22f3605a277b1db64a09c85a2b7ff3a74");
});
test("B2A1-C09 dependencies and the lockfile are unchanged", () => { pinned("package.json"); pinned("package-lock.json"); });

// ================================================================ HOSTILE
const evaluateCodes = (value: unknown): string[] => ((ingest.evaluateCanonicalProfileV1(value) as unknown as Json).findings as Json[]).map(f => String(f.code));
const matrix = (coefficients: readonly number[]): Json => ({ state: "present", coefficients: [...coefficients] });

test("B2A1-H01 facts claiming an identity matrix whose coefficients are not the identity are judged by the coefficients", () => {
  assert.deepEqual(evaluateCodes(withVideo({ displayMatrix: { ...matrix(MATRICES.mirror_vertical), classification: "identity" } })), ["facts_invalid"]);
  assert.deepEqual(evaluateCodes(withVideo({ displayMatrix: { state: "absent", coefficients: [...MATRICES.mirror_vertical] } })), ["facts_invalid"]);
  const nearly: number[] = [...MATRICES.identity]; nearly[0] = 65_537;
  assert.deepEqual(evaluateCodes(withVideo({ displayMatrix: matrix(nearly) })), ["display_matrix_unsupported"]);
  assert.deepEqual(evaluateCodes(withVideo({ displayMatrix: matrix(MATRICES.mirror_vertical) })), ["display_d4_non_identity"]);
});

test("B2A1-H02 a hidden translation is never identity", () => {
  for (const [x, y] of [[1, 0], [0, 1], [-FX, 0]] as const) {
    const m: number[] = [...MATRICES.identity]; m[6] = x; m[7] = y;
    assert.deepEqual(evaluateCodes(withVideo({ displayMatrix: matrix(m) })), ["display_matrix_unsupported"], `${x},${y}`);
  }
});

test("B2A1-H03 a hidden crop (declared and decoded geometry disagree, no crop declared) refuses", () => {
  assert.deepEqual(evaluateCodes(withVideo({ geometry: { declared: { width: 320, height: 180 }, decoded: [{ width: 300, height: 170 }] } })), ["geometry_declared_decoded_mismatch"]);
  assert.deepEqual(evaluateCodes(withVideo({ geometry: { declared: { width: 1920, height: 1080 }, decoded: [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }] } })),
    ["geometry_varies"]);
});

test("B2A1-H04 unknown side data relabelled informational is still unknown", () => {
  for (const entry of [sei("f".repeat(32)), sei(X264_UUID, "stream"), { carrier: "frame", kind: "unknown", seiUuid: null }]) {
    assert.deepEqual(evaluateCodes(withVideo({ sideData: [entry] })), ["unknown_side_data"], canonicalSerialize(entry));
  }
  // The HEVC encoder SEI is not the H.264 one, whatever the bytes are called.
  assert.deepEqual(evaluateCodes(withVideo({ sideData: [sei("2ca2de09b51747dbbb55a4fe7fc2fc4e")] })), ["unknown_side_data"]);
  for (const malformed of [{ carrier: "frame", kind: "user_data_unregistered_sei", seiUuid: null }, { carrier: "frame", kind: "unknown", seiUuid: X264_UUID },
    { carrier: "frame", kind: "informational", seiUuid: null }, { carrier: "stream", kind: "display_matrix", seiUuid: null }, { carrier: "stream", kind: "frame_cropping", seiUuid: null }]) {
    assert.deepEqual(evaluateCodes(withVideo({ sideData: [malformed] })), ["facts_invalid"], canonicalSerialize(malformed));
  }
});

test("B2A1-H05 HDR relabelled SDR is still refused wherever the evidence shows it", () => {
  for (const sideData of [["mastering_display_metadata"], ["content_light_level"], ["dolby_vision"], ["hdr_dynamic_metadata"]]) {
    assert.deepEqual(evaluateCodes(withVideo({ sideData: sideData.map(kind => ({ carrier: "frame", kind, seiUuid: null })) })), ["hdr_side_data_present"]);
  }
  assert.ok(evaluateCodes(withVideo({ bitDepth: 10 })).includes("bit_depth_unsupported"), "yuv420p with a 10-bit declaration");
  assert.ok(evaluateCodes(withVideo({ pixelFormat: "yuv420p10le" })).includes("bit_depth_unsupported"), "a 10-bit decode with an 8-bit declaration");
});

test("B2A1-H06 BT.601 relabelled BT.709 is refused wherever one tag still says so, and a relabel is never the same evidence", () => {
  for (const color of [{ range: "tv", primaries: "smpte170m", transfer: "bt709", matrix: "bt709" }, { range: "tv", primaries: "bt709", transfer: "smpte170m", matrix: "bt709" },
    { range: "tv", primaries: "bt709", transfer: "bt709", matrix: "bt470bg" }, { range: "tv", primaries: null, transfer: null, matrix: "smpte170m" }]) {
    assert.ok(evaluateCodes(withVideo({ color })).includes("color_unsupported"), canonicalSerialize(color));
  }
  const truthful = ingest.evaluateCanonicalProfileV1(withVideo({ color: { range: "tv", primaries: "smpte170m", transfer: "smpte170m", matrix: "smpte170m" } })) as unknown as Json;
  const relabelled = ingest.evaluateCanonicalProfileV1(withVideo({})) as unknown as Json;
  assert.notEqual(truthful.factsDigest, relabelled.factsDigest, "the evaluation binds the exact facts it judged");
});

test("B2A1-H07 true VFR relabelled near-CFR is still true VFR", () => {
  assert.deepEqual(evaluateCodes(withVideo({ timingClass: "near_cfr" })), ["facts_invalid"]);
  for (const declaredFrameRate of [{ numerator: 30, denominator: 1 }, { numerator: 24, denominator: 1 }, { numerator: 15, denominator: 1 }]) {
    const result = planOf(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, declaredFrameRate, presentationTimestamps: gap500() }));
    assert.deepEqual([result.outcome, result.plan], ["DEFER", null]);
  }
});

test("B2A1-H08 a held first frame relabelled near-CFR is still refused", () => {
  assert.deepEqual(evaluateCodes(withVideo({ heldFirstFrame: false })), ["facts_invalid"]);
  const held = [0, 9000, ...cfr(58, 3000, 12_000)];
  for (const declaredFrameRate of [{ numerator: 30, denominator: 1 }, { numerator: 90_000, denominator: 1 }]) {
    const result = planOf(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, declaredFrameRate, presentationTimestamps: held }));
    assert.deepEqual([result.outcome, result.plan, (result.evaluation.findings as Json[]).map(f => f.code)], ["REFUSE", null, ["held_first_frame_ambiguous"]]);
  }
});

test("B2A1-H09 an operation removed from a recorded plan is detected at the plan, the builder and the record", () => {
  const source = composedSource(), { derivation } = planChain(source);
  const removed = reidentifiedPlan(derivation.plan as Json, body => { body.operations = (body.operations as Json[]).filter(o => o.op !== "DECLARE_SQUARE_SAMPLE_ASPECT"); });
  assert.ok(planParses(removed), "structurally valid on its own");
  assert.equal(ingest.revalidateCanonicalizationPlan(removed, source), false);
  assert.throws(() => planChain(source, { plan: removed }), refusesWith("derivation_invalid"));
  const forged = reidentifiedDerivation(derivation, d => {
    d.plan = removed;
    const video = ((d.output as Json).verification as Json).video as Json;
    video.bitstream = { state: "packet_payloads_identical", method: "pinned_runtime_video_packet_payload_md5_by_index_v1", sourceDigest: sha("v"), outputDigest: sha("v") };
  });
  assert.equal(derivationParses(forged), false, "the recorded source evaluation still requires the declaration");
});

test("B2A1-H10 an operation inserted into a plan is detected", () => {
  const source = ownerN1Like(), plan = planOf(source).plan!;
  const inserted = reidentifiedPlan(plan, body => { (body.operations as Json[]).push({ ...opOf(planOf(facts([videoStream(), asset05Audio()])).plan!, "RETIME_AUDIO_CONTIGUOUS") }); });
  assert.equal(ingest.revalidateCanonicalizationPlan(inserted, source), false);
  assert.throws(() => planChain(source, { plan: inserted }), refusesWith("derivation_invalid"));
});

test("B2A1-H11 a reordered plan is refused even when re-identified", () => {
  const plan = planOf(composedSource()).plan!;
  const reversed = reidentifiedPlan(plan, body => { body.operations = [...(body.operations as Json[])].reverse(); });
  assert.equal(planParses(reversed), false);
});

test("B2A1-H12 a widened snap bound is refused", () => {
  const plan = planOf(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: jittered(60, 3000, 630) })).plan!;
  for (const patch of [{ approvedMaxDisplacementSeconds: { numerator: 1, denominator: 90 } }, { approvedMaxDisplacementSeconds: { numerator: 1, denominator: 60 } },
    { maxDisplacementSeconds: { numerator: 751, denominator: 90_000 } }, { maxDisplacementSeconds: { numerator: 0, denominator: 1 } },
    { targetFrameRate: { numerator: 29, denominator: 1 }, gridPeriodTicks: 90_000 / 29 }, { gridPeriodTicks: 3001 }, { outputTimeBase: { numerator: 1, denominator: 30 }, gridPeriodTicks: 1 }]) {
    assert.equal(planParses(reidentifiedPlan(plan, body => { Object.assign(opOf(body, "SNAP_VIDEO_TIMESTAMPS"), patch); })), false, canonicalSerialize(patch));
  }
});

test("B2A1-H13 a widened audio bound is refused", () => {
  const plan = planOf(facts([videoStream(), asset05Audio()])).plan!;
  for (const patch of [{ approvedMaxDisplacementSamples: 10 }, { maxObservedDisplacementSamples: 10 }, { approvedMaxDisplacementSamples: 1024 }, { maxObservedDisplacementSamples: 0 },
    { sourceStartTicks: 1 }]) {
    assert.equal(planParses(reidentifiedPlan(plan, body => { Object.assign(opOf(body, "RETIME_AUDIO_CONTIGUOUS"), patch); })), false, canonicalSerialize(patch));
  }
});

test("B2A1-H14 a computation identity without the source bytes is refused", () => {
  const { derivation } = planChain(ownerN1Like());
  const forged = clone(derivation);
  delete forged.derivationId;
  forged.computationId = `${ingest.CANONICAL_PLAN_COMPUTATION_IDENTITY}_${sha(canonicalSerialize({ plan: forged.plan, toolchain: forged.toolchain }))}`;
  assert.equal(derivationParses(identify(ingest.CANONICAL_PLAN_DERIVATION_IDENTITY, "derivationId", forged)), false);
});

test("B2A1-H15 a computation identity without the plan is refused", () => {
  const { derivation } = planChain(ownerN1Like()), s = derivation.source as Json;
  const forged = clone(derivation);
  delete forged.derivationId;
  forged.computationId = `${ingest.CANONICAL_PLAN_COMPUTATION_IDENTITY}_${sha(canonicalSerialize({ source: { assetId: s.assetId, contentHash: s.contentHash, sizeBytes: s.sizeBytes },
    toolchain: forged.toolchain }))}`;
  assert.equal(derivationParses(identify(ingest.CANONICAL_PLAN_DERIVATION_IDENTITY, "derivationId", forged)), false);
});

test("B2A1-H16 a plan without, or with another, target profile is refused", () => {
  const plan = planOf(ownerN1Like()).plan!;
  assert.equal(planParses(reidentifiedPlan(plan, body => { delete body.targetProfile; })), false);
  assert.equal(planParses(reidentifiedPlan(plan, body => { body.targetProfile = { profileId: `canonical_media_profile_v1_${"0".repeat(64)}`, profileVersion: "1.0.0" }; })), false);
  assert.equal(planParses(reidentifiedPlan(plan, body => { body.targetProfile = { ...(body.targetProfile as Json), profileVersion: "2.0.0" }; })), false);
});

test("B2A1-H17 a derivation without its output verification is refused", () => {
  const { derivation } = planChain(composedSource());
  for (const mutate of [(d: Json) => { delete (d.output as Json).verification; }, (d: Json) => { delete ((d.output as Json).verification as Json).audio; },
    (d: Json) => { ((((d.output as Json).verification as Json).video as Json).decodedFrames as Json).outputDigest = sha("other"); },
    (d: Json) => { (((d.output as Json).verification as Json).output as Json).outcome = "CANONICALIZABLE_EXACT_REMUX"; },
    (d: Json) => { delete ((d.output as Json).verification as Json).droppedStreams; }]) {
    assert.equal(derivationParses(reidentifiedDerivation(derivation, mutate)), false);
  }
});

test("B2A1-H18 a changed N1 semantics can never pass as the accepted N1", () => {
  const changed = { ...ingest.N1_RECIPE, semanticsDigest: sha(canonicalSerialize({ ...ingest.N1_SEMANTICS, timing: { frames: "snapped", startPts: "rebased" } })) };
  const forged = reidentified(canonicalChain().derivation, d => { d.recipe = changed; });
  assert.equal(ingest.CanonicalMediaDerivationSchema.safeParse(forged).success, false, "only the registered N1 recipe");
  assert.equal(sha(canonicalSerialize(ingest.N1_SEMANTICS)), "21aa304a15e6a79bd7a75e31c78839817e50aab52ed773749a45431774ee0809");
  assert.deepEqual(ingest.N1_SEMANTICS.timing, { frames: "unchanged_exact_grid", startPts: "zero_unchanged" });
});
