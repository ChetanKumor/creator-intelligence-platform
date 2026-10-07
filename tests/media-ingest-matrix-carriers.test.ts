// B2-A2 owner clarification: synthetic fact shapes test evidence carriers, never pixel transforms.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CanonicalMediaFactsSchema, planCanonicalizationV1 } from "../packages/media-ingest/index.js";
import { D4_ELEMENTS, MATRICES, withVideo, type Json } from "./support/canonical-facts.js";

const frameSide = { carrier: "frame", kind: "display_matrix", seiUuid: null };
function observed(matrix: readonly number[], change?: (e: { observation: string; stream: number[][]; frames: number[][][] }) => void, patch: Json = {}) {
  const evidence = { observation: "ffprobe_9_0_1_threads_1_matrix_carriers_v1", stream: [[...matrix]],
    frames: Array.from({ length: 60 }, () => [[...matrix]]) };
  change?.(evidence);
  return withVideo({ displayMatrix: { state: "present", coefficients: [...matrix] }, sideData: [frameSide], displayMatrixCarriers: evidence, ...patch });
}
test("A2-G01 every D4 plus identical propagated carriers is one deferred semantic transform", () => {
  for (const name of D4_ELEMENTS) {
    const facts = observed(MATRICES[name]);
    assert.ok(CanonicalMediaFactsSchema.safeParse(facts).success);
    const result = planCanonicalizationV1(facts);
    assert.equal(result.outcome, "DEFER", name);
    assert.deepEqual(result.evaluation.findings.map(f => f.code), ["display_d4_non_identity"]);
  }
});
test("A2-G02 identical identity carriers alone do not reject identity", () => {
  assert.equal(planCanonicalizationV1(observed(MATRICES.identity)).outcome, "DIRECT");
});
test("A2-G03 frame-only D4 stays refused", () => {
  assert.equal(planCanonicalizationV1(observed(MATRICES.mirror_vertical, e => { e.stream = []; }, { displayMatrix: { state: "absent" } })).outcome, "REFUSE");
});
test("A2-G04 one differing frame is refused", () => {
  assert.equal(planCanonicalizationV1(observed(MATRICES.mirror_vertical, e => { e.frames[31] = [[...MATRICES.identity]]; })).outcome, "REFUSE");
});
test("A2-G05 varying frames are refused", () => {
  assert.equal(planCanonicalizationV1(observed(MATRICES.mirror_vertical, e => { e.frames[12] = [[...MATRICES.rotate_180]]; e.frames[23] = [[...MATRICES.identity]]; })).outcome, "REFUSE");
});
test("A2-G06 propagated non-D4 matrices remain refused", () => {
  for (const name of ["translate", "scale2x1", "scale2x2", "shear", "perspective", "wNotUnit", "rotate45", "rotate90Translate"] as const) {
    assert.equal(planCanonicalizationV1(observed(MATRICES[name])).outcome, "REFUSE", name);
  }
});
test("A2-G07 zero-degree vertical flip is nonidentity and never DIRECT", () => {
  assert.equal(planCanonicalizationV1(observed(MATRICES.mirror_vertical)).outcome, "DEFER");
});
test("A2-G08 absent, incomplete, duplicate, unpinned and conflicting carrier evidence refuses", () => {
  const cases = [observed(MATRICES.identity, e => { e.frames.pop(); }), observed(MATRICES.identity, e => { e.frames[19] = []; }),
    observed(MATRICES.identity, e => { e.frames[19]!.push([...MATRICES.identity]); }),
    observed(MATRICES.identity, e => { e.stream.push([...MATRICES.identity]); }),
    observed(MATRICES.identity, e => { e.stream[0] = [...MATRICES.mirror_vertical]; }),
    observed(MATRICES.identity, e => { e.observation = "auto_threads"; }),
    observed(MATRICES.identity, undefined, { frameCropping: { state: "present", top: 0, bottom: 0, left: 0, right: 0 } }),
    observed(MATRICES.identity, undefined, { sideData: [frameSide, { carrier: "frame", kind: "unknown", seiUuid: null }] }),
    withVideo({ displayMatrix: { state: "present", coefficients: MATRICES.identity }, sideData: [frameSide] })];
  for (const value of cases) assert.equal(planCanonicalizationV1(value).outcome, "REFUSE");
});
test("A2-G09 carrier observations cannot be hidden by omitting the side-data classification", () => {
  assert.equal(planCanonicalizationV1(observed(MATRICES.identity, undefined, { sideData: [] })).outcome, "REFUSE");
});
