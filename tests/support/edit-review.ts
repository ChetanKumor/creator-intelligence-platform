// Test-only Gate-7 Batch-3A helpers. Replay-valid chains are rendered "on paper" through the accepted Batch-2B pure builders only:
// real-shaped probe records over opaque test bytes, a permit binding, a success receipt naming synthetic output bytes and a technical-QC
// receipt built from synthetic probe JSON. Decoded frames and audio are synthetic byte arrays, and the semantic critic here is a
// deterministic synthetic fixture, not a model. Nothing here starts a process, decodes media or reaches a network.
import type { TestContext } from "node:test";
import { acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, timestampAt, type RuntimeCall, type StagedSourceReceipt,
  type ValidatedExecutionDag } from "../../packages/edit-runtime/index.js";
import { PINNED_MEDIA_RUNTIME, RENDER_ENVIRONMENT, buildExecutionStart, buildFixtureLifecycleObservation, buildQcReceipt, buildRealCapabilityProbe, buildRealRuntimeProbe,
  buildStagedInputConformance, buildSuccessReceipt, compileRenderProgram, evaluateRealExecutionEvidence, type RenderExecutionReceipt, type RenderProgram,
  type RuntimeObservation, type TechnicalMediaQcReceipt } from "../../packages/edit-render/index.js";
import type { SuppliedArtifact } from "../../packages/editorial/common.js";
import type { SemanticCriticInput, SemanticCriticPort } from "../../packages/edit-review/index.js";
import { mergeArtifacts, type DagFixture } from "./edit-execution.js";
import { RUNTIME_EVIDENCE, deterministicBytes, runtimeEnv, sha256Hex, type RuntimeEnv } from "./edit-runtime.js";
import { cfrMetadata, realPolicy, renderDag, renderGraph, type RenderGraphOptions } from "./edit-render.js";

export { sha256Hex };
const at = (base: string, offset: number) => timestampAt(Date.parse(base) + offset);
const SESSION = { scheme: "sha256_of_ephemeral_session_token_v0" as const, digest: sha256Hex("batch3a-pure-test-session") };

// ---------------------------------------------------------------- real-shaped listings of the pinned build (the accepted Batch-2B test data)
const listing = (title: string, legend: string[], separator: string, rows: string[]) => [`${title}:`, ...legend, separator, ...rows].join("\n");
const CODEC_LEGEND = [" V..... = Video", " A..... = Audio", " S..... = Subtitle", " .F.... = Frame-level multithreading", " ..S... = Slice-level multithreading",
  " ...X.. = Codec is experimental", " ....B. = Supports draw_horiz_band", " .....D = Supports direct rendering method 1"];
const FILTER_NAMES = ["trim", "atrim", "setpts", "asetpts", "scale", "setsar", "format", "aformat", "concat", "settb", "asettb", "split", "asplit", "null", "colorchannelmixer", "eq"];
const FORMAT_LEGEND = [" D.. = Demuxing supported", " .E. = Muxing supported", " ..d = Is a device"];
const OBSERVATION: RuntimeObservation = {
  ffmpeg: { sha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffmpeg.sizeBytes,
    versionText: `ffmpeg version ${PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion} Copyright (c) 2000-2026 the FFmpeg developers\nbuilt with gcc 16.1.0\nconfiguration: --enable-gpl --enable-libx264`,
    buildConfigurationText: "\n  configuration:\n    --enable-gpl\n    --enable-version3\n    --enable-libx264\n" },
  ffprobe: { sha256: PINNED_MEDIA_RUNTIME.ffprobe.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffprobe.sizeBytes,
    versionText: `ffprobe version ${PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion} Copyright (c) 2007-2026 the FFmpeg developers` },
  listings: {
    encoders: listing("Encoders", CODEC_LEGEND, " ------", [" V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)",
      " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]),
    decoders: listing("Decoders", CODEC_LEGEND, " ------", [" VFS..D h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
      " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]),
    filters: listing("Filters", ["  T.. = Timeline support", "  .S. = Slice threading", "  A = Audio input/output", "  V = Video input/output",
      "  N = Dynamic number and/or type of input/output", "  | = Source or sink filter"], "  ------", FILTER_NAMES.map(n => ` .. ${n.padEnd(16)} V->V       The ${n} filter.`)),
    muxers: listing("Formats", FORMAT_LEGEND, " ---", ["  E  mov             QuickTime / MOV", "  E  mp4             MP4 (MPEG-4 Part 14)"]),
    demuxers: listing("Formats", FORMAT_LEGEND, " ---", [" D   mov,mp4,m4a,3gp,3g2,mj2 QuickTime / MOV"]),
    protocols: ["Supported file protocols:", "Input:", "  fd", "Output:", "  fd"].join("\n"),
  },
  platform: RENDER_ENVIRONMENT.platform, arch: RENDER_ENVIRONMENT.arch,
};
/** ffprobe JSON of a staged source exactly on the 30 fps grid (MOV timescale 15360), with 48 kHz stereo PCM when `audio` is set. */
function sourceProbeJson(audio: boolean, seconds: number): string {
  const streams: unknown[] = [{ index: 0, codec_name: "h264", codec_type: "video", width: 90, height: 160, sample_aspect_ratio: "1:1", pix_fmt: "yuv420p", time_base: "1/15360", start_pts: 0 }];
  if (audio) streams.push({ index: 1, codec_name: "pcm_s16le", codec_type: "audio", sample_rate: "48000", channels: 2, channel_layout: "stereo", time_base: "1/48000", start_pts: 0 });
  const frames: unknown[] = Array.from({ length: seconds * 30 }, (_, i) => ({ stream_index: 0, pts: i * 512 }));
  const total = seconds * 48_000;
  if (audio) for (let s = 0; s < total; s += 1024) frames.push({ stream_index: 1, pts: s, nb_samples: Math.min(1024, total - s) });
  return JSON.stringify({ frames, programs: [], stream_groups: [], streams, format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" } });
}
/** ffprobe JSON of a rendered output exactly as QC expects it (or with one frame missing when `damaged`). */
function outputProbeJson(program: RenderProgram, damaged: boolean): { streamsJson: string; framesJson: string } {
  const { width, height } = program.output.resolution, frames = program.output.frames - (damaged ? 1 : 0), audio = program.output.audio;
  const rate = `${program.output.frameRate.numerator}/${program.output.frameRate.denominator}`, tb = program.output.frameRate.numerator * 512;
  const streams: Record<string, unknown>[] = [{ index: 0, codec_type: "video", codec_name: "h264", width, height, sample_aspect_ratio: "1:1", pix_fmt: "yuv420p", r_frame_rate: rate,
    avg_frame_rate: rate, time_base: `1/${tb}`, duration_ts: program.output.frames * 512 * program.output.frameRate.denominator }];
  const samples = program.segments.reduce((n, s) => n + (s.audio.state === "linked" ? s.audio.endSample - s.audio.startSample : 0), 0);
  if (audio.state === "encoded") streams.push({ index: 1, codec_type: "audio", codec_name: "aac", sample_rate: String(audio.sampleRateHz), channels: audio.channelLayout === "stereo" ? 2 : 1,
    channel_layout: audio.channelLayout, time_base: `1/${audio.sampleRateHz}` });
  const seconds = (program.output.frames * program.output.frameRate.denominator) / program.output.frameRate.numerator;
  const format = { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: seconds.toFixed(6) };
  const list: unknown[] = Array.from({ length: frames }, (_, i) => ({ stream_index: 0, pts: i * 512 * program.output.frameRate.denominator }));
  if (audio.state === "encoded") for (let s = 0; s < samples; s += 1024) list.push({ stream_index: 1, pts: s, nb_samples: Math.min(1024, samples - s) });
  const body = { programs: [], stream_groups: [], streams, format };
  return { streamsJson: JSON.stringify(body), framesJson: JSON.stringify({ frames: list, ...body }) };
}

// ---------------------------------------------------------------- opaque real test bytes for up to five distinct sources
const SOURCE_KEYS = ["r3a_a", "r3a_b", "r3a_c", "r3a_d", "r3a_e"] as const;
const bytesOf = new Map(SOURCE_KEYS.map((key, i) => [key, deterministicBytes(`gate7-batch3a-source-${key}`, 200_003 + i)]));
/** One chain source: opaque bytes of `key`, a 30 fps CFR table of `seconds` (default 4) and linked-audio evidence unless `audio` is false. */
export interface SourceSpec { key: (typeof SOURCE_KEYS)[number]; range?: { startSeconds: number; endSeconds: number }; audio?: boolean; seconds?: number }
export const hashOf = (key: SourceSpec["key"]) => sha256Hex(bytesOf.get(key)!);
export const assetOf = (key: SourceSpec["key"]) => `asset_${hashOf(key)}`;
const chainSource = (s: SourceSpec) => ({ key: s.key, hash: hashOf(s.key), sizeBytes: bytesOf.get(s.key)!.length,
  metadata: cfrMetadata({ hasAudio: s.audio ?? true, seconds: s.seconds ?? 4 }), ...(s.range === undefined ? {} : { range: s.range }) });

export interface RenderedChain { env: RuntimeEnv; x: DagFixture; v: ValidatedExecutionDag; artifacts: readonly SuppliedArtifact[]; call: RuntimeCall; program: RenderProgram;
  staged: StagedSourceReceipt[]; receipt: RenderExecutionReceipt; qc: TechnicalMediaQcReceipt }
export interface ChainOptions { graph?: Omit<RenderGraphOptions, "sources">; output?: { contentHash: string; sizeBytes: number }; qc?: "pass" | "fail" }
/**
 * An accepted Gate 4-7 chain, claimed, staged and "rendered": the accepted real-evidence builders make a permit binding, and a success
 * receipt names the given synthetic output bytes; QC is built from synthetic probe JSON (passing unless `qc: "fail"`). No media exists.
 */
export async function renderedChain(t: TestContext, sources: readonly SourceSpec[], o: ChainOptions = {}): Promise<RenderedChain> {
  const x = renderDag(renderGraph({ sources: sources.map(chainSource), ...(o.graph ?? {}) }));
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  const env = await runtimeEnv({ sources: sources.map((s, i) => ({ assetId: assetOf(s.key), bytes: bytesOf.get(s.key)!, name: `take_${i}.bin` })) });
  t.after(env.cleanup);
  await registerDagAttempt(v, x.artifacts, env.runtime);
  const { claim, ownership } = await acquireExecutionClaim(v, { workerId: "worker_review" }, env.runtime);
  const call: RuntimeCall = { dag: v, runtime: env.runtime, ownership, artifacts: mergeArtifacts(x.artifacts, RUNTIME_EVIDENCE) };
  const staged: StagedSourceReceipt[] = [];
  for (const source of v.admission.sources) staged.push(await stageClaimedSource(call, { assetId: source.assetId }));
  env.clock.advance(250);
  const now = env.runtime.clock.now(), timing = { checkStartedAt: now, observedAt: now, checkCompletedAt: now, observedAtBasis: "check_started_lower_bound" as const };
  const program = compileRenderProgram(v, call.artifacts);
  const runtimeProbe = buildRealRuntimeProbe({ dag: v, claim, observation: OBSERVATION, timing, session: SESSION });
  const binding = await evaluateRealExecutionEvidence(call, { policy: realPolicy(), program, staged, runtimeProbe,
    capabilityProbe: buildRealCapabilityProbe({ dag: v, artifacts: call.artifacts, claim, observation: OBSERVATION, timing, session: SESSION }),
    lifecycle: staged.map(s => buildFixtureLifecycleObservation({ dag: v, claim, stagedSource: s, state: { deletionRequestedAt: null, expiresAt: null }, timing, session: SESSION })),
    conformance: staged.map(s => buildStagedInputConformance({ dag: v, claim, stagedSource: s, program,
      probeJson: sourceProbeJson(program.inputs.find(i => i.assetId === s.source.assetId)!.audio.required,
        sources.find(spec => assetOf(spec.key) === s.source.assetId)?.seconds ?? 4), timing, session: SESSION })) });
  const start = buildExecutionStart({ binding, startedAt: env.runtime.clock.now() });
  const output = o.output ?? { contentHash: sha256Hex(`batch3a-synthetic-output-${program.programId}`), sizeBytes: 147_717 };
  const receipt = buildSuccessReceipt({ binding, start, program, runtimeProbe, reservation: x.chain.reservation,
    process: { spawnedAt: start.startedAt, completedAt: at(start.startedAt, 400), exitCode: 0, signal: null, timeoutMilliseconds: 120_000, outputByteBound: 23_320_576,
      argvDigest: "a".repeat(64), argvCount: 90 },
    measurements: { wallClockMilliseconds: 400, benchmark: { cpuMilliseconds: 234, userMilliseconds: 200, systemMilliseconds: 34, realMilliseconds: 400, maxResidentKibibytes: 52_808 },
      outputBytes: output.sizeBytes },
    output: { ...output, publication: "published_by_this_execution" }, diagnostics: { capturedBytes: 0, sha256: sha256Hex(""), truncated: false, excerpt: [] },
    inputReverification: "unchanged_after_exit", recordedAt: at(start.startedAt, 500) });
  const qcAt = at(receipt.recordedAt, 100);
  const qc = buildQcReceipt({ dag: v.dag, receipt, observedIdentity: { contentHash: receipt.output.contentHash, sizeBytes: receipt.output.sizeBytes },
    observation: { ...outputProbeJson(program, o.qc === "fail"), decode: { exitCode: 0, errorLines: [] } },
    tools: { ffprobeSha256: PINNED_MEDIA_RUNTIME.ffprobe.sha256, ffprobeReportedVersion: PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion,
      ffmpegSha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256, ffmpegReportedVersion: PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion },
    timing: { checkStartedAt: qcAt, observedAt: qcAt, checkCompletedAt: qcAt, observedAtBasis: "check_started_lower_bound" } });
  return { env, x, v, artifacts: call.artifacts, call, program, staged, receipt, qc };
}

// ---------------------------------------------------------------- synthetic decoded media (byte arrays shaped exactly like the adapter's decode)
/** Planar yuv420p frames of the given luma: `luma(frame, x, y)`; chroma is neutral. */
export function yuvFrames(o: { width: number; height: number; first: number; count: number; luma: (frame: number, x: number, y: number) => number }): Uint8Array {
  const frameBytes = (o.width * o.height * 3) / 2, bytes = new Uint8Array(frameBytes * o.count).fill(128);
  for (let k = 0; k < o.count; k += 1) for (let y = 0; y < o.height; y += 1) for (let x = 0; x < o.width; x += 1) bytes[k * frameBytes + y * o.width + x] = o.luma(o.first + k, x, y);
  return bytes;
}
/** Interleaved little-endian float32 PCM: `sample(index, channel)` for output samples [first, first + count). */
export function f32Audio(o: { channels: number; first: number; count: number; sample: (index: number, channel: number) => number }): Uint8Array {
  const view = new DataView(new ArrayBuffer(o.count * o.channels * 4));
  for (let i = 0; i < o.count; i += 1) for (let c = 0; c < o.channels; c += 1) view.setFloat32((i * o.channels + c) * 4, o.sample(o.first + i, c), true);
  return new Uint8Array(view.buffer);
}

// ---------------------------------------------------------------- a deterministic synthetic fixture critic (NOT a model and never a product critic)
/**
 * Flags, as a synthetic model-assessed finding, every cut-boundary observation whose transcript words include a word clipped by the edit. Its
 * findings say they are a synthetic fixture rule; their uncertainty is qualitative and uncalibrated. It inspects only the bounded input.
 */
export class SyntheticFixtureCritic implements SemanticCriticPort {
  readonly identity = Object.freeze({ criticId: "synthetic_fixture_critic", version: "0.1.0", basis: "synthetic_fixture" as const });
  readonly seen: SemanticCriticInput[] = [];
  async assess(input: SemanticCriticInput): Promise<unknown> {
    this.seen.push(input);
    const findings = [];
    for (const { artifact, observation } of input.observations) {
      const item = observation.planItem;
      if (item === null || item.purpose !== "cut_boundary" || item.joinIndex === null || observation.result.transcript.state !== "present") continue;
      const clipped = observation.result.transcript.words.findIndex(w => w.coverage !== "whole");
      const join = input.joins.find(j => j.joinIndex === item.joinIndex);
      if (clipped < 0 || join === undefined) continue;
      findings.push({ dimension: "trim_timing", severity: "minor", joinIndex: join.joinIndex,
        affectedOutput: { startFrame: join.atFrame - 1, endFrame: join.atFrame + 1 },
        evidenceRefs: [{ artifact, pointer: `/result/transcript/words/${clipped}` }],
        explanation: "Synthetic fixture rule: a transcript word is clipped by this cut; a human or model critic must judge whether that is a problem.",
        uncertainty: { state: "qualitative", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [] } });
    }
    return { dimensionsAssessed: ["trim_timing"], findings };
  }
}
