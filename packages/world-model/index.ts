/** Phase 5 Gate 2: an in-memory, explicitly supplied evidence graph. No discovery or execution. */
import { z } from "zod";
import { canonicalSerialize } from "../domain/serialization.js";
import { IdSchema, MediaAssetSchema, SecondsSchema, TimeRangeSchema, TimestampSchema, VersionLabelSchema } from "../contracts/common.js";
import { contentId } from "../reference-analyzer/features.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { ArtifactRefSchema, EvidenceRefSchema, ProducerSchema, availability, checkIdentity, compareText, ensure, equal, type ArtifactRef, type EditorialArtifactMap } from "../editorial/common.js";
import { EditorialTokenSchema } from "../editorial/token.js";
import { EditorialCandidateSetSchema, validateCandidateSet } from "../editorial/decision.js";
import { validateProducerEvidence, validateTokenEvidence } from "../editorial/resolve.js";
import { ComputationIdentitySchema, PerceptionReuseReceiptSchema, computationKey } from "../perception/identity.js";

export const WORLD_VERSION = "0.1.0" as const;
export const WORLD_MAX_NODES = 4096;
export const WORLD_MAX_RESULTS = 256;
const WORLD_MAX_PERCEPTION_BINDINGS = 256;
export const WORLD_MAX_MEMBERSHIPS = 8 * WORLD_MAX_NODES + WORLD_MAX_PERCEPTION_BINDINGS + 1;
const ScopeSchema = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, purpose: IdSchema });
const refSet = (maximum = WORLD_MAX_NODES) => z.array(ArtifactRefSchema).max(maximum).refine(v => new Set(v.map(x => x.objectId)).size === v.length && v.every((x, i) => i === 0 || compareText(v[i - 1]!.objectId, x.objectId) < 0), "References must be unique and canonically sorted.");
const idSet = (maximum = WORLD_MAX_NODES) => z.array(IdSchema).max(maximum).refine(v => new Set(v).size === v.length && v.every((x, i) => i === 0 || compareText(v[i - 1]!, x) < 0), "IDs must be unique and canonically sorted.");
const evidenceSet = z.array(EvidenceRefSchema).min(1).max(64).refine(v => new Set(v.map(canonicalSerialize)).size === v.length, "Evidence references must be unique.").transform(v => [...v].sort((a, b) => compareText(canonicalSerialize(a), canonicalSerialize(b))));
const envelope = (artifactType: string) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(WORLD_VERSION), stability: z.literal("internal_pre_stable") });

function resolveMissingEvidence(value: unknown, artifacts: EditorialArtifactMap): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const item of value) resolveMissingEvidence(item, artifacts); return; }
  const record = value as Record<string, unknown>;
  if (typeof record.state === "string" && record.state !== "present" && Array.isArray(record.evidenceRefs)) {
    for (const ref of record.evidenceRefs) artifacts.resolve(EvidenceRefSchema.parse(ref));
  }
  for (const child of Object.values(record)) resolveMissingEvidence(child, artifacts);
}
function resolveUncertaintyEvidence(uncertainty: z.infer<typeof UncertaintySchema>, artifacts: EditorialArtifactMap): void {
  if (uncertainty.evidence.state === "present") artifacts.resolve(uncertainty.evidence.value);
  else for (const ref of uncertainty.evidence.evidenceRefs) artifacts.resolve(ref);
}

/** A range is trusted only through an exact source analysis, source hash and timebase pointer. */
export const GroundedSupportSchema = z.strictObject({
  assetId: IdSchema, sourceHash: z.string().regex(/^[a-f0-9]{64}$/), analysis: ArtifactRefSchema,
  shotId: IdSchema, range: TimeRangeSchema, rangeEvidence: EvidenceRefSchema, timebase: EvidenceRefSchema,
  sample: availability(z.strictObject({ sampleId: IdSchema, frameIndex: z.number().int().nonnegative().safe(), atSeconds: SecondsSchema, frameHash: z.string().regex(/^[a-f0-9]{64}$/) })),
});
export type GroundedSupport = z.infer<typeof GroundedSupportSchema>;
export function validateGroundedSupport(input: unknown, artifacts: EditorialArtifactMap): GroundedSupport {
  const s = GroundedSupportSchema.parse(input);
  resolveMissingEvidence(s, artifacts);
  ensure(s.analysis.artifactType === "FootageAnalysis" && s.analysis.artifactVersion === "1.0.0", "Trusted source analysis required.");
  const a = FootageAnalysisSchema.parse(artifacts.get(s.analysis));
  ensure(a.assetId === s.assetId && a.contentHash === s.sourceHash && s.assetId === `asset_${s.sourceHash}`, "Source identity mismatch.");
  ensure(equal(s.timebase.artifact, s.analysis) && s.timebase.pointer === "/metadata/frameTimes", "Exact source PTS evidence required.");
  ensure(equal(s.rangeEvidence.artifact, s.analysis) && (/^\/candidates\/(0|[1-9]\d*)\/candidate\/sourceRange$/.test(s.rangeEvidence.pointer) || /^\/shots\/(0|[1-9]\d*)$/.test(s.rangeEvidence.pointer)), "Exact source-range evidence required.");
  const rangeEvidence = artifacts.resolve(s.rangeEvidence) as { startSeconds: number; endSeconds: number };
  ensure(equal({ startSeconds: rangeEvidence.startSeconds, endSeconds: rangeEvidence.endSeconds }, s.range), "Source range contradicts analysis evidence.");
  const shot = a.shots.find(x => x.shotId === s.shotId);
  ensure(shot && s.range.startSeconds >= shot.startSeconds && s.range.endSeconds <= shot.endSeconds, "Support exceeds trusted source shot.");
  if (s.sample.state === "present") {
    const sample = s.sample.value;
    const f = a.cheapFeatures.find(x => x.sample.sampleId === sample.sampleId);
    ensure(f && f.sample.shotId === s.shotId && f.sample.frameIndex === sample.frameIndex && f.sample.atSeconds === sample.atSeconds && f.frameContentHash === sample.frameHash && a.metadata.frameTimes[f.sample.frameIndex] === f.sample.atSeconds, "Frame/sample support mismatch.");
    ensure(f.sample.atSeconds >= s.range.startSeconds && f.sample.atSeconds < s.range.endSeconds, "Sample is outside half-open support.");
  }
  return s;
}

const UncertaintySchema = z.strictObject({ state: z.enum(["bounded", "unknown"]), evidence: availability(EvidenceRefSchema) });
const FactBodySchema = z.strictObject({
  ...envelope("ObservedFact"), ...ScopeSchema.shape, subjectId: IdSchema, support: GroundedSupportSchema,
  observationType: IdSchema, value: availability(EvidenceRefSchema), evidence: evidenceSet,
  producer: ProducerSchema, computationKey: availability(IdSchema), uncertainty: UncertaintySchema,
  artifact: ArtifactRefSchema,
});
export const ObservedFactSchema = FactBodySchema.extend({ factId: IdSchema }).refine(v => checkIdentity(v, "factId", "world_observed_v1"), "Observed fact identity mismatch.");
export type ObservedFact = z.infer<typeof ObservedFactSchema>;
export function createObservedFact(input: z.input<typeof FactBodySchema>, artifacts: EditorialArtifactMap, binding?: PerceptionBinding): ObservedFact {
  const body = FactBodySchema.parse(input);
  resolveMissingEvidence(body, artifacts);
  resolveUncertaintyEvidence(body.uncertainty, artifacts);
  validateGroundedSupport(body.support, artifacts);
  if (binding) {
    validatePerceptionBinding(binding, artifacts);
    ensure(binding.receipt.scope.projectId === body.projectId && binding.receipt.scope.creatorId === body.creatorId && binding.receipt.scope.purpose === body.purpose && equal(binding.support, body.support), "Observed perception source/scope mismatch.");
    ensure(body.computationKey.state === "present" && body.computationKey.value === binding.receipt.computationKey, "Observed computation key does not bind reuse receipt.");
  }
  const allowed = [body.support.analysis, ...(binding ? [binding.receipt.output] : [])];
  const valueArtifact = body.value.state === "present" ? body.value.value.artifact : null;
  ensure(allowed.some(ref => equal(ref, body.artifact)) && body.evidence.every(ref => allowed.some(a => equal(a, ref.artifact))) && (valueArtifact === null || allowed.some(ref => equal(ref, valueArtifact))), "Observed payload lacks authorized source binding.");
  validateProducerEvidence(body.producer, artifacts);
  for (const ref of body.evidence) artifacts.resolve(ref);
  if (body.value.state === "present") artifacts.resolve(body.value.value);
  ensure(body.producer.computationBasis !== "human_annotation" && body.producer.computationBasis !== "unverified", "Observed fact requires a registered actual producer.");
  ensure(body.observationType !== "camera_motion" && body.observationType !== "aesthetic_score" && body.observationType !== "reaction_likelihood" && body.observationType !== "continuity_inference", "Interpretation belongs in derived observations.");
  const analysis = FootageAnalysisSchema.parse(artifacts.get(body.support.analysis));
  ensure(analysis.authorization.projectId === body.projectId && analysis.authorization.creatorId === body.creatorId && analysis.authorization.allowedPurposes.includes(body.purpose as never), "Observation scope is not authorized by source.");
  return freeze(ObservedFactSchema.parse({ ...body, factId: contentId("world_observed_v1", body) }));
}

const DerivedBodySchema = z.strictObject({
  ...envelope("DerivedObservation"), ...ScopeSchema.shape, subjectId: IdSchema,
  dependencies: idSet(64).refine(v => v.length > 0, "Derivation requires dependencies."),
  interpretationType: IdSchema, value: availability(EvidenceRefSchema), producer: ProducerSchema,
  computationKey: availability(IdSchema), uncertainty: UncertaintySchema, conflicts: idSet(64), artifact: ArtifactRefSchema,
});
export const DerivedObservationSchema = DerivedBodySchema.extend({ derivedId: IdSchema }).refine(v => checkIdentity(v, "derivedId", "world_derived_v1"), "Derived identity mismatch.");
export type DerivedObservation = z.infer<typeof DerivedObservationSchema>;
export function createDerivedObservation(input: z.input<typeof DerivedBodySchema>): DerivedObservation {
  const body = DerivedBodySchema.parse(input);
  ensure(body.producer.computationBasis !== "human_annotation" && body.producer.computationBasis !== "unverified", "Derivation requires an actual producer.");
  return freeze(DerivedObservationSchema.parse({ ...body, derivedId: contentId("world_derived_v1", body) }));
}

export const WorldEntitySchema = z.strictObject({ entityId: IdSchema, authority: z.enum(["MediaTruth", "ObservedFact", "DerivedObservation"]), kind: IdSchema, artifact: ArtifactRefSchema, support: availability(GroundedSupportSchema) });
export type WorldEntity = z.infer<typeof WorldEntitySchema>;
const ClockMapSchema = z.strictObject({ artifact: ArtifactRefSchema, units: z.enum(["seconds", "samples", "frames"]), errorSeconds: SecondsSchema, support: EvidenceRefSchema });
export const WorldRelationshipSchema = z.strictObject({ relationshipId: IdSchema, type: z.enum(["before", "overlaps", "contains", "adjacent_to", "aligned_with"]), from: IdSchema, to: IdSchema, clockMap: availability(ClockMapSchema) });
export type WorldRelationship = z.infer<typeof WorldRelationshipSchema>;
export function validateTemporalRelationship(r: WorldRelationship, entities: readonly WorldEntity[]): void {
  const a = entities.find(x => x.entityId === r.from)?.support, b = entities.find(x => x.entityId === r.to)?.support;
  ensure(a?.state === "present" && b?.state === "present", "Temporal relationship requires grounded endpoints.");
  const x = a.value, y = b.value;
  const sameSource = x.assetId === y.assetId && x.sourceHash === y.sourceHash && equal(x.analysis, y.analysis) && equal(x.timebase, y.timebase);
  if (!sameSource) {
    ensure(r.type === "aligned_with" && r.clockMap.state === "present", "Cross-source time requires explicit alignment evidence.");
    return;
  }
  ensure(r.clockMap.state !== "present", "Same-source chronology must not invent a clock mapping.");
  const p = x.range, q = y.range;
  const valid = r.type === "before" ? p.endSeconds <= q.startSeconds
    : r.type === "overlaps" ? p.startSeconds < q.endSeconds && q.startSeconds < p.endSeconds
    : r.type === "contains" ? p.startSeconds <= q.startSeconds && p.endSeconds >= q.endSeconds
    : r.type === "adjacent_to" ? p.endSeconds === q.startSeconds || q.endSeconds === p.startSeconds
    : false;
  ensure(valid, "Temporal relation contradicts trusted source intervals.");
}

export const TokenLinkSchema = z.strictObject({ token: ArtifactRefSchema, tokenId: IdSchema, candidateId: IdSchema, analysis: ArtifactRefSchema, producingRun: ArtifactRefSchema, authorization: EvidenceRefSchema });
export type TokenLink = z.infer<typeof TokenLinkSchema>;
export const CandidateEntityLinkSchema = z.strictObject({ candidateId: IdSchema, token: ArtifactRefSchema, entityId: IdSchema });
export type CandidateEntityLink = z.infer<typeof CandidateEntityLinkSchema>;
export function linkEditorialToken(tokenRefInput: ArtifactRef, artifacts: EditorialArtifactMap, scopeInput: unknown): TokenLink {
  const scope = ScopeSchema.parse(scopeInput), tokenRef = ArtifactRefSchema.parse(tokenRefInput);
  ensure(tokenRef.artifactType === "EditorialToken" && tokenRef.artifactVersion === "0.1.0", "Exact EditorialToken artifact required.");
  const token = validateTokenEvidence(EditorialTokenSchema.parse(artifacts.get(tokenRef)), artifacts);
  const analysis = FootageAnalysisSchema.parse(artifacts.get(token.analysis.artifact));
  ensure(token.projectId === scope.projectId && analysis.authorization.projectId === scope.projectId && analysis.authorization.creatorId === scope.creatorId && analysis.authorization.allowedPurposes.includes(scope.purpose as never), "Token scope unavailable.");
  ensure(analysis.analysisId === token.analysis.analysisId && analysis.assetId === token.candidate.assetId && analysis.contentHash === token.sourceHash, "Token source identity mismatch.");
  const candidate = analysis.candidates.find(x => x.candidate.candidateId === token.candidate.candidateId);
  ensure(candidate && equal(candidate.candidate, token.candidate) && equal(token.candidateEvidence, { artifact: token.analysis.artifact, pointer: `/candidates/${analysis.candidates.indexOf(candidate)}` }), "Token candidate evidence mismatch.");
  return freeze(TokenLinkSchema.parse({ token: tokenRef, tokenId: token.tokenId, candidateId: token.candidate.candidateId, analysis: token.analysis.artifact, producingRun: token.producingRun.artifact, authorization: { artifact: token.analysis.artifact, pointer: "/authorization" } }));
}

export const PerceptionBindingSchema = z.strictObject({ receipt: PerceptionReuseReceiptSchema, identity: ComputationIdentitySchema, currentAuthorization: EvidenceRefSchema, support: GroundedSupportSchema });
export type PerceptionBinding = z.infer<typeof PerceptionBindingSchema>;
export function validatePerceptionBinding(input: unknown, artifacts: EditorialArtifactMap): PerceptionBinding {
  const b = PerceptionBindingSchema.parse(input), s = validateGroundedSupport(b.support, artifacts);
  const auth = FootageAnalysisSchema.parse(artifacts.get(s.analysis)).authorization;
  ensure(equal(b.currentAuthorization, { artifact: s.analysis, pointer: "/authorization" }) && auth.projectId === b.receipt.scope.projectId && auth.creatorId === b.receipt.scope.creatorId && auth.allowedPurposes.includes(b.receipt.scope.purpose as never), "Perception access unavailable.");
  ensure(b.receipt.computationKey === computationKey(b.identity) && b.receipt.output.artifactType === b.identity.outputSchema.artifactType && b.receipt.output.artifactVersion === b.identity.outputSchema.artifactVersion, "Perception receipt/key/output mismatch.");
  ensure(b.receipt.selectedAttempt.artifactType === "PerceptionAttempt" && b.receipt.selectedAttempt.artifactVersion === "0.1.0" && b.receipt.selection.artifactType === "PerceptionOutputSelection" && b.receipt.selection.artifactVersion === "0.1.0", "Perception selection lineage mismatch.");
  ensure(b.identity.inputs.some(x => {
    if (x.kind !== "source" || x.assetId !== s.assetId || x.contentHash !== s.sourceHash || x.sizeBytes !== auth.sizeBytes || x.support.kind === "whole_source" || !equal(x.support.timebase, s.analysis)) return false;
    if (x.support.kind === "range") return equal(x.support.range, s.range);
    if (s.sample.state !== "present") return false;
    const sample = s.sample.value;
    return x.support.kind === "frame"
      ? x.support.sampleId === sample.sampleId && x.support.frameIndex === sample.frameIndex && x.support.atSeconds === sample.atSeconds && x.support.frameHash === sample.frameHash
      : x.support.sampleId === sample.sampleId && x.support.atSeconds === sample.atSeconds && x.support.sampleHash === sample.frameHash;
  }), "Perception source join requires exact grounded input.");
  return freeze(b);
}

const CoverageChannelsSchema = z.array(z.strictObject({ channel: IdSchema, state: z.enum(["complete", "partial", "missing"]), evidence: availability(EvidenceRefSchema) })).max(64).refine(v => new Set(v.map(x => x.channel)).size === v.length && v.every((x, i) => i === 0 || compareText(v[i - 1]!.channel, x.channel) < 0) && v.every(x => x.state !== "complete" || x.evidence.state === "present"), "Coverage channels must be sorted, unique and supported.");
const CoverageSchema = z.strictObject({ evidence: EvidenceRefSchema, channels: CoverageChannelsSchema });
export const WorldCoverageEvidenceSchema = z.strictObject({ artifactType: z.literal("WorldCoverageEvidence"), artifactVersion: z.literal(WORLD_VERSION), ...ScopeSchema.shape, sourceAnalysisRefs: refSet(256), channels: CoverageChannelsSchema, producer: ProducerSchema });
const MembershipKindSchema = z.enum(["media_truth", "observed", "derived", "entity", "relationship", "perception", "token", "candidate_link", "candidate_set", "coverage"]);
export const WorldMembershipKeySchema = z.strictObject({ kind: MembershipKindSchema, identity: IdSchema });
export type WorldMembershipKey = z.infer<typeof WorldMembershipKeySchema>;
const membershipSet = z.array(WorldMembershipKeySchema).max(WORLD_MAX_MEMBERSHIPS).refine(v => new Set(v.map(canonicalSerialize)).size === v.length && v.every((key, i) => i === 0 || compareText(canonicalSerialize(v[i - 1]!), canonicalSerialize(key)) < 0), "Membership keys must be canonical and unique.");
const MembershipChangeSchema = z.strictObject({ added: membershipSet, removed: membershipSet, unchanged: membershipSet });
const ChangeSetSchema = z.strictObject({ evidence: EvidenceRefSchema, added: idSet(), superseded: idSet(), invalidated: idSet(), unchanged: idSet(), membership: MembershipChangeSchema.optional() });
const WorldBodySchema = z.strictObject({
  ...envelope("ProjectWorldModel"), ...ScopeSchema.shape, authorization: EvidenceRefSchema, revision: z.number().int().nonnegative().safe(), parent: availability(ArtifactRefSchema), asOf: TimestampSchema,
  mediaTruthRefs: refSet(), observed: z.array(ObservedFactSchema).max(WORLD_MAX_NODES), derived: z.array(DerivedObservationSchema).max(WORLD_MAX_NODES),
  entities: z.array(WorldEntitySchema).max(WORLD_MAX_NODES), relationships: z.array(WorldRelationshipSchema).max(WORLD_MAX_NODES),
  perceptionBindings: z.array(PerceptionBindingSchema).max(WORLD_MAX_PERCEPTION_BINDINGS), tokenLinks: z.array(TokenLinkSchema).max(WORLD_MAX_NODES), candidateLinks: z.array(CandidateEntityLinkSchema).max(WORLD_MAX_NODES).default([]), candidateSetRefs: refSet(),
  coverage: CoverageSchema, changeSet: ChangeSetSchema, builder: ProducerSchema,
});
export const WorldSnapshotSchema = WorldBodySchema.extend({ worldId: IdSchema }).refine(v => checkIdentity(v, "worldId", "world_snapshot_v1"), "World snapshot identity mismatch.");
export type WorldSnapshot = z.infer<typeof WorldSnapshotSchema>;
type WorldBodyInput = z.input<typeof WorldBodySchema>;

export function worldMembershipKeys(world: Pick<WorldSnapshot, "mediaTruthRefs" | "observed" | "derived" | "entities" | "relationships" | "perceptionBindings" | "tokenLinks" | "candidateLinks" | "candidateSetRefs" | "coverage">): WorldMembershipKey[] {
  const members: WorldMembershipKey[] = [];
  const add = (kind: WorldMembershipKey["kind"], value: unknown) => members.push({ kind, identity: contentId("world_member_v1", { kind, value }) });
  for (const ref of world.mediaTruthRefs) add("media_truth", ref);
  for (const fact of world.observed) add("observed", fact);
  for (const interpretation of world.derived) add("derived", interpretation);
  for (const entity of world.entities) add("entity", entity);
  for (const relationship of world.relationships) add("relationship", relationship);
  for (const binding of world.perceptionBindings) add("perception", binding);
  for (const token of world.tokenLinks) add("token", token);
  for (const association of world.candidateLinks) add("candidate_link", association);
  for (const ref of world.candidateSetRefs) add("candidate_set", ref);
  add("coverage", world.coverage);
  return membershipSet.parse(members.sort((a, b) => compareText(canonicalSerialize(a), canonicalSerialize(b))));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function validateWorld(body: z.infer<typeof WorldBodySchema>, artifacts?: EditorialArtifactMap): void {
  ensure(artifacts || !(body.mediaTruthRefs.length || body.observed.length || body.derived.length || body.entities.length || body.relationships.length || body.perceptionBindings.length || body.tokenLinks.length || body.candidateLinks.length || body.candidateSetRefs.length), "Explicit supplied artifacts required for populated world snapshot.");
  if (artifacts) {
    ensure(body.authorization.pointer === "/authorization" && body.authorization.artifact.artifactType === "FootageAnalysis", "Exact source authorization required.");
    const auth = FootageAnalysisSchema.parse(artifacts.get(body.authorization.artifact)).authorization;
    ensure(auth.projectId === body.projectId && auth.creatorId === body.creatorId && auth.allowedPurposes.includes(body.purpose as never), "World authorization unavailable.");
    ensure(body.coverage.evidence.pointer === "" && body.coverage.evidence.artifact.artifactType === "WorldCoverageEvidence" && body.coverage.evidence.artifact.artifactVersion === WORLD_VERSION, "Exact world coverage attestation required.");
    const coverage = WorldCoverageEvidenceSchema.parse(artifacts.get(body.coverage.evidence.artifact));
    const sourceRefs = [
      ...body.mediaTruthRefs,
      ...body.observed.map(f => f.support.analysis),
      ...body.entities.flatMap(e => e.support.state === "present" ? [e.support.value.analysis] : []),
      ...body.tokenLinks.map(t => t.analysis),
      ...body.perceptionBindings.map(p => p.support.analysis),
    ];
    const expectedRefs = [...new Map(sourceRefs.map(ref => [ref.objectId, ref])).values()].sort((a, b) => compareText(a.objectId, b.objectId));
    ensure(coverage.projectId === body.projectId && coverage.creatorId === body.creatorId && coverage.purpose === body.purpose && equal(coverage.sourceAnalysisRefs, expectedRefs) && equal(coverage.channels, body.coverage.channels), "Coverage attestation does not match world bound.");
    validateProducerEvidence(coverage.producer, artifacts);
    for (const channel of body.coverage.channels) if (channel.evidence.state === "present") artifacts.resolve(channel.evidence.value);
    artifacts.resolve(body.changeSet.evidence);
    validateProducerEvidence(body.builder, artifacts);
    resolveMissingEvidence(body, artifacts);
  }
  const ids = (v: readonly { [key: string]: unknown }[], key: string) => v.map(x => x[key] as string);
  for (const [v, key] of [[body.observed, "factId"], [body.derived, "derivedId"], [body.entities, "entityId"], [body.relationships, "relationshipId"], [body.tokenLinks, "tokenId"]] as const) {
    const names = ids(v, key);
    ensure(new Set(names).size === names.length && names.every((x, i) => i === 0 || compareText(names[i - 1]!, x) < 0), "World collections must use canonical unique identity order.");
  }
  for (const fact of body.observed) {
    ensure(fact.projectId === body.projectId && fact.creatorId === body.creatorId && fact.purpose === body.purpose, "Observed scope mismatch.");
    ensure(fact.producer.computationBasis !== "human_annotation" && fact.producer.computationBasis !== "unverified", "Observed producer invalid.");
    ensure(!["camera_motion", "aesthetic_score", "reaction_likelihood", "continuity_inference"].includes(fact.observationType), "Interpretation cannot be observed fact.");
    const factPayloadAllowed = (ref: ArtifactRef) => equal(ref, fact.support.analysis) || body.perceptionBindings.some(p => equal(p.receipt.output, ref) && equal(p.support, fact.support) && fact.computationKey.state === "present" && fact.computationKey.value === p.receipt.computationKey);
    ensure(factPayloadAllowed(fact.artifact) && fact.evidence.every(ref => factPayloadAllowed(ref.artifact)) && (fact.value.state !== "present" || factPayloadAllowed(fact.value.value.artifact)), "Observed payload lacks exact authorized support.");
    if (artifacts) {
      validateGroundedSupport(fact.support, artifacts);
      validateProducerEvidence(fact.producer, artifacts);
      resolveUncertaintyEvidence(fact.uncertainty, artifacts);
      for (const ref of fact.evidence) artifacts.resolve(ref);
      if (fact.value.state === "present") artifacts.resolve(fact.value.value);
      const auth = FootageAnalysisSchema.parse(artifacts.get(fact.support.analysis)).authorization;
      ensure(auth.projectId === body.projectId && auth.creatorId === body.creatorId && auth.allowedPurposes.includes(body.purpose as never), "Observed source authorization unavailable.");
    }
  }
  const observed = new Set(body.observed.map(x => x.factId)), derived = new Map(body.derived.map(x => [x.derivedId, x]));
  const allowedPayloads = [
    ...body.mediaTruthRefs,
    ...body.observed.map(f => f.support.analysis),
    ...body.perceptionBindings.map(p => p.receipt.output),
  ];
  const allowed = (ref: ArtifactRef) => allowedPayloads.some(a => equal(a, ref));
  ensure([...observed].every(x => !derived.has(x)), "Observed and derived identities must be disjoint.");
  const visit = (id: string, path: Set<string>): boolean => {
    if (observed.has(id)) return true;
    ensure(!path.has(id), "Derived dependency cycle.");
    const d = derived.get(id); ensure(d, "Derived dependency is missing or is a creative hypothesis.");
    const next = new Set(path); next.add(id);
    return d.dependencies.every(dep => visit(dep, next));
  };
  for (const d of body.derived) {
    ensure(d.projectId === body.projectId && d.creatorId === body.creatorId && d.purpose === body.purpose, "Derived scope mismatch.");
    ensure(visit(d.derivedId, new Set()), "Derived evidence lacks grounded observation.");
    ensure(allowed(d.artifact) && (d.value.state !== "present" || allowed(d.value.value.artifact)), "Derived payload lacks authorized source binding.");
    if (artifacts) {
      validateProducerEvidence(d.producer, artifacts);
      resolveUncertaintyEvidence(d.uncertainty, artifacts);
      if (d.value.state === "present") artifacts.resolve(d.value.value);
    }
    for (const c of d.conflicts) ensure(observed.has(c) || derived.has(c), "Conflict reference unavailable.");
  }
  for (const e of body.entities) {
    if (e.support.state === "present" && artifacts) validateGroundedSupport(e.support.value, artifacts);
    if (e.authority === "ObservedFact") {
      const fact = body.observed.find(f => f.factId === e.entityId);
      ensure(fact && equal(fact.artifact, e.artifact) && (e.support.state !== "present" || equal(e.support.value, fact.support)), "Observed entity must bind exact fact support.");
    }
    if (e.authority === "DerivedObservation") {
      ensure(derived.has(e.entityId) && equal(derived.get(e.entityId)?.artifact, e.artifact) && e.support.state !== "present", "Derived entity cannot declare unproven source support.");
    }
    if (e.authority === "MediaTruth") {
      ensure(body.mediaTruthRefs.some(ref => equal(ref, e.artifact)) && (e.support.state !== "present" || equal(e.support.value.analysis, e.artifact)), "MediaTruth support must bind its exact source artifact.");
    }
  }
  for (const r of body.relationships) validateTemporalRelationship(r, body.entities);
  for (const r of body.relationships) if (r.clockMap.state === "present" && artifacts) {
    const map = r.clockMap.value;
    ensure(map.artifact.artifactType === "ClockMap" && map.support.pointer === "" && equal(map.support.artifact, map.artifact), "Exact clock map support required.");
    artifacts.resolve(map.support);
    const value = z.strictObject({ artifactType: z.literal("ClockMap"), artifactVersion: VersionLabelSchema, from: GroundedSupportSchema, to: GroundedSupportSchema, units: z.enum(["seconds", "samples", "frames"]), errorSeconds: SecondsSchema }).parse(artifacts.get(map.artifact));
    const from = body.entities.find(x => x.entityId === r.from)?.support, to = body.entities.find(x => x.entityId === r.to)?.support;
    ensure(from?.state === "present" && to?.state === "present" && equal(value.from, from.value) && equal(value.to, to.value) && value.units === map.units && value.errorSeconds === map.errorSeconds, "Clock map support/units/error mismatch.");
  }
  for (const t of body.tokenLinks) {
    ensure(t.authorization.pointer === "/authorization" && equal(t.authorization.artifact, t.analysis), "Token authorization link mismatch.");
    if (artifacts) ensure(equal(t, linkEditorialToken(t.token, artifacts, { projectId: body.projectId, creatorId: body.creatorId, purpose: body.purpose })), "Token link contradicts exact source evidence.");
  }
  const candidateKeys = body.candidateLinks.map(link => canonicalSerialize([link.candidateId, link.token, link.entityId]));
  ensure(new Set(candidateKeys).size === candidateKeys.length && candidateKeys.every((key, index) => index === 0 || compareText(candidateKeys[index - 1]!, key) < 0), "Candidate entity links must be canonical and unique.");
  for (const link of body.candidateLinks) {
    ensure(body.tokenLinks.some(t => t.candidateId === link.candidateId && equal(t.token, link.token)), "Candidate entity link lacks exact token snapshot.");
    const entity = body.entities.find(e => e.entityId === link.entityId);
    ensure(entity?.support.state === "present", "Candidate entity link requires grounded entity support.");
    if (artifacts) {
      const token = EditorialTokenSchema.parse(artifacts.get(link.token));
      const support = entity.support.value, range = token.candidate.sourceRange;
      ensure(token.candidate.candidateId === link.candidateId && equal(support.analysis, token.analysis.artifact) && support.assetId === token.candidate.assetId && support.sourceHash === token.sourceHash && support.range.startSeconds <= range.startSeconds && support.range.endSeconds >= range.endSeconds, "Candidate entity link contradicts exact token source.");
    }
  }
  for (const ref of body.candidateSetRefs) if (artifacts) {
    ensure(ref.artifactType === "EditorialCandidateSet" && ref.artifactVersion === "0.1.0", "Exact candidate set required.");
    const set = EditorialCandidateSetSchema.parse(artifacts.get(ref));
    validateCandidateSet(set, artifacts);
    ensure(set.projectId === body.projectId && set.candidates.every(c => body.tokenLinks.some(t => t.candidateId === c.candidateId && equal(t.token, c.token))), "Candidate set lacks exact scoped token links.");
  }
  for (const ref of body.mediaTruthRefs) if (artifacts) {
    ensure(ref.artifactType === "FootageAnalysis" && ref.artifactVersion === "1.0.0", "MediaTruth requires exact source analysis.");
    const auth = FootageAnalysisSchema.parse(artifacts.get(ref)).authorization;
    ensure(auth.projectId === body.projectId && auth.creatorId === body.creatorId && auth.allowedPurposes.includes(body.purpose as never), "MediaTruth source authorization unavailable.");
  }
  for (const p of body.perceptionBindings) {
    ensure(p.receipt.scope.projectId === body.projectId && p.receipt.scope.creatorId === body.creatorId && p.receipt.scope.purpose === body.purpose, "Perception scope mismatch.");
    if (artifacts) validatePerceptionBinding(p, artifacts);
  }
  ensure(body.perceptionBindings.every((p, i) => i === 0 || compareText(body.perceptionBindings[i - 1]!.receipt.computationKey, p.receipt.computationKey) < 0), "Perception bindings must be canonical and unique.");
  ensure(body.revision === 0 ? body.parent.state === "not_applicable" : body.parent.state === "present", "Parent/revision inconsistency.");
  if (body.revision === 0) ensure(equal(body.changeSet.added, [...observed, ...derived.keys()].sort(compareText)) && body.changeSet.superseded.length === 0 && body.changeSet.invalidated.length === 0 && body.changeSet.unchanged.length === 0, "Initial change set must declare every observation.");
  if (body.revision === 0 && body.changeSet.membership) ensure(equal(body.changeSet.membership, { added: worldMembershipKeys(body), removed: [], unchanged: [] }), "Initial membership inventory mismatch.");
}
function materializeWorldSnapshot(body: z.infer<typeof WorldBodySchema>, artifacts?: EditorialArtifactMap): WorldSnapshot {
  validateWorld(body, artifacts);
  return freeze(WorldSnapshotSchema.parse({ ...body, worldId: contentId("world_snapshot_v1", body) }));
}
export function createWorldSnapshot(input: Omit<WorldBodyInput, "artifactType" | "artifactVersion" | "stability">, artifacts?: EditorialArtifactMap): WorldSnapshot {
  const body = WorldBodySchema.parse({ artifactType: "ProjectWorldModel", artifactVersion: WORLD_VERSION, stability: "internal_pre_stable", ...input });
  ensure(body.revision === 0 && body.parent.state === "not_applicable", "Non-initial snapshot requires validated publication.");
  return materializeWorldSnapshot(body, artifacts);
}

/** Publication is pure. The supplied parent reference and lineage are exact; no latest lookup exists. */
export function publishWorldUpdate(parentInput: WorldSnapshot, parentRefInput: ArtifactRef, lineageInput: readonly ArtifactRef[], input: Omit<WorldBodyInput, "artifactType" | "artifactVersion" | "stability" | "parent" | "revision">, artifacts?: EditorialArtifactMap): WorldSnapshot {
  const parent = WorldSnapshotSchema.parse(parentInput), parentRef = ArtifactRefSchema.parse(parentRefInput), lineage = z.array(ArtifactRefSchema).max(256).parse(lineageInput);
  ensure(parentRef.artifactType === "ProjectWorldModel" && parentRef.artifactVersion === WORLD_VERSION && parentRef.objectId === parent.worldId && artifacts, "Exact supplied parent artifact required.");
  ensure(equal(WorldSnapshotSchema.parse(artifacts.get(parentRef)), parent), "Parent artifact bytes disagree with supplied snapshot.");
  ensure(new Set(lineage.map(x => x.objectId)).size === lineage.length && !lineage.some(x => x.objectId === parent.worldId), "Parent lineage cycle.");
  ensure(parent.parent.state === "present" ? lineage.length > 0 && equal(lineage[0], parent.parent.value) : lineage.length === 0, "Supplied ancestry contradicts parent.");
  ensure(input.projectId === parent.projectId && input.creatorId === parent.creatorId && input.purpose === parent.purpose && input.asOf >= parent.asOf, "Update scope/time mismatch.");
  const childBody = WorldBodySchema.parse({ artifactType: "ProjectWorldModel", artifactVersion: WORLD_VERSION, stability: "internal_pre_stable", ...input, revision: parent.revision + 1, parent: { state: "present", value: parentRef } });
  const child = materializeWorldSnapshot(childBody, artifacts);
  ensure(child.worldId !== parent.worldId && !lineage.some(x => x.objectId === child.worldId), "Parent cycle.");
  const old = new Set([...parent.observed.map(x => x.factId), ...parent.derived.map(x => x.derivedId)]);
  const current = new Set([...child.observed.map(x => x.factId), ...child.derived.map(x => x.derivedId)]);
  ensure([...old].every(x => current.has(x)), "Child must retain historical observation references.");
  ensure(child.changeSet.unchanged.every(x => old.has(x) && current.has(x)), "Unchanged set contradicts snapshots.");
  ensure(child.changeSet.added.every(x => !old.has(x) && current.has(x)), "Added set contradicts snapshots.");
  ensure(child.changeSet.superseded.every(x => old.has(x)), "Superseded evidence was not in parent.");
  const closure = dependencyInvalidation(child, child.changeSet.superseded);
  ensure(equal(child.changeSet.invalidated, closure), "Invalidation closure mismatch.");
  ensure(equal(child.changeSet.added, [...current].filter(x => !old.has(x)).sort(compareText)), "Added inventory incomplete.");
  ensure(equal(child.changeSet.unchanged, [...current].filter(x => old.has(x) && !closure.includes(x)).sort(compareText)), "Unchanged inventory incomplete.");
  const before = worldMembershipKeys(parent), after = worldMembershipKeys(child);
  const beforeKeys = new Set(before.map(canonicalSerialize)), afterKeys = new Set(after.map(canonicalSerialize));
  const membership = {
    added: after.filter(key => !beforeKeys.has(canonicalSerialize(key))),
    removed: before.filter(key => !afterKeys.has(canonicalSerialize(key))),
    unchanged: after.filter(key => beforeKeys.has(canonicalSerialize(key))),
  };
  ensure(child.changeSet.membership && equal(child.changeSet.membership, membership), "World membership change inventory incomplete.");
  return child;
}

export function dependencyInvalidation(snapshotInput: WorldSnapshot, rootsInput: readonly string[]): string[] {
  const snapshot = WorldSnapshotSchema.parse(snapshotInput), roots = idSet().parse(rootsInput);
  const known = new Set([...snapshot.observed.map(x => x.factId), ...snapshot.derived.map(x => x.derivedId)]);
  ensure(roots.every(x => known.has(x)), "Invalidation root missing.");
  const invalid = new Set(roots);
  for (let changed = true; changed;) {
    changed = false;
    for (const d of snapshot.derived) if (!invalid.has(d.derivedId) && d.dependencies.some(x => invalid.has(x))) { invalid.add(d.derivedId); changed = true; }
  }
  return [...invalid].sort(compareText);
}

const QuerySchema = z.strictObject({ worldId: IdSchema, projectId: IdSchema, creatorId: IdSchema, purpose: IdSchema, currentAuthorization: EvidenceRefSchema, currentAccess: refSet(16), accessAsOf: TimestampSchema, queryVersion: VersionLabelSchema,
  authority: z.array(z.enum(["MediaTruth", "ObservedFact", "DerivedObservation"])).min(1).max(3).refine(v => new Set(v).size === v.length && v.every((x, i) => i === 0 || compareText(v[i - 1]!, x) < 0), "Authority categories must be canonical."),
  channels: idSet(64), assetId: IdSchema.optional(), candidateId: IdSchema.optional(), token: ArtifactRefSchema.optional(), sourceRange: TimeRangeSchema.optional(), limit: z.number().int().min(1).max(WORLD_MAX_RESULTS), offset: z.number().int().nonnegative().max(WORLD_MAX_NODES) }).refine(q => (!q.sourceRange || !!q.assetId) && (!q.candidateId || !!q.assetId) && (!q.token || !!q.candidateId), "A source range or candidate requires an asset; a token filter requires a candidate.");
export type WorldQuery = z.infer<typeof QuerySchema>;
export const WorldViewSchema = z.strictObject({ artifactType: z.literal("ProjectWorldView"), artifactVersion: z.literal(WORLD_VERSION), worldId: IdSchema, queryId: IdSchema, viewId: IdSchema,
  returned: z.array(WorldEntitySchema).max(WORLD_MAX_RESULTS), relationships: z.array(WorldRelationshipSchema).max(WORLD_MAX_RESULTS), evidence: z.array(ArtifactRefSchema).max(WORLD_MAX_RESULTS),
  coverage: CoverageSchema, missingChannels: z.array(IdSchema).max(64), missingDependencies: idSet(), completeness: z.enum(["complete_for_bound", "bounded", "partial"]), omittedCount: z.number().int().nonnegative(), omittedRelationships: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable() }).refine(v => checkIdentity(v, "viewId", "world_view_v1"), "View identity mismatch.");
export type WorldView = z.infer<typeof WorldViewSchema>;
export function queryWorld(snapshotInput: WorldSnapshot, queryInput: unknown, artifacts: EditorialArtifactMap): WorldView {
  const q = QuerySchema.parse(queryInput);
  // The same generic denial for wrong scope, purpose, snapshot, or current authorization.
  ensure(q.worldId === snapshotInput.worldId && q.projectId === snapshotInput.projectId && q.creatorId === snapshotInput.creatorId && q.purpose === snapshotInput.purpose && equal(q.currentAuthorization, snapshotInput.authorization), "World view unavailable.");
  let currentAssets: z.infer<typeof MediaAssetSchema>[];
  try {
    currentAssets = q.currentAccess.map(ref => {
      ensure(ref.artifactType === "MediaAsset" && ref.artifactVersion === "1.0.0", "Current MediaAsset required.");
      const asset = MediaAssetSchema.parse(artifacts.get(ref));
      ensure(asset.projectId === q.projectId && asset.creatorId === q.creatorId && asset.retention.deletionRequestedAt === null && (asset.retention.expiresAt === null || asset.retention.expiresAt > q.accessAsOf), "Current access unavailable.");
      return asset;
    });
  } catch { throw new Error("World view unavailable."); }
  const world = WorldSnapshotSchema.parse(snapshotInput);
  ensure(q.accessAsOf >= world.asOf, "World view unavailable.");
  const knownAssets = new Set([
    ...world.observed.map(f => f.support.assetId),
    ...world.entities.flatMap(e => e.support.state === "present" ? [e.support.value.assetId] : []),
    ...world.perceptionBindings.map(p => p.support.assetId),
  ]);
  ensure(!q.assetId || knownAssets.has(q.assetId), "World view unavailable.");
  const candidateMatches = (entityId: string) => !q.candidateId || world.candidateLinks.some(link => link.candidateId === q.candidateId && link.entityId === entityId && (!q.token || equal(link.token, q.token)));
  const matches = (e: WorldEntity) => q.authority.includes(e.authority) && (!q.assetId || e.support.state === "present" && e.support.value.assetId === q.assetId) && (!q.sourceRange || e.support.state === "present" && e.support.value.range.startSeconds < q.sourceRange.endSeconds && q.sourceRange.startSeconds < e.support.value.range.endSeconds) && candidateMatches(e.entityId);
  const bounded = !!q.assetId;
  const matched = world.entities.filter(matches);
  const requiredAssets = bounded
    ? new Set([q.assetId!])
    : knownAssets;
  if (!bounded && world.mediaTruthRefs.length > knownAssets.size) ensure(currentAssets.length >= world.mediaTruthRefs.length, "World view unavailable.");
  ensure(currentAssets.length === requiredAssets.size && new Set(currentAssets.map(a => a.assetId)).size === currentAssets.length && currentAssets.every(asset => requiredAssets.has(asset.assetId)), "World view unavailable.");
  const sourceRefs = bounded
    ? matched.flatMap(e => e.support.state === "present" ? [e.support.value.analysis] : [])
    : [...world.observed.map(f => f.support.analysis), ...world.entities.flatMap(e => e.support.state === "present" ? [e.support.value.analysis] : []), ...world.tokenLinks.map(t => t.analysis), ...world.mediaTruthRefs];
  const sources = sourceRefs.map(ref => FootageAnalysisSchema.parse(artifacts.get(ref)));
  for (const asset of currentAssets) ensure(sources.filter(a => a.assetId === asset.assetId).every(a => a.metadata.durationSeconds === asset.durationSeconds && (a.authorization.sourceType === "synthetic" ? asset.origin === "synthetic" : asset.origin === "creator_upload")), "World view unavailable.");
  if (bounded) {
    for (const entity of matched) {
      if (entity.support.state === "present") validateGroundedSupport(entity.support.value, artifacts);
      if (entity.authority === "ObservedFact") {
        const fact = world.observed.find(f => f.factId === entity.entityId);
        ensure(fact && equal(fact.artifact, entity.artifact) && (entity.support.state !== "present" || equal(entity.support.value, fact.support)), "World view unavailable.");
      }
      if (entity.authority === "MediaTruth") ensure(world.mediaTruthRefs.some(ref => equal(ref, entity.artifact)) && (entity.support.state !== "present" || equal(entity.support.value.analysis, entity.artifact)), "World view unavailable.");
      if (entity.authority === "DerivedObservation") ensure(entity.support.state !== "present", "World view unavailable.");
      resolveMissingEvidence(entity, artifacts);
    }
    for (const channel of world.coverage.channels.filter(c => q.channels.includes(c.channel))) resolveMissingEvidence(channel, artifacts);
  } else validateWorld(world, artifacts);
  const invalid = new Set(world.changeSet.invalidated);
  const included = matched.filter(e => !invalid.has(e.entityId));
  const returned = included.slice(q.offset, q.offset + q.limit), ids = new Set(returned.map(e => e.entityId));
  const allRelationships = world.relationships.filter(r => ids.has(r.from) && ids.has(r.to));
  const relationships = allRelationships.slice(0, WORLD_MAX_RESULTS);
  const omittedRelationships = allRelationships.length - relationships.length;
  const evidence = [...new Map(returned.map(e => [e.artifact.objectId, e.artifact])).values()].sort((a, b) => compareText(a.objectId, b.objectId));
  const missingChannels = q.channels.filter(ch => !world.coverage.channels.some(c => c.channel === ch && c.state === "complete"));
  const omittedCount = Math.max(0, included.length - q.offset - returned.length), nextOffset = omittedCount ? q.offset + returned.length : null;
  const missingDependencies = matched.filter(e => invalid.has(e.entityId)).map(e => e.entityId).sort(compareText);
  const completeness = !q.channels.length || missingChannels.length || missingDependencies.length ? "partial" : omittedCount || omittedRelationships ? "bounded" : "complete_for_bound";
  const queryId = contentId("world_query_v1", q);
  const coverage = { evidence: world.coverage.evidence, channels: world.coverage.channels.filter(c => q.channels.includes(c.channel)) };
  const body = { artifactType: "ProjectWorldView" as const, artifactVersion: WORLD_VERSION, worldId: world.worldId, queryId, returned, relationships, evidence, coverage, missingChannels, missingDependencies, completeness, omittedCount, omittedRelationships, nextOffset };
  return freeze(WorldViewSchema.parse({ ...body, viewId: contentId("world_view_v1", body) }));
}
