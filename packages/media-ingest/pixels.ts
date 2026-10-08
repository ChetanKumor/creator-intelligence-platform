// C–D bounded sample mathematics. No decoded stream, filesystem or execution authority.
// This module does not import the independent research/test oracle.
import { createHash } from "node:crypto";
import { canonicalSerialize } from "../domain/serialization.js";
import { EXACT_PIXEL_METHOD, PIXEL_TRANSFORMS, type ExactPixelVerification } from "./reencode.js";

export const EXACT_PIXEL_BUFFER_POLICY = Object.freeze({
  maximumFrameBytes: 16 * 1024 * 1024, maximumFrames: 72000,
  maximumDimension: 16384, fullFrameBuffers: 3, digestBytesPerFrame: 96,
} as const);
export interface ExactPixelVerificationConfig {
  sourceGeometry: { width: number; height: number };
  outputGeometry: { width: number; height: number };
  transform: ExactPixelVerification["transform"];
  frameCount: number;
}
export class ExactPixelVerificationError extends Error {
  constructor(readonly reason: "verification_failed" | "verification_incomplete" | "resource_limit", message: string) { super(message); this.name = "ExactPixelVerificationError"; }
}
function invalid(message: string): never { throw new ExactPixelVerificationError("verification_failed", message); }
function closed(value: unknown, keys: string[]): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(",") !== keys.sort().join(",")) invalid("invalid_exact_pixel_configuration");
}
export function boundedYuv420pFrameBytes(geometry: { width: number; height: number }): number {
  closed(geometry, ["width", "height"]);
  const { width, height } = geometry, area = width * height, length = area * 3 / 2;
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n % 2 === 0 && n <= EXACT_PIXEL_BUFFER_POLICY.maximumDimension)
    || !Number.isSafeInteger(area) || !Number.isSafeInteger(length) || length > EXACT_PIXEL_BUFFER_POLICY.maximumFrameBytes)
    throw new ExactPixelVerificationError("resource_limit", "decoded_frame_allocation_bound");
  return length;
}
/** Destination-to-source inverse integer maps, computed once per plane. Independent of the research oracle's source-to-destination switch. */
function inverse(transform: ExactPixelVerification["transform"], w: number, h: number): [number, number, number, number, number, number] {
  switch (transform) {
    case "identity": return [1, 0, 0, 1, 0, 0];
    case "rotate_90_ccw": return [0, -1, 1, 0, w - 1, 0];
    case "rotate_180": return [-1, 0, 0, -1, w - 1, h - 1];
    case "rotate_90_cw": return [0, 1, -1, 0, 0, h - 1];
    case "mirror_horizontal": return [-1, 0, 0, 1, w - 1, 0];
    case "mirror_vertical": return [1, 0, 0, -1, 0, h - 1];
    case "transpose": return [0, 1, 1, 0, 0, 0];
    case "transverse": return [0, -1, -1, 0, w - 1, h - 1];
  }
}
function frameHash(bytes: Uint8Array, geometry: { width: number; height: number }, index: number): Buffer {
  const area = geometry.width * geometry.height;
  const header = Buffer.from(canonicalSerialize({ method: EXACT_PIXEL_METHOD, index, pixelFormat: "yuv420p", ...geometry,
    planes: [{ name: "Y", length: area }, { name: "U", length: area / 4 }, { name: "V", length: area / 4 }] }), "utf8");
  if (header.length > 1024) invalid("exact_frame_header_bound");
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  return createHash("sha256").update(length).update(header).update(bytes).digest();
}
/** Only one expected buffer is owned here. The streaming caller owns one source and one output slot.
 * The fixed binary digest table has a hard count bound. A returned JSON proof is data, never media authority. */
export class ExactYuv420pVerifier {
  readonly bufferAccounting: Readonly<{ fullFrameBuffers: number; frameBytes: number; digestBytes: number }>;
  private readonly config: ExactPixelVerificationConfig;
  private expected: Buffer;
  private digests: Buffer;
  private index = 0;
  private failed = false;
  private finished = false;
  constructor(config: ExactPixelVerificationConfig) {
    closed(config, ["sourceGeometry", "outputGeometry", "transform", "frameCount"]);
    const sourceLength = boundedYuv420pFrameBytes(config.sourceGeometry), outputLength = boundedYuv420pFrameBytes(config.outputGeometry);
    if (!PIXEL_TRANSFORMS.includes(config.transform)) invalid("unsupported_exact_pixel_transform");
    const swap = ["rotate_90_ccw", "rotate_90_cw", "transpose", "transverse"].includes(config.transform);
    if (config.outputGeometry.width !== (swap ? config.sourceGeometry.height : config.sourceGeometry.width)
      || config.outputGeometry.height !== (swap ? config.sourceGeometry.width : config.sourceGeometry.height) || sourceLength !== outputLength)
      invalid("exact_pixel_geometry_mismatch");
    if (!Number.isSafeInteger(config.frameCount) || config.frameCount < 1 || config.frameCount > EXACT_PIXEL_BUFFER_POLICY.maximumFrames)
      throw new ExactPixelVerificationError("resource_limit", "ordered_frame_digest_count_bound");
    const digestBytes = config.frameCount * EXACT_PIXEL_BUFFER_POLICY.digestBytesPerFrame;
    if (!Number.isSafeInteger(digestBytes)) throw new ExactPixelVerificationError("resource_limit", "ordered_frame_digest_allocation_bound");
    this.config = structuredClone(config);
    this.expected = Buffer.alloc(outputLength); this.digests = Buffer.alloc(digestBytes);
    this.bufferAccounting = Object.freeze({ fullFrameBuffers: 3, frameBytes: sourceLength + outputLength * 2, digestBytes });
  }
  compare(index: number, source: Uint8Array, output: Uint8Array): void {
    try {
      if (this.finished || this.failed || index !== this.index || index >= this.config.frameCount) invalid("exact_frame_index_order");
      if (!(source instanceof Uint8Array) || !(output instanceof Uint8Array) || source.length !== this.expected.length || output.length !== this.expected.length)
        invalid("incomplete_exact_frame");
      let offset = 0;
      const { sourceGeometry: sg, outputGeometry: og, transform } = this.config;
      for (const divisor of [1, 2, 2]) {
        const w = sg.width / divisor, h = sg.height / divisor, ow = og.width / divisor, oh = og.height / divisor;
        const [xx, xy, yx, yy, tx, ty] = inverse(transform, w, h), stepX = xx + yx * w, stepY = xy + yy * w;
        let row = tx + ty * w;
        for (let y = 0; y < oh; y++, row += stepY) {
          let position = row, at = offset + y * ow;
          for (let x = 0; x < ow; x++, position += stepX, at++) this.expected[at] = source[offset + position]!;
        }
        offset += w * h;
      }
      const area = og.width * og.height, counts = { Y: 0, U: 0, V: 0 }; let maximum = 0;
      for (let at = 0; at < this.expected.length; at++) {
        const error = Math.abs(this.expected[at]! - output[at]!);
        if (error !== 0) { counts[at < area ? "Y" : at < area * 5 / 4 ? "U" : "V"]++; maximum = Math.max(maximum, error); }
      }
      if (maximum !== 0) invalid("exact_sample_mismatch:Y=" + counts.Y + ",U=" + counts.U + ",V=" + counts.V);
      const sourceDigest = frameHash(source, sg, index), expectedDigest = frameHash(this.expected, og, index), outputDigest = frameHash(output, og, index);
      if (!expectedDigest.equals(outputDigest)) invalid("exact_frame_digest_mismatch");
      const start = index * 96;
      sourceDigest.copy(this.digests, start); expectedDigest.copy(this.digests, start + 32); outputDigest.copy(this.digests, start + 64);
      this.index++;
    } catch (error) { this.failed = true; throw error; }
  }
  finish(): ExactPixelVerification {
    if (this.failed || this.finished) invalid("verification_failed");
    if (this.index !== this.config.frameCount) throw new ExactPixelVerificationError("verification_incomplete", "verification_incomplete");
    const rows: ExactPixelVerification["frameDigests"] = { source: [], expected: [], output: [] };
    const sequence = { source: createHash("sha256"), expected: createHash("sha256"), output: createHash("sha256") };
    // Exactly the accepted sorted-key canonical JSON wire, streamed rather than concatenating the complete ordered sequence.
    for (const role of ["source", "expected", "output"] as const) sequence[role].update('{"frameCount":' + this.index + ',"frames":[');
    for (let index = 0; index < this.index; index++) {
      for (const [role, slot] of [["source", 0], ["expected", 1], ["output", 2]] as const) {
        const digest = this.digests.subarray(index * 96 + slot * 32, index * 96 + slot * 32 + 32).toString("hex");
        rows[role].push(digest); sequence[role].update((index ? "," : "") + canonicalSerialize({ index, digest }));
      }
    }
    for (const role of ["source", "expected", "output"] as const) sequence[role].update('],"method":"' + EXACT_PIXEL_METHOD + '"}');
    const result: ExactPixelVerification = { method: EXACT_PIXEL_METHOD, transform: this.config.transform, pixelFormat: "yuv420p",
      sourceGeometry: { ...this.config.sourceGeometry }, outputGeometry: { ...this.config.outputGeometry }, frameCount: this.index,
      frameMapping: "presentation_index_identity", sourceDigest: sequence.source.digest("hex"), expectedDigest: sequence.expected.digest("hex"), outputDigest: sequence.output.digest("hex"),
      sampleMismatchCount: 0, maximumAbsoluteSampleError: 0, perPlaneMismatch: { Y: 0, U: 0, V: 0 }, frameDigests: rows };
    this.finished = true; this.expected = Buffer.alloc(0); this.digests = Buffer.alloc(0);
    return result;
  }
}
