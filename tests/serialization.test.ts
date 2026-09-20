import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { UniversalEditPlanSchema } from "../packages/contracts/index.js";
import { planDigest } from "../packages/validation/index.js";
import { createFixtures } from "../samples/fixtures.js";
import { requireValue } from "./support/fixtures.js";

test("canonical serialization is independent of object insertion order and preserves array order", () => {
  assert.equal(canonicalSerialize({ z: 1, a: { second: 2, first: "తెలుగు" } }), canonicalSerialize({ a: { first: "తెలుగు", second: 2 }, z: 1 }));
  assert.notEqual(canonicalSerialize([1, 2]), canonicalSerialize([2, 1]));
  assert.equal(canonicalSerialize(-0), "0");
});
test("edit plans survive validation/serialization round trips with identical bytes and digests", () => {
  const first = createFixtures().plan;
  const encoded = canonicalSerialize(first);
  const raw: unknown = JSON.parse(encoded);
  const second = UniversalEditPlanSchema.parse(raw);
  assert.equal(encoded, canonicalSerialize(second));
  assert.equal(planDigest(first), planDigest(second));
  requireValue(second.clips[0]).reason = "A different decision explanation.";
  assert.notEqual(planDigest(first), planDigest(second));
});
test("canonical serialization rejects lossy and executable object shapes", () => {
  const cycle: { self?: unknown } = {}; cycle.self = cycle;
  const sparse = new Array<unknown>(2); sparse[1] = "x";
  let getterExecuted = false;
  const accessor = Object.defineProperty({}, "value", { enumerable: true, get() { getterExecuted = true; return 1; } });
  for (const value of [undefined, { missing: undefined }, Number.NaN, Number.POSITIVE_INFINITY, 1n, new Date("2026-01-01T00:00:00.000Z"), () => 1, cycle, sparse, accessor, { [Symbol("hidden")]: 1 }]) assert.throws(() => canonicalSerialize(value));
  assert.equal(getterExecuted, false);
});
