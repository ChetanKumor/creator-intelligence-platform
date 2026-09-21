import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, compareText, editorialEnvelope, equal, identify } from "./common.js";

// Fixed contract registry, not task implementations. Names follow the frozen task/judgment table.
export const TASK_DEFINITIONS = [
  { taskId: "candidate_selection", inputKind: "candidate_set", outcomeKind: "selection", decisionType: "select" },
  { taskId: "keep_reject", inputKind: "candidate", outcomeKind: "keep_reject", decisionType: "keep_reject" },
  { taskId: "pairwise_preference", inputKind: "candidate_pair", outcomeKind: "pairwise", decisionType: "compare" },
  { taskId: "candidate_ranking", inputKind: "candidate_set", outcomeKind: "ranking", decisionType: "rank" },
  { taskId: "moment_selection", inputKind: "source_or_candidates", outcomeKind: "moments", decisionType: "select_moment" },
  { taskId: "trim_boundary_selection", inputKind: "trim_domain", outcomeKind: "trim", decisionType: "trim" },
  { taskId: "next_shot_choice", inputKind: "preceding_context_candidates", outcomeKind: "next_shot", decisionType: "choose_next" },
  { taskId: "transition_compatibility", inputKind: "ordered_clip_pair", outcomeKind: "transition", decisionType: "assess_transition" },
  { taskId: "sequence_preference", inputKind: "sequences", outcomeKind: "sequence", decisionType: "compare_sequences" },
  { taskId: "technical_usability", inputKind: "candidate_constraints", outcomeKind: "usability", decisionType: "assess_usability" },
  { taskId: "aesthetic_usability", inputKind: "candidate_objective", outcomeKind: "usability", decisionType: "assess_usability" },
  { taskId: "reference_style_compatibility", inputKind: "authorized_reference", outcomeKind: "reserved", decisionType: "assess_usability" },
] as const;
export const TaskIdSchema = z.enum(TASK_DEFINITIONS.map((t) => t.taskId));
export const DecisionTypeSchema = z.enum(["select", "keep_reject", "compare", "rank", "select_moment", "trim", "choose_next", "assess_transition", "compare_sequences", "assess_usability", "inspect", "reorder", "replace", "record_final_survival"]);
const definitions = TASK_DEFINITIONS.map(({ decisionType: _type, ...t }) => ({ ...t, labelProtocolVersion: "0.1.0" as const, lifecycle: t.taskId === "reference_style_compatibility" ? "reserved" as const : "active_contract" as const })).sort((a, b) => compareText(a.taskId, b.taskId));
const TaxonomyBodySchema = z.strictObject({
  ...editorialEnvelope("EditorialTaskTaxonomy"), taxonomyVersion: z.literal("0.1.0"),
  tasks: z.array(z.strictObject({ taskId: TaskIdSchema, inputKind: z.enum(TASK_DEFINITIONS.map((t) => t.inputKind)), outcomeKind: z.enum(TASK_DEFINITIONS.map((t) => t.outcomeKind)), labelProtocolVersion: z.literal("0.1.0"), lifecycle: z.enum(["active_contract", "reserved"]) }))
    .transform((tasks) => [...tasks].sort((a, b) => compareText(a.taskId, b.taskId))).refine((tasks) => equal(tasks, definitions), "Taxonomy must equal the frozen registry."),
});
export const EditorialTaskTaxonomySchema = TaxonomyBodySchema.extend({ taxonomyId: IdSchema }).refine((v) => checkIdentity(v, "taxonomyId", "editorial_taxonomy"), "Taxonomy identity mismatch.");
export const EDITORIAL_TAXONOMY = EditorialTaskTaxonomySchema.parse(identify("editorial_taxonomy", "taxonomyId", TaxonomyBodySchema.parse({ artifactType: "EditorialTaskTaxonomy", artifactVersion: "0.1.0", stability: "internal_pre_stable", taxonomyVersion: "0.1.0", tasks: definitions })));
export const TaskRefSchema = z.strictObject({ taxonomyId: z.literal(EDITORIAL_TAXONOMY.taxonomyId), taxonomyVersion: z.literal("0.1.0"), taskId: TaskIdSchema });
export type TaskRef = z.infer<typeof TaskRefSchema>;
export function taskRef(taskId: TaskRef["taskId"]): TaskRef { return TaskRefSchema.parse({ taxonomyId: EDITORIAL_TAXONOMY.taxonomyId, taxonomyVersion: "0.1.0", taskId }); }
