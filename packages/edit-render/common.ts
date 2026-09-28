/**
 * Phase 5 Gate 7 Batch 2B shared rules: owned refusal codes, strict envelopes, conservative limits, check timing and ephemeral-session
 * proofs. Nothing here reads a clock, the environment, a filesystem, a process or a network. The pure core compiles, validates and
 * records; every side effect (probing, spawning, publishing) lives in explicitly audited adapters under scripts/.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { TimestampSchema } from "../contracts/common.js";
import { equal } from "../editorial/common.js";
import { HashSchema } from "../edit-graph/common.js";
import { EditRuntimeError } from "../edit-runtime/common.js";

export const EDIT_RENDER_VERSION = "0.1.0" as const;
export const envelope = <const T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(EDIT_RENDER_VERSION),
  stability: z.literal("internal_pre_stable") });
export const header = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: EDIT_RENDER_VERSION, stability: "internal_pre_stable" as const });
/** The implementation identity every Batch-2B record binds as its recorder. */
export const RENDER_IMPLEMENTATION = { implementationId: "gate7_batch2b_edit_render", version: "0.1.0" } as const;
export const RenderImplementationSchema = z.strictObject({ implementationId: z.literal(RENDER_IMPLEMENTATION.implementationId), version: z.literal(RENDER_IMPLEMENTATION.version) });

// ---------------------------------------------------------------- conservative limits
export const MAX_RENDER_SOURCES = 16;
/** The largest argv the compiler emits, and the largest generated filter graph. */
export const MAX_FFMPEG_ARGUMENTS = 256, MAX_FILTERGRAPH_BYTES = 16_384;
/** The largest probe output parsed (one staged source's full frame listing at the accepted 72 000-frame bound fits well inside). */
export const MAX_PROBE_OUTPUT_BYTES = 16 * 1024 * 1024;
/** Captured diagnostics: bytes kept for digesting, and the bounded sanitized excerpt a record may carry. */
export const MAX_CAPTURED_DIAGNOSTIC_BYTES = 262_144, MAX_EXCERPT_LINES = 12, MAX_EXCERPT_LINE_LENGTH = 160;
export const MAX_RECORD_BYTES = 262_144;

export const EDIT_RENDER_ERROR_CODES = [
  "input_invalid", "scope_mismatch", "limit_exceeded", "evidence_chronology_invalid", "claim_mismatch", "policy_invalid",
  "execution_dag_invalid", "render_program_unsupported", "render_program_invalid", "render_program_mismatch", "source_frame_grid_unsupported", "source_timebase_mismatch",
  "source_trim_invalid", "audio_sample_boundary_not_exact", "audio_coverage_unsupported", "source_geometry_unsupported",
  "runtime_config_invalid", "runtime_binary_missing", "runtime_binary_not_regular", "runtime_binary_mismatch", "runtime_version_mismatch", "runtime_environment_mismatch",
  "runtime_identity_mismatch", "executor_identity_mismatch", "encoder_unavailable", "runtime_probe_failed", "runtime_probe_invalid", "runtime_probe_mismatch",
  "runtime_probe_stale",
  "capability_probe_invalid", "capability_probe_mismatch", "capability_probe_stale", "capability_unavailable",
  "evidence_provenance_unsupported", "evidence_session_mismatch", "trust_handle_required",
  "lifecycle_authority_unknown_asset", "lifecycle_authority_scope_invalid", "lifecycle_observation_invalid", "lifecycle_observation_missing", "lifecycle_stale",
  "lifecycle_deleted", "lifecycle_expired",
  "probe_output_invalid", "probe_output_oversized", "input_conformance_failed", "input_conformance_invalid", "input_conformance_missing", "input_conformance_stale",
  "source_audio_missing", "source_audio_format_unsupported", "source_audio_alignment_unsupported", "source_audio_insufficient", "source_video_nonconforming",
  "source_stream_layout_unsupported",
  "staged_source_invalid", "staged_source_missing",
  "permit_required", "permit_expired", "permit_consumed", "permit_not_serializable", "execution_already_started", "execution_start_corrupt",
  "execution_interrupted", "execution_evidence_unrecordable",
  "staged_input_corrupt", "staged_input_mutated_during_execution",
  "spawn_failed", "process_timeout", "process_nonzero_exit", "process_signaled", "process_termination_unconfirmed",
  "output_missing", "output_empty", "output_oversized", "output_verification_failed", "output_publication_corrupt", "render_store_invalid", "render_storage_unavailable",
  "reservation_consumption_exceeded",
  "qc_receipt_invalid", "qc_output_missing", "qc_tool_unavailable",
  // Gate 7 Batch 3B localized execution: trusted segment reuse and its failure truth.
  "segment_reuse_authority_invalid", "segment_artifact_mismatch", "segment_artifact_corrupt", "segment_artifact_conflict", "segment_store_invalid",
  "segment_store_bound_exceeded", "segment_stage_output_invalid", "segment_input_mutated_during_execution",
] as const;
export type EditRenderErrorCode = (typeof EDIT_RENDER_ERROR_CODES)[number];
export const EditRenderErrorCodeSchema = z.enum(EDIT_RENDER_ERROR_CODES);
/** Every Batch-2B refusal carries one owned code; messages never carry a location. */
export class EditRenderError extends Error {
  constructor(public readonly code: EditRenderErrorCode, message: string) { super(message); this.name = "EditRenderError"; }
}
export function refuse(code: EditRenderErrorCode, message: string): never { throw new EditRenderError(code, message); }
export function check(condition: unknown, code: EditRenderErrorCode, message: string): asserts condition { if (!condition) refuse(code, message); }
/** Maps a foreign failure onto one owned code without its detail (which may carry a location); owned refusals of any Gate-7 layer pass through. */
export function guard<T>(code: EditRenderErrorCode, run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof EditRenderError || error instanceof EditRuntimeError) throw error;
    throw new EditRenderError(code, error instanceof Error && !/[\\/]/.test(error.message) ? error.message.slice(0, 400) : "Invalid Gate-7 Batch-2B input.");
  }
}
export function parse<S extends z.ZodType>(schema: S, value: unknown, code: EditRenderErrorCode = "input_invalid"): z.output<S> {
  return guard(code, () => schema.parse(value));
}
/** A supplied record must already be canonical: parsing may not reorder or rewrite what its identity addresses. */
export function parseCanonical<S extends z.ZodType>(schema: S, value: unknown, code: EditRenderErrorCode = "input_invalid"): z.output<S> {
  const parsed = parse(schema, value, code);
  check(equal(parsed, value), code, "The record is not in canonical form.");
  return parsed;
}
export const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

// ---------------------------------------------------------------- check timing and ephemeral-session proofs
/**
 * When a check's observation applies, measured on the trusted runtime clock around the probe or query: the observation instant lies
 * inside the window, and an unreported instant is recorded at the window start as a conservative lower bound (the Batch-2A rule).
 */
export const OBSERVED_AT_BASES = ["check_started_lower_bound", "provider_reported_within_check_window"] as const;
export const CheckTimingSchema = z.strictObject({ checkStartedAt: TimestampSchema, observedAt: TimestampSchema, checkCompletedAt: TimestampSchema,
  observedAtBasis: z.enum(OBSERVED_AT_BASES) });
export type CheckTiming = z.infer<typeof CheckTimingSchema>;
export const orderedCheck = (v: CheckTiming) => v.checkStartedAt <= v.observedAt && v.observedAt <= v.checkCompletedAt
  && (v.observedAtBasis !== "check_started_lower_bound" || v.observedAt === v.checkStartedAt);
export const ORDERED_CHECK = "A check's observation instant lies inside its check window, and a lower-bound instant is the check start.";
/**
 * The digest of a fresh ephemeral token held only, in memory, by the trusted adapter handle that produced a record. A persisted
 * record proves nothing by itself: only the live handle holding the token can show the record is its own.
 */
export const SessionProofSchema = z.strictObject({ scheme: z.literal("sha256_of_ephemeral_session_token_v0"), digest: HashSchema });
export type SessionProof = z.infer<typeof SessionProofSchema>;
export const sessionProofOf = (token: string): SessionProof => ({ scheme: "sha256_of_ephemeral_session_token_v0", digest: sha256(token) });
