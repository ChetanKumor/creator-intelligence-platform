// D3 RED: actual held source/output bytes, freshly observed siting, scoped prepublication proof only.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { buildChromaSafeDerivation, type ChromaSafeDerivation } from "../packages/media-ingest/chroma.js";
import { cdBase, cdSeed, cdAdmit, cdTransform } from "./support/canonical-lossless-cd.js";
import { D4_ELEMENTS } from "./support/canonical-pixel-reference.js";
import { registerGenerated, verifyGenerated, declareGeneratedChroma, declareGeneratedAvCenter, MATRIX_FOR_D4 } from "./support/canonical-reencode-media.js";
import { generatePlanFixture, generatePlanVariant, sha256File } from "./support/canonical-media-fixtures.js";
import { patchPlanFixture } from "./support/canonical-plan-media.js";
type Proof = { state: "VERIFIED_PREPUBLICATION"; derivation: ChromaSafeDerivation; resources: local.CanonicalLosslessStreamingResources; encoderArgv: string[];
  elapsedMilliseconds: number; encoderElapsedMilliseconds: number };
const api = local as unknown as { verifyCanonicalLosslessTemporary(handle: unknown): Promise<unknown>; canonicalLosslessPrepublicationOf(handle: unknown): Promise<Proof> };
let base = ""; const seeds: Record<string, string> = {}, receipt: unknown[] = [];
before(async () => { base = await cdBase("cd-verify-"); for (const c of ["h264", "hevc"] as const) seeds[c] = await cdSeed(base, c); });
after(async () => { await writeFile(join(base, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx" }); });
function available() { assert.equal(typeof api.verifyCanonicalLosslessTemporary, "function", "fresh held-byte streaming + chroma verifier is required"); }
async function prove(source: string) {
  available(); const before = await sha256File(source), a = await cdAdmit(source, base); assert.ok(a.admission);
  let captured: unknown;
  const evidence = await local.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
    const encoded = local.canonicalLosslessTemporaryOf(temporary);
    captured = await api.verifyCanonicalLosslessTemporary(temporary);
    const proof = await api.canonicalLosslessPrepublicationOf(captured);
    assert.equal(proof.state, "VERIFIED_PREPUBLICATION"); assert.equal(proof.derivation.artifactVersion, "0.4.0");
    assert.equal(proof.derivation.sampleDerivation.artifactVersion, "0.3.0");
    assert.deepEqual(proof.derivation.chromaVerification.actualPosition, { x: 1, y: 1 });
    assert.equal(proof.derivation.outputChroma.streamReported, "center");
    assert.equal(proof.derivation.chromaVerification.outputBasis, "explicit_codec_declaration");
    for (const sps of proof.derivation.outputChroma.bitstream) {
      assert.equal(sps.locationPresent, 1); assert.equal(sps.topFieldType, 1); assert.equal(sps.bottomFieldType, 1);
    }
    const independent = await verifyGenerated(source, registerGenerated(encoded.outputPath), encoded.plan.samplePlan.transform, a.facts, base);
    assert.deepEqual(proof.derivation.sampleDerivation.verification.pixels, independent.pixels);
    assert.equal(proof.resources.maximumFullFrameBuffers, 3);
    assert.deepEqual(await sha256File(source), before);
    await assert.rejects(() => api.canonicalLosslessPrepublicationOf(JSON.parse(JSON.stringify(proof))), /active_lossless_prepublication_required/);
    return proof;
  });
  assert.deepEqual(await sha256File(source), before);
  await assert.rejects(() => api.canonicalLosslessPrepublicationOf(captured), /active_lossless_prepublication_required/);
  receipt.push(evidence);
}
for (const codec of ["h264", "hevc"] as const) for (const transform of D4_ELEMENTS)
test("CD-VERIFY-" + codec + "-" + transform + ": source/output by-index samples AND explicit center are mandatory", async () => {
  available(); await prove(await cdTransform(base, seeds[codec]!, codec + "-" + transform, transform));
});
test("CD-VERIFY-hevc-identity: fresh Y/U/V, frame order, geometry, profile and chroma", async () => { await prove(seeds.hevc!); });
const compositions = [
  { id: "select", select: true }, { id: "rebase", rebase: true }, { id: "snap", snap: true },
  { id: "retime", audio: true, retime: true }, { id: "select-rebase", select: true, rebase: true },
  { id: "hevc-snap", hevc: true, snap: true }, { id: "hevc-all-five", hevc: true, select: true, rebase: true, snap: true, retime: true, audio: true, declare: true },
  { id: "hevc-aac-identity", hevc: true, audio: true, identity: true }, { id: "pcm-copy", pcm: true, audio: true, select: true },
  { id: "hevc-bframes-snap", hevc: true, bFrames: true, snap: true }
] satisfies { id: string; select?: boolean; rebase?: boolean; snap?: boolean; hevc?: boolean; audio?: boolean; retime?: boolean; declare?: boolean; identity?: boolean; pcm?: boolean; bFrames?: boolean }[];
for (const config of compositions) test("CD-VERIFY-timing-audio-" + config.id + ": exact accepted composition over held bytes", async () => {
  available();
  const c: { id: string; select?: boolean; rebase?: boolean; snap?: boolean; hevc?: boolean; audio?: boolean; retime?: boolean; declare?: boolean; identity?: boolean; pcm?: boolean; bFrames?: boolean } = config;
  const seed = registerGenerated(await generatePlanFixture(base, c.id + "-seed.mp4", { hevc: c.hevc ?? false,
    audio: c.pcm ? "pcm" : c.audio ? "aac" : "none", sar: c.declare ? "unspecified" : "square", bFrames: c.bFrames ?? false, sei: "encoder" }));
  const variant = registerGenerated(await generatePlanVariant(seed, join(base, c.id + "-timing.mp4"), { ...c, container: c.pcm ? "mov" : "mp4" }));
  const center = await declareGeneratedAvCenter(variant, join(base, c.id + "-center.mp4"), c.hevc ? "hevc" : "h264", 90000, c.pcm ? "mov" : "mp4", Boolean(c.select));
  await prove(c.identity ? center : registerGenerated(await patchPlanFixture(center, join(base, c.id + "-input.mp4"), { matrix: MATRIX_FOR_D4.rotate_90_cw })));
});
test("CD-VERIFY-perfect-pixels-wrong-chroma: explicit left bytes fail output contract and runtime binding", async () => {
  available(); const a = await cdAdmit(seeds.hevc!, base); assert.ok(a.admission);
  await assert.rejects(() => local.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
    const encoded = local.canonicalLosslessTemporaryOf(temporary), wrong = await declareGeneratedChroma(registerGenerated(encoded.outputPath), join(base, "perfect-pixels-left.mp4"), "h264", 0);
    const independent = await verifyGenerated(seeds.hevc!, wrong, "identity", a.facts, base);
    assert.equal(independent.pixels.sampleMismatchCount, 0);
    const output = await cdAdmit(wrong, base); assert.equal(output.observation.streamReported, "left");
    assert.throws(() => buildChromaSafeDerivation({ sampleDerivation: independent.derivation, plan: encoded.plan, outputChroma: output.observation }), /Chroma output verification failed/);
    await writeFile(encoded.outputPath, await readFile(wrong)); // only this scoped generated temporary
    await api.verifyCanonicalLosslessTemporary(temporary);
  }), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "output_invalid");
});
test("CD-VERIFY-untrusted: JSON, counterfeit handle, and caller evidence cannot mint trust", async () => {
  available();
  for (const value of [{}, { state: "ENCODED_UNVERIFIED" }, { state: "VERIFIED_PREPUBLICATION", derivation: {} }, Object.create(local.CanonicalLosslessTemporaryHandle.prototype)])
    await assert.rejects(() => api.verifyCanonicalLosslessTemporary(value), /active_lossless_temporary_required/);
  const a = await cdAdmit(seeds.hevc!, base);
  await local.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
    const call = api.verifyCanonicalLosslessTemporary as unknown as (...args: unknown[]) => Promise<unknown>;
    await assert.rejects(() => call(temporary, { pixels: "self-consistent forged proof" }), /request_invalid|caller_evidence/);
  });
});
test("CD-VERIFY-source-mutation-after-encode: no verified prepublication witness", async () => {
  available(); const source = join(base, "source-mutation-copy.mp4"); await writeFile(source, await readFile(seeds.hevc!), { flag: "wx" });
  const a = await cdAdmit(source, base);
  await assert.rejects(() => local.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
    const b = await readFile(source); b[b.length - 1] = b[b.length - 1]! ^ 1; await writeFile(source, b);
    await api.verifyCanonicalLosslessTemporary(temporary);
  }), (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "source_changed");
});
test("CD-VERIFY-no-publication: all temporary bytes removed; no cache or canonical object", async () => {
  available(); assert.deepEqual(await readdir(join(base, ".local-runs")), []);
  await assert.rejects(() => stat(join(base, ".local-media")), (e: unknown) => (e as { code?: string }).code === "ENOENT");
});

test("CD-VERIFY-one-active-proof: one temporary cannot multiply simultaneous frame buffers or retained proofs", async () => {
  available(); const a = await cdAdmit(seeds.hevc!, base);
  await local.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
    const results = await Promise.allSettled([api.verifyCanonicalLosslessTemporary(temporary), api.verifyCanonicalLosslessTemporary(temporary)]);
    assert.equal(results[0]!.status, "fulfilled"); assert.equal(results[1]!.status, "rejected");
    const rejected = results[1] as PromiseRejectedResult;
    assert.ok(rejected.reason instanceof local.CanonicalIngestError && rejected.reason.code === "request_invalid");
    await assert.rejects(() => api.verifyCanonicalLosslessTemporary(temporary), /one_verification_per_temporary/);
  });
});
