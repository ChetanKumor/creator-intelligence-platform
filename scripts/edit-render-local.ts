/**
 * The Gate-7 Batch-2B trusted real-execution boundary: the one local adapter that may probe the pinned media runtime, mint the
 * ephemeral trust handles, issue the non-serializable ExecutablePermit and spawn the pinned FFmpeg to render. It lives beside, and
 * never changes, the accepted Batch-2A runtime.
 *
 * - The runtime is only the owner-pinned build inside the approved tool root, re-verified by full SHA-256 immediately before every
 *   spawn. Nothing is ever looked up on PATH, no shell is used, and the child gets a minimal environment without PATH.
 * - FFmpeg never opens a path: each staged object is opened here, only where it resolves inside the runtime-owned staging
 *   namespace, verified in full through that handle, and the same handle is inherited by the child as `-fd N fd:` under an
 *   `fd`-only protocol whitelist. The output is a handle this adapter created exclusively. Handles are re-hashed after exit, so a
 *   change made after verification is detected.
 * - A permit is minted only from live trust handles made by this module and the fixture authority, is bound by the pure core to
 *   the claim and every fresh window, expires, is consumed on first use, and throws on serialization. The lifecycle authority is
 *   queried again when the permit is issued and when execution starts. The claim's single execution is consumed durably, by
 *   no-overwrite publication of an execution-start record, before the process starts.
 * - Output goes to a private exclusive pending file, is verified, sealed read-only and published content-addressed without
 *   overwrite, and only while its pending name is still the verified object; an occupied identity is reused only after full
 *   re-verification, and a corrupt one fails closed.
 * Raw diagnostics are never persisted: records carry their digest, size and a bounded path-free excerpt.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { link, lstat, mkdir, open, realpath, rm, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { EditRenderError, MAX_CAPTURED_DIAGNOSTIC_BYTES, MAX_PROBE_OUTPUT_BYTES, PINNED_MEDIA_RUNTIME, RealExecutionPolicySchema, argvDigestOf, buildExecutionStart,
  buildFailureReceipt, buildRealCapabilityProbe, buildRealRuntimeProbe, buildStagedInputConformance, buildSuccessReceipt, compileFfmpegArguments, compileRenderProgram,
  confirmPermitBindingCurrent, deriveAccounting, deriveOutputByteBound, deriveRenderTimeoutMilliseconds, diagnosticsOf, evaluateRealExecutionEvidence, parseBenchmark,
  sessionProofOf, stagedFor, type EditRenderErrorCode, type ExecutablePermitBinding, type FailureOutput, type Measurements, type ProcessEvidence, type RealCapabilityProbe,
  type RealExecutionPolicy, type RealRuntimeProbe, type RenderExecutionFailure, type RenderExecutionReceipt, type RenderExecutionStart, type RenderProgram,
  type StagedInputConformance } from "../packages/edit-render/index.js";
import { EditRuntimeError, ownedKey, type RuntimeCall, type StagedSourceReceipt } from "../packages/edit-runtime/index.js";
import { RuntimeArtifacts } from "../packages/edit-runtime/common.js";
import { checkMediaGrantAt, requireCall } from "../packages/edit-runtime/call.js";
import { checkGrantWindow, runtimeNow, verifyClaim } from "../packages/edit-runtime/ledger.js";
import { ReservationSchema, ROUTING_VERSION, type Reservation } from "../packages/routing/index.js";
import type { LocalEditRuntime } from "./edit-runtime-local.js";
import { TrustedLifecycleObservation } from "./edit-render-fixture-authority-local.js";

function fail(code: EditRenderErrorCode, message: string): never { throw new EditRenderError(code, message); }
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The approved tool root: the verified distribution directory, and nothing else. */
const APPROVED_TOOL_ROOT = resolve(PROJECT_ROOT, ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build");
const BINARY = { ffmpeg: join("bin", "ffmpeg.exe"), ffprobe: join("bin", "ffprobe.exe") } as const;
const STORE = { starts: "render-execution-starts", outputs: "render-outputs", pending: "render-pending", work: "render-work" } as const;
const within = (root: string, target: string) => { const path = relative(root, target); return path !== "" && !path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path); };
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

// ---------------------------------------------------------------- the pinned runtime: approved root, regular files, exact digests
interface VerifiedBinary { path: string; sha256: string; sizeBytes: number }
async function approvedRoot(toolRoot: unknown): Promise<string> {
  if (typeof toolRoot !== "string" || !isAbsolute(toolRoot) || toolRoot.includes("\0") || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(toolRoot) || toolRoot.startsWith("\\\\")) {
    fail("runtime_config_invalid", "The tool root must be an absolute local directory.");
  }
  let real: string, approved: string;
  try { real = await realpath(toolRoot); approved = await realpath(APPROVED_TOOL_ROOT); } catch { fail("runtime_config_invalid", "The tool root is not the approved pinned distribution."); }
  if (real !== approved) fail("runtime_config_invalid", "Only the approved pinned distribution directory is a tool root.");
  const info = await lstat(real);
  if (info.isSymbolicLink() || !info.isDirectory()) fail("runtime_config_invalid", "The tool root must be a real directory.");
  return real;
}
async function hashHandle(handle: FileHandle, sizeBytes: number): Promise<string> {
  const hash = createHash("sha256"), buffer = Buffer.alloc(1_048_576);
  let position = 0;
  while (position < sizeBytes) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, sizeBytes - position), position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
  }
  if (position !== sizeBytes) return "";
  return hash.digest("hex");
}
/** Opens exactly the regular file lstat found (no link, no replacement in between) and returns the handle with its size. */
async function openVerifiedFile(path: string, missing: EditRenderErrorCode, bad: EditRenderErrorCode): Promise<{ handle: FileHandle; sizeBytes: number; dev: bigint; ino: bigint }> {
  let info;
  try { info = await lstat(path, { bigint: true }); } catch { fail(missing, "The expected runtime-owned file does not exist."); }
  if (info.isSymbolicLink() || !info.isFile()) fail(bad, "Only a regular file, never a link or directory, is accepted.");
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) fail(bad, "Another file took the verified name.");
    return { handle, sizeBytes: Number(opened.size), dev: opened.dev, ino: opened.ino };
  } catch (error) { await handle.close().catch(() => undefined); throw error; }
}
async function verifyBinary(root: string, which: "ffmpeg" | "ffprobe"): Promise<VerifiedBinary> {
  const path = join(root, BINARY[which]);
  let real: string;
  try { real = await realpath(path); } catch { fail("runtime_binary_missing", `The pinned ${which} is missing from the approved tool root.`); }
  if (!within(root, real)) fail("runtime_config_invalid", `The pinned ${which} resolves outside the approved tool root.`);
  const opened = await openVerifiedFile(real, "runtime_binary_missing", "runtime_binary_not_regular");
  try { return { path: real, sizeBytes: opened.sizeBytes, sha256: await hashHandle(opened.handle, opened.sizeBytes) }; } finally { await opened.handle.close(); }
}
/** The digest and size the owner pinned; any other build is refused before it runs. */
async function reverifyPinned(root: string, which: "ffmpeg" | "ffprobe"): Promise<VerifiedBinary> {
  const binary = await verifyBinary(root, which), pinned = PINNED_MEDIA_RUNTIME[which];
  if (binary.sha256 !== pinned.sha256 || binary.sizeBytes !== pinned.sizeBytes) fail("runtime_binary_mismatch", `The ${which} binary is not the owner-pinned build.`);
  return binary;
}

// ---------------------------------------------------------------- the only spawn: exact binary, argv array, no shell, bounded capture
/**
 * One supervised pinned run. `spawnError` is set only when the child never started; `errorAfterSpawn` names an error reported after it
 * started, which proves nothing about its termination; `terminationConfirmed` is true only when a started child's close was observed.
 */
export interface ProcessRun { spawnError: string | null; errorAfterSpawn: string | null; exitCode: number | null; signal: string | null; timedOut: boolean;
  terminationConfirmed: boolean; stdout: Uint8Array; stdoutOverflow: boolean; stderr: Uint8Array; stderrTruncated: boolean; wallClockMilliseconds: number }
/** The outcome fields of one pinned run that decide whether it may become trusted evidence. */
export interface ProbeRunOutcome { spawnError: string | null; errorAfterSpawn: string | null; exitCode: number | null; signal: string | null; timedOut: boolean;
  terminationConfirmed: boolean; stdoutOverflow: boolean }
/**
 * Whether a fixed pinned query or probe ran to a completion that may become trusted evidence: it started, reported no error, closed by
 * itself with exit 0 and no signal inside its bound, its close was observed, and its required output did not overflow. A timed-out run is
 * never evidence, even if it later reports exit 0, and neither is an unconfirmed, errored or signaled one. (QC's rule for its own runs has
 * the same meaning.)
 */
export function completedProbeRun(run: ProbeRunOutcome): boolean {
  return run.spawnError === null && run.errorAfterSpawn === null && run.exitCode === 0 && run.signal === null && !run.timedOut && run.terminationConfirmed
    && !run.stdoutOverflow;
}
/**
 * The failure a pinned render run ends in, or null when it completed, in the order execution classifies it: a child that never started
 * is a spawn failure; a started child whose close was never observed ended unconfirmed, timed out or not; then the timeout, an error
 * reported after spawn (the run was interrupted, even if it closed), a signal and a nonzero exit.
 */
export function processFailureCodeOf(run: ProbeRunOutcome): EditRenderErrorCode | null {
  if (run.spawnError !== null) return "spawn_failed";
  if (!run.terminationConfirmed) return "process_termination_unconfirmed";
  if (run.timedOut) return "process_timeout";
  if (run.errorAfterSpawn !== null) return "execution_interrupted";
  if (run.signal !== null) return "process_signaled";
  if (run.exitCode !== 0) return "process_nonzero_exit";
  return null;
}
function minimalEnvironment(): Record<string, string> {
  const root = process.env["SystemRoot"];
  return root === undefined ? {} : { SystemRoot: root };
}
/** What supervision needs of an already-spawned pinned child: its output streams, a termination request and its completion events. */
export interface PinnedChild {
  stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown } | null;
  kill(): boolean;
  on(event: "spawn", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}
export interface PinnedProcessLimits { timeoutMilliseconds: number; terminationGraceMilliseconds: number; stdoutLimit: number }
/**
 * Supervises one already-spawned pinned child with bounded capture and a hard timeout. It never starts anything itself. Only the child's
 * spawn event proves it started: an error before it is a spawn failure, and no process exists. An error after it proves nothing about
 * termination. Termination is requested once, at the timeout or on an error after spawn, and only an observed close confirms it; if the
 * child has not closed within the bounded grace, termination is reported unconfirmed.
 */
export function supervisePinnedProcess(child: PinnedChild, limits: PinnedProcessLimits, started: number = performance.now()): Promise<ProcessRun> {
  return new Promise(done => {
    const out: Buffer[] = [], err: Buffer[] = [];
    let outBytes = 0, errBytes = 0, stdoutOverflow = false, stderrTruncated = false, timedOut = false, settled = false, spawned = false, terminationRequested = false;
    let errorAfterSpawn: string | null = null;
    const finish = (run: Pick<ProcessRun, "spawnError" | "exitCode" | "signal" | "terminationConfirmed">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ ...run, errorAfterSpawn, timedOut, stdout: Buffer.concat(out), stdoutOverflow, stderr: Buffer.concat(err), stderrTruncated,
        wallClockMilliseconds: Math.round(performance.now() - started) });
    };
    const terminate = () => {
      if (terminationRequested) return;
      terminationRequested = true;
      clearTimeout(timer);
      // A child asked to terminate must still close; if it does not, termination is reported unconfirmed and nothing is published.
      setTimeout(() => finish({ spawnError: null, exitCode: null, signal: null, terminationConfirmed: false }), limits.terminationGraceMilliseconds).unref();
      child.kill();
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, limits.timeoutMilliseconds);
    child.stdout?.on("data", (chunk: Buffer) => { outBytes += chunk.length; if (outBytes > limits.stdoutLimit) { stdoutOverflow = true; return; } out.push(chunk); });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (errBytes >= MAX_CAPTURED_DIAGNOSTIC_BYTES) { stderrTruncated = true; return; }
      const kept = chunk.subarray(0, MAX_CAPTURED_DIAGNOSTIC_BYTES - errBytes); errBytes += kept.length; err.push(kept); if (kept.length < chunk.length) stderrTruncated = true;
    });
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
function runPinned(binary: VerifiedBinary, argv: readonly string[], o: { inherit: readonly number[]; cwd: string; timeoutMilliseconds: number; stdoutLimit: number }): Promise<ProcessRun> {
  const started = performance.now();
  const child = spawn(binary.path, [...argv], { shell: false, windowsHide: true, cwd: o.cwd, env: minimalEnvironment(), stdio: ["ignore", "pipe", "pipe", ...o.inherit] });
  return supervisePinnedProcess(child, { timeoutMilliseconds: o.timeoutMilliseconds, terminationGraceMilliseconds: 10_000, stdoutLimit: o.stdoutLimit }, started);
}

// ---------------------------------------------------------------- runtime-owned render store under the claim's own runtime root
interface RenderStore { root: string; starts: string; outputs: string; pending: string; work: string }
async function openRenderStore(runtime: unknown): Promise<RenderStore> {
  const layout = (runtime as Partial<LocalEditRuntime> | null)?.layout;
  if (layout === undefined || typeof layout.root !== "string") fail("render_store_invalid", "Real execution needs the local runtime root that holds its claim.");
  const directory = async (name: string) => {
    const path = join(layout.root, name);
    try { await mkdir(path); } catch (error) { if ((error as { code?: string }).code !== "EEXIST") fail("render_storage_unavailable", "A render namespace could not be created."); }
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) fail("render_store_invalid", "A render namespace is not a real directory.");
    return path;
  };
  return Object.freeze({ root: layout.root, starts: await directory(STORE.starts), outputs: await directory(STORE.outputs), pending: await directory(STORE.pending),
    work: await directory(STORE.work) });
}
const startPath = (store: RenderStore, claimTargetId: string) => join(store.starts, `${ownedKey(claimTargetId, "execution_claim_target_v0")}.json`);
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true; } catch { return false; } }
/** No-overwrite publication of complete, synced bytes: exclusive pending file, sync, hard link to the final name. */
async function publishExclusive(store: RenderStore, final: string, bytes: Uint8Array): Promise<"published" | "exists"> {
  const pending = join(store.pending, `${randomBytes(16).toString("hex")}.pending`);
  const handle = await open(pending, "wx");
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await link(pending, final); return "published"; } catch (error) {
    if ((error as { code?: string }).code === "EEXIST") return "exists";
    fail("render_storage_unavailable", "No-overwrite publication is unavailable.");
  } finally { await unlink(pending).catch(() => undefined); }
}

// ---------------------------------------------------------------- trust handles
const RUNTIME = Symbol("trusted-media-runtime"), CONFORMANCE = Symbol("trusted-input-conformance"), PERMIT = Symbol("executable-permit");
/** Module-private readers, installed by the classes' static blocks; nothing outside this module can reach a handle's private state. */
let rootOfMedia: (media: TrustedMediaRuntime) => string;
let stateOfPermit: (permit: ExecutablePermit) => PermitState;
/**
 * A live, non-serializable proof that a runtime and capability probe of the exact pinned build was made here, for one claim. The
 * evidence is a private snapshot taken when the trusted probe built it; the public getters return copies, so mutating anything a
 * caller can reach never changes what this handle certifies.
 */
export class TrustedMediaRuntime {
  readonly #token: string;
  readonly #root: string;
  readonly #runtimeProbe: RealRuntimeProbe;
  readonly #capabilityProbe: RealCapabilityProbe;
  constructor(construction: symbol, root: string, runtimeProbe: RealRuntimeProbe, capabilityProbe: RealCapabilityProbe, token: string) {
    if (construction !== RUNTIME) fail("trust_handle_required", "A media runtime handle is produced only by the trusted probe.");
    this.#root = root; this.#token = token; this.#runtimeProbe = structuredClone(runtimeProbe); this.#capabilityProbe = structuredClone(capabilityProbe);
    Object.freeze(this);
  }
  static is(value: unknown): value is TrustedMediaRuntime { return typeof value === "object" && value !== null && #token in value; }
  /** A copy of the runtime probe record: data only, never this handle's evidence. */
  get runtimeProbe(): RealRuntimeProbe { return structuredClone(this.#runtimeProbe); }
  /** A copy of the capability probe record: data only, never this handle's evidence. */
  get capabilityProbe(): RealCapabilityProbe { return structuredClone(this.#capabilityProbe); }
  /** True only for a record equal to this handle's private snapshot and carrying its session proof. */
  proves(record: RealRuntimeProbe | RealCapabilityProbe): boolean {
    const own = record?.artifactType === "RealRuntimeProbe" ? this.#runtimeProbe : this.#capabilityProbe;
    return record?.session?.digest === sha256(this.#token) && canonicalSerialize(record) === canonicalSerialize(own);
  }
  static { rootOfMedia = media => media.#root; }
  toJSON(): never { fail("trust_handle_required", "A trusted runtime handle is never serialized; persist its records instead."); }
}
/** A live, non-serializable proof of one staged-input conformance probe; its evidence is a private snapshot, exposed only as copies. */
export class TrustedInputConformance {
  readonly #token: string;
  readonly #record: StagedInputConformance;
  constructor(construction: symbol, record: StagedInputConformance, token: string) {
    if (construction !== CONFORMANCE) fail("trust_handle_required", "A conformance handle is produced only by the trusted staged-input probe.");
    this.#record = structuredClone(record); this.#token = token;
    Object.freeze(this);
  }
  static is(value: unknown): value is TrustedInputConformance { return typeof value === "object" && value !== null && #token in value; }
  /** A copy of the conformance record: data only, never this handle's evidence. */
  get record(): StagedInputConformance { return structuredClone(this.#record); }
  /** True only for a record equal to this handle's private snapshot and carrying its session proof. */
  proves(record: StagedInputConformance): boolean {
    return record?.session?.digest === sha256(this.#token) && canonicalSerialize(record) === canonicalSerialize(this.#record);
  }
  toJSON(): never { fail("trust_handle_required", "A trusted conformance handle is never serialized; persist its record instead."); }
}
/** A private, per-operation working directory: the only current directory a pinned process ever gets. */
async function workingDirectory(store: RenderStore): Promise<string> {
  const path = join(store.work, randomBytes(16).toString("hex"));
  await mkdir(path);
  return path;
}

// ---------------------------------------------------------------- the real post-claim runtime and capability probe
export interface PinnedMediaRuntimeConfig { toolRoot: string }
const QUERY = ["-hide_banner", "-nostdin", "-loglevel", "error"] as const;
export async function probePinnedMediaRuntime(call: RuntimeCall, config: PinnedMediaRuntimeConfig): Promise<TrustedMediaRuntime> {
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  const { claim } = await verifyClaim(dag, runtime, ownership);
  const root = await approvedRoot(config?.toolRoot);
  const store = await openRenderStore(runtime), cwd = await workingDirectory(store);
  try {
    const checkStartedAt = runtimeNow(runtime);
    const ffmpeg = await verifyBinary(root, "ffmpeg"), ffprobe = await verifyBinary(root, "ffprobe");
    const ask = async (binary: VerifiedBinary, args: readonly string[]) => {
      const run = await runPinned(binary, args, { inherit: [], cwd, timeoutMilliseconds: 30_000, stdoutLimit: 1_048_576 });
      if (!completedProbeRun(run)) fail("runtime_probe_failed", "A fixed runtime query did not complete.");
      return new TextDecoder().decode(run.stdout);
    };
    // Only a build that is byte-for-byte the pinned one is ever asked anything.
    const trusted = ffmpeg.sha256 === PINNED_MEDIA_RUNTIME.ffmpeg.sha256 && ffprobe.sha256 === PINNED_MEDIA_RUNTIME.ffprobe.sha256;
    const listing = async (flag: string) => trusted ? ask(ffmpeg, [...QUERY, flag]) : "";
    const observation = { ffmpeg: { sha256: ffmpeg.sha256, sizeBytes: ffmpeg.sizeBytes, versionText: trusted ? await ask(ffmpeg, [...QUERY, "-version"]) : "",
      buildConfigurationText: trusted ? await ask(ffmpeg, [...QUERY, "-buildconf"]) : "" },
    ffprobe: { sha256: ffprobe.sha256, sizeBytes: ffprobe.sizeBytes, versionText: trusted ? await ask(ffprobe, ["-hide_banner", "-loglevel", "error", "-version"]) : "" },
    listings: { encoders: await listing("-encoders"), decoders: await listing("-decoders"), filters: await listing("-filters"), muxers: await listing("-muxers"),
      demuxers: await listing("-demuxers"), protocols: await listing("-protocols") }, platform: process.platform, arch: process.arch };
    if (!trusted) fail("runtime_binary_mismatch", "The binaries in the approved tool root are not the owner-pinned build.");
    const checkCompletedAt = runtimeNow(runtime);
    if (checkCompletedAt < checkStartedAt) fail("evidence_chronology_invalid", "The runtime clock ran backwards during the probe.");
    const timing = { checkStartedAt, observedAt: checkStartedAt, checkCompletedAt, observedAtBasis: "check_started_lower_bound" as const };
    const token = randomBytes(32).toString("hex"), session = sessionProofOf(token);
    const runtimeProbe = buildRealRuntimeProbe({ dag, claim, observation, timing, session });
    const capabilityProbe = buildRealCapabilityProbe({ dag, artifacts, claim, observation, timing, session });
    return new TrustedMediaRuntime(RUNTIME, root, runtimeProbe, capabilityProbe, token);
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- staged-input conformance over verified handles
const CONFORMANCE_ENTRIES = "stream=index,codec_type,codec_name,width,height,sample_aspect_ratio,pix_fmt,time_base,start_pts,sample_rate,channels,channel_layout"
  + ":stream_side_data=side_data_type,rotation:format=format_name:frame=stream_index,pts,nb_samples";
interface VerifiedInput { handle: FileHandle; sizeBytes: number; contentHash: string }
/**
 * Opens a staged object by its owned content key only, and verifies the full bytes through the very handle that will be handed on.
 * The object must be the runtime-owned one: its real path is the runtime root's real path joined with its owned relative location,
 * so no link or reparse point below the root (the staging namespace included) is ever followed, even to identical bytes.
 */
async function openStagedInput(call: RuntimeCall, stagedObjectId: string, expected: { contentHash: string; sizeBytes: number }): Promise<VerifiedInput> {
  const { runtime } = requireCall(call);
  const path = runtime.staging.locate(ownedKey(stagedObjectId, "staged_source_object_v0")).localPath;
  const root = (runtime as Partial<LocalEditRuntime> | null)?.layout?.root;
  if (typeof root !== "string") fail("render_store_invalid", "Real execution needs the local runtime root that owns its staged objects.");
  const owned = relative(root, path);
  let real: string, realRoot: string;
  try { real = await realpath(path); realRoot = await realpath(root); } catch { fail("staged_input_corrupt", "The staged object is not present in the runtime-owned namespace."); }
  if (owned === "" || owned.startsWith("..") || isAbsolute(owned) || real !== join(realRoot, owned)) {
    fail("staged_input_corrupt", "The staged object does not resolve inside the runtime-owned staging namespace.");
  }
  const opened = await openVerifiedFile(path, "staged_input_corrupt", "staged_input_corrupt");
  try {
    if (opened.sizeBytes !== expected.sizeBytes || await hashHandle(opened.handle, opened.sizeBytes) !== expected.contentHash) {
      fail("staged_input_corrupt", "The staged object's bytes are not the authorized bytes.");
    }
    return { handle: opened.handle, sizeBytes: opened.sizeBytes, contentHash: expected.contentHash };
  } catch (error) { await opened.handle.close().catch(() => undefined); throw error; }
}
export async function probeStagedInputs(call: RuntimeCall, media: TrustedMediaRuntime, staged: readonly StagedSourceReceipt[]): Promise<TrustedInputConformance[]> {
  if (!TrustedMediaRuntime.is(media)) fail("trust_handle_required", "Staged inputs are probed only with a trusted media runtime handle.");
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  const { claim } = await verifyClaim(dag, runtime, ownership);
  if (media.runtimeProbe.claim.claimId !== claim.claimId) fail("claim_mismatch", "The media runtime was probed for another claim.");
  const program = compileRenderProgram(dag, artifacts), root = rootOfMedia(media), store = await openRenderStore(runtime);
  const handles: TrustedInputConformance[] = [];
  for (const input of staged) {
    const receipt = stagedFor(dag, claim, input), slot = program.inputs.find(i => i.assetId === receipt.source.assetId);
    if (slot === undefined) fail("input_conformance_invalid", "The staged source is not an input of this program.");
    const cwd = await workingDirectory(store);
    try {
      const checkStartedAt = runtimeNow(runtime), ffprobe = await reverifyPinned(root, "ffprobe");
      const verified = await openStagedInput(call, slot.stagedObjectId, slot);
      let run: ProcessRun;
      try {
        run = await runPinned(ffprobe, ["-hide_banner", "-loglevel", "error", "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3", "-show_entries", CONFORMANCE_ENTRIES,
          "-of", "json=compact=1", "-i", "fd:"], { inherit: [verified.handle.fd], cwd, timeoutMilliseconds: 60_000, stdoutLimit: MAX_PROBE_OUTPUT_BYTES });
      } finally { await verified.handle.close(); }
      if (run.stdoutOverflow) fail("probe_output_oversized", "The staged-input probe output exceeds its bound.");
      if (!completedProbeRun(run)) fail("probe_output_invalid", "The staged-input probe did not complete.");
      const checkCompletedAt = runtimeNow(runtime);
      if (checkCompletedAt < checkStartedAt) fail("evidence_chronology_invalid", "The runtime clock ran backwards during the probe.");
      const token = randomBytes(32).toString("hex");
      const record = buildStagedInputConformance({ dag, claim, stagedSource: receipt, program, probeJson: new TextDecoder().decode(run.stdout),
        timing: { checkStartedAt, observedAt: checkStartedAt, checkCompletedAt, observedAtBasis: "check_started_lower_bound" }, session: sessionProofOf(token) });
      handles.push(new TrustedInputConformance(CONFORMANCE, record, token));
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
  return handles;
}

// ---------------------------------------------------------------- the ephemeral, non-serializable executable permit
/**
 * The permit's own call context, built once at issuance: the exact replay-validated DAG handle, runtime object and claim ownership read
 * from the caller's container, and a private copy of the supplied artifacts, validated as held. The caller's container is never
 * retained, so replacing or changing its members afterwards changes nothing the permit checks or uses.
 */
function permitContext(call: RuntimeCall): RuntimeCall {
  const { dag, runtime, ownership, artifacts } = requireCall(call);
  let copy: RuntimeCall["artifacts"];
  try { copy = Object.freeze(structuredClone([...artifacts])); } catch { fail("input_invalid", "Supplied artifacts must be plain data."); }
  const context: RuntimeCall = Object.freeze({ dag, runtime, ownership: ownership as RuntimeCall["ownership"], artifacts: copy });
  requireCall(context);
  return context;
}
interface PermitState { binding: ExecutablePermitBinding; context: RuntimeCall; root: string; program: RenderProgram; policy: RealExecutionPolicy; reservation: Reservation;
  runtimeProbe: RealRuntimeProbe; lifecycle: readonly TrustedLifecycleObservation[]; consumed: boolean }
/**
 * Real media execution is permitted now for exactly this scope, attempt, claim, DAG, render computation, executor, environment,
 * pinned runtime, program, profile, private policy snapshot, private call context, staged sources and fresh evidence, until `validUntil`
 * (exclusive), once.
 */
export class ExecutablePermit {
  readonly #state: PermitState;
  constructor(construction: symbol, state: PermitState) {
    if (construction !== PERMIT) fail("permit_required", "An executable permit is produced only by issueExecutablePermit.");
    this.#state = state;
    Object.freeze(this);
  }
  static is(value: unknown): value is ExecutablePermit { return typeof value === "object" && value !== null && #state in value; }
  /** A copy of the serializable binding: data only, never executable. */
  get binding(): ExecutablePermitBinding { return structuredClone(this.#state.binding); }
  static { stateOfPermit = permit => permit.#state; }
  toJSON(): never { fail("permit_not_serializable", "An executable permit is never serialized or persisted."); }
}
export async function issueExecutablePermit(input: { call: RuntimeCall; media: TrustedMediaRuntime; staged: readonly StagedSourceReceipt[];
  lifecycle: readonly TrustedLifecycleObservation[]; conformance: readonly TrustedInputConformance[]; policy: RealExecutionPolicy }): Promise<ExecutablePermit> {
  if (input === null || typeof input !== "object") fail("input_invalid", "A permit request is required.");
  const { media, lifecycle, conformance } = input;
  if (!TrustedMediaRuntime.is(media) || !Array.isArray(lifecycle) || !lifecycle.every(l => TrustedLifecycleObservation.is(l)) || !Array.isArray(conformance)
    || !conformance.every(c => TrustedInputConformance.is(c))) fail("trust_handle_required", "Real evidence is accepted only as live trusted handles, never as records.");
  if (!media.proves(media.runtimeProbe) || !media.proves(media.capabilityProbe) || !lifecycle.every(l => l.proves(l.record)) || !conformance.every(c => c.proves(c.record))) {
    fail("evidence_session_mismatch", "A record is not the one its trusted handle produced.");
  }
  // The caller's container is read once, here; the permit and every later check use only this private context.
  const context = permitContext(input.call), { dag, runtime, artifacts } = context;
  if (media.runtimeProbe.outcome.state !== "available") fail(media.runtimeProbe.outcome.reasonCode, "The pinned runtime is not available.");
  if (media.capabilityProbe.outcome.state !== "available") fail("capability_unavailable", "A required capability is unavailable under the V0 semantics.");
  // The lifecycle authority is queried again now: a deletion or an ended retention recorded since an observation refuses the permit.
  const issuing = runtimeNow(runtime);
  for (const observation of lifecycle) observation.reconfirm(issuing);
  const store = await openRenderStore(runtime);
  if (await exists(startPath(store, dag.dag.dispatch.claimTarget.claimTargetId))) {
    fail("execution_already_started", "This claim's single execution has already started; a retry needs a new attempt.");
  }
  const program = compileRenderProgram(dag, artifacts);
  // One private canonical snapshot of the owner's policy, taken once: it is what the binding validates and names by policyId, and the
  // only policy execution ever reads. The caller's object is never retained, so mutating it later changes nothing.
  let policy: RealExecutionPolicy;
  try { policy = structuredClone(input.policy); } catch { fail("policy_invalid", "The real-execution policy must be plain data."); }
  const binding = await evaluateRealExecutionEvidence(context, { policy, program, runtimeProbe: media.runtimeProbe, capabilityProbe: media.capabilityProbe,
    staged: input.staged, lifecycle: lifecycle.map(l => l.record), conformance: conformance.map(c => c.record) });
  const reservation = ReservationSchema.parse(new RuntimeArtifacts(artifacts).exact(binding.reservation.artifact, "Reservation", ROUTING_VERSION, "reservation_invalid"));
  return new ExecutablePermit(PERMIT, { binding, context, root: rootOfMedia(media), program, policy, reservation,
    runtimeProbe: media.runtimeProbe, lifecycle: Object.freeze([...lifecycle]), consumed: false });
}

// ---------------------------------------------------------------- execution
export type RenderExecutionResult = { outcome: "succeeded"; receipt: RenderExecutionReceipt } | { outcome: "failed"; failure: RenderExecutionFailure };
export interface RenderInstrumentation {
  /**
   * Test-only observation point: called after the execution start is recorded and every input is verified, immediately before
   * spawn. It grants nothing. If it fails, the execution ends in a truthful failure record (claim consumed, nothing published).
   */
  afterInputsVerified?: (context: { workingDirectory: string }) => Promise<void>;
}
const EMPTY = new Uint8Array(0);
type FailureStage = Parameters<typeof buildFailureReceipt>[0]["stage"];
const UNCERTIFIED ="this_execution_linked_an_object_under_this_content_identity_but_no_success_receipt_certifies_it_v0" as const;
export async function executeAuthorizedRender(permit: ExecutablePermit, options: { instrumentation?: RenderInstrumentation } = {}): Promise<RenderExecutionResult> {
  if (!ExecutablePermit.is(permit)) fail("permit_required", "Only a genuine executable permit can start a render.");
  const state = stateOfPermit(permit);
  if (state.consumed) fail("permit_consumed", "An executable permit authorizes one execution.");
  state.consumed = true;
  // Everything below reads only the permit's own context and snapshots, never the caller's container.
  const { binding, context, program, policy, reservation, runtimeProbe, root, lifecycle } = state, { dag, runtime, ownership } = context;
  const store = await openRenderStore(runtime);
  let start: RenderExecutionStart | null = null, processEvidence: ProcessEvidence | null = null, inputVerification: "verified_before_spawn" | "not_reached" | "verification_failed" = "not_reached";
  let inputReverification: "unchanged_after_exit" | "changed_after_verification" | "not_performed" = "not_performed", diagnostics = diagnosticsOf(EMPTY, false);
  let measurements: Measurements = { wallClockMilliseconds: null, benchmark: null, outputBytes: null };
  const inputs: VerifiedInput[] = [];
  let output: { handle: FileHandle; path: string } | null = null, cwd: string | null = null;
  const failed = (stage: FailureStage, code: string, published: FailureOutput = "none_published"): RenderExecutionResult => ({ outcome: "failed",
    failure: buildFailureReceipt({ binding, start, program, runtimeProbe, reservation, stage, failureCode: code, process: processEvidence, measurements, diagnostics,
      inputVerification, inputReverification, failedAt: runtimeNow(runtime), output: published }) });
  const code = (error: unknown, fallback: EditRenderErrorCode): string => error instanceof EditRenderError || error instanceof EditRuntimeError ? error.code : fallback;
  try {
    // The permit is current, the claim is still owned and authoritative, every grant still holds, and the lifecycle authority, queried
    // again now, still has every source neither deleted nor expired.
    const now = runtimeNow(runtime);
    try { confirmPermitBindingCurrent(binding, now); } catch (error) { return failed("permit_validation", code(error, "permit_expired")); }
    // Execution reads only the permit's private policy snapshot, and it must be exactly the policy the binding names.
    if (!RealExecutionPolicySchema.safeParse(policy).success || policy.policyId !== binding.policy.policyId) return failed("permit_validation", "permit_required");
    try {
      await verifyClaim(dag, runtime, ownership);
      checkGrantWindow(dag.grant, now);
      for (const source of dag.admission.sources) checkMediaGrantAt(dag, source.assetId, now);
      for (const observation of lifecycle) observation.reconfirm(now);
    } catch (error) { return failed("authority_recheck", code(error, "permit_required")); }
    if (await exists(startPath(store, binding.claimTarget.claimTargetId))) return failed("execution_start", "execution_already_started");
    // The exact pinned runtime, re-verified by full digest.
    let ffmpeg: VerifiedBinary;
    try { ffmpeg = await reverifyPinned(root, "ffmpeg"); } catch (error) { return failed("runtime_verification", code(error, "runtime_binary_mismatch")); }
    // Every staged input verified in full through the handle that will be inherited, in program slot order.
    try { for (const slot of program.inputs) inputs.push(await openStagedInput(context, slot.stagedObjectId, slot)); } catch (error) {
      inputVerification = "verification_failed"; return failed("input_verification", code(error, "staged_input_corrupt"));
    }
    inputVerification = "verified_before_spawn";
    const outputByteBound = deriveOutputByteBound(program, policy), timeoutMilliseconds = deriveRenderTimeoutMilliseconds(policy, reservation);
    const { argv, descriptors } = compileFfmpegArguments(program, { maxOutputBytes: outputByteBound });
    if (descriptors.inputs.length !== inputs.length || descriptors.output !== 3 + inputs.length) return failed("input_verification", "render_program_invalid");
    const pendingPath = join(store.pending, `${randomBytes(16).toString("hex")}.mp4`);
    output = { handle: await open(pendingPath, "wx+"), path: pendingPath };
    cwd = await workingDirectory(store);
    // The claim's one execution is consumed durably before any process starts.
    const startedAt = runtimeNow(runtime);
    try { start = buildExecutionStart({ binding, startedAt }); } catch (error) { return failed("permit_validation", code(error, "permit_expired")); }
    if (await publishExclusive(store, startPath(store, binding.claimTarget.claimTargetId), new TextEncoder().encode(`${canonicalSerialize(start)}\n`)) === "exists") {
      start = null; return failed("execution_start", "execution_already_started");
    }
    const started = start, pendingOutput = output;
    // From here the claim's one execution is consumed. Every outcome ends in terminal evidence: a success receipt, or a failure record
    // at the stage that stopped, stating truthfully whether this execution linked an output. An unexpected error is recorded as the
    // stage it interrupted. Only timing that cannot be recorded truthfully at all (the runtime clock running backwards while the
    // process ran) ends instead in the owned `execution_evidence_unrecordable` refusal, raised before anything is published.
    let stage: FailureStage = "process", linked: { contentHash: string; sizeBytes: number } | null = null, verified = false;
    const outputState = (): FailureOutput => linked === null ? "none_published"
      : { state: verified ? "published_by_this_execution_uncertified" : "linked_by_this_execution_unverified", ...linked, meaning: UNCERTIFIED };
    try {
      await options.instrumentation?.afterInputsVerified?.({ workingDirectory: cwd });
      const spawnedAt = runtimeNow(runtime);
      // A runtime clock that has already run back past the start can never certify this execution: nothing is spawned.
      if (spawnedAt < started.startedAt) return failed("process", "evidence_chronology_invalid");
      const run = await runPinned(ffmpeg, argv, { inherit: [...inputs.map(i => i.handle.fd), pendingOutput.handle.fd], cwd, timeoutMilliseconds, stdoutLimit: 65_536 });
      const completedAt = runtimeNow(runtime);
      if (completedAt < spawnedAt) {
        fail("execution_evidence_unrecordable", "The runtime clock ran backwards while the process ran, so its timing cannot be recorded truthfully; the claim is consumed and nothing was published.");
      }
      measurements = { wallClockMilliseconds: run.spawnError === null ? run.wallClockMilliseconds : null, benchmark: parseBenchmark(new TextDecoder().decode(run.stderr)),
        outputBytes: null };
      diagnostics = diagnosticsOf(run.stderr, run.stderrTruncated);
      if (run.spawnError === null) processEvidence = { spawnedAt, completedAt, exitCode: run.exitCode, signal: run.signal, timedOut: run.timedOut, timeoutMilliseconds, outputByteBound,
        argvDigest: argvDigestOf(argv), argvCount: argv.length };
      // Re-hash every input through its own handle: a change after verification is never silently consumed.
      stage = "input_reverification";
      let changed = false;
      for (const input of inputs) if (await hashHandle(input.handle, input.sizeBytes) !== input.contentHash) changed = true;
      inputReverification = changed ? "changed_after_verification" : "unchanged_after_exit";
      const processFailure = processFailureCodeOf(run);
      if (processFailure !== null) return failed("process", processFailure);
      if (changed) return failed("input_reverification", "staged_input_mutated_during_execution");
      // The private output: present, bounded, hashed through the handle FFmpeg wrote, sealed read-only.
      stage = "output_verification";
      const written = Number((await pendingOutput.handle.stat({ bigint: true })).size);
      measurements = { ...measurements, outputBytes: written === 0 ? null : written };
      if (written === 0) return failed("output_verification", "output_empty");
      if (written > outputByteBound) return failed("output_verification", "output_oversized");
      const contentHash = await hashHandle(pendingOutput.handle, written);
      if (contentHash === "") return failed("output_verification", "output_verification_failed");
      await pendingOutput.handle.chmod(0o444); await pendingOutput.handle.sync();
      stage = "accounting";
      const accounting = deriveAccounting({ program, reservation, measurements });
      if (accounting.status === "FAIL") return failed("accounting", "reservation_consumption_exceeded");
      // Content-addressed, no-overwrite publication; an occupied identity is reused only after full re-verification.
      stage = "publication";
      const final = join(store.outputs, `${contentHash}.mp4`), pendingIdentity = await pendingOutput.handle.stat({ bigint: true });
      await pendingOutput.handle.close(); const pending = pendingOutput.path; output = null;
      // Only the very object FFmpeg wrote and this adapter verified is ever linked: the pending name must still be that regular file.
      const named = await lstat(pending, { bigint: true }).then(stats => stats, (error: { code?: string }) => error.code === "ENOENT" ? null : undefined);
      if (named === undefined) return failed("publication", "render_storage_unavailable");
      if (named === null) return failed("publication", "output_missing");
      if (named.isSymbolicLink() || !named.isFile() || named.ino !== pendingIdentity.ino || named.dev !== pendingIdentity.dev) {
        await unlink(pending).catch(() => undefined);
        return failed("publication", "output_publication_corrupt");
      }
      let publication: "published_by_this_execution" | "existing_output_reverified";
      try { await link(pending, final); publication = "published_by_this_execution"; linked = { contentHash, sizeBytes: written }; } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") return failed("publication", "render_storage_unavailable");
        publication = "existing_output_reverified";
      } finally { await unlink(pending).catch(() => undefined); }
      // After this execution's own link, a failure names the linked identity; it never claims that nothing was published.
      const reopened = await openVerifiedFile(final, "output_missing", "output_publication_corrupt").catch(() => null);
      if (reopened === null) return failed("publication", "output_publication_corrupt", outputState());
      try {
        const sameObject = publication === "existing_output_reverified" || (reopened.ino === pendingIdentity.ino && reopened.dev === pendingIdentity.dev);
        if (!sameObject || reopened.sizeBytes !== written || await hashHandle(reopened.handle, reopened.sizeBytes) !== contentHash) {
          return failed("publication", "output_publication_corrupt", outputState());
        }
      } finally { await reopened.handle.close(); }
      verified = true;
      stage = "receipt_certification";
      const recordedAt = runtimeNow(runtime);
      // A runtime clock that ran backwards makes the chronology uncertifiable: the verified output is named, never certified.
      if (processEvidence === null || spawnedAt < started.startedAt || recordedAt < completedAt) return failed("receipt_certification", "evidence_chronology_invalid", outputState());
      return { outcome: "succeeded", receipt: buildSuccessReceipt({ binding, start: started, program, runtimeProbe, reservation,
        process: processEvidence, measurements, output: { contentHash, sizeBytes: written, publication }, diagnostics, inputReverification: "unchanged_after_exit", recordedAt }) };
    } catch (error) {
      if (error instanceof EditRenderError && error.code === "execution_evidence_unrecordable") throw error;
      try { return failed(stage, code(error, "execution_interrupted"), outputState()); } catch {
        return fail("execution_evidence_unrecordable", "Terminal evidence for this started execution cannot be recorded truthfully; the claim is consumed.");
      }
    }
  } finally {
    for (const input of inputs) await input.handle.close().catch(() => undefined);
    if (output !== null) { await output.handle.close().catch(() => undefined); await unlink(output.path).catch(() => undefined); }
    if (cwd !== null) await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}
