import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import { contentId } from "../packages/reference-analyzer/features.js";
import { TRANSNETV2_ADAPTER_VERSION, TRANSNETV2_SOURCE_COMMIT, TRANSNETV2_WEIGHT_SET_SHA256,
  TransNetV2DetectionResponseSchema } from "../packages/footage-analyzer/transnetv2-protocol.js";
import { footageEnvironment } from "./support/footage.js";

const version = `${TRANSNETV2_ADAPTER_VERSION}:${TRANSNETV2_SOURCE_COMMIT}:${TRANSNETV2_WEIGHT_SET_SHA256}`;

test("application records full TransNet provenance with a bounded deterministic telemetry version", async () => {
  const env = await footageEnvironment(["good"], 3), open = env.services.open;
  env.services.open = async (...args) => {
    const asset = await open(...args);
    asset.media.detect = async (_metadata, detector) => {
      assert.equal(detector.kind, "transnetv2");
      return { cuts: [10, 20], version };
    };
    return asset;
  };
  const result = await analyzeFootage(env.manifest, { ...env.config, detector: { kind: "transnetv2", threshold: 0.5 } }, "transnet_provenance", env.services);
  assert.deepEqual(result.inventory.failures, []);
  assert.equal(result.analyses[0]!.shots.length, 3);
  const run = env.telemetry.modelRuns().find(r => r.model === "transnetv2")!;
  assert.equal(run.status, "succeeded");
  assert.equal(run.modelVersion, contentId("transnetv2", version));
  assert.ok(run.modelVersion.length <= 80);
  assert.equal(result.timings.find(t => t.stage === "detect")!.toolVersion, version);
});

test("TransNet application failures retain safe codes and never retry another detector", async () => {
  for (const code of ["MEDIA_UNREADABLE", "FRAME_COUNT_MISMATCH", "MODEL_PROVENANCE_INVALID", "CUDA_UNAVAILABLE",
    "TRANSNET_ANALYSIS_FAILED", "INTERCHANGE_INVALID", "WORKER_TIMEOUT", "WORKER_UNAVAILABLE", "WORKER_EXITED", "WORKER_OUTPUT_LIMIT"]) {
    const env = await footageEnvironment(["good"], 3), open = env.services.open;
    let detects = 0, samples = 0;
    env.services.open = async (...args) => {
      const asset = await open(...args);
      asset.media.detect = async (_metadata, detector) => {
        detects++; assert.equal(detector.kind, "transnetv2");
        throw Object.assign(new Error("private provider diagnostic"), { code });
      };
      asset.media.sampleFootage = async () => { samples++; throw new Error("unexpected sampling"); };
      return asset;
    };
    const result = await analyzeFootage(env.manifest, { ...env.config, detector: { kind: "transnetv2", threshold: 0.5 } }, `failure_${code}`, env.services);
    assert.equal(detects, 1); assert.equal(samples, 0); assert.equal(env.backend.calls, 0);
    assert.equal(result.analyses.length, 0); assert.equal(result.inventory.failures[0]!.code, code);
    assert.equal(result.inventory.failures[0]!.stage, "detect");
    assert.ok(!JSON.stringify(result).includes("private provider diagnostic"));
    assert.equal(env.telemetry.modelRuns().find(r => r.model === "transnetv2")!.status, "failed");
  }
});

test("TransNet interchange rejects frame mismatches, invalid cuts, CPU and timestamp authority", () => {
  const valid = { protocolVersion: "1.0.0", operation: "detect", toolVersion: TRANSNETV2_ADAPTER_VERSION,
    model: { provider: "transnetv2", sourceCommit: TRANSNETV2_SOURCE_COMMIT, sourceSha256: "a".repeat(64),
      weightSetSha256: TRANSNETV2_WEIGHT_SET_SHA256, tensorflowVersion: "2.15.0", device: "cuda", gpuName: "fixture" },
    media: { expectedFrameCount: 30, decodedFrameCount: 30 },
    config: { threshold: 0.5, inputWidth: 48, inputHeight: 27, pixelFormat: "rgb24" },
    value: { cuts: [10, 20], sceneCount: 3, singlePredictionMin: 0, singlePredictionMax: 1, manyPredictionMin: 0, manyPredictionMax: 1 },
    performance: { modelLoadSeconds: 0, decodeSeconds: 0, inferenceSeconds: 0 } };
  assert.ok(TransNetV2DetectionResponseSchema.safeParse(valid).success);
  for (const cuts of [[0, 20], [10, 10], [20, 10], [10, 30], [1.5, 20]]) {
    assert.equal(TransNetV2DetectionResponseSchema.safeParse({ ...valid, value: { ...valid.value, cuts } }).success, false);
  }
  assert.equal(TransNetV2DetectionResponseSchema.safeParse({ ...valid, media: { ...valid.media, decodedFrameCount: 29 } }).success, false);
  assert.equal(TransNetV2DetectionResponseSchema.safeParse({ ...valid, model: { ...valid.model, device: "cpu" } }).success, false);
  assert.equal(TransNetV2DetectionResponseSchema.safeParse({ ...valid, value: { ...valid.value, timestamps: [1, 2] } }).success, false);
});
