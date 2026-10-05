/**
 * Gate 7 Batch 3E-B1B: the one local adapter that may canonicalize media. It classifies one owner-authorized local source from a pinned
 * ffprobe of its exact verified bytes, and for NORMALIZE_N1 alone it runs exactly the accepted N1 recipe (packages/media-ingest/canonical.ts)
 * under the pinned FFmpeg, verifies the output completely and publishes it, content-addressed and without overwrite, into the private
 * canonical store `<workspace>/.local-media/canonical-v0/`.
 *
 * - DIRECT and REFUSE create nothing: no store, copy, transcode or remux.
 * - Probe-to-bytes binding. A pinned process never opens a path. Each child inherits its own fresh read-only handle, opened here,
 *   verified to be the anchor's file object (device and inode) and to hash to the exact expected bytes immediately before the spawn, and
 *   re-hashed after exit; a probe or digest of changed bytes is never evidence. One handle is never given to two children, because they
 *   would share its file pointer. The source anchor stays open for the whole operation and is re-verified before publication and again
 *   before anything is returned.
 * - The runtime is only the owner-pinned build in the approved tool root, re-verified by full SHA-256 immediately before every spawn: no
 *   PATH, no shell, a minimal environment, an fd-only protocol whitelist, and an argv of fixed tokens (the recipe is the accepted template
 *   with only its descriptor and byte-bound placeholders filled). The approved tool root is every child's working directory; no argument
 *   names a file, so nothing is ever written there.
 * - Publication: an exclusive pending object, completely verified, sealed read-only, then hard-linked to its content name. An occupied
 *   name is trusted only after it re-reads, re-hashes and re-probes as exactly the verified bytes; it is never overwritten or repaired.
 * - The computation record (packages/edit-render/owner-media.ts) maps a computation to its verified output and names no scope. A cache hit
 *   never re-runs the recipe and repeats every verification before any trust. Cache identity is never authorization: each caller's
 *   derivation and derived authorization are built only from its own root authorization and consent.
 * No message carries a location, and raw process output is never persisted.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { link, lstat, mkdir, open, realpath, unlink, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, parse as parsePath, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { MAX_PROBE_OUTPUT_BYTES, PINNED_MEDIA_RUNTIME, parseProbeJson, type ProbeReport } from "../packages/edit-render/index.js";
import { CANONICAL_COMPUTATION_RECORD_IDENTITY, CANONICAL_STORE, canonicalComputationRecordName, canonicalComputationRecordOf, canonicalObjectName }
  from "../packages/edit-render/owner-media.js";
import { checkIdentity } from "../packages/editorial/common.js";
import { MAX_STAGED_SOURCE_BYTES, type RuntimeClock } from "../packages/edit-runtime/index.js";
import { FootageAuthorizationRootSchema, FootageAuthorizationSchema, type FootageAuthorization, type FootageAuthorizationDerived }
  from "../packages/footage-analyzer/protocol.js";
import { CANONICAL_TOOLCHAIN, MediaIngestError, N1_ARGV_TEMPLATE, N1_RECIPE, buildCanonicalDerivedAuthorization, buildCanonicalMediaDerivation, canonicalComputationIdOf,
  classifyCanonicalIngest, type CanonicalClassification, type CanonicalMediaDerivation } from "../packages/media-ingest/index.js";

export const CANONICAL_INGEST_ERROR_CODES = ["request_invalid", "authorization_invalid", "canonicalization_consent_required", "runtime_config_invalid",
  "runtime_binary_missing", "runtime_binary_mismatch", "source_location_invalid", "source_mismatch", "source_changed", "store_location_invalid", "store_unavailable",
  "process_failed", "process_timeout", "probe_invalid", "digest_invalid", "output_invalid", "verification_failed", "cache_corrupt", "publication_conflict",
  "unexpected_failure"] as const;
export type CanonicalIngestErrorCode = (typeof CANONICAL_INGEST_ERROR_CODES)[number];
/** Every refusal of this adapter carries one owned code; no message carries a location. */
export class CanonicalIngestError extends Error {
  constructor(public readonly code: CanonicalIngestErrorCode, message: string) { super(message); this.name = "CanonicalIngestError"; }
}
function fail(code: CanonicalIngestErrorCode, message: string): never { throw new CanonicalIngestError(code, message); }

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The approved tool root: the verified distribution directory, and nothing else. */
const APPROVED_TOOL_ROOT = resolve(PROJECT_ROOT, ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build");
const BINARY = { ffmpeg: join("bin", "ffmpeg.exe"), ffprobe: join("bin", "ffprobe.exe") } as const;
const WINDOWS = sep === "\\", TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, SHA256 = /^[a-f0-9]{64}$/;
const MAX_LOCATION_LENGTH = 1024, MAX_WORKSPACE_PATH_LENGTH = 160;
/** Hard bounds; the owner may only lower the recipe's time and output-byte bounds. */
const HARD = { probeTimeoutMilliseconds: 600_000, digestTimeoutMilliseconds: 1_800_000, canonicalizationTimeoutMilliseconds: 1_800_000,
  terminationGraceMilliseconds: 10_000, maxListingBytes: 16 * 1024 * 1024, maxRecipeStdoutBytes: 65_536 } as const;
const PURPOSES = ["local_footage_analysis", "local_evaluation"] as const;

// ---------------------------------------------------------------- the fixed pinned queries (the v0 verification methods)
const PROBE_ENTRIES = "stream=index,codec_type,codec_name,width,height,sample_aspect_ratio,pix_fmt,r_frame_rate,avg_frame_rate,time_base,start_pts,duration_ts,"
  + "sample_rate,channels,channel_layout,field_order,color_transfer,color_primaries:stream_side_data=side_data_type,rotation:format=format_name,duration,size,nb_streams"
  + ":frame=stream_index,pts,nb_samples:frame_side_data=side_data_type";
const FD_INPUT = ["-protocol_whitelist", "fd", "-f", "mov", "-fd", "3", "-i", "fd:"] as const;
const LISTING_TAIL = ["-f", "framemd5", "-fflags", "+bitexact", "-protocol_whitelist", "fd", "-fd", "1", "fd:"] as const;
/**
 * The pinned queries every measurement uses, as data. `decodedVideo` realizes `pinned_runtime_decoded_frame_md5_v0` and `audioPackets`
 * realizes `pinned_runtime_audio_packet_md5_v0` (see canonicalListingDigest). Any change to them is a new method version.
 */
export const CANONICAL_INGEST_QUERIES = {
  probe: ["-hide_banner", "-loglevel", "error", "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3", "-show_entries", PROBE_ENTRIES, "-of", "json=compact=1", "-i", "fd:"],
  decodedVideo: ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-threads", "1", ...FD_INPUT, "-map", "0:v:0", "-fps_mode", "passthrough", "-enc_time_base:v",
    "demux", ...LISTING_TAIL],
  audioPackets: ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-threads", "1", ...FD_INPUT, "-map", "0:a:0", "-c", "copy", ...LISTING_TAIL],
} as const;
const FACT_KEYS = ["field_order", "color_transfer", "color_primaries"];

// ---------------------------------------------------------------- the v0 listing digests
const LISTING_HEAD = ["#format: frame checksums", "#version: 2", "#hash: MD5"], COLUMNS = "#stream#, dts,        pts, duration,     size, hash";
const MD5 = /^[0-9a-f]{32}$/, INTEGER = /^-?\d{1,19}$/, COUNT = /^\d{1,10}$/;
interface Listing { digest: string; sar: string | null }
function parseListing(text: unknown, kind: "video" | "audio"): Listing {
  const bad = (why: string): never => fail("digest_invalid", `The pinned ${kind} listing is malformed: ${why}.`);
  if (typeof text !== "string" || text.length === 0 || text.length > HARD.maxListingBytes || text.includes("\r") || !text.endsWith("\n")) bad("not a bounded LF listing");
  const lines = (text as string).slice(0, -1).split("\n");
  let at = 0;
  const next = (): string => lines[at++] ?? bad("truncated header");
  for (const expected of LISTING_HEAD) if (next() !== expected) bad("unexpected format header");
  let extradata: string[] | null = null;
  if (kind === "audio" && lines[at]?.startsWith("#extradata ")) {
    const m = /^#extradata 0, +(\d{1,9}), ([0-9a-f]{32})$/.exec(next()) ?? bad("extradata line");
    extradata = [m[1]!, m[2]!];
  }
  const tb = /^#tb 0: (\d{1,10})\/(\d{1,10})$/.exec(next()) ?? bad("time base line");
  if (next() !== `#media_type 0: ${kind}`) bad("media type line");
  const codec = /^#codec_id 0: ([a-z0-9_]{1,40})$/.exec(next()) ?? bad("codec line");
  if (kind === "video" && codec[1] !== "rawvideo") bad("decoded frames are listed as rawvideo");
  let stream: Record<string, string>, sar: string | null = null;
  if (kind === "video") {
    const dimensions = /^#dimensions 0: (\d{1,5}x\d{1,5})$/.exec(next()) ?? bad("dimensions line");
    const ratio = /^#sar 0: (\d{1,6}\/\d{1,6})$/.exec(next()) ?? bad("sample aspect line");
    stream = { dimensions: dimensions[1]! }; sar = ratio[1]!;
  } else {
    const rate = /^#sample_rate 0: (\d{1,7})$/.exec(next()) ?? bad("sample rate line");
    const layout = /^#channel_layout_name 0: ([a-z0-9_.()+ ]{1,60})$/.exec(next()) ?? bad("channel layout line");
    stream = { sampleRate: rate[1]!, channelLayout: layout[1]! };
  }
  if (next() !== COLUMNS) bad("column line");
  const rows: string[][] = [];
  for (; at < lines.length; at += 1) {
    const fields = lines[at]!.split(",").map(field => field.trim());
    if (fields.length < 6 || fields[0] !== "0" || !fields.slice(1, 4).every(f => INTEGER.test(f)) || !COUNT.test(fields[4]!) || !MD5.test(fields[5]!)) bad("row");
    if (fields.length > 6) {
      const side = /^S=(\d{1,2})$/.exec(fields[6]!) ?? bad("side data marker");
      const count = Number(side[1]);
      if (fields.length !== 7 + 2 * count) bad("side data count");
      for (let k = 7; k < fields.length; k += 2) if (!COUNT.test(fields[k]!) || !MD5.test(fields[k + 1]!)) bad("side data entry");
    }
    rows.push(fields);
  }
  if (rows.length === 0) bad("no rows");
  const method = kind === "video" ? "pinned_runtime_decoded_frame_md5_v0" : "pinned_runtime_audio_packet_md5_v0";
  // Every header field and every row is bound, except the decoded stream's one `#sar` line: declaring square pixels is N1's intended change,
  // and it is verified separately. Payloads alone never pass: every row also carries its exact dts, pts and duration in the stated time base.
  const digest = createHash("sha256").update(canonicalSerialize({ method, extradata, timeBase: `${tb[1]}/${tb[2]}`, codec: codec[1], ...stream, rows })).digest("hex");
  return { digest, sar };
}
/** The v0 digest of one pinned framemd5 listing; any malformed or unexpected line refuses. Exported for its method tests. */
export function canonicalListingDigest(text: string, kind: "video" | "audio"): string { return parseListing(text, kind).digest; }

// ---------------------------------------------------------------- locations
/** A local absolute location: never a URL, UNC or device path, relative or drive-relative path, traversal segment, pattern or NUL. */
function localLocation(value: unknown, code: CanonicalIngestErrorCode): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LOCATION_LENGTH || value.includes("\0")) fail(code, "A bounded local location is required.");
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) || /^file:/i.test(value)) fail(code, "A URL is never a local location.");
  if (value.startsWith("\\\\") || value.startsWith("//")) fail(code, "Network, UNC and device-namespace paths are never local locations.");
  if (WINDOWS ? !/^[A-Za-z]:[\\/]/.test(value) : !value.startsWith("/")) fail(code, "Only an absolute local path is accepted.");
  if (value.split(/[\\/]+/).includes("..") || /[*?]/.test(value)) fail(code, "Traversal segments and patterns are refused.");
  return resolve(value);
}
const key = (path: string) => (WINDOWS ? path.toLowerCase() : path);
const samePath = (a: string, b: string) => key(a) === key(b);
function inside(parent: string, child: string): boolean {
  const path = relative(key(parent), key(child));
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
/** Refuses a link (or junction) at the location or any of its parents, and a location that does not exist. */
async function assertNoLinks(location: string, code: CanonicalIngestErrorCode): Promise<void> {
  let current = location;
  const top = parsePath(current).root;
  while (current !== top) {
    let info;
    try { info = await lstat(current); } catch { fail(code, "A location does not exist."); }
    if (info.isSymbolicLink()) fail(code, "A link is never part of a location.");
    current = dirname(current);
  }
}
/** An existing real location that resolves exactly where it was declared. */
async function exactLocation(value: unknown, code: CanonicalIngestErrorCode): Promise<string> {
  const requested = localLocation(value, code);
  await assertNoLinks(requested, code);
  let real: string;
  try { real = await realpath(requested); } catch { fail(code, "A location does not resolve."); }
  if (!samePath(real, requested)) fail(code, "A location resolves elsewhere than declared.");
  return real;
}

// ---------------------------------------------------------------- held handles: one anchor per object, one fresh verified reader per child
interface Anchor { path: string; handle: FileHandle; dev: bigint; ino: bigint; sizeBytes: number; contentHash: string }
async function hashHandle(handle: FileHandle, sizeBytes: number): Promise<string> {
  const hash = createHash("sha256"), buffer = Buffer.alloc(1_048_576);
  let position = 0;
  while (position < sizeBytes) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, sizeBytes - position), position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
  }
  return position === sizeBytes ? hash.digest("hex") : "";
}
/** Opens exactly the regular file lstat found (no link, no replacement in between) and hashes it through that handle. */
async function openAnchor(path: string, code: CanonicalIngestErrorCode, limit: number): Promise<Anchor> {
  let info;
  try { info = await lstat(path, { bigint: true }); } catch { fail(code, "The expected file does not exist."); }
  if (info.isSymbolicLink() || !info.isFile() || info.size === 0n || info.size > BigInt(limit)) fail(code, "Only a non-empty, bounded regular file, never a link, is accepted.");
  let handle: FileHandle;
  try { handle = await open(path, "r"); } catch { fail(code, "The expected file could not be opened."); }
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) fail(code, "Another file took the verified name.");
    const sizeBytes = Number(opened.size), contentHash = await hashHandle(handle, sizeBytes);
    if (contentHash === "") fail(code, "The file could not be read whole.");
    return { path, handle, dev: opened.dev, ino: opened.ino, sizeBytes, contentHash };
  } catch (error) { await handle.close().catch(() => undefined); throw error; }
}
/** A fresh read-only handle on the anchor's very file object, holding exactly its verified bytes; `code` names any difference. */
async function reader(anchor: Anchor, code: CanonicalIngestErrorCode): Promise<FileHandle> {
  let info;
  try { info = await lstat(anchor.path, { bigint: true }); } catch { fail(code, "A verified file disappeared."); }
  if (info.isSymbolicLink() || !info.isFile() || info.dev !== anchor.dev || info.ino !== anchor.ino) fail(code, "Another file took a verified file's name.");
  let handle: FileHandle;
  try { handle = await open(anchor.path, "r"); } catch { fail(code, "A verified file could not be reopened."); }
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== anchor.dev || opened.ino !== anchor.ino || Number(opened.size) !== anchor.sizeBytes || await hashHandle(handle, anchor.sizeBytes) !== anchor.contentHash) {
      fail(code, "A verified file's bytes changed.");
    }
    return handle;
  } catch (error) { await handle.close().catch(() => undefined); throw error; }
}
/** The anchor and its name still hold exactly the verified object and bytes. */
async function reconfirm(anchor: Anchor, code: CanonicalIngestErrorCode): Promise<void> {
  let info;
  try { info = await lstat(anchor.path, { bigint: true }); } catch { fail(code, "A verified file disappeared."); }
  if (info.isSymbolicLink() || !info.isFile() || info.dev !== anchor.dev || info.ino !== anchor.ino || await hashHandle(anchor.handle, anchor.sizeBytes) !== anchor.contentHash) {
    fail(code, "A verified file changed.");
  }
}

// ---------------------------------------------------------------- the pinned runtime: approved root, regular files, exact digests
interface VerifiedBinary { path: string; sha256: string }
async function approvedRoot(toolRoot: unknown): Promise<string> {
  const requested = localLocation(toolRoot, "runtime_config_invalid");
  let real: string, approved: string;
  try { real = await realpath(requested); approved = await realpath(APPROVED_TOOL_ROOT); } catch { fail("runtime_config_invalid", "The tool root is not the approved pinned distribution."); }
  if (real !== approved) fail("runtime_config_invalid", "Only the approved pinned distribution directory is a tool root.");
  const info = await lstat(real);
  if (info.isSymbolicLink() || !info.isDirectory()) fail("runtime_config_invalid", "The tool root must be a real directory.");
  return real;
}
/** The owner-pinned digest and size, re-verified in full through one handle; any other build is refused before it runs. */
async function pinned(root: string, which: "ffmpeg" | "ffprobe"): Promise<VerifiedBinary> {
  const path = join(root, BINARY[which]);
  let real: string;
  try { real = await realpath(path); } catch { fail("runtime_binary_missing", `The pinned ${which} is missing from the approved tool root.`); }
  if (!inside(root, real) || samePath(root, real)) fail("runtime_config_invalid", `The pinned ${which} resolves outside the approved tool root.`);
  const anchor = await openAnchor(real, "runtime_binary_missing", 1024 * 1024 * 1024);
  try {
    const expected = PINNED_MEDIA_RUNTIME[which];
    if (anchor.contentHash !== expected.sha256 || anchor.sizeBytes !== expected.sizeBytes) fail("runtime_binary_mismatch", `The ${which} binary is not the owner-pinned build.`);
    return { path: real, sha256: anchor.contentHash };
  } finally { await anchor.handle.close(); }
}

// ---------------------------------------------------------------- the only spawn: exact binary, argv array, no shell, bounded capture
export interface CanonicalProcessRun { spawnError: string | null; errorAfterSpawn: string | null; exitCode: number | null; signal: string | null; timedOut: boolean;
  terminationConfirmed: boolean; stdout: Buffer; stdoutOverflow: boolean }
type ProcessRun = CanonicalProcessRun;
/** What supervision needs of an already-spawned pinned child: its output streams, a termination request and its completion events. */
export interface CanonicalChild {
  stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  kill(): boolean;
  on(event: "spawn", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}
/**
 * Supervises one already-spawned pinned child (the accepted Batch-2B rule; it starts nothing itself): only its spawn event proves it
 * started; an error after spawn proves nothing about termination; termination is requested once, at the timeout or on an error after
 * spawn, and only an observed close confirms it within the bounded grace.
 */
export function superviseCanonicalChild(child: CanonicalChild, limits: { timeoutMilliseconds: number; stdoutLimit: number; terminationGraceMilliseconds: number }):
  Promise<CanonicalProcessRun> {
  const { timeoutMilliseconds, stdoutLimit, terminationGraceMilliseconds } = limits;
  return new Promise(done => {
    const out: Buffer[] = [];
    let outBytes = 0, stdoutOverflow = false, timedOut = false, settled = false, spawned = false, terminationRequested = false, errorAfterSpawn: string | null = null;
    const finish = (run: Pick<ProcessRun, "spawnError" | "exitCode" | "signal" | "terminationConfirmed">) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      done({ ...run, errorAfterSpawn, timedOut, stdout: Buffer.concat(out), stdoutOverflow });
    };
    const terminate = () => {
      if (terminationRequested) return;
      terminationRequested = true; clearTimeout(timer);
      setTimeout(() => finish({ spawnError: null, exitCode: null, signal: null, terminationConfirmed: false }), terminationGraceMilliseconds).unref();
      child.kill();
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMilliseconds);
    child.stdout?.on("data", (chunk: Buffer) => { outBytes += chunk.length; if (outBytes > stdoutLimit) { stdoutOverflow = true; return; } out.push(chunk); });
    // Diagnostics are drained and discarded: they are never evidence and never persisted.
    child.stderr?.on("data", () => undefined);
    child.on("spawn", () => { spawned = true; });
    child.on("error", error => {
      const code = (error as { code?: string }).code;
      if (!spawned) { finish({ spawnError: code ?? "spawn_error", exitCode: null, signal: null, terminationConfirmed: true }); return; }
      if (errorAfterSpawn === null) errorAfterSpawn = code ?? "child_process_error";
      terminate();
    });
    child.on("close", (code, signal) => finish({ spawnError: null, exitCode: code, signal, terminationConfirmed: true }));
  });
}
function minimalEnvironment(): Record<string, string> {
  const root = process.env["SystemRoot"];
  return root === undefined ? {} : { SystemRoot: root };
}
const supervise = (child: CanonicalChild, timeoutMilliseconds: number, stdoutLimit: number) =>
  superviseCanonicalChild(child, { timeoutMilliseconds, stdoutLimit, terminationGraceMilliseconds: HARD.terminationGraceMilliseconds });
/**
 * Null only for a run that may become evidence: started, no error, closed by itself with exit 0 and no signal inside its bound, its close
 * observed and its output bounded. A timed-out run is a timeout whatever else it reported; every other incomplete run is a failure.
 */
export function canonicalRunFailure(run: CanonicalProcessRun): "process_timeout" | "process_failed" | null {
  if (run.timedOut) return "process_timeout";
  return run.spawnError === null && run.errorAfterSpawn === null && run.exitCode === 0 && run.signal === null && run.terminationConfirmed && !run.stdoutOverflow
    ? null : "process_failed";
}
function requireCompleted(run: ProcessRun, what: string): void {
  const failure = canonicalRunFailure(run);
  if (failure === "process_timeout") fail(failure, `The pinned ${what} exceeded its time bound and was stopped.`);
  if (failure !== null) fail(failure, `The pinned ${what} did not complete.`);
}

// ---------------------------------------------------------------- one operation's private context
export type PinnedRole = "source_probe" | "source_video_digest" | "source_audio_digest" | "canonicalize" | "output_probe" | "output_video_digest" | "output_audio_digest"
  | "published_probe";
export interface CanonicalIngestInstrumentation {
  /** Test-only: called after a pinned process's input handle is verified, immediately before it is spawned. It grants nothing. */
  beforeProcess?: (context: { role: PinnedRole }) => Promise<void>;
  /** Test-only: called after the pending output is verified and sealed, immediately before no-overwrite publication. It grants nothing. */
  beforePublication?: () => Promise<void>;
}
interface Context { toolRoot: string; hooks: CanonicalIngestInstrumentation }
async function hook(run: (() => Promise<void>) | undefined): Promise<void> {
  if (run === undefined) return;
  try { await run(); } catch { fail("request_invalid", "The test instrumentation failed."); }
}
/** One pinned process over exactly one fresh verified handle of `subject`; the subject's bytes are checked again before the run is read. */
async function runOver(ctx: Context, subject: Anchor, changed: CanonicalIngestErrorCode, role: PinnedRole, which: "ffmpeg" | "ffprobe", argv: readonly string[],
  timeoutMilliseconds: number, stdoutLimit: number): Promise<ProcessRun> {
  const handle = await reader(subject, changed);
  try {
    const binary = await pinned(ctx.toolRoot, which);
    await hook(ctx.hooks.beforeProcess === undefined ? undefined : () => ctx.hooks.beforeProcess!({ role }));
    const child = spawn(binary.path, [...argv], { shell: false, windowsHide: true, cwd: ctx.toolRoot, env: minimalEnvironment(), stdio: ["ignore", "pipe", "pipe", handle.fd] });
    const run = await supervise(child, timeoutMilliseconds, stdoutLimit);
    // A measurement of changed bytes is never evidence, whatever the process reported.
    if (await hashHandle(handle, subject.sizeBytes) !== subject.contentHash) fail(changed, "Measured bytes changed while a pinned process read them.");
    return run;
  } finally { await handle.close().catch(() => undefined); }
}

// ---------------------------------------------------------------- measurements of exact bytes
interface Probed { text: string; rawDigest: string; probe: unknown; facts: unknown }
function splitProbe(text: string): Probed | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !Array.isArray((raw as { streams?: unknown }).streams)) return null;
  const streams = (raw as { streams: unknown[] }).streams;
  if (!streams.every(s => s !== null && typeof s === "object" && !Array.isArray(s))) return null;
  const video = streams.find(s => (s as { codec_type?: unknown }).codec_type === "video") as Record<string, unknown> | undefined;
  const label = (value: unknown) => (typeof value === "string" ? value : null);
  const facts = { fieldOrder: label(video?.field_order) ?? "unknown", colorTransfer: label(video?.color_transfer), colorPrimaries: label(video?.color_primaries) };
  const probe = { ...(raw as Record<string, unknown>), streams: streams.map(s => Object.fromEntries(Object.entries(s as Record<string, unknown>).filter(([k]) => !FACT_KEYS.includes(k)))) };
  return { text, rawDigest: createHash("sha256").update(text).digest("hex"), probe, facts };
}
/** The pinned probe of exactly `subject`'s bytes, or null when the process completed with a non-zero exit (the bytes are not a readable source). */
async function probeOf(ctx: Context, subject: Anchor, codes: { changed: CanonicalIngestErrorCode; invalid: CanonicalIngestErrorCode }, role: PinnedRole): Promise<Probed | null> {
  const run = await runOver(ctx, subject, codes.changed, role, "ffprobe", CANONICAL_INGEST_QUERIES.probe, HARD.probeTimeoutMilliseconds, MAX_PROBE_OUTPUT_BYTES);
  if (run.timedOut) fail("process_timeout", "The pinned probe exceeded its time bound.");
  if (run.spawnError !== null || run.errorAfterSpawn !== null || run.signal !== null || !run.terminationConfirmed) fail("process_failed", "The pinned probe did not complete.");
  if (run.exitCode !== 0 || run.stdoutOverflow) return null;
  const probed = splitProbe(run.stdout.toString("utf8"));
  if (probed === null) fail(codes.invalid, "The pinned probe's report is not JSON in the expected shape.");
  return probed;
}
async function listingOf(ctx: Context, subject: Anchor, changed: CanonicalIngestErrorCode, role: PinnedRole, kind: "video" | "audio"): Promise<Listing> {
  const run = await runOver(ctx, subject, changed, role, "ffmpeg", kind === "video" ? CANONICAL_INGEST_QUERIES.decodedVideo : CANONICAL_INGEST_QUERIES.audioPackets,
    HARD.digestTimeoutMilliseconds, HARD.maxListingBytes);
  if (run.stdoutOverflow) fail("digest_invalid", `The pinned ${kind} listing exceeds its bound.`);
  requireCompleted(run, `${kind} listing`);
  return parseListing(run.stdout.toString("utf8"), kind);
}
interface Measured { anchor: { contentHash: string; sizeBytes: number }; probed: Probed; report: ProbeReport; classification: CanonicalClassification; video: Listing;
  audio: Listing | null }
function reportOf(probed: Probed, code: CanonicalIngestErrorCode): ProbeReport {
  try { return parseProbeJson(canonicalSerialize(probed.probe)); } catch { fail(code, "The probe is not in the renderer's strict vocabulary."); }
}
async function measure(ctx: Context, subject: Anchor, probed: Probed, classification: CanonicalClassification, roles: { video: PinnedRole; audio: PinnedRole },
  codes: { changed: CanonicalIngestErrorCode; invalid: CanonicalIngestErrorCode }): Promise<Measured> {
  const report = reportOf(probed, codes.invalid);
  const video = await listingOf(ctx, subject, codes.changed, roles.video, "video");
  const audio = report.streams.some(s => s.codec_type === "audio") ? await listingOf(ctx, subject, codes.changed, roles.audio, "audio") : null;
  return { anchor: { contentHash: subject.contentHash, sizeBytes: subject.sizeBytes }, probed, report, classification, video, audio };
}

// ---------------------------------------------------------------- the Stage-1C invariants: exact equivalence of an N1 output with its source
const gcd = (a: bigint, b: bigint): bigint => { let x = a < 0n ? -a : a, y = b < 0n ? -b : b; while (y !== 0n) [x, y] = [y, x % y]; return x; };
function exact(count: bigint | number, timeBase: string | undefined): string | null {
  if (timeBase === undefined || !/^\d{1,10}\/\d{1,10}$/.test(timeBase)) return null;
  const [n, d] = timeBase.split("/").map(v => BigInt(v)) as [bigint, bigint];
  if (d === 0n) return null;
  const value = BigInt(count) * n, g = gcd(value, d) || 1n;
  return `${value / g}/${d / g}`;
}
function timingOf(report: ProbeReport, kind: "video" | "audio") {
  const stream = report.streams.find(s => s.codec_type === kind);
  if (stream === undefined) return null;
  const frames = (report.frames ?? []).filter(f => f.stream_index === stream.index);
  return { timeBase: stream.time_base ?? null, startPts: stream.start_pts ?? null, duration: stream.duration_ts === undefined ? null : exact(stream.duration_ts, stream.time_base),
    instants: frames.map(f => exact(f.pts, stream.time_base)), samples: frames.map(f => f.nb_samples ?? null) };
}
/**
 * Every Stage-1C invariant of an N1 output against its source, each named when it fails. buildCanonicalMediaDerivation then re-checks the
 * classified facts, the decoded-frame digests and the audio-packet digests.
 */
function verifyEquivalent(source: Measured, output: Measured, code: CanonicalIngestErrorCode): void {
  const invariant = (holds: boolean, name: string) => { if (!holds) fail(code, `The canonical output fails the invariant ${name}.`); };
  const sv = source.report.streams.find(s => s.codec_type === "video"), ov = output.report.streams.find(s => s.codec_type === "video");
  const sa = source.report.streams.find(s => s.codec_type === "audio"), oa = output.report.streams.find(s => s.codec_type === "audio");
  const same = (a: unknown, b: unknown) => canonicalSerialize(a) === canonicalSerialize(b);
  invariant(output.anchor.contentHash !== source.anchor.contentHash, "output_bytes_differ_from_source");
  invariant(source.classification.outcome === "NORMALIZE_N1" && sv !== undefined && sv.sample_aspect_ratio === undefined && source.video.sar === "0/1", "source_sample_aspect_unspecified");
  invariant(ov !== undefined && ov.sample_aspect_ratio === "1:1" && output.video.sar === "1/1", "output_sample_aspect_ratio_square");
  invariant(output.classification.outcome === "DIRECT", "output_classifies_direct");
  invariant(sv?.codec_name === "h264" && ov?.codec_name === "h264", "codec_h264_unchanged");
  invariant(sv?.pix_fmt === "yuv420p" && ov?.pix_fmt === "yuv420p", "pixel_format_yuv420p_unchanged");
  invariant(sv?.width === ov?.width && sv?.height === ov?.height && sv?.r_frame_rate === ov?.r_frame_rate && sv?.avg_frame_rate === ov?.avg_frame_rate, "geometry_and_rate_unchanged");
  invariant(same(source.report.streams.map(s => s.codec_type), output.report.streams.map(s => s.codec_type)), "stream_layout_unchanged");
  invariant(same(source.probed.facts, output.probed.facts), "field_order_and_colour_unchanged");
  const [st, ot] = [timingOf(source.report, "video"), timingOf(output.report, "video")];
  invariant(st !== null && ot !== null && st.instants.length === ot.instants.length, "frame_count_unchanged");
  invariant(st !== null && st.instants.every(i => i !== null) && same(st?.instants, ot?.instants) && st?.timeBase === ot?.timeBase && st?.startPts === ot?.startPts,
    "exact_frame_instants_unchanged");
  invariant(source.classification.outcome !== "REFUSE" && output.classification.outcome !== "REFUSE"
    && source.classification.video.frameTableId === output.classification.video.frameTableId, "frame_table_unchanged");
  invariant(source.video.digest === output.video.digest, "decoded_frames_unchanged");
  invariant(st?.duration !== null && st?.duration === ot?.duration && source.report.format.duration === output.report.format.duration, "duration_unchanged");
  // N1 sources carry no video side data, so the output must carry none; any other stream's or frame's side data must be exactly the source's.
  const sideData = (report: ProbeReport) => report.streams.map(s => ({ stream: s.side_data_list ?? [],
    frames: (report.frames ?? []).filter(f => f.stream_index === s.index).map(f => f.side_data_list ?? []) }));
  const videoFrames = (report: ProbeReport, index: number | undefined) => (report.frames ?? []).filter(f => f.stream_index === index);
  invariant((ov?.side_data_list ?? []).length === 0 && videoFrames(output.report, ov?.index).every(f => (f.side_data_list ?? []).length === 0)
    && same(sideData(source.report), sideData(output.report)), "no_side_data_introduced");
  if (sa === undefined) { invariant(oa === undefined && output.audio === null && source.audio === null, "audio_absent_unchanged"); return; }
  const [at, aot] = [timingOf(source.report, "audio"), timingOf(output.report, "audio")];
  invariant(oa !== undefined && sa.codec_name === oa.codec_name, "audio_codec_unchanged");
  invariant(oa !== undefined && sa.channel_layout === oa.channel_layout && sa.channels === oa.channels && sa.sample_rate === oa.sample_rate, "audio_layout_and_rate_unchanged");
  invariant(source.audio !== null && output.audio !== null && source.audio.digest === output.audio.digest, "audio_packets_payload_and_timing_unchanged");
  invariant(at !== null && at.instants.every(i => i !== null) && same(at, aot), "audio_exact_timing_and_samples_unchanged");
  const total = (t: typeof at) => (t?.samples ?? []).reduce((n: number, s) => n + (s ?? 0), 0);
  invariant(total(at) > 0 && total(at) === total(aot), "audio_total_samples_unchanged");
  invariant(st?.startPts === ot?.startPts && at?.startPts === aot?.startPts && st?.timeBase === ot?.timeBase && at?.timeBase === aot?.timeBase, "audio_video_relationship_unchanged");
}

// ---------------------------------------------------------------- the private canonical store
interface Store { objects: string; computations: string; pending: string }
async function ownedDirectory(parent: string, name: string): Promise<string> {
  const path = join(parent, name);
  try { await mkdir(path); } catch (error) { if ((error as { code?: string }).code !== "EEXIST") fail("store_unavailable", "A store directory could not be created."); }
  let info;
  try { info = await lstat(path); } catch { fail("store_unavailable", "A store directory could not be inspected."); }
  if (info.isSymbolicLink() || !info.isDirectory()) fail("store_location_invalid", "A store directory is not a real directory.");
  let real: string;
  try { real = await realpath(path); } catch { fail("store_location_invalid", "A store directory does not resolve."); }
  if (!samePath(real, path)) fail("store_location_invalid", "A store directory resolves outside its place.");
  return path;
}
/** The fixed store layout under one explicit local workspace, never in the directory that holds the source, never holding the source. */
async function openStore(workspaceRoot: unknown, sourcePath: string): Promise<Store> {
  const workspace = await exactLocation(workspaceRoot, "store_location_invalid");
  let info;
  try { info = await lstat(workspace); } catch { fail("store_location_invalid", "The workspace does not exist."); }
  if (!info.isDirectory()) fail("store_location_invalid", "The workspace is a directory.");
  if (workspace.length > MAX_WORKSPACE_PATH_LENGTH) fail("store_location_invalid", "The workspace path is too long for the bounded store layout.");
  const storeRoot = join(workspace, ...CANONICAL_STORE.directory);
  if (inside(dirname(sourcePath), storeRoot) || inside(storeRoot, sourcePath)) {
    fail("store_location_invalid", "The canonical store never lives in the directory that holds a source, and never holds a source.");
  }
  let current = workspace;
  for (const name of CANONICAL_STORE.directory) current = await ownedDirectory(current, name);
  return { objects: await ownedDirectory(current, CANONICAL_STORE.objects), computations: await ownedDirectory(current, CANONICAL_STORE.computations),
    pending: await ownedDirectory(current, CANONICAL_STORE.pending) };
}
interface StoredRecord { bytes: string; outputHash: string; outputSize: number }
/** The computation's record exactly as published, or undefined when absent; anything else is a corrupt cache. */
async function readRecord(store: Store, computationId: string): Promise<StoredRecord | undefined> {
  const path = join(store.computations, canonicalComputationRecordName(computationId));
  try { await lstat(path); } catch (error) { if ((error as { code?: string }).code === "ENOENT") return undefined; fail("store_unavailable", "A computation record could not be read."); }
  const anchor = await openAnchor(path, "cache_corrupt", CANONICAL_STORE.maxRecordBytes);
  try {
    const bytes = Buffer.alloc(anchor.sizeBytes);
    const { bytesRead } = await anchor.handle.read(bytes, 0, anchor.sizeBytes, 0);
    if (bytesRead !== anchor.sizeBytes) fail("cache_corrupt", "A computation record could not be read whole.");
    let text: string, value: unknown;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); value = JSON.parse(text); } catch { fail("cache_corrupt", "A computation record is not JSON."); }
    if (`${canonicalSerialize(value)}\n` !== text) fail("cache_corrupt", "A computation record is not stored exactly as published.");
    const record = value as { artifactType?: unknown; computationId?: unknown; output?: { contentHash?: unknown; sizeBytes?: unknown } };
    if (record.artifactType !== "CanonicalComputationRecord" || record.computationId !== computationId || !checkIdentity(record, "recordId", CANONICAL_COMPUTATION_RECORD_IDENTITY)
      || typeof record.output?.contentHash !== "string" || !SHA256.test(record.output.contentHash) || !Number.isSafeInteger(record.output.sizeBytes)
      || (record.output.sizeBytes as number) <= 0) fail("cache_corrupt", "A computation record is not this computation's identified record.");
    return { bytes: text, outputHash: record.output.contentHash, outputSize: record.output.sizeBytes as number };
  } finally { await anchor.handle.close(); }
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as { code?: string }).code === "ENOENT") return false; fail("store_unavailable", "A store name could not be read."); }
}
/** No-overwrite publication of complete, synced bytes; an existing record must hold exactly these bytes. */
async function publishRecord(store: Store, name: string, bytes: string): Promise<void> {
  const pending = join(store.pending, `${randomBytes(16).toString("hex")}.pending`), final = join(store.computations, name);
  try {
    const handle = await open(pending, "wx");
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    try { await link(pending, final); return; } catch (error) { if ((error as { code?: string }).code !== "EEXIST") fail("store_unavailable", "No-overwrite publication is unavailable."); }
  } catch (error) { if (error instanceof CanonicalIngestError) throw error; fail("store_unavailable", "A computation record could not be written."); } finally {
    await unlink(pending).catch(() => undefined);
  }
  const existing = await openAnchor(final, "publication_conflict", CANONICAL_STORE.maxRecordBytes);
  try {
    if (existing.contentHash !== createHash("sha256").update(bytes).digest("hex")) {
      fail("publication_conflict", "The recorded result of this computation names other bytes: the computation is not reproducible or the store was altered.");
    }
  } finally { await existing.handle.close(); }
}

// ---------------------------------------------------------------- the request, read once
export interface CanonicalIngestRequest {
  /** The authorized source's absolute local path: execution-only, never part of an identity. */
  sourcePath: string;
  /** Its AuthorizedFootage record; NORMALIZE_N1 additionally needs a 1.1.0 root that carries the owner's canonicalization consent. */
  rootAuthorization: unknown;
  /** The approved pinned distribution directory. */
  toolRoot: string;
  /** The explicit local workspace that holds the private canonical store `.local-media/canonical-v0/`. */
  workspaceRoot: string;
  /** The trusted clock, read once: the instant of the derived authorization. */
  clock: RuntimeClock;
  /** Optional narrowing of the derived authorization's purposes to a subset of the root's. */
  allowedPurposes?: readonly string[];
  /** Owner bounds that may only lower the recipe's hard time and output-byte bounds. */
  limits?: { maxOutputBytes?: number; canonicalizationTimeoutMilliseconds?: number };
  instrumentation?: CanonicalIngestInstrumentation;
}
export interface SourceIdentity { assetId: string; contentHash: string; sizeBytes: number }
export interface CanonicalIngestEvidence { sourceProbeDigest: string; outputProbeDigest: string; decodedVideoDigest: string; audioPacketDigest: string | null;
  frameCount: number; frameTableId: string; exactTiming: "identical" }
export type CanonicalIngestResult =
  | { outcome: "DIRECT" | "REFUSE"; source: SourceIdentity; classification: CanonicalClassification }
  | { outcome: "NORMALIZE_N1"; source: SourceIdentity; classification: CanonicalClassification; computationId: string; derivation: CanonicalMediaDerivation;
    authorization: FootageAuthorizationDerived; output: SourceIdentity; publication: "published_by_this_operation" | "existing_object_reverified"; cache: "miss" | "hit";
    evidence: CanonicalIngestEvidence };
interface Read { sourcePath: unknown; authorization: FootageAuthorization; toolRoot: unknown; workspaceRoot: unknown; dateAdded: string;
  allowedPurposes: ("local_footage_analysis" | "local_evaluation")[] | undefined; maxOutputBytes: number | undefined; canonicalizationTimeout: number;
  hooks: CanonicalIngestInstrumentation }
function readRequest(input: unknown): Read {
  if (input === null || typeof input !== "object") fail("request_invalid", "A canonicalization request is required.");
  // Every caller-owned field is read exactly once, here, before any await.
  const r = input as Partial<Record<keyof CanonicalIngestRequest, unknown>>;
  const clock = r.clock as { now?: unknown } | null | undefined, now = clock === null || typeof clock !== "object" ? undefined : clock.now;
  if (clock === null || typeof clock !== "object" || typeof now !== "function") fail("request_invalid", "A trusted clock is required.");
  let dateAdded: unknown;
  try { dateAdded = (now as () => unknown).call(clock); } catch { fail("request_invalid", "The clock could not be read."); }
  if (typeof dateAdded !== "string" || !TIMESTAMP.test(dateAdded) || Number.isNaN(Date.parse(dateAdded))) fail("request_invalid", "The clock reports exact UTC milliseconds.");
  const parsed = FootageAuthorizationSchema.safeParse(r.rootAuthorization);
  if (!parsed.success) fail("authorization_invalid", "The source needs a valid AuthorizedFootage record.");
  const authorization = parsed.data;
  if (authorization.sourceType === "system_canonicalized") fail("authorization_invalid", "A canonical derivative is never canonicalized again: derivation depth is exactly one.");
  if (dateAdded < authorization.dateAdded) fail("request_invalid", "A derived record is never dated before its root.");
  let allowedPurposes: Read["allowedPurposes"];
  const purposes = r.allowedPurposes;
  if (purposes !== undefined) {
    // One private copy, validated as copied: the caller's array is never read again.
    const value: unknown[] | null = Array.isArray(purposes) ? [...purposes] : null;
    if (value === null || value.length === 0 || value.length > PURPOSES.length || new Set(value).size !== value.length
      || !value.every(p => (PURPOSES as readonly unknown[]).includes(p) && (authorization.allowedPurposes as readonly unknown[]).includes(p))) {
      fail("request_invalid", "Derived purposes are a subset of the root's analysis and evaluation purposes.");
    }
    allowedPurposes = value as Read["allowedPurposes"];
  }
  let maxOutputBytes: number | undefined, canonicalizationTimeout: number = HARD.canonicalizationTimeoutMilliseconds;
  const suppliedLimits = r.limits;
  if (suppliedLimits !== undefined) {
    const limits = (suppliedLimits !== null && typeof suppliedLimits === "object" && !Array.isArray(suppliedLimits) ? { ...suppliedLimits } : null) as Record<string, unknown> | null;
    if (limits === null || typeof limits !== "object" || Array.isArray(limits)
      || !Object.keys(limits).every(k => k === "maxOutputBytes" || k === "canonicalizationTimeoutMilliseconds")) fail("request_invalid", "Unknown owner bounds.");
    const lower = (value: unknown, hard: number) => {
      if (value === undefined) return undefined;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > hard) fail("request_invalid", "Owner bounds may only lower the hard bounds.");
      return value;
    };
    maxOutputBytes = lower(limits.maxOutputBytes, MAX_STAGED_SOURCE_BYTES);
    canonicalizationTimeout = lower(limits.canonicalizationTimeoutMilliseconds, HARD.canonicalizationTimeoutMilliseconds) ?? canonicalizationTimeout;
  }
  const instrumentation = r.instrumentation as CanonicalIngestInstrumentation | null | undefined;
  if (instrumentation !== undefined && (instrumentation === null || typeof instrumentation !== "object")) fail("request_invalid", "Instrumentation is an object of hooks.");
  const hooks: CanonicalIngestInstrumentation = {};
  for (const name of ["beforeProcess", "beforePublication"] as const) {
    const value = instrumentation?.[name];
    if (value !== undefined && typeof value !== "function") fail("request_invalid", "Instrumentation hooks are functions.");
    if (value !== undefined) Object.assign(hooks, { [name]: value });
  }
  return { sourcePath: r.sourcePath, authorization, toolRoot: r.toolRoot, workspaceRoot: r.workspaceRoot, dateAdded, allowedPurposes, maxOutputBytes,
    canonicalizationTimeout, hooks };
}

// ---------------------------------------------------------------- the operation
function n1Argv(maxOutputBytes: number): string[] {
  const fill: Record<string, string> = { "{input_fd}": "3", "{output_fd}": "4", "{max_output_bytes}": String(maxOutputBytes) };
  return N1_ARGV_TEMPLATE.map(token => (Object.hasOwn(fill, token) ? fill[token]! : token));
}
const classifyProbe = (probed: Probed | null) => classifyCanonicalIngest(probed === null ? { probe: null, facts: null } : { probe: probed.probe, facts: probed.facts });
/**
 * Classifies one authorized local source from a pinned probe of its exact verified bytes. DIRECT and REFUSE return at once and create
 * nothing. NORMALIZE_N1 runs the accepted recipe (or reuses an existing verified result of exactly this computation), verifies the output
 * completely against the source, publishes it without overwrite, and returns this root's derivation and derived authorization.
 */
export async function canonicalizeLocalMedia(input: CanonicalIngestRequest): Promise<CanonicalIngestResult> {
  const request = readRequest(input), root = request.authorization;
  const toolRoot = await approvedRoot(request.toolRoot);
  await pinned(toolRoot, "ffprobe"); await pinned(toolRoot, "ffmpeg");
  const ctx: Context = { toolRoot, hooks: request.hooks };
  const sourcePath = await exactLocation(request.sourcePath, "source_location_invalid");
  const source = await openAnchor(sourcePath, "source_location_invalid", MAX_STAGED_SOURCE_BYTES);
  const pendingPaths: string[] = [];
  let pendingHandle: FileHandle | null = null;
  try {
    if (source.contentHash !== root.contentHash || source.sizeBytes !== root.sizeBytes) fail("source_mismatch", "The source's bytes are not the authorized bytes.");
    const identity: SourceIdentity = { assetId: `asset_${source.contentHash}`, contentHash: source.contentHash, sizeBytes: source.sizeBytes };
    const sourceProbe = await probeOf(ctx, source, { changed: "source_changed", invalid: "probe_invalid" }, "source_probe");
    const classification = classifyProbe(sourceProbe);
    if (classification.outcome !== "NORMALIZE_N1") {
      await reconfirm(source, "source_changed");
      return { outcome: classification.outcome, source: identity, classification };
    }
    if (sourceProbe === null) fail("probe_invalid", "A classified source has a probe.");
    // Only a 1.1.0 root that carries the owner's explicit canonicalization consent is ever canonicalized.
    const consenting = FootageAuthorizationRootSchema.safeParse(root);
    if (!consenting.success) fail("canonicalization_consent_required", "Canonicalization needs an AuthorizedFootage 1.1.0 root with the owner's canonicalization consent.");
    const store = await openStore(request.workspaceRoot, sourcePath);
    const computationId = canonicalComputationIdOf({ source: identity, recipe: N1_RECIPE, toolchain: CANONICAL_TOOLCHAIN });
    const sourceMeasured = await measure(ctx, source, sourceProbe, classification, { video: "source_video_digest", audio: "source_audio_digest" },
      { changed: "source_changed", invalid: "probe_invalid" });
    const record = await readRecord(store, computationId);
    const build = (output: Measured): CanonicalMediaDerivation => {
      try {
        return buildCanonicalMediaDerivation({ rootAuthorization: consenting.data, source: classification, output: { contentHash: output.anchor.contentHash,
          sizeBytes: output.anchor.sizeBytes, classification: output.classification, decodedVideo: { sourceDigest: sourceMeasured.video.digest, outputDigest: output.video.digest },
          audioPackets: sourceMeasured.audio === null || output.audio === null ? null : { sourceDigest: sourceMeasured.audio.digest, outputDigest: output.audio.digest } } });
      } catch (error) { if (error instanceof MediaIngestError) fail("verification_failed", "The verified facts do not form a canonical derivation."); throw error; }
    };
    const measureOutput = async (subject: Anchor, codes: { changed: CanonicalIngestErrorCode; invalid: CanonicalIngestErrorCode; mismatch: CanonicalIngestErrorCode }) => {
      const probed = await probeOf(ctx, subject, codes, "output_probe");
      if (probed === null) fail(codes.invalid, "The output is not a readable media file.");
      const measured = await measure(ctx, subject, probed, classifyProbe(probed), { video: "output_video_digest", audio: "output_audio_digest" }, codes);
      verifyEquivalent(sourceMeasured, measured, codes.mismatch);
      return measured;
    };
    let derivation: CanonicalMediaDerivation, output: Measured, publication: "published_by_this_operation" | "existing_object_reverified", cache: "miss" | "hit";
    const cachedPath = record === undefined ? null : join(store.objects, canonicalObjectName(record.outputHash));
    if (record !== undefined && cachedPath !== null && await exists(cachedPath)) {
      // A cache hit: exactly this computation's recorded result, verified again in full against this source. Never repaired, never re-run.
      const cached = await openAnchor(cachedPath, "cache_corrupt", MAX_STAGED_SOURCE_BYTES);
      try {
        if (cached.contentHash !== record.outputHash || cached.sizeBytes !== record.outputSize) fail("cache_corrupt", "A cached object is not exactly its recorded bytes.");
        output = await measureOutput(cached, { changed: "cache_corrupt", invalid: "cache_corrupt", mismatch: "cache_corrupt" });
      } finally { await cached.handle.close(); }
      derivation = build(output);
      if (canonicalComputationRecordOf(derivation).bytes !== record.bytes) fail("cache_corrupt", "A cached result is not exactly the recorded verified result of this computation.");
      publication = "existing_object_reverified"; cache = "hit";
    } else {
      cache = "miss";
      const bound = request.maxOutputBytes ?? Math.min(2 * source.sizeBytes + 1_048_576, MAX_STAGED_SOURCE_BYTES);
      const pendingPath = join(store.pending, `${randomBytes(16).toString("hex")}.mp4`);
      try { pendingHandle = await open(pendingPath, "wx+"); } catch { fail("store_unavailable", "An exclusive pending object could not be created."); }
      pendingPaths.push(pendingPath);
      const pending = pendingHandle;
      const input = await reader(source, "source_changed");
      let run: ProcessRun, sourceIntact: boolean;
      try {
        const ffmpeg = await pinned(toolRoot, "ffmpeg");
        await hook(ctx.hooks.beforeProcess === undefined ? undefined : () => ctx.hooks.beforeProcess!({ role: "canonicalize" }));
        const child = spawn(ffmpeg.path, n1Argv(bound), { shell: false, windowsHide: true, cwd: toolRoot, env: minimalEnvironment(),
          stdio: ["ignore", "pipe", "pipe", input.fd, pending.fd] });
        run = await supervise(child, request.canonicalizationTimeout, HARD.maxRecipeStdoutBytes);
        sourceIntact = await hashHandle(input, source.sizeBytes) === source.contentHash;
      } finally { await input.close().catch(() => undefined); }
      // A recipe that did not complete leaves no trusted output; then a source changed under it never becomes a canonical source.
      requireCompleted(run, "canonicalization");
      if (!sourceIntact) fail("source_changed", "The source changed while the recipe read it.");
      const written = Number((await pending.stat({ bigint: true })).size);
      if (written === 0 || written > bound) fail("output_invalid", "The recipe's output is empty or exceeds its byte bound.");
      const outputHash = await hashHandle(pending, written), opened = await pending.stat({ bigint: true });
      if (outputHash === "") fail("output_invalid", "The recipe's output could not be read whole.");
      const pendingAnchor: Anchor = { path: pendingPath, handle: pending, dev: opened.dev, ino: opened.ino, sizeBytes: written, contentHash: outputHash };
      output = await measureOutput(pendingAnchor, { changed: "output_invalid", invalid: "output_invalid", mismatch: "verification_failed" });
      if (record !== undefined && (record.outputHash !== outputHash || record.outputSize !== written)) {
        fail("publication_conflict", "The recorded result of this computation names other bytes: the computation is not reproducible or the store was altered.");
      }
      derivation = build(output);
      // The source is still exactly the verified source; then the pending bytes are sealed read-only and hashed once more.
      await reconfirm(source, "source_changed");
      await pending.chmod(0o444); await pending.sync();
      if (await hashHandle(pending, written) !== outputHash) fail("output_invalid", "The pending output changed before it was sealed.");
      await pending.close(); pendingHandle = null;
      await hook(ctx.hooks.beforePublication);
      // Only the very object this operation verified is ever linked: the pending name must still be that regular file.
      let named;
      try { named = await lstat(pendingPath, { bigint: true }); } catch { fail("output_invalid", "The verified pending output disappeared before publication."); }
      if (named.isSymbolicLink() || !named.isFile() || named.dev !== opened.dev || named.ino !== opened.ino) fail("output_invalid", "Another file took the verified pending output's name.");
      const final = join(store.objects, canonicalObjectName(outputHash));
      try { await link(pendingPath, final); publication = "published_by_this_operation"; } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") fail("store_unavailable", "No-overwrite publication is unavailable.");
        publication = "existing_object_reverified";
      }
      // The published (or occupying) object is re-read, re-hashed and re-probed before anything trusts it.
      const published = await openAnchor(final, "publication_conflict", MAX_STAGED_SOURCE_BYTES);
      try {
        if (published.contentHash !== outputHash || published.sizeBytes !== written || (publication === "published_by_this_operation"
          && (published.dev !== opened.dev || published.ino !== opened.ino))) fail("publication_conflict", "The content name holds other bytes; it is never overwritten.");
        const reprobed = await probeOf(ctx, published, { changed: "publication_conflict", invalid: "publication_conflict" }, "published_probe");
        if (reprobed === null || reprobed.rawDigest !== output.probed.rawDigest) fail("publication_conflict", "The published object does not probe as the verified output.");
      } finally { await published.handle.close(); }
      const computed = canonicalComputationRecordOf(derivation);
      await publishRecord(store, computed.name, computed.bytes);
    }
    // Nothing is returned unless the source is still exactly the verified source.
    await reconfirm(source, "source_changed");
    let authorization: FootageAuthorizationDerived;
    try { authorization = buildCanonicalDerivedAuthorization({ derivation, dateAdded: request.dateAdded, ...(request.allowedPurposes ? { allowedPurposes: request.allowedPurposes } : {}) }); } catch {
      fail("request_invalid", "The derived authorization does not validate.");
    }
    const outputVerified = derivation.output.verification;
    return { outcome: "NORMALIZE_N1", source: identity, classification, computationId, derivation, authorization,
      output: { assetId: derivation.output.assetId, contentHash: derivation.output.contentHash, sizeBytes: derivation.output.sizeBytes }, publication, cache,
      evidence: { sourceProbeDigest: sourceMeasured.probed.rawDigest, outputProbeDigest: output.probed.rawDigest, decodedVideoDigest: outputVerified.decodedVideo.outputDigest,
        audioPacketDigest: outputVerified.audio.state === "absent" ? null : outputVerified.audio.outputDigest, frameCount: outputVerified.frameCount,
        frameTableId: outputVerified.frameTableId, exactTiming: "identical" } };
  } catch (error) {
    // An unexpected local failure becomes one owned refusal without its detail (which may carry a location); only verified bytes were
    // ever linked, so nothing unverified is published.
    if (error instanceof CanonicalIngestError) throw error;
    throw new CanonicalIngestError("unexpected_failure", "The operation stopped on an unexpected local failure; nothing unverified was published.");
  } finally {
    await source.handle.close().catch(() => undefined);
    if (pendingHandle !== null) await pendingHandle.close().catch(() => undefined);
    for (const path of pendingPaths) await unlink(path).catch(() => undefined);
  }
}
