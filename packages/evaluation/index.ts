import { createHash } from "node:crypto";
import { z } from "zod";
import { CostEventSchema, FeedbackEventSchema, IdSchema, RoleSchema, TimestampSchema, VersionLabelSchema, envelope } from "../contracts/index.js";
import type { CostEvent, FeedbackEvent } from "../domain/index.js";
import { canonicalSerialize } from "../domain/serialization.js";

export const metricDefinitions = [
  { id: "reference_analysis_accuracy", unit: "ratio", evidence: "Frozen labeled reference attributes; report each attribute separately with unknown-label coverage." },
  { id: "shot_boundary_accuracy", unit: "precision_recall_f1", evidence: "Labeled boundaries, fixed time tolerance, one-to-one matching; no aggregate without the declared protocol." },
  { id: "matching_top_1", unit: "ratio", evidence: "Labeled slots whose first-ranked segment belongs to the acceptable set / labeled slots." },
  { id: "matching_top_k", unit: "ratio", evidence: "Labeled slots with an acceptable segment in the first K / labeled slots; always report K." },
  { id: "first_render_acceptance", unit: "ratio", evidence: "Closed jobs explicitly accepting revision 0 before a correction or regeneration / closed jobs receiving a QC-passed first preview." },
  { id: "creator_replacement_rate", unit: "ratio", evidence: "Distinct exposed clip decisions replaced at least once / exposed clip decisions in a closed cohort." },
  { id: "regeneration_rate", unit: "ratio", evidence: "Distinct previewed jobs with regeneration / previewed jobs in a closed cohort." },
  { id: "human_intervention_time", unit: "milliseconds", evidence: "Observed active correction time per job; missing timers are missing data, not zero." },
  { id: "cost_per_accepted_reel", unit: "INR", evidence: "All operation costs, including failures and rejected jobs, in a complete closed cohort / distinct jobs explicitly accepted at least once." },
  { id: "render_success", unit: "ratio", evidence: "Successful media-render attempts / terminal media-render attempts; exclude simulations." },
  { id: "qc_success", unit: "ratio", evidence: "Passed independent media QC runs / terminal media QC runs; report incomplete coverage separately." },
] as const;
export type MetricId = (typeof metricDefinitions)[number]["id"];
export interface EvaluationRun {
  readonly runId: string;
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly benchmarkDigest: string;
  readonly systemVersion: string;
  readonly evaluatedAt: string;
  readonly observations: readonly { readonly metric: MetricId; readonly value: number | null; readonly sampleCount: number; readonly protocolVersion: string; readonly missingReason: string | null }[];
}
export interface Evaluator<Input> { evaluate(input: Input): Promise<EvaluationRun> }

export const RankingCaseSchema = z.strictObject({
  caseId: IdSchema,
  creatorGroupId: IdSchema,
  rankedSegmentIds: z.array(IdSchema).max(256),
  acceptableSegmentIds: z.array(IdSchema).min(1).max(256),
}).superRefine((item, ctx) => {
  for (const field of ["rankedSegmentIds", "acceptableSegmentIds"] as const) {
    if (new Set(item[field]).size !== item[field].length) ctx.addIssue({ code: "custom", path: [field], message: "Ranking IDs must be unique." });
  }
});
export type RankingCase = z.infer<typeof RankingCaseSchema>;
export const BenchmarkCaseSchema = z.strictObject({
  caseId: IdSchema,
  creatorGroupId: IdSchema,
  candidateSegmentIds: z.array(IdSchema).min(1).max(256),
  acceptableSegmentIds: z.array(IdSchema).min(1).max(256),
  referenceFingerprintId: IdSchema.nullable(),
  audioFingerprintId: IdSchema.nullable(),
  slotRole: RoleSchema,
}).superRefine((item, ctx) => {
  if (new Set(item.candidateSegmentIds).size !== item.candidateSegmentIds.length || new Set(item.acceptableSegmentIds).size !== item.acceptableSegmentIds.length || item.acceptableSegmentIds.some((id) => !item.candidateSegmentIds.includes(id))) ctx.addIssue({ code: "custom", path: ["acceptableSegmentIds"], message: "Benchmark candidate IDs must be unique and contain the unique acceptable labels." });
});
export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>;
export const BenchmarkManifestSchema = z.strictObject({
  ...envelope("BenchmarkManifest"),
  benchmarkId: IdSchema,
  benchmarkVersion: VersionLabelSchema,
  provenance: z.enum(["synthetic", "creator_opt_in"]),
  split: z.enum(["validation", "test"]),
  splitUnit: z.literal("creator"),
  frozenAt: TimestampSchema,
  cases: z.array(BenchmarkCaseSchema).max(10000),
  casesDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((manifest, ctx) => {
  if (new Set(manifest.cases.map((item) => item.caseId)).size !== manifest.cases.length) ctx.addIssue({ code: "custom", path: ["cases"], message: "Benchmark case IDs must be unique." });
});
export type BenchmarkManifest = z.infer<typeof BenchmarkManifestSchema>;
export function benchmarkCasesDigest(cases: readonly BenchmarkCase[]): string {
  const validated = cases.map((item) => BenchmarkCaseSchema.parse(item));
  return createHash("sha256").update(canonicalSerialize(validated), "utf8").digest("hex");
}
export function verifyBenchmark(input: unknown): BenchmarkManifest {
  const manifest = BenchmarkManifestSchema.parse(input);
  if (manifest.casesDigest !== benchmarkCasesDigest(manifest.cases)) throw new Error("Frozen benchmark content digest mismatch.");
  return manifest;
}
export function assertDisjointCreatorSplits(left: BenchmarkManifest, right: BenchmarkManifest): void {
  const groups = new Set(verifyBenchmark(left).cases.map((item) => item.creatorGroupId));
  if (verifyBenchmark(right).cases.some((item) => groups.has(item.creatorGroupId))) throw new Error("Creator groups must not leak between evaluation splits.");
}
export function evaluateRanking(input: readonly RankingCase[], k: number): { top1: number | null; topK: number | null; k: number; cases: number; top1Hits: number; topKHits: number } {
  if (!Number.isSafeInteger(k) || k < 1 || k > 256) throw new Error("K must be an integer between 1 and 256.");
  const cases = input.map((item) => RankingCaseSchema.parse(item));
  if (new Set(cases.map((item) => item.caseId)).size !== cases.length) throw new Error("Ranking cases must be unique.");
  const top1Hits = cases.filter((item) => item.rankedSegmentIds[0] !== undefined && item.acceptableSegmentIds.includes(item.rankedSegmentIds[0])).length;
  const topKHits = cases.filter((item) => item.rankedSegmentIds.slice(0, k).some((id) => item.acceptableSegmentIds.includes(id))).length;
  return { top1: cases.length === 0 ? null : top1Hits / cases.length, topK: cases.length === 0 ? null : topKHits / cases.length, k, cases: cases.length, top1Hits, topKHits };
}

export interface CostCohort {
  readonly environment: "synthetic" | "production";
  readonly jobs: readonly { readonly projectId: string; readonly jobId: string }[];
  /** Explicit caller attestation; the in-memory ledger cannot establish billing completeness. */
  readonly ledgerComplete: boolean;
  readonly outcomesClosed: boolean;
}
export interface CostMetric {
  readonly environment: CostCohort["environment"];
  readonly acceptedReels: number;
  readonly cohortJobs: number;
  readonly totalCostInrMicros: string;
  readonly costInrPerAcceptedReel: number | null;
  readonly basis: "measured" | "estimated" | "synthetic" | "mixed" | "unavailable";
  readonly unavailableReason: "incomplete_cohort" | "missing_cost_coverage" | "no_acceptances" | null;
}
export function costPerAcceptedReel(cohort: CostCohort, costsInput: readonly CostEvent[], feedbackInput: readonly FeedbackEvent[]): CostMetric {
  const key = (projectId: string, jobId: string) => canonicalSerialize([IdSchema.parse(projectId), IdSchema.parse(jobId)]);
  const jobs = new Set(cohort.jobs.map((job) => key(job.projectId, job.jobId)));
  if (jobs.size !== cohort.jobs.length) throw new Error("Cost cohort jobs must be unique.");
  const costs = new Map<string, CostEvent>();
  const feedback = new Map<string, FeedbackEvent>();
  const operations = new Set<string>();
  for (const input of costsInput) {
    const event = CostEventSchema.parse(input);
    if (event.scope.environment !== cohort.environment || !jobs.has(key(event.scope.projectId, event.scope.jobId))) continue;
    const prior = costs.get(event.eventId);
    if (prior !== undefined) {
      if (canonicalSerialize(prior) !== canonicalSerialize(event)) throw new Error("Cost event ID collision.");
      continue;
    }
    const operation = canonicalSerialize([event.scope.projectId, event.scope.jobId, event.operationId, event.attempt]);
    if (operations.has(operation)) throw new Error("Duplicate operation cost.");
    operations.add(operation);
    costs.set(event.eventId, event);
  }
  for (const input of feedbackInput) {
    const event = FeedbackEventSchema.parse(input);
    if (event.scope.environment !== cohort.environment || !jobs.has(key(event.scope.projectId, event.scope.jobId))) continue;
    const prior = feedback.get(event.eventId);
    if (prior !== undefined && canonicalSerialize(prior) !== canonicalSerialize(event)) throw new Error("Feedback event ID collision.");
    feedback.set(event.eventId, event);
  }
  const accepted = new Set([...feedback.values()].filter((event) => event.action === "accepted").map((event) => key(event.scope.projectId, event.scope.jobId)));
  const covered = new Set([...costs.values()].map((event) => key(event.scope.projectId, event.scope.jobId)));
  const total = [...costs.values()].reduce((sum, event) => sum + BigInt(event.costInrMicros), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Cost metric exceeds safe numeric presentation range; use a decimal reporting adapter.");
  const sources = new Set([...costs.values()].map((event) => event.costSource));
  const unavailableReason = !cohort.ledgerComplete || !cohort.outcomesClosed ? "incomplete_cohort" : covered.size !== jobs.size ? "missing_cost_coverage" : accepted.size === 0 ? "no_acceptances" : null;
  return {
    environment: cohort.environment, acceptedReels: accepted.size, cohortJobs: jobs.size, totalCostInrMicros: total.toString(),
    costInrPerAcceptedReel: unavailableReason === null ? Number(total) / 1000000 / accepted.size : null,
    basis: unavailableReason !== null ? "unavailable" : sources.size > 1 ? "mixed" : [...sources][0] ?? "unavailable", unavailableReason,
  };
}
