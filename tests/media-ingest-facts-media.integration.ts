// B2-A2 RED-first fact extraction, on generated synthetic media only. No owner media, network or model.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { CanonicalMediaFactsSchema, planCanonicalizationV1, X264_ENCODER_INFO_SEI_UUID, type CanonicalMediaFacts } from "../packages/media-ingest/index.js";
import { generateFixture, generatePlanFixture, generatePlanVariant, independentProbe, sha256File, type PlanFixtureSpec } from "./support/canonical-media-fixtures.js";
import { FIXTURE_IDENTITY_MATRIX, patchPlanFixture } from "./support/canonical-plan-media.js";
import { observeMediaSpawns, PINNED_TOOL_ROOT } from "./support/edit-render-media.js";

type Request = local.CanonicalIngestRequest;
type Observed = { source: local.SourceIdentity; facts: CanonicalMediaFacts };
const api = local as unknown as Record<string, unknown>;
const inspect = (request: Request): Promise<Observed> => (api.inspectCanonicalLocalMedia as (r: Request) => Promise<Observed>)(request);
let base = "";
const fixtures: Record<string, string> = {};
const specs: Record<string, PlanFixtureSpec> = {
  square: {}, unspecifiedSar: { sar: "unspecified" }, nonSquare: { sar: "4:3" }, encoder: { sei: "encoder" },
  unknown: { sei: "unknown" }, untagged: { color: "unspecified" }, bt601: { color: "bt601" }, hdr: { color: "hdr" },
  reordered: { bFrames: true }, audio: { audio: "aac" }, hevc: { hevc: true, sei: "encoder" },
};
before(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "a2-facts-")));
  const directory = join(base, "generated"); await mkdir(directory);
  for (const [key, spec] of Object.entries(specs)) fixtures[key] = await generatePlanFixture(directory, `${key}.mp4`, spec);
  fixtures.conflict = await patchPlanFixture(fixtures.nonSquare!, join(directory, "conflict.mp4"), { pasp: [1, 1] });
  fixtures.flip = await patchPlanFixture(fixtures.square!, join(directory, "flip.mp4"), { matrix: FIXTURE_IDENTITY_MATRIX.map((v, i) => i === 4 ? -v : v) });
  fixtures.crop = await patchPlanFixture(fixtures.square!, join(directory, "crop.mp4"), { crop: true });
  fixtures.vfr = await generateFixture(directory, "vfr.mp4", { sar: "square", audio: "none", profileColor: true, timing: "vfr" });
  fixtures.held = await generatePlanVariant(fixtures.square!, join(directory, "held.mp4"), { heldFirst: true });
});
async function request(path: string): Promise<Request> {
  return { sourcePath: path, toolRoot: PINNED_TOOL_ROOT, workspaceRoot: base, clock: { now: () => "2026-10-07T00:00:00.000Z" },
    rootAuthorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", ...await sha256File(path), sourceType: "owner_supplied",
      authorizationBasis: "owner_created", allowedPurposes: ["local_footage_analysis"], dateAdded: "2026-10-01T00:00:00.000Z",
      creatorId: "creator_a2_facts", projectId: "project_a2_facts", canonicalizationConsent: "local_media_canonicalization" } };
}
const observation = async (key: string) => inspect(await request(fixtures[key]!));
const video = (facts: CanonicalMediaFacts) => { const v = facts.streams.find(s => s.kind === "video"); assert.ok(v?.kind === "video"); return v; };

test("A2-F01 trusted facts bind exact authorized bytes; caller facts, plans and argv cannot become authority", async () => {
  const r = await request(fixtures.square!), observed = await inspect(r);
  assert.ok(CanonicalMediaFactsSchema.safeParse(observed.facts).success);
  assert.deepEqual(observed.source, { ...await sha256File(r.sourcePath), assetId: `asset_${(await sha256File(r.sourcePath)).contentHash}` });
  for (const name of ["facts", "plan", "operations", "argv", "profileOutcome", "displayMatrix"]) {
    await assert.rejects(inspect({ ...r, [name]: observed.facts }), (e: { code?: string }) => e.code === "request_invalid");
  }
  await assert.rejects(inspect({ ...r, rootAuthorization: { ...(r.rootAuthorization as object), contentHash: "a".repeat(64) } }),
    (e: { code?: string }) => e.code === "source_mismatch");
});
test("A2-F02 container pasp and bitstream VUI are independently observed", async () => {
  assert.deepEqual(video((await observation("nonSquare")).facts).sampleAspectRatio, { container: { state: "declared", numerator: 4, denominator: 3 },
    bitstream: { state: "declared", numerator: 4, denominator: 3 } });
  assert.deepEqual(video((await observation("unspecifiedSar")).facts).sampleAspectRatio, { container: { state: "unspecified" }, bitstream: { state: "unspecified" } });
});
test("A2-F03 conflicting SAR remains a conflict even when the container reports square", async () => {
  const { facts } = await observation("conflict");
  assert.deepEqual(video(facts).sampleAspectRatio, { container: { state: "declared", numerator: 1, denominator: 1 }, bitstream: { state: "declared", numerator: 4, denominator: 3 } });
  assert.ok(planCanonicalizationV1(facts).evaluation.findings.some(f => f.code === "sar_declarations_conflict"));
});
test("A2-F04 full nine-coefficient display matrix survives extraction", async () => {
  const first = await observation("flip"), second = await observation("flip"), v = video(first.facts);
  const matrix = FIXTURE_IDENTITY_MATRIX.map((v, i) => i === 4 ? -v : v);
  assert.deepEqual(v.displayMatrix, { state: "present", coefficients: matrix });
  assert.deepEqual(v.displayMatrixCarriers, { observation: "ffprobe_9_0_1_threads_1_matrix_carriers_v1", stream: [matrix],
    frames: v.presentationTimestamps.map(() => [matrix]) });
  assert.deepEqual(v.sideData, [{ carrier: "frame", kind: "display_matrix", seiUuid: null }]);
  assert.deepEqual(second, first, "two fresh pinned observations retain every carrier identically");
});
test("A2-F05 a zero-degree vertical flip never becomes identity or DIRECT", async () => {
  assert.equal(planCanonicalizationV1((await observation("flip")).facts).outcome, "DEFER");
});
test("A2-F06 container clean aperture / Frame Cropping is detected", async () => {
  const { facts } = await observation("crop"); assert.equal(video(facts).frameCropping.state, "present");
  assert.ok(planCanonicalizationV1(facts).evaluation.findings.some(f => f.code === "frame_cropping_present"));
});
test("A2-F07 declared and actual decoded geometry remain distinct", async () => {
  const v = video((await observation("crop")).facts);
  assert.deepEqual(v.geometry, { declared: { width: 160, height: 90 }, decoded: [{ width: 140, height: 80 }] });
});
test("A2-F08 accepted x264 informational SEI carries its exact UUID and frame carrier", async () => {
  const { facts } = await observation("encoder");
  assert.deepEqual(video(facts).sideData, [{ carrier: "frame", kind: "user_data_unregistered_sei", seiUuid: X264_ENCODER_INFO_SEI_UUID }]);
  assert.equal(planCanonicalizationV1(facts).outcome, "DIRECT");
});
test("A2-F09 unknown SEI is never relabelled as encoder information", async () => {
  const { facts } = await observation("unknown"); assert.equal(planCanonicalizationV1(facts).outcome, "REFUSE");
  assert.ok(video(facts).sideData.some(s => s.seiUuid === "0123456789abcdef0123456789abcdef" || s.kind === "unknown"));
});
test("A2-F10 range, primaries, transfer and matrix are separate facts; unspecified range stays unspecified", async () => {
  assert.deepEqual(video((await observation("square")).facts).color, { range: "tv", primaries: "bt709", transfer: "bt709", matrix: "bt709" });
  const untagged = (await observation("untagged")).facts;
  assert.deepEqual(video(untagged).color, { range: null, primaries: null, transfer: null, matrix: null });
  assert.ok(planCanonicalizationV1(untagged).evaluation.findings.some(f => f.code === "color_range_unspecified"));
  assert.equal(video((await observation("bt601")).facts).color.primaries, "smpte170m");
  assert.equal(video((await observation("hdr")).facts).color.transfer, "smpte2084");
});
test("A2-F11 exact decoded presentation timestamps come from the bytes", async () => {
  const v = video((await observation("square")).facts);
  assert.equal(v.timeBase.numerator, 1); assert.equal(v.presentationTimestamps.length, 36);
  v.presentationTimestamps.forEach((p, i) => assert.equal(BigInt(p) * 30n, BigInt(i) * BigInt(v.timeBase.denominator)));
});
test("A2-F12 B-frame decode order does not turn a presentation CFR grid into VFR", async () => {
  const { facts } = await observation("reordered"); assert.equal(video(facts).decodeReordering, true);
  assert.equal(planCanonicalizationV1(facts).outcome, "DIRECT"); assert.equal(video(facts).presentationTimestamps.length, 36);
});
test("A2-F13 decoded audio PTS and sample counts equal an independent observation", async () => {
  const { facts } = await observation("audio"), a = facts.streams.find(s => s.kind === "audio"); assert.ok(a?.kind === "audio");
  const expected = JSON.parse(await independentProbe(fixtures.audio!, "frame=stream_index,pts,nb_samples")) as { frames: { stream_index: number; pts: number; nb_samples?: number }[] };
  assert.deepEqual(a.frames, expected.frames.filter(f => f.stream_index === a.index).map(f => ({ pts: f.pts, samples: f.nb_samples })));
  assert.equal(a.timeBase.denominator, a.sampleRateHz);
});
test("A2-F14 source mutation between extraction passes refuses", async () => {
  const path = join(base, "mutation.mp4"); await writeFile(path, await readFile(fixtures.square!), { flag: "wx" });
  const r = await request(path); let changed = false;
  r.instrumentation = { beforeProcess: async ({ role }) => {
    if (String(role) === "source_packets") { changed = true; const bytes = await readFile(path); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await writeFile(path, bytes); }
  } };
  await assert.rejects(inspect(r), (e: { code?: string }) => e.code === "source_changed"); assert.equal(changed, true);
});
test("A2-F15 authoritative side-data observation pins single-thread decoding", async () => {
  const observed = observeMediaSpawns();
  try {
    const { facts } = await observation("hevc"); assert.equal(planCanonicalizationV1(facts).outcome, "DEFER");
    const calls = observed.calls.filter(c => c.tool === "ffprobe" && c.arguments.some(a => a.includes("frame=")));
    assert.ok(calls.length > 0);
    for (const call of calls) assert.equal(call.arguments[call.arguments.indexOf("-threads") + 1], "1");
  } finally { observed.restore(); }
});

test("A2-R01/R05-R12 production admission is controlled by the profile", async () => {
  for (const [key, expected] of [["square", "DIRECT"], ["flip", "DEFER"], ["hevc", "DEFER"], ["nonSquare", "DEFER"],
    ["untagged", "REFUSE"], ["crop", "REFUSE"], ["hdr", "REFUSE"], ["unknown", "REFUSE"], ["conflict", "REFUSE"], ["bt601", "REFUSE"],
    ["vfr", "DEFER"], ["held", "REFUSE"]] as const) {
    const result = await local.canonicalizeLocalMedia(await request(fixtures[key]!));
    assert.equal(result.outcome, expected, key); assert.ok(!("authorization" in result));
  }
});
