/**
 * Gate 7 Batch 3E-B2-A1 pure fixtures: CanonicalMediaFacts 1.0.0 records built from labelled synthetic shapes, and an independent
 * test-side oracle of what an exact remux of a plan produces. Nothing here touches media, a process, a clock or a network. Every
 * timestamp table is exact integer arithmetic. Shapes that replicate a B2R measurement name it (e01s M05, e03 C2, e07c asset_05, ...);
 * they are replicas, not the research bytes. New B2-A1 exports are read through the module namespace, so a missing export fails the
 * calling test rather than the whole file.
 */
import { createHash } from "node:crypto";
import { canonicalSerialize } from "../../packages/domain/serialization.js";
import * as ingest from "../../packages/media-ingest/index.js";
import { root } from "./canonical-media.js";

export type Json = Record<string, unknown>;
export const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
export const clone = <T>(value: T): T => structuredClone(value);
export const digestOf = (value: unknown): string => sha(canonicalSerialize(value));

// ---------------------------------------------------------------- identities measured by B2R (e04 SD01/SD02/SD04 bytes, instruments/sei-scan.mjs)
export const X264_UUID = "dc45e9bde6d948b7962cd820d923eeef", X265_UUID = "2ca2de09b51747dbbb55a4fe7fc2fc4e";

// ---------------------------------------------------------------- display matrices: FFmpeg's [a b u; c d v; x y w], 16.16 and 2.30 fixed point
export const FX = 65_536, W = 1_073_741_824;
/** Every matrix B2R wrote (e01s), keyed by what it is. The comments name the e01s fixture and ffprobe's lossy `rotation` reading. */
export const MATRICES = {
  identity: [FX, 0, 0, 0, FX, 0, 0, 0, W], // P10: FFmpeg exports no side data for it
  rotate_90_ccw: [0, -FX, 0, FX, 0, 0, 0, 0, W], // M01, rotation 90
  rotate_180: [-FX, 0, 0, 0, -FX, 0, 0, 0, W], // M02, M08, P06, rotation -180
  rotate_90_cw: [0, FX, 0, -FX, 0, 0, 0, 0, W], // M03, M03b, P05, rotation -90
  mirror_horizontal: [-FX, 0, 0, 0, FX, 0, 0, 0, W], // M04, rotation -180 (the same reading as rot180)
  mirror_vertical: [FX, 0, 0, 0, -FX, 0, 0, 0, W], // M05 and M09 (rot180 + hflip), rotation 0
  transpose: [0, FX, 0, FX, 0, 0, 0, 0, W], // M07 (rot90 + vflip), rotation -90
  transverse: [0, -FX, 0, -FX, 0, 0, 0, 0, W], // M06 (rot90 + hflip), rotation 90
  translate: [FX, 0, 0, 0, FX, 0, 100 * FX, 50 * FX, W], // P01, rotation 0
  scale2x1: [2 * FX, 0, 0, 0, FX, 0, 0, 0, W], // P02, rotation 0
  scale2x2: [2 * FX, 0, 0, 0, 2 * FX, 0, 0, 0, W], // P03, rotation 0
  shear: [FX, 0, 0, FX / 2, FX, 0, 0, 0, W], // P04, rotation 0
  perspective: [FX, 0, 1 << 20, 0, FX, 0, 0, 0, W], // P07, rotation 0
  wNotUnit: [FX, 0, 0, 0, FX, 0, 0, 0, W + (W >> 1)], // P08, rotation 0
  rotate45: [46_340, -46_340, 0, 46_340, 46_340, 0, 0, 0, W], // M10, rotation 45
  rotate90Translate: [0, FX, 0, -FX, 0, 0, 180 * FX, 0, W], // P09, rotation -90
} as const;
export const D4_ELEMENTS = ["rotate_90_ccw", "rotate_180", "rotate_90_cw", "mirror_horizontal", "mirror_vertical", "transpose", "transverse"] as const;

// ---------------------------------------------------------------- exact timestamp tables
export const cfr = (n: number, step: number, start = 0): number[] => Array.from({ length: n }, (_, i) => start + i * step);
/** e03 C1/C2/C3: frame i at i·step plus a deterministic jitter of at most `amplitude` ticks. */
export const jittered = (n: number, step: number, amplitude: number, start = 0): number[] =>
  Array.from({ length: n }, (_, i) => start + i * step + Math.round(amplitude * Math.sin(i * 1.7)));
/** e03 B4: 30000/1001 written in a 1/600 track: frame i at round_half_up(i·20.02). */
export const ntscIn600 = (n: number): number[] => Array.from({ length: n }, (_, i) => Math.floor((2 * i * 1001 + 50) / 100));
/** e03 D1: 30, then 24, then 15 fps, in 1/90000. */
export const piecewise30to24to15 = (): number[] => Array.from({ length: 69 }, (_, n) => (n < 30 ? 3000 * n : n < 54 ? 90_000 + 3750 * (n - 30) : 180_000 + 6000 * (n - 54)));
/** e03 E2: 30 fps with one 500 ms gap at frame 30, in 1/90000. */
export const gap500 = (): number[] => Array.from({ length: 60 }, (_, n) => 3000 * n + (n >= 30 ? 45_000 : 0));
/** e03 E1: 60 fps, then 10 fps, in 1/90000. */
export const sixtyThenTen = (): number[] => Array.from({ length: 70 }, (_, n) => (n < 60 ? 1500 * n : 90_000 + 9000 * (n - 60)));
/**
 * e07r assets 02/06 (shape only): a 1/1200000 track near 60 fps whose first frame is held 40 ms (one 48000-tick interval), then
 * 20000/20001-tick intervals (about 40 % long).
 */
export const heldFirstFrame = (n = 120): number[] => {
  const out = [0, 48_000];
  for (let k = 2; k < n; k += 1) out.push(out[k - 1]! + 20_000 + (k % 5 < 2 ? 1 : 0));
  return out;
};
/** e03 F1 (shape): frames in pairs one tick apart, in 1/90000. */
export const oneTickPairs = (): number[] => Array.from({ length: 60 }, (_, n) => 6000 * Math.floor(n / 2) + (n % 2));

/** Decoded audio frames `samples` long, contiguous from `start`, with `steps` added from a frame index on (e07c's measured breaks). */
export function audioFrames(count: number, samples = 1024, start = 0, steps: readonly { at: number; delta: number }[] = []): Json[] {
  const out: Json[] = [];
  let pts = start;
  for (let k = 0; k < count; k += 1) {
    for (const step of steps) if (step.at === k) pts += step.delta;
    out.push({ pts, samples });
    pts += samples;
  }
  return out;
}

// ---------------------------------------------------------------- facts records
export const SAR_1_1 = { state: "declared", numerator: 1, denominator: 1 } as const;
export const SAR_UNSPECIFIED = { state: "unspecified" } as const;
/** One conforming H.264 SDR video stream: 1920x1080, explicit 1:1, BT.709 limited, 30 fps exactly on the MOV 1/15360 grid from zero. */
export function videoStream(patch: Json = {}): Json {
  return { kind: "video", index: 0, codec: "h264", pixelFormat: "yuv420p", bitDepth: 8, fieldOrder: "progressive",
    geometry: { declared: { width: 1920, height: 1080 }, decoded: [{ width: 1920, height: 1080 }] },
    sampleAspectRatio: { container: SAR_1_1, bitstream: SAR_1_1 }, displayMatrix: { state: "absent" }, frameCropping: { state: "absent" },
    color: { range: "tv", primaries: "bt709", transfer: "bt709", matrix: "bt709" }, sideData: [],
    timeBase: { numerator: 1, denominator: 15_360 }, declaredFrameRate: { numerator: 30, denominator: 1 }, decodeReordering: false,
    presentationTimestamps: cfr(60, 512), ...patch };
}
/** One conforming audio stream: AAC LC 48 kHz stereo, 1/48000, 94 decoded frames of 1024 samples contiguous from zero. */
export function audioStream(patch: Json = {}): Json {
  return { kind: "audio", index: 1, codec: "aac_lc", sampleRateHz: 48_000, channels: 2, channelLayout: "stereo", timeBase: { numerator: 1, denominator: 48_000 },
    frames: audioFrames(94), ...patch };
}
export function facts(streams: Json[] = [videoStream(), audioStream()], patch: Json = {}): Json {
  return { factsType: "CanonicalMediaFacts", factsVersion: "1.0.0", container: "iso_bmff", streams, ...patch };
}
/** The video stream with these fields replaced, the audio unchanged. */
export const withVideo = (patch: Json, audio: Json | null = audioStream()): Json => facts(audio === null ? [videoStream(patch)] : [videoStream(patch), audioStream(audio)]);
export const timecode = (index: number): Json => ({ kind: "timecode", index, codec: "tmcd" });
export const movText = (index: number): Json => ({ kind: "subtitle", index, codec: "mov_text" });
export const sei = (uuid: string = X264_UUID, carrier: "frame" | "stream" = "frame"): Json => ({ carrier, kind: "user_data_unregistered_sei", seiUuid: uuid });
export const sideData = (kind: string, carrier: "frame" | "stream" = "frame"): Json => ({ carrier, kind, seiUuid: null });

/**
 * The owner N1 shape (e07r assets 01/03): 1920x1088 at 30/1 in 1/90000, no SAR anywhere, BT.709 limited, AAC LC 44.1 kHz stereo,
 * contiguous from zero.
 */
export const ownerN1Like = (): Json => facts([videoStream({ geometry: { declared: { width: 1920, height: 1088 }, decoded: [{ width: 1920, height: 1088 }] },
  sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED }, timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: cfr(90, 3000) }),
audioStream({ sampleRateHz: 44_100, timeBase: { numerator: 1, denominator: 44_100 }, frames: audioFrames(130) })]);
/** e07c asset_05 (shape): AAC 44.1 kHz whose decoded pts step -7 samples at frame 3 and -2 more at frame 26 (cumulative -9). */
export const asset05Audio = (patch: Json = {}): Json => audioStream({ sampleRateHz: 44_100, timeBase: { numerator: 1, denominator: 44_100 },
  frames: audioFrames(90, 1024, 0, [{ at: 3, delta: -7 }, { at: 26, delta: -2 }]), ...patch });

/**
 * L07's composed source: a timecode track and a mov_text subtitle beside the A/V pair, a common exact start 1 s late, near-CFR video
 * (e03 C2 jitter, 7 ms in 1/90000) with no SAR anywhere, and asset-05-like AAC 48 kHz breaks.
 */
export function composedSource(): Json {
  return facts([videoStream({ timeBase: { numerator: 1, denominator: 90_000 }, declaredFrameRate: { numerator: 90_000, denominator: 1 },
    sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED }, presentationTimestamps: jittered(60, 3000, 630, 90_000) }),
  audioStream({ frames: audioFrames(94, 1024, 48_000, [{ at: 3, delta: -7 }, { at: 26, delta: -2 }]) }), timecode(2), movText(3)]);
}

// ---------------------------------------------------------------- the independent remux oracle and plan-based chains
/**
 * What an exact remux of `plan` makes of `source`, computed here without the production planner: kept streams renumbered from zero,
 * timestamps shifted by the rebase offsets, video moved onto the exact snap grid, audio laid end to end from zero, and an explicit
 * 1:1 declaration after DECLARE. Everything else is copied.
 */
export function remuxedFacts(source: Json, plan: Json): Json {
  const streams = source.streams as Json[], kept = plan.streams as { videoIndex: number; audioIndex: number | null };
  const ops = new Map((plan.operations as Json[]).map(op => [op.op as string, op]));
  const rebase = ops.get("REBASE_TIMELINE_ZERO"), snap = ops.get("SNAP_VIDEO_TIMESTAMPS"), retime = ops.get("RETIME_AUDIO_CONTIGUOUS");
  const offset = (index: number): number => rebase === undefined ? 0 : (rebase.offsets as Json[]).find(o => o.streamIndex === index)!.offsetTicks as number;
  const video = clone(streams.find(s => s.index === kept.videoIndex)!);
  const shifted = (video.presentationTimestamps as number[]).map(t => t - offset(kept.videoIndex));
  if (snap === undefined) video.presentationTimestamps = shifted;
  else {
    video.timeBase = clone(snap.outputTimeBase); video.declaredFrameRate = clone(snap.targetFrameRate);
    video.presentationTimestamps = shifted.map((_, i) => i * (snap.gridPeriodTicks as number));
  }
  if (ops.has("DECLARE_SQUARE_SAMPLE_ASPECT")) video.sampleAspectRatio = { container: SAR_1_1, bitstream: SAR_1_1 };
  video.index = 0;
  const out: Json[] = [video];
  if (kept.audioIndex !== null) {
    const audio = clone(streams.find(s => s.index === kept.audioIndex)!);
    let at = 0;
    audio.frames = (audio.frames as Json[]).map(f => {
      const pts = retime === undefined ? (f.pts as number) - offset(kept.audioIndex!) : at;
      at += f.samples as number;
      return { pts, samples: f.samples };
    });
    audio.index = 1;
    out.push(audio);
  }
  return { ...clone(source), streams: out };
}
export const HASH_OUT = sha("b2a1-canonical-output-bytes"), SIZE_OUT = 6007;
export const HASH_SRC = (): string => (root() as { contentHash: string }).contentHash;
export interface PlanChainOptions { rootAuthorization?: Json; output?: Json; outputHash?: string; outputSize?: number; plan?: Json;
  decoded?: { sourceDigest: string; outputDigest: string }; videoPackets?: { sourceDigest: string; outputDigest: string } | null;
  audioPackets?: { sourceDigest: string; outputDigest: string } | null; dateAdded?: string }
/** Source facts -> planner -> oracle output -> the plan-based derivation and its derived authorization. */
export function planChain(source: Json, o: PlanChainOptions = {}) {
  const planning = ingest.planCanonicalizationV1(source) as unknown as Json;
  const plan = (o.plan ?? planning.plan) as Json;
  const output = o.output ?? remuxedFacts(source, planning.plan as Json);
  const declares = (plan.operations as Json[]).some(op => op.op === "DECLARE_SQUARE_SAMPLE_ASPECT");
  const hasAudio = (plan.streams as Json).audioIndex !== null;
  const derivation = ingest.buildCanonicalMediaPlanDerivation({ rootAuthorization: o.rootAuthorization ?? root(), source: { facts: source }, plan,
    output: { contentHash: o.outputHash ?? HASH_OUT, sizeBytes: o.outputSize ?? SIZE_OUT, facts: output,
      decodedFrames: o.decoded ?? { sourceDigest: sha("decoded-frame-content"), outputDigest: sha("decoded-frame-content") },
      videoPackets: o.videoPackets !== undefined ? o.videoPackets : declares ? null : { sourceDigest: sha("video-packets"), outputDigest: sha("video-packets") },
      audioPackets: o.audioPackets !== undefined ? o.audioPackets : hasAudio ? { sourceDigest: sha("audio-packets"), outputDigest: sha("audio-packets") } : null } }) as unknown as Json;
  return { planning, plan, output, derivation };
}
