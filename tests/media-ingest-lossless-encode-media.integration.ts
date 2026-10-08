// C3 encoder tests precede implementation. All input media is constructed here.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { type ChromaSafeReencodePlan } from "../packages/media-ingest/chroma.js";
import { cdBase, cdSeed, cdAdmit, cdTransform } from "./support/canonical-lossless-cd.js";
import { D4_ELEMENTS } from "./support/canonical-pixel-reference.js";
import { registerGenerated, verifyGenerated, declareGeneratedAvCenter, MATRIX_FOR_D4 } from "./support/canonical-reencode-media.js";
import { generatePlanFixture, generatePlanVariant, sha256File } from "./support/canonical-media-fixtures.js";
import { patchPlanFixture } from "./support/canonical-plan-media.js";
type Evidence = { state: "ENCODED_UNVERIFIED"; plan: ChromaSafeReencodePlan; argv: string[]; outputPath: string; output: local.SourceIdentity; elapsedMilliseconds: number };
const api = local as unknown as { withCanonicalLosslessTemporary<T>(r: local.CanonicalIngestRequest, admission: unknown, visitor: (handle: unknown) => Promise<T>): Promise<T>;
  canonicalLosslessTemporaryOf(handle: unknown): Evidence; compileCanonicalLosslessLocalMedia(r: local.CanonicalIngestRequest, admission: unknown): Promise<{ plan: ChromaSafeReencodePlan; argv: string[] }> };
let base = ""; const seeds: Record<string, string> = {}, receipt: unknown[] = [];
before(async () => { base = await cdBase("cd-encode-"); for (const c of ["h264", "hevc"] as const) seeds[c] = await cdSeed(base, c); });
after(async () => { await writeFile(join(base, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx" }); });
function available() { assert.equal(typeof api.withCanonicalLosslessTemporary, "function", "bounded trusted production encoder is required"); }
async function prove(source: string, expectedOps: string[] = []) {
  available(); const before = await sha256File(source), a = await cdAdmit(source, base); assert.ok(a.admission);
  assert.deepEqual(a.planning.plan!.samplePlan.operations.map(o => o.op), expectedOps);
  let captured: unknown, outputPath = "";
  const result = await api.withCanonicalLosslessTemporary({ ...a.request, limits: { maxOutputBytes: 268435456 } }, a.admission, async handle => {
    captured = handle; const evidence = api.canonicalLosslessTemporaryOf(handle); outputPath = evidence.outputPath;
    assert.equal(evidence.state, "ENCODED_UNVERIFIED"); assert.notEqual(evidence.outputPath, source);
    const independent = await verifyGenerated(source, registerGenerated(evidence.outputPath), evidence.plan.samplePlan.transform, a.facts, base);
    assert.equal(independent.pixels.sampleMismatchCount, 0); assert.deepEqual(independent.pixels.perPlaneMismatch, { Y: 0, U: 0, V: 0 });
    return { evidence, independent };
  });
  assert.deepEqual(await sha256File(source), before);
  assert.throws(() => api.canonicalLosslessTemporaryOf(captured), /active_lossless_temporary_required/);
  await assert.rejects(() => stat(outputPath), (e: unknown) => (e as { code?: string }).code === "ENOENT");
  receipt.push({ source: before, ...result });
}
for (const codec of ["h264", "hevc"] as const) for (const t of D4_ELEMENTS)
test("CD-ENCODE-" + codec + "-" + t + ": production compiler output agrees with independent oracle", async () => {
  await prove(await cdTransform(base, seeds[codec]!, codec + "-" + t, t));
});
test("CD-ENCODE-hevc-identity: every Y/U/V sample retained", async () => { await prove(seeds.hevc!); });
const compositions = [
  { id: "select", select: true }, { id: "rebase", rebase: true }, { id: "snap", snap: true },
  { id: "retime", audio: true, retime: true }, { id: "select-rebase", select: true, rebase: true },
  { id: "hevc-snap", hevc: true, snap: true }, { id: "hevc-all-five", hevc: true, select: true, rebase: true, snap: true, retime: true, audio: true, declare: true },
  { id: "hevc-aac-identity", hevc: true, audio: true, identity: true }, { id: "pcm-copy", pcm: true, audio: true, select: true },
  { id: "hevc-bframes-snap", hevc: true, bFrames: true, snap: true }
] satisfies { id: string; select?: boolean; rebase?: boolean; snap?: boolean; hevc?: boolean; audio?: boolean; retime?: boolean; declare?: boolean; identity?: boolean; pcm?: boolean; bFrames?: boolean }[];
for (const config of compositions) test("CD-ENCODE-composition-" + config.id + ": accepted repair and copied audio args", async () => {
  available();
  const c: { id: string; select?: boolean; rebase?: boolean; snap?: boolean; hevc?: boolean; audio?: boolean; retime?: boolean; declare?: boolean; identity?: boolean; pcm?: boolean; bFrames?: boolean } = config;
  const seed = registerGenerated(await generatePlanFixture(base, c.id + "-seed.mp4", { hevc: c.hevc ?? false,
    audio: c.pcm ? "pcm" : c.audio ? "aac" : "none", sar: c.declare ? "unspecified" : "square", bFrames: c.bFrames ?? false, sei: "encoder" }));
  const variant = registerGenerated(await generatePlanVariant(seed, join(base, c.id + "-timing.mp4"), { ...c, container: c.pcm ? "mov" : "mp4" }));
  const center = await declareGeneratedAvCenter(variant, join(base, c.id + "-center.mp4"), c.hevc ? "hevc" : "h264", 90000, c.pcm ? "mov" : "mp4", Boolean(c.select));
  const source = c.identity ? center : registerGenerated(await patchPlanFixture(center, join(base, c.id + "-input.mp4"), { matrix: MATRIX_FOR_D4.rotate_90_cw }));
  const ops = [[c.select, "SELECT_AV_STREAMS"], [c.rebase, "REBASE_TIMELINE_ZERO"], [c.declare, "DECLARE_SQUARE_SAMPLE_ASPECT"],
    [c.snap, "SNAP_VIDEO_TIMESTAMPS"], [c.retime, "RETIME_AUDIO_CONTIGUOUS"]].filter(([used]) => used).map(([, op]) => String(op));
  const a = await cdAdmit(source, base); assert.ok(a.admission);
  const compiled = await api.compileCanonicalLosslessLocalMedia({ ...a.request, limits: { maxOutputBytes: 268435456 } }, a.admission);
  if (c.audio) { assert.ok(compiled.argv.includes("-c:a")); assert.equal(compiled.argv[compiled.argv.indexOf("-c:a") + 1], "copy"); }
  const filters = compiled.argv[compiled.argv.indexOf("-vf") + 1]!;
  if (c.rebase) assert.match(filters, /setpts=PTS-/);
  if (c.snap) { assert.match(filters, /settb=expr=1\//); assert.match(filters, /setpts=N\*/); }
  if (c.retime || (c.audio && c.rebase)) assert.ok(compiled.argv.includes("-bsf:a"));
  assert.equal(compiled.argv[compiled.argv.indexOf("-f") + 1], c.pcm ? "mov" : "mp4");
  await prove(source, ops);
});
test("CD-ENCODE-byte-budget: incomplete budget-limited output never trusts and is cleaned", async () => {
  available(); const a = await cdAdmit(seeds.hevc!, base), before = await sha256File(seeds.hevc!); let visited = false;
  await assert.rejects(() => api.withCanonicalLosslessTemporary({ ...a.request, limits: { maxOutputBytes: 64 } }, a.admission, async () => { visited = true; }));
  assert.equal(visited, false); assert.deepEqual(await sha256File(seeds.hevc!), before);
});
test("CD-ENCODE-mutation-before-spawn: fresh reconfirmation after test hook refuses", async () => {
  available(); const source = join(base, "mutation-copy.mp4"); await writeFile(source, await readFile(seeds.hevc!), { flag: "wx" });
  const a = await cdAdmit(source, base); let visited = false;
  await assert.rejects(() => api.withCanonicalLosslessTemporary({ ...a.request, instrumentation: { beforeProcess: async ({ role }) => {
    if (role === "canonicalize") { const b = await readFile(source); b[b.length - 1] = b[b.length - 1]! ^ 1; await writeFile(source, b); }
  } } }, a.admission, async () => { visited = true; }), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "source_changed");
  assert.equal(visited, false);
});
test("CD-ENCODE-no-publication: temporary execution creates no canonical store", async () => {
  available(); assert.deepEqual(await readdir(join(base, ".local-runs")), [], "all successful and failed temporaries are removed");
  await assert.rejects(() => stat(join(base, ".local-media")), (e: unknown) => (e as { code?: string }).code === "ENOENT");
});
