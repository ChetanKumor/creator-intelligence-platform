import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { UniversalEditPlanSchema } from "../packages/contracts/index.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { EditorialArtifactMap, identify, missing, present, type SuppliedArtifact } from "../packages/editorial/common.js";
import { EditGraphError, EditGraphSchema, TechniqueResolutionSchema, UepCompatibilityReportSchema, assessUepCompatibility, buildEditGraph, createCapabilitySnapshot, supplied,
  validateEditGraph, validateUepCompatibilityReport, type EditGraph } from "../packages/edit-graph/index.js";
import { createFixtures } from "../samples/fixtures.js";
import { directionFixture } from "./support/planning.js";
import { EXECUTOR, TIME6, VIDEO_SUPPORTS, artifact, atMost, attestation, capabilitySnapshot, chosenOption, colorLook, conformance, conformanceRefs, cutAt, declaration,
  declarations, executorBody, failedAttempt, graphInputs, graphOf, member, operationNode, outputProfile, plan, planningFixture, planningPolicyBody, projectionPolicy,
  repeatedUses, reportOf, resolution, resources, scope, singleUse, unavailableRefs, variantDirectionFixture, videoUses, withDirection, type DirectionNode, type Planned,
  type PlanningFixture } from "./support/edit-graph.js";

// ---------------------------------------------------------------- helpers
function reidentify<T extends object>(value: T, key: string, namespace: string) {
  const body = { ...value } as Record<string, unknown>;
  delete body[key];
  return identify(namespace, key, body);
}
function errorCode(run: () => unknown): string {
  try { run(); } catch (error) {
    assert.ok(error instanceof EditGraphError, `expected an owned EditGraphError, received ${String(error)}`);
    return error.code;
  }
  assert.fail("expected an owned EditGraphError");
}
/** Forgeries may fail structural identity checks or semantic replay; both are rejections, never acceptance. */
function rejectsForgery(run: () => unknown): void {
  const code = errorCode(run);
  assert.ok(["input_invalid", "graph_replay_mismatch", "report_replay_mismatch"].includes(code), code);
}
const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
function allKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) allKeys(item, keys);
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); allKeys(child, keys); }
  return keys;
}
const same = (a: unknown, b: unknown) => canonicalSerialize(a) === canonicalSerialize(b);
function mappingOf(report: { mapping: { graphNode: { id: string }; projection: unknown }[] }, id: string) {
  return report.mapping.find(m => m.graphNode.id === id)!.projection;
}
function dimension(report: { dimensions: { dimension: string; state: string; findings: { code: string; subjects: string[]; evidence: { pointer: string }[] }[] }[] }, name: string) {
  return report.dimensions.find(d => d.dimension === name)!;
}
/** Capability readiness only; overall execution readiness additionally needs budget feasibility no V0 artifact proves. */
const capabilityState = (graph: EditGraph) => graph.executability.capability.state;
function capabilityBlocking(graph: EditGraph) {
  const capability = graph.executability.capability;
  return capability.state === "capability_not_ready" ? capability.blocking : [];
}
const BUDGET_BLOCKER = { code: "budget_feasibility_unverified", subjectId: "execution_budget" } as const;
function mergeArtifacts(...groups: SuppliedArtifact[][]): SuppliedArtifact[] {
  const merged = new Map<string, SuppliedArtifact>();
  for (const group of groups) for (const item of group) if (!merged.has(item.ref.objectId)) merged.set(item.ref.objectId, item);
  return [...merged.values()];
}
/**
 * PROBE ONLY. The frozen UEP schema is used as an arithmetic oracle for the timeline-subset classification. The
 * placeholders below fill exactly the fields the production report marks unavailable (identity, telemetry, confidence,
 * creation time). The probe is discarded: it is never validated with inputs, emitted, or treated as a projection.
 */
const PROBE_PLACEHOLDER_NOT_EVIDENCE = 0;
function probePlan(graph: EditGraph) {
  const tps = graph.output.clock.ticksPerSecond;
  return { contractType: "UniversalEditPlan", schemaVersion: "1.0.0", planId: "probe_plan_not_evidence", projectId: graph.scope.projectId, revision: 0, parentPlanId: null,
    output: { aspectRatio: "9:16", resolution: graph.output.resolution, fps: graph.output.frameRate, targetDurationSeconds: graph.output.durationTicks / tps },
    clips: videoUses(graph).map((clip, i) => ({ clipId: `probe_clip_${i}`, segmentId: `probe_segment_${i}`, assetId: clip.source.assetId, sourceRange: clip.source.range,
      outputStartSeconds: clip.output.startTicks / tps, role: "hook", speed: 1, transform: { fit: "cover", focalPoint: { x: 0.5, y: 0.5 }, scale: 1 }, sourceAudioGain: 0,
      transitionOut: { type: "cut" }, reason: "probe placeholder", confidence: PROBE_PLACEHOLDER_NOT_EVIDENCE, decisionId: `probe_decision_${i}` })),
    music: null, captions: [], overlays: [], effects: [],
    metadata: { planner: "probe", plannerVersion: "probe", modelRunIds: [], referenceFingerprintId: null, createdAt: TIME6 } };
}

// ---------------------------------------------------------------- memoized synthetic Gate-5 decisions
const basic = () => memo("basic", () => plan(planningFixture()));
const uep = (uses: number) => memo(`uep_${uses}`, () => plan(planningFixture(repeatedUses(uses))));
const offGrid = () => memo("off_grid", () => plan(planningFixture({ duration: { minimumSeconds: 1, maximumSeconds: 2, preferredSeconds: 2 },
  search: { ...planningPolicyBody.search, maximumDepth: 1 } }, directionFixture(0, false, { startSeconds: 0.13, endSeconds: 1.97 }))));
function withOperations(key: string, operations: (x: PlanningFixture) => DirectionNode[], patch: Record<string, unknown> = repeatedUses(8)): Planned {
  return memo(key, () => {
    const x = planningFixture(patch);
    return plan(withDirection(x, { nodes: [x.source.direction.nodes[0]!, ...operations(x)] }));
  });
}
const warm = () => withOperations("warm", x => [operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Warm the whole edit." })]);
const warmResolved = () => { const p = warm(); return { p, r: resolution(p, "node_color", "color_intention", colorLook("warm")) }; };
const colorAndCut = () => withOperations("color_and_cut", x => [
  operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Warm the whole edit." }),
  operationNode(x, "node_cut", { kind: "transition_intention", relation: "clear_change", description: "A clear change." })]);
const colorAndCutResolutions = (p: Planned) => [resolution(p, "node_color", "color_intention", colorLook("warm")), resolution(p, "node_cut", "transition_intention", cutAt(p, 0))];
const boundColor = () => memo("bound_color", () => {
  const x = planningFixture(singleUse), hook = x.source.direction.nodes[0]!;
  return plan(withDirection(x, { nodes: [hook, { ...hook, nodeId: "node_color", intent: { kind: "color_intention", mood: "warm", description: "Warm the bound source." }, requirementIds: [] }] }));
});
const fullColorSupports = [member("look", "neutral", "warm", "cool"), member("target_kind", "whole_output", "clip_uses")];
/** The frozen synthetic 1.0.0 reference (asset_reference, 20 s, no audio) and its in-scope source asset from samples/fixtures.ts. */
const referenceFixtures = () => {
  const f = createFixtures();
  return { reference: artifact("reference_v10", "ReferenceFingerprint", f.reference, "1.0.0"), asset: f.assets.find(a => a.assetId === f.reference.assetId)!, audio: f.audio };
};

// ---------------------------------------------------------------- 1-9 graph construction and time authority
test("a chosen Gate-5 decision becomes an initial EditGraph with exact clip-use lineage", () => {
  const p = basic(), g = graphOf(p), graph = g.graph, option = chosenOption(p);
  assert.equal(graph.artifactType, "EditGraph");
  assert.equal(graph.revision, 0);
  assert.deepEqual(graph.parent, { state: "not_applicable", reasonCode: "initial_graph", evidenceRefs: [] });
  assert.deepEqual(graph.scope, p.run.decision.scope);
  assert.deepEqual(graph.lineage, { planningDecision: p.decisionRef, searchRun: p.run.decision.searchRun, alternatives: p.run.decision.alternativesConsidered,
    context: p.run.decision.contextSnapshot, chosenOptionId: option.optionId, direction: p.run.decision.direction, worldSnapshot: p.context.worldSnapshot,
    worldView: p.context.worldView, candidateUniverse: p.run.decision.candidateUniverse });
  const video = videoUses(graph);
  assert.equal(video.length, option.uses.length);
  video.forEach((clip, position) => {
    const use = option.uses[position]!;
    assert.deepEqual(clip.planningUse, { decision: p.decisionRef, optionId: option.optionId, useId: use.useId, position });
    assert.equal(clip.candidateId, use.candidateId);
    assert.deepEqual(clip.token, use.token);
    assert.equal(clip.directionNodeId, use.directionNodeId);
    assert.equal(clip.source.boundaryId, use.boundary.boundaryId);
    assert.equal(clip.source.assetId, use.boundary.assetId);
    assert.equal(clip.source.sourceHash, use.boundary.sourceHash);
    assert.deepEqual(clip.source.analysis, use.boundary.analysis);
  });
  assert.deepEqual(validateEditGraph(graph, g.artifacts), graph);
  assert.equal(capabilityState(graph), "capability_ready");
  assert.equal(graph.executability.state, "not_execution_ready");
});

for (const [name, make] of [
  ["tie", () => plan(planningFixture({ duration: { minimumSeconds: 1.5, maximumSeconds: 1.5, preferredSeconds: 1.5 } }))],
  ["abstained", () => plan(planningFixture({}, directionFixture(0, false, undefined, false, true)))],
  ["infeasible", () => plan(planningFixture({ duration: { minimumSeconds: 5, maximumSeconds: 5, preferredSeconds: 5 }, search: { ...planningPolicyBody.search, maximumDepth: 1 } }))],
] as const) test(`a ${name} Gate-5 outcome cannot become an EditGraph or an invented winner`, () => {
  const p = memo(name, make);
  assert.equal(p.run.decision.outcome.kind, name);
  const inputs = graphInputs(p);
  assert.equal(errorCode(() => buildEditGraph(inputs.request, inputs.artifacts)), "planning_outcome_not_chosen");
});

test("forged or substituted chosen options cannot pass Gate-5 replay", () => {
  const forge = (p: Planned, patch: Record<string, unknown>, replacements: SuppliedArtifact[] = []) => {
    const decision = reidentify({ ...p.run.decision, ...patch }, "planningDecisionId", "planning_decision_v0");
    const decisionArtifact = artifact(decision.planningDecisionId as string, "PlanningDecision", decision);
    const all = [...p.all.filter(a => !replacements.some(r => r.ref.objectId === a.ref.objectId)), ...replacements, decisionArtifact];
    const inputs = graphInputs({ ...p, decisionRef: decisionArtifact.ref, all });
    return errorCode(() => buildEditGraph(inputs.request, inputs.artifacts));
  };
  const tie = memo("tie", () => plan(planningFixture({ duration: { minimumSeconds: 1.5, maximumSeconds: 1.5, preferredSeconds: 1.5 } })));
  const outcome = tie.run.decision.outcome;
  assert.equal(outcome.kind, "tie");
  if (outcome.kind !== "tie") return;
  assert.equal(forge(tie, { outcome: { kind: "chosen", optionId: outcome.optionIds[0]! } }), "planning_lineage_invalid");
  const p = basic();
  assert.equal(forge(p, { outcome: { kind: "chosen", optionId: "not_generated" } }), "planning_lineage_invalid");
  const other = p.run.manifest.options.find(e => e.selection === "retained" && e.option.optionId !== chosenOption(p).optionId)!;
  const forgedRun = reidentify({ ...p.run.searchRun, outcome: { kind: "chosen", optionId: other.option.optionId } }, "searchRunId", "planning_search_run_v0");
  const forgedRunArtifact = artifact(p.run.decision.searchRun.objectId, "PlanningSearchRun", forgedRun);
  assert.equal(forge(p, { searchRun: forgedRunArtifact.ref, outcome: { kind: "chosen", optionId: other.option.optionId } }, [forgedRunArtifact]), "planning_lineage_invalid");
});

test("the exact Gate-5 source range, precision and endpoint authority are preserved", () => {
  const p = offGrid(), use = chosenOption(p).uses[0]!, clip = videoUses(graphOf(p).graph)[0]!;
  assert.deepEqual(clip.source.range, { startSeconds: 0.13, endSeconds: 1.97 });
  assert.deepEqual(clip.source.range, use.boundary.sourceRange);
  assert.equal(clip.source.precision, "source_seconds");
  assert.equal(clip.source.startAuthority.kind, "candidate_endpoint");
  assert.deepEqual(clip.source.startAuthority, use.boundary.startAuthority);
  assert.deepEqual(clip.source.endAuthority, use.boundary.endAuthority);
  assert.deepEqual(clip.source.timebase, use.boundary.timebase);
  const exact = videoUses(graphOf(basic()).graph)[0]!;
  assert.equal(exact.source.precision, "frame_pts_exact");
  assert.deepEqual(exact.source.range, { startSeconds: 0, endSeconds: 2 });
});

test("the output clock is an exact tick authority separate from source seconds", () => {
  const p = offGrid(), g = graphOf(p, { profile: { clock: { ticksPerSecond: 1000 } } }), clip = videoUses(g.graph)[0]!;
  assert.deepEqual(clip.output, { startTicks: 0, endTicks: 1840 });
  assert.deepEqual(clip.mapping, { kind: "constant_speed_identity", rate: { numerator: 1, denominator: 1 }, sourceStartTicks: 130, sourceEndTicks: 1970,
    exactness: "source_endpoints_exact_on_output_clock" });
  assert.deepEqual(g.graph.output.clock, { ticksPerSecond: 1000 });
  assert.equal(g.graph.output.durationTicks, 1840);
  assert.equal(g.graph.output.frameAlignment, "not_asserted");
  const fine = graphOf(p);
  assert.deepEqual(videoUses(fine.graph)[0]!.source.range, clip.source.range);
  assert.equal(fine.graph.output.durationTicks, 1_840_000_000);
  // A coarser clock cannot represent 0.13 s exactly: refusal, never rounding a trusted source instant.
  assert.equal(errorCode(() => graphOf(p, { profile: { clock: { ticksPerSecond: 10 } } })), "time_not_representable");
});

test("repeated candidate occurrences keep distinct identities on a contiguous output clock", () => {
  const g = graphOf(uep(8)), video = videoUses(g.graph);
  assert.equal(video.length, 8);
  assert.equal(new Set(video.map(c => c.clipUseId)).size, 8);
  assert.equal(new Set(video.map(c => c.planningUse.useId)).size, 8);
  assert.equal(new Set(video.map(c => c.candidateId)).size, 1);
  video.forEach((clip, i) => assert.deepEqual(clip.output, { startTicks: i * 2e9, endTicks: (i + 1) * 2e9 }));
  assert.equal(g.graph.output.durationTicks, 16e9);
  assert.deepEqual(g.graph.tracks.map(t => [t.kind, t.order, t.overlap]), [["video", 0, "forbidden"]]);
});

test("output overlap, gaps and reused occurrence identities are rejected even after rehash", () => {
  const g = graphOf(uep(8)), graph = g.graph, second = videoUses(graph)[1]!;
  const moved = (delta: number) => graph.clipUses.map(c => c.clipUseId === second.clipUseId
    ? { ...c, output: { startTicks: c.output.startTicks + delta, endTicks: c.output.endTicks + delta } } : c);
  const duplicate = graph.clipUses.map(c => c.clipUseId === second.clipUseId ? { ...c, clipUseId: videoUses(graph)[0]!.clipUseId } : c);
  for (const clipUses of [moved(-1e9), moved(1e9), duplicate]) {
    const forged = reidentify({ ...graph, clipUses }, "editGraphId", "edit_graph_v0");
    assert.equal(EditGraphSchema.safeParse(forged).success, false);
    assert.equal(errorCode(() => validateEditGraph(forged, g.artifacts)), "input_invalid");
  }
});

// ---------------------------------------------------------------- 10-11 obligations and prose
test("deferred operation obligations never disappear and keep explicit dispositions", () => {
  const p = withOperations("mixed_operations", x => [
    operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Warm the whole edit." }),
    operationNode(x, "node_sound", { kind: "sound_design_intention", relation: "emphasize", description: "Emphasis." }, "soft"),
    operationNode(x, "node_title", { kind: "graphics_intention", role: "clarify", description: "A title." })]);
  const deferred = p.run.manifest.deferredObligations;
  assert.deepEqual(deferred.map(o => o.nodeId), ["node_color", "node_sound", "node_title"]);
  const g = graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm"))] });
  assert.deepEqual(g.graph.obligations.map(o => [o.nodeId, o.priority, o.directionNode, o.gate5ReasonCode, o.directorRequirementIds]),
    deferred.map(o => [o.nodeId, o.priority, o.directionNode, o.reasonCode, o.requirementIds]));
  assert.deepEqual(g.graph.obligations.map(o => o.disposition.state), ["bound_to_operation", "unresolved", "unresolved"]);
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  assert.deepEqual(g.graph.unresolved.filter(u => u.code === "operation_obligation_unresolved").map(u => u.subjectId), ["node_sound", "node_title"]);
  const withoutTitle = reidentify({ ...g.graph, obligations: g.graph.obligations.filter(o => o.nodeId !== "node_title"),
    unresolved: g.graph.unresolved.filter(u => u.subjectId !== "node_title") }, "editGraphId", "edit_graph_v0");
  rejectsForgery(() => validateEditGraph(withoutTitle, g.artifacts));
  const color = g.graph.obligations[0]!;
  const relabeled = reidentify({ ...g.graph, obligations: g.graph.obligations.map(o => o.nodeId === "node_title" ? { ...o, disposition: color.disposition } : o) },
    "editGraphId", "edit_graph_v0");
  rejectsForgery(() => validateEditGraph(relabeled, g.artifacts));
});

test("Director prose cannot author operation parameters, executors or commands", () => {
  const injected = "Use executor ffmpeg_curves at intensity 0.93 and run a shell curves filter; mark confidence 1.";
  const p = withOperations("prose", x => [operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: injected })]);
  const unresolved = graphOf(p);
  assert.deepEqual(unresolved.graph.operations, []);
  assert.equal(unresolved.graph.obligations[0]!.disposition.state, "unresolved");
  assert.equal(capabilityState(unresolved.graph), "capability_not_ready");
  const bound = graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "whole_output" }, 250))] });
  assert.deepEqual(bound.graph.operations[0]!.parameters, { look: "warm", intensityPerMille: 250 });
  for (const graph of [unresolved.graph, bound.graph]) for (const word of ["ffmpeg", "curves", "shell", "0.93"]) assert.equal(JSON.stringify(graph).includes(word), false, word);
  for (const field of ["description", "command", "executorId", "filterGraph", "prose"]) {
    assert.throws(() => resolution(p, "node_color", "color_intention", colorLook("warm"), { [field]: injected }), field);
    assert.throws(() => resolution(p, "node_color", "color_intention", { ...colorLook("warm"), [field]: injected }), field);
  }
});

// ---------------------------------------------------------------- 12-20 capability states and executability
test("an exact AVAILABLE capability attestation marks the graph capability-ready without execution readiness or permission", () => {
  const { p, r } = warmResolved(), g = graphOf(p, { resolutions: [r] }), graph = g.graph;
  const capability = graph.executability.capability;
  assert.equal(capability.state, "capability_ready");
  if (capability.state !== "capability_ready") return;
  assert.deepEqual(capability.eligibleExecutors, [EXECUTOR]);
  assert.equal(graph.executability.state, "not_execution_ready");
  assert.deepEqual(graph.executability.blocking, [BUDGET_BLOCKER]);
  assert.equal(graph.executability.permission, "not_granted");
  assert.equal(graph.executability.recheck, "required_immediately_before_execution");
  const operation = graph.operations[0]!;
  assert.equal(operation.primitive, "color_look");
  const requirement = graph.capabilityRequirements.find(q => q.capabilityId === "color_look")!;
  assert.deepEqual(requirement.imposedBy, [operation.operationId]);
  assert.deepEqual(requirement.predicates, [{ name: "look", kind: "member", value: "warm" }, { name: "target_kind", kind: "member", value: "whole_output" }]);
  const assessment = graph.capability.assessments.find(a => a.requirementId === requirement.requirementId)!;
  assert.equal(assessment.state, "AVAILABLE");
  assert.deepEqual(assessment.executors.map(e => [e.executor, e.state, e.reasonCode, e.unmet]), [[EXECUTOR, "AVAILABLE", "all_predicates_proven", []]]);
  assert.deepEqual(assessment.executors[0]!.declaration, present({ artifact: g.request.capabilitySnapshot, pointer: "/executors/0/declarations/0" }));
  assert.deepEqual(assessment.executors[0]!.attestation, present(g.snapshot.executors[0]!.declarations[0]!.attestation));
  assert.equal(g.snapshot.executors[0]!.declarations[0]!.capabilityId, "color_look");
  assert.ok(graph.capability.assessments.every(a => a.state === "AVAILABLE"));
  assert.deepEqual(graph.capability.snapshot, g.request.capabilitySnapshot);
});

for (const [state, reasonCode, color] of [
  ["PARTIAL", "predicates_unmet", declaration("color_look", [member("look", "cool"), member("target_kind", "whole_output", "clip_uses")])],
  ["UNAVAILABLE", "unconfigured", declaration("color_look", fullColorSupports, { state: "unavailable", reasonCode: "unconfigured", nextCheckAfter: TIME6, evidence: unavailableRefs })],
  ["UNAVAILABLE", "license_ineligible_for_purpose", declaration("color_look", fullColorSupports, undefined, ["local_footage_analysis"])],
  ["UNSUPPORTED", "capability_not_declared", null],
  ["FAILED", "probe_rejected", declaration("color_look", fullColorSupports, { state: "failed", failureCode: "probe_rejected", attempt: [{ artifact: failedAttempt.ref, pointer: "" }] })],
] as const) test(`${state} (${reasonCode}) capability never becomes capability or execution readiness`, () => {
  const { p, r } = warmResolved();
  const g = graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot([executorBody(declarations({ color_look: color }))]) });
  const requirement = g.graph.capabilityRequirements.find(q => q.capabilityId === "color_look")!;
  const assessment = g.graph.capability.assessments.find(a => a.requirementId === requirement.requirementId)!;
  assert.equal(assessment.state, state);
  assert.equal(assessment.executors[0]!.state, state);
  assert.equal(assessment.executors[0]!.reasonCode, reasonCode);
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  assert.deepEqual(capabilityBlocking(g.graph), [{ code: "capability_not_available", subjectId: requirement.requirementId }]);
  assert.deepEqual(g.graph.executability.blocking, [BUDGET_BLOCKER, { code: "capability_not_available", subjectId: requirement.requirementId }]);
  assert.ok(g.graph.capability.assessments.filter(a => a.requirementId !== requirement.requirementId).every(a => a.state === "AVAILABLE"));
  if (state === "PARTIAL") assert.deepEqual(assessment.executors[0]!.unmet, [{ name: "look", kind: "member", value: "warm" }]);
  if (state === "UNSUPPORTED") assert.equal(assessment.executors[0]!.declaration.state, "not_applicable");
});

test("capability proof cannot be moved to another requirement, executor, snapshot or scope", () => {
  const { p, r } = warmResolved();
  const partial = capabilitySnapshot([executorBody(declarations({ color_look: declaration("color_look", [member("look", "cool"), member("target_kind", "whole_output")]) }))]);
  const g = graphOf(p, { resolutions: [r], snapshot: partial }), graph = g.graph;
  const colorIndex = graph.capability.assessments.findIndex(a => graph.capabilityRequirements.find(q => q.requirementId === a.requirementId)!.capabilityId === "color_look");
  const upgraded = graph.capability.assessments.map((a, i) => i === colorIndex
    ? { ...a, state: "AVAILABLE", executors: a.executors.map(e => ({ ...e, state: "AVAILABLE", reasonCode: "all_predicates_proven", unmet: [] })) } : a);
  const executable = { ...graph.executability, capability: { state: "capability_ready", eligibleExecutors: [EXECUTOR] }, blocking: [BUDGET_BLOCKER] };
  rejectsForgery(() => validateEditGraph(reidentify({ ...graph, capability: { ...graph.capability, assessments: upgraded }, executability: executable }, "editGraphId", "edit_graph_v0"), g.artifacts));
  const borrowed = upgraded.map((a, i) => i === colorIndex
    ? { ...a, executors: a.executors.map(e => ({ ...e, declaration: present({ artifact: g.request.capabilitySnapshot, pointer: "/executors/0/declarations/2" }) })) } : a);
  rejectsForgery(() => validateEditGraph(reidentify({ ...graph, capability: { ...graph.capability, assessments: borrowed }, executability: executable }, "editGraphId", "edit_graph_v0"), g.artifacts));
  const full = capabilitySnapshot(), fullArtifact = supplied(full, full.snapshotId);
  rejectsForgery(() => validateEditGraph(reidentify({ ...graph, capability: { ...graph.capability, snapshot: fullArtifact.ref, assessments: upgraded }, executability: executable },
    "editGraphId", "edit_graph_v0"), [...g.artifacts, fullArtifact]));
  rejectsForgery(() => validateEditGraph(reidentify({ ...graph, capability: { ...graph.capability, assessments: upgraded },
    executability: { ...executable, capability: { state: "capability_ready", eligibleExecutors: [{ ...EXECUTOR, implementationDigest: "c".repeat(64) }] } } }, "editGraphId", "edit_graph_v0"), g.artifacts));
  for (const field of ["projectId", "creatorId", "purpose"] as const) {
    assert.equal(errorCode(() => graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot(undefined, { scope: { ...scope, [field]: "foreign_scope" } }) })), "scope_mismatch");
  }
  const dangling = capabilitySnapshot([executorBody(declarations({ color_look: declaration("color_look", fullColorSupports,
    { state: "available", evidence: [{ artifact: { ...conformance.ref, objectId: "missing_evidence" }, pointer: "" }] }) }))]);
  assert.equal(errorCode(() => graphOf(p, { resolutions: [r], snapshot: dangling })), "capability_snapshot_invalid");
  assert.throws(() => capabilitySnapshot([executorBody(declarations({ color_look: declaration("color_look", fullColorSupports, { state: "available", evidence: [] }) }))]));
});

test("unresolved hard or soft operations keep the graph non-executable without a relaxation policy", () => {
  const p = withOperations("unresolved_operations", x => [operationNode(x, "node_title", { kind: "graphics_intention", role: "clarify", description: "A title." }),
    operationNode(x, "node_sound", { kind: "sound_design_intention", relation: "restrain", description: "Quiet." }, "soft")]);
  const g = graphOf(p);
  assert.ok(g.graph.capability.assessments.every(a => a.state === "AVAILABLE"));
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  assert.deepEqual(capabilityBlocking(g.graph).map(b => [b.code, b.subjectId]), [["unresolved_requirement", "node_sound"], ["unresolved_requirement", "node_title"]]);
  assert.deepEqual(g.graph.executability.blocking.map(b => [b.code, b.subjectId]),
    [["budget_feasibility_unverified", "execution_budget"], ["unresolved_requirement", "node_sound"], ["unresolved_requirement", "node_title"]]);
  assert.deepEqual(g.graph.obligations.map(o => [o.nodeId, o.priority, o.disposition]), [
    ["node_sound", "soft", { state: "unresolved", reasonCode: "technique_resolution_not_supplied" }],
    ["node_title", "hard", { state: "unresolved", reasonCode: "technique_resolution_not_supplied" }]]);
});

test("absent capability evidence is UNSUPPORTED, never zero or available", () => {
  const p = uep(8);
  for (const snapshot of [capabilitySnapshot([]), capabilitySnapshot([executorBody([])])]) {
    const g = graphOf(p, { snapshot });
    assert.ok(g.graph.capability.assessments.length > 0);
    assert.ok(g.graph.capability.assessments.every(a => a.state === "UNSUPPORTED"));
    assert.ok(g.graph.capability.assessments.every(a => a.executors.every(e => e.declaration.state === "not_applicable" && e.reasonCode === "capability_not_declared")));
    assert.ok(g.graph.capability.assessments.every(a => a.executors.every(e => e.attestation.state === "not_applicable")));
    assert.equal(capabilityState(g.graph), "capability_not_ready");
  }
});

test("graph identity binds capability snapshot, output profile, operation resolution and graph policy", () => {
  const { p, r } = warmResolved(), base = graphOf(p, { resolutions: [r] });
  const variants = [
    graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot([executorBody(declarations({ color_look: declaration("color_look", [member("look", "cool")]) }))]) }),
    graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot(undefined, { asOf: "2026-09-24T00:00:01.000Z" }) }),
    graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "whole_output" }, 250))] }),
    graphOf(p, { resolutions: [r], profile: { resolution: { width: 720, height: 1280 } } }),
    graphOf(p, { resolutions: [r], profile: { clock: { ticksPerSecond: 1_000_000 } } }),
    graphOf(p, { resolutions: [r], policy: { sourceAudio: "excluded" } }),
  ];
  const ids = [base, ...variants].map(g => g.graph.editGraphId);
  assert.equal(new Set(ids).size, ids.length);
  // Re-assessing capability does not re-identify the unchanged clip uses or operations.
  assert.deepEqual(videoUses(variants[0]!.graph).map(c => c.clipUseId), videoUses(base.graph).map(c => c.clipUseId));
  assert.deepEqual(variants[0]!.graph.operations, base.graph.operations);
});

test("graph construction and replay are deterministic and invariant to supplied order", () => {
  const p = colorAndCut(), g = graphOf(p, { resolutions: colorAndCutResolutions(p) });
  assert.equal(capabilityState(g.graph), "capability_ready");
  assert.deepEqual(buildEditGraph(g.request, g.artifacts), g.graph);
  assert.deepEqual(buildEditGraph({ ...g.request, techniqueResolutions: [...g.request.techniqueResolutions].reverse() }, [...g.artifacts].reverse()), g.graph);
  assert.deepEqual(validateEditGraph(g.graph, [...g.artifacts].reverse()), g.graph);
});

for (const field of ["projectId", "creatorId", "purpose"] as const) test(`foreign ${field} in any Gate-6 input fails closed`, () => {
  const { p, r } = warmResolved(), foreign = { scope: { ...scope, [field]: "foreign_scope" } };
  assert.equal(errorCode(() => graphOf(p, { resolutions: [r], profile: foreign })), "scope_mismatch");
  assert.equal(errorCode(() => graphOf(p, { resolutions: [r], policy: foreign })), "scope_mismatch");
  assert.equal(errorCode(() => graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot(undefined, foreign) })), "scope_mismatch");
  assert.equal(errorCode(() => graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm"), foreign)] })), "scope_mismatch");
  const g = graphOf(p, { resolutions: [r] });
  assert.equal(errorCode(() => reportOf(g, undefined, [], projectionPolicy(foreign))), "scope_mismatch");
});

test("the graph cannot extend, re-time, relabel or substitute Gate-5 source bounds", () => {
  const g = graphOf(basic()), graph = g.graph, clip = videoUses(graph)[0]!;
  const patchClip = (patch: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    reidentify({ ...graph, ...extra, clipUses: graph.clipUses.map(c => c.clipUseId === clip.clipUseId ? { ...c, ...patch } : c) }, "editGraphId", "edit_graph_v0");
  const widened = patchClip({ source: { ...clip.source, range: { startSeconds: 0, endSeconds: 3 } }, output: { startTicks: 0, endTicks: 3e9 },
    mapping: { ...clip.mapping, sourceEndTicks: 3e9 } }, { output: { ...graph.output, durationTicks: 3e9 } });
  const substituted = patchClip({ candidateId: `segment_${"f".repeat(64)}`, token: { ...clip.token, objectId: "substitute_token", sha256: "f".repeat(64) } });
  const retimed = patchClip({ mapping: { ...clip.mapping, sourceStartTicks: 5e8 } });
  const relabeled = patchClip({ source: { ...clip.source, precision: "source_seconds" } });
  for (const forged of [widened, substituted, retimed, relabeled]) rejectsForgery(() => validateEditGraph(forged, g.artifacts));
  assert.equal(errorCode(() => validateEditGraph(retimed, g.artifacts)), "input_invalid");
});

// ---------------------------------------------------------------- 24-32 UEP compatibility boundary
test("a 16-second capability-ready graph is inside the lossless UEP timeline subset yet refused for missing truthful telemetry", () => {
  const g = graphOf(uep(8)), { report, artifacts } = reportOf(g);
  assert.equal(capabilityState(g.graph), "capability_ready");
  assert.equal(report.timelineSubset, "compatible");
  assert.equal(report.planInputEligibility, "not_eligible");
  assert.deepEqual(Object.fromEntries(report.dimensions.map(d => [d.dimension, d.state])), { graph_capability_readiness: "compatible", operation_obligations: "compatible",
    operation_subset: "compatible", output_profile: "compatible", output_duration: "compatible", clip_count: "compatible", framing: "compatible",
    time_mapping: "compatible", source_audio: "compatible", transitions: "compatible", effects: "compatible", timeline_arithmetic: "compatible",
    clip_identity: "unavailable", clip_role: "compatible", clip_asset_joins: "compatible", clip_segment_joins: "unavailable", validation_time_access: "unavailable",
    reference: "compatible", telemetry: "unavailable", plan_metadata: "unavailable" });
  assert.deepEqual(report.outcome, { kind: "refused", reasonCodes: ["clip_segment_join_unverified", "missing_meaningful_confidence", "missing_truthful_decision_telemetry",
    "plan_created_at_unavailable", "segment_identity_unavailable", "validation_time_access_unverified"], plan: "not_produced", decisionEvents: "not_emitted" });
  assert.deepEqual(validateUepCompatibilityReport(report, artifacts), report);
});

test("frozen UEP schema oracle agrees with the timeline-subset classification at and beyond 30 seconds", () => {
  for (const [uses, compatible] of [[8, true], [15, true], [16, false]] as const) {
    const g = graphOf(uep(uses)), { report } = reportOf(g);
    assert.equal(report.timelineSubset === "compatible", compatible, `${uses} uses`);
    assert.equal(UniversalEditPlanSchema.safeParse(probePlan(g.graph)).success, compatible, `${uses} uses`);
    assert.equal(report.outcome.kind, "refused");
  }
});

test("rich or unresolved operations refuse UEP projection instead of being dropped", () => {
  const p = withOperations("contrast", x => [operationNode(x, "node_color", { kind: "color_intention", mood: "contrast", description: "Contrast." })]);
  const rich = capabilitySnapshot([executorBody(declarations({ color_look: declaration("color_look", [member("look", "neutral", "warm", "cool", "contrast"),
    member("target_kind", "whole_output", "clip_uses")]) }))]);
  const g = graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("contrast"))], snapshot: rich });
  assert.equal(capabilityState(g.graph), "capability_ready");
  const { report } = reportOf(g), operation = g.graph.operations[0]!;
  const subset = dimension(report, "operation_subset");
  assert.equal(subset.state, "incompatible");
  assert.deepEqual(subset.findings.map(f => [f.code, f.subjects]), [["operation_not_in_uep_subset", [operation.operationId]]]);
  assert.equal(report.timelineSubset, "incompatible");
  assert.ok(report.outcome.reasonCodes.includes("operation_not_in_uep_subset"));
  assert.deepEqual(mappingOf(report, operation.operationId), { kind: "not_projectable", reasonCode: "operation_not_in_uep_subset" });
  const technique = withOperations("technique", x => [operationNode(x, "node_technique", { kind: "technique_intention", canonEntryKey: "narrative_arc", description: "A technique." })]);
  const unresolved = reportOf(graphOf(technique)).report;
  for (const code of ["graph_capability_not_ready", "unresolved_operation_obligation"]) assert.ok((unresolved.outcome.reasonCodes as readonly string[]).includes(code), code);
  assert.deepEqual(mappingOf(unresolved, "node_technique"), { kind: "not_projectable", reasonCode: "unresolved_operation_obligation" });
});

test("a 32-second graph refuses the frozen 15-30 second UEP range and is never truncated", () => {
  const g = graphOf(uep(16)), { report } = reportOf(g);
  assert.equal(capabilityState(g.graph), "capability_ready");
  assert.equal(g.graph.output.durationTicks, 32e9);
  assert.equal(videoUses(g.graph).length, 16);
  const duration = dimension(report, "output_duration");
  assert.deepEqual([duration.state, duration.findings.map(f => f.code)], ["incompatible", ["output_duration_outside_uep_range"]]);
  assert.deepEqual(validateEditGraph(g.graph, g.artifacts), g.graph);
  assert.ok(reportOf(graphOf(basic())).report.outcome.reasonCodes.includes("output_duration_outside_uep_range"));
});

test("output aspect and frame-rate profiles outside UEP are refused", () => {
  const landscape = graphOf(uep(8), { profile: { aspectRatio: { width: 16, height: 9 }, resolution: { width: 1920, height: 1080 } } });
  assert.equal(capabilityState(landscape.graph), "capability_not_ready");
  assert.ok(videoUses(landscape.graph).every(c => c.framing.state === "unresolved"));
  const wide = reportOf(landscape).report;
  for (const code of ["output_aspect_not_uep", "framing_not_representable"]) assert.ok((wide.outcome.reasonCodes as readonly string[]).includes(code), code);
  const fastExecutor = executorBody(declarations({ timeline_video_clip: declaration("timeline_video_clip",
    VIDEO_SUPPORTS.map(s => s.name === "output_frame_rate" ? member("output_frame_rate", "fps_30_1", "fps_240_1") : s)) }));
  const fast = graphOf(uep(8), { profile: { frameRate: { numerator: 240, denominator: 1 } }, snapshot: capabilitySnapshot([fastExecutor]) });
  assert.equal(capabilityState(fast.graph), "capability_ready");
  const high = reportOf(fast).report;
  assert.deepEqual(dimension(high, "output_profile").findings.map(f => f.code), ["output_frame_rate_outside_uep"]);
  assert.equal(high.timelineSubset, "incompatible");
});

test("a ReferenceFingerprint 1.1.0 export requirement is refused, never coerced to 1.0.0", () => {
  const g = graphOf(uep(8));
  const v11 = artifact("reference_v11", "ReferenceFingerprint", JSON.parse(readFileSync("tests/fixtures/reference-v11.json", "utf8")), "1.1.0");
  const v10 = artifact("reference_v10", "ReferenceFingerprint", JSON.parse(readFileSync("samples/fixtures/reference-fingerprint.json", "utf8")), "1.0.0");
  const other = artifact("reference_other", "ReferenceStyleSheet", { scope, style: "synthetic" });
  const referenceDimension = (reference: unknown, extra: SuppliedArtifact[]) => dimension(reportOf(g, reference, extra).report, "reference");
  const incompatible = referenceDimension(present(v11.ref), [v11]);
  assert.deepEqual([incompatible.state, incompatible.findings.map(f => [f.code, f.subjects])], ["incompatible", [["reference_version_incompatible", ["reference_v11"]]]]);
  // A parseable 1.0.0 reference is only the first frozen requirement; its asset joins stay unverified until exact evidence is supplied.
  const unverified = referenceDimension(present(v10.ref), [v10]);
  assert.deepEqual([unverified.state, unverified.findings.map(f => [f.code, f.subjects])], ["unavailable", [["reference_join_evidence_unavailable", ["reference_v10"]]]]);
  const asset = artifact("reference_asset", "MediaAsset", referenceFixtures().asset, "1.0.0");
  const joins = present({ asset: asset.ref, audio: missing("not_applicable", "reference_has_no_audio") });
  assert.deepEqual(dimension(reportOf(g, present(v10.ref), [v10, asset], undefined, joins).report, "reference"), { dimension: "reference", state: "compatible", findings: [] });
  assert.deepEqual(referenceDimension(present(other.ref), [other]).findings.map(f => f.code), ["reference_type_unsupported"]);
  const { report } = reportOf(g, present(v11.ref), [v11]);
  assert.ok(report.outcome.reasonCodes.includes("reference_version_incompatible"));
  assert.deepEqual(report.reference, present(v11.ref));
});

test("missing truthful telemetry is an explicit refusal: no DecisionEvent, no confidence, no invented plan identity", () => {
  const g = graphOf(uep(8)), { report, request, artifacts } = reportOf(g);
  const telemetry = dimension(report, "telemetry");
  assert.deepEqual(telemetry.findings.map(f => [f.code, f.evidence.map(e => e.pointer)]), [["missing_meaningful_confidence", ["/uncertainty"]], ["missing_truthful_decision_telemetry", ["/outcome"]]]);
  assert.ok(report.dimensions.find(d => d.dimension === "telemetry")!.findings.every(f => f.evidence.every(e => same(e.artifact, g.graph.lineage.planningDecision))));
  const keys = allKeys([g.graph, report]);
  for (const key of ["confidence", "decisionId", "winnerCandidateId", "planId", "slotId", "clips", "eventId", "occurredAt", "score", "candidates"]) assert.equal(keys.has(key), false, key);
  for (const field of ["confidence", "decisionEvents", "planId", "createdAt", "jobId"]) {
    assert.equal(errorCode(() => assessUepCompatibility({ ...request, [field]: field === "confidence" ? 0.9 : "injected" }, artifacts)), "input_invalid", field);
  }
  for (const outcome of [{ ...report.outcome, kind: "projected" }, { ...report.outcome, reasonCodes: [] }, { ...report.outcome, confidence: 1 }]) {
    assert.equal(UepCompatibilityReportSchema.safeParse(reidentify({ ...report, outcome }, "reportId", "uep_compatibility_report_v0")).success, false);
  }
});

test("the compatibility sidecar binds the exact graph and a complete one-to-one node mapping", () => {
  const p = colorAndCut(), g = graphOf(p, { resolutions: colorAndCutResolutions(p) }), { report, artifacts } = reportOf(g);
  assert.deepEqual(report.editGraph, g.graphArtifact.ref);
  assert.equal(report.graphRevision, 0);
  const nodes = [...g.graph.clipUses.map(c => c.clipUseId), ...g.graph.operations.map(o => o.operationId), ...g.graph.obligations.map(o => o.nodeId)];
  assert.deepEqual(report.mapping.map(m => m.graphNode.id), nodes);
  assert.deepEqual(report.mapping.flatMap(m => m.projection.kind === "uep_clip" ? [m.projection.clipIndex] : []), [0, 1, 2, 3, 4, 5, 6, 7]);
  const color = g.graph.operations.find(o => o.primitive === "color_look")!, cut = g.graph.operations.find(o => o.primitive === "cut_transition")!;
  assert.deepEqual(mappingOf(report, color.operationId), { kind: "uep_effects", effectIndexes: [0] });
  assert.deepEqual(mappingOf(report, cut.operationId), { kind: "uep_clip_transition_out", clipIndex: 0 });
  assert.deepEqual(mappingOf(report, "node_color"), { kind: "outside_uep", reasonCode: "obligation_lineage_sidecar_only" });
  const first = report.mapping[0]!, second = report.mapping[1]!;
  for (const mapping of [report.mapping.slice(1), [first, { ...second, projection: first.projection }, ...report.mapping.slice(2)], [first, first, ...report.mapping.slice(1)]]) {
    rejectsForgery(() => validateUepCompatibilityReport(reidentify({ ...report, mapping }, "reportId", "uep_compatibility_report_v0"), artifacts));
  }
  const other = graphOf(uep(8));
  rejectsForgery(() => validateUepCompatibilityReport(reidentify({ ...report, editGraph: other.graphArtifact.ref }, "reportId", "uep_compatibility_report_v0"),
    mergeArtifacts(artifacts, other.artifacts)));
});

// ---------------------------------------------------------------- 33-35 preservation and boundaries
const FROZEN_PUBLIC_SURFACES = [
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
  ["packages/telemetry/index.ts", "e86e8490e457c125a5f74f4bf72b6a6062bdea352a4739a9eabb314c686724aa"],
  ["packages/validation/index.ts", "058f745aa000c21236663b3cd5bfdbae4482deb7997309710066f9435ac7604b"],
  ["packages/validation/qc.ts", "60d9c25fa504cf6b49e79f744ceec48aa5b9dd64c26c5924a39127fca562e90c"],
] as const;
test("public contracts, provider seams, validators and telemetry remain byte-identical", () => {
  for (const [path, sha256] of FROZEN_PUBLIC_SURFACES) assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), sha256, path);
});

test("the edit-graph core has no provider, network, filesystem, process, model, media or render dependency", () => {
  const files = readdirSync("packages/edit-graph").filter(f => f.endsWith(".ts"));
  assert.ok(files.length > 0);
  const allowed = new Set(["zod", "../contracts/audio.js", "../contracts/common.js", "../contracts/creative.js", "../contracts/reference-v11.js", "../domain/serialization.js", "../editorial/common.js",
    "../planning/index.js", "../planning/common.js", "../director/index.js", "../footage-analyzer/protocol.js", "../reference-analyzer/features.js"]);
  for (const file of files) {
    const source = readFileSync(`packages/edit-graph/${file}`, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) assert.ok(allowed.has(match[1]!) || /^\.\/[a-z-]+\.js$/.test(match[1]!), `${file}: ${match[1]}`);
    assert.doesNotMatch(source, /["']node:|providers\/|process\.|Date\.now|Math\.random|new Date|\bfetch\s*\(|\bimport\s*\(|require\s*\(/, file);
    assert.doesNotMatch(source, /ffmpeg|ffprobe|spawn|execFile|python|torch|onnx|cuda|webgpu|\.render\s*\(|\.embed\s*\(|\.generate\s*\(|\.transcribe\s*\(|analyzeFootage|analyzeReference/i, file);
    assert.doesNotMatch(source, /DecisionEventSchema|UniversalEditPlanSchema|validatePlanWithInputs|InMemoryTelemetry/, file);
  }
});

test("no Gate-7 execution, render, preview or QC object is emitted", () => {
  const p = colorAndCut(), g = graphOf(p, { resolutions: colorAndCutResolutions(p) }), { report } = reportOf(g);
  const keys = allKeys([g.graph, report]);
  for (const key of ["executionDag", "executionPlan", "tasks", "task", "command", "commands", "shell", "renderer", "render", "renderSettings", "preview", "qc",
    "filterGraph", "ffmpeg", "script", "artifact_uri", "path"]) assert.equal(keys.has(key), false, key);
  assert.deepEqual([g.graph.artifactType, report.artifactType], ["EditGraph", "UepCompatibilityReport"]);
  assert.equal(g.graph.executability.permission, "not_granted");
});

// ---------------------------------------------------------------- additional V0 semantics
test("linked source audio is an explicit track mirroring exact video timing", () => {
  const p = memo("audio", () => plan(planningFixture(repeatedUses(8), variantDirectionFixture({ hasAudio: true }))));
  const g = graphOf(p), video = videoUses(g.graph), audio = g.graph.tracks.find(t => t.kind === "source_audio")!;
  assert.deepEqual(g.graph.tracks.map(t => [t.trackId, t.kind, t.order]), [["track_video_primary", "video", 0], ["track_source_audio_primary", "source_audio", 1]]);
  assert.equal(audio.clipUseIds.length, 8);
  audio.clipUseIds.forEach((id, i) => {
    const use = g.graph.clipUses.find(c => c.clipUseId === id)!;
    assert.equal(use.medium, "source_audio");
    if (use.medium !== "source_audio") return;
    assert.equal(use.linkedVideoClipUseId, video[i]!.clipUseId);
    assert.deepEqual([use.source, use.output, use.mapping, use.planningUse], [video[i]!.source, video[i]!.output, video[i]!.mapping, video[i]!.planningUse]);
    assert.deepEqual(use.gain, { numerator: 1, denominator: 1 });
  });
  assert.ok(video.every(c => c.sourceAudio.state === "linked"));
  assert.equal(capabilityState(g.graph), "capability_ready");
  assert.ok(g.graph.capabilityRequirements.some(q => q.capabilityId === "timeline_source_audio"));
  const { report } = reportOf(g);
  assert.equal(dimension(report, "source_audio").state, "compatible");
  audio.clipUseIds.forEach((id, i) => assert.deepEqual(mappingOf(report, id), { kind: "uep_clip_source_audio_gain", clipIndex: i }));
  const excluded = graphOf(p, { policy: { sourceAudio: "excluded" } });
  assert.deepEqual(excluded.graph.tracks.map(t => t.kind), ["video"]);
  assert.ok(videoUses(excluded.graph).every(c => c.sourceAudio.state === "excluded_by_policy"));
  assert.notEqual(excluded.graph.editGraphId, g.graph.editGraphId);
  assert.ok(videoUses(graphOf(uep(8)).graph).every(c => c.sourceAudio.state === "absent_in_source"));
});

test("segment identity is available only through a token's verified public ClipSegment", () => {
  const p = memo("segments", () => plan(planningFixture(repeatedUses(8), variantDirectionFixture({ clipSegments: true }))));
  const { report } = reportOf(graphOf(p));
  assert.deepEqual([dimension(report, "clip_identity").state, dimension(report, "clip_identity").findings], ["compatible", []]);
  assert.deepEqual(report.outcome.reasonCodes, ["missing_meaningful_confidence", "missing_truthful_decision_telemetry", "plan_created_at_unavailable",
    "validation_time_access_unverified"]);
  const unavailable = dimension(reportOf(graphOf(uep(8))).report, "clip_identity");
  assert.equal(unavailable.state, "unavailable");
  assert.ok(unavailable.findings[0]!.evidence.every(e => e.pointer === "/clipSegment"));
});

test("clear_change resolves to an explicit cut at an exact join; softer transitions stay unresolved in V0", () => {
  const p = withOperations("cut", x => [operationNode(x, "node_cut", { kind: "transition_intention", relation: "clear_change", description: "A clear change." })]);
  const g = graphOf(p, { resolutions: [resolution(p, "node_cut", "transition_intention", cutAt(p, 2))] });
  const cut = g.graph.operations[0]!, video = videoUses(g.graph);
  assert.equal(cut.primitive, "cut_transition");
  if (cut.primitive === "cut_transition") {
    assert.deepEqual(cut.target, { kind: "join", fromClipUseId: video[2]!.clipUseId, toClipUseId: video[3]!.clipUseId });
    assert.equal(cut.atTicks, video[2]!.output.endTicks);
  }
  assert.equal(capabilityState(g.graph), "capability_ready");
  const uses = chosenOption(p).uses;
  assert.equal(errorCode(() => graphOf(p, { resolutions: [resolution(p, "node_cut", "transition_intention",
    { primitive: "cut_transition", join: { fromUseId: uses[0]!.useId, toUseId: uses[2]!.useId } })] })), "technique_resolution_invalid");
  const soft = withOperations("soft_cut", x => [operationNode(x, "node_cut", { kind: "transition_intention", relation: "soften_change", description: "Soften it." })]);
  assert.equal(graphOf(soft).graph.obligations[0]!.disposition.state, "unresolved");
  assert.equal(errorCode(() => graphOf(soft, { resolutions: [resolution(soft, "node_cut", "transition_intention", cutAt(soft, 0))] })), "technique_resolution_invalid");
});

test("technique resolutions must match the exact typed obligation, decision, direction and targets", () => {
  const p = warm(), direction = p.run.decision.direction;
  const directionValue = new EditorialArtifactMap(p.all).get(direction) as { nodes: { nodeId: string }[] };
  const hookIndex = directionValue.nodes.findIndex(n => n.nodeId === "node_hook");
  const invalid = (resolutions: ReturnType<typeof resolution>[]) => assert.equal(errorCode(() => graphOf(p, { resolutions })), "technique_resolution_invalid");
  invalid([resolution(p, "node_color", "color_intention", colorLook("cool"))]);
  invalid([resolution(p, "node_color", "transition_intention", cutAt(p, 0))]);
  invalid([resolution(p, "node_color", "color_intention", colorLook("warm"), { obligation: { nodeId: "node_hook", directionNode: { artifact: direction, pointer: `/nodes/${hookIndex}` } } })]);
  invalid([resolution(p, "node_color", "color_intention", colorLook("warm"), { obligation: { nodeId: "node_color", directionNode: { artifact: direction, pointer: `/nodes/${hookIndex}` } } })]);
  invalid([resolution(p, "node_color", "color_intention", colorLook("warm"), { planningDecision: basic().decisionRef })]);
  invalid([resolution(p, "node_color", "color_intention", colorLook("warm"), { direction: basic().run.decision.direction })]);
  invalid([resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "planning_uses", useIds: ["unknown_use"] }))]);
  invalid([resolution(p, "node_color", "color_intention", colorLook("warm")), resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "whole_output" }, 100))]);
  const two = withOperations("two_colors", x => [operationNode(x, "node_color_a", { kind: "color_intention", mood: "warm", description: "A." }),
    operationNode(x, "node_color_b", { kind: "color_intention", mood: "cool", description: "B." })]);
  const useIds = chosenOption(two).uses.map(u => u.useId);
  assert.equal(errorCode(() => graphOf(two, { resolutions: [resolution(two, "node_color_a", "color_intention", colorLook("warm")),
    resolution(two, "node_color_b", "color_intention", colorLook("cool"))] })), "technique_resolution_invalid");
  const disjoint = graphOf(two, { resolutions: [resolution(two, "node_color_a", "color_intention", colorLook("warm", { kind: "planning_uses", useIds: useIds.slice(0, 4) })),
    resolution(two, "node_color_b", "color_intention", colorLook("cool", { kind: "planning_uses", useIds: useIds.slice(4) }))] });
  assert.equal(capabilityState(disjoint.graph), "capability_ready");
});

test("candidate-bound operations may target only exact occurrences of their bound candidate", () => {
  const p = boundColor(), use = chosenOption(p).uses[0]!;
  assert.equal(p.run.manifest.deferredObligations[0]!.reasonCode, "operation_intention");
  assert.equal(errorCode(() => graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm"))] })), "technique_resolution_invalid");
  const g = graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "planning_uses", useIds: [use.useId] }))] });
  const operation = g.graph.operations[0]!, clip = videoUses(g.graph)[0]!;
  assert.equal(operation.primitive, "color_look");
  if (operation.primitive === "color_look") {
    assert.deepEqual(operation.target, { kind: "clip_uses", clipUseIds: [clip.clipUseId] });
    assert.deepEqual(operation.extents, [clip.output]);
  }
  assert.equal(capabilityState(g.graph), "capability_ready");
});

for (const intent of [
  { kind: "graphics_intention", role: "clarify", description: "A title." },
  { kind: "sound_design_intention", relation: "emphasize", description: "Emphasis." },
  { kind: "technique_intention", canonEntryKey: "narrative_arc", description: "A technique." },
  { kind: "music_relationship", relation: "build_with_music", beatId: missing("not_computed", "beat_evidence_unavailable"), description: "Music." },
] as const) test(`typed ${intent.kind} has no V0 resolution and stays unresolved`, () => {
  const p = withOperations(`unresolvable_${intent.kind}`, x => [operationNode(x, "node_operation", intent)]);
  const g = graphOf(p);
  assert.deepEqual(g.graph.obligations.map(o => [o.intentionKind, o.disposition.state]), [[intent.kind, "unresolved"]]);
  assert.deepEqual(g.graph.operations, []);
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  assert.throws(() => resolution(p, "node_operation", intent.kind, colorLook("warm")));
});

test("count limits overflow into an explicit limit_exceeded refusal", () => {
  const { p, r } = warmResolved(), inputs = graphInputs(p, { resolutions: [r] });
  const refs = Array.from({ length: 65 }, (_, i) => ({ ...inputs.request.techniqueResolutions[0]!, objectId: `resolution_overflow_${i}` }));
  assert.equal(errorCode(() => buildEditGraph({ ...inputs.request, techniqueResolutions: refs }, inputs.artifacts)), "limit_exceeded");
  const executors = Array.from({ length: 33 }, (_, i) => executorBody(declarations(), { ...EXECUTOR, executorId: `executor_${String(i).padStart(2, "0")}` }));
  assert.equal(errorCode(() => capabilitySnapshot(executors)), "limit_exceeded");
});

test("clip roles are projected only by exact story-beat names", () => {
  const payoff = memo("payoff", () => {
    const x = planningFixture(repeatedUses(8)), hook = x.source.direction.nodes[0]!;
    return plan(withDirection(x, { nodes: [{ ...hook, intent: { kind: "story_beat", role: "payoff", description: "Payoff." } }] }));
  });
  const role = dimension(reportOf(graphOf(payoff)).report, "clip_role");
  assert.deepEqual([role.state, role.findings.map(f => f.code)], ["incompatible", ["clip_role_not_representable"]]);
});

test("the variant synthetic chain reproduces the accepted Gate-4 fixture byte for byte when unpatched", () => {
  const accepted = directionFixture(), variant = variantDirectionFixture();
  assert.deepEqual(variant.supplied.map(a => a.ref), accepted.supplied.map(a => a.ref));
  assert.deepEqual(variant.directionArtifact.ref, accepted.directionArtifact.ref);
});

test("alternative-branch obligations stay undetermined or inactive; V0 never chooses a Director alternative", () => {
  const x = planningFixture(singleUse), hook = x.source.direction.nodes[0]!;
  const a = operationNode(x, "node_color_a", { kind: "color_intention", mood: "warm", description: "A." });
  const b = operationNode(x, "node_color_b", { kind: "color_intention", mood: "cool", description: "B." });
  const undetermined = memo("undetermined", () => plan(withDirection(x, { nodes: [hook, a, b], edges: [{ edgeId: "edge_alternative", type: "alternative_to", from: a.nodeId, to: b.nodeId }],
    alternatives: [{ branchId: "branch_look", choices: [{ choiceId: "choice_a", nodeIds: [a.nodeId] }, { choiceId: "choice_b", nodeIds: [b.nodeId] }] }] })));
  assert.equal(undetermined.run.decision.outcome.kind, "chosen");
  const g = graphOf(undetermined);
  assert.deepEqual(g.graph.obligations.map(o => [o.nodeId, o.applicability, o.disposition]), [
    ["node_color_a", { state: "undetermined_alternative", branchId: "branch_look" }, { state: "unresolved", reasonCode: "alternative_branch_undetermined" }],
    ["node_color_b", { state: "undetermined_alternative", branchId: "branch_look" }, { state: "unresolved", reasonCode: "alternative_branch_undetermined" }]]);
  assert.ok(g.graph.unresolved.some(u => u.code === "deferred_check_not_verified"));
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  assert.equal(errorCode(() => graphOf(undetermined, { resolutions: [resolution(undetermined, "node_color_a", "color_intention", colorLook("warm"))] })), "technique_resolution_invalid");
  const other = { ...hook, nodeId: "node_other" }, unbound = { ...hook, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const color = operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Only with the first choice." });
  const inactive = memo("inactive", () => plan(withDirection(x, { nodes: [hook, other, unbound, color], edges: [{ edgeId: "alternative", type: "alternative_to", from: hook.nodeId, to: other.nodeId }],
    alternatives: [{ branchId: "branch_source", choices: [{ choiceId: "choice_a", nodeIds: [hook.nodeId, unbound.nodeId, color.nodeId].sort() }, { choiceId: "choice_b", nodeIds: [other.nodeId] }] }] })));
  assert.equal(inactive.run.decision.outcome.kind, "chosen");
  const h = graphOf(inactive);
  assert.deepEqual(h.graph.obligations.map(o => [o.nodeId, o.applicability, o.disposition]), [["node_color",
    { state: "inactive_alternative", branchId: "branch_source", selectedChoiceId: "choice_b" }, { state: "not_applicable", reasonCode: "unselected_alternative_choice" }]]);
  assert.equal(capabilityState(h.graph), "capability_ready");
  assert.equal(errorCode(() => graphOf(inactive, { resolutions: [resolution(inactive, "node_color", "color_intention", colorLook("warm"))] })), "technique_resolution_invalid");
});

test("requirements available only on different executors do not make a graph capability-ready", () => {
  const { p, r } = warmResolved();
  const colorOnly = executorBody([declaration("color_look", fullColorSupports)], { ...EXECUTOR, executorId: "synthetic_color_executor" });
  const g = graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot([executorBody(declarations({ color_look: null })), colorOnly]) });
  assert.ok(g.graph.capability.assessments.every(a => a.state === "AVAILABLE"));
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  assert.deepEqual(capabilityBlocking(g.graph).map(b => b.code), ["no_single_executor_covers_graph"]);
  assert.deepEqual(g.graph.executability.blocking.map(b => b.code), ["budget_feasibility_unverified", "no_single_executor_covers_graph"]);
});

// ---------------------------------------------------------------- adversarial self-review
/** Coordinated forgery: re-identify every changed nested record and rename each reference so only semantic replay can object. */
function coordinatedRehash(input: EditGraph): EditGraph {
  let current = structuredClone(input) as EditGraph;
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

test("self-review: coordinated rehash of widened or substituted source ranges survives structure but not replay", () => {
  const g = graphOf(basic()), clip = videoUses(g.graph)[0]!;
  const widened = structuredClone(g.graph);
  const target = widened.clipUses[0]!;
  target.source.range = { startSeconds: 0, endSeconds: 3 };
  target.output = { startTicks: 0, endTicks: 3e9 };
  target.mapping.sourceEndTicks = 3e9;
  widened.output.durationTicks = 3e9;
  for (const requirement of widened.capabilityRequirements) for (const predicate of requirement.predicates) {
    if (predicate.name === "output_duration_seconds_ceiling") predicate.value = 3;
  }
  const forged = coordinatedRehash(widened);
  assert.equal(EditGraphSchema.safeParse(forged).success, true, "the coordinated forgery must be structurally valid");
  assert.notEqual(videoUses(forged)[0]!.clipUseId, clip.clipUseId);
  assert.equal(errorCode(() => validateEditGraph(forged, g.artifacts)), "graph_replay_mismatch");
  // An equal-duration substitute candidate cannot replace the Gate-5 use either.
  const x = planningFixture({ duration: { minimumSeconds: 1, maximumSeconds: 1, preferredSeconds: 1 }, search: { ...planningPolicyBody.search, maximumDepth: 1 } },
    directionFixture(0, false, undefined, true));
  const p = memo("one_second", () => plan(x)), h = graphOf(p), use = videoUses(h.graph)[0]!;
  assert.deepEqual(use.source.range, { startSeconds: 0.5, endSeconds: 1.5 });
  const other = p.context.candidates.find(c => c.candidateId !== use.candidateId)!;
  const substituted = structuredClone(h.graph), swapped = substituted.clipUses[0]!;
  swapped.candidateId = other.candidateId;
  swapped.token = other.token;
  swapped.source.range = { startSeconds: 2, endSeconds: 3 };
  swapped.source.startAuthority = { kind: "frame_pts", frameIndex: 20, evidence: { artifact: swapped.source.analysis, pointer: "/metadata/frameTimes/20" } };
  swapped.source.endAuthority = { kind: "frame_pts", frameIndex: 30, evidence: { artifact: swapped.source.analysis, pointer: "/metadata/frameTimes/30" } };
  swapped.mapping.sourceStartTicks = 2e9;
  swapped.mapping.sourceEndTicks = 3e9;
  const forgedSubstitute = coordinatedRehash(substituted);
  assert.equal(EditGraphSchema.safeParse(forgedSubstitute).success, true);
  assert.equal(errorCode(() => validateEditGraph(forgedSubstitute, h.artifacts)), "graph_replay_mismatch");
});

test("self-review: source and output clocks cannot be confused, and time cannot be negative, empty or overflow", () => {
  const g = graphOf(offGrid(), { profile: { clock: { ticksPerSecond: 1000 } } });
  const confused = structuredClone(g.graph);
  confused.clipUses[0]!.mapping.sourceStartTicks = confused.clipUses[0]!.output.startTicks;
  confused.clipUses[0]!.mapping.sourceEndTicks = confused.clipUses[0]!.output.endTicks;
  assert.equal(errorCode(() => validateEditGraph(coordinatedRehash(confused), g.artifacts)), "input_invalid");
  const reclocked = structuredClone(g.graph);
  reclocked.output.clock = { ticksPerSecond: 1_000_000 };
  assert.equal(errorCode(() => validateEditGraph(coordinatedRehash(reclocked), g.artifacts)), "input_invalid");
  for (const mutate of [
    (c: EditGraph) => { c.clipUses[0]!.output = { startTicks: 0, endTicks: 0 }; },
    (c: EditGraph) => { c.clipUses[0]!.output = { startTicks: -1, endTicks: 1839 }; },
    (c: EditGraph) => { c.output.durationTicks = Number.MAX_SAFE_INTEGER + 1; },
  ]) {
    const forged = structuredClone(g.graph);
    mutate(forged);
    assert.equal(errorCode(() => validateEditGraph(reidentify(forged, "editGraphId", "edit_graph_v0"), g.artifacts)), "input_invalid");
  }
  for (const ticksPerSecond of [0, 1.5, 1_000_000_001, -1]) assert.throws(() => outputProfile({ clock: { ticksPerSecond } }));
});

test("self-review: non-canonical snapshot or resolution bytes cannot misbind proof pointers or identity", () => {
  const { p, r } = warmResolved();
  const colorOnly = executorBody([declaration("color_look", fullColorSupports)], { ...EXECUTOR, executorId: "executor_b_color" });
  const canonical = capabilitySnapshot([executorBody(declarations(), { ...EXECUTOR, executorId: "executor_a_full" }), colorOnly]);
  // Same semantic identity, reversed executor bytes: parsed indexes would no longer address the declaration actually used.
  const reversed = artifact(canonical.snapshotId, "CapabilitySnapshot", { ...canonical, executors: [...canonical.executors].reverse() });
  const inputs = graphInputs(p, { resolutions: [r], snapshot: canonical });
  const artifacts = [...inputs.artifacts.filter(a => a.ref.objectId !== canonical.snapshotId), reversed];
  assert.equal(errorCode(() => buildEditGraph({ ...inputs.request, capabilitySnapshot: reversed.ref }, artifacts)), "capability_snapshot_invalid");
  const uses = chosenOption(p).uses.map(u => u.useId);
  const sorted = resolution(p, "node_color", "color_intention", colorLook("warm", { kind: "planning_uses", useIds: uses.slice(0, 2) }));
  const canonicalUseIds = sorted.operation.primitive === "color_look" && sorted.operation.target.kind === "planning_uses" ? sorted.operation.target.useIds : [];
  assert.equal(canonicalUseIds.length, 2);
  const reorderedValue = { ...sorted, operation: { ...sorted.operation, target: { kind: "planning_uses", useIds: [...canonicalUseIds].reverse() } } };
  // The schema alone canonicalizes the set and accepts this identity; only the exact-bytes binding check can reject it.
  assert.equal(TechniqueResolutionSchema.safeParse(reorderedValue).success, true);
  const unsorted = artifact(sorted.resolutionId, "TechniqueResolution", reorderedValue);
  const resolutionInputs = graphInputs(p, { resolutions: [sorted] });
  const withUnsorted = [...resolutionInputs.artifacts.filter(a => a.ref.objectId !== sorted.resolutionId), unsorted];
  assert.equal(errorCode(() => buildEditGraph({ ...resolutionInputs.request, techniqueResolutions: [unsorted.ref] }, withUnsorted)), "input_invalid");
});

test("self-review: capability evidence from a foreign or unscoped artifact cannot prove availability", () => {
  const { p, r } = warmResolved();
  const foreign = artifact("gate6_foreign_conformance", "Evidence", { scope: { ...scope, projectId: "foreign_project" }, basis: "synthetic_foreign_evidence" });
  const unscoped = artifact("gate6_unscoped_conformance", "Evidence", { basis: "synthetic_unscoped_evidence" });
  for (const evidence of [foreign, unscoped]) {
    const snapshot = capabilitySnapshot([executorBody(declarations({ color_look: declaration("color_look", fullColorSupports,
      { state: "available", evidence: [{ artifact: evidence.ref, pointer: "" }] }) }))]);
    assert.equal(errorCode(() => graphOf(p, { resolutions: [r], snapshot, extra: [evidence] })), "scope_mismatch", evidence.ref.objectId);
  }
});

test("self-review: the graph discloses its pinned source-access time and requires recheck before execution", () => {
  const p = basic(), graph = graphOf(p).graph as unknown as Record<string, unknown>;
  assert.deepEqual(graph.sourceAccess, { basis: "gate5_pinned_world_view", accessAsOf: p.context.worldQuery.accessAsOf, recheck: "required_immediately_before_execution" });
});

test("self-review: a capability declared for another primitive never proves the requested one", () => {
  const { p, r } = warmResolved();
  const misplaced = declarations({ color_look: null, timeline_video_clip: declaration("timeline_video_clip", [...VIDEO_SUPPORTS, member("look", "warm"), member("target_kind", "whole_output")]) });
  const g = graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot([executorBody(misplaced)]) });
  const color = g.graph.capabilityRequirements.find(q => q.capabilityId === "color_look")!;
  assert.equal(g.graph.capability.assessments.find(a => a.requirementId === color.requirementId)!.state, "UNSUPPORTED");
  assert.equal(capabilityState(g.graph), "capability_not_ready");
});

test("self-review: unknown primitives and capabilities in raw supplied artifacts are rejected, never ignored", () => {
  const { p, r } = warmResolved();
  const dissolve = identify("technique_resolution_v0", "resolutionId", { ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== "resolutionId")),
    operation: { primitive: "dissolve", durationTicks: 5e8 } });
  const dissolveArtifact = artifact(dissolve.resolutionId as string, "TechniqueResolution", dissolve);
  const inputs = graphInputs(p, { resolutions: [r] });
  assert.equal(errorCode(() => buildEditGraph({ ...inputs.request, techniqueResolutions: [dissolveArtifact.ref] }, [...inputs.artifacts, dissolveArtifact])), "input_invalid");
  const snapshot = capabilitySnapshot();
  const extended = identify("capability_snapshot_v0", "snapshotId", { ...Object.fromEntries(Object.entries(snapshot).filter(([k]) => k !== "snapshotId")),
    executors: snapshot.executors.map(e => ({ ...e, declarations: [...e.declarations, { ...e.declarations[0]!, capabilityId: "color_grade_pro" }] })) });
  const extendedArtifact = artifact(extended.snapshotId as string, "CapabilitySnapshot", extended);
  assert.equal(errorCode(() => buildEditGraph({ ...inputs.request, capabilitySnapshot: extendedArtifact.ref }, [...inputs.artifacts, extendedArtifact])), "capability_snapshot_invalid");
});

test("self-review: supplied public DecisionEvents or prose naming an executor cannot satisfy telemetry or select execution", () => {
  const g = graphOf(uep(8)), base = reportOf(g).report;
  const events = (JSON.parse(readFileSync("samples/fixtures/decisions.json", "utf8")) as unknown[]).map((event, i) => artifact(`supplied_decision_event_${i}`, "DecisionEvent", event, "1.0.0"));
  assert.deepEqual(reportOf(g, undefined, events).report, base);
  const p = withOperations("prose_executor", x => [operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Run only on synthetic_color_executor." })]);
  const colorOnly = executorBody([declaration("color_look", fullColorSupports)], { ...EXECUTOR, executorId: "synthetic_color_executor" });
  const h = graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm"))], snapshot: capabilitySnapshot([executorBody(), colorOnly]) });
  const capability = h.graph.executability.capability;
  assert.equal(capability.state, "capability_ready");
  if (capability.state === "capability_ready") assert.deepEqual(capability.eligibleExecutors, [EXECUTOR]);
  assert.equal(h.graph.executability.state, "not_execution_ready");
});

test("self-review: a 60-second graph is refused by UEP and kept whole", () => {
  const p = memo("sixty", () => plan(planningFixture({ duration: { minimumSeconds: 60, maximumSeconds: 60, preferredSeconds: 60 },
    boundary: { ...planningPolicyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...planningPolicyBody.search, maximumDepth: 15 },
    reuse: { ...planningPolicyBody.reuse, maximumUsesPerCandidate: 15 } }, directionFixture(0, false, { startSeconds: 0, endSeconds: 4 }))));
  const g = graphOf(p), { report } = reportOf(g);
  assert.equal(g.graph.output.durationTicks, 60e9);
  assert.equal(videoUses(g.graph).length, 15);
  assert.ok(videoUses(g.graph).every(c => c.source.precision === "source_seconds"));
  assert.equal(capabilityState(g.graph), "capability_ready");
  assert.deepEqual(dimension(report, "output_duration").findings.map(f => f.code), ["output_duration_outside_uep_range"]);
  assert.equal(UniversalEditPlanSchema.safeParse(probePlan(g.graph)).success, false);
});

test("self-review: a coordinated report forgery cannot relabel an out-of-range duration as compatible", () => {
  const g = graphOf(uep(16)), { report, artifacts } = reportOf(g);
  const dimensions = report.dimensions.map(d => d.dimension === "output_duration" ? { ...d, state: "compatible" as const, findings: [] } : d);
  const reasonCodes = report.outcome.reasonCodes.filter(code => code !== "output_duration_outside_uep_range");
  const forged = reidentify({ ...report, dimensions, timelineSubset: "compatible", outcome: { ...report.outcome, reasonCodes } }, "reportId", "uep_compatibility_report_v0");
  assert.equal(UepCompatibilityReportSchema.safeParse(forged).success, true, "the coordinated forgery must be structurally valid");
  assert.equal(errorCode(() => validateUepCompatibilityReport(forged, artifacts)), "report_replay_mismatch");
  assert.deepEqual(validateUepCompatibilityReport(report, [...artifacts].reverse()), report);
});

test("self-review round 2: hundreds of unverified deferred checks still yield an explicit refusal report", () => {
  const p = memo("many_edges", () => {
    const x = planningFixture(singleUse), hook = x.source.direction.nodes[0]!;
    const color = operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Warm." });
    const edges = Array.from({ length: 300 }, (_, i) => ({ edgeId: `edge_${String(i).padStart(3, "0")}`, type: "intended_order" as const, from: hook.nodeId, to: color.nodeId }));
    return plan(withDirection(x, { nodes: [hook, color], edges }));
  });
  const g = graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm"))] });
  assert.equal(g.graph.deferredChecks.filter(c => c.disposition === "not_verified_in_v0").length, 300);
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  const { report } = reportOf(g);
  const obligations = dimension(report, "operation_obligations");
  assert.deepEqual(obligations.findings.map(f => [f.code, f.subjects.length, f.evidence.length]), [["deferred_check_not_verified", 300, 300]]);
  assert.ok((report.outcome.reasonCodes as readonly string[]).includes("deferred_check_not_verified"));
});

test("self-review round 2: missing Gate-5 lineage artifacts fail as planning lineage, never as a partial graph", () => {
  const p = basic();
  for (const artifactType of ["PlanningAlternatives", "PlanningContext", "PlanningSearchRun", "CreativeDirectionGraph"]) {
    const removed = new Set(p.all.filter(a => a.ref.artifactType === artifactType).map(a => a.ref.objectId));
    assert.ok(removed.size > 0, artifactType);
    const inputs = graphInputs({ ...p, all: p.all.filter(a => !removed.has(a.ref.objectId)) });
    assert.equal(errorCode(() => buildEditGraph(inputs.request, inputs.artifacts)), "planning_lineage_invalid", artifactType);
  }
});

test("self-review round 2: V0 graphs are initial revisions only and report identity binds projection policy and reference", () => {
  const g = graphOf(uep(8));
  for (const patch of [{ revision: 1 }, { parent: present(g.graphArtifact.ref) }, { revision: 1, parent: present(g.graphArtifact.ref) }]) {
    assert.equal(EditGraphSchema.safeParse(reidentify({ ...g.graph, ...patch }, "editGraphId", "edit_graph_v0")).success, false);
  }
  const v10 = artifact("reference_v10", "ReferenceFingerprint", JSON.parse(readFileSync("samples/fixtures/reference-fingerprint.json", "utf8")), "1.0.0");
  const ids = [reportOf(g).report.reportId, reportOf(g, undefined, [], projectionPolicy({ author: { kind: "owner", actorId: "owner_other" } })).report.reportId,
    reportOf(g, present(v10.ref), [v10]).report.reportId];
  assert.equal(new Set(ids).size, 3);
});

// ---------------------------------------------------------------- independent owner review
/** Builds the capability snapshot without test helpers, so the regression means the same before and after the repair. */
function colorProofProbe(p: Planned, r: ReturnType<typeof resolution>, executors: unknown[], extra: SuppliedArtifact[]) {
  try {
    const snapshot = createCapabilitySnapshot({ artifactType: "CapabilitySnapshot", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope,
      environment: "synthetic_local_declared", asOf: TIME6, observation: "supplied_evidence_no_probe", executors });
    const g = graphOf(p, { resolutions: [r], snapshot, extra });
    const color = g.graph.capabilityRequirements.find(q => q.capabilityId === "color_look")!;
    const executability = g.graph.executability as unknown as { state: string; capability?: { state: string } };
    return { color: g.graph.capability.assessments.find(a => a.requirementId === color.requirementId)!.state as string,
      ready: executability.state === "executable" || executability.capability?.state === "capability_ready" };
  } catch (error) {
    if (error instanceof EditGraphError) return { rejected: error.code };
    throw error;
  }
}

test("owner review: an unrelated same-scope Evidence artifact cannot prove an AVAILABLE capability", () => {
  const { p, r } = warmResolved();
  const unrelated = artifact("gate6_unrelated_same_scope", "Evidence", { scope, note: "Same scope, but it attests nothing about any executor, capability, environment or support set." });
  const proof = [{ artifact: unrelated.ref, pointer: "" }], licensing = { eligiblePurposes: ["local_evaluation"] };
  // Self-declared status, supports and licensing backed only by the unrelated artifact.
  const selfDeclared = { ...EXECUTOR, declarations: [
    { capabilityId: "color_look", status: { state: "available", evidence: proof }, supports: [member("look", "neutral", "warm", "cool"), member("target_kind", "whole_output", "clip_uses")], licensing },
    { capabilityId: "timeline_video_clip", status: { state: "available", evidence: proof }, supports: VIDEO_SUPPORTS, licensing },
    { capabilityId: "transition_cut", status: { state: "available", evidence: proof }, supports: [member("transition_kind", "cut"), atMost("join_count", 119)], licensing },
  ] };
  // The same unrelated artifact offered directly as the proof artifact.
  const asProof = { ...EXECUTOR, declarations: [{ capabilityId: "color_look", attestation: unrelated.ref }] };
  for (const executor of [selfDeclared, asProof]) {
    const result = colorProofProbe(p, r, [executor], [unrelated]);
    assert.ok("rejected" in result || (result.color !== "AVAILABLE" && !result.ready), JSON.stringify(result));
  }
});

test("owner review: capability readiness never becomes overall execution readiness without budget-feasibility evidence", () => {
  const g = graphOf(uep(8));
  const executability = g.graph.executability as unknown as { state: string; permission: string; capability?: { state: string };
    budget?: { state: string; reasonCode: string }; blocking?: { code: string }[] };
  assert.notEqual(executability.state, "executable");
  assert.equal(executability.state, "not_execution_ready");
  assert.equal(executability.capability?.state, "capability_ready");
  assert.deepEqual([executability.budget?.state, executability.budget?.reasonCode], ["unverified", "budget_feasibility_unverified"]);
  assert.ok(executability.blocking?.some(b => b.code === "budget_feasibility_unverified"));
  assert.equal(executability.permission, "not_granted");
});

test("owner review: a 1.0.0 reference without exact join evidence is unverified rather than compatible", () => {
  const g = graphOf(uep(8)), { reference } = referenceFixtures();
  const result = dimension(reportOf(g, present(reference.ref), [reference]).report, "reference");
  assert.notEqual(result.state, "compatible");
  assert.deepEqual([result.state, result.findings.map(f => f.code)], ["unavailable", ["reference_join_evidence_unavailable"]]);
});

test("owner review: a foreign-project reference asset cannot make a 1.0.0 reference compatible", () => {
  const g = graphOf(uep(8)), { reference, asset } = referenceFixtures();
  const foreign = artifact("reference_asset_foreign", "MediaAsset", { ...asset, projectId: "foreign_project" }, "1.0.0");
  // Merely supplying an asset artifact verifies nothing.
  assert.notEqual(dimension(reportOf(g, present(reference.ref), [reference, foreign]).report, "reference").state, "compatible");
  const policy = projectionPolicy(), policyArtifact = supplied(policy, policy.projectionPolicyId);
  const request = { editGraph: g.graphArtifact.ref, policy: policyArtifact.ref, reference: present(reference.ref),
    referenceJoins: present({ asset: foreign.ref, audio: missing("not_applicable", "reference_has_no_audio") }) };
  const joined = dimension(assessUepCompatibility(request, [...g.artifacts, policyArtifact, reference, foreign]), "reference");
  assert.deepEqual([joined.state, joined.findings.map(f => f.code)], ["incompatible", ["reference_asset_foreign_scope"]]);
});

test("owner review audit: every frozen plan-input validator dependency is classified explicitly", () => {
  const p = memo("segments", () => plan(planningFixture(repeatedUses(8), variantDirectionFixture({ clipSegments: true }))));
  const { report } = reportOf(graphOf(p));
  const names = report.dimensions.map(d => d.dimension as string);
  for (const required of ["clip_asset_joins", "validation_time_access"]) assert.ok(names.includes(required), required);
  assert.equal(dimension(report, "clip_asset_joins").state, "compatible");
  assert.deepEqual(dimension(report, "validation_time_access").findings.map(f => f.code), ["validation_time_access_unverified"]);
  assert.equal((report as unknown as { planInputEligibility?: string }).planInputEligibility, "not_eligible");
});

// ---------------------------------------------------------------- owner-review adversarial self-review
test("owner-review self-review: unsupplied ClipSegments leave segment-to-asset and source-range joins explicitly unverified", () => {
  const g = graphOf(uep(8)), clipIds = videoUses(g.graph).map(c => c.clipUseId).sort();
  const without = reportOf(g).report, joins = dimension(without, "clip_segment_joins");
  assert.ok(joins !== undefined, "segment joins must be classified in their own dimension");
  assert.deepEqual([joins.state, joins.findings.map(f => [f.code, f.subjects])], ["unavailable", [["clip_segment_join_unverified", clipIds]]]);
  assert.ok((without.outcome.reasonCodes as readonly string[]).includes("clip_segment_join_unverified"));
  const segments = memo("segments", () => plan(planningFixture(repeatedUses(8), variantDirectionFixture({ clipSegments: true }))));
  assert.deepEqual(dimension(reportOf(graphOf(segments)).report, "clip_segment_joins"), { dimension: "clip_segment_joins", state: "compatible", findings: [] });
});

test("owner-review self-review: supplied reference join evidence must be exact even when it cannot make the reference compatible", () => {
  const g = graphOf(uep(8)), { asset } = referenceFixtures();
  const v11 = artifact("reference_v11", "ReferenceFingerprint", JSON.parse(readFileSync("tests/fixtures/reference-v11.json", "utf8")), "1.1.0");
  const assetArtifact = artifact("reference_asset", "MediaAsset", asset, "1.0.0");
  const otherAsset = artifact("reference_other_asset", "MediaAsset", { ...asset, assetId: "asset_other" }, "1.0.0");
  const dangling = { ...assetArtifact.ref, objectId: "reference_asset_not_supplied" };
  const joins = (assetRef: unknown, audio: unknown = missing("not_applicable", "reference_has_no_audio")) => present({ asset: assetRef, audio });
  // A refused 1.1.0 reference cannot carry unsupplied or mistyped join evidence into a report.
  assert.equal(errorCode(() => reportOf(g, present(v11.ref), [v11], undefined, joins(dangling))), "input_invalid");
  assert.equal(errorCode(() => reportOf(g, present(v11.ref), [v11, assetArtifact], undefined, joins(v11.ref))), "input_invalid");
  // An asset join for another asset leaves the reference unverified, but its audio join is still checked for exactness.
  const withAudio = artifact("reference_v10_audio", "ReferenceFingerprint", { ...createFixtures().reference, audioFingerprintId: "audio_reference" }, "1.0.0");
  assert.equal(errorCode(() => reportOf(g, present(withAudio.ref), [withAudio, otherAsset], undefined,
    joins(otherAsset.ref, present({ ...assetArtifact.ref, objectId: "reference_audio_not_supplied", artifactType: "AudioFingerprint" })))), "input_invalid");
  const recorded = reportOf(g, present(v11.ref), [v11, assetArtifact], undefined, joins(assetArtifact.ref)).report;
  assert.deepEqual(dimension(recorded, "reference").findings.map(f => f.code), ["reference_version_incompatible"]);
});

test("owner-review self-review: an attestation proves AVAILABLE only for its exact executor build, environment, capability, scope and time", () => {
  const { p, r } = warmResolved(), colorClaim = declaration("color_look", fullColorSupports), base = executorBody();
  const other = { ...EXECUTOR, executorId: "synthetic_other_executor" };
  const withColor = (attestationRef: unknown) => ({ ...EXECUTOR, declarations: base.declarations.map(d => d.capabilityId === "color_look" ? { ...d, attestation: attestationRef } : d) });
  const probe = (executors: unknown[], extra: SuppliedArtifact[] = []) => errorCode(() => graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot(executors), extra }));
  for (const identity of [other, { ...EXECUTOR, version: "0.2.0" }, { ...EXECUTOR, implementationDigest: "c".repeat(64) }]) {
    assert.equal(probe([withColor(attestation(colorClaim, identity).ref)]), "capability_snapshot_invalid", JSON.stringify(identity));
  }
  assert.equal(probe([withColor(attestation(colorClaim, EXECUTOR, { environment: "synthetic_other_environment" }).ref)]), "capability_snapshot_invalid");
  assert.equal(probe([withColor(attestation(declaration("timeline_video_clip", VIDEO_SUPPORTS)).ref)]), "capability_snapshot_invalid");
  assert.equal(probe([withColor(attestation(colorClaim, EXECUTOR, { observedAt: "2026-09-24T00:00:00.001Z" }).ref)]), "capability_snapshot_invalid");
  assert.equal(probe([withColor(attestation(colorClaim, EXECUTOR, { scope: { ...scope, projectId: "foreign_project" } }).ref)]), "scope_mismatch");
  // Two executors cannot borrow each other's proof, and a proof artifact is never another proof's supporting evidence.
  const own = attestation(colorClaim);
  assert.equal(probe([executorBody(), { ...other, declarations: [{ capabilityId: "color_look", attestation: own.ref }] }]), "capability_snapshot_invalid");
  const circular = attestation(declaration("color_look", fullColorSupports, { state: "available", evidence: [{ artifact: own.ref, pointer: "" }] }));
  assert.equal(probe([withColor(circular.ref)], [own]), "capability_snapshot_invalid");
  assert.equal(probe([withColor({ ...own.ref, objectId: "attestation_not_supplied" })]), "capability_snapshot_invalid");
  // The snapshot only indexes attestations: it cannot restate status, support or licensing beside them.
  for (const field of ["status", "supports", "licensing"]) {
    assert.equal(errorCode(() => capabilitySnapshot([{ ...EXECUTOR, declarations: [{ capabilityId: "color_look", attestation: own.ref, [field]: [] }] }])), "capability_snapshot_invalid", field);
  }
});

test("owner-review self-review: UNAVAILABLE or FAILED evidence can never also back an AVAILABLE attestation", () => {
  const { p, r } = warmResolved();
  const probe = (executors: unknown[]) => errorCode(() => graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot(executors) }));
  // The conformance evidence behind every other AVAILABLE attestation reused as color_look's unavailability or failed attempt.
  assert.equal(probe([executorBody(declarations({ color_look: declaration("color_look", fullColorSupports,
    { state: "unavailable", reasonCode: "unverified", nextCheckAfter: TIME6, evidence: conformanceRefs }) }))]), "capability_snapshot_invalid");
  assert.equal(probe([executorBody(declarations({ color_look: declaration("color_look", fullColorSupports,
    { state: "failed", failureCode: "probe_rejected", attempt: conformanceRefs }) }))]), "capability_snapshot_invalid");
  // Across executors: another executor's failed attempt cannot become this executor's conformance.
  const failedRefs = [{ artifact: failedAttempt.ref, pointer: "" }];
  const failedOther = executorBody([declaration("color_look", fullColorSupports, { state: "failed", failureCode: "probe_rejected", attempt: failedRefs })],
    { ...EXECUTOR, executorId: "synthetic_other_executor" });
  assert.equal(probe([executorBody(declarations({ color_look: declaration("color_look", fullColorSupports, { state: "available", evidence: failedRefs }) })), failedOther]),
    "capability_snapshot_invalid");
  // Split, single-polarity evidence stays valid, and an UNAVAILABLE attestation stays UNAVAILABLE whatever it could have supported.
  const g = graphOf(p, { resolutions: [r], snapshot: capabilitySnapshot([executorBody(declarations({ color_look: declaration("color_look", fullColorSupports,
    { state: "unavailable", reasonCode: "resource_blocked", nextCheckAfter: TIME6, evidence: unavailableRefs }) })), failedOther]) });
  const color = g.graph.capabilityRequirements.find(q => q.capabilityId === "color_look")!;
  assert.deepEqual(g.graph.capability.assessments.find(a => a.requirementId === color.requirementId)!.executors.map(e => [e.state, e.reasonCode]),
    [["UNAVAILABLE", "resource_blocked"], ["FAILED", "probe_rejected"]]);
  assert.equal(capabilityState(g.graph), "capability_not_ready");
});

test("owner-review self-review: non-canonical attestation bytes cannot misbind a proof", () => {
  const { p, r } = warmResolved(), base = executorBody();
  const two = [...conformanceRefs, { artifact: resources.ref, pointer: "" }];
  const canonical = attestation(declaration("color_look", fullColorSupports, { state: "available", evidence: two }));
  const value = canonical.value as { outcome: { conformance: { evidence: unknown[] } } } & Record<string, unknown>;
  assert.equal(value.outcome.conformance.evidence.length, 2);
  const reordered = artifact(canonical.ref.objectId, "CapabilityAttestation", { ...value, outcome: { ...value.outcome,
    conformance: { ...value.outcome.conformance, evidence: [...value.outcome.conformance.evidence].reverse() } } });
  const snapshot = capabilitySnapshot([{ ...EXECUTOR, declarations: base.declarations.map(d => d.capabilityId === "color_look" ? { ...d, attestation: reordered.ref } : d) }]);
  const inputs = graphInputs(p, { resolutions: [r], snapshot });
  const artifacts = [...inputs.artifacts.filter(a => a.ref.objectId !== canonical.ref.objectId), reordered];
  assert.equal(errorCode(() => buildEditGraph(inputs.request, artifacts)), "capability_snapshot_invalid");
});

test("owner-review self-review: no forged, missing, substituted or repurposed budget and no permission makes a graph execution-ready", () => {
  const p = uep(8), g = graphOf(p), graph = g.graph, readiness = graph.executability;
  assert.deepEqual(readiness.budget, { state: "unverified", reasonCode: "budget_feasibility_unverified", planningBudget: p.context.computeBudget,
    planningBudgetMeaning: "gate5_planning_authorization_not_execution_budget" });
  const { planningBudget: _planningBudget, ...withoutBudget } = readiness.budget;
  for (const patch of [{ state: "execution_ready" }, { state: "executable" }, { permission: "granted" }, { recheck: "not_required" }, { blocking: [] },
    { budget: { ...readiness.budget, state: "verified" } }, { budget: { ...readiness.budget, planningBudgetMeaning: "execution_budget" } },
    { budget: withoutBudget }]) {
    const forged = reidentify({ ...graph, executability: { ...readiness, ...patch } }, "editGraphId", "edit_graph_v0");
    assert.equal(EditGraphSchema.safeParse(forged).success, false, JSON.stringify(patch));
    assert.equal(errorCode(() => validateEditGraph(forged, g.artifacts)), "input_invalid", JSON.stringify(patch));
  }
  // A substituted budget reference is internally consistent, so only replay of the Gate-5 context can reject it.
  const substituted = reidentify({ ...graph, executability: { ...readiness, budget: { ...readiness.budget,
    planningBudget: { ...readiness.budget.planningBudget, objectId: "substituted_budget", sha256: "f".repeat(64) } } } }, "editGraphId", "edit_graph_v0");
  assert.equal(EditGraphSchema.safeParse(substituted).success, true);
  assert.equal(errorCode(() => validateEditGraph(substituted, g.artifacts)), "graph_replay_mismatch");
});

test("owner-review self-review: reference asset, kind, duration and audio joins are replayed from exact evidence only", () => {
  const g = graphOf(uep(8)), { asset, audio } = referenceFixtures(), fixture = createFixtures().reference;
  const media = (id: string, patch: Record<string, unknown> = {}) => artifact(id, "MediaAsset", { ...asset, ...patch }, "1.0.0");
  const sound = (id: string, patch: Record<string, unknown> = {}) =>
    artifact(id, "AudioFingerprint", { ...audio, fingerprintId: "audio_reference", assetId: asset.assetId, ...patch }, "1.0.0");
  const plain = artifact("reference_plain", "ReferenceFingerprint", fixture, "1.0.0");
  const voiced = artifact("reference_voiced", "ReferenceFingerprint", { ...fixture, audioFingerprintId: "audio_reference" }, "1.0.0");
  const noAudio = missing("not_applicable", "reference_has_no_audio");
  const classify = (reference: SuppliedArtifact, extra: SuppliedArtifact[], joins: unknown) => {
    const d = dimension(reportOf(g, present(reference.ref), [reference, ...extra], undefined, joins).report, "reference");
    return [d.state, d.findings.map(f => f.code)];
  };
  const inScope = media("reference_asset");
  assert.deepEqual(classify(plain, [inScope], present({ asset: inScope.ref, audio: noAudio })), ["compatible", []]);
  for (const [id, patch, expected] of [
    ["reference_asset_foreign_creator", { creatorId: "foreign_creator" }, ["incompatible", ["reference_asset_foreign_scope"]]],
    ["reference_asset_shorter", { durationSeconds: 19 }, ["incompatible", ["reference_asset_mismatch"]]],
    ["reference_asset_audio_kind", { kind: "audio" }, ["incompatible", ["reference_asset_mismatch"]]],
    ["reference_asset_other", { assetId: "asset_other" }, ["unavailable", ["reference_join_evidence_unavailable"]]],
  ] as const) {
    const joined = media(id, patch);
    assert.deepEqual(classify(plain, [joined], present({ asset: joined.ref, audio: noAudio })), expected, id);
  }
  const voice = sound("reference_audio");
  assert.deepEqual(classify(voiced, [inScope, voice], present({ asset: inScope.ref, audio: present(voice.ref) })), ["compatible", []]);
  assert.deepEqual(classify(voiced, [inScope], present({ asset: inScope.ref, audio: missing("unavailable", "reference_audio_not_supplied") })),
    ["unavailable", ["reference_join_evidence_unavailable"]]);
  for (const [id, patch, expected] of [
    ["reference_audio_other_fingerprint", { fingerprintId: "audio_other" }, ["unavailable", ["reference_join_evidence_unavailable"]]],
    ["reference_audio_other_asset", { assetId: "asset_music" }, ["incompatible", ["reference_audio_mismatch"]]],
    ["reference_audio_shorter", { durationSeconds: 19.5 }, ["incompatible", ["reference_audio_mismatch"]]],
  ] as const) {
    const joined = sound(id, patch);
    assert.deepEqual(classify(voiced, [inScope, joined], present({ asset: inScope.ref, audio: present(joined.ref) })), expected, id);
  }
  // Audio join evidence for a silent reference, or join evidence without any reference, is malformed input.
  assert.equal(errorCode(() => classify(plain, [inScope, voice], present({ asset: inScope.ref, audio: present(voice.ref) }))), "input_invalid");
  assert.equal(errorCode(() => reportOf(g, missing("not_applicable", "no_reference_required"), [inScope], undefined, present({ asset: inScope.ref, audio: noAudio }))),
    "input_invalid");
});

test("owner-review self-review: a pinned source asset of the wrong kind makes clip asset joins incompatible, not silently compatible", () => {
  const p = memo("audio_kind_asset", () => plan(planningFixture(repeatedUses(8), variantDirectionFixture({ assetKind: "audio" }))));
  const g = graphOf(p), { report } = reportOf(g), joins = dimension(report, "clip_asset_joins");
  assert.deepEqual([joins.state, joins.findings.map(f => [f.code, f.subjects.length, f.evidence.map(e => e.pointer)])], ["incompatible", [["clip_asset_not_video", 8, ["/kind"]]]]);
  assert.equal(report.timelineSubset, "compatible");
  assert.equal(report.planInputEligibility, "not_eligible");
  assert.ok(report.outcome.reasonCodes.includes("clip_asset_not_video"));
});

test("owner-review self-review: access, segment, telemetry and metadata gaps keep every chain ineligible for frozen plan-input validation", () => {
  const segments = memo("segments", () => plan(planningFixture(repeatedUses(8), variantDirectionFixture({ clipSegments: true }))));
  for (const g of [graphOf(uep(8)), graphOf(segments)]) {
    const { report } = reportOf(g), access = dimension(report, "validation_time_access");
    assert.deepEqual([access.state, access.findings.map(f => [f.code, f.evidence.map(e => e.pointer)])], ["unavailable", [["validation_time_access_unverified", ["/sourceAccess"]]]]);
    assert.equal(report.planInputEligibility, "not_eligible");
    for (const name of ["telemetry", "plan_metadata"]) assert.equal(dimension(report, name).state, "unavailable", name);
    assert.deepEqual([report.outcome.kind, report.outcome.plan, report.outcome.decisionEvents], ["refused", "not_produced", "not_emitted"]);
  }
  // A coordinated report forgery cannot declare plan-input eligibility or verified access.
  const { report, artifacts } = reportOf(graphOf(segments));
  const dimensions = report.dimensions.map(d => d.dimension === "validation_time_access" ? { ...d, state: "compatible" as const, findings: [] } : d);
  const reasonCodes = report.outcome.reasonCodes.filter(code => code !== "validation_time_access_unverified");
  const forged = reidentify({ ...report, dimensions, outcome: { ...report.outcome, reasonCodes } }, "reportId", "uep_compatibility_report_v0");
  assert.equal(UepCompatibilityReportSchema.safeParse(forged).success, true);
  assert.equal(errorCode(() => validateUepCompatibilityReport(forged, artifacts)), "report_replay_mismatch");
  const eligible = reidentify({ ...report, planInputEligibility: "eligible" }, "reportId", "uep_compatibility_report_v0");
  assert.equal(UepCompatibilityReportSchema.safeParse(eligible).success, false);
});

test("Gate-5 deferred requirement checks remain explicit V0 blockers after operation binding", () => {
  const p = withOperations("requirement_color", x => [{ ...operationNode(x, "node_color", { kind: "color_intention", mood: "warm", description: "Warm." }), requirementIds: ["include_subject"] }]);
  const g = graphOf(p, { resolutions: [resolution(p, "node_color", "color_intention", colorLook("warm"))] });
  assert.equal(g.graph.obligations[0]!.disposition.state, "bound_to_operation");
  const check = g.graph.deferredChecks.find(c => c.reasonCode === "structural_requirement_coverage")!;
  assert.deepEqual([check.origin, check.disposition], ["hard_constraint", "not_verified_in_v0"]);
  assert.equal(capabilityState(g.graph), "capability_not_ready");
  assert.ok(g.graph.unresolved.some(u => u.code === "deferred_check_not_verified" && u.subjectId === check.checkId));
});
