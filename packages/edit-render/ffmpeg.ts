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
export function compileFfmpegArguments(programInput: RenderProgram, options: { maxOutputBytes: number }): { argv: string[]; descriptors: DescriptorLayout } {
  const program = requireProgram(programInput);
  check(Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes > 0, "input_invalid", "The output byte bound is a positive safe integer.");
  const flags = RENDER_SEMANTICS.video.scalerFlags, { width, height } = program.output.resolution, audio = program.output.audio.state === "encoded";
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
    const look = s.look.state === "clip" ? colorLookStep(s.look.look, s.look.intensityPerMille).filters : [];
    graph.push(`${take(s.input, "v")}${[`trim=start_frame=${int(s.video.startFrame)}:end_frame=${int(s.video.endFrame)}`, "setpts=PTS-STARTPTS",
      `scale=w=${int(width)}:h=${int(height)}:flags=${flags}`, "setsar=sar=1/1", "format=pix_fmts=yuv420p", ...look].join(",")}[v${int(i)}]`);
    labels.push(`[v${int(i)}]`);
    if (s.audio.state === "linked") {
      graph.push(`${take(s.input, "a")}atrim=start_sample=${int(s.audio.startSample)}:end_sample=${int(s.audio.endSample)},asetpts=PTS-STARTPTS[a${int(i)}]`);
      labels.push(`[a${int(i)}]`);
    }
  }
  const n = program.segments.length;
  graph.push(`${labels.join("")}concat=n=${int(n)}:v=1:a=${audio ? "1" : "0"}[vc]${audio ? "[ac]" : ""}`);
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
  const filterGraph = graph.join(";");
  check(new TextEncoder().encode(filterGraph).length <= MAX_FILTERGRAPH_BYTES, "limit_exceeded", "The generated filter graph exceeds its bound.");
  const inputs = program.inputs.map((_, k) => 3 + k), output = 3 + program.inputs.length;
  const argv = ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-benchmark", "-filter_threads", String(RENDER_SEMANTICS.filterThreads),
    "-filter_complex_threads", String(RENDER_SEMANTICS.filterThreads),
    ...inputs.flatMap(fd => ["-threads", String(RENDER_SEMANTICS.input.decoderThreads), "-protocol_whitelist", "fd", "-f", RENDER_SEMANTICS.input.demuxer, "-fd", int(fd), "-i", "fd:"]),
    "-filter_complex", filterGraph, "-map", "[vout]", ...(audio ? ["-map", "[aout]"] : []), "-fps_mode", "passthrough",
    "-c:v", RENDER_SEMANTICS.video.encoder, "-preset", RENDER_SEMANTICS.video.preset, "-crf", String(RENDER_SEMANTICS.video.crf), "-pix_fmt", RENDER_SEMANTICS.video.pixelFormat,
    "-threads", String(RENDER_SEMANTICS.video.encoderThreads),
    ...(program.output.audio.state === "encoded" ? ["-c:a", RENDER_SEMANTICS.audio.encoder, "-b:a", `${RENDER_SEMANTICS.audio.bitrateKbps}k`, "-ar",
      int(program.output.audio.sampleRateHz), "-ac", program.output.audio.channelLayout === "stereo" ? "2" : "1"] : []),
    "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", ...(audio ? ["-flags:a", "+bitexact"] : []),
    "-fs", int(options.maxOutputBytes), "-protocol_whitelist", "fd", "-f", RENDER_SEMANTICS.container.muxer, "-fd", int(output), "fd:"];
  check(argv.length <= MAX_FFMPEG_ARGUMENTS, "limit_exceeded", "The compiled argv exceeds its bound.");
  return { argv, descriptors: { inputs, output } };
}
/** The digest a receipt records instead of the argv: the argv is location-free, but only its digest is evidence. */
export const argvDigestOf = (argv: readonly string[]): string => sha256(JSON.stringify(argv));
