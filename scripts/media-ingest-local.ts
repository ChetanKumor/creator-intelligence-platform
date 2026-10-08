/**
 * Gate 7 Batch 3E-B2-A2, extending B1B's one local adapter. Trusted held-byte observations feed CanonicalMediaProfile v1 and its planner.
 * A legacy N1-only candidate still executes the exact accepted N1 recipe. Every other exact-remux plan is compiled here, measured against
 * fresh output facts and by-index content digests, and published without overwrite into the same private canonical store
 * `<workspace>/.local-media/canonical-v0/`. A deferred candidate is never re-encoded here.
 *
 * - Profile-controlled DIRECT, DEFER and REFUSE create nothing: no store, copy, transcode or remux.
 * - Probe-to-bytes binding. A pinned process never opens a path. Each child inherits its own fresh read-only handle, opened here,
 *   verified to be the anchor's file object (device and inode) and to hash to the exact expected bytes immediately before the spawn, and
 *   re-hashed after exit; a probe or digest of changed bytes is never evidence. One handle is never given to two children, because they
 *   would share its file pointer. The source anchor stays open for the whole operation and is re-verified before publication and again
 *   before anything is returned.
 * - The runtime is only the owner-pinned build in the approved tool root, re-verified by full SHA-256 immediately before every spawn: no
 *   PATH, no shell, a minimal environment, an fd-only protocol whitelist, and an argv of fixed tokens (the recipe is the accepted template
 *   with only its descriptor and byte-bound placeholders filled; the plan compiler has a closed vocabulary). The approved tool root is every child's working directory; no argument
 *   names a file, so nothing is ever written there.
 * - Publication: an exclusive pending object, completely verified, sealed read-only, then hard-linked to its content name. An occupied
 *   name is trusted only after it re-reads, re-hashes and re-probes as exactly the verified bytes; it is never overwritten or repaired.
 * - The computation record (packages/edit-render/owner-media.ts) maps a computation to its verified output and names no scope. A cache hit
 *   never re-runs the recipe and repeats every verification before any trust. Cache identity is never authorization: each caller's
 *   derivation and derived authorization are built only from its own root authorization and consent.
 * No error message carries a location, and raw process output is never persisted.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { link, lstat, mkdir, open, realpath, unlink, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, parse as parsePath, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { MAX_PROBE_OUTPUT_BYTES, PINNED_MEDIA_RUNTIME, parseProbeJson, type ProbeReport } from "../packages/edit-render/index.js";
import { CANONICAL_COMPUTATION_RECORD_IDENTITY, CANONICAL_PLAN_COMPUTATION_RECORD_IDENTITY, CANONICAL_STORE, canonicalComputationRecordName, canonicalComputationRecordOf, canonicalObjectName }
  from "../packages/edit-render/owner-media.js";
import { checkIdentity } from "../packages/editorial/common.js";
import { MAX_STAGED_SOURCE_BYTES, type RuntimeClock } from "../packages/edit-runtime/index.js";
import { FootageAuthorizationRootSchema, FootageAuthorizationSchema, type FootageAuthorization, type FootageAuthorizationDerived }
  from "../packages/footage-analyzer/protocol.js";
import { CANONICAL_TOOLCHAIN, MediaIngestError, N1_ARGV_TEMPLATE, N1_RECIPE, buildCanonicalDerivedAuthorization, buildCanonicalMediaDerivation, canonicalComputationIdOf,
  classifyCanonicalIngest, CanonicalMediaFactsSchema, type CanonicalMediaFacts, type CanonicalClassification, type CanonicalMediaDerivation } from "../packages/media-ingest/index.js";
import { DISPLAY_MATRIX_CARRIER_OBSERVATION, type VideoStreamFacts, type StreamFacts } from "../packages/media-ingest/profile.js";
import { CANONICAL_PLAN_TOOLCHAIN, CanonicalizationPlanSchema, PLAN_VERIFICATION_METHODS, buildCanonicalMediaPlanDerivation, buildCanonicalPlanDerivedAuthorization,
  canonicalPlanComputationIdOf, planCanonicalizationV1, type CanonicalMediaPlanDerivation, type CanonicalizationPlan, type CanonicalPlanningResult } from "../packages/media-ingest/plan.js";
import { CHROMA_OBSERVATION_METHOD, ChromaSafeReencodePlanSchema, makeCanonicalChromaObservation, planChromaSafeReencode, type CanonicalChromaObservation, type ChromaSpsDeclaration, type ChromaSafeReencodePlan, type ChromaPlanningResult } from "../packages/media-ingest/chroma.js";

export const CANONICAL_INGEST_ERROR_CODES = ["request_invalid", "authorization_invalid", "canonicalization_consent_required", "runtime_config_invalid",
  "runtime_binary_missing", "runtime_binary_mismatch", "source_location_invalid", "source_mismatch", "source_changed", "store_location_invalid", "store_unavailable",
  "process_failed", "process_timeout", "probe_invalid", "digest_invalid", "output_invalid", "verification_failed", "cache_corrupt", "publication_conflict",
  "plan_compiler_conflict", "audio_retime_execution_conflict", "unexpected_failure"] as const;
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
  if (info.isSymbolicLink() || !info.isFile() || info.dev !== anchor.dev || info.ino !== anchor.ino || info.size !== BigInt(anchor.sizeBytes)
    || (await anchor.handle.stat({ bigint: true })).size !== BigInt(anchor.sizeBytes) || await hashHandle(anchor.handle, anchor.sizeBytes) !== anchor.contentHash) {
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
  | "published_probe" | "source_facts" | "source_packets" | "source_headers" | "output_facts" | "output_packets" | "output_headers";
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
  timeoutMilliseconds: number, stdoutLimit: number, headers?: HeaderObservation): Promise<ProcessRun> {
  const handle = await reader(subject, changed);
  try {
    await hook(ctx.hooks.beforeProcess === undefined ? undefined : () => ctx.hooks.beforeProcess!({ role }));
    await reconfirm(subject, changed);
    const binary = await pinned(ctx.toolRoot, which);
    const boundedTimeout = losslessRemainingTime(ctx, timeoutMilliseconds);
    const child = spawn(binary.path, [...argv], { shell: false, windowsHide: true, cwd: ctx.toolRoot, env: minimalEnvironment(), stdio: ["ignore", "pipe", "pipe", handle.fd] });
    if (headers !== undefined) child.stderr?.on("data", (chunk: Buffer) => headers.consume(chunk));
    const run = await supervise(child, boundedTimeout, stdoutLimit);
    // A measurement of changed bytes is never evidence, whatever the process reported.
    if (await hashHandle(handle, subject.sizeBytes) !== subject.contentHash) fail(changed, "Measured bytes changed while a pinned process read them.");
    await reconfirm(subject, changed);
    return run;
  } finally { await handle.close().catch(() => undefined); }
}

// ---------------------------------------------------------------- B2-A2 observations of exact bytes (never accepted from a caller)
const FACT_ENTRIES = "stream=index,id,codec_type,codec_name,codec_tag_string,profile,width,height,pix_fmt,bits_per_raw_sample,field_order,has_b_frames,"
  + "r_frame_rate,time_base,start_pts,sample_rate,channels,channel_layout,color_range,color_primaries,color_transfer,color_space:stream_side_data"
  + ":format=format_name:frame=media_type,stream_index,pts,width,height,pix_fmt,nb_samples,color_range,color_primaries,color_transfer,color_space:frame_side_data";
const PACKET_ENTRIES = "packet=stream_index,pts,dts,duration,size,pos,flags";
/** B2R e14c/e14d: automatic frame threading changes HEVC side-data observations. This authority always decodes on one thread. */
export const CANONICAL_FACT_OBSERVATION_V1 = { version: "exact_byte_facts_v1", decoderThreads: 1,
  containerSar: "pasp_from_held_iso_bmff_track", bitstreamSar: "pinned_trace_headers_every_sps", sei: "pinned_trace_headers_exact_uuid",
  videoTiming: "decoded_presentation_pts", audioTiming: "decoded_pts_and_sample_counts" } as const;
type JsonObject = Record<string, unknown>;
function objectOf(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("probe_invalid", "A pinned observation is not an object.");
  return value as JsonObject;
}
function objectsOf(value: unknown): JsonObject[] {
  if (!Array.isArray(value) || value.length > 800_000) fail("probe_invalid", "A pinned observation is not a bounded table.");
  return value.map(objectOf);
}
function intOf(value: unknown): number {
  const number = typeof value === "string" && /^-?\d{1,16}$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) fail("probe_invalid", "An observation needs an exact integer.");
  return number;
}
function ratioFact(value: unknown, separator = "/"): { numerator: number; denominator: number } {
  if (typeof value !== "string") fail("probe_invalid", "An observation needs an exact ratio.");
  const parts = value.split(separator);
  if (parts.length !== 2) fail("probe_invalid", "An observation needs two ratio terms.");
  const numerator = intOf(parts[0]), denominator = intOf(parts[1]);
  if (numerator < 1 || denominator < 1) fail("probe_invalid", "An observation needs positive ratio terms.");
  return { numerator, denominator };
}
const sameObserved = (a: unknown, b: unknown) => canonicalSerialize(a) === canonicalSerialize(b);
type Sar = VideoStreamFacts["sampleAspectRatio"]["bitstream"];
const UNSPECIFIED_SAR: Sar = { state: "unspecified" };
// H.264/HEVC aspect_ratio_idc values; extended SAR (255) carries the two exact 16-bit terms.
const ASPECT_RATIOS = [[0, 1], [1, 1], [12, 11], [10, 11], [16, 11], [40, 33], [24, 11], [20, 11], [32, 11], [80, 33], [18, 11],
  [15, 11], [64, 33], [160, 99], [4, 3], [3, 2], [2, 1]] as const;
/** Streaming parser of the pinned CBS instrument. Diagnostics are never stored; malformed, missing or inconsistent SPS evidence refuses. */
class HeaderObservation {
  private pending = "";
  private total = 0;
  private invalid = false;
  private sps: Record<string, number> | null = null;
  private sars: Sar[] = [];
  private uuid: number[] | null = null;
  readonly uuids = new Set<string>();
  unknownSei = false;
  private finishSps(): void {
    const fields = this.sps; this.sps = null;
    if (fields === null) return;
    if (fields.vui_parameters_present_flag === 0 || (fields.vui_parameters_present_flag === 1 && fields.aspect_ratio_info_present_flag === 0)) {
      this.sars.push(UNSPECIFIED_SAR); return;
    }
    if (fields.vui_parameters_present_flag !== 1 || fields.aspect_ratio_info_present_flag !== 1) { this.invalid = true; return; }
    const idc = fields.aspect_ratio_idc;
    if (idc === 0) { this.sars.push(UNSPECIFIED_SAR); return; }
    const terms = idc === 255 ? [fields.sar_width, fields.sar_height] : idc === undefined ? undefined : ASPECT_RATIOS[idc];
    if (terms === undefined || terms[0] === undefined || terms[1] === undefined || terms[0] <= 0 || terms[1] <= 0) { this.invalid = true; return; }
    this.sars.push({ state: "declared", numerator: terms[0], denominator: terms[1] });
    if (this.sars.length > 100_000) this.invalid = true;
  }
  private line(line: string): void {
    const match = /^\[trace_headers @ [0-9A-Fa-f]+\] (.*)$/.exec(line.trimEnd());
    if (match === null) return;
    const text = match[1]!;
    if (text === "Sequence Parameter Set") { this.finishSps(); this.sps = {}; return; }
    if (/^[A-Z]/.test(text)) { this.finishSps(); if (text === "User Data Unregistered") { if (this.uuid !== null) this.invalid = true; this.uuid = []; } return; }
    const field = /^\d+ +([a-zA-Z0-9_\[\]]+) +[01]+ += +(-?\d+)$/.exec(text);
    if (field === null) return;
    const name = field[1]!, value = Number(field[2]);
    if (this.sps !== null && ["vui_parameters_present_flag", "aspect_ratio_info_present_flag", "aspect_ratio_idc", "sar_width", "sar_height"].includes(name)) {
      if (Object.hasOwn(this.sps, name)) this.invalid = true; this.sps[name] = value;
    }
    const uuidIndex = /^uuid_iso_iec_11578\[(\d+)\]$/.exec(name);
    if (uuidIndex !== null) {
      if (this.uuid === null || Number(uuidIndex[1]) !== this.uuid.length || value < 0 || value > 255) { this.invalid = true; return; }
      this.uuid.push(value);
      if (this.uuid.length === 16) { this.uuids.add(Buffer.from(this.uuid).toString("hex")); this.uuid = null; }
      if (this.uuids.size > 32) this.invalid = true;
    }
    if (name === "payload_type" && value !== 5) this.unknownSei = true;
  }
  consume(bytes: Buffer): void {
    this.total += bytes.length;
    if (this.total > 512 * 1024 * 1024 || this.invalid) { this.invalid = true; return; }
    this.pending += bytes.toString("utf8");
    let end: number;
    while ((end = this.pending.indexOf("\n")) !== -1) { this.line(this.pending.slice(0, end)); this.pending = this.pending.slice(end + 1); }
    if (this.pending.length > 8192) this.invalid = true;
  }
  finish(): Sar {
    if (this.pending !== "") this.line(this.pending);
    this.finishSps();
    if (this.invalid || this.uuid !== null || this.sars.length === 0 || !this.sars.every(s => sameObserved(s, this.sars[0]))) {
      fail("probe_invalid", "The pinned bitstream observation lacks one consistent, independently measured SAR declaration.");
    }
    return this.sars[0]!;
  }
}

interface MediaBox { type: string; start: number; end: number; header: number }
function mediaBoxes(bytes: Buffer, start: number, end: number): MediaBox[] {
  const result: MediaBox[] = [];
  while (start < end) {
    if (start + 8 > end || result.length > 100_000) fail("probe_invalid", "The container box table is malformed or unbounded.");
    const short = bytes.readUInt32BE(start), header = short === 1 ? 16 : 8;
    if (start + header > end) fail("probe_invalid", "A container box header is truncated.");
    const size = short === 1 ? Number(bytes.readBigUInt64BE(start + 8)) : short === 0 ? end - start : short;
    if (!Number.isSafeInteger(size) || size < header || start + size > end) fail("probe_invalid", "A container box has invalid bounds.");
    result.push({ type: bytes.toString("latin1", start + 4, start + 8), start, end: start + size, header }); start += size;
  }
  return result;
}
async function readRange(handle: FileHandle, position: number, size: number): Promise<Buffer> {
  if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(size) || size < 0 || size > 64 * 1024 * 1024) fail("probe_invalid", "A container read exceeds its bound.");
  const bytes = Buffer.alloc(size); let at = 0;
  while (at < size) { const read = await handle.read(bytes, at, size - at, position + at); if (read.bytesRead === 0) fail("probe_invalid", "A container read is truncated."); at += read.bytesRead; }
  return bytes;
}
interface ContainerVideo { trackId: number; sar: Sar; hasClap: boolean }
/** Independent pasp observation: the actual sample entry, never ffprobe's effective winner. B2R e02/mp4.mjs establishes this structure. */
async function containerVideoOf(subject: Anchor, changed: CanonicalIngestErrorCode): Promise<ContainerVideo[]> {
  const handle = await reader(subject, changed);
  try {
    let position = 0, count = 0, moov: Buffer | null = null;
    while (position < subject.sizeBytes) {
      if (++count > 100_000 || position + 8 > subject.sizeBytes) fail("probe_invalid", "The container box table is malformed.");
      const header = await readRange(handle, position, Math.min(16, subject.sizeBytes - position));
      const short = header.readUInt32BE(0), length = short === 1 ? 16 : 8;
      if (header.length < length) fail("probe_invalid", "The container header is truncated.");
      const size = short === 1 ? Number(header.readBigUInt64BE(8)) : short === 0 ? subject.sizeBytes - position : short;
      if (!Number.isSafeInteger(size) || size < length || position + size > subject.sizeBytes) fail("probe_invalid", "The container box exceeds its source.");
      if (header.toString("latin1", 4, 8) === "moov") {
        if (moov !== null) fail("probe_invalid", "Several movie headers are ambiguous.");
        moov = await readRange(handle, position + length, size - length);
      }
      position += size;
    }
    if (moov === null) fail("probe_invalid", "The source has no ISO BMFF movie header.");
    const bytes = moov, result: ContainerVideo[] = [];
    const children = (box: MediaBox) => mediaBoxes(bytes, box.start + box.header, box.end);
    const required = (list: MediaBox[], type: string): MediaBox => {
      const matches = list.filter(box => box.type === type);
      if (matches.length !== 1) fail("probe_invalid", "A movie track has an ambiguous required box."); return matches[0]!;
    };
    for (const trak of mediaBoxes(bytes, 0, bytes.length).filter(box => box.type === "trak")) {
      const track = children(trak), mdia = required(track, "mdia"), media = children(mdia), hdlr = required(media, "hdlr");
      if (bytes.toString("latin1", hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12) !== "vide") continue;
      const tkhd = required(track, "tkhd"), body = tkhd.start + tkhd.header, version = bytes[body];
      if (version !== 0 && version !== 1) fail("probe_invalid", "The track header version is unsupported.");
      const trackId = bytes.readUInt32BE(body + (version === 1 ? 20 : 12));
      const stsd = required(children(required(children(required(media, "minf")), "stbl")), "stsd"), sd = stsd.start + stsd.header;
      if (bytes.readUInt32BE(sd + 4) !== 1) fail("probe_invalid", "Several video sample descriptions need separate evidence.");
      const entries = mediaBoxes(bytes, sd + 8, stsd.end);
      if (entries.length !== 1 || entries[0]!.end - entries[0]!.start < 86) fail("probe_invalid", "The video sample entry is malformed.");
      const entry = entries[0]!, kids = mediaBoxes(bytes, entry.start + entry.header + 78, entry.end), pasps = kids.filter(box => box.type === "pasp");
      if (pasps.length > 1) fail("probe_invalid", "Several container SAR declarations are ambiguous.");
      let sar: Sar = UNSPECIFIED_SAR;
      if (pasps.length === 1) {
        const pasp = pasps[0]!, at = pasp.start + pasp.header;
        if (pasp.end - at !== 8) fail("probe_invalid", "The container SAR declaration is malformed.");
        const numerator = bytes.readUInt32BE(at), denominator = bytes.readUInt32BE(at + 4);
        if (numerator === 0 || denominator === 0) fail("probe_invalid", "The container SAR declaration has a zero term.");
        sar = { state: "declared", numerator, denominator };
      }
      result.push({ trackId, sar, hasClap: kids.some(box => box.type === "clap") });
    }
    if (await hashHandle(handle, subject.sizeBytes) !== subject.contentHash) fail(changed, "The container changed during its observation.");
    await reconfirm(subject, changed); return result;
  } finally { await handle.close().catch(() => undefined); }
}
interface PacketObservation { streamIndex: number; pts: number; dts: number; duration: number; position: number; size: number }
interface FreshFacts { facts: CanonicalMediaFacts; packets: PacketObservation[] }
async function factsOf(ctx: Context, subject: Anchor, changed: CanonicalIngestErrorCode, output: boolean): Promise<FreshFacts> {
  const prefix = output ? "output" : "source";
  const query = (entries: string) => ["-hide_banner", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3",
    "-show_entries", entries, "-of", "json=compact=1", "-i", "fd:"];
  const decoded = await runOver(ctx, subject, changed, `${prefix}_facts`, "ffprobe", query(FACT_ENTRIES), HARD.probeTimeoutMilliseconds, MAX_PROBE_OUTPUT_BYTES);
  requireCompleted(decoded, "facts observation");
  let raw: JsonObject;
  try { raw = objectOf(JSON.parse(decoded.stdout.toString("utf8"))); } catch { fail("probe_invalid", "The pinned facts observation is malformed."); }
  const streams = objectsOf(raw.streams), frames = objectsOf(raw.frames).filter(frame => frame.media_type === "video" || frame.media_type === "audio");
  const container = await containerVideoOf(subject, changed);
  const packetRun = await runOver(ctx, subject, changed, `${prefix}_packets`, "ffprobe", query(PACKET_ENTRIES), HARD.probeTimeoutMilliseconds, MAX_PROBE_OUTPUT_BYTES);
  requireCompleted(packetRun, "packet observation");
  let rawPackets: JsonObject[];
  try { rawPackets = objectsOf(objectOf(JSON.parse(packetRun.stdout.toString("utf8"))).packets); } catch { fail("probe_invalid", "The pinned packet observation is malformed."); }
  const avIndexes = new Set(streams.filter(s => s.codec_type === "video" || s.codec_type === "audio").map(s => intOf(s.index)));
  const packets: PacketObservation[] = rawPackets.filter(p => avIndexes.has(intOf(p.stream_index))).map(p => ({ streamIndex: intOf(p.stream_index), pts: intOf(p.pts),
    dts: intOf(p.dts), duration: intOf(p.duration), position: intOf(p.pos), size: intOf(p.size) }));
  if (packets.some(p => p.position < 0 || p.size <= 0 || p.position + p.size > subject.sizeBytes)) fail("probe_invalid", "A packet lies outside the observed source.");
  const observed: StreamFacts[] = [];
  const colorOf = (r: JsonObject): VideoStreamFacts["color"] => {
    const label = (v: unknown) => v === undefined || v === "unknown" || v === "unspecified" ? null : typeof v === "string" ? v : fail("probe_invalid", "A colour field is malformed.");
    const range = label(r.color_range);
    if (range !== null && range !== "tv" && range !== "pc") fail("probe_invalid", "A colour range is not recognized.");
    return { range, primaries: label(r.color_primaries), transfer: label(r.color_transfer), matrix: label(r.color_space) };
  };
  for (const stream of streams) {
    const index = intOf(stream.index), decodedFrames = frames.filter(frame => intOf(frame.stream_index) === index);
    if (stream.codec_type === "video") {
      if (stream.codec_name !== "h264" && stream.codec_name !== "hevc") fail("probe_invalid", "The video codec has no supported exact-byte bitstream observer.");
      const header = new HeaderObservation();
      const run = await runOver(ctx, subject, changed, `${prefix}_headers`, "ffmpeg", ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-copyts", ...FD_INPUT,
        "-map", `0:${index}`, "-c", "copy", "-bsf:v", "trace_headers", "-f", "null", "-protocol_whitelist", "fd", "-fd", "1", "fd:"],
      HARD.probeTimeoutMilliseconds, HARD.maxRecipeStdoutBytes, header);
      requireCompleted(run, "bitstream observation");
      const bitstream = header.finish();
      if (typeof stream.id !== "string" || !/^0x[0-9a-fA-F]+$/.test(stream.id)) fail("probe_invalid", "The stream has no exact container track identity.");
      const entries = container.filter(entry => entry.trackId === Number.parseInt(stream.id as string, 16));
      if (entries.length !== 1) fail("probe_invalid", "The video does not join exactly one container track.");
      const entry = entries[0]!, sideData: VideoStreamFacts["sideData"] = [], streamSide = stream.side_data_list === undefined ? [] : objectsOf(stream.side_data_list);
      let displayMatrix: VideoStreamFacts["displayMatrix"] = { state: "absent" }, frameCropping: VideoStreamFacts["frameCropping"] = { state: "absent" };
      const matrixCarriers = { observation: DISPLAY_MATRIX_CARRIER_OBSERVATION, stream: [] as number[][], frames: decodedFrames.map(() => [] as number[][]) };
      let matrixSeen = false, cropSeen = false, userDataSeen = false;
      const addSide = (data: JsonObject, carrier: "frame" | "stream", frameIndex?: number) => {
        const type = data.side_data_type;
        if (type === "Display Matrix" || type === "3x3 displaymatrix") {
          const lines = typeof data.displaymatrix === "string" ? data.displaymatrix.trim().split(/\r?\n/) : [];
          const parsed = lines.map(line => /^\s*\d{8}:\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/.exec(line));
          if (parsed.length !== 3 || parsed.some(line => line === null)) fail("probe_invalid", "A matrix carrier cannot be read completely.");
          const coefficients = parsed.flatMap(line => line!.slice(1).map(Number));
          if (carrier === "stream") {
            if (matrixSeen) fail("probe_invalid", "Several display matrices are ambiguous."); matrixSeen = true;
            matrixCarriers.stream.push(coefficients); displayMatrix = { state: "present", coefficients }; return;
          }
          matrixCarriers.frames[frameIndex!]!.push(coefficients);
          sideData.push({ carrier, kind: "display_matrix", seiUuid: null }); return;
        }
        if (carrier === "stream" && type === "Frame Cropping") {
          if (cropSeen) fail("probe_invalid", "Several clean apertures are ambiguous."); cropSeen = true;
          frameCropping = { state: "present", top: intOf(data.crop_top), bottom: intOf(data.crop_bottom), left: intOf(data.crop_left), right: intOf(data.crop_right) }; return;
        }
        if (type === "H.26[45] User Data Unregistered SEI message") {
          userDataSeen = true;
          if (header.uuids.size === 0) sideData.push({ carrier, kind: "unknown", seiUuid: null });
          for (const seiUuid of header.uuids) sideData.push({ carrier, kind: "user_data_unregistered_sei", seiUuid }); return;
        }
        const kinds: Record<string, VideoStreamFacts["sideData"][number]["kind"]> = { "Display Matrix": "display_matrix", "3x3 displaymatrix": "display_matrix", "Mastering display metadata": "mastering_display_metadata",
          "Content light level metadata": "content_light_level", "ICC profile": "icc_profile", "Spherical Mapping": "spherical_mapping", "Stereo 3D": "stereo_3d" };
        sideData.push({ carrier, kind: typeof type === "string" && Object.hasOwn(kinds, type) ? kinds[type]! : "unknown", seiUuid: null });
      };
      streamSide.forEach(side => addSide(side, "stream"));
      decodedFrames.forEach((frame, frameIndex) => {
        if (frame.side_data_list !== undefined) objectsOf(frame.side_data_list).forEach(side => addSide(side, "frame", frameIndex));
      });
      if (entry.hasClap !== cropSeen) fail("probe_invalid", "The container clean aperture and decoder cropping evidence disagree.");
      if ((header.uuids.size > 0 && !userDataSeen) || header.unknownSei) sideData.push({ carrier: "frame", kind: "unknown", seiUuid: null });
      const color = colorOf(stream);
      if (!decodedFrames.every(frame => sameObserved(colorOf(frame), color) && frame.pix_fmt === stream.pix_fmt)) fail("probe_invalid", "Decoded colour or pixel format changes within the source.");
      const decodedSizes = new Map(decodedFrames.map(frame => { const size = { width: intOf(frame.width), height: intOf(frame.height) }; return [canonicalSerialize(size), size]; }));
      // B2R CR01: ffprobe's decoder reports the uncropped frame; FFmpeg applies the container clean aperture at its decoded output.
      // Observe that output independently. Rotation stays disabled so no display matrix is mistaken for encoded geometry.
      if (cropSeen) {
        const cropped = await runOver(ctx, subject, changed, output ? "output_video_digest" : "source_video_digest", "ffmpeg",
          ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-threads", "1", "-noautorotate", ...FD_INPUT, "-map", `0:${index}`,
            "-fps_mode", "passthrough", "-enc_time_base:v", "demux", ...LISTING_TAIL], HARD.digestTimeoutMilliseconds, HARD.maxListingBytes);
        requireCompleted(cropped, "decoded crop observation");
        const listing = cropped.stdout.toString("utf8"); parseListing(listing, "video");
        const dimensions = /^#dimensions 0: (\d+)x(\d+)$/m.exec(listing);
        if (dimensions === null) fail("probe_invalid", "The cropped decoded dimensions are missing.");
        const size = { width: Number(dimensions[1]), height: Number(dimensions[2]) };
        decodedSizes.clear(); decodedSizes.set(canonicalSerialize(size), size);
      }
      const timeBase = ratioFact(stream.time_base);
      if (timeBase.numerator !== 1) fail("probe_invalid", "The stream time base is not an ISO BMFF timescale.");
      const pixelFormat = typeof stream.pix_fmt === "string" ? stream.pix_fmt : fail("probe_invalid", "The decoded pixel format is missing.");
      const depth = /p(9|10|12|14|16)(le|be)$/.exec(pixelFormat);
      const bitDepth = stream.bits_per_raw_sample === undefined ? depth === null ? 8 : Number(depth[1]) : intOf(stream.bits_per_raw_sample);
      const value = { kind: "video", index, codec: stream.codec_name, pixelFormat, bitDepth, fieldOrder: stream.field_order ?? "unknown",
        geometry: { declared: { width: intOf(stream.width), height: intOf(stream.height) }, decoded: [...decodedSizes.values()] },
        sampleAspectRatio: { container: entry.sar, bitstream }, displayMatrix, frameCropping, color,
        ...(matrixSeen || matrixCarriers.frames.some(frame => frame.length > 0) ? { displayMatrixCarriers: matrixCarriers } : {}),
        sideData: [...new Map(sideData.map(side => [canonicalSerialize(side), side])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, side]) => side),
        timeBase, declaredFrameRate: ratioFact(stream.r_frame_rate), decodeReordering: packets.some(p => p.streamIndex === index && p.pts !== p.dts),
        presentationTimestamps: decodedFrames.map(frame => intOf(frame.pts)) };
      observed.push(value as VideoStreamFacts);
    } else if (stream.codec_type === "audio") {
      const timeBase = ratioFact(stream.time_base);
      if (timeBase.numerator !== 1) fail("probe_invalid", "The audio time base is not an ISO BMFF timescale.");
      observed.push({ kind: "audio", index, codec: stream.codec_name === "pcm_s16le" ? "pcm_s16le" : stream.codec_name === "aac" ? stream.profile === "LC" ? "aac_lc" : "aac_other" : "other",
        sampleRateHz: intOf(stream.sample_rate), channels: intOf(stream.channels), channelLayout: stream.channel_layout === "mono" ? "mono" : stream.channel_layout === "stereo" ? "stereo" : "other",
        timeBase: { numerator: 1, denominator: timeBase.denominator }, frames: decodedFrames.map(frame => ({ pts: intOf(frame.pts), samples: intOf(frame.nb_samples) })) });
    } else if (stream.codec_type === "data" && stream.codec_tag_string === "tmcd") observed.push({ kind: "timecode", index, codec: "tmcd" });
    else if (stream.codec_type === "subtitle") observed.push({ kind: "subtitle", index, codec: stream.codec_name === "mov_text" ? "mov_text" : "other" });
    else observed.push({ kind: stream.codec_type === "attachment" ? "attachment" : "data", index });
  }
  const parsed = CanonicalMediaFactsSchema.safeParse({ factsType: "CanonicalMediaFacts", factsVersion: "1.0.0", container: "iso_bmff", streams: observed });
  if (!parsed.success) fail("probe_invalid", "The measured exact-byte facts do not satisfy the frozen facts contract.");
  await reconfirm(subject, changed); return { facts: parsed.data, packets };
}

// ---------------------------------------------------------------- measurements of exact bytes (accepted N1 methods)
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
interface StoredRecord { bytes: string; outputHash: string; outputSize: number; physical?: { dev: bigint; ino: bigint } }
/** The computation's record exactly as published, or undefined when absent; anything else is a corrupt cache. */
async function readRecord(store: Store, computationId: string, losslessPlan?: ChromaSafeReencodePlan): Promise<StoredRecord | undefined> {
  const path = join(store.computations, canonicalComputationRecordName(computationId));
  try { await lstat(path); } catch (error) { if ((error as { code?: string }).code === "ENOENT") return undefined; fail("store_unavailable", "A computation record could not be read."); }
  const anchor = await openAnchor(path, "cache_corrupt", CANONICAL_STORE.maxRecordBytes);
  try {
    const bytes = Buffer.alloc(anchor.sizeBytes);
    const { bytesRead } = await anchor.handle.read(bytes, 0, anchor.sizeBytes, 0);
    if (bytesRead !== anchor.sizeBytes) fail("cache_corrupt", "A computation record could not be read whole.");
    let text: string, value: unknown;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); value = JSON.parse(text); } catch { fail("cache_corrupt", "A computation record is not JSON."); }
    if (losslessPlan === undefined && `${canonicalSerialize(value)}\n` !== text) fail("cache_corrupt", "A computation record is not stored exactly as published.");
    if (losslessPlan !== undefined) {
      let compact: CanonicalLosslessComputationRecord;
      try { compact = parseLosslessComputationRecordBytes(text, losslessPlan); } catch { fail("cache_corrupt", "The compact lossless computation record is incompatible."); }
      if (compact.computationId !== computationId) fail("cache_corrupt", "The lossless record belongs to another computation.");
      await reconfirm(anchor, "cache_corrupt");
      return { bytes: text, outputHash: compact.output.contentHash, outputSize: compact.output.sizeBytes, physical: { dev: anchor.dev, ino: anchor.ino } };
    }
    const record = value as { artifactType?: unknown; artifactVersion?: unknown; computationId?: unknown; output?: { contentHash?: unknown; sizeBytes?: unknown } };
    const domain = record.artifactVersion === "0.2.0" ? CANONICAL_PLAN_COMPUTATION_RECORD_IDENTITY : CANONICAL_COMPUTATION_RECORD_IDENTITY;
    if (record.artifactType !== "CanonicalComputationRecord" || record.computationId !== computationId || !checkIdentity(record, "recordId", domain)
      || typeof record.output?.contentHash !== "string" || !SHA256.test(record.output.contentHash) || !Number.isSafeInteger(record.output.sizeBytes)
      || (record.output.sizeBytes as number) <= 0) fail("cache_corrupt", "A computation record is not this computation's identified record.");
    await reconfirm(anchor, "cache_corrupt");
    return { bytes: text, outputHash: record.output.contentHash, outputSize: record.output.sizeBytes as number };
  } finally { await anchor.handle.close(); }
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as { code?: string }).code === "ENOENT") return false; fail("store_unavailable", "A store name could not be read."); }
}
/** No-overwrite publication of complete, synced bytes; an existing record must hold exactly these bytes. */
async function publishRecord(store: Store, name: string, bytes: string, heldLossless = false): Promise<void> {
  if (heldLossless) return publishHeldLosslessRecord(store, name, bytes);
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
  /** Its AuthorizedFootage record; every canonicalization needs a 1.1.0 root that carries the owner's canonicalization consent. */
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
  | CanonicalLosslessPublishedResult
  | { outcome: "DIRECT" | "DEFER" | "REFUSE"; source: SourceIdentity; classification: CanonicalClassification; planning?: CanonicalPlanningResult;
    chromaPlanning?: ChromaPlanningResult; deferredReason?: "pcm_retime_unproved" }
  | { outcome: "PLAN"; source: SourceIdentity; planning: CanonicalPlanningResult; computationId: string; derivation: CanonicalMediaPlanDerivation;
    authorization: FootageAuthorizationDerived; output: SourceIdentity; publication: "published_by_this_operation" | "existing_object_reverified"; cache: "miss" | "hit" }
  | { outcome: "NORMALIZE_N1"; source: SourceIdentity; classification: CanonicalClassification; computationId: string; derivation: CanonicalMediaDerivation;
    authorization: FootageAuthorizationDerived; output: SourceIdentity; publication: "published_by_this_operation" | "existing_object_reverified"; cache: "miss" | "hit";
    evidence: CanonicalIngestEvidence };
interface Read { sourcePath: unknown; authorization: FootageAuthorization; toolRoot: unknown; workspaceRoot: unknown; dateAdded: string;
  allowedPurposes: ("local_footage_analysis" | "local_evaluation")[] | undefined; maxOutputBytes: number | undefined; canonicalizationTimeout: number;
  hooks: CanonicalIngestInstrumentation }
function readRequest(input: unknown): Read {
  if (input === null || typeof input !== "object") fail("request_invalid", "A canonicalization request is required.");
  const keys = ["sourcePath", "rootAuthorization", "toolRoot", "workspaceRoot", "clock", "allowedPurposes", "limits", "instrumentation"];
  if (!Reflect.ownKeys(input).every(k => typeof k === "string" && keys.includes(k))) fail("request_invalid", "Only source, authorization and bounded runtime inputs are accepted.");
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
/** Read-only source inspection through the same held-byte boundary as execution. Facts and commands are never request inputs. */
export async function inspectCanonicalLocalMedia(input: CanonicalIngestRequest): Promise<{ source: SourceIdentity; facts: CanonicalMediaFacts }> {
  const request = readRequest(input), root = request.authorization, toolRoot = await approvedRoot(request.toolRoot);
  const ctx: Context = { toolRoot, hooks: request.hooks };
  const source = await openAnchor(await exactLocation(request.sourcePath, "source_location_invalid"), "source_location_invalid", MAX_STAGED_SOURCE_BYTES);
  try {
    if (source.contentHash !== root.contentHash || source.sizeBytes !== root.sizeBytes) fail("source_mismatch", "The source's bytes are not the authorized bytes.");
    const measured = await factsOf(ctx, source, "source_changed", false);
    await reconfirm(source, "source_changed");
    return { source: { assetId: `asset_${source.contentHash}`, contentHash: source.contentHash, sizeBytes: source.sizeBytes }, facts: measured.facts };
  } catch (error) {
    if (error instanceof CanonicalIngestError) throw error;
    throw new CanonicalIngestError("probe_invalid", "The exact-byte observations could not be established.");
  } finally { await source.handle.close().catch(() => undefined); }
}
function n1Argv(maxOutputBytes: number): string[] {
  const fill: Record<string, string> = { "{input_fd}": "3", "{output_fd}": "4", "{max_output_bytes}": String(maxOutputBytes) };
  return N1_ARGV_TEMPLATE.map(token => (Object.hasOwn(fill, token) ? fill[token]! : token));
}

// ---------------------------------------------------------------- the closed v1 plan compiler and measured verification
/** B2R e03c requires -copyts; e03/e11 establish setts. A2 generated proofs add prescale and explicit audio packet durations.
 * This function is private. Its only call uses fresh held-byte observations and the plan independently derived from them. */
function planArgv(measured: FreshFacts, supplied: CanonicalizationPlan, maxOutputBytes: number): string[] {
  const plan = CanonicalizationPlanSchema.parse(supplied), expected = planCanonicalizationV1(measured.facts).plan;
  if (expected === null || !sameObserved(plan, expected)) fail("plan_compiler_conflict", "Only the exact ordered plan derived from these bytes can execute.");
  const v = measured.facts.streams.find((s): s is VideoStreamFacts => s.kind === "video")!;
  const a = measured.facts.streams.find(s => s.kind === "audio");
  const rebase = plan.operations.find(o => o.op === "REBASE_TIMELINE_ZERO"), snap = plan.operations.find(o => o.op === "SNAP_VIDEO_TIMESTAMPS");
  const declares = plan.operations.some(o => o.op === "DECLARE_SQUARE_SAMPLE_ASPECT"), retime = plan.operations.some(o => o.op === "RETIME_AUDIO_CONTIGUOUS");
  const offset = (index: number) => rebase?.offsets.find(o => o.streamIndex === index)?.offsetTicks ?? 0;
  const videoFilters: string[] = [], audioFilters: string[] = [];
  // Subtract in the original integer time base before any expansion: a large exact t0 must not be multiplied into an inexact double.
  if (rebase !== undefined) videoFilters.push(`setts=pts=PTS-${offset(v.index)}:dts=DTS-${offset(v.index)}`);
  if (declares) videoFilters.push("h264_metadata=sample_aspect_ratio=1/1");
  const scale = snap?.outputTimeBase.denominator ?? v.timeBase.denominator;
  if (snap !== undefined) {
    const period = snap.gridPeriodTicks;
    // The source PTS is within P/4 of exactly slot i. Rounding after exact integer rescaling therefore maps it to that slot, including B-frames.
    videoFilters.push(`setts=time_base=1/${scale}:prescale=1:pts=round(PTS/${period})*${period}:dts=round(DTS/${period})*${period}:duration=${period}`);
  }
  if (a !== undefined && (retime || rebase !== undefined)) {
    const packets = measured.packets.filter(p => p.streamIndex === a.index), frames = new Map(a.frames.map(f => [f.pts, f.samples]));
    const full = a.frames.reduce((n, f) => Math.max(n, f.samples), 0);
    const samples = packets.map(p => {
      if (a.codec === "pcm_s16le") {
        const count = p.size / (2 * a.channels);
        if (!Number.isSafeInteger(count) || count <= 0 || (frames.has(p.pts) && frames.get(p.pts) !== count)) {
          fail("audio_retime_execution_conflict", "PCM packet sample counts do not match the decoded mapping.");
        }
        return count;
      }
      const observed = frames.get(p.pts);
      if (observed !== undefined) return observed;
      // AAC preroll remains a packet at its original negative instant; it is never counted as a presented frame.
      if (p.pts < a.frames[0]!.pts && p.duration === full) return full;
      return fail("audio_retime_execution_conflict", "An AAC packet has no exact decoded sample mapping.");
    });
    if (packets.length === 0) fail("audio_retime_execution_conflict", "An audio plan has no retained packets.");
    const runs: { start: number; samples: number }[] = [];
    samples.forEach((count, index) => { if (index === 0 || count !== samples[index - 1]) runs.push({ start: index, samples: count }); });
    // Bounded balanced expression over measured duration runs; cumulative output uses the previous measured packet duration.
    const duration = (lo: number, hi: number): string => {
      if (lo + 1 === hi) return String(runs[lo]!.samples);
      const mid = Math.floor((lo + hi) / 2);
      return `if(lt(N\\,${runs[mid]!.start})\\,${duration(lo, mid)}\\,${duration(mid, hi)})`;
    };
    const start = packets[0]!.pts - offset(a.index), startDts = packets[0]!.dts - offset(a.index);
    const pts = retime ? `if(eq(N\\,0)\\,${start}\\,PREV_OUTPTS+PREV_OUTDURATION)` : `PTS-${offset(a.index)}`;
    const dts = retime ? `if(eq(N\\,0)\\,${startDts}\\,PREV_OUTDTS+PREV_OUTDURATION)` : `DTS-${offset(a.index)}`;
    audioFilters.push(`setts=pts=${pts}:dts=${dts}:duration=${duration(0, runs.length)}`);
  }
  // The pinned MP4 muxer drops mono PCM's layout declaration. MOV retains it, within the same accepted ISO BMFF family (A2-E16).
  const argv = ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-copyts", ...FD_INPUT,
    "-map", `0:${plan.streams.videoIndex}`, ...(plan.streams.audioIndex === null ? [] : ["-map", `0:${plan.streams.audioIndex}`]), "-c", "copy",
    ...(videoFilters.length === 0 ? [] : ["-bsf:v", videoFilters.join(",")]), ...(audioFilters.length === 0 ? [] : ["-bsf:a", audioFilters.join(",")]),
    "-video_track_timescale", String(scale), "-avoid_negative_ts", "disabled", "-fps_mode:v", "passthrough", "-map_metadata", "-1", "-map_chapters", "-1",
    "-fflags", "+bitexact", "-fs", String(maxOutputBytes), "-protocol_whitelist", "fd", "-f", a?.codec === "pcm_s16le" ? "mov" : "mp4", "-fd", "4", "fd:"];
  if (argv.join(" ").length > 24_000) fail("plan_compiler_conflict", "The measured plan cannot fit the bounded single invocation.");
  return argv;
}
interface PlanMeasurements { decodedDigest: string; videoPackets: string; audioPackets: string | null }
/** Positions come from a pinned probe of the held bytes. Digest every compressed payload by packet index, excluding timestamps. */
async function packetContentDigest(subject: Anchor, observed: FreshFacts, index: number, changed: CanonicalIngestErrorCode): Promise<string> {
  const handle = await reader(subject, changed), stream = observed.facts.streams[index]!;
  const method = stream.kind === "video" ? PLAN_VERIFICATION_METHODS.videoPackets : PLAN_VERIFICATION_METHODS.audioPackets;
  const rows: { index: number; size: number; md5: string }[] = [], buffer = Buffer.alloc(1024 * 1024);
  try {
    for (const packet of observed.packets.filter(p => p.streamIndex === index)) {
      const digest = createHash("md5"); let at = 0;
      while (at < packet.size) {
        const count = Math.min(buffer.length, packet.size - at), read = await handle.read(buffer, 0, count, packet.position + at);
        if (read.bytesRead !== count) fail(changed, "A retained packet could not be read whole.");
        digest.update(buffer.subarray(0, count)); at += count;
      }
      rows.push({ index: rows.length, size: packet.size, md5: digest.digest("hex") });
    }
    if (rows.length === 0) fail("digest_invalid", "A retained stream has no packet payloads.");
    if (await hashHandle(handle, subject.sizeBytes) !== subject.contentHash) fail(changed, "The packet bytes changed while measured.");
    await reconfirm(subject, changed);
    return createHash("sha256").update(canonicalSerialize({ method, codec: "codec" in stream ? stream.codec : null, count: rows.length, rows })).digest("hex");
  } finally { await handle.close(); }
}
async function measurePlan(ctx: Context, subject: Anchor, observed: FreshFacts, changed: CanonicalIngestErrorCode, output: boolean): Promise<PlanMeasurements> {
  const v = observed.facts.streams.find((s): s is VideoStreamFacts => s.kind === "video")!, a = observed.facts.streams.find(s => s.kind === "audio");
  const run = await runOver(ctx, subject, changed, output ? "output_video_digest" : "source_video_digest", "ffmpeg",
    ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-threads", "1", "-noautorotate", ...FD_INPUT, "-map", `0:${v.index}`,
      "-fps_mode", "passthrough", "-enc_time_base:v", "demux", ...LISTING_TAIL], HARD.digestTimeoutMilliseconds, HARD.maxListingBytes);
  requireCompleted(run, "decoded frame content observation");
  const text = run.stdout.toString("utf8"); parseListing(text, "video");
  const size = v.geometry.decoded[0]!;
  if (!text.split("\n").includes(`#dimensions 0: ${size.width}x${size.height}`)) fail("verification_failed", "The decoded listing geometry differs from its fresh facts.");
  const rows = text.trimEnd().split("\n").filter(line => !line.startsWith("#")).map((line, index) => {
    const fields = line.split(",").map(field => field.trim()); return { index, size: Number(fields[4]), md5: fields[5]! };
  });
  if (rows.length !== v.presentationTimestamps.length) fail("verification_failed", "The decoded content listing does not cover exactly the presented frames.");
  const decodedDigest = createHash("sha256").update(canonicalSerialize({ method: PLAN_VERIFICATION_METHODS.decodedFrames, codec: "rawvideo",
    pixelFormat: v.pixelFormat, bitDepth: v.bitDepth, geometry: v.geometry.decoded, count: rows.length, rows })).digest("hex");
  return { decodedDigest, videoPackets: await packetContentDigest(subject, observed, v.index, changed),
    audioPackets: a === undefined ? null : await packetContentDigest(subject, observed, a.index, changed) };
}
/** Execute, measure, publish and reverify a plan in the same no-overwrite canonical store used by N1. */
async function executePlan(ctx: Context, request: Read, source: Anchor, observed: FreshFacts, planning: CanonicalPlanningResult): Promise<Extract<CanonicalIngestResult, { outcome: "PLAN" }>> {
  const consenting = FootageAuthorizationRootSchema.safeParse(request.authorization);
  if (!consenting.success) fail("canonicalization_consent_required", "Canonicalization needs an AuthorizedFootage 1.1.0 root with the owner's canonicalization consent.");
  const identity = { assetId: `asset_${source.contentHash}`, contentHash: source.contentHash, sizeBytes: source.sizeBytes }, plan = planning.plan!;
  const bound = request.maxOutputBytes ?? Math.min(2 * source.sizeBytes + 1_048_576, MAX_STAGED_SOURCE_BYTES);
  const argv = planArgv(observed, plan, bound), store = await openStore(request.workspaceRoot, source.path);
  const computationId = canonicalPlanComputationIdOf({ source: identity, plan, toolchain: CANONICAL_PLAN_TOOLCHAIN });
  const sourceMeasured = await measurePlan(ctx, source, observed, "source_changed", false), record = await readRecord(store, computationId);
  const verify = async (subject: Anchor, code: CanonicalIngestErrorCode): Promise<CanonicalMediaPlanDerivation> => {
    try {
      const fresh = await factsOf(ctx, subject, code, true);
      if (planCanonicalizationV1(fresh.facts).outcome !== "DIRECT") fail(code, "The output does not conform to CanonicalMediaProfile v1.");
      const measured = await measurePlan(ctx, subject, fresh, code, true), declares = plan.operations.some(o => o.op === "DECLARE_SQUARE_SAMPLE_ASPECT");
      const derivation = buildCanonicalMediaPlanDerivation({ rootAuthorization: consenting.data, source: { facts: observed.facts }, plan,
        output: { contentHash: subject.contentHash, sizeBytes: subject.sizeBytes, facts: fresh.facts,
          decodedFrames: { sourceDigest: sourceMeasured.decodedDigest, outputDigest: measured.decodedDigest },
          videoPackets: declares ? null : { sourceDigest: sourceMeasured.videoPackets, outputDigest: measured.videoPackets },
          audioPackets: sourceMeasured.audioPackets === null || measured.audioPackets === null ? null : { sourceDigest: sourceMeasured.audioPackets, outputDigest: measured.audioPackets } } });
      await reconfirm(subject, code); await reconfirm(source, "source_changed"); return derivation;
    } catch (error) {
      if (error instanceof CanonicalIngestError && (error.code === "source_changed" || error.code === "process_timeout" || error.code === "process_failed")) throw error;
      fail(code, "The measured output fails exact profile, payload or temporal verification.");
    }
  };
  let pending: FileHandle | null = null, pendingPath: string | null = null;
  let derivation: CanonicalMediaPlanDerivation, publication: "published_by_this_operation" | "existing_object_reverified", cache: "miss" | "hit";
  try {
    if (record !== undefined) {
      // Missing or altered bytes under an existing trusted record are corruption, never a reason to repair in place.
      const cached = await openAnchor(join(store.objects, canonicalObjectName(record.outputHash)), "cache_corrupt", MAX_STAGED_SOURCE_BYTES);
      try {
        if (cached.contentHash !== record.outputHash || cached.sizeBytes !== record.outputSize) fail("cache_corrupt", "A cached object differs from its recorded identity.");
        derivation = await verify(cached, "cache_corrupt");
        if (canonicalComputationRecordOf(derivation).bytes !== record.bytes) fail("cache_corrupt", "The computation record differs from the freshly verified derivation.");
        if ((await readRecord(store, computationId))?.bytes !== record.bytes) fail("cache_corrupt", "The computation record changed during cache verification.");
        await reconfirm(cached, "cache_corrupt");
      } finally { await cached.handle.close(); }
      cache = "hit"; publication = "existing_object_reverified";
    } else {
      cache = "miss"; pendingPath = join(store.pending, `${randomBytes(16).toString("hex")}.mp4`); pending = await open(pendingPath, "wx+");
      const initial = await pending.stat({ bigint: true }), input = await reader(source, "source_changed");
      let run: ProcessRun;
      try {
        await hook(ctx.hooks.beforeProcess === undefined ? undefined : () => ctx.hooks.beforeProcess!({ role: "canonicalize" }));
        await reconfirm(source, "source_changed");
        const binary = await pinned(ctx.toolRoot, "ffmpeg");
        const child = spawn(binary.path, argv, { shell: false, windowsHide: true, cwd: ctx.toolRoot, env: minimalEnvironment(),
          stdio: ["ignore", "pipe", "pipe", input.fd, pending.fd] });
        run = await supervise(child, request.canonicalizationTimeout, HARD.maxRecipeStdoutBytes);
        if (await hashHandle(input, source.sizeBytes) !== source.contentHash) fail("source_changed", "The source changed during plan execution.");
      } finally { await input.close(); }
      requireCompleted(run, "plan canonicalization"); await reconfirm(source, "source_changed");
      const written = Number((await pending.stat({ bigint: true })).size);
      if (written === 0 || written > bound) fail("output_invalid", "The pending output is empty or exceeds its byte bound.");
      const outputHash = await hashHandle(pending, written);
      const subject: Anchor = { path: pendingPath, handle: pending, dev: initial.dev, ino: initial.ino, sizeBytes: written, contentHash: outputHash };
      await reconfirm(subject, "output_invalid"); derivation = await verify(subject, "verification_failed");
      await pending.chmod(0o444); await pending.sync(); await reconfirm(subject, "output_invalid");
      await hook(ctx.hooks.beforePublication); await reconfirm(source, "source_changed"); await reconfirm(subject, "output_invalid");
      const final = join(store.objects, canonicalObjectName(outputHash));
      try { await link(pendingPath, final); publication = "published_by_this_operation"; } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") fail("store_unavailable", "No-overwrite publication is unavailable.");
        publication = "existing_object_reverified";
      }
      const winner = await openAnchor(final, "publication_conflict", MAX_STAGED_SOURCE_BYTES);
      try {
        if (winner.contentHash !== outputHash || winner.sizeBytes !== written || (publication === "published_by_this_operation"
          && (winner.dev !== initial.dev || winner.ino !== initial.ino))) fail("publication_conflict", "The canonical content name holds other bytes.");
        const freshDerivation = await verify(winner, "publication_conflict");
        if (!sameObserved(freshDerivation, derivation)) fail("publication_conflict", "The winning object differs from the verified pending derivation.");
        const computed = canonicalComputationRecordOf(freshDerivation);
        await publishRecord(store, computed.name, computed.bytes); await reconfirm(winner, "publication_conflict");
        const publishedRecord = await readRecord(store, computationId);
        if (publishedRecord?.bytes !== computed.bytes) fail("publication_conflict", "The winning computation record does not match the verified object.");
      } finally { await winner.handle.close(); }
    }
    await reconfirm(source, "source_changed");
    const authorization = buildCanonicalPlanDerivedAuthorization({ derivation, dateAdded: request.dateAdded,
      ...(request.allowedPurposes === undefined ? {} : { allowedPurposes: request.allowedPurposes }) });
    return { outcome: "PLAN", source: identity, planning, computationId, derivation, authorization,
      output: { assetId: derivation.output.assetId, contentHash: derivation.output.contentHash, sizeBytes: derivation.output.sizeBytes }, publication, cache };
  } finally { if (pending !== null) await pending.close().catch(() => undefined); if (pendingPath !== null) await unlink(pendingPath).catch(() => undefined); }
}
const classifyProbe = (probed: Probed | null) => classifyCanonicalIngest(probed === null ? { probe: null, facts: null } : { probe: probed.probe, facts: probed.facts });
/**
 * Profile-controlled ingest of one authorized exact source. The trusted planner selects DIRECT, DEFER, REFUSE or a closed remux plan.
 * The one-operation plan uses legacy N1 exactly when the frozen classifier also qualifies it. The N1 block below preserves its accepted
 * recipe, identities, cache records and authorization. Other plans use measured 0.2.0 derivations in the same store.
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
    if (sourceProbe === null) {
      await reconfirm(source, "source_changed"); return { outcome: "REFUSE", source: identity, classification, planning: planCanonicalizationV1(null) };
    }
    let observed: FreshFacts;
    try { observed = await factsOf(ctx, source, "source_changed", false); } catch (error) {
      if (!(error instanceof CanonicalIngestError) || error.code !== "probe_invalid") throw error;
      await reconfirm(source, "source_changed");
      return { outcome: "REFUSE", source: identity, classification, planning: planCanonicalizationV1(null) };
    }
    const planning = planCanonicalizationV1(observed.facts);
    if (planning.outcome === "DEFER") return await routeChromaSafeLossless(ctx, request, source, observed, classification, planning);
    if (planning.outcome !== "PLAN") { await reconfirm(source, "source_changed"); return { outcome: planning.outcome, source: identity, classification, planning }; }
    if (!(classification.outcome === "NORMALIZE_N1" && planning.plan!.operations.length === 1 && planning.plan!.operations[0]!.op === "DECLARE_SQUARE_SAMPLE_ASPECT")) {
      return await executePlan(ctx, request, source, observed, planning);
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

// ---------------------------------------------------------------- B2-B2 chroma-only observation/admission (no encode/publication/cache/lifecycle)
/** The original observer/supervisor stays unchanged. This separate streaming SPS parser consumes the same pinned instrument. */
class ChromaHeaderObservation extends HeaderObservation {
  private chromaPending="";
  private chromaTotal=0;
  private chromaInvalid=false;
  private chromaFields:Record<string,number>|null=null;
  private chromaSps:ChromaSpsDeclaration[]=[];
  constructor(private readonly chromaCodec:"h264"|"hevc"){super();}
  private endChromaSps():void {
    const fields=this.chromaFields;this.chromaFields=null;if(fields===null)return;
    const vuiPresent=fields.vui_parameters_present_flag,locationPresent=vuiPresent===0?null:fields.chroma_loc_info_present_flag;
    this.chromaSps.push({spsIndex:this.chromaSps.length,chromaFormatIdc:fields.chroma_format_idc!,
      frameMbsOnlyFlag:this.chromaCodec==="h264"?fields.frame_mbs_only_flag as 0|1:null,vuiPresent:vuiPresent as 0|1,
      locationPresent:locationPresent as 0|1|null,topFieldType:locationPresent===1?fields.chroma_sample_loc_type_top_field!:null,
      bottomFieldType:locationPresent===1?fields.chroma_sample_loc_type_bottom_field!:null});
    if(this.chromaSps.length>4096)this.chromaInvalid=true;
  }
  private chromaLine(line:string):void {
    const match=/^\[trace_headers @ [0-9A-Fa-f]+\] (.*)$/.exec(line.trimEnd());if(!match)return;
    const text=match[1]!;if(text==="Sequence Parameter Set"){this.endChromaSps();this.chromaFields={};return;}
    if(/^[A-Z]/.test(text)){this.endChromaSps();return;}
    const field=/^\d+ +([a-zA-Z0-9_\[\]]+) +[01]+ += +(-?\d+)$/.exec(text);if(!field || this.chromaFields===null)return;
    const name=field[1]!;
    if(["chroma_format_idc","frame_mbs_only_flag","vui_parameters_present_flag","chroma_loc_info_present_flag","chroma_sample_loc_type_top_field","chroma_sample_loc_type_bottom_field"].includes(name)){
      if(Object.hasOwn(this.chromaFields,name))this.chromaInvalid=true;this.chromaFields[name]=Number(field[2]);
    }
  }
  override consume(bytes:Buffer):void {
    super.consume(bytes);this.chromaTotal+=bytes.length;if(this.chromaTotal>512*1024*1024||this.chromaInvalid){this.chromaInvalid=true;return;}
    this.chromaPending+=bytes.toString("utf8");let end:number;
    while((end=this.chromaPending.indexOf("\n"))!==-1){this.chromaLine(this.chromaPending.slice(0,end));this.chromaPending=this.chromaPending.slice(end+1);}
    if(this.chromaPending.length>8192)this.chromaInvalid=true;
  }
  chromaFinish():ChromaSpsDeclaration[] {
    this.finish();if(this.chromaPending!=="")this.chromaLine(this.chromaPending);this.endChromaSps();
    if(this.chromaInvalid||!this.chromaSps.length)fail("probe_invalid","Complete bounded SPS chroma observations are required.");
    // Strict contract validation below rejects any missing raw field; it never supplies a codec default.
    return this.chromaSps;
  }
}
/** Only audited video sample-entry boxes are interpretable by the alpha; all other carrier names survive and refuse. */
async function chromaContainerOf(subject:Anchor,trackId:number):Promise<CanonicalChromaObservation["container"]> {
  const handle=await reader(subject,"source_changed");
  try {
    let position=0,count=0,moov:Buffer|null=null;
    while(position<subject.sizeBytes){
      if(++count>100000 || position+8>subject.sizeBytes)fail("probe_invalid","The chroma container table is malformed.");
      const header=await readRange(handle,position,Math.min(16,subject.sizeBytes-position)),short=header.readUInt32BE(0),length=short===1?16:8;
      const size=short===1?Number(header.readBigUInt64BE(8)):short===0?subject.sizeBytes-position:short;
      if(!Number.isSafeInteger(size)||size<length||position+size>subject.sizeBytes)fail("probe_invalid","The chroma container box is out of bounds.");
      if(header.toString("latin1",4,8)==="moov"){if(moov!==null)fail("probe_invalid","Ambiguous chroma container headers.");moov=await readRange(handle,position+length,size-length);}
      position+=size;
    }
    if(moov===null)fail("probe_invalid","Chroma observation requires one movie header.");
    const bytes=moov,children=(b:MediaBox)=>mediaBoxes(bytes,b.start+b.header,b.end);
    const one=(list:MediaBox[],type:string):MediaBox=>{const found=list.filter(b=>b.type===type);if(found.length!==1)fail("probe_invalid","Ambiguous chroma track structure.");return found[0]!;};
    const matches:CanonicalChromaObservation["container"][]=[];
    for(const trak of mediaBoxes(bytes,0,bytes.length).filter(b=>b.type==="trak")){
      const track=children(trak),tkhd=one(track,"tkhd"),body=tkhd.start+tkhd.header,version=bytes[body];
      if(version!==0&&version!==1)fail("probe_invalid","Unsupported chroma track header version.");
      if(bytes.readUInt32BE(body+(version===1?20:12))!==trackId)continue;
      const media=children(one(track,"mdia")),hdlr=one(media,"hdlr");if(bytes.toString("latin1",hdlr.start+hdlr.header+8,hdlr.start+hdlr.header+12)!=="vide")fail("probe_invalid","Chroma track must be video.");
      const stsd=one(children(one(children(one(media,"minf")),"stbl")),"stsd"),at=stsd.start+stsd.header;
      if(bytes.readUInt32BE(at+4)!==1)fail("probe_invalid","Multiple chroma sample descriptions are unsupported.");
      const entries=mediaBoxes(bytes,at+8,stsd.end);if(entries.length!==1||entries[0]!.end-entries[0]!.start<86)fail("probe_invalid","Malformed chroma sample entry.");
      const entry=entries[0]!,sampleEntry=entry.type;
      if(!["avc1","avc3","hvc1","hev1"].includes(sampleEntry))fail("probe_invalid","Unsupported chroma sample-entry codec.");
      const inventory:CanonicalChromaObservation["container"]["entries"]=mediaBoxes(bytes,entry.start+entry.header+78,entry.end).map(b=>{
        const payload=bytes.subarray(b.start+b.header,b.end),item={type:b.type,payloadBytes:payload.length,payloadHash:createHash("sha256").update(payload).digest("hex")};
        if(b.type==="fiel")return {...item,...(payload.length===2?{field:{count:payload[0]!,order:payload[1]!}}:{})};
        if(b.type!=="colr")return item;
        const subtype=payload.toString("latin1",0,4);
        const recognized=(subtype==="nclx"&&payload.length===11&&(payload[10]!&127)===0)||(subtype==="nclc"&&payload.length===10);
        return {...item,color:{subtype:recognized?subtype as "nclx"|"nclc":"other" as const,primaries:recognized?payload.readUInt16BE(4):null,
          transfer:recognized?payload.readUInt16BE(6):null,matrix:recognized?payload.readUInt16BE(8):null,fullRange:recognized&&subtype==="nclx"?Boolean(payload[10]!&128):null}};
      });
      matches.push({trackId,sampleEntry:sampleEntry as CanonicalChromaObservation["container"]["sampleEntry"],entries:inventory});
    }
    if(matches.length!==1)fail("probe_invalid","The chroma observation must join one exact video track.");
    if(await hashHandle(handle,subject.sizeBytes)!==subject.contentHash)fail("source_changed","The chroma container changed during observation.");
    await reconfirm(subject,"source_changed");return matches[0]!;
  } finally {await handle.close().catch(()=>undefined);}
}
const CHROMA_ADMISSION_CONSTRUCTION=Symbol("held-byte-chroma-admission-only");
const CHROMA_ADMISSIONS=new WeakMap<CanonicalChromaAdmissionHandle,ChromaSafeReencodePlan>();
/** Opaque read-only admission witness. It is not an execution permit; Checkpoints C-I remain unwired. */
export class CanonicalChromaAdmissionHandle {
  constructor(token:symbol,plan:ChromaSafeReencodePlan){
    if(token!==CHROMA_ADMISSION_CONSTRUCTION)fail("request_invalid","trusted_chroma_admission_required: only held-byte observation can mint this handle.");
    CHROMA_ADMISSIONS.set(this,structuredClone(ChromaSafeReencodePlanSchema.parse(plan)));Object.freeze(this);
  }
}
/** JSON, legacy B2-B1 plans and counterfeit instances are never trusted byte observations. Returns a private snapshot copy. */
export function canonicalChromaPlanOf(handle:unknown):ChromaSafeReencodePlan {
  const plan=handle instanceof CanonicalChromaAdmissionHandle?CHROMA_ADMISSIONS.get(handle):undefined;
  if(plan===undefined)fail("request_invalid","trusted_chroma_admission_required: a serialized plan is not observed-byte admission.");
  return structuredClone(plan);
}
/** No caller facts/plans/filters. Fresh held bytes -> old facts plus separate complete raw chroma carriers -> versioned admission.
 * This inspection starts only probes/header observations. It does not execute a re-encode, publish bytes or issue authorization. */
export async function inspectCanonicalChromaLocalMedia(input:CanonicalIngestRequest):Promise<{source:SourceIdentity;facts:CanonicalMediaFacts;
  observation:CanonicalChromaObservation;planning:ChromaPlanningResult;admission:CanonicalChromaAdmissionHandle|null}> {
  const request=readRequest(input),root=FootageAuthorizationRootSchema.safeParse(request.authorization);
  if(!root.success)fail("canonicalization_consent_required","Chroma re-encode admission requires the consenting original root.");
  const toolRoot=await approvedRoot(request.toolRoot),ctx:Context={toolRoot,hooks:request.hooks};
  const source=await openAnchor(await exactLocation(request.sourcePath,"source_location_invalid"),"source_location_invalid",MAX_STAGED_SOURCE_BYTES);
  try {
    if(source.contentHash!==root.data.contentHash||source.sizeBytes!==root.data.sizeBytes)fail("source_mismatch","The chroma source is not the authorized exact bytes.");
    const measured=await factsOf(ctx,source,"source_changed",false),v=measured.facts.streams.find((s):s is VideoStreamFacts=>s.kind==="video");
    if(!v || (v.codec!=="h264"&&v.codec!=="hevc"))fail("probe_invalid","No observable video chroma codec.");
    const argv=["-hide_banner","-loglevel","error","-threads","1","-protocol_whitelist","fd","-f","mov","-fd","3","-show_entries",
      "stream=index,id,codec_name,chroma_location:frame=media_type,stream_index,pts,chroma_location","-of","json=compact=1","-i","fd:"];
    const probe=await runOver(ctx,source,"source_changed","source_facts","ffprobe",argv,HARD.probeTimeoutMilliseconds,MAX_PROBE_OUTPUT_BYTES);
    requireCompleted(probe,"chroma frame observation");
    const raw=objectOf(JSON.parse(probe.stdout.toString("utf8"))),streams=objectsOf(raw.streams).filter(s=>intOf(s.index)===v.index);
    if(streams.length!==1)fail("probe_invalid","Chroma observation needs one exact video stream.");
    const stream=streams[0]!;if(stream.codec_name!==v.codec || typeof stream.id!=="string"||!/^0x[0-9a-fA-F]+$/.test(stream.id))fail("probe_invalid","The chroma stream/track join is malformed.");
    const header=new ChromaHeaderObservation(v.codec),run=await runOver(ctx,source,"source_changed","source_headers","ffmpeg",
      ["-hide_banner","-nostdin","-nostats","-loglevel","info","-threads","1","-noautorotate","-copyts",...FD_INPUT,"-map",`0:${v.index}`,"-c:v","copy",
        "-bsf:v","trace_headers","-f","null","-protocol_whitelist","fd","-fd","1","fd:"],HARD.probeTimeoutMilliseconds,HARD.maxRecipeStdoutBytes,header);
    requireCompleted(run,"chroma SPS observation");
    const label=(value:unknown)=>value===undefined?null:typeof value==="string"?value:fail("probe_invalid","A chroma label is malformed.");
    const identity={assetId:`asset_${source.contentHash}`,contentHash:source.contentHash,sizeBytes:source.sizeBytes};
    const observation=makeCanonicalChromaObservation({source:identity,factsDigest:createHash("sha256").update(canonicalSerialize(measured.facts)).digest("hex"),method:CHROMA_OBSERVATION_METHOD,
      codec:v.codec,streamIndex:v.index,container:await chromaContainerOf(source,Number.parseInt(stream.id,16)),bitstream:header.chromaFinish(),streamReported:label(stream.chroma_location),
      frames:objectsOf(raw.frames).filter(f=>f.media_type==="video"&&intOf(f.stream_index)===v.index).map((f,index)=>({index,pts:intOf(f.pts),reported:label(f.chroma_location)}))});
    const planning=planChromaSafeReencode({source:identity,sourceFacts:measured.facts,sourceChroma:observation});
    await reconfirm(source,"source_changed");
    const admission=planning.outcome==="PLAN"&&planning.plan!==null?new CanonicalChromaAdmissionHandle(CHROMA_ADMISSION_CONSTRUCTION,planning.plan):null;
    return {source:identity,facts:measured.facts,observation,planning,admission};
  } catch(error){if(error instanceof CanonicalIngestError)throw error;throw new CanonicalIngestError("probe_invalid","The exact-byte chroma observations could not be established.");}
  finally {await source.handle.close().catch(()=>undefined);}
}

// ---------------------------------------------------------------- B2-B2 C–D additive compiler/temporary boundary (NO routing/store/cache/authorization)
import { rmdir as removeLosslessDirectory, statfs as losslessFilesystem } from "node:fs/promises";
/** Implementation resource policy, not a changed encode/profile/plan identity. Owners can lower the old request's output/time limits. */
export const CANONICAL_LOSSLESS_RUNTIME_BOUNDS = Object.freeze({
  defaultOutputBytes: 256 * 1024 * 1024, maximumOutputBytes: MAX_STAGED_SOURCE_BYTES,
  maximumFrameBytes: 16 * 1024 * 1024, maximumFrameCount: 72000, maximumFactRows: 144000,
  maximumFactsUtf8Bytes: 16 * 1024 * 1024, maximumArgvCharacters: 24000,
  maximumEncodeStdoutBytes: 65536, maximumDiagnosticBytes: 2 * 1024 * 1024,
  outputMonitorMilliseconds: 20, terminationGraceMilliseconds: HARD.terminationGraceMilliseconds,
} as const);
const LOSSLESS_D4_FILTERS = {
  identity: [], rotate_90_ccw: ["transpose=cclock"], rotate_180: ["hflip", "vflip"], rotate_90_cw: ["transpose=clock"],
  mirror_horizontal: ["hflip"], mirror_vertical: ["vflip"], transpose: ["transpose=cclock_flip"], transverse: ["transpose=clock_flip"],
} as const;
interface LosslessSourceContext { ctx: Context; request: Read; source: Anchor; measured: FreshFacts; plan: ChromaSafeReencodePlan }
const anchorIdentity = (a: Anchor): SourceIdentity => ({ assetId: "asset_" + a.contentHash, contentHash: a.contentHash, sizeBytes: a.sizeBytes });
function losslessMeasuredBounds(m: FreshFacts): void {
  const v = m.facts.streams.find((s): s is VideoStreamFacts => s.kind === "video");
  if (!v) fail("plan_compiler_conflict", "Lossless execution requires a measured video stream.");
  const { width, height } = v.geometry.declared, area = width * height, frameBytes = area * 3 / 2;
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 16384 && n % 2 === 0)
    || !Number.isSafeInteger(area) || !Number.isSafeInteger(frameBytes) || frameBytes > CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumFrameBytes)
    fail("plan_compiler_conflict", "The decoded frame exceeds the explicit lossless allocation bound.");
  const rows = m.facts.streams.reduce((n, s) => n + (s.kind === "video" ? s.presentationTimestamps.length : s.kind === "audio" ? s.frames.length : 0), 0);
  if (rows > CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumFactRows || m.packets.length > CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumFactRows
    || Buffer.byteLength(canonicalSerialize(m.facts), "utf8") > CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumFactsUtf8Bytes)
    fail("plan_compiler_conflict", "The exact fact or packet tables exceed the lossless resource bound.");
}
/** Held internal output observation has no authorization assertion. Same pinned queries/parser/carrier reader as Checkpoint B. */
async function losslessChromaOf(ctx: Context, subject: Anchor, measured: FreshFacts, output: boolean): Promise<CanonicalChromaObservation> {
  const changed = output ? "output_invalid" : "source_changed", prefix = output ? "output" : "source";
  const v = measured.facts.streams.find((s): s is VideoStreamFacts => s.kind === "video");
  if (!v || (v.codec !== "h264" && v.codec !== "hevc")) fail("probe_invalid", "No observable video chroma codec.");
  const argv = ["-hide_banner", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3",
    "-show_entries", "stream=index,id,codec_name,chroma_location:frame=media_type,stream_index,pts,chroma_location", "-of", "json=compact=1", "-i", "fd:"];
  const probe = await runOver(ctx, subject, changed, prefix + "_facts" as PinnedRole, "ffprobe", argv, HARD.probeTimeoutMilliseconds, MAX_PROBE_OUTPUT_BYTES);
  requireCompleted(probe, "chroma frame observation");
  const raw = objectOf(JSON.parse(probe.stdout.toString("utf8"))), streams = objectsOf(raw.streams).filter(s => intOf(s.index) === v.index);
  if (streams.length !== 1) fail("probe_invalid", "Chroma observation needs one exact video stream.");
  const stream = streams[0]!;
  if (stream.codec_name !== v.codec || typeof stream.id !== "string" || !/^0x[0-9a-fA-F]+$/.test(stream.id)) fail("probe_invalid", "The chroma stream/track join is malformed.");
  const header = new ChromaHeaderObservation(v.codec), run = await runOver(ctx, subject, changed, prefix + "_headers" as PinnedRole, "ffmpeg",
    ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-threads", "1", "-noautorotate", "-copyts", ...FD_INPUT, "-map", "0:" + v.index,
      "-c:v", "copy", "-bsf:v", "trace_headers", "-f", "null", "-protocol_whitelist", "fd", "-fd", "1", "fd:"],
    HARD.probeTimeoutMilliseconds, HARD.maxRecipeStdoutBytes, header);
  requireCompleted(run, "chroma SPS observation");
  const label = (value: unknown) => value === undefined ? null : typeof value === "string" ? value : fail("probe_invalid", "A chroma label is malformed.");
  // chromaContainerOf reuses reader/hash/reconfirm over this held object; its legacy error label is normalized at the output boundary.
  return makeCanonicalChromaObservation({ source: anchorIdentity(subject), factsDigest: createHash("sha256").update(canonicalSerialize(measured.facts)).digest("hex"),
    method: CHROMA_OBSERVATION_METHOD, codec: v.codec, streamIndex: v.index, container: await chromaContainerOf(subject, Number.parseInt(stream.id, 16)),
    bitstream: header.chromaFinish(), streamReported: label(stream.chroma_location),
    frames: objectsOf(raw.frames).filter(f => f.media_type === "video" && intOf(f.stream_index) === v.index)
      .map((f, index) => ({ index, pts: intOf(f.pts), reported: label(f.chroma_location) })) });
}
/** Admission is a witness only. Re-observe current authorized held bytes, then require the full plan to match before ANY encode. */
async function withLosslessSource<T>(input: CanonicalIngestRequest, admission: unknown, use: (bound: LosslessSourceContext) => Promise<T>): Promise<T> {
  const admitted = canonicalChromaPlanOf(admission), request = readRequest(input), root = FootageAuthorizationRootSchema.safeParse(request.authorization);
  if (!root.success) fail("canonicalization_consent_required", "Lossless execution requires the consenting original root.");
  if (root.data.contentHash !== admitted.source.contentHash || root.data.sizeBytes !== admitted.source.sizeBytes)
    fail("source_mismatch", "Admission and the current original authorization name different bytes.");
  const ctx: Context = { toolRoot: await approvedRoot(request.toolRoot), hooks: request.hooks };
  const source = await openAnchor(await exactLocation(request.sourcePath, "source_location_invalid"), "source_location_invalid", MAX_STAGED_SOURCE_BYTES);
  try {
    if (source.contentHash !== root.data.contentHash || source.sizeBytes !== root.data.sizeBytes) fail("source_mismatch", "The source is not the current authorized exact bytes.");
    const measured = await factsOf(ctx, source, "source_changed", false);
    losslessMeasuredBounds(measured);
    const chroma = await losslessChromaOf(ctx, source, measured, false);
    const planning = planChromaSafeReencode({ source: anchorIdentity(source), sourceFacts: measured.facts, sourceChroma: chroma });
    if (planning.outcome !== "PLAN" || !planning.plan || !sameObserved(admitted, planning.plan))
      fail("plan_compiler_conflict", "Fresh complete chroma admission must equal the trusted source witness.");
    await reconfirm(source, "source_changed");
    const result = await use({ ctx, request, source, measured, plan: planning.plan });
    await reconfirm(source, "source_changed"); return result;
  } catch (error) {
    if (error instanceof CanonicalIngestError) throw error;
    throw new CanonicalIngestError("unexpected_failure", "The bounded lossless operation stopped without publication.");
  } finally { await source.handle.close().catch(() => undefined); }
}
/** Exact old packet/sample-duration compiler, over fresh measured packet bounds; no caller durations or codec options. */
function losslessAudioFilters(measured: FreshFacts, plan: ChromaSafeReencodePlan["samplePlan"]): string[] {
  const a = measured.facts.streams.find(s => s.kind === "audio"), rebase = plan.operations.find(o => o.op === "REBASE_TIMELINE_ZERO");
  const retime = plan.operations.some(o => o.op === "RETIME_AUDIO_CONTIGUOUS");
  if (!a || (!retime && !rebase)) return [];
  // PCM copy is proved; this checkpoint does not admit new PCM RETIME behavior.
  if (a.codec === "pcm_s16le" && retime) fail("audio_retime_execution_conflict", "PCM retiming has no new execution evidence.");
  const offset = rebase?.offsets.find(o => o.streamIndex === a.index)?.offsetTicks ?? 0;
  const packets = measured.packets.filter(p => p.streamIndex === a.index), frames = new Map(a.frames.map(f => [f.pts, f.samples]));
  const full = a.frames.reduce((n, f) => Math.max(n, f.samples), 0);
  const samples = packets.map(p => {
    if (a.codec === "pcm_s16le") {
      const count = p.size / (2 * a.channels);
      if (!Number.isSafeInteger(count) || count <= 0 || (frames.has(p.pts) && frames.get(p.pts) !== count))
        fail("audio_retime_execution_conflict", "PCM packet sample counts differ from the exact decoded mapping.");
      return count;
    }
    const observed = frames.get(p.pts); if (observed !== undefined) return observed;
    if (p.pts < a.frames[0]!.pts && p.duration === full) return full;
    return fail("audio_retime_execution_conflict", "An AAC packet lacks its exact decoded sample mapping.");
  });
  if (!packets.length) fail("audio_retime_execution_conflict", "An audio plan has no retained packets.");
  const runs: { start: number; samples: number }[] = [];
  samples.forEach((count, index) => { if (index === 0 || count !== samples[index - 1]) runs.push({ start: index, samples: count }); });
  const duration = (lo: number, hi: number): string => {
    if (lo + 1 === hi) return String(runs[lo]!.samples);
    const mid = Math.floor((lo + hi) / 2);
    return "if(lt(N\\," + runs[mid]!.start + ")\\," + duration(lo, mid) + "\\," + duration(mid, hi) + ")";
  };
  const start = packets[0]!.pts - offset, startDts = packets[0]!.dts - offset;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(startDts)) fail("audio_retime_execution_conflict", "Audio timestamp subtraction exceeds exact integers.");
  const pts = retime ? "if(eq(N\\,0)\\," + start + "\\,PREV_OUTPTS+PREV_OUTDURATION)" : "PTS-" + offset;
  const dts = retime ? "if(eq(N\\,0)\\," + startDts + "\\,PREV_OUTDTS+PREV_OUTDURATION)" : "DTS-" + offset;
  return ["setts=pts=" + pts + ":dts=" + dts + ":duration=" + duration(0, runs.length)];
}
/** Private closed compiler. The only production callers obtain this plan and measurements inside withLosslessSource. */
function losslessArgv(measured: FreshFacts, supplied: ChromaSafeReencodePlan, bound: number): string[] {
  const plan = ChromaSafeReencodePlanSchema.parse(supplied), p = plan.samplePlan;
  if (!sameObserved(measured.facts, plan.sourceFacts)) fail("plan_compiler_conflict", "The compiler requires its freshly measured complete source facts.");
  const v = measured.facts.streams.find((s): s is VideoStreamFacts => s.kind === "video")!, a = measured.facts.streams.find(s => s.kind === "audio");
  const filters: string[] = [...LOSSLESS_D4_FILTERS[p.transform], "setsar=1", "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709"];
  const rebase = p.operations.find(o => o.op === "REBASE_TIMELINE_ZERO"), snap = p.operations.find(o => o.op === "SNAP_VIDEO_TIMESTAMPS");
  if (rebase) filters.push("setpts=PTS-" + (rebase.offsets.find(o => o.streamIndex === v.index)?.offsetTicks ?? 0));
  if (snap) filters.push("settb=expr=1/" + snap.outputTimeBase.denominator, "setpts=N*" + snap.gridPeriodTicks);
  const audio = losslessAudioFilters(measured, p);
  // SELECT is compiled by explicit maps. DECLARE_SQUARE is exactly the fixed setsar=1, separately freshly verified in both carriers.
  const argv = ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "verbose", "-benchmark", "-copyts", "-filter_threads", "1", "-threads", "1",
    "-noautorotate", "-display_rotation:v:0", "0", "-protocol_whitelist", "fd", "-fd", "3", "-i", "fd:",
    "-map", "0:" + p.streams.videoIndex, ...(p.streams.audioIndex === null ? [] : ["-map", "0:" + p.streams.audioIndex, "-c:a", "copy"]),
    "-vf", filters.join(","), "-noautoscale", "-c:v", "libx264", "-qp", "0", "-preset", "medium", "-profile:v", "high444", "-pix_fmt", "+yuv420p",
    "-threads:v", "2", "-bf", "0", "-g", "30", "-sc_threshold", "0", "-x264-params", "lookahead-threads=1:sliced-threads=0", "-a53cc", "0", "-udu_sei", "0",
    "-color_range", "tv", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-fps_mode", "passthrough",
    "-enc_time_base:v", "1:" + p.videoTiming.outputTimeBase.denominator, "-video_track_timescale", String(p.videoTiming.outputTimeBase.denominator),
    ...(audio.length ? ["-bsf:a", audio.join(",")] : []), "-map_metadata", "-1", "-map_chapters", "-1", "-avoid_negative_ts", "disabled",
    "-fflags", "+bitexact", "-fs", String(bound), "-f", a?.codec === "pcm_s16le" ? "mov" : "mp4", "-protocol_whitelist", "fd", "-fd", "4", "fd:"];
  if (argv.join(" ").length > CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumArgvCharacters) fail("plan_compiler_conflict", "The complete compiler invocation exceeds its resource bound.");
  return argv;
}
/** Read-only compiler inspection. Serialized plans cannot reach it; returned argv is review data, never a spawn capability. */
export async function compileCanonicalLosslessLocalMedia(input: CanonicalIngestRequest, admission: unknown): Promise<{ plan: ChromaSafeReencodePlan; argv: string[] }> {
  return withLosslessSource(input, admission, async ({ request, measured, plan }) => ({ plan: structuredClone(plan),
    argv: losslessArgv(measured, plan, request.maxOutputBytes ?? CANONICAL_LOSSLESS_RUNTIME_BOUNDS.defaultOutputBytes) }));
}
interface LosslessTemporaryState extends LosslessSourceContext {
  output: Anchor; directory: string; argv: string[]; elapsedMilliseconds: number;
  verificationStarted: boolean; prepublication: CanonicalLosslessPrepublicationHandle | null;
}
const LOSSLESS_TEMPORARY_CONSTRUCTION = Symbol("scoped-held-lossless-temporary");
const LOSSLESS_TEMPORARIES = new WeakMap<CanonicalLosslessTemporaryHandle, LosslessTemporaryState>();
/** Encoded bytes are NOT a verified canonical result. No store, computation publication or authorization is created. */
export class CanonicalLosslessTemporaryHandle {
  constructor(token: symbol, state: LosslessTemporaryState) {
    if (token !== LOSSLESS_TEMPORARY_CONSTRUCTION) fail("request_invalid", "active_lossless_temporary_required: only a scoped held encode can mint this handle.");
    LOSSLESS_TEMPORARIES.set(this, state); Object.freeze(this);
  }
}
function losslessTemporaryState(handle: unknown): LosslessTemporaryState {
  const state = handle instanceof CanonicalLosslessTemporaryHandle ? LOSSLESS_TEMPORARIES.get(handle) : undefined;
  if (!state) fail("request_invalid", "active_lossless_temporary_required: a record is not active held media.");
  return state;
}
/** Execution-only path is confined to this temporary's active callback. A snapshot cannot mint authority or survive closure. */
export function canonicalLosslessTemporaryOf(handle: unknown) {
  const state = losslessTemporaryState(handle);
  return { state: "ENCODED_UNVERIFIED" as const, plan: structuredClone(state.plan), argv: [...state.argv],
    source: anchorIdentity(state.source), output: anchorIdentity(state.output), outputPath: state.output.path, elapsedMilliseconds: state.elapsedMilliseconds };
}
/** Add only stricter limits to the accepted supervisor. Any overflow/conversion/pipe error requests termination and requires close. */
async function superviseLosslessEncode(child: LosslessManagedChild, pending: FileHandle, timeout: number, bound: number): Promise<CanonicalProcessRun> {
  let stdoutBytes = 0, diagnosticBytes = 0, tail = "", stopped = false, closed = false, checking = false;
  const stop = () => {
    if (stopped || closed) return; stopped = true;
    child.emit("error", Object.assign(new Error("bounded_lossless_process_failed"), { code: "LOSSLESS_RESOURCE_OR_PIPE" }));
  };
  child.stdout?.on("data", (b: Buffer) => { stdoutBytes += b.length; if (stdoutBytes > CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumEncodeStdoutBytes) stop(); });
  child.stderr?.on("data", (b: Buffer) => {
    diagnosticBytes += b.length;
    if (diagnosticBytes > CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumDiagnosticBytes) { stop(); return; }
    const text = tail + b.toString("utf8");
    if (/auto_scale|auto-inserting filter/.test(text)) stop();
    tail = text.slice(-128);
  });
  child.stdout?.on("error", stop); child.stderr?.on("error", stop);
  child.on("close", () => { closed = true; });
  const monitor = setInterval(() => {
    if (checking || closed || stopped) return; checking = true;
    void pending.stat({ bigint: true }).then(s => { if (s.size > BigInt(bound)) stop(); }, stop).finally(() => { checking = false; });
  }, CANONICAL_LOSSLESS_RUNTIME_BOUNDS.outputMonitorMilliseconds);
  try { return await supervise(child, timeout, CANONICAL_LOSSLESS_RUNTIME_BOUNDS.maximumEncodeStdoutBytes); }
  finally { clearInterval(monitor); }
}
/** Scoped exclusive TEMPORARY executor only. No caller output path; original source descriptors are read-only.
 * Visitor runs over ENCODED_UNVERIFIED bytes. D's separate verifier must succeed before any prepublication witness is minted. */
export async function withCanonicalLosslessTemporary<T>(input: CanonicalIngestRequest, admission: unknown,
  visitor: (handle: CanonicalLosslessTemporaryHandle) => Promise<T>): Promise<T> {
  if (typeof visitor !== "function") fail("request_invalid", "A scoped temporary visitor is required.");
  return withLosslessSource(input, admission, state => withTrustedLosslessTemporary(state, visitor));
}
/** Private seam: the public route retains its own snapshotted request and original held source. */
async function withTrustedLosslessTemporary<T>(state: LosslessSourceContext, visitor: (handle: CanonicalLosslessTemporaryHandle) => Promise<T>, strictCleanup = false): Promise<T> {
    const { source, request, measured, plan, ctx } = state;
    const workspace = await exactLocation(request.workspaceRoot, "store_location_invalid");
    if (!(await lstat(workspace)).isDirectory() || workspace.length > MAX_WORKSPACE_PATH_LENGTH) fail("store_location_invalid", "A bounded real temporary workspace is required.");
    const bound = request.maxOutputBytes ?? CANONICAL_LOSSLESS_RUNTIME_BOUNDS.defaultOutputBytes, argv = losslessArgv(measured, plan, bound);
    const free = await losslessFilesystem(workspace, { bigint: true });
    if (free.bavail * free.bsize < BigInt(bound)) fail("output_invalid", "The explicit lossless output reservation exceeds available workspace storage.");
    const parent = await ownedDirectory(workspace, ".local-runs"), directory = join(parent, "ci-lossless-cd-" + randomBytes(16).toString("hex"));
    await mkdir(directory);
    const directoryIdentity = await lstat(directory, { bigint: true });
    let pending: FileHandle | null = null, output: Anchor | null = null, handle: CanonicalLosslessTemporaryHandle | null = null;
    let exclusiveOutputIdentity: { dev: bigint; ino: bigint } | null = null;
    const outputPath = join(directory, "candidate." + (argv[argv.indexOf("-f") + 1] === "mov" ? "mov" : "mp4"));
    try {
      pending = await open(outputPath, "wx+");
      const initial = await pending.stat({ bigint: true });
      exclusiveOutputIdentity = { dev: initial.dev, ino: initial.ino };
      if (!initial.isFile() || initial.size !== 0n || (initial.dev === source.dev && initial.ino === source.ino)) fail("output_invalid", "The exclusive output must be a new regular object distinct from its source.");
      const inputReader = await reader(source, "source_changed");
      let run: ProcessRun;
      const start = performance.now();
      try {
        await hook(ctx.hooks.beforeProcess === undefined ? undefined : () => ctx.hooks.beforeProcess!({ role: "canonicalize" }));
        await reconfirm(source, "source_changed");
        const binary = await pinned(ctx.toolRoot, "ffmpeg");
        const boundedEncodeTimeout = losslessRemainingTime(ctx, request.canonicalizationTimeout);
        const child = spawn(binary.path, argv, { shell: false, windowsHide: true, cwd: ctx.toolRoot, env: minimalEnvironment(),
          stdio: ["ignore", "pipe", "pipe", inputReader.fd, pending.fd] });
        run = await superviseLosslessEncode(child, pending, boundedEncodeTimeout, bound);
        if (await hashHandle(inputReader, source.sizeBytes) !== source.contentHash) fail("source_changed", "The source changed during lossless encoding.");
      } finally { await inputReader.close().catch(() => undefined); }
      requireCompleted(run, "lossless encoding");
      await reconfirm(source, "source_changed"); await pending.sync();
      const written = Number((await pending.stat({ bigint: true })).size);
      if (!Number.isSafeInteger(written) || written <= 0 || written > bound) fail("output_invalid", "The encoded temporary is empty or exceeds its exact byte budget.");
      const contentHash = await hashHandle(pending, written);
      if (!contentHash) fail("output_invalid", "The encoded temporary could not be read whole.");
      output = { path: outputPath, handle: pending, dev: initial.dev, ino: initial.ino, sizeBytes: written, contentHash };
      await reconfirm(output, "output_invalid");
      handle = new CanonicalLosslessTemporaryHandle(LOSSLESS_TEMPORARY_CONSTRUCTION, { ...state, output, directory, argv, elapsedMilliseconds: performance.now() - start, verificationStarted: false, prepublication: null });
      const result = await visitor(handle);
      await reconfirm(source, "source_changed"); await reconfirm(output, "output_invalid");
      return result;
    } finally {
      if (handle) {
        const scoped = LOSSLESS_TEMPORARIES.get(handle);
        if (scoped?.prepublication) LOSSLESS_PREPUBLICATIONS.delete(scoped.prepublication);
        LOSSLESS_TEMPORARIES.delete(handle);
      }
      if (pending) await pending.close().catch(() => { if (strictCleanup) fail("store_unavailable", "The owned temporary handle could not be closed."); });
      // Never remove a replacement object or recurse over owner data.
      if (strictCleanup) await assertNoLinks(directory, "output_invalid");
      const named = await lstat(outputPath, { bigint: true }).catch(() => null);
      if (named && exclusiveOutputIdentity && named.dev === exclusiveOutputIdentity.dev && named.ino === exclusiveOutputIdentity.ino && !named.isSymbolicLink()) await unlink(outputPath);
      else if (named) fail("output_invalid", "A replacement temporary cannot be removed or trusted.");
      const namedDirectory = await lstat(directory, { bigint: true }).catch(() => null);
      if (namedDirectory && namedDirectory.dev === directoryIdentity.dev && namedDirectory.ino === directoryIdentity.ino && !namedDirectory.isSymbolicLink())
        await removeLosslessDirectory(directory).catch(() => { if (strictCleanup) fail("store_unavailable", "The owned temporary directory could not be removed."); });
      else if (strictCleanup && namedDirectory) fail("output_invalid", "A replacement temporary directory cannot be removed.");
    }
}

 // ---------------------------------------------------------------- C–D paired decoder verification: three full-frame slots, backpressured pipes, terminal close required
import { ExactYuv420pVerifier, ExactPixelVerificationError, boundedYuv420pFrameBytes, type ExactPixelVerificationConfig } from "../packages/media-ingest/pixels.js";
import { type ExactPixelVerification } from "../packages/media-ingest/reencode.js";
export const CANONICAL_LOSSLESS_STREAM_BOUNDS = Object.freeze({
  maximumReadBytes: 65536, maximumPipeHighWaterMarkBytes: 65536, maximumQueuedBytesPerDecoder: 131072,
  maximumDiagnosticBytesPerDecoder: 2 * 1024 * 1024, maximumVerificationUtf8Bytes: 24 * 1024 * 1024,
} as const);
interface LosslessDecodedPipe {
  readonly readableLength: number; readonly readableHighWaterMark: number;
  read(size: number): Buffer | null;
  destroy(): unknown;
  on(event: "readable" | "end" | "close", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}
export interface CanonicalStreamingChild {
  stdout: LosslessDecodedPipe | null;
  stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown; on(event: "error", listener: (error: Error) => void): unknown } | null;
  on(event: "spawn", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  kill(): boolean;
}
type LosslessManagedChild = CanonicalChild & CanonicalStreamingChild & { emit(event: "error", error: Error): boolean };
export interface CanonicalLosslessStreamingResources {
  maximumFullFrameBuffers: 3; decodedFrameBufferBytes: number; digestBufferBytes: number;
  maximumQueuedBytesPerDecoder: 131072; maximumReadBytes: 65536;
  sourceQueuePeakBytes: number; outputQueuePeakBytes: number;
  sourceDecodedBytes: number; outputDecodedBytes: number;
}
export interface CanonicalLosslessStreamingResult { pixels: ExactPixelVerification; resources: CanonicalLosslessStreamingResources }
interface LosslessDecoderState {
  child: CanonicalStreamingChild; spawned: boolean; closed: boolean; killed: boolean; ended: boolean;
  wake: (() => void) | null; queuePeak: number; decodedBytes: number; diagnostics: number;
}
/** Supervises two ALREADY-created children for controlled process tests, as the older single-child supervisor does.
 * This function starts nothing and its returned data cannot mint a trusted temporary/prepublication handle.
 * Only the private held-byte caller below starts decoders and can bind these measurements to media. */
export async function verifyCanonicalLosslessDecodedChildren(source: CanonicalStreamingChild, output: CanonicalStreamingChild,
  config: ExactPixelVerificationConfig, limits: { timeoutMilliseconds: number; terminationGraceMilliseconds: number }): Promise<CanonicalLosslessStreamingResult> {
  let accumulator: ExactYuv420pVerifier;
  try {
    if (!limits || Object.keys(limits).sort().join(",") !== "terminationGraceMilliseconds,timeoutMilliseconds"
      || ![limits.timeoutMilliseconds, limits.terminationGraceMilliseconds].every(n => Number.isSafeInteger(n) && n > 0)
      || limits.timeoutMilliseconds > HARD.digestTimeoutMilliseconds || limits.terminationGraceMilliseconds > HARD.terminationGraceMilliseconds)
      fail("request_invalid", "Invalid bounded paired-decoder limits.");
    if (!source.stdout || !source.stderr || !output.stdout || !output.stderr) fail("process_failed", "Complete decoder pipes are required.");
  } catch (error) {
    if (error instanceof CanonicalIngestError) throw error;
    fail("verification_failed", "The exact decoder configuration exceeds its numeric, geometry or allocation bound.");
  }
  const states: LosslessDecoderState[] = [source, output].map(child => ({ child, spawned: false, closed: false, killed: false, ended: false,
    wake: null, queuePeak: 0, decodedBytes: 0, diagnostics: 0 }));
  let failure: CanonicalIngestError | null = null, terminalWake: (() => void) | null = null, settled = false;
  const wakeAll = () => { for (const state of states) { const wake = state.wake; state.wake = null; wake?.(); } const wake = terminalWake; terminalWake = null; wake?.(); };
  const terminate = (state: LosslessDecoderState) => {
    if (state.closed || state.killed || !state.spawned) return; state.killed = true;
    try { state.child.kill(); } catch { /* still require terminal close within the grace */ }
    // On failure, a paused unread stdout must not postpone child close indefinitely. No bytes from this pipe can become evidence.
    state.child.stdout!.destroy();
  };
  const abort = (code: CanonicalIngestErrorCode, message: string) => {
    if (settled) return;
    if (failure === null) failure = new CanonicalIngestError(code, message);
    for (const state of states) terminate(state);
    wakeAll();
  };
  const observeQueue = (state: LosslessDecoderState) => {
    const length = state.child.stdout!.readableLength;
    if (!Number.isSafeInteger(length) || length < 0 || length > CANONICAL_LOSSLESS_STREAM_BOUNDS.maximumQueuedBytesPerDecoder)
      abort("process_failed", "A decoder exceeded the bounded backpressured queue.");
    state.queuePeak = Math.max(state.queuePeak, length);
  };
  for (const state of states) {
    const child = state.child, pipe = child.stdout!;
    pipe.on("readable", () => { observeQueue(state); const wake = state.wake; state.wake = null; wake?.(); });
    pipe.on("end", () => { state.ended = true; wakeAll(); });
    pipe.on("close", () => { if (!state.ended) abort("process_failed", "A decoder stdout pipe closed before complete EOF."); wakeAll(); });
    pipe.on("error", () => abort("process_failed", "A decoder stdout pipe failed."));
    child.stderr!.on("data", (chunk: Buffer) => {
      state.diagnostics += chunk.length;
      if (state.diagnostics > CANONICAL_LOSSLESS_STREAM_BOUNDS.maximumDiagnosticBytesPerDecoder)
        abort("process_failed", "A decoder exceeded its diagnostic drain bound.");
    });
    child.stderr!.on("error", () => abort("process_failed", "A decoder stderr pipe failed."));
    child.on("spawn", () => { state.spawned = true; if (failure) terminate(state); });
    child.on("error", () => abort("process_failed", state.spawned ? "A decoder failed after spawn." : "A pinned decoder could not spawn."));
    child.on("close", (code, signal) => {
      state.closed = true;
      if (!state.spawned || code !== 0 || signal !== null) abort("process_failed", "A decoder did not exit successfully after a confirmed spawn.");
      wakeAll();
    });
  }
  const timer = setTimeout(() => abort("process_timeout", "The complete paired decode exceeded its operation deadline."), limits.timeoutMilliseconds);
  const check = () => { if (failure !== null) throw failure; };
  const nextChunk = async (state: LosslessDecoderState, wanted: number): Promise<Buffer | null> => {
    while (true) {
      check(); observeQueue(state); check();
      const chunk = state.child.stdout!.read(Math.min(wanted, CANONICAL_LOSSLESS_STREAM_BOUNDS.maximumReadBytes));
      if (chunk !== null) {
        if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > Math.min(wanted, CANONICAL_LOSSLESS_STREAM_BOUNDS.maximumReadBytes))
          fail("process_failed", "A decoder violated the bounded binary read contract.");
        state.decodedBytes += chunk.length; observeQueue(state); check(); return chunk;
      }
      if (state.ended) return null;
      await new Promise<void>(resolve => { state.wake = resolve; });
    }
  };
  const fillFrame = async (state: LosslessDecoderState, buffer: Buffer) => {
    let at = 0;
    while (at < buffer.length) {
      const chunk = await nextChunk(state, buffer.length - at);
      if (chunk === null) fail("verification_failed", at === 0 ? "Premature decoded frame EOF." : "A trailing decoded frame is incomplete.");
      chunk.copy(buffer, at); at += chunk.length;
    }
  };
  let sourceFrame: Buffer | null = null, outputFrame: Buffer | null = null;
  try {
    accumulator = new ExactYuv420pVerifier(config);
    for (const state of states) if (state.child.stdout!.readableHighWaterMark > CANONICAL_LOSSLESS_STREAM_BOUNDS.maximumPipeHighWaterMarkBytes)
      fail("process_failed", "A decoder pipe exceeds the explicit high-water bound.");
    sourceFrame = Buffer.alloc(boundedYuv420pFrameBytes(config.sourceGeometry));
    outputFrame = Buffer.alloc(boundedYuv420pFrameBytes(config.outputGeometry));
    for (let index = 0; index < config.frameCount; index++) {
      await fillFrame(states[0]!, sourceFrame); await fillFrame(states[1]!, outputFrame);
      accumulator.compare(index, sourceFrame, outputFrame);
      check();
    }
    // A single surplus byte is sufficient to reject both extra complete frames and partial trailing frames.
    for (const state of states) if (await nextChunk(state, 1) !== null) fail("verification_failed", "The decoder produced surplus frame samples.");
    while (!states.every(state => state.closed)) { check(); await new Promise<void>(resolve => { terminalWake = resolve; }); }
    check();
    const pixels = accumulator.finish();
    if (Buffer.byteLength(canonicalSerialize(pixels), "utf8") > CANONICAL_LOSSLESS_STREAM_BOUNDS.maximumVerificationUtf8Bytes)
      fail("verification_failed", "The bounded verification metadata table is oversized.");
    return { pixels, resources: { maximumFullFrameBuffers: 3, decodedFrameBufferBytes: accumulator.bufferAccounting.frameBytes,
      digestBufferBytes: accumulator.bufferAccounting.digestBytes, maximumQueuedBytesPerDecoder: 131072, maximumReadBytes: 65536,
      sourceQueuePeakBytes: states[0]!.queuePeak, outputQueuePeakBytes: states[1]!.queuePeak,
      sourceDecodedBytes: states[0]!.decodedBytes, outputDecodedBytes: states[1]!.decodedBytes } };
  } catch (error) {
    if (error instanceof CanonicalIngestError) abort(error.code, error.message);
    else if (error instanceof ExactPixelVerificationError) abort("verification_failed", "Exact Y/U/V frame permutation, order or sample equality failed.");
    else abort("process_failed", "The bounded paired decoder operation failed.");
    // Do not detach a still-live companion decoder. Kill is requested once; only close confirms completion.
    if (!states.every(state => state.closed)) await new Promise<void>(resolve => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; clearTimeout(grace); terminalWake = null; resolve(); };
      const grace = setTimeout(finish, limits.terminationGraceMilliseconds);
      const wait = () => { if (states.every(state => state.closed)) finish(); else terminalWake = wait; };
      wait();
    });
    if (!states.every(state => state.closed)) fail("process_failed", "Decoder termination was not confirmed by terminal close.");
    throw failure ?? new CanonicalIngestError("process_failed", "The paired decoder operation failed.");
  } finally {
    settled = true; clearTimeout(timer); sourceFrame = null; outputFrame = null; wakeAll();
  }
}

 // ---------------------------------------------------------------- C–D held-byte proof: no canonical store/cache/derived authorization or public ingest routing
import { buildCanonicalReencodeDerivation } from "../packages/media-ingest/reencode.js";
import { buildChromaSafeDerivation, type ChromaSafeDerivation } from "../packages/media-ingest/chroma.js";
const losslessDecoderArgv = (videoIndex: number): string[] => [
  "-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-filter_threads", "1", "-threads", "1", "-noautorotate",
  "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3", "-i", "fd:", "-map", "0:" + videoIndex,
  "-fps_mode", "passthrough", "-noautoscale", "-pix_fmt", "+yuv420p", "-threads:v", "1",
  "-f", "rawvideo", "-protocol_whitelist", "fd", "-fd", "1", "fd:",
];
/** Each decoder has its own freshly re-hashed read-only reader AND independent full executable verification.
 * The shared deadline begins before both readers/pins/hooks, never resets for the slower companion. */
async function losslessHeldPixels(state: LosslessHeldVerificationContext): Promise<CanonicalLosslessStreamingResult> {
  const { source, output, ctx, request, plan } = state, start = performance.now();
  const sourceReader = await reader(source, "source_changed"); let outputReader: FileHandle | null = null;
  let sourceChild: LosslessManagedChild | null = null, paired = false;
  try {
    outputReader = await reader(output, "output_invalid");
    await hook(ctx.hooks.beforeProcess === undefined ? undefined : () => ctx.hooks.beforeProcess!({ role: "source_video_digest" }));
    await reconfirm(source, "source_changed");
    const sourceBinary = await pinned(ctx.toolRoot, "ffmpeg");
    await hook(ctx.hooks.beforeProcess === undefined ? undefined : () => ctx.hooks.beforeProcess!({ role: "output_video_digest" }));
    await reconfirm(output, "output_invalid"); await reconfirm(source, "source_changed");
    const outputBinary = await pinned(ctx.toolRoot, "ffmpeg");
    const remaining = Math.floor(losslessRemainingTime(ctx, request.canonicalizationTimeout - (performance.now() - start)));
    if (remaining < 1) fail("process_timeout", "The complete exact verification expired before decoder spawn.");
    const spawnDecoder = (binary: VerifiedBinary, videoIndex: number, descriptor: number) => spawn(binary.path, losslessDecoderArgv(videoIndex), {
      shell: false, windowsHide: true, cwd: ctx.toolRoot, env: minimalEnvironment(), stdio: ["ignore", "pipe", "pipe", descriptor] });
    sourceChild = spawnDecoder(sourceBinary, plan.samplePlan.streams.videoIndex, sourceReader.fd);
    const outputChild = spawnDecoder(outputBinary, 0, outputReader.fd);
    paired = true;
    const result = await verifyCanonicalLosslessDecodedChildren(sourceChild, outputChild, { sourceGeometry: plan.samplePlan.inputGeometry,
      outputGeometry: plan.samplePlan.outputGeometry, transform: plan.samplePlan.transform, frameCount: plan.samplePlan.videoTiming.frameCount },
      { timeoutMilliseconds: remaining, terminationGraceMilliseconds: HARD.terminationGraceMilliseconds });
    if (await hashHandle(sourceReader, source.sizeBytes) !== source.contentHash) fail("source_changed", "The source changed during exact verification.");
    if (await hashHandle(outputReader, output.sizeBytes) !== output.contentHash) fail("output_invalid", "The temporary changed during exact verification.");
    await reconfirm(source, "source_changed"); await reconfirm(output, "output_invalid");
    return result;
  } catch (error) {
    if (sourceChild && !paired) {
      // A synchronous companion-spawn failure still supervises and closes the first child.
      const stopped = await supervise(sourceChild, 1, 0);
      if (!stopped.terminationConfirmed) fail("process_failed", "The first decoder did not confirm termination after companion spawn failure.");
    }
    if (error instanceof CanonicalIngestError) throw error;
    throw new CanonicalIngestError("process_failed", "The pinned paired decoders could not complete.");
  } finally { await sourceReader.close().catch(() => undefined); await outputReader?.close().catch(() => undefined); }
}
export interface CanonicalLosslessPrepublicationProof {
  state: "VERIFIED_PREPUBLICATION"; derivation: ChromaSafeDerivation; resources: CanonicalLosslessStreamingResources;
  encoderArgv: string[]; encoderElapsedMilliseconds: number; elapsedMilliseconds: number;
}
const LOSSLESS_PREPUBLICATION_CONSTRUCTION = Symbol("scoped-exact-chroma-prepublication");
const LOSSLESS_PREPUBLICATIONS = new WeakMap<CanonicalLosslessPrepublicationHandle, { temporary: CanonicalLosslessTemporaryHandle; proof: CanonicalLosslessPrepublicationProof }>();
/** Internal proof of currently held temporary bytes. NO publication permission, cache record or derived media authorization. */
export class CanonicalLosslessPrepublicationHandle {
  constructor(token: symbol, temporary: CanonicalLosslessTemporaryHandle, proof: CanonicalLosslessPrepublicationProof) {
    if (token !== LOSSLESS_PREPUBLICATION_CONSTRUCTION) fail("request_invalid", "active_lossless_prepublication_required: only fresh complete held-byte verification can mint this handle.");
    LOSSLESS_PREPUBLICATIONS.set(this, { temporary, proof }); Object.freeze(this);
  }
}
/** Snapshot for review/tests, with fresh byte reconfirmation. Expires when the enclosing exclusive temporary callback closes. */
export async function canonicalLosslessPrepublicationOf(handle: unknown): Promise<CanonicalLosslessPrepublicationProof> {
  const entry = handle instanceof CanonicalLosslessPrepublicationHandle ? LOSSLESS_PREPUBLICATIONS.get(handle) : undefined;
  if (!entry || !LOSSLESS_TEMPORARIES.has(entry.temporary))
    fail("request_invalid", "active_lossless_prepublication_required: JSON or a closed temporary is not held media.");
  const state = losslessTemporaryState(entry.temporary);
  await reconfirm(state.source, "source_changed"); await reconfirm(state.output, "output_invalid");
  return structuredClone(entry.proof);
}
/** No caller facts, digests, argv or transforms. The only parameter is this runtime's still-active exclusive output handle.
 * Re-observe the authorized source, compare every decoded Y/U/V sample, then observe output facts/chroma and packet payloads.
 * Frozen 0.3/0.4 builders replay all geometry, signaling, carrier, timing/audio and identity checks before minting a scoped proof. */
export async function verifyCanonicalLosslessTemporary(handle: unknown): Promise<CanonicalLosslessPrepublicationHandle> {
  if (arguments.length !== 1) fail("request_invalid", "caller_evidence_refused: no supplied facts, digests or options are verification.");
  const state = losslessTemporaryState(handle), start = performance.now();
  if (state.verificationStarted) fail("request_invalid", "one_verification_per_temporary: concurrent or repeated proof construction exceeds the scoped resource policy.");
  state.verificationStarted = true;
  const verified = await verifyLosslessHeldObjects(state);
  const prepublication = new CanonicalLosslessPrepublicationHandle(LOSSLESS_PREPUBLICATION_CONSTRUCTION, handle as CanonicalLosslessTemporaryHandle, {
    state: "VERIFIED_PREPUBLICATION", derivation: verified.derivation, resources: verified.resources, encoderArgv: [...state.argv],
    encoderElapsedMilliseconds: state.elapsedMilliseconds, elapsedMilliseconds: performance.now() - start });
  state.prepublication = prepublication; return prepublication;
}
interface LosslessHeldVerificationContext extends LosslessSourceContext { output: Anchor }
/** Private shared verifier. Cached outputs are held store objects, never encoder temporaries or caller-supplied proof. */
async function verifyLosslessHeldObjects(state: LosslessHeldVerificationContext): Promise<{ derivation: ChromaSafeDerivation; resources: CanonicalLosslessStreamingResources }> {
  const { source, output, ctx, plan } = state;
  await reconfirm(source, "source_changed"); await reconfirm(output, "output_invalid");
  const freshSource = await factsOf(ctx, source, "source_changed", false); losslessMeasuredBounds(freshSource);
  const freshSourceChroma = await losslessChromaOf(ctx, source, freshSource, false);
  const freshPlan = planChromaSafeReencode({ source: anchorIdentity(source), sourceFacts: freshSource.facts, sourceChroma: freshSourceChroma });
  if (freshPlan.outcome !== "PLAN" || !sameObserved(freshPlan.plan, plan))
    fail("verification_failed", "Fresh complete source chroma admission no longer agrees with the executed plan.");
  const exact = await losslessHeldPixels(state);
  const measured = await factsOf(ctx, output, "output_invalid", true); losslessMeasuredBounds(measured);
  let outputChroma: CanonicalChromaObservation;
  try { outputChroma = await losslessChromaOf(ctx, output, measured, true); }
  catch (error) {
    if (error instanceof CanonicalIngestError && error.code === "source_changed") fail("output_invalid", "The internal output chroma carrier changed during observation.");
    if (error instanceof CanonicalIngestError) throw error;
    fail("verification_failed", "Fresh output chroma could not be established.");
  }
  const sourceAudio = freshSource.facts.streams.find(s => s.kind === "audio"), outputAudio = measured.facts.streams.find(s => s.kind === "audio");
  const audioPackets = sourceAudio === undefined ? null : {
    method: PLAN_VERIFICATION_METHODS.audioPackets,
    sourceDigest: await packetContentDigest(source, freshSource, sourceAudio.index, "source_changed"),
    outputDigest: outputAudio === undefined ? fail("verification_failed", "Copied audio is missing from the output.") : await packetContentDigest(output, measured, outputAudio.index, "output_invalid"),
  };
  let derivation: ChromaSafeDerivation;
  try {
    const sampleDerivation = buildCanonicalReencodeDerivation({ rootAuthorization: state.request.authorization, sourceFacts: freshSource.facts,
      plan: plan.samplePlan, output: { contentHash: output.contentHash, sizeBytes: output.sizeBytes, facts: measured.facts }, pixels: exact.pixels, audioPackets });
    derivation = buildChromaSafeDerivation({ sampleDerivation, plan, outputChroma });
  } catch { fail("verification_failed", "Exact sample/timing/audio/profile and explicit center output verification did not all pass."); }
  await reconfirm(source, "source_changed"); await reconfirm(output, "output_invalid");
  return { derivation, resources: exact.resources };
}

// ---------------------------------------------------------------- B2-B2 E–F trusted routing/publication/cache. No owner-media or render authority.
import { planCanonicalReencode } from "../packages/media-ingest/reencode.js";
import { chromaSafeComputationIdOf } from "../packages/media-ingest/chroma.js";
import { CANONICAL_LOSSLESS_RECORD_MAX_BYTES, CanonicalLosslessOutputFormatSchema, compactLosslessComputationRecordOf, parseLosslessComputationRecordBytes,
  type CanonicalLosslessComputationRecord, type CanonicalLosslessOutputFormat } from "../packages/media-ingest/lossless-record.js";
export interface CanonicalLosslessPublishedResult {
  outcome: "PUBLISHED_VERIFIED_NOT_AUTHORIZED"; renderAuthority: "not_registered";
  source: SourceIdentity; output: SourceIdentity; planning: CanonicalPlanningResult; chromaPlanning: ChromaPlanningResult;
  computationId: string; derivation: ChromaSafeDerivation; record: CanonicalLosslessComputationRecord;
  publication: "published_by_this_operation" | "existing_object_reverified"; cache: "miss" | "hit";
  resources: CanonicalLosslessStreamingResources;
}
const LOSSLESS_DEADLINES = new WeakMap<Context, number>();
function losslessRemainingTime(ctx: Context, limit: number): number {
  const deadline = LOSSLESS_DEADLINES.get(ctx), remaining = deadline === undefined ? limit : Math.min(limit, Math.floor(deadline - performance.now()));
  if (remaining < 1) fail("process_timeout", "The complete bounded lossless operation expired.");
  return remaining;
}
type StoreDirectoryIdentity = { path: string; dev: bigint; ino: bigint };
const LOSSLESS_STORES = new WeakMap<Store, StoreDirectoryIdentity[]>();
async function holdLosslessStore(store: Store): Promise<void> {
  const paths = [dirname(dirname(store.objects)), dirname(store.objects), store.objects, store.computations, store.pending], identities: StoreDirectoryIdentity[] = [];
  for (const path of paths) {
    await exactLocation(path, "store_location_invalid"); const s = await lstat(path, { bigint: true });
    if (!s.isDirectory()) fail("store_location_invalid", "The held store requires real directories.");
    identities.push({ path, dev: s.dev, ino: s.ino });
  }
  LOSSLESS_STORES.set(store, identities);
}
async function reconfirmLosslessStore(store: Store): Promise<void> {
  const identities = LOSSLESS_STORES.get(store);
  if (!identities) fail("store_location_invalid", "An internally held canonical store is required.");
  for (const d of identities) {
    await exactLocation(d.path, "store_location_invalid"); const s = await lstat(d.path, { bigint: true });
    if (!s.isDirectory() || s.dev !== d.dev || s.ino !== d.ino) fail("store_location_invalid", "A verified store directory was replaced.");
  }
}
/** ftyp is measured from held payload bytes; the frozen .mp4 object suffix is never the container observation. */
async function losslessOutputFormatOf(ctx: Context, output: Anchor): Promise<CanonicalLosslessOutputFormat> {
  const handle = await reader(output, "output_invalid"); let box: Buffer;
  try {
    const header = await readRange(handle, 0, 8), length = header.readUInt32BE(0);
    if (header.toString("latin1", 4, 8) !== "ftyp" || length < 20 || length > 80 || (length - 16) % 4 !== 0)
      fail("verification_failed", "The fixed output requires one bounded leading BMFF file-type box.");
    box = await readRange(handle, 0, length); await reconfirm(output, "output_invalid");
  } finally { await handle.close(); }
  const majorBrand = box.toString("latin1", 8, 12), compatibleBrands: string[] = [];
  for (let i = 16; i < box.length; i += 4) compatibleBrands.push(box.toString("latin1", i, i + 4));
  const run = await runOver(ctx, output, "output_invalid", "output_facts", "ffprobe", ["-hide_banner", "-loglevel", "error", "-threads", "1",
    "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3", "-show_entries", "stream=index,codec_type,codec_name,profile,pix_fmt", "-of", "json=compact=1", "-i", "fd:"],
    HARD.probeTimeoutMilliseconds, MAX_PROBE_OUTPUT_BYTES);
  requireCompleted(run, "output container/encoding verification");
  const videos = objectsOf(objectOf(JSON.parse(run.stdout.toString("utf8"))).streams).filter(s => s.codec_type === "video");
  const v = videos[0];
  if (videos.length !== 1 || v?.index !== 0) fail("verification_failed", "The fixed lossless output requires exactly its first video stream.");
  try { return CanonicalLosslessOutputFormatSchema.parse({ family: "iso_bmff", format: majorBrand === "qt  " ? "mov" : "mp4", majorBrand, compatibleBrands,
    fileTypeBoxDigest: createHash("sha256").update(box).digest("hex"), video: { codec: v.codec_name, profile: v.profile, pixelFormat: v.pix_fmt } }); }
  catch { fail("verification_failed", "The actual container and fixed H.264 profile are incompatible."); }
}
/** Narrow extension of the existing record publication helper: exclusive held inode, sync, no overwrite and precise cleanup. */
async function publishHeldLosslessRecord(store: Store, name: string, bytes: string): Promise<void> {
  if (Buffer.byteLength(bytes, "utf8") > CANONICAL_STORE.maxRecordBytes || CANONICAL_LOSSLESS_RECORD_MAX_BYTES !== CANONICAL_STORE.maxRecordBytes)
    fail("publication_conflict", "The unchanged computation-record byte bound is mandatory.");
  await reconfirmLosslessStore(store);
  const path = join(store.pending, randomBytes(16).toString("hex") + ".pending"), destination = join(store.computations, name);
  let pending: FileHandle | null = null, identity: { dev: bigint; ino: bigint } | null = null;
  try {
    pending = await open(path, "wx+"); const initial = await pending.stat({ bigint: true }); identity = { dev: initial.dev, ino: initial.ino };
    await pending.writeFile(bytes); await pending.sync();
    const subject: Anchor = { path, handle: pending, ...identity, sizeBytes: Buffer.byteLength(bytes), contentHash: createHash("sha256").update(bytes).digest("hex") };
    await reconfirm(subject, "publication_conflict"); await reconfirmLosslessStore(store);
    let linked = false;
    try { await link(path, destination); linked = true; } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") fail("store_unavailable", "No-overwrite record publication failed.");
    }
    const winner = await openAnchor(destination, "publication_conflict", CANONICAL_STORE.maxRecordBytes);
    try {
      if (winner.contentHash !== subject.contentHash || winner.sizeBytes !== subject.sizeBytes || (linked && (winner.dev !== subject.dev || winner.ino !== subject.ino)))
        fail("publication_conflict", "The computation-record winner differs in bytes or physical identity.");
      await reconfirm(subject, "publication_conflict"); await reconfirm(winner, "publication_conflict"); await reconfirmLosslessStore(store);
    } finally { await winner.handle.close(); }
  } catch (e) { if (e instanceof CanonicalIngestError) throw e; fail("store_unavailable", "The held computation-record publication stopped."); }
  finally {
    if (pending) await pending.close();
    await reconfirmLosslessStore(store);
    const named = await lstat(path, { bigint: true }).catch((e: { code?: string }) => { if (e.code === "ENOENT") return null; fail("store_unavailable", "Owned pending cleanup could not inspect its name."); });
    if (named) {
      if (!identity || named.isSymbolicLink() || named.dev !== identity.dev || named.ino !== identity.ino) fail("publication_conflict", "A replacement pending object cannot be removed.");
      await unlink(path).catch(() => fail("store_unavailable", "Owned pending cleanup failed."));
    }
  }
}
async function routeChromaSafeLossless(ctx: Context, request: Read, source: Anchor, measured: FreshFacts,
  classification: CanonicalClassification, planning: CanonicalPlanningResult): Promise<CanonicalIngestResult> {
  const base = { source: anchorIdentity(source), classification, planning };
  // Only the accepted B2-B1 bounded cases can cross this seam. All original v1 findings are retained in `planning`.
  const sample = planCanonicalReencode(measured.facts);
  if (sample.outcome !== "PLAN") { await reconfirm(source, "source_changed"); return { ...base, outcome: sample.outcome === "REFUSE" ? "REFUSE" : "DEFER" }; }
  if (!FootageAuthorizationRootSchema.safeParse(request.authorization).success) fail("canonicalization_consent_required", "Lossless routing requires the consenting original root.");
  const routed: Context = { ...ctx }; LOSSLESS_DEADLINES.set(routed, performance.now() + request.canonicalizationTimeout);
  losslessMeasuredBounds(measured);
  const chroma = await losslessChromaOf(routed, source, measured, false), chromaPlanning = planChromaSafeReencode({ source: base.source, sourceFacts: measured.facts, sourceChroma: chroma });
  if (chromaPlanning.outcome !== "PLAN" || !chromaPlanning.plan) {
    await reconfirm(source, "source_changed"); return { ...base, chromaPlanning, outcome: chromaPlanning.outcome === "REFUSE" ? "REFUSE" : "DEFER" };
  }
  if (measured.facts.streams.some(s => s.kind === "audio" && s.codec === "pcm_s16le") && chromaPlanning.plan.samplePlan.operations.some(o => o.op === "RETIME_AUDIO_CONTIGUOUS")) {
    await reconfirm(source, "source_changed"); return { ...base, chromaPlanning, outcome: "DEFER", deferredReason: "pcm_retime_unproved" };
  }
  await reconfirm(source, "source_changed");
  return executeLosslessStore({ ctx: routed, request, source, measured, plan: chromaPlanning.plan }, planning, chromaPlanning);
}
async function executeLosslessStore(state: LosslessSourceContext, planning: CanonicalPlanningResult, chromaPlanning: ChromaPlanningResult): Promise<CanonicalLosslessPublishedResult> {
  const { source, ctx, request, plan } = state, computationId = chromaSafeComputationIdOf({ plan });
  const store = await openStore(request.workspaceRoot, source.path); await holdLosslessStore(store);
  const record = await readRecord(store, computationId, plan);
  const verify = async (output: Anchor, code: "cache_corrupt" | "publication_conflict") => {
    try {
      await reconfirmLosslessStore(store);
      const outputFormat = await losslessOutputFormatOf(ctx, output);
      const preflight = await factsOf(ctx, output, "output_invalid", true); losslessMeasuredBounds(preflight);
      if (planCanonicalizationV1(preflight.facts).outcome !== "DIRECT") fail(code, "The actual stored output does not conform to Profile v1.");
      const proof = await verifyLosslessHeldObjects({ ...state, output });
      const projected = compactLosslessComputationRecordOf(proof.derivation, outputFormat);
      await reconfirm(source, "source_changed"); await reconfirm(output, code); await reconfirmLosslessStore(store);
      return { ...proof, projected };
    } catch (e) {
      if (e instanceof CanonicalIngestError && ["source_changed", "process_failed", "process_timeout", "runtime_binary_mismatch", "store_location_invalid", "request_invalid"].includes(e.code)) throw e;
      fail(code, "Fresh complete source/output media verification failed.");
    }
  };
  const finish = async (output: Anchor, verified: Awaited<ReturnType<typeof verify>>, stored: StoredRecord,
    cache: "miss" | "hit", publication: CanonicalLosslessPublishedResult["publication"]): Promise<CanonicalLosslessPublishedResult> => {
    await hook(ctx.hooks.beforePublication); await reconfirmLosslessStore(store); await assertNoLinks(source.path, "source_changed");
    const finalRecord = await readRecord(store, computationId, plan);
    if (finalRecord?.bytes !== stored.bytes || finalRecord.physical?.dev !== stored.physical?.dev || finalRecord.physical?.ino !== stored.physical?.ino)
      fail(cache === "hit" ? "cache_corrupt" : "publication_conflict", "The computation record changed before return.");
    await reconfirm(source, "source_changed"); await reconfirm(output, cache === "hit" ? "cache_corrupt" : "publication_conflict");
    losslessRemainingTime(ctx, request.canonicalizationTimeout);
    return { outcome: "PUBLISHED_VERIFIED_NOT_AUTHORIZED", renderAuthority: "not_registered", source: anchorIdentity(source), output: anchorIdentity(output),
      planning, chromaPlanning, computationId, derivation: verified.derivation, record: verified.projected.record, resources: verified.resources, publication, cache };
  };
  if (record) {
    const output = await openAnchor(join(store.objects, canonicalObjectName(record.outputHash)), "cache_corrupt", MAX_STAGED_SOURCE_BYTES);
    try {
      if (output.contentHash !== record.outputHash || output.sizeBytes !== record.outputSize) fail("cache_corrupt", "Cached bytes differ from the recorded identity.");
      const verified = await verify(output, "cache_corrupt");
      if (verified.projected.bytes !== record.bytes) fail("cache_corrupt", "The compact record differs from fresh complete media proof.");
      return await finish(output, verified, record, "hit", "existing_object_reverified");
    } finally { await output.handle.close(); }
  }
  return withTrustedLosslessTemporary(state, async temporary => {
    const witness = await verifyCanonicalLosslessTemporary(temporary), held = losslessTemporaryState(temporary);
    let live = LOSSLESS_PREPUBLICATIONS.get(witness);
    if (!live || live.temporary !== temporary) fail("publication_conflict", "Publication requires its active held prepublication capability.");
    const expected = compactLosslessComputationRecordOf(live.proof.derivation, await losslessOutputFormatOf(ctx, held.output));
    await held.output.handle.chmod(0o444); await held.output.handle.sync();
    await hook(ctx.hooks.beforePublication); await reconfirmLosslessStore(store); await reconfirm(source, "source_changed"); await reconfirm(held.output, "output_invalid");
    await assertNoLinks(held.output.path, "output_invalid");
    if (!LOSSLESS_PREPUBLICATIONS.has(witness)) fail("publication_conflict", "The live temporary verification scope expired.");
    const destination = join(store.objects, canonicalObjectName(held.output.contentHash)); let publication: CanonicalLosslessPublishedResult["publication"];
    try { await link(held.output.path, destination); publication = "published_by_this_operation"; } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") fail("store_unavailable", "No-overwrite canonical publication failed.");
      publication = "existing_object_reverified";
    }
    // No detached proof authorizes a store object. Release the temporary's large proof; freshly verify the actual winning object.
    LOSSLESS_PREPUBLICATIONS.delete(witness); held.prepublication = null; live = undefined;
    const output = await openAnchor(destination, "publication_conflict", MAX_STAGED_SOURCE_BYTES);
    try {
      if (output.contentHash !== held.output.contentHash || output.sizeBytes !== held.output.sizeBytes ||
        (publication === "published_by_this_operation" && (output.dev !== held.output.dev || output.ino !== held.output.ino))) fail("publication_conflict", "The content-addressed winner differs in bytes or inode.");
      const verified = await verify(output, "publication_conflict");
      if (verified.projected.bytes !== expected.bytes) fail("publication_conflict", "Published bytes do not reproduce the complete temporary computation.");
      await hook(ctx.hooks.beforePublication); await reconfirmLosslessStore(store); await reconfirm(source, "source_changed"); await reconfirm(output, "publication_conflict");
      await publishRecord(store, canonicalComputationRecordName(computationId), verified.projected.bytes, true);
      const stored = await readRecord(store, computationId, plan);
      if (!stored || stored.bytes !== verified.projected.bytes) fail("publication_conflict", "The computation publication differs from fresh media proof.");
      return await finish(output, verified, stored, "miss", publication);
    } finally { await output.handle.close(); }
  }, true);
}
