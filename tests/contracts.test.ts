import assert from "node:assert/strict";
import { test } from "node:test";
import { AudioFingerprintSchema, ClipSegmentSchema, CostEventSchema, FeedbackEventSchema, ReferenceFingerprintSchema, UniversalEditPlanSchema, contractSchemas } from "../packages/contracts/index.js";
import type { UniversalEditPlan } from "../packages/domain/index.js";
import { assertCompatibleEmbeddingSpaces, validatePlanWithInputs } from "../packages/validation/index.js";
import { createFixtures, createSyntheticCost, createSyntheticFeedback } from "../samples/fixtures.js";
import { runSyntheticPipeline } from "../samples/pipeline.js";
import { deriveReplacementPreference } from "../packages/telemetry/index.js";
import { inputs, modelRun, replacement, requireValue } from "./support/fixtures.js";

test("all foundational contracts accept valid synthetic examples and reject unknown versions", async () => {
  const fixtures = createFixtures();
  const pipeline = await runSyntheticPipeline();
  const examples = {
    ReferenceFingerprint: fixtures.reference, ClipSegment: requireValue(fixtures.segments[0]), AudioFingerprint: fixtures.audio, UniversalEditPlan: fixtures.plan,
    DecisionEvent: requireValue(fixtures.decisions[0]), FeedbackEvent: createSyntheticFeedback(), CostEvent: createSyntheticCost("planning", "schema"),
    ModelRun: modelRun(), CreatorPreferenceEvent: deriveReplacementPreference(replacement()), RenderResult: pipeline.render, QCResult: pipeline.qc, JobState: fixtures.job, MediaAsset: requireValue(fixtures.assets[0]),
  };
  for (const [name, schema] of Object.entries(contractSchemas)) {
    const value = examples[name as keyof typeof examples];
    assert.ok(schema.safeParse(value).success, name);
    assert.equal(schema.safeParse({ ...value, schemaVersion: "2.0.0" }).success, false, name);
    assert.equal(schema.safeParse({ ...value, schemaVersion: "1.0.1" }).success, false, name);
    assert.equal(schema.safeParse({ ...value, providerPayload: {} }).success, false, name);
  }
  assert.deepEqual(validatePlanWithInputs(fixtures.plan, inputs(fixtures)), fixtures.plan);
});

const corruptions: readonly [string, (plan: UniversalEditPlan) => void][] = [
  ["reversed source range", (plan) => { requireValue(plan.clips[0]).sourceRange.endSeconds = 0; }],
  ["zero-length source range", (plan) => { const clip = requireValue(plan.clips[0]); clip.sourceRange.endSeconds = clip.sourceRange.startSeconds; }],
  ["negative timeline position", (plan) => { requireValue(plan.clips[0]).outputStartSeconds = -1; }],
  ["timeline gap", (plan) => { requireValue(plan.clips[1]).outputStartSeconds = 4; }],
  ["undeclared overlap", (plan) => { requireValue(plan.clips[1]).outputStartSeconds = 2; }],
  ["confidence above one", (plan) => { requireValue(plan.clips[0]).confidence = 1.01; }],
  ["negative confidence", (plan) => { requireValue(plan.clips[0]).confidence = -0.1; }],
  ["NaN confidence", (plan) => { requireValue(plan.clips[0]).confidence = Number.NaN; }],
  ["infinite timeline", (plan) => { requireValue(plan.clips[0]).outputStartSeconds = Number.POSITIVE_INFINITY; }],
  ["zero speed", (plan) => { requireValue(plan.clips[0]).speed = 0; }],
  ["duration mismatch", (plan) => { plan.output.targetDurationSeconds = 21; }],
  ["aspect ratio mismatch", (plan) => { plan.output.resolution.width = 1920; }],
  ["caption beyond output", (plan) => { requireValue(plan.captions[0]).range.endSeconds = 25; }],
  ["music fades exceed music", (plan) => { assert.ok(plan.music); plan.music.fadeInSeconds = 19; plan.music.fadeOutSeconds = 3; }],
  ["last clip dissolve", (plan) => { requireValue(plan.clips.at(-1)).transitionOut = { type: "dissolve", durationSeconds: 0.5 }; }],
  ["duplicate clip IDs", (plan) => { requireValue(plan.clips[1]).clipId = requireValue(plan.clips[0]).clipId; }],
  ["missing parent on revision", (plan) => { plan.revision = 1; }],
];
for (const [name, corrupt] of corruptions) test(`rejects ${name}`, () => {
  const plan = createFixtures().plan;
  corrupt(plan);
  assert.equal(UniversalEditPlanSchema.safeParse(plan).success, false);
});

test("legal speed changes use source duration divided by speed", () => {
  const plan = createFixtures().plan;
  requireValue(plan.clips[0]).speed = 2;
  plan.clips.slice(1).forEach((clip) => { clip.outputStartSeconds -= 1.5; });
  plan.output.targetDurationSeconds -= 1.5;
  assert.ok(plan.music); plan.music.sourceRange.endSeconds -= 1.5;
  assert.ok(UniversalEditPlanSchema.safeParse(plan).success);
});
test("a declared dissolve produces a bounded overlap and shorter timeline", () => {
  const plan = createFixtures().plan;
  requireValue(plan.clips[0]).transitionOut = { type: "dissolve", durationSeconds: 0.5 };
  plan.clips.slice(1).forEach((clip) => { clip.outputStartSeconds -= 0.5; });
  plan.output.targetDurationSeconds -= 0.5;
  assert.ok(plan.music); plan.music.sourceRange.endSeconds -= 0.5;
  assert.ok(UniversalEditPlanSchema.safeParse(plan).success);
  requireValue(plan.clips[1]).speed = 4;
  requireValue(plan.clips[1]).transitionOut = { type: "dissolve", durationSeconds: 1 };
  assert.equal(UniversalEditPlanSchema.safeParse(plan).success, false);
});
test("cross-asset validation catches a structurally valid source range outside the chosen segment", () => {
  const fixtures = createFixtures();
  requireValue(fixtures.plan.clips[0]).sourceRange = { startSeconds: 18, endSeconds: 21 };
  assert.ok(UniversalEditPlanSchema.safeParse(fixtures.plan).success);
  assert.throws(() => validatePlanWithInputs(fixtures.plan, inputs(fixtures)), /source range must fit/);
});
test("cross-asset validation prevents cross-project and mismatched decision inputs", () => {
  const fixtures = createFixtures();
  requireValue(fixtures.assets.find((asset) => asset.assetId === "asset_red")).projectId = "another_project";
  assert.throws(() => validatePlanWithInputs(fixtures.plan, inputs(fixtures)), /another project/);
  const other = createFixtures();
  requireValue(other.decisions[0]).winnerCandidateId = "candidate_0_alternative";
  assert.throws(() => validatePlanWithInputs(other.plan, inputs(other)), /recorded decision/);
});
test("expired or deletion-pending source media cannot be used", () => {
  for (const field of ["expiresAt", "deletionRequestedAt"] as const) {
    const fixtures = createFixtures();
    requireValue(fixtures.assets.find((asset) => asset.assetId === "asset_red")).retention[field] = "2026-09-12T00:00:00.000Z";
    assert.throws(() => validatePlanWithInputs(fixtures.plan, inputs(fixtures)), /expired or pending deletion/);
  }
});
test("reference summaries, ordered audio beats, and embedding references are validated", () => {
  const fixtures = createFixtures();
  fixtures.reference.pacing.averageShotLengthSeconds = 100;
  assert.equal(ReferenceFingerprintSchema.safeParse(fixtures.reference).success, false);
  fixtures.audio.beatsSeconds = [2, 1];
  assert.equal(AudioFingerprintSchema.safeParse(fixtures.audio).success, false);
  const segment = requireValue(fixtures.segments[0]);
  assert.equal(ClipSegmentSchema.safeParse({ ...segment, semanticEmbedding: [1, 2, 3] }).success, false);
});
test("feedback action/value kinds and integral INR costs are enforced", () => {
  assert.equal(FeedbackEventSchema.safeParse({ ...replacement(), newValue: { kind: "speed", speed: 2 } }).success, false);
  assert.equal(FeedbackEventSchema.safeParse({ ...createSyntheticFeedback(), renderId: null }).success, false);
  assert.equal(CostEventSchema.safeParse({ ...createSyntheticCost("planning", "invalid"), costInrMicros: 0.5 }).success, false);
  assert.equal(CostEventSchema.safeParse({ ...createSyntheticCost("planning", "invalid"), costSource: "measured" }).success, false);
});

test("embedding adapters can change while incompatible vector spaces are rejected explicitly", () => {
  const reference = { embeddingId: "embedding_one", spaceId: "semantic_space", spaceVersion: "1.0.0", dimensions: 768, distance: "cosine" as const, objectId: "object_embedding_one" };
  assert.doesNotThrow(() => assertCompatibleEmbeddingSpaces(reference, { ...reference, embeddingId: "embedding_two", objectId: "object_embedding_two" }));
  assert.throws(() => assertCompatibleEmbeddingSpaces(reference, { ...reference, spaceVersion: "2.0.0" }), /immutable space/);
  assert.throws(() => assertCompatibleEmbeddingSpaces(reference, { ...reference, dimensions: 1024 }), /immutable space/);
});
