// D1 process faults use already-created controlled children. They never mint runtime authority.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as local from "../scripts/media-ingest-local.js";
import { calibrationFrames } from "./support/canonical-reencode-media.js";
import { verifyExactPixels, type PixelTransform } from "./support/canonical-pixel-reference.js";
type Config = { sourceGeometry: { width: number; height: number }; outputGeometry: { width: number; height: number }; transform: PixelTransform; frameCount: number };
type Limits = { timeoutMilliseconds: number; terminationGraceMilliseconds: number };
type Child = EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill(): boolean };
type Result = { pixels: ReturnType<typeof verifyExactPixels>; resources: { maximumFullFrameBuffers: number; decodedFrameBufferBytes: number; digestBufferBytes: number; sourceQueuePeakBytes: number; outputQueuePeakBytes: number } };
const api = local as unknown as { verifyCanonicalLosslessDecodedChildren(source: Child, output: Child, config: Config, limits: Limits): Promise<Result> };
const frames = calibrationFrames(64, 48, 5), config: Config = { sourceGeometry: { width: 64, height: 48 }, outputGeometry: { width: 64, height: 48 }, transform: "identity", frameCount: 5 };
const limits = { timeoutMilliseconds: 1000, terminationGraceMilliseconds: 40 };
class Decoder extends EventEmitter {
  stdout = new PassThrough({ highWaterMark: 65536 }); stderr = new PassThrough({ highWaterMark: 65536 }); killed = 0; closed = false; missingClose = false;
  kill() { this.killed++; if (!this.missingClose && !this.closed) this.close(null, "SIGTERM"); return true; }
  close(code: number | null = 0, signal: NodeJS.Signals | null = null) { if (this.closed) return; this.closed = true; this.emit("close", code, signal); }
  start() { this.emit("spawn"); }
  async feed(parts: Uint8Array[], split = 137) {
    for (const bytes of parts) for (let at = 0; at < bytes.length; at += split) {
      if (this.closed) return;
      if (!this.stdout.write(bytes.subarray(at, at + split))) await new Promise<void>(resolve => this.stdout.once("drain", resolve));
    }
    this.stdout.end(); this.stderr.end();
    if (!this.missingClose) setImmediate(() => this.close());
  }
}
function pair(c: Config = config, l: Limits = limits) {
  assert.equal(typeof api.verifyCanonicalLosslessDecodedChildren, "function", "bounded paired streaming verifier is required");
  const source = new Decoder(), output = new Decoder(), run = api.verifyCanonicalLosslessDecodedChildren(source, output, c, l);
  source.start(); output.start(); return { source, output, run };
}
test("CD-STREAM-split: arbitrary chunk boundaries, opposite decoder pace and exact digests", async () => {
  const { source, output, run } = pair(); void source.feed(frames.map(f => f.bytes), 13); setTimeout(() => void output.feed(frames.map(f => f.bytes), 619), 20);
  const actual = await run; assert.deepEqual(actual.pixels, verifyExactPixels(frames, frames, "identity"));
  assert.equal(actual.resources.maximumFullFrameBuffers, 3); assert.equal(actual.resources.decodedFrameBufferBytes, 3 * 4608);
  assert.ok(actual.resources.sourceQueuePeakBytes <= 131072); assert.ok(actual.resources.outputQueuePeakBytes <= 131072);
});
for (const fault of ["premature-eof", "partial-tail", "extra-frame", "truncated-output", "reordered", "duplicated", "exit-error", "source-exit-error",
  "error-after-spawn", "broken-pipe", "stall-source", "stall-output", "missing-close", "stderr-overflow", "unbounded-queue", "wrong-stream-geometry"] as const)
test("CD-STREAM-" + fault + ": both children terminated or confirmed closed and no partial proof", async () => {
  const badConfig = fault === "wrong-stream-geometry" ? { ...config, outputGeometry: { width: 48, height: 64 } } : config;
  const { source, output, run } = pair(badConfig, { timeoutMilliseconds: 70, terminationGraceMilliseconds: 40 });
  let src = frames.map(f => f.bytes), out = frames.map(f => f.bytes);
  if (fault === "premature-eof") src = src.slice(0, -1);
  if (fault === "partial-tail") out = [...out, out[0]!.subarray(0, 1)];
  if (fault === "extra-frame") out = [...out, out[0]!];
  if (fault === "truncated-output") out = [...out.slice(0, -1), out.at(-1)!.subarray(0, 100)];
  if (fault === "reordered") out = [out[1]!, out[0]!, ...out.slice(2)];
  if (fault === "duplicated") out = [out[0]!, out[0]!, ...out.slice(2)];
  if (fault === "missing-close") output.missingClose = true;
  if (fault === "exit-error") output.close(7);
  if (fault === "source-exit-error") source.close(9);
  if (fault === "error-after-spawn") output.emit("error", Object.assign(new Error("hostile diagnostic must stay sanitized"), { code: "EPIPE" }));
  if (fault === "broken-pipe") output.stdout.emit("error", new Error("hostile pipe content"));
  if (fault === "stderr-overflow") output.stderr.write(Buffer.alloc(2 * 1024 * 1024 + 1));
  if (fault === "unbounded-queue") output.stdout.write(Buffer.alloc(131073));
  if (fault !== "stall-source") void source.feed(src);
  if (fault !== "stall-output") void output.feed(out);
  await assert.rejects(run, (error: unknown) => error instanceof local.CanonicalIngestError && /process_|verification_|request_invalid/.test(error.code) && !error.message.includes("hostile"));
  assert.ok(source.closed || source.killed === 1, "source termination requested exactly once");
  assert.ok(output.closed || output.killed === 1, "output termination requested exactly once");
});
test("CD-STREAM-no-spawn-event: exit zero alone is insufficient", async () => {
  assert.equal(typeof api.verifyCanonicalLosslessDecodedChildren, "function");
  const source = new Decoder(), output = new Decoder(), run = api.verifyCanonicalLosslessDecodedChildren(source, output, config, limits);
  output.start(); void source.feed(frames.map(f => f.bytes)); void output.feed(frames.map(f => f.bytes));
  await assert.rejects(run, (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "process_failed");
});
test("CD-STREAM-resource-before-read: excessive frames, frame bytes and high-water mark refused", async () => {
  assert.equal(typeof api.verifyCanonicalLosslessDecodedChildren, "function");
  for (const changed of [{ ...config, frameCount: 72001 }, { ...config, sourceGeometry: { width: 16384, height: 16384 } }]) {
    const source = new Decoder(), output = new Decoder();
    await assert.rejects(() => api.verifyCanonicalLosslessDecodedChildren(source, output, changed, limits));
  }
  const source = new Decoder(), output = new Decoder(); source.stdout = new PassThrough({ highWaterMark: 262144 });
  await assert.rejects(() => api.verifyCanonicalLosslessDecodedChildren(source, output, config, limits));
});
