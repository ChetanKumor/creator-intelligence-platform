/**
 * Gate 7 Batch 3E-B1A: the pure contract of canonical media ingest.
 *
 * - Classification. An already-parsed probe of one source is DIRECT (the strict renderer admits it unchanged), NORMALIZE_N1 (an
 *   unspecified sample aspect ratio is its only renderer blocker and every N1 condition holds) or REFUSE. The renderer's own strict
 *   probe parser and conformance evaluator decide every renderer question, unchanged. That SAR is the only blocker is proved by
 *   evaluating the same probe with an explicit 1:1 SAR and nothing else changed. N1 adds only what the renderer does not read:
 *   progressive scan, SDR colour, and no stream or frame side data.
 * - Derivation. One completed, verified canonicalization is a CanonicalMediaDerivation with two identities. The computation is
 *   known before execution: the source bytes, the recipe and the pinned toolchain. The derivation is the verified result, and it
 *   also binds the root authorization, the scope, the classified evidence and the output.
 *
 * Nothing here reads a file, clock, environment, process or network, or runs FFmpeg or ffprobe. No record names a location: the
 * canonical store (B1B) is content-addressed.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { sha256 } from "../edit-render/common.js";
import { CONFORMANCE_REASONS, evaluateInputConformance, parseProbeJson, ratioOf, type ConformanceInput, type ConformanceReason, type ProbeReport }
  from "../edit-render/probe.js";
import { PINNED_MEDIA_RUNTIME, RENDER_ENVIRONMENT } from "../edit-render/semantics.js";
import { FootageAuthorizationDerivedSchema, FootageAuthorizationRootSchema, type FootageAuthorizationDerived } from "../footage-analyzer/protocol.js";
import { contentId } from "../reference-analyzer/features.js";
import { HashSchema } from "../reference-analyzer/protocol.js";

export const MEDIA_INGEST_VERSION = "0.1.0" as const;
export const MEDIA_INGEST_ERROR_CODES = ["classification_invalid", "derivation_invalid", "authorization_invalid"] as const;
export type MediaIngestErrorCode = (typeof MEDIA_INGEST_ERROR_CODES)[number];
/** Every media-ingest refusal carries one owned code. */
export class MediaIngestError extends Error {
  constructor(public readonly code: MediaIngestErrorCode, message: string) { super(message); this.name = "MediaIngestError"; }
}
function fail(code: MediaIngestErrorCode, message: string): never { throw new MediaIngestError(code, message); }
function parseOr<S extends z.ZodType>(schema: S, value: unknown, code: MediaIngestErrorCode, message: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) fail(code, message);
  return result.data;
}
const PositiveSafeInt = z.number().int().positive().safe();

// ---------------------------------------------------------------- classification
export const DIRECT_REASON = "renderer_conforms_unchanged" as const;
export const N1_REASON = "sample_aspect_ratio_unspecified_only_renderer_blocker" as const;
/** The one assumption N1 makes: a source that declares no sample aspect ratio, and passes every other check, has square pixels. */
export const N1_ASSUMPTION = "unspecified_sample_aspect_ratio_is_square_pixel_v1" as const;
export const CANONICAL_REFUSALS = ["probe_invalid", "facts_invalid", "video_frames_absent", "video_geometry_undeclared", "geometry_out_of_bounds",
  "frame_rate_undeclared", "frame_rate_out_of_bounds", "frame_count_out_of_bounds", "duration_out_of_bounds", "audio_parameters_unsupported",
  "sample_aspect_ratio_explicit_non_square", "sample_aspect_ratio_malformed", "renderer_nonconforming", "stream_side_data_present", "frame_side_data_present",
  "field_order_not_progressive", "color_not_sdr"] as const;
export type CanonicalRefusal = (typeof CANONICAL_REFUSALS)[number];
/** Why a refusal is final for B1: malformed evidence, a case deferred to B2, or a source outside the accepted analysis/render bounds. */
export const REFUSAL_BASES = ["invalid_input", "deferred_to_b2", "outside_b1_bounds"] as const;
/** The accepted bounds: the analyzer's frame and duration limits (MetadataSchema) and the accepted frame-rate range (FrameRateSchema). */
export const N1_BOUNDS = { maxDimension: 16_384, maxFrames: 72_000, maxDurationSeconds: 600, maxFramesPerSecond: 120, maxRateNumerator: 120_000,
  maxRateDenominator: 1001 } as const;
const SDR_TRANSFERS: readonly (string | null)[] = [null, "bt709", "smpte170m", "bt470bg", "bt470m", "iec61966-2-1"];
const SDR_PRIMARIES: readonly (string | null)[] = [null, "bt709", "smpte170m", "bt470bg", "bt470m"];
const ColorLabelSchema = z.string().regex(/^[a-z0-9-]{1,32}$/).nullable();
/**
 * What ingest needs beyond the renderer's probe: the stream's field order and colour description, already parsed. An unspecified
 * colour value is `null`.
 */
export const IngestVideoFactsSchema = z.strictObject({ fieldOrder: z.enum(["progressive", "tt", "bb", "tb", "bt", "unknown"]),
  colorTransfer: ColorLabelSchema, colorPrimaries: ColorLabelSchema });
export type IngestVideoFacts = z.infer<typeof IngestVideoFactsSchema>;

const ClassifiedVideoSchema = z.strictObject({ width: PositiveSafeInt, height: PositiveSafeInt, frameCount: PositiveSafeInt, frameTableId: IdSchema,
  frameRate: z.strictObject({ numerator: PositiveSafeInt, denominator: PositiveSafeInt }) });
const ClassifiedAudioSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("absent") }),
  z.strictObject({ state: z.literal("present"), codec: z.enum(["aac", "pcm_s16le"]), sampleRateHz: PositiveSafeInt, channelLayout: z.enum(["mono", "stereo"]),
    samples: PositiveSafeInt })]);
const RendererReasonSchema = z.enum(CONFORMANCE_REASONS);
const N1ClassificationSchema = z.strictObject({ outcome: z.literal("NORMALIZE_N1"), reasonCode: z.literal(N1_REASON), assumption: z.literal(N1_ASSUMPTION),
  inputDigest: HashSchema, video: ClassifiedVideoSchema, audio: ClassifiedAudioSchema, rendererReason: z.literal("source_video_nonconforming"),
  squarePixelRendererReason: z.null() });
export const CanonicalClassificationSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("DIRECT"), reasonCode: z.literal(DIRECT_REASON), inputDigest: HashSchema, video: ClassifiedVideoSchema,
    audio: ClassifiedAudioSchema, rendererReason: z.null(), squarePixelRendererReason: z.null() }),
  N1ClassificationSchema,
  z.strictObject({ outcome: z.literal("REFUSE"), reasonCode: z.enum(CANONICAL_REFUSALS), basis: z.enum(REFUSAL_BASES), inputDigest: HashSchema.nullable(),
    rendererReason: RendererReasonSchema.nullable(), squarePixelRendererReason: RendererReasonSchema.nullable() }),
]);
export type CanonicalClassification = z.infer<typeof CanonicalClassificationSchema>;
type ClassifiedVideo = z.infer<typeof ClassifiedVideoSchema>;
type ClassifiedAudio = z.infer<typeof ClassifiedAudioSchema>;

const CLASSIFIER = "canonical_ingest_classification_v0";
/** The observation half of the renderer's evaluator is independent of its input, so a placeholder input reads it exactly. */
const PLACEHOLDER: ConformanceInput = { video: { frameCount: 0, tableId: "", width: 0, height: 0, grid: { numerator: 1, denominator: 1 } }, audio: { required: false } };
const refusal = (reasonCode: CanonicalRefusal, basis: (typeof REFUSAL_BASES)[number], inputDigest: string | null,
  rendererReason: ConformanceReason | null = null, squarePixelRendererReason: ConformanceReason | null = null): CanonicalClassification =>
  ({ outcome: "REFUSE", reasonCode, basis, inputDigest, rendererReason, squarePixelRendererReason });
const reasonOf = (result: ReturnType<typeof evaluateInputConformance>): ConformanceReason | null =>
  result.outcome.state === "conforms" ? null : result.outcome.reasonCode;

/**
 * DIRECT, NORMALIZE_N1 or REFUSE for one source, from its probe in the renderer's strict vocabulary and its ingest facts. The
 * function is total: malformed or unsupported evidence is a refusal, never an exception. Checks run in this fixed order: evidence,
 * stream layout, geometry, frame rate, frame count and duration, audio parameters, the unchanged renderer rule, the SAR, the
 * square-pixel counterfactual, and then the N1-only conditions.
 */
export function classifyCanonicalIngest(input: { probe: unknown; facts: unknown }): CanonicalClassification {
  let probe: ProbeReport;
  try { probe = parseProbeJson(canonicalSerialize(input.probe)); } catch { return refusal("probe_invalid", "invalid_input", null); }
  const facts = IngestVideoFactsSchema.safeParse(input.facts);
  if (!facts.success) return refusal("facts_invalid", "invalid_input", null);
  const inputDigest = sha256(canonicalSerialize({ classifier: CLASSIFIER, probe, facts: facts.data }));
  try {
    return classifyParsed(probe, facts.data, inputDigest);
  } catch {
    // The renderer's evaluator refuses a malformed ratio by throwing; ingest refuses it as invalid evidence.
    return refusal("probe_invalid", "invalid_input", inputDigest);
  }
}

function classifyParsed(probe: ProbeReport, facts: IngestVideoFacts, inputDigest: string): CanonicalClassification {
  const observation = evaluateInputConformance(PLACEHOLDER, probe).observation;
  const videos = probe.streams.filter(s => s.codec_type === "video"), audios = probe.streams.filter(s => s.codec_type === "audio");
  const v = videos[0];
  if (videos.length !== 1 || v === undefined) {
    const layout = reasonOf(evaluateInputConformance(PLACEHOLDER, probe));
    return refusal("renderer_nonconforming", "deferred_to_b2", inputDigest, layout, layout);
  }
  if (v.width === undefined || v.height === undefined || v.width === 0 || v.height === 0) return refusal("video_geometry_undeclared", "invalid_input", inputDigest);
  if (v.width > N1_BOUNDS.maxDimension || v.height > N1_BOUNDS.maxDimension) return refusal("geometry_out_of_bounds", "outside_b1_bounds", inputDigest);
  let rate: { numerator: number; denominator: number };
  try {
    const r = ratioOf(v.r_frame_rate ?? "");
    rate = { numerator: Number(r.numerator), denominator: Number(r.denominator) };
  } catch { return refusal("frame_rate_undeclared", "invalid_input", inputDigest); }
  const { numerator: n, denominator: d } = rate;
  if (n < d || n > N1_BOUNDS.maxFramesPerSecond * d || n > N1_BOUNDS.maxRateNumerator || d > N1_BOUNDS.maxRateDenominator) {
    return refusal("frame_rate_out_of_bounds", "outside_b1_bounds", inputDigest);
  }
  const frameCount = observation.videoFrames;
  if (frameCount === 0) return refusal("video_frames_absent", "invalid_input", inputDigest);
  if (frameCount > N1_BOUNDS.maxFrames) return refusal("frame_count_out_of_bounds", "outside_b1_bounds", inputDigest);
  if (frameCount * d > N1_BOUNDS.maxDurationSeconds * n) return refusal("duration_out_of_bounds", "outside_b1_bounds", inputDigest);
  const a = audios[0];
  let conformanceAudio: ConformanceInput["audio"] = { required: false }, audio: ClassifiedAudio = { state: "absent" };
  if (a !== undefined) {
    const sampleRateHz = a.sample_rate === undefined ? 0 : Number(a.sample_rate), samples = observation.audioSamples ?? 0, layout = a.channel_layout;
    if (sampleRateHz <= 0 || !Number.isSafeInteger(sampleRateHz) || (layout !== "mono" && layout !== "stereo") || samples <= 0) {
      return refusal("audio_parameters_unsupported", "deferred_to_b2", inputDigest);
    }
    conformanceAudio = { required: true, sampleRateHz, channelLayout: layout, requiredSamples: samples };
    audio = { state: "present", codec: a.codec_name === "aac" ? "aac" : "pcm_s16le", sampleRateHz, channelLayout: layout, samples };
  }
  const conformance: ConformanceInput = { video: { frameCount, tableId: observation.videoTableId ?? "", width: v.width, height: v.height, grid: rate },
    audio: conformanceAudio };
  const direct = reasonOf(evaluateInputConformance(conformance, probe));
  // Conformance pins the facts below: an admitted table id is non-null and admitted audio is AAC or PCM.
  const video: ClassifiedVideo = { width: v.width, height: v.height, frameCount, frameTableId: observation.videoTableId ?? "", frameRate: rate };
  if (direct === null) return { outcome: "DIRECT", reasonCode: DIRECT_REASON, inputDigest, video, audio, rendererReason: null, squarePixelRendererReason: null };

  const sar = v.sample_aspect_ratio;
  if (sar !== undefined) {
    if (sar === "1:1") return refusal("renderer_nonconforming", "deferred_to_b2", inputDigest, direct, direct);
    const [w, h] = sar.split(":");
    if (Number(w) === 0 || Number(h) === 0) return refusal("sample_aspect_ratio_malformed", "invalid_input", inputDigest, direct);
    return refusal("sample_aspect_ratio_explicit_non_square", "deferred_to_b2", inputDigest, direct);
  }
  const squared: ProbeReport = { ...probe, streams: probe.streams.map(s => (s.index === v.index ? { ...s, sample_aspect_ratio: "1:1" } : s)) };
  const counterfactual = reasonOf(evaluateInputConformance(conformance, squared));
  if (counterfactual !== null) return refusal("renderer_nonconforming", "deferred_to_b2", inputDigest, direct, counterfactual);
  // SAR is the only renderer blocker. N1 adds what the renderer does not read.
  if ((v.side_data_list ?? []).length > 0) return refusal("stream_side_data_present", "deferred_to_b2", inputDigest, direct);
  if ((probe.frames ?? []).some(f => f.stream_index === v.index && (f.side_data_list ?? []).length > 0)) {
    return refusal("frame_side_data_present", "deferred_to_b2", inputDigest, direct);
  }
  if (facts.fieldOrder !== "progressive") return refusal("field_order_not_progressive", "deferred_to_b2", inputDigest, direct);
  if (!SDR_TRANSFERS.includes(facts.colorTransfer) || !SDR_PRIMARIES.includes(facts.colorPrimaries)) return refusal("color_not_sdr", "deferred_to_b2", inputDigest, direct);
  return { outcome: "NORMALIZE_N1", reasonCode: N1_REASON, assumption: N1_ASSUMPTION, inputDigest, video, audio, rendererReason: "source_video_nonconforming",
    squarePixelRendererReason: null };
}

// ---------------------------------------------------------------- the bounded recipe list
/** What N1 does, as data: the identity of these semantics is the recipe's semanticsDigest. */
export const N1_SEMANTICS = {
  semanticsVersion: "canonical_n1_semantics_v0", applies: "NORMALIZE_N1",
  video: { stream: "h264_bitstream_copied_with_square_sample_aspect_declared_in_its_parameter_sets", sampleAspect: { numerator: 1, denominator: 1 }, reencode: false,
    pixels: "unchanged" },
  audio: { stream: "copied_unchanged_when_present", resample: false, remix: false, gain: false, ducking: false, synthesize: false, drop: false },
  container: { muxer: "mp4", metadata: "stripped_bitexact_v0", chapters: "stripped" },
  timing: { frames: "unchanged_exact_grid", startPts: "zero_unchanged" },
  verification: "output_classifies_direct_with_identical_frame_table_decoded_frames_and_audio_packets_v0",
} as const;
/**
 * The declared command template, in the renderer's fd-only conventions: one verified input descriptor and one output descriptor, no
 * shell, no location. B1A executes nothing; B1B runs exactly this under the pinned FFmpeg, and any change is a new recipe version.
 */
export const N1_ARGV_TEMPLATE = ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "info", "-protocol_whitelist", "fd", "-f", "mov", "-fd", "{input_fd}", "-i",
  "fd:", "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-bsf:v", "h264_metadata=sample_aspect_ratio=1/1", "-map_metadata", "-1", "-map_chapters", "-1",
  "-fflags", "+bitexact", "-fs", "{max_output_bytes}", "-protocol_whitelist", "fd", "-f", "mp4", "-fd", "{output_fd}", "fd:"] as const;
export const N1_RECIPE = {
  recipeId: "canonical_n1_square_sample_aspect", recipeVersion: "0.1.0",
  parameters: { sampleAspectRatio: "1:1", video: "h264_copy_declare_square_pixels", audio: "copy_when_present", container: "mp4_bitexact_metadata_stripped" },
  semanticsDigest: sha256(canonicalSerialize(N1_SEMANTICS)), argvTemplateDigest: sha256(JSON.stringify(N1_ARGV_TEMPLATE)),
} as const;
/** B1 accepts exactly these recipes. */
export const CANONICAL_RECIPES = [N1_RECIPE] as const;
const LabelSchema = z.string().regex(/^[a-z0-9_:.]{1,80}$/);
const CanonicalRecipeSchema = z.strictObject({ recipeId: IdSchema, recipeVersion: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/),
  parameters: z.strictObject({ sampleAspectRatio: LabelSchema, video: LabelSchema, audio: LabelSchema, container: LabelSchema }), semanticsDigest: HashSchema,
  argvTemplateDigest: HashSchema }).refine(recipe => CANONICAL_RECIPES.some(known => equal(known, recipe)), "Only a registered canonical recipe is accepted.");
export type CanonicalRecipe = z.infer<typeof CanonicalRecipeSchema>;

// ---------------------------------------------------------------- the pinned toolchain
/** The canonicalizer's own identity: a changed rule, recipe set or store discipline is a different canonicalizer. */
export const CANONICALIZER_DESCRIPTOR = {
  canonicalizer: "ci_canonical_media_ingest_v0", classification: "renderer_conformance_reused_with_square_pixel_counterfactual_v0",
  recipes: CANONICAL_RECIPES.map(recipe => [recipe.recipeId, recipe.recipeVersion]), verification: N1_SEMANTICS.verification,
  store: "content_addressed_local_canonical_store_v0", discovery: "none_no_directory_listing_no_globbing_no_network",
} as const;
export const CANONICALIZER = { canonicalizerId: "ci_canonical_media_ingest", version: MEDIA_INGEST_VERSION,
  implementationDigest: sha256(canonicalSerialize(CANONICALIZER_DESCRIPTOR)) } as const;
/** The canonicalizer plus the owner-pinned media runtime and environment, exactly as the renderer pins them. */
export const CANONICAL_TOOLCHAIN = {
  canonicalizer: CANONICALIZER,
  ffmpeg: { sha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffmpeg.sizeBytes, reportedVersion: PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion },
  ffprobe: { sha256: PINNED_MEDIA_RUNTIME.ffprobe.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffprobe.sizeBytes, reportedVersion: PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion },
  runtime: PINNED_MEDIA_RUNTIME.runtimeIdentity, environment: RENDER_ENVIRONMENT,
} as const;
const VersionSchema = z.string().min(1).max(80);
const PinnedToolSchema = z.strictObject({ sha256: HashSchema, sizeBytes: PositiveSafeInt, reportedVersion: VersionSchema });
const CanonicalToolchainSchema = z.strictObject({
  canonicalizer: z.strictObject({ canonicalizerId: IdSchema, version: VersionSchema, implementationDigest: HashSchema }),
  ffmpeg: PinnedToolSchema, ffprobe: PinnedToolSchema,
  runtime: z.strictObject({ runtimeId: IdSchema, version: VersionSchema, implementationDigest: HashSchema }),
  environment: z.strictObject({ environmentId: IdSchema, platform: LabelSchema, arch: LabelSchema }),
}).refine(toolchain => equal(toolchain, CANONICAL_TOOLCHAIN), "Only the pinned canonical toolchain is accepted.");
export type CanonicalToolchain = z.infer<typeof CanonicalToolchainSchema>;

// ---------------------------------------------------------------- CanonicalMediaDerivation
export const CANONICAL_COMPUTATION_IDENTITY = "canonical_media_computation_v0" as const;
export const CANONICAL_DERIVATION_IDENTITY = "canonical_media_derivation_v0" as const;
/**
 * The computation identity, known before execution: exactly the source bytes, the recipe and the pinned toolchain. No time, path,
 * temporary name, attempt, user, scope or random value can enter it.
 */
export function canonicalComputationIdOf(input: { source: { assetId: string; contentHash: string; sizeBytes: number }; recipe: CanonicalRecipe;
  toolchain: CanonicalToolchain }): string {
  return contentId(CANONICAL_COMPUTATION_IDENTITY, { source: { assetId: input.source.assetId, contentHash: input.source.contentHash, sizeBytes: input.source.sizeBytes },
    recipe: input.recipe, toolchain: input.toolchain });
}
const DigestPairSchema = z.strictObject({ sourceDigest: HashSchema, outputDigest: HashSchema });
/** The verification facts B1 requires of an N1 output: it is DIRECT with a 1:1 SAR, with the source's frames, decoded content and audio. */
const VerificationSchema = z.strictObject({
  outputClassification: z.literal("DIRECT"), outputSampleAspectRatio: z.literal("1:1"), frameCount: PositiveSafeInt, frameTableId: IdSchema,
  decodedVideo: DigestPairSchema.extend({ method: z.literal("pinned_runtime_decoded_frame_md5_v0") }),
  audio: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("absent") }),
    DigestPairSchema.extend({ state: z.literal("stream_copied"), method: z.literal("pinned_runtime_audio_packet_md5_v0"), samples: PositiveSafeInt })]),
});
const DerivationBodySchema = z.strictObject({
  artifactType: z.literal("CanonicalMediaDerivation"), artifactVersion: z.literal(MEDIA_INGEST_VERSION), stability: z.literal("internal_pre_stable"),
  computationId: IdSchema,
  source: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, rootAuthorization: FootageAuthorizationRootSchema }),
  classification: N1ClassificationSchema, recipe: CanonicalRecipeSchema, toolchain: CanonicalToolchainSchema,
  output: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, probeDigest: HashSchema, verification: VerificationSchema }),
  scope: z.strictObject({ creatorId: IdSchema, projectId: IdSchema }),
});
export const CanonicalMediaDerivationSchema = DerivationBodySchema.extend({ derivationId: IdSchema }).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const { source, output, classification, scope } = value, root = source.rootAuthorization, verified = output.verification;
  if (source.assetId !== `asset_${source.contentHash}` || output.assetId !== `asset_${output.contentHash}`) issue("Asset identities are the content hashes they name.");
  if (output.contentHash === source.contentHash) issue("A canonical derivative has bytes distinct from its source.");
  if (root.contentHash !== source.contentHash || root.sizeBytes !== source.sizeBytes) issue("The source is exactly the root authorization's bytes.");
  if (scope.creatorId !== root.creatorId || scope.projectId !== root.projectId) issue("A derivation keeps exactly its root's creator and project.");
  if (output.probeDigest === classification.inputDigest) issue("The output is verified from its own probe.");
  if (verified.frameCount !== classification.video.frameCount || verified.frameTableId !== classification.video.frameTableId) {
    issue("The verified output has exactly the source's frames.");
  }
  if (verified.decodedVideo.sourceDigest !== verified.decodedVideo.outputDigest) issue("The verified output decodes to exactly the source's frames.");
  const audio = classification.audio, copied = verified.audio;
  if (audio.state === "absent" ? copied.state !== "absent"
    : copied.state !== "stream_copied" || copied.samples !== audio.samples || copied.sourceDigest !== copied.outputDigest) {
    issue("The verified output carries exactly the source's audio, copied, or none.");
  }
  if (value.computationId !== canonicalComputationIdOf(value)) issue("The computation identity is derived from exactly the source bytes, the recipe and the toolchain.");
  if (!checkIdentity(value, "derivationId", CANONICAL_DERIVATION_IDENTITY)) issue("The derivation identity binds every recorded field.");
});
export type CanonicalMediaDerivation = z.infer<typeof CanonicalMediaDerivationSchema>;

/**
 * One verified N1 canonicalization as a record. The source must classify NORMALIZE_N1. The output must classify DIRECT with exactly the
 * source's video and audio facts, and it must decode to exactly the source's frames and carry exactly its audio packets. B1B measures
 * the digests under the pinned runtime; this builder only records them and checks they agree.
 */
export function buildCanonicalMediaDerivation(input: {
  rootAuthorization: unknown; source: unknown;
  output: { contentHash: string; sizeBytes: number; classification: unknown; decodedVideo: { sourceDigest: string; outputDigest: string };
    audioPackets: { sourceDigest: string; outputDigest: string } | null };
}): CanonicalMediaDerivation {
  const root = parseOr(FootageAuthorizationRootSchema, input.rootAuthorization, "derivation_invalid", "A canonical derivation starts from an AuthorizedFootage 1.1.0 root.");
  const source = parseOr(CanonicalClassificationSchema, input.source, "classification_invalid", "The source classification is not a classifier result.");
  const output = parseOr(CanonicalClassificationSchema, input.output.classification, "classification_invalid", "The output classification is not a classifier result.");
  if (source.outcome !== "NORMALIZE_N1") fail("classification_invalid", "Only an N1 source is canonicalized: DIRECT needs no derivative and a refusal is never repaired.");
  if (output.outcome !== "DIRECT") fail("classification_invalid", "The canonical output classifies DIRECT under the same rule.");
  if (!equal(output.video, source.video) || !equal(output.audio, source.audio)) fail("classification_invalid", "The output keeps exactly the source's video and audio facts.");
  const packets = input.output.audioPackets;
  if ((source.audio.state === "present") !== (packets !== null)) fail("derivation_invalid", "Audio is copied exactly when the source has audio.");
  const verification = { outputClassification: "DIRECT", outputSampleAspectRatio: "1:1", frameCount: source.video.frameCount, frameTableId: source.video.frameTableId,
    decodedVideo: { method: "pinned_runtime_decoded_frame_md5_v0", sourceDigest: input.output.decodedVideo.sourceDigest, outputDigest: input.output.decodedVideo.outputDigest },
    audio: source.audio.state === "present" && packets !== null ? { state: "stream_copied", method: "pinned_runtime_audio_packet_md5_v0", samples: source.audio.samples,
      sourceDigest: packets.sourceDigest, outputDigest: packets.outputDigest } : { state: "absent" } };
  const sourceRecord = { assetId: `asset_${root.contentHash}`, contentHash: root.contentHash, sizeBytes: root.sizeBytes, rootAuthorization: root };
  const body = { artifactType: "CanonicalMediaDerivation", artifactVersion: MEDIA_INGEST_VERSION, stability: "internal_pre_stable",
    computationId: canonicalComputationIdOf({ source: sourceRecord, recipe: N1_RECIPE, toolchain: CANONICAL_TOOLCHAIN }), source: sourceRecord, classification: source,
    recipe: N1_RECIPE, toolchain: CANONICAL_TOOLCHAIN,
    output: { assetId: `asset_${input.output.contentHash}`, contentHash: input.output.contentHash, sizeBytes: input.output.sizeBytes, probeDigest: output.inputDigest,
      verification },
    scope: { creatorId: root.creatorId, projectId: root.projectId } };
  return parseOr(CanonicalMediaDerivationSchema, identify(CANONICAL_DERIVATION_IDENTITY, "derivationId", body), "derivation_invalid",
    "The canonical derivation does not validate.");
}

/**
 * The AuthorizedFootage 1.1.0 derived record for a derivation's output. It names the canonical bytes, says `system_canonicalized`,
 * inherits the root's rights basis and scope, keeps the root's purposes or a stated subset of them, and carries no consent of its own.
 */
export function buildCanonicalDerivedAuthorization(input: { derivation: unknown; dateAdded: string;
  allowedPurposes?: readonly ("local_footage_analysis" | "local_evaluation")[] }): FootageAuthorizationDerived {
  const derivation = parseOr(CanonicalMediaDerivationSchema, input.derivation, "derivation_invalid", "A derived authorization is built only from a valid derivation.");
  const root = derivation.source.rootAuthorization;
  return parseOr(FootageAuthorizationDerivedSchema, { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", contentHash: derivation.output.contentHash,
    sizeBytes: derivation.output.sizeBytes, sourceType: "system_canonicalized", authorizationBasis: root.authorizationBasis,
    allowedPurposes: [...(input.allowedPurposes ?? root.allowedPurposes)], dateAdded: input.dateAdded, creatorId: root.creatorId,
    projectId: root.projectId, derivedFrom: { rootAuthorization: root, derivationId: derivation.derivationId, recipeId: derivation.recipe.recipeId } },
  "authorization_invalid", "The derived authorization does not validate.");
}
