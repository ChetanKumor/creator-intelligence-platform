import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { EditorialArtifactMap, missing, present } from "../packages/editorial/common.js";
import { EditorialTokenSchema, createEditorialToken } from "../packages/editorial/token.js";
import { resolveAvailableToken, resolveCheapMissingness, resolveEditorialToken, resolveLocality, resolveTokenView, validateTokenEvidence } from "../packages/editorial/resolve.js";
import { assertCompatibleEmbeddingSpaces } from "../packages/validation/index.js";
import { artifact, tokenFixture } from "./support/editorial.js";

for (const key of Object.keys(tokenFixture().token.future) as (keyof ReturnType<typeof tokenFixture>["token"]["future"])[]) {
  test(`correction C: ${key} rejects reidentified arbitrary producer provenance`, () => {
    const f = tokenFixture(), { tokenId: _id, ...body } = structuredClone(f.token);
    body.future[key].provenance.producerId = "unrun_model";
    const changed = createEditorialToken(body);
    assert.notEqual(changed.tokenId, f.token.tokenId);
    assert.throws(() => validateTokenEvidence(changed, f.map()), /declaration adapter/);
  });
  test(`correction C: ${key} rejects substituted declaration policy`, () => {
    const f = tokenFixture(), { tokenId: _id, ...body } = structuredClone(f.token);
    body.future[key].provenance.configuration = { artifact: f.input.analysis, pointer: "/configuration" };
    assert.throws(() => validateTokenEvidence(createEditorialToken(body), f.map()), /declaration adapter/);
  });
}
test("correction C: deferred channels preserve the resolved declaration adapter and missing-only data", () => {
  const f = tokenFixture(), validated = validateTokenEvidence(f.token, f.map());
  for (const channel of Object.values(validated.future)) {
    assert.deepEqual(channel.provenance, validated.temporal.provenance);
    assert.equal(channel.data.state, "not_computed");
    assert.equal(channel.data.reasonCode, "channel_deferred");
  }
  const { tokenId: _id, ...body } = f.token;
  for (const key of Object.keys(body.future)) assert.throws(() => createEditorialToken({ ...body, future: { ...body.future, [key]: { provenance: f.adapter, data: present({}) } } }));
});

test("strict token serializes references only, with no plan, slot, vectors or text", () => {
  const f = tokenFixture(), json = canonicalSerialize(f.token);
  assert.ok(EditorialTokenSchema.safeParse(f.token).success);
  for (const key of ["vector", "vectors", "planId", "slotId", "revision", "frames", "transcript", "caption", "prompt"]) assert.equal(json.includes(`"${key}":`), false, key);
});
for (const patch of [{ unknown: true }, { artifactVersion: "0.2.0" }, { vectors: [1, 2] }, { createdAt: "2026-09-21T00:00:00.000Z" }]) test(`token rejects ${Object.keys(patch)[0]}`, () => {
  assert.equal(EditorialTokenSchema.safeParse({ ...tokenFixture().token, ...patch }).success, false);
});
for (const value of [NaN, Infinity, -Infinity]) test(`token rejects non-finite temporal ${value}`, () => {
  const t = tokenFixture().token; if (t.temporal.data.state === "present") t.temporal.data.value.sourceDurationSeconds = value;
  assert.equal(EditorialTokenSchema.safeParse(t).success, false);
});
test("token content identity is deterministic; creation time belongs outside frozen token body", () => {
  const f = tokenFixture();
  assert.deepEqual(resolveEditorialToken(f.input, f.map()), f.token);
  const firstReceipt = { createdAt: "2026-09-21T00:00:00.000Z", token: resolveEditorialToken(f.input, f.map()) };
  const secondReceipt = { createdAt: "2026-09-22T00:00:00.000Z", token: resolveEditorialToken(f.input, f.map()) };
  assert.equal(firstReceipt.token.tokenId, secondReceipt.token.tokenId);
  const { tokenId: _id, ...body } = f.token;
  assert.notEqual(createEditorialToken({ ...body, clipSegment: missing("unavailable", "different_evidence") }).tokenId, f.token.tokenId);
});
test("identity-bearing artifact timestamp/hash changes token identity", () => {
  const f = tokenFixture(), { tokenId: _id, ...body } = f.token;
  const updated = artifact("object_run", "FootageRun", { ...f.run, recordedAt: "2026-09-22T00:00:00.000Z" });
  assert.notEqual(createEditorialToken({ ...body, producingRun: { ...body.producingRun, artifact: updated.ref } }).tokenId, f.token.tokenId);
});
test("duplicate support and missing signal IDs fail", () => {
  const f = tokenFixture({ startSeconds: 1, endSeconds: 2 });
  assert.ok(f.token.semantic.data.state === "present" && f.token.cheap.data.state === "present");
  f.token.semantic.data.value.locality.supports.push(f.token.semantic.data.value.locality.supports[0]!);
  assert.equal(EditorialTokenSchema.safeParse(f.token).success, false);
  f.token.cheap.data.value.missingSignals.push(f.token.cheap.data.value.missingSignals[0]!);
  assert.equal(EditorialTokenSchema.safeParse(f.token).success, false);
});
const inputConflicts = [
  ["project", (f: ReturnType<typeof tokenFixture>) => ({ ...f.input, projectId: "foreign" })],
  ["asset", (f: ReturnType<typeof tokenFixture>) => ({ ...f.input, candidate: { ...f.input.candidate, assetId: "asset_foreign" } })],
  ["candidate", (f: ReturnType<typeof tokenFixture>) => ({ ...f.input, candidate: { ...f.input.candidate, candidateId: "candidate_foreign" } })],
  ["proposal", (f: ReturnType<typeof tokenFixture>) => ({ ...f.input, candidate: { ...f.input.candidate, proposalConfigurationId: "proposal_foreign" } })],
  ["run", (f: ReturnType<typeof tokenFixture>) => ({ ...f.input, producingRun: { ...f.input.producingRun, jobId: "job_foreign" } })],
  ["producer config", (f: ReturnType<typeof tokenFixture>) => ({ ...f.input, featureProducer: { ...f.input.featureProducer, configuration: f.policyRef } })],
  ["temporal", (f: ReturnType<typeof tokenFixture>) => ({ ...f.input, candidate: { ...f.input.candidate, sourceRange: { startSeconds: 0, endSeconds: 1 } } })],
] as const;
for (const [name, mutate] of inputConflicts) test(`resolver rejects conflicting ${name}`, () => { const f = tokenFixture(); assert.throws(() => resolveEditorialToken(mutate(f), f.map())); });
test("source hash conflict fails even with honestly rehashed supplied JSON", () => {
  const f = tokenFixture(), changed = artifact("object_analysis", "FootageAnalysis", { ...f.analysis, contentHash: "b".repeat(64) }, "1.0.0");
  assert.throws(() => resolveEditorialToken({ ...f.input, analysis: changed.ref }, new EditorialArtifactMap([changed, ...f.supplied.slice(1)])));
});
test("run configuration conflict fails before token hydration", () => {
  const f = tokenFixture(), changed = artifact("object_run", "FootageRun", { ...f.run, configuration: { ...f.run.configuration, assetTimeoutMilliseconds: 800000 } });
  assert.throws(() => resolveEditorialToken({ ...f.input, producingRun: { ...f.input.producingRun, artifact: changed.ref } }, new EditorialArtifactMap([f.supplied[0]!, changed, ...f.supplied.slice(2)])), /configuration/);
});
test("incomplete bundle stays incomplete; missing artifact is not repaired", () => {
  const absence = missing("unavailable", "analysis_sidecar_missing");
  assert.deepEqual(resolveAvailableToken(absence, new EditorialArtifactMap([])), absence);
  assert.throws(() => resolveEditorialToken(tokenFixture().input, new EditorialArtifactMap([])), /Missing/);
});
test("compatible embeddings allow distinct IDs", () => {
  const e = tokenFixture().evidence.semanticEmbedding;
  assert.doesNotThrow(() => assertCompatibleEmbeddingSpaces(e, { ...e, embeddingId: "different", objectId: "different_object" }));
});
for (const patch of [{ spaceId: "wrong" }, { spaceVersion: "wrong" }, { dimensions: 1152 }, { distance: "dot" as const }]) test(`immutable embedding ${Object.keys(patch)[0]} mismatch fails`, () => {
  const e = tokenFixture().evidence.semanticEmbedding;
  assert.throws(() => assertCompatibleEmbeddingSpaces(e, { ...e, ...patch }), /immutable space/);
});
test("inside semantic support and temporal getters preserve actual PTS", () => {
  const f = tokenFixture(), view = resolveTokenView(f.token, f.map());
  assert.equal(view.durationSeconds, 2);
  assert.deepEqual(view.temporal, present({ shotDurationSeconds: 4, shotStartFraction: 0, shotEndFraction: 0.5 }));
  assert.ok(f.token.semantic.data.state === "present"); assert.equal(f.token.semantic.data.value.locality.support, "within_segment");
});
test("borrowed same-shot semantic support keeps positive interval distance", () => {
  const f = tokenFixture({ startSeconds: 2.1, endSeconds: 3 });
  assert.ok(f.token.semantic.data.state === "present"); const l = f.token.semantic.data.value.locality;
  assert.equal(l.support, "same_shot_context"); assert.ok(Math.abs(l.nearestEvidenceDistanceSeconds - 0.1) < 1e-6);
});
test("excluded-end sample is borrowed with zero distance; distance never determines membership", () => {
  const f = tokenFixture({ startSeconds: 1, endSeconds: 2 });
  assert.ok(f.token.semantic.data.state === "present"); const l = f.token.semantic.data.value.locality;
  assert.equal(f.frames.find((s) => s.sampleId === l.supports[0]!.semanticFrameId)!.atSeconds, 2);
  assert.equal(l.support, "same_shot_context"); assert.equal(l.nearestEvidenceDistanceSeconds, 0);
  assert.throws(() => resolveLocality(f.input.candidate, { ...f.evidence, semanticSupport: "within_segment" }, f.frames), /membership/);
});
test("wrong-shot, wrong nearest frame and contradictory distance fail", () => {
  const f = tokenFixture({ startSeconds: 1, endSeconds: 2 });
  assert.throws(() => resolveLocality(f.input.candidate, { ...f.evidence, semanticContextDistanceSeconds: 1 }, f.frames), /distance/);
  assert.throws(() => resolveLocality(f.input.candidate, f.evidence, f.frames.map((s) => ({ ...s, shotId: "other" }))));
  assert.throws(() => resolveLocality(f.input.candidate, { ...f.evidence, contributingSemanticFrameIds: [f.frames[0]!.sampleId] }, f.frames));
});
test("equal-distance borrowed support selects earlier source PTS", () => {
  const f = tokenFixture({ startSeconds: 0.75, endSeconds: 1.75 });
  assert.equal(f.evidence.contributingSemanticFrameIds[0], f.frames[0]!.sampleId);
  assert.doesNotThrow(() => resolveLocality(f.input.candidate, f.evidence, [...f.frames].reverse()));
});
test("measured numeric zero remains zero; missing temporal values remain tagged", () => {
  const f = tokenFixture(), view = resolveTokenView(f.token, f.map());
  assert.deepEqual(view.signals.brightnessMean!.data, present(0)); assert.deepEqual(view.signals.frameDifferenceMean!.data, present(0));
  const one = tokenFixture({ startSeconds: 1, endSeconds: 2 }), oneView = resolveTokenView(one.token, one.map());
  const absent = oneView.signals.frameDifferenceMean!.data;
  assert.equal(absent.state, "unavailable"); assert.ok(!("value" in absent));
  assert.ok(one.token.temporal.data.state === "present"); assert.equal(one.token.temporal.data.value.previousShot.state, "not_applicable");
  assert.equal(one.token.future.music.data.state, "not_computed");
});
test("legacy null causality is unknown, never an invented specific reason", () => {
  const f = tokenFixture({ startSeconds: 1, endSeconds: 2 });
  const result = resolveCheapMissingness(f.evidence, f.analysis.cheapFeatures, f.token.candidateEvidence, false);
  assert.ok(result.every((s) => s.reasonCode === "legacy_reason_unknown"));
});
test("reserved future channels reject present data", () => {
  const f = tokenFixture();
  assert.equal(EditorialTokenSchema.safeParse({ ...f.token, future: { ...f.token.future, music: { provenance: f.adapter, data: present({ beats: [] }) } } }).success, false);
});
test("reidentified token cannot contradict its semantic support sidecar", () => {
  const f = tokenFixture(), { tokenId: _id, ...body } = f.token;
  assert.ok(body.semantic.data.state === "present");
  body.semantic.data.value.locality.support = "same_shot_context";
  const forged = createEditorialToken(body);
  assert.throws(() => resolveTokenView(forged, f.map()), /evidence|snapshot|support/i);
});
test("borrowed cheap evidence cannot supply measured in-window flow", () => {
  const f = tokenFixture({ startSeconds: 2.1, endSeconds: 3 });
  const forged = { ...f.evidence, signals: { ...f.evidence.signals, opticalFlowPixelsPerSecond: 0, stabilityIndicator: 1 } };
  assert.throws(() => resolveCheapMissingness(forged, f.analysis.cheapFeatures, f.token.candidateEvidence, true), /temporal|pair|flow/i);
});
