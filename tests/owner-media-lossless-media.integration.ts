// Checkpoint G: generated media, pinned tools, explicit fixture-owner declarations. No owner footage or model inference.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import fs, { chmod, copyFile, mkdir, readFile, rename, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, basename } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { createOwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";
import { EditRenderError } from "../packages/edit-render/index.js";
import * as owner from "../packages/edit-render/owner-media.js";
import { FootageAuthorizationDerivedSchema } from "../packages/footage-analyzer/protocol.js";
import { cdBase, cdSeed, cdRequest } from "./support/canonical-lossless-cd.js";
import { PINNED_TOOL_ROOT, observeMediaSpawns } from "./support/edit-render-media.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { sha256 } from "../packages/edit-render/common.js";
import { ChromaSafeDerivationSchema, buildChromaSafeDerivation, makeCanonicalChromaObservation } from "../packages/media-ingest/chroma.js";
import { EXACT_PIXEL_METHOD, buildCanonicalReencodeDerivation } from "../packages/media-ingest/reencode.js";
import { CANONICAL_LOSSLESS_RECORD_IDENTITY, compactLosslessComputationRecordOf, parseLosslessComputationRecordBytes } from "../packages/media-ingest/lossless-record.js";
import { OWNER_SCOPE, RUN_START, claimStructural, derivedProvenanceOf, structuralChain } from "./support/owner-media-canonical.js";
import { executeAuthorizedRender } from "../scripts/edit-render-local.js";
import { generatePlanFixture, generatePlanVariant } from "./support/canonical-media-fixtures.js";
import { registerGenerated, declareGeneratedAvCenter, researchEncode, decodeGenerated, audioPayloadDigest } from "./support/canonical-reencode-media.js";
import { remuxedFacts } from "./support/canonical-facts.js";
import { verifyExactPixels } from "./support/canonical-pixel-reference.js";
import { PLAN_VERIFICATION_METHODS } from "../packages/media-ingest/plan.js";

type Json = Record<string, unknown>;
const NOW = "2026-10-09T00:00:00.000Z", clock = { now: () => NOW };
let base = "", workspace = "", request: local.CanonicalIngestRequest, published: local.CanonicalLosslessPublishedResult, registration: Json;
const receipts: unknown[] = [];
before(async () => {
  base = await cdBase("g-src-"); workspace = await cdBase("g-store-");
  request = await cdRequest(await cdSeed(base, "hevc"), workspace);
  const p = await local.canonicalizeLocalMedia(request);
  assert.equal(p.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED");
  if (p.outcome !== "PUBLISHED_VERIFIED_NOT_AUTHORIZED") assert.fail();
  published = p;
  const root = request.rootAuthorization as Json, d = p.derivation;
  // The owner explicitly supplies this declaration. The ingest result never supplies an authorization.
  const { canonicalizationConsent: _consent, ...inherited } = root;
  const authorization = FootageAuthorizationDerivedSchema.parse({ ...inherited,
    sourceType: "system_canonicalized", contentHash: p.output.contentHash, sizeBytes: p.output.sizeBytes, dateAdded: NOW,
    derivedFrom: { rootAuthorization: root, derivationId: d.derivationId, recipeId: d.plan.planId } });
  registration = { artifactType: "OwnerMediaRegistration", artifactVersion: "0.3.0", stability: "internal_pre_stable",
    footage: { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: root.creatorId, projectId: root.projectId,
      assets: [{ entryId: "root", path: basename(request.sourcePath), authorization: root }] },
    canonicalDerivatives: [{ entryId: "derived", rootEntryId: "root", authorization, derivation: d }],
    renderAuthorization: { statement: owner.OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT,
      owner: { kind: "owner", actorId: "owner_g_generated" }, renderIntents: ["final"], authorizedAt: NOW, expiresAt: null } };
});
after(async () => { await writeFile(join(workspace, "g-registration-receipt.json"), JSON.stringify(receipts, null, 2) + "\n", { flag: "wx" }); });
const make = (r = registration, w = workspace, c = clock) => createOwnerMediaLifecycleAuthority({ registration: r, baseDirectory: base,
  canonicalWorkspace: w, clock: c, canonicalToolRoot: PINNED_TOOL_ROOT } as Parameters<typeof createOwnerMediaLifecycleAuthority>[0]);
async function refused(run: () => unknown): Promise<string> {
  try { await run(); } catch (e) {
    assert.ok(e instanceof EditRenderError || e instanceof local.CanonicalIngestError, `unexpected exception: ${String(e)}`);
    assert.notEqual(e.code, "unexpected_failure"); return e.code;
  }
  assert.fail("expected an ordinary owned refusal");
}
test("G-RED-01: published verified bytes remain unregistered without the explicit owner declaration", async () => {
  assert.equal(published.renderAuthority, "not_registered"); assert.equal("authorization" in published, false);
  const r = structuredClone(registration); r.artifactVersion = "0.2.0"; r.canonicalDerivatives = [];
  const a = await make(r);
  assert.equal(await refused(() => a.verify(published.output.assetId)), "lifecycle_authority_unknown_asset");
});
test("G-RED-02: explicit versioned 0.4 registration verifies and registers root before derivative", async () => {
  const spawns = observeMediaSpawns();
  try {
    const a = await make();
    assert.deepEqual(a.declared.map(d => d.assetId).sort(), [published.source.assetId, published.output.assetId].sort());
    assert.equal((await a.verify(published.output.assetId)).contentHash, published.output.contentHash);
    a.assertCurrent(published.output.assetId, NOW);
    assert.ok(spawns.calls.some(c => c.arguments.includes("rawvideo")), "fresh full sample verification actually ran");
    assert.equal(spawns.calls.some(c => c.arguments.includes("libx264")), false, "registration starts no encoder");
    receipts.push({ case: "registration", declared: a.declared, registrationDigest: a.registrationDigest });
  } finally { spawns.restore(); }
});
test("G-RED-03: valid cache hit follows exactly the explicit registration flow", async () => {
  const hit = await local.canonicalizeLocalMedia(request);
  assert.equal(hit.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED");
  if (hit.outcome !== "PUBLISHED_VERIFIED_NOT_AUTHORIZED") assert.fail();
  assert.equal(hit.cache, "hit"); assert.equal("authorization" in hit, false);
  const r = structuredClone(registration); (r.canonicalDerivatives as Json[])[0]!.derivation = hit.derivation;
  assert.equal((await (await make(r)).verify(hit.output.assetId)).contentHash, hit.output.contentHash);
});
test("G-RED-04: existing root and derivative lifecycle restrictions remain effective", async () => {
  const a = await make(); a.setExpiry(published.source.assetId, NOW);
  assert.equal(await refused(() => a.assertCurrent(published.output.assetId, NOW)), "lifecycle_expired");
  const b = await make(); b.requestDeletion(published.source.assetId);
  assert.equal(await refused(() => b.assertCurrent(published.output.assetId, NOW)), "lifecycle_deleted");
  const c = await make(); c.requestDeletion(published.output.assetId);
  assert.equal(await refused(() => c.assertCurrent(published.output.assetId, NOW)), "lifecycle_deleted");
  c.assertCurrent(published.source.assetId, NOW);
});

const declaredOf = (r: Json) => (r.canonicalDerivatives as Json[])[0]!;
const authOf = (r: Json) => declaredOf(r).authorization as Json;
const lineageOf = (r: Json) => authOf(r).derivedFrom as Json;
const rootOf = (r: Json) => ((r.footage as Json).assets as Json[])[0]!.authorization as Json;
const mutations: Record<string, (r: Json) => void> = {
  "missing-root": r => { declaredOf(r).rootEntryId = "not_declared"; },
  "missing-consent": r => { const a = rootOf(r); a.schemaVersion = "1.0.0"; delete a.canonicalizationConsent; },
  "missing-render-statement": r => { delete (r.renderAuthorization as Json).statement; },
  "analysis-only-statement": r => { (r.renderAuthorization as Json).statement = owner.OWNER_RENDER_AUTHORIZATION_STATEMENT; },
  "wrong-creator": r => { (r.footage as Json).creatorId = "creator_foreign"; },
  "wrong-project": r => { (r.footage as Json).projectId = "project_foreign"; },
  "wrong-root-authorization": r => { rootOf(r).authorizationBasis = "permission_granted"; },
  "stale-root-authorization": r => { rootOf(r).dateAdded = "2026-10-02T00:00:00.000Z"; },
  "wrong-derived-root": r => { (lineageOf(r).rootAuthorization as Json).creatorId = "creator_foreign"; },
  "wrong-derivation-id": r => { lineageOf(r).derivationId = "forged_derivation"; },
  "wrong-plan-id": r => { lineageOf(r).recipeId = "forged_plan"; },
  "wrong-computation-id": r => { (declaredOf(r).derivation as Json).computationId = "forged_computation"; },
  "wrong-actual-plan": r => { ((declaredOf(r).derivation as Json).plan as Json).planId = "forged_plan"; },
  "invalid-chroma": r => { ((declaredOf(r).derivation as Json).outputChroma as Json).streamReported = "left"; },
  "caller-output-path": r => { declaredOf(r).path = "../selected.mp4"; },
  "caller-plan-path": r => { ((declaredOf(r).derivation as Json).plan as Json).outputPath = "selected.mp4"; },
  "traversal-source": r => { ((r.footage as Json).assets as Json[])[0]!.path = "../selected.mp4"; },
  "old-version-cast": r => { r.artifactVersion = "0.2.0"; },
};
for (const [name, mutate] of Object.entries(mutations)) test("G-DECL-refuse-" + name, async () => {
  const r = structuredClone(registration); mutate(r);
  const spawns = observeMediaSpawns();
  try { assert.equal(await refused(() => make(r)), "lifecycle_authority_scope_invalid"); assert.equal(spawns.calls.length, 0); }
  finally { spawns.restore(); }
});
test("G-DECL-exact-projection-and-frozen-parser-boundary", () => {
  assert.equal(owner.OwnerMediaCanonicalRegistrationSchema.safeParse(registration).success, false);
  assert.equal(owner.OwnerMediaRegistrationSchema.safeParse(registration).success, false);
  const d = owner.ownerMediaLosslessDeclarations(registration).derivatives[0]!;
  assert.equal(d.rootAssetId, published.source.assetId); assert.equal(d.recipeId, published.derivation.plan.planId);
  assert.equal(d.derivationId, published.derivation.derivationId); assert.equal(d.computationId, published.computationId);
  assert.deepEqual(d.authorization.derivedFrom.rootAuthorization, request.rootAuthorization);
});
test("G-DECL-registration-needs-pinned-runtime-and-a-started-render-window", async () => {
  const spawns = observeMediaSpawns();
  try {
    assert.equal(await refused(() => createOwnerMediaLifecycleAuthority({ registration, baseDirectory: base,
      canonicalWorkspace: workspace, clock })), "lifecycle_authority_scope_invalid");
    const future = structuredClone(registration);
    (future.renderAuthorization as Json).authorizedAt = "2026-10-10T00:00:00.000Z";
    assert.equal(await refused(() => make(future)), "lifecycle_authority_scope_invalid");
    assert.equal(spawns.calls.length, 0);
  } finally { spawns.restore(); }
});

const storePaths = (w: string) => { const root = join(w, ...owner.CANONICAL_STORE.directory);
  return { root, objects: join(root, owner.CANONICAL_STORE.objects), computations: join(root, owner.CANONICAL_STORE.computations), pending: join(root, owner.CANONICAL_STORE.pending),
    object: join(root, owner.CANONICAL_STORE.objects, owner.canonicalObjectName(published.output.contentHash)),
    record: join(root, owner.CANONICAL_STORE.computations, owner.canonicalComputationRecordName(published.computationId)) }; };
async function caseStore(name: string) {
  const w = join(workspace, "case-" + name), p = storePaths(w); await mkdir(p.root, { recursive: true });
  for (const dir of [p.objects, p.computations, p.pending]) await mkdir(dir);
  await copyFile(storePaths(workspace).object, p.object); await copyFile(storePaths(workspace).record, p.record);
  await chmod(p.object, 0o644); // Only this new generated attack copy, never the published original or source.
  return { w, ...p };
}
const recordBytes = (r: Json) => { const { recordId: _id, ...body } = r; return canonicalSerialize(identify(CANONICAL_LOSSLESS_RECORD_IDENTITY, "recordId", body)) + "\n"; };
for (const mode of ["missing-object", "missing-record", "altered-object", "object-directory", "record-directory", "object-mismatch", "wrong-computation",
  "legacy-record", "extra-record-key", "noncanonical-record", "oversized-record", "deep-record"])
test("G-STORE-refuse-" + mode + "-without-encoding", async () => {
  const f = await caseStore(mode), originalRecord = await readFile(f.record, "utf8"), r = JSON.parse(originalRecord) as Json;
  if (mode === "missing-object" || mode === "object-directory") { await unlink(f.object); if (mode === "object-directory") await mkdir(f.object); }
  else if (mode === "missing-record" || mode === "record-directory") { await unlink(f.record); if (mode === "record-directory") await mkdir(f.record); }
  else if (mode === "altered-object") { const bytes = await readFile(f.object); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await writeFile(f.object, bytes); }
  else if (mode === "object-mismatch") { (r.output as Json).sizeBytes = published.output.sizeBytes + 1; await writeFile(f.record, recordBytes(r)); }
  else if (mode === "wrong-computation") { r.computationId = "canonical_media_computation_v3_" + "a".repeat(64); await writeFile(f.record, recordBytes(r)); }
  else if (mode === "legacy-record") await writeFile(f.record, canonicalSerialize({ artifactType: "CanonicalComputationRecord", artifactVersion: "0.2.0" }) + "\n");
  else if (mode === "extra-record-key") { r.permission = true; await writeFile(f.record, recordBytes(r)); }
  else if (mode === "noncanonical-record") await writeFile(f.record, originalRecord + "\n");
  else if (mode === "oversized-record") await writeFile(f.record, " ".repeat(owner.CANONICAL_STORE.maxRecordBytes + 1));
  else if (mode === "deep-record") await writeFile(f.record, "[".repeat(10000) + "0" + "]".repeat(10000));
  const spawns = observeMediaSpawns();
  try { assert.equal(await refused(() => make(registration, f.w)), "cache_corrupt"); assert.equal(spawns.calls.some(c => c.arguments.includes("libx264")), false); }
  finally { spawns.restore(); }
});
test("G-STORE-absent-store-refuses-without-creating-storage", async () => {
  const w = join(workspace, "absent-store"); await mkdir(w);
  assert.equal(await refused(() => make(registration, w)), "lifecycle_authority_scope_invalid");
  await assert.rejects(fs.lstat(join(w, ...owner.CANONICAL_STORE.directory)), { code: "ENOENT" });
});
test("G-STORE-read-only-bridge-refuses-missing-directories-without-repair", async () => {
  const w = join(workspace, "empty-bridge-store"); await mkdir(w);
  let consumed = false;
  assert.equal(await refused(() => local.withVerifiedCanonicalLosslessStoredLocalMedia({ ...request, workspaceRoot: w }, published.derivation,
    async () => { consumed = true; })), "store_unavailable");
  assert.equal(consumed, false); await assert.rejects(fs.lstat(join(w, ...owner.CANONICAL_STORE.directory)), { code: "ENOENT" });
});
test("G-STORE-read-only-mode-does-not-recreate-missing-pending", async () => {
  const f = await caseStore("missing-pending"), bytes = await readFile(f.record); await rmdir(f.pending);
  assert.equal(await refused(() => make(registration, f.w)), "store_unavailable");
  await assert.rejects(fs.lstat(f.pending), { code: "ENOENT" }); assert.deepEqual(await readFile(f.record), bytes);
});
for (const mode of ["object-link", "record-link", "parent-junction"]) test("G-PATH-refuse-" + mode, async () => {
  const f = await caseStore(mode);
  const lstat = fs.lstat;
  let simulated = false;
  if (mode === "parent-junction") { await rename(f.objects, f.objects + "-real"); await symlink(f.objects + "-real", f.objects, "junction"); }
  else {
    const file = mode === "object-link" ? f.object : f.record; await rename(file, file + "-real");
    try { await symlink(file + "-real", file, "file"); }
    catch (e) {
      if ((e as { code?: string }).code !== "EPERM") throw e;
      // This Windows account cannot create native file symlinks. Exercise the exact owned refusal with controlled lstat evidence;
      // actual directory junctions are exercised separately. Never label this fallback native file-symlink evidence.
      await rename(file + "-real", file); simulated = true;
      fs.lstat = (async (...args: Parameters<typeof fs.lstat>) => {
        const s = await lstat(...args);
        if (String(args[0]) === file) Object.defineProperty(s, "isSymbolicLink", { value: () => true });
        return s;
      }) as typeof fs.lstat;
      syncBuiltinESMExports();
    }
  }
  try {
    const code = await refused(() => make(registration, f.w));
    assert.ok(["cache_corrupt", "lifecycle_authority_scope_invalid", "store_location_invalid"].includes(code));
    receipts.push({ case: mode, code, evidence: simulated ? "controlled_lstat_symbolic_link_native_creation_EPERM" : "native_link" });
  } finally { fs.lstat = lstat; syncBuiltinESMExports(); }
});
function forgedDerivation() {
  const d = published.derivation, s = d.sampleDerivation, p = structuredClone(s.verification.pixels);
  const rows = Array.from({ length: p.frameCount }, (_, i) => sha256("forged-frame-" + i));
  const digest = sha256(canonicalSerialize({ method: EXACT_PIXEL_METHOD, frameCount: p.frameCount, frames: rows.map((digest, index) => ({ index, digest })) }));
  p.frameDigests = { source: rows, expected: rows, output: rows }; p.sourceDigest = p.expectedDigest = p.outputDigest = digest;
  const sample = buildCanonicalReencodeDerivation({ rootAuthorization: s.source.rootAuthorization, sourceFacts: s.source.facts, plan: s.plan,
    output: { contentHash: s.output.contentHash, sizeBytes: s.output.sizeBytes, facts: s.output.facts }, pixels: p, audioPackets: s.verification.audioPackets });
  return buildChromaSafeDerivation({ sampleDerivation: sample, plan: d.plan, outputChroma: d.outputChroma });
}
for (const replaceRecord of [false, true]) test("G-FORGE-complete-self-consistent-data-is-not-proof-" + replaceRecord, async () => {
  const f = await caseStore("forgery-" + replaceRecord), forged = forgedDerivation(), r = structuredClone(registration);
  assert.equal(ChromaSafeDerivationSchema.safeParse(forged).success, true);
  declaredOf(r).derivation = forged; lineageOf(r).derivationId = forged.derivationId;
  assert.equal(owner.OwnerMediaLosslessRegistrationSchema.safeParse(r).success, true);
  const compact = compactLosslessComputationRecordOf(forged, published.record.output.format);
  assert.deepEqual(parseLosslessComputationRecordBytes(compact.bytes, forged.plan), compact.record);
  if (replaceRecord) await writeFile(f.record, compact.bytes);
  assert.equal(await refused(() => make(r, f.w)), "cache_corrupt");
});
test("G-SCOPE-identical-computation-does-not-transfer-permission", async () => {
  const foreignRoot = { ...request.rootAuthorization as Json, creatorId: "creator_foreign", projectId: "project_foreign" };
  const hit = await local.canonicalizeLocalMedia({ ...request, rootAuthorization: foreignRoot });
  if (hit.outcome !== "PUBLISHED_VERIFIED_NOT_AUTHORIZED") assert.fail();
  assert.equal(hit.computationId, published.computationId); assert.deepEqual(hit.record, published.record);
  assert.notEqual(hit.derivation.derivationId, published.derivation.derivationId);
  const borrowed = structuredClone(registration); declaredOf(borrowed).derivation = hit.derivation;
  assert.equal(await refused(() => make(borrowed)), "lifecycle_authority_scope_invalid");
});
test("G-HOSTILE-a-complete-looking-store-entry-cannot-expand-PCM-retime-admission", async () => {
  const sourceBase = await cdBase("g-pcm-src-"), w = await cdBase("g-pcm-store-");
  const seed = registerGenerated(await generatePlanFixture(sourceBase, "pcm-seed.mov", { hevc: true, audio: "pcm", sei: "encoder" }));
  const variant = registerGenerated(await generatePlanVariant(seed, join(sourceBase, "pcm-retime.mov"), { audio: true, retime: true, container: "mov" }));
  const center = await declareGeneratedAvCenter(variant, join(sourceBase, "pcm-center.mov"), "hevc", 90000, "mov");
  // MOV normalizes packet-level setts for PCM. Give a NEW generated copy a seven-tick sample-table gap before authorization.
  const input = await readFile(center);
  assert.ok(input.length < 4 * 1024 * 1024);
  type Box = { start: number; end: number; type: string };
  const children = (start: number, end: number): Box[] => {
    const result: Box[] = [];
    while (start < end) {
      assert.ok(start + 8 <= end); const size = input.readUInt32BE(start);
      assert.ok(size >= 8 && start + size <= end);
      result.push({ start, end: start + size, type: input.toString("latin1", start + 4, start + 8) }); start += size;
    }
    return result;
  };
  const child = (b: Box, type: string) => { const found = children(b.start + 8, b.end).find(c => c.type === type); assert.ok(found); return found; };
  const moov = children(0, input.length).find(b => b.type === "moov")!;
  const audio = children(moov.start + 8, moov.end).filter(b => b.type === "trak").find(b => {
    const h = child(child(b, "mdia"), "hdlr"); return input.toString("latin1", h.start + 16, h.start + 20) === "soun";
  })!;
  assert.ok(audio);
  const mdia = child(audio, "mdia"), minf = child(mdia, "minf"), stbl = child(minf, "stbl"), stts = child(stbl, "stts"), mdhd = child(mdia, "mdhd");
  assert.equal(input.readUInt32BE(stts.start + 12), 1); assert.equal(input.readUInt32BE(stts.start + 20), 1);
  const samples = input.readUInt32BE(stts.start + 16); assert.ok(samples > 8192);
  const timing = Buffer.alloc(40); timing.writeUInt32BE(40, 0); timing.write("stts", 4, "latin1"); timing.writeUInt32BE(3, 12);
  [[4096, 1], [1, 8], [samples - 4097, 1]].forEach(([count, delta], i) => { timing.writeUInt32BE(count!, 16 + i * 8); timing.writeUInt32BE(delta!, 20 + i * 8); });
  const patched = Buffer.concat([input.subarray(0, stts.start), timing, input.subarray(stts.end)]);
  for (const b of [moov, audio, mdia, minf, stbl]) patched.writeUInt32BE(b.end - b.start + timing.length - (stts.end - stts.start), b.start);
  assert.equal(input[mdhd.start + 8], 0); patched.writeUInt32BE(input.readUInt32BE(mdhd.start + 24) + 7, mdhd.start + 24);
  const source = registerGenerated(join(sourceBase, "pcm-gapped-center.mov")); await writeFile(source, patched, { flag: "wx" });
  const req = await cdRequest(source, w), admitted = await local.inspectCanonicalChromaLocalMedia(req);
  assert.ok(admitted.planning.plan); const plan = admitted.planning.plan;
  assert.ok(plan.samplePlan.operations.some(o => o.op === "RETIME_AUDIO_CONTIGUOUS"));
  const ordinary = await local.canonicalizeLocalMedia(req);
  assert.equal(ordinary.outcome, "DEFER");
  if (ordinary.outcome !== "DEFER") assert.fail();
  assert.equal(ordinary.deferredReason, "pcm_retime_unproved");
  // Existing research helpers construct an adversarial entry, never a production publication receipt.
  const encoded = join(sourceBase, "research-output.mov");
  await researchEncode(source, encoded, plan.samplePlan.transform, admitted.facts);
  const output = await declareGeneratedAvCenter(encoded, join(sourceBase, "research-center.mov"), "h264", 90000, "mov");
  const outputObserved = await local.inspectCanonicalChromaLocalMedia(await cdRequest(output, w));
  const sv = admitted.facts.streams.find(s => s.kind === "video")!, ov = outputObserved.facts.streams.find(s => s.kind === "video")!;
  assert.equal(sv.kind, "video"); assert.equal(ov.kind, "video");
  const pixels = verifyExactPixels((await decodeGenerated(source, sv.geometry.declared.width, sv.geometry.declared.height)).frames,
    (await decodeGenerated(output, ov.geometry.declared.width, ov.geometry.declared.height)).frames, plan.samplePlan.transform);
  // The audio facts and matching packet commitment below are DELIBERATELY FORGED data, not complete fresh media evidence.
  const outputFacts = structuredClone(outputObserved.facts) as unknown as Json, repaired = remuxedFacts(admitted.facts as unknown as Json, plan.samplePlan as unknown as Json);
  (outputFacts.streams as Json[]).find(s => s.kind === "audio")!.frames = (repaired.streams as Json[]).find(s => s.kind === "audio")!.frames;
  const digest = await audioPayloadDigest(source, admitted.facts); assert.ok(digest);
  const sample = buildCanonicalReencodeDerivation({ rootAuthorization: req.rootAuthorization, sourceFacts: admitted.facts, plan: plan.samplePlan,
    output: { contentHash: outputObserved.source.contentHash, sizeBytes: outputObserved.source.sizeBytes, facts: outputFacts }, pixels,
    audioPackets: { method: PLAN_VERIFICATION_METHODS.audioPackets, sourceDigest: digest, outputDigest: digest } });
  const obs = outputObserved.observation, forgedObservation = makeCanonicalChromaObservation({ source: obs.source, factsDigest: sha256(canonicalSerialize(outputFacts)),
    method: obs.method, codec: obs.codec, streamIndex: obs.streamIndex, container: obs.container, bitstream: obs.bitstream, streamReported: obs.streamReported, frames: obs.frames });
  const d = buildChromaSafeDerivation({ sampleDerivation: sample, plan, outputChroma: forgedObservation });
  const bytes = await readFile(output), box = bytes.subarray(0, bytes.readUInt32BE(0)), compatibleBrands: string[] = [];
  assert.equal(box.toString("latin1", 4, 8), "ftyp");
  for (let at = 16; at < box.length; at += 4) compatibleBrands.push(box.toString("latin1", at, at + 4));
  const compact = compactLosslessComputationRecordOf(d, { ...published.record.output.format, format: "mov", majorBrand: box.toString("latin1", 8, 12),
    compatibleBrands, fileTypeBoxDigest: sha256(box) });
  assert.deepEqual(parseLosslessComputationRecordBytes(compact.bytes, plan), compact.record);
  const store = join(w, ...owner.CANONICAL_STORE.directory);
  for (const name of [owner.CANONICAL_STORE.objects, owner.CANONICAL_STORE.computations, owner.CANONICAL_STORE.pending]) await mkdir(join(store, name), { recursive: true });
  await copyFile(output, join(store, owner.CANONICAL_STORE.objects, owner.canonicalObjectName(d.sampleDerivation.output.contentHash)));
  await writeFile(join(store, owner.CANONICAL_STORE.computations, owner.canonicalComputationRecordName(d.computationId)), compact.bytes, { flag: "wx" });
  const root = d.sampleDerivation.source.rootAuthorization, { canonicalizationConsent: _consent, ...inherited } = root;
  const authorization = FootageAuthorizationDerivedSchema.parse({ ...inherited, sourceType: "system_canonicalized", dateAdded: NOW,
    contentHash: d.sampleDerivation.output.contentHash, sizeBytes: d.sampleDerivation.output.sizeBytes,
    derivedFrom: { rootAuthorization: root, derivationId: d.derivationId, recipeId: plan.planId } });
  const r = structuredClone(registration);
  r.footage = { ...(r.footage as Json), creatorId: root.creatorId, projectId: root.projectId,
    assets: [{ entryId: "root", path: basename(source), authorization: root }] };
  r.canonicalDerivatives = [{ entryId: "derived", rootEntryId: "root", authorization, derivation: d }];
  assert.equal(owner.OwnerMediaLosslessRegistrationSchema.safeParse(r).success, true);
  const code = await refused(() => createOwnerMediaLifecycleAuthority({ registration: r, baseDirectory: sourceBase,
    canonicalWorkspace: w, canonicalToolRoot: PINNED_TOOL_ROOT, clock }));
  assert.equal(code, "audio_retime_execution_conflict");
  receipts.push({ case: "unsupported-pcm-retime-policy", code, planId: plan.planId, evidence: "generated adversarial store, never production publication" });
});
test("G-LIFE-expired-registration-and-expiry-during-verification-refuse", async () => {
  const r = structuredClone(registration); (r.renderAuthorization as Json).expiresAt = "2026-10-09T00:00:00.001Z";
  assert.equal(await refused(() => make(r, workspace, { now: () => "2026-10-09T00:00:00.001Z" })), "lifecycle_expired");
  let calls = 0;
  assert.equal(await refused(() => make(r, workspace, { now: () => ++calls <= 2 ? NOW : "2026-10-09T00:00:00.001Z" })), "lifecycle_expired");
});
test("G-LIFE-derived-expiry-can-only-shrink-and-deletion-never-resets", async () => {
  const a = await make(); a.setExpiry(published.output.assetId, NOW); a.setExpiry(published.output.assetId, "2027-01-01T00:00:00.000Z");
  assert.equal(await refused(() => a.verify(published.output.assetId)), "lifecycle_expired");
  const b = await make(); b.requestDeletion(published.source.assetId); b.setExpiry(published.source.assetId, "2027-01-01T00:00:00.000Z");
  assert.equal(await refused(() => b.verify(published.output.assetId)), "lifecycle_deleted");
});
test("G-HOSTILE-the-returned-byte-query-time-is-the-lifecycle-checked-time", async () => {
  const expiresAt = "2026-10-09T00:00:00.001Z", r = structuredClone(registration);
  (r.renderAuthorization as Json).expiresAt = expiresAt;
  let querying = false, reads = 0;
  const c = { now: () => querying && ++reads >= 3 ? expiresAt : NOW };
  const a = await make(r, workspace, c); querying = true;
  const verified = await a.verify(published.output.assetId);
  assert.ok(verified.checkedAt < expiresAt, "a byte query must not report an expired time after checking an earlier one");
  a.assertCurrent(verified.assetId, verified.checkedAt);
  assert.equal(await refused(() => a.assertCurrent(verified.assetId, expiresAt)), "lifecycle_expired");
});
test("G-VERIFY-bridge-keeps-the-repaired-byte-budget-and-never-encodes-a-miss", async () => {
  let consumed = false, encodes = 0;
  const req = { ...request, instrumentation: { beforeProcess: async (e: { role: string }) => { if (e.role === "canonicalize") encodes++; } } };
  assert.equal(await refused(() => local.withVerifiedCanonicalLosslessStoredLocalMedia({ ...req, limits: { maxOutputBytes: published.output.sizeBytes - 1 } }, published.derivation,
    async () => { consumed = true; })), "output_invalid");
  assert.equal(encodes, 0); // The callback is not permission; refusal returns no registry, even after media proof.
  assert.equal(consumed, false, "a request outside its resource bound never enters the registration consumer");
  consumed = false;
  const f = await caseStore("bridge-miss"); await unlink(f.record);
  assert.equal(await refused(() => local.withVerifiedCanonicalLosslessStoredLocalMedia({ ...req, workspaceRoot: f.w }, published.derivation,
    async () => { consumed = true; })), "cache_corrupt");
  assert.equal(encodes, 0); assert.equal(consumed, false);
});
test("G-HOSTILE-live-parent-junction-cannot-reuse-a-valid-hash-and-inode", async () => {
  const f = await caseStore("live-parent"), a = await make(registration, f.w);
  await rename(f.objects, f.objects + "-real"); await symlink(f.objects + "-real", f.objects, "junction");
  assert.equal(await refused(() => a.verify(published.output.assetId)), "lifecycle_authority_scope_invalid");
});
test("G-HOSTILE-live-replacement-with-identical-bytes-refuses", async () => {
  const f = await caseStore("live-replacement"), a = await make(registration, f.w);
  await rename(f.object, f.object + "-old"); await copyFile(f.object + "-old", f.object);
  assert.equal(await refused(() => a.verify(published.output.assetId)), "lifecycle_authority_unknown_asset");
});
test("G-HOSTILE-name-replacement-during-a-held-byte-query-refuses", async () => {
  const f = await caseStore("query-replacement"), a = await make(registration, f.w), original = fs.open;
  let attacked = false;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    const h = await original(...args);
    if (!attacked && String(args[0]) === f.object) {
      attacked = true; await rename(f.object, f.object + "-old"); await copyFile(f.object + "-old", f.object);
    }
    return h;
  }) as typeof fs.open;
  syncBuiltinESMExports();
  try { assert.equal(await refused(() => a.verify(published.output.assetId)), "lifecycle_authority_unknown_asset"); assert.equal(attacked, true); }
  finally { fs.open = original; syncBuiltinESMExports(); }
});
test("G-OBSERVE-real-registered-bytes-with-structural-analysis-preserve-derived-provenance-and-requery", async t => {
  // Analysis/timeline here are explicitly structural: mock metadata and stub vectors. Only ingest/media verification are real.
  const root: Json = { ...request.rootAuthorization as Json, ...OWNER_SCOPE, dateAdded: "2026-09-01T00:00:00.000Z", allowedPurposes: ["local_footage_analysis", "local_evaluation"] };
  const hit = await local.canonicalizeLocalMedia({ ...request, rootAuthorization: root, clock: { now: () => RUN_START } });
  if (hit.outcome !== "PUBLISHED_VERIFIED_NOT_AUTHORIZED") assert.fail();
  const { canonicalizationConsent: _consent, ...inherited } = root;
  const authorization = FootageAuthorizationDerivedSchema.parse({ ...inherited, contentHash: hit.output.contentHash, sizeBytes: hit.output.sizeBytes,
    sourceType: "system_canonicalized", dateAdded: "2026-09-02T00:00:00.000Z", derivedFrom: { rootAuthorization: root, derivationId: hit.derivation.derivationId, recipeId: hit.derivation.plan.planId } });
  const r = structuredClone(registration); r.footage = { ...(r.footage as Json), ...OWNER_SCOPE,
    assets: [{ entryId: "root", path: basename(request.sourcePath), authorization: root }] };
  r.canonicalDerivatives = [{ entryId: "derived", rootEntryId: "root", authorization, derivation: hit.derivation }];
  (r.renderAuthorization as Json).authorizedAt = "2026-09-01T00:00:00.000Z";
  const contents = { alpha: await readFile(storePaths(workspace).object), beta: await readFile(request.sourcePath) };
  const chain = await structuralChain(() => ({ alpha: authorization as unknown as Json, beta: root }), contents), c = await claimStructural(t, chain);
  const a = await make(r, workspace, c.env.clock), staged = c.staged.find(s => s.source.assetId === hit.output.assetId)!;
  const h = await a.observe(c.call, staged);
  assert.deepEqual(h.record.provenance, derivedProvenanceOf(authorization as unknown as Json)); assert.equal(h.proves(h.record), true);
  h.reconfirm(c.env.clock.now()); a.requestDeletion(hit.source.assetId);
  assert.equal(await refused(() => h.reconfirm(c.env.clock.now())), "lifecycle_deleted");
  assert.equal(await refused(() => a.observe(c.call, staged)), "lifecycle_deleted");
  const b = await make(r, workspace, c.env.clock), fresh = await b.observe(c.call, staged); b.setExpiry(hit.output.assetId, c.env.clock.now());
  assert.equal(await refused(() => fresh.reconfirm(c.env.clock.now())), "lifecycle_expired");
  assert.equal(await refused(() => executeAuthorizedRender(b as never)), "permit_required");
  receipts.push({ case: "structural-observation-real-media", observation: h.record, scope: a.scope, renderProof: "not_attempted" });
});
