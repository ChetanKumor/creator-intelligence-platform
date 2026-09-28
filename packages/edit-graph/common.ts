/** Phase 5 Gate 6 shared records: strict envelopes, exact supplied artifacts and explicit owned refusal codes. */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EvidenceRefSchema, compareText, equal, exactDigest, type ArtifactRef, type EditorialArtifactMap, type EvidenceRef, type SuppliedArtifact } from "../editorial/common.js";

export const EDIT_GRAPH_VERSION = "0.1.0" as const;
/**
 * The EditGraph record's own schema version. 0.2.0 carries exact source time (Gate 7 Batch 3A-F); a 0.1.0 graph persisted float seconds
 * and is refused, never reinterpreted. Every other Gate-6 artifact keeps EDIT_GRAPH_VERSION.
 */
export const EDIT_GRAPH_RECORD_VERSION = "0.2.0" as const;
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
  "capability_snapshot_invalid", "time_not_representable", "limit_exceeded", "graph_replay_mismatch", "report_replay_mismatch", "graph_version_unsupported"] as const;
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
 * decodes to the identical Gate-5 number: no rounding, FPS multiplication or precision upgrade. (The exact legacy decoder below.)
 */
export function exactTicks(seconds: number, ticksPerSecond: number): number | undefined {
  return decodeLegacySeconds(seconds, rateOf(ticksPerSecond))?.value;
}
/** Integer ceiling for nonnegative safe integers, corrected so floating division cannot understate it. */
export function ceilDivide(numerator: number, denominator: number): number {
  let quotient = Math.floor(numerator / denominator);
  while (quotient * denominator > numerator) quotient--;
  while ((quotient + 1) * denominator <= numerator) quotient++;
  return quotient * denominator === numerator ? quotient : quotient + 1;
}

// ---------------------------------------------------------------- exact time (Gate 7 Batch 3A-F): the one authoritative temporal vocabulary
/**
 * An exact time is an integer count (`value`) of one explicit positive rational rate (`rate`, units per second, lowest terms). It denotes
 * exactly value × rate.denominator / rate.numerator seconds. Output ticks at the graph clock, frames at a frame rate, samples at a sample
 * rate and stream timestamps at 1/time_base are all exact times; persisted records keep their accepted integer fields and declare the rate
 * once. Comparison, arithmetic and conversion are exact (BigInt cross-products), and nothing is rounded unless an alignment is named.
 * Floating-point seconds are never authority: `secondsOf` derives them for display or a public float contract, and `decodeLegacySeconds`
 * is the only way a legacy float field enters exact time.
 */
/** Media-framework rationals use 32-bit signed components: every stream time base and frame rate fits, and so do every accepted clock and sample rate. */
export const MAX_RATE_COMPONENT = 2_147_483_647;
const RatePart = z.number().int().min(1).max(MAX_RATE_COMPONENT);
const gcdBig = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b !== 0n) [a, b] = [b, a % b]; return a; };
export const RateSchema = z.strictObject({ numerator: RatePart, denominator: RatePart })
  .refine(r => gcdBig(BigInt(r.numerator), BigInt(r.denominator)) === 1n, "A rate is a positive rational in lowest terms.");
export type Rate = z.infer<typeof RateSchema>;
export const ExactTimeSchema = z.strictObject({ value: z.number().int().safe(), rate: RateSchema });
export type ExactTime = z.infer<typeof ExactTimeSchema>;
export interface ExactRange { readonly start: ExactTime; readonly end: ExactTime }
/** Canonical instant: whole units of 1/n s with value and n coprime (zero is 0 at 1/1), so one rational number of seconds has one spelling. */
export const isCanonicalTime = (t: ExactTime): boolean => t.rate.denominator === 1 && gcdBig(BigInt(t.value), BigInt(t.rate.numerator)) === 1n;
export const CanonicalTimeSchema = ExactTimeSchema.refine(isCanonicalTime, "An exact instant is stored in canonical form.");
/** A source media instant: canonical, nonnegative, independent of any output clock. The endpoint authority (frame or candidate) is separate. */
export const SourceInstantSchema = CanonicalTimeSchema.refine(t => t.value >= 0, "Source media time is nonnegative.");
export const SourceRangeSchema = z.strictObject({ start: SourceInstantSchema, end: SourceInstantSchema })
  .refine(r => compareTimes(r.start, r.end) < 0, "A source range ends after it starts.");
export type SourceRange = z.infer<typeof SourceRangeSchema>;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
/** Every primitive validates its operands (self-review H2): a malformed count or rate is refused, never ordered, combined or rounded. */
function operand(t: ExactTime): ExactTime {
  const rate = t !== null && typeof t === "object" ? t.rate : undefined;
  check(rate !== null && typeof rate === "object" && Number.isSafeInteger(t.value) && Number.isSafeInteger(rate.numerator) && Number.isSafeInteger(rate.denominator)
    && rate.numerator >= 1 && rate.denominator >= 1 && rate.numerator <= MAX_RATE_COMPONENT && rate.denominator <= MAX_RATE_COMPONENT
    && gcdBig(BigInt(rate.numerator), BigInt(rate.denominator)) === 1n, "input_invalid", "An exact time is a safe integer count of a positive rational rate in lowest terms.");
  return t;
}
/** A range is [start, end) with end at or after start (self-review H3); the empty range [t, t) is valid and contains nothing. */
function span(range: ExactRange): ExactRange {
  check(range !== null && typeof range === "object" && compareTimes(range.start, range.end) <= 0, "input_invalid", "A range ends at or after its start.");
  return range;
}
function safeValue(value: bigint): number {
  check(value <= MAX_SAFE && value >= -MAX_SAFE, "limit_exceeded", "An exact time exceeds safe-integer arithmetic.");
  return Number(value);
}
/** A validated rate in lowest terms from positive integers; the reduced spelling is the only spelling. */
export function rateOf(numerator: number, denominator = 1): Rate {
  check(Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && numerator > 0 && denominator > 0, "input_invalid", "A rate is a positive integer ratio.");
  const g = gcdBig(BigInt(numerator), BigInt(denominator)), n = BigInt(numerator) / g, d = BigInt(denominator) / g;
  check(n <= BigInt(MAX_RATE_COMPONENT) && d <= BigInt(MAX_RATE_COMPONENT), "limit_exceeded", "A rate component exceeds the rational bound.");
  return { numerator: Number(n), denominator: Number(d) };
}
export function exactTime(value: number, rate: Rate): ExactTime {
  check(Number.isSafeInteger(value), "limit_exceeded", "An exact time is a safe integer count.");
  return { value, rate: parse(RateSchema, rate) };
}
/** Output ticks on a declared clock, frames on a frame grid, samples at a sample rate, and stream timestamps at a time base (seconds per unit). */
export const tickTime = (ticks: number, ticksPerSecond: number): ExactTime => exactTime(ticks, rateOf(ticksPerSecond));
export const frameTime = (frame: number, frameRate: { numerator: number; denominator: number }): ExactTime => exactTime(frame, rateOf(frameRate.numerator, frameRate.denominator));
export const sampleTime = (sample: number, sampleRateHz: number): ExactTime => exactTime(sample, rateOf(sampleRateHz));
export const timestampTime = (pts: number, timeBase: { numerator: number; denominator: number }): ExactTime => exactTime(pts, rateOf(timeBase.denominator, timeBase.numerator));
/** Exact seconds as a reduced integer ratio: numerator / denominator. */
function ratio(t: ExactTime): { n: bigint; d: bigint } {
  operand(t);
  const n = BigInt(t.value) * BigInt(t.rate.denominator), d = BigInt(t.rate.numerator), g = gcdBig(n, d);
  return { n: n / g, d: d / g };
}
export function canonicalTime(t: ExactTime): ExactTime {
  const { n, d } = ratio(t);
  check(d <= BigInt(MAX_RATE_COMPONENT), "limit_exceeded", "The canonical rate exceeds the rational bound.");
  return { value: safeValue(n), rate: { numerator: Number(d), denominator: 1 } };
}
export function compareTimes(a: ExactTime, b: ExactTime): -1 | 0 | 1 {
  operand(a); operand(b);
  const left = BigInt(a.value) * BigInt(a.rate.denominator) * BigInt(b.rate.numerator), right = BigInt(b.value) * BigInt(b.rate.denominator) * BigInt(a.rate.numerator);
  return left < right ? -1 : left > right ? 1 : 0;
}
export const sameInstant = (a: ExactTime, b: ExactTime): boolean => compareTimes(a, b) === 0;
function combine(a: ExactTime, b: ExactTime, sign: 1n | -1n): ExactTime {
  operand(a); operand(b);
  if (a.rate.numerator === b.rate.numerator && a.rate.denominator === b.rate.denominator) return { value: safeValue(BigInt(a.value) + sign * BigInt(b.value)), rate: a.rate };
  const x = ratio(a), y = ratio(b), n = x.n * y.d + sign * y.n * x.d, d = x.d * y.d, g = gcdBig(n, d);
  check(d / g <= BigInt(MAX_RATE_COMPONENT), "limit_exceeded", "The combined rate exceeds the rational bound.");
  return { value: safeValue(n / g), rate: { numerator: Number(d / g), denominator: 1 } };
}
/** Exact sum and difference: on the shared rate when both operands have it, otherwise in canonical form. */
export const addTimes = (a: ExactTime, b: ExactTime): ExactTime => combine(a, b, 1n);
export const subtractTimes = (a: ExactTime, b: ExactTime): ExactTime => combine(a, b, -1n);
/** How a time that is not a whole number of target units is aligned. `exact` refuses; nothing rounds implicitly. */
export type Alignment = "exact" | "floor" | "ceil";
const ALIGNMENTS: readonly unknown[] = ["exact", "floor", "ceil"];
export function convertTime(t: ExactTime, rate: Rate, alignment: Alignment): ExactTime {
  // The policy is validated before it is consulted (self-review H1): an undeclared alignment never rounds, even where none is needed.
  check(ALIGNMENTS.includes(alignment), "input_invalid", "The alignment is exact, floor or ceil.");
  operand(t);
  const target = parse(RateSchema, rate);
  const n = BigInt(t.value) * BigInt(t.rate.denominator) * BigInt(target.numerator), d = BigInt(t.rate.numerator) * BigInt(target.denominator);
  const q = n / d, r = n % d;
  if (r === 0n) return { value: safeValue(q), rate: target };
  check(alignment !== "exact", "time_not_representable", "The instant is not a whole number of units at this rate; an explicit alignment is required.");
  // BigInt division truncates toward zero; floor and ceil are corrected by the remainder's sign.
  return { value: safeValue(alignment === "floor" ? (r < 0n ? q - 1n : q) : (r > 0n ? q + 1n : q)), rate: target };
}
/** Half-open [start, end) range semantics, exact. */
export const durationOf = (range: ExactRange): ExactTime => subtractTimes(span(range).end, range.start);
export const rangeContains = (range: ExactRange, t: ExactTime): boolean => compareTimes(span(range).start, t) <= 0 && compareTimes(t, range.end) < 0;
export function rangesAdjacent(a: ExactRange, b: ExactRange): boolean {
  span(a); span(b);
  return sameInstant(a.end, b.start) || sameInstant(b.end, a.start);
}
export function rangeIntersection(a: ExactRange, b: ExactRange): ExactRange | undefined {
  span(a); span(b);
  const start = compareTimes(a.start, b.start) >= 0 ? a.start : b.start, end = compareTimes(a.end, b.end) <= 0 ? a.end : b.end;
  return compareTimes(start, end) < 0 ? { start, end } : undefined;
}

const bitLength = (x: bigint): number => x.toString(2).length;
/** The IEEE-754 double nearest to n / d (d > 0), ties to even, from exact integers: no intermediate floating rounding. */
function nearestDouble(n: bigint, d: bigint): number {
  if (n === 0n) return 0;
  const negative = n < 0n, m = negative ? -n : n;
  let shift = 55 - (bitLength(m) - bitLength(d));
  const scaled = shift >= 0 ? m << BigInt(shift) : m, divisor = shift >= 0 ? d : d << BigInt(-shift);
  let q = scaled / divisor, sticky = scaled % divisor !== 0n;
  while (bitLength(q) > 54) { sticky ||= (q & 1n) === 1n; q >>= 1n; shift -= 1; }
  let mantissa = q >> 1n;
  if ((q & 1n) === 1n && (sticky || (mantissa & 1n) === 1n)) mantissa += 1n;
  const value = Number(mantissa) * 2 ** (1 - shift);
  return negative ? -value : value;
}
/**
 * Derived floating seconds of an exact time: the correctly rounded IEEE-754 double. For display, logs and public float contracts only;
 * it never becomes authority. Two exact integers whose quotient IEEE division already rounds correctly take the direct path.
 */
export function secondsOf(t: ExactTime): number {
  operand(t);
  const n = BigInt(t.value) * BigInt(t.rate.denominator);
  return n <= MAX_SAFE && n >= -MAX_SAFE ? Number(n) / t.rate.numerator : nearestDouble(n, BigInt(t.rate.numerator));
}
/** Exact decimal text of an exact time, floored at `fractionDigits` places. Display only. */
export function formatSeconds(t: ExactTime, fractionDigits: number): string {
  check(Number.isSafeInteger(fractionDigits) && fractionDigits >= 0 && fractionDigits <= 12, "input_invalid", "0 to 12 fraction digits.");
  const { n, d } = ratio(t), scale = 10n ** BigInt(fractionDigits), scaled = n * scale, units = scaled / d - (scaled % d < 0n ? 1n : 0n);
  const negative = units < 0n, digits = (negative ? -units : units).toString().padStart(fractionDigits + 1, "0");
  const whole = digits.slice(0, digits.length - fractionDigits), fraction = digits.slice(digits.length - fractionDigits);
  return `${negative ? "-" : ""}${whole}${fractionDigits > 0 ? `.${fraction}` : ""}`;
}
/** The exact value x = mantissa × 2^exponent of a finite nonnegative double. */
function doubleParts(x: number): { mantissa: bigint; exponent: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const high = view.getUint32(0), fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(view.getUint32(4)), biased = (high >>> 20) & 0x7ff;
  return biased === 0 ? { mantissa: fraction, exponent: -1074 } : { mantissa: fraction | (1n << 52n), exponent: biased - 1075 };
}
/**
 * The explicit legacy decoder: the only way a persisted float-second value enters exact time. `seconds` decodes at `rate` to the unique
 * whole count n whose exact time n/rate has `seconds` as its correctly rounded double; otherwise nothing decodes. NaN, infinities and
 * negative values never decode, and neither does a value too coarse to name one instant at this rate (the rate's unit is not larger than
 * the double's unit in the last place). The candidate count is derived from the exact binary value, never from floating multiplication.
 */
export function decodeLegacySeconds(seconds: number, rate: Rate): ExactTime | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const target = parse(RateSchema, rate), x = seconds === 0 ? 0 : seconds, { mantissa, exponent } = doubleParts(x);
  const num = BigInt(target.numerator), den = BigInt(target.denominator);
  // Unambiguous only when one unit (den/num s) exceeds the double's unit in the last place (2^exponent).
  if (!(exponent < 0 ? den << BigInt(-exponent) > num : den > num << BigInt(exponent))) return undefined;
  const n = exponent >= 0 ? mantissa * num << BigInt(exponent) : mantissa * num, d = exponent >= 0 ? den : den << BigInt(-exponent);
  const nearest = (2n * n + d) / (2n * d);
  const matches = [nearest - 1n, nearest, nearest + 1n].filter(c => c >= 0n && c <= MAX_SAFE && secondsOf({ value: Number(c), rate: target }) === x);
  return matches.length === 1 ? { value: Number(matches[0]!), rate: target } : undefined;
}
