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
import type { LocalizedExecutionPlan } from "./localized.js";
import type { Benchmark } from "./probe.js";

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
  dag: z.strictObject({ dagId: IdSchema, artifact: ArtifactRefSchema }), editGraph: z.strictObject({ editGraphId: IdSchema, revision: z.number().int().nonnegative().safe() }),
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
const OutputSchema = z.strictObject({ outputArtifactId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, container: z.literal("mp4"),
  publication: z.enum(["published_by_this_execution", "existing_output_reverified"]), verification: z.literal("reopened_final_object_full_sha256_and_size") });
const ReceiptBodySchema = z.strictObject({
  ...envelope("RenderExecutionReceipt"), ...lineageShape, outcome: z.literal("succeeded"),
  executionStart: z.strictObject({ startId: IdSchema, startedAt: TimestampSchema }),
  inputs: z.array(InputEvidenceSchema.extend({ verification: z.literal("fresh_handle_full_sha256_immediately_before_spawn_and_after_exit"),
    handoff: z.literal("same_verified_handle_inherited_by_executor") })).min(1).max(16),
  inputReverification: z.literal("unchanged_after_exit"), process: ProcessSchema, recordedAt: TimestampSchema,
  output: OutputSchema,
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

// ---------------------------------------------------------------- Gate 7 Batch 3B: segmented (localized) execution evidence, record version 0.2.0
/**
 * A segmented execution runs the same RenderProgram as per-segment stage processes and one assembly process. Version 0.1.0 keeps its exact
 * meaning (one process over the staged inputs); version 0.2.0 records every process, each segment's computed or reused intermediate and how
 * it was verified, which staged sources were consumed, and the per-process measurements whose aggregate the accepted accounting rule
 * replays. Reuse is measured, never zero-cost: verification bytes and time are counted, and the final assembly and encode always run.
 */
export const SEGMENTED_EXECUTION_VERSION = "0.2.0" as const;
export const SEGMENT_EXECUTION_SEMANTICS_VERSION = "segmented_render_execution_v0" as const;
const Count = z.number().int().nonnegative().safe();
const ArtifactIdentitySchema = z.strictObject({ contentHash: HashSchema, sizeBytes: PositiveSafeInt });
/** One segment's intermediate: its durable record, exact raw frames and (when linked) exact raw samples. */
export const SegmentArtifactRefSchema = z.strictObject({ recordId: IdSchema, video: ArtifactIdentitySchema, audio: ArtifactIdentitySchema.nullable() });
export type SegmentArtifactRef = z.infer<typeof SegmentArtifactRefSchema>;
const PriorSchema = z.strictObject({ receiptId: IdSchema, qcReceiptId: IdSchema, outputContentHash: HashSchema });
const StrategySchema = z.strictObject({ kind: z.literal("segmented_reuse_v0"), semantics: z.strictObject({ version: z.literal(SEGMENT_EXECUTION_SEMANTICS_VERSION), digest: HashSchema }),
  plan: z.strictObject({ planId: IdSchema, prior: PriorSchema.nullable() }) });
const SegmentEvidenceSchema = z.strictObject({ position: Count, segmentComputationId: IdSchema, planned: z.enum(["reuse_certified_artifact", "compute"]),
  disposition: z.enum(["computed_by_this_execution", "reused_verified_prior_artifact"]), artifact: SegmentArtifactRefSchema,
  publication: z.enum(["published_by_this_execution", "existing_artifact_reverified", "not_published_reused"]),
  verification: z.strictObject({ bytesHashed: Count, wallClockMilliseconds: Count, rule: z.literal("full_sha256_and_exact_size_through_held_handles_before_assembly_and_after_exit_v0") }) })
  .refine(s => (s.disposition === "reused_verified_prior_artifact") === (s.publication === "not_published_reused"), "Only a reused artifact is not published by this execution.")
  .refine(s => s.disposition === "computed_by_this_execution" || s.planned === "reuse_certified_artifact", "Only a planned reuse is reused.");
export type SegmentEvidence = z.infer<typeof SegmentEvidenceSchema>;
const ProcessEntrySchema = z.strictObject({ role: z.enum(["segment_stage", "assembly"]), position: Count.nullable(), process: ProcessSchema,
  measurements: z.strictObject({ wallClockMilliseconds: Count, benchmark: BenchmarkSchema.nullable() }), diagnostics: DiagnosticsSchema })
  .refine(p => (p.role === "assembly") === (p.position === null), "A stage renders one segment; the assembly renders the output.");
export type SegmentedProcessEntry = z.infer<typeof ProcessEntrySchema>;
const SEGMENTED_INPUT_USE = ["consumed_by_segment_stage", "not_consumed_every_segment_reused"] as const;
const ReuseSummarySchema = z.strictObject({ segments: PositiveSafeInt, reused: Count, computed: Count, reuseUnavailable: Count, stageProcesses: Count,
  assemblyProcesses: z.literal(1), reuseRatioPerMille: z.number().int().min(0).max(1000), verificationBytesHashed: Count, artifactBytesWritten: Count,
  reuseVerificationMilliseconds: Count, basis: z.literal("counted_from_this_receipt_segments_and_processes_v0") });
/** The one aggregation rule: wall and CPU times sum over the sequential processes, the peak is the largest single peak; any missing report is missing. */
export function aggregateMeasurements(processes: readonly { measurements: { wallClockMilliseconds: number; benchmark: z.infer<typeof BenchmarkSchema> | null } }[],
  outputBytes: number | null): Measurements {
  if (processes.length === 0) return { wallClockMilliseconds: null, benchmark: null, outputBytes };
  const sum = (pick: (b: z.infer<typeof BenchmarkSchema>) => number) => processes.reduce((n, p) => n + pick(p.measurements.benchmark!), 0);
  const complete = processes.every(p => p.measurements.benchmark !== null);
  return { wallClockMilliseconds: processes.reduce((n, p) => n + p.measurements.wallClockMilliseconds, 0), outputBytes,
    benchmark: complete ? { cpuMilliseconds: sum(b => b.cpuMilliseconds), userMilliseconds: sum(b => b.userMilliseconds), systemMilliseconds: sum(b => b.systemMilliseconds),
      realMilliseconds: sum(b => b.realMilliseconds), maxResidentKibibytes: Math.max(...processes.map(p => p.measurements.benchmark!.maxResidentKibibytes)) } : null };
}
/** The reuse counts a receipt states, recomputed from its own segments and processes. */
export function reuseSummaryOf(segments: readonly SegmentEvidence[], processes: readonly SegmentedProcessEntry[]): z.infer<typeof ReuseSummarySchema> {
  const reused = segments.filter(s => s.disposition === "reused_verified_prior_artifact"), computed = segments.filter(s => s.disposition === "computed_by_this_execution");
  const bytes = (a: SegmentArtifactRef) => a.video.sizeBytes + (a.audio?.sizeBytes ?? 0);
  return { segments: segments.length, reused: reused.length, computed: computed.length,
    reuseUnavailable: computed.filter(s => s.planned === "reuse_certified_artifact").length, stageProcesses: processes.filter(p => p.role === "segment_stage").length,
    assemblyProcesses: 1, reuseRatioPerMille: segments.length === 0 ? 0 : Math.floor((reused.length * 1000) / segments.length),
    verificationBytesHashed: segments.reduce((n, s) => n + s.verification.bytesHashed, 0),
    // Every computed segment's stage wrote its whole intermediate, whether its content-addressed name was new or already held identical bytes.
    artifactBytesWritten: computed.reduce((n, s) => n + bytes(s.artifact), 0),
    reuseVerificationMilliseconds: reused.reduce((n, s) => n + s.verification.wallClockMilliseconds, 0), basis: "counted_from_this_receipt_segments_and_processes_v0" };
}
const completed = (p: z.infer<typeof ProcessSchema>) => p.exitCode === 0 && p.signal === null && !p.timedOut;
/**
 * Stages first, one per computed segment and in timeline order, each after the last; then exactly one assembly. A complete execution has a
 * stage for exactly its computed segments; a failed one may end with one further stage whose segment was never verified.
 */
function processOrderIssue(segments: readonly SegmentEvidence[], processes: readonly SegmentedProcessEntry[], startedAt: string, complete: boolean): string | undefined {
  const stages = processes.filter(p => p.role === "segment_stage"), assembly = processes.filter(p => p.role === "assembly");
  if (!processes.every((p, i) => i === 0 || processes[i - 1]!.process.completedAt <= p.process.spawnedAt) || (processes[0] !== undefined && processes[0].process.spawnedAt < startedAt)) {
    return "Processes run one after another, inside the execution.";
  }
  const computed = segments.filter(s => s.disposition === "computed_by_this_execution").map(s => s.position), positions = stages.map(p => p.position!);
  if (!positions.every((p, i) => i === 0 || p > positions[i - 1]!) || !computed.every((p, i) => positions[i] === p)
    || positions.length > computed.length + (complete || assembly.length > 0 ? 0 : 1)) return "Each stage renders exactly one computed segment, in order.";
  if (assembly.length > 1 || (assembly.length === 1 && processes.at(-1)!.role !== "assembly") || (complete && assembly.length !== 1)) return "One assembly runs last.";
  return undefined;
}
const SegmentedInputSchema = InputEvidenceSchema.extend({ use: z.enum(SEGMENTED_INPUT_USE),
  verification: z.enum(["fresh_handle_full_sha256_before_each_consuming_stage_and_after_its_exit", "not_opened_not_consumed"]) })
  .refine(i => (i.use === "consumed_by_segment_stage") === (i.verification === "fresh_handle_full_sha256_before_each_consuming_stage_and_after_its_exit"),
    "A staged source is opened exactly when a stage consumes it.");
const SegmentedReceiptBodySchema = z.strictObject({
  artifactType: z.literal("RenderExecutionReceipt"), artifactVersion: z.literal(SEGMENTED_EXECUTION_VERSION), stability: z.literal("internal_pre_stable"),
  ...lineageShape, outcome: z.literal("succeeded"), executionStart: z.strictObject({ startId: IdSchema, startedAt: TimestampSchema }), strategy: StrategySchema,
  inputs: z.array(SegmentedInputSchema).min(1).max(16), inputReverification: z.literal("unchanged_after_exit"),
  segments: z.array(SegmentEvidenceSchema).min(1).max(16), processes: z.array(ProcessEntrySchema).min(1).max(17), reuse: ReuseSummarySchema, recordedAt: TimestampSchema,
  output: OutputSchema, qc: z.literal("not_performed_by_renderer_independent_technical_qc_required"),
  basis: z.literal("real_pinned_ffmpeg_segmented_execution_verified_immutable_publication_v0"),
});
export const SegmentedRenderExecutionReceiptSchema = SegmentedReceiptBodySchema.extend({ receiptId: IdSchema })
  .refine(v => v.processes.every(p => completed(p.process)), "A success receipt needs every process completed, zero-exit and untimed-out.")
  .refine(v => v.segments.every((s, i) => s.position === i), "Segments are listed in timeline order.")
  .refine(v => processOrderIssue(v.segments, v.processes, v.executionStart.startedAt, true) === undefined, "Stages run one per computed segment, then one assembly.")
  .refine(v => equal(v.reuse, reuseSummaryOf(v.segments, v.processes)), "The reuse summary is counted from this receipt.")
  .refine(v => equal(v.measurements, aggregateMeasurements(v.processes, v.output.sizeBytes)), "Measurements aggregate exactly this receipt's processes.")
  .refine(v => v.output.outputArtifactId === outputArtifactIdOf(v.output) && v.measurements.outputBytes === v.output.sizeBytes, "The output identity is exactly its bytes.")
  .refine(v => equal(v.accounting, accountingOfReceipt(v)) && v.accounting.status !== "FAIL", "Accounting must replay from the receipt's own measurements and stay in reservation.")
  .refine(v => v.permitBinding.authorizedAt <= v.executionStart.startedAt && v.executionStart.startedAt < v.permitBinding.validUntil
    && v.processes.at(-1)!.process.completedAt <= v.recordedAt, "Execution starts inside the permit window, then the processes run, then the receipt.")
  .refine(v => checkIdentity(v, "receiptId", "render_execution_receipt_v0"), "Render execution receipt identity mismatch.");
export type SegmentedRenderExecutionReceipt = z.infer<typeof SegmentedRenderExecutionReceiptSchema>;
/** Either success receipt version: 0.1.0 one-pass or 0.2.0 segmented. QC and review accept both; nothing else widens. */
export const AnyRenderExecutionReceiptSchema = z.union([RenderExecutionReceiptSchema, SegmentedRenderExecutionReceiptSchema]);
export type AnyRenderExecutionReceipt = RenderExecutionReceipt | SegmentedRenderExecutionReceipt;

export const SEGMENTED_FAILURE_STAGES = ["permit_validation", "authority_recheck", "runtime_verification", "reuse_planning", "segment_verification", "execution_start",
  "segment_input_verification", "segment_stage", "segment_output_verification", "segment_publication", "assembly", "input_reverification", "output_verification",
  "publication", "accounting", "receipt_certification"] as const;
const SegmentedFailureBodySchema = z.strictObject({
  artifactType: z.literal("RenderExecutionFailure"), artifactVersion: z.literal(SEGMENTED_EXECUTION_VERSION), stability: z.literal("internal_pre_stable"),
  ...lineageShape, outcome: z.literal("failed"), strategy: StrategySchema.nullable(), stage: z.enum(SEGMENTED_FAILURE_STAGES), failureCode: FailureCodeSchema,
  failureAuthority: z.enum(["edit_render", "edit_runtime"]), executionStarted: z.boolean(), executionStart: z.strictObject({ startId: IdSchema, startedAt: TimestampSchema }).nullable(),
  inputs: z.array(InputEvidenceSchema.extend({ verification: z.enum(["verified_before_consuming_stage", "not_reached", "verification_failed", "not_opened_not_consumed"]) }))
    .min(1).max(16),
  inputReverification: z.enum(["unchanged_after_exit", "changed_after_verification", "not_performed"]), segments: z.array(SegmentEvidenceSchema).max(16),
  processes: z.array(ProcessEntrySchema).max(17), failedAt: TimestampSchema, output: FailureOutputSchema,
  basis: z.literal("real_pinned_ffmpeg_segmented_execution_failure_evidence_v0"),
});
export const SegmentedRenderExecutionFailureSchema = SegmentedFailureBodySchema.extend({ failureId: IdSchema })
  .refine(v => v.executionStarted === (v.executionStart !== null) && (v.processes.length === 0 || v.executionStarted), "A process runs only after the execution start is recorded.")
  .refine(v => v.executionStart === null || processOrderIssue(v.segments, v.processes, v.executionStart.startedAt, false) === undefined, "Processes run in the recorded order.")
  .refine(v => v.output === "none_published" || (v.executionStarted && v.processes.at(-1)?.role === "assembly" && v.processes.at(-1)!.process.exitCode === 0
    && v.measurements.outputBytes === v.output.sizeBytes && v.stage === (v.output.state === "linked_by_this_execution_unverified" ? "publication" : "receipt_certification")),
  "Only a completed assembly that linked its own output names it, at the stage where certification stopped.")
  .refine(v => (v.failureAuthority === "edit_render") === (EDIT_RENDER_ERROR_CODES as readonly string[]).includes(v.failureCode), "The failure authority names its code's owner.")
  .refine(v => equal(v.measurements, aggregateMeasurements(v.processes, v.measurements.outputBytes)), "Measurements aggregate exactly this record's processes.")
  .refine(v => equal(v.accounting, accountingOfReceipt(v)), "Accounting must replay from the record's own measurements.")
  .refine(v => checkIdentity(v, "failureId", "render_execution_failure_v0"), "Render execution failure identity mismatch.");
export type SegmentedRenderExecutionFailure = z.infer<typeof SegmentedRenderExecutionFailureSchema>;

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

// ---------------------------------------------------------------- Gate 7 Batch 3B: segmented execution evidence builders
export interface SegmentedSegmentInput { position: number; disposition: SegmentEvidence["disposition"]; artifact: SegmentArtifactRef; publication: SegmentEvidence["publication"];
  verification: { bytesHashed: number; wallClockMilliseconds: number } }
export interface SegmentedProcessInput { role: "segment_stage" | "assembly"; position: number | null; process: ProcessEvidence; wallClockMilliseconds: number;
  benchmark: Benchmark | null; diagnostics: Diagnostics }
export interface SegmentedReceiptInput { binding: ExecutablePermitBinding; start: RenderExecutionStart; program: RenderProgram; runtimeProbe: RealRuntimeProbe;
  reservation: Reservation; plan: LocalizedExecutionPlan; segments: readonly SegmentedSegmentInput[]; processes: readonly SegmentedProcessInput[]; diagnostics: Diagnostics;
  output: { contentHash: string; sizeBytes: number; publication: "published_by_this_execution" | "existing_output_reverified" }; recordedAt: string }
export type SegmentedInputVerification = "verified_before_consuming_stage" | "not_reached" | "verification_failed" | "not_opened_not_consumed";
export interface SegmentedFailureInput { binding: ExecutablePermitBinding; start: RenderExecutionStart | null; program: RenderProgram; runtimeProbe: RealRuntimeProbe;
  reservation: Reservation; plan: LocalizedExecutionPlan | null; stage: (typeof SEGMENTED_FAILURE_STAGES)[number]; failureCode: string;
  segments: readonly SegmentedSegmentInput[]; processes: readonly SegmentedProcessInput[]; inputs: readonly { assetId: string; verification: SegmentedInputVerification }[];
  inputReverification: "unchanged_after_exit" | "changed_after_verification" | "not_performed"; diagnostics: Diagnostics; outputBytes: number | null; failedAt: string;
  output?: FailureOutput }
/** The plan a segmented record names must be intact (self-identified) and of exactly this program; its schema lives with the pure planner. */
function planOf(plan: LocalizedExecutionPlan, program: RenderProgram): LocalizedExecutionPlan {
  check(plan !== null && typeof plan === "object" && checkIdentity(plan, "planId", "localized_execution_plan_v0") && plan.program.programId === program.programId
    && plan.semantics.version === SEGMENT_EXECUTION_SEMANTICS_VERSION && plan.segments.length === program.segments.length
    && plan.segments.every((s, i) => s.position === i && s.segmentComputationId === program.segments[i]!.segmentComputationId), "input_invalid",
  "A segmented record names its own program's localized plan.");
  return plan;
}
const strategyOf = (plan: LocalizedExecutionPlan) => ({ kind: "segmented_reuse_v0" as const, semantics: { version: SEGMENT_EXECUTION_SEMANTICS_VERSION, digest: plan.semantics.digest },
  plan: { planId: plan.planId, prior: plan.prior } });
const VERIFICATION_RULE = "full_sha256_and_exact_size_through_held_handles_before_assembly_and_after_exit_v0" as const;
/**
 * Segment evidence in timeline order (every segment for a success; the verified ones for a failure), each bound to its program computation
 * and planned decision; a reuse is exactly the certified artifact.
 */
function segmentsOf(plan: LocalizedExecutionPlan, program: RenderProgram, inputs: readonly SegmentedSegmentInput[], complete: boolean): SegmentEvidence[] {
  return inputs.map((s, i) => {
    const planned = plan.segments[s.position];
    check(planned !== undefined && (complete ? s.position === i : i === 0 || s.position > inputs[i - 1]!.position), "input_invalid",
      "Segment evidence is listed in timeline order.");
    check(s.disposition === "computed_by_this_execution" || equal(s.artifact, planned.certified), "segment_artifact_mismatch", "A reused segment is exactly its certified artifact.");
    return { position: s.position, segmentComputationId: program.segments[s.position]!.segmentComputationId, planned: planned.decision, disposition: s.disposition,
      artifact: s.artifact, publication: s.publication, verification: { bytesHashed: s.verification.bytesHashed, wallClockMilliseconds: s.verification.wallClockMilliseconds,
        rule: VERIFICATION_RULE } };
  });
}
const processesOf = (inputs: readonly SegmentedProcessInput[]): SegmentedProcessEntry[] => inputs.map(p => ({ role: p.role, position: p.position, process: processOf(p.process),
  measurements: { wallClockMilliseconds: p.wallClockMilliseconds, benchmark: p.benchmark }, diagnostics: p.diagnostics }));
/** A staged source is opened exactly when a stage consumes it: when every segment that uses it is reused, it is never opened. */
function consumedAssets(program: RenderProgram, segments: readonly SegmentEvidence[]): Set<string> {
  return new Set(segments.filter(s => s.disposition === "computed_by_this_execution").map(s => program.inputs[program.segments[s.position]!.input]!.assetId));
}
export function buildSegmentedSuccessReceipt(input: SegmentedReceiptInput): SegmentedRenderExecutionReceipt {
  const program = requireProgram(input.program), plan = planOf(input.plan, program);
  check(input.segments.length === program.segments.length, "input_invalid", "Every segment of the program has evidence.");
  const segments = segmentsOf(plan, program, input.segments, true), processes = processesOf(input.processes);
  const measurements = aggregateMeasurements(processes, input.output.sizeBytes);
  const { binding, ...lineage } = lineageOf(input.binding, program, input.runtimeProbe, input.reservation, measurements, input.diagnostics);
  const start = parse(RenderExecutionStartSchema, input.start, "execution_start_corrupt");
  check(start.bindingId === binding.bindingId && start.claim.claimId === binding.claim.claimId, "execution_start_corrupt", "The start record belongs to another permit.");
  const consumed = consumedAssets(program, segments);
  const body = { artifactType: "RenderExecutionReceipt" as const, artifactVersion: SEGMENTED_EXECUTION_VERSION, stability: "internal_pre_stable" as const, ...lineage,
    outcome: "succeeded" as const, executionStart: { startId: start.startId, startedAt: start.startedAt }, strategy: strategyOf(plan),
    inputs: binding.sources.map(s => ({ assetId: s.assetId, stagedObjectId: s.stagedObjectId, contentHash: s.contentHash, sizeBytes: s.sizeBytes,
      use: consumed.has(s.assetId) ? "consumed_by_segment_stage" as const : "not_consumed_every_segment_reused" as const,
      verification: consumed.has(s.assetId) ? "fresh_handle_full_sha256_before_each_consuming_stage_and_after_its_exit" as const : "not_opened_not_consumed" as const })),
    inputReverification: "unchanged_after_exit" as const, segments, processes, reuse: reuseSummaryOf(segments, processes), recordedAt: input.recordedAt,
    output: { outputArtifactId: outputArtifactIdOf(input.output), contentHash: input.output.contentHash, sizeBytes: input.output.sizeBytes, container: "mp4" as const,
      publication: input.output.publication, verification: "reopened_final_object_full_sha256_and_size" as const },
    qc: "not_performed_by_renderer_independent_technical_qc_required" as const, basis: "real_pinned_ffmpeg_segmented_execution_verified_immutable_publication_v0" as const };
  return parse(SegmentedRenderExecutionReceiptSchema, identify("render_execution_receipt_v0", "receiptId", body), "output_verification_failed");
}
export function buildSegmentedFailureReceipt(input: SegmentedFailureInput): SegmentedRenderExecutionFailure {
  const program = requireProgram(input.program), plan = input.plan === null ? null : planOf(input.plan, program);
  check(plan !== null || input.segments.length === 0, "input_invalid", "Segment evidence needs its plan.");
  const segments = plan === null ? [] : segmentsOf(plan, program, input.segments, false), processes = processesOf(input.processes);
  const measurements = aggregateMeasurements(processes, input.outputBytes);
  const { binding, ...lineage } = lineageOf(input.binding, program, input.runtimeProbe, input.reservation, measurements, input.diagnostics);
  const start = input.start === null ? null : parse(RenderExecutionStartSchema, input.start, "execution_start_corrupt");
  check(start === null || (start.bindingId === binding.bindingId && start.claim.claimId === binding.claim.claimId), "execution_start_corrupt",
    "The start record belongs to another permit.");
  const verification = new Map(input.inputs.map(i => [i.assetId, i.verification]));
  const renderCode = (EDIT_RENDER_ERROR_CODES as readonly string[]).includes(input.failureCode);
  const body = { artifactType: "RenderExecutionFailure" as const, artifactVersion: SEGMENTED_EXECUTION_VERSION, stability: "internal_pre_stable" as const, ...lineage,
    outcome: "failed" as const, strategy: plan === null ? null : strategyOf(plan), stage: input.stage, failureCode: input.failureCode,
    failureAuthority: renderCode ? "edit_render" as const : "edit_runtime" as const, executionStarted: start !== null,
    executionStart: start === null ? null : { startId: start.startId, startedAt: start.startedAt },
    inputs: binding.sources.map(s => ({ assetId: s.assetId, stagedObjectId: s.stagedObjectId, contentHash: s.contentHash, sizeBytes: s.sizeBytes,
      verification: verification.get(s.assetId) ?? "not_reached" as const })),
    inputReverification: input.inputReverification, segments, processes, failedAt: input.failedAt, output: input.output ?? ("none_published" as const),
    basis: "real_pinned_ffmpeg_segmented_execution_failure_evidence_v0" as const };
  return parse(SegmentedRenderExecutionFailureSchema, identify("render_execution_failure_v0", "failureId", body), "input_invalid");
}
