// D4 generated-only bounded stress. RSS telemetry is separate from exact live-buffer accounting.
import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { cdBase, cdSeed, cdAdmit, cdTransform } from "./support/canonical-lossless-cd.js";
import { verifyGenerated, registerGenerated } from "./support/canonical-reencode-media.js";
import { sha256File } from "./support/canonical-media-fixtures.js";
for (const c of [
  { codec: "h264", width: 1920, height: 1080, count: 16, transform: "rotate_90_cw" },
  { codec: "hevc", width: 3840, height: 2160, count: 4, transform: "identity" }
] as const) test("CD-STRESS-" + c.width + "x" + c.height + ": moving asymmetric samples, more frames than three slots", async () => {
  const base = await cdBase("cd-stress-"), seed = await cdSeed(base, c.codec, c.width, c.height, c.count);
  const source = c.transform === "identity" ? seed : await cdTransform(base, seed, "stress-source", c.transform);
  const before = await sha256File(source), a = await cdAdmit(source, base); assert.ok(a.admission);
  const result = await local.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
    const baseline = process.memoryUsage(), peak = { ...baseline }, keys = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"] as const;
    let samples = 0;
    const sample = () => { const m = process.memoryUsage(); samples++; for (const key of keys) peak[key] = Math.max(peak[key], m[key]); };
    const timer = setInterval(sample, 10); let proof: local.CanonicalLosslessPrepublicationProof;
    try { proof = await local.canonicalLosslessPrepublicationOf(await local.verifyCanonicalLosslessTemporary(temporary)); }
    finally { clearInterval(timer); sample(); }
    assert.equal(proof.resources.maximumFullFrameBuffers, 3);
    assert.equal(proof.resources.decodedFrameBufferBytes, c.width * c.height * 3 / 2 * 3);
    assert.equal(proof.resources.digestBufferBytes, c.count * 96);
    assert.ok(c.count > proof.resources.maximumFullFrameBuffers);
    assert.ok(proof.resources.sourceQueuePeakBytes <= 131072); assert.ok(proof.resources.outputQueuePeakBytes <= 131072);
    assert.equal(proof.derivation.sampleDerivation.verification.pixels.frameCount, c.count);
    const independent = await verifyGenerated(source, registerGenerated(local.canonicalLosslessTemporaryOf(temporary).outputPath), c.transform, a.facts, base);
    assert.deepEqual(proof.derivation.sampleDerivation.verification.pixels, independent.pixels);
    const maxRss = process.resourceUsage().maxRSS;
    return { generatedMedia: true, ...c, source: before, output: proof.derivation.sampleDerivation.output.contentHash,
      encoderMilliseconds: proof.encoderElapsedMilliseconds, verificationMilliseconds: proof.elapsedMilliseconds, resources: proof.resources,
      sampledTestProcessMemoryDuringVerification: { baseline, sampledPeak: peak, intervalMilliseconds: 10, samples },
      wholeTestProcessPeakRssKiB: maxRss > 0 ? maxRss : null,
      telemetryLimit: "RSS includes this Node test process and prior fixture allocations; child RSS is unmeasured. Sampling can miss brief peaks. Live decoded/digest buffers have independent exact bounds.",
      pixels: proof.derivation.sampleDerivation.verification.pixels, chromaVerification: proof.derivation.chromaVerification };
  });
  assert.deepEqual(await sha256File(source), before); assert.deepEqual(await readdir(join(base, ".local-runs")), []);
  await writeFile(join(base, "receipt.json"), JSON.stringify(result, null, 2), { flag: "wx" });
});
test("CD-STRESS-repeat: fixed production encoder is byte- and sample-exact across three runs", async () => {
  const base = await cdBase("cd-repeat-"), source = await cdSeed(base, "hevc"), a = await cdAdmit(source, base), results: unknown[] = [];
  for (let run = 0; run < 3; run++) results.push(await local.withCanonicalLosslessTemporary(a.request, a.admission, async temporary => {
    const p = await local.canonicalLosslessPrepublicationOf(await local.verifyCanonicalLosslessTemporary(temporary));
    return { hash: p.derivation.sampleDerivation.output.contentHash, pixels: p.derivation.sampleDerivation.verification.pixels, chroma: p.derivation.outputChroma, argv: p.encoderArgv };
  }));
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  assert.deepEqual(await readdir(join(base, ".local-runs")), []);
  await writeFile(join(base, "receipt.json"), JSON.stringify(results, null, 2), { flag: "wx" });
});
