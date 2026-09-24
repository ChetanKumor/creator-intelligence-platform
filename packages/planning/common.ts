/** Gate 5 owned records. Structural parsing is followed by semantic replay at the public module boundary. */
import { z } from "zod";
import { IdSchema, TimeRangeSchema, TimestampSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EvidenceRefSchema, MissingSchema, availability, checkIdentity, compareText, exactDigest, identify, type SuppliedArtifact } from "../editorial/common.js";
import { GroundedSupportSchema } from "../world-model/index.js";

export const PLANNING_VERSION = "0.1.0" as const;
export const envelope = <const T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(PLANNING_VERSION), stability: z.literal("internal_pre_stable") });
export const header = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: PLANNING_VERSION, stability: "internal_pre_stable" as const });
export const ScopeSchema = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, purpose: IdSchema });
export const idSet = (max = 256) => z.array(IdSchema).max(max).refine(v => new Set(v).size === v.length, "Duplicate IDs.").transform(v => [...v].sort(compareText));
export const refSet = (max = 256) => z.array(ArtifactRefSchema).max(max).refine(v => new Set(v.map(r => r.objectId)).size === v.length, "Duplicate artifact refs.").transform(v => [...v].sort((a, b) => compareText(a.objectId, b.objectId)));
export const evidenceSet = z.array(EvidenceRefSchema).max(4096).refine(v => new Set(v.map(canonicalSerialize)).size === v.length, "Duplicate evidence.").transform(v => [...v].sort((a, b) => compareText(canonicalSerialize(a), canonicalSerialize(b))));
export const Nat = z.number().int().nonnegative().safe();
const positiveTime = z.number().finite().positive().max(600);
export const CandidateBindingSchema = z.strictObject({ candidateId: IdSchema, token: ArtifactRefSchema });
export const CandidateBindingsSchema = z.array(CandidateBindingSchema).max(256).refine(v => new Set(v.map(r => r.candidateId)).size === v.length, "Duplicate candidate bindings.").transform(v => [...v].sort((a, b) => compareText(a.candidateId, b.candidateId)));
export const ObjectiveNameSchema = z.enum(["direction_coverage", "hard_requirement_coverage", "duration_deviation", "repetition_count", "mean_sharpness", "mean_unclipped_pixels", "mean_stability"]);
export const ObjectiveSchema = z.strictObject({ name: ObjectiveNameSchema, definitionVersion: z.literal(PLANNING_VERSION), preference: z.enum(["higher", "lower"]), missing: z.enum(["block", "abstain"]) });
export const SeedSchema = z.strictObject({ kind: z.literal("deterministic"), policyVersion: z.literal(PLANNING_VERSION), ordering: z.enum(["canonical_ids", "reverse_canonical_ids"]) });
export const PolicyBodySchema = z.strictObject({
  ...envelope("PlanningPolicy"), scope: ScopeSchema, author: z.strictObject({ kind: z.literal("owner"), actorId: IdSchema }),
  retrieval: z.strictObject({ method: z.literal("exact_direction_bindings_v0"), maxCandidatesPerNode: z.number().int().min(1).max(64) }),
  boundary: z.strictObject({ method: z.literal("candidate_and_sample_pts_v0"), maxEvidencePoints: z.number().int().min(2).max(16), maxOptionsPerCandidate: z.number().int().min(1).max(32) }),
  duration: z.strictObject({ minimumSeconds: positiveTime, maximumSeconds: positiveTime, preferredSeconds: positiveTime }),
  trim: z.strictObject({ minimumSeconds: positiveTime, maximumSeconds: positiveTime }),
  search: z.strictObject({ algorithm: z.literal("bounded_beam_v0"), maximumDepth: z.number().int().min(1).max(16), frontierWidth: z.number().int().min(1).max(32),
    maximumExpandedStates: z.number().int().min(1).max(2048), maximumOptionsRetained: z.number().int().min(1).max(256), manifestLimit: z.number().int().min(1).max(2048) }),
  reuse: z.strictObject({ maximumUsesPerCandidate: z.number().int().min(1).max(16), precedingUsePolicy: z.literal("count_for_reuse_and_repetition") }),
  objectives: z.array(ObjectiveSchema).min(1).max(7).refine(v => new Set(v.map(o => o.name)).size === v.length, "Duplicate objective."),
  scoring: z.literal("lexicographic_components_v0"), tie: z.strictObject({ epsilon: z.number().finite().min(0).max(1), policy: z.literal("retain_all_within_component_epsilon") }),
  seed: SeedSchema, stopping: z.literal("declared_bounds_or_empty_frontier"), requirementSemantics: z.literal("structural_node_coverage_only"), executionAssessment: z.literal("deferred"),
});
function validPolicy(v: z.infer<typeof PolicyBodySchema>): boolean {
  return v.duration.minimumSeconds <= v.duration.preferredSeconds && v.duration.preferredSeconds <= v.duration.maximumSeconds
    && v.trim.minimumSeconds <= v.trim.maximumSeconds && v.search.maximumExpandedStates <= v.search.manifestLimit
    && v.search.maximumOptionsRetained <= v.search.manifestLimit;
}
export const PlanningPolicySchema = PolicyBodySchema.extend({ policyId: IdSchema }).refine(validPolicy, "Contradictory duration or search limits.")
  .refine(v => checkIdentity(v, "policyId", "planning_policy_v0"), "Policy identity mismatch.");
export type PlanningPolicy = z.infer<typeof PlanningPolicySchema>;
export function createPlanningPolicy(input: unknown): PlanningPolicy {
  return PlanningPolicySchema.parse(identify("planning_policy_v0", "policyId", PolicyBodySchema.parse(input)));
}

// Pins the complete supplied query including access time. No ambient authorization/time lookup.
export const PlanningWorldQuerySchema = z.strictObject({ worldId: IdSchema, ...ScopeSchema.shape, currentAuthorization: EvidenceRefSchema,
  currentAccess: refSet(16), accessAsOf: TimestampSchema, queryVersion: z.literal(PLANNING_VERSION),
  authority: z.array(z.enum(["MediaTruth", "ObservedFact", "DerivedObservation"])).min(1).max(3), channels: idSet(64),
  assetId: IdSchema.optional(), candidateId: IdSchema.optional(), token: ArtifactRefSchema.optional(), sourceRange: TimeRangeSchema.optional(),
  limit: z.number().int().min(1).max(256), offset: z.number().int().min(0).max(4096) });
export const PrecedingUseRefSchema = z.strictObject({ decision: ArtifactRefSchema, optionId: IdSchema, useId: IdSchema });
export const ContextBodySchema = z.strictObject({
  ...envelope("PlanningContext"), scope: ScopeSchema, direction: ArtifactRefSchema, directorRequest: ArtifactRefSchema,
  worldSnapshot: ArtifactRefSchema, worldView: ArtifactRefSchema, worldQuery: PlanningWorldQuerySchema,
  candidateUniverse: ArtifactRefSchema, candidates: CandidateBindingsSchema, policy: ArtifactRefSchema, computeBudget: ArtifactRefSchema,
  previousDecisions: refSet(8), precedingUses: z.array(PrecedingUseRefSchema).max(32).refine(v => new Set(v.map(u => u.useId)).size === v.length, "Duplicate preceding use occurrence."),
});
export const PlanningContextSchema = ContextBodySchema.extend({ contextId: IdSchema }).refine(v => checkIdentity(v, "contextId", "planning_context_v0"), "Context identity mismatch.");
export type PlanningContext = z.infer<typeof PlanningContextSchema>;

export const FeatureNameSchema = z.enum(["sharpnessIndicator", "unclippedPixelFraction", "stabilityIndicator"]);
export const FeatureEvidenceSchema = z.strictObject({ name: FeatureNameSchema, value: availability(z.number().finite()), evidenceRefs: evidenceSet,
  locality: z.enum(["within_segment", "same_shot_context", "unavailable"]), extent: z.literal("candidate_snapshot_not_trim_recomputed") });
export const RetrievalEntrySchema = z.strictObject({ ...CandidateBindingSchema.shape, directionNodeId: IdSchema, requirementIds: idSet(),
  included: z.boolean(), reason: z.enum(["exact_direction_binding", "not_bound_to_direction", "outside_direction_scope", "world_support_unavailable", "retrieval_limit"]),
  evidenceRefs: evidenceSet, features: z.array(FeatureEvidenceSchema).length(3), missingSemanticPrediction: MissingSchema });
export const RetrievalBodySchema = z.strictObject({ ...envelope("PlanningRetrieval"), contextSnapshot: ArtifactRefSchema, policy: ArtifactRefSchema,
  directionNodeId: IdSchema, candidateUniverse: ArtifactRefSchema, entries: z.array(RetrievalEntrySchema).max(256),
  scope: ScopeSchema, completeness: z.literal("exact_supplied_universe_accounted"), relevanceMeaning: z.literal("explicit_direction_link_not_quality") });
export const PlanningRetrievalSchema = RetrievalBodySchema.extend({ retrievalId: IdSchema }).refine(v => checkIdentity(v, "retrievalId", "planning_retrieval_v0"), "Retrieval identity mismatch.");
export type PlanningRetrieval = z.infer<typeof PlanningRetrievalSchema>;

export const BoundaryAuthoritySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("frame_pts"), frameIndex: Nat, evidence: EvidenceRefSchema }),
  z.strictObject({ kind: z.literal("candidate_endpoint"), evidence: EvidenceRefSchema }),
]);
export const BoundarySampleSchema = z.strictObject({ sampleId: IdSchema, frameIndex: Nat, atSeconds: z.number().finite().nonnegative(), frameHash: z.string().regex(/^[a-f0-9]{64}$/), evidence: EvidenceRefSchema });
export const BoundaryBodySchema = z.strictObject({ ...envelope("PlanningBoundary"), contextSnapshot: ArtifactRefSchema, policy: ArtifactRefSchema,
  ...CandidateBindingSchema.shape, assetId: IdSchema, sourceHash: z.string().regex(/^[a-f0-9]{64}$/), analysis: ArtifactRefSchema,
  support: GroundedSupportSchema, supportEvidence: EvidenceRefSchema, candidateRangeEvidence: EvidenceRefSchema, shotEvidence: EvidenceRefSchema,
  sourceRange: TimeRangeSchema, startAuthority: BoundaryAuthoritySchema, endAuthority: BoundaryAuthoritySchema,
  timebase: EvidenceRefSchema, precision: z.enum(["frame_pts_exact", "source_seconds"]), sampleEvidence: z.array(BoundarySampleSchema).max(2),
  uncertainty: MissingSchema, generation: z.enum(["candidate_full_range", "sample_pts_pair"]) });
export const PlanningBoundarySchema = BoundaryBodySchema.extend({ boundaryId: IdSchema }).refine(v => checkIdentity(v, "boundaryId", "planning_boundary_v0"), "Boundary identity mismatch.");
export type PlanningBoundary = z.infer<typeof PlanningBoundarySchema>;
export const BoundarySetBodySchema = z.strictObject({ ...envelope("PlanningBoundarySet"), contextSnapshot: ArtifactRefSchema, policy: ArtifactRefSchema,
  ...CandidateBindingSchema.shape, options: z.array(PlanningBoundarySchema).max(32), missing: z.array(MissingSchema).max(4),
  evidencePointsAvailable: Nat, evidencePointsUsed: Nat, truncated: z.boolean(), coverage: z.literal("bounded_proposals_only") });
export const PlanningBoundarySetSchema = BoundarySetBodySchema.extend({ boundarySetId: IdSchema }).refine(v => checkIdentity(v, "boundarySetId", "planning_boundary_set_v0"), "Boundary set identity mismatch.");
export type PlanningBoundarySet = z.infer<typeof PlanningBoundarySetSchema>;

export const PlanningUseSchema = z.strictObject({ useId: IdSchema, ...CandidateBindingSchema.shape, boundary: PlanningBoundarySchema,
  directionNodeId: IdSchema, durationSeconds: z.number().finite().positive(), precedingUseId: availability(IdSchema) });
export type PlanningUse = z.infer<typeof PlanningUseSchema>;
export const ComponentSchema = z.strictObject({ name: ObjectiveNameSchema, value: availability(z.number().finite()), evidenceRefs: evidenceSet,
  meaning: z.literal("declared_objective_not_confidence") });
export const ConstraintCheckSchema = z.strictObject({ checkId: IdSchema, state: z.enum(["pass", "fail", "pending", "unknown", "deferred"]),
  reasonCode: IdSchema, evidenceRefs: evidenceSet, extensionBlocking: z.boolean() });
// These are exact unresolved intentions, not operations or capability assessments.
export const DeferredObligationSchema = z.strictObject({ nodeId: IdSchema, priority: z.enum(["hard", "soft"]), requirementIds: idSet(),
  directionNode: EvidenceRefSchema, reasonCode: z.enum(["no_source_binding", "operation_intention"]), state: z.literal("deferred"),
  capabilityAssessment: z.literal("not_performed"), executionAssessment: z.literal("deferred") });
export const DeferredObligationsSchema = z.array(DeferredObligationSchema).max(256)
  .refine(v => new Set(v.map(o => o.nodeId)).size === v.length, "Duplicate deferred obligation.")
  .transform(v => [...v].sort((a, b) => compareText(a.nodeId, b.nodeId)));
export const SequenceBodySchema = z.strictObject({ ...envelope("PlanningSequenceOption"), contextSnapshot: ArtifactRefSchema,
  uses: z.array(PlanningUseSchema).min(1).max(16).refine(v => new Set(v.map(u => u.useId)).size === v.length, "Repeated uses require distinct occurrence IDs."),
  precedingUses: z.array(PrecedingUseRefSchema).max(32), durationSeconds: z.number().finite().positive(), coveredNodeIds: idSet(),
  candidateReuseCounts: z.array(z.strictObject({ candidateId: IdSchema, count: Nat })).max(256), components: z.array(ComponentSchema).min(1).max(7),
  hardConstraints: z.array(ConstraintCheckSchema).max(2048), softFindings: z.array(ConstraintCheckSchema).max(2048), deferredObligations: DeferredObligationsSchema,
  durationMeaning: z.literal("sum_of_selected_source_durations_no_output_time_mapping") });
export const PlanningSequenceSchema = SequenceBodySchema.extend({ optionId: IdSchema }).refine(v => checkIdentity(v, "optionId", "planning_sequence_v0"), "Sequence identity mismatch.");
export type PlanningSequence = z.infer<typeof PlanningSequenceSchema>;
export const PruningReasonSchema = z.enum(["hard_constraint", "duration_bound", "candidate_reuse_bound", "frontier_limit", "search_limit", "incomplete_required_evidence", "incomplete_sequence", "depth_bound", "options_limit"]);
export const ManifestEntrySchema = z.strictObject({ option: PlanningSequenceSchema, parentOptionId: z.union([IdSchema, z.null()]), ordinal: Nat,
  expansion: z.enum(["expanded", "frontier", "stopped", "pruned"]), expansionReason: z.union([PruningReasonSchema, z.null()]),
  selection: z.enum(["retained", "pruned"]), selectionReason: z.union([PruningReasonSchema, z.null()]) });
export const ManifestBodySchema = z.strictObject({ ...envelope("PlanningAlternatives"), contextSnapshot: ArtifactRefSchema,
  options: z.array(ManifestEntrySchema).max(2048), retainedOptionIds: idSet(256), manifestLimit: z.number().int().min(1).max(2048),
  deferredObligations: DeferredObligationsSchema,
  coverage: z.literal("actually_generated_only"), globalOptimality: z.literal(false), exhaustive: z.literal(false) });
export const PlanningAlternativesSchema = ManifestBodySchema.extend({ manifestId: IdSchema }).refine(v => checkIdentity(v, "manifestId", "planning_alternatives_v0"), "Manifest identity mismatch.");
export type PlanningAlternatives = z.infer<typeof PlanningAlternativesSchema>;
export const PlanningOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("chosen"), optionId: IdSchema }),
  z.strictObject({ kind: z.literal("tie"), optionIds: idSet(256).refine(v => v.length > 0, "Tie must be nonempty.") }),
  z.strictObject({ kind: z.literal("abstained"), reasonCode: z.enum(["required_evidence_missing", "objective_evidence_missing", "search_limit", "tie_exceeds_retention_bound"]) }),
  z.strictObject({ kind: z.literal("infeasible"), reasonCode: z.literal("no_feasible_considered_sequence") }),
]);
export type PlanningOutcome = z.infer<typeof PlanningOutcomeSchema>;
export const BudgetTraceBodySchema = z.strictObject({ ...envelope("PlanningBudgetTrace"), scope: ScopeSchema, contextSnapshot: ArtifactRefSchema,
  computeBudget: ArtifactRefSchema, authorizationRef: ArtifactRefSchema, policy: ArtifactRefSchema, expandedStates: Nat,
  duration: MissingSchema, cost: MissingSchema, resourceUse: MissingSchema, modelRun: MissingSchema, costEvent: MissingSchema,
  accounting: z.literal("authorization_reference_and_search_work_only") });
export const PlanningBudgetTraceSchema = BudgetTraceBodySchema.extend({ traceId: IdSchema }).refine(v => checkIdentity(v, "traceId", "planning_budget_trace_v0"), "Budget trace identity mismatch.");
export type PlanningBudgetTrace = z.infer<typeof PlanningBudgetTraceSchema>;
export const SearchRunBodySchema = z.strictObject({ ...envelope("PlanningSearchRun"), scope: ScopeSchema, contextSnapshot: ArtifactRefSchema,
  policy: ArtifactRefSchema, retrievals: refSet(), boundaries: refSet(), alternativesConsidered: ArtifactRefSchema,
  stoppingReason: z.enum(["maximum_depth", "expanded_state_limit", "empty_frontier"]), expandedStates: Nat, maximumDepthReached: Nat,
  seed: SeedSchema, outcome: PlanningOutcomeSchema, budgetTrace: ArtifactRefSchema,
  producer: z.strictObject({ producerId: z.literal("owned_bounded_planner"), producerVersion: z.literal(PLANNING_VERSION), computationBasis: z.literal("deterministic") }),
  globalOptimality: z.literal(false), exhaustive: z.literal(false) });
export const PlanningSearchRunSchema = SearchRunBodySchema.extend({ searchRunId: IdSchema }).refine(v => checkIdentity(v, "searchRunId", "planning_search_run_v0"), "Search receipt identity mismatch.");
export type PlanningSearchRun = z.infer<typeof PlanningSearchRunSchema>;
export const DecisionBodySchema = z.strictObject({ ...envelope("PlanningDecision"), version: z.literal(PLANNING_VERSION), scope: ScopeSchema,
  searchRun: ArtifactRefSchema, contextSnapshot: ArtifactRefSchema, direction: ArtifactRefSchema, candidateUniverse: ArtifactRefSchema,
  alternativesConsidered: ArtifactRefSchema, scoresAndMissingness: EvidenceRefSchema, policy: EvidenceRefSchema, constraintsChecked: EvidenceRefSchema,
  outcome: PlanningOutcomeSchema, uncertainty: z.strictObject({ state: z.literal("unknown"), reasonCode: z.literal("bounded_heuristic_uncalibrated"),
    feasibilityScope: z.literal("considered_sequences_only"), executionAssessment: z.literal("deferred"), creativeQuality: z.literal("unverified") }),
  evidenceRefs: evidenceSet, budgetTrace: ArtifactRefSchema, previousDecisions: refSet(8) });
export const PlanningDecisionSchema = DecisionBodySchema.extend({ planningDecisionId: IdSchema }).refine(v => checkIdentity(v, "planningDecisionId", "planning_decision_v0"), "Planning decision identity mismatch.");
export type PlanningDecision = z.infer<typeof PlanningDecisionSchema>;

/** Exact canonical bytes for internal outputs; no persistence, paths, or ambient state. */
export function supplied(value: { artifactType: string; artifactVersion: string }, objectId: string): SuppliedArtifact {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  return { ref: { objectId, artifactType: value.artifactType, artifactVersion: value.artifactVersion, sha256: exactDigest(bytes) }, bytes, value: structuredClone(value) };
}
