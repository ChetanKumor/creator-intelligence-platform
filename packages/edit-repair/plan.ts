/**
 * RepairPlan: bounded editorial intent for one proposed repair of one exact CriticFinding. It answers why (the finding and its evidence),
 * what (typed actions in exact source time), and under which authority (the exact parent graph and revision, the rendered output, its receipt
 * and passing technical QC, the critic report, the owner's repair policy and the planner that proposed it). It is never a mutation: it
 * compiles to a typed GraphDiff, and a repair is established only by new rendered evidence, never by the plan or the diff.
 *
 * Proposals come only through the model-neutral RepairPlannerPort: it receives a deep-frozen bounded copy of the finding, its resolved
 * evidence and the parent's exact clip and segment mapping (no capability, location, process or raw media), and its response is parsed
 * strictly. Shell commands, paths, filter strings, JSON patches, code and float seconds are unrepresentable.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, checkIdentity, equal, identify, type ArtifactRef, type EvidenceRef,
  type SuppliedArtifact } from "../editorial/common.js";
import { DirectorUncertaintySchema } from "../director/common.js";
import { CanonicalTimeSchema, HashSchema, Nat, ScopeSchema, SourceRangeSchema, canonicalTime, compareTimes, convertTime, durationOf, rateOf, subtractTimes, tickTime,
  type SourceRange } from "../edit-graph/common.js";
import { parseAnyEditGraph, supplied, trimSelectionOf, validateAnyEditGraph, type AnyEditGraph } from "../edit-graph/index.js";
import { LocationFreeVersionSchema, PositiveSafeInt } from "../edit-execution/common.js";
import { frameIndexAt, type FrameGrid } from "../edit-execution/index.js";
import { AnyRenderExecutionReceiptSchema, TechnicalMediaQcReceiptSchema, compileRenderProgram, type AnyRenderExecutionReceipt, type RenderProgram,
  type TechnicalMediaQcReceipt } from "../edit-render/index.js";
import { CRITIC_DIMENSIONS, CRITIC_SEVERITIES, CriticReportSchema, EditorialObservationSchema, type CriticFinding, type CriticReport } from "../edit-review/index.js";
import { requireValidated, type ValidatedExecutionDag } from "../edit-runtime/validated.js";
import { REPAIR_ACTIONS, REPAIR_HARD_LIMITS, REPAIR_IMPLEMENTATION, RepairImplementationSchema, check, envelope, frozenCopy, guard, header, parse, parseCanonical,
  refuse } from "./common.js";
import { RepairPolicySchema, type RepairPolicy } from "./policy.js";

/** Free text never carries a location, URL or control character into a record. */
export const locationFree = (text: string) => !/[\\]|\/\/|[A-Za-z]:\/|[\u0000-\u001f\u007f]/.test(text);
export const RationaleSchema = z.string().min(1).max(REPAIR_HARD_LIMITS.maxExplanationCharacters).refine(locationFree, "A rationale carries no location, URL or control character.");
const FramesSchema = z.strictObject({ startFrame: Nat, endFrame: PositiveSafeInt }).refine(r => r.endFrame > r.startFrame, "A non-empty output frame range.");
export const RepairActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal(REPAIR_ACTIONS[0]), clipUseId: IdSchema, keep: SourceRangeSchema }),
]);
export type RepairAction = z.infer<typeof RepairActionSchema>;
const PlanBodySchema = z.strictObject({
  ...envelope("RepairPlan"), scope: ScopeSchema,
  parent: z.strictObject({ editGraph: ArtifactRefSchema, editGraphId: IdSchema, revision: Nat }),
  render: z.strictObject({ receiptId: IdSchema, receiptVersion: z.enum(["0.1.0", "0.2.0"]), dagId: IdSchema, programId: IdSchema, renderComputationId: IdSchema,
    output: z.strictObject({ outputArtifactId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt }) }),
  technicalQc: z.strictObject({ qcReceiptId: IdSchema, verdict: z.literal("pass") }),
  critic: z.strictObject({ report: ArtifactRefSchema, reportId: IdSchema, finding: z.strictObject({ findingId: IdSchema, dimension: z.enum(CRITIC_DIMENSIONS),
    severity: z.enum(CRITIC_SEVERITIES), basis: z.enum(["measured", "model_assessed"]), producerKind: z.enum(["deterministic_check", "semantic_critic"]),
    affectedOutput: FramesSchema, joinIndex: Nat.nullable() }) }),
  evidence: z.array(EvidenceRefSchema).min(1).max(8),
  policy: z.strictObject({ policyId: IdSchema }),
  planner: z.strictObject({ plannerId: IdSchema, version: LocationFreeVersionSchema, basis: z.enum(["synthetic_fixture", "deterministic_rule", "model_adapter"]) }),
  attempt: z.strictObject({ attempt: PositiveSafeInt, maxAttempts: PositiveSafeInt }),
  rationale: RationaleSchema,
  actions: z.array(RepairActionSchema).min(1).max(REPAIR_HARD_LIMITS.maxOperations),
  effect: z.strictObject({ clipsTouched: PositiveSafeInt, removedOutputFrames: z.array(FramesSchema).min(1).max(REPAIR_HARD_LIMITS.maxOperations * 2),
    affectedOutput: z.strictObject({ startTicks: Nat, endTicks: PositiveSafeInt, ticksPerSecond: PositiveSafeInt }), affectedDuration: CanonicalTimeSchema }),
  uncertainty: DirectorUncertaintySchema,
  outcome: z.literal("proposal_only_repair_not_established_until_new_rendered_evidence_v0"),
  implementation: RepairImplementationSchema,
});
export const RepairPlanSchema = PlanBodySchema.extend({ planId: IdSchema })
  .refine(p => p.attempt.attempt <= p.attempt.maxAttempts, "Repair attempts are bounded.")
  .refine(p => checkIdentity(p, "planId", "repair_plan_v0"), "Repair plan identity mismatch.");
export type RepairPlan = z.infer<typeof RepairPlanSchema>;
export function requireRepairPlan(value: unknown): RepairPlan { return parseCanonical(RepairPlanSchema, value, "repair_plan_invalid"); }

// ---------------------------------------------------------------- the model-neutral planner port
export interface RepairPlannerIdentity { readonly plannerId: string; readonly version: string; readonly basis: "synthetic_fixture" | "deterministic_rule" | "model_adapter" }
/** Exactly what a planner may see: bounded data about one finding and the parent's exact mapping; never a capability, location or raw media. */
export interface RepairPlannerInput {
  readonly finding: { readonly findingId: string; readonly dimension: string; readonly severity: string; readonly basis: string; readonly producerKind: string;
    readonly affectedOutput: { readonly startFrame: number; readonly endFrame: number }; readonly joinIndex: number | null; readonly explanation: string };
  readonly evidence: readonly { readonly ref: EvidenceRef; readonly value: unknown }[];
  readonly graph: { readonly editGraphId: string; readonly revision: number; readonly ticksPerSecond: number };
  readonly clips: readonly { readonly clipUseId: string; readonly position: number; readonly assetId: string; readonly range: SourceRange;
    readonly output: { readonly startFrame: number; readonly endFrame: number } }[];
  readonly segments: readonly { readonly position: number; readonly clipUseId: string; readonly source: { readonly startFrame: number; readonly endFrame: number };
    readonly output: { readonly startFrame: number; readonly endFrame: number } }[];
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly actions: readonly string[];
  readonly limits: { readonly maxOperations: number; readonly maxExplanationCharacters: number };
}
/** A model-neutral repair boundary: an implementation returns a structured proposal only; the core validates it and owns the plan. */
export interface RepairPlannerPort { readonly identity: RepairPlannerIdentity; propose(input: RepairPlannerInput): Promise<unknown> }
/** Everything a plan binds: the exact parent graph, the render it was reviewed from, its QC, the critic report, one finding and its evidence. */
export interface RepairPlanningInput {
  graph: unknown; dag: ValidatedExecutionDag; artifacts: readonly SuppliedArtifact[]; receipt: unknown; qc: unknown; report: unknown; observations: readonly unknown[];
  findingId: string; policy: unknown; planner: RepairPlannerPort;
}
const PlannerIdentitySchema = z.strictObject({ plannerId: IdSchema, version: LocationFreeVersionSchema, basis: z.enum(["synthetic_fixture", "deterministic_rule", "model_adapter"]) });
type PlannerIdentity = z.infer<typeof PlannerIdentitySchema>;
interface ParentClip { clipUseId: string; position: number; assetId: string; range: SourceRange; output: { startFrame: number; endFrame: number };
  ticks: { startTicks: number; endTicks: number } }
/** Everything one plan is bound to, established and snapshotted before any planner runs. */
interface Bound { graph: AnyEditGraph; graphRef: ArtifactRef; dag: ValidatedExecutionDag; receipt: AnyRenderExecutionReceipt; program: RenderProgram;
  qc: TechnicalMediaQcReceipt; report: CriticReport; finding: CriticFinding; evidence: { ref: EvidenceRef; value: unknown }[]; policy: RepairPolicy; attempt: number;
  grid: FrameGrid; clips: ParentClip[]; segments: RepairPlannerInput["segments"][number][]; artifacts: EditorialArtifactMap }
const bytesOf = (value: unknown) => new TextEncoder().encode(canonicalSerialize(value)).length;
function canonicalRecord<T>(run: () => T, value: unknown): T {
  const parsed = run();
  if (!equal(parsed, value)) throw new Error("The record is not in canonical form.");
  return parsed;
}
function bindPlanning(input: Omit<RepairPlanningInput, "planner">): Bound {
  check(input !== null && typeof input === "object", "input_invalid", "A repair planning input is required.");
  // Snapshots of what the plan is admitted under: a caller or planner changing its objects later changes nothing here.
  const findingId = input.findingId, artifacts = input.artifacts;
  check(typeof findingId === "string", "finding_unknown", "A finding identity is required.");
  check(Array.isArray(artifacts), "input_invalid", "Supplied artifacts are a list.");
  let policyValue: unknown;
  try { policyValue = structuredClone(input.policy); } catch { refuse("repair_policy_invalid", "The repair policy must be plain data."); }
  // The parent graph must be exactly the graph this render executed, and replay from its own authority.
  const dag = guard("render_binding_mismatch", () => requireValidated(input.dag));
  const claimed = guard("render_binding_mismatch", () => parseAnyEditGraph(input.graph)), graphRef = supplied(claimed, claimed.editGraphId).ref;
  check(dag.dag.graph.editGraphId === claimed.editGraphId && dag.dag.graph.revision === claimed.revision && equal(dag.dag.editGraph, graphRef), "render_binding_mismatch",
    "The graph is not the exact graph and revision this render executed.");
  const graph = guard("render_binding_mismatch", () => validateAnyEditGraph(claimed, artifacts));
  // The supplied artifacts, held as this plan's own parsed copies: nothing read later (after the planner runs) comes from the caller.
  const artifactMap = guard("input_invalid", () => new EditorialArtifactMap(artifacts));
  const receipt = guard("render_binding_mismatch", () => AnyRenderExecutionReceiptSchema.parse(input.receipt));
  check(receipt.dag.dagId === dag.dag.dagId && receipt.renderComputationId === dag.dag.renderIdentity.renderComputationId && equal(receipt.scope, dag.dag.scope)
    && receipt.editGraph.editGraphId === graph.editGraphId && receipt.editGraph.revision === graph.revision, "render_binding_mismatch",
  "The receipt is not of this exact render.");
  const program = guard("render_binding_mismatch", () => compileRenderProgram(dag, artifacts));
  check(program.programId === receipt.program.programId, "render_binding_mismatch", "The receipt names another program than this DAG executes.");
  // Passing technical QC of exactly these bytes, before any editorial claim is acted on.
  check(input.qc !== undefined && input.qc !== null, "technical_qc_missing", "No technical QC: nothing is repaired from an unverified render.");
  const qc = guard("technical_qc_invalid", () => canonicalRecord(() => TechnicalMediaQcReceiptSchema.parse(input.qc), input.qc));
  check(qc.verdict === "pass", "technical_qc_failed", "Technical QC did not pass: a failed render is never repaired editorially.");
  const out = receipt.output;
  check(qc.execution.receiptId === receipt.receiptId && qc.execution.renderComputationId === receipt.renderComputationId && qc.execution.dagId === receipt.dag.dagId
    && qc.execution.programId === receipt.program.programId && equal(qc.scope, receipt.scope)
    && equal(qc.output, { outputArtifactId: out.outputArtifactId, contentHash: out.contentHash, sizeBytes: out.sizeBytes })
    && equal(qc.observedIdentity, { contentHash: out.contentHash, sizeBytes: out.sizeBytes }), "technical_qc_linkage_mismatch",
  "The technical-QC receipt is not of this receipt and these exact output bytes.");
  // The critic report of exactly this render, and one exact finding in it.
  const report = guard("critic_report_invalid", () => canonicalRecord(() => CriticReportSchema.parse(input.report), input.report));
  const r = report.render;
  check(equal(report.scope, dag.dag.scope) && r.receiptId === receipt.receiptId && r.dagId === dag.dag.dagId && r.programId === program.programId
    && r.renderComputationId === receipt.renderComputationId && r.outputArtifactId === out.outputArtifactId && r.contentHash === out.contentHash && r.sizeBytes === out.sizeBytes
    && report.technicalQc.qcReceiptId === qc.qcReceiptId && equal(report.editGraph, { editGraphId: graph.editGraphId, revision: graph.revision, artifact: graphRef }),
  "critic_report_mismatch", "The critic report is not of this exact rendered output, graph revision and technical QC.");
  const finding = report.findings.find(f => f.findingId === findingId);
  check(finding !== undefined, "finding_unknown", "The finding is not in this critic report.");
  // Every piece of the finding's evidence resolves inside an observation the report lists and the caller supplied.
  check(Array.isArray(input.observations) && input.observations.length <= 64, "finding_evidence_missing", "Observations are a bounded list.");
  const observed = input.observations.map(o => guard("finding_evidence_missing", () => canonicalRecord(() => EditorialObservationSchema.parse(o), o)));
  const observationArtifacts = observed.map(o => supplied(o, o.observationId));
  check(observationArtifacts.every(a => report.observations.some(listed => equal(listed.artifact, a.ref))), "finding_evidence_missing",
    "An observation this report does not list is not its evidence.");
  const evidenceMap = guard("finding_evidence_missing", () => new EditorialArtifactMap(observationArtifacts));
  const evidence = finding.evidenceRefs.map(ref => ({ ref, value: guard("finding_evidence_missing", () => evidenceMap.resolve(ref)) }));
  check(bytesOf(evidence) <= REPAIR_HARD_LIMITS.maxEvidenceBytes, "limit_exceeded", "The finding's evidence exceeds its bound.");
  // The owner's policy, snapshotted; attempts derive from the lineage, never from a caller's count.
  const policy = guard("repair_policy_invalid", () => canonicalRecord(() => RepairPolicySchema.parse(policyValue), policyValue));
  check(equal(policy.scope, dag.dag.scope), "scope_mismatch", "A repair policy for another scope never governs this repair.");
  check((policy.findings.producers as readonly string[]).includes(finding.producer.kind), "finding_producer_not_allowed",
    "The owner's policy does not let this kind of finding drive a repair.");
  const attempt = graph.revision + 1;
  check(attempt <= policy.budget.maxRepairAttempts, "repair_attempts_exhausted", "The repair attempts the owner allows for this lineage are exhausted.");
  // The parent's exact mapping, from the executed DAG and program.
  const tps = dag.dag.settings.ticksPerSecond, grid: FrameGrid = { ticksPerSecond: tps, ...program.output.frameRate };
  const clips: ParentClip[] = dag.dag.nodes.flatMap(n => {
    if (n.kind !== "source_video_clip") return [];
    const use = graph.clipUses.find(c => c.clipUseId === n.clipUseId)!;
    return [{ clipUseId: n.clipUseId, position: n.position, assetId: use.source.assetId, range: use.source.range, output: { startFrame: n.output.startFrame, endFrame: n.output.endFrame },
      ticks: { startTicks: n.output.startTicks, endTicks: n.output.endTicks } }];
  });
  let at = 0;
  const segments = program.segments.map(s => {
    const startFrame = at; at += s.video.frames;
    return { position: s.position, clipUseId: s.clipUseId, source: { startFrame: s.video.startFrame, endFrame: s.video.endFrame }, output: { startFrame, endFrame: at } };
  });
  return { graph, graphRef, dag, receipt, program, qc, report, finding, evidence, policy, attempt, grid, clips, segments, artifacts: artifactMap };
}
function portInputOf(b: Bound): RepairPlannerInput {
  const f = b.finding;
  return frozenCopy({ finding: { findingId: f.findingId, dimension: f.dimension, severity: f.severity, basis: f.basis, producerKind: f.producer.kind, affectedOutput: f.affectedOutput,
    joinIndex: f.joinIndex, explanation: f.explanation }, evidence: b.evidence,
  graph: { editGraphId: b.graph.editGraphId, revision: b.graph.revision, ticksPerSecond: b.grid.ticksPerSecond },
  clips: b.clips.map(c => ({ clipUseId: c.clipUseId, position: c.position, assetId: c.assetId, range: c.range, output: c.output })), segments: b.segments,
  frameRate: b.program.output.frameRate, actions: [...b.policy.actions], limits: { maxOperations: b.policy.budget.maxOperations,
    maxExplanationCharacters: b.policy.budget.maxExplanationCharacters } });
}
/**
 * Turns an untrusted proposal into a plan, or refuses: typed actions of the owner's policy only, each a valid exact trim of the parent (the
 * EditGraph's own rule), within every budget bound, and together removing output the finding names. The effect is derived, never proposed.
 */
function buildPlan(b: Bound, planner: PlannerIdentity, raw: unknown): RepairPlan {
  const budget = b.policy.budget;
  const response = parse(z.strictObject({ rationale: RationaleSchema.refine(v => v.length <= budget.maxExplanationCharacters, "Within the owner's explanation bound."),
    actions: z.array(z.unknown()).max(REPAIR_HARD_LIMITS.maxOperations), uncertainty: DirectorUncertaintySchema }), raw, "planner_response_invalid");
  check(response.uncertainty.evidenceRefs.every(ref => b.finding.evidenceRefs.some(own => equal(own, ref))), "planner_response_invalid",
    "A planner may cite only the finding's own evidence; any other reference is not provenance of this repair.");
  for (const action of response.actions) {
    const name = action !== null && typeof action === "object" ? (action as Record<string, unknown>).action : undefined;
    check(typeof name === "string" && (b.policy.actions as readonly string[]).includes(name), "repair_action_unsupported",
      "Only the owner's typed repair actions may be proposed; patches, paths, commands and unregistered edits are refused.");
  }
  const actions = response.actions.map(a => parse(RepairActionSchema, a, "planner_response_invalid"));
  check(actions.length > 0, "planner_abstained", "The planner proposed no repair; nothing changes.");
  check(actions.length <= budget.maxOperations, "repair_budget_exceeded", "More operations than the owner's repair budget allows.");
  check(new Set(actions.map(a => a.clipUseId)).size === actions.length, "repair_action_invalid", "At most one action per clip.");
  check(actions.length <= budget.maxClipsTouched, "repair_budget_exceeded", "More clips touched than the owner's repair budget allows.");
  const clock = rateOf(b.grid.ticksPerSecond), ticks = (t: SourceRange["start"]) => convertTime(t, clock, "exact").value;
  const frame = (at: number) => { const f = frameIndexAt(at, b.grid); check(f !== undefined, "repair_action_invalid", "A repair boundary lies off the output frame grid."); return f; };
  let firstChanged = b.graph.output.durationTicks;
  const removed: { startFrame: number; endFrame: number }[] = [];
  for (const action of actions) {
    const clip = b.clips.find(c => c.clipUseId === action.clipUseId);
    check(clip !== undefined, "repair_action_invalid", "The action names no video clip use of the exact parent.");
    guard("repair_action_invalid", () => trimSelectionOf(b.graph, { op: "trim_clip_source_range", clipUseId: clip.clipUseId, expected: { range: clip.range },
      replacement: { range: action.keep } }, b.artifacts));
    check(compareTimes(subtractTimes(durationOf(clip.range), durationOf(action.keep)), budget.maxSourceTrimPerOperation) <= 0, "repair_budget_exceeded",
      "The trim removes more source time than the owner's per-operation bound.");
    // Removed parent output: a head [start, start + head) and a tail [start + head + kept, end), on the exact output clock.
    const head = ticks(action.keep.start) - ticks(clip.range.start), kept = ticks(action.keep.end) - ticks(action.keep.start);
    if (head > 0) removed.push({ startFrame: frame(clip.ticks.startTicks), endFrame: frame(clip.ticks.startTicks + head) });
    if (clip.ticks.startTicks + head + kept < clip.ticks.endTicks) removed.push({ startFrame: frame(clip.ticks.startTicks + head + kept), endFrame: frame(clip.ticks.endTicks) });
    // Content before this instant is identical in parent and child; from it on the output differs (everything later shifts).
    firstChanged = Math.min(firstChanged, head > 0 ? clip.ticks.startTicks : clip.ticks.startTicks + kept);
  }
  const duration = b.graph.output.durationTicks, affectedDuration = canonicalTime(tickTime(duration - firstChanged, b.grid.ticksPerSecond));
  check(compareTimes(affectedDuration, budget.maxAffectedOutput) <= 0, "repair_budget_exceeded", "The repair changes more output than the owner's bound allows.");
  const target = b.finding.affectedOutput;
  check(removed.some(r => r.startFrame < target.endFrame && target.startFrame < r.endFrame), "repair_action_unrelated_to_finding",
    "The proposed trim removes nothing the finding names; it does not address the finding.");
  const out = b.receipt.output, f = b.finding;
  const body = { ...header("RepairPlan"), scope: b.dag.dag.scope, parent: { editGraph: b.graphRef, editGraphId: b.graph.editGraphId, revision: b.graph.revision },
    render: { receiptId: b.receipt.receiptId, receiptVersion: b.receipt.artifactVersion, dagId: b.dag.dag.dagId, programId: b.program.programId,
      renderComputationId: b.receipt.renderComputationId, output: { outputArtifactId: out.outputArtifactId, contentHash: out.contentHash, sizeBytes: out.sizeBytes } },
    technicalQc: { qcReceiptId: b.qc.qcReceiptId, verdict: "pass" as const },
    critic: { report: supplied(b.report, b.report.reportId).ref, reportId: b.report.reportId, finding: { findingId: f.findingId, dimension: f.dimension, severity: f.severity,
      basis: f.basis, producerKind: f.producer.kind, affectedOutput: f.affectedOutput, joinIndex: f.joinIndex } },
    evidence: f.evidenceRefs, policy: { policyId: b.policy.policyId }, planner, attempt: { attempt: b.attempt, maxAttempts: budget.maxRepairAttempts },
    rationale: response.rationale, actions, effect: { clipsTouched: actions.length, removedOutputFrames: removed,
      affectedOutput: { startTicks: firstChanged, endTicks: duration, ticksPerSecond: b.grid.ticksPerSecond }, affectedDuration },
    uncertainty: response.uncertainty, outcome: "proposal_only_repair_not_established_until_new_rendered_evidence_v0" as const, implementation: REPAIR_IMPLEMENTATION };
  const plan = parse(RepairPlanSchema, identify("repair_plan_v0", "planId", body), "repair_plan_invalid");
  check(bytesOf(plan) <= budget.maxPlanBytes, "repair_budget_exceeded", "The plan exceeds the owner's plan-size bound.");
  return plan;
}
/**
 * Proposes one bounded repair of one exact finding through the model-neutral port. Everything the plan binds is validated and snapshotted
 * first; the port sees a deep-frozen bounded copy; its response is untrusted data. The plan changes nothing: only its GraphDiff can.
 */
export async function planRepair(input: RepairPlanningInput): Promise<RepairPlan> {
  check(input !== null && typeof input === "object", "input_invalid", "A repair planning input is required.");
  const planner: unknown = input.planner;
  check(planner !== null && typeof planner === "object" && typeof (planner as RepairPlannerPort).propose === "function", "input_invalid", "A repair planner port is required.");
  const port = planner as RepairPlannerPort, identity = parse(PlannerIdentitySchema, { ...port.identity }, "input_invalid");
  const bound = bindPlanning(input);
  let raw: unknown;
  try { raw = await port.propose(portInputOf(bound)); } catch { refuse("planner_failed", "The repair planner failed; a failed proposal changes nothing."); }
  return buildPlan(bound, identity, raw);
}
/** Re-derives a plan from its exact bindings and recorded proposal, without any planner: a plan that does not replay is refused. */
export function validateRepairPlan(planInput: unknown, input: Omit<RepairPlanningInput, "planner">): RepairPlan {
  const plan = requireRepairPlan(planInput), bound = bindPlanning(input);
  const rebuilt = buildPlan(bound, plan.planner, { rationale: plan.rationale, actions: plan.actions, uncertainty: plan.uncertainty });
  check(equal(rebuilt, plan), "repair_plan_invalid", "The plan contradicts its exact bindings, the owner's policy or its derived effect.");
  return structuredClone(plan);
}
