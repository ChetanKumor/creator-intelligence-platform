import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { EditorialArtifactMap, identify, missing, type EvidenceRef, type SuppliedArtifact } from "../packages/editorial/common.js";
import { createCreativeDirectionGraph } from "../packages/director/index.js";
import { budget } from "../packages/routing/index.js";
import { decisionFixture } from "./support/editorial.js";
import { createPlanningPolicy, PlanningPolicySchema, PlanningOutcomeSchema, createPlanningContext, runPlanning, retrieveCandidates, proposeBoundaries,
  validatePlanningDecision, validatePlanningSearchRun, validatePlanningRetrieval, validatePlanningBoundary, validatePlanningBoundarySet, validatePlanningAlternatives,
  PlanningContextSchema, PlanningDecisionSchema, PlanningBoundarySchema, PlanningSequenceSchema,
  PlanningRetrievalSchema, PlanningBoundarySetSchema, PlanningAlternativesSchema, PlanningBudgetTraceSchema, PlanningSearchRunSchema } from "../packages/planning/index.js";
import { artifact, directionFixture } from "./support/planning.js";

function reidentify(value: object, key: string, namespace: string) {
  const body = { ...value } as Record<string, unknown>;
  delete body[key];
  return identify(namespace, key, body);
}

export const policyBody = {
  artifactType: "PlanningPolicy", artifactVersion: "0.1.0", stability: "internal_pre_stable",
  scope: { projectId: "project_synthetic", creatorId: "creator_synthetic", purpose: "local_evaluation" },
  author: { kind: "owner", actorId: "owner_synthetic" },
  retrieval: { method: "exact_direction_bindings_v0", maxCandidatesPerNode: 8 },
  boundary: { method: "candidate_and_sample_pts_v0", maxEvidencePoints: 8, maxOptionsPerCandidate: 16 },
  duration: { minimumSeconds: 2, maximumSeconds: 3, preferredSeconds: 2 },
  trim: { minimumSeconds: 0.25, maximumSeconds: 4 },
  search: { algorithm: "bounded_beam_v0", maximumDepth: 3, frontierWidth: 8, maximumExpandedStates: 128, maximumOptionsRetained: 16, manifestLimit: 128 },
  reuse: { maximumUsesPerCandidate: 2, precedingUsePolicy: "count_for_reuse_and_repetition" },
  objectives: [
    { name: "direction_coverage", definitionVersion: "0.1.0", preference: "higher", missing: "block" },
    { name: "duration_deviation", definitionVersion: "0.1.0", preference: "lower", missing: "block" },
    { name: "repetition_count", definitionVersion: "0.1.0", preference: "lower", missing: "block" },
  ],
  scoring: "lexicographic_components_v0",
  tie: { epsilon: 0, policy: "retain_all_within_component_epsilon" },
  seed: { kind: "deterministic", policyVersion: "0.1.0", ordering: "canonical_ids" },
  stopping: "declared_bounds_or_empty_frontier",
  requirementSemantics: "structural_node_coverage_only",
  executionAssessment: "deferred",
};

test("planning policy is strict, explicit, versioned and identity bearing", () => {
  const policy = createPlanningPolicy(policyBody);
  assert.deepEqual(PlanningPolicySchema.parse(policy), policy);
  assert.equal(policy.artifactVersion, "0.1.0");
  assert.notEqual(createPlanningPolicy({ ...policyBody, tie: { ...policyBody.tie, epsilon: 0.01 } }).policyId, policy.policyId);
  assert.throws(() => createPlanningPolicy({ ...policyBody, magicQuality: 1 }));
  assert.throws(() => createPlanningPolicy({ ...policyBody, artifactVersion: "9.0.0" }));
});

for (const [key, value] of [["maximumDepth", 0], ["frontierWidth", Infinity], ["maximumExpandedStates", -1],
  ["maximumOptionsRetained", 1000000], ["manifestLimit", 0], ["maximumDepth", 1.5]] as const) {
  test(`unsafe planning search bound ${key}=${value} fails closed`, () => {
    assert.throws(() => createPlanningPolicy({ ...policyBody, search: { ...policyBody.search, [key]: value } }));
  });
}

test("planning outcome alternatives never coerce tie, abstention or infeasibility into a winner", () => {
  assert.deepEqual(PlanningOutcomeSchema.parse({ kind: "tie", optionIds: ["option_a"] }), { kind: "tie", optionIds: ["option_a"] });
  assert.throws(() => PlanningOutcomeSchema.parse({ kind: "tie", optionIds: [] }));
  for (const kind of ["abstained", "infeasible"]) {
    assert.throws(() => PlanningOutcomeSchema.parse({ kind, reasonCode: "no_feasible_considered_sequence", optionId: "invented" }));
  }
});

function fixture(patch: Record<string, unknown> = {}, range = { startSeconds: 0, endSeconds: 2 }, secondCandidate = false, exclusion = false, omitSourceView = false) {
  const source = directionFixture(0, false, range, secondCandidate, exclusion, omitSourceView);
  const policy = createPlanningPolicy({ ...policyBody, ...patch });
  const policyArtifact = artifact(policy.policyId, "PlanningPolicy", policy);
  const artifacts = [...source.supplied, policyArtifact];
  const contextBody = { artifactType: "PlanningContext", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope: source.request.scope,
    direction: source.directionArtifact.ref, directorRequest: source.requestArtifact.ref, worldSnapshot: source.worldArtifact.ref,
    worldView: source.viewArtifact.ref, worldQuery: source.worldQuery, candidateUniverse: source.setArtifact.ref, candidates: source.set.candidates,
    policy: policyArtifact.ref, computeBudget: source.budgetArtifact.ref, previousDecisions: [], precedingUses: [] };
  const context = createPlanningContext(contextBody, artifacts), contextArtifact = artifact(context.contextId, "PlanningContext", context);
  artifacts.push(contextArtifact);
  return { source, policy, policyArtifact, context, contextBody, contextArtifact, artifacts };
}
const execute = (x: ReturnType<typeof fixture>) => runPlanning(x.contextArtifact.ref, x.artifacts);
const fullArtifacts = (x: ReturnType<typeof fixture>, run: ReturnType<typeof runPlanning>) => [...x.artifacts, ...run.artifacts];

test("exact Gate-4 direction produces grounded alternatives, bounded autonomous choice and replay", () => {
  const x = fixture(), run = execute(x), artifacts = fullArtifacts(x, run);
  assert.equal(run.decision.outcome.kind, "chosen");
  assert.ok(run.manifest.options.length > 1);
  assert.ok(run.manifest.options.length <= x.policy.search.maximumExpandedStates);
  assert.deepEqual(validatePlanningDecision(run.decision, artifacts), run.decision);
  assert.deepEqual(validatePlanningSearchRun(run.searchRun, artifacts), run.searchRun);
  assert.deepEqual(validatePlanningAlternatives(run.manifest, artifacts), run.manifest);
  assert.deepEqual(execute(x), run);
  assert.equal(run.decision.direction.sha256, x.source.directionArtifact.ref.sha256);
  assert.equal(run.budgetTrace.cost.state, "unavailable");
  assert.equal(run.budgetTrace.duration.state, "not_computed");
  assert.equal(x.source.perception.lookup.status, "cache_hit");
  assert.equal(x.source.world.perceptionBindings[0]!.receipt.modelRunCreated, false);
});

test("retrieval accounts for exact supplied candidates and does not pretend to calibrate a score", () => {
  const x = fixture(), result = retrieveCandidates(x.contextArtifact.ref, "node_hook", x.artifacts);
  assert.deepEqual(validatePlanningRetrieval(result, x.artifacts), result);
  assert.deepEqual(result.entries.map(e => e.candidateId), x.source.set.candidates.map(c => c.candidateId));
  assert.equal(result.entries[0]!.reason, "exact_direction_binding");
  assert.equal(result.entries[0]!.missingSemanticPrediction.state, "not_computed");
  assert.throws(() => validatePlanningRetrieval(reidentify({ ...result, entries: [...result.entries, { ...result.entries[0], candidateId: "unknown" }] }, "retrievalId", "planning_retrieval_v0"), x.artifacts));
});

test("unknown direction node, unknown candidate and wrong token snapshot fail", () => {
  const x = fixture(), candidate = x.context.candidates[0]!;
  assert.throws(() => retrieveCandidates(x.contextArtifact.ref, "unknown", x.artifacts));
  assert.throws(() => proposeBoundaries(x.contextArtifact.ref, "unknown", candidate.token, x.artifacts));
  assert.throws(() => proposeBoundaries(x.contextArtifact.ref, candidate.candidateId, { ...candidate.token, sha256: "f".repeat(64) }, x.artifacts));
  assert.throws(() => createPlanningContext({ ...x.contextBody, candidates: [{ ...candidate, token: { ...candidate.token, sha256: "f".repeat(64) } }] }, x.artifacts));
  assert.throws(() => createPlanningContext({ ...x.contextBody, candidates: [] }, x.artifacts));
});

for (const field of ["projectId", "creatorId", "purpose"] as const) test(`foreign planning ${field} fails`, () => {
  const x = fixture();
  assert.throws(() => createPlanningContext({ ...x.contextBody, scope: { ...x.context.scope, [field]: "foreign" } }, x.artifacts));
});

test("candidate boundary alternatives bind exact samples, PTS, source hash, analysis and shot", () => {
  const x = fixture(), candidate = x.context.candidates[0]!, result = proposeBoundaries(x.contextArtifact.ref, candidate.candidateId, candidate.token, x.artifacts);
  assert.ok(result.options.length > 1);
  for (const boundary of result.options) {
    assert.equal(boundary.precision, "frame_pts_exact");
    assert.ok(boundary.sourceRange.startSeconds >= 0 && boundary.sourceRange.endSeconds <= 2);
    assert.deepEqual(validatePlanningBoundary(boundary, x.artifacts), boundary);
  }
});

for (const [name, patch] of [
  ["invented fractional source range", { sourceRange: { startSeconds: 0.13, endSeconds: 1.97 } }],
  ["range outside candidate", { sourceRange: { startSeconds: 0, endSeconds: 3 } }],
  ["range outside shot", { sourceRange: { startSeconds: 0, endSeconds: 5 } }],
  ["source hash substitution", { sourceHash: "f".repeat(64) }],
  ["wrong analysis", { analysis: { objectId: "wrong", artifactType: "FootageAnalysis", artifactVersion: "1.0.0", sha256: "f".repeat(64) } }],
] as const) test(`boundary rejects ${name} even after semantic reidentification`, () => {
  const x = fixture(), candidate = x.context.candidates[0]!, boundary = proposeBoundaries(x.contextArtifact.ref, candidate.candidateId, candidate.token, x.artifacts).options[0]!;
  assert.throws(() => validatePlanningBoundary(reidentify({ ...boundary, ...patch }, "boundaryId", "planning_boundary_v0"), x.artifacts));
});

test("fake frame index, fake sample and Director prose cannot become boundary authority", () => {
  const x = fixture(), boundary = execute(x).boundaries[0]!.options[0]!;
  assert.match(x.source.direction.nodes[0]!.intent.kind === "story_beat" ? x.source.direction.nodes[0]!.intent.description : "", /12 seconds/);
  for (const patch of [
    { startAuthority: { kind: "frame_pts", frameIndex: 700, evidence: { artifact: boundary.analysis, pointer: "/metadata/frameTimes/0" } } },
    { sourceRange: { startSeconds: 12, endSeconds: 14 } },
    { sampleEvidence: [{ sampleId: "fabricated", frameIndex: 0, atSeconds: 0, frameHash: "a".repeat(64), evidence: boundary.timebase }] },
    { startAuthority: { kind: "candidate_endpoint", evidence: { artifact: x.source.directionArtifact.ref, pointer: "/nodes/0/intent/description" } } },
  ]) assert.throws(() => validatePlanningBoundary(reidentify({ ...boundary, ...patch }, "boundaryId", "planning_boundary_v0"), x.artifacts));
});

test("off-grid trusted candidate endpoints retain weaker source-seconds precision", () => {
  const x = fixture({}, { startSeconds: 0.13, endSeconds: 1.97 }), candidate = x.context.candidates[0]!;
  const boundary = proposeBoundaries(x.contextArtifact.ref, candidate.candidateId, candidate.token, x.artifacts).options[0]!;
  assert.equal(boundary.precision, "source_seconds");
  assert.equal(boundary.startAuthority.kind, "candidate_endpoint");
  assert.throws(() => validatePlanningBoundary(reidentify({ ...boundary, precision: "frame_pts_exact" }, "boundaryId", "planning_boundary_v0"), x.artifacts));
});

test("equal viable trims produce an explicit tie and never an invented winner", () => {
  const x = fixture({ duration: { minimumSeconds: 1.5, maximumSeconds: 1.5, preferredSeconds: 1.5 } }), run = execute(x);
  assert.equal(run.decision.outcome.kind, "tie");
  if (run.decision.outcome.kind !== "tie") throw new Error("Expected tied trims.");
  assert.ok(run.decision.outcome.optionIds.length >= 2);
  const tiedId = run.decision.outcome.optionIds[0]!;
  assert.throws(() => validatePlanningDecision(reidentify({ ...run.decision, outcome: { kind: "chosen", optionId: tiedId } }, "planningDecisionId", "planning_decision_v0"), fullArtifacts(x, run)));
});

test("infeasible duration records considered evidence without a chosen option", () => {
  const x = fixture({ duration: { minimumSeconds: 5, maximumSeconds: 5, preferredSeconds: 5 }, search: { ...policyBody.search, maximumDepth: 1 } }), run = execute(x);
  assert.equal(run.decision.outcome.kind, "infeasible");
  assert.equal("optionId" in run.decision.outcome, false);
  assert.ok(run.manifest.options.every(e => e.selection === "pruned"));
});

test("missing objective evidence remains unavailable, blocks selection and never becomes zero", () => {
  const x = fixture({ duration: { minimumSeconds: 0.25, maximumSeconds: 1, preferredSeconds: 0.3 },
    objectives: [{ name: "mean_stability", definitionVersion: "0.1.0", preference: "higher", missing: "abstain" }] }, { startSeconds: 0.1, endSeconds: 0.4 });
  const run = execute(x);
  assert.equal(run.decision.outcome.kind, "abstained");
  assert.ok(run.manifest.options.every(e => e.option.components[0]!.value.state === "unavailable"));
  assert.equal("optionId" in run.decision.outcome, false);
});

test("repeated candidate uses have distinct occurrence IDs and preserve preceding identity", () => {
  const x = fixture(), run = execute(x), repeated = run.manifest.options.find(e => e.option.uses.length === 2)!.option;
  assert.notEqual(repeated.uses[0]!.useId, repeated.uses[1]!.useId);
  assert.deepEqual(repeated.uses[1]!.precedingUseId, { state: "present", value: repeated.uses[0]!.useId });
  assert.throws(() => PlanningSequenceSchema.parse(reidentify({ ...repeated, uses: [repeated.uses[0], repeated.uses[0]] }, "optionId", "planning_sequence_v0")));
});

test("sequence order and score mutation change sequence identity", () => {
  const run = execute(fixture()), option = run.manifest.options.find(e => e.option.uses.length === 2)!.option;
  assert.notEqual(reidentify({ ...option, uses: [...option.uses].reverse() }, "optionId", "planning_sequence_v0").optionId, option.optionId);
  assert.notEqual(reidentify({ ...option, components: [] }, "optionId", "planning_sequence_v0").optionId, option.optionId);
  assert.throws(() => PlanningSequenceSchema.parse({ ...option, components: [] }));
});

for (const [name, patch] of [
  ["objectives", { objectives: [...policyBody.objectives].reverse() }],
  ["bounds", { search: { ...policyBody.search, maximumExpandedStates: 127 } }],
  ["seed policy", { seed: { ...policyBody.seed, ordering: "reverse_canonical_ids" } }],
] as const) test(`changed ${name} changes context, search and decision identity`, () => {
  const left = fixture(), right = fixture(patch);
  assert.notEqual(left.policy.policyId, right.policy.policyId);
  assert.notEqual(left.context.contextId, right.context.contextId);
  assert.notEqual(execute(left).decision.planningDecisionId, execute(right).decision.planningDecisionId);
});

test("unknown chosen/tied options and independently mutated runtime outcomes fail replay", () => {
  const x = fixture(), run = execute(x), artifacts = fullArtifacts(x, run);
  for (const outcome of [{ kind: "chosen", optionId: "unknown" }, { kind: "tie", optionIds: ["unknown"] }, { kind: "abstained", reasonCode: "search_limit" }]) {
    assert.throws(() => validatePlanningDecision(reidentify({ ...run.decision, outcome }, "planningDecisionId", "planning_decision_v0"), artifacts));
    assert.throws(() => validatePlanningSearchRun(reidentify({ ...run.searchRun, outcome }, "searchRunId", "planning_search_run_v0"), artifacts));
  }
});

test("invented considered options and dishonest pruning reasons fail replay", () => {
  const x = fixture(), run = execute(x);
  const first = run.manifest.options[0]!;
  for (const options of [[...run.manifest.options, { ...first, option: { ...first.option, optionId: "not_generated" } }],
    [{ ...first, selection: "pruned", selectionReason: "candidate_reuse_bound" }, ...run.manifest.options.slice(1)]]) {
    assert.throws(() => validatePlanningAlternatives(reidentify({ ...run.manifest, options }, "manifestId", "planning_alternatives_v0"), fullArtifacts(x, run)));
  }
  assert.equal(run.manifest.globalOptimality, false);
  assert.equal(run.manifest.exhaustive, false);
});

test("strict schemas reject public planning bindings, vendor payloads and unknown nested fields", () => {
  const x = fixture(), run = execute(x);
  for (const [schema, value] of [[PlanningContextSchema, x.context], [PlanningDecisionSchema, run.decision], [PlanningBoundarySchema, run.boundaries[0]!.options[0]!]] as const) {
    for (const field of ["planId", "slotId", "winnerCandidateId", "confidence", "providerResponse", "unknown"]) assert.throws(() => schema.parse({ ...value, [field]: "forbidden" }));
  }
  assert.throws(() => createPlanningContext({ ...x.contextBody, worldQuery: { ...x.contextBody.worldQuery, discoverFiles: true } }, x.artifacts));
  assert.throws(() => createPlanningPolicy({ ...policyBody, seed: { ...policyBody.seed, seed: 7 } }));
});

test("planning emits no public events, output plans or execution identities", () => {
  const run = execute(fixture());
  const text = JSON.stringify(run);
  for (const field of ["planId", "slotId", "winnerCandidateId", "DecisionEvent", "EditGraph", "UniversalEditPlan", "outputStartSeconds"]) assert.equal(text.includes(`\"${field}\"`), false, field);
  assert.deepEqual(run.artifacts.map(a => a.ref.artifactType).filter(t => ["CostEvent", "ModelRun", "DecisionEvent"].includes(t)), []);
});

test("planning core has no provider, filesystem, network, process, model or media execution dependency", () => {
  const files = readdirSync("packages/planning").filter(f => f.endsWith(".ts"));
  for (const file of files) {
    const source = readFileSync(`packages/planning/${file}`, "utf8");
    assert.doesNotMatch(source, /node:(?:fs|net|http|child_process)|providers\/|process\.|Date\.now|Math\.random|new Date|\bfetch\s*\(|\bimport\s*\(/);
    assert.doesNotMatch(source, /analyzeFootage\s*\(|analyzeReference\s*\(|\.embed\s*\(|UniversalEditPlanSchema|DecisionEventSchema/);
  }
});

// Explicit artifact replacement for adversarial tests; source fixture bytes remain separate snapshots.
function replaceArtifacts(artifacts: SuppliedArtifact[], replacements: SuppliedArtifact[]) {
  return [...artifacts.filter(a => !replacements.some(r => r.ref.objectId === a.ref.objectId)), ...replacements];
}

test("even rehashed contradictory receipt/manifest artifacts cannot override runtime replay", () => {
  const x = fixture(), run = execute(x);
  const alteredRun = reidentify({ ...run.searchRun, outcome: { kind: "chosen", optionId: "forged" } }, "searchRunId", "planning_search_run_v0");
  const alteredArtifact = artifact(run.decision.searchRun.objectId, "PlanningSearchRun", alteredRun);
  const alteredDecision = reidentify({ ...run.decision, searchRun: alteredArtifact.ref, outcome: { kind: "chosen", optionId: "forged" } }, "planningDecisionId", "planning_decision_v0");
  assert.throws(() => validatePlanningDecision(alteredDecision, replaceArtifacts(fullArtifacts(x, run), [alteredArtifact])));
});

test("self-review: a candidate-scoped direction cannot retrieve other referenced candidates as substitutes", () => {
  const x = fixture({}, undefined, true);
  const result = retrieveCandidates(x.contextArtifact.ref, "node_hook", x.artifacts);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries.filter(e => e.included).map(e => e.candidateId), [x.source.candidate.candidateId]);
  const outside = result.entries.find(e => e.candidateId !== x.source.candidate.candidateId)!;
  assert.equal(outside.reason, "outside_direction_scope");
  const run = execute(x);
  assert.ok(run.manifest.options.every(e => e.option.uses.every(u => u.candidateId === x.source.candidate.candidateId)));
});

test("candidate input permutation preserves canonical context and retrieval identity", () => {
  const x = fixture({}, undefined, true);
  const reversed = createPlanningContext({ ...x.contextBody, candidates: [...x.contextBody.candidates].reverse() }, x.artifacts);
  assert.deepEqual(reversed, x.context);
  const a = retrieveCandidates(x.contextArtifact.ref, "node_hook", x.artifacts);
  const b = retrieveCandidates(x.contextArtifact.ref, "node_hook", [...x.artifacts].reverse());
  assert.equal(a.retrievalId, b.retrievalId);
});

function withDirection(x: ReturnType<typeof fixture>, patch: Partial<Parameters<typeof createCreativeDirectionGraph>[0]>) {
  const direction = createCreativeDirectionGraph({ ...x.source.directionBody, ...patch }, x.source.requestArtifact.ref, x.source.authority);
  const directionArtifact = artifact(direction.directionId, "CreativeDirectionGraph", direction);
  const artifacts = [...x.artifacts, directionArtifact];
  const contextBody = { ...x.contextBody, direction: directionArtifact.ref };
  const context = createPlanningContext(contextBody, artifacts), contextArtifact = artifact(context.contextId, "PlanningContext", context);
  artifacts.push(contextArtifact);
  return { ...x, contextBody, context, contextArtifact, artifacts };
}

test("a valid supplied candidate outside the pinned universe cannot enter retrieval or boundaries", () => {
  const x = fixture(), outside = decisionFixture();
  const extra = outside.supplied.filter(a => a.ref.objectId.endsWith("_second") || a.ref.objectId === "object_token_1");
  const artifacts = [...x.artifacts, ...extra], foreign = outside.set.candidates.find(c => c.token.objectId === "object_token_1")!;
  assert.ok(new EditorialArtifactMap(artifacts).get(foreign.token));
  const result = retrieveCandidates(x.contextArtifact.ref, "node_hook", artifacts);
  assert.equal(result.entries.some(e => e.candidateId === foreign.candidateId), false);
  assert.throws(() => proposeBoundaries(x.contextArtifact.ref, foreign.candidateId, foreign.token, artifacts));
  assert.throws(() => createPlanningContext({ ...x.contextBody, candidates: [...x.context.candidates, foreign] }, artifacts));
  assert.throws(() => validatePlanningRetrieval(reidentify({ ...result, entries: [...result.entries, { ...result.entries[0], ...foreign }] }, "retrievalId", "planning_retrieval_v0"), artifacts));
});

test("hard requirements cannot be removed, softened or silently ignored by search", () => {
  const x = fixture({ search: { ...policyBody.search, maximumDepth: 1 } }), node = x.source.direction.nodes[0]!;
  assert.throws(() => withDirection(x, { nodes: [{ ...node, requirementIds: [] }] }));
  assert.throws(() => withDirection(x, { nodes: [{ ...node, priority: "soft" }] }));
  const extra = { ...node, nodeId: "node_required_second", requirementIds: [] };
  const run = execute(withDirection(x, { nodes: [node, extra] }));
  assert.equal(run.decision.outcome.kind, "infeasible");
  assert.ok(run.manifest.options.every(e => e.option.hardConstraints.some(c => c.state === "pending" && c.reasonCode === "structural_direction_coverage")));
  const unresolved = execute(withDirection(x, { nodes: [{ ...node, requirementIds: ["output_short"] }], unresolvedRequirements: [
    { findingId: "finding_missing", subjectId: "include_subject", severity: "blocking", code: "missing_hard_requirement", evidenceRefs: node.evidenceRefs },
  ] }));
  assert.deepEqual(unresolved.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
});

test("empty search cannot choose and retains blocking evidence", () => {
  const x = fixture(), run = execute(withDirection(x, { nodes: [], unresolvedRequirements: [
    { findingId: "finding_include", subjectId: "include_subject", severity: "blocking", code: "missing_hard_requirement", evidenceRefs: [] },
    { findingId: "finding_output", subjectId: "output_short", severity: "blocking", code: "missing_hard_requirement", evidenceRefs: [] },
  ] }));
  assert.deepEqual(run.manifest.options, []);
  assert.equal(run.searchRun.expandedStates, 0);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
});

test("intended order and required dependencies constrain actual sequence order", () => {
  const x = fixture({ duration: { minimumSeconds: 4, maximumSeconds: 4, preferredSeconds: 4 },
    boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 2 } });
  const from = x.source.direction.nodes[0]!, to = { ...from, nodeId: "node_resolution", requirementIds: [] };
  const changed = withDirection(x, { nodes: [from, to], edges: [
    { edgeId: "edge_order", type: "intended_order", from: from.nodeId, to: to.nodeId },
    { edgeId: "edge_required", type: "requires", from: from.nodeId, to: to.nodeId },
  ] });
  const run = execute(changed);
  assert.equal(run.decision.outcome.kind, "chosen");
  if (run.decision.outcome.kind !== "chosen") throw new Error("Expected one ordered sequence.");
  const winnerId = run.decision.outcome.optionId;
  const selected = run.manifest.options.find(e => e.option.optionId === winnerId)!.option;
  assert.deepEqual(selected.uses.map(u => u.directionNodeId), [from.nodeId, to.nodeId]);
  const reversed = run.manifest.options.find(e => e.option.uses.map(u => u.directionNodeId).join(",") === `${to.nodeId},${from.nodeId}`)!;
  assert.notEqual(reversed.option.optionId, selected.optionId);
  assert.equal(reversed.expansionReason, "hard_constraint");
  assert.ok(reversed.option.hardConstraints.some(c => c.reasonCode === "intended_order" && c.state === "fail"));
  assert.ok(run.manifest.options.some(e => e.option.hardConstraints.some(c => c.reasonCode === "required_direction_dependency" && c.state === "pending")));
});

test("mutually exclusive Director choices remain alternatives and cannot be combined", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 },
    duration: { minimumSeconds: 2, maximumSeconds: 4, preferredSeconds: 2 }, search: { ...policyBody.search, maximumDepth: 2 } });
  const a = x.source.direction.nodes[0]!, b = { ...a, nodeId: "node_other_hook" };
  const run = execute(withDirection(x, { nodes: [a, b], edges: [{ edgeId: "edge_alternative", type: "alternative_to", from: a.nodeId, to: b.nodeId }],
    alternatives: [{ branchId: "branch_hook", choices: [{ choiceId: "choice_a", nodeIds: [a.nodeId] }, { choiceId: "choice_b", nodeIds: [b.nodeId] }] }] }));
  assert.equal(run.decision.outcome.kind, "tie");
  const mixed = run.manifest.options.filter(e => e.option.coveredNodeIds.length === 2);
  assert.ok(mixed.length > 0);
  assert.ok(mixed.every(e => e.selectionReason === "hard_constraint" && e.option.hardConstraints.some(c => c.state === "fail" && c.reasonCode === "mutually_exclusive_complete_branch")));
});

test("retrieval limits retain excluded candidates and never generate their sequences", () => {
  const x = fixture({ retrieval: { ...policyBody.retrieval, maxCandidatesPerNode: 1 } }, undefined, true);
  const changed = withDirection(x, { nodes: [{ ...x.source.direction.nodes[0]!, scope: { kind: "whole_edit" } }] });
  const run = execute(changed), entries = run.retrievals[0]!.entries;
  assert.equal(entries.length, 2);
  assert.equal(entries[0]!.included, true);
  assert.equal(entries[1]!.reason, "retrieval_limit");
  assert.ok(run.manifest.options.every(e => e.option.uses.every(u => u.candidateId === entries[0]!.candidateId)));
  assert.equal(run.manifest.exhaustive, false);
});

test("finite expansion, frontier and retention bounds carry truthful separate reasons", () => {
  const x = fixture({ search: { ...policyBody.search, maximumExpandedStates: 7, frontierWidth: 1, maximumOptionsRetained: 1 } });
  const run = execute(x);
  assert.equal(run.manifest.options.length, 7);
  assert.equal(run.searchRun.stoppingReason, "expanded_state_limit");
  assert.ok(run.manifest.options.some(e => e.expansionReason === "frontier_limit"));
  assert.ok(run.manifest.options.some(e => e.expansionReason === "duration_bound"));
  assert.ok(run.manifest.options.some(e => e.expansionReason === "search_limit"));
  const tie = execute(fixture({ duration: { minimumSeconds: 1.5, maximumSeconds: 1.5, preferredSeconds: 1.5 }, search: { ...policyBody.search, maximumOptionsRetained: 1 } }));
  assert.deepEqual(tie.decision.outcome, { kind: "abstained", reasonCode: "tie_exceeds_retention_bound" });
  assert.ok(tie.manifest.options.some(e => e.selectionReason === "options_limit"));
  const exhausted = execute(fixture({ duration: { minimumSeconds: 5, maximumSeconds: 5, preferredSeconds: 5 }, search: { ...policyBody.search, maximumExpandedStates: 1 } }));
  assert.deepEqual(exhausted.decision.outcome, { kind: "abstained", reasonCode: "search_limit" });
});

test("pruning caused by missing objective evidence remains missing under block policy", () => {
  const x = fixture({ duration: { minimumSeconds: 0.25, maximumSeconds: 1, preferredSeconds: 0.3 },
    objectives: [{ name: "mean_stability", definitionVersion: "0.1.0", preference: "higher", missing: "block" }] }, { startSeconds: 0.1, endSeconds: 0.4 });
  const run = execute(x);
  assert.equal(run.decision.outcome.kind, "abstained");
  assert.ok(run.manifest.options.every(e => e.expansionReason === "incomplete_required_evidence" && e.option.components[0]!.value.state !== "present"));
});

test("previous planning decisions are exact replayed same-scope artifacts with occurrence lineage", () => {
  const x = fixture(), run = execute(x), artifacts = fullArtifacts(x, run);
  const prior = run.artifacts.find(a => a.ref.artifactType === "PlanningDecision")!;
  assert.equal(run.decision.outcome.kind, "chosen");
  if (run.decision.outcome.kind !== "chosen") throw new Error("Expected prior winner.");
  const optionId = run.decision.outcome.optionId, use = run.manifest.options.find(e => e.option.optionId === optionId)!.option.uses[0]!;
  const body = { ...x.contextBody, previousDecisions: [prior.ref], precedingUses: [{ decision: prior.ref, optionId, useId: use.useId }] };
  const context = createPlanningContext(body, artifacts), contextArtifact = artifact(context.contextId, "PlanningContext", context);
  assert.notEqual(context.contextId, x.context.contextId);
  const next = runPlanning(contextArtifact.ref, [...artifacts, contextArtifact]);
  assert.notEqual(next.decision.planningDecisionId, run.decision.planningDecisionId);
  assert.deepEqual(next.manifest.options[0]!.option.uses[0]!.precedingUseId, { state: "present", value: use.useId });
  assert.ok(next.manifest.options.every(e => e.option.candidateReuseCounts[0]!.count === e.option.uses.length + 1));
  assert.ok(next.manifest.options.some(e => e.expansionReason === "candidate_reuse_bound"));
  assert.deepEqual(validatePlanningDecision(next.decision, [...artifacts, contextArtifact, ...next.artifacts]), next.decision);
  assert.throws(() => createPlanningContext({ ...body, previousDecisions: [{ ...prior.ref, sha256: "f".repeat(64) }] }, artifacts));
  assert.throws(() => createPlanningContext({ ...body, previousDecisions: [] }, artifacts));
  assert.throws(() => createPlanningContext({ ...body, precedingUses: [{ ...body.precedingUses[0], useId: "invented" }] }, artifacts));
  for (const field of ["projectId", "creatorId", "purpose"] as const) {
    const foreign = reidentify({ ...run.decision, scope: { ...run.decision.scope, [field]: "foreign" } }, "planningDecisionId", "planning_decision_v0");
    const foreignArtifact = artifact(`foreign_${field}`, "PlanningDecision", foreign);
    assert.throws(() => createPlanningContext({ ...x.contextBody, previousDecisions: [foreignArtifact.ref] }, [...artifacts, foreignArtifact]));
  }
  const forged = reidentify({ ...run.decision, outcome: { kind: "chosen", optionId: "not_generated" } }, "planningDecisionId", "planning_decision_v0");
  const forgedArtifact = artifact("forged_prior", "PlanningDecision", forged);
  assert.throws(() => createPlanningContext({ ...x.contextBody, previousDecisions: [forgedArtifact.ref] }, [...artifacts, forgedArtifact]));
});

test("a tied prior decision cannot authorize a preceding use or invent a winner", () => {
  const x = fixture({ duration: { minimumSeconds: 1.5, maximumSeconds: 1.5, preferredSeconds: 1.5 } }), run = execute(x);
  assert.equal(run.decision.outcome.kind, "tie");
  if (run.decision.outcome.kind !== "tie") throw new Error("Expected prior tie.");
  const optionId = run.decision.outcome.optionIds[0]!, use = run.manifest.options.find(e => e.option.optionId === optionId)!.option.uses[0]!;
  const prior = run.artifacts.find(a => a.ref.artifactType === "PlanningDecision")!;
  assert.throws(() => createPlanningContext({ ...x.contextBody, previousDecisions: [prior.ref], precedingUses: [{ decision: prior.ref, optionId, useId: use.useId }] }, fullArtifacts(x, run)));
});

test("budget authorization is replayed and its exact identity changes the planning result", () => {
  const x = fixture(), { budgetId: _id, ...body } = x.source.computeBudget;
  const compute = budget({ ...body, cpuMilliseconds: body.cpuMilliseconds - 1 }, x.artifacts);
  const computeArtifact = artifact(compute.budgetId, "ComputeBudget", compute), artifacts = [...x.artifacts, computeArtifact];
  const context = createPlanningContext({ ...x.contextBody, computeBudget: computeArtifact.ref }, artifacts);
  const contextArtifact = artifact(context.contextId, "PlanningContext", context);
  const run = runPlanning(contextArtifact.ref, [...artifacts, contextArtifact]);
  assert.notEqual(context.contextId, x.context.contextId);
  assert.notEqual(run.decision.planningDecisionId, execute(x).decision.planningDecisionId);
  for (const field of ["cpuMilliseconds", "wallClockMilliseconds", "peakRamBytes"] as const) {
    const denied = budget({ ...body, [field]: 0 }, x.artifacts), deniedArtifact = artifact(denied.budgetId, "ComputeBudget", denied);
    assert.throws(() => createPlanningContext({ ...x.contextBody, computeBudget: deniedArtifact.ref }, [...x.artifacts, deniedArtifact]));
  }
});

test("reidentified score changes and nongenerated parents cannot falsify the alternatives manifest", () => {
  const x = fixture(), run = execute(x), first = run.manifest.options[0]!;
  const components = first.option.components.map((c, i) => i === 0 ? { ...c, value: { state: "present", value: 999 } } : c);
  const mutated = reidentify({ ...first.option, components }, "optionId", "planning_sequence_v0");
  assert.notEqual(mutated.optionId, first.option.optionId);
  for (const patch of [{ option: mutated }, { parentOptionId: "nongenerated_parent" }, { ordinal: 999 }]) {
    const manifest = reidentify({ ...run.manifest, options: [{ ...first, ...patch }, ...run.manifest.options.slice(1)] }, "manifestId", "planning_alternatives_v0");
    assert.throws(() => validatePlanningAlternatives(manifest, fullArtifacts(x, run)));
  }
});

test("exact evidence and policy both limit boundary proposals, including otherwise valid PTS", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 } }), original = fixture();
  const candidate = x.context.candidates[0]!, set = proposeBoundaries(x.contextArtifact.ref, candidate.candidateId, candidate.token, x.artifacts);
  assert.equal(set.options.length, 1);
  assert.equal(set.truncated, true);
  const more = proposeBoundaries(original.contextArtifact.ref, candidate.candidateId, candidate.token, original.artifacts);
  const forged = reidentify({ ...more.options[1], contextSnapshot: x.contextArtifact.ref, policy: x.policyArtifact.ref }, "boundaryId", "planning_boundary_v0");
  assert.throws(() => validatePlanningBoundary(forged, x.artifacts));
});

test("owned envelopes and nested structures reject unknown fields even after reidentification", () => {
  const x = fixture(), run = execute(x);
  const records = [
    [PlanningRetrievalSchema, run.retrievals[0]!, "retrievalId", "planning_retrieval_v0"],
    [PlanningBoundarySetSchema, run.boundaries[0]!, "boundarySetId", "planning_boundary_set_v0"],
    [PlanningAlternativesSchema, run.manifest, "manifestId", "planning_alternatives_v0"],
    [PlanningBudgetTraceSchema, run.budgetTrace, "traceId", "planning_budget_trace_v0"],
    [PlanningSearchRunSchema, run.searchRun, "searchRunId", "planning_search_run_v0"],
  ] as const;
  for (const [schema, value, key, prefix] of records) assert.throws(() => schema.parse(reidentify({ ...value, unknown: true }, key, prefix)));
  const retrieval = run.retrievals[0]!, entry = retrieval.entries[0]!;
  for (const altered of [
    { ...entry, token: { ...entry.token, unknown: true } },
    { ...entry, features: entry.features.map(f => ({ ...f, unknown: true })) },
    { ...entry, features: entry.features.map(f => ({ ...f, value: { ...f.value, unknown: true } })) },
  ]) assert.throws(() => PlanningRetrievalSchema.parse(reidentify({ ...retrieval, entries: [altered] }, "retrievalId", "planning_retrieval_v0")));
  const option = run.manifest.options[0]!.option;
  for (const patch of [{ uses: option.uses.map(u => ({ ...u, trackId: "forbidden" })) },
    { components: option.components.map(c => ({ ...c, confidence: 1 })) },
    { hardConstraints: option.hardConstraints.map(c => ({ ...c, ignored: true })) }]) {
    assert.throws(() => PlanningSequenceSchema.parse(reidentify({ ...option, ...patch }, "optionId", "planning_sequence_v0")));
  }
  for (const field of ["duration", "trim", "retrieval", "boundary", "search", "tie", "author"] as const) {
    assert.throws(() => createPlanningPolicy({ ...policyBody, [field]: { ...policyBody[field], unknown: true } }));
  }
  for (const patch of [{ duration: { ...policyBody.duration, minimumSeconds: NaN } }, { trim: { minimumSeconds: 4, maximumSeconds: 2 } },
    { search: { ...policyBody.search, maximumExpandedStates: 129, manifestLimit: 128 } }, { objectives: [policyBody.objectives[0], policyBody.objectives[0]] }]) assert.throws(() => createPlanningPolicy({ ...policyBody, ...patch }));
});

test("self-review: synthetic two-candidate coverage describes its actual source union", () => {
  const x = fixture({}, undefined, true);
  assert.equal(x.source.f.analysis.inventory.coverageAfter.coveredSeconds, 3);
  assert.equal(x.source.f.analysis.inventory.coverageAfter.temporalCoverage, 0.75);
  assert.equal(x.source.f.analysis.inventory.coverageAfter.maximumGapSeconds, 1);
});

test("hard exclusion without factual negative evidence causes explicit abstention", () => {
  const x = fixture({}, undefined, false, true), run = execute(x);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.ok(run.manifest.options.every(e => e.option.hardConstraints.some(c => c.state === "unknown" && c.reasonCode === "exclusion_evidence_unavailable")));
  assert.equal("optionId" in run.decision.outcome, false);
});

test("source evidence scope and exact world, view and policy refs cannot be substituted", () => {
  const x = fixture();
  for (const key of ["direction", "directorRequest", "worldSnapshot", "worldView", "candidateUniverse", "policy", "computeBudget"] as const) {
    assert.throws(() => createPlanningContext({ ...x.contextBody, [key]: { ...x.contextBody[key], sha256: "f".repeat(64) } }, x.artifacts));
  }
  for (const field of ["projectId", "creatorId", "purpose"] as const) {
    assert.throws(() => createPlanningContext({ ...x.contextBody, worldQuery: { ...x.contextBody.worldQuery, [field]: "foreign" } }, x.artifacts));
  }
  const changed = withDirection(x, { nodes: [{ ...x.source.direction.nodes[0]!, intent: { kind: "story_beat", role: "hook", description: "A different authorized intent." } }] });
  assert.notEqual(changed.context.contextId, x.context.contextId);
  assert.notEqual(retrieveCandidates(changed.contextArtifact.ref, "node_hook", changed.artifacts).retrievalId, retrieveCandidates(x.contextArtifact.ref, "node_hook", x.artifacts).retrievalId);
  assert.notEqual(execute(changed).boundaries[0]!.boundarySetId, execute(x).boundaries[0]!.boundarySetId);
});

test("self-review: missing source support blocks search as unknown rather than infeasible", () => {
  const x = fixture({}, undefined, false, false, true), run = execute(x), binding = x.context.candidates[0]!;
  assert.equal(x.source.view.returned.length, 0);
  assert.equal(run.retrievals[0]!.entries[0]!.reason, "world_support_unavailable");
  const boundaries = proposeBoundaries(x.contextArtifact.ref, binding.candidateId, binding.token, x.artifacts);
  assert.equal(boundaries.options.length, 0);
  assert.equal(boundaries.missing[0]!.reasonCode, "world_support_unavailable");
  assert.equal(run.manifest.options.length, 0);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
});

test("owner review: hard whole-edit graphics without source bindings cannot block a valid source sequence", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } });
  const source = x.source.direction.nodes[0]!;
  const graphics = { ...source, nodeId: "node_graphics", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "Add a readable title." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, graphics] }), run = execute(changed);
  assert.ok(run.manifest.options.length > 0);
  assert.equal(run.decision.outcome.kind, "chosen");
  assert.ok(run.manifest.options.every(e => e.option.uses.every(u => u.directionNodeId === source.nodeId)));
  assert.equal(run.decision.uncertainty.executionAssessment, "deferred");
  const obligations = deferredRecords(run.manifest);
  assert.equal(obligations.length, 1);
  assert.deepEqual(obligations[0], { nodeId: graphics.nodeId, priority: "hard", requirementIds: [],
    directionNode: { artifact: changed.context.direction, pointer: "/nodes/0" }, reasonCode: "no_source_binding", state: "deferred",
    capabilityAssessment: "not_performed", executionAssessment: "deferred" });
  assert.deepEqual(new EditorialArtifactMap(changed.artifacts).resolve(obligations[0]!.directionNode), graphics);
  assert.ok(run.manifest.options.every(e => {
    assert.deepEqual(deferredRecords(e.option), obligations);
    const nodeChecks = e.option.hardConstraints.filter(c => c.evidenceRefs.some(ref => ref.pointer === "/nodes/0"));
    return nodeChecks.length > 0 && nodeChecks.every(c => String(c.state) === "deferred");
  }));
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
});

test("owner review: boundary evidencePointsUsed counts only distinct emitted endpoints", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 } }), binding = x.context.candidates[0]!;
  const result = proposeBoundaries(x.contextArtifact.ref, binding.candidateId, binding.token, x.artifacts);
  const actual = new Set(result.options.flatMap(option => [option.sourceRange.startSeconds, option.sourceRange.endSeconds]));
  assert.equal(result.options.length, 1);
  assert.equal(result.evidencePointsAvailable, 4);
  assert.equal(actual.size, 2);
  assert.equal(result.evidencePointsUsed, actual.size);
  assert.equal(result.truncated, true);
});

// A test view permits the regressions to compile before the owned deferred record is implemented.
function deferredRecords(value: object): { nodeId: string; priority: string; requirementIds: string[]; directionNode: EvidenceRef;
  state: string; reasonCode: string; capabilityAssessment: string; executionAssessment: string }[] {
  assert.ok("deferredObligations" in value && Array.isArray(value.deferredObligations), "Explicit deferred obligations must be retained.");
  return value.deferredObligations as ReturnType<typeof deferredRecords>;
}

test("owner review: deferred requirements, include constraints and relationships cannot block source-only planning", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } });
  const source = { ...x.source.direction.nodes[0]!, requirementIds: ["include_subject"] };
  const graphics = { ...source, nodeId: "node_title", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "A title." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: ["output_short"] };
  const changed = withDirection(x, { nodes: [source, graphics],
    constraints: [{ constraintId: "include_title", subjectId: "output_short", stance: "include", priority: "hard", nodeId: graphics.nodeId }],
    edges: [{ edgeId: "edge_order", type: "intended_order", from: source.nodeId, to: graphics.nodeId },
      { edgeId: "edge_requires", type: "requires", from: source.nodeId, to: graphics.nodeId }] });
  const run = execute(changed);
  assert.equal(run.decision.outcome.kind, "chosen");
  assert.deepEqual(deferredRecords(run.manifest)[0]!.requirementIds, ["output_short"]);
  const checks = run.manifest.options[0]!.option.hardConstraints;
  for (const pointer of ["/constraints/0", "/edges/0", "/edges/1"]) {
    assert.ok(checks.some(c => String(c.state) === "deferred" && c.evidenceRefs.some(ref => ref.pointer === pointer)));
  }
  assert.ok(checks.some(c => String(c.state) === "deferred" && c.reasonCode === "structural_requirement_coverage"));
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
});

test("owner review: a declared source obligation remains pending despite deferred graphics", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } });
  const source = x.source.direction.nodes[0]!, required = { ...source, nodeId: "node_required", requirementIds: [] };
  const graphics = { ...source, nodeId: "node_title", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "A title." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const run = execute(withDirection(x, { nodes: [source, required, graphics] }));
  assert.equal(run.decision.outcome.kind, "infeasible");
  assert.ok(run.manifest.options.every(e => e.selectionReason === "incomplete_sequence" && e.option.hardConstraints.some(c => c.state === "pending")));
  assert.deepEqual(deferredRecords(run.manifest).map(d => d.nodeId), [graphics.nodeId]);
});

test("owner review: source support missingness remains an abstention with deferred obligations retained", () => {
  const x = fixture({}, undefined, false, false, true), source = x.source.direction.nodes[0]!;
  const graphics = { ...source, nodeId: "node_title", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "A title." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const run = execute(withDirection(x, { nodes: [source, graphics] }));
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(run.manifest.options, []);
  assert.deepEqual(deferredRecords(run.manifest).map(d => d.nodeId), [graphics.nodeId]);
  assert.equal(run.retrievals.find(r => r.directionNodeId === source.nodeId)!.entries[0]!.reason, "world_support_unavailable");
});

test("owner review: typed operation intentions with source bindings retain deferred execution obligations", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const node = { ...source, intent: { kind: "color_intention" as const, mood: "warm" as const, description: "Warm the selected source." } };
  const changed = withDirection(x, { nodes: [node] }), run = execute(changed);
  assert.equal(run.decision.outcome.kind, "chosen");
  assert.equal(run.manifest.options[0]!.option.uses[0]!.candidateId, source.candidates[0]!.candidateId);
  const obligation = deferredRecords(run.manifest)[0]!;
  assert.equal(obligation.nodeId, node.nodeId);
  assert.equal(obligation.reasonCode, "operation_intention");
  assert.equal(obligation.state, "deferred");
  assert.equal(obligation.capabilityAssessment, "not_performed");
  const checks = run.manifest.options[0]!.option.hardConstraints;
  assert.ok(checks.some(c => c.state === "pass" && c.reasonCode === "structural_source_binding_coverage"));
  assert.ok(checks.some(c => String(c.state) === "deferred" && c.reasonCode === "later_gate_obligation"));
});

test("owner review: boundary accounting and truncation agree across option and point limits", () => {
  for (const [maxEvidencePoints, maxOptionsPerCandidate, expectedUsed, truncated] of [[8, 1, 2, true], [8, 2, 3, true], [8, 3, 4, true], [8, 6, 4, false], [2, 16, 2, true]] as const) {
    const x = fixture({ boundary: { ...policyBody.boundary, maxEvidencePoints, maxOptionsPerCandidate } }), binding = x.context.candidates[0]!;
    const result = proposeBoundaries(x.contextArtifact.ref, binding.candidateId, binding.token, x.artifacts);
    const actual = new Set(result.options.flatMap(o => [o.sourceRange.startSeconds, o.sourceRange.endSeconds]));
    assert.equal(result.evidencePointsAvailable, 4);
    assert.equal(result.evidencePointsUsed, actual.size);
    assert.equal(actual.size, expectedUsed);
    assert.equal(result.truncated, truncated);
    assert.ok(result.options.length <= maxOptionsPerCandidate);
    assert.deepEqual(validatePlanningBoundarySet(result, x.artifacts), result);
    assert.throws(() => validatePlanningBoundarySet(reidentify({ ...result, evidencePointsUsed: actual.size + 1 }, "boundarySetId", "planning_boundary_set_v0"), x.artifacts));
  }
  const x = fixture({}, undefined, false, false, true), binding = x.context.candidates[0]!;
  const missing = proposeBoundaries(x.contextArtifact.ref, binding.candidateId, binding.token, x.artifacts);
  assert.equal(missing.evidencePointsAvailable, 0);
  assert.equal(missing.evidencePointsUsed, 0);
  assert.equal(missing.truncated, false);
});

test("repair self-review: a bound operation reuses selected source coverage without a duplicate clip use", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const color = { ...source, nodeId: "node_color", intent: { kind: "color_intention" as const, mood: "warm" as const, description: "Warm the already selected source." }, requirementIds: [] };
  const run = execute(withDirection(x, { nodes: [source, color] }));
  assert.equal(run.decision.outcome.kind, "chosen");
  if (run.decision.outcome.kind !== "chosen") throw new Error("Expected a source-only winner.");
  const optionId = run.decision.outcome.optionId, chosen = run.manifest.options.find(e => e.option.optionId === optionId)!.option;
  assert.equal(chosen.uses.length, 1);
  assert.equal(chosen.uses[0]!.directionNodeId, source.nodeId);
  assert.equal(deferredRecords(chosen)[0]!.nodeId, color.nodeId);
  assert.equal(deferredRecords(chosen)[0]!.state, "deferred");
});

test("repair self-review: a bound operation cannot defer a hard source exclusion", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }, undefined, false, true);
  const source = x.source.direction.nodes[0]!;
  const color = { ...source, intent: { kind: "color_intention" as const, mood: "warm" as const, description: "A typed operation cannot waive the supplied exclusion." } };
  const run = execute(withDirection(x, { nodes: [color] }));
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.ok(run.manifest.options.every(e => e.option.hardConstraints.some(c => c.state === "unknown" && c.reasonCode === "exclusion_evidence_unavailable")));
  assert.equal(deferredRecords(run.manifest)[0]!.state, "deferred");
});

test("repair self-review: a mixed branch cannot claim completion of its deferred intentions", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const other = { ...source, nodeId: "node_other" };
  const title = { ...source, nodeId: "node_title", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "Title." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, other, title], edges: [{ edgeId: "edge_alternative", type: "alternative_to", from: source.nodeId, to: other.nodeId }],
    alternatives: [{ branchId: "branch_hook", choices: [{ choiceId: "choice_a", nodeIds: [source.nodeId, title.nodeId] }, { choiceId: "choice_b", nodeIds: [other.nodeId] }] }] });
  const run = execute(changed), option = run.manifest.options.find(e => e.option.uses[0]!.directionNodeId === source.nodeId)!.option;
  assert.equal(run.decision.outcome.kind, "tie");
  const branch = option.hardConstraints.find(c => c.reasonCode === "mutually_exclusive_complete_branch")!;
  assert.equal(String(branch.state), "deferred");
  assert.equal(deferredRecords(option)[0]!.nodeId, title.nodeId);
});

test("repair self-review: deferred obligation mutations change identity and fail complete decision replay", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const title = { ...source, nodeId: "node_title", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "Title." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, title] }), run = execute(changed), entry = run.manifest.options[0]!, original = deferredRecords(entry.option)[0]!;
  for (const records of [[], [{ ...original, priority: "soft" }], [{ ...original, directionNode: { ...original.directionNode, pointer: "/nodes/0" } }]]) {
    const option = PlanningSequenceSchema.parse(reidentify({ ...entry.option, deferredObligations: records }, "optionId", "planning_sequence_v0"));
    assert.notEqual(option.optionId, entry.option.optionId);
    const outcome = { kind: "chosen", optionId: option.optionId } as const;
    const manifest = PlanningAlternativesSchema.parse(reidentify({ ...run.manifest, options: [{ ...entry, option }], retainedOptionIds: [option.optionId], deferredObligations: records }, "manifestId", "planning_alternatives_v0"));
    assert.throws(() => validatePlanningAlternatives(manifest, changed.artifacts));
    const manifestArtifact = artifact(manifest.manifestId, "PlanningAlternatives", manifest);
    const receipt = PlanningSearchRunSchema.parse(reidentify({ ...run.searchRun, alternativesConsidered: manifestArtifact.ref, outcome }, "searchRunId", "planning_search_run_v0"));
    const receiptArtifact = artifact(receipt.searchRunId, "PlanningSearchRun", receipt);
    const decision = reidentify({ ...run.decision, searchRun: receiptArtifact.ref, alternativesConsidered: manifestArtifact.ref, outcome,
      scoresAndMissingness: { artifact: manifestArtifact.ref, pointer: "/options" }, constraintsChecked: { artifact: manifestArtifact.ref, pointer: "/options" } }, "planningDecisionId", "planning_decision_v0");
    assert.throws(() => validatePlanningDecision(decision, [...fullArtifacts(changed, run), manifestArtifact, receiptArtifact]));
  }
  const empty = fixture({}, undefined, false, false, true), emptyChanged = withDirection(empty, { nodes: [empty.source.direction.nodes[0]!, { ...title, evidenceRefs: [] }] });
  const emptyRun = execute(emptyChanged);
  assert.equal(emptyRun.manifest.options.length, 0);
  assert.equal(deferredRecords(emptyRun.manifest).length, 1);
  assert.deepEqual(validatePlanningAlternatives(emptyRun.manifest, fullArtifacts(emptyChanged, emptyRun)), emptyRun.manifest);
  assert.throws(() => validatePlanningAlternatives(reidentify({ ...emptyRun.manifest, deferredObligations: [] }, "manifestId", "planning_alternatives_v0"), fullArtifacts(emptyChanged, emptyRun)));
});

test("repair self-review: deferred records cannot claim satisfaction, capability or execution authority", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const title = { ...source, nodeId: "node_title", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "Title." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const run = execute(withDirection(x, { nodes: [source, title] })), option = run.manifest.options[0]!.option, record = deferredRecords(option)[0]!;
  for (const patch of [{ state: "pass" }, { state: "satisfied" }, { capabilityAssessment: "available" }, { executionAssessment: "performed" },
    { executorId: "fabricated" }, { planId: "fabricated" }, { unknown: true }]) {
    assert.throws(() => PlanningSequenceSchema.parse(reidentify({ ...option, deferredObligations: [{ ...record, ...patch }] }, "optionId", "planning_sequence_v0")));
    assert.throws(() => PlanningAlternativesSchema.parse(reidentify({ ...run.manifest, deferredObligations: [{ ...record, ...patch }] }, "manifestId", "planning_alternatives_v0")));
  }
  assert.throws(() => PlanningSequenceSchema.parse(reidentify({ ...option, deferredObligations: [record, record] }, "optionId", "planning_sequence_v0")));
  const emitted = JSON.stringify(run);
  for (const name of ["DecisionEvent", "EditGraph", "TechniqueGraph", "CapabilityGraph", "UniversalEditPlan", "executorId", "planId", "slotId"]) assert.equal(emitted.includes(`"${name}"`), false);
});

test("repair self-review: all deferred branch choices stay unresolved without forcing fake source uses", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const a = { ...source, nodeId: "node_title_a", intent: { kind: "graphics_intention" as const, role: "clarify" as const, description: "Title A." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] }, b = { ...a, nodeId: "node_title_b" };
  const run = execute(withDirection(x, { nodes: [source, a, b], edges: [{ edgeId: "edge_alternative", type: "alternative_to", from: a.nodeId, to: b.nodeId }],
    alternatives: [{ branchId: "branch_title", choices: [{ choiceId: "choice_a", nodeIds: [a.nodeId] }, { choiceId: "choice_b", nodeIds: [b.nodeId] }] }] }));
  assert.equal(run.decision.outcome.kind, "chosen");
  assert.deepEqual(deferredRecords(run.manifest).map(d => d.nodeId), [a.nodeId, b.nodeId]);
  assert.ok(run.manifest.options.every(e => e.option.uses.every(u => u.directionNodeId === source.nodeId)));
  assert.equal(String(run.manifest.options[0]!.option.hardConstraints.find(c => c.reasonCode === "mutually_exclusive_complete_branch")!.state), "deferred");
});

test("repair self-review: operation source bindings cannot borrow coverage from a different candidate", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }, undefined, true);
  const source = x.source.direction.nodes[0]!, other = x.context.candidates.find(c => c.candidateId !== x.source.candidate.candidateId)!;
  const color = { ...source, nodeId: "node_color", intent: { kind: "color_intention" as const, mood: "warm" as const, description: "Use this exact candidate as the target." },
    scope: { kind: "candidate" as const, candidate: other }, candidates: [other], requirementIds: [] };
  const run = execute(withDirection(x, { nodes: [source, color] }));
  assert.equal(run.decision.outcome.kind, "infeasible");
  assert.ok(run.manifest.options.filter(e => e.option.uses[0]!.directionNodeId === source.nodeId).every(e => e.option.hardConstraints.some(c => c.state === "pending" && c.reasonCode === "structural_source_binding_coverage")));
  assert.equal(deferredRecords(run.manifest)[0]!.state, "deferred");
});

test("repair self-review: responsibility uses declared bindings and typed intention, never prose", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const story = { ...source, intent: { kind: "story_beat" as const, role: "hook" as const, description: "Graphics, color, transition, sound design, technique at 12 seconds." } };
  const unbound = { ...story, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const run = execute(withDirection(x, { nodes: [story, unbound] }));
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(run.manifest), []);
  assert.ok(run.manifest.options.every(e => e.option.uses.every(u => u.directionNodeId === story.nodeId)));
});

test("final owner: unbound hard story authority cannot become a deferred operation", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } });
  const source = x.source.direction.nodes[0]!;
  const unbound = { ...source, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, unbound] }), run = execute(changed);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(run.manifest), []);
  assert.ok(run.manifest.options.length > 0);
  for (const entry of run.manifest.options) {
    assert.ok(entry.option.uses.every(u => u.directionNodeId === source.nodeId));
    const check = entry.option.hardConstraints.find(c => c.reasonCode === "source_binding_unavailable");
    assert.equal(check?.state, "unknown");
    assert.deepEqual(new EditorialArtifactMap(changed.artifacts).resolve(check!.evidenceRefs[0]!), unbound);
    assert.equal(entry.selectionReason, "incomplete_required_evidence");
  }
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
});

test("final owner: hard source exclusion on an unbound story cannot be deferred", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }, undefined, false, true);
  const source = x.source.direction.nodes[0]!;
  const unbound = { ...source, nodeId: "node_exclusion", priority: "soft" as const, scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, unbound], constraints: [{ ...x.source.direction.constraints[0]!, nodeId: unbound.nodeId }] });
  const run = execute(changed);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(run.manifest), []);
  const checks = run.manifest.options[0]!.option.hardConstraints;
  assert.ok(checks.some(c => c.state === "unknown" && c.reasonCode === "exclusion_evidence_unavailable"));
  assert.ok(checks.some(c => c.state === "unknown" && c.evidenceRefs.some(ref => ref.pointer === "/constraints/0")));
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
});

test("final owner: soft unbound source authority stays unknown and nonblocking", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } });
  const source = x.source.direction.nodes[0]!;
  const unbound = { ...source, nodeId: "node_unbound", priority: "soft" as const, scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, unbound] }), run = execute(changed);
  assert.equal(run.decision.outcome.kind, "chosen");
  assert.deepEqual(deferredRecords(run.manifest), []);
  for (const entry of run.manifest.options) {
    assert.ok(entry.option.uses.every(u => u.directionNodeId === source.nodeId));
    const check = entry.option.softFindings.find(c => c.reasonCode === "source_binding_unavailable");
    assert.equal(check?.state, "unknown");
    assert.deepEqual(new EditorialArtifactMap(changed.artifacts).resolve(check!.evidenceRefs[0]!), unbound);
  }
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
});

const sourceIntentionAttacks = [
  { kind: "narrative_objective", objective: "Graphics, color and transition words cannot authorize execution." },
  { kind: "story_beat", role: "payoff", description: "Graphics, color and transition words cannot authorize execution." },
  { kind: "emotional_progression", direction: "rise", description: "Graphics, color and transition words cannot authorize execution." },
  { kind: "sequence_intention", function: "resolve", description: "Graphics, color and transition words cannot authorize execution." },
  { kind: "shot_role_intention", role: "reaction", description: "Graphics, color and transition words cannot authorize execution." },
  { kind: "pacing_target", relativePace: "build", description: "Graphics, color and transition words cannot authorize execution." },
  { kind: "reaction_relationship", relation: "cause_then_reaction", description: "Graphics, color and transition words cannot authorize execution." },
] as const;
for (const intent of sourceIntentionAttacks) test(`final authority self-review: unbound ${intent.kind} stays in source authority`, () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  for (const priority of ["hard", "soft"] as const) {
    const unbound = { ...source, nodeId: "node_unbound", priority, intent, scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
    const changed = withDirection(x, { nodes: [source, unbound] }), run = execute(changed);
    assert.equal(run.decision.outcome.kind, priority === "hard" ? "abstained" : "chosen");
    if (priority === "hard") assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
    assert.deepEqual(deferredRecords(run.manifest), []);
    const option = run.manifest.options[0]!.option;
    const checks = priority === "hard" ? option.hardConstraints : option.softFindings;
    assert.ok(checks.some(c => c.state === "unknown" && c.reasonCode === "source_binding_unavailable"));
    assert.ok(option.uses.every(u => u.directionNodeId === source.nodeId));
    assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
  }
});

const operationIntentionAttacks = [
  { kind: "graphics_intention", role: "clarify", description: "A title." },
  { kind: "color_intention", mood: "warm", description: "A warm treatment." },
  { kind: "technique_intention", canonEntryKey: "narrative_arc", description: "A later technique intention." },
  { kind: "transition_intention", relation: "soften_change", description: "A softer change." },
  { kind: "sound_design_intention", relation: "emphasize", description: "Sound emphasis." },
  { kind: "music_relationship", relation: "build_with_music", beatId: missing("not_computed", "beat_evidence_unavailable"), description: "A later musical relationship." },
] as const;
for (const intent of operationIntentionAttacks) test(`final authority self-review: only typed ${intent.kind} execution is deferred`, () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  for (const bound of [false, true]) {
    const operation = { ...source, nodeId: "node_operation", intent, scope: { kind: "whole_edit" as const }, candidates: bound ? source.candidates : [], requirementIds: [] };
    const changed = withDirection(x, { nodes: [source, operation] }), run = execute(changed);
    assert.equal(run.decision.outcome.kind, "chosen");
    if (run.decision.outcome.kind !== "chosen") throw new Error("Expected selected source.");
    const optionId = run.decision.outcome.optionId, option = run.manifest.options.find(e => e.option.optionId === optionId)!.option;
    assert.equal(option.uses.length, 1);
    assert.equal(option.uses[0]!.directionNodeId, source.nodeId);
    assert.deepEqual(deferredRecords(run.manifest).map(o => [o.nodeId, o.state, o.capabilityAssessment, o.executionAssessment]), [[operation.nodeId, "deferred", "not_performed", "deferred"]]);
    if (bound) assert.ok(option.hardConstraints.some(c => c.state === "pass" && c.reasonCode === "structural_source_binding_coverage"));
    assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
  }
});

test("final authority self-review: hard mustInclude on an unbound source stays unknown", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } });
  const source = { ...x.source.direction.nodes[0]!, requirementIds: ["output_short"] };
  const unbound = { ...source, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: ["include_subject"] };
  const changed = withDirection(x, { nodes: [source, unbound], constraints: [{ constraintId: "include_unbound", subjectId: "include_subject", stance: "include", priority: "hard", nodeId: unbound.nodeId }] });
  const run = execute(changed);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(run.manifest), []);
  assert.ok(run.manifest.options[0]!.option.hardConstraints.some(c => c.state === "unknown" && c.evidenceRefs.some(ref => ref.pointer === "/constraints/0")));
});

test("final authority self-review: empty unbound source search retains auditable exact direction", () => {
  const x = fixture(), node = { ...x.source.direction.nodes[0]!, scope: { kind: "whole_edit" as const }, candidates: [] };
  const changed = withDirection(x, { nodes: [node] }), run = execute(changed), supplied = fullArtifacts(changed, run);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(run.manifest.options, []);
  assert.deepEqual(deferredRecords(run.manifest), []);
  assert.deepEqual(new EditorialArtifactMap(supplied).resolve({ artifact: run.decision.direction, pointer: "/nodes/0" }), node);
  assert.deepEqual(validatePlanningDecision(run.decision, supplied), run.decision);
  // The original valid bound direction is supplied too; this attack cannot fail merely on a missing artifact.
  assert.throws(() => validatePlanningDecision(reidentify({ ...run.decision, direction: x.source.directionArtifact.ref }, "planningDecisionId", "planning_decision_v0"), supplied));
});

test("final authority self-review: unknown source lineage cannot be removed or relabeled by coordinated hashes", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const unbound = { ...source, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, unbound] }), run = execute(changed), entry = run.manifest.options[0]!, checks = entry.option.hardConstraints;
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
  for (const hardConstraints of [checks.filter(c => c.reasonCode !== "source_binding_unavailable"),
    checks.map(c => c.reasonCode === "source_binding_unavailable" ? { ...c, state: "pass" } : c),
    checks.map(c => c.reasonCode === "source_binding_unavailable" ? { ...c, evidenceRefs: [{ artifact: changed.context.direction, pointer: "/nodes/0" }] } : c)]) {
    const option = PlanningSequenceSchema.parse(reidentify({ ...entry.option, hardConstraints }, "optionId", "planning_sequence_v0"));
    assert.notEqual(option.optionId, entry.option.optionId);
    const manifest = PlanningAlternativesSchema.parse(reidentify({ ...run.manifest, options: [{ ...entry, option }] }, "manifestId", "planning_alternatives_v0"));
    const manifestArtifact = artifact(manifest.manifestId, "PlanningAlternatives", manifest);
    const receipt = PlanningSearchRunSchema.parse(reidentify({ ...run.searchRun, alternativesConsidered: manifestArtifact.ref }, "searchRunId", "planning_search_run_v0"));
    const receiptArtifact = artifact(receipt.searchRunId, "PlanningSearchRun", receipt);
    const decision = reidentify({ ...run.decision, searchRun: receiptArtifact.ref, alternativesConsidered: manifestArtifact.ref,
      scoresAndMissingness: { artifact: manifestArtifact.ref, pointer: "/options" }, constraintsChecked: { artifact: manifestArtifact.ref, pointer: "/options" } }, "planningDecisionId", "planning_decision_v0");
    assert.throws(() => validatePlanningDecision(decision, [...fullArtifacts(changed, run), manifestArtifact, receiptArtifact]));
  }
});

test("final authority self-review: mixed branches enforce selected source obligations without blocking a usable alternative", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const other = { ...source, nodeId: "node_other" }, unbound = { ...source, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const title = { ...unbound, nodeId: "node_title", intent: operationIntentionAttacks[0] };
  const changed = withDirection(x, { nodes: [source, other, unbound, title], edges: [{ edgeId: "alternative", type: "alternative_to", from: source.nodeId, to: other.nodeId }],
    alternatives: [{ branchId: "branch_source", choices: [{ choiceId: "choice_a", nodeIds: [source.nodeId, unbound.nodeId, title.nodeId].sort() }, { choiceId: "choice_b", nodeIds: [other.nodeId] }] }] });
  const run = execute(changed);
  assert.equal(run.decision.outcome.kind, "chosen");
  if (run.decision.outcome.kind !== "chosen") throw new Error("Expected usable alternative.");
  const optionId = run.decision.outcome.optionId, option = run.manifest.options.find(e => e.option.optionId === optionId)!.option;
  assert.equal(option.uses[0]!.directionNodeId, other.nodeId);
  assert.deepEqual(deferredRecords(run.manifest).map(o => o.nodeId), [title.nodeId]);
  assert.ok(run.manifest.options.filter(e => e.option.uses[0]!.directionNodeId === source.nodeId).every(e => e.selectionReason === "incomplete_required_evidence"));
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
});

test("final authority self-review: an unbound source-only alternative branch cannot masquerade as deferred", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const a = { ...source, nodeId: "node_a", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] }, b = { ...a, nodeId: "node_b" };
  const run = execute(withDirection(x, { nodes: [source, a, b], edges: [{ edgeId: "alternative", type: "alternative_to", from: a.nodeId, to: b.nodeId }],
    alternatives: [{ branchId: "branch_source", choices: [{ choiceId: "choice_a", nodeIds: [a.nodeId] }, { choiceId: "choice_b", nodeIds: [b.nodeId] }] }] }));
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(run.manifest), []);
  assert.ok(run.manifest.options.every(e => e.option.uses.every(u => u.directionNodeId === source.nodeId)));
  assert.ok(run.manifest.options.every(e => e.option.hardConstraints.find(c => c.reasonCode === "mutually_exclusive_complete_branch")!.state !== "deferred"));
});

test("final authority self-review: an unselected mixed branch cannot delegate its hard source choice", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const unbound = { ...source, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const title = { ...unbound, nodeId: "node_title", intent: operationIntentionAttacks[0] };
  const run = execute(withDirection(x, { nodes: [source, unbound, title], edges: [{ edgeId: "alternative", type: "alternative_to", from: unbound.nodeId, to: title.nodeId }],
    alternatives: [{ branchId: "branch_mixed", choices: [{ choiceId: "choice_a", nodeIds: [unbound.nodeId] }, { choiceId: "choice_b", nodeIds: [title.nodeId] }] }] }));
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(run.manifest).map(o => o.nodeId), [title.nodeId]);
  assert.ok(run.manifest.options.every(e => e.option.uses.every(u => u.directionNodeId === source.nodeId)));
  assert.ok(run.manifest.options.every(e => e.option.hardConstraints.find(c => c.reasonCode === "mutually_exclusive_complete_branch")!.state !== "deferred"));
});

test("final authority self-review: required unbound source dependency is missing evidence even when its node is soft", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const unbound = { ...source, nodeId: "node_unbound", priority: "soft" as const, scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const changed = withDirection(x, { nodes: [source, unbound], edges: [{ edgeId: "required_source", type: "requires", from: source.nodeId, to: unbound.nodeId }] }), run = execute(changed);
  assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(run.manifest), []);
  assert.ok(run.manifest.options[0]!.option.hardConstraints.some(c => c.state === "unknown" && c.evidenceRefs.some(ref => ref.pointer === "/edges/0")));
});

test("final authority self-review: inactive missing source constraint cannot veto a complete alternative", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }), source = x.source.direction.nodes[0]!;
  const unbound = { ...source, nodeId: "node_unbound", scope: { kind: "whole_edit" as const }, candidates: [] };
  const changed = withDirection(x, { nodes: [source, unbound], edges: [{ edgeId: "alternative", type: "alternative_to", from: source.nodeId, to: unbound.nodeId }],
    alternatives: [{ branchId: "branch_source", choices: [{ choiceId: "choice_a", nodeIds: [source.nodeId] }, { choiceId: "choice_b", nodeIds: [unbound.nodeId] }] }],
    constraints: [{ constraintId: "include_a", subjectId: "include_subject", stance: "include", priority: "hard", nodeId: source.nodeId },
      { constraintId: "include_b", subjectId: "include_subject", stance: "include", priority: "hard", nodeId: unbound.nodeId }] });
  const run = execute(changed);
  assert.equal(run.decision.outcome.kind, "chosen");
  assert.deepEqual(deferredRecords(run.manifest), []);
  assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
});

test("final authority self-review: a deferred operation cannot hand its required unbound source to Gate 6", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } });
  const unbound = { ...x.source.direction.nodes[0]!, nodeId: "node_unbound", priority: "soft" as const, scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  for (const bound of [false, true]) {
    const operation = { ...x.source.direction.nodes[0]!, intent: operationIntentionAttacks[1], scope: { kind: "whole_edit" as const }, candidates: bound ? x.source.direction.nodes[0]!.candidates : [] };
    const changed = withDirection(x, { nodes: [operation, unbound], edges: [{ edgeId: "required_source", type: "requires", from: operation.nodeId, to: unbound.nodeId }] }), run = execute(changed);
    assert.deepEqual(run.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
    assert.deepEqual(deferredRecords(run.manifest).map(o => o.nodeId), [operation.nodeId]);
    if (bound) assert.ok(run.manifest.options[0]!.option.hardConstraints.some(c => c.state === "unknown" && c.evidenceRefs.some(ref => ref.pointer === "/edges/0")));
    else assert.deepEqual(run.manifest.options, []);
    assert.deepEqual(validatePlanningDecision(run.decision, fullArtifacts(changed, run)), run.decision);
  }
});

test("final authority self-review: only an exclusively operational unbound exclusion may be deferred", () => {
  const x = fixture({ boundary: { ...policyBody.boundary, maxOptionsPerCandidate: 1 }, search: { ...policyBody.search, maximumDepth: 1 } }, undefined, false, true), source = x.source.direction.nodes[0]!;
  const omit = { ...source, nodeId: "node_omit", intent: { kind: "graphics_intention" as const, role: "omit" as const, description: "The typed obligation controls ownership." },
    scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const constraints = [{ ...x.source.direction.constraints[0]!, nodeId: omit.nodeId }];
  const operational = execute(withDirection(x, { nodes: [source, omit], constraints }));
  assert.equal(operational.decision.outcome.kind, "chosen");
  assert.deepEqual(deferredRecords(operational.manifest).map(o => o.nodeId), [omit.nodeId]);
  const content = { ...source, nodeId: "node_content", priority: "soft" as const, scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: ["exclude_unknown"] };
  const mixed = execute(withDirection(x, { nodes: [source, omit, content], constraints }));
  assert.deepEqual(mixed.decision.outcome, { kind: "abstained", reasonCode: "required_evidence_missing" });
  assert.deepEqual(deferredRecords(mixed.manifest).map(o => o.nodeId), [omit.nodeId]);
});
