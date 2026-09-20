import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { CONTRACT_VERSION, contractSchemas } from "../packages/contracts/index.js";
import { BenchmarkManifestSchema } from "../packages/evaluation/index.js";
import { createFixtures, createSyntheticBenchmark } from "../samples/fixtures.js";
import { ReferenceFingerprintV11Schema, migrateReferenceV1ToV11 } from "../packages/contracts/reference-v11.js";
import { WorkerRequestSchema, WorkerResponseSchema, WorkerFailureSchema, AuthorizationManifestSchema } from "../packages/reference-analyzer/protocol.js";
import { ReferenceBenchmarkSchema } from "../packages/evaluation/reference.js";
import { FootageAnalysisSchema, FootageAuthorizationSchema, FootageConfigSchema, FootageInventorySchema, FootageManifestSchema } from "../packages/footage-analyzer/protocol.js";

const check = process.argv.includes("--check");
const root = new URL("../../", import.meta.url);
const schemas = { ...contractSchemas, BenchmarkManifest: BenchmarkManifestSchema };
const artifacts: { path: string; content: string }[] = Object.entries(schemas).map(([name, schema]) => ({
  path: `schemas/v1/${name}.schema.json`,
  content: `${JSON.stringify({ ...z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }), $id: `urn:creator-intelligence:${name}:${CONTRACT_VERSION}`, $comment: "Structural interchange schema. Cross-field and cross-asset checks in packages/contracts and packages/validation are also mandatory." }, null, 2)}\n`,
}));
const fixtures = createFixtures();
for (const [path, schema] of Object.entries({
  "schemas/v1.1/ReferenceFingerprint.schema.json": ReferenceFingerprintV11Schema,
  "schemas/interchange/WorkerRequest.schema.json": WorkerRequestSchema,
  "schemas/interchange/WorkerResponse.schema.json": WorkerResponseSchema,
  "schemas/interchange/WorkerFailure.schema.json": WorkerFailureSchema,
  "schemas/interchange/AuthorizedReference.schema.json": AuthorizationManifestSchema,
  "schemas/interchange/ReferenceBoundaryBenchmark.schema.json": ReferenceBenchmarkSchema,
  "schemas/interchange/AuthorizedFootage.schema.json": FootageAuthorizationSchema,
  "schemas/interchange/AuthorizedFootageSet.schema.json": FootageManifestSchema,
  "schemas/interchange/FootageConfig.schema.json": FootageConfigSchema,
  "schemas/interchange/FootageAnalysis.schema.json": FootageAnalysisSchema,
  "schemas/interchange/FootageInventory.schema.json": FootageInventorySchema,
})) {
  const id = path.startsWith("schemas/v1.1/") ? "urn:creator-intelligence:ReferenceFingerprint:1.1.0" : `urn:creator-intelligence:interchange:${path.split("/").at(-1)!.replace(".schema.json", "")}:1.0.0`;
  artifacts.push({ path, content: `${JSON.stringify({ ...z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }), $id: id, $comment: "Generated from TypeScript-owned schemas. TypeScript semantic validation remains mandatory." }, null, 2)}\n` });
}
artifacts.push({ path: "tests/fixtures/reference-v11.json", content: `${JSON.stringify(migrateReferenceV1ToV11(fixtures.reference), null, 2)}\n` });
for (const [name, data] of Object.entries({ "reference-fingerprint": fixtures.reference, "clip-segments": fixtures.segments, "audio-fingerprint": fixtures.audio, "edit-plan": fixtures.plan, "media-assets": fixtures.assets, "decisions": fixtures.decisions, "benchmark": createSyntheticBenchmark() })) {
  artifacts.push({ path: `samples/fixtures/${name}.json`, content: `${JSON.stringify(data, null, 2)}\n` });
}
for (const artifact of artifacts) {
  const url = new URL(artifact.path, root);
  if (check) {
    if (await readFile(url, "utf8") !== artifact.content) throw new Error(`Generated artifact drift: ${artifact.path}`);
  } else {
    await mkdir(new URL("./", url), { recursive: true });
    await writeFile(url, artifact.content, "utf8");
  }
}
process.stdout.write(`${check ? "Verified" : "Generated"} ${artifacts.length} schema and synthetic fixture artifacts.\n`);
