/**
 * Gate 7 Batch 3B localized execution, pure core. The SAME RenderProgram and RENDER_SEMANTICS are executed as per-segment stage processes that
 * materialize each segment's exact rendered frames and samples as lossless raw intermediates (the segment chain of the one-pass compiler,
 * exactly), and one assembly process that runs the unchanged concatenation, whole-output look, time base and encode. A segment intermediate is
 * an execution cache artifact, never authority: immutable, content-addressed, bound to the accepted segment computation identity and to this
 * versioned intermediate format, hash-verified before any reuse, and reusable only when a prior segmented receipt with passing, exactly linked
 * technical QC certifies exactly that identity and those bytes. Nothing here reads a file or starts anything.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { HashSchema, Nat, ScopeSchema, sameScope, type Scope } from "../edit-graph/common.js";
import { ExecutionExecutorIdentitySchema, PositiveSafeInt, RenderIntentSchema } from "../edit-execution/common.js";
import { RuntimeIdentitySchema } from "../edit-execution/runtime.js";
import { RENDER_IMPLEMENTATION, RenderImplementationSchema, check, envelope, guard, header, parse, sha256 } from "./common.js";
import { segmentIntermediateBytes } from "./ffmpeg.js";
import { requireProgram, type RenderProgram } from "./program.js";
import { TechnicalMediaQcReceiptSchema } from "./qc.js";
import { SEGMENT_EXECUTION_SEMANTICS_VERSION, SegmentArtifactRefSchema, SegmentedRenderExecutionReceiptSchema, type SegmentArtifactRef,
  type SegmentedRenderExecutionReceipt } from "./receipts.js";
import { RENDER_SEMANTICS_DIGEST } from "./semantics.js";

/**
 * The versioned segmented-execution semantics. The executor semantics (RENDER_SEMANTICS, and with them the executor identity and every
 * segment computation identity) are unchanged: this descriptor names only how one program is split into processes and how intermediates look.
 */
export const SEGMENT_EXECUTION_SEMANTICS = {
  version: SEGMENT_EXECUTION_SEMANTICS_VERSION,
  renderSemantics: RENDER_SEMANTICS_DIGEST,
  stage: { input: "one_verified_staged_source_handle_fd_only_v0", chain: "render_executor_semantics_v0_segment_video_and_audio_chain_exactly_v0",
    video: { codec: "rawvideo", pixelFormat: "yuv420p", layout: "planar_frames_at_output_resolution_exact_byte_count_v0" },
    audio: { codec: "pcm_f32le", layout: "interleaved_float32_little_endian_at_output_rate_and_layout_exact_byte_count_v0" } },
  assembly: { inputs: "verified_segment_artifact_handles_fd_only_v0", chain: "setsar_concat_whole_output_look_settb_then_render_executor_semantics_v0_encode_tail_v0" },
  reuse: "exact_segment_computation_identity_prior_segmented_receipt_with_passing_linked_qc_durable_record_and_full_byte_verification_v0",
  artifacts: "immutable_content_addressed_no_overwrite_publication_read_only_v0",
} as const;
export const SEGMENT_EXECUTION_SEMANTICS_DIGEST = sha256(canonicalSerialize(SEGMENT_EXECUTION_SEMANTICS));
/** Hard bounds of the local segment store: one execution's new intermediates, and the whole store (no eviction exists: a full store refuses). */
export const SEGMENT_STORE_LIMITS = Object.freeze({ maxArtifactBytesPerExecution: 4 * 1024 ** 3, maxStoreBytes: 32 * 1024 ** 3 });

const ShapeSchema = z.strictObject({
  video: z.strictObject({ frames: PositiveSafeInt, width: PositiveSafeInt, height: PositiveSafeInt, pixelFormat: z.literal("yuv420p"), bytes: PositiveSafeInt }),
  audio: z.strictObject({ samples: PositiveSafeInt, channels: z.union([z.literal(1), z.literal(2)]), sampleRateHz: z.union([z.literal(44100), z.literal(48000)]),
    bytes: PositiveSafeInt }).nullable(),
});
export type SegmentArtifactShape = z.infer<typeof ShapeSchema>;

// ---------------------------------------------------------------- the durable segment record: what the trusted adapter published once
const Identity = SegmentArtifactRefSchema.shape.video;
const RecordBodySchema = z.strictObject({
  ...envelope("SegmentArtifactRecord"), segmentComputationId: IdSchema,
  semantics: z.strictObject({ version: z.literal(SEGMENT_EXECUTION_SEMANTICS_VERSION), digest: HashSchema }),
  executor: ExecutionExecutorIdentitySchema, runtime: RuntimeIdentitySchema, environment: IdSchema, renderIntent: RenderIntentSchema, shape: ShapeSchema,
  video: Identity, audio: Identity.nullable(),
  producedBy: z.strictObject({ startId: IdSchema, claimId: IdSchema, programId: IdSchema, position: Nat, argvDigest: HashSchema, ffmpegSha256: HashSchema }),
  recorder: RenderImplementationSchema, basis: z.literal("completed_verified_segment_stage_no_overwrite_publication_v0"),
});
export const SegmentArtifactRecordSchema = RecordBodySchema.extend({ recordId: IdSchema })
  .refine(r => r.video.sizeBytes === r.shape.video.bytes && (r.audio === null) === (r.shape.audio === null) && (r.audio === null || r.audio.sizeBytes === r.shape.audio!.bytes),
    "The artifacts are exactly the shape's bytes.")
  .refine(r => checkIdentity(r, "recordId", "segment_artifact_record_v0"), "Segment artifact record identity mismatch.");
export type SegmentArtifactRecord = z.infer<typeof SegmentArtifactRecordSchema>;

// ---------------------------------------------------------------- the localized plan: reuse exactly what is certified, compute the rest
const PlanSegmentSchema = z.strictObject({ position: Nat, segmentComputationId: IdSchema, decision: z.enum(["reuse_certified_artifact", "compute"]),
  reason: z.enum(["no_prior_execution_supplied", "segment_computation_not_certified_by_prior", "identical_segment_computation_certified_by_prior_receipt_with_passing_qc"]),
  certified: SegmentArtifactRefSchema.nullable(), shape: ShapeSchema })
  .refine(s => (s.decision === "reuse_certified_artifact") === (s.certified !== null)
    && (s.decision === "reuse_certified_artifact") === (s.reason === "identical_segment_computation_certified_by_prior_receipt_with_passing_qc"), "Only a certified segment is reused.");
const PlanBodySchema = z.strictObject({
  ...envelope("LocalizedExecutionPlan"), scope: ScopeSchema, program: z.strictObject({ programId: IdSchema, dagId: IdSchema, renderComputationId: IdSchema }),
  semantics: z.strictObject({ version: z.literal(SEGMENT_EXECUTION_SEMANTICS_VERSION), digest: z.literal(SEGMENT_EXECUTION_SEMANTICS_DIGEST) }),
  prior: z.strictObject({ receiptId: IdSchema, qcReceiptId: IdSchema, outputContentHash: HashSchema }).nullable(),
  segments: z.array(PlanSegmentSchema).min(1).max(16), summary: z.strictObject({ segments: PositiveSafeInt, reuse: Nat, compute: Nat }),
  intermediates: z.strictObject({ computeBytes: Nat, basis: z.literal("exact_raw_frames_and_samples_of_every_segment_to_compute_v0") }),
});
export const LocalizedExecutionPlanSchema = PlanBodySchema.extend({ planId: IdSchema })
  .refine(p => p.segments.every((s, i) => s.position === i) && p.summary.segments === p.segments.length
    && p.summary.reuse === p.segments.filter(s => s.decision === "reuse_certified_artifact").length && p.summary.reuse + p.summary.compute === p.segments.length,
  "The summary counts the plan's own segments.")
  .refine(p => checkIdentity(p, "planId", "localized_execution_plan_v0"), "Localized execution plan identity mismatch.");
export type LocalizedExecutionPlan = z.infer<typeof LocalizedExecutionPlanSchema>;

/** The exact raw intermediate shape of one segment of this program: known before any process runs. */
export function segmentArtifactShapeOf(programInput: RenderProgram, position: number): SegmentArtifactShape {
  const program = requireProgram(programInput);
  check(Number.isSafeInteger(position) && position >= 0 && position < program.segments.length, "input_invalid", "No such segment of this program.");
  const s = program.segments[position]!, bytes = segmentIntermediateBytes(program, s), { width, height } = program.output.resolution;
  const audio = s.audio.state === "linked" && program.output.audio.state === "encoded" ? { samples: s.audio.endSample - s.audio.startSample,
    channels: program.output.audio.channelLayout === "stereo" ? 2 as const : 1 as const, sampleRateHz: program.output.audio.sampleRateHz, bytes: bytes.audio! } : null;
  return parse(ShapeSchema, { video: { frames: s.video.frames, width, height, pixelFormat: "yuv420p", bytes: bytes.video }, audio }, "render_program_invalid");
}
const SEGMENT_ID = /^render_segment_computation_v0_([a-f0-9]{64})$/;
/** The durable record's store key: the content-derived hex of the segment computation identity, never a caller-chosen name. */
export function segmentRecordKeyOf(segmentComputationId: string): string {
  const match = typeof segmentComputationId === "string" ? SEGMENT_ID.exec(segmentComputationId) : null;
  check(match !== null, "input_invalid", "Only a segment computation identity names a segment record.");
  return match[1]!;
}
export interface SegmentRecordInput { program: RenderProgram; position: number; video: { contentHash: string; sizeBytes: number };
  audio: { contentHash: string; sizeBytes: number } | null; producedBy: { startId: string; claimId: string; argvDigest: string; ffmpegSha256: string } }
/** The durable record a completed, verified stage publishes once: exactly its computation, intermediate format, shape and bytes. */
export function buildSegmentArtifactRecord(input: SegmentRecordInput): SegmentArtifactRecord {
  const program = requireProgram(input.program), shape = segmentArtifactShapeOf(program, input.position), s = program.segments[input.position]!;
  check(input.video.sizeBytes === shape.video.bytes && (input.audio === null) === (shape.audio === null) && (input.audio === null || input.audio.sizeBytes === shape.audio!.bytes),
    "segment_stage_output_invalid", "A segment intermediate is exactly its shape's bytes.");
  const body = { ...header("SegmentArtifactRecord"), segmentComputationId: s.segmentComputationId,
    semantics: { version: SEGMENT_EXECUTION_SEMANTICS_VERSION, digest: SEGMENT_EXECUTION_SEMANTICS_DIGEST }, executor: program.executor, runtime: program.runtime,
    environment: program.environment, renderIntent: program.binding.renderIntent, shape, video: { contentHash: input.video.contentHash, sizeBytes: input.video.sizeBytes },
    audio: input.audio === null ? null : { contentHash: input.audio.contentHash, sizeBytes: input.audio.sizeBytes },
    producedBy: { startId: input.producedBy.startId, claimId: input.producedBy.claimId, programId: program.programId, position: input.position,
      argvDigest: input.producedBy.argvDigest, ffmpegSha256: input.producedBy.ffmpegSha256 },
    recorder: RENDER_IMPLEMENTATION, basis: "completed_verified_segment_stage_no_overwrite_publication_v0" as const };
  return parse(SegmentArtifactRecordSchema, identify("segment_artifact_record_v0", "recordId", body), "segment_stage_output_invalid");
}
/**
 * A durable record read back from the store is reusable only if it is intact (canonical and self-identified; otherwise it is corrupt) and is
 * exactly the certified artifact of exactly this computation in this intermediate format; with `use`, also exactly the shape and execution
 * identity the current program needs at that position.
 */
export function checkSegmentArtifactRecord(recordInput: unknown, expected: { segmentComputationId: string; artifact: SegmentArtifactRef;
  use?: { program: RenderProgram; position: number } }): SegmentArtifactRecord {
  const record = guard("segment_artifact_corrupt", () => SegmentArtifactRecordSchema.parse(recordInput));
  check(equal(record, recordInput), "segment_artifact_corrupt", "A segment record is stored exactly as published.");
  const artifact = parse(SegmentArtifactRefSchema, expected.artifact, "input_invalid");
  check(record.segmentComputationId === expected.segmentComputationId && record.recordId === artifact.recordId && equal(record.video, artifact.video)
    && equal(record.audio, artifact.audio) && equal(record.semantics, { version: SEGMENT_EXECUTION_SEMANTICS_VERSION, digest: SEGMENT_EXECUTION_SEMANTICS_DIGEST }),
  "segment_artifact_mismatch", "The record is not exactly the certified artifact of this computation in this intermediate format.");
  if (expected.use !== undefined) {
    const program = requireProgram(expected.use.program), s = program.segments[expected.use.position];
    check(s !== undefined && s.segmentComputationId === record.segmentComputationId && equal(record.shape, segmentArtifactShapeOf(program, expected.use.position))
      && equal([record.executor, record.runtime, record.environment, record.renderIntent], [program.executor, program.runtime, program.environment, program.binding.renderIntent]),
    "segment_artifact_mismatch", "The record is not this program's computation, shape and execution identity at this position.");
  }
  return record;
}
/**
 * The prior execution that may certify reuse: a segmented (0.2.0) success receipt in this scope, by this executor, runtime, environment and
 * intent, of this segmented semantics, whose independent technical QC passed and names exactly it and its output bytes. Anything else
 * certifies nothing and is refused, never downgraded silently.
 */
function certifiedPrior(prior: { receipt: unknown; qc: unknown }, program: RenderProgram, scope: Scope): { receipt: SegmentedRenderExecutionReceipt; qcReceiptId: string } {
  const invalid = "segment_reuse_authority_invalid" as const;
  const receipt = guard(invalid, () => SegmentedRenderExecutionReceiptSchema.parse(prior.receipt));
  check(equal(receipt, prior.receipt), invalid, "The prior receipt is not in canonical form.");
  const qc = guard(invalid, () => TechnicalMediaQcReceiptSchema.parse(prior.qc));
  check(equal(qc, prior.qc), invalid, "The prior QC receipt is not in canonical form.");
  const out = receipt.output;
  check(qc.verdict === "pass" && qc.execution.receiptId === receipt.receiptId && qc.execution.renderComputationId === receipt.renderComputationId
    && qc.execution.dagId === receipt.dag.dagId && qc.execution.programId === receipt.program.programId && equal(qc.scope, receipt.scope)
    && equal(qc.output, { outputArtifactId: out.outputArtifactId, contentHash: out.contentHash, sizeBytes: out.sizeBytes })
    && equal(qc.observedIdentity, { contentHash: out.contentHash, sizeBytes: out.sizeBytes }), invalid,
  "Only a prior execution whose independent technical QC passed on exactly its output certifies anything.");
  check(sameScope(receipt.scope, scope) && equal([receipt.executor, receipt.runtime, receipt.environment, receipt.renderIntent],
    [program.executor, program.runtime, program.environment, program.binding.renderIntent]) && receipt.rendererSemantics.digest === program.semantics.digest
    && equal(receipt.strategy.semantics, { version: SEGMENT_EXECUTION_SEMANTICS_VERSION, digest: SEGMENT_EXECUTION_SEMANTICS_DIGEST }), invalid,
  "The prior execution is of another scope, executor, runtime, environment, intent or segmented semantics.");
  return { receipt, qcReceiptId: qc.qcReceiptId };
}
/**
 * Plans one localized execution: a segment is reused only when a certified prior recorded the identical segment computation with exactly the
 * intermediate bytes this program's shape requires; every other segment is computed. The assembly and final encode always run.
 */
export function planLocalizedExecution(input: { program: RenderProgram; scope: Scope; prior: { receipt: unknown; qc: unknown } | null }): LocalizedExecutionPlan {
  check(input !== null && typeof input === "object", "input_invalid", "A localized execution request is required.");
  const program = requireProgram(input.program), scope = parse(ScopeSchema, input.scope, "input_invalid");
  const prior = input.prior === null || input.prior === undefined ? null : certifiedPrior(input.prior, program, scope);
  const segments = program.segments.map(s => {
    const shape = segmentArtifactShapeOf(program, s.position), prev = prior?.receipt.segments.find(q => q.segmentComputationId === s.segmentComputationId);
    if (prior === null || prev === undefined) {
      return { position: s.position, segmentComputationId: s.segmentComputationId, decision: "compute" as const,
        reason: prior === null ? "no_prior_execution_supplied" as const : "segment_computation_not_certified_by_prior" as const, certified: null, shape };
    }
    check(prev.artifact.video.sizeBytes === shape.video.bytes && (prev.artifact.audio?.sizeBytes ?? null) === (shape.audio?.bytes ?? null), "segment_reuse_authority_invalid",
      "A certified artifact that is not this computation's exact intermediate shape certifies nothing.");
    return { position: s.position, segmentComputationId: s.segmentComputationId, decision: "reuse_certified_artifact" as const,
      reason: "identical_segment_computation_certified_by_prior_receipt_with_passing_qc" as const, certified: prev.artifact, shape };
  });
  const reuse = segments.filter(s => s.decision === "reuse_certified_artifact").length;
  const computeBytes = segments.filter(s => s.decision === "compute").reduce((n, s) => n + s.shape.video.bytes + (s.shape.audio?.bytes ?? 0), 0);
  check(Number.isSafeInteger(computeBytes), "limit_exceeded", "Intermediate bytes exceed exact arithmetic.");
  const body = { ...header("LocalizedExecutionPlan"), scope, program: { programId: program.programId, dagId: program.binding.dagId,
    renderComputationId: program.binding.renderComputationId }, semantics: { version: SEGMENT_EXECUTION_SEMANTICS_VERSION, digest: SEGMENT_EXECUTION_SEMANTICS_DIGEST },
  prior: prior === null ? null : { receiptId: prior.receipt.receiptId, qcReceiptId: prior.qcReceiptId, outputContentHash: prior.receipt.output.contentHash },
  segments, summary: { segments: segments.length, reuse, compute: segments.length - reuse },
  intermediates: { computeBytes, basis: "exact_raw_frames_and_samples_of_every_segment_to_compute_v0" as const } };
  return parse(LocalizedExecutionPlanSchema, identify("localized_execution_plan_v0", "planId", body), "input_invalid");
}
/** A plan read back (or handed to a receipt builder) must be intact and of exactly this program. */
export function requireLocalizedPlan(value: unknown, program: RenderProgram): LocalizedExecutionPlan {
  const plan = parse(LocalizedExecutionPlanSchema, value, "input_invalid");
  check(equal(plan, value) && plan.program.programId === program.programId && plan.segments.length === program.segments.length
    && plan.segments.every((s, i) => s.segmentComputationId === program.segments[i]!.segmentComputationId), "input_invalid", "The localized plan is not of this program.");
  return plan;
}
