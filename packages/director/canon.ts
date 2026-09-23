import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, MissingSchema, availability, checkIdentity, exactDigest, identify, ensure, equal, type ArtifactRef, type EditorialArtifactMap } from "../editorial/common.js";
import { DIRECTOR_VERSION, DirectorDomainSchema, DirectorRefSetSchema, DirectorScopeSchema, DirectorTextSchema, canonicalRefs, directorEnvelope, exactArtifact } from "./common.js";

const CanonKeyRefSchema = z.strictObject({ entryKey: IdSchema, entryVersion: z.literal(DIRECTOR_VERSION) });
const PrerequisiteSchema = z.strictObject({ kind: z.enum(["intent_domain", "known_subject", "known_music_beat", "known_reaction_support"]), value: IdSchema });
const CanonEntryBodySchema = z.strictObject({
  ...directorEnvelope("CanonEntry"),
  entryKey: IdSchema,
  entryVersion: z.literal(DIRECTOR_VERSION),
  provenance: z.strictObject({
    sourceKind: z.literal("first_party_gate4"),
    author: z.literal("creative_intelligence_internal"),
    sourceRevision: z.literal("phase5_gate4_canon_v0"),
    ownership: z.literal("internal_owned"),
    ownershipBasis: z.literal("first_party_authorship_in_this_revision"),
    externalLicense: MissingSchema,
  }),
  domains: z.array(DirectorDomainSchema).min(1).max(3).refine(values => values.every((value, index) => index === 0 || values[index - 1]! < value), "Canonical domains required."),
  category: z.enum(["narrative_grammar", "pacing", "continuity", "coverage", "music", "restraint"]),
  principle: DirectorTextSchema,
  prerequisites: z.array(PrerequisiteSchema).max(8),
  compatible: z.array(CanonKeyRefSchema).max(16),
  conflicting: z.array(CanonKeyRefSchema).max(16),
  failureModes: z.array(DirectorTextSchema).min(1).max(8),
  evaluationRubrics: availability(DirectorRefSetSchema),
  examples: availability(DirectorRefSetSchema),
  recipes: availability(DirectorRefSetSchema),
});
export const CanonEntrySchema = CanonEntryBodySchema.extend({ entryId: IdSchema }).refine(value => checkIdentity(value, "entryId", "director_canon_entry_v0"), "Canon entry identity mismatch.");
export type CanonEntry = z.infer<typeof CanonEntrySchema>;

const absent = (reasonCode: string) => ({ state: "not_applicable" as const, reasonCode, evidenceRefs: [] });
const refs = (keys: readonly string[]) => keys.map(entryKey => ({ entryKey, entryVersion: DIRECTOR_VERSION }));
const domains = ["event", "narrative", "talking_head"] as const;
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const authored = [
  { entryKey: "narrative_arc", category: "narrative_grammar", principle: "Use an intelligible opening, context, development, and payoff when the supplied material supports those roles.", failureModes: ["Forcing a payoff that the supplied evidence does not contain."], conflicting: [] },
  { entryKey: "cause_reaction", category: "narrative_grammar", principle: "Where grounded cause and reaction material both exist, make their intended relationship legible.", failureModes: ["Presenting a creative reaction relationship as an observed source fact."], conflicting: [] },
  { entryKey: "visual_variety", category: "coverage", principle: "Vary visual roles when useful to clarify the story, while preserving continuity and subject comprehension.", failureModes: ["Changing shots solely for variety without a narrative reason."], conflicting: [] },
  { entryKey: "pacing_build", category: "pacing", principle: "Consider a relative pacing progression toward a supported payoff; retain room for meaningful holds.", failureModes: ["Treating faster pacing as a universal quality rule."], conflicting: [] },
  { entryKey: "music_intention", category: "music", principle: "Express desired alignment with a supplied beat or section only when that music evidence is present.", failureModes: ["Inventing a drop or beat that was not supplied."], conflicting: [] },
  { entryKey: "continuity_awareness", category: "continuity", principle: "Preserve enough contextual continuity for a viewer to understand changes in subject, place, or action.", failureModes: ["Implying source chronology from an editorial ordering proposal."], conflicting: [] },
  { entryKey: "subject_coverage", category: "coverage", principle: "Keep the intended subject understandable across the sequence when grounded coverage supports it.", failureModes: ["Assuming unseen subject coverage exists."], conflicting: [] },
  { entryKey: "overediting_restraint", category: "restraint", principle: "Avoid cuts or effects that compete with the intended meaning without an explicit editorial purpose.", failureModes: ["Mistaking more operations for better editing."], conflicting: [] },
  { entryKey: "rapid_open", category: "pacing", principle: "Consider a brief energetic opening when audience and material make that useful.", failureModes: ["Compressing necessary context to force a quick hook."], conflicting: ["deliberate_open"] },
  { entryKey: "deliberate_open", category: "pacing", principle: "Consider a slower opening when an emotional or explanatory hold is the intended effect.", failureModes: ["Extending an unsupported hold."], conflicting: ["rapid_open"] },
] as const;

export const CANON_V0: readonly CanonEntry[] = Object.freeze(authored.map(item => {
  const body = CanonEntryBodySchema.parse({ ...directorEnvelopeValue("CanonEntry"), entryKey: item.entryKey, entryVersion: DIRECTOR_VERSION,
    provenance: { sourceKind: "first_party_gate4", author: "creative_intelligence_internal", sourceRevision: "phase5_gate4_canon_v0", ownership: "internal_owned", ownershipBasis: "first_party_authorship_in_this_revision", externalLicense: absent("first_party_no_external_license") },
    domains: item.entryKey === "deliberate_open" ? ["narrative", "talking_head"] : domains,
    category: item.category, principle: item.principle, prerequisites: [], compatible: [], conflicting: refs(item.conflicting), failureModes: item.failureModes,
    evaluationRubrics: absent("no_rubric_in_v0"), examples: absent("no_examples_in_v0"), recipes: absent("no_recipes_in_v0") });
  return deepFreeze(CanonEntrySchema.parse(identify("director_canon_entry_v0", "entryId", body)));
}));
function directorEnvelopeValue(artifactType: string) { return { artifactType, artifactVersion: DIRECTOR_VERSION, stability: "internal_pre_stable" }; }
const CanonSelectionSchema = z.strictObject({ scope: DirectorScopeSchema, domain: DirectorDomainSchema,
  selectionPolicy: z.literal("explicit_required_set"), entries: z.array(ArtifactRefSchema).min(1).max(32) });

const CanonViewBodySchema = z.strictObject({
  ...directorEnvelope("CanonView"), scope: DirectorScopeSchema, domain: DirectorDomainSchema,
  selectionPolicy: z.literal("explicit_required_set"),
  entries: z.array(z.strictObject({ entryKey: IdSchema, entryVersion: z.literal(DIRECTOR_VERSION), artifact: ArtifactRefSchema })).min(1).max(32)
    .refine(values => values.every((value, index) => index === 0 || values[index - 1]!.entryKey < value.entryKey), "Canon entries must be unique and sorted."),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const CanonViewSchema = CanonViewBodySchema.extend({ viewId: IdSchema }).refine(value => checkIdentity(value, "viewId", "director_canon_view_v0"), "Canon view identity mismatch.");
export type CanonView = z.infer<typeof CanonViewSchema>;

export function createCanonView(input: { scope: z.infer<typeof DirectorScopeSchema>; domain: z.infer<typeof DirectorDomainSchema>; selectionPolicy: "explicit_required_set"; entries: readonly ArtifactRef[] }, map: EditorialArtifactMap): CanonView {
  const selection = CanonSelectionSchema.parse(input);
  const { scope, domain } = selection;
  const selected = canonicalRefs(selection.entries).map(ref => {
    const entry = CanonEntrySchema.parse(exactArtifact(map, ref, "CanonEntry"));
    const owned = CANON_V0.find(value => value.entryKey === entry.entryKey);
    ensure(owned && equal(entry, owned), "Unknown or altered first-party Canon entry.");
    ensure(entry.domains.includes(domain), "Canon entry is inapplicable to requested domain.");
    ensure(entry.examples.state !== "present" && entry.recipes.state !== "present" && entry.evaluationRubrics.state !== "present", "Canon v0 cannot claim examples, recipes, or rubrics.");
    return { entryKey: entry.entryKey, entryVersion: entry.entryVersion, artifact: ref };
  }).sort((a, b) => a.entryKey < b.entryKey ? -1 : a.entryKey > b.entryKey ? 1 : 0);
  ensure(selected.every((entry, index) => index === 0 || selected[index - 1]!.entryKey !== entry.entryKey), "Duplicate Canon entry.");
  const keys = new Set(selected.map(entry => entry.entryKey));
  for (const entry of selected) {
    const source = CANON_V0.find(value => value.entryKey === entry.entryKey)!;
    ensure(source.conflicting.every(ref => !keys.has(ref.entryKey)), "Incompatible required Canon entries.");
  }
  const digest = exactDigest(new TextEncoder().encode(canonicalSerialize({ scope, domain, selectionPolicy: input.selectionPolicy, entries: selected })));
  const body = CanonViewBodySchema.parse({ ...directorEnvelopeValue("CanonView"), scope, domain, selectionPolicy: input.selectionPolicy, entries: selected, digest });
  return structuredClone(CanonViewSchema.parse(identify("director_canon_view_v0", "viewId", body)));
}
export function validateCanonView(input: unknown, map: EditorialArtifactMap): CanonView {
  const view = CanonViewSchema.parse(input);
  ensure(equal(createCanonView({ scope: view.scope, domain: view.domain, selectionPolicy: view.selectionPolicy, entries: view.entries.map(entry => entry.artifact) }, map), view), "Canon view replay mismatch.");
  return structuredClone(view);
}
