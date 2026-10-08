// A2 cache/publication/mutation controls. Generated synthetic media only; intentionally retained evidence in the test temp directory.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { openSync, closeSync } from "node:fs";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify } from "../packages/editorial/common.js";
import { CANONICAL_STORE, canonicalObjectName, canonicalComputationRecordName } from "../packages/edit-render/owner-media.js";
import { canonicalizeLocalMedia, type CanonicalIngestRequest, type CanonicalIngestResult } from "../scripts/media-ingest-local.js";
import { generatePlanFixture, generatePlanVariant, sha256File } from "./support/canonical-media-fixtures.js";
import { observeMediaSpawns, PINNED_TOOL_ROOT } from "./support/edit-render-media.js";

type PlanResult = Extract<CanonicalIngestResult, { outcome: "PLAN" }>;
let base = "", source = "", wrongSource = "", direct = "", wrongPixels = "", wrongAudio = "";
before(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "a2-trust-"))); const generated = join(base, "generated"); await mkdir(generated);
  await mkdir(join(base, "mutations"));
  direct = await generatePlanFixture(generated, "seed.mp4", {});
  source = await generatePlanVariant(direct, join(generated, "snap.mp4"), { snap: true });
  const other = await generatePlanFixture(generated, "other.mp4", { audio: "aac" });
  wrongSource = await generatePlanVariant(other, join(generated, "other-snap.mp4"), { snap: true, audio: true });
  wrongPixels = await generatePlanFixture(generated, "wrong-pixels.mp4", { pattern: "smptebars" });
  wrongAudio = await generatePlanFixture(generated, "wrong-audio.mp4", { audio: "aac", tone: 880 });
});
async function request(path = source, workspaceRoot?: string): Promise<CanonicalIngestRequest> {
  return { sourcePath: path, workspaceRoot: workspaceRoot ?? await realpath(await mkdtemp(join(base, "store-"))), toolRoot: PINNED_TOOL_ROOT,
    clock: { now: () => "2026-10-07T00:00:00.000Z" }, rootAuthorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", ...await sha256File(path),
      sourceType: "owner_supplied", authorizationBasis: "owner_created", allowedPurposes: ["local_footage_analysis"], dateAdded: "2026-10-01T00:00:00.000Z",
      creatorId: "creator_a2_trust", projectId: "project_a2_trust", canonicalizationConsent: "local_media_canonicalization" } };
}
async function plan(r: CanonicalIngestRequest): Promise<PlanResult> { const result = await canonicalizeLocalMedia(r); assert.equal(result.outcome, "PLAN"); return result as PlanResult; }
const store = (r: CanonicalIngestRequest, ...path: string[]) => join(r.workspaceRoot, ...CANONICAL_STORE.directory, ...path);
const object = (r: CanonicalIngestRequest, p: PlanResult) => store(r, "objects", canonicalObjectName(p.output.contentHash));
const record = (r: CanonicalIngestRequest, p: PlanResult) => store(r, "computations", canonicalComputationRecordName(p.computationId));
async function empty(r: CanonicalIngestRequest) {
  for (const name of ["objects", "computations", "pending"]) assert.deepEqual(await readdir(store(r, name)).catch(() => []), []);
}
const rejects = (r: CanonicalIngestRequest, codes: string[]) => assert.rejects(canonicalizeLocalMedia(r), (e: { code?: string }) => codes.includes(e.code ?? ""));
test("A2-V10 the production caller cannot supply source facts, output facts, plans or commands", async () => {
  const r = await request();
  for (const key of ["facts", "outputFacts", "profileOutcome", "plan", "operations", "argv", "sideData", "displayMatrix", "color", "timing"]) {
    await rejects({ ...r, [key]: { trusted: true } }, ["request_invalid"]);
  }
  await empty(r);
});
test("A2-C02/C03 concurrent identical computations publish once and both fully verify the winner", async () => {
  const r = await request(); let arrived = 0, release = () => {};
  const barrier = new Promise<void>(resolve => { release = resolve; }); let outputFacts = 0;
  r.instrumentation = { async beforePublication() { if (++arrived === 2) release(); await barrier; }, async beforeProcess({ role }) { if (role === "output_facts") outputFacts++; } };
  const results = await Promise.all([plan(r), plan(r)]);
  assert.deepEqual(results.map(p => p.publication).sort(), ["existing_object_reverified", "published_by_this_operation"]);
  assert.deepEqual(results[0]!.derivation, results[1]!.derivation); assert.equal(outputFacts, 4);
  assert.equal((await readdir(store(r, "objects"))).length, 1); assert.equal((await readdir(store(r, "computations"))).length, 1);
});
test("A2-C04/C05/O07 cache hit remeasures source and output, and derives new authorization", async () => {
  const r = await request(), first = await plan(r), roles: string[] = [], spawns = observeMediaSpawns();
  const secondRequest = { ...r, rootAuthorization: { ...(r.rootAuthorization as object), creatorId: "creator_new", projectId: "project_new" },
    instrumentation: { async beforeProcess({ role }: { role: string }) { roles.push(role); } } };
  let second: PlanResult; try { second = await plan(secondRequest); } finally { spawns.restore(); }
  assert.equal(second.cache, "hit"); assert.equal(second.computationId, first.computationId); assert.deepEqual(second.output, first.output);
  assert.notEqual(second.derivation.derivationId, first.derivation.derivationId); assert.equal(second.authorization.creatorId, "creator_new");
  for (const role of ["source_facts", "source_packets", "source_headers", "output_facts", "output_packets", "output_headers", "source_video_digest", "output_video_digest"]) assert.ok(roles.includes(role));
  assert.ok(!spawns.calls.some(c => c.arguments.includes("-fs")));
  const withoutConsent = { ...(r.rootAuthorization as Record<string, unknown>), schemaVersion: "1.0.0" }; delete (withoutConsent as Record<string, unknown>).canonicalizationConsent;
  await rejects({ ...r, rootAuthorization: withoutConsent }, ["canonicalization_consent_required"]);
});
test("A2-C06/C07 tampered cached object or record fails closed without repair", async () => {
  const r = await request(), result = await plan(r), bytes = await readFile(object(r, result)), originalRecord = await readFile(record(r, result));
  const bad = Buffer.from(bytes); bad[bad.length - 12] = bad[bad.length - 12]! ^ 1;
  await chmod(object(r, result), 0o666); await writeFile(object(r, result), bad); await rejects(r, ["cache_corrupt"]);
  assert.deepEqual(await readFile(object(r, result)), bad); await writeFile(object(r, result), bytes);
  await writeFile(record(r, result), "{}"); await rejects(r, ["cache_corrupt"]);
  await writeFile(record(r, result), originalRecord); assert.equal((await plan(r)).cache, "hit");
});
test("A2-C08/C09 a reidentified wrong-plan or another-source record never grants trust", async () => {
  const r = await request(), first = await plan(r), other = await plan(await request(wrongSource, r.workspaceRoot));
  const bytes = await readFile(record(r, first), "utf8"), theirs = JSON.parse(await readFile(record(r, other), "utf8")) as Record<string, unknown>;
  for (const field of ["source", "plan", "output"]) {
    const forged = JSON.parse(bytes) as Record<string, unknown>; delete forged.recordId; forged[field] = theirs[field];
    await writeFile(record(r, first), `${canonicalSerialize(identify("canonical_computation_record_v1", "recordId", forged))}\n`);
    await rejects(r, ["cache_corrupt"]);
  }
});
test("A2-C01 wrong bytes at a content address or computation record are never overwritten", async () => {
  const r = await request(), trusted = await plan(r), collision = await request(); await mkdir(store(collision, "objects"), { recursive: true });
  const occupied = object(collision, trusted), wrong = await readFile(direct); await writeFile(occupied, wrong);
  await rejects(collision, ["publication_conflict"]); assert.deepEqual(await readFile(occupied), wrong);
  assert.deepEqual(await readdir(store(collision, "computations")), []);
  const recordCollision = await request(); recordCollision.instrumentation = { async beforePublication() {
    await writeFile(record(recordCollision, trusted), "{tampered}", { flag: "wx" });
  } };
  await rejects(recordCollision, ["publication_conflict"]); assert.equal(await readFile(record(recordCollision, trusted), "utf8"), "{tampered}");
});
for (const mode of ["source_mutation", "source_replacement", "output_mutation", "output_replacement", "sealed_mutation", "sealed_replacement"] as const) {
  test(`A2-V09/F14 ${mode} cannot issue authorization`, async () => {
    const localSource = join(base, "mutations", `${mode}.mp4`); await copyFile(source, localSource); const r = await request(localSource); let changed = false;
    const mutate = async (path: string) => { changed = true; const bytes = await readFile(path);
      if (mode.includes("replacement")) { await unlink(path); await writeFile(path, bytes, { flag: "wx" }); }
      else { await chmod(path, 0o666); bytes[bytes.length - 12] = bytes[bytes.length - 12]! ^ 1; await writeFile(path, bytes); } };
    const pending = async () => store(r, "pending", (await readdir(store(r, "pending"))).find(n => n.endsWith(".mp4"))!);
    r.instrumentation = { async beforeProcess({ role }) {
      if (changed) return;
      if (mode.startsWith("source") && role === "source_packets") await mutate(localSource);
      if (mode.startsWith("output") && role === "output_facts") await mutate(await pending());
    }, async beforePublication() { if (mode.startsWith("sealed")) await mutate(await pending()); } };
    await rejects(r, ["source_changed", "verification_failed", "output_invalid"]); assert.ok(changed); await empty(r);
  });
}
test("A2-C10 timeout and partial output publish nothing", async () => {
  for (const limits of [{ canonicalizationTimeoutMilliseconds: 1 }, { maxOutputBytes: 300 }]) {
    const r = await request(); r.limits = limits; await rejects(r, ["process_timeout", "output_invalid", "process_failed"]); await empty(r);
  }
});

// Test-only hostile child substitution. Production has no argv or descriptor extension point. The real pinned subprocess executes,
// while the adapter must detect that its successful output does not implement the authorized source's exact plan.
for (const mode of ["pixels", "audio_payload", "wrong_grid", "omit_snap", "drop_frame", "process_failure"] as const) {
  test(`A2-hostile ${mode} from a child process cannot become a trusted derivation`, async () => {
    const r = await request(mode === "audio_payload" ? wrongSource : source), original = childProcess.spawn;
    let fd: number | null = null, attacked = 0;
    if (mode === "pixels" || mode === "audio_payload") fd = openSync(mode === "pixels" ? wrongPixels : wrongAudio, "r");
    childProcess.spawn = ((file: string, args: readonly string[], options: childProcess.SpawnOptions) => {
      if (!args.includes("-fs")) return original(file, [...args], options);
      attacked++; const changed = [...args], bsf = changed.indexOf("-bsf:v");
      if (mode === "wrong_grid") changed[bsf + 1] = "setts=pts=N*3600:dts=N*3600:duration=3600";
      if (mode === "omit_snap") changed.splice(bsf, 2);
      if (mode === "drop_frame") changed[bsf + 1] = "noise=drop=eq(n\\,5),setts=pts=N*3000:dts=N*3000:duration=3000";
      if (mode === "process_failure") changed.unshift("-a2_intentionally_invalid");
      const stdio = [...(options.stdio as childProcess.StdioOptions[])]; if (fd !== null) stdio[3] = fd as never;
      return original(file, changed, { ...options, stdio: stdio as childProcess.StdioOptions });
    }) as typeof childProcess.spawn;
    syncBuiltinESMExports();
    try { await rejects(r, ["verification_failed", "process_failed", "output_invalid"]); }
    finally { childProcess.spawn = original; syncBuiltinESMExports(); if (fd !== null) closeSync(fd); }
    assert.equal(attacked, 1); await empty(r);
  });
}

 // ---------------------------------------------------------------- C–D actual hostile pinned-child tests. Original A2 tests above remain byte-identical.
import * as cdLocal from "../scripts/media-ingest-local.js";
import cryptoCd from "node:crypto";
import { cdBase, cdSeed, cdAdmit, cdTransform } from "./support/canonical-lossless-cd.js";
import { verifyGenerated, registerGenerated } from "./support/canonical-reencode-media.js";
let cdDirectory = "", cdIdentity = "", cdRotate = "";
before(async () => {
  cdDirectory = await cdBase("cd-hostile-"); cdIdentity = await cdSeed(cdDirectory, "hevc");
  cdRotate = await cdTransform(cdDirectory, cdIdentity, "hostile-rotate", "rotate_90_cw");
});
for (const mode of ["wrong_chroma", "wrong_range", "lossy_qp", "crf_profile", "scale", "wrong_d4", "reverse", "drop_frame", "duplicate_frame",
  "wrong_timing", "encode_failure", "decoder_failure", "decoder_truncated", "decoder_source_failure", "descriptor_alias"] as const)
test("CD-HOSTILE-" + mode + ": actual child exit/output never bypasses verification", async () => {
  const source = ["wrong_d4", "scale"].includes(mode) ? cdRotate : cdIdentity;
  const a = await cdAdmit(source, cdDirectory), before = await sha256File(source), original = childProcess.spawn;
  let attacked = 0, sourceDecoders = 0, perfectlyEqual = false, verified = false;
  const children: ReturnType<typeof childProcess.spawn>[] = [], closed = new Set<ReturnType<typeof childProcess.spawn>>();
  const observedSpawn = (file: string, args: string[], options: childProcess.SpawnOptions) => {
    const child = original(file, args, options);
    if (args.includes("-fs") || args.includes("rawvideo")) { children.push(child); child.on("close", () => closed.add(child)); }
    return child;
  };
  childProcess.spawn = ((file: string, args: readonly string[], options: childProcess.SpawnOptions) => {
    const encode = args.includes("-fs"), decode = args.includes("rawvideo");
    if (decode) sourceDecoders++;
    const decoderAttack = mode === "decoder_source_failure" ? sourceDecoders === 1 : sourceDecoders === 2;
    if ((!encode || mode.startsWith("decoder_")) && !(decode && mode.startsWith("decoder_") && decoderAttack)) return observedSpawn(file, [...args], options);
    attacked++; const changed = [...args], stdio = [...(options.stdio as childProcess.StdioOptions[])], vf = changed.indexOf("-vf");
    if (mode === "wrong_chroma") changed.splice(changed.indexOf("-map_metadata"), 0, "-bsf:v", "h264_metadata=chroma_sample_loc_type=0");
    if (mode === "wrong_range") changed[changed.indexOf("-color_range") + 1] = "pc";
    if (mode === "lossy_qp") changed[changed.indexOf("-qp") + 1] = "18";
    if (mode === "crf_profile") changed.splice(changed.indexOf("-qp"), 2, "-crf", "17");
    if (mode === "scale") changed[vf + 1] += ",scale=24:32";
    if (mode === "wrong_d4") changed[vf + 1] = changed[vf + 1]!.replace("transpose=clock", "transpose=cclock");
    if (mode === "reverse") changed[vf + 1] += ",reverse";
    if (mode === "drop_frame") changed.splice(changed.indexOf("-map_metadata"), 0, "-frames:v", "8");
    if (mode === "duplicate_frame") changed[vf + 1] += ",tpad=stop=1:stop_mode=clone";
    if (mode === "wrong_timing") changed[changed.indexOf("-video_track_timescale") + 1] = "90000";
    if (mode === "encode_failure" || mode === "decoder_failure" || mode === "decoder_source_failure") changed.unshift("-cd_intentionally_invalid");
    if (mode === "decoder_truncated") changed.splice(changed.length - 1, 0, "-frames:v", "4");
    if (mode === "descriptor_alias") stdio[4] = stdio[3]!;
    return observedSpawn(file, changed, { ...options, stdio: stdio as childProcess.StdioOptions });
  }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
  try {
    await assert.rejects(() => cdLocal.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
      if (mode === "wrong_chroma") {
        const out = cdLocal.canonicalLosslessTemporaryOf(temporary);
        const oracle = await verifyGenerated(source, registerGenerated(out.outputPath), "identity", a.facts, cdDirectory);
        perfectlyEqual = oracle.pixels.sampleMismatchCount === 0;
      }
      await cdLocal.verifyCanonicalLosslessTemporary(temporary); verified = true;
    }), (e: unknown) => e instanceof cdLocal.CanonicalIngestError && ["process_failed", "process_timeout", "verification_failed", "output_invalid"].includes(e.code) && !e.message.includes("termination was not confirmed"));
  } finally { childProcess.spawn = original; syncBuiltinESMExports(); }
  assert.equal(verified, false); assert.ok(attacked >= 1);
  assert.equal(closed.size, children.length, "every actual encode/decode child must confirm terminal close before the failed operation returns");
  if (mode === "wrong_chroma") assert.equal(perfectlyEqual, true, "metadata refusal must occur despite exact Y/U/V samples");
  assert.deepEqual(await sha256File(source), before); assert.deepEqual(await readdir(join(cdDirectory, ".local-runs")), []);
});
test("CD-HOSTILE-binary-hash-mismatch: full hash gate refuses; actual executable bytes remain untouched", async () => {
  const a = await cdAdmit(cdIdentity, cdDirectory), original = cryptoCd.createHash; let hashesUntilFault = 0, injected = false, visited = false;
  // Existing test-only instrumentation positions a hostile HASH OBSERVATION at the next full pinned binary hash.
  // No executable is edited/replaced, and production checks are never disabled.
  cryptoCd.createHash = ((algorithm: string, options?: Parameters<typeof cryptoCd.createHash>[1]) => {
    const digest = original(algorithm, options);
    if (hashesUntilFault > 0 && --hashesUntilFault === 0) { digest.update("controlled_binary_observation_mismatch"); injected = true; }
    return digest;
  }) as typeof cryptoCd.createHash;
  syncBuiltinESMExports();
  try {
    await assert.rejects(() => cdLocal.withCanonicalLosslessTemporary({ ...a.request, instrumentation: { beforeProcess: async ({ role }) => {
      if (role === "canonicalize") hashesUntilFault = 2; // source reconfirmation, THEN full executable hash
    } } }, a.admission, async () => { visited = true; }), (e: unknown) => e instanceof cdLocal.CanonicalIngestError && e.code === "runtime_binary_mismatch");
  } finally { cryptoCd.createHash = original; syncBuiltinESMExports(); }
  assert.equal(injected, true); assert.equal(visited, false); assert.deepEqual(await readdir(join(cdDirectory, ".local-runs")), []);
});
test("CD-HOSTILE-path-replacement: identical replacement bytes during execution are a different held object", async () => {
  const path = join(cdDirectory, "replacement-copy.mp4"); await copyFile(cdIdentity, path); const a = await cdAdmit(path, cdDirectory); let visited = false;
  await assert.rejects(() => cdLocal.withCanonicalLosslessTemporary({ ...a.request, instrumentation: { beforeProcess: async ({ role }) => {
    if (role === "canonicalize") { const bytes = await readFile(path); await unlink(path); await writeFile(path, bytes, { flag: "wx" }); }
  } } }, a.admission, async () => { visited = true; }), (e: unknown) => e instanceof cdLocal.CanonicalIngestError && e.code === "source_changed");
  assert.equal(visited, false); assert.deepEqual(await readdir(join(cdDirectory, ".local-runs")), []);
});
