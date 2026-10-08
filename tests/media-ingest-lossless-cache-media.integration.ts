// F3/F4 RED on accepted runtime, then complete byte/media/race gates. All files are generated task fixtures.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import fs from "node:fs/promises";
import { fstatSync, ftruncateSync, writeSync } from "node:fs";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { compactLosslessComputationRecordOf, CANONICAL_LOSSLESS_RECORD_IDENTITY, type CanonicalLosslessComputationRecord } from "../packages/media-ingest/lossless-record.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { canonicalComputationRecordName, canonicalObjectName } from "../packages/edit-render/owner-media.js";
import { cdBase, cdSeed, cdRequest, cdAdmit } from "./support/canonical-lossless-cd.js";
import { declareGeneratedAvCenter, declareGeneratedFullRange, registerGenerated, verifyGenerated } from "./support/canonical-reencode-media.js";
import { generateFixture, generatePlanFixture, sha256File } from "./support/canonical-media-fixtures.js";
import { buildChromaSafeDerivation, type ChromaSafeDerivation } from "../packages/media-ingest/chroma.js";
type Published = { outcome: string; cache: string; publication: string; renderAuthority: string; computationId: string;
  derivation: ChromaSafeDerivation; output: local.SourceIdentity; record: CanonicalLosslessComputationRecord; resources: local.CanonicalLosslessStreamingResources };
type Template = { source: string; bytes: Buffer; recordBytes: string; record: CanonicalLosslessComputationRecord };
let sources = "", stores = "", basic: Template, audio: Template; const receipt: unknown[] = [];
const layout = (workspace: string) => { const root = join(workspace, ".local-media", "canonical-v0");
  return { root, objects: join(root, "objects"), computations: join(root, "computations"), pending: join(root, "pending") }; };
async function template(source: string): Promise<Template> {
  const a = await cdAdmit(source, stores); assert.ok(a.admission);
  // Fixture construction only: a complete C–D verified temporary becomes attacker-controlled cache input, never runtime authority.
  return local.withCanonicalLosslessTemporary(a.request, a.admission, async h => {
    const out = local.canonicalLosslessTemporaryOf(h), witness = await local.verifyCanonicalLosslessTemporary(h), proof = await local.canonicalLosslessPrepublicationOf(witness);
    const bytes = await fs.readFile(out.outputPath), length = bytes.readUInt32BE(0), majorBrand = bytes.toString("ascii", 8, 12), compatibleBrands: string[] = [];
    for (let at = 16; at < length; at += 4) compatibleBrands.push(bytes.toString("ascii", at, at + 4));
    const { createHash } = await import("node:crypto");
    const r = compactLosslessComputationRecordOf(proof.derivation, { family: "iso_bmff", format: majorBrand === "qt  " ? "mov" : "mp4", majorBrand, compatibleBrands,
      fileTypeBoxDigest: createHash("sha256").update(bytes.subarray(0, length)).digest("hex"), video: { codec: "h264", profile: "High 4:4:4 Predictive", pixelFormat: "yuv420p" } });
    return { source, bytes, recordBytes: r.bytes, record: r.record };
  });
}
before(async () => {
  sources = await cdBase("ef-cs-"); stores = await cdBase("ef-cw-"); basic = await template(await cdSeed(sources, "hevc"));
  const seed = registerGenerated(await generatePlanFixture(sources, "audio-seed.mp4", { hevc: true, audio: "aac", sei: "encoder" }));
  audio = await template(await declareGeneratedAvCenter(seed, join(sources, "audio-center.mp4"), "hevc", 90000));
});
after(async () => { await fs.writeFile(join(stores, "cache-publication-receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx" }); });
async function prepare(name: string, t = basic, includeObject = true) {
  const workspace = join(stores, name), paths = layout(workspace); await fs.mkdir(paths.root, { recursive: true });
  for (const p of [paths.objects, paths.computations, paths.pending]) await fs.mkdir(p);
  const object = join(paths.objects, canonicalObjectName(t.record.output.contentHash)), record = join(paths.computations, canonicalComputationRecordName(t.record.computationId));
  if (includeObject) await fs.writeFile(object, t.bytes, { flag: "wx" }); await fs.writeFile(record, t.recordBytes, { flag: "wx" });
  return { request: await cdRequest(t.source, workspace), paths, object, record };
}
const identified = (r: CanonicalLosslessComputationRecord) => { const { recordId: _id, ...body } = r;
  return canonicalSerialize(identify(CANONICAL_LOSSLESS_RECORD_IDENTITY, "recordId", body)) + "\n"; };
async function corruptRefusal(f: Awaited<ReturnType<typeof prepare>>) {
  const object = await fs.readFile(f.object).catch(() => null), record = await fs.readFile(f.record); let encodes = 0;
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...f.request, instrumentation: { beforeProcess: async ({ role }) => { if (role === "canonicalize") encodes++; } } }),
    (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "cache_corrupt");
  assert.equal(encodes, 0); assert.deepEqual(await fs.readFile(f.object).catch(() => null), object); assert.deepEqual(await fs.readFile(f.record), record);
  assert.deepEqual(await fs.readdir(f.paths.pending), []); receipt.push({ case: f.request.workspaceRoot.split(/[\\/]/).at(-1), outcome: "cache_corrupt", encodes });
}
test("EF-CACHE-hit: fresh full samples/chroma/timing/audio, no encoder and no authorization", async () => {
  const f = await prepare("hit", audio), roles: string[] = [];
  const r = await local.canonicalizeLocalMedia({ ...f.request, instrumentation: { beforeProcess: async e => { roles.push(e.role); } } }) as unknown as Published;
  assert.equal(r.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED"); assert.equal(r.cache, "hit"); assert.equal(r.renderAuthority, "not_registered"); assert.equal("authorization" in r, false);
  assert.equal(roles.includes("canonicalize"), false); assert.ok(roles.filter(x => x === "source_facts").length >= 3); assert.ok(roles.filter(x => x === "output_facts").length >= 3);
  assert.ok(roles.includes("source_video_digest")); assert.ok(roles.includes("output_video_digest")); assert.ok(roles.includes("source_headers")); assert.ok(roles.includes("output_headers"));
  assert.ok(r.derivation.sampleDerivation.verification.audioPackets); assert.ok(r.derivation.sampleDerivation.verification.audioTiming);
  assert.equal(r.resources.maximumFullFrameBuffers, 3); assert.deepEqual(r.record, audio.record);
  assert.deepEqual(await sha256File(f.object), { contentHash: r.output.contentHash, sizeBytes: r.output.sizeBytes });
});
test("EF-CACHE-cross-scope: independent requesting root, same scope-free record", async () => {
  const f = await prepare("scope"), a = await local.canonicalizeLocalMedia(f.request) as unknown as Published;
  const root = { ...f.request.rootAuthorization as object, creatorId: "creator_separately_authorized", projectId: "project_separately_authorized" };
  const b = await local.canonicalizeLocalMedia({ ...f.request, rootAuthorization: root }) as unknown as Published;
  assert.equal(a.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED"); assert.equal(b.cache, "hit"); assert.equal(a.computationId, b.computationId); assert.deepEqual(a.record, b.record);
  assert.notEqual(a.derivation.derivationId, b.derivation.derivationId); assert.equal(b.derivation.sampleDerivation.scope.creatorId, "creator_separately_authorized");
});
for (const mode of ["hash", "length", "missing", "same-hash-name-wrong-bytes", "directory-object"])
test("EF-CACHE-byte-corruption-" + mode, async () => {
  const f = await prepare("bytes-" + mode); if (mode === "missing" || mode === "directory-object") { await fs.unlink(f.object); if (mode === "directory-object") await fs.mkdir(f.object); }
  else { const b = await fs.readFile(f.object); if (mode === "length") await fs.writeFile(f.object, b.subarray(0, b.length - 1)); else { b[b.length - 1] = b[b.length - 1]! ^ 1; await fs.writeFile(f.object, b); } }
  if (mode === "directory-object") {
    await assert.rejects(() => local.canonicalizeLocalMedia(f.request), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "cache_corrupt");
    assert.deepEqual(await fs.readdir(f.object), []);
  } else await corruptRefusal(f);
});
for (const mode of ["malformed", "missing-field", "extra-field", "old-version", "plan", "computation", "toolchain", "policy", "stale-facts", "wrong-link"])
test("EF-CACHE-record-corruption-" + mode, async () => {
  const f = await prepare("record-" + mode), r = structuredClone(basic.record);
  if (mode === "malformed") await fs.writeFile(f.record, "{");
  else {
    if (mode === "missing-field") delete (r as unknown as Record<string, unknown>).verification;
    if (mode === "extra-field") Object.assign(r, { creatorId: "private_owner" });
    if (mode === "old-version") Object.assign(r, { artifactVersion: "0.2.0" });
    if (mode === "plan") r.plan.planId = "canonical_reencode_plan_v2_" + "a".repeat(64);
    if (mode === "computation") r.computationId = "canonical_media_computation_v3_" + "a".repeat(64);
    if (mode === "toolchain") Object.assign(r, { toolchain: {} });
    if (mode === "policy") r.plan.verificationPolicyId = "a".repeat(64);
    if (mode === "stale-facts") r.output.factsDigest = "a".repeat(64);
    if (mode === "wrong-link") { r.output.contentHash = "a".repeat(64); r.output.assetId = "asset_" + r.output.contentHash; }
    await fs.writeFile(f.record, identified(r));
  }
  await corruptRefusal(f);
});
async function changedOutput(t: Template, mode: string): Promise<Buffer> {
  if (mode === "format") return fs.readFile(await generateFixture(sources, "wrong-cache-format.mp4", { audio: "none", sar: "square", pixelFormat: "yuv444p", profileColor: true }));
  if (mode === "range") {
    const input = join(sources, "range-input.mp4"); await fs.writeFile(input, t.bytes, { flag: "wx" });
    return fs.readFile(await declareGeneratedFullRange(registerGenerated(input), join(sources, "wrong-cache-range.mp4")));
  }
  const a = await cdAdmit(t.source, stores), original = childProcess.spawn; let attacked = false;
  childProcess.spawn = ((file: string, args: readonly string[], options: childProcess.SpawnOptions) => {
    if (!args.includes("-fs")) return original(file, args, options);
    attacked = true; const argv = [...args], vf = argv.indexOf("-vf");
    if (["Y", "U", "V"].includes(mode)) {
      const part = mode === "Y" ? "lum" : mode === "U" ? "cb" : "cr";
      argv[vf + 1] += ",geq=" + ["lum", "cb", "cr"].map(p => p + "='" + (p === part ? "if(eq(X,0)*eq(Y,0)," + p + "(X,Y)+1," + p + "(X,Y))" : p + "(X,Y)") + "'").join(":");
    }
    if (mode === "chroma") argv.splice(argv.indexOf("-map_metadata"), 0, "-bsf:v", "h264_metadata=chroma_sample_loc_type=0");
    if (mode === "range") argv[argv.indexOf("-color_range") + 1] = "pc";
    if (mode === "format") { argv[argv.indexOf("-pix_fmt") + 1] = "+yuv444p"; argv[vf + 1] += ",format=yuv444p"; }
    if (mode === "profile") { argv[argv.indexOf("-qp") + 1] = "18"; argv[argv.indexOf("-profile:v") + 1] = "high"; }
    if (mode === "drop") argv.splice(argv.indexOf("-map_metadata"), 0, "-frames:v", "8");
    if (mode === "duplicate") argv[vf + 1] += ",tpad=stop=1:stop_mode=clone";
    if (mode === "timestamps") argv[argv.indexOf("-video_track_timescale") + 1] = "90000";
    if (mode === "audio-timing") argv.splice(argv.indexOf("-map_metadata"), 0, "-bsf:a", "setts=pts=PTS+240:dts=DTS+240");
    if (mode === "audio-payload") { argv[argv.indexOf("-c:a") + 1] = "aac"; argv.splice(argv.indexOf("-map_metadata"), 0, "-af", "volume=0.5"); }
    return original(file, argv, options);
  }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
  try { const bytes = await local.withCanonicalLosslessTemporary(a.request, a.admission, async h => fs.readFile(local.canonicalLosslessTemporaryOf(h).outputPath));
    assert.equal(attacked, true); return bytes; }
  finally { childProcess.spawn = original; syncBuiltinESMExports(); }
}
for (const mode of ["Y", "U", "V", "chroma", "range", "format", "profile", "drop", "duplicate", "timestamps", "audio-timing", "audio-payload"])
test("EF-CACHE-complete-media-proof-" + mode + ": correct physical hash and rehashed record cannot replace fresh proof", async () => {
  const t = mode.startsWith("audio-") ? audio : basic, f = await prepare("media-" + mode, t), bytes = await changedOutput(t, mode);
  const r = structuredClone(t.record), { createHash } = await import("node:crypto"), hash = createHash("sha256").update(bytes).digest("hex");
  r.output.assetId = "asset_" + hash; r.output.contentHash = hash; r.output.sizeBytes = bytes.length;
  const oldId = r.verification.chroma.outputObservationId; // Deliberately stale observation commitment; actual bytes MUST still be measured.
  const object = join(f.paths.objects, canonicalObjectName(hash)); await fs.writeFile(object, bytes, { flag: "wx" });
  await fs.writeFile(f.record, identified(r));
  await corruptRefusal({ ...f, object }); assert.equal(r.verification.chroma.outputObservationId, oldId);
});
test("EF-CACHE-record-changed-during-proof: same-byte replacement has a different inode", async () => {
  const f = await prepare("record-race"); let changed = false;
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...f.request, instrumentation: { beforeProcess: async e => {
    if (!changed && e.role === "output_video_digest") { changed = true; const b = await fs.readFile(f.record); await fs.unlink(f.record); await fs.writeFile(f.record, b, { flag: "wx" }); }
  } } }), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "cache_corrupt"); assert.equal(changed, true);
});
test("EF-CACHE-object-changed-during-proof: same-byte replacement is not the held object", async () => {
  const f = await prepare("object-race"); let changed = false;
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...f.request, instrumentation: { beforeProcess: async e => {
    if (!changed && e.role === "output_video_digest") { changed = true; const b = await fs.readFile(f.object); await fs.unlink(f.object); await fs.writeFile(f.object, b, { flag: "wx" }); }
  } } }), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "cache_corrupt"); assert.equal(changed, true);
});
test("EF-CACHE-real-decoder-failure: both actual children close; no encoder or output overwrite", async () => {
  const f = await prepare("decoder-fault"), original = childProcess.spawn, children: ReturnType<typeof original>[] = [], closed = new Set<ReturnType<typeof original>>();
  childProcess.spawn = ((file: string, args: readonly string[], options: childProcess.SpawnOptions) => {
    const decoder = args.includes("rawvideo"), c = original(file, decoder ? ["-ef_intentionally_invalid", ...args] : args, options);
    if (decoder) { children.push(c); c.on("close", () => closed.add(c)); } return c;
  }) as typeof original; syncBuiltinESMExports();
  try { await assert.rejects(() => local.canonicalizeLocalMedia(f.request), (e: unknown) => e instanceof local.CanonicalIngestError && ["process_failed", "cache_corrupt"].includes(e.code)); }
  finally { childProcess.spawn = original; syncBuiltinESMExports(); }
  assert.equal(children.length, 2); assert.equal(closed.size, 2); assert.deepEqual(await fs.readFile(f.object), basic.bytes);
});

async function emptyRequest(name: string) { const workspace = join(stores, name); await fs.mkdir(workspace); return cdRequest(basic.source, workspace); }
test("EF-PUBLISH-miss-then-hit: one object/record, temporary cleanup, no second encoder", async () => {
  const req = await emptyRequest("miss"); let encodes = 0; const tracked = { ...req, instrumentation: { beforeProcess: async e => { if (e.role === "canonicalize") encodes++; } } } satisfies local.CanonicalIngestRequest;
  const a = await local.canonicalizeLocalMedia(tracked) as unknown as Published, b = await local.canonicalizeLocalMedia(tracked) as unknown as Published;
  assert.equal(a.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED"); assert.equal(a.cache, "miss"); assert.equal(b.cache, "hit"); assert.equal(encodes, 1); assert.deepEqual(a.record, b.record);
  const p = layout(req.workspaceRoot); assert.equal((await fs.readdir(p.objects)).length, 1); assert.equal((await fs.readdir(p.computations)).length, 1); assert.deepEqual(await fs.readdir(p.pending), []);
  assert.deepEqual(await fs.readdir(join(req.workspaceRoot, ".local-runs")), []); assert.equal("authorization" in a, false);
});
test("EF-PUBLISH-concurrent-identical: two encoders, identical verified winner, one record", async () => {
  const req = await emptyRequest("race-identical"); let waiting = 0; let release: () => void = () => undefined; const barrier = new Promise<void>(r => { release = r; });
  const make = () => { let calls = 0; return { ...req, instrumentation: { beforePublication: async () => { if (++calls === 1) { if (++waiting === 2) release(); await barrier; } } } }; };
  const results = await Promise.all([local.canonicalizeLocalMedia(make()), local.canonicalizeLocalMedia(make())]) as unknown as Published[];
  assert.ok(results.every(r => r.outcome === "PUBLISHED_VERIFIED_NOT_AUTHORIZED")); assert.equal(results[0]!.output.contentHash, results[1]!.output.contentHash);
  assert.deepEqual(results.map(r => r.publication).sort(), ["existing_object_reverified", "published_by_this_operation"]);
  const p = layout(req.workspaceRoot); assert.equal((await fs.readdir(p.objects)).length, 1); assert.equal((await fs.readdir(p.computations)).length, 1); assert.deepEqual(await fs.readdir(p.pending), []);
});
test("EF-PUBLISH-orphan-adoption: verified identical object without a record is freshly adopted", async () => {
  const f = await prepare("orphan"); await fs.unlink(f.record); let encodes = 0;
  const r = await local.canonicalizeLocalMedia({ ...f.request, instrumentation: { beforeProcess: async e => { if (e.role === "canonicalize") encodes++; } } }) as unknown as Published;
  assert.equal(r.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED"); assert.equal(r.publication, "existing_object_reverified"); assert.equal(r.cache, "miss"); assert.equal(encodes, 1);
  assert.deepEqual(await fs.readFile(f.object), basic.bytes);
});
for (const mode of ["occupied-object", "record-collision", "object-after-link", "permission", "no-overwrite", "pending-cleanup", "pending-replacement"])
test("EF-PUBLISH-hostile-" + mode + ": no replacement, no trust and precise owned cleanup", async () => {
  const req = await emptyRequest("pub-" + mode), originalLink = fs.link, originalUnlink = fs.unlink; let attacked = false, occupant = "";
  fs.link = async (from, to) => {
    const target = String(to), object = target.includes("objects"), record = target.includes("computations");
    if (mode === "permission" || mode === "no-overwrite") { attacked = true; throw Object.assign(new Error("injected syscall refusal"), { code: mode === "permission" ? "EACCES" : "ENOSPC" }); }
    if ((mode === "occupied-object" && object) || (mode === "record-collision" && record)) {
      attacked = true; occupant = target; await fs.writeFile(target, "attacker occupant", { flag: "wx" }); return originalLink(from, to);
    }
    if (mode === "pending-replacement" && record) { attacked = true; const b = await fs.readFile(from); await originalUnlink(from); await fs.writeFile(from, b, { flag: "wx" }); }
    await originalLink(from, to);
    if (mode === "object-after-link" && object) { attacked = true; occupant = target; await fs.chmod(target, 0o666); await fs.writeFile(target, "attacker occupant"); }
  };
  fs.unlink = async path => { if (mode === "pending-cleanup" && String(path).endsWith(".pending")) { attacked = true; throw Object.assign(new Error("injected cleanup refusal"), { code: "EACCES" }); } return originalUnlink(path); };
  syncBuiltinESMExports();
  try { await assert.rejects(() => local.canonicalizeLocalMedia(req), (e: unknown) => e instanceof local.CanonicalIngestError && ["publication_conflict", "store_unavailable", "output_invalid"].includes(e.code)); }
  finally { fs.link = originalLink; fs.unlink = originalUnlink; syncBuiltinESMExports(); }
  assert.equal(attacked, true); if (occupant) assert.equal(await fs.readFile(occupant, "utf8"), "attacker occupant");
});
test("EF-PUBLISH-interrupted-between-object-and-record: orphan remains; later reconciliation measures again", async () => {
  const req = await emptyRequest("interrupted"); let calls = 0;
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...req, instrumentation: { beforePublication: async () => { if (++calls === 2) throw new Error("injected interruption"); } } }), /instrumentation failed/);
  const p = layout(req.workspaceRoot); assert.equal((await fs.readdir(p.objects)).length, 1); assert.deepEqual(await fs.readdir(p.computations), []);
  assert.deepEqual(await fs.readdir(join(req.workspaceRoot, ".local-runs")), []);
  const r = await local.canonicalizeLocalMedia(req) as unknown as Published; assert.equal(r.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED"); assert.equal(r.publication, "existing_object_reverified");
});
test("EF-PUBLISH-record-changed-before-return: failure preserves the changed record", async () => {
  const req = await emptyRequest("final-record"); let calls = 0, changed = "";
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...req, instrumentation: { beforePublication: async () => {
    if (++calls === 3) { const p = layout(req.workspaceRoot); changed = join(p.computations, (await fs.readdir(p.computations))[0]!); await fs.writeFile(changed, "changed record"); }
  } } }), (e: unknown) => e instanceof local.CanonicalIngestError && ["cache_corrupt", "publication_conflict"].includes(e.code));
  assert.equal(await fs.readFile(changed, "utf8"), "changed record");
});
test("EF-PUBLISH-full-filesystem: unchanged reservation guard refuses before encoder", async () => {
  const req = await emptyRequest("no-space"), original = fs.statfs; let encodes = 0;
  fs.statfs = (async () => ({ bsize: 4096n, bavail: 0n })) as unknown as typeof fs.statfs; syncBuiltinESMExports();
  try { await assert.rejects(() => local.canonicalizeLocalMedia({ ...req, instrumentation: { beforeProcess: async e => { if (e.role === "canonicalize") encodes++; } } }), /reservation exceeds/); }
  finally { fs.statfs = original; syncBuiltinESMExports(); } assert.equal(encodes, 0);
});
test("EF-PUBLISH-temporary-replacement: identical bytes on another inode cannot authorize linking", async () => {
  const req = await emptyRequest("tmp-replace"); let calls = 0, replaced = "";
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...req, instrumentation: { beforePublication: async () => {
    if (++calls !== 1) return; const parent = join(req.workspaceRoot, ".local-runs"), directory = join(parent, (await fs.readdir(parent))[0]!);
    replaced = join(directory, (await fs.readdir(directory))[0]!); const b = await fs.readFile(replaced); await fs.unlink(replaced); await fs.writeFile(replaced, b, { flag: "wx" });
  } } }), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "output_invalid");
  assert.ok(replaced); assert.deepEqual(await fs.readFile(replaced), basic.bytes); assert.deepEqual(await fs.readdir(layout(req.workspaceRoot).objects), []);
});
test("EF-PUBLISH-original-replacement-during-encode: current named identity remains mandatory", async () => {
  const path = join(sources, "source-replace.mp4"); await fs.copyFile(basic.source, path);
  const req = await emptyRequest("src-replace"); req.sourcePath = path; let replaced = false;
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...req, instrumentation: { beforeProcess: async e => {
    if (!replaced && e.role === "canonicalize") { replaced = true; const b = await fs.readFile(path); await fs.unlink(path); await fs.writeFile(path, b, { flag: "wx" }); }
  } } }), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "source_changed");
  assert.equal(replaced, true); assert.deepEqual(await fs.readdir(layout(req.workspaceRoot).objects), []);
});
test("EF-PUBLISH-source/store-alias: no store is allowed in the original source directory", async () => {
  const req = await cdRequest(basic.source, sources);
  await assert.rejects(() => local.canonicalizeLocalMedia(req), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "store_location_invalid");
});
test("EF-PUBLISH-store-junction: escape is refused before publication", async () => {
  const req = await emptyRequest("junction"), target = join(stores, "junction-target"); await fs.mkdir(target);
  await fs.symlink(target, join(req.workspaceRoot, ".local-media"), "junction");
  await assert.rejects(() => local.canonicalizeLocalMedia(req), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "store_location_invalid");
  assert.deepEqual(await fs.readdir(target), []);
});
test("EF-CACHE-deadline-before-spawn: expired complete operation creates no unsupervised decoder", async () => {
  const f = await prepare("deadline"); let encodes = 0;
  await assert.rejects(() => local.canonicalizeLocalMedia({ ...f.request, limits: { canonicalizationTimeoutMilliseconds: 1 },
    instrumentation: { beforeProcess: async e => { if (e.role === "canonicalize") encodes++; } } }),
    (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "process_timeout"); assert.equal(encodes, 0);
  assert.deepEqual(await fs.readFile(f.object), basic.bytes);
});
test("EF-CACHE-source/output-hardlink-alias: source inode cannot occupy the expected output name", async () => {
  const f = await prepare("hardlink-alias"), before = await sha256File(basic.source); await fs.unlink(f.object); await fs.link(basic.source, f.object);
  await corruptRefusal(f); assert.deepEqual(await sha256File(basic.source), before);
});
test("EF-CACHE-missing-terminal-close: actual decoders finish but omitted close evidence never returns trust", async () => {
  const f = await prepare("missing-close"), original = childProcess.spawn, physicallyClosed = new Set<ReturnType<typeof original>>(); let decoders = 0;
  childProcess.spawn = ((file: string, args: readonly string[], options: childProcess.SpawnOptions) => {
    const c = original(file, args, options); if (!args.includes("rawvideo")) return c; decoders++;
    const emit = c.emit as (name: string, ...args: unknown[]) => boolean;
    c.emit = ((name: string, ...a: unknown[]) => { if (name === "close") { physicallyClosed.add(c); return false; } return emit.call(c, name, ...a); }) as typeof c.emit;
    return c;
  }) as typeof original; syncBuiltinESMExports();
  try { await assert.rejects(() => local.canonicalizeLocalMedia({ ...f.request, limits: { canonicalizationTimeoutMilliseconds: 8000 } }),
    (e: unknown) => e instanceof local.CanonicalIngestError && ["process_failed", "process_timeout"].includes(e.code)); }
  finally { childProcess.spawn = original; syncBuiltinESMExports(); }
  assert.equal(decoders, 2); assert.equal(physicallyClosed.size, 2); assert.deepEqual(await fs.readFile(f.object), basic.bytes);
});
test("EF-CACHE-deep-malformed-JSON: byte-bounded JSON is schema-checked before recursive canonical serialization", async () => {
  const f = await prepare("deep-json"), bad = '{"deep":' + "[".repeat(20000) + "0" + "]".repeat(20000) + "}\n";
  assert.ok(Buffer.byteLength(bad) < 262144); await fs.writeFile(f.record, bad); await corruptRefusal(f);
});
for (const offset of [8, 16]) test("EF-CACHE-ftyp-high-bit-" + offset + ": full fresh 0.4 evidence and exact record still require truthful raw container labels", async () => {
  const f = await prepare("brand-" + offset), bytes = Buffer.from(basic.bytes); bytes[offset] = bytes[offset]! ^ 128;
  const bad = join(sources, "brand-" + offset + ".mp4"); await fs.writeFile(bad, bytes, { flag: "wx" }); registerGenerated(bad);
  const a = await cdAdmit(basic.source, stores), independent = await verifyGenerated(basic.source, bad, "identity", a.facts, stores);
  const output = await local.inspectCanonicalChromaLocalMedia(await cdRequest(bad, stores));
  assert.equal(independent.pixels.sampleMismatchCount, 0);
  const d = buildChromaSafeDerivation({ sampleDerivation: independent.derivation, plan: a.planning.plan, outputChroma: output.observation });
  const { createHash } = await import("node:crypto"), format = { ...basic.record.output.format,
    fileTypeBoxDigest: createHash("sha256").update(bytes.subarray(0, bytes.readUInt32BE(0))).digest("hex") };
  const r = compactLosslessComputationRecordOf(d, format), object = join(f.paths.objects, canonicalObjectName(r.record.output.contentHash));
  await fs.writeFile(object, bytes, { flag: "wx" }); await fs.writeFile(f.record, r.bytes); await corruptRefusal({ ...f, object });
});

// Owner-review RED: budgets constrain each request, independently of the scope-free computation identity.
let budgetFixture: Promise<{ request: local.CanonicalIngestRequest; paths: ReturnType<typeof layout>; object: string; record: string;
  published: Published; objectBytes: Buffer; recordBytes: Buffer }> | undefined;
function previouslyPublishedBudgetFixture() {
  return budgetFixture ??= (async () => {
    const request = await emptyRequest("budget-boundary"), published = await local.canonicalizeLocalMedia(request) as unknown as Published;
    assert.equal(published.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED"); assert.equal(published.cache, "miss");
    const paths = layout(request.workspaceRoot), object = join(paths.objects, canonicalObjectName(published.output.contentHash)),
      record = join(paths.computations, canonicalComputationRecordName(published.computationId));
    const objectBytes = await fs.readFile(object), recordBytes = await fs.readFile(record);
    assert.equal(objectBytes.length, published.output.sizeBytes); assert.equal(published.computationId, basic.record.computationId);
    return { request, paths, object, record, published, objectBytes, recordBytes };
  })();
}
for (const budgetCase of ["N-1", "N", "N+1", "omitted"] as const)
test("EF-CACHE-output-budget-" + budgetCase + ": a valid prior publication obeys this request's byte budget", async t => {
  const f = await previouslyPublishedBudgetFixture(), n = f.objectBytes.length,
    maxOutputBytes = budgetCase === "omitted" ? undefined : n + (budgetCase === "N-1" ? -1 : budgetCase === "N+1" ? 1 : 0);
  assert.ok(n > 1 && n < local.CANONICAL_LOSSLESS_RUNTIME_BOUNDS.defaultOutputBytes);
  const roles: string[] = []; let result: Published | undefined, refusal: local.CanonicalIngestError | undefined;
  try { result = await local.canonicalizeLocalMedia({ ...f.request, ...(maxOutputBytes === undefined ? {} : { limits: { maxOutputBytes } }),
    instrumentation: { beforeProcess: async e => { roles.push(e.role); } } }) as unknown as Published; }
  catch (e) { if (!(e instanceof local.CanonicalIngestError)) throw e; refusal = e; }
  const observed = { case: "output-budget-" + budgetCase, sizeBytes: n, maxOutputBytes: maxOutputBytes ?? "omitted",
    outcome: result?.outcome ?? refusal?.code, computationId: result?.computationId ?? f.published.computationId, encodes: roles.filter(x => x === "canonicalize").length };
  receipt.push(observed); t.diagnostic(JSON.stringify(observed));
  assert.equal(observed.encodes, 0); assert.deepEqual(await fs.readFile(f.object), f.objectBytes); assert.deepEqual(await fs.readFile(f.record), f.recordBytes);
  assert.deepEqual(await fs.readdir(f.paths.pending), []); assert.equal(JSON.parse(f.recordBytes.toString("utf8")).computationId, f.published.computationId);
  assert.ok(roles.includes("source_video_digest") && roles.includes("output_video_digest"));
  assert.ok(roles.includes("source_headers") && roles.includes("output_headers"));
  if (budgetCase === "N-1") assert.equal(refusal?.code, "output_invalid", "A fully valid cache hit must refuse the narrower request budget.");
  else { assert.equal(refusal, undefined); assert.equal(result?.cache, "hit"); assert.equal(result?.computationId, f.published.computationId);
    assert.equal(result?.output.sizeBytes, n); assert.deepEqual(result?.record, f.published.record); }
});

async function boundedFileIdentity(path: string) {
  const { createHash } = await import("node:crypto"), handle = await fs.open(path, "r"), digest = createHash("sha256"), buffer = Buffer.alloc(65536);
  try { const stat = await handle.stat({ bigint: true }); let position = 0;
    for (;;) { const { bytesRead } = await handle.read(buffer, 0, buffer.length, position); if (!bytesRead) break;
      digest.update(buffer.subarray(0, bytesRead)); position += bytesRead; }
    assert.equal(BigInt(position), stat.size); return { contentHash: digest.digest("hex"), sizeBytes: position, dev: stat.dev, ino: stat.ino };
  } finally { await handle.close(); }
}
test("EF-CACHE-output-budget-default: omitted limit refuses valid bytes above the accepted default", async t => {
  const request = await emptyRequest("budget-default"), n = local.CANONICAL_LOSSLESS_RUNTIME_BOUNDS.defaultOutputBytes + 1;
  const original = childProcess.spawn; let padded = false;
  // Generated container-size fixture only: append an inert top-level BMFF free box after the real encoder closes.
  // The real held temporary and both complete production verifications still measure every resulting byte and media invariant.
  childProcess.spawn = ((file: string, args: readonly string[], options: childProcess.SpawnOptions) => {
    const child = original(file, args, options);
    if (args.includes("libx264") && args.includes("-qp")) child.on("close", code => {
      assert.equal(code, 0); assert.ok(Array.isArray(options.stdio)); const fd = options.stdio[4]; assert.equal(typeof fd, "number");
      const position = fstatSync(fd as number).size, header = Buffer.alloc(8); assert.ok(n - position >= 8);
      header.writeUInt32BE(n - position, 0); header.write("free", 4, "ascii"); assert.equal(writeSync(fd as number, header, 0, 8, position), 8);
      ftruncateSync(fd as number, n); padded = true;
    });
    return child;
  }) as typeof original; syncBuiltinESMExports();
  let published: Published;
  try { published = await local.canonicalizeLocalMedia({ ...request, limits: { maxOutputBytes: n } }) as unknown as Published; }
  finally { childProcess.spawn = original; syncBuiltinESMExports(); }
  assert.equal(padded, true); assert.equal(published.cache, "miss"); assert.equal(published.output.sizeBytes, n);
  const paths = layout(request.workspaceRoot), object = join(paths.objects, canonicalObjectName(published.output.contentHash)),
    record = join(paths.computations, canonicalComputationRecordName(published.computationId)), before = await boundedFileIdentity(object), recordBytes = await fs.readFile(record);
  assert.equal(before.contentHash, published.output.contentHash); assert.equal(before.sizeBytes, n);
  for (const maxOutputBytes of [n, undefined]) {
    const roles: string[] = []; let result: Published | undefined, refusal: local.CanonicalIngestError | undefined;
    try { result = await local.canonicalizeLocalMedia({ ...request, ...(maxOutputBytes === undefined ? {} : { limits: { maxOutputBytes } }),
      instrumentation: { beforeProcess: async e => { roles.push(e.role); } } }) as unknown as Published; }
    catch (e) { if (!(e instanceof local.CanonicalIngestError)) throw e; refusal = e; }
    const observed = { case: "output-budget-default", sizeBytes: n, maxOutputBytes: maxOutputBytes ?? "omitted", outcome: result?.outcome ?? refusal?.code,
      computationId: result?.computationId ?? published.computationId, encodes: roles.filter(x => x === "canonicalize").length };
    receipt.push(observed); t.diagnostic(JSON.stringify(observed)); assert.equal(observed.encodes, 0);
    assert.deepEqual(await boundedFileIdentity(object), before); assert.deepEqual(await fs.readFile(record), recordBytes); assert.deepEqual(await fs.readdir(paths.pending), []);
    assert.ok(roles.includes("source_video_digest") && roles.includes("output_video_digest")); assert.ok(roles.includes("source_headers") && roles.includes("output_headers"));
    if (maxOutputBytes === undefined) assert.equal(refusal?.code, "output_invalid", "Omission must enforce the accepted default, even on a valid larger cached object.");
    else { assert.equal(refusal, undefined); assert.equal(result?.cache, "hit"); assert.equal(result?.computationId, published.computationId); assert.deepEqual(result?.record, published.record); }
  }
});
