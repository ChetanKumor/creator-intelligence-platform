// Phase 5 Gate 7 Batch 3B pure tests: RepairPlan, typed GraphDiff, immutable EditGraph revisions, exact trim repair, derived timeline state,
// parent/child replay, dependency impact, computation identity and the pure localized-execution (segment reuse) plan. Chains are built "on
// paper" through the accepted Gate 4-7 builders; observations use synthetic decoded bytes; the repair planner is a deterministic synthetic
// fixture rule, not a model. Nothing here starts a process or decodes media; actual media is exercised only by
// tests/edit-repair-media.integration.ts.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { identify, type ArtifactRef, type SuppliedArtifact } from "../packages/editorial/common.js";
import { canonicalTime, frameTime, type SourceRange } from "../packages/edit-graph/common.js";
import { EDIT_GRAPH_ERROR_CODES, EditGraphError, EditGraphRevisionSchema, EditGraphSchema, GRAPH_DIFF_OPERATIONS, applyGraphDiff, createGraphDiff, supplied,
  validateAnyEditGraph, validateEditGraph, validateEditGraphRevision, type AnyEditGraph, type EditGraph, type EditGraphRevision, type GraphDiff } from "../packages/edit-graph/index.js";
import { EDIT_EXECUTION_ERROR_CODES, EditExecutionError } from "../packages/edit-execution/index.js";
import { openValidatedDag } from "../packages/edit-runtime/index.js";
import { AnyRenderExecutionReceiptSchema, EDIT_RENDER_ERROR_CODES, EditRenderError, SEGMENT_EXECUTION_SEMANTICS_DIGEST, argvDigestOf, checkSegmentArtifactRecord, colorLookStep,
  compileAssemblyArguments, outputArtifactIdOf,
  compileFfmpegArguments, compileRenderProgram, compileSegmentStageArguments, planLocalizedExecution, segmentArtifactShapeOf, segmentRecordKeyOf, type RenderProgram }
  from "../packages/edit-render/index.js";
import { EDIT_REVIEW_ERROR_CODES, EditReviewError } from "../packages/edit-review/index.js";
import { DependencyImpactSchema, EDIT_REPAIR_ERROR_CODES, EditRepairError, RepairPlanSchema, applyRepairPlan, compileRepairPlan, deriveDependencyImpact, planRepair,
  requireRepairPlan,
  validateRepairLineage, validateRepairPlan, validateRepairRevision, type RepairPlannerInput } from "../packages/edit-repair/index.js";
import { videoUses, type GraphFixture } from "./support/edit-graph.js";
import type { DagFixture } from "./support/edit-execution.js";
import { REAL_RUNTIME, cfrMetadata, renderDag, renderGraph } from "./support/edit-render.js";
import { sha256Hex } from "./support/edit-runtime.js";
import { AB, BoundaryTrimFixturePlanner, FIXTURE_RATIONALE, planningInput, repairPolicyFor, repaired, reviewedChain, reviewedRevision, revisionDag, segmentedChain,
  type ReviewedChain } from "./support/edit-repair.js";
import { qcOnPaper, renderedChain } from "./support/edit-review.js";

// ---------------------------------------------------------------- helpers
type Owned = Error & { code: string };
const OWNED: [abstract new (...args: never[]) => Error, readonly string[]][] = [[EditGraphError, EDIT_GRAPH_ERROR_CODES], [EditExecutionError, EDIT_EXECUTION_ERROR_CODES],
  [EditRenderError, EDIT_RENDER_ERROR_CODES], [EditReviewError, EDIT_REVIEW_ERROR_CODES], [EditRepairError, EDIT_REPAIR_ERROR_CODES]];
function ownedCode(error: unknown): string {
  const match = OWNED.find(([kind]) => error instanceof kind);
  if (match === undefined) assert.fail(`expected an owned refusal, received ${String(error)}`);
  const code = (error as Owned).code;
  assert.ok(match[1].includes(code), code);
  return code;
}
function refusal(run: () => unknown): string {
  try { run(); } catch (error) { return ownedCode(error); }
  assert.fail("expected an owned refusal");
}
async function refusalAsync(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (error) { return ownedCode(error); }
  assert.fail("expected an owned refusal");
}
function reidentify<T extends object>(value: T, key: string, namespace: string, mutate: (copy: T) => void): T {
  const copy = structuredClone(value); mutate(copy);
  const body = { ...copy } as Record<string, unknown>; delete body[key];
  return identify(namespace, key, body) as unknown as T;
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}
const cache = new Map<string, unknown>();
const memo = <T>(key: string, build: () => T): T => { if (!cache.has(key)) cache.set(key, build()); return cache.get(key) as T; };
const F = (frame: number) => canonicalTime(frameTime(frame, { numerator: 30, denominator: 1 }));
const range = (a: number, b: number): SourceRange => ({ start: F(a), end: F(b) });
const TICKS = 1_000_000_000;
/** Two fixtures' supplied artifacts as one list: shared artifacts (identical bytes) appear once, as the accepted artifact map requires. */
function union(...lists: (readonly SuppliedArtifact[])[]): SuppliedArtifact[] {
  const seen = new Map<string, SuppliedArtifact>();
  for (const a of lists.flat()) {
    const prior = seen.get(a.ref.objectId);
    if (prior === undefined) seen.set(a.ref.objectId, a);
    else assert.equal(prior.ref.sha256, a.ref.sha256, `conflicting fixtures for ${a.ref.objectId}`);
  }
  return [...seen.values()];
}
const clipsOf = (g: AnyEditGraph) => videoUses(g as EditGraph);
const audioOf = (g: AnyEditGraph) => g.clipUses.filter(c => c.medium === "source_audio");

// ---- revision-0 chains shaped like the Batch-3B scenarios (the same specs the baseline-invariant capture used)
const src = (key: string, r?: { startSeconds: number; endSeconds: number }) => ({ key, hash: sha256Hex(`gate7-batch3b-${key}`), metadata: cfrMetadata(), ...(r ? { range: r } : {}) });
const SPECS = {
  cut_ab: { sources: [src("b3b_a"), src("b3b_b", { startSeconds: 1, endSeconds: 3 })], cut: true },
  clip_look_ab: { sources: [src("b3b_a"), src("b3b_b", { startSeconds: 1, endSeconds: 3 })], cut: true, look: { look: "warm" as const, target: [0] } },
  whole_look_ab: { sources: [src("b3b_a"), src("b3b_b", { startSeconds: 1, endSeconds: 3 })], cut: true, look: { look: "cool" as const, target: "whole_output" as const } },
  three_abc: { sources: [src("b3b_a", { startSeconds: 0, endSeconds: 1 }), src("b3b_b", { startSeconds: 1, endSeconds: 2 }), src("b3b_c", { startSeconds: 2, endSeconds: 3 })] },
} as const;
type ChainName = keyof typeof SPECS;
const graphOf = (name: ChainName): GraphFixture => memo(`graph_${name}`, () => renderGraph(SPECS[name]));
const dagOfGraph = (name: ChainName): DagFixture => memo(`dag_${name}`, () => renderDag(graphOf(name)));
function programOf(x: DagFixture): RenderProgram { return compileRenderProgram(openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts), x.artifacts); }

// ---- mechanical GraphDiffs (the graph layer treats the repair-plan origin as provenance; the repair layer validates it)
const PLAN_REF: ArtifactRef = { objectId: `repair_plan_v0_${"e".repeat(64)}`, sha256: "f".repeat(64), artifactType: "RepairPlan", artifactVersion: "0.1.0" };
function diffBody(parent: AnyEditGraph, ops: readonly { clipUseId: string; expected: SourceRange; replacement: SourceRange }[], patch: Record<string, unknown> = {}) {
  return { artifactType: "GraphDiff", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope: parent.scope,
    parent: { editGraph: supplied(parent, parent.editGraphId).ref, editGraphId: parent.editGraphId, revision: parent.revision },
    operations: ops.map(op => ({ op: "trim_clip_source_range", clipUseId: op.clipUseId, expected: { range: op.expected }, replacement: { range: op.replacement } })),
    origin: { kind: "repair_plan", repairPlan: PLAN_REF, repairPlanId: PLAN_REF.objectId }, semantics: "typed_graph_diff_v0", ...patch };
}
/** A trim of the video clip at `position` to the exact source frames [keep0, keep1) (30 fps grid). */
function trim(parent: AnyEditGraph, position: number, keep: [number, number]): GraphDiff {
  const clip = clipsOf(parent)[position]!;
  return createGraphDiff(diffBody(parent, [{ clipUseId: clip.clipUseId, expected: clip.source.range, replacement: range(keep[0], keep[1]) }]));
}
interface Revised { parent: AnyEditGraph; diff: GraphDiff; child: EditGraphRevision; artifacts: SuppliedArtifact[] }
function revise(parent: AnyEditGraph, diff: GraphDiff, artifacts: readonly SuppliedArtifact[]): Revised {
  const all = [...artifacts, supplied(diff, diff.graphDiffId)];
  const child = applyGraphDiff(parent, diff, all);
  return { parent, diff, child, artifacts: [...all, supplied(child, child.editGraphId)] };
}
/** cut_ab with A trimmed to its first 45 frames (the scenario's tail trim). */
const tailTrimmed = (): Revised => memo("tail_trimmed", () => { const g = graphOf("cut_ab"); return revise(g.graph, trim(g.graph, 0, [0, 45]), g.artifacts); });

// ================================================================ F01 revision-0 authority is byte-identical to the accepted baseline
/** Captured from the unmodified baseline build (db04f2e): .local-runs/phase5-gate7/batch3b-baseline-invariants.json. */
const BASELINE: Record<ChainName, { editGraphId: string; graphSha256: string; admissionId: string; dagId: string; programId: string; argvDigest: string;
  segments: string[] }> = {
  cut_ab: { editGraphId: "edit_graph_v0_91939b55238d28a020c2a49f8c6003855256c576f070c143ae04bac56f3cf87f",
    graphSha256: "87f6703dfeafc7ea5dbda7c834e58cd2523dfc6384453502a35e0884384db983",
    admissionId: "execution_admission_v0_", dagId: "execution_dag_v0_7aebf445281dd03fbe48ac0f8d528590f9ab67934676f5b5417871e802869ca5",
    programId: "render_program_v0_3e5d2ec908726fb92fd0bc011aa475802ffb3f9c718f3348c04fffd33e8416ac",
    argvDigest: "771a30e845c75386d48bd6128a2a7c6d7c9e5756fc72c994f5cd51a991279ef5",
    segments: ["render_segment_computation_v0_403de7f1d8f867eb1494eb36ef48da36b025a0ee0fcb3927865b13c1344faebe",
      "render_segment_computation_v0_6a157fabb60569d7608ff724063b8df39cb22c1fc1e6064c3f21bc1cd4f33a99"] },
  clip_look_ab: { editGraphId: "edit_graph_v0_1cc37e50e14083781b297724d1d6c0f9b15a94df220e529532585242a09e1334",
    graphSha256: "ad72e102930f669faac0a824e646aacebc0c384b861d0bf0c3b06f38da798e01",
    admissionId: "execution_admission_v0_", dagId: "execution_dag_v0_cd692b555838b05652e736132afc07e69fb6b1570086d75bbe920f53d4873af5",
    programId: "render_program_v0_206a3df279ae3a09a22fcd1ef30506f961c7cb4446489b32eeeaa6a7943b5989",
    argvDigest: "9d37e9cdd08789f6d373013eb4853f1ef6f542fbc2bdf6e760bdf6600288f8da",
    segments: ["render_segment_computation_v0_95f1d0c368121fe1ef248d5554710a34f697157412e94b716383e109e29b028b",
      "render_segment_computation_v0_6a157fabb60569d7608ff724063b8df39cb22c1fc1e6064c3f21bc1cd4f33a99"] },
  whole_look_ab: { editGraphId: "edit_graph_v0_4caed360dc8f523049ff0f2c26447d53fa76702143ffbfcec73ada2cf8005b5e",
    graphSha256: "3395741d0904bc6208a0b046fbd9a7a5451bfe2dc09d2dc169977562e3c41b75",
    admissionId: "execution_admission_v0_", dagId: "execution_dag_v0_71515bf4ea556fafe9f204d514c630f9115158b09fd33c6b781d7aaffe136e94",
    programId: "render_program_v0_cb29642dbb9279e6ce47c43a322931fc6b1e2795bca2ca6329166efd9afc9410",
    argvDigest: "4564f9f21a19a219cfe67e23b69e2a1914103dc2cff882b85edae4fc6b329f63",
    segments: ["render_segment_computation_v0_403de7f1d8f867eb1494eb36ef48da36b025a0ee0fcb3927865b13c1344faebe",
      "render_segment_computation_v0_6a157fabb60569d7608ff724063b8df39cb22c1fc1e6064c3f21bc1cd4f33a99"] },
  three_abc: { editGraphId: "edit_graph_v0_57baca91d60fea160e28833c53d0a7744b26521ac990a82c4c320c371e84f5e7",
    graphSha256: "7cd13ad65e60a309c1101de7d228a43ed13660b3e98664bad0d02a692914754f",
    admissionId: "execution_admission_v0_", dagId: "execution_dag_v0_c6fd8a1ea580e93c2f7aeb610a87c81b5b5e3d458cb2a4ca3ff4a88b8edb5ad7",
    programId: "render_program_v0_dfe01e0519776b59331b919bd26d911d6cd7256d3bd86eda51bb9eff874dee5f",
    argvDigest: "7c3f9880f2bda373dce3804121189a6dcf7cd4b4ddce141730a351e2421e8380",
    segments: ["render_segment_computation_v0_60400daac4f1aaaef9584165996e81ac11afc1d92975c02baf62db29adb7dbf9",
      "render_segment_computation_v0_d0c2e28cfa6083e98f416cf9abfa56b1f11833806dd4ebf851cc4c1416484a17",
      "render_segment_computation_v0_26c7ab66a0c8a0b22a845ba5399dcc5711d751c203e7b29984b2d52ac2e420fe"] },
};
test("F01 revision-0 graphs, DAGs, programs, segment identities and argv are byte-identical to the accepted baseline and still replay from Gate 5", () => {
  for (const name of Object.keys(SPECS) as ChainName[]) {
    const g = graphOf(name), x = dagOfGraph(name), program = programOf(x), expected = BASELINE[name];
    assert.deepEqual({ id: g.graph.editGraphId, sha: g.graphArtifact.ref.sha256, dag: x.dag.dagId, program: program.programId,
      argv: argvDigestOf(compileFfmpegArguments(program, { maxOutputBytes: 64 * 1024 * 1024 }).argv), segments: program.segments.map(s => s.segmentComputationId) },
    { id: expected.editGraphId, sha: expected.graphSha256, dag: expected.dagId, program: expected.programId, argv: expected.argvDigest, segments: expected.segments }, name);
    assert.ok(x.admission.admissionId.startsWith(expected.admissionId));
    assert.equal(g.graph.artifactVersion, "0.2.0");
    assert.deepEqual([g.graph.revision, g.graph.parent.state, g.graph.changeSet.kind], [0, "not_applicable", "initial_graph"]);
    assert.deepEqual(validateEditGraph(g.graph, g.artifacts), g.graph, "a root graph is validated by Gate-5 replay alone");
    assert.deepEqual(validateAnyEditGraph(g.graph, g.artifacts), g.graph);
  }
});

// ================================================================ B GraphDiff: typed, canonical, content-identified, parent-bound
test("B01 a GraphDiff is typed and content-identified; unregistered operations, JSON-patch shapes and arbitrary JSON are refused", () => {
  const g = graphOf("cut_ab"), a = clipsOf(g.graph)[0]!, body = diffBody(g.graph, [{ clipUseId: a.clipUseId, expected: a.source.range, replacement: range(0, 45) }]);
  const diff = createGraphDiff(body);
  assert.match(diff.graphDiffId, /^graph_diff_v0_[a-f0-9]{64}$/);
  assert.deepEqual(createGraphDiff(structuredClone(body)), diff, "deterministic identity");
  assert.deepEqual(GRAPH_DIFF_OPERATIONS, ["trim_clip_source_range"]);
  assert.deepEqual(diff.operations, [{ op: "trim_clip_source_range", clipUseId: a.clipUseId, expected: { range: a.source.range }, replacement: { range: { start: F(0), end: F(45) } } }]);
  const unsupported = [
    { op: "replace", path: "/clipUses/0/source/range/end", value: F(45) }, { op: "add", path: "/operations/-", value: {} }, { op: "remove", path: "/clipUses/1" },
    { op: "delete_clip", clipUseId: a.clipUseId }, { op: "move_keyframe", keyframeId: "k", to: F(3) }, { path: "/output/durationTicks", value: 1 }];
  for (const operation of unsupported) assert.equal(refusal(() => createGraphDiff({ ...body, operations: [operation] })), "graph_diff_operation_unsupported", JSON.stringify(operation));
  const invalid: Record<string, unknown>[] = [{ ...body, patch: [{ op: "replace", path: "/output", value: {} }] }, { ...body, semantics: "json_patch_rfc6902" },
    { ...body, operations: [] }, { ...body, operations: [{ ...body.operations[0]!, shell: "ffmpeg -i x" }] },
    { ...body, operations: [{ ...body.operations[0]!, replacement: { range: { start: F(0), end: { value: 45, rate: { numerator: 30, denominator: 1 } } } } }] },
    { ...body, operations: [{ ...body.operations[0]!, replacement: { range: { start: F(45), end: F(0) } } }] },
    { ...body, operations: [{ ...body.operations[0]!, replacement: { range: { start: F(10), end: F(10) } } }] },
    { ...body, operations: [body.operations[0]!, body.operations[0]!] }, { ...body, origin: { kind: "model_output", text: "trim it" } }];
  for (const input of invalid) assert.equal(refusal(() => createGraphDiff(input)), "graph_diff_invalid", JSON.stringify(input).slice(0, 120));
  assert.equal(refusal(() => applyGraphDiff(g.graph, { ...diff, graphDiffId: `graph_diff_v0_${"0".repeat(64)}` }, g.artifacts)), "graph_diff_invalid", "identity mismatch");
});

test("B02 a GraphDiff binds its exact parent: another graph, another revision or other parent bytes are stale-refused, never merged", () => {
  const g = graphOf("cut_ab"), other = graphOf("three_abc"), diff = trim(g.graph, 0, [0, 45]);
  // The other graph validates from its own chain; only the diff's exact parent binding refuses it.
  assert.equal(refusal(() => applyGraphDiff(other.graph, diff, other.artifacts)), "graph_diff_parent_mismatch");
  const wrongRevision = createGraphDiff({ ...diffBody(g.graph, [{ clipUseId: clipsOf(g.graph)[0]!.clipUseId, expected: range(0, 60), replacement: range(0, 45) }]),
    parent: { editGraph: { ...g.graphArtifact.ref, artifactVersion: "0.3.0" }, editGraphId: g.graph.editGraphId, revision: 1 } });
  assert.equal(refusal(() => applyGraphDiff(g.graph, wrongRevision, g.artifacts)), "graph_diff_parent_mismatch");
  const wrongBytes = createGraphDiff({ ...diffBody(g.graph, [{ clipUseId: clipsOf(g.graph)[0]!.clipUseId, expected: range(0, 60), replacement: range(0, 45) }]),
    parent: { editGraph: { ...g.graphArtifact.ref, sha256: "0".repeat(64) }, editGraphId: g.graph.editGraphId, revision: 0 } });
  assert.equal(refusal(() => applyGraphDiff(g.graph, wrongBytes, g.artifacts)), "graph_diff_parent_mismatch");
  const foreignScope = createGraphDiff({ ...diffBody(g.graph, [{ clipUseId: clipsOf(g.graph)[0]!.clipUseId, expected: range(0, 60), replacement: range(0, 45) }]),
    scope: { ...g.graph.scope, projectId: "project_other" } });
  assert.equal(refusal(() => applyGraphDiff(g.graph, foreignScope, g.artifacts)), "scope_mismatch");
});

test("B03 compare-and-swap: every operation names the exact expected prior range; any other prior value is refused, never best-effort", () => {
  const g = graphOf("cut_ab"), a = clipsOf(g.graph)[0]!;
  for (const expected of [range(0, 57), range(3, 60), range(0, 45)]) {
    const diff = createGraphDiff(diffBody(g.graph, [{ clipUseId: a.clipUseId, expected, replacement: range(0, 30) }]));
    assert.equal(refusal(() => applyGraphDiff(g.graph, diff, g.artifacts)), "graph_diff_expected_mismatch", JSON.stringify(expected));
  }
});

// ================================================================ C revision semantics
test("C01 applying a GraphDiff makes a new immutable revision: the parent is untouched, the child is 0.3.0 with revision + 1 and exact lineage", () => {
  const g = graphOf("cut_ab"), before = canonicalSerialize(g.graph), frozen = deepFreeze(structuredClone(g.graph)), diff = trim(frozen, 0, [0, 45]);
  const child = applyGraphDiff(frozen, diff, [...g.artifacts, supplied(diff, diff.graphDiffId)]);
  assert.equal(canonicalSerialize(frozen), before, "the parent object is never mutated (it is frozen, and no exception occurred)");
  assert.deepEqual([child.artifactType, child.artifactVersion, child.version, child.revision], ["EditGraph", "0.3.0", "0.3.0", 1]);
  assert.deepEqual(child.parent, { state: "present", editGraph: g.graphArtifact.ref, editGraphId: g.graph.editGraphId, revision: 0 });
  assert.deepEqual(child.changeSet, { kind: "graph_diff", graphDiff: supplied(diff, diff.graphDiffId).ref, graphDiffId: diff.graphDiffId });
  assert.notEqual(child.editGraphId, g.graph.editGraphId);
  assert.match(child.editGraphId, /^edit_graph_v0_[a-f0-9]{64}$/);
  assert.deepEqual(EditGraphRevisionSchema.parse(child), child);
  // Accepted invariant: EditGraph 0.2.0 still means an initial Gate-5 graph; a revision never parses as 0.2.0 and vice versa.
  assert.equal(EditGraphSchema.safeParse(child).success, false);
  assert.equal(EditGraphRevisionSchema.safeParse(g.graph).success, false);
  assert.deepEqual(child.lineage, g.graph.lineage, "the Gate-5 lineage is preserved");
  assert.deepEqual([child.scope, child.policy, child.outputProfile, child.techniqueResolutions], [g.graph.scope, g.graph.policy, g.graph.outputProfile, g.graph.techniqueResolutions]);
});

test("C02 the same GraphDiff never makes two sequential changes: re-applying to the parent gives the identical child, to the child it is refused", () => {
  const r = tailTrimmed();
  assert.deepEqual(applyGraphDiff(r.parent, r.diff, r.artifacts), r.child, "deterministic: the same parent and diff give the same revision");
  assert.equal(refusal(() => applyGraphDiff(r.child, r.diff, r.artifacts)), "graph_diff_parent_mismatch", "a diff bound to revision 0 never applies to revision 1");
});

test("C03 revisions chain with compare-and-swap: revision 2 names revision 1 exactly, and a diff built against a superseded revision is stale", () => {
  const r = tailTrimmed(), b = clipsOf(r.child)[1]!;
  const second = createGraphDiff(diffBody(r.child, [{ clipUseId: b.clipUseId, expected: b.source.range, replacement: range(30, 75) }]));
  const r2 = revise(r.child, second, r.artifacts);
  assert.deepEqual([r2.child.revision, r2.child.parent.editGraphId, r2.child.parent.revision], [2, r.child.editGraphId, 1]);
  assert.deepEqual(validateAnyEditGraph(r2.child, r2.artifacts), r2.child, "revision 2 replays through revision 1 to the Gate-5 root");
  // A diff made against the root after revision 1 exists: applying it to revision 1 (the current head) is a stale-revision refusal.
  const stale = trim(r.parent, 1, [30, 75]);
  assert.equal(refusal(() => applyGraphDiff(r.child, stale, [...r.artifacts, supplied(stale, stale.graphDiffId)])), "graph_diff_parent_mismatch");
  assert.equal(clipsOf(r2.child)[0]!.source.range.end.value, 3, "revision 1's trim is kept");
  assert.deepEqual(clipsOf(r2.child)[1]!.source.range, range(30, 75));
});

// ================================================================ D exact trim semantics
test("D01 an exact interior trim keeps the same source asset and hash and derives frame authority for every changed endpoint", () => {
  const g = graphOf("cut_ab"), a0 = clipsOf(g.graph)[0]!, b0 = clipsOf(g.graph)[1]!;
  const tail = tailTrimmed(), a = clipsOf(tail.child)[0]!;
  assert.deepEqual(a.source.range, { start: F(0), end: F(45) });
  assert.deepEqual([a.source.assetId, a.source.sourceHash, a.source.analysis, a.source.boundaryId, a.source.shotId],
    [a0.source.assetId, a0.source.sourceHash, a0.source.analysis, a0.source.boundaryId, a0.source.shotId]);
  assert.deepEqual(a.source.startAuthority, a0.source.startAuthority, "an unchanged endpoint keeps its accepted authority");
  assert.deepEqual(a.source.endAuthority, { kind: "frame_pts", frameIndex: 45, evidence: { artifact: a0.source.analysis, pointer: "/metadata/frameTimes/45" } });
  assert.equal(a.source.precision, "frame_pts_exact");
  assert.deepEqual([a.mapping.sourceStartTicks, a.mapping.sourceEndTicks], [0, 1_500_000_000]);
  const head = revise(g.graph, trim(g.graph, 1, [45, 90]), g.artifacts), b = clipsOf(head.child)[1]!;
  assert.deepEqual(b.source.range, range(45, 90));
  assert.deepEqual(b.source.startAuthority, { kind: "frame_pts", frameIndex: 45, evidence: { artifact: b0.source.analysis, pointer: "/metadata/frameTimes/45" } });
  assert.deepEqual(b.source.endAuthority, b0.source.endAuthority);
  const both = revise(g.graph, trim(g.graph, 1, [36, 84]), g.artifacts), bb = clipsOf(both.child)[1]!;
  assert.deepEqual([bb.source.range, bb.source.startAuthority.kind, bb.source.endAuthority.kind], [range(36, 84), "frame_pts", "frame_pts"]);
});

test("D02 a trim never widens source authority: no-op, extension, reversed, empty, wrong clip and audio targets are refused", () => {
  const g = graphOf("cut_ab"), a = clipsOf(g.graph)[0]!, audio = audioOf(g.graph)[0]!;
  const apply = (clipUseId: string, expected: SourceRange, replacement: SourceRange) =>
    refusal(() => applyGraphDiff(g.graph, createGraphDiff(diffBody(g.graph, [{ clipUseId, expected, replacement }])), g.artifacts));
  assert.equal(apply(a.clipUseId, a.source.range, a.source.range), "graph_diff_noop");
  assert.equal(apply(a.clipUseId, a.source.range, range(0, 66)), "graph_diff_outside_authorized_range", "past the parent end");
  const b = clipsOf(g.graph)[1]!;
  assert.equal(apply(b.clipUseId, b.source.range, range(24, 90)), "graph_diff_outside_authorized_range", "before the parent start");
  assert.equal(apply(b.clipUseId, b.source.range, range(90, 96)), "graph_diff_outside_authorized_range", "entirely outside");
  assert.equal(apply(audio.clipUseId, audio.source.range, range(0, 45)), "graph_diff_target_invalid", "linked audio follows its video; it is never a target");
  assert.equal(apply(`edit_graph_clip_use_v0_${"1".repeat(64)}`, a.source.range, range(0, 45)), "graph_diff_target_invalid");
  assert.equal(refusal(() => createGraphDiff(diffBody(g.graph, [{ clipUseId: a.clipUseId, expected: a.source.range, replacement: { start: F(45), end: F(0) } }]))), "graph_diff_invalid");
  assert.equal(refusal(() => createGraphDiff(diffBody(g.graph, [{ clipUseId: a.clipUseId, expected: a.source.range, replacement: { start: F(9), end: F(9) } }]))), "graph_diff_invalid");
});

test("D03 exact alignment: a changed endpoint must be an admitted source frame the graph clock represents exactly; nothing is snapped", () => {
  const g = graphOf("cut_ab"), a = clipsOf(g.graph)[0]!;
  const apply = (replacement: SourceRange) => refusal(() => applyGraphDiff(g.graph, createGraphDiff(diffBody(g.graph, [{ clipUseId: a.clipUseId, expected: a.source.range,
    replacement }])), g.artifacts));
  // 1.51 s is between frames 45 and 46; at the 10^9 clock it is representable, but no admitted frame is there.
  assert.equal(apply({ start: F(0), end: { value: 151, rate: { numerator: 100, denominator: 1 } } }), "graph_diff_endpoint_not_a_frame");
  // Frame 44 (44/30 s) is an admitted frame, but the graph's 10^9-tick clock cannot represent it exactly.
  assert.equal(apply(range(0, 44)), "time_not_representable");
  // One nanosecond after frame 45 is on the clock but off every frame.
  assert.equal(apply({ start: F(0), end: { value: 1_500_000_001, rate: { numerator: TICKS, denominator: 1 } } }), "graph_diff_endpoint_not_a_frame");
});

test("D04 linked source audio follows the exact repaired clip: identical source range, placement and mapping, and exact samples at render", () => {
  const r = tailTrimmed(), a = clipsOf(r.child)[0]!, linked = audioOf(r.child).find(c => c.medium === "source_audio" && c.linkedVideoClipUseId === a.clipUseId)!;
  assert.ok(linked !== undefined && linked.medium === "source_audio");
  assert.deepEqual([linked.source, linked.output, linked.mapping, linked.planningUse], [a.source, a.output, a.mapping, a.planningUse]);
  const program = programOf(revisionDag(graphOf("cut_ab"), r.child, r.artifacts));
  assert.deepEqual(program.segments.map(s => [s.video.startFrame, s.video.endFrame, s.audio]),
    [[0, 45, { state: "linked", startSample: 0, endSample: 72_000 }], [30, 90, { state: "linked", startSample: 48_000, endSample: 144_000 }]]);
});

// ================================================================ E derived graph state (recomputed, never supplied)
test("E01 downstream placement, joins, the cut operation and the output duration are re-derived exactly from the trimmed clip", () => {
  const g = graphOf("cut_ab"), r = tailTrimmed(), [a, b] = clipsOf(r.child) as [ReturnType<typeof clipsOf>[number], ReturnType<typeof clipsOf>[number]];
  assert.deepEqual([clipsOf(g.graph).map(c => c.output), g.graph.output.durationTicks], [[{ startTicks: 0, endTicks: 2 * TICKS }, { startTicks: 2 * TICKS, endTicks: 4 * TICKS }], 4 * TICKS]);
  assert.deepEqual([a.output, b.output, r.child.output.durationTicks], [{ startTicks: 0, endTicks: 1_500_000_000 }, { startTicks: 1_500_000_000, endTicks: 3_500_000_000 }, 3_500_000_000]);
  assert.deepEqual(b.source, clipsOf(g.graph)[1]!.source, "the shifted clip keeps its exact source selection");
  const cut = r.child.operations.find(o => o.primitive === "cut_transition")!, parentCut = g.graph.operations.find(o => o.primitive === "cut_transition")!;
  assert.ok(cut.primitive === "cut_transition" && parentCut.primitive === "cut_transition");
  assert.deepEqual([cut.atTicks, cut.target], [1_500_000_000, { kind: "join", fromClipUseId: a.clipUseId, toClipUseId: b.clipUseId }]);
  assert.notEqual(cut.operationId, parentCut.operationId, "the operation identity is re-derived with its new join");
  assert.deepEqual(cut.resolvedFrom, parentCut.resolvedFrom, "the same typed resolution still binds it");
  const bound = r.child.obligations.find(o => o.disposition.state === "bound_to_operation")!;
  assert.ok(bound.disposition.state === "bound_to_operation" && bound.disposition.operationId === cut.operationId);
  const x = revisionDag(g, r.child, r.artifacts), join = x.dag.nodes.find(n => n.kind === "cut_sequence")!;
  assert.ok(join.kind === "cut_sequence");
  assert.deepEqual(join.joins.map(j => [j.atTicks, j.atFrame]), [[1_500_000_000, 45]]);
  assert.deepEqual([x.dag.graph, x.admission.graph], [{ editGraphId: r.child.editGraphId, revision: 1 }, { editGraphId: r.child.editGraphId, revision: 1 }]);
});

test("E02 clip-scoped look extents follow their exact repaired clip; a whole-output look follows the new total duration", () => {
  const clip = graphOf("clip_look_ab"), rc = revise(clip.graph, trim(clip.graph, 0, [0, 45]), clip.artifacts);
  const look = rc.child.operations.find(o => o.primitive === "color_look")!;
  assert.ok(look.primitive === "color_look" && look.target.kind === "clip_uses");
  assert.deepEqual([look.target.clipUseIds, look.extents], [[clipsOf(rc.child)[0]!.clipUseId], [{ startTicks: 0, endTicks: 1_500_000_000 }]]);
  const whole = graphOf("whole_look_ab"), rw = revise(whole.graph, trim(whole.graph, 0, [0, 45]), whole.artifacts);
  const wlook = rw.child.operations.find(o => o.primitive === "color_look")!;
  assert.ok(wlook.primitive === "color_look");
  assert.deepEqual([wlook.target, wlook.extents], [{ kind: "whole_output" }, [{ startTicks: 0, endTicks: 3_500_000_000 }]]);
  const node = revisionDag(whole, rw.child, rw.artifacts).dag.nodes.find(n => n.kind === "color_look")!;
  assert.ok(node.kind === "color_look");
  assert.deepEqual([node.extent.startFrame, node.extent.endFrame], [0, 105]);
});

test("E03 requirements, assessments, dependencies, unresolved state and readiness are re-derived; every structural invariant holds", () => {
  const g = graphOf("cut_ab"), r = tailTrimmed();
  const ceiling = (graph: AnyEditGraph) => graph.capabilityRequirements.flatMap(q => q.predicates).find(p => p.name === "output_duration_seconds_ceiling")!.value;
  assert.deepEqual([ceiling(g.graph), ceiling(r.child)], [4, 4]);
  const ids = new Set(r.child.clipUses.map(c => c.clipUseId).concat(r.child.operations.map(o => o.operationId)));
  assert.ok(r.child.dependencies.every(d => ids.has(d.from) && ids.has(d.to)), "dependencies name the child's own nodes");
  assert.ok(r.child.capabilityRequirements.every(q => q.imposedBy.every(id => ids.has(id))));
  assert.deepEqual(r.child.capability.assessments.map(a => a.requirementId), r.child.capabilityRequirements.map(q => q.requirementId));
  assert.deepEqual([r.child.unresolved, r.child.executability.state, r.child.executability.capability.state],
    [g.graph.unresolved, "not_execution_ready", g.graph.executability.capability.state]);
  // A second trim that crosses a whole second re-derives the duration ceiling: 3.5 s -> 2.5 s total gives ceiling 3.
  const b = clipsOf(r.child)[1]!, r2 = revise(r.child, createGraphDiff(diffBody(r.child, [{ clipUseId: b.clipUseId, expected: b.source.range, replacement: range(30, 60) }])),
    r.artifacts);
  assert.deepEqual([r2.child.output.durationTicks, ceiling(r2.child)], [2_500_000_000, 3]);
});

// ================================================================ F replay: root from Gate 5, child from exact parent + exact GraphDiff
test("F02 a child validates only by exact re-application; coordinated rehashes of derived fields, lineage or change set are refused", () => {
  const r = tailTrimmed();
  assert.deepEqual(validateEditGraphRevision(r.child, r.artifacts), r.child);
  assert.deepEqual(validateAnyEditGraph(r.child, r.artifacts), r.child);
  const forge = (mutate: (c: EditGraphRevision) => void) => reidentify(r.child, "editGraphId", "edit_graph_v0", mutate);
  const cutIndex = r.child.operations.findIndex(o => o.primitive === "cut_transition"), three = graphOf("three_abc");
  const forgeries: [string, EditGraphRevision][] = [
    ["cut time", forge(c => { const op = c.operations[cutIndex]!; if (op.primitive === "cut_transition") op.atTicks = 2 * TICKS; })],
    ["duration", forge(c => { c.output.durationTicks = 4 * TICKS; })],
    ["revision number", forge(c => { c.revision = 2; c.parent.revision = 1; c.parent.editGraph = { ...c.parent.editGraph, artifactVersion: "0.3.0" }; })],
    ["parent lineage", forge(c => { c.parent.editGraphId = three.graph.editGraphId; c.parent.editGraph = three.graphArtifact.ref; })],
    ["change set", forge(c => { c.changeSet.graphDiffId = `graph_diff_v0_${"a".repeat(64)}`; c.changeSet.graphDiff = { ...c.changeSet.graphDiff, objectId: c.changeSet.graphDiffId }; })],
    ["trimmed range", forge(c => { const a = c.clipUses[0]!; a.source.range = range(0, 48); })],
    ["source access time", forge(c => { c.sourceAccess = { ...c.sourceAccess, accessAsOf: "2026-09-23T00:00:01.000Z" }; })],
    ["planning budget", forge(c => { c.executability.budget.planningBudget = { ...c.executability.budget.planningBudget, sha256: "5".repeat(64) }; })],
  ];
  // Two fixture chains can never be supplied together (their fixed-name artifacts hold chain-specific bytes). The lineage forgery gets its
  // claimed parent's own valid chain plus the diff, so only the diff's exact parent binding can refuse it.
  const artifactsFor = (label: string) => label === "parent lineage" ? union(three.artifacts, [supplied(r.diff, r.diff.graphDiffId)]) : r.artifacts;
  const codes = Object.fromEntries(forgeries.map(([label, forged]) => [label, refusal(() => validateEditGraphRevision(forged, artifactsFor(label)))]));
  assert.equal(codes["cut time"], "input_invalid", "a stale cut time is structurally refused");
  assert.equal(codes.duration, "input_invalid", "a stale duration is structurally refused");
  for (const label of ["cut time", "duration"]) {
    assert.equal(EditGraphRevisionSchema.safeParse(forgeries.find(([l]) => l === label)![1]).success, false, `${label}: refused by the revision schema itself`);
  }
  assert.equal(codes["parent lineage"], "graph_diff_parent_mismatch", "the diff binds exactly one parent");
  assert.equal(codes["source access time"], "graph_replay_mismatch", "a coordinated rehash of an unconstrained field never survives replay");
  assert.equal(codes["planning budget"], "graph_replay_mismatch");
  assert.ok(Object.values(codes).every(code => code !== ""), JSON.stringify(codes));
});

test("F03 replay binds the exact parent and GraphDiff bytes: a missing, substituted or modified parent or diff is refused", () => {
  const r = tailTrimmed(), g = graphOf("cut_ab");
  const without = (objectId: string) => r.artifacts.filter(a => a.ref.objectId !== objectId);
  assert.notEqual(refusal(() => validateEditGraphRevision(r.child, without(r.parent.editGraphId))), "");
  assert.notEqual(refusal(() => validateEditGraphRevision(r.child, without(r.diff.graphDiffId))), "");
  // A different diff under the same identity bytes is impossible; a different diff rehashed with the child pointing at it must not replay.
  const alt = trim(g.graph, 0, [0, 30]), forged = reidentify(r.child, "editGraphId", "edit_graph_v0", c => {
    c.changeSet = { kind: "graph_diff", graphDiff: supplied(alt, alt.graphDiffId).ref, graphDiffId: alt.graphDiffId }; });
  assert.equal(refusal(() => validateEditGraphRevision(forged, [...r.artifacts, supplied(alt, alt.graphDiffId)])), "graph_replay_mismatch");
  // A parent with the same identity but other bytes cannot be supplied: the exact artifact reference binds the bytes.
  const tampered = { ...supplied(r.parent, r.parent.editGraphId), ref: { ...supplied(r.parent, r.parent.editGraphId).ref, sha256: "1".repeat(64) } };
  assert.notEqual(refusal(() => validateEditGraphRevision(r.child, [...without(r.parent.editGraphId), tampered])), "");
});

// ================================================================ G dependency impact (derived, exact)
function impactOf(name: ChainName, r: Revised) {
  const g = graphOf(name), px = dagOfGraph(name), cx = revisionDag(g, r.child, r.artifacts);
  return { impact: deriveDependencyImpact({ parent: { graph: r.parent, dag: px.dag, program: programOf(px) }, child: { graph: r.child, dag: cx.dag, program: programOf(cx) },
    diff: r.diff }), px, cx };
}
test("G01 a tail trim: exact changed region, dependency closure, preserved and invalidated DAG nodes, reusable and recomputed segments", () => {
  const r = tailTrimmed(), { impact, px, cx } = impactOf("cut_ab", r);
  assert.deepEqual(DependencyImpactSchema.parse(impact), impact);
  assert.deepEqual(impact.clips.map(c => [c.position, c.medium, c.change]),
    [[0, "video", "source_changed"], [1, "video", "placement_shifted"], [0, "source_audio", "source_changed"], [1, "source_audio", "placement_shifted"]]);
  assert.deepEqual(impact.operations.map(o => o.change), ["derived_placement_changed"]);
  assert.deepEqual(impact.changedRegion, { basis: "first_changed_output_instant_to_end_contiguous_track_v0", ticksPerSecond: TICKS,
    parent: { startTicks: 1_500_000_000, endTicks: 4 * TICKS, startFrame: 45, endFrame: 120 }, child: { startTicks: 1_500_000_000, endTicks: 3_500_000_000, startFrame: 45, endFrame: 105 } });
  const state = (kind: string, position: number | null) => impact.dagNodes.find(n => n.kind === kind && n.position === position)!.state;
  assert.deepEqual([state("source_video_clip", 0), state("source_video_clip", 1), state("linked_source_audio", 0), state("linked_source_audio", 1), state("cut_sequence", null),
    state("composition", null), state("final_encode", null)], ["computation_changed", "computation_preserved", "computation_changed", "computation_preserved", "computation_changed",
    "computation_changed", "computation_changed"]);
  const b = (x: DagFixture) => x.dag.nodes.find(n => n.kind === "source_video_clip" && n.position === 1)!;
  assert.equal(b(px).computationId, b(cx).computationId, "the shifted clip's computation is preserved");
  assert.notEqual(b(px).nodeId, b(cx).nodeId, "its occurrence identity is not");
  assert.deepEqual(impact.segments.map(s => [s.position, s.decision, s.parentPosition]), [[0, "recompute_changed_computation", null], [1, "reusable_identical_computation", 1]]);
  assert.deepEqual(impact.globals, { cutSequence: "computation_changed", composition: "computation_changed", finalEncode: "computation_changed", assembly: "recompute_whole_output" });
  assert.deepEqual(impact.summary, { segments: 2, reusable: 1, recompute: 1, dagNodesPreserved: 2, dagNodesChanged: 5 });
});

test("G02 a head trim of an interior clip: the untouched prefix is unchanged, later clips shift, and only the trimmed segment recomputes", () => {
  const g = graphOf("three_abc"), r = revise(g.graph, trim(g.graph, 1, [36, 60]), g.artifacts), { impact, px, cx } = impactOf("three_abc", r);
  assert.deepEqual(impact.clips.filter(c => c.medium === "video").map(c => c.change), ["unchanged", "source_changed", "placement_shifted"]);
  assert.deepEqual(impact.changedRegion.parent, { startTicks: TICKS, endTicks: 3 * TICKS, startFrame: 30, endFrame: 90 });
  assert.deepEqual(impact.changedRegion.child, { startTicks: TICKS, endTicks: 2_800_000_000, startFrame: 30, endFrame: 84 });
  assert.deepEqual(impact.segments.map(s => s.decision), ["reusable_identical_computation", "recompute_changed_computation", "reusable_identical_computation"]);
  // The second acceptance scenario: the joins the repaired clip touches move exactly, the unaffected join stays, and the root computation changes.
  const joins = (x: DagFixture) => x.dag.nodes.flatMap(n => n.kind === "cut_sequence" ? n.joins.map(j => [j.atTicks, j.atFrame]) : []);
  assert.deepEqual([joins(px), joins(cx)], [[[TICKS, 30], [2 * TICKS, 60]], [[TICKS, 30], [1_800_000_000, 54]]]);
  assert.notEqual(cx.dag.renderIdentity.root.computationId, px.dag.renderIdentity.root.computationId);
});

test("G03 a whole-output look is a global dependency: its node and every sequence node recompute, while untouched segments stay reusable", () => {
  const whole = graphOf("whole_look_ab"), r = revise(whole.graph, trim(whole.graph, 0, [0, 45]), whole.artifacts), { impact } = impactOf("whole_look_ab", r);
  assert.deepEqual(impact.operations.map(o => [o.primitive, o.change]).sort(), [["color_look", "derived_placement_changed"], ["cut_transition", "derived_placement_changed"]]);
  assert.equal(impact.dagNodes.find(n => n.kind === "color_look")!.state, "computation_changed");
  assert.deepEqual(impact.segments.map(s => s.decision), ["recompute_changed_computation", "reusable_identical_computation"],
    "the whole-output look is applied at assembly, never inside a segment");
});

test("G04 impact is derived, never asserted: a child of another diff, a DAG of another graph or a program of another DAG is refused", () => {
  const r = tailTrimmed(), g = graphOf("cut_ab"), px = dagOfGraph("cut_ab"), cx = revisionDag(g, r.child, r.artifacts), other = trim(g.graph, 0, [0, 30]);
  const input = { parent: { graph: r.parent, dag: px.dag, program: programOf(px) }, child: { graph: r.child, dag: cx.dag, program: programOf(cx) }, diff: r.diff };
  assert.equal(refusal(() => deriveDependencyImpact({ ...input, diff: other })), "impact_input_invalid");
  assert.equal(refusal(() => deriveDependencyImpact({ ...input, child: { ...input.child, dag: px.dag } })), "impact_input_invalid");
  assert.equal(refusal(() => deriveDependencyImpact({ ...input, parent: { ...input.parent, program: input.child.program } })), "impact_input_invalid");
});

// ================================================================ H computation identity
test("H01 identities: the unchanged segment keeps its computation identity, the changed one does not, and the render root changes", () => {
  const r = tailTrimmed(), px = dagOfGraph("cut_ab"), cx = revisionDag(graphOf("cut_ab"), r.child, r.artifacts), pp = programOf(px), cp = programOf(cx);
  assert.equal(cp.segments[1]!.segmentComputationId, pp.segments[1]!.segmentComputationId);
  assert.equal(cp.segments[1]!.segmentComputationId, BASELINE.cut_ab.segments[1]);
  assert.notEqual(cp.segments[0]!.segmentComputationId, pp.segments[0]!.segmentComputationId);
  assert.notEqual(cx.dag.renderIdentity.renderComputationId, px.dag.renderIdentity.renderComputationId);
  assert.notEqual(cx.dag.renderIdentity.root.computationId, px.dag.renderIdentity.root.computationId);
  assert.deepEqual([cp.binding.editGraphId, cp.binding.revision], [r.child.editGraphId, 1]);
});

test("H02 another runtime build or another source content gives another segment identity: nothing can be reused across them", () => {
  const r = tailTrimmed(), g = graphOf("cut_ab"), base = programOf(revisionDag(g, r.child, r.artifacts));
  const otherRuntime = programOf(revisionDag(g, r.child, r.artifacts, { budget: { attempt: 3, prefix: "gate7_b3b_rt" },
    runtime: { runtime: { ...REAL_RUNTIME, implementationDigest: "9".repeat(64) } } }));
  assert.notEqual(otherRuntime.segments[1]!.segmentComputationId, base.segments[1]!.segmentComputationId);
  const otherBytes = renderGraph({ sources: [src("b3b_a"), { ...src("b3b_b", { startSeconds: 1, endSeconds: 3 }), hash: sha256Hex("gate7-batch3b-other-b") }], cut: true });
  const r2 = revise(otherBytes.graph, trim(otherBytes.graph, 0, [0, 45]), otherBytes.artifacts);
  assert.notEqual(programOf(revisionDag(otherBytes, r2.child, r2.artifacts)).segments[1]!.segmentComputationId, base.segments[1]!.segmentComputationId);
});

// ================================================================ A RepairPlan: bound to the exact render, QC, report, finding, evidence and policy
test("A01 a RepairPlan binds the exact graph, revision, rendered output, receipt, passing QC, report, finding, evidence, policy and planner", async t => {
  const x = await reviewedChain(t), fx = await repaired(x), plan = fx.plan, a = clipsOf(x.g.graph)[0]!;
  assert.deepEqual(RepairPlanSchema.parse(plan), plan);
  assert.match(plan.planId, /^repair_plan_v0_[a-f0-9]{64}$/);
  assert.deepEqual(plan.parent, { editGraph: x.g.graphArtifact.ref, editGraphId: x.g.graph.editGraphId, revision: 0 });
  assert.deepEqual(plan.render, { receiptId: x.c.receipt.receiptId, receiptVersion: "0.1.0", dagId: x.c.v.dag.dagId, programId: x.c.program.programId,
    renderComputationId: x.c.receipt.renderComputationId, output: { outputArtifactId: x.c.receipt.output.outputArtifactId, contentHash: x.c.receipt.output.contentHash,
      sizeBytes: x.c.receipt.output.sizeBytes } });
  assert.deepEqual(plan.technicalQc, { qcReceiptId: x.c.qc.qcReceiptId, verdict: "pass" });
  assert.deepEqual(plan.critic, { report: supplied(x.report, x.report.reportId).ref, reportId: x.report.reportId, finding: { findingId: x.finding.findingId,
    dimension: "technical_quality", severity: "info", basis: "measured", producerKind: "deterministic_check", affectedOutput: { startFrame: 45, endFrame: 60 }, joinIndex: null } });
  assert.deepEqual(plan.evidence, x.finding.evidenceRefs);
  assert.deepEqual(plan.planner, { plannerId: "synthetic_boundary_trim_fixture_planner", version: "0.1.0", basis: "synthetic_fixture" });
  assert.deepEqual(plan.attempt, { attempt: 1, maxAttempts: 2 });
  assert.deepEqual(plan.actions, [{ action: "trim_clip_source_range", clipUseId: a.clipUseId, keep: { start: F(0), end: F(45) } }]);
  assert.deepEqual(plan.effect, { clipsTouched: 1, removedOutputFrames: [{ startFrame: 45, endFrame: 60 }],
    affectedOutput: { startTicks: 1_500_000_000, endTicks: 4 * TICKS, ticksPerSecond: TICKS }, affectedDuration: { value: 5, rate: { numerator: 2, denominator: 1 } } });
  assert.equal(plan.rationale, FIXTURE_RATIONALE);
  assert.equal(plan.outcome, "proposal_only_repair_not_established_until_new_rendered_evidence_v0");
  const again = await planRepair({ ...planningInput(x), policy: fx.repairPolicy, planner: new BoundaryTrimFixturePlanner() });
  assert.equal(again.planId, plan.planId, "deterministic identity");
  assert.deepEqual(validateRepairPlan(plan, planningInput(x, { policy: fx.repairPolicy })), plan);
  // The plan compiles to exactly one typed trim that compares and swaps the parent's exact range; the diff's origin is this plan.
  assert.deepEqual(fx.diff.operations, [{ op: "trim_clip_source_range", clipUseId: a.clipUseId, expected: { range: a.source.range }, replacement: { range: range(0, 45) } }]);
  assert.deepEqual(fx.diff.origin, { kind: "repair_plan", repairPlan: fx.planArtifact.ref, repairPlanId: plan.planId });
  assert.deepEqual(compileRepairPlan(plan, x.g.graph, [...x.c.artifacts, fx.planArtifact]), fx.diff, "compilation is deterministic");
  const lineage = validateRepairRevision(fx.child, fx.artifacts);
  assert.deepEqual([lineage.plan.planId, lineage.diff.graphDiffId, lineage.child.editGraphId], [plan.planId, fx.diff.graphDiffId, fx.child.editGraphId]);
});

test("A02 foreign, stale or unbound inputs are refused: another render, output, QC, report, finding, graph, scope or missing evidence", async t => {
  const x = await reviewedChain(t), other = await reviewedChain(t, { sources: [{ key: "r3a_c" }, { key: "r3a_d", range: { startSeconds: 1, endSeconds: 3 } }] });
  const policy = repairPolicyFor(x.c.v.dag.scope), planner = new BoundaryTrimFixturePlanner();
  const attempt = (patch: Record<string, unknown>) => refusalAsync(() => planRepair({ ...planningInput(x, { policy, ...patch }), planner }));
  assert.equal(await attempt({ report: other.report }), "critic_report_mismatch");
  assert.equal(await attempt({ findingId: other.finding.findingId }), "finding_unknown");
  assert.equal(await attempt({ findingId: `critic_finding_v0_${"0".repeat(64)}` }), "finding_unknown");
  assert.equal(await attempt({ receipt: other.c.receipt }), "render_binding_mismatch");
  assert.equal(await attempt({ qc: other.c.qc }), "technical_qc_linkage_mismatch");
  assert.equal(await attempt({ qc: undefined }), "technical_qc_missing");
  assert.equal(await attempt({ graph: other.g.graph }), "render_binding_mismatch");
  assert.equal(await attempt({ observations: x.observations.slice(1) }), "finding_evidence_missing");
  assert.equal(await attempt({ policy: repairPolicyFor({ ...x.c.v.dag.scope, projectId: "project_other" }) }), "scope_mismatch");
  // A genuinely failed QC receipt of this exact render is refused as failed; a flipped verdict is not a QC receipt at all.
  assert.equal(await attempt({ qc: qcOnPaper(x.c.v, x.c.receipt, x.c.program, "fail") }), "technical_qc_failed");
  assert.equal(await attempt({ qc: { ...x.c.qc, verdict: "fail" } }), "technical_qc_invalid");
});

test("A03 the owner's repair budget bounds operations, clips, source trim, affected output, attempts, explanation and plan size", async t => {
  const x = await reviewedChain(t), scope = x.c.v.dag.scope;
  const plan = (budget: Record<string, unknown>, respond?: (input: RepairPlannerInput) => unknown) =>
    refusalAsync(() => planRepair({ ...planningInput(x, { policy: repairPolicyFor(scope, { budget }) }), planner: new BoundaryTrimFixturePlanner(respond) }));
  assert.equal(await plan({ maxSourceTrimPerOperation: { value: 1, rate: { numerator: 4, denominator: 1 } } }), "repair_budget_exceeded", "0.5 s removed > 0.25 s");
  assert.equal(await plan({ maxAffectedOutput: { value: 2, rate: { numerator: 1, denominator: 1 } } }), "repair_budget_exceeded", "2.5 s affected > 2 s");
  // Many small operations never add up past the owner's bounds (hostile R31).
  const two = (input: RepairPlannerInput) => ({ ...boundaryTrimOf(input), actions: [...boundaryTrimOf(input).actions,
    { action: "trim_clip_source_range", clipUseId: input.segments[1]!.clipUseId, keep: { start: F(30), end: F(84) } }] });
  assert.equal(await plan({ maxOperations: 1 }, two), "repair_budget_exceeded");
  assert.equal(await plan({ maxClipsTouched: 1 }, two), "repair_budget_exceeded");
  assert.equal(await plan({ maxExplanationCharacters: 20 }), "planner_response_invalid");
  assert.equal(await plan({ maxPlanBytes: 512 }), "repair_budget_exceeded");
  // A GraphDiff itself is bounded whatever produced it.
  const fx = await repaired(x);
  assert.equal(refusal(() => createGraphDiff({ ...diffBody(fx.child, []), operations: Array.from({ length: 17 }, () => fx.diff.operations[0]!) })), "graph_diff_invalid");
});
function boundaryTrimOf(input: RepairPlannerInput): { rationale: string; actions: unknown[]; uncertainty: unknown } {
  const a = input.segments[0]!;
  return { rationale: FIXTURE_RATIONALE, actions: [{ action: "trim_clip_source_range", clipUseId: a.clipUseId, keep: { start: F(0), end: F(45) } }],
    uncertainty: { state: "qualitative", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [] } };
}

test("A04 planner output is untrusted data: unsupported actions, commands, paths, filters, foreign targets and unrelated trims are refused", async t => {
  const x = await reviewedChain(t), policy = repairPolicyFor(x.c.v.dag.scope);
  const plan = (respond: (input: RepairPlannerInput) => unknown) => refusalAsync(() => planRepair({ ...planningInput(x, { policy }), planner: new BoundaryTrimFixturePlanner(respond) }));
  const base = (input: RepairPlannerInput) => boundaryTrimOf(input);
  const act = (input: RepairPlannerInput, patch: Record<string, unknown>) => ({ ...base(input), actions: [{ ...(base(input).actions[0] as object), ...patch }] });
  assert.equal(await plan(input => act(input, { action: "delete_clip" })), "repair_action_unsupported");
  assert.equal(await plan(input => ({ ...base(input), actions: [{ op: "replace", path: "/clipUses/0/source/range/end", value: F(45) }] })), "repair_action_unsupported");
  assert.equal(await plan(input => act(input, { command: "ffmpeg -ss 0 -t 1.5 -i a.mov" })), "planner_response_invalid");
  assert.equal(await plan(input => act(input, { filter: "trim=end=1.5" })), "planner_response_invalid");
  assert.equal(await plan(input => ({ ...base(input), shell: "rm -rf /" })), "planner_response_invalid");
  assert.equal(await plan(input => ({ ...base(input), rationale: "Trim C:\\media\\a.mov at https://x.test/a" })), "planner_response_invalid");
  assert.equal(await plan(input => ({ ...base(input), rationale: "Trim\u0000it" })), "planner_response_invalid");
  assert.equal(await plan(input => act(input, { keep: { start: F(0), end: 1.5 } })), "planner_response_invalid", "float seconds never enter a plan");
  assert.equal(await plan(input => act(input, { clipUseId: `edit_graph_clip_use_v0_${"2".repeat(64)}` })), "repair_action_invalid");
  assert.equal(await plan(input => act(input, { clipUseId: audioOf(x.g.graph)[0]!.clipUseId })), "repair_action_invalid");
  assert.equal(await plan(input => act(input, { keep: { start: F(0), end: F(66) } })), "repair_action_invalid", "a plan never extends source authority");
  assert.equal(await plan(input => act(input, { keep: { start: F(0), end: F(60) } })), "repair_action_invalid", "a no-op is not a repair");
  assert.equal(await plan(input => act(input, { keep: { start: F(15), end: F(60) } })), "repair_action_unrelated_to_finding", "removing frames 0-15 does not address 45-60");
  assert.equal(await plan(input => ({ ...base(input), actions: [] })), "planner_abstained");
  assert.equal(await plan(() => { throw new Error("model timeout"); }), "planner_failed");
  assert.equal(await plan(() => "trim the black part"), "planner_response_invalid");
});

test("A05 the planner receives a deep-frozen bounded copy and cannot change the policy, the finding or the attempt it was admitted under", async t => {
  const x = await reviewedChain(t), policy = repairPolicyFor(x.c.v.dag.scope), input = planningInput(x, { policy });
  let seen: RepairPlannerInput | undefined;
  const plan = await planRepair({ ...input, planner: new BoundaryTrimFixturePlanner(received => {
    seen = received;
    assert.ok(Object.isFrozen(received) && Object.isFrozen(received.finding) && Object.isFrozen(received.segments));
    assert.throws(() => { (received.limits as { maxOperations: number }).maxOperations = 99; });
    (input as { findingId: string }).findingId = `critic_finding_v0_${"0".repeat(64)}`;
    return boundaryTrimOf(received);
  }) });
  assert.ok(seen !== undefined);
  assert.doesNotMatch(JSON.stringify(seen), /[A-Za-z]:\\|\/\/|\.mov|\.mp4|render-outputs|staged-objects/i, "no location reaches the planner");
  assert.deepEqual(Object.keys(seen).sort(), ["actions", "clips", "evidence", "finding", "frameRate", "graph", "limits", "segments"]);
  assert.equal(plan.critic.finding.findingId, x.finding.findingId, "the finding admitted at entry is the finding recorded");
  assert.equal(requireRepairPlan(plan).planId, plan.planId);
  // A planner that widens the caller's policy object mid-call gains nothing: the plan is bounded by the policy snapshot taken at entry.
  const tight = repairPolicyFor(x.c.v.dag.scope, { budget: { maxOperations: 1 } }), mutable = planningInput(x, { policy: tight });
  const widened = await refusalAsync(() => planRepair({ ...mutable, planner: new BoundaryTrimFixturePlanner(received => {
    (mutable.policy as { budget: { maxOperations: number } }).budget.maxOperations = 99;
    return { ...boundaryTrimOf(received), actions: [...boundaryTrimOf(received).actions, { action: "trim_clip_source_range", clipUseId: received.segments[1]!.clipUseId,
      keep: { start: F(30), end: F(84) } }] };
  }) }));
  assert.equal(widened, "repair_budget_exceeded");
});

test("A06 repair is one bounded cycle: attempts derive from the revision lineage, never a caller count, and the owner's attempt bound refuses more", async t => {
  const x = await reviewedChain(t), fx = await repaired(x);
  assert.deepEqual(fx.plan.attempt, { attempt: 1, maxAttempts: 2 });
  // The child render reviewed on paper: its own near-black finding (a synthetic decode keeps frames 30-45 dark) would be attempt 2.
  const child = await reviewedRevision(t, x, fx, [30, 45]);
  const second = await planRepair({ ...planningInput(child), policy: repairPolicyFor(x.c.v.dag.scope), planner: new BoundaryTrimFixturePlanner() });
  assert.deepEqual([second.attempt, second.parent.revision], [{ attempt: 2, maxAttempts: 2 }, 1]);
  assert.equal(await refusalAsync(() => planRepair({ ...planningInput(child), policy: repairPolicyFor(x.c.v.dag.scope, { budget: { maxRepairAttempts: 1 } }),
    planner: new BoundaryTrimFixturePlanner() })), "repair_attempts_exhausted");
});

// ================================================================ I localized execution: pure reuse planning and exact intermediate contracts
/** The on-paper segmented parent ("ab") and its tail-trimmed child's program: the same source bytes, so segment identities can match. */
async function priorAndChild(t: TestContext) {
  const prior = await segmentedChain(t, "ab"), r = revise(prior.g.graph, trim(prior.g.graph, 0, [0, 45]), prior.g.artifacts);
  return { prior, r, child: programOf(revisionDag(prior.g, r.child, r.artifacts)) };
}
test("I01 the localized plan reuses exactly the segments a prior segmented receipt with passing linked QC certifies, and computes the rest", async t => {
  const { prior, r, child } = await priorAndChild(t);
  const none = planLocalizedExecution({ program: child, scope: r.child.scope, prior: null });
  assert.deepEqual(none.segments.map(s => s.decision), ["compute", "compute"]);
  const plan = planLocalizedExecution({ program: child, scope: r.child.scope, prior: { receipt: prior.receipt, qc: prior.qc } });
  assert.deepEqual(plan.segments.map(s => [s.position, s.decision, s.reason]), [[0, "compute", "segment_computation_not_certified_by_prior"],
    [1, "reuse_certified_artifact", "identical_segment_computation_certified_by_prior_receipt_with_passing_qc"]]);
  const certified = prior.receipt.segments.find(s => s.segmentComputationId === child.segments[1]!.segmentComputationId)!;
  assert.deepEqual(plan.segments[1]!.certified, certified.artifact);
  assert.deepEqual(plan.prior, { receiptId: prior.receipt.receiptId, qcReceiptId: prior.qc.qcReceiptId, outputContentHash: prior.receipt.output.contentHash });
  assert.deepEqual(plan.summary, { segments: 2, reuse: 1, compute: 1 });
  assert.equal(planLocalizedExecution({ program: child, scope: r.child.scope, prior: { receipt: prior.receipt, qc: prior.qc } }).planId, plan.planId, "deterministic");
});

test("I02 no trusted reuse without a prior segmented receipt and its passing, exactly linked QC, in this scope and executor", async t => {
  const { prior, r, child } = await priorAndChild(t);
  const plan = (receipt: unknown, qc: unknown, scope = r.child.scope) => refusal(() => planLocalizedExecution({ program: child, scope, prior: { receipt, qc } }));
  const failed = qcOnPaper(prior.v, prior.receipt, prior.program, "fail");
  assert.equal(failed.verdict, "fail");
  assert.equal(plan(prior.receipt, failed), "segment_reuse_authority_invalid", "a prior whose technical QC failed certifies nothing");
  assert.equal(plan(prior.receipt, undefined), "segment_reuse_authority_invalid");
  const other = await segmentedChain(t, "three");
  assert.equal(plan(prior.receipt, other.qc), "segment_reuse_authority_invalid", "QC of another receipt");
  const onePass = await renderedChain(t, AB, { graph: { cut: true } });
  assert.equal(plan(onePass.receipt, onePass.qc), "segment_reuse_authority_invalid", "a one-pass receipt certifies no segment artifact");
  assert.equal(plan(prior.receipt, prior.qc, { ...r.child.scope, projectId: "project_other" }), "segment_reuse_authority_invalid");
  const forged = reidentify(prior.receipt, "receiptId", "render_execution_receipt_v0", c => { c.segments[1]!.artifact.video.contentHash = "7".repeat(64); });
  assert.equal(plan(forged, prior.qc), "segment_reuse_authority_invalid", "a receipt re-identified with other artifact bytes no longer matches its QC");
});

test("I03 a durable segment record is reusable only for exactly its computation, intermediate format and certified bytes", async t => {
  const { prior } = await priorAndChild(t), seg = prior.receipt.segments[1]!, record = prior.records[1]!;
  const expected = { segmentComputationId: seg.segmentComputationId, artifact: seg.artifact };
  assert.deepEqual(checkSegmentArtifactRecord(record, expected), record);
  assert.equal(segmentRecordKeyOf(seg.segmentComputationId), seg.segmentComputationId.slice(-64));
  assert.equal(refusal(() => segmentRecordKeyOf("render_program_v0_" + "a".repeat(64))), "input_invalid");
  assert.equal(record.semantics.digest, SEGMENT_EXECUTION_SEMANTICS_DIGEST);
  assert.equal(refusal(() => checkSegmentArtifactRecord(record, { ...expected, segmentComputationId: prior.receipt.segments[0]!.segmentComputationId })), "segment_artifact_mismatch");
  assert.equal(refusal(() => checkSegmentArtifactRecord(record, { ...expected, artifact: { ...seg.artifact, video: { ...seg.artifact.video, contentHash: "8".repeat(64) } } })),
    "segment_artifact_mismatch");
  const otherFormat = reidentify(record, "recordId", "segment_artifact_record_v0", c => { c.semantics.digest = "9".repeat(64); });
  assert.equal(refusal(() => checkSegmentArtifactRecord(otherFormat, expected)), "segment_artifact_mismatch");
  const forged = { ...record, video: { ...record.video, contentHash: "6".repeat(64) } };
  assert.equal(refusal(() => checkSegmentArtifactRecord(forged, expected)), "segment_artifact_corrupt");
});

test("I04 stage and assembly arguments are the accepted one-pass semantics split exactly: the same segment chain, the same encode tail, fd only", () => {
  const program = programOf(dagOfGraph("clip_look_ab")), onePass = compileFfmpegArguments(program, { maxOutputBytes: 64 * 1024 * 1024 }).argv;
  const graph = onePass[onePass.indexOf("-filter_complex") + 1]!;
  for (const segment of program.segments) {
    const stage = compileSegmentStageArguments(program, segment.position);
    const stageGraph = stage.argv[stage.argv.indexOf("-filter_complex") + 1]!;
    const chain = /^\[0:v:0\](.+)\[v\];\[0:a:0\](.+)\[a\]$/.exec(stageGraph);
    assert.ok(chain !== null, stageGraph);
    assert.ok(graph.includes(`${chain[1]}[v${segment.position}]`), "the stage runs exactly the one-pass segment video chain");
    assert.ok(graph.includes(`${chain[2]}[a${segment.position}]`), "and exactly its audio chain");
    assert.deepEqual(stage.descriptors, { input: 3, video: 4, audio: 5 });
    const text = stage.argv.join(" ");
    assert.ok(text.includes("-protocol_whitelist fd -f mov -fd 3 -i fd:"), "the one verified staged source, fd only");
    assert.ok(text.includes("-map [v] -fps_mode passthrough -c:v rawvideo -pix_fmt yuv420p") && text.includes("-f rawvideo -protocol_whitelist fd -fd 4 fd:"),
      "exact raw planar frames to the pending video artifact");
    assert.ok(text.includes("-map [a] -c:a pcm_f32le") && text.includes("-f f32le -protocol_whitelist fd -fd 5 fd:"), "exact float samples to the pending audio artifact");
  }
  const assembly = compileAssemblyArguments(program, { maxOutputBytes: 64 * 1024 * 1024 });
  assert.deepEqual(assembly.descriptors, { segments: [{ video: 3, audio: 4 }, { video: 5, audio: 6 }], output: 7 });
  const tail = (argv: readonly string[]) => argv.slice(argv.indexOf("-map"));
  assert.deepEqual(tail(assembly.argv).slice(0, -2), tail(onePass).slice(0, -2), "the identical map and encode tail");
  assert.deepEqual([tail(assembly.argv).slice(-2), tail(onePass).slice(-2)], [["7", "fd:"], ["5", "fd:"]], "only the output descriptor differs");
  for (const argv of [assembly.argv, ...program.segments.map(s => compileSegmentStageArguments(program, s.position).argv)]) {
    assert.ok(argv.every(a => !/[A-Za-z]:[\\/]|\\\\|\/\/|https?:|file:|\.(?:mp4|mov|yuv|f32|bin|json)\b/i.test(a)), "no location, only fd handles");
    assert.equal(argv.filter(a => a === "-protocol_whitelist").length, argv.filter(a => a === "fd:").length, "every input and output is fd-only");
  }
});

test("I05 intermediate bytes are exact and bounded: each segment's raw frames and samples are known before any process runs", () => {
  const program = programOf(dagOfGraph("cut_ab"));
  assert.deepEqual(program.segments.map(s => segmentArtifactShapeOf(program, s.position)), [
    { video: { frames: 60, width: 180, height: 320, pixelFormat: "yuv420p", bytes: 60 * 86_400 }, audio: { samples: 96_000, channels: 2, sampleRateHz: 48_000, bytes: 768_000 } },
    { video: { frames: 60, width: 180, height: 320, pixelFormat: "yuv420p", bytes: 60 * 86_400 }, audio: { samples: 96_000, channels: 2, sampleRateHz: 48_000, bytes: 768_000 } }]);
  assert.equal(refusal(() => segmentArtifactShapeOf(program, 2)), "input_invalid");
});

// ================================================================ K scope discipline and purity of the new core
test("K01 the Batch-3B core is pure and implements no EditorialState, RevisionLedger, loop, motion, HyperFrames or provider path", () => {
  const files = [...readdirSync("packages/edit-repair").map(f => join("packages/edit-repair", f)), "packages/edit-graph/revision.ts", "packages/edit-render/localized.ts"]
    .filter(f => f.endsWith(".ts"));
  assert.ok(files.length >= 6);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/from\s+"([^"]+)"/g)) assert.ok(match[1] === "zod" || match[1] === "node:crypto" || match[1]!.startsWith("."), `${file}: ${match[1]}`);
    assert.doesNotMatch(text, /Date\.now|new Date|Math\.random|process\.|fetch\s*\(|child_process|node:fs/, file);
    assert.doesNotMatch(text, /RevisionLedger|EditorialState|keep this exact|likedRegion|rejectedRegion|conversation|HyperFrames|gsap|lottie|three\.js|MotionComposition|AudioGraph/i, file);
    assert.doesNotMatch(text, /\bwhile\s*\(\s*true|for\s*\(\s*;\s*;\s*\)/, `${file}: no unbounded loop`);
    assert.doesNotMatch(text, /openai|anthropic|gemini|deepseek/i, file);
  }
});

// ================================================================ R hostile self-review (attacks written after the first GREEN; named by spec item)
/** Every object reachable from `value` gets every scalar field overwritten: anything aliased to it would show the damage. */
function scribble(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === "object") scribble(child); else (value as Record<string, unknown>)[key] = "scribbled";
  }
}
test("R01 a critic never mutates: planning over deep-frozen records leaves them byte-identical, and nothing outside the graph layer applies a GraphDiff", async t => {
  const x = await reviewedChain(t), records = { graph: x.g.graph, receipt: x.c.receipt, qc: x.c.qc, report: x.report, observations: x.observations };
  const before = canonicalSerialize(records);
  deepFreeze(records);
  const plan = await planRepair({ ...planningInput(x), ...records, planner: new BoundaryTrimFixturePlanner() });
  assert.equal(canonicalSerialize(records), before, "planning read the finding and changed nothing");
  assert.equal(plan.outcome, "proposal_only_repair_not_established_until_new_rendered_evidence_v0");
  const sources = (dir: string) => readdirSync(dir).filter(f => f.endsWith(".ts")).map(f => ({ file: join(dir, f), text: readFileSync(join(dir, f), "utf8") }));
  for (const { file, text } of sources("packages/edit-review")) assert.doesNotMatch(text, /applyGraphDiff|createGraphDiff|edit-repair|revision\.js/, file);
  const appliers = ["packages/edit-graph", "packages/edit-execution", "packages/edit-render", "packages/edit-review", "packages/edit-repair"].flatMap(sources)
    .filter(s => /applyGraphDiff\(/.test(s.text)).map(s => s.file.split("\\").join("/")).sort();
  assert.deepEqual(appliers, ["packages/edit-graph/revision.ts", "packages/edit-repair/revision.ts"], "the graph layer and the repair compiler are the only callers");
});

test("R02 a RepairPlan carries only typed trims: an extra field, a patch or an unregistered action is not a plan and never compiles", async t => {
  const x = await reviewedChain(t), fx = await repaired(x);
  const forge = (mutate: (p: Record<string, unknown>) => void) => reidentify(fx.plan, "planId", "repair_plan_v0", p => mutate(p as unknown as Record<string, unknown>));
  const forgeries = [
    forge(p => { ((p.actions as Record<string, unknown>[])[0]!).path = "/output/durationTicks"; }),
    forge(p => { p.patch = [{ op: "replace", path: "/output", value: {} }]; }),
    forge(p => { ((p.actions as Record<string, unknown>[])[0]!).action = "set_field"; }),
    forge(p => { ((p.actions as Record<string, unknown>[])[0]!).keep = { start: F(0), end: { value: 1.5, rate: { numerator: 1, denominator: 1 } } }; }),
  ];
  for (const forged of forgeries) {
    assert.equal(refusal(() => requireRepairPlan(forged)), "repair_plan_invalid");
    assert.equal(refusal(() => compileRepairPlan(forged, x.g.graph, [...x.c.artifacts, supplied(forged, forged.planId)])), "repair_plan_invalid");
  }
  assert.deepEqual(fx.diff.operations.map(o => Object.keys(o).sort()), [["clipUseId", "expected", "op", "replacement"]], "one typed operation, nothing else");
});

test("R03 R30 an applied GraphDiff holding a JSON patch, a pointer field or a future operation is refused whole, never partly applied or ignored", () => {
  const g = graphOf("cut_ab"), diff = trim(g.graph, 0, [0, 45]);
  const forge = (mutate: (ops: unknown[]) => void) => reidentify(diff, "graphDiffId", "graph_diff_v0", d => mutate(d.operations as unknown[]));
  const b = clipsOf(g.graph)[1]!, bTrim = { op: "trim_clip_source_range", clipUseId: b.clipUseId, expected: { range: b.source.range }, replacement: { range: range(30, 75) } };
  assert.equal(refusal(() => applyGraphDiff(g.graph, forge(ops => { ops[0] = { op: "replace", path: "/clipUses/0/source/range/end", value: F(45) }; }), g.artifacts)),
    "graph_diff_operation_unsupported");
  assert.equal(refusal(() => applyGraphDiff(g.graph, forge(ops => { ops.push({ op: "move_keyframe", keyframeId: "k", to: F(3) }); }), g.artifacts)),
    "graph_diff_operation_unsupported", "a valid trim beside a future operation is not partly applied");
  assert.equal(refusal(() => applyGraphDiff(g.graph, forge(ops => { (ops[0] as Record<string, unknown>).path = "/output/durationTicks"; }), g.artifacts)), "graph_diff_invalid");
  assert.equal(refusal(() => applyGraphDiff(g.graph, forge(ops => { ops.push(bTrim, { ...bTrim }); }), g.artifacts)), "graph_diff_invalid", "one operation per node");
});

test("R04 R05 R06 stale plans never compile: a plan binds its exact parent, output and finding; re-applying it to its own child is refused", async t => {
  const x = await reviewedChain(t), fx = await repaired(x), base = [...x.c.artifacts, fx.planArtifact];
  assert.deepEqual(applyRepairPlan(fx.plan, x.g.graph, base), { diff: fx.diff, child: fx.child }, "the same plan against the same parent: the same revision");
  assert.equal(refusal(() => compileRepairPlan(fx.plan, fx.child, fx.artifacts)), "repair_plan_stale", "a plan for revision 0 never compiles against revision 1");
  assert.equal(refusal(() => applyRepairPlan(fx.plan, fx.child, fx.artifacts)), "repair_plan_stale");
  const other = await reviewedChain(t, { sources: [{ key: "r3a_c" }, { key: "r3a_d", range: { startSeconds: 1, endSeconds: 3 } }] });
  assert.equal(refusal(() => compileRepairPlan(fx.plan, other.g.graph, [...other.c.artifacts, fx.planArtifact])), "repair_plan_stale", "another graph");
  // A plan re-identified with another output hash, another finding region or another parent revision does not replay from its bindings.
  const forge = (mutate: (p: typeof fx.plan) => void) => reidentify(fx.plan, "planId", "repair_plan_v0", mutate);
  for (const forged of [forge(p => { p.render.output.contentHash = "3".repeat(64); }), forge(p => { p.critic.finding.affectedOutput = { startFrame: 40, endFrame: 60 }; }),
    forge(p => { p.attempt = { attempt: 2, maxAttempts: 2 }; })]) {
    assert.equal(refusal(() => validateRepairPlan(forged, planningInput(x, { policy: fx.repairPolicy }))), "repair_plan_invalid");
  }
  // The finding of revision 0 cannot repair revision 1: the child's render with the parent's report is refused.
  const child = await reviewedRevision(t, x, fx, [30, 45]);
  assert.equal(await refusalAsync(() => planRepair({ ...planningInput(child), report: x.report, findingId: x.finding.findingId, observations: x.observations,
    planner: new BoundaryTrimFixturePlanner() })), "critic_report_mismatch");
});

test("R08 R09 R12 a trim never substitutes the source, carries float or unit-less time, or separates linked audio from its video", () => {
  const g = graphOf("cut_ab"), a = clipsOf(g.graph)[0]!, op = { clipUseId: a.clipUseId, expected: a.source.range, replacement: range(0, 45) };
  const body = diffBody(g.graph, [op]), first = (body.operations as Record<string, unknown>[])[0]!;
  assert.equal(refusal(() => createGraphDiff({ ...body, operations: [{ ...first, source: { assetId: "asset_other", sourceHash: "4".repeat(64) } }] })), "graph_diff_invalid");
  for (const end of [{ value: 1.5, rate: { numerator: 1, denominator: 1 } }, { seconds: 1.5 }, { value: 1500, rate: { numerator: 1000, denominator: 1 }, unit: "ms" }]) {
    assert.equal(refusal(() => createGraphDiff({ ...body, operations: [{ ...first, replacement: { range: { start: F(0), end } } }] })), "graph_diff_invalid", JSON.stringify(end));
  }
  const r = tailTrimmed();
  const forge = (mutate: (c: EditGraphRevision) => void) => reidentify(r.child, "editGraphId", "edit_graph_v0", mutate);
  const substituted = forge(c => { for (const u of c.clipUses) if (u.source.assetId === a.source.assetId) u.source.sourceHash = "4".repeat(64); });
  const diverged = forge(c => { const linked = c.clipUses.find(u => u.medium === "source_audio")!; linked.source.range = range(0, 60); });
  for (const forged of [substituted, diverged]) assert.notEqual(refusal(() => validateEditGraphRevision(forged, r.artifacts)), "");
  assert.equal(clipsOf(r.child)[0]!.source.sourceHash, a.source.sourceHash, "the repaired clip keeps its exact source bytes");
});

test("R14 a clip look whose extent was not re-derived is refused", () => {
  const clip = graphOf("clip_look_ab"), rc = revise(clip.graph, trim(clip.graph, 0, [0, 45]), clip.artifacts);
  const stale = reidentify(rc.child, "editGraphId", "edit_graph_v0", c => {
    const look = c.operations.find(o => o.primitive === "color_look")!;
    if (look.primitive === "color_look") look.extents = [{ startTicks: 0, endTicks: 2 * TICKS }];
  });
  assert.notEqual(refusal(() => validateEditGraphRevision(stale, rc.artifacts)), "");
});

test("R22 a durable record of another runtime, or a prior of another executor, certifies nothing even under a matching segment identity", async t => {
  const { prior, child } = await priorAndChild(t), record = prior.records[1]!, seg = prior.receipt.segments[1]!;
  const otherRuntime = reidentify(record, "recordId", "segment_artifact_record_v0", c => { c.runtime = { ...c.runtime, implementationDigest: "3".repeat(64) }; });
  assert.equal(refusal(() => checkSegmentArtifactRecord(otherRuntime, { segmentComputationId: seg.segmentComputationId, artifact: { ...seg.artifact, recordId: otherRuntime.recordId },
    use: { program: child, position: 1 } })), "segment_artifact_mismatch");
  const otherExecutor = reidentify(prior.receipt, "receiptId", "render_execution_receipt_v0", c => { c.executor = { ...c.executor, implementationDigest: "2".repeat(64) }; });
  const qcFor = reidentify(prior.qc, "qcReceiptId", "technical_media_qc_receipt_v0", c => { c.execution.receiptId = otherExecutor.receiptId; });
  assert.equal(refusal(() => planLocalizedExecution({ program: child, scope: prior.receipt.scope, prior: { receipt: otherExecutor, qc: qcFor } })), "segment_reuse_authority_invalid");
});

test("R23 R24 R25 the child's repair never binds the parent's receipt, QC, report or observations", async t => {
  const x = await reviewedChain(t), fx = await repaired(x), child = await reviewedRevision(t, x, fx, [30, 45]), planner = new BoundaryTrimFixturePlanner();
  const attempt = (patch: Record<string, unknown>) => refusalAsync(() => planRepair({ ...planningInput(child), ...patch, planner }));
  assert.equal(await attempt({ receipt: x.c.receipt }), "render_binding_mismatch", "a stale final receipt");
  assert.equal(await attempt({ qc: x.c.qc }), "technical_qc_linkage_mismatch", "old QC for the new output");
  assert.equal(await attempt({ observations: x.observations }), "finding_evidence_missing", "old observations under the new content hash");
  assert.notEqual(child.c.receipt.output.contentHash, x.c.receipt.output.contentHash);
});

test("R26 an output identity that is not exactly its bytes is not a receipt, and a coherent rewrite no longer matches its QC", async t => {
  const prior = await segmentedChain(t, "ab"), program = prior.program;
  const stale = reidentify(prior.receipt, "receiptId", "render_execution_receipt_v0", c => { c.output.contentHash = "4".repeat(64); });
  assert.equal(AnyRenderExecutionReceiptSchema.safeParse(stale).success, false, "hash changed, identity not");
  const coherent = reidentify(prior.receipt, "receiptId", "render_execution_receipt_v0", c => {
    c.output.contentHash = "4".repeat(64); c.output.outputArtifactId = outputArtifactIdOf(c.output); });
  assert.equal(AnyRenderExecutionReceiptSchema.safeParse(coherent).success, true);
  assert.equal(refusal(() => planLocalizedExecution({ program, scope: prior.receipt.scope, prior: { receipt: coherent, qc: prior.qc } })), "segment_reuse_authority_invalid");
});

test("R27 a whole-output look runs only in the assembly: no segment stage computes it, and every assembly does", () => {
  const program = programOf(dagOfGraph("whole_look_ab"));
  assert.ok(program.wholeOutputLook.state === "applied");
  const look = colorLookStep(program.wholeOutputLook.look, program.wholeOutputLook.intensityPerMille).filters.join(",");
  const graphOfArgv = (argv: readonly string[]) => argv[argv.indexOf("-filter_complex") + 1]!;
  assert.ok(graphOfArgv(compileAssemblyArguments(program, { maxOutputBytes: 1_000_000 }).argv).includes(`[vc]${look}[vl]`));
  for (const s of program.segments) assert.ok(!graphOfArgv(compileSegmentStageArguments(program, s.position).argv).includes(look));
});

test("R29 a new revision, plan or impact shares no mutable state with what it was made from", async t => {
  const g = renderGraph(SPECS.cut_ab), before = canonicalSerialize(g.graph), diff = trim(g.graph, 0, [0, 45]), diffBefore = canonicalSerialize(diff);
  const child = applyGraphDiff(g.graph, diff, [...g.artifacts, supplied(diff, diff.graphDiffId)]);
  scribble(child);
  assert.deepEqual([canonicalSerialize(g.graph), canonicalSerialize(diff)], [before, diffBefore]);
  const x = await reviewedChain(t), inputs = canonicalSerialize({ graph: x.g.graph, report: x.report, observations: x.observations, receipt: x.c.receipt });
  const fx = await repaired(x);
  scribble(fx.plan); scribble(validateRepairPlan(requireRepairPlan(await planRepair({ ...planningInput(x), policy: fx.repairPolicy, planner: new BoundaryTrimFixturePlanner() })),
    planningInput(x, { policy: fx.repairPolicy })));
  assert.equal(canonicalSerialize({ graph: x.g.graph, report: x.report, observations: x.observations, receipt: x.c.receipt }), inputs);
});

test("R32 planner uncertainty may cite only the finding's own evidence: an invented or foreign evidence reference is refused", async t => {
  const x = await reviewedChain(t), policy = repairPolicyFor(x.c.v.dag.scope);
  const withEvidence = (refs: (input: RepairPlannerInput) => unknown[]) => (input: RepairPlannerInput) => ({ ...boundaryTrimOf(input),
    uncertainty: { state: "qualitative", reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: refs(input) } });
  const invented = { artifact: { objectId: `editorial_observation_v0_${"9".repeat(64)}`, sha256: "9".repeat(64), artifactType: "EditorialObservation", artifactVersion: "0.1.0" },
    pointer: "/result" };
  assert.equal(await refusalAsync(() => planRepair({ ...planningInput(x, { policy }), planner: new BoundaryTrimFixturePlanner(withEvidence(() => [invented])) })),
    "planner_response_invalid", "an evidence reference no supplied observation holds");
  const cited = await planRepair({ ...planningInput(x, { policy }), planner: new BoundaryTrimFixturePlanner(withEvidence(input => [input.evidence[0]!.ref])) });
  assert.deepEqual(cited.uncertainty.evidenceRefs, [x.finding.evidenceRefs[0]]);
  assert.deepEqual(validateRepairPlan(cited, planningInput(x, { policy })), cited);
});

test("R33 one proposal per plan: a failing, abstaining or refused planner is called exactly once and never retried", async t => {
  const x = await reviewedChain(t), policy = repairPolicyFor(x.c.v.dag.scope);
  for (const respond of [() => { throw new Error("timeout"); }, (input: RepairPlannerInput) => ({ ...boundaryTrimOf(input), actions: [] }), () => "trim it"]) {
    const planner = new BoundaryTrimFixturePlanner(respond);
    assert.notEqual(await refusalAsync(() => planRepair({ ...planningInput(x, { policy }), planner })), "");
    assert.equal(planner.seen.length, 1);
  }
});

test("R-AWAIT planning uses only the artifacts admitted at entry: a caller changing its artifact list while the planner runs changes nothing", async t => {
  const x = await reviewedChain(t), policy = repairPolicyFor(x.c.v.dag.scope), artifacts = [...x.c.artifacts];
  const reference = await planRepair({ ...planningInput(x, { policy }), planner: new BoundaryTrimFixturePlanner() });
  const plan = await planRepair({ ...planningInput(x, { policy }), artifacts, planner: new BoundaryTrimFixturePlanner(received => {
    artifacts.length = 0;
    return boundaryTrimOf(received);
  }) });
  assert.deepEqual(plan, reference);
});

// ================================================================ owner review OR1 (added with the repair; M04 in the media suite is its RED)
test("R-LINEAGE a revision's lineage validates only as a whole: arbitrary diffs, fabricated plans, foreign bindings and missing steps are refused, down to the root", async t => {
  const x = await reviewedChain(t), fx = await repaired(x), [a, b] = clipsOf(x.g.graph) as [ReturnType<typeof clipsOf>[number], ReturnType<typeof clipsOf>[number]];
  const step = (c: ReviewedChain, policy = fx.repairPolicy) => ({ dag: c.c.v, artifacts: c.c.artifacts, receipt: c.c.receipt, qc: c.c.qc, report: c.report,
    observations: c.observations, policy });
  const foreignPolicy = repairPolicyFor(x.c.v.dag.scope, { budget: { maxRepairAttempts: 3 } });
  assert.deepEqual(validateRepairLineage(fx.child, fx.artifacts, [step(x)]).plans.map(p => p.planId), [fx.plan.planId]);
  assert.equal(refusal(() => validateRepairLineage(fx.child, fx.artifacts, [])), "repair_lineage_invalid", "a revision without its repair step");
  // An arbitrary typed GraphDiff whose origin names a RepairPlan that exists nowhere, with the genuine bindings.
  const ra = revise(x.g.graph, createGraphDiff(diffBody(x.g.graph, [{ clipUseId: a.clipUseId, expected: a.source.range, replacement: range(0, 45) }])), x.c.artifacts);
  assert.equal(refusal(() => validateRepairLineage(ra.child, ra.artifacts, [step(x)])), "repair_lineage_invalid");
  // A self-identified plan that compiles exactly to its GraphDiff but does not address the finding it names (it trims B's head).
  const forged = reidentify(fx.plan, "planId", "repair_plan_v0", p => { p.actions = [{ action: "trim_clip_source_range", clipUseId: b.clipUseId, keep: range(36, 90) }]; });
  const withForged = [...x.c.artifacts, supplied(forged, forged.planId)], rf = revise(x.g.graph, compileRepairPlan(forged, x.g.graph, withForged), withForged);
  assert.equal(refusal(() => validateRepairLineage(rf.child, rf.artifacts, [step(x)])), "repair_action_unrelated_to_finding");
  // The genuine plan with bindings it was not made under: another owner policy, or another render.
  assert.equal(refusal(() => validateRepairLineage(fx.child, fx.artifacts, [step(x, foreignPolicy)])), "repair_plan_invalid");
  const other = await reviewedChain(t, { sources: [{ key: "r3a_c" }, { key: "r3a_d", range: { startSeconds: 1, endSeconds: 3 } }] });
  assert.equal(refusal(() => validateRepairLineage(fx.child, fx.artifacts, [step(other)])), "render_binding_mismatch");
  // Revision 2 validates its whole lineage down to the initial graph: every revision needs its own step, and a bad first step refuses it.
  const child = await reviewedRevision(t, x, fx, [30, 45]);
  const second = await planRepair({ ...planningInput(child), policy: fx.repairPolicy, planner: new BoundaryTrimFixturePlanner() });
  const withSecond = [...child.c.artifacts, supplied(second, second.planId)], r2 = revise(fx.child, compileRepairPlan(second, fx.child, withSecond), withSecond);
  assert.deepEqual(validateRepairLineage(r2.child, r2.artifacts, [step(x), step(child)]).plans.map(p => p.planId), [fx.plan.planId, second.planId]);
  assert.equal(refusal(() => validateRepairLineage(r2.child, r2.artifacts, [step(child)])), "repair_lineage_invalid");
  assert.equal(refusal(() => validateRepairLineage(r2.child, r2.artifacts, [step(x, foreignPolicy), step(child)])), "repair_plan_invalid");
});
