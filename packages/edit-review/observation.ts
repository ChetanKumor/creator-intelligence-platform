/**
 * EditorialObservation: bounded editorial evidence about exactly one media object.
 *
 * One observation binds one exact media identity: a rendered output (its content hash and size, the success receipt that published it and
 * the passing technical-QC receipt that inspected it) or a staged source (its content-addressed staged object, as consumed by that render).
 * No path is ever authority or recorded. The request is one exact frame window (with at most a few representative frames) and, when the
 * media has audio, the same window's samples in frame-aligned bins. Everything in `result` is computed here, deterministically, from the
 * exact decoded bytes an adapter hands over; the pure core never decodes and never reads a file.
 *
 * The computation identity binds only what can change the result: the media content (kind, hash, size), the request, the observation
 * semantics and observer implementation, and the transcript evidence joined (with the exact program mapping it was joined through). It
 * binds no receipt, plan, scope, project or purpose, so identical bytes observed for another render reuse the same evidence; the record
 * identity additionally binds its own lineage.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { HashSchema, Nat, ScopeSchema } from "../edit-graph/common.js";
import { PositiveSafeInt } from "../edit-execution/common.js";
import { REVIEW_HARD_LIMITS, byteLengthOf, check, digestOf, envelope, header, parse, parseCanonical, refuse, sha256, ticksAfterFrame, ticksBeforeFrame } from "./common.js";
import { MediaFactsSchema, ObservationRequestSchema, REVIEW_PURPOSES, requirePlan, samplesPerFrame, yuv420pFrameBytes, type MediaFacts, type ObservationRequest, type PlanSegment,
  type ReviewPlan } from "./review.js";
import { requireTranscriptEvidence, type TranscriptEvidence } from "./transcript.js";

/** The versioned observation semantics; its digest binds every computation identity, so a change is new evidence, never a silent reuse. */
export const OBSERVATION_SEMANTICS = {
  version: "editorial_observation_semantics_v0",
  frames: { plane: "decoded_yuv420p_luma_plane_exact_v0", selection: "exact_frame_indices_trim_from_frame_zero_v0",
    statistics: "mean_milli_floor_min_max_dark_per_mille_luma_at_most_32_sha256_mad_milli_floor_v0",
    thumbnail: { method: "integer_box_mean_factor_ceil_long_edge_over_max_edge_v0", maxEdge: REVIEW_HARD_LIMITS.thumbnailMaxEdge, encoding: "gray8_base64url_v0" } },
  audio: { decode: "decoded_f32le_interleaved_native_rate_and_channels_v0", bins: "one_bin_per_video_frame_exact_samples_per_frame_v0", statistics: "peak_and_rms_q15_rounded_v0" },
  transcript: { overlap: "exact_rational_half_open_overlap_v0", coverage: "segment_selection_for_rendered_output_observation_window_for_source_v0" },
} as const;
export const OBSERVATION_SEMANTICS_DIGEST = digestOf(OBSERVATION_SEMANTICS);
export const OBSERVER_IMPLEMENTATION = { observerId: "gate7_batch3a_editorial_observation", version: "0.1.0" } as const;
const DARK_LUMA = 32;
const PINNED_DECODE = "pinned_ffmpeg_decode_of_verified_held_object_v0", SYNTHETIC_BYTES = "synthetic_test_bytes_not_media_decode_v0", REUSED = "reused_by_computation_identity_v0";

const ObservedMediaSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("rendered_output"), outputArtifactId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, container: z.literal("mp4"), receiptId: IdSchema,
    qcReceiptId: IdSchema, programId: IdSchema, dagId: IdSchema, renderComputationId: IdSchema, editGraph: z.strictObject({ editGraphId: IdSchema, revision: z.literal(0) }) }),
  z.strictObject({ kind: z.literal("staged_source"), assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, stagedObjectId: IdSchema, container: z.literal("mov"),
    inputSlot: Nat, receiptId: IdSchema, programId: IdSchema }),
]);
export type ObservedMedia = z.infer<typeof ObservedMediaSchema>;
const TranscriptJoinSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }),
  z.strictObject({ state: z.literal("joined"), transcriptEvidenceIds: z.array(IdSchema).min(1).max(16).refine(ids => ids.every((id, i) => i === 0 || ids[i - 1]! < id), "Sorted, unique."),
    mapping: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("program_segments"), digest: HashSchema }), z.strictObject({ kind: z.literal("source_timeline") })]) })]);
export type TranscriptJoin = z.infer<typeof TranscriptJoinSchema>;
const Byte = z.number().int().min(0).max(255), Milli = z.number().int().min(0).max(255_000), Q15 = z.number().int().min(0).max(32_768);
const FrameSummarySchema = z.strictObject({ frame: Nat, meanLumaMilli: Milli, minLuma: Byte, maxLuma: Byte, darkPerMille: z.number().int().min(0).max(1000), lumaSha256: HashSchema,
  madFromPreviousMilli: Milli.nullable() });
const ThumbnailSchema = z.strictObject({ frame: Nat, width: z.number().int().min(1).max(REVIEW_HARD_LIMITS.thumbnailMaxEdge),
  height: z.number().int().min(1).max(REVIEW_HARD_LIMITS.thumbnailMaxEdge), encoding: z.literal("gray8_base64url_v0"), data: z.string().regex(/^[A-Za-z0-9_-]{1,4096}$/), sha256: HashSchema });
const WaveformSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("not_requested") }),
  z.strictObject({ state: z.literal("present"), sampleRateHz: PositiveSafeInt, channels: z.union([z.literal(1), z.literal(2)]), startSample: Nat, endSample: PositiveSafeInt,
    samplesPerBin: PositiveSafeInt, bins: z.array(z.strictObject({ peakQ15: Q15, rmsQ15: Q15 })).min(1).max(REVIEW_HARD_LIMITS.maxObservationWindowFrames) })]);
const WordSchema = z.strictObject({ transcriptEvidenceId: IdSchema, entryIndex: Nat, kind: z.enum(["word", "audio_event"]), text: z.string().min(1).max(REVIEW_HARD_LIMITS.maxEntryTextCharacters),
  speakerId: IdSchema.nullable(), startTicks: Nat, endTicks: PositiveSafeInt, ticksPerSecond: PositiveSafeInt, segmentPosition: Nat.nullable(),
  coverage: z.enum(["whole", "clipped_start", "clipped_end", "clipped_both"]), coverageBasis: z.enum(["segment_selection", "observation_window"]) });
type Word = z.infer<typeof WordSchema>;
const TranscriptResultSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("not_supplied") }),
  z.strictObject({ state: z.literal("present"), words: z.array(WordSchema).max(REVIEW_HARD_LIMITS.maxWordsPerObservation) })]);
const AcquisitionSchema = z.strictObject({ basis: z.enum([PINNED_DECODE, SYNTHETIC_BYTES, REUSED]), decodedFrames: Nat, decodedPixelFrames: Nat, deliveredFrames: Nat,
  tool: z.strictObject({ ffmpegSha256: HashSchema }).nullable(),
  reusedFrom: z.strictObject({ observationId: IdSchema, basis: z.enum([PINNED_DECODE, SYNTHETIC_BYTES]) }).nullable() })
  .refine(a => (a.basis === PINNED_DECODE) === (a.tool !== null) && (a.basis === REUSED) === (a.reusedFrom !== null), "The acquisition states exactly how its result was obtained.");
const PlanItemSchema = z.strictObject({ itemIndex: Nat, purpose: z.enum(REVIEW_PURPOSES), joinIndex: Nat.nullable() });
/**
 * What produced the result: an exact decoder build, or synthetic test bytes. It binds the computation identity (self-review D1, D2): results
 * of different decoders, and synthetic bytes versus a real decode, are different evidence and can never satisfy each other's cache key.
 */
const DecoderSchema = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("pinned_ffmpeg"), ffmpegSha256: HashSchema }),
  z.strictObject({ kind: z.literal("synthetic_test_bytes") })]);
export type ObservationDecoder = z.infer<typeof DecoderSchema>;
const ObservationBodySchema = z.strictObject({ ...envelope("EditorialObservation"), scope: ScopeSchema, media: ObservedMediaSchema, facts: MediaFactsSchema, planItem: PlanItemSchema.nullable(),
  request: ObservationRequestSchema, transcriptJoin: TranscriptJoinSchema, decoder: DecoderSchema, computationId: IdSchema,
  semantics: z.strictObject({ version: z.literal(OBSERVATION_SEMANTICS.version), digest: z.literal(OBSERVATION_SEMANTICS_DIGEST) }),
  observer: z.strictObject({ observerId: z.literal(OBSERVER_IMPLEMENTATION.observerId), version: z.literal(OBSERVER_IMPLEMENTATION.version) }),
  result: z.strictObject({ frames: z.array(FrameSummarySchema).max(REVIEW_HARD_LIMITS.maxObservationWindowFrames),
    thumbnails: z.array(ThumbnailSchema).max(REVIEW_HARD_LIMITS.maxFramesPerObservation), waveform: WaveformSchema, transcript: TranscriptResultSchema }),
  acquisition: AcquisitionSchema });
type ObservationBody = z.infer<typeof ObservationBodySchema>;

// ---------------------------------------------------------------- computation identity
type ComputationMedia = { kind: "rendered_output" | "staged_source"; contentHash: string; sizeBytes: number };
export interface ObservationVersions { semanticsDigest: string; observer: { observerId: string; version: string } }
const CURRENT: ObservationVersions = { semanticsDigest: OBSERVATION_SEMANTICS_DIGEST, observer: OBSERVER_IMPLEMENTATION };
/**
 * The reuse key: exactly the media content, the request, the decoder that produced the result, the semantics, the observer and the transcript
 * join. Lineage never enters it.
 */
export function observationComputationIdOf(input: { media: ComputationMedia; request: ObservationRequest; transcriptJoin: TranscriptJoin; decoder: ObservationDecoder },
  versions: ObservationVersions = CURRENT): string {
  const request = parse(ObservationRequestSchema, input.request, "observation_request_invalid"), join = parse(TranscriptJoinSchema, input.transcriptJoin, "observation_request_invalid");
  const decoder = parse(DecoderSchema, input.decoder, "observation_request_invalid");
  const media = { kind: input.media.kind, contentHash: input.media.contentHash, sizeBytes: input.media.sizeBytes };
  return identify("editorial_observation_computation_v0", "computationId", { computation: { media, request, transcriptJoin: join, decoder, semantics: versions.semanticsDigest,
    observer: { observerId: versions.observer.observerId, version: versions.observer.version } } }).computationId;
}
function recordIssues(o: ObservationBody & { observationId: string }): string[] {
  const issues: string[] = [], { request, facts } = o, count = request.window.endFrame - request.window.startFrame;
  if (!checkIdentity(o, "observationId", "editorial_observation_v0")) issues.push("Observation identity mismatch.");
  try { if (o.computationId !== observationComputationIdOf(o)) issues.push("The computation identity does not match the media, request and transcript join."); }
  catch { issues.push("The computation cannot be identified."); }
  if (request.window.endFrame > facts.frames) issues.push("The window lies outside the media.");
  if (o.planItem !== null && o.media.kind !== "rendered_output") issues.push("Only a rendered-output observation answers a plan item.");
  if (!equal(o.result.frames.map(f => f.frame), Array.from({ length: count }, (_, k) => request.window.startFrame + k))) issues.push("Frame summaries cover exactly the window.");
  if (!equal(o.result.thumbnails.map(t => t.frame), request.frames)) issues.push("Thumbnails are exactly the requested frames.");
  const spf = samplesPerFrame(facts), w = o.result.waveform;
  if (request.audio === "window" ? w.state !== "present" || spf === null || facts.audio.state !== "present" || w.startSample !== request.window.startFrame * spf
    || w.endSample !== request.window.endFrame * spf || w.samplesPerBin !== spf || w.bins.length !== count || w.sampleRateHz !== facts.audio.sampleRateHz
    || w.channels !== facts.audio.channels : w.state !== "not_requested") issues.push("The waveform is exactly the requested window's bins.");
  if ((o.transcriptJoin.state === "none") !== (o.result.transcript.state === "not_supplied")) issues.push("Transcript words exist exactly when a transcript joined.");
  const a = o.acquisition, decoded = a.basis === REUSED ? 0 : request.window.endFrame;
  if (a.deliveredFrames !== request.frames.length || a.decodedFrames !== decoded || a.decodedPixelFrames !== decoded * facts.width * facts.height) {
    issues.push("The acquisition's work is exactly the request's.");
  }
  const origin = a.basis === REUSED ? a.reusedFrom?.basis : a.basis;
  if (origin === PINNED_DECODE ? o.decoder.kind !== "pinned_ffmpeg" || (a.tool !== null && a.tool.ffmpegSha256 !== o.decoder.ffmpegSha256) : o.decoder.kind !== "synthetic_test_bytes") {
    issues.push("The decoder is exactly what produced the result.");
  }
  return issues;
}
export const EditorialObservationSchema = ObservationBodySchema.extend({ observationId: IdSchema }).superRefine((o, ctx) => {
  for (const message of recordIssues(o)) ctx.addIssue({ code: "custom", message });
});
export type EditorialObservation = z.infer<typeof EditorialObservationSchema>;
export function requireObservation(value: unknown): EditorialObservation { return parseCanonical(EditorialObservationSchema, value, "observation_invalid"); }

// ---------------------------------------------------------------- targets: what exactly is observed, bound to one media identity
export type ObservationTarget = { kind: "plan_item"; itemIndex: number } | { kind: "rendered_drill_down"; request: ObservationRequest }
  | { kind: "staged_source"; inputSlot: number; request: ObservationRequest };
export interface ResolvedTarget { media: ObservedMedia; facts: MediaFacts; planItem: z.infer<typeof PlanItemSchema> | null; request: ObservationRequest;
  segments: PlanSegment[] | null; decodeBytes: { video: number; audio: number } }
function checkedRequest(value: unknown, facts: MediaFacts): ObservationRequest {
  const request = parse(ObservationRequestSchema, value, "observation_request_invalid");
  check(request.window.endFrame <= facts.frames, "observation_request_invalid", "The window lies outside the media.");
  check(request.audio === "none" || samplesPerFrame(facts) !== null, "observation_request_invalid", "Audio is requested only where the media's audio is established and frame-exact.");
  return request;
}
/** Resolves a target against the plan: its exact media identity and facts, and the exact bytes a decode of it must yield. */
export function resolveObservationTarget(planInput: ReviewPlan, target: ObservationTarget): ResolvedTarget {
  const plan = requirePlan(planInput);
  let media: ObservedMedia, facts: MediaFacts, request: ObservationRequest, planItem: ResolvedTarget["planItem"] = null, segments: PlanSegment[] | null = null;
  const rendered = (): ObservedMedia => ({ kind: "rendered_output", outputArtifactId: plan.output.outputArtifactId, contentHash: plan.output.contentHash, sizeBytes: plan.output.sizeBytes,
    container: "mp4", receiptId: plan.render.receiptId, qcReceiptId: plan.technicalQc.qcReceiptId, programId: plan.render.programId, dagId: plan.render.dagId,
    renderComputationId: plan.render.renderComputationId, editGraph: plan.render.editGraph });
  switch (target?.kind) {
    case "plan_item": {
      const item = Number.isSafeInteger(target.itemIndex) ? plan.items[target.itemIndex] : undefined;
      check(item !== undefined, "observation_request_invalid", "No such plan item.");
      media = rendered(); facts = plan.facts; request = item.request; planItem = { itemIndex: item.itemIndex, purpose: item.purpose, joinIndex: item.joinIndex }; segments = plan.segments;
      break;
    }
    case "rendered_drill_down":
      media = rendered(); facts = plan.facts; request = checkedRequest(target.request, facts); segments = plan.segments;
      break;
    case "staged_source": {
      const input = plan.inputs.find(i => i.inputSlot === target.inputSlot);
      check(input !== undefined, "observation_request_invalid", "No such render input.");
      media = { kind: "staged_source", assetId: input.assetId, contentHash: input.contentHash, sizeBytes: input.sizeBytes, stagedObjectId: input.stagedObjectId, container: "mov",
        inputSlot: input.inputSlot, receiptId: plan.render.receiptId, programId: plan.render.programId };
      facts = input.facts; request = checkedRequest(target.request, facts);
      break;
    }
    default: refuse("observation_request_invalid", "Unknown observation target.");
  }
  const count = request.window.endFrame - request.window.startFrame, spf = samplesPerFrame(facts);
  const decodeBytes = { video: count * yuv420pFrameBytes(facts.width, facts.height),
    audio: request.audio === "window" && spf !== null && facts.audio.state === "present" ? count * spf * facts.audio.channels * 4 : 0 };
  check(decodeBytes.video <= REVIEW_HARD_LIMITS.maxDecodeOutputBytes && decodeBytes.audio <= REVIEW_HARD_LIMITS.maxDecodeOutputBytes, "observation_request_invalid",
    "The requested window exceeds the decoded-output bound.");
  return { media, facts, planItem, request, segments, decodeBytes };
}

// ---------------------------------------------------------------- transcript words: exact rational intersection, never floating seconds
const tickBefore = ticksBeforeFrame, tickAfter = ticksAfterFrame;
function wordsOf(t: TranscriptEvidence, span: { start: number; end: number }, selection: { start: number; end: number }, grid: MediaFacts["frameRate"], segmentPosition: number | null,
  coverageBasis: Word["coverageBasis"]): Word[] {
  const tps = t.clock.ticksPerSecond;
  return t.entries.flatMap((e, entryIndex) => {
    if (!(tickBefore(e.startTicks, tps, span.end, grid) && tickAfter(e.endTicks, tps, span.start, grid))) return [];
    const early = tickBefore(e.startTicks, tps, selection.start, grid), late = tickAfter(e.endTicks, tps, selection.end, grid);
    return [{ transcriptEvidenceId: t.transcriptEvidenceId, entryIndex, kind: e.kind, text: e.text, speakerId: e.speakerId, startTicks: e.startTicks, endTicks: e.endTicks,
      ticksPerSecond: tps, segmentPosition, coverage: early && late ? "clipped_both" as const : early ? "clipped_start" as const : late ? "clipped_end" as const : "whole" as const,
      coverageBasis }];
  });
}
/**
 * Joins supplied transcript evidence to one target. Evidence must describe a source of this render (same asset and bytes) and fit inside
 * it; only transcripts of media inside the window join, so an unrelated transcript never widens a computation identity.
 */
function joinTranscripts(plan: ReviewPlan, r: ResolvedTarget, supplied: readonly unknown[]): { join: TranscriptJoin; words: Word[] | null } {
  check(supplied.length <= 16, "limit_exceeded", "At most sixteen transcripts join one observation.");
  const transcripts = supplied.map(requireTranscriptEvidence);
  check(new Set(transcripts.map(t => t.transcriptEvidenceId)).size === transcripts.length, "transcript_invalid", "A transcript is supplied twice.");
  for (const t of transcripts) {
    const input = plan.inputs.find(i => i.assetId === t.source.assetId && i.contentHash === t.source.contentHash);
    check(input !== undefined, "transcript_source_mismatch", "The transcript describes no source of this render.");
    const g = input.facts.frameRate;
    check(BigInt(t.source.durationTicks) * BigInt(g.numerator) <= BigInt(input.facts.frames) * BigInt(g.denominator) * BigInt(t.clock.ticksPerSecond), "transcript_source_mismatch",
      "The transcript is longer than its source.");
  }
  const { window } = r.request, sorted = [...transcripts].sort((a, b) => a.transcriptEvidenceId < b.transcriptEvidenceId ? -1 : 1);
  let join: TranscriptJoin = { state: "none" }, words: Word[] = [];
  if (r.media.kind === "rendered_output") {
    const segments = (r.segments ?? []).filter(s => s.outputStartFrame < window.endFrame && s.outputEndFrame > window.startFrame);
    const joined = sorted.filter(t => segments.some(s => s.contentHash === t.source.contentHash));
    if (joined.length > 0) join = { state: "joined", transcriptEvidenceIds: joined.map(t => t.transcriptEvidenceId), mapping: { kind: "program_segments", digest: digestOf(segments) } };
    for (const s of segments) {
      const grid = plan.inputs.find(i => i.inputSlot === s.inputSlot)!.facts.frameRate;
      const from = Math.max(window.startFrame, s.outputStartFrame), to = Math.min(window.endFrame, s.outputEndFrame);
      const span = { start: s.sourceStartFrame + (from - s.outputStartFrame), end: s.sourceStartFrame + (to - s.outputStartFrame) };
      for (const t of joined) if (t.source.contentHash === s.contentHash) words.push(...wordsOf(t, span, { start: s.sourceStartFrame, end: s.sourceEndFrame }, grid, s.position, "segment_selection"));
    }
  } else {
    const joined = sorted.filter(t => t.source.contentHash === r.media.contentHash);
    if (joined.length > 0) join = { state: "joined", transcriptEvidenceIds: joined.map(t => t.transcriptEvidenceId), mapping: { kind: "source_timeline" } };
    const span = { start: window.startFrame, end: window.endFrame };
    for (const t of joined) words.push(...wordsOf(t, span, span, r.facts.frameRate, null, "observation_window"));
  }
  check(words.length <= REVIEW_HARD_LIMITS.maxWordsPerObservation, "limit_exceeded", "Too many transcript entries intersect one window.");
  return { join, words: join.state === "none" ? null : words };
}

// ---------------------------------------------------------------- deterministic summaries of exact decoded bytes
export interface DecodedMedia { video: Uint8Array; audio: Uint8Array | null }
function summarizeVideo(video: unknown, facts: MediaFacts, request: ObservationRequest): Pick<ObservationBody["result"], "frames" | "thumbnails"> {
  const { width, height } = facts, pixels = width * height, frameBytes = yuv420pFrameBytes(width, height), count = request.window.endFrame - request.window.startFrame;
  check(video instanceof Uint8Array && video.length === count * frameBytes, "observation_decode_invalid", "The decoded video is not exactly the requested window's frames.");
  const frames: ObservationBody["result"]["frames"] = [];
  const thumbnails: ObservationBody["result"]["thumbnails"] = [];
  const factor = Math.ceil(Math.max(width, height) / REVIEW_HARD_LIMITS.thumbnailMaxEdge), tw = Math.max(1, Math.floor(width / factor)), th = Math.max(1, Math.floor(height / factor));
  let previous: Uint8Array | null = null;
  for (let k = 0; k < count; k += 1) {
    const luma = video.subarray(k * frameBytes, k * frameBytes + pixels), frame = request.window.startFrame + k;
    let sum = 0, min = 255, max = 0, dark = 0, mad = 0;
    for (let i = 0; i < pixels; i += 1) {
      const y = luma[i]!;
      sum += y; if (y < min) min = y; if (y > max) max = y; if (y <= DARK_LUMA) dark += 1;
      if (previous !== null) mad += Math.abs(y - previous[i]!);
    }
    frames.push({ frame, meanLumaMilli: Math.floor((sum * 1000) / pixels), minLuma: min, maxLuma: max, darkPerMille: Math.floor((dark * 1000) / pixels), lumaSha256: sha256(luma),
      madFromPreviousMilli: previous === null ? null : Math.floor((mad * 1000) / pixels) });
    if (request.frames.includes(frame)) {
      const thumb = new Uint8Array(tw * th);
      for (let y = 0; y < th; y += 1) for (let x = 0; x < tw; x += 1) {
        let block = 0;
        for (let dy = 0; dy < factor; dy += 1) for (let dx = 0; dx < factor; dx += 1) block += luma[(y * factor + dy) * width + x * factor + dx]!;
        thumb[y * tw + x] = Math.floor(block / (factor * factor));
      }
      thumbnails.push({ frame, width: tw, height: th, encoding: "gray8_base64url_v0", data: Buffer.from(thumb).toString("base64url"), sha256: sha256(thumb) });
    }
    previous = luma;
  }
  return { frames, thumbnails };
}
function summarizeAudio(audio: unknown, facts: MediaFacts, request: ObservationRequest): ObservationBody["result"]["waveform"] {
  if (request.audio === "none") {
    check(audio === null || audio === undefined, "observation_decode_invalid", "Audio was decoded although none was requested.");
    return { state: "not_requested" };
  }
  const spf = samplesPerFrame(facts), count = request.window.endFrame - request.window.startFrame;
  check(spf !== null && facts.audio.state === "present", "observation_decode_invalid", "Audio is established for this media.");
  const channels = facts.audio.channels;
  check(audio instanceof Uint8Array && audio.length === count * spf * channels * 4, "observation_decode_invalid", "The decoded audio is not exactly the requested window's samples.");
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength), bins: { peakQ15: number; rmsQ15: number }[] = [];
  for (let b = 0; b < count; b += 1) {
    let peak = 0, squares = 0;
    for (let s = b * spf * channels; s < (b + 1) * spf * channels; s += 1) {
      const x = view.getFloat32(s * 4, true);
      check(Number.isFinite(x), "observation_decode_invalid", "A decoded sample is not finite.");
      const magnitude = Math.abs(x); if (magnitude > peak) peak = magnitude; squares += x * x;
    }
    bins.push({ peakQ15: Math.min(32_768, Math.round(peak * 32_768)), rmsQ15: Math.min(32_768, Math.round(Math.sqrt(squares / (spf * channels)) * 32_768)) });
  }
  return { state: "present", sampleRateHz: facts.audio.sampleRateHz, channels, startSample: request.window.startFrame * spf, endSample: request.window.endFrame * spf, samplesPerBin: spf, bins };
}

// ---------------------------------------------------------------- building, reusing and caching records
export type AcquisitionInput = { basis: typeof PINNED_DECODE; tool: { ffmpegSha256: string } } | { basis: typeof SYNTHETIC_BYTES; tool: null };
export interface ObservationInput { plan: ReviewPlan; target: ObservationTarget; decoded: DecodedMedia; transcripts?: readonly TranscriptEvidence[]; acquisition: AcquisitionInput }
function record(plan: ReviewPlan, r: ResolvedTarget, join: TranscriptJoin, decoder: ObservationDecoder, result: ObservationBody["result"],
  acquisition: ObservationBody["acquisition"]): EditorialObservation {
  const body = { ...header("EditorialObservation"), scope: plan.scope, media: r.media, facts: r.facts, planItem: r.planItem, request: r.request, transcriptJoin: join, decoder,
    computationId: observationComputationIdOf({ media: r.media, request: r.request, transcriptJoin: join, decoder }),
    semantics: { version: OBSERVATION_SEMANTICS.version, digest: OBSERVATION_SEMANTICS_DIGEST }, observer: OBSERVER_IMPLEMENTATION, result, acquisition };
  const observation = parse(EditorialObservationSchema, identify("editorial_observation_v0", "observationId", body), "observation_invalid");
  check(byteLengthOf(observation) <= REVIEW_HARD_LIMITS.maxObservationBytes, "limit_exceeded", "The observation exceeds its byte bound.");
  return observation;
}
/** Builds one observation from exactly the bytes a decode of its target yielded (or synthetic test bytes, labelled as such). */
export function buildObservation(input: ObservationInput): EditorialObservation {
  const plan = requirePlan(input.plan), r = resolveObservationTarget(plan, input.target), { join, words } = joinTranscripts(plan, r, input.transcripts ?? []);
  const acquisition = parse(z.discriminatedUnion("basis", [z.strictObject({ basis: z.literal(PINNED_DECODE), tool: z.strictObject({ ffmpegSha256: HashSchema }) }),
    z.strictObject({ basis: z.literal(SYNTHETIC_BYTES), tool: z.null() })]), input.acquisition, "observation_invalid");
  const decoded = input.decoded as Partial<DecodedMedia> | null;
  const result = { ...summarizeVideo(decoded?.video, r.facts, r.request), waveform: summarizeAudio(decoded?.audio ?? null, r.facts, r.request),
    transcript: words === null ? { state: "not_supplied" as const } : { state: "present" as const, words } };
  const decodedFrames = r.request.window.endFrame;
  const decoder: ObservationDecoder = acquisition.basis === PINNED_DECODE ? { kind: "pinned_ffmpeg", ffmpegSha256: acquisition.tool.ffmpegSha256 } : { kind: "synthetic_test_bytes" };
  return record(plan, r, join, decoder, result, { basis: acquisition.basis, decodedFrames, decodedPixelFrames: decodedFrames * r.facts.width * r.facts.height,
    deliveredFrames: r.request.frames.length, tool: acquisition.tool, reusedFrom: null });
}
/**
 * The exact computation identity a target would have with these transcripts and this decoder: the cache key, computed from the plan alone,
 * without bytes. A decoder must be named: a real decode's key never matches synthetic test bytes or another decoder build (self-review D1, D2).
 */
export function targetComputationId(planInput: ReviewPlan, target: ObservationTarget, transcripts: readonly TranscriptEvidence[], decoder: ObservationDecoder): string {
  const plan = requirePlan(planInput), r = resolveObservationTarget(plan, target), { join } = joinTranscripts(plan, r, transcripts);
  return observationComputationIdOf({ media: r.media, request: r.request, transcriptJoin: join, decoder });
}
/** Rebinds a cached result to a new lineage, only when the new target's computation identity is exactly the cached one; nothing is decoded. */
export function reuseObservation(cachedInput: EditorialObservation, input: { plan: ReviewPlan; target: ObservationTarget; transcripts?: readonly TranscriptEvidence[] }): EditorialObservation {
  const cached = requireObservation(cachedInput), plan = requirePlan(input.plan), r = resolveObservationTarget(plan, input.target);
  const { join } = joinTranscripts(plan, r, input.transcripts ?? []);
  check(observationComputationIdOf({ media: r.media, request: r.request, transcriptJoin: join, decoder: cached.decoder }) === cached.computationId && equal(r.facts, cached.facts),
    "observation_cache_mismatch", "A cached result is reused only under exactly the same computation identity.");
  const original = cached.acquisition.basis === REUSED ? cached.acquisition.reusedFrom!.basis : cached.acquisition.basis;
  return record(plan, r, join, cached.decoder, cached.result, { basis: REUSED, decodedFrames: 0, decodedPixelFrames: 0, deliveredFrames: r.request.frames.length, tool: null,
    reusedFrom: { observationId: cached.observationId, basis: original } });
}
/** An in-memory evidence cache keyed by computation identity. It stores only records whose identity replays; lookups count hits and misses. */
export class ObservationCache {
  readonly #entries = new Map<string, EditorialObservation>();
  #hits = 0;
  #misses = 0;
  lookup(computationId: string): EditorialObservation | undefined {
    const entry = this.#entries.get(computationId);
    if (entry === undefined) { this.#misses += 1; return undefined; }
    this.#hits += 1;
    return structuredClone(entry);
  }
  store(observationInput: EditorialObservation): void {
    const observation = requireObservation(observationInput);
    if (!this.#entries.has(observation.computationId)) this.#entries.set(observation.computationId, structuredClone(observation));
  }
  stats(): { hits: number; misses: number; entries: number } { return { hits: this.#hits, misses: this.#misses, entries: this.#entries.size }; }
}
