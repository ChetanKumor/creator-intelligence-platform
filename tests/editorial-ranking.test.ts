import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { EditorialArtifactMap, identify, missing, present, type ArtifactRef, type SuppliedArtifact } from "../packages/editorial/common.js";
import { createEditorialCandidateSet } from "../packages/editorial/decision.js";
import {
  EditorialRankingCandidateResultSchema,
  EditorialRankingPredictionSchema,
  createEditorialRankingPrediction,
  scoreTechnicalBaselineCandidate,
  validateEditorialRankingPrediction,
  type EditorialRankingPrediction,
} from "../packages/editorial/ranking.js";
import { resolveEditorialToken, type TokenResolutionInput } from "../packages/editorial/resolve.js";
import { createEditorialToken } from "../packages/editorial/token.js";
import { artifact, tokenFixture } from "./support/editorial.js";

type CandidateSpec = {
  range: { startSeconds: number; endSeconds: number };
  sharpness: number;
  unclipped: number;
  cheapMissing?: boolean;
};

function remapArtifactRefs(value: unknown, refs: ReadonlyMap<string, ArtifactRef>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapArtifactRefs(item, refs));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.objectId === "string" && "sha256" in record && refs.has(record.objectId)) return refs.get(record.objectId);
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, remapArtifactRefs(item, refs)]));
  }
  return value;
}

function rankingFixture(specs: readonly CandidateSpec[]) {
  const supplied: SuppliedArtifact[] = [], tokenArtifacts: SuppliedArtifact[] = [];
  const analysisRefs: ArtifactRef[] = [], runRefs: ArtifactRef[] = [];
  let selectionPolicy: ReturnType<typeof tokenFixture>["policyRef"] | undefined;
  for (const [index, spec] of specs.entries()) {
    const base = tokenFixture(spec.range), analysis = structuredClone(base.analysis);
    analysis.candidates[0]!.signals.sharpnessIndicator = spec.sharpness;
    analysis.candidates[0]!.signals.unclippedPixelFraction = spec.unclipped;
    const local: SuppliedArtifact[] = [], refs = new Map<string, ArtifactRef>();
    for (const item of base.supplied) {
      const value = item.ref.artifactType === "FootageAnalysis" ? analysis : item.value;
      const replacement = artifact(`${item.ref.objectId}_ranking_${index}`, item.ref.artifactType, value, item.ref.artifactVersion);
      refs.set(item.ref.objectId, replacement.ref); local.push(replacement);
    }
    const input = remapArtifactRefs(base.input, refs) as TokenResolutionInput;
    let token = resolveEditorialToken(input, new EditorialArtifactMap(local));
    if (spec.cheapMissing) {
      const { tokenId: _tokenId, ...body } = token;
      token = createEditorialToken({ ...body, cheap: { provenance: body.cheap.provenance, data: missing("unavailable", "cheap_channel_unavailable") } });
    }
    const storedToken = artifact(`object_token_ranking_${index}`, "EditorialToken", token, "0.1.0");
    local.push(storedToken); supplied.push(...local); tokenArtifacts.push(storedToken);
    analysisRefs.push(input.analysis); runRefs.push(input.producingRun.artifact);
    selectionPolicy ??= input.adapter.configuration;
  }
  assert.ok(selectionPolicy);
  const set = createEditorialCandidateSet({
    artifactType: "EditorialCandidateSet", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    projectId: "project_synthetic",
    candidates: tokenArtifacts.map((item) => {
      const token = item.value as ReturnType<typeof tokenFixture>["token"];
      return { candidateId: token.candidate.candidateId, token: item.ref };
    }),
    analysisRefs, runRefs, selectionPolicy, universe: "explicit_subset", sourceRunStatus: "succeeded", failureEvidence: [],
  });
  const setArtifact = artifact("object_set_ranking", "EditorialCandidateSet", set, "0.1.0");
  supplied.push(setArtifact);
  return { supplied, set, setArtifact, map: () => new EditorialArtifactMap(supplied) };
}

function reidentify(value: EditorialRankingPrediction, patch: Partial<EditorialRankingPrediction>): unknown {
  const { predictionId: _predictionId, ...body } = structuredClone({ ...value, ...patch });
  return identify("editorial_ranking_prediction", "predictionId", body);
}

test("technical baseline score is the hand-calculable 0.5/0.5 mean", () => {
  const result = scoreTechnicalBaselineCandidate("candidate_score", present(0.8), present(1));
  assert.deepEqual(result.score, present(0.9));
});

test("present scores rank strictly descending", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.6, unclipped: 0.8 },
    { range: { startSeconds: 2, endSeconds: 3 }, sharpness: 0.2, unclipped: 0.6 },
  ]);
  const prediction = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  assert.deepEqual(prediction.rankedTieGroups.map((group) => group.score), [0.9, 0.7, 0.4]);
});

test("equal scores remain one explicit tie group", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.6, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.8, unclipped: 0.8 },
  ]);
  const prediction = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  assert.equal(prediction.rankedTieGroups.length, 1);
  assert.equal(prediction.rankedTieGroups[0]!.candidateIds.length, 2);
});

test("tie candidate IDs canonicalize lexicographically without creating preference", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.8, unclipped: 0.8 },
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.6, unclipped: 1 },
  ]);
  const group = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map()).rankedTieGroups[0]!;
  assert.deepEqual(group.candidateIds, [...group.candidateIds].sort());
  assert.equal(group.candidateIds.length, 2);
});

test("missing sharpness makes score unavailable rather than zero", () => {
  const absent = missing("unavailable", "sharpness_missing");
  const result = scoreTechnicalBaselineCandidate("candidate_missing_sharpness", absent, present(1));
  assert.deepEqual(result.sharpnessIndicator, absent); assert.equal(result.score.state, "unavailable");
});

test("missing unclipped fraction makes score unavailable rather than zero", () => {
  const absent = missing("not_computed", "unclipped_missing");
  const result = scoreTechnicalBaselineCandidate("candidate_missing_unclipped", present(0.8), absent);
  assert.deepEqual(result.unclippedPixelFraction, absent); assert.equal(result.score.state, "unavailable");
});

test("both required features missing remains explicitly unscored", () => {
  const result = scoreTechnicalBaselineCandidate("candidate_both_missing", missing("unsupported", "sharpness_unsupported"), missing("unavailable", "unclipped_unavailable"));
  assert.equal(result.score.state, "unavailable");
});

test("scored and unscored results exactly partition the supplied candidate set", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.5, unclipped: 1, cheapMissing: true },
  ]);
  const prediction = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  const ranked = prediction.rankedTieGroups.flatMap((group) => group.candidateIds);
  const unscored = prediction.candidateResults.filter((result) => result.score.state !== "present").map((result) => result.candidateId);
  assert.deepEqual([...ranked, ...unscored].sort(), fixture.set.candidates.map((candidate) => candidate.candidateId).sort());
  assert.equal(ranked.some((id) => unscored.includes(id)), false);
});

test("an all-unscored candidate set is legal", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1, cheapMissing: true },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.5, unclipped: 1, cheapMissing: true },
  ]);
  const prediction = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  assert.deepEqual(prediction.rankedTieGroups, []);
  assert.ok(prediction.candidateResults.every((result) => result.score.state === "unavailable"));
});

test("candidate input order does not alter prediction identity or result", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.6, unclipped: 0.8 },
  ]);
  const { candidateSetId: _candidateSetId, ...body } = fixture.set;
  const reordered = createEditorialCandidateSet({ ...body, candidates: [...body.candidates].reverse() });
  assert.deepEqual(reordered, fixture.set);
  const first = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  const second = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  assert.deepEqual(second, first);
});

test("identical inputs reproduce predictionId", () => {
  const fixture = rankingFixture([{ range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 }]);
  assert.equal(createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map()).predictionId, createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map()).predictionId);
});

test("a changed required feature changes prediction identity and result", () => {
  const before = rankingFixture([{ range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 }]);
  const after = rankingFixture([{ range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.6, unclipped: 1 }]);
  const left = createEditorialRankingPrediction(before.setArtifact.ref, before.map()), right = createEditorialRankingPrediction(after.setArtifact.ref, after.map());
  assert.notEqual(left.predictionId, right.predictionId); assert.notDeepEqual(left.candidateResults, right.candidateResults);
});

test("a foreign substituted candidate token fails existing candidate-set validation", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.6, unclipped: 0.8 },
  ]);
  const { candidateSetId: _candidateSetId, ...body } = fixture.set;
  const invalidSet = createEditorialCandidateSet({ ...body, candidates: [{ ...body.candidates[0]!, token: body.candidates[1]!.token }] });
  const stored = artifact("object_invalid_set", "EditorialCandidateSet", invalidSet, "0.1.0");
  assert.throws(() => createEditorialRankingPrediction(stored.ref, new EditorialArtifactMap([...fixture.supplied, stored])), /candidate/i);
});

test("duplicate or omitted candidate results cannot form a valid prediction", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.6, unclipped: 0.8 },
  ]);
  const prediction = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map()), first = prediction.candidateResults[0]!;
  assert.equal(EditorialRankingPredictionSchema.safeParse(reidentify(prediction, { candidateResults: [first, first] })).success, false);
  const omitted = reidentify(prediction, { candidateResults: [first], rankedTieGroups: prediction.rankedTieGroups.filter((group) => group.candidateIds.includes(first.candidateId)) });
  assert.throws(() => validateEditorialRankingPrediction(omitted, fixture.map()), /candidate universe/i);
});

test("malformed rank groups fail validation", () => {
  const fixture = rankingFixture([
    { range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, sharpness: 0.6, unclipped: 0.8 },
  ]);
  const prediction = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  const malformed = reidentify(prediction, { rankedTieGroups: [...prediction.rankedTieGroups].reverse() });
  assert.equal(EditorialRankingPredictionSchema.safeParse(malformed).success, false);
});

test("rank groups cannot contain an unscored candidate", () => {
  const result = scoreTechnicalBaselineCandidate("candidate_unscored", missing("unavailable", "missing"), present(1));
  const fixture = rankingFixture([{ range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1, cheapMissing: true }]);
  const valid = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  const invalid = reidentify(valid, { candidateResults: [{ ...result, candidateId: valid.candidateResults[0]!.candidateId }], rankedTieGroups: [{ score: 0, candidateIds: [valid.candidateResults[0]!.candidateId] }] });
  assert.equal(EditorialRankingPredictionSchema.safeParse(invalid).success, false);
});

test("scores reject NaN, Infinity and values outside [0,1]", () => {
  const base = scoreTechnicalBaselineCandidate("candidate_bounds", present(0.8), present(1));
  for (const value of [NaN, Infinity, -Infinity, -0.01, 1.01]) assert.equal(EditorialRankingCandidateResultSchema.safeParse({ ...base, score: present(value) }).success, false);
});

test("prediction artifact rejects unknown fields and unsupported versions", () => {
  const fixture = rankingFixture([{ range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 }]);
  const prediction = createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map());
  assert.equal(EditorialRankingPredictionSchema.safeParse({ ...prediction, planId: "invented" }).success, false);
  assert.equal(EditorialRankingPredictionSchema.safeParse({ ...prediction, artifactVersion: "0.2.0" }).success, false);
});

test("prediction artifact contains no plan, winner, confidence, judgment, explanation or vectors", () => {
  const fixture = rankingFixture([{ range: { startSeconds: 0, endSeconds: 1 }, sharpness: 0.8, unclipped: 1 }]);
  const json = canonicalSerialize(createEditorialRankingPrediction(fixture.setArtifact.ref, fixture.map()));
  for (const field of ["planId", "slotId", "winnerCandidateId", "confidence", "judgment", "editorExplanation", "vector", "vectors"]) assert.equal(json.includes(`"${field}":`), false, field);
});

test("ranking import closure cannot invoke providers, models or runtime adapters", async () => {
  const allowedPackages = new Set(["zod", "node:crypto"]), seen = new Set<string>();
  async function inspect(path: string) {
    if (seen.has(path)) return; seen.add(path);
    assert.equal(/(?:^|\/)(?:providers|scripts)(?:\/|$)|runtime-adapter/i.test(path), false, path);
    const text = await readFile(path, "utf8"), source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    function visit(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) return;
        const specifier = node.moduleSpecifier.text;
        if (specifier.startsWith(".")) {
          const parts = path.split("/"); parts.pop();
          for (const part of specifier.replace(/\.js$/, ".ts").split("/")) { if (part === "..") parts.pop(); else if (part !== ".") parts.push(part); }
          imports.push(parts.join("/"));
        } else assert.ok(allowedPackages.has(specifier), `${path}: ${specifier}`);
      }
      if (path.startsWith("packages/editorial/")) {
        if (ts.isCallExpression(node)) assert.ok(!/^(fetch|eval|require|import)$/.test(node.expression.getText(source)) && !/\.(embed|analyze|transcribe|spawn|exec|readFile|readdir)\s*$/.test(node.expression.getText(source)), node.getText(source));
        if (ts.isPropertyAccessExpression(node)) assert.ok(!["process.env", "Date.now", "Math.random"].includes(node.getText(source)));
        if (ts.isNewExpression(node)) assert.ok(!["Date", "Function", "Worker"].includes(node.expression.getText(source)));
      }
      ts.forEachChild(node, visit);
    }
    visit(source); for (const dependency of imports) await inspect(dependency);
  }
  await inspect("packages/editorial/ranking.ts");
  assert.ok(seen.size > 1);
});
