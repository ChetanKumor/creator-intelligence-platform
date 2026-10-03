// Phase 5 Gate 7 Batch 3A pure tests: provider-neutral transcript evidence and its phrase pack, the evidence routing seam, the review plan
// derived from the executed program (every actual cut exactly once, a constant global set, exact windows and budgets), observation records
// and identities built from synthetic decoded bytes, the observation cache, and the critic foundation (deterministic measured checks, the
// model-neutral port, technical-QC separation, bounded findings). This file imports no subprocess module and decodes nothing: the receipts
// name synthetic output bytes, and decoded frames and audio are synthetic byte arrays. Actual media is exercised only by
// tests/edit-review-media.integration.ts.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { QC_CHECKS, RenderProgramSchema, type RenderProgram } from "../packages/edit-render/index.js";
import { CRITIC_DIMENSIONS, CriticReportSchema, DETERMINISTIC_CHECKS, EDIT_REVIEW_ERROR_CODES, EVIDENCE_DECISIONS, EditReviewError, EditorialObservationSchema,
  OBSERVATION_SEMANTICS_DIGEST, OBSERVER_IMPLEMENTATION, ObservationCache, REVIEW_HARD_LIMITS, ReviewPlanSchema, TranscriptPackSchema, buildObservation, buildTranscriptPack,
  classifyProgramJoins, createEvidenceRequest, createReviewPolicy, createTranscriptEvidence, observationComputationIdOf, planReview, renderTranscriptText, reuseObservation,
  runCriticReview, selectEvidence, validateTranscriptPack, type EditorialObservation, type ObservationRequest, type ObservationTarget, type ReviewPlan, type ReviewPolicy,
  type SemanticCriticInput, type SemanticCriticPort, type TranscriptEvidence } from "../packages/edit-review/index.js";
import { SyntheticFixtureCritic, assetOf, f32Audio, hashOf, renderedChain, yuvFrames, type RenderedChain, type SourceSpec } from "./support/edit-review.js";

// ---------------------------------------------------------------- helpers
async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof EditReviewError) { assert.ok((EDIT_REVIEW_ERROR_CODES as readonly string[]).includes(error.code), error.code); return error.code; }
    assert.fail(`expected an owned refusal, received ${String(error)}`);
  }
  assert.fail("expected an owned refusal");
}
function reidentify<T extends object>(value: T, key: string, namespace: string, mutate: (copy: T) => void): T {
  const copy = structuredClone(value); mutate(copy);
  const body = { ...copy } as Record<string, unknown>; delete body[key];
  return identify(namespace, key, body) as unknown as T;
}
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) allKeys(item, keys);
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); allKeys(child, keys); }
  return keys;
}
const LOCATION = /[A-Za-z]:[\\/]|\\\\|\/\/|https?:|\.(?:exe|bin|mp4|mov|json)\b/i;
const sha256File = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const bytesOf = (value: unknown) => new TextEncoder().encode(canonicalSerialize(value)).length;
const EVIDENCE = join(".test-artifacts", "phase5-gate7-batch3a");
function persist(name: string, value: unknown): void { mkdirSync(EVIDENCE, { recursive: true }); writeFileSync(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`); }

type PolicyPatch = { windows?: Partial<ReviewPolicy["windows"]>; budget?: Partial<ReviewPolicy["budget"]> };
const policyFor = (c: RenderedChain, patch: PolicyPatch = {}): ReviewPolicy => createReviewPolicy({
  scope: c.v.dag.scope, author: { kind: "owner", actorId: "owner_synthetic" },
  windows: { boundaryHalfWindowFrames: 15, globalWindowFrames: 30, interiorSamples: 3, ...patch.windows },
  budget: { maxObservations: 16, maxDeliveredFrames: 64, maxDecodedPixelFrames: 1_000_000_000, maxEvidenceBytes: 4_194_304, maxFindings: 32, maxExplanationCharacters: 400,
    maxReviewAttempts: 2, maxTranscriptCharacters: 16_384, maxDecodeMilliseconds: 120_000, ...patch.budget } });
const plan = (c: RenderedChain, policy = policyFor(c)) => planReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy });
const AB: SourceSpec[] = [{ key: "r3a_a" }, { key: "r3a_b", range: { startSeconds: 1, endSeconds: 3 } }];
const ABCD: SourceSpec[] = [{ key: "r3a_a", range: { startSeconds: 0, endSeconds: 1 } }, { key: "r3a_b", range: { startSeconds: 1, endSeconds: 2 } },
  { key: "r3a_c", range: { startSeconds: 2, endSeconds: 3 } }, { key: "r3a_d", range: { startSeconds: 3, endSeconds: 4 } }];

// ---------------------------------------------------------------- synthetic transcript evidence (48 kHz tick clock, synthetic stub producer)
const TPS = 48_000;
const W = (text: string, start: number, end: number, speakerId: string | null = "S1") =>
  ({ kind: "word" as const, startTicks: Math.round(start * TPS), endTicks: Math.round(end * TPS), text, speakerId });
const EV = (text: string, start: number, end: number) => ({ kind: "audio_event" as const, startTicks: Math.round(start * TPS), endTicks: Math.round(end * TPS), text, speakerId: null });
type Entry = ReturnType<typeof W> | ReturnType<typeof EV>;
function transcript(entries: readonly Entry[], o: { key?: SourceSpec["key"]; seconds?: number; producerVersion?: string } = {}): TranscriptEvidence {
  const key = o.key ?? "r3a_a";
  return createTranscriptEvidence({ source: { assetId: assetOf(key), contentHash: hashOf(key), durationTicks: (o.seconds ?? 4) * TPS }, clock: { ticksPerSecond: TPS },
    language: "en", producer: { producerId: "synthetic_transcript_fixture", producerVersion: o.producerVersion ?? "0.1.0", computationBasis: "synthetic_stub", mediaBasis: "synthetic" },
    entries: [...entries] });
}
const SPEECH: Entry[] = [W("hello", 0.2, 0.45), W("there", 0.45, 0.7), W("this", 1.0, 1.2), W("is", 1.2, 1.5), W("yes", 2.2, 2.9, "S2"), W("right", 2.9, 3.2),
  EV("laughter", 3.0, 3.5), W("ok", 3.5, 3.7)];
const PACK_POLICY = { silenceGapTicks: 12_000, maxPhraseEntries: 64 };

// ---------------------------------------------------------------- synthetic decoded media shaped exactly like the adapter's decode
/** Output luma: bright except a black run on output frames 60..74; output audio: 0.5 DC before sample 96000, digital silence after. */
const lumaAt = (frame: number) => frame >= 60 && frame < 75 ? 20 : 180;
const sampleAt = (index: number) => index < 96_000 ? 0.5 : 0;
interface Synthetic { luma?: (frame: number) => number; sample?: (index: number) => number; transcripts?: readonly TranscriptEvidence[] }
function decodedFor(p: ReviewPlan, request: ObservationRequest, o: Synthetic = {}) {
  const { width, height } = p.facts, count = request.window.endFrame - request.window.startFrame, luma = o.luma ?? lumaAt;
  const video = yuvFrames({ width, height, first: request.window.startFrame, count, luma: frame => luma(frame) });
  if (p.facts.audio.state !== "present" || request.audio === "none") return { video, audio: null };
  const spf = (p.facts.audio.sampleRateHz * p.facts.frameRate.denominator) / p.facts.frameRate.numerator;
  const audio = f32Audio({ channels: p.facts.audio.channels, first: request.window.startFrame * spf, count: count * spf, sample: i => (o.sample ?? sampleAt)(i) });
  return { video, audio };
}
const SYNTHETIC = { basis: "synthetic_test_bytes_not_media_decode_v0" as const, tool: null };
const itemTarget = (itemIndex: number): ObservationTarget => ({ kind: "plan_item", itemIndex });
function observeItem(p: ReviewPlan, itemIndex: number, o: Synthetic = {}): EditorialObservation {
  return buildObservation({ plan: p, target: itemTarget(itemIndex), decoded: decodedFor(p, p.items[itemIndex]!.request, o), transcripts: o.transcripts ?? [], acquisition: SYNTHETIC });
}
const observeAll = (p: ReviewPlan, o: Synthetic = {}) => p.items.map((_, i) => observeItem(p, i, o));

// ================================================================ R01 accepted execution, render and graph authority stays byte-identical
const FROZEN: readonly (readonly [string, string])[] = [
  ["packages/edit-execution/admission.ts", "5dda4c3d4ebae6438e9a50e6d5545b28d5c8f626b6d947634c638cec8608047e"],
  ["packages/edit-execution/common.ts", "f45a6e3a81303f3609c3a01918881e3da2eabe4a3682794f49237b0af5d69e3e"],
  ["packages/edit-execution/dag.ts", "37d89580f9d3dc4ebc633b768c2e4d1776cf956e8883d7c8749cc3afeecebf33"],
  ["packages/edit-execution/grant.ts", "5b2c53676327f5c353a4aedfc6f0017ee009ced11d3d11539850c5d8da004828"],
  ["packages/edit-execution/index.ts", "d1e0ec87c18ac77457f1c3e5b81691718483e3cfe0d2c96ae5dc97536ab16980"],
  ["packages/edit-execution/policy.ts", "3732c5e30bae7f19a8d9ca65c240014c73274d242ab7004c68e582d0ee393a9b"],
  ["packages/edit-execution/runtime.ts", "3db1353b95352eb6d30b7e19f47905563cbd1801423a810d86d45a1552fdcdb3"],
  ["packages/edit-execution/source.ts", "d6d78941984d37dd9f58c4b7c9486f9278c7d4fbce26e9fba86c43072085d944"],
  ["packages/edit-execution/workload.ts", "599cbabff5fba8cfc968c51236bc1b71189d1a65716ad7b91d4d0471e770f325"],
  ["packages/edit-graph/capability.ts", "e13970d956f172bb74a55de92d1b61323a016e4b3a949154b52bb5a38425139a"],
  ["packages/edit-graph/common.ts", "dc191f3bde02fb4ef63d3b615403271f281095ad22a3630e2641988997b43968"],
  ["packages/edit-graph/compatibility.ts", "93d10fb4d1d658d5f26183e14b81a4aefbaba44a1bf9b58f93bb6eae5d22d96c"],
  ["packages/edit-graph/graph.ts", "1ab3927412a52e59550e9c019032a0e02156a64fd95e3452b185d58031110da6"],
  ["packages/edit-graph/index.ts", "8315b66518cf42234d57a1e79f3d145e94cbdbb90887328f605a0abac2be87df"],
  ["packages/edit-graph/profile.ts", "5823f09e40027b8632fb5ee045327a376f8154ac878f8adaee4c358753893b14"],
  ["packages/edit-graph/resolution.ts", "f5419d21686c7cf69050b424ae658e941ec065ef4c7da50cf240982526aef753"],
  // Gate 7 Batch 3D (owner-authorized protected change, 3D-R01): authorize.ts, index.ts and scripts/edit-render-local.ts accept the owner-local
  // real-media lifecycle authority beside the unchanged synthetic-fixture one. Prior pins: 860ff1e9..., 3ff1f341..., 379e3bec....
  ["packages/edit-render/authorize.ts", "43bb22d5d1d44a09b5e8366717c48b2ca8b10f0bf462282e1ca3ff3662a0f44b"],
  ["packages/edit-render/common.ts", "b449777d5bf9800ae109e8f2a3185128691d724e5eeefa1747b31316f097e549"],
  ["packages/edit-render/ffmpeg.ts", "fc7937654bca17cf5c4005ea730aba0801559fee84eee6ca41a419ec9f24f98a"],
  ["packages/edit-render/index.ts", "1546b1cbff19448ac990e8fc4b90460856ebaa254e6e7ec8aa47c8f4fa7d99c6"],
  ["packages/edit-render/probe.ts", "db2c965fa5161ef406245a764ee07ab0c8c02cb381f7e6b230390f72e9d6cc04"],
  ["packages/edit-render/program.ts", "f0f927b7c4b6b730125d6d13fb488ab7e96a611661251ba7ce9f60340ac3d7e5"],
  ["packages/edit-render/qc.ts", "c45108b328ec989d088b91f5c7f9581bab9a6c22da3cb315b0283bc754e7d855"],
  ["packages/edit-render/receipts.ts", "d2648db64db5375fe39ffa2c4190a10e65381311a96a8d2607f06019a80e0678"],
  ["packages/edit-render/records.ts", "f3b717e49bf83645573d0d96334212ea613d48c9634e9eaff93532c8bf8eac2f"],
  ["packages/edit-render/semantics.ts", "f1c32dc1f5b53367e6f28eca17db673ed6fcef2ee639147e8198a3fa5b9c8ca1"],
  ["packages/edit-runtime/call.ts", "40b1b80e5e98820223e1ef825867728165750b59dbbb695b6ab0cda4f55f40ee"],
  ["packages/edit-runtime/common.ts", "3e03458c434445523cda89bddb097cd383991edfa874eed3fff3c3609dfcbeb4"],
  ["packages/edit-runtime/dispatch.ts", "f0a75e7fe0dac3173d15d88344f50803758cd990a615822dfdc52091dfcff0c7"],
  ["packages/edit-runtime/index.ts", "4b0b9ca65caf88d34e1d7c5121f9df1a23181af9a08aafdb688cd51fe68faf0f"],
  ["packages/edit-runtime/ledger.ts", "b12cceb87896e98a16a2f3be47027c61529d3313a412d077b559bd745e3b8303"],
  ["packages/edit-runtime/ports.ts", "0ffb89cb6ebad7bf99c61beb132fdd01a7246f8921bf1730c101c436f9ccbedb"],
  ["packages/edit-runtime/recheck.ts", "646c6e235068237d889888ec88a1681241f76e0eff714dd82bda3315b0c36e96"],
  ["packages/edit-runtime/records.ts", "ca9093398cba8bc3d7652a0dbf0189d63936fcb7f15df4fd0b3dab900380190e"],
  ["packages/edit-runtime/staging.ts", "5fcc677b643f1b9efe78087d585a071a29eda9e8884f1ab775adfeb32e7404c3"],
  ["packages/edit-runtime/validated.ts", "153bace6f31cda5950f54d92920f7cef4afbdf2eaf3107900c7a0462194b595a"],
  ["scripts/edit-media-qc-local.ts", "b8705fe2c8b118a98ed8058c0faa4a7a6b6874adb646eb052c3a3f539c9836e0"],
  ["scripts/edit-render-fixture-authority-local.ts", "6a6719a13cdba1c7eab34ab937c42066214ac3e9aba8eb2e4b62d874076a63cd"],
  ["scripts/edit-render-local.ts", "57e4d4159520acdb9e9955a565303f42bf6fa38f1eea631b8b0eeb2a61e42b7b"],
  ["scripts/edit-runtime-local.ts", "016ae90284b4181909e2dc0ffa79d0824c596d41166af376fc65282f24bc0546"],
  ["tests/edit-render-media.integration.ts", "9d9338d4815f135d1c0b3949d1e2612290e1f3be81cdf9eac2e5a4be41ce6449"],
  ["tests/edit-render.test.ts", "9f3ee736e19774f9e3e6339163cb662747a92a39c2008c96d5299114da7dd20f"],
  ["tests/support/edit-render-media.ts", "640b8880150c4682fc6a6d336c430af3bd97678afa9509527fb447f4db03819f"],
  ["tests/support/edit-render.ts", "e0e3a8734713520ebef83eeb6b107c6ad875450d236003629a0bfea8b97e17c3"],
];
test("R01 the accepted Batch-1, Batch-2A, Batch-2B and Gate-6 files are byte-identical and Batch 3A adds nothing to their packages", () => {
  for (const [path, hash] of FROZEN) assert.equal(sha256File(path), hash, path);
  assert.deepEqual({ render: readdirSync("packages/edit-render").length, runtime: readdirSync("packages/edit-runtime").length, execution: readdirSync("packages/edit-execution").length,
    // Gate 7 Batch 3B adds exactly packages/edit-render/localized.ts and packages/edit-graph/revision.ts; Gate 7 Batch 3D adds exactly
    // packages/edit-render/owner-media.ts.
    graph: readdirSync("packages/edit-graph").length }, { render: 12, runtime: 10, execution: 9, graph: 8 });
});

// ================================================================ R02-R10 transcript evidence and the phrase pack
test("R02 transcript evidence binds exact source content, uses the accepted integer tick clock and has a deterministic content identity", () => {
  const a = transcript(SPEECH), again = transcript(SPEECH);
  assert.equal(a.transcriptEvidenceId, again.transcriptEvidenceId);
  assert.match(a.transcriptEvidenceId, /^transcript_evidence_v0_[a-f0-9]{64}$/);
  assert.deepEqual(a.source, { assetId: assetOf("r3a_a"), contentHash: hashOf("r3a_a"), durationTicks: 192_000 });
  assert.deepEqual(a.clock, { ticksPerSecond: 48_000 });
  assert.notEqual(transcript(SPEECH, { key: "r3a_b" }).transcriptEvidenceId, a.transcriptEvidenceId, "other source bytes are other evidence");
  assert.notEqual(transcript(SPEECH, { producerVersion: "0.2.0" }).transcriptEvidenceId, a.transcriptEvidenceId, "another producer build is other evidence");
  const edited = SPEECH.map((e, i) => i === 1 ? { ...e, text: "their" } : e);
  assert.notEqual(transcript(edited).transcriptEvidenceId, a.transcriptEvidenceId, "any entry change is other evidence");
  // No location, provider payload or free-form field can be carried: the input is strict.
  assert.equal(allKeys(a).has("path") || allKeys(a).has("url") || allKeys(a).has("words"), false);
  const { artifactType: _t, artifactVersion: _v, stability: _s, transcriptEvidenceId: _id, ...body } = a;
  assert.throws(() => createTranscriptEvidence({ ...body, path: "C:/media/take.mp4" } as never));
  assert.equal(allStrings(a).filter(s => LOCATION.test(s)).length, 0);
});

test("R03 malformed transcript timing is refused, never repaired or reordered", async () => {
  const cases: [string, Entry[]][] = [
    ["start equals end", [W("x", 1, 1)]],
    ["end beyond the admitted duration", [W("x", 3.9, 4.1)]],
    ["starts out of order", [W("b", 1, 1.2), W("a", 0.5, 0.6)]],
    ["overlapping words", [W("a", 1, 1.5), W("b", 1.2, 1.6)]],
  ];
  for (const [label, entries] of cases) assert.equal(await refusal(() => transcript(entries)), "transcript_timing_invalid", label);
  assert.equal(await refusal(() => transcript([{ ...W("x", 1, 1.1), startTicks: 48_000.5 }])), "transcript_invalid", "fractional ticks");
  assert.equal(await refusal(() => transcript([{ ...W("x", 1, 1.1), startTicks: -1 }])), "transcript_invalid", "negative ticks");
  // An audio event may overlap a word; words may touch exactly.
  transcript([W("a", 1, 1.5), EV("applause", 1.2, 2), W("b", 1.5, 1.8)]);
});

test("R04 transcript entry count and text sizes are hard-bounded", async () => {
  const many = Array.from({ length: REVIEW_HARD_LIMITS.maxTranscriptEntries + 1 }, (_, i) => ({ kind: "word" as const, startTicks: i * 8, endTicks: i * 8 + 4, text: "w",
    speakerId: null }));
  assert.equal(await refusal(() => transcript(many, { seconds: 10 })), "transcript_limit_exceeded");
  assert.equal(await refusal(() => transcript([W("x".repeat(REVIEW_HARD_LIMITS.maxEntryTextCharacters + 1), 1, 1.1)])), "transcript_invalid");
  assert.equal(await refusal(() => transcript([W("bell\u0007", 1, 1.1)])), "transcript_invalid", "control characters");
  assert.equal(await refusal(() => transcript([EV("(nested)", 1, 1.1)])), "transcript_invalid", "an audio-event label is a bare label");
  const total = Array.from({ length: 5_000 }, (_, i) => ({ kind: "word" as const, startTicks: i * 64, endTicks: i * 64 + 32, text: "x".repeat(60), speakerId: null }));
  assert.equal(await refusal(() => transcript(total, { seconds: 10 })), "transcript_limit_exceeded", "total text bytes");
});

test("R05 the pack groups deterministically on silence, speaker and entry limit, with exact lineage to every entry", () => {
  const evidence = transcript(SPEECH), pack = buildTranscriptPack(evidence, PACK_POLICY);
  TranscriptPackSchema.parse(pack);
  assert.deepEqual(pack.phrases.map(({ phraseIndex, startTicks, endTicks, speakerId, breakBefore, entryStart, entryEnd, wordCount, audioEventEntries, text }) =>
    ({ phraseIndex, startTicks, endTicks, speakerId, breakBefore, entryStart, entryEnd, wordCount, audioEventEntries, text })), [
    { phraseIndex: 0, startTicks: 9600, endTicks: 33_600, speakerId: "S1", breakBefore: "transcript_start", entryStart: 0, entryEnd: 2, wordCount: 2, audioEventEntries: [], text: "hello there" },
    { phraseIndex: 1, startTicks: 48_000, endTicks: 72_000, speakerId: "S1", breakBefore: "silence_gap", entryStart: 2, entryEnd: 4, wordCount: 2, audioEventEntries: [], text: "this is" },
    { phraseIndex: 2, startTicks: 105_600, endTicks: 139_200, speakerId: "S2", breakBefore: "speaker_change", entryStart: 4, entryEnd: 5, wordCount: 1, audioEventEntries: [], text: "yes" },
    { phraseIndex: 3, startTicks: 139_200, endTicks: 177_600, speakerId: "S1", breakBefore: "speaker_change", entryStart: 5, entryEnd: 8, wordCount: 2, audioEventEntries: [6],
      text: "right (laughter) ok" }]);
  // Lineage: the phrases partition the entries exactly once, in order.
  assert.deepEqual(pack.phrases.flatMap(p => Array.from({ length: p.entryEnd - p.entryStart }, (_, k) => p.entryStart + k)), evidence.entries.map((_, i) => i));
  assert.equal(pack.transcript.transcriptEvidenceId, evidence.transcriptEvidenceId);
  // Silence splits exactly at the threshold (a gap equal to it splits; one tick less does not).
  const gap = 48_000 - 33_600;
  assert.equal(buildTranscriptPack(evidence, { ...PACK_POLICY, silenceGapTicks: gap }).phrases[1]!.breakBefore, "silence_gap");
  assert.deepEqual(buildTranscriptPack(evidence, { ...PACK_POLICY, silenceGapTicks: gap + 1 }).phrases[0]!.text, "hello there this is");
  // A speaker change splits even without a gap; an unknown speaker never does.
  assert.equal(pack.phrases[3]!.startTicks, pack.phrases[2]!.endTicks);
  const unknown = buildTranscriptPack(transcript([W("a", 1, 1.1, null), W("b", 1.1, 1.2, "S3"), W("c", 1.2, 1.3, null)]), PACK_POLICY);
  assert.deepEqual(unknown.phrases.map(p => [p.text, p.speakerId]), [["a b c", "S3"]]);
  // The entry limit splits deterministically.
  const limited = buildTranscriptPack(evidence, { ...PACK_POLICY, maxPhraseEntries: 2 });
  assert.deepEqual(limited.phrases.slice(3).map(p => [p.text, p.breakBefore, p.entryStart, p.entryEnd]), [["right (laughter)", "speaker_change", 5, 7], ["ok", "entry_limit", 7, 8]]);
});

test("R06 no-speech input is a valid first-class pack with no phrases", () => {
  const silent = transcript([]), pack = buildTranscriptPack(silent, PACK_POLICY);
  assert.deepEqual({ entries: silent.entries.length, phrases: pack.phrases.length, entryCount: pack.entryCount }, { entries: 0, phrases: 0, entryCount: 0 });
  assert.match(renderTranscriptText(pack), /\n\(no speech in this transcript evidence\)\n$/);
  // An audio event alone is still no speech: it forms a phrase with no words.
  assert.deepEqual(buildTranscriptPack(transcript([EV("applause", 1, 2)]), PACK_POLICY).phrases.map(p => [p.text, p.wordCount]), [["(applause)", 0]]);
});

test("R07 pack identity is the transcript evidence and the grouping semantics, nothing else", () => {
  const evidence = transcript(SPEECH), pack = buildTranscriptPack(evidence, PACK_POLICY);
  assert.equal(buildTranscriptPack(transcript(SPEECH), PACK_POLICY).packId, pack.packId);
  assert.match(pack.packId, /^transcript_pack_v0_[a-f0-9]{64}$/);
  assert.notEqual(buildTranscriptPack(evidence, { ...PACK_POLICY, silenceGapTicks: 12_001 }).packId, pack.packId);
  assert.notEqual(buildTranscriptPack(evidence, { ...PACK_POLICY, maxPhraseEntries: 63 }).packId, pack.packId);
  assert.notEqual(buildTranscriptPack(transcript(SPEECH.map((e, i) => i === 0 ? { ...e, endTicks: e.endTicks - 1 } : e)), PACK_POLICY).packId, pack.packId, "transcript mutation");
  assert.notEqual(buildTranscriptPack(transcript(SPEECH, { key: "r3a_c" }), PACK_POLICY).packId, pack.packId, "source mutation");
});

test("R08 the text projection is a deterministic, bounded function of the pack and says it is not authority", () => {
  const pack = buildTranscriptPack(transcript(SPEECH), PACK_POLICY), text = renderTranscriptText(pack);
  assert.equal(text, [`# TranscriptPack ${pack.packId} | asset ${assetOf("r3a_a")} | 4 phrases | projection only, not authority`,
    "[00:00.200–00:00.700] S1: hello there", "[00:01.000–00:01.500] S1: this is", "[00:02.200–00:02.900] S2: yes", "[00:02.900–00:03.700] S1: right (laughter) ok", ""].join("\n"));
  assert.equal(renderTranscriptText(pack), text);
  // Media of an hour or more prints hours on every line; an unknown speaker is named as such.
  const anonymous = renderTranscriptText(buildTranscriptPack(transcript([W("a", 61, 61.5, null)], { seconds: 3700 }), PACK_POLICY));
  assert.match(anonymous, /\n\[00:01:01\.000–00:01:01\.500\] UNKNOWN_SPEAKER: a\n$/);
});

test("R09 a pack is accepted only when it replays exactly from its transcript evidence", async () => {
  const evidence = transcript(SPEECH), pack = buildTranscriptPack(evidence, PACK_POLICY);
  assert.deepEqual(validateTranscriptPack(pack, evidence), pack);
  const forged = reidentify(pack, "packId", "transcript_pack_v0", p => { p.phrases[0]!.text = "hello there!"; });
  TranscriptPackSchema.parse(forged);
  assert.equal(await refusal(() => validateTranscriptPack(forged, evidence)), "transcript_pack_mismatch");
  const shifted = reidentify(pack, "packId", "transcript_pack_v0", p => { p.phrases[1]!.entryStart = 1; p.phrases[0]!.entryEnd = 1; });
  assert.equal(await refusal(() => validateTranscriptPack(shifted, evidence)), "transcript_pack_mismatch");
  assert.equal(await refusal(() => validateTranscriptPack(pack, transcript(SPEECH, { key: "r3a_b" }))), "transcript_pack_mismatch", "another transcript");
});

test("R10 measured sizes: raw transcript evidence, structured pack and text projection (recorded, no savings claim)", () => {
  const entries: Entry[] = [];
  for (let i = 0; i < 2_000; i += 1) {
    const phrase = Math.floor(i / 20), start = i * 0.25 + phrase * 0.5;
    entries.push(W(`word${i % 97}`, start, start + 0.2, `S${1 + (Math.floor(i / 40) % 2)}`));
  }
  const evidence = transcript(entries, { seconds: 800 });
  const started = performance.now(), pack = buildTranscriptPack(evidence, PACK_POLICY), buildMilliseconds = performance.now() - started, text = renderTranscriptText(pack);
  const sizes = { words: evidence.entries.length, phrases: pack.phrases.length, rawTranscriptEvidenceBytes: bytesOf(evidence), transcriptPackBytes: bytesOf(pack),
    textProjectionBytes: new TextEncoder().encode(text).length, packBuildMilliseconds: Number(buildMilliseconds.toFixed(3)) };
  assert.equal(sizes.phrases, 100);
  for (const value of Object.values(sizes)) assert.ok(Number.isFinite(value) && value > 0);
  persist("r10-transcript-pack-sizes.json", { basis: "synthetic 2,000-word transcript evidence; bytes are canonical JSON / UTF-8 text lengths", ...sizes });
});

// ================================================================ R11-R15 evidence routing: what evidence one decision needs
const OUTPUT = { kind: "rendered_output" as const, outputArtifactId: `render_output_artifact_v0_${"a".repeat(64)}`, contentHash: "a".repeat(64) };
const SOURCE = { kind: "staged_source" as const, assetId: assetOf("r3a_a"), contentHash: hashOf("r3a_a") };
const requestBody = (decision: (typeof EVIDENCE_DECISIONS)[number], coverage: number | null, o: { media?: number; observationIds?: string[]; max?: number } = {}) => ({
  decision, media: Array.from({ length: o.media ?? 1 }, (_, i) => i === 0 ? OUTPUT : SOURCE), interval: { startFrame: 45, endFrame: 75 },
  available: { transcript: coverage === null ? { state: "absent" as const } : { state: "present" as const, transcriptEvidenceId: transcript(SPEECH).transcriptEvidenceId,
    speechCoveragePerMille: coverage }, observationIds: o.observationIds ?? [] }, maxAdditionalObservations: o.max ?? 1 });
const request = (...args: Parameters<typeof requestBody>) => createEvidenceRequest(requestBody(...args));

test("R11 speech-heavy material routes speech decisions to the transcript pack plus a waveform observation", () => {
  const s = selectEvidence(request("speech_selection", 800));
  assert.deepEqual({ profile: s.profile, transcript: s.transcript.use, observations: s.observations.map(o => o.content), reuse: s.reuse },
    { profile: "speech_heavy", transcript: "transcript_pack", observations: ["waveform"], reuse: [] });
  assert.deepEqual(s.observations[0], { media: 0, content: "waveform", request: { window: { startFrame: 45, endFrame: 75 }, frames: [], audio: "window" } });
  assert.deepEqual(selectEvidence(request("pacing", null)).observations[0]!.request, { window: { startFrame: 45, endFrame: 75 }, frames: [45, 59, 74], audio: "window" });
  assert.equal(selectEvidence(request("speech_selection", 800)).selectionId, s.selectionId);
});

test("R12 visual or music-driven material never needs a transcript", () => {
  for (const decision of ["visual_continuity", "music_sync", "cut_boundary", "pacing"] as const) {
    const s = selectEvidence(request(decision, null));
    assert.deepEqual({ profile: s.profile, transcript: s.transcript.use, content: s.observations.map(o => o.content) },
      { profile: "visual_music_driven", transcript: "not_required", content: ["frames_and_waveform"] }, decision);
  }
  // A transcript that covers little speech does not turn a visual decision into a speech decision.
  assert.equal(selectEvidence(request("cut_boundary", 50)).transcript.use, "not_required");
});

test("R13 mixed material uses both the pack and frames", () => {
  const s = selectEvidence(request("cut_boundary", 300));
  assert.deepEqual({ profile: s.profile, transcript: s.transcript.use, content: s.observations.map(o => o.content) },
    { profile: "mixed", transcript: "transcript_pack", content: ["frames_and_waveform"] });
  assert.equal(selectEvidence(request("music_sync", 300)).transcript.use, "not_required", "music sync never needs words");
});

test("R14 no-speech material is routed for every decision without requiring a transcript", () => {
  for (const decision of EVIDENCE_DECISIONS) {
    const s = selectEvidence(request(decision, null));
    assert.notEqual(s.transcript.use, "transcript_pack", decision);
    assert.equal(s.transcript.use, decision === "speech_selection" || decision === "retake_comparison" ? "unavailable_proceeding_without_transcript" : "not_required", decision);
    assert.deepEqual(s.observations.map(o => o.content), ["frames_and_waveform"], decision);
  }
});

test("R15 additional observations are bounded, and available observations are reused instead of re-observed", async () => {
  assert.equal(selectEvidence(request("pacing", null, { media: 3, max: 2 })).observations.length, 2);
  const reused = selectEvidence(request("pacing", null, { observationIds: ["editorial_observation_v0_existing"], max: 2 }));
  assert.deepEqual({ reuse: reused.reuse, observations: reused.observations.length }, { reuse: ["editorial_observation_v0_existing"], observations: 0 });
  assert.equal(await refusal(() => request("pacing", null, { max: REVIEW_HARD_LIMITS.maxAdditionalObservations + 1 })), "evidence_request_invalid");
  assert.equal(await refusal(() => createEvidenceRequest({ ...requestBody("pacing", null), interval: { startFrame: 10, endFrame: 10 } })), "evidence_request_invalid");
  assert.equal(await refusal(() => createEvidenceRequest({ ...requestBody("pacing", null), media: [] })), "evidence_request_invalid");
});

// ================================================================ R16-R21 the review plan: every actual cut once, a constant global set, bounded
test("R16 every executed join is derived exactly once, in order, at its exact output frame, tick and sample", async t => {
  const c = await renderedChain(t, ABCD), p = plan(c);
  ReviewPlanSchema.parse(p);
  const sequence = c.v.dag.nodes.find(n => n.kind === "cut_sequence");
  assert.ok(sequence?.kind === "cut_sequence");
  assert.deepEqual(p.segments.map(s => s.contentHash), ABCD.map(s => hashOf(s.key)), "the edit plays the sources in the planned order");
  assert.deepEqual(p.joins.map(j => ({ joinIndex: j.joinIndex, atFrame: j.atFrame, atTicks: j.atTicks, atSample: j.atSample, fromClipUseId: j.fromClipUseId, toClipUseId: j.toClipUseId,
    classification: j.classification, review: j.review })),
  sequence.joins.map((j, i) => ({ joinIndex: i, atFrame: j.atFrame, atTicks: j.atTicks, atSample: j.atFrame * 1600, fromClipUseId: j.fromClipUseId, toClipUseId: j.toClipUseId,
    classification: "source_change", review: "reviewed" })));
  assert.deepEqual(p.joins.map(j => [j.atFrame, j.atTicks, j.atSample]), [[30, 1_000_000_000, 48_000], [60, 2_000_000_000, 96_000], [90, 3_000_000_000, 144_000]]);
  assert.deepEqual(p.joins.map(j => j.atFrame), c.program.joins.map(j => j.atFrame));
  const boundaries = p.items.filter(i => i.purpose === "cut_boundary");
  assert.deepEqual(boundaries.map(i => [i.joinIndex, i.request.window, i.request.frames]), [
    [0, { startFrame: 15, endFrame: 45 }, [15, 29, 30, 44]], [1, { startFrame: 45, endFrame: 75 }, [45, 59, 60, 74]], [2, { startFrame: 75, endFrame: 105 }, [75, 89, 90, 104]]]);
  assert.deepEqual(p.items.map(i => i.itemIndex), p.items.map((_, i) => i));
  assert.equal(planReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy: policyFor(c) }).planId, p.planId, "deterministic");
  // An explicit Gate-6 cut operation and contiguous placement are one join, never two boundaries.
  const q = plan(await renderedChain(t, AB, { graph: { cut: true } }));
  assert.equal(q.joins.length, 1);
  assert.equal(typeof q.joins[0]!.graphOperation, "string");
  assert.equal(plan(await renderedChain(t, AB)).joins[0]!.graphOperation, null);
});

test("R17 no phantom boundary: a single clip has none, and a provably continuous join is accounted but never reviewed as a cut", async t => {
  const single = plan(await renderedChain(t, [{ key: "r3a_a" }]));
  assert.deepEqual({ joins: single.joins.length, boundaries: single.items.filter(i => i.purpose === "cut_boundary").length }, { joins: 0, boundaries: 0 });
  assert.ok(single.items.every(i => i.request.window.startFrame >= 0 && i.request.window.endFrame <= single.facts.frames));
  // Crafted programs (schema-valid, re-identified) isolate the classification rule from the accepted planner.
  const c = await renderedChain(t, AB), base = c.program, slotA = base.segments[0]!.input;
  const craft = (mutate: (p: RenderProgram) => void) => RenderProgramSchema.parse(reidentify(base, "programId", "render_program_v0", mutate));
  const continuous = craft(p => { p.segments[1] = { ...p.segments[1]!, input: slotA, video: { ...p.segments[1]!.video, startFrame: 60, endFrame: 120 },
    audio: { state: "linked", startSample: 96_000, endSample: 192_000 } }; });
  assert.deepEqual(classifyProgramJoins(continuous).map(j => [j.classification, j.review]), [["continuous_source_join", "not_reviewed_continuous_source"]]);
  const repeated = craft(p => { p.segments[1] = { ...p.segments[1]!, input: slotA, video: { ...p.segments[1]!.video, startFrame: 0, endFrame: 60 },
    audio: { state: "linked", startSample: 0, endSample: 96_000 } }; });
  assert.deepEqual(classifyProgramJoins(repeated).map(j => [j.classification, j.review]), [["same_source_discontinuous", "reviewed"]]);
  const looked = craft(p => { p.segments[1] = { ...p.segments[1]!, input: slotA, video: { ...p.segments[1]!.video, startFrame: 60, endFrame: 120 },
    audio: { state: "linked", startSample: 96_000, endSample: 192_000 }, look: { state: "clip", look: "warm", intensityPerMille: 500 } }; });
  assert.deepEqual(classifyProgramJoins(looked).map(j => [j.classification, j.review]), [["look_change_only", "reviewed"]]);
  assert.deepEqual(classifyProgramJoins(base).map(j => [j.classification, j.review]), [["source_change", "reviewed"]]);
});

test("R18 the plan binds the exact rendered output, its execution receipt and its passing technical QC", async t => {
  const c = await renderedChain(t, AB), p = plan(c);
  assert.deepEqual(p.output, { outputArtifactId: c.receipt.output.outputArtifactId, contentHash: c.receipt.output.contentHash, sizeBytes: c.receipt.output.sizeBytes, container: "mp4" });
  assert.deepEqual(p.render, { receiptId: c.receipt.receiptId, dagId: c.v.dag.dagId, programId: c.program.programId, renderComputationId: c.receipt.renderComputationId,
    editGraph: { editGraphId: c.v.dag.graph.editGraphId, revision: 0 }, editGraphArtifact: c.v.dag.editGraph, renderIntent: "final" });
  assert.equal(c.receipt.program.programId, c.program.programId);
  assert.deepEqual(p.technicalQc, { qcReceiptId: c.qc.qcReceiptId, verdict: "pass", qcScope: "technical_media_qc_only_not_semantic_or_editing_quality" });
  assert.deepEqual(p.facts, { frames: 120, frameRate: { numerator: 30, denominator: 1 }, width: 180, height: 320, audio: { state: "present", sampleRateHz: 48_000, channels: 2 } });
  assert.equal(allStrings(p).filter(s => LOCATION.test(s)).length, 0);
});

test("R19 no plan without an exact, passing, linked technical QC of this receipt, or for a receipt of another DAG or program", async t => {
  const c = await renderedChain(t, AB), other = await renderedChain(t, ABCD), policy = policyFor(c);
  const attempt = (patch: Record<string, unknown>) => planReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy, ...patch } as never);
  assert.equal(await refusal(() => attempt({ qc: undefined })), "technical_qc_missing");
  const failing = await renderedChain(t, AB, { qc: "fail" });
  assert.equal(await refusal(() => planReview({ dag: failing.v, artifacts: failing.artifacts, receipt: failing.receipt, qc: failing.qc, policy: policyFor(failing) })), "technical_qc_failed");
  assert.equal(await refusal(() => attempt({ qc: other.qc })), "technical_qc_linkage_mismatch");
  const qcForOtherBytes = reidentify(c.qc, "qcReceiptId", "technical_media_qc_receipt_v0", q => { q.output.contentHash = "e".repeat(64); q.observedIdentity.contentHash = "e".repeat(64); });
  assert.equal(await refusal(() => attempt({ qc: qcForOtherBytes })), "technical_qc_linkage_mismatch");
  assert.equal(await refusal(() => attempt({ receipt: other.receipt })), "render_receipt_mismatch");
  const otherProgram = reidentify(c.receipt, "receiptId", "render_execution_receipt_v0", r => { r.program.programId = other.program.programId; });
  assert.equal(await refusal(() => attempt({ receipt: otherProgram })), "program_mismatch");
  const foreign = createReviewPolicy({ scope: { ...policy.scope, projectId: "project_other" }, author: policy.author, windows: policy.windows, budget: policy.budget });
  assert.equal(await refusal(() => attempt({ policy: foreign })), "scope_mismatch");
});

test("R20 the global set is deterministic, bounded and constant in count whatever the output length", async t => {
  const short = plan(await renderedChain(t, AB));
  // Three 4 s uses of 8 s sources: the accepted planning fixture bounds one use's trim at 4 s.
  const long = plan(await renderedChain(t, (["r3a_c", "r3a_d", "r3a_e"] as const).map(key => ({ key, seconds: 8, range: { startSeconds: 0, endSeconds: 4 } }))));
  const global = (p: ReviewPlan) => p.items.filter(i => i.purpose !== "cut_boundary").map(i => [i.purpose, i.request.window.startFrame, i.request.window.endFrame, i.request.frames]);
  assert.deepEqual(global(short), [["global_opening", 0, 30, [0, 14, 29]], ["global_interior", 15, 45, [30]], ["global_interior", 45, 75, [60]], ["global_interior", 75, 105, [90]],
    ["global_ending", 90, 120, [90, 104, 119]]]);
  assert.equal(long.facts.frames, 360);
  assert.deepEqual(global(long), [["global_opening", 0, 30, [0, 14, 29]], ["global_interior", 75, 105, [90]], ["global_interior", 165, 195, [180]], ["global_interior", 255, 285, [270]],
    ["global_ending", 330, 360, [330, 344, 359]]]);
  assert.equal(global(long).length, global(short).length, "constant count: no scaling with duration");
  assert.deepEqual(short.projection, { observations: 6, deliveredFrames: 13, decodedPixelFrames: 450 * 180 * 320, waveformBins: 180 });
});

test("R21 the review budget and the hard window bounds are enforced at planning", async t => {
  const c = await renderedChain(t, AB);
  assert.equal(await refusal(() => plan(c, policyFor(c, { budget: { maxObservations: 5 } }))), "review_budget_exceeded");
  assert.equal(await refusal(() => plan(c, policyFor(c, { budget: { maxDeliveredFrames: 12 } }))), "review_budget_exceeded");
  assert.equal(await refusal(() => plan(c, policyFor(c, { budget: { maxDecodedPixelFrames: 450 * 180 * 320 - 1 } }))), "review_budget_exceeded");
  assert.equal(plan(c, policyFor(c, { budget: { maxDecodedPixelFrames: 450 * 180 * 320 } })).items.length, 6, "exactly at the bound is within it");
  assert.equal(await refusal(() => policyFor(c, { windows: { boundaryHalfWindowFrames: REVIEW_HARD_LIMITS.maxBoundaryHalfWindowFrames + 1 } })), "review_policy_invalid");
  assert.equal(await refusal(() => policyFor(c, { windows: { interiorSamples: REVIEW_HARD_LIMITS.maxInteriorSamples + 1 } })), "review_policy_invalid");
  assert.equal(await refusal(() => policyFor(c, { budget: { maxReviewAttempts: REVIEW_HARD_LIMITS.maxReviewAttempts + 1 } })), "review_policy_invalid");
  assert.equal(await refusal(() => policyFor(c, { budget: { maxDecodeMilliseconds: REVIEW_HARD_LIMITS.maxDecodeMilliseconds + 1 } })), "review_policy_invalid");
});

// ================================================================ R22-R28 observations and their identities
test("R22 an observation summarizes exactly the decoded window: every frame, the requested thumbnails and frame-aligned waveform bins", async t => {
  const c = await renderedChain(t, AB), p = plan(c), o = observeItem(p, 0);
  EditorialObservationSchema.parse(o);
  assert.deepEqual(o.planItem, { itemIndex: 0, purpose: "cut_boundary", joinIndex: 0 });
  assert.deepEqual(o.result.frames.map(f => f.frame), Array.from({ length: 30 }, (_, k) => 45 + k));
  const summary = (frame: number) => o.result.frames.find(f => f.frame === frame)!;
  assert.deepEqual({ meanLumaMilli: summary(59).meanLumaMilli, minLuma: summary(59).minLuma, maxLuma: summary(59).maxLuma, darkPerMille: summary(59).darkPerMille,
    mad: summary(59).madFromPreviousMilli }, { meanLumaMilli: 180_000, minLuma: 180, maxLuma: 180, darkPerMille: 0, mad: 0 });
  assert.deepEqual({ mean: summary(60).meanLumaMilli, dark: summary(60).darkPerMille, mad: summary(60).madFromPreviousMilli }, { mean: 20_000, dark: 1000, mad: 160_000 });
  assert.equal(summary(45).madFromPreviousMilli, null, "the first frame of a window has no in-window predecessor");
  assert.equal(summary(60).lumaSha256, createHash("sha256").update(new Uint8Array(180 * 320).fill(20)).digest("hex"));
  assert.deepEqual(o.result.thumbnails.map(th => [th.frame, th.width, th.height, th.encoding]), [45, 59, 60, 74].map(f => [f, 25, 45, "gray8_base64url_v0"]));
  assert.deepEqual([...Buffer.from(o.result.thumbnails[2]!.data, "base64url")], Array.from({ length: 25 * 45 }, () => 20));
  assert.ok(o.result.waveform.state === "present");
  assert.deepEqual({ startSample: o.result.waveform.startSample, endSample: o.result.waveform.endSample, samplesPerBin: o.result.waveform.samplesPerBin, bins: o.result.waveform.bins.length },
    { startSample: 72_000, endSample: 120_000, samplesPerBin: 1600, bins: 30 });
  assert.deepEqual([o.result.waveform.bins[14], o.result.waveform.bins[15]], [{ peakQ15: 16_384, rmsQ15: 16_384 }, { peakQ15: 0, rmsQ15: 0 }]);
  assert.deepEqual({ decodedFrames: o.acquisition.decodedFrames, decodedPixelFrames: o.acquisition.decodedPixelFrames, deliveredFrames: o.acquisition.deliveredFrames },
    { decodedFrames: 75, decodedPixelFrames: 75 * 180 * 320, deliveredFrames: 4 });
  assert.ok(bytesOf(o) <= REVIEW_HARD_LIMITS.maxObservationBytes);
});

test("R23 one observation binds exactly one media identity; its computation identity excludes lineage and scope", async t => {
  const output = { contentHash: "b".repeat(64), sizeBytes: 150_001 };
  const c1 = await renderedChain(t, AB, { output }), c2 = await renderedChain(t, AB, { output, graph: { look: { look: "warm", intensityPerMille: 0, target: [0] } } });
  const p1 = plan(c1), p2 = plan(c2);
  assert.notEqual(p1.planId, p2.planId);
  const o1 = observeItem(p1, 0), o2 = observeItem(p2, 0);
  assert.equal(o1.computationId, o2.computationId, "the same bytes and the same request are the same computation, whatever render produced them");
  assert.notEqual(o1.observationId, o2.observationId, "the records keep their own lineage");
  assert.ok(o1.media.kind === "rendered_output" && o2.media.kind === "rendered_output");
  assert.deepEqual([o1.media.receiptId, o2.media.receiptId], [c1.receipt.receiptId, c2.receipt.receiptId]);
  assert.deepEqual({ kind: o1.media.kind, contentHash: o1.media.contentHash, sizeBytes: o1.media.sizeBytes, qc: o1.media.qcReceiptId },
    { kind: "rendered_output", contentHash: output.contentHash, sizeBytes: output.sizeBytes, qc: c1.qc.qcReceiptId });
  // A staged source is its own media identity, bound to the render input that consumed it.
  const input = p1.inputs.find(i => i.contentHash === hashOf("r3a_a"))!;
  const request: ObservationRequest = { window: { startFrame: 50, endFrame: 60 }, frames: [55], audio: "window" };
  const decoded = { video: yuvFrames({ width: 90, height: 160, first: 50, count: 10, luma: () => 100 }),
    audio: f32Audio({ channels: 2, first: 50 * 1600, count: 10 * 1600, sample: () => 0.25 }) };
  const s = buildObservation({ plan: p1, target: { kind: "staged_source", inputSlot: input.inputSlot, request }, decoded, transcripts: [], acquisition: SYNTHETIC });
  assert.deepEqual(s.media, { kind: "staged_source", assetId: assetOf("r3a_a"), contentHash: hashOf("r3a_a"), sizeBytes: input.sizeBytes, stagedObjectId: input.stagedObjectId,
    container: "mov", inputSlot: input.inputSlot, receiptId: c1.receipt.receiptId, programId: c1.program.programId });
  assert.deepEqual(s.facts, { frames: 120, frameRate: { numerator: 30, denominator: 1 }, width: 90, height: 160, audio: { state: "present", sampleRateHz: 48_000, channels: 2 } });
  assert.equal(s.planItem, null);
  assert.notEqual(s.computationId, o1.computationId);
});

test("R24 transcript words intersecting an observation keep exact lineage; words clipped by an edit are flagged; foreign transcripts are refused", async t => {
  const c = await renderedChain(t, AB), p = plan(c);
  const ta = transcript([W("early", 0.1, 0.3), W("inside", 1.8, 1.9), W("clipped", 1.9, 2.1)], { key: "r3a_a" });
  const tb = transcript([W("before", 0.9, 1.1), W("after", 1.1, 1.25), W("late", 2.5, 2.7)], { key: "r3a_b" });
  const o = observeItem(p, 0, { transcripts: [ta, tb] });
  assert.ok(o.result.transcript.state === "present");
  assert.deepEqual(o.result.transcript.words.map(w => [w.text, w.segmentPosition, w.coverage, w.coverageBasis, w.transcriptEvidenceId === ta.transcriptEvidenceId ? "a" : "b", w.entryIndex]), [
    ["inside", 0, "whole", "segment_selection", "a", 1], ["clipped", 0, "clipped_end", "segment_selection", "a", 2],
    ["before", 1, "clipped_start", "segment_selection", "b", 0], ["after", 1, "whole", "segment_selection", "b", 1]]);
  assert.deepEqual(o.transcriptJoin.state === "joined" ? o.transcriptJoin.transcriptEvidenceIds : [], [ta.transcriptEvidenceId, tb.transcriptEvidenceId].sort());
  const without = observeItem(p, 0);
  assert.deepEqual([without.result.transcript.state, without.transcriptJoin.state], ["not_supplied", "none"]);
  assert.notEqual(without.computationId, o.computationId, "a transcript join is part of the computation");
  // Only transcripts of media inside the window join: a supplied transcript never silently widens another window's identity.
  const opening = p.items.findIndex(i => i.purpose === "global_opening");
  const onlyA = observeItem(p, opening, { transcripts: [ta, tb] });
  assert.deepEqual(onlyA.transcriptJoin.state === "joined" ? onlyA.transcriptJoin.transcriptEvidenceIds : [], [ta.transcriptEvidenceId]);
  assert.equal(await refusal(() => observeItem(p, 0, { transcripts: [transcript(SPEECH, { key: "r3a_e" })] })), "transcript_source_mismatch", "not a source of this render");
  assert.equal(await refusal(() => observeItem(p, 0, { transcripts: [transcript([W("x", 1, 1.1)], { key: "r3a_a", seconds: 5 })] })), "transcript_source_mismatch",
    "longer than its source");
  // A source observation intersects the source timeline directly, relative to its window.
  const input = p.inputs.find(i => i.contentHash === hashOf("r3a_a"))!;
  const s = buildObservation({ plan: p, target: { kind: "staged_source", inputSlot: input.inputSlot, request: { window: { startFrame: 54, endFrame: 60 }, frames: [], audio: "none" } },
    decoded: { video: yuvFrames({ width: 90, height: 160, first: 54, count: 6, luma: () => 90 }), audio: null }, transcripts: [ta], acquisition: SYNTHETIC });
  assert.ok(s.result.transcript.state === "present");
  assert.deepEqual(s.result.transcript.words.map(w => [w.text, w.segmentPosition, w.coverage, w.coverageBasis]), [["inside", null, "whole", "observation_window"],
    ["clipped", null, "clipped_end", "observation_window"]]);
});

test("R25 no path, URL or location authority appears in any plan or observation, and strict records refuse extra keys", async t => {
  const c = await renderedChain(t, AB), p = plan(c), observations = observeAll(p, { transcripts: [transcript(SPEECH)] });
  for (const record of [p, ...observations]) {
    assert.equal(allStrings(record).filter(s => LOCATION.test(s)).length, 0);
    for (const key of allKeys(record)) assert.doesNotMatch(key, /(path|url|uri|command|filename|argv)$/i, key);
  }
  assert.throws(() => EditorialObservationSchema.parse({ ...observations[0]!, localPath: "C:\\runtime\\render-outputs\\x.mp4" }));
  assert.throws(() => ReviewPlanSchema.parse({ ...p, outputPath: "/tmp/x.mp4" }));
});

test("R26 decoded bytes that are not exactly the requested window, and requests beyond the hard bounds, are refused", async t => {
  const c = await renderedChain(t, AB), p = plan(c), request = p.items[0]!.request, decoded = decodedFor(p, request);
  const build = (patch: { decoded?: unknown; target?: ObservationTarget }) => buildObservation({ plan: p, target: patch.target ?? itemTarget(0),
    decoded: (patch.decoded ?? decoded) as never, transcripts: [], acquisition: SYNTHETIC });
  const drill = (r: ObservationRequest) => build({ target: { kind: "rendered_drill_down", request: r } });
  assert.equal(await refusal(() => build({ decoded: { ...decoded, video: decoded.video.subarray(1) } })), "observation_decode_invalid");
  assert.equal(await refusal(() => build({ decoded: { ...decoded, audio: decoded.audio!.subarray(4) } })), "observation_decode_invalid");
  assert.equal(await refusal(() => build({ decoded: { ...decoded, audio: null } })), "observation_decode_invalid", "requested audio is required");
  assert.equal(await refusal(() => build({ target: itemTarget(99) })), "observation_request_invalid", "no such plan item");
  assert.equal(await refusal(() => drill({ ...request, frames: [44] })), "observation_request_invalid", "a frame outside the window");
  assert.equal(await refusal(() => drill({ ...request, frames: [59, 45] })), "observation_request_invalid", "frames are sorted and unique");
  assert.equal(await refusal(() => drill({ ...request, window: { startFrame: 110, endFrame: 121 } })), "observation_request_invalid", "beyond the output");
  assert.equal(await refusal(() => drill({ window: { startFrame: 0, endFrame: REVIEW_HARD_LIMITS.maxObservationWindowFrames + 1 }, frames: [], audio: "none" })),
    "observation_request_invalid");
  assert.equal(await refusal(() => drill({ ...request, frames: Array.from({ length: REVIEW_HARD_LIMITS.maxFramesPerObservation + 1 }, (_, k) => 45 + k) })),
    "observation_request_invalid");
  assert.equal(await refusal(() => build({ target: { kind: "staged_source", inputSlot: 9, request } })), "observation_request_invalid", "no such render input");
});

test("R27 computation identity: same truthful dependencies are equal; content, interval, semantics, observer and transcript each change it", () => {
  const DECODER = { kind: "pinned_ffmpeg" as const, ffmpegSha256: "a".repeat(64) };
  const media = { kind: "rendered_output" as const, contentHash: "c".repeat(64), sizeBytes: 1000 };
  const req: ObservationRequest = { window: { startFrame: 45, endFrame: 75 }, frames: [45, 59, 60, 74], audio: "window" };
  const base = observationComputationIdOf({ media, request: req, transcriptJoin: { state: "none" }, decoder: DECODER });
  assert.match(base, /^editorial_observation_computation_v0_[a-f0-9]{64}$/);
  assert.equal(observationComputationIdOf({ media: { ...media }, request: structuredClone(req), transcriptJoin: { state: "none" }, decoder: DECODER }), base);
  const variants = {
    content: observationComputationIdOf({ media: { ...media, contentHash: "d".repeat(64) }, request: req, transcriptJoin: { state: "none" }, decoder: DECODER }),
    size: observationComputationIdOf({ media: { ...media, sizeBytes: 1001 }, request: req, transcriptJoin: { state: "none" }, decoder: DECODER }),
    kind: observationComputationIdOf({ media: { ...media, kind: "staged_source" }, request: req, transcriptJoin: { state: "none" }, decoder: DECODER }),
    interval: observationComputationIdOf({ media, request: { ...req, window: { startFrame: 44, endFrame: 75 } }, transcriptJoin: { state: "none" }, decoder: DECODER }),
    frames: observationComputationIdOf({ media, request: { ...req, frames: [45, 60] }, transcriptJoin: { state: "none" }, decoder: DECODER }),
    audio: observationComputationIdOf({ media, request: { ...req, audio: "none" }, transcriptJoin: { state: "none" }, decoder: DECODER }),
    semantics: observationComputationIdOf({ media, request: req, transcriptJoin: { state: "none" }, decoder: DECODER }, { semanticsDigest: "f".repeat(64), observer: OBSERVER_IMPLEMENTATION }),
    observer: observationComputationIdOf({ media, request: req, transcriptJoin: { state: "none" }, decoder: DECODER }, { semanticsDigest: OBSERVATION_SEMANTICS_DIGEST,
      observer: { ...OBSERVER_IMPLEMENTATION, version: "0.2.0" } }),
    transcript: observationComputationIdOf({ media, request: req, transcriptJoin: { state: "joined", transcriptEvidenceIds: [transcript(SPEECH).transcriptEvidenceId],
      mapping: { kind: "source_timeline" } }, decoder: DECODER }),
    decoder: observationComputationIdOf({ media, request: req, transcriptJoin: { state: "none" }, decoder: { kind: "synthetic_test_bytes" } }),
  };
  for (const [name, id] of Object.entries(variants)) assert.notEqual(id, base, name);
  assert.equal(new Set(Object.values(variants)).size, Object.keys(variants).length);
});

test("R28 the observation cache reuses a result only under the same computation identity and never serves a stale or mismatched entry", async t => {
  const output = { contentHash: "b".repeat(64), sizeBytes: 150_001 };
  const c1 = await renderedChain(t, AB, { output }), c2 = await renderedChain(t, AB, { output, graph: { look: { look: "warm", intensityPerMille: 0, target: [0] } } });
  const p1 = plan(c1), p2 = plan(c2), cache = new ObservationCache(), first = observeItem(p1, 0);
  assert.equal(cache.lookup(first.computationId), undefined);
  cache.store(first);
  const hit = cache.lookup(first.computationId);
  assert.ok(hit !== undefined);
  const reused = reuseObservation(hit, { plan: p2, target: itemTarget(0), transcripts: [] });
  EditorialObservationSchema.parse(reused);
  assert.deepEqual({ result: reused.result, computationId: reused.computationId }, { result: first.result, computationId: first.computationId });
  assert.deepEqual(reused.acquisition, { basis: "reused_by_computation_identity_v0", decodedFrames: 0, decodedPixelFrames: 0, deliveredFrames: 4, tool: null,
    reusedFrom: { observationId: first.observationId, basis: first.acquisition.basis } });
  assert.ok(reused.media.kind === "rendered_output");
  assert.equal(reused.media.receiptId, c2.receipt.receiptId, "the reused record is bound to the new lineage");
  assert.deepEqual(cache.stats(), { hits: 1, misses: 1, entries: 1 });
  // A different request never receives a cached result; a tampered entry is refused.
  assert.equal(await refusal(() => reuseObservation(hit, { plan: p2, target: itemTarget(1), transcripts: [] })), "observation_cache_mismatch");
  const tampered = reidentify(first, "observationId", "editorial_observation_v0", o => { o.computationId = `editorial_observation_computation_v0_${"0".repeat(64)}`; });
  assert.equal(await refusal(() => cache.store(tampered)), "observation_invalid");
});

// ================================================================ R29-R37 the critic foundation
interface ReviewInputs { c: RenderedChain; policy: ReviewPolicy; p: ReviewPlan; observations: EditorialObservation[] }
async function reviewInputs(t: TestContext, o: Synthetic & { policy?: PolicyPatch } = {}): Promise<ReviewInputs> {
  const c = await renderedChain(t, AB), policy = policyFor(c, o.policy ?? {}), p = plan(c, policy);
  return { c, policy, p, observations: observeAll(p, o) };
}
const review = (x: ReviewInputs, patch: Record<string, unknown> = {}) =>
  runCriticReview({ dag: x.c.v, artifacts: x.c.artifacts, receipt: x.c.receipt, qc: x.c.qc, policy: x.policy, observations: x.observations, attempt: 1, ...patch } as never);

test("R29 technical QC stays a distinct, exactly linked authority: the critic never re-runs, relabels or bypasses it", async t => {
  const x = await reviewInputs(t), report = await review(x);
  CriticReportSchema.parse(report);
  assert.deepEqual(report.technicalQc, { qcReceiptId: x.c.qc.qcReceiptId, verdict: "pass", qcScope: "technical_media_qc_only_not_semantic_or_editing_quality" });
  assert.equal(report.separation, "technical_qc_is_objective_media_correctness_critic_is_editorial_evidence_v0");
  const checkIds = report.findings.flatMap(f => f.producer.kind === "deterministic_check" ? [f.producer.checkId as string] : []);
  for (const id of QC_CHECKS) assert.equal(checkIds.includes(id), false, id);
  assert.deepEqual([...CRITIC_DIMENSIONS], ["story", "material_selection", "coherence", "emotion", "reaction_timing", "pacing", "rhythm", "music_sync", "trim_timing", "continuity",
    "motion_continuity", "eye_trace", "subject_coverage", "visual_variety", "technical_quality", "reference_fidelity", "style", "sound", "graphics", "user_client_requirements",
    "over_editing", "under_editing"]);
  const failing = await renderedChain(t, AB, { qc: "fail" });
  assert.equal(await refusal(() => review(x, { receipt: failing.receipt, qc: failing.qc, dag: failing.v, artifacts: failing.artifacts, policy: policyFor(failing) })), "technical_qc_failed");
  assert.equal(await refusal(() => review(x, { qc: undefined })), "technical_qc_missing");
});

test("R30 deterministic checks report only mechanical measurements; no finding is not a pass", async t => {
  const x = await reviewInputs(t), report = await review(x);
  assert.deepEqual(report.findings.map(f => ({ check: f.producer.kind === "deterministic_check" ? f.producer.checkId : null, dimension: f.dimension, severity: f.severity, basis: f.basis,
    affectedOutput: f.affectedOutput, joinIndex: f.joinIndex, measurement: f.measurement })), [
    { check: "audio_level_step_at_cut", dimension: "sound", severity: "info", basis: "measured", affectedOutput: { startFrame: 57, endFrame: 63 }, joinIndex: 0,
      measurement: { quantity: "settled_rms_q15_before_after", values: [16_384, 0], unit: "rms_q15" } },
    { check: "near_black_frames", dimension: "technical_quality", severity: "info", basis: "measured", affectedOutput: { startFrame: 60, endFrame: 75 }, joinIndex: null,
      measurement: { quantity: "observed_near_black_frames", values: [15, 60, 75], unit: "frames" } }]);
  for (const f of report.findings) {
    assert.ok(f.evidenceRefs.length >= 1 && f.evidenceRefs.length <= 8);
    assert.deepEqual(f.repair, { state: "not_computed", reasonCode: "repair_planning_not_in_gate7_batch3a" });
    assert.deepEqual(f.uncertainty, { state: "unknown", reasonCode: "uncalibrated_mechanical_signal_not_an_editorial_judgment", evidenceRefs: [] });
    assert.ok(f.producer.kind === "deterministic_check" && f.producer.rule === DETERMINISTIC_CHECKS[f.producer.checkId].rule);
  }
  const clean = await review(await reviewInputs(t, { luma: () => 180, sample: () => 0.5 }));
  assert.deepEqual(clean.findings, [], "the control has no mechanical signal");
  const assessed = Object.fromEntries(clean.dimensions.map(d => [d.dimension, d.assessment]));
  assert.deepEqual({ technical: assessed["technical_quality"], sound: assessed["sound"], story: assessed["story"], pacing: assessed["pacing"] },
    { technical: "deterministic_checks", sound: "deterministic_checks", story: "not_computed", pacing: "not_computed" });
  assert.equal(clean.coverage.scope, "sampled_boundaries_and_global_windows_only_not_whole_output_v0");
  assert.deepEqual(clean.coverage.items.map(i => i.observed), [true, true, true, true, true, true]);
  assert.equal(clean.evidenceBasis, "includes_synthetic_test_bytes", "synthetic test bytes are never relabelled decoded media");
});

test("R31 every observation must be of this exact output, taken for this plan, at a planned window", async t => {
  const x = await reviewInputs(t), other = await reviewInputs(t);
  assert.notEqual(other.c.receipt.receiptId, x.c.receipt.receiptId);
  const foreign = observeAll(plan(await renderedChain(t, ABCD)))[0]!;
  assert.equal(await refusal(() => review(x, { observations: [...x.observations.slice(1), foreign] })), "observation_not_in_plan");
  assert.equal(await refusal(() => review(x, { observations: other.observations })), "observation_not_in_plan", "another receipt of the same edit");
  const moved = reidentify(x.observations[0]!, "observationId", "editorial_observation_v0", o => { o.request = { ...o.request, window: { startFrame: 46, endFrame: 76 } }; });
  assert.equal(await refusal(() => review(x, { observations: [moved, ...x.observations.slice(1)] })), "observation_invalid", "its computation no longer matches");
  assert.equal(await refusal(() => review(x, { observations: [...x.observations, x.observations[0]!] })), "critic_input_invalid", "a duplicated observation");
  // Missing observations are coverage gaps, never passes.
  const partial = await review(x, { observations: x.observations.slice(1) });
  assert.deepEqual(partial.coverage.items.map(i => i.observed), [false, true, true, true, true, true]);
  assert.equal(partial.findings.some(f => f.joinIndex === 0), false, "an unobserved boundary yields no finding and no pass");
});

test("R32 the semantic port receives bounded, frozen, location-free evidence and returns only validated, evidence-bound findings", async t => {
  const ta = transcript([W("clipped", 1.9, 2.1)], { key: "r3a_a" }), x = await reviewInputs(t, { transcripts: [ta] }), critic = new SyntheticFixtureCritic();
  const report = await review(x, { port: critic, transcripts: [{ evidence: ta, pack: buildTranscriptPack(ta, PACK_POLICY) }] });
  assert.deepEqual(report.semanticCritic, { state: "present", criticId: "synthetic_fixture_critic", version: "0.1.0", basis: "synthetic_fixture" });
  const semantic = report.findings.filter(f => f.producer.kind === "semantic_critic");
  assert.deepEqual(semantic.map(f => ({ dimension: f.dimension, severity: f.severity, basis: f.basis, joinIndex: f.joinIndex, measurement: f.measurement, uncertainty: f.uncertainty.state })),
    [{ dimension: "trim_timing", severity: "minor", basis: "model_assessed", joinIndex: 0, measurement: null, uncertainty: "qualitative" }]);
  const input = critic.seen[0]!;
  assert.ok(Object.isFrozen(input) && Object.isFrozen(input.observations) && Object.isFrozen(input.observations[0]!.observation));
  assert.deepEqual({ output: input.output.contentHash, graph: input.editGraph.editGraphId, limits: input.limits },
    { output: x.c.receipt.output.contentHash, graph: x.c.v.dag.graph.editGraphId, limits: { maxFindings: 32, maxExplanationCharacters: 400 } });
  assert.equal(allStrings(input).filter(s => LOCATION.test(s)).length, 0);
  const functions = (value: unknown): number => typeof value === "function" ? 1 : Array.isArray(value) ? value.reduce((n: number, v) => n + functions(v), 0)
    : value !== null && typeof value === "object" ? Object.values(value).reduce((n: number, v) => n + functions(v), 0) : 0;
  assert.equal(functions(input), 0, "the port receives data, never a capability");
  assert.deepEqual(input.transcripts.map(tr => tr.transcriptEvidenceId), [ta.transcriptEvidenceId]);
  const assessed = Object.fromEntries(report.dimensions.map(d => [d.dimension, d.assessment]));
  assert.equal(assessed["trim_timing"], "semantic_critic");
});

test("R33 a finding needs resolvable evidence of this review, exact output bounds and bounded text; the port cannot widen its authority", async t => {
  const x = await reviewInputs(t, { luma: () => 180, sample: () => 0.5 });
  const port = (findings: ((input: SemanticCriticInput) => unknown)[], extra: Record<string, unknown> = {}): SemanticCriticPort => ({
    identity: { criticId: "hostile_fixture", version: "0.1.0", basis: "synthetic_fixture" },
    assess: async input => ({ dimensionsAssessed: ["pacing"], findings: findings.map(f => f(input)), ...extra }) });
  const good = (input: SemanticCriticInput) => ({ dimension: "pacing", severity: "minor", joinIndex: null, affectedOutput: { startFrame: 0, endFrame: 30 },
    evidenceRefs: [{ artifact: input.observations[1]!.artifact, pointer: "/result/frames/0" }], explanation: "The opening feels slow (synthetic).",
    uncertainty: { state: "qualitative", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [] } });
  const with_ = (patch: Record<string, unknown>) => (input: SemanticCriticInput) => ({ ...good(input), ...patch });
  const accepted = await review(x, { port: port([good]) });
  assert.equal(accepted.findings.filter(f => f.producer.kind === "semantic_critic").length, 1);
  const variants: [string, (input: SemanticCriticInput) => unknown][] = [
    ["no evidence", with_({ evidenceRefs: [] })],
    ["unresolvable pointer", i => ({ ...good(i), evidenceRefs: [{ artifact: i.observations[1]!.artifact, pointer: "/result/frames/999" }] })],
    ["pointer outside the result", i => ({ ...good(i), evidenceRefs: [{ artifact: i.observations[1]!.artifact, pointer: "/media/contentHash" }] })],
    ["foreign artifact", i => ({ ...good(i), evidenceRefs: [{ artifact: { ...i.observations[1]!.artifact, sha256: "0".repeat(64) }, pointer: "/result/frames/0" }] })],
    ["outside the output", with_({ affectedOutput: { startFrame: 110, endFrame: 121 } })],
    ["unknown dimension", with_({ dimension: "virality" })],
    ["oversized explanation", with_({ explanation: "x".repeat(401) })],
    ["claims measurement", with_({ basis: "measured" })],
    ["carries a measurement", with_({ measurement: { quantity: "q", values: [1], unit: "frames" } })],
    ["numeric confidence", with_({ uncertainty: { state: "calibrated", reasonCode: "x", evidenceRefs: [] } })],
    ["unreviewed join", with_({ joinIndex: 7 })],
  ];
  for (const [label, finding] of variants) assert.equal(await refusal(() => review(x, { port: port([finding]) })), "critic_response_invalid", label);
  assert.equal(await refusal(() => review(x, { port: port([], { graphDiff: { operations: [] } }) })), "critic_response_invalid", "a repair or graph change is not a response field");
  assert.equal(await refusal(() => review(x, { port: port(Array.from({ length: 33 }, () => good)) })), "critic_response_invalid", "more findings than the input allows");
  const mutating: SemanticCriticPort = { identity: { criticId: "mutating_fixture", version: "0.1.0", basis: "synthetic_fixture" },
    assess: async input => { (input.observations as unknown[]).push({}); return { dimensionsAssessed: [], findings: [] }; } };
  assert.equal(await refusal(() => review(x, { port: mutating })), "critic_port_failed");
  const throwing: SemanticCriticPort = { identity: { criticId: "throwing_fixture", version: "0.1.0", basis: "synthetic_fixture" }, assess: async () => { throw new Error("provider down"); } };
  assert.equal(await refusal(() => review(x, { port: throwing })), "critic_port_failed");
});

test("R34 the critic cannot mutate the EditGraph or any accepted artifact, and returns only data", async t => {
  const x = await reviewInputs(t), graph = x.c.x.artifacts.find(a => a.ref.artifactType === "EditGraph")!;
  const state = () => ({ sha: createHash("sha256").update(graph.bytes).digest("hex"), value: canonicalSerialize(graph.value), receipt: canonicalSerialize(x.c.receipt),
    qc: canonicalSerialize(x.c.qc), dag: canonicalSerialize(x.c.v.dag) });
  const before = state(), report = await review(x, { port: new SyntheticFixtureCritic() });
  assert.deepEqual(state(), before);
  assert.equal(allKeys(report).has("graphDiff") || allKeys(report).has("operations") || allKeys(report).has("argv"), false);
  assert.deepEqual(report.editGraph, { editGraphId: x.c.v.dag.graph.editGraphId, revision: 0, artifact: x.c.v.dag.editGraph });
});

test("R35 an unsupported semantic claim can never become a deterministic fact", async t => {
  const x = await reviewInputs(t, { luma: () => 180, sample: () => 0.5 });
  const claim: SemanticCriticPort = { identity: { criticId: "claiming_fixture", version: "0.1.0", basis: "synthetic_fixture" }, assess: async input => ({ dimensionsAssessed: ["story", "emotion"],
    findings: [{ dimension: "story", severity: "major", joinIndex: 0, affectedOutput: { startFrame: 55, endFrame: 65 },
      evidenceRefs: [{ artifact: input.observations[0]!.artifact, pointer: "/result/frames/15" }], explanation: "The story beat lands poorly (synthetic assessment).",
      uncertainty: { state: "unknown", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [] } }] }) };
  const report = await review(x, { port: claim });
  const [finding] = report.findings;
  assert.ok(finding !== undefined);
  assert.deepEqual({ basis: finding.basis, producer: finding.producer.kind, measurement: finding.measurement, uncertainty: finding.uncertainty.state },
    { basis: "model_assessed", producer: "semantic_critic", measurement: null, uncertainty: "unknown" });
  // The schema ties the basis to the producer: a model-assessed finding cannot be re-identified as a measured one.
  assert.throws(() => CriticReportSchema.parse(reidentify(report, "reportId", "critic_report_v0", r => { r.findings[0]!.basis = "measured"; })));
  assert.throws(() => CriticReportSchema.parse(reidentify(report, "reportId", "critic_report_v0", r => { r.findings[0]!.producer = { kind: "deterministic_check",
    checkId: "near_black_frames", rule: DETERMINISTIC_CHECKS.near_black_frames.rule }; })));
  const assessed = Object.fromEntries(report.dimensions.map(d => [d.dimension, d.assessment]));
  assert.deepEqual({ story: assessed["story"], emotion: assessed["emotion"] }, { story: "semantic_critic", emotion: "semantic_critic" });
});

test("R36 the review budget bounds attempts, evidence bytes, findings and transcript text", async t => {
  const x = await reviewInputs(t);
  assert.equal(await refusal(() => review(x, { attempt: 3 })), "review_attempts_exhausted");
  assert.equal(await refusal(() => review(x, { attempt: 0 })), "critic_input_invalid");
  assert.equal((await review(x, { attempt: 2 })).attempt.attempt, 2);
  const withPolicy = (budget: Partial<ReviewPolicy["budget"]>) => ({ ...x, policy: policyFor(x.c, { budget }) });
  assert.equal(await refusal(() => review(withPolicy({ maxEvidenceBytes: 1000 }))), "review_budget_exceeded", "evidence bytes");
  assert.equal(await refusal(() => review(withPolicy({ maxFindings: 1 }))), "review_budget_exceeded", "two measured findings exceed a budget of one");
  const long = transcript(Array.from({ length: 400 }, (_, i) => W(`word${i}`, i * 0.009, i * 0.009 + 0.008)), { key: "r3a_a" });
  assert.equal(await refusal(() => review(withPolicy({ maxTranscriptCharacters: 100 }), { transcripts: [{ evidence: long, pack: buildTranscriptPack(long, PACK_POLICY) }],
    port: new SyntheticFixtureCritic() })), "review_budget_exceeded", "transcript text");
  const report = await review(x);
  assert.deepEqual(report.budget, { observations: 6, deliveredFrames: 13, decodedPixelFrames: 450 * 180 * 320, evidenceBytes: x.observations.reduce((n, o) => n + bytesOf(o), 0),
    findings: 2, transcriptCharacters: 0 });
});

test("R37 without a port the semantic critic is explicitly not computed; with one, no provider or network exists behind the boundary", async t => {
  const x = await reviewInputs(t), report = await review(x);
  assert.deepEqual(report.semanticCritic, { state: "not_computed", reasonCode: "no_semantic_critic_port_supplied" });
  assert.equal(report.findings.every(f => f.producer.kind === "deterministic_check"), true);
  assert.deepEqual(report.attempt, { attempt: 1, maxAttempts: 2 });
  assert.match(report.reportId, /^critic_report_v0_[a-f0-9]{64}$/);
  assert.equal((await review(x)).reportId, report.reportId, "deterministic over the same evidence");
});

// ================================================================ R38 static boundaries of the new package and adapter
test("R38 the review core is pure and provider-neutral; the observation adapter spawns only the verified pinned binary over fd-only input", () => {
  const files = readdirSync("packages/edit-review").filter(f => f.endsWith(".ts"));
  assert.deepEqual(files.sort(), ["common.ts", "critic.ts", "evidence.ts", "index.ts", "observation.ts", "review.ts", "transcript.ts"]);
  for (const file of files) {
    const text = readFileSync(join("packages/edit-review", file), "utf8");
    for (const [, specifier] of text.matchAll(/from "([^"]+)"/g)) assert.ok(specifier!.startsWith(".") || ["zod", "node:crypto"].includes(specifier!), `${file}: ${specifier}`);
    assert.doesNotMatch(text, /\b(?:openai|anthropic|claude|gemini|elevenlabs|scribe|whisper|deepgram)\b/i, file);
    assert.doesNotMatch(text, /node:fs|child_process|process\.|Date\.now|new Date|Math\.random|fetch\(/, file);
  }
  const adapter = readFileSync("scripts/edit-observation-local.ts", "utf8");
  // Assembled at run time: this pure test file must never itself contain a subprocess import the workspace audit would (rightly) flag.
  const spawnImport = ["import { spawn } from ", "\"node:", "child", "_process\";"].join("");
  assert.ok(adapter.includes(spawnImport), "the adapter imports only spawn, by name");
  assert.equal((adapter.match(/spawn\(/g) ?? []).length, 1, "one spawn site");
  assert.match(adapter, /"-protocol_whitelist", "fd"/);
  assert.doesNotMatch(adapter, /PATH|shell: true|exec\(|execFile/);
  assert.doesNotMatch(adapter, /\b(?:openai|anthropic|claude|gemini|elevenlabs)\b/i);
});

// ================================================================ R39-R44 hostile self-review regressions (written before their repairs; see batch3a-self-review-findings.md)
const PINNED = (digest: string) => ({ basis: "pinned_ffmpeg_decode_of_verified_held_object_v0" as const, tool: { ffmpegSha256: digest } });
test("R39 self-review D1: evidence from synthetic test bytes never shares a computation identity with a real decode, so it can never satisfy a real decode's cache key", async t => {
  const c = await renderedChain(t, AB), p = plan(c), cache = new ObservationCache();
  const synthetic = observeItem(p, 0);
  const real = buildObservation({ plan: p, target: itemTarget(0), decoded: decodedFor(p, p.items[0]!.request), transcripts: [], acquisition: PINNED("a".repeat(64)) });
  assert.notEqual(real.computationId, synthetic.computationId, "how a result was obtained is part of what it is");
  cache.store(synthetic);
  assert.equal(cache.lookup(real.computationId), undefined, "a real decode is never served synthetic summaries");
});

test("R40 self-review D2: the decoder build binds the computation identity of decoded evidence", async t => {
  const c = await renderedChain(t, AB), p = plan(c);
  const build = (digest: string) => buildObservation({ plan: p, target: itemTarget(0), decoded: decodedFor(p, p.items[0]!.request), transcripts: [], acquisition: PINNED(digest) });
  assert.notEqual(build("a".repeat(64)).computationId, build("b".repeat(64)).computationId, "another decoder build is another computation");
  assert.equal(build("a".repeat(64)).computationId, build("a".repeat(64)).computationId);
});

test("R41 self-review D3: a finding cannot be re-attached to a report about other output bytes", async t => {
  const x = await reviewInputs(t), report = await review(x);
  assert.ok(report.findings.length > 0);
  const moved = reidentify(report, "reportId", "critic_report_v0", r => { r.render = { ...r.render, contentHash: "e".repeat(64), outputArtifactId: `render_output_artifact_v0_${"e".repeat(64)}` }; });
  assert.throws(() => CriticReportSchema.parse(moved), "findings about one output never validate inside a report about another");
  // Added with the D3 repair: each finding itself names the exact output it is about and the review implementation.
  for (const f of report.findings) assert.deepEqual({ output: f.output, reviewer: f.reviewer }, { output: { outputArtifactId: report.render.outputArtifactId,
    contentHash: report.render.contentHash, sizeBytes: report.render.sizeBytes }, reviewer: report.implementation });
});

test("R42 self-review D4: the decoded-pixel and delivered-frame budgets bound every observation of a review, drill-downs included", async t => {
  const c = await renderedChain(t, AB), exact = policyFor(c, { budget: { maxDecodedPixelFrames: 450 * 180 * 320, maxDeliveredFrames: 13 } }), p = plan(c, exact);
  const planned = observeAll(p);
  const drill = buildObservation({ plan: p, target: { kind: "rendered_drill_down", request: { window: { startFrame: 90, endFrame: 120 }, frames: [], audio: "window" } },
    decoded: decodedFor(p, { window: { startFrame: 90, endFrame: 120 }, frames: [], audio: "window" }), transcripts: [], acquisition: SYNTHETIC });
  const reviewWith = (observations: EditorialObservation[]) => runCriticReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy: exact, observations, attempt: 1 });
  assert.equal((await reviewWith(planned)).budget.decodedPixelFrames, 450 * 180 * 320, "exactly at the budget");
  assert.equal(await refusal(() => reviewWith([...planned, drill])), "review_budget_exceeded", "one more drill-down decode exceeds the decoded-pixel budget");
  const oneFrame = buildObservation({ plan: p, target: { kind: "rendered_drill_down", request: { window: { startFrame: 0, endFrame: 1 }, frames: [0], audio: "none" } },
    decoded: decodedFor(p, { window: { startFrame: 0, endFrame: 1 }, frames: [0], audio: "none" }), transcripts: [], acquisition: SYNTHETIC });
  const deliveredOnly = policyFor(c, { budget: { maxDeliveredFrames: 13 } }), q = plan(c, deliveredOnly);
  assert.equal(await refusal(() => runCriticReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy: deliveredOnly,
    observations: [...observeAll(q), reuseObservation(oneFrame, { plan: q, target: { kind: "rendered_drill_down", request: oneFrame.request }, transcripts: [] })], attempt: 1 })),
  "review_budget_exceeded", "a fourteenth delivered frame exceeds the delivered-frame budget");
});

test("R43 self-review D5: a semantic finding's uncertainty may cite only evidence of this review", async t => {
  const x = await reviewInputs(t, { luma: () => 180, sample: () => 0.5 });
  const foreign = { artifact: { objectId: "editorial_observation_v0_foreign", sha256: "0".repeat(64), artifactType: "EditorialObservation", artifactVersion: "0.1.0" }, pointer: "/result/frames/0" };
  const port: SemanticCriticPort = { identity: { criticId: "citing_fixture", version: "0.1.0", basis: "synthetic_fixture" }, assess: async input => ({ dimensionsAssessed: ["pacing"],
    findings: [{ dimension: "pacing", severity: "minor", joinIndex: null, affectedOutput: { startFrame: 0, endFrame: 30 },
      evidenceRefs: [{ artifact: input.observations[1]!.artifact, pointer: "/result/frames/0" }], explanation: "Synthetic assessment.",
      uncertainty: { state: "qualitative", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [foreign] } }] }) };
  assert.equal(await refusal(() => review(x, { port })), "critic_response_invalid");
});

test("R44 self-review D6: a port's free text can never carry a location or URL into a report", async t => {
  const x = await reviewInputs(t, { luma: () => 180, sample: () => 0.5 });
  for (const explanation of ["Compare with C:\\Users\\editor\\take.mp4 near the cut.", "See https://example.invalid/clip for the reference.", "Footage in \\\\server\\share\\a.mov."]) {
    const port: SemanticCriticPort = { identity: { criticId: "leaking_fixture", version: "0.1.0", basis: "synthetic_fixture" }, assess: async input => ({ dimensionsAssessed: ["pacing"],
      findings: [{ dimension: "pacing", severity: "minor", joinIndex: null, affectedOutput: { startFrame: 0, endFrame: 30 },
        evidenceRefs: [{ artifact: input.observations[1]!.artifact, pointer: "/result/frames/0" }], explanation,
        uncertainty: { state: "qualitative", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [] } }] }) };
    assert.equal(await refusal(() => review(x, { port })), "critic_response_invalid", explanation);
  }
});

test("R45 self-review D8: the critic reviews under a private snapshot of the policy; a port cannot widen the caller's budget mid-review", async t => {
  const c = await renderedChain(t, AB), policy = policyFor(c, { budget: { maxFindings: 2 } }), p = plan(c, policy), observations = observeAll(p);
  const widening: SemanticCriticPort = { identity: { criticId: "widening_fixture", version: "0.1.0", basis: "synthetic_fixture" }, assess: async input => {
    (policy.budget as { maxFindings: number }).maxFindings = 10;
    return { dimensionsAssessed: ["pacing"], findings: [{ dimension: "pacing", severity: "minor", joinIndex: null, affectedOutput: { startFrame: 0, endFrame: 30 },
      evidenceRefs: [{ artifact: input.observations[1]!.artifact, pointer: "/result/frames/0" }], explanation: "Synthetic assessment.",
      uncertainty: { state: "qualitative", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [] } }] };
  } };
  assert.equal(await refusal(() => runCriticReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy, observations, port: widening, attempt: 1 })),
    "review_budget_exceeded", "two measured findings and one assessed exceed the budget of two the review was called with");
});

// ================================================================ R46 final hostile pass D10 (written before its repair; see batch3a-self-review-final-pass-findings.md)
test("R46 self-review D10: the report records exactly the attempt the review was admitted under; a port cannot rewrite it mid-review", async t => {
  const c = await renderedChain(t, AB), policy = policyFor(c), p = plan(c, policy), observations = observeAll(p);
  const input = { dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy, observations, attempt: 2, port: {
    identity: { criticId: "rewriting_fixture", version: "0.1.0", basis: "synthetic_fixture" as const },
    assess: async () => { input.attempt = 1; return { dimensionsAssessed: [], findings: [] }; } } };
  const report = await runCriticReview(input);
  assert.deepEqual(report.attempt, { attempt: 2, maxAttempts: 2 }, "the attempt admitted against the owner's bound is the attempt recorded");
});
