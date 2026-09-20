import { z } from "zod";
import { FrameRateSchema, IdSchema, TimestampSchema } from "../contracts/common.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { contentId } from "../reference-analyzer/features.js";

export const ReferenceBenchmarkSchema = z.strictObject({
  manifestType: z.literal("ReferenceBoundaryBenchmark"), schemaVersion: z.literal("1.0.0"), benchmarkId: IdSchema,
  version: z.string().min(1).max(80), frozenAt: TimestampSchema, toleranceFrames: z.number().int().min(1).max(2),
  cases: z.array(z.strictObject({ contentHash: HashSchema, creatorGroupId: IdSchema, durationSeconds: z.number().positive().max(600), fps: FrameRateSchema,
    labelSource: z.enum(["synthetic_generated", "manually_reviewed"]), annotatorId: IdSchema, boundariesSeconds: z.array(z.number().finite().positive()).max(999) })).min(1).max(10000),
  casesDigest: IdSchema,
}).superRefine((manifest, ctx) => {
  if (new Set(manifest.cases.map((item) => item.contentHash)).size !== manifest.cases.length) ctx.addIssue({ code: "custom", message: "Benchmark asset identities must be unique." });
  for (const item of manifest.cases) if (item.boundariesSeconds.some((t, index) => t >= item.durationSeconds || (index > 0 && t <= item.boundariesSeconds[index - 1]!))) ctx.addIssue({ code: "custom", message: "Only strictly ordered internal cut boundaries are labels." });
});
export function verifyReferenceBenchmark(input: unknown) {
  const manifest = ReferenceBenchmarkSchema.parse(input);
  if (manifest.casesDigest !== contentId("benchmark", manifest.cases)) throw new Error("Frozen boundary benchmark digest mismatch.");
  return manifest;
}
export function boundaryMetrics(predicted: readonly number[], truth: readonly number[], toleranceSeconds: number) {
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds <= 0 || [...predicted, ...truth].some((t) => !Number.isFinite(t) || t <= 0)) throw new Error("Invalid boundary protocol.");
  for (const values of [predicted, truth]) if (values.some((t, index) => index > 0 && t <= values[index - 1]!)) throw new Error("Boundary arrays must be strictly ordered.");
  // Ordered earliest-feasible matching maximizes one-to-one matches within fixed tolerance.
  let p = 0, t = 0; const errors: number[] = [];
  while (p < predicted.length && t < truth.length) {
    const delta = predicted[p]! - truth[t]!;
    if (Math.abs(delta) <= toleranceSeconds + 1e-9) { errors.push(Math.abs(delta)); p++; t++; }
    else if (delta < 0) p++; else t++;
  }
  const truePositives = errors.length, falsePositives = predicted.length - errors.length, falseNegatives = truth.length - errors.length;
  const precision = predicted.length ? truePositives / predicted.length : null, recall = truth.length ? truePositives / truth.length : null;
  const denominator = 2 * truePositives + falsePositives + falseNegatives;
  return { toleranceSeconds, truePositives, falsePositives, falseNegatives, precision, recall, f1: denominator ? 2 * truePositives / denominator : null,
    meanAbsoluteTimingErrorSeconds: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null, maximumTimingErrorSeconds: errors.length ? Math.max(...errors) : null };
}
