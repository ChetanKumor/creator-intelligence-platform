import { z } from "zod";
import { FrameRateSchema, IdSchema, TimestampSchema } from "../contracts/common.js";

export const PROTOCOL_VERSION = "1.0.0" as const;
export const ANALYZER_VERSION = "0.1.0";
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export function validateAuthorizationProvenance(manifest: { sourceType: string; authorizationBasis: string; allowedPurposes: string[] }, ctx: z.RefinementCtx): void {
  if ((manifest.sourceType === "synthetic") !== (manifest.authorizationBasis === "synthetic_generated")) ctx.addIssue({ code: "custom", message: "Synthetic authorization and source must agree." });
  if (new Set(manifest.allowedPurposes).size !== manifest.allowedPurposes.length) ctx.addIssue({ code: "custom", message: "Purposes must be unique." });
}
export const AuthorizationManifestSchema = z.strictObject({
  manifestType: z.literal("AuthorizedReference"), schemaVersion: z.literal("1.0.0"),
  contentHash: HashSchema, sizeBytes: z.number().int().positive().safe(),
  sourceType: z.enum(["synthetic", "owner_supplied"]),
  authorizationBasis: z.enum(["synthetic_generated", "owner_created", "permission_granted"]),
  allowedPurposes: z.array(z.enum(["local_reference_analysis", "local_evaluation"])).min(1).max(2),
  dateAdded: TimestampSchema, creatorId: IdSchema, projectId: IdSchema,
}).superRefine(validateAuthorizationProvenance);
export type AuthorizationManifest = z.infer<typeof AuthorizationManifestSchema>;

export const MetadataSchema = z.strictObject({
  durationSeconds: z.number().positive().max(600), width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384),
  codedWidth: z.number().int().positive().max(16384), codedHeight: z.number().int().positive().max(16384),
  fps: FrameRateSchema, frameCount: z.number().int().positive().max(72000),
  frameTimes: z.array(z.number().finite().nonnegative()).min(1).max(72000),
  codec: z.string().regex(/^[a-z0-9_]+$/).max(80), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  aspectRatio: z.strictObject({ width: z.number().int().positive().max(10000), height: z.number().int().positive().max(10000) }),
  hasAudio: z.boolean(), variableFrameRate: z.boolean(),
  frameRateApproximation: z.strictObject({
    policy: z.literal("bounded-rational-v1"), sourceField: z.enum(["avg_frame_rate", "r_frame_rate"]),
    sourceFrameRate: z.string().regex(/^[1-9][0-9]{0,9}\/[1-9][0-9]{0,9}$/), absoluteErrorFramesPerSecond: z.number().finite().nonnegative().max(0.001),
  }).optional(),
}).superRefine((metadata, ctx) => {
  if (metadata.frameTimes.length !== metadata.frameCount || metadata.frameTimes[0] !== 0 || metadata.frameTimes.some((t, i) => t >= metadata.durationSeconds || (i > 0 && t <= metadata.frameTimes[i - 1]!))) {
    ctx.addIssue({ code: "custom", message: "Decoded frame timestamps must strictly partition the video clock." });
  }
  if (metadata.frameRateApproximation) {
    const [numerator, denominator] = metadata.frameRateApproximation.sourceFrameRate.split("/").map(Number);
    const exactRate = numerator! / denominator!, error = Math.abs(exactRate - metadata.fps.numerator / metadata.fps.denominator);
    if (exactRate < 1 || exactRate > 120 || Math.abs(error - metadata.frameRateApproximation.absoluteErrorFramesPerSecond) > 1e-9) ctx.addIssue({ code: "custom", message: "Frame-rate approximation must retain its exact source rate and measured error." });
  }
});
export type MediaMetadata = z.infer<typeof MetadataSchema>;
export const DetectorConfigSchema = z.strictObject({
  kind: z.enum(["content", "adaptive"]), threshold: z.number().positive().max(255),
  minSceneFrames: z.number().int().positive().max(120), adaptiveThreshold: z.number().positive().max(100),
});
export const DEFAULT_DETECTOR = { kind: "content", threshold: 27, minSceneFrames: 2, adaptiveThreshold: 3 } as const;
export type DetectorConfig = z.infer<typeof DetectorConfigSchema>;
export const ShotSchema = z.strictObject({ shotId: IdSchema, startSeconds: z.number().nonnegative(), endSeconds: z.number().positive() });
export type Shot = z.infer<typeof ShotSchema>;
export const SampleSchema = z.strictObject({ sampleId: IdSchema, shotId: IdSchema, frameIndex: z.number().int().nonnegative(), atSeconds: z.number().nonnegative() });
export type Sample = z.infer<typeof SampleSchema>;
export const MeasurementSchema = z.strictObject({
  sampleId: IdSchema, brightnessMean: z.number().min(0).max(1), darkPixelFraction: z.number().min(0).max(1), brightPixelFraction: z.number().min(0).max(1),
  comparisonSampleId: IdSchema.nullable(), comparisonIntervalSeconds: z.number().positive().nullable(),
  laplacianVariance: z.number().finite().nonnegative(),
  frameDifferenceMean: z.number().min(0).max(1).nullable(), opticalFlowMeanPixels: z.number().finite().nonnegative().nullable(),
});
export type Measurement = z.infer<typeof MeasurementSchema>;
export const EmbeddingConfigSchema = z.strictObject({
  mode: z.enum(["siglip", "stub"]),
  model: z.enum(["google/siglip2-base-patch16-naflex", "google/siglip2-so400m-patch16-naflex", "synthetic-frame-statistics"]),
  revision: z.string().regex(/^(?:[a-f0-9]{40}|stub-v1)$/),
  device: z.enum(["cpu", "cuda"]), cpuFallback: z.boolean(), maxPatches: z.union([z.literal(256), z.literal(512), z.literal(1024)]),
}).superRefine((config, ctx) => {
  if ((config.mode === "stub") !== (config.model === "synthetic-frame-statistics") || (config.mode === "stub") !== (config.revision === "stub-v1")) ctx.addIssue({ code: "custom", message: "Stub identity and model configuration must agree." });
});
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;
export const STUB_EMBEDDING: EmbeddingConfig = { mode: "stub", model: "synthetic-frame-statistics", revision: "stub-v1", device: "cpu", cpuFallback: false, maxPatches: 256 };

export const WorkerResponseSchema = z.discriminatedUnion("operation", [
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("metadata"), value: MetadataSchema, toolVersion: z.string().min(1).max(80) }),
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("detect"), value: z.array(z.number().int().positive()).max(999), toolVersion: z.string().min(1).max(80) }),
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("sample"), value: z.array(MeasurementSchema).min(1).max(3000), toolVersion: z.string().min(1).max(80) }),
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("embed"), value: z.array(z.strictObject({ sampleId: IdSchema, vector: z.array(z.number().finite()).min(1).max(65536) })).min(1).max(3000), toolVersion: z.string().min(1).max(80), device: z.enum(["cpu", "cuda"]), fallback: z.boolean() }),
]);
export type WorkerResponse = z.infer<typeof WorkerResponseSchema>;
// Paths here are execution-only. These messages are never persisted as domain artifacts.
export const WorkerRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("metadata"), mediaPath: z.string().min(1), ffprobePath: z.string().min(1) }),
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("detect"), mediaPath: z.string().min(1), config: DetectorConfigSchema, frameCount: z.number().int().positive().max(72000) }),
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("sample"), mediaPath: z.string().min(1), ffmpegPath: z.string().min(1), frameRoot: z.string().min(1), samples: z.array(SampleSchema).min(1).max(3000) }),
  z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), operation: z.literal("embed"), frameRoot: z.string().min(1), modelRoot: z.string().min(1), config: EmbeddingConfigSchema, sampleIds: z.array(IdSchema).min(1).max(3000) }),
]);
export type WorkerRequest = z.infer<typeof WorkerRequestSchema>;
export const WorkerFailureSchema = z.strictObject({ protocolVersion: z.literal(PROTOCOL_VERSION), error: z.strictObject({ code: IdSchema, stage: z.enum(["metadata", "detect", "sample", "embed", "protocol"]), diagnostic: z.string().regex(/^[a-zA-Z0-9 _.,:()=-]+$/).max(240) }) });
