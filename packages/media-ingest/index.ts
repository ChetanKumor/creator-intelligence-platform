/**
 * Gate 7 Batch 3E-B1A: canonical media ingest, pure contract only. Classification of an already-parsed probe as DIRECT, NORMALIZE_N1
 * or REFUSE, the bounded recipe list, the pinned toolchain, and the CanonicalMediaDerivation record with its computation and
 * derivation identities. Nothing here starts a process, reads a file, clock or environment, or reaches a network.
 */
export { CANONICALIZER, CANONICALIZER_DESCRIPTOR, CANONICAL_COMPUTATION_IDENTITY, CANONICAL_DERIVATION_IDENTITY, CANONICAL_RECIPES, CANONICAL_REFUSALS, CANONICAL_TOOLCHAIN,
  CanonicalClassificationSchema, CanonicalMediaDerivationSchema, DIRECT_REASON, IngestVideoFactsSchema, MEDIA_INGEST_ERROR_CODES, MEDIA_INGEST_VERSION, MediaIngestError,
  N1_ARGV_TEMPLATE, N1_ASSUMPTION, N1_BOUNDS, N1_REASON, N1_RECIPE, N1_SEMANTICS, REFUSAL_BASES, buildCanonicalDerivedAuthorization, buildCanonicalMediaDerivation,
  canonicalComputationIdOf, classifyCanonicalIngest, type CanonicalClassification, type CanonicalMediaDerivation, type CanonicalRecipe, type CanonicalRefusal,
  type CanonicalToolchain, type IngestVideoFacts, type MediaIngestErrorCode } from "./canonical.js";
/*
 * Gate 7 Batch 3E-B2-A1, beside the accepted B1 contract above and wired to nothing yet: CanonicalMediaProfile v1, the typed
 * CanonicalMediaFacts it reads and its evaluation; the typed CanonicalizationPlan v1 and its planner; CanonicalMediaDerivation 0.2.0.
 */
export { AUDIO_RETIME_MAX_DISPLACEMENT_SAMPLES, CANONICAL_MEDIA_FACTS_VERSION, CANONICAL_MEDIA_PROFILE_IDENTITY, CANONICAL_MEDIA_PROFILE_V1,
  CANONICAL_MEDIA_PROFILE_V1_SEMANTICS, CANONICAL_PROFILE_EVALUATION_V1, CANONICAL_REMUX_ENVELOPE_V1, CANONICAL_SNAP_RATES, CanonicalMediaFactsSchema,
  CanonicalProfileEvaluationSchema, FINDING_DISPOSITIONS, PROFILE_DIMENSIONS, PROFILE_FINDING_CODES, PROFILE_FINDING_RULES, PROFILE_OUTCOMES, SIDE_DATA_KINDS,
  X264_ENCODER_INFO_SEI_UUID, X265_ENCODER_INFO_SEI_UUID, audioTimelineDigestOf, canonicalMediaFactsDigestOf, canonicalMediaProfileIdOf, classifyDisplayMatrix,
  evaluateCanonicalProfileV1, videoTimelineDigestOf, type CanonicalMediaFacts, type CanonicalProfileEvaluation, type D4Element, type DisplayMatrixClass,
  type DisplayMatrixFeature, type FindingCode, type ProfileFinding, type ProfileOutcome } from "./profile.js";
export { AnyCanonicalMediaDerivationSchema, CANONICALIZATION_OPERATIONS, CANONICALIZATION_PLAN_IDENTITY, CANONICALIZATION_PLAN_SEMANTICS,
  CANONICALIZATION_PLAN_V1_SEMANTICS, CANONICALIZATION_PLAN_VERSION, CANONICAL_PLAN_COMPUTATION_IDENTITY, CANONICAL_PLAN_DERIVATION_IDENTITY,
  CANONICAL_PLAN_DERIVATION_VERSION, CANONICAL_PLAN_TOOLCHAIN, CanonicalMediaPlanDerivationSchema, CanonicalizationPlanSchema, OPERATION_FOR_FINDING,
  PLANNING_OUTCOMES, PLAN_CANONICALIZER, PLAN_CANONICALIZER_DESCRIPTOR, PLAN_VERIFICATION_METHOD, PLAN_VERIFICATION_METHODS, buildCanonicalMediaPlanDerivation,
  buildCanonicalPlanDerivedAuthorization, canonicalPlanComputationIdOf, canonicalizationPlanIdOf, planCanonicalizationV1, revalidateCanonicalizationPlan,
  type CanonicalMediaPlanDerivation, type CanonicalPlanToolchain, type CanonicalPlanningResult, type CanonicalizationOperationName,
  type CanonicalizationPlan } from "./plan.js";
