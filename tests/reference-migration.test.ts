import assert from "node:assert/strict";
import { test } from "node:test";
import { AnyReferenceFingerprintSchema, ReferenceFingerprintSchema, ReferenceFingerprintV11Schema, RoleSchema, TransitionSchema, migrateReferenceV1ToV11 } from "../packages/contracts/index.js";
import { createFixtures } from "../samples/fixtures.js";

test("explicit reference migration preserves all known observations and adds null embeddings", () => {
  const old = createFixtures().reference;
  old.shots[0]!.transitionOut = { type: "dissolve", durationSeconds: 0.2 };
  const before = structuredClone(old);
  const next = migrateReferenceV1ToV11(old);
  assert.deepEqual(old, before);
  assert.equal(next.schemaVersion, "1.1.0");
  assert.deepEqual(next.shots, old.shots.map((shot) => ({ ...shot, semanticEmbedding: null })));
  assert.deepEqual(next.structure, old.structure);
  assert.ok(AnyReferenceFingerprintSchema.safeParse(old).success);
  assert.ok(AnyReferenceFingerprintSchema.safeParse(next).success);
  assert.equal(ReferenceFingerprintSchema.safeParse(next).success, false);
});

test("unknown roles/transitions are reference-specific and versions fail closed", () => {
  const next = migrateReferenceV1ToV11(createFixtures().reference);
  next.shots[0]!.role = "unknown";
  next.shots[0]!.transitionOut = { type: "unknown" };
  next.structure = [];
  assert.ok(ReferenceFingerprintV11Schema.safeParse(next).success);
  assert.equal(RoleSchema.safeParse("unknown").success, false);
  assert.equal(TransitionSchema.safeParse({ type: "unknown" }).success, false);
  for (const version of ["1.0.1", "1.1.1", "2.0.0"]) assert.equal(AnyReferenceFingerprintSchema.safeParse({ ...next, schemaVersion: version }).success, false);
  assert.throws(() => migrateReferenceV1ToV11(next));
  assert.equal(ReferenceFingerprintSchema.safeParse({ ...next, schemaVersion: "1.0.0" }).success, false);
});

test("v1.1 validates embedding references and retains timeline/pacing invariants", () => {
  const next = migrateReferenceV1ToV11(createFixtures().reference);
  next.shots[0]!.semanticEmbedding = { embeddingId: "embedding_a", objectId: "object_a", spaceId: "space_a", spaceVersion: "1", dimensions: 4, distance: "cosine" };
  assert.ok(ReferenceFingerprintV11Schema.safeParse(next).success);
  assert.equal(ReferenceFingerprintV11Schema.safeParse({ ...next, shots: [{ ...next.shots[0], semanticEmbedding: [1, 2] }, ...next.shots.slice(1)] }).success, false);
  next.shots[0]!.sourceRange.endSeconds = 100;
  assert.equal(ReferenceFingerprintV11Schema.safeParse(next).success, false);
});
