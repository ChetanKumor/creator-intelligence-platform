/**
 * Phase 5 Gate 7 Batch 3A shared rules: owned refusal codes, strict envelopes and the hard bounds of editorial evidence and review. Nothing
 * here reads a clock, the environment, a filesystem, a process or a network. The core builds and validates evidence records; decoding lives
 * only in the audited adapter scripts/edit-observation-local.ts, and nothing here executes, repairs or edits anything.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalSerialize } from "../domain/serialization.js";
import { equal } from "../editorial/common.js";

export const EDIT_REVIEW_VERSION = "0.1.0" as const;
export const envelope = <const T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(EDIT_REVIEW_VERSION),
  stability: z.literal("internal_pre_stable") });
export const header = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: EDIT_REVIEW_VERSION, stability: "internal_pre_stable" as const });
/** The implementation identity every Batch-3A critic report binds. */
export const REVIEW_IMPLEMENTATION = { implementationId: "gate7_batch3a_edit_review", version: "0.1.0" } as const;

/**
 * Hard ceilings. An owner review policy chooses values inside them; nothing may exceed them. They bound evidence, not editorial choice, and
 * are implementation policy for Batch 3A, not architecture constants.
 */
export const REVIEW_HARD_LIMITS = Object.freeze({
  maxTranscriptEntries: 20_000, maxEntryTextCharacters: 64, maxAudioEventCharacters: 48, maxTranscriptTextBytes: 262_144, maxPhraseEntries: 64,
  maxAdditionalObservations: 8,
  maxBoundaryHalfWindowFrames: 120, maxGlobalWindowFrames: 240, maxInteriorSamples: 8,
  maxObservationWindowFrames: 240, maxFramesPerObservation: 16, maxWordsPerObservation: 256, maxObservationBytes: 1_048_576, maxDecodeOutputBytes: 64 * 1024 * 1024,
  thumbnailMaxEdge: 48,
  maxObservations: 64, maxDeliveredFrames: 1024, maxDecodedPixelFrames: 4_000_000_000, maxEvidenceBytes: 16 * 1024 * 1024,
  maxFindings: 64, maxExplanationCharacters: 400, maxReviewAttempts: 8, maxTranscriptCharacters: 65_536, maxDecodeMilliseconds: 120_000,
});

export const EDIT_REVIEW_ERROR_CODES = [
  "input_invalid", "scope_mismatch", "limit_exceeded",
  "transcript_invalid", "transcript_timing_invalid", "transcript_limit_exceeded", "transcript_pack_mismatch", "transcript_source_mismatch",
  "evidence_request_invalid",
  "review_policy_invalid", "review_plan_invalid", "review_plan_mismatch", "review_budget_exceeded", "review_attempts_exhausted",
  "render_receipt_invalid", "render_receipt_mismatch", "program_mismatch", "technical_qc_missing", "technical_qc_failed", "technical_qc_linkage_mismatch",
  "observation_request_invalid", "observation_decode_invalid", "observation_invalid", "observation_not_in_plan", "observation_cache_mismatch",
  "observation_tool_unavailable", "observation_media_missing", "observation_media_mismatch", "observation_media_changed", "observation_decode_failed",
  "critic_input_invalid", "critic_response_invalid", "critic_port_failed",
] as const;
export type EditReviewErrorCode = (typeof EDIT_REVIEW_ERROR_CODES)[number];
/** Every Batch-3A refusal carries one owned code; messages never carry a location. */
export class EditReviewError extends Error {
  constructor(public readonly code: EditReviewErrorCode, message: string) { super(message); this.name = "EditReviewError"; }
}
export function refuse(code: EditReviewErrorCode, message: string): never { throw new EditReviewError(code, message); }
export function check(condition: unknown, code: EditReviewErrorCode, message: string): asserts condition { if (!condition) refuse(code, message); }
/** Maps any foreign failure (schema, accepted Gate-6/7 layer) onto one owned code; a message that could carry a location is replaced. */
export function guard<T>(code: EditReviewErrorCode, run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof EditReviewError) throw error;
    const detail = error instanceof Error && !/[\\/]/.test(error.message) ? error.message.slice(0, 400) : "Invalid Gate-7 Batch-3A input.";
    const foreign = error instanceof Error && "code" in error && typeof error.code === "string" ? `${error.code}: ` : "";
    throw new EditReviewError(code, `${foreign}${detail}`);
  }
}
export function parse<S extends z.ZodType>(schema: S, value: unknown, code: EditReviewErrorCode = "input_invalid"): z.output<S> {
  return guard(code, () => schema.parse(value));
}
/** A supplied record must already be canonical: parsing may not reorder or rewrite what its identity addresses. */
export function parseCanonical<S extends z.ZodType>(schema: S, value: unknown, code: EditReviewErrorCode = "input_invalid"): z.output<S> {
  const parsed = parse(schema, value, code);
  check(equal(parsed, value), code, "The record is not in canonical form.");
  return parsed;
}
export const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
export const digestOf = (value: unknown): string => sha256(canonicalSerialize(value));
export const byteLengthOf = (value: unknown): number => new TextEncoder().encode(canonicalSerialize(value)).length;
/** Exact comparisons of an integer tick instant (ticks / tps) with a frame instant (frame * den / num), by integer cross products only. */
export interface FrameGrid { numerator: number; denominator: number }
export const ticksBeforeFrame = (ticks: number, tps: number, frame: number, grid: FrameGrid): boolean =>
  BigInt(ticks) * BigInt(grid.numerator) < BigInt(frame) * BigInt(grid.denominator) * BigInt(tps);
export const ticksAfterFrame = (ticks: number, tps: number, frame: number, grid: FrameGrid): boolean =>
  BigInt(ticks) * BigInt(grid.numerator) > BigInt(frame) * BigInt(grid.denominator) * BigInt(tps);
/** Sorted, unique integers. */
export const sortedUnique = (values: readonly number[]): number[] => [...new Set(values)].sort((a, b) => a - b);
export const isSortedUnique = (values: readonly number[]): boolean => values.every((v, i) => i === 0 || values[i - 1]! < v);
/** A deep-frozen structured copy: data only, no shared references and no way to mutate what a callee is handed. */
export function frozenCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}
