/** Phase 5 Gate 6 shared records: strict envelopes, exact supplied artifacts and explicit owned refusal codes. */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EvidenceRefSchema, compareText, equal, exactDigest, type ArtifactRef, type EditorialArtifactMap, type EvidenceRef, type SuppliedArtifact } from "../editorial/common.js";

export const EDIT_GRAPH_VERSION = "0.1.0" as const;
export const envelope = <const T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(EDIT_GRAPH_VERSION), stability: z.literal("internal_pre_stable") });
export const header = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: EDIT_GRAPH_VERSION, stability: "internal_pre_stable" as const });
export const ScopeSchema = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, purpose: IdSchema });
export type Scope = z.infer<typeof ScopeSchema>;
export const OwnerSchema = z.strictObject({ kind: z.literal("owner"), actorId: IdSchema });
export const Nat = z.number().int().nonnegative().safe();
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const AspectSchema = z.strictObject({ width: z.number().int().min(1).max(10000), height: z.number().int().min(1).max(10000) });
export const ResolutionBoundsSchema = z.strictObject({ width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384) });
export const FrameRateBoundsSchema = z.strictObject({ numerator: z.number().int().min(1).max(240000), denominator: z.number().int().min(1).max(1001) });
export const ClockSchema = z.strictObject({ ticksPerSecond: z.number().int().min(1).max(1_000_000_000) });
/** Declared sets are canonical: duplicates fail and order never changes identity. */
export const idSet = (maximum: number, minimum = 0) => z.array(IdSchema).min(minimum).max(maximum)
  .refine(values => new Set(values).size === values.length, "Duplicate IDs.").transform(values => [...values].sort(compareText));
export const evidenceSet = (maximum: number, minimum = 0) => z.array(EvidenceRefSchema).min(minimum).max(maximum)
  .refine(values => new Set(values.map(canonicalSerialize)).size === values.length, "Duplicate evidence.")
  .transform(values => [...values].sort((a, b) => compareText(canonicalSerialize(a), canonicalSerialize(b))));
export const refSet = (maximum: number) => z.array(ArtifactRefSchema).max(maximum)
  .refine(values => new Set(values.map(v => v.objectId)).size === values.length, "Duplicate artifact refs.")
  .transform(values => [...values].sort((a, b) => compareText(a.objectId, b.objectId)));

export const EDIT_GRAPH_ERROR_CODES = ["input_invalid", "scope_mismatch", "planning_outcome_not_chosen", "planning_lineage_invalid", "technique_resolution_invalid",
  "capability_snapshot_invalid", "time_not_representable", "limit_exceeded", "graph_replay_mismatch", "report_replay_mismatch"] as const;
export type EditGraphErrorCode = (typeof EDIT_GRAPH_ERROR_CODES)[number];
/** Every Gate-6 rejection carries an owned code; integrity failures and legitimate refusals stay distinguishable. */
export class EditGraphError extends Error {
  constructor(public readonly code: EditGraphErrorCode, message: string) { super(message); this.name = "EditGraphError"; }
}
export function refuse(code: EditGraphErrorCode, message: string): never { throw new EditGraphError(code, message); }
export function check(condition: unknown, code: EditGraphErrorCode, message: string): asserts condition { if (!condition) refuse(code, message); }
/** Maps foreign failures (schema, missing artifact, accepted-gate replay) onto one owned code without hiding owned codes. */
export function guard<T>(code: EditGraphErrorCode, run: () => T): T {
  try { return run(); } catch (error) {
    if (error instanceof EditGraphError) throw error;
    throw new EditGraphError(code, error instanceof Error ? error.message : "Invalid Gate-6 input.");
  }
}
export function parse<S extends z.ZodType>(schema: S, value: unknown, code: EditGraphErrorCode = "input_invalid"): z.output<S> {
  return guard(code, () => schema.parse(value));
}
/** A supplied artifact must already be canonical: parsing may not reorder or rewrite what its exact bytes and pointers address. */
export function parseCanonical<S extends z.ZodType>(schema: S, value: unknown, code: EditGraphErrorCode = "input_invalid"): z.output<S> {
  const parsed = parse(schema, value, code);
  check(equal(parsed, value), code, "Supplied artifact bytes must already be in canonical form.");
  return parsed;
}
export function exactArtifact(map: EditorialArtifactMap, refInput: unknown, kind: string, version: string = EDIT_GRAPH_VERSION, code: EditGraphErrorCode = "input_invalid"): unknown {
  return guard(code, () => {
    const ref = ArtifactRefSchema.parse(refInput);
    check(ref.artifactType === kind && ref.artifactVersion === version, code, `Exact ${kind} ${version} reference required.`);
    return map.get(ref);
  });
}
export const sameScope = (a: Scope, b: Scope): boolean => equal(a, b);
export const at = (artifact: ArtifactRef, pointer: string): EvidenceRef => ({ artifact, pointer });
/** Exact canonical bytes for an owned result; no persistence, path or ambient state. */
export function supplied(value: { artifactType: string; artifactVersion: string }, objectId: string): SuppliedArtifact {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  return { ref: { objectId, artifactType: value.artifactType, artifactVersion: value.artifactVersion, sha256: exactDigest(bytes) }, bytes, value: structuredClone(value) };
}

/**
 * The output clock is an exact integer tick authority. A trusted source instant is accepted only when its tick encoding
 * decodes to the identical Gate-5 number: no rounding, FPS multiplication or precision upgrade.
 */
export function exactTicks(seconds: number, ticksPerSecond: number): number | undefined {
  const ticks = Math.round(seconds * ticksPerSecond);
  return Number.isSafeInteger(ticks) && ticks >= 0 && ticks / ticksPerSecond === seconds ? ticks : undefined;
}
/** Integer ceiling for nonnegative safe integers, corrected so floating division cannot understate it. */
export function ceilDivide(numerator: number, denominator: number): number {
  let quotient = Math.floor(numerator / denominator);
  while (quotient * denominator > numerator) quotient--;
  while ((quotient + 1) * denominator <= numerator) quotient++;
  return quotient * denominator === numerator ? quotient : quotient + 1;
}
