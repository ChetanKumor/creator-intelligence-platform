/**
 * Independent technical media QC for Gate 7 Batch 2B, structurally separate from the renderer: it imports nothing from the render
 * adapter, trusts no success claim, and independently re-verifies the pinned ffprobe and ffmpeg by full digest inside the approved
 * tool root. It locates the published output only by its content identity and holds that one object for the whole inspection: it
 * hashes it, probes its streams and every decoded frame, and fully decodes it with errors fatal, each child reading its own held handle
 * (proven to be the same file object) inherited as `-fd 3 fd:` under an `fd`-only protocol whitelist, and re-verifies the bytes after
 * inspection. Expectations come from the accepted DAG. This is technical QC only, never an editing-quality judgment.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, realpath, rm, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EditRenderError, MAX_PROBE_OUTPUT_BYTES, PINNED_MEDIA_RUNTIME, RenderExecutionReceiptSchema, buildQcReceipt, parseVersionBanner, type EditRenderErrorCode,
  type RenderExecutionReceipt, type TechnicalMediaQcReceipt } from "../packages/edit-render/index.js";
import type { ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import { requireValidated } from "../packages/edit-runtime/validated.js";
import type { LocalEditRuntime } from "./edit-runtime-local.js";

function fail(code: EditRenderErrorCode, message: string): never { throw new EditRenderError(code, message); }
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const APPROVED_TOOL_ROOT = resolve(PROJECT_ROOT, ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build");
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const within = (root: string, target: string) => { const path = relative(root, target); return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path); };

interface Opened { handle: FileHandle; sizeBytes: number; dev: bigint; ino: bigint }
async function openRegular(path: string, code: EditRenderErrorCode): Promise<Opened | null> {
  let info;
  try { info = await lstat(path, { bigint: true }); } catch { return null; }
  if (info.isSymbolicLink() || !info.isFile()) fail(code, "Only a regular file is inspected.");
  const handle = await open(path, "r"), opened = await handle.stat({ bigint: true });
  if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) { await handle.close(); fail(code, "Another file took the inspected name."); }
  return { handle, sizeBytes: Number(opened.size), dev: opened.dev, ino: opened.ino };
}
/** The identity of the bytes a held handle refers to now: its current size and the full SHA-256 of that many bytes. */
async function currentIdentity(held: Opened): Promise<{ contentHash: string; sizeBytes: number }> {
  const sizeBytes = Number((await held.handle.stat({ bigint: true })).size);
  return { contentHash: await digest({ ...held, sizeBytes }), sizeBytes };
}
async function digest(opened: Opened): Promise<string> {
  const hash = createHash("sha256"), buffer = Buffer.alloc(1_048_576);
  for (let position = 0; position < opened.sizeBytes;) {
    const { bytesRead } = await opened.handle.read(buffer, 0, Math.min(buffer.length, opened.sizeBytes - position), position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
  }
  return hash.digest("hex");
}
/** The QC adapter's own verification of one pinned binary: approved root, containment, regular file, exact digest and size. */
async function pinned(toolRoot: string, which: "ffmpeg" | "ffprobe"): Promise<string> {
  let root: string, approved: string, real: string;
  try { root = await realpath(toolRoot); approved = await realpath(APPROVED_TOOL_ROOT); real = await realpath(join(root, "bin", `${which}.exe`)); } catch {
    fail("qc_tool_unavailable", `The pinned ${which} is unavailable.`);
  }
  if (root !== approved || !within(root, real)) fail("qc_tool_unavailable", "QC tools come only from the approved pinned distribution.");
  const opened = await openRegular(real, "qc_tool_unavailable");
  if (opened === null) fail("qc_tool_unavailable", `The pinned ${which} is missing.`);
  try {
    if (opened.sizeBytes !== PINNED_MEDIA_RUNTIME[which].sizeBytes || await digest(opened) !== PINNED_MEDIA_RUNTIME[which].sha256) fail("qc_tool_unavailable", `The ${which} is not the pinned build.`);
  } finally { await opened.handle.close(); }
  return real;
}
/** What QC supervision needs of an already-spawned pinned child: its output streams, a termination request and its completion events. */
export interface QcChild {
  stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  kill(): boolean;
  on(event: "spawn", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null) => void): unknown;
}
/**
 * One supervised QC run. `spawnError` is true only when the child never started; `errorAfterSpawn` records an error reported after it
 * started, which proves nothing about its termination; `terminationConfirmed` is true only when a started child's close was observed.
 */
export interface QcRun { code: number | null; stdout: string; stderr: string; overflow: boolean; spawnError: boolean; errorAfterSpawn: boolean; timedOut: boolean;
  terminationConfirmed: boolean }
export interface QcProcessLimits { timeoutMilliseconds: number; terminationGraceMilliseconds: number }
export const QC_PROCESS_LIMITS: QcProcessLimits = Object.freeze({ timeoutMilliseconds: 120_000, terminationGraceMilliseconds: 10_000 });
/**
 * Supervises one already-spawned pinned child with bounded capture and a hard timeout. It never starts anything itself. Only the child's
 * spawn event proves it started: an error before it is a spawn error. An error after it proves nothing about termination. Termination
 * is requested once, at the timeout or on an error after spawn, and only an observed close confirms it; if the child has not closed
 * within the bounded grace, supervision stops waiting and reports the termination as unconfirmed. It never waits forever.
 */
export function superviseQcProcess(child: QcChild, limits: QcProcessLimits): Promise<QcRun> {
  return new Promise(done => {
    const out: Buffer[] = [], err: Buffer[] = [];
    let bytes = 0, overflow = false, settled = false, timedOut = false, spawned = false, errorAfterSpawn = false, terminationRequested = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null, spawnError: boolean, terminationConfirmed: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer); if (grace !== undefined) clearTimeout(grace);
      done({ code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8").slice(0, 65_536), overflow, spawnError, errorAfterSpawn,
        timedOut, terminationConfirmed });
    };
    const terminate = () => {
      if (terminationRequested) return;
      terminationRequested = true; clearTimeout(timer);
      grace = setTimeout(() => finish(null, false, false), limits.terminationGraceMilliseconds);
      child.kill();
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, limits.timeoutMilliseconds);
    child.stdout?.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > MAX_PROBE_OUTPUT_BYTES) { overflow = true; return; } out.push(chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { if (err.reduce((n, c) => n + c.length, 0) < 65_536) err.push(chunk); });
    child.on("spawn", () => { spawned = true; });
    child.on("error", () => { if (!spawned) { finish(null, true, true); return; } errorAfterSpawn = true; terminate(); });
    child.on("close", code => finish(code, false, true));
  });
}
/** A run counts only if it closed by itself with exit 0 inside its bounds: no spawn error, error after spawn, overflow, timeout or unconfirmed end. */
const completed = (run: QcRun) => run.code === 0 && !run.spawnError && !run.errorAfterSpawn && !run.overflow && !run.timedOut && run.terminationConfirmed;
function run(executable: string, argv: readonly string[], fd: number | null, cwd: string): Promise<QcRun> {
  const env: Record<string, string> = process.env["SystemRoot"] === undefined ? {} : { SystemRoot: process.env["SystemRoot"] };
  let child: QcChild;
  try {
    child = spawn(executable, [...argv], { shell: false, windowsHide: true, cwd, env, stdio: fd === null ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe", fd] });
  } catch {
    // A synchronous spawn failure is a spawn error of this run, never an escaping exception.
    return Promise.resolve({ code: null, stdout: "", stderr: "", overflow: false, spawnError: true, errorAfterSpawn: false, timedOut: false, terminationConfirmed: true });
  }
  return superviseQcProcess(child, QC_PROCESS_LIMITS);
}
/** The version a fixed `-version` query reported, read only from a query that completed; anything else fails closed. */
export function reportedVersionOf(run: QcRun, tool: "ffmpeg" | "ffprobe"): string {
  if (!completed(run)) fail("qc_tool_unavailable", `The fixed ${tool} version query did not complete.`);
  return parseVersionBanner(run.stdout, tool);
}
const STREAM_ENTRIES = "stream=index,codec_type,codec_name,profile,width,height,sample_aspect_ratio,pix_fmt,r_frame_rate,avg_frame_rate,time_base,start_pts,duration_ts,"
  + "sample_rate,channels,channel_layout:stream_side_data=side_data_type,rotation:format=format_name,duration,size,nb_streams";
const FRAME_ENTRIES = "stream=index,codec_type:format=format_name:frame=stream_index,pts,nb_samples";

export interface QcInstrumentation {
  /** Test-only observation point: called once the output's identity is established, immediately before the first inspecting child. */
  afterIdentityEstablished?: () => Promise<void>;
}
export async function runTechnicalMediaQc(input: { dag: ValidatedExecutionDag; receipt: RenderExecutionReceipt; runtime: LocalEditRuntime; toolRoot: string;
  instrumentation?: QcInstrumentation }): Promise<TechnicalMediaQcReceipt> {
  const dag = requireValidated(input.dag);
  let receipt: RenderExecutionReceipt;
  try { receipt = RenderExecutionReceiptSchema.parse(input.receipt); } catch { fail("qc_receipt_invalid", "QC inspects only a well-formed execution receipt."); }
  // QC is timed only by the trusted clock of the runtime it inspects; no caller-supplied clock ever dates a QC receipt.
  const clock = input.runtime.clock;
  const now = () => { const t = clock.now(); if (typeof t !== "string" || !TIMESTAMP.test(t)) fail("input_invalid", "The runtime clock must report exact UTC milliseconds."); return t; };
  const checkStartedAt = now();
  const ffprobe = await pinned(input.toolRoot, "ffprobe"), ffmpeg = await pinned(input.toolRoot, "ffmpeg");
  const version = async (path: string, tool: "ffmpeg" | "ffprobe", cwd: string) => reportedVersionOf(await run(path, ["-hide_banner", "-loglevel", "error", "-version"], null, cwd), tool);
  const work = join(input.runtime.layout.root, "render-work", `qc-${randomBytes(16).toString("hex")}`);
  await mkdir(work, { recursive: true });
  const held: Opened[] = [];
  try {
    // The object is located only by its content identity, and re-hashed here, whatever the receipt claims.
    if (!/^[a-f0-9]{64}$/.test(receipt.output.contentHash)) fail("qc_receipt_invalid", "The output identity is not a content digest.");
    const path = join(input.runtime.layout.root, "render-outputs", `${receipt.output.contentHash}.mp4`);
    // The published object is held for the whole inspection: one handle for its identity and one for each inspecting child, every one
    // proven to be the object first opened. The pathname is never reopened, so a later rename or swap cannot change what QC inspects.
    const first = await openRegular(path, "qc_output_missing");
    if (first !== null) {
      held.push(first);
      for (let child = 0; child < 3; child += 1) {
        const next = await openRegular(path, "qc_output_missing");
        if (next !== null) held.push(next);
        if (next === null || next.dev !== first.dev || next.ino !== first.ino) fail("qc_output_missing", "The published object changed while QC acquired it.");
      }
    }
    const identity = first === null ? { contentHash: createHash("sha256").update("").digest("hex"), sizeBytes: 0 } : await currentIdentity(first);
    await input.instrumentation?.afterIdentityEstablished?.();
    const absent: QcRun = { code: null, stdout: "", stderr: "", overflow: false, spawnError: false, errorAfterSpawn: false, timedOut: false, terminationConfirmed: true };
    const inspect = async (slot: number, argv: readonly string[], executable: string) => {
      const opened = held[slot];
      return opened === undefined ? absent : run(executable, argv, opened.handle.fd, work);
    };
    const head = ["-hide_banner", "-loglevel", "error", "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3"];
    const streams = await inspect(1, [...head, "-show_entries", STREAM_ENTRIES, "-of", "json=compact=1", "-i", "fd:"], ffprobe);
    const frames = await inspect(2, [...head, "-show_entries", FRAME_ENTRIES, "-of", "json=compact=1", "-i", "fd:"], ffprobe);
    const decode = await inspect(3, ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-xerror", "-err_detect", "explode", "-protocol_whitelist", "fd", "-f", "mov",
      "-fd", "3", "-i", "fd:", "-map", "0", "-f", "null", "-"], ffmpeg);
    // Re-verified after inspection: bytes changed in place while QC inspected them are reported as what they now are, so they never pass.
    const after = first === null ? identity : await currentIdentity(first);
    const observedIdentity = after.contentHash === identity.contentHash && after.sizeBytes === identity.sizeBytes ? identity : after;
    const tools = { ffprobeSha256: PINNED_MEDIA_RUNTIME.ffprobe.sha256, ffprobeReportedVersion: await version(ffprobe, "ffprobe", work),
      ffmpegSha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256, ffmpegReportedVersion: await version(ffmpeg, "ffmpeg", work) };
    const checkCompletedAt = now();
    if (checkCompletedAt < checkStartedAt) fail("evidence_chronology_invalid", "The clock ran backwards during QC.");
    return buildQcReceipt({ dag: dag.dag, receipt, observedIdentity,
      // Only a completed probe is evidence; a decode that did not complete by itself never reports a successful exit.
      observation: { streamsJson: completed(streams) ? streams.stdout : "", framesJson: completed(frames) ? frames.stdout : "",
        decode: { exitCode: completed(decode) ? 0 : decode.code === 0 ? null : decode.code, errorLines: decode.stderr.split(/\r?\n/).filter(line => line.trim() !== "") } }, tools,
      timing: { checkStartedAt, observedAt: checkStartedAt, checkCompletedAt, observedAtBasis: "check_started_lower_bound" } });
  } finally {
    for (const opened of held) await opened.handle.close().catch(() => undefined);
    await rm(work, { recursive: true, force: true });
  }
}
