/** Internal autonomous planning only. All external inputs are exact supplied artifacts; all results are replayable. */
import { EditorialArtifactMap, ensure, equal, identify, missing, type ArtifactRef, type SuppliedArtifact } from "../editorial/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ContextBodySchema, PlanningContextSchema, PlanningDecisionSchema, PlanningSearchRunSchema, PlanningRetrievalSchema, PlanningBoundarySchema,
  PlanningBoundarySetSchema, PlanningAlternativesSchema, PlanningBudgetTraceSchema, BudgetTraceBodySchema, SearchRunBodySchema, DecisionBodySchema,
  header, supplied, type PlanningContext, type PlanningDecision, type PlanningSearchRun, type PlanningBoundary, type PlanningBoundarySet, type PlanningRetrieval, type PlanningAlternatives, type PlanningBudgetTrace } from "./common.js";
import { exact, candidateBinding, resolvePlanningInputs, type PlanningInputs } from "./context.js";
import { retrieve } from "./retrieval.js";
import { propose } from "./boundary.js";
import { search } from "./search.js";

export { PLANNING_VERSION, createPlanningPolicy, PlanningPolicySchema, PlanningContextSchema, PlanningWorldQuerySchema,
  PlanningRetrievalSchema, PlanningBoundarySchema, PlanningBoundarySetSchema, PlanningUseSchema, PlanningSequenceSchema, PlanningAlternativesSchema,
  PlanningOutcomeSchema, PlanningBudgetTraceSchema, PlanningSearchRunSchema, PlanningDecisionSchema,
  type PlanningPolicy, type PlanningContext, type PlanningRetrieval, type PlanningBoundary, type PlanningBoundarySet, type PlanningUse,
  type PlanningSequence, type PlanningAlternatives, type PlanningOutcome, type PlanningBudgetTrace, type PlanningSearchRun, type PlanningDecision } from "./common.js";

export interface PlanningRun {
  retrievals: PlanningRetrieval[]; boundaries: PlanningBoundarySet[]; manifest: PlanningAlternatives;
  budgetTrace: PlanningBudgetTrace; searchRun: PlanningSearchRun; decision: PlanningDecision; artifacts: SuppliedArtifact[];
}
interface ReplaySession { map: EditorialArtifactMap; artifacts: readonly SuppliedArtifact[]; active: Set<string>; completed: Map<string, PlanningRun>; visited: number }
function session(artifacts: readonly SuppliedArtifact[]): ReplaySession {
  return { map: new EditorialArtifactMap(artifacts), artifacts, active: new Set(), completed: new Map(), visited: 0 };
}

function inputs(context: PlanningContext, ref: ArtifactRef, state: ReplaySession): PlanningInputs {
  for (const previous of context.previousDecisions) {
    const decision = PlanningDecisionSchema.parse(exact(state.map, previous, "PlanningDecision"));
    ensure(equal(decision.scope, context.scope), "Previous planning decision scope mismatch.");
    validateDecision(decision, state);
  }
  return resolvePlanningInputs(context, ref, state.artifacts, state.map);
}
export function createPlanningContext(input: unknown, artifacts: readonly SuppliedArtifact[]): PlanningContext {
  const context = PlanningContextSchema.parse(identify("planning_context_v0", "contextId", ContextBodySchema.parse(input)));
  const ref = supplied(context, context.contextId).ref;
  inputs(context, ref, session(artifacts));
  return structuredClone(context);
}
export function validatePlanningContext(input: unknown, artifacts: readonly SuppliedArtifact[]): PlanningContext {
  const context = PlanningContextSchema.parse(input), { contextId: _id, ...body } = context;
  ensure(equal(context, createPlanningContext(body, artifacts)), "Planning context replay mismatch.");
  return structuredClone(context);
}
function loadInputs(contextRef: ArtifactRef, artifacts: readonly SuppliedArtifact[]): PlanningInputs {
  const state = session(artifacts);
  const context = PlanningContextSchema.parse(exact(state.map, contextRef, "PlanningContext"));
  return inputs(context, contextRef, state);
}
export function retrieveCandidates(contextRef: ArtifactRef, nodeId: string, artifacts: readonly SuppliedArtifact[]): PlanningRetrieval {
  return retrieve(loadInputs(contextRef, artifacts), nodeId);
}
export function validatePlanningRetrieval(value: unknown, artifacts: readonly SuppliedArtifact[]): PlanningRetrieval {
  const result = PlanningRetrievalSchema.parse(value);
  ensure(equal(result, retrieveCandidates(result.contextSnapshot, result.directionNodeId, artifacts)), "Retrieval replay mismatch.");
  return result;
}
export function proposeBoundaries(contextRef: ArtifactRef, candidateId: string, token: ArtifactRef, artifacts: readonly SuppliedArtifact[]): PlanningBoundarySet {
  const input = loadInputs(contextRef, artifacts);
  candidateBinding(input, candidateId, token);
  return propose(input, candidateId);
}
export function validatePlanningBoundary(value: unknown, artifacts: readonly SuppliedArtifact[]): PlanningBoundary {
  const boundary = PlanningBoundarySchema.parse(value);
  const options = proposeBoundaries(boundary.contextSnapshot, boundary.candidateId, boundary.token, artifacts).options;
  ensure(options.some(option => equal(option, boundary)), "Boundary was not generated from the exact trusted evidence and policy.");
  return boundary;
}
export function validatePlanningBoundarySet(value: unknown, artifacts: readonly SuppliedArtifact[]): PlanningBoundarySet {
  const set = PlanningBoundarySetSchema.parse(value);
  ensure(equal(set, proposeBoundaries(set.contextSnapshot, set.candidateId, set.token, artifacts)), "Boundary set replay mismatch.");
  return set;
}

function execute(input: PlanningInputs): PlanningRun {
  const artifacts: SuppliedArtifact[] = [];
  const add = (value: { artifactType: string; artifactVersion: string }, id: string) => { const artifact = supplied(value, id); artifacts.push(artifact); return artifact.ref; };
  const retrievals = input.direction.nodes.map(node => retrieve(input, node.nodeId));
  const candidates = [...new Set(retrievals.flatMap(r => r.entries.filter(e => e.included).map(e => e.candidateId)))].sort();
  const boundaries = candidates.map(candidate => propose(input, candidate));
  const retrievalRefs = retrievals.map(r => add(r, r.retrievalId)), boundaryRefs = boundaries.map(b => add(b, b.boundarySetId));
  const result = search(input, retrievals, boundaries);
  const manifestRef = add(result.manifest, result.manifest.manifestId);
  const budgetTrace = PlanningBudgetTraceSchema.parse(identify("planning_budget_trace_v0", "traceId", BudgetTraceBodySchema.parse({ ...header("PlanningBudgetTrace"),
    scope: input.context.scope, contextSnapshot: input.contextRef, computeBudget: input.context.computeBudget, authorizationRef: input.computeBudget.authorizationRef,
    policy: input.context.policy, expandedStates: result.expandedStates,
    duration: missing("not_computed", "elapsed_time_not_measured"), cost: missing("unavailable", "planning_cost_not_measured"), resourceUse: missing("not_computed", "resource_use_not_measured"),
    modelRun: missing("not_applicable", "no_model_operation"), costEvent: missing("unavailable", "no_measured_planning_telemetry"), accounting: "authorization_reference_and_search_work_only" })));
  const traceRef = add(budgetTrace, budgetTrace.traceId);
  const searchRun = PlanningSearchRunSchema.parse(identify("planning_search_run_v0", "searchRunId", SearchRunBodySchema.parse({ ...header("PlanningSearchRun"),
    scope: input.context.scope, contextSnapshot: input.contextRef, policy: input.context.policy, retrievals: retrievalRefs, boundaries: boundaryRefs,
    alternativesConsidered: manifestRef, stoppingReason: result.stoppingReason, expandedStates: result.expandedStates, maximumDepthReached: result.maximumDepthReached,
    seed: input.policy.seed, outcome: result.outcome, budgetTrace: traceRef, producer: { producerId: "owned_bounded_planner", producerVersion: "0.1.0", computationBasis: "deterministic" },
    globalOptimality: false, exhaustive: false })));
  const searchRef = add(searchRun, searchRun.searchRunId);
  const decision = PlanningDecisionSchema.parse(identify("planning_decision_v0", "planningDecisionId", DecisionBodySchema.parse({ ...header("PlanningDecision"), version: "0.1.0",
    scope: input.context.scope, searchRun: searchRef, contextSnapshot: input.contextRef, direction: input.context.direction, candidateUniverse: input.context.candidateUniverse,
    alternativesConsidered: manifestRef, scoresAndMissingness: { artifact: manifestRef, pointer: "/options" }, policy: { artifact: input.context.policy, pointer: "" },
    constraintsChecked: { artifact: manifestRef, pointer: "/options" }, outcome: result.outcome,
    uncertainty: { state: "unknown", reasonCode: "bounded_heuristic_uncalibrated", feasibilityScope: "considered_sequences_only", executionAssessment: "deferred", creativeQuality: "unverified" },
    evidenceRefs: [input.context.direction, input.context.directorRequest, input.context.worldSnapshot, input.context.worldView, input.context.candidateUniverse].map(artifact => ({ artifact, pointer: "" })),
    budgetTrace: traceRef, previousDecisions: input.context.previousDecisions })));
  add(decision, decision.planningDecisionId);
  return { retrievals, boundaries, manifest: result.manifest, budgetTrace, searchRun, decision, artifacts };
}
function replay(ref: ArtifactRef, state: ReplaySession): PlanningRun {
  const key = canonicalSerialize(ref), cached = state.completed.get(key);
  if (cached) return cached;
  ensure(!state.active.has(key) && state.active.size < 8 && state.visited < 32, "Planning history cycle or replay bound exceeded.");
  state.visited++;
  state.active.add(key);
  const context = PlanningContextSchema.parse(exact(state.map, ref, "PlanningContext"));
  const result = execute(inputs(context, ref, state));
  state.active.delete(key);
  state.completed.set(key, result);
  return result;
}
/** Outcome is computed here; there is no caller-authored outcome/proposal constructor. */
export function runPlanning(contextRef: ArtifactRef, artifacts: readonly SuppliedArtifact[]): PlanningRun {
  return structuredClone(replay(contextRef, session(artifacts)));
}
function validateDecision(value: unknown, state: ReplaySession): PlanningDecision {
  const decision = PlanningDecisionSchema.parse(value), expected = replay(decision.contextSnapshot, state);
  ensure(equal(decision, expected.decision), "Planning decision contradicts runtime search replay.");
  // Attest exact stored receipt/manifest/trace/retrieval/boundary bytes, not just the decision's semantic hash.
  for (const artifact of expected.artifacts.filter(a => a.ref.artifactType !== "PlanningDecision")) ensure(equal(state.map.get(artifact.ref), artifact.value), "Planning runtime artifact replay mismatch.");
  return decision;
}
export function validatePlanningDecision(value: unknown, artifacts: readonly SuppliedArtifact[]): PlanningDecision {
  return structuredClone(validateDecision(value, session(artifacts)));
}
export function validatePlanningSearchRun(value: unknown, artifacts: readonly SuppliedArtifact[]): PlanningSearchRun {
  const run = PlanningSearchRunSchema.parse(value), state = session(artifacts), expected = replay(run.contextSnapshot, state);
  ensure(equal(run, expected.searchRun), "Search receipt contradicts actual deterministic replay.");
  for (const artifact of expected.artifacts.filter(a => !["PlanningDecision", "PlanningSearchRun"].includes(a.ref.artifactType))) state.map.get(artifact.ref);
  return run;
}
export function validatePlanningAlternatives(value: unknown, artifacts: readonly SuppliedArtifact[]): PlanningAlternatives {
  const manifest = PlanningAlternativesSchema.parse(value), expected = runPlanning(manifest.contextSnapshot, artifacts);
  ensure(equal(manifest, expected.manifest), "Considered/pruned manifest contradicts actual search generation.");
  return manifest;
}
