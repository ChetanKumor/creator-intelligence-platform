/**
 * Phase 5 Gate 6 EditGraph V0: the internal editable representation of exactly one replay-valid chosen Gate-5
 * decision. Source ranges are exact canonical source instants, decoded exactly from the Gate-5 boundary at the declared
 * clock (Gate 7 Batch 3A-F); output time is an exact integer tick clock. Operations exist only
 * from supplied typed resolutions; every deferred obligation is retained; capability evidence is supplied, never probed.
 * Nothing here renders, previews, executes or emits a public plan or event.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, checkIdentity, compareText, equal, identify, type ArtifactRef, type EvidenceRef,
  type SuppliedArtifact } from "../editorial/common.js";
import { CreativeDirectionGraphSchema, type CreativeDirectionGraph } from "../director/index.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { PlanningAlternativesSchema, PlanningContextSchema, PlanningDecisionSchema, validatePlanningDecision, type PlanningAlternatives,
  type PlanningSequence } from "../planning/index.js";
import { BoundaryAuthoritySchema } from "../planning/common.js";
import { CapabilityAssessmentSchema, CapabilityRequirementSchema, CapabilitySnapshotSchema, ExecutorIdentitySchema, assessRequirement, bindSnapshotAttestations,
  checkSnapshotLimits, createRequirement, type CapabilityAssessment, type Predicate } from "./capability.js";
import { AspectSchema, ClockSchema, EDIT_GRAPH_RECORD_VERSION, EDIT_GRAPH_REVISION_RECORD_VERSION, EDIT_GRAPH_VERSION, FrameRateBoundsSchema, HashSchema, Nat,
  ResolutionBoundsSchema, ScopeSchema, SourceRangeSchema, at, canonicalTime, ceilDivide, check, compareTimes, convertTime, decodeLegacySeconds, exactArtifact, guard, parse,
  parseCanonical, rateOf, refSet, refuse, sameInstant, sameScope, tickTime, type ExactTime, type Scope, type SourceRange } from "./common.js";
import { EditGraphPolicySchema, EditOutputProfileSchema } from "./profile.js";
import { LookSchema, TechniqueResolutionSchema, type TechniqueResolution } from "./resolution.js";

export const VIDEO_TRACK = "track_video_primary";
export const AUDIO_TRACK = "track_source_audio_primary";
export const MAX_RESOLUTIONS = 64;
const OPERATION_INTENTIONS = ["color_intention", "graphics_intention", "music_relationship", "sound_design_intention", "technique_intention", "transition_intention"] as const;
type DirectionNode = CreativeDirectionGraph["nodes"][number];
type DeferredRecord = PlanningAlternatives["deferredObligations"][number];
type GateFiveCheck = PlanningSequence["hardConstraints"][number];
type BoundaryAuthority = z.infer<typeof BoundaryAuthoritySchema>;

// ---------------------------------------------------------------- clip uses: exact source authority on an exact output clock
const TicksRangeSchema = z.strictObject({ startTicks: Nat, endTicks: Nat }).refine(v => v.endTicks > v.startTicks, "Output ranges must be positive.");
const PlanningUseRefSchema = z.strictObject({ decision: ArtifactRefSchema, optionId: IdSchema, useId: IdSchema, position: Nat });
const SourceSchema = z.strictObject({
  assetId: IdSchema, sourceHash: HashSchema, analysis: ArtifactRefSchema, shotId: IdSchema, boundaryId: IdSchema,
  range: SourceRangeSchema, precision: z.enum(["frame_pts_exact", "source_seconds"]),
  startAuthority: BoundaryAuthoritySchema, endAuthority: BoundaryAuthoritySchema, timebase: EvidenceRefSchema, support: EvidenceRefSchema,
}).refine(s => (s.precision === "frame_pts_exact") === (s.startAuthority.kind === "frame_pts" && s.endAuthority.kind === "frame_pts"), "Precision must follow the endpoint authority.");
const MappingSchema = z.strictObject({
  kind: z.literal("constant_speed_identity"), rate: z.strictObject({ numerator: z.literal(1), denominator: z.literal(1) }),
  sourceStartTicks: Nat, sourceEndTicks: Nat, exactness: z.literal("source_endpoints_exact_on_output_clock"),
});
const FramingSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("source_aspect_matches_output"), sourceAspect: AspectSchema, evidence: EvidenceRefSchema }),
  z.strictObject({ state: z.literal("unresolved"), reasonCode: z.literal("source_aspect_differs_from_output"), sourceAspect: AspectSchema, evidence: EvidenceRefSchema }),
]);
const SourceAudioSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("linked"), evidence: EvidenceRefSchema }),
  z.strictObject({ state: z.literal("excluded_by_policy"), evidence: EvidenceRefSchema, policy: EvidenceRefSchema }),
  z.strictObject({ state: z.literal("absent_in_source"), evidence: EvidenceRefSchema }),
]);
const clipUseFields = { planningUse: PlanningUseRefSchema, candidateId: IdSchema, token: ArtifactRefSchema, directionNodeId: IdSchema,
  source: SourceSchema, output: TicksRangeSchema, mapping: MappingSchema };
const clipIdentity = (v: object) => checkIdentity(v, "clipUseId", "edit_graph_clip_use_v0");
const VideoClipUseSchema = z.strictObject({ medium: z.literal("video"), trackId: z.literal(VIDEO_TRACK), ...clipUseFields, framing: FramingSchema, sourceAudio: SourceAudioSchema,
  clipUseId: IdSchema }).refine(clipIdentity, "Clip use identity mismatch.");
const AudioClipUseSchema = z.strictObject({ medium: z.literal("source_audio"), trackId: z.literal(AUDIO_TRACK), ...clipUseFields, linkedVideoClipUseId: IdSchema,
  gain: z.strictObject({ numerator: z.literal(1), denominator: z.literal(1) }), clipUseId: IdSchema }).refine(clipIdentity, "Clip use identity mismatch.");
export const ClipUseSchema = z.discriminatedUnion("medium", [VideoClipUseSchema, AudioClipUseSchema]);
export type VideoClipUse = z.infer<typeof VideoClipUseSchema>;
export type AudioClipUse = z.infer<typeof AudioClipUseSchema>;
export type ClipUse = z.infer<typeof ClipUseSchema>;

// ---------------------------------------------------------------- typed V0 operations (two registered primitives)
const ResolvedFromSchema = z.strictObject({ resolution: ArtifactRefSchema, obligationNodeId: IdSchema, directionNode: EvidenceRefSchema });
const operationIdentity = (v: object) => checkIdentity(v, "operationId", "edit_graph_operation_v0");
const ColorLookOperationSchema = z.strictObject({
  primitive: z.literal("color_look"), parameters: z.strictObject({ look: LookSchema, intensityPerMille: z.number().int().min(0).max(1000) }),
  target: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("whole_output") }), z.strictObject({ kind: z.literal("clip_uses"), clipUseIds: z.array(IdSchema).min(1).max(16) })]),
  extents: z.array(TicksRangeSchema).min(1).max(16), resolvedFrom: ResolvedFromSchema, operationId: IdSchema,
}).refine(operationIdentity, "Operation identity mismatch.");
const CutOperationSchema = z.strictObject({
  primitive: z.literal("cut_transition"), parameters: z.strictObject({ kind: z.literal("cut") }),
  target: z.strictObject({ kind: z.literal("join"), fromClipUseId: IdSchema, toClipUseId: IdSchema }), atTicks: Nat, resolvedFrom: ResolvedFromSchema, operationId: IdSchema,
}).refine(operationIdentity, "Operation identity mismatch.");
export const OperationSchema = z.discriminatedUnion("primitive", [ColorLookOperationSchema, CutOperationSchema]);
export type Operation = z.infer<typeof OperationSchema>;
type ColorLookOperation = z.infer<typeof ColorLookOperationSchema>;

// ---------------------------------------------------------------- retained obligations and deferred Gate-5 checks
const ApplicabilitySchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("active") }),
  z.strictObject({ state: z.literal("inactive_alternative"), branchId: IdSchema, selectedChoiceId: IdSchema }),
  z.strictObject({ state: z.literal("undetermined_alternative"), branchId: IdSchema }),
]);
type Applicability = z.infer<typeof ApplicabilitySchema>;
const DispositionSchema = z.discriminatedUnion("state", [
  // Bound to a typed operation. This is not a claim that the creative intention is satisfied.
  z.strictObject({ state: z.literal("bound_to_operation"), resolution: ArtifactRefSchema, operationId: IdSchema }),
  z.strictObject({ state: z.literal("unresolved"), reasonCode: z.enum(["technique_resolution_not_supplied", "alternative_branch_undetermined"]) }),
  z.strictObject({ state: z.literal("not_applicable"), reasonCode: z.literal("unselected_alternative_choice") }),
]);
type Disposition = z.infer<typeof DispositionSchema>;
const ObligationSchema = z.strictObject({
  nodeId: IdSchema, intentionKind: z.enum(OPERATION_INTENTIONS), priority: z.enum(["hard", "soft"]), directorRequirementIds: z.array(IdSchema).max(256),
  directionNode: EvidenceRefSchema, gate5ReasonCode: z.enum(["no_source_binding", "operation_intention"]), applicability: ApplicabilitySchema, disposition: DispositionSchema,
}).refine(o => o.applicability.state === "active"
  ? o.disposition.state === "bound_to_operation" || (o.disposition.state === "unresolved" && o.disposition.reasonCode === "technique_resolution_not_supplied")
  : o.applicability.state === "inactive_alternative" ? o.disposition.state === "not_applicable"
    : o.disposition.state === "unresolved" && o.disposition.reasonCode === "alternative_branch_undetermined", "Obligation disposition contradicts its applicability.");
export type Obligation = z.infer<typeof ObligationSchema>;
const DeferredCheckSchema = z.strictObject({
  checkId: IdSchema, origin: z.enum(["hard_constraint", "soft_finding"]), reasonCode: IdSchema, evidenceRefs: z.array(EvidenceRefSchema).max(4096),
  gate5Check: EvidenceRefSchema, disposition: z.enum(["obligation_bound", "obligation_unresolved", "not_verified_in_v0"]),
});
type DeferredCheck = z.infer<typeof DeferredCheckSchema>;
const UnresolvedSchema = z.strictObject({ code: z.enum(["deferred_check_not_verified", "framing_unresolved", "operation_obligation_unresolved"]), subjectId: IdSchema, evidence: EvidenceRefSchema });
type Unresolved = z.infer<typeof UnresolvedSchema>;

// ---------------------------------------------------------------- readiness: capability is not budget, and neither is permission
const CapabilityBlockingSchema = z.strictObject({ code: z.enum(["capability_not_available", "no_single_executor_covers_graph", "unresolved_requirement"]), subjectId: IdSchema });
type CapabilityBlocking = z.infer<typeof CapabilityBlockingSchema>;
const BlockingSchema = z.strictObject({ code: z.enum(["budget_feasibility_unverified", "capability_not_available", "no_single_executor_covers_graph", "unresolved_requirement"]),
  subjectId: IdSchema });
type Blocking = z.infer<typeof BlockingSchema>;
export const EXECUTION_BUDGET_SUBJECT = "execution_budget";
/**
 * Capability readiness and overall execution readiness are separate claims. No accepted artifact states the execution
 * workload or reserves execution resources, and the only bound budget is the Gate-5 planning authorization, which is not
 * repurposed. Budget feasibility is therefore always unverified in V0, so no graph claims overall execution readiness.
 */
const ExecutabilitySchema = z.strictObject({
  state: z.literal("not_execution_ready"),
  capability: z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("capability_ready"), eligibleExecutors: z.array(ExecutorIdentitySchema).min(1).max(32) }),
    z.strictObject({ state: z.literal("capability_not_ready"), blocking: z.array(CapabilityBlockingSchema).min(1).max(4096) }),
  ]),
  budget: z.strictObject({ state: z.literal("unverified"), reasonCode: z.literal("budget_feasibility_unverified"), planningBudget: ArtifactRefSchema,
    planningBudgetMeaning: z.literal("gate5_planning_authorization_not_execution_budget") }),
  blocking: z.array(BlockingSchema).min(1).max(4097),
  permission: z.literal("not_granted"), recheck: z.literal("required_immediately_before_execution"),
});
type Executability = z.infer<typeof ExecutabilitySchema>;

const canonicalRefs = z.array(ArtifactRefSchema).max(MAX_RESOLUTIONS)
  .refine(v => v.every((r, i) => i === 0 || compareText(v[i - 1]!.objectId, r.objectId) < 0), "References must be unique and canonical.");
const EditGraphBodySchema = z.strictObject({
  artifactType: z.literal("EditGraph"), artifactVersion: z.literal(EDIT_GRAPH_RECORD_VERSION), stability: z.literal("internal_pre_stable"),
  version: z.literal(EDIT_GRAPH_RECORD_VERSION), scope: ScopeSchema,
  revision: z.literal(0), parent: z.strictObject({ state: z.literal("not_applicable"), reasonCode: z.literal("initial_graph"), evidenceRefs: z.array(EvidenceRefSchema).length(0) }),
  changeSet: z.strictObject({ kind: z.literal("initial_graph"), affectedOutput: z.literal("entire_output") }),
  lineage: z.strictObject({ planningDecision: ArtifactRefSchema, searchRun: ArtifactRefSchema, alternatives: ArtifactRefSchema, context: ArtifactRefSchema, chosenOptionId: IdSchema,
    direction: ArtifactRefSchema, worldSnapshot: ArtifactRefSchema, worldView: ArtifactRefSchema, candidateUniverse: ArtifactRefSchema }),
  // Source authorization/retention was established by the pinned Gate-5 world view at its supplied access time only.
  sourceAccess: z.strictObject({ basis: z.literal("gate5_pinned_world_view"), accessAsOf: TimestampSchema, recheck: z.literal("required_immediately_before_execution") }),
  policy: ArtifactRefSchema, outputProfile: ArtifactRefSchema,
  output: z.strictObject({ aspectRatio: AspectSchema, resolution: ResolutionBoundsSchema, frameRate: FrameRateBoundsSchema, clock: ClockSchema,
    durationTicks: z.number().int().positive().safe(), frameAlignment: z.literal("not_asserted") }),
  tracks: z.array(z.strictObject({ trackId: z.enum([VIDEO_TRACK, AUDIO_TRACK]), kind: z.enum(["video", "source_audio"]), order: Nat, overlap: z.literal("forbidden"),
    clipUseIds: z.array(IdSchema).min(1).max(16) })).min(1).max(2),
  clipUses: z.array(ClipUseSchema).min(1).max(32),
  operations: z.array(OperationSchema).max(MAX_RESOLUTIONS),
  dependencies: z.array(z.strictObject({ from: IdSchema, to: IdSchema, kind: z.enum(["applies_to", "join_from", "join_to", "linked_to"]) })).max(2048),
  obligations: z.array(ObligationSchema).max(256),
  deferredChecks: z.array(DeferredCheckSchema).max(4096),
  techniqueResolutions: canonicalRefs,
  capabilityRequirements: z.array(CapabilityRequirementSchema).min(1).max(MAX_RESOLUTIONS + 3),
  capability: z.strictObject({ snapshot: ArtifactRefSchema, environment: IdSchema, asOf: TimestampSchema, assessments: z.array(CapabilityAssessmentSchema).min(1).max(MAX_RESOLUTIONS + 3) }),
  unresolved: z.array(UnresolvedSchema).max(4096),
  executability: ExecutabilitySchema,
});
type EditGraphBody = z.infer<typeof EditGraphBodySchema>;
/** The composition body every EditGraph record version shares (a separate statement: accepted source scanners read declarations literally). */
export { EditGraphBodySchema };
export const EditGraphSchema = EditGraphBodySchema.extend({ editGraphId: IdSchema }).superRefine((graph, ctx) => {
  for (const message of graphIssues(graph)) ctx.addIssue({ code: "custom", message });
});
export type EditGraph = z.infer<typeof EditGraphSchema>;

const byOrder = <T>(compare: (a: T, b: T) => number) => (values: readonly T[]) => [...values].sort(compare);
export function deriveUnresolved(obligations: readonly Obligation[], deferredChecks: readonly DeferredCheck[], clipUses: readonly ClipUse[]): Unresolved[] {
  return byOrder<Unresolved>((a, b) => compareText(a.code, b.code) || compareText(a.subjectId, b.subjectId))([
    ...obligations.flatMap(o => o.disposition.state === "unresolved" ? [{ code: "operation_obligation_unresolved" as const, subjectId: o.nodeId, evidence: o.directionNode }] : []),
    // V0 verifies no deferred relationship, requirement, constraint or branch semantics: hard ones block, soft ones stay recorded.
    ...deferredChecks.flatMap(c => c.origin === "hard_constraint" && c.disposition === "not_verified_in_v0"
      ? [{ code: "deferred_check_not_verified" as const, subjectId: c.checkId, evidence: c.gate5Check }] : []),
    ...clipUses.flatMap(c => c.medium === "video" && c.framing.state === "unresolved" ? [{ code: "framing_unresolved" as const, subjectId: c.clipUseId, evidence: c.framing.evidence }] : []),
  ]);
}
const byBlocking = <T extends Blocking>(values: readonly T[]) => byOrder<T>((a, b) => compareText(a.code, b.code) || compareText(a.subjectId, b.subjectId))(values);
export function deriveExecutability(assessments: readonly CapabilityAssessment[], unresolved: readonly Unresolved[], snapshot: ArtifactRef, planningBudget: ArtifactRef): Executability {
  const capabilityBlocking = new Map<string, CapabilityBlocking>();
  const add = (code: CapabilityBlocking["code"], subjectId: string) => capabilityBlocking.set(canonicalSerialize([code, subjectId]), { code, subjectId });
  for (const item of unresolved) add("unresolved_requirement", item.subjectId);
  for (const assessment of assessments) if (assessment.state !== "AVAILABLE") add("capability_not_available", assessment.requirementId);
  const identities = assessments[0]?.executors.map(e => e.executor) ?? [];
  const eligible = identities.filter((_, index) => assessments.every(a => a.executors[index]?.state === "AVAILABLE"));
  // Requirements proven only on different executors do not prove that any single executor can run the graph.
  if (capabilityBlocking.size === 0 && eligible.length === 0) add("no_single_executor_covers_graph", snapshot.objectId);
  const blockers = byBlocking([...capabilityBlocking.values()]);
  return { state: "not_execution_ready",
    capability: blockers.length ? { state: "capability_not_ready", blocking: blockers } : { state: "capability_ready", eligibleExecutors: eligible },
    budget: { state: "unverified", reasonCode: "budget_feasibility_unverified", planningBudget, planningBudgetMeaning: "gate5_planning_authorization_not_execution_budget" },
    blocking: byBlocking<Blocking>([...blockers, { code: "budget_feasibility_unverified", subjectId: EXECUTION_BUDGET_SUBJECT }]),
    permission: "not_granted", recheck: "required_immediately_before_execution" };
}

/** What the structural invariants read: every EditGraph version shares these fields (a revision differs only in its version, revision, parent and change set). */
export type EditGraphIssueInput = Omit<EditGraphBody, "artifactVersion" | "version" | "revision" | "parent" | "changeSet"> & { editGraphId: string };
/** Structural invariants checked on every parse; semantic truth is established only by replay in validateEditGraph. */
export function graphIssues(graph: EditGraphIssueInput): string[] {
  const issues: string[] = [], fail = (message: string) => { issues.push(message); };
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (!checkIdentity(graph, "editGraphId", "edit_graph_v0")) fail("EditGraph identity mismatch.");
  if (!unique(graph.clipUses.map(c => c.clipUseId))) fail("Repeated clip-use occurrence identity.");
  if (!unique(graph.operations.map(o => o.operationId))) fail("Repeated operation identity.");
  if (!unique(graph.obligations.map(o => o.nodeId))) fail("Repeated obligation.");
  if (!unique(graph.capabilityRequirements.map(q => q.requirementId))) fail("Repeated capability requirement.");
  if (issues.length) return issues;
  const tps = graph.output.clock.ticksPerSecond, byId = new Map(graph.clipUses.map(c => [c.clipUseId, c]));
  const [videoTrack, audioTrack, ...extraTracks] = graph.tracks;
  if (!videoTrack || videoTrack.trackId !== VIDEO_TRACK || videoTrack.kind !== "video" || videoTrack.order !== 0) fail("The primary video track must be first.");
  if (audioTrack && (audioTrack.trackId !== AUDIO_TRACK || audioTrack.kind !== "source_audio" || audioTrack.order !== 1)) fail("Invalid linked source-audio track.");
  if (extraTracks.length) fail("Unexpected track.");
  const membership = graph.tracks.flatMap(t => t.clipUseIds.map(id => ({ track: t.trackId, id })));
  if (membership.length !== graph.clipUses.length || !unique(membership.map(m => m.id))) fail("Every clip use belongs to exactly one track.");
  for (const m of membership) if (byId.get(m.id)?.trackId !== m.track) fail("Track membership contradicts its clip use.");
  if (issues.length) return issues;
  const video = videoTrack!.clipUseIds.map(id => byId.get(id)!).filter((c): c is VideoClipUse => c.medium === "video");
  if (video.length !== videoTrack!.clipUseIds.length) fail("The video track holds only video uses.");
  video.forEach((clip, index) => {
    if (clip.output.startTicks !== (index === 0 ? 0 : video[index - 1]!.output.endTicks)) fail("Video output must be contiguous from zero with no gap or undeclared overlap.");
    if (clip.planningUse.position !== index) fail("Video track order must follow the chosen Gate-5 sequence.");
  });
  if (video.at(-1)?.output.endTicks !== graph.output.durationTicks) fail("The video track must end exactly at the output duration.");
  const audio = (audioTrack?.clipUseIds ?? []).map(id => byId.get(id)!).filter((c): c is AudioClipUse => c.medium === "source_audio");
  if (audio.length !== (audioTrack?.clipUseIds.length ?? 0)) fail("The source-audio track holds only linked source audio.");
  audio.forEach((clip, index) => {
    if (index > 0 && clip.output.startTicks < audio[index - 1]!.output.endTicks) fail("Source audio uses cannot overlap.");
    const linked = byId.get(clip.linkedVideoClipUseId);
    if (linked?.medium !== "video" || linked.sourceAudio.state !== "linked" || !equal([linked.planningUse, linked.source, linked.output, linked.mapping], [clip.planningUse, clip.source, clip.output, clip.mapping])) {
      fail("Linked source audio must mirror its exact video use.");
    }
  });
  for (const clip of video) if ((clip.sourceAudio.state === "linked") !== (audio.filter(a => a.linkedVideoClipUseId === clip.clipUseId).length === 1)) fail("Linked audio state contradicts the audio track.");
  for (const clip of graph.clipUses) {
    const { mapping, output, source } = clip;
    if (mapping.sourceEndTicks - mapping.sourceStartTicks !== output.endTicks - output.startTicks) fail("Identity mapping must preserve duration exactly.");
    if (!sameInstant(tickTime(mapping.sourceStartTicks, tps), source.range.start) || !sameInstant(tickTime(mapping.sourceEndTicks, tps), source.range.end)) {
      fail("Mapping must encode the exact source instants.");
    }
  }
  const videoIndex = new Map(video.map((c, i) => [c.clipUseId, i]));
  for (const operation of graph.operations) {
    if (operation.primitive === "color_look") {
      const targets = operation.target.kind === "whole_output" ? [] : operation.target.clipUseIds.map(id => videoIndex.get(id));
      if (targets.some(index => index === undefined)) { fail("Operation targets must be video uses of this graph."); continue; }
      const expected = operation.target.kind === "whole_output" ? [{ startTicks: 0, endTicks: graph.output.durationTicks }] : targets.map(index => video[index!]!.output);
      if (!equal(expected, operation.extents)) fail("Operation extents must equal their exact target output ranges.");
    } else {
      const from = videoIndex.get(operation.target.fromClipUseId), to = videoIndex.get(operation.target.toClipUseId);
      if (from === undefined || to !== from + 1 || operation.atTicks !== video[from]!.output.endTicks) fail("A cut must sit at an exact adjacent join.");
    }
  }
  const bound = graph.obligations.flatMap(o => o.disposition.state === "bound_to_operation" ? [{ nodeId: o.nodeId, disposition: o.disposition }] : []);
  if (bound.length !== graph.operations.length) fail("Every operation must come from exactly one bound obligation.");
  for (const b of bound) {
    const operation = graph.operations.find(o => o.operationId === b.disposition.operationId);
    if (!operation || operation.resolvedFrom.obligationNodeId !== b.nodeId || !equal(operation.resolvedFrom.resolution, b.disposition.resolution)) fail("Bound obligation contradicts its operation.");
  }
  if (!equal(graph.techniqueResolutions, [...bound.map(b => b.disposition.resolution)].sort((a, b) => compareText(a.objectId, b.objectId)))) fail("Resolutions must equal bound obligations.");
  const nodes = new Set([...graph.clipUses.map(c => c.clipUseId), ...graph.operations.map(o => o.operationId)]);
  for (const requirement of graph.capabilityRequirements) if (!requirement.imposedBy.every(id => nodes.has(id))) fail("Requirement imposed by an unknown graph node.");
  for (const dependency of graph.dependencies) if (!nodes.has(dependency.from) || !nodes.has(dependency.to)) fail("Dependency references an unknown graph node.");
  const assessments = graph.capability.assessments, identities = assessments[0]?.executors.map(e => e.executor);
  if (assessments.length !== graph.capabilityRequirements.length || assessments.some((a, i) => a.requirementId !== graph.capabilityRequirements[i]!.requirementId)) fail("Exactly one assessment per requirement.");
  for (const assessment of assessments) {
    if (!equal(assessment.executors.map(e => e.executor), identities)) fail("Assessments must cover the same snapshot executors.");
    for (const executor of assessment.executors) if (executor.declaration.state === "present" && !equal(executor.declaration.value.artifact, graph.capability.snapshot)) fail("Proof must point into the bound snapshot.");
  }
  if (!equal(graph.unresolved, deriveUnresolved(graph.obligations, graph.deferredChecks, graph.clipUses))) fail("Unresolved requirements contradict graph content.");
  if (!equal(graph.executability, deriveExecutability(assessments, graph.unresolved, graph.capability.snapshot, graph.executability.budget.planningBudget))) {
    fail("Readiness contradicts assessments, unresolved requirements or budget evidence.");
  }
  return issues;
}

// ---------------------------------------------------------------- construction
const RequestSchema = z.strictObject({
  planningDecision: ArtifactRefSchema, policy: ArtifactRefSchema, outputProfile: ArtifactRefSchema,
  techniqueResolutions: refSet(MAX_RESOLUTIONS), capabilitySnapshot: ArtifactRefSchema,
});
export type EditGraphRequest = z.input<typeof RequestSchema>;
const member = (name: Predicate["name"], value: string): Predicate => ({ name, kind: "member", value });
const atMost = (name: Predicate["name"], value: number): Predicate => ({ name, kind: "at_most", value });

/**
 * An exact source selection for one use of the chosen sequence, replacing the Gate-5 decoding of its boundary. Only a validated GraphDiff
 * application supplies selections (Gate 7 Batch 3B), one for every use; each must stay inside its use's Gate-5 boundary and be exact on the
 * graph clock. Everything else is derived by the same construction as an initial graph.
 */
export interface SourceSelection { range: SourceRange; startAuthority: BoundaryAuthority; endAuthority: BoundaryAuthority; precision: "frame_pts_exact" | "source_seconds" }
export function buildEditGraph(requestInput: unknown, artifacts: readonly SuppliedArtifact[]): EditGraph {
  return parse(EditGraphSchema, identify("edit_graph_v0", "editGraphId", constructEditGraphBody(requestInput, artifacts)));
}
/** The accepted construction: the Gate-5 decision replayed, then every composition field derived. Returns the unidentified 0.2.0 body. */
export function constructEditGraphBody(requestInput: unknown, artifacts: readonly SuppliedArtifact[], selections?: ReadonlyMap<string, SourceSelection>) {
  const rawResolutions = requestInput !== null && typeof requestInput === "object" ? (requestInput as Record<string, unknown>).techniqueResolutions : undefined;
  check(!Array.isArray(rawResolutions) || rawResolutions.length <= MAX_RESOLUTIONS, "limit_exceeded", `At most ${MAX_RESOLUTIONS} technique resolutions per graph.`);
  const request = parse(RequestSchema, requestInput);
  const map = guard("input_invalid", () => new EditorialArtifactMap(artifacts));
  // A structural read fixes the claimed scope so foreign Gate-6 inputs fail before any replay work.
  const claimed = parse(PlanningDecisionSchema, exactArtifact(map, request.planningDecision, "PlanningDecision", "0.1.0", "planning_lineage_invalid"), "planning_lineage_invalid");
  const scope = claimed.scope;
  const policy = parseCanonical(EditGraphPolicySchema, exactArtifact(map, request.policy, "EditGraphPolicy"));
  const profile = parseCanonical(EditOutputProfileSchema, exactArtifact(map, request.outputProfile, "EditOutputProfile"));
  const snapshotValue = exactArtifact(map, request.capabilitySnapshot, "CapabilitySnapshot", EDIT_GRAPH_VERSION, "capability_snapshot_invalid");
  checkSnapshotLimits(snapshotValue);
  // Proof pointers address the exact supplied bytes, so the snapshot must already be canonical.
  const snapshot = parseCanonical(CapabilitySnapshotSchema, snapshotValue, "capability_snapshot_invalid");
  const resolutions = request.techniqueResolutions.map(ref => ({ ref, value: parseCanonical(TechniqueResolutionSchema, exactArtifact(map, ref, "TechniqueResolution")) }));
  const scoped: [string, Scope][] = [["graph policy", policy.scope], ["output profile", profile.scope], ["capability snapshot", snapshot.scope],
    ...resolutions.map((r): [string, Scope] => ["technique resolution", r.value.scope])];
  for (const [name, other] of scoped) check(sameScope(other, scope), "scope_mismatch", `Foreign ${name} scope.`);
  const attestations = guard("capability_snapshot_invalid", () => bindSnapshotAttestations(snapshot, map));

  // Replay Gate-5 semantics: a parseable decision is not evidence that the bounded search chose it.
  const decision = guard("planning_lineage_invalid", () => validatePlanningDecision(claimed, artifacts));
  const outcome = decision.outcome;
  if (outcome.kind !== "chosen") refuse("planning_outcome_not_chosen", `Gate-5 outcome is ${outcome.kind}; Gate 6 never selects or invents a winner.`);
  const lineage = <S extends z.ZodType>(schema: S, ref: ArtifactRef, kind: string, version = "0.1.0") =>
    parse(schema, exactArtifact(map, ref, kind, version, "planning_lineage_invalid"), "planning_lineage_invalid");
  const manifest = lineage(PlanningAlternativesSchema, decision.alternativesConsidered, "PlanningAlternatives");
  const entryIndex = manifest.options.findIndex(e => e.option.optionId === outcome.optionId), entry = manifest.options[entryIndex];
  check(entry !== undefined && entry.selection === "retained" && manifest.retainedOptionIds.includes(outcome.optionId), "planning_lineage_invalid",
    "The chosen option is not a retained generated alternative.");
  const option = entry.option;
  const context = lineage(PlanningContextSchema, decision.contextSnapshot, "PlanningContext");
  const direction = lineage(CreativeDirectionGraphSchema, decision.direction, "CreativeDirectionGraph");
  const analyses = new Map<string, z.infer<typeof FootageAnalysisSchema>>();
  const analysisOf = (ref: ArtifactRef) => {
    const key = canonicalSerialize(ref);
    if (!analyses.has(key)) analyses.set(key, lineage(FootageAnalysisSchema, ref, "FootageAnalysis", "1.0.0"));
    return analyses.get(key)!;
  };

  // Clip uses: the Gate-5 boundary seconds (legacy floats) are decoded exactly at the declared clock and kept as canonical source instants;
  // output ticks exist only where the clock encodes each source instant exactly.
  const tps = profile.clock.ticksPerSecond, clock = rateOf(tps);
  check(selections === undefined || (selections.size === option.uses.length && option.uses.every(u => selections.has(u.useId))), "input_invalid",
    "A source selection names exactly every use of the chosen sequence.");
  let durationTicks = 0;
  const video: VideoClipUse[] = option.uses.map((use, position) => {
    const boundary = use.boundary;
    const start = decodeLegacySeconds(boundary.sourceRange.startSeconds, clock), end = decodeLegacySeconds(boundary.sourceRange.endSeconds, clock);
    if (start === undefined || end === undefined || end.value <= start.value) {
      refuse("time_not_representable", `Use ${use.useId} source instants are not exactly representable at ${tps} ticks per second.`);
    }
    // A revision's selection stays inside the Gate-5 boundary the use was authorized for, and must be exact on the graph clock.
    const selection = selections?.get(use.useId);
    const exactTick = (t: ExactTime) => guard("time_not_representable", () => convertTime(t, clock, "exact").value);
    if (selection !== undefined) {
      check(compareTimes(start, selection.range.start) <= 0 && compareTimes(selection.range.end, end) <= 0, "graph_diff_outside_authorized_range",
        "A revision never selects source time outside its use's Gate-5 boundary.");
    }
    const range = selection?.range ?? { start: canonicalTime(start), end: canonicalTime(end) };
    const sourceStartTicks = selection === undefined ? start.value : exactTick(range.start), sourceEndTicks = selection === undefined ? end.value : exactTick(range.end);
    const output = { startTicks: durationTicks, endTicks: durationTicks + sourceEndTicks - sourceStartTicks };
    check(Number.isSafeInteger(output.endTicks), "limit_exceeded", "The output clock exceeds safe integer ticks.");
    durationTicks = output.endTicks;
    const metadata = analysisOf(boundary.analysis).metadata;
    const sourceAspect = { width: metadata.aspectRatio.width, height: metadata.aspectRatio.height };
    const aspectEvidence = at(boundary.analysis, "/metadata/aspectRatio"), audioEvidence = at(boundary.analysis, "/metadata/hasAudio");
    const framing = sourceAspect.width * profile.aspectRatio.height === sourceAspect.height * profile.aspectRatio.width
      ? { state: "source_aspect_matches_output" as const, sourceAspect, evidence: aspectEvidence }
      : { state: "unresolved" as const, reasonCode: "source_aspect_differs_from_output" as const, sourceAspect, evidence: aspectEvidence };
    const sourceAudio = !metadata.hasAudio ? { state: "absent_in_source" as const, evidence: audioEvidence }
      : policy.sourceAudio === "linked_identity" ? { state: "linked" as const, evidence: audioEvidence }
        : { state: "excluded_by_policy" as const, evidence: audioEvidence, policy: at(request.policy, "/sourceAudio") };
    return parse(VideoClipUseSchema, identify("edit_graph_clip_use_v0", "clipUseId", {
      medium: "video", trackId: VIDEO_TRACK, planningUse: { decision: request.planningDecision, optionId: option.optionId, useId: use.useId, position },
      candidateId: use.candidateId, token: use.token, directionNodeId: use.directionNodeId,
      source: { assetId: boundary.assetId, sourceHash: boundary.sourceHash, analysis: boundary.analysis, shotId: boundary.support.shotId, boundaryId: boundary.boundaryId,
        range, precision: selection?.precision ?? boundary.precision, startAuthority: selection?.startAuthority ?? boundary.startAuthority,
        endAuthority: selection?.endAuthority ?? boundary.endAuthority, timebase: boundary.timebase, support: boundary.supportEvidence },
      output, mapping: { kind: "constant_speed_identity", rate: { numerator: 1, denominator: 1 }, sourceStartTicks, sourceEndTicks, exactness: "source_endpoints_exact_on_output_clock" },
      framing, sourceAudio }));
  });
  const audio: AudioClipUse[] = video.filter(v => v.sourceAudio.state === "linked").map(v => parse(AudioClipUseSchema, identify("edit_graph_clip_use_v0", "clipUseId", {
    medium: "source_audio", trackId: AUDIO_TRACK, planningUse: v.planningUse, candidateId: v.candidateId, token: v.token, directionNodeId: v.directionNodeId,
    source: v.source, output: v.output, mapping: v.mapping, linkedVideoClipUseId: v.clipUseId, gain: { numerator: 1, denominator: 1 } })));
  const videoIds = video.map(v => v.clipUseId), videoByUse = new Map(video.map(v => [v.planningUse.useId, v]));

  // Obligations: every Gate-5 deferred obligation is retained; only a matching typed resolution creates an operation.
  const covered = new Set(option.uses.map(u => u.directionNodeId));
  const nodeAt = (reference: EvidenceRef): DirectionNode => {
    const match = /^\/nodes\/(0|[1-9][0-9]*)$/.exec(reference.pointer);
    const node = match && equal(reference.artifact, decision.direction) ? direction.nodes[Number(match[1])] : undefined;
    check(node !== undefined, "planning_lineage_invalid", "A deferred obligation does not resolve to the exact decision direction.");
    return node;
  };
  const applicability = (nodeId: string): Applicability => {
    const branch = direction.alternatives.find(b => b.choices.some(c => c.nodeIds.includes(nodeId)));
    if (branch === undefined) return { state: "active" };
    const selected = branch.choices.filter(c => c.nodeIds.some(id => covered.has(id)));
    check(selected.length <= 1, "planning_lineage_invalid", "The chosen sequence selects mutually exclusive Director choices.");
    const choice = selected[0];
    if (choice === undefined) return { state: "undetermined_alternative", branchId: branch.branchId };
    return choice.nodeIds.includes(nodeId) ? { state: "active" } : { state: "inactive_alternative", branchId: branch.branchId, selectedChoiceId: choice.choiceId };
  };
  const byNode = new Map<string, { ref: ArtifactRef; value: TechniqueResolution }>();
  for (const resolution of resolutions) {
    check(!byNode.has(resolution.value.obligation.nodeId), "technique_resolution_invalid", "At most one technique resolution may bind an obligation.");
    byNode.set(resolution.value.obligation.nodeId, resolution);
  }
  for (const nodeId of byNode.keys()) check(manifest.deferredObligations.some(o => o.nodeId === nodeId), "technique_resolution_invalid",
    "A resolution may bind only a Gate-5 deferred operation obligation; source and editorial responsibilities remain Gate-5 authority.");
  const bindOperation = (resolution: { ref: ArtifactRef; value: TechniqueResolution }, record: DeferredRecord, node: DirectionNode): Operation => {
    const r = resolution.value, operation = r.operation;
    check(equal(r.planningDecision, request.planningDecision) && equal(r.direction, decision.direction), "technique_resolution_invalid",
      "The resolution is bound to another planning decision or direction.");
    check(equal(r.obligation.directionNode, record.directionNode), "technique_resolution_invalid", "The resolution names another direction node.");
    check(r.intentionKind === node.intent.kind, "technique_resolution_invalid", "The resolution kind differs from the typed Director intention.");
    const withinBinding = (use: VideoClipUse) => (node.candidates.length === 0 || node.candidates.some(c => c.candidateId === use.candidateId && equal(c.token, use.token)))
      && (node.scope.kind === "whole_edit" || (node.scope.candidate.candidateId === use.candidateId && equal(node.scope.candidate.token, use.token)));
    const resolvedFrom = { resolution: resolution.ref, obligationNodeId: record.nodeId, directionNode: record.directionNode };
    const identified = (body: object) => parse(OperationSchema, identify("edit_graph_operation_v0", "operationId", body));
    if (operation.primitive === "color_look") {
      check(node.intent.kind === "color_intention" && node.intent.mood === operation.look, "technique_resolution_invalid", "A color look must equal the typed Director mood.");
      const parameters = { look: operation.look, intensityPerMille: operation.intensityPerMille };
      if (operation.target.kind === "whole_output") {
        check(node.scope.kind === "whole_edit" && node.candidates.length === 0, "technique_resolution_invalid", "A source-bound intention cannot resolve to the whole output.");
        return identified({ primitive: "color_look", parameters, target: { kind: "whole_output" }, extents: [{ startTicks: 0, endTicks: durationTicks }], resolvedFrom });
      }
      const targets: VideoClipUse[] = [];
      for (const useId of operation.target.useIds) {
        const target = videoByUse.get(useId);
        check(target !== undefined, "technique_resolution_invalid", "The resolution names a use outside the chosen sequence.");
        check(withinBinding(target), "technique_resolution_invalid", "The resolution targets an occurrence outside the intention's bound candidates.");
        targets.push(target);
      }
      targets.sort((a, b) => a.planningUse.position - b.planningUse.position);
      return identified({ primitive: "color_look", parameters, target: { kind: "clip_uses", clipUseIds: targets.map(t => t.clipUseId) }, extents: targets.map(t => t.output), resolvedFrom });
    }
    check(node.intent.kind === "transition_intention" && node.intent.relation === "clear_change", "technique_resolution_invalid", "Only a typed clear_change intention resolves to a V0 cut.");
    const from = videoByUse.get(operation.join.fromUseId), to = videoByUse.get(operation.join.toUseId);
    check(from !== undefined && to !== undefined && to.planningUse.position === from.planningUse.position + 1, "technique_resolution_invalid",
      "A cut resolves only an adjacent join of the chosen sequence.");
    check(withinBinding(from) || withinBinding(to), "technique_resolution_invalid", "A source-bound transition must touch its bound candidate.");
    return identified({ primitive: "cut_transition", parameters: { kind: "cut" }, target: { kind: "join", fromClipUseId: from.clipUseId, toClipUseId: to.clipUseId },
      atTicks: from.output.endTicks, resolvedFrom });
  };
  const operations: Operation[] = [];
  const obligations: Obligation[] = manifest.deferredObligations.map(record => {
    const node = nodeAt(record.directionNode);
    check(node.nodeId === record.nodeId && (OPERATION_INTENTIONS as readonly string[]).includes(node.intent.kind), "planning_lineage_invalid",
      "A deferred obligation must name a typed operation intention.");
    const state = applicability(record.nodeId), resolution = byNode.get(record.nodeId);
    let disposition: Disposition;
    if (state.state !== "active") {
      check(resolution === undefined, "technique_resolution_invalid", "V0 never resolves an inactive or undetermined Director alternative.");
      disposition = state.state === "inactive_alternative" ? { state: "not_applicable", reasonCode: "unselected_alternative_choice" }
        : { state: "unresolved", reasonCode: "alternative_branch_undetermined" };
    } else if (resolution === undefined) disposition = { state: "unresolved", reasonCode: "technique_resolution_not_supplied" };
    else {
      const operation = bindOperation(resolution, record, node);
      operations.push(operation);
      disposition = { state: "bound_to_operation", resolution: resolution.ref, operationId: operation.operationId };
    }
    return parse(ObligationSchema, { nodeId: record.nodeId, intentionKind: node.intent.kind, priority: record.priority, directorRequirementIds: record.requirementIds,
      directionNode: record.directionNode, gate5ReasonCode: record.reasonCode, applicability: state, disposition });
  });
  const looks = operations.flatMap((o): ColorLookOperation[] => o.primitive === "color_look" ? [o] : []);
  for (const [i, a] of looks.entries()) for (const b of looks.slice(i + 1)) for (const x of a.extents) for (const y of b.extents) {
    check(Math.max(x.startTicks, y.startTicks) >= Math.min(x.endTicks, y.endTicks), "technique_resolution_invalid",
      "Overlapping color looks would need a stacking order V0 does not authorize.");
  }

  // Deferred Gate-5 checks are carried forward; only exact node obligations inherit a resolution disposition.
  const obligationByNode = new Map(obligations.map(o => [o.nodeId, o]));
  const nodeCheckTarget = (item: GateFiveCheck): string | undefined => {
    const reference = item.evidenceRefs[0], match = reference ? /^\/nodes\/(0|[1-9][0-9]*)$/.exec(reference.pointer) : null;
    if (item.reasonCode !== "later_gate_obligation" || item.evidenceRefs.length !== 1 || !match || !equal(reference!.artifact, decision.direction)) return undefined;
    const nodeId = direction.nodes[Number(match[1])]?.nodeId;
    return nodeId !== undefined && obligationByNode.has(nodeId) ? nodeId : undefined;
  };
  const deferredChecks: DeferredCheck[] = (["hardConstraints", "softFindings"] as const).flatMap(list => option[list].flatMap((item, index) => {
    if (item.state !== "deferred") return [];
    const nodeId = nodeCheckTarget(item);
    let disposition: DeferredCheck["disposition"] = "not_verified_in_v0";
    if (nodeId !== undefined) {
      const state = obligationByNode.get(nodeId)!.disposition.state;
      check(state !== "not_applicable", "planning_lineage_invalid", "Gate 5 deferred an unselected alternative obligation.");
      disposition = state === "bound_to_operation" ? "obligation_bound" : "obligation_unresolved";
    }
    return [{ checkId: item.checkId, origin: list === "hardConstraints" ? "hard_constraint" as const : "soft_finding" as const, reasonCode: item.reasonCode,
      evidenceRefs: item.evidenceRefs, gate5Check: at(decision.alternativesConsidered, `/options/${entryIndex}/option/${list}/${index}`), disposition }];
  }));
  const clipUses: ClipUse[] = [...video, ...audio];
  const unresolved = deriveUnresolved(obligations, deferredChecks, clipUses);

  // Capability requirements are derived from the represented graph only; assessments use the exact supplied snapshot.
  const metadata = video.map(v => analysisOf(v.source.analysis).metadata);
  const cuts = operations.filter(o => o.primitive === "cut_transition").map(o => o.operationId);
  const requirements = [
    createRequirement("timeline_video_clip", [member("time_mapping", "constant_speed_identity"), member("framing", "source_aspect_matches_output"),
      ...video.map(v => member("source_endpoint_precision", v.source.precision)), ...metadata.map(m => member("source_rotation", `rotation_${m.rotation}`)),
      ...metadata.map(m => member("source_frame_timing", m.variableFrameRate ? "variable_frame_rate" : "constant_frame_rate")),
      ...metadata.map(m => member("source_codec", `codec_${m.codec}`)),
      member("output_aspect", `aspect_${profile.aspectRatio.width}_${profile.aspectRatio.height}`),
      member("output_frame_rate", `fps_${profile.frameRate.numerator}_${profile.frameRate.denominator}`),
      atMost("output_width", profile.resolution.width), atMost("output_height", profile.resolution.height),
      atMost("output_duration_seconds_ceiling", ceilDivide(durationTicks, tps)), atMost("clip_count", video.length)], videoIds),
    ...(audio.length ? [createRequirement("timeline_source_audio", [member("audio_linkage", "linked_identity"), atMost("clip_count", audio.length)], audio.map(a => a.clipUseId))] : []),
    ...(video.length > 1 ? [createRequirement("transition_cut", [member("transition_kind", "cut"), atMost("join_count", video.length - 1)], [...videoIds.slice(0, -1), ...cuts])] : []),
    ...looks.map(o => createRequirement("color_look", [member("look", o.parameters.look), member("target_kind", o.target.kind)], [o.operationId])),
  ].sort((a, b) => compareText(a.requirementId, b.requirementId));
  const assessments = requirements.map(requirement => assessRequirement(requirement, snapshot, request.capabilitySnapshot, attestations, scope.purpose));
  type Dependency = EditGraphBody["dependencies"][number];
  const dependencies: Dependency[] = [
    ...operations.flatMap((o): Dependency[] => o.primitive === "cut_transition"
      ? [{ from: o.operationId, to: o.target.fromClipUseId, kind: "join_from" }, { from: o.operationId, to: o.target.toClipUseId, kind: "join_to" }]
      : (o.target.kind === "whole_output" ? videoIds : o.target.clipUseIds).map((to): Dependency => ({ from: o.operationId, to, kind: "applies_to" }))),
    ...audio.map((a): Dependency => ({ from: a.clipUseId, to: a.linkedVideoClipUseId, kind: "linked_to" })),
  ].sort((a, b) => compareText(a.from, b.from) || compareText(a.kind, b.kind) || compareText(a.to, b.to));
  const tracks = [{ trackId: VIDEO_TRACK, kind: "video" as const, order: 0, overlap: "forbidden" as const, clipUseIds: videoIds },
    ...(audio.length ? [{ trackId: AUDIO_TRACK, kind: "source_audio" as const, order: 1, overlap: "forbidden" as const, clipUseIds: audio.map(a => a.clipUseId) }] : [])];
  const body = {
    artifactType: "EditGraph", artifactVersion: EDIT_GRAPH_RECORD_VERSION, stability: "internal_pre_stable", version: EDIT_GRAPH_RECORD_VERSION, scope, revision: 0,
    parent: { state: "not_applicable", reasonCode: "initial_graph", evidenceRefs: [] },
    changeSet: { kind: "initial_graph", affectedOutput: "entire_output" },
    lineage: { planningDecision: request.planningDecision, searchRun: decision.searchRun, alternatives: decision.alternativesConsidered, context: decision.contextSnapshot,
      chosenOptionId: option.optionId, direction: decision.direction, worldSnapshot: context.worldSnapshot, worldView: context.worldView, candidateUniverse: decision.candidateUniverse },
    sourceAccess: { basis: "gate5_pinned_world_view", accessAsOf: context.worldQuery.accessAsOf, recheck: "required_immediately_before_execution" },
    policy: request.policy, outputProfile: request.outputProfile,
    output: { aspectRatio: profile.aspectRatio, resolution: profile.resolution, frameRate: profile.frameRate, clock: profile.clock, durationTicks, frameAlignment: "not_asserted" },
    tracks, clipUses, operations, dependencies, obligations, deferredChecks, techniqueResolutions: request.techniqueResolutions,
    capabilityRequirements: requirements, capability: { snapshot: request.capabilitySnapshot, environment: snapshot.environment, asOf: snapshot.asOf, assessments },
    unresolved, executability: deriveExecutability(assessments, unresolved, request.capabilitySnapshot, context.computeBudget),
  };
  return body;
}

/**
 * A graph of any other EditGraph version is refused before parsing. A 0.1.0 graph persisted float-second source ranges: it is never
 * reinterpreted as exact time, and the supported path is deterministic reconstruction from its Gate-5 decision.
 */
function refuseOtherVersion(input: unknown): void {
  const record = input !== null && typeof input === "object" ? input as { artifactType?: unknown; artifactVersion?: unknown } : undefined;
  if (record?.artifactType === "EditGraph" && record.artifactVersion === EDIT_GRAPH_REVISION_RECORD_VERSION) {
    refuse("graph_version_unsupported", "An EditGraph 0.3.0 revision is validated only from its exact parent and GraphDiff, never as an initial Gate-5 graph.");
  }
  if (record?.artifactType === "EditGraph" && record.artifactVersion !== EDIT_GRAPH_RECORD_VERSION) {
    refuse("graph_version_unsupported", `EditGraph ${String(record.artifactVersion)} is not the exact-time schema ${EDIT_GRAPH_RECORD_VERSION}; a legacy float-second graph is never `
      + "reinterpreted. Rebuild it from its Gate-5 decision.");
  }
}
/** Semantic replay from the graph's own exact inputs; coordinated rehashing cannot survive reconstruction. */
export function validateEditGraph(input: unknown, artifacts: readonly SuppliedArtifact[]): EditGraph {
  refuseOtherVersion(input);
  const graph = parse(EditGraphSchema, input);
  const rebuilt = buildEditGraph({ planningDecision: graph.lineage.planningDecision, policy: graph.policy, outputProfile: graph.outputProfile,
    techniqueResolutions: graph.techniqueResolutions, capabilitySnapshot: graph.capability.snapshot }, artifacts);
  check(equal(rebuilt, graph), "graph_replay_mismatch", "EditGraph contradicts deterministic reconstruction from its exact inputs.");
  return structuredClone(graph);
}
