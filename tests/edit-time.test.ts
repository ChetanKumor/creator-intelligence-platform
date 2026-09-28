// Phase 5 Gate 7 Batch 3A-F: exact authoritative temporal semantics. Contract tests (C01-C07) state the exact-time contract over the
// accepted EditGraph -> ExecutionDag -> RenderProgram chain and pin the baseline-captured semantics the migration must preserve; they use
// only accepted public APIs. The captured values come from the unmodified baseline build (f0edbb3b), receipt
// .local-runs/phase5-gate7/batch3af-baseline-invariants.json. Everything is synthetic; nothing decodes media or starts a process.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { EditGraphError, EditGraphSchema, supplied, validateEditGraph, type EditGraph } from "../packages/edit-graph/index.js";
import { EDIT_GRAPH_RECORD_VERSION, MAX_RATE_COMPONENT, RateSchema, SourceInstantSchema, SourceRangeSchema, addTimes, canonicalTime, compareTimes, convertTime, decodeLegacySeconds, durationOf,
  exactTicks, exactTime, formatSeconds, frameTime, rangeContains, rangeIntersection, rangesAdjacent, rateOf, sameInstant, sampleTime, secondsOf, subtractTimes, tickTime,
  timestampTime, type Alignment, type ExactRange, type ExactTime } from "../packages/edit-graph/common.js";
import { frameIndexAt } from "../packages/edit-execution/index.js";
import { SuppliedArtifacts } from "../packages/edit-execution/common.js";
import { identifyDagNodes, type ExecutionDagNodeDraft } from "../packages/edit-execution/dag.js";
import { EditRuntimeError, openValidatedDag } from "../packages/edit-runtime/index.js";
import { argvDigestOf, compileFfmpegArguments, compileRenderProgram, compileRenderProgramFromDag, evaluateInputConformance, frameTableIdOf, parseProbeJson,
  type RenderProgram, type SourceFacts } from "../packages/edit-render/index.js";
import { buildObservation, createReviewPolicy, planReview, samplesPerFrame, type ObservationRequest, type ReviewPlan } from "../packages/edit-review/index.js";
import { ticksAfterFrame, ticksBeforeFrame } from "../packages/edit-review/common.js";
import { directionFixture } from "./support/planning.js";
import { TIME6, VIDEO_SUPPORTS, atMost, capabilitySnapshot, declaration, declarations, graphOf, member, plan, planningFixture, planningPolicyBody, reportOf, videoUses,
  type Planned } from "./support/edit-graph.js";
import { T7, freshExecutorBody, freshSnapshot, type DagFixture } from "./support/edit-execution.js";
import { orderedSourcesPolicy } from "./support/edit-execution-chains.js";
import { runtimeChainFixture, type RuntimeChainSource } from "./support/edit-runtime-chains.js";
import { FINAL_RENDER_RESOLUTION, REAL_ENVIRONMENT, REAL_EXECUTOR, cfrMetadata, renderDag, renderGraph } from "./support/edit-render.js";
import { deterministicBytes, sha256Hex } from "./support/edit-runtime.js";
import { f32Audio, renderedChain, yuvFrames, type RenderedChain, type SourceSpec } from "./support/edit-review.js";

// ---------------------------------------------------------------- helpers
function errorCode(run: () => unknown): string {
  try { run(); } catch (error) {
    assert.ok(error instanceof EditGraphError, `expected an owned EditGraphError, received ${String(error)}`);
    return error.code;
  }
  assert.fail("expected an owned EditGraphError");
}
const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T { if (!cache.has(key)) cache.set(key, make()); return cache.get(key) as T; }
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) allKeys(item, keys);
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); allKeys(child, keys); }
  return keys;
}
function allNumbers(value: unknown, path = "", out: [string, number][] = []): [string, number][] {
  if (typeof value === "number") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => allNumbers(item, `${path}/${i}`, out));
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) allNumbers(child, `${path}/${key}`, out);
  return out;
}
/** A canonical exact instant: `value` whole units of 1/`perSecond` s, in lowest terms. */
const T = (value: number, perSecond: number) => ({ value, rate: { numerator: perSecond, denominator: 1 } });
/** An authority record carries no floating-point seconds: no seconds-named field and no non-integer number anywhere. */
function assertNoFloatSeconds(record: unknown, label: string): void {
  const secondsKeys = [...allKeys(record)].filter(key => /seconds$/i.test(key));
  assert.deepEqual(secondsKeys, [], `${label}: seconds-named fields`);
  const fractional = allNumbers(record).filter(([, n]) => !Number.isSafeInteger(n));
  assert.deepEqual(fractional, [], `${label}: non-integer numbers`);
}

// ---------------------------------------------------------------- accepted fixtures (the definitions of the accepted Gate-6 and Batch-2B tests)
const offGridPlan = () => memo("off_grid", () => plan(planningFixture({ duration: { minimumSeconds: 1, maximumSeconds: 2, preferredSeconds: 2 },
  search: { ...planningPolicyBody.search, maximumDepth: 1 } }, directionFixture(0, false, { startSeconds: 0.13, endSeconds: 1.97 }))));
const basicPlan = () => memo("basic", () => plan(planningFixture()));
const graphAt = (p: Planned, ticksPerSecond?: number) => graphOf(p, ticksPerSecond === undefined ? {} : { profile: { clock: { ticksPerSecond } } });
const SIZE_A = 3_000_001, SIZE_B = 2_000_003, SIZE_S = 1_000_003;
const hashA = () => memo("hash_a", () => sha256Hex(deterministicBytes("gate7-batch2b-source-a", SIZE_A)));
const hashB = () => memo("hash_b", () => sha256Hex(deterministicBytes("gate7-batch2b-source-b", SIZE_B)));
const hashS = () => memo("hash_s", () => sha256Hex(deterministicBytes("gate7-batch2b-source-silent", SIZE_S)));
const srcA = (patch: Record<string, unknown> = {}) => ({ key: "b2b_a", hash: hashA(), sizeBytes: SIZE_A, metadata: cfrMetadata(), ...patch });
const srcB = () => ({ key: "b2b_b", hash: hashB(), sizeBytes: SIZE_B, metadata: cfrMetadata(), range: { startSeconds: 1, endSeconds: 3 } });
const graphA = () => memo("g_a", () => renderGraph({ sources: [srcA()] }));
const FIXTURES: Record<string, () => DagFixture> = {
  finalA: () => memo("final_a", () => renderDag(graphA())),
  previewA: () => memo("preview_a", () => renderDag(graphA(), { intent: "preview" })),
  finalAB: () => memo("final_ab", () => renderDag(renderGraph({ sources: [srcA(), srcB()], cut: true, look: { look: "warm", target: [0] } }))),
  finalWhole: () => memo("final_whole", () => renderDag(renderGraph({ sources: [srcA(), srcB()], look: { look: "contrast", intensityPerMille: 250, target: "whole_output" } }))),
  finalSilent: () => memo("final_silent", () => renderDag(renderGraph({ sources: [{ key: "b2b_s", hash: hashS(), sizeBytes: SIZE_S, metadata: cfrMetadata({ hasAudio: false }) }] }))),
  finalSeconds: () => memo("final_seconds", () => renderDag(renderGraph({ sources: [srcA({ key: "b2b_seconds", range: { startSeconds: 0.05, endSeconds: 2.05 } })] }))),
};
const programOf = (x: DagFixture): RenderProgram => compileRenderProgram(openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts), x.artifacts);
const graphOfDag = (x: DagFixture): EditGraph => x.artifacts.find(a => a.ref.objectId === x.dag.editGraph.objectId)!.value as EditGraph;

// ================================================================ C01-C04 the exact-time contract (the Architecture-V2 timebase gap)
test("C01 EditGraph authority holds no floating-point seconds: every source and output instant is an exact integer on an explicit rate", () => {
  const graphs: [string, EditGraph][] = [["basic@1e9", graphAt(basicPlan()).graph], ["offGrid@1000", graphAt(offGridPlan(), 1000).graph],
    ["offGrid@1e9", graphAt(offGridPlan()).graph], ["renderAB", graphOfDag(FIXTURES.finalAB!())]];
  for (const [label, graph] of graphs) {
    assertNoFloatSeconds(graph, label);
    for (const clip of graph.clipUses) {
      const range: unknown = clip.source.range;
      assert.ok(range !== null && typeof range === "object" && "start" in range && "end" in range, `${label}: an exact source range has exact start and end instants`);
    }
  }
});

test("C02 a Gate-5 boundary is decoded exactly at the declared graph clock into one canonical source instant, independent of that clock", () => {
  const coarse = videoUses(graphAt(offGridPlan(), 1000).graph)[0]!, fine = videoUses(graphAt(offGridPlan()).graph)[0]!;
  const offGrid = { start: T(13, 100), end: T(197, 100) };
  assert.deepEqual(coarse.source.range as unknown, offGrid, "0.13 s and 1.97 s are exactly 13/100 s and 197/100 s");
  assert.deepEqual(fine.source.range as unknown, offGrid, "the same Gate-5 instants on a finer clock are the same canonical instants");
  assert.deepEqual(videoUses(graphAt(basicPlan()).graph)[0]!.source.range as unknown, { start: T(0, 1), end: T(2, 1) });
  // Accepted Gate-6 behaviour stays: an instant the clock cannot represent is refused, never rounded.
  assert.equal(errorCode(() => graphAt(offGridPlan(), 10)), "time_not_representable");
});

test("C03 the ExecutionDag carries exact source time, and its computation identities bind exact canonical time, never float seconds", () => {
  const x = FIXTURES.finalAB!(), graph = graphOfDag(x), dag = x.dag;
  assert.equal(dag.artifactVersion as string, "0.2.0", "the ExecutionDag schema version names the exact-time record");
  assertNoFloatSeconds(dag, "ExecutionDag");
  const clips = dag.nodes.filter(n => n.kind === "source_video_clip");
  assert.equal(clips.length, 2);
  clips.forEach((node, i) => assert.deepEqual(node.source.range as unknown, videoUses(graph)[i]!.source.range as unknown, "copied exactly from the EditGraph"));
});

test("C04 a legacy float-second EditGraph 0.1.0 is refused with an explicit version error and is never reinterpreted", () => {
  const legacy: unknown = JSON.parse(readFileSync("tests/fixtures/edit-graph-0.1.0-float-seconds.json", "utf8"));
  // The fixture is exactly what the accepted baseline built for the off-grid decision at 1000 ticks per second.
  assert.equal((legacy as { editGraphId: string }).editGraphId, "edit_graph_v0_80f58c4239cdbdd40ebd75fff2e61a8ff7afeb53356339716a98def53f39b970");
  assert.deepEqual((legacy as { clipUses: { source: { range: unknown } }[] }).clipUses[0]!.source.range, { startSeconds: 0.13, endSeconds: 1.97 });
  const g = graphAt(offGridPlan(), 1000);
  assert.equal(EditGraphSchema.safeParse(legacy).success, false, "the current schema never parses a legacy float-second graph");
  assert.equal(errorCode(() => validateEditGraph(legacy, g.artifacts)), "graph_version_unsupported");
  assert.equal(g.graph.artifactVersion as string, "0.2.0", "the rebuilt graph is the exact-time schema");
});

// ================================================================ C05-C07 preserved semantics (baseline-captured; unchanged by the migration)
test("C05 render compilation keeps exact integer authority until the FFmpeg boundary, where time is only integer frames, samples and exact grids", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    const program = programOf(fixture());
    assert.deepEqual(allNumbers(program).filter(([, n]) => !Number.isSafeInteger(n)), [], `${name}: program numbers`);
    const { argv } = compileFfmpegArguments(program, { maxOutputBytes: 64 * 1024 * 1024 });
    for (const option of ["-ss", "-sseof", "-t", "-to", "-itsoffset", "-start_time", "-r"]) assert.equal(argv.includes(option), false, `${name}: ${option}`);
    const graph = argv[argv.indexOf("-filter_complex") + 1]!;
    const timeArguments = graph.split(/[;,]/).filter(step => /(?:^|\])(?:a?trim|a?settb|a?setpts)=/.test(step));
    assert.ok(timeArguments.length >= 3, `${name}: time-bearing filter steps are present`);
    for (const step of timeArguments) {
      assert.match(step, /(?:trim=start_frame=\d+:end_frame=\d+|atrim=start_sample=\d+:end_sample=\d+|settb=expr=\d+\/\d+|asettb=expr=1\/\d+|setpts=PTS-STARTPTS|asetpts=PTS-STARTPTS)(?:\[[a-z0-9_]+\])?$/,
        `${name}: ${step}`);
      assert.doesNotMatch(step, /\d\.\d/, `${name}: no decimal time in ${step}`);
    }
  }
});

type Segment = [precision: string, startFrame: number, endFrame: number, audio: [number, number] | null, segmentComputationId: string];
const S = (hex: string) => `render_segment_computation_v0_${hex}`;
const TABLE_30 = "source_frame_times_v0_a1472cea3ced240f17659868ed7879a0a59adc36191d978ab03d86476926ad23";
/** Captured from the unmodified baseline (batch3af-baseline-invariants.json): program intervals, segment computation identities and argv digests. */
const BASELINE_PROGRAMS: Record<string, { segments: Segment[]; joins: number[]; frames: number; durationTicks: number; argvDigest: string }> = {
  finalA: { segments: [["frame_pts_exact", 0, 60, [0, 96_000], S("59cc39ead37b08de41dddfed6afc0404111239d5ff9182009b04dabf6b10b42a")]], joins: [], frames: 60,
    durationTicks: 2_000_000_000, argvDigest: "b6df4e25a83ec4cf9baf6784dc601ceca061382e95ac8fe1f2a3f4d4be4ade21" },
  previewA: { segments: [["frame_pts_exact", 0, 60, [0, 96_000], S("7b427713b8a2c66dc281e9b527ee22e814f5b51c6910e944a372803109584142")]], joins: [], frames: 60,
    durationTicks: 2_000_000_000, argvDigest: "f61254de1f2cfe709f67e7bdd564ed9dac5c7fcb3a9a00133112e2ce273fc2d8" },
  finalAB: { segments: [["frame_pts_exact", 0, 60, [0, 96_000], S("60c24a04aa38740dac53b11662b1536527c7f485330552c8f85f91ec2519d9a1")],
    ["frame_pts_exact", 30, 90, [48_000, 144_000], S("28c542c808e7a1d767a3ff79d02bb6b519da371e1f2e74eaf65b358eee5cb0ad")]], joins: [60], frames: 120,
    durationTicks: 4_000_000_000, argvDigest: "6b10f58eaa236983ef8db2e42d89ff93736a4684ff3eeb933833cc0042d16b3c" },
  finalWhole: { segments: [["frame_pts_exact", 0, 60, [0, 96_000], S("59cc39ead37b08de41dddfed6afc0404111239d5ff9182009b04dabf6b10b42a")],
    ["frame_pts_exact", 30, 90, [48_000, 144_000], S("28c542c808e7a1d767a3ff79d02bb6b519da371e1f2e74eaf65b358eee5cb0ad")]], joins: [60], frames: 120,
    durationTicks: 4_000_000_000, argvDigest: "923d942764133105c8e446a167e4d0f011d70fb903251f25f4a7c0874e8c5255" },
  finalSilent: { segments: [["frame_pts_exact", 0, 60, null, S("cc6816d76fd33b5abbb8f1e09cf33817181f45ca0c94653dde174752c35af4e7")]], joins: [], frames: 60,
    durationTicks: 2_000_000_000, argvDigest: "9a93b2152cc15fbcccec145b25c923250442417dfa39682d07c6b64e1772e539" },
  finalSeconds: { segments: [["source_seconds", 2, 62, [3200, 99_200], S("5dc3c36ff34f4251025ca562109cea3372a068a25ad5b5ce53165814df7f4b6c")]], joins: [], frames: 60,
    durationTicks: 2_000_000_000, argvDigest: "f4357523f2a4f0b8a5a5c4e64842b5b434655dfff160697084467aa9ac951dce" },
};
test("C06 the executed work is unchanged: frame and sample intervals, segment computation identities, frame tables and argv equal the baseline", () => {
  for (const [name, expected] of Object.entries(BASELINE_PROGRAMS)) {
    const program = programOf(FIXTURES[name]!());
    const segments = program.segments.map((s): Segment => [s.video.precision, s.video.startFrame, s.video.endFrame,
      s.audio.state === "linked" ? [s.audio.startSample, s.audio.endSample] : null, s.segmentComputationId]);
    assert.deepEqual(segments, expected.segments, `${name}: segments`);
    assert.deepEqual(program.joins.map(j => j.atFrame), expected.joins, `${name}: joins`);
    assert.deepEqual([program.output.frames, program.output.durationTicks], [expected.frames, expected.durationTicks], `${name}: output`);
    assert.ok(program.inputs.every(i => i.video.tableId === TABLE_30), `${name}: the admitted frame-table identity`);
    assert.equal(argvDigestOf(compileFfmpegArguments(program, { maxOutputBytes: 64 * 1024 * 1024 }).argv), expected.argvDigest, `${name}: argv`);
  }
});

// ---- Batch-3A plans and observation identities over a fixed synthetic output identity
const O = (hex: string) => `editorial_observation_computation_v0_${hex}`;
const FIXED_OUTPUT = { contentHash: sha256Hex("gate7-batch3af-fixed-synthetic-output"), sizeBytes: 147_717 };
const BASELINE_REVIEWS: Record<string, { specs: SourceSpec[]; joins: [number, number, number][]; items: [string, number, number][]; observations: string[] }> = {
  AB: { specs: [{ key: "r3a_a" }, { key: "r3a_b", range: { startSeconds: 1, endSeconds: 3 } }], joins: [[60, 2_000_000_000, 96_000]],
    items: [["cut_boundary", 45, 75], ["global_opening", 0, 30], ["global_interior", 15, 45], ["global_interior", 45, 75], ["global_interior", 75, 105], ["global_ending", 90, 120]],
    observations: [O("8259f26f72e3a349ae32ce46c765db662ad9cad60a2b483904cab4ab22a594ac"), O("b2d79a48c2abbb079b9112d39678274afe2c8964c2881c7687936bfff1e1ef99"),
      O("ade3052f122fa49c2a4c80dc949f2f0a6ae1cc08666657f8b0c983974cee585a"), O("7ed0cdf389dcbac269ad03b90fe4fa1245efa0283013ca04a5a5a6583aa2acad"),
      O("6672acbf430cd633662cb9d347c9e28a506ad418d766c34654d0659fbaabd2cf"), O("fc96f1f5130e6ca63ef8d4dee6808dc15697e27c5858bcbd7f2f86cb3af8a619")] },
  ABCD: { specs: [{ key: "r3a_a", range: { startSeconds: 0, endSeconds: 1 } }, { key: "r3a_b", range: { startSeconds: 1, endSeconds: 2 } },
    { key: "r3a_c", range: { startSeconds: 2, endSeconds: 3 } }, { key: "r3a_d", range: { startSeconds: 3, endSeconds: 4 } }],
    joins: [[30, 1_000_000_000, 48_000], [60, 2_000_000_000, 96_000], [90, 3_000_000_000, 144_000]],
    items: [["cut_boundary", 15, 45], ["cut_boundary", 45, 75], ["cut_boundary", 75, 105], ["global_opening", 0, 30], ["global_interior", 15, 45], ["global_interior", 45, 75],
      ["global_interior", 75, 105], ["global_ending", 90, 120]],
    observations: [O("81a2f8579447ffe294902e481f421a86e78aea671109b1786a6da0cd78b4a665"), O("8259f26f72e3a349ae32ce46c765db662ad9cad60a2b483904cab4ab22a594ac"),
      O("bcbe6781335ef5b3763a5391440570b34c10a7b389b602438b41de6e67f735f7"), O("b2d79a48c2abbb079b9112d39678274afe2c8964c2881c7687936bfff1e1ef99"),
      O("ade3052f122fa49c2a4c80dc949f2f0a6ae1cc08666657f8b0c983974cee585a"), O("7ed0cdf389dcbac269ad03b90fe4fa1245efa0283013ca04a5a5a6583aa2acad"),
      O("6672acbf430cd633662cb9d347c9e28a506ad418d766c34654d0659fbaabd2cf"), O("fc96f1f5130e6ca63ef8d4dee6808dc15697e27c5858bcbd7f2f86cb3af8a619")] },
};
const reviewPolicy = (c: RenderedChain) => createReviewPolicy({ scope: c.v.dag.scope, author: { kind: "owner", actorId: "owner_synthetic" },
  windows: { boundaryHalfWindowFrames: 15, globalWindowFrames: 30, interiorSamples: 3 },
  budget: { maxObservations: 16, maxDeliveredFrames: 64, maxDecodedPixelFrames: 1_000_000_000, maxEvidenceBytes: 4_194_304, maxFindings: 32, maxExplanationCharacters: 400,
    maxReviewAttempts: 2, maxTranscriptCharacters: 16_384, maxDecodeMilliseconds: 120_000 } });
function decodedFor(p: ReviewPlan, request: ObservationRequest) {
  const { width, height } = p.facts, count = request.window.endFrame - request.window.startFrame;
  const video = yuvFrames({ width, height, first: request.window.startFrame, count, luma: frame => frame >= 60 && frame < 75 ? 20 : 180 });
  if (p.facts.audio.state !== "present" || request.audio === "none") return { video, audio: null };
  const spf = (p.facts.audio.sampleRateHz * p.facts.frameRate.denominator) / p.facts.frameRate.numerator;
  return { video, audio: f32Audio({ channels: p.facts.audio.channels, first: request.window.startFrame * spf, count: count * spf, sample: i => i < 96_000 ? 0.5 : 0 }) };
}
test("C07 Batch-3A review time is unchanged: exact join frames, ticks and samples, windows and observation computation identities equal the baseline", async (t: TestContext) => {
  for (const [name, expected] of Object.entries(BASELINE_REVIEWS)) {
    const c = await renderedChain(t, expected.specs, { output: FIXED_OUTPUT });
    const p = planReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy: reviewPolicy(c) });
    assert.deepEqual(p.joins.map(j => [j.atFrame, j.atTicks, j.atSample]), expected.joins, `${name}: joins`);
    assert.deepEqual(p.items.map(i => [i.purpose, i.request.window.startFrame, i.request.window.endFrame]), expected.items, `${name}: items`);
    const observations = p.items.map((_, i) => buildObservation({ plan: p, target: { kind: "plan_item", itemIndex: i }, decoded: decodedFor(p, p.items[i]!.request),
      transcripts: [], acquisition: { basis: "synthetic_test_bytes_not_media_decode_v0", tool: null } }));
    assert.deepEqual(observations.map(o => o.computationId), expected.observations, `${name}: observation computation identities`);
  }
});

// ================================================================ P01-P17 the exact-time vocabulary: the Batch 3A-F acceptance matrix (A-M) and future seams
const FLICKS = 705_600_000;
const fps = (n: number) => ({ numerator: n, denominator: 1 });
const NTSC24 = { numerator: 24_000, denominator: 1001 }, NTSC30 = { numerator: 30_000, denominator: 1001 }, NTSC60 = { numerator: 60_000, denominator: 1001 };
const RATES: [string, { numerator: number; denominator: number }][] = [["24", fps(24)], ["25", fps(25)], ["30", fps(30)], ["50", fps(50)], ["60", fps(60)],
  ["24000/1001", NTSC24], ["30000/1001", NTSC30], ["60000/1001", NTSC60]];
/** The exact reduced ratio p / q of k whole units of `rate` seconds, from integers only. */
const gcd = (a: number, b: number): number => b === 0 ? Math.abs(a) : gcd(b, a % b);
function exactSeconds(k: number, rate: { numerator: number; denominator: number }): ExactTime {
  const p = k * rate.denominator, q = rate.numerator, g = gcd(p, q) || 1;
  return { value: p / g, rate: { numerator: q / g, denominator: 1 } };
}
const tenth = (n: number) => exactTime(n, rateOf(10));

test("P01 basic exact time: zero, one unit, addition, subtraction, comparison, equality and total ordering are exact", () => {
  assert.deepEqual(canonicalTime(tickTime(0, 1_000_000_000)), { value: 0, rate: { numerator: 1, denominator: 1 } });
  const one = tickTime(1, 1_000_000_000), zero = tickTime(0, 1_000_000_000);
  assert.deepEqual([compareTimes(zero, one), compareTimes(one, zero), compareTimes(one, one)], [-1, 1, 0]);
  // 0.1 s + 0.2 s is exactly 0.3 s; the float counterexample is never relied upon.
  assert.equal(0.1 + 0.2 === 0.3, false);
  assert.deepEqual(addTimes(tenth(1), tenth(2)), tenth(3), "same-rate arithmetic stays on its rate");
  assert.deepEqual(subtractTimes(tenth(3), tenth(1)), tenth(2));
  assert.deepEqual(subtractTimes(tenth(1), tenth(3)), tenth(-2), "a difference may be a negative offset");
  // Cross-rate arithmetic is exact and canonical: one 30 fps frame plus one 48 kHz sample is 1601 / 48000 s.
  assert.deepEqual(addTimes(frameTime(1, fps(30)), sampleTime(1, 48_000)), { value: 1601, rate: { numerator: 48_000, denominator: 1 } });
  // A total order across rates, stable for equal instants (frame 2 at 30000/1001 is exactly pts 2002 at 1/30000).
  const f1 = frameTime(1, NTSC30), s3200 = sampleTime(3200, 48_000), t = tickTime(66_733_333, 1_000_000_000), f2 = frameTime(2, NTSC30);
  const pts = timestampTime(2002, { numerator: 1, denominator: 30_000 }), tenthSecond = tenth(1);
  const sorted = [f2, tenthSecond, s3200, pts, t, f1].sort(compareTimes);
  assert.deepEqual(sorted, [f1, s3200, t, f2, pts, tenthSecond]);
  assert.ok(sameInstant(f2, pts) && !sameInstant(t, f2), "66733333 ns is before frame 2 (66733333.33… ns)");
});

test("P02 rational video rates 24, 25, 30, 50, 60, 24000/1001, 30000/1001 and 60000/1001 map frames to exact instants and back", () => {
  for (const [label, rate] of RATES) {
    for (const k of [0, 1, 2, 999, 1000, 1001, 30_000, 71_999, 323_676]) {
      const t = frameTime(k, rate), canonical = canonicalTime(t);
      assert.deepEqual(canonical, exactSeconds(k, rate), `${label} frame ${k} is exactly ${k}×${rate.denominator}/${rate.numerator} s`);
      assert.equal(convertTime(canonical, rateOf(rate.numerator, rate.denominator), "exact").value, k, `${label} frame ${k} round-trips`);
      assert.equal(convertTime(t, rateOf(FLICKS), "exact").value, k * FLICKS * rate.denominator / rate.numerator, `${label}: every frame is a whole number of flicks`);
    }
  }
  // 30000 NTSC frames last exactly 1001 s; the naive 29.97 fps float is not the NTSC rate.
  assert.deepEqual(canonicalTime(frameTime(30_000, NTSC30)), { value: 1001, rate: { numerator: 1, denominator: 1 } });
  assert.notEqual(secondsOf(frameTime(1, NTSC30)), 1 / 29.97);
  assert.equal(secondsOf(frameTime(1, NTSC30)), 1001 / 30_000);
});

test("P03 30000/1001 and 60000/1001 over three hours: exact accumulation and frame indexing never drift, while naive float arithmetic does", () => {
  const drift: Record<string, unknown> = {};
  for (const [label, rate] of [["30000/1001", NTSC30], ["60000/1001", NTSC60], ["24000/1001", NTSC24]] as const) {
    const frames = Math.floor((3 * 3600 * rate.numerator) / rate.denominator), grid = rateOf(rate.numerator, rate.denominator), step = frameTime(1, rate);
    let exact = frameTime(0, rate), naive = 0, naiveIndexErrors = 0, exactIndexErrors = 0;
    for (let k = 0; k < frames; k++) {
      const instant = { value: k, rate: grid };
      if (Math.floor(secondsOf(instant) * rate.numerator / rate.denominator) !== k) naiveIndexErrors++;
      if (convertTime(canonicalTime(instant), grid, "floor").value !== k) exactIndexErrors++;
      exact = addTimes(exact, step); naive += rate.denominator / rate.numerator;
    }
    assert.deepEqual(exact, frameTime(frames, rate), `${label}: ${frames} exact frame steps land exactly on frame ${frames}`);
    assert.equal(exactIndexErrors, 0, `${label}: exact frame indexing never drifts`);
    assert.ok(naiveIndexErrors > 0, `${label}: naive float frame indexing mis-indexes frames`);
    assert.notEqual(naive, secondsOf(exact), `${label}: naive float accumulation drifts`);
    drift[label] = { frames, naiveAccumulatedSeconds: naive, exactSeconds: formatSeconds(exact, 9), naiveDriftSeconds: naive - secondsOf(exact), naiveIndexErrors };
  }
  persist("drift.json", drift);
});

test("P04 exact ranges: start, duration, end, half-open containment, intersection, adjacency and non-overlap", () => {
  const r = (a: number, b: number): ExactRange => ({ start: frameTime(a, NTSC30), end: frameTime(b, NTSC30) });
  const clip = r(10, 40);
  assert.ok(sameInstant(durationOf(clip), frameTime(30, NTSC30)));
  assert.ok(rangeContains(clip, clip.start) && !rangeContains(clip, clip.end) && rangeContains(clip, frameTime(39, NTSC30)), "half-open [start, end)");
  assert.ok(!rangeContains(clip, subtractTimes(clip.start, tickTime(1, FLICKS))), "one flick before the start is outside");
  const overlap = rangeIntersection(clip, r(30, 70))!;
  assert.ok(sameInstant(overlap.start, frameTime(30, NTSC30)) && sameInstant(overlap.end, frameTime(40, NTSC30)));
  assert.ok(rangesAdjacent(clip, r(40, 70)) && rangeIntersection(clip, r(40, 70)) === undefined, "adjacent ranges share an instant and do not overlap");
  assert.ok(!rangesAdjacent(clip, r(41, 70)) && rangeIntersection(clip, r(41, 70)) === undefined, "disjoint");
  // Cross-rate: 48 kHz sample ranges intersect frame ranges exactly (frame 30 is sample 48048).
  const samples: ExactRange = { start: sampleTime(48_000, 48_000), end: sampleTime(96_000, 48_000) }, both = rangeIntersection(clip, samples)!;
  assert.ok(sameInstant(both.start, sampleTime(48_000, 48_000)) && sameInstant(both.end, frameTime(40, NTSC30)));
  // The persisted source range refuses empty, reversed, negative and non-canonical ranges.
  for (const bad of [{ start: T(1, 2), end: T(1, 2) }, { start: T(1, 1), end: T(1, 2) }, { start: T(-1, 1), end: T(1, 1) }, { start: T(0, 1), end: { value: 2, rate: { numerator: 4, denominator: 1 } } }]) {
    assert.equal(SourceRangeSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test("P05 frame alignment: aligned instants map to exact frame indices; non-aligned instants require an explicit floor or ceil, never a hidden rounding", () => {
  const grid = rateOf(30_000, 1001);
  assert.equal(convertTime(frameTime(15, NTSC30), grid, "exact").value, 15);
  assert.equal(convertTime(T(1, 2), rateOf(30), "exact").value, 15, "0.5 s is frame 15 at 30 fps");
  assert.equal(errorCode(() => convertTime(T(1, 2), grid, "exact")), "time_not_representable", "0.5 s is 14.985 NTSC frames: exact refuses");
  assert.deepEqual([convertTime(T(1, 2), grid, "floor").value, convertTime(T(1, 2), grid, "ceil").value], [14, 15]);
  assert.deepEqual([convertTime({ value: -1, rate: rateOf(2) }, rateOf(1), "floor").value, convertTime({ value: -1, rate: rateOf(2) }, rateOf(1), "ceil").value], [-1, 0],
    "floor and ceil are true floor and ceiling for negative offsets");
});

test("P06 audio sample alignment at 44.1 and 48 kHz: sample 0, 1, 47999 and 48000 are exact, and frame boundaries map to samples only when exact", () => {
  assert.deepEqual([0, 1, 47_999, 48_000].map(n => canonicalTime(sampleTime(n, 48_000))),
    [T(0, 1), T(1, 48_000), T(47_999, 48_000), T(1, 1)]);
  const at48 = rateOf(48_000), at441 = rateOf(44_100);
  assert.equal(convertTime(frameTime(7, fps(30)), at48, "exact").value, 11_200, "1600 samples per 30 fps frame at 48 kHz");
  assert.equal(convertTime(frameTime(7, fps(30)), at441, "exact").value, 10_290, "1470 samples per 30 fps frame at 44.1 kHz");
  assert.equal(convertTime(frameTime(5, NTSC30), at48, "exact").value, 8008, "five NTSC frames are exactly 8008 samples at 48 kHz");
  assert.equal(errorCode(() => convertTime(frameTime(1, NTSC30), at48, "exact")), "time_not_representable", "one NTSC frame is 1601.6 samples: not a sample boundary");
  assert.equal(convertTime(frameTime(100, NTSC30), at441, "exact").value, 147_147, "100 NTSC frames are exactly 147147 samples at 44.1 kHz");
  assert.ok(sameInstant(sampleTime(441, 44_100), sampleTime(480, 48_000)), "10 ms at 44.1 kHz is 10 ms at 48 kHz");
});

test("P07 equivalent instants at different rates compare equal and share one canonical form", () => {
  const second = [frameTime(30, fps(30)), frameTime(24, fps(24)), sampleTime(48_000, 48_000), sampleTime(44_100, 44_100), tickTime(FLICKS, FLICKS),
    tickTime(1_000_000_000, 1_000_000_000), timestampTime(90_000, { numerator: 1, denominator: 90_000 }), timestampTime(30_000, { numerator: 1, denominator: 30_000 }), T(1, 1)];
  for (const t of second) { assert.ok(sameInstant(t, T(1, 1))); assert.deepEqual(canonicalTime(t), T(1, 1)); }
  assert.ok(sameInstant(frameTime(1001, NTSC30), T(1001 * 1001, 30_000)) && !sameInstant(frameTime(1001, NTSC30), T(1001, 30)), "NTSC is not 30 fps");
});

test("P08 serialization round trips preserve exact authoritative time through JSON, canonical bytes and schema validation", () => {
  const values: ExactTime[] = [T(0, 1), T(13, 100), frameTime(71_999, NTSC60), tickTime(Number.MAX_SAFE_INTEGER, FLICKS), tickTime(-Number.MAX_SAFE_INTEGER, 1)];
  for (const t of values) {
    const text = JSON.stringify(t), back = JSON.parse(text) as ExactTime;
    assert.deepEqual(back, t);
    assert.ok(sameInstant(back, t));
    assert.equal(canonicalSerialize(back), canonicalSerialize(t));
  }
  const range = SourceRangeSchema.parse(JSON.parse(JSON.stringify({ start: T(13, 100), end: T(197, 100) })));
  assert.deepEqual(range, { start: T(13, 100), end: T(197, 100) });
  // A whole EditGraph survives JSON and still replays exactly.
  const g = graphAt(offGridPlan(), 1000), text = JSON.stringify(g.graph);
  assert.deepEqual(validateEditGraph(JSON.parse(text) as unknown, g.artifacts), g.graph);
});

test("P09 identity: one canonical spelling per instant, distinct instants never collide, and computation identities bind semantics rather than clock choice", () => {
  const id = (t: ExactTime) => identify("t3af_probe_v0", "probeId", { at: canonicalTime(t) }).probeId;
  assert.equal(id(T(1, 2)), id({ value: 500, rate: rateOf(1000) }));
  assert.equal(id(frameTime(15, fps(30))), id(sampleTime(24_000, 48_000)));
  assert.notEqual(id(tickTime(1, 1_000_000_000)), id(tickTime(2, 1_000_000_000)), "one nanosecond apart");
  assert.notEqual(id(frameTime(2, NTSC30)), id(tickTime(66_733_333, 1_000_000_000)), "sub-nanosecond apart");
  assert.equal(SourceInstantSchema.safeParse({ value: 500, rate: { numerator: 1000, denominator: 1 } }).success, false, "a reducible spelling is never persisted");
  assert.equal(RateSchema.safeParse({ numerator: 60, denominator: 2 }).success, false, "a rate has one spelling");
  assert.equal(RateSchema.safeParse({ numerator: MAX_RATE_COMPONENT + 1, denominator: 1 }).success, false, "a rate component beyond the rational bound is refused");
  // Two graphs of one decision at different clocks: identical canonical source time, identical render segment computations.
  const coarse = rateChain({ key: "t3af_clock", fps: 30, clock: 1_000_000_000 }), fine = rateChain({ key: "t3af_clock", fps: 30, clock: FLICKS });
  const clip = clipNode;
  assert.deepEqual(clip(coarse).source.range, clip(fine).source.range);
  const [a, b] = [programOf(coarse), programOf(fine)];
  assert.deepEqual(a.segments.map(s => s.segmentComputationId), b.segments.map(s => s.segmentComputationId), "the semantic work identity is clock-free");
  // The accepted Batch-1 node identity conservatively binds the declared clock: a clock change never shares a DAG node computation.
  assert.notEqual(clip(coarse).computationId, clip(fine).computationId);
});

test("P10 long timelines: ten hours at 60000/1001 on a flick clock stay exact and within safe integers, while naive float frame indexing fails", () => {
  const tenHours = tickTime(10 * 3600 * FLICKS, FLICKS);
  assert.equal(tenHours.value, 25_401_600_000_000);
  const frames = convertTime(tenHours, rateOf(60_000, 1001), "floor").value;
  assert.equal(frames, 2_157_842);
  let naiveIndexErrors = 0;
  for (let k = frames - 20_000; k < frames; k++) {
    const t = convertTime(frameTime(k, NTSC60), rateOf(FLICKS), "exact");
    assert.equal(convertTime(t, rateOf(60_000, 1001), "exact").value, k);
    if (Math.floor(secondsOf(t) * 60_000 / 1001) !== k) naiveIndexErrors++;
  }
  assert.ok(naiveIndexErrors > 0, "naive float frame indexing mis-indexes frames near the ten-hour mark");
  // Safe-integer capacity of the declared clocks: the largest accepted clock covers more than 100 days, flicks more than 147 days.
  assert.ok(Number.MAX_SAFE_INTEGER / 1_000_000_000 > 100 * 86_400 && Number.MAX_SAFE_INTEGER / FLICKS > 147 * 86_400);
  assert.equal(errorCode(() => addTimes(tickTime(Number.MAX_SAFE_INTEGER, FLICKS), tickTime(1, FLICKS))), "limit_exceeded", "overflow refuses, never wraps");
});

test("P11 Batch-3A and Batch-1 exact helpers are instances of the one vocabulary: ticks versus frames, samples per frame and frame indices agree", () => {
  let seed = 7;
  const next = (n: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed % n; };
  const clocks = [48_000, 1_000_000_000, FLICKS, 90_000], grids = [fps(30), fps(24), NTSC30, NTSC60];
  for (let i = 0; i < 4000; i++) {
    const tps = clocks[next(clocks.length)]!, grid = grids[next(grids.length)]!, frame = next(20_000), ticks = next(2_000_000) * next(5000);
    const c = compareTimes(tickTime(ticks, tps), frameTime(frame, grid));
    assert.equal(ticksBeforeFrame(ticks, tps, frame, grid), c < 0);
    assert.equal(ticksAfterFrame(ticks, tps, frame, grid), c > 0);
    let index: number | undefined;
    try { index = convertTime(tickTime(ticks, tps), rateOf(grid.numerator, grid.denominator), "exact").value; } catch { index = undefined; }
    assert.equal(frameIndexAt(ticks, { ticksPerSecond: tps, ...grid }), index);
  }
  for (const grid of grids) for (const sampleRateHz of [44_100, 48_000] as const) {
    let exact: number | null;
    try { exact = convertTime(frameTime(1, grid), rateOf(sampleRateHz), "exact").value; } catch { exact = null; }
    assert.equal(samplesPerFrame({ frames: 1, frameRate: grid, width: 2, height: 2, audio: { state: "present", sampleRateHz, channels: 2 } }), exact);
  }
});

type ClipNode = Extract<DagFixture["dag"]["nodes"][number], { kind: "source_video_clip" }>;
const clipNode = (x: DagFixture): ClipNode => x.dag.nodes.find((n): n is ClipNode => n.kind === "source_video_clip")!;

// ---- L: render compilation under 30000/1001 (the accepted compiler over an exactly retimed DAG) and the staged-input conformance rule
function ntscFacts(frames = 120): SourceFacts { return { frameTimes: Array.from({ length: frames }, (_, i) => (i * 1001) / 30_000), width: 90, height: 160 }; }
/** The accepted 30 fps flick-clock chain, retimed to 30000/1001: every span, node and identity recomputed through the accepted identifier. */
function ntscDag(o: { startFrame?: number; frames?: number; precision?: "frame_pts_exact" | "source_seconds"; range?: ExactRange; table?: SourceFacts } = {}) {
  const x = rateChain({ key: "t3af_ntsc", fps: 30, clock: FLICKS }), dag = structuredClone(x.dag), settings = { ...dag.settings, frameRate: NTSC30 };
  const frames = o.frames ?? 60, perFrame = (FLICKS * 1001) / 30_000, durationTicks = frames * perFrame, table = o.table ?? ntscFacts();
  const startFrame = o.startFrame ?? 0, range = o.range ?? { start: canonicalTime(frameTime(startFrame, NTSC30)), end: canonicalTime(frameTime(startFrame + frames, NTSC30)) };
  const mapping = { sourceStartTicks: convertTime(range.start, rateOf(FLICKS), "exact").value, sourceEndTicks: convertTime(range.end, rateOf(FLICKS), "exact").value };
  const index = new Map(dag.nodes.map((n, i) => [n.nodeId, i]));
  const drafts = dag.nodes.map(node => {
    const { nodeId: _n, computationId: _c, inputs, ...rest } = structuredClone(node);
    const draft = { ...rest, inputs: inputs.map(id => index.get(id)!) } as unknown as ExecutionDagNodeDraft & Record<string, unknown>;
    if (draft.kind === "source_video_clip" || draft.kind === "linked_source_audio") {
      const source = draft.source, pointer = (side: string) => ({ artifact: source.analysis, pointer: `/candidates/0/candidate/sourceRange/${side}` });
      const frameAuthority = (frame: number) => ({ kind: "frame_pts" as const, frameIndex: frame, evidence: { artifact: source.analysis, pointer: `/metadata/frameTimes/${frame}` } });
      const trim = o.precision === "source_seconds" ? { ...source.trim, precision: "source_seconds" as const, startAuthority: { kind: "candidate_endpoint" as const, evidence: pointer("startSeconds") },
        endAuthority: { kind: "candidate_endpoint" as const, evidence: pointer("endSeconds") } }
        : { ...source.trim, startAuthority: frameAuthority(startFrame), endAuthority: frameAuthority(startFrame + frames) };
      Object.assign(draft, { source: { ...source, range, trim, frameTimes: { count: table.frameTimes.length, tableId: frameTableIdOf(table.frameTimes) } },
        mapping: { ...draft.mapping, ...mapping } });
      if (draft.kind === "source_video_clip") draft.output = { startTicks: 0, endTicks: durationTicks, startFrame: 0, endFrame: frames };
      else draft.output = { startTicks: 0, endTicks: durationTicks };
    } else if (draft.kind === "cut_sequence") draft.output = { durationTicks, frames };
    else if (draft.kind === "composition") { draft.output = { durationTicks, frames }; draft.audio = draft.audio.map(a => ({ ...a, startTicks: 0, endTicks: durationTicks })); }
    else if (draft.kind === "final_encode") draft.output = { ...draft.output, frameRate: NTSC30, frames, durationTicks };
    return draft as ExecutionDagNodeDraft;
  });
  const retimed = { ...dag, settings, nodes: identifyDagNodes(drafts, settings) };
  return { dag: retimed, admission: openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts).admission, sources: new Map([[clipNode(x).source.assetId, table]]) };
}
test("P12 30000/1001: render compilation derives exact frame and sample intervals, and the FFmpeg boundary receives only integers and the exact grid", () => {
  const exact = compileRenderProgramFromDag(ntscDag());
  assert.deepEqual(exact.segments.map(s => [s.video.startFrame, s.video.endFrame, s.audio.state === "linked" ? [s.audio.startSample, s.audio.endSample] : null]), [[0, 60, [0, 96_096]]]);
  assert.deepEqual([exact.output.frames, exact.output.durationTicks, exact.output.frameRate], [60, 1_412_611_200, NTSC30]);
  const graph = compileFfmpegArguments(exact, { maxOutputBytes: 64 * 1024 * 1024 }).argv.find(a => a.includes("trim="))!;
  assert.match(graph, /trim=start_frame=0:end_frame=60,/);
  assert.match(graph, /atrim=start_sample=0:end_sample=96096,/);
  assert.match(graph, /settb=expr=1001\/30000\[vout\]/);
  // A later frame-exact trim: frames [15, 75) are samples [24024, 120120).
  assert.deepEqual(compileRenderProgramFromDag(ntscDag({ startFrame: 15 })).segments[0]!.audio, { state: "linked", startSample: 24_024, endSample: 120_120 });
  // source_seconds: [1/2 s, 1/2 s + 60 frames) selects frames [15, 75) by exact PTS membership (14.985 frames rounds up only by the explicit ceiling).
  const seconds = compileRenderProgramFromDag(ntscDag({ precision: "source_seconds", range: { start: T(1, 2), end: canonicalTime(addTimes(T(1, 2), frameTime(60, NTSC30))) } }));
  assert.deepEqual([seconds.segments[0]!.video.selection, seconds.segments[0]!.video.startFrame, seconds.segments[0]!.video.endFrame], ["pts_membership_half_open_v0", 15, 75]);
  // An endpoint one flick off its frame is refused, never snapped.
  const off = { start: canonicalTime(addTimes(frameTime(15, NTSC30), tickTime(1, FLICKS))), end: canonicalTime(addTimes(frameTime(75, NTSC30), tickTime(1, FLICKS))) };
  assert.throws(() => compileRenderProgramFromDag(ntscDag({ startFrame: 15, range: off })), (e: Error & { code?: string }) => e.code === "source_trim_invalid");
});

function ntscProbeJson(pts: (i: number) => number, frames = 120): string {
  return JSON.stringify({ frames: Array.from({ length: frames }, (_, i) => ({ stream_index: 0, pts: pts(i) })), programs: [], stream_groups: [],
    streams: [{ index: 0, codec_name: "h264", codec_type: "video", width: 90, height: 160, sample_aspect_ratio: "1:1", pix_fmt: "yuv420p", time_base: "1/30000", start_pts: pts(0) }],
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" } });
}
test("P13 30000/1001 source timestamps: exact stream PTS at an explicit time base conform to the admitted grid; one tick off is refused", () => {
  const table = ntscFacts(), spec = { video: { frameCount: 120, tableId: frameTableIdOf(table.frameTimes), width: 90, height: 160, grid: NTSC30 }, audio: { required: false as const } };
  const conforming = evaluateInputConformance(spec, parseProbeJson(ntscProbeJson(i => 1001 * i)));
  assert.deepEqual(conforming.outcome, { state: "conforms" });
  assert.equal(conforming.observation.videoTableId, spec.video.tableId, "the derived float rendering of exact PTS reproduces the admitted table identity");
  for (let i = 0; i < 120; i++) assert.ok(sameInstant(timestampTime(1001 * i, { numerator: 1, denominator: 30_000 }), frameTime(i, NTSC30)));
  assert.deepEqual(evaluateInputConformance(spec, parseProbeJson(ntscProbeJson(i => 1001 * i + (i === 7 ? 1 : 0)))).outcome, { state: "nonconforming", reasonCode: "source_timebase_mismatch" });
});

// ---- 24 and 60 fps end to end through the accepted Gate 5-7 builders on a flick clock
function rateChain(o: { key: string; fps: number; clock: number; range?: { startSeconds: number; endSeconds: number } }): DagFixture {
  return memo(`rate_chain_${o.key}_${o.fps}_${o.clock}_${JSON.stringify(o.range ?? null)}`, () => {
    const source: RuntimeChainSource = { key: o.key, hash: sha256Hex(`gate7-batch3af-${o.key}`), metadata: cfrMetadata({ fps: o.fps }), ...(o.range ? { range: o.range } : {}) };
    const seconds = (o.range?.endSeconds ?? 2) - (o.range?.startSeconds ?? 0), rate = fps(o.fps);
    const p = plan(planningFixture(orderedSourcesPolicy(seconds, 1), runtimeChainFixture([source])));
    const decls = declarations({ timeline_video_clip: declaration("timeline_video_clip",
      VIDEO_SUPPORTS.map(s => s.name === "output_frame_rate" ? member("output_frame_rate", `fps_${o.fps}_1`) : s)),
    timeline_source_audio: declaration("timeline_source_audio", [member("audio_linkage", "linked_identity"), atMost("clip_count", 120)]) });
    const g = graphOf(p, { profile: { resolution: FINAL_RENDER_RESOLUTION, frameRate: rate, clock: { ticksPerSecond: o.clock } },
      snapshot: capabilitySnapshot([freshExecutorBody(decls, REAL_EXECUTOR, TIME6, REAL_ENVIRONMENT)], { environment: REAL_ENVIRONMENT }) });
    return renderDag(g, { profile: { frameRate: rate }, snapshot: freshSnapshot([freshExecutorBody(decls, REAL_EXECUTOR, T7.capability, REAL_ENVIRONMENT)],
      { environment: REAL_ENVIRONMENT, asOf: T7.capability }) });
  });
}
test("P14 24 fps and 60 fps chains on a flick clock: exact canonical source ranges, exact spans, and frame and sample intervals through the accepted chain", () => {
  const cases: [number, { startSeconds: number; endSeconds: number } | undefined, [number, number], [number, number], number][] = [
    [24, undefined, [0, 48], [0, 96_000], 1_411_200_000], [24, { startSeconds: 0.5, endSeconds: 1.5 }, [12, 36], [24_000, 72_000], FLICKS],
    [60, undefined, [0, 120], [0, 96_000], 1_411_200_000], [60, { startSeconds: 0.5, endSeconds: 1.5 }, [30, 90], [24_000, 72_000], FLICKS]];
  for (const [rate, range, frames, samples, ticks] of cases) {
    const x = rateChain({ key: `t3af_fps${rate}`, fps: rate, clock: FLICKS, ...(range ? { range } : {}) }), graph = graphOfDag(x);
    assertNoFloatSeconds(graph, `${rate} fps graph`);
    assertNoFloatSeconds(x.dag, `${rate} fps DAG`);
    const expected = range ? { start: T(1, 2), end: T(3, 2) } : { start: T(0, 1), end: T(2, 1) };
    assert.deepEqual(videoUses(graph)[0]!.source.range, expected);
    assert.equal(graph.output.durationTicks, ticks);
    const program = programOf(x);
    assert.deepEqual([program.segments[0]!.video.startFrame, program.segments[0]!.video.endFrame], frames);
    assert.deepEqual(program.segments[0]!.audio, { state: "linked", startSample: samples[0], endSample: samples[1] });
  }
});

test("P15 backward compatibility: legacy float-second records are refused with explicit version errors and never silently reinterpreted", () => {
  const g = graphAt(offGridPlan(), 1000), legacy = JSON.parse(readFileSync("tests/fixtures/edit-graph-0.1.0-float-seconds.json", "utf8")) as Record<string, unknown>;
  // Relabelled as the current version, the float range still never parses as exact time.
  const relabelled = { ...legacy, artifactVersion: "0.2.0", version: "0.2.0" };
  assert.equal(errorCode(() => validateEditGraph(relabelled, g.artifacts)), "input_invalid");
  // A legacy ExecutionDag reference is refused by version before any replay.
  const x = FIXTURES.finalA!(), legacyDag = { ...x.dag, artifactVersion: "0.1.0" }, legacyArtifact = supplied(legacyDag, "t3af_legacy_dag");
  assert.throws(() => openValidatedDag({ dag: legacyArtifact.ref }, [...x.artifacts, legacyArtifact]),
    (e: Error & { code?: string }) => e instanceof EditRuntimeError && e.code === "execution_dag_invalid" && e.message.includes("ExecutionDag 0.2.0"));
  // The exact rebuilt graph and DAG are the new schemas.
  assert.equal(x.dag.artifactVersion, "0.2.0");
  assert.equal(graphOfDag(x).artifactVersion, "0.2.0");
});

test("P16 the legacy decoder is the only float entry: NaN, infinities and negatives never decode; it reproduces the accepted Gate-6 rule exactly", () => {
  const clock = rateOf(1_000_000_000);
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -1e-9, "1" as unknown as number, null as unknown as number]) {
    assert.equal(decodeLegacySeconds(bad, clock), undefined, String(bad));
  }
  assert.deepEqual(decodeLegacySeconds(-0, clock), { value: 0, rate: clock });
  assert.deepEqual(decodeLegacySeconds(0.1, rateOf(10)), { value: 1, rate: rateOf(10) });
  assert.equal(decodeLegacySeconds(0.1, rateOf(3)), undefined, "0.1 s is not a whole number of thirds");
  assert.deepEqual(decodeLegacySeconds(1 / 3, rateOf(3)), { value: 1, rate: rateOf(3) }, "the double nearest 1/3 names exactly 1/3 s");
  assert.equal(decodeLegacySeconds(2 ** 40, clock), undefined, "a double too coarse to name one nanosecond is ambiguous and refused");
  for (let i = 0; i < 72_000; i += 7) assert.equal(decodeLegacySeconds((i * 1001) / 30_000, rateOf(30_000, 1001))?.value, i);
  // The accepted Gate-6 rule (Math.round, then an exact division check) and the exact decoder agree on every accepted-range value.
  const accepted = (s: number, tps: number) => { const n = Math.round(s * tps); return Number.isSafeInteger(n) && n >= 0 && n / tps === s ? n : undefined; };
  let seed = 11, compared = 0;
  const next = (n: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed % n; };
  for (const tps of [10, 1000, 48_000, 1_000_000, 1_000_000_000, FLICKS]) for (let i = 0; i < 3000; i++) {
    const s = [next(600_000) / 1000, next(72_000) / 30, (next(72_000) * 1001) / 30_000, next(1 << 20) / (1 << 10), next(1_000_000_007) / 1_666_667][i % 5]!;
    assert.equal(exactTicks(s, tps), accepted(s, tps), `${s} at ${tps}`);
    compared++;
  }
  assert.equal(compared, 18_000);
});

// ---- future seams (no command, runtime or motion system is implemented; these show the primitive already expresses them)
test("P17 GraphDiff, localized invalidation, keyframes, HyperFrames, audio automation and preview can all be stated exactly in this vocabulary", () => {
  const ntsc = (n: number) => frameTime(n, NTSC30), clip: ExactRange = { start: ntsc(30), end: ntsc(150) };
  // TrimClip: +5 frames at the head shortens the clip by exactly five frames of output ticks.
  const trimmed: ExactRange = { start: addTimes(clip.start, ntsc(5)), end: clip.end };
  assert.ok(sameInstant(subtractTimes(durationOf(clip), durationOf(trimmed)), ntsc(5)));
  assert.equal(convertTime(durationOf(clip), rateOf(FLICKS), "exact").value - convertTime(durationOf(trimmed), rateOf(FLICKS), "exact").value, 5 * 23_543_520);
  // SplitClip at an exact frame: two adjacent halves whose durations sum exactly to the original.
  const left: ExactRange = { start: clip.start, end: ntsc(100) }, right: ExactRange = { start: ntsc(100), end: clip.end };
  assert.ok(rangesAdjacent(left, right) && rangeIntersection(left, right) === undefined && sameInstant(addTimes(durationOf(left), durationOf(right)), durationOf(clip)));
  // MoveClip / InsertClip: exact tick shifts; ChangeTransitionDuration: 12 versus 13 frames are distinct exact durations.
  const shift = tickTime(1_000, FLICKS), moved: ExactRange = { start: addTimes(clip.start, shift), end: addTimes(clip.end, shift) };
  assert.ok(sameInstant(durationOf(moved), durationOf(clip)) && compareTimes(moved.start, clip.start) > 0);
  assert.notDeepEqual(canonicalTime(ntsc(12)), canonicalTime(ntsc(13)));
  // Localized invalidation: the exact changed region of a head trim, widened to output frames only by an explicit floor/ceil policy.
  const changed: ExactRange = { start: clip.start, end: trimmed.start }, grid60 = rateOf(60_000, 1001);
  const window = { start: convertTime(changed.start, grid60, "floor").value, end: convertTime(changed.end, grid60, "ceil").value };
  assert.deepEqual(window, { start: 60, end: 70 }, "30 fps NTSC frames 30..35 are 60 fps NTSC frames 60..70 exactly");
  // UpdateKeyframeTime: a keyframe on the graph clock; the interpolation parameter at an output frame is an exact rational.
  const k0 = tickTime(0, FLICKS), k1 = tickTime(FLICKS, FLICKS), atFrame = frameTime(15, fps(30));
  const u = subtractTimes(atFrame, k0), span = subtractTimes(k1, k0);
  assert.equal(compareTimes(addTimes(u, u), span), 0, "frame 15 at 30 fps is exactly halfway between keyframes one second apart");
  // HyperFrames boundary: the frame index is derived at an explicit output rate and alignment, never a project clock.
  const hyper = (t: ExactTime, align: Alignment) => convertTime(t, rateOf(30), align).value;
  assert.deepEqual([hyper(T(1, 2), "exact"), hyper(tickTime(1, FLICKS), "floor"), hyper(tickTime(1, FLICKS), "ceil")], [15, 0, 1]);
  // ChangeAudioAutomationPoint: a point at sample 47999 moved by one sample is a distinct exact instant; 44.1 kHz needs an explicit policy.
  assert.ok(sameInstant(addTimes(sampleTime(47_999, 48_000), sampleTime(1, 48_000)), T(1, 1)));
  assert.equal(errorCode(() => convertTime(sampleTime(47_999, 48_000), rateOf(44_100), "exact")), "time_not_representable");
  // Preview and final share exact time: a 15 fps preview frame is an explicit floor of the same instant the 30 fps render uses exactly.
  assert.deepEqual([convertTime(frameTime(31, fps(30)), rateOf(15), "floor").value, convertTime(frameTime(31, fps(30)), rateOf(30), "exact").value], [15, 31]);
});

// ---- performance (catastrophic-choice detection only; measurements are persisted, not tuned)
const EVIDENCE = join(".test-artifacts", "phase5-gate7-batch3af");
function persist(name: string, value: unknown): void { mkdirSync(EVIDENCE, { recursive: true }); writeFileSync(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`); }
test("P18 performance: exact construction, comparison, conversion, range operations, canonicalization, decoding and serialization stay cheap", () => {
  const N = 100_000, results: Record<string, number> = {}, grid = rateOf(30_000, 1001), flicks = rateOf(FLICKS);
  const measure = (name: string, run: (i: number) => unknown) => {
    const started = performance.now();
    for (let i = 0; i < N; i++) run(i);
    results[name] = Number((((performance.now() - started) * 1000) / N).toFixed(3));
  };
  measure("construct_tickTime", i => tickTime(i, FLICKS));
  measure("compareTimes_cross_rate", i => compareTimes({ value: i, rate: grid }, { value: i * 23_543_520, rate: flicks }));
  measure("convertTime_exact", i => convertTime({ value: i, rate: grid }, flicks, "exact"));
  measure("rangeIntersection", i => rangeIntersection({ start: { value: i, rate: grid }, end: { value: i + 60, rate: grid } }, { start: { value: i + 30, rate: grid }, end: { value: i + 90, rate: grid } }));
  measure("canonicalTime", i => canonicalTime({ value: i, rate: grid }));
  measure("decodeLegacySeconds", i => decodeLegacySeconds((i * 1001) / 30_000, flicks));
  measure("secondsOf", i => secondsOf({ value: i, rate: grid }));
  measure("json_roundtrip", i => JSON.parse(JSON.stringify({ value: i, rate: grid })));
  persist("performance.json", { operations: N, microsecondsPerOperation: results });
  for (const [name, micros] of Object.entries(results)) assert.ok(micros < 50, `${name}: ${micros} µs per operation`);
});

// ================================================================ H01-H10 hostile self-review (batch3af-self-review-findings.md, written before these reds)
test("H01 self-review T9: an undeclared alignment never rounds silently; only exact, floor and ceil exist", () => {
  const grid = rateOf(30_000, 1001);
  for (const bad of ["nearest", "round", "", "EXACT", undefined, null]) {
    assert.equal(errorCode(() => convertTime(T(1, 2), grid, bad as unknown as Alignment)), "input_invalid", `non-aligned under ${String(bad)}`);
    assert.equal(errorCode(() => convertTime(T(1, 1), rateOf(30), bad as unknown as Alignment)), "input_invalid", `aligned under ${String(bad)}`);
  }
});

test("H02 self-review T12/T5: malformed rates and unsafe or fractional counts are refused by every primitive, never silently ordered or thrown raw", () => {
  const bad = [{ value: 1, rate: { numerator: 0, denominator: 1 } }, { value: 1, rate: { numerator: -30, denominator: 1 } }, { value: 1, rate: { numerator: 30, denominator: 0 } },
    { value: 1, rate: { numerator: 1.5, denominator: 1 } }, { value: 1.5, rate: { numerator: 1, denominator: 1 } }, { value: 1, rate: { numerator: 60, denominator: 2 } },
    { value: Number.MAX_SAFE_INTEGER + 2, rate: { numerator: 1, denominator: 1 } }, { value: 1, rate: { numerator: MAX_RATE_COMPONENT + 1, denominator: 1 } },
    { value: Number.NaN, rate: { numerator: 1, denominator: 1 } }] as ExactTime[];
  const ok = T(1, 1), span: ExactRange = { start: T(0, 1), end: T(2, 1) };
  for (const t of bad) {
    const runs: [string, () => unknown][] = [["compareTimes", () => compareTimes(t, ok)], ["compareTimes right", () => compareTimes(ok, t)], ["addTimes", () => addTimes(t, ok)],
      ["subtractTimes", () => subtractTimes(ok, t)], ["canonicalTime", () => canonicalTime(t)], ["convertTime", () => convertTime(t, rateOf(30), "floor")],
      ["secondsOf", () => secondsOf(t)], ["formatSeconds", () => formatSeconds(t, 3)], ["rangeContains", () => rangeContains(span, t)],
      ["durationOf", () => durationOf({ start: ok, end: t })]];
    for (const [name, run] of runs) assert.equal(errorCode(run), "input_invalid", `${name} ${JSON.stringify(t)}`);
  }
});

test("H03 self-review T11: a reversed range has no duration, containment, adjacency or intersection; the empty range is valid and contains nothing", () => {
  const reversed: ExactRange = { start: T(2, 1), end: T(1, 1) }, other: ExactRange = { start: T(0, 1), end: T(3, 1) };
  assert.equal(errorCode(() => durationOf(reversed)), "input_invalid");
  assert.equal(errorCode(() => rangeContains(reversed, T(3, 2))), "input_invalid");
  assert.equal(errorCode(() => rangeIntersection(reversed, other)), "input_invalid");
  assert.equal(errorCode(() => rangeIntersection(other, reversed)), "input_invalid");
  assert.equal(errorCode(() => rangesAdjacent(reversed, { start: T(2, 1), end: T(3, 1) })), "input_invalid");
  const empty: ExactRange = { start: T(1, 1), end: T(1, 1) };
  assert.deepEqual(canonicalTime(durationOf(empty)), T(0, 1));
  assert.equal(rangeContains(empty, T(1, 1)), false);
});

test("H04 self-review T3 (attempted red): a non-canonical spelling of an equal source instant never becomes a second EditGraph identity", () => {
  const g = graphAt(offGridPlan(), 1000), forged = structuredClone(g.graph) as EditGraph;
  for (const clip of forged.clipUses) clip.source.range = { start: { value: 130, rate: { numerator: 1000, denominator: 1 } }, end: clip.source.range.end };
  assert.ok(sameInstant(forged.clipUses[0]!.source.range.start, g.graph.clipUses[0]!.source.range.start), "the forged spelling denotes the same instant");
  assert.equal(EditGraphSchema.safeParse(forged).success, false);
  assert.equal(errorCode(() => validateEditGraph(forged, g.artifacts)), "input_invalid");
});

const bitsOf = (x: number): bigint => { const v = new DataView(new ArrayBuffer(8)); v.setFloat64(0, x); return v.getBigUint64(0); };
const fromBits = (b: bigint): number => { const v = new DataView(new ArrayBuffer(8)); v.setBigUint64(0, b); return v.getFloat64(0); };
/** The exact binary rational of a finite nonnegative double. */
function exactOf(x: number): { n: bigint; d: bigint } {
  const b = bitsOf(x), e = Number((b >> 52n) & 0x7ffn), f = b & ((1n << 52n) - 1n), m = e === 0 ? f : f | (1n << 52n), exp = (e === 0 ? 1 : e) - 1075;
  return exp >= 0 ? { n: m << BigInt(exp), d: 1n } : { n: m, d: 1n << BigInt(-exp) };
}
test("H05 self-review T5 (attempted red): derived seconds are the correctly rounded double beyond 2^53, ties to even, checked exactly", () => {
  const distance = (x: number, n: bigint, d: bigint) => { const e = exactOf(x), diff = e.n * d - n * e.d; return { num: diff < 0n ? -diff : diff, den: e.d * d }; };
  const closerOrEqual = (a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }) => a.num * b.den <= b.num * a.den;
  const same = (a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }) => a.num * b.den === b.num * a.den;
  let seed = 5, checked = 0;
  const next = (n: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed % n; };
  const cases: ExactTime[] = [{ value: 2 ** 52 + 1, rate: rateOf(1, 3) }, { value: Number.MAX_SAFE_INTEGER, rate: rateOf(7, MAX_RATE_COMPONENT) }];
  for (let i = 0; i < 3000; i++) cases.push({ value: 1 + next(2 ** 30) * 8_388_608 + next(8_388_608), rate: rateOf(1 + next(MAX_RATE_COMPONENT - 1), 1 + next(MAX_RATE_COMPONENT - 1)) });
  for (const t of cases) {
    const x = secondsOf(t), n = BigInt(t.value) * BigInt(t.rate.denominator), d = BigInt(t.rate.numerator), here = distance(x, n, d);
    for (const neighbour of [fromBits(bitsOf(x) - 1n), fromBits(bitsOf(x) + 1n)]) {
      const there = distance(neighbour, n, d);
      assert.ok(closerOrEqual(here, there), `${JSON.stringify(t)}: a neighbouring double is closer`);
      if (same(here, there)) assert.equal(bitsOf(x) & 1n, 0n, `${JSON.stringify(t)}: a tie goes to the even mantissa`);
    }
    if (n % d === 0n) assert.equal(x, Number(n / d), "integer results equal the spec's correctly rounded BigInt conversion");
    checked++;
  }
  assert.equal(secondsOf({ value: 2 ** 52 + 1, rate: rateOf(1, 3) }), 13_510_798_882_111_492, "3·(2^52+1) is a tie that rounds to the even neighbour");
  assert.equal(checked, 3002);
});

test("H06 self-review T13 (attempted red): absurd magnitudes refuse or answer immediately, never pathological work", () => {
  const started = performance.now(), max = rateOf(MAX_RATE_COMPONENT), tiny = rateOf(1, MAX_RATE_COMPONENT);
  assert.equal(decodeLegacySeconds(Number.MIN_VALUE, max), undefined);
  assert.equal(decodeLegacySeconds(Number.MAX_VALUE, max), undefined);
  assert.equal(decodeLegacySeconds(Number.MAX_VALUE, tiny), undefined);
  assert.equal(errorCode(() => addTimes(tickTime(1, MAX_RATE_COMPONENT), tickTime(1, MAX_RATE_COMPONENT - 2))), "limit_exceeded", "coprime maximal rates cannot combine");
  assert.equal(errorCode(() => canonicalTime({ value: Number.MAX_SAFE_INTEGER, rate: tiny })), "limit_exceeded");
  assert.equal(errorCode(() => convertTime({ value: Number.MAX_SAFE_INTEGER, rate: tiny }, max, "floor")), "limit_exceeded");
  assert.ok(formatSeconds({ value: Number.MAX_SAFE_INTEGER, rate: tiny }, 12).length > 30);
  assert.ok(performance.now() - started < 250, "bounded work");
});

test("H07 self-review T21 (attempted red): a legacy EditGraph reference is refused by version at every reader, before any replay", () => {
  const legacy = JSON.parse(readFileSync("tests/fixtures/edit-graph-0.1.0-float-seconds.json", "utf8")) as { editGraphId: string; artifactType: string; artifactVersion: string };
  const g = graphAt(offGridPlan(), 1000), artifact = supplied(legacy, "t3af_legacy_graph");
  assert.throws(() => new SuppliedArtifacts([...g.artifacts, artifact]).exact(artifact.ref, "EditGraph", EDIT_GRAPH_RECORD_VERSION),
    (e: Error) => /Exact EditGraph 0\.2\.0 reference required/.test(e.message));
  assert.throws(() => reportOf({ ...g, graphArtifact: artifact, artifacts: [...g.artifacts, artifact] }),
    (e: Error) => e instanceof EditGraphError && /Exact EditGraph 0\.2\.0 reference required/.test(e.message));
});

test("H08 self-review T17 (attempted red): exact source time one nanosecond apart never shares a DAG computation, while identical selected work shares its segment identity", () => {
  const a = renderDag(renderGraph({ sources: [srcA({ key: "t3af_ns_a", range: { startSeconds: 0.05, endSeconds: 2.05 } })] }));
  const b = renderDag(renderGraph({ sources: [srcA({ key: "t3af_ns_b", range: { startSeconds: 0.050000001, endSeconds: 2.050000001 } })] }));
  assert.deepEqual([clipNode(a).source.range.start, clipNode(b).source.range.start], [T(1, 20), T(50_000_001, 1_000_000_000)]);
  assert.notEqual(clipNode(a).computationId, clipNode(b).computationId, "different exact time, different DAG work identity");
  const [pa, pb] = [programOf(a), programOf(b)];
  assert.deepEqual([pa.segments[0]!.video.startFrame, pa.segments[0]!.video.endFrame], [pb.segments[0]!.video.startFrame, pb.segments[0]!.video.endFrame]);
  assert.equal(pa.segments[0]!.segmentComputationId, pb.segments[0]!.segmentComputationId, "identical selected frames and samples are identical rendered work");
});

test("H09 self-review T19 (attempted red): a frame table one ulp off the grid at one frame, bound by its own identity, is refused as non-constant timing", () => {
  const table = ntscFacts(), frameTimes = [...table.frameTimes];
  frameTimes[7] = fromBits(bitsOf(frameTimes[7]!) + 1n);
  assert.throws(() => compileRenderProgramFromDag(ntscDag({ table: { ...table, frameTimes } })), (e: Error & { code?: string }) => e.code === "source_frame_grid_unsupported");
});

test("H10 self-review T14 (attempted red): the render compiler reads floats only to decode the legacy frame table, and never reads a seconds field", () => {
  const source = readFileSync("packages/edit-render/program.ts", "utf8");
  assert.equal((source.match(/secondsOf\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /\.(?:startSeconds|endSeconds)\b|frameTimes\[/);
});
