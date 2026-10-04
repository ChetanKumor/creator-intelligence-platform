/** Batch 3C local current-head authority: synced immutable artifacts and exclusive per-scope transition slots.
 * The configured root is a trusted authority domain, as with the accepted runtime. No history API, database or mutable head pointer.
 * Only state actions or this adapter's successful real render + independent QC can publish a next head. */
import { randomBytes } from "node:crypto";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { ArtifactRefSchema, equal, exactDigest, type ArtifactRef, type SuppliedArtifact } from "../packages/editorial/common.js";
import { ScopeSchema, type Scope } from "../packages/edit-graph/common.js";
import { AnyGraphDiffSchema, supplied, validateAnyEditGraph, type AnyEditGraph, type GraphDiff } from "../packages/edit-graph/index.js";
import { compileRenderProgram } from "../packages/edit-render/index.js";
import { type RepairLineageStep } from "../packages/edit-repair/index.js";
import { requireValidated } from "../packages/edit-runtime/validated.js";
import { type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import * as E from "../packages/edit-editorial/index.js";
import { executeAuthorizedSegmentedRender, issueExecutablePermit, type SegmentedRenderOptions } from "./edit-render-local.js";
import { runTechnicalMediaQc } from "./edit-media-qc-local.js";
import type { LocalEditRuntime } from "./edit-runtime-local.js";

const MINT = Symbol("current-editorial-revision");
interface Authorized { owner: LocalEditingProject; current: E.CurrentEditingContext; child: AnyEditGraph; state: E.EditorialState; diff: GraphDiff;
  artifacts: readonly SuppliedArtifact[]; childDag: ValidatedExecutionDag; impact: ReturnType<typeof E.validateEditorialImpact> }
let authorizationState: (value: EditorialExecutionAuthorization) => Authorized;
/** Live nonserializable authorization; a caller-selected valid record cannot mint this capability. */
export class EditorialExecutionAuthorization {
  readonly #value: Authorized;
  constructor(key: symbol, value: Authorized) { E.check(key === MINT, "current_revision_authorization_required"); this.#value = value; Object.freeze(this); }
  static { authorizationState = value => { E.check(#value in value, "current_revision_authorization_required"); return value.#value; }; }
  static async assertCurrent(value: unknown, graph: AnyEditGraph): Promise<void> {
    E.check(value instanceof EditorialExecutionAuthorization && #value in value, "current_revision_authorization_required");
    const v = value.#value;
    E.check(equal(E.graphBinding(graph), E.graphBinding(v.child)), "editorial_execution_graph_mismatch");
    E.check(equal(E.headRef((await v.owner.current()).head), E.headRef(v.current.head)), "stale_editing_head");
  }
  get impact() { return structuredClone(this.#value.impact); }
  toJSON(): never { throw new E.EditorialControlError("current_revision_authorization_not_serializable"); }
}
const errno = (v: unknown) => v instanceof Error && "code" in v ? v.code : undefined;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
async function readOwned(root: string, path: string, max: number): Promise<Uint8Array | null> {
  E.check(await realpath(root) === root, "editing_store_invalid");
  let info;
  try { info = await lstat(path, { bigint: true }); } catch (e) { if (errno(e) === "ENOENT") return null; throw e; }
  E.check(info.isFile() && !info.isSymbolicLink() && info.size <= BigInt(max) && await realpath(path) === path, "editing_store_corrupt");
  const h = await open(path, "r");
  try {
    const before = await h.stat({ bigint: true });
    E.check(before.ino === info.ino && before.dev === info.dev && before.size === info.size, "editing_store_corrupt");
    const bytes = await h.readFile(), after = await h.stat({ bigint: true });
    E.check(after.size === before.size && after.mtimeNs === before.mtimeNs && bytes.length === Number(before.size), "editing_store_corrupt"); return bytes;
  } finally { await h.close(); }
}
async function publish(root: string, path: string, bytes: Uint8Array): Promise<boolean> {
  E.check(await realpath(root) === root, "editing_store_invalid");
  const pending = join(root, `${randomBytes(16).toString("hex")}.pending`), h = await open(pending, "wx");
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
  try { await link(pending, path); return true; } catch (e) { if (errno(e) === "EEXIST") return false; throw e; }
  finally { await unlink(pending).catch(() => undefined); }
}
export class LocalEditingProject {
  readonly #root: string; readonly #scope: Scope; readonly #policy: E.EditorialPolicy; readonly #key: string;
  /** Gate 7 Batch 3E-A: this instance's last successful current() replay, in memory only. `proof` digests every byte that replay read. */
  #replayed: { proof: string; graph: AnyEditGraph; state: E.EditorialState } | null = null;
  constructor(key: symbol, root: string, scope: Scope, policy: E.EditorialPolicy) {
    E.check(key === MINT, "editing_project_required"); this.#root = root; this.#scope = structuredClone(scope); this.#policy = structuredClone(policy);
    this.#key = exactDigest(new TextEncoder().encode(canonicalSerialize(scope))); Object.freeze(this);
  }
  #slot(revision: number) { return join(this.#root, `h-${this.#key}-${revision}.json`); }
  #artifact(ref: ArtifactRef) { return join(this.#root, `a-${ref.sha256}.json`); }
  async #readHead(): Promise<{ head: E.EditingHead; refs: ArtifactRef[]; slots: string[] } | null> {
    let latest: { head: E.EditingHead; refs: ArtifactRef[]; slots: string[] } | null = null; const slots: string[] = [];
    for (let i = 0; i <= E.LIMITS.headRevisions; i += 1) {
      const bytes = await readOwned(this.#root, this.#slot(i), E.LIMITS.recordBytes); if (bytes === null) break;
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      E.check(value !== null && typeof value === "object" && !Array.isArray(value), "editing_store_corrupt");
      const v = value as { head?: unknown; artifacts?: unknown };
      E.check(equal(Object.keys(v).sort(), ["artifacts", "head"]) && Array.isArray(v.artifacts) && v.artifacts.length <= E.LIMITS.artifacts, "editing_store_corrupt");
      const head = E.canonical(E.EditingHeadSchema, v.head), refs = v.artifacts.map(r => E.canonical(ArtifactRefSchema, r));
      E.check(head.headRevision === i && equal(head.scope, this.#scope) && equal(head.previousHead, latest ? E.headRef(latest.head) : null), "editing_store_corrupt");
      slots.push(exactDigest(bytes)); latest = { head, refs, slots };
    }
    return latest;
  }
  async current(): Promise<E.CurrentEditingContext> {
    const latest = await this.#readHead(); E.check(latest, "editing_head_missing"); const artifacts: SuppliedArtifact[] = [];
    for (const ref of latest.refs) {
      const bytes = await readOwned(this.#root, this.#artifact(ref), MAX_ARTIFACT_BYTES);
      E.check(bytes && exactDigest(bytes) === ref.sha256, "editing_store_corrupt");
      artifacts.push({ ref, bytes, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown });
    }
    const map = E.artifactMap(artifacts), head = latest.head;
    // 3E-A: the replay is reused only for exactly the bytes it read (every head slot in order and every artifact) in this project and scope.
    const proof = exactDigest(new TextEncoder().encode(canonicalSerialize({ root: this.#root, scope: this.#key, slots: latest.slots,
      artifacts: artifacts.map(a => exactDigest(a.bytes)) })));
    const reused = this.#replayed?.proof === proof ? this.#replayed : null;
    const { graph, state } = reused === null ? E.validateGraphAndState(head.currentGraph.artifact, head.currentState, artifacts)
      : { graph: structuredClone(reused.graph), state: structuredClone(reused.state) };
    E.check(equal(head.currentGraph, E.graphBinding(graph)) && equal(head.currentState, E.stateRef(state)), "head_graph_state_mismatch");
    const previous = head.previousHead ? E.canonical(E.EditingHeadSchema, map.get(head.previousHead)) : null;
    E.check(equal(E.createEditingHead(graph, state, previous, head.transition), head), "head_transition_invalid");
    if (reused === null) this.#replayed = { proof, graph: structuredClone(graph), state: structuredClone(state) };
    return { head, graph, state, artifacts };
  }
  async #commit(head: E.EditingHead, artifactsInput: readonly SuppliedArtifact[], previous: E.EditingHead | null): Promise<E.CurrentEditingContext> {
    const artifacts = structuredClone(E.joinArtifacts(artifactsInput, [supplied(head, head.headId)]));
    const { graph, state } = E.validateGraphAndState(head.currentGraph.artifact, head.currentState, artifacts);
    E.check(equal(E.createEditingHead(graph, state, previous, head.transition), head), "head_transition_invalid");
    const existing = await this.#readHead();
    E.check(equal(existing ? E.headRef(existing.head) : null, previous ? E.headRef(previous) : null), previous ? "stale_editing_head" : "head_already_initialized");
    for (const artifact of artifacts) {
      E.check(artifact.bytes.length <= MAX_ARTIFACT_BYTES, "editorial_budget_exceeded");
      if (!await publish(this.#root, this.#artifact(artifact.ref), artifact.bytes)) {
        const prior = await readOwned(this.#root, this.#artifact(artifact.ref), MAX_ARTIFACT_BYTES);
        E.check(prior && exactDigest(prior) === artifact.ref.sha256, "editing_store_corrupt");
      }
    }
    const bytes = new TextEncoder().encode(canonicalSerialize({ head, artifacts: artifacts.map(a => a.ref) }));
    E.check(bytes.length <= E.LIMITS.recordBytes, "editorial_budget_exceeded");
    E.check(await publish(this.#root, this.#slot(head.headRevision), bytes), previous ? "stale_editing_head" : "head_already_initialized");
    return { head, graph, state, artifacts };
  }
  async initialize(graphInput: unknown, artifactsInput: readonly SuppliedArtifact[]): Promise<E.CurrentEditingContext> {
    const artifacts = structuredClone([...artifactsInput]), graph = validateAnyEditGraph(structuredClone(graphInput), artifacts);
    E.check(equal(graph.scope, this.#scope), "editorial_scope_mismatch");
    E.check(graph.revision === 0, "initial_graph_required");
    const state = E.createRootEditorialState(graph, artifacts), head = E.createEditingHead(graph, state, null, { kind: "initial" });
    return this.#commit(head, E.joinArtifacts(artifacts, [supplied(graph, graph.editGraphId), supplied(state, state.stateId)]), null);
  }
  async interpret(requestInput: unknown, interpreter: E.EditorialInterpreterPort): Promise<E.EditorialIntent> {
    const request = structuredClone(requestInput), identity = E.parse(E.ProducerSchema, interpreter.identity);
    const interpret = interpreter.interpret.bind(interpreter), c = await this.current();
    const intent = await E.interpretEditorialRequest(request, c, { identity, interpret });
    E.validateCurrentRequest(request, await this.current()); return intent;
  }
  async applyStateIntent(requestInput: unknown, intentInput: unknown): Promise<E.CurrentEditingContext> {
    const request = E.canonical(E.EditorialRequestSchema, structuredClone(requestInput)), intent = E.canonical(E.EditorialIntentSchema, structuredClone(intentInput));
    const c = await this.current(); E.validateCurrentRequest(request, c);
    E.check(equal(E.createEditorialIntent(request, intent.action, intent.producer, c), intent), "editorial_intent_mismatch");
    const a = intent.action; E.check(a.kind !== "request_edit" && a.kind !== "unsupported", "editorial_state_action_required");
    const operation = a.kind === "lock_target" ? { op: "add_hard_lock", target: a.target }
      : a.kind === "unlock_target" ? { op: "remove_hard_lock", lockId: a.lockId }
        : a.kind === "set_preference" ? { op: "set_preference", target: a.target, value: a.value } : { op: "clear_preference", target: a.target };
    const diff = E.createEditorialStateDiff(c.state, operation, { kind: "editorial_intent", intent: supplied(intent, intent.intentId).ref });
    const artifacts = E.joinArtifacts(c.artifacts, [supplied(request, request.requestId), supplied(intent, intent.intentId), supplied(diff, diff.diffId)]);
    const state = E.applyEditorialStateDiff(c.state, diff, artifacts), head = E.createEditingHead(c.graph, state, c.head, { kind: "state_only", diff: supplied(diff, diff.diffId).ref });
    return this.#commit(head, E.joinArtifacts(artifacts, [supplied(state, state.stateId)]), c.head);
  }
  async propose(requestInput: unknown, intentInput: unknown) {
    const request = structuredClone(requestInput), intent = E.canonical(E.EditorialIntentSchema, structuredClone(intentInput));
    return E.proposeEditorialRevision(request, intent, this.#policy, await this.current());
  }
  async authorize(input: { diff: unknown; child: unknown; artifacts: readonly SuppliedArtifact[]; parentDag: ValidatedExecutionDag;
    childDag: ValidatedExecutionDag; repair?: readonly RepairLineageStep[] }): Promise<EditorialExecutionAuthorization> {
    const diff = E.canonical(AnyGraphDiffSchema, structuredClone(input.diff)), childInput = structuredClone(input.child), suppliedArtifacts = structuredClone([...input.artifacts]);
    const parentDag = requireValidated(input.parentDag), childDag = requireValidated(input.childDag);
    // OR1 repair evidence is consumed before the first await; no caller-owned records remain authority afterwards.
    E.validateRevisionLineage(childInput, suppliedArtifacts, input.repair ?? []);
    const c = await this.current(), artifacts = E.joinArtifacts(c.artifacts, suppliedArtifacts), child = validateAnyEditGraph(childInput, artifacts);
    E.check(equal(diff.parent.editGraph, c.head.currentGraph.artifact), "stale_editing_head");
    let allowedScope: E.EditorialRequest["allowedScope"] = null;
    if (diff.origin.kind === "editorial_revision_plan") {
      const map = E.artifactMap(artifacts), plan = E.validateEditorialRevisionPlan(map.get(diff.origin.editorialRevisionPlan), artifacts);
      E.check(equal(plan.head, E.headRef(c.head)) && equal(plan.policy, supplied(this.#policy, this.#policy.policyId).ref), "stale_editing_head");
      E.validateCurrentRequest(map.get(plan.request), c); allowedScope = plan.allowedScope;
    }
    const state = E.rebaseEditorialState(c.state, child, diff, artifacts);
    const parentProgram = compileRenderProgram(parentDag, artifacts), childProgram = compileRenderProgram(childDag, artifacts);
    const impact = E.validateEditorialImpact(c, diff, { graph: c.graph, dag: parentDag.dag, program: parentProgram },
      { graph: child, dag: childDag.dag, program: childProgram }, allowedScope);
    return new EditorialExecutionAuthorization(MINT, { owner: this, current: c, child, state, diff,
      artifacts: E.joinArtifacts(artifacts, [supplied(state, state.stateId)]), childDag, impact });
  }
  async execute(authorization: EditorialExecutionAuthorization, input: Omit<Parameters<typeof issueExecutablePermit>[0], "editorial" | "repair"> & {
    toolRoot: string; prior: { receipt: unknown; qc: unknown } | null; instrumentation?: SegmentedRenderOptions["instrumentation"];
    qcInstrumentation?: Parameters<typeof runTechnicalMediaQc>[0]["instrumentation"] }) {
    const v = authorizationState(authorization); E.check(v.owner === this, "current_revision_authorization_required");
    const call = Object.freeze({ ...input.call, artifacts: structuredClone([...input.call.artifacts]) });
    const request = { call, media: input.media, lifecycle: [...input.lifecycle], conformance: [...input.conformance], staged: structuredClone([...input.staged]),
      policy: structuredClone(input.policy), editorial: authorization };
    const toolRoot = input.toolRoot, qcInstrumentation = input.qcInstrumentation, options: SegmentedRenderOptions = { prior: structuredClone(input.prior),
      ...(input.instrumentation ? { instrumentation: input.instrumentation } : {}) };
    await EditorialExecutionAuthorization.assertCurrent(authorization, v.child);
    E.check(equal(call.dag.dag.editGraph, E.graphBinding(v.child).artifact), "editorial_execution_graph_mismatch");
    const runtime = call.runtime as LocalEditRuntime;
    E.check(await realpath(join(runtime.layout.root, "editing-control")) === this.#root, "editorial_runtime_mismatch");
    const permit = await issueExecutablePermit(request), renderAt = performance.now(), result = await executeAuthorizedSegmentedRender(permit, options);
    const renderMs = performance.now() - renderAt;
    if (result.outcome !== "succeeded") return { outcome: "render_failed" as const, result };
    const qcAt = performance.now(), qc = await runTechnicalMediaQc({ dag: v.childDag, receipt: result.receipt, runtime, toolRoot,
      ...(qcInstrumentation ? { instrumentation: qcInstrumentation } : {}) });
    const qcMs = performance.now() - qcAt;
    if (qc.verdict !== "pass") return { outcome: "qc_failed" as const, result, qc };
    const receiptRef = supplied(result.receipt, result.receipt.receiptId), qcRef = supplied(qc, qc.qcReceiptId);
    const head = E.createEditingHead(v.child, v.state, v.current.head, { kind: "rendered_revision", diff: supplied(v.diff, v.diff.graphDiffId).ref,
      receipt: receiptRef.ref, qc: qcRef.ref });
    const headAt = performance.now(), current = await this.#commit(head, E.joinArtifacts(v.artifacts, [receiptRef, qcRef]), v.current.head);
    return { outcome: "published" as const, current, result, qc, timings: { renderMs, qcMs, headTransitionMs: performance.now() - headAt } };
  }
}
export async function openLocalEditingProject(input: { root: string; scope: unknown; policy: unknown }): Promise<LocalEditingProject> {
  const scope = E.parse(ScopeSchema, input.scope), policy = E.canonical(E.EditorialPolicySchema, input.policy);
  E.check(equal(scope, policy.scope), "editorial_scope_mismatch");
  E.check(isAbsolute(input.root) && !input.root.startsWith("\\\\") && !input.root.startsWith("//") && !input.root.split(/[\\/]/).includes(".."), "editing_store_invalid");
  const base = await realpath(resolve(input.root)), info = await lstat(input.root);
  E.check(info.isDirectory() && !info.isSymbolicLink(), "editing_store_invalid");
  const root = join(base, "editing-control"); await mkdir(root, { recursive: true });
  E.check(await realpath(root) === root && !(await lstat(root)).isSymbolicLink(), "editing_store_invalid");
  return new LocalEditingProject(MINT, root, scope, policy);
}
