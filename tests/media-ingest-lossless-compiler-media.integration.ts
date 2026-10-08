import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { join } from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import * as local from "../scripts/media-ingest-local.js";
import { type ChromaSafeReencodePlan } from "../packages/media-ingest/chroma.js";
import { CANONICAL_LOSSLESS_ENCODE_PROFILE } from "../packages/media-ingest/reencode.js";
import { D4_ELEMENTS } from "./support/canonical-pixel-reference.js";
import { cdBase, cdSeed, cdAdmit, cdTransform, cdRequest } from "./support/canonical-lossless-cd.js";
import { declareGeneratedChroma, FILTER_FOR_D4 } from "./support/canonical-reencode-media.js";
import { sha256File } from "./support/canonical-media-fixtures.js";
const api = local as unknown as { compileCanonicalLosslessLocalMedia(input: local.CanonicalIngestRequest, admission: unknown):
  Promise<{ plan: ChromaSafeReencodePlan; argv: string[] }> };
let base = ""; const seeds: Record<string, string> = {}, receipt: unknown[] = [];
before(async () => { base = await cdBase("cd-compiler-"); for (const codec of ["h264", "hevc"] as const) seeds[codec] = await cdSeed(base, codec); });
after(async () => { await writeFile(join(base, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx" }); });
function available() { assert.equal(typeof api.compileCanonicalLosslessLocalMedia, "function", "production closed compiler is required"); }
function expected(plan: ChromaSafeReencodePlan, bound: number): string[] {
  const p = plan.samplePlan;
  const filters = [...(p.transform === "identity" ? [] : FILTER_FOR_D4[p.transform]), "setsar=1",
    "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709"];
  return ["-hide_banner", "-nostdin", "-nostats", "-loglevel", "verbose", "-benchmark", "-copyts", "-filter_threads", "1",
    "-threads", "1", "-noautorotate", "-display_rotation:v:0", "0", "-protocol_whitelist", "fd", "-fd", "3", "-i", "fd:",
    "-map", "0:" + p.streams.videoIndex, "-vf", filters.join(","), "-noautoscale", "-c:v", "libx264", "-qp", "0",
    "-preset", "medium", "-profile:v", "high444", "-pix_fmt", "+yuv420p", "-threads:v", "2", "-bf", "0", "-g", "30",
    "-sc_threshold", "0", "-x264-params", "lookahead-threads=1:sliced-threads=0", "-a53cc", "0", "-udu_sei", "0",
    "-color_range", "tv", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-fps_mode", "passthrough",
    "-enc_time_base:v", "1:" + p.videoTiming.outputTimeBase.denominator, "-video_track_timescale", String(p.videoTiming.outputTimeBase.denominator),
    "-map_metadata", "-1", "-map_chapters", "-1", "-avoid_negative_ts", "disabled", "-fflags", "+bitexact", "-fs", String(bound),
    "-f", "mp4", "-protocol_whitelist", "fd", "-fd", "4", "fd:"];
}
for (const codec of ["h264", "hevc"] as const) for (const transform of D4_ELEMENTS)
test("CD-COMPILER-" + codec + "-" + transform + ": exact fixed argv through fresh trusted admission", async () => {
  available();
  const source = await cdTransform(base, seeds[codec]!, codec + "-" + transform, transform), before = await sha256File(source);
  const admitted = await cdAdmit(source, base); assert.ok(admitted.admission);
  const bound = 16 * 1024 * 1024, result = await api.compileCanonicalLosslessLocalMedia({ ...admitted.request, limits: { maxOutputBytes: bound } }, admitted.admission);
  assert.equal(result.plan.planVersion, "1.1.0"); assert.deepEqual(result.plan.samplePlan.encodeProfile, CANONICAL_LOSSLESS_ENCODE_PROFILE);
  assert.deepEqual(result.argv, expected(result.plan, bound));
  assert.deepEqual(await sha256File(source), before); receipt.push({ codec, transform, source: before, ...result });
});
test("CD-COMPILER-hevc-identity: no D4 filter", async () => {
  available(); const a = await cdAdmit(seeds.hevc!, base); assert.ok(a.admission);
  const r = await api.compileCanonicalLosslessLocalMedia({ ...a.request, limits: { maxOutputBytes: 16777216 } }, a.admission);
  assert.equal(r.plan.samplePlan.transform, "identity"); assert.deepEqual(r.argv, expected(r.plan, 16777216));
});
test("CD-COMPILER-authority: serialized v1/v1.1 and counterfeit handles cannot compile", async () => {
  available(); const a = await cdAdmit(seeds.hevc!, base); assert.ok(a.admission);
  for (const fake of [a.planning.plan, a.planning.plan!.samplePlan, JSON.parse(JSON.stringify(a.planning.plan)), {},
    Object.create(Object.getPrototypeOf(a.admission))]) await assert.rejects(() => api.compileCanonicalLosslessLocalMedia(a.request, fake),
      (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "request_invalid");
});
for (const key of ["argv", "encodeProfile", "crf", "quality", "filters", "facts", "transform", "outputPath", "shell"])
test("CD-COMPILER-injection-" + key + ": closed request refuses arbitrary compiler inputs", async () => {
  available(); const a = await cdAdmit(seeds.hevc!, base);
  await assert.rejects(() => api.compileCanonicalLosslessLocalMedia({ ...a.request, [key]: key === "shell" ? true : ["scale=2:2", "-crf", "10"] } as local.CanonicalIngestRequest, a.admission),
    (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "request_invalid");
});
for (const location of [0, 2, 3, 4, 5] as const) test("CD-COMPILER-siting-" + location + ": no eligible handle, no encode", async () => {
  available(); const source = await declareGeneratedChroma(seeds.hevc!, join(base, "siting-" + location + ".mp4"), "hevc", location);
  const a = await cdAdmit(source, base); assert.equal(a.admission, null);
  await assert.rejects(() => api.compileCanonicalLosslessLocalMedia(a.request, a.admission), /trusted_chroma_admission_required/);
});
test("CD-COMPILER-source-change: admission cannot detach from current authorized bytes", async () => {
  available(); const source = join(base, "changed-generated-copy.mp4"); await writeFile(source, await readFile(seeds.hevc!), { flag: "wx" });
  const a = await cdAdmit(source, base), bytes = await readFile(source);
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await writeFile(source, bytes);
  await assert.rejects(() => api.compileCanonicalLosslessLocalMedia(a.request, a.admission),
    (e: unknown) => e instanceof local.CanonicalIngestError && e.code === "source_mismatch");
});
test("CD-COMPILER-no-store: compilation creates no canonical media/store/computation", async () => {
  available(); await assert.rejects(() => stat(join(base, ".local-media")), (e: unknown) => (e as { code?: string }).code === "ENOENT");
  // E–F deliberately enables ordinary ingest; read-only compilation above still creates no store.
  const req = await cdRequest(seeds.hevc!, await cdBase("ef-cd-compat-"));
  const routed = await local.canonicalizeLocalMedia(req); assert.equal(routed.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED");
  assert.equal("authorization" in routed, false);
});
