import type { Renderer } from "../packages/providers/index.js";
import { DryRunRenderer } from "../packages/providers/dry-run-renderer.js";
import { InMemoryTelemetry } from "../packages/telemetry/index.js";
import { validatePlanWithInputs } from "../packages/validation/index.js";
import { inspectPlanReceipt } from "../packages/validation/qc.js";
import { transitionJob } from "../packages/jobs/index.js";
import { createFixtures, createSyntheticCost, createSyntheticFeedback, FIXTURE_TIME } from "./fixtures.js";

export async function runSyntheticPipeline(renderer: Renderer = new DryRunRenderer({ renderId: "render_synthetic", jobId: "job_synthetic", now: () => FIXTURE_TIME })) {
  if (renderer.mode !== "dry_run") throw new Error("The Phase 0 demonstration only authorizes dry-run adapters.");
  const fixtures = createFixtures();
  const telemetry = new InMemoryTelemetry();
  fixtures.decisions.forEach((decision) => telemetry.record(decision));
  const plan = validatePlanWithInputs(fixtures.plan, { assets: fixtures.assets, segments: fixtures.segments, audio: [fixtures.audio], references: [fixtures.reference], decisions: fixtures.decisions, asOf: FIXTURE_TIME });
  telemetry.record(createSyntheticCost("planning", "planning"));
  let job = fixtures.job;
  // These state changes exercise the state machine using prepared fixtures; no analyzers execute.
  for (const state of ["ANALYZING_REFERENCE", "ANALYZING_FOOTAGE", "ANALYZING_AUDIO", "MATCHING", "PLANNING"] as const) job = transitionJob(job, state, { at: FIXTURE_TIME });
  job = transitionJob(job, "RENDERING_PREVIEW", { at: FIXTURE_TIME, planId: plan.planId });
  const render = await renderer.render(plan);
  telemetry.record(createSyntheticCost("rendering", "rendering"));
  job = transitionJob(job, "QC", { at: FIXTURE_TIME, render });
  const qc = inspectPlanReceipt(plan, render, { qcId: "qc_synthetic", checkedAt: FIXTURE_TIME });
  telemetry.record(createSyntheticCost("qc", "qc"));
  // Illustrative event only: isolated synthetic scope, never an actual delivery/acceptance.
  telemetry.record({ ...createSyntheticFeedback(), renderId: render.renderId });
  return { mode: "synthetic_contract_exercise" as const, plan, render, qc, job, events: telemetry.snapshot(), modelRuns: telemetry.modelRuns() };
}
