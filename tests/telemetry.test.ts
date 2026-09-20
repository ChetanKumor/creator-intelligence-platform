import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryTelemetry, deriveReplacementPreference } from "../packages/telemetry/index.js";
import { createFixtures, createSyntheticCost } from "../samples/fixtures.js";
import { modelRun, replacement, requireValue } from "./support/fixtures.js";

test("telemetry snapshots inputs, deduplicates identical events, and rejects ID collisions", () => {
  const telemetry = new InMemoryTelemetry();
  const decision = requireValue(createFixtures().decisions[0]);
  assert.equal(telemetry.record(decision), "inserted");
  assert.equal(telemetry.record(structuredClone(decision)), "duplicate");
  decision.confidence = 0.5;
  assert.throws(() => telemetry.record(decision), /ID collision/);
  const stored = requireValue(telemetry.snapshot()[0]);
  assert.equal(stored.contractType, "DecisionEvent");
  if (stored.contractType === "DecisionEvent") { assert.equal(stored.confidence, 1); stored.confidence = 0; }
  const reread = requireValue(telemetry.snapshot()[0]);
  assert.ok(reread.contractType === "DecisionEvent"); assert.equal(reread.confidence, 1);
});
test("creator replacement preserves B > A with decision context and explicit feedback evidence", () => {
  const telemetry = new InMemoryTelemetry();
  telemetry.record(requireValue(createFixtures().decisions[0]));
  const feedback = replacement(); telemetry.record(feedback);
  const preference = deriveReplacementPreference(feedback); assert.ok(preference);
  telemetry.record(preference);
  assert.deepEqual(preference.signal, { kind: "pairwise_clip", preferredSegmentId: "segment_alternative", disfavoredSegmentId: "segment_hook", contextDecisionId: "decision_0" });
  assert.deepEqual(preference.basisFeedbackEventIds, [feedback.eventId]);
  assert.equal(telemetry.snapshot().length, 3);
  assert.throws(() => telemetry.record({ ...feedback, eventId: "stale_correction" }), /old value/);
});
test("feedback cannot join an unknown decision, another creator, or a later decision value", () => {
  const telemetry = new InMemoryTelemetry();
  const feedback = replacement();
  assert.throws(() => telemetry.record(feedback), /already be recorded/);
  telemetry.record(requireValue(createFixtures().decisions[0]));
  assert.throws(() => telemetry.record({ ...feedback, scope: { ...feedback.scope, creatorId: "another_creator" } }), /scopes must match/);
  telemetry.record({ ...feedback, occurredAt: "2026-09-13T00:00:02.000Z" });
  assert.throws(() => telemetry.record({ ...feedback, eventId: "out_of_order", occurredAt: "2026-09-13T00:00:01.000Z", oldValue: feedback.newValue, newValue: feedback.oldValue }), /chronological order/);
});
test("fabricated preference evidence and repeated cost operations are rejected", () => {
  const telemetry = new InMemoryTelemetry();
  const preference = deriveReplacementPreference(replacement()); assert.ok(preference);
  assert.throws(() => telemetry.record(preference), /prior feedback/);
  const cost = createSyntheticCost("rendering", "render");
  telemetry.record(cost);
  assert.equal(telemetry.record(cost), "duplicate");
  assert.throws(() => telemetry.record({ ...cost, eventId: "duplicate_billing" }), /already recorded/);
});
test("model provenance is validated and stored independently without provider payloads", () => {
  const telemetry = new InMemoryTelemetry();
  const run = modelRun();
  assert.equal(telemetry.recordModelRun(run), "inserted");
  assert.equal(telemetry.recordModelRun(run), "duplicate");
  assert.throws(() => telemetry.recordModelRun({ ...run, modelVersion: "2.0.0" }), /collision/);
  assert.equal(telemetry.modelRuns().length, 1);
  assert.equal(telemetry.snapshot().length, 0);
});
