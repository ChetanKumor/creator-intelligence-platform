// B2-B1 TEST / VERIFICATION ONLY. No FFmpeg, filters, subprocesses or production composition authority.
import { createHash } from "node:crypto";
import { canonicalSerialize } from "../../packages/domain/serialization.js";

export interface RawYuvFrame { pixelFormat: string; width: number; height: number; bytes: Uint8Array }
export const PIXEL_METHOD = "exact_yuv420p_planes_sha256_by_index_v1" as const;
export const D4_ELEMENTS = ["rotate_90_ccw", "rotate_180", "rotate_90_cw", "mirror_horizontal", "mirror_vertical", "transpose", "transverse"] as const;
export type PixelTransform = "identity" | (typeof D4_ELEMENTS)[number];
export function validateRaw(frame: RawYuvFrame): void {
  if (frame.pixelFormat !== "yuv420p" || ![frame.width, frame.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 16384 && n % 2 === 0)
    || !(frame.bytes instanceof Uint8Array) || frame.bytes.length !== frame.width * frame.height * 3 / 2) throw new Error("Invalid exact YUV420P frame");
}
/** Coordinates refer to a source sample (x,y), with a top-left origin. Apply to EACH plane's own width/height. */
export function transformYuv420p(frame: RawYuvFrame, transform: PixelTransform): RawYuvFrame {
  validateRaw(frame);
  if (transform !== "identity" && !D4_ELEMENTS.includes(transform)) throw new Error("Unsupported pixel transform");
  const swap = ["rotate_90_ccw", "rotate_90_cw", "transpose", "transverse"].includes(transform);
  const width = swap ? frame.height : frame.width, height = swap ? frame.width : frame.height;
  const bytes = new Uint8Array(frame.bytes.length);
  let offset = 0;
  for (const divisor of [1,2,2]) {
    const w = frame.width / divisor, h = frame.height / divisor, outW = swap ? h : w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dx: number, dy: number;
      switch (transform) {
        case "identity": dx = x; dy = y; break;
        case "rotate_90_ccw": dx = y; dy = w - 1 - x; break;
        case "rotate_180": dx = w - 1 - x; dy = h - 1 - y; break;
        case "rotate_90_cw": dx = h - 1 - y; dy = x; break;
        case "mirror_horizontal": dx = w - 1 - x; dy = y; break;
        case "mirror_vertical": dx = x; dy = h - 1 - y; break;
        case "transpose": dx = y; dy = x; break;
        case "transverse": dx = h - 1 - y; dy = w - 1 - x; break;
      }
      bytes[offset + dy * outW + dx] = frame.bytes[offset + y * w + x]!;
    }
    offset += w * h;
  }
  return { pixelFormat: "yuv420p", width, height, bytes };
}
/** Header length (u32 BE) + canonical UTF-8 header + Y + U + V. Metadata/PTS are deliberately excluded. */
export function exactFrameDigest(frame: RawYuvFrame, index: number): string {
  validateRaw(frame);
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("Invalid frame index");
  const y = frame.width * frame.height;
  const header = Buffer.from(canonicalSerialize({ method: PIXEL_METHOD, index, pixelFormat: frame.pixelFormat, width: frame.width, height: frame.height,
    planes: [{ name: "Y", length: y }, { name: "U", length: y/4 }, { name: "V", length: y/4 }] }), "utf8");
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  return createHash("sha256").update(length).update(header).update(frame.bytes).digest("hex");
}
export const exactSequenceDigest = (frames: RawYuvFrame[]): string => createHash("sha256").update(canonicalSerialize({ method: PIXEL_METHOD,
  frameCount: frames.length, frames: frames.map((frame, index) => ({ index, digest: exactFrameDigest(frame, index) })) })).digest("hex");
/** Compare every sample AND independent exact frame digests; any nonzero error throws, with no threshold. */
export function verifyExactPixels(source: RawYuvFrame[], output: RawYuvFrame[], transform: PixelTransform) {
  if (source.length === 0 || source.length !== output.length) throw new Error("Frame count mismatch");
  let sampleMismatchCount = 0, maximumAbsoluteSampleError = 0;
  const perPlaneMismatch = { Y: 0, U: 0, V: 0 };
  const expected = source.map(frame => transformYuv420p(frame, transform));
  for (let i = 0; i < expected.length; i++) {
    const a = expected[i]!, b = output[i]!; validateRaw(b);
    if (a.width !== b.width || a.height !== b.height || a.pixelFormat !== b.pixelFormat) throw new Error("Pixel geometry or format mismatch");
    const y = a.width * a.height;
    for (let j = 0; j < a.bytes.length; j++) {
      const error = Math.abs(a.bytes[j]! - b.bytes[j]!);
      if (error !== 0) { sampleMismatchCount++; perPlaneMismatch[j < y ? "Y" : j < y*5/4 ? "U" : "V"]++; }
      maximumAbsoluteSampleError = Math.max(maximumAbsoluteSampleError, error);
    }
  }
  const sourceDigest = exactSequenceDigest(source), expectedDigest = exactSequenceDigest(expected), outputDigest = exactSequenceDigest(output);
  if (sampleMismatchCount !== 0 || maximumAbsoluteSampleError !== 0 || expectedDigest !== outputDigest) {
    throw new Error(`Exact pixels failed: ${JSON.stringify({ sampleMismatchCount, maximumAbsoluteSampleError, perPlaneMismatch, expectedDigest, outputDigest })}`);
  }
  return { method: PIXEL_METHOD, transform, pixelFormat: "yuv420p" as const,
    sourceGeometry: { width: source[0]!.width, height: source[0]!.height }, outputGeometry: { width: output[0]!.width, height: output[0]!.height },
    frameMapping: "presentation_index_identity" as const, frameCount: source.length, sourceDigest, expectedDigest, outputDigest, sampleMismatchCount,
    maximumAbsoluteSampleError, perPlaneMismatch, frameDigests: { source: source.map(exactFrameDigest), expected: expected.map(exactFrameDigest), output: output.map(exactFrameDigest) } };
}
