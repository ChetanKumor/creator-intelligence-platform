/** Checkpoint B only: additive chroma observations, admission, Plan 1.1.0 and Derivation 0.4.0.
 * Pure records describe requirements, never attest to bytes or issue media-execution authority. The trusted read-only adapter
 * measures held exact bytes and mints the opaque admission handle. No encoder, cache, publication or lifecycle is wired here.
 * Old Facts/Profile/Plan/Derivation parsers and their identities are imported unchanged.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { equal, identify, checkIdentity } from "../editorial/common.js";
import { sha256 } from "../edit-render/common.js";
import { contentId } from "../reference-analyzer/features.js";
import { CanonicalMediaFactsSchema, canonicalMediaFactsDigestOf, type CanonicalMediaFacts, type VideoStreamFacts } from "./profile.js";
import { CANONICAL_LOSSLESS_ENCODE_PROFILE, CANONICAL_REENCODE_TOOLCHAIN, EXACT_PIXEL_METHOD, PIXEL_TRANSFORMS,
  CanonicalReencodePlanSchema, CanonicalReencodeDerivationSchema, planCanonicalReencode, type CanonicalReencodePlan, type CanonicalReencodeDerivation } from "./reencode.js";

const hash = (v: unknown) => sha256(canonicalSerialize(v));
const same=(a:unknown,b:unknown):boolean=>{try{return equal(a,b);}catch{return false;}};
const frozen = <T>(v:T):T => { if(v !== null && typeof v === "object") { for(const c of Object.values(v)) frozen(c);Object.freeze(v); } return v; };
export const CHROMA_LOCATIONS = ["left","center","topleft","top","bottomleft","bottom"] as const;
export type ChromaLocation = (typeof CHROMA_LOCATIONS)[number];
const PositionSchema = z.strictObject({ x:z.number().int().min(0).max(2), y:z.number().int().min(0).max(2) });
export type ChromaPosition = z.infer<typeof PositionSchema>;
/** Half-luma units, relative to the 2x2 luma region: chroma index (u,v) is at (4u+x,4v+y). */
export const CHROMA_POSITIONS = frozen({left:{x:0,y:1},center:{x:1,y:1},topleft:{x:0,y:0},top:{x:1,y:0},bottomleft:{x:0,y:2},bottom:{x:1,y:2}} as const);
export const CHROMA_D4_POSITION_MAPPING = frozen({identity:["x","y"],rotate_90_ccw:["y","2-x"],rotate_180:["2-x","2-y"],rotate_90_cw:["2-y","x"],
  mirror_horizontal:["2-x","y"],mirror_vertical:["x","2-y"],transpose:["y","x"],transverse:["2-y","2-x"]} as const);
export function chromaPositionOf(name:unknown):ChromaPosition { return {...CHROMA_POSITIONS[z.enum(CHROMA_LOCATIONS).parse(name)]}; }
export function transformChromaPosition(input:unknown, operation:unknown):ChromaPosition {
  const {x,y}=PositionSchema.parse(input), op=z.enum(PIXEL_TRANSFORMS).parse(operation);
  // Apply the full luma-grid D4 and subtract 4 * the independently permuted chroma-plane index. No sample relocation.
  switch(op) {
    case "identity": return {x,y}; case "rotate_90_ccw": return {x:y,y:2-x}; case "rotate_180": return {x:2-x,y:2-y};
    case "rotate_90_cw": return {x:2-y,y:x}; case "mirror_horizontal": return {x:2-x,y}; case "mirror_vertical": return {x,y:2-y};
    case "transpose": return {x:y,y:x}; case "transverse": return {x:2-y,y:2-x};
  }
}
export function chromaLocationOf(position:ChromaPosition):ChromaLocation|null { return CHROMA_LOCATIONS.find(n=>equal(CHROMA_POSITIONS[n],position)) ?? null; }
export const CHROMA_OBSERVATION_METHOD = frozen({version:"canonical_chroma_exact_bytes_v1",
  ffprobe:{...CANONICAL_REENCODE_TOOLCHAIN.ffprobe,decoderThreads:1}, bitstream:{...CANONICAL_REENCODE_TOOLCHAIN.ffmpeg,instrument:"trace_headers_every_sps_chroma_v1"},
  container:"held_iso_bmff_video_sample_entry_inventory_v1",frames:"every_decoded_presentation_index_and_pts",
  normativeDefaults:"none_established_in_this_alpha_never_infer_from_decoder_label"} as const);
const MethodSchema=z.custom<typeof CHROMA_OBSERVATION_METHOD>(v=>same(v,CHROMA_OBSERVATION_METHOD),"Exact pinned observation method required");
const Positive=z.number().int().positive().safe(), Int=z.number().int().safe();
const IdentitySchema=z.strictObject({assetId:IdSchema,contentHash:HashSchema,sizeBytes:Positive}).refine(v=>v.assetId===`asset_${v.contentHash}`,"Exact content-addressed identity required");
const ReportedSchema=z.enum([...CHROMA_LOCATIONS,"unknown","unspecified"]).nullable();
const ColorBoxSchema=z.strictObject({subtype:z.enum(["nclx","nclc","other"]),primaries:z.number().int().min(0).max(65535).nullable(),
  transfer:z.number().int().min(0).max(65535).nullable(),matrix:z.number().int().min(0).max(65535).nullable(),fullRange:z.boolean().nullable()});
const EntrySchema=z.strictObject({type:z.string().regex(/^[\x20-\x7e]{4}$/),payloadBytes:Positive.max(64*1024*1024),payloadHash:HashSchema,color:ColorBoxSchema.optional(),
  field:z.strictObject({count:z.number().int().min(0).max(255),order:z.number().int().min(0).max(255)}).optional()});
const SpsSchema=z.strictObject({spsIndex:z.number().int().min(0).max(4095),chromaFormatIdc:z.number().int().min(0).max(3),
  frameMbsOnlyFlag:z.union([z.literal(0),z.literal(1)]).nullable(),vuiPresent:z.union([z.literal(0),z.literal(1)]),
  locationPresent:z.union([z.literal(0),z.literal(1)]).nullable(),topFieldType:z.number().int().min(0).max(5).nullable(),bottomFieldType:z.number().int().min(0).max(5).nullable()
}).superRefine((s,c)=>{
  const invalid=s.vuiPresent===0 ? s.locationPresent!==null || s.topFieldType!==null || s.bottomFieldType!==null
    : s.locationPresent===null || (s.locationPresent===0 ? s.topFieldType!==null || s.bottomFieldType!==null : s.topFieldType===null || s.bottomFieldType===null);
  if(invalid)c.addIssue({code:"custom",message:"Presence flags and complete raw declarations must agree"});
});
export type ChromaSpsDeclaration=z.infer<typeof SpsSchema>;
const ObservationBody=z.strictObject({artifactType:z.literal("CanonicalChromaObservation"),artifactVersion:z.literal("1.0.0"),
  source:IdentitySchema,factsDigest:HashSchema,method:MethodSchema,codec:z.enum(["h264","hevc"]),streamIndex:z.number().int().min(0).max(15),
  container:z.strictObject({trackId:Positive,sampleEntry:z.enum(["avc1","avc3","hvc1","hev1"]),entries:z.array(EntrySchema).min(1).max(32)}),
  bitstream:z.array(SpsSchema).min(1).max(4096),streamReported:ReportedSchema,
  frames:z.array(z.strictObject({index:z.number().int().min(0).max(71999),pts:Int,reported:ReportedSchema})).min(1).max(72000)
});
export const CanonicalChromaObservationSchema=ObservationBody.extend({observationId:IdSchema}).superRefine((o,c)=>{
  if(!checkIdentity(o,"observationId","canonical_chroma_observation_v1"))c.addIssue({code:"custom",message:"Every carrier is identity-bound"});
  if(!o.frames.every((f,i)=>f.index===i) || !o.bitstream.every((s,i)=>s.spsIndex===i))c.addIssue({code:"custom",message:"Complete ordered carriers required"});
});
export type CanonicalChromaObservation=z.infer<typeof CanonicalChromaObservationSchema>;
/** Structural builder only. Only the trusted adapter can establish whether these observations came from held exact bytes. */
export function makeCanonicalChromaObservation(input:unknown):CanonicalChromaObservation {
  const raw=z.strictObject({source:ObservationBody.shape.source,factsDigest:HashSchema,method:MethodSchema,codec:ObservationBody.shape.codec,
    streamIndex:ObservationBody.shape.streamIndex,container:ObservationBody.shape.container,bitstream:ObservationBody.shape.bitstream,
    streamReported:ReportedSchema,frames:ObservationBody.shape.frames}).parse(input);
  return CanonicalChromaObservationSchema.parse(identify("canonical_chroma_observation_v1","observationId",{artifactType:"CanonicalChromaObservation",artifactVersion:"1.0.0",...raw}));
}
export const CHROMA_ALPHA_POLICY=frozen({version:"canonical_chroma_admission_alpha_v1",positions:CHROMA_POSITIONS,d4:CHROMA_D4_POSITION_MAPPING,
  observation:CHROMA_OBSERVATION_METHOD,encodeProfileId:CANONICAL_LOSSLESS_ENCODE_PROFILE.encodeProfileId,
  eligible:"explicit_center_source_and_explicit_center_output_with_every_carrier_agreeing",
  leftOutput:"fixed_libx264_type_zero_omits_location_flag_default_not_normatively_established_in_alpha",
  otherSiting:"defer_unverified_source_or_fixed_output_signaling",containerEntries:["avcC","hvcC","pasp","colr","btrt","fiel_progressive_1_0_only"],
  containerColor:"retain_exact_nclx_or_nclc_declarations_agreeing_with_fresh_facts_no_unknown_reserved_bits",
  unknownContainer:"refuse_unrecognized_interpretation_carrier",missing:"defer_no_default_assumption",conflicting:"refuse",
  output:"fresh_exact_byte_carriers_and_full_exact_sample_proof_required",encoderSignalingChange:false,pixelConversion:false,oldPlan:"research_only_not_chroma_execution_admission"} as const);
const POLICY={version:CHROMA_ALPHA_POLICY.version,digest:hash(CHROMA_ALPHA_POLICY)} as const;
const PolicySchema=z.custom<typeof POLICY>(v=>same(v,POLICY),"Frozen alpha policy required");
export const CHROMA_REASON_CODES=["eligible_explicit_center","observation_invalid","source_binding_mismatch","facts_binding_mismatch","container_carrier_unsupported",
  "container_carrier_malformed","codec_carrier_mismatch","frame_carrier_incomplete","bitstream_carrier_conflict","frame_carrier_conflict","stream_carrier_conflict",
  "source_default_unproven","reported_carrier_missing","source_siting_unverified_alpha","required_position_unrepresentable","fixed_encoder_siting_mismatch",
  "fixed_output_default_unproven"] as const;
const DecisionBody=z.strictObject({artifactType:z.literal("CanonicalChromaAdmission"),artifactVersion:z.literal("1.0.0"),policy:PolicySchema,
  observationId:IdSchema,transform:z.enum(PIXEL_TRANSFORMS),outcome:z.enum(["ELIGIBLE","DEFER","REFUSE"]),reason:z.enum(CHROMA_REASON_CODES),
  declarationBasis:z.enum(["explicit_codec_declaration","codec_default_not_established","missing_or_conflicting"]),
  sourcePosition:PositionSchema.nullable(),requiredPosition:PositionSchema.nullable(),expectedOutputLocation:z.enum(CHROMA_LOCATIONS).nullable(),
  expectedOutputDeclaration:z.enum(["explicit_type_1_center","unestablished_type_0_default","unsupported"]).nullable()});
const DecisionSchema=DecisionBody.extend({decisionId:IdSchema}).refine(d=>checkIdentity(d,"decisionId","canonical_chroma_admission_v1"),"Complete chroma decision identity required");
export type CanonicalChromaAdmission=z.infer<typeof DecisionSchema>;
const videoOf=(facts:CanonicalMediaFacts):VideoStreamFacts|null=>facts.streams.find((s):s is VideoStreamFacts=>s.kind==="video") ?? null;
function interpret(facts:CanonicalMediaFacts,o:CanonicalChromaObservation):{outcome:"ELIGIBLE"|"DEFER"|"REFUSE";reason:(typeof CHROMA_REASON_CODES)[number];location:ChromaLocation|null;basis:CanonicalChromaAdmission["declarationBasis"]} {
  const result=(outcome:"DEFER"|"REFUSE",reason:(typeof CHROMA_REASON_CODES)[number],basis:CanonicalChromaAdmission["declarationBasis"]="missing_or_conflicting")=>({outcome,reason,location:null,basis});
  const v=videoOf(facts);
  if(!v || o.factsDigest!==canonicalMediaFactsDigestOf(facts))return result("REFUSE","facts_binding_mismatch");
  if(v.codec!==o.codec || v.index!==o.streamIndex || (o.codec==="h264" ? !["avc1","avc3"].includes(o.container.sampleEntry) : !["hvc1","hev1"].includes(o.container.sampleEntry)))return result("REFUSE","codec_carrier_mismatch");
  const config=o.codec==="h264" ? "avcC" : "hvcC";
  if(o.container.entries.filter(e=>e.type===config).length!==1 || o.container.entries.some(e=>e.type!==config && !["pasp","colr","btrt","fiel"].includes(e.type)))return result("REFUSE","container_carrier_unsupported");
  if(o.container.entries.some(e=>e.type==="fiel" && (e.payloadBytes!==2 || !e.field || e.field.count!==1 || e.field.order!==0 || v.fieldOrder!=="progressive"))
    || o.container.entries.filter(e=>e.type==="fiel").length>1)return result("REFUSE","container_carrier_malformed");
  if(o.container.entries.some(e=>(e.color!==undefined && e.type!=="colr") || (e.field!==undefined && e.type!=="fiel")
    || (e.type==="colr" && (!e.color || e.color.subtype==="other" || e.color.primaries===null || e.color.transfer===null || e.color.matrix===null
      || (e.color.subtype==="nclx" ? e.payloadBytes!==11 || e.color.fullRange===null : e.payloadBytes!==10 || e.color.fullRange!==null))))
    || o.container.entries.filter(e=>e.type==="colr").length>1)return result("REFUSE","container_carrier_malformed");
  // colr contains no siting value. Retain it truthfully and refuse contradictory interpretation tags, including container precedence.
  const declaredLabel=(value:number|null,label:string|null)=>value===(label===null?2:label==="bt709"?1:-1);
  if(o.container.entries.some(e=>e.type==="colr" && e.color && (!declaredLabel(e.color.primaries,v.color.primaries)
    || !declaredLabel(e.color.transfer,v.color.transfer) || !declaredLabel(e.color.matrix,v.color.matrix)
    || (e.color.fullRange!==null && e.color.fullRange!==(v.color.range==="pc")))))return result("REFUSE","container_carrier_malformed");
  if(o.frames.length!==v.presentationTimestamps.length || !o.frames.every((f,i)=>f.pts===v.presentationTimestamps[i]))return result("REFUSE","frame_carrier_incomplete");
  if(o.bitstream.some(s=>s.chromaFormatIdc!==1 || (o.codec==="h264" && s.frameMbsOnlyFlag!==1) || (o.codec==="hevc" && s.frameMbsOnlyFlag!==null)))return result("REFUSE","codec_carrier_mismatch");
  const declarations=o.bitstream.map(s=>({vui:s.vuiPresent,present:s.locationPresent,top:s.topFieldType,bottom:s.bottomFieldType}));
  if(!declarations.every(d=>equal(d,declarations[0])) || o.bitstream.some(s=>s.topFieldType!==s.bottomFieldType))return result("REFUSE","bitstream_carrier_conflict");
  const known=(r:CanonicalChromaObservation["streamReported"]):r is ChromaLocation=>r!==null && (CHROMA_LOCATIONS as readonly string[]).includes(r);
  const reported=o.frames.map(f=>f.reported).filter(known);
  if(new Set(reported).size>1)return result("REFUSE","frame_carrier_conflict");
  if(known(o.streamReported) && reported.some(r=>r!==o.streamReported))return result("REFUSE","stream_carrier_conflict");
  const s=o.bitstream[0]!;
  if(s.locationPresent!==1)return result("DEFER","source_default_unproven","codec_default_not_established");
  const declared=CHROMA_LOCATIONS[s.topFieldType!]!;
  if(known(o.streamReported) && o.streamReported!==declared)return result("REFUSE","stream_carrier_conflict");
  if(reported.some(r=>r!==declared))return result("REFUSE","frame_carrier_conflict");
  if(!known(o.streamReported) || o.frames.some(f=>!known(f.reported)))return result("DEFER","reported_carrier_missing");
  return {outcome:"ELIGIBLE",reason:"eligible_explicit_center",location:declared,basis:"explicit_codec_declaration"};
}
function decisionOf(source:z.infer<typeof IdentitySchema>,facts:CanonicalMediaFacts,o:CanonicalChromaObservation,transform:CanonicalChromaAdmission["transform"]):CanonicalChromaAdmission {
  const i=interpret(facts,o);let outcome=i.outcome,reason=i.reason;
  const sourcePosition=i.location===null?null:chromaPositionOf(i.location),requiredPosition=sourcePosition===null?null:transformChromaPosition(sourcePosition,transform);
  const expectedOutputLocation=i.location,expectedOutputDeclaration=i.location==="center" ? "explicit_type_1_center" : i.location==="left" ? "unestablished_type_0_default" : i.location!==null ? "unsupported" : null;
  if(!equal(source,o.source)){outcome="REFUSE";reason="source_binding_mismatch";}
  else if(outcome==="ELIGIBLE") {
    if(requiredPosition!==null && chromaLocationOf(requiredPosition)===null){outcome="DEFER";reason="required_position_unrepresentable";}
    else if(!equal(requiredPosition,sourcePosition)){outcome="DEFER";reason="fixed_encoder_siting_mismatch";}
    else if(i.location==="left"){outcome="DEFER";reason="fixed_output_default_unproven";}
    else if(i.location!=="center"){outcome="DEFER";reason="source_siting_unverified_alpha";}
  }
  return DecisionSchema.parse(identify("canonical_chroma_admission_v1","decisionId",{artifactType:"CanonicalChromaAdmission",artifactVersion:"1.0.0",policy:POLICY,
    observationId:o.observationId,transform,outcome,reason,declarationBasis:i.basis,sourcePosition,requiredPosition,expectedOutputLocation,expectedOutputDeclaration}));
}
const REQUIRED_VERIFICATION=frozen({source:"fresh_held_exact_bytes_and_complete_chroma_reobservation",output:"fresh_held_exact_bytes_explicit_type_1_center_all_carriers",
  pixels:EXACT_PIXEL_METHOD,maximumAbsoluteSampleError:0,sampleMismatchCount:0,timingAudio:"unchanged_0_3_exact_requirements",noEncoderSignalingChange:true} as const);
const VerificationRequirementsSchema=z.custom<typeof REQUIRED_VERIFICATION>(v=>same(v,REQUIRED_VERIFICATION),"Every fresh verification requirement is mandatory");
// The accepted legacy custom validators may throw on non-JSON input; the new envelope fails closed without editing those parsers.
const SamplePlanSchema=z.custom<CanonicalReencodePlan>(v=>{try{return CanonicalReencodePlanSchema.safeParse(v).success;}catch{return false;}}).transform(v=>CanonicalReencodePlanSchema.parse(v));
const SampleDerivationSchema=z.custom<CanonicalReencodeDerivation>(v=>{try{return CanonicalReencodeDerivationSchema.safeParse(v).success;}catch{return false;}}).transform(v=>CanonicalReencodeDerivationSchema.parse(v));
const PlanBody=z.strictObject({planType:z.literal("CanonicalReencodePlan"),planVersion:z.literal("1.1.0"),executionClass:z.literal("lossless_video_reencode_audio_copy_chroma_admitted"),
  source:IdentitySchema,sourceFacts:CanonicalMediaFactsSchema,sourceChroma:CanonicalChromaObservationSchema,samplePlan:SamplePlanSchema,
  policy:PolicySchema,admission:DecisionSchema,requiredVerification:VerificationRequirementsSchema});
export const ChromaSafeReencodePlanSchema=PlanBody.extend({planId:IdSchema}).superRefine((p,c)=>{
  const issue=(message:string)=>c.addIssue({code:"custom",message}),old=planCanonicalReencode(p.sourceFacts);
  if(old.outcome!=="PLAN" || !equal(old.plan,p.samplePlan))issue("Sample plan must replay from the complete original facts");
  const decision=decisionOf(p.source,p.sourceFacts,p.sourceChroma,p.samplePlan.transform);
  if(decision.outcome!=="ELIGIBLE" || !equal(decision,p.admission))issue("A complete successful chroma admission cannot be omitted or bypassed");
  if(!checkIdentity(p,"planId","canonical_reencode_plan_v2"))issue("Full source bytes, facts, carriers, policy and sample plan are bound");
});
export type ChromaSafeReencodePlan=z.infer<typeof ChromaSafeReencodePlanSchema>;
export interface ChromaPlanningResult {outcome:"PLAN"|"EXISTING_PATH"|"DEFER"|"REFUSE";reason:string;plan:ChromaSafeReencodePlan|null;decision:CanonicalChromaAdmission|null}
export function planChromaSafeReencode(input:unknown):ChromaPlanningResult {
  const parsed=z.strictObject({source:IdentitySchema,sourceFacts:CanonicalMediaFactsSchema,sourceChroma:CanonicalChromaObservationSchema}).safeParse(input);
  const result=(outcome:ChromaPlanningResult["outcome"],reason:string,decision:CanonicalChromaAdmission|null=null):ChromaPlanningResult=>({outcome,reason,plan:null,decision});
  if(!parsed.success)return result("REFUSE","observation_invalid");
  const {source,sourceFacts,sourceChroma}=parsed.data,old=planCanonicalReencode(sourceFacts);
  if(old.outcome!=="PLAN" || !old.plan)return result(old.outcome==="PLAN" ? "REFUSE" : old.outcome,old.reason);
  const admission=decisionOf(source,sourceFacts,sourceChroma,old.plan.transform);
  if(admission.outcome!=="ELIGIBLE")return result(admission.outcome,admission.reason,admission);
  const plan=ChromaSafeReencodePlanSchema.parse(identify("canonical_reencode_plan_v2","planId",{planType:"CanonicalReencodePlan",planVersion:"1.1.0",
    executionClass:"lossless_video_reencode_audio_copy_chroma_admitted",source,sourceFacts,sourceChroma,samplePlan:old.plan,policy:POLICY,admission,requiredVerification:REQUIRED_VERIFICATION}));
  return {outcome:"PLAN",reason:admission.reason,plan,decision:admission};
}
export const CHROMA_SAFE_REENCODE_TOOLCHAIN=frozen({...structuredClone(CANONICAL_REENCODE_TOOLCHAIN),canonicalizer:{canonicalizerId:"ci_canonical_chroma_gated_lossless_reencode",version:"0.4.0",
  implementationDigest:hash({sampleSemantics:CANONICAL_REENCODE_TOOLCHAIN.canonicalizer,policy:CHROMA_ALPHA_POLICY,verification:REQUIRED_VERIFICATION})}} as const);
export function chromaSafeComputationIdOf(input:unknown):string {
  const {plan}=z.strictObject({plan:ChromaSafeReencodePlanSchema}).parse(input);
  return contentId("canonical_media_computation_v3",{source:plan.source,plan,toolchain:CHROMA_SAFE_REENCODE_TOOLCHAIN});
}
const DerivationBody=z.strictObject({artifactType:z.literal("CanonicalMediaDerivation"),artifactVersion:z.literal("0.4.0"),stability:z.literal("internal_pre_stable"),
  computationId:IdSchema,plan:ChromaSafeReencodePlanSchema,sampleDerivation:SampleDerivationSchema,outputChroma:CanonicalChromaObservationSchema,
  toolchain:z.custom<typeof CHROMA_SAFE_REENCODE_TOOLCHAIN>(v=>same(v,CHROMA_SAFE_REENCODE_TOOLCHAIN)),
  chromaVerification:z.strictObject({method:z.literal("fresh_chroma_position_and_exact_samples_v1"),policy:PolicySchema,
    sourceObservationId:IdSchema,outputObservationId:IdSchema,sourceBasis:z.literal("explicit_codec_declaration"),outputBasis:z.literal("explicit_codec_declaration"),
    requiredPosition:PositionSchema,actualPosition:PositionSchema,exactPixelMethod:z.literal(EXACT_PIXEL_METHOD)})});
export const ChromaSafeDerivationSchema=DerivationBody.extend({derivationId:IdSchema}).superRefine((d,c)=>{
  const issue=(message:string)=>c.addIssue({code:"custom",message}),s=d.sampleDerivation;
  const identity=(v:{assetId:string;contentHash:string;sizeBytes:number})=>({assetId:v.assetId,contentHash:v.contentHash,sizeBytes:v.sizeBytes});
  if(!equal(d.plan.source,identity(s.source)) || !equal(d.plan.sourceFacts,s.source.facts) || !equal(d.plan.samplePlan,s.plan))issue("Full byte/sample/chroma plans describe one source");
  if(!equal(d.outputChroma.source,identity(s.output)))issue("Output carrier observations bind the exact verified output bytes");
  const i=interpret(s.output.facts,d.outputChroma),actual=i.location===null?null:chromaPositionOf(i.location),v=d.chromaVerification;
  if(i.outcome!=="ELIGIBLE" || i.location!=="center" || i.basis!=="explicit_codec_declaration" || !equal(actual,d.plan.admission.requiredPosition))issue("Fresh output interpretation must equal the independently required position");
  if(v.sourceObservationId!==d.plan.sourceChroma.observationId || v.outputObservationId!==d.outputChroma.observationId
    || !equal(v.requiredPosition,d.plan.admission.requiredPosition) || !equal(v.actualPosition,actual))issue("Complete source/output siting verification is bound");
  if(d.computationId!==chromaSafeComputationIdOf({plan:d.plan}) || !checkIdentity(d,"derivationId","canonical_media_derivation_v3"))issue("New versioned identities bind every requirement and observation");
});
export type ChromaSafeDerivation=z.infer<typeof ChromaSafeDerivationSchema>;
/** Pure builder only. The later execution authority must freshly obtain output observations AND every decoded sample from held bytes. */
export function buildChromaSafeDerivation(input:unknown):ChromaSafeDerivation {
  const {sampleDerivation,plan,outputChroma}=z.strictObject({sampleDerivation:SampleDerivationSchema,plan:ChromaSafeReencodePlanSchema,
    outputChroma:CanonicalChromaObservationSchema}).parse(input);
  const i=interpret(sampleDerivation.output.facts,outputChroma);
  if(i.outcome!=="ELIGIBLE" || i.location!=="center" || !plan.admission.requiredPosition)throw new Error("Chroma output verification failed");
  return ChromaSafeDerivationSchema.parse(identify("canonical_media_derivation_v3","derivationId",{artifactType:"CanonicalMediaDerivation",artifactVersion:"0.4.0",stability:"internal_pre_stable",
    computationId:chromaSafeComputationIdOf({plan}),plan,sampleDerivation,outputChroma,toolchain:CHROMA_SAFE_REENCODE_TOOLCHAIN,
    chromaVerification:{method:"fresh_chroma_position_and_exact_samples_v1",policy:POLICY,sourceObservationId:plan.sourceChroma.observationId,
      outputObservationId:outputChroma.observationId,sourceBasis:"explicit_codec_declaration",outputBasis:"explicit_codec_declaration",
      requiredPosition:plan.admission.requiredPosition,actualPosition:chromaPositionOf(i.location),exactPixelMethod:EXACT_PIXEL_METHOD}}));
}
