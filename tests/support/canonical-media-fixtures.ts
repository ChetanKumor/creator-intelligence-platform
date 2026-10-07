// Gate 7 Batch 3E-B1B: test-only synthetic media for the canonical-ingest suite. Fixture generation is NOT canonicalization and never a
// second production media path: it runs the already verified pinned FFmpeg by absolute path (never PATH, never a shell) over lavfi test
// patterns only, and writes tiny files into a test-owned directory, exactly like the accepted Batch-2B generator
// (tests/support/edit-render-media.ts). The independent probe and frame listings let a test check the adapter's published bytes without
// trusting the adapter's own report. No owner footage is read; nothing here reaches a network.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PINNED_TOOL_ROOT } from "./edit-render-media.js";

const FFMPEG = join(PINNED_TOOL_ROOT, "bin", "ffmpeg.exe"), FFPROBE = join(PINNED_TOOL_ROOT, "bin", "ffprobe.exe");

interface Run { code: number | null; stdout: Buffer; stderr: string }
function run(executable: string, args: readonly string[], timeoutMilliseconds = 120_000): Promise<Run> {
  return new Promise((accept, reject) => {
    const child = spawn(executable, [...args], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [], err: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), timeoutMilliseconds);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); accept({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8").slice(0, 4000) }); });
  });
}

export interface FixtureSpec {
  /** No audio, 48 kHz stereo PCM (MOV only) or 48 kHz stereo AAC. */
  audio: "none" | "pcm" | "aac";
  /** unspecified: the H.264 VUI and the container declare no sample aspect ratio (the N1 case); square: an explicit 1:1; or an explicit non-square SAR. */
  sar?: "unspecified" | "square" | "4:3";
  /** Keep libx264's user-data-unregistered SEI (exported as frame side data); removed by default. */
  sei?: boolean;
  /** The lavfi picture: identical timing, different pixels per pattern. */
  pattern?: "testsrc2" | "smptebars" | "rgbtestsrc";
  /** The tone of the first channel; the second is 1.5 times higher. */
  tone?: number;
  pixelFormat?: "yuv420p" | "yuv444p";
  /** 30 fps on the i / 30 grid, or 30 fps then 10 fps (variable timing). */
  timing?: "cfr" | "vfr";
  container?: "mp4" | "mov";
  /** A2 production admission requires explicit limited range; absent preserves every accepted B1B generator argument. */
  profileColor?: boolean;
}
/** A 2-second 160x90 H.264 source at 30 fps (60 frames), no B-frames, starting at zero; see FixtureSpec for the variants. */
export async function generateFixture(directory: string, name: string, spec: FixtureSpec): Promise<string> {
  const path = join(directory, name), pattern = spec.pattern ?? "testsrc2", tone = spec.tone ?? 440;
  const sar = spec.sar ?? "unspecified";
  const filters = [...(sar === "unspecified" ? ["setsar=sar=0"] : sar === "4:3" ? ["setsar=sar=4/3"] : []),
    ...(spec.profileColor ? ["setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709"] : []),
    ...(spec.timing === "vfr" ? ["setpts='if(lt(N\\,30)\\,N/(30*TB)\\,(1+(N-30)/10)/TB)'"] : [])];
  const audio = spec.audio === "none" ? [] : ["-f", "lavfi", "-i", `aevalsrc=exprs='sin(2*PI*${tone}*t)|sin(2*PI*${tone * 1.5}*t)':sample_rate=48000:duration=2`];
  const maps = spec.audio === "none" ? ["-map", "0:v"] : ["-map", "0:v", "-map", "1:a", "-af", "aformat=channel_layouts=stereo",
    "-c:a", spec.audio === "pcm" ? "pcm_s16le" : "aac", ...(spec.audio === "aac" ? ["-b:a", "128k"] : [])];
  const container = spec.container ?? (spec.audio === "pcm" ? "mov" : "mp4");
  const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-f", "lavfi", "-i", `${pattern}=s=160x90:r=30`, ...audio, ...maps,
    ...(filters.length > 0 ? ["-vf", filters.join(",")] : []), ...(spec.timing === "vfr" ? ["-fps_mode", "vfr"] : []), "-frames:v", spec.timing === "vfr" ? "40" : "60",
    "-c:v", "libx264", "-bf", "0", "-g", "30", "-pix_fmt", spec.pixelFormat ?? "yuv420p", "-threads", "1",
    ...(spec.sei ? [] : ["-bsf:v", "filter_units=remove_types=6"]), "-f", container, path];
  const result = await run(FFMPEG, args);
  if (result.code !== 0) throw new Error(`synthetic fixture generation failed: ${result.stderr}`);
  return path;
}

export async function sha256File(path: string): Promise<{ contentHash: string; sizeBytes: number }> {
  const bytes = await readFile(path);
  return { contentHash: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
}

/** The accepted staged-input conformance query of the Batch-2B renderer (scripts/edit-render-local.ts), reproduced exactly. */
export const RENDERER_CONFORMANCE_ENTRIES = "stream=index,codec_type,codec_name,width,height,sample_aspect_ratio,pix_fmt,time_base,start_pts,sample_rate,channels,channel_layout"
  + ":stream_side_data=side_data_type,rotation:format=format_name:frame=stream_index,pts,nb_samples";
/** An independent ffprobe of a file by path (test-side; never the adapter's probe). */
export async function independentProbe(path: string, entries = RENDERER_CONFORMANCE_ENTRIES): Promise<string> {
  const result = await run(FFPROBE, ["-hide_banner", "-loglevel", "error", "-show_entries", entries, "-of", "json=compact=1", path]);
  if (result.code !== 0) throw new Error(`independent probe failed: ${result.stderr}`);
  return result.stdout.toString("utf8");
}
/** An independent framemd5 listing of a file's first video stream (decoded) or first audio stream (stream-copied packets), by path. */
export async function independentListing(path: string, kind: "video" | "audio"): Promise<string> {
  const select = kind === "video" ? ["-map", "0:v:0", "-fps_mode", "passthrough", "-enc_time_base:v", "demux"] : ["-map", "0:a:0", "-c", "copy"];
  const result = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", "-threads", "1", "-i", path, ...select, "-f", "framemd5", "-fflags", "+bitexact", "-"]);
  if (result.code !== 0) throw new Error(`independent listing failed: ${result.stderr}`);
  return result.stdout.toString("utf8");
}
/** A listing without its one `#sar` header line, the only line the N1 recipe is meant to change. */
export const withoutSar = (listing: string): string => listing.split("\n").filter(line => !line.startsWith("#sar ")).join("\n");

/** B2-A2 generated fixtures only. The accepted B1B generator above keeps its exact defaults and bytes. */
export interface PlanFixtureSpec {
  sar?: "square" | "unspecified" | "4:3";
  color?: "bt709" | "unspecified" | "bt601" | "hdr";
  audio?: "none" | "aac" | "pcm";
  bFrames?: boolean;
  hevc?: boolean;
  sei?: "encoder" | "unknown" | "absent";
  rate?: "30" | "30000/1001";
  frameCount?: number;
  pattern?: "testsrc2" | "smptebars";
  tone?: number;
}
export async function generatePlanFixture(directory: string, name: string, spec: PlanFixtureSpec = {}): Promise<string> {
  const path = join(directory, name), audio = spec.audio ?? "none", color = spec.color ?? "bt709";
  const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-f", "lavfi", "-i", `${spec.pattern ?? "testsrc2"}=s=160x90:r=${spec.rate ?? "30"}`,
    ...(audio === "none" ? [] : ["-f", "lavfi", "-i", `sine=frequency=${spec.tone ?? 440}:sample_rate=48000:duration=1.2`]),
    "-map", "0:v:0", ...(audio === "none" ? [] : ["-map", "1:a:0", "-c:a", audio === "aac" ? "aac" : "pcm_s16le"]),
    "-frames:v", String(spec.frameCount ?? 36), "-vf", `setsar=${spec.sar === "unspecified" ? "0" : spec.sar === "4:3" ? "4/3" : "1"}`
      + (color === "unspecified" ? "" : `,setparams=range=limited:color_primaries=${color === "bt601" ? "smpte170m" : "bt709"}:color_trc=${color === "hdr" ? "smpte2084" : "bt709"}:colorspace=bt709`),
    "-c:v", spec.hevc ? "libx265" : "libx264", "-bf", spec.bFrames ? "3" : "0", "-g", "30", "-pix_fmt", "yuv420p", "-threads", "1",
    ...(spec.hevc ? ["-x265-params", "pools=none:frame-threads=1:log-level=error"] : []),
    ...(color === "unspecified" ? [] : ["-color_range", "tv", "-color_primaries", color === "bt601" ? "smpte170m" : "bt709",
      "-color_trc", color === "hdr" ? "smpte2084" : "bt709", "-colorspace", "bt709"]),
    ...(spec.sei === "absent" || spec.sei === undefined ? ["-bsf:v", `filter_units=remove_types=${spec.hevc ? "39|40" : "6"}`]
      : spec.sei === "unknown" ? ["-bsf:v", "h264_metadata=sei_user_data=0123456789abcdef0123456789abcdef+unrecognized"] : []),
    "-f", audio === "pcm" ? "mov" : "mp4", path];
  const result = await run(FFMPEG, args);
  if (result.code !== 0) throw new Error(`B2-A2 synthetic fixture generation failed: ${result.stderr}`);
  return path;
}

/** B2R e03/e03c/e11 synthetic timestamp shapes, constructed by stream copy from this test's own generated base. */
export async function generatePlanVariant(from: string, to: string, spec: { select?: boolean; rebase?: boolean; snap?: boolean; retime?: boolean; audio?: boolean;
  quantized?: boolean; container?: "mov" | "mp4"; heldFirst?: boolean }): Promise<string> {
  // A positive AAC start exposes the seed's formerly negative 1024-sample priming packet as presented audio. Align the synthetic video
  // with that exact 46976/48000 start (88080/90000), so this generated all-five case has a real common start; never hide a mismatch.
  const videoOffset = spec.audio ? 88080 : 90000;
  const video = `setts=time_base=1/90000:prescale=1:pts=PTS${spec.rebase ? `+${videoOffset}` : ""}${spec.snap ? "+round(180*sin(PTS/3000*1.7))" : spec.heldFirst ? "+if(gt(PTS\\,0)\\,3000\\,0)" : ""}`
    + `:dts=DTS${spec.rebase ? `+${videoOffset}` : ""}${spec.snap ? "+round(180*sin(DTS/3000*1.7))" : spec.heldFirst ? "+if(gt(DTS\\,0)\\,3000\\,0)" : ""}`;
  const audio = `setts=pts=PTS${spec.rebase ? "+48000" : ""}${spec.retime ? "-if(gte(N\\,27)\\,9\\,if(gte(N\\,4)\\,7\\,0))" : ""}`
    + `:dts=DTS${spec.rebase ? "+48000" : ""}${spec.retime ? "-if(gte(N\\,27)\\,9\\,if(gte(N\\,4)\\,7\\,0))" : ""}`;
  const result = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-copyts", "-i", from,
    "-map", "0:v:0", ...(spec.audio ? ["-map", "0:a:0"] : []), "-c", "copy", "-bsf:v", video,
    ...(spec.audio ? ["-bsf:a", audio] : []), "-video_track_timescale", spec.quantized ? "600" : "90000", "-avoid_negative_ts", "disabled",
    ...(spec.select ? ["-timecode", "00:00:00:00"] : []), "-f", spec.container ?? "mp4", to]);
  if (result.code !== 0) throw new Error(`B2-A2 synthetic variant construction failed: ${result.stderr}`);
  return to;
}

/** A generated mov_text track beside the generated video, to prove the other approved SELECT stream class. */
export async function generatePlanSubtitle(from: string, to: string): Promise<string> {
  const text = `${to}.srt`; await writeFile(text, "1\n00:00:00,000 --> 00:00:01,000\nGenerated fixture\n", { flag: "wx" });
  const result = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-copyts", "-i", from, "-i", text,
    "-map", "0:v:0", "-map", "1:s:0", "-c", "copy", "-c:s", "mov_text", "-f", "mp4", to]);
  if (result.code !== 0) throw new Error(`B2-A2 generated subtitle fixture failed: ${result.stderr}`);
  return to;
}
