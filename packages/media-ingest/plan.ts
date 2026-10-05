/**
 * Gate 7 Batch 3E-B2-A1: the typed CanonicalizationPlan v1, the pure planner that derives it from CanonicalMediaFacts, and
 * CanonicalMediaDerivation 0.2.0 (the plan-based derivation) with its computation and derivation identities.
 *
 * - A plan is an immutable, versioned, identity-bearing value: a bounded subset, in one fixed order, of a closed vocabulary of five
 *   exact-remux operations, SELECT_AV_STREAMS, REBASE_TIMELINE_ZERO, DECLARE_SQUARE_SAMPLE_ASPECT, SNAP_VIDEO_TIMESTAMPS and
 *   RETIME_AUDIO_CONTIGUOUS, each with typed exact parameters. It changes no pixel and no payload. It names no location, time, user, scope
 *   or command string: a trusted adapter (B2-A2) compiles it. No caller chooses an operation. The planner derives every plan from the
 *   facts, and a plan is never reordered.
 * - The plan identity binds the plan version, the target profile, the execution class, the ordered operations with every parameter and
 *   the plan semantics, and never the source bytes, so one semantic plan applied to different bytes keeps one planId. The computation
 *   identity (canonical_media_computation_v1) binds the source bytes, the plan and the pinned toolchain. The derivation identity
 *   (canonical_media_derivation_v1) binds the completed, verified record.
 * - N1 is untouched. CanonicalMediaDerivation 0.1.0, N1_SEMANTICS, N1_ARGV_TEMPLATE, N1_RECIPE, the N1 toolchain and the v0 identity
 *   domains are exactly the accepted ones. DECLARE_SQUARE_SAMPLE_ASPECT names the same square-pixel assumption beside N1, never as N1.
 *
 * Nothing here reads a file, clock, environment, process or network, or runs FFmpeg or ffprobe. Nothing here is wired: the accepted B1
 * classifier, the owner-media registry and every runtime adapter are unchanged. B2-A2 decides when production routes through the planner.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { sha256 } from "../edit-render/common.js";
import { FootageAuthorizationDerivedSchema, FootageAuthorizationRootSchema, type FootageAuthorizationDerived } from "../footage-analyzer/protocol.js";
import { contentId } from "../reference-analyzer/features.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { CANONICAL_TOOLCHAIN, CanonicalMediaDerivationSchema, MediaIngestError, N1_ASSUMPTION, type MediaIngestErrorCode } from "./canonical.js";
import { AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES, CANONICAL_MEDIA_PROFILE_V1, CANONICAL_PROFILE_EVALUATION_V1, CANONICAL_SNAP_RATES, CanonicalProfileEvaluationSchema,
  FactsTimeBaseSchema, analyzeCanonicalMediaFactsV1, audioTimelineDigestOf, reducedRatio, snapTimescaleOf, videoTimelineDigestOf, type AudioStreamFacts,
  type CanonicalMediaAnalysis, type CanonicalProfileEvaluation, type VideoStreamFacts } from "./profile.js";

function fail(code: MediaIngestErrorCode, message: string): never { throw new MediaIngestError(code, message); }
function parseOr<S extends z.ZodType>(schema: S, value: unknown, code: MediaIngestErrorCode, message: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) fail(code, message);
  return result.data;
}
const PositiveSafeInt = z.number().int().positive().safe();
const StreamIndex = z.number().int().min(0).max(15);
const RatioSchema = z.strictObject({ numerator: PositiveSafeInt, denominator: PositiveSafeInt });
const B = BigInt;

// ---------------------------------------------------------------- the closed vocabulary and its meaning
export const CANONICALIZATION_PLAN_VERSION = "1.0.0" as const;
export const CANONICALIZATION_PLAN_IDENTITY = "canonicalization_plan_v1" as const;
/** The closed v1 vocabulary, in its one canonical relative order. A plan holds a subset, in this order, each at most once. */
export const CANONICALIZATION_OPERATIONS = ["SELECT_AV_STREAMS", "REBASE_TIMELINE_ZERO", "DECLARE_SQUARE_SAMPLE_ASPECT", "SNAP_VIDEO_TIMESTAMPS",
  "RETIME_AUDIO_CONTIGUOUS"] as const;
export type CanonicalizationOperationName = (typeof CANONICALIZATION_OPERATIONS)[number];
/** The exact-remux finding each operation repairs: a plan holds exactly the operations its source's findings require. */
export const OPERATION_FOR_FINDING = { extra_non_av_stream: "SELECT_AV_STREAMS", timeline_nonzero: "REBASE_TIMELINE_ZERO",
  sar_unspecified: "DECLARE_SQUARE_SAMPLE_ASPECT", near_cfr_snap_candidate: "SNAP_VIDEO_TIMESTAMPS",
  audio_small_timestamp_discontinuity: "RETIME_AUDIO_CONTIGUOUS" } as const satisfies Record<string, CanonicalizationOperationName>;
/** The operations a list of findings requires (own keys only), in finding order. */
const repairsOf = (findings: readonly { code: string }[]): CanonicalizationOperationName[] =>
  findings.flatMap(f => (Object.hasOwn(OPERATION_FOR_FINDING, f.code) ? [OPERATION_FOR_FINDING[f.code as keyof typeof OPERATION_FOR_FINDING]] : []));
/** What each operation means, as data; the plan semantics digest binds it, so a changed meaning is a different planId. */
export const CANONICALIZATION_PLAN_V1_SEMANTICS = {
  semanticsVersion: "canonicalization_plan_semantics_v1", planVersion: CANONICALIZATION_PLAN_VERSION,
  executionClasses: ["remux"], encodeProfile: "none_for_an_exact_remux", order: CANONICALIZATION_OPERATIONS,
  derivation: "the_planner_derives_every_operation_from_the_facts_never_from_a_caller",
  operations: {
    SELECT_AV_STREAMS: { keeps: "the_one_video_and_at_most_one_audio_stream", drops: "only_the_listed_timecode_tmcd_and_mov_text_subtitle_streams",
      payload: "every_kept_packet_unchanged" },
    REBASE_TIMELINE_ZERO: { mapping: "t_out_is_t_minus_the_one_exact_common_positive_start", payload: "unchanged", discards: "nothing" },
    DECLARE_SQUARE_SAMPLE_ASPECT: { declares: "an_explicit_1_1_sample_aspect_in_the_parameter_sets_and_the_container", pixels: "unchanged", assumption: N1_ASSUMPTION },
    SNAP_VIDEO_TIMESTAMPS: { mapping: "presented_frame_i_to_i_grid_periods_after_zero_in_the_output_time_base", frames: "one_to_one_none_added_dropped_or_reordered",
      payload: "unchanged", bound: "one_quarter_of_the_target_period_inclusive" },
    RETIME_AUDIO_CONTIGUOUS: { mapping: "frame_k_to_the_exact_cumulative_sample_count_before_it_after_zero", payload: "unchanged", packetOrder: "unchanged",
      samples: "unchanged", boundSamples: AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES, never: ["resample", "pad", "trim", "synthesize", "remix", "change_channels"] },
  },
  repairs: OPERATION_FOR_FINDING, evaluation: CANONICAL_PROFILE_EVALUATION_V1,
} as const;
export const CANONICALIZATION_PLAN_SEMANTICS = { semanticsVersion: CANONICALIZATION_PLAN_V1_SEMANTICS.semanticsVersion,
  semanticsDigest: sha256(canonicalSerialize(CANONICALIZATION_PLAN_V1_SEMANTICS)) } as const;

// ---------------------------------------------------------------- CanonicalizationPlan v1
const DroppedStreamSchema = z.discriminatedUnion("kind", [z.strictObject({ index: StreamIndex, kind: z.literal("timecode"), codec: z.literal("tmcd") }),
  z.strictObject({ index: StreamIndex, kind: z.literal("subtitle"), codec: z.literal("mov_text") })]);
const OperationSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("SELECT_AV_STREAMS"), dropped: z.array(DroppedStreamSchema).min(1).max(14) }),
  z.strictObject({ op: z.literal("REBASE_TIMELINE_ZERO"), start: RatioSchema,
    offsets: z.array(z.strictObject({ streamIndex: StreamIndex, timeBase: FactsTimeBaseSchema, offsetTicks: PositiveSafeInt })).min(1).max(2) }),
  z.strictObject({ op: z.literal("DECLARE_SQUARE_SAMPLE_ASPECT"), sampleAspectRatio: z.strictObject({ numerator: z.literal(1), denominator: z.literal(1) }),
    assumption: z.literal(N1_ASSUMPTION) }),
  z.strictObject({ op: z.literal("SNAP_VIDEO_TIMESTAMPS"), streamIndex: StreamIndex, frameCount: z.number().int().min(2).max(72_000), sourceTimeBase: FactsTimeBaseSchema,
    sourcePresentationDigest: HashSchema, targetFrameRate: RatioSchema, outputTimeBase: FactsTimeBaseSchema, gridPeriodTicks: PositiveSafeInt,
    maxDisplacementSeconds: RatioSchema, approvedMaxDisplacementSeconds: RatioSchema }),
  z.strictObject({ op: z.literal("RETIME_AUDIO_CONTIGUOUS"), streamIndex: StreamIndex, sampleRateHz: PositiveSafeInt, frameCount: PositiveSafeInt,
    sampleCount: PositiveSafeInt, sourceStartTicks: z.number().int().nonnegative().safe(), sourceTimingDigest: HashSchema,
    maxObservedDisplacementSamples: z.number().int().min(1).max(AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES),
    approvedMaxDisplacementSamples: z.literal(AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES) }),
]);
type Operation = z.infer<typeof OperationSchema>;
type OperationOf<K extends CanonicalizationOperationName> = Extract<Operation, { op: K }>;
const PlanBodySchema = z.strictObject({
  planType: z.literal("CanonicalizationPlan"), planVersion: z.literal(CANONICALIZATION_PLAN_VERSION),
  targetProfile: z.strictObject({ profileId: IdSchema, profileVersion: z.literal(CANONICAL_MEDIA_PROFILE_V1.profileVersion) }),
  semantics: z.strictObject({ semanticsVersion: z.literal(CANONICALIZATION_PLAN_SEMANTICS.semanticsVersion), semanticsDigest: HashSchema }),
  executionClass: z.literal("remux"), encodeProfile: z.null(),
  streams: z.strictObject({ videoIndex: StreamIndex, audioIndex: StreamIndex.nullable() }),
  operations: z.array(OperationSchema).min(1).max(CANONICALIZATION_OPERATIONS.length),
});
/** The plan identity of a plan body (every field but planId). */
export const canonicalizationPlanIdOf = (body: unknown): string => contentId(CANONICALIZATION_PLAN_IDENTITY, body);
const operationOf = <K extends CanonicalizationOperationName>(operations: readonly Operation[], name: K): OperationOf<K> | undefined =>
  operations.find((o): o is OperationOf<K> => o.op === name);
const lowestTerms = (r: { numerator: number; denominator: number }): boolean => equal(reducedRatio(B(r.numerator), B(r.denominator)), r);
export const CanonicalizationPlanSchema = PlanBodySchema.extend({ planId: IdSchema }).superRefine((plan, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const order = plan.operations.map(o => CANONICALIZATION_OPERATIONS.indexOf(o.op));
  if (!order.every((at, i) => i === 0 || order[i - 1]! < at)) issue("Operations appear at most once each, in the one canonical order.");
  if (!equal(plan.targetProfile, CANONICAL_MEDIA_PROFILE_V1)) issue("The target is CanonicalMediaProfile v1.");
  if (!equal(plan.semantics, CANONICALIZATION_PLAN_SEMANTICS)) issue("The plan carries the v1 plan semantics.");
  const { videoIndex, audioIndex } = plan.streams;
  if (videoIndex === audioIndex) issue("The kept video and audio are different streams.");
  for (const op of plan.operations) {
    if (op.op === "SELECT_AV_STREAMS") {
      const dropped = op.dropped.map(d => d.index);
      if (!dropped.every((at, i) => i === 0 || dropped[i - 1]! < at)) issue("Dropped streams are distinct, in stream order.");
      if (dropped.includes(videoIndex) || (audioIndex !== null && dropped.includes(audioIndex))) issue("A kept A/V stream is never dropped.");
    } else if (op.op === "REBASE_TIMELINE_ZERO") {
      if (!equal(op.offsets.map(o => o.streamIndex), audioIndex === null ? [videoIndex] : [videoIndex, audioIndex])) issue("One offset per kept stream, video first.");
      if (!lowestTerms(op.start)) issue("The start is in lowest terms.");
      if (!op.offsets.every(o => B(o.offsetTicks) * B(op.start.denominator) === B(op.start.numerator) * B(o.timeBase.denominator))) {
        issue("Every offset is exactly the one common start in its stream's time base.");
      }
    } else if (op.op === "SNAP_VIDEO_TIMESTAMPS") {
      if (op.streamIndex !== videoIndex) issue("Only the kept video stream is snapped.");
      const rate = CANONICAL_SNAP_RATES.find(([a, b]) => a === op.targetFrameRate.numerator && b === op.targetFrameRate.denominator);
      if (rate === undefined) { issue("A snap targets exactly one rate of the B2R canonical set."); continue; }
      const timescale = snapTimescaleOf(op.sourceTimeBase.denominator, rate);
      if (timescale === null || op.outputTimeBase.denominator !== timescale) issue("The output time base is the one the snap rule fixes.");
      else if (B(op.gridPeriodTicks) * B(rate[0]) !== B(timescale) * B(rate[1])) issue("The grid period is exactly one target period in the output time base.");
      const approved = reducedRatio(B(rate[1]), 4n * B(rate[0])), max = op.maxDisplacementSeconds;
      if (!equal(op.approvedMaxDisplacementSeconds, approved)) issue("The approved bound is exactly a quarter of the target period.");
      if (!lowestTerms(max) || B(max.numerator) * B(approved.denominator) > B(approved.numerator) * B(max.denominator)) {
        issue("The recorded displacement is in lowest terms and within the approved bound.");
      }
    } else if (op.op === "RETIME_AUDIO_CONTIGUOUS") {
      if (audioIndex === null || op.streamIndex !== audioIndex) issue("Only the kept audio stream is retimed.");
      if (op.sampleCount < op.frameCount) issue("Every audio frame has at least one sample.");
      const rebased = operationOf(plan.operations, "REBASE_TIMELINE_ZERO")?.offsets.find(o => o.streamIndex === op.streamIndex)?.offsetTicks ?? 0;
      if (op.sourceStartTicks !== rebased) issue("A retime starts exactly where its rebased audio starts: zero.");
    }
  }
  if (!checkIdentity(plan, "planId", CANONICALIZATION_PLAN_IDENTITY)) issue("The plan identity binds every field.");
});
export type CanonicalizationPlan = z.infer<typeof CanonicalizationPlanSchema>;

// ---------------------------------------------------------------- the planner
export const PLANNING_OUTCOMES = ["DIRECT", "PLAN", "DEFER", "REFUSE"] as const;
export interface CanonicalPlanningResult { outcome: (typeof PLANNING_OUTCOMES)[number]; factsDigest: string | null; evaluation: CanonicalProfileEvaluation;
  plan: CanonicalizationPlan | null }
const PLANNING_OUTCOME = { CONFORMS: "DIRECT", CANONICALIZABLE_EXACT_REMUX: "PLAN", CANONICALIZABLE_REENCODE_DEFERRED: "DEFER", REFUSE: "REFUSE" } as const;
/**
 * DIRECT (the facts already satisfy CanonicalMediaProfile v1; no plan), PLAN (exactly the v1 exact-remux operations reach it), DEFER (a
 * known future re-encode or temporal candidate) or REFUSE. The only input is the facts: the planner derives each operation and every
 * parameter from them, so no caller can add, omit or reorder one.
 */
export function planCanonicalizationV1(facts: unknown): CanonicalPlanningResult {
  const analysis = analyzeCanonicalMediaFactsV1(facts), { evaluation } = analysis, outcome = PLANNING_OUTCOME[evaluation.outcome];
  return { outcome, factsDigest: evaluation.factsDigest, evaluation, plan: outcome === "PLAN" ? planOf(analysis) : null };
}
function planOf(analysis: CanonicalMediaAnalysis): CanonicalizationPlan {
  // An exact-remux evaluation has exactly one video, at most one audio, only droppable other streams and the evidence of each repair.
  const v = analysis.video!, audio = analysis.audio, timeline = analysis.videoTimeline;
  const needed = new Set<string>(repairsOf(analysis.evaluation.findings));
  const operations: Operation[] = [];
  if (needed.has("SELECT_AV_STREAMS")) {
    operations.push({ op: "SELECT_AV_STREAMS", dropped: analysis.others.map(s => (s.kind === "timecode" ? { index: s.index, kind: "timecode", codec: "tmcd" }
      : { index: s.index, kind: "subtitle", codec: "mov_text" })) });
  }
  if (needed.has("REBASE_TIMELINE_ZERO")) {
    const p0 = v.presentationTimestamps[0]!;
    operations.push({ op: "REBASE_TIMELINE_ZERO", start: reducedRatio(B(p0), B(v.timeBase.denominator)), offsets: [{ streamIndex: v.index, timeBase: v.timeBase, offsetTicks: p0 },
      ...(audio === null ? [] : [{ streamIndex: audio.index, timeBase: audio.timeBase, offsetTicks: audio.frames[0]!.pts }])] });
  }
  if (needed.has("DECLARE_SQUARE_SAMPLE_ASPECT")) operations.push({ op: "DECLARE_SQUARE_SAMPLE_ASPECT", sampleAspectRatio: { numerator: 1, denominator: 1 }, assumption: N1_ASSUMPTION });
  if (needed.has("SNAP_VIDEO_TIMESTAMPS") && timeline?.kind === "near") {
    const [a, b] = timeline.rate, timescale = snapTimescaleOf(v.timeBase.denominator, timeline.rate)!;
    operations.push({ op: "SNAP_VIDEO_TIMESTAMPS", streamIndex: v.index, frameCount: v.presentationTimestamps.length, sourceTimeBase: v.timeBase,
      sourcePresentationDigest: videoTimelineDigestOf(v), targetFrameRate: { numerator: a, denominator: b }, outputTimeBase: { numerator: 1, denominator: timescale },
      gridPeriodTicks: Number((B(timescale) * B(b)) / B(a)), maxDisplacementSeconds: reducedRatio(timeline.maxErrorScaled, B(a) * B(v.timeBase.denominator)),
      approvedMaxDisplacementSeconds: reducedRatio(B(b), 4n * B(a)) });
  }
  if (needed.has("RETIME_AUDIO_CONTIGUOUS") && audio !== null) {
    operations.push({ op: "RETIME_AUDIO_CONTIGUOUS", streamIndex: audio.index, sampleRateHz: audio.sampleRateHz, frameCount: audio.frames.length,
      sampleCount: audio.frames.reduce((n, f) => n + f.samples, 0), sourceStartTicks: audio.frames[0]!.pts, sourceTimingDigest: audioTimelineDigestOf(audio),
      maxObservedDisplacementSamples: analysis.audioMaxDisplacementSamples!, approvedMaxDisplacementSamples: AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES });
  }
  const body = { planType: "CanonicalizationPlan", planVersion: CANONICALIZATION_PLAN_VERSION, targetProfile: { ...CANONICAL_MEDIA_PROFILE_V1 },
    semantics: { ...CANONICALIZATION_PLAN_SEMANTICS }, executionClass: "remux", encodeProfile: null,
    streams: { videoIndex: v.index, audioIndex: audio === null ? null : audio.index }, operations };
  return CanonicalizationPlanSchema.parse(identify(CANONICALIZATION_PLAN_IDENTITY, "planId", body));
}
/** True exactly when `plan` is a valid v1 plan and is the planner's own plan for `facts`. */
export function revalidateCanonicalizationPlan(plan: unknown, facts: unknown): boolean {
  const parsed = CanonicalizationPlanSchema.safeParse(plan);
  if (!parsed.success) return false;
  const planned = planCanonicalizationV1(facts).plan;
  return planned !== null && equal(planned, parsed.data);
}

// ---------------------------------------------------------------- the pinned plan toolchain
export const CANONICAL_PLAN_DERIVATION_VERSION = "0.2.0" as const;
export const CANONICAL_PLAN_COMPUTATION_IDENTITY = "canonical_media_computation_v1" as const;
export const CANONICAL_PLAN_DERIVATION_IDENTITY = "canonical_media_derivation_v1" as const;
/** The exact-remux verification and the three by-index digest methods B2-A2 must execute. Declared here, unexecuted. */
export const PLAN_VERIFICATION_METHOD = "exact_remux_verified_v1" as const;
export const PLAN_VERIFICATION_METHODS = { decodedFrames: "pinned_runtime_decoded_frame_content_md5_by_index_v1",
  videoPackets: "pinned_runtime_video_packet_payload_md5_by_index_v1", audioPackets: "pinned_runtime_audio_packet_payload_md5_by_index_v1" } as const;
/** The plan canonicalizer's own identity: a changed profile, plan semantics, compilation rule or verification is a different canonicalizer. */
export const PLAN_CANONICALIZER_DESCRIPTOR = {
  canonicalizer: "ci_canonical_media_plan_canonicalizer_v1", profile: CANONICAL_MEDIA_PROFILE_V1.profileId,
  planSemantics: CANONICALIZATION_PLAN_SEMANTICS.semanticsDigest, executionClasses: ["remux"],
  compilation: "a_trusted_adapter_compiles_the_closed_vocabulary_no_caller_argv_v1", verification: PLAN_VERIFICATION_METHOD, verificationMethods: PLAN_VERIFICATION_METHODS,
  discovery: "none_no_directory_listing_no_globbing_no_network",
} as const;
export const PLAN_CANONICALIZER = { canonicalizerId: "ci_canonical_media_plan_canonicalizer", version: CANONICAL_PLAN_DERIVATION_VERSION,
  implementationDigest: sha256(canonicalSerialize(PLAN_CANONICALIZER_DESCRIPTOR)) } as const;
/** The plan canonicalizer on exactly the owner-pinned media runtime and environment of the N1 toolchain. */
export const CANONICAL_PLAN_TOOLCHAIN = { canonicalizer: PLAN_CANONICALIZER, ffmpeg: CANONICAL_TOOLCHAIN.ffmpeg, ffprobe: CANONICAL_TOOLCHAIN.ffprobe,
  runtime: CANONICAL_TOOLCHAIN.runtime, environment: CANONICAL_TOOLCHAIN.environment } as const;
const VersionSchema = z.string().min(1).max(80), LabelSchema = z.string().regex(/^[a-z0-9_:.]{1,80}$/);
const PinnedToolSchema = z.strictObject({ sha256: HashSchema, sizeBytes: PositiveSafeInt, reportedVersion: VersionSchema });
const CanonicalPlanToolchainSchema = z.strictObject({
  canonicalizer: z.strictObject({ canonicalizerId: IdSchema, version: VersionSchema, implementationDigest: HashSchema }), ffmpeg: PinnedToolSchema, ffprobe: PinnedToolSchema,
  runtime: z.strictObject({ runtimeId: IdSchema, version: VersionSchema, implementationDigest: HashSchema }),
  environment: z.strictObject({ environmentId: IdSchema, platform: LabelSchema, arch: LabelSchema }),
}).refine(toolchain => equal(toolchain, CANONICAL_PLAN_TOOLCHAIN), "Only the pinned plan toolchain is accepted.");
export type CanonicalPlanToolchain = z.infer<typeof CanonicalPlanToolchainSchema>;

// ---------------------------------------------------------------- CanonicalMediaDerivation 0.2.0
/**
 * The computation identity, known before execution: exactly the source bytes, the plan and the pinned toolchain. No time, path, temporary
 * name, attempt, user, scope or random value can enter it, and the plan never carries the source bytes, so this is where they are bound.
 */
export function canonicalPlanComputationIdOf(input: { source: { assetId: string; contentHash: string; sizeBytes: number }; plan: CanonicalizationPlan;
  toolchain: CanonicalPlanToolchain }): string {
  return contentId(CANONICAL_PLAN_COMPUTATION_IDENTITY, { source: { assetId: input.source.assetId, contentHash: input.source.contentHash, sizeBytes: input.source.sizeBytes },
    plan: input.plan, toolchain: input.toolchain });
}
const DigestPairSchema = z.strictObject({ sourceDigest: HashSchema, outputDigest: HashSchema });
const PlanVerificationSchema = z.strictObject({
  method: z.literal(PLAN_VERIFICATION_METHOD),
  /** The output's own evaluation: it conforms to the target profile. */
  output: CanonicalProfileEvaluationSchema,
  droppedStreams: z.array(DroppedStreamSchema).max(14),
  video: z.strictObject({
    frameCount: PositiveSafeInt,
    decodedFrames: DigestPairSchema.extend({ method: z.literal(PLAN_VERIFICATION_METHODS.decodedFrames) }),
    bitstream: z.discriminatedUnion("state", [DigestPairSchema.extend({ state: z.literal("packet_payloads_identical"), method: z.literal(PLAN_VERIFICATION_METHODS.videoPackets) }),
      z.strictObject({ state: z.literal("parameter_sets_rewritten_for_declared_square_sample_aspect") })]),
    timing: z.strictObject({ mapping: z.enum(["identity", "rebase", "snap", "rebase_then_snap"]), sourceDigest: HashSchema, outputDigest: HashSchema }),
  }),
  audio: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("absent") }), z.strictObject({ state: z.literal("retained"), frameCount: PositiveSafeInt,
    sampleCount: PositiveSafeInt, payload: DigestPairSchema.extend({ method: z.literal(PLAN_VERIFICATION_METHODS.audioPackets) }),
    timing: z.strictObject({ mapping: z.enum(["identity", "rebase", "retime", "rebase_then_retime"]), sourceDigest: HashSchema, outputDigest: HashSchema }) })]),
});
const PlanDerivationBodySchema = z.strictObject({
  artifactType: z.literal("CanonicalMediaDerivation"), artifactVersion: z.literal(CANONICAL_PLAN_DERIVATION_VERSION), stability: z.literal("internal_pre_stable"),
  computationId: IdSchema,
  source: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, rootAuthorization: FootageAuthorizationRootSchema, factsDigest: HashSchema,
    evaluation: CanonicalProfileEvaluationSchema }),
  plan: CanonicalizationPlanSchema, toolchain: CanonicalPlanToolchainSchema,
  output: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, factsDigest: HashSchema, verification: PlanVerificationSchema }),
  scope: z.strictObject({ creatorId: IdSchema, projectId: IdSchema }),
});
const videoMappingOf = (operations: readonly Operation[]) => (operationOf(operations, "REBASE_TIMELINE_ZERO") === undefined
  ? operationOf(operations, "SNAP_VIDEO_TIMESTAMPS") === undefined ? "identity" : "snap"
  : operationOf(operations, "SNAP_VIDEO_TIMESTAMPS") === undefined ? "rebase" : "rebase_then_snap");
const audioMappingOf = (operations: readonly Operation[]) => (operationOf(operations, "REBASE_TIMELINE_ZERO") === undefined
  ? operationOf(operations, "RETIME_AUDIO_CONTIGUOUS") === undefined ? "identity" : "retime"
  : operationOf(operations, "RETIME_AUDIO_CONTIGUOUS") === undefined ? "rebase" : "rebase_then_retime");
/** The digest of the exact grid a snap produces: frame i at i grid periods after zero, in the output time base. */
const snapGridDigestOf = (snap: OperationOf<"SNAP_VIDEO_TIMESTAMPS">): string => videoTimelineDigestOf({ timeBase: snap.outputTimeBase,
  presentationTimestamps: Array.from({ length: snap.frameCount }, (_, i) => i * snap.gridPeriodTicks) });
export const CanonicalMediaPlanDerivationSchema = PlanDerivationBodySchema.extend({ derivationId: IdSchema }).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const { source, output, plan, scope } = value, root = source.rootAuthorization, verified = output.verification, ops = plan.operations;
  if (source.assetId !== `asset_${source.contentHash}` || output.assetId !== `asset_${output.contentHash}`) issue("Asset identities are the content hashes they name.");
  if (output.contentHash === source.contentHash) issue("A canonical derivative has bytes distinct from its source.");
  if (root.contentHash !== source.contentHash || root.sizeBytes !== source.sizeBytes) issue("The source is exactly the root authorization's bytes.");
  if (scope.creatorId !== root.creatorId || scope.projectId !== root.projectId) issue("A derivation keeps exactly its root's creator and project.");
  if (output.factsDigest === source.factsDigest) issue("The output is verified from its own facts.");
  const evaluated = source.evaluation;
  if (evaluated.factsDigest !== source.factsDigest || evaluated.outcome !== "CANONICALIZABLE_EXACT_REMUX" || !equal(evaluated.profile, plan.targetProfile)) {
    issue("The recorded source evaluation is the exact-remux evaluation of exactly the source facts.");
  }
  if (!equal(repairsOf(evaluated.findings).sort(), ops.map(o => o.op).sort())) issue("The plan holds exactly the operations its source's findings require.");
  const conformed = verified.output;
  if (conformed.factsDigest !== output.factsDigest || conformed.outcome !== "CONFORMS" || !equal(conformed.profile, plan.targetProfile)) {
    issue("The output conforms to the target profile, judged from its own facts.");
  }
  if (!equal(verified.droppedStreams, operationOf(ops, "SELECT_AV_STREAMS")?.dropped ?? [])) issue("The verification declares exactly the streams the plan drops.");
  const video = verified.video, snap = operationOf(ops, "SNAP_VIDEO_TIMESTAMPS"), declares = operationOf(ops, "DECLARE_SQUARE_SAMPLE_ASPECT") !== undefined;
  if (video.decodedFrames.sourceDigest !== video.decodedFrames.outputDigest) issue("The output decodes to exactly the source's frames, by index.");
  if (declares !== (video.bitstream.state === "parameter_sets_rewritten_for_declared_square_sample_aspect")) issue("Only DECLARE rewrites the video parameter sets.");
  if (video.bitstream.state === "packet_payloads_identical" && video.bitstream.sourceDigest !== video.bitstream.outputDigest) {
    issue("Without DECLARE every video packet payload is identical.");
  }
  if (video.timing.mapping !== videoMappingOf(ops)) issue("The recorded video mapping is the plan's.");
  if ((video.timing.mapping === "identity") !== (video.timing.sourceDigest === video.timing.outputDigest)) issue("Only an identity mapping keeps the video timeline.");
  if (snap !== undefined && (video.frameCount !== snap.frameCount || video.timing.sourceDigest !== snap.sourcePresentationDigest || video.timing.outputDigest !== snapGridDigestOf(snap))) {
    issue("The snapped timeline is exactly the plan's grid, one frame per source frame.");
  }
  const audio = verified.audio, retime = operationOf(ops, "RETIME_AUDIO_CONTIGUOUS");
  if ((plan.streams.audioIndex === null) !== (audio.state === "absent")) issue("Audio is verified exactly when the plan keeps an audio stream.");
  if (audio.state === "retained") {
    if (audio.payload.sourceDigest !== audio.payload.outputDigest) issue("Every audio packet payload is identical, by index.");
    if (audio.timing.mapping !== audioMappingOf(ops)) issue("The recorded audio mapping is the plan's.");
    if ((audio.timing.mapping === "identity") !== (audio.timing.sourceDigest === audio.timing.outputDigest)) issue("Only an identity mapping keeps the audio timeline.");
    if (retime !== undefined && (audio.frameCount !== retime.frameCount || audio.sampleCount !== retime.sampleCount || audio.timing.sourceDigest !== retime.sourceTimingDigest)) {
      issue("The retimed audio is exactly the plan's frames and samples.");
    }
  }
  if (value.computationId !== canonicalPlanComputationIdOf(value)) issue("The computation identity binds exactly the source bytes, the plan and the toolchain.");
  if (!checkIdentity(value, "derivationId", CANONICAL_PLAN_DERIVATION_IDENTITY)) issue("The derivation identity binds every recorded field.");
});
export type CanonicalMediaPlanDerivation = z.infer<typeof CanonicalMediaPlanDerivationSchema>;
/** Either accepted derivation version: the N1 record (0.1.0), read exactly as accepted, or the plan-based record (0.2.0). Not wired yet. */
export const AnyCanonicalMediaDerivationSchema = z.union([CanonicalMediaDerivationSchema, CanonicalMediaPlanDerivationSchema]);

/**
 * The exact-remux checks that need both facts records: the output is the source's media with exactly the plan's changes. Every video
 * property but the sample aspect (DECLARE) and the timeline (REBASE, SNAP) is identical; every frame maps to exactly one output frame at
 * exactly the plan's instant; audio keeps its format, its frames and their sample counts, at exactly the plan's positions.
 */
function checkExactRemux(source: CanonicalMediaAnalysis, output: CanonicalMediaAnalysis, plan: CanonicalizationPlan): void {
  const ops = plan.operations, rebase = operationOf(ops, "REBASE_TIMELINE_ZERO"), snap = operationOf(ops, "SNAP_VIDEO_TIMESTAMPS");
  const retime = operationOf(ops, "RETIME_AUDIO_CONTIGUOUS"), offsetOf = (index: number) => rebase?.offsets.find(o => o.streamIndex === index)?.offsetTicks ?? 0;
  const sv = source.video!, ov = output.video!;
  const invariant = (v: VideoStreamFacts) => ({ codec: v.codec, pixelFormat: v.pixelFormat, bitDepth: v.bitDepth, fieldOrder: v.fieldOrder, geometry: v.geometry,
    displayMatrix: v.displayMatrix, frameCropping: v.frameCropping, color: v.color, sideData: v.sideData, decodeReordering: v.decodeReordering });
  if (!equal(invariant(sv), invariant(ov))) fail("derivation_invalid", "An exact remux changes no video property but those its plan names.");
  if (operationOf(ops, "DECLARE_SQUARE_SAMPLE_ASPECT") === undefined && !equal(sv.sampleAspectRatio, ov.sampleAspectRatio)) {
    fail("derivation_invalid", "Without DECLARE the sample-aspect declarations are unchanged.");
  }
  if (sv.presentationTimestamps.length !== ov.presentationTimestamps.length) fail("derivation_invalid", "Every source frame is exactly one output frame.");
  if (snap !== undefined) {
    if (!equal(ov.timeBase, snap.outputTimeBase) || !equal(ov.declaredFrameRate, snap.targetFrameRate) || !ov.presentationTimestamps.every((t, i) => t === i * snap.gridPeriodTicks)) {
      fail("derivation_invalid", "The snapped video lies exactly on the plan's grid.");
    }
  } else {
    const offset = offsetOf(sv.index);
    if (!equal(ov.timeBase, sv.timeBase) || !equal(ov.declaredFrameRate, sv.declaredFrameRate) || !ov.presentationTimestamps.every((t, i) => t === sv.presentationTimestamps[i]! - offset)) {
      fail("derivation_invalid", "The video timeline is exactly the source's, shifted by the plan's rebase.");
    }
  }
  const sa = source.audio, oa = output.audio;
  if ((plan.streams.audioIndex === null) !== (oa === null)) fail("derivation_invalid", "Audio is kept exactly when the plan keeps it.");
  if (sa === null || oa === null) return;
  const format = (a: AudioStreamFacts) => ({ codec: a.codec, sampleRateHz: a.sampleRateHz, channels: a.channels, channelLayout: a.channelLayout, timeBase: a.timeBase });
  if (!equal(format(sa), format(oa))) fail("derivation_invalid", "An exact remux keeps the audio format.");
  if (sa.frames.length !== oa.frames.length || !sa.frames.every((f, k) => f.samples === oa.frames[k]!.samples)) {
    fail("derivation_invalid", "Every audio frame keeps its sample count, in order.");
  }
  const offset = offsetOf(sa.index);
  let at = 0;
  const expected = sa.frames.map(f => { const pts = retime === undefined ? f.pts - offset : at; at += f.samples; return pts; });
  if (!oa.frames.every((f, k) => f.pts === expected[k])) fail("derivation_invalid", "The audio timeline is exactly the plan's mapping.");
}

/**
 * One verified plan-based canonicalization as a record. The source must plan PLAN under v1 and `plan` must be exactly the planner's plan.
 * The output's own facts must conform to the target profile and differ from the source's exactly as the plan says. B2-A2 measures the
 * digests under the pinned runtime and derives both facts records from the exact bytes; this builder only records them and checks they
 * agree.
 */
export function buildCanonicalMediaPlanDerivation(input: {
  rootAuthorization: unknown; source: { facts: unknown }; plan: unknown;
  output: { contentHash: string; sizeBytes: number; facts: unknown; decodedFrames: { sourceDigest: string; outputDigest: string };
    videoPackets: { sourceDigest: string; outputDigest: string } | null; audioPackets: { sourceDigest: string; outputDigest: string } | null };
}): CanonicalMediaPlanDerivation {
  const root = parseOr(FootageAuthorizationRootSchema, input.rootAuthorization, "derivation_invalid",
    "A plan-based derivation starts from an AuthorizedFootage 1.1.0 root whose owner consented to canonicalization.");
  const source = analyzeCanonicalMediaFactsV1(input.source.facts), planned = planCanonicalizationV1(input.source.facts).plan;
  if (planned === null) {
    fail("classification_invalid", "Only a source the v1 exact-remux vocabulary reaches has a plan: DIRECT needs no derivative, and deferred or refused media is never repaired here.");
  }
  if (!equal(input.plan, planned)) fail("derivation_invalid", "The plan is exactly the planner's plan for the source facts: no caller adds, omits or reorders an operation.");
  const output = analyzeCanonicalMediaFactsV1(input.output.facts);
  if (output.evaluation.outcome !== "CONFORMS") fail("classification_invalid", "The canonical output satisfies the target profile.");
  checkExactRemux(source, output, planned);
  const ops = planned.operations, declares = operationOf(ops, "DECLARE_SQUARE_SAMPLE_ASPECT") !== undefined;
  const { videoPackets, audioPackets } = input.output;
  if (declares !== (videoPackets === null)) fail("derivation_invalid", "Video packet identity is claimed exactly when no DECLARE rewrote the parameter sets.");
  if ((planned.streams.audioIndex !== null) !== (audioPackets !== null)) fail("derivation_invalid", "Audio packets are verified exactly when the plan keeps audio.");
  const sv = source.video!, ov = output.video!, sa = source.audio, oa = output.audio;
  const verification = {
    method: PLAN_VERIFICATION_METHOD, output: output.evaluation, droppedStreams: operationOf(ops, "SELECT_AV_STREAMS")?.dropped ?? [],
    video: { frameCount: sv.presentationTimestamps.length, decodedFrames: { method: PLAN_VERIFICATION_METHODS.decodedFrames, ...input.output.decodedFrames },
      bitstream: videoPackets === null ? { state: "parameter_sets_rewritten_for_declared_square_sample_aspect" }
        : { state: "packet_payloads_identical", method: PLAN_VERIFICATION_METHODS.videoPackets, sourceDigest: videoPackets.sourceDigest, outputDigest: videoPackets.outputDigest },
      timing: { mapping: videoMappingOf(ops), sourceDigest: videoTimelineDigestOf(sv), outputDigest: videoTimelineDigestOf(ov) } },
    audio: sa === null || oa === null || audioPackets === null ? { state: "absent" } : { state: "retained", frameCount: sa.frames.length,
      sampleCount: sa.frames.reduce((n, f) => n + f.samples, 0), payload: { method: PLAN_VERIFICATION_METHODS.audioPackets, ...audioPackets },
      timing: { mapping: audioMappingOf(ops), sourceDigest: audioTimelineDigestOf(sa), outputDigest: audioTimelineDigestOf(oa) } },
  };
  const sourceRecord = { assetId: `asset_${root.contentHash}`, contentHash: root.contentHash, sizeBytes: root.sizeBytes, rootAuthorization: root,
    factsDigest: source.evaluation.factsDigest!, evaluation: source.evaluation };
  const body = { artifactType: "CanonicalMediaDerivation", artifactVersion: CANONICAL_PLAN_DERIVATION_VERSION, stability: "internal_pre_stable",
    computationId: canonicalPlanComputationIdOf({ source: sourceRecord, plan: planned, toolchain: CANONICAL_PLAN_TOOLCHAIN }), source: sourceRecord, plan: planned,
    toolchain: CANONICAL_PLAN_TOOLCHAIN,
    output: { assetId: `asset_${input.output.contentHash}`, contentHash: input.output.contentHash, sizeBytes: input.output.sizeBytes, factsDigest: output.evaluation.factsDigest!,
      verification },
    scope: { creatorId: root.creatorId, projectId: root.projectId } };
  return parseOr(CanonicalMediaPlanDerivationSchema, identify(CANONICAL_PLAN_DERIVATION_IDENTITY, "derivationId", body), "derivation_invalid",
    "The plan-based derivation does not validate.");
}

/**
 * The AuthorizedFootage 1.1.0 derived record for a plan-based derivation's output: `system_canonicalized`, the root's rights basis and
 * scope, the root's purposes or a stated subset, no consent of its own. Its lineage names the derivation, and its accepted `recipeId`
 * field names the planId: the exact, content-identified transformation that made these bytes (the public authorization schema is unchanged).
 */
export function buildCanonicalPlanDerivedAuthorization(input: { derivation: unknown; dateAdded: string;
  allowedPurposes?: readonly ("local_footage_analysis" | "local_evaluation")[] }): FootageAuthorizationDerived {
  const derivation = parseOr(CanonicalMediaPlanDerivationSchema, input.derivation, "derivation_invalid", "A derived authorization is built only from a valid 0.2.0 derivation.");
  const root = derivation.source.rootAuthorization;
  return parseOr(FootageAuthorizationDerivedSchema, { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", contentHash: derivation.output.contentHash,
    sizeBytes: derivation.output.sizeBytes, sourceType: "system_canonicalized", authorizationBasis: root.authorizationBasis,
    allowedPurposes: [...(input.allowedPurposes ?? root.allowedPurposes)], dateAdded: input.dateAdded, creatorId: root.creatorId, projectId: root.projectId,
    derivedFrom: { rootAuthorization: root, derivationId: derivation.derivationId, recipeId: derivation.plan.planId } },
  "authorization_invalid", "The derived authorization does not validate.");
}
