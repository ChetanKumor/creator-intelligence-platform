import assert from "node:assert/strict";
import { test } from "node:test";
import { JobStateSchema, QCResultSchema, RenderResultSchema } from "../packages/contracts/index.js";
import { failJob, retryJob, transitionJob } from "../packages/jobs/index.js";
import { createFixtures, FIXTURE_TIME } from "../samples/fixtures.js";
import { runSyntheticPipeline } from "../samples/pipeline.js";
import { passingMediaQC, requireValue } from "./support/fixtures.js";

test("optional reference/audio stages can be skipped, while illegal transitions fail", () => {
  const uploaded = createFixtures().job;
  const footage = transitionJob(uploaded, "ANALYZING_FOOTAGE", { at: FIXTURE_TIME });
  const matching = transitionJob(footage, "MATCHING", { at: FIXTURE_TIME });
  assert.equal(matching.state, "MATCHING");
  assert.equal(matching.stateVersion, 2);
  assert.equal(uploaded.stateVersion, 0);
  assert.throws(() => transitionJob(uploaded, "COMPLETE", { at: FIXTURE_TIME }), /Illegal/);
  assert.throws(() => transitionJob(uploaded, "ANALYZING_FOOTAGE", { at: "2026-09-12T00:00:00.000Z" }), /backwards/);
});
test("failures identify their active stage and only retryable failures resume", () => {
  const job = transitionJob(createFixtures().job, "ANALYZING_FOOTAGE", { at: FIXTURE_TIME });
  const failure = { stage: "ANALYZING_FOOTAGE" as const, code: "media_decode_unavailable", message: "Source video could not be decoded.", retryable: true, failedAt: FIXTURE_TIME };
  const failed = failJob(job, failure);
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.failure?.stage, "ANALYZING_FOOTAGE");
  const retried = retryJob(failed, FIXTURE_TIME);
  assert.equal(retried.state, "ANALYZING_FOOTAGE");
  assert.equal(retried.attempt, 2);
  assert.equal(retried.stateVersion, 3);
  assert.equal(retried.failure, null);
  assert.throws(() => failJob(job, { ...failure, stage: "MATCHING" }), /active stage/);
  assert.throws(() => retryJob(failJob(job, { ...failure, retryable: false }), FIXTURE_TIME), /retryable/);
  assert.equal(JobStateSchema.safeParse({ ...failed, failure: null }).success, false);
});
test("dry-run QC cannot unlock preview readiness or final completion", async () => {
  const result = await runSyntheticPipeline();
  assert.throws(() => transitionJob(result.job, "PREVIEW_READY", { at: FIXTURE_TIME, qc: result.qc }), /media render/);
  assert.throws(() => transitionJob(result.job, "COMPLETE", { at: FIXTURE_TIME, qc: result.qc }), /media render/);
  assert.throws(() => transitionJob(result.job, "PREVIEW_READY", { at: FIXTURE_TIME, qc: passingMediaQC(result.qc) }), /cannot be promoted/);
  assert.equal(QCResultSchema.safeParse({ ...result.qc, outcome: "passed", deliveryAllowed: true }).success, false);
  const fake = passingMediaQC(result.qc);
  requireValue(fake.checks.find((check) => check.name === "duration")).observed = { unit: "boolean", value: true };
  assert.equal(QCResultSchema.safeParse(fake).success, false);
});
test("media QC must match the active render; final render repeats QC before completion", async () => {
  const result = await runSyntheticPipeline();
  const receipt = result.render;
  const mediaReceipt = RenderResultSchema.parse({
    contractType: "RenderResult", schemaVersion: "1.0.0", renderId: receipt.renderId, projectId: receipt.projectId, jobId: receipt.jobId,
    planId: receipt.planId, planRevision: receipt.planRevision, planDigest: receipt.planDigest, renderer: "media_contract_test_double", rendererVersion: "1.0.0", completedAt: FIXTURE_TIME,
    kind: "media", status: "succeeded", artifact: { objectId: "object_contract_test_double", mimeType: "video/mp4" },
  });
  const awaitingRender = JobStateSchema.parse({ ...result.job, state: "RENDERING_PREVIEW", activeRenderId: null, activeRenderKind: null });
  const mediaJob = transitionJob(awaitingRender, "QC", { at: FIXTURE_TIME, render: mediaReceipt });
  const qc = passingMediaQC(result.qc);
  assert.throws(() => transitionJob(mediaJob, "PREVIEW_READY", { at: FIXTURE_TIME, qc: result.qc }), /passing independent media QC/);
  assert.throws(() => transitionJob(mediaJob, "PREVIEW_READY", { at: FIXTURE_TIME, qc: { ...qc, renderId: "wrong_render" } }), /active render/);
  const ready = transitionJob(mediaJob, "PREVIEW_READY", { at: FIXTURE_TIME, qc });
  assert.throws(() => transitionJob(ready, "RENDERING_FINAL", { at: FIXTURE_TIME, planId: "unreviewed_plan" }), /passed preview QC/);
  const final = transitionJob(ready, "RENDERING_FINAL", { at: FIXTURE_TIME });
  assert.throws(() => transitionJob(final, "COMPLETE", { at: FIXTURE_TIME, qc }), /Illegal/);
  const finalReceipt = { ...mediaReceipt, renderId: "render_final_gate_test" };
  const finalQC = transitionJob(final, "QC", { at: FIXTURE_TIME, render: finalReceipt });
  const complete = transitionJob(finalQC, "COMPLETE", { at: FIXTURE_TIME, qc: { ...qc, renderId: finalReceipt.renderId } });
  assert.equal(complete.state, "COMPLETE");
  assert.throws(() => transitionJob(complete, "PLANNING", { at: FIXTURE_TIME }), /Illegal/);
  const revision = transitionJob(ready, "REVISION_REQUESTED", { at: FIXTURE_TIME });
  assert.equal(revision.revision, 1);
  assert.equal(revision.activePlanId, null);
  assert.equal(transitionJob(revision, "PLANNING", { at: FIXTURE_TIME }).state, "PLANNING");
});
