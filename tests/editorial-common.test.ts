import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, IdSetSchema, MissingSchema, availability, exactDigest, identify, missing, present } from "../packages/editorial/common.js";
import { EDITORIAL_TAXONOMY, EditorialTaskTaxonomySchema, TaskRefSchema } from "../packages/editorial/taxonomy.js";
import { artifact } from "./support/editorial.js";

test("canonical identity ignores object insertion order and preserves ordered lists", () => {
  assert.deepEqual(identify("editorial_test", "id", { a: 1, b: 2 }), identify("editorial_test", "id", { b: 2, a: 1 }));
  assert.notEqual(identify("editorial_test", "id", [1, 2]).id, identify("editorial_test", "id", [2, 1]).id);
});
test("set canonicalization rejects duplicates and ignores set order", () => {
  assert.deepEqual(IdSetSchema.parse(["b", "a"]), ["a", "b"]);
  assert.equal(IdSetSchema.safeParse(["a", "a"]).success, false);
});
for (const value of [NaN, Infinity, -Infinity]) test(`availability rejects non-finite ${String(value)}`, () => {
  assert.equal(availability(z.number().finite()).safeParse(present(value)).success, false);
  assert.throws(() => canonicalSerialize(value));
});
for (const state of ["not_computed", "unavailable", "not_applicable", "unsupported"] as const) test(`missing ${state} stays tagged without a numeric value`, () => {
  const value = MissingSchema.parse(missing(state, "source_reason"));
  assert.equal(value.state, state); assert.ok(!("value" in value));
  assert.equal(MissingSchema.safeParse({ ...value, value: 0 }).success, false);
});
test("failed missingness requires evidence", () => {
  assert.equal(MissingSchema.safeParse({ state: "failed", reasonCode: "computation_error", evidenceRefs: [] }).success, false);
});
test("exact-byte hashes differ while canonical JSON identity remains equal", () => {
  const a = new TextEncoder().encode('{"a":1,"b":2}'), b = new TextEncoder().encode('{ "b": 2, "a": 1 }');
  assert.notEqual(exactDigest(a), exactDigest(b));
  assert.equal(canonicalSerialize(JSON.parse(new TextDecoder().decode(a))), canonicalSerialize(JSON.parse(new TextDecoder().decode(b))));
});
test("explicit artifact map validates exact bytes, parsed content, and unique IDs", () => {
  const a = artifact("object_test", "Descriptor", { id: "candidate_test" });
  assert.throws(() => new EditorialArtifactMap([a, a]), /Duplicate/);
  assert.throws(() => new EditorialArtifactMap([{ ...a, bytes: new Uint8Array([1]) }]), /hash/);
  assert.throws(() => new EditorialArtifactMap([{ ...a, value: { id: "wrong" } }]), /differs/);
  assert.equal(new EditorialArtifactMap([a]).resolve({ artifact: a.ref, pointer: "/id" }), "candidate_test");
});
test("JSON pointers reject invalid escapes and missing/prototype references", () => {
  const a = artifact("object_test", "Descriptor", { "a/b": { "~": 0 } }), map = new EditorialArtifactMap([a]);
  assert.equal(map.resolve({ artifact: a.ref, pointer: "/a~1b/~0" }), 0);
  assert.equal(EvidenceRefSchema.safeParse({ artifact: a.ref, pointer: "/bad~2" }).success, false);
  assert.throws(() => map.resolve({ artifact: a.ref, pointer: "/__proto__" }), /Unresolved/);
  assert.equal(ArtifactRefSchema.safeParse({ ...a.ref, url: "https://invalid.example" }).success, false);
});
test("fixed taxonomy rejects unknown versions, tasks, definitions and extra fields", () => {
  assert.ok(EditorialTaskTaxonomySchema.safeParse(EDITORIAL_TAXONOMY).success);
  for (const patch of [{ taxonomyVersion: "0.2.0" }, { artifactVersion: "9.0.0" }, { tasks: [] }, { extra: true }]) assert.equal(EditorialTaskTaxonomySchema.safeParse({ ...EDITORIAL_TAXONOMY, ...patch }).success, false);
  assert.equal(TaskRefSchema.safeParse({ taxonomyId: EDITORIAL_TAXONOMY.taxonomyId, taxonomyVersion: "0.1.0", taskId: "invented_task" }).success, false);
});
