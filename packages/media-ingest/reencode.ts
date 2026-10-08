/** B2-B1: PURE additive planning/verification contract. No production execution or publication is wired.
 * The original Profile/Facts, remux plan and 0.1/0.2 derivations are imported unchanged. Source evaluation is always v1 over the
 * original facts. A private hypothetical projection delegates ONLY the accepted repair parameter calculation to the v1 planner;
 * it is never measured evidence, never published, and never substitutes for the original source evaluation/facts.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { sha256 } from "../edit-render/common.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { contentId } from "../reference-analyzer/features.js";
import { FootageAuthorizationRootSchema } from "../footage-analyzer/protocol.js";
import { CANONICAL_TOOLCHAIN } from "./canonical.js";
import { CanonicalMediaFactsSchema, CanonicalProfileEvaluationSchema, CANONICAL_MEDIA_PROFILE_V1, analyzeCanonicalMediaFactsV1, classifyDisplayMatrix, videoTimelineDigestOf,
  audioTimelineDigestOf, type CanonicalProfileEvaluation, type VideoStreamFacts } from "./profile.js";
import { CANONICALIZATION_PLAN_SEMANTICS, CANONICALIZATION_PLAN_IDENTITY, CanonicalizationPlanSchema, PLAN_VERIFICATION_METHODS,
  planCanonicalizationV1 } from "./plan.js";

const hash = (v: unknown) => sha256(canonicalSerialize(v));
const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const Positive = z.number().int().positive().safe();
const Geometry = z.strictObject({ width: Positive.max(16384).multipleOf(2), height: Positive.max(16384).multipleOf(2) });
const Rate = z.strictObject({ numerator: Positive, denominator: Positive });
const TimeBase = z.strictObject({ numerator: z.literal(1), denominator: Positive.max(2147483647) });
const Color = z.strictObject({ range: z.literal("tv"), primaries: z.enum(["bt709"]).nullable(), transfer: z.enum(["bt709"]).nullable(), matrix: z.enum(["bt709"]).nullable() });
export const EXACT_PIXEL_METHOD = "exact_yuv420p_planes_sha256_by_index_v1" as const;
export const PIXEL_TRANSFORMS = ["identity", "rotate_90_ccw", "rotate_180", "rotate_90_cw", "mirror_horizontal", "mirror_vertical", "transpose", "transverse"] as const;
/** Top-left origin; (x,y) is a SOURCE sample coordinate, w/h are that plane's dimensions. All three planes are permuted independently. */
export const D4_COORDINATE_MAPPINGS = { identity: ["x","y"], rotate_90_ccw: ["y","w-1-x"], rotate_180: ["w-1-x","h-1-y"],
  rotate_90_cw: ["h-1-y","x"], mirror_horizontal: ["w-1-x","y"], mirror_vertical: ["x","h-1-y"], transpose: ["y","x"], transverse: ["h-1-y","w-1-x"] } as const;
const swaps = (t: string) => ["rotate_90_ccw","rotate_90_cw","transpose","transverse"].includes(t);
const OUTPUT_COLOR = { range: "tv", primaries: "bt709", transfer: "bt709", matrix: "bt709" } as const;
const ENCODE_BODY = {
  profileType: "CanonicalLosslessEncodeProfile", profileVersion: "1.0.0", encoder: "libx264", rateControl: "constant_qp_zero_lossless", qp: 0,
  preset: "medium", h264Profile: "high444", pixelFormat: "yuv420p", bitDepth: 8,
  threads: { decode: 1, encode: 2, lookahead: 1, sliced: false, filter: 1 }, gop: { maximumFrames: 30, bFrames: 0, sceneCutThreshold: 0 },
  metadata: { automaticRotation: false, inputDisplayRotationOverride: 0, outputDisplayTransform: "identity_or_absent", copyMetadata: false,
    copyChapters: false, copyUnregisteredSei: false, a53ClosedCaptions: false },
  pixelPolicy: { automaticConversion: false, automaticScaling: false, sampleAspectRatio: "1:1", colorSignaling: OUTPUT_COLOR,
    signalingFilter: "setparams_metadata_only", conversion: "none", scaling: "none" },
  timing: { framePolicy: "passthrough", copyInputTimestamps: true, encoderTimeBase: "exact_plan_output_time_base", trackTimescale: "exact_plan_output_time_base",
    avoidNegativeTimestamps: "disabled" },
  audio: "copy_with_only_accepted_exact_timing_repairs", mux: { videoOrAac: "mp4", pcm: "mov", flags: "bitexact", metadataTimestamps: "none" },
  reproducibility: "same_machine_same_pinned_build_same_profile_and_source_bytes_only",
} as const;
export const CANONICAL_LOSSLESS_ENCODE_PROFILE = freeze({ ...ENCODE_BODY, encodeProfileId: contentId("canonical_lossless_encode_profile_v1", ENCODE_BODY) } as const);
const EncodeProfileSchema = z.custom<typeof CANONICAL_LOSSLESS_ENCODE_PROFILE>(v => equal(v, CANONICAL_LOSSLESS_ENCODE_PROFILE), "Only the fixed lossless profile is accepted");
export const CANONICAL_REENCODE_SEMANTICS = {
  version: "canonical_reencode_semantics_v1", targetProfile: CANONICAL_MEDIA_PROFILE_V1, repairRules: CANONICALIZATION_PLAN_SEMANTICS,
  d4: D4_COORDINATE_MAPPINGS, pixelVerification: EXACT_PIXEL_METHOD, encodeProfile: CANONICAL_LOSSLESS_ENCODE_PROFILE.encodeProfileId,
  authority: "original_v1_evaluation_before_any_projection_all_findings_retained",
  supportedDeferredFindings: ["display_d4_non_identity", "codec_hevc_8bit_sdr_candidate"],
  frameMapping: "source_presentation_index_i_to_output_presentation_index_i", videoPayloadClaim: "reencoded_no_packet_equality_claim",
  color: "preserve_source_declarations_in_provenance_write_explicit_profile_interpretation_without_changing_samples",
  pixelDigest: "u32be_utf8_header_length_then_canonical_json_method_index_format_geometry_YUV_lengths_then_exact_Y_U_V_bytes_sha256",
  sequenceDigest: "canonical_json_method_frameCount_frames_of_index_and_frame_digest_sha256",
  verification: "fresh_source_and_output_facts_and_decodes_full_zero_error_and_digest_equality_never_cached_authority",
} as const;
const SEMANTICS = { version: CANONICAL_REENCODE_SEMANTICS.version, digest: hash(CANONICAL_REENCODE_SEMANTICS) };
export const CANONICAL_REENCODE_TOOLCHAIN = { ...CANONICAL_TOOLCHAIN, canonicalizer: { canonicalizerId: "ci_canonical_lossless_reencode",
  version: "0.3.0", implementationDigest: hash(CANONICAL_REENCODE_SEMANTICS) } } as const;
const ToolchainSchema = z.custom<typeof CANONICAL_REENCODE_TOOLCHAIN>(v => equal(v, CANONICAL_REENCODE_TOOLCHAIN), "Pinned re-encode toolchain required");
type Operation = z.infer<typeof CanonicalizationPlanSchema>["operations"][number];
const PlanBody = z.strictObject({ planType: z.literal("CanonicalReencodePlan"), planVersion: z.literal("1.0.0"), executionClass: z.literal("lossless_video_reencode_audio_copy"),
  targetProfile: CanonicalizationPlanSchema.shape.targetProfile, semantics: z.strictObject({ version: z.literal(SEMANTICS.version), digest: HashSchema }),
  encodeProfile: EncodeProfileSchema, sourceCodec: z.enum(["h264","hevc"]), inputGeometry: Geometry, outputGeometry: Geometry,
  pixelFormat: z.literal("yuv420p"), bitDepth: z.literal(8), transform: z.enum(PIXEL_TRANSFORMS), streams: CanonicalizationPlanSchema.shape.streams,
  operations: z.array(CanonicalizationPlanSchema.shape.operations.element).max(5),
  color: z.strictObject({ source: Color, output: Color, interpretation: z.enum(["explicit_source_bt709", "interpreted_as_bt709_v1"]) }),
  videoTiming: z.strictObject({ frameCount: Positive.max(72000), sourceTimeBase: TimeBase, outputTimeBase: TimeBase, frameRate: Rate,
    sourceDigest: HashSchema, outputDigest: HashSchema }),
});
export const CANONICAL_REENCODE_PLAN_IDENTITY = "canonical_reencode_plan_v1" as const;
export const CanonicalReencodePlanSchema = PlanBody.extend({ planId: IdSchema }).superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (p.streams.videoIndex === p.streams.audioIndex) issue("Distinct retained streams required");
  if (!equal(p.targetProfile,CANONICAL_MEDIA_PROFILE_V1) || !equal(p.semantics,SEMANTICS)) issue("Frozen profile and new re-encode semantics required");
  if (p.sourceCodec === "h264" && p.transform === "identity") issue("Identity H.264 belongs to the existing path");
  const expected = swaps(p.transform) ? { width: p.inputGeometry.height, height: p.inputGeometry.width } : p.inputGeometry;
  if (!equal(p.outputGeometry,expected)) issue("D4 determines exact geometry");
  if (!equal(p.color.output,OUTPUT_COLOR)) issue("Output signaling is explicit limited BT.709");
  const assumed = [p.color.source.primaries,p.color.source.transfer,p.color.source.matrix].some(v => v === null);
  if (p.color.interpretation !== (assumed ? "interpreted_as_bt709_v1" : "explicit_source_bt709")) issue("Source color truth retained");
  // Validate the reused operation vocabulary/order/bounds using v1's own validator. This is not a claimed remux execution.
  if (p.operations.length && !CanonicalizationPlanSchema.safeParse(identify(CANONICALIZATION_PLAN_IDENTITY,"planId", {
    planType: "CanonicalizationPlan", planVersion: "1.0.0", targetProfile: p.targetProfile, semantics: CANONICALIZATION_PLAN_SEMANTICS,
    executionClass: "remux", encodeProfile: null, streams: p.streams, operations: p.operations })).success) issue("Exact repair parameters must validate under v1");
  if (!checkIdentity(p,"planId",CANONICAL_REENCODE_PLAN_IDENTITY)) issue("Every output-affecting field is identity-bound");
});
export type CanonicalReencodePlan = z.infer<typeof CanonicalReencodePlanSchema>;
export interface ReencodePlanningResult { outcome: "PLAN" | "EXISTING_PATH" | "DEFER" | "REFUSE"; plan: CanonicalReencodePlan | null;
  evaluation: CanonicalProfileEvaluation; reason: string }
const operation = <T extends Operation["op"]>(ops: Operation[], name: T): Extract<Operation,{op:T}> | undefined =>
  ops.find((v): v is Extract<Operation,{op:T}> => v.op === name);
export function planCanonicalReencode(input: unknown): ReencodePlanningResult {
  const a = analyzeCanonicalMediaFactsV1(input), evaluation = a.evaluation;
  const result = (outcome: ReencodePlanningResult["outcome"], reason: string): ReencodePlanningResult => ({ outcome, plan: null, evaluation, reason });
  if (evaluation.outcome === "REFUSE" || a.video === null || a.facts === null) return result("REFUSE","source_v1_refusal");
  const v = a.video, d4 = classifyDisplayMatrix(v.displayMatrix), geometry = v.geometry.declared;
  if (!Geometry.safeParse(geometry).success) return result("REFUSE","exact_yuv420p_requires_even_geometry");
  if (evaluation.findings.some(f => f.disposition.startsWith("deferred") && !["display_d4_non_identity","codec_hevc_8bit_sdr_candidate"].includes(f.code))) {
    return result("DEFER","unsupported_finding_preserved");
  }
  if (d4.kind !== "d4" && v.codec !== "hevc") return result("EXISTING_PATH","existing_exact_remux_or_direct_authority");
  const transform = d4.kind === "d4" ? d4.element : "identity";
  // A hypothetical H.264/identity description is ONLY an input to the unchanged repair-parameter calculator. Never measured or exported.
  const projection = CanonicalMediaFactsSchema.parse(a.facts);
  const pv = projection.streams.find((s): s is VideoStreamFacts => s.kind === "video")!;
  pv.codec = "h264"; pv.displayMatrix = { state: "absent" }; delete pv.displayMatrixCarriers; pv.sideData = [];
  const repair = planCanonicalizationV1(projection);
  if (repair.outcome !== "PLAN" && repair.outcome !== "DIRECT") return result("REFUSE","repair_projection_conflict");
  const ops = repair.plan?.operations ?? [];
  const snap = operation(ops,"SNAP_VIDEO_TIMESTAMPS"), rebase = operation(ops,"REBASE_TIMELINE_ZERO");
  const offset = rebase?.offsets.find(o => o.streamIndex === v.index)?.offsetTicks ?? 0;
  const timeBase = snap?.outputTimeBase ?? v.timeBase, rate = snap?.targetFrameRate ?? v.declaredFrameRate;
  const pts = v.presentationTimestamps.map((t,i) => snap ? i*snap.gridPeriodTicks : t-offset);
  const body = { planType: "CanonicalReencodePlan", planVersion: "1.0.0", executionClass: "lossless_video_reencode_audio_copy", targetProfile: CANONICAL_MEDIA_PROFILE_V1,
    semantics: SEMANTICS, encodeProfile: CANONICAL_LOSSLESS_ENCODE_PROFILE, sourceCodec: v.codec, inputGeometry: geometry,
    outputGeometry: swaps(transform) ? { width: geometry.height, height: geometry.width } : geometry, pixelFormat: "yuv420p", bitDepth: 8, transform,
    streams: { videoIndex: v.index, audioIndex: a.audio?.index ?? null }, operations: ops,
    color: { source: v.color, output: OUTPUT_COLOR, interpretation: [v.color.primaries,v.color.transfer,v.color.matrix].some(x => x === null)
      ? "interpreted_as_bt709_v1" : "explicit_source_bt709" },
    videoTiming: { frameCount: pts.length, sourceTimeBase: v.timeBase, outputTimeBase: timeBase, frameRate: rate,
      sourceDigest: videoTimelineDigestOf(v), outputDigest: videoTimelineDigestOf({ timeBase, presentationTimestamps: pts }) } };
  return { outcome: "PLAN", evaluation, reason: "bounded_lossless_candidate", plan: CanonicalReencodePlanSchema.parse(identify(CANONICAL_REENCODE_PLAN_IDENTITY,"planId",body)) };
}
export function canonicalReencodeComputationIdOf(input: { source: { assetId: string; contentHash: string; sizeBytes: number }; plan: CanonicalReencodePlan;
  toolchain: typeof CANONICAL_REENCODE_TOOLCHAIN }): string {
  return contentId("canonical_media_computation_v2", { source: { assetId: input.source.assetId, contentHash: input.source.contentHash, sizeBytes: input.source.sizeBytes },
    plan: input.plan, toolchain: input.toolchain });
}
const Digests = z.array(HashSchema).min(1).max(72000);
export const ExactPixelVerificationSchema = z.strictObject({ method: z.literal(EXACT_PIXEL_METHOD), transform: z.enum(PIXEL_TRANSFORMS),
  pixelFormat: z.literal("yuv420p"), sourceGeometry: Geometry, outputGeometry: Geometry, frameCount: Positive.max(72000),
  frameMapping: z.literal("presentation_index_identity"), sourceDigest: HashSchema, expectedDigest: HashSchema, outputDigest: HashSchema,
  sampleMismatchCount: z.literal(0), maximumAbsoluteSampleError: z.literal(0), perPlaneMismatch: z.strictObject({ Y: z.literal(0), U: z.literal(0), V: z.literal(0) }),
  frameDigests: z.strictObject({ source: Digests, expected: Digests, output: Digests }),
}).superRefine((p,ctx) => {
  const issue = (message: string) => ctx.addIssue({ code:"custom", message });
  for (const role of ["source","expected","output"] as const) {
    const rows = p.frameDigests[role];
    if (rows.length !== p.frameCount || p[`${role}Digest`] !== hash({ method: EXACT_PIXEL_METHOD, frameCount: rows.length,
      frames: rows.map((digest,index) => ({ index,digest })) })) issue("Exact ordered digest sequence required");
  }
  if (!equal(p.frameDigests.expected,p.frameDigests.output) || p.expectedDigest !== p.outputDigest) issue("Expected and output samples must be exact");
  if (p.transform === "identity" && (p.sourceDigest !== p.expectedDigest || !equal(p.sourceGeometry,p.outputGeometry))) issue("Identity preserves decoded source samples");
  const expected = swaps(p.transform) ? { width: p.sourceGeometry.height, height: p.sourceGeometry.width } : p.sourceGeometry;
  if (!equal(expected,p.outputGeometry)) issue("The transform binds geometry independently of pixels");
});
export type ExactPixelVerification = z.infer<typeof ExactPixelVerificationSchema>;
const Identity = z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: Positive });
const AudioPayload = z.strictObject({ method: z.literal(PLAN_VERIFICATION_METHODS.audioPackets), sourceDigest: HashSchema, outputDigest: HashSchema }).nullable();
const DerivationBody = z.strictObject({ artifactType: z.literal("CanonicalMediaDerivation"), artifactVersion: z.literal("0.3.0"), stability: z.literal("internal_pre_stable"),
  computationId: IdSchema, source: Identity.extend({ rootAuthorization: FootageAuthorizationRootSchema, facts: CanonicalMediaFactsSchema, factsDigest: HashSchema, evaluation: CanonicalProfileEvaluationSchema }),
  plan: CanonicalReencodePlanSchema, toolchain: ToolchainSchema,
  output: Identity.extend({ facts: CanonicalMediaFactsSchema, factsDigest: HashSchema, evaluation: CanonicalProfileEvaluationSchema }),
  verification: z.strictObject({ method: z.literal("fresh_exact_lossless_reencode_v1"), pixels: ExactPixelVerificationSchema, audioPackets: AudioPayload,
    videoTiming: z.strictObject({ sourceDigest: HashSchema, outputDigest: HashSchema }),
    audioTiming: z.strictObject({ sourceDigest: HashSchema, outputDigest: HashSchema }).nullable() }),
  scope: z.strictObject({ creatorId: IdSchema, projectId: IdSchema }),
});
/** Full fresh facts are retained in 0.3, so record validation replays the ONE accepted evaluator and exact mapping. Records are not attestations. */
export const CanonicalReencodeDerivationSchema = DerivationBody.extend({ derivationId: IdSchema }).superRefine((d,ctx) => {
  const issue = (message: string) => ctx.addIssue({ code:"custom",message });
  const s = analyzeCanonicalMediaFactsV1(d.source.facts), o = analyzeCanonicalMediaFactsV1(d.output.facts), p = planCanonicalReencode(d.source.facts);
  if (p.outcome !== "PLAN" || !equal(p.plan,d.plan)) issue("Plan must replay from original source facts");
  if (o.evaluation.outcome !== "CONFORMS") issue("Fresh output must conform");
  if (s.evaluation.factsDigest !== d.source.factsDigest || o.evaluation.factsDigest !== d.output.factsDigest) issue("Facts bind exact evidence");
  if (!equal(s.evaluation,d.source.evaluation) || !equal(o.evaluation,d.output.evaluation)) issue("Evaluations replay from complete original facts");
  const root = d.source.rootAuthorization;
  if (root.contentHash !== d.source.contentHash || root.sizeBytes !== d.source.sizeBytes || !equal(d.scope,{ creatorId:root.creatorId,projectId:root.projectId })) issue("Root lineage and scope required");
  for (const x of [d.source,d.output]) if (x.assetId !== `asset_${x.contentHash}`) issue("Content-addressed identity required");
  if (d.source.contentHash === d.output.contentHash) issue("Derivative is new bytes");
  if (d.computationId !== canonicalReencodeComputationIdOf(d) || !checkIdentity(d,"derivationId","canonical_media_derivation_v2")) issue("Complete identities required");
  const sv = s.video, ov = o.video, pixels = d.verification.pixels;
  if (sv === null || ov === null) { issue("Both video streams required"); return; }
  if (pixels.transform !== d.plan.transform || !equal(pixels.sourceGeometry,d.plan.inputGeometry) || !equal(pixels.outputGeometry,d.plan.outputGeometry)
    || pixels.frameCount !== sv.presentationTimestamps.length || pixels.frameCount !== ov.presentationTimestamps.length) issue("One-to-one pixel mapping required");
  if (!equal(ov.geometry.declared,d.plan.outputGeometry) || !equal(ov.color,OUTPUT_COLOR) || ov.decodeReordering) issue("Exact output video contract required");
  if (!equal(ov.sampleAspectRatio,{ container:{state:"declared",numerator:1,denominator:1},bitstream:{state:"declared",numerator:1,denominator:1} })) issue("Explicit square SAR in both carriers required");
  if (!equal(ov.timeBase,d.plan.videoTiming.outputTimeBase) || !equal(ov.declaredFrameRate,d.plan.videoTiming.frameRate)
    || videoTimelineDigestOf(ov) !== d.plan.videoTiming.outputDigest || videoTimelineDigestOf(sv) !== d.plan.videoTiming.sourceDigest
    || !equal(d.verification.videoTiming,{ sourceDigest:videoTimelineDigestOf(sv),outputDigest:videoTimelineDigestOf(ov) })) issue("Accepted exact video timing mapping required");
  const sa = s.audio, oa = o.audio, payload = d.verification.audioPackets;
  if (sa === null) { if (oa !== null || payload !== null || d.verification.audioTiming !== null) issue("Audio absence retained"); return; }
  if (oa === null || payload === null || payload.sourceDigest !== payload.outputDigest) { issue("Every retained audio packet must be identical"); return; }
  const format = (a: typeof sa) => ({ codec:a.codec,sampleRateHz:a.sampleRateHz,channels:a.channels,channelLayout:a.channelLayout,timeBase:a.timeBase });
  if (!equal(format(sa),format(oa)) || sa.frames.length !== oa.frames.length) issue("Audio format and frame count preserved");
  const rebase = operation(d.plan.operations,"REBASE_TIMELINE_ZERO"), retime = operation(d.plan.operations,"RETIME_AUDIO_CONTIGUOUS");
  const offset = rebase?.offsets.find(x => x.streamIndex === sa.index)?.offsetTicks ?? 0; let at = 0;
  const expected = sa.frames.map(f => { const pts = retime ? at : f.pts-offset; at += f.samples; return { pts,samples:f.samples }; });
  if (!equal(expected,oa.frames) || !equal(d.verification.audioTiming,{sourceDigest:audioTimelineDigestOf(sa),outputDigest:audioTimelineDigestOf(oa)})) issue("Accepted exact audio mapping required");
});
export type CanonicalReencodeDerivation = z.infer<typeof CanonicalReencodeDerivationSchema>;
export function buildCanonicalReencodeDerivation(input: { rootAuthorization: unknown; sourceFacts: unknown; plan: unknown;
  output: { contentHash: string; sizeBytes: number; facts: unknown }; pixels: unknown; audioPackets: unknown }): CanonicalReencodeDerivation {
  const root = FootageAuthorizationRootSchema.parse(input.rootAuthorization), sourceFacts = CanonicalMediaFactsSchema.parse(input.sourceFacts);
  const outputFacts = CanonicalMediaFactsSchema.parse(input.output.facts), plan = CanonicalReencodePlanSchema.parse(input.plan);
  const s = analyzeCanonicalMediaFactsV1(sourceFacts), o = analyzeCanonicalMediaFactsV1(outputFacts);
  if (s.video === null || o.video === null) throw new Error("Re-encode derivation requires video");
  const source = { assetId:`asset_${root.contentHash}`,contentHash:root.contentHash,sizeBytes:root.sizeBytes,rootAuthorization:root,facts:sourceFacts,factsDigest:hash(sourceFacts),evaluation:s.evaluation };
  const body = { artifactType:"CanonicalMediaDerivation",artifactVersion:"0.3.0",stability:"internal_pre_stable", source,plan,toolchain:CANONICAL_REENCODE_TOOLCHAIN,
    computationId:canonicalReencodeComputationIdOf({source,plan,toolchain:CANONICAL_REENCODE_TOOLCHAIN}),
    output:{assetId:`asset_${input.output.contentHash}`,contentHash:input.output.contentHash,sizeBytes:input.output.sizeBytes,facts:outputFacts,factsDigest:hash(outputFacts),evaluation:o.evaluation},
    verification:{method:"fresh_exact_lossless_reencode_v1",pixels:input.pixels,audioPackets:input.audioPackets,
      videoTiming:{sourceDigest:videoTimelineDigestOf(s.video),outputDigest:videoTimelineDigestOf(o.video)},
      audioTiming:s.audio === null || o.audio === null ? null : {sourceDigest:audioTimelineDigestOf(s.audio),outputDigest:audioTimelineDigestOf(o.audio)}},
    scope:{creatorId:root.creatorId,projectId:root.projectId} };
  return CanonicalReencodeDerivationSchema.parse(identify("canonical_media_derivation_v2","derivationId",body));
}
