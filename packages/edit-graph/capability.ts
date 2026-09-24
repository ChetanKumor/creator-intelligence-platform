/**
 * Bounded CapabilityGraph V0: supplied executor attestations, exact requirement predicates and the five frozen states.
 * Nothing here probes a machine, reads the environment or infers support from an executor's name.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema, VersionLabelSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EvidenceRefSchema, availability, checkIdentity, compareText, equal, identify, missing, present, type ArtifactRef,
  type EditorialArtifactMap } from "../editorial/common.js";
import { EDIT_GRAPH_VERSION, HashSchema, Nat, ScopeSchema, check, envelope, evidenceSet, exactArtifact, idSet, parse, parseCanonical, sameScope } from "./common.js";

export const CAPABILITY_IDS = ["color_look", "timeline_source_audio", "timeline_video_clip", "transition_cut"] as const;
export const CapabilityIdSchema = z.enum(CAPABILITY_IDS);
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;
export const PREDICATE_NAMES = ["audio_linkage", "clip_count", "framing", "join_count", "look", "output_aspect", "output_duration_seconds_ceiling",
  "output_frame_rate", "output_height", "output_width", "source_codec", "source_endpoint_precision", "source_frame_timing", "source_rotation",
  "target_kind", "time_mapping", "transition_kind"] as const;
export const PredicateNameSchema = z.enum(PREDICATE_NAMES);
/** Frozen Gate-0 meanings. The order is also the documented summary precedence across executors. */
export const CAPABILITY_STATES = ["AVAILABLE", "PARTIAL", "UNAVAILABLE", "FAILED", "UNSUPPORTED"] as const;
export const CapabilityStateSchema = z.enum(CAPABILITY_STATES);
export type CapabilityState = z.infer<typeof CapabilityStateSchema>;
export const MAX_EXECUTORS = 32;

const SupportSchema = z.discriminatedUnion("kind", [
  z.strictObject({ name: PredicateNameSchema, kind: z.literal("member"), values: idSet(64, 1) }),
  z.strictObject({ name: PredicateNameSchema, kind: z.literal("at_most"), max: Nat }),
]);
type Support = z.infer<typeof SupportSchema>;
export const ExecutorIdentitySchema = z.strictObject({ executorId: IdSchema, version: VersionLabelSchema, implementationDigest: HashSchema });
export type ExecutorIdentity = z.infer<typeof ExecutorIdentitySchema>;

/**
 * The only proof a capability state may rest on: one attributed attestation binding scope, environment, observation
 * time, the exact executor build and capability, and exactly what was attested. AVAILABLE also requires explicit
 * conformance, configuration and resource evidence. Gate 6 binds supplied attestations; it never runs a check.
 */
const AttestationOutcomeSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    supports: z.array(SupportSchema).max(32).refine(v => new Set(v.map(s => s.name)).size === v.length, "Duplicate supported predicate.")
      .transform(v => [...v].sort((a, b) => compareText(a.name, b.name))),
    licensing: z.strictObject({ eligiblePurposes: idSet(16, 1) }),
    conformance: z.strictObject({ meaning: z.literal("every_declared_support_passed_attested_checks"), evidence: evidenceSet(16, 1) }),
    configuration: z.strictObject({ meaning: z.literal("executor_configured_in_environment"), evidence: evidenceSet(16, 1) }),
    resources: z.strictObject({ meaning: z.literal("required_resources_present_at_observation"), evidence: evidenceSet(16, 1) }),
  }),
  z.strictObject({ state: z.literal("unavailable"), reasonCode: z.enum(["unconfigured", "unverified", "resource_blocked", "permission_unavailable", "inaccessible"]),
    nextCheckAfter: TimestampSchema, evidence: evidenceSet(16, 1) }),
  z.strictObject({ state: z.literal("failed"), failureCode: IdSchema, attempt: z.strictObject({ attemptedAt: TimestampSchema, evidence: evidenceSet(16, 1) }) }),
]);
const AttestationBodySchema = z.strictObject({
  ...envelope("CapabilityAttestation"), scope: ScopeSchema, environment: IdSchema, observedAt: TimestampSchema,
  executor: ExecutorIdentitySchema, capabilityId: CapabilityIdSchema,
  attester: z.strictObject({ kind: z.enum(["owner", "operator"]), actorId: IdSchema }),
  basis: z.literal("attester_supplied_check_results_no_probe"), outcome: AttestationOutcomeSchema,
});
export const CapabilityAttestationSchema = AttestationBodySchema.extend({ attestationId: IdSchema })
  .refine(v => v.outcome.state !== "failed" || v.outcome.attempt.attemptedAt <= v.observedAt, "A failed attempt cannot follow its attestation.")
  .refine(v => checkIdentity(v, "attestationId", "capability_attestation_v0"), "Capability attestation identity mismatch.");
export type CapabilityAttestation = z.infer<typeof CapabilityAttestationSchema>;
export function createCapabilityAttestation(input: unknown): CapabilityAttestation {
  return parse(CapabilityAttestationSchema, identify("capability_attestation_v0", "attestationId", parse(AttestationBodySchema, input)));
}
/** A snapshot declaration only indexes one attestation; it carries no self-declared status, support or licensing claim. */
const DeclarationSchema = z.strictObject({ capabilityId: CapabilityIdSchema, attestation: ArtifactRefSchema });
const ExecutorSchema = z.strictObject({
  ...ExecutorIdentitySchema.shape,
  declarations: z.array(DeclarationSchema).max(CAPABILITY_IDS.length).refine(v => new Set(v.map(d => d.capabilityId)).size === v.length, "Duplicate capability declaration.")
    .transform(v => [...v].sort((a, b) => compareText(a.capabilityId, b.capabilityId))),
});
const compareExecutors = (a: ExecutorIdentity, b: ExecutorIdentity) => compareText(a.executorId, b.executorId) || compareText(a.version, b.version);
const SnapshotBodySchema = z.strictObject({
  ...envelope("CapabilitySnapshot"), scope: ScopeSchema, environment: IdSchema, asOf: TimestampSchema,
  observation: z.literal("supplied_evidence_no_probe"),
  executors: z.array(ExecutorSchema).max(MAX_EXECUTORS)
    .refine(v => new Set(v.map(e => canonicalSerialize([e.executorId, e.version]))).size === v.length, "Duplicate executor version.")
    .transform(v => [...v].sort(compareExecutors)),
});
export const CapabilitySnapshotSchema = SnapshotBodySchema.extend({ snapshotId: IdSchema })
  .refine(v => checkIdentity(v, "snapshotId", "capability_snapshot_v0"), "Capability snapshot identity mismatch.");
export type CapabilitySnapshot = z.infer<typeof CapabilitySnapshotSchema>;
export function checkSnapshotLimits(input: unknown): void {
  const executors = input !== null && typeof input === "object" ? (input as Record<string, unknown>).executors : undefined;
  check(!Array.isArray(executors) || executors.length <= MAX_EXECUTORS, "limit_exceeded", `A capability snapshot may declare at most ${MAX_EXECUTORS} executors.`);
}
export function createCapabilitySnapshot(input: unknown): CapabilitySnapshot {
  checkSnapshotLimits(input);
  const body = parse(SnapshotBodySchema, input, "capability_snapshot_invalid");
  return parse(CapabilitySnapshotSchema, identify("capability_snapshot_v0", "snapshotId", body), "capability_snapshot_invalid");
}
const PROOF_ARTIFACT_TYPES: readonly string[] = ["CapabilityAttestation", "CapabilitySnapshot"];
function supportingEvidence(outcome: CapabilityAttestation["outcome"]) {
  if (outcome.state === "available") return [...outcome.conformance.evidence, ...outcome.configuration.evidence, ...outcome.resources.evidence];
  return outcome.state === "failed" ? outcome.attempt.evidence : outcome.evidence;
}
/**
 * Binds every declaration to its exact canonical attestation. Scope, environment, executor build, capability and
 * observation time must agree exactly; contradictions fail closed rather than degrading to missingness. Supporting
 * evidence must resolve and declare the snapshot scope, may not be another proof artifact, and may not back both an
 * AVAILABLE and a non-AVAILABLE attestation in the same snapshot.
 */
export function bindSnapshotAttestations(snapshot: CapabilitySnapshot, map: EditorialArtifactMap): Map<string, CapabilityAttestation> {
  const bound = new Map<string, CapabilityAttestation>(), polarity = new Map<string, Set<boolean>>();
  for (const executor of snapshot.executors) for (const declaration of executor.declarations) {
    const attestation = parseCanonical(CapabilityAttestationSchema,
      exactArtifact(map, declaration.attestation, "CapabilityAttestation", EDIT_GRAPH_VERSION, "capability_snapshot_invalid"), "capability_snapshot_invalid");
    check(sameScope(attestation.scope, snapshot.scope), "scope_mismatch", "A capability attestation must declare the exact snapshot scope.");
    check(attestation.environment === snapshot.environment, "capability_snapshot_invalid", "A capability attestation must name the snapshot environment.");
    check(equal(attestation.executor, { executorId: executor.executorId, version: executor.version, implementationDigest: executor.implementationDigest }),
      "capability_snapshot_invalid", "A capability attestation must name the exact declaring executor build.");
    check(attestation.capabilityId === declaration.capabilityId, "capability_snapshot_invalid", "A capability attestation must name the declared capability.");
    check(attestation.observedAt <= snapshot.asOf, "capability_snapshot_invalid", "A capability attestation cannot postdate its snapshot.");
    const positive = attestation.outcome.state === "available";
    for (const ref of supportingEvidence(attestation.outcome)) {
      const root = map.get(ref.artifact);
      const record = root !== null && typeof root === "object" && !Array.isArray(root) ? root as Record<string, unknown> : {};
      const declared = ScopeSchema.safeParse(record.scope);
      check(declared.success && sameScope(declared.data, snapshot.scope), "scope_mismatch", "Capability evidence must declare the exact snapshot scope.");
      check(!PROOF_ARTIFACT_TYPES.includes(String(record.artifactType)), "capability_snapshot_invalid", "A proof artifact cannot be reused as supporting evidence.");
      map.resolve(ref);
      polarity.set(ref.artifact.objectId, new Set([...(polarity.get(ref.artifact.objectId) ?? []), positive]));
    }
    bound.set(declaration.attestation.objectId, attestation);
  }
  for (const [objectId, seen] of polarity) check(seen.size === 1, "capability_snapshot_invalid", `Evidence ${objectId} cannot support both an available and a non-available attestation.`);
  return bound;
}

export const PredicateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ name: PredicateNameSchema, kind: z.literal("member"), value: IdSchema }),
  z.strictObject({ name: PredicateNameSchema, kind: z.literal("at_most"), value: Nat }),
]);
export type Predicate = z.infer<typeof PredicateSchema>;
export function comparePredicates(a: Predicate, b: Predicate): number {
  return compareText(a.name, b.name) || compareText(a.kind, b.kind)
    || (a.kind === "at_most" && b.kind === "at_most" ? a.value - b.value : compareText(String(a.value), String(b.value)));
}
const RequirementBodySchema = z.strictObject({
  capabilityId: CapabilityIdSchema,
  predicates: z.array(PredicateSchema).min(1).max(64).refine(v => v.every((p, i) => i === 0 || comparePredicates(v[i - 1]!, p) < 0), "Predicates must be unique and canonical."),
  imposedBy: z.array(IdSchema).min(1).max(128).refine(v => new Set(v).size === v.length, "Duplicate imposing graph node."),
});
export const CapabilityRequirementSchema = RequirementBodySchema.extend({ requirementId: IdSchema })
  .refine(v => checkIdentity(v, "requirementId", "capability_requirement_v0"), "Capability requirement identity mismatch.");
export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;
export function createRequirement(capabilityId: CapabilityId, predicates: readonly Predicate[], imposedBy: readonly string[]): CapabilityRequirement {
  const canonical = [...new Map(predicates.map(p => [canonicalSerialize(p), p])).values()].sort(comparePredicates);
  return parse(CapabilityRequirementSchema, identify("capability_requirement_v0", "requirementId", parse(RequirementBodySchema, { capabilityId, predicates: canonical, imposedBy: [...imposedBy] })));
}

const ExecutorAssessmentSchema = z.strictObject({
  executor: ExecutorIdentitySchema, declaration: availability(EvidenceRefSchema), attestation: availability(ArtifactRefSchema),
  state: CapabilityStateSchema, reasonCode: IdSchema, unmet: z.array(PredicateSchema).max(64),
}).refine(e => (e.state === "UNSUPPORTED") === (e.declaration.state !== "present"), "Only an undeclared capability is unsupported.")
  .refine(e => (e.declaration.state === "present") === (e.attestation.state === "present"), "Every declaration is bound to exactly one attestation.")
  .refine(e => (e.state === "PARTIAL") === (e.unmet.length > 0), "Unmet predicates are recorded exactly for PARTIAL.");
export function summaryState(states: readonly CapabilityState[]): CapabilityState { return CAPABILITY_STATES.find(s => states.includes(s)) ?? "UNSUPPORTED"; }
export const CapabilityAssessmentSchema = z.strictObject({ requirementId: IdSchema, state: CapabilityStateSchema, executors: z.array(ExecutorAssessmentSchema).max(MAX_EXECUTORS) })
  .refine(a => a.state === summaryState(a.executors.map(e => e.state)), "Requirement state must summarize executor states by the declared precedence.");
export type CapabilityAssessment = z.infer<typeof CapabilityAssessmentSchema>;

function satisfied(supports: readonly Support[], predicate: Predicate): boolean {
  const support = supports.find(s => s.name === predicate.name && s.kind === predicate.kind);
  if (support === undefined) return false;
  return support.kind === "member" ? predicate.kind === "member" && support.values.includes(predicate.value) : predicate.kind === "at_most" && predicate.value <= support.max;
}
/** AVAILABLE requires one exact bound attestation proving every predicate; anything less keeps its own state and reason. */
export function assessRequirement(requirement: CapabilityRequirement, snapshot: CapabilitySnapshot, snapshotRef: ArtifactRef,
  attestations: ReadonlyMap<string, CapabilityAttestation>, purpose: string): CapabilityAssessment {
  const executors = snapshot.executors.map((executor, executorIndex) => {
    const identity = { executorId: executor.executorId, version: executor.version, implementationDigest: executor.implementationDigest };
    const declarationIndex = executor.declarations.findIndex(d => d.capabilityId === requirement.capabilityId);
    if (declarationIndex < 0) {
      const undeclared = missing("not_applicable", "capability_not_declared");
      return { executor: identity, declaration: undeclared, attestation: undeclared, state: "UNSUPPORTED" as const, reasonCode: "capability_not_declared", unmet: [] };
    }
    const declaration = executor.declarations[declarationIndex]!, attestation = attestations.get(declaration.attestation.objectId);
    check(attestation !== undefined, "capability_snapshot_invalid", "Every declaration must be bound to its attestation before assessment.");
    const base = { executor: identity, declaration: present({ artifact: snapshotRef, pointer: `/executors/${executorIndex}/declarations/${declarationIndex}` }),
      attestation: present(declaration.attestation) };
    const outcome = attestation.outcome;
    if (outcome.state === "failed") return { ...base, state: "FAILED" as const, reasonCode: outcome.failureCode, unmet: [] };
    if (outcome.state === "unavailable") return { ...base, state: "UNAVAILABLE" as const, reasonCode: outcome.reasonCode, unmet: [] };
    if (!outcome.licensing.eligiblePurposes.includes(purpose)) return { ...base, state: "UNAVAILABLE" as const, reasonCode: "license_ineligible_for_purpose", unmet: [] };
    const unmet = requirement.predicates.filter(p => !satisfied(outcome.supports, p));
    return { ...base, state: unmet.length ? "PARTIAL" as const : "AVAILABLE" as const, reasonCode: unmet.length ? "predicates_unmet" : "all_predicates_proven", unmet };
  });
  return parse(CapabilityAssessmentSchema, { requirementId: requirement.requirementId, state: summaryState(executors.map(e => e.state)), executors });
}
