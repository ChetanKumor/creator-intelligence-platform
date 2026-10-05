/**
 * Gate 7 Batch 3E-B2-A1: CanonicalMediaProfile v1, the typed CanonicalMediaFacts 1.0.0 evidence it reads, and its pure evaluation.
 *
 * - The profile answers one question: which media state the current editing pipeline treats as truthful and safe to ingest. It is
 *   not an output render profile: it fixes no export resolution, bitrate, creative frame rate, grade or effect. Profile v1 is today's
 *   bounded envelope (H.264 8-bit 4:2:0 progressive BT.709 limited range, exact CFR from zero, contiguous AAC LC or PCM audio). A later
 *   profile version may admit HDR, higher bit depth, 4:2:2 or 4:4:4, alpha or mezzanine codecs; nothing here makes them impossible.
 * - The facts are normalized, typed observations of one file's exact bytes. The trusted adapter of B2-A2 derives them; this module only
 *   reads them. Raw ffprobe JSON, locations and private filesystem state are never facts. Decoded presentation timestamps are
 *   authoritative, and the full display matrix is carried, never a rotation number.
 * - The evaluation is total and typed: CONFORMS, CANONICALIZABLE_EXACT_REMUX (the v1 remux vocabulary reaches the profile),
 *   CANONICALIZABLE_REENCODE_DEFERRED (a known future candidate, not malformed media) or REFUSE. Every finding names the profile
 *   dimension it concerns.
 *
 * Every rule is B2R evidence (3E-B2R, owner rulings D1-D15): the full-matrix geometry (e01s), the SAR declarations (e02), the timing
 * classes, snap and rebase (e03, e03b, e03c), side data and stream layout (e04), colour (e05, e05b, e10), audio (e06, e07c, e11). The
 * accepted B1 classifier, the renderer and every runtime adapter are unchanged; nothing routes through this layer yet.
 *
 * Nothing here reads a file, clock, environment, process or network, or runs FFmpeg or ffprobe.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { sha256 } from "../edit-render/common.js";
import { contentId } from "../reference-analyzer/features.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { N1_ASSUMPTION } from "./canonical.js";

// ---------------------------------------------------------------- CanonicalMediaFacts 1.0.0
export const CANONICAL_MEDIA_FACTS_VERSION = "1.0.0" as const;
/** The x264 encoder-information user-data SEI, the only H.264 side data B2R established (e00, e04 SD01/SD02 bytes). */
export const X264_ENCODER_INFO_SEI_UUID = "dc45e9bde6d948b7962cd820d923eeef" as const;
/** The x265 encoder-information user-data SEI of B2R's HEVC 8-bit SDR fixtures (e04 SD04, e09 PB4). */
export const X265_ENCODER_INFO_SEI_UUID = "2ca2de09b51747dbbb55a4fe7fc2fc4e" as const;
/**
 * The closed side-data vocabulary of the facts. A stream's display matrix and its container clean aperture are their own facts and never
 * side-data entries; a frame-carried display matrix (an orientation SEI) is one. Anything the adapter cannot name is `unknown`.
 */
export const SIDE_DATA_KINDS = ["user_data_unregistered_sei", "display_matrix", "mastering_display_metadata", "content_light_level", "hdr_dynamic_metadata",
  "dolby_vision", "icc_profile", "spherical_mapping", "stereo_3d", "unknown"] as const;
const MAX_FACT_ENTRIES = 400_000;
const SafeInt = z.number().int().safe();
const PositiveSafeInt = z.number().int().positive().safe();
const NonNegativeSafeInt = z.number().int().nonnegative().safe();
const StreamIndex = z.number().int().min(0).max(15);
const Int32 = z.number().int().min(-2_147_483_648).max(2_147_483_647);
/** An ISO BMFF track timescale: a time base is exactly 1/timescale. */
const Timescale = z.number().int().min(1).max(2_147_483_647);
export const FactsTimeBaseSchema = z.strictObject({ numerator: z.literal(1), denominator: Timescale });
const RatioSchema = z.strictObject({ numerator: PositiveSafeInt, denominator: PositiveSafeInt });
const SizeSchema = z.strictObject({ width: PositiveSafeInt, height: PositiveSafeInt });
/** One sample-aspect declaration: the container's (`pasp`) or the bitstream's (VUI). B2R e02: FFmpeg lets the container win a conflict. */
const SarDeclarationSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("unspecified") }),
  z.strictObject({ state: z.literal("declared"), numerator: Timescale, denominator: Timescale })]);
/** FFmpeg's composed display matrix, [a b u; c d v; x y w] in 16.16 (a b c d x y) and 2.30 (u v w) fixed point, or one it could not read. */
const DisplayMatrixFactSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("absent") }),
  z.strictObject({ state: z.literal("present"), coefficients: z.array(Int32).length(9) }), z.strictObject({ state: z.literal("unparsed") })]);
/** The container clean aperture (ffprobe's stream side data "Frame Cropping"): B2R e04 CR01 decodes 300x170 while the stream says 320x180. */
const FrameCroppingFactSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("absent") }),
  z.strictObject({ state: z.literal("present"), top: NonNegativeSafeInt, bottom: NonNegativeSafeInt, left: NonNegativeSafeInt, right: NonNegativeSafeInt })]);
/** ffprobe's colour names; an unspecified value is `null`. */
const ColorLabelSchema = z.string().regex(/^[a-z0-9-]{1,32}$/).nullable();
const ColorFactsSchema = z.strictObject({ range: z.enum(["tv", "pc"]).nullable(), primaries: ColorLabelSchema, transfer: ColorLabelSchema, matrix: ColorLabelSchema });
const SideDataFactSchema = z.strictObject({ carrier: z.enum(["stream", "frame"]), kind: z.enum(SIDE_DATA_KINDS),
  seiUuid: z.string().regex(/^[a-f0-9]{32}$/).nullable() })
  .refine(v => (v.kind === "user_data_unregistered_sei") === (v.seiUuid !== null), "Exactly a user-data-unregistered SEI names its UUID.")
  .refine(v => v.kind !== "display_matrix" || v.carrier === "frame", "A stream display matrix is the displayMatrix fact, never a side-data entry.");
const VideoStreamFactsSchema = z.strictObject({
  kind: z.literal("video"), index: StreamIndex, codec: z.enum(["h264", "hevc", "other"]),
  pixelFormat: z.string().regex(/^[a-z0-9_]{1,40}$/), bitDepth: z.number().int().min(1).max(16),
  fieldOrder: z.enum(["progressive", "tt", "bb", "tb", "bt", "unknown"]),
  /** The stream's declared presentation size and the distinct sizes of its decoded frames. */
  geometry: z.strictObject({ declared: SizeSchema, decoded: z.array(SizeSchema).min(1).max(16) }),
  sampleAspectRatio: z.strictObject({ container: SarDeclarationSchema, bitstream: SarDeclarationSchema }),
  displayMatrix: DisplayMatrixFactSchema, frameCropping: FrameCroppingFactSchema, color: ColorFactsSchema,
  sideData: z.array(SideDataFactSchema).max(32),
  timeBase: FactsTimeBaseSchema, declaredFrameRate: RatioSchema, decodeReordering: z.boolean(),
  /** Every decoded frame's presentation timestamp, in presentation order, in the stream's time base. */
  presentationTimestamps: z.array(SafeInt).max(MAX_FACT_ENTRIES),
});
const AudioStreamFactsSchema = z.strictObject({
  kind: z.literal("audio"), index: StreamIndex, codec: z.enum(["aac_lc", "aac_other", "pcm_s16le", "other"]),
  sampleRateHz: z.number().int().min(1).max(768_000), channels: z.number().int().min(1).max(64), channelLayout: z.enum(["mono", "stereo", "other"]),
  timeBase: FactsTimeBaseSchema,
  /** Every decoded (presented) audio frame: its timestamp in the stream's time base and its sample count. */
  frames: z.array(z.strictObject({ pts: SafeInt, samples: z.number().int().min(1).max(1_048_576) })).max(MAX_FACT_ENTRIES),
});
const StreamFactsSchema = z.discriminatedUnion("kind", [VideoStreamFactsSchema, AudioStreamFactsSchema,
  z.strictObject({ kind: z.literal("timecode"), index: StreamIndex, codec: z.literal("tmcd") }),
  z.strictObject({ kind: z.literal("subtitle"), index: StreamIndex, codec: z.enum(["mov_text", "other"]) }),
  z.strictObject({ kind: z.literal("data"), index: StreamIndex }), z.strictObject({ kind: z.literal("attachment"), index: StreamIndex })]);
export const CanonicalMediaFactsSchema = z.strictObject({
  factsType: z.literal("CanonicalMediaFacts"), factsVersion: z.literal(CANONICAL_MEDIA_FACTS_VERSION),
  container: z.enum(["iso_bmff", "other"]), streams: z.array(StreamFactsSchema).min(1).max(16),
}).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!value.streams.every((s, i) => s.index === i)) issue("Stream indexes are contiguous from zero, in order.");
  for (const s of value.streams) {
    if (s.kind !== "video") continue;
    const sizes = s.geometry.decoded.map(size => canonicalSerialize(size)), entries = s.sideData.map(entry => canonicalSerialize(entry));
    if (new Set(sizes).size !== sizes.length) issue("Each decoded frame size is listed once.");
    if (!entries.every((entry, i) => i === 0 || entries[i - 1]! < entry)) issue("Side-data entries are distinct and in canonical order.");
  }
});
export type CanonicalMediaFacts = z.infer<typeof CanonicalMediaFactsSchema>;
export type VideoStreamFacts = z.infer<typeof VideoStreamFactsSchema>;
export type AudioStreamFacts = z.infer<typeof AudioStreamFactsSchema>;
export type StreamFacts = z.infer<typeof StreamFactsSchema>;
/** The exact facts' digest: what an evaluation, a plan's evidence and a derivation bind. */
export const canonicalMediaFactsDigestOf = (facts: CanonicalMediaFacts): string => sha256(canonicalSerialize(facts));
/** The digest of one video presentation timeline: its time base and every presentation timestamp. */
export const videoTimelineDigestOf = (stream: { timeBase: { numerator: 1; denominator: number }; presentationTimestamps: readonly number[] }): string =>
  sha256(canonicalSerialize({ timeBase: stream.timeBase, presentationTimestamps: [...stream.presentationTimestamps] }));
/** The digest of one audio timeline: its time base and every decoded frame's timestamp and sample count. */
export const audioTimelineDigestOf = (stream: { timeBase: { numerator: 1; denominator: number }; frames: readonly { pts: number; samples: number }[] }): string =>
  sha256(canonicalSerialize({ timeBase: stream.timeBase, frames: stream.frames.map(f => ({ pts: f.pts, samples: f.samples })) }));

// ---------------------------------------------------------------- CanonicalMediaProfile v1
export const CANONICAL_MEDIA_PROFILE_IDENTITY = "canonical_media_profile_v1" as const;
/**
 * The target state, as data. Its identity is the content identity of exactly these semantics: any changed rule is another profile. The
 * bounds are the accepted B1 bounds (N1_BOUNDS). Colour: unspecified primaries, transfer and matrix are BT.709 by this explicit, versioned
 * assumption (owner ruling D14, B2R e05/e10: the pipeline converts nothing between tags). B2R established no assumption for an
 * unspecified range (e05's untagged luma measurement failed), so v1 requires an explicit limited range.
 */
export const CANONICAL_MEDIA_PROFILE_V1_SEMANTICS = {
  profile: "canonical_media_profile", profileVersion: "1.0.0",
  meaning: "the_media_state_the_current_editing_pipeline_treats_as_truthful_and_safe_not_an_output_render_profile",
  container: { family: "iso_bmff" },
  streams: { video: "exactly_one", audio: "absent_or_exactly_one", otherRetained: "none" },
  video: {
    codecs: ["h264"], pixelFormats: ["yuv420p"], bitDepths: [8], chromaSubsampling: "4:2:0", scan: "progressive",
    geometry: { maxDimension: 16_384, declaredEqualsDecoded: true, singleDecodedSize: true },
    sampleAspectRatio: { numerator: 1, denominator: 1, declarations: "explicit_and_agreeing" },
    displayMatrix: ["absent", "identity"], frameCropping: "absent",
  },
  timing: {
    presentation: "decoded_presentation_timestamps_are_authoritative_and_strictly_increasing",
    start: "exact_zero_common_to_every_retained_stream",
    grid: "exact_constant_frame_rate_at_the_declared_rate_from_zero",
    frameRate: { minFramesPerSecond: 1, maxFramesPerSecond: 120, maxNumerator: 120_000, maxDenominator: 1001 },
    maxFrames: 72_000, maxDurationSeconds: 600,
  },
  color: {
    ranges: ["tv"], primaries: ["bt709"], transfers: ["bt709"], matrices: ["bt709"],
    assumptions: { unspecifiedPrimariesTransferMatrix: "interpreted_as_bt709_v1", unspecifiedRange: "none_not_established_by_b2r_explicit_tv_required" },
  },
  sideData: {
    informational: [{ codec: "h264", carrier: "frame", kind: "user_data_unregistered_sei", seiUuid: X264_ENCODER_INFO_SEI_UUID },
      { codec: "hevc", carrier: "frame", kind: "user_data_unregistered_sei", seiUuid: X265_ENCODER_INFO_SEI_UUID }],
    other: "never_conforms",
  },
  audio: {
    codecs: ["aac_lc", "pcm_s16le"], sampleRatesHz: [32_000, 44_100, 48_000],
    layouts: [{ channelLayout: "mono", channels: 1 }, { channelLayout: "stereo", channels: 2 }],
    timeBase: "one_over_the_sample_rate", timeline: "contiguous_exact_cumulative_sample_counts_from_the_common_zero_start",
  },
} as const;
export const canonicalMediaProfileIdOf = (semantics: unknown): string => contentId(CANONICAL_MEDIA_PROFILE_IDENTITY, semantics);
export const CANONICAL_MEDIA_PROFILE_V1 = { profileId: canonicalMediaProfileIdOf(CANONICAL_MEDIA_PROFILE_V1_SEMANTICS), profileVersion: "1.0.0" } as const;
const PROFILE = CANONICAL_MEDIA_PROFILE_V1_SEMANTICS;

// ---------------------------------------------------------------- what the v1 exact-remux vocabulary can repair
/** The finite canonical rate set of B2R's timing classifier (instruments/timing.mjs), in its order. A declared rate is never a snap target. */
export const CANONICAL_SNAP_RATES = [[24_000, 1001], [24, 1], [25, 1], [30_000, 1001], [30, 1], [48, 1], [50, 1], [60_000, 1001], [60, 1], [100, 1],
  [120_000, 1001], [120, 1]] as const;
/** The exact maximum audio displacement B2R proved payload-identical (e11: 9 samples; e07c asset_05: steps of -7 and -2). */
export const AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES = 9 as const;
export const CANONICAL_REMUX_ENVELOPE_V1 = {
  envelope: "canonical_exact_remux_envelope_v1",
  droppableStreams: [{ kind: "timecode", codec: "tmcd" }, { kind: "subtitle", codec: "mov_text" }],
  rebase: "one_exact_common_positive_start_subtracted_from_every_retained_stream",
  sampleAspect: { when: "unspecified_in_both_declarations", declares: { numerator: 1, denominator: 1 }, assumption: N1_ASSUMPTION },
  snap: { rates: CANONICAL_SNAP_RATES, choice: "least_maximum_displacement_as_a_fraction_of_the_period_then_rate_order",
    mapping: "one_to_one_by_presentation_index_anchored_at_the_first_frame", maxDisplacement: "one_quarter_of_the_target_period_inclusive",
    timeBase: "the_source_time_base_when_it_holds_the_grid_else_the_least_common_multiple_of_the_source_and_grid_timescales" },
  audioRetime: { maxDisplacementSamples: AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES, positions: "exact_cumulative_sample_counts_after_the_stream_start" },
  minimumFrameInterval: "one_over_the_profile_maximum_frames_per_second",
  heldFirstFrame: "a_first_interval_longer_than_one_period_before_an_exact_or_near_constant_rate_tail",
  deferredCandidates: { reencode: ["display_d4_non_identity", "codec_hevc_8bit_sdr_candidate", "sar_non_square"], temporal: ["true_vfr"] },
} as const;

// ---------------------------------------------------------------- findings
export const PROFILE_DIMENSIONS = ["evidence", "stream_layout", "video_codec", "video_pixel_format", "video_scan", "video_geometry", "video_sample_aspect",
  "video_display_matrix", "video_frame_cropping", "color_range", "color_description", "side_data", "timing_grid", "timing_bounds", "timing_start",
  "audio_format", "audio_timeline"] as const;
export const FINDING_DISPOSITIONS = ["allowed", "exact_remux", "deferred_reencode", "deferred_temporal_reencode", "refuse"] as const;
export const PROFILE_OUTCOMES = ["CONFORMS", "CANONICALIZABLE_EXACT_REMUX", "CANONICALIZABLE_REENCODE_DEFERRED", "REFUSE"] as const;
type Dimension = (typeof PROFILE_DIMENSIONS)[number];
type Disposition = (typeof FINDING_DISPOSITIONS)[number];
export type ProfileOutcome = (typeof PROFILE_OUTCOMES)[number];
/** Every finding code with the one dimension it concerns and its one disposition, in the order findings are reported. */
export const PROFILE_FINDING_RULES = {
  facts_invalid: ["evidence", "refuse"],
  container_unsupported: ["stream_layout", "refuse"], video_stream_absent: ["stream_layout", "refuse"], multiple_video_streams: ["stream_layout", "refuse"],
  multiple_audio_streams: ["stream_layout", "refuse"], extra_non_av_stream: ["stream_layout", "exact_remux"], unsupported_stream: ["stream_layout", "refuse"],
  codec_hevc_8bit_sdr_candidate: ["video_codec", "deferred_reencode"], codec_unsupported: ["video_codec", "refuse"],
  bit_depth_unsupported: ["video_pixel_format", "refuse"], chroma_subsampling_unsupported: ["video_pixel_format", "refuse"],
  pixel_format_unsupported: ["video_pixel_format", "refuse"],
  interlaced: ["video_scan", "refuse"], field_order_unknown: ["video_scan", "refuse"],
  geometry_out_of_bounds: ["video_geometry", "refuse"], geometry_declared_decoded_mismatch: ["video_geometry", "refuse"], geometry_varies: ["video_geometry", "refuse"],
  sar_unspecified: ["video_sample_aspect", "exact_remux"], sar_non_square: ["video_sample_aspect", "deferred_reencode"],
  sar_declarations_conflict: ["video_sample_aspect", "refuse"],
  display_d4_non_identity: ["video_display_matrix", "deferred_reencode"], display_matrix_unsupported: ["video_display_matrix", "refuse"],
  display_matrix_unknown: ["video_display_matrix", "refuse"],
  frame_cropping_present: ["video_frame_cropping", "refuse"],
  color_range_full: ["color_range", "refuse"], color_range_unspecified: ["color_range", "refuse"],
  color_hdr: ["color_description", "refuse"], color_unsupported: ["color_description", "refuse"], color_unspecified_assumed_bt709: ["color_description", "allowed"],
  informational_sei_allowed: ["side_data", "allowed"], hdr_side_data_present: ["side_data", "refuse"], icc_profile_present: ["side_data", "refuse"],
  spatial_side_data_unsupported: ["side_data", "refuse"], unknown_side_data: ["side_data", "refuse"],
  video_frames_absent: ["timing_grid", "refuse"], timing_malformed: ["timing_grid", "refuse"], timing_interval_below_minimum: ["timing_grid", "refuse"],
  frame_rate_declaration_mismatch: ["timing_grid", "refuse"], near_cfr_snap_candidate: ["timing_grid", "exact_remux"],
  held_first_frame_ambiguous: ["timing_grid", "refuse"], true_vfr: ["timing_grid", "deferred_temporal_reencode"],
  snap_time_base_unrepresentable: ["timing_grid", "refuse"],
  frame_count_out_of_bounds: ["timing_bounds", "refuse"], duration_out_of_bounds: ["timing_bounds", "refuse"], frame_rate_out_of_bounds: ["timing_bounds", "refuse"],
  timeline_nonzero: ["timing_start", "exact_remux"], timeline_start_negative: ["timing_start", "refuse"], audio_av_start_mismatch: ["timing_start", "refuse"],
  audio_codec_unsupported: ["audio_format", "refuse"], audio_sample_rate_unsupported: ["audio_format", "refuse"], audio_layout_unsupported: ["audio_format", "refuse"],
  audio_time_base_unsupported: ["audio_format", "refuse"],
  audio_frames_absent: ["audio_timeline", "refuse"], audio_timing_malformed: ["audio_timeline", "refuse"],
  audio_small_timestamp_discontinuity: ["audio_timeline", "exact_remux"], audio_timestamp_discontinuity_unsupported: ["audio_timeline", "refuse"],
} as const satisfies Record<string, readonly [Dimension, Disposition]>;
export type FindingCode = keyof typeof PROFILE_FINDING_RULES;
export const PROFILE_FINDING_CODES = Object.keys(PROFILE_FINDING_RULES) as [FindingCode, ...FindingCode[]];
export interface ProfileFinding { dimension: Dimension; code: FindingCode; disposition: Disposition }
/** The evaluation's own identity: the target profile, the repair envelope and the finding table it applies. */
export const CANONICAL_PROFILE_EVALUATION_V1 = { evaluationVersion: "canonical_profile_evaluation_v1",
  evaluationDigest: sha256(canonicalSerialize({ profileId: CANONICAL_MEDIA_PROFILE_V1.profileId, envelope: CANONICAL_REMUX_ENVELOPE_V1, findingRules: PROFILE_FINDING_RULES })) } as const;
const findingOf = (code: FindingCode): ProfileFinding => ({ dimension: PROFILE_FINDING_RULES[code][0], code, disposition: PROFILE_FINDING_RULES[code][1] });
/** The worst disposition decides: any refusal refuses, then any deferral defers, then any repair plans, else the media conforms. */
export function outcomeOfFindings(findings: readonly ProfileFinding[]): ProfileOutcome {
  if (findings.some(f => f.disposition === "refuse")) return "REFUSE";
  if (findings.some(f => f.disposition === "deferred_reencode" || f.disposition === "deferred_temporal_reencode")) return "CANONICALIZABLE_REENCODE_DEFERRED";
  if (findings.some(f => f.disposition === "exact_remux")) return "CANONICALIZABLE_EXACT_REMUX";
  return "CONFORMS";
}
const FindingSchema = z.strictObject({ dimension: z.enum(PROFILE_DIMENSIONS), code: z.enum(PROFILE_FINDING_CODES), disposition: z.enum(FINDING_DISPOSITIONS) })
  .refine(f => PROFILE_FINDING_RULES[f.code][0] === f.dimension && PROFILE_FINDING_RULES[f.code][1] === f.disposition, "A finding has its code's dimension and disposition.");
/** A recorded evaluation (embedded in a 0.2.0 derivation): the v1 profile and evaluation, its facts digest and findings in rule order. */
export const CanonicalProfileEvaluationSchema = z.strictObject({
  profile: z.strictObject({ profileId: IdSchema, profileVersion: z.literal("1.0.0") }),
  evaluation: z.strictObject({ evaluationVersion: z.literal(CANONICAL_PROFILE_EVALUATION_V1.evaluationVersion), evaluationDigest: HashSchema }),
  factsDigest: HashSchema.nullable(), outcome: z.enum(PROFILE_OUTCOMES), findings: z.array(FindingSchema).max(PROFILE_FINDING_CODES.length),
}).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (value.profile.profileId !== CANONICAL_MEDIA_PROFILE_V1.profileId) issue("The evaluation is against CanonicalMediaProfile v1.");
  if (value.evaluation.evaluationDigest !== CANONICAL_PROFILE_EVALUATION_V1.evaluationDigest) issue("The evaluation applies the v1 rules.");
  const order = value.findings.map(f => PROFILE_FINDING_CODES.indexOf(f.code));
  if (!order.every((at, i) => i === 0 || order[i - 1]! < at)) issue("Findings are distinct and in rule order.");
  if (value.outcome !== outcomeOfFindings(value.findings)) issue("The outcome is the worst disposition among the findings.");
  if ((value.factsDigest === null) !== value.findings.some(f => f.code === "facts_invalid")) issue("Only invalid evidence has no facts digest.");
});
export type CanonicalProfileEvaluation = z.infer<typeof CanonicalProfileEvaluationSchema>;

// ---------------------------------------------------------------- exact arithmetic
const B = BigInt;
const absB = (x: bigint): bigint => (x < 0n ? -x : x);
function gcdB(a: bigint, b: bigint): bigint { let [x, y] = [absB(a), absB(b)]; while (y !== 0n) [x, y] = [y, x % y]; return x; }
/** A positive rational in lowest terms, as safe integers. */
export function reducedRatio(numerator: bigint, denominator: bigint): { numerator: number; denominator: number } {
  const g = gcdB(numerator, denominator);
  return { numerator: Number(numerator / g), denominator: Number(denominator / g) };
}
const MAX_TIMESCALE = 2_147_483_647n;
/**
 * The snap output timescale for a source timescale and a target rate a/b: the source's own when it holds every grid instant exactly
 * (e03 C1, C2, H5 kept 1/90000), else the least common multiple of the source timescale and the grid's reduced timescale (e03b B4:
 * 1/600 to 1/30000). Null when that exceeds an ISO BMFF timescale.
 */
export function snapTimescaleOf(sourceTimescale: number, rate: readonly [number, number]): number | null {
  const ts = B(sourceTimescale), a = B(rate[0]), b = B(rate[1]);
  if ((ts * b) % a === 0n) return sourceTimescale;
  const grid = a / gcdB(a, b), out = (ts / gcdB(ts, grid)) * grid;
  return out > MAX_TIMESCALE ? null : Number(out);
}

// ---------------------------------------------------------------- the full display matrix
const FX = 65_536, W = 1_073_741_824;
export type D4Element = "rotate_90_ccw" | "rotate_180" | "rotate_90_cw" | "mirror_horizontal" | "mirror_vertical" | "transpose" | "transverse";
export type DisplayMatrixFeature = "scale" | "rotation" | "shear" | "singular" | "translation" | "perspective" | "non_unit_w";
export type DisplayMatrixClass = { kind: "absent" } | { kind: "identity" } | { kind: "d4"; element: D4Element } | { kind: "unsupported"; features: DisplayMatrixFeature[] }
  | { kind: "unknown" };
/** The eight exact signed-permutation linear parts, by the signs of a, b, c, d (B2R e01s: each is exactly FFmpeg's autorotate filter). */
const D4_BY_SIGNS: Record<string, D4Element | "identity"> = { "1,0,0,1": "identity", "0,-1,1,0": "rotate_90_ccw", "-1,0,0,-1": "rotate_180", "0,1,-1,0": "rotate_90_cw",
  "-1,0,0,1": "mirror_horizontal", "1,0,0,-1": "mirror_vertical", "0,1,1,0": "transpose", "0,-1,-1,0": "transverse" };
/**
 * Classifies a display-matrix fact from its nine coefficients alone. Identity and the seven non-identity D4 elements are exact
 * signed permutations with no translation, no perspective and w = 1. Anything else is unsupported and names what it adds: a non-D4
 * linear part (an axis scale, a non-right-angle rotation, a shear, or a singular matrix), a translation, a perspective term or w ≠ 1.
 */
export function classifyDisplayMatrix(fact: unknown): DisplayMatrixClass {
  const parsed = DisplayMatrixFactSchema.safeParse(fact);
  if (!parsed.success || parsed.data.state === "unparsed") return { kind: "unknown" };
  if (parsed.data.state === "absent") return { kind: "absent" };
  const [a, b, u, c, d, v, x, y, w] = parsed.data.coefficients as [number, number, number, number, number, number, number, number, number];
  const unit = (n: number) => n === 0 || n === FX || n === -FX, diagonal = b === 0 && c === 0, anti = a === 0 && d === 0;
  const signedPermutation = [a, b, c, d].every(unit) && ((diagonal && a !== 0 && d !== 0) || (anti && b !== 0 && c !== 0));
  const features: DisplayMatrixFeature[] = [];
  if (!signedPermutation) {
    if (B(a) * B(d) - B(b) * B(c) === 0n) features.push("singular");
    else if (diagonal || anti) features.push("scale");
    else if ((a === d && b === -c) || (a === -d && b === c)) features.push("rotation");
    else features.push("shear");
  }
  if (x !== 0 || y !== 0) features.push("translation");
  if (u !== 0 || v !== 0) features.push("perspective");
  if (w !== W) features.push("non_unit_w");
  if (features.length > 0) return { kind: "unsupported", features };
  const element = D4_BY_SIGNS[[a, b, c, d].map(n => Math.sign(n)).join(",")]!;
  return element === "identity" ? { kind: "identity" } : { kind: "d4", element };
}

// ---------------------------------------------------------------- timelines
export type VideoTimeline = { kind: "absent" } | { kind: "malformed" } | { kind: "below_minimum_interval" } | { kind: "exact" }
  | { kind: "declaration_mismatch" } | { kind: "near"; rate: readonly [number, number]; maxErrorScaled: bigint } | { kind: "held_first_frame" } | { kind: "true_vfr" };
/** Every frame exactly on the grid of rate n/d anchored at the first frame: (p_i − p_0)·n = i·d·T. */
function exactOn(pts: readonly number[], timescale: bigint, rate: readonly [number, number]): boolean {
  const p0 = B(pts[0]!), n = B(rate[0]), d = B(rate[1]);
  return pts.every((p, i) => (B(p) - p0) * n === B(i) * d * timescale);
}
/**
 * The canonical rate whose one-to-one grid from the first frame keeps every frame within a quarter period (4·|E| ≤ b·T with
 * E_i = (p_i − p_0)·a − i·b·T, i.e. |displacement| = |E|/(a·T) ≤ (b/a)/4), choosing the least maximum displacement as a fraction of the
 * period (|E|max/(b·T)) and then rate order, exactly as B2R's classifier chose. Null when none fits.
 */
function bestNear(pts: readonly number[], timescale: bigint): { rate: readonly [number, number]; maxErrorScaled: bigint } | null {
  let best: { rate: readonly [number, number]; maxErrorScaled: bigint } | null = null;
  const p0 = B(pts[0]!);
  for (const rate of CANONICAL_SNAP_RATES) {
    const a = B(rate[0]), b = B(rate[1]);
    let max = 0n;
    pts.forEach((p, i) => { const e = absB((B(p) - p0) * a - B(i) * b * timescale); if (e > max) max = e; });
    if (4n * max > b * timescale) continue;
    if (best === null || max * B(best.rate[1]) < best.maxErrorScaled * b) best = { rate, maxErrorScaled: max };
  }
  return best;
}
/**
 * The video presentation timeline's class. Decoded presentation timestamps are authoritative and are never reordered: a non-increasing
 * table is malformed evidence. An interval shorter than one period of the profile's maximum rate refuses (e03 F1's one-tick pairs).
 * Exact means exactly on the declared rate's grid. A held first frame (e07r assets 02/06) is a first interval longer than one period
 * before a tail that is exact or near-CFR: its cause is unproven, so it is never snapped (owner ruling D9).
 */
export function classifyVideoTimeline(pts: readonly number[], timescale: number, declared: { numerator: number; denominator: number }): VideoTimeline {
  if (pts.length === 0) return { kind: "absent" };
  const ts = B(timescale), maxFps = B(PROFILE.timing.frameRate.maxFramesPerSecond);
  for (let i = 1; i < pts.length; i += 1) if (pts[i]! <= pts[i - 1]!) return { kind: "malformed" };
  for (let i = 1; i < pts.length; i += 1) if ((B(pts[i]!) - B(pts[i - 1]!)) * maxFps < ts) return { kind: "below_minimum_interval" };
  if (exactOn(pts, ts, [declared.numerator, declared.denominator])) return { kind: "exact" };
  if (CANONICAL_SNAP_RATES.some(rate => exactOn(pts, ts, rate))) return { kind: "declaration_mismatch" };
  const near = bestNear(pts, ts);
  if (near !== null) return { kind: "near", ...near };
  if (pts.length >= 3) {
    const tail = pts.slice(1), first = B(pts[1]!) - B(pts[0]!), tailNear = bestNear(tail, ts);
    const fitting: (readonly [number, number])[] = [...CANONICAL_SNAP_RATES, [declared.numerator, declared.denominator] as const].filter(rate => exactOn(tail, ts, rate));
    if (tailNear !== null) fitting.push(tailNear.rate);
    if (fitting.some(([a, b]) => first * B(a) > B(b) * ts)) return { kind: "held_first_frame" };
  }
  return { kind: "true_vfr" };
}
/** The audio timeline: malformed (not strictly increasing), or its largest displacement from exact cumulative sample positions. */
export function audioDisplacementOf(frames: readonly { pts: number; samples: number }[]): { kind: "absent" } | { kind: "malformed" } | { kind: "measured"; maxSamples: number } {
  if (frames.length === 0) return { kind: "absent" };
  for (let k = 1; k < frames.length; k += 1) if (frames[k]!.pts <= frames[k - 1]!.pts) return { kind: "malformed" };
  let expected = B(frames[0]!.pts), max = 0n;
  for (const frame of frames) { const e = absB(B(frame.pts) - expected); if (e > max) max = e; expected += B(frame.samples); }
  return { kind: "measured", maxSamples: Number(max) };
}

// ---------------------------------------------------------------- the evaluation
const HDR_TRANSFERS: readonly string[] = ["smpte2084", "arib-std-b67"];
const HIGH_BIT_DEPTH = /^yuv(420|422|444)p(9|10|12|14|16)(le|be)$/;
const HDR_SIDE_DATA: readonly string[] = ["mastering_display_metadata", "content_light_level", "hdr_dynamic_metadata", "dolby_vision"];
/** What the planner needs besides the evaluation: the parsed facts and the measured timelines. */
export interface CanonicalMediaAnalysis {
  evaluation: CanonicalProfileEvaluation;
  facts: CanonicalMediaFacts | null;
  video: VideoStreamFacts | null; audio: AudioStreamFacts | null; others: StreamFacts[];
  videoTimeline: VideoTimeline | null; audioMaxDisplacementSamples: number | null;
}
const inBounds = (n: number, d: number): boolean => {
  const r = PROFILE.timing.frameRate;
  return n >= r.minFramesPerSecond * d && n <= r.maxFramesPerSecond * d && n <= r.maxNumerator && d <= r.maxDenominator;
};
const isDroppable = (s: StreamFacts): boolean => CANONICAL_REMUX_ENVELOPE_V1.droppableStreams.some(k => k.kind === s.kind && "codec" in s && s.codec === k.codec);
const sideDataAllowed = (codec: string, entry: { carrier: string; kind: string; seiUuid: string | null }): boolean =>
  PROFILE.sideData.informational.some(i => i.codec === codec && i.carrier === entry.carrier && i.kind === entry.kind && i.seiUuid === entry.seiUuid);

function videoFindings(v: VideoStreamFacts, timeline: VideoTimeline | null, add: (code: FindingCode) => void): void {
  const color = v.color, sdrDescription = [color.primaries, color.transfer, color.matrix].every(value => value === null || value === "bt709");
  if (v.codec === "hevc") {
    add(v.pixelFormat === "yuv420p" && v.bitDepth === 8 && v.fieldOrder === "progressive" && color.range === "tv" && sdrDescription
      ? "codec_hevc_8bit_sdr_candidate" : "codec_unsupported");
  } else if (!(PROFILE.video.codecs as readonly string[]).includes(v.codec)) add("codec_unsupported");
  if (!(PROFILE.video.bitDepths as readonly number[]).includes(v.bitDepth)) add("bit_depth_unsupported");
  const high = HIGH_BIT_DEPTH.exec(v.pixelFormat);
  if (high !== null) { add("bit_depth_unsupported"); if (high[1] !== "420") add("chroma_subsampling_unsupported"); }
  else if (v.pixelFormat === "yuv422p" || v.pixelFormat === "yuv444p") add("chroma_subsampling_unsupported");
  else if (v.pixelFormat === "yuvj420p") add("color_range_full");
  else if (!(PROFILE.video.pixelFormats as readonly string[]).includes(v.pixelFormat)) add("pixel_format_unsupported");
  if (v.fieldOrder === "unknown") add("field_order_unknown");
  else if (v.fieldOrder !== PROFILE.video.scan) add("interlaced");
  const [decoded] = v.geometry.decoded;
  if (v.geometry.decoded.length > 1) add("geometry_varies");
  if (decoded !== undefined && (decoded.width !== v.geometry.declared.width || decoded.height !== v.geometry.declared.height)) add("geometry_declared_decoded_mismatch");
  if ([v.geometry.declared, ...v.geometry.decoded].some(s => s.width > PROFILE.video.geometry.maxDimension || s.height > PROFILE.video.geometry.maxDimension)) {
    add("geometry_out_of_bounds");
  }
  const { container, bitstream } = v.sampleAspectRatio;
  if (container.state === "declared" && bitstream.state === "declared" && B(container.numerator) * B(bitstream.denominator) !== B(bitstream.numerator) * B(container.denominator)) {
    add("sar_declarations_conflict");
  } else {
    const effective = container.state === "declared" ? container : bitstream;
    if (effective.state === "unspecified") add("sar_unspecified");
    else if (effective.numerator !== effective.denominator) add("sar_non_square");
  }
  const geometry = classifyDisplayMatrix(v.displayMatrix);
  if (geometry.kind === "d4") add("display_d4_non_identity");
  else if (geometry.kind === "unsupported") add("display_matrix_unsupported");
  else if (geometry.kind === "unknown") add("display_matrix_unknown");
  if (v.frameCropping.state === "present") add("frame_cropping_present");
  if (color.range === "pc") add("color_range_full");
  else if (color.range === null) add("color_range_unspecified");
  const description: [string | null, readonly string[], boolean][] = [[color.primaries, PROFILE.color.primaries, false], [color.transfer, PROFILE.color.transfers, true],
    [color.matrix, PROFILE.color.matrices, false]];
  for (const [value, accepted, transfer] of description) {
    if (value === null) add("color_unspecified_assumed_bt709");
    else if (transfer && HDR_TRANSFERS.includes(value)) add("color_hdr");
    else if (!accepted.includes(value)) add("color_unsupported");
  }
  for (const entry of v.sideData) {
    if (entry.kind === "user_data_unregistered_sei") add(sideDataAllowed(v.codec, entry) ? "informational_sei_allowed" : "unknown_side_data");
    else if (HDR_SIDE_DATA.includes(entry.kind)) add("hdr_side_data_present");
    else if (entry.kind === "icc_profile") add("icc_profile_present");
    else if (entry.kind === "spherical_mapping" || entry.kind === "stereo_3d") add("spatial_side_data_unsupported");
    else if (entry.kind === "display_matrix") add("display_matrix_unsupported");
    else add("unknown_side_data");
  }
  const n = v.presentationTimestamps.length;
  const durationFits = (rate: readonly [number, number]) => B(n) * B(rate[1]) <= B(PROFILE.timing.maxDurationSeconds) * B(rate[0]);
  if (timeline === null) { add("frame_count_out_of_bounds"); return; }
  switch (timeline.kind) {
    case "absent": add("video_frames_absent"); break;
    case "malformed": add("timing_malformed"); break;
    case "below_minimum_interval": add("timing_interval_below_minimum"); break;
    case "declaration_mismatch": add("frame_rate_declaration_mismatch"); break;
    case "held_first_frame": add("held_first_frame_ambiguous"); break;
    case "true_vfr": add("true_vfr"); break;
    case "exact": {
      const { numerator, denominator } = v.declaredFrameRate;
      if (!inBounds(numerator, denominator)) add("frame_rate_out_of_bounds");
      else if (!durationFits([numerator, denominator])) add("duration_out_of_bounds");
      break;
    }
    case "near": {
      add("near_cfr_snap_candidate");
      if (snapTimescaleOf(v.timeBase.denominator, timeline.rate) === null) add("snap_time_base_unrepresentable");
      if (!durationFits(timeline.rate)) add("duration_out_of_bounds");
      break;
    }
  }
}

function audioFindings(a: AudioStreamFacts, displacement: ReturnType<typeof audioDisplacementOf>, add: (code: FindingCode) => void): boolean {
  if (!(PROFILE.audio.codecs as readonly string[]).includes(a.codec)) add("audio_codec_unsupported");
  if (!(PROFILE.audio.sampleRatesHz as readonly number[]).includes(a.sampleRateHz)) add("audio_sample_rate_unsupported");
  if (!PROFILE.audio.layouts.some(l => l.channelLayout === a.channelLayout && l.channels === a.channels)) add("audio_layout_unsupported");
  const samplesAreTicks = a.timeBase.denominator === a.sampleRateHz;
  if (!samplesAreTicks) add("audio_time_base_unsupported");
  if (displacement.kind === "absent") add("audio_frames_absent");
  else if (displacement.kind === "malformed") add("audio_timing_malformed");
  else if (samplesAreTicks && displacement.maxSamples > AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES) add("audio_timestamp_discontinuity_unsupported");
  else if (samplesAreTicks && displacement.maxSamples > 0) add("audio_small_timestamp_discontinuity");
  return displacement.kind === "measured";
}

/**
 * The full evaluation plus what the planner needs. Total: invalid evidence is a REFUSE with `facts_invalid` and no digest, never an
 * exception. Checks are independent and all reported: stream layout; then, for exactly one video stream, codec, pixel format, scan,
 * geometry, sample aspect, display matrix, clean aperture, colour, side data and the timeline; for at most one audio stream, its format
 * and timeline; and the one common start of the retained streams.
 */
export function analyzeCanonicalMediaFactsV1(input: unknown): CanonicalMediaAnalysis {
  const header = { profile: { profileId: CANONICAL_MEDIA_PROFILE_V1.profileId, profileVersion: CANONICAL_MEDIA_PROFILE_V1.profileVersion },
    evaluation: { evaluationVersion: CANONICAL_PROFILE_EVALUATION_V1.evaluationVersion, evaluationDigest: CANONICAL_PROFILE_EVALUATION_V1.evaluationDigest } };
  const parsed = CanonicalMediaFactsSchema.safeParse(input);
  if (!parsed.success) {
    return { evaluation: { ...header, factsDigest: null, outcome: "REFUSE", findings: [findingOf("facts_invalid")] }, facts: null, video: null, audio: null, others: [],
      videoTimeline: null, audioMaxDisplacementSamples: null };
  }
  const facts = parsed.data, codes = new Set<FindingCode>(), add = (code: FindingCode) => { codes.add(code); };
  const videos = facts.streams.filter((s): s is VideoStreamFacts => s.kind === "video"), audios = facts.streams.filter((s): s is AudioStreamFacts => s.kind === "audio");
  const others = facts.streams.filter(s => s.kind !== "video" && s.kind !== "audio");
  if (facts.container !== PROFILE.container.family) add("container_unsupported");
  if (videos.length === 0) add("video_stream_absent");
  if (videos.length > 1) add("multiple_video_streams");
  if (audios.length > 1) add("multiple_audio_streams");
  for (const other of others) add(isDroppable(other) ? "extra_non_av_stream" : "unsupported_stream");
  const video = videos.length === 1 ? videos[0]! : null, audio = audios.length === 1 ? audios[0]! : null;
  let videoTimeline: VideoTimeline | null = null, audioMax: number | null = null, audioTimed = false;
  if (video !== null) {
    // Over-long tables are not classified (the work stays bounded); every other video dimension is still evaluated.
    videoTimeline = video.presentationTimestamps.length > PROFILE.timing.maxFrames ? null
      : classifyVideoTimeline(video.presentationTimestamps, video.timeBase.denominator, video.declaredFrameRate);
    videoFindings(video, videoTimeline, add);
  }
  if (audio !== null) {
    const displacement = audioDisplacementOf(audio.frames);
    audioTimed = audioFindings(audio, displacement, add);
    if (displacement.kind === "measured") audioMax = displacement.maxSamples;
  }
  // The one common start of the retained streams, compared as exact rationals: p0 / Tv against s0 / Ta.
  const videoTimed = video !== null && videoTimeline !== null && !["absent", "malformed", "below_minimum_interval"].includes(videoTimeline.kind);
  if (video !== null && videoTimed && audios.length <= 1) {
    const p0 = B(video.presentationTimestamps[0]!), tv = B(video.timeBase.denominator);
    if (audio !== null && audioTimed && p0 * B(audio.timeBase.denominator) !== B(audio.frames[0]!.pts) * tv) add("audio_av_start_mismatch");
    else if (p0 > 0n) add("timeline_nonzero");
    else if (p0 < 0n) add("timeline_start_negative");
  }
  const findings = PROFILE_FINDING_CODES.filter(code => codes.has(code)).map(findingOf);
  const evaluation = { ...header, factsDigest: canonicalMediaFactsDigestOf(facts), outcome: outcomeOfFindings(findings), findings };
  return { evaluation, facts, video, audio, others, videoTimeline, audioMaxDisplacementSamples: audioMax };
}
/** CanonicalMediaProfile v1 against one facts record: CONFORMS, CANONICALIZABLE_EXACT_REMUX, CANONICALIZABLE_REENCODE_DEFERRED or REFUSE. */
export function evaluateCanonicalProfileV1(facts: unknown): CanonicalProfileEvaluation {
  return analyzeCanonicalMediaFactsV1(facts).evaluation;
}
