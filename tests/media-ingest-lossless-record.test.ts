// F1 RED first. Synthetic structural records do not claim fresh media verification.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { CANONICAL_STORE } from "../packages/edit-render/owner-media.js";
import { buildCanonicalReencodeDerivation, planCanonicalReencode } from "../packages/media-ingest/reencode.js";
import { buildChromaSafeDerivation, makeCanonicalChromaObservation, planChromaSafeReencode, CHROMA_OBSERVATION_METHOD } from "../packages/media-ingest/chroma.js";
import { facts, videoStream, sha, clone, type Json } from "./support/canonical-facts.js";
import { root } from "./support/canonical-media.js";
import { verifyExactPixels, type RawYuvFrame } from "./support/canonical-pixel-reference.js";
type Api = { compactLosslessComputationRecordOf(d: unknown, format: unknown): { bytes: string; record: Json };
  parseLosslessComputationRecordBytes(bytes: unknown, plan: unknown): Json };
let api: Api;
before(async () => { const modulePath = "../packages/media-ingest/lossless-record.js";
  api = await import(modulePath).catch(() => ({})) as Api; });
const format = { family: "iso_bmff", format: "mp4", majorBrand: "isom", compatibleBrands: ["isom", "iso2", "avc1", "mp41"],
  fileTypeBoxDigest: sha("synthetic-ftyp"), video: { codec: "h264", profile: "High 4:4:4 Predictive", pixelFormat: "yuv420p" } };
function fixture(count = 3, scope = { creatorId: "creator_ef_one", projectId: "project_ef_one" }) {
  const pts = Array.from({ length: count }, (_, i) => i * 512), geometry = { width: 4, height: 2 }, auth = root(scope);
  const source = { assetId: "asset_" + auth.contentHash, contentHash: auth.contentHash, sizeBytes: auth.sizeBytes };
  const sf = facts([videoStream({ codec: "hevc", geometry: { declared: geometry, decoded: [geometry] }, presentationTimestamps: pts })]);
  const of = facts([videoStream({ geometry: { declared: geometry, decoded: [geometry] }, presentationTimestamps: pts })]);
  const observation = (f: Json, identity: typeof source, codec: "h264" | "hevc") => makeCanonicalChromaObservation({ source: {
    assetId: identity.assetId, contentHash: identity.contentHash, sizeBytes: identity.sizeBytes },
    factsDigest: sha(canonicalSerialize(f)), method: CHROMA_OBSERVATION_METHOD, codec, streamIndex: 0,
    container: { trackId: 1, sampleEntry: codec === "hevc" ? "hev1" : "avc1", entries: [{ type: codec === "hevc" ? "hvcC" : "avcC", payloadBytes: 32, payloadHash: sha("synthetic config") }] },
    bitstream: [{ spsIndex: 0, chromaFormatIdc: 1, frameMbsOnlyFlag: codec === "h264" ? 1 : null, vuiPresent: 1, locationPresent: 1, topFieldType: 1, bottomFieldType: 1 }],
    streamReported: "center", frames: pts.map((pts, index) => ({ index, pts, reported: "center" })) });
  const p = planChromaSafeReencode({ source, sourceFacts: sf, sourceChroma: observation(sf, source, "hevc") }); assert.ok(p.plan);
  const frames: RawYuvFrame[] = pts.map((_, i) => ({ pixelFormat: "yuv420p", ...geometry, bytes: Uint8Array.from({ length: 12 }, (_, j) => (i * 31 + j * 7) % 256) }));
  const sample = buildCanonicalReencodeDerivation({ rootAuthorization: auth, sourceFacts: sf, plan: planCanonicalReencode(sf).plan,
    output: { contentHash: sha("synthetic encoded output"), sizeBytes: 12345, facts: of }, pixels: verifyExactPixels(frames, frames, "identity"), audioPackets: null });
  return buildChromaSafeDerivation({ sampleDerivation: sample, plan: p.plan, outputChroma: observation(of, sample.output, "h264") });
}
function record(count = 3) { assert.equal(typeof api.compactLosslessComputationRecordOf, "function", "compact scope-free lossless record is required");
  const d = fixture(count); return { d, ...api.compactLosslessComputationRecordOf(d, format) }; }
test("EF-RECORD-identity: separate domain, v3 computation, deterministic canonical LF bytes", () => {
  const a = record(), b = api.compactLosslessComputationRecordOf(clone(a.d), clone(format));
  assert.deepEqual(a.record, b.record); assert.equal(a.bytes, canonicalSerialize(a.record) + "\n");
  assert.equal(a.record.artifactVersion, "0.4.0"); assert.match(a.record.recordId as string, /^canonical_lossless_computation_record_v1_/);
  assert.match(a.record.computationId as string, /^canonical_media_computation_v3_/);
  assert.deepEqual(api.parseLosslessComputationRecordBytes(a.bytes, a.d.plan), a.record);
});
test("EF-RECORD-large-proof: complete frame proof exceeds store bound; compact projection stays bounded", () => {
  const a = record(2000); assert.ok(Buffer.byteLength(canonicalSerialize(a.d)) > CANONICAL_STORE.maxRecordBytes);
  assert.ok(Buffer.byteLength(a.bytes) < 16384); assert.ok(Buffer.byteLength(a.bytes) <= CANONICAL_STORE.maxRecordBytes);
  assert.equal(a.bytes.includes("frameDigests"), false); assert.equal(a.bytes.includes("rootAuthorization"), false);
  const pixels = (a.record.verification as Json).pixels as Json;
  assert.equal(pixels.frameCount, 2000); assert.equal(pixels.outputDigest, a.d.sampleDerivation.verification.pixels.outputDigest);
});
test("EF-RECORD-cross-scope: same bytes/computation share record, never a root or derivation identity", () => {
  const a = record(), other = fixture(3, { creatorId: "creator_ef_two", projectId: "project_ef_two" });
  assert.notEqual(a.d.derivationId, other.derivationId); assert.equal(a.bytes, api.compactLosslessComputationRecordOf(other, format).bytes);
  for (const text of ["creator_ef", "project_ef", "dateAdded", "rootAuthorization", "derivationId", "workspace", "authorization"])
    assert.equal(a.bytes.includes(text), false, text);
});
for (const key of ["artifactType", "artifactVersion", "computationId", "source", "plan", "toolchain", "output", "verification", "recordId"])
test("EF-RECORD-missing-" + key + ": strict rehashed omissions refuse", () => {
  const a = record(), bad = clone(a.record); delete bad[key]; delete bad.recordId;
  if (key === "recordId") { assert.throws(() => api.parseLosslessComputationRecordBytes(canonicalSerialize(bad) + "\n", a.d.plan)); return; }
  assert.throws(() => api.parseLosslessComputationRecordBytes(canonicalSerialize(identify("canonical_lossless_computation_record_v1", "recordId", bad)) + "\n", a.d.plan));
});
for (const [label, mutate] of [
  ["version", (r: Json) => { r.artifactVersion = "0.2.0"; }],
  ["extra", (r: Json) => { r.creatorId = "private_owner"; }],
  ["plan", (r: Json) => { (r.plan as Json).planId = "canonical_reencode_plan_v2_" + "a".repeat(64); }],
  ["computation", (r: Json) => { r.computationId = "canonical_media_computation_v3_" + "a".repeat(64); }],
  ["source", (r: Json) => { (r.source as Json).sizeBytes = 1; }],
  ["toolchain", (r: Json) => { r.toolchain = {}; }],
  ["method", (r: Json) => { ((r.verification as Json).pixels as Json).method = "hash_only"; }],
  ["nonzero", (r: Json) => { ((r.verification as Json).pixels as Json).sampleMismatchCount = 1; }],
  ["outputDigest", (r: Json) => { ((r.verification as Json).pixels as Json).outputDigest = "f".repeat(64); }],
  ["wrongFormat", (r: Json) => { ((r.output as Json).format as Json).format = "mov"; }],
  ["profile", (r: Json) => { (((r.output as Json).format as Json).video as Json).profile = "High"; }],
] as const) test("EF-RECORD-self-rehashed-" + label + ": compatible schema and current plan remain mandatory", () => {
  const a = record(), bad = clone(a.record); mutate(bad); delete bad.recordId;
  const bytes = canonicalSerialize(identify("canonical_lossless_computation_record_v1", "recordId", bad)) + "\n";
  assert.throws(() => api.parseLosslessComputationRecordBytes(bytes, a.d.plan));
});
test("EF-RECORD-wire: malformed, duplicate/noncanonical keys, overflow and wrong output identity refuse", () => {
  const a = record(); for (const bytes of ["{", a.bytes.replace("\n", ""), " " + a.bytes, "x".repeat(CANONICAL_STORE.maxRecordBytes + 1),
    a.bytes.replace('{"artifactType":', '{"artifactType":"other","artifactType":')]) assert.throws(() => api.parseLosslessComputationRecordBytes(bytes, a.d.plan));
  const bad = clone(a.record); (bad.output as Json).assetId = "asset_" + "f".repeat(64); delete bad.recordId;
  assert.throws(() => api.parseLosslessComputationRecordBytes(canonicalSerialize(identify("canonical_lossless_computation_record_v1", "recordId", bad)) + "\n", a.d.plan));
});
