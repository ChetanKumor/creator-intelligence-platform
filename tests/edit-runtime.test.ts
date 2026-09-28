import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { DecisionEventSchema, JobStateSchema, QCResultSchema, RenderResultSchema, UniversalEditPlanSchema } from "../packages/contracts/index.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify, type SuppliedArtifact } from "../packages/editorial/common.js";
import { supplied } from "../packages/edit-graph/index.js";
import { reserve } from "../packages/routing/index.js";
import type { ExecutionDag } from "../packages/edit-execution/index.js";
import { AttemptRegistrationSchema, ClaimOwnership, DispatchCapabilityRecheckSchema, DispatchPreparationSchema, DispatchRuntimeRecheckSchema, EDIT_RUNTIME_ERROR_CODES,
  EditRuntimeError, ExecutionClaimSchema, MAX_RUNTIME_ARTIFACTS, MAX_RUNTIME_RECORD_BYTES, MAX_STAGED_SOURCE_BYTES, PreparedStagedSourceHandle, RUNTIME_IMPLEMENTATION, STAGING_CHUNK_BYTES,
  SourceLifecycleObservationSchema, StagedSourceReceiptSchema, ValidatedExecutionDag, acquireExecutionClaim,
  attemptSlot, confirmDispatchPreparationCurrent, observeAttemptRegistration, observeExecutionClaim, observeSourceLifecycle, openValidatedDag, ownedKey, prepareDispatch,
  recheckDispatchCapability, recheckDispatchRuntime, registerAttempt, registerDagAttempt, replayDispatchPreparation, stageClaimedSource, stagedObjectIdOf, timestampAt,
  type ByteReader, type CapabilityRecheckRequest, type CapabilityRecheckResponse, type CapabilityRechecker, type DispatchCapabilityRecheck, type DispatchPreparation,
  type DispatchPreparationRequest, type DispatchRuntimeRecheck, type EditRuntime, type ExecutionClaim, type LifecycleProvider, type RuntimeCall, type RuntimeDispatchPolicy,
  type RuntimeRecheckRequest, type RuntimeRecheckResponse, type RuntimeRechecker, type SourceLifecycleObservation, type SourceLocator,
  type StagedSourceReceipt } from "../packages/edit-runtime/index.js";
import * as runtimeCore from "../packages/edit-runtime/index.js";
import * as runtimeAdapter from "../scripts/edit-runtime-local.js";
import { systemRuntimeClock, systemRuntimeEntropy, type LocalEditRuntime } from "../scripts/edit-runtime-local.js";
import { artifact, graphOf, plan, planningFixture, scope } from "./support/edit-graph.js";
import { chainFixture, orderedSourcesPolicy } from "./support/edit-execution-chains.js";
import { HALF_LIMITS, OPERATION, T7, admissionOf, budgetChain, dagOf, graphSources, mergeArtifacts, type DagFixture } from "./support/edit-execution.js";
import { runtimeChainFixture } from "./support/edit-runtime-chains.js";
import { RUNTIME_EVIDENCE, RUNTIME_START, SYNTHETIC_CAPABILITY_CHECKER, SYNTHETIC_OBSERVER, SYNTHETIC_RUNTIME_CHECKER, SyntheticCapabilityRechecker, SyntheticLifecycleProvider,
  SyntheticRuntimeRechecker, deterministicBytes, dispatchPolicy, forkReservation, runtimeEnv, sha256Hex, type EnvSource, type RuntimeEnv,
  type RuntimeEnvOptions } from "./support/edit-runtime.js";

// ---------------------------------------------------------------- helpers
async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    assert.ok(error instanceof EditRuntimeError, `expected an owned EditRuntimeError, received ${String(error)}`);
    assert.ok((EDIT_RUNTIME_ERROR_CODES as readonly string[]).includes(error.code), error.code);
    return error.code;
  }
  assert.fail("expected an owned EditRuntimeError");
}
const codeOf = (reason: unknown): string => reason instanceof EditRuntimeError ? reason.code : `foreign:${String(reason)}`;
const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
/** Coordinated forgery: mutate a copy, then recompute its own content identity so only semantic checks can object. */
function reidentify<T extends object>(value: T, key: string, namespace: string, mutate: (copy: T) => void = () => {}): T {
  const copy = structuredClone(value);
  mutate(copy);
  const body = { ...copy } as Record<string, unknown>;
  delete body[key];
  return identify(namespace, key, body) as unknown as T;
}
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) allKeys(item, keys);
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); allKeys(child, keys); }
  return keys;
}
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}
const sha256File = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
/** A field that would hold a location or an invocation (`renderProfile` names a profile artifact, not a file). */
const locationKey = (key: string) => /(path|url|uri|command|argv|filename)$/i.test(key) || /^(file|args|filter|filters)$/i.test(key);
const text = (value: string) => new TextEncoder().encode(value);
/** A persisted record is exactly its canonical JSON plus one newline. */
const persisted = (value: unknown) => `${canonicalSerialize(value)}\n`;
function registrationPath(runtime: LocalEditRuntime, attemptSlotId: string) { return join(runtime.layout.attemptRegistrations, `${ownedKey(attemptSlotId, "execution_attempt_slot_v0")}.json`); }
function claimPath(runtime: LocalEditRuntime, claimTargetId: string) { return join(runtime.layout.executionClaims, `${ownedKey(claimTargetId, "execution_claim_target_v0")}.json`); }
function stagedPath(runtime: LocalEditRuntime, stagedObjectId: string) { return join(runtime.layout.stagedObjects, `${ownedKey(stagedObjectId, "staged_source_object_v0")}.bin`); }
const FAR_FUTURE = "2027-10-29T01:10:00.000Z";

// ---------------------------------------------------------------- real test bytes and replay-valid Batch-1 chains over them
const SIZE_A = 2_621_443, SIZE_B1 = 1_500_007, SIZE_B2 = 900_001;
const bytesA = () => memo("bytes_a", () => deterministicBytes("gate7-batch2a-source-a", SIZE_A));
const hashA = () => memo("hash_a", () => sha256Hex(bytesA()));
const assetA = () => `asset_${hashA()}`;
const bytesB1 = () => memo("bytes_b1", () => deterministicBytes("gate7-batch2a-source-b1", SIZE_B1));
const bytesB2 = () => memo("bytes_b2", () => deterministicBytes("gate7-batch2a-source-b2", SIZE_B2));
const bytesByAsset = () => memo("bytes_by_asset", () => new Map([[assetA(), bytesA()], [`asset_${sha256Hex(bytesB1())}`, bytesB1()], [`asset_${sha256Hex(bytesB2())}`, bytesB2()]]));
const graphA = () => memo("graph_a", () => graphOf(plan(planningFixture({}, runtimeChainFixture([{ key: "real_a", hash: hashA(), sizeBytes: SIZE_A }])))));
const finalA = () => memo("final_a", () => dagOf(admissionOf(graphA())));
const previewA = () => memo("preview_a", () => dagOf(admissionOf(graphA(), { intent: "preview" })));
/** A final re-grant over the same reservation attempt: another grant, admission and render computation, the same claim target. */
const regrantA = () => memo("regrant_a", () => dagOf(admissionOf(graphA(), { grant: { issuedAt: "2026-09-24T00:59:00.000Z" } })));
const MEDIA_EXPIRES = "2026-09-24T01:30:00.000Z";
const expiringA = () => memo("expiring_a", () => dagOf(admissionOf(graphA(), { mediaGrant: { expiresAt: MEDIA_EXPIRES } })));
/** Fork B: the same budget, allocation, operation and attempt as the default chain, reserved from another immutable history. */
const forkB = () => memo("fork_b", () => forkReservation(budgetChain(), "gate7b_fork_b"));
const forkBDag = () => memo("fork_b_dag", () => dagOf(admissionOf(graphA(), { budgetRefs: { reservation: forkB().artifact.ref }, extra: forkB().artifacts })));
const twoGraph = () => memo("graph_two", () => graphOf(plan(planningFixture(orderedSourcesPolicy(4, 2), runtimeChainFixture([
  { key: "real_b1", hash: sha256Hex(bytesB1()), sizeBytes: SIZE_B1 }, { key: "real_b2", hash: sha256Hex(bytesB2()), sizeBytes: SIZE_B2 }])))));
const twoDag = () => memo("two_dag", () => dagOf(admissionOf(twoGraph())));
const validated = (x: DagFixture) => memo(`validated_${x.dag.dagId}`, () => openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts));
const vFinalA = () => validated(finalA());

// ---------------------------------------------------------------- runtime flows (isolated temporary roots, removed after each test)
function sourcesOf(v: ValidatedExecutionDag): EnvSource[] {
  return v.admission.sources.map((s, i) => ({ assetId: s.assetId, bytes: bytesByAsset().get(s.assetId)!, name: `take_${i}.bin` }));
}
async function envFor(t: TestContext, v: ValidatedExecutionDag = vFinalA(), options: RuntimeEnvOptions = {}): Promise<RuntimeEnv> {
  const env = await runtimeEnv({ sources: sourcesOf(v), ...options });
  t.after(env.cleanup);
  return env;
}
interface Claimed { env: RuntimeEnv; x: DagFixture; v: ValidatedExecutionDag; claim: ExecutionClaim; ownership: ClaimOwnership; call: RuntimeCall }
async function claimIn(env: RuntimeEnv, x: DagFixture, workerId = "worker_a"): Promise<Claimed> {
  const v = validated(x);
  await registerDagAttempt(v, x.artifacts, env.runtime);
  const { claim, ownership } = await acquireExecutionClaim(v, { workerId }, env.runtime);
  return { env, x, v, claim, ownership, call: { dag: v, runtime: env.runtime, ownership, artifacts: mergeArtifacts(x.artifacts, RUNTIME_EVIDENCE) } };
}
async function claimed(t: TestContext, x: DagFixture = finalA(), options: RuntimeEnvOptions = {}): Promise<Claimed> {
  return claimIn(await envFor(t, validated(x), options), x);
}
async function stageAll(c: Claimed): Promise<StagedSourceReceipt[]> {
  const staged: StagedSourceReceipt[] = [];
  for (const source of c.v.admission.sources) staged.push(await stageClaimedSource(c.call, { assetId: source.assetId }));
  return staged;
}
interface Evidence { staged: StagedSourceReceipt[]; lifecycle: SourceLifecycleObservation[]; capability: DispatchCapabilityRecheck; runtimeCheck: DispatchRuntimeRecheck;
  policy: RuntimeDispatchPolicy }
interface Providers { lifecycle?: LifecycleProvider; capability?: CapabilityRechecker; runtime?: RuntimeRechecker; policy?: RuntimeDispatchPolicy }
/** Post-stage lifecycle, then post-claim capability and runtime rechecks, each strictly after the claim, on the runtime clock. */
async function recheckAll(c: Claimed, staged: StagedSourceReceipt[], o: Providers = {}): Promise<Evidence> {
  c.env.clock.advance(250);
  const lifecycle: SourceLifecycleObservation[] = [];
  for (const s of staged) lifecycle.push(await observeSourceLifecycle(c.call, { stagedSource: s, provider: o.lifecycle ?? new SyntheticLifecycleProvider() }));
  c.env.clock.advance(250);
  const capability = await recheckDispatchCapability(c.call, { checker: o.capability ?? new SyntheticCapabilityRechecker() });
  const runtimeCheck = await recheckDispatchRuntime(c.call, { checker: o.runtime ?? new SyntheticRuntimeRechecker() });
  c.env.clock.advance(250);
  return { staged, lifecycle, capability, runtimeCheck, policy: o.policy ?? dispatchPolicy() };
}
async function evidence(c: Claimed, o: Providers = {}): Promise<Evidence> { return recheckAll(c, await stageAll(c), o); }
interface PrepPatch { staged?: SuppliedArtifact[]; lifecycle?: SuppliedArtifact[]; capability?: SuppliedArtifact; runtime?: SuppliedArtifact; policy?: SuppliedArtifact;
  extra?: SuppliedArtifact[]; call?: Partial<RuntimeCall> }
function prep(c: Claimed, e: Evidence, patch: PrepPatch = {}): { call: RuntimeCall; request: DispatchPreparationRequest } {
  const staged = patch.staged ?? e.staged.map(s => supplied(s, s.stagedSourceReceiptId));
  const lifecycle = patch.lifecycle ?? e.lifecycle.map(l => supplied(l, l.observationId));
  const capability = patch.capability ?? supplied(e.capability, e.capability.recheckId);
  const runtimeCheck = patch.runtime ?? supplied(e.runtimeCheck, e.runtimeCheck.recheckId);
  const policy = patch.policy ?? supplied(e.policy, e.policy.policyId);
  const artifacts = mergeArtifacts(patch.extra ?? [], c.call.artifacts, staged, lifecycle, [capability, runtimeCheck, policy]);
  return { call: { ...c.call, artifacts, ...patch.call }, request: { policy: policy.ref, stagedSources: staged.map(a => a.ref),
    lifecycleObservations: lifecycle.map(a => a.ref), capabilityRecheck: capability.ref, runtimeRecheck: runtimeCheck.ref } };
}
async function prepared(c: Claimed, o: Providers = {}) {
  const e = await evidence(c, o), p = prep(c, e);
  return { e, p, result: await prepareDispatch(p.call, p.request) };
}
/** Replaces the source port for one call: the same real adapter underneath, with observation or fault injection at the port boundary. */
function withSources(runtime: EditRuntime, sources: SourceLocator): EditRuntime { return { ...runtime, sources }; }
function wrapReader(reader: ByteReader, onRead: (chunk: Uint8Array, position: number, call: number) => Promise<void> | void): ByteReader {
  let calls = 0;
  return { sizeBytes: reader.sizeBytes, close: () => reader.close(),
    read: async (target, position) => { const n = await reader.read(target, position); calls += 1; await onRead(target.slice(0, n), position, calls); return n; } };
}
const forgeObservation = (o: SourceLifecycleObservation, mutate: (copy: SourceLifecycleObservation) => void) =>
  reidentify(o, "observationId", "source_lifecycle_observation_v0", mutate);
const forgeCapability = (r: DispatchCapabilityRecheck, mutate: (copy: DispatchCapabilityRecheck) => void) => reidentify(r, "recheckId", "dispatch_capability_recheck_v0", mutate);
const forgeRuntime = (r: DispatchRuntimeRecheck, mutate: (copy: DispatchRuntimeRecheck) => void) => reidentify(r, "recheckId", "dispatch_runtime_recheck_v0", mutate);
const forgePreparation = (p: DispatchPreparation, mutate: (copy: DispatchPreparation) => void) => reidentify(p, "preparationId", "dispatch_preparation_v0", mutate);
/** A coherent timestamp forgery: every instant a check record carries (its start, observation and completion, when present) moves together. */
function retime(record: { observedAt: string }, at: string): void {
  const fields = record as unknown as Record<string, unknown>;
  for (const key of ["checkStartedAt", "observedAt", "checkCompletedAt"]) if (key === "observedAt" || key in fields) fields[key] = at;
}
function resealDag(dag: ExecutionDag, mutate: (copy: ExecutionDag) => void, recomputeTarget = true): SuppliedArtifact {
  const copy = structuredClone(dag);
  mutate(copy);
  if (recomputeTarget) {
    const { claimTargetId: _target, ...target } = copy.dispatch.claimTarget;
    copy.dispatch.claimTarget = identify("execution_claim_target_v0", "claimTargetId", target) as ExecutionDag["dispatch"]["claimTarget"];
  }
  const resealed = reidentify(copy, "dagId", "execution_dag_v0");
  return supplied(resealed, `forged_${resealed.dagId.slice(-16)}`);
}

// ================================================================ 1-3 baseline and replay
test("01 the accepted Batch-1 ExecutionDag replays before any runtime work and stays not_claimed", () => {
  const x = finalA(), v = vFinalA();
  assert.ok(ValidatedExecutionDag.is(v));
  assert.deepEqual(v.dagRef, x.dagArtifact.ref);
  assert.deepEqual(v.dag, x.dag);
  assert.deepEqual(v.admission, x.admission);
  assert.equal(v.dag.dispatch.state, "not_claimed");
  assert.equal(v.dag.dispatch.requirement, "atomic_runtime_claim_required");
  assert.equal(v.dag.dispatch.claimTarget.reservationId, x.admission.budget.reservationId);
  assert.deepEqual(v.slot, attemptSlot({ projectId: scope.projectId, creatorId: scope.creatorId, operationId: OPERATION, attempt: 1 }));
  assert.equal(v.mediaGrants.length, 1);
});

test("02 a mutated or re-identified DAG gains no runtime authority, and an unvalidated DAG is never accepted", async t => {
  const x = finalA();
  const renderRelabel = resealDag(x.dag, d => { d.dispatch.renderBinding.renderComputationId = `render_computation_identity_v0_${"0".repeat(64)}`; });
  assert.equal(await refusal(() => openValidatedDag({ dag: renderRelabel.ref }, [...x.artifacts, renderRelabel])), "execution_dag_invalid");
  assert.equal(await refusal(() => openValidatedDag({ dag: x.admissionArtifact.ref }, x.artifacts)), "execution_dag_invalid");
  assert.equal(await refusal(() => openValidatedDag({ dag: { ...x.dagArtifact.ref, sha256: "0".repeat(64) } }, x.artifacts)), "execution_dag_invalid");
  const env = await envFor(t);
  const copied = { ...vFinalA() } as unknown as ValidatedExecutionDag;
  assert.equal(ValidatedExecutionDag.is(copied), false);
  assert.equal(await refusal(() => registerDagAttempt(copied, x.artifacts, env.runtime)), "execution_dag_invalid");
  assert.equal(await refusal(() => acquireExecutionClaim(copied, { workerId: "worker_a" }, env.runtime)), "execution_dag_invalid");
  assert.deepEqual(await readdir(env.runtime.layout.attemptRegistrations), []);
});

const ACCEPTED_SURFACES = [
  ["packages/edit-execution/admission.ts", "548b0248bffa51887e9f38155d5e5a30e1712a5146af04fdfe097da30e3ab972"],
  ["packages/edit-execution/common.ts", "f45a6e3a81303f3609c3a01918881e3da2eabe4a3682794f49237b0af5d69e3e"],
  ["packages/edit-execution/dag.ts", "22f6fe539f935f7054e67c2e4a54cf84f4781eb09c96276a71c3563984ea86d7"],
  ["packages/edit-execution/grant.ts", "5b2c53676327f5c353a4aedfc6f0017ee009ced11d3d11539850c5d8da004828"],
  ["packages/edit-execution/index.ts", "d1e0ec87c18ac77457f1c3e5b81691718483e3cfe0d2c96ae5dc97536ab16980"],
  ["packages/edit-execution/policy.ts", "3732c5e30bae7f19a8d9ca65c240014c73274d242ab7004c68e582d0ee393a9b"],
  ["packages/edit-execution/runtime.ts", "3db1353b95352eb6d30b7e19f47905563cbd1801423a810d86d45a1552fdcdb3"],
  ["packages/edit-execution/source.ts", "d6d78941984d37dd9f58c4b7c9486f9278c7d4fbce26e9fba86c43072085d944"],
  ["packages/edit-execution/workload.ts", "599cbabff5fba8cfc968c51236bc1b71189d1a65716ad7b91d4d0471e770f325"],
  ["packages/routing/index.ts", "11a6bb3472cb7ad026924b4e4ec555400bf1575e224a5e4fec11d2de8d85ac09"],
  ["packages/edit-graph/index.ts", "fdfb2cfd98dbb6d0c2e9f35b8339df8b586cb85652d8b3b7174bf5fb098796bf"],
  ["packages/editorial/common.ts", "6cd4e80f921061aaabe0d26e17b2f4beb481ff3ba617090eb0202d9db2019ca6"],
  ["packages/domain/serialization.ts", "3d4d162e873a63274e5359bde42c50c15cbdeed103342fb0900ce15f9812175d"],
  ["tests/edit-execution.test.ts", "648d494a27d757a2b5fb10505aaf8d138b3e58da3b6d5104fadcc13fdff1cbe1"],
  ["tests/support/edit-execution.ts", "bf1ace12b2b26ed46694ccf0243ed3993475366279c36fc9b66bba1c857e3828"],
  ["tests/support/edit-execution-chains.ts", "dcd3aadde2cee9c18cef2f665474a067a0361a303b06fce2e2156680a649f2f6"],
  ["tests/support/edit-graph.ts", "50e57755aff2d03b5e282e8445b399edfca1dd5af000c9981e607b2875cc0468"],
  ["docs/phases/phase-5-gate-7-execution-runtime.md", "af72d55a8452276450e579a2a9c7b4ecdfc1ac7e94d50ffcbf33829f9bb3d9ad"],
] as const;
test("03 accepted Batch-1 production, Gate-3 routing, Batch-1 test support and the frozen Batch-1 report are byte-identical", () => {
  for (const [path, digest] of ACCEPTED_SURFACES) assert.equal(sha256File(path), digest, path);
});

// ================================================================ 4-16 the durable logical-attempt registry
const regChain = () => memo("reg_chain", () => budgetChain({ prefix: "b2a_reg" }));
const SLOT = { projectId: scope.projectId, creatorId: scope.creatorId, operationId: OPERATION, attempt: 1 };
async function registered(t: TestContext) {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const chain = regChain();
  const first = await registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, env.runtime);
  return { env, chain, first };
}

test("04 the first valid Gate-3 reservation registration owns the logical attempt slot, durably and canonically", async t => {
  const { env, chain, first } = await registered(t);
  assert.equal(first.outcome, "registered");
  const r = first.registration;
  assert.equal(r.artifactType, "AttemptRegistration");
  assert.deepEqual(r.attemptSlot, attemptSlot(SLOT));
  assert.deepEqual(r.scope, scope);
  assert.deepEqual([r.budget.budgetId, r.budget.executionBudget], [chain.parent.value.budgetId, chain.parent.artifact.ref]);
  assert.deepEqual([r.allocation.budgetId, r.allocation.allocation], [chain.allocation.value.budgetId, chain.allocation.artifact.ref]);
  assert.deepEqual([r.reservation.reservationId, r.reservation.history, r.reservation.firstObservedArtifact],
    [chain.reservation.reservationId, chain.history.ref, chain.reservationArtifact.ref]);
  assert.equal(r.registeredAt, RUNTIME_START);
  assert.deepEqual(r.registrar.implementation, RUNTIME_IMPLEMENTATION);
  const files = await readdir(env.runtime.layout.attemptRegistrations);
  assert.deepEqual(files, [`${ownedKey(r.attemptSlot.attemptSlotId, "execution_attempt_slot_v0")}.json`]);
  assert.equal(await readFile(registrationPath(env.runtime, r.attemptSlot.attemptSlotId), "utf8"), persisted(r));
  assert.deepEqual(AttemptRegistrationSchema.parse(JSON.parse(persisted(r))), r);
  assert.deepEqual(await observeAttemptRegistration(SLOT, env.runtime), r);
  assert.deepEqual(await readdir(env.runtime.layout.ledgerPending), []);
});

test("05 the exact same semantic reservation is observed idempotently, never re-registered", async t => {
  const { env, chain, first } = await registered(t);
  env.clock.advance(5_000);
  const again = await registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, env.runtime);
  assert.equal(again.outcome, "observed_existing");
  assert.deepEqual(again.registration, first.registration);
  assert.equal(again.registration.registeredAt, RUNTIME_START);
  assert.equal((await readdir(env.runtime.layout.attemptRegistrations)).length, 1);
});

test("06 the same reservation under another storage label or byte form maps to the same registration, never a second slot", async t => {
  const { env, chain, first } = await registered(t);
  const relabeled = artifact("b2a_reg_reservation_relabeled", "Reservation", chain.reservation);
  const prettyBytes = text(JSON.stringify(chain.reservation, null, 2));
  const pretty: SuppliedArtifact = { ref: { objectId: "b2a_reg_reservation_pretty", artifactType: "Reservation", artifactVersion: "0.1.0", sha256: sha256Hex(prettyBytes) },
    bytes: prettyBytes, value: chain.reservation };
  for (const copy of [relabeled, pretty]) {
    const result = await registerAttempt({ reservation: copy.ref }, [...chain.artifacts, copy], env.runtime);
    assert.equal(result.outcome, "observed_existing");
    assert.deepEqual(result.registration, first.registration);
    assert.deepEqual(result.registration.reservation.firstObservedArtifact, chain.reservationArtifact.ref);
  }
  assert.equal((await readdir(env.runtime.layout.attemptRegistrations)).length, 1);
});

test("07 a forked, independently replay-valid ReservationHistory for the same attempt conflicts", async t => {
  const { env, chain, first } = await registered(t);
  const fork = forkReservation(chain, "b2a_reg_fork");
  // Both reservations individually pass accepted Gate-3 replay from their own refs.
  for (const [value, artifacts] of [[chain.reservation, chain.artifacts], [fork.value, [...chain.artifacts, ...fork.artifacts]]] as const) {
    assert.deepEqual(reserve({ scope: value.scope, budget: chain.parent.value, budgetArtifact: value.budgetRef, allocation: chain.allocation.value,
      allocationArtifact: value.allocationRef, historyArtifact: value.historyRef, operationId: value.operationId, attempt: value.attempt }, artifacts), value);
  }
  assert.notEqual(fork.value.reservationId, chain.reservation.reservationId);
  assert.equal(await refusal(() => registerAttempt({ reservation: fork.artifact.ref }, [...chain.artifacts, ...fork.artifacts], env.runtime)), "reservation_fork_conflict");
  assert.deepEqual(await observeAttemptRegistration(SLOT, env.runtime), first.registration);
});

test("07b fork attack: two replay-valid DAGs from forked histories, exactly one reaches an execution claim", async t => {
  const a = finalA(), b = forkBDag(), va = vFinalA(), vb = validated(b);
  assert.equal(va.slot.attemptSlotId, vb.slot.attemptSlotId);
  assert.notEqual(va.dag.dispatch.claimTarget.reservationId, vb.dag.dispatch.claimTarget.reservationId);
  const env = await envFor(t);
  assert.equal((await registerDagAttempt(va, a.artifacts, env.runtime)).outcome, "registered");
  assert.equal(await refusal(() => registerDagAttempt(vb, b.artifacts, env.runtime)), "reservation_fork_conflict");
  assert.equal(await refusal(() => acquireExecutionClaim(vb, { workerId: "worker_b" }, env.runtime)), "reservation_not_authoritative");
  assert.deepEqual(await readdir(env.runtime.layout.executionClaims), []);
  const won = await acquireExecutionClaim(va, { workerId: "worker_a" }, env.runtime);
  assert.equal(won.claim.claimTarget.reservationId, va.dag.dispatch.claimTarget.reservationId);
});

test("08 the same operation attempt under another execution budget conflicts: budgetId is not attempt uniqueness", async t => {
  const { env } = await registered(t);
  const other = budgetChain({ prefix: "b2a_other_budget" });
  assert.notEqual(other.parent.value.budgetId, regChain().parent.value.budgetId);
  assert.equal(await refusal(() => registerAttempt({ reservation: other.reservationArtifact.ref }, other.artifacts, env.runtime)), "attempt_registration_conflict");
});

test("09 the same operation attempt under another allocation of the same budget conflicts", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const allocations = [HALF_LIMITS, { ...HALF_LIMITS, cpuMilliseconds: 200_000 }];
  const first = budgetChain({ prefix: "b2a_alloc", allocations, reserveIndex: 0 }), second = budgetChain({ prefix: "b2a_alloc", allocations, reserveIndex: 1 });
  assert.equal(first.parent.value.budgetId, second.parent.value.budgetId);
  assert.notEqual(first.allocation.value.budgetId, second.allocation.value.budgetId);
  assert.equal((await registerAttempt({ reservation: first.reservationArtifact.ref }, first.artifacts, env.runtime)).outcome, "registered");
  assert.equal(await refusal(() => registerAttempt({ reservation: second.reservationArtifact.ref }, second.artifacts, env.runtime)), "attempt_registration_conflict");
  // Another allocation artifact with identical content is the same allocation budget under another label: its reservation is still another reservation.
  const labels = await runtimeEnv();
  t.after(labels.cleanup);
  const same = [HALF_LIMITS, HALF_LIMITS];
  const a = budgetChain({ prefix: "b2a_alloc_label", allocations: same, reserveIndex: 0 }), b = budgetChain({ prefix: "b2a_alloc_label", allocations: same, reserveIndex: 1 });
  assert.equal(a.allocation.value.budgetId, b.allocation.value.budgetId);
  assert.notEqual(a.allocation.artifact.ref.objectId, b.allocation.artifact.ref.objectId);
  assert.equal((await registerAttempt({ reservation: a.reservationArtifact.ref }, a.artifacts, labels.runtime)).outcome, "registered");
  assert.equal(await refusal(() => registerAttempt({ reservation: b.reservationArtifact.ref }, b.artifacts, labels.runtime)), "reservation_fork_conflict");
});

test("10 the same operation attempt under another purpose conflicts: purpose is bound, never a way to mint a slot", async t => {
  const { env, first } = await registered(t);
  const other = budgetChain({ prefix: "b2a_purpose", scope: { ...scope, purpose: "local_render_review" } });
  assert.deepEqual(attemptSlot({ projectId: other.reservation.scope.projectId, creatorId: other.reservation.scope.creatorId, operationId: other.reservation.operationId,
    attempt: other.reservation.attempt }), first.registration.attemptSlot);
  assert.equal(await refusal(() => registerAttempt({ reservation: other.reservationArtifact.ref }, other.artifacts, env.runtime)), "attempt_registration_conflict");
  assert.deepEqual((await observeAttemptRegistration(SLOT, env.runtime))?.scope, scope);
});

test("11 attempt + 1 with a truthful new Gate-3 reservation is a new, independent slot", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const chain = budgetChain({ prefix: "b2a_retry", allocations: [HALF_LIMITS, HALF_LIMITS], reserveIndex: 0 });
  const retry = forkReservation(chain, "b2a_retry_attempt_2", { prior: [{ reservation: chain.reservationArtifact, state: "released" }], allocationIndex: 1, attempt: 2 });
  const first = await registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, env.runtime);
  const second = await registerAttempt({ reservation: retry.artifact.ref }, [...chain.artifacts, ...retry.artifacts], env.runtime);
  assert.deepEqual([first.outcome, second.outcome], ["registered", "registered"]);
  assert.equal(second.registration.attemptSlot.attempt, 2);
  assert.notEqual(second.registration.attemptSlot.attemptSlotId, first.registration.attemptSlot.attemptSlotId);
  assert.equal((await readdir(env.runtime.layout.attemptRegistrations)).length, 2);
});

test("12 another operation is an independent attempt namespace", async t => {
  const { env } = await registered(t);
  const other = budgetChain({ prefix: "b2a_op2", operationId: "operation_render_other" });
  assert.equal((await registerAttempt({ reservation: other.reservationArtifact.ref }, other.artifacts, env.runtime)).outcome, "registered");
});

test("13 another project and creator have their own attempt namespace", async t => {
  const { env } = await registered(t);
  const foreign = budgetChain({ prefix: "b2a_foreign", scope: { projectId: "project_other", creatorId: "creator_other", purpose: scope.purpose } });
  const result = await registerAttempt({ reservation: foreign.reservationArtifact.ref }, foreign.artifacts, env.runtime);
  assert.equal(result.outcome, "registered");
  assert.equal(result.registration.attemptSlot.projectId, "project_other");
});

test("14 a malformed existing attempt record fails closed and is never repaired", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const path = registrationPath(env.runtime, attemptSlot(SLOT).attemptSlotId), junk = '{"artifactType":"AttemptRegistration"}\n';
  await writeFile(path, junk);
  const chain = regChain();
  assert.equal(await refusal(() => registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, env.runtime)), "attempt_registration_corrupt");
  assert.equal(await refusal(() => observeAttemptRegistration(SLOT, env.runtime)), "attempt_registration_corrupt");
  assert.equal(await readFile(path, "utf8"), junk);
});

test("15 a zero-byte or truncated existing attempt ownership record fails closed as occupied", async t => {
  const chain = regChain();
  const template = await (async () => {
    const env = await runtimeEnv();
    t.after(env.cleanup);
    return persisted((await registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, env.runtime)).registration);
  })();
  for (const bytes of ["", template.slice(0, Math.floor(template.length / 2)), template.slice(0, -1)]) {
    const env = await runtimeEnv();
    t.after(env.cleanup);
    const path = registrationPath(env.runtime, attemptSlot(SLOT).attemptSlotId);
    await writeFile(path, bytes);
    assert.equal(await refusal(() => registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, env.runtime)), "attempt_registration_corrupt");
    assert.equal(await refusal(() => observeAttemptRegistration(SLOT, env.runtime)), "attempt_registration_corrupt");
    assert.equal(await readFile(path, "utf8"), bytes);
  }
});

test("16 a poisoned attempt slot is never recovered, released, stolen or overwritten; retry needs attempt + 1", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const chain = regChain(), fork = forkReservation(chain, "b2a_poison_fork");
  const path = registrationPath(env.runtime, attemptSlot(SLOT).attemptSlotId);
  await writeFile(path, "");
  for (const [ref, artifacts] of [[chain.reservationArtifact.ref, chain.artifacts], [fork.artifact.ref, [...chain.artifacts, ...fork.artifacts]]] as const) {
    env.clock.advance(86_400_000);
    assert.equal(await refusal(() => registerAttempt({ reservation: ref }, artifacts, env.runtime)), "attempt_registration_corrupt");
  }
  assert.equal((await lstat(path)).size, 0);
  assert.deepEqual(await readdir(env.runtime.layout.ledgerPending), []);
  const exported = [...Object.keys(runtimeCore), ...Object.keys(runtimeAdapter)];
  assert.deepEqual(exported.filter(name => /release|delete|remove|steal|reclaim|unlock|expire|repair|reset|clear|purge|evict/i.test(name)), []);
  const retry = forkReservation(budgetChain({ prefix: "b2a_poison_retry", allocations: [HALF_LIMITS, HALF_LIMITS], reserveIndex: 0 }), "b2a_poison_attempt_2",
    { allocationIndex: 1, attempt: 2 });
  const retryChain = budgetChain({ prefix: "b2a_poison_retry", allocations: [HALF_LIMITS, HALF_LIMITS], reserveIndex: 0 });
  assert.equal((await registerAttempt({ reservation: retry.artifact.ref }, [...retryChain.artifacts, ...retry.artifacts], env.runtime)).outcome, "registered");
});

// ================================================================ 17-30 the durable atomic execution claim
test("17 an exact authoritative attempt registration is required before any claim", async t => {
  const env = await envFor(t);
  assert.equal(await refusal(() => acquireExecutionClaim(vFinalA(), { workerId: "worker_a" }, env.runtime)), "attempt_registration_missing");
  assert.deepEqual(await readdir(env.runtime.layout.executionClaims), []);
});

test("18 the claim's reservation must be the registered winner", async t => {
  const env = await envFor(t);
  await registerDagAttempt(validated(forkBDag()), forkBDag().artifacts, env.runtime);
  assert.equal(await refusal(() => acquireExecutionClaim(vFinalA(), { workerId: "worker_a" }, env.runtime)), "reservation_not_authoritative");
  assert.deepEqual(await readdir(env.runtime.layout.executionClaims), []);
});

test("19 the first claim-target acquisition succeeds and binds the exact attempt, render, DAG, admission, grant, worker and time", async t => {
  const c = await claimed(t), v = c.v, claim = c.claim;
  assert.equal(claim.artifactType, "ExecutionClaim");
  assert.deepEqual(claim.scope, scope);
  assert.deepEqual(claim.claimTarget, v.dag.dispatch.claimTarget);
  assert.deepEqual(claim.renderBinding, v.dag.dispatch.renderBinding);
  assert.deepEqual(claim.dag, { dagId: v.dag.dagId, artifact: v.dagRef });
  assert.deepEqual(claim.admission, { admissionId: v.admission.admissionId, artifact: v.admissionRef });
  assert.deepEqual(claim.executionGrant, { grantId: v.grant.grantId, artifact: v.grantRef });
  assert.equal(claim.attemptRegistration.attemptSlotId, v.slot.attemptSlotId);
  assert.deepEqual(claim.claimant, { workerId: "worker_a" });
  assert.equal(claim.claimedAt, RUNTIME_START);
  assert.deepEqual(claim.runtime.implementation, RUNTIME_IMPLEMENTATION);
  assert.equal(c.ownership.claimId, claim.claimId);
  assert.equal(await readFile(claimPath(c.env.runtime, claim.claimTarget.claimTargetId), "utf8"), persisted(claim));
  assert.deepEqual(await observeExecutionClaim(claim.claimTarget.claimTargetId, c.env.runtime), claim);
  assert.equal(JSON.stringify(c.ownership).includes(claim.ownerProof.digest), false);
});

test("20 a second claim of the same render refuses, from the same worker or another; the winner is unchanged", async t => {
  const c = await claimed(t), path = claimPath(c.env.runtime, c.claim.claimTarget.claimTargetId), before = await readFile(path);
  for (const workerId of ["worker_a", "worker_b"]) {
    c.env.clock.advance(1_000);
    assert.equal(await refusal(() => acquireExecutionClaim(c.v, { workerId }, c.env.runtime)), "claim_already_acquired");
  }
  assert.deepEqual(await readFile(path), before);
});

test("21 another render computation on the same claim target refuses", async t => {
  const c = await claimed(t), v = validated(regrantA());
  assert.equal(v.dag.dispatch.claimTarget.claimTargetId, c.v.dag.dispatch.claimTarget.claimTargetId);
  assert.notEqual(v.dag.dispatch.renderBinding.renderComputationId, c.v.dag.dispatch.renderBinding.renderComputationId);
  assert.equal((await registerDagAttempt(v, regrantA().artifacts, c.env.runtime)).outcome, "observed_existing");
  assert.equal(await refusal(() => acquireExecutionClaim(v, { workerId: "worker_b" }, c.env.runtime)), "claim_already_acquired");
});

test("22 preview and final re-grants of one reservation attempt can never both own the claim target", async t => {
  const final = await claimed(t), preview = validated(previewA());
  assert.equal(preview.dag.dispatch.claimTarget.claimTargetId, final.v.dag.dispatch.claimTarget.claimTargetId);
  assert.equal(await refusal(() => acquireExecutionClaim(preview, { workerId: "worker_b" }, final.env.runtime)), "claim_already_acquired");
  const env = await envFor(t);
  await registerDagAttempt(preview, previewA().artifacts, env.runtime);
  assert.equal((await acquireExecutionClaim(preview, { workerId: "worker_p" }, env.runtime)).claim.renderBinding.renderComputationId,
    preview.dag.dispatch.renderBinding.renderComputationId);
  assert.equal(await refusal(() => acquireExecutionClaim(vFinalA(), { workerId: "worker_f" }, env.runtime)), "claim_already_acquired");
});

test("23 a claim-target identity mutation refuses before any runtime authority", async () => {
  const x = finalA();
  const forged = resealDag(x.dag, d => { d.dispatch.claimTarget.claimTargetId = `execution_claim_target_v0_${"1".repeat(64)}`; }, false);
  assert.equal(await refusal(() => openValidatedDag({ dag: forged.ref }, [...x.artifacts, forged])), "execution_dag_invalid");
});

test("24 a reservationId mutation refuses, even coherently re-identified", async () => {
  const x = finalA(), forged = resealDag(x.dag, d => { d.dispatch.claimTarget.reservationId = forkB().value.reservationId; });
  assert.equal(await refusal(() => openValidatedDag({ dag: forged.ref }, [...x.artifacts, forged])), "execution_dag_invalid");
});

test("25 an operationId mutation refuses, even coherently re-identified", async () => {
  const x = finalA(), forged = resealDag(x.dag, d => { d.dispatch.claimTarget.operationId = "operation_render_other"; });
  assert.equal(await refusal(() => openValidatedDag({ dag: forged.ref }, [...x.artifacts, forged])), "execution_dag_invalid");
});

test("26 an attempt mutation refuses, even coherently re-identified", async () => {
  const x = finalA(), forged = resealDag(x.dag, d => { d.dispatch.claimTarget.attempt = 2; });
  assert.equal(await refusal(() => openValidatedDag({ dag: forged.ref }, [...x.artifacts, forged])), "execution_dag_invalid");
});

test("27 a DAG or render-computation mutation refuses", async () => {
  const x = finalA(), preview = previewA();
  const renderOnly = resealDag(x.dag, d => { d.dispatch.renderBinding.renderComputationId = preview.dag.dispatch.renderBinding.renderComputationId; });
  const relabeled = resealDag(x.dag, d => { d.renderIdentity = preview.dag.renderIdentity; d.dispatch.renderBinding = preview.dag.dispatch.renderBinding; });
  for (const forged of [renderOnly, relabeled]) assert.equal(await refusal(() => openValidatedDag({ dag: forged.ref }, [...x.artifacts, forged])), "execution_dag_invalid");
});

test("28 a malformed existing claim record fails closed and is never repaired", async t => {
  const env = await envFor(t), v = vFinalA();
  await registerDagAttempt(v, finalA().artifacts, env.runtime);
  const path = claimPath(env.runtime, v.dag.dispatch.claimTarget.claimTargetId), junk = '{"artifactType":"ExecutionClaim","claimId":"x"}\n';
  await writeFile(path, junk);
  assert.equal(await refusal(() => acquireExecutionClaim(v, { workerId: "worker_a" }, env.runtime)), "claim_record_corrupt");
  assert.equal(await refusal(() => observeExecutionClaim(v.dag.dispatch.claimTarget.claimTargetId, env.runtime)), "claim_record_corrupt");
  assert.equal(await readFile(path, "utf8"), junk);
});

test("29 an empty or truncated claim record keeps the claim target consumed", async t => {
  const template = persisted((await claimed(t)).claim), v = vFinalA();
  for (const bytes of ["", template.slice(0, 100), template.slice(0, -2)]) {
    const env = await envFor(t);
    await registerDagAttempt(v, finalA().artifacts, env.runtime);
    const path = claimPath(env.runtime, v.dag.dispatch.claimTarget.claimTargetId);
    await writeFile(path, bytes);
    for (let i = 0; i < 2; i += 1) {
      env.clock.advance(600_000);
      assert.equal(await refusal(() => acquireExecutionClaim(v, { workerId: `worker_${i}` }, env.runtime)), "claim_record_corrupt");
    }
    assert.equal(await readFile(path, "utf8"), bytes);
  }
});

test("30 there is no claim release, timeout, steal or reclaim path", async t => {
  const c = await claimed(t);
  const exported = [...Object.keys(runtimeCore), ...Object.keys(runtimeAdapter)];
  assert.deepEqual(exported.filter(name => /release|delete|remove|steal|reclaim|unlock|expire|repair|reset|clear|purge|evict|abandon|revoke/i.test(name)), []);
  // Fifty minutes later, still inside the grant window, a fresh adapter instance still finds the target consumed.
  c.env.clock.set("2026-09-24T01:59:59.999Z");
  assert.equal(await refusal(async () => acquireExecutionClaim(c.v, { workerId: "worker_late" }, await c.env.fresh())), "claim_already_acquired");
  // Long after the grant, nothing has timed out or been released; the late caller is refused before any publication.
  c.env.clock.set(FAR_FUTURE);
  assert.equal(await refusal(async () => acquireExecutionClaim(c.v, { workerId: "worker_later" }, await c.env.fresh())), "execution_grant_expired");
  assert.deepEqual(await observeExecutionClaim(c.claim.claimTarget.claimTargetId, c.env.runtime), c.claim);
  assert.equal(await readFile(claimPath(c.env.runtime, c.claim.claimTarget.claimTargetId), "utf8"), persisted(c.claim));
});

// ================================================================ 31-34 actual filesystem concurrency
test("31 sixteen concurrent claim callers over one runtime root: exactly one acquires, fifteen refuse", async t => {
  const env = await envFor(t), v = vFinalA();
  await registerDagAttempt(v, finalA().artifacts, env.runtime);
  const runtimes = await Promise.all(Array.from({ length: 16 }, () => env.fresh()));
  const results = await Promise.allSettled(runtimes.map((runtime, i) => acquireExecutionClaim(v, { workerId: `worker_${String(i).padStart(2, "0")}` }, runtime)));
  const won = results.flatMap(r => r.status === "fulfilled" ? [r.value] : []), lost = results.flatMap(r => r.status === "rejected" ? [r.reason] : []);
  assert.equal(won.length, 1);
  assert.equal(lost.length, 15);
  assert.deepEqual([...new Set(lost.map(codeOf))], ["claim_already_acquired"]);
  assert.deepEqual(await readdir(env.runtime.layout.executionClaims), [`${ownedKey(v.dag.dispatch.claimTarget.claimTargetId, "execution_claim_target_v0")}.json`]);
  assert.deepEqual(await observeExecutionClaim(v.dag.dispatch.claimTarget.claimTargetId, env.runtime), won[0]!.claim);
  assert.deepEqual(await readdir(env.runtime.layout.ledgerPending), []);
  // The raw publication primitive itself: sixteen distinct complete records raced to one owned key.
  const key = sha256Hex("gate7-batch2a-raw-publication-race");
  const records = Array.from({ length: 16 }, (_, i) => text(`${canonicalSerialize({ candidate: i })}\n`));
  const outcomes = await Promise.all(runtimes.map((runtime, i) => runtime.ledger.publishExclusive("execution_claim", key, records[i]!)));
  assert.equal(outcomes.filter(o => o === "published").length, 1);
  assert.equal(outcomes.filter(o => o === "exists").length, 15);
  const winner = outcomes.indexOf("published");
  assert.deepEqual(new Uint8Array(await readFile(join(env.runtime.layout.executionClaims, `${key}.json`))), records[winner]);
  assert.deepEqual(await readdir(env.runtime.layout.ledgerPending), []);
});

test("32 conflicting concurrent reservation registrations: exactly one fork becomes authoritative", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const chain = regChain(), forks = Array.from({ length: 8 }, (_, i) => forkReservation(chain, `b2a_race_fork_${i}`));
  const artifacts = [...chain.artifacts, ...forks.flatMap(f => f.artifacts)];
  const runtimes = await Promise.all(forks.map(() => env.fresh()));
  const results = await Promise.allSettled(forks.map((f, i) => registerAttempt({ reservation: f.artifact.ref }, artifacts, runtimes[i]!)));
  const won = results.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
  assert.equal(won.length, 1);
  assert.equal(won[0]!.outcome, "registered");
  assert.deepEqual(results.flatMap(r => r.status === "rejected" ? [codeOf(r.reason)] : []), Array.from({ length: 7 }, () => "reservation_fork_conflict"));
  assert.equal((await observeAttemptRegistration(SLOT, env.runtime))?.reservation.reservationId, won[0]!.registration.reservation.reservationId);
  assert.equal((await readdir(env.runtime.layout.attemptRegistrations)).length, 1);
});

test("33 concurrent identical registrations observe one authority", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const chain = regChain(), runtimes = await Promise.all(Array.from({ length: 8 }, () => env.fresh()));
  const results = await Promise.all(runtimes.map(runtime => registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, runtime)));
  assert.equal(results.filter(r => r.outcome === "registered").length, 1);
  assert.equal(results.filter(r => r.outcome === "observed_existing").length, 7);
  assert.equal(new Set(results.map(r => r.registration.registrationId)).size, 1);
});

test("34 the winning claim's durable bytes are complete, canonical, schema-valid and content-identity-valid under their owned key", async t => {
  const c = await claimed(t), key = ownedKey(c.claim.claimTarget.claimTargetId, "execution_claim_target_v0");
  const bytes = await readFile(join(c.env.runtime.layout.executionClaims, `${key}.json`), "utf8");
  const parsed = ExecutionClaimSchema.parse(JSON.parse(bytes));
  assert.equal(bytes, persisted(parsed));
  assert.equal(ownedKey(parsed.claimTarget.claimTargetId, "execution_claim_target_v0"), key);
  assert.equal(parsed.claimId, identify("execution_claim_v0", "claimId", (({ claimId: _id, ...body }) => body)(parsed)).claimId);
  assert.ok(bytes.length <= MAX_RUNTIME_RECORD_BYTES);
});

// ================================================================ 35-37 real test-byte identity
test("35 the test source's real SHA-256 is exactly the FootageAnalysis content hash, and the asset follows asset_<contentHash>", () => {
  const source = graphSources(graphA())[0]!;
  assert.equal(sha256Hex(bytesA()), source.contentHash);
  assert.equal(source.assetId, `asset_${sha256Hex(bytesA())}`);
  const analysis = graphA().artifacts.find(a => a.ref.objectId === source.analysis.objectId)!.value as { contentHash: string; authorization: { contentHash: string } };
  assert.deepEqual([analysis.contentHash, analysis.authorization.contentHash], [sha256Hex(bytesA()), sha256Hex(bytesA())]);
});

test("36 the actual byte length is exactly the authorized size, spanning several staging chunks", () => {
  const source = graphSources(graphA())[0]!;
  assert.equal(bytesA().length, source.sizeBytes);
  assert.ok(source.sizeBytes > 2 * STAGING_CHUNK_BYTES);
  assert.equal(vFinalA().admission.sources[0]!.sizeBytes, SIZE_A);
});

test("37 the real-byte chain stays replay-valid through the Batch-1 DAG, and the chain builder reproduces the accepted builder exactly", () => {
  const admitted = vFinalA().admission.sources[0]!;
  assert.deepEqual([admitted.assetId, admitted.contentHash, admitted.sizeBytes], [assetA(), hashA(), SIZE_A]);
  const hash = sha256Hex("gate7-batch2a-equivalence");
  const accepted = chainFixture([{ key: "equivalence", hash }]).supplied, copy = runtimeChainFixture([{ key: "equivalence", hash }]).supplied;
  assert.equal(canonicalSerialize(copy.map(a => [a.ref, a.value])), canonicalSerialize(accepted.map(a => [a.ref, a.value])));
});

// ================================================================ 38-46 the execution-only source locator
test("38 an admitted local source under an allowed root resolves and opens as the exact regular file", async t => {
  const env = await envFor(t), resolved = await env.runtime.sources.resolve(assetA()), reader = await env.runtime.sources.open(resolved);
  try {
    assert.equal(reader.sizeBytes, SIZE_A);
    const head = new Uint8Array(32);
    assert.equal(await reader.read(head, 0), 32);
    assert.deepEqual(head, bytesA().subarray(0, 32));
  } finally { await reader.close(); }
  assert.equal(JSON.stringify(resolved).includes("take_0"), false);
});

async function locatorRefusal(env: RuntimeEnv, path: string): Promise<string> {
  const runtime = await env.fresh({ sources: [{ assetId: "asset_probe", path }] });
  return refusal(async () => { const reader = await runtime.sources.open(await runtime.sources.resolve("asset_probe")); await reader.close(); });
}
test("39 a path outside every allowed root refuses, including through a parent junction", async t => {
  const env = await envFor(t), outside = join(env.base, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "a.bin"), bytesA());
  assert.equal(await locatorRefusal(env, join(outside, "a.bin")), "source_outside_allowed_root");
  await symlink(outside, join(env.sourceRoot, "escape"), "junction");
  assert.equal(await locatorRefusal(env, join(env.sourceRoot, "escape", "a.bin")), "source_outside_allowed_root");
});

test("40 a URL refuses", async t => {
  const env = await envFor(t);
  for (const url of ["file:///C:/media/a.bin", "https://example.invalid/a.bin", "s3://bucket/a.bin"]) assert.equal(await locatorRefusal(env, url), "source_location_invalid");
});

test("41 a UNC, device, relative or traversal path refuses, as source and as allowed root", async t => {
  const env = await envFor(t);
  for (const path of ["\\\\server\\share\\a.bin", "//server/share/a.bin", "\\\\?\\C:\\a.bin", "\\\\.\\C:\\a.bin", "sources\\a.bin", "C:a.bin",
    `${env.sourceRoot}\\..\\sources\\take_0.bin`, `${env.sourceRoot}/../sources/take_0.bin`]) assert.equal(await locatorRefusal(env, path), "source_location_invalid", path);
  for (const root of ["\\\\server\\share", "//server/share", "https://example.invalid/"]) {
    assert.equal(await refusal(() => env.fresh({ allowedSourceRoots: [root] })), "source_location_invalid", root);
  }
});

test("42 a missing source or an unmapped asset refuses", async t => {
  const env = await envFor(t);
  assert.equal(await locatorRefusal(env, join(env.sourceRoot, "absent.bin")), "source_unavailable");
  assert.equal(await refusal(() => env.runtime.sources.resolve("asset_unmapped")), "source_unavailable");
});

test("43 a directory refuses", async t => {
  const env = await envFor(t);
  await mkdir(join(env.sourceRoot, "folder.bin"));
  assert.equal(await locatorRefusal(env, join(env.sourceRoot, "folder.bin")), "source_not_regular");
});

test("44 a final link component refuses", async t => {
  const env = await envFor(t);
  await mkdir(join(env.base, "linked"));
  await symlink(join(env.base, "linked"), join(env.sourceRoot, "junction.bin"), "junction");
  assert.equal(await locatorRefusal(env, join(env.sourceRoot, "junction.bin")), "source_symlink");
  let fileLink = "created";
  try { await symlink(env.sourcePath("take_0.bin"), join(env.sourceRoot, "file_link.bin"), "file"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") fileLink = "not_creatable_without_symlink_privilege"; else throw error; }
  if (fileLink === "created") assert.equal(await locatorRefusal(env, join(env.sourceRoot, "file_link.bin")), "source_symlink");
  t.diagnostic(`file symbolic link on this platform: ${fileLink}; the directory-junction final component was refused`);
});

test("45 an empty file refuses", async t => {
  const env = await envFor(t);
  await writeFile(join(env.sourceRoot, "empty.bin"), "");
  assert.equal(await locatorRefusal(env, join(env.sourceRoot, "empty.bin")), "source_empty");
});

test("46 a source beyond the configured size bound refuses, and no bound beyond the accepted source limit is configurable", async t => {
  const env = await envFor(t);
  const bounded = await env.fresh({ maxSourceBytes: STAGING_CHUNK_BYTES });
  assert.equal(await refusal(() => bounded.sources.resolve(assetA())), "limit_exceeded");
  assert.equal(await refusal(() => env.fresh({ maxSourceBytes: MAX_STAGED_SOURCE_BYTES + 1 })), "limit_exceeded");
  assert.equal(MAX_STAGED_SOURCE_BYTES, 8 * 1024 ** 3);
});

// ================================================================ 47-60 verified content-addressed staging
test("47 a won claim, proven by its ownership, is required before staging", async t => {
  const env = await envFor(t), v = vFinalA(), artifacts = mergeArtifacts(finalA().artifacts, RUNTIME_EVIDENCE);
  await registerDagAttempt(v, finalA().artifacts, env.runtime);
  const none = undefined as unknown as ClaimOwnership;
  const forged = { claimTargetId: v.dag.dispatch.claimTarget.claimTargetId, claimId: "execution_claim_v0_forged" } as unknown as ClaimOwnership;
  for (const ownership of [none, forged]) {
    assert.equal(await refusal(() => stageClaimedSource({ dag: v, runtime: env.runtime, ownership, artifacts }, { assetId: assetA() })), "claim_ownership_required");
  }
  const elsewhere = await claimed(t);
  assert.equal(await refusal(() => stageClaimedSource({ dag: v, runtime: env.runtime, ownership: elsewhere.ownership, artifacts }, { assetId: assetA() })), "claim_missing");
  const here = await acquireExecutionClaim(v, { workerId: "worker_here" }, env.runtime);
  assert.equal(await refusal(() => stageClaimedSource({ dag: v, runtime: env.runtime, ownership: elsewhere.ownership, artifacts }, { assetId: assetA() })),
    "claim_ownership_required");
  assert.deepEqual(await readdir(env.runtime.layout.stagedObjects), []);
  assert.ok(here.ownership instanceof ClaimOwnership);
});

test("48 staged bytes are hashed from exactly the bytes copied from one opened source handle", async t => {
  const c = await claimed(t), reads: { position: number; chunk: Uint8Array }[] = [];
  let opens = 0;
  const sources: SourceLocator = { resolve: assetId => c.env.runtime.sources.resolve(assetId),
    open: async resolved => { opens += 1; return wrapReader(await c.env.runtime.sources.open(resolved), (chunk, position) => { reads.push({ position, chunk }); }); } };
  const receipt = await stageClaimedSource({ ...c.call, runtime: withSources(c.env.runtime, sources) }, { assetId: assetA() });
  assert.equal(opens, 1);
  assert.deepEqual(reads.map(r => r.position), [0, STAGING_CHUNK_BYTES, 2 * STAGING_CHUNK_BYTES, SIZE_A]);
  const copied = Buffer.concat(reads.map(r => r.chunk));
  assert.equal(copied.length, SIZE_A);
  assert.equal(sha256Hex(copied), receipt.observed.contentHash);
  assert.deepEqual(new Uint8Array(await readFile(stagedPath(c.env.runtime, receipt.stagedObject.stagedObjectId))), new Uint8Array(copied));
});

test("49 other bytes of the same size before staging refuse with a hash mismatch and publish nothing", async t => {
  const c = await claimed(t);
  await writeFile(c.env.sourcePath("take_0.bin"), deterministicBytes("gate7-batch2a-substitute", SIZE_A));
  assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: assetA() })), "source_hash_mismatch");
  assert.deepEqual(await readdir(c.env.runtime.layout.stagedObjects), []);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagingPending), []);
});

test("50 a longer or shorter source before staging refuses with a size mismatch and publishes nothing", async t => {
  const c = await claimed(t);
  for (const bytes of [Buffer.concat([bytesA(), Buffer.from([0])]), bytesA().subarray(0, SIZE_A - 1)]) {
    await writeFile(c.env.sourcePath("take_0.bin"), bytes);
    assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: assetA() })), "source_size_mismatch");
  }
  assert.deepEqual(await readdir(c.env.runtime.layout.stagedObjects), []);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagingPending), []);
});

test("51 an authorized source stages under its exact content-addressed stagedObjectId", async t => {
  const c = await claimed(t), receipt = await stageClaimedSource(c.call, { assetId: assetA() }), source = c.v.admission.sources[0]!;
  assert.equal(receipt.artifactType, "StagedSourceReceipt");
  assert.equal(receipt.stagedObject.stagedObjectId, stagedObjectIdOf({ contentHash: hashA(), sizeBytes: SIZE_A }));
  assert.deepEqual(receipt.claim, { claimId: c.claim.claimId, claimTargetId: c.claim.claimTarget.claimTargetId });
  assert.deepEqual(receipt.attemptRegistration, c.claim.attemptRegistration);
  assert.deepEqual(receipt.dag, c.claim.dag);
  assert.deepEqual(receipt.admission, c.claim.admission);
  assert.deepEqual(receipt.source, { assetId: assetA(), sourceAccessReceipt: source.receipt });
  assert.deepEqual(receipt.expected, { contentHash: hashA(), sizeBytes: SIZE_A });
  assert.deepEqual(receipt.observed, { contentHash: hashA(), sizeBytes: SIZE_A, hashScope: "exact_bytes_copied_from_one_opened_source_handle" });
  assert.equal(receipt.stagedObject.publication, "published_by_this_stage");
  assert.equal(receipt.stagedAt, RUNTIME_START);
  assert.deepEqual(StagedSourceReceiptSchema.parse(receipt), receipt);
  assert.notEqual(stagedObjectIdOf({ contentHash: hashA(), sizeBytes: SIZE_A + 1 }), receipt.stagedObject.stagedObjectId);
});

test("52 53 the final staged file's full SHA-256 and size equal the authorized identity", async t => {
  const c = await claimed(t), receipt = await stageClaimedSource(c.call, { assetId: assetA() });
  const bytes = await readFile(stagedPath(c.env.runtime, receipt.stagedObject.stagedObjectId));
  assert.equal(sha256Hex(bytes), hashA());
  assert.equal(bytes.length, SIZE_A);
  const info = await lstat(stagedPath(c.env.runtime, receipt.stagedObject.stagedObjectId));
  assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.equal(info.mode & 0o222, 0, "the published staged object is read-only");
});

test("54 a StagedSourceReceipt carries no path, URL, filename or command", async t => {
  const c = await claimed(t), receipt = await stageClaimedSource(c.call, { assetId: assetA() });
  const strings = allStrings(receipt);
  assert.equal(strings.some(s => /[\\/]|^[A-Za-z]:|https?:|file:|\.bin$|take_0/.test(s)), false);
  assert.equal([...allKeys(receipt)].some(locationKey), false);
});

test("55 an existing valid staged object is reverified before it is reused", async t => {
  const c = await claimed(t), first = await stageClaimedSource(c.call, { assetId: assetA() });
  let finalOpens = 0;
  const staging = { ...c.env.runtime.staging, createPending: () => c.env.runtime.staging.createPending(), locate: (key: string) => c.env.runtime.staging.locate(key),
    openFinal: (key: string) => { finalOpens += 1; return c.env.runtime.staging.openFinal(key); } };
  c.env.clock.advance(1_000);
  const second = await stageClaimedSource({ ...c.call, runtime: { ...c.env.runtime, staging } }, { assetId: assetA() });
  assert.equal(second.stagedObject.publication, "existing_object_reverified");
  assert.equal(second.stagedObject.stagedObjectId, first.stagedObject.stagedObjectId);
  assert.ok(finalOpens >= 1);
  assert.notEqual(second.stagedSourceReceiptId, first.stagedSourceReceiptId);
});

test("56 57 an existing corrupt staged object refuses and is never overwritten, repaired or regenerated", async t => {
  const c = await claimed(t), id = stagedObjectIdOf({ contentHash: hashA(), sizeBytes: SIZE_A }), path = stagedPath(c.env.runtime, id);
  const corrupt = deterministicBytes("gate7-batch2a-corrupt-object", SIZE_A);
  await writeFile(path, corrupt);
  const before = await lstat(path, { bigint: true });
  assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: assetA() })), "staged_object_corrupt");
  const after = await lstat(path, { bigint: true });
  assert.equal(after.ino, before.ino);
  assert.deepEqual(new Uint8Array(await readFile(path)), corrupt);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagingPending), []);
});

test("57 a valid published object is never replaced by a later publisher of other bytes", async t => {
  const c = await claimed(t), receipt = await stageClaimedSource(c.call, { assetId: assetA() }), key = ownedKey(receipt.stagedObject.stagedObjectId, "staged_source_object_v0");
  const pending = await c.env.runtime.staging.createPending();
  await pending.write(deterministicBytes("gate7-batch2a-late-publisher", 4096));
  await pending.seal();
  assert.equal(await pending.publish(key), "exists");
  await pending.discard();
  assert.equal(sha256Hex(await readFile(stagedPath(c.env.runtime, receipt.stagedObject.stagedObjectId))), hashA());
});

test("58 concurrent staging of the same authorized bytes publishes one correct content object", async t => {
  const c = await claimed(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => stageClaimedSource(c.call, { assetId: assetA() })));
  assert.equal(new Set(results.map(r => r.stagedObject.stagedObjectId)).size, 1);
  assert.equal(results.filter(r => r.stagedObject.publication === "published_by_this_stage").length, 1);
  assert.equal(results.filter(r => r.stagedObject.publication === "existing_object_reverified").length, 7);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagedObjects), [`${ownedKey(results[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")}.bin`]);
  assert.equal(sha256Hex(await readFile(stagedPath(c.env.runtime, results[0]!.stagedObject.stagedObjectId))), hashA());
  assert.deepEqual(await readdir(c.env.runtime.layout.stagingPending), []);
});

test("59 an incomplete pending object is never treated as the final content object", async t => {
  const c = await claimed(t), key = ownedKey(stagedObjectIdOf({ contentHash: hashA(), sizeBytes: SIZE_A }), "staged_source_object_v0");
  await writeFile(join(c.env.runtime.layout.stagingPending, `${key}.bin`), bytesA().subarray(0, 1000));
  await writeFile(join(c.env.runtime.layout.stagingPending, `${"e".repeat(32)}.pending`), bytesA().subarray(0, 5000));
  assert.deepEqual(await c.env.runtime.staging.openFinal(key), { state: "absent" });
  const receipt = await stageClaimedSource(c.call, { assetId: assetA() });
  assert.equal(receipt.stagedObject.publication, "published_by_this_stage");
  assert.equal(sha256Hex(await readFile(stagedPath(c.env.runtime, receipt.stagedObject.stagedObjectId))), hashA());
  assert.equal((await readFile(join(c.env.runtime.layout.stagingPending, `${key}.bin`))).length, 1000);
});

test("60 an interrupted copy before publication creates no final object and no receipt", async t => {
  const c = await claimed(t);
  const sources: SourceLocator = { resolve: assetId => c.env.runtime.sources.resolve(assetId),
    open: async resolved => wrapReader(await c.env.runtime.sources.open(resolved), (_chunk, _position, call) => { if (call === 2) throw new Error("simulated crash mid-copy"); }) };
  assert.equal(await refusal(() => stageClaimedSource({ ...c.call, runtime: withSources(c.env.runtime, sources) }, { assetId: assetA() })), "source_unavailable");
  assert.deepEqual(await readdir(c.env.runtime.layout.stagedObjects), []);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagingPending), []);
  // A hard crash leaves the pending name behind: it stays garbage and a later stage still publishes and verifies its own final object.
  await writeFile(join(c.env.runtime.layout.stagingPending, `${"f".repeat(32)}.pending`), bytesA().subarray(0, STAGING_CHUNK_BYTES));
  const receipt = await stageClaimedSource(c.call, { assetId: assetA() });
  assert.equal(receipt.stagedObject.publication, "published_by_this_stage");
});

// ================================================================ 61-64 source TOCTOU
test("61 replacing the original source after staging never alters the staged bytes, and dispatch points only at the staged object", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  await writeFile(join(c.env.base, "replacement.bin"), deterministicBytes("gate7-batch2a-replacement", SIZE_A));
  await rename(join(c.env.base, "replacement.bin"), c.env.sourcePath("take_0.bin"));
  assert.notEqual(sha256Hex(await readFile(c.env.sourcePath("take_0.bin"))), hashA());
  const e = await recheckAll(c, staged), p = prep(c, e), result = await prepareDispatch(p.call, p.request);
  const handle = result.stagedSources[0]!;
  assert.equal(handle.stagedObjectId, staged[0]!.stagedObject.stagedObjectId);
  assert.equal(resolve(handle.localPath), resolve(stagedPath(c.env.runtime, handle.stagedObjectId)));
  assert.notEqual(resolve(handle.localPath), resolve(c.env.sourcePath("take_0.bin")));
  assert.equal(sha256Hex(await readFile(handle.localPath)), hashA());
});

test("62 the original source path is not needed after staging", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  await unlink(c.env.sourcePath("take_0.bin"));
  assert.equal(await refusal(() => c.env.runtime.sources.resolve(assetA())), "source_unavailable");
  const e = await recheckAll(c, staged), p = prep(c, e), result = await prepareDispatch(p.call, p.request);
  assert.equal(result.preparation.sources[0]!.stagedObjectId, staged[0]!.stagedObject.stagedObjectId);
  assert.equal(sha256Hex(await readFile(result.stagedSources[0]!.localPath)), hashA());
});

async function tamper(path: string, offset: number): Promise<void> {
  await chmod(path, 0o644);
  const handle = await open(path, "r+");
  try {
    const byte = new Uint8Array(1);
    await handle.read(byte, 0, 1, offset);
    await handle.write(new Uint8Array([byte[0]! ^ 0xff]), 0, 1, offset);
  } finally { await handle.close(); }
}
test("63 64 tampering with the final staged object is detected before preparation, with no fallback to the intact original", async t => {
  const c = await claimed(t), staged = await stageAll(c), e = await recheckAll(c, staged), path = stagedPath(c.env.runtime, staged[0]!.stagedObject.stagedObjectId);
  await tamper(path, 1_234_567);
  const tampered = await readFile(path);
  const p = prep(c, e);
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "staged_object_corrupt");
  assert.equal(sha256Hex(await readFile(c.env.sourcePath("take_0.bin"))), hashA(), "the original is intact, yet it is never used as a fallback");
  assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: assetA() })), "staged_object_corrupt");
  assert.deepEqual(await readFile(path), tampered);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagedObjects), [`${ownedKey(staged[0]!.stagedObject.stagedObjectId, "staged_source_object_v0")}.bin`]);
});

// ================================================================ 65-74 post-claim current authority
test("65 67 an ExecutionGrant and media grant valid at runtime-now pass, and the preparation binds them", async t => {
  const c = await claimed(t), { result } = await prepared(c), prep0 = result.preparation;
  assert.deepEqual(prep0.executionGrant, c.claim.executionGrant);
  assert.deepEqual(prep0.sources[0]!.mediaGrant, { grantId: c.v.mediaGrants[0]!.value.grantId, artifact: c.v.mediaGrants[0]!.ref });
  assert.ok(prep0.preparedAt >= c.claim.claimedAt && prep0.preparedAt < T7.expires);
  const x = expiringA(), expiring = await claimed(t, x), inWindow = await prepared(expiring);
  assert.ok(inWindow.result.preparation.validUntil <= MEDIA_EXPIRES);
});

test("66 an ExecutionGrant expired at runtime-now refuses; a preparation never outlives the grant", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  c.env.clock.set("2026-09-24T01:59:50.000Z");
  const e = await recheckAll(c, staged), p = prep(c, e);
  c.env.clock.set("2026-09-24T01:59:59.000Z");
  const ok = await prepareDispatch(p.call, p.request);
  assert.equal(ok.preparation.validUntil, T7.expires);
  c.env.clock.set(T7.expires);
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "execution_grant_expired");
  assert.equal(await refusal(() => confirmDispatchPreparationCurrent(p.call, ok.preparation)), "dispatch_preparation_expired");
});

test("68 a media grant that expired after Batch-1 admission refuses", async t => {
  const c = await claimed(t, expiringA()), staged = await stageAll(c);
  assert.ok(c.v.admission.admittedAt < MEDIA_EXPIRES);
  c.env.clock.set("2026-09-24T01:29:55.000Z");
  const e = await recheckAll(c, staged), p = prep(c, e);
  c.env.clock.set("2026-09-24T01:29:59.999Z");
  assert.equal((await prepareDispatch(p.call, p.request)).preparation.validUntil, MEDIA_EXPIRES);
  c.env.clock.set(MEDIA_EXPIRES);
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "media_grant_expired");
});

test("69 a lifecycle observation from before the claim refuses", async t => {
  const c = await claimed(t), e = await evidence(c);
  const early = forgeObservation(e.lifecycle[0]!, o => retime(o, "2026-09-24T01:09:59.999Z"));
  const p = prep(c, e, { lifecycle: [supplied(early, early.observationId)] });
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "lifecycle_stale");
});

test("70 a lifecycle observation from before its staged source refuses", async t => {
  const c = await claimed(t), first = await stageAll(c), e = await recheckAll(c, first);
  c.env.clock.advance(1_000);
  const restaged = await stageAll(c);
  const rebound = forgeObservation(e.lifecycle[0]!, o => { o.stagedSource = { stagedSourceReceiptId: restaged[0]!.stagedSourceReceiptId, stagedAt: restaged[0]!.stagedAt }; });
  const stagedArtifacts = restaged.map(s => supplied(s, s.stagedSourceReceiptId));
  const unbound = prep(c, { ...e, staged: restaged }, { staged: stagedArtifacts });
  assert.equal(await refusal(() => prepareDispatch(unbound.call, unbound.request)), "lifecycle_observation_invalid");
  const p = prep(c, { ...e, staged: restaged }, { staged: stagedArtifacts, lifecycle: [supplied(rebound, rebound.observationId)] });
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "lifecycle_stale");
});

test("71 a current deletion request refuses", async t => {
  const c = await claimed(t);
  const e = await evidence(c, { lifecycle: new SyntheticLifecycleProvider(() => ({ lifecycle: { deletionRequestedAt: "2026-09-24T01:05:00.000Z", expiresAt: null } })) });
  const p = prep(c, e);
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "lifecycle_deleted");
});

test("72 current retention expiry refuses at its exact instant; one millisecond before, the preparation ends at expiry", async t => {
  const expiresAt = "2026-09-24T01:10:05.000Z";
  const c = await claimed(t), e = await evidence(c, { lifecycle: new SyntheticLifecycleProvider(() => ({ lifecycle: { deletionRequestedAt: null, expiresAt } })) });
  const p = prep(c, e);
  c.env.clock.set("2026-09-24T01:10:04.999Z");
  assert.equal((await prepareDispatch(p.call, p.request)).preparation.validUntil, expiresAt);
  c.env.clock.set(expiresAt);
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "lifecycle_expired");
});

test("73 a foreign-scope lifecycle observation refuses, from a provider or as a record", async t => {
  const c = await claimed(t), staged = await stageAll(c), foreign = { ...scope, projectId: "project_other" };
  assert.equal(await refusal(() => observeSourceLifecycle(c.call, { stagedSource: staged[0]!, provider: new SyntheticLifecycleProvider(() => ({ scope: foreign })) })),
    "scope_mismatch");
  const e = await recheckAll(c, staged), forged = forgeObservation(e.lifecycle[0]!, o => { o.scope = foreign; });
  const p = prep(c, e, { lifecycle: [supplied(forged, forged.observationId)] });
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "scope_mismatch");
});

test("74 a lifecycle observation of another asset or hash refuses", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  assert.equal(await refusal(() => observeSourceLifecycle(c.call, { stagedSource: staged[0]!,
    provider: new SyntheticLifecycleProvider(() => ({ contentHash: "b".repeat(64) })) })), "lifecycle_observation_invalid");
  assert.equal(await refusal(() => observeSourceLifecycle(c.call, { stagedSource: staged[0]!,
    provider: new SyntheticLifecycleProvider(() => ({ assetId: `asset_${"b".repeat(64)}` })) })), "lifecycle_observation_invalid");
  const e = await recheckAll(c, staged);
  const other = forgeObservation(e.lifecycle[0]!, o => { o.source = { ...o.source, assetId: `asset_${"b".repeat(64)}`, contentHash: "b".repeat(64) }; });
  const p = prep(c, e, { lifecycle: [supplied(other, other.observationId)] });
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "lifecycle_observation_invalid");
});

// ================================================================ 75-85 post-claim capability and runtime rechecks
test("75 a synthetic claim-bound capability recheck can pass and names itself test-only", async t => {
  const c = await claimed(t), checker = new SyntheticCapabilityRechecker(), recheck = await recheckDispatchCapability(c.call, { checker });
  assert.equal(recheck.artifactType, "DispatchCapabilityRecheck");
  assert.deepEqual(recheck.claim, { claimId: c.claim.claimId, claimTargetId: c.claim.claimTarget.claimTargetId });
  assert.deepEqual(recheck.dag, c.claim.dag);
  assert.equal(recheck.renderComputationId, c.claim.renderBinding.renderComputationId);
  assert.deepEqual([recheck.executor, recheck.environment], [c.v.admission.executor, c.v.admission.environment]);
  assert.ok(recheck.observedAt >= c.claim.claimedAt);
  assert.equal(recheck.checker.basis, "synthetic_test_capability_rechecker_no_real_executor_probe_v0");
  assert.equal(recheck.outcome.state, "available");
  assert.deepEqual(checker.requests[0]!.requirements, c.v.admission.capability.requirements.map(r => ({ requirementId: r.requirementId, capabilityId: r.capabilityId })));
});

test("76 pre-claim Batch-1 capability evidence can never substitute for a post-claim recheck", async t => {
  const c = await claimed(t), e = await evidence(c);
  const snapshot = c.x.artifacts.find(a => a.ref.artifactType === "CapabilitySnapshot" && a.ref.objectId === c.v.grant.capabilitySnapshot.objectId)!;
  const asSnapshot = prep(c, e, { capability: snapshot });
  assert.equal(await refusal(() => prepareDispatch(asSnapshot.call, asSnapshot.request)), "capability_recheck_invalid");
  const relabeled = forgeCapability(e.capability, r => retime(r, c.v.admission.capability.asOf));
  const copied = prep(c, e, { capability: supplied(relabeled, relabeled.recheckId) });
  assert.equal(await refusal(() => prepareDispatch(copied.call, copied.request)), "capability_recheck_stale");
  const attestation = c.v.admission.capability.requirements[0]!.attestation;
  assert.equal(await refusal(() => recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker(request => ({ outcome: { state: "available",
    requirements: request.requirements.map(r => ({ ...r, state: "AVAILABLE" as const })), evidence: [{ artifact: attestation, pointer: "" }] } })) })), "capability_recheck_invalid");
});

test("77 capability recheck freshness is exclusive: one millisecond before its maximum age passes, exactly at it and after it refuse", async t => {
  const policy = dispatchPolicy({ freshness: { maxCapabilityRecheckAgeMilliseconds: 30_000, maxRuntimeRecheckAgeMilliseconds: 60_000, maxLifecycleObservationAgeMilliseconds: 60_000 } });
  const c = await claimed(t), e = await evidence(c, { policy }), p = prep(c, e), at = Date.parse(e.capability.observedAt);
  c.env.clock.set(new Date(at + 29_999).toISOString());
  await prepareDispatch(p.call, p.request);
  for (const late of [30_000, 30_001]) {
    c.env.clock.set(new Date(at + late).toISOString());
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "capability_recheck_stale", String(late));
  }
});

test("78 an unavailable or failed capability recheck refuses", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  for (const outcome of [{ state: "unavailable" as const, reasonCode: "resource_blocked" as const, evidence: [{ artifact: RUNTIME_EVIDENCE[1]!.ref, pointer: "" }] },
    { state: "failed" as const, failureCode: "synthetic_probe_rejected", evidence: [{ artifact: RUNTIME_EVIDENCE[1]!.ref, pointer: "" }] }]) {
    const e = await recheckAll(c, staged, { capability: new SyntheticCapabilityRechecker(() => ({ outcome })) }), p = prep(c, e);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "capability_recheck_unavailable");
  }
});

test("79 a capability recheck of another executor build, environment or requirement set refuses", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  const variants: ((request: CapabilityRecheckRequest) => Partial<CapabilityRecheckResponse>)[] = [
    request => ({ executor: { ...request.executor, implementationDigest: "e".repeat(64) } }),
    request => ({ executor: { ...request.executor, version: "0.2.0" } }),
    () => ({ environment: "synthetic_other_environment" }),
    request => ({ outcome: { state: "available", requirements: request.requirements.map(r => ({ ...r, capabilityId: "transition_cut", state: "AVAILABLE" as const })),
      evidence: [{ artifact: RUNTIME_EVIDENCE[1]!.ref, pointer: "" }] } }),
    request => ({ outcome: { state: "available", requirements: [...request.requirements, { requirementId: "requirement_not_admitted", capabilityId: "color_look" }]
      .map(r => ({ ...r, state: "AVAILABLE" as const })), evidence: [{ artifact: RUNTIME_EVIDENCE[1]!.ref, pointer: "" }] } }),
  ];
  for (const variant of variants) {
    const e = await recheckAll(c, staged, { capability: new SyntheticCapabilityRechecker(variant) }), p = prep(c, e);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "capability_recheck_mismatch");
  }
  // An AVAILABLE outcome over no requirement at all is not even a recordable recheck.
  assert.equal(await refusal(() => recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker(() => ({ outcome: { state: "available", requirements: [],
    evidence: [{ artifact: RUNTIME_EVIDENCE[1]!.ref, pointer: "" }] } })) })), "capability_recheck_invalid");
});

test("80 a synthetic claim-bound runtime recheck can pass and names itself test-only", async t => {
  const c = await claimed(t), recheck = await recheckDispatchRuntime(c.call, { checker: new SyntheticRuntimeRechecker() });
  assert.equal(recheck.artifactType, "DispatchRuntimeRecheck");
  assert.deepEqual(recheck.claim, { claimId: c.claim.claimId, claimTargetId: c.claim.claimTarget.claimTargetId });
  assert.deepEqual(recheck.runtime, c.v.admission.runtime.identity);
  assert.deepEqual(recheck.encoding, { video: c.v.dag.settings.video, audio: c.v.dag.settings.audio });
  assert.deepEqual([recheck.renderIntent, recheck.renderProfile], [c.v.dag.renderIntent, c.v.dag.renderProfile]);
  assert.equal(recheck.checker.basis, "synthetic_test_runtime_rechecker_no_real_runtime_probe_v0");
  assert.ok(recheck.observedAt >= c.claim.claimedAt);
});

test("81 the pre-claim Batch-1 runtime attestation can never substitute for a post-claim runtime recheck", async t => {
  const c = await claimed(t), e = await evidence(c);
  const attestation = c.x.artifacts.find(a => a.ref.objectId === c.v.admission.runtime.attestation.objectId)!;
  const asAttestation = prep(c, e, { runtime: attestation });
  assert.equal(await refusal(() => prepareDispatch(asAttestation.call, asAttestation.request)), "runtime_recheck_invalid");
  const relabeled = forgeRuntime(e.runtimeCheck, r => retime(r, c.v.admission.runtime.observedAt));
  const copied = prep(c, e, { runtime: supplied(relabeled, relabeled.recheckId) });
  assert.equal(await refusal(() => prepareDispatch(copied.call, copied.request)), "runtime_recheck_stale");
});

test("82 runtime recheck freshness is exclusive: one millisecond before its maximum age passes, exactly at it and after it refuse", async t => {
  const policy = dispatchPolicy({ freshness: { maxCapabilityRecheckAgeMilliseconds: 60_000, maxRuntimeRecheckAgeMilliseconds: 30_000, maxLifecycleObservationAgeMilliseconds: 60_000 } });
  const c = await claimed(t), e = await evidence(c, { policy }), p = prep(c, e), at = Date.parse(e.runtimeCheck.observedAt);
  c.env.clock.set(new Date(at + 29_999).toISOString());
  await prepareDispatch(p.call, p.request);
  for (const late of [30_000, 30_001]) {
    c.env.clock.set(new Date(at + late).toISOString());
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "runtime_recheck_stale", String(late));
  }
});

test("83 an unavailable or failed runtime recheck refuses", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  for (const outcome of [{ state: "unavailable" as const, reasonCode: "unconfigured" as const, evidence: [{ artifact: RUNTIME_EVIDENCE[2]!.ref, pointer: "" }] },
    { state: "failed" as const, failureCode: "synthetic_runtime_check_failed", evidence: [{ artifact: RUNTIME_EVIDENCE[2]!.ref, pointer: "" }] }]) {
    const e = await recheckAll(c, staged, { runtime: new SyntheticRuntimeRechecker(() => ({ outcome })) }), p = prep(c, e);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "runtime_recheck_unavailable");
  }
});

test("84 85 a runtime recheck of another runtime version or digest, encoding, intent or profile refuses", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  const variants: ((request: RuntimeRecheckRequest) => Partial<RuntimeRecheckResponse>)[] = [
    request => ({ runtime: { ...request.runtime, version: "0.2.0" } }),
    request => ({ runtime: { ...request.runtime, implementationDigest: "e".repeat(64) } }),
    request => ({ encoding: { ...request.encoding, audio: { ...request.encoding.audio, sampleRateHz: 44100 as const } } }),
    request => ({ encoding: { ...request.encoding, audio: { ...request.encoding.audio, channelLayout: "mono" as const } } }),
    () => ({ renderIntent: "preview" as const }),
    () => ({ renderProfile: previewA().dag.renderProfile }),
    request => ({ executor: { ...request.executor, implementationDigest: "e".repeat(64) } }),
    () => ({ environment: "synthetic_other_environment" }),
  ];
  for (const variant of variants) {
    const e = await recheckAll(c, staged, { runtime: new SyntheticRuntimeRechecker(variant) }), p = prep(c, e);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "runtime_recheck_mismatch");
  }
});

// ================================================================ 86-98 DispatchPreparation
test("86 exact, fresh, claim-bound evidence creates a DispatchPreparation", async t => {
  const c = await claimed(t), { e, result } = await prepared(c), prep0 = result.preparation;
  assert.equal(prep0.artifactType, "DispatchPreparation");
  assert.deepEqual(prep0.attemptRegistration, c.claim.attemptRegistration);
  assert.deepEqual(prep0.claim, { claimId: c.claim.claimId, claimTargetId: c.claim.claimTarget.claimTargetId, claimedAt: c.claim.claimedAt });
  assert.deepEqual(prep0.claimTarget, c.v.dag.dispatch.claimTarget);
  assert.deepEqual([prep0.dag, prep0.admission, prep0.executionGrant], [c.claim.dag, c.claim.admission, c.claim.executionGrant]);
  assert.equal(prep0.renderComputationId, c.v.dag.dispatch.renderBinding.renderComputationId);
  assert.deepEqual([prep0.executor, prep0.runtime, prep0.environment], [c.v.admission.executor, c.v.admission.runtime.identity, c.v.admission.environment]);
  assert.equal(prep0.sources.length, 1);
  assert.deepEqual(prep0.sources[0]!.stagedSource.stagedSourceReceiptId, e.staged[0]!.stagedSourceReceiptId);
  assert.deepEqual(prep0.sources[0]!.lifecycle.observationId, e.lifecycle[0]!.observationId);
  assert.deepEqual([prep0.capabilityRecheck.recheckId, prep0.runtimeRecheck.recheckId], [e.capability.recheckId, e.runtimeCheck.recheckId]);
  assert.equal(prep0.policy.policyId, e.policy.policyId);
  assert.equal(Date.parse(prep0.validUntil) - Date.parse(prep0.preparedAt), 10_000);
  assert.deepEqual(DispatchPreparationSchema.parse(prep0), prep0);
  assert.equal(result.stagedSources.length, 1);
  assert.throws(() => JSON.stringify(result.stagedSources[0]), EditRuntimeError);
});

test("87 a missing staged source for any admitted source refuses", async t => {
  const c = await claimed(t, twoDag()), first = c.v.admission.sources[0]!;
  const staged = [await stageClaimedSource(c.call, { assetId: first.assetId })], e = await recheckAll(c, staged), p = prep(c, e);
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "staged_source_missing");
  const all = await evidence(c), both = prep(c, all);
  assert.equal((await prepareDispatch(both.call, both.request)).preparation.sources.length, 2);
});

test("88 89 90 a staged source, lifecycle observation or recheck from another claim refuses", async t => {
  const c = await claimed(t), e = await evidence(c), other = await claimed(t), o = await evidence(other);
  assert.notEqual(other.claim.claimId, c.claim.claimId);
  const cases: PrepPatch[] = [
    { staged: [supplied(o.staged[0]!, o.staged[0]!.stagedSourceReceiptId)] },
    { lifecycle: [supplied(o.lifecycle[0]!, o.lifecycle[0]!.observationId)] },
    { capability: supplied(o.capability, o.capability.recheckId) },
    { runtime: supplied(o.runtimeCheck, o.runtimeCheck.recheckId) },
  ];
  for (const patch of cases) {
    const p = prep(c, e, patch);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "claim_mismatch");
  }
});

test("91 a render-computation mismatch refuses", async t => {
  const c = await claimed(t), e = await evidence(c), preview = previewA().dag.dispatch.renderBinding.renderComputationId;
  const capability = forgeCapability(e.capability, r => { r.renderComputationId = preview; });
  const runtimeCheck = forgeRuntime(e.runtimeCheck, r => { r.renderComputationId = preview; });
  for (const patch of [{ capability: supplied(capability, capability.recheckId) }, { runtime: supplied(runtimeCheck, runtimeCheck.recheckId) }]) {
    const p = prep(c, e, patch);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "claim_mismatch");
  }
  const p = prep(c, e, { call: { dag: validated(previewA()) } });
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "claim_mismatch");
});

test("92 93 a preparation carries no filesystem location and starts no media execution", async t => {
  const c = await claimed(t), { result } = await prepared(c), p0 = result.preparation;
  assert.equal(allStrings(p0).some(s => /[\\/]|^[A-Za-z]:|https?:|file:|\.bin$|take_0|gate7-b2a-/.test(s)), false);
  assert.equal([...allKeys(p0)].some(locationKey), false);
  assert.equal(p0.mediaExecution, "not_started");
  assert.equal(p0.evidenceGrade, "synthetic_post_claim_rechecks_not_real_probes_batch2a");
});

test("94 a preparation replays deterministically and is current within its window", async t => {
  const c = await claimed(t), { p, result } = await prepared(c);
  c.env.clock.advance(5_000);
  assert.deepEqual(await replayDispatchPreparation(p.call, result.preparation), result.preparation);
  const current = await confirmDispatchPreparationCurrent(p.call, result.preparation);
  assert.deepEqual(current.preparation, result.preparation);
  assert.equal(current.stagedSources[0]!.stagedObjectId, result.stagedSources[0]!.stagedObjectId);
});

test("95 a coordinated reseal of any preparation binding fails replay", async t => {
  const c = await claimed(t), { p, result } = await prepared(c), p0 = result.preparation;
  const forgeries = [
    // A window shortened by one millisecond is structurally valid; only replay can object.
    forgePreparation(p0, d => { d.validUntil = new Date(Date.parse(d.validUntil) - 1).toISOString(); }),
    forgePreparation(p0, d => { d.preparedAt = new Date(Date.parse(d.preparedAt) + 1).toISOString(); }),
    forgePreparation(p0, d => { d.claim.claimId = `execution_claim_v0_${"1".repeat(64)}`; }),
    forgePreparation(p0, d => { d.renderComputationId = previewA().dag.dispatch.renderBinding.renderComputationId; }),
    forgePreparation(p0, d => { d.sources[0]!.stagedObjectId = stagedObjectIdOf({ contentHash: "c".repeat(64), sizeBytes: SIZE_A }); }),
    forgePreparation(p0, d => { d.executor = { ...d.executor, implementationDigest: "e".repeat(64) }; }),
  ];
  for (const forged of forgeries) assert.equal(await refusal(() => replayDispatchPreparation(p.call, forged)), "dispatch_preparation_replay_mismatch");
  // A window extended past an evidence freshness expiry is refused structurally, before any replay, even when coherently re-identified.
  assert.equal(await refusal(() => replayDispatchPreparation(p.call, forgePreparation(p0, d => { d.validUntil = "2026-09-24T01:59:00.000Z"; }))),
    "dispatch_preparation_invalid");
  assert.equal(await refusal(() => replayDispatchPreparation(p.call, { ...p0, validUntil: "2026-09-24T01:59:00.000Z" })), "dispatch_preparation_invalid");
  assert.equal(await refusal(() => replayDispatchPreparation(p.call, forgePreparation(p0, d => { (d as { mediaExecution: string }).mediaExecution = "started"; }))),
    "dispatch_preparation_invalid");
});

test("96 97 a preparation is current one millisecond before validUntil and expired at validUntil", async t => {
  const c = await claimed(t), { p, result } = await prepared(c), until = Date.parse(result.preparation.validUntil);
  c.env.clock.set(new Date(until - 1).toISOString());
  await confirmDispatchPreparationCurrent(p.call, result.preparation);
  c.env.clock.set(result.preparation.validUntil);
  assert.equal(await refusal(() => confirmDispatchPreparationCurrent(p.call, result.preparation)), "dispatch_preparation_expired");
});

test("98 an expired preparation never releases the claim; a new preparation needs new post-claim rechecks", async t => {
  const c = await claimed(t), { e, p, result } = await prepared(c);
  c.env.clock.set(new Date(Date.parse(result.preparation.validUntil) + 60_000).toISOString());
  assert.equal(await refusal(() => confirmDispatchPreparationCurrent(p.call, result.preparation)), "dispatch_preparation_expired");
  assert.deepEqual(await observeExecutionClaim(c.claim.claimTarget.claimTargetId, c.env.runtime), c.claim);
  assert.equal(await refusal(() => acquireExecutionClaim(c.v, { workerId: "worker_after_expiry" }, c.env.runtime)), "claim_already_acquired");
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "lifecycle_stale");
  const renewed = await recheckAll(c, e.staged), again = prep(c, renewed);
  const next = await prepareDispatch(again.call, again.request);
  assert.equal(next.preparation.claim.claimId, c.claim.claimId);
  assert.ok(next.preparation.preparedAt > result.preparation.validUntil);
});

// ================================================================ 99-107 no media execution, no fabricated public contracts
const ADAPTER = "scripts/edit-runtime-local.ts";
const productionFiles = () => [...readdirSync("packages/edit-runtime").filter(f => f.endsWith(".ts")).map(f => `packages/edit-runtime/${f}`), ADAPTER];
const parsed = (path: string) => ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
function walk(node: ts.Node, visit: (node: ts.Node) => void): void { visit(node); ts.forEachChild(node, child => walk(child, visit)); }
function importsOf(path: string): string[] {
  const found: string[] = [];
  walk(parsed(path), node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("<dynamic import>");
  });
  return found;
}
test("99 production Batch-2A code imports no subprocess, network or media module", () => {
  const core = new Set(["zod", "node:crypto", "../contracts/common.js", "../domain/serialization.js", "../editorial/common.js", "../edit-graph/common.js", "../routing/index.js",
    "../edit-execution/index.js", "../edit-execution/common.js", "../edit-execution/runtime.js"]);
  for (const path of productionFiles()) {
    for (const specifier of importsOf(path)) {
      if (path === ADAPTER) assert.ok(["node:crypto", "node:fs", "node:fs/promises", "node:path", "../packages/edit-runtime/index.js"].includes(specifier), `${path}: ${specifier}`);
      else assert.ok(specifier.startsWith("./") || core.has(specifier), `${path}: ${specifier}`);
    }
  }
});

test("100 101 102 production Batch-2A code calls no spawn, exec, execFile or fork and names no encoder, probe, filter graph or network URL", () => {
  const forbiddenCalls = new Set(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork", "fetch", "eval"]);
  for (const path of productionFiles()) {
    const source = readFileSync(path, "utf8");
    assert.equal(/child_process|ffmpeg|ffprobe|filter_complex|https?:\/\/|worker_threads|node:net|node:http|node:dgram|node:tls|node:vm/i.test(source), false, path);
    walk(parsed(path), node => {
      if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      assert.equal(forbiddenCalls.has(name), false, `${path}: ${name}`);
    });
  }
});

function closure(entry: string): { modules: Set<string>; externals: Set<string> } {
  const modules = new Set<string>(), externals = new Set<string>(), pending = [resolve(entry)];
  while (pending.length) {
    const file = pending.pop()!;
    if (modules.has(file)) continue;
    modules.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(/(?:^|[\n;])\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|[\n;])\s*import\s*["']([^"']+)["']/g)) {
      const specifier = (match[1] ?? match[2])!;
      if (specifier.startsWith(".")) pending.push(resolve(dirname(file), specifier));
      else externals.add(specifier);
    }
  }
  return { modules, externals };
}
test("103 the compiled runtime import closure reaches no media adapter, provider, decoder, encoder or subprocess module", () => {
  const core = closure("dist/packages/edit-runtime/index.js"), adapter = closure("dist/scripts/edit-runtime-local.js");
  assert.deepEqual([...core.externals].sort(), ["node:crypto", "zod"]);
  assert.deepEqual([...adapter.externals].sort(), ["node:crypto", "node:fs/promises", "node:path", "zod"]);
  for (const module of [...core.modules, ...adapter.modules]) {
    const normalized = module.replace(/\\/g, "/");
    // Every local media adapter lives under scripts/; the provider seams live under packages/providers/.
    assert.equal(normalized.includes("/dist/packages/providers/"), false, normalized);
    if (normalized.includes("/dist/scripts/")) assert.ok(normalized.endsWith("/dist/scripts/edit-runtime-local.js"), normalized);
  }
});

test("104 105 106 107 no UEP, RenderResult, QCResult, DecisionEvent, job state or confidence is emitted", async t => {
  const c = await claimed(t), { e, result } = await prepared(c);
  const registration = await observeAttemptRegistration(SLOT, c.env.runtime);
  const records = [registration, c.claim, ...e.staged, ...e.lifecycle, e.capability, e.runtimeCheck, e.policy, result.preparation];
  const types = new Set(["AttemptRegistration", "ExecutionClaim", "StagedSourceReceipt", "SourceLifecycleObservation", "DispatchCapabilityRecheck", "DispatchRuntimeRecheck",
    "RuntimeDispatchPolicy", "DispatchPreparation"]);
  for (const record of records) {
    assert.ok(types.has((record as { artifactType: string }).artifactType));
    for (const schema of [UniversalEditPlanSchema, RenderResultSchema, QCResultSchema, DecisionEventSchema, JobStateSchema]) assert.equal(schema.safeParse(record).success, false);
    assert.deepEqual([...allKeys(record)].filter(k => /confidence|decisionEvent|renderResult|qcResult/i.test(k)
      || ["planId", "planRevision", "slotId", "jobId", "contractType", "schemaVersion"].includes(k)), []);
  }
  assert.equal(new Set(records.map(r => (r as { artifactType: string }).artifactType)).size, types.size);
});

test("the local adapter's system clock and entropy produce exact UTC milliseconds and fresh 256-bit ownership tokens", () => {
  assert.match(systemRuntimeClock.now(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const a = systemRuntimeEntropy.ownershipToken(), b = systemRuntimeEntropy.ownershipToken();
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, b);
});

test("runtime state stays inside isolated temporary roots, never tracked directories", async t => {
  const env = await envFor(t);
  assert.ok(resolve(env.runtime.layout.root).toLowerCase().includes("gate7-b2a-"));
  assert.equal(resolve(env.runtime.layout.root).toLowerCase().startsWith(resolve(".").toLowerCase()), false);
  await rm(env.base, { recursive: true, force: true });
});

// ================================================================ adversarial self-review (written after the first green run)
const ROOT_NAMESPACES = ["attempt-registrations", "execution-claims", "ledger-pending", "staged-objects", "staging-pending"];

test("A01 raw IDs with colons and dots never shape a storage name, and an ID of another namespace never addresses runtime state", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const odd = budgetChain({ prefix: "b2a_odd", operationId: "op:..:C:evil.json" });
  const r = await registerAttempt({ reservation: odd.reservationArtifact.ref }, odd.artifacts, env.runtime);
  assert.equal(r.registration.attemptSlot.operationId, "op:..:C:evil.json");
  assert.deepEqual(await readdir(env.runtime.layout.attemptRegistrations), [`${ownedKey(r.registration.attemptSlot.attemptSlotId, "execution_attempt_slot_v0")}.json`]);
  assert.deepEqual((await readdir(env.runtime.layout.root)).sort(), ROOT_NAMESPACES);
  const c = await claimed(t), hex = ownedKey(c.claim.claimTarget.claimTargetId, "execution_claim_target_v0");
  for (const id of [`execution_claim_v0_${hex}`, `attempt_registration_v0_${hex}`, `x_${hex}`, `execution_attempt_slot_v0_${hex}`]) {
    assert.equal(await refusal(() => observeExecutionClaim(id, c.env.runtime)), "input_invalid", id);
  }
  assert.deepEqual(await observeExecutionClaim(c.claim.claimTarget.claimTargetId, c.env.runtime), c.claim);
});

test("A02 ledger and staging ports admit only owned digests and known namespaces: traversal, absolute, URL-like or unbounded input refuses", async t => {
  const env = await runtimeEnv();
  t.after(env.cleanup);
  const bytes = text("{}\n"), { ledger, staging } = env.runtime;
  for (const key of ["../../escape", "C:\\escape", "https://example.invalid/x", "A".repeat(64), "a".repeat(63), `${"a".repeat(64)}.json`, `..\\${"a".repeat(62)}`]) {
    assert.equal(await refusal(() => ledger.publishExclusive("execution_claim", key, bytes)), "input_invalid", key);
    assert.equal(await refusal(() => ledger.read("attempt_registration", key, 100)), "input_invalid", key);
    assert.equal(await refusal(() => staging.openFinal(key)), "input_invalid", key);
    assert.equal(await refusal(() => staging.locate(key)), "input_invalid", key);
  }
  assert.equal(await refusal(() => ledger.publishExclusive("../attempt-registrations" as never, "a".repeat(64), bytes)), "input_invalid");
  for (const id of ["../x", "execution_claim_target_v0_../../x", "C:x", `EXECUTION_${"a".repeat(64)}`]) assert.equal(await refusal(() => ownedKey(id, "execution_claim_target_v0")), "input_invalid", id);
  assert.equal(await refusal(() => ledger.publishExclusive("execution_claim", "a".repeat(64), new Uint8Array(MAX_RUNTIME_RECORD_BYTES + 1))), "limit_exceeded");
  assert.equal(await refusal(() => ledger.publishExclusive("execution_claim", "a".repeat(64), new Uint8Array(0))), "limit_exceeded");
  assert.deepEqual((await readdir(env.runtime.layout.root)).sort(), ROOT_NAMESPACES);
  for (const namespace of ROOT_NAMESPACES) assert.deepEqual(await readdir(join(env.runtime.layout.root, namespace)), [], namespace);
});

test("A03 an occupied registration name that is a link, a directory, oversized, of another slot, of a broken identity or non-canonical fails closed", async t => {
  const chain = regChain(), slot = attemptSlot(SLOT);
  const donorEnv = await runtimeEnv();
  t.after(donorEnv.cleanup);
  const other = budgetChain({ prefix: "b2a_slot_other", operationId: "operation_render_other" });
  const donor = (await registerAttempt({ reservation: other.reservationArtifact.ref }, other.artifacts, donorEnv.runtime)).registration;
  const cases: [string, (path: string, env: RuntimeEnv) => Promise<void>][] = [
    ["junction", async (path, env) => { await mkdir(join(env.base, "elsewhere")); await symlink(join(env.base, "elsewhere"), path, "junction"); }],
    ["directory", async path => { await mkdir(path); }],
    ["oversized", async path => { await writeFile(path, "x".repeat(MAX_RUNTIME_RECORD_BYTES + 1)); }],
    ["another slot's valid record", async path => { await writeFile(path, persisted(donor)); }],
    ["broken identity", async path => { await writeFile(path, persisted({ ...donor, attemptSlot: slot })); }],
    ["non-canonical bytes", async path => { await writeFile(path, `${JSON.stringify(donor, null, 2)}\n`); }],
  ];
  for (const [label, occupy] of cases) {
    const env = await runtimeEnv();
    t.after(env.cleanup);
    await occupy(registrationPath(env.runtime, slot.attemptSlotId), env);
    assert.equal(await refusal(() => registerAttempt({ reservation: chain.reservationArtifact.ref }, chain.artifacts, env.runtime)), "attempt_registration_corrupt", label);
    assert.equal(await refusal(() => observeAttemptRegistration(SLOT, env.runtime)), "attempt_registration_corrupt", label);
  }
});

test("A04 claim storage relabel: a valid claim filed under another claim target's name fails closed", async t => {
  const c = await claimed(t), fork = validated(forkBDag()), env = await envFor(t);
  await registerDagAttempt(fork, forkBDag().artifacts, env.runtime);
  await writeFile(claimPath(env.runtime, fork.dag.dispatch.claimTarget.claimTargetId), persisted(c.claim));
  assert.equal(await refusal(() => acquireExecutionClaim(fork, { workerId: "worker_b" }, env.runtime)), "claim_record_corrupt");
  assert.equal(await refusal(() => observeExecutionClaim(fork.dag.dispatch.claimTarget.claimTargetId, env.runtime)), "claim_record_corrupt");
});

test("A05 a forked reservation presented after the claim, or a registration rewritten after it, never gains the claim", async t => {
  const c = await claimed(t), fork = validated(forkBDag()), forkEnv = await envFor(t);
  const forkRegistration = (await registerDagAttempt(fork, forkBDag().artifacts, forkEnv.runtime)).registration;
  assert.equal(await refusal(() => registerDagAttempt(fork, forkBDag().artifacts, c.env.runtime)), "reservation_fork_conflict");
  assert.equal(await refusal(() => acquireExecutionClaim(fork, { workerId: "worker_b" }, c.env.runtime)), "reservation_not_authoritative");
  await writeFile(registrationPath(c.env.runtime, c.v.slot.attemptSlotId), persisted(forkRegistration));
  assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: assetA() })), "reservation_not_authoritative");
  assert.equal(await refusal(() => recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker() })), "reservation_not_authoritative");
});

test("A06 a claim record replaced by another acquisition's valid claim no longer proves this owner", async t => {
  const c = await claimed(t), other = await claimed(t);
  await writeFile(claimPath(c.env.runtime, c.claim.claimTarget.claimTargetId), persisted(other.claim));
  assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: assetA() })), "claim_ownership_required");
});

test("A07 a claim at a runtime-now before its admission or after its grant refuses before any publication", async t => {
  for (const [at, code] of [["2026-09-24T00:59:59.999Z", "evidence_chronology_invalid"], [T7.expires, "execution_grant_expired"]] as const) {
    const env = await envFor(t, vFinalA(), { start: at });
    await registerDagAttempt(vFinalA(), finalA().artifacts, env.runtime);
    assert.equal(await refusal(() => acquireExecutionClaim(vFinalA(), { workerId: "worker_a" }, env.runtime)), code);
    assert.deepEqual(await readdir(env.runtime.layout.executionClaims), []);
  }
});

test("A08 a source replaced between resolution and open refuses; a replacement attempted after open never changes the staged bytes", async t => {
  const env = await envFor(t), resolved = await env.runtime.sources.resolve(assetA());
  await writeFile(join(env.base, "substitute.bin"), bytesA());
  await rename(join(env.base, "substitute.bin"), env.sourcePath("take_0.bin"));
  assert.equal(await refusal(() => env.runtime.sources.open(resolved)), "source_changed");
  const c = await claimed(t);
  let replacement = "not_attempted";
  const sources: SourceLocator = { resolve: assetId => c.env.runtime.sources.resolve(assetId),
    open: async r => wrapReader(await c.env.runtime.sources.open(r), async (_chunk, _position, call) => {
      if (call !== 1) return;
      await writeFile(join(c.env.base, "late.bin"), deterministicBytes("gate7-batch2a-late", SIZE_A));
      try { await rename(join(c.env.base, "late.bin"), c.env.sourcePath("take_0.bin")); replacement = "replaced_while_open"; }
      catch (error) { replacement = `refused_by_platform_${(error as NodeJS.ErrnoException).code}`; }
    }) };
  const receipt = await stageClaimedSource({ ...c.call, runtime: withSources(c.env.runtime, sources) }, { assetId: assetA() });
  assert.equal(sha256Hex(await readFile(stagedPath(c.env.runtime, receipt.stagedObject.stagedObjectId))), hashA());
  t.diagnostic(`replacing the source path while its one handle was open: ${replacement}; the staged bytes stayed the authorized bytes`);
});

test("A09 an in-place source mutation during the copy is caught by the hash of exactly the bytes copied", async t => {
  const c = await claimed(t);
  const sources: SourceLocator = { resolve: assetId => c.env.runtime.sources.resolve(assetId),
    open: async r => wrapReader(await c.env.runtime.sources.open(r), async (_chunk, _position, call) => {
      if (call !== 1) return;
      const writer = await open(c.env.sourcePath("take_0.bin"), "r+");
      try { await writer.write(new Uint8Array([0, 1, 2, 3]), 0, 4, 2 * STAGING_CHUNK_BYTES + 10); } finally { await writer.close(); }
    }) };
  assert.equal(await refusal(() => stageClaimedSource({ ...c.call, runtime: withSources(c.env.runtime, sources) }, { assetId: assetA() })), "source_hash_mismatch");
  assert.deepEqual(await readdir(c.env.runtime.layout.stagedObjects), []);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagingPending), []);
});

test("A10 identical bytes under an unadmitted asset, or reached outside every allowed root, never gain authority", async t => {
  const c = await claimed(t);
  assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: `asset_${"c".repeat(64)}` })), "source_not_admitted");
  const outside = join(c.env.base, "outside_copy.bin");
  await writeFile(outside, bytesA());
  const runtime = await c.env.fresh({ sources: [{ assetId: assetA(), path: outside }] });
  assert.equal(await refusal(() => stageClaimedSource({ ...c.call, runtime }, { assetId: assetA() })), "source_outside_allowed_root");
});

test("A11 staged-receipt forgeries refuse: object identity, coordinated rehash, another DAG, extra, duplicate or location-bearing receipts", async t => {
  const c = await claimed(t), e = await evidence(c), r = e.staged[0]!, forge = (mutate: (d: StagedSourceReceipt) => void) =>
    reidentify(r, "stagedSourceReceiptId", "staged_source_receipt_v0", mutate);
  const other = { contentHash: "c".repeat(64), sizeBytes: SIZE_A };
  const idOnly = forge(d => { d.stagedObject.stagedObjectId = stagedObjectIdOf(other); });
  const rehashed = forge(d => { d.expected = other; d.observed = { ...other, hashScope: d.observed.hashScope }; d.stagedObject.stagedObjectId = stagedObjectIdOf(other); });
  const extra = forge(d => { d.source = { ...d.source, assetId: `asset_${"c".repeat(64)}` }; });
  const located = forge(d => { (d as unknown as Record<string, unknown>)["localPath"] = "C:\\media\\take.bin"; });
  const preview = await claimed(t, previewA()), previewStaged = await stageClaimedSource(preview.call, { assetId: assetA() });
  const cases: [StagedSourceReceipt[], string][] = [[[idOnly], "staged_source_invalid"], [[rehashed], "staged_object_mismatch"], [[previewStaged], "claim_mismatch"],
    [[r, extra], "staged_source_invalid"], [[located], "staged_source_invalid"]];
  for (const [receipts, code] of cases) {
    const p = prep(c, e, { staged: receipts.map(s => supplied(s, s.stagedSourceReceiptId)) });
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), code);
  }
  const duplicate = prep(c, e);
  assert.equal(await refusal(() => prepareDispatch(duplicate.call, { ...duplicate.request, stagedSources: [...duplicate.request.stagedSources, ...duplicate.request.stagedSources] })),
    "staged_source_invalid");
});

test("A12 evidence dated after the preparation refuses as postdating it", async t => {
  const c = await claimed(t), e = await evidence(c), future = "2026-09-24T01:11:00.000Z";
  const lifecycle = forgeObservation(e.lifecycle[0]!, o => retime(o, future));
  const capability = forgeCapability(e.capability, r => retime(r, future)), runtimeCheck = forgeRuntime(e.runtimeCheck, r => retime(r, future));
  for (const patch of [{ lifecycle: [supplied(lifecycle, lifecycle.observationId)] }, { capability: supplied(capability, capability.recheckId) },
    { runtime: supplied(runtimeCheck, runtimeCheck.recheckId) }]) {
    const p = prep(c, e, patch);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "evidence_postdates_preparation");
  }
});

test("A13 a lifecycle observation older than its policy age refuses even when both rechecks are fresh", async t => {
  const c = await claimed(t), e = await evidence(c), p = prep(c, e);
  c.env.clock.set(new Date(Date.parse(e.lifecycle[0]!.observedAt) + 30_001).toISOString());
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "lifecycle_stale");
});

test("A14 a synthetic provider can never claim a real probe or an external query, as a response or as a record", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  assert.equal(await refusal(() => observeSourceLifecycle(c.call, { stagedSource: staged[0]!, provider: new SyntheticLifecycleProvider(() =>
    ({ observer: { ...SYNTHETIC_OBSERVER, basis: "real_lifecycle_database_query_v0" } }) as never) })), "lifecycle_observation_invalid");
  assert.equal(await refusal(() => recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker(() =>
    ({ checker: { ...SYNTHETIC_CAPABILITY_CHECKER, basis: "real_executor_probe_v0" } }) as never) })), "capability_recheck_invalid");
  assert.equal(await refusal(() => recheckDispatchRuntime(c.call, { checker: new SyntheticRuntimeRechecker(() =>
    ({ checker: { ...SYNTHETIC_RUNTIME_CHECKER, basis: "real_pinned_runtime_probe_v0" } }) as never) })), "runtime_recheck_invalid");
  const e = await recheckAll(c, staged);
  const lifecycle = forgeObservation(e.lifecycle[0]!, o => { (o.observer as { basis: string }).basis = "real_lifecycle_database_query_v0"; });
  const capability = forgeCapability(e.capability, r => { (r.checker as { basis: string }).basis = "real_executor_probe_v0"; });
  const runtimeCheck = forgeRuntime(e.runtimeCheck, r => { (r.checker as { basis: string }).basis = "real_pinned_runtime_probe_v0"; });
  const cases: [PrepPatch, string][] = [[{ lifecycle: [supplied(lifecycle, lifecycle.observationId)] }, "lifecycle_observation_invalid"],
    [{ capability: supplied(capability, capability.recheckId) }, "capability_recheck_invalid"], [{ runtime: supplied(runtimeCheck, runtimeCheck.recheckId) }, "runtime_recheck_invalid"]];
  for (const [patch, code] of cases) {
    const p = prep(c, e, patch);
    assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), code);
  }
});

test("A15 recheck and lifecycle evidence must be supplied, in scope and never an authority artifact", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  const foreign = artifact("gate7b_foreign_evidence", "Evidence", { scope: { ...scope, projectId: "project_other" }, basis: "synthetic_foreign_record" });
  const unsupplied = artifact("gate7b_unsupplied_evidence", "Evidence", { scope, basis: "synthetic_unsupplied_record" });
  const call = { ...c.call, artifacts: mergeArtifacts(c.call.artifacts, [foreign]) };
  for (const evidenceArtifact of [foreign, unsupplied, c.x.grantArtifact, c.x.admissionArtifact]) {
    const evidence = [{ artifact: evidenceArtifact.ref, pointer: "" }];
    assert.equal(await refusal(() => recheckDispatchRuntime(call, { checker: new SyntheticRuntimeRechecker(() => ({ outcome: { state: "available", evidence } })) })),
      "runtime_recheck_invalid");
    assert.equal(await refusal(() => observeSourceLifecycle(call, { stagedSource: staged[0]!, provider: new SyntheticLifecycleProvider(() => ({ evidence })) })),
      "lifecycle_observation_invalid");
  }
});

test("A16 an omitted evidence reference refuses, and the request order never changes the preparation", async t => {
  const c = await claimed(t, twoDag()), e = await evidence(c), p = prep(c, e);
  const reversed = { ...p.request, stagedSources: [...p.request.stagedSources].reverse(), lifecycleObservations: [...p.request.lifecycleObservations].reverse() };
  assert.deepEqual((await prepareDispatch(p.call, reversed)).preparation, (await prepareDispatch(p.call, p.request)).preparation);
  assert.equal(await refusal(() => prepareDispatch(p.call, { ...p.request, lifecycleObservations: p.request.lifecycleObservations.slice(0, 1) })), "lifecycle_observation_missing");
  assert.equal(await refusal(() => prepareDispatch(p.call, { ...p.request, lifecycleObservations: [] })), "dispatch_preparation_invalid");
  const other = forgeObservation(e.lifecycle[0]!, o => { o.source = { ...o.source, mediaAsset: { ...o.source.mediaAsset, objectId: "gate7b_other_media_asset" } }; });
  const q = prep(c, e, { lifecycle: [supplied(other, other.observationId), supplied(e.lifecycle[1]!, e.lifecycle[1]!.observationId)] });
  assert.equal(await refusal(() => prepareDispatch(q.call, q.request)), "lifecycle_observation_invalid");
});

test("A17 validated DAGs, claim ownership and staged handles cannot be forged, mutated, copied into authority or serialized", async t => {
  assert.equal(ValidatedExecutionDag.is(Object.create(ValidatedExecutionDag.prototype)), false);
  assert.throws(() => new ValidatedExecutionDag(Symbol("forged"), {} as never), EditRuntimeError);
  assert.equal(ClaimOwnership.is(Object.create(ClaimOwnership.prototype)), false);
  assert.throws(() => new ClaimOwnership(Symbol("forged"), "a", "b", "c".repeat(64)), EditRuntimeError);
  assert.throws(() => { (vFinalA().dag as { dagId: string }).dagId = "execution_dag_v0_forged"; }, TypeError);
  assert.throws(() => new PreparedStagedSourceHandle(Symbol("forged"), "a", "b", { localPath: "C:\\x" }), EditRuntimeError);
  const c = await claimed(t), { result } = await prepared(c), handle = result.stagedSources[0]!;
  assert.throws(() => canonicalSerialize(handle), TypeError);
  assert.equal("localPath" in structuredClone(handle), false);
  const forgedPreparation = forgePreparation(result.preparation, d => { (d as unknown as Record<string, unknown>)["localPath"] = handle.localPath; });
  assert.equal(await refusal(() => replayDispatchPreparation(c.call, forgedPreparation)), "dispatch_preparation_invalid");
});

test("A18 a malformed or backward runtime clock fails closed", async t => {
  const c = await claimed(t);
  const malformed = { ...c.env.runtime, clock: { now: () => "2026-09-24T01:10:00Z" } };
  assert.equal(await refusal(() => stageClaimedSource({ ...c.call, runtime: malformed }, { assetId: assetA() })), "input_invalid");
  c.env.clock.set("2026-09-24T01:09:00.000Z");
  assert.equal(await refusal(() => stageClaimedSource(c.call, { assetId: assetA() })), "evidence_chronology_invalid");
  assert.equal(await refusal(() => recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker() })), "evidence_chronology_invalid");
});

test("A19 exact UTC millisecond arithmetic round-trips across leap years, centuries and the representable range", () => {
  for (const at of ["1970-01-01T00:00:00.000Z", "2024-02-29T23:59:59.999Z", "2026-09-24T01:10:00.000Z", "2100-02-28T12:00:00.001Z", "2100-03-01T00:00:00.000Z",
    "2400-02-29T00:00:00.000Z", "9999-12-31T23:59:59.999Z"]) assert.equal(timestampAt(Date.parse(at)), at);
  for (let milliseconds = 0; milliseconds < 253_402_300_800_000; milliseconds += 7_777_777_777_777) assert.equal(timestampAt(milliseconds), new Date(milliseconds).toISOString());
  assert.throws(() => timestampAt(-1), EditRuntimeError);
  assert.throws(() => timestampAt(253_402_300_800_000), EditRuntimeError);
});

// ================================================================ owner-review repair regressions (written before the repair, run against the unrepaired bytes)
const iso = (milliseconds: number) => new Date(milliseconds).toISOString();
type FreshnessClass = "capability" | "runtime" | "lifecycle";
/** One evidence class held to a 30 s maximum age; the other two to 60 s; a 10 s preparation lifetime; every grant and retention bound later. */
const tightPolicy = (tight: FreshnessClass) => dispatchPolicy({ preparationLifetimeMilliseconds: 10_000, freshness: {
  maxCapabilityRecheckAgeMilliseconds: tight === "capability" ? 30_000 : 60_000, maxRuntimeRecheckAgeMilliseconds: tight === "runtime" ? 30_000 : 60_000,
  maxLifecycleObservationAgeMilliseconds: tight === "lifecycle" ? 30_000 : 60_000 } });
const observedAtOf = (e: Evidence, k: FreshnessClass) => Date.parse(k === "capability" ? e.capability.observedAt : k === "runtime" ? e.runtimeCheck.observedAt : e.lifecycle[0]!.observedAt);
const STALE: Record<FreshnessClass, string> = { capability: "capability_recheck_stale", runtime: "runtime_recheck_stale", lifecycle: "lifecycle_stale" };
for (const k of ["capability", "runtime", "lifecycle"] as const) {
  test(`OR1 ${k} evidence fresh at preparation but stale before confirmation is never current; its freshness window is exclusive`, async t => {
    const c = await claimed(t), e = await evidence(c, { policy: tightPolicy(k) }), p = prep(c, e), at = observedAtOf(e, k);
    // A truthful preparation: the evidence is 29,999 ms old under a 30 s maximum age.
    c.env.clock.set(iso(at + 29_999));
    const prepared = await prepareDispatch(p.call, p.request);
    // Owner finding 1: once the evidence is older than its policy age, the preparation is no longer current, whatever its own lifetime says.
    c.env.clock.set(iso(at + 30_001));
    assert.equal(await refusal(() => confirmDispatchPreparationCurrent(p.call, prepared.preparation)), "dispatch_preparation_expired");
    // The preparation ends exactly at the evidence's exclusive freshness expiry: one millisecond before it is current, at it and after it expired.
    assert.equal(prepared.preparation.validUntil, iso(at + 30_000));
    c.env.clock.set(iso(at + 29_999));
    await confirmDispatchPreparationCurrent(p.call, prepared.preparation);
    c.env.clock.set(iso(at + 30_000));
    assert.equal(await refusal(() => confirmDispatchPreparationCurrent(p.call, prepared.preparation)), "dispatch_preparation_expired");
    // A new preparation at or after the exact freshness expiry refuses the evidence as stale.
    for (const late of [30_000, 30_001]) {
      c.env.clock.set(iso(at + late));
      assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), STALE[k], String(late));
    }
  });
}

test("OR2a a claim can never precede the registration it claims under", async t => {
  const env = await envFor(t), v = vFinalA();
  await registerDagAttempt(v, finalA().artifacts, env.runtime);
  // admittedAt <= T1 < registeredAt, and the execution grant is otherwise valid at T1.
  const t1 = "2026-09-24T01:05:00.000Z";
  assert.ok(v.admission.admittedAt <= t1 && t1 < RUNTIME_START && v.grant.issuedAt <= t1);
  env.clock.set(t1);
  assert.equal(await refusal(() => acquireExecutionClaim(v, { workerId: "worker_a" }, env.runtime)), "evidence_chronology_invalid");
  assert.deepEqual(await readdir(env.runtime.layout.executionClaims), []);
});

test("OR2b staging that would start before its claim refuses before resolving, opening or publishing anything", async t => {
  const c = await claimed(t);
  let resolves = 0, opens = 0;
  const sources: SourceLocator = { resolve: async assetId => { resolves += 1; return c.env.runtime.sources.resolve(assetId); },
    open: async resolved => { opens += 1; return c.env.runtime.sources.open(resolved); } };
  // Before the claim, yet after the execution grant and the media grant were issued: only causal order can refuse.
  c.env.clock.set("2026-09-24T01:09:00.000Z");
  assert.equal(await refusal(() => stageClaimedSource({ ...c.call, runtime: withSources(c.env.runtime, sources) }, { assetId: assetA() })), "evidence_chronology_invalid");
  assert.deepEqual([resolves, opens], [0, 0]);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagedObjects), []);
  assert.deepEqual(await readdir(c.env.runtime.layout.stagingPending), []);
});

test("OR2c a clock rewound during the copy can never date a staged receipt before its own start", async t => {
  const c = await claimed(t);
  c.env.clock.set("2026-09-24T01:10:05.000Z");
  // claimedAt <= T1 < stagingStartedAt: the rewind alone must refuse.
  const sources: SourceLocator = { resolve: assetId => c.env.runtime.sources.resolve(assetId),
    open: async resolved => wrapReader(await c.env.runtime.sources.open(resolved), (_chunk, _position, call) => { if (call === 1) c.env.clock.set("2026-09-24T01:10:02.000Z"); }) };
  assert.equal(await refusal(() => stageClaimedSource({ ...c.call, runtime: withSources(c.env.runtime, sources) }, { assetId: assetA() })), "evidence_chronology_invalid");
});

/** Future real provenance shapes: representable contract shapes only. Batch 2A produces none and accepts none as authority. */
const REAL_LIFECYCLE_OBSERVER = { kind: "real_authoritative_observation", observerId: "media_lifecycle_registry", version: "1.0.0", implementationDigest: "e".repeat(64),
  basis: "authoritative_media_lifecycle_record_query_v0" };
const REAL_CAPABILITY_CHECKER = { kind: "real_local_probe", checkerId: "pinned_executor_capability_probe", version: "1.0.0", implementationDigest: "e".repeat(64),
  basis: "pinned_local_executor_capability_probe_v0" };
const REAL_RUNTIME_CHECKER = { kind: "real_local_probe", checkerId: "pinned_runtime_encoding_probe", version: "1.0.0", implementationDigest: "e".repeat(64),
  basis: "pinned_local_runtime_encoding_probe_v0" };
const withField = (value: object, key: string, field: unknown) => { (value as Record<string, unknown>)[key] = field; };
test("OR3a a future real lifecycle observation, executor probe, runtime probe and real preparation grade are representable, yet Batch 2A accepts none", async t => {
  const c = await claimed(t), { e, p, result } = await prepared(c);
  const lifecycle = forgeObservation(e.lifecycle[0]!, o => withField(o, "observer", REAL_LIFECYCLE_OBSERVER));
  const capability = forgeCapability(e.capability, r => withField(r, "checker", REAL_CAPABILITY_CHECKER));
  const runtimeCheck = forgeRuntime(e.runtimeCheck, r => withField(r, "checker", REAL_RUNTIME_CHECKER));
  const realPreparation = forgePreparation(result.preparation, d => {
    withField(d, "evidenceGrade", "real_post_claim_probe_evidence_v0");
    withField(d.capabilityRecheck, "provenance", "real_local_probe");
    withField(d.runtimeRecheck, "provenance", "real_local_probe");
    for (const source of d.sources) withField(source.lifecycle, "provenance", "real_authoritative_observation");
  });
  // Owner finding 3: the contract can represent truthful future real provenance...
  assert.equal(SourceLifecycleObservationSchema.safeParse(lifecycle).success, true, "real lifecycle observation");
  assert.equal(DispatchCapabilityRecheckSchema.safeParse(capability).success, true, "real capability probe");
  assert.equal(DispatchRuntimeRecheckSchema.safeParse(runtimeCheck).success, true, "real runtime probe");
  assert.equal(DispatchPreparationSchema.safeParse(realPreparation).success, true, "real preparation grade");
  // ...but a caller-built real-looking record never becomes Batch-2A authority.
  const cases: [PrepPatch, string][] = [[{ lifecycle: [supplied(lifecycle, lifecycle.observationId)] }, "lifecycle"], [{ capability: supplied(capability, capability.recheckId) }, "capability"],
    [{ runtime: supplied(runtimeCheck, runtimeCheck.recheckId) }, "runtime"]];
  for (const [patch, label] of cases) {
    const q = prep(c, e, patch);
    assert.equal(await refusal(() => prepareDispatch(q.call, q.request)), "evidence_provenance_unsupported", label);
  }
  assert.equal(await refusal(() => replayDispatchPreparation(p.call, realPreparation)), "dispatch_preparation_replay_mismatch");
  assert.equal(await refusal(() => confirmDispatchPreparationCurrent(p.call, realPreparation)), "dispatch_preparation_replay_mismatch");
  // A provider cannot relabel itself real: a well-formed real claim is refused as unsupported in Batch 2A.
  const staged = e.staged[0]!;
  assert.equal(await refusal(() => observeSourceLifecycle(c.call, { stagedSource: staged, provider: new SyntheticLifecycleProvider(() => ({ observer: REAL_LIFECYCLE_OBSERVER }) as never) })),
    "evidence_provenance_unsupported");
  assert.equal(await refusal(() => recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker(() => ({ checker: REAL_CAPABILITY_CHECKER }) as never) })),
    "evidence_provenance_unsupported");
  assert.equal(await refusal(() => recheckDispatchRuntime(c.call, { checker: new SyntheticRuntimeRechecker(() => ({ checker: REAL_RUNTIME_CHECKER }) as never) })),
    "evidence_provenance_unsupported");
});

test("OR3c a clock rewound during a lifecycle, capability or runtime provider call never yields a record", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  const start = "2026-09-24T01:10:10.000Z", rewound = "2026-09-24T01:10:05.000Z";
  const rewind = () => { c.env.clock.set(rewound); return {}; };
  c.env.clock.set(start);
  assert.equal(await refusal(() => observeSourceLifecycle(c.call, { stagedSource: staged[0]!, provider: new SyntheticLifecycleProvider(rewind) })), "evidence_chronology_invalid");
  c.env.clock.set(start);
  assert.equal(await refusal(() => recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker(rewind) })), "evidence_chronology_invalid");
  c.env.clock.set(start);
  assert.equal(await refusal(() => recheckDispatchRuntime(c.call, { checker: new SyntheticRuntimeRechecker(rewind) })), "evidence_chronology_invalid");
});

const INTENDED_MAX_RUNTIME_ARTIFACTS = 512;
function padded(artifacts: readonly SuppliedArtifact[], total: number): SuppliedArtifact[] {
  return [...artifacts, ...Array.from({ length: total - artifacts.length }, (_, i) =>
    artifact(`gate7b_padding_${String(i).padStart(4, "0")}`, "Evidence", { scope, basis: "synthetic_padding_record", index: i }))];
}
test("OR4 the supplied artifact universe is bounded before any artifact map or claim-bound step is built", async t => {
  const c = await claimed(t), { e, p, result } = await prepared(c);
  const over = padded(p.call.artifacts, INTENDED_MAX_RUNTIME_ARTIFACTS + 1);
  assert.equal(await refusal(() => prepareDispatch({ ...p.call, artifacts: over }, p.request)), "limit_exceeded");
  assert.equal((runtimeCore as unknown as Record<string, unknown>)["MAX_RUNTIME_ARTIFACTS"], INTENDED_MAX_RUNTIME_ARTIFACTS);
  // Exactly the bound is accepted.
  const atMax = padded(p.call.artifacts, INTENDED_MAX_RUNTIME_ARTIFACTS);
  assert.equal(atMax.length, INTENDED_MAX_RUNTIME_ARTIFACTS);
  assert.deepEqual((await prepareDispatch({ ...p.call, artifacts: atMax }, p.request)).preparation, result.preparation);
  // Every entry point refuses one artifact over the bound before building anything.
  const overCall = { ...c.call, artifacts: over }, overDag = padded(finalA().artifacts, INTENDED_MAX_RUNTIME_ARTIFACTS + 1);
  const entryPoints: [string, () => Promise<unknown> | unknown][] = [
    ["openValidatedDag", () => openValidatedDag({ dag: finalA().dagArtifact.ref }, overDag)],
    ["registerAttempt", () => registerAttempt({ reservation: c.v.admission.budget.reservation }, overDag, c.env.runtime)],
    ["registerDagAttempt", () => registerDagAttempt(c.v, overDag, c.env.runtime)],
    ["stageClaimedSource", () => stageClaimedSource(overCall, { assetId: assetA() })],
    ["observeSourceLifecycle", () => observeSourceLifecycle(overCall, { stagedSource: e.staged[0]!, provider: new SyntheticLifecycleProvider() })],
    ["recheckDispatchCapability", () => recheckDispatchCapability(overCall, { checker: new SyntheticCapabilityRechecker() })],
    ["recheckDispatchRuntime", () => recheckDispatchRuntime(overCall, { checker: new SyntheticRuntimeRechecker() })],
    ["replayDispatchPreparation", () => replayDispatchPreparation({ ...p.call, artifacts: over }, result.preparation)],
    ["confirmDispatchPreparationCurrent", () => confirmDispatchPreparationCurrent({ ...p.call, artifacts: over }, result.preparation)],
  ];
  for (const [label, run] of entryPoints) assert.equal(await refusal(run), "limit_exceeded", label);
  // Large duplicate sets refuse by the bound first; a small duplicate still refuses as invalid input; artifact order never changes a preparation.
  assert.equal(await refusal(() => prepareDispatch({ ...p.call, artifacts: Array.from({ length: INTENDED_MAX_RUNTIME_ARTIFACTS + 1 }, () => p.call.artifacts[0]!) }, p.request)),
    "limit_exceeded");
  assert.equal(await refusal(() => prepareDispatch({ ...p.call, artifacts: [...p.call.artifacts, p.call.artifacts[0]!] }, p.request)), "input_invalid");
  assert.deepEqual((await prepareDispatch({ ...p.call, artifacts: [...p.call.artifacts].reverse() }, p.request)).preparation, result.preparation);
});

test("OR5 one runtime root is one authority domain: adapters over the same root contend; isolated roots are independent domains, not a concurrency guarantee", async t => {
  const env = await envFor(t), v = vFinalA();
  await registerDagAttempt(v, finalA().artifacts, env.runtime);
  const contenders = await Promise.all([env.fresh(), env.fresh()]);
  const results = await Promise.allSettled(contenders.map((runtime, i) => acquireExecutionClaim(v, { workerId: `worker_${i}` }, runtime)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.deepEqual(results.flatMap(r => r.status === "rejected" ? [codeOf(r.reason)] : []), ["claim_already_acquired"]);
  // A second, independently configured root knows nothing of the first: it is another authority domain, never to serve the same logical work concurrently.
  const other = await envFor(t);
  await registerDagAttempt(v, finalA().artifacts, other.runtime);
  assert.equal((await acquireExecutionClaim(v, { workerId: "worker_elsewhere" }, other.runtime)).claim.claimTarget.claimTargetId, v.dag.dispatch.claimTarget.claimTargetId);
  t.diagnostic("two isolated runtime roots each granted the same claim target: separate roots are separate authority domains, and local exclusivity is not a global lock");
});

// ================================================================ owner-review repair: hard attacks written after the repair
test("OR6 a provider-reported observation instant is recorded only inside its check window, and freshness runs from it", async t => {
  const c = await claimed(t), staged = await stageAll(c);
  const start = "2026-09-24T01:10:10.000Z", reported = "2026-09-24T01:10:11.000Z", end = "2026-09-24T01:10:12.000Z";
  c.env.clock.set(start);
  const capability = await recheckDispatchCapability(c.call, { checker: new SyntheticCapabilityRechecker(() => { c.env.clock.set(end); return { observedAt: reported }; }) });
  assert.deepEqual([capability.checkStartedAt, capability.observedAt, capability.checkCompletedAt, capability.observedAtBasis],
    [start, reported, end, "provider_reported_within_check_window"]);
  // A reported instant before the check started, or after it completed, refuses.
  for (const outside of ["2026-09-24T01:10:09.999Z", "2026-09-24T01:10:12.001Z"]) {
    c.env.clock.set(start);
    assert.equal(await refusal(() => recheckDispatchRuntime(c.call, { checker: new SyntheticRuntimeRechecker(() => { c.env.clock.set(end); return { observedAt: outside }; }) })),
      "evidence_chronology_invalid", outside);
  }
  // A provider that reports no instant is recorded at its check start: a conservative lower bound, never an exact observation instant.
  c.env.clock.set(start);
  const lifecycle = await observeSourceLifecycle(c.call, { stagedSource: staged[0]!, provider: new SyntheticLifecycleProvider(() => { c.env.clock.set(end); return {}; }) });
  assert.deepEqual([lifecycle.checkStartedAt, lifecycle.observedAt, lifecycle.checkCompletedAt, lifecycle.observedAtBasis], [start, start, end, "check_started_lower_bound"]);
  // A record claiming a lower-bound instant other than its start, or an instant outside its window, is not a representable record.
  assert.equal(SourceLifecycleObservationSchema.safeParse(reidentify(lifecycle, "observationId", "source_lifecycle_observation_v0", o => { o.observedAt = reported; })).success, false);
  assert.equal(DispatchCapabilityRecheckSchema.safeParse(reidentify(capability, "recheckId", "dispatch_capability_recheck_v0",
    r => { r.observedAt = "2026-09-24T01:10:12.500Z"; })).success, false);
  // Freshness runs from the observation instant (here the provider-reported one); the causal bounds run from the check window.
  const runtimeCheck = await recheckDispatchRuntime(c.call, { checker: new SyntheticRuntimeRechecker() });
  const policy = dispatchPolicy({ freshness: { maxCapabilityRecheckAgeMilliseconds: 30_000, maxRuntimeRecheckAgeMilliseconds: 60_000, maxLifecycleObservationAgeMilliseconds: 60_000 } });
  const p = prep(c, { staged, lifecycle: [lifecycle], capability, runtimeCheck, policy });
  c.env.clock.set(iso(Date.parse(reported) + 29_999));
  const prepared = await prepareDispatch(p.call, p.request);
  assert.equal(prepared.preparation.capabilityRecheck.freshUntil, iso(Date.parse(reported) + 30_000));
  assert.equal(prepared.preparation.validUntil, iso(Date.parse(reported) + 30_000));
  c.env.clock.set(iso(Date.parse(reported) + 30_000));
  assert.equal(await refusal(() => prepareDispatch(p.call, p.request)), "capability_recheck_stale");
});

test("OR7 a staged receipt forged to start before its claim, or to complete before it starts, never reaches a preparation", async t => {
  const c = await claimed(t), e = await evidence(c), r = e.staged[0]!;
  assert.ok(c.claim.claimedAt <= r.stagingStartedAt && r.stagingStartedAt <= r.stagedAt);
  const early = reidentify(r, "stagedSourceReceiptId", "staged_source_receipt_v0", d => { d.stagingStartedAt = "2026-09-24T01:09:59.999Z"; });
  const inverted = reidentify(r, "stagedSourceReceiptId", "staged_source_receipt_v0", d => { d.stagingStartedAt = iso(Date.parse(d.stagedAt) + 1); });
  const forgedEarly = prep(c, e, { staged: [supplied(early, early.stagedSourceReceiptId)] });
  assert.equal(await refusal(() => prepareDispatch(forgedEarly.call, forgedEarly.request)), "evidence_chronology_invalid");
  const forgedInverted = prep(c, e, { staged: [supplied(inverted, inverted.stagedSourceReceiptId)] });
  assert.equal(await refusal(() => prepareDispatch(forgedInverted.call, forgedInverted.request)), "staged_source_invalid");
});

test("OR8 the preparation grade must name exactly the provenance of every evidence binding, and pseudo-synthetic provenance is refused", async t => {
  const c = await claimed(t), { e, result } = await prepared(c), p0 = result.preparation;
  assert.equal(p0.evidenceGrade, "synthetic_post_claim_rechecks_not_real_probes_batch2a");
  assert.deepEqual([p0.capabilityRecheck.provenance, p0.runtimeRecheck.provenance, p0.sources[0]!.lifecycle.provenance], ["synthetic_test", "synthetic_test", "synthetic_test"]);
  for (const binding of [p0.capabilityRecheck, p0.runtimeRecheck, p0.sources[0]!.lifecycle]) assert.ok(p0.validUntil <= binding.freshUntil);
  const mixed = forgePreparation(p0, d => { withField(d, "evidenceGrade", "real_post_claim_probe_evidence_v0"); withField(d.capabilityRecheck, "provenance", "real_local_probe"); });
  const syntheticGradeRealBinding = forgePreparation(p0, d => withField(d.runtimeRecheck, "provenance", "real_local_probe"));
  for (const forged of [mixed, syntheticGradeRealBinding]) assert.equal(DispatchPreparationSchema.safeParse(forged).success, false);
  // A synthetic label carrying a real-looking digest, or a real label without its exact identity, is not a representable provenance.
  const pseudo = forgeCapability(e.capability, r => withField(r, "checker", { ...SYNTHETIC_CAPABILITY_CHECKER, implementationDigest: "e".repeat(64) }));
  const vague = forgeRuntime(e.runtimeCheck, r => withField(r, "checker", { kind: "real_local_probe", checkerId: "some_probe", version: "1.0.0",
    basis: "pinned_local_runtime_encoding_probe_v0" }));
  assert.equal(DispatchCapabilityRecheckSchema.safeParse(pseudo).success, false);
  assert.equal(DispatchRuntimeRecheckSchema.safeParse(vague).success, false);
  const q = prep(c, e, { capability: supplied(pseudo, pseudo.recheckId) });
  assert.equal(await refusal(() => prepareDispatch(q.call, q.request)), "capability_recheck_invalid");
});

test("OR9 unreferenced foreign or padding artifacts up to the bound grant nothing and change nothing", async t => {
  const c = await claimed(t), { p, result } = await prepared(c);
  const foreign = Array.from({ length: MAX_RUNTIME_ARTIFACTS - p.call.artifacts.length }, (_, i) => artifact(`gate7b_foreign_${String(i).padStart(4, "0")}`, "Evidence",
    { scope: { ...scope, projectId: "project_other" }, basis: "synthetic_foreign_record", index: i }));
  const universe = [...foreign, ...p.call.artifacts];
  assert.equal(universe.length, MAX_RUNTIME_ARTIFACTS);
  assert.deepEqual((await prepareDispatch({ ...p.call, artifacts: universe }, p.request)).preparation, result.preparation);
});
