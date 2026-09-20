import assert from "node:assert/strict";
import { FeedbackEventSchema, ModelRunSchema, QCResultSchema } from "../../packages/contracts/index.js";
import type { FeedbackEvent, ModelRun, QCResult } from "../../packages/domain/index.js";
import type { PlanInputs } from "../../packages/validation/index.js";
import { createFixtures, createSyntheticFeedback, FIXTURE_TIME, fixtureScope, type FixtureSet } from "../../samples/fixtures.js";

export function requireValue<T>(value: T | undefined): T { assert.notEqual(value, undefined); if (value === undefined) throw new Error("Missing test fixture."); return value; }
export function inputs(fixtures: FixtureSet = createFixtures()): PlanInputs {
  return { assets: fixtures.assets, segments: fixtures.segments, audio: [fixtures.audio], references: [fixtures.reference], decisions: fixtures.decisions, asOf: FIXTURE_TIME };
}
export function replacement(): FeedbackEvent {
  return FeedbackEventSchema.parse({ ...createSyntheticFeedback(), eventId: "feedback_replacement", action: "replaced", decisionId: "decision_0", oldValue: { kind: "clip_segment", segmentId: "segment_hook" }, newValue: { kind: "clip_segment", segmentId: "segment_alternative" } });
}
export function modelRun(): ModelRun {
  return ModelRunSchema.parse({ contractType: "ModelRun", schemaVersion: "1.0.0", runId: "run_contract_double", scope: fixtureScope, provider: "contract_test_double", model: "synthetic", modelVersion: "1.0.0", adapterVersion: "1.0.0", operation: "reference_analysis", inputIds: ["asset_reference"], outputIds: ["reference_synthetic"], startedAt: FIXTURE_TIME, endedAt: FIXTURE_TIME, status: "succeeded", errorCode: null });
}
/** Synthetic QC evidence solely to test job gates. No actual media checks are executed. */
export function passingMediaQC(base: QCResult): QCResult {
  const measurements: Record<QCResult["checks"][number]["name"], NonNullable<QCResult["checks"][number]["observed"]>> = {
    plan_digest: { unit: "boolean", value: true }, timeline_duration: { unit: "seconds", value: 20 }, non_zero_file: { unit: "bytes", value: 1000 }, duration: { unit: "seconds", value: 20 },
    frame_count: { unit: "count", value: 600 }, codec: { unit: "codec", value: "h264" }, resolution: { unit: "resolution", value: { width: 1080, height: 1920 } }, audio_present: { unit: "boolean", value: true }, black_frames: { unit: "seconds", value: 0 }, av_sync: { unit: "milliseconds", value: 0 },
  };
  return QCResultSchema.parse({ ...base, mode: "media", outcome: "passed", deliveryAllowed: true, checks: base.checks.map((check) => ({ ...check, status: "passed", expected: measurements[check.name], observed: measurements[check.name], reasonCode: "synthetic_gate_test" })) });
}
