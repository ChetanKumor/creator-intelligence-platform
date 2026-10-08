// B2-B1 research execution ONLY, generated fixtures, fixed lossless candidate, independent Y/U/V oracle.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { planCanonicalReencode, planCanonicalizationV1, CanonicalReencodeDerivationSchema, type CanonicalMediaFacts } from "../packages/media-ingest/index.js";
import { calibrationFrames, encodeGeneratedSource, registerGenerated, observeGenerated, researchEncode, verifyGenerated, MATRIX_FOR_D4 } from "./support/canonical-reencode-media.js";
import { D4_ELEMENTS, type PixelTransform } from "./support/canonical-pixel-reference.js";
import { generatePlanFixture, generatePlanVariant, sha256File, independentProbe } from "./support/canonical-media-fixtures.js";
import { parseProbeJson, evaluateInputConformance, frameTableIdOf } from "../packages/edit-render/probe.js";
import { patchPlanFixture } from "./support/canonical-plan-media.js";

let base = ""; const seeds: Record<string,string> = {}, receipts: unknown[] = [];
before(async () => {
  await mkdir(".local-runs/phase5-gate7",{recursive:true});
  base = await realpath(await mkdtemp(".local-runs/phase5-gate7/b2b1-generated-"));
  for (const codec of ["h264","hevc"] as const) seeds[codec] = await encodeGeneratedSource(base,codec,codec,calibrationFrames());
});
after(async () => { await writeFile(join(base,"receipt.json"),JSON.stringify(receipts,null,2),{flag:"wx"}); });
async function prove(id: string, source: string, transform: PixelTransform, expectedOps: string[] = []) {
  const before = await sha256File(source), facts = await observeGenerated(source,base), planned = planCanonicalReencode(facts);
  assert.equal(planned.outcome,"PLAN",JSON.stringify(planned.evaluation)); assert.ok(planned.plan);
  assert.deepEqual(planned.plan.operations.map(o => o.op),expectedOps);
  const repeats = [];
  for (let i = 0; i < 2; i++) {
    const output = join(base,`${id}-out-${i}.mp4`), encode = await researchEncode(source,output,transform,facts);
    const verified = await verifyGenerated(source,output,transform,facts,base);
    assert.equal(planCanonicalizationV1(verified.outputFacts).outcome,"DIRECT");
    assert.equal(verified.pixels.sampleMismatchCount,0); assert.equal(verified.pixels.maximumAbsoluteSampleError,0);
    assert.deepEqual(verified.pixels.frameDigests.expected,verified.pixels.frameDigests.output);
    const ov=verified.outputFacts.streams.find(s => s.kind === "video")!, oa=verified.outputFacts.streams.find(s => s.kind === "audio");
    const conformance=evaluateInputConformance({video:{frameCount:ov.presentationTimestamps.length,
      tableId:frameTableIdOf(ov.presentationTimestamps.map(pts => pts/ov.timeBase.denominator)),width:ov.geometry.declared.width,height:ov.geometry.declared.height,
      grid:ov.declaredFrameRate},audio:oa ? {required:true,sampleRateHz:oa.sampleRateHz,channelLayout:oa.channelLayout as "mono" | "stereo",
        requiredSamples:oa.frames.reduce((n,f) => n+f.samples,0)} : {required:false}},parseProbeJson(await independentProbe(output)));
    assert.equal(conformance.outcome.state,"conforms","unchanged renderer accepts the actual lossless output");
    assert.doesNotMatch(encode.stderr,/auto_scale|auto-inserting filter/);
    assert.equal(encode.argv[encode.argv.indexOf("-qp")+1],"0");
    assert.equal(encode.argv[encode.argv.indexOf("-pix_fmt")+1],"+yuv420p");
    for(const [key,value] of Object.entries({"-c:v":"libx264","-preset":"medium","-profile:v":"high444","-threads:v":"2",
      "-filter_threads":"1","-bf":"0","-g":"30","-sc_threshold":"0","-x264-params":"lookahead-threads=1:sliced-threads=0"})) {
      assert.equal(encode.argv[encode.argv.indexOf(key)+1],value);
    }
    assert.ok(!encode.argv.includes("-af"));
    if (facts.streams.some(s => s.kind === "audio")) assert.equal(encode.argv[encode.argv.indexOf("-c:a")+1],"copy");
    repeats.push({identity:await sha256File(output),encode,verified});
  }
  assert.deepEqual(repeats[0]!.identity,repeats[1]!.identity);
  assert.deepEqual(repeats[0]!.verified.outputFacts,repeats[1]!.verified.outputFacts);
  assert.deepEqual(repeats[0]!.verified.derivation,repeats[1]!.verified.derivation);
  assert.deepEqual(await sha256File(source),before,"source bytes remain immutable");
  receipts.push({id,source:before,facts,plan:planned.plan,repeats});
  return { facts,outputFacts:repeats[0]!.verified.outputFacts };
}
for (const codec of ["h264","hevc"] as const) for (const element of D4_ELEMENTS) test(`B1-M-${codec}-${element}: independent planes, fresh facts, timing, two executions`,async () => {
  const source = registerGenerated(await patchPlanFixture(seeds[codec]!,join(base,`${codec}-${element}.mp4`),{matrix:MATRIX_FOR_D4[element]}));
  await prove(`${codec}-${element}`,source,element);
});
test("B1-M-HEVC-identity: every decoded source sample is preserved",async () => { await prove("hevc-identity",seeds.hevc!,"identity"); });
test("B1-M-color: unspecified description remains source truth, output explicitly signals limited BT.709",async () => {
  const source = await encodeGeneratedSource(base,"unspecified-description","hevc",calibrationFrames(),"unspecified_description");
  const {facts,outputFacts} = await prove("unspecified-description",source,"identity");
  const video = (f:CanonicalMediaFacts) => f.streams.find(s => s.kind === "video")!;
  assert.deepEqual(video(facts).color,{range:"tv",primaries:null,transfer:null,matrix:null});
  assert.deepEqual(video(outputFacts).color,{range:"tv",primaries:"bt709",transfer:"bt709",matrix:"bt709"});
});
const compositions = [
  {id:"select-d4",select:true}, {id:"rebase-d4",rebase:true}, {id:"snap-d4",snap:true},
  {id:"aac-copy-hevc",hevc:true,audio:true,identity:true}, {id:"retime-d4",audio:true,retime:true},
  {id:"select-rebase-d4",select:true,rebase:true}, {id:"hevc-d4-snap",hevc:true,snap:true},
  {id:"hevc-all-five",hevc:true,select:true,rebase:true,snap:true,retime:true,audio:true,declare:true},
  {id:"pcm-copy-d4",pcm:true,audio:true,select:true}, {id:"hevc-bframes-snap",hevc:true,bFrames:true,snap:true},
] satisfies {id:string;select?:boolean;rebase?:boolean;snap?:boolean;hevc?:boolean;audio?:boolean;identity?:boolean;retime?:boolean;declare?:boolean;pcm?:boolean;bFrames?:boolean}[];
for (const config of compositions) test(`B1-M-composition-${config.id}`,async () => {
  const c: {id:string;select?:boolean;rebase?:boolean;snap?:boolean;hevc?:boolean;audio?:boolean;identity?:boolean;retime?:boolean;declare?:boolean;pcm?:boolean;bFrames?:boolean} = config;
  const seed = await generatePlanFixture(base,`${c.id}-seed.mp4`,{hevc:c.hevc ?? false,audio:c.pcm ? "pcm" : c.audio ? "aac" : "none",
    sar:c.declare ? "unspecified" : "square",bFrames:c.bFrames ?? false,sei:"encoder"});
  const variant = await generatePlanVariant(seed,join(base,`${c.id}-timing.mp4`),{...c,container:c.pcm ? "mov" : "mp4"});
  const source = registerGenerated(c.identity ? variant : await patchPlanFixture(variant,join(base,`${c.id}-source.mp4`),{matrix:MATRIX_FOR_D4.rotate_90_cw}));
  const ops = [[c.select,"SELECT_AV_STREAMS"],[c.rebase,"REBASE_TIMELINE_ZERO"],[c.declare,"DECLARE_SQUARE_SAMPLE_ASPECT"],
    [c.snap,"SNAP_VIDEO_TIMESTAMPS"],[c.retime,"RETIME_AUDIO_CONTIGUOUS"]].filter(([used]) => used).map(([,op]) => String(op));
  await prove(c.id,source,c.identity ? "identity" : "rotate_90_cw",ops);
});
test("B1-M-source-safety: unregistered source and existing output are refused",async () => {
  const facts = await observeGenerated(seeds.hevc!,base);
  await assert.rejects(researchEncode(join(base,"not-generated.mp4"),join(base,"unused.mp4"),"identity",facts),/unregistered/);
  const before = await sha256File(seeds.hevc!);
  await assert.rejects(researchEncode(seeds.hevc!,seeds.hevc!,"identity",facts),/EEXIST/);
  assert.deepEqual(await sha256File(seeds.hevc!),before);
});
test("B1-M-cache-is-not-authority: valid cached evidence cannot approve different fresh samples or residual geometry",async () => {
  const source=seeds.hevc!, facts=await observeGenerated(source,base), good=join(base,"cache-good.mp4");
  await researchEncode(source,good,"identity",facts);
  const cached=(await verifyGenerated(source,good,"identity",facts,base)).derivation;
  assert.ok(CanonicalReencodeDerivationSchema.safeParse(cached).success);
  // Different original coded samples, yet the same shape, timing and accepted metadata. Metadata/old quality receipts cannot suffice.
  const other=seeds.h264!;
  await assert.rejects(verifyGenerated(source,other,"identity",facts,base),/Exact pixels failed/);
  const residual=registerGenerated(await patchPlanFixture(good,join(base,"residual.mp4"),{matrix:MATRIX_FOR_D4.rotate_90_cw}));
  await assert.rejects(verifyGenerated(source,residual,"identity",facts,base));
});
