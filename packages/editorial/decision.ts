import { z } from "zod";
import { IdSchema, TimeRangeSchema, TimestampSchema, TransitionSchema, VersionLabelSchema } from "../contracts/common.js";
import { UniversalEditPlanSchema } from "../contracts/edit-plan.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { ArtifactRefSchema, ArtifactRefsSchema, EditorialArtifactMap, EvidenceRefSchema, EvidenceRefsSchema, IdListSchema, IdSetSchema, ProducerSchema, availability, checkIdentity, compareText, editorialEnvelope, ensure, equal, identify, unique } from "./common.js";
import { EditorialTokenSchema, type EditorialToken } from "./token.js";
import { DecisionTypeSchema, TASK_DEFINITIONS, TaskRefSchema } from "./taxonomy.js";
import { resolveFootageRun, validateProducerEvidence, validateTokenEvidence } from "./resolve.js";

const CountSchema = z.number().finite().int().safe().nonnegative();
const TokenRefSchema = ArtifactRefSchema.refine((r) => r.artifactType === "EditorialToken" && r.artifactVersion === "0.1.0", "Expected internal token reference.");
export const EditorialCandidateSetBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialCandidateSet"), projectId: IdSchema,
  candidates: z.array(z.strictObject({ candidateId: IdSchema, token: TokenRefSchema })).max(4096)
    .refine((v) => unique(v.map((c) => c.candidateId)), "Duplicate candidate IDs.")
    .transform((v) => [...v].sort((a, b) => compareText(a.candidateId, b.candidateId))),
  analysisRefs: ArtifactRefsSchema, runRefs: ArtifactRefsSchema, selectionPolicy: EvidenceRefSchema,
  universe: z.enum(["retained", "all_proposed", "explicit_subset"]), sourceRunStatus: z.enum(["succeeded", "partial"]), failureEvidence: EvidenceRefsSchema,
});
export const EditorialCandidateSetSchema = EditorialCandidateSetBodySchema.extend({ candidateSetId: IdSchema }).superRefine((v, ctx) => {
  if (!checkIdentity(v, "candidateSetId", "editorial_set")) ctx.addIssue({ code: "custom", message: "Candidate set identity mismatch." });
  if (v.sourceRunStatus === "partial" && (v.universe !== "explicit_subset" || !v.failureEvidence.length)) ctx.addIssue({ code: "custom", message: "Partial source runs require an explicit subset and failure evidence." });
  if (v.sourceRunStatus === "succeeded" && v.failureEvidence.length) ctx.addIssue({ code: "custom", message: "Successful source status conflicts with failure evidence." });
});
export type EditorialCandidateSet = z.infer<typeof EditorialCandidateSetSchema>;
export function createEditorialCandidateSet(body: z.input<typeof EditorialCandidateSetBodySchema>) {
  return EditorialCandidateSetSchema.parse(identify("editorial_set", "candidateSetId", EditorialCandidateSetBodySchema.parse(body)));
}
export const ClipUseSchema = z.strictObject({ useId: IdSchema, candidateId: IdSchema, token: TokenRefSchema, sourceRange: TimeRangeSchema });
export type ClipUse = z.infer<typeof ClipUseSchema>;
const UsesSchema = z.array(ClipUseSchema).max(120).refine((v) => unique(v.map((u) => u.useId)), "Duplicate use IDs.");
export const ChoiceOptionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ optionId: IdSchema, kind: z.literal("candidate"), candidateId: IdSchema }),
  z.strictObject({ optionId: IdSchema, kind: z.literal("trim"), use: ClipUseSchema }),
  z.strictObject({ optionId: IdSchema, kind: z.literal("transition"), outgoing: ClipUseSchema, incoming: ClipUseSchema, transition: TransitionSchema }),
  z.strictObject({ optionId: IdSchema, kind: z.literal("sequence"), uses: UsesSchema.refine((v) => v.length > 0) }),
  z.strictObject({ optionId: IdSchema, kind: z.literal("end_sequence") }),
]);
export const EditorialContextBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialContext"), projectId: IdSchema, asOf: TimestampSchema, precedingUses: UsesSchema,
  previousDecisionRefs: z.array(ArtifactRefSchema).max(4096).refine((refs) => unique(refs.map((r) => r.objectId)), "Duplicate previous decision refs."),
  brief: availability(EvidenceRefSchema), timelineSnapshot: availability(EvidenceRefSchema), completeness: z.enum(["complete", "partial", "unknown"]),
});
export const EditorialContextSchema = EditorialContextBodySchema.extend({ contextId: IdSchema }).refine((v) => checkIdentity(v, "contextId", "editorial_context"), "Context identity mismatch.");
export type EditorialContext = z.infer<typeof EditorialContextSchema>;
export function createEditorialContext(body: z.input<typeof EditorialContextBodySchema>) {
  return EditorialContextSchema.parse(identify("editorial_context", "contextId", EditorialContextBodySchema.parse(body)));
}
const PseudonymSchema = z.strictObject({ pseudonymId: IdSchema, namespaceId: IdSchema });
const JudgmentProvenance = { basis: z.enum(["explicit_annotation", "derived_observation", "synthetic_fixture"]), sourceEvidence: EvidenceRefsSchema.refine((v) => v.length > 0), labelProtocol: EvidenceRefSchema, annotator: PseudonymSchema.optional() };
const TieGroupsSchema = z.array(IdSetSchema.refine((g) => g.length > 0, "Empty tie group.")).max(256)
  .refine((groups) => unique(groups.flat()), "Duplicate ranked option.");
export const TaskJudgmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("selection"), acceptedOptionIds: IdSetSchema, ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("keep_reject"), candidateId: IdSchema, label: z.enum(["keep", "reject", "abstain", "unjudged"]), ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("pairwise"), leftOptionId: IdSchema, rightOptionId: IdSchema, outcome: z.enum(["left", "right", "tie", "abstain", "unjudged"]), ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("ranking"), tieGroups: TieGroupsSchema, unjudgedOptionIds: IdSetSchema, completeness: z.enum(["complete", "partial"]), ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("moments"), assetId: IdSchema, sourceHash: HashSchema, shotId: IdSchema, ranges: z.array(TimeRangeSchema).min(1).max(256), candidateIds: IdSetSchema, ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("trim"), candidateId: IdSchema, acceptableRanges: z.array(TimeRangeSchema).min(1).max(256), ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("next_shot"), acceptableOptionIds: IdSetSchema, ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("transition"), optionId: IdSchema, label: z.enum(["compatible", "incompatible", "uncertain", "unjudged"]), rubric: EvidenceRefSchema, ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("sequence"), tieGroups: TieGroupsSchema, unjudgedOptionIds: IdSetSchema, ...JudgmentProvenance }),
  z.strictObject({ kind: z.literal("usability"), candidateId: IdSchema, dimension: IdSchema, rubric: EvidenceRefSchema, label: IdSchema, ...JudgmentProvenance }),
]).refine((j) => j.basis !== "explicit_annotation" || j.annotator !== undefined, "Explicit annotations require an annotator.");
export const ObservationSchema = z.strictObject({
  observationId: IdSchema, ordinal: CountSchema, occurredAt: availability(TimestampSchema), evidenceRefs: EvidenceRefsSchema.refine((v) => v.length > 0),
  action: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("presented"), optionId: IdSchema }),
    z.strictObject({ kind: z.literal("inspected"), optionId: IdSchema }),
    z.strictObject({ kind: z.literal("selected"), optionId: IdSchema }),
    z.strictObject({ kind: z.literal("rejected"), optionId: IdSchema }),
    z.strictObject({ kind: z.literal("trimmed"), before: ClipUseSchema, after: ClipUseSchema }),
    z.strictObject({ kind: z.literal("reordered"), beforeUseIds: IdListSchema, afterUseIds: IdListSchema }),
    z.strictObject({ kind: z.literal("replaced"), oldUse: ClipUseSchema, newUse: ClipUseSchema }),
    z.strictObject({ kind: z.literal("survived_final"), useId: IdSchema, timelineLink: EvidenceRefSchema }),
  ]),
}).superRefine((v, ctx) => {
  const a = v.action;
  if (a.kind === "reordered" && !equal([...a.beforeUseIds].sort(), [...a.afterUseIds].sort())) ctx.addIssue({ code: "custom", message: "Reorder must preserve use IDs." });
  if (a.kind === "trimmed" && (a.before.useId !== a.after.useId || a.before.candidateId !== a.after.candidateId || !equal(a.before.token, a.after.token))) ctx.addIssue({ code: "custom", message: "Trim must preserve use/candidate/token identity." });
  if (a.kind === "replaced" && (a.oldUse.useId === a.newUse.useId || a.oldUse.candidateId === a.newUse.candidateId)) ctx.addIssue({ code: "custom", message: "Replacement requires distinct candidate uses." });
});
export const EditorialDecisionBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialDecision"), projectId: IdSchema, task: TaskRefSchema, decisionType: DecisionTypeSchema,
  availableCandidates: ArtifactRefSchema, options: z.array(ChoiceOptionSchema).min(1).max(256).refine((v) => unique(v.map((o) => o.optionId)), "Duplicate option IDs."),
  presentation: availability(z.strictObject({ order: IdListSchema, protocol: EvidenceRefSchema, seed: availability(z.number().int().safe()) })),
  previousContext: availability(ArtifactRefSchema), actor: z.strictObject({ kind: z.enum(["editor", "annotator", "system"]), ...PseudonymSchema.shape }),
  observed: z.strictObject({ completion: z.enum(["open", "completed", "abstained"]), selectedCandidateIds: IdSetSchema, rejectedCandidateIds: IdSetSchema, chosenOptionIds: IdSetSchema, rejectedOptionIds: IdSetSchema,
    observations: z.array(ObservationSchema).max(4096).refine((v) => unique(v.map((o) => o.observationId)) && v.every((o, i) => i === 0 || o.ordinal > v[i - 1]!.ordinal), "Observation IDs must be unique and ordinals strictly increasing."), finalTrims: availability(UsesSchema) }),
  judgment: availability(TaskJudgmentSchema),
  editorExplanation: availability(z.strictObject({ author: PseudonymSchema, reasonTaxonomy: EvidenceRefSchema, reasonTags: IdSetSchema,
    confidence: availability(z.strictObject({ value: z.number().finite().min(0).max(1), meaning: z.literal("self_reported_certainty"), scaleVersion: VersionLabelSchema })), sourceEvidence: EvidenceRefsSchema.refine((v) => v.length > 0) })),
  producing: z.strictObject({ analysisRefs: ArtifactRefsSchema, runRefs: ArtifactRefsSchema, captureProducer: ProducerSchema, decisionConfiguration: EvidenceRefSchema }),
  finalTimelineLinkage: availability(ArtifactRefSchema), legacyEventRefs: ArtifactRefsSchema, supersedes: availability(ArtifactRefSchema),
});
export const EditorialDecisionSchema = EditorialDecisionBodySchema.extend({ decisionId: IdSchema }).superRefine((d, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!checkIdentity(d, "decisionId", "editorial_decision")) fail("Decision identity mismatch.");
  const definition = TASK_DEFINITIONS.find((t) => t.taskId === d.task.taskId)!;
  if (![definition.decisionType, "inspect", "reorder", "replace", "record_final_survival"].includes(d.decisionType)) fail("Task/decision type mismatch.");
  const ids = d.options.map((o) => o.optionId), observed = d.observed;
  const subset = (values: readonly string[]) => values.every((id) => ids.includes(id));
  if (!subset(observed.chosenOptionIds) || !subset(observed.rejectedOptionIds) || observed.chosenOptionIds.some((id) => observed.rejectedOptionIds.includes(id))) fail("Chosen/rejected options must be disjoint subsets.");
  if (observed.selectedCandidateIds.some((id) => observed.rejectedCandidateIds.includes(id))) fail("Selected/rejected candidates must be disjoint.");
  if (d.presentation.state === "present" && !subset(d.presentation.value.order)) fail("Presentation refers to foreign option.");
  for (const o of observed.observations) if ("optionId" in o.action && !ids.includes(o.action.optionId)) fail("Observation refers to foreign option.");
  if (d.editorExplanation.state === "present" && (d.actor.kind === "system" || d.editorExplanation.value.author.pseudonymId !== d.actor.pseudonymId || d.editorExplanation.value.author.namespaceId !== d.actor.namespaceId)) fail("Editor explanation requires matching human authorship.");
  const task = d.task.taskId;
  const kinds = d.options.map((o) => o.kind);
  if (["candidate_selection", "keep_reject", "pairwise_preference", "candidate_ranking", "moment_selection", "technical_usability", "aesthetic_usability"].includes(task) && kinds.some((k) => k !== "candidate")) fail("Task requires candidate options.");
  if (task === "pairwise_preference" && (d.options.length !== 2 || !unique(d.options.map((o) => o.kind === "candidate" ? o.candidateId : "")))) fail("Pairwise input requires two distinct candidates.");
  if (["keep_reject", "technical_usability", "aesthetic_usability"].includes(task) && d.options.length !== 1) fail("Task requires one candidate.");
  const candidateOptions = d.options.flatMap((o) => o.kind === "candidate" ? [o.candidateId] : []);
  const trimCandidates = d.options.flatMap((o) => o.kind === "trim" ? [o.use.candidateId] : []);
  if (task === "trim_boundary_selection" && (kinds.some((k) => k !== "trim") || new Set(trimCandidates).size !== 1)) fail("Trim task requires bounded trim options for one task candidate.");
  if (task === "transition_compatibility" && (d.options.length !== 1 || kinds[0] !== "transition")) fail("Transition task requires one ordered clip pair.");
  if (task === "sequence_preference" && (d.options.length < 2 || kinds.some((k) => k !== "sequence"))) fail("Sequence task requires two or more sequences.");
  if (task === "next_shot_choice" && (kinds.some((k) => k !== "candidate" && k !== "end_sequence") || kinds.filter((k) => k === "end_sequence").length > 1 || d.previousContext.state !== "present")) fail("Next-shot task requires prior context and candidate/end options.");
  if (d.judgment.state !== "present") return;
  const j = d.judgment.value;
  if (definition.outcomeKind !== j.kind) fail("Task/judgment mismatch or reserved task.");
  if ((j.kind === "keep_reject" || j.kind === "usability") && j.candidateId !== candidateOptions[0]) fail("Judgment must identify the task candidate.");
  if (j.kind === "trim" && j.candidateId !== trimCandidates[0]) fail("Trim judgment must identify the task candidate.");
  if (j.kind === "moments" && !j.candidateIds.every((id) => candidateOptions.includes(id))) fail("Moment correspondence must identify supplied candidate options.");
  if (j.kind === "ranking" || j.kind === "sequence") {
    const assigned = [...j.tieGroups.flat(), ...j.unjudgedOptionIds];
    if (!unique(assigned) || !equal([...assigned].sort(), [...ids].sort())) fail("Ranking must assign every eligible option exactly once, including unjudged.");
    if (j.kind === "ranking" && j.completeness === "complete" && j.unjudgedOptionIds.length) fail("Complete ranking cannot contain unjudged options.");
    if (observed.completion === "abstained" && j.tieGroups.length) fail("Abstention cannot contain ranked judgments.");
  }
  if (j.kind === "pairwise" && (j.leftOptionId === j.rightOptionId || !subset([j.leftOptionId, j.rightOptionId]))) fail("Pairwise judgment requires the two distinct options.");
  if ((j.kind === "selection" && !subset(j.acceptedOptionIds)) || (j.kind === "next_shot" && !subset(j.acceptableOptionIds)) || (j.kind === "transition" && !subset([j.optionId]))) fail("Judgment refers to foreign options.");
});
export type EditorialDecision = z.infer<typeof EditorialDecisionSchema>;
export function createEditorialDecision(body: z.input<typeof EditorialDecisionBodySchema>) {
  return EditorialDecisionSchema.parse(identify("editorial_decision", "decisionId", EditorialDecisionBodySchema.parse(body)));
}

function within(range: z.infer<typeof TimeRangeSchema>, outer: z.infer<typeof TimeRangeSchema>): boolean {
  return range.startSeconds >= outer.startSeconds && range.endSeconds <= outer.endSeconds;
}
export function validateCandidateSet(input: EditorialCandidateSet, artifacts: EditorialArtifactMap) {
  const set = EditorialCandidateSetSchema.parse(input), tokens = new Map<string, EditorialToken>(), sources = new Map<string, string>();
  artifacts.resolve(set.selectionPolicy);
  const analyses = set.analysisRefs.map((ref) => FootageAnalysisSchema.parse(artifacts.get(ref)));
  ensure(analyses.every((a) => a.authorization.projectId === set.projectId), "Candidate set analysis project mismatch.");
  const runs = set.runRefs.map((ref) => resolveFootageRun(ref, artifacts));
  ensure(runs.every((run) => run.status !== "failed"), "Failed source run cannot supply a candidate set.");
  const sourceRunStatus = runs.some((run) => run.status === "partial") ? "partial" : "succeeded";
  ensure(set.sourceRunStatus === sourceRunStatus, "Candidate set source run status contradicts supplied runs.");
  for (const ref of set.failureEvidence) artifacts.resolve(ref);
  for (const entry of set.candidates) {
    const token = validateTokenEvidence(EditorialTokenSchema.parse(artifacts.get(entry.token)), artifacts);
    ensure(token.projectId === set.projectId && token.candidate.candidateId === entry.candidateId, "Candidate set project/candidate mismatch.");
    ensure(!sources.has(token.candidate.assetId) || sources.get(token.candidate.assetId) === token.sourceHash, "Conflicting source identity.");
    sources.set(token.candidate.assetId, token.sourceHash);
    ensure(set.analysisRefs.some((r) => equal(r, token.analysis.artifact)) && set.runRefs.some((r) => equal(r, token.producingRun.artifact)), "Candidate producing snapshot missing from set.");
    tokens.set(entry.candidateId, token);
  }
  if (set.universe !== "explicit_subset") {
    // Scope is exactly the bound analysis snapshot, never an inferred project inventory.
    const expected = new Set(analyses.flatMap((a) => set.universe === "retained" ? a.keptCandidateIds : a.candidates.map((c) => c.candidate.candidateId)));
    ensure(equal([...tokens.keys()].sort(compareText), [...expected].sort(compareText)), "Candidate set universe contradicts supplied analyses.");
  }
  return { set, tokens };
}
function validateUse(use: ClipUse, projectId: string, artifacts: EditorialArtifactMap, set?: EditorialCandidateSet) {
  const token = validateTokenEvidence(EditorialTokenSchema.parse(artifacts.get(use.token)), artifacts);
  ensure(token.projectId === projectId && token.candidate.candidateId === use.candidateId && within(use.sourceRange, token.candidate.sourceRange), "Clip use project/candidate/trim mismatch.");
  if (set) ensure(set.candidates.some((c) => c.candidateId === use.candidateId && equal(c.token, use.token)), "Use representation differs from available snapshot.");
  return token;
}
export function validateEditorialContext(input: EditorialContext, artifacts: EditorialArtifactMap) {
  const context = EditorialContextSchema.parse(input);
  for (const use of context.precedingUses) validateUse(use, context.projectId, artifacts);
  for (const ref of context.previousDecisionRefs) {
    const prior = EditorialDecisionSchema.parse(artifacts.get(ref));
    ensure(prior.projectId === context.projectId, "Prior decision project mismatch.");
    ensure(prior.observed.observations.every((o) => o.occurredAt.state !== "present" || o.occurredAt.value <= context.asOf), "Future decision in prediction context.");
    if (!prior.observed.observations.length || prior.observed.observations.some((o) => o.occurredAt.state !== "present")) ensure(context.completeness !== "complete", "Undated prior history requires explicitly incomplete context.");
  }
  for (const field of [context.brief, context.timelineSnapshot]) if (field.state === "present") artifacts.resolve(field.value);
  return context;
}
export function validateEditorialDecision(input: EditorialDecision, artifacts: EditorialArtifactMap) {
  const d = EditorialDecisionSchema.parse(input), { set, tokens } = validateCandidateSet(EditorialCandidateSetSchema.parse(artifacts.get(d.availableCandidates)), artifacts);
  ensure(set.projectId === d.projectId, "Decision/candidate-set project mismatch.");
  ensure(equal(d.producing.analysisRefs, set.analysisRefs) && equal(d.producing.runRefs, set.runRefs), "Decision producing snapshot mismatch.");
  validateProducerEvidence(d.producing.captureProducer, artifacts); artifacts.resolve(d.producing.decisionConfiguration);
  const context = d.previousContext.state === "present" ? validateEditorialContext(EditorialContextSchema.parse(artifacts.get(d.previousContext.value)), artifacts) : undefined;
  if (context) {
    ensure(context.projectId === d.projectId, "Context project mismatch.");
    for (const o of d.observed.observations) if (o.occurredAt.state === "present") ensure(context.asOf <= o.occurredAt.value, "Prediction context follows decision observation.");
    if (!d.observed.observations.length || d.observed.observations.some((o) => o.occurredAt.state !== "present")) ensure(context.completeness !== "complete", "Undated capture requires incomplete context.");
    ensure(!context.previousDecisionRefs.some((r) => r.objectId === d.decisionId), "Current decision leaks into prior context.");
  }
  const uses = new Map((context?.precedingUses ?? []).map((u) => [u.useId, u]));
  const register = (u: ClipUse) => {
    validateUse(u, d.projectId, artifacts, set);
    ensure(!uses.has(u.useId) || equal(uses.get(u.useId), u), "Conflicting repeated use identity."); uses.set(u.useId, u);
  };
  for (const option of d.options) {
    if (option.kind === "candidate") ensure(tokens.has(option.candidateId), "Option candidate outside eligible set.");
    if (option.kind === "trim") register(option.use);
    if (option.kind === "sequence") for (const u of option.uses) register(u);
    if (option.kind === "transition") { register(option.outgoing); register(option.incoming); ensure(option.outgoing.useId !== option.incoming.useId, "Transition requires distinct uses."); }
  }
  if (d.task.taskId === "candidate_ranking") ensure(unique(d.options.map((o) => o.kind === "candidate" ? o.candidateId : "")) && equal(d.options.map((o) => o.kind === "candidate" ? o.candidateId : "").sort(), [...tokens.keys()].sort()), "Ranking options must equal the fixed eligible candidate set.");
  for (const id of [...d.observed.selectedCandidateIds, ...d.observed.rejectedCandidateIds]) ensure(tokens.has(id), "Observed candidate outside available set.");
  for (const id of d.observed.rejectedCandidateIds) ensure(d.observed.observations.some((o) => o.action.kind === "rejected" && d.options.some((p) => p.optionId === (o.action as { optionId: string }).optionId && p.kind === "candidate" && p.candidateId === id)), "Candidate rejection requires explicit candidate-option evidence.");
  for (const o of d.observed.observations) {
    for (const ref of o.evidenceRefs) artifacts.resolve(ref);
    const a = o.action;
    if (a.kind === "trimmed") { validateUse(a.before, d.projectId, artifacts, set); validateUse(a.after, d.projectId, artifacts, set); uses.set(a.after.useId, a.after); }
    if (a.kind === "replaced") { validateUse(a.oldUse, d.projectId, artifacts); register(a.newUse); }
    if (a.kind === "reordered") ensure(a.beforeUseIds.every((id) => uses.has(id)), "Reorder refers to unknown use.");
    if (a.kind === "survived_final") {
      const link = EditorialTimelineLinkageSchema.parse(artifacts.get(a.timelineLink.artifact));
      validateTimelineLinkage(link, artifacts);
      const mapping = artifacts.resolve(a.timelineLink);
      ensure(link.projectId === d.projectId && link.mappings.some((m) => m.useId === a.useId && equal(m, mapping) && m.mappingKind === "exact"), "Final survival lacks exact grounded mapping.");
    }
  }
  if (d.observed.finalTrims.state === "present") for (const u of d.observed.finalTrims.value) validateUse(u, d.projectId, artifacts, set);
  if (d.presentation.state === "present") artifacts.resolve(d.presentation.value.protocol);
  if (d.judgment.state === "present") {
    const j = d.judgment.value;
    artifacts.resolve(j.labelProtocol); for (const ref of j.sourceEvidence) artifacts.resolve(ref);
    if ("candidateId" in j) ensure(tokens.has(j.candidateId), "Judgment candidate outside available set.");
    if (j.kind === "trim") ensure(j.acceptableRanges.every((r) => within(r, tokens.get(j.candidateId)!.candidate.sourceRange)), "Trim judgment extends beyond candidate.");
    if (j.kind === "moments") {
      ensure(j.candidateIds.every((id) => tokens.has(id)), "Moment correspondence outside set.");
      const token = [...tokens.values()].find((t) => t.candidate.assetId === j.assetId && t.sourceHash === j.sourceHash && t.candidate.shotId === j.shotId);
      ensure(token?.temporal.data.state === "present" && j.ranges.every((r) => within(r, token.temporal.data.state === "present" ? token.temporal.data.value.shotRange : r)), "Moment lacks matching source-shot evidence.");
    }
    if (j.kind === "usability" || j.kind === "transition") {
      const rubric = z.strictObject({ version: VersionLabelSchema, dimension: IdSchema, labels: IdListSchema }).parse(artifacts.resolve(j.rubric));
      ensure(rubric.labels.includes(j.label) && (j.kind !== "usability" || rubric.dimension === j.dimension), "Label incompatible with supplied rubric.");
    }
  }
  if (d.editorExplanation.state === "present") { const e = d.editorExplanation.value; artifacts.resolve(e.reasonTaxonomy); for (const ref of e.sourceEvidence) artifacts.resolve(ref); }
  for (const ref of d.legacyEventRefs) artifacts.get(ref);
  if (d.supersedes.state === "present") { const prior = EditorialDecisionSchema.parse(artifacts.get(d.supersedes.value)); ensure(prior.projectId === d.projectId && prior.decisionId !== d.decisionId, "Invalid supersession edge."); }
  if (d.finalTimelineLinkage.state === "present") { const link = validateTimelineLinkage(EditorialTimelineLinkageSchema.parse(artifacts.get(d.finalTimelineLinkage.value)), artifacts); ensure(link.projectId === d.projectId, "Timeline linkage project mismatch."); }
  return d;
}

const TimelineMappingSchema = z.strictObject({
  useId: IdSchema, candidate: availability(z.strictObject({ candidateId: IdSchema, token: TokenRefSchema })), assetId: IdSchema, sourceHash: HashSchema,
  sourceRange: TimeRangeSchema, outputRange: TimeRangeSchema, planClipId: availability(IdSchema), decision: availability(ArtifactRefSchema),
  mappingKind: z.enum(["exact", "manual_alignment", "estimated"]), evidenceRefs: EvidenceRefsSchema.refine((v) => v.length > 0),
});
export const EditorialTimelineLinkageBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialTimelineLinkage"), projectId: IdSchema, finalEdit: ArtifactRefSchema,
  plan: z.strictObject({ artifact: ArtifactRefSchema, planId: IdSchema, revision: CountSchema }).optional(),
  alignmentProducer: ProducerSchema, configuration: EvidenceRefSchema,
  mappings: z.array(TimelineMappingSchema).max(4096).refine((v) => unique(v.map((m) => m.useId)), "Duplicate timeline mapping use IDs."),
  unmappedOutput: z.array(TimeRangeSchema).max(4096), unmappedSource: z.array(z.strictObject({ assetId: IdSchema, sourceHash: HashSchema, sourceRange: TimeRangeSchema })).max(4096),
  unknownSurvival: availability(IdSetSchema),
});
export const EditorialTimelineLinkageSchema = EditorialTimelineLinkageBodySchema.extend({ linkageId: IdSchema }).superRefine((v, ctx) => {
  if (!checkIdentity(v, "linkageId", "editorial_linkage")) ctx.addIssue({ code: "custom", message: "Timeline linkage identity mismatch." });
  for (const m of v.mappings) if (m.mappingKind === "exact" && (!v.plan || m.planClipId.state !== "present" || m.candidate.state !== "present" || m.decision.state !== "present")) ctx.addIssue({ code: "custom", message: "Exact mapping requires explicit real plan/clip/candidate/decision linkage." });
});
export type EditorialTimelineLinkage = z.infer<typeof EditorialTimelineLinkageSchema>;
export function createEditorialTimelineLinkage(body: z.input<typeof EditorialTimelineLinkageBodySchema>) {
  return EditorialTimelineLinkageSchema.parse(identify("editorial_linkage", "linkageId", EditorialTimelineLinkageBodySchema.parse(body)));
}
export function validateTimelineLinkage(input: EditorialTimelineLinkage, artifacts: EditorialArtifactMap) {
  const link = EditorialTimelineLinkageSchema.parse(input);
  artifacts.get(link.finalEdit); artifacts.resolve(link.configuration); validateProducerEvidence(link.alignmentProducer, artifacts);
  const plan = link.plan ? UniversalEditPlanSchema.parse(artifacts.get(link.plan.artifact)) : undefined;
  if (plan && link.plan) ensure(plan.planId === link.plan.planId && plan.revision === link.plan.revision && plan.projectId === link.projectId, "Explicit plan linkage mismatch.");
  for (const m of link.mappings) {
    for (const ref of m.evidenceRefs) artifacts.resolve(ref);
    if (m.candidate.state === "present") {
      const t = validateUse({ useId: m.useId, ...m.candidate.value, sourceRange: m.sourceRange }, link.projectId, artifacts);
      ensure(t.candidate.assetId === m.assetId && t.sourceHash === m.sourceHash, "Timeline source identity mismatch.");
    }
    if (m.decision.state === "present") { const decision = EditorialDecisionSchema.parse(artifacts.get(m.decision.value)); ensure(decision.projectId === link.projectId, "Timeline decision project mismatch."); }
    if (m.mappingKind === "exact") {
      ensure(plan && m.planClipId.state === "present" && m.candidate.state === "present" && m.decision.state === "present", "Exact linkage missing.");
      const clip = plan.clips.find((c) => m.planClipId.state === "present" && c.clipId === m.planClipId.value);
      const decision = EditorialDecisionSchema.parse(artifacts.get(m.decision.value));
      ensure(clip && clip.assetId === m.assetId && clip.segmentId === m.candidate.value.candidateId && clip.decisionId === decision.decisionId && equal(clip.sourceRange, m.sourceRange), "Plan clip source/decision mismatch.");
      ensure(Math.abs(clip.outputStartSeconds - m.outputRange.startSeconds) <= 1e-6 && Math.abs(m.outputRange.endSeconds - m.outputRange.startSeconds - (clip.sourceRange.endSeconds - clip.sourceRange.startSeconds) / clip.speed) <= 1e-6, "Plan output timing/speed mismatch.");
    }
  }
  return link;
}

/** Exposure projection never subtracts sets to infer rejection or inspection. */
export function editorialExposure(decisionInput: EditorialDecision) {
  const d = EditorialDecisionSchema.parse(decisionInput);
  return { availableCandidates: d.availableCandidates, presented: d.presentation.state === "present" ? d.presentation.value.order : d.presentation,
    observations: d.observed.observations.filter((o) => o.action.kind === "presented" || o.action.kind === "inspected"),
    chosenOptionIds: d.observed.chosenOptionIds, selectedCandidateIds: d.observed.selectedCandidateIds, explicitlyRejectedCandidateIds: d.observed.rejectedCandidateIds, explicitlyRejectedOptionIds: d.observed.rejectedOptionIds };
}
