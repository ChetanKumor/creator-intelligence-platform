import assert from "node:assert/strict";
import { test } from "node:test";
import { createDerivedObservation, createObservedFact, createWorldSnapshot, dependencyInvalidation, linkEditorialToken, publishWorldUpdate, queryWorld, validateGroundedSupport, validatePerceptionBinding, validateTemporalRelationship, worldMembershipKeys, WORLD_MAX_NODES, WORLD_MAX_RESULTS } from "../packages/world-model/index.js";
import * as worldModel from "../packages/world-model/index.js";
import { EditorialArtifactMap, missing, present, type ArtifactRef, type SuppliedArtifact } from "../packages/editorial/common.js";
import { exactDigest } from "../packages/editorial/common.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { computationKey } from "../packages/perception/identity.js";
import { contentId } from "../packages/reference-analyzer/features.js";
import { embeddingCacheKey } from "../packages/reference-analyzer/embeddings.js";
import { PerceptionEvidenceStore } from "../packages/perception/store.js";
import { createEditorialToken } from "../packages/editorial/token.js";
import { resolveEditorialToken } from "../packages/editorial/resolve.js";
import { artifact, decisionFixture, tokenFixture } from "./support/editorial.js";

function ownerAlternateSource(x: ReturnType<typeof fixture>) {
  const second = artifact("owner_analysis_second", "FootageAnalysis", x.f.analysis, "1.0.0");
  const support = { ...x.support, analysis: second.ref, rangeEvidence: { ...x.support.rangeEvidence, artifact: second.ref }, timebase: { ...x.support.timebase, artifact: second.ref } };
  const coverage = coverageArtifact(x.f, [x.f.input.analysis, second.ref]);
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, second, coverage]);
  const base = { ...x.base, coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels: [] } };
  return { second, support, coverage, map, base };
}

function finalDistinctCandidateWorld() {
  const x = fixture(), hash = "b".repeat(64), assetId = `asset_${hash}`;
  const source = structuredClone(x.f.analysis);
  source.contentHash = hash; source.assetId = assetId; source.analysisId = "analysis_final_b";
  source.authorization.contentHash = hash;
  source.inventory.assetId = assetId; source.inventory.analysisId = source.analysisId;
  for (const frame of source.semanticFrames) {
    frame.embedding.objectId = embeddingCacheKey(hash, [contentId("sample", ["decoded-png-v1", frame.frameContentHash])], source.configuration.embedding, "frame");
    frame.embedding.embeddingId = contentId("embedding", frame.embedding.objectId);
  }
  for (const evidence of source.candidates) {
    evidence.candidate.assetId = assetId;
    evidence.candidate.candidateId = contentId("segment", [assetId, evidence.candidate.shotId, evidence.candidate.sourceRange, evidence.candidate.proposalConfigurationId]);
    const frames = evidence.contributingSemanticFrameIds.map(id => source.semanticFrames.find(f => f.sampleId === id)!);
    evidence.semanticEmbedding.objectId = embeddingCacheKey(hash, frames.map(f => f.embedding.embeddingId), source.configuration.embedding, "normalized-mean-v1");
    evidence.semanticEmbedding.embeddingId = contentId("embedding", evidence.semanticEmbedding.objectId);
    evidence.aggregationId = contentId("aggregation", [evidence.candidate, frames.map(f => f.embedding), evidence.contributingMeasurementIds, evidence.aggregationVersion]);
  }
  source.keptCandidateIds = source.candidates.map(e => e.candidate.candidateId);
  source.inventory.embeddingSpace = source.semanticFrames[0]!.embedding;
  const analysisB = artifact("final_analysis_b", "FootageAnalysis", source, "1.0.0");
  const run = structuredClone(x.f.run);
  run.modelRuns[0]!.inputIds = [assetId];
  const runB = artifact("final_run_b", "FootageRun", run);
  const at = (pointer: string) => ({ artifact: analysisB.ref, pointer });
  const featureProducer = { ...x.f.input.featureProducer, configuration: at("/configuration"), implementation: present(at("/embeddingImplementation")), sourceEvidence: [at("/candidates/0"), at("/authorization")], runEvidence: present([{ artifact: runB.ref, pointer: "" }]) };
  const adapter = { ...x.f.input.adapter, sourceEvidence: [at("/candidates/0"), at("/authorization")], runEvidence: present([{ artifact: runB.ref, pointer: "" }]) };
  const supplied = [...x.f.supplied, x.media, analysisB, runB];
  const tokenB = resolveEditorialToken({ ...x.f.input, candidate: source.candidates[0]!.candidate, analysis: analysisB.ref, producingRun: { jobId: run.jobId, artifact: runB.ref }, featureProducer, adapter }, new EditorialArtifactMap(supplied));
  const tokenAArtifact = artifact("final_token_a", "EditorialToken", x.f.token, "0.1.0");
  const tokenBArtifact = artifact("final_token_b", "EditorialToken", tokenB, "0.1.0");
  const coverage = coverageArtifact(x.f, [x.f.input.analysis, analysisB.ref], x.base.coverage.channels);
  const mediaB = artifact("final_media_b", "MediaAsset", { ...x.media.value as object, assetId, objectId: "final_source_b", retention: { expiresAt: "2026-09-23T00:00:00.000Z", deletionRequestedAt: null } }, "1.0.0");
  const map = new EditorialArtifactMap([...supplied, tokenAArtifact, tokenBArtifact, coverage, mediaB]);
  const scope = { projectId: x.base.projectId, creatorId: x.base.creatorId, purpose: x.base.purpose };
  const tokenLinks = [linkEditorialToken(tokenAArtifact.ref, map, scope), linkEditorialToken(tokenBArtifact.ref, map, scope)].sort((a, b) => a.tokenId.localeCompare(b.tokenId));
  const supportB = { ...x.support, assetId, sourceHash: hash, analysis: analysisB.ref, rangeEvidence: at("/candidates/0/candidate/sourceRange"), timebase: at("/metadata/frameTimes") };
  const entities = [{ entityId: "final_a", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(x.support) }, { entityId: "final_b", authority: "MediaTruth" as const, kind: "source_range", artifact: analysisB.ref, support: present(supportB) }];
  const candidateLinks = [{ candidateId: x.f.token.candidate.candidateId, token: tokenAArtifact.ref, entityId: "final_a" }, { candidateId: tokenB.candidate.candidateId, token: tokenBArtifact.ref, entityId: "final_b" }].sort((a, b) => canonicalSerialize([a.candidateId, a.token, a.entityId]).localeCompare(canonicalSerialize([b.candidateId, b.token, b.entityId])));
  const world = createWorldSnapshot({ ...x.base, mediaTruthRefs: [x.f.input.analysis, analysisB.ref].sort((a, b) => a.objectId.localeCompare(b.objectId)), entities, tokenLinks, candidateLinks, coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels: x.base.coverage.channels } }, map);
  return { x, world, map, mediaB, tokenAArtifact, tokenBArtifact, candidateA: x.f.token.candidate.candidateId, candidateB: tokenB.candidate.candidateId, assetB: assetId };
}

function ownerParentArtifact(world: ReturnType<typeof createWorldSnapshot>) {
  return artifact(world.worldId, "ProjectWorldModel", world, "0.1.0");
}

function ownerPublish(parent: ReturnType<typeof createWorldSnapshot>, input: Parameters<typeof publishWorldUpdate>[3], supplied: SuppliedArtifact[]) {
  const parentArtifact = ownerParentArtifact(parent);
  return publishWorldUpdate(parent, parentArtifact.ref, [], input, new EditorialArtifactMap([...supplied, parentArtifact]));
}

function ownerMembership(parent: ReturnType<typeof createWorldSnapshot>, parentRef: ArtifactRef, input: Parameters<typeof publishWorldUpdate>[3], map: EditorialArtifactMap) {
  void parentRef; void map;
  const before = worldMembershipKeys(parent), after = worldMembershipKeys({ ...parent, ...input, candidateLinks: input.candidateLinks ?? parent.candidateLinks });
  const beforeSet = new Set(before.map(canonicalSerialize)), afterSet = new Set(after.map(canonicalSerialize));
  return { added: after.filter(key => !beforeSet.has(canonicalSerialize(key))), removed: before.filter(key => !afterSet.has(canonicalSerialize(key))), unchanged: after.filter(key => beforeSet.has(canonicalSerialize(key))) };
}

function coverageArtifact(f: ReturnType<typeof tokenFixture>, refs: ArtifactRef[], channels: unknown[] = []) {
  return artifact(`coverage_${refs.length}`, "WorldCoverageEvidence", { artifactType: "WorldCoverageEvidence", artifactVersion: "0.1.0", projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation", sourceAnalysisRefs: refs.sort((a, b) => a.objectId.localeCompare(b.objectId)), channels, producer: f.adapter }, "0.1.0");
}

function fixture() {
  const f = tokenFixture();
  const media = artifact("current_media_1", "MediaAsset", { contractType: "MediaAsset", schemaVersion: "1.0.0", assetId: f.analysis.assetId, projectId: "project_synthetic", creatorId: "creator_synthetic", kind: "video", objectId: "source_synthetic", durationSeconds: 4, origin: "synthetic", retention: { expiresAt: null, deletionRequestedAt: null } }, "1.0.0");
  const channels = [{ channel: "source_index", state: "complete" as const, evidence: present({ artifact: f.input.analysis, pointer: "/metadata/frameTimes" }) }];
  const coverage = coverageArtifact(f, [f.input.analysis], channels);
  const map = new EditorialArtifactMap([...f.supplied, media, coverage]);
  const auth = { artifact: f.input.analysis, pointer: "/authorization" };
  const support = { assetId: f.analysis.assetId, sourceHash: f.analysis.contentHash, analysis: f.input.analysis, shotId: f.token.candidate.shotId, range: f.token.candidate.sourceRange, rangeEvidence: { artifact: f.input.analysis, pointer: "/candidates/0/candidate/sourceRange" }, timebase: { artifact: f.input.analysis, pointer: "/metadata/frameTimes" }, sample: missing("not_applicable", "range_support") };
  const fact = createObservedFact({ artifactType: "ObservedFact", artifactVersion: "0.1.0", stability: "internal_pre_stable", projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation", subjectId: "subject_1", support, observationType: "detected_subject", value: present(f.token.candidateEvidence), evidence: [f.token.candidateEvidence], producer: f.adapter, computationKey: missing("not_applicable", "legacy_observation"), uncertainty: { state: "unknown", evidence: missing("unavailable", "uncalibrated") }, artifact: f.input.analysis }, map);
  const derived = (dependencies: string[], subjectId = "subject_1", conflicts: string[] = []) => createDerivedObservation({ artifactType: "DerivedObservation", artifactVersion: "0.1.0", stability: "internal_pre_stable", projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation", subjectId, dependencies: dependencies.sort(), interpretationType: "camera_motion", value: present(f.token.candidateEvidence), producer: f.adapter, computationKey: missing("not_applicable", "legacy_derivation"), uncertainty: { state: "unknown", evidence: missing("unavailable", "uncalibrated") }, conflicts, artifact: f.input.analysis });
  const base = { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation", authorization: auth, revision: 0, parent: missing("not_applicable", "initial_snapshot"), asOf: "2026-09-23T00:00:00.000Z", mediaTruthRefs: [], observed: [], derived: [], entities: [], relationships: [], perceptionBindings: [], tokenLinks: [], candidateSetRefs: [], coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels }, changeSet: { evidence: auth, added: [], superseded: [], invalidated: [], unchanged: [] }, builder: f.adapter };
  return { f, media, coverage, map, auth, support, fact, derived, base };
}

function worldWithFact() {
  const x = fixture();
  const entity = { entityId: x.fact.factId, authority: "ObservedFact" as const, kind: "subject", artifact: x.fact.artifact, support: present(x.support) };
  const world = createWorldSnapshot({ ...x.base, observed: [x.fact], entities: [entity], changeSet: { ...x.base.changeSet, added: [x.fact.factId] } }, x.map);
  return { ...x, entity, world };
}

test("world snapshot identity is deterministic and binds asOf", () => {
  const f = tokenFixture();
  const auth = { artifact: f.input.analysis, pointer: "/authorization" };
  const coverage = coverageArtifact(f, []);
  const body = { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation", authorization: auth, revision: 0, parent: { state: "not_applicable" as const, reasonCode: "initial_snapshot", evidenceRefs: [] }, asOf: "2026-09-23T00:00:00.000Z", mediaTruthRefs: [], observed: [], derived: [], entities: [], relationships: [], perceptionBindings: [], tokenLinks: [], candidateSetRefs: [], coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels: [] }, changeSet: { evidence: auth, added: [], superseded: [], invalidated: [], unchanged: [] }, builder: f.adapter };
  const a = createWorldSnapshot(body), b = createWorldSnapshot(body);
  assert.deepEqual(a, b);
  assert.notEqual(a.worldId, createWorldSnapshot({ ...body, asOf: "2026-09-24T00:00:00.000Z" }).worldId);
  assert.throws(() => createWorldSnapshot({ ...body, unknown: true } as unknown as Parameters<typeof createWorldSnapshot>[0]));
  const view = queryWorld(a, { worldId: a.worldId, projectId: a.projectId, creatorId: a.creatorId, purpose: a.purpose, currentAuthorization: auth, currentAccess: [], accessAsOf: a.asOf, queryVersion: "0.1.0", authority: ["ObservedFact"], channels: [], limit: 1, offset: 0 }, new EditorialArtifactMap([...f.supplied, coverage]));
  assert.equal(view.completeness, "partial");
  assert.equal(view.worldId, a.worldId);
});

test("grounded source support binds exact hash, range, timebase and half-open sample", () => {
  const x = fixture();
  assert.deepEqual(validateGroundedSupport(x.support, x.map), x.support);
  for (const patch of [{ sourceHash: "b".repeat(64) }, { range: { startSeconds: 1, endSeconds: 3 } }, { timebase: x.auth }, { rangeEvidence: x.auth }]) assert.throws(() => validateGroundedSupport({ ...x.support, ...patch }, x.map));
  const frame = x.f.analysis.cheapFeatures[2]!;
  assert.throws(() => validateGroundedSupport({ ...x.support, sample: present({ sampleId: frame.sample.sampleId, frameIndex: frame.sample.frameIndex, atSeconds: frame.sample.atSeconds, frameHash: frame.frameContentHash }) }, x.map));
});

test("observed and derived authority remain disjoint; creative dependencies cannot enter graph", () => {
  const x = worldWithFact(), d = x.derived([x.fact.factId]);
  assert.ok(createWorldSnapshot({ ...x.base, observed: [x.fact], derived: [d], entities: [x.entity], changeSet: { ...x.base.changeSet, added: [d.derivedId, x.fact.factId].sort() } }, x.map));
  const bad = x.derived(["creative_hypothesis_1"]);
  assert.throws(() => createWorldSnapshot({ ...x.base, observed: [x.fact], derived: [bad], entities: [x.entity] }, x.map));
  assert.throws(() => createWorldSnapshot({ ...x.base, observed: [x.fact], derived: [x.derived([x.fact.factId, "creative_hypothesis_1"])], entities: [x.entity] }, x.map));
  assert.throws(() => createObservedFact({ ...x.fact, observationType: "camera_motion" } as never, x.map));
});

test("same-source chronology validates before, overlaps, contains and adjacency", () => {
  const x = fixture();
  const one = { entityId: "one", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(x.support) };
  const two = { ...one, entityId: "two", support: present({ ...x.support, range: { startSeconds: 2, endSeconds: 3 } }) };
  const relation = (type: "before" | "overlaps" | "contains" | "adjacent_to" | "aligned_with", from = "one", to = "two") => ({ relationshipId: "relation", type, from, to, clockMap: missing("not_applicable", "same_source") });
  validateTemporalRelationship(relation("before"), [one, two]);
  validateTemporalRelationship(relation("adjacent_to"), [one, two]);
  assert.throws(() => validateTemporalRelationship(relation("overlaps"), [one, two]));
  assert.throws(() => validateTemporalRelationship(relation("contains"), [one, two]));
  validateTemporalRelationship(relation("contains", "one", "one"), [one, two]);
  validateTemporalRelationship(relation("overlaps", "one", "one"), [one, two]);
  const foreign = { ...two, support: present({ ...x.support, assetId: "asset_foreign" }) };
  assert.throws(() => validateTemporalRelationship(relation("aligned_with"), [one, foreign]));
});

test("cross-source alignment requires exact supplied clock map, units, support and error", () => {
  const x = fixture(), second = artifact("object_analysis_second", "FootageAnalysis", x.f.analysis, "1.0.0");
  const other = { ...x.support, analysis: second.ref, rangeEvidence: { ...x.support.rangeEvidence, artifact: second.ref }, timebase: { ...x.support.timebase, artifact: second.ref } };
  const mapArtifact = artifact("clockmap_1", "ClockMap", { artifactType: "ClockMap", artifactVersion: "0.1.0", from: x.support, to: other, units: "seconds", errorSeconds: 0.01 }, "0.1.0");
  const coverage = coverageArtifact(x.f, [x.f.input.analysis, second.ref]);
  const map = new EditorialArtifactMap([...x.f.supplied, second, mapArtifact, coverage]);
  const entities = [{ entityId: "one", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(x.support) }, { entityId: "two", authority: "MediaTruth" as const, kind: "source_range", artifact: second.ref, support: present(other) }];
  const rel = { relationshipId: "alignment_1", type: "aligned_with" as const, from: "one", to: "two", clockMap: present({ artifact: mapArtifact.ref, units: "seconds" as const, errorSeconds: 0.01, support: { artifact: mapArtifact.ref, pointer: "" } }) };
  const world = { ...x.base, coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels: [] }, mediaTruthRefs: [x.f.input.analysis, second.ref], entities };
  assert.ok(createWorldSnapshot({ ...world, relationships: [rel] }, map));
  assert.throws(() => createWorldSnapshot({ ...world, relationships: [{ ...rel, clockMap: present({ ...rel.clockMap.value, errorSeconds: 1 }) }] }, map));
  assert.throws(() => createWorldSnapshot({ ...world, relationships: [{ ...rel, clockMap: missing("unavailable", "no_alignment") }] }, map));
});

test("derived dependency closure invalidates transitively while an unrelated branch survives", () => {
  const x = worldWithFact(), a = x.derived([x.fact.factId], "a"), b = x.derived([a.derivedId], "b"), c = x.derived([x.fact.factId], "c");
  const derived = [a, b, c].sort((l, r) => l.derivedId.localeCompare(r.derivedId));
  const world = createWorldSnapshot({ ...x.base, observed: [x.fact], derived, entities: [x.entity], changeSet: { ...x.base.changeSet, added: [x.fact.factId, ...derived.map(d => d.derivedId)].sort() } }, x.map);
  assert.deepEqual(dependencyInvalidation(world, [a.derivedId]), [a.derivedId, b.derivedId].sort());
  assert.equal(dependencyInvalidation(world, [a.derivedId]).includes(c.derivedId), false);
  assert.throws(() => dependencyInvalidation(world, ["foreign"]));
});

test("publication pins exact parent, leaves parent immutable and rejects bad revisions or cycles", () => {
  const x = worldWithFact(), parentBytes = JSON.stringify(x.world);
  const parentArtifact = ownerParentArtifact(x.world), ref = parentArtifact.ref;
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, parentArtifact]);
  const input = { ...x.base, asOf: "2026-09-24T00:00:00.000Z", observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } };
  const child = publishWorldUpdate(x.world, ref, [], { ...input, changeSet: { ...input.changeSet, membership: ownerMembership(x.world, ref, input, map) } }, map);
  assert.equal(child.revision, 1);
  assert.equal(JSON.stringify(x.world), parentBytes);
  assert.throws(() => publishWorldUpdate(x.world, ref, [ref], { ...x.base, observed: [x.fact], entities: [x.entity] }, map));
  assert.throws(() => publishWorldUpdate(x.world, ref, [], { ...x.base, asOf: "2026-09-24T00:00:00.000Z", observed: [x.fact], entities: [x.entity] }, map));
  assert.equal(JSON.stringify(x.world), parentBytes);
  assert.throws(() => createWorldSnapshot({ ...x.base, revision: 1 }, x.map));
  assert.throws(() => (x.world.observed as unknown as unknown[]).push(x.fact));
});

test("bounded query has stable identity, omission and partial channel coverage", () => {
  const x = worldWithFact();
  const q = { worldId: x.world.worldId, projectId: x.world.projectId, creatorId: x.world.creatorId, purpose: x.world.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: x.world.asOf, queryVersion: "0.1.0", authority: ["ObservedFact"], channels: ["source_index"], limit: 1, offset: 0 };
  const v = queryWorld(x.world, q, x.map);
  assert.deepEqual(v, queryWorld(x.world, q, x.map));
  assert.equal(v.returned.length, 1);
  assert.equal(queryWorld(x.world, { ...q, channels: ["speech"] }, x.map).completeness, "partial");
  assert.throws(() => queryWorld(x.world, { ...q, limit: WORLD_MAX_RESULTS + 1 }, x.map));
  assert.throws(() => queryWorld(x.world, { ...q, creatorId: "foreign" }, x.map), /World view unavailable/);
  assert.throws(() => queryWorld(x.world, { ...q, worldId: "latest" }, x.map), /World view unavailable/);
  assert.throws(() => queryWorld(x.world, { ...q, assetId: "asset_unknown" }, x.map), /World view unavailable/);
  assert.throws(() => (v.returned as unknown as unknown[]).pop());
  const second = { entityId: "source_media", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(x.support) };
  const expanded = createWorldSnapshot({ ...x.base, mediaTruthRefs: [x.f.input.analysis], observed: [x.fact], entities: [x.entity, second].sort((l, r) => l.entityId.localeCompare(r.entityId)), changeSet: { ...x.base.changeSet, added: [x.fact.factId] } }, x.map);
  const limited = queryWorld(expanded, { ...q, worldId: expanded.worldId, authority: ["MediaTruth", "ObservedFact"] }, x.map);
  assert.equal(limited.completeness, "bounded");
  assert.equal(limited.omittedCount, 1);
  assert.equal(limited.nextOffset, 1);
});

test("explicit conflicting derivations coexist and invalidation removes only current view memberships", () => {
  const x = worldWithFact(), a = x.derived([x.fact.factId], "a"), b = x.derived([x.fact.factId], "b", [a.derivedId]);
  const derived = [a, b].sort((l, r) => l.derivedId.localeCompare(r.derivedId));
  const entities = [x.entity, ...derived.map(d => ({ entityId: d.derivedId, authority: "DerivedObservation" as const, kind: "interpretation", artifact: d.artifact, support: missing("unavailable", "derived_source_support_not_proven") }))].sort((l, r) => l.entityId.localeCompare(r.entityId));
  const parent = createWorldSnapshot({ ...x.base, observed: [x.fact], derived, entities, changeSet: { ...x.base.changeSet, added: [x.fact.factId, ...derived.map(d => d.derivedId)].sort() } }, x.map);
  assert.equal(parent.derived.length, 2);
  const closure = dependencyInvalidation(parent, [x.fact.factId]);
  const parentArtifact = ownerParentArtifact(parent), parentRef = parentArtifact.ref;
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, parentArtifact]);
  const input = { ...x.base, asOf: "2026-09-24T00:00:00.000Z", observed: [x.fact], derived, entities, changeSet: { ...x.base.changeSet, superseded: [x.fact.factId], invalidated: closure } };
  const child = publishWorldUpdate(parent, parentRef, [], { ...input, changeSet: { ...input.changeSet, membership: ownerMembership(parent, parentRef, input, map) } }, map);
  const query = { worldId: child.worldId, projectId: child.projectId, creatorId: child.creatorId, purpose: child.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: child.asOf, queryVersion: "0.1.0", authority: ["DerivedObservation", "ObservedFact"], channels: ["source_index"], limit: 10, offset: 0 };
  assert.equal(queryWorld(child, query, x.map).returned.length, 0);
  assert.equal(queryWorld(child, query, x.map).completeness, "partial");
  assert.equal(parent.derived.length, 2);
  assert.equal(queryWorld(parent, { ...query, worldId: parent.worldId }, x.map).returned.length, 3);
});

test("same candidate in two token snapshots keeps two exact artifact links and old token bytes", () => {
  const x = fixture(), original = artifact("token_original", "EditorialToken", x.f.token, "0.1.0");
  const { tokenId: _ignored, ...body } = x.f.token;
  const changed = createEditorialToken({ ...body, clipSegment: missing("unavailable", "different_supplied_state") });
  const second = artifact("token_second", "EditorialToken", changed, "0.1.0");
  const before = JSON.stringify(x.f.token);
  const map = new EditorialArtifactMap([...x.f.supplied, original, second]);
  const scope = { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" };
  const one = linkEditorialToken(original.ref, map, scope), two = linkEditorialToken(second.ref, map, scope);
  assert.equal(one.candidateId, two.candidateId);
  assert.notEqual(one.tokenId, two.tokenId);
  assert.notEqual(one.token.objectId, two.token.objectId);
  assert.equal(JSON.stringify(x.f.token), before);
  for (const channel of Object.values(changed.future)) assert.notEqual(channel.data.state, "present");
});

test("Gate-1 reuse join binds exact scope, key, output schema and grounded range", () => {
  const x = fixture(), evidence = x.f.token.candidateEvidence;
  const identity = {
    identityVersion: "perception-computation-1.0.0" as const, operationKind: "source_embedding", computationClass: "deterministic_tool" as const,
    inputs: [{ kind: "source" as const, assetId: x.support.assetId, contentHash: x.support.sourceHash, sizeBytes: 1, support: { kind: "range" as const, range: x.support.range, timebase: x.support.analysis } }],
    producer: { producerId: "test_producer", implementationVersion: "1.0.0", implementationDigest: "a".repeat(64), adapter: missing("not_applicable", "tool") },
    model: missing("not_applicable", "tool"), preprocessing: missing("not_applicable", "tool"), configurationDigest: "b".repeat(64),
    semanticExecutionSettings: evidence, outputSchema: { artifactType: "EmbeddingBatch", artifactVersion: "1.0.0", semanticSpace: missing("not_applicable", "tool") },
    determinism: { kind: "deterministic" as const, policy: evidence },
  };
  const receipt = { receiptType: "PerceptionReuseReceipt" as const, receiptVersion: "0.1.0" as const, computationKey: computationKey(identity), output: { objectId: "output_1", sha256: "c".repeat(64), artifactType: "EmbeddingBatch", artifactVersion: "1.0.0" }, selectedAttempt: { objectId: "attempt_1", sha256: "d".repeat(64), artifactType: "PerceptionAttempt", artifactVersion: "0.1.0" }, selection: { objectId: "selection_1", sha256: "e".repeat(64), artifactType: "PerceptionOutputSelection", artifactVersion: "0.1.0" }, scope: { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" }, reuseStatus: "reused" as const, modelRunCreated: false as const };
  const binding = { receipt, identity, currentAuthorization: x.auth, support: x.support };
  assert.deepEqual(validatePerceptionBinding(binding, x.map), binding);
  const frame = x.f.analysis.cheapFeatures[0]!;
  const frameSupport = { ...x.support, sample: present({ sampleId: frame.sample.sampleId, frameIndex: frame.sample.frameIndex, atSeconds: frame.sample.atSeconds, frameHash: frame.frameContentHash }) };
  const frameIdentity = { ...identity, inputs: [{ ...identity.inputs[0]!, support: { kind: "frame" as const, sampleId: frame.sample.sampleId, frameIndex: frame.sample.frameIndex, atSeconds: frame.sample.atSeconds, frameHash: frame.frameContentHash, timebase: x.support.analysis } }] };
  assert.ok(validatePerceptionBinding({ ...binding, identity: frameIdentity, support: frameSupport, receipt: { ...receipt, computationKey: computationKey(frameIdentity) } }, x.map));
  for (const changed of [{ ...binding, receipt: { ...receipt, scope: { ...receipt.scope, creatorId: "foreign" } } }, { ...binding, receipt: { ...receipt, output: { ...receipt.output, artifactVersion: "2.0.0" } } }, { ...binding, identity: { ...identity, configurationDigest: "f".repeat(64) } }, { ...binding, identity: { ...identity, inputs: [{ ...identity.inputs[0]!, sizeBytes: 2 }] } }, { ...binding, support: { ...x.support, range: { startSeconds: 2, endSeconds: 3 } } }]) assert.throws(() => validatePerceptionBinding(changed, x.map));
  assert.equal("snapshot" in PerceptionEvidenceStore.prototype, false);
  assert.equal("entries" in PerceptionEvidenceStore.prototype, false);
  assert.equal("listAll" in PerceptionEvidenceStore.prototype, false);
});

test("legacy token link derives creator from exact authorized FootageAnalysis", () => {
  const f = tokenFixture();
  const token = artifact("token_exact", "EditorialToken", f.token, "0.1.0");
  const link = linkEditorialToken(token.ref, new EditorialArtifactMap([...f.supplied, token]), { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" });
  assert.equal(link.tokenId, f.token.tokenId);
  assert.deepEqual(link.token, token.ref);
  assert.throws(() => linkEditorialToken(token.ref, new EditorialArtifactMap([...f.supplied, token]), { projectId: "project_synthetic", creatorId: "foreign", purpose: "local_evaluation" }));
});

test("legacy adapter preserves half-open borrowed support without relabeling", () => {
  const f = tokenFixture({ startSeconds: 2.1, endSeconds: 3 });
  assert.equal(f.token.semantic.data.state, "present");
  if (f.token.semantic.data.state !== "present") throw new Error("Fixture semantic evidence absent.");
  const before = JSON.stringify(f.token.semantic.data.value.locality);
  assert.equal(f.token.semantic.data.value.locality.support, "same_shot_context");
  const token = artifact("token_borrowed", "EditorialToken", f.token, "0.1.0");
  linkEditorialToken(token.ref, new EditorialArtifactMap([...f.supplied, token]), { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" });
  assert.equal(JSON.stringify(f.token.semantic.data.value.locality), before);
});

test("foreign supplied artifacts do not change scoped view identity, counts or completeness", () => {
  const x = worldWithFact();
  const q = { worldId: x.world.worldId, projectId: x.world.projectId, creatorId: x.world.creatorId, purpose: x.world.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: x.world.asOf, queryVersion: "0.1.0", authority: ["ObservedFact"], channels: ["source_index"], limit: 1, offset: 0 };
  const foreign = artifact("foreign_unrelated", "Unrelated", { projectId: "foreign", secret: "inaccessible" }, "1.0.0");
  assert.deepEqual(queryWorld(x.world, q, x.map), queryWorld(x.world, q, new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, foreign])));
  assert.throws(() => createObservedFact({ ...x.fact, creatorId: "foreign" } as never, x.map));
  for (const patch of [{ creatorId: "foreign" }, { projectId: "foreign" }, { purpose: "foreign" }, { currentAuthorization: { ...x.auth, pointer: "/inventory" } }]) assert.throws(() => queryWorld(x.world, { ...q, ...patch }, x.map), /World view unavailable/);
});

test("current retention is checked separately from historical world authorization", () => {
  const x = worldWithFact();
  const q = { worldId: x.world.worldId, projectId: x.world.projectId, creatorId: x.world.creatorId, purpose: x.world.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: x.world.asOf, queryVersion: "0.1.0", authority: ["ObservedFact"], channels: ["source_index"], limit: 1, offset: 0 };
  assert.equal(queryWorld(x.world, q, x.map).returned.length, 1);
  assert.throws(() => queryWorld(x.world, { ...q, currentAccess: [] }, x.map), /World view unavailable/);
  const base = x.media.value as { retention: { expiresAt: string | null; deletionRequestedAt: string | null } };
  for (const retention of [{ expiresAt: x.world.asOf, deletionRequestedAt: null }, { expiresAt: null, deletionRequestedAt: x.world.asOf }]) {
    const revoked = artifact("current_media_revoked", "MediaAsset", { ...base, retention }, "1.0.0");
    assert.throws(() => queryWorld(x.world, { ...q, currentAccess: [revoked.ref] }, new EditorialArtifactMap([...x.f.supplied, x.coverage, revoked])), /World view unavailable/);
  }
  assert.equal(queryWorld(x.world, q, x.map).returned.length, 1);
});

test("unknown fields and execution callbacks cannot enter world schemas or query", () => {
  const x = worldWithFact();
  assert.throws(() => createWorldSnapshot({ ...x.base, observed: [x.fact], entities: [x.entity], model: () => 1 } as never, x.map));
  assert.throws(() => createWorldSnapshot({ ...x.base, observed: [{ ...x.fact, providerResponse: {} }], entities: [x.entity] } as never, x.map));
  assert.throws(() => queryWorld(x.world, { worldId: x.world.worldId, projectId: x.world.projectId, creatorId: x.world.creatorId, purpose: x.world.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: x.world.asOf, queryVersion: "0.1.0", authority: ["ObservedFact"], channels: ["source_index"], limit: 1, offset: 0, compute: () => 1 }, x.map));
});

test("coverage completeness cannot be relabeled without an exact matching attestation", () => {
  const x = worldWithFact();
  assert.throws(() => createWorldSnapshot({ ...x.base, observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, added: [x.fact.factId] }, coverage: { ...x.base.coverage, channels: [{ channel: "source_index", state: "missing", evidence: missing("unavailable", "not_indexed") }] } }, x.map), /Coverage attestation/);
  const unrelated = { ...x.base.coverage, evidence: x.auth };
  assert.throws(() => createWorldSnapshot({ ...x.base, observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, added: [x.fact.factId] }, coverage: unrelated }, x.map), /Exact world coverage attestation/);
});

test("unbound observation payload cannot enter the factual world even when bytes are supplied", () => {
  const x = fixture(), foreign = artifact("foreign_observation", "ObservedPayload", { claim: "unrelated" }, "1.0.0");
  const { factId: _ignored, ...body } = x.fact;
  const map = new EditorialArtifactMap([...x.f.supplied, foreign]);
  assert.throws(() => createObservedFact({ ...body, artifact: foreign.ref, value: present({ artifact: foreign.ref, pointer: "" }), evidence: [{ artifact: foreign.ref, pointer: "" }] }, map), /authorized source binding/);
});

test("supplied candidate set binds exact token snapshots", () => {
  const f = decisionFixture();
  const coverage = coverageArtifact(f, f.set.analysisRefs);
  const map = new EditorialArtifactMap([...f.supplied, coverage]);
  const scope = { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" };
  const links = f.tokenArtifacts.map(t => linkEditorialToken(t.ref, map, scope)).sort((a, b) => a.tokenId.localeCompare(b.tokenId));
  const auth = { artifact: f.input.analysis, pointer: "/authorization" };
  const body = { ...scope, authorization: auth, revision: 0, parent: missing("not_applicable", "initial_snapshot"), asOf: "2026-09-23T00:00:00.000Z", mediaTruthRefs: [], observed: [], derived: [], entities: [], relationships: [], perceptionBindings: [], tokenLinks: links, candidateSetRefs: [f.setArtifact.ref], coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels: [] }, changeSet: { evidence: auth, added: [], superseded: [], invalidated: [], unchanged: [] }, builder: f.adapter };
  assert.equal(createWorldSnapshot(body, map).candidateSetRefs.length, 1);
  assert.throws(() => createWorldSnapshot({ ...body, tokenLinks: links.slice(0, 1) }, map));
});

test("owner review: observed entity cannot substitute another valid source support", () => {
  const x = fixture(), y = ownerAlternateSource(x);
  const entity = { entityId: x.fact.factId, authority: "ObservedFact" as const, kind: "subject", artifact: x.fact.artifact, support: present(y.support) };
  assert.throws(() => createWorldSnapshot({ ...y.base, observed: [x.fact], entities: [entity], changeSet: { ...x.base.changeSet, added: [x.fact.factId] } }, y.map));
});

test("owner review: MediaTruth entity support must belong to its named exact analysis", () => {
  const x = fixture(), y = ownerAlternateSource(x);
  const entity = { entityId: "source_a", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(y.support) };
  assert.throws(() => createWorldSnapshot({ ...y.base, mediaTruthRefs: [x.f.input.analysis, y.second.ref], entities: [entity] }, y.map));
});

test("owner review: derived entity cannot invent another grounded source", () => {
  const x = fixture(), y = ownerAlternateSource(x), d = x.derived([x.fact.factId]);
  const entities = [{ entityId: x.fact.factId, authority: "ObservedFact" as const, kind: "subject", artifact: x.fact.artifact, support: present(x.support) }, { entityId: d.derivedId, authority: "DerivedObservation" as const, kind: "interpretation", artifact: d.artifact, support: present(y.support) }].sort((a, b) => a.entityId.localeCompare(b.entityId));
  assert.throws(() => createWorldSnapshot({ ...y.base, observed: [x.fact], derived: [d], entities, changeSet: { ...x.base.changeSet, added: [x.fact.factId, d.derivedId].sort() } }, y.map));
});

test("owner review: clock-map support rejects right object ID with wrong digest", () => {
  const x = fixture(), y = ownerAlternateSource(x);
  const clock = artifact("owner_clock", "ClockMap", { artifactType: "ClockMap", artifactVersion: "0.1.0", from: x.support, to: y.support, units: "seconds", errorSeconds: 0.02 }, "0.1.0");
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, y.second, y.coverage, clock]);
  const entities = [{ entityId: "a", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(x.support) }, { entityId: "b", authority: "MediaTruth" as const, kind: "source_range", artifact: y.second.ref, support: present(y.support) }];
  const relation = { relationshipId: "aligned", type: "aligned_with" as const, from: "a", to: "b", clockMap: present({ artifact: clock.ref, units: "seconds" as const, errorSeconds: 0.02, support: { artifact: { ...clock.ref, sha256: "f".repeat(64) }, pointer: "" } }) };
  const body = { ...y.base, mediaTruthRefs: [x.f.input.analysis, y.second.ref], entities, relationships: [relation] };
  assert.throws(() => createWorldSnapshot(body, map));
  assert.throws(() => createWorldSnapshot({ ...body, relationships: [{ ...relation, clockMap: present({ ...relation.clockMap.value, support: { artifact: clock.ref, pointer: "/does_not_exist" } }) }] }, map));
  for (const value of [{ units: "frames" as const }, { errorSeconds: 1 }]) assert.throws(() => createWorldSnapshot({ ...body, relationships: [{ ...relation, clockMap: present({ ...relation.clockMap.value, support: { artifact: clock.ref, pointer: "" }, ...value }) }] }, map));
  const wrongClock = artifact("owner_wrong_clock", "ClockMap", { artifactType: "ClockMap", artifactVersion: "0.1.0", from: y.support, to: x.support, units: "seconds", errorSeconds: 0.02 }, "0.1.0");
  const wrongMap = new EditorialArtifactMap([...x.f.supplied, x.media, y.second, y.coverage, wrongClock]);
  assert.throws(() => createWorldSnapshot({ ...body, relationships: [{ ...relation, clockMap: present({ ...relation.clockMap.value, artifact: wrongClock.ref, support: { artifact: wrongClock.ref, pointer: "" } }) }] }, wrongMap));
});

test("owner review: set-like fact evidence cannot drift by caller order", () => {
  const x = fixture(), { factId: _id, ...body } = x.fact;
  const auth = { artifact: x.f.input.analysis, pointer: "/authorization" };
  const sorted = [auth, x.f.token.candidateEvidence];
  const first = createObservedFact({ ...body, evidence: sorted }, x.map);
  assert.equal(createObservedFact({ ...body, evidence: [...sorted].reverse() }, x.map).factId, first.factId);
});

test("owner review: exact parent bytes are distinct from semantic world identity", () => {
  const x = worldWithFact();
  const bytes = new TextEncoder().encode(JSON.stringify(x.world, null, 2));
  const exact = { ref: { objectId: x.world.worldId, artifactType: "ProjectWorldModel", artifactVersion: "0.1.0", sha256: exactDigest(bytes) }, bytes, value: x.world };
  const child = { ...x.base, asOf: "2026-09-24T00:00:00.000Z", observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } };
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, exact]);
  const declared = { ...child, changeSet: { ...child.changeSet, membership: ownerMembership(x.world, exact.ref, child, map) } };
  assert.equal(publishWorldUpdate(x.world, exact.ref, [], declared, map).revision, 1);
  const wrong = { ...exact.ref, sha256: exactDigest(new TextEncoder().encode(canonicalSerialize(x.world))) };
  assert.throws(() => publishWorldUpdate(x.world, wrong, [], declared, map));
  assert.notEqual(x.world.worldId, exact.ref.sha256);
});

test("owner review: unresolved missingness evidence cannot enter world identity", () => {
  const x = fixture(), absent = { artifact: { objectId: "missing_evidence", artifactType: "MissingEvidence", artifactVersion: "1.0.0", sha256: "f".repeat(64) }, pointer: "" };
  assert.throws(() => validateGroundedSupport({ ...x.support, sample: missing("unavailable", "sample_missing", [absent]) }, x.map));
  const { factId: _id, ...body } = x.fact;
  for (const patch of [{ value: missing("unavailable", "value_missing", [absent]) }, { uncertainty: { state: "unknown" as const, evidence: missing("unavailable", "uncertain", [absent]) } }]) assert.throws(() => createObservedFact({ ...body, ...patch }, x.map));
  const channels = [{ channel: "speech", state: "missing" as const, evidence: missing("unavailable", "not_available", [absent]) }];
  const coverage = coverageArtifact(x.f, [x.f.input.analysis], channels);
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, coverage]);
  assert.throws(() => createWorldSnapshot({ ...x.base, coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels }, observed: [x.fact], entities: [{ entityId: x.fact.factId, authority: "ObservedFact", kind: "subject", artifact: x.fact.artifact, support: present(x.support) }], changeSet: { ...x.base.changeSet, added: [x.fact.factId] } }, map));
});

test("owner review: candidate query uses exact candidate, token snapshot and entity association", () => {
  const x = fixture(), token = artifact("owner_token", "EditorialToken", x.f.token, "0.1.0");
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, token]);
  const link = linkEditorialToken(token.ref, map, { projectId: x.base.projectId, creatorId: x.base.creatorId, purpose: x.base.purpose });
  const entity = { entityId: x.fact.factId, authority: "ObservedFact" as const, kind: "subject", artifact: x.fact.artifact, support: present(x.support) };
  const association = { candidateId: link.candidateId, token: token.ref, entityId: entity.entityId };
  const world = createWorldSnapshot({ ...x.base, observed: [x.fact], entities: [entity], tokenLinks: [link], candidateLinks: [association], changeSet: { ...x.base.changeSet, added: [x.fact.factId] } } as never, map);
  const q = { worldId: world.worldId, projectId: world.projectId, creatorId: world.creatorId, purpose: world.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: world.asOf, queryVersion: "0.1.0", authority: ["ObservedFact"], channels: ["source_index"], assetId: x.support.assetId, candidateId: link.candidateId, token: token.ref, limit: 10, offset: 0 };
  assert.deepEqual(queryWorld(world, q, map).returned.map(e => e.entityId), [entity.entityId]);
  assert.equal(queryWorld(world, { ...q, candidateId: "candidate_other" }, map).returned.length, 0);
  assert.equal(queryWorld(world, { ...q, token: { ...token.ref, objectId: "other_token" } }, map).returned.length, 0);
  assert.throws(() => createWorldSnapshot({ ...x.base, observed: [x.fact], entities: [entity], tokenLinks: [link], candidateLinks: [{ ...association, token: { ...token.ref, objectId: "foreign_token" } }], changeSet: { ...x.base.changeSet, added: [x.fact.factId] } } as never, map));
});

test("owner review: every non-factual membership change needs inventory", () => {
  const x = worldWithFact(), next = "2026-09-24T00:00:00.000Z";
  const baseChild = { ...x.base, asOf: next, observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } };
  const token = artifact("owner_inventory_token", "EditorialToken", x.f.token, "0.1.0");
  const tokenMap = new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, token]);
  const link = linkEditorialToken(token.ref, tokenMap, { projectId: x.base.projectId, creatorId: x.base.creatorId, purpose: x.base.purpose });
  assert.throws(() => ownerPublish(x.world, { ...baseChild, tokenLinks: [link] }, [...x.f.supplied, x.media, x.coverage, token]));
  assert.throws(() => ownerPublish(x.world, { ...baseChild, mediaTruthRefs: [x.f.input.analysis] }, [...x.f.supplied, x.media, x.coverage]));

  const mediaEntity = { entityId: "source_entity", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(x.support) };
  const parentWithMedia = createWorldSnapshot({ ...x.base, mediaTruthRefs: [x.f.input.analysis], observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, added: [x.fact.factId] } }, x.map);
  const twoEntities = [x.entity, mediaEntity].sort((a, b) => a.entityId.localeCompare(b.entityId));
  assert.throws(() => ownerPublish(parentWithMedia, { ...baseChild, mediaTruthRefs: [x.f.input.analysis], entities: twoEntities }, [...x.f.supplied, x.media, x.coverage]));
  const parentWithEntities = createWorldSnapshot({ ...x.base, mediaTruthRefs: [x.f.input.analysis], observed: [x.fact], entities: twoEntities, changeSet: { ...x.base.changeSet, added: [x.fact.factId] } }, x.map);
  const relation = { relationshipId: "same_source_overlap", type: "overlaps" as const, from: "source_entity", to: x.fact.factId, clockMap: missing("not_applicable", "same_source") };
  assert.throws(() => ownerPublish(parentWithEntities, { ...baseChild, mediaTruthRefs: [x.f.input.analysis], entities: twoEntities, relationships: [relation] }, [...x.f.supplied, x.media, x.coverage]));
});

test("owner review: perception binding and candidate-set changes need inventory", () => {
  const x = worldWithFact(), evidence = x.f.token.candidateEvidence;
  const identity = { identityVersion: "perception-computation-1.0.0" as const, operationKind: "source_embedding", computationClass: "deterministic_tool" as const,
    inputs: [{ kind: "source" as const, assetId: x.support.assetId, contentHash: x.support.sourceHash, sizeBytes: 1, support: { kind: "range" as const, range: x.support.range, timebase: x.support.analysis } }],
    producer: { producerId: "test_producer", implementationVersion: "1.0.0", implementationDigest: "a".repeat(64), adapter: missing("not_applicable", "tool") },
    model: missing("not_applicable", "tool"), preprocessing: missing("not_applicable", "tool"), configurationDigest: "b".repeat(64), semanticExecutionSettings: evidence,
    outputSchema: { artifactType: "EmbeddingBatch", artifactVersion: "1.0.0", semanticSpace: missing("not_applicable", "tool") }, determinism: { kind: "deterministic" as const, policy: evidence } };
  const receipt = { receiptType: "PerceptionReuseReceipt" as const, receiptVersion: "0.1.0" as const, computationKey: computationKey(identity), output: { objectId: "output_inventory", sha256: "c".repeat(64), artifactType: "EmbeddingBatch", artifactVersion: "1.0.0" }, selectedAttempt: { objectId: "attempt_inventory", sha256: "d".repeat(64), artifactType: "PerceptionAttempt", artifactVersion: "0.1.0" }, selection: { objectId: "selection_inventory", sha256: "e".repeat(64), artifactType: "PerceptionOutputSelection", artifactVersion: "0.1.0" }, scope: { projectId: x.base.projectId, creatorId: x.base.creatorId, purpose: x.base.purpose }, reuseStatus: "reused" as const, modelRunCreated: false as const };
  const binding = { receipt, identity, currentAuthorization: x.auth, support: x.support };
  assert.throws(() => ownerPublish(x.world, { ...x.base, asOf: "2026-09-24T00:00:00.000Z", observed: [x.fact], entities: [x.entity], perceptionBindings: [binding], changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } }, [...x.f.supplied, x.media, x.coverage]));

  const f = decisionFixture(), coverage = coverageArtifact(f, f.set.analysisRefs), map = new EditorialArtifactMap([...f.supplied, coverage]);
  const links = f.tokenArtifacts.map(t => linkEditorialToken(t.ref, map, { projectId: x.base.projectId, creatorId: x.base.creatorId, purpose: x.base.purpose })).sort((a, b) => a.tokenId.localeCompare(b.tokenId));
  const parent = createWorldSnapshot({ ...x.base, authorization: { artifact: f.input.analysis, pointer: "/authorization" }, coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels: [] }, observed: [], entities: [], tokenLinks: links, changeSet: { ...x.base.changeSet, added: [] } }, map);
  assert.throws(() => ownerPublish(parent, { ...x.base, authorization: parent.authorization, coverage: parent.coverage, asOf: "2026-09-24T00:00:00.000Z", observed: [], entities: [], tokenLinks: links, candidateSetRefs: [f.setArtifact.ref], changeSet: { ...x.base.changeSet, unchanged: [] } }, [...f.supplied, coverage]));
});

test("owner review: revoked unrelated source does not couple an asset-bounded view", () => {
  const x = fixture(), hash = "b".repeat(64), source = structuredClone(x.f.analysis);
  source.contentHash = hash; source.assetId = `asset_${hash}`; source.analysisId = "analysis_owner_b";
  source.authorization.contentHash = hash;
  source.inventory.assetId = source.assetId; source.inventory.analysisId = source.analysisId;
  for (const candidate of source.candidates) {
    candidate.candidate.assetId = source.assetId;
    candidate.aggregationId = contentId("aggregation", [candidate.candidate, source.semanticFrames.filter(f => candidate.contributingSemanticFrameIds.includes(f.sampleId)).map(f => f.embedding), candidate.contributingMeasurementIds, candidate.aggregationVersion]);
  }
  const second = artifact("owner_distinct_analysis", "FootageAnalysis", source, "1.0.0");
  const supportB = { ...x.support, assetId: source.assetId, sourceHash: hash, analysis: second.ref, rangeEvidence: { ...x.support.rangeEvidence, artifact: second.ref }, timebase: { ...x.support.timebase, artifact: second.ref } };
  const coverage = coverageArtifact(x.f, [x.f.input.analysis, second.ref], x.base.coverage.channels);
  const expired = artifact("owner_media_b", "MediaAsset", { ...x.media.value as object, assetId: source.assetId, objectId: "source_b", retention: { expiresAt: "2026-09-23T00:00:00.000Z", deletionRequestedAt: null } }, "1.0.0");
  const map = new EditorialArtifactMap([...x.f.supplied, x.media, second, coverage, expired]);
  const entities = [{ entityId: "source_a", authority: "MediaTruth" as const, kind: "source_range", artifact: x.f.input.analysis, support: present(x.support) }, { entityId: "source_b", authority: "MediaTruth" as const, kind: "source_range", artifact: second.ref, support: present(supportB) }];
  const world = createWorldSnapshot({ ...x.base, mediaTruthRefs: [x.f.input.analysis, second.ref], entities, coverage: { evidence: { artifact: coverage.ref, pointer: "" }, channels: x.base.coverage.channels } }, map);
  const query = { worldId: world.worldId, projectId: world.projectId, creatorId: world.creatorId, purpose: world.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: world.asOf, queryVersion: "0.1.0", authority: ["MediaTruth"], channels: ["source_index"], assetId: x.support.assetId, limit: 10, offset: 0 };
  const a = queryWorld(world, query, map);
  assert.deepEqual(a.returned.map(e => e.entityId), ["source_a"]);
  assert.throws(() => queryWorld(world, { ...query, assetId: source.assetId, currentAccess: [expired.ref] }, map), /World view unavailable/);
  const bCurrent = artifact("owner_media_b_current", "MediaAsset", { ...x.media.value as object, assetId: source.assetId, objectId: "source_b", retention: { expiresAt: null, deletionRequestedAt: null } }, "1.0.0");
  const mapWithBCurrent = new EditorialArtifactMap([...x.f.supplied, x.media, second, coverage, bCurrent]);
  assert.deepEqual(queryWorld(world, query, mapWithBCurrent), a);
});

test("owner review: declared membership addition passes while silent removal and coverage changes fail", () => {
  const x = worldWithFact(), input = { ...x.base, asOf: "2026-09-24T00:00:00.000Z", observed: [x.fact], entities: [x.entity], mediaTruthRefs: [x.f.input.analysis] };
  const parentArtifact = ownerParentArtifact(x.world), map = new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, parentArtifact]);
  const declared = { ...x.base.changeSet, unchanged: [x.fact.factId], membership: ownerMembership(x.world, parentArtifact.ref, { ...input, changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } }, map) };
  assert.equal(publishWorldUpdate(x.world, parentArtifact.ref, [], { ...input, changeSet: declared } as never, map).revision, 1);

  const parent = createWorldSnapshot({ ...x.base, mediaTruthRefs: [x.f.input.analysis], observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, added: [x.fact.factId] } }, x.map);
  assert.throws(() => ownerPublish(parent, { ...input, mediaTruthRefs: [], changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } }, [...x.f.supplied, x.media, x.coverage]));
  const changedCoverage = coverageArtifact(x.f, [x.f.input.analysis], [{ channel: "speech", state: "missing", evidence: missing("unavailable", "no_speech") }]);
  assert.throws(() => ownerPublish(x.world, { ...x.base, asOf: input.asOf, observed: [x.fact], entities: [x.entity], coverage: { evidence: { artifact: changedCoverage.ref, pointer: "" }, channels: [{ channel: "speech", state: "missing", evidence: missing("unavailable", "no_speech") }] }, changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } }, [...x.f.supplied, x.media, changedCoverage]));
});

test("final owner review: candidate lookup cannot distinguish inaccessible B from absence under authorized A", () => {
  const f = finalDistinctCandidateWorld(), { x, world, map } = f;
  const q = { worldId: world.worldId, projectId: world.projectId, creatorId: world.creatorId, purpose: world.purpose, currentAuthorization: x.auth, currentAccess: [x.media.ref], accessAsOf: world.asOf, queryVersion: "0.1.0", authority: ["MediaTruth"], channels: ["source_index"], assetId: x.support.assetId, limit: 10, offset: 0 };
  const hidden = queryWorld(world, { ...q, candidateId: f.candidateB }, map);
  const absent = queryWorld(world, { ...q, candidateId: "candidate_final_absent" }, map);
  assert.deepEqual(hidden.returned, absent.returned);
  assert.equal(hidden.completeness, absent.completeness);
  assert.equal(hidden.omittedCount, absent.omittedCount);
  const { assetId: _assetId, ...noAsset } = q;
  const observable = (candidateId: string) => { try { return { kind: "view", returned: queryWorld(world, { ...noAsset, candidateId }, map).returned.length }; } catch (error) { return { kind: "error", name: (error as Error).name, message: (error as Error).message }; } };
  assert.deepEqual(observable(f.candidateB), observable("candidate_final_absent"));
  assert.throws(() => queryWorld(world, { ...noAsset, candidateId: f.candidateA }, map), /candidate.*asset/i);
  assert.deepEqual(queryWorld(world, { ...q, candidateId: f.candidateA, token: f.tokenAArtifact.ref }, map).returned.map(e => e.entityId), ["final_a"]);
  assert.equal(queryWorld(world, { ...q, candidateId: f.candidateA, token: f.tokenBArtifact.ref }, map).returned.length, 0);
  for (const candidateId of [f.candidateB, "candidate_final_absent"]) assert.throws(() => queryWorld(world, { ...q, assetId: f.assetB, candidateId, currentAccess: [f.mediaB.ref] }, map), /World view unavailable/);
});

test("final owner review: present observed uncertainty evidence requires exact artifact and pointer", () => {
  const x = fixture(), { factId: _factId, ...body } = x.fact;
  const valid = { artifact: x.f.input.analysis, pointer: "/authorization" };
  assert.ok(createObservedFact({ ...body, uncertainty: { state: "unknown", evidence: present(valid) } }, x.map));
  const unknown = { artifact: { ...x.f.input.analysis, objectId: "final_unknown_analysis" }, pointer: "/authorization" };
  for (const evidence of [unknown, { artifact: { ...x.f.input.analysis, sha256: "f".repeat(64) }, pointer: "/authorization" }, { artifact: x.f.input.analysis, pointer: "/not_present" }]) {
    assert.throws(() => createObservedFact({ ...body, uncertainty: { state: "unknown", evidence: present(evidence) } }, x.map));
  }
});

test("final owner review: present derived uncertainty evidence requires exact artifact and pointer", () => {
  const x = fixture(), d = x.derived([x.fact.factId]), { derivedId: _derivedId, ...body } = d;
  const worldWith = (evidence: ReturnType<typeof present>) => {
    const derived = createDerivedObservation({ ...body, uncertainty: { state: "unknown", evidence } } as never);
    return createWorldSnapshot({ ...x.base, observed: [x.fact], derived: [derived], entities: [{ entityId: x.fact.factId, authority: "ObservedFact", kind: "subject", artifact: x.fact.artifact, support: present(x.support) }], changeSet: { ...x.base.changeSet, added: [x.fact.factId, derived.derivedId].sort() } }, x.map);
  };
  assert.ok(worldWith(present({ artifact: x.f.input.analysis, pointer: "/authorization" })));
  for (const evidence of [{ artifact: { ...x.f.input.analysis, objectId: "final_unknown_analysis" }, pointer: "/authorization" }, { artifact: { ...x.f.input.analysis, sha256: "f".repeat(64) }, pointer: "/authorization" }, { artifact: x.f.input.analysis, pointer: "/not_present" }]) assert.throws(() => worldWith(present(evidence)));
});

test("final owner review: only publication can create a non-initial revision", () => {
  const x = worldWithFact(), realParent = ownerParentArtifact(x.world), map = new EditorialArtifactMap([...x.f.supplied, x.media, x.coverage, realParent]);
  const direct = { ...x.base, revision: 1, parent: present({ ...realParent.ref, objectId: "fake_parent" }), observed: [x.fact], entities: [x.entity] };
  assert.throws(() => createWorldSnapshot(direct, map));
  assert.throws(() => createWorldSnapshot({ ...direct, parent: present(realParent.ref) }, map));
  const input = { ...x.base, asOf: "2026-09-24T00:00:00.000Z", observed: [x.fact], entities: [x.entity], changeSet: { ...x.base.changeSet, unchanged: [x.fact.factId] } };
  const declared = { ...input, changeSet: { ...input.changeSet, membership: ownerMembership(x.world, realParent.ref, input, map) } };
  const child = publishWorldUpdate(x.world, realParent.ref, [], declared, map);
  assert.equal(child.revision, x.world.revision + 1);
  assert.throws(() => publishWorldUpdate(x.world, { ...realParent.ref, sha256: "f".repeat(64) }, [], declared, map));
  assert.equal(x.world.revision, 0);
});

test("final owner review: membership maximum covers every schema-permitted collection", () => {
  const maximum = (worldModel as unknown as { WORLD_MAX_MEMBERSHIPS?: number }).WORLD_MAX_MEMBERSHIPS;
  assert.ok(typeof maximum === "number" && maximum >= 8 * WORLD_MAX_NODES + 256 + 1);
});
