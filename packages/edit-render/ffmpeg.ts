/**
 * The trusted, deterministic FFmpeg argument compiler for RenderExecutorSemanticsV0. Its only input is a validated RenderProgram
 * and an owner-derived output byte bound; it emits an argv array for a direct, shell-free spawn of the exact pinned binary. Inputs
 * and the output are inherited, already-verified descriptors (`-fd N fd:`) under an `fd`-only protocol whitelist, so no filesystem
 * path, URL or protocol ever appears. The generated filter graph is built only from fixed tokens and integers taken from the typed
 * program; identifiers, metadata and prose never enter FFmpeg syntax.
 */
import { MAX_FFMPEG_ARGUMENTS, MAX_FILTERGRAPH_BYTES, check, sha256 } from "./common.js";
import { requireProgram, type RenderProgram } from "./program.js";
import { RENDER_SEMANTICS, colorLookStep } from "./semantics.js";

/** The descriptor layout the adapter must realize: stdio 0-2, then one inherited handle per input slot, then the output handle. */
export interface DescriptorLayout { inputs: number[]; output: number }
const int = (value: number) => { check(Number.isSafeInteger(value) && value >= 0, "render_program_invalid", "Only integers enter the filter graph."); return String(value); };
type Segment = RenderProgram["segments"][number];
/** One segment's video chain, exactly: its frame interval, rebased, scaled, square pixels, 4:2:0 and its clip look. */
function segmentVideoChain(program: RenderProgram, s: Segment): string {
  const { width, height } = program.output.resolution, look = s.look.state === "clip" ? colorLookStep(s.look.look, s.look.intensityPerMille).filters : [];
  return [`trim=start_frame=${int(s.video.startFrame)}:end_frame=${int(s.video.endFrame)}`, "setpts=PTS-STARTPTS",
    `scale=w=${int(width)}:h=${int(height)}:flags=${RENDER_SEMANTICS.video.scalerFlags}`, "setsar=sar=1/1", "format=pix_fmts=yuv420p", ...look].join(",");
}
/** One segment's linked audio chain, exactly: its sample interval, rebased. */
const segmentAudioChain = (s: Extract<Segment["audio"], { state: "linked" }>) => `atrim=start_sample=${int(s.startSample)}:end_sample=${int(s.endSample)},asetpts=PTS-STARTPTS`;
const head = () => ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-benchmark", "-filter_threads", String(RENDER_SEMANTICS.filterThreads),
  "-filter_complex_threads", String(RENDER_SEMANTICS.filterThreads)];
const stagedInput = (fd: number) => ["-threads", String(RENDER_SEMANTICS.input.decoderThreads), "-protocol_whitelist", "fd", "-f", RENDER_SEMANTICS.input.demuxer, "-fd", int(fd), "-i",
  "fd:"];
/** After the concatenation: the whole-output look, the output time bases and the output audio format. */
function outputChains(program: RenderProgram, graph: string[]): void {
  let video = "[vc]";
  if (program.wholeOutputLook.state === "applied") {
    graph.push(`[vc]${colorLookStep(program.wholeOutputLook.look, program.wholeOutputLook.intensityPerMille).filters.join(",")}[vl]`);
    video = "[vl]";
  }
  const { numerator: num, denominator: den } = program.output.frameRate;
  graph.push(`${video}settb=expr=${int(den)}/${int(num)}[vout]`);
  if (program.output.audio.state === "encoded") {
    const { sampleRateHz: sr, channelLayout } = program.output.audio;
    graph.push(`[ac]aformat=sample_fmts=${RENDER_SEMANTICS.audio.sampleFormat}:sample_rates=${int(sr)}:channel_layouts=${channelLayout},asettb=expr=1/${int(sr)}[aout]`);
  }
}
/** The map and encode tail: the executor's exact encode of [vout] (and [aout]) into the one fd-only output. */
function encodeTail(program: RenderProgram, maxOutputBytes: number, output: number): string[] {
  const audio = program.output.audio.state === "encoded";
  return ["-map", "[vout]", ...(audio ? ["-map", "[aout]"] : []), "-fps_mode", "passthrough",
    "-c:v", RENDER_SEMANTICS.video.encoder, "-preset", RENDER_SEMANTICS.video.preset, "-crf", String(RENDER_SEMANTICS.video.crf), "-pix_fmt", RENDER_SEMANTICS.video.pixelFormat,
    "-threads", String(RENDER_SEMANTICS.video.encoderThreads),
    ...(program.output.audio.state === "encoded" ? ["-c:a", RENDER_SEMANTICS.audio.encoder, "-b:a", `${RENDER_SEMANTICS.audio.bitrateKbps}k`, "-ar",
      int(program.output.audio.sampleRateHz), "-ac", program.output.audio.channelLayout === "stereo" ? "2" : "1"] : []),
    "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", ...(audio ? ["-flags:a", "+bitexact"] : []),
    "-fs", int(maxOutputBytes), "-protocol_whitelist", "fd", "-f", RENDER_SEMANTICS.container.muxer, "-fd", int(output), "fd:"];
}
function bounded(graph: string[], argv: string[]): void {
  check(new TextEncoder().encode(graph.join(";")).length <= MAX_FILTERGRAPH_BYTES, "limit_exceeded", "The generated filter graph exceeds its bound.");
  check(argv.length <= MAX_FFMPEG_ARGUMENTS, "limit_exceeded", "The compiled argv exceeds its bound.");
}
export function compileFfmpegArguments(programInput: RenderProgram, options: { maxOutputBytes: number }): { argv: string[]; descriptors: DescriptorLayout } {
  const program = requireProgram(programInput);
  check(Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes > 0, "input_invalid", "The output byte bound is a positive safe integer.");
  const audio = program.output.audio.state === "encoded";
  const graph: string[] = [];
  // An input used by more than one segment is split explicitly, so every stream label is consumed exactly once.
  const videoUses = new Map<number, number>(), audioUses = new Map<number, number>();
  for (const s of program.segments) { videoUses.set(s.input, (videoUses.get(s.input) ?? 0) + 1); if (s.audio.state === "linked") audioUses.set(s.input, (audioUses.get(s.input) ?? 0) + 1); }
  const videoNext = new Map<number, number>(), audioNext = new Map<number, number>();
  for (const [slot, count] of videoUses) if (count > 1) graph.push(`[${int(slot)}:v:0]split=${int(count)}${Array.from({ length: count }, (_, j) => `[sv${int(slot)}_${int(j)}]`).join("")}`);
  for (const [slot, count] of audioUses) if (count > 1) graph.push(`[${int(slot)}:a:0]asplit=${int(count)}${Array.from({ length: count }, (_, j) => `[sa${int(slot)}_${int(j)}]`).join("")}`);
  const take = (slot: number, kind: "v" | "a") => {
    const uses = (kind === "v" ? videoUses : audioUses).get(slot)!, next = kind === "v" ? videoNext : audioNext;
    if (uses === 1) return `[${int(slot)}:${kind}:0]`;
    const j = next.get(slot) ?? 0; next.set(slot, j + 1);
    return `[s${kind}${int(slot)}_${int(j)}]`;
  };
  const labels: string[] = [];
  for (const [i, s] of program.segments.entries()) {
    graph.push(`${take(s.input, "v")}${segmentVideoChain(program, s)}[v${int(i)}]`);
    labels.push(`[v${int(i)}]`);
    if (s.audio.state === "linked") {
      graph.push(`${take(s.input, "a")}${segmentAudioChain(s.audio)}[a${int(i)}]`);
      labels.push(`[a${int(i)}]`);
    }
  }
  const n = program.segments.length;
  graph.push(`${labels.join("")}concat=n=${int(n)}:v=1:a=${audio ? "1" : "0"}[vc]${audio ? "[ac]" : ""}`);
  outputChains(program, graph);
  const inputs = program.inputs.map((_, k) => 3 + k), output = 3 + program.inputs.length;
  const argv = [...head(), ...inputs.flatMap(fd => stagedInput(fd)), "-filter_complex", graph.join(";"), ...encodeTail(program, options.maxOutputBytes, output)];
  bounded(graph, argv);
  return { argv, descriptors: { inputs, output } };
}
/** The digest a receipt records instead of the argv: the argv is location-free, but only its digest is evidence. */
export const argvDigestOf = (argv: readonly string[]): string => sha256(JSON.stringify(argv));

// ---------------------------------------------------------------- Gate 7 Batch 3B: the same program split into segment stages and one assembly
export interface StageDescriptorLayout { input: number; video: number; audio: number | null }
export interface AssemblyDescriptorLayout { segments: { video: number; audio: number | null }[]; output: number }
const bytesOf = (value: number) => { check(Number.isSafeInteger(value) && value > 0, "limit_exceeded", "An intermediate exceeds exact arithmetic."); return value; };
/** The exact byte counts of one segment's raw intermediates, from the program alone (the shape its record binds). */
export function segmentIntermediateBytes(program: RenderProgram, s: Segment): { video: number; audio: number | null } {
  const { width, height } = program.output.resolution;
  const audio = s.audio.state === "linked" && program.output.audio.state === "encoded"
    ? bytesOf((s.audio.endSample - s.audio.startSample) * (program.output.audio.channelLayout === "stereo" ? 2 : 1) * 4) : null;
  check((s.audio.state === "linked") === (audio !== null), "render_program_invalid", "Linked segment audio needs the encoded output audio.");
  return { video: bytesOf((s.video.frames * width * height * 3) / 2), audio };
}
function segmentAt(program: RenderProgram, position: number): Segment {
  check(Number.isSafeInteger(position) && position >= 0 && position < program.segments.length, "input_invalid", "No such segment of this program.");
  return program.segments[position]!;
}
/**
 * One segment stage: the one verified staged source of the segment, exactly the one-pass segment chain, and its exact output as raw planar
 * 4:2:0 frames and raw little-endian float samples at the output rate and layout, each to one pending fd-only artifact bounded to its exact
 * byte count. Nothing is encoded: the intermediate is lossless.
 */
export function compileSegmentStageArguments(programInput: RenderProgram, position: number): { argv: string[]; descriptors: StageDescriptorLayout } {
  const program = requireProgram(programInput), s = segmentAt(program, position), bytes = segmentIntermediateBytes(program, s);
  const graph = [`[0:v:0]${segmentVideoChain(program, s)}[v]`, ...(s.audio.state === "linked" ? [`[0:a:0]${segmentAudioChain(s.audio)}[a]`] : [])];
  const descriptors = { input: 3, video: 4, audio: s.audio.state === "linked" ? 5 : null };
  const argv = [...head(), ...stagedInput(descriptors.input), "-filter_complex", graph.join(";"),
    "-map", "[v]", "-fps_mode", "passthrough", "-c:v", "rawvideo", "-pix_fmt", "yuv420p", "-fs", int(bytes.video), "-f", "rawvideo", "-protocol_whitelist", "fd", "-fd",
    int(descriptors.video), "fd:",
    ...(descriptors.audio === null ? [] : ["-map", "[a]", "-c:a", "pcm_f32le", "-fs", int(bytes.audio!), "-f", "f32le", "-protocol_whitelist", "fd", "-fd", int(descriptors.audio),
      "fd:"])];
  bounded(graph, argv);
  return { argv, descriptors };
}
/**
 * The assembly: every segment's verified raw intermediates in timeline order (fd-only), square pixels asserted exactly as each segment chain
 * ends, the one-pass concatenation, whole-output look, time bases, output audio format and the identical encode tail. The final encode always
 * runs; nothing is byte-patched.
 */
export function compileAssemblyArguments(programInput: RenderProgram, options: { maxOutputBytes: number }): { argv: string[]; descriptors: AssemblyDescriptorLayout } {
  const program = requireProgram(programInput);
  check(Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes > 0, "input_invalid", "The output byte bound is a positive safe integer.");
  const audio = program.output.audio.state === "encoded", { width, height } = program.output.resolution, { numerator: num, denominator: den } = program.output.frameRate;
  const graph: string[] = [], labels: string[] = [], inputs: string[] = [], segments: AssemblyDescriptorLayout["segments"] = [];
  let fd = 3, index = 0;
  for (const [i, s] of program.segments.entries()) {
    const video = fd++, videoIndex = index++;
    inputs.push("-protocol_whitelist", "fd", "-f", "rawvideo", "-pixel_format", "yuv420p", "-video_size", `${int(width)}x${int(height)}`, "-framerate", `${int(num)}/${int(den)}`,
      "-fd", int(video), "-i", "fd:");
    graph.push(`[${int(videoIndex)}:v:0]setsar=sar=1/1[v${int(i)}]`);
    labels.push(`[v${int(i)}]`);
    if (s.audio.state === "linked" && program.output.audio.state === "encoded") {
      const samples = fd++, audioIndex = index++;
      inputs.push("-protocol_whitelist", "fd", "-f", "f32le", "-sample_rate", int(program.output.audio.sampleRateHz), "-ch_layout", program.output.audio.channelLayout,
        "-fd", int(samples), "-i", "fd:");
      graph.push(`[${int(audioIndex)}:a:0]anull[a${int(i)}]`);
      labels.push(`[a${int(i)}]`);
      segments.push({ video, audio: samples });
    } else {
      check(s.audio.state === "none", "render_program_invalid", "Linked segment audio needs the encoded output audio.");
      segments.push({ video, audio: null });
    }
  }
  graph.push(`${labels.join("")}concat=n=${int(program.segments.length)}:v=1:a=${audio ? "1" : "0"}[vc]${audio ? "[ac]" : ""}`);
  outputChains(program, graph);
  const argv = [...head(), ...inputs, "-filter_complex", graph.join(";"), ...encodeTail(program, options.maxOutputBytes, fd)];
  bounded(graph, argv);
  return { argv, descriptors: { segments, output: fd } };
}
