// B2-B1 generated-media RESEARCH ONLY. No publication, lifecycle, cache, ingest routing or caller-selected production encoder.
// Every media input below must have been generated/registered by this harness. All children use verified pinned tools, held read-only
// source descriptors, exclusive new outputs, no shell, bounded time/output and fd/pipe-only protocols.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { PINNED_TOOL_ROOT } from "./edit-render-media.js";
import { sha256File } from "./canonical-media-fixtures.js";
import { inspectCanonicalLocalMedia } from "../../scripts/media-ingest-local.js";
import { PLAN_VERIFICATION_METHODS, planCanonicalReencode, buildCanonicalReencodeDerivation, type CanonicalMediaFacts, type D4Element } from "../../packages/media-ingest/index.js";
import { canonicalSerialize } from "../../packages/domain/serialization.js";
import { type RawYuvFrame, type PixelTransform, verifyExactPixels } from "./canonical-pixel-reference.js";

const PINS = { ffmpeg: "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3",
  ffprobe: "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f" };
const generated = new Set<string>();
/** Only the calling generated-fixture test may register its own fixture; never used from production. */
export const registerGenerated = (path: string): string => { generated.add(path); return path; };
export interface ProcessMeasurement { elapsedMs: number; peakCommitBytes: number | null; stderr: string; argv: readonly string[] }
export interface ResearchConfig { preset: "ultrafast" | "veryfast" | "medium"; threads: 1 | 2 | 4 }
export const RESEARCH_DEFAULT: ResearchConfig = { preset: "medium", threads: 2 };
export const FILTER_FOR_D4: Record<D4Element, readonly string[]> = { rotate_90_ccw: ["transpose=cclock"], rotate_180: ["hflip", "vflip"],
  rotate_90_cw: ["transpose=clock"], mirror_horizontal: ["hflip"], mirror_vertical: ["vflip"], transpose: ["transpose=cclock_flip"], transverse: ["transpose=clock_flip"] };
export const MATRIX_FOR_D4: Record<D4Element, number[]> = Object.fromEntries(Object.entries({ rotate_90_ccw: [0,-1,1,0], rotate_180: [-1,0,0,-1],
  rotate_90_cw: [0,1,-1,0], mirror_horizontal: [-1,0,0,1], mirror_vertical: [1,0,0,-1], transpose: [0,1,1,0], transverse: [0,-1,-1,0] })
  .map(([name,m]) => [name, [m[0]!*65536,m[1]!*65536,0,m[2]!*65536,m[3]!*65536,0,0,0,1073741824]])) as Record<D4Element, number[]>;

async function pinnedRun(tool: keyof typeof PINS, source: string, output: string | null, before: string[], after: string[], maxBytes = 128*1024*1024) {
  if (!generated.has(source)) throw new Error("Research refuses an unregistered source");
  const executable = join(PINNED_TOOL_ROOT, "bin", `${tool}.exe`);
  if (createHash("sha256").update(await readFile(executable)).digest("hex") !== PINS[tool]) throw new Error("Pinned executable mismatch");
  const identity = await sha256File(source), input = await open(source, "r");
  let target: Awaited<ReturnType<typeof open>> | null = null;
  const args = ["-hide_banner", ...(tool === "ffmpeg" ? ["-nostdin", "-nostats"] : []), "-loglevel", tool === "ffmpeg" ? "verbose" : "error", ...before,
    "-protocol_whitelist", "fd", "-fd", "3", "-i", "fd:", ...after,
    ...(output === null ? [] : ["-protocol_whitelist", "fd", "-fd", "4", "fd:"])];
  const start = performance.now();
  try {
    target = output === null ? null : await open(output, "wx+");
    const result = await new Promise<{ stdout: Buffer; stderr: string }>((accept, reject) => {
      const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe", input.fd, ...(target ? [target.fd] : [])] });
      const out: Buffer[] = [], err: Buffer[] = []; let count = 0, errors = 0, failed = false;
      let grace: ReturnType<typeof setTimeout> | undefined;
      const stop = () => { failed = true; child.kill(); grace ??= setTimeout(() => reject(new Error("Research child termination unconfirmed")), 2000); };
      const timer = setTimeout(stop, 120_000);
      child.stdout!.on("data", (b: Buffer) => { count += b.length; if (count > maxBytes) stop(); else out.push(b); });
      child.stderr!.on("data", (b: Buffer) => { errors += b.length; if (errors > 2*1024*1024) stop(); else err.push(b); });
      child.on("error", error => { clearTimeout(timer); if (grace) clearTimeout(grace); reject(error); });
      child.on("close", (code, signal) => {
        clearTimeout(timer); if (grace) clearTimeout(grace);
        const stderr = Buffer.concat(err).toString("utf8");
        if (code !== 0 || signal !== null || failed) reject(new Error(`Bounded research process failed: ${stderr}`));
        else accept({ stdout: Buffer.concat(out), stderr });
      });
    });
    const elapsedMs = performance.now() - start;
    if (JSON.stringify(identity) !== JSON.stringify(await sha256File(source))) throw new Error("Generated source changed during experiment");
    const peak = /maxrss=(\d+)KiB/.exec(result.stderr);
    if (output !== null) { await target!.sync(); generated.add(output); }
    return { ...result, elapsedMs, peakCommitBytes: peak ? Number(peak[1])*1024 : null, argv: args };
  } finally { await input.close(); await target?.close(); }
}

interface Packet { stream_index: number; pts: number; dts: number; duration: number; size: string; pos: string }
async function packetsGenerated(source: string): Promise<Packet[]> {
  const result = await pinnedRun("ffprobe", source, null, [], ["-show_packets", "-show_entries", "packet=stream_index,pts,dts,duration,size,pos", "-of", "json"]);
  const packets = (JSON.parse(result.stdout.toString("utf8")) as { packets: Packet[] }).packets;
  for (const p of packets) if (![p.stream_index,p.pts,p.dts,p.duration,Number(p.size),Number(p.pos)].every(Number.isSafeInteger)
    || Number(p.pos) < 0 || Number(p.size) <= 0) throw new Error("Invalid measured packet bounds");
  return packets;
}
export async function audioPayloadDigest(source: string, facts: CanonicalMediaFacts): Promise<string | null> {
  const audio = facts.streams.find(s => s.kind === "audio");
  if (!audio) return null;
  const bytes = await readFile(source), packets = (await packetsGenerated(source)).filter(p => p.stream_index === audio.index);
  if (!packets.length) throw new Error("No audio packets");
  const rows = packets.map((p,index) => {
    const position = Number(p.pos), size = Number(p.size);
    if (position+size > bytes.length) throw new Error("Packet beyond held file");
    return { index,size,md5:createHash("md5").update(bytes.subarray(position,position+size)).digest("hex") };
  });
  return createHash("sha256").update(canonicalSerialize({ method:PLAN_VERIFICATION_METHODS.audioPackets,codec:audio.codec,count:rows.length,rows })).digest("hex");
}

export function calibrationFrames(width = 64, height = 48, count = 9): RawYuvFrame[] {
  if (width % 2 || height % 2 || width < 8 || height < 8 || count < 2) throw new Error("Calibration bounds");
  return Array.from({ length: count }, (_, frame) => {
    const bytes = new Uint8Array(width*height*3/2); let offset = 0;
    for (let plane = 0; plane < 3; plane++) {
      const w = width/(plane === 0 ? 1 : 2), h = height/(plane === 0 ? 1 : 2);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const region = Math.floor(y*4/h), q = (x < w/2 ? 0 : 1)+(y < h/2 ? 0 : 2);
        let value = region === 0 ? 23 + q*39 + (x % 7)*3 + frame*5 + plane*17
          : region === 1 ? 16 + (((x >> (plane % 2)) + y + frame) % 2)*210 + plane*2
          : region === 2 ? 16 + Math.floor(200*(x+2*y)/(w+2*h)) + frame*3 + plane*19
          : 16 + ((x*73 ^ y*151 ^ frame*47 ^ plane*97) % 220);
        if (x >= (frame*3)%w && x < (frame*3)%w+5 && y >= 2 && y < h/3) value = 31+plane*63+frame;
        bytes[offset+y*w+x] = 16 + ((value-16)%220+220)%220;
      }
      offset += w*h;
    }
    return { pixelFormat: "yuv420p", width, height, bytes };
  });
}
export async function encodeGeneratedSource(directory: string, name: string, codec: "h264" | "hevc", frames: RawYuvFrame[],
  color: "explicit" | "unspecified_description" = "explicit"): Promise<string> {
  const raw = join(directory, `${name}.yuv`), out = join(directory, `${name}.mp4`), { width, height } = frames[0]!;
  await writeFile(raw, Buffer.concat(frames.map(f => Buffer.from(f.bytes))), { flag: "wx" }); generated.add(raw);
  await pinnedRun("ffmpeg", raw, out, ["-f", "rawvideo", "-pixel_format", "yuv420p", "-video_size", `${width}x${height}`, "-framerate", "30"],
    ["-map", "0:v:0", "-vf", `setsar=1,setparams=range=limited${color === "explicit" ? ":color_primaries=bt709:color_trc=bt709:colorspace=bt709" : ""}`,
      "-noautoscale", "-c:v", codec === "hevc" ? "libx265" : "libx264", "-qp", "25", "-bf", "0", "-g", "30",
      "-pix_fmt", "+yuv420p", "-threads:v", "1", ...(codec === "hevc" ? ["-x265-params", "pools=none:frame-threads=1:log-level=error"] : []),
      "-color_range", "tv", ...(color === "explicit" ? ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"] : []),
      "-video_track_timescale", "15360", "-fflags", "+bitexact", "-f", "mp4"]);
  return out;
}
export async function observeGenerated(source: string, workspaceRoot: string): Promise<CanonicalMediaFacts> {
  if (!generated.has(source)) throw new Error("Not a generated source");
  return (await inspectCanonicalLocalMedia({ sourcePath: source, workspaceRoot, toolRoot: PINNED_TOOL_ROOT, clock: { now: () => "2026-10-08T00:00:00.000Z" },
    rootAuthorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", ...await sha256File(source), sourceType: "owner_supplied",
      authorizationBasis: "owner_created", allowedPurposes: ["local_footage_analysis"], dateAdded: "2026-10-01T00:00:00.000Z", creatorId: "creator_b1_generated",
      projectId: "project_b1_generated", canonicalizationConsent: "local_media_canonicalization" } })).facts;
}
export async function decodeGenerated(source: string, width: number, height: number) {
  const result = await pinnedRun("ffmpeg", source, null, ["-threads", "1", "-noautorotate"], ["-map", "0:v:0", "-fps_mode", "passthrough",
    "-noautoscale", "-pix_fmt", "+yuv420p", "-threads:v", "1", "-protocol_whitelist", "pipe", "-f", "rawvideo", "pipe:1"]);
  const size = width*height*3/2;
  if (result.stdout.length % size !== 0) throw new Error("Incomplete raw frame");
  return { ...result, frames: Array.from({ length: result.stdout.length/size }, (_, i) => ({ pixelFormat: "yuv420p", width, height,
    bytes: result.stdout.subarray(i*size,(i+1)*size) })) };
}
/** Closed experimental encoder. Parameters here are research variables, never ingest caller inputs. Final contract fixes one profile. */
export async function researchEncode(source: string, output: string, transform: PixelTransform, facts: CanonicalMediaFacts,
  config = RESEARCH_DEFAULT): Promise<ProcessMeasurement> {
  const planning = planCanonicalReencode(facts), plan = planning.plan;
  if (planning.outcome !== "PLAN" || plan === null || plan.transform !== transform) throw new Error(`Research requires a fresh supported plan: ${planning.reason}`);
  const v = facts.streams.find(s => s.kind === "video")!;
  if (v.kind !== "video") throw new Error("Video required");
  const a = facts.streams.find(s => s.kind === "audio");
  const filters = [...(transform === "identity" ? [] : FILTER_FOR_D4[transform]), "setsar=1",
    "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709"];
  const snap = plan.operations.find(o => o.op === "SNAP_VIDEO_TIMESTAMPS"), rebase = plan.operations.find(o => o.op === "REBASE_TIMELINE_ZERO");
  const retime = plan.operations.some(o => o.op === "RETIME_AUDIO_CONTIGUOUS"), offset = (index: number) => rebase?.offsets.find(o => o.streamIndex === index)?.offsetTicks ?? 0;
  // One decoded frame is one output frame. The old timing planner alone decides the grid/offset; these filters change only PTS.
  if (rebase) filters.push(`setpts=PTS-${offset(v.index)}`);
  if (snap) filters.push(`settb=expr=1/${snap.outputTimeBase.denominator}`, `setpts=N*${snap.gridPeriodTicks}`);
  const audioFilters: string[] = [];
  if (a && (retime || rebase)) {
    const packets = (await packetsGenerated(source)).filter(p => p.stream_index === a.index), frames = new Map(a.frames.map(f => [f.pts,f.samples]));
    const full = Math.max(...a.frames.map(f => f.samples));
    const samples = packets.map(p => {
      if (a.codec === "pcm_s16le") {
        const count = Number(p.size)/(2*a.channels);
        if (!Number.isSafeInteger(count) || count <= 0 || (frames.has(p.pts) && frames.get(p.pts) !== count)) throw new Error("PCM sample mapping");
        return count;
      }
      const observed = frames.get(p.pts);
      if (observed !== undefined) return observed;
      if (p.pts < a.frames[0]!.pts && p.duration === full) return full;
      throw new Error("AAC packet lacks decoded sample mapping");
    });
    if (!packets.length) throw new Error("No retained packets");
    const runs: {start:number;samples:number}[] = [];
    samples.forEach((count,index) => { if (!index || count !== samples[index-1]) runs.push({start:index,samples:count}); });
    const duration = (lo:number,hi:number):string => {
      if (lo+1 === hi) return String(runs[lo]!.samples);
      const mid = Math.floor((lo+hi)/2);
      return `if(lt(N\\,${runs[mid]!.start})\\,${duration(lo,mid)}\\,${duration(mid,hi)})`;
    };
    const pts = retime ? `if(eq(N\\,0)\\,${packets[0]!.pts-offset(a.index)}\\,PREV_OUTPTS+PREV_OUTDURATION)` : `PTS-${offset(a.index)}`;
    const dts = retime ? `if(eq(N\\,0)\\,${packets[0]!.dts-offset(a.index)}\\,PREV_OUTDTS+PREV_OUTDURATION)` : `DTS-${offset(a.index)}`;
    audioFilters.push(`setts=pts=${pts}:dts=${dts}:duration=${duration(0,runs.length)}`);
  }
  const result = await pinnedRun("ffmpeg", source, output, ["-benchmark", "-copyts", "-filter_threads", "1", "-threads", "1", "-noautorotate", "-display_rotation:v:0", "0"],
    ["-map", `0:${v.index}`, ...(a === undefined ? [] : ["-map", `0:${a.index}`, "-c:a", "copy"]), "-vf", filters.join(","), "-noautoscale",
      "-c:v", "libx264", "-qp", "0", "-preset", config.preset, "-profile:v", "high444", "-pix_fmt", "+yuv420p", "-threads:v", String(config.threads),
      "-bf", "0", "-g", "30", "-sc_threshold", "0", "-x264-params", "lookahead-threads=1:sliced-threads=0", "-a53cc", "0", "-udu_sei", "0",
      "-color_range", "tv", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-fps_mode", "passthrough",
      "-enc_time_base:v", `1:${plan.videoTiming.outputTimeBase.denominator}`, "-video_track_timescale", String(plan.videoTiming.outputTimeBase.denominator),
      ...(audioFilters.length ? ["-bsf:a", audioFilters.join(",")] : []), "-map_metadata", "-1", "-map_chapters", "-1",
      "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", "-fs", String(256*1024*1024), "-f", a?.kind === "audio" && a.codec === "pcm_s16le" ? "mov" : "mp4"]);
  if (/auto_scale|auto-inserting filter/.test(result.stderr)) throw new Error("Implicit encoding conversion");
  return result;
}
export async function verifyGenerated(source: string, output: string, transform: PixelTransform, sourceFacts: CanonicalMediaFacts, workspace: string) {
  const start = performance.now(), outputFacts = await observeGenerated(output, workspace);
  const sv = sourceFacts.streams.find(s => s.kind === "video")!, ov = outputFacts.streams.find(s => s.kind === "video")!;
  if (sv.kind !== "video" || ov.kind !== "video") throw new Error("Missing video");
  const a = await decodeGenerated(source, sv.geometry.declared.width, sv.geometry.declared.height);
  const b = await decodeGenerated(output, ov.geometry.declared.width, ov.geometry.declared.height);
  const pixels = verifyExactPixels(a.frames,b.frames,transform);
  if (/auto_scale|auto-inserting filter/.test(a.stderr+b.stderr)) throw new Error("Implicit conversion");
  const sourceAudio = await audioPayloadDigest(source,sourceFacts), outputAudio = await audioPayloadDigest(output,outputFacts);
  const sourceIdentity = await sha256File(source), outputIdentity = await sha256File(output);
  const derivation = buildCanonicalReencodeDerivation({ rootAuthorization:{manifestType:"AuthorizedFootage",schemaVersion:"1.1.0",...sourceIdentity,
    sourceType:"owner_supplied",authorizationBasis:"owner_created",allowedPurposes:["local_footage_analysis"],dateAdded:"2026-10-01T00:00:00.000Z",
    creatorId:"creator_b1_generated",projectId:"project_b1_generated",canonicalizationConsent:"local_media_canonicalization"}, sourceFacts,
    plan:planCanonicalReencode(sourceFacts).plan,output:{...outputIdentity,facts:outputFacts},pixels,
    audioPackets:sourceAudio === null && outputAudio === null ? null : {method:PLAN_VERIFICATION_METHODS.audioPackets,sourceDigest:sourceAudio,outputDigest:outputAudio} });
  return { pixels, outputFacts, derivation, elapsedMs: performance.now()-start };
}

/** Checkpoint B generated-only metadata fixture: no sample encode, no arbitrary bitstream-filter arguments. */
export async function declareGeneratedChroma(source:string, output:string, codec:"h264"|"hevc", location:0|1|2|3|4|5):Promise<string> {
  if(!["h264","hevc"].includes(codec) || !Number.isInteger(location) || location<0 || location>5)throw new Error("Closed chroma fixture declaration required");
  await pinnedRun("ffmpeg",source,output,["-threads","1","-noautorotate"],["-map","0:v:0","-c:v","copy","-bsf:v",`${codec}_metadata=chroma_sample_loc_type=${location}`,
    "-map_metadata","-1","-fflags","+bitexact","-f","mp4"]);
  return output;
}

/** C–D fixture constructor: copy generated AV/timecode tracks and declare explicit center on a NEW object only. */
export async function declareGeneratedAvCenter(source: string, output: string, codec: "h264" | "hevc",
  timescale: 15360 | 90000 | 600 = 90000, mux: "mp4" | "mov" = "mp4", timecode = false): Promise<string> {
  if (!["h264", "hevc"].includes(codec) || ![15360, 90000, 600].includes(timescale) || !["mp4", "mov"].includes(mux)) throw new Error("Closed generated AV declaration required");
  await pinnedRun("ffmpeg", source, output, ["-copyts", "-threads", "1", "-noautorotate"],
    ["-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-bsf:v", codec + "_metadata=chroma_sample_loc_type=1", "-video_track_timescale", String(timescale),
      "-avoid_negative_ts", "disabled", "-map_metadata", "-1", ...(timecode ? ["-timecode", "00:00:00:00"] : []), "-fflags", "+bitexact", "-f", mux]);
  return output;
}
