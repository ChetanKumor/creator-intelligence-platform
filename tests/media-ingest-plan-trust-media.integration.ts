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
