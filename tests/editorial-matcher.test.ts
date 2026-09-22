import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { EmbeddingReferenceSchema } from "../packages/contracts/common.js";
import type { EmbeddingReference } from "../packages/domain/index.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { EditorialArtifactMap, identify, missing, present, type ArtifactRef, type Availability, type SuppliedArtifact } from "../packages/editorial/common.js";
import { createEditorialCandidateSet } from "../packages/editorial/decision.js";
import {
  EditorialMatcherV0PredictionSchema,
  EditorialMatcherV0RequestSchema,
  createEditorialMatcherV0Prediction,
  validateEditorialMatcherV0Prediction,
  type EditorialMatcherV0Prediction,
} from "../packages/editorial/matcher.js";
import { createEditorialRankingPrediction } from "../packages/editorial/ranking.js";
import { createEditorialReferenceSemanticRankingPrediction } from "../packages/editorial/reference-ranking.js";
import { resolveEditorialToken, type TokenResolutionInput } from "../packages/editorial/resolve.js";
import { createEditorialToken, type EditorialVectorResolver } from "../packages/editorial/token.js";
import { FootageAnalysisSchema } from "../packages/footage-analyzer/protocol.js";
import { embeddingCacheKey, embeddingSpaceId } from "../packages/reference-analyzer/embeddings.js";
import { contentId } from "../packages/reference-analyzer/features.js";
import { artifact, TIME, tokenFixture } from "./support/editorial.js";

type CandidateSpec = {
  range: { startSeconds: number; endSeconds: number };
  vector: readonly number[];
  sharpness?: number;
  unclipped?: number;
  cheapMissing?: boolean;
  semanticMissing?: boolean;
  embeddingVariant?: boolean;
};

function embedding(vector: readonly number[], objectId: string, spaceId: string): EmbeddingReference {
  return EmbeddingReferenceSchema.parse({
    embeddingId: contentId("embedding", [objectId, contentId("digest", vector)]),
    spaceId,
    spaceVersion: "normalized-mean-v1",
    dimensions: vector.length,
    distance: "cosine",
    objectId,
  });
}

function remapArtifactRefs(value: unknown, refs: ReadonlyMap<string, ArtifactRef>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapArtifactRefs(item, refs));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.objectId === "string" && "sha256" in record && refs.has(record.objectId)) return refs.get(record.objectId);
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, remapArtifactRefs(item, refs)]));
  }
  return value;
}

function candidateFixture(specs: readonly CandidateSpec[]) {
  const supplied: SuppliedArtifact[] = [], tokenArtifacts: SuppliedArtifact[] = [];
  const analysisRefs: ArtifactRef[] = [], runRefs: ArtifactRef[] = [];
  let selectionPolicy: ReturnType<typeof tokenFixture>["policyRef"] | undefined;
  const vectors = new Map<string, Availability<readonly number[]>>();
  for (const [index, spec] of specs.entries()) {
    const base = tokenFixture(spec.range), analysis = structuredClone(base.analysis), run = structuredClone(base.run);
    analysis.candidates[0]!.signals.sharpnessIndicator = spec.sharpness ?? 0.5;
    analysis.candidates[0]!.signals.unclippedPixelFraction = spec.unclipped ?? 1;
    if (spec.embeddingVariant) {
      analysis.configuration.embedding.maxPatches = 512;
      analysis.configurationId = contentId("configuration", analysis.configuration);
      run.configuration = analysis.configuration;
    }
    const spaceId = embeddingSpaceId(analysis.configuration.embedding);
    for (const [frameIndex, frame] of analysis.semanticFrames.entries()) {
      const frameObjectId = embeddingCacheKey(analysis.contentHash, [contentId("sample", ["decoded-png-v1", frame.frameContentHash])], analysis.configuration.embedding, "frame");
      frame.embedding = embedding(frameIndex % 2 ? [0, 1] : [1, 0], frameObjectId, spaceId);
    }
    analysis.inventory.embeddingSpace = analysis.semanticFrames[0]!.embedding;
    const evidence = analysis.candidates[0]!;
    const supporting = evidence.contributingSemanticFrameIds.map((id) => analysis.semanticFrames.find((frame) => frame.sampleId === id)!);
    const objectId = embeddingCacheKey(analysis.contentHash, supporting.map((frame) => frame.embedding.embeddingId), analysis.configuration.embedding, "normalized-mean-v1");
    evidence.semanticEmbedding = embedding(spec.vector, objectId, spaceId);
    evidence.aggregationId = contentId("aggregation", [evidence.candidate, supporting.map((frame) => frame.embedding), evidence.contributingMeasurementIds, evidence.aggregationVersion]);
    vectors.set(evidence.semanticEmbedding.embeddingId, present(spec.vector));
    const parsedAnalysis = FootageAnalysisSchema.parse(analysis);
    const local: SuppliedArtifact[] = [], refs = new Map<string, ArtifactRef>();
    for (const item of base.supplied) {
      const value = item.ref.artifactType === "FootageAnalysis" ? parsedAnalysis : item.ref.artifactType === "FootageRun" ? run : item.value;
      const replacement = artifact(`${item.ref.objectId}_matcher_${index}`, item.ref.artifactType, value, item.ref.artifactVersion);
      refs.set(item.ref.objectId, replacement.ref); local.push(replacement);
    }
    const input = remapArtifactRefs(base.input, refs) as TokenResolutionInput;
    let token = resolveEditorialToken(input, new EditorialArtifactMap(local));
    if (spec.cheapMissing || spec.semanticMissing) {
      const { tokenId: _tokenId, ...body } = token;
      token = createEditorialToken({
        ...body,
        cheap: spec.cheapMissing ? { provenance: body.cheap.provenance, data: missing("unavailable", "cheap_channel_unavailable") } : body.cheap,
        semantic: spec.semanticMissing ? { provenance: body.semantic.provenance, data: missing("unavailable", "candidate_semantic_source_missing", [body.candidateEvidence]) } : body.semantic,
      });
    }
    const storedToken = artifact(`object_token_matcher_${index}`, "EditorialToken", token, "0.1.0");
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
  const setArtifact = artifact("object_set_matcher", "EditorialCandidateSet", set, "0.1.0");
  supplied.push(setArtifact);
  return { supplied, set, setArtifact, vectors };
}

function referenceFixture(vectorsInput: readonly (readonly number[] | null)[] = [[1, 0], [0, 1]]) {
  const hash = "b".repeat(64), assetId = `asset_${hash}`;
  const embeddingConfig = tokenFixture().analysis.configuration.embedding, spaceId = embeddingSpaceId(embeddingConfig);
  const references = vectorsInput.map((vector, index) => vector === null ? null : embedding(vector, `reference_object_${index}`, spaceId));
  const analysisReferences = vectorsInput.map((vector, index) => embedding(vector ?? [1, 0], `reference_object_${index}`, spaceId));
  const shots = references.map((reference, index) => ({
    shotId: `reference_shot_${index}`, sourceRange: { startSeconds: index, endSeconds: index + 1 }, role: "hook" as const,
    transitionOut: { type: "cut" as const }, shotType: "unknown" as const, subjectCount: null,
    motion: { camera: "unknown" as const, subject: "unknown" as const }, composition: { framing: "unknown" as const, subjectPosition: "unknown" as const },
    quality: { sharpness: null, exposure: null, stability: null }, semantics: { description: "", tags: [] as string[] }, semanticEmbedding: reference,
  }));
  const fingerprint = {
    contractType: "ReferenceFingerprint" as const, schemaVersion: "1.1.0" as const, fingerprintId: "reference_fingerprint_synthetic",
    assetId, durationSeconds: vectorsInput.length, fps: { numerator: 30, denominator: 1 }, aspectRatio: { width: 16, height: 9 }, shots,
    structure: [], pacing: { averageShotLengthSeconds: 1, shotsPerSecond: 1, trend: "steady" as const }, audioFingerprintId: null,
    captions: { density: "none" as const, position: "lower" as const, styleHint: "clean" as const }, style: { family: null, category: "other" as const, energy: null },
    provenance: { producer: "reference_analyzer", producerVersion: "0.1.0", modelRunIds: ["reference_model_run"], createdAt: TIME },
  };
  const batchShots = analysisReferences.map((reference, index) => ({ shotId: `reference_shot_${index}`, reference }));
  const config = { detector: { kind: "content" as const, threshold: 27, minSceneFrames: 2, adaptiveThreshold: 3 }, embedding: embeddingConfig, analyzerVersion: "0.1.0" };
  const analysis = {
    artifactType: "ReferenceAnalysis", artifactVersion: "1.0.0", identity: { contentHash: hash, sizeBytes: 1, assetId },
    authorization: { manifestType: "AuthorizedReference" as const, schemaVersion: "1.0.0" as const, contentHash: hash, sizeBytes: 1, sourceType: "synthetic" as const, authorizationBasis: "synthetic_generated" as const, allowedPurposes: ["local_reference_analysis", "local_evaluation"] as const, dateAdded: TIME, creatorId: "creator_synthetic", projectId: "project_synthetic" },
    config, configurationId: contentId("configuration", config), embeddingBatch: { shots: batchShots, model: embeddingConfig, batchId: contentId("batch", batchShots) },
  };
  const fingerprintArtifact = artifact("object_reference_fingerprint_matcher", "ReferenceFingerprint", fingerprint, "1.1.0");
  const analysisArtifact = artifact("object_reference_analysis_matcher", "ReferenceAnalysis", analysis, "1.0.0");
  const vectors = new Map<string, Availability<readonly number[]>>();
  references.forEach((reference, index) => { const vector = vectorsInput[index]; if (reference && vector) vectors.set(reference.embeddingId, present(vector)); });
  return { fingerprintArtifact, analysisArtifact, vectors };
}

function fixture(specs: readonly CandidateSpec[], referenceVectors?: readonly (readonly number[] | null)[]) {
  const candidates = candidateFixture(specs), reference = referenceFixture(referenceVectors);
  const supplied = [...candidates.supplied, reference.fingerprintArtifact, reference.analysisArtifact];
  return { ...candidates, reference, supplied, map: () => new EditorialArtifactMap(supplied) };
}

function resolverFor(value: ReturnType<typeof fixture>, calls: EmbeddingReference[] = [], patch = new Map<string, Availability<readonly number[]>>): EditorialVectorResolver {
  const entries = new Map([...value.vectors, ...value.reference.vectors, ...patch]);
  return { async resolve(reference) { calls.push(reference); const vector = entries.get(reference.embeddingId); assert.ok(vector, `Missing resolver fixture ${reference.embeddingId}`); return vector; } };
}

function technicalRequest(value: ReturnType<typeof fixture>) {
  return { mode: "technical_baseline" as const, candidateSet: value.setArtifact.ref };
}

function referenceRequest(value: ReturnType<typeof fixture>) {
  return { mode: "reference_semantic" as const, candidateSet: value.setArtifact.ref, referenceFingerprint: value.reference.fingerprintArtifact.ref, referenceAnalysis: value.reference.analysisArtifact.ref, referenceShotId: "reference_shot_0" };
}

function reidentify(value: EditorialMatcherV0Prediction, patch: Partial<EditorialMatcherV0Prediction>): unknown {
  const { predictionId: _predictionId, ...body } = structuredClone({ ...value, ...patch });
  return identify("editorial_matcher_v0_prediction", "predictionId", body);
}

test("technical mode delegates exactly to Gate 1 and never invokes the vector resolver", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], sharpness: 0.8, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1], sharpness: 0.6, unclipped: 0.8, semanticMissing: true },
  ]);
  let calls = 0;
  const resolver: EditorialVectorResolver = { async resolve() { calls += 1; throw new Error("technical mode touched semantic vectors"); } };
  const direct = createEditorialRankingPrediction(value.setArtifact.ref, value.map());
  const result = await createEditorialMatcherV0Prediction(technicalRequest(value), value.map(), resolver);
  assert.equal(result.mode, "technical_baseline");
  assert.deepEqual(result.ranking, direct);
  assert.equal(calls, 0);
  assert.deepEqual(result.ranking.candidateResults.map((candidate) => candidate.candidateId), value.set.candidates.map((candidate) => candidate.candidateId));
});

test("reference mode delegates exactly to Gate 3 and preserves raw cosine, ties and locality", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [-1, 0], sharpness: 1, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1], sharpness: 0.2, unclipped: 0.2 },
    { range: { startSeconds: 2.5, endSeconds: 3 }, vector: [0, -1], sharpness: 0.9, unclipped: 0.9 },
  ]);
  const direct = await createEditorialReferenceSemanticRankingPrediction(referenceRequest(value), value.map(), resolverFor(value));
  const result = await createEditorialMatcherV0Prediction(referenceRequest(value), value.map(), resolverFor(value));
  assert.equal(result.mode, "reference_semantic");
  assert.deepEqual(result.ranking, direct);
  assert.deepEqual(result.ranking.rankedTieGroups.map((group) => group.score), [0, -1]);
  assert.equal(result.ranking.rankedTieGroups[0]!.candidateIds.length, 2);
  assert.deepEqual(result.ranking.candidateResults.map((candidate) => candidate.semantic.state === "present" ? candidate.semantic.value.locality.support : null).sort(), ["same_shot_context", "same_shot_context", "within_segment"]);
  assert.deepEqual(result.ranking.candidateResults.map((candidate) => candidate.candidateId), value.set.candidates.map((candidate) => candidate.candidateId));
});

test("identical inputs are deterministic and the two explicit modes have distinct prediction IDs", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  const technicalA = await createEditorialMatcherV0Prediction(technicalRequest(value), value.map());
  const technicalB = await createEditorialMatcherV0Prediction(technicalRequest(value), value.map());
  const referenceA = await createEditorialMatcherV0Prediction(referenceRequest(value), value.map(), resolverFor(value));
  const referenceB = await createEditorialMatcherV0Prediction(referenceRequest(value), value.map(), resolverFor(value));
  assert.equal(technicalA.predictionId, technicalB.predictionId);
  assert.equal(referenceA.predictionId, referenceB.predictionId);
  assert.notEqual(technicalA.predictionId, referenceA.predictionId);
});

test("request schemas enforce caller-selected mode inputs with no audio or unknown fields", () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  assert.equal(EditorialMatcherV0RequestSchema.safeParse({ ...technicalRequest(value), referenceFingerprint: value.reference.fingerprintArtifact.ref }).success, false);
  assert.equal(EditorialMatcherV0RequestSchema.safeParse({ mode: "reference_semantic", candidateSet: value.setArtifact.ref }).success, false);
  assert.equal(EditorialMatcherV0RequestSchema.safeParse({ ...referenceRequest(value), audio: { invented: true } }).success, false);
  assert.equal(EditorialMatcherV0RequestSchema.safeParse({ mode: "automatic", candidateSet: value.setArtifact.ref }).success, false);
});

test("reference null and missing evidence stay all-unscored without technical fallback", async () => {
  const nullTarget = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], sharpness: 1, unclipped: 1 },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1], sharpness: 1, unclipped: 1 },
  ], [null, [0, 1]]);
  const nullResult = await createEditorialMatcherV0Prediction(referenceRequest(nullTarget), nullTarget.map(), resolverFor(nullTarget));
  assert.equal(nullResult.mode, "reference_semantic");
  assert.ok(nullResult.ranking.candidateResults.every((candidate) => candidate.similarity.state === "unavailable"));
  assert.deepEqual(nullResult.ranking.rankedTieGroups, []);

  const missingCandidate = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], sharpness: 1, unclipped: 1, semanticMissing: true }]);
  const missingResult = await createEditorialMatcherV0Prediction(referenceRequest(missingCandidate), missingCandidate.map(), resolverFor(missingCandidate));
  assert.equal(missingResult.mode, "reference_semantic");
  assert.equal(missingResult.ranking.candidateResults[0]!.similarity.state, "unavailable");
  assert.deepEqual(missingResult.ranking.rankedTieGroups, []);
  assert.equal(canonicalSerialize(missingResult).includes("technical_baseline"), false);
});

test("unavailable resolver evidence is retained and incompatible spaces hard fail through Gate 3/Gate 2", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  const candidateEmbeddingId = [...value.vectors.keys()][0]!;
  const evidence = { artifact: value.setArtifact.ref, pointer: "/candidates/0" };
  const unavailable = await createEditorialMatcherV0Prediction(referenceRequest(value), value.map(), resolverFor(value, [], new Map([[candidateEmbeddingId, missing("unavailable", "vector_absent", [evidence])]])));
  assert.equal(unavailable.mode, "reference_semantic");
  assert.deepEqual(unavailable.ranking.candidateResults[0]!.similarity, missing("unavailable", "semantic_vector_unavailable", [evidence]));
  assert.deepEqual(unavailable.ranking.rankedTieGroups, []);

  const incompatible = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], embeddingVariant: true }]);
  await assert.rejects(createEditorialMatcherV0Prediction(referenceRequest(incompatible), incompatible.map(), resolverFor(incompatible)), /space/i);
});

test("technical missingness remains exact Gate 1 missingness", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], cheapMissing: true }]);
  const direct = createEditorialRankingPrediction(value.setArtifact.ref, value.map());
  const result = await createEditorialMatcherV0Prediction(technicalRequest(value), value.map());
  assert.deepEqual(result.ranking, direct);
  assert.equal(result.ranking.candidateResults[0]!.score.state, "unavailable");
});

test("matcher artifact has no fusion, weights, vectors, audio, planning or decision outcome payload", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  const result = await createEditorialMatcherV0Prediction(referenceRequest(value), value.map(), resolverFor(value));
  const json = canonicalSerialize(result);
  for (const field of ["combinedScore", "compositeScore", "weight", "weights", "vector", "vectors", "audio", "planId", "slotId", "winner", "winnerCandidateId", "confidence", "judgment", "editorExplanation"]) {
    assert.equal(json.includes(`\"${field}\":`), false, field);
  }
  assert.deepEqual(Object.keys(result).sort(), ["artifactType", "artifactVersion", "candidateSet", "dispatchPolicy", "matcherVersion", "mode", "predictionId", "projectId", "ranking", "stability", "task"]);
});

test("validation recomputes the exact nested Gate 1 and Gate 3 predictions", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  const technical = await createEditorialMatcherV0Prediction(technicalRequest(value), value.map());
  assert.equal(technical.mode, "technical_baseline");
  const { predictionId: _technicalRankingId, ...technicalRankingBody } = structuredClone(technical.ranking);
  technicalRankingBody.candidateResults[0]!.sharpnessIndicator = present(0);
  technicalRankingBody.candidateResults[0]!.unclippedPixelFraction = present(0);
  technicalRankingBody.candidateResults[0]!.score = present(0);
  technicalRankingBody.rankedTieGroups = [{ score: 0, candidateIds: [technicalRankingBody.candidateResults[0]!.candidateId] }];
  const tamperedTechnical = reidentify(technical, { ranking: identify("editorial_ranking_prediction", "predictionId", technicalRankingBody) });
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse(tamperedTechnical).success, true);
  await assert.rejects(validateEditorialMatcherV0Prediction(tamperedTechnical, value.map()), /ranking|contradict|score|evidence/i);

  const reference = await createEditorialMatcherV0Prediction(referenceRequest(value), value.map(), resolverFor(value));
  assert.equal(reference.mode, "reference_semantic");
  const { predictionId: _referenceRankingId, ...referenceRankingBody } = structuredClone(reference.ranking);
  referenceRankingBody.candidateResults[0]!.similarity = present(0);
  referenceRankingBody.rankedTieGroups = [{ score: 0, candidateIds: [referenceRankingBody.candidateResults[0]!.candidateId] }];
  const tamperedReference = reidentify(reference, { ranking: identify("editorial_reference_semantic_ranking_prediction", "predictionId", referenceRankingBody) });
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse(tamperedReference).success, true);
  await assert.rejects(validateEditorialMatcherV0Prediction(tamperedReference, value.map(), resolverFor(value)), /ranking|contradict|similarity|evidence/i);
});

test("tampered mode, candidate set, project, policy, identity and unknown fields fail", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  const result = await createEditorialMatcherV0Prediction(referenceRequest(value), value.map(), resolverFor(value));
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse({ ...result, mode: "technical_baseline" }).success, false);
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse(reidentify(result, { projectId: "project_tampered" })).success, false);
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse(reidentify(result, { candidateSet: { ...result.candidateSet, objectId: "object_tampered" } })).success, false);
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse(reidentify(result, { dispatchPolicy: { kind: "rule", name: "automatic", version: "0.1.0" } as unknown as typeof result.dispatchPolicy })).success, false);
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse({ ...result, predictionId: "prediction_tampered" }).success, false);
  assert.equal(EditorialMatcherV0PredictionSchema.safeParse({ ...result, audio: null }).success, false);
});

test("public seams and accepted Gate 1-3 sources remain byte-identical", async () => {
  const expected = new Map<string, string>([
    ["packages/providers/index.ts", "ab997b4d4820c0c573e4d35b5f0d2db25c10e374df1bf7350148339de5845d33"],
    ["packages/contracts/events.ts", "9d8c09ea88de03aec5a7dcdc337fd3153d46434c3c23f86816e2ab120a2abb3b"],
    ["packages/contracts/creative.ts", "c7e4fc7228d8af1286f7dbdf70f7cb110910c64d0b03ba508b5e4228791e22f6"],
    ["packages/contracts/reference-v11.ts", "a38723c81191e027409804d3405d49874b4f43c38dcd374f2bf5f0dca452625f"],
    ["packages/contracts/audio.ts", "aafb21fbe5f78e42c237b1e8d0ad15df59c9dd76ed31994efb2902655911694a"],
    ["packages/editorial/ranking.ts", "3110da8f0c48142e6ffa0a6e019b40e7e8b8dcbaa10d9d3dd0c16ca7bea67262"],
    ["packages/editorial/semantic.ts", "230e39e10d03d079d6d7becfec379bb4cde6254cd8cc873b050dde75270c4f0b"],
    ["packages/editorial/reference-ranking.ts", "23a4e68e93ef90a479f918cd5b42d884f7aacecbcebf45719b92729ddaa23060"],
  ]);
  for (const [path, digest] of expected) assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), digest, path);
  const providers = await readFile("packages/providers/index.ts", "utf8");
  assert.match(providers, /export interface MatchingRequest/);
  assert.match(providers, /interface Matcher \{ rank\(request: MatchingRequest/);
});

test("matcher module is an internal pure dispatcher and reference_style_compatibility stays reserved", async () => {
  const path = "packages/editorial/matcher.ts", sourceText = await readFile(path, "utf8"), source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const specifier of imports) assert.equal(/providers|models|node:fs|node:net|node:http|node:https|audio/i.test(specifier), false, specifier);
  for (const forbidden of ["DecisionEventSchema", "planId", "slotId", "winnerCandidateId", "confidence", "reference_style_compatibility", "0.5 *", "fallback"]) assert.equal(sourceText.includes(forbidden), false, forbidden);
  assert.match(sourceText, /createEditorialRankingPrediction/);
  assert.match(sourceText, /createEditorialReferenceSemanticRankingPrediction/);
  const taxonomy = await readFile("packages/editorial/taxonomy.ts", "utf8");
  assert.match(taxonomy, /taskId: "reference_style_compatibility"/);
  assert.match(taxonomy, /t\.taskId === "reference_style_compatibility" \? "reserved"/);
});
