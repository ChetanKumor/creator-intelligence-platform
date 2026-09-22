import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { EmbeddingReferenceSchema } from "../packages/contracts/common.js";
import type { EmbeddingReference } from "../packages/domain/index.js";
import { missing, present, type Availability, type EvidenceRef } from "../packages/editorial/common.js";
import {
  EditorialSemanticComparisonSchema,
  compareEditorialSemantics,
  type EditorialSemanticComparison,
} from "../packages/editorial/semantic.js";
import type { EditorialVectorResolver } from "../packages/editorial/token.js";
import { contentId } from "../packages/reference-analyzer/features.js";

const SPACE_ID = "space_synthetic_owned_cosine";

function referenceFor(vector: readonly number[], objectId: string, patch: Partial<EmbeddingReference> = {}): EmbeddingReference {
  return EmbeddingReferenceSchema.parse({
    embeddingId: contentId("embedding", [objectId, contentId("digest", vector)]),
    spaceId: SPACE_ID,
    spaceVersion: "normalized-mean-v1",
    dimensions: vector.length,
    distance: "cosine",
    objectId,
    ...patch,
  });
}

function resolverFor(entries: ReadonlyMap<string, Availability<readonly number[]>>, calls: EmbeddingReference[] = []): EditorialVectorResolver {
  return {
    async resolve(reference) {
      calls.push(reference);
      const value = entries.get(reference.embeddingId);
      assert.ok(value, `Missing test resolver entry for ${reference.embeddingId}`);
      return value;
    },
  };
}

async function compare(leftVector: readonly number[], rightVector: readonly number[]) {
  const left = referenceFor(leftVector, "object_left"), right = referenceFor(rightVector, "object_right");
  const resolver = resolverFor(new Map([[left.embeddingId, present(leftVector)], [right.embeddingId, present(rightVector)]]));
  return compareEditorialSemantics(left, right, resolver);
}

function similarityOf(comparison: EditorialSemanticComparison): number {
  assert.equal(comparison.similarity.state, "present");
  return comparison.similarity.value;
}

function evidence(pointer: string): EvidenceRef {
  return {
    artifact: {
      objectId: `evidence_${pointer.replace(/\W/g, "_")}`,
      sha256: "a".repeat(64),
      artifactType: "SyntheticReceipt",
      artifactVersion: "1.0.0",
    },
    pointer,
  };
}

test("identical unit vectors have cosine similarity 1", async () => {
  assert.equal(similarityOf(await compare([1, 0], [1, 0])), 1);
});

test("orthogonal unit vectors have cosine similarity 0", async () => {
  assert.equal(similarityOf(await compare([1, 0], [0, 1])), 0);
});

test("opposite unit vectors have cosine similarity -1", async () => {
  assert.equal(similarityOf(await compare([1, 0], [-1, 0])), -1);
});

test("nontrivial unit vectors have a hand-calculable cosine similarity", async () => {
  assert.equal(similarityOf(await compare([0.6, 0.8], [1, 0])), 0.6);
});

test("only the final finite floating-point excursion is clamped to the closed domain", async () => {
  const nearUnit = [1.0000005, 0];
  assert.equal(similarityOf(await compare(nearUnit, nearUnit)), 1);
});

test("left/right swapping preserves similarity without inventing canonical pair identity", async () => {
  const forward = await compare([0.6, 0.8], [1, 0]);
  const reverse = await compare([1, 0], [0.6, 0.8]);
  assert.equal(similarityOf(forward), similarityOf(reverse));
  assert.notDeepEqual(forward.left, reverse.left);
});

test("incompatible spaceId fails before resolver invocation", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right", { spaceId: "space_other" });
  const calls: EmbeddingReference[] = [];
  await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map(), calls)), /space/i);
  assert.equal(calls.length, 0);
});

test("incompatible spaceVersion fails before resolver invocation", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right", { spaceVersion: "normalized-mean-v2" });
  const calls: EmbeddingReference[] = [];
  await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map(), calls)), /space/i);
  assert.equal(calls.length, 0);
});

test("incompatible dimensions fail before resolver invocation", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([1, 0, 0], "object_right");
  const calls: EmbeddingReference[] = [];
  await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map(), calls)), /space/i);
  assert.equal(calls.length, 0);
});

test("a compatible non-cosine space is outside the owned Gate 2 policy", async () => {
  const left = referenceFor([1, 0], "object_left", { distance: "euclidean" });
  const right = referenceFor([0, 1], "object_right", { distance: "euclidean" });
  const calls: EmbeddingReference[] = [];
  await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map(), calls)), /cosine/i);
  assert.equal(calls.length, 0);
});

test("a compatible non-owned spaceVersion is outside the Gate 2 policy", async () => {
  const left = referenceFor([1, 0], "object_left", { spaceVersion: "normalized-mean-v2" });
  const right = referenceFor([0, 1], "object_right", { spaceVersion: "normalized-mean-v2" });
  const calls: EmbeddingReference[] = [];
  await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map(), calls)), /normalized-mean-v1/i);
  assert.equal(calls.length, 0);
});

test("left resolver missing makes comparison unavailable and is never treated as zero", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right");
  const result = await compareEditorialSemantics(left, right, resolverFor(new Map<string, Availability<readonly number[]>>([
    [left.embeddingId, missing("unavailable", "left_missing")],
    [right.embeddingId, present([0, 1])],
  ])));
  assert.deepEqual(result.similarity, missing("unavailable", "semantic_vector_unavailable"));
});

test("right resolver missing makes comparison unavailable", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right");
  const result = await compareEditorialSemantics(left, right, resolverFor(new Map<string, Availability<readonly number[]>>([
    [left.embeddingId, present([1, 0])],
    [right.embeddingId, missing("not_computed", "right_missing")],
  ])));
  assert.equal(result.similarity.state, "unavailable");
});

test("both missing vectors preserve deduplicated evidence from both inputs", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right");
  const shared = evidence("/shared"), leftEvidence = evidence("/left"), rightEvidence = evidence("/right");
  const result = await compareEditorialSemantics(left, right, resolverFor(new Map([
    [left.embeddingId, missing("unavailable", "left_missing", [leftEvidence, shared])],
    [right.embeddingId, missing("failed", "right_failed", [rightEvidence, shared])],
  ])));
  assert.equal(result.similarity.state, "unavailable");
  assert.equal(result.similarity.reasonCode, "semantic_vector_unavailable");
  assert.deepEqual(result.similarity.evidenceRefs, [leftEvidence, rightEvidence, shared]);
});

test("wrong resolved dimension is a hard failure", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right");
  await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map([
    [left.embeddingId, present([1, 0, 0])], [right.embeddingId, present([0, 1])],
  ]))), /dimension/i);
});

test("NaN and Infinity resolved components are hard failures", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right");
  for (const value of [NaN, Infinity]) {
    await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map([
      [left.embeddingId, present([value, 0])], [right.embeddingId, present([0, 1])],
    ]))), /finite/i);
  }
});

test("zero and non-unit resolved vectors fail unit-norm validation", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right");
  for (const invalid of [[0, 0], [2, 0]]) {
    await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map([
      [left.embeddingId, present(invalid)], [right.embeddingId, present([0, 1])],
    ]))), /unit/i);
  }
});

test("resolved vector digest must agree with embeddingId", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right");
  await assert.rejects(compareEditorialSemantics(left, right, resolverFor(new Map([
    [left.embeddingId, present([0, 1])], [right.embeddingId, present([0, 1])],
  ]))), /embeddingId|digest|identity/i);
});

test("comparison serializes references and scalar evidence but no vector arrays", async () => {
  const result = await compare([0.6, 0.8], [1, 0]);
  const json = JSON.stringify(result);
  assert.equal(json.includes('"vector"'), false);
  assert.equal(json.includes("[0.6,0.8]"), false);
  assert.equal(json.includes("[1,0]"), false);
  assert.deepEqual(Object.keys(result).sort(), ["left", "metric", "policyVersion", "right", "similarity"]);
});

test("comparison schema rejects unknown fields and unsupported policy versions", async () => {
  const result = await compare([1, 0], [0, 1]);
  assert.equal(EditorialSemanticComparisonSchema.safeParse({ ...result, winner: "invented" }).success, false);
  assert.equal(EditorialSemanticComparisonSchema.safeParse({ ...result, policyVersion: "owned-cosine-v2" }).success, false);
});

test("resolver is invoked exactly through the injected seam for both supplied references", async () => {
  const left = referenceFor([1, 0], "object_left"), right = referenceFor([0, 1], "object_right"), calls: EmbeddingReference[] = [];
  const resolver = resolverFor(new Map([[left.embeddingId, present([1, 0])], [right.embeddingId, present([0, 1])]]), calls);
  await compareEditorialSemantics(left, right, resolver);
  assert.deepEqual(calls, [left, right]);
});

test("repeated identical inputs produce the same comparison", async () => {
  assert.deepEqual(await compare([0.6, 0.8], [1, 0]), await compare([0.6, 0.8], [1, 0]));
});

test("semantic module has no provider, model, runtime, cache, filesystem or network imports", async () => {
  const path = "packages/editorial/semantic.ts", text = await readFile(path, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) assert.notEqual(node.expression.getText(source), "fetch");
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const specifier of imports) assert.equal(/providers|embeddings|cache|runtime|node:fs|node:net|node:http|node:https/i.test(specifier), false, specifier);
});
