// Phase 5 Gate 7 Batch 2B pure tests: the typed RenderProgram and FFmpeg argument compiler, the finite capability map, strict
// real-evidence records, permit-binding evaluation, receipts, accounting and technical-QC logic. This file imports no subprocess
// module, spawns nothing, needs no media and does not depend on the pinned FFmpeg existing. Actual media is exercised only by
// tests/edit-render-media.integration.ts.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { supplied } from "../packages/edit-graph/index.js";
import { EditRuntimeError, acquireExecutionClaim, observeSourceLifecycle, openValidatedDag, ownedKey, prepareDispatch, recheckDispatchCapability, recheckDispatchRuntime,
  registerDagAttempt, stageClaimedSource, stagedObjectIdOf, timestampAt, type ClaimOwnership, type ExecutionClaim, type RuntimeCall, type StagedSourceReceipt,
  type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import { EDIT_RENDER_ERROR_CODES, EditRenderError, FixtureLifecycleObservationSchema, PINNED_MEDIA_RUNTIME, RENDER_ENVIRONMENT, RENDER_EXECUTOR, RENDER_SEMANTICS,
  RENDER_SEMANTICS_DIGEST, RenderExecutionFailureSchema, RenderExecutionReceiptSchema, RenderProgramSchema, accountingOfReceipt, assessCapabilityRequirement, buildExecutionStart, buildFailureReceipt,
  buildFixtureLifecycleObservation, buildRealCapabilityProbe, buildRealRuntimeProbe, buildStagedInputConformance, buildSuccessReceipt, colorLookStep, compileFfmpegArguments,
  compileRenderProgram, compileRenderProgramFromDag, componentInventoryOf, confirmPermitBindingCurrent, deriveAccounting, deriveOutputByteBound, deriveQcExpectation,
  deriveRenderTimeoutMilliseconds, evaluateRealExecutionEvidence, evaluateTechnicalQc, frameTableIdOf, parseBenchmark, parseBuildConfiguration, parseComponentListing,
  parseProbeJson, parseVersionBanner, type CheckTiming, type RealEvidenceBundle, type RenderProgram, type RuntimeObservation } from "../packages/edit-render/index.js";
import { SyntheticFixtureLifecycleAuthority, TrustedLifecycleObservation, createSyntheticFixtureLifecycleAuthority } from "../scripts/edit-render-fixture-authority-local.js";
import { mergeArtifacts, type DagFixture } from "./support/edit-execution.js";
import { RUNTIME_EVIDENCE, SyntheticCapabilityRechecker, SyntheticLifecycleProvider, SyntheticRuntimeRechecker, deterministicBytes, dispatchPolicy, runtimeEnv,
  sha256Hex, type RuntimeEnv } from "./support/edit-runtime.js";
import { FINAL_RENDER_RESOLUTION, REAL_ENVIRONMENT, REAL_EXECUTOR, REAL_RUNTIME, cfrMetadata, realPolicy, renderDag, renderGraph, vfrMetadata } from "./support/edit-render.js";
import { footageMetadata } from "./support/footage.js";

// ---------------------------------------------------------------- helpers
async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof EditRenderError) { assert.ok((EDIT_RENDER_ERROR_CODES as readonly string[]).includes(error.code), error.code); return error.code; }
    if (error instanceof EditRuntimeError) return `runtime:${error.code}`;
    assert.fail(`expected an owned refusal, received ${String(error)}`);
  }
  assert.fail("expected an owned refusal");
}
const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T { if (!cache.has(key)) cache.set(key, make()); return cache.get(key) as T; }
/** Coordinated forgery: mutate a copy, then recompute its own content identity so only semantic checks can object. */
function reidentify<T extends object>(value: T, key: string, namespace: string, mutate: (copy: T) => void = () => {}): T {
  const copy = structuredClone(value); mutate(copy);
  const body = { ...copy } as Record<string, unknown>; delete body[key];
  return identify(namespace, key, body) as unknown as T;
}
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) allKeys(item, keys);
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); allKeys(child, keys); }
  return keys;
}
const sha256File = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const at = (base: string, offset: number) => timestampAt(Date.parse(base) + offset);
const timingAt = (t: string): CheckTiming => ({ checkStartedAt: t, observedAt: t, checkCompletedAt: t, observedAtBasis: "check_started_lower_bound" });
const SESSION = { scheme: "sha256_of_ephemeral_session_token_v0" as const, digest: sha256Hex("batch2b-pure-test-session") };
const F = RENDER_SEMANTICS.video.scalerFlags;

// ---------------------------------------------------------------- real-shaped listings as the pinned build prints them (excerpts)
const listing = (title: string, legend: string[], separator: string, rows: string[]) => [`${title}:`, ...legend, separator, ...rows].join("\n");
const CODEC_LEGEND = [" V..... = Video", " A..... = Audio", " S..... = Subtitle", " .F.... = Frame-level multithreading", " ..S... = Slice-level multithreading",
  " ...X.. = Codec is experimental", " ....B. = Supports draw_horiz_band", " .....D = Supports direct rendering method 1"];
const ENCODERS = listing("Encoders", CODEC_LEGEND, " ------", [" V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)",
  " V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)", " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]);
const DECODERS = listing("Decoders", CODEC_LEGEND, " ------", [" VFS..D h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
  " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]);
const FILTER_NAMES = ["trim", "atrim", "setpts", "asetpts", "scale", "setsar", "format", "aformat", "concat", "settb", "asettb", "split", "asplit", "null", "colorchannelmixer", "eq"];
const FILTERS = listing("Filters", ["  T.. = Timeline support", "  .S. = Slice threading", "  A = Audio input/output", "  V = Video input/output",
  "  N = Dynamic number and/or type of input/output", "  | = Source or sink filter"], "  ------", FILTER_NAMES.map(n => ` .. ${n.padEnd(16)} V->V       The ${n} filter.`));
const FORMAT_LEGEND = [" D.. = Demuxing supported", " .E. = Muxing supported", " ..d = Is a device"];
const MUXERS = listing("Formats", FORMAT_LEGEND, " ---", ["  E  mov             QuickTime / MOV", "  E  mp4             MP4 (MPEG-4 Part 14)", "  E  null            raw null video"]);
const DEMUXERS = listing("Formats", FORMAT_LEGEND, " ---", [" D   mov,mp4,m4a,3gp,3g2,mj2 QuickTime / MOV", " D   hls             Apple HTTP Live Streaming"]);
const PROTOCOLS = ["Supported file protocols:", "Input:", "  fd", "  file", "  http", "Output:", "  fd", "  file"].join("\n");
const FFMPEG_VERSION = `ffmpeg version ${PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion} Copyright (c) 2000-2026 the FFmpeg developers\nbuilt with gcc 16.1.0\nconfiguration: --enable-gpl --enable-libx264`;
const FFPROBE_VERSION = `ffprobe version ${PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion} Copyright (c) 2007-2026 the FFmpeg developers`;
const BUILDCONF = "\n  configuration:\n    --enable-gpl\n    --enable-version3\n    --enable-libx264\n";
function observation(patch: Partial<RuntimeObservation> = {}, listings: Partial<RuntimeObservation["listings"]> = {}): RuntimeObservation {
  return { ffmpeg: { sha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffmpeg.sizeBytes, versionText: FFMPEG_VERSION, buildConfigurationText: BUILDCONF },
    ffprobe: { sha256: PINNED_MEDIA_RUNTIME.ffprobe.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffprobe.sizeBytes, versionText: FFPROBE_VERSION },
    listings: { encoders: ENCODERS, decoders: DECODERS, filters: FILTERS, muxers: MUXERS, demuxers: DEMUXERS, protocols: PROTOCOLS, ...listings },
    platform: RENDER_ENVIRONMENT.platform, arch: RENDER_ENVIRONMENT.arch, ...patch };
}
/** ffprobe JSON describing a source exactly on the 30 fps grid (MOV timescale 15360), with 48 kHz stereo PCM when `audio` is set. */
function sourceProbeJson(o: { frames?: number; audio?: boolean; width?: number; height?: number; pts?: (i: number) => number; audioStart?: number; sampleRate?: number;
  channels?: number; audioSamples?: number; codec?: string; sar?: string; rotation?: number; extra?: boolean } = {}): string {
  const frames = o.frames ?? 120, audio = o.audio ?? true, pts = o.pts ?? (i => i * 512);
  const streams: unknown[] = [{ index: 0, codec_name: o.codec ?? "h264", codec_type: "video", width: o.width ?? 90, height: o.height ?? 160, sample_aspect_ratio: o.sar ?? "1:1",
    pix_fmt: "yuv420p", time_base: "1/15360", start_pts: pts(0), ...(o.rotation === undefined ? {} : { side_data_list: [{ side_data_type: "Display Matrix", rotation: o.rotation }] }) }];
  if (audio) streams.push({ index: 1, codec_name: "pcm_s16le", codec_type: "audio", sample_rate: String(o.sampleRate ?? 48000), channels: o.channels ?? 2,
    channel_layout: (o.channels ?? 2) === 2 ? "stereo" : "mono", time_base: `1/${o.sampleRate ?? 48000}`, start_pts: o.audioStart ?? 0 });
  if (o.extra) streams.push({ index: streams.length, codec_name: "bin_data", codec_type: "data" });
  const list: unknown[] = Array.from({ length: frames }, (_, i) => ({ stream_index: 0, pts: pts(i) }));
  if (audio) { const total = o.audioSamples ?? 192_000; for (let s = 0; s < total; s += 1024) list.push({ stream_index: 1, pts: (o.audioStart ?? 0) + s, nb_samples: Math.min(1024, total - s) }); }
  return JSON.stringify({ frames: list, programs: [], stream_groups: [], streams, format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" } });
}

// ---------------------------------------------------------------- replay-valid chains over opaque real bytes (the bytes are not video)
const SIZE_A = 3_000_001, SIZE_B = 2_000_003, SIZE_S = 1_000_003;
const bytesA = () => memo("bytes_a", () => deterministicBytes("gate7-batch2b-source-a", SIZE_A));
const bytesB = () => memo("bytes_b", () => deterministicBytes("gate7-batch2b-source-b", SIZE_B));
const bytesS = () => memo("bytes_s", () => deterministicBytes("gate7-batch2b-source-silent", SIZE_S));
const byAsset = () => memo("by_asset", () => new Map([bytesA(), bytesB(), bytesS()].map(b => [`asset_${sha256Hex(b)}`, b])));
const srcA = (patch: Record<string, unknown> = {}) => ({ key: "b2b_a", hash: sha256Hex(bytesA()), sizeBytes: SIZE_A, metadata: cfrMetadata(), ...patch });
const srcB = (patch: Record<string, unknown> = {}) => ({ key: "b2b_b", hash: sha256Hex(bytesB()), sizeBytes: SIZE_B, metadata: cfrMetadata(), range: { startSeconds: 1, endSeconds: 3 }, ...patch });
const graphA = () => memo("g_a", () => renderGraph({ sources: [srcA()] }));
const finalA = () => memo("final_a", () => renderDag(graphA()));
const previewA = () => memo("preview_a", () => renderDag(graphA(), { intent: "preview" }));
const graphAB = () => memo("g_ab", () => renderGraph({ sources: [srcA(), srcB()], cut: true, look: { look: "warm", target: [0] } }));
const finalAB = () => memo("final_ab", () => renderDag(graphAB()));
const graphWhole = () => memo("g_whole", () => renderGraph({ sources: [srcA(), srcB()], look: { look: "contrast", intensityPerMille: 250, target: "whole_output" } }));
const finalWhole = () => memo("final_whole", () => renderDag(graphWhole()));
const graphSilent = () => memo("g_silent", () => renderGraph({ sources: [{ key: "b2b_s", hash: sha256Hex(bytesS()), sizeBytes: SIZE_S, metadata: cfrMetadata({ hasAudio: false }) }] }));
const finalSilent = () => memo("final_silent", () => renderDag(graphSilent()));
const graphSeconds = () => memo("g_seconds", () => renderGraph({ sources: [srcA({ key: "b2b_seconds", range: { startSeconds: 0.05, endSeconds: 2.05 } })] }));
const finalSeconds = () => memo("final_seconds", () => renderDag(graphSeconds()));
const validated = (x: DagFixture) => memo(`validated_${x.dag.dagId}`, () => openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts));

interface Claimed { env: RuntimeEnv; x: DagFixture; v: ValidatedExecutionDag; claim: ExecutionClaim; ownership: ClaimOwnership; call: RuntimeCall }
async function claimed(t: TestContext, x: DagFixture = finalA()): Promise<Claimed> {
  const v = validated(x);
  const env = await runtimeEnv({ sources: v.admission.sources.map((s, i) => ({ assetId: s.assetId, bytes: byAsset().get(s.assetId)!, name: `take_${i}.bin` })) });
  t.after(env.cleanup);
  await registerDagAttempt(v, x.artifacts, env.runtime);
  const { claim, ownership } = await acquireExecutionClaim(v, { workerId: "worker_render" }, env.runtime);
  return { env, x, v, claim, ownership, call: { dag: v, runtime: env.runtime, ownership, artifacts: mergeArtifacts(x.artifacts, RUNTIME_EVIDENCE) } };
}
async function stageAll(c: Claimed): Promise<StagedSourceReceipt[]> {
  const staged: StagedSourceReceipt[] = [];
  for (const source of c.v.admission.sources) staged.push(await stageClaimedSource(c.call, { assetId: source.assetId }));
  return staged;
}
interface EvidenceOptions { observation?: RuntimeObservation; probeJson?: (assetId: string) => string; lifecycle?: { deletionRequestedAt: string | null; expiresAt: string | null } }
/** Real-shaped evidence as the trusted adapter builds it, one check window after staging on the controlled clock. */
async function evidence(c: Claimed, o: EvidenceOptions = {}): Promise<RealEvidenceBundle> {
  const staged = await stageAll(c);
  c.env.clock.advance(250);
  const now = c.env.runtime.clock.now(), timing = timingAt(now), program = compileRenderProgram(c.v, c.call.artifacts), obs = o.observation ?? observation();
  return { policy: realPolicy(), program, staged,
    runtimeProbe: buildRealRuntimeProbe({ dag: c.v, claim: c.claim, observation: obs, timing, session: SESSION }),
    capabilityProbe: buildRealCapabilityProbe({ dag: c.v, artifacts: c.call.artifacts, claim: c.claim, observation: obs, timing, session: SESSION }),
    lifecycle: staged.map(s => buildFixtureLifecycleObservation({ dag: c.v, claim: c.claim, stagedSource: s, state: o.lifecycle ?? { deletionRequestedAt: null, expiresAt: null },
      timing, session: SESSION })),
    conformance: staged.map(s => buildStagedInputConformance({ dag: c.v, claim: c.claim, stagedSource: s, program,
      probeJson: o.probeJson?.(s.source.assetId) ?? sourceProbeJson({ audio: program.inputs.find(i => i.assetId === s.source.assetId)!.audio.required }), timing, session: SESSION })) };
}

// ================================================================ B01-B02 accepted boundaries stay frozen; synthetic Batch-2A evidence never executes
const FROZEN: readonly (readonly [string, string])[] = [
  ["packages/edit-execution/admission.ts", "d1fa1b90b5991fd495a6765c485123ba32b52cb332600adb06965dcf72f6d0a1"],
  ["packages/edit-execution/common.ts", "f45a6e3a81303f3609c3a01918881e3da2eabe4a3682794f49237b0af5d69e3e"],
  ["packages/edit-execution/dag.ts", "40e976e94cbe371d25b624b4e39c45f52a046eff4ca6f4a29d2e188f6db2f6e3"],
  ["packages/edit-execution/grant.ts", "3e7c6cb787f1c977955804921c81d41cbc1fd92fcedf74aac390857f8ca736c2"],
  ["packages/edit-execution/index.ts", "d1e0ec87c18ac77457f1c3e5b81691718483e3cfe0d2c96ae5dc97536ab16980"],
  ["packages/edit-execution/policy.ts", "3732c5e30bae7f19a8d9ca65c240014c73274d242ab7004c68e582d0ee393a9b"],
  ["packages/edit-execution/runtime.ts", "3db1353b95352eb6d30b7e19f47905563cbd1801423a810d86d45a1552fdcdb3"],
  ["packages/edit-execution/source.ts", "d6d78941984d37dd9f58c4b7c9486f9278c7d4fbce26e9fba86c43072085d944"],
  ["packages/edit-execution/workload.ts", "11f627f572e306f7f4a90ab0feeb1131d18e6947cdb4f121156045f1783c62ee"],
  ["packages/edit-graph/index.ts", "fc922eb038a75aeea6d933de37ccb0dd700366ac7e0ddddfb7750b926e1a1628"],
  ["packages/edit-runtime/call.ts", "40b1b80e5e98820223e1ef825867728165750b59dbbb695b6ab0cda4f55f40ee"],
  ["packages/edit-runtime/common.ts", "3e03458c434445523cda89bddb097cd383991edfa874eed3fff3c3609dfcbeb4"],
  ["packages/edit-runtime/dispatch.ts", "f0a75e7fe0dac3173d15d88344f50803758cd990a615822dfdc52091dfcff0c7"],
  ["packages/edit-runtime/index.ts", "4b0b9ca65caf88d34e1d7c5121f9df1a23181af9a08aafdb688cd51fe68faf0f"],
  ["packages/edit-runtime/ledger.ts", "b12cceb87896e98a16a2f3be47027c61529d3313a412d077b559bd745e3b8303"],
  ["packages/edit-runtime/ports.ts", "0ffb89cb6ebad7bf99c61beb132fdd01a7246f8921bf1730c101c436f9ccbedb"],
  ["packages/edit-runtime/recheck.ts", "646c6e235068237d889888ec88a1681241f76e0eff714dd82bda3315b0c36e96"],
  ["packages/edit-runtime/records.ts", "ca9093398cba8bc3d7652a0dbf0189d63936fcb7f15df4fd0b3dab900380190e"],
  ["packages/edit-runtime/staging.ts", "5fcc677b643f1b9efe78087d585a071a29eda9e8884f1ab775adfeb32e7404c3"],
  ["packages/edit-runtime/validated.ts", "153bace6f31cda5950f54d92920f7cef4afbdf2eaf3107900c7a0462194b595a"],
  ["scripts/edit-runtime-local.ts", "016ae90284b4181909e2dc0ffa79d0824c596d41166af376fc65282f24bc0546"],
  ["tests/support/edit-execution-chains.ts", "dcd3aadde2cee9c18cef2f665474a067a0361a303b06fce2e2156680a649f2f6"],
  ["tests/support/edit-execution.ts", "bf1ace12b2b26ed46694ccf0243ed3993475366279c36fc9b66bba1c857e3828"],
  ["tests/support/edit-graph.ts", "50e57755aff2d03b5e282e8445b399edfca1dd5af000c9981e607b2875cc0468"],
  ["tests/support/edit-runtime-chains.ts", "f963438e468c9c375451960eb3bc4bd9513f1fca8ef801b0cc12711cd8ba8297"],
  ["tests/support/edit-runtime.ts", "f2878c11dbfc758af78b059f1b05143eed8744f8b68513541aad7cf93209de0d"],
];
test("B01 the accepted Batch-1 and Batch-2A execution and runtime files are byte-identical", () => {
  for (const [path, hash] of FROZEN) assert.equal(sha256File(path), hash, path);
  assert.equal(readdirSync("packages/edit-runtime").length, 10, "Batch 2B adds no file to the accepted runtime core");
});

test("B02 synthetic Batch-2A evidence and a Batch-2A DispatchPreparation are never Batch-2B real-execution evidence", async t => {
  const c = await claimed(t), e = await evidence(c);
  // The accepted Batch-2A path, unchanged, still produces only a synthetic-grade preparation.
  c.env.clock.advance(100);
  const lifecycle: Awaited<ReturnType<typeof observeSourceLifecycle>>[] = [];
  for (const s of e.staged) lifecycle.push(await observeSourceLifecycle(c.call, { stagedSource: s, provider: new SyntheticLifecycleProvider() }));
  const capability = await recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker() });
  const runtimeCheck = await recheckDispatchRuntime(c.call, { checker: new SyntheticRuntimeRechecker() });
  c.env.clock.advance(100);
  const policy = dispatchPolicy();
  const staged = e.staged.map(s => supplied(s, s.stagedSourceReceiptId)), observed = lifecycle.map(l => supplied(l, l.observationId));
  const cap = supplied(capability, capability.recheckId), run = supplied(runtimeCheck, runtimeCheck.recheckId), pol = supplied(policy, policy.policyId);
  const prepared = await prepareDispatch({ ...c.call, artifacts: mergeArtifacts(c.call.artifacts, staged, observed, [cap, run, pol]) }, { policy: pol.ref,
    stagedSources: staged.map(a => a.ref), lifecycleObservations: observed.map(a => a.ref), capabilityRecheck: cap.ref, runtimeRecheck: run.ref });
  assert.equal(prepared.preparation.evidenceGrade, "synthetic_post_claim_rechecks_not_real_probes_batch2a");
  // Each synthetic Batch-2A record fails the Batch-2B real-evidence schemas; a preparation is not an input anywhere.
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, runtimeProbe: runtimeCheck as never })), "runtime_probe_invalid");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, capabilityProbe: capability as never })), "capability_probe_invalid");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: lifecycle as never })), "lifecycle_observation_invalid");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, runtimeProbe: prepared.preparation as never })), "runtime_probe_invalid");
  // A synthetic kind cannot be relabeled into a Batch-2B record: the provenance unions hold only the real variants.
  const relabeled = reidentify(e.runtimeProbe, "probeId", "real_runtime_probe_v0", p => { (p.prober as { kind: string }).kind = "synthetic_test"; });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, runtimeProbe: relabeled })), "runtime_probe_invalid");
});

// ================================================================ B06-B07 the V0 executor semantics and pinned runtime are explicit, versioned and location-free
test("B06 the executor identity is the digest of the explicit V0 semantics; the pinned runtime is the verified archive build", () => {
  assert.equal(RENDER_SEMANTICS_DIGEST, sha256Hex(canonicalSerialize(RENDER_SEMANTICS)));
  assert.equal(RENDER_EXECUTOR.implementationDigest, RENDER_SEMANTICS_DIGEST);
  assert.equal(RENDER_SEMANTICS.video.encoder, "libx264");
  assert.equal(RENDER_SEMANTICS.audio.encoder, "aac");
  assert.equal(RENDER_SEMANTICS.hardware, "none_software_codecs_and_filters_only");
  assert.deepEqual(PINNED_MEDIA_RUNTIME.runtimeIdentity, { runtimeId: "ffmpeg_gyan_essentials_win64", version: "9.0.1-essentials_build-www.gyan.dev",
    implementationDigest: "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3" });
  assert.equal(PINNED_MEDIA_RUNTIME.ffmpeg.sha256, "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3");
  assert.equal(PINNED_MEDIA_RUNTIME.ffmpeg.sizeBytes, 102_856_192);
  assert.equal(PINNED_MEDIA_RUNTIME.ffprobe.sha256, "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f");
  assert.equal(PINNED_MEDIA_RUNTIME.ffprobe.sizeBytes, 102_652_416);
  assert.equal(PINNED_MEDIA_RUNTIME.archiveSha256, "fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9");
  for (const value of allStrings([RENDER_SEMANTICS, PINNED_MEDIA_RUNTIME, RENDER_EXECUTOR, RENDER_ENVIRONMENT])) assert.doesNotMatch(value, /[\\/]|^[A-Za-z]:|https?:|\.exe$/i, value);
});

test("B07 colour looks map to fixed, bounded, exact-decimal filter steps; intensity 0 and neutral are the explicit identity", async () => {
  const identity = { effect: "identity", filters: ["null"] };
  for (const look of ["neutral", "warm", "cool", "contrast"] as const) assert.deepEqual(colorLookStep(look, 0), identity, look);
  assert.deepEqual(colorLookStep("neutral", 1000), identity);
  assert.deepEqual(colorLookStep("warm", 1000), { effect: "channel_gain", filters: [`scale=flags=${F}`, "format=pix_fmts=gbrp",
    "colorchannelmixer=rr=1.1000:gg=1.0000:bb=0.9000", `scale=flags=${F}`, "format=pix_fmts=yuv420p"] });
  assert.equal(colorLookStep("warm", 500).filters[2], "colorchannelmixer=rr=1.0500:gg=1.0000:bb=0.9500");
  assert.equal(colorLookStep("cool", 1).filters[2], "colorchannelmixer=rr=0.9999:gg=1.0000:bb=1.0001");
  assert.equal(colorLookStep("cool", 1000).filters[2], "colorchannelmixer=rr=0.9000:gg=1.0000:bb=1.1000");
  assert.deepEqual(colorLookStep("contrast", 1000), { effect: "contrast_gain", filters: ["eq=contrast=1.3000"] });
  assert.deepEqual(colorLookStep("contrast", 333).filters, ["eq=contrast=1.0999"]);
  for (const bad of [-1, 1001, 0.5, Number.NaN]) assert.equal(await refusal(() => colorLookStep("warm", bad)), "render_program_unsupported", String(bad));
  assert.equal(await refusal(() => colorLookStep("sepia" as never, 500)), "render_program_unsupported");
});

// ================================================================ B10-B17 the typed RenderProgram
test("B10 a single frame-exact clip compiles to its authoritative frame interval and exactly linked sample interval", () => {
  const program = compileRenderProgram(validated(finalA()), finalA().artifacts);
  RenderProgramSchema.parse(program);
  assert.equal(program.segments.length, 1);
  assert.deepEqual(program.segments[0]!.video, { precision: "frame_pts_exact", selection: "authoritative_frame_interval_v0", startFrame: 0, endFrame: 60, frames: 60 });
  assert.deepEqual(program.segments[0]!.audio, { state: "linked", startSample: 0, endSample: 96_000 });
  assert.equal(program.output.frames, 60);
  assert.deepEqual(program.output.resolution, FINAL_RENDER_RESOLUTION);
  assert.deepEqual(program.output.audio, { state: "encoded", codecFamily: "aac", sampleRateHz: 48000, channelLayout: "stereo" });
  assert.equal(program.inputs[0]!.stagedObjectId, stagedObjectIdOf({ contentHash: sha256Hex(bytesA()), sizeBytes: SIZE_A }));
  assert.deepEqual(program.inputs[0]!.video.grid, { numerator: 30, denominator: 1 });
  assert.equal(program.inputs[0]!.audio.required, true);
  assert.equal(program.semantics.digest, RENDER_SEMANTICS_DIGEST);
  assert.equal(program.binding.renderComputationId, finalA().dag.renderIdentity.renderComputationId);
  assert.equal(program.segments[0]!.segmentComputationId.startsWith("render_segment_computation_v0_"), true);
});

test("B11 a non-zero trim, two sources, an explicit cut and a clip-scoped or whole-output look compile exactly and in order", () => {
  const program = compileRenderProgram(validated(finalAB()), finalAB().artifacts);
  const timeline = finalAB().dag.nodes.flatMap(n => n.kind === "source_video_clip" ? [n.source.assetId] : []);
  assert.deepEqual(program.segments.map(s => program.inputs[s.input]!.assetId), timeline);
  assert.deepEqual(program.inputs.map(i => i.assetId), [...timeline].sort());
  assert.deepEqual(program.segments.map(s => [s.video.startFrame, s.video.endFrame]), [[0, 60], [30, 90]]);
  assert.deepEqual(program.segments.map(s => s.audio), [{ state: "linked", startSample: 0, endSample: 96_000 }, { state: "linked", startSample: 48_000, endSample: 144_000 }]);
  assert.deepEqual(program.segments.map(s => s.look), [{ state: "clip", look: "warm", intensityPerMille: 500 }, { state: "none" }]);
  assert.deepEqual(program.joins, [{ atFrame: 60, transition: "cut" }]);
  assert.equal(program.output.frames, 120);
  assert.deepEqual(program.wholeOutputLook, { state: "none" });
  const whole = compileRenderProgram(validated(finalWhole()), finalWhole().artifacts);
  assert.deepEqual(whole.segments.map(s => s.look), [{ state: "none" }, { state: "none" }]);
  assert.deepEqual(whole.wholeOutputLook, { state: "applied", look: "contrast", intensityPerMille: 250 });
});

test("B12 source_seconds keeps its weaker precision: PTS-membership selection, audio follows the selected frames, never promoted", () => {
  const program = compileRenderProgram(validated(finalSeconds()), finalSeconds().artifacts);
  assert.deepEqual(program.segments[0]!.video, { precision: "source_seconds", selection: "pts_membership_half_open_v0", startFrame: 2, endFrame: 62, frames: 60 });
  assert.deepEqual(program.segments[0]!.audio, { state: "linked", startSample: 3200, endSample: 99_200 });
});

test("B13 a variable-frame-rate table and a constant rate other than the output grid are refused, never retimed", async () => {
  const vfr = renderDag(renderGraph({ sources: [srcA({ key: "b2b_vfr", metadata: vfrMetadata() })], vfr: true }));
  assert.equal(await refusal(() => compileRenderProgram(validated(vfr), vfr.artifacts)), "source_frame_grid_unsupported");
  const tenFps = renderDag(renderGraph({ sources: [srcA({ key: "b2b_10fps", metadata: { ...footageMetadata(4), hasAudio: true } })] }));
  assert.equal(await refusal(() => compileRenderProgram(validated(tenFps), tenFps.artifacts)), "source_frame_grid_unsupported");
});

test("B14 a graph without source audio compiles without an audio stream; nothing is synthesized", () => {
  const program = compileRenderProgram(validated(finalSilent()), finalSilent().artifacts);
  assert.deepEqual(program.output.audio, { state: "none" });
  assert.deepEqual(program.segments[0]!.audio, { state: "none" });
  assert.equal(program.inputs[0]!.audio.required, false);
  const excluded = renderDag(renderGraph({ sources: [srcA({ key: "b2b_excluded" })], sourceAudio: "excluded" }));
  assert.deepEqual(compileRenderProgram(validated(excluded), excluded.artifacts).output.audio, { state: "none" });
});

test("B15 program identity is deterministic, binds the semantics, and separates preview from final", () => {
  const a = compileRenderProgram(validated(finalA()), finalA().artifacts), b = compileRenderProgram(validated(finalA()), finalA().artifacts);
  assert.deepEqual(a, b);
  const preview = compileRenderProgram(validated(previewA()), previewA().artifacts);
  assert.notEqual(preview.programId, a.programId);
  assert.deepEqual(preview.output.resolution, { width: 90, height: 160 });
  assert.notEqual(preview.binding.renderComputationId, a.binding.renderComputationId);
  assert.notEqual(preview.segments[0]!.segmentComputationId, a.segments[0]!.segmentComputationId);
  assert.throws(() => RenderProgramSchema.parse(reidentify(a, "programId", "render_program_v0", p => { p.semantics.digest = "0".repeat(64); })));
  assert.throws(() => RenderProgramSchema.parse({ ...a, programId: `render_program_v0_${"0".repeat(64)}` }));
});

test("B16 the frame-table identity replica reproduces every DAG source node's table identity", () => {
  for (const x of [finalA(), finalAB(), finalSeconds()]) for (const node of x.dag.nodes) {
    if (node.kind !== "source_video_clip") continue;
    const analysis = x.artifacts.find(a => a.ref.objectId === node.source.analysis.objectId)!.value as { metadata: { frameTimes: number[] } };
    assert.equal(frameTableIdOf(analysis.metadata.frameTimes), node.source.frameTimes.tableId);
  }
});

test("B17 unregistered DAG nodes, operations, codecs and looks are refused by the compiler itself, never ignored", async () => {
  const x = finalAB(), v = validated(x), sources = new Map(v.admission.sources.map(s => [s.assetId, { frameTimes: cfrMetadata().frameTimes, width: 90, height: 160 }]));
  const base = { dag: v.dag, admission: v.admission, sources };
  const mutate = (change: (dag: typeof v.dag) => void) => { const dag = structuredClone(v.dag) as typeof v.dag; change(dag); return { ...base, dag }; };
  assert.equal(await refusal(() => compileRenderProgramFromDag(mutate(d => { (d.nodes[0] as { kind: string }).kind = "blur"; }))), "render_program_unsupported");
  assert.equal(await refusal(() => compileRenderProgramFromDag(mutate(d => { (d.settings.video as { codecFamily: string }).codecFamily = "hevc"; }))), "render_program_unsupported");
  assert.equal(await refusal(() => compileRenderProgramFromDag(mutate(d => {
    (d.nodes.find(n => n.kind === "color_look") as { parameters: { look: string } }).parameters.look = "sepia"; }))), "render_program_unsupported");
  assert.equal(await refusal(() => compileRenderProgramFromDag(mutate(d => {
    (d.nodes.find(n => n.kind === "cut_sequence") as { joins: { transition: string }[] }).joins[0]!.transition = "dissolve"; }))), "render_program_unsupported");
  assert.equal(await refusal(() => compileRenderProgramFromDag({ ...base, sources: new Map() })), "source_timebase_mismatch");
  assert.equal(await refusal(() => compileRenderProgramFromDag({ ...base,
    sources: new Map([...sources].map(([k, s]) => [k, { ...s, frameTimes: s.frameTimes.map((value, i) => i === 7 ? value + 0.001 : value) }])) })), "source_timebase_mismatch");
});

// Self-review D3: framing is decided from the analysis's declared aspect, which the accepted metadata schema does not tie to the
// pixel geometry; V0 only scales, so a geometry without the output's display aspect must be refused rather than stretched.
test("B18 a source whose pixel geometry lacks the output display aspect is refused, never stretched", async () => {
  const declared = { ...cfrMetadata({ width: 160, height: 90 }), aspectRatio: { width: 9, height: 16 } };
  const x = renderDag(renderGraph({ sources: [srcA({ key: "b2b_aspect", metadata: declared })] }));
  assert.equal(await refusal(() => compileRenderProgram(validated(x), x.artifacts)), "source_geometry_unsupported");
  const v = validated(finalA()), facts = (width: number, height: number) => new Map(v.admission.sources.map(s => [s.assetId, { frameTimes: cfrMetadata().frameTimes, width, height }]));
  assert.equal(await refusal(() => compileRenderProgramFromDag({ dag: v.dag, admission: v.admission, sources: facts(90, 162) })), "source_geometry_unsupported");
  // The same 9:16 aspect at another size is only scaled.
  assert.equal(compileRenderProgramFromDag({ dag: v.dag, admission: v.admission, sources: facts(36, 64) }).inputs[0]!.video.width, 36);
});

// Self-review T6 (attacks 87-88): the runtime and the executor semantics are part of every execution identity below the EditGraph.
test("B19 another runtime build or executor semantics digest moves the render computation, program and segment identities", () => {
  const base = finalA(), program = compileRenderProgram(validated(base), base.artifacts);
  const runtime = renderDag(graphA(), { runtime: { runtime: { ...REAL_RUNTIME, version: "9.0.2-other_build", implementationDigest: "1".repeat(64) } } });
  const executor = renderDag(graphA(), { executor: { ...REAL_EXECUTOR, implementationDigest: "2".repeat(64) } as typeof REAL_EXECUTOR });
  for (const x of [runtime, executor]) {
    const other = compileRenderProgram(validated(x), x.artifacts);
    assert.equal(x.dag.graph.editGraphId, base.dag.graph.editGraphId, "the edit itself is unchanged");
    assert.notEqual(x.dag.renderIdentity.renderComputationId, base.dag.renderIdentity.renderComputationId);
    assert.notEqual(other.programId, program.programId);
    assert.notEqual(other.segments[0]!.segmentComputationId, program.segments[0]!.segmentComputationId);
  }
});

// ================================================================ B20-B22 the trusted FFmpeg argument compiler
test("B20 the compiled argv hands verified descriptors to FFmpeg, whitelists only the fd protocol and names no path", () => {
  const program = compileRenderProgram(validated(finalAB()), finalAB().artifacts);
  const { argv, descriptors } = compileFfmpegArguments(program, { maxOutputBytes: 8_000_000 });
  assert.deepEqual(descriptors, { inputs: [3, 4], output: 5 });
  const graph = [
    `[0:v:0]trim=start_frame=0:end_frame=60,setpts=PTS-STARTPTS,scale=w=180:h=320:flags=${F},setsar=sar=1/1,format=pix_fmts=yuv420p,`
      + `scale=flags=${F},format=pix_fmts=gbrp,colorchannelmixer=rr=1.0500:gg=1.0000:bb=0.9500,scale=flags=${F},format=pix_fmts=yuv420p[v0]`,
    "[0:a:0]atrim=start_sample=0:end_sample=96000,asetpts=PTS-STARTPTS[a0]",
    `[1:v:0]trim=start_frame=30:end_frame=90,setpts=PTS-STARTPTS,scale=w=180:h=320:flags=${F},setsar=sar=1/1,format=pix_fmts=yuv420p[v1]`,
    "[1:a:0]atrim=start_sample=48000:end_sample=144000,asetpts=PTS-STARTPTS[a1]",
    "[v0][a0][v1][a1]concat=n=2:v=1:a=1[vc][ac]",
    "[vc]settb=expr=1/30[vout]",
    "[ac]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asettb=expr=1/48000[aout]",
  ].join(";");
  const input = (fd: number) => ["-threads", "1", "-protocol_whitelist", "fd", "-f", "mov", "-fd", String(fd), "-i", "fd:"];
  assert.deepEqual(argv, ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-benchmark", "-filter_threads", "1", "-filter_complex_threads", "1",
    ...input(3), ...input(4), "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", "-fps_mode", "passthrough",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "1", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
    "-fs", "8000000", "-protocol_whitelist", "fd", "-f", "mp4", "-fd", "5", "fd:"]);
  for (const value of argv) assert.doesNotMatch(value, /[A-Za-z]:\\|\\\\|\/\/|https?:|file:|pipe:|\.mp4|\.mov|\.bin|\.exe|hwaccel/i, value);
});

test("B21 hostile identifiers and metadata never reach FFmpeg syntax: only integers and fixed tokens enter the filter graph", async () => {
  const program = compileRenderProgram(validated(finalAB()), finalAB().artifacts);
  const forged = structuredClone(program) as RenderProgram;
  forged.inputs[0]!.assetId = "asset_x;movie=C:/Windows/win.ini[out]";
  assert.equal(await refusal(() => compileFfmpegArguments(forged, { maxOutputBytes: 8_000_000 })), "render_program_invalid");
  const { argv } = compileFfmpegArguments(program, { maxOutputBytes: 8_000_000 }), graph = argv[argv.indexOf("-filter_complex") + 1]!;
  for (const id of allStrings(program)) if (/^[a-z_]+_v0_[a-f0-9]{64}$|^asset_[a-f0-9]{64}$/.test(id)) assert.equal(argv.some(a => a.includes(id)), false, id);
  const allowed = /^(?:\d+:[va]:0|[va]\d+|vc|ac|vl|vout|aout|trim=start_frame=\d+:end_frame=\d+|atrim=start_sample=\d+:end_sample=\d+|setpts=PTS-STARTPTS|asetpts=PTS-STARTPTS|scale=w=\d+:h=\d+:flags=[a-z_+]+|scale=flags=[a-z_+]+|setsar=sar=1\/1|format=pix_fmts=(?:yuv420p|gbrp)|colorchannelmixer=rr=\d\.\d{4}:gg=\d\.\d{4}:bb=\d\.\d{4}|eq=contrast=\d\.\d{4}|null|concat=n=\d+:v=1:a=[01]|settb=expr=\d+\/\d+|aformat=sample_fmts=fltp:sample_rates=\d+:channel_layouts=(?:mono|stereo)|asettb=expr=1\/\d+|split=\d+|asplit=\d+)$/;
  for (const token of graph.split(/[;,[\]]/).filter(Boolean)) assert.match(token, allowed, token);
  for (const bad of ["\"", "'", "\\", "$", "`", "%", "&", "|", " ", "\n", "movie", "subtitles", "drawtext", "file", "http", "sendcmd", "zmq"]) assert.equal(graph.includes(bad), false, bad);
});

test("B22 argv is deterministic and bounded; the output bound is a positive integer; a silent program maps no audio", async () => {
  const program = compileRenderProgram(validated(finalAB()), finalAB().artifacts);
  assert.deepEqual(compileFfmpegArguments(program, { maxOutputBytes: 8_000_000 }), compileFfmpegArguments(program, { maxOutputBytes: 8_000_000 }));
  for (const bad of [0, -1, 1.5, Number.NaN, 2 ** 53]) assert.equal(await refusal(() => compileFfmpegArguments(program, { maxOutputBytes: bad })), "input_invalid", String(bad));
  const silent = compileRenderProgram(validated(finalSilent()), finalSilent().artifacts);
  const { argv, descriptors } = compileFfmpegArguments(silent, { maxOutputBytes: 1_000_000 }), graph = argv[argv.indexOf("-filter_complex") + 1]!;
  assert.deepEqual(descriptors, { inputs: [3], output: 4 });
  assert.equal(graph.includes(":a:0"), false); assert.equal(argv.includes("-c:a"), false); assert.equal(argv.includes("[aout]"), false); assert.equal(argv.includes("-flags:a"), false);
  assert.match(graph, /concat=n=1:v=1:a=0\[vc\]/);
});

// ================================================================ B30-B31 strict parsing of the pinned runtime's own reports
test("B30 version banners, build configuration and component listings parse strictly; anything malformed refuses", async () => {
  assert.equal(parseVersionBanner(FFMPEG_VERSION, "ffmpeg"), PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion);
  assert.equal(parseVersionBanner(FFPROBE_VERSION, "ffprobe"), PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion);
  assert.equal(await refusal(() => parseVersionBanner("ffmpeg version 4.4 Copyright", "ffprobe")), "runtime_probe_invalid");
  assert.equal(await refusal(() => parseVersionBanner("garbage", "ffmpeg")), "runtime_probe_invalid");
  assert.deepEqual(parseBuildConfiguration(BUILDCONF), ["--enable-gpl", "--enable-libx264", "--enable-version3"]);
  assert.equal(await refusal(() => parseBuildConfiguration("nothing here")), "runtime_probe_invalid");
  // The pinned build ends -buildconf and -version with a blank line and its exit notice on stdout; only that exact trailer is tolerated.
  assert.deepEqual(parseBuildConfiguration(`${BUILDCONF}\nExiting with exit code 0\n`), ["--enable-gpl", "--enable-libx264", "--enable-version3"]);
  assert.equal(await refusal(() => parseBuildConfiguration(`${BUILDCONF}\nsomething else entirely\n`)), "runtime_probe_invalid");
  assert.equal(await refusal(() => parseBuildConfiguration(`${BUILDCONF}\nExiting with exit code 0\n    --enable-late-flag\n`)), "runtime_probe_invalid");
  assert.deepEqual(parseComponentListing(ENCODERS, "encoders"), ["aac", "h264_nvenc", "libx264", "pcm_s16le"]);
  assert.deepEqual(parseComponentListing(DEMUXERS, "demuxers"), ["3g2", "3gp", "hls", "m4a", "mj2", "mov", "mp4"]);
  assert.deepEqual(parseComponentListing(MUXERS, "muxers"), ["mov", "mp4", "null"]);
  assert.deepEqual(parseComponentListing(PROTOCOLS, "input_protocols"), ["fd", "file", "http"]);
  assert.deepEqual(parseComponentListing(PROTOCOLS, "output_protocols"), ["fd", "file"]);
  assert.equal(parseComponentListing(FILTERS, "filters").length, FILTER_NAMES.length);
  assert.equal(await refusal(() => parseComponentListing("Encoders:\n libx264 no separator", "encoders")), "runtime_probe_invalid");
  assert.equal(await refusal(() => parseComponentListing(`${ENCODERS}\n bogus-line`, "encoders")), "runtime_probe_invalid");
  // Real component names may contain a dot (the pinned build lists the decoder `acelp.kelvin`); a listing is never refused for that.
  assert.deepEqual(parseComponentListing(`${DECODERS}\n A....D acelp.kelvin         Sipro ACELP.KELVIN`, "decoders"), ["aac", "acelp.kelvin", "h264", "pcm_s16le"]);
});

test("B31 benchmark lines are parsed as ffmpeg-reported values; absent or malformed lines stay unavailable", () => {
  assert.deepEqual(parseBenchmark("x\nbench: utime=0.203s stime=0.031s rtime=0.175s\nbench: maxrss=52808KiB\n"),
    { cpuMilliseconds: 234, userMilliseconds: 203, systemMilliseconds: 31, realMilliseconds: 175, maxResidentKibibytes: 52808 });
  assert.equal(parseBenchmark("no benchmark here"), null);
  assert.equal(parseBenchmark("bench: utime=abc stime=0.1s rtime=0.1s\nbench: maxrss=1KiB"), null);
  assert.equal(parseBenchmark("bench: utime=0.1s stime=0.1s rtime=0.1s\nbench: utime=0.2s stime=0.1s rtime=0.1s\nbench: maxrss=1KiB"), null);
});

// ================================================================ B40-B41 real runtime and capability probe records
test("B40 the runtime probe records the exact pinned build, environment and executor, and is available only when all match", async t => {
  const c = await claimed(t), timing = timingAt(c.env.runtime.clock.now());
  const probe = buildRealRuntimeProbe({ dag: c.v, claim: c.claim, observation: observation(), timing, session: SESSION });
  assert.equal(probe.outcome.state, "available");
  assert.deepEqual(probe.runtime, REAL_RUNTIME);
  assert.equal(probe.environment, REAL_ENVIRONMENT);
  assert.deepEqual(probe.executor, REAL_EXECUTOR);
  assert.equal(probe.prober.kind, "real_local_probe");
  assert.equal(probe.binaries.ffmpeg.sha256, PINNED_MEDIA_RUNTIME.ffmpeg.sha256);
  assert.equal(probe.hardware, "none_requested_software_codecs_and_filters_only");
  const cases: [Partial<RuntimeObservation>, string][] = [
    [{ ffmpeg: { ...observation().ffmpeg, sha256: "0".repeat(64) } }, "runtime_binary_mismatch"],
    [{ ffmpeg: { ...observation().ffmpeg, sizeBytes: 1 } }, "runtime_binary_mismatch"],
    [{ ffprobe: { ...observation().ffprobe, sha256: "1".repeat(64) } }, "runtime_binary_mismatch"],
    [{ ffmpeg: { ...observation().ffmpeg, versionText: FFMPEG_VERSION.replace(PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion, "4.4.2") } }, "runtime_version_mismatch"],
    [{ ffprobe: { ...observation().ffprobe, versionText: FFPROBE_VERSION.replace(PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion, "6.0") } }, "runtime_version_mismatch"],
    [{ platform: "linux" }, "runtime_environment_mismatch"],
    [{ arch: "arm64" }, "runtime_environment_mismatch"],
  ];
  for (const [patch, reason] of cases) {
    const bad = buildRealRuntimeProbe({ dag: c.v, claim: c.claim, observation: observation(patch), timing, session: SESSION });
    assert.equal(bad.outcome.state === "unavailable" ? bad.outcome.reasonCode : bad.outcome.state, reason, JSON.stringify(patch).slice(0, 80));
  }
  const noX264 = buildRealRuntimeProbe({ dag: c.v, claim: c.claim, observation: observation({}, { encoders: ENCODERS.replace(/\n V....D libx264.*$/m, "") }), timing, session: SESSION });
  assert.equal(noX264.outcome.state === "unavailable" && noX264.outcome.reasonCode, "encoder_unavailable");
});

test("B41 capability findings come from the finite Gate-6 map and the probed build; unknown IDs and unmet predicates are unavailable", async t => {
  const c = await claimed(t, finalAB()), timing = timingAt(c.env.runtime.clock.now());
  const probe = buildRealCapabilityProbe({ dag: c.v, artifacts: c.call.artifacts, claim: c.claim, observation: observation(), timing, session: SESSION });
  assert.equal(probe.outcome.state, "available");
  assert.deepEqual(probe.findings.map(f => f.capabilityId).sort(), ["color_look", "timeline_source_audio", "timeline_video_clip", "transition_cut"]);
  const missingMixer = buildRealCapabilityProbe({ dag: c.v, artifacts: c.call.artifacts, claim: c.claim,
    observation: observation({}, { filters: FILTERS.replace(/\n \.\. colorchannelmixer.*$/m, "") }), timing, session: SESSION });
  assert.equal(missingMixer.outcome.state, "unavailable");
  assert.deepEqual(missingMixer.findings.filter(f => f.state !== "AVAILABLE").map(f => [f.capabilityId, f.reasonCode]), [["color_look", "filter_unavailable"]]);
  const vfr = renderDag(renderGraph({ sources: [srcA({ key: "b2b_vfr_cap", metadata: vfrMetadata() })], vfr: true }));
  const cv = await claimed(t, vfr);
  const vfrProbe = buildRealCapabilityProbe({ dag: cv.v, artifacts: cv.call.artifacts, claim: cv.claim, observation: observation(), timing: timingAt(cv.env.runtime.clock.now()),
    session: SESSION });
  assert.equal(vfrProbe.findings.find(f => f.capabilityId === "timeline_video_clip")!.reasonCode, "predicate_unsupported");
  const inventory = componentInventoryOf(observation().listings);
  assert.deepEqual(assessCapabilityRequirement({ requirementId: "requirement_x", capabilityId: "time_travel", predicates: [] }, inventory),
    { requirementId: "requirement_x", capabilityId: "time_travel", state: "UNAVAILABLE", reasonCode: "capability_unknown", components: [], unmetPredicates: [] });
  assert.equal(assessCapabilityRequirement({ requirementId: "requirement_y", capabilityId: "color_look", predicates: [{ name: "look", kind: "member", value: "sepia" }] }, inventory).state,
    "UNAVAILABLE");
  assert.equal(assessCapabilityRequirement({ requirementId: "requirement_z", capabilityId: "timeline_video_clip",
    predicates: [{ name: "output_width", kind: "at_most", value: 7681 }] }, inventory).reasonCode, "predicate_unsupported");
});

// ================================================================ B50 staged-input conformance
test("B50 conformance proves the staged bytes match the admitted frame table, grid, geometry and linked-audio format exactly", async t => {
  const c = await claimed(t), staged = await stageAll(c), program = compileRenderProgram(c.v, c.call.artifacts), timing = timingAt(c.env.runtime.clock.now());
  const make = (json: string) => buildStagedInputConformance({ dag: c.v, claim: c.claim, stagedSource: staged[0]!, program, probeJson: json, timing, session: SESSION });
  assert.equal(make(sourceProbeJson()).outcome.state, "conforms");
  const cases: [string, string][] = [
    [sourceProbeJson({ pts: i => i * 512 + (i === 40 ? 7 : 0) }), "source_timebase_mismatch"],
    [sourceProbeJson({ frames: 119 }), "source_timebase_mismatch"],
    [sourceProbeJson({ pts: i => i * 614 }), "source_timebase_mismatch"],
    [sourceProbeJson({ audio: false }), "source_audio_missing"],
    [sourceProbeJson({ sampleRate: 44100, audioSamples: 176_400 }), "source_audio_format_unsupported"],
    [sourceProbeJson({ channels: 1 }), "source_audio_format_unsupported"],
    [sourceProbeJson({ audioStart: 1024 }), "source_audio_alignment_unsupported"],
    [sourceProbeJson({ audioSamples: 90_000 }), "source_audio_insufficient"],
    [sourceProbeJson({ width: 92 }), "source_video_nonconforming"],
    [sourceProbeJson({ sar: "4:3" }), "source_video_nonconforming"],
    [sourceProbeJson({ rotation: 90 }), "source_video_nonconforming"],
    [sourceProbeJson({ codec: "hevc" }), "source_video_nonconforming"],
    [sourceProbeJson({ extra: true }), "source_stream_layout_unsupported"],
  ];
  for (const [json, reason] of cases) {
    const record = make(json);
    assert.equal(record.outcome.state === "nonconforming" && record.outcome.reasonCode, reason, reason);
  }
  const good = JSON.parse(sourceProbeJson());
  for (const malformed of ["", "{", "[]", JSON.stringify({ streams: [], frames: [] }), JSON.stringify({ ...good, programs: [{}] }),
    JSON.stringify({ ...good, streams: [{ ...good.streams[0], width: "90" }] }), JSON.stringify({ ...good, frames: [{ stream_index: 0 }] })]) {
    assert.equal(await refusal(() => parseProbeJson(malformed)), "probe_output_invalid", malformed.slice(0, 40));
  }
});

// ================================================================ B60-B68 permit-binding evaluation over real-shaped evidence
test("B60 complete fresh evidence yields a permit binding bounded by every authority and freshness window, with no location", async t => {
  const c = await claimed(t, finalAB()), e = await evidence(c);
  const binding = await evaluateRealExecutionEvidence(c.call, e);
  assert.equal(binding.evidenceGrade, "real_post_claim_probe_evidence_v0");
  assert.equal(binding.lifecycleAuthority, "synthetic_fixture_registry_only_not_production_v0");
  assert.equal(binding.mediaExecution, "authorized_not_started");
  assert.equal(binding.claim.claimId, c.claim.claimId);
  assert.equal(binding.program.programId, e.program.programId);
  assert.equal(binding.sources.length, 2);
  assert.equal(binding.validUntil, at(binding.authorizedAt, 10_000));
  for (const key of allKeys(binding)) assert.doesNotMatch(key, /(path|url|uri|command|argv|filename)$/i, key);
  for (const value of allStrings(binding)) assert.doesNotMatch(value, /[A-Za-z]:\\|\\\\|https?:|\.exe/i, value);
  confirmPermitBindingCurrent(binding, c.env.runtime.clock.now());
  assert.equal(await refusal(() => confirmPermitBindingCurrent(binding, binding.validUntil)), "permit_expired");
  assert.equal(await refusal(() => confirmPermitBindingCurrent(binding, at(binding.authorizedAt, -1))), "permit_expired");
});

test("B61 ownership, registration and claim binding are rechecked when the permit binding is made", async t => {
  const c = await claimed(t), e = await evidence(c);
  assert.equal(await refusal(() => evaluateRealExecutionEvidence({ ...c.call, ownership: { ...c.ownership } as never }, e)), "runtime:claim_ownership_required");
  const other = await claimed(t, renderDag(graphA(), { grant: { issuedAt: "2026-09-24T00:59:00.000Z" } }));
  assert.equal(await refusal(() => evaluateRealExecutionEvidence({ ...c.call, ownership: other.ownership }, e)), "runtime:claim_ownership_required");
  const foreignStaged = reidentify(e.staged[0]!, "stagedSourceReceiptId", "staged_source_receipt_v0", s => { s.claim.claimId = other.claim.claimId; });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, staged: [foreignStaged] })), "claim_mismatch");
});

test("B62 the execution grant and media grants are rechecked at runtime-now, with exact exclusive expiry boundaries", async t => {
  const c = await claimed(t, renderDag(graphA(), { grant: { expiresAt: "2026-09-24T01:10:01.000Z" }, mediaGrant: { expiresAt: "2026-09-24T01:10:02.000Z" } })), e = await evidence(c);
  c.env.clock.set("2026-09-24T01:10:00.999Z");
  assert.equal((await evaluateRealExecutionEvidence(c.call, e)).validUntil, "2026-09-24T01:10:01.000Z");
  c.env.clock.set("2026-09-24T01:10:01.000Z");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, e)), "runtime:execution_grant_expired");
  const cm = await claimed(t, renderDag(graphA(), { mediaGrant: { expiresAt: "2026-09-24T01:10:01.000Z" } })), em = await evidence(cm);
  cm.env.clock.set("2026-09-24T01:10:00.999Z");
  assert.equal((await evaluateRealExecutionEvidence(cm.call, em)).validUntil, "2026-09-24T01:10:01.000Z");
  cm.env.clock.set("2026-09-24T01:10:01.000Z");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(cm.call, em)), "runtime:media_grant_expired");
});

test("B63 lifecycle, runtime, capability and conformance evidence are each fresh only inside their exclusive window", async t => {
  const fields = [["maxLifecycleObservationAgeMilliseconds", "lifecycle_stale"], ["maxRuntimeProbeAgeMilliseconds", "runtime_probe_stale"],
    ["maxCapabilityProbeAgeMilliseconds", "capability_probe_stale"], ["maxInputConformanceAgeMilliseconds", "input_conformance_stale"]] as const;
  for (const [field, code] of fields) {
    const c = await claimed(t), e = await evidence(c), observedAt = e.runtimeProbe.observedAt;
    const policy = realPolicy({ freshness: { maxRuntimeProbeAgeMilliseconds: 60_000, maxCapabilityProbeAgeMilliseconds: 60_000, maxLifecycleObservationAgeMilliseconds: 60_000,
      maxInputConformanceAgeMilliseconds: 60_000, [field]: 30_000 } });
    c.env.clock.set(at(observedAt, 29_999));
    assert.equal((await evaluateRealExecutionEvidence(c.call, { ...e, policy })).validUntil, at(observedAt, 30_000), field);
    c.env.clock.set(at(observedAt, 30_000));
    assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, policy })), code, field);
  }
});

test("B64 deletion or expiry recorded by the lifecycle authority after staging refuses; retention bounds the binding", async t => {
  const c = await claimed(t), e = await evidence(c, { lifecycle: { deletionRequestedAt: "2026-09-24T01:10:00.100Z", expiresAt: null } });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, e)), "lifecycle_deleted");
  const c2 = await claimed(t), e2 = await evidence(c2, { lifecycle: { deletionRequestedAt: null, expiresAt: "2026-09-24T01:10:03.000Z" } });
  assert.equal((await evaluateRealExecutionEvidence(c2.call, e2)).validUntil, "2026-09-24T01:10:03.000Z");
  c2.env.clock.set("2026-09-24T01:10:03.000Z");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c2.call, e2)), "lifecycle_expired");
});

test("B65 runtime, executor, environment or capability mismatches and unavailable probes refuse", async t => {
  const c = await claimed(t, finalAB()), e = await evidence(c), timing = timingAt(e.runtimeProbe.observedAt);
  const unavailable = buildRealRuntimeProbe({ dag: c.v, claim: c.claim, observation: observation({ ffmpeg: { ...observation().ffmpeg, sha256: "0".repeat(64) } }), timing,
    session: SESSION });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, runtimeProbe: unavailable })), "runtime_binary_mismatch");
  const noEq = buildRealCapabilityProbe({ dag: c.v, artifacts: c.call.artifacts, claim: c.claim, observation: observation({}, { filters: FILTERS.replace(/\n \.\. eq .*$/m, "") }),
    timing, session: SESSION });
  assert.equal(noEq.outcome.state, "available", "eq is not needed by a warm look");
  const noConcat = buildRealCapabilityProbe({ dag: c.v, artifacts: c.call.artifacts, claim: c.claim,
    observation: observation({}, { filters: FILTERS.replace(/\n \.\. concat .*$/m, "") }), timing, session: SESSION });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, capabilityProbe: noConcat })), "capability_unavailable");
  const relabel = (mutate: (p: RealEvidenceBundle["runtimeProbe"]) => void) => reidentify(e.runtimeProbe, "probeId", "real_runtime_probe_v0", mutate);
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, runtimeProbe: relabel(p => { p.environment = "synthetic_local_declared"; }) })),
    "runtime_probe_mismatch");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, runtimeProbe: relabel(p => { p.claim.claimId = `execution_claim_v0_${"0".repeat(64)}`; }) })),
    "claim_mismatch");
  // An admission naming the synthetic Batch-1 executor is never the real executor.
  const syntheticExecutor = { executorId: "synthetic_executor", version: "0.1.0", implementationDigest: "b".repeat(64) };
  const cs = await claimed(t, renderDag(graphA(), { executor: syntheticExecutor }));
  const probe = buildRealRuntimeProbe({ dag: cs.v, claim: cs.claim, observation: observation(), timing: timingAt(cs.env.runtime.clock.now()), session: SESSION });
  assert.equal(probe.outcome.state === "unavailable" && probe.outcome.reasonCode, "executor_identity_mismatch");
});

test("B66 nonconforming, foreign or missing staged-input conformance refuses", async t => {
  const c = await claimed(t), e = await evidence(c, { probeJson: () => sourceProbeJson({ audio: false }) });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, e)), "input_conformance_failed");
  const c2 = await claimed(t), e2 = await evidence(c2);
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c2.call, { ...e2, conformance: [] })), "input_conformance_missing");
  const relabeled = reidentify(e2.conformance[0]!, "conformanceId", "staged_input_conformance_v0", r => { r.stagedSource.stagedSourceReceiptId = `staged_source_receipt_v0_${"1".repeat(64)}`; });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c2.call, { ...e2, conformance: [relabeled] })), "input_conformance_invalid");
});

test("B67 staged bytes are fully re-verified when the binding is made; the original source no longer matters", async t => {
  const c = await claimed(t), e = await evidence(c);
  await rm(c.env.sourcePath("take_0.bin"));
  await evaluateRealExecutionEvidence(c.call, e);
  const stagedPath = c.env.runtime.staging.locate(ownedKey(e.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  await chmod(stagedPath, 0o644); await writeFile(stagedPath, "tampered");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, e)), "runtime:staged_object_corrupt");
});

test("B68 a program other than deterministic compilation from the validated DAG refuses", async t => {
  const c = await claimed(t), e = await evidence(c);
  // A structurally invalid program is refused as invalid; a coherent, schema-valid one that is not the DAG's compilation as a mismatch.
  const inconsistent = reidentify(e.program, "programId", "render_program_v0", p => { p.segments[0]!.video.startFrame = 1; p.segments[0]!.video.frames = 59; });
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, program: inconsistent })), "render_program_invalid");
  const shifted = reidentify(e.program, "programId", "render_program_v0", p => { p.segments[0]!.video.startFrame += 1; p.segments[0]!.video.endFrame += 1; });
  assert.doesNotThrow(() => RenderProgramSchema.parse(shifted));
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, program: shifted })), "render_program_mismatch");
});

// ================================================================ B80-B81 the synthetic-fixture lifecycle authority (filesystem only)
test("B80 the fixture authority registers only bytes it reads inside its own fixture directory and refuses external identities", async t => {
  const env = await runtimeEnv(); t.after(env.cleanup);
  const authority = await createSyntheticFixtureLifecycleAuthority({ root: env.base, clock: env.clock });
  assert.ok(SyntheticFixtureLifecycleAuthority.is(authority));
  await writeFile(join(authority.fixtureDirectory, "fixture_a.mov"), bytesA());
  assert.deepEqual(await authority.registerGeneratedFixture("fixture_a.mov"), { assetId: `asset_${sha256Hex(bytesA())}`, contentHash: sha256Hex(bytesA()), sizeBytes: SIZE_A });
  await writeFile(join(env.base, "outside.mov"), bytesB());
  for (const name of ["../outside.mov", "..\\outside.mov", join(env.base, "outside.mov"), "missing.mov", "", "a/../../outside.mov", "file:outside.mov", "C:outside.mov"]) {
    assert.equal(await refusal(() => authority.registerGeneratedFixture(name)), "lifecycle_authority_scope_invalid", name);
  }
  await mkdir(join(authority.fixtureDirectory, "dir.mov"));
  assert.equal(await refusal(() => authority.registerGeneratedFixture("dir.mov")), "lifecycle_authority_scope_invalid");
  try {
    await symlink(join(env.base, "outside.mov"), join(authority.fixtureDirectory, "link.mov"), "file");
    assert.equal(await refusal(() => authority.registerGeneratedFixture("link.mov")), "lifecycle_authority_scope_invalid");
  } catch (error) { t.diagnostic(`file symlink not creatable here: ${(error as { code?: string }).code ?? "unknown"}`); }
  assert.equal(SyntheticFixtureLifecycleAuthority.is({ ...authority }), false);
});

test("B81 observations are real authoritative queries of the fixture registry, bound to the claim and staging, and reflect later changes", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  const authority = await createSyntheticFixtureLifecycleAuthority({ root: c.env.base, clock: c.env.clock });
  await writeFile(join(authority.fixtureDirectory, "a.bin"), bytesA());
  assert.equal(await refusal(() => authority.observe(c.call, staged[0]!)), "lifecycle_authority_unknown_asset");
  await authority.registerGeneratedFixture("a.bin");
  c.env.clock.advance(10);
  const observed = await authority.observe(c.call, staged[0]!);
  assert.ok(TrustedLifecycleObservation.is(observed));
  assert.equal(observed.record.observer.kind, "real_authoritative_observation");
  assert.equal(observed.record.authorityScope, "synthetic_fixture_assets_only_v0");
  assert.deepEqual(observed.record.lifecycle, { deletionRequestedAt: null, expiresAt: null });
  assert.ok(observed.proves(observed.record));
  assert.equal(TrustedLifecycleObservation.is(structuredClone(observed)), false);
  assert.equal(TrustedLifecycleObservation.is(JSON.parse(JSON.stringify({ record: observed.record }))), false);
  c.env.clock.advance(10);
  authority.requestDeletion(staged[0]!.source.assetId);
  assert.equal((await authority.observe(c.call, staged[0]!)).record.lifecycle.deletionRequestedAt, c.env.runtime.clock.now());
  authority.setExpiry(staged[0]!.source.assetId, "2026-09-24T02:00:00.000Z");
  assert.equal((await authority.observe(c.call, staged[0]!)).record.lifecycle.expiresAt, "2026-09-24T02:00:00.000Z");
  const early = reidentify(staged[0]!, "stagedSourceReceiptId", "staged_source_receipt_v0", s => { s.stagedAt = "2026-09-24T02:30:00.000Z"; });
  assert.equal(await refusal(() => authority.observe(c.call, early)), "evidence_chronology_invalid");
  const plainOwnership = await refusal(() => authority.observe({ ...c.call, ownership: {} as never }, staged[0]!));
  assert.equal(plainOwnership, "runtime:claim_ownership_required");
});

// Owner-review finding 1 (critical): a genuine handle's evidence is a private snapshot. A record reached through the handle and
// mutated, even with its content identity coherently recomputed, is never certified and never changes the handle's evidence.
test("B82 a genuine lifecycle handle never certifies a record mutated through it; its evidence stays the authority's own", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  const authority = await createSyntheticFixtureLifecycleAuthority({ root: c.env.base, clock: c.env.clock });
  await writeFile(join(authority.fixtureDirectory, "a.bin"), bytesA());
  await authority.registerGeneratedFixture("a.bin");
  authority.requestDeletion(staged[0]!.source.assetId);
  c.env.clock.advance(10);
  const handle = await authority.observe(c.call, staged[0]!);
  const original = canonicalSerialize(handle.record);
  assert.notEqual(handle.record.lifecycle.deletionRequestedAt, null);
  const reached = handle.record;
  reached.lifecycle.deletionRequestedAt = null;
  const { observationId: _old, ...body } = reached;
  reached.observationId = identify("fixture_lifecycle_observation_v0", "observationId", body).observationId;
  FixtureLifecycleObservationSchema.parse(reached);
  assert.equal(handle.proves(reached), false, "a record mutated through the handle is never certified");
  assert.equal(canonicalSerialize(handle.record), original, "the handle's evidence is unchanged");
  assert.ok(handle.proves(handle.record));
  assert.throws(() => JSON.stringify(handle), (e: unknown) => e instanceof EditRenderError && e.code === "trust_handle_required");
});

// ================================================================ B86-B88 receipts and accounting
function measurements(patch: Record<string, unknown> = {}) {
  return { wallClockMilliseconds: 420, benchmark: { cpuMilliseconds: 234, userMilliseconds: 203, systemMilliseconds: 31, realMilliseconds: 175, maxResidentKibibytes: 52808 },
    outputBytes: 128_995, ...patch } as Parameters<typeof deriveAccounting>[0]["measurements"];
}
/** Which owner accounting ruling a record applied, read without assuming the field exists. */
const rulingOf = (accounting: object) => (accounting as { ruling?: unknown }).ruling;
const LOCAL_RULING = "owner_local_non_metered_pinned_executor_ruling_v0";
// Owner accounting ruling (2026-09-26): for the one pinned local executor, FFmpeg's own CPU-time and peak-commit reports are accepted
// attributed evidence, and total monetary cost is not applicable to local, non-metered execution. Nothing is relabelled or invented.
test("B86 under the owner's local ruling the pinned executor reconciles to PASS: FFmpeg reports stay attributed, total cost is not applicable and never zero; a missing report stays PARTIAL and an exceeded ceiling fails", async t => {
  const c = await claimed(t, finalAB()), program = compileRenderProgram(c.v, c.call.artifacts), reservation = c.x.chain.reservation;
  const accounting = deriveAccounting({ program, reservation, measurements: measurements() });
  assert.deepEqual(Object.fromEntries(accounting.dimensions.map(d => [d.dimension, d.coverage])), { wallClockMilliseconds: "measured", cpuMilliseconds: "ffmpeg_reported",
    peakRamBytes: "ffmpeg_reported", gpuMilliseconds: "not_applicable", peakVramBytes: "not_applicable", apiSpendInrMicros: "not_applicable", totalCostInrMicros: "not_applicable",
    modelCalls: "not_applicable", frames: "derived", pixelFrames: "derived", audioMilliseconds: "derived", outputBytes: "measured" });
  assert.deepEqual({ status: accounting.status, ruling: rulingOf(accounting) }, { status: "PASS", ruling: LOCAL_RULING });
  const row = (name: string, a = accounting) => a.dimensions.find(d => d.dimension === name)!;
  const value = (name: string, a = accounting) => row(name, a).value;
  assert.equal(value("frames"), 120); assert.equal(value("pixelFrames"), 120 * 180 * 320); assert.equal(value("audioMilliseconds"), 4000);
  assert.equal(value("peakRamBytes"), 52808 * 1024); assert.equal(value("cpuMilliseconds"), 234); assert.equal(value("gpuMilliseconds"), 0);
  // Total monetary cost carries no value at all: not applicable is never a measured or estimated zero, and never "local compute is free".
  assert.deepEqual({ value: value("totalCostInrMicros"), within: row("totalCostInrMicros").withinReservation, basis: row("totalCostInrMicros").basis },
    { value: null, within: null, basis: "local_non_metered_execution_no_billable_provider_or_owner_cost_model_not_zero_v0" });
  // Self-review D6: a row says exactly what its value is. On the pinned win32 build FFmpeg's "maxrss" is the process's
  // PeakPagefileUsage from GetProcessMemoryInfo (peak private commit), not a resident-set peak, and its "utime"/"stime" are the
  // process's user and kernel times from GetProcessTimes. The ruling accepts them as attributed evidence; it never relabels them.
  assert.equal(row("peakRamBytes").basis, "ffmpeg_benchmark_maxrss_win32_peak_pagefile_usage_self_reported_v0");
  assert.equal(row("cpuMilliseconds").basis, "ffmpeg_benchmark_win32_process_user_plus_kernel_time_self_reported_v0");
  // Each not-applicable dimension is proven by this executor's own semantics, which its identity digests: software codecs and filters
  // only, fd-only protocols in and out, and nothing else invoked.
  assert.deepEqual({ hardware: RENDER_SEMANTICS.hardware, input: RENDER_SEMANTICS.input.protocol, output: RENDER_SEMANTICS.container.outputProtocol,
    executorDigest: program.executor.implementationDigest }, { hardware: "none_software_codecs_and_filters_only", input: "fd_only", output: "fd_only", executorDigest: RENDER_SEMANTICS_DIGEST });
  // A dimension without truthful coverage is never relabelled: without FFmpeg's complete report, CPU time and peak commit are unavailable
  // and the accounting stays PARTIAL.
  const noBench = deriveAccounting({ program, reservation, measurements: measurements({ benchmark: null }) });
  assert.deepEqual({ cpu: row("cpuMilliseconds", noBench).coverage, ram: row("peakRamBytes", noBench).coverage, status: noBench.status },
    { cpu: "unavailable", ram: "unavailable", status: "PARTIAL" });
  const exceeded = deriveAccounting({ program, reservation: { ...reservation, cpuMilliseconds: 100 }, measurements: measurements() });
  assert.equal(exceeded.status, "FAIL");
  assert.deepEqual(exceeded.dimensions.filter(d => d.withinReservation === false).map(d => d.dimension), ["cpuMilliseconds"]);
});

test("B87 success and failure receipts are structurally distinct, location-free and replay their own accounting", async t => {
  const c = await claimed(t, finalAB()), e = await evidence(c), binding = await evaluateRealExecutionEvidence(c.call, e), reservation = c.x.chain.reservation;
  const start = buildExecutionStart({ binding, startedAt: c.env.runtime.clock.now() });
  const process = { spawnedAt: start.startedAt, completedAt: at(start.startedAt, 400), exitCode: 0, signal: null, timeoutMilliseconds: 120_000,
    outputByteBound: 23_320_576, argvDigest: "a".repeat(64), argvCount: 90 };
  const args = { binding, start, program: e.program, runtimeProbe: e.runtimeProbe, reservation, process, measurements: measurements(),
    output: { contentHash: "c".repeat(64), sizeBytes: 128_995, publication: "published_by_this_execution" as const },
    diagnostics: { capturedBytes: 1200, sha256: "d".repeat(64), truncated: false, excerpt: ["bench: maxrss=52808KiB"] }, inputReverification: "unchanged_after_exit" as const,
    recordedAt: at(start.startedAt, 500) };
  const receipt = buildSuccessReceipt(args);
  RenderExecutionReceiptSchema.parse(receipt);
  assert.equal(receipt.outcome, "succeeded");
  assert.notEqual(receipt.output.outputArtifactId.slice(-64), receipt.renderComputationId.slice(-64));
  for (const key of allKeys(receipt)) assert.doesNotMatch(key, /(path|url|uri|command|filename)$/i, key);
  for (const value of allStrings(receipt)) assert.doesNotMatch(value, /[A-Za-z]:\\|\\\\|https?:|\.exe|\.bin/i, value);
  const forged = reidentify(receipt, "receiptId", "render_execution_receipt_v0", r => { r.accounting.dimensions.find(d => d.dimension === "cpuMilliseconds")!.coverage = "measured"; });
  assert.throws(() => RenderExecutionReceiptSchema.parse(forged));
  // A genuinely PARTIAL record (no complete FFmpeg report) is never relabelled PASS.
  const partial = buildSuccessReceipt({ ...args, measurements: measurements({ benchmark: null }) });
  assert.equal(partial.accounting.status, "PARTIAL");
  const inflated = reidentify(partial, "receiptId", "render_execution_receipt_v0", r => { r.accounting.status = "PASS"; });
  assert.throws(() => RenderExecutionReceiptSchema.parse(inflated));
  const failure = buildFailureReceipt({ binding, start, program: e.program, runtimeProbe: e.runtimeProbe, reservation, stage: "process", failureCode: "process_timeout",
    process: { ...process, completedAt: at(start.startedAt, 50), exitCode: null, signal: "SIGTERM", timedOut: true, timeoutMilliseconds: 50 },
    measurements: measurements({ benchmark: null, outputBytes: null }), diagnostics: { capturedBytes: 0, sha256: sha256Hex(""), truncated: false, excerpt: [] },
    inputVerification: "verified_before_spawn", inputReverification: "unchanged_after_exit", failedAt: at(start.startedAt, 60) });
  assert.throws(() => buildFailureReceipt({ binding, start, program: e.program, runtimeProbe: e.runtimeProbe, reservation, stage: "process", failureCode: "process_timeout",
    process: { ...process, exitCode: null, signal: "SIGTERM", timedOut: false }, measurements: measurements({ outputBytes: null }),
    diagnostics: { capturedBytes: 0, sha256: sha256Hex(""), truncated: false, excerpt: [] }, inputVerification: "verified_before_spawn", inputReverification: "unchanged_after_exit",
    failedAt: at(start.startedAt, 60) }), "a timeout record must say the process timed out");
  RenderExecutionFailureSchema.parse(failure);
  assert.equal(failure.outcome, "failed");
  // A failure states explicitly that nothing was published and can carry no output identity.
  assert.equal(failure.output, "none_published");
  assert.equal(allKeys(failure).has("outputArtifactId") || allKeys(failure).has("publication"), false);
  assert.throws(() => RenderExecutionReceiptSchema.parse(failure));
  assert.throws(() => RenderExecutionFailureSchema.parse(receipt));
});

// Owner accounting ruling, scope: it covers only the exact executor build, environment and runtime it names. Any other execution, for
// example a future metered cloud executor, inherits none of it and needs its own owner-approved cost model and accounting evidence.
test("B92 the local accounting ruling covers only the exact pinned executor, environment and runtime; any other execution inherits none of it and never reconciles to PASS", async t => {
  const c = await claimed(t, finalAB()), e = await evidence(c), binding = await evaluateRealExecutionEvidence(c.call, e), reservation = c.x.chain.reservation;
  const start = buildExecutionStart({ binding, startedAt: c.env.runtime.clock.now() });
  const receipt = buildSuccessReceipt({ binding, start, program: e.program, runtimeProbe: e.runtimeProbe, reservation, measurements: measurements(),
    process: { spawnedAt: start.startedAt, completedAt: at(start.startedAt, 400), exitCode: 0, signal: null, timeoutMilliseconds: 120_000, outputByteBound: 23_320_576,
      argvDigest: "a".repeat(64), argvCount: 90 },
    output: { contentHash: "c".repeat(64), sizeBytes: 128_995, publication: "published_by_this_execution" },
    diagnostics: { capturedBytes: 0, sha256: sha256Hex(""), truncated: false, excerpt: [] }, inputReverification: "unchanged_after_exit", recordedAt: at(start.startedAt, 500) });
  const ruled = ["cpuMilliseconds", "peakRamBytes", "gpuMilliseconds", "peakVramBytes", "apiSpendInrMicros", "totalCostInrMicros", "modelCalls"];
  const summary = (record: typeof receipt) => {
    const accounting = accountingOfReceipt(record);
    return { status: accounting.status, ruling: rulingOf(accounting), rows: Object.fromEntries(accounting.dimensions.filter(d => ruled.includes(d.dimension))
      .map(d => [d.dimension, `${d.coverage}:${d.value}`])) };
  };
  // The same measurements, ceilings and work, attributed to another executor build, executor, environment or runtime.
  const variants: Record<string, typeof receipt> = {
    another_executor_build: { ...receipt, executor: { ...receipt.executor, implementationDigest: "e".repeat(64) } },
    another_executor: { ...receipt, executor: { ...receipt.executor, executorId: "cloud_ffmpeg_render_executor" } },
    another_environment: { ...receipt, environment: "cloud_linux_x64" },
    another_runtime: { ...receipt, runtime: { ...receipt.runtime, implementationDigest: "f".repeat(64) } },
  };
  const observed = { pinned_local_execution: summary(receipt), ...Object.fromEntries(Object.entries(variants).map(([name, record]) => [name, summary(record)])) };
  const reported = { cpuMilliseconds: "ffmpeg_reported:234", peakRamBytes: `ffmpeg_reported:${52808 * 1024}` };
  const inherited = { status: "PARTIAL", ruling: "no_owner_accounting_ruling_for_this_execution_v0", rows: { ...reported, gpuMilliseconds: "unavailable:null",
    peakVramBytes: "unavailable:null", apiSpendInrMicros: "unavailable:null", totalCostInrMicros: "unavailable:null", modelCalls: "unavailable:null" } };
  assert.deepEqual(observed, {
    pinned_local_execution: { status: "PASS", ruling: LOCAL_RULING, rows: { ...reported, gpuMilliseconds: "not_applicable:0", peakVramBytes: "not_applicable:0",
      apiSpendInrMicros: "not_applicable:0", totalCostInrMicros: "not_applicable:null", modelCalls: "not_applicable:0" } },
    another_executor_build: inherited, another_executor: inherited, another_environment: inherited, another_runtime: inherited });
  // A record relabelled to another executor that keeps the local PASS fails its own schema, however coherently it is re-identified.
  const relabelled = reidentify(receipt, "receiptId", "render_execution_receipt_v0", r => { r.executor = { ...r.executor, implementationDigest: "e".repeat(64) }; });
  assert.throws(() => RenderExecutionReceiptSchema.parse(relabelled));
});

// Owner-review finding 3: a failure after this execution's own link names that output; it never claims that nothing was published.
test("B89 a failure record names an output only when this completed execution linked it, at the stage where certification stopped", async t => {
  const c = await claimed(t, finalAB()), e = await evidence(c), binding = await evaluateRealExecutionEvidence(c.call, e), reservation = c.x.chain.reservation;
  const start = buildExecutionStart({ binding, startedAt: c.env.runtime.clock.now() });
  const process = { spawnedAt: start.startedAt, completedAt: at(start.startedAt, 400), exitCode: 0, signal: null, timeoutMilliseconds: 120_000,
    outputByteBound: 23_320_576, argvDigest: "a".repeat(64), argvCount: 90 };
  const meaning = "this_execution_linked_an_object_under_this_content_identity_but_no_success_receipt_certifies_it_v0" as const;
  const base = { binding, start, program: e.program, runtimeProbe: e.runtimeProbe, reservation, process, measurements: measurements(),
    diagnostics: { capturedBytes: 0, sha256: sha256Hex(""), truncated: false, excerpt: [] }, inputVerification: "verified_before_spawn" as const,
    inputReverification: "unchanged_after_exit" as const, failedAt: at(start.startedAt, 500) };
  const verifiedOutput = { state: "published_by_this_execution_uncertified" as const, contentHash: "c".repeat(64), sizeBytes: 128_995, meaning };
  const linkedOutput = { ...verifiedOutput, state: "linked_by_this_execution_unverified" as const };
  const uncertified = buildFailureReceipt({ ...base, stage: "receipt_certification", failureCode: "evidence_chronology_invalid", output: verifiedOutput });
  assert.deepEqual(RenderExecutionFailureSchema.parse(uncertified).output, verifiedOutput);
  assert.equal(uncertified.outcome, "failed");
  RenderExecutionFailureSchema.parse(buildFailureReceipt({ ...base, stage: "publication", failureCode: "output_publication_corrupt", output: linkedOutput }));
  // Only at the stage where certification stopped, only after exit 0, only for the bytes the execution measured, never before a start.
  assert.throws(() => buildFailureReceipt({ ...base, stage: "process", failureCode: "execution_interrupted", output: verifiedOutput }));
  assert.throws(() => buildFailureReceipt({ ...base, stage: "publication", failureCode: "output_publication_corrupt", output: verifiedOutput }));
  assert.throws(() => buildFailureReceipt({ ...base, stage: "receipt_certification", failureCode: "evidence_chronology_invalid", output: linkedOutput }));
  assert.throws(() => buildFailureReceipt({ ...base, process: { ...process, exitCode: 1 }, stage: "receipt_certification", failureCode: "evidence_chronology_invalid",
    output: verifiedOutput }));
  assert.throws(() => buildFailureReceipt({ ...base, measurements: measurements({ outputBytes: 1 }), stage: "receipt_certification",
    failureCode: "evidence_chronology_invalid", output: verifiedOutput }));
  assert.throws(() => buildFailureReceipt({ ...base, start: null, process: null, stage: "receipt_certification", failureCode: "evidence_chronology_invalid",
    output: verifiedOutput }));
  assert.equal(buildFailureReceipt({ ...base, stage: "process", failureCode: "execution_interrupted" }).output, "none_published");
});

test("B88 the timeout and output bound derive from owner policy, the reservation and the exact work, never from a caller", async t => {
  const c = await claimed(t, finalAB()), program = compileRenderProgram(c.v, c.call.artifacts), reservation = c.x.chain.reservation;
  assert.equal(deriveRenderTimeoutMilliseconds(realPolicy(), reservation), 120_000);
  assert.equal(deriveRenderTimeoutMilliseconds(realPolicy(), { ...reservation, wallClockMilliseconds: 5_000 }), 5_000);
  assert.equal(deriveOutputByteBound(program, realPolicy()), 120 * 180 * 320 * 3 + 192_000 * 2 * 4 + 1_048_576);
  assert.equal(deriveOutputByteBound(program, realPolicy({ output: { maxOutputBytes: 10_000 } })), 10_000);
  assert.throws(() => realPolicy({ process: { maxWallClockMilliseconds: 600_001 } }));
  assert.throws(() => realPolicy({ permitLifetimeMilliseconds: 30_001 }));
  assert.throws(() => realPolicy({ output: { maxOutputBytes: 0 } }));
});

// ================================================================ B90-B91 technical QC logic
function qcObservation(o: { width?: number; rate?: string; frames?: number; audio?: false | { rate: number; channels: number; samples: number }; decodeErrors?: string[];
  duration?: string; extraStream?: boolean } = {}) {
  const audio = o.audio === undefined ? { rate: 48000, channels: 2, samples: 192_000 } : o.audio, frames = o.frames ?? 120;
  const streams: unknown[] = [{ index: 0, codec_name: "h264", profile: "High", codec_type: "video", width: o.width ?? 180, height: 320, sample_aspect_ratio: "1:1", pix_fmt: "yuv420p",
    r_frame_rate: o.rate ?? "30/1", avg_frame_rate: o.rate ?? "30/1", time_base: "1/15360", start_pts: 0, duration_ts: frames * 512, nb_read_frames: String(frames) }];
  if (audio) streams.push({ index: 1, codec_name: "aac", profile: "LC", codec_type: "audio", sample_rate: String(audio.rate), channels: audio.channels,
    channel_layout: audio.channels === 2 ? "stereo" : "mono", r_frame_rate: "0/0", avg_frame_rate: "0/0", time_base: `1/${audio.rate}`, start_pts: 0, duration_ts: audio.samples,
    nb_read_frames: String(Math.ceil(audio.samples / 1024)) });
  if (o.extraStream) streams.push({ index: streams.length, codec_name: "mov_text", codec_type: "subtitle" });
  const list: unknown[] = Array.from({ length: frames }, (_, i) => ({ stream_index: 0, pts: i * 512 }));
  if (audio) for (let s = 0; s < audio.samples; s += 1024) list.push({ stream_index: 1, pts: s, nb_samples: Math.min(1024, audio.samples - s) });
  const format = { format_name: "mov,mp4,m4a,3gp,3g2,mj2" };
  return { streamsJson: JSON.stringify({ programs: [], stream_groups: [], streams, format: { ...format, nb_streams: streams.length, duration: o.duration ?? (frames / 30).toFixed(6),
    size: "128995" } }), framesJson: JSON.stringify({ frames: list, programs: [], stream_groups: [], streams, format }), decode: { exitCode: 0, errorLines: o.decodeErrors ?? [] } };
}
test("B90 QC expectations derive from the DAG itself; an exact observation passes and every deviation fails its own check", () => {
  const expectation = deriveQcExpectation(finalAB().dag), id = { contentHash: "a".repeat(64), sizeBytes: 128_995 };
  assert.deepEqual(expectation, { resolution: { width: 180, height: 320 }, frameRate: { numerator: 30, denominator: 1 }, frames: 120, durationTicks: 4_000_000_000,
    ticksPerSecond: 1_000_000_000, video: { codecName: "h264", pixelFormat: "yuv420p" }, audio: { state: "encoded", codecName: "aac", sampleRateHz: 48000, channels: 2,
      channelLayout: "stereo", samples: 192_000 }, formatDurationToleranceMicroseconds: 1000, container: "mov,mp4,m4a,3gp,3g2,mj2" });
  const pass = evaluateTechnicalQc(expectation, id, id, qcObservation());
  assert.equal(pass.verdict, "pass", JSON.stringify(pass.checks.filter(check => check.outcome === "fail")));
  const failures = (observed: ReturnType<typeof qcObservation>, claimed = id) =>
    evaluateTechnicalQc(expectation, claimed, id, observed).checks.filter(check => check.outcome === "fail").map(check => check.checkId);
  assert.deepEqual(failures(qcObservation({ width: 176 })), ["video_geometry"]);
  assert.deepEqual(failures(qcObservation({ rate: "25/1" })), ["video_frame_rate"]);
  assert.deepEqual(failures(qcObservation({ frames: 119, audio: { rate: 48000, channels: 2, samples: 190_400 } })), ["video_frame_count", "audio_samples", "container_duration"]);
  assert.deepEqual(failures(qcObservation({ duration: "4.500000" })), ["container_duration"]);
  assert.deepEqual(failures(qcObservation({ audio: false })), ["stream_layout"]);
  assert.deepEqual(failures(qcObservation({ audio: { rate: 44100, channels: 2, samples: 176_400 } })), ["audio_format", "audio_samples"]);
  assert.deepEqual(failures(qcObservation({ audio: { rate: 48000, channels: 1, samples: 192_000 } })), ["audio_format"]);
  assert.deepEqual(failures(qcObservation({ decodeErrors: ["[h264 @ x] error while decoding MB"] })), ["complete_decode"]);
  assert.deepEqual(failures(qcObservation({ extraStream: true })), ["stream_layout"]);
  assert.deepEqual(failures(qcObservation(), { contentHash: "b".repeat(64), sizeBytes: 128_995 }), ["output_identity"]);
  const silent = deriveQcExpectation(finalSilent().dag);
  assert.deepEqual(silent.audio, { state: "none" });
  assert.deepEqual(evaluateTechnicalQc(silent, id, id, qcObservation({ frames: 60 })).checks.filter(check => check.outcome === "fail").map(check => check.checkId), ["stream_layout"]);
});

test("B91 malformed or unexpected probe output fails QC rather than passing silently", () => {
  const expectation = deriveQcExpectation(finalAB().dag), id = { contentHash: "a".repeat(64), sizeBytes: 128_995 };
  for (const bad of [{ ...qcObservation(), streamsJson: "{" }, { ...qcObservation(), framesJson: "not json" }, { ...qcObservation(), streamsJson: JSON.stringify({ streams: "x" }) },
    { ...qcObservation(), decode: { exitCode: 1, errorLines: [] } }]) assert.equal(evaluateTechnicalQc(expectation, id, id, bad).verdict, "fail");
});

// ================================================================ B96-B97 static boundaries of the pure core
const CORE = () => readdirSync("packages/edit-render").filter(f => f.endsWith(".ts")).map(f => `packages/edit-render/${f}`);
function walk(node: ts.Node, visit: (node: ts.Node) => void): void { visit(node); ts.forEachChild(node, child => walk(child, visit)); }
test("B96 the pure core imports only zod, node:crypto and accepted internal modules and has no process, file, network, clock or entropy access", () => {
  assert.ok(CORE().length >= 5);
  for (const path of CORE()) {
    const text = readFileSync(path, "utf8"), source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    walk(source, node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const s = node.moduleSpecifier.text;
        assert.ok(s === "zod" || s === "node:crypto" || s.startsWith("./")
          || /^\.\.\/(contracts|domain|editorial|edit-graph|edit-execution|edit-runtime|footage-analyzer|reference-analyzer|routing|planning)\//.test(s), `${path}: ${s}`);
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        // A bare call of any process or evaluation entry point, or a property call of the process ones (RegExp.prototype.exec is not a process).
        const callee = node.expression;
        if (ts.isIdentifier(callee)) assert.equal(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork", "fetch", "eval", "Function", "require"].includes(callee.text),
          false, `${path}: ${callee.text}`);
        if (ts.isPropertyAccessExpression(callee)) assert.equal(["spawn", "spawnSync", "execSync", "execFile", "execFileSync", "fork"].includes(callee.name.text), false,
          `${path}: ${callee.name.text}`);
      }
    });
    assert.doesNotMatch(text, /child_process|node:fs|node:net|node:http|Date\.now|new Date|Math\.random|process\.env|process\.platform|process\.arch/, path);
  }
});

test("B97 the core never mutates its inputs: compilation and evaluation leave the DAG and EditGraph bytes unchanged", async t => {
  const x = finalAB(), graph = x.artifacts.find(a => a.ref.artifactType === "EditGraph")!;
  const before = JSON.stringify(graph.value), dagBefore = JSON.stringify(x.dag);
  const c = await claimed(t, x), e = await evidence(c);
  await evaluateRealExecutionEvidence(c.call, e);
  compileFfmpegArguments(e.program, { maxOutputBytes: 8_000_000 });
  assert.equal(JSON.stringify(graph.value), before);
  assert.equal(JSON.stringify(x.dag), dagBefore);
  for (const key of ["rendered", "outputPath", "receiptId", "executionStatus", "lastRender", "qcStatus"]) assert.equal(allKeys(graph.value).has(key), false, key);
});
