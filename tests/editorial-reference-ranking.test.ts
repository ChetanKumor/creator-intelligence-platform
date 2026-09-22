import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { EmbeddingReferenceSchema } from "../packages/contracts/common.js";
import type { EmbeddingReference } from "../packages/domain/index.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { EditorialArtifactMap, identify, missing, present, type ArtifactRef, type Availability, type SuppliedArtifact } from "../packages/editorial/common.js";
import { createEditorialCandidateSet } from "../packages/editorial/decision.js";
import {
  EditorialReferenceSemanticRankingPredictionSchema,
  createEditorialReferenceSemanticRankingPrediction,
  validateEditorialReferenceSemanticRankingPrediction,
  type EditorialReferenceSemanticRankingPrediction,
} from "../packages/editorial/reference-ranking.js";
import { resolveEditorialToken, type TokenResolutionInput } from "../packages/editorial/resolve.js";
import { createEditorialToken, type EditorialVectorResolver } from "../packages/editorial/token.js";
import { FootageAnalysisSchema } from "../packages/footage-analyzer/protocol.js";
import { embeddingCacheKey, embeddingSpaceId } from "../packages/reference-analyzer/embeddings.js";
import { contentId } from "../packages/reference-analyzer/features.js";
import { artifact, TIME, tokenFixture } from "./support/editorial.js";

type CandidateSpec = {
  range: { startSeconds: number; endSeconds: number };
  vector: readonly number[];
  semanticMissing?: boolean;
  semanticMissingState?: "unavailable" | "failed";
  localEvaluation?: boolean;
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
    if (spec.embeddingVariant) {
      analysis.configuration.embedding.maxPatches = 512;
      analysis.configurationId = contentId("configuration", analysis.configuration);
      run.configuration = analysis.configuration;
    }
    if (spec.localEvaluation === false) analysis.authorization.allowedPurposes = ["local_footage_analysis"];
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
      const replacement = artifact(`${item.ref.objectId}_reference_ranking_${index}`, item.ref.artifactType, value, item.ref.artifactVersion);
      refs.set(item.ref.objectId, replacement.ref); local.push(replacement);
    }
    const input = remapArtifactRefs(base.input, refs) as TokenResolutionInput;
    let token = resolveEditorialToken(input, new EditorialArtifactMap(local));
    if (spec.semanticMissing || spec.semanticMissingState) {
      const { tokenId: _tokenId, ...body } = token;
      const state = spec.semanticMissingState ?? "unavailable";
      const reasonCode = state === "failed"
        ? "candidate_semantic_source_failed"
        : "candidate_semantic_source_missing";
      token = createEditorialToken({
        ...body,
        semantic: {
          provenance: body.semantic.provenance,
          data: missing(state, reasonCode, [body.candidateEvidence]),
        },
      });
    }
    const storedToken = artifact(`object_token_reference_ranking_${index}`, "EditorialToken", token, "0.1.0");
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
  const setArtifact = artifact("object_set_reference_ranking", "EditorialCandidateSet", set, "0.1.0");
  supplied.push(setArtifact);
  return { supplied, set, setArtifact, vectors };
}

function referenceFixture(options: {
  vectors?: readonly (readonly number[] | null)[];
  allowedPurposes?: readonly ("local_reference_analysis" | "local_evaluation")[];
  projectId?: string;
  creatorId?: string;
  fingerprintVersion?: "1.0.0" | "1.1.0";
  batchMode?: "normal" | "missing_second" | "duplicate_first";
  batchId?: string;
  fingerprintAssetId?: string;
  batchReferencePatch?: Partial<EmbeddingReference>;
  targetReferencePatch?: Partial<EmbeddingReference>;
} = {}) {
  const vectorInputs = options.vectors ?? [[1, 0], [0, 1]], hash = "b".repeat(64), assetId = `asset_${hash}`;
  const embeddingConfig = tokenFixture().analysis.configuration.embedding, spaceId = embeddingSpaceId(embeddingConfig);
  const references = vectorInputs.map((vector, index) => vector === null ? null : { ...embedding(vector, `reference_object_${index}`, spaceId), ...(index === 0 ? options.targetReferencePatch : {}) });
  const analysisReferences = vectorInputs.map((vector, index) => ({ ...embedding(vector ?? [1, 0], `reference_object_${index}`, spaceId), ...(index === 0 ? options.targetReferencePatch : {}) }));
  const shot = (index: number) => ({
    shotId: `reference_shot_${index}`, sourceRange: { startSeconds: index, endSeconds: index + 1 }, role: "hook" as const,
    transitionOut: { type: "cut" as const }, shotType: "unknown" as const, subjectCount: null,
    motion: { camera: "unknown" as const, subject: "unknown" as const }, composition: { framing: "unknown" as const, subjectPosition: "unknown" as const },
    quality: { sharpness: null, exposure: null, stability: null }, semantics: { description: "", tags: [] as string[] }, semanticEmbedding: references[index],
  });
  const v11 = {
    contractType: "ReferenceFingerprint" as const, schemaVersion: "1.1.0" as const, fingerprintId: "reference_fingerprint_synthetic",
    assetId: options.fingerprintAssetId ?? assetId, durationSeconds: 2, fps: { numerator: 30, denominator: 1 }, aspectRatio: { width: 16, height: 9 },
    shots: [shot(0), shot(1)], structure: [], pacing: { averageShotLengthSeconds: 1, shotsPerSecond: 1, trend: "steady" as const },
    audioFingerprintId: null, captions: { density: "none" as const, position: "lower" as const, styleHint: "clean" as const },
    style: { family: null, category: "other" as const, energy: null },
    provenance: { producer: "reference_analyzer", producerVersion: "0.1.0", modelRunIds: ["reference_model_run"], createdAt: TIME },
  };
  const fingerprint: unknown = options.fingerprintVersion === "1.0.0"
    ? { ...v11, schemaVersion: "1.0.0", shots: v11.shots.map(({ semanticEmbedding: _semanticEmbedding, ...value }) => value) }
    : v11;
  let batchShots = analysisReferences.map((reference, index) => ({ shotId: `reference_shot_${index}`, reference: { ...reference, ...(index === 0 ? options.batchReferencePatch : {}) } }));
  if (options.batchMode === "missing_second") batchShots = batchShots.slice(0, 1);
  if (options.batchMode === "duplicate_first") batchShots = [batchShots[0]!, batchShots[0]!];
  const config = { detector: { kind: "content" as const, threshold: 27, minSceneFrames: 2, adaptiveThreshold: 3 }, embedding: embeddingConfig, analyzerVersion: "0.1.0" };
  const authorization = {
    manifestType: "AuthorizedReference" as const, schemaVersion: "1.0.0" as const, contentHash: hash, sizeBytes: 1,
    sourceType: "synthetic" as const, authorizationBasis: "synthetic_generated" as const,
    allowedPurposes: options.allowedPurposes ?? ["local_reference_analysis", "local_evaluation"], dateAdded: TIME,
    creatorId: options.creatorId ?? "creator_synthetic", projectId: options.projectId ?? "project_synthetic",
  };
  const analysis = {
    artifactType: "ReferenceAnalysis", artifactVersion: "1.0.0", identity: { contentHash: hash, sizeBytes: 1, assetId }, authorization,
    config, configurationId: contentId("configuration", config),
    embeddingBatch: { shots: batchShots, model: embeddingConfig, batchId: options.batchId ?? contentId("batch", batchShots) },
  };
  const fingerprintArtifact = artifact("object_reference_fingerprint", "ReferenceFingerprint", fingerprint, options.fingerprintVersion ?? "1.1.0");
  const analysisArtifact = artifact("object_reference_analysis", "ReferenceAnalysis", analysis, "1.0.0");
  const vectors = new Map<string, Availability<readonly number[]>>();
  references.forEach((reference, index) => { const vector = vectorInputs[index]; if (reference && vector) vectors.set(reference.embeddingId, present(vector)); });
  return { fingerprint, analysis, fingerprintArtifact, analysisArtifact, references, vectors };
}

function fixture(candidateSpecs: readonly CandidateSpec[], referenceOptions: Parameters<typeof referenceFixture>[0] = {}) {
  const candidates = candidateFixture(candidateSpecs), reference = referenceFixture(referenceOptions);
  const supplied = [...candidates.supplied, reference.fingerprintArtifact, reference.analysisArtifact];
  return { ...candidates, reference, map: () => new EditorialArtifactMap(supplied), supplied };
}

function resolverFor(entries: ReadonlyMap<string, Availability<readonly number[]>>, calls: EmbeddingReference[] = []): EditorialVectorResolver {
  return { async resolve(reference) { calls.push(reference); const value = entries.get(reference.embeddingId); assert.ok(value, `Missing resolver fixture ${reference.embeddingId}`); return value; } };
}

function combinedResolver(value: ReturnType<typeof fixture>, calls: EmbeddingReference[] = [], patch = new Map<string, Availability<readonly number[]>>()) {
  return resolverFor(new Map([...value.vectors, ...value.reference.vectors, ...patch]), calls);
}

function input(value: ReturnType<typeof fixture>, shotId = "reference_shot_0") {
  return { candidateSet: value.setArtifact.ref, referenceFingerprint: value.reference.fingerprintArtifact.ref, referenceAnalysis: value.reference.analysisArtifact.ref, referenceShotId: shotId };
}

async function prediction(value: ReturnType<typeof fixture>, shotId = "reference_shot_0", calls: EmbeddingReference[] = []) {
  return createEditorialReferenceSemanticRankingPrediction(input(value, shotId), value.map(), combinedResolver(value, calls));
}

function reidentify(value: EditorialReferenceSemanticRankingPrediction, patch: Partial<EditorialReferenceSemanticRankingPrediction>): unknown {
  const { predictionId: _predictionId, ...body } = structuredClone({ ...value, ...patch });
  return identify("editorial_reference_semantic_ranking_prediction", "predictionId", body);
}

test("explicit [1,0] target ranks identical above orthogonal and preserves raw 1 > 0 > -1", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1] },
    { range: { startSeconds: 2, endSeconds: 3 }, vector: [-1, 0] },
  ]);
  const result = await prediction(value);
  assert.deepEqual(result.rankedTieGroups.map((group) => group.score), [1, 0, -1]);
  assert.deepEqual(result.candidateResults.map((candidate) => candidate.similarity.state === "present" ? candidate.similarity.value : null).sort((a, b) => b! - a!), [1, 0, -1]);
  assert.equal(canonicalSerialize(result).includes("0.5"), false);
});

test("equal raw cosines stay in one explicit lexical-only tie group", async () => {
  const value = fixture([
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1] },
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [0, -1] },
  ]);
  const result = await prediction(value);
  assert.equal(result.rankedTieGroups.length, 1);
  assert.equal(result.rankedTieGroups[0]!.score, 0);
  assert.deepEqual(result.rankedTieGroups[0]!.candidateIds, [...result.rankedTieGroups[0]!.candidateIds].sort());
});

test("raw negative cosine remains negative and is never remapped", async () => {
  const result = await prediction(fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [-1, 0] }]));
  assert.deepEqual(result.candidateResults[0]!.similarity, present(-1));
  assert.equal(result.rankedTieGroups[0]!.score, -1);
});

test("candidate input order canonicalizes and repeated identical input reproduces predictionId", async () => {
  const value = fixture([
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1] },
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] },
  ]);
  const first = await prediction(value), second = await prediction(value);
  const { candidateSetId: _candidateSetId, ...body } = value.set;
  const reordered = createEditorialCandidateSet({ ...body, candidates: [...body.candidates].reverse() });
  assert.deepEqual(reordered, value.set);
  assert.deepEqual(second, first); assert.equal(second.predictionId, first.predictionId);
});

test("changing the explicit reference shot changes target, ranking and identity", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1] },
  ]);
  const first = await prediction(value, "reference_shot_0"), second = await prediction(value, "reference_shot_1");
  assert.notDeepEqual(first.referenceTarget, second.referenceTarget);
  assert.notDeepEqual(first.rankedTieGroups, second.rankedTieGroups);
  assert.notEqual(first.predictionId, second.predictionId);
});

test("unknown reference shot and ReferenceFingerprint 1.0.0 fail", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  await assert.rejects(prediction(value, "reference_shot_unknown"), /shot/i);
  const legacy = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { fingerprintVersion: "1.0.0" });
  await assert.rejects(prediction(legacy), /1\.1\.0|fingerprint/i);
});

test("null selected embedding yields all-unscored, empty groups and zero resolver calls without backfill", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1] },
  ], { vectors: [null, [0, 1]] });
  const calls: EmbeddingReference[] = [], result = await prediction(value, "reference_shot_0", calls);
  assert.deepEqual(result.referenceTarget.embedding, missing("unavailable", "reference_embedding_unavailable", [{ artifact: value.reference.fingerprintArtifact.ref, pointer: "/shots/0/semanticEmbedding" }]));
  assert.ok(result.candidateResults.every((candidate) => candidate.similarity.state === "unavailable" && candidate.similarity.reasonCode === "reference_embedding_unavailable"));
  assert.deepEqual(result.rankedTieGroups, []); assert.equal(calls.length, 0);
});

test("reference authorization requires local_evaluation", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { allowedPurposes: ["local_reference_analysis"] });
  await assert.rejects(prediction(value), /local_evaluation|evaluation/i);
});

test("every candidate FootageAnalysis authorization requires local_evaluation", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], localEvaluation: false }]);
  await assert.rejects(prediction(value), /local_evaluation|evaluation/i);
});

test("reference and candidate project and creator scopes must match", async () => {
  const project = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { projectId: "project_foreign" });
  await assert.rejects(prediction(project), /project/i);
  const creator = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { creatorId: "creator_foreign" });
  await assert.rejects(prediction(creator), /creator/i);
});

test("fingerprint, analysis identity and authorization content binding is enforced", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { fingerprintAssetId: `asset_${"c".repeat(64)}` });
  await assert.rejects(prediction(value), /asset|content/i);
});

test("target must equal the same unique ReferenceAnalysis embeddingBatch shot", async () => {
  const mismatch = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { batchReferencePatch: { embeddingId: "embedding_mismatch" } });
  await assert.rejects(prediction(mismatch), /embedding|target|shot/i);
  const missingShot = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { batchMode: "missing_second" });
  await assert.rejects(prediction(missingShot, "reference_shot_1"), /embedding|shot/i);
  const duplicate = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { batchMode: "duplicate_first" });
  await assert.rejects(prediction(duplicate), /duplicate|unique/i);
});

test("ReferenceAnalysis embedding batch identity must match its exact ordered shot references", async () => {
  const value = fixture(
    [{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }],
    { batchId: "batch_tampered" },
  );
  await assert.rejects(prediction(value), /batch identity|batch/i);
});

test("target embedding space must agree with ReferenceAnalysis embedding configuration", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }], { targetReferencePatch: { spaceId: "space_foreign" } });
  await assert.rejects(prediction(value), /space/i);
});

test("candidate semantic missing remains exactly once, unscored, and never becomes zero", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], semanticMissing: true },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1] },
  ]);
  const result = await prediction(value), missingResult = result.candidateResults.find((candidate) => candidate.semantic.state !== "present")!;
  assert.equal(result.candidateResults.length, value.set.candidates.length);
  assert.equal(missingResult.semantic.state, "unavailable");
  assert.equal(missingResult.semantic.reasonCode, "candidate_semantic_source_missing");
  assert.equal(missingResult.similarity.state, "unavailable");
  assert.equal(missingResult.similarity.reasonCode, "candidate_semantic_unavailable");
  assert.deepEqual(missingResult.similarity.evidenceRefs, missingResult.semantic.evidenceRefs);
  assert.equal(result.rankedTieGroups.some((group) => group.candidateIds.includes(missingResult.candidateId)), false);
  assert.equal(result.rankedTieGroups.some((group) => group.score === 0 && group.candidateIds.includes(missingResult.candidateId)), false);
});

test("candidate semantic source missingness is preserved while derived similarity is unavailable", async () => {
  const value = fixture([
    {
      range: { startSeconds: 0, endSeconds: 1 },
      vector: [1, 0],
      semanticMissingState: "failed",
    },
  ]);

  const result = await prediction(value);
  const candidate = result.candidateResults[0]!;

  assert.equal(candidate.semantic.state, "failed");
  assert.equal(candidate.semantic.reasonCode, "candidate_semantic_source_failed");

  assert.equal(candidate.similarity.state, "unavailable");
  assert.equal(candidate.similarity.reasonCode, "candidate_semantic_unavailable");
  assert.deepEqual(candidate.similarity.evidenceRefs, candidate.semantic.evidenceRefs);
  assert.deepEqual(result.rankedTieGroups, []);
});

test("resolver missing vector preserves Gate 2 missingness and evidence", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]);
  const candidateRef = [...value.vectors.keys()][0]!, evidence = { artifact: value.setArtifact.ref, pointer: "/candidates/0" };
  const result = await createEditorialReferenceSemanticRankingPrediction(input(value), value.map(), combinedResolver(value, [], new Map([[candidateRef, missing("unavailable", "vector_absent", [evidence])]])));
  assert.deepEqual(result.candidateResults[0]!.similarity, missing("unavailable", "semantic_vector_unavailable", [evidence]));
  assert.deepEqual(result.rankedTieGroups, []);
});

test("incompatible candidate/reference semantic spaces hard fail", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0], embeddingVariant: true }]);
  await assert.rejects(prediction(value), /space/i);
});

test("within-segment and same-shot-context locality are preserved without changing cosine", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] },
    { range: { startSeconds: 2.5, endSeconds: 3 }, vector: [1, 0] },
  ]);
  const result = await prediction(value), byId = new Map(result.candidateResults.map((candidate) => [candidate.candidateId, candidate]));
  for (const entry of value.set.candidates) {
    const sourceToken = value.supplied.find((item) => item.ref.objectId === entry.token.objectId)!.value as ReturnType<typeof tokenFixture>["token"];
    const candidate = byId.get(entry.candidateId)!;
    assert.equal(candidate.semantic.state, "present"); assert.equal(sourceToken.semantic.data.state, "present");
    assert.deepEqual(candidate.semantic.value.locality, sourceToken.semantic.data.value.locality);
    assert.deepEqual(candidate.similarity, present(1));
  }
  assert.deepEqual(result.candidateResults.map((candidate) => candidate.semantic.state === "present" ? candidate.semantic.value.locality.support : null).sort(), ["same_shot_context", "within_segment"]);
});

test("prediction persists references, locality and scalar cosine but no vectors or technical/editorial outcome fields", async () => {
  const result = await prediction(fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]));
  const json = canonicalSerialize(result);
  for (const field of ["vector", "vectors", "technical", "weight", "planId", "slotId", "winner", "confidence", "judgment", "explanation"]) assert.equal(json.includes(`\"${field}\":`), false, field);
  assert.equal(result.task.taskId, "candidate_ranking");
});

test("duplicate/omitted results and reversed/incomplete groups fail validation", async () => {
  const value = fixture([
    { range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] },
    { range: { startSeconds: 1, endSeconds: 2 }, vector: [0, 1] },
  ]), result = await prediction(value), first = result.candidateResults[0]!;
  assert.equal(EditorialReferenceSemanticRankingPredictionSchema.safeParse(reidentify(result, { candidateResults: [first, first] })).success, false);
  const omitted = reidentify(result, { candidateResults: [first], rankedTieGroups: result.rankedTieGroups.filter((group) => group.candidateIds.includes(first.candidateId)) });
  await assert.rejects(validateEditorialReferenceSemanticRankingPrediction(omitted, value.map(), combinedResolver(value)), /universe|candidate|contradict/i);
  assert.equal(EditorialReferenceSemanticRankingPredictionSchema.safeParse(reidentify(result, { rankedTieGroups: [...result.rankedTieGroups].reverse() })).success, false);
  assert.equal(EditorialReferenceSemanticRankingPredictionSchema.safeParse(reidentify(result, { rankedTieGroups: result.rankedTieGroups.slice(0, 1) })).success, false);
});

test("async revalidation rejects tampered similarity and target even with recomputed artifact identity", async () => {
  const value = fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]), result = await prediction(value);
  const changedResult = structuredClone(result.candidateResults);
  changedResult[0]!.similarity = present(0);
  await assert.rejects(validateEditorialReferenceSemanticRankingPrediction(reidentify(result, { candidateResults: changedResult, rankedTieGroups: [{ score: 0, candidateIds: [changedResult[0]!.candidateId] }] }), value.map(), combinedResolver(value)), /contradict|similarity|result/i);
  const changedTarget = structuredClone(result.referenceTarget);
  changedTarget.shotId = "reference_shot_1";
  changedTarget.embedding = present(value.reference.references[1]!);
  await assert.rejects(validateEditorialReferenceSemanticRankingPrediction(reidentify(result, { referenceTarget: changedTarget }), value.map(), combinedResolver(value)), /target|contradict|shot/i);
});

test("unknown fields and unsupported versions/policies fail", async () => {
  const result = await prediction(fixture([{ range: { startSeconds: 0, endSeconds: 1 }, vector: [1, 0] }]));
  assert.equal(EditorialReferenceSemanticRankingPredictionSchema.safeParse({ ...result, winner: "invented" }).success, false);
  assert.equal(EditorialReferenceSemanticRankingPredictionSchema.safeParse({ ...result, artifactVersion: "0.2.0" }).success, false);
  assert.equal(EditorialReferenceSemanticRankingPredictionSchema.safeParse(reidentify(result, { policy: { ...result.policy, version: "0.2.0" } as unknown as typeof result.policy })).success, false);
});

test("public Matcher seam stays untouched and reference_style_compatibility remains reserved", async () => {
  const providers = await readFile("packages/providers/index.ts", "utf8"), taxonomy = await readFile("packages/editorial/taxonomy.ts", "utf8");
  assert.match(providers, /interface Matcher \{ rank\(request: MatchingRequest/);
  assert.match(taxonomy, /taskId: "reference_style_compatibility"/);
  assert.match(taxonomy, /t\.taskId === "reference_style_compatibility" \? "reserved"/);
  assert.equal((await readFile("packages/editorial/reference-ranking.ts", "utf8")).includes("reference_style_compatibility"), false);
});

test("production module has no provider/model/cache/fs/network imports and vectors flow only through the injected Gate 2 resolver", async () => {
  const path = "packages/editorial/reference-ranking.ts", text = await readFile(path, "utf8"), source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const imports: string[] = [], calls: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) calls.push(node.expression.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const specifier of imports) assert.equal(/providers|models|cache|node:fs|node:net|node:http|node:https/i.test(specifier), false, specifier);
  assert.ok(calls.includes("compareEditorialSemantics"));
  assert.equal(calls.some((call) => /resolver\.resolve|fetch|readFile|readdir/.test(call)), false);
});
