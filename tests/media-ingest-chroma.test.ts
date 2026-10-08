// Checkpoint B only. Structural fixtures are synthetic; JSON alone is never trusted byte evidence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import * as chroma from "../packages/media-ingest/chroma.js";
import * as local from "../scripts/media-ingest-local.js";
import { planCanonicalReencode, buildCanonicalReencodeDerivation, CANONICAL_LOSSLESS_ENCODE_PROFILE, CANONICAL_REENCODE_TOOLCHAIN } from "../packages/media-ingest/reencode.js";
import { identify } from "../packages/editorial/common.js";
import { facts, videoStream, MATRICES, D4_ELEMENTS, piecewise30to24to15, sha, clone, type Json } from "./support/canonical-facts.js";
import { root } from "./support/canonical-media.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { verifyExactPixels, transformYuv420p, type RawYuvFrame } from "./support/canonical-pixel-reference.js";
const api = chroma as unknown as {
  CHROMA_OBSERVATION_METHOD: Json; CHROMA_ALPHA_POLICY: Json;
  chromaPositionOf(name: string): { x: number; y: number };
  transformChromaPosition(p: { x: number; y: number }, operation: string): { x: number; y: number };
  makeCanonicalChromaObservation(input: unknown): Json;
  planChromaSafeReencode(input: unknown): { outcome: string; reason: string; plan: Json | null; decision: Json | null };
  ChromaSafeReencodePlanSchema: { safeParse(v: unknown): { success: boolean } };
  ChromaSafeDerivationSchema: { safeParse(v: unknown): { success: boolean } };
  chromaSafeComputationIdOf(input: unknown): string;
  buildChromaSafeDerivation(input: unknown): Json;
};
const source = { assetId: `asset_${root().contentHash}`, contentHash: root().contentHash, sizeBytes: root().sizeBytes };
const names = ["left", "center", "topleft", "top", "bottomleft", "bottom"];
const positions = [{ x:0,y:1 },{ x:1,y:1 },{ x:0,y:0 },{ x:1,y:0 },{ x:0,y:2 },{ x:1,y:2 }];
function fixture(codec="hevc", transform="identity", geometry={width:4,height:2}) {
  return facts([videoStream({codec,geometry:{declared:geometry,decoded:[geometry]},presentationTimestamps:[0,512,1024],
    displayMatrix:transform === "identity" ? {state:"absent"} : {state:"present",coefficients:[...MATRICES[transform as keyof typeof MATRICES]]}})]);
}
function observation(f:Json, location="center", byteIdentity=source):Json {
  const v=(f.streams as Json[])[0]!;
  return api.makeCanonicalChromaObservation({ source:{assetId:byteIdentity.assetId,contentHash:byteIdentity.contentHash,sizeBytes:byteIdentity.sizeBytes}, factsDigest:sha(canonicalSerialize(f)),
    codec:v.codec,streamIndex:0,method:api.CHROMA_OBSERVATION_METHOD,
    container:{trackId:1,sampleEntry:v.codec === "hevc" ? "hev1" : "avc1",entries:[{type:v.codec === "hevc" ? "hvcC" : "avcC",payloadBytes:32,payloadHash:sha("synthetic config")}]},
    bitstream:[{spsIndex:0,chromaFormatIdc:1,frameMbsOnlyFlag:v.codec === "h264" ? 1 : null,vuiPresent:1,locationPresent:1,
      topFieldType:names.indexOf(location),bottomFieldType:names.indexOf(location)}],
    streamReported:location,frames:[0,512,1024].map((pts,index)=>({index,pts,reported:location})) });
}
function plan(f:Json, location="center") { return api.planChromaSafeReencode({source,sourceFacts:f,sourceChroma:observation(f,location)}); }
// Literal half-luma coordinate results, independently enumerated from the full luma-grid transform.
const mapping:Record<string,(x:number,y:number)=>number[]>={identity:(x,y)=>[x,y],rotate_90_ccw:(x,y)=>[y,2-x],rotate_180:(x,y)=>[2-x,2-y],
  rotate_90_cw:(x,y)=>[2-y,x],mirror_horizontal:(x,y)=>[2-x,y],mirror_vertical:(x,y)=>[x,2-y],transpose:(x,y)=>[y,x],transverse:(x,y)=>[2-y,2-x]};
for (const operation of ["identity",...D4_ELEMENTS]) test(`CH-MATH-${operation}: each of six asymmetric siting coordinates`,()=>{
  names.forEach((name,i)=>{assert.deepEqual(api.chromaPositionOf(name),positions[i]);const p=positions[i]!,[x,y]=mapping[operation]!(p.x,p.y);
    assert.deepEqual(api.transformChromaPosition(p,operation),{x,y});});
});
test("CH-MATH-position: center is invariant; left horizontal and vertical results differ",()=>{
  assert.deepEqual(api.transformChromaPosition({x:0,y:1},"mirror_horizontal"),{x:2,y:1});
  assert.deepEqual(api.transformChromaPosition({x:0,y:1},"mirror_vertical"),{x:0,y:1});
  assert.throws(()=>api.transformChromaPosition({x:0,y:1},"arbitrary"));
});
test("CH-MATH-full-grid: siting follows independently permuted chroma samples on the complete luma grid",()=>{
  const width=14,height=10,luma=width*height,chromaSamples=luma/4;
  const frame:RawYuvFrame={pixelFormat:"yuv420p",width,height,bytes:new Uint8Array(luma+2*chromaSamples)};
  for(let i=0;i<chromaSamples;i++)frame.bytes[luma+i]=i+1;
  for(const operation of ["identity",...D4_ELEMENTS] as const) {
    const output=transformYuv420p(frame,operation),outPlane=output.bytes.subarray(output.width*output.height,output.width*output.height+chromaSamples);
    for(const position of positions)for(let i=0;i<chromaSamples;i++) {
      const srcX=4*(i%(width/2))+position.x,srcY=4*Math.floor(i/(width/2))+position.y;
      // Full-resolution coordinates in half-luma units; this oracle does not use the reduced siting mapping.
      const maxX=2*(width-1),maxY=2*(height-1);
      let actualX=srcX,actualY=srcY;
      switch(operation) {
        case "rotate_90_ccw":actualX=srcY;actualY=maxX-srcX;break;
        case "rotate_180":actualX=maxX-srcX;actualY=maxY-srcY;break;
        case "rotate_90_cw":actualX=maxY-srcY;actualY=srcX;break;
        case "mirror_horizontal":actualX=maxX-srcX;break;
        case "mirror_vertical":actualY=maxY-srcY;break;
        case "transpose":actualX=srcY;actualY=srcX;break;
        case "transverse":actualX=maxY-srcY;actualY=maxX-srcX;break;
      }
      const outputIndex=outPlane.indexOf(i+1);assert.ok(outputIndex>=0);
      assert.deepEqual(api.transformChromaPosition(position,operation),{
        x:actualX-4*(outputIndex%(output.width/2)),y:actualY-4*Math.floor(outputIndex/(output.width/2))});
    }
  }
});
for (const codec of ["h264","hevc"]) for(const operation of D4_ELEMENTS) {
  test(`CH-CENTER-${codec}-${operation}: mandatory admitted 1.1 plan`,()=>{
    const p=plan(fixture(codec,operation));assert.equal(p.outcome,"PLAN");assert.ok(p.plan);
    assert.equal(p.plan.planVersion,"1.1.0");assert.ok(api.ChromaSafeReencodePlanSchema.safeParse(p.plan).success);
    assert.deepEqual((p.plan.admission as Json).requiredPosition,{x:1,y:1});
    assert.deepEqual((p.plan.samplePlan as Json).encodeProfile,CANONICAL_LOSSLESS_ENCODE_PROFILE);
  });
  test(`CH-LEFT-${codec}-${operation}: no unsupported signaling or unproven default`,()=>{
    const p=plan(fixture(codec,operation),"left");assert.equal(p.outcome,"DEFER");assert.equal(p.plan,null);
    assert.match(p.reason,/fixed_output_default_unproven|fixed_encoder_siting_mismatch|required_position_unrepresentable/);
  });
}
test("CH-IDENTITY: explicit center HEVC eligible, left HEVC needs unestablished H.264 output default",()=>{
  assert.equal(plan(fixture(),"center").outcome,"PLAN");
  const left=plan(fixture(),"left");assert.equal(left.outcome,"DEFER");assert.equal(left.reason,"fixed_output_default_unproven");
});
test("CH-ROUTES: old DIRECT and exact-remux classification remain controlling",()=>{
  assert.equal(plan(fixture("h264"),"center").outcome,"EXISTING_PATH");
  const f=fixture("h264");(f.streams as Json[])[0]!.sampleAspectRatio={container:{state:"unspecified"},bitstream:{state:"unspecified"}};
  assert.equal(plan(f).outcome,"EXISTING_PATH");
});
const attacks:Record<string,{outcome:string;mutate:(o:Json)=>void}>={
  missingStream:{outcome:"DEFER",mutate:o=>{o.streamReported=null;}}, missingFrame:{outcome:"DEFER",mutate:o=>{(o.frames as Json[])[1]!.reported=null;}},
  defaultNotEstablished:{outcome:"DEFER",mutate:o=>{Object.assign((o.bitstream as Json[])[0]!,{locationPresent:0,topFieldType:null,bottomFieldType:null});o.streamReported="left";(o.frames as Json[]).forEach(f=>{f.reported="left";});}},
  noVui:{outcome:"DEFER",mutate:o=>{Object.assign((o.bitstream as Json[])[0]!,{vuiPresent:0,locationPresent:null,topFieldType:null,bottomFieldType:null});}},
  conflictingStream:{outcome:"REFUSE",mutate:o=>{o.streamReported="left";}}, varyingFrame:{outcome:"REFUSE",mutate:o=>{(o.frames as Json[])[1]!.reported="left";}},
  conflictingFields:{outcome:"REFUSE",mutate:o=>{(o.bitstream as Json[])[0]!.bottomFieldType=0;}},
  changingSps:{outcome:"REFUSE",mutate:o=>{(o.bitstream as Json[]).push({...((o.bitstream as Json[])[0]!),spsIndex:1,topFieldType:0,bottomFieldType:0});}},
  unknownContainer:{outcome:"REFUSE",mutate:o=>{((o.container as Json).entries as Json[]).push({type:"cloc",payloadBytes:4,payloadHash:sha("unknown container siting")});}},
  incompleteFrames:{outcome:"REFUSE",mutate:o=>{(o.frames as Json[]).pop();}}, wrongPts:{outcome:"REFUSE",mutate:o=>{(o.frames as Json[])[1]!.pts=1000;}},
  unknownMethod:{outcome:"REFUSE",mutate:o=>{o.method={...(o.method as Json),version:"untrusted"};}},
  wrongBytes:{outcome:"REFUSE",mutate:o=>{o.source={...source,contentHash:sha("forged"),assetId:`asset_${sha("forged")}`};}},
  wrongFacts:{outcome:"REFUSE",mutate:o=>{o.factsDigest=sha("stale facts");}},
};
for(const [name,a] of Object.entries(attacks)) test(`CH-HOSTILE-${name}: complete chroma finding is never omitted`,()=>{
  const f=fixture("hevc","rotate_90_cw"),o=observation(f);a.mutate(o);delete o.observationId;
  const raw=identify("canonical_chroma_observation_v1","observationId",o);
  const p=api.planChromaSafeReencode({source,sourceFacts:f,sourceChroma:raw});assert.equal(p.outcome,a.outcome);assert.equal(p.plan,null);
});
test("CH-GATE-legacy: old plan and self-rehashed omission cannot authorize the new contract",()=>{
  assert.equal(typeof api.ChromaSafeReencodePlanSchema,"object");
  const f=fixture("hevc","rotate_90_cw"),old=planCanonicalReencode(f).plan;assert.ok(old);
  assert.equal(api.ChromaSafeReencodePlanSchema.safeParse(old).success,false);
  const p=plan(f).plan!;
  for(const key of ["sourceChroma","admission","sourceFacts","requiredVerification"]){const body=clone(p);delete body[key];delete body.planId;
    assert.equal(api.ChromaSafeReencodePlanSchema.safeParse(identify("canonical_reencode_plan_v2","planId",body)).success,false,key);}
  const body=clone(p);delete body.planId;(body.samplePlan as Json).encodeProfile={...(body.samplePlan as Json).encodeProfile as Json,qp:10};
  assert.equal(api.ChromaSafeReencodePlanSchema.safeParse(identify("canonical_reencode_plan_v2","planId",body)).success,false);
});
test("CH-GATE-trusted: JSON, legacy plan and counterfeit handle cannot mint observed-byte admission",()=>{
  const get=(local as unknown as {canonicalChromaPlanOf:(v:unknown)=>unknown}).canonicalChromaPlanOf;
  assert.equal(typeof get,"function");
  for(const value of [{},planCanonicalReencode(fixture()).plan,plan(fixture()).plan,Object.create(null)])
    assert.throws(()=>get(value),/trusted_chroma_admission_required/);
});
function sampleDerivation() {
  const f=fixture("hevc","rotate_90_cw"),of=fixture("h264","identity",{width:2,height:4});
  const frames:RawYuvFrame[]=Array.from({length:3},(_,i)=>({pixelFormat:"yuv420p",width:4,height:2,bytes:Uint8Array.from({length:12},(_,j)=>i*31+j*7)}));
  return {f,of,sample:buildCanonicalReencodeDerivation({rootAuthorization:root(),sourceFacts:f,plan:planCanonicalReencode(f).plan,
    output:{contentHash:sha("new exact source"),sizeBytes:12345,facts:of},pixels:verifyExactPixels(frames,frames.map(v=>transformYuv420p(v,"rotate_90_cw")),"rotate_90_cw"),audioPackets:null})};
}
test("CH-DERIVATION: 0.4 binds full truthful source/output declarations and exact samples",()=>{
  const {f,of,sample}=sampleDerivation(),p=plan(f).plan!,output=observation(of,"center",sample.output);
  const d=api.buildChromaSafeDerivation({sampleDerivation:sample,plan:p,outputChroma:output});
  assert.equal(d.artifactVersion,"0.4.0");assert.ok(api.ChromaSafeDerivationSchema.safeParse(d).success);
  assert.match(d.derivationId as string,/^canonical_media_derivation_v3_/);assert.match(d.computationId as string,/^canonical_media_computation_v3_/);
  assert.equal(d.computationId,api.chromaSafeComputationIdOf({plan:p}));
  for(const label of ["left","topleft","top","bottomleft","bottom"])
    assert.throws(()=>api.buildChromaSafeDerivation({sampleDerivation:sample,plan:p,outputChroma:observation(of,label,sample.output)}));
});
test("CH-DERIVATION-hostile: sample error, false retag, removed evidence and byte mismatch refuse",()=>{
  const {f,of,sample}=sampleDerivation(),p=plan(f).plan!,output=observation(of,"center",sample.output);
  const d=api.buildChromaSafeDerivation({sampleDerivation:sample,plan:p,outputChroma:output});
  for(const mutate of [(x:Json)=>{delete x.outputChroma;},(x:Json)=>{((x.sampleDerivation as Json).verification as Json).pixels={...(((x.sampleDerivation as Json).verification as Json).pixels as Json),sampleMismatchCount:1};},
    (x:Json)=>{((x.outputChroma as Json).source as Json).contentHash=sha("forged output");}]){
    const b=clone(d);mutate(b);delete b.derivationId;assert.equal(api.ChromaSafeDerivationSchema.safeParse(identify("canonical_media_derivation_v3","derivationId",b)).success,false);
  }
});
test("CH-FROZEN: old accepted pure modules are byte-identical",()=>{
  for(const [path,digest] of Object.entries({"canonical.ts":"f7b2cae9410625c426bd579ae43d93228eb0adbd053459221ba14320d8cc0332",
    "profile.ts":"7dfb89591d2a75e5cb2f3c068da59ea301145c777720e9fd1322153564febc94","plan.ts":"29a5c4b8e0eacb0ddbdd6bc27909078e26d5482bf96b3de23a11780ef9a35f39"}))
    assert.equal(sha(readFileSync(`packages/media-ingest/${path}`,"utf8")),digest);
});

test("CH-CONTAINER-fiel: actual progressive HEVC carrier is retained and agrees; other fields refuse",()=>{
  const f=fixture(),o=observation(f),entries=(o.container as Json).entries as Json[];
  entries.push({type:"fiel",payloadBytes:2,payloadHash:sha("synthetic progressive field carrier"),field:{count:1,order:0}});
  delete o.observationId;
  const good=identify("canonical_chroma_observation_v1","observationId",o);
  assert.equal(api.planChromaSafeReencode({source,sourceFacts:f,sourceChroma:good}).outcome,"PLAN");
  for(const field of [{count:2,order:0},{count:1,order:1}]){const bad=clone(o);(((bad.container as Json).entries as Json[]).at(-1)!).field=field;
    const p=api.planChromaSafeReencode({source,sourceFacts:f,sourceChroma:identify("canonical_chroma_observation_v1","observationId",bad)});assert.equal(p.outcome,"REFUSE");assert.equal(p.plan,null);}
});

test("CH-CONTAINER-color: retain raw declarations; malformed or contradictory container tags refuse",()=>{
  const f=fixture(),base=observation(f),entries=(base.container as Json).entries as Json[];
  entries.push({type:"colr",payloadBytes:11,payloadHash:sha("synthetic limited BT.709 declaration"),
    color:{subtype:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false}});
  const replay=(o:Json)=>{delete o.observationId;return api.planChromaSafeReencode({source,sourceFacts:f,sourceChroma:identify("canonical_chroma_observation_v1","observationId",o)});};
  assert.equal(replay(clone(base)).outcome,"PLAN");
  for(const mutate of [(e:Json)=>{e.payloadBytes=10;},(e:Json)=>{(e.color as Json).fullRange=true;},
    (e:Json)=>{(e.color as Json).primaries=9;},(e:Json)=>{(e.color as Json).transfer=16;},(e:Json)=>{(e.color as Json).matrix=6;}]) {
    const bad=clone(base);mutate(((bad.container as Json).entries as Json[]).at(-1)!);
    const result=replay(bad);assert.equal(result.outcome,"REFUSE");assert.equal(result.plan,null);
  }
});

test("CH-ALPHA-other-siting: all observed non-center positions defer with no executable plan",()=>{
  for(const name of ["topleft","top","bottomleft","bottom"])for(const operation of ["identity",...D4_ELEMENTS]) {
    const result=plan(fixture("hevc",operation),name);assert.equal(result.outcome,"DEFER");assert.equal(result.plan,null);
  }
});

test("CH-GATE-old-findings: eligible siting never hides an unsupported sample/profile condition",()=>{
  const mutations=[(v:Json)=>{v.bitDepth=10;v.pixelFormat="yuv420p10le";},(v:Json)=>{(v.color as Json).range="pc";},
    (v:Json)=>{(v.color as Json).range=null;},(v:Json)=>{(v.color as Json).transfer="smpte2084";},
    (v:Json)=>{(v.color as Json).transfer="arib-std-b67";},(v:Json)=>{v.pixelFormat="yuv422p";},(v:Json)=>{v.pixelFormat="yuv444p";},
    (v:Json)=>{v.sideData=[{carrier:"frame",kind:"unknown",seiUuid:null}];},
    (v:Json)=>{v.frameCropping={state:"present",top:0,bottom:0,left:1,right:0};},
    (v:Json)=>{v.sampleAspectRatio={container:{state:"declared",numerator:2,denominator:1},bitstream:{state:"declared",numerator:2,denominator:1}};},
    (v:Json)=>{v.timeBase={numerator:1,denominator:90000};v.presentationTimestamps=piecewise30to24to15();}];
  for(const mutate of mutations){const f=fixture("hevc","rotate_90_cw");mutate((f.streams as Json[])[0]!);
    const old=planCanonicalReencode(f),result=plan(f);assert.ok(["DEFER","REFUSE"].includes(old.outcome));
    assert.equal(result.outcome,old.outcome);assert.equal(result.reason,old.reason);assert.equal(result.plan,null);}
});

test("CH-IDENTITY-binding: every observation/requirement is mandatory and computation excludes caller scope",()=>{
  const f=fixture(),p=plan(f).plan!,id=api.chromaSafeComputationIdOf({plan:p});
  assert.equal(api.chromaSafeComputationIdOf({plan:clone(p)}),id);
  for(const key of ["creatorId","projectId","clock","path"])
    assert.throws(()=>api.chromaSafeComputationIdOf({plan:p,[key]:"untrusted"}));
  const changed=clone(p);delete changed.planId;(changed.sourceChroma as Json).streamReported="left";
  assert.equal(api.ChromaSafeReencodePlanSchema.safeParse(identify("canonical_reencode_plan_v2","planId",changed)).success,false);
  for(const key of ["frames","bitstream","container","method"]){const o=observation(f);delete o[key];delete o.observationId;
    const result=api.planChromaSafeReencode({source,sourceFacts:f,sourceChroma:identify("canonical_chroma_observation_v1","observationId",o)});
    assert.equal(result.outcome,"REFUSE");assert.equal(result.plan,null);}
});

test("CH-FROZEN-runtime: the additive descriptor owns copies and does not freeze legacy toolchain objects",()=>{
  assert.equal(Object.isFrozen(CANONICAL_REENCODE_TOOLCHAIN.ffmpeg),false);
  assert.equal(Object.isFrozen(CANONICAL_REENCODE_TOOLCHAIN.ffprobe),false);
});
