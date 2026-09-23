import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { exactDigest, identify, missing, present, type SuppliedArtifact } from "../packages/editorial/common.js";
import { ComputationIdentitySchema, computationKey } from "../packages/perception/index.js";
import { budget, profile, reserve as reserveExact, selectModel, routePerception, costTrace, RoutingDecisionSchema, type ComputeBudget, type Reservation } from "../packages/routing/index.js";

const H = "a".repeat(64), TIME = "2026-09-23T00:00:00.000Z";
const scope = { projectId: "project_a", creatorId: "creator_a", purpose: "local_evaluation" };
function artifact(id: string, value: unknown, artifactType = "Evidence", artifactVersion = "0.1.0"): SuppliedArtifact {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  return { ref: { objectId: id, artifactType, artifactVersion, sha256: exactDigest(bytes) }, bytes, value };
}
const policy = artifact("policy", { scope, order: "cost_then_latency_then_profile_id", requireEstimates: true });
const modelEvidence = ["model_a", "model_b"].map(modelId => ({ modelId, exactRevision: H, adapterId: "adapter_a", adapterVersion: "1.0.0", implementationDigest: H, capability: "embedding" }));
const authorization = artifact("authorization", { version: "0.1.0", scope, grant: "compute", qualityTier: "tier_a",
  cpuMilliseconds: 1000, gpuMilliseconds: 100, peakRamBytes: 10000, peakVramBytes: 10000, apiSpendInrMicros: 10000,
  totalCostInrMicros: 10000, wallClockMilliseconds: 1000, modelCalls: 10, renderWork: { frames: 100, pixelFrames: 100, audioMilliseconds: 100 },
  premiumOperations: [{ capabilityId: "premium", allowed: true, maxCalls: 10 }], retryLimit: 10, directorRevisionLimit: 10,
  reservationPolicy: { artifact: policy.ref, pointer: "" } }, "ComputeAuthorization");
const evaluationAuthorization = artifact("evaluation_authorization", { version: "0.1.0", scope, grant: "model_capability_evaluation", qualityTier: "tier_a",
  authorizedModels: modelEvidence }, "EvaluationAuthorization");
const evaluation = artifact("evaluation", { version: "0.1.0", scope, authorizationRef: evaluationAuthorization.ref, qualityTier: "tier_a",
  eligibleModels: modelEvidence }, "ModelEvaluation");
const qualityRequirement = artifact("quality_requirement", { version: "0.1.0", scope, capability: "embedding", qualityTier: "tier_a",
  policy: { artifact: policy.ref, pointer: "" } }, "QualityRequirement");
const revision = artifact("revision", { revision: H });
const resource = artifact("resource", { scope, cpuMilliseconds: 10, gpuMilliseconds: 0, peakRamBytes: 100, peakVramBytes: 0 });
const license = artifact("license", { commercial: true });
const context = artifact("context", { maximumTokens: 100 });
const modelAvailability = (modelId: string) => ({ version: "0.1.0", scope, modelId, exactRevision: H, adapterId: "adapter_a", adapterVersion: "1.0.0",
  implementationDigest: H, available: true, observedAt: TIME });
const availability = artifact("availability_a", modelAvailability("model_a"), "ModelAvailability");
const availabilityB = artifact("availability_b", modelAvailability("model_b"), "ModelAvailability");
const availabilitySnapshot = artifact("availability_snapshot", { version: "0.1.0", scope, observedAt: TIME,
  profiles: ["model_a", "model_b"].map(modelId => { const { version: _version, scope: _scope, observedAt: _time, ...value } = modelAvailability(modelId); return value; }) }, "AvailabilitySnapshot");
const guard = artifact("guard", { scope, status: "pass", observedAt: TIME });
const artifacts = [authorization, evaluationAuthorization, policy, evaluation, qualityRequirement, revision, resource, license, context, availability, availabilityB, availabilitySnapshot, guard];

function makeBudget(overrides: Record<string, unknown> = {}, extraArtifacts: readonly SuppliedArtifact[] = []) {
  return budget({ version: "0.1.0", scope, authorizationRef: authorization.ref, qualityTier: "tier_a", cpuMilliseconds: 100, gpuMilliseconds: 0,
    peakRamBytes: 1000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 1000, wallClockMilliseconds: 100,
    modelCalls: 1, renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0,
    directorRevisionLimit: 0, childAllocations: [], reservationPolicy: { artifact: policy.ref, pointer: "" }, ...overrides }, [...artifacts, ...extraArtifacts]);
}
function makeProfile(overrides: Record<string, unknown> = {}, extraArtifacts: readonly SuppliedArtifact[] = []) {
  return profile({ version: "0.1.0", scope, modelId: "model_a", exactRevision: H, revisionEvidence: revision.ref,
    adapter: { adapterId: "adapter_a", version: "1.0.0", implementationDigest: H }, capabilities: ["embedding"], modalities: ["image"],
    deployment: "local", qualityTier: "tier_a", qualityEvidence: present(evaluation.ref), contextLimits: { artifact: context.ref, pointer: "" },
    expectedLatency: present({ value: 20, unit: "milliseconds", evidence: { artifact: policy.ref, pointer: "" } }),
    estimatedCost: present({ value: 30, unit: "inr_micros", evidence: { artifact: policy.ref, pointer: "" } }),
    resourceRequirements: { artifact: resource.ref, pointer: "" }, licensing: { artifact: license.ref, pointer: "" },
    commercialEligibility: present(true), availability: present({ artifact: availability.ref, pointer: "" }), observedAt: TIME, ...overrides }, [...artifacts, ...extraArtifacts]);
}
function makeIdentity(modelId = "model_a") {
  return ComputationIdentitySchema.parse({ identityVersion: "perception-computation-1.0.0", operationKind: "embedding", computationClass: "learned_model",
    inputs: [{ kind: "source", assetId: `asset_${H}`, contentHash: H, sizeBytes: 1, support: { kind: "whole_source" } }],
    producer: { producerId: "producer", implementationVersion: "1.0.0", implementationDigest: H, adapter: present({ adapterId: "adapter_a", adapterVersion: "1.0.0" }) },
    model: present({ modelId, providerId: "provider", exactRevision: H, revisionEvidence: revision.ref }),
    preprocessing: present({ version: "1.0.0", configurationDigest: H }), configurationDigest: H,
    semanticExecutionSettings: { artifact: policy.ref, pointer: "" }, outputSchema: { artifactType: "Embedding", artifactVersion: "1.0.0", semanticSpace: present({ spaceId: "space_a", spaceVersion: "1.0.0" }) },
    determinism: { kind: "deterministic", policy: { artifact: policy.ref, pointer: "" } } });
}
const reservationSupport = new Map<string, SuppliedArtifact[]>();
function reserve(input: { scope: typeof scope; budget: ComputeBudget; operationId: string; attempt: number; allocation: ComputeBudget;
  activeReservations?: readonly Reservation[]; reservationHistory?: readonly Reservation[]; budgetArtifact?: SuppliedArtifact;
  allocationArtifact?: SuppliedArtifact }, extraArtifacts: readonly SuppliedArtifact[] = artifacts): Reservation {
  const parent = input.budgetArtifact ?? artifact(`budget_${input.budget.budgetId}`, input.budget, "ComputeBudget");
  const allocation = input.allocationArtifact ?? (input.allocation.budgetId === input.budget.budgetId ? parent
    : artifact(`allocation_${input.allocation.budgetId}`, input.allocation, "ComputeBudget"));
  const prior = [...(input.reservationHistory ?? []), ...(input.activeReservations ?? []).filter(r => !(input.reservationHistory ?? []).some(x => x.reservationId === r.reservationId))];
  const priorArtifacts = prior.map(r => artifact(`prior_${r.reservationId}`, r, "Reservation"));
  const history = artifact(`history_${input.operationId}_${input.attempt}`, { version: "0.1.0", scope: input.scope, budgetRef: parent.ref,
    prior: prior.map((r, i) => ({ reservation: priorArtifacts[i]!.ref, state: input.activeReservations?.some(x => x.reservationId === r.reservationId) ? "active" : "released" })) }, "ReservationHistory");
  const supplied = [...new Map([...extraArtifacts, parent, ...(allocation === parent ? [] : [allocation]), history, ...priorArtifacts,
    ...prior.flatMap(r => reservationSupport.get(r.reservationId) ?? [])].map(x => [x.ref.objectId, x])).values()];
  const result = reserveExact({ scope: input.scope, budget: input.budget, budgetArtifact: parent.ref, allocation: input.allocation,
    allocationArtifact: allocation.ref, historyArtifact: history.ref, operationId: input.operationId, attempt: input.attempt }, supplied);
  reservationSupport.set(result.reservationId, supplied);
  return result;
}

test("strict pinned profile and finite budget identities", () => {
  const p = makeProfile(), b = makeBudget();
  assert.equal(makeProfile().profileId, p.profileId);
  assert.equal(makeBudget().budgetId, b.budgetId);
  assert.throws(() => makeProfile({ exactRevision: "latest" }));
  assert.throws(() => makeProfile({ unexpected: true }));
  assert.throws(() => makeBudget({ cpuMilliseconds: Infinity }));
  assert.throws(() => makeBudget({ cpuMilliseconds: -1 }));
  assert.throws(() => makeBudget({ cpuMilliseconds: 0.5 }));
  assert.throws(() => makeBudget({ authorizationRef: revision.ref }));
});

test("selection is deterministic, explicit, and excludes missing quality", () => {
  const b = makeBudget(), p = makeProfile();
  const input = { scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget").ref,
    candidates: [{ profile: p, artifact: artifact("profile_a", p, "ModelProfile").ref }], evaluation: { artifact: evaluation.ref, pointer: "" },
    availabilitySnapshot: availabilitySnapshot.ref, policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H };
  const a = selectModel(input, [...artifacts, artifact("budget", b, "ComputeBudget"), artifact("profile_a", p, "ModelProfile")]);
  assert.deepEqual(selectModel(input, [...artifacts, artifact("budget", b, "ComputeBudget"), artifact("profile_a", p, "ModelProfile")]), a);
  assert.equal(a.chosen.state, "present");
  const absent = makeProfile({ qualityEvidence: missing("unavailable", "not_evaluated") });
  const x = selectModel({ ...input, candidates: [{ profile: absent, artifact: artifact("profile_b", absent, "ModelProfile").ref }] }, [...artifacts, artifact("budget", b, "ComputeBudget"), artifact("profile_b", absent, "ModelProfile")]);
  assert.equal(x.chosen.state, "unavailable");
  assert.ok(x.excluded[0]?.reasons.includes("routing_v1.quality_unproven"));
  const zeroBudget = makeBudget({ cpuMilliseconds: 0 });
  const zero = selectModel({ ...input, budget: zeroBudget, budgetArtifact: artifact("zero_budget", zeroBudget, "ComputeBudget").ref }, [...artifacts, artifact("zero_budget", zeroBudget, "ComputeBudget"), artifact("profile_a", p, "ModelProfile")]);
  assert.equal(zero.chosen.state, "unavailable");
});

test("parallel reservations are bounded and are not consumption", () => {
  const child = makeBudget({ cpuMilliseconds: 60 }), childRef = artifact("parallel_child", child, "ComputeBudget");
  const b = makeBudget({ childAllocations: [childRef.ref] }, [childRef]);
  const r = reserve({ scope, budget: b, operationId: "operation_a", attempt: 1, allocation: child, allocationArtifact: childRef, activeReservations: [] }, [...artifacts, childRef]);
  assert.equal(r.cpuMilliseconds, 60);
  assert.throws(() => reserve({ scope, budget: b, operationId: "operation_b", attempt: 1,
    allocation: child, allocationArtifact: childRef, activeReservations: [r] }, [...artifacts, childRef]));
});

test("cache hit reuses exact output without selection or new run", () => {
  const receipt = { receiptType: "PerceptionReuseReceipt" as const, receiptVersion: "0.1.0" as const, computationKey: `perception_computation_v1_${H}`,
    output: artifact("output", {}).ref, selectedAttempt: artifact("attempt", {}).ref, selection: artifact("selected", {}).ref,
    scope, reuseStatus: "reused" as const, modelRunCreated: false as const };
  const result = routePerception({ scope, lookup: { status: "cache_hit", computationKey: receipt.computationKey, output: receipt.output, receipt } });
  assert.equal(result.state, "reuse");
  assert.deepEqual(result.receipt, receipt);
  assert.equal(result.modelRunRef.state, "not_applicable");
});

test("cache miss only authorizes future work with budget, guard and selection", () => {
  const f = freshFixture();
  assert.equal(routePerception(f.routeInput).state, "fresh_compute_authorized");
  assert.equal(routePerception({ scope, lookup: f.lookup }).state, "unavailable");
  const { guard: _unusedGuard, ...withoutGuard } = f.routeInput;
  assert.equal(routePerception(withoutGuard).state, "unavailable");
});

test("fresh route rejects a selected profile that differs from exact computation identity", () => {
  const b = makeBudget(), p = makeProfile();
  const selection = selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget").ref,
    candidates: [{ profile: p, artifact: artifact("profile_a", p, "ModelProfile").ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H }, [...artifacts, artifact("budget", b, "ComputeBudget"), artifact("profile_a", p, "ModelProfile")]);
  const reservation = reserve({ scope, budget: b, operationId: "operation_a", attempt: 1, allocation: b, activeReservations: [] }, artifacts);
  const identity = makeIdentity("DIFFERENT_MODEL");
  const lookup = { status: "cache_miss" as const, computationKey: computationKey(identity), missing: missing("not_computed", "no_exact_computation") };
  const result = routePerception({ scope, lookup, identity, budget: b, selection, reservation, activeReservations: [], guard: { scope, evidence: { artifact: guard.ref, pointer: "" }, status: "pass" },
    artifacts: [...artifacts, artifact("budget", b, "ComputeBudget"), artifact("profile_a", p, "ModelProfile")] });
  assert.equal(result.state, "unavailable");
});

test("cost trace keeps missing billing explicit", () => {
  const b = makeBudget();
  const budgetRef = artifact("budget", b, "ComputeBudget");
  const r = reserve({ scope, budget: b, budgetArtifact: budgetRef, operationId: "operation_a", attempt: 1, allocation: b, activeReservations: [] }, artifacts);
  const trace = costTrace({ version: "0.1.0", scope, operationId: "operation_a", attempt: 1, parentOperation: missing("not_applicable", "root_operation"), telemetryScope: missing("unavailable", "no_telemetry"),
    computationKey: `perception_computation_v1_${H}`, selectionRef: missing("unavailable", "no_selection"), budgetRef: artifact("budget", b, "ComputeBudget").ref,
    projectedCost: missing("unavailable", "unknown_cost"), expectedLatency: missing("unavailable", "unknown_latency"),
    authorizedReservation: artifact("reservation", r, "Reservation").ref, observedLatency: missing("not_computed", "not_executed"),
    resourceObservations: missing("not_computed", "not_executed"), costEventRef: missing("unavailable", "billing_missing"),
    modelRunRef: missing("not_applicable", "no_inference"), outcome: "cancelled", reusedArtifact: missing("not_applicable", "not_reused"),
    originalAttempt: missing("not_applicable", "not_reused") }, [...new Map([...artifacts, artifact("budget", b, "ComputeBudget"), artifact("reservation", r, "Reservation"),
      ...(reservationSupport.get(r.reservationId) ?? [])].map(x => [x.ref.objectId, x])).values()]);
  assert.equal(trace.costEventRef.state, "unavailable");
  assert.equal(Object.hasOwn(trace, "costInrMicros"), false);
});

test("profile and budget reject scope, alias, unknown and unsafe evidence", () => {
  for (const alias of ["latest", "main", "master", "head", "current", "MAIN", "refs/heads/main"]) assert.throws(() => makeProfile({ exactRevision: alias }));
  assert.throws(() => makeProfile({ revisionEvidence: context.ref }));
  assert.throws(() => makeProfile({ scope: { ...scope, creatorId: "foreign" } }));
  assert.throws(() => makeBudget({ scope: { ...scope, creatorId: "foreign" } }));
  assert.throws(() => makeBudget({ totalCostInrMicros: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => makeBudget({ extra: 1 }));
});

test("selection exclusions cover capability, availability, commercial, resources, cost and latency", () => {
  const b = makeBudget();
  const cases = [
    [{ capabilities: ["speech"] }, "routing_v1.capability_missing"],
    [{ availability: missing("unavailable", "provider_down") }, "routing_v1.unavailable"],
    [{ commercialEligibility: missing("unavailable", "license_unknown") }, "routing_v1.commercial_use_unproven_or_disallowed"],
    [{ estimatedCost: present({ value: 2000, unit: "inr_micros", evidence: { artifact: policy.ref, pointer: "" } }) }, "routing_v1.estimated_cost_exceeds_budget"],
    [{ expectedLatency: present({ value: 200, unit: "milliseconds", evidence: { artifact: policy.ref, pointer: "" } }) }, "routing_v1.estimated_latency_exceeds_budget"],
    [{ estimatedCost: missing("unavailable", "unknown_estimate") }, "routing_v1.malformed_or_unresolved_evidence"],
  ] as const;
  for (const [change, reason] of cases) {
    const p = makeProfile(change), ref = artifact("candidate", p, "ModelProfile");
    const s = selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget").ref,
      candidates: [{ profile: p, artifact: ref.ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
      policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H }, [...artifacts, artifact("budget", b, "ComputeBudget"), ref]);
    assert.equal(s.chosen.state, "unavailable");
    assert.ok(s.excluded[0]?.reasons.includes(reason));
  }
  const highResources = artifact("high_resources", { scope, cpuMilliseconds: 1000, gpuMilliseconds: 0, peakRamBytes: 2000, peakVramBytes: 0 });
  const p = makeProfile({ resourceRequirements: { artifact: highResources.ref, pointer: "" } }, [highResources]);
  const s = selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget").ref,
    candidates: [{ profile: p, artifact: artifact("candidate", p, "ModelProfile").ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H }, [...artifacts, highResources, artifact("budget", b, "ComputeBudget"), artifact("candidate", p, "ModelProfile")]);
  assert.ok(s.excluded[0]?.reasons.includes("routing_v1.resource_requirement_exceeds_budget"));
});

test("candidate ordering and tie choice are replayable; duplicates fail", () => {
  const b = makeBudget(), p1 = makeProfile(), p2 = makeProfile({ modelId: "model_b" });
  const a1 = artifact("candidate_a", p1, "ModelProfile"), a2 = artifact("candidate_b", p2, "ModelProfile");
  const base = { scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget").ref,
    evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref, policy: { artifact: policy.ref, pointer: "" },
    fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H };
  const supplied = [...artifacts, artifact("budget", b, "ComputeBudget"), a1, a2];
  const one = selectModel({ ...base, candidates: [{ profile: p1, artifact: a1.ref }, { profile: p2, artifact: a2.ref }] }, supplied);
  const two = selectModel({ ...base, candidates: [{ profile: p2, artifact: a2.ref }, { profile: p1, artifact: a1.ref }] }, supplied);
  assert.deepEqual(one, two);
  assert.throws(() => selectModel({ ...base, candidates: [{ profile: p1, artifact: a1.ref }, { profile: p1, artifact: a1.ref }] }, supplied));
  assert.notEqual(selectModel({ ...base, candidates: [{ profile: p1, artifact: a1.ref }] }, supplied).selectionId,
    selectModel({ ...base, candidates: [{ profile: p2, artifact: a2.ref }] }, supplied).selectionId);
  const otherTier = makeProfile({ qualityTier: "tier_b" });
  assert.notEqual(otherTier.profileId, p1.profileId);
});

test("quality attestation must name the exact model and capability under an evaluation grant", () => {
  const b = makeBudget(), p = makeProfile({ modelId: "model_c" }), ref = artifact("candidate_c", p, "ModelProfile");
  const input = { scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget").ref,
    candidates: [{ profile: p, artifact: ref.ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H };
  const result = selectModel(input, [...artifacts, artifact("budget", b, "ComputeBudget"), ref]);
  assert.equal(result.chosen.state, "unavailable");
  assert.ok(result.excluded[0]?.reasons.includes("routing_v1.quality_unproven"));
  assert.throws(() => selectModel(input, [...artifacts.filter(a => a.ref.objectId !== evaluationAuthorization.ref.objectId), artifact("budget", b, "ComputeBudget"), ref]));
});

test("child allocations cannot oversubscribe their parent", () => {
  const c1 = makeBudget({ cpuMilliseconds: 60 }), c2 = makeBudget({ cpuMilliseconds: 60 });
  const c1ref = artifact("child_1", c1, "ComputeBudget"), c2ref = artifact("child_2", c2, "ComputeBudget");
  assert.throws(() => budget({ version: "0.1.0", scope, authorizationRef: authorization.ref, qualityTier: "tier_a", cpuMilliseconds: 100,
    gpuMilliseconds: 0, peakRamBytes: 1000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 1000, wallClockMilliseconds: 100,
    modelCalls: 2, renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0,
    childAllocations: [c1ref.ref, c2ref.ref], reservationPolicy: { artifact: policy.ref, pointer: "" } }, [...artifacts, c1ref, c2ref]));
});

test("non-hit Gate-1 outcomes remain unavailable without computation", () => {
  const key = `perception_computation_v1_${H}`;
  const states = [
    { status: "cache_miss", computationKey: key, missing: missing("not_computed", "no_exact_computation") },
    { status: "incompatible", computationKey: key, mismatches: ["identity.model"] },
    { status: "failed_artifact", computationKey: key, failure: missing("failed", "attempt_failed", [{ artifact: policy.ref, pointer: "" }]), failedAttemptRefs: [] },
    { status: "stale_or_retired", computationKey: key, producerState: "stale", evidence: policy.ref },
    { status: "unavailable", computationKey: key, missing: missing("unavailable", "output_missing") },
    { status: "unsupported", computationKey: key, missing: missing("unsupported", "producer_unsupported") },
  ] as const;
  for (const lookup of states) assert.equal(routePerception({ scope, lookup }).state, "unavailable");
});

test("failed and foreign guards cannot authorize a fresh attempt", () => {
  const f = freshFixture();
  const fail = artifact("failed_guard", { version: "0.1.0", scope, computationKey: f.lookup.computationKey, requestedCapability: "embedding",
    selection: f.selectionArtifact.ref, chosenProfile: f.profileArtifact.ref, reservation: f.reservationArtifact.ref,
    resourceRequirements: f.p.resourceRequirements, status: "fail", checkedAt: TIME, policy: { artifact: policy.ref, pointer: "" } }, "RoutingGuard");
  assert.equal(routePerception({ ...f.routeInput, guard: { scope, evidence: { artifact: fail.ref, pointer: "" }, status: "fail" },
    artifacts: [...f.routeInput.artifacts, fail] }).state, "unavailable");
  assert.throws(() => routePerception({ ...f.routeInput, guard: { scope: { ...scope, creatorId: "foreign" }, evidence: { artifact: fail.ref, pointer: "" }, status: "pass" } }));
});

test("CostTrace joins exact synthetic CostEvent, ModelRun, scope and selection", () => {
  const b = makeBudget(), p = makeProfile(), profileArtifact = artifact("profile_for_trace", p, "ModelProfile");
  const selection = selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget").ref,
    candidates: [{ profile: p, artifact: profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H }, [...artifacts, artifact("budget", b, "ComputeBudget"), profileArtifact]);
  const r = reserve({ scope, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget"), operationId: "operation_a", attempt: 1, allocation: b, activeReservations: [] }, artifacts);
  const telemetryScope = { projectId: scope.projectId, jobId: "job_a", creatorId: scope.creatorId, environment: "synthetic" as const };
  const run = { contractType: "ModelRun", schemaVersion: "1.0.0", runId: "run_a", scope: telemetryScope, provider: "provider", model: p.modelId,
    modelVersion: p.exactRevision, adapterVersion: p.adapter.version, operation: "embedding", inputIds: [], outputIds: [], startedAt: TIME, endedAt: TIME,
    status: "succeeded", errorCode: null };
  const event = { contractType: "CostEvent", schemaVersion: "1.0.0", eventId: "cost_a", scope: telemetryScope, occurredAt: TIME,
    operationId: "operation_a", attempt: 1, provider: "provider", tool: "adapter_a", model: p.modelId, modelRunId: run.runId,
    operation: "embedding", durationMilliseconds: 20, units: [{ unit: "operations", quantity: 1 }], costInrMicros: 30, costSource: "synthetic" };
  const runArtifact = artifact("run_artifact", run, "ModelRun", "1.0.0"), eventArtifact = artifact("cost_artifact", event, "CostEvent", "1.0.0");
  const supplied = [...new Map([...artifacts, artifact("budget", b, "ComputeBudget"), artifact("reservation", r, "Reservation"), profileArtifact,
    artifact("selection", selection, "ModelSelection"), runArtifact, eventArtifact, ...(reservationSupport.get(r.reservationId) ?? [])]
    .map(x => [x.ref.objectId, x])).values()];
  const body = { version: "0.1.0", scope, operationId: "operation_a", attempt: 1, parentOperation: missing("not_applicable", "root_operation"), telemetryScope: present(telemetryScope),
    computationKey: computationKey(makeIdentity()), selectionRef: present(artifact("selection", selection, "ModelSelection").ref), budgetRef: artifact("budget", b, "ComputeBudget").ref,
    projectedCost: present({ value: 30, unit: "inr_micros", evidence: { artifact: policy.ref, pointer: "" } }),
    expectedLatency: present({ value: 20, unit: "milliseconds", evidence: { artifact: policy.ref, pointer: "" } }),
    authorizedReservation: artifact("reservation", r, "Reservation").ref, observedLatency: present({ value: 21, unit: "milliseconds", method: "clock", observedAt: TIME, scope }),
    resourceObservations: missing("unavailable", "not_attributed"), costEventRef: present(eventArtifact.ref), modelRunRef: present(runArtifact.ref),
    outcome: "succeeded", reusedArtifact: missing("not_applicable", "not_reused"), originalAttempt: missing("not_applicable", "not_reused") };
  const trace = costTrace(body, supplied);
  assert.equal(costTrace(body, supplied).traceId, trace.traceId);
  assert.equal(Object.hasOwn(trace, "costInrMicros"), false);
  assert.throws(() => costTrace({ ...body, attempt: 2 }, supplied));
  assert.throws(() => costTrace({ ...body, scope: { ...scope, creatorId: "foreign" } }, supplied));
  const badEvent = artifact("bad_event", { ...event, costSource: "measured" }, "CostEvent", "1.0.0");
  assert.throws(() => costTrace({ ...body, costEventRef: present(badEvent.ref) }, [...supplied, badEvent]));
  assert.throws(() => costTrace({ ...body, outcome: "reused" }, supplied));
});

test("reuse CostTrace binds Gate-1 output and selected attempt without new inference", () => {
  const b = makeBudget(), r = reserve({ scope, budget: b, budgetArtifact: artifact("budget", b, "ComputeBudget"), operationId: "retrieve_a", attempt: 1, allocation: b, activeReservations: [] }, artifacts);
  const receipt = { receiptType: "PerceptionReuseReceipt", receiptVersion: "0.1.0", computationKey: computationKey(makeIdentity()),
    output: artifact("historical_output", {}).ref, selectedAttempt: artifact("historical_attempt", {}).ref, selection: artifact("historical_selection", {}).ref,
    scope, reuseStatus: "reused", modelRunCreated: false };
  const body = { version: "0.1.0", scope, operationId: "retrieve_a", attempt: 1, parentOperation: missing("not_applicable", "root_operation"), telemetryScope: missing("unavailable", "no_billing"),
    computationKey: receipt.computationKey, selectionRef: missing("not_applicable", "historical_selection_not_new"), budgetRef: artifact("budget", b, "ComputeBudget").ref,
    projectedCost: missing("unavailable", "unknown_retrieval_cost"), expectedLatency: missing("unavailable", "unknown_retrieval_latency"),
    authorizedReservation: artifact("reservation", r, "Reservation").ref, observedLatency: missing("not_computed", "not_measured"), resourceObservations: missing("unavailable", "not_attributed"),
    costEventRef: missing("unavailable", "no_current_billing"), modelRunRef: missing("not_applicable", "no_new_inference"), outcome: "reused",
    reusedArtifact: present(receipt.output), originalAttempt: present(receipt.selectedAttempt) };
  const supplied = [...new Map([...artifacts, artifact("budget", b, "ComputeBudget"), artifact("reservation", r, "Reservation"),
    ...(reservationSupport.get(r.reservationId) ?? [])].map(x => [x.ref.objectId, x])).values()];
  const trace = costTrace(body, supplied, receipt);
  assert.equal(trace.outcome, "reused");
  assert.equal(trace.modelRunRef.state, "not_applicable");
  assert.throws(() => costTrace({ ...body, originalAttempt: present(artifact("wrong_attempt", {}).ref) }, supplied, receipt));
});

function freshFixture(childAllocation?: ComputeBudget) {
  const childArtifact = childAllocation ? artifact("fresh_child", childAllocation, "ComputeBudget") : null;
  const b = childArtifact ? makeBudget({ childAllocations: [childArtifact.ref] }, [childArtifact]) : makeBudget(), p = makeProfile();
  const budgetArtifact = artifact("fresh_budget", b, "ComputeBudget");
  const profileArtifact = artifact("fresh_profile", p, "ModelProfile");
  const selection = selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b,
    budgetArtifact: budgetArtifact.ref, candidates: [{ profile: p, artifact: profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" },
    availabilitySnapshot: availabilitySnapshot.ref, policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H },
    [...artifacts, budgetArtifact, profileArtifact, ...(childArtifact ? [childArtifact] : [])]);
  const selectionArtifact = artifact("fresh_selection", selection, "ModelSelection");
  const r = reserve({ scope, budget: b, budgetArtifact, operationId: "operation_a", attempt: 1, allocation: childAllocation ?? b,
    ...(childArtifact ? { allocationArtifact: childArtifact } : {}), activeReservations: [] }, [...artifacts, ...(childArtifact ? [childArtifact] : [])]);
  const reservationArtifact = artifact("fresh_reservation", r, "Reservation");
  const identity = makeIdentity();
  const lookup = { status: "cache_miss" as const, computationKey: computationKey(identity), missing: missing("not_computed", "no_exact_computation") };
  const boundGuard = artifact("fresh_guard", { version: "0.1.0", scope, computationKey: lookup.computationKey, requestedCapability: "embedding",
    selection: selectionArtifact.ref, chosenProfile: profileArtifact.ref, reservation: reservationArtifact.ref,
    resourceRequirements: p.resourceRequirements, status: "pass", checkedAt: TIME, policy: { artifact: policy.ref, pointer: "" } }, "RoutingGuard");
  const routeInput = { scope, lookup, identity, budget: b, selection, reservation: r, activeReservations: [],
    budgetArtifact: budgetArtifact.ref, selectionArtifact: selectionArtifact.ref, reservationArtifact: reservationArtifact.ref,
    guard: { scope, evidence: { artifact: boundGuard.ref, pointer: "" }, status: "pass" as const },
    artifacts: [...new Map([...artifacts, budgetArtifact, profileArtifact, selectionArtifact, reservationArtifact, boundGuard,
      ...(childArtifact ? [childArtifact] : []),
      ...(reservationSupport.get(r.reservationId) ?? [])].map(x => [x.ref.objectId, x])).values()] };
  return { b, p, budgetArtifact, profileArtifact, selection, selectionArtifact, r, reservationArtifact, identity, lookup, routeInput };
}

test("owner A: exact compute authorization bounds every budget dimension", () => {
  const baseline = makeBudget();
  const bounded = artifact("bounded_compute_authorization", { version: "0.1.0", scope, grant: "compute", qualityTier: baseline.qualityTier,
    cpuMilliseconds: baseline.cpuMilliseconds, gpuMilliseconds: baseline.gpuMilliseconds, peakRamBytes: baseline.peakRamBytes,
    peakVramBytes: baseline.peakVramBytes, apiSpendInrMicros: baseline.apiSpendInrMicros, totalCostInrMicros: baseline.totalCostInrMicros,
    wallClockMilliseconds: baseline.wallClockMilliseconds, modelCalls: baseline.modelCalls, renderWork: baseline.renderWork,
    premiumOperations: baseline.premiumOperations, retryLimit: baseline.retryLimit, directorRevisionLimit: baseline.directorRevisionLimit,
    reservationPolicy: baseline.reservationPolicy }, "ComputeAuthorization");
  const { budgetId: _id, ...body } = baseline;
  for (const key of ["cpuMilliseconds", "gpuMilliseconds", "peakRamBytes", "peakVramBytes", "apiSpendInrMicros", "totalCostInrMicros", "wallClockMilliseconds", "modelCalls", "retryLimit", "directorRevisionLimit"] as const) {
    assert.throws(() => budget({ ...body, authorizationRef: bounded.ref, [key]: baseline[key] + 1 }, [...artifacts, bounded]), key);
  }
  for (const key of ["frames", "pixelFrames", "audioMilliseconds"] as const) {
    assert.throws(() => budget({ ...body, authorizationRef: bounded.ref, renderWork: { ...baseline.renderWork, [key]: baseline.renderWork[key] + 1 } }, [...artifacts, bounded]), key);
  }
  assert.throws(() => budget({ ...body, authorizationRef: bounded.ref, qualityTier: "tier_b" }, [...artifacts, bounded]));
});

test("owner B: immutable history blocks sequential cumulative overspend", () => {
  const allocation = makeBudget({ cpuMilliseconds: 60, totalCostInrMicros: 400 }), childRef = artifact("history_child", allocation, "ComputeBudget");
  const b = makeBudget({ childAllocations: [childRef.ref] }, [childRef]);
  const first = reserve({ scope, budget: b, operationId: "first", attempt: 1, allocation, allocationArtifact: childRef, activeReservations: [] }, [...artifacts, childRef]);
  const secondInput = { scope, budget: b, operationId: "second", attempt: 1, allocation, allocationArtifact: childRef, activeReservations: [], reservationHistory: [first] };
  assert.throws(() => reserve(secondInput, [...artifacts, childRef]));
});

test("owner B: child premium and retry/revision allowances aggregate, peaks remain concurrent", () => {
  const parent = makeBudget({ modelCalls: 2, premiumOperations: [{ capabilityId: "premium", allowed: true, maxCalls: 1 }], retryLimit: 1, directorRevisionLimit: 1 });
  const premiumChild = makeBudget({ cpuMilliseconds: 0, peakRamBytes: 0, modelCalls: 0, totalCostInrMicros: 0,
    premiumOperations: [{ capabilityId: "premium", allowed: true, maxCalls: 1 }], retryLimit: 0, directorRevisionLimit: 0 });
  const c1 = artifact("child_one", premiumChild, "ComputeBudget"), c2 = artifact("child_two", premiumChild, "ComputeBudget");
  const { budgetId: _id, ...body } = parent;
  assert.throws(() => budget({ ...body, childAllocations: [c1.ref, c2.ref] }, [...artifacts, c1, c2]));
  const retryChild = makeBudget({ cpuMilliseconds: 0, peakRamBytes: 0, modelCalls: 0, totalCostInrMicros: 0,
    premiumOperations: [], retryLimit: 1, directorRevisionLimit: 1 });
  const r1 = artifact("retry_one", retryChild, "ComputeBudget"), r2 = artifact("retry_two", retryChild, "ComputeBudget");
  assert.throws(() => budget({ ...body, childAllocations: [r1.ref, r2.ref] }, [...artifacts, r1, r2]));
  const peakOnly = makeBudget({ cpuMilliseconds: 0, modelCalls: 0, totalCostInrMicros: 0, retryLimit: 0, directorRevisionLimit: 0 });
  const p1 = artifact("peak_one", peakOnly, "ComputeBudget"), p2 = artifact("peak_two", peakOnly, "ComputeBudget");
  assert.doesNotThrow(() => budget({ ...body, childAllocations: [p1.ref, p2.ref] }, [...artifacts, p1, p2]));
});

test("owner B: reservation requires declared allocation and separates sequential peaks", () => {
  const b = makeBudget({ peakRamBytes: 1000, modelCalls: 2 });
  const child = makeBudget({ cpuMilliseconds: 40, peakRamBytes: 800 });
  assert.throws(() => reserve({ scope, budget: b, operationId: "undeclared", attempt: 1, allocation: child, activeReservations: [] }, artifacts));
  const childOne = makeBudget({ cpuMilliseconds: 40, peakRamBytes: 600, totalCostInrMicros: 100 });
  const childTwo = makeBudget({ cpuMilliseconds: 39, peakRamBytes: 600, totalCostInrMicros: 100 });
  const firstRef = artifact("peak_child_one", childOne, "ComputeBudget"), secondRef = artifact("peak_child_two", childTwo, "ComputeBudget");
  const parent = makeBudget({ peakRamBytes: 1000, modelCalls: 2, childAllocations: [firstRef.ref, secondRef.ref] }, [firstRef, secondRef]);
  const supplied = [...artifacts, firstRef, secondRef];
  const first = reserve({ scope, budget: parent, operationId: "first", attempt: 1, allocation: childOne, allocationArtifact: firstRef, activeReservations: [] }, supplied);
  assert.throws(() => reserve({ scope, budget: parent, operationId: "parallel", attempt: 1, allocation: childTwo, allocationArtifact: secondRef, activeReservations: [first] }, supplied));
  const sequential = { scope, budget: parent, operationId: "later", attempt: 1, allocation: childTwo, allocationArtifact: secondRef,
    activeReservations: [], reservationHistory: [first] };
  assert.doesNotThrow(() => reserve(sequential, supplied));
});

test("owner C: selected profile cannot be authorized by an undersized reservation", () => {
  const small = makeBudget({ cpuMilliseconds: 1, peakRamBytes: 1, totalCostInrMicros: 1, wallClockMilliseconds: 1 });
  const f = freshFixture(small);
  const result = routePerception(f.routeInput);
  assert.equal(result.state, "unavailable");
});

test("owner D: generic or mismatched guard cannot authorize an exact attempt", () => {
  const f = freshFixture();
  assert.throws(() => routePerception({ ...f.routeInput, guard: { scope, evidence: { artifact: guard.ref, pointer: "" }, status: "pass" } }));
  for (const change of [{ computationKey: `perception_computation_v1_${"b".repeat(64)}` }, { selection: artifact("other_selection", {}).ref },
    { chosenProfile: artifact("other_profile", {}).ref }, { reservation: artifact("other_reservation", {}).ref }]) {
    const evidence = artifact("mismatch_guard", { version: "0.1.0", scope, computationKey: f.lookup.computationKey, requestedCapability: "embedding",
      selection: f.selectionArtifact.ref, chosenProfile: f.profileArtifact.ref, reservation: f.reservationArtifact.ref,
      resourceRequirements: f.p.resourceRequirements, status: "pass", checkedAt: TIME, policy: { artifact: policy.ref, pointer: "" }, ...change }, "RoutingGuard");
    const result = routePerception({ ...f.routeInput, guard: { scope, evidence: { artifact: evidence.ref, pointer: "" }, status: "pass" }, artifacts: [...f.routeInput.artifacts, evidence] });
    assert.equal(result.state, "unavailable");
  }
});

test("owner D: availability for model A cannot make model B available", () => {
  const b = makeBudget(), p = makeProfile({ modelId: "model_b" }), pRef = artifact("profile_b", p, "ModelProfile");
  const s = selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: b,
    budgetArtifact: artifact("budget", b, "ComputeBudget").ref, candidates: [{ profile: p, artifact: pRef.ref }], evaluation: { artifact: evaluation.ref, pointer: "" },
    availabilitySnapshot: availabilitySnapshot.ref, policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H },
    [...artifacts, artifact("budget", b, "ComputeBudget"), pRef]);
  assert.equal(s.chosen.state, "unavailable");
});

test("owner E: requirement and evaluation are distinct exact evidence", () => {
  const f = freshFixture();
  const requirement = artifact("alternate_quality_requirement", { version: "0.1.0", scope, capability: "embedding", qualityTier: "tier_a", policy: { artifact: policy.ref, pointer: "" } }, "QualityRequirement");
  const input = { scope, capability: "embedding", qualityRequirement: { artifact: requirement.ref, pointer: "" }, budget: f.b, budgetArtifact: f.budgetArtifact.ref,
    candidates: [{ profile: f.p, artifact: f.profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H };
  const selected = selectModel(input, [...f.routeInput.artifacts, requirement]);
  assert.equal(selected.chosen.state, "present");
  const wrongTier = artifact("wrong_tier_requirement", { version: "0.1.0", scope, capability: "embedding", qualityTier: "tier_b", policy: { artifact: policy.ref, pointer: "" } }, "QualityRequirement");
  assert.throws(() => selectModel({ ...input, qualityRequirement: { artifact: wrongTier.ref, pointer: "" } }, [...f.routeInput.artifacts, wrongTier]));
});

test("owner E: generic evaluation grant cannot attest arbitrary model eligibility", () => {
  const f = freshFixture(), p = makeProfile({ modelId: "model_c" });
  const forgedEvaluation = artifact("forged_evaluation", { version: "0.1.0", scope, authorizationRef: evaluationAuthorization.ref, qualityTier: "tier_a",
    eligibleModels: [{ modelId: "model_c", exactRevision: H, adapterId: "adapter_a", adapterVersion: "1.0.0", implementationDigest: H, capability: "embedding" }] }, "ModelEvaluation");
  const c = makeProfile({ modelId: "model_c", qualityEvidence: present(forgedEvaluation.ref) }, [forgedEvaluation]);
  assert.throws(() => selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: f.b,
    budgetArtifact: f.budgetArtifact.ref, candidates: [{ profile: c, artifact: artifact("profile_c", c, "ModelProfile").ref }],
    evaluation: { artifact: forgedEvaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref, policy: { artifact: policy.ref, pointer: "" },
    fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H }, [...f.routeInput.artifacts, forgedEvaluation, artifact("profile_c", c, "ModelProfile")]));
  assert.ok(p.profileId);
});

test("owner F: exact authorization joins reject generic type, wrong version and digest", () => {
  const f = freshFixture();
  const base = { scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: f.b, budgetArtifact: f.budgetArtifact.ref,
    candidates: [{ profile: f.p, artifact: f.profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" }, availabilitySnapshot: availabilitySnapshot.ref,
    policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" }, inputViewDigest: H };
  const generic = artifact("generic_profile", f.p);
  assert.throws(() => selectModel({ ...base, candidates: [{ profile: f.p, artifact: generic.ref }] }, [...f.routeInput.artifacts, generic]));
  const wrongVersion = artifact("wrong_budget_version", f.b, "ComputeBudget", "9.9.9");
  assert.throws(() => selectModel({ ...base, budgetArtifact: wrongVersion.ref }, [...f.routeInput.artifacts, wrongVersion]));
  assert.throws(() => selectModel({ ...base, budgetArtifact: { ...f.budgetArtifact.ref, sha256: "b".repeat(64) } }, f.routeInput.artifacts));
});

test("owner F: schema-valid but unauthorized budget cannot pass a consumer", () => {
  const f = freshFixture(), denied = artifact("denied_authorization", { scope, grant: "none" });
  const { budgetId: _id, ...body } = f.b;
  const forged = identify("routing_budget_v1", "budgetId", { ...body, authorizationRef: denied.ref });
  const forgedArtifact = artifact("forged_budget", forged, "ComputeBudget");
  assert.throws(() => reserve({ scope, budget: forged, operationId: "forged", attempt: 1, allocation: forged, activeReservations: [] }, [...artifacts, denied, forgedArtifact]));
  assert.throws(() => selectModel({ scope, capability: "embedding", qualityRequirement: { artifact: qualityRequirement.ref, pointer: "" }, budget: forged,
    budgetArtifact: forgedArtifact.ref, candidates: [{ profile: f.p, artifact: f.profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" },
    availabilitySnapshot: availabilitySnapshot.ref, policy: { artifact: policy.ref, pointer: "" }, fallbackEscalationPolicy: { artifact: policy.ref, pointer: "" },
    inputViewDigest: H }, [...f.routeInput.artifacts, denied, forgedArtifact]));
});

test("owner state: reuse ignores irrelevant fresh arguments; unavailable has no trusted authorization", () => {
  const f = freshFixture();
  const receipt = { receiptType: "PerceptionReuseReceipt" as const, receiptVersion: "0.1.0" as const, computationKey: f.lookup.computationKey,
    output: artifact("reused_output", {}).ref, selectedAttempt: artifact("old_attempt", {}).ref, selection: artifact("old_selection", {}).ref,
    scope, reuseStatus: "reused" as const, modelRunCreated: false as const };
  const reused = routePerception({ ...f.routeInput, lookup: { status: "cache_hit", computationKey: receipt.computationKey, output: receipt.output, receipt } });
  assert.equal(reused.budgetId.state, "not_applicable");
  assert.equal(reused.selectionId.state, "not_applicable");
  assert.equal(reused.reservationId.state, "not_applicable");
  const { guard: _unusedGuard, ...withoutGuard } = f.routeInput;
  const unavailable = routePerception(withoutGuard);
  assert.equal(unavailable.budgetId.state, "unavailable");
  assert.equal(unavailable.selectionId.state, "unavailable");
  assert.equal(unavailable.reservationId.state, "unavailable");
  const fresh = routePerception(f.routeInput);
  assert.equal(fresh.state, "fresh_compute_authorized");
  assert.ok(Object.hasOwn(fresh, "budgetRef") && Object.hasOwn(fresh, "selectionRef") && Object.hasOwn(fresh, "reservationRef") && Object.hasOwn(fresh, "chosenProfile"));
});

test("owner G: CostTrace rejects unrelated public operations and contradictory estimates", () => {
  const f = freshFixture();
  const telemetryScope = { projectId: scope.projectId, jobId: "job_a", creatorId: scope.creatorId, environment: "synthetic" as const };
  const event = { contractType: "CostEvent", schemaVersion: "1.0.0", eventId: "cost_wrong_operation", scope: telemetryScope, occurredAt: TIME,
    operationId: "operation_a", attempt: 1, provider: "provider", tool: "adapter_a", model: f.p.modelId, modelRunId: null,
    operation: "speech", durationMilliseconds: 20, units: [{ unit: "operations", quantity: 1 }], costInrMicros: 30, costSource: "synthetic" };
  const run = { contractType: "ModelRun", schemaVersion: "1.0.0", runId: "run_wrong_operation", scope: telemetryScope, provider: "provider",
    model: f.p.modelId, modelVersion: f.p.exactRevision, adapterVersion: f.p.adapter.version, operation: "speech", inputIds: [], outputIds: [],
    startedAt: TIME, endedAt: TIME, status: "succeeded", errorCode: null };
  const eventRef = artifact("wrong_operation_event", event, "CostEvent", "1.0.0");
  const runRef = artifact("wrong_operation_run", run, "ModelRun", "1.0.0");
  const body = { version: "0.1.0", scope, operationId: "operation_a", attempt: 1, parentOperation: missing("not_applicable", "root_operation"),
    telemetryScope: present(telemetryScope), computationKey: f.lookup.computationKey, selectionRef: present(f.selectionArtifact.ref),
    budgetRef: f.budgetArtifact.ref, projectedCost: present({ value: 30, unit: "inr_micros", evidence: { artifact: policy.ref, pointer: "" } }),
    expectedLatency: present({ value: 20, unit: "milliseconds", evidence: { artifact: policy.ref, pointer: "" } }),
    authorizedReservation: f.reservationArtifact.ref, observedLatency: missing("not_computed", "no_observation"),
    resourceObservations: missing("unavailable", "no_observation"), costEventRef: present(eventRef.ref), modelRunRef: missing("unavailable", "no_run"),
    outcome: "succeeded", reusedArtifact: missing("not_applicable", "not_reused"), originalAttempt: missing("not_applicable", "not_reused") };
  const supplied = [...f.routeInput.artifacts, eventRef, runRef];
  for (const operation of ["speech", "rendering", "qc"] as const) {
    const wrong = artifact(`event_${operation}`, { ...event, eventId: `cost_${operation}`, operation }, "CostEvent", "1.0.0");
    assert.throws(() => costTrace({ ...body, costEventRef: present(wrong.ref) }, [...supplied, wrong]));
  }
  assert.throws(() => costTrace({ ...body, costEventRef: missing("unavailable", "no_billing"), modelRunRef: present(runRef.ref) }, supplied));
  assert.throws(() => costTrace({ ...body, costEventRef: missing("unavailable", "no_billing"),
    projectedCost: present({ value: 999, unit: "inr_micros", evidence: { artifact: policy.ref, pointer: "" } }) }, supplied));
  assert.throws(() => costTrace({ ...body, costEventRef: missing("unavailable", "no_billing"),
    expectedLatency: present({ value: 999, unit: "milliseconds", evidence: { artifact: policy.ref, pointer: "" } }) }, supplied));
  const noSelectedModel = artifact("event_missing_selected_model", { ...event, eventId: "cost_missing_model", operation: "embedding", model: null }, "CostEvent", "1.0.0");
  assert.throws(() => costTrace({ ...body, costEventRef: present(noSelectedModel.ref) }, [...supplied, noSelectedModel]));
  const failedRun = artifact("failed_run_on_success_trace", { ...run, operation: "embedding", status: "failed", errorCode: "model_failed" }, "ModelRun", "1.0.0");
  assert.throws(() => costTrace({ ...body, costEventRef: missing("unavailable", "no_billing"), modelRunRef: present(failedRun.ref) }, [...supplied, failedRun]));
});

test("owner G: reuse cannot attach an inference CostEvent", () => {
  const f = freshFixture();
  const telemetryScope = { projectId: scope.projectId, jobId: "job_a", creatorId: scope.creatorId, environment: "synthetic" as const };
  const receipt = { receiptType: "PerceptionReuseReceipt", receiptVersion: "0.1.0", computationKey: f.lookup.computationKey,
    output: artifact("historical_output", {}).ref, selectedAttempt: artifact("historical_attempt", {}).ref,
    selection: artifact("historical_selection", {}).ref, scope, reuseStatus: "reused", modelRunCreated: false };
  const event = { contractType: "CostEvent", schemaVersion: "1.0.0", eventId: "inference_charge", scope: telemetryScope, occurredAt: TIME,
    operationId: "operation_a", attempt: 1, provider: "provider", tool: "adapter_a", model: f.p.modelId, modelRunId: null,
    operation: "embedding", durationMilliseconds: 20, units: [{ unit: "operations", quantity: 1 }], costInrMicros: 30, costSource: "synthetic" };
  const eventRef = artifact("inference_charge_artifact", event, "CostEvent", "1.0.0");
  const body = { version: "0.1.0", scope, operationId: "operation_a", attempt: 1, parentOperation: missing("not_applicable", "root_operation"),
    telemetryScope: present(telemetryScope), computationKey: f.lookup.computationKey, selectionRef: missing("not_applicable", "historical_selection"),
    budgetRef: f.budgetArtifact.ref, projectedCost: missing("unavailable", "no_projection"), expectedLatency: missing("unavailable", "no_projection"),
    authorizedReservation: f.reservationArtifact.ref, observedLatency: missing("not_computed", "no_measurement"), resourceObservations: missing("unavailable", "no_measurement"),
    costEventRef: present(eventRef.ref), modelRunRef: missing("not_applicable", "no_new_inference"), outcome: "reused",
    reusedArtifact: present(receipt.output), originalAttempt: present(receipt.selectedAttempt) };
  assert.throws(() => costTrace(body, [...f.routeInput.artifacts, eventRef], receipt));
  assert.equal(costTrace({ ...body, costEventRef: missing("unavailable", "no_current_billing") }, f.routeInput.artifacts, receipt).outcome, "reused");
});

test("self-review: one child allocation cannot authorize two cumulative reservations", () => {
  const child = makeBudget({ cpuMilliseconds: 40, totalCostInrMicros: 100 }), childRef = artifact("repeat_child", child, "ComputeBudget");
  const b = makeBudget({ modelCalls: 2, childAllocations: [childRef.ref] }, [childRef]);
  const supplied = [...artifacts, childRef];
  const first = reserve({ scope, budget: b, operationId: "first", attempt: 1, allocation: child, allocationArtifact: childRef }, supplied);
  assert.throws(() => reserve({ scope, budget: b, operationId: "second", attempt: 1, allocation: child, allocationArtifact: childRef,
    reservationHistory: [first] }, supplied));
});

test("self-review: history must replay every prior reservation rather than trust its schema", () => {
  const c1 = makeBudget({ cpuMilliseconds: 40, totalCostInrMicros: 100 });
  const c2 = makeBudget({ cpuMilliseconds: 39, totalCostInrMicros: 100 });
  const a1 = artifact("history_child_one", c1, "ComputeBudget"), a2 = artifact("history_child_two", c2, "ComputeBudget");
  const b = makeBudget({ modelCalls: 2, childAllocations: [a1.ref, a2.ref] }, [a1, a2]);
  const supplied = [...artifacts, a1, a2];
  const first = reserve({ scope, budget: b, operationId: "first", attempt: 1, allocation: c1, allocationArtifact: a1 }, supplied);
  const { reservationId: _id, ...body } = first;
  const forged = identify("routing_reservation_v1", "reservationId", { ...body, cpuMilliseconds: 1 });
  assert.throws(() => reserve({ scope, budget: b, operationId: "second", attempt: 1, allocation: c2, allocationArtifact: a2,
    reservationHistory: [forged] }, [...supplied, ...(reservationSupport.get(first.reservationId) ?? [])]));
});

test("self-review: strict routing reader rejects fresh semantic IDs in reuse and unavailable states", () => {
  const f = freshFixture(), receipt = { receiptType: "PerceptionReuseReceipt" as const, receiptVersion: "0.1.0" as const,
    computationKey: f.lookup.computationKey, output: artifact("old_output", {}).ref, selectedAttempt: artifact("old_attempt", {}).ref,
    selection: artifact("old_selection", {}).ref, scope, reuseStatus: "reused" as const, modelRunCreated: false as const };
  const reused = routePerception({ ...f.routeInput, lookup: { status: "cache_hit", computationKey: receipt.computationKey, output: receipt.output, receipt } });
  const { decisionId: _reuseId, ...reuseBody } = reused;
  assert.throws(() => RoutingDecisionSchema.parse(identify("routing_decision_v1", "decisionId", { ...reuseBody, budgetId: present(f.b.budgetId) })));
  const { guard: _guard, ...withoutGuard } = f.routeInput;
  const unavailable = routePerception(withoutGuard);
  const { decisionId: _unavailableId, ...unavailableBody } = unavailable;
  assert.throws(() => RoutingDecisionSchema.parse(identify("routing_decision_v1", "decisionId", { ...unavailableBody, selectionId: present(f.selection.selectionId) })));
});
