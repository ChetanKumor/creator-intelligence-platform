/**
 * Batch-2B execution evidence: the durable execution-start record that consumes a claim's single execution, the immutable success
 * receipt, the structurally distinct failure record, and reservation-consumption accounting. Accounting never invents a value:
 * every dimension states whether it was measured, derived from the accepted DAG, reported by the pinned FFmpeg itself, proven not
 * applicable or unavailable, and the schemas recompute it from the raw measurements and the execution identity, so a relabeled
 * coverage, status, ruling or executor fails. The owner's local-execution ruling covers only the one execution it names.
 * No record holds a filesystem location, an argv or a command string; the argv is evidenced only by its digest.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { ArtifactRefSchema, checkIdentity, equal, identify } from "../editorial/common.js";
import { HashSchema, ScopeSchema } from "../edit-graph/common.js";
import { ExecutionExecutorIdentitySchema, LocationFreeVersionSchema, PositiveSafeInt, RenderIntentSchema } from "../edit-execution/common.js";
import { VideoEncodingSchema } from "../edit-execution/policy.js";
import { RuntimeIdentitySchema } from "../edit-execution/runtime.js";
import { EDIT_RUNTIME_ERROR_CODES } from "../edit-runtime/common.js";
import { ClaimTargetSchema } from "../edit-runtime/records.js";
import type { Reservation } from "../routing/index.js";
import { EDIT_RENDER_ERROR_CODES, MAX_EXCERPT_LINES, MAX_EXCERPT_LINE_LENGTH, RenderImplementationSchema, RENDER_IMPLEMENTATION, check, envelope, header, parse,
  sha256 } from "./common.js";
import { ExecutablePermitBindingSchema, type ExecutablePermitBinding } from "./authorize.js";
import { requireProgram, type RenderProgram } from "./program.js";
import { RealRuntimeProbeSchema, type RealRuntimeProbe, type RealExecutionPolicy } from "./records.js";
import { RENDER_SEMANTICS } from "./semantics.js";

// ---------------------------------------------------------------- output identity, bounds and timeout
/** Output content identity: the exact bytes only. It is never the render computation identity and never access authorization. */
export function outputArtifactIdOf(output: { contentHash: string; sizeBytes: number }): string {
  return identify("render_output_artifact_v0", "outputArtifactId", { container: RENDER_SEMANTICS.container.muxer, contentHash: output.contentHash, sizeBytes: output.sizeBytes })
    .outputArtifactId;
}
/**
 * The largest output a program may publish: twice the raw 4:2:0 frame bytes, twice the 16-bit PCM bytes of its linked audio and one
 * MiB of container overhead, never more than the owner's policy bound. A compressed encode of the exact work stays far below it.
 */
export function deriveOutputByteBound(programInput: RenderProgram, policy: RealExecutionPolicy): number {
  const program = requireProgram(programInput), { width, height } = program.output.resolution;
  const samples = program.segments.reduce((n, s) => n + (s.audio.state === "linked" ? s.audio.endSample - s.audio.startSample : 0), 0);
  const channels = program.output.audio.state === "encoded" && program.output.audio.channelLayout === "stereo" ? 2 : 1;
  const derived = program.output.frames * width * height * 3 + samples * channels * 4 + 1_048_576;
  check(Number.isSafeInteger(derived), "limit_exceeded", "The derived output bound exceeds exact arithmetic.");
  return Math.min(derived, policy.output.maxOutputBytes);
}
/** The hard process timeout: the owner policy bound, never more than the reservation's wall-clock ceiling. No caller supplies it. */
export function deriveRenderTimeoutMilliseconds(policy: RealExecutionPolicy, reservation: Pick<Reservation, "wallClockMilliseconds">): number {
  check(Number.isSafeInteger(reservation.wallClockMilliseconds) && reservation.wallClockMilliseconds > 0, "input_invalid", "The reservation must bound wall-clock time.");
  return Math.min(policy.process.maxWallClockMilliseconds, reservation.wallClockMilliseconds);
}

// ---------------------------------------------------------------- reservation-consumption accounting
export const COVERAGES = ["measured", "derived", "ffmpeg_reported", "not_applicable", "unavailable"] as const;
export const DIMENSIONS = ["wallClockMilliseconds", "cpuMilliseconds", "peakRamBytes", "gpuMilliseconds", "peakVramBytes", "apiSpendInrMicros", "totalCostInrMicros", "modelCalls",
  "frames", "pixelFrames", "audioMilliseconds", "outputBytes"] as const;
const BenchmarkSchema = z.strictObject({ cpuMilliseconds: z.number().int().nonnegative().safe(), userMilliseconds: z.number().int().nonnegative().safe(),
  systemMilliseconds: z.number().int().nonnegative().safe(), realMilliseconds: z.number().int().nonnegative().safe(), maxResidentKibibytes: z.number().int().nonnegative().safe() });
export const MeasurementsSchema = z.strictObject({ wallClockMilliseconds: z.number().int().nonnegative().safe().nullable(), benchmark: BenchmarkSchema.nullable(),
  outputBytes: z.number().int().nonnegative().safe().nullable() });
export type Measurements = z.infer<typeof MeasurementsSchema>;
const Ceiling = z.number().int().nonnegative().safe();
export const CeilingsSchema = z.strictObject({ wallClockMilliseconds: Ceiling, cpuMilliseconds: Ceiling, peakRamBytes: Ceiling, gpuMilliseconds: Ceiling, peakVramBytes: Ceiling,
  apiSpendInrMicros: Ceiling, totalCostInrMicros: Ceiling, modelCalls: Ceiling, frames: Ceiling, pixelFrames: Ceiling, audioMilliseconds: Ceiling });
export type Ceilings = z.infer<typeof CeilingsSchema>;
export const WorkSchema = z.strictObject({ frames: PositiveSafeInt, pixelFrames: PositiveSafeInt, audioMilliseconds: z.number().int().nonnegative().safe() });
export type Work = z.infer<typeof WorkSchema>;
const DimensionSchema = z.strictObject({ dimension: z.enum(DIMENSIONS), value: z.number().int().nonnegative().safe().nullable(), unit: z.enum(["milliseconds", "bytes", "inr_micros",
  "calls", "frames", "pixel_frames"]), coverage: z.enum(COVERAGES), basis: z.string().regex(/^[a-z0-9_]{1,100}$/), reserved: Ceiling.nullable(), withinReservation: z.boolean().nullable() });
/** The execution a record's accounting belongs to: its executor build, environment and runtime, exactly as the record names them. */
export const AccountingExecutionSchema = z.strictObject({ executor: ExecutionExecutorIdentitySchema, environment: IdSchema, runtime: RuntimeIdentitySchema });
export type AccountingExecution = z.infer<typeof AccountingExecutionSchema>;
/**
 * The owner's accounting ruling for Gate 7 Batch 2B (2026-09-26): local, non-metered development execution by the one pinned V0 executor
 * build, in its local environment, on the pinned runtime. Each is named here by literal identity, so a changed executor build (its
 * semantics are digested into it), environment or runtime never inherits the ruling. That build's semantics use software codecs and
 * filters only and fd-only protocols, and it invokes no provider and no model. Under the ruling:
 * - FFmpeg's own reports of CPU time and peak commit are accepted attributed evidence for exactly `cpuMilliseconds` and `peakRamBytes`;
 *   they stay `ffmpeg_reported`, with their exact bases, and are never relabelled measured;
 * - GPU time, VRAM, API spend and model calls are not applicable;
 * - total monetary cost is not applicable: no billable provider runs and no owner-authorized local cost model exists. The row carries no
 *   value: it is neither a measured nor an estimated zero, and it does not mean local compute is free.
 * Any other execution inherits none of it: those dimensions are unavailable until an owner ruling covers that execution (for a metered
 * cloud or production executor, its own owner-approved cost model).
 */
const LOCAL_RULING = {
  rulingId: "owner_local_non_metered_pinned_executor_ruling_v0",
  execution: {
    executor: { executorId: "ci_ffmpeg_render_executor", version: "0.1.0", implementationDigest: "a54c51380f6cb315d904c991867a5c99f380fd9ed4af4d2e846017d31898fe48" },
    environment: "local_win32_x64",
    runtime: { runtimeId: "ffmpeg_gyan_essentials_win64", version: "9.0.1-essentials_build-www.gyan.dev",
      implementationDigest: "72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3" },
  },
  acceptedFfmpegReported: ["cpuMilliseconds", "peakRamBytes"],
} as const;
const NO_RULING = "no_owner_accounting_ruling_for_this_execution_v0";
export const AccountingSchema = z.strictObject({ dimensions: z.array(DimensionSchema).length(DIMENSIONS.length), status: z.enum(["PASS", "PARTIAL", "FAIL"]),
  ruling: z.enum([LOCAL_RULING.rulingId, NO_RULING]),
  statusRule: z.literal("pass_only_if_every_dimension_is_measured_derived_not_applicable_or_owner_ruled_ffmpeg_reported_and_within_its_reservation_v1") });
export type Accounting = z.infer<typeof AccountingSchema>;
export function ceilingsOf(reservation: Reservation): Ceilings {
  return { wallClockMilliseconds: reservation.wallClockMilliseconds, cpuMilliseconds: reservation.cpuMilliseconds, peakRamBytes: reservation.peakRamBytes,
    gpuMilliseconds: reservation.gpuMilliseconds, peakVramBytes: reservation.peakVramBytes, apiSpendInrMicros: reservation.apiSpendInrMicros,
    totalCostInrMicros: reservation.totalCostInrMicros, modelCalls: reservation.modelCalls, frames: reservation.renderWork.frames, pixelFrames: reservation.renderWork.pixelFrames,
    audioMilliseconds: reservation.renderWork.audioMilliseconds };
}
export function workOf(programInput: RenderProgram): Work {
  const program = requireProgram(programInput), { width, height } = program.output.resolution;
  const samples = program.segments.reduce((n, s) => n + (s.audio.state === "linked" ? s.audio.endSample - s.audio.startSample : 0), 0);
  const rate = program.output.audio.state === "encoded" ? program.output.audio.sampleRateHz : 1;
  const pixelFrames = program.output.frames * width * height;
  check(Number.isSafeInteger(pixelFrames), "limit_exceeded", "Pixel frames exceed exact arithmetic.");
  return { frames: program.output.frames, pixelFrames, audioMilliseconds: Math.ceil((samples * 1000) / rate) };
}
type Row = Omit<z.infer<typeof DimensionSchema>, "reserved" | "withinReservation">;
const executionOf = (record: AccountingExecution): AccountingExecution => ({ executor: record.executor, environment: record.environment, runtime: record.runtime });
/**
 * The one accounting rule, recomputed by every receipt schema from the receipt's own raw measurements, ceilings, derived work and
 * execution identity. Only the execution the owner's ruling names gets its not-applicable rows and its accepted FFmpeg reports.
 */
export function accountingFrom(measurementsInput: Measurements, ceilingsInput: Ceilings, workInput: Work, executionInput: AccountingExecution): Accounting {
  const m = parse(MeasurementsSchema, measurementsInput), ceilings = parse(CeilingsSchema, ceilingsInput), work = parse(WorkSchema, workInput);
  const ruled = equal(parse(AccountingExecutionSchema, executionInput), LOCAL_RULING.execution);
  // Without the ruling nothing is proven not applicable to the execution, and no cost rule covers it: the dimension stays unavailable.
  const unruled = (dimension: Row["dimension"], unit: Row["unit"]): Row => ({ dimension, value: null, unit, coverage: "unavailable", basis: NO_RULING });
  const reported = m.benchmark;
  const rows: Row[] = [
    m.wallClockMilliseconds === null ? { dimension: "wallClockMilliseconds", value: null, unit: "milliseconds", coverage: "unavailable", basis: "process_not_started" }
      : { dimension: "wallClockMilliseconds", value: m.wallClockMilliseconds, unit: "milliseconds", coverage: "measured", basis: "trusted_adapter_monotonic_clock_spawn_to_exit_v0" },
    // On the pinned win32 build, FFmpeg's -benchmark reports the process's GetProcessTimes user and kernel times, and as "maxrss" the
    // GetProcessMemoryInfo PeakPagefileUsage (peak private commit), not a resident-set peak; each basis says exactly that.
    reported === null ? { dimension: "cpuMilliseconds", value: null, unit: "milliseconds", coverage: "unavailable", basis: "no_complete_ffmpeg_benchmark_report" }
      : { dimension: "cpuMilliseconds", value: reported.cpuMilliseconds, unit: "milliseconds", coverage: "ffmpeg_reported",
        basis: "ffmpeg_benchmark_win32_process_user_plus_kernel_time_self_reported_v0" },
    reported === null ? { dimension: "peakRamBytes", value: null, unit: "bytes", coverage: "unavailable", basis: "no_complete_ffmpeg_benchmark_report" }
      : { dimension: "peakRamBytes", value: reported.maxResidentKibibytes * 1024, unit: "bytes", coverage: "ffmpeg_reported",
        basis: "ffmpeg_benchmark_maxrss_win32_peak_pagefile_usage_self_reported_v0" },
    ruled ? { dimension: "gpuMilliseconds", value: 0, unit: "milliseconds", coverage: "not_applicable", basis: "software_codecs_and_filters_only_no_hardware_device_requested_v0" }
      : unruled("gpuMilliseconds", "milliseconds"),
    ruled ? { dimension: "peakVramBytes", value: 0, unit: "bytes", coverage: "not_applicable", basis: "software_codecs_and_filters_only_no_hardware_device_requested_v0" }
      : unruled("peakVramBytes", "bytes"),
    ruled ? { dimension: "apiSpendInrMicros", value: 0, unit: "inr_micros", coverage: "not_applicable", basis: "local_pinned_process_fd_only_protocols_no_provider_or_api_v0" }
      : unruled("apiSpendInrMicros", "inr_micros"),
    // Not applicable to this local, non-metered execution, and never a zero: the row has no value.
    ruled ? { dimension: "totalCostInrMicros", value: null, unit: "inr_micros", coverage: "not_applicable",
      basis: "local_non_metered_execution_no_billable_provider_or_owner_cost_model_not_zero_v0" }
      : { dimension: "totalCostInrMicros", value: null, unit: "inr_micros", coverage: "unavailable", basis: "no_owner_approved_cost_model_for_this_execution_v0" },
    ruled ? { dimension: "modelCalls", value: 0, unit: "calls", coverage: "not_applicable", basis: "no_model_invoked_v0" } : unruled("modelCalls", "calls"),
    { dimension: "frames", value: work.frames, unit: "frames", coverage: "derived", basis: "accepted_dag_output_frames_v0" },
    { dimension: "pixelFrames", value: work.pixelFrames, unit: "pixel_frames", coverage: "derived", basis: "output_frames_times_output_resolution_v0" },
    { dimension: "audioMilliseconds", value: work.audioMilliseconds, unit: "milliseconds", coverage: "derived", basis: "linked_audio_samples_ceiling_milliseconds_v0" },
    m.outputBytes === null ? { dimension: "outputBytes", value: null, unit: "bytes", coverage: "unavailable", basis: "no_verified_output_object" }
      : { dimension: "outputBytes", value: m.outputBytes, unit: "bytes", coverage: "measured", basis: "exact_verified_output_object_bytes_v0" },
  ];
  const dimensions = rows.map(row => {
    const reserved = row.dimension === "outputBytes" ? null : ceilings[row.dimension as keyof Ceilings];
    return { ...row, reserved, withinReservation: row.value === null || reserved === null ? null : row.value <= reserved };
  });
  // PASS needs truthful coverage in every dimension: measured or derived, or, only under the ruling, proven not applicable or FFmpeg's own
  // report for exactly the two dimensions the ruling accepts. Any exceeded ceiling fails, whatever the coverage.
  const accepted = (d: Row) => d.coverage === "measured" || d.coverage === "derived" || (ruled && (d.coverage === "not_applicable"
    || (d.coverage === "ffmpeg_reported" && (LOCAL_RULING.acceptedFfmpegReported as readonly string[]).includes(d.dimension))));
  const status = dimensions.some(d => d.withinReservation === false) ? "FAIL" as const : dimensions.every(accepted) ? "PASS" as const : "PARTIAL" as const;
  return { dimensions, status, ruling: ruled ? LOCAL_RULING.rulingId : NO_RULING,
    statusRule: "pass_only_if_every_dimension_is_measured_derived_not_applicable_or_owner_ruled_ffmpeg_reported_and_within_its_reservation_v1" };
}
export function deriveAccounting(input: { program: RenderProgram; reservation: Reservation; measurements: Measurements }): Accounting {
  const program = requireProgram(input.program);
  return accountingFrom(input.measurements, ceilingsOf(input.reservation), workOf(program), executionOf(program));
}

// ---------------------------------------------------------------- the durable execution start
const ClaimBindingSchema = z.strictObject({ claimId: IdSchema, claimTargetId: IdSchema });
const StartBodySchema = z.strictObject({ ...envelope("RenderExecutionStart"), scope: ScopeSchema, claim: ClaimBindingSchema, claimTarget: ClaimTargetSchema, bindingId: IdSchema,
  programId: IdSchema, renderComputationId: IdSchema, startedAt: TimestampSchema, recorder: RenderImplementationSchema,
  basis: z.literal("first_exclusive_publication_owns_claim_execution_v0") });
export const RenderExecutionStartSchema = StartBodySchema.extend({ startId: IdSchema }).refine(v => checkIdentity(v, "startId", "render_execution_start_v0"),
  "Render execution start identity mismatch.");
export type RenderExecutionStart = z.infer<typeof RenderExecutionStartSchema>;
/** The record whose no-overwrite publication consumes the claim's one execution; it is made only inside the permit window. */
export function buildExecutionStart(input: { binding: ExecutablePermitBinding; startedAt: string }): RenderExecutionStart {
  const binding = parse(ExecutablePermitBindingSchema, input.binding, "permit_required");
  check(binding.authorizedAt <= input.startedAt && input.startedAt < binding.validUntil, "permit_expired", "Execution may start only inside the permit window.");
  return parse(RenderExecutionStartSchema, identify("render_execution_start_v0", "startId", { ...header("RenderExecutionStart"), scope: binding.scope,
    claim: { claimId: binding.claim.claimId, claimTargetId: binding.claim.claimTargetId }, claimTarget: binding.claimTarget, bindingId: binding.bindingId,
    programId: binding.program.programId, renderComputationId: binding.renderComputationId, startedAt: input.startedAt, recorder: RENDER_IMPLEMENTATION,
    basis: "first_exclusive_publication_owns_claim_execution_v0" }));
}

// ---------------------------------------------------------------- receipts
/** No backslash or slash can appear, so no local path or URL can survive into a record; colons (ffmpeg's own labels) may. */
const SAFE_LINE = /^[A-Za-z0-9 _.,:;=()[\]@+%<>#'"|*!?-]{0,160}$/;
/** A bounded excerpt of path-free diagnostic lines; anything that could carry a location, URL or control character is dropped. */
export function sanitizeDiagnostics(stderr: string): string[] {
  return stderr.split(/\r?\n/).map(line => line.trim()).filter(line => line !== "" && line.length <= MAX_EXCERPT_LINE_LENGTH && SAFE_LINE.test(line) && !/:\\|\\\\|\/\/|\bfile:|https?|\bfd:/i.test(line))
    .slice(-MAX_EXCERPT_LINES);
}
const DiagnosticsSchema = z.strictObject({ capturedBytes: z.number().int().nonnegative().safe(), sha256: HashSchema, truncated: z.boolean(),
  excerpt: z.array(z.string().regex(SAFE_LINE)).max(MAX_EXCERPT_LINES) });
export type Diagnostics = z.infer<typeof DiagnosticsSchema>;
export const diagnosticsOf = (captured: Uint8Array, truncated: boolean): Diagnostics =>
  ({ capturedBytes: captured.length, sha256: sha256(captured), truncated, excerpt: sanitizeDiagnostics(new TextDecoder().decode(captured)) });
const ProcessSchema = z.strictObject({ spawnedAt: TimestampSchema, completedAt: TimestampSchema, exitCode: z.number().int().safe().nullable(),
  signal: z.string().regex(/^SIG[A-Z0-9]{1,12}$/).nullable(), timedOut: z.boolean(), timeoutMilliseconds: PositiveSafeInt, outputByteBound: PositiveSafeInt, argvDigest: HashSchema,
  argvCount: PositiveSafeInt, executable: z.literal("pinned_ffmpeg_reverified_by_digest_immediately_before_spawn") }).refine(v => v.spawnedAt <= v.completedAt, "A process ends after it starts.");
export interface ProcessEvidence { spawnedAt: string; completedAt: string; exitCode: number | null; signal: string | null; timedOut?: boolean; timeoutMilliseconds: number;
  outputByteBound: number; argvDigest: string; argvCount: number }
const lineageShape = {
  scope: ScopeSchema, logicalOperation: z.strictObject({ operationId: IdSchema, attempt: PositiveSafeInt }),
  attemptRegistration: z.strictObject({ registrationId: IdSchema, attemptSlotId: IdSchema }),
  claim: z.strictObject({ claimId: IdSchema, claimTargetId: IdSchema, claimedAt: TimestampSchema }), claimTarget: ClaimTargetSchema,
  dag: z.strictObject({ dagId: IdSchema, artifact: ArtifactRefSchema }), editGraph: z.strictObject({ editGraphId: IdSchema, revision: z.literal(0) }),
  admission: z.strictObject({ admissionId: IdSchema, artifact: ArtifactRefSchema }), executionGrant: z.strictObject({ grantId: IdSchema, artifact: ArtifactRefSchema }),
  renderComputationId: IdSchema, renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema,
  executor: ExecutionExecutorIdentitySchema, environment: IdSchema, runtime: RuntimeIdentitySchema,
  runtimeBinary: z.strictObject({ runtimeProbeId: IdSchema, ffmpegSha256: HashSchema, ffmpegReportedVersion: LocationFreeVersionSchema, buildConfigurationDigest: HashSchema,
    ffprobeSha256: HashSchema, ffprobeReportedVersion: LocationFreeVersionSchema }),
  rendererSemantics: z.strictObject({ version: z.literal(RENDER_SEMANTICS.semanticsVersion), digest: HashSchema }), program: z.strictObject({ programId: IdSchema }),
  encoding: z.strictObject({ video: VideoEncodingSchema, audio: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }),
    z.strictObject({ state: z.literal("encoded"), codecFamily: z.literal("aac"), sampleRateHz: PositiveSafeInt, channelLayout: z.enum(["mono", "stereo"]) })]) }),
  permitBinding: z.strictObject({ bindingId: IdSchema, authorizedAt: TimestampSchema, validUntil: TimestampSchema }),
  measurements: MeasurementsSchema, reservationCeilings: CeilingsSchema, work: WorkSchema, accounting: AccountingSchema, diagnostics: DiagnosticsSchema,
  recorder: RenderImplementationSchema,
};
const InputEvidenceSchema = z.strictObject({ assetId: IdSchema, stagedObjectId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt });
const ReceiptBodySchema = z.strictObject({
  ...envelope("RenderExecutionReceipt"), ...lineageShape, outcome: z.literal("succeeded"),
  executionStart: z.strictObject({ startId: IdSchema, startedAt: TimestampSchema }),
  inputs: z.array(InputEvidenceSchema.extend({ verification: z.literal("fresh_handle_full_sha256_immediately_before_spawn_and_after_exit"),
    handoff: z.literal("same_verified_handle_inherited_by_executor") })).min(1).max(16),
  inputReverification: z.literal("unchanged_after_exit"), process: ProcessSchema, recordedAt: TimestampSchema,
  output: z.strictObject({ outputArtifactId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, container: z.literal("mp4"),
    publication: z.enum(["published_by_this_execution", "existing_output_reverified"]), verification: z.literal("reopened_final_object_full_sha256_and_size") }),
  qc: z.literal("not_performed_by_renderer_independent_technical_qc_required"),
  basis: z.literal("real_pinned_ffmpeg_execution_verified_immutable_publication_v0"),
});
type ReceiptBody = z.infer<typeof ReceiptBodySchema>;
export const accountingOfReceipt = (r: { measurements: Measurements; reservationCeilings: Ceilings; work: Work } & AccountingExecution): Accounting =>
  accountingFrom(r.measurements, r.reservationCeilings, r.work, executionOf(r));
export const RenderExecutionReceiptSchema = ReceiptBodySchema.extend({ receiptId: IdSchema })
  .refine(v => v.process.exitCode === 0 && v.process.signal === null && !v.process.timedOut, "A success receipt needs a completed, zero-exit, untimed-out process.")
  .refine(v => v.output.outputArtifactId === outputArtifactIdOf(v.output) && v.measurements.outputBytes === v.output.sizeBytes, "The output identity is exactly its bytes.")
  .refine(v => equal(v.accounting, accountingOfReceipt(v)) && v.accounting.status !== "FAIL", "Accounting must replay from the receipt's own measurements and stay in reservation.")
  .refine(v => v.permitBinding.authorizedAt <= v.executionStart.startedAt && v.executionStart.startedAt < v.permitBinding.validUntil
    && v.executionStart.startedAt <= v.process.spawnedAt && v.process.completedAt <= v.recordedAt, "Execution starts inside the permit window, then the process runs, then the receipt.")
  .refine(v => checkIdentity(v, "receiptId", "render_execution_receipt_v0"), "Render execution receipt identity mismatch.");
export type RenderExecutionReceipt = z.infer<typeof RenderExecutionReceiptSchema>;

export const FAILURE_STAGES = ["permit_validation", "authority_recheck", "runtime_verification", "input_verification", "execution_start", "process", "input_reverification",
  "output_verification", "publication", "accounting", "receipt_certification"] as const;
const FailureCodeSchema = z.union([z.enum(EDIT_RENDER_ERROR_CODES), z.enum(EDIT_RUNTIME_ERROR_CODES)]);
/**
 * What a failure truthfully says about output: nothing published, or an object this execution itself linked under its content
 * identity that no success receipt certifies, either unverified (verification of the final object failed) or verified (the
 * execution evidence could not be certified afterwards). A failure never denies an output this execution published.
 */
const FailureOutputSchema = z.union([z.literal("none_published"), z.strictObject({
  state: z.enum(["linked_by_this_execution_unverified", "published_by_this_execution_uncertified"]), contentHash: HashSchema, sizeBytes: PositiveSafeInt,
  meaning: z.literal("this_execution_linked_an_object_under_this_content_identity_but_no_success_receipt_certifies_it_v0") })]);
export type FailureOutput = z.infer<typeof FailureOutputSchema>;
const FailureBodySchema = z.strictObject({
  ...envelope("RenderExecutionFailure"), ...lineageShape, outcome: z.literal("failed"), stage: z.enum(FAILURE_STAGES), failureCode: FailureCodeSchema,
  failureAuthority: z.enum(["edit_render", "edit_runtime"]), executionStarted: z.boolean(),
  executionStart: z.strictObject({ startId: IdSchema, startedAt: TimestampSchema }).nullable(),
  inputs: z.array(InputEvidenceSchema.extend({ verification: z.enum(["verified_before_spawn", "not_reached", "verification_failed"]) })).min(1).max(16),
  inputReverification: z.enum(["unchanged_after_exit", "changed_after_verification", "not_performed"]), process: ProcessSchema.nullable(), failedAt: TimestampSchema,
  output: FailureOutputSchema, basis: z.literal("real_pinned_ffmpeg_execution_failure_evidence_v0"),
});
export const RenderExecutionFailureSchema = FailureBodySchema.extend({ failureId: IdSchema })
  .refine(v => v.executionStarted === (v.executionStart !== null) && (v.process === null || v.executionStarted), "A process runs only after the execution start is recorded.")
  .refine(v => v.output === "none_published" || (v.executionStarted && v.process !== null && v.process.exitCode === 0 && v.measurements.outputBytes === v.output.sizeBytes
    && v.stage === (v.output.state === "linked_by_this_execution_unverified" ? "publication" : "receipt_certification")),
  "Only a completed execution that linked its own output names it, at the stage where certification stopped.")
  .refine(v => (v.failureAuthority === "edit_render") === (EDIT_RENDER_ERROR_CODES as readonly string[]).includes(v.failureCode), "The failure authority names its code's owner.")
  .refine(v => v.failureCode !== "process_timeout" || v.process?.timedOut === true, "A timeout failure records a timed-out process.")
  .refine(v => equal(v.accounting, accountingOfReceipt(v)), "Accounting must replay from the record's own measurements.")
  .refine(v => checkIdentity(v, "failureId", "render_execution_failure_v0"), "Render execution failure identity mismatch.");
export type RenderExecutionFailure = z.infer<typeof RenderExecutionFailureSchema>;

function lineageOf(bindingInput: ExecutablePermitBinding, programInput: RenderProgram, probeInput: RealRuntimeProbe, reservation: Reservation, measurements: Measurements,
  diagnostics: Diagnostics) {
  const binding = parse(ExecutablePermitBindingSchema, bindingInput, "permit_required"), program = requireProgram(programInput);
  const probe = parse(RealRuntimeProbeSchema, probeInput, "runtime_probe_invalid");
  check(binding.program.programId === program.programId && binding.runtimeProbe.probeId === probe.probeId && binding.reservation.reservationId === reservation.reservationId,
    "permit_required", "Receipt evidence must be the permit's own program, runtime probe and reservation.");
  check(probe.binaries.ffmpeg.reportedVersion !== null && probe.binaries.ffprobe.reportedVersion !== null, "runtime_probe_invalid", "An executed runtime reported its versions.");
  const ceilings = ceilingsOf(reservation), work = workOf(program);
  return { scope: binding.scope, logicalOperation: binding.logicalOperation, attemptRegistration: binding.attemptRegistration, claim: binding.claim, claimTarget: binding.claimTarget,
    dag: binding.dag, editGraph: { editGraphId: binding.editGraph.editGraphId, revision: binding.editGraph.revision }, admission: binding.admission,
    executionGrant: binding.executionGrant, renderComputationId: binding.renderComputationId, renderIntent: binding.renderIntent, renderProfile: binding.renderProfile,
    executor: binding.executor, environment: binding.environment, runtime: binding.runtime,
    runtimeBinary: { runtimeProbeId: probe.probeId, ffmpegSha256: probe.binaries.ffmpeg.sha256, ffmpegReportedVersion: probe.binaries.ffmpeg.reportedVersion!,
      buildConfigurationDigest: probe.binaries.ffmpeg.buildConfigurationDigest, ffprobeSha256: probe.binaries.ffprobe.sha256,
      ffprobeReportedVersion: probe.binaries.ffprobe.reportedVersion! },
    rendererSemantics: { version: RENDER_SEMANTICS.semanticsVersion, digest: program.semantics.digest }, program: { programId: program.programId },
    encoding: { video: program.output.video, audio: program.output.audio },
    permitBinding: { bindingId: binding.bindingId, authorizedAt: binding.authorizedAt, validUntil: binding.validUntil },
    measurements, reservationCeilings: ceilings, work, accounting: accountingFrom(measurements, ceilings, work, executionOf(binding)), diagnostics, recorder: RENDER_IMPLEMENTATION,
    binding };
}
const processOf = (p: ProcessEvidence) => ({ spawnedAt: p.spawnedAt, completedAt: p.completedAt, exitCode: p.exitCode, signal: p.signal, timedOut: p.timedOut ?? false,
  timeoutMilliseconds: p.timeoutMilliseconds, outputByteBound: p.outputByteBound, argvDigest: p.argvDigest, argvCount: p.argvCount,
  executable: "pinned_ffmpeg_reverified_by_digest_immediately_before_spawn" as const });
export function buildSuccessReceipt(input: { binding: ExecutablePermitBinding; start: RenderExecutionStart; program: RenderProgram; runtimeProbe: RealRuntimeProbe;
  reservation: Reservation; process: ProcessEvidence; measurements: Measurements; output: { contentHash: string; sizeBytes: number; publication: ReceiptBody["output"]["publication"] };
  diagnostics: Diagnostics; inputReverification: "unchanged_after_exit"; recordedAt: string }): RenderExecutionReceipt {
  const { binding, ...lineage } = lineageOf(input.binding, input.program, input.runtimeProbe, input.reservation, input.measurements, input.diagnostics);
  const start = parse(RenderExecutionStartSchema, input.start, "execution_start_corrupt");
  check(start.bindingId === binding.bindingId && start.claim.claimId === binding.claim.claimId, "execution_start_corrupt", "The start record belongs to another permit.");
  const body = { ...header("RenderExecutionReceipt"), ...lineage, outcome: "succeeded" as const, executionStart: { startId: start.startId, startedAt: start.startedAt },
    inputs: binding.sources.map(s => ({ assetId: s.assetId, stagedObjectId: s.stagedObjectId, contentHash: s.contentHash, sizeBytes: s.sizeBytes,
      verification: "fresh_handle_full_sha256_immediately_before_spawn_and_after_exit" as const, handoff: "same_verified_handle_inherited_by_executor" as const })),
    inputReverification: input.inputReverification, process: processOf(input.process), recordedAt: input.recordedAt,
    output: { outputArtifactId: outputArtifactIdOf(input.output), contentHash: input.output.contentHash, sizeBytes: input.output.sizeBytes, container: "mp4" as const,
      publication: input.output.publication, verification: "reopened_final_object_full_sha256_and_size" as const },
    qc: "not_performed_by_renderer_independent_technical_qc_required" as const, basis: "real_pinned_ffmpeg_execution_verified_immutable_publication_v0" as const };
  return parse(RenderExecutionReceiptSchema, identify("render_execution_receipt_v0", "receiptId", body), "output_verification_failed");
}
export function buildFailureReceipt(input: { binding: ExecutablePermitBinding; start: RenderExecutionStart | null; program: RenderProgram; runtimeProbe: RealRuntimeProbe;
  reservation: Reservation; stage: (typeof FAILURE_STAGES)[number]; failureCode: string; process: ProcessEvidence | null; measurements: Measurements; diagnostics: Diagnostics;
  inputVerification: "verified_before_spawn" | "not_reached" | "verification_failed"; inputReverification: "unchanged_after_exit" | "changed_after_verification" | "not_performed";
  failedAt: string; output?: FailureOutput }): RenderExecutionFailure {
  const { binding, ...lineage } = lineageOf(input.binding, input.program, input.runtimeProbe, input.reservation, input.measurements, input.diagnostics);
  const start = input.start === null ? null : parse(RenderExecutionStartSchema, input.start, "execution_start_corrupt");
  const renderCode = (EDIT_RENDER_ERROR_CODES as readonly string[]).includes(input.failureCode);
  const body = { ...header("RenderExecutionFailure"), ...lineage, outcome: "failed" as const, stage: input.stage, failureCode: input.failureCode,
    failureAuthority: renderCode ? "edit_render" as const : "edit_runtime" as const, executionStarted: start !== null,
    executionStart: start === null ? null : { startId: start.startId, startedAt: start.startedAt },
    inputs: binding.sources.map(s => ({ assetId: s.assetId, stagedObjectId: s.stagedObjectId, contentHash: s.contentHash, sizeBytes: s.sizeBytes, verification: input.inputVerification })),
    inputReverification: input.inputReverification, process: input.process === null ? null : processOf(input.process), failedAt: input.failedAt,
    output: input.output ?? ("none_published" as const), basis: "real_pinned_ffmpeg_execution_failure_evidence_v0" as const };
  return parse(RenderExecutionFailureSchema, identify("render_execution_failure_v0", "failureId", body), "input_invalid");
}
