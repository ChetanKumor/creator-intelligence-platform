import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalReferenceMedia } from "../scripts/reference-local.js";
import { siglipConfiguration } from "../packages/reference-analyzer/models.js";
import { PROTOCOL_VERSION, type WorkerRequest, type WorkerResponse } from "../packages/reference-analyzer/protocol.js";

test("local embedding requests bound payloads, retain sample order and report mixed-device fallback", async () => {
  const calls: string[][] = [];
  const worker = { async request(input: WorkerRequest): Promise<WorkerResponse> {
    assert.equal(input.operation, "embed");
    if (input.operation !== "embed") throw new Error("Unexpected operation.");
    calls.push(input.sampleIds);
    return { protocolVersion: PROTOCOL_VERSION, operation: "embed", value: input.sampleIds.map((sampleId) => ({ sampleId, vector: [1, 0] })),
      toolVersion: "test-v1", device: calls.length === 1 ? "cuda" : "cpu", fallback: calls.length > 1 };
  } };
  const sampleIds = Array.from({ length: 22 }, (_, index) => `sample_${index.toString(16).padStart(64, "0")}`);
  const media = new LocalReferenceMedia(worker, "unused-local-file");
  const result = await media.embed(sampleIds, siglipConfiguration("base", "cuda", true));
  assert.deepEqual(calls.map((call) => call.length), [8, 8, 6]);
  assert.deepEqual(result.vectors.map((item) => item.sampleId), sampleIds);
  assert.equal(result.device, "mixed");
  assert.equal(result.fallback, true);
  assert.equal(result.version, "test-v1");
  await assert.rejects(media.embed([], siglipConfiguration()), { code: "EMBEDDING_FAILED" });
});
