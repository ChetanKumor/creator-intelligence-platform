// 3E-C harness compatibility ONLY: generated native 0.4 bytes and structural/stub analysis.
// The accepted H fixture deliberately uses a test backend with the frozen configuration/width.
// No owner footage, model inference, or real-model claim is made by these cases.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createOwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";
import { executeAuthorizedSegmentedRender } from "../scripts/edit-render-local.js";
import { runTechnicalMediaQc } from "../scripts/edit-media-qc-local.js";
import { OwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";
import { systemRuntimeClock } from "../scripts/edit-runtime-local.js";
import { FootageAnalysisSchema } from "../packages/footage-analyzer/protocol.js";
import { CANONICAL_STORE, OWNER_RENDER_AUTHORIZATION_STATEMENT, ownerMediaDeclarations, ownerMediaLosslessDeclarations } from "../packages/edit-render/owner-media.js";
import { registeredFixture, makeAuthority, claimRegistered, permitRegistered, type RegisteredFixture } from "./support/registered-derivative-render.js";
import { sha256File } from "./support/canonical-media-fixtures.js";
import { PINNED_TOOL_ROOT, observeMediaSpawns } from "./support/edit-render-media.js";
import type { Json } from "./support/owner-media-canonical.js";
import * as R from "./support/edit-real-footage.js";

let fixture: RegisteredFixture, authority: OwnerMediaLifecycleAuthority, sources: [R.TimelineSource, R.TimelineSource];
let fixtureMilliseconds = 0;
const evidence: unknown[] = [];
before(async () => {
  const start = performance.now();
  await mkdir(".local-runs/phase5-gate7/b3ec-20261009", { recursive: true });
  fixture = await registeredFixture("b3ec-20261009/native-");
  authority = await makeAuthority(fixture);
  const declared = ownerMediaLosslessDeclarations(fixture.registration);
  const analyses = fixture.execution.artifacts.filter(a => a.ref.artifactType === "FootageAnalysis").map(a => FootageAnalysisSchema.parse(a.value));
  sources = [declared.derivatives[0]!, declared.declarations.find(d => d.entryId === "beta")!].map(d => ({ entryId: d.entryId,
    analysis: analyses.find(a => a.assetId === d.assetId)! })) as [R.TimelineSource, R.TimelineSource];
  assert.ok(sources.every(s => s.analysis !== undefined));
  fixtureMilliseconds = performance.now() - start;
});
const options = (a: unknown = authority, registration: unknown = fixture.registration) => ({ sourceAudio: "excluded" as const, outputResolution: null, realMedia: true,
  registeredMedia: { registration, authority: a, asOf: systemRuntimeClock.now() } });
const refusal = (run: () => unknown) => {
  try { run(); } catch (error) { if (error instanceof R.HarnessRefusal) return [error.code, ...error.reasons].join(" | "); throw error; }
  return null;
};

test("3EC-RED-A the additive owner-local run form accepts explicit 0.3 registration and canonical workspace", () => {
  const manifest = { manifestType: "Batch3DRealFootageRun", schemaVersion: "0.2.0", footageManifest: "C:/owner/approved/roots.json",
    ownerMediaRegistration: "C:/owner/approved/registration.json", canonicalWorkspace: "C:/owner/approved/canonical",
    analysisJobId: "footage_00000000-0000-4000-8000-00000000b2b2", renderAuthorization: fixture.registration.renderAuthorization,
    timeline: sources.map(s => ({ entryId: s.entryId, candidateId: null })), sourceAudio: "excluded", outputResolution: null };
  assert.equal(R.RealFootageRunManifestSchema.safeParse(manifest).success, true,
    "the old runner form cannot express an explicitly registered 0.4 derivative; only a bounded new form should admit it");
});
test("3EC-RED-B a genuine registered 0.4 derivative passes eligibility with exact structural analysis binding", () => {
  const plan = R.planOutput(sources, options());
  assert.deepEqual(plan.resolution, { width: 90, height: 160 });
  assert.deepEqual(plan.frameRate, { numerator: 30, denominator: 1 });
  assert.equal(sources[0].analysis.authorization.sourceType, "system_canonicalized", "a derivative is never relabelled as its original");
});
test("3EC-NEG-B an undeclared derivative and detached/counterfeit authority still refuse", () => {
  assert.match(refusal(() => R.planOutput(sources, { sourceAudio: "excluded", outputResolution: null, realMedia: true }))!, /analysis_not_owner_real_media:derived/);
  for (const fake of [null, { registrationDigest: authority.registrationDigest, declared: authority.declared, scope: authority.scope },
    Object.create(OwnerMediaLifecycleAuthority.prototype) as unknown]) {
    assert.match(refusal(() => R.planOutput(sources, options(fake)))!, /source_not_admissible/);
  }
});

const runManifest = () => {
  const manifest = R.RealFootageRunManifestSchema.parse({ manifestType: "Batch3DRealFootageRun", schemaVersion: "0.2.0",
  footageManifest: "C:/owner/approved/roots.json", ownerMediaRegistration: "C:/owner/approved/registration.json", canonicalWorkspace: "C:/owner/approved/canonical",
  analysisJobId: "footage_00000000-0000-4000-8000-00000000b2b2", renderAuthorization: fixture.registration.renderAuthorization,
    timeline: sources.map(s => ({ entryId: s.entryId, candidateId: null })), sourceAudio: "excluded", outputResolution: null });
  if (manifest.schemaVersion !== "0.2.0") assert.fail("explicit canonical run version");
  return manifest;
};
const reg = () => structuredClone(fixture.registration) as { footage: { projectId: string; creatorId: string; assets: { authorization: Json }[] };
  canonicalDerivatives: { rootEntryId: string; authorization: Json; derivation: Json }[]; renderAuthorization: Json; artifactVersion: string };

test("3EC-A version dispatch reuses accepted declarations, and exact 0.1 originals retain their parser and digest", () => {
  const manifest = runManifest(), selected = R.registrationForRun(manifest, fixture.registration.footage, fixture.registration);
  assert.equal(selected.registration.artifactVersion, "0.3.0");
  assert.equal(selected.registrationDigest, authority.registrationDigest);
  assert.deepEqual(selected.declarations.map(d => d.assetId).sort(), authority.declared.map(d => d.assetId).sort());
  const footage = reg().footage;
  footage.assets.forEach(a => { a.authorization.schemaVersion = "1.0.0"; delete a.authorization.canonicalizationConsent; });
  const { ownerMediaRegistration: _registration, canonicalWorkspace: _workspace, ...oldFields } = manifest as Extract<R.RealFootageRunManifest, { schemaVersion: "0.2.0" }>;
  const old = R.RealFootageRunManifestSchema.parse({ ...oldFields, schemaVersion: "0.1.0",
    renderAuthorization: { ...manifest.renderAuthorization, statement: OWNER_RENDER_AUTHORIZATION_STATEMENT } });
  const expected = ownerMediaDeclarations({ artifactType: "OwnerMediaRegistration", artifactVersion: "0.1.0", stability: "internal_pre_stable", footage,
    renderAuthorization: old.renderAuthorization });
  const actual = R.registrationForRun(old, footage);
  assert.equal(actual.registrationDigest, expected.registrationDigest); assert.deepEqual(actual.declarations, expected.declarations);
  assert.equal(actual.derivatives.length, 0);
});
test("3EC-A explicit registration is mandatory and must exactly match the root set, render authorization and canonical timeline", () => {
  const manifest = runManifest();
  assert.throws(() => R.registrationForRun(manifest, fixture.registration.footage));
  const foreign = reg().footage; foreign.projectId = "project_foreign";
  assert.match(refusal(() => R.registrationForRun(manifest, foreign, fixture.registration))!, /registration_run_mismatch/);
  const owner = { ...manifest, renderAuthorization: { ...manifest.renderAuthorization, owner: { kind: "owner" as const, actorId: "owner_foreign" } } };
  assert.match(refusal(() => R.registrationForRun(owner, fixture.registration.footage, fixture.registration))!, /registration_run_mismatch/);
  const noDerivative = { ...manifest, timeline: [{ entryId: "root", candidateId: null }, { entryId: "beta", candidateId: null }] as const };
  assert.match(refusal(() => R.registrationForRun(noDerivative as R.RealFootageRunManifest, fixture.registration.footage, fixture.registration))!, /canonical_timeline_missing/);
});

const registrationAttacks: Record<string, (r: ReturnType<typeof reg>) => void> = {
  "foreign-project": r => { r.footage.projectId = "project_foreign"; },
  "foreign-creator": r => { r.footage.creatorId = "creator_foreign"; },
  "wrong-root-hash": r => { r.footage.assets[0]!.authorization.contentHash = "f".repeat(64); },
  "wrong-root-lineage": r => { r.canonicalDerivatives[0]!.rootEntryId = "beta"; },
  "wrong-derivation": r => { r.canonicalDerivatives[0]!.derivation.derivationId = "canonical_media_derivation_v4_" + "f".repeat(64); },
  "wrong-registration-version": r => { r.artifactVersion = "0.2.0"; },
  "invalid-derivative-authorization": r => { r.canonicalDerivatives[0]!.authorization.allowedPurposes = ["local_reference_analysis"]; },
  "undeclared-derivative": r => { r.canonicalDerivatives = []; },
};
for (const [name, attack] of Object.entries(registrationAttacks)) test("3EC-registration-refuses-" + name, () => {
  const r = reg(); attack(r);
  assert.match(refusal(() => R.planOutput(sources, options(authority, r)))!, /canonical_registration_invalid|canonical_authority_registration_mismatch/);
});
test("3EC-analysis refuses another valid live authority whose explicit render registration differs", async () => {
  const r = reg(); r.renderAuthorization.owner = { kind: "owner", actorId: "other_explicit_owner" };
  const other = await makeAuthority(fixture, systemRuntimeClock, r);
  assert.match(refusal(() => R.planOutput(sources, options(other)))!, /canonical_authority_registration_mismatch/);
});
const analysisAttacks: Record<string, (s: R.TimelineSource[]) => void> = {
  "missing": s => { s[0]!.analysis = undefined as never; },
  "other-exact-asset": s => { s[0]!.analysis = s[1]!.analysis; },
  "wrong-hash": s => { s[0]!.analysis.contentHash = "f".repeat(64); },
  "wrong-size": s => { s[0]!.analysis.authorization.sizeBytes++; },
  "foreign-project": s => { s[0]!.analysis.authorization.projectId = "project_foreign"; },
  "foreign-creator": s => { s[0]!.analysis.authorization.creatorId = "creator_foreign"; },
  "relabelled-as-original": s => {
    const a = s[0]!.analysis.authorization as unknown as Json;
    a.schemaVersion = "1.0.0"; a.sourceType = "owner_supplied"; delete a.derivedFrom;
  },
  "synthetic-presented-as-real": s => {
    const a = s[0]!.analysis.authorization as unknown as Json;
    a.schemaVersion = "1.0.0"; a.sourceType = "synthetic"; a.authorizationBasis = "synthetic_generated"; delete a.derivedFrom;
  },
  "stub-configuration": s => { (s[0]!.analysis.configuration.embedding as unknown as Json).mode = "stub"; },
  "wrong-frozen-width": s => {
    const a = s[0]!.analysis; a.inventory.embeddingSpace.dimensions = 1148;
    a.semanticFrames.forEach(f => { f.embedding.dimensions = 1148; }); a.candidates.forEach(c => { c.semanticEmbedding.dimensions = 1148; });
  },
  "wrong-geometry": s => { s[0]!.analysis.metadata.width = 92; },
  "wrong-coded-geometry": s => { s[0]!.analysis.metadata.codedWidth = 92; },
  "wrong-frame-table": s => { s[0]!.analysis.metadata.frameTimes[1] = 0.034; },
  "wrong-audio-state": s => { s[0]!.analysis.metadata.hasAudio = true; },
};
for (const [name, attack] of Object.entries(analysisAttacks)) test("3EC-analysis-refuses-" + name, () => {
  const s = structuredClone(sources); attack(s);
  assert.match(refusal(() => R.planOutput(s, options()))!, /canonical_analysis_missing_or_invalid|canonical_analysis_binding_mismatch|analysis_not_frozen_semantic_model|canonical_analysis_media_mismatch/);
});
for (const target of ["root", "derivative"] as const) for (const kind of ["deleted", "expired"] as const)
test(`3EC-live-${target}-${kind}-refuses-derivative-eligibility`, async () => {
  const a = await makeAuthority(fixture), id = target === "root" ? fixture.publication.source.assetId : fixture.publication.output.assetId;
  if (kind === "deleted") a.requestDeletion(id); else a.setExpiry(id, systemRuntimeClock.now());
  assert.match(refusal(() => R.planOutput(sources, options(a)))!, new RegExp(`canonical_lifecycle_refused:derived:lifecycle_${kind}`));
});
test("3EC-A missing canonical object, workspace or pinned verification runtime cannot create an authority", async () => {
  for (const extra of [{}, { canonicalWorkspace: fixture.workspace }])
    await assert.rejects(createOwnerMediaLifecycleAuthority({ registration: fixture.registration, baseDirectory: fixture.sources, clock: systemRuntimeClock, ...extra }),
      { code: "lifecycle_authority_scope_invalid" });
  const missing = join(fixture.base, "missing-object"), store = join(missing, ...CANONICAL_STORE.directory);
  for (const d of [CANONICAL_STORE.objects, CANONICAL_STORE.computations, CANONICAL_STORE.pending]) await mkdir(join(store, d), { recursive: true });
  await assert.rejects(makeAuthority(fixture, systemRuntimeClock, fixture.registration, missing), { code: "cache_corrupt" });
});
test("3EC generated derivative eligibility joins the accepted claim, genuine permit, pinned render and independent QC", async () => {
  const plan = R.planOutput(sources, options()), start = performance.now(), spawns = observeMediaSpawns();
  try {
    const c = await claimRegistered(fixture, { authority, runtimePrefix: "b3ec-20261009/runtime-" }), permit = await permitRegistered(c);
    assert.deepEqual(c.call.dag.admission.sources.map(s => s.assetId).sort(), sources.map(s => s.analysis.assetId).sort());
    const rendered = await executeAuthorizedSegmentedRender(permit);
    assert.equal(rendered.outcome, "succeeded"); if (rendered.outcome !== "succeeded") assert.fail();
    const qc = await runTechnicalMediaQc({ dag: c.call.dag, receipt: rendered.receipt, runtime: c.runtime, toolRoot: PINNED_TOOL_ROOT });
    assert.equal(qc.verdict, "pass"); assert.equal(qc.execution.receiptId, rendered.receipt.receiptId);
    assert.equal(qc.execution.dagId, c.call.dag.dag.dagId); assert.equal(qc.execution.programId, rendered.receipt.program.programId);
    assert.equal(qc.output.contentHash, rendered.receipt.output.contentHash); assert.equal(qc.observedIdentity.contentHash, rendered.receipt.output.contentHash);
    assert.equal(spawns.calls.filter(s => s.arguments.includes("-benchmark")).length, rendered.receipt.processes.length);
    assert.ok(rendered.receipt.processes.length > 0);
    evidence.push({ plan, execution: rendered, qc, lifecycle: permit.binding.lifecycleAuthority, spawns: spawns.calls,
      measuredWorkflowMilliseconds: performance.now() - start, analysisEvidence: "generated structural/stub; no frozen-model inference" });
  } finally { spawns.restore(); }
});
after(async () => {
  const derivative = authority.sourceLocations.find(s => s.assetId === fixture.publication.output.assetId)!;
  const originals = [await sha256File(fixture.rootPath), await sha256File(fixture.betaPath)], canonical = await sha256File(derivative.path);
  const beta = ownerMediaLosslessDeclarations(fixture.registration).declarations.find(d => d.entryId === "beta")!;
  assert.deepEqual(originals[0], { contentHash: fixture.publication.source.contentHash, sizeBytes: fixture.publication.source.sizeBytes });
  assert.deepEqual(originals[1], { contentHash: beta.contentHash, sizeBytes: beta.sizeBytes });
  assert.deepEqual(canonical, { contentHash: fixture.publication.output.contentHash, sizeBytes: fixture.publication.output.sizeBytes });
  assert.notEqual(originals[0]!.contentHash, originals[1]!.contentHash, "distinct generated sources only; no owner-media distinctness claim");
  await writeFile(join(fixture.base, "3ec-harness-native-evidence.json"), JSON.stringify({ evidenceKind: "generated_native_media_structural_analysis_stub_backend_no_model_no_owner_media",
    originals, canonical, fixtureMilliseconds, evidence }, null, 2) + "\n", { flag: "wx" });
});

test("3EC-RED-C selected analysis is read once; a getter cannot substitute unregistered media after validation", () => {
  const foreign = structuredClone(sources[1]!.analysis);
  foreign.metadata.width = foreign.metadata.codedWidth = 180; foreign.metadata.height = foreign.metadata.codedHeight = 320;
  let reads = 0;
  const swapping: R.TimelineSource = { entryId: "derived", get analysis() { return ++reads === 1 ? sources[0]!.analysis : foreign; } };
  const plan = R.planOutput([swapping, sources[1]!], options());
  assert.deepEqual(plan.resolution, { width: 90, height: 160 }, "planning must use the exact analysis that passed the declaration join");
  assert.equal(reads, 1, "a selected caller analysis is read once into owned parsed data");
});
