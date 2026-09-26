/**
 * Independent technical media QC logic. Expectations derive from the accepted ExecutionDag itself, never from the renderer's
 * receipt or program; the observation comes from a separate QC adapter that re-hashes the published object and probes and fully
 * decodes it with the independently re-verified pinned ffprobe and ffmpeg. A zero exit status is not QC. This is technical QC only:
 * it says nothing about editing quality, story or aesthetics.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { HashSchema, ScopeSchema } from "../edit-graph/common.js";
import type { ExecutionDag, ExecutionDagNode } from "../edit-execution/index.js";
import { LocationFreeVersionSchema, PositiveSafeInt } from "../edit-execution/common.js";
import { CheckTimingSchema, ORDERED_CHECK, check, envelope, header, orderedCheck, parse } from "./common.js";
import { parseProbeJson, ratioOf, type ProbeReport } from "./probe.js";
import { RenderExecutionReceiptSchema, type RenderExecutionReceipt } from "./receipts.js";

export const QC_IMPLEMENTATION = { implementationId: "gate7_batch2b_technical_media_qc", version: "0.1.0" } as const;
const CONTAINER = "mov,mp4,m4a,3gp,3g2,mj2";
/** Container duration is printed to the microsecond; it may differ from the exact frame-grid duration by at most one millisecond. */
const FORMAT_DURATION_TOLERANCE_MICROSECONDS = 1000;
const ExpectationSchema = z.strictObject({ resolution: z.strictObject({ width: PositiveSafeInt, height: PositiveSafeInt }),
  frameRate: z.strictObject({ numerator: PositiveSafeInt, denominator: PositiveSafeInt }), frames: PositiveSafeInt, durationTicks: PositiveSafeInt, ticksPerSecond: PositiveSafeInt,
  video: z.strictObject({ codecName: z.literal("h264"), pixelFormat: z.literal("yuv420p") }),
  audio: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }), z.strictObject({ state: z.literal("encoded"), codecName: z.literal("aac"),
    sampleRateHz: PositiveSafeInt, channels: z.union([z.literal(1), z.literal(2)]), channelLayout: z.enum(["mono", "stereo"]), samples: PositiveSafeInt })]),
  formatDurationToleranceMicroseconds: z.literal(FORMAT_DURATION_TOLERANCE_MICROSECONDS), container: z.literal(CONTAINER) });
export type QcExpectation = z.infer<typeof ExpectationSchema>;
/** Everything QC expects, from the DAG's final encode and composition only. */
export function deriveQcExpectation(dag: ExecutionDag): QcExpectation {
  const encode = dag.nodes.find((n): n is Extract<ExecutionDagNode, { kind: "final_encode" }> => n.kind === "final_encode");
  const composition = dag.nodes.find((n): n is Extract<ExecutionDagNode, { kind: "composition" }> => n.kind === "composition");
  check(encode !== undefined && composition !== undefined, "qc_receipt_invalid", "The DAG has no final encode or composition.");
  const tps = dag.settings.ticksPerSecond, audio = encode.encoding.audio;
  let expected: QcExpectation["audio"] = { state: "none" };
  if (audio.state === "encoded") {
    const ticks = composition.audio.reduce((n, a) => n + BigInt(a.endTicks - a.startTicks), 0n), scaled = ticks * BigInt(audio.sampleRateHz);
    check(scaled % BigInt(tps) === 0n, "qc_receipt_invalid", "Linked audio does not span exact samples.");
    expected = { state: "encoded", codecName: "aac", sampleRateHz: audio.sampleRateHz, channels: audio.channelLayout === "stereo" ? 2 : 1, channelLayout: audio.channelLayout,
      samples: Number(scaled / BigInt(tps)) };
  }
  return parse(ExpectationSchema, { resolution: encode.output.resolution, frameRate: encode.output.frameRate, frames: encode.output.frames, durationTicks: encode.output.durationTicks,
    ticksPerSecond: tps, video: { codecName: "h264", pixelFormat: "yuv420p" }, audio: expected, formatDurationToleranceMicroseconds: FORMAT_DURATION_TOLERANCE_MICROSECONDS,
    container: CONTAINER }, "qc_receipt_invalid");
}
export const QC_CHECKS = ["output_identity", "probe_output", "container_format", "stream_layout", "video_codec", "video_geometry", "video_pixel_format", "video_frame_rate",
  "video_frame_count", "video_frame_grid", "audio_format", "audio_samples", "container_duration", "complete_decode"] as const;
export type QcCheckId = (typeof QC_CHECKS)[number];
const CheckSchema = z.strictObject({ checkId: z.enum(QC_CHECKS), outcome: z.enum(["pass", "fail", "not_applicable"]) });
const ObservedSchema = z.strictObject({ resolution: z.strictObject({ width: z.number().int().nonnegative(), height: z.number().int().nonnegative() }).nullable(),
  videoStreams: z.number().int().nonnegative(), audioStreams: z.number().int().nonnegative(), otherStreams: z.number().int().nonnegative(),
  videoFrames: z.number().int().nonnegative().nullable(), audioSamples: z.number().int().nonnegative().nullable(), formatDuration: z.string().max(20).nullable(),
  decodeExitCode: z.number().int().nullable(), decodeErrorLines: z.number().int().nonnegative() });
export interface QcObservation { streamsJson: string; framesJson: string; decode: { exitCode: number | null; errorLines: readonly string[] } }
const exactSeconds = (value: bigint, tb: { numerator: bigint; denominator: bigint }) => ({ n: value * tb.numerator, d: tb.denominator });
/** Evaluates one observation against the DAG expectation. Every check is explicit; a check that cannot apply says so. */
export function evaluateTechnicalQc(expectationInput: QcExpectation, claimed: { contentHash: string; sizeBytes: number }, observedIdentity: { contentHash: string; sizeBytes: number },
  observation: QcObservation) {
  const expectation = parse(ExpectationSchema, expectationInput, "qc_receipt_invalid");
  const checks = new Map<QcCheckId, "pass" | "fail" | "not_applicable">(QC_CHECKS.map(id => [id, "not_applicable"]));
  const set = (id: QcCheckId, ok: boolean) => checks.set(id, ok ? "pass" : "fail");
  set("output_identity", claimed.contentHash === observedIdentity.contentHash && claimed.sizeBytes === observedIdentity.sizeBytes);
  let streams: ProbeReport | null = null, frames: ProbeReport | null = null;
  try { streams = parseProbeJson(observation.streamsJson); frames = parseProbeJson(observation.framesJson); } catch { streams = null; frames = null; }
  set("probe_output", streams !== null && frames !== null);
  const observed: z.infer<typeof ObservedSchema> = { resolution: null, videoStreams: 0, audioStreams: 0, otherStreams: 0, videoFrames: null, audioSamples: null, formatDuration: null,
    decodeExitCode: observation.decode.exitCode, decodeErrorLines: observation.decode.errorLines.length };
  set("complete_decode", observation.decode.exitCode === 0 && observation.decode.errorLines.length === 0);
  if (streams !== null && frames !== null) {
    const video = streams.streams.filter(s => s.codec_type === "video"), audio = streams.streams.filter(s => s.codec_type === "audio");
    observed.videoStreams = video.length; observed.audioStreams = audio.length; observed.otherStreams = streams.streams.length - video.length - audio.length;
    observed.formatDuration = streams.format.duration ?? null;
    set("container_format", streams.format.format_name === expectation.container);
    set("stream_layout", video.length === 1 && audio.length === (expectation.audio.state === "encoded" ? 1 : 0) && observed.otherStreams === 0
      && equal(frames.streams.map(s => s.codec_type), streams.streams.map(s => s.codec_type)));
    const v = video[0];
    if (v !== undefined) {
      observed.resolution = { width: v.width ?? 0, height: v.height ?? 0 };
      set("video_codec", v.codec_name === expectation.video.codecName);
      set("video_geometry", v.width === expectation.resolution.width && v.height === expectation.resolution.height && v.sample_aspect_ratio === "1:1");
      set("video_pixel_format", v.pix_fmt === expectation.video.pixelFormat);
      const rate = `${expectation.frameRate.numerator}/${expectation.frameRate.denominator}`;
      set("video_frame_rate", v.r_frame_rate === rate && v.avg_frame_rate === rate);
      const decoded = (frames.frames ?? []).filter(f => f.stream_index === v.index);
      observed.videoFrames = decoded.length;
      set("video_frame_count", decoded.length === expectation.frames);
      const tb = v.time_base === undefined ? null : ratioOf(v.time_base), { numerator: num, denominator: den } = expectation.frameRate;
      set("video_frame_grid", tb !== null && decoded.every((f, i) => BigInt(f.pts) * tb.numerator * BigInt(num) === BigInt(i) * BigInt(den) * tb.denominator));
      // The exact video duration and the container's rounded duration, against the DAG's exact output duration.
      const expected = { n: BigInt(expectation.durationTicks), d: BigInt(expectation.ticksPerSecond) };
      const stream = tb !== null && v.duration_ts !== undefined ? exactSeconds(BigInt(v.duration_ts), tb) : null;
      const streamExact = stream !== null && stream.n * expected.d === expected.n * stream.d;
      const format = streams.format.duration === undefined ? null : BigInt(streams.format.duration.replace(".", ""));
      const formatWithin = format !== null && (format * expected.d - expected.n * 1_000_000n) * (format * expected.d > expected.n * 1_000_000n ? 1n : -1n)
        <= BigInt(FORMAT_DURATION_TOLERANCE_MICROSECONDS) * expected.d;
      set("container_duration", streamExact && formatWithin);
    }
    const a = audio[0];
    if (a !== undefined) {
      observed.audioSamples = (frames.frames ?? []).filter(f => f.stream_index === a.index).reduce((n, f) => n + (f.nb_samples ?? 0), 0);
      if (expectation.audio.state === "encoded") {
        set("audio_format", a.codec_name === expectation.audio.codecName && a.sample_rate === String(expectation.audio.sampleRateHz) && a.channels === expectation.audio.channels
          && a.channel_layout === expectation.audio.channelLayout);
        set("audio_samples", observed.audioSamples === expectation.audio.samples);
      }
    }
  }
  const list = QC_CHECKS.map(checkId => ({ checkId, outcome: checks.get(checkId)! }));
  // A check that is not applicable never passes QC on its own: the layout and probe checks cover a missing stream or a failed probe.
  return { verdict: list.every(c => c.outcome !== "fail") && checks.get("probe_output") === "pass" ? "pass" as const : "fail" as const, checks: list,
    observed: parse(ObservedSchema, observed, "qc_receipt_invalid") };
}

const QcBodySchema = z.strictObject({
  ...envelope("TechnicalMediaQcReceipt"), scope: ScopeSchema, qcScope: z.literal("technical_media_qc_only_not_semantic_or_editing_quality"),
  execution: z.strictObject({ receiptId: IdSchema, renderComputationId: IdSchema, dagId: IdSchema, programId: IdSchema }),
  output: z.strictObject({ outputArtifactId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt }),
  observedIdentity: z.strictObject({ contentHash: HashSchema, sizeBytes: z.number().int().nonnegative().safe() }),
  tools: z.strictObject({ ffprobeSha256: HashSchema, ffprobeReportedVersion: LocationFreeVersionSchema, ffmpegSha256: HashSchema, ffmpegReportedVersion: LocationFreeVersionSchema,
    verification: z.literal("qc_adapter_reverified_pinned_digests_independently_of_the_renderer") }),
  implementation: z.strictObject({ implementationId: z.literal(QC_IMPLEMENTATION.implementationId), version: z.literal(QC_IMPLEMENTATION.version) }),
  expectation: ExpectationSchema, observed: ObservedSchema, checks: z.array(CheckSchema).length(QC_CHECKS.length), verdict: z.enum(["pass", "fail"]),
  ...CheckTimingSchema.shape, basis: z.literal("independent_reprobe_and_full_decode_of_published_output_v0"),
});
export const TechnicalMediaQcReceiptSchema = QcBodySchema.extend({ qcReceiptId: IdSchema }).refine(orderedCheck, ORDERED_CHECK)
  .refine(v => v.verdict === (v.checks.every(c => c.outcome !== "fail") && v.checks.find(c => c.checkId === "probe_output")?.outcome === "pass" ? "pass" : "fail"),
    "The verdict summarizes the checks.")
  .refine(v => checkIdentity(v, "qcReceiptId", "technical_media_qc_receipt_v0"), "Technical media QC receipt identity mismatch.");
export type TechnicalMediaQcReceipt = z.infer<typeof TechnicalMediaQcReceiptSchema>;
export function buildQcReceipt(input: { dag: ExecutionDag; receipt: RenderExecutionReceipt; observedIdentity: { contentHash: string; sizeBytes: number }; observation: QcObservation;
  tools: { ffprobeSha256: string; ffprobeReportedVersion: string; ffmpegSha256: string; ffmpegReportedVersion: string };
  timing: { checkStartedAt: string; observedAt: string; checkCompletedAt: string; observedAtBasis: "check_started_lower_bound" | "provider_reported_within_check_window" } }):
  TechnicalMediaQcReceipt {
  const receipt = parse(RenderExecutionReceiptSchema, input.receipt, "qc_receipt_invalid");
  check(receipt.dag.dagId === input.dag.dagId && receipt.renderComputationId === input.dag.renderIdentity.renderComputationId && equal(receipt.scope, input.dag.scope),
    "qc_receipt_invalid", "The execution receipt is not of this DAG.");
  const expectation = deriveQcExpectation(input.dag), result = evaluateTechnicalQc(expectation, receipt.output, input.observedIdentity, input.observation);
  const body = { ...header("TechnicalMediaQcReceipt"), scope: receipt.scope, qcScope: "technical_media_qc_only_not_semantic_or_editing_quality" as const,
    execution: { receiptId: receipt.receiptId, renderComputationId: receipt.renderComputationId, dagId: receipt.dag.dagId, programId: receipt.program.programId },
    output: { outputArtifactId: receipt.output.outputArtifactId, contentHash: receipt.output.contentHash, sizeBytes: receipt.output.sizeBytes },
    observedIdentity: input.observedIdentity, tools: { ...input.tools, verification: "qc_adapter_reverified_pinned_digests_independently_of_the_renderer" as const },
    implementation: QC_IMPLEMENTATION, expectation, observed: result.observed, checks: result.checks, verdict: result.verdict, ...input.timing,
    basis: "independent_reprobe_and_full_decode_of_published_output_v0" as const };
  return parse(TechnicalMediaQcReceiptSchema, identify("technical_media_qc_receipt_v0", "qcReceiptId", body), "qc_receipt_invalid");
}
