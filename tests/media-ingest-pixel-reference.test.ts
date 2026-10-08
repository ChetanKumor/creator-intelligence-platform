import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as reference from "./support/canonical-pixel-reference.js";

interface Frame { pixelFormat: string; width: number; height: number; bytes: Uint8Array }
const api = reference as unknown as {
  transformYuv420p(frame: Frame, transform: string): Frame;
  exactFrameDigest(frame: Frame, index: number): string;
  verifyExactPixels(source: Frame[], output: Frame[], transform: string): { sampleMismatchCount: number; maximumAbsoluteSampleError: number;
    expectedDigest: string; outputDigest: string; sourceDigest: string; frameCount: number };
};
const source = (): Frame => ({ pixelFormat: "yuv420p", width: 4, height: 2, bytes: Uint8Array.from([1,2,3,4,5,6,7,8,21,22,31,32]) });
// Manually enumerated destination rows. Neither these values nor the reference uses an FFmpeg filter.
const cases = [
  ["rotate_90_ccw", 2, 4, [4,8,3,7,2,6,1,5,22,21,32,31]],
  ["rotate_180", 4, 2, [8,7,6,5,4,3,2,1,22,21,32,31]],
  ["rotate_90_cw", 2, 4, [5,1,6,2,7,3,8,4,21,22,31,32]],
  ["mirror_horizontal", 4, 2, [4,3,2,1,8,7,6,5,22,21,32,31]],
  ["mirror_vertical", 4, 2, [5,6,7,8,1,2,3,4,21,22,31,32]],
  ["transpose", 2, 4, [1,5,2,6,3,7,4,8,21,22,31,32]],
  ["transverse", 2, 4, [8,4,7,3,6,2,5,1,22,21,32,31]],
] as const;
for (const [element, width, height, values] of cases) test(`B1-P-${element}: independently enumerated Y/U/V permutation`, () => {
  const input = source(), before = input.bytes.slice(), output = api.transformYuv420p(input, element);
  assert.equal(output.width, width); assert.equal(output.height, height); assert.equal(output.pixelFormat, "yuv420p");
  assert.deepEqual([...output.bytes], values); assert.deepEqual(input.bytes, before);
  const verified = api.verifyExactPixels([input], [output], element);
  assert.equal(verified.sampleMismatchCount, 0); assert.equal(verified.maximumAbsoluteSampleError, 0);
  assert.equal(verified.expectedDigest, verified.outputDigest); assert.equal(verified.frameCount, 1);
});
test("B1-P-identity: exact identity, every sample and frame bound", () => {
  const a = source(), b = source(); b.bytes[0] = 17;
  const result = api.verifyExactPixels([a,b], [a,b], "identity");
  assert.equal(result.sourceDigest, result.outputDigest);
  assert.notEqual(api.exactFrameDigest(a, 0), api.exactFrameDigest(a, 1));
  assert.notEqual(api.exactFrameDigest(a, 0), api.exactFrameDigest({ ...a, width: 2, height: 4 }, 0));
  assert.throws(() => api.exactFrameDigest({ ...a, pixelFormat: "yuv422p" }, 0));
  for (const bad of [[a], [a,a], [b,a], [a,b,b]]) assert.throws(() => api.verifyExactPixels([a,b], bad, "identity"));
});
test("B1-P-hostile: one-sample Y, U or V errors always fail, including error=1", () => {
  for (const index of [0,8,10]) {
    const bad = source(); bad.bytes[index]! += 1;
    assert.throws(() => api.verifyExactPixels([source()], [bad], "identity"));
  }
});
test("B1-P-geometry: malformed geometry, bytes and unknown transforms refuse", () => {
  for (const patch of [{ width: 3 }, { height: 1 }, { width: 0 }, { width: 2.5 }, { bytes: new Uint8Array(11) }, { pixelFormat: "yuvj420p" }]) {
    assert.throws(() => api.transformYuv420p({ ...source(), ...patch }, "rotate_90_cw"));
  }
  assert.throws(() => api.transformYuv420p(source(), "rotate_45"));
});
test("B1-P-direction: inverse, double application and confused axes fail", () => {
  const pair = [["rotate_90_cw","rotate_90_ccw"], ["mirror_horizontal","mirror_vertical"], ["transpose","transverse"]];
  for (const [expected, wrong] of pair) {
    assert.throws(() => api.verifyExactPixels([source()], [api.transformYuv420p(source(), wrong!)], expected!));
    const once = api.transformYuv420p(source(), expected!);
    assert.throws(() => api.verifyExactPixels([source()], [api.transformYuv420p(once, expected!)], expected!));
  }
});
test("B1-P-digest-wire-format: independent literal header binds format, dimensions, index and all planes",() => {
  const header=Buffer.from('{"height":2,"index":0,"method":"exact_yuv420p_planes_sha256_by_index_v1","pixelFormat":"yuv420p","planes":[{"length":8,"name":"Y"},{"length":2,"name":"U"},{"length":2,"name":"V"}],"width":4}');
  const length=Buffer.alloc(4); length.writeUInt32BE(header.length);
  const expected=createHash("sha256").update(length).update(header).update(Uint8Array.from([1,2,3,4,5,6,7,8,21,22,31,32])).digest("hex");
  assert.equal(api.exactFrameDigest(source(),0),expected);
});
