// H: actual generated media through accepted registration/staging/permit/render/QC APIs.
// Analysis and editorial inputs are explicitly structural/stub. No owner footage or pretrained inference.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs, { chmod, copyFile, mkdir, readFile, readdir, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { EditRuntimeError, openValidatedDag, ownedKey, stageClaimedSource } from "../packages/edit-runtime/index.js";
import { ExecutablePermit, TrustedMediaRuntime, completedProbeRun, executeAuthorizedRender, executeAuthorizedSegmentedRender, issueExecutablePermit, processFailureCodeOf, supervisePinnedProcess } from "../scripts/edit-render-local.js";
import { runTechnicalMediaQc } from "../scripts/edit-media-qc-local.js";
import { EditRenderError, accountingOfReceipt, compileRenderProgram, createRealExecutionPolicy, outputArtifactIdOf, RenderExecutionFailureSchema, RenderExecutionReceiptSchema,
  TechnicalMediaQcReceiptSchema, type RenderExecutionReceipt } from "../packages/edit-render/index.js";
import * as owner from "../packages/edit-render/owner-media.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { FootageAuthorizationDerivedSchema } from "../packages/footage-analyzer/protocol.js";
import { ChromaSafeDerivationSchema, buildChromaSafeDerivation } from "../packages/media-ingest/chroma.js";
import { EXACT_PIXEL_METHOD, buildCanonicalReencodeDerivation } from "../packages/media-ingest/reencode.js";
import { compactLosslessComputationRecordOf } from "../packages/media-ingest/lossless-record.js";
import { CanonicalIngestError, canonicalizeLocalMedia } from "../scripts/media-ingest-local.js";
import { sha256File } from "./support/canonical-media-fixtures.js";
import { PINNED_TOOL_ROOT, generateWrongOutput, observeMediaSpawns } from "./support/edit-render-media.js";
import { ManualRuntimeClock } from "./support/edit-runtime.js";
import { registeredFixture, claimRegistered, makeAuthority, prepareRegistered, type ClaimedRegistered, type RegisteredFixture } from "./support/registered-derivative-render.js";
type Json = Record<string, unknown>;
let fixture: RegisteredFixture;
const evidence: unknown[] = [];
before(async () => { fixture = await registeredFixture(); });
after(async () => {
  assert.deepEqual(await sha256File(fixture.rootPath), { contentHash: fixture.publication.source.contentHash, sizeBytes: fixture.publication.source.sizeBytes }, "generated original source bytes remain unchanged");
  const derivedPath = (await makeAuthority(fixture)).sourceLocations.find(s => s.assetId === fixture.publication.output.assetId)!.path;
  assert.deepEqual(await sha256File(derivedPath), { contentHash: fixture.publication.output.contentHash, sizeBytes: fixture.publication.output.sizeBytes }, "published canonical fixture bytes remain unchanged");
  const path = join(fixture.base, "h-render-qc-receipts.json");
  await writeFile(path, JSON.stringify({ evidenceKind: "native_generated_media_structural_analysis_stub_embeddings_no_owner_footage_no_model", evidence }, null, 2) + "\n", { flag: "wx" });
  console.log("H evidence: " + path);
});

// The genuine H permit can also enter the accepted 3B executor. Close its same pre-execution windows without adding any segmented feature.
for (const target of ["root", "derived"] as const) for (const kind of ["deletion", "expiry"] as const)
for (const boundary of ["before-start", "before-first-native-process"] as const)
test(`H-segmented-${target}-${kind}-${boundary}`, async () => {
  const clock = clockNow(), c = await claimRegistered(fixture, { clock }), permit = await issueExecutablePermit(await prepareRegistered(c));
  const original = fs.open, spawns = observeMediaSpawns(), stagedPath = stagedPathOf(c); let attacked = false, binaryOpens = 0;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    const h = await original(...args), path = String(args[0]);
    if (path === join(PINNED_TOOL_ROOT, "bin", "ffmpeg.exe")) binaryOpens++;
    if (!attacked && (boundary === "before-start" ? path === stagedPath : binaryOpens === 2)) { attacked = true; change(c, target, kind); }
    return h;
  }) as typeof fs.open;
  syncBuiltinESMExports();
  try {
    const result = await executeAuthorizedSegmentedRender(permit, {}); evidence.push({ case: `segmented-${target}-${kind}-${boundary}`, attacked, result });
    assert.equal(attacked, true); assert.equal(result.outcome, "failed"); if (result.outcome !== "failed") assert.fail();
    assert.equal(result.failure.failureCode, kind === "deletion" ? "lifecycle_deleted" : "lifecycle_expired");
    assert.equal(result.failure.executionStarted, boundary !== "before-start"); assert.equal(result.failure.processes.length, 0); assert.equal(result.failure.output, "none_published");
    assert.equal(renderCount(spawns), 0); assert.equal(await refused(() => executeAuthorizedRender(permit)), "permit_consumed");
  } finally { fs.open = original; syncBuiltinESMExports(); spawns.restore(); }
});
for (const duringStartedExecution of [false, true])
test("H-existing segmented registered-source render and native QC preserve execution-start semantics-" + duringStartedExecution, async () => {
  const clock = clockNow(), c = await claimRegistered(fixture, { clock }), permit = await issueExecutablePermit(await prepareRegistered(c));
  const original = fs.open, spawns = observeMediaSpawns(); let binaryOpens = 0, changed = false;
  if (duringStartedExecution) {
    fs.open = (async (...args: Parameters<typeof fs.open>) => { const h = await original(...args);
      if (String(args[0]) === join(PINNED_TOOL_ROOT, "bin", "ffmpeg.exe") && ++binaryOpens === 3) {
        // The first native stage has already completed; this does not cancel the operation that began while authorized.
        clock.advance(1); c.authority.requestDeletion(fixture.publication.source.assetId); changed = true;
      } return h;
    }) as typeof fs.open;
    syncBuiltinESMExports();
  }
  try {
    const result = await executeAuthorizedSegmentedRender(permit, {}); evidence.push({ case: "segmented-start-semantics-" + duringStartedExecution, changed, result });
    assert.equal(result.outcome, "succeeded", JSON.stringify(result)); if (result.outcome !== "succeeded") assert.fail();
    assert.equal(result.receipt.processes.length, 3); assert.equal(renderCount(spawns), 3);
    if (duringStartedExecution) { assert.equal(changed, true); assert.equal(await refused(() => c.authority.assertCurrent(fixture.publication.output.assetId, clock.now())), "lifecycle_deleted"); }
    const qc = await runTechnicalMediaQc({ dag: c.call.dag, receipt: result.receipt, runtime: c.runtime, toolRoot: PINNED_TOOL_ROOT });
    assert.equal(qc.verdict, "pass"); assert.equal(qc.execution.receiptId, result.receipt.receiptId); assert.equal(qc.output.contentHash, result.receipt.output.contentHash);
    evidence.push({ case: "segmented-qc-" + duringStartedExecution, qc });
  } finally { fs.open = original; syncBuiltinESMExports(); spawns.restore(); }
});

type PermitRequest = Awaited<ReturnType<typeof prepareRegistered>>;
const requestMutations: Record<string, { code: string; mutate: (r: PermitRequest) => PermitRequest }> = {
  "serialized-lifecycle": { code: "trust_handle_required", mutate: r => ({ ...r, lifecycle: r.lifecycle.map(h => structuredClone(h.record)) as never }) },
  "forged-lifecycle-prototype": { code: "trust_handle_required", mutate: r => ({ ...r, lifecycle: r.lifecycle.map(h => Object.create(Object.getPrototypeOf(h)) as typeof h) }) },
  "serialized-runtime": { code: "trust_handle_required", mutate: r => ({ ...r, media: structuredClone(r.media.runtimeProbe) as never }) },
  "forged-runtime-prototype": { code: "trust_handle_required", mutate: r => ({ ...r, media: Object.create(TrustedMediaRuntime.prototype) as never }) },
  "serialized-conformance": { code: "trust_handle_required", mutate: r => ({ ...r, conformance: r.conformance.map(h => h.record) as never }) },
  "missing-lifecycle": { code: "lifecycle_observation_missing", mutate: r => ({ ...r, lifecycle: [] }) },
  "missing-conformance": { code: "input_conformance_missing", mutate: r => ({ ...r, conformance: [] }) },
  "missing-admitted-source": { code: "staged_source_missing", mutate: r => ({ ...r, staged: r.staged.slice(1) }) },
  "duplicate-admitted-source": { code: "staged_source_invalid", mutate: r => ({ ...r, staged: [r.staged[0]!, r.staged[0]!] }) },
  "forged-claim-ownership": { code: "claim_ownership_required", mutate: r => ({ ...r, call: { ...r.call, ownership: {} as never } }) },
};
for (const [name, attack] of Object.entries(requestMutations)) test("H-permit-" + name, async () => {
  const c = await claimRegistered(fixture), request = await prepareRegistered(c);
  await failBeforeRender(name, () => issueExecutablePermit(attack.mutate(request)), attack.code);
});
test("H-render-scope policy cannot govern a foreign project", async () => {
  const c = await claimRegistered(fixture), request = await prepareRegistered(c), { policyId: _id, ...body } = request.policy;
  const policy = createRealExecutionPolicy({ ...body, scope: { ...body.scope, projectId: "project_foreign" } });
  await failBeforeRender("foreign-render-policy", () => issueExecutablePermit({ ...request, policy }), "scope_mismatch");
});
test("H-stale lifecycle observation refuses despite live handles and current native runtime evidence", async () => {
  const clock = clockNow(), c = await claimRegistered(fixture, { clock }), request = await prepareRegistered(c), { policyId: _id, ...body } = request.policy;
  const policy = createRealExecutionPolicy({ ...body, freshness: { ...body.freshness, maxLifecycleObservationAgeMilliseconds: 1 } });
  clock.advance(1);
  await failBeforeRender("stale-lifecycle", () => issueExecutablePermit({ ...request, policy }), "lifecycle_stale");
});
test("H-foreign live claim runtime handle cannot substitute for this claim", async () => {
  const c = await claimRegistered(fixture), request = await prepareRegistered(c), foreign = await claimRegistered(fixture), other = await prepareRegistered(foreign);
  await failBeforeRender("foreign-live-runtime", () => issueExecutablePermit({ ...request, media: other.media }), "claim_mismatch");
});
for (const forged of [undefined, {}, { bindingId: "executable_permit_binding_v0_" + "f".repeat(64) }, Object.create(ExecutablePermit.prototype) as unknown])
test("H-forged-or-missing-executable-permit-" + (forged === undefined ? "missing" : Object.keys(forged as object).join("_") || (Object.getPrototypeOf(forged) === ExecutablePermit.prototype ? "prototype" : "empty")), async () => {
  await failBeforeRender("fake-permit", () => executeAuthorizedRender(forged as never), "permit_required");
});
test("H-expired permit produces truthful pre-start failure and is consumed", async () => {
  const clock = clockNow(), c = await claimRegistered(fixture, { clock }), permit = await issueExecutablePermit(await prepareRegistered(c)); clock.set(permit.binding.validUntil);
  const spawns = observeMediaSpawns();
  try {
    const result = await executeAuthorizedRender(permit); evidence.push({ case: "expired-permit", result });
    assert.equal(result.outcome, "failed"); if (result.outcome !== "failed") assert.fail();
    assert.equal(result.failure.failureCode, "permit_expired"); assert.equal(result.failure.executionStarted, false); assert.equal(renderCount(spawns), 0);
    assert.equal(await refused(() => executeAuthorizedRender(permit)), "permit_consumed");
  } finally { spawns.restore(); }
});
test("H-execution grant expiry refuses before a permit", async () => {
  const clock = clockNow(), c = await claimRegistered(fixture, { clock }), request = await prepareRegistered(c);
  assert.notEqual(c.call.dag.grant.expiresAt, null); clock.set(c.call.dag.grant.expiresAt!);
  await failBeforeRender("execution-grant-expiry", () => issueExecutablePermit(request), "execution_grant_expired");
});
for (const type of ["Reservation", "ExecutionMediaGrant", "SourceAccessReceipt"])
test("H-DAG missing exact " + type + " refuses replay validation", async () => {
  const artifacts = fixture.execution.artifacts.filter(a => a.ref.artifactType !== type);
  assert.ok(artifacts.length < fixture.execution.artifacts.length, "the fixture really contains this required authority artifact");
  await failBeforeRender(type, () => openValidatedDag({ dag: fixture.execution.dagArtifact.ref }, artifacts), "execution_dag_invalid");
});
test("H-unadmitted registered original root cannot be staged by this render claim", async () => {
  const c = await claimRegistered(fixture);
  await failBeforeRender("unadmitted-root", () => stageClaimedSource(c.call, { assetId: fixture.publication.source.assetId }), "source_not_admitted");
});
test("H-wrong source-locator mapping cannot stage other bytes under the derivative identity", async () => {
  const authority = await makeAuthority(fixture), mappings = authority.sourceLocations.map(s => s.assetId === fixture.publication.output.assetId ? { ...s, path: fixture.rootPath } : s);
  await failBeforeRender("wrong-source-mapping", () => claimRegistered(fixture, { authority, mappings }), "source_size_mismatch");
});
test("H-source-locator traversal is refused without reaching a render", async () => {
  const authority = await makeAuthority(fixture), mappings = authority.sourceLocations.map(s => s.assetId === fixture.publication.output.assetId
    ? { ...s, path: fixture.sources + "/../sources/" + basename(fixture.rootPath) } : s);
  await failBeforeRender("source-traversal", () => claimRegistered(fixture, { authority, mappings }), "source_location_invalid");
});
for (const boundary of ["before-permit", "after-permit"])
test("H-modified staged derivative bytes refuse " + boundary, async () => {
  const c = await claimRegistered(fixture), request = await prepareRegistered(c), permit = boundary === "after-permit" ? await issueExecutablePermit(request) : null;
  const path = stagedPathOf(c), bytes = await readFile(path); await chmod(path, 0o644); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await writeFile(path, bytes);
  if (permit === null) await failBeforeRender(boundary, () => issueExecutablePermit(request), "staged_object_corrupt");
  else {
    const spawns = observeMediaSpawns();
    try { const result = await executeAuthorizedRender(permit); evidence.push({ case: "staged-mutation-" + boundary, result });
      assert.equal(result.outcome, "failed"); if (result.outcome !== "failed") assert.fail();
      assert.equal(result.failure.failureCode, "staged_input_corrupt"); assert.equal(result.failure.stage, "input_verification"); assert.equal(renderCount(spawns), 0);
    } finally { spawns.restore(); }
  }
});
test("H-same-byte physical replacement of registered derivative refuses post-stage observation", async () => {
  const f = await attackStore("physical-replacement"), authority = await makeAuthority(f.fixture), c = await claimRegistered(f.fixture, { authority });
  await rename(f.object, f.object + "-original"); await copyFile(f.object + "-original", f.object);
  assert.deepEqual(await sha256File(f.object), { contentHash: fixture.publication.output.contentHash, sizeBytes: fixture.publication.output.sizeBytes });
  await failBeforeRender("physical-identity", () => authority.observe(c.call, c.staged.find(s => s.source.assetId === fixture.publication.output.assetId)!), "lifecycle_authority_unknown_asset");
});
test("H-post-stage native parent junction cannot substitute canonical source location", async () => {
  const f = await attackStore("junction"), authority = await makeAuthority(f.fixture), c = await claimRegistered(f.fixture, { authority });
  await rename(f.objects, f.objects + "-real"); await symlink(f.objects + "-real", f.objects, "junction");
  await failBeforeRender("parent-junction", () => authority.observe(c.call, c.staged.find(s => s.source.assetId === fixture.publication.output.assetId)!), "lifecycle_authority_scope_invalid");
});

test("H-scope-free cache computation cannot transfer a foreign registration into this render claim", async () => {
  const root: Json = { ...rootAuth(fixture.registration), creatorId: "creator_foreign", projectId: "project_foreign" };
  const hit = await canonicalizeLocalMedia({ sourcePath: fixture.rootPath, workspaceRoot: fixture.workspace, rootAuthorization: root, toolRoot: PINNED_TOOL_ROOT,
    clock: { now: () => new Date().toISOString() } });
  assert.equal(hit.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED"); if (hit.outcome !== "PUBLISHED_VERIFIED_NOT_AUTHORIZED") assert.fail();
  assert.equal(hit.cache, "hit"); assert.equal(hit.computationId, fixture.publication.computationId); assert.deepEqual(hit.record, fixture.publication.record);
  assert.equal("authorization" in hit, false);
  const r = structuredClone(fixture.registration), footage = r.footage as Json; footage.creatorId = root.creatorId; footage.projectId = root.projectId;
  for (const asset of footage.assets as Json[]) { (asset.authorization as Json).creatorId = root.creatorId; (asset.authorization as Json).projectId = root.projectId; }
  const { canonicalizationConsent: _consent, ...inherited } = root;
  const authorization = FootageAuthorizationDerivedSchema.parse({ ...inherited, sourceType: "system_canonicalized", contentHash: hit.output.contentHash, sizeBytes: hit.output.sizeBytes,
    dateAdded: "2026-09-02T00:00:00.000Z", derivedFrom: { rootAuthorization: root, derivationId: hit.derivation.derivationId, recipeId: hit.derivation.plan.planId } });
  declared(r).authorization = authorization; declared(r).derivation = hit.derivation;
  const authority = await makeAuthority(fixture, undefined, r), c = await claimRegistered(fixture, { authority });
  await failBeforeRender("foreign-cache-owner", () => authority.observe(c.call, c.staged.find(s => s.source.assetId === fixture.publication.output.assetId)!), "lifecycle_authority_scope_invalid");
});

test("H-native failed FFmpeg child records nonzero failure after consuming the durable claim", async () => {
  const c = await claimRegistered(fixture), permit = await issueExecutablePermit(await prepareRegistered(c)), path = stagedPathOf(c), spawns = observeMediaSpawns();
  try {
    const result = await executeAuthorizedRender(permit, { instrumentation: { afterInputsVerified: async () => {
      const bytes = await readFile(path); bytes.fill(0, 0, Math.min(4096, bytes.length)); await chmod(path, 0o644); await writeFile(path, bytes);
    } } });
    evidence.push({ case: "native-ffmpeg-nonzero", result });
    assert.equal(result.outcome, "failed"); if (result.outcome !== "failed") assert.fail();
    const f = RenderExecutionFailureSchema.parse(result.failure);
    assert.equal(f.failureCode, "process_nonzero_exit"); assert.equal(f.executionStarted, true); assert.notEqual(f.process?.exitCode, 0);
    assert.equal(f.inputReverification, "changed_after_verification"); assert.equal(f.output, "none_published"); assert.equal(renderCount(spawns), 1);
    assert.equal((await readdir(join(c.runtime.layout.root, "render-outputs"))).length, 0);
  } finally { spawns.restore(); }
});
test("H-interrupted pre-spawn callback produces terminal failure with consumed claim and no success", async () => {
  const c = await claimRegistered(fixture), permit = await issueExecutablePermit(await prepareRegistered(c)), spawns = observeMediaSpawns();
  try {
    const result = await executeAuthorizedRender(permit, { instrumentation: { afterInputsVerified: async () => { throw new Error("controlled H interruption"); } } });
    evidence.push({ case: "pre-spawn-interruption", result });
    assert.equal(result.outcome, "failed"); if (result.outcome !== "failed") assert.fail();
    assert.equal(result.failure.failureCode, "execution_interrupted"); assert.equal(result.failure.executionStarted, true); assert.equal(result.failure.process, null);
    assert.equal(result.failure.output, "none_published"); assert.equal(renderCount(spawns), 0);
    assert.equal(await refused(() => executeAuthorizedRender(permit)), "permit_consumed");
  } finally { spawns.restore(); }
});
test("H-controlled unconfirmed child cannot satisfy the existing process success rule (structural supervision evidence)", async () => {
  // Deliberately controlled process events, not a claim that an unkillable native FFmpeg was observed.
  const events = new EventEmitter(), stdout = new PassThrough(), stderr = new PassThrough();
  const child = Object.assign(events, { stdout, stderr, kill: () => false });
  const pending = supervisePinnedProcess(child, { timeoutMilliseconds: 5, terminationGraceMilliseconds: 5, stdoutLimit: 1024 });
  events.emit("spawn"); const run = await pending;
  assert.equal(run.terminationConfirmed, false); assert.equal(completedProbeRun(run), false); assert.equal(processFailureCodeOf(run), "process_termination_unconfirmed");
  evidence.push({ case: "unconfirmed-supervision", evidenceKind: "controlled_structural_process_events", run });
});

async function renderForQc() {
  const c = await claimRegistered(fixture), result = await executeAuthorizedRender(await issueExecutablePermit(await prepareRegistered(c)));
  assert.equal(result.outcome, "succeeded"); if (result.outcome !== "succeeded") assert.fail();
  return { c, receipt: result.receipt, path: join(c.runtime.layout.root, "render-outputs", result.receipt.output.contentHash + ".mp4") };
}
function receiptForOutput(receipt: RenderExecutionReceipt, identity: { contentHash: string; sizeBytes: number }): RenderExecutionReceipt {
  // Coherent test forgery only. Data cannot substitute for an ExecutablePermit or certify actual execution.
  const r = structuredClone(receipt); r.output = { ...r.output, ...identity, outputArtifactId: outputArtifactIdOf(identity) };
  r.measurements = { ...r.measurements, outputBytes: identity.sizeBytes }; r.accounting = accountingOfReceipt(r);
  const { receiptId: _id, ...body } = r; return RenderExecutionReceiptSchema.parse(identify("render_execution_receipt_v0", "receiptId", body));
}
for (const kind of ["missing", "corrupt", "mismatched", "mutated-during-qc"])
test("H-independent native QC refuses " + kind + " rendered output", async () => {
  const { c, receipt, path } = await renderForQc();
  const mutate = async () => { await chmod(path, 0o644); const b = await readFile(path); b.fill(0, 0, Math.min(4096, b.length)); await writeFile(path, b); };
  if (kind === "missing") { await chmod(path, 0o644); await unlink(path); }
  if (kind === "corrupt") await mutate();
  if (kind === "mismatched") { await chmod(path, 0o644); await copyFile(fixture.betaPath, path); }
  const qc = await runTechnicalMediaQc({ dag: c.call.dag, receipt, runtime: c.runtime, toolRoot: PINNED_TOOL_ROOT,
    ...(kind === "mutated-during-qc" ? { instrumentation: { afterIdentityEstablished: mutate } } : {}) });
  assert.equal(qc.verdict, "fail"); assert.equal(qc.checks.find(x => x.checkId === "output_identity")!.outcome, "fail");
  evidence.push({ case: "qc-" + kind, receipt, qc });
});
for (const kind of ["geometry", "rate", "unexpected-audio"])
test("H-independent native QC rejects schema-valid receipt of nonconforming " + kind, async () => {
  const { c, receipt } = await renderForQc(), bad = join(c.runtime.layout.root, "wrong-" + kind + ".mp4");
  await generateWrongOutput(bad, { width: kind === "geometry" ? 92 : 90, height: 160, frames: 60, rate: kind === "rate" ? 25 : 30,
    audio: kind === "unexpected-audio" ? { rate: 48000, layout: "stereo" } : null });
  const identity = await sha256File(bad), forged = receiptForOutput(receipt, identity), published = join(c.runtime.layout.root, "render-outputs", identity.contentHash + ".mp4");
  await copyFile(bad, published);
  const qc = await runTechnicalMediaQc({ dag: c.call.dag, receipt: forged, runtime: c.runtime, toolRoot: PINNED_TOOL_ROOT });
  assert.equal(qc.checks.find(x => x.checkId === "output_identity")!.outcome, "pass", "correct content identity alone cannot satisfy media QC");
  assert.equal(qc.verdict, "fail");
  assert.equal(qc.checks.find(x => x.checkId === (kind === "geometry" ? "video_geometry" : kind === "rate" ? "video_frame_rate" : "stream_layout"))!.outcome, "fail");
  evidence.push({ case: "qc-nonconforming-" + kind, evidenceKind: "native_generated_bad_media_coherent_test_receipt_forgery", forged, qc });
});
test("H-QC receipt scope and exact execution/output linkage cannot be detached", async () => {
  const { c, receipt } = await renderForQc(), { receiptId: _id, ...body } = receipt;
  const foreign = RenderExecutionReceiptSchema.parse(identify("render_execution_receipt_v0", "receiptId", { ...body, scope: { ...body.scope, projectId: "project_foreign" } }));
  await failBeforeRender("qc-foreign-scope", () => runTechnicalMediaQc({ dag: c.call.dag, receipt: foreign, runtime: c.runtime, toolRoot: PINNED_TOOL_ROOT }), "qc_receipt_invalid");
  const qc = await runTechnicalMediaQc({ dag: c.call.dag, receipt, runtime: c.runtime, toolRoot: PINNED_TOOL_ROOT });
  assert.equal(qc.verdict, "pass"); assert.equal(qc.execution.receiptId, receipt.receiptId); assert.equal(qc.execution.programId, receipt.program.programId);
  assert.equal(qc.output.contentHash, receipt.output.contentHash); assert.equal(qc.observedIdentity.contentHash, receipt.output.contentHash);
});
test("H-RED-02 root deletion during native input validation refuses before durable execution start", async () => {
  const clock = new ManualRuntimeClock(new Date().toISOString()), c = await claimRegistered(fixture, { clock });
  const permit = await issueExecutablePermit(await prepareRegistered(c)), original = fs.open, spawns = observeMediaSpawns();
  const stagedPath = c.runtime.staging.locate(ownedKey(c.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  let attacked = false;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    const held = await original(...args);
    if (!attacked && String(args[0]) === stagedPath) { attacked = true; c.authority.requestDeletion(fixture.publication.source.assetId); }
    return held;
  }) as typeof fs.open;
  syncBuiltinESMExports();
  try {
    const rendered = await executeAuthorizedRender(permit);
    evidence.push({ case: "H-RED-02", attacked, rendered });
    assert.equal(attacked, true); assert.equal(rendered.outcome, "failed", "late deletion cannot pass the pre-execution authority boundary");
    if (rendered.outcome !== "failed") assert.fail();
    assert.equal(rendered.failure.failureCode, "lifecycle_deleted");
    assert.equal(rendered.failure.executionStart, null);
    assert.equal(spawns.calls.filter(s => s.arguments.includes("-benchmark")).length, 0);
  } finally { fs.open = original; syncBuiltinESMExports(); spawns.restore(); }
});
test("H-RED-03 derivative expiry after durable start but before native spawn records failure without rendering", async () => {
  const clock = new ManualRuntimeClock(new Date().toISOString()), c = await claimRegistered(fixture, { clock });
  const permit = await issueExecutablePermit(await prepareRegistered(c)), spawns = observeMediaSpawns();
  try {
    const rendered = await executeAuthorizedRender(permit, { instrumentation: { afterInputsVerified: async () => {
      c.authority.setExpiry(fixture.publication.output.assetId, clock.now());
    } } });
    evidence.push({ case: "H-RED-03", rendered });
    assert.equal(rendered.outcome, "failed", "late expiry cannot pass the final pre-spawn authority boundary");
    if (rendered.outcome !== "failed") assert.fail();
    assert.equal(rendered.failure.failureCode, "lifecycle_expired");
    assert.notEqual(rendered.failure.executionStart, null, "the durable execution claim is truthfully consumed");
    assert.equal(rendered.failure.process, null);
    assert.equal(rendered.failure.output, "none_published");
    assert.equal(spawns.calls.filter(s => s.arguments.includes("-benchmark")).length, 0);
  } finally { spawns.restore(); }
});
test("H-RED-04 root deletion during permit staged-byte validation prevents permit issuance", async () => {
  const clock = new ManualRuntimeClock(new Date().toISOString()), c = await claimRegistered(fixture, { clock });
  const request = await prepareRegistered(c), original = fs.open;
  const stagedPath = c.runtime.staging.locate(ownedKey(c.staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
  let attacked = false;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    const held = await original(...args);
    if (!attacked && String(args[0]) === stagedPath) { attacked = true; c.authority.requestDeletion(fixture.publication.source.assetId); }
    return held;
  }) as typeof fs.open;
  syncBuiltinESMExports();
  let issued = false, refusal: string | null = null;
  try {
    try { await issueExecutablePermit(request); issued = true; } catch (error) { if (error instanceof Error && "code" in error) refusal = String(error.code); else throw error; }
    evidence.push({ case: "H-RED-04", attacked, issued, refusal });
    assert.equal(attacked, true); assert.equal(issued, false, "a deletion during awaited byte verification cannot mint a permit");
    assert.equal(refusal, "lifecycle_deleted");
  } finally { fs.open = original; syncBuiltinESMExports(); }
});
test("H-01 unchanged APIs: registered 0.4 derivative renders with a genuine permit and independently passes native QC", async () => {
  const c = await claimRegistered(fixture), spawns = observeMediaSpawns();
  try {
    const request = await prepareRegistered(c), program = compileRenderProgram(c.call.dag, c.call.artifacts);
    assert.equal(fixture.publication.renderAuthority, "not_registered");
    assert.equal("authorization" in fixture.publication, false);
    const derivative = c.staged.find(s => s.source.assetId === fixture.publication.output.assetId)!;
    assert.ok(derivative);
    assert.deepEqual(await sha256File(c.runtime.staging.locate(ownedKey(derivative.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath),
      { contentHash: fixture.publication.output.contentHash, sizeBytes: fixture.publication.output.sizeBytes });
    assert.equal(request.lifecycle.find(h => h.record.source.assetId === derivative.source.assetId)!.record.provenance.sourceType, "system_canonicalized");
    assert.ok(request.conformance.every(h => h.record.outcome.state === "conforms"));
    const slot = program.inputs.find(s => s.assetId === fixture.publication.output.assetId)!;
    assert.deepEqual({ assetId: slot.assetId, contentHash: slot.contentHash, sizeBytes: slot.sizeBytes }, fixture.publication.output);
    const lineage = request.lifecycle.find(h => h.record.source.assetId === derivative.source.assetId)!.record.provenance;
    assert.equal(lineage.sourceType, "system_canonicalized");
    if (lineage.sourceType !== "system_canonicalized") assert.fail();
    assert.equal(lineage.derivationId, fixture.publication.derivation.derivationId);
    assert.equal(lineage.recipeId, fixture.publication.derivation.plan.planId);
    assert.deepEqual(lineage.root, fixture.publication.source);
    const permit = await issueExecutablePermit(request);
    assert.throws(() => JSON.stringify(permit));
    assert.ok(permit.binding.sources.some(s => s.assetId === derivative.source.assetId && s.contentHash === fixture.publication.output.contentHash));
    const rendered = await executeAuthorizedRender(permit);
    assert.equal(rendered.outcome, "succeeded", JSON.stringify(rendered));
    if (rendered.outcome !== "succeeded") assert.fail();
    const receipt = RenderExecutionReceiptSchema.parse(rendered.receipt), beforeQc = spawns.calls.length;
    const qc = TechnicalMediaQcReceiptSchema.parse(await runTechnicalMediaQc({ dag: c.call.dag, receipt, runtime: c.runtime, toolRoot: PINNED_TOOL_ROOT }));
    assert.equal(qc.verdict, "pass", JSON.stringify(qc));
    assert.ok(spawns.calls.slice(beforeQc).some(s => s.tool === "ffmpeg" && s.arguments.includes("explode")), "independent full decode actually executes");
    assert.equal(spawns.calls.filter(s => s.tool === "ffmpeg" && s.arguments.includes("-benchmark")).length, 1, "exactly one accepted native render");
    const render = spawns.calls.find(s => s.tool === "ffmpeg" && s.arguments.includes("-benchmark"))!;
    assert.ok(render.arguments.includes("fd"), "the accepted renderer uses its fd-only protocol");
    assert.deepEqual(render.arguments.flatMap((a, i) => a === "-i" ? [render.arguments[i + 1]] : []), program.inputs.map(() => "fd:"));
    assert.deepEqual(receipt.scope, c.call.dag.dag.scope); assert.equal(receipt.program.programId, program.programId); assert.equal(receipt.dag.dagId, c.call.dag.dag.dagId);
    const output = join(c.runtime.layout.root, "render-outputs", receipt.output.contentHash + ".mp4");
    assert.deepEqual(await sha256File(output), { contentHash: receipt.output.contentHash, sizeBytes: receipt.output.sizeBytes });
    assert.ok((await readFile(output)).length > 0);
    assert.deepEqual(qc.scope, receipt.scope);
    assert.deepEqual(qc.execution, { receiptId: receipt.receiptId, renderComputationId: receipt.renderComputationId, dagId: receipt.dag.dagId, programId: receipt.program.programId });
    assert.deepEqual(qc.output, { outputArtifactId: receipt.output.outputArtifactId, contentHash: receipt.output.contentHash, sizeBytes: receipt.output.sizeBytes });
    assert.deepEqual(qc.observedIdentity, { contentHash: receipt.output.contentHash, sizeBytes: receipt.output.sizeBytes });
    assert.equal(receipt.executionStart.startId.length > 0, true);
    assert.equal(await refused(() => executeAuthorizedRender(permit)), "permit_consumed");
    assert.equal(await refused(() => issueExecutablePermit(request)), "execution_already_started");
    evidence.push({ case: "H-01", registrationDigest: c.authority.registrationDigest, publication: fixture.publication, program,
      staging: c.staged, lifecycle: request.lifecycle.map(h => h.record), runtimeProbe: request.media.runtimeProbe,
      capabilityProbe: request.media.capabilityProbe, conformance: request.conformance.map(h => h.record), receipt, qc, output });
  } finally { spawns.restore(); }
});

// Each refusal uses the existing owning boundary; there is no second verifier or authority in this test.
async function refused(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    assert.ok(error instanceof EditRenderError || error instanceof EditRuntimeError || error instanceof CanonicalIngestError, "unexpected exception: " + String(error));
    assert.notEqual(error.code, "unexpected_failure"); return error.code;
  }
  assert.fail("expected an owned refusal");
}
const clockNow = () => new ManualRuntimeClock(new Date().toISOString());
const declared = (r: Json) => (r.canonicalDerivatives as Json[])[0]!;
const derivativeAuth = (r: Json) => declared(r).authorization as Json;
const rootAuth = (r: Json) => ((r.footage as Json).assets as Json[])[0]!.authorization as Json;
const stagedPathOf = (c: ClaimedRegistered) => c.runtime.staging.locate(ownedKey(c.staged.find(s => s.source.assetId === fixture.publication.output.assetId)!.stagedObject.stagedObjectId, "staged_source_object_v0")).localPath;
const renderCount = (spawns: ReturnType<typeof observeMediaSpawns>) => spawns.calls.filter(s => s.tool === "ffmpeg" && s.arguments.includes("-benchmark")).length;
async function failBeforeRender(name: string, run: () => unknown, code: string) {
  const spawns = observeMediaSpawns();
  try { const actual = await refused(run); evidence.push({ case: name, boundary: code, refusal: actual, renders: renderCount(spawns) }); assert.equal(actual, code); assert.equal(renderCount(spawns), 0); }
  finally { spawns.restore(); }
}
const registrationMutations: Record<string, (r: Json) => void> = {
  "wrong-creator": r => { (r.footage as Json).creatorId = "creator_foreign"; },
  "wrong-project": r => { (r.footage as Json).projectId = "project_foreign"; },
  "invalid-owner-statement": r => { (r.renderAuthorization as Json).statement = "analysis_is_not_render_permission"; },
  "original-only-render-statement": r => { (r.renderAuthorization as Json).statement = owner.OWNER_RENDER_AUTHORIZATION_STATEMENT; },
  "wrong-root": r => { declared(r).rootEntryId = "undeclared_root"; },
  "wrong-root-consent": r => { delete rootAuth(r).canonicalizationConsent; },
  "wrong-derived-authorization": r => { derivativeAuth(r).sourceType = "owner_supplied"; },
  "wrong-derived-lineage": r => { (derivativeAuth(r).derivedFrom as Json).derivationId = "canonical_media_derivation_v3_" + "f".repeat(64); },
};
for (const [name, mutate] of Object.entries(registrationMutations)) test("H-registration-" + name, async () => {
  const r = structuredClone(fixture.registration); mutate(r);
  await failBeforeRender(name, () => makeAuthority(fixture, undefined, r), "lifecycle_authority_scope_invalid");
});
test("H-unregistered publication and its source location cannot produce an owner lifecycle handle", async () => {
  const c = await claimRegistered(fixture), r = structuredClone(fixture.registration); r.canonicalDerivatives = [];
  const authority = await makeAuthority(fixture, c.runtime.clock, r);
  assert.equal(authority.sourceLocations.some(s => s.assetId === fixture.publication.output.assetId), false);
  await failBeforeRender("unregistered", () => authority.observe(c.call, c.staged.find(s => s.source.assetId === fixture.publication.output.assetId)!), "lifecycle_authority_unknown_asset");
  assert.equal(await refused(() => executeAuthorizedRender(fixture.publication as never)), "permit_required");
});

// Every attack store is a NEW generated copy. No historical source, canonical object or evidence is modified.
async function attackStore(name: string) {
  const workspace = join(fixture.base, "attack-" + name), store = join(workspace, ...owner.CANONICAL_STORE.directory);
  const canonical = join(fixture.workspace, ...owner.CANONICAL_STORE.directory);
  for (const directory of [owner.CANONICAL_STORE.objects, owner.CANONICAL_STORE.computations, owner.CANONICAL_STORE.pending]) await mkdir(join(store, directory), { recursive: true });
  const object = join(store, owner.CANONICAL_STORE.objects, owner.canonicalObjectName(fixture.publication.output.contentHash));
  const record = join(store, owner.CANONICAL_STORE.computations, owner.canonicalComputationRecordName(fixture.publication.computationId));
  await copyFile(join(canonical, owner.CANONICAL_STORE.objects, basename(object)), object);
  await copyFile(join(canonical, owner.CANONICAL_STORE.computations, basename(record)), record);
  await chmod(object, 0o644); await chmod(record, 0o644);
  return { fixture: { ...fixture, workspace }, workspace, object, record, objects: join(store, owner.CANONICAL_STORE.objects) };
}
for (const mode of ["corrupt-object", "corrupt-record"]) test("H-canonical-" + mode + "-never-authorizes", async () => {
  const f = await attackStore(mode);
  if (mode === "corrupt-object") { const bytes = await readFile(f.object); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await writeFile(f.object, bytes); }
  else await writeFile(f.record, "{}\n");
  await failBeforeRender(mode, () => makeAuthority(f.fixture), "cache_corrupt");
});
test("H-schema-valid forged registration and compact record refuse fresh G verification", async () => {
  const f = await attackStore("forged"), d = fixture.publication.derivation, s = d.sampleDerivation, pixels = structuredClone(s.verification.pixels);
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const rows = Array.from({ length: pixels.frameCount }, (_, i) => hash("h-forged-frame-" + i));
  const digest = hash(canonicalSerialize({ method: EXACT_PIXEL_METHOD, frameCount: pixels.frameCount, frames: rows.map((digest, index) => ({ index, digest })) }));
  pixels.frameDigests = { source: rows, expected: rows, output: rows }; pixels.sourceDigest = pixels.expectedDigest = pixels.outputDigest = digest;
  const sample = buildCanonicalReencodeDerivation({ rootAuthorization: s.source.rootAuthorization, sourceFacts: s.source.facts, plan: s.plan,
    output: { contentHash: s.output.contentHash, sizeBytes: s.output.sizeBytes, facts: s.output.facts }, pixels, audioPackets: s.verification.audioPackets });
  const forged = buildChromaSafeDerivation({ sampleDerivation: sample, plan: d.plan, outputChroma: d.outputChroma }), r = structuredClone(fixture.registration);
  declared(r).derivation = forged; (derivativeAuth(r).derivedFrom as Json).derivationId = forged.derivationId;
  assert.equal(ChromaSafeDerivationSchema.safeParse(forged).success, true);
  assert.equal(owner.OwnerMediaLosslessRegistrationSchema.safeParse(r).success, true);
  await writeFile(f.record, compactLosslessComputationRecordOf(forged, fixture.publication.record.output.format).bytes);
  await failBeforeRender("forged-complete-registration", () => makeAuthority(f.fixture, undefined, r), "cache_corrupt");
});

// Root/own deletion and expiry at each authority boundary, including both pre-execution windows.
type Target = "root" | "derived";
type Change = "deletion" | "expiry";
function change(c: ClaimedRegistered, target: Target, kind: Change) {
  const assetId = target === "root" ? fixture.publication.source.assetId : fixture.publication.output.assetId;
  if (kind === "deletion") c.authority.requestDeletion(assetId); else c.authority.setExpiry(assetId, c.runtime.clock.now());
}
for (const target of ["root", "derived"] as const) for (const kind of ["deletion", "expiry"] as const)
for (const boundary of ["before-observation", "before-permit", "before-execution", "during-observation", "before-durable-start", "after-durable-start", "during-permit"] as const)
test(`H-lifecycle-${target}-${kind}-${boundary}`, async () => {
  const clock = clockNow(), c = await claimRegistered(fixture, { clock }), code = kind === "deletion" ? "lifecycle_deleted" : "lifecycle_expired";
  const derivative = c.staged.find(s => s.source.assetId === fixture.publication.output.assetId)!;
  if (boundary === "before-observation") { change(c, target, kind); await failBeforeRender(boundary, () => c.authority.observe(c.call, derivative), code); return; }
  if (boundary === "during-observation") {
    const original = fs.open, location = c.authority.sourceLocations.find(s => s.assetId === fixture.publication.output.assetId)!.path; let attacked = false;
    fs.open = (async (...args: Parameters<typeof fs.open>) => { const h = await original(...args); if (!attacked && String(args[0]) === location) { attacked = true; change(c, target, kind); } return h; }) as typeof fs.open;
    syncBuiltinESMExports();
    try { await failBeforeRender(boundary, () => c.authority.observe(c.call, derivative), code); assert.equal(attacked, true); }
    finally { fs.open = original; syncBuiltinESMExports(); } return;
  }
  const request = await prepareRegistered(c);
  if (boundary === "before-permit") { change(c, target, kind); await failBeforeRender(boundary, () => issueExecutablePermit(request), code); return; }
  if (boundary === "during-permit") {
    const original = fs.open, path = stagedPathOf(c); let attacked = false;
    fs.open = (async (...args: Parameters<typeof fs.open>) => { const h = await original(...args); if (!attacked && String(args[0]) === path) { attacked = true; change(c, target, kind); } return h; }) as typeof fs.open;
    syncBuiltinESMExports();
    try { await failBeforeRender(boundary, () => issueExecutablePermit(request), code); assert.equal(attacked, true); }
    finally { fs.open = original; syncBuiltinESMExports(); } return;
  }
  const permit = await issueExecutablePermit(request), spawns = observeMediaSpawns(), original = fs.open; let attacked = false;
  try {
    if (boundary === "before-execution") change(c, target, kind);
    if (boundary === "before-durable-start") {
      const path = stagedPathOf(c);
      fs.open = (async (...args: Parameters<typeof fs.open>) => { const h = await original(...args); if (!attacked && String(args[0]) === path) { attacked = true; change(c, target, kind); } return h; }) as typeof fs.open;
      syncBuiltinESMExports();
    }
    const rendered = await executeAuthorizedRender(permit, boundary === "after-durable-start" ? { instrumentation: { afterInputsVerified: async () => { change(c, target, kind); } } } : {});
    evidence.push({ case: `lifecycle-${target}-${kind}-${boundary}`, rendered });
    assert.equal(rendered.outcome, "failed"); if (rendered.outcome !== "failed") assert.fail();
    const failure = RenderExecutionFailureSchema.parse(rendered.failure);
    assert.equal(failure.failureCode, code); assert.equal(failure.stage, "authority_recheck");
    assert.equal(failure.executionStarted, boundary === "after-durable-start");
    assert.equal(failure.process, null); assert.equal(failure.output, "none_published"); assert.equal(renderCount(spawns), 0);
    if (boundary === "before-durable-start") assert.equal(attacked, true);
    assert.equal(await refused(() => executeAuthorizedRender(permit)), "permit_consumed");
    assert.equal((await readdir(join(c.runtime.layout.root, "render-execution-starts"))).length, boundary === "after-durable-start" ? 1 : 0);
  } finally { fs.open = original; syncBuiltinESMExports(); spawns.restore(); }
});
