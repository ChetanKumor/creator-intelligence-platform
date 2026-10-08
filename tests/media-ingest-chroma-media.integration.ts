// Generated-media Checkpoint B proof only. No production encoder/publication/cache/lifecycle or owner footage.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, mkdtemp, realpath, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { ChromaSafeReencodePlanSchema, buildChromaSafeDerivation, type CanonicalChromaObservation, type ChromaPlanningResult, type ChromaSafeReencodePlan } from "../packages/media-ingest/chroma.js";
import { type CanonicalMediaFacts, planCanonicalReencode } from "../packages/media-ingest/index.js";
import { calibrationFrames, encodeGeneratedSource, declareGeneratedChroma, registerGenerated, researchEncode, verifyGenerated, MATRIX_FOR_D4 } from "./support/canonical-reencode-media.js";
import { patchPlanFixture, appendChromaFixtureBox } from "./support/canonical-plan-media.js";
import { sha256File } from "./support/canonical-media-fixtures.js";
import { PINNED_TOOL_ROOT } from "./support/edit-render-media.js";
import { D4_ELEMENTS, verifyExactPixels } from "./support/canonical-pixel-reference.js";
const api=local as unknown as {inspectCanonicalChromaLocalMedia(input:unknown):Promise<{facts:CanonicalMediaFacts;observation:CanonicalChromaObservation;planning:ChromaPlanningResult;admission:unknown}>;
  canonicalChromaPlanOf(handle:unknown):ChromaSafeReencodePlan};
let base="";const seeds:Record<string,string>={},receipt:unknown[]=[];
before(async()=>{await mkdir(".local-runs/phase5-gate7",{recursive:true});base=await realpath(await mkdtemp(".local-runs/phase5-gate7/chroma-safe-"));
  for(const codec of ["h264","hevc"] as const){const seed=await encodeGeneratedSource(base,`${codec}-default`,codec,calibrationFrames(64,48,3));seeds[`${codec}-default`]=seed;
    for(const [location,type] of [["left",0],["center",1]] as const)seeds[`${codec}-${location}`]=await declareGeneratedChroma(seed,join(base,`${codec}-${location}.mp4`),codec,type);}});
after(async()=>{await writeFile(join(base,"receipt.json"),JSON.stringify(receipt,null,2),{flag:"wx"});});
async function request(source:string) {return {sourcePath:source,workspaceRoot:base,toolRoot:PINNED_TOOL_ROOT,clock:{now:()=>"2026-10-08T00:00:00.000Z"},
  rootAuthorization:{manifestType:"AuthorizedFootage",schemaVersion:"1.1.0",...await sha256File(source),sourceType:"owner_supplied",authorizationBasis:"owner_created",
    allowedPurposes:["local_footage_analysis"],dateAdded:"2026-10-01T00:00:00.000Z",creatorId:"creator_chroma_generated",projectId:"project_chroma_generated",canonicalizationConsent:"local_media_canonicalization"}};}
async function observe(source:string) {assert.equal(typeof api.inspectCanonicalChromaLocalMedia,"function");return api.inspectCanonicalChromaLocalMedia(await request(source));}
for(const codec of ["h264","hevc"] as const) for(const location of ["left","center"] as const) for(const transform of ["identity",...D4_ELEMENTS] as const)
test(`CH-MEDIA-${codec}-${location}-${transform}: held carriers, independent pixels and fail-closed admission`,async()=>{
  const source=transform==="identity"?seeds[`${codec}-${location}`]!:registerGenerated(await patchPlanFixture(seeds[`${codec}-${location}`]!,join(base,`${codec}-${location}-${transform}-in.mp4`),{matrix:MATRIX_FOR_D4[transform]}));
  const before=await sha256File(source),measured=await observe(source),o=measured.observation;
  assert.equal(o.streamReported,location);assert.ok(o.frames.every(f=>f.reported===location));assert.ok(o.bitstream.every(s=>s.locationPresent===1&&s.topFieldType===(location==="center"?1:0)&&s.bottomFieldType===s.topFieldType));
  assert.ok(o.container.entries.some(e=>e.type===(codec==="h264"?"avcC":"hvcC")));
  const existing=codec==="h264"&&transform==="identity",eligible=location==="center"&&!existing;
  assert.equal(measured.planning.outcome,existing?"EXISTING_PATH":eligible?"PLAN":"DEFER");
  if(eligible){const p=api.canonicalChromaPlanOf(measured.admission);assert.ok(ChromaSafeReencodePlanSchema.safeParse(p).success);
    const copy=api.canonicalChromaPlanOf(measured.admission);Reflect.deleteProperty(copy,"admission");assert.ok(api.canonicalChromaPlanOf(measured.admission).admission);}
  else{assert.equal(measured.admission,null);assert.throws(()=>api.canonicalChromaPlanOf(measured.planning.plan),/trusted_chroma_admission_required/);}
  if(existing){assert.equal((await local.canonicalizeLocalMedia(await request(source))).outcome,"DIRECT");assert.deepEqual(await sha256File(source),before);
    receipt.push({codec,location,transform,measured:measured.planning,source:before});return;}
  const output=join(base,`${codec}-${location}-${transform}-out.mp4`),encode=await researchEncode(source,output,transform,measured.facts),samples=await verifyGenerated(source,output,transform,measured.facts,base),out=await observe(output);
  assert.equal(samples.pixels.sampleMismatchCount,0);assert.equal(samples.pixels.maximumAbsoluteSampleError,0);
  assert.equal(out.observation.streamReported,location);assert.ok(out.observation.frames.every(f=>f.reported===location));
  assert.ok(out.observation.bitstream.every(s=>s.locationPresent===(location==="center"?1:0)));
  if(eligible){const d=buildChromaSafeDerivation({sampleDerivation:samples.derivation,plan:api.canonicalChromaPlanOf(measured.admission),outputChroma:out.observation});
    assert.equal(d.artifactVersion,"0.4.0");receipt.push({codec,location,transform,source:before,output:await sha256File(output),sourceChroma:o,outputChroma:out.observation,pixels:samples.pixels,derivationId:d.derivationId,planId:d.plan.planId,encode});}
  else{assert.equal(ChromaSafeReencodePlanSchema.safeParse(planCanonicalReencode(measured.facts).plan).success,false);
    assert.equal((await local.canonicalizeLocalMedia(await request(source))).outcome,"DEFER");receipt.push({codec,location,transform,source:before,output:await sha256File(output),sourceChroma:o,outputChroma:out.observation,pixels:samples.pixels,planning:measured.planning,encode});}
  assert.deepEqual(await sha256File(source),before);
});
for(const codec of ["h264","hevc"])test(`CH-MEDIA-${codec}-default: raw omitted signaling is not an explicit left declaration`,async()=>{
  const source=registerGenerated(await patchPlanFixture(seeds[`${codec}-default`]!,join(base,`${codec}-default-rotated.mp4`),{matrix:MATRIX_FOR_D4.rotate_90_cw}));
  const o=await observe(source);assert.equal(o.observation.streamReported,"left");assert.ok(o.observation.bitstream.every(s=>s.locationPresent===0));
  assert.equal(o.planning.outcome,"DEFER");assert.equal(o.planning.reason,"source_default_unproven");assert.equal(o.admission,null);receipt.push({codec,case:"omitted default",observation:o.observation,planning:o.planning});
});
for(const codec of ["h264","hevc"] as const)for(const [location,type] of [["topleft",2],["top",3],["bottomleft",4],["bottom",5]] as const)
test(`CH-MEDIA-${codec}-${location}: raw type, stream and frame agreement retained but alpha execution deferred`,async()=>{
  const declared=await declareGeneratedChroma(seeds[`${codec}-default`]!,join(base,`${codec}-${location}-declared.mp4`),codec,type);
  const source=registerGenerated(await patchPlanFixture(declared,join(base,`${codec}-${location}-rotated.mp4`),{matrix:MATRIX_FOR_D4.rotate_90_cw}));
  const before=await sha256File(source),o=await observe(source);
  assert.equal(o.observation.streamReported,location);assert.ok(o.observation.frames.every(f=>f.reported===location));
  assert.ok(o.observation.bitstream.every(s=>s.locationPresent===1&&s.topFieldType===type&&s.bottomFieldType===type));
  assert.equal(o.planning.outcome,"DEFER");assert.equal(o.admission,null);assert.deepEqual(await sha256File(source),before);
  receipt.push({codec,case:`explicit ${location}`,observation:o.observation,planning:o.planning,source:before});
});
test("CH-MEDIA-wrong-siting: exact samples with false metadata retag fail new 0.4 verification",async()=>{
  const source=registerGenerated(await patchPlanFixture(seeds["hevc-center"]!,join(base,"wrong-siting-in.mp4"),{matrix:MATRIX_FOR_D4.rotate_90_cw}));
  const input=await observe(source),output=join(base,"wrong-siting-correct.mp4");await researchEncode(source,output,"rotate_90_cw",input.facts);
  assert.equal(input.planning.outcome,"PLAN");const plan=api.canonicalChromaPlanOf(input.admission);
  const positiveSamples=await verifyGenerated(source,output,"rotate_90_cw",input.facts,base),positiveChroma=await observe(output);
  assert.equal(buildChromaSafeDerivation({sampleDerivation:positiveSamples.derivation,plan,outputChroma:positiveChroma.observation}).artifactVersion,"0.4.0");
  const bad=await declareGeneratedChroma(output,join(base,"wrong-siting-retag.mp4"),"h264",0),samples=await verifyGenerated(source,bad,"rotate_90_cw",input.facts,base),measured=await observe(bad);
  assert.equal(samples.pixels.sampleMismatchCount,0);assert.equal(measured.observation.streamReported,"left");
  assert.throws(()=>buildChromaSafeDerivation({sampleDerivation:samples.derivation,plan,outputChroma:measured.observation}));
  receipt.push({case:"sample-exact false retag rejected",pixels:samples.pixels,outputChroma:measured.observation});
});
for(const type of ["cloc","colr"] as const)test(`CH-MEDIA-container-${type}: unknown or malformed independent carrier cannot admit`,async()=>{
  assert.equal(typeof api.inspectCanonicalChromaLocalMedia,"function");
  const source=registerGenerated(await appendChromaFixtureBox(seeds["hevc-center"]!,join(base,`${type}-hostile.mp4`),type));
  const before=await sha256File(source);const result=await observe(source).then(r=>({outcome:r.planning.outcome,reason:r.planning.reason,admission:r.admission}),e=>{
    assert.ok(e instanceof local.CanonicalIngestError);assert.equal(e.code,"probe_invalid");return {outcome:"REFUSE",reason:e.message,admission:null};});
  assert.equal(result.outcome,"REFUSE");assert.equal(result.admission,null);assert.deepEqual(await sha256File(source),before);receipt.push({case:`container ${type}`,result});
});
test("CH-MEDIA-trust: caller evidence/argv injection and counterfeit handle refuse before media authority",async()=>{
  const req=await request(seeds["hevc-center"]!);for(const field of ["sourceFacts","sourceChroma","plan","argv","chromaAdmission"])
    await assert.rejects(()=>api.inspectCanonicalChromaLocalMedia({...req,[field]:{}}),/Only source, authorization and bounded runtime inputs are accepted/);
  const valid=await observe(seeds["hevc-center"]!);for(const fake of [valid.planning.plan,{...valid.admission as object},Object.create(Object.getPrototypeOf(valid.admission))])
    assert.throws(()=>api.canonicalChromaPlanOf(fake),/trusted_chroma_admission_required/);
  assert.equal((await local.canonicalizeLocalMedia(req)).outcome,"DEFER");
  await assert.rejects(()=>local.canonicalizeLocalMedia({...req,plan:planCanonicalReencode(valid.facts).plan} as unknown as local.CanonicalIngestRequest),
    /Only source, authorization and bounded runtime inputs are accepted/);
  assert.throws(()=>new local.CanonicalChromaAdmissionHandle(Symbol("forged"),valid.planning.plan!),/trusted_chroma_admission_required/);
});

test("CH-MEDIA-authorization: exact root identity and original consent are mandatory before observation",async()=>{
  const req=await request(seeds["hevc-center"]!),badIdentity={...req,rootAuthorization:structuredClone(req.rootAuthorization)};badIdentity.rootAuthorization.contentHash="f".repeat(64);
  await assert.rejects(()=>api.inspectCanonicalChromaLocalMedia(badIdentity),(e:unknown)=>e instanceof local.CanonicalIngestError&&e.code==="source_mismatch");
  const noConsent=structuredClone(req.rootAuthorization);Reflect.deleteProperty(noConsent,"canonicalizationConsent");
  await assert.rejects(()=>api.inspectCanonicalChromaLocalMedia({...req,rootAuthorization:noConsent}),
    (e:unknown)=>e instanceof local.CanonicalIngestError&&e.code==="authorization_invalid");
  noConsent.schemaVersion="1.0.0";
  await assert.rejects(()=>api.inspectCanonicalChromaLocalMedia({...req,rootAuthorization:noConsent}),
    (e:unknown)=>e instanceof local.CanonicalIngestError&&e.code==="canonicalization_consent_required");
});

test("CH-MEDIA-no-store: chroma inspection cannot publish media or computation records",async()=>{
  await assert.rejects(()=>stat(join(base,".local-media")),(e:unknown)=>(e as {code?:string}).code==="ENOENT");
});
test("CH-MEDIA-pixel-error: wrong chroma sample does not pass sample-exact proof",()=>{
  const frames=calibrationFrames(64,48,3),copy=structuredClone(frames);copy[1]!.bytes[64*48]=copy[1]!.bytes[64*48]!^1;assert.throws(()=>verifyExactPixels(frames,copy,"identity"),/Exact pixels failed/);
});
test("CH-MEDIA-old-red: exact original receipt bytes preserved",async()=>{
  const path=".local-runs/phase5-gate7/batch3e-b2b2-20261008/chroma-preflight-1-receipt.json",r=JSON.parse(await readFile(path,"utf8")) as {safeCount:number;unsafeCount:number;transforms:{sampleMismatchCount:number;sitingPreserved:boolean}[]};
  assert.equal((await sha256File(path)).contentHash,"cb40527f2ac03bca7af09d1aa27ef8df86ff2672ff545751162b31eabe6788a8");
  assert.equal(r.transforms.length,20);assert.ok(r.transforms.every(v=>v.sampleMismatchCount===0));assert.equal(r.safeCount,14);assert.equal(r.unsafeCount,6);
});
