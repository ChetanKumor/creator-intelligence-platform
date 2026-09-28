/**
 * The Gate-7 Batch-3A local-development observation adapter: bounded, on-demand drill-down decoding of exactly one content-addressed media
 * object at a time with the owner-pinned FFmpeg. It is not a renderer and not technical QC, and it never scans a whole video: every decode is
 * one exact window of a review-plan item or one bounded drill-down, and the number of decodes is bounded by the owner's review policy.
 *
 * - The review plan is re-derived here from the replay-validated DAG, the success receipt, its passing technical QC and the policy, and the
 *   supplied plan must be exactly that plan. The critic therefore inspects what was actually rendered, never a plan's intention.
 * - The pinned FFmpeg is verified here by full digest inside the approved tool root; nothing is looked up by name or search path, no shell is
 *   used, and the child gets a minimal environment.
 * - Media is located only by content identity inside the runtime-owned namespaces (the published output under its content hash; a staged
 *   source under its staged-object key), opened only as the very regular file found there, hashed through that handle and compared with the
 *   identity the receipt, QC and plan certify. Each decode reads its own freshly opened handle, proven to be the same file object, inherited
 *   as `-fd 3 fd:` under an `fd`-only protocol whitelist. After decoding, the bytes are re-verified; a change is reported, never observed.
 * - Arguments are fixed tokens and integers only; stdout must be exactly the bytes the request implies; every run is time-bounded by the policy.
 * No record holds a location. The accepted `supervisePinnedProcess` supervises every child.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, realpath, rm, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { PINNED_MEDIA_RUNTIME, type RenderExecutionReceipt, type TechnicalMediaQcReceipt } from "../packages/edit-render/index.js";
import { ownedKey, type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import type { SuppliedArtifact } from "../packages/editorial/common.js";
import { EditReviewError, buildObservation, planReview, resolveObservationTarget, reuseObservation, targetComputationId, type EditReviewErrorCode, type EditorialObservation,
  type ObservationCache, type ObservationTarget, type ResolvedTarget, type ReviewPlan, type ReviewPolicy, type TranscriptEvidence } from "../packages/edit-review/index.js";
import { completedProbeRun, supervisePinnedProcess, type ProcessRun } from "./edit-render-local.js";
import type { LocalEditRuntime } from "./edit-runtime-local.js";

function fail(code: EditReviewErrorCode, message: string): never { throw new EditReviewError(code, message); }
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const APPROVED_TOOL_ROOT = resolve(PROJECT_ROOT, ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build");
const within = (root: string, target: string) => { const path = relative(root, target); return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path); };
const int = (value: number) => { if (!Number.isSafeInteger(value) || value < 0) fail("observation_request_invalid", "Only integers enter a decode argument."); return String(value); };
/** The only decoder this adapter runs: the owner-pinned FFmpeg build, which binds every computation identity it produces. */
const PINNED_DECODER = { kind: "pinned_ffmpeg" as const, ffmpegSha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256 };

// ---------------------------------------------------------------- held, verified file objects
interface Held { handle: FileHandle; sizeBytes: number; dev: bigint; ino: bigint }
async function openRegular(path: string, missing: EditReviewErrorCode): Promise<Held> {
  let info;
  try { info = await lstat(path, { bigint: true }); } catch { fail(missing, "The expected content-addressed object does not exist."); }
  if (info.isSymbolicLink() || !info.isFile()) fail("observation_media_mismatch", "Only a regular file is observed, never a link or directory.");
  const handle = await open(path, "r");
  const opened = await handle.stat({ bigint: true });
  if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) { await handle.close(); fail("observation_media_mismatch", "Another file took the observed name."); }
  return { handle, sizeBytes: Number(opened.size), dev: opened.dev, ino: opened.ino };
}
/** The identity of the bytes a held handle refers to now: its current size and the full SHA-256 of that many bytes. */
async function identityOf(held: Held): Promise<{ contentHash: string; sizeBytes: number }> {
  const sizeBytes = Number((await held.handle.stat({ bigint: true })).size), hash = createHash("sha256"), buffer = Buffer.alloc(1_048_576);
  for (let position = 0; position < sizeBytes;) {
    const { bytesRead } = await held.handle.read(buffer, 0, Math.min(buffer.length, sizeBytes - position), position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
  }
  return { contentHash: hash.digest("hex"), sizeBytes };
}
/** This adapter's own verification of the pinned FFmpeg: the approved root only, containment, a regular file, the exact digest and size. */
async function pinnedFfmpeg(toolRoot: unknown): Promise<string> {
  if (typeof toolRoot !== "string" || !isAbsolute(toolRoot) || toolRoot.includes("\0") || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(toolRoot) || toolRoot.startsWith("\\\\")) {
    fail("observation_tool_unavailable", "The tool root must be the absolute approved pinned distribution.");
  }
  let root: string, approved: string, real: string;
  try { root = await realpath(toolRoot); approved = await realpath(APPROVED_TOOL_ROOT); real = await realpath(join(root, "bin", "ffmpeg.exe")); } catch {
    fail("observation_tool_unavailable", "The pinned FFmpeg is unavailable.");
  }
  if (root !== approved || !within(root, real)) fail("observation_tool_unavailable", "Observation tools come only from the approved pinned distribution.");
  const held = await openRegular(real, "observation_tool_unavailable").catch(() => fail("observation_tool_unavailable", "The pinned FFmpeg is not a regular file."));
  try {
    const identity = await identityOf(held);
    if (identity.sizeBytes !== PINNED_MEDIA_RUNTIME.ffmpeg.sizeBytes || identity.contentHash !== PINNED_MEDIA_RUNTIME.ffmpeg.sha256) {
      fail("observation_tool_unavailable", "The FFmpeg binary is not the owner-pinned build.");
    }
  } finally { await held.handle.close(); }
  return real;
}

// ---------------------------------------------------------------- the only spawn: exact binary, argv array, no shell, bounded capture
function runPinned(binary: string, argv: readonly string[], fd: number, cwd: string, timeoutMilliseconds: number, stdoutLimit: number): Promise<ProcessRun> {
  const env: Record<string, string> = process.env["SystemRoot"] === undefined ? {} : { SystemRoot: process.env["SystemRoot"] };
  let child;
  try {
    child = spawn(binary, [...argv], { shell: false, windowsHide: true, cwd, env, stdio: ["ignore", "pipe", "pipe", fd] });
  } catch {
    return Promise.resolve({ spawnError: "spawn_error", errorAfterSpawn: null, exitCode: null, signal: null, timedOut: false, terminationConfirmed: true, stdout: new Uint8Array(),
      stdoutOverflow: false, stderr: new Uint8Array(), stderrTruncated: false, wallClockMilliseconds: 0 });
  }
  return supervisePinnedProcess(child, { timeoutMilliseconds, terminationGraceMilliseconds: 10_000, stdoutLimit });
}
const HEAD = ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "fd", "-f", "mov", "-fd", "3", "-i", "fd:"];
/** Exactly the window's frames, in presentation order, as raw yuv420p (no conversion, no seeking by time). */
const videoArgv = (r: ResolvedTarget) => [...HEAD, "-map", "0:v:0", "-vf", `trim=start_frame=${int(r.request.window.startFrame)}:end_frame=${int(r.request.window.endFrame)}`,
  "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"];
/** Exactly the window's samples at the native rate and channel count, as interleaved little-endian float32. */
const audioArgv = (r: ResolvedTarget, samplesPerFrame: number) => [...HEAD, "-map", "0:a:0", "-af",
  `atrim=start_sample=${int(r.request.window.startFrame * samplesPerFrame)}:end_sample=${int(r.request.window.endFrame * samplesPerFrame)}`, "-f", "f32le", "-acodec", "pcm_f32le", "-"];

// ---------------------------------------------------------------- the adapter
export interface ObservationInstrumentation {
  /** Test-only observation point: called once each object's identity is established, immediately before its first decoding child. */
  afterIdentityEstablished?: () => Promise<void>;
}
export interface ObservationRunInput {
  dag: ValidatedExecutionDag; artifacts: readonly SuppliedArtifact[]; receipt: RenderExecutionReceipt; qc: TechnicalMediaQcReceipt; policy: ReviewPolicy; plan: ReviewPlan;
  runtime: LocalEditRuntime; toolRoot: string; targets?: readonly ObservationTarget[]; transcripts?: readonly TranscriptEvidence[]; cache?: ObservationCache;
  instrumentation?: ObservationInstrumentation;
}
/** Run accounting. `cacheMisses` counts only lookups that missed; without a cache none is consulted (`cache: "not_supplied"`) and every target decodes. */
export interface ObservationAccounting { targets: number; cache: "not_supplied" | "consulted"; cacheHits: number; cacheMisses: number; decodeProcesses: number; decodedFrames: number;
  decodedPixelFrames: number; deliveredFrames: number; waveformBins: number; evidenceBytes: number; processMilliseconds: number[]; wallMilliseconds: number }
export interface ObservationRun { observations: EditorialObservation[]; accounting: ObservationAccounting }
const bytesOf = (value: unknown) => new TextEncoder().encode(canonicalSerialize(value)).length;
/**
 * Observes the given targets (by default every item of the plan) of one exact rendered output and its staged inputs. Results already held
 * under the same computation identity are rebound to this lineage without decoding; everything else is decoded from the verified object.
 */
export async function observeReviewTargets(input: ObservationRunInput): Promise<ObservationRun> {
  const started = process.hrtime.bigint();
  // Private snapshots: nothing the caller holds (policy, targets, transcripts) is read again once the run starts (self-review D7).
  const policy = structuredClone(input.policy), requested = input.targets === undefined ? null : structuredClone(input.targets);
  const transcripts = structuredClone(input.transcripts ?? []);
  const plan = planReview({ dag: input.dag, artifacts: input.artifacts, receipt: input.receipt, qc: input.qc, policy });
  if (canonicalSerialize(plan) !== canonicalSerialize(input.plan)) fail("review_plan_mismatch", "The supplied plan is not the plan this receipt, QC and policy derive.");
  const budget = policy.budget;
  const targets: readonly ObservationTarget[] = requested ?? plan.items.map(item => ({ kind: "plan_item" as const, itemIndex: item.itemIndex }));
  if (targets.length < 1 || targets.length > budget.maxObservations) fail("review_budget_exceeded", "The observation count is outside the review budget.");
  const resolved = targets.map(target => resolveObservationTarget(plan, target));
  const results: (EditorialObservation | null)[] = targets.map(() => null);
  let hits = 0, misses = 0;
  if (input.cache !== undefined) {
    for (const [i, target] of targets.entries()) {
      // The cache is consulted only under the exact computation identity this target, its transcript join and this pinned decoder would have.
      const cached = input.cache.lookup(targetComputationId(plan, target, transcripts, PINNED_DECODER));
      if (cached === undefined) { misses += 1; continue; }
      results[i] = reuseObservation(cached, { plan, target, transcripts }); hits += 1;
    }
  }
  const accounting: ObservationAccounting = { targets: targets.length, cache: input.cache === undefined ? "not_supplied" : "consulted", cacheHits: hits, cacheMisses: misses,
    decodeProcesses: 0, decodedFrames: 0, decodedPixelFrames: 0, deliveredFrames: 0, waveformBins: 0, evidenceBytes: 0, processMilliseconds: [], wallMilliseconds: 0 };
  const pending = results.flatMap((result, i) => result === null ? [i] : []);
  // The review budget bounds every target, drill-downs included, before any process starts (self-review D4).
  const delivered = resolved.reduce((n, r) => n + r.request.frames.length, 0);
  const decodeWork = pending.reduce((n, i) => n + resolved[i]!.request.window.endFrame * resolved[i]!.facts.width * resolved[i]!.facts.height, 0);
  if (delivered > budget.maxDeliveredFrames || decodeWork > budget.maxDecodedPixelFrames) fail("review_budget_exceeded", "The observation targets exceed the review budget.");
  if (pending.length > 0) {
    const ffmpeg = await pinnedFfmpeg(input.toolRoot), layout = input.runtime.layout;
    const work = join(layout.root, "render-work", `observation-${randomBytes(16).toString("hex")}`);
    await mkdir(work, { recursive: true });
    try {
      // One media object at a time: the published output, or one staged input.
      const groups = new Map<string, number[]>();
      for (const i of pending) { const key = resolved[i]!.media.contentHash; groups.set(key, [...(groups.get(key) ?? []), i]); }
      for (const indices of groups.values()) {
        const media = resolved[indices[0]!]!.media;
        const namespace = media.kind === "rendered_output" ? "render-outputs" : "staged-objects";
        const name = media.kind === "rendered_output" ? `${/^[a-f0-9]{64}$/.test(media.contentHash) ? media.contentHash : fail("observation_media_mismatch", "Not a content digest.")}.mp4`
          : `${ownedKey(media.stagedObjectId, "staged_source_object_v0")}.bin`;
        const path = join(layout.root, namespace, name);
        let real: string;
        try { real = await realpath(path); } catch { fail("observation_media_missing", "The content-addressed object is not in the runtime namespace."); }
        if (real !== join(await realpath(layout.root), namespace, name)) fail("observation_media_mismatch", "The object does not resolve inside the runtime-owned namespace.");
        const identityHandle = await openRegular(path, "observation_media_missing");
        try {
          const before = await identityOf(identityHandle);
          if (before.contentHash !== media.contentHash || before.sizeBytes !== media.sizeBytes) fail("observation_media_mismatch", "The bytes are not the certified bytes.");
          await input.instrumentation?.afterIdentityEstablished?.();
          const decoded = new Map<number, { video: Uint8Array; audio: Uint8Array | null }>();
          let failure: unknown = null;
          try {
            for (const i of indices) {
              const r = resolved[i]!;
              const decode = async (argv: string[], expected: number): Promise<Uint8Array> => {
                const handle = await openRegular(path, "observation_media_missing");
                try {
                  if (handle.dev !== identityHandle.dev || handle.ino !== identityHandle.ino) fail("observation_media_changed", "The observed object changed during observation.");
                  const run = await runPinned(ffmpeg, argv, handle.handle.fd, work, budget.maxDecodeMilliseconds, expected + 1);
                  accounting.decodeProcesses += 1; accounting.processMilliseconds.push(run.wallClockMilliseconds);
                  if (!completedProbeRun(run) || run.stdout.length !== expected) fail("observation_decode_failed", "The decode did not complete with exactly the requested bytes.");
                  return run.stdout;
                } finally { await handle.handle.close(); }
              };
              const spf = r.request.audio === "window" && r.facts.audio.state === "present"
                ? (r.facts.audio.sampleRateHz * r.facts.frameRate.denominator) / r.facts.frameRate.numerator : null;
              const video = await decode(videoArgv(r), r.decodeBytes.video);
              const audio = spf === null ? null : await decode(audioArgv(r, spf), r.decodeBytes.audio);
              decoded.set(i, { video, audio });
            }
          } catch (error) { failure = error; }
          // The bytes are re-verified after every decode: a change during observation is reported as such, whatever else failed.
          const after = await identityOf(identityHandle);
          if (after.contentHash !== before.contentHash || after.sizeBytes !== before.sizeBytes) fail("observation_media_changed", "The observed bytes changed during observation.");
          if (failure !== null) throw failure;
          for (const i of indices) {
            results[i] = buildObservation({ plan, target: targets[i]!, decoded: decoded.get(i)!, transcripts,
              acquisition: { basis: "pinned_ffmpeg_decode_of_verified_held_object_v0", tool: { ffmpegSha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256 } } });
            input.cache?.store(results[i]!);
          }
        } finally { await identityHandle.handle.close().catch(() => undefined); }
      }
    } finally { await rm(work, { recursive: true, force: true }); }
  }
  const observations = results.map(o => o!);
  for (const o of observations) {
    accounting.decodedFrames += o.acquisition.decodedFrames; accounting.decodedPixelFrames += o.acquisition.decodedPixelFrames;
    accounting.deliveredFrames += o.acquisition.deliveredFrames;
    accounting.waveformBins += o.result.waveform.state === "present" ? o.result.waveform.bins.length : 0;
    accounting.evidenceBytes += bytesOf(o);
  }
  if (accounting.evidenceBytes > budget.maxEvidenceBytes) fail("review_budget_exceeded", "The observed evidence exceeds the review's evidence-byte budget.");
  accounting.wallMilliseconds = Number((process.hrtime.bigint() - started) / 1_000_000n);
  return { observations, accounting };
}
