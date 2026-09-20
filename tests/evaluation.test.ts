import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDisjointCreatorSplits, costPerAcceptedReel, evaluateRanking, verifyBenchmark, type CostCohort } from "../packages/evaluation/index.js";
import { createSyntheticBenchmark, createSyntheticCost, createSyntheticFeedback, fixtureScope } from "../samples/fixtures.js";
import { requireValue } from "./support/fixtures.js";

test("matching Top-1/Top-K are computed from supplied labels, with null for absent data", () => {
  const cases = [
    { caseId: "case_a", creatorGroupId: "group_a", rankedSegmentIds: ["segment_a", "segment_b"], acceptableSegmentIds: ["segment_a"] },
    { caseId: "case_b", creatorGroupId: "group_b", rankedSegmentIds: ["segment_a", "segment_b"], acceptableSegmentIds: ["segment_b"] },
    { caseId: "case_c", creatorGroupId: "group_c", rankedSegmentIds: [], acceptableSegmentIds: ["segment_b"] },
  ];
  assert.deepEqual(evaluateRanking(cases, 2), { top1: 1 / 3, topK: 2 / 3, k: 2, cases: 3, top1Hits: 1, topKHits: 2 });
  assert.equal(evaluateRanking([], 2).top1, null);
  assert.throws(() => evaluateRanking(cases, 0), /K must/);
  assert.throws(() => evaluateRanking([requireValue(cases[0]), requireValue(cases[0])], 1), /unique/);
});
test("benchmark labels are integrity checked and creator groups cannot leak across splits", () => {
  const benchmark = createSyntheticBenchmark();
  assert.deepEqual(verifyBenchmark(benchmark), benchmark);
  const tampered = structuredClone(benchmark);
  requireValue(tampered.cases[0]).acceptableSegmentIds = ["segment_alternative"];
  assert.throws(() => verifyBenchmark(tampered), /digest mismatch/);
  assert.throws(() => assertDisjointCreatorSplits(benchmark, { ...benchmark, benchmarkId: "validation_copy", split: "validation" }), /leak/);
});
test("cost per accepted Reel includes rejected jobs and retries, deduplicates acceptance, and isolates synthetic events", () => {
  const cohort: CostCohort = { environment: "synthetic", jobs: [{ projectId: fixtureScope.projectId, jobId: fixtureScope.jobId }, { projectId: fixtureScope.projectId, jobId: "job_rejected" }], ledgerComplete: true, outcomesClosed: true };
  const first = createSyntheticCost("rendering", "first", 2000000);
  const retry = { ...createSyntheticCost("rendering", "retry", 1000000), attempt: 2 };
  const rejected = { ...createSyntheticCost("rendering", "rejected", 3000000), scope: { ...fixtureScope, jobId: "job_rejected" } };
  const accepted = createSyntheticFeedback();
  const result = costPerAcceptedReel(cohort, [first, first, retry, rejected], [accepted, accepted, { ...accepted, eventId: "second_acceptance" }, createSyntheticFeedback("downloaded")]);
  assert.equal(result.totalCostInrMicros, "6000000");
  assert.equal(result.acceptedReels, 1);
  assert.equal(result.costInrPerAcceptedReel, 6);
  assert.equal(result.basis, "synthetic");
  assert.equal(costPerAcceptedReel({ ...cohort, environment: "production" }, [first], [accepted]).costInrPerAcceptedReel, null);
});
test("cost metrics remain unavailable for open cohorts, missing billing coverage, or no explicit acceptance", () => {
  const cohort: CostCohort = { environment: "synthetic", jobs: [{ projectId: fixtureScope.projectId, jobId: fixtureScope.jobId }], ledgerComplete: true, outcomesClosed: true };
  const cost = createSyntheticCost("rendering", "coverage");
  const accepted = createSyntheticFeedback();
  assert.equal(costPerAcceptedReel({ ...cohort, ledgerComplete: false }, [cost], [accepted]).unavailableReason, "incomplete_cohort");
  assert.equal(costPerAcceptedReel(cohort, [], [accepted]).unavailableReason, "missing_cost_coverage");
  assert.equal(costPerAcceptedReel(cohort, [cost], [createSyntheticFeedback("downloaded")]).unavailableReason, "no_acceptances");
  assert.throws(() => costPerAcceptedReel(cohort, [cost, { ...cost, eventId: "duplicate_operation" }], [accepted]), /Duplicate operation/);
});
