import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import {
  ArtifactRefSchema,
  checkIdentity,
  editorialEnvelope,
  ensure,
  equal,
  identify,
  type ArtifactRef,
  type EditorialArtifactMap,
} from "./common.js";
import {
  EditorialRankingPredictionSchema,
  createEditorialRankingPrediction,
} from "./ranking.js";
import {
  EditorialReferenceSemanticRankingPredictionSchema,
  createEditorialReferenceSemanticRankingPrediction,
} from "./reference-ranking.js";
import type { EditorialVectorResolver } from "./token.js";
import { TaskRefSchema, taskRef } from "./taxonomy.js";

export const EDITORIAL_MATCHER_V0_VERSION = "0.1.0" as const;
export const EDITORIAL_MATCHER_V0_DISPATCH_POLICY = {
  kind: "rule",
  name: "explicit_matcher_mode",
  version: "0.1.0",
} as const;

const CandidateSetRefSchema = ArtifactRefSchema.refine(
  (ref) => ref.artifactType === "EditorialCandidateSet" && ref.artifactVersion === "0.1.0",
  "Expected internal EditorialCandidateSet reference.",
);
const ReferenceFingerprintRefSchema = ArtifactRefSchema.refine(
  (ref) => ref.artifactType === "ReferenceFingerprint" && ref.artifactVersion === "1.1.0",
  "Expected ReferenceFingerprint 1.1.0 reference.",
);
const ReferenceAnalysisRefSchema = ArtifactRefSchema.refine(
  (ref) => ref.artifactType === "ReferenceAnalysis" && ref.artifactVersion === "1.0.0",
  "Expected ReferenceAnalysis 1.0.0 reference.",
);
const CandidateRankingTaskSchema = TaskRefSchema.refine(
  (task) => equal(task, taskRef("candidate_ranking")),
  "Expected candidate_ranking task.",
);
const DispatchPolicySchema = z.strictObject({
  kind: z.literal("rule"),
  name: z.literal("explicit_matcher_mode"),
  version: z.literal("0.1.0"),
});

export const EditorialMatcherV0RequestSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("technical_baseline"),
    candidateSet: CandidateSetRefSchema,
  }),
  z.strictObject({
    mode: z.literal("reference_semantic"),
    candidateSet: CandidateSetRefSchema,
    referenceFingerprint: ReferenceFingerprintRefSchema,
    referenceAnalysis: ReferenceAnalysisRefSchema,
    referenceShotId: IdSchema,
  }),
]);
export type EditorialMatcherV0Request = z.infer<typeof EditorialMatcherV0RequestSchema>;

const sharedPredictionShape = {
  ...editorialEnvelope("EditorialMatcherV0Prediction"),
  projectId: IdSchema,
  candidateSet: CandidateSetRefSchema,
  task: CandidateRankingTaskSchema,
  matcherVersion: z.literal(EDITORIAL_MATCHER_V0_VERSION),
  dispatchPolicy: DispatchPolicySchema,
};

export const EditorialMatcherV0PredictionBodySchema = z.discriminatedUnion("mode", [
  z.strictObject({
    ...sharedPredictionShape,
    mode: z.literal("technical_baseline"),
    ranking: EditorialRankingPredictionSchema,
  }),
  z.strictObject({
    ...sharedPredictionShape,
    mode: z.literal("reference_semantic"),
    ranking: EditorialReferenceSemanticRankingPredictionSchema,
  }),
]).superRefine((prediction, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (prediction.projectId !== prediction.ranking.projectId) fail("Matcher project must equal the nested ranking project.");
  if (!equal(prediction.candidateSet, prediction.ranking.candidateSet)) fail("Matcher candidate set must equal the nested ranking candidate set.");
  if (!equal(prediction.task, prediction.ranking.task)) fail("Matcher task must equal the nested ranking task.");
});

const TechnicalPredictionSchema = z.strictObject({
  ...sharedPredictionShape,
  predictionId: IdSchema,
  mode: z.literal("technical_baseline"),
  ranking: EditorialRankingPredictionSchema,
});
const ReferencePredictionSchema = z.strictObject({
  ...sharedPredictionShape,
  predictionId: IdSchema,
  mode: z.literal("reference_semantic"),
  ranking: EditorialReferenceSemanticRankingPredictionSchema,
});

export const EditorialMatcherV0PredictionSchema = z.discriminatedUnion("mode", [
  TechnicalPredictionSchema,
  ReferencePredictionSchema,
]).superRefine((prediction, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (prediction.projectId !== prediction.ranking.projectId) fail("Matcher project must equal the nested ranking project.");
  if (!equal(prediction.candidateSet, prediction.ranking.candidateSet)) fail("Matcher candidate set must equal the nested ranking candidate set.");
  if (!equal(prediction.task, prediction.ranking.task)) fail("Matcher task must equal the nested ranking task.");
  if (!checkIdentity(prediction, "predictionId", "editorial_matcher_v0_prediction")) fail("Matcher prediction identity mismatch.");
});
export type EditorialMatcherV0Prediction = z.infer<typeof EditorialMatcherV0PredictionSchema>;

function predictionBody(
  mode: "technical_baseline" | "reference_semantic",
  candidateSet: ArtifactRef,
  ranking: z.infer<typeof EditorialRankingPredictionSchema> | z.infer<typeof EditorialReferenceSemanticRankingPredictionSchema>,
) {
  return {
    artifactType: "EditorialMatcherV0Prediction" as const,
    artifactVersion: "0.1.0" as const,
    stability: "internal_pre_stable" as const,
    projectId: ranking.projectId,
    candidateSet,
    task: taskRef("candidate_ranking"),
    matcherVersion: EDITORIAL_MATCHER_V0_VERSION,
    dispatchPolicy: EDITORIAL_MATCHER_V0_DISPATCH_POLICY,
    mode,
    ranking,
  };
}

export async function createEditorialMatcherV0Prediction(
  requestInput: EditorialMatcherV0Request,
  artifacts: EditorialArtifactMap,
  resolver?: EditorialVectorResolver,
): Promise<EditorialMatcherV0Prediction> {
  const request = EditorialMatcherV0RequestSchema.parse(requestInput);
  if (request.mode === "technical_baseline") {
    const ranking = createEditorialRankingPrediction(request.candidateSet, artifacts);
    const body = EditorialMatcherV0PredictionBodySchema.parse(predictionBody(request.mode, request.candidateSet, ranking));
    return EditorialMatcherV0PredictionSchema.parse(identify("editorial_matcher_v0_prediction", "predictionId", body));
  }

  ensure(resolver !== undefined, "reference_semantic mode requires an EditorialVectorResolver.");
  const ranking = await createEditorialReferenceSemanticRankingPrediction({
    candidateSet: request.candidateSet,
    referenceFingerprint: request.referenceFingerprint,
    referenceAnalysis: request.referenceAnalysis,
    referenceShotId: request.referenceShotId,
  }, artifacts, resolver);
  const body = EditorialMatcherV0PredictionBodySchema.parse(predictionBody(request.mode, request.candidateSet, ranking));
  return EditorialMatcherV0PredictionSchema.parse(identify("editorial_matcher_v0_prediction", "predictionId", body));
}

export async function validateEditorialMatcherV0Prediction(
  input: unknown,
  artifacts: EditorialArtifactMap,
  resolver?: EditorialVectorResolver,
): Promise<EditorialMatcherV0Prediction> {
  const prediction = EditorialMatcherV0PredictionSchema.parse(input);
  const expected = prediction.mode === "technical_baseline"
    ? await createEditorialMatcherV0Prediction({ mode: prediction.mode, candidateSet: prediction.candidateSet }, artifacts)
    : await createEditorialMatcherV0Prediction({
      mode: prediction.mode,
      candidateSet: prediction.candidateSet,
      referenceFingerprint: prediction.ranking.referenceTarget.fingerprint,
      referenceAnalysis: prediction.ranking.referenceTarget.analysis,
      referenceShotId: prediction.ranking.referenceTarget.shotId,
    }, artifacts, resolver);
  ensure(equal(prediction, expected), "Matcher prediction contradicts supplied evidence or delegated deterministic ranking.");
  return prediction;
}
