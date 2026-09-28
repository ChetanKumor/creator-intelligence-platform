/**
 * DependencyImpact: what one GraphDiff changed, derived from the exact parent and child graphs, their compiled DAGs and RenderPrograms, never
 * asserted by a planner or model. It names the changed clips and operations, the exact changed output region on the graph clock (and in
 * frames), which DAG node computations are preserved or invalidated, and which rendered segment computations are reusable (the identical
 * computation identity exists in the parent program) or must be recomputed. Occurrence identity is not computation identity: a clip that
 * only moves keeps its segment computation. Global dependencies (the sequence, composition, final encode and the whole-output assembly)
 * are recomputed whenever anything changes; where locality cannot be proven, the impact widens, never narrows.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { Nat, ScopeSchema } from "../edit-graph/common.js";
import { EditGraphRevisionSchema, GraphDiffSchema, parseAnyEditGraph, supplied, type AnyEditGraph, type ClipUse, type Operation } from "../edit-graph/index.js";
import { PositiveSafeInt } from "../edit-execution/common.js";
import { DAG_NODE_KINDS, ExecutionDagSchema, frameIndexAt, type ExecutionDag, type ExecutionDagNode } from "../edit-execution/index.js";
import { RenderProgramSchema, type RenderProgram } from "../edit-render/index.js";
import { check, envelope, guard, header, parse, parseCanonical } from "./common.js";

const State = z.enum(["computation_preserved", "computation_changed"]);
/** A changed region may be empty on one side only: a child that is an exact prefix of its parent changed nothing it still shows. */
const RegionSchema = z.strictObject({ startTicks: Nat, endTicks: Nat, startFrame: Nat, endFrame: Nat })
  .refine(r => r.endTicks >= r.startTicks && r.endFrame >= r.startFrame && (r.endTicks === r.startTicks) === (r.endFrame === r.startFrame), "An ordered changed region.");
const GraphRefSchema = z.strictObject({ editGraphId: IdSchema, revision: Nat, dagId: IdSchema, programId: IdSchema });
const ImpactBodySchema = z.strictObject({
  ...envelope("DependencyImpact"), scope: ScopeSchema, parent: GraphRefSchema, child: GraphRefSchema, graphDiff: z.strictObject({ graphDiffId: IdSchema }),
  clips: z.array(z.strictObject({ position: Nat, medium: z.enum(["video", "source_audio"]), parentClipUseId: IdSchema, childClipUseId: IdSchema,
    change: z.enum(["unchanged", "source_changed", "placement_shifted"]) })).max(32),
  operations: z.array(z.strictObject({ obligationNodeId: IdSchema, primitive: z.enum(["color_look", "cut_transition"]), parentOperationId: IdSchema, childOperationId: IdSchema,
    change: z.enum(["unchanged", "derived_placement_changed"]) })).max(64),
  changedRegion: z.strictObject({ basis: z.literal("first_changed_output_instant_to_end_contiguous_track_v0"), ticksPerSecond: PositiveSafeInt, parent: RegionSchema,
    child: RegionSchema }).refine(r => r.parent.startTicks === r.child.startTicks && (r.parent.endTicks > r.parent.startTicks || r.child.endTicks > r.child.startTicks),
    "One first changed instant, and a change somewhere."),
  dagNodes: z.array(z.strictObject({ kind: z.enum(DAG_NODE_KINDS), position: Nat.nullable(), parentNodeId: IdSchema, childNodeId: IdSchema, parentComputationId: IdSchema,
    childComputationId: IdSchema, state: State })).max(64),
  segments: z.array(z.strictObject({ position: Nat, segmentComputationId: IdSchema, decision: z.enum(["reusable_identical_computation", "recompute_changed_computation"]),
    parentPosition: Nat.nullable() })).min(1).max(16),
  retiredSegments: z.array(z.strictObject({ position: Nat, segmentComputationId: IdSchema })).max(16),
  globals: z.strictObject({ cutSequence: State, composition: State, finalEncode: State, assembly: z.literal("recompute_whole_output") }),
  summary: z.strictObject({ segments: PositiveSafeInt, reusable: Nat, recompute: Nat, dagNodesPreserved: Nat, dagNodesChanged: Nat }),
  derivation: z.literal("derived_from_exact_graphs_dags_and_programs_never_asserted_v0"),
});
export const DependencyImpactSchema = ImpactBodySchema.extend({ impactId: IdSchema })
  .refine(v => checkIdentity(v, "impactId", "dependency_impact_v0"), "Dependency impact identity mismatch.");
export type DependencyImpact = z.infer<typeof DependencyImpactSchema>;
export interface ImpactSide { graph: unknown; dag: ExecutionDag; program: RenderProgram }

interface Span { startTicks: number; endTicks: number }
/** The first output instant at which two ordered extent lists differ, or undefined when they are identical. */
function firstDifference(parent: readonly Span[], child: readonly Span[]): number | undefined {
  for (let i = 0; i < Math.max(parent.length, child.length); i += 1) {
    const p = parent[i], c = child[i];
    if (p === undefined || c === undefined) return (p ?? c)!.startTicks;
    if (p.startTicks !== c.startTicks) return Math.min(p.startTicks, c.startTicks);
    if (p.endTicks !== c.endTicks) return Math.min(p.endTicks, c.endTicks);
  }
  return undefined;
}
/**
 * Where a clip's shown content starts to differ: nowhere when source and placement are identical; from the later-kept content when only the
 * source end moved (same asset, same source start, same output start); otherwise from its earlier output start.
 */
function clipDivergence(p: ClipUse, c: ClipUse): number | undefined {
  if (equal(p.source, c.source) && equal(p.output, c.output) && equal(p.mapping, c.mapping)) return undefined;
  const start = Math.min(p.output.startTicks, c.output.startTicks);
  const sameHead = p.output.startTicks === c.output.startTicks && p.mapping.sourceStartTicks === c.mapping.sourceStartTicks
    && p.source.assetId === c.source.assetId && p.source.sourceHash === c.source.sourceHash;
  return sameHead ? start + Math.min(p.output.endTicks - p.output.startTicks, c.output.endTicks - c.output.startTicks) : start;
}
function operationDivergence(p: Operation, c: Operation): number | undefined {
  if (p.primitive === "cut_transition" && c.primitive === "cut_transition") return p.atTicks === c.atTicks ? undefined : Math.min(p.atTicks, c.atTicks);
  if (p.primitive === "color_look" && c.primitive === "color_look") return firstDifference(p.extents, c.extents);
  return 0;
}
/**
 * Derives the impact of one GraphDiff from exact records: the child must name exactly this parent and this GraphDiff, each DAG must be of its
 * graph and each program of its DAG. V0 GraphDiff operations never change graph structure, so parent and child nodes correspond one to one.
 */
export function deriveDependencyImpact(input: { parent: ImpactSide; child: ImpactSide; diff: unknown }): DependencyImpact {
  check(input !== null && typeof input === "object" && input.parent !== null && typeof input.parent === "object" && input.child !== null && typeof input.child === "object",
    "impact_input_invalid", "A parent side, a child side and a GraphDiff are required.");
  const parent = guard("impact_input_invalid", () => parseAnyEditGraph(input.parent.graph));
  const child = parseCanonical(EditGraphRevisionSchema, input.child.graph, "impact_input_invalid");
  const diff = parseCanonical(GraphDiffSchema, input.diff, "impact_input_invalid");
  const parentBinding = { editGraph: supplied(parent, parent.editGraphId).ref, editGraphId: parent.editGraphId, revision: parent.revision };
  check(equal(diff.parent, parentBinding) && equal(child.parent, { state: "present", ...parentBinding })
    && equal(child.changeSet, { kind: "graph_diff", graphDiff: supplied(diff, diff.graphDiffId).ref, graphDiffId: diff.graphDiffId }) && equal(child.scope, parent.scope),
  "impact_input_invalid", "The child is not a revision of this exact parent by this exact GraphDiff.");
  const side = (graph: AnyEditGraph, s: ImpactSide) => {
    const dag = parse(ExecutionDagSchema, s.dag, "impact_input_invalid"), program = parse(RenderProgramSchema, s.program, "impact_input_invalid");
    check(equal(dag.graph, { editGraphId: graph.editGraphId, revision: graph.revision }) && equal(dag.editGraph, supplied(graph, graph.editGraphId).ref), "impact_input_invalid",
      "The DAG is not compiled from this exact graph.");
    const b = program.binding;
    check(b.dagId === dag.dagId && b.renderComputationId === dag.renderIdentity.renderComputationId && b.editGraphId === graph.editGraphId && b.revision === graph.revision,
      "impact_input_invalid", "The program is not compiled from this exact DAG.");
    return { dag, program, grid: { ticksPerSecond: dag.settings.ticksPerSecond, ...program.output.frameRate } };
  };
  const ps = side(parent, input.parent), cs = side(child, input.child);
  check(ps.grid.ticksPerSecond === cs.grid.ticksPerSecond && equal(ps.program.output.frameRate, cs.program.output.frameRate), "impact_input_invalid",
    "Parent and child render on the same exact clock and frame grid.");
  // Clip uses correspond by track and position: a V0 trim never adds, removes or reorders a use.
  check(parent.clipUses.length === child.clipUses.length && parent.operations.length === child.operations.length, "impact_input_invalid",
    "A V0 GraphDiff never changes graph structure.");
  const videoPositions = (g: AnyEditGraph) => new Map(g.clipUses.filter(c => c.medium === "video").map((c, i) => [c.clipUseId, i]));
  const pPos = videoPositions(parent), cPos = videoPositions(child);
  const positionOf = (use: ClipUse, positions: Map<string, number>) => positions.get(use.medium === "video" ? use.clipUseId : use.linkedVideoClipUseId);
  let firstChanged: number | undefined;
  const earliest = (at: number | undefined) => { if (at !== undefined) firstChanged = firstChanged === undefined ? at : Math.min(firstChanged, at); };
  const clipRows = child.clipUses.map((c, i) => {
    const p = parent.clipUses[i]!, position = positionOf(c, cPos);
    check(p.medium === c.medium && position !== undefined && positionOf(p, pPos) === position, "impact_input_invalid", "Clip uses correspond by track and position.");
    earliest(clipDivergence(p, c));
    const change = !equal(p.source, c.source) || !equal(p.mapping.sourceStartTicks, c.mapping.sourceStartTicks) ? "source_changed" as const
      : !equal(p.output, c.output) ? "placement_shifted" as const : "unchanged" as const;
    return { position, medium: c.medium, parentClipUseId: p.clipUseId, childClipUseId: c.clipUseId, change };
  });
  const clips = [...clipRows.filter(c => c.medium === "video"), ...clipRows.filter(c => c.medium === "source_audio")];
  // Operations correspond by the obligation they were resolved from; V0 never changes an operation's own parameters, only what derives from placement.
  const operations = child.operations.map(c => {
    const p = parent.operations.find(o => o.primitive === c.primitive && o.resolvedFrom.obligationNodeId === c.resolvedFrom.obligationNodeId);
    check(p !== undefined && equal(p.resolvedFrom, c.resolvedFrom) && (p.primitive !== "color_look" || (c.primitive === "color_look" && equal(p.parameters, c.parameters)
      && p.target.kind === c.target.kind)), "impact_input_invalid", "Operations correspond by their resolution and keep their own parameters.");
    earliest(operationDivergence(p, c));
    return { obligationNodeId: c.resolvedFrom.obligationNodeId, primitive: c.primitive, parentOperationId: p.operationId, childOperationId: c.operationId,
      change: equal(p, c) ? "unchanged" as const : "derived_placement_changed" as const };
  });
  check(firstChanged !== undefined, "impact_input_invalid", "A GraphDiff that changes nothing has no impact; the graph layer refuses it.");
  const region = (g: AnyEditGraph, grid: typeof ps.grid) => {
    const startFrame = frameIndexAt(firstChanged!, grid), endFrame = frameIndexAt(g.output.durationTicks, grid);
    check(startFrame !== undefined && endFrame !== undefined, "impact_input_invalid", "A changed region lies on the exact output frame grid.");
    return { startTicks: Math.min(firstChanged!, g.output.durationTicks), endTicks: g.output.durationTicks, startFrame: Math.min(startFrame, endFrame), endFrame };
  };
  // DAG nodes correspond by kind and track position (a look node by its operation's resolution and target); preserved means the identical computation.
  const lookKey = (g: AnyEditGraph, positions: Map<string, number>, n: Extract<ExecutionDagNode, { kind: "color_look" }>) => {
    const op = g.operations.find(o => o.operationId === n.operationId);
    return `color_look:${op?.resolvedFrom.obligationNodeId ?? "?"}:${n.target.kind === "clip_use" ? positions.get(n.target.clipUseId) ?? "?" : "whole_output"}`;
  };
  const keyOf = (g: AnyEditGraph, positions: Map<string, number>, n: ExecutionDagNode) => n.kind === "source_video_clip" || n.kind === "linked_source_audio"
    ? `${n.kind}:${n.position}` : n.kind === "color_look" ? lookKey(g, positions, n) : n.kind;
  const positionOfNode = (positions: Map<string, number>, n: ExecutionDagNode) => n.kind === "source_video_clip" || n.kind === "linked_source_audio" ? n.position
    : n.kind === "color_look" && n.target.kind === "clip_use" ? positions.get(n.target.clipUseId) ?? null : null;
  const parentNodes = new Map(ps.dag.nodes.map(n => [keyOf(parent, pPos, n), n]));
  check(parentNodes.size === ps.dag.nodes.length && ps.dag.nodes.length === cs.dag.nodes.length, "impact_input_invalid", "DAG nodes correspond one to one.");
  const dagNodes = cs.dag.nodes.map(n => {
    const p = parentNodes.get(keyOf(child, cPos, n));
    check(p !== undefined && p.kind === n.kind, "impact_input_invalid", "DAG nodes correspond one to one.");
    return { kind: n.kind, position: positionOfNode(cPos, n), parentNodeId: p.nodeId, childNodeId: n.nodeId, parentComputationId: p.computationId,
      childComputationId: n.computationId, state: p.computationId === n.computationId ? "computation_preserved" as const : "computation_changed" as const };
  });
  const stateOf = (kind: ExecutionDagNode["kind"]) => dagNodes.find(n => n.kind === kind)!.state;
  // Segments: reusable exactly when the identical computation identity exists in the parent program; everything else recomputes.
  const segments = cs.program.segments.map(s => {
    const prior = ps.program.segments.find(q => q.segmentComputationId === s.segmentComputationId);
    return { position: s.position, segmentComputationId: s.segmentComputationId,
      decision: prior === undefined ? "recompute_changed_computation" as const : "reusable_identical_computation" as const, parentPosition: prior?.position ?? null };
  });
  const retiredSegments = ps.program.segments.filter(q => !cs.program.segments.some(s => s.segmentComputationId === q.segmentComputationId))
    .map(q => ({ position: q.position, segmentComputationId: q.segmentComputationId }));
  const reusable = segments.filter(s => s.decision === "reusable_identical_computation").length;
  const preserved = dagNodes.filter(n => n.state === "computation_preserved").length;
  const body = { ...header("DependencyImpact"), scope: child.scope,
    parent: { editGraphId: parent.editGraphId, revision: parent.revision, dagId: ps.dag.dagId, programId: ps.program.programId },
    child: { editGraphId: child.editGraphId, revision: child.revision, dagId: cs.dag.dagId, programId: cs.program.programId }, graphDiff: { graphDiffId: diff.graphDiffId },
    clips, operations, changedRegion: { basis: "first_changed_output_instant_to_end_contiguous_track_v0" as const, ticksPerSecond: cs.grid.ticksPerSecond,
      parent: region(parent, ps.grid), child: region(child, cs.grid) }, dagNodes, segments, retiredSegments,
    globals: { cutSequence: stateOf("cut_sequence"), composition: stateOf("composition"), finalEncode: stateOf("final_encode"), assembly: "recompute_whole_output" as const },
    summary: { segments: segments.length, reusable, recompute: segments.length - reusable, dagNodesPreserved: preserved, dagNodesChanged: dagNodes.length - preserved },
    derivation: "derived_from_exact_graphs_dags_and_programs_never_asserted_v0" as const };
  return parse(DependencyImpactSchema, identify("dependency_impact_v0", "impactId", body), "impact_input_invalid");
}
