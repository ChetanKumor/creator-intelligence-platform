// Gate 7 Batch 3E-A test-only helpers: synthetic multi-revision editorial chains, a synthetic editing store written in the exact
// LocalEditingProject layout, and structural validation counters. Nothing here changes production code. The counters wrap methods of
// exported schema singletons and builtin functions for one measured call, then restore them (the accepted observeMediaSpawns technique).
import { createRequire, syncBuiltinESMExports } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalSerialize } from "../../packages/domain/serialization.js";
import { exactDigest, identify, type ArtifactRef, type SuppliedArtifact } from "../../packages/editorial/common.js";
import { AnyGraphDiffSchema, EditGraphPolicySchema, supplied, type AnyEditGraph } from "../../packages/edit-graph/index.js";
import { canonicalTime, subtractTimes, tickTime } from "../../packages/edit-graph/common.js";
import * as E from "../../packages/edit-editorial/index.js";
import { MANUAL, clipTarget, context, requestFor, stateAction } from "./edit-editorial.js";

// ---------------------------------------------------------------- structural counters
/**
 * In every validation path of LocalEditingProject.current(), validateEditorialState and validateAnyEditGraph:
 * - `EditGraphPolicySchema.parse` runs exactly once per Gate-6 graph construction (graph.ts constructEditGraphBody, which replays Gate 5);
 * - `AnyGraphDiffSchema.parse` runs exactly once per GraphDiff application (revision.ts requireGraphDiff), naming the revision it builds;
 * - `EditorialStateSchema.safeParse` and `EditorialStateDiffSchema.safeParse` see every state record and every replayed state diff.
 */
export interface ValidationCounts {
  constructions: number; applications: Map<string, number>; stateParses: Map<string, number>; stateDiffParses: Map<string, number>;
  hashes: number; fileOpens: number; bytesRead: number;
}
type Method = (this: unknown, value: unknown, ...rest: unknown[]) => unknown;
const require = createRequire(import.meta.url);
const builtinCrypto = require("node:crypto") as { createHash: (...a: unknown[]) => unknown };
const builtinFs = require("node:fs/promises") as { open: (...a: unknown[]) => Promise<{ readFile: (...a: unknown[]) => Promise<Uint8Array> }> };
const idOf = (value: unknown, key: string): string => {
  const id = value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return typeof id === "string" ? id : "?";
};
export async function counted<T>(run: () => T | Promise<T>): Promise<{ value?: T; error?: string; counts: ValidationCounts }> {
  const counts: ValidationCounts = { constructions: 0, applications: new Map(), stateParses: new Map(), stateDiffParses: new Map(), hashes: 0, fileOpens: 0, bytesRead: 0 };
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const undo: (() => void)[] = [];
  const wrap = (target: object, method: string, observe: (value: unknown) => void) => {
    const host = target as Record<string, Method>, original = host[method]!;
    host[method] = function (this: unknown, value: unknown, ...rest: unknown[]) { observe(value); return original.call(this, value, ...rest); };
    undo.push(() => { host[method] = original; });
  };
  wrap(EditGraphPolicySchema, "parse", () => { counts.constructions += 1; });
  wrap(AnyGraphDiffSchema, "parse", value => bump(counts.applications, idOf(value, "graphDiffId")));
  wrap(E.EditorialStateSchema, "safeParse", value => bump(counts.stateParses, idOf(value, "stateId")));
  wrap(E.EditorialStateDiffSchema, "safeParse", value => bump(counts.stateDiffParses, idOf(value, "diffId")));
  const createHash = builtinCrypto.createHash, open = builtinFs.open;
  builtinCrypto.createHash = (...a: unknown[]) => { counts.hashes += 1; return createHash(...a); };
  builtinFs.open = async (...a: unknown[]) => {
    const handle = await open(...a), readFile = handle.readFile.bind(handle); counts.fileOpens += 1;
    handle.readFile = async (...r: unknown[]) => { const bytes = await readFile(...r); counts.bytesRead += bytes.length; return bytes; };
    return handle;
  };
  syncBuiltinESMExports();
  undo.push(() => { builtinCrypto.createHash = createHash; builtinFs.open = open; syncBuiltinESMExports(); });
  try { return { value: await run(), counts }; }
  catch (error) { return { error: refusalOf(error), counts }; }
  finally { for (const restore of undo.reverse()) restore(); }
}
/** The owned refusal code when one exists, otherwise the error class and message. */
export function refusalOf(error: unknown): string {
  if (error !== null && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
const total = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);
export function summary(c: ValidationCounts) {
  const applications = total(c.applications);
  return { constructions: c.constructions, applications, rootConstructions: c.constructions - applications, revisionsApplied: c.applications.size,
    maxApplicationsPerRevision: Math.max(0, ...c.applications.values()), stateDiffReplays: total(c.stateDiffParses),
    maxReplaysPerStateDiff: Math.max(0, ...c.stateDiffParses.values()), maxParsesPerState: Math.max(0, ...c.stateParses.values()),
    hashes: c.hashes, fileOpens: c.fileOpens, bytesRead: c.bytesRead };
}

// ---------------------------------------------------------------- synthetic chains
export type Step = "lock" | "pref" | "rev";
/** A synthetic stand-in for one rendered revision's receipt and QC. current() binds them only by exact reference and digest; their
 * content is never what makes a head current, and no render is claimed by them. */
function syntheticRenderEvidence(tag: string): [SuppliedArtifact, SuppliedArtifact] {
  const receipt = { artifactType: "SyntheticRenderReceipt3EA", artifactVersion: "0.1.0", tag }, qc = { artifactType: "SyntheticQc3EA", artifactVersion: "0.1.0", tag };
  return [supplied(receipt, `synthetic_receipt_${tag}`), supplied(qc, `synthetic_qc_${tag}`)];
}
/** One exact trim through the accepted editorial planner: shorten video clip `i` by `tenths` × 0.1 s at its end (whole-output scope). */
export function trimProposal(c: E.CurrentEditingContext, i: number, tenths = 1) {
  const target = clipTarget(c, i), clip = c.graph.clipUses.find(v => v.clipUseId === target.clipUseId)!;
  const allowed = { graph: c.head.currentGraph, clipUseIds: c.graph.clipUses.filter(v => v.medium === "video").map(v => v.clipUseId),
    interval: { startTicks: 0, endTicks: c.graph.output.durationTicks }, ticksPerSecond: target.ticksPerSecond };
  const request = requestFor(c, target, allowed), policy = E.createEditorialPolicy(c.head.scope, { kind: "owner", actorId: "owner_synthetic" });
  const keep = { start: clip.source.range.start, end: canonicalTime(subtractTimes(clip.source.range.end, tickTime(tenths, 10))) };
  const intent = E.createEditorialIntent(request, { kind: "request_edit", target, operation: "trim_clip_source_range", keep }, MANUAL, c);
  return { ...E.proposeEditorialRevision(request, intent, policy, c), request, intent, policy };
}
export function renderedHead(c: E.CurrentEditingContext, p: ReturnType<typeof trimProposal>, tag: string): E.CurrentEditingContext {
  const [receipt, qc] = syntheticRenderEvidence(tag);
  const head = E.createEditingHead(p.child, p.state, c.head, { kind: "rendered_revision", diff: supplied(p.diff, p.diff.graphDiffId).ref,
    receipt: receipt.ref, qc: qc.ref });
  return { graph: p.child, state: p.state, head, artifacts: E.joinArtifacts(p.artifacts, [receipt, qc, supplied(head, head.headId)]) };
}
export function nextHead(c: E.CurrentEditingContext, step: Step, tag: string): E.CurrentEditingContext {
  if (step === "lock") return stateAction(c, { op: "add_hard_lock", target: clipTarget(c, 0) });
  if (step === "pref") return c.state.preferences.length > 0 ? stateAction(c, { op: "clear_preference", target: c.state.preferences[0]!.target })
    : stateAction(c, { op: "set_preference", target: clipTarget(c, 0), value: "liked" });
  return renderedHead(c, trimProposal(c, 1), tag);
}
/** Heads 0..steps.length over the accepted two-source editorial fixture. */
export function buildChain(steps: readonly Step[], start: E.CurrentEditingContext = context()): E.CurrentEditingContext[] {
  const heads = [start];
  steps.forEach((step, i) => heads.push(nextHead(heads[heads.length - 1]!, step, `step${heads.length}_${i}`)));
  return heads;
}
/** lock, then alternating rendered trim / preference toggle: state depth d has graph revision ceil((d - 1) / 2). */
export const stepsFor = (depth: number): Step[] => Array.from({ length: depth }, (_, i) => i === 0 ? "lock" : i % 2 === 1 ? "rev" : "pref");

// ---------------------------------------------------------------- the synthetic store (exact LocalEditingProject.#commit layout)
export const scopeKey = (scope: unknown) => exactDigest(new TextEncoder().encode(canonicalSerialize(scope)));
export const slotName = (key: string, revision: number) => `h-${key}-${revision}.json`;
export const artifactName = (ref: ArtifactRef) => `a-${ref.sha256}.json`;
export const slotBytes = (c: E.CurrentEditingContext) => new TextEncoder().encode(canonicalSerialize({ head: c.head, artifacts: c.artifacts.map(a => a.ref) }));
/** Writes heads into `<base>/editing-control` exactly as #commit lays them out; returns the control root and the scope key. */
export async function writeStore(base: string, heads: readonly E.CurrentEditingContext[]): Promise<{ root: string; key: string }> {
  const root = join(base, "editing-control"); await mkdir(root, { recursive: true });
  const key = scopeKey(heads[0]!.head.scope);
  for (const c of heads) {
    for (const a of c.artifacts) await writeFile(join(root, artifactName(a.ref)), a.bytes);
    await writeFile(join(root, slotName(key, c.head.headRevision)), slotBytes(c));
  }
  return { root, key };
}

// ---------------------------------------------------------------- forgeries
/** A self-consistent forgery: the record's content changed, then its content identity recomputed. */
export function reidentify<T extends object>(value: T, key: string, prefix: string, mutate: (body: Record<string, unknown>) => void): T {
  const body = structuredClone(value) as Record<string, unknown>; delete body[key]; mutate(body);
  return identify(prefix, key, body) as unknown as T;
}
/** A schema-valid graph forgery that only replay can refuse (the Gate-5 access time is derived, never supplied). */
export const forgeAccessTime = (body: Record<string, unknown>) => { body.sourceAccess = { ...(body.sourceAccess as object), accessAsOf: "2000-01-01T00:00:00.000Z" }; };
/** Graph revisions 0..n with revision k forged and every later revision re-identified onto its forged parent (exact parent naming kept). */
export function forgeGraphChain(graphs: readonly AnyEditGraph[], k: number, mutate = forgeAccessTime): AnyEditGraph[] {
  const out = graphs.slice(0, k);
  for (let i = k; i < graphs.length; i += 1) {
    const parent = out[i - 1];
    out.push(reidentify(graphs[i]!, "editGraphId", "edit_graph_v0", body => {
      if (i === k) mutate(body);
      else if (parent) body.parent = { state: "present", editGraph: supplied(parent, parent.editGraphId).ref, editGraphId: parent.editGraphId, revision: parent.revision };
    }));
  }
  return out;
}
/** Replaces a context's state by a self-consistent forgery; the accepted head constructor (and its checks) makes the head over the same
 * previous head and transition. Nothing validates the forged state's replay here: that is what the store must refuse. */
export function forgeState(c: E.CurrentEditingContext, previous: E.EditingHead | null, mutate: (body: Record<string, unknown>) => void): E.CurrentEditingContext {
  const state = reidentify(c.state, "stateId", "editorial_state_v0", mutate), head = E.createEditingHead(c.graph, state, previous, c.head.transition);
  return { graph: c.graph, state, head, artifacts: E.joinArtifacts(c.artifacts, [supplied(state, state.stateId), supplied(head, head.headId)]) };
}
