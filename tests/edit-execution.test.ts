import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DecisionEventSchema, JobStateSchema, QCResultSchema, RenderResultSchema, UniversalEditPlanSchema } from "../packages/contracts/index.js";
import { exactDigest, identify, missing, type SuppliedArtifact } from "../packages/editorial/common.js";
import { supplied, validateEditGraph, type EditGraph } from "../packages/edit-graph/index.js";
import { budget, reserve, type ComputeBudget } from "../packages/routing/index.js";
import { EDIT_EXECUTION_ERROR_CODES, EditExecutionError, admitExecution, buildExecutionDag, createExecutionGrant, createExecutionWorkEstimate, createSourceAccessReceipt,
  frameIndexAt, validateExecutionAdmission, validateExecutionDag, type ExecutionAdmission, type ExecutionDag } from "../packages/edit-execution/index.js";
import { identifyDagNodes, type ExecutionDagNodeDraft } from "../packages/edit-execution/dag.js";
import { createFixtures } from "../samples/fixtures.js";
import { directionFixture } from "./support/planning.js";
import { ENVIRONMENT, EXECUTOR, TIME6, VIDEO_SUPPORTS, artifact, capabilitySnapshot, chosenOption, colorLook, cutAt, declaration, declarations, executorBody, failedAttempt, graphOf, member,
  operationNode, plan, planningFixture, planningPolicyBody, repeatedUses, resolution, unavailableRefs, variantDirectionFixture, videoUses, withDirection,
  type GraphFixture } from "./support/edit-graph.js";
import { chainFixture, orderedSourcesPolicy, variableFrameMetadata } from "./support/edit-execution-chains.js";
import { EXECUTION_LIMITS, ESTIMATE, FINAL_RESOLUTION, HALF_LIMITS, OPERATION, RUNTIME, T7, admissionOf, availableRuntime, budgetChain, currentMediaAsset, dagOf,
  evidenceRef, executionInputs, executionPolicy, freshExecutorBody, freshSnapshot, graphSources, mediaGrant, renderProfile, runtimeAttestation, runtimeConfiguration,
  runtimeConformance, scope, type ExecutionOptions, type GraphSource } from "./support/edit-execution.js";
import { exactProduct } from "../packages/edit-execution/workload.js";

// ---------------------------------------------------------------- helpers
/** A canonical exact source instant (Gate 7 Batch 3A-F): value / perSecond seconds. */
const instant = (value: number, perSecond = 1) => ({ value, rate: { numerator: perSecond, denominator: 1 } });
function errorCode(run: () => unknown): string {
  try { run(); } catch (error) {
    assert.ok(error instanceof EditExecutionError, `expected an owned EditExecutionError, received ${String(error)}`);
    assert.ok((EDIT_EXECUTION_ERROR_CODES as readonly string[]).includes(error.code), error.code);
    return error.code;
  }
  assert.fail("expected an owned EditExecutionError");
}
/** Builds the synthetic execution inputs outside the assertion so fixture mistakes are never mistaken for refusals. */
function refusal(g: GraphFixture, o: ExecutionOptions = {}): string {
  const x = executionInputs(g, o);
  return errorCode(() => admitExecution(x.request, x.artifacts));
}
const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
function reidentify<T extends object>(value: T, key: string, namespace: string) {
  const body = { ...value } as Record<string, unknown>;
  delete body[key];
  return identify(namespace, key, body);
}
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) allKeys(item, keys);
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); allKeys(child, keys); }
  return keys;
}
/** Every string value with the key that holds it. */
function allStrings(value: unknown, key = "", out: { key: string; text: string }[] = []): { key: string; text: string }[] {
  if (typeof value === "string") out.push({ key, text: value });
  else if (Array.isArray(value)) for (const item of value) allStrings(item, key, out);
  else if (value !== null && typeof value === "object") for (const [k, child] of Object.entries(value)) allStrings(child, k, out);
  return out;
}
type DagNode = ExecutionDag["nodes"][number];
const nodesOf = <K extends DagNode["kind"]>(dag: ExecutionDag, kind: K) => dag.nodes.filter((n): n is Extract<DagNode, { kind: K }> => n.kind === kind);
/** White-box: the exact node drafts a DAG was identified from, with inputs as earlier node positions. */
function redraft(dag: ExecutionDag): ExecutionDagNodeDraft[] {
  const index = new Map(dag.nodes.map((node, i) => [node.nodeId, i]));
  return dag.nodes.map(node => {
    const { nodeId: _nodeId, computationId: _computationId, inputs, ...rest } = structuredClone(node);
    return { ...rest, inputs: inputs.map(id => index.get(id)!) } as unknown as ExecutionDagNodeDraft;
  });
}
type ClipDraft = Extract<ExecutionDagNodeDraft, { kind: "source_video_clip" }>;
/** Moves one clip's exact source range to [1, 3) seconds without changing its length, with coherent 10 fps frame authority. */
function shiftClip(drafts: ExecutionDagNodeDraft[], index: number): ExecutionDagNodeDraft[] {
  const mutated = structuredClone(drafts), target = mutated[index] as ClipDraft;
  assert.equal(target.kind, "source_video_clip");
  target.source.range = { start: instant(1), end: instant(3) };
  const frame = (frameIndex: number) => ({ kind: "frame_pts" as const, frameIndex, evidence: { artifact: target.source.analysis, pointer: `/metadata/frameTimes/${frameIndex}` } });
  target.source.trim = { ...target.source.trim, precision: "frame_pts_exact", startAuthority: frame(10), endAuthority: frame(30) };
  target.mapping.sourceStartTicks = 1_000_000_000;
  target.mapping.sourceEndTicks = 3_000_000_000;
  return mutated;
}
/** Coordinated forgery: re-identify changed nodes, the render identity, the render binding and the DAG so only replay from the admission can object. */
function resealDag(dag: ExecutionDag, drafts: ExecutionDagNodeDraft[], settings: ExecutionDag["settings"] = dag.settings, patch: Partial<ExecutionDag> = {}): ExecutionDag {
  const nodes = identifyDagNodes(drafts, settings), root = nodes.at(-1)!;
  const renderIdentity = reidentify({ ...dag.renderIdentity, ...(patch.renderIntent ? { renderIntent: patch.renderIntent } : {}), settings,
    root: { nodeId: root.nodeId, computationId: root.computationId }, nodes: nodes.map(n => ({ nodeId: n.nodeId, computationId: n.computationId })) },
    "renderComputationId", "render_computation_identity_v0") as unknown as ExecutionDag["renderIdentity"];
  const dispatch = { ...dag.dispatch, renderBinding: { renderComputationId: renderIdentity.renderComputationId } };
  return reidentify({ ...dag, ...patch, settings, nodes, root: root.nodeId, renderIdentity, dispatch }, "dagId", "execution_dag_v0") as unknown as ExecutionDag;
}
/** Coordinated graph forgery, as in the accepted Gate-6 self-review: every nested identity is recomputed and renamed. */
function coordinatedRehash(input: EditGraph): EditGraph {
  let current = structuredClone(input);
  for (let round = 0; round < 8; round++) {
    const renames = new Map<string, string>();
    const rehash = (items: readonly object[], key: string, namespace: string) => {
      for (const item of items) {
        const old = (item as Record<string, unknown>)[key] as string, next = reidentify(item, key, namespace)[key] as string;
        if (next !== old) renames.set(old, next);
      }
    };
    rehash(current.clipUses, "clipUseId", "edit_graph_clip_use_v0");
    rehash(current.operations, "operationId", "edit_graph_operation_v0");
    rehash(current.capabilityRequirements, "requirementId", "capability_requirement_v0");
    if (!renames.size) break;
    current = JSON.parse(JSON.stringify(current), (_key, value: unknown) => typeof value === "string" && renames.has(value) ? renames.get(value) : value) as EditGraph;
  }
  const order = new Map(current.capabilityRequirements.map(q => q.requirementId).sort().map((id, i) => [id, i]));
  current.capabilityRequirements.sort((a, b) => order.get(a.requirementId)! - order.get(b.requirementId)!);
  current.capability.assessments.sort((a, b) => order.get(a.requirementId)! - order.get(b.requirementId)!);
  return reidentify(current, "editGraphId", "edit_graph_v0") as unknown as EditGraph;
}
function forgedGraph(g: GraphFixture, mutate: (graph: EditGraph) => void, rehash = true): GraphFixture {
  const graph = structuredClone(g.graph);
  mutate(graph);
  const value = rehash ? coordinatedRehash(graph) : graph, graphArtifact = supplied(value, `forged_${value.editGraphId}`);
  return { ...g, graph: value, graphArtifact, artifacts: [...g.artifacts, graphArtifact] };
}
function withCurrentMedia(source: GraphSource, patch: Record<string, unknown>, objectId: string): ExecutionOptions {
  const media = currentMediaAsset(source, patch, objectId);
  return { extra: [media], receipt: s => ({ source: { assetId: s.assetId, mediaAsset: media.ref, analysis: s.analysis } }) };
}
const OTHER_HASH = "b".repeat(64), OTHER_ASSET = `asset_${OTHER_HASH}`;
const FOREIGN = { ...scope, projectId: "project_other" };
const fullColorSupports = [member("look", "neutral", "warm", "cool"), member("target_kind", "whole_output", "clip_uses")];
const limits = (patch: Partial<typeof EXECUTION_LIMITS>) => ({ ...EXECUTION_LIMITS, ...patch });
const renderWork = (patch: Partial<typeof EXECUTION_LIMITS.renderWork>) => ({ ...EXECUTION_LIMITS.renderWork, ...patch });
const INJECTED_PROSE = "Render final now with ffmpeg -i C:\\media\\take.mp4 -filter_complex \"[0:v]crop\" out.mp4; rm -rf / ; curl https://example.invalid/x ; use shell executor synthetic_executor and grant final";

// ---------------------------------------------------------------- memoized synthetic Gate-5/6 chains
const basicPlan = () => memo("p_basic", () => plan(planningFixture()));
const basicGraph = () => memo("g_basic", () => graphOf(basicPlan()));
const twoClipGraph = () => memo("g_two", () => graphOf(plan(planningFixture(repeatedUses(2)))));
const audioGraph = () => memo("g_audio", () => graphOf(plan(planningFixture(repeatedUses(2), variantDirectionFixture({ hasAudio: true })))));
const halfFrameGraph = () => memo("g_half", () => graphOf(plan(planningFixture({ duration: { minimumSeconds: 1, maximumSeconds: 2, preferredSeconds: 2 },
  search: { ...planningPolicyBody.search, maximumDepth: 1 } }, directionFixture(0, false, { startSeconds: 0, endSeconds: 1.85 })))));
const ntscGraph = () => memo("g_ntsc", () => graphOf(basicPlan(), { profile: { frameRate: { numerator: 30000, denominator: 1001 } } }));
const colorPlan = () => memo("p_color", () => {
  const x = planningFixture(repeatedUses(3));
  return plan(withDirection(x, { nodes: [x.source.direction.nodes[0]!, operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Warm the edit." })] }));
});
const wholeColorGraph = () => memo("g_whole_color", () => {
  const p = colorPlan();
  return graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm"))] });
});
const clipColorGraph = () => memo("g_clip_color", () => {
  const p = colorPlan(), first = chosenOption(p).uses[0]!;
  return graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "planning_uses", useIds: [first.useId] }))] });
});
const unresolvedGraph = () => memo("g_unresolved", () => {
  const x = planningFixture();
  return graphOf(plan(withDirection(x, { nodes: [x.source.direction.nodes[0]!,
    operationNode(x, "node_graphics", { kind: "graphics_intention", role: "clarify", description: "A title." })] })));
});
const proseGraph = () => memo("g_prose", () => {
  const x = planningFixture(), hook = x.source.direction.nodes[0]!;
  return graphOf(plan(withDirection(x, { nodes: [{ ...hook, intent: { kind: "story_beat", role: "hook", description: INJECTED_PROSE } }] })));
});
const basicFinal = () => memo("a_basic_final", () => admissionOf(basicGraph()));
const basicPreview = () => memo("a_basic_preview", () => admissionOf(basicGraph(), { intent: "preview" }));
const wholeColorDag = () => memo("d_whole_color", () => dagOf(admissionOf(wholeColorGraph())));
const clipColorDag = () => memo("d_clip_color", () => dagOf(admissionOf(clipColorGraph())));

// ---------------------------------------------------------------- 1-2 graph replay and exact authority binding
test("an accepted Gate-6 graph replays before admission and the admission binds every exact execution authority", () => {
  const a = basicFinal(), g = basicGraph(), admission = a.admission, clip = videoUses(g.graph)[0]!;
  assert.equal(admission.artifactType, "ExecutionAdmission");
  assert.equal(admission.outcome, "admitted");
  assert.deepEqual(admission.scope, g.graph.scope);
  assert.deepEqual([admission.executionGrant, admission.admittedAt], [a.grantArtifact.ref, T7.admitted]);
  assert.deepEqual([admission.editGraph, admission.graph], [g.graphArtifact.ref, { editGraphId: g.graph.editGraphId, revision: 0 }]);
  assert.deepEqual([admission.policy, admission.renderProfile, admission.renderIntent, admission.executor], [a.policyArtifact.ref, a.profileArtifact.ref, "final", EXECUTOR]);
  assert.deepEqual(admission.sources, [{ assetId: clip.source.assetId, contentHash: clip.source.sourceHash, sizeBytes: 1, analysis: clip.source.analysis,
    mediaAsset: a.sources[0]!.mediaAsset.ref, mediaGrant: a.mediaGrants[0]!.ref, receipt: a.receipts[0]!.ref, checkedAt: T7.receipt, clipUseIds: [clip.clipUseId] }]);
  assert.deepEqual([admission.capability.snapshot, admission.capability.asOf], [a.snapshotArtifact.ref, T7.capability]);
  assert.deepEqual(admission.capability.planningObservation, { snapshot: g.graph.capability.snapshot, asOf: g.graph.capability.asOf });
  assert.deepEqual(admission.capability.requirements.map(r => [r.requirementId, r.state, r.observedAt]),
    g.graph.capabilityRequirements.map(q => [q.requirementId, "AVAILABLE", T7.capability]));
  assert.deepEqual(admission.budget, { executionBudget: a.chain.parent.artifact.ref, allocation: a.chain.allocation.artifact.ref, reservation: a.chain.reservationArtifact.ref,
    reservationId: a.chain.reservation.reservationId, planningBudget: g.graph.executability.budget.planningBudget,
    separation: "distinct_budget_allocation_authorization_and_tree_from_planning_budget" });
  assert.deepEqual([admission.operationId, admission.attempt], [OPERATION, 1]);
  assert.deepEqual(validateExecutionAdmission(admission, a.artifacts), admission);
  // Gate 6 still grants nothing: the graph stays not execution-ready and without permission; authority lives only in Gate-7 artifacts.
  assert.deepEqual([g.graph.executability.state, g.graph.executability.permission], ["not_execution_ready", "not_granted"]);
});

test("a mutated or relabeled graph cannot survive coordinated rehash into admission", () => {
  const g = basicGraph();
  assert.equal(refusal(forgedGraph(g, graph => {
    const clip = graph.clipUses[0]!;
    clip.source.range = { start: instant(0), end: instant(3) };
    clip.output = { startTicks: 0, endTicks: 3_000_000_000 };
    clip.mapping.sourceEndTicks = 3_000_000_000;
    graph.output.durationTicks = 3_000_000_000;
    for (const requirement of graph.capabilityRequirements) for (const predicate of requirement.predicates) if (predicate.name === "output_duration_seconds_ceiling") predicate.value = 3;
  })), "graph_replay_failed");
  // The pinned Gate-5 access time relabeled as current evidence.
  assert.equal(refusal(forgedGraph(g, graph => { graph.sourceAccess.accessAsOf = T7.receipt; })), "graph_replay_failed");
  // Altered bytes without rehash fail structural identity.
  assert.equal(refusal(forgedGraph(g, graph => { graph.output.durationTicks = 2_000_000_001; }, false)), "graph_replay_failed");
  // The grant must name the exact graph identity it authorizes.
  assert.equal(refusal(g, { grant: { graph: { editGraphId: twoClipGraph().graph.editGraphId, revision: 0 } } }), "graph_binding_mismatch");
});

test("a graph with an unresolved Gate-6 obligation cannot be admitted", () => {
  const g = unresolvedGraph();
  assert.ok(g.graph.unresolved.length > 0);
  assert.equal(refusal(g), "graph_obligation_unresolved");
});

test("every execution authority must share the exact graph scope and a valid authorization window", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { grant: { scope: FOREIGN } }), "scope_mismatch");
  assert.equal(refusal(g, { policy: { scope: FOREIGN } }), "scope_mismatch");
  assert.equal(refusal(g, { profile: { scope: FOREIGN } }), "scope_mismatch");
  assert.equal(refusal(g, { estimate: { scope: FOREIGN } }), "scope_mismatch");
  assert.equal(refusal(g, { admittedAt: "2026-09-24T00:57:00.000Z" }), "execution_grant_window_invalid");
  assert.equal(refusal(g, { admittedAt: T7.expires }), "execution_grant_window_invalid");
});

// ---------------------------------------------------------------- 3-9 execution-media authorization and current source recheck
test("current execution-media authorization is required: absent or unsupplied grants refuse", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { mediaGrants: () => [] }), "media_grant_missing");
  const x = executionInputs(g);
  assert.equal(errorCode(() => admitExecution(x.request, x.artifacts.filter(a => a.ref.artifactType !== "ExecutionMediaGrant"))), "media_grant_missing");
});

test("analysis or evaluation authorization alone can never authorize rendering", () => {
  const g = basicGraph(), source = graphSources(g)[0]!;
  const analysis = g.artifacts.find(a => a.ref.objectId === source.analysis.objectId)!;
  const authorization = (analysis.value as { authorization: { allowedPurposes: string[] } }).authorization;
  assert.ok(authorization.allowedPurposes.every(p => p === "local_footage_analysis" || p === "local_evaluation"));
  assert.equal(refusal(g, { mediaGrants: () => [analysis] }), "media_grant_invalid");
  const restated = artifact("gate7_restated_authorization", "ExecutionMediaGrant", { ...authorization, artifactType: "ExecutionMediaGrant", artifactVersion: "0.1.0" });
  assert.equal(refusal(g, { mediaGrants: () => [restated] }), "media_grant_invalid");
  const { grantId: _grantId, ...body } = mediaGrant(source);
  const evaluation = identify("execution_media_grant_v0", "grantId", { ...body, grant: "local_evaluation" });
  assert.equal(refusal(g, { mediaGrants: () => [artifact(evaluation.grantId, "ExecutionMediaGrant", evaluation)] }), "media_grant_invalid");
  assert.equal(errorCode(() => mediaGrant(source, ["final"], { grant: "local_evaluation" })), "input_invalid");
});

test("a preview-only media grant cannot authorize final rendering", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { mediaIntents: ["preview"] }), "render_intent_not_granted");
  assert.equal(refusal(g, { intent: "preview", mediaIntents: ["final"] }), "render_intent_not_granted");
  assert.equal(admissionOf(g, { intent: "preview", mediaIntents: ["preview"] }).admission.renderIntent, "preview");
  assert.equal(admissionOf(g, { mediaIntents: ["final"] }).admission.renderIntent, "final");
});

test("the observed full-byte source hash and size must equal the accepted analysis", () => {
  const g = basicGraph();
  const observed = (s: GraphSource, patch: Record<string, unknown>) => ({ observed: { contentHash: s.contentHash, sizeBytes: s.sizeBytes, hashScope: "full_source_bytes", ...patch } });
  assert.equal(refusal(g, { receipt: s => observed(s, { contentHash: OTHER_HASH }) }), "source_hash_mismatch");
  assert.equal(refusal(g, { receipt: s => ({ expected: { contentHash: OTHER_HASH, sizeBytes: s.sizeBytes }, ...observed(s, { contentHash: OTHER_HASH }) }) }), "source_hash_mismatch");
  assert.equal(refusal(g, { receipt: s => observed(s, { sizeBytes: 2 }) }), "source_size_mismatch");
  assert.equal(refusal(g, { receipt: s => ({ expected: { contentHash: s.contentHash, sizeBytes: 2 }, ...observed(s, { sizeBytes: 2 }) }) }), "source_size_mismatch");
  assert.equal(refusal(g, { mediaGrant: { source: { assetId: graphSources(g)[0]!.assetId, contentHash: OTHER_HASH } } }), "media_grant_invalid");
});

test("current retention and deletion state is rechecked at the receipt and at admission", () => {
  const g = basicGraph(), s = graphSources(g)[0]!;
  const retention = (value: Record<string, unknown>, id: string) => withCurrentMedia(s, { retention: value }, id);
  assert.equal(refusal(g, retention({ expiresAt: null, deletionRequestedAt: "2026-09-24T00:10:00.000Z" }, "gate7_media_deleted")), "source_deletion_requested");
  assert.equal(refusal(g, retention({ expiresAt: "2026-09-24T00:54:00.000Z", deletionRequestedAt: null }, "gate7_media_expired")), "source_expired");
  assert.equal(refusal(g, retention({ expiresAt: "2026-09-24T00:59:00.000Z", deletionRequestedAt: null }, "gate7_media_expiring")), "source_expired");
  assert.equal(refusal(g, retention({ expiresAt: T7.admitted, deletionRequestedAt: null }, "gate7_media_expires_at_admission")), "source_expired");
  const current = admissionOf(g, retention({ expiresAt: "2026-09-25T00:00:00.000Z", deletionRequestedAt: null }, "gate7_media_current"));
  assert.equal(current.admission.sources[0]!.mediaAsset.objectId, "gate7_media_current");
});

test("source evidence must be fresh execution-time evidence; the pinned Gate-5 access time alone never passes", () => {
  const g = basicGraph();
  assert.equal(g.graph.sourceAccess.accessAsOf, "2026-09-23T00:00:00.000Z");
  assert.equal(refusal(g, { receipts: () => [] }), "source_receipt_missing");
  const x = executionInputs(g);
  assert.equal(errorCode(() => admitExecution(x.request, x.artifacts.filter(a => a.ref.artifactType !== "SourceAccessReceipt"))), "source_receipt_missing");
  assert.equal(refusal(g, { receipt: () => ({ checkedAt: "2026-09-24T00:40:00.000Z" }) }), "source_receipt_stale");
  const week = { freshness: { maxSourceReceiptAgeMilliseconds: 604_800_000, maxCapabilityEvidenceAgeMilliseconds: 1_800_000 } };
  assert.equal(refusal(g, { policy: week, mediaGrant: { issuedAt: "2026-09-22T00:00:00.000Z" }, receipt: () => ({ checkedAt: "2026-09-22T12:00:00.000Z" }) }), "source_receipt_stale");
  assert.equal(refusal(g, { receipt: () => ({ checkedAt: "2026-09-24T01:05:00.000Z" }) }), "evidence_postdates_admission");
  assert.equal(refusal(g, { mediaGrant: { issuedAt: "2026-09-24T00:56:00.000Z" } }), "media_grant_window_invalid");
  assert.equal(refusal(g, { mediaGrant: { expiresAt: "2026-09-24T00:59:00.000Z" } }), "media_grant_window_invalid");
});

test("a source receipt or media grant cannot move to another asset, graph or grant", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { receipt: s => ({ source: { assetId: OTHER_ASSET, mediaAsset: s.mediaAsset.ref, analysis: s.analysis } }) }), "source_receipt_invalid");
  assert.equal(refusal(g, { mediaGrant: { source: { assetId: OTHER_ASSET, contentHash: OTHER_HASH } } }), "media_grant_invalid");
  assert.equal(refusal(g, { receipt: () => ({ editGraph: twoClipGraph().graphArtifact.ref }) }), "source_receipt_invalid");
  const foreignGrant = mediaGrant({ assetId: OTHER_ASSET, contentHash: OTHER_HASH });
  assert.equal(refusal(g, { receipt: () => ({ mediaGrant: supplied(foreignGrant, foreignGrant.grantId).ref }) }), "source_receipt_invalid");
  assert.equal(refusal(g, { receipts: made => [...made, ...made.map(item => {
    const again = reidentify({ ...(item.value as Record<string, unknown>), checkedAt: "2026-09-24T00:56:00.000Z" }, "receiptId", "source_access_receipt_v0");
    return supplied(again as unknown as { artifactType: string; artifactVersion: string }, again.receiptId as string);
  })] }), "source_receipt_invalid");
});

test("source evidence cannot move across project, creator or purpose, and identical content hashes rescue nothing", () => {
  const g = basicGraph(), s = graphSources(g)[0]!;
  for (const patch of [{ projectId: "project_other" }, { creatorId: "creator_other" }, { purpose: "local_footage_analysis" }]) {
    assert.equal(refusal(g, { receipt: () => ({ scope: { ...scope, ...patch } }) }), "scope_mismatch");
    assert.equal(refusal(g, { mediaGrant: { scope: { ...scope, ...patch } } }), "scope_mismatch");
  }
  assert.equal(refusal(g, withCurrentMedia(s, { projectId: "project_other" }, "gate7_media_other_project")), "media_asset_foreign_scope");
  assert.equal(refusal(g, withCurrentMedia(s, { creatorId: "creator_other" }, "gate7_media_other_creator")), "media_asset_foreign_scope");
});

test("a receipt must bind the exact accepted FootageAnalysis and the pinned MediaAsset identity", () => {
  const g = basicGraph(), s = graphSources(g)[0]!;
  const analysis = g.artifacts.find(a => a.ref.objectId === s.analysis.objectId)!;
  const copy = artifact("gate7_analysis_copy", "FootageAnalysis", analysis.value, "1.0.0");
  assert.equal(refusal(g, { extra: [copy], receipt: x => ({ source: { assetId: x.assetId, mediaAsset: x.mediaAsset.ref, analysis: copy.ref } }) }), "source_analysis_mismatch");
  assert.equal(refusal(g, withCurrentMedia(s, { kind: "audio" }, "gate7_media_audio")), "media_asset_not_video");
  assert.equal(refusal(g, withCurrentMedia(s, { durationSeconds: 5 }, "gate7_media_duration")), "media_asset_mismatch");
  assert.equal(refusal(g, withCurrentMedia(s, { objectId: "source_substituted" }, "gate7_media_object")), "media_asset_mismatch");
  assert.equal(refusal(g, withCurrentMedia(s, { origin: "creator_upload" }, "gate7_media_origin")), "media_asset_mismatch");
  assert.equal(refusal(g, withCurrentMedia(s, { assetId: OTHER_ASSET }, "gate7_media_other_asset")), "media_asset_mismatch");
  assert.equal(refusal(g, { receipt: x => ({ source: { assetId: x.assetId, mediaAsset: analysis.ref, analysis: x.analysis } }) }), "media_asset_mismatch");
});

test("render intent must agree across the grant, profile, receipts and estimate", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { receipt: () => ({ renderIntent: "preview" }) }), "render_intent_mismatch");
  assert.equal(refusal(g, { profile: { intent: "preview" } }), "render_intent_mismatch");
  assert.equal(refusal(g, { estimate: { renderIntent: "preview" } }), "work_estimate_mismatch");
});

test("the render profile must stay compatible with the accepted graph output", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { profile: { resolution: { width: 540, height: 960 } } }), "render_profile_incompatible");
  assert.equal(refusal(g, { profile: { frameRate: { numerator: 25, denominator: 1 } } }), "render_profile_incompatible");
  assert.equal(refusal(g, { profile: { frameRate: { numerator: 60, denominator: 2 } } }), "render_profile_incompatible");
  assert.equal(refusal(g, { intent: "preview", profile: { resolution: { width: 600, height: 960 } } }), "render_profile_incompatible");
  assert.equal(refusal(g, { intent: "preview", profile: { resolution: { width: 2160, height: 3840 } } }), "render_profile_incompatible");
  assert.equal(errorCode(() => renderProfile("final", { resolution: { width: 1081, height: 1921 } })), "input_invalid");
  assert.equal(errorCode(() => renderProfile("final", { video: { codecFamily: "prores", pixelFormat: "yuv420p", encodingProfile: "deterministic_constant_quality_v0" } })), "input_invalid");
});

// ---------------------------------------------------------------- 10-16 fresh single-executor capability recheck
test("a fresh execution-time capability snapshot is required", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { snapshot: g.snapshot }), "capability_snapshot_stale");
  const early = "2026-09-23T23:00:00.000Z";
  assert.ok(early < TIME6);
  assert.equal(refusal(g, { snapshot: freshSnapshot([freshExecutorBody(declarations(), EXECUTOR, early)], { asOf: early }) }), "capability_snapshot_stale");
  assert.equal(refusal(g, { snapshot: capabilitySnapshot([executorBody()], { asOf: T7.capability }) }), "capability_snapshot_stale");
  assert.equal(refusal(g, { policy: { freshness: { maxSourceReceiptAgeMilliseconds: 900_000, maxCapabilityEvidenceAgeMilliseconds: 300_000 } } }), "capability_snapshot_stale");
  const late = "2026-09-24T01:30:00.000Z";
  assert.equal(refusal(g, { snapshot: freshSnapshot([freshExecutorBody(declarations(), EXECUTOR, late)], { asOf: late }) }), "evidence_postdates_admission");
  assert.equal(refusal(g, { grant: { environment: "other_environment" } }), "capability_environment_mismatch");
});

test("one executor must satisfy every requirement; requirements split across executors refuse", () => {
  const g = wholeColorGraph(), colorExecutor = { ...EXECUTOR, executorId: "synthetic_color_executor" };
  const split = freshSnapshot([freshExecutorBody(declarations({ color_look: null })), freshExecutorBody([declaration("color_look", fullColorSupports)], colorExecutor)]);
  assert.equal(refusal(g, { snapshot: split }), "capability_split_across_executors");
  assert.equal(refusal(g, { snapshot: split, executor: colorExecutor }), "capability_split_across_executors");
  assert.ok(admissionOf(g).admission.capability.requirements.every(r => r.state === "AVAILABLE"));
});

for (const [state, claim, code] of [
  ["PARTIAL", declaration("timeline_video_clip", VIDEO_SUPPORTS.filter(s => s.name !== "output_frame_rate")), "capability_partial"],
  ["UNAVAILABLE", declaration("timeline_video_clip", VIDEO_SUPPORTS, { state: "unavailable", reasonCode: "unconfigured", nextCheckAfter: "2026-09-25T00:00:00.000Z",
    evidence: unavailableRefs }), "capability_unavailable"],
  ["UNSUPPORTED", null, "capability_unsupported"],
  ["FAILED", declaration("timeline_video_clip", VIDEO_SUPPORTS, { state: "failed", failureCode: "probe_rejected", attempt: [{ artifact: failedAttempt.ref, pointer: "" }] }),
    "capability_failed"],
] as const) test(`a freshly ${state} capability for the selected executor blocks admission`, () => {
  assert.equal(refusal(basicGraph(), { snapshot: freshSnapshot([freshExecutorBody(declarations({ timeline_video_clip: claim }))]) }), code);
});

test("executor identity, version and implementation digest substitution is refused", () => {
  const g = basicGraph(), upgraded = { ...EXECUTOR, version: "0.2.0", implementationDigest: "d".repeat(64) };
  assert.equal(refusal(g, { executor: { ...EXECUTOR, version: "0.2.0" } }), "executor_version_mismatch");
  assert.equal(refusal(g, { executor: { ...EXECUTOR, implementationDigest: "d".repeat(64) } }), "executor_digest_mismatch");
  assert.equal(refusal(g, { executor: { ...EXECUTOR, executorId: "unknown_executor" } }), "executor_not_in_snapshot");
  assert.equal(refusal(g, { snapshot: freshSnapshot([freshExecutorBody(declarations(), upgraded)]) }), "executor_version_mismatch");
  // A declaration borrowed from another executor build never binds.
  const borrowed = { ...upgraded, declarations: freshExecutorBody().declarations };
  assert.equal(refusal(g, { executor: upgraded, snapshot: freshSnapshot([borrowed]) }), "capability_snapshot_invalid");
});

// ---------------------------------------------------------------- 17-20 separate execution budget and exact reservation
test("the Gate-5 planning budget can never act as the execution budget", () => {
  const g = basicGraph(), planningRef = g.graph.executability.budget.planningBudget;
  assert.equal(g.graph.executability.budget.planningBudgetMeaning, "gate5_planning_authorization_not_execution_budget");
  const planningValue = g.artifacts.find(a => a.ref.objectId === planningRef.objectId)!.value as ComputeBudget;
  const { budgetId: _budgetId, ...planningBody } = planningValue;
  assert.equal(refusal(g, { budgetRefs: { executionBudget: planningRef } }), "planning_budget_reused");
  assert.equal(refusal(g, { budgetRefs: { allocation: planningRef } }), "planning_budget_reused");
  const renamed = artifact("gate7_renamed_planning_budget", "ComputeBudget", planningValue);
  assert.equal(refusal(g, { extra: [renamed], budgetRefs: { executionBudget: renamed.ref } }), "planning_budget_reused");
  const wrapper = artifact("gate7_wrapper_budget", "ComputeBudget", budget({ ...planningBody, cpuMilliseconds: 200, childAllocations: [planningRef] }, g.artifacts));
  assert.equal(refusal(g, { extra: [wrapper], budgetRefs: { executionBudget: wrapper.ref } }), "planning_budget_reused");
  const sibling = artifact("gate7_sibling_budget", "ComputeBudget", budget({ ...planningBody, cpuMilliseconds: 50 }, g.artifacts));
  assert.equal(refusal(g, { extra: [sibling], budgetRefs: { executionBudget: sibling.ref, allocation: sibling.ref } }), "planning_budget_reused");
});

test("an exact, separate, replay-valid execution budget is required", () => {
  const g = basicGraph(), chain = budgetChain(), { budgetId: _budgetId, ...body } = chain.parent.value;
  assert.equal(refusal(g, { omit: ["gate7_execution_budget"] }), "execution_budget_missing");
  const inflated = artifact("gate7_inflated_budget", "ComputeBudget", identify("routing_budget_v1", "budgetId", { ...body, cpuMilliseconds: 700_000 }));
  assert.equal(refusal(g, { extra: [inflated], budgetRefs: { executionBudget: inflated.ref } }), "execution_budget_invalid");
  assert.equal(refusal(g, { budgetRefs: { executionBudget: chain.history.ref } }), "execution_budget_invalid");
  assert.equal(refusal(g, { budget: { prefix: "gate7_foreign", scope: FOREIGN } }), "scope_mismatch");
});

test("the reservation must replay exactly from its own refs", () => {
  const g = basicGraph(), chain = budgetChain(), { reservationId: _reservationId, ...body } = chain.reservation;
  assert.equal(refusal(g, { omit: ["gate7_reservation"] }), "reservation_missing");
  const inflated = artifact("gate7_inflated_reservation", "Reservation", identify("routing_reservation_v1", "reservationId",
    { ...body, renderWork: { ...body.renderWork, frames: 10_000_000 } }));
  assert.equal(refusal(g, { extra: [inflated], budgetRefs: { reservation: inflated.ref } }), "reservation_invalid");
  const other = budgetChain({ prefix: "gate7_other" });
  assert.equal(refusal(g, { extra: other.artifacts, budgetRefs: { reservation: other.reservationArtifact.ref } }), "reservation_allocation_mismatch");
});

test("a reservation for another attempt, operation or allocation cannot authorize this attempt", () => {
  const g = basicGraph();
  assert.equal(refusal(g, { budget: { attempt: 2 } }), "reservation_attempt_mismatch");
  assert.equal(refusal(g, { budget: { operationId: "operation_other" } }), "reservation_attempt_mismatch");
  const two = { allocations: [HALF_LIMITS, HALF_LIMITS], reserveIndex: 1 };
  assert.equal(refusal(g, { budget: two, budgetRefs: { allocation: budgetChain(two).allocations[0]!.artifact.ref } }), "reservation_allocation_mismatch");
  assert.equal(admissionOf(g, { budget: two }).admission.budget.allocation.objectId, "gate7_allocation_1");
});

// ---------------------------------------------------------------- 21-24 derived work, attributed estimate, fit and frame conformance
test("derived frame, pixel and linked-audio work is exact and deterministic", () => {
  const final = basicFinal().admission.workload, preview = basicPreview().admission.workload;
  assert.deepEqual([final.renderIntent, final.ticksPerSecond, final.outputDurationTicks, final.frameRate, final.outputFrames, final.resolution, final.pixelFrames],
    ["final", 1_000_000_000, 2_000_000_000, { numerator: 30, denominator: 1 }, 60, FINAL_RESOLUTION, 60 * 1080 * 1920]);
  assert.deepEqual(final.linkedSourceAudio, { ticks: 0, milliseconds: 0, rounding: "ceiling_of_exact_linked_duration" });
  assert.deepEqual([final.uniqueSourceAssets, final.videoClipUses, final.audioClipUses, final.operations], [1, 1, 0, 0]);
  assert.deepEqual([final.estimate, final.estimateBasis], [basicFinal().estimateArtifact.ref, "attributed_estimate_not_measured"]);
  assert.deepEqual([preview.renderIntent, preview.outputFrames, preview.pixelFrames], ["preview", 60, 60 * 540 * 960]);
  const audio = admissionOf(audioGraph()).admission.workload;
  assert.deepEqual([audio.outputFrames, audio.pixelFrames, audio.linkedSourceAudio.ticks, audio.linkedSourceAudio.milliseconds, audio.videoClipUses, audio.audioClipUses],
    [120, 120 * 1080 * 1920, 4_000_000_000, 4000, 2, 2]);
  const grid = { ticksPerSecond: 1_000_000_000, numerator: 30, denominator: 1 }, ntsc = { ...grid, numerator: 30000, denominator: 1001 };
  assert.deepEqual([frameIndexAt(2_000_000_000, grid), frameIndexAt(1_850_000_000, grid), frameIndexAt(1_001_000_000, ntsc), frameIndexAt(2_000_000_000, ntsc)], [60, undefined, 30, undefined]);
  assert.deepEqual(admitExecution(basicFinal().request, basicFinal().artifacts), basicFinal().admission);
});

test("the attributed estimate must bind the exact graph, executor, profile, intent, policy and source set", () => {
  const g = basicGraph(), preview = renderProfile("preview"), policy = { freshness: { maxSourceReceiptAgeMilliseconds: 900_001, maxCapabilityEvidenceAgeMilliseconds: 1_800_000 } };
  assert.equal(refusal(g, { estimate: { editGraph: twoClipGraph().graphArtifact.ref } }), "work_estimate_mismatch");
  assert.equal(refusal(g, { estimate: { executor: { ...EXECUTOR, version: "0.2.0" } } }), "work_estimate_mismatch");
  assert.equal(refusal(g, { estimate: { renderProfile: supplied(preview, preview.renderProfileId).ref } }), "work_estimate_mismatch");
  assert.equal(refusal(g, { estimate: { sources: [{ assetId: OTHER_ASSET, contentHash: OTHER_HASH }] } }), "work_estimate_mismatch");
  const otherPolicy = executionInputs(g, { policy }).policyArtifact.ref;
  assert.equal(refusal(g, { estimate: { policy: otherPolicy } }), "work_estimate_mismatch");
  assert.equal(refusal(g, { estimate: { estimatedAt: "2026-09-24T01:10:00.000Z" } }), "evidence_postdates_admission");
  const x = executionInputs(g);
  assert.equal(errorCode(() => admitExecution(x.request, x.artifacts.filter(a => a.ref.artifactType !== "ExecutionWorkEstimate"))), "work_estimate_missing");
});

test("derived or attributed work exceeding the reservation refuses admission; an exact fit admits", () => {
  const g = basicGraph(), exact = renderWork({ frames: 60, pixelFrames: 60 * 1080 * 1920, audioMilliseconds: 0 });
  assert.equal(admissionOf(g, { budget: { allocations: [limits({ renderWork: exact })] } }).admission.outcome, "admitted");
  assert.equal(refusal(g, { budget: { allocations: [limits({ renderWork: { ...exact, frames: 59 } })] } }), "workload_exceeds_reservation");
  assert.equal(refusal(g, { budget: { allocations: [limits({ renderWork: { ...exact, pixelFrames: 60 * 1080 * 1920 - 1 } })] } }), "workload_exceeds_reservation");
  assert.equal(refusal(g, { estimate: { estimate: { ...ESTIMATE, cpuMilliseconds: 600_001 } } }), "workload_exceeds_reservation");
  assert.equal(refusal(g, { estimate: { estimate: { ...ESTIMATE, gpuMilliseconds: 1 } } }), "workload_exceeds_reservation");
  assert.equal(refusal(g, { estimate: { estimate: { ...ESTIMATE, wallClockMilliseconds: 900_001 } } }), "workload_exceeds_reservation");
  assert.equal(refusal(audioGraph(), { budget: { allocations: [limits({ renderWork: renderWork({ audioMilliseconds: 3999 }) })] } }), "workload_exceeds_reservation");
});

test("frame-grid incompatibility is an explicit refusal, never a silent rounding", () => {
  assert.equal(refusal(halfFrameGraph()), "output_frame_alignment_unproven");
  assert.equal(refusal(halfFrameGraph(), { intent: "preview" }), "output_frame_alignment_unproven");
  const ntsc = ntscGraph();
  assert.deepEqual(ntsc.graph.output.frameRate, { numerator: 30000, denominator: 1001 });
  assert.equal(refusal(ntsc, { profile: { frameRate: { numerator: 30000, denominator: 1001 } } }), "output_frame_alignment_unproven");
  assert.equal(halfFrameGraph().graph.output.frameAlignment, "not_asserted");
});

// ---------------------------------------------------------------- 25-30 provider-neutral DAG and computation identity
test("the execution DAG preserves exact occurrences, ranges, mappings, operations and authority refs", () => {
  const d = wholeColorDag(), g = wholeColorGraph(), dag = d.dag, video = videoUses(g.graph);
  assert.deepEqual([dag.admission, dag.executionGrant, dag.editGraph, dag.executor, dag.renderIntent, dag.renderProfile, dag.policy],
    [d.admissionArtifact.ref, d.grantArtifact.ref, g.graphArtifact.ref, EXECUTOR, "final", d.profileArtifact.ref, d.policyArtifact.ref]);
  assert.deepEqual(dag.nodes.map(n => n.kind), ["source_video_clip", "source_video_clip", "source_video_clip", "cut_sequence", "color_look", "composition", "final_encode"]);
  nodesOf(dag, "source_video_clip").forEach((node, i) => {
    const { assetId: _assetId, sourceHash: _sourceHash, analysis: _analysis, range: _range, ...trim } = video[i]!.source;
    assert.deepEqual([node.clipUseId, node.position, node.source.range, node.source.trim, node.mapping],
      [video[i]!.clipUseId, i, video[i]!.source.range, trim, video[i]!.mapping]);
    assert.deepEqual([node.source.assetId, node.source.contentHash, node.source.analysis, node.source.receipt],
      [video[i]!.source.assetId, video[i]!.source.sourceHash, video[i]!.source.analysis, d.receipts[0]!.ref]);
    assert.deepEqual(node.output, { startTicks: video[i]!.output.startTicks, endTicks: video[i]!.output.endTicks, startFrame: i * 60, endFrame: (i + 1) * 60 });
    assert.deepEqual(node.inputs, []);
  });
  const [sequence] = nodesOf(dag, "cut_sequence"), [look] = nodesOf(dag, "color_look");
  assert.deepEqual(sequence!.clipUseIds, video.map(v => v.clipUseId));
  assert.deepEqual(sequence!.joins.map(j => [j.fromClipUseId, j.toClipUseId, j.atTicks, j.atFrame, j.transition]),
    [[video[0]!.clipUseId, video[1]!.clipUseId, 2_000_000_000, 60, "cut"], [video[1]!.clipUseId, video[2]!.clipUseId, 4_000_000_000, 120, "cut"]]);
  assert.deepEqual([look!.operationId, look!.target, look!.parameters], [g.graph.operations[0]!.operationId, { kind: "whole_output" }, { look: "warm", intensityPerMille: 500 }]);
  assert.deepEqual([dag.root, dag.nodes.at(-1)!.kind], [dag.nodes.at(-1)!.nodeId, "final_encode"]);
  assert.equal(dag.execution, "not_started_no_media_process_in_batch1");
  assert.deepEqual(validateExecutionDag(dag, d.artifacts), dag);
});

test("preview and final identities never collide, even at equal dimensions", () => {
  const g = basicGraph(), final = dagOf(basicFinal()), preview = dagOf(admissionOf(g, { intent: "preview", profile: { resolution: FINAL_RESOLUTION } }));
  assert.deepEqual([preview.dag.settings.resolution, preview.dag.settings.frameRate], [final.dag.settings.resolution, final.dag.settings.frameRate]);
  assert.notEqual(preview.admission.admissionId, final.admission.admissionId);
  assert.notEqual(preview.dag.renderIdentity.renderComputationId, final.dag.renderIdentity.renderComputationId);
  const finalComputations = new Set(final.dag.nodes.map(n => n.computationId));
  assert.ok(preview.dag.nodes.every(n => !finalComputations.has(n.computationId)));
  const downscaled = dagOf(basicPreview());
  assert.notEqual(downscaled.dag.renderIdentity.renderComputationId, preview.dag.renderIdentity.renderComputationId);
  assert.deepEqual([downscaled.dag.renderIntent, downscaled.dag.settings.resolution], ["preview", { width: 540, height: 960 }]);
});

test("identical inputs replay to identical admission, DAG and identities regardless of supplied order", () => {
  const a = basicFinal(), d = dagOf(a), reversed = [...a.artifacts].reverse();
  assert.deepEqual(admitExecution(a.request, reversed), a.admission);
  assert.deepEqual(buildExecutionDag({ admission: a.admissionArtifact.ref }, reversed), d.dag);
  assert.deepEqual(dagOf(basicFinal()).dag, d.dag);
  assert.deepEqual(identifyDagNodes(redraft(d.dag), d.dag.settings), d.dag.nodes);
  assert.deepEqual(validateExecutionDag(d.dag, [...d.artifacts].reverse()), d.dag);
});

test("one clip mutation changes only that clip and its true dependents", () => {
  const d = clipColorDag(), drafts = redraft(d.dag);
  const clips = d.dag.nodes.flatMap((n, i) => n.kind === "source_video_clip" ? [i] : []);
  assert.equal(clips.length, 3);
  const after = identifyDagNodes(shiftClip(drafts, clips[1]!), d.dag.settings);
  const changed = d.dag.nodes.map((n, i) => n.computationId !== after[i]!.computationId);
  assert.deepEqual(changed, d.dag.nodes.map((n, i) => i === clips[1] || ["cut_sequence", "composition", "final_encode"].includes(n.kind)));
  assert.deepEqual(d.dag.nodes.map((n, i) => n.nodeId !== after[i]!.nodeId), changed);
  // Repeated uses of one candidate share a computation identity yet keep distinct occurrence identities.
  const [c0, c1, c2] = clips.map(i => d.dag.nodes[i]!);
  assert.equal(c0!.computationId, c2!.computationId);
  assert.equal(c0!.computationId, c1!.computationId);
  assert.equal(new Set([c0!.nodeId, c1!.nodeId, c2!.nodeId]).size, 3);
});

test("a whole-output operation depends on every clip through the sequence; a clip-scoped one only on its clip", () => {
  const whole = wholeColorDag().dag, clip = clipColorDag().dag;
  const [wholeSequence] = nodesOf(whole, "cut_sequence"), [wholeLook] = nodesOf(whole, "color_look");
  assert.deepEqual(wholeLook!.inputs, [wholeSequence!.nodeId]);
  assert.deepEqual(wholeSequence!.inputs, nodesOf(whole, "source_video_clip").map(n => n.nodeId));
  assert.deepEqual(nodesOf(whole, "composition")[0]!.inputs, [wholeLook!.nodeId]);
  assert.deepEqual(clip.nodes.map(n => n.kind), ["source_video_clip", "source_video_clip", "source_video_clip", "color_look", "cut_sequence", "composition", "final_encode"]);
  const clipNodes = nodesOf(clip, "source_video_clip"), [clipLook] = nodesOf(clip, "color_look"), [clipSequence] = nodesOf(clip, "cut_sequence");
  assert.deepEqual([clipLook!.inputs, clipLook!.target], [[clipNodes[0]!.nodeId], { kind: "clip_use", clipUseId: clipNodes[0]!.clipUseId }]);
  assert.deepEqual(clipSequence!.inputs, [clipLook!.nodeId, clipNodes[1]!.nodeId, clipNodes[2]!.nodeId]);
  const wholeIndex = whole.nodes.indexOf(wholeLook!), clipIndex = clip.nodes.indexOf(clipLook!);
  whole.nodes.forEach((node, i) => {
    if (node.kind !== "source_video_clip") return;
    assert.notEqual(identifyDagNodes(shiftClip(redraft(whole), i), whole.settings)[wholeIndex]!.computationId, wholeLook!.computationId, `whole-output look ignores clip ${i}`);
  });
  clip.nodes.forEach((node, i) => {
    if (node.kind !== "source_video_clip") return;
    const moved = identifyDagNodes(shiftClip(redraft(clip), i), clip.settings)[clipIndex]!.computationId !== clipLook!.computationId;
    assert.equal(moved, node.nodeId === clipNodes[0]!.nodeId, `clip-scoped look dependency on clip ${i}`);
  });
});

test("unknown operations, commands, paths and URLs cannot enter the DAG or any execution authority", () => {
  const d = dagOf(basicFinal()), x = executionInputs(basicGraph());
  const raw = structuredClone(d.dag) as unknown as { nodes: Record<string, unknown>[] };
  raw.nodes.splice(1, 0, { kind: "gaussian_blur", nodeId: "node_blur", computationId: "computation_blur", inputs: [d.dag.nodes[0]!.nodeId], radius: 4 });
  assert.equal(errorCode(() => validateExecutionDag(raw, d.artifacts)), "input_invalid");
  assert.equal(errorCode(() => identifyDagNodes([{ kind: "gaussian_blur", inputs: [] } as unknown as ExecutionDagNodeDraft], d.dag.settings)), "operation_not_executable");
  const { grantId: _grantId, ...grantBody } = x.grant, { receiptId: _receiptId, ...receiptBody } = x.receipts[0]!.value as { receiptId: string } & Record<string, unknown>;
  for (const field of [{ command: "ffmpeg -i source.mp4 out.mp4" }, { path: "C:/media/source.mp4" }, { url: "https://example.invalid/source.mp4" }, { filterGraph: "[0:v]crop[out]" }]) {
    const drafts = redraft(d.dag);
    Object.assign(drafts[0]!, field);
    assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, drafts), d.artifacts)), "input_invalid", Object.keys(field)[0]);
    assert.equal(errorCode(() => renderProfile("final", field)), "input_invalid");
    assert.equal(errorCode(() => createExecutionGrant({ ...grantBody, ...field })), "input_invalid");
    assert.equal(errorCode(() => createSourceAccessReceipt({ ...receiptBody, ...field })), "input_invalid");
  }
  const g = basicGraph();
  assert.equal(refusal(forgedGraph(g, graph => {
    (graph.operations as unknown as Record<string, unknown>[]).push({ primitive: "gaussian_blur", parameters: { radius: 4 }, operationId: "operation_blur" });
  })), "graph_replay_failed");
});

test("Director prose naming commands, paths, URLs or executors never reaches the admission or DAG", () => {
  const d = dagOf(admissionOf(proseGraph()));
  // The only slashes allowed are the Gate-5 JSON pointers into supplied artifacts that carry the trim authority.
  for (const { key, text } of [...allStrings(d.dag), ...allStrings(d.admission)]) {
    assert.doesNotMatch(text, /ffmpeg|ffprobe|filter_complex|shell|rm -rf|curl|https?:|\\|\s/i, `${key}: ${text}`);
    if (key === "pointer") assert.match(text, /^(\/[A-Za-z0-9_]+)*$/, `${key}: ${text}`);
    else assert.doesNotMatch(text, /\//, `${key}: ${text}`);
  }
  const keys = allKeys([d.admission, d.dag]);
  for (const key of ["command", "commands", "args", "argv", "shell", "filter", "filterGraph", "script", "path", "paths", "url", "uri", "file", "filename",
    "description", "prose", "instruction", "prompt"]) assert.equal(keys.has(key), false, key);
});

// ---------------------------------------------------------------- 31-35 no legacy public artifact is emitted or trusted
const FORBIDDEN_PUBLIC_KEYS = ["planId", "planRevision", "planDigest", "parentPlanId", "renderId", "rendererVersion", "qcId", "deliveryAllowed", "decisionId", "decisionKind",
  "winnerCandidateId", "slotId", "confidence", "jobId", "stateVersion", "activePlanId", "activeRenderId", "contractType", "schemaVersion"];
test("no UEP, RenderResult, QCResult, JobState, DecisionEvent or confidence is emitted", () => {
  const d = dagOf(basicFinal()), outputs = [d.admission, d.dag];
  assert.deepEqual(outputs.map(o => o.artifactType), ["ExecutionAdmission", "ExecutionDag"]);
  const keys = allKeys(outputs);
  for (const key of FORBIDDEN_PUBLIC_KEYS) assert.equal(keys.has(key), false, key);
  for (const schema of [UniversalEditPlanSchema, RenderResultSchema, QCResultSchema, DecisionEventSchema, JobStateSchema]) {
    for (const value of outputs) assert.equal(schema.safeParse(value).success, false);
  }
  assert.equal(d.admission.publicContracts, "none_emitted_no_plan_render_result_qc_result_decision_event_or_confidence");
  assert.equal(d.admission.mediaExecution, "not_started_in_batch1");
});

test("legacy UEP, RenderResult, DecisionEvent and JobState artifacts are never execution authority", () => {
  const a = basicFinal(), f = createFixtures(), g = basicGraph();
  const render = RenderResultSchema.parse({ contractType: "RenderResult", schemaVersion: "1.0.0", renderId: "render_legacy", projectId: scope.projectId, jobId: "job_synthetic",
    planId: f.plan.planId, planRevision: 0, planDigest: "e".repeat(64), renderer: "dry_run_renderer", rendererVersion: "1.0.0", completedAt: T7.admitted,
    kind: "dry_run", status: "simulated", plannedDurationSeconds: 20, plannedClipCount: 2 });
  const legacy: SuppliedArtifact[] = [artifact("legacy_plan", "UniversalEditPlan", f.plan, "1.0.0"), artifact("legacy_render", "RenderResult", render, "1.0.0"),
    artifact("legacy_decision", "DecisionEvent", f.decisions[0], "1.0.0"), artifact("legacy_job", "JobState", f.job, "1.0.0")];
  for (const item of legacy) {
    assert.equal(errorCode(() => admitExecution({ executionGrant: item.ref, admittedAt: T7.admitted }, [...a.artifacts, item])), "input_invalid", item.ref.artifactType);
    assert.equal(errorCode(() => buildExecutionDag({ admission: item.ref }, [...a.artifacts, item])), "input_invalid", item.ref.artifactType);
  }
  assert.equal(refusal(g, { extra: [legacy[1]!], mediaGrants: () => [legacy[1]!] }), "media_grant_invalid");
  assert.equal(refusal(g, { extra: [legacy[2]!], receipts: () => [legacy[2]!] }), "source_receipt_invalid");
  assert.equal(errorCode(() => admitExecution({ ...a.request, renderResult: legacy[1]!.ref }, a.artifacts)), "input_invalid");
});

test("only a replay-valid admission can produce an execution DAG, and forgeries cannot survive replay", () => {
  const a = basicFinal(), d = dagOf(a);
  assert.equal(errorCode(() => buildExecutionDag({ admission: a.grantArtifact.ref }, a.artifacts)), "input_invalid");
  assert.equal(errorCode(() => buildExecutionDag({ admission: a.admissionArtifact.ref }, a.artifacts.filter(x => x.ref.artifactType !== "SourceAccessReceipt"))), "source_receipt_missing");
  const underestimated = reidentify({ ...a.admission, workload: { ...a.admission.workload, outputFrames: 59, pixelFrames: 59 * 1080 * 1920 } }, "admissionId", "execution_admission_v0");
  assert.equal(errorCode(() => validateExecutionAdmission(underestimated, a.artifacts)), "admission_replay_mismatch");
  const forged = supplied(underestimated as unknown as ExecutionAdmission, "gate7_forged_admission");
  assert.equal(errorCode(() => buildExecutionDag({ admission: forged.ref }, [...a.artifacts, forged])), "admission_replay_mismatch");
  const relabeled = resealDag(d.dag, redraft(d.dag).map(node => node.kind === "final_encode"
    ? { ...node, output: { ...node.output, frames: 59 } } as ExecutionDagNodeDraft : node));
  assert.equal(errorCode(() => validateExecutionDag(relabeled, d.artifacts)), "dag_replay_mismatch");
});

// ---------------------------------------------------------------- 36-38 import boundary and protected bytes
test("the execution core has no provider, filesystem, subprocess, network, model, media or renderer dependency", () => {
  const files = readdirSync("packages/edit-execution").filter(f => f.endsWith(".ts"));
  assert.ok(files.length > 0);
  const allowed = new Set(["zod", "../contracts/common.js", "../domain/serialization.js", "../editorial/common.js", "../edit-graph/index.js", "../edit-graph/common.js",
    "../edit-graph/capability.js", "../edit-graph/resolution.js", "../planning/index.js", "../planning/common.js", "../routing/index.js", "../footage-analyzer/protocol.js"]);
  for (const file of files) {
    const source = readFileSync(`packages/edit-execution/${file}`, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) assert.ok(allowed.has(match[1]!) || /^\.\/[a-z-]+\.js$/.test(match[1]!), `${file}: ${match[1]}`);
    assert.doesNotMatch(source, /["']node:|providers\/|jobs\/|validation\/|telemetry\/|process\.|Date\.now|Math\.random|new Date|\bfetch\s*\(|\bimport\s*\(|require\s*\(/, file);
    assert.doesNotMatch(source, /ffmpeg|ffprobe|spawn|execFile|child_process|python|torch|onnx|cuda|webgpu|\.render\s*\(|\.embed\s*\(|\.generate\s*\(|\.transcribe\s*\(|analyzeFootage|analyzeReference/i, file);
    assert.doesNotMatch(source, /DecisionEventSchema|UniversalEditPlanSchema|RenderResultSchema|QCResultSchema|JobStateSchema|validatePlanWithInputs|DryRunRenderer|transitionJob|inspectPlanReceipt|InMemoryTelemetry/, file);
  }
});

const FROZEN_LEGACY_SURFACES = [
  ["packages/contracts/audio.ts", "aafb21fbe5f78e42c237b1e8d0ad15df59c9dd76ed31994efb2902655911694a"],
  ["packages/contracts/common.ts", "d97f0b05ac818cc7d721c96446c7b830a6a294145b486287edc2fd8e9e09a172"],
  ["packages/contracts/creative.ts", "c7e4fc7228d8af1286f7dbdf70f7cb110910c64d0b03ba508b5e4228791e22f6"],
  ["packages/contracts/edit-plan.ts", "7411177393d826bfe8af27084c68ee721206fc40c5c494422fac8e86f2d1babb"],
  ["packages/contracts/events.ts", "9d8c09ea88de03aec5a7dcdc337fd3153d46434c3c23f86816e2ab120a2abb3b"],
  ["packages/contracts/execution.ts", "f496ed093d80a545d792df477dbc4cbde679563cabd4bdf7c4d8185491ddc680"],
  ["packages/contracts/index.ts", "e37d5c18fae8dd2999438348b08caa151cbd947731fc287c44ae438d83baf06f"],
  ["packages/contracts/job.ts", "6bf3628cfd1a4b241e96da839e68a3db8574b81d3e6fbb6b57b08cdd2a346f77"],
  ["packages/contracts/reference-v11.ts", "a38723c81191e027409804d3405d49874b4f43c38dcd374f2bf5f0dca452625f"],
  ["packages/providers/index.ts", "ab997b4d4820c0c573e4d35b5f0d2db25c10e374df1bf7350148339de5845d33"],
  ["packages/providers/dry-run-renderer.ts", "2d085f9d8d4e88f23fe676cc47703902eb0b2d810a18ffb73b4ef82cf150e7ce"],
  ["packages/validation/index.ts", "058f745aa000c21236663b3cd5bfdbae4482deb7997309710066f9435ac7604b"],
  ["packages/validation/qc.ts", "60d9c25fa504cf6b49e79f744ceec48aa5b9dd64c26c5924a39127fca562e90c"],
  ["packages/jobs/index.ts", "b598a50a900582b56f0ed7c9122e85e689440f6f0fb27933e19fcbbda72497ed"],
  ["packages/telemetry/index.ts", "e86e8490e457c125a5f74f4bf72b6a6062bdea352a4739a9eabb314c686724aa"],
] as const;
const ACCEPTED_GATE_SURFACES = [
  ["packages/routing/index.ts", "11a6bb3472cb7ad026924b4e4ec555400bf1575e224a5e4fec11d2de8d85ac09"],
  ["packages/edit-graph/capability.ts", "e13970d956f172bb74a55de92d1b61323a016e4b3a949154b52bb5a38425139a"],
  ["packages/edit-graph/common.ts", "dc191f3bde02fb4ef63d3b615403271f281095ad22a3630e2641988997b43968"],
  ["packages/edit-graph/compatibility.ts", "93d10fb4d1d658d5f26183e14b81a4aefbaba44a1bf9b58f93bb6eae5d22d96c"],
  ["packages/edit-graph/graph.ts", "1ab3927412a52e59550e9c019032a0e02156a64fd95e3452b185d58031110da6"],
  ["packages/edit-graph/index.ts", "fdfb2cfd98dbb6d0c2e9f35b8339df8b586cb85652d8b3b7174bf5fb098796bf"],
  ["packages/edit-graph/profile.ts", "5823f09e40027b8632fb5ee045327a376f8154ac878f8adaee4c358753893b14"],
  ["packages/edit-graph/resolution.ts", "f5419d21686c7cf69050b424ae658e941ec065ef4c7da50cf240982526aef753"],
  ["tests/edit-graph.test.ts", "bef2690b7cf54108ed97b17a01f835ec67bfd07db907eb3f277f483b13f91183"],
  ["tests/support/edit-graph.ts", "50e57755aff2d03b5e282e8445b399edfca1dd5af000c9981e607b2875cc0468"],
  ["docs/phases/phase-5-gate-6-editgraph-capability-compatibility.md", "7b8304cbd9585f57684059eef65a442d2e394a51a65f8e3f0c9ab7452a04c011"],
] as const;
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
test("legacy public contracts, renderer, QC, job, validator and telemetry bytes are unchanged", () => {
  for (const [path, digest] of FROZEN_LEGACY_SURFACES) assert.equal(sha256(path), digest, path);
});
test("accepted Gate-3 routing and Gate-6 EditGraph bytes are unchanged", () => {
  for (const [path, digest] of ACCEPTED_GATE_SURFACES) assert.equal(sha256(path), digest, path);
});

// ---------------------------------------------------------------- adversarial self-review
test("self-review: evidence bound by an execution grant cannot postdate the grant that binds it", () => {
  const g = basicGraph(), afterGrant = "2026-09-24T00:59:00.000Z";
  assert.ok(T7.issued < afterGrant && afterGrant < T7.admitted);
  assert.equal(refusal(g, { receipt: () => ({ checkedAt: afterGrant }) }), "evidence_postdates_execution_grant");
  assert.equal(refusal(g, { snapshot: freshSnapshot([freshExecutorBody(declarations(), EXECUTOR, afterGrant)], { asOf: afterGrant }) }), "evidence_postdates_execution_grant");
  assert.equal(refusal(g, { estimate: { estimatedAt: afterGrant } }), "evidence_postdates_execution_grant");
  // Added with the repair: before it, this case was already refused, but only as media_grant_window_invalid via the receipt check.
  assert.equal(refusal(g, { mediaGrant: { issuedAt: afterGrant } }), "evidence_postdates_execution_grant");
});

test("self-review: a MediaAsset swapped under the receipt's exact reference is refused", () => {
  const g = basicGraph(), s = graphSources(g)[0]!;
  const x = executionInputs(g, withCurrentMedia(s, { retention: { expiresAt: null, deletionRequestedAt: null } }, "gate7_media_swapped"));
  const swapped = currentMediaAsset(s, { retention: { expiresAt: null, deletionRequestedAt: "2026-09-24T00:57:00.000Z" } }, "gate7_media_swapped");
  assert.notEqual(swapped.ref.sha256, x.artifacts.find(a => a.ref.objectId === "gate7_media_swapped")!.ref.sha256);
  assert.equal(errorCode(() => admitExecution(x.request, x.artifacts.map(a => a.ref.objectId === "gate7_media_swapped" ? swapped : a))), "media_asset_mismatch");
});

test("self-review: attestations observed before the graph's capability observation never pass inside a new snapshot", () => {
  const g = basicGraph(), before = "2026-09-23T23:59:00.000Z";
  assert.ok(before < g.graph.capability.asOf);
  const lenient = { freshness: { maxSourceReceiptAgeMilliseconds: 900_000, maxCapabilityEvidenceAgeMilliseconds: 604_800_000 } };
  assert.equal(refusal(g, { policy: lenient, snapshot: freshSnapshot([freshExecutorBody(declarations(), EXECUTOR, before)]) }), "capability_snapshot_stale");
});

test("self-review: frame, pixel and duration arithmetic never overflows or rounds silently", () => {
  const grid = { ticksPerSecond: 1_000_000_000, numerator: 30, denominator: 1 };
  assert.equal(errorCode(() => frameIndexAt(Number.MAX_SAFE_INTEGER, { ticksPerSecond: 1, numerator: 240, denominator: 1 })), "limit_exceeded");
  assert.equal(errorCode(() => frameIndexAt(-1, grid)), "limit_exceeded");
  assert.equal(errorCode(() => frameIndexAt(2 ** 53 + 2, grid)), "limit_exceeded");
  assert.equal(errorCode(() => frameIndexAt(0.5, grid)), "limit_exceeded");
  assert.equal(errorCode(() => exactProduct("Pixel frames", 2_000_000_000, 16384, 16384)), "limit_exceeded");
  // Beyond 2^53 intermediate products stay exact: 9e15 ticks at 30 fps on a nanosecond clock is exactly 270,000,000 frames.
  assert.equal(frameIndexAt(9_000_000_000_000_000, grid), 270_000_000);
  assert.equal(frameIndexAt(9_000_000_000_000_001, grid), undefined);
});

/** Swaps two node positions and remaps every input so only listing order changes. */
function swapDrafts(drafts: ExecutionDagNodeDraft[], a: number, b: number): ExecutionDagNodeDraft[] {
  const move = (i: number) => i === a ? b : i === b ? a : i;
  const swapped = drafts.map((_, i) => structuredClone(drafts[move(i)]!));
  return swapped.map(draft => ({ ...draft, inputs: draft.inputs.map(move) }) as ExecutionDagNodeDraft);
}
test("self-review: reordered, pruned or detached DAG nodes cannot survive even a coordinated rehash", () => {
  const d = wholeColorDag(), drafts = redraft(d.dag), kinds = d.dag.nodes.map(n => n.kind);
  const sequence = kinds.indexOf("cut_sequence"), look = kinds.indexOf("color_look");
  assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, swapDrafts(drafts, 0, 1)), d.artifacts)), "dag_replay_mismatch");
  const pruned = structuredClone(drafts);
  pruned[sequence] = { ...pruned[sequence]!, inputs: pruned[sequence]!.inputs.filter(i => i !== 1) } as ExecutionDagNodeDraft;
  assert.ok(["input_invalid", "dag_replay_mismatch"].includes(errorCode(() => validateExecutionDag(resealDag(d.dag, pruned), d.artifacts))));
  const detached = structuredClone(drafts);
  detached[look] = { ...detached[look]!, inputs: [0] } as ExecutionDagNodeDraft;
  assert.ok(["input_invalid", "dag_replay_mismatch"].includes(errorCode(() => validateExecutionDag(resealDag(d.dag, detached), d.artifacts))));
  const unsealed = structuredClone(d.dag);
  unsealed.nodes.reverse();
  assert.equal(errorCode(() => validateExecutionDag(unsealed, d.artifacts)), "input_invalid");
});

test("self-review: a preview admission or DAG relabeled final, or bound to another grant, cannot survive replay", () => {
  const p = dagOf(basicPreview()), f = basicFinal();
  const relabeled = reidentify({ ...p.admission, renderIntent: "final", workload: { ...p.admission.workload, renderIntent: "final" } }, "admissionId", "execution_admission_v0");
  assert.equal(errorCode(() => validateExecutionAdmission(relabeled, p.artifacts)), "admission_replay_mismatch");
  const regranted = reidentify({ ...f.admission, executionGrant: p.grantArtifact.ref }, "admissionId", "execution_admission_v0");
  assert.equal(errorCode(() => validateExecutionAdmission(regranted, [...f.artifacts, ...p.artifacts.filter(a => !f.artifacts.some(b => b.ref.objectId === a.ref.objectId))])),
    "admission_replay_mismatch");
  const finalLabel = resealDag(p.dag, redraft(p.dag), { ...p.dag.settings, renderIntent: "final" }, { renderIntent: "final" });
  assert.equal(errorCode(() => validateExecutionDag(finalLabel, p.artifacts)), "dag_replay_mismatch");
});

test("self-review: a substituted media grant cannot authorize a receipt that checked another grant", () => {
  const g = basicGraph(), s = graphSources(g)[0]!;
  const other = mediaGrant(s, ["final", "preview"], { issuedAt: "2026-09-24T00:31:00.000Z" }), otherArtifact = supplied(other, other.grantId);
  assert.equal(refusal(g, { extra: [otherArtifact], mediaGrants: () => [otherArtifact] }), "source_receipt_invalid");
  assert.equal(refusal(g, { extra: [otherArtifact], mediaGrants: made => [...made, otherArtifact] }), "media_grant_invalid");
});

// ---------------------------------------------------------------- independent owner review (2026-09-24): regressions written before repair
const H_A = "a".repeat(64);
const loose = (value: unknown) => value as Record<string, unknown>;
const uniformFramesGraph = () => memo("g_frames_uniform", () => graphOf(plan(planningFixture({}, chainFixture([{ key: "frames", hash: H_A }])))));
const variableFramesGraph = () => memo("g_frames_variable", () => graphOf(plan(planningFixture({}, chainFixture([{ key: "frames", hash: H_A, metadata: variableFrameMetadata() }])))));
const VARIABLE_FRAME_SUPPORTS = VIDEO_SUPPORTS.map(s => s.name === "source_frame_timing" ? member("source_frame_timing", "constant_frame_rate", "variable_frame_rate") : s);
const variableFrameSnapshot = () => freshSnapshot([freshExecutorBody(declarations({ timeline_video_clip: declaration("timeline_video_clip", VARIABLE_FRAME_SUPPORTS) }))]);
const duplicateCutPlan = () => memo("p_duplicate_cut", () => {
  const x = planningFixture(repeatedUses(2));
  return plan(withDirection(x, { nodes: [x.source.direction.nodes[0]!,
    operationNode(x, "node_cut_a", { kind: "transition_intention", relation: "clear_change", description: "A clear change." }),
    operationNode(x, "node_cut_b", { kind: "transition_intention", relation: "clear_change", description: "Another clear change." })] }));
});
const duplicateCutGraph = () => memo("g_duplicate_cut", () => {
  const p = duplicateCutPlan();
  return graphOf(p, { resolutions: [resolution(p, "node_cut_a", "transition_intention", cutAt(p, 0)), resolution(p, "node_cut_b", "transition_intention", cutAt(p, 0))] });
});

test("owner review: a registered H.264/AAC render with every Gate-6 capability AVAILABLE still needs an exact runtime encoding attestation", () => {
  const x = executionInputs(basicGraph());
  assert.deepEqual([x.profile.video, x.profile.audio], [{ codecFamily: "h264", pixelFormat: "yuv420p", encodingProfile: "deterministic_constant_quality_v0" },
    { policy: "graph_linked_source_audio_v0", codecFamily: "aac", sampleRateHz: 48000, channelLayout: "stereo" }]);
  assert.ok(admitExecution(x.request, x.artifacts).capability.requirements.every(r => r.state === "AVAILABLE"));
  const withoutRuntime = x.artifacts.filter(a => a.ref.artifactType !== "ExecutionRuntimeAttestation");
  assert.equal(errorCode(() => admitExecution(x.request, withoutRuntime)), "runtime_attestation_missing");
});

test("owner review: DAG source nodes keep the exact accepted Gate-6 trim and timebase authority", () => {
  const d = dagOf(basicFinal()), clip = videoUses(basicGraph().graph)[0]!;
  const { assetId: _assetId, sourceHash: _sourceHash, analysis: _analysis, range: _range, ...authority } = clip.source;
  assert.deepEqual(Object.keys(authority).sort(), ["boundaryId", "endAuthority", "precision", "shotId", "startAuthority", "support", "timebase"]);
  const [node] = nodesOf(d.dag, "source_video_clip");
  assert.deepEqual(loose(node!.source).trim, authority);
});

test("owner review: equal source hash and seconds with different frame endpoint and timebase authority never share a source computation identity", () => {
  const snapshot = variableFrameSnapshot(), uniformGraph = uniformFramesGraph(), variableGraph = variableFramesGraph();
  const u = videoUses(uniformGraph.graph)[0]!.source, v = videoUses(variableGraph.graph)[0]!.source;
  assert.deepEqual([u.sourceHash, u.range, u.precision], [v.sourceHash, v.range, v.precision]);
  assert.deepEqual([u.startAuthority.kind, u.endAuthority.kind, v.startAuthority.kind, v.endAuthority.kind], ["frame_pts", "frame_pts", "frame_pts", "frame_pts"]);
  assert.deepEqual([loose(u.endAuthority).frameIndex, loose(v.endAuthority).frameIndex], [20, 40]);
  assert.notDeepEqual(u.timebase, v.timebase);
  const [uniformNode] = nodesOf(dagOf(admissionOf(uniformGraph, { snapshot })).dag, "source_video_clip");
  const [variableNode] = nodesOf(dagOf(admissionOf(variableGraph, { snapshot })).dag, "source_video_clip");
  assert.notEqual(uniformNode!.computationId, variableNode!.computationId);
});

test("owner review: an admission and its DAG are eligibility only; exclusive dispatch is not yet claimed", () => {
  const d = dagOf(basicFinal());
  assert.deepEqual(loose(d.admission).dispatch, { state: "not_claimed", requirement: "atomic_runtime_claim_required" });
  // Final owner hardening superseded the four-field `claimKey` shape: the claim target is the reservation attempt only.
  const attempt = { reservationId: d.admission.budget.reservationId, operationId: d.admission.operationId, attempt: d.admission.attempt };
  assert.deepEqual(loose(d.dag).dispatch, { state: "not_claimed", requirement: "atomic_runtime_claim_required",
    claimTarget: identify("execution_claim_target_v0", "claimTargetId", attempt), renderBinding: { renderComputationId: d.dag.renderIdentity.renderComputationId } });
});

test("owner review: two accepted cut operations on one join are refused, never silently merged", () => {
  const g = duplicateCutGraph(), cuts = g.graph.operations.filter(o => o.primitive === "cut_transition");
  assert.equal(cuts.length, 2);
  assert.notEqual(cuts[0]!.operationId, cuts[1]!.operationId);
  assert.deepEqual(cuts[0]!.target, cuts[1]!.target);
  assert.deepEqual(validateEditGraph(g.graph, g.artifacts), g.graph);
  assert.equal(refusal(g), "operation_not_executable");
});

test("self-review: partial-byte hashes, relaxed frame policies and unregistered encodings are unrepresentable", () => {
  const x = executionInputs(basicGraph()), { receiptId: _receiptId, ...receiptBody } = x.receipts[0]!.value as { receiptId: string; observed: Record<string, unknown> } & Record<string, unknown>;
  assert.equal(errorCode(() => createSourceAccessReceipt({ ...receiptBody, observed: { ...receiptBody.observed, hashScope: "first_megabyte" } })), "input_invalid");
  assert.equal(errorCode(() => executionPolicy({ frameConformance: "rounded_preview_v0" })), "input_invalid");
  assert.equal(errorCode(() => executionPolicy({ freshness: { maxSourceReceiptAgeMilliseconds: 0, maxCapabilityEvidenceAgeMilliseconds: 1 } })), "input_invalid");
  assert.equal(errorCode(() => renderProfile("final", { video: { codecFamily: "h264", pixelFormat: "yuv420p", encodingProfile: "fastest_lossy_v0" } })), "input_invalid");
  assert.equal(errorCode(() => renderProfile("final", { audio: { policy: "mix_all_sources_v0", codecFamily: "aac", sampleRateHz: 48000, channelLayout: "stereo" } })), "input_invalid");
});

// ---------------------------------------------------------------- independent owner review (2026-09-24): coverage and hard attacks added with the repair
type ClipNode = Extract<DagNode, { kind: "source_video_clip" }>;
type VideoSource = EditGraph["clipUses"][number]["source"];
const HASH_A ="f".repeat(64), HASH_A_NEW = "e".repeat(64), HASH_B = "1".repeat(64), ASSET_A = `asset_${HASH_A}`, ASSET_B = `asset_${HASH_B}`;
/** Two distinct authorized sources, test-only: timeline order A then B, canonical asset order B then A. */
const twoAssetGraph = () => memo("g_two_asset", () => graphOf(plan(planningFixture(orderedSourcesPolicy(4, 2),
  chainFixture([{ key: "a", hash: HASH_A }, { key: "b", hash: HASH_B }])))));
const twoAssetDag = () => memo("d_two_asset", () => dagOf(admissionOf(twoAssetGraph())));
/** The same two-source chain after source A's bytes changed; source B is untouched. */
const newAGraph = () => memo("g_two_asset_new_a", () => graphOf(plan(planningFixture(orderedSourcesPolicy(4, 2),
  chainFixture([{ key: "a", hash: HASH_A_NEW }, { key: "b", hash: HASH_B }])))));
/** Candidate endpoints between source frames: an admissible `source_seconds` trim. */
const secondsGraph = () => memo("g_seconds", () => graphOf(plan(planningFixture({ duration: { minimumSeconds: 1, maximumSeconds: 2, preferredSeconds: 2 },
  search: { ...planningPolicyBody.search, maximumDepth: 1 } }, directionFixture(0, false, { startSeconds: 0.05, endSeconds: 2.05 })))));
const cutColorGraph = () => memo("g_cut_color", () => {
  const x = planningFixture(repeatedUses(2));
  const p = plan(withDirection(x, { nodes: [x.source.direction.nodes[0]!,
    operationNode(x, "node_cut", { kind: "transition_intention", relation: "clear_change", description: "A clear change." }),
    operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Warm both clips." })] }));
  return graphOf(p, { resolutions: [resolution(p, "node_cut", "transition_intention", cutAt(p, 0)),
    resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "planning_uses", useIds: chosenOption(p).uses.map(u => u.useId) }))] });
});
const cutColorDag = () => memo("d_cut_color", () => dagOf(admissionOf(cutColorGraph())));
const uniformFramesDag = () => memo("d_frames_uniform", () => dagOf(admissionOf(uniformFramesGraph(), { snapshot: variableFrameSnapshot() })));
const variableFramesDag = () => memo("d_frames_variable", () => dagOf(admissionOf(variableFramesGraph(), { snapshot: variableFrameSnapshot() })));
const clipIndexes = (dag: ExecutionDag) => dag.nodes.flatMap((n, i) => n.kind === "source_video_clip" ? [i] : []);
const rehashed = <T extends object>(value: T, patch: Record<string, unknown>, key: string, namespace: string) => reidentify({ ...value, ...patch }, key, namespace);
/** Every operation target, as `kind|operationId|target`: a cut on its join, a look on each clip it names or on the whole output. */
const graphOperationTargets = (graph: EditGraph) => graph.operations.flatMap(o => o.primitive === "cut_transition"
  ? [`cut|${o.operationId}|${o.target.fromClipUseId}|${o.target.toClipUseId}`]
  : o.target.kind === "whole_output" ? [`look|${o.operationId}|whole_output`] : o.target.clipUseIds.map(id => `look|${o.operationId}|${id}`)).sort();
const dagOperationTargets = (dag: ExecutionDag) => dag.nodes.flatMap(n => n.kind === "color_look"
  ? [`look|${n.operationId}|${n.target.kind === "clip_use" ? n.target.clipUseId : "whole_output"}`]
  : n.kind === "cut_sequence" ? n.joins.flatMap(j => j.operation.state === "present" ? [`cut|${j.operation.value}|${j.fromClipUseId}|${j.toClipUseId}`] : []) : []).sort();

test("owner review coverage: two distinct sources keep independent analyses, grants, MediaAssets and receipts in canonical order", () => {
  const g = twoAssetGraph(), d = twoAssetDag(), clips = videoUses(g.graph), sources = d.admission.sources;
  assert.deepEqual(clips.map(c => [c.source.assetId, c.source.sourceHash]), [[ASSET_A, HASH_A], [ASSET_B, HASH_B]]);
  const analyses = clips.map(c => g.artifacts.find(a => a.ref.objectId === c.source.analysis.objectId)!.value as { assetId: string; contentHash: string });
  assert.deepEqual(analyses.map(a => [a.assetId, a.contentHash]), [[ASSET_A, HASH_A], [ASSET_B, HASH_B]]);
  assert.notDeepEqual(clips[0]!.source.analysis, clips[1]!.source.analysis);
  // Canonical asset order (B before A) everywhere a source set is declared, independent of timeline order.
  assert.deepEqual(sources.map(s => [s.assetId, s.contentHash]), [[ASSET_B, HASH_B], [ASSET_A, HASH_A]]);
  assert.deepEqual(d.estimate.sources.map(s => s.assetId), [ASSET_B, ASSET_A]);
  for (const refs of [d.grant.mediaGrants, d.grant.sourceReceipts, d.dag.renderIdentity.sourceReceipts]) assert.deepEqual(refs.map(r => r.objectId), refs.map(r => r.objectId).sort());
  for (const key of ["analysis", "mediaAsset", "mediaGrant", "receipt"] as const) assert.equal(new Set(sources.map(s => s[key].objectId)).size, 2, key);
  for (const s of sources) {
    const i = d.sources.findIndex(x => x.assetId === s.assetId), clip = clips.find(c => c.source.assetId === s.assetId)!;
    assert.deepEqual([s.analysis, s.mediaAsset, s.mediaGrant, s.receipt, s.clipUseIds],
      [clip.source.analysis, d.sources[i]!.mediaAsset.ref, d.mediaGrants[i]!.ref, d.receipts[i]!.ref, [clip.clipUseId]]);
    const receipt = d.receipts[i]!.value as { source: { assetId: string; analysis: unknown; mediaAsset: unknown }; mediaGrant: unknown };
    assert.deepEqual([receipt.source.assetId, receipt.source.analysis, receipt.source.mediaAsset, receipt.mediaGrant], [s.assetId, s.analysis, s.mediaAsset, s.mediaGrant]);
  }
  // Each DAG source node, in timeline order, names exactly its own asset's receipt, analysis, hash and timebase.
  const nodes = nodesOf(d.dag, "source_video_clip");
  assert.deepEqual(nodes.map(n => n.source.assetId), [ASSET_A, ASSET_B]);
  for (const node of nodes) {
    const admitted = sources.find(s => s.assetId === node.source.assetId)!;
    assert.deepEqual([node.source.receipt, node.source.analysis, node.source.contentHash], [admitted.receipt, admitted.analysis, admitted.contentHash]);
    assert.deepEqual(node.source.trim.timebase, { artifact: admitted.analysis, pointer: "/metadata/frameTimes" });
  }
  assert.deepEqual(nodesOf(d.dag, "cut_sequence")[0]!.clipUseIds, clips.map(c => c.clipUseId));
  assert.deepEqual(validateExecutionDag(d.dag, d.artifacts), d.dag);
  // Asset identity is content-derived in the accepted analysis contract: one asset ID with two hashes, or one hash under two asset IDs, never forms a chain.
  assert.throws(() => chainFixture([{ key: "a", hash: HASH_A }, { key: "b", hash: HASH_B, assetId: ASSET_A }]), /Analysis asset or configuration identity mismatch/);
  assert.throws(() => chainFixture([{ key: "a", hash: HASH_A }, { key: "b", hash: HASH_A, assetId: ASSET_B }]), /Analysis asset or configuration identity mismatch/);
});

test("owner review coverage: cross-wired receipts, grants, analyses, MediaAssets and estimates between two sources refuse", () => {
  const g = twoAssetGraph(), x = executionInputs(g), [b, a] = x.sources as [GraphSource, GraphSource];
  assert.deepEqual([a.assetId, b.assetId], [ASSET_A, ASSET_B]);
  const grantOf = (s: GraphSource) => x.mediaGrants[x.sources.indexOf(s)]!.ref;
  const forA = (patch: (s: GraphSource) => Record<string, unknown>) => (s: GraphSource) => s.assetId === ASSET_A ? patch(s) : {};
  // A's receipt names B's media grant, analysis, MediaAsset or hash.
  assert.equal(refusal(g, { receipt: forA(() => ({ mediaGrant: grantOf(b) })) }), "source_receipt_invalid");
  assert.equal(refusal(g, { receipt: forA(s => ({ source: { assetId: s.assetId, mediaAsset: s.mediaAsset.ref, analysis: b.analysis } })) }), "source_analysis_mismatch");
  assert.equal(refusal(g, { receipt: forA(s => ({ source: { assetId: s.assetId, mediaAsset: b.mediaAsset.ref, analysis: s.analysis } })) }), "media_asset_mismatch");
  assert.equal(refusal(g, { receipt: forA(s => ({ expected: { contentHash: HASH_B, sizeBytes: s.sizeBytes },
    observed: { contentHash: HASH_B, sizeBytes: s.sizeBytes, hashScope: "full_source_bytes" } })) }), "source_hash_mismatch");
  // A's receipt relabeled to B leaves B with two receipts and A with none.
  assert.equal(refusal(g, { receipt: forA(() => ({ source: { assetId: ASSET_B, mediaAsset: b.mediaAsset.ref, analysis: b.analysis }, mediaGrant: grantOf(b) })) }),
    "source_receipt_invalid");
  // A receipt or a grant supplied for only one of the two sources.
  assert.equal(refusal(g, { receipts: made => made.filter((_, i) => x.sources[i]!.assetId !== ASSET_A) }), "source_receipt_missing");
  assert.equal(refusal(g, { mediaGrants: made => made.filter((_, i) => x.sources[i]!.assetId !== ASSET_B) }), "media_grant_missing");
  // Grants for B's hash under A's asset ID, or A's hash under B's asset ID.
  const swapped = [mediaGrant({ assetId: ASSET_A, contentHash: HASH_B }), mediaGrant({ assetId: ASSET_B, contentHash: HASH_A })].map(v => supplied(v, v.grantId));
  assert.equal(refusal(g, { extra: swapped, mediaGrants: () => swapped }), "media_grant_invalid");
  assert.equal(refusal(g, { extra: [swapped[0]!], mediaGrants: made => [...made, swapped[0]!] }), "media_grant_invalid");
  // The estimate must name both exact sources.
  assert.equal(refusal(g, { estimate: { sources: [{ assetId: ASSET_A, contentHash: HASH_B }, { assetId: ASSET_B, contentHash: HASH_A }] } }), "work_estimate_mismatch");
  assert.equal(refusal(g, { estimate: { sources: [{ assetId: ASSET_A, contentHash: HASH_A }] } }), "work_estimate_mismatch");
  // B's analysis bytes offered under A's exact analysis reference fail the exact-bytes rule before anything is read.
  const bAnalysis = x.artifacts.find(i => i.ref.objectId === b.analysis.objectId)!;
  assert.equal(errorCode(() => admitExecution(x.request, x.artifacts.map(i => i.ref.objectId === a.analysis.objectId ? { ...bAnalysis, ref: a.analysis } : i))), "input_invalid");
});

test("owner review coverage: a foreign-scope grant, receipt, MediaAsset or analysis for one of two sources rescues nothing", () => {
  const g = twoAssetGraph(), b = graphSources(g).find(s => s.assetId === ASSET_B)!;
  const forB = (patch: (s: GraphSource) => Record<string, unknown>) => (s: GraphSource) => s.assetId === ASSET_B ? patch(s) : {};
  assert.equal(refusal(g, { receipt: forB(() => ({ scope: FOREIGN })) }), "scope_mismatch");
  const foreign = mediaGrant(b, ["final", "preview"], { scope: FOREIGN }), foreignGrant = supplied(foreign, foreign.grantId);
  const isB = (item: SuppliedArtifact) => (item.value as { source: { assetId: string } }).source.assetId === ASSET_B;
  assert.equal(refusal(g, { extra: [foreignGrant], mediaGrants: made => made.map(m => isB(m) ? foreignGrant : m) }), "scope_mismatch");
  for (const [patch, id] of [[{ projectId: "project_other" }, "gate7_media_b_other_project"], [{ creatorId: "creator_other" }, "gate7_media_b_other_creator"]] as const) {
    const media = currentMediaAsset(b, patch, id);
    assert.equal(refusal(g, { extra: [media], receipt: forB(s => ({ source: { assetId: s.assetId, mediaAsset: media.ref, analysis: s.analysis } })) }), "media_asset_foreign_scope", id);
  }
  // Another project's analysis of B's exact bytes.
  const other = chainFixture([{ key: "b_other_project", hash: HASH_B, owner: { projectId: "project_other", creatorId: "creator_other" } }]);
  const otherAnalysis = other.supplied.find(i => i.ref.objectId === "gate7_analysis_b_other_project")!;
  assert.equal((otherAnalysis.value as { contentHash: string }).contentHash, HASH_B);
  assert.equal(refusal(g, { extra: [otherAnalysis], receipt: forB(s => ({ source: { assetId: s.assetId, mediaAsset: s.mediaAsset.ref, analysis: otherAnalysis.ref } })) }),
    "source_analysis_mismatch");
});

test("owner review coverage: new bytes for source A change only A's identities and their dependents; B's work is unchanged", () => {
  const before = twoAssetDag(), after = dagOf(admissionOf(newAGraph()));
  const byAsset = (dag: ExecutionDag, assetId: string) => nodesOf(dag, "source_video_clip").find(n => n.source.assetId === assetId)!;
  const aBefore = byAsset(before.dag, ASSET_A), bBefore = byAsset(before.dag, ASSET_B), aAfter = byAsset(after.dag, `asset_${HASH_A_NEW}`), bAfter = byAsset(after.dag, ASSET_B);
  assert.notEqual(aAfter.computationId, aBefore.computationId);
  assert.equal(bAfter.computationId, bBefore.computationId);
  // B's occurrence names the new graph's receipt: shared work never shares authority lineage.
  assert.notDeepEqual(bAfter.source.receipt, bBefore.source.receipt);
  for (const kind of ["cut_sequence", "composition", "final_encode"] as const) {
    assert.notEqual(nodesOf(after.dag, kind)[0]!.computationId, nodesOf(before.dag, kind)[0]!.computationId, kind);
  }
  assert.notEqual(after.dag.renderIdentity.renderComputationId, before.dag.renderIdentity.renderComputationId);
  // White-box, within one DAG: moving A's trim changes exactly A, the sequence, the composition and the root; B keeps both identities.
  const drafts = redraft(before.dag), [aIndex, bIndex] = clipIndexes(before.dag) as [number, number], kinds = before.dag.nodes.map(n => n.kind);
  const moved = identifyDagNodes(shiftClip(drafts, aIndex), before.dag.settings);
  const changed = before.dag.nodes.map((n, i) => n.computationId !== moved[i]!.computationId);
  assert.deepEqual(changed, kinds.map((kind, i) => i === aIndex || ["cut_sequence", "composition", "final_encode"].includes(kind)));
  assert.deepEqual(before.dag.nodes.map((n, i) => n.nodeId !== moved[i]!.nodeId), changed);
  assert.deepEqual([moved[bIndex]!.nodeId, moved[bIndex]!.computationId], [bBefore.nodeId, bBefore.computationId]);
  const forged = resealDag(before.dag, shiftClip(drafts, aIndex));
  assert.notEqual(forged.renderIdentity.renderComputationId, before.dag.renderIdentity.renderComputationId);
  assert.equal(errorCode(() => validateExecutionDag(forged, before.artifacts)), "dag_replay_mismatch");
  // Equal ranges, precision and frame-time tables never merge different bytes.
  assert.deepEqual([aBefore.source.range, aBefore.source.trim.precision, aBefore.source.frameTimes], [bBefore.source.range, bBefore.source.trim.precision, bBefore.source.frameTimes]);
  assert.notEqual(aBefore.computationId, bBefore.computationId);
});

test("owner review hard attack: the runtime attestation must name the exact executor build, environment and requested encoding", () => {
  const g = basicGraph(), profile = renderProfile();
  for (const executor of [{ ...EXECUTOR, executorId: "other_executor" }, { ...EXECUTOR, version: "0.2.0" }, { ...EXECUTOR, implementationDigest: "d".repeat(64) }]) {
    assert.equal(refusal(g, { runtime: { executor } }), "runtime_attestation_mismatch", JSON.stringify(executor));
  }
  assert.equal(refusal(g, { runtime: { environment: "other_environment" } }), "runtime_attestation_mismatch");
  assert.equal(refusal(g, { runtime: { encoding: { video: profile.video, audio: { ...profile.audio, sampleRateHz: 44100 } } } }), "runtime_attestation_mismatch");
  assert.equal(refusal(g, { runtime: { encoding: { video: profile.video, audio: { ...profile.audio, channelLayout: "mono" } } } }), "runtime_attestation_mismatch");
  // An unregistered codec, pixel format or encoding profile is unrepresentable: refused at creation and as supplied bytes.
  const { attestationId: _attestationId, ...body } = executionInputs(g).runtime;
  for (const encoding of [{ video: { ...profile.video, codecFamily: "hevc" }, audio: profile.audio }, { video: { ...profile.video, pixelFormat: "yuv444p" }, audio: profile.audio },
    { video: { ...profile.video, encodingProfile: "fastest_lossy_v0" }, audio: profile.audio }, { video: profile.video, audio: { ...profile.audio, codecFamily: "opus" } }]) {
    assert.equal(errorCode(() => runtimeAttestation({ executor: EXECUTOR, profile }, { encoding })), "input_invalid");
    const raw = identify("execution_runtime_attestation_v0", "attestationId", { ...body, encoding }), item = artifact(raw.attestationId, "ExecutionRuntimeAttestation", raw);
    assert.equal(refusal(g, { extra: [item], runtimeRef: item.ref }), "runtime_attestation_invalid", JSON.stringify(encoding));
  }
  // The attested runtime build binds every computation identity: another build is other work.
  const base = dagOf(basicFinal()).dag, other = dagOf(admissionOf(g, { runtime: { runtime: { ...RUNTIME, version: "0.2.0" } } })).dag;
  assert.deepEqual([base.settings.runtime, other.settings.runtime], [RUNTIME, { ...RUNTIME, version: "0.2.0" }]);
  assert.ok(other.nodes.every((n, i) => n.computationId !== base.nodes[i]!.computationId));
});

test("owner review hard attack: unavailable, failed, unlicensed, stale, postdated, foreign or borrowed runtime evidence never admits", () => {
  const g = basicGraph(), x = executionInputs(g);
  assert.equal(refusal(g, { runtime: { outcome: { state: "unavailable", reasonCode: "unconfigured", nextCheckAfter: "2026-09-25T00:00:00.000Z",
    evidence: [evidenceRef(runtimeConfiguration)] } } }), "runtime_attestation_unavailable");
  assert.equal(refusal(g, { runtime: { outcome: { state: "failed", failureCode: "encoder_rejected",
    attempt: { attemptedAt: T7.capability, evidence: [evidenceRef(runtimeConformance)] } } } }), "runtime_attestation_failed");
  assert.equal(refusal(g, { runtime: { outcome: { ...availableRuntime(), licensing: { eligiblePurposes: ["commercial_delivery"] } } } }), "runtime_attestation_unavailable");
  assert.equal(refusal(g, { runtime: { observedAt: "2026-09-24T00:59:00.000Z" } }), "evidence_postdates_execution_grant");
  assert.equal(refusal(g, { runtime: { observedAt: "2026-09-24T01:30:00.000Z" } }), "evidence_postdates_admission");
  assert.equal(refusal(g, { runtime: { observedAt: "2026-09-24T00:29:59.999Z" } }), "runtime_attestation_stale");
  assert.equal(admissionOf(g, { runtime: { observedAt: "2026-09-24T00:30:00.000Z" } }).admission.runtime.observedAt, "2026-09-24T00:30:00.000Z");
  assert.equal(refusal(g, { runtime: { scope: FOREIGN } }), "scope_mismatch");
  // The work estimate, or any other authority artifact, is never the attestation or its evidence.
  assert.equal(refusal(g, { runtimeRef: x.estimateArtifact.ref }), "runtime_attestation_invalid");
  assert.equal(refusal(g, { runtimeRef: x.snapshotArtifact.ref }), "runtime_attestation_invalid");
  const conformanceFrom = (refs: unknown[]) => ({ outcome: { ...availableRuntime(), conformance: { meaning: "attested_encoding_matches_declared_semantics", evidence: refs } } });
  for (const item of [x.estimateArtifact, x.snapshotArtifact, x.mediaGrants[0]!, x.receipts[0]!]) {
    assert.equal(refusal(g, { runtime: conformanceFrom([evidenceRef(item)]) }), "runtime_attestation_invalid", item.ref.artifactType);
  }
  const foreignEvidence = artifact("gate7_foreign_runtime_evidence", "Evidence", { scope: FOREIGN, basis: "synthetic_foreign_runtime_evidence" });
  assert.equal(refusal(g, { extra: [foreignEvidence], runtime: conformanceFrom([evidenceRef(foreignEvidence)]) }), "runtime_attestation_invalid");
  assert.equal(refusal(g, { runtime: conformanceFrom([{ artifact: { ...runtimeConformance.ref, objectId: "gate7_unsupplied_runtime_evidence" }, pointer: "" }]) }),
    "runtime_attestation_invalid");
  // Evidence of an unavailable or failed execution-time check can never also prove the runtime available.
  const unavailableColor = declaration("color_look", fullColorSupports, { state: "unavailable", reasonCode: "unconfigured", nextCheckAfter: "2026-09-25T00:00:00.000Z",
    evidence: unavailableRefs });
  const failedRefs = [{ artifact: failedAttempt.ref, pointer: "" }];
  const failedColor = declaration("color_look", fullColorSupports, { state: "failed", failureCode: "probe_rejected", attempt: failedRefs });
  for (const [claim, refs] of [[unavailableColor, unavailableRefs], [failedColor, failedRefs]] as const) {
    const snapshot = freshSnapshot([freshExecutorBody(declarations({ color_look: claim }))]);
    assert.equal(admissionOf(g, { snapshot }).admission.outcome, "admitted");
    assert.equal(refusal(g, { snapshot, runtime: conformanceFrom([...refs]) }), "runtime_attestation_invalid", claim.status.state as string);
  }
});

test("owner review hard attack: runtime and resolver identities can never carry a location or an invocation", () => {
  const g = basicGraph(), x = executionInputs(g), profile = renderProfile(), { attestationId: _attestationId, ...body } = x.runtime;
  const { receiptId: _receiptId, ...receiptBody } = x.receipts[0]!.value as { receiptId: string; resolver: Record<string, unknown> } & Record<string, unknown>;
  for (const version of ["C:\\encoders\\ffmpeg.exe", "/usr/bin/ffmpeg", "ffmpeg -y -i in.mp4 out.mp4", "https://example.invalid/ffmpeg", "..\\ffmpeg", "C:ffmpeg"]) {
    assert.equal(errorCode(() => runtimeAttestation({ executor: EXECUTOR, profile }, { runtime: { ...RUNTIME, version } })), "input_invalid", version);
    const raw = identify("execution_runtime_attestation_v0", "attestationId", { ...body, runtime: { ...RUNTIME, version } });
    const item = artifact(raw.attestationId, "ExecutionRuntimeAttestation", raw);
    assert.equal(refusal(g, { extra: [item], runtimeRef: item.ref }), "runtime_attestation_invalid", version);
    // Sub-case added with this repair: the Batch-1 source-receipt resolver identity has the same free-text version field.
    assert.equal(errorCode(() => createSourceAccessReceipt({ ...receiptBody, resolver: { ...receiptBody.resolver, version } })), "input_invalid", version);
  }
  for (const version of ["0.1.0", "7.1.1", "n7.1-3-gabc123", "2026.09.24+build_7"]) {
    assert.equal(runtimeAttestation({ executor: EXECUTOR, profile }, { runtime: { ...RUNTIME, version } }).runtime.version, version);
  }
});

test("owner review hard attack: runtime evidence observed before the graph's own capability observation is never execution-time evidence", () => {
  const g = basicGraph(), before = "2026-09-23T23:59:00.000Z";
  assert.ok(before < g.graph.capability.asOf);
  const lenient = { freshness: { maxSourceReceiptAgeMilliseconds: 900_000, maxCapabilityEvidenceAgeMilliseconds: 604_800_000 } };
  assert.equal(refusal(g, { policy: lenient, runtime: { observedAt: before } }), "runtime_attestation_stale");
  assert.equal(admissionOf(g, { policy: lenient, runtime: { observedAt: g.graph.capability.asOf } }).admission.runtime.observedAt, g.graph.capability.asOf);
});

test("owner review hard attack: forged trim or timebase authority changes the source computation and never survives DAG replay", () => {
  const d = dagOf(basicFinal()), drafts = redraft(d.dag), [index] = clipIndexes(d.dag) as [number], original = d.dag.nodes[index] as ClipNode;
  const clip = (mutate: (draft: ClipDraft) => void) => { const next = structuredClone(drafts); mutate(next[index] as ClipDraft); return next; };
  const frame = (c: ClipDraft, frameIndex: number) => ({ kind: "frame_pts" as const, frameIndex, evidence: { artifact: c.source.analysis, pointer: `/metadata/frameTimes/${frameIndex}` } });
  const endpoint = (c: ClipDraft, side: "startSeconds" | "endSeconds") => ({ kind: "candidate_endpoint" as const,
    evidence: { artifact: c.source.analysis, pointer: `/candidates/0/candidate/sourceRange/${side}` } });
  // Coherent forgeries are structurally valid, change the computation identity and fail replay from the admission.
  const coherent: Record<string, ExecutionDagNodeDraft[]> = {
    "start frame": clip(c => { c.source.trim.startAuthority = frame(c, 1); }),
    "end frame": clip(c => { c.source.trim.endAuthority = frame(c, 19); }),
    "frame-time table content": clip(c => { c.source.frameTimes = { ...c.source.frameTimes, tableId: `source_frame_times_v0_${"0".repeat(64)}` }; }),
    "frame-time table length": clip(c => { c.source.frameTimes = { ...c.source.frameTimes, count: 41 }; }),
    "frame_pts_exact stripped": clip(c => { c.source.trim = { ...c.source.trim, precision: "source_seconds", startAuthority: endpoint(c, "startSeconds"),
      endAuthority: endpoint(c, "endSeconds") }; }),
  };
  for (const [label, forged] of Object.entries(coherent)) {
    assert.notEqual(identifyDagNodes(forged, d.dag.settings)[index]!.computationId, original.computationId, label);
    assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, forged), d.artifacts)), "dag_replay_mismatch", label);
  }
  // Incoherent authority is structurally invalid.
  const incoherent: Record<string, ExecutionDagNodeDraft[]> = {
    "precision stripped alone": clip(c => { c.source.trim.precision = "source_seconds"; }),
    "frame index without its pointer": clip(c => { c.source.trim.endAuthority = { ...frame(c, 20), frameIndex: 21 }; }),
    "frame beyond the table": clip(c => { c.source.trim.endAuthority = frame(c, 40); }),
    "another timebase": clip(c => { c.source.trim.timebase = { ...c.source.trim.timebase, pointer: "/metadata/fps" }; }),
    "another analysis alone": clip(c => { c.source.analysis = { ...c.source.analysis, objectId: "gate7_analysis_other" }; }),
    "candidate endpoint on the wrong side": clip(c => { c.source.trim = { ...c.source.trim, precision: "source_seconds", startAuthority: endpoint(c, "endSeconds"),
      endAuthority: endpoint(c, "endSeconds") }; }),
  };
  for (const [label, forged] of Object.entries(incoherent)) assert.equal(errorCode(() => identifyDagNodes(forged, d.dag.settings)), "input_invalid", label);
  // Authority removed, then everything rehashed.
  for (const field of ["trim", "frameTimes"] as const) {
    assert.equal(errorCode(() => resealDag(d.dag, clip(c => { delete (c.source as Partial<ClipDraft["source"]>)[field]; }))), "input_invalid", field);
  }
  // The same forgeries inside a coordinated Gate-6 graph rehash fail graph replay.
  const g = basicGraph();
  assert.equal(refusal(forgedGraph(g, graph => { const s = graph.clipUses[0]!.source;
    s.startAuthority = { kind: "frame_pts", frameIndex: 1, evidence: { artifact: s.analysis, pointer: "/metadata/frameTimes/1" } }; })), "graph_replay_failed");
  assert.equal(refusal(forgedGraph(g, graph => { const s = graph.clipUses[0]!.source;
    s.precision = "source_seconds"; s.endAuthority = { kind: "candidate_endpoint", evidence: { artifact: s.analysis, pointer: "/candidates/0/candidate/sourceRange/endSeconds" } }; })),
    "graph_replay_failed");
  assert.equal(refusal(forgedGraph(g, graph => { delete (graph.clipUses[0]!.source as Partial<VideoSource>).timebase; })), "graph_replay_failed");
});

test("owner review hard attack: linked source-audio nodes carry the exact trim authority of their Gate-6 audio use", () => {
  const g = audioGraph(), d = dagOf(admissionOf(g)), audio = nodesOf(d.dag, "linked_source_audio");
  const uses = g.graph.clipUses.filter((u): u is Extract<EditGraph["clipUses"][number], { medium: "source_audio" }> => u.medium === "source_audio");
  assert.deepEqual(audio.map(n => n.clipUseId), uses.map(u => u.clipUseId));
  for (const node of audio) {
    const use = uses.find(u => u.clipUseId === node.clipUseId)!, video = nodesOf(d.dag, "source_video_clip").find(v => v.clipUseId === node.linkedVideoClipUseId)!;
    const { assetId: _assetId, sourceHash: _sourceHash, analysis: _analysis, range: _range, ...trim } = use.source;
    assert.deepEqual([node.source.range, node.source.trim, node.source.analysis], [use.source.range, trim, use.source.analysis]);
    assert.deepEqual([node.source.trim, node.source.frameTimes, node.source.receipt], [video.source.trim, video.source.frameTimes, video.source.receipt]);
  }
  assert.deepEqual(validateExecutionDag(d.dag, d.artifacts), d.dag);
  // A forged audio trim changes the audio computation and fails replay.
  const drafts = redraft(d.dag), index = d.dag.nodes.findIndex(n => n.kind === "linked_source_audio");
  const forged = structuredClone(drafts), source = (forged[index] as Extract<ExecutionDagNodeDraft, { kind: "linked_source_audio" }>).source;
  source.trim.startAuthority = { kind: "frame_pts", frameIndex: 1, evidence: { artifact: source.analysis, pointer: "/metadata/frameTimes/1" } };
  assert.notEqual(identifyDagNodes(forged, d.dag.settings)[index]!.computationId, d.dag.nodes[index]!.computationId);
  assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, forged), d.artifacts)), "dag_replay_mismatch");
});

test("owner review hard attack: a source-seconds trim keeps its weaker authority and cannot be upgraded", () => {
  const g = secondsGraph(), clip = videoUses(g.graph)[0]!;
  assert.deepEqual([clip.source.precision, clip.source.startAuthority.kind, clip.source.endAuthority.kind, clip.source.range],
    ["source_seconds", "candidate_endpoint", "candidate_endpoint", { start: instant(1, 20), end: instant(41, 20) }]);
  const d = dagOf(admissionOf(g)), [index] = clipIndexes(d.dag) as [number], node = d.dag.nodes[index] as ClipNode;
  const { assetId: _assetId, sourceHash: _sourceHash, analysis: _analysis, range: _range, ...trim } = clip.source;
  assert.deepEqual(node.source.trim, trim);
  const upgraded = redraft(d.dag), source = (upgraded[index] as ClipDraft).source;
  source.trim.precision = "frame_pts_exact";
  assert.equal(errorCode(() => identifyDagNodes(upgraded, d.dag.settings)), "input_invalid");
  const frame = (frameIndex: number) => ({ kind: "frame_pts" as const, frameIndex, evidence: { artifact: source.analysis, pointer: `/metadata/frameTimes/${frameIndex}` } });
  source.trim = { ...source.trim, startAuthority: frame(0), endAuthority: frame(20) };
  assert.notEqual(identifyDagNodes(upgraded, d.dag.settings)[index]!.computationId, node.computationId);
  assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, upgraded), d.artifacts)), "dag_replay_mismatch");
});

test("owner review hard attack: another analysis or another clip's boundary never passes as a source's trim authority", () => {
  const d = twoAssetDag(), drafts = redraft(d.dag), [aIndex, bIndex] = clipIndexes(d.dag) as [number, number];
  const a = drafts[aIndex] as ClipDraft, b = drafts[bIndex] as ClipDraft;
  // B's boundary under A's analysis: endpoint evidence from another analysis is structurally invalid.
  const borrowed = structuredClone(drafts);
  (borrowed[aIndex] as ClipDraft).source.trim = structuredClone(b.source.trim);
  assert.equal(errorCode(() => identifyDagNodes(borrowed, d.dag.settings)), "input_invalid");
  // B's boundary and analysis under A's asset, coherently rehashed: replay from the admission refuses.
  const relabeled = structuredClone(drafts);
  Object.assign((relabeled[aIndex] as ClipDraft).source, { analysis: b.source.analysis, trim: structuredClone(b.source.trim) });
  assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, relabeled), d.artifacts)), "dag_replay_mismatch");
  // Another analysis of A's bytes with identical PTS content: the same work, another occurrence, and still refused on replay.
  const rebased = structuredClone(drafts), other = { ...a.source.analysis, objectId: "gate7_analysis_rebased" }, t = (rebased[aIndex] as ClipDraft).source;
  const retarget = <E extends { evidence: { artifact: unknown; pointer: string } }>(e: E): E => ({ ...e, evidence: { ...e.evidence, artifact: other } });
  Object.assign(t, { analysis: other, trim: { ...t.trim, timebase: { ...t.trim.timebase, artifact: other }, startAuthority: retarget(t.trim.startAuthority),
    endAuthority: retarget(t.trim.endAuthority) } });
  const nodes = identifyDagNodes(rebased, d.dag.settings);
  assert.equal(nodes[aIndex]!.computationId, d.dag.nodes[aIndex]!.computationId);
  assert.notEqual(nodes[aIndex]!.nodeId, d.dag.nodes[aIndex]!.nodeId);
  assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, rebased), d.artifacts)), "dag_replay_mismatch");
  // Receipts swapped between the two source nodes.
  const swapped = structuredClone(drafts);
  (swapped[aIndex] as ClipDraft).source.receipt = b.source.receipt;
  (swapped[bIndex] as ClipDraft).source.receipt = a.source.receipt;
  assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, swapped), d.artifacts)), "dag_replay_mismatch");
  // Scope is occurrence and authority, never work: no node or setting carries a project, creator, purpose or scope field.
  const keys = allKeys([d.dag.nodes, d.dag.settings]);
  for (const key of ["scope", "projectId", "creatorId", "purpose"]) assert.equal(keys.has(key), false, key);
});

test("owner review hard attack: a variable-frame-rate table is bound by its exact PTS content, never collapsed onto uniform seconds", () => {
  const [uniform] = nodesOf(uniformFramesDag().dag, "source_video_clip"), [variable] = nodesOf(variableFramesDag().dag, "source_video_clip");
  assert.deepEqual([uniform!.source.range, uniform!.source.trim.precision], [variable!.source.range, variable!.source.trim.precision]);
  assert.deepEqual([uniform!.source.frameTimes.count, variable!.source.frameTimes.count], [40, 60]);
  assert.notEqual(uniform!.source.frameTimes.tableId, variable!.source.frameTimes.tableId);
  const table = (g: GraphFixture) => (g.artifacts.find(i => i.ref.objectId === videoUses(g.graph)[0]!.source.analysis.objectId)!.value as { metadata: { frameTimes: number[] } })
    .metadata.frameTimes;
  assert.equal(uniform!.source.frameTimes.tableId, identify("source_frame_times_v0", "tableId", { frameTimes: table(uniformFramesGraph()) }).tableId);
  assert.equal(variable!.source.frameTimes.tableId, identify("source_frame_times_v0", "tableId", { frameTimes: table(variableFramesGraph()) }).tableId);
  // The table identity is PTS content, independent of the analysis artifact that carries it.
  assert.notDeepEqual(nodesOf(twoAssetDag().dag, "source_video_clip")[0]!.source.analysis, uniform!.source.analysis);
  assert.equal(nodesOf(twoAssetDag().dag, "source_video_clip")[0]!.source.frameTimes.tableId, uniform!.source.frameTimes.tableId);
});

test("owner review hard attack: replaying admission and DAG any number of times never claims dispatch", () => {
  const a = basicFinal(), d = dagOf(a);
  for (let round = 0; round < 2; round++) {
    const admission = validateExecutionAdmission(a.admission, a.artifacts), dag = validateExecutionDag(d.dag, d.artifacts);
    assert.deepEqual([admission, dag, buildExecutionDag({ admission: a.admissionArtifact.ref }, a.artifacts)], [a.admission, d.dag, d.dag]);
    assert.deepEqual([admission.dispatch.state, dag.dispatch.state], ["not_claimed", "not_claimed"]);
  }
  // A second grant for the same reservation attempt admits too: admission is eligibility, never exclusivity.
  const regranted = dagOf(admissionOf(basicGraph(), { grant: { issuedAt: "2026-09-24T00:59:00.000Z" } }));
  assert.notEqual(regranted.admission.admissionId, a.admission.admissionId);
  const attempt = (dag: ExecutionDag) => { const { claimTargetId: _claimTargetId, ...key } = dag.dispatch.claimTarget; return key; };
  assert.deepEqual(regranted.dag.dispatch.claimTarget, d.dag.dispatch.claimTarget);
  assert.deepEqual(attempt(d.dag), { reservationId: a.chain.reservation.reservationId, operationId: OPERATION, attempt: 1 });
  assert.notEqual(regranted.dag.dispatch.renderBinding.renderComputationId, d.dag.dispatch.renderBinding.renderComputationId);
  assert.deepEqual([regranted.admission.dispatch.state, regranted.dag.dispatch.state], ["not_claimed", "not_claimed"]);
  // Gate-3 reservation replay is deterministic: replaying it again yields the same reservation, never a claim.
  const c = a.chain, replay = () => reserve({ scope: c.reservation.scope, budget: c.parent.value, budgetArtifact: c.reservation.budgetRef, allocation: c.allocation.value,
    allocationArtifact: c.reservation.allocationRef, historyArtifact: c.reservation.historyRef, operationId: OPERATION, attempt: 1 }, a.artifacts);
  assert.deepEqual([replay(), replay()], [c.reservation, c.reservation]);
});

test("owner review hard attack: no field implies dispatch permission, and legacy artifacts cannot supply a claim", () => {
  const a = basicFinal(), d = dagOf(a), keys = allKeys([a.admission, d.dag]);
  for (const key of ["claimed", "claimedAt", "claimedBy", "claimId", "claimant", "lease", "leaseId", "lock", "lockId", "dispatched", "dispatchedAt", "dispatchId", "workerId",
    "startedAt", "runId", "permission", "permitted", "authorizedToStart", "executionToken", "ready", "executionReady"]) assert.equal(keys.has(key), false, key);
  assert.deepEqual(allStrings([a.admission.dispatch, d.dag.dispatch]).filter(s => s.key === "state").map(s => s.text), ["not_claimed", "not_claimed"]);
  // Any other dispatch state or extra dispatch field is unrepresentable, even rehashed.
  for (const dispatch of [{ ...a.admission.dispatch, state: "claimed" }, { ...a.admission.dispatch, claimedBy: "worker_synthetic" }, { state: "not_claimed" }]) {
    const forged = rehashed(a.admission, { dispatch }, "admissionId", "execution_admission_v0");
    assert.equal(errorCode(() => validateExecutionAdmission(forged, a.artifacts)), "input_invalid", JSON.stringify(dispatch));
  }
  const otherComputation = `render_computation_identity_v0_${"0".repeat(64)}`;
  for (const dispatch of [{ ...d.dag.dispatch, state: "claimed" }, { ...d.dag.dispatch, claimedAt: T7.admitted },
    { ...d.dag.dispatch, renderBinding: { renderComputationId: otherComputation } }, { ...d.dag.dispatch, claimTarget: { ...d.dag.dispatch.claimTarget, attempt: 2 } }]) {
    assert.equal(errorCode(() => validateExecutionDag(rehashed(d.dag, { dispatch }, "dagId", "execution_dag_v0"), d.artifacts)), "input_invalid", JSON.stringify(dispatch));
  }
  // A coherently re-identified claim target for another reservation or attempt is well-formed but contradicts compilation from the admission.
  const { claimTargetId: _claimTargetId, ...target } = d.dag.dispatch.claimTarget;
  for (const other of [{ ...target, reservationId: budgetChain({ prefix: "gate7_other" }).reservation.reservationId }, { ...target, attempt: 2 }]) {
    const forged = rehashed(d.dag, { dispatch: { ...d.dag.dispatch, claimTarget: identify("execution_claim_target_v0", "claimTargetId", other) } }, "dagId", "execution_dag_v0");
    assert.equal(errorCode(() => validateExecutionDag(forged, d.artifacts)), "dag_replay_mismatch");
  }
  // Legacy job or render records are never consulted: supplying them changes nothing, and they cannot be passed as a claim.
  const f = createFixtures();
  const render = RenderResultSchema.parse({ contractType: "RenderResult", schemaVersion: "1.0.0", renderId: "render_claim", projectId: scope.projectId, jobId: "job_synthetic",
    planId: f.plan.planId, planRevision: 0, planDigest: "e".repeat(64), renderer: "dry_run_renderer", rendererVersion: "1.0.0", completedAt: T7.admitted,
    kind: "dry_run", status: "simulated", plannedDurationSeconds: 20, plannedClipCount: 2 });
  for (const item of [artifact("legacy_job_claim", "JobState", f.job, "1.0.0"), artifact("legacy_render_claim", "RenderResult", render, "1.0.0")]) {
    assert.deepEqual(admitExecution(a.request, [...a.artifacts, item]), a.admission, item.ref.artifactType);
    assert.deepEqual(buildExecutionDag({ admission: a.admissionArtifact.ref }, [...d.artifacts, item]), d.dag, item.ref.artifactType);
    assert.equal(errorCode(() => admitExecution({ ...a.request, claim: item.ref }, [...a.artifacts, item])), "input_invalid");
    assert.equal(errorCode(() => buildExecutionDag({ admission: a.admissionArtifact.ref, claim: item.ref }, [...d.artifacts, item])), "input_invalid");
  }
});

test("owner review hard attack: every Gate-6 operation is represented exactly once per target in the DAG, or admission refuses", () => {
  const cases = [[basicGraph(), dagOf(basicFinal())], [wholeColorGraph(), wholeColorDag()], [clipColorGraph(), clipColorDag()], [cutColorGraph(), cutColorDag()],
    [twoAssetGraph(), twoAssetDag()]] as const;
  for (const [g, d] of cases) assert.deepEqual(dagOperationTargets(d.dag), graphOperationTargets(g.graph));
  const operations = cutColorGraph().graph.operations, look = operations.find(o => o.primitive === "color_look");
  assert.deepEqual(operations.map(o => o.primitive).sort(), ["color_look", "cut_transition"]);
  assert.ok(look?.primitive === "color_look" && look.target.kind === "clip_uses" && look.target.clipUseIds.length === 2);
  assert.equal(dagOperationTargets(cutColorDag().dag).length, 3);
  // A cut dropped from its join, or a join naming an operation outside the graph, fails replay.
  const d = cutColorDag(), drafts = redraft(d.dag), sequence = d.dag.nodes.findIndex(n => n.kind === "cut_sequence");
  const withJoinOperation = (operation: unknown) => {
    const next = structuredClone(drafts), node = next[sequence] as Extract<ExecutionDagNodeDraft, { kind: "cut_sequence" }>;
    node.joins = node.joins.map(j => ({ ...j, operation })) as typeof node.joins;
    return next;
  };
  for (const operation of [missing("not_applicable", "v0_contiguous_placement_cut"), { state: "present", value: "operation_forged_cut" }]) {
    assert.equal(errorCode(() => validateExecutionDag(resealDag(d.dag, withJoinOperation(operation)), d.artifacts)), "dag_replay_mismatch", JSON.stringify(operation));
  }
  // An unknown operation beside valid ones: refused in the graph, in the DAG, and as a node draft.
  assert.equal(refusal(forgedGraph(cutColorGraph(), graph => {
    (graph.operations as unknown as Record<string, unknown>[]).push({ primitive: "gaussian_blur", parameters: { radius: 4 }, operationId: "operation_blur" });
  })), "graph_replay_failed");
  const blurred = structuredClone(d.dag) as unknown as { nodes: Record<string, unknown>[] };
  blurred.nodes.splice(sequence, 0, { kind: "gaussian_blur", nodeId: "node_blur", computationId: "computation_blur", inputs: [d.dag.nodes[0]!.nodeId], radius: 4 });
  assert.equal(errorCode(() => validateExecutionDag(blurred, d.artifacts)), "input_invalid");
  assert.equal(errorCode(() => identifyDagNodes([...drafts.slice(0, sequence), { kind: "gaussian_blur", inputs: [0] } as unknown as ExecutionDagNodeDraft], d.dag.settings)),
    "operation_not_executable");
});

// ---------------------------------------------------------------- final owner hardening (2026-09-25): regressions written before repair
const OTHER_ENVIRONMENT = "synthetic_local_other";
/** Coherent fresh capability evidence for the synthetic executor in another execution environment. */
const otherEnvironmentSnapshot = () => freshSnapshot([freshExecutorBody(declarations(), EXECUTOR, T7.capability, OTHER_ENVIRONMENT)], { environment: OTHER_ENVIRONMENT });
const UNSAFE_EXECUTOR_VERSIONS = ["C:\\render\\ffmpeg.exe", "/usr/bin/ffmpeg", "ffmpeg -y -i input output", "https://example.invalid/executor"];
/** Coordinated re-identification: coherent inputs whose selected executor is `executor` in the Gate-6 snapshot and in every Gate-7 artifact naming it. */
function withSelectedExecutor(g: GraphFixture, executor: typeof EXECUTOR) {
  const x = executionInputs(g, { snapshot: freshSnapshot([freshExecutorBody(declarations(), executor)]) });
  const runtime = rehashed(x.runtime, { executor }, "attestationId", "execution_runtime_attestation_v0") as unknown as typeof x.runtime;
  const estimate = rehashed(x.estimate, { executor }, "estimateId", "execution_work_estimate_v0") as unknown as typeof x.estimate;
  const runtimeArtifact = supplied(runtime, runtime.attestationId), estimateArtifact = supplied(estimate, estimate.estimateId);
  const grant = rehashed(x.grant, { executor, runtimeAttestation: runtimeArtifact.ref, workEstimate: estimateArtifact.ref }, "grantId", "execution_grant_v0") as unknown as typeof x.grant;
  const grantArtifact = supplied(grant, grant.grantId), replaced = new Set([x.runtimeArtifact, x.estimateArtifact, x.grantArtifact].map(a => a.ref.objectId));
  return { request: { ...x.request, executionGrant: grantArtifact.ref },
    artifacts: [...x.artifacts.filter(a => !replaced.has(a.ref.objectId)), runtimeArtifact, estimateArtifact, grantArtifact] };
}

test("final owner review: a work estimate made for one runtime build or environment never budgets another", () => {
  const g = basicGraph(), a = executionInputs(g), madeForA = { estimateRef: a.estimateArtifact.ref, extra: [a.estimateArtifact] };
  assert.equal(admissionOf(g, madeForA).admission.workload.estimate.objectId, a.estimateArtifact.ref.objectId);
  // Another exact runtime build, with its own valid attestation and every other authority coherent.
  for (const runtime of [{ ...RUNTIME, version: "0.2.0" }, { ...RUNTIME, implementationDigest: "e".repeat(64) }]) {
    assert.deepEqual(admissionOf(g, { runtime: { runtime } }).admission.runtime.identity, runtime);
    assert.equal(refusal(g, { ...madeForA, runtime: { runtime } }), "work_estimate_mismatch", JSON.stringify(runtime));
  }
  // Another execution environment, with coherent fresh capability and runtime evidence for it.
  assert.equal(admissionOf(g, { environment: OTHER_ENVIRONMENT, snapshot: otherEnvironmentSnapshot() }).admission.environment, OTHER_ENVIRONMENT);
  assert.equal(refusal(g, { ...madeForA, environment: OTHER_ENVIRONMENT, snapshot: otherEnvironmentSnapshot() }), "work_estimate_mismatch");
});

test("final owner review: a Gate-6 free-text executor version never enters Gate-7 execution authority or DAG state", () => {
  const g = basicGraph();
  for (const version of UNSAFE_EXECUTOR_VERSIONS) {
    const executor = { ...EXECUTOR, version }, x = withSelectedExecutor(g, executor);
    assert.equal(errorCode(() => admitExecution(x.request, x.artifacts)), "executor_not_execution_safe", version);
  }
  for (const version of ["0.1.0", "ffmpeg-9.0.1", "renderer_v1+cpu"]) {
    const executor = { ...EXECUTOR, version }, x = withSelectedExecutor(g, executor), admission = admitExecution(x.request, x.artifacts);
    const admissionArtifact = supplied(admission, admission.admissionId), dag = buildExecutionDag({ admission: admissionArtifact.ref }, [...x.artifacts, admissionArtifact]);
    assert.deepEqual([admission.executor, dag.executor, dag.settings.executor], [executor, executor, executor], version);
  }
});

test("final owner review: the atomic claim target is the reservation attempt only; the render computation is a separate binding", () => {
  const d = dagOf(basicFinal()), regranted = dagOf(admissionOf(basicGraph(), { grant: { issuedAt: "2026-09-24T00:59:00.000Z" } }));
  const [one, two] = [loose(d.dag.dispatch), loose(regranted.dag.dispatch)];
  assert.deepEqual([Object.keys(one).sort(), Object.keys(two).sort()], [["claimTarget", "renderBinding", "requirement", "state"], ["claimTarget", "renderBinding", "requirement", "state"]]);
  // Refined by the self-found claim-target red: the target names the reservation by its Gate-3 content identity, never by a storage reference.
  const attempt = { reservationId: d.admission.budget.reservationId, operationId: OPERATION, attempt: 1 };
  assert.deepEqual(one.claimTarget, { ...attempt, claimTargetId: identify("execution_claim_target_v0", "claimTargetId", attempt).claimTargetId });
  assert.deepEqual(two.claimTarget, one.claimTarget);
  assert.deepEqual([one.renderBinding, two.renderBinding], [{ renderComputationId: d.dag.renderIdentity.renderComputationId },
    { renderComputationId: regranted.dag.renderIdentity.renderComputationId }]);
  assert.notDeepEqual(one.renderBinding, two.renderBinding);
});

test("final owner review: node computation identities bind the execution environment", () => {
  const here = dagOf(basicFinal()).dag, there = dagOf(admissionOf(basicGraph(), { environment: OTHER_ENVIRONMENT, snapshot: otherEnvironmentSnapshot() })).dag;
  assert.deepEqual(there.nodes.map(n => n.kind), here.nodes.map(n => n.kind));
  for (const [i, node] of here.nodes.entries()) assert.notEqual(there.nodes[i]!.computationId, node.computationId, node.kind);
  assert.notEqual(there.renderIdentity.renderComputationId, here.renderIdentity.renderComputationId);
});

// ---------------------------------------------------------------- final owner hardening: adversarial self-review
const otherEnvironmentDag = () => memo("d_other_environment", () => dagOf(admissionOf(basicGraph(), { environment: OTHER_ENVIRONMENT, snapshot: otherEnvironmentSnapshot() })));

test("final owner hard attack: the estimate binds exact runtime and environment content, not chronology or an attestation reference", () => {
  const g = basicGraph(), a = executionInputs(g);
  assert.deepEqual([a.estimate.runtime, a.estimate.environment], [RUNTIME, ENVIRONMENT]);
  // Made before the runtime attestation was observed: legitimate, because it binds the exact runtime identity.
  const early = admissionOf(g, { estimate: { estimatedAt: "2026-09-24T00:40:00.000Z" } });
  assert.ok(early.estimate.estimatedAt < early.runtime.observedAt);
  assert.equal(early.admission.outcome, "admitted");
  // The same runtime build re-attested later: a new attestation reference, the same estimate still budgets it.
  const reattested = admissionOf(g, { runtime: { observedAt: "2026-09-24T00:51:00.000Z" }, estimateRef: a.estimateArtifact.ref, extra: [a.estimateArtifact] });
  assert.notDeepEqual(reattested.grant.runtimeAttestation, a.grant.runtimeAttestation);
  assert.deepEqual(reattested.admission.workload.estimate, a.estimateArtifact.ref);
  // An estimate made for another runtime or environment, supplied with the runtime and environment it was made for, still refuses here.
  const forB = executionInputs(g, { runtime: { runtime: { ...RUNTIME, version: "0.2.0" } } }), forOther = executionInputs(g, { environment: OTHER_ENVIRONMENT, snapshot: otherEnvironmentSnapshot() });
  for (const made of [forB, forOther]) {
    assert.equal(refusal(g, { estimateRef: made.estimateArtifact.ref, extra: [made.estimateArtifact] }), "work_estimate_mismatch", made.estimate.estimateId);
  }
  // Substituted estimate evidence: an authority artifact, foreign or unsupplied evidence, or other bytes under the exact evidence reference.
  for (const evidence of [[evidenceRef(a.runtimeArtifact)], [evidenceRef(a.snapshotArtifact)], [{ artifact: { ...a.estimateArtifact.ref, objectId: "gate7_unsupplied" }, pointer: "" }]]) {
    assert.equal(refusal(g, { estimate: { evidence } }), "input_invalid", JSON.stringify(evidence));
  }
  const foreignBasis = artifact("gate7_foreign_estimate_basis", "Evidence", { scope: FOREIGN, basis: "synthetic_foreign_estimate_basis" });
  assert.equal(refusal(g, { extra: [foreignBasis], estimate: { evidence: [evidenceRef(foreignBasis)] } }), "input_invalid");
  const swappedBasis = { ...artifact("gate7_estimate_basis", "Evidence", { scope, basis: "substituted_estimate_basis" }) };
  assert.equal(errorCode(() => admitExecution(a.request, a.artifacts.map(i => i.ref.objectId === "gate7_estimate_basis" ? { ...swappedBasis, ref: i.ref } : i))), "input_invalid");
  // Coordinated re-identification: the estimate rewritten for runtime B under the grant's exact estimate reference, or an admission re-pointed at it.
  const rewritten = rehashed(a.estimate, { runtime: { ...RUNTIME, version: "0.2.0" } }, "estimateId", "execution_work_estimate_v0") as unknown as typeof a.estimate;
  const rewrittenArtifact = supplied(rewritten, rewritten.estimateId);
  assert.equal(errorCode(() => admitExecution(a.request, a.artifacts.map(i => i.ref.objectId === a.estimateArtifact.ref.objectId ? { ...rewrittenArtifact, ref: i.ref } : i))),
    "input_invalid");
  const base = basicFinal(), repointed = rehashed(base.admission, { workload: { ...base.admission.workload, estimate: rewrittenArtifact.ref } }, "admissionId", "execution_admission_v0");
  assert.equal(errorCode(() => validateExecutionAdmission(repointed, [...base.artifacts, rewrittenArtifact])), "admission_replay_mismatch");
});

test("final owner hard attack: only execution-safe executor labels enter Gate 7; an unsafe unselected executor changes nothing", () => {
  const g = basicGraph(), x = executionInputs(g);
  // Paths, URLs, commands, whitespace, quotes, separators, a drive colon, a leading dot and a non-ASCII hyphen: Gate 6 accepts each, Gate 7 never.
  const unsafe = [...UNSAFE_EXECUTOR_VERSIONS, "..\\render", "renderer 1.0", "1.0\"", "1.0'", "1.0/2", "1.0:2", "1.0\t", ".hidden", "1.0‐beta"];
  const { grantId: _grantId, ...grantBody } = x.grant, { estimateId: _estimateId, ...estimateBody } = x.estimate;
  for (const version of unsafe) {
    const executor = { ...EXECUTOR, version }, forged = withSelectedExecutor(g, executor);
    assert.equal(errorCode(() => admitExecution(forged.request, forged.artifacts)), "executor_not_execution_safe", version);
    assert.equal(errorCode(() => createExecutionGrant({ ...grantBody, executor })), "input_invalid", version);
    assert.equal(errorCode(() => createExecutionWorkEstimate({ ...estimateBody, executor })), "input_invalid", version);
    assert.equal(errorCode(() => runtimeAttestation({ executor, profile: x.profile })), "input_invalid", version);
  }
  // A safe selected executor with a runtime attestation or estimate naming the unsafe build: each is refused as its own artifact.
  const unsafeExecutor = { ...EXECUTOR, version: "/usr/bin/ffmpeg" };
  const reissued = (patch: Record<string, unknown>, extra: SuppliedArtifact[]) => {
    const grant = rehashed(x.grant, patch, "grantId", "execution_grant_v0") as unknown as typeof x.grant, grantArtifact = supplied(grant, grant.grantId);
    return errorCode(() => admitExecution({ ...x.request, executionGrant: grantArtifact.ref }, [...x.artifacts, ...extra, grantArtifact]));
  };
  const unsafeRuntime = rehashed(x.runtime, { executor: unsafeExecutor }, "attestationId", "execution_runtime_attestation_v0") as unknown as typeof x.runtime;
  const unsafeRuntimeArtifact = supplied(unsafeRuntime, unsafeRuntime.attestationId);
  assert.equal(reissued({ runtimeAttestation: unsafeRuntimeArtifact.ref }, [unsafeRuntimeArtifact]), "runtime_attestation_invalid");
  const unsafeEstimate = rehashed(x.estimate, { executor: unsafeExecutor }, "estimateId", "execution_work_estimate_v0") as unknown as typeof x.estimate;
  const unsafeEstimateArtifact = supplied(unsafeEstimate, unsafeEstimate.estimateId);
  assert.equal(reissued({ workEstimate: unsafeEstimateArtifact.ref }, [unsafeEstimateArtifact]), "input_invalid");
  // Forged admission or DAG state naming an unsafe executor is unrepresentable even when rehashed.
  const d = dagOf(basicFinal());
  assert.equal(errorCode(() => validateExecutionAdmission(rehashed(d.admission, { executor: unsafeExecutor }, "admissionId", "execution_admission_v0"), d.artifacts)), "input_invalid");
  assert.equal(errorCode(() => validateExecutionDag(rehashed(d.dag, { executor: unsafeExecutor }, "dagId", "execution_dag_v0"), d.artifacts)), "input_invalid");
  // An unsafe executor that is not selected does not invalidate the safe selected one.
  const other = { executorId: "synthetic_unsafe_executor", version: "C:\\render\\ffmpeg.exe", implementationDigest: "f".repeat(64) };
  const mixed = freshSnapshot([freshExecutorBody(), freshExecutorBody(declarations(), other)]);
  assert.deepEqual(admissionOf(g, { snapshot: mixed }).admission.executor, EXECUTOR);
});

test("final owner hard attack: the claim target moves only with the reservation attempt, never with the render computation", () => {
  const base = dagOf(basicFinal()), g = basicGraph(), target = (d: { dag: ExecutionDag }) => d.dag.dispatch.claimTarget;
  const render = (d: { dag: ExecutionDag }) => d.dag.dispatch.renderBinding.renderComputationId;
  // Same attempt, same render: replay is identical.
  assert.deepEqual(dagOf(basicFinal()).dag.dispatch, base.dag.dispatch);
  // Same attempt, different render: a re-grant, a preview, another environment.
  for (const d of [dagOf(admissionOf(g, { grant: { issuedAt: "2026-09-24T00:59:00.000Z" } })), dagOf(basicPreview()), otherEnvironmentDag()]) {
    assert.deepEqual(target(d), target(base));
    assert.notEqual(render(d), render(base));
  }
  // Different attempt, operation or reservation: a different target.
  const attempts = [dagOf(admissionOf(g, { budget: { attempt: 2 }, grant: { attempt: 2 } })),
    dagOf(admissionOf(g, { budget: { operationId: "operation_render_other" }, grant: { operationId: "operation_render_other" } })),
    dagOf(admissionOf(g, { budget: { prefix: "gate7_alternate" } }))];
  assert.deepEqual(attempts.map(d => [d.admission.attempt, d.admission.operationId, d.admission.budget.reservation.objectId]),
    [[2, OPERATION, "gate7_reservation"], [1, "operation_render_other", "gate7_reservation"], [1, OPERATION, "gate7_alternate_reservation"]]);
  for (const d of attempts) assert.notEqual(target(d).claimTargetId, target(base).claimTargetId);
  assert.equal(new Set(attempts.map(d => target(d).claimTargetId)).size, 3);
  // A render-computation mutation re-identified through the whole DAG leaves the target untouched, and replay still refuses.
  const drafts = redraft(base.dag), [clip] = clipIndexes(base.dag) as [number], moved = resealDag(base.dag, shiftClip(drafts, clip));
  assert.notEqual(moved.dispatch.renderBinding.renderComputationId, render(base));
  assert.deepEqual(moved.dispatch.claimTarget, target(base));
  assert.equal(errorCode(() => validateExecutionDag(moved, base.artifacts)), "dag_replay_mismatch");
  // The target identity is exactly the attempt's content identity: any other derivation is structurally invalid.
  const { claimTargetId: _claimTargetId, ...attempt } = target(base);
  assert.equal(target(base).claimTargetId, identify("execution_claim_target_v0", "claimTargetId", attempt).claimTargetId);
  const withRender = identify("execution_claim_target_v0", "claimTargetId", { ...attempt, renderComputationId: render(base) }).claimTargetId;
  assert.equal(errorCode(() => validateExecutionDag(rehashed(base.dag, { dispatch: { ...base.dag.dispatch, claimTarget: { ...target(base), claimTargetId: withRender } } },
    "dagId", "execution_dag_v0"), base.artifacts)), "input_invalid");
});

test("final owner hard attack: a relabeled or reformatted copy of one reservation shares its claim target", () => {
  const base = dagOf(basicFinal()), reservation = base.chain.reservation;
  const relabeled = artifact("gate7_reservation_relabeled", "Reservation", reservation);
  const bytes = new TextEncoder().encode(JSON.stringify(reservation, null, 2));
  const reformatted: SuppliedArtifact = { ref: { ...base.chain.reservationArtifact.ref, objectId: "gate7_reservation_reformatted", sha256: exactDigest(bytes) },
    value: reservation, bytes };
  for (const copy of [relabeled, reformatted]) {
    const d = dagOf(admissionOf(basicGraph(), { extra: [copy], budgetRefs: { reservation: copy.ref } }));
    assert.deepEqual(d.admission.budget.reservation, copy.ref, copy.ref.objectId);
    assert.notEqual(d.dag.dispatch.renderBinding.renderComputationId, base.dag.dispatch.renderBinding.renderComputationId);
    assert.deepEqual(d.dag.dispatch.claimTarget, base.dag.dispatch.claimTarget, copy.ref.objectId);
  }
});

test("final owner hard attack: an environment relabel never reuses work and never survives replay", () => {
  const here = dagOf(basicFinal()), there = otherEnvironmentDag();
  // Same exact settings and environment: deterministic identities.
  assert.deepEqual(dagOf(basicFinal()).dag.nodes, here.dag.nodes);
  assert.deepEqual(dagOf(admissionOf(basicGraph(), { environment: OTHER_ENVIRONMENT, snapshot: otherEnvironmentSnapshot() })).dag.nodes, there.dag.nodes);
  assert.deepEqual([here.dag.settings.environment, there.dag.settings.environment], [here.admission.environment, there.admission.environment]);
  for (const [i, node] of here.dag.nodes.entries()) assert.notEqual(there.dag.nodes[i]!.nodeId, node.nodeId, node.kind);
  // Relabel the settings' environment and reseal every node, the render identity and the DAG: replay from the admission refuses.
  const relabeled = resealDag(here.dag, redraft(here.dag), { ...here.dag.settings, environment: OTHER_ENVIRONMENT });
  assert.deepEqual(relabeled.nodes.map(n => n.computationId), there.dag.nodes.map(n => n.computationId));
  assert.equal(errorCode(() => validateExecutionDag(relabeled, here.artifacts)), "dag_replay_mismatch");
  // A relabeled admission environment contradicts its grant on replay.
  const admission = rehashed(here.admission, { environment: OTHER_ENVIRONMENT }, "admissionId", "execution_admission_v0");
  assert.equal(errorCode(() => validateExecutionAdmission(admission, here.artifacts)), "admission_replay_mismatch");
});
