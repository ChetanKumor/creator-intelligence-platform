/**
 * Strict, pure parsing of what the pinned runtime reports about itself (version banners, build configuration, component listings,
 * benchmark lines) and of ffprobe JSON, plus the V0 staged-input conformance rule. Anything malformed refuses; nothing is guessed.
 * The adapters run the fixed queries; this module only reads their bounded output.
 */
import { z } from "zod";
import { identify } from "../editorial/common.js";
import { MAX_PROBE_OUTPUT_BYTES, check, guard, refuse } from "./common.js";
import type { ComponentInventory } from "./semantics.js";

// ---------------------------------------------------------------- the runtime's own reports
export function parseVersionBanner(text: string, tool: "ffmpeg" | "ffprobe"): string {
  check(typeof text === "string" && text.length <= 65_536, "runtime_probe_invalid", "A bounded version report is required.");
  const first = text.split(/\r?\n/).find(line => line.trim() !== "") ?? "";
  const match = new RegExp(`^${tool} version ([0-9A-Za-z][0-9A-Za-z._+-]{0,79}) Copyright `).exec(first);
  check(match !== null && match[1] !== undefined, "runtime_probe_invalid", `The ${tool} version banner is not in the expected form.`);
  return match[1];
}
export function parseBuildConfiguration(text: string): string[] {
  check(typeof text === "string" && text.length <= 65_536, "runtime_probe_invalid", "A bounded build configuration report is required.");
  const lines = text.split(/\r?\n/), start = lines.findIndex(line => line.trim() === "configuration:");
  check(start >= 0, "runtime_probe_invalid", "The build configuration report has no configuration section.");
  // The flag block ends at its first blank line; the pinned build then prints only its exit notice on stdout, and nothing else is tolerated.
  const flags: string[] = [], rest = lines.slice(start + 1), end = rest.findIndex(line => line.trim() === "");
  for (const line of end < 0 ? rest : rest.slice(0, end)) {
    const match = /^\s+(--[a-z0-9][a-z0-9_-]*(?:=[A-Za-z0-9_.,+-]*)?)\s*$/.exec(line);
    check(match !== null && match[1] !== undefined, "runtime_probe_invalid", "An unexpected build configuration line.");
    flags.push(match[1]);
  }
  const trailer = (end < 0 ? [] : rest.slice(end)).filter(line => line.trim() !== "");
  check(trailer.length === 0 || (trailer.length === 1 && trailer[0]!.trim() === "Exiting with exit code 0"), "runtime_probe_invalid", "An unexpected build configuration line.");
  check(flags.length > 0 && flags.length <= 512, "runtime_probe_invalid", "The build configuration lists no or too many flags.");
  return [...new Set(flags)].sort();
}
export type ListingKind = "encoders" | "decoders" | "filters" | "muxers" | "demuxers" | "input_protocols" | "output_protocols";
/** Component names from one listing, sorted and unique. Every row after the legend separator must parse, or the whole listing refuses. */
export function parseComponentListing(text: string, kind: ListingKind): string[] {
  check(typeof text === "string" && text.length <= 1_048_576, "runtime_probe_invalid", "A bounded component listing is required.");
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  const names: string[] = [];
  if (kind === "input_protocols" || kind === "output_protocols") {
    const input = lines.findIndex(l => l.trim() === "Input:"), output = lines.findIndex(l => l.trim() === "Output:");
    check(lines[0]?.trim() === "Supported file protocols:" && input === 1 && output > input, "runtime_probe_invalid", "The protocol listing is not in the expected form.");
    for (const line of kind === "input_protocols" ? lines.slice(input + 1, output) : lines.slice(output + 1)) {
      const match = /^\s{2}([a-z0-9_]{1,40})$/.exec(line);
      check(match !== null && match[1] !== undefined, "runtime_probe_invalid", "An unexpected protocol listing row.");
      names.push(match[1]);
    }
  } else {
    const codec = kind === "encoders" || kind === "decoders", separator = codec || kind === "filters" ? "------" : "---";
    const title = kind === "encoders" ? "Encoders:" : kind === "decoders" ? "Decoders:" : kind === "filters" ? "Filters:" : "Formats:";
    const at = lines.findIndex(line => line.trim() === separator);
    check(lines[0]?.trim() === title && at > 0, "runtime_probe_invalid", `The ${kind} listing is not in the expected form.`);
    for (const line of lines.slice(at + 1)) {
      // Component names may contain a dot (the pinned build lists the decoder `acelp.kelvin`).
      const match = codec ? /^ [VASDT.][F.][S.][X.][B.][D.] ([A-Za-z0-9_.-]{1,64}) +\S.*$/.exec(line)
        : kind === "filters" ? /^ [T.][S.] ([A-Za-z0-9_.-]{1,64}) +\S+->\S+ +\S.*$/.exec(line)
          : /^ ([D ])([E ])([d ]) ([A-Za-z0-9_,.-]{1,128}) +\S.*$/.exec(line);
      check(match !== null, "runtime_probe_invalid", `An unexpected ${kind} listing row.`);
      if (codec || kind === "filters") { names.push(match[1]!); continue; }
      const flag = kind === "muxers" ? match[2] : match[1];
      if (flag === (kind === "muxers" ? "E" : "D")) names.push(...match[4]!.split(",").filter(Boolean));
    }
  }
  check(names.length > 0 && names.length <= 8192, "runtime_probe_invalid", `The ${kind} listing names no or too many components.`);
  return [...new Set(names)].sort();
}
export interface RuntimeListings { encoders: string; decoders: string; filters: string; muxers: string; demuxers: string; protocols: string }
export function componentInventoryOf(listings: RuntimeListings): ComponentInventory {
  return { encoders: parseComponentListing(listings.encoders, "encoders"), decoders: parseComponentListing(listings.decoders, "decoders"),
    filters: parseComponentListing(listings.filters, "filters"), muxers: parseComponentListing(listings.muxers, "muxers"),
    demuxers: parseComponentListing(listings.demuxers, "demuxers"), inputProtocols: parseComponentListing(listings.protocols, "input_protocols"),
    outputProtocols: parseComponentListing(listings.protocols, "output_protocols") };
}
export interface Benchmark { cpuMilliseconds: number; userMilliseconds: number; systemMilliseconds: number; realMilliseconds: number; maxResidentKibibytes: number }
const seconds = (value: string) => { const m = /^(\d{1,7})\.(\d{3})s$/.exec(value); return m === null ? null : Number(m[1]) * 1000 + Number(m[2]); };
/** The pinned FFmpeg's own `-benchmark` report: exactly one time line and one memory line, or nothing (never a guess). */
export function parseBenchmark(stderr: string): Benchmark | null {
  const lines = stderr.split(/\r?\n/).filter(line => line.startsWith("bench: "));
  const times = lines.filter(line => line.startsWith("bench: utime=")), memory = lines.filter(line => line.startsWith("bench: maxrss="));
  if (times.length !== 1 || memory.length !== 1) return null;
  const t = /^bench: utime=(\S+) stime=(\S+) rtime=(\S+)$/.exec(times[0]!.trim()), r = /^bench: maxrss=(\d{1,12})KiB$/.exec(memory[0]!.trim());
  if (t === null || r === null) return null;
  const [user, system, real] = [seconds(t[1]!), seconds(t[2]!), seconds(t[3]!)];
  if (user === null || system === null || real === null) return null;
  return { cpuMilliseconds: user + system, userMilliseconds: user, systemMilliseconds: system, realMilliseconds: real, maxResidentKibibytes: Number(r[1]) };
}

// ---------------------------------------------------------------- ffprobe JSON (strict)
const Nat = z.number().int().nonnegative().safe(), Ratio = z.string().regex(/^\d{1,10}\/\d{1,10}$/), Digits = z.string().regex(/^\d{1,12}$/);
const StreamSchema = z.strictObject({
  index: Nat, codec_type: z.enum(["video", "audio", "subtitle", "data", "attachment"]), codec_name: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  profile: z.string().regex(/^[A-Za-z0-9 _.-]{1,60}$/).optional(), width: Nat.optional(), height: Nat.optional(), sample_aspect_ratio: z.string().regex(/^\d{1,6}:\d{1,6}$/).optional(),
  pix_fmt: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(), r_frame_rate: Ratio.optional(), avg_frame_rate: Ratio.optional(), time_base: Ratio.optional(),
  start_pts: z.number().int().safe().optional(), duration_ts: Nat.optional(), sample_rate: Digits.optional(), channels: Nat.optional(),
  channel_layout: z.string().regex(/^[a-z0-9_.()+ ]{1,60}$/).optional(), nb_read_frames: Digits.optional(),
  side_data_list: z.array(z.strictObject({ side_data_type: z.string().max(80).optional(), rotation: z.number().finite().optional() })).max(16).optional(),
});
const FrameSchema = z.strictObject({ stream_index: Nat, pts: z.number().int().safe(), nb_samples: Nat.optional(),
  side_data_list: z.array(z.strictObject({ side_data_type: z.string().max(120).optional() })).max(16).optional() });
const ProbeSchema = z.strictObject({
  frames: z.array(FrameSchema).max(400_000).optional(), programs: z.array(z.never()).max(0), stream_groups: z.array(z.never()).max(0),
  streams: z.array(StreamSchema).min(1).max(16), format: z.strictObject({ format_name: z.string().regex(/^[a-z0-9_,]{1,80}$/), duration: z.string().regex(/^\d{1,7}\.\d{6}$/).optional(),
    size: Digits.optional(), nb_streams: Nat.optional() }),
}).refine(v => v.streams.every((s, i) => s.index === i), "Stream indexes are contiguous from zero.")
  .refine(v => (v.frames ?? []).every(f => f.stream_index < v.streams.length), "Every frame names a listed stream.");
export type ProbeReport = z.infer<typeof ProbeSchema>;
export type ProbeStream = z.infer<typeof StreamSchema>;
export function parseProbeJson(text: string): ProbeReport {
  check(typeof text === "string" && text.length > 0 && text.length <= MAX_PROBE_OUTPUT_BYTES, "probe_output_invalid", "Probe output is empty or exceeds its bound.");
  const value = guard("probe_output_invalid", () => JSON.parse(text) as unknown);
  return guard("probe_output_invalid", () => ProbeSchema.parse(value));
}
export const ratioOf = (text: string): { numerator: bigint; denominator: bigint } => {
  const [n, d] = text.split("/").map(v => BigInt(v));
  check(n !== undefined && d !== undefined && d > 0n, "probe_output_invalid", "A ratio needs a positive denominator.");
  return { numerator: n, denominator: d };
};
/** Scope-free content identity of one exact frame-time table: the accepted Batch-1 construction, reproduced exactly. */
export function frameTableIdOf(frameTimes: readonly number[]): string {
  return identify("source_frame_times_v0", "tableId", { frameTimes: [...frameTimes] }).tableId;
}

// ---------------------------------------------------------------- V0 staged-input conformance
export interface ConformanceInput {
  video: { frameCount: number; tableId: string; width: number; height: number; grid: { numerator: number; denominator: number } };
  audio: { required: false } | { required: true; sampleRateHz: number; channelLayout: "mono" | "stereo"; requiredSamples: number };
}
export const CONFORMANCE_REASONS = ["source_stream_layout_unsupported", "source_video_nonconforming", "source_timebase_mismatch", "source_audio_missing",
  "source_audio_format_unsupported", "source_audio_alignment_unsupported", "source_audio_insufficient"] as const;
export type ConformanceReason = (typeof CONFORMANCE_REASONS)[number];
export interface ConformanceObservation { containerFormat: string; streams: { index: number; codecType: string; codecName: string | null }[]; videoFrames: number;
  videoTableId: string | null; audioSamples: number | null }
/**
 * The staged bytes conform when, and only when: the container is ISO BMFF (MOV/MP4) with exactly one video stream and at most one
 * audio stream; the video is square-pixel, unrotated 4:2:0 H.264 of the admitted geometry; every decoded frame lies exactly on the
 * output grid i × den / num from zero and the frame count and table identity equal the admitted table; and, when the graph links
 * audio, that audio is AAC or PCM at exactly the output rate and layout, contiguous from sample zero and long enough.
 */
export function evaluateInputConformance(input: ConformanceInput, probe: ProbeReport):
  { outcome: { state: "conforms" } | { state: "nonconforming"; reasonCode: ConformanceReason }; observation: ConformanceObservation } {
  const video = probe.streams.filter(s => s.codec_type === "video"), audio = probe.streams.filter(s => s.codec_type === "audio");
  const frames = probe.frames ?? [];
  const videoFrames = video[0] === undefined ? [] : frames.filter(f => f.stream_index === video[0]!.index);
  const audioFrames = audio[0] === undefined ? [] : frames.filter(f => f.stream_index === audio[0]!.index);
  const tb = video[0]?.time_base === undefined ? null : ratioOf(video[0].time_base);
  const times = tb === null ? null : videoFrames.map(f => Number(BigInt(f.pts) * tb.numerator) / Number(tb.denominator));
  const observation: ConformanceObservation = { containerFormat: probe.format.format_name,
    streams: probe.streams.map(s => ({ index: s.index, codecType: s.codec_type, codecName: s.codec_name ?? null })), videoFrames: videoFrames.length,
    videoTableId: times === null || times.length === 0 ? null : frameTableIdOf(times), audioSamples: audio[0] === undefined ? null : audioFrames.reduce((n, f) => n + (f.nb_samples ?? 0), 0) };
  const fail = (reasonCode: ConformanceReason) => ({ outcome: { state: "nonconforming" as const, reasonCode }, observation });
  if (probe.format.format_name !== "mov,mp4,m4a,3gp,3g2,mj2" || video.length !== 1 || audio.length > 1 || probe.streams.length !== video.length + audio.length) {
    return fail("source_stream_layout_unsupported");
  }
  const v = video[0]!;
  const rotated = (v.side_data_list ?? []).some(d => d.rotation !== undefined && d.rotation !== 0);
  if (v.codec_name !== "h264" || v.width !== input.video.width || v.height !== input.video.height || v.sample_aspect_ratio !== "1:1" || v.pix_fmt !== "yuv420p" || rotated) {
    return fail("source_video_nonconforming");
  }
  // Exact rational grid: frame i at pts_i × tb must equal i × den / num, and the float table must be the admitted one.
  const { numerator: num, denominator: den } = input.video.grid;
  const onGrid = tb !== null && videoFrames.every((f, i) => BigInt(f.pts) * tb.numerator * BigInt(num) === BigInt(i) * BigInt(den) * tb.denominator);
  if (!onGrid || videoFrames.length !== input.video.frameCount || observation.videoTableId !== input.video.tableId || v.start_pts !== 0) return fail("source_timebase_mismatch");
  if (!input.audio.required) return { outcome: { state: "conforms" }, observation };
  const a = audio[0];
  if (a === undefined) return fail("source_audio_missing");
  const channels = input.audio.channelLayout === "stereo" ? 2 : 1;
  if (!["aac", "pcm_s16le"].includes(a.codec_name ?? "") || a.sample_rate !== String(input.audio.sampleRateHz) || a.channels !== channels
    || a.channel_layout !== input.audio.channelLayout) return fail("source_audio_format_unsupported");
  let expected = 0;
  const contiguous = a.time_base === `1/${input.audio.sampleRateHz}` && a.start_pts === 0 && audioFrames.every(f => {
    const ok = f.pts === expected && f.nb_samples !== undefined && f.nb_samples > 0; expected += f.nb_samples ?? 0; return ok; });
  if (!contiguous) return fail("source_audio_alignment_unsupported");
  if ((observation.audioSamples ?? 0) < input.audio.requiredSamples) return fail("source_audio_insufficient");
  return { outcome: { state: "conforms" }, observation };
}
export function assertNever(value: never, message: string): never { void value; refuse("input_invalid", message); }
