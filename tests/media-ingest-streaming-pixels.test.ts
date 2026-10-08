// D1 RED: production mathematics is independent of the accepted test oracle.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as pixels from "../packages/media-ingest/pixels.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { ExactPixelVerificationSchema, type ExactPixelVerification } from "../packages/media-ingest/reencode.js";
import { createHash } from "node:crypto";
import { calibrationFrames } from "./support/canonical-reencode-media.js";
import { D4_ELEMENTS, transformYuv420p, verifyExactPixels, exactFrameDigest, type PixelTransform } from "./support/canonical-pixel-reference.js";
type Config = { sourceGeometry: { width: number; height: number }; outputGeometry: { width: number; height: number }; transform: PixelTransform; frameCount: number };
type Accumulator = { compare(index: number, source: Uint8Array, output: Uint8Array): void; finish(): ExactPixelVerification; readonly bufferAccounting: { fullFrameBuffers: number; frameBytes: number; digestBytes: number } };
const api = pixels as unknown as { ExactYuv420pVerifier: new(config: Config) => Accumulator };
const config = (transform: PixelTransform = "identity", count = 5): Config => ({ sourceGeometry: { width: 64, height: 48 },
  outputGeometry: ["rotate_90_cw", "rotate_90_ccw", "transpose", "transverse"].includes(transform) ? { width: 48, height: 64 } : { width: 64, height: 48 }, transform, frameCount: count });
function verifier(c = config()) { assert.equal(typeof api.ExactYuv420pVerifier, "function", "production exact frame accumulator is required"); return new api.ExactYuv420pVerifier(c); }
for (const transform of ["identity", ...D4_ELEMENTS] as const) test("CD-PIXELS-" + transform + ": every plane and wire digest agree with the independent oracle", () => {
  const source = calibrationFrames(64, 48, 5), output = source.map(f => transformYuv420p(f, transform)), v = verifier(config(transform));
  for (let i = 0; i < source.length; i++) v.compare(i, source[i]!.bytes, output[i]!.bytes);
  const actual = v.finish(); assert.deepEqual(actual, verifyExactPixels(source, output, transform));
  assert.ok(ExactPixelVerificationSchema.safeParse(actual).success);
  assert.deepEqual(v.bufferAccounting, { fullFrameBuffers: 3, frameBytes: 3 * 4608, digestBytes: 5 * 3 * 32 });
});
test("CD-PIXELS-wire: BE header length, canonical UTF8, Y/U/V and indexed ordered sequence are literal", () => {
  const source = calibrationFrames(64, 48, 2).slice(0, 1), v = verifier(config("identity", 1)), b = source[0]!.bytes;
  v.compare(0, b, b); const result = v.finish();
  const header = Buffer.from('{"height":48,"index":0,"method":"exact_yuv420p_planes_sha256_by_index_v1","pixelFormat":"yuv420p","planes":[{"length":3072,"name":"Y"},{"length":768,"name":"U"},{"length":768,"name":"V"}],"width":64}', "utf8");
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  const digest = createHash("sha256").update(length).update(header).update(b).digest("hex");
  assert.equal(result.frameDigests.source[0], digest); assert.equal(digest, exactFrameDigest(source[0]!, 0));
  assert.equal(result.sourceDigest, createHash("sha256").update(canonicalSerialize({ method: result.method, frameCount: 1, frames: [{ index: 0, digest }] })).digest("hex"));
});
for (const [plane, offset] of [["Y", 0], ["U", 3072], ["V", 3840]] as const)
test("CD-PIXELS-corruption-" + plane + ": one changed sample cannot be blessed by its own hash", () => {
  const source = calibrationFrames(64, 48, 2)[0]!, bad = source.bytes.slice(); bad[offset] = bad[offset]! ^ 1;
  const v = verifier(config("identity", 1)); assert.throws(() => v.compare(0, source.bytes, bad), /exact_sample_mismatch/);
  assert.throws(() => v.finish(), /verification_incomplete|verification_failed/);
});
for (const failure of ["wrong-direction", "swap-uv", "reorder", "duplicate", "partial-source", "partial-output", "extra-index", "wrong-index"] as const)
test("CD-PIXELS-" + failure + ": adversarial frame sequence refused", () => {
  const source = calibrationFrames(64, 48, 5), transform = failure === "wrong-direction" ? "rotate_90_cw" : "identity";
  const v = verifier(config(transform)), original = source[0]!;
  let output: Uint8Array = original.bytes.slice(), input: Uint8Array = original.bytes; let index = 0;
  if (failure === "wrong-direction") output = transformYuv420p(original, "rotate_90_ccw").bytes;
  if (failure === "swap-uv") { output.set(original.bytes.subarray(3840), 3072); output.set(original.bytes.subarray(3072, 3840), 3840); }
  if (failure === "reorder") output = source[1]!.bytes;
  if (failure === "duplicate") { v.compare(0, input, output); input = source[1]!.bytes; index = 1; }
  if (failure === "partial-source") input = input.subarray(0, input.length - 1);
  if (failure === "partial-output") output = output.subarray(0, output.length - 1);
  if (failure === "extra-index") index = 5;
  if (failure === "wrong-index") index = 1;
  assert.throws(() => v.compare(index, input, output));
});
for (const patch of [
  { frameCount: 0 }, { frameCount: 72001 }, { frameCount: Number.MAX_SAFE_INTEGER }, { frameCount: 1.5 },
  { sourceGeometry: { width: 63, height: 48 } }, { sourceGeometry: { width: 16384, height: 16384 } },
  { sourceGeometry: { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER } },
  { outputGeometry: { width: 48, height: 64 } }, { transform: "scale" }, { pixelFormat: "yuv420p10le" }
]) test("CD-PIXELS-resource/configuration-refusal " + JSON.stringify(patch), () => { assert.throws(() => verifier({ ...config(), ...patch } as Config)); });
test("CD-PIXELS-no-frame-retention: 120 distinct frames use exactly three full-frame slots", () => {
  const v = verifier(config("transverse", 120));
  for (let index = 0; index < 120; index++) {
    const frame = calibrationFrames(64, 48, 2)[0]!; frame.bytes[0] = index;
    v.compare(index, frame.bytes, transformYuv420p(frame, "transverse").bytes);
    assert.equal(v.bufferAccounting.frameBytes, 3 * 4608);
  }
  assert.equal(v.finish().frameCount, 120); assert.equal(v.bufferAccounting.digestBytes, 120 * 96);
  assert.throws(() => v.compare(120, new Uint8Array(4608), new Uint8Array(4608)));
});
test("CD-PIXELS-incomplete: no evidence before all expected frames", () => { assert.throws(() => verifier().finish(), /verification_incomplete/); });
