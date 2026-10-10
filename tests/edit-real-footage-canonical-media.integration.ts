// 3E-C harness compatibility ONLY: generated native 0.4 bytes and structural/stub analysis.
// The accepted H fixture deliberately uses a test backend with the frozen configuration/width.
// No owner footage, model inference, or real-model claim is made by these cases.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createOwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";
import { executeAuthorizedSegmentedRender } from "../scripts/edit-render-local.js";
import { runTechnicalMediaQc } from "../scripts/edit-media-qc-local.js";
import { OwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";
import { systemRuntimeClock } from "../scripts/edit-runtime-local.js";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import { DEFAULT_FOOTAGE_CONFIG, FootageAnalysisSchema, FootageManifestSchema } from "../packages/footage-analyzer/protocol.js";
import { resolveFootagePath, writeFootageJson } from "../scripts/footage-local.js";
import { localBytes } from "../scripts/reference-local.js";
import { CANONICAL_STORE, OWNER_RENDER_AUTHORIZATION_STATEMENT, ownerMediaDeclarations, ownerMediaLosslessDeclarations } from "../packages/edit-render/owner-media.js";
import { registeredFixture, makeAuthority, claimRegistered, permitRegistered, StructuralBackend, type RegisteredFixture } from "./support/registered-derivative-render.js";
import { sha256File } from "./support/canonical-media-fixtures.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, observeMediaSpawns } from "./support/edit-render-media.js";
import { cfrMetadata } from "./support/edit-render.js";
import { footageEnvironment } from "./support/footage.js";
import { mediaCommand } from "./support/footage-media.js";
import type { Json } from "./support/owner-media-canonical.js";
import * as R from "./support/edit-real-footage.js";

let fixture: RegisteredFixture, authority: OwnerMediaLifecycleAuthority, sources: [R.TimelineSource, R.TimelineSource];
let fixtureMilliseconds = 0;
const evidence: unknown[] = [];
before(async () => {
  const start = performance.now();
  await mkdir(".local-runs/phase5-gate7/b3ec-r01-20261010", { recursive: true });
  fixture = await registeredFixture("b3ec-r01-20261010/native-");
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
    const c = await claimRegistered(fixture, { authority, runtimePrefix: "b3ec-r01-20261010/runtime-" }), permit = await permitRegistered(c);
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

// R01 falsification: a second AuthorizedFootageSet is explicit analysis permission, not a replacement root registration.
// The accepted resolver opens its exact nested paths; the accepted analyzer hashes those actual generated files.
// Metadata/detection/sampling/frame hashes/measurements/embeddings use the existing structural fixture services, NOT pretrained
// inference. Source identity/path access and later authority/probe/render/QC use actual generated bytes and accepted native routines.
async function persistedGeneratedAnalysis(entries: readonly string[]) {
  const declared = ownerMediaLosslessDeclarations(fixture.registration), declarations = [...declared.declarations, ...declared.derivatives];
  const jobId = `footage_${randomUUID()}`, manifestPath = join(fixture.base, `${jobId}-authorized-input.json`);
  const manifest = FootageManifestSchema.parse({ ...FootageManifestSchema.parse(fixture.registration.footage), assets: entries.map(entryId => {
    const d = declarations.find(d => d.entryId === entryId)!;
    const location = authority.sourceLocations.find(s => s.assetId === d.assetId)!;
    return { entryId, path: relative(dirname(manifestPath), location.path).replaceAll("\\", "/"), authorization: d.authorization };
  }) });
  await writeFootageJson(manifestPath, manifest);
  const env = await footageEnvironment([...entries]), openedPaths: string[] = [];
  const services = { ...env.services, async open(...args: Parameters<typeof env.services.open>) {
    const [entry] = args, path = await resolveFootagePath(manifestPath, entry.path);
    openedPaths.push(path);
    const structural = await env.services.open(...args);
    return { ...structural, bytes: () => localBytes(path), backend: new StructuralBackend(), expectedDimensions: async () => 1152,
      media: { ...structural.media, metadata: async () => ({ value: { ...cfrMetadata({ seconds: 1, fps: 30, hasAudio: false }),
        codec: entry.entryId === "root" ? "hevc" : "h264" }, version: "generated-fixture-table-native-conformance-required" }) } };
  } };
  // This integration needs one exact full-second candidate per source, configured before the accepted analyzer runs.
  // A wider universe needlessly repeats editorial validation across all 16 CLI scenarios; nothing is truncated afterward.
  const configuration = { ...structuredClone(DEFAULT_FOOTAGE_CONFIG), proposal: { ...DEFAULT_FOOTAGE_CONFIG.proposal,
    durationsSeconds: [1], strideFraction: 1, maximumPerShot: 1, maximumPerAsset: 1, maximumPerProject: 2 } };
  const result = await analyzeFootage(manifest, configuration, jobId, services);
  assert.equal(result.inventory.failures.length, 0);
  assert.equal(result.analyses.length, entries.length);
  assert.equal(result.inventory.candidateCount, entries.length);
  assert.ok(result.analyses.every(a => a.candidates.length === 1 && a.keptCandidateIds.length === 1));
  for (const [index, entry] of manifest.assets.entries()) {
    const d = declarations.find(d => d.entryId === entry.entryId)!;
    assert.equal(openedPaths[index], authority.sourceLocations.find(s => s.assetId === d.assetId)!.path);
    const analysis = result.analyses.find(a => a.assetId === d.assetId)!;
    assert.deepEqual(analysis.authorization, d.authorization);
    assert.deepEqual(await sha256File(openedPaths[index]!), { contentHash: d.contentHash, sizeBytes: d.sizeBytes });
    assert.ok(analysis.authorization.allowedPurposes.includes("local_footage_analysis"));
    assert.ok(analysis.authorization.allowedPurposes.includes("local_evaluation"));
    assert.equal(analysis.authorization.projectId, authority.scope.projectId);
    assert.equal(analysis.authorization.creatorId, authority.scope.creatorId);
    assert.ok(env.telemetry.modelRuns().some(r => r.scope.jobId === jobId && r.scope.projectId === authority.scope.projectId
      && r.scope.creatorId === authority.scope.creatorId && r.inputIds.includes(d.assetId) && r.operation === "embedding" && r.status === "succeeded"));
  }
  const directory = join(PROJECT_ROOT, ".local-runs", jobId);
  // The artifacts the runner consumes, using the accepted CLI's projection from an actual analyzeFootage return.
  // No fabricated or merged analysis/inventory/run; structural services are disclosed in the separate test receipt.
  const record = { jobId, status: "succeeded", modelRuns: env.telemetry.modelRuns(), events: env.telemetry.snapshot(),
    timings: result.timings, cache: result.cacheStats, configuration };
  for (const analysis of result.analyses) await writeFootageJson(join(directory, "assets", `${analysis.analysisId}.json`), analysis);
  await writeFootageJson(join(directory, "FootageInventory.json"), result.inventory);
  await writeFootageJson(join(directory, "run.json"), record);
  evidence.push({ kind: "R01_actual_analyzeFootage_generated_bytes_structural_backend_not_pretrained", jobId,
    inputManifest: relative(PROJECT_ROOT, manifestPath), manifestSha256: (await sha256File(manifestPath)).contentHash,
    analysisFiles: await Promise.all(result.analyses.map(async a => ({ assetId: a.assetId, analysisId: a.analysisId,
      ...await sha256File(join(directory, "assets", `${a.analysisId}.json`)) }))),
    inventorySha256: (await sha256File(join(directory, "FootageInventory.json"))).contentHash,
    runSha256: (await sha256File(join(directory, "run.json"))).contentHash, cache: result.cacheStats });
  return { jobId, directory, result, record };
}
async function invokeOwnerLocalRunner(jobId: string, label: string) {
  const footageManifest = join(fixture.sources, "R01-registered-roots.json"), ownerMediaRegistration = join(fixture.base, "R01-registration.json");
  await writeFootageJson(footageManifest, fixture.registration.footage);
  await writeFootageJson(ownerMediaRegistration, fixture.registration);
  const manifestPath = join(fixture.base, `R01-${label}-run.json`);
  await writeFootageJson(manifestPath, { ...runManifest(), footageManifest, ownerMediaRegistration, canonicalWorkspace: fixture.workspace, analysisJobId: jobId });
  const started = performance.now();
  const command = await mediaCommand(process.execPath,
    ["--import", "./scripts/no-network.mjs", "dist/tests/edit-real-footage.local.js", "--manifest", manifestPath], true);
  const executed = { code: command.exitCode, stdout: command.stdout, stderr: command.stderr };
  evidence.push({ kind: "R01_bounded_CLI_diagnostic_generated_inputs_only", label, jobId, code: executed.code,
    measuredRunnerMilliseconds: performance.now() - started, stdout: executed.stdout, stderr: executed.stderr });
  if (executed.stdout.trim() === "") throw new R.HarnessRefusal("analysis_cli_summary_missing",
    [`${label}: the named runner produced no completed summary within the existing bounded command helper (exit ${executed.code}).`]);
  const summary = JSON.parse(executed.stdout.trim().split(/\r?\n/).at(-1)!) as { receipt: string; valid: boolean; allPassed: boolean };
  const receiptPath = resolve(PROJECT_ROOT, summary.receipt);
  assert.ok(relative(PROJECT_ROOT, receiptPath).replaceAll("\\", "/").startsWith(".local-runs/phase5-gate7/b3d-"));
  const receipt = R.Batch3DReceiptSchema.parse(JSON.parse(await readFile(receiptPath, "utf8")));
  const runnerEvidence = JSON.parse(await readFile(join(dirname(receiptPath), "evidence.json"), "utf8")) as Record<string, unknown>;
  evidence.push({ kind: "R01_actual_owner_local_CLI_generated_fixture_not_real_media", label, jobId, code: executed.code,
    manifestSha256: (await sha256File(manifestPath)).contentHash, receiptPath: summary.receipt, receiptSha256: (await sha256File(receiptPath)).contentHash,
    measuredRunnerMilliseconds: performance.now() - started, receipt, runnerEvidence });
  assert.equal(summary.valid, true);
  return { ...executed, summary, receipt, runnerEvidence };
}

test("3EC-R01 original-only analysis refuses a derivative; a separate completed job is never merged implicitly", async () => {
  const original = await persistedGeneratedAnalysis(["root", "beta"]);
  const independent = await persistedGeneratedAnalysis(["derived"]);
  assert.ok(independent.result.analyses.some(a => a.assetId === fixture.publication.output.assetId));
  assert.ok(original.result.analyses.every(a => a.assetId !== fixture.publication.output.assetId));
  const executed = await invokeOwnerLocalRunner(original.jobId, "original-only");
  assert.equal(executed.code, 1);
  assert.equal(executed.receipt.scenarios.manifest_and_source_verification.status, "FAIL");
  assert.match(executed.receipt.scenarios.manifest_and_source_verification.detail, /^analysis_missing:/);
  assert.equal(executed.receipt.scenarios.source_admissibility.status, "NOT_EXERCISED");
  assert.equal(executed.receipt.records.baselineOutputSha256, null);
  assert.deepEqual(executed.receipt.renderCounts, {});
});
test("3EC-R01 an explicit accepted joint derivative/original analysis reaches the actual unchanged 0.2 CLI and renders", async () => {
  const joint = await persistedGeneratedAnalysis(["derived", "beta"]);
  const derivative = joint.result.analyses.find(a => a.assetId === fixture.publication.output.assetId)!;
  assert.equal(derivative.authorization.sourceType, "system_canonicalized");
  assert.notEqual(derivative.assetId, fixture.publication.source.assetId);
  const executed = await invokeOwnerLocalRunner(joint.jobId, "joint-analysis");
  assert.equal(executed.code, 0, executed.stderr);
  assert.equal(executed.receipt.scenarios.manifest_and_source_verification.status, "PASS");
  assert.equal(executed.receipt.scenarios.source_admissibility.status, "PASS");
  assert.equal(executed.summary.allPassed, true);
  assert.ok(R.SCENARIOS.every(s => executed.receipt.scenarios[s].status === "PASS"));
  assert.deepEqual(executed.receipt.sources.map(s => s.assetId), [derivative.assetId, sources[1].analysis.assetId]);
  assert.equal(executed.receipt.sources[0]!.analysisId, derivative.analysisId);
  const files = executed.runnerEvidence.analysisFiles as { analysisId: string; fileSha256: string }[];
  assert.deepEqual(files.map(f => f.fileSha256), await Promise.all(executed.receipt.sources.map(async s =>
    (await sha256File(join(joint.directory, "assets", `${s.analysisId}.json`))).contentHash)));
  assert.ok(Object.values(executed.receipt.renderCounts).some(c => c.ffmpegRender > 0));
  assert.notEqual(executed.receipt.records.baselineOutputSha256, null);
  assert.notEqual(executed.receipt.records.childOutputSha256, null);
});
test("3EC-R01 the actual 0.2 lookup refuses a valid-schema derivative analysis with altered authorization", async () => {
  const joint = await persistedGeneratedAnalysis(["derived", "beta"]);
  const analysis = joint.result.analyses.find(a => a.assetId === fixture.publication.output.assetId)!;
  await writeFootageJson(join(joint.directory, "R01-untampered-selected-analysis.json"), analysis);
  const fault = structuredClone(analysis);
  fault.authorization.allowedPurposes = fault.authorization.allowedPurposes.filter(p => p !== "local_evaluation");
  // Explicit fault injection in newly owned scratch data, never a positive analyzer output or owner artifact.
  await writeFootageJson(join(joint.directory, "assets", `${analysis.analysisId}.json`), FootageAnalysisSchema.parse(fault));
  const executed = await invokeOwnerLocalRunner(joint.jobId, "altered-authorization");
  assert.equal(executed.code, 1);
  assert.match(executed.receipt.scenarios.manifest_and_source_verification.detail, /^analysis_not_of_declared_bytes:/);
  assert.equal(executed.receipt.scenarios.source_admissibility.status, "NOT_EXERCISED");
  assert.equal(executed.receipt.records.baselineOutputSha256, null);
  assert.deepEqual(executed.receipt.renderCounts, {});
});
test("3EC-R01 the actual 0.2 lookup refuses foreign inventory scope without rendering", async () => {
  const joint = await persistedGeneratedAnalysis(["derived", "beta"]);
  await writeFootageJson(join(joint.directory, "R01-untampered-inventory.json"), joint.result.inventory);
  await writeFootageJson(join(joint.directory, "FootageInventory.json"), { ...joint.result.inventory, projectId: "project_R01_foreign" });
  const executed = await invokeOwnerLocalRunner(joint.jobId, "foreign-inventory");
  assert.equal(executed.code, 1);
  assert.match(executed.receipt.scenarios.manifest_and_source_verification.detail, /^analysis_scope_mismatch:/);
  assert.equal(executed.receipt.scenarios.source_admissibility.status, "NOT_EXERCISED");
  assert.equal(executed.receipt.records.baselineOutputSha256, null);
  assert.deepEqual(executed.receipt.renderCounts, {});
});
