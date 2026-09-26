// Test-only synthetic media for the Gate-7 Batch-2B actual-media suite. Fixture generation is NOT EditGraph execution: it runs the
// already verified pinned FFmpeg by absolute path (never PATH, never a shell) over lavfi test patterns only, writing tiny files into a
// test-owned directory. Every generated source must then enter the normal chain (fixture registration, analysis evidence, graph,
// admission, claim, staging) before the Batch-2B renderer may consume its staged bytes. No real footage is read.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const PINNED_TOOL_ROOT = resolve(PROJECT_ROOT, ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build");
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
async function ffmpeg(args: readonly string[]): Promise<void> {
  const result = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", "-n", ...args]);
  if (result.code !== 0) throw new Error(`synthetic fixture generation failed: ${result.stderr}`);
}

export interface SourceSpec {
  /** lavfi video: a moving frame-counter test pattern or a solid colour. */
  video: { pattern: "testsrc2" } | { pattern: "color"; color: string };
  /** A sine tone in Hz, or no audio stream at all. */
  tone: number | null;
  /** Source instants at which the tone switches to another frequency, so the source time of any audio window is identifiable. */
  toneChanges?: readonly { atSeconds: number; frequency: number }[];
  /** 30 fps CFR on the i / 30 grid (no B-frames, exact MOV timescale), or 30 fps then 10 fps (variable timing). */
  timing?: "cfr" | "vfr";
  width?: number;
  height?: number;
}
/** Rows of the frame-index band at the bottom of every generated frame (of 160): 8 binary cells, least significant bit on the left. */
export const INDEX_BAND_ROWS = 16;
/**
 * A 4-second 9:16 MOV: H.264 yuv420p without B-frames, and 48 kHz stereo PCM when a tone is given. Every frame carries its own
 * generated frame number in a black/white binary band, so the exact source frame behind any rendered frame can be read back.
 */
export async function generateSource(directory: string, name: string, spec: SourceSpec): Promise<string> {
  const width = spec.width ?? 90, height = spec.height ?? 160, path = join(directory, name);
  const base = spec.video.pattern === "testsrc2" ? `testsrc2=s=${width}x${height}:r=30` : `color=c=${spec.video.color}:s=${width}x${height}:r=30`;
  const band = `color=c=black:s=${width}x${INDEX_BAND_ROWS}:r=30,format=yuv420p,geq=lum='16+219*mod(floor(N/pow(2\\,floor(X*8/W)))\\,2)':cb=128:cr=128`;
  const video = `${base}[base];${band}[band];[base][band]overlay=x=0:y=${height - INDEX_BAND_ROWS}[out0]`;
  const timing = spec.timing === "vfr" ? ["-vf", "setpts='if(lt(N\\,60)\\,N/(30*TB)\\,(2+(N-60)/10)/TB)'", "-fps_mode", "vfr", "-frames:v", "80"] : ["-frames:v", "120"];
  const changes = spec.toneChanges ?? [];
  // The piecewise frequency: if(lt(t,c1), f0, if(lt(t,c2), f1, f2)), with commas escaped for the filter-option level.
  const frequency = (i: number, current: number): string => i === changes.length ? String(current)
    : `if(lt(t\\,${changes[i]!.atSeconds})\\,${current}\\,${frequency(i + 1, changes[i]!.frequency)})`;
  const audio = spec.tone === null ? [] : ["-f", "lavfi", "-i", `aevalsrc=exprs='sin(2*PI*${frequency(0, spec.tone)}*t)':sample_rate=48000:duration=4`];
  const maps = spec.tone === null ? ["-map", "0:v"] : ["-filter_complex", "[1:a]aformat=channel_layouts=stereo[a]", "-map", "0:v", "-map", "[a]", "-c:a", "pcm_s16le"];
  await ffmpeg(["-f", "lavfi", "-i", video, ...audio, ...maps, ...timing, "-c:v", "libx264", "-bf", "0", "-pix_fmt", "yuv420p", "-threads", "1", "-f", "mov", path]);
  return path;
}
/** A deliberately wrong MP4 for QC attacks, produced by the fixture generator, never by the renderer. */
export async function generateWrongOutput(path: string, o: { width?: number; height?: number; rate?: number; frames?: number; audio?: { rate: number; layout: "mono" | "stereo" } | null }): Promise<void> {
  const audio = o.audio === null ? [] : ["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=${o.audio?.rate ?? 48000}:duration=10`];
  const maps = o.audio === null ? ["-map", "0:v"] : ["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-ar", String(o.audio?.rate ?? 48000), "-ac", o.audio?.layout === "mono" ? "1" : "2",
    "-t", String((o.frames ?? 120) / (o.rate ?? 30))];
  await ffmpeg(["-f", "lavfi", "-i", `testsrc2=s=${o.width ?? 180}x${o.height ?? 320}:r=${o.rate ?? 30}`, ...audio, ...maps, "-frames:v", String(o.frames ?? 120),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1", "-f", "mp4", path]);
}
/** Mean RGB of selected decoded frames, for exact-cut evidence in the test only. */
export async function meanRgb(path: string, frames: readonly number[]): Promise<number[][]> {
  const select = frames.map(n => `eq(n\\,${n})`).join("+");
  const result = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", path, "-map", "0:v:0", "-vf", `select='${select}',scale=1:1:flags=area,format=rgb24`,
    "-fps_mode", "passthrough", "-f", "rawvideo", "-"]);
  if (result.code !== 0) throw new Error(`frame sampling failed: ${result.stderr}`);
  return frames.map((_, i) => [...result.stdout.subarray(i * 3, i * 3 + 3)]);
}
/** Decoded video frame PTS of a file, for fixture self-checks only. */
export async function framePts(path: string): Promise<number[]> {
  const result = await run(FFPROBE, ["-hide_banner", "-loglevel", "error", "-select_streams", "v:0", "-show_entries", "frame=pts", "-of", "csv=p=0", path]);
  if (result.code !== 0) throw new Error(`fixture probe failed: ${result.stderr}`);
  // A frame carrying side data prints an extra, empty CSV column; the PTS is always the first field.
  return result.stdout.toString("utf8").trim().split(/\r?\n/).map(line => Number(line.split(",")[0]));
}
/** Every decoded video frame of a file as 8-bit gray at its own size, for exact frame-identity evidence in the test only. */
export async function decodeGrayFrames(path: string, width: number, height: number): Promise<Uint8Array[]> {
  const result = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", path, "-map", "0:v:0", "-fps_mode", "passthrough", "-pix_fmt", "gray",
    "-f", "rawvideo", "-"]);
  if (result.code !== 0) throw new Error(`frame decoding failed: ${result.stderr}`);
  const size = width * height, frames: Uint8Array[] = [];
  if (result.stdout.length % size !== 0) throw new Error("decoded bytes are not whole frames of the stated size");
  for (let at = 0; at < result.stdout.length; at += size) frames.push(result.stdout.subarray(at, at + size));
  return frames;
}
const mean = (frame: Uint8Array, width: number, x0: number, x1: number, y0: number, y1: number) => {
  let sum = 0, n = 0;
  for (let y = Math.round(y0); y < Math.round(y1); y += 1) for (let x = Math.round(x0); x < Math.round(x1); x += 1) { sum += frame[y * width + x]!; n += 1; }
  return sum / n;
};
/** The generated frame number a frame carries in its binary band, read from the centre of each of the 8 cells. */
export function frameIndexOf(frame: Uint8Array, width: number, height: number): number {
  const band = (height * INDEX_BAND_ROWS) / 160, cell = width / 8;
  let index = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    if (mean(frame, width, bit * cell + cell / 4, (bit + 1) * cell - cell / 4, height - band * 0.75, height - band * 0.25) > 128) index += 2 ** bit;
  }
  return index;
}
/** Whether the picture above the band is one flat colour (the solid source) rather than the moving test pattern. */
export function isSolidFrame(frame: Uint8Array, width: number, height: number): boolean {
  const top = Math.floor(height * 0.8), values = frame.subarray(0, top * width);
  const average = values.reduce((n, v) => n + v, 0) / values.length;
  return Math.sqrt(values.reduce((n, v) => n + (v - average) ** 2, 0) / values.length) < 4;
}
/** The first audio stream decoded to 48 kHz mono 16-bit PCM. */
export async function decodeMonoAudio(path: string): Promise<Int16Array> {
  const result = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"]);
  if (result.code !== 0) throw new Error(`audio decoding failed: ${result.stderr}`);
  return new Int16Array(result.stdout.buffer.slice(result.stdout.byteOffset, result.stdout.byteOffset + result.stdout.length));
}
/** The dominant candidate frequency (Goertzel power) of each 10 ms window, or null when no candidate dominates by 10x. */
export function dominantTones(samples: Int16Array, candidates: readonly number[], rate = 48_000): (number | null)[] {
  const window = rate / 100, tones: (number | null)[] = [];
  for (let start = 0; start + window <= samples.length; start += window) {
    const powers = candidates.map(frequency => {
      const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / rate);
      let s1 = 0, s2 = 0;
      for (let n = start; n < start + window; n += 1) { const s = samples[n]! + coefficient * s1 - s2; s2 = s1; s1 = s; }
      return s1 * s1 + s2 * s2 - coefficient * s1 * s2;
    });
    const best = powers.indexOf(Math.max(...powers)), rest = powers.filter((_, i) => i !== best);
    tones.push(rest.every(p => powers[best]! > 10 * p) ? candidates[best]! : null);
  }
  return tones;
}
export async function sha256Of(path: string): Promise<{ contentHash: string; sizeBytes: number }> {
  const bytes = await readFile(path);
  return { contentHash: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
}
