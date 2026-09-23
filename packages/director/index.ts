/** Phase 5 Gate 4: owned creative intention over exact, explicitly supplied evidence. */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, MissingSchema, availability, checkIdentity, exactDigest, identify, ensure, equal, type SuppliedArtifact } from "../editorial/common.js";
import { EditorialCandidateSetSchema, validateCandidateSet } from "../editorial/decision.js";
import { budget, ComputeBudgetSchema, ModelProfileSchema, ModelSelectionSchema, selectModel } from "../routing/index.js";
import { WorldSnapshotSchema, WorldViewSchema, queryWorld } from "../world-model/index.js";
import { CanonViewSchema, validateCanonView } from "./canon.js";
import { DIRECTOR_VERSION, DirectorDomainSchema, DirectorEvidenceSetSchema, DirectorFailureSchema, DirectorIdSetSchema, DirectorRefSetSchema, DirectorScopeSchema, DirectorTextSchema, DirectorUncertaintySchema, canonicalEvidence, canonicalIds, directorEnvelope, exactArtifact, sameScope } from "./common.js";

export { CANON_V0, CanonEntrySchema, CanonViewSchema, createCanonView, validateCanonView, type CanonEntry, type CanonView } from "./canon.js";
export { DIRECTOR_VERSION, DirectorScopeSchema } from "./common.js";

const clone = <T>(value: T): T => structuredClone(value);
type Scope = z.infer<typeof DirectorScopeSchema>;
type Ref = z.infer<typeof ArtifactRefSchema>;
const Nat = z.number().int().nonnegative().safe();
const PrioritySchema = z.enum(["hard", "soft"]);
const RequirementSchema = z.strictObject({ requirementId: IdSchema, description: DirectorTextSchema, priority: PrioritySchema });
const RequirementsSchema = z.array(RequirementSchema).max(64).refine(
  values => values.every((value, index) => index === 0 || values[index - 1]!.requirementId < value.requirementId),
  "Requirements must be unique and sorted.",
);

const IntentBodySchema = z.strictObject({
  ...directorEnvelope("IntentSpec"), scope: DirectorScopeSchema, revision: Nat, parent: availability(ArtifactRefSchema),
  author: z.strictObject({ kind: z.enum(["owner", "creator", "editor"]), actorId: IdSchema }),
  goal: DirectorTextSchema, domain: DirectorDomainSchema, audience: DirectorTextSchema,
  outputRequirements: RequirementsSchema, mustInclude: RequirementsSchema, mustExclude: RequirementsSchema,
});
export const IntentSpecSchema = IntentBodySchema.extend({ intentId: IdSchema }).superRefine((value, ctx) => {
  if (!checkIdentity(value, "intentId", "director_intent_v0")) ctx.addIssue({ code: "custom", message: "Intent identity mismatch." });
  if ((value.revision === 0) !== (value.parent.state !== "present")) ctx.addIssue({ code: "custom", message: "Intent revision/parent mismatch." });
  const ids = [...value.outputRequirements, ...value.mustInclude, ...value.mustExclude].map(x => x.requirementId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate intent requirement ID." });
});
export type IntentSpec = z.infer<typeof IntentSpecSchema>;
export function createIntentSpec(input: z.input<typeof IntentBodySchema>, map?: EditorialArtifactMap): IntentSpec {
  const body = IntentBodySchema.parse(input);
  if (body.revision > 0) {
    ensure(map && body.parent.state === "present", "Intent revision requires exact parent.");
    const parent = IntentSpecSchema.parse(exactArtifact(map, body.parent.value, "IntentSpec"));
    ensure(sameScope(parent.scope, body.scope) && parent.revision + 1 === body.revision, "Intent parent scope/revision mismatch.");
  }
  return clone(IntentSpecSchema.parse(identify("director_intent_v0", "intentId", body)));
}
export function validateIntentSpec(input: unknown, map: EditorialArtifactMap): IntentSpec {
  const intent = IntentSpecSchema.parse(input), { intentId: _id, ...body } = intent;
  ensure(equal(createIntentSpec(body, map), intent), "Intent replay mismatch.");
  return clone(intent);
}

const CandidateBindingSchema = z.strictObject({ candidateId: IdSchema, token: ArtifactRefSchema });
const CandidateBindingsSchema = z.array(CandidateBindingSchema).max(256).refine(
  values => values.every((value, index) => index === 0 || values[index - 1]!.candidateId < value.candidateId),
  "Candidate bindings must be unique and sorted.",
);
const CandidateSummaryBodySchema = z.strictObject({
  ...directorEnvelope("DirectorCandidateSummary"), scope: DirectorScopeSchema,
  candidateSet: ArtifactRefSchema, worldSnapshot: ArtifactRefSchema, worldView: ArtifactRefSchema,
  coverage: z.enum(["complete_declared_set", "explicit_subset"]),
  candidates: CandidateBindingsSchema, omittedCandidateIds: DirectorIdSetSchema,
  selectionPolicy: z.literal("explicit_supplied"),
});
export const CandidateSummarySchema = CandidateSummaryBodySchema.extend({ summaryId: IdSchema }).refine(
  value => checkIdentity(value, "summaryId", "director_candidate_summary_v0"), "Candidate summary identity mismatch.",
);
export type CandidateSummary = z.infer<typeof CandidateSummarySchema>;
function checkCandidateSummary(body: z.infer<typeof CandidateSummaryBodySchema>, map: EditorialArtifactMap, world: z.infer<typeof WorldSnapshotSchema>, view: z.infer<typeof WorldViewSchema>): void {
  ensure(sameScope(body.scope, { projectId: world.projectId, creatorId: world.creatorId, purpose: world.purpose }), "Candidate summary scope mismatch.");
  ensure(body.worldSnapshot.artifactType === "ProjectWorldModel" && body.worldSnapshot.artifactVersion === "0.1.0"
    && body.worldView.artifactType === "ProjectWorldView" && body.worldView.artifactVersion === "0.1.0", "Typed world references required.");
  ensure(equal(exactArtifact(map, body.worldSnapshot, "ProjectWorldModel"), world)
    && equal(exactArtifact(map, body.worldView, "ProjectWorldView"), view) && world.worldId === view.worldId, "Candidate summary world snapshot/view mismatch.");
  ensure(world.candidateSetRefs.some(ref => equal(ref, body.candidateSet)), "Candidate set is not in pinned world snapshot.");
  const set = EditorialCandidateSetSchema.parse(exactArtifact(map, body.candidateSet, "EditorialCandidateSet"));
  const validated = validateCandidateSet(set, map);
  ensure(validated.set.projectId === body.scope.projectId, "Candidate set project mismatch.");
  const all = new Map(set.candidates.map(entry => [entry.candidateId, entry.token]));
  for (const entry of body.candidates) {
    ensure(equal(all.get(entry.candidateId), entry.token), "Unknown candidate or wrong exact token snapshot.");
    ensure(world.tokenLinks.some(link => link.candidateId === entry.candidateId && equal(link.token, entry.token)), "Candidate token is absent from pinned world.");
    ensure(world.candidateLinks.some(link => link.candidateId === entry.candidateId && equal(link.token, entry.token)), "Candidate membership is absent from pinned world.");
  }
  const omitted = canonicalIds(set.candidates.filter(entry => !body.candidates.some(candidate => candidate.candidateId === entry.candidateId)).map(entry => entry.candidateId));
  ensure(equal(omitted, body.omittedCandidateIds), "Candidate summary omission inventory mismatch.");
  ensure((omitted.length === 0) === (body.coverage === "complete_declared_set"), "Candidate summary coverage contradiction.");
}
export function createCandidateSummary(input: z.input<typeof CandidateSummaryBodySchema>, map: EditorialArtifactMap, world: z.infer<typeof WorldSnapshotSchema>, view: z.infer<typeof WorldViewSchema>): CandidateSummary {
  const body = CandidateSummaryBodySchema.parse(input);
  checkCandidateSummary(body, map, world, view);
  return clone(CandidateSummarySchema.parse(identify("director_candidate_summary_v0", "summaryId", body)));
}
export function validateCandidateSummary(input: unknown, map: EditorialArtifactMap, world: z.infer<typeof WorldSnapshotSchema>, view: z.infer<typeof WorldViewSchema>): CandidateSummary {
  const summary = CandidateSummarySchema.parse(input), { summaryId: _id, ...body } = summary;
  ensure(equal(createCandidateSummary(body, map, world, view), summary), "Candidate summary replay mismatch.");
  return clone(summary);
}

const CapabilitySnapshotSchema = z.strictObject({ ...directorEnvelope("DirectorCapabilitySnapshot"), scope: DirectorScopeSchema,
  capability: z.literal("director_reasoning"), executionStatus: z.literal("selection_only_no_execution") });
const RevisionScopeSchema = z.strictObject({ ...directorEnvelope("DirectorRevisionScope"), scope: DirectorScopeSchema,
  priorDirection: ArtifactRefSchema, revision: Nat, reason: DirectorTextSchema });
const RequestBodySchema = z.strictObject({
  ...directorEnvelope("DirectorRequest"), scope: DirectorScopeSchema,
  intent: ArtifactRefSchema, worldView: ArtifactRefSchema, candidateSummaryView: ArtifactRefSchema,
  audioMusicView: availability(ArtifactRefSchema), referenceGrammar: availability(ArtifactRefSchema),
  canonView: ArtifactRefSchema, editingDNA: availability(ArtifactRefSchema), computeBudget: ArtifactRefSchema,
  capabilitySnapshot: ArtifactRefSchema, modelSelection: ArtifactRefSchema, outputRequirements: EvidenceRefSchema,
  priorDirection: availability(ArtifactRefSchema), revisionScope: availability(EvidenceRefSchema),
});
export const DirectorRequestSchema = RequestBodySchema.extend({ requestId: IdSchema }).refine(
  value => checkIdentity(value, "requestId", "director_request_v0"), "Director request identity mismatch.",
);
export type DirectorRequest = z.infer<typeof DirectorRequestSchema>;
export interface DirectorAuthority { readonly artifacts: readonly SuppliedArtifact[]; readonly worldQuery: unknown }

/** The Gate-3 selection is pinned before the request ID exists, so this digest excludes only selection and the request's own ID. */
export function directorSelectionInputDigest(input: z.input<typeof RequestBodySchema>): string {
  const { modelSelection: _selection, ...body } = RequestBodySchema.parse(input);
  return exactDigest(new TextEncoder().encode(canonicalSerialize(body)));
}
function validateOptionalView(value: z.infer<typeof RequestBodySchema>["audioMusicView"], scope: Scope, map: EditorialArtifactMap): void {
  if (value.state !== "present") { for (const ref of value.evidenceRefs) scopedDiagnosticEvidence(ref, scope, map); return; }
  throw new Error("Audio and reference ID views have no accepted semantic source in Gate 4.");
}
function scopedDiagnosticEvidence(ref: z.infer<typeof EvidenceRefSchema>, scope: Scope, map: EditorialArtifactMap): void {
  const root = map.get(ref.artifact);
  ensure(root !== null && typeof root === "object" && !Array.isArray(root) && "scope" in root
    && sameScope(DirectorScopeSchema.parse((root as { scope: unknown }).scope), scope), "Diagnostic evidence scope unavailable.");
  map.resolve(ref);
}
function replaySelection(selection: z.infer<typeof ModelSelectionSchema>, budgetValue: z.infer<typeof ComputeBudgetSchema>, artifacts: readonly SuppliedArtifact[]): void {
  const map = new EditorialArtifactMap(artifacts);
  const replayed = selectModel({ scope: selection.scope, capability: selection.requestedCapability, qualityRequirement: selection.qualityRequirement,
    budget: budgetValue, budgetArtifact: selection.budget,
    candidates: selection.candidateProfiles.map(ref => ({ artifact: ref, profile: ModelProfileSchema.parse(exactArtifact(map, ref, "ModelProfile")) })),
    evaluation: selection.evaluation, availabilitySnapshot: selection.availabilitySnapshot, policy: selection.policy,
    fallbackEscalationPolicy: selection.fallbackEscalationPolicy, inputViewDigest: selection.inputViewDigest }, artifacts);
  ensure(equal(replayed, selection), "ModelSelection semantic replay mismatch.");
}
function validateRequestBody(body: z.infer<typeof RequestBodySchema>, authority: DirectorAuthority): void {
  const map = new EditorialArtifactMap(authority.artifacts), scope = DirectorScopeSchema.parse(body.scope);
  const intent = validateIntentSpec(exactArtifact(map, body.intent, "IntentSpec"), map);
  ensure(sameScope(intent.scope, scope), "Intent scope mismatch.");
  const world = WorldSnapshotSchema.parse(exactArtifact(map, CandidateSummarySchema.parse(exactArtifact(map, body.candidateSummaryView, "DirectorCandidateSummary")).worldSnapshot, "ProjectWorldModel"));
  const view = WorldViewSchema.parse(exactArtifact(map, body.worldView, "ProjectWorldView"));
  ensure(equal(queryWorld(world, authority.worldQuery, map), view), "ProjectWorldView semantic replay mismatch.");
  const summary = validateCandidateSummary(exactArtifact(map, body.candidateSummaryView, "DirectorCandidateSummary"), map, world, view);
  ensure(equal(summary.worldView, body.worldView) && sameScope(summary.scope, scope), "Candidate summary does not bind request world view/scope.");
  const canon = validateCanonView(exactArtifact(map, body.canonView, "CanonView"), map);
  ensure(sameScope(canon.scope, scope) && canon.domain === intent.domain, "Canon domain/scope mismatch.");
  ensure(equal(body.outputRequirements, { artifact: body.intent, pointer: "/outputRequirements" }), "Output requirements must bind exact intent artifact.");
  map.resolve(body.outputRequirements);
  validateOptionalView(body.audioMusicView, scope, map);
  validateOptionalView(body.referenceGrammar, scope, map);
  ensure(body.editingDNA.state !== "present", "EditingDNA is not implemented in Gate 4.");
  for (const ref of body.editingDNA.evidenceRefs) scopedDiagnosticEvidence(ref, scope, map);
  const capability = CapabilitySnapshotSchema.parse(exactArtifact(map, body.capabilitySnapshot, "DirectorCapabilitySnapshot"));
  ensure(sameScope(capability.scope, scope), "Capability snapshot scope mismatch.");
  const budgetValue = ComputeBudgetSchema.parse(exactArtifact(map, body.computeBudget, "ComputeBudget"));
  const { budgetId: _budgetId, ...budgetBody } = budgetValue;
  ensure(equal(budget(budgetBody, authority.artifacts), budgetValue) && sameScope(budgetValue.scope, scope), "ComputeBudget semantic replay mismatch.");
  const selection = ModelSelectionSchema.parse(exactArtifact(map, body.modelSelection, "ModelSelection"));
  ensure(sameScope(selection.scope, scope) && selection.requestedCapability === capability.capability
    && equal(selection.budget, body.computeBudget) && selection.inputViewDigest === directorSelectionInputDigest(body), "Director ModelSelection binding mismatch.");
  replaySelection(selection, budgetValue, authority.artifacts);
  ensure((body.priorDirection.state === "present") === (body.revisionScope.state === "present"), "Prior direction and revision scope must agree.");
  if (body.priorDirection.state === "present" && body.revisionScope.state === "present") {
    ensure(budgetValue.directorRevisionLimit > 0, "Director revision has no budget authorization.");
    const prior = CreativeDirectionGraphSchema.parse(exactArtifact(map, body.priorDirection.value, "CreativeDirectionGraph"));
    const revision = RevisionScopeSchema.parse(map.resolve(body.revisionScope.value));
    ensure(body.revisionScope.value.pointer === "" && body.revisionScope.value.artifact.artifactType === "DirectorRevisionScope"
      && body.revisionScope.value.artifact.artifactVersion === DIRECTOR_VERSION, "Typed revision scope required.");
    ensure(sameScope(prior.scope, scope) && sameScope(revision.scope, scope) && equal(revision.priorDirection, body.priorDirection.value)
      && revision.revision === prior.revision + 1 && revision.revision <= budgetValue.directorRevisionLimit, "Prior direction revision mismatch.");
    ensure(equal(prior.worldSnapshot, summary.worldSnapshot) && equal(prior.candidateUniverse, summary.candidateSet), "Prior direction uses a different world or candidate universe.");
    validateCreativeDirectionGraph(prior, prior.request, authority);
  } else {
    if (body.priorDirection.state !== "present") for (const ref of body.priorDirection.evidenceRefs) scopedDiagnosticEvidence(ref, scope, map);
    if (body.revisionScope.state !== "present") for (const ref of body.revisionScope.evidenceRefs) scopedDiagnosticEvidence(ref, scope, map);
  }
}
export function createDirectorRequest(input: z.input<typeof RequestBodySchema>, authority: DirectorAuthority): DirectorRequest {
  const body = RequestBodySchema.parse(input);
  validateRequestBody(body, authority);
  return clone(DirectorRequestSchema.parse(identify("director_request_v0", "requestId", body)));
}
export function validateDirectorRequest(input: unknown, authority: DirectorAuthority): DirectorRequest {
  const request = DirectorRequestSchema.parse(input), { requestId: _id, ...body } = request;
  ensure(equal(createDirectorRequest(body, authority), request), "Director request replay mismatch.");
  return clone(request);
}

const HypothesisBodySchema = z.strictObject({
  ...directorEnvelope("CreativeHypothesis"), scope: DirectorScopeSchema, worldView: ArtifactRefSchema,
  proposition: DirectorTextSchema, grounding: DirectorEvidenceSetSchema, groundingState: z.enum(["grounded", "partially_grounded", "ungrounded"]),
  priorHypotheses: DirectorRefSetSchema,
  author: z.strictObject({ kind: z.enum(["director", "editor"]), actorId: IdSchema }),
  uncertainty: DirectorUncertaintySchema,
});
export const CreativeHypothesisSchema = HypothesisBodySchema.extend({ hypothesisId: IdSchema }).superRefine((value, ctx) => {
  if (!checkIdentity(value, "hypothesisId", "director_hypothesis_v0")) ctx.addIssue({ code: "custom", message: "Creative hypothesis identity mismatch." });
  if ((value.groundingState === "ungrounded") !== (value.grounding.length === 0))
    ctx.addIssue({ code: "custom", message: "Creative grounding state contradicts factual references." });
});
export type CreativeHypothesis = z.infer<typeof CreativeHypothesisSchema>;
function factualEvidence(ref: z.infer<typeof EvidenceRefSchema>, view: z.infer<typeof WorldViewSchema>, map: EditorialArtifactMap): void {
  ensure(view.evidence.some(allowed => equal(allowed, ref.artifact)), "Evidence is absent from authorized world view.");
  ensure(view.returned.some(entity => equal(entity.artifact, ref.artifact)), "Evidence lacks a returned factual or derived world entity.");
  map.resolve(ref);
}
function validateHypothesisBody(body: z.infer<typeof HypothesisBodySchema>, viewRef: Ref, map: EditorialArtifactMap, view: z.infer<typeof WorldViewSchema>, scope: Scope, path: ReadonlySet<string>): void {
  ensure(sameScope(body.scope, scope) && equal(body.worldView, viewRef), "Creative hypothesis scope/world mismatch.");
  for (const ref of body.grounding) factualEvidence(ref, view, map);
  for (const ref of body.uncertainty.evidenceRefs) factualEvidence(ref, view, map);
  for (const ref of body.priorHypotheses) {
    ensure(!path.has(ref.objectId), "Creative hypothesis dependency cycle.");
    const prior = CreativeHypothesisSchema.parse(exactArtifact(map, ref, "CreativeHypothesis"));
    const { hypothesisId: _id, ...priorBody } = prior;
    validateHypothesisBody(priorBody, viewRef, map, view, scope, new Set([...path, ref.objectId]));
  }
}
export function createCreativeHypothesis(input: z.input<typeof HypothesisBodySchema>, viewRef: Ref, view: z.infer<typeof WorldViewSchema>, map: EditorialArtifactMap, scope: Scope): CreativeHypothesis {
  const body = HypothesisBodySchema.parse(input);
  ensure(equal(exactArtifact(map, viewRef, "ProjectWorldView"), view), "Creative hypothesis exact world view mismatch.");
  validateHypothesisBody(body, viewRef, map, view, scope, new Set());
  return clone(CreativeHypothesisSchema.parse(identify("director_hypothesis_v0", "hypothesisId", body)));
}
export function validateCreativeHypothesis(input: unknown, viewRef: Ref, view: z.infer<typeof WorldViewSchema>, map: EditorialArtifactMap, scope: Scope): CreativeHypothesis {
  const hypothesis = CreativeHypothesisSchema.parse(input), { hypothesisId: _id, ...body } = hypothesis;
  ensure(equal(createCreativeHypothesis(body, viewRef, view, map, scope), hypothesis), "Creative hypothesis replay mismatch.");
  return clone(hypothesis);
}

const NodeIntentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("narrative_objective"), objective: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("story_beat"), role: z.enum(["hook", "setup", "build", "payoff"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("emotional_progression"), direction: z.enum(["rise", "fall", "contrast", "steady"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("sequence_intention"), function: z.enum(["open", "develop", "resolve"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("shot_role_intention"), role: z.enum(["establish", "detail", "reaction", "bridge"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("pacing_target"), relativePace: z.enum(["faster", "slower", "steady", "build"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("reaction_relationship"), relation: z.enum(["cause_then_reaction", "reaction_then_reveal"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("music_relationship"), relation: z.enum(["sync_with_known_beat", "build_with_music", "contrast_music"]), beatId: availability(IdSchema), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("transition_intention"), relation: z.enum(["clear_change", "soften_change", "contrast"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("sound_design_intention"), relation: z.enum(["emphasize", "restrain", "bridge"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("graphics_intention"), role: z.enum(["clarify", "emphasize", "omit"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("color_intention"), mood: z.enum(["warm", "cool", "neutral", "contrast"]), description: DirectorTextSchema }),
  z.strictObject({ kind: z.literal("technique_intention"), canonEntryKey: IdSchema, description: DirectorTextSchema }),
]);
const NodeScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("whole_edit") }),
  z.strictObject({ kind: z.literal("candidate"), candidate: CandidateBindingSchema }),
]);
const DirectionNodeSchema = z.strictObject({
  nodeId: IdSchema, intent: NodeIntentSchema, priority: PrioritySchema, scope: NodeScopeSchema,
  candidates: CandidateBindingsSchema, evidenceRefs: DirectorEvidenceSetSchema, canonEntryKeys: DirectorIdSetSchema,
  hypotheses: DirectorRefSetSchema, requirementIds: DirectorIdSetSchema, uncertainty: DirectorUncertaintySchema,
});
const DirectionEdgeSchema = z.strictObject({ edgeId: IdSchema, type: z.enum(["intended_order", "supports", "reacts_to", "builds_toward", "synchronizes_with", "alternative_to", "requires"]), from: IdSchema, to: IdSchema });
const CreativeConstraintSchema = z.strictObject({ constraintId: IdSchema, subjectId: IdSchema, stance: z.enum(["include", "exclude"]), priority: PrioritySchema, nodeId: IdSchema });
const AlternativeChoiceSchema = z.strictObject({ choiceId: IdSchema, nodeIds: DirectorIdSetSchema.refine(values => values.length > 0, "Alternative choice requires nodes.") });
const AlternativeBranchSchema = z.strictObject({ branchId: IdSchema, choices: z.array(AlternativeChoiceSchema).min(2).max(8)
  .refine(values => values.every((value, index) => index === 0 || values[index - 1]!.choiceId < value.choiceId), "Alternative choices must be unique and sorted.") });
export const RequirementFindingSchema = z.strictObject({ findingId: IdSchema, subjectId: IdSchema,
  code: z.enum(["missing_hard_requirement", "soft_conflict", "candidate_omission", "world_incomplete", "unresolved_request"]),
  severity: z.enum(["blocking", "nonblocking"]), evidenceRefs: DirectorEvidenceSetSchema });
const FindingsSchema = z.array(RequirementFindingSchema).max(128).refine(
  values => values.every((value, index) => index === 0 || values[index - 1]!.findingId < value.findingId),
  "Findings must be unique and sorted.",
);
const DirectionBodySchema = z.strictObject({
  ...directorEnvelope("CreativeDirectionGraph"), scope: DirectorScopeSchema,
  request: ArtifactRefSchema, worldSnapshot: ArtifactRefSchema, candidateUniverse: ArtifactRefSchema,
  revision: Nat, parent: availability(ArtifactRefSchema),
  nodes: z.array(DirectionNodeSchema).max(256), edges: z.array(DirectionEdgeSchema).max(512),
  constraints: z.array(CreativeConstraintSchema).max(256), alternatives: z.array(AlternativeBranchSchema).max(64),
  hypotheses: DirectorRefSetSchema, unresolvedRequirements: FindingsSchema,
});
export const CreativeDirectionGraphSchema = DirectionBodySchema.extend({ directionId: IdSchema }).superRefine((value, ctx) => {
  if (!checkIdentity(value, "directionId", "director_direction_v0")) ctx.addIssue({ code: "custom", message: "Creative direction identity mismatch." });
  const ordered = <T>(values: readonly T[], key: (value: T) => string) => values.every((item, index) => index === 0 || key(values[index - 1]!) < key(item));
  if (!ordered(value.nodes, item => item.nodeId) || !ordered(value.edges, item => item.edgeId)
    || !ordered(value.constraints, item => item.constraintId) || !ordered(value.alternatives, item => item.branchId)) {
    ctx.addIssue({ code: "custom", message: "Direction graph declared sets must be canonical." });
  }
});
export type CreativeDirectionGraph = z.infer<typeof CreativeDirectionGraphSchema>;

function assertUnique(values: readonly string[], message: string): void { ensure(new Set(values).size === values.length, message); }
function assertAcyclic(edges: readonly z.infer<typeof DirectionEdgeSchema>[], nodeIds: readonly string[]): void {
  const outgoing = new Map(nodeIds.map(id => [id, [] as string[]]));
  for (const edge of edges) if (edge.type !== "alternative_to") outgoing.get(edge.from)!.push(edge.to);
  const active = new Set<string>(), done = new Set<string>();
  const visit = (id: string): void => {
    ensure(!active.has(id), "Creative dependency/order cycle.");
    if (done.has(id)) return;
    active.add(id);
    for (const next of outgoing.get(id)!) visit(next);
    active.delete(id); done.add(id);
  };
  for (const id of nodeIds) visit(id);
}
function directionContext(request: DirectorRequest, authority: DirectorAuthority) {
  const map = new EditorialArtifactMap(authority.artifacts);
  const summary = CandidateSummarySchema.parse(exactArtifact(map, request.candidateSummaryView, "DirectorCandidateSummary"));
  const world = WorldSnapshotSchema.parse(exactArtifact(map, summary.worldSnapshot, "ProjectWorldModel"));
  const view = WorldViewSchema.parse(exactArtifact(map, request.worldView, "ProjectWorldView"));
  const intent = IntentSpecSchema.parse(exactArtifact(map, request.intent, "IntentSpec"));
  const canon = CanonViewSchema.parse(exactArtifact(map, request.canonView, "CanonView"));
  return { map, summary, world, view, intent, canon };
}
function validateDirectionBody(body: z.infer<typeof DirectionBodySchema>, request: DirectorRequest, requestRef: Ref, authority: DirectorAuthority): void {
  const { map, summary, world, view, intent, canon } = directionContext(request, authority);
  ensure(sameScope(body.scope, request.scope) && equal(body.request, requestRef) && equal(body.worldSnapshot, summary.worldSnapshot)
    && equal(body.candidateUniverse, summary.candidateSet), "Direction request/world/universe mismatch.");
  const expectedRevision = request.priorDirection.state === "present"
    ? CreativeDirectionGraphSchema.parse(exactArtifact(map, request.priorDirection.value, "CreativeDirectionGraph")).revision + 1 : 0;
  ensure(body.revision === expectedRevision && (body.parent.state === "present") === (request.priorDirection.state === "present")
    && (body.parent.state !== "present" || request.priorDirection.state === "present" && equal(body.parent.value, request.priorDirection.value)), "Direction parent/revision mismatch.");
  const knownCandidates = new Map(summary.candidates.map(entry => [entry.candidateId, entry.token]));
  const checkCandidate = (binding: z.infer<typeof CandidateBindingSchema>) => ensure(equal(knownCandidates.get(binding.candidateId), binding.token), "Unknown candidate or incorrect token snapshot.");
  const canonKeys = new Set(canon.entries.map(entry => entry.entryKey));
  const requirementEntries = [...intent.outputRequirements, ...intent.mustInclude, ...intent.mustExclude];
  const requirementIds = new Set(requirementEntries.map(entry => entry.requirementId));
  const requiredStance = new Map<string, "include" | "exclude">([
    ...intent.outputRequirements.map(entry => [entry.requirementId, "include"] as const),
    ...intent.mustInclude.map(entry => [entry.requirementId, "include"] as const),
    ...intent.mustExclude.map(entry => [entry.requirementId, "exclude"] as const),
  ]);
  assertUnique(body.nodes.map(node => node.nodeId), "Duplicate direction node ID.");
  assertUnique(body.edges.map(edge => edge.edgeId), "Duplicate direction edge ID.");
  assertUnique(body.constraints.map(constraint => constraint.constraintId), "Duplicate creative constraint ID.");
  assertUnique(body.alternatives.map(branch => branch.branchId), "Duplicate alternative branch ID.");
  const nodeIds = new Set(body.nodes.map(node => node.nodeId));
  for (const node of body.nodes) {
    if (node.scope.kind === "candidate") { const scoped = node.scope.candidate; checkCandidate(scoped); ensure(node.candidates.some(candidate => equal(candidate, scoped)), "Candidate scope must bind node candidate."); }
    for (const candidate of node.candidates) checkCandidate(candidate);
    for (const evidence of node.evidenceRefs) factualEvidence(evidence, view, map);
    for (const evidence of node.uncertainty.evidenceRefs) factualEvidence(evidence, view, map);
    ensure(node.canonEntryKeys.every(key => canonKeys.has(key)), "Unknown or unselected Canon entry.");
    ensure(node.requirementIds.every(id => requirementIds.has(id)), "Unknown intent requirement.");
    if (node.intent.kind === "technique_intention") ensure(canonKeys.has(node.intent.canonEntryKey) && node.canonEntryKeys.includes(node.intent.canonEntryKey), "Technique intention requires selected Canon guidance.");
    if (node.intent.kind === "music_relationship") {
      if (node.intent.relation === "sync_with_known_beat") ensure(node.intent.beatId.state === "present", "Known beat synchronization requires a beat ID.");
      ensure(node.intent.beatId.state !== "present", "No verified music beat IDs exist in Gate 4.");
    }
    for (const ref of node.hypotheses) {
      ensure(body.hypotheses.some(known => equal(known, ref)), "Node hypothesis is absent from graph hypothesis set.");
    }
  }
  for (const ref of body.hypotheses) validateCreativeHypothesis(exactArtifact(map, ref, "CreativeHypothesis"), request.worldView, view, map, request.scope);
  for (const edge of body.edges) {
    ensure(nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to, "Dangling or self-referential direction edge.");
  }
  assertAcyclic(body.edges, [...nodeIds]);
  const softConflicts = new Set<string>();
  for (const constraint of body.constraints) {
    ensure(nodeIds.has(constraint.nodeId), "Constraint references unknown node.");
    const stance = requiredStance.get(constraint.subjectId);
    ensure(stance !== undefined, "Constraint subject is not a supplied intent requirement.");
    if (constraint.stance !== stance) {
      ensure(constraint.priority !== "hard", "Hard creative constraint contradicts supplied intent.");
      softConflicts.add(constraint.subjectId);
    }
  }
  const bySubject = new Map<string, z.infer<typeof CreativeConstraintSchema>[]>();
  for (const constraint of body.constraints) bySubject.set(constraint.subjectId, [...(bySubject.get(constraint.subjectId) ?? []), constraint]);
  for (const [subject, values] of bySubject) {
    const includes = values.filter(value => value.stance === "include"), excludes = values.filter(value => value.stance === "exclude");
    if (!includes.length || !excludes.length) continue;
    ensure(!includes.some(value => value.priority === "hard") || !excludes.some(value => value.priority === "hard"), "Conflicting hard creative constraints.");
    softConflicts.add(subject);
  }
  const choiceOf = new Map<string, { branchId: string; choiceId: string }>();
  for (const branch of body.alternatives) {
    for (const choice of branch.choices) for (const id of choice.nodeIds) {
      ensure(nodeIds.has(id) && !choiceOf.has(id), "Alternative branch has unknown or multiply assigned node.");
      choiceOf.set(id, { branchId: branch.branchId, choiceId: choice.choiceId });
    }
    for (let i = 0; i < branch.choices.length; i++) for (let j = i + 1; j < branch.choices.length; j++) {
      const left = new Set(branch.choices[i]!.nodeIds), right = new Set(branch.choices[j]!.nodeIds);
      ensure(body.edges.some(edge => edge.type === "alternative_to" && (left.has(edge.from) && right.has(edge.to) || right.has(edge.from) && left.has(edge.to))), "Alternative choices require explicit mutually exclusive links.");
    }
  }
  for (const edge of body.edges) {
    const from = choiceOf.get(edge.from), to = choiceOf.get(edge.to);
    if (edge.type === "alternative_to") ensure(from && to && from.branchId === to.branchId && from.choiceId !== to.choiceId, "Invalid alternative edge.");
    else ensure(!(from && to && from.branchId === to.branchId && from.choiceId !== to.choiceId), "Dependency crosses mutually exclusive choices.");
  }
  const hasFinding = (subjectId: string, code: z.infer<typeof RequirementFindingSchema>["code"], severity: "blocking" | "nonblocking") =>
    body.unresolvedRequirements.some(finding => finding.subjectId === subjectId && finding.code === code && finding.severity === severity);
  const addressedHard = (requirementId: string) => intent.mustExclude.some(value => value.requirementId === requirementId)
    ? body.constraints.some(value => value.subjectId === requirementId && value.stance === "exclude" && value.priority === "hard")
    : body.nodes.some(node => node.requirementIds.includes(requirementId) && node.priority === "hard");
  for (const req of requirementEntries.filter(value => value.priority === "hard")) {
    if (!addressedHard(req.requirementId)) ensure(hasFinding(req.requirementId, "missing_hard_requirement", "blocking"), "Missing hard intent requirement is not disclosed.");
  }
  for (const subject of softConflicts) ensure(hasFinding(subject, "soft_conflict", "nonblocking"), "Soft creative conflict is not disclosed.");
  const incompleteCandidates = summary.coverage === "explicit_subset"
    || EditorialCandidateSetSchema.parse(exactArtifact(map, summary.candidateSet, "EditorialCandidateSet")).universe === "explicit_subset";
  if (incompleteCandidates) {
    ensure(hasFinding(summary.summaryId, "candidate_omission", "blocking"), "Incomplete candidate universe is not disclosed.");
  }
  if (view.completeness !== "complete_for_bound") ensure(hasFinding(view.viewId, "world_incomplete", "blocking"), "Incomplete world view is not disclosed.");
  for (const finding of body.unresolvedRequirements) {
    for (const ref of finding.evidenceRefs) factualEvidence(ref, view, map);
    if (finding.code === "missing_hard_requirement") ensure(finding.severity === "blocking" && requirementEntries.some(req => req.requirementId === finding.subjectId && req.priority === "hard")
      && !addressedHard(finding.subjectId), "False or unknown missing hard requirement.");
    else if (finding.code === "soft_conflict") ensure(finding.severity === "nonblocking" && softConflicts.has(finding.subjectId), "False soft conflict.");
    else if (finding.code === "candidate_omission") ensure(finding.severity === "blocking" && incompleteCandidates && finding.subjectId === summary.summaryId, "False candidate omission.");
    else if (finding.code === "world_incomplete") ensure(finding.severity === "blocking" && view.completeness !== "complete_for_bound" && finding.subjectId === view.viewId, "False world incompleteness.");
    else ensure(finding.severity === "blocking" && (finding.subjectId === "request_goal" || requirementIds.has(finding.subjectId)), "Unresolved subject is not a supplied request requirement.");
  }
  void world;
}
export function createCreativeDirectionGraph(input: z.input<typeof DirectionBodySchema>, requestRef: Ref, authority: DirectorAuthority): CreativeDirectionGraph {
  const parsed = DirectionBodySchema.parse(input);
  const by = <T>(values: readonly T[], key: (value: T) => string) => [...values].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const body = DirectionBodySchema.parse({ ...parsed, nodes: by(parsed.nodes, item => item.nodeId), edges: by(parsed.edges, item => item.edgeId),
    constraints: by(parsed.constraints, item => item.constraintId), alternatives: by(parsed.alternatives, item => item.branchId) });
  const map = new EditorialArtifactMap(authority.artifacts);
  const request = validateDirectorRequest(exactArtifact(map, requestRef, "DirectorRequest"), authority);
  validateDirectionBody(body, request, requestRef, authority);
  return clone(CreativeDirectionGraphSchema.parse(identify("director_direction_v0", "directionId", body)));
}
export function validateCreativeDirectionGraph(input: unknown, requestRef: Ref, authority: DirectorAuthority): CreativeDirectionGraph {
  const direction = CreativeDirectionGraphSchema.parse(input), { directionId: _id, ...body } = direction;
  ensure(equal(createCreativeDirectionGraph(body, requestRef, authority), direction), "Creative direction replay mismatch.");
  return clone(direction);
}

const GroundingBodySchema = z.strictObject({
  ...directorEnvelope("DirectorGroundingReport"), scope: DirectorScopeSchema, request: ArtifactRefSchema,
  direction: availability(ArtifactRefSchema), state: z.enum(["grounded", "partially_grounded", "unresolved"]),
  candidateBindings: CandidateBindingsSchema, factualEvidence: DirectorEvidenceSetSchema,
  canonEntryKeys: DirectorIdSetSchema, hypothesisRefs: DirectorRefSetSchema,
  optionalAudioIds: DirectorIdSetSchema, unresolvedRequirements: FindingsSchema,
});
export const DirectorGroundingReportSchema = GroundingBodySchema.extend({ groundingId: IdSchema }).refine(
  value => checkIdentity(value, "groundingId", "director_grounding_v0"), "Grounding report identity mismatch.",
);
export type DirectorGroundingReport = z.infer<typeof DirectorGroundingReportSchema>;
export function createDirectorGroundingReport(requestRef: Ref, direction: z.infer<ReturnType<typeof availability<typeof ArtifactRefSchema>>>, authority: DirectorAuthority, unresolvedInput?: unknown): DirectorGroundingReport {
  const map = new EditorialArtifactMap(authority.artifacts);
  const request = validateDirectorRequest(exactArtifact(map, requestRef, "DirectorRequest"), authority);
  let graph: CreativeDirectionGraph | null = null;
  if (direction.state === "present") graph = validateCreativeDirectionGraph(exactArtifact(map, direction.value, "CreativeDirectionGraph"), requestRef, authority);
  else for (const ref of direction.evidenceRefs) map.resolve(ref);
  const candidateBindings = graph ? [...new Map(graph.nodes.flatMap(node => node.candidates).map(item => [item.candidateId, item])).values()].sort((a, b) => a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0) : [];
  const factualEvidence = graph ? canonicalEvidence([...new Map(graph.nodes.flatMap(node => node.evidenceRefs).map(item => [canonicalSerialize(item), item])).values()]) : [];
  const canonEntryKeys = graph ? canonicalIds([...new Set(graph.nodes.flatMap(node => node.canonEntryKeys))]) : [];
  const optionalAudioIds = graph ? canonicalIds([...new Set(graph.nodes.flatMap(node => node.intent.kind === "music_relationship" && node.intent.beatId.state === "present" ? [node.intent.beatId.value] : []))]) : [];
  const findings = graph?.unresolvedRequirements ?? FindingsSchema.parse(unresolvedInput ?? []);
  if (graph && unresolvedInput !== undefined) ensure(equal(FindingsSchema.parse(unresolvedInput), findings), "Grounding findings contradict direction.");
  if (!graph) {
    const intent = IntentSpecSchema.parse(exactArtifact(map, request.intent, "IntentSpec"));
    const allowed = new Set([...intent.outputRequirements, ...intent.mustInclude, ...intent.mustExclude].map(item => item.requirementId));
    for (const finding of findings) {
      ensure(finding.code === "unresolved_request" && finding.severity === "blocking"
        && (finding.subjectId === "request_goal" || allowed.has(finding.subjectId)), "Ungrounded result has an unknown unresolved subject.");
      for (const ref of finding.evidenceRefs) scopedDiagnosticEvidence(ref, request.scope, map);
    }
  }
  const state = !graph || findings.some(finding => finding.severity === "blocking") ? "unresolved" : findings.length ? "partially_grounded" : "grounded";
  const body = GroundingBodySchema.parse({ artifactType: "DirectorGroundingReport", artifactVersion: DIRECTOR_VERSION, stability: "internal_pre_stable",
    scope: request.scope, request: requestRef, direction, state, candidateBindings, factualEvidence, canonEntryKeys,
    hypothesisRefs: graph?.hypotheses ?? [], optionalAudioIds, unresolvedRequirements: findings });
  return clone(DirectorGroundingReportSchema.parse(identify("director_grounding_v0", "groundingId", body)));
}
export function validateDirectorGroundingReport(input: unknown, requestRef: Ref, authority: DirectorAuthority): DirectorGroundingReport {
  const report = DirectorGroundingReportSchema.parse(input);
  ensure(equal(report, createDirectorGroundingReport(requestRef, report.direction, authority, report.unresolvedRequirements)), "Grounding report replay mismatch.");
  return clone(report);
}

const RuntimeBodySchema = z.strictObject({ ...directorEnvelope("DirectorProducerRun"), scope: DirectorScopeSchema,
  request: ArtifactRefSchema, selection: ArtifactRefSchema, groundingReport: ArtifactRefSchema,
  direction: availability(ArtifactRefSchema), outcome: z.enum(["succeeded", "partial", "abstained", "failed"]),
  failure: availability(DirectorFailureSchema), basis: z.enum(["synthetic_test", "human_authored"]),
  evidenceRefs: DirectorEvidenceSetSchema });
export const DirectorProducerRunSchema = RuntimeBodySchema.extend({ runId: IdSchema }).superRefine((value, ctx) => {
  if (!checkIdentity(value, "runId", "director_producer_run_v0")) ctx.addIssue({ code: "custom", message: "Director runtime receipt identity mismatch." });
  if (value.outcome === "failed" ? value.failure.state !== "present" : value.failure.state !== "not_applicable") {
    ctx.addIssue({ code: "custom", message: "Runtime failure state contradicts outcome." });
  }
});
export type DirectorProducerRun = z.infer<typeof DirectorProducerRunSchema>;
export function createDirectorProducerRun(input: z.input<typeof RuntimeBodySchema>): DirectorProducerRun {
  const body = RuntimeBodySchema.parse(input);
  return clone(DirectorProducerRunSchema.parse(identify("director_producer_run_v0", "runId", body)));
}

const ProposalSchema = z.strictObject({
  outcome: z.enum(["succeeded", "partial", "abstained", "failed"]), direction: availability(ArtifactRefSchema),
  unresolvedRequirements: FindingsSchema, uncertainty: DirectorUncertaintySchema,
  failure: availability(DirectorFailureSchema),
});
export type DirectorProposal = z.infer<typeof ProposalSchema>;
/** A model may propose creative content only. Trusted refs are supplied by the calling runtime. */
export interface DirectorProvider { propose(request: DirectorRequest): Promise<DirectorProposal> }

const RuntimeAuthoritySchema = z.strictObject({
  request: ArtifactRefSchema, producerRun: ArtifactRefSchema, groundingReport: ArtifactRefSchema,
  modelRun: MissingSchema, costTrace: MissingSchema,
});
export type DirectorRuntimeAuthority = z.infer<typeof RuntimeAuthoritySchema>;
const ResultBodySchema = z.strictObject({ ...directorEnvelope("DirectorResult"),
  request: ArtifactRefSchema, scope: DirectorScopeSchema, outcome: ProposalSchema.shape.outcome,
  direction: ProposalSchema.shape.direction, unresolvedRequirements: FindingsSchema,
  uncertainty: DirectorUncertaintySchema, groundingReport: ArtifactRefSchema, producerRun: ArtifactRefSchema,
  modelRun: MissingSchema, selection: ArtifactRefSchema, costTrace: MissingSchema,
  failure: ProposalSchema.shape.failure,
});
export const DirectorResultSchema = ResultBodySchema.extend({ resultId: IdSchema }).refine(
  value => checkIdentity(value, "resultId", "director_result_v0"), "Director result identity mismatch.",
);
export type DirectorResult = z.infer<typeof DirectorResultSchema>;

export function createDirectorResult(proposalInput: unknown, runtimeInput: DirectorRuntimeAuthority, authority: DirectorAuthority): DirectorResult {
  const proposal = ProposalSchema.parse(proposalInput), runtime = RuntimeAuthoritySchema.parse(runtimeInput);
  const map = new EditorialArtifactMap(authority.artifacts);
  const request = validateDirectorRequest(exactArtifact(map, runtime.request, "DirectorRequest"), authority);
  const report = validateDirectorGroundingReport(exactArtifact(map, runtime.groundingReport, "DirectorGroundingReport"), runtime.request, authority);
  const producer = DirectorProducerRunSchema.parse(exactArtifact(map, runtime.producerRun, "DirectorProducerRun"));
  const selection = ModelSelectionSchema.parse(exactArtifact(map, request.modelSelection, "ModelSelection"));
  ensure(sameScope(producer.scope, request.scope) && equal(producer.request, runtime.request)
    && equal(producer.selection, request.modelSelection) && equal(producer.groundingReport, runtime.groundingReport)
    && producer.outcome === proposal.outcome && equal(producer.direction, proposal.direction)
    && equal(producer.failure, proposal.failure), "Runtime receipt does not bind proposed result.");
  for (const ref of producer.evidenceRefs) scopedDiagnosticEvidence(ref, request.scope, map);
  ensure(equal(report.request, runtime.request) && equal(report.direction, proposal.direction)
    && equal(report.unresolvedRequirements, proposal.unresolvedRequirements), "Grounding report direction/request/findings mismatch.");
  ensure(runtime.modelRun.state !== "failed" && runtime.costTrace.state !== "failed", "Gate 4 has no truthful Director ModelRun or CostTrace operation.");
  for (const ref of runtime.modelRun.evidenceRefs) scopedDiagnosticEvidence(ref, request.scope, map);
  for (const ref of runtime.costTrace.evidenceRefs) scopedDiagnosticEvidence(ref, request.scope, map);
  for (const ref of proposal.uncertainty.evidenceRefs) scopedDiagnosticEvidence(ref, request.scope, map);
  const hasDirection = proposal.direction.state === "present";
  if (proposal.direction.state === "present") {
    const graph = validateCreativeDirectionGraph(exactArtifact(map, proposal.direction.value, "CreativeDirectionGraph"), runtime.request, authority);
    ensure(equal(graph.unresolvedRequirements, proposal.unresolvedRequirements), "Direction unresolved requirements mismatch.");
    ensure(selection.chosen.state === "present", "Director direction requires an eligible Gate-3 model selection.");
    if (proposal.outcome === "succeeded") {
      ensure(graph.nodes.length > 0 && !proposal.unresolvedRequirements.some(finding => finding.severity === "blocking"), "Succeeded requires a complete nonblocking direction.");
      ensure(report.state !== "unresolved", "Succeeded cannot claim unresolved grounding.");
    }
  } else {
    for (const ref of proposal.direction.evidenceRefs) map.resolve(ref);
    ensure(proposal.outcome === "abstained" || proposal.outcome === "failed", "Successful or partial result requires direction.");
  }
  if (proposal.outcome === "partial") ensure(hasDirection && proposal.unresolvedRequirements.length > 0, "Partial result must disclose unresolved requirements.");
  if (proposal.outcome === "abstained") ensure(!hasDirection && proposal.unresolvedRequirements.length > 0, "Abstention requires explicit reasons and no success graph.");
  if (proposal.outcome === "failed") ensure(!hasDirection && proposal.failure.state === "present", "Failure requires sanitized failure and no direction.");
  if (proposal.outcome !== "failed") ensure(proposal.failure.state === "not_applicable", "Nonfailed result cannot carry a failure state.");
  if (proposal.failure.state === "present") {
    for (const ref of proposal.failure.value.evidenceRefs) scopedDiagnosticEvidence(ref, request.scope, map);
    for (const ref of proposal.failure.value.affectedRefs) {
      const root = map.get(ref);
      ensure(root !== null && typeof root === "object" && !Array.isArray(root) && "scope" in root
        && sameScope(DirectorScopeSchema.parse((root as { scope: unknown }).scope), request.scope), "Affected diagnostic artifact scope unavailable.");
    }
    for (const ref of proposal.failure.value.dependencyFailures) {
      const root = map.get(ref);
      ensure(root !== null && typeof root === "object" && !Array.isArray(root) && "scope" in root
        && sameScope(DirectorScopeSchema.parse((root as { scope: unknown }).scope), request.scope), "Failed dependency scope unavailable.");
    }
  } else for (const ref of proposal.failure.evidenceRefs) scopedDiagnosticEvidence(ref, request.scope, map);
  const body = ResultBodySchema.parse({ artifactType: "DirectorResult", artifactVersion: DIRECTOR_VERSION, stability: "internal_pre_stable",
    request: runtime.request, scope: request.scope, outcome: proposal.outcome, direction: proposal.direction,
    unresolvedRequirements: proposal.unresolvedRequirements, uncertainty: proposal.uncertainty,
    groundingReport: runtime.groundingReport, producerRun: runtime.producerRun, modelRun: runtime.modelRun,
    selection: request.modelSelection, costTrace: runtime.costTrace, failure: proposal.failure });
  return clone(DirectorResultSchema.parse(identify("director_result_v0", "resultId", body)));
}
export function validateDirectorResult(input: unknown, runtime: DirectorRuntimeAuthority, authority: DirectorAuthority): DirectorResult {
  const result = DirectorResultSchema.parse(input);
  ensure(equal(result, createDirectorResult({ outcome: result.outcome, direction: result.direction,
    unresolvedRequirements: result.unresolvedRequirements, uncertainty: result.uncertainty, failure: result.failure }, runtime, authority)), "Director result replay mismatch.");
  return clone(result);
}
export function validateDirectorResultArtifact(resultRef: Ref, runtime: DirectorRuntimeAuthority, authority: DirectorAuthority): DirectorResult {
  const map = new EditorialArtifactMap(authority.artifacts);
  return validateDirectorResult(exactArtifact(map, resultRef, "DirectorResult"), runtime, authority);
}
