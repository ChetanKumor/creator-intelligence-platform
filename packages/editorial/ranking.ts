import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { ArtifactRefSchema, IdSetSchema, MissingSchema, availability, checkIdentity, compareText, editorialEnvelope, ensure, equal, identify, missing, type ArtifactRef, type Availability, type Missing } from "./common.js";
import { EditorialCandidateSetSchema, validateCandidateSet } from "./decision.js";
import { resolveTokenView } from "./resolve.js";
import { TaskRefSchema, taskRef } from "./taxonomy.js";

export const TECHNICAL_BASELINE_FEATURE_SET_VERSION = "technical-baseline-0.1.0" as const;
export const TECHNICAL_BASELINE_POLICY = { kind: "rule", name: "technical_baseline", version: "0.1.0" } as const;

const RatioSchema = z.number().finite().min(0).max(1);
const RequiredFeatureSchema = availability(RatioSchema);
const CandidateSetRefSchema = ArtifactRefSchema.refine(
  (ref) => ref.artifactType === "EditorialCandidateSet" && ref.artifactVersion === "0.1.0",
  "Expected internal EditorialCandidateSet reference.",
);
const CandidateRankingTaskSchema = TaskRefSchema.refine(
  (task) => equal(task, taskRef("candidate_ranking")),
  "Expected candidate_ranking task.",
);
const TechnicalBaselinePolicySchema = z.strictObject({
  kind: z.literal("rule"),
  name: z.literal("technical_baseline"),
  version: z.literal("0.1.0"),
});

export const EditorialRankingCandidateResultSchema = z.strictObject({
  candidateId: IdSchema,
  sharpnessIndicator: RequiredFeatureSchema,
  unclippedPixelFraction: RequiredFeatureSchema,
  score: availability(RatioSchema),
}).superRefine((result, ctx) => {
  const sharpness = result.sharpnessIndicator, unclipped = result.unclippedPixelFraction;
  if (sharpness.state === "present" && unclipped.state === "present") {
    const expected = 0.5 * sharpness.value + 0.5 * unclipped.value;
    if (result.score.state !== "present" || result.score.value !== expected) ctx.addIssue({ code: "custom", message: "Present required features must produce the exact technical baseline score." });
  } else if (result.score.state !== "unavailable") {
    ctx.addIssue({ code: "custom", message: "A missing required feature makes the candidate score unavailable." });
  }
});
export type EditorialRankingCandidateResult = z.infer<typeof EditorialRankingCandidateResultSchema>;

const RankedTieGroupSchema = z.strictObject({
  score: RatioSchema,
  candidateIds: IdSetSchema.refine((ids) => ids.length > 0, "Ranked tie groups cannot be empty."),
});

export const EditorialRankingPredictionBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialRankingPrediction"),
  projectId: IdSchema,
  candidateSet: CandidateSetRefSchema,
  task: CandidateRankingTaskSchema,
  featureSetVersion: z.literal(TECHNICAL_BASELINE_FEATURE_SET_VERSION),
  policy: TechnicalBaselinePolicySchema,
  candidateResults: z.array(EditorialRankingCandidateResultSchema).max(4096)
    .refine((results) => new Set(results.map((result) => result.candidateId)).size === results.length, "Duplicate candidate results.")
    .transform((results) => [...results].sort((a, b) => compareText(a.candidateId, b.candidateId))),
  rankedTieGroups: z.array(RankedTieGroupSchema).max(4096),
});

export const EditorialRankingPredictionSchema = EditorialRankingPredictionBodySchema.extend({ predictionId: IdSchema }).superRefine((prediction, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!checkIdentity(prediction, "predictionId", "editorial_ranking_prediction")) fail("Ranking prediction identity mismatch.");
  const results = new Map(prediction.candidateResults.map((result) => [result.candidateId, result]));
  const rankedIds: string[] = [];
  for (const [index, group] of prediction.rankedTieGroups.entries()) {
    if (index > 0 && prediction.rankedTieGroups[index - 1]!.score <= group.score) fail("Ranked tie-group scores must be strictly descending.");
    for (const candidateId of group.candidateIds) {
      const result = results.get(candidateId);
      if (!result || result.score.state !== "present" || result.score.value !== group.score) fail("Ranked tie group must contain only candidates with its present score.");
      rankedIds.push(candidateId);
    }
  }
  if (new Set(rankedIds).size !== rankedIds.length) fail("A scored candidate may appear in exactly one rank group.");
  const scoredIds = prediction.candidateResults.filter((result) => result.score.state === "present").map((result) => result.candidateId).sort(compareText);
  if (!equal([...rankedIds].sort(compareText), scoredIds)) fail("Rank groups must contain every scored candidate exactly once.");
});
export type EditorialRankingPrediction = z.infer<typeof EditorialRankingPredictionSchema>;

function missingEvidence(features: readonly Availability<number>[]) {
  const refs = features.flatMap((feature) => feature.state === "present" ? [] : feature.evidenceRefs);
  const unique = new Map(refs.map((ref) => [JSON.stringify(ref), ref]));
  return [...unique.values()];
}

export function scoreTechnicalBaselineCandidate(
  candidateId: string,
  sharpnessIndicator: Availability<number>,
  unclippedPixelFraction: Availability<number>,
): EditorialRankingCandidateResult {
  const sharpness = RequiredFeatureSchema.parse(sharpnessIndicator), unclipped = RequiredFeatureSchema.parse(unclippedPixelFraction);
  const score = sharpness.state === "present" && unclipped.state === "present"
    ? { state: "present" as const, value: 0.5 * sharpness.value + 0.5 * unclipped.value }
    : missing("unavailable", "required_feature_missing", missingEvidence([sharpness, unclipped]));
  return EditorialRankingCandidateResultSchema.parse({ candidateId, sharpnessIndicator: sharpness, unclippedPixelFraction: unclipped, score });
}

function projectedMissingness(value: Missing): Missing {
  return MissingSchema.parse(value);
}

function projectCandidateResults(candidateSetRef: ArtifactRef, artifacts: import("./common.js").EditorialArtifactMap) {
  const candidateSet = EditorialCandidateSetSchema.parse(artifacts.get(candidateSetRef));
  const { set, tokens } = validateCandidateSet(candidateSet, artifacts);
  const candidateResults = set.candidates.map(({ candidateId }) => {
    const view = resolveTokenView(tokens.get(candidateId)!, artifacts);
    const cheapMissing = view.token.cheap.data.state === "present" ? undefined : projectedMissingness(view.token.cheap.data);
    const sharpness = view.signals.sharpnessIndicator?.data ?? cheapMissing;
    const unclipped = view.signals.unclippedPixelFraction?.data ?? cheapMissing;
    ensure(sharpness !== undefined && unclipped !== undefined, "Required technical feature projection is incomplete.");
    return scoreTechnicalBaselineCandidate(candidateId, sharpness, unclipped);
  });
  return { set, candidateResults: EditorialRankingPredictionBodySchema.shape.candidateResults.parse(candidateResults) };
}

function rankGroups(candidateResults: readonly EditorialRankingCandidateResult[]) {
  const scores = new Map<number, string[]>();
  for (const result of candidateResults) {
    if (result.score.state !== "present") continue;
    const ids = scores.get(result.score.value) ?? [];
    ids.push(result.candidateId); scores.set(result.score.value, ids);
  }
  return [...scores.entries()]
    .sort(([left], [right]) => right - left)
    .map(([score, candidateIds]) => RankedTieGroupSchema.parse({ score, candidateIds }));
}

export function createEditorialRankingPrediction(candidateSetInput: ArtifactRef, artifacts: import("./common.js").EditorialArtifactMap): EditorialRankingPrediction {
  const candidateSet = CandidateSetRefSchema.parse(candidateSetInput);
  const { set, candidateResults } = projectCandidateResults(candidateSet, artifacts);
  const body = EditorialRankingPredictionBodySchema.parse({
    artifactType: "EditorialRankingPrediction", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    projectId: set.projectId, candidateSet, task: taskRef("candidate_ranking"),
    featureSetVersion: TECHNICAL_BASELINE_FEATURE_SET_VERSION, policy: TECHNICAL_BASELINE_POLICY,
    candidateResults, rankedTieGroups: rankGroups(candidateResults),
  });
  return EditorialRankingPredictionSchema.parse(identify("editorial_ranking_prediction", "predictionId", body));
}

export function validateEditorialRankingPrediction(input: unknown, artifacts: import("./common.js").EditorialArtifactMap): EditorialRankingPrediction {
  const prediction = EditorialRankingPredictionSchema.parse(input);
  const { set, candidateResults } = projectCandidateResults(prediction.candidateSet, artifacts);
  ensure(prediction.projectId === set.projectId, "Ranking prediction project mismatch.");
  ensure(equal(prediction.candidateResults.map((result) => result.candidateId), set.candidates.map((candidate) => candidate.candidateId)), "Ranking prediction candidate universe must exactly equal the supplied candidate set.");
  ensure(equal(prediction.candidateResults, candidateResults), "Ranking prediction feature projection or score contradicts supplied token evidence.");
  ensure(equal(prediction.rankedTieGroups, rankGroups(candidateResults)), "Ranking prediction groups contradict deterministic scores.");
  return prediction;
}
