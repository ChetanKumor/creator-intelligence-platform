/** E–F compact computation commitment. Pure, scope-free data; never held-media proof or execution authority.
 * Full 0.3/0.4 evidence is required to project this record and must be freshly rebuilt on EVERY lookup.
 * Ordered sequence digests commit all frame rows; no frame evidence is truncated to fit the store.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { sha256 } from "../edit-render/common.js";
import { CHROMA_SAFE_REENCODE_TOOLCHAIN, ChromaSafeDerivationSchema, ChromaSafeReencodePlanSchema, chromaSafeComputationIdOf } from "./chroma.js";
import { CANONICAL_LOSSLESS_ENCODE_PROFILE, EXACT_PIXEL_METHOD, PIXEL_TRANSFORMS } from "./reencode.js";
import { PLAN_VERIFICATION_METHODS } from "./plan.js";
import { audioTimelineDigestOf } from "./profile.js";

export const CANONICAL_LOSSLESS_RECORD_IDENTITY = "canonical_lossless_computation_record_v1" as const;
export const CANONICAL_LOSSLESS_RECORD_MAX_BYTES = 262144;
const digest = (v: unknown) => sha256(canonicalSerialize(v));
const same = (a: unknown, b: unknown) => { try { return equal(a, b); } catch { return false; } };
const Positive = z.number().int().positive().safe();
const Geometry = z.strictObject({ width: Positive.max(16384).multipleOf(2), height: Positive.max(16384).multipleOf(2) });
const Identity = z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: Positive }).refine(v => v.assetId === "asset_" + v.contentHash);
export const CanonicalLosslessOutputFormatSchema = z.strictObject({ family: z.literal("iso_bmff"), format: z.enum(["mp4", "mov"]),
  majorBrand: z.enum(["isom", "iso2", "mp41", "mp42", "avc1", "qt  "]),
  compatibleBrands: z.array(z.string().regex(/^[\x20-\x7e]{4}$/)).min(1).max(16), fileTypeBoxDigest: HashSchema,
  video: z.strictObject({ codec: z.literal("h264"), profile: z.literal("High 4:4:4 Predictive"), pixelFormat: z.literal("yuv420p") }),
}).refine(v => (v.format === "mov") === (v.majorBrand === "qt  ") && v.compatibleBrands.includes(v.majorBrand), "Actual BMFF format/brand agreement required");
export type CanonicalLosslessOutputFormat = z.infer<typeof CanonicalLosslessOutputFormatSchema>;
const Pixels = z.strictObject({ method: z.literal(EXACT_PIXEL_METHOD), transform: z.enum(PIXEL_TRANSFORMS), pixelFormat: z.literal("yuv420p"),
  sourceGeometry: Geometry, outputGeometry: Geometry, frameCount: Positive.max(72000), frameMapping: z.literal("presentation_index_identity"),
  sourceDigest: HashSchema, expectedDigest: HashSchema, outputDigest: HashSchema, sampleMismatchCount: z.literal(0), maximumAbsoluteSampleError: z.literal(0),
  perPlaneMismatch: z.strictObject({ Y: z.literal(0), U: z.literal(0), V: z.literal(0) }),
}).refine(p => p.expectedDigest === p.outputDigest && (p.transform !== "identity" || p.sourceDigest === p.outputDigest), "Zero error and complete ordered commitments required");
const Timing = z.strictObject({ sourceDigest: HashSchema, outputDigest: HashSchema });
const Payload = z.strictObject({ method: z.literal(PLAN_VERIFICATION_METHODS.audioPackets), sourceDigest: HashSchema, outputDigest: HashSchema })
  .refine(p => p.sourceDigest === p.outputDigest, "Copied packet payloads must be exact");
const Body = z.strictObject({ artifactType: z.literal("CanonicalLosslessComputationRecord"), artifactVersion: z.literal("0.4.0"), stability: z.literal("internal_pre_stable"),
  computationId: z.string().regex(/^canonical_media_computation_v3_[a-f0-9]{64}$/),
  source: Identity.safeExtend({ factsDigest: HashSchema, chromaObservationId: IdSchema }),
  plan: z.strictObject({ planId: IdSchema, planVersion: z.literal("1.1.0"), encodeProfileId: z.literal(CANONICAL_LOSSLESS_ENCODE_PROFILE.encodeProfileId), verificationPolicyId: HashSchema }),
  toolchain: z.custom<typeof CHROMA_SAFE_REENCODE_TOOLCHAIN>(v => same(v, CHROMA_SAFE_REENCODE_TOOLCHAIN), "Frozen 0.4 toolchain required"),
  output: Identity.safeExtend({ factsDigest: HashSchema, profileEvaluationDigest: HashSchema, format: CanonicalLosslessOutputFormatSchema }),
  verification: z.strictObject({ method: z.literal("fresh_exact_lossless_reencode_v1"), pixels: Pixels,
    chroma: ChromaSafeDerivationSchema.shape.chromaVerification, videoTiming: Timing, audioTiming: Timing.nullable(), audioPackets: Payload.nullable() }),
});
export const CanonicalLosslessComputationRecordSchema = Body.extend({ recordId: IdSchema }).superRefine((r, c) => {
  if (!checkIdentity(r, "recordId", CANONICAL_LOSSLESS_RECORD_IDENTITY)) c.addIssue({ code: "custom", message: "Complete compact record identity required" });
  if (r.source.contentHash === r.output.contentHash) c.addIssue({ code: "custom", message: "A re-encode produces different bytes" });
  if ((r.verification.audioPackets === null) !== (r.verification.audioTiming === null)) c.addIssue({ code: "custom", message: "Audio proof and timing must agree" });
});
export type CanonicalLosslessComputationRecord = z.infer<typeof CanonicalLosslessComputationRecordSchema>;
/** The trusted reader also has a freshly rebuilt full plan. Commitments alone cannot reconstruct that plan or validate media. */
export function validateLosslessRecordPlan(input: unknown, suppliedPlan: unknown): CanonicalLosslessComputationRecord {
  const r = CanonicalLosslessComputationRecordSchema.parse(input), p = ChromaSafeReencodePlanSchema.parse(suppliedPlan), v = r.verification;
  const policy = digest({ requiredVerification: p.requiredVerification, policy: p.policy, outputFormat: "held_ftyp_and_fixed_h264_profile_v1" });
  const identity = { assetId: r.source.assetId, contentHash: r.source.contentHash, sizeBytes: r.source.sizeBytes };
  const audio = p.sourceFacts.streams.find(s => s.kind === "audio");
  if (r.computationId !== chromaSafeComputationIdOf({ plan: p }) || !same(identity, p.source) || r.source.factsDigest !== digest(p.sourceFacts)
    || r.source.chromaObservationId !== p.sourceChroma.observationId || r.plan.planId !== p.planId || r.plan.verificationPolicyId !== policy
    || v.pixels.transform !== p.samplePlan.transform || !same(v.pixels.sourceGeometry, p.samplePlan.inputGeometry)
    || !same(v.pixels.outputGeometry, p.samplePlan.outputGeometry) || v.pixels.frameCount !== p.samplePlan.videoTiming.frameCount
    || !same(v.videoTiming, { sourceDigest: p.samplePlan.videoTiming.sourceDigest, outputDigest: p.samplePlan.videoTiming.outputDigest })
    || v.chroma.sourceObservationId !== p.sourceChroma.observationId || !same(v.chroma.requiredPosition, p.admission.requiredPosition)
    || !same(v.chroma.actualPosition, p.admission.requiredPosition) || (audio === undefined) !== (v.audioPackets === null)
    || (audio !== undefined && v.audioTiming?.sourceDigest !== audioTimelineDigestOf(audio))) throw new Error("incompatible_lossless_computation_record");
  return r;
}
export function compactLosslessComputationRecordOf(input: unknown, suppliedFormat: unknown): { record: CanonicalLosslessComputationRecord; bytes: string } {
  const d = ChromaSafeDerivationSchema.parse(input), s = d.sampleDerivation, p = d.plan, pixels = s.verification.pixels;
  const format = CanonicalLosslessOutputFormatSchema.parse(suppliedFormat);
  const { frameDigests: _rows, ...commitments } = pixels;
  const record = validateLosslessRecordPlan(identify(CANONICAL_LOSSLESS_RECORD_IDENTITY, "recordId", {
    artifactType: "CanonicalLosslessComputationRecord", artifactVersion: "0.4.0", stability: "internal_pre_stable", computationId: d.computationId,
    source: { assetId: s.source.assetId, contentHash: s.source.contentHash, sizeBytes: s.source.sizeBytes, factsDigest: s.source.factsDigest,
      chromaObservationId: p.sourceChroma.observationId },
    plan: { planId: p.planId, planVersion: p.planVersion, encodeProfileId: p.samplePlan.encodeProfile.encodeProfileId,
      verificationPolicyId: digest({ requiredVerification: p.requiredVerification, policy: p.policy, outputFormat: "held_ftyp_and_fixed_h264_profile_v1" }) },
    toolchain: d.toolchain,
    output: { assetId: s.output.assetId, contentHash: s.output.contentHash, sizeBytes: s.output.sizeBytes, factsDigest: s.output.factsDigest,
      profileEvaluationDigest: digest(s.output.evaluation), format },
    verification: { method: s.verification.method, pixels: commitments, chroma: d.chromaVerification,
      videoTiming: s.verification.videoTiming, audioTiming: s.verification.audioTiming, audioPackets: s.verification.audioPackets },
  }), p);
  const bytes = canonicalSerialize(record) + "\n";
  if (new TextEncoder().encode(bytes).length > CANONICAL_LOSSLESS_RECORD_MAX_BYTES) throw new Error("lossless_record_size_limit");
  return { record, bytes };
}
export function parseLosslessComputationRecordBytes(input: unknown, plan: unknown): CanonicalLosslessComputationRecord {
  if (typeof input !== "string" || new TextEncoder().encode(input).length > CANONICAL_LOSSLESS_RECORD_MAX_BYTES) throw new Error("lossless_record_size_limit");
  const value: unknown = JSON.parse(input), record = validateLosslessRecordPlan(value, plan);
  if (canonicalSerialize(record) + "\n" !== input) throw new Error("noncanonical_lossless_record_bytes");
  return record;
}
