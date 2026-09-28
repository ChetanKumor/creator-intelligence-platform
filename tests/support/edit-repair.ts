// Test-only Gate-7 Batch-3B helpers. Replay-valid parent chains are rendered "on paper" through the accepted builders (the Batch-3A
// helpers), observed with synthetic decoded bytes and reviewed by the accepted critic; repairs go through the Batch-3B core only. The repair
// planner here is a deterministic synthetic fixture rule, not a model and never a product planner. Nothing here starts a process or decodes.
import type { TestContext } from "node:test";
import { canonicalTime, frameTime } from "../../packages/edit-graph/common.js";
import { applyGraphDiff, supplied, type AnyEditGraph, type EditGraph, type EditGraphRevision, type GraphDiff } from "../../packages/edit-graph/index.js";
import { timestampAt, type ValidatedExecutionDag } from "../../packages/edit-runtime/index.js";
import { buildSegmentArtifactRecord, buildSegmentedSuccessReceipt, planLocalizedExecution, segmentArtifactShapeOf, type RenderProgram, type SegmentArtifactRecord,
  type SegmentedReceiptInput, type SegmentedRenderExecutionReceipt, type TechnicalMediaQcReceipt } from "../../packages/edit-render/index.js";
import { buildObservation, createReviewPolicy, planReview, runCriticReview, type CriticFinding, type CriticReport, type EditorialObservation, type ObservationRequest,
  type ReviewPlan, type ReviewPolicy } from "../../packages/edit-review/index.js";
import { compileRepairPlan, createRepairPolicy, planRepair, type RepairPlan, type RepairPlannerInput, type RepairPlannerPort, type RepairPolicy } from "../../packages/edit-repair/index.js";
import type { SuppliedArtifact } from "../../packages/editorial/common.js";
import type { DagFixture } from "./edit-execution.js";
import type { GraphFixture } from "./edit-graph.js";
import { renderDag, renderGraph, type RenderDagOptions } from "./edit-render.js";
import { chainEvidence, chainSource, f32Audio, qcOnPaper, renderedChain, renderedChainOf, sha256Hex, yuvFrames, type ChainOptions, type RenderedChain,
  type SourceSpec } from "./edit-review.js";

export const OWNER = { kind: "owner" as const, actorId: "owner_synthetic" };
/** The owner's Batch-3B acceptance repair policy (implementation policy for these tests, not an architecture constant). */
export function repairPolicyFor(scope: RenderedChain["v"]["dag"]["scope"], patch: { budget?: Partial<RepairPolicy["budget"]>; actions?: string[]; producers?: string[] } = {}):
  RepairPolicy {
  return createRepairPolicy({ scope, author: OWNER, actions: patch.actions ?? ["trim_clip_source_range"],
    findings: { producers: patch.producers ?? ["deterministic_check", "semantic_critic"] },
    budget: { maxOperations: 4, maxClipsTouched: 4, maxAffectedOutput: { value: 8, rate: { numerator: 1, denominator: 1 } },
      maxSourceTrimPerOperation: { value: 2, rate: { numerator: 1, denominator: 1 } }, maxRepairAttempts: 2, maxExplanationCharacters: 400, maxPlanBytes: 65_536,
      ...patch.budget } });
}

// ---------------------------------------------------------------- the deterministic synthetic fixture repair planner (NOT a model)
/**
 * Trims a measured region off the boundary of the one clip it lies in: a region ending at the clip's output end becomes a tail trim, one
 * starting at its output start a head trim; anything else abstains. The keep range is exact, on the output frame grid. `respond` replaces
 * the rule with a hostile or scripted response.
 */
export class BoundaryTrimFixturePlanner implements RepairPlannerPort {
  readonly identity = Object.freeze({ plannerId: "synthetic_boundary_trim_fixture_planner", version: "0.1.0", basis: "synthetic_fixture" as const });
  readonly seen: RepairPlannerInput[] = [];
  constructor(private readonly respond?: (input: RepairPlannerInput) => unknown) {}
  async propose(input: RepairPlannerInput): Promise<unknown> {
    this.seen.push(input);
    if (this.respond !== undefined) return this.respond(input);
    return boundaryTrim(input);
  }
}
const UNCERTAINTY = { state: "qualitative" as const, reasonCode: "synthetic_fixture_rule_not_a_model", evidenceRefs: [] };
export const FIXTURE_RATIONALE = "Synthetic fixture rule: trim the measured region off the clip boundary it touches. Whether that is the right editorial repair is a human question.";
export function boundaryTrim(input: RepairPlannerInput): unknown {
  const { startFrame: s, endFrame: e } = input.finding.affectedOutput;
  const segment = input.segments.find(x => x.output.startFrame <= s && e <= x.output.endFrame);
  if (segment === undefined) return { rationale: FIXTURE_RATIONALE, actions: [], uncertainty: UNCERTAINTY };
  const at = (frame: number) => canonicalTime(frameTime(frame, input.frameRate));
  let keep: [number, number];
  if (e === segment.output.endFrame && s > segment.output.startFrame) keep = [segment.source.startFrame, segment.source.startFrame + (s - segment.output.startFrame)];
  else if (s === segment.output.startFrame && e < segment.output.endFrame) keep = [segment.source.startFrame + (e - segment.output.startFrame), segment.source.endFrame];
  else return { rationale: FIXTURE_RATIONALE, actions: [], uncertainty: UNCERTAINTY };
  return { rationale: FIXTURE_RATIONALE, uncertainty: UNCERTAINTY,
    actions: [{ action: "trim_clip_source_range", clipUseId: segment.clipUseId, keep: { start: at(keep[0]), end: at(keep[1]) } }] };
}

// ---------------------------------------------------------------- an "on paper" parent render with a black tail, reviewed by the accepted critic
export const AB: SourceSpec[] = [{ key: "r3a_a" }, { key: "r3a_b", range: { startSeconds: 1, endSeconds: 3 } }];
const SYNTHETIC = { basis: "synthetic_test_bytes_not_media_decode_v0" as const, tool: null };
export function reviewPolicyFor(c: RenderedChain): ReviewPolicy {
  return createReviewPolicy({ scope: c.v.dag.scope, author: OWNER, windows: { boundaryHalfWindowFrames: 15, globalWindowFrames: 30, interiorSamples: 3 },
    budget: { maxObservations: 16, maxDeliveredFrames: 64, maxDecodedPixelFrames: 1_000_000_000, maxEvidenceBytes: 4_194_304, maxFindings: 32, maxExplanationCharacters: 400,
      maxReviewAttempts: 2, maxTranscriptCharacters: 16_384, maxDecodeMilliseconds: 120_000 } });
}
/** Synthetic decoded bytes of one plan item: luma `luma(frame)`, audio a steady 0.25 DC (no level step anywhere). */
function decodedFor(plan: ReviewPlan, request: ObservationRequest, luma: (frame: number) => number) {
  const { width, height } = plan.facts, count = request.window.endFrame - request.window.startFrame;
  const video = yuvFrames({ width, height, first: request.window.startFrame, count, luma: frame => luma(frame) });
  if (plan.facts.audio.state !== "present" || request.audio === "none") return { video, audio: null };
  const spf = (plan.facts.audio.sampleRateHz * plan.facts.frameRate.denominator) / plan.facts.frameRate.numerator;
  return { video, audio: f32Audio({ channels: plan.facts.audio.channels, first: request.window.startFrame * spf, count: count * spf, sample: () => 0.25 }) };
}
export interface ReviewedChain { c: RenderedChain; g: GraphFixture; policy: ReviewPolicy; plan: ReviewPlan; observations: EditorialObservation[];
  observationArtifacts: SuppliedArtifact[]; report: CriticReport; finding: CriticFinding }
/** An accepted chain rendered on paper; output frames `dark` (default [45, 60)) are near-black in the synthetic decode; one critic review. */
export async function reviewedChain(t: TestContext, o: { sources?: readonly SourceSpec[]; graph?: ChainOptions["graph"]; dark?: readonly [number, number] } = {}):
  Promise<ReviewedChain> {
  const c = await renderedChain(t, o.sources ?? AB, { graph: o.graph ?? { cut: true } });
  const policy = reviewPolicyFor(c), plan = planReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy });
  const [d0, d1] = o.dark ?? [45, 60];
  const observations = plan.items.map((item, itemIndex) => buildObservation({ plan, target: { kind: "plan_item", itemIndex },
    decoded: decodedFor(plan, item.request, frame => frame >= d0 && frame < d1 ? 10 : 180), transcripts: [], acquisition: SYNTHETIC }));
  const report = await runCriticReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy, observations, attempt: 1 });
  const finding = report.findings.find(f => f.producer.kind === "deterministic_check" && f.producer.checkId === "near_black_frames");
  if (finding === undefined) throw new Error("Test fixture expected a near-black finding.");
  return { c, g: c.x.g, policy, plan, observations, observationArtifacts: observations.map(ob => supplied(ob, ob.observationId)), report, finding };
}

// ---------------------------------------------------------------- repair: plan -> GraphDiff -> child revision (Batch-3B core only)
export interface Repaired { repairPolicy: RepairPolicy; plan: RepairPlan; planArtifact: SuppliedArtifact; diff: GraphDiff; diffArtifact: SuppliedArtifact;
  child: EditGraphRevision; childArtifact: SuppliedArtifact; artifacts: SuppliedArtifact[]; planner: BoundaryTrimFixturePlanner }
export function planningInput(x: ReviewedChain, patch: Record<string, unknown> = {}) {
  return { graph: x.g.graph, dag: x.c.v, artifacts: x.c.artifacts, receipt: x.c.receipt, qc: x.c.qc, report: x.report, observations: x.observations,
    findingId: x.finding.findingId, policy: repairPolicyFor(x.c.v.dag.scope), ...patch };
}
export async function repaired(x: ReviewedChain, o: { planner?: BoundaryTrimFixturePlanner; policy?: RepairPolicy } = {}): Promise<Repaired> {
  const planner = o.planner ?? new BoundaryTrimFixturePlanner(), repairPolicy = o.policy ?? repairPolicyFor(x.c.v.dag.scope);
  const plan = await planRepair({ ...planningInput(x), policy: repairPolicy, planner });
  const planArtifact = supplied(plan, plan.planId), base = [...x.c.artifacts, planArtifact];
  const diff = compileRepairPlan(plan, x.g.graph, base), diffArtifact = supplied(diff, diff.graphDiffId);
  const child = applyGraphDiff(x.g.graph, diff, [...base, diffArtifact]), childArtifact = supplied(child, child.editGraphId);
  return { repairPolicy, plan, planArtifact, diff, diffArtifact, child, childArtifact, artifacts: [...base, diffArtifact, childArtifact], planner };
}

// ---------------------------------------------------------------- a child revision through the accepted Batch-1 admission and DAG builders
/**
 * The accepted GraphFixture shape over a revision graph: the parent's Gate-4-6 artifacts plus the parent graph, the GraphDiff (and its repair
 * plan) and the child. The accepted helpers type `graph` as the root EditGraph; they read only fields every EditGraph version shares.
 */
export function revisionFixture(parent: GraphFixture, child: AnyEditGraph, extra: readonly SuppliedArtifact[]): GraphFixture {
  const graphArtifact = supplied(child, child.editGraphId), known = new Set(parent.artifacts.map(a => a.ref.objectId));
  const added = [...extra, graphArtifact].filter(a => { if (known.has(a.ref.objectId)) return false; known.add(a.ref.objectId); return true; });
  return { ...parent, graph: child as unknown as EditGraph, graphArtifact, artifacts: [...parent.artifacts, ...added] };
}
export function revisionDag(parent: GraphFixture, child: AnyEditGraph, extra: readonly SuppliedArtifact[], o: RenderDagOptions = {}) {
  return renderDag(revisionFixture(parent, child, extra), { budget: { attempt: 2, prefix: "gate7_b3b_child" }, ...o });
}
/** The repaired child rendered on paper through the accepted chain and reviewed by the accepted critic; output frames `dark` are near-black. */
export async function reviewedRevision(t: TestContext, parent: ReviewedChain, fx: Repaired, dark: readonly [number, number], sources: readonly SourceSpec[] = AB):
  Promise<ReviewedChain> {
  const x = revisionDag(parent.g, fx.child, fx.artifacts), c = await renderedChainOf(t, x, sources);
  const policy = reviewPolicyFor(c), plan = planReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy });
  const observations = plan.items.map((item, itemIndex) => buildObservation({ plan, target: { kind: "plan_item", itemIndex },
    decoded: decodedFor(plan, item.request, frame => frame >= dark[0] && frame < dark[1] ? 10 : 180), transcripts: [], acquisition: SYNTHETIC }));
  const report = await runCriticReview({ dag: c.v, artifacts: c.artifacts, receipt: c.receipt, qc: c.qc, policy, observations, attempt: 1 });
  const finding = report.findings.find(f => f.producer.kind === "deterministic_check" && f.producer.checkId === "near_black_frames");
  if (finding === undefined) throw new Error("Test fixture expected a near-black finding in the revision.");
  return { c, g: x.g, policy, plan, observations, observationArtifacts: observations.map(ob => supplied(ob, ob.observationId)), report, finding };
}

// ---------------------------------------------------------------- an on-paper SEGMENTED parent render (receipt 0.2.0), for pure reuse planning
export interface SegmentedChain { g: GraphFixture; x: DagFixture; v: ValidatedExecutionDag; program: RenderProgram; receipt: SegmentedRenderExecutionReceipt;
  qc: TechnicalMediaQcReceipt; records: SegmentArtifactRecord[]; artifacts: readonly SuppliedArtifact[] }
const PRESETS: Record<"ab" | "three", { sources: SourceSpec[]; graph: ChainOptions["graph"] }> = {
  ab: { sources: AB, graph: { cut: true } },
  three: { sources: [{ key: "r3a_c", range: { startSeconds: 0, endSeconds: 1 } }, { key: "r3a_d", range: { startSeconds: 1, endSeconds: 2 } },
    { key: "r3a_e", range: { startSeconds: 2, endSeconds: 3 } }], graph: {} },
};
const later = (base: string, milliseconds: number) => timestampAt(Date.parse(base) + milliseconds);
/**
 * Every segment "computed" by a stage process with synthetic, exactly sized artifact identities, then one assembly: the accepted builders
 * make the binding and start, the Batch-3B builder the 0.2.0 receipt and durable segment records, and QC is built from synthetic probe JSON.
 */
export async function segmentedChain(t: TestContext, preset: "ab" | "three"): Promise<SegmentedChain> {
  const { sources, graph } = PRESETS[preset];
  const x = renderDag(renderGraph({ sources: sources.map(s => chainSource(s)), ...(graph ?? {}) })), e = await chainEvidence(t, x, sources);
  const program = e.program, plan = planLocalizedExecution({ program, scope: e.v.dag.scope, prior: null });
  const processes: SegmentedReceiptInput["processes"][number][] = [], segments: SegmentedReceiptInput["segments"][number][] = [], records: SegmentArtifactRecord[] = [];
  const benchmark = { cpuMilliseconds: 60, userMilliseconds: 50, systemMilliseconds: 10, realMilliseconds: 90, maxResidentKibibytes: 40_000 };
  const diagnostics = { capturedBytes: 0, sha256: sha256Hex(""), truncated: false, excerpt: [] };
  let clock = e.start.startedAt;
  for (const segment of program.segments) {
    const shape = segmentArtifactShapeOf(program, segment.position), spawnedAt = later(clock, 10), completedAt = later(spawnedAt, 90);
    const video = { contentHash: sha256Hex(`b3b-paper-video-${segment.segmentComputationId}`), sizeBytes: shape.video.bytes };
    const audio = shape.audio === null ? null : { contentHash: sha256Hex(`b3b-paper-audio-${segment.segmentComputationId}`), sizeBytes: shape.audio.bytes };
    const argvDigest = sha256Hex(`b3b-paper-stage-${segment.position}`);
    const record = buildSegmentArtifactRecord({ program, position: segment.position, video, audio,
      producedBy: { startId: e.start.startId, claimId: e.claim.claimId, argvDigest, ffmpegSha256: e.runtimeProbe.binaries.ffmpeg.sha256 } });
    records.push(record);
    processes.push({ role: "segment_stage", position: segment.position, wallClockMilliseconds: 90, benchmark, diagnostics,
      process: { spawnedAt, completedAt, exitCode: 0, signal: null, timeoutMilliseconds: 120_000, outputByteBound: shape.video.bytes + 1, argvDigest, argvCount: 40 } });
    segments.push({ position: segment.position, disposition: "computed_by_this_execution", artifact: { recordId: record.recordId, video, audio },
      publication: "published_by_this_execution", verification: { bytesHashed: video.sizeBytes + (audio?.sizeBytes ?? 0), wallClockMilliseconds: 3 } });
    clock = completedAt;
  }
  const spawnedAt = later(clock, 10), completedAt = later(spawnedAt, 400);
  processes.push({ role: "assembly", position: null, wallClockMilliseconds: 400, benchmark: { ...benchmark, cpuMilliseconds: 234 }, diagnostics,
    process: { spawnedAt, completedAt, exitCode: 0, signal: null, timeoutMilliseconds: 120_000, outputByteBound: 23_320_576, argvDigest: sha256Hex("b3b-paper-assembly"),
      argvCount: 80 } });
  const receipt = buildSegmentedSuccessReceipt({ binding: e.binding, start: e.start, program, runtimeProbe: e.runtimeProbe, reservation: x.chain.reservation, plan,
    segments, processes, diagnostics, recordedAt: later(completedAt, 50),
    output: { contentHash: sha256Hex(`b3b-paper-output-${program.programId}`), sizeBytes: 150_001, publication: "published_by_this_execution" } });
  return { g: x.g, x, v: e.v, program, receipt, qc: qcOnPaper(e.v, receipt, program), records, artifacts: e.call.artifacts };
}
