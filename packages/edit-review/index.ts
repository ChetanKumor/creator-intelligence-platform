/**
 * Phase 5 Gate 7 Batch 3A: editorial evidence surfaces and the semantic-critic foundation, as a pure core. Provider-neutral transcript
 * evidence and its phrase pack; the evidence routing seam; review plans derived from exactly what was executed (every actual cut once, a
 * constant global set); bounded observation records of one exact media identity with truthful computation identities and reuse; and a
 * critic that keeps technical QC separate, measures only what is mechanical and accepts model-assessed findings only through a validated,
 * provider-neutral port. Nothing here starts a process, reads a file, clock or environment, reaches a network, repairs, re-renders or edits
 * the EditGraph: decoding lives only in the audited adapter scripts/edit-observation-local.ts.
 */
export { EDIT_REVIEW_ERROR_CODES, EDIT_REVIEW_VERSION, EditReviewError, REVIEW_HARD_LIMITS, REVIEW_IMPLEMENTATION, type EditReviewErrorCode } from "./common.js";
export { TRANSCRIPT_PACK_SEMANTICS, TranscriptEvidenceSchema, TranscriptPackSchema, buildTranscriptPack, createTranscriptEvidence, renderTranscriptText, requireTranscriptEvidence,
  validateTranscriptPack, type TranscriptEntry, type TranscriptEvidence, type TranscriptPack, type TranscriptPackPolicy } from "./transcript.js";
export { EVIDENCE_DECISIONS, EvidenceRequestSchema, EvidenceSelectionSchema, createEvidenceRequest, selectEvidence, type EvidenceRequest, type EvidenceSelection } from "./evidence.js";
export { MediaFactsSchema, ObservationRequestSchema, REVIEW_PURPOSES, ReviewPlanSchema, ReviewPolicySchema, classifyProgramJoins, createReviewPolicy, planReview, requirePlan,
  samplesPerFrame, yuv420pFrameBytes, type ClassifiedJoin, type MediaFacts, type ObservationRequest, type PlanSegment, type ReviewItem, type ReviewPlan, type ReviewPlanInput,
  type ReviewPolicy } from "./review.js";
export { EditorialObservationSchema, OBSERVATION_SEMANTICS, OBSERVATION_SEMANTICS_DIGEST, OBSERVER_IMPLEMENTATION, ObservationCache, buildObservation, observationComputationIdOf,
  requireObservation, resolveObservationTarget, reuseObservation, targetComputationId, type AcquisitionInput, type DecodedMedia, type EditorialObservation, type ObservationInput,
  type ObservationDecoder, type ObservationTarget, type ObservationVersions, type ObservedMedia, type ResolvedTarget, type TranscriptJoin } from "./observation.js";
export { CRITIC_DIMENSIONS, CRITIC_SEVERITIES, CriticFindingSchema, CriticReportSchema, DETERMINISTIC_CHECKS, runCriticReview, type CriticDimension, type CriticFinding,
  type CriticReport, type CriticReviewInput, type SemanticCriticIdentity, type SemanticCriticInput, type SemanticCriticPort } from "./critic.js";
