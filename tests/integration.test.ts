import assert from "node:assert/strict";
import { test } from "node:test";
import { ReferenceFingerprintSchema, RenderResultSchema } from "../packages/contracts/index.js";
import type { ReferenceFingerprint, RenderResult, UniversalEditPlan } from "../packages/domain/index.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { DryRunRenderer } from "../packages/providers/dry-run-renderer.js";
import type { AnalysisResult, Renderer, VisionProvider } from "../packages/providers/index.js";
import { planDigest } from "../packages/validation/index.js";
import { inspectPlanReceipt } from "../packages/validation/qc.js";
import { createFixtures, FIXTURE_TIME, fixtureScope } from "../samples/fixtures.js";
import { runSyntheticPipeline } from "../samples/pipeline.js";
import { modelRun, requireValue } from "./support/fixtures.js";

test("synthetic end-to-end pipeline is deterministic, logs decisions/feedback/cost, and stops at incomplete QC", async () => {
  const first = await runSyntheticPipeline();
  const second = await runSyntheticPipeline();
  assert.equal(canonicalSerialize(first), canonicalSerialize(second));
  assert.equal(first.render.kind, "dry_run");
  assert.equal(first.qc.outcome, "incomplete");
  assert.equal(first.qc.deliveryAllowed, false);
  assert.equal(first.job.state, "QC");
  assert.equal(first.events.filter((event) => event.contractType === "DecisionEvent").length, 4);
  assert.equal(first.events.filter((event) => event.contractType === "FeedbackEvent").length, 1);
  assert.equal(first.events.filter((event) => event.contractType === "CostEvent").length, 3);
  assert.ok(first.events.every((event) => event.scope.environment === "synthetic"));
  assert.deepEqual(first.modelRuns, []);
  assert.equal("artifact" in first.render, false);
});

test("independent renderer implementations substitute through the same plan-only interface", async () => {
  let received: UniversalEditPlan | null = null;
  class AlternateRenderer implements Renderer {
    readonly id = "alternate_contract_double";
    readonly version = "1.0.0";
    readonly mode = "dry_run" as const;
    async render(plan: UniversalEditPlan): Promise<RenderResult> {
      received = structuredClone(plan);
      return RenderResultSchema.parse({
        contractType: "RenderResult", schemaVersion: "1.0.0", renderId: "render_alternate", projectId: plan.projectId, jobId: fixtureScope.jobId,
        planId: plan.planId, planRevision: plan.revision, planDigest: planDigest(plan), renderer: this.id, rendererVersion: this.version, completedAt: FIXTURE_TIME,
        kind: "dry_run", status: "simulated", plannedDurationSeconds: plan.output.targetDurationSeconds, plannedClipCount: plan.clips.length,
      });
    }
  }
  const adapters: readonly Renderer[] = [new DryRunRenderer({ renderId: "render_synthetic", jobId: fixtureScope.jobId, now: () => FIXTURE_TIME }), new AlternateRenderer()];
  const plans: string[] = [];
  for (const adapter of adapters) {
    const result = await runSyntheticPipeline(adapter);
    plans.push(canonicalSerialize(result.plan));
    assert.equal(result.qc.outcome, "incomplete");
  }
  assert.equal(plans[0], plans[1]);
  assert.deepEqual(received, createFixtures().plan);
});

test("vision adapters return owned fingerprints and model provenance, independent of provider identity", async () => {
  function adapter(id: string): VisionProvider {
    return {
      id, version: "1.0.0",
      async analyzeReference(): Promise<AnalysisResult<ReferenceFingerprint>> {
        return { value: ReferenceFingerprintSchema.parse(createFixtures().reference), modelRun: { ...modelRun(), provider: id, runId: `run_${id}` } };
      },
      async analyzeFootage() { return { value: createFixtures().segments, modelRun: { ...modelRun(), provider: id, runId: `run_${id}_footage`, operation: "footage_analysis" } }; },
    };
  }
  const asset = requireValue(createFixtures().assets[0]);
  const context = { scope: fixtureScope, operationId: "operation_vision_test", attempt: 1 };
  const first = await adapter("provider_one").analyzeReference(asset, context);
  const second = await adapter("provider_two").analyzeReference(asset, context);
  assert.deepEqual(first.value, second.value);
  assert.notEqual(first.modelRun.provider, second.modelRun.provider);
});

test("independent QC detects a receipt bound to a different plan or fabricated duration", async () => {
  const result = await runSyntheticPipeline();
  const corrupted = { ...result.render, planDigest: "0".repeat(64) };
  const qc = inspectPlanReceipt(result.plan, corrupted, { qcId: "qc_mismatch", checkedAt: FIXTURE_TIME });
  assert.equal(qc.outcome, "failed");
  assert.equal(qc.deliveryAllowed, false);
  assert.ok(result.render.kind === "dry_run");
  const durationQC = inspectPlanReceipt(result.plan, { ...result.render, plannedDurationSeconds: 99 }, { qcId: "qc_duration", checkedAt: FIXTURE_TIME });
  assert.equal(durationQC.outcome, "failed");
  assert.throws(() => inspectPlanReceipt(result.plan, result.render, { qcId: "qc_early", checkedAt: "2026-09-12T00:00:00.000Z" }), /cannot precede/);
});
