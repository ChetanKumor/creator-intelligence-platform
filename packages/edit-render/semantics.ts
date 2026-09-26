/**
 * RenderExecutorSemanticsV0: the one explicit, versioned mapping from the owned V0 vocabulary (EditGraph operations, the accepted
 * ExecutionDag node kinds and the h264/yuv420p/deterministic_constant_quality_v0 and aac encoding vocabulary) to fixed FFmpeg settings.
 * The executor identity is the digest of this descriptor, so any change of settings is a new executor build with new computation
 * identities. The settings are deterministic V0 execution semantics, not professionally calibrated grades or encodes.
 *
 * The pinned media runtime is the verified local archive build: the SHA-256 digests below were established from the extracted
 * binaries and match the members of the hash-verified distribution archive. Nothing here names a location.
 */
import { z } from "zod";
import { canonicalSerialize } from "../domain/serialization.js";
import { LookSchema } from "../edit-graph/resolution.js";
import { check, refuse, sha256 } from "./common.js";

export const RENDER_SEMANTICS = {
  semanticsVersion: "render_executor_semantics_v0",
  container: { muxer: "mp4", metadata: "stripped_bitexact_v0", outputProtocol: "fd_only" },
  input: { demuxer: "mov", protocol: "fd_only", handoff: "verified_open_handle_inherited_v0", decoderThreads: 1, maxInputs: 16 },
  video: { encoder: "libx264", preset: "medium", crf: 18, pixelFormat: "yuv420p", encoderThreads: 1, scalerFlags: "bicubic+accurate_rnd+full_chroma_int+bitexact",
    sampleAspect: { numerator: 1, denominator: 1 }, frameMode: "passthrough_exact_input_grid_v0", sourceCodec: "h264", sourcePixelFormat: "yuv420p" },
  audio: { encoder: "aac", bitrateKbps: 128, sampleFormat: "fltp", sourceCodecs: ["aac", "pcm_s16le"] },
  looks: { version: "color_look_executor_v0", channelGainPerMilleAtFullIntensity: 100, contrastGainPerMilleAtFullIntensity: 300, identityAtZeroIntensity: true,
    neutral: "identity" },
  trims: { frameExact: "authoritative_frame_interval_v0", sourceSeconds: "pts_membership_half_open_v0", linkedAudio: "samples_follow_selected_video_frames_v0" },
  sourceTiming: "constant_frame_rate_exactly_on_output_grid_from_zero_v0",
  framing: "scale_only_source_pixel_geometry_must_have_output_display_aspect_v0",
  audioCoverage: "all_or_none_linked_audio_v0",
  filterThreads: 1,
  hardware: "none_software_codecs_and_filters_only",
  bounds: { maxWidth: 3840, maxHeight: 3840, maxDurationSeconds: 600, maxClips: 16 },
} as const;
export const RENDER_SEMANTICS_DIGEST = sha256(canonicalSerialize(RENDER_SEMANTICS));
/** The one real V0 render executor. Its implementation digest is the digest of the semantics above. */
export const RENDER_EXECUTOR = { executorId: "ci_ffmpeg_render_executor", version: "0.1.0", implementationDigest: RENDER_SEMANTICS_DIGEST } as const;
/** The only execution environment V0 recognizes: this machine class, as observed by the trusted probe. */
export const RENDER_ENVIRONMENT = { environmentId: "local_win32_x64", platform: "win32", arch: "x64" } as const;

const PINNED_VERSION = "9.0.1-essentials_build-www.gyan.dev";
const FFMPEG_SHA256 = "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3";
/** The owner-pinned media runtime: exact binary digests, sizes and reported versions. A different build is a different runtime. */
export const PINNED_MEDIA_RUNTIME = {
  distribution: "ffmpeg-9.0.1-essentials_build",
  archiveSha256: "fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9",
  ffmpeg: { sha256: FFMPEG_SHA256, sizeBytes: 102_856_192, reportedVersion: PINNED_VERSION },
  ffprobe: { sha256: "19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f", sizeBytes: 102_652_416, reportedVersion: PINNED_VERSION },
  requiredBuildFlags: ["--enable-gpl", "--enable-libx264"],
  runtimeIdentity: { runtimeId: "ffmpeg_gyan_essentials_win64", version: PINNED_VERSION, implementationDigest: FFMPEG_SHA256 },
} as const;

/** The trusted probes: fixed queries and parsers, identified so that a changed probe is a different prober. */
export const PROBE_IMPLEMENTATION = {
  runtime: { checkerId: "gate7_batch2b_pinned_runtime_probe", version: "0.1.0", queries: ["version", "buildconf", "encoders", "decoders", "filters", "muxers", "demuxers", "protocols"],
    basis: "pinned_local_runtime_encoding_probe_v0" },
  capability: { checkerId: "gate7_batch2b_pinned_capability_probe", version: "0.1.0", map: "gate6_capability_to_ffmpeg_components_v0",
    basis: "pinned_local_executor_capability_probe_v0" },
  conformance: { checkerId: "gate7_batch2b_staged_input_conformance_probe", version: "0.1.0", query: "streams_and_every_decoded_frame_pts_over_verified_handle",
    basis: "pinned_local_staged_input_conformance_probe_v0" },
} as const;
export const PROBE_IMPLEMENTATION_DIGEST = sha256(canonicalSerialize(PROBE_IMPLEMENTATION));

// ---------------------------------------------------------------- color_look_executor_v0
export type Look = z.infer<typeof LookSchema>;
/** An exact decimal with four places from an integer count of ten-thousandths: no floating point enters a filter argument. */
const decimal = (tenThousandths: number) => `${Math.floor(tenThousandths / 10_000)}.${String(tenThousandths % 10_000).padStart(4, "0")}`;
/**
 * The fixed, bounded filter steps of one look at one intensity. Intensity is per mille of the look's full strength, 0 to 1000.
 * Neutral, and every look at intensity 0, is the explicit identity (`null`). Warm and cool are opposite red/blue channel gains of
 * up to ±10 % applied in planar RGB through explicit conversions; contrast is an `eq` contrast gain of up to +30 % on the YUV frame.
 */
export function colorLookStep(look: Look, intensityPerMille: number): { effect: "identity" | "channel_gain" | "contrast_gain"; filters: string[] } {
  check(LookSchema.safeParse(look).success, "render_program_unsupported", "Only the four V0 looks are executable.");
  check(Number.isSafeInteger(intensityPerMille) && intensityPerMille >= 0 && intensityPerMille <= 1000, "render_program_unsupported", "Look intensity is an integer 0-1000.");
  if (look === "neutral" || intensityPerMille === 0) return { effect: "identity", filters: ["null"] };
  const flags = RENDER_SEMANTICS.video.scalerFlags;
  if (look === "contrast") return { effect: "contrast_gain", filters: [`eq=contrast=${decimal(10_000 + 3 * intensityPerMille)}`] };
  const gain = intensityPerMille, [red, blue] = look === "warm" ? [10_000 + gain, 10_000 - gain] : [10_000 - gain, 10_000 + gain];
  return { effect: "channel_gain", filters: [`scale=flags=${flags}`, "format=pix_fmts=gbrp", `colorchannelmixer=rr=${decimal(red)}:gg=1.0000:bb=${decimal(blue)}`,
    `scale=flags=${flags}`, "format=pix_fmts=yuv420p"] };
}
/** The FFmpeg filters a look needs, by filter name. */
function lookFilters(look: string): string[] | undefined {
  if (look === "neutral") return ["null"];
  if (look === "warm" || look === "cool") return ["colorchannelmixer", "format", "null", "scale"];
  if (look === "contrast") return ["eq", "null"];
  return undefined;
}

// ---------------------------------------------------------------- the finite Gate-6 capability map
export interface ComponentInventory { encoders: readonly string[]; decoders: readonly string[]; filters: readonly string[]; muxers: readonly string[];
  demuxers: readonly string[]; inputProtocols: readonly string[]; outputProtocols: readonly string[] }
type ComponentKind = "encoder" | "decoder" | "filter" | "muxer" | "demuxer" | "input_protocol" | "output_protocol";
const KIND_FIELD: Record<ComponentKind, keyof ComponentInventory> = { encoder: "encoders", decoder: "decoders", filter: "filters", muxer: "muxers", demuxer: "demuxers",
  input_protocol: "inputProtocols", output_protocol: "outputProtocols" };
const REASON: Record<ComponentKind, string> = { encoder: "encoder_unavailable", decoder: "decoder_unavailable", filter: "filter_unavailable", muxer: "muxer_unavailable",
  demuxer: "demuxer_unavailable", input_protocol: "protocol_unavailable", output_protocol: "protocol_unavailable" };
const need = (kind: ComponentKind, ...names: string[]) => names.map(name => ({ kind, name }));
/** What each frozen Gate-6 capability needs from the pinned build under the V0 semantics. Unknown capabilities need nothing: they are refused. */
const CAPABILITY_COMPONENTS: Record<string, { kind: ComponentKind; name: string }[]> = {
  timeline_video_clip: [...need("demuxer", "mov"), ...need("decoder", "h264"), ...need("filter", "trim", "setpts", "scale", "setsar", "format", "split", "concat", "settb"),
    ...need("encoder", "libx264"), ...need("muxer", "mp4"), ...need("input_protocol", "fd"), ...need("output_protocol", "fd")],
  timeline_source_audio: [...need("decoder", "aac", "pcm_s16le"), ...need("filter", "atrim", "asetpts", "asplit", "aformat", "asettb", "concat"), ...need("encoder", "aac")],
  transition_cut: need("filter", "concat"),
  color_look: [],
};
const fps = /^fps_([1-9][0-9]{0,5})_([1-9][0-9]{0,5})$/;
/** The predicate values V0 executes; everything else is unsupported, never approximated. */
const MEMBER: Record<string, (value: string) => boolean> = {
  time_mapping: v => v === "constant_speed_identity",
  framing: v => v === "source_aspect_matches_output",
  source_endpoint_precision: v => v === "frame_pts_exact" || v === "source_seconds",
  source_rotation: v => v === "rotation_0",
  source_frame_timing: v => v === "constant_frame_rate",
  source_codec: v => v === "codec_h264",
  output_aspect: v => /^aspect_[1-9][0-9]{0,4}_[1-9][0-9]{0,4}$/.test(v),
  output_frame_rate: v => { const m = fps.exec(v); return m !== null && Number(m[1]) >= Number(m[2]) && Number(m[1]) <= 240 * Number(m[2]); },
  audio_linkage: v => v === "linked_identity",
  transition_kind: v => v === "cut",
  look: v => lookFilters(v) !== undefined,
  target_kind: v => v === "whole_output" || v === "clip_uses",
};
const AT_MOST: Record<string, number> = { output_width: RENDER_SEMANTICS.bounds.maxWidth, output_height: RENDER_SEMANTICS.bounds.maxHeight,
  output_duration_seconds_ceiling: RENDER_SEMANTICS.bounds.maxDurationSeconds, clip_count: RENDER_SEMANTICS.bounds.maxClips, join_count: RENDER_SEMANTICS.bounds.maxClips - 1 };
export type CapabilityPredicate = { name: string; kind: "member"; value: string } | { name: string; kind: "at_most"; value: number };
export interface CapabilityFinding { requirementId: string; capabilityId: string; state: "AVAILABLE" | "UNAVAILABLE"; reasonCode: string; components: string[];
  unmetPredicates: CapabilityPredicate[] }
const supported = (p: CapabilityPredicate) => p.kind === "member" ? MEMBER[p.name]?.(p.value) === true : AT_MOST[p.name] !== undefined && p.value <= AT_MOST[p.name]!;
/**
 * One requirement against the probed build: AVAILABLE only when the capability is one of the four frozen Gate-6 capabilities, every
 * predicate lies inside the V0 semantics and every FFmpeg component it needs is present in the pinned build's own listings.
 */
export function assessCapabilityRequirement(requirement: { requirementId: string; capabilityId: string; predicates: readonly CapabilityPredicate[] },
  inventory: ComponentInventory): CapabilityFinding {
  const base = { requirementId: requirement.requirementId, capabilityId: requirement.capabilityId };
  const components = CAPABILITY_COMPONENTS[requirement.capabilityId];
  if (components === undefined || !Object.hasOwn(CAPABILITY_COMPONENTS, requirement.capabilityId)) {
    return { ...base, state: "UNAVAILABLE", reasonCode: "capability_unknown", components: [], unmetPredicates: [] };
  }
  const unmetPredicates = requirement.predicates.filter(p => !supported(p)).map(p => ({ ...p }));
  const needed = [...components];
  if (requirement.capabilityId === "color_look") for (const p of requirement.predicates) if (p.name === "look" && p.kind === "member") need("filter", ...(lookFilters(p.value) ?? [])).forEach(c => needed.push(c));
  const unique = [...new Map(needed.map(c => [`${c.kind}:${c.name}`, c])).values()].sort((a, b) => `${a.kind}:${a.name}` < `${b.kind}:${b.name}` ? -1 : 1);
  const listed = unique.map(c => `${c.kind}:${c.name}`);
  if (unmetPredicates.length > 0) return { ...base, state: "UNAVAILABLE", reasonCode: "predicate_unsupported", components: listed, unmetPredicates };
  const missing = unique.find(c => !inventory[KIND_FIELD[c.kind]].includes(c.name));
  if (missing !== undefined) return { ...base, state: "UNAVAILABLE", reasonCode: REASON[missing.kind], components: listed, unmetPredicates: [] };
  return { ...base, state: "AVAILABLE", reasonCode: "components_present_predicates_supported", components: listed, unmetPredicates: [] };
}
export const CAPABILITY_REASON_CODES = ["components_present_predicates_supported", "capability_unknown", "predicate_unsupported", "encoder_unavailable", "decoder_unavailable",
  "filter_unavailable", "muxer_unavailable", "demuxer_unavailable", "protocol_unavailable"] as const;
/** Refuses a look/intensity pair the compiler could otherwise be handed. */
export function requireLook(look: string, intensityPerMille: number): void {
  if (lookFilters(look) === undefined) refuse("render_program_unsupported", "Only the four V0 looks are executable.");
  colorLookStep(look as Look, intensityPerMille);
}
