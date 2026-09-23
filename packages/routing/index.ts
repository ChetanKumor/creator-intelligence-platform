/** Phase 5 Gate 3: pure, provider-neutral decisions over explicitly supplied evidence. */
import { z } from "zod";
import { IdSchema, TimestampSchema, VersionLabelSchema } from "../contracts/common.js";
import { CostEventSchema, ModelRunSchema, EventScopeSchema, OperationSchema } from "../contracts/events.js";
import { ArtifactRefSchema, ArtifactRefsSchema, EditorialArtifactMap, EvidenceRefSchema, availability, checkIdentity, compareText, ensure, equal, identify, missing, present, type SuppliedArtifact } from "../editorial/common.js";
import { PerceptionReuseReceiptSchema, ComputationKeySchema, ComputationIdentitySchema, computationKey, type ComputationIdentity } from "../perception/identity.js";
import type { PerceptionLookupResult } from "../perception/store.js";
import { HashSchema } from "../reference-analyzer/protocol.js";

export const ROUTING_VERSION = "0.1.0" as const;
const Scope = z.strictObject({ projectId: IdSchema, creatorId: IdSchema, purpose: IdSchema });
const Nat = z.number().int().nonnegative().safe();
const Estimate = z.strictObject({ value: Nat, unit: z.enum(["milliseconds", "inr_micros"]), evidence: EvidenceRefSchema });
const RefSet = ArtifactRefsSchema.refine(v => v.length <= 256, "Too many references.");
const IdSet = z.array(IdSchema).max(256).refine(v => new Set(v).size === v.length && v.every((x, i) => i === 0 || compareText(v[i - 1]!, x) < 0), "IDs must be unique and sorted.");
const Envelope = { version: z.literal(ROUTING_VERSION), scope: Scope };
const clone = <T>(value: T): T => structuredClone(value);
const sameScope = (a: z.infer<typeof Scope>, b: z.infer<typeof Scope>) => equal(a, b);
type Ref = z.infer<typeof ArtifactRefSchema>;
function exact(map: EditorialArtifactMap, ref: Ref, kind: string): unknown {
  const r = ArtifactRefSchema.parse(ref);
  ensure(r.artifactType === kind && r.artifactVersion === ROUTING_VERSION, `Exact ${kind} artifact required.`);
  return map.get(r);
}
function exactEvidence(map: EditorialArtifactMap, ref: z.infer<typeof EvidenceRefSchema>, kind: string): unknown {
  const r = EvidenceRefSchema.parse(ref);
  ensure(r.pointer === "", `Root ${kind} evidence required.`);
  return exact(map, r.artifact, kind);
}
function scopedEvidence(map: EditorialArtifactMap, ref: z.infer<typeof EvidenceRefSchema>, scope: z.infer<typeof Scope>): unknown {
  const value = map.resolve(ref);
  if (value !== null && typeof value === "object" && "scope" in value) ensure(equal((value as { scope: unknown }).scope, scope), "Evidence scope mismatch.");
  return value;
}
function resolveAvailability(value: { state: string; value?: unknown; evidenceRefs?: readonly z.infer<typeof EvidenceRefSchema>[] }, map: EditorialArtifactMap, scope: z.infer<typeof Scope>): void {
  if (value.state === "present") {
    const v = value.value;
    if (v && typeof v === "object" && "artifact" in v) scopedEvidence(map, v as z.infer<typeof EvidenceRefSchema>, scope);
    else if (v && typeof v === "object" && "objectId" in v) map.get(v as z.infer<typeof ArtifactRefSchema>);
    else if (v && typeof v === "object" && "evidence" in v) scopedEvidence(map, (v as { evidence: z.infer<typeof EvidenceRefSchema> }).evidence, scope);
  } else for (const ref of value.evidenceRefs ?? []) scopedEvidence(map, ref, scope);
}
function immutableRevision(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === value.toLowerCase() && v.length > 0 && !["latest", "main", "master", "head", "current"].includes(v)
    && !/^(?:refs\/heads\/|branch:|tag:)/.test(v) && !/[\s*?]/.test(v);
}

const ProfileBody = z.strictObject({ ...Envelope, modelId: IdSchema,
  exactRevision: z.string().min(1).max(160).refine(immutableRevision, "Immutable exact revision required."), revisionEvidence: ArtifactRefSchema,
  adapter: z.strictObject({ adapterId: IdSchema, version: VersionLabelSchema, implementationDigest: HashSchema }),
  capabilities: IdSet, modalities: z.array(z.enum(["text", "image", "audio", "video"])).min(1).max(4).refine(v => v.every((x, i) => i === 0 || compareText(v[i - 1]!, x) < 0), "Modalities must be sorted."),
  deployment: z.enum(["local", "cloud"]), qualityTier: IdSchema, qualityEvidence: availability(ArtifactRefSchema),
  contextLimits: EvidenceRefSchema, expectedLatency: availability(Estimate), estimatedCost: availability(Estimate),
  resourceRequirements: EvidenceRefSchema, licensing: EvidenceRefSchema, commercialEligibility: availability(z.boolean()),
  availability: availability(EvidenceRefSchema), observedAt: TimestampSchema,
});
export const ModelProfileSchema = ProfileBody.extend({ profileId: IdSchema }).refine(v => checkIdentity(v, "profileId", "routing_profile_v1"), "Profile identity mismatch.");
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
export function profile(input: unknown, artifacts: readonly SuppliedArtifact[]): ModelProfile {
  const body = ProfileBody.parse(input), map = new EditorialArtifactMap(artifacts);
  const rev = map.get(body.revisionEvidence);
  ensure(rev !== null && typeof rev === "object" && "revision" in rev && (rev as { revision: unknown }).revision === body.exactRevision, "Revision evidence does not resolve exact revision.");
  scopedEvidence(map, body.contextLimits, body.scope); scopedEvidence(map, body.resourceRequirements, body.scope); scopedEvidence(map, body.licensing, body.scope);
  if (body.qualityEvidence.state === "present") Evaluation.parse(exact(map, body.qualityEvidence.value, "ModelEvaluation"));
  if (body.availability.state === "present") ModelAvailability.parse(exactEvidence(map, body.availability.value, "ModelAvailability"));
  for (const v of [body.qualityEvidence, body.expectedLatency, body.estimatedCost, body.commercialEligibility, body.availability]) resolveAvailability(v, map, body.scope);
  return clone(ModelProfileSchema.parse(identify("routing_profile_v1", "profileId", body)));
}

const Limits = {
  cpuMilliseconds: Nat, gpuMilliseconds: Nat, peakRamBytes: Nat, peakVramBytes: Nat,
  apiSpendInrMicros: Nat, totalCostInrMicros: Nat, wallClockMilliseconds: Nat, modelCalls: Nat,
  renderWork: z.strictObject({ frames: Nat, pixelFrames: Nat, audioMilliseconds: Nat }),
};
const Premium = z.array(z.strictObject({ capabilityId: IdSchema, allowed: z.boolean(), maxCalls: Nat })).max(128)
  .refine(v => v.every((x, i) => i === 0 || compareText(v[i - 1]!.capabilityId, x.capabilityId) < 0) && v.every(x => x.allowed || x.maxCalls === 0), "Premium allowances must be sorted and bounded.");
const Authorization = z.strictObject({ ...Envelope, grant: z.literal("compute"), qualityTier: IdSchema, ...Limits,
  premiumOperations: Premium, retryLimit: Nat, directorRevisionLimit: Nat, reservationPolicy: EvidenceRefSchema });
const BudgetBody = z.strictObject({ ...Envelope, authorizationRef: ArtifactRefSchema, qualityTier: IdSchema, ...Limits,
  premiumOperations: Premium,
  retryLimit: Nat, directorRevisionLimit: Nat, childAllocations: RefSet, reservationPolicy: EvidenceRefSchema,
});
export const ComputeBudgetSchema = BudgetBody.extend({ budgetId: IdSchema }).refine(v => checkIdentity(v, "budgetId", "routing_budget_v1"), "Budget identity mismatch.");
export type ComputeBudget = z.infer<typeof ComputeBudgetSchema>;
const scalarLimits = ["cpuMilliseconds", "gpuMilliseconds", "peakRamBytes", "peakVramBytes", "apiSpendInrMicros", "totalCostInrMicros", "wallClockMilliseconds", "modelCalls"] as const;
const cumulativeLimits = ["cpuMilliseconds", "gpuMilliseconds", "apiSpendInrMicros", "totalCostInrMicros", "modelCalls"] as const;
const peakLimits = ["peakRamBytes", "peakVramBytes"] as const;
const renderLimits = ["frames", "pixelFrames", "audioMilliseconds"] as const;
function validateBudgetBody(body: z.infer<typeof BudgetBody>, map: EditorialArtifactMap, seen: ReadonlySet<string>): ComputeBudget {
  const auth = Authorization.parse(exact(map, body.authorizationRef, "ComputeAuthorization"));
  ensure(sameScope(auth.scope, body.scope) && auth.qualityTier === body.qualityTier && equal(auth.reservationPolicy, body.reservationPolicy), "Compute authorization scope/tier/policy mismatch.");
  scopedEvidence(map, body.reservationPolicy, body.scope);
  for (const k of scalarLimits) ensure(body[k] <= auth[k], `Budget exceeds authorized ${k}.`);
  for (const k of renderLimits) ensure(body.renderWork[k] <= auth.renderWork[k], `Budget exceeds authorized render ${k}.`);
  ensure(body.retryLimit <= auth.retryLimit && body.directorRevisionLimit <= auth.directorRevisionLimit, "Budget exceeds authorized retries/revisions.");
  for (const p of body.premiumOperations) {
    const allowed = auth.premiumOperations.find(x => x.capabilityId === p.capabilityId);
    ensure((!p.allowed && p.maxCalls === 0) || (allowed?.allowed && p.maxCalls <= allowed.maxCalls), "Budget exceeds authorized premium calls.");
  }
  const children = body.childAllocations.map(ref => {
    ensure(!seen.has(ref.objectId), "Child allocation cycle.");
    const child = ComputeBudgetSchema.parse(exact(map, ref, "ComputeBudget"));
    const { budgetId: _childId, ...childBody } = child;
    const validated = validateBudgetBody(childBody, map, new Set([...seen, ref.objectId]));
    ensure(equal(validated, child), "Invalid child allocation.");
    return child;
  });
  ensure(children.every(child => sameScope(child.scope, body.scope) && equal(child.authorizationRef, body.authorizationRef) && child.qualityTier === body.qualityTier
    && equal(child.reservationPolicy, body.reservationPolicy)), "Child allocation scope/authorization mismatch.");
  for (const k of cumulativeLimits) ensure(children.reduce((sum, child) => sum + child[k], 0) <= body[k], `Child allocation exceeds ${k}.`);
  for (const k of peakLimits) ensure(children.every(child => child[k] <= body[k]), `Child peak exceeds ${k}.`);
  ensure(children.every(child => child.wallClockMilliseconds <= body.wallClockMilliseconds), "Child wall-clock exceeds parent.");
  for (const k of renderLimits) ensure(children.reduce((sum, child) => sum + child.renderWork[k], 0) <= body.renderWork[k], `Child render allocation exceeds ${k}.`);
  ensure(children.reduce((sum, child) => sum + child.retryLimit, 0) <= body.retryLimit
    && children.reduce((sum, child) => sum + child.directorRevisionLimit, 0) <= body.directorRevisionLimit, "Child retry/revision allocation exceeds parent.");
  for (const p of body.premiumOperations) ensure(children.reduce((sum, child) => sum + (child.premiumOperations.find(x => x.capabilityId === p.capabilityId)?.maxCalls ?? 0), 0) <= p.maxCalls,
    "Child premium allocation exceeds parent.");
  ensure(children.every(child => child.premiumOperations.every(p => body.premiumOperations.some(parent => parent.capabilityId === p.capabilityId) || p.maxCalls === 0)), "Undeclared child premium capability.");
  return ComputeBudgetSchema.parse(identify("routing_budget_v1", "budgetId", body));
}
function validatedBudget(input: unknown, map: EditorialArtifactMap): ComputeBudget {
  const parsed = ComputeBudgetSchema.parse(input), { budgetId: _id, ...body } = parsed;
  const validated = validateBudgetBody(body, map, new Set());
  ensure(equal(validated, parsed), "Budget failed authorization replay.");
  return parsed;
}
function budgetArtifact(ref: Ref, map: EditorialArtifactMap): ComputeBudget { return validatedBudget(exact(map, ref, "ComputeBudget"), map); }
export function budget(input: unknown, artifacts: readonly SuppliedArtifact[]): ComputeBudget {
  return clone(validateBudgetBody(BudgetBody.parse(input), new EditorialArtifactMap(artifacts), new Set()));
}

const ReservationBody = z.strictObject({ ...Envelope, budgetId: IdSchema, budgetRef: ArtifactRefSchema, allocationRef: ArtifactRefSchema,
  historyRef: ArtifactRefSchema, operationId: IdSchema, attempt: z.number().int().positive().safe(),
  ...Limits, premiumOperations: z.array(z.strictObject({ capabilityId: IdSchema, calls: Nat })).max(128)
    .refine(v => v.every((x, i) => i === 0 || compareText(v[i - 1]!.capabilityId, x.capabilityId) < 0), "Premium calls must be sorted."),
  retryAllowance: Nat, directorRevisionAllowance: Nat,
});
export const ReservationSchema = ReservationBody.extend({ reservationId: IdSchema }).refine(v => checkIdentity(v, "reservationId", "routing_reservation_v1"), "Reservation identity mismatch.");
export type Reservation = z.infer<typeof ReservationSchema>;
const ReservationHistory = z.strictObject({ ...Envelope, budgetRef: ArtifactRefSchema,
  prior: z.array(z.strictObject({ reservation: ArtifactRefSchema, state: z.enum(["active", "released"]) })).max(4096)
    .refine(v => new Set(v.map(x => x.reservation.objectId)).size === v.length, "Duplicate reservation history reference.") });
type ReservationRequest = { scope: z.infer<typeof Scope>; budget: ComputeBudget; budgetArtifact: Ref; allocation: ComputeBudget;
  allocationArtifact: Ref; historyArtifact: Ref; operationId: string; attempt: number };
/** Validates explicitly supplied immutable history; no durable multiworker lock is claimed. */
function reserveInternal(input: ReservationRequest, artifacts: readonly SuppliedArtifact[], seen: ReadonlySet<string>): Reservation {
  const map = new EditorialArtifactMap(artifacts), b = budgetArtifact(input.budgetArtifact, map), a = budgetArtifact(input.allocationArtifact, map);
  ensure(equal(b, input.budget) && equal(a, input.allocation) && sameScope(input.scope, b.scope) && sameScope(a.scope, b.scope), "Reservation budget/allocation mismatch.");
  ensure(equal(input.allocationArtifact, input.budgetArtifact) || b.childAllocations.some(ref => equal(ref, input.allocationArtifact)), "Undeclared child allocation.");
  const history = ReservationHistory.parse(exact(map, input.historyArtifact, "ReservationHistory"));
  ensure(sameScope(history.scope, b.scope) && equal(history.budgetRef, input.budgetArtifact), "Reservation history scope/budget mismatch.");
  const prior = history.prior.map(item => ({ state: item.state, reservation: reservationArtifact(item.reservation, map, artifacts, seen) }));
  ensure(prior.every(x => sameScope(x.reservation.scope, b.scope) && equal(x.reservation.budgetRef, input.budgetArtifact) && x.reservation.budgetId === b.budgetId), "Foreign reservation history.");
  ensure(!prior.some(x => x.reservation.operationId === input.operationId && x.reservation.attempt === input.attempt), "Attempt already reserved.");
  ensure(!prior.some(x => equal(x.reservation.allocationRef, input.allocationArtifact)), "Allocation already reserved.");
  const active = prior.filter(x => x.state === "active").map(x => x.reservation), all = prior.map(x => x.reservation);
  for (const k of cumulativeLimits) ensure(a[k] + all.reduce((sum, r) => sum + r[k], 0) <= b[k], `Cumulative reservation exceeds ${k}.`);
  for (const k of peakLimits) ensure(a[k] <= b[k] && a[k] + active.reduce((sum, r) => sum + r[k], 0) <= b[k], `Concurrent peak exceeds ${k}.`);
  ensure(a.wallClockMilliseconds <= b.wallClockMilliseconds, "Reservation exceeds wall-clock ceiling.");
  for (const k of renderLimits) ensure(a.renderWork[k] + all.reduce((sum, r) => sum + r.renderWork[k], 0) <= b.renderWork[k], `Cumulative render reservation exceeds ${k}.`);
  ensure(a.retryLimit + all.reduce((sum, r) => sum + r.retryAllowance, 0) <= b.retryLimit
    && a.directorRevisionLimit + all.reduce((sum, r) => sum + r.directorRevisionAllowance, 0) <= b.directorRevisionLimit, "Cumulative retry/revision reservation exceeds parent.");
  const premiumOperations = a.premiumOperations.filter(x => x.maxCalls > 0).map(x => ({ capabilityId: x.capabilityId, calls: x.maxCalls }));
  for (const p of premiumOperations) {
    const allowance = b.premiumOperations.find(x => x.capabilityId === p.capabilityId);
    ensure(allowance?.allowed && p.calls + all.reduce((sum, r) => sum + (r.premiumOperations.find(x => x.capabilityId === p.capabilityId)?.calls ?? 0), 0) <= allowance.maxCalls,
      "Cumulative premium reservation exceeds parent.");
  }
  const body = ReservationBody.parse({ version: ROUTING_VERSION, scope: b.scope, budgetId: b.budgetId, budgetRef: input.budgetArtifact,
    allocationRef: input.allocationArtifact, historyRef: input.historyArtifact, operationId: input.operationId, attempt: input.attempt,
    ...Object.fromEntries(scalarLimits.map(k => [k, a[k]])), renderWork: a.renderWork, premiumOperations,
    retryAllowance: a.retryLimit, directorRevisionAllowance: a.directorRevisionLimit });
  return clone(ReservationSchema.parse(identify("routing_reservation_v1", "reservationId", body)));
}
export function reserve(input: ReservationRequest, artifacts: readonly SuppliedArtifact[]): Reservation {
  return reserveInternal(input, artifacts, new Set());
}
function reservationArtifact(ref: Ref, map: EditorialArtifactMap, artifacts: readonly SuppliedArtifact[], seen: ReadonlySet<string> = new Set()): Reservation {
  ensure(!seen.has(ref.objectId), "Reservation history cycle.");
  const r = ReservationSchema.parse(exact(map, ref, "Reservation"));
  const b = budgetArtifact(r.budgetRef, map), a = budgetArtifact(r.allocationRef, map);
  const replay = reserveInternal({ scope: r.scope, budget: b, budgetArtifact: r.budgetRef, allocation: a, allocationArtifact: r.allocationRef,
    historyArtifact: r.historyRef, operationId: r.operationId, attempt: r.attempt }, artifacts, new Set([...seen, ref.objectId]));
  ensure(equal(replay, r), "Reservation replay mismatch.");
  return r;
}

const EvaluatedModel = z.strictObject({ modelId: IdSchema, exactRevision: z.string().min(1).max(160), adapterId: IdSchema,
  adapterVersion: VersionLabelSchema, implementationDigest: HashSchema, capability: IdSchema });
const EvaluatedModels = z.array(EvaluatedModel).max(256)
    .refine(v => new Set(v.map(x => `${x.modelId}:${x.exactRevision}:${x.adapterId}:${x.adapterVersion}:${x.implementationDigest}:${x.capability}`)).size === v.length, "Duplicate evaluation target.");
const EvaluationAuthorization = z.strictObject({ ...Envelope, grant: z.literal("model_capability_evaluation"), qualityTier: IdSchema, authorizedModels: EvaluatedModels });
const Evaluation = z.strictObject({ ...Envelope, authorizationRef: ArtifactRefSchema, qualityTier: IdSchema, eligibleModels: EvaluatedModels });
const QualityRequirement = z.strictObject({ ...Envelope, capability: IdSchema, qualityTier: IdSchema, policy: EvidenceRefSchema });
const AvailabilityIdentity = z.strictObject({ modelId: IdSchema, exactRevision: z.string().min(1).max(160), adapterId: IdSchema,
  adapterVersion: VersionLabelSchema, implementationDigest: HashSchema });
const ModelAvailability = z.strictObject({ ...Envelope, ...AvailabilityIdentity.shape, available: z.boolean(), observedAt: TimestampSchema });
const AvailabilitySnapshot = z.strictObject({ ...Envelope, observedAt: TimestampSchema,
  profiles: z.array(z.strictObject({ ...AvailabilityIdentity.shape, available: z.boolean() })).max(256)
    .refine(v => new Set(v.map(x => `${x.modelId}:${x.exactRevision}:${x.adapterId}:${x.adapterVersion}:${x.implementationDigest}`)).size === v.length,
      "Duplicate availability profile.") });
const Resource = z.strictObject({ scope: Scope, cpuMilliseconds: Nat, gpuMilliseconds: Nat, peakRamBytes: Nat, peakVramBytes: Nat });
const License = z.strictObject({ commercial: z.boolean() });
const Policy = z.strictObject({ scope: Scope, order: z.literal("cost_then_latency_then_profile_id"), requireEstimates: z.boolean() });
const Reason = z.enum(["routing_v1.capability_missing", "routing_v1.quality_unproven", "routing_v1.unavailable", "routing_v1.commercial_use_unproven_or_disallowed", "routing_v1.resource_requirement_exceeds_budget", "routing_v1.estimated_cost_exceeds_budget", "routing_v1.estimated_latency_exceeds_budget", "routing_v1.stale_availability", "routing_v1.malformed_or_unresolved_evidence"]);
const SelectionBody = z.strictObject({ ...Envelope, requestedCapability: IdSchema, qualityRequirement: EvidenceRefSchema, budget: ArtifactRefSchema,
  evaluation: EvidenceRefSchema,
  candidateProfiles: RefSet, eligibleProfiles: RefSet, excluded: z.array(z.strictObject({ profile: ArtifactRefSchema, reasons: z.array(Reason).min(1) })).max(256),
  costEstimates: z.array(z.strictObject({ profile: ArtifactRefSchema, estimate: availability(Estimate) })).max(256),
  latencyEstimates: z.array(z.strictObject({ profile: ArtifactRefSchema, estimate: availability(Estimate) })).max(256),
  chosen: availability(ArtifactRefSchema), policy: EvidenceRefSchema, rationaleCodes: IdSet, fallbackEscalationPolicy: EvidenceRefSchema,
  availabilitySnapshot: ArtifactRefSchema, inputViewDigest: HashSchema,
});
export const ModelSelectionSchema = SelectionBody.extend({ selectionId: IdSchema }).refine(v => checkIdentity(v, "selectionId", "routing_selection_v1"), "Selection identity mismatch.");
export type ModelSelection = z.infer<typeof ModelSelectionSchema>;
export function selectModel(input: { scope: z.infer<typeof Scope>; capability: string; qualityRequirement: z.infer<typeof EvidenceRefSchema>; budget: ComputeBudget;
  budgetArtifact: z.infer<typeof ArtifactRefSchema>;
  candidates: readonly { profile: ModelProfile; artifact: z.infer<typeof ArtifactRefSchema> }[]; evaluation: z.infer<typeof EvidenceRefSchema>;
  availabilitySnapshot: z.infer<typeof ArtifactRefSchema>; policy: z.infer<typeof EvidenceRefSchema>; fallbackEscalationPolicy: z.infer<typeof EvidenceRefSchema>; inputViewDigest: string }, artifacts: readonly SuppliedArtifact[]): ModelSelection {
  const map = new EditorialArtifactMap(artifacts), b = budgetArtifact(input.budgetArtifact, map), scope = Scope.parse(input.scope);
  ensure(sameScope(scope, b.scope), "Budget scope mismatch.");
  ensure(equal(b, input.budget), "Exact budget artifact mismatch.");
  const requirement = QualityRequirement.parse(exactEvidence(map, input.qualityRequirement, "QualityRequirement"));
  ensure(sameScope(requirement.scope, scope) && requirement.capability === input.capability && requirement.qualityTier === b.qualityTier,
    "Quality requirement scope/capability/tier mismatch.");
  scopedEvidence(map, requirement.policy, scope);
  const ev = Evaluation.parse(exactEvidence(map, input.evaluation, "ModelEvaluation"));
  const evaluationGrant = EvaluationAuthorization.parse(exact(map, ev.authorizationRef, "EvaluationAuthorization"));
  ensure(sameScope(ev.scope, scope) && sameScope(evaluationGrant.scope, scope) && ev.qualityTier === requirement.qualityTier
    && evaluationGrant.qualityTier === ev.qualityTier, "Evaluation authority scope/tier mismatch.");
  ensure(ev.eligibleModels.every(model => evaluationGrant.authorizedModels.some(allowed => equal(allowed, model))), "Evaluation exceeds exact authorized models.");
  const snapshot = AvailabilitySnapshot.parse(exact(map, input.availabilitySnapshot, "AvailabilitySnapshot"));
  ensure(sameScope(snapshot.scope, scope), "Availability scope mismatch.");
  const policy = Policy.parse(scopedEvidence(map, input.policy, scope));
  ensure(policy.requireEstimates, "Least-cost selection requires cost and latency estimates.");
  scopedEvidence(map, input.fallbackEscalationPolicy, scope);
  const candidates = input.candidates.map(x => ({ profile: ModelProfileSchema.parse(x.profile), artifact: ArtifactRefSchema.parse(x.artifact) }))
    .sort((a, b) => compareText(a.artifact.objectId, b.artifact.objectId));
  ensure(new Set(candidates.map(x => x.artifact.objectId)).size === candidates.length && new Set(candidates.map(x => x.profile.profileId)).size === candidates.length, "Duplicate candidate profile.");
  const excluded: z.infer<typeof SelectionBody>["excluded"] = [], eligible: typeof candidates = [];
  for (const x of candidates) {
    ensure(equal(exact(map, x.artifact, "ModelProfile"), x.profile) && sameScope(x.profile.scope, scope), "Candidate artifact/scope mismatch.");
    const { profileId: _profileId, ...profileBody } = x.profile;
    ensure(profile(profileBody, artifacts).profileId === x.profile.profileId, "Candidate evidence mismatch.");
    const p = x.profile, reasons: z.infer<typeof Reason>[] = [];
    if (!p.capabilities.includes(input.capability)) reasons.push("routing_v1.capability_missing");
    const evaluated = ev.eligibleModels.some(e => e.modelId === p.modelId && e.exactRevision === p.exactRevision && e.adapterId === p.adapter.adapterId
      && e.adapterVersion === p.adapter.version && e.implementationDigest === p.adapter.implementationDigest && e.capability === input.capability);
    if (p.qualityTier !== requirement.qualityTier || p.qualityTier !== ev.qualityTier || !evaluated || p.qualityEvidence.state !== "present" || !equal(p.qualityEvidence.value, input.evaluation.artifact)) reasons.push("routing_v1.quality_unproven");
    const license = License.safeParse(scopedEvidence(map, p.licensing, scope));
    if (!license.success || !license.data.commercial || p.commercialEligibility.state !== "present" || !p.commercialEligibility.value) reasons.push("routing_v1.commercial_use_unproven_or_disallowed");
    if (p.availability.state !== "present") reasons.push("routing_v1.unavailable");
    else {
      const av = ModelAvailability.safeParse(exactEvidence(map, p.availability.value, "ModelAvailability"));
      const sameModel = (value: z.infer<typeof AvailabilityIdentity>) => value.modelId === p.modelId && value.exactRevision === p.exactRevision
        && value.adapterId === p.adapter.adapterId && value.adapterVersion === p.adapter.version && value.implementationDigest === p.adapter.implementationDigest;
      const snap = snapshot.profiles.find(sameModel);
      if (!av.success || !sameScope(av.data.scope, scope) || !sameModel(av.data) || av.data.observedAt !== p.observedAt
        || av.data.observedAt !== snapshot.observedAt) reasons.push("routing_v1.stale_availability");
      else if (!av.data.available || !snap?.available) reasons.push("routing_v1.unavailable");
    }
    const resources = Resource.safeParse(scopedEvidence(map, p.resourceRequirements, scope));
    if (!resources.success) reasons.push("routing_v1.malformed_or_unresolved_evidence");
    else if (resources.data.cpuMilliseconds > b.cpuMilliseconds || resources.data.gpuMilliseconds > b.gpuMilliseconds || resources.data.peakRamBytes > b.peakRamBytes || resources.data.peakVramBytes > b.peakVramBytes) reasons.push("routing_v1.resource_requirement_exceeds_budget");
    if (p.estimatedCost.state !== "present" || p.estimatedCost.value.unit !== "inr_micros") reasons.push("routing_v1.malformed_or_unresolved_evidence");
    else if (p.estimatedCost.value.value > b.totalCostInrMicros || (p.deployment === "cloud" && p.estimatedCost.value.value > b.apiSpendInrMicros)) reasons.push("routing_v1.estimated_cost_exceeds_budget");
    if (p.expectedLatency.state !== "present" || p.expectedLatency.value.unit !== "milliseconds") reasons.push("routing_v1.malformed_or_unresolved_evidence");
    else if (p.expectedLatency.value.value > b.wallClockMilliseconds) reasons.push("routing_v1.estimated_latency_exceeds_budget");
    if (reasons.length) excluded.push({ profile: x.artifact, reasons: [...new Set(reasons)].sort(compareText) }); else eligible.push(x);
  }
  eligible.sort((a, b) => {
    const ac = a.profile.estimatedCost, bc = b.profile.estimatedCost, al = a.profile.expectedLatency, bl = b.profile.expectedLatency;
    return (ac.state === "present" ? ac.value.value : Number.MAX_SAFE_INTEGER) - (bc.state === "present" ? bc.value.value : Number.MAX_SAFE_INTEGER)
      || (al.state === "present" ? al.value.value : Number.MAX_SAFE_INTEGER) - (bl.state === "present" ? bl.value.value : Number.MAX_SAFE_INTEGER)
      || compareText(a.profile.profileId, b.profile.profileId);
  });
  const body = SelectionBody.parse({ version: ROUTING_VERSION, scope, requestedCapability: input.capability, qualityRequirement: input.qualityRequirement,
    budget: input.budgetArtifact, evaluation: input.evaluation,
    candidateProfiles: candidates.map(x => x.artifact), eligibleProfiles: eligible.map(x => x.artifact).sort((a, b) => compareText(a.objectId, b.objectId)), excluded,
    costEstimates: candidates.map(x => ({ profile: x.artifact, estimate: x.profile.estimatedCost })), latencyEstimates: candidates.map(x => ({ profile: x.artifact, estimate: x.profile.expectedLatency })),
    chosen: eligible.length ? present(eligible[0]!.artifact) : missing("unavailable", "no_eligible_profile"), policy: input.policy,
    rationaleCodes: eligible.length ? ["routing_v1.cost_latency_id_order"] : ["routing_v1.no_eligible_profile"], fallbackEscalationPolicy: input.fallbackEscalationPolicy,
    availabilitySnapshot: input.availabilitySnapshot, inputViewDigest: input.inputViewDigest });
  return clone(ModelSelectionSchema.parse(identify("routing_selection_v1", "selectionId", body)));
}

function selectionArtifact(ref: Ref, map: EditorialArtifactMap, artifacts: readonly SuppliedArtifact[]): ModelSelection {
  const s = ModelSelectionSchema.parse(exact(map, ref, "ModelSelection"));
  const b = budgetArtifact(s.budget, map);
  const replayed = selectModel({ scope: s.scope, capability: s.requestedCapability, qualityRequirement: s.qualityRequirement, budget: b,
    budgetArtifact: s.budget, candidates: s.candidateProfiles.map(candidate => ({ artifact: candidate, profile: ModelProfileSchema.parse(exact(map, candidate, "ModelProfile")) })),
    evaluation: s.evaluation, availabilitySnapshot: s.availabilitySnapshot, policy: s.policy, fallbackEscalationPolicy: s.fallbackEscalationPolicy,
    inputViewDigest: s.inputViewDigest }, artifacts);
  ensure(equal(replayed, s), "Selection replay mismatch.");
  return s;
}
const Guard = z.strictObject({ scope: Scope, evidence: EvidenceRefSchema, status: z.enum(["pass", "fail", "unavailable"]) });
const GuardEvidence = z.strictObject({ ...Envelope, computationKey: ComputationKeySchema, requestedCapability: IdSchema,
  selection: ArtifactRefSchema, chosenProfile: ArtifactRefSchema, reservation: ArtifactRefSchema, resourceRequirements: EvidenceRefSchema,
  status: z.enum(["pass", "fail", "unavailable"]), checkedAt: TimestampSchema, policy: EvidenceRefSchema });
const RoutingBody = z.strictObject({ ...Envelope, state: z.enum(["reuse", "fresh_compute_authorized", "unavailable"]), computationKey: ComputationKeySchema,
  lookupStatus: z.enum(["cache_hit", "cache_miss", "incompatible", "failed_artifact", "stale_or_retired", "unavailable", "unsupported"]),
  receipt: PerceptionReuseReceiptSchema.nullable(), output: availability(ArtifactRefSchema), originalAttempt: availability(ArtifactRefSchema),
  modelRunRef: availability(ArtifactRefSchema), budgetId: availability(IdSchema), selectionId: availability(IdSchema), reservationId: availability(IdSchema),
  budgetRef: availability(ArtifactRefSchema), selectionRef: availability(ArtifactRefSchema), reservationRef: availability(ArtifactRefSchema),
  chosenProfile: availability(ArtifactRefSchema), guardEvidence: availability(EvidenceRefSchema), reasonCodes: IdSet,
});
export const RoutingDecisionSchema = RoutingBody.extend({ decisionId: IdSchema }).refine(v => checkIdentity(v, "decisionId", "routing_decision_v1")
  && (v.state === "fresh_compute_authorized" ? v.lookupStatus === "cache_miss" && v.receipt === null && v.budgetRef.state === "present"
    && v.selectionRef.state === "present" && v.reservationRef.state === "present" && v.chosenProfile.state === "present" && v.guardEvidence.state === "present"
    && v.budgetId.state === "present" && v.selectionId.state === "present" && v.reservationId.state === "present"
    : v.state === "reuse" ? v.lookupStatus === "cache_hit" && v.receipt !== null && v.output.state === "present" && v.originalAttempt.state === "present"
      && v.budgetRef.state !== "present" && v.selectionRef.state !== "present" && v.reservationRef.state !== "present" && v.chosenProfile.state !== "present"
      && v.budgetId.state !== "present" && v.selectionId.state !== "present" && v.reservationId.state !== "present" && v.guardEvidence.state !== "present"
    : v.receipt === null && v.budgetRef.state !== "present" && v.selectionRef.state !== "present" && v.reservationRef.state !== "present"
      && v.chosenProfile.state !== "present" && v.guardEvidence.state !== "present" && v.budgetId.state !== "present"
      && v.selectionId.state !== "present" && v.reservationId.state !== "present"), "Routing state/identity mismatch.");
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
/** Consumes the result of an already authorized Gate-1 lookup. Never calls the store or a provider. */
export function routePerception(input: { scope: z.infer<typeof Scope>; lookup: PerceptionLookupResult; budget?: ComputeBudget; selection?: ModelSelection;
  identity?: ComputationIdentity; budgetArtifact?: Ref; selectionArtifact?: Ref; reservation?: Reservation; reservationArtifact?: Ref;
  activeReservations?: readonly Reservation[]; guard?: z.infer<typeof Guard>; artifacts?: readonly SuppliedArtifact[] }): RoutingDecision {
  const scope = Scope.parse(input.scope), lookup = input.lookup;
  let state: z.infer<typeof RoutingBody>["state"] = "unavailable";
  let receipt: z.infer<typeof PerceptionReuseReceiptSchema> | null = null;
  let output: z.infer<typeof RoutingBody>["output"] = missing("unavailable", "no_reusable_output");
  let originalAttempt: z.infer<typeof RoutingBody>["originalAttempt"] = missing("not_applicable", "not_reused");
  let reasonCodes = ["routing_v1.fresh_authorization_missing"];
  let fresh: { budget: ComputeBudget; selection: ModelSelection; reservation: Reservation; chosen: Ref; guard: z.infer<typeof Guard> } | null = null;
  if (lookup.status === "cache_hit") {
    receipt = PerceptionReuseReceiptSchema.parse(lookup.receipt);
    ensure(sameScope(receipt.scope, scope) && receipt.computationKey === lookup.computationKey && equal(receipt.output, lookup.output), "Reuse receipt mismatch.");
    state = "reuse"; output = present(receipt.output); originalAttempt = present(receipt.selectedAttempt);
    reasonCodes = ["routing_v1.exact_cache_hit"];
  } else if (lookup.status === "cache_miss" && input.identity && input.budget && input.budgetArtifact && input.selection && input.selectionArtifact
    && input.reservation && input.reservationArtifact && input.guard && input.artifacts) {
    const map = new EditorialArtifactMap(input.artifacts);
    const b = budgetArtifact(input.budgetArtifact, map), s = selectionArtifact(input.selectionArtifact, map, input.artifacts);
    const r = reservationArtifact(input.reservationArtifact, map, input.artifacts), g = Guard.parse(input.guard);
    ensure(equal(b, input.budget) && equal(s, input.selection) && equal(r, input.reservation), "Fresh authorization artifact mismatch.");
    ensure(sameScope(g.scope, scope), "Guard scope mismatch.");
    const identity = ComputationIdentitySchema.parse(input.identity);
    const chosenRef = s.chosen.state === "present" ? s.chosen.value : null;
    const chosen = chosenRef === null ? null : ModelProfileSchema.parse(exact(map, chosenRef, "ModelProfile"));
    const guardEvidence = GuardEvidence.parse(exactEvidence(map, g.evidence, "RoutingGuard"));
    scopedEvidence(map, guardEvidence.policy, scope);
    const guardMatches = sameScope(guardEvidence.scope, scope) && guardEvidence.status === g.status
      && guardEvidence.computationKey === lookup.computationKey && guardEvidence.requestedCapability === s.requestedCapability
      && equal(guardEvidence.selection, input.selectionArtifact) && chosenRef !== null && equal(guardEvidence.chosenProfile, chosenRef)
      && equal(guardEvidence.reservation, input.reservationArtifact) && chosen !== null
      && equal(guardEvidence.resourceRequirements, chosen.resourceRequirements);
    const selectedIdentityMatches = chosen !== null && identity.computationClass === "learned_model" && identity.model.state === "present"
      && identity.producer.adapter.state === "present" && computationKey(identity) === lookup.computationKey
      && identity.operationKind === s.requestedCapability && chosen.capabilities.includes(identity.operationKind)
      && chosen.modelId === identity.model.value.modelId && chosen.exactRevision === identity.model.value.exactRevision
      && equal(chosen.revisionEvidence, identity.model.value.revisionEvidence)
      && chosen.adapter.adapterId === identity.producer.adapter.value.adapterId
      && chosen.adapter.version === identity.producer.adapter.value.adapterVersion
      && chosen.adapter.implementationDigest === identity.producer.implementationDigest;
    const required = chosen === null ? null : Resource.parse(scopedEvidence(map, chosen.resourceRequirements, scope));
    const reservationCovers = chosen !== null && required !== null && chosen.estimatedCost.state === "present" && chosen.expectedLatency.state === "present"
      && r.cpuMilliseconds >= required.cpuMilliseconds && r.gpuMilliseconds >= required.gpuMilliseconds
      && r.peakRamBytes >= required.peakRamBytes && r.peakVramBytes >= required.peakVramBytes
      && r.totalCostInrMicros >= chosen.estimatedCost.value.value
      && (chosen.deployment !== "cloud" || r.apiSpendInrMicros >= chosen.estimatedCost.value.value)
      && r.wallClockMilliseconds >= chosen.expectedLatency.value.value && r.modelCalls >= 1;
    if (sameScope(b.scope, scope) && sameScope(s.scope, scope) && sameScope(r.scope, scope) && sameScope(g.scope, scope)
      && selectedIdentityMatches && guardMatches && g.status === "pass" && s.chosen.state === "present" && equal(s.budget, input.budgetArtifact)
      && equal(r.budgetRef, input.budgetArtifact) && reservationCovers && chosenRef !== null) {
      state = "fresh_compute_authorized"; reasonCodes = ["routing_v1.explicit_future_attempt"];
      fresh = { budget: b, selection: s, reservation: r, chosen: chosenRef, guard: g };
    }
  }
  const absentState = state === "reuse" ? "not_applicable" : "unavailable";
  const absent = (name: string) => missing(absentState, name);
  const body = RoutingBody.parse({ version: ROUTING_VERSION, scope, state, computationKey: lookup.computationKey, lookupStatus: lookup.status,
    receipt, output, originalAttempt, modelRunRef: missing("not_applicable", "no_new_inference"),
    budgetId: fresh ? present(fresh.budget.budgetId) : absent("budget_not_authorized"),
    selectionId: fresh ? present(fresh.selection.selectionId) : absent("selection_not_authorized"),
    reservationId: fresh ? present(fresh.reservation.reservationId) : absent("reservation_not_authorized"),
    budgetRef: fresh ? present(input.budgetArtifact!) : absent("budget_not_authorized"),
    selectionRef: fresh ? present(input.selectionArtifact!) : absent("selection_not_authorized"),
    reservationRef: fresh ? present(input.reservationArtifact!) : absent("reservation_not_authorized"),
    chosenProfile: fresh ? present(fresh.chosen) : absent("profile_not_authorized"),
    guardEvidence: fresh ? present(fresh.guard.evidence) : absent("guard_not_authorized"), reasonCodes });
  return clone(RoutingDecisionSchema.parse(identify("routing_decision_v1", "decisionId", body)));
}

const TraceBody = z.strictObject({ ...Envelope, operationId: IdSchema, attempt: z.number().int().positive().safe(), parentOperation: availability(IdSchema),
  telemetryScope: availability(EventScopeSchema),
  computationKey: ComputationKeySchema, selectionRef: availability(ArtifactRefSchema), budgetRef: ArtifactRefSchema,
  projectedCost: availability(Estimate), expectedLatency: availability(Estimate), authorizedReservation: ArtifactRefSchema,
  observedLatency: availability(z.strictObject({ value: Nat, unit: z.literal("milliseconds"), method: IdSchema, observedAt: TimestampSchema, scope: Scope })),
  resourceObservations: availability(EvidenceRefSchema), costEventRef: availability(ArtifactRefSchema), modelRunRef: availability(ArtifactRefSchema),
  outcome: z.enum(["succeeded", "failed", "cancelled", "reused"]), reusedArtifact: availability(ArtifactRefSchema), originalAttempt: availability(ArtifactRefSchema),
});
export const CostTraceSchema = TraceBody.extend({ traceId: IdSchema }).refine(v => checkIdentity(v, "traceId", "routing_trace_v1"), "Trace identity mismatch.");
export type CostTrace = z.infer<typeof CostTraceSchema>;
export function costTrace(input: unknown, artifacts: readonly SuppliedArtifact[], reuseReceipt?: unknown): CostTrace {
  const body = TraceBody.parse(input), map = new EditorialArtifactMap(artifacts);
  const b = budgetArtifact(body.budgetRef, map), reservation = reservationArtifact(body.authorizedReservation, map, artifacts);
  ensure(sameScope(b.scope, body.scope) && sameScope(reservation.scope, body.scope) && reservation.budgetId === b.budgetId
    && equal(reservation.budgetRef, body.budgetRef)
    && reservation.operationId === body.operationId && reservation.attempt === body.attempt, "Trace budget/reservation join mismatch.");
  if (body.telemetryScope.state === "present") ensure(body.telemetryScope.value.projectId === body.scope.projectId && body.telemetryScope.value.creatorId === body.scope.creatorId, "Telemetry scope mismatch.");
  const selected = body.selectionRef.state === "present" ? selectionArtifact(body.selectionRef.value, map, artifacts) : null;
  if (selected) ensure(sameScope(selected.scope, body.scope) && equal(selected.budget, body.budgetRef), "Trace selection/budget join mismatch.");
  const chosen = selected?.chosen.state === "present" ? ModelProfileSchema.parse(exact(map, selected.chosen.value, "ModelProfile")) : null;
  if (chosen) ensure(equal(body.projectedCost, chosen.estimatedCost) && equal(body.expectedLatency, chosen.expectedLatency), "Trace projections contradict selected profile.");
  for (const value of [body.projectedCost, body.expectedLatency, body.resourceObservations]) resolveAvailability(value, map, body.scope);
  if (body.observedLatency.state === "present") ensure(sameScope(body.observedLatency.value.scope, body.scope), "Latency measurement scope mismatch.");
  if (body.costEventRef.state === "present") {
    ensure(body.outcome !== "reused", "Reuse cannot attach public inference billing in this gate.");
    ensure(body.costEventRef.value.artifactType === "CostEvent" && body.costEventRef.value.artifactVersion === "1.0.0", "Exact CostEvent artifact required.");
    const event = CostEventSchema.parse(map.get(body.costEventRef.value));
    ensure(body.telemetryScope.state === "present" && equal(event.scope, body.telemetryScope.value) && event.operationId === body.operationId && event.attempt === body.attempt, "CostEvent operation/scope mismatch.");
    if (selected) {
      const publicOperation = OperationSchema.safeParse(selected.requestedCapability);
      ensure(publicOperation.success && event.operation === publicOperation.data, "CostEvent operation does not represent selection.");
    }
    if (selected?.chosen.state === "present") {
      ensure(chosen !== null && event.model === chosen.modelId && event.tool === chosen.adapter.adapterId, "CostEvent selected model/adapter mismatch.");
    }
  }
  if (body.modelRunRef.state === "present") {
    ensure(body.outcome !== "reused" && body.modelRunRef.value.artifactType === "ModelRun" && body.modelRunRef.value.artifactVersion === "1.0.0", "Exact new ModelRun required.");
    const run = ModelRunSchema.parse(map.get(body.modelRunRef.value));
    ensure(body.telemetryScope.state === "present" && equal(run.scope, body.telemetryScope.value), "ModelRun scope mismatch.");
    ensure(run.status === body.outcome, "ModelRun and trace outcomes disagree.");
    ensure(body.selectionRef.state === "present", "ModelRun requires selected model.");
    const selection = selected;
    ensure(selection !== null, "ModelRun selection missing.");
    ensure(sameScope(selection.scope, body.scope) && selection.chosen.state === "present", "Model selection scope/winner mismatch.");
    ensure(chosen !== null && run.model === chosen.modelId && run.modelVersion === chosen.exactRevision && run.adapterVersion === chosen.adapter.version, "ModelRun selected model mismatch.");
    const publicOperation = OperationSchema.safeParse(selection.requestedCapability);
    ensure(publicOperation.success && run.operation === publicOperation.data, "ModelRun operation does not represent selection.");
    if (body.costEventRef.state === "present") {
      const event = CostEventSchema.parse(map.get(body.costEventRef.value));
      ensure(event.modelRunId === run.runId && event.model === run.model && event.operation === run.operation, "CostEvent ModelRun join mismatch.");
    }
  }
  if (body.outcome === "reused") {
    const receipt = PerceptionReuseReceiptSchema.parse(reuseReceipt);
    ensure(sameScope(receipt.scope, body.scope) && receipt.computationKey === body.computationKey && body.reusedArtifact.state === "present"
      && equal(receipt.output, body.reusedArtifact.value) && body.originalAttempt.state === "present" && equal(receipt.selectedAttempt, body.originalAttempt.value)
      && body.modelRunRef.state !== "present" && body.selectionRef.state !== "present", "Reuse trace must bind historical output/attempt without new inference.");
  } else ensure(body.reusedArtifact.state !== "present" && body.originalAttempt.state !== "present", "Non-reuse trace cannot claim reused output.");
  return clone(CostTraceSchema.parse(identify("routing_trace_v1", "traceId", body)));
}
