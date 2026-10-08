import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import * as reencode from "../packages/media-ingest/reencode.js";
import { facts, videoStream, audioStream, composedSource, MATRICES, D4_ELEMENTS, SAR_1_1, SAR_UNSPECIFIED, piecewise30to24to15,
  heldFirstFrame, sideData, sei, X265_UUID, clone, sha, type Json } from "./support/canonical-facts.js";
import * as ingest from "../packages/media-ingest/index.js";
import { identify } from "../packages/editorial/common.js";
import { root } from "./support/canonical-media.js";
import { transformYuv420p, verifyExactPixels, exactFrameDigest, type RawYuvFrame } from "./support/canonical-pixel-reference.js";

const api = reencode as unknown as {
  planCanonicalReencode(facts: unknown): { outcome: string; plan: Json | null; evaluation: ingest.CanonicalProfileEvaluation; reason: string };
  CanonicalReencodePlanSchema: { safeParse(value: unknown): { success: boolean } };
  CanonicalReencodeDerivationSchema: { safeParse(value: unknown): { success: boolean } };
  canonicalReencodeComputationIdOf(input: unknown): string;
  buildCanonicalReencodeDerivation(input: unknown): Json;
  CANONICAL_LOSSLESS_ENCODE_PROFILE: Json;
  CANONICAL_REENCODE_TOOLCHAIN: Json;
};
const d4Facts = (element: keyof typeof MATRICES = "rotate_90_cw", codec = "h264"): Json => facts([videoStream({ codec,
  displayMatrix: { state: "present", coefficients: [...MATRICES[element]] } })]);
const mustPlan = (f: Json) => { const p = api.planCanonicalReencode(f); assert.equal(p.outcome, "PLAN"); assert.ok(p.plan); return p.plan; };
for (const element of D4_ELEMENTS) test(`B1-C-D4-${element}: typed transform and exact expected geometry`, () => {
  const p = mustPlan(d4Facts(element)), swap = ["rotate_90_cw","rotate_90_ccw","transpose","transverse"].includes(element);
  assert.equal(p.transform, element);
  assert.deepEqual(p.outputGeometry, { width: swap ? 1080 : 1920, height: swap ? 1920 : 1080 });
  assert.ok(api.CanonicalReencodePlanSchema.safeParse(p).success);
  assert.equal(ingest.planCanonicalizationV1(d4Facts(element)).outcome, "DEFER", "accepted v1 unchanged");
});
test("B1-C-HEVC: identity conversion, composition and truthful unspecified descriptions", () => {
  const f = facts([videoStream({ codec: "hevc", color: { range: "tv", primaries: null, transfer: null, matrix: null }, sideData: [sei(X265_UUID)] })]);
  const p = mustPlan(f); assert.equal(p.transform, "identity");
  assert.deepEqual((p.color as Json).source, { range: "tv", primaries: null, transfer: null, matrix: null });
  assert.equal((p.color as Json).interpretation, "interpreted_as_bt709_v1");
  assert.equal(mustPlan(d4Facts("transpose","hevc")).transform, "transpose");
});
test("B1-C-composition: accepted five-operation parameters and order, without changing v1 identity", () => {
  const base = composedSource(), composed = clone(base), v = (composed.streams as Json[])[0]!;
  Object.assign(v, { codec: "hevc", displayMatrix: { state: "present", coefficients: [...MATRICES.rotate_90_cw] } });
  const p = mustPlan(composed), old = ingest.planCanonicalizationV1(base).plan!;
  assert.deepEqual(p.operations, old.operations);
  assert.deepEqual(p.streams, old.streams);
  assert.equal(old.planVersion, "1.0.0"); assert.equal(old.executionClass, "remux");
});
for (const [name, patch] of Object.entries({
  tenBit: { bitDepth: 10, pixelFormat: "yuv420p10le" }, pq: { color: { range: "tv", primaries: "bt709", transfer: "smpte2084", matrix: "bt709" } },
  hlg: { color: { range: "tv", primaries: "bt709", transfer: "arib-std-b67", matrix: "bt709" } },
  bt2020: { color: { range: "tv", primaries: "bt2020", transfer: "bt709", matrix: "bt2020nc" } },
  fullRange: { color: { range: "pc", primaries: "bt709", transfer: "bt709", matrix: "bt709" } },
  unknownRange: { color: { range: null, primaries: null, transfer: null, matrix: null } },
  yuv422: { pixelFormat: "yuv422p" }, yuv444: { pixelFormat: "yuv444p" }, interlace: { fieldOrder: "tt" },
  unknownSideData: { sideData: [sideData("unknown")] }, cleanAperture: { frameCropping: { state: "present", top: 0, left: 0, right: 0, bottom: 0 } },
  crop: { frameCropping: { state: "present", top: 0, left: 0, right: 2, bottom: 0 } },
  conflictingSar: { sampleAspectRatio: { container: SAR_1_1, bitstream: { state: "declared", numerator: 4, denominator: 3 } } },
  oddGeometry: { geometry: { declared: { width: 1919, height: 1080 }, decoded: [{ width: 1919, height: 1080 }] } },
  heldFirst: { timeBase: { numerator: 1, denominator: 1200000 }, declaredFrameRate: { numerator: 60, denominator: 1 }, presentationTimestamps: heldFirstFrame() },
})) test(`B1-C-refuse-${name}: supported HEVC/D4 never hides a second finding`, () => {
  const f = d4Facts("mirror_horizontal","hevc"); Object.assign((f.streams as Json[])[0]!, patch);
  assert.equal(api.planCanonicalReencode(f).outcome, "REFUSE"); assert.equal(api.planCanonicalReencode(f).plan, null);
});
for (const [name, patch] of Object.entries({ nonSquare: { sampleAspectRatio: { container: { state: "declared", numerator: 4, denominator: 3 }, bitstream: SAR_UNSPECIFIED } },
  vfr: { timeBase: { numerator: 1, denominator: 90000 }, presentationTimestamps: piecewise30to24to15() } })) test(`B1-C-defer-${name}`, () => {
  const f = d4Facts("mirror_horizontal","hevc"); Object.assign((f.streams as Json[])[0]!, patch);
  assert.equal(api.planCanonicalReencode(f).outcome, "DEFER"); assert.equal(api.planCanonicalReencode(f).plan, null);
});
for (const element of ["translate","scale2x1","shear","perspective","wNotUnit","rotate45","rotate90Translate"] as const) test(`B1-C-matrix-${element}`, () => {
  assert.equal(api.planCanonicalReencode(d4Facts(element)).outcome, "REFUSE");
});
test("B1-C-carriers: consume exactly one semantic transform, refuse frame-only/different/varying", () => {
  const f = d4Facts(), v = (f.streams as Json[])[0]!, matrix = [...MATRICES.rotate_90_cw];
  v.sideData = [sideData("display_matrix")];
  const carriers = { observation: "ffprobe_9_0_1_threads_1_matrix_carriers_v1", stream: [matrix], frames: Array.from({ length: 60 }, () => [matrix]) };
  v.displayMatrixCarriers = carriers; assert.equal(mustPlan(f).transform, "rotate_90_cw");
  for (const change of [(c: typeof carriers) => { c.stream = []; }, (c: typeof carriers) => { c.frames[0] = [[...MATRICES.mirror_vertical]]; },
    (c: typeof carriers) => { c.frames.pop(); }, (c: typeof carriers) => { c.stream.push(matrix); }]) {
    const bad = clone(f); change((bad.streams as Json[])[0]!.displayMatrixCarriers as typeof carriers);
    assert.equal(api.planCanonicalReencode(bad).outcome, "REFUSE");
  }
});
test("B1-C-routing: direct and remux media remain on accepted ingest authority", () => {
  assert.equal(api.planCanonicalReencode(facts()).outcome, "EXISTING_PATH");
  const f = facts([videoStream({ sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED } })]);
  assert.equal(api.planCanonicalReencode(f).outcome, "EXISTING_PATH");
});
test("B1-C-closed: encode policy is fixed, no argv/profile injection or alternate lossy profile", () => {
  const p = mustPlan(d4Facts());
  assert.equal((p.encodeProfile as Json).rateControl, "constant_qp_zero_lossless");
  assert.equal((p.encodeProfile as Json).qp,0); assert.equal((p.encodeProfile as Json).preset,"medium");
  assert.equal((p.encodeProfile as Json).h264Profile,"high444"); assert.equal((p.encodeProfile as Json).pixelFormat,"yuv420p");
  assert.deepEqual((p.encodeProfile as Json).threads,{decode:1,encode:2,lookahead:1,sliced:false,filter:1});
  for (const key of ["argv","path","projectId","timestamp","random","quality"]) assert.equal(api.CanonicalReencodePlanSchema.safeParse({ ...p, [key]: "injected" }).success, false);
  const bad = { ...p, encodeProfile: { ...(p.encodeProfile as Json), rateControl: "crf", crf: 10 } };
  assert.equal(api.CanonicalReencodePlanSchema.safeParse(bad).success, false);
  for (const key of ["argv","encodeProfile","operations","cachedPixels"]) assert.equal(api.planCanonicalReencode({ ...d4Facts(), [key]: [] }).outcome, "REFUSE");
});
test("B1-C-computation: binds bytes, complete plan, encoder and toolchain; excludes scope/path/time", () => {
  const p = mustPlan(d4Facts()), source = { assetId: `asset_${sha("source")}`, contentHash: sha("source"), sizeBytes: 123 };
  const input = { source, plan: p, toolchain: api.CANONICAL_REENCODE_TOOLCHAIN };
  const id = api.canonicalReencodeComputationIdOf(input);
  assert.equal(api.canonicalReencodeComputationIdOf({ ...input, path: "ignored", creatorId: "other", timestamp: "other", random: 7 }), id);
  assert.notEqual(api.canonicalReencodeComputationIdOf({ ...input, source: { ...source, contentHash: sha("other"), assetId: `asset_${sha("other")}` } }), id);
  assert.notEqual(api.canonicalReencodeComputationIdOf({ ...input, plan: mustPlan(d4Facts("transpose")) }), id);
});
test("B1-C-profile-policy: even a newly self-hashed plan cannot select another encode profile",() => {
  const {planId:ignored,...body}=structuredClone(mustPlan(d4Facts())); void ignored;
  Reflect.set(body.encodeProfile as object,"qp",10);
  assert.equal(api.CanonicalReencodePlanSchema.safeParse(identify("canonical_reencode_plan_v1","planId",body)).success,false);
});
test("B1-C-independent-reference: no FFmpeg filter/process dependency in mathematical oracle", () => {
  const source = readFileSync("tests/support/canonical-pixel-reference.ts", "utf8");
  assert.doesNotMatch(source, /from ["'][^"']*(?:media-fixtures|reencode-media|child_process)|\bspawn\s*\(|\bexec\s*\(|transpose=/);
  assert.match(source, /for \(const divisor of \[1,2,2\]\)/);
});

const measuredFrames = (): RawYuvFrame[] => Array.from({length:60},(_,i) => ({pixelFormat:"yuv420p",width:4,height:2,
  bytes:Uint8Array.from({length:12},(_,j) => (i*17+j*7)%256)}));
function pureDerivation(audio=false) {
  const sourceFrames = measuredFrames(), outputFrames = sourceFrames.map(f => transformYuv420p(f,"rotate_90_cw"));
  const input = facts([videoStream({geometry:{declared:{width:4,height:2},decoded:[{width:4,height:2}]},
    displayMatrix:{state:"present",coefficients:[...MATRICES.rotate_90_cw]}}),...(audio ? [audioStream()] : [])]);
  const output = facts([videoStream({geometry:{declared:{width:2,height:4},decoded:[{width:2,height:4}]}}),...(audio ? [audioStream()] : [])]);
  return reencode.buildCanonicalReencodeDerivation({rootAuthorization:root(),sourceFacts:input,plan:reencode.planCanonicalReencode(input).plan,
    output:{contentHash:sha("new lossless pixels"),sizeBytes:12345,facts:output},pixels:verifyExactPixels(sourceFrames,outputFrames,"rotate_90_cw"),
    audioPackets:audio ? {method:ingest.PLAN_VERIFICATION_METHODS.audioPackets,sourceDigest:sha("audio packets by index"),outputDigest:sha("audio packets by index")} : null});
}
test("B1-C-record: exact evidence, evaluated facts, transform truth and new identities replay",() => {
  const d = pureDerivation(); assert.ok(reencode.CanonicalReencodeDerivationSchema.safeParse(d).success);
  assert.equal(d.artifactVersion,"0.3.0"); assert.match(d.derivationId,/^canonical_media_derivation_v2_/);
  assert.match(d.computationId,/^canonical_media_computation_v2_/);
  assert.notEqual(d.verification.pixels.sourceDigest,d.verification.pixels.expectedDigest);
  assert.equal(d.verification.pixels.outputDigest,d.verification.pixels.expectedDigest);
  assert.equal(d.source.evaluation.outcome,"CANONICALIZABLE_REENCODE_DEFERRED"); assert.equal(d.output.evaluation.outcome,"CONFORMS");
  assert.equal(ingest.AnyCanonicalMediaDerivationSchema.safeParse(d).success,false,"old accepted union is unchanged; B2-B2 integration still required");
});
test("B1-C-audio: changed packet payload fails even with self-consistent record identity",() => {
  const d=pureDerivation(true); assert.ok(d.verification.audioPackets);
  d.verification.audioPackets.outputDigest=sha("changed audio payload");
  const {derivationId:ignored,...body}=d; void ignored;
  assert.equal(reencode.CanonicalReencodeDerivationSchema.safeParse(identify("canonical_media_derivation_v2","derivationId",body)).success,false);
});
const recordAttacks: Record<string,(d:reencode.CanonicalReencodeDerivation) => void> = {
  nonzeroError:d => { Reflect.set(d.verification.pixels,"maximumAbsoluteSampleError",1); },
  nonzeroMismatch:d => { Reflect.set(d.verification.pixels,"sampleMismatchCount",1); },
  chromaMismatch:d => { Reflect.set(d.verification.pixels.perPlaneMismatch,"U",1); },
  formatOmitted:d => { Reflect.deleteProperty(d.verification.pixels,"pixelFormat"); },
  geometryOmitted:d => { Reflect.deleteProperty(d.verification.pixels,"outputGeometry"); },
  wrongTransform:d => { d.verification.pixels.transform="rotate_90_ccw"; },
  wrongGeometry:d => { d.verification.pixels.outputGeometry={width:4,height:2}; },
  dropFrame:d => { d.verification.pixels.frameDigests.output.pop(); },
  duplicateFrame:d => { d.verification.pixels.frameDigests.output[1]=d.verification.pixels.frameDigests.output[0]!; },
  reorderFrames:d => { d.verification.pixels.frameDigests.output.reverse(); },
  unboundDigest:d => { d.verification.pixels.sourceDigest=sha("arbitrary"); },
  assumedCameraColor:d => { d.plan.color.source.primaries=null; },
  residualMatrix:d => { const v=d.output.facts.streams[0]!; if(v.kind==="video") v.displayMatrix={state:"present",coefficients:[...MATRICES.rotate_90_cw]}; },
  staleFacts:d => { d.output.factsDigest=sha("cached"); },
  cachedEvaluation:d => { d.output.evaluation=d.source.evaluation; },
  callerArgv:d => { Reflect.set(d.plan,"argv",["-crf","10"]); },
  lossyQp:d => { Reflect.set(d.plan.encodeProfile,"qp",10); },
  forgedTool:d => { Reflect.set(d.toolchain.canonicalizer,"implementationDigest",sha("other")); },
  inventedAudio:d => { d.verification.audioPackets={method:ingest.PLAN_VERIFICATION_METHODS.audioPackets,sourceDigest:sha("x"),outputDigest:sha("y")}; },
  changedSource:d => { d.source.contentHash=sha("different held source"); },
  timeInPlan:d => { Reflect.set(d.plan,"timestamp","now"); },
  brokenTiming:d => { const v=d.output.facts.streams[0]!; if(v.kind==="video") v.presentationTimestamps[2]!++; },
};
for(const [name,attack] of Object.entries(recordAttacks)) test(`B1-C-record-hostile-${name}: self-hashed tampering is refused`,() => {
  const d=structuredClone(pureDerivation()); attack(d);
  const {derivationId:ignored,...body}=d; void ignored;
  assert.equal(reencode.CanonicalReencodeDerivationSchema.safeParse(identify("canonical_media_derivation_v2","derivationId",body)).success,false);
});
test("B1-C-pixels: chroma-only corruption, silent value conversion, frame count/order and format/geometry fail",() => {
  const source=measuredFrames();
  for(const at of [0,8,10]) { const output=structuredClone(source); output[0]!.bytes[at]!++; assert.throws(() => verifyExactPixels(source,output,"identity")); }
  assert.throws(() => verifyExactPixels(source,source.slice(1),"identity"));
  assert.throws(() => verifyExactPixels(source,[source[0]!,...source.slice(0,-1)],"identity"));
  assert.throws(() => verifyExactPixels(source,[...source].reverse(),"identity"));
  assert.notEqual(exactFrameDigest(source[0]!,0),exactFrameDigest({...source[0]!,width:2,height:4},0));
  assert.throws(() => exactFrameDigest({...source[0]!,pixelFormat:"yuv444p"},0));
});
test("B1-C-frozen: accepted N1, Profile v1, Plan v1, 0.2 derivation and execution bytes remain exact",() => {
  assert.equal(ingest.CANONICALIZATION_PLAN_IDENTITY,"canonicalization_plan_v1");
  const pins: Record<string,string> = {
    "packages/media-ingest/canonical.ts":"f7b2cae9410625c426bd579ae43d93228eb0adbd053459221ba14320d8cc0332",
    "packages/media-ingest/profile.ts":"7dfb89591d2a75e5cb2f3c068da59ea301145c777720e9fd1322153564febc94",
    "packages/media-ingest/plan.ts":"29a5c4b8e0eacb0ddbdd6bc27909078e26d5482bf96b3de23a11780ef9a35f39",
    "scripts/media-ingest-local.ts":"8bfd56980d2cb1d5693cc924e73a6ccfb7c86eba29ec9b101bf4729e13aa6fd8",
  };
  for(const [path,digest] of Object.entries(pins)) assert.equal(sha(readFileSync(path,"utf8")),digest,path);
});
