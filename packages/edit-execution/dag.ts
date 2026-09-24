/**
 * ExecutionDAG V0: the provider-neutral work an admitted execution would perform, compiled only from a replay-valid
 * ExecutionAdmission. Nodes are typed and bounded; none carries a command, filter description, path, URL or prose.
 * Each node has an occurrence identity (nodeId: lineage and position in this DAG) and a computation identity
 * (computationId) that binds exactly the semantic inputs affecting its bytes, Merkle-style through its inputs'
 * computation identities. Batch 1 compiles and identifies work; it never executes it.
 */
import { z } from "zod";
import { IdSchema, TimeRangeSchema } from "../contracts/common.js";
import { ArtifactRefSchema, EvidenceRefSchema, availability, checkIdentity, compareText, equal, identify, missing, present, type ArtifactRef,
  type SuppliedArtifact } from "../editorial/common.js";
import { EditGraphSchema, type AudioClipUse, type EditGraph, type Operation, type VideoClipUse } from "../edit-graph/index.js";
import { FrameRateBoundsSchema, HashSchema, Nat, ResolutionBoundsSchema } from "../edit-graph/common.js";
import { LookSchema } from "../edit-graph/resolution.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { BoundaryAuthoritySchema } from "../planning/common.js";
import { EDIT_EXECUTION_VERSION, ExecutionExecutorIdentitySchema, PositiveSafeInt, RenderIntentSchema, ScopeSchema, SuppliedArtifacts, check, envelope, guard, header, parse,
  refSet, refuse } from "./common.js";
import { DISPATCH_NOT_CLAIMED, DispatchSchema, ExecutionAdmissionSchema, validateExecutionAdmission, type ExecutionAdmission } from "./admission.js";
import { AudioEncodingSchema, ExecutionRenderProfileSchema, VideoEncodingSchema, type ExecutionRenderProfile } from "./policy.js";
import { RuntimeIdentitySchema } from "./runtime.js";
import { frameIndexAt } from "./workload.js";

export const DAG_NODE_KINDS = ["source_video_clip", "linked_source_audio", "color_look", "cut_sequence", "composition", "final_encode"] as const;
export const MAX_DAG_NODES = 64;
/** Bound into every computation identity: a change of DAG semantics changes every node identity. */
const DAG_SEMANTICS = "execution_dag_v0";
const nodeIdentity = (v: object) => checkIdentity(v, "nodeId", "execution_dag_node_v0");
const SpanSchema = z.strictObject({ startTicks: Nat, endTicks: Nat, startFrame: Nat, endFrame: Nat })
  .refine(v => v.endTicks > v.startTicks && v.endFrame > v.startFrame, "Spans must be positive.");
/**
 * The exact source-trim authority, copied from the accepted EditGraph (never rebuilt from seconds): which source endpoints the
 * seconds range denotes and which frame-time table established them. `source_seconds` keeps its weaker authority explicitly.
 */
const TrimAuthoritySchema = z.strictObject({ shotId: IdSchema, boundaryId: IdSchema, precision: z.enum(["frame_pts_exact", "source_seconds"]),
  startAuthority: BoundaryAuthoritySchema, endAuthority: BoundaryAuthoritySchema, timebase: EvidenceRefSchema, support: EvidenceRefSchema });
/** The content of the frame-time table the timebase resolves to: the frame count and a content identity of the exact PTS values. */
const FrameTimesSchema = z.strictObject({ count: PositiveSafeInt, tableId: IdSchema });
const SourceFieldsSchema = z.strictObject({ assetId: IdSchema, contentHash: HashSchema, analysis: ArtifactRefSchema, receipt: ArtifactRefSchema, range: TimeRangeSchema,
  trim: TrimAuthoritySchema, frameTimes: FrameTimesSchema });
type Source = z.infer<typeof SourceFieldsSchema>;
/** The accepted Gate-5 construction: every endpoint and the timebase point into the node's own analysis with their exact pointers. */
function trimAuthorityIssue({ analysis, trim, frameTimes }: Source): string | undefined {
  const frameExact = trim.startAuthority.kind === "frame_pts" && trim.endAuthority.kind === "frame_pts";
  if ((trim.precision === "frame_pts_exact") !== frameExact) return "Trim precision must follow the endpoint authority.";
  if (!equal(trim.timebase, { artifact: analysis, pointer: "/metadata/frameTimes" })) return "The timebase must be the analysis frame-time table.";
  for (const [authority, side] of [[trim.startAuthority, "startSeconds"], [trim.endAuthority, "endSeconds"]] as const) {
    if (!equal(authority.evidence.artifact, analysis)) return "Endpoint authority must come from the node's own analysis.";
    if (authority.kind === "frame_pts" ? authority.evidence.pointer !== `/metadata/frameTimes/${authority.frameIndex}` || authority.frameIndex >= frameTimes.count
      : !new RegExp(`^/candidates/(0|[1-9][0-9]*)/candidate/sourceRange/${side}$`).test(authority.evidence.pointer)) {
      return "Endpoint authority must name its exact frame or candidate endpoint.";
    }
  }
  return undefined;
}
const SourceSchema = SourceFieldsSchema.superRefine((source, ctx) => {
  const issue = trimAuthorityIssue(source);
  if (issue !== undefined) ctx.addIssue({ code: "custom", message: issue });
});
/** Scope-free content identity of one exact frame-time table. */
const frameTimesOf =(frameTimes: readonly number[]) => ({ count: frameTimes.length, tableId: identify("source_frame_times_v0", "tableId", { frameTimes }).tableId });
const MappingSchema = z.strictObject({ kind: z.literal("constant_speed_identity"), rate: z.strictObject({ numerator: z.literal(1), denominator: z.literal(1) }),
  sourceStartTicks: Nat, sourceEndTicks: Nat, exactness: z.literal("source_endpoints_exact_on_output_clock") });
const OutputSchema = z.strictObject({ durationTicks: PositiveSafeInt, frames: PositiveSafeInt });
const nodeFields = { nodeId: IdSchema, computationId: IdSchema, inputs: z.array(IdSchema).max(MAX_DAG_NODES) };
export const ExecutionDagNodeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("source_video_clip"), ...nodeFields, clipUseId: IdSchema, position: Nat, source: SourceSchema, output: SpanSchema,
    mapping: MappingSchema, framing: z.literal("source_aspect_matches_output") }).refine(nodeIdentity, "DAG node identity mismatch."),
  z.strictObject({ kind: z.literal("linked_source_audio"), ...nodeFields, clipUseId: IdSchema, linkedVideoClipUseId: IdSchema, position: Nat, source: SourceSchema,
    output: z.strictObject({ startTicks: Nat, endTicks: Nat }).refine(v => v.endTicks > v.startTicks, "Spans must be positive."), mapping: MappingSchema,
    gain: z.strictObject({ numerator: z.literal(1), denominator: z.literal(1) }) }).refine(nodeIdentity, "DAG node identity mismatch."),
  z.strictObject({ kind: z.literal("color_look"), ...nodeFields, operationId: IdSchema,
    target: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("clip_use"), clipUseId: IdSchema }), z.strictObject({ kind: z.literal("whole_output") })]),
    parameters: z.strictObject({ look: LookSchema, intensityPerMille: z.number().int().min(0).max(1000) }), extent: SpanSchema }).refine(nodeIdentity, "DAG node identity mismatch."),
  z.strictObject({ kind: z.literal("cut_sequence"), ...nodeFields, clipUseIds: z.array(IdSchema).min(1).max(16),
    joins: z.array(z.strictObject({ fromClipUseId: IdSchema, toClipUseId: IdSchema, atTicks: PositiveSafeInt, atFrame: PositiveSafeInt, transition: z.literal("cut"),
      operation: availability(IdSchema) })).max(15), output: OutputSchema }).refine(nodeIdentity, "DAG node identity mismatch."),
  z.strictObject({ kind: z.literal("composition"), ...nodeFields, audio: z.array(z.strictObject({ clipUseId: IdSchema, startTicks: Nat, endTicks: Nat })).max(16),
    output: OutputSchema }).refine(nodeIdentity, "DAG node identity mismatch."),
  z.strictObject({ kind: z.literal("final_encode"), ...nodeFields,
    encoding: z.strictObject({ video: VideoEncodingSchema, audio: z.discriminatedUnion("state", [
      z.strictObject({ state: z.literal("encoded"), codecFamily: AudioEncodingSchema.shape.codecFamily, sampleRateHz: AudioEncodingSchema.shape.sampleRateHz,
        channelLayout: AudioEncodingSchema.shape.channelLayout }),
      z.strictObject({ state: z.literal("no_audio_stream") })]) }),
    output: z.strictObject({ resolution: ResolutionBoundsSchema, frameRate: FrameRateBoundsSchema, frames: PositiveSafeInt, durationTicks: PositiveSafeInt }) })
    .refine(nodeIdentity, "DAG node identity mismatch."),
]);
export type ExecutionDagNode = z.infer<typeof ExecutionDagNodeSchema>;
/**
 * Byte-affecting execution settings shared by every node of one DAG, including the attested encoding runtime build and the exact
 * execution environment: no policy yet proves two environments byte-equivalent, so unknown equivalence never shares work.
 */
export const ExecutionDagSettingsSchema = z.strictObject({ renderIntent: RenderIntentSchema, executor: ExecutionExecutorIdentitySchema, runtime: RuntimeIdentitySchema,
  environment: IdSchema, ticksPerSecond: PositiveSafeInt, frameRate: FrameRateBoundsSchema, resolution: ResolutionBoundsSchema, video: VideoEncodingSchema,
  audio: AudioEncodingSchema });
export type ExecutionDagSettings = z.infer<typeof ExecutionDagSettingsSchema>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A node before identification: inputs are positions of earlier nodes. */
export type ExecutionDagNodeDraft = DistributiveOmit<ExecutionDagNode, "nodeId" | "computationId" | "inputs"> & { inputs: readonly number[] };

// ---------------------------------------------------------------- computation identity: exactly what affects a node's bytes
/**
 * Every trim and timebase field that can change which decoded source frames or samples are selected: the seconds range, its
 * precision, each endpoint's authority kind and frame index, and the content of the frame-time table they index. Evidence
 * references, shot, boundary and support identities are lineage, bound by the occurrence identity only: they name a
 * scope-bearing FootageAnalysis, and a computation identity carries no project, creator or analysis identity.
 */
const endpoint = (authority: Source["trim"]["startAuthority"]) => authority.kind === "frame_pts" ? { kind: authority.kind, frameIndex: authority.frameIndex } : { kind: authority.kind };
const sourceContent = (source: Source) => ({ contentHash: source.contentHash, range: source.range, precision: source.trim.precision,
  start: endpoint(source.trim.startAuthority), end: endpoint(source.trim.endAuthority), frameTimes: source.frameTimes });
/**
 * Occurrence lineage (clip-use, operation and receipt IDs, positions) is excluded, so identical work is shared across
 * repeated uses; absolute output placement enters only where it changes bytes (sequence joins, audio placement). The render
 * intent, executor build, encoding runtime and execution environment bind every node, so preview and final work, or work in
 * two environments, can never share an identity. A computation identity names work, never access: a future cache must
 * separately prove current authorized scope and access.
 */
function computation(draft: ExecutionDagNodeDraft, s: ExecutionDagSettings, inputs: readonly string[]): unknown {
  const common = { semantics: DAG_SEMANTICS, kind: draft.kind, renderIntent: s.renderIntent, executor: s.executor, runtime: s.runtime, environment: s.environment };
  const video = { resolution: s.resolution, frameRate: s.frameRate, pixelFormat: s.video.pixelFormat };
  switch (draft.kind) {
    case "source_video_clip": return { ...common, source: sourceContent(draft.source), mapping: draft.mapping, ticksPerSecond: s.ticksPerSecond,
      frames: draft.output.endFrame - draft.output.startFrame, framing: draft.framing, video };
    case "linked_source_audio": return { ...common, source: sourceContent(draft.source), mapping: draft.mapping, ticksPerSecond: s.ticksPerSecond,
      durationTicks: draft.output.endTicks - draft.output.startTicks, gain: draft.gain, audio: { sampleRateHz: s.audio.sampleRateHz, channelLayout: s.audio.channelLayout } };
    case "color_look": return { ...common, target: draft.target.kind, parameters: draft.parameters, frames: draft.extent.endFrame - draft.extent.startFrame,
      input: inputs[0] ?? null, video };
    case "cut_sequence": return { ...common, inputs, joins: draft.joins.map(j => ({ atFrame: j.atFrame, transition: j.transition })), frames: draft.output.frames, video };
    case "composition": return { ...common, video: inputs[0] ?? null, audio: draft.audio.map((a, i) => ({ input: inputs[i + 1] ?? null, startTicks: a.startTicks, endTicks: a.endTicks })),
      durationTicks: draft.output.durationTicks, ticksPerSecond: s.ticksPerSecond, frames: draft.output.frames };
    case "final_encode": return { ...common, input: inputs[0] ?? null, encoding: draft.encoding, output: draft.output };
    default: return refuse("operation_not_executable", "Unregistered DAG node kind.");
  }
}
/** Typed topology: each kind consumes exactly the nodes its semantics require, in order. */
function topologyIssue(draft: ExecutionDagNodeDraft, inputs: readonly ExecutionDagNode[]): string | undefined {
  const [first] = inputs;
  switch (draft.kind) {
    case "source_video_clip": case "linked_source_audio": return inputs.length === 0 ? undefined : "Source nodes take no inputs.";
    case "color_look":
      if (inputs.length !== 1 || first === undefined) return "A look consumes exactly one node.";
      if (draft.target.kind === "whole_output") return first.kind === "cut_sequence" ? undefined : "A whole-output look consumes the whole sequence.";
      return first.kind === "source_video_clip" && first.clipUseId === draft.target.clipUseId ? undefined : "A clip-scoped look consumes exactly its clip.";
    case "cut_sequence":
      return inputs.length === draft.clipUseIds.length && inputs.every((input, i) => (input.kind === "source_video_clip" && input.clipUseId === draft.clipUseIds[i])
        || (input.kind === "color_look" && input.target.kind === "clip_use" && input.target.clipUseId === draft.clipUseIds[i])) ? undefined
        : "The sequence consumes each clip exactly once, in order.";
    case "composition": {
      const videoOk = first !== undefined && (first.kind === "cut_sequence" || (first.kind === "color_look" && first.target.kind === "whole_output"));
      const audioOk = inputs.length === draft.audio.length + 1 && draft.audio.every((a, i) => { const input = inputs[i + 1]; return input?.kind === "linked_source_audio" && input.clipUseId === a.clipUseId; });
      return videoOk && audioOk ? undefined : "The composition consumes the video output and each linked audio use.";
    }
    case "final_encode": return inputs.length === 1 && first?.kind === "composition" ? undefined : "The encode consumes the composition.";
    default: return "Unregistered DAG node kind.";
  }
}
/** Identifies drafts in order. Shared by compilation and structural validation; it produces nodes, never an admitted DAG. */
export function identifyDagNodes(drafts: readonly ExecutionDagNodeDraft[], settingsInput: ExecutionDagSettings): ExecutionDagNode[] {
  const settings = parse(ExecutionDagSettingsSchema, settingsInput);
  check(drafts.length <= MAX_DAG_NODES, "limit_exceeded", `At most ${MAX_DAG_NODES} DAG nodes.`);
  const nodes: ExecutionDagNode[] = [];
  drafts.forEach((draft, index) => {
    check((DAG_NODE_KINDS as readonly string[]).includes(draft.kind), "operation_not_executable", "Unregistered DAG node kind.");
    check(Array.isArray(draft.inputs) && draft.inputs.every(i => Number.isSafeInteger(i) && i >= 0 && i < index), "input_invalid", "DAG inputs must reference earlier nodes.");
    const inputs = draft.inputs.map(i => nodes[i]!), issue = topologyIssue(draft, inputs);
    check(issue === undefined, "input_invalid", issue ?? "");
    const computationId = guard("input_invalid", () => identify("render_node_computation_v0", "computationId",
      { computation: computation(draft, settings, inputs.map(n => n.computationId)) }).computationId);
    const { inputs: _positions, ...content } = draft;
    nodes.push(parse(ExecutionDagNodeSchema, guard("input_invalid", () => identify("execution_dag_node_v0", "nodeId", { ...content, computationId, inputs: inputs.map(n => n.nodeId) }))));
  });
  return nodes;
}

// ---------------------------------------------------------------- the DAG artifact and its render computation identity
const RenderIdentitySchema = z.strictObject({
  identityVersion: z.literal("render_computation_identity_v0"), editGraph: ArtifactRefSchema, admission: ArtifactRefSchema, executionGrant: ArtifactRefSchema,
  sourceReceipts: refSet(16), executor: ExecutionExecutorIdentitySchema, renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema, policy: ArtifactRefSchema,
  settings: ExecutionDagSettingsSchema, root: z.strictObject({ nodeId: IdSchema, computationId: IdSchema }),
  nodes: z.array(z.strictObject({ nodeId: IdSchema, computationId: IdSchema })).min(3).max(MAX_DAG_NODES), renderComputationId: IdSchema,
}).refine(v => checkIdentity(v, "renderComputationId", "render_computation_identity_v0"), "Render computation identity mismatch.");
/**
 * The DAG preserves the admission's dispatch boundary. `claimTarget` is the only thing a later runtime may claim, atomically
 * and durably, before any media process: the reservation attempt, content-identified from exactly the reservation's Gate-3
 * content identity, the operation and the attempt. A storage relabel or byte reformat of one reservation, a replay or a
 * re-grant yields the same claim target, so a unique constraint on `claimTargetId` admits one winner per attempt.
 * `renderBinding` is the value that winner binds to the target; it is never part of target uniqueness. Nothing here is a
 * claim, and no field grants or implies dispatch.
 */
const CLAIM_TARGET = "execution_claim_target_v0";
const ClaimTargetSchema = z.strictObject({ claimTargetId: IdSchema, reservationId: IdSchema, operationId: IdSchema, attempt: PositiveSafeInt });
const DagDispatchSchema = z.strictObject({ ...DispatchSchema.shape, claimTarget: ClaimTargetSchema, renderBinding: z.strictObject({ renderComputationId: IdSchema }) });
const DagBodySchema = z.strictObject({
  ...envelope("ExecutionDag"), scope: ScopeSchema, admission: ArtifactRefSchema, executionGrant: ArtifactRefSchema, editGraph: ArtifactRefSchema,
  graph: z.strictObject({ editGraphId: IdSchema, revision: z.literal(0) }), renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema, policy: ArtifactRefSchema,
  executor: ExecutionExecutorIdentitySchema, settings: ExecutionDagSettingsSchema, nodes: z.array(ExecutionDagNodeSchema).min(3).max(MAX_DAG_NODES), root: IdSchema,
  renderIdentity: RenderIdentitySchema, execution: z.literal("not_started_no_media_process_in_batch1"), dispatch: DagDispatchSchema,
});
type DagBody = z.infer<typeof DagBodySchema>;
/** Structural invariants on every parse; semantic truth is established only by compilation replay in validateExecutionDag. */
function dagIssues(dag: DagBody & { dagId: string }): string[] {
  const issues: string[] = [];
  if (!checkIdentity(dag, "dagId", "execution_dag_v0")) issues.push("Execution DAG identity mismatch.");
  const index = new Map<string, number>();
  for (const [i, node] of dag.nodes.entries()) { if (index.has(node.nodeId)) issues.push("Repeated DAG node identity."); index.set(node.nodeId, i); }
  const drafts: ExecutionDagNodeDraft[] = [];
  for (const [i, node] of dag.nodes.entries()) {
    const positions = node.inputs.map(id => index.get(id));
    if (positions.some(p => p === undefined || p >= i)) return [...issues, "DAG inputs must reference earlier nodes."];
    const { nodeId: _nodeId, computationId: _computationId, inputs: _inputs, ...content } = node;
    drafts.push({ ...content, inputs: positions as number[] } as ExecutionDagNodeDraft);
  }
  try {
    if (!equal(identifyDagNodes(drafts, dag.settings), dag.nodes)) issues.push("DAG node identities contradict their content, inputs or settings.");
  } catch (error) { issues.push(error instanceof Error ? error.message : "Invalid DAG node."); }
  const root = dag.nodes.at(-1);
  if (root?.kind !== "final_encode" || root.nodeId !== dag.root || dag.nodes.filter(n => n.kind === "final_encode").length !== 1) issues.push("The root is the single final encode, listed last.");
  for (const kind of ["cut_sequence", "composition"] as const) if (dag.nodes.filter(n => n.kind === kind).length !== 1) issues.push(`Exactly one ${kind} node.`);
  const reached = new Set<string>(), pending = root ? [root.nodeId] : [];
  while (pending.length) {
    const id = pending.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    pending.push(...(dag.nodes[index.get(id) ?? -1]?.inputs ?? []));
  }
  if (reached.size !== dag.nodes.length) issues.push("Every DAG node must contribute to the root.");
  const identity = dag.renderIdentity;
  if (!equal([identity.editGraph, identity.admission, identity.executionGrant, identity.executor, identity.renderIntent, identity.renderProfile, identity.policy, identity.settings],
    [dag.editGraph, dag.admission, dag.executionGrant, dag.executor, dag.renderIntent, dag.renderProfile, dag.policy, dag.settings])
    || !equal(identity.nodes, dag.nodes.map(n => ({ nodeId: n.nodeId, computationId: n.computationId })))
    || !equal(identity.root, root === undefined ? null : { nodeId: root.nodeId, computationId: root.computationId })) issues.push("The render identity must bind this exact DAG.");
  if (dag.settings.renderIntent !== dag.renderIntent || !equal(dag.settings.executor, dag.executor)) issues.push("Settings contradict the DAG intent or executor.");
  if (!checkIdentity(dag.dispatch.claimTarget, "claimTargetId", CLAIM_TARGET)) issues.push("The claim target identity must derive from exactly its reservation attempt.");
  if (dag.dispatch.renderBinding.renderComputationId !== identity.renderComputationId) issues.push("The render binding must name this exact render computation.");
  return issues;
}
export const ExecutionDagSchema = DagBodySchema.extend({ dagId: IdSchema }).superRefine((dag, ctx) => {
  for (const message of dagIssues(dag)) ctx.addIssue({ code: "custom", message });
});
export type ExecutionDag = z.infer<typeof ExecutionDagSchema>;

type ColorLook = Extract<Operation, { primitive: "color_look" }>;
/** One entry per operation target: a cut on its join, a look on each clip it names or on the whole output. */
const expectedOperations = (graph: EditGraph): string[] => graph.operations.flatMap(o => o.primitive === "cut_transition"
  ? [`cut|${o.operationId}|${o.target.fromClipUseId}|${o.target.toClipUseId}`]
  : o.target.kind === "whole_output" ? [`look|${o.operationId}|whole_output`] : o.target.clipUseIds.map(id => `look|${o.operationId}|${id}`)).sort(compareText);
const representedOperations = (drafts: readonly ExecutionDagNodeDraft[]): string[] => drafts.flatMap(d => {
  if (d.kind === "color_look") return [`look|${d.operationId}|${d.target.kind === "clip_use" ? d.target.clipUseId : "whole_output"}`];
  if (d.kind === "cut_sequence") return d.joins.flatMap(j => j.operation.state === "present" ? [`cut|${j.operation.value}|${j.fromClipUseId}|${j.toClipUseId}`] : []);
  return [];
}).sort(compareText);
function compile(admissionRef: ArtifactRef, admission: ExecutionAdmission, graph: EditGraph, profile: ExecutionRenderProfile,
  frameTables: ReadonlyMap<string, z.infer<typeof FrameTimesSchema>>): ExecutionDag {
  const settings: ExecutionDagSettings = { renderIntent: admission.renderIntent, executor: admission.executor, runtime: admission.runtime.identity,
    environment: admission.environment, ticksPerSecond: graph.output.clock.ticksPerSecond, frameRate: profile.frameRate, resolution: profile.resolution,
    video: profile.video, audio: profile.audio };
  const grid = { ticksPerSecond: settings.ticksPerSecond, ...profile.frameRate };
  const frame = (ticks: number): number => {
    const index = frameIndexAt(ticks, grid);
    check(index !== undefined, "output_frame_alignment_unproven", "Every compiled boundary must lie on the output frame grid.");
    return index;
  };
  const span = (range: { startTicks: number; endTicks: number }) => ({ startTicks: range.startTicks, endTicks: range.endTicks, startFrame: frame(range.startTicks), endFrame: frame(range.endTicks) });
  check(graph.unresolved.length === 0 && graph.obligations.every(o => o.disposition.state !== "unresolved"), "graph_obligation_unresolved", "Unresolved operations never compile.");
  const receipts = new Map(admission.sources.map(s => [s.assetId, s.receipt]));
  const byId = new Map(graph.clipUses.map(use => [use.clipUseId, use]));
  const video = graph.tracks[0]!.clipUseIds.map(id => byId.get(id)).filter((use): use is VideoClipUse => use?.medium === "video");
  const audio = (graph.tracks[1]?.clipUseIds ?? []).map(id => byId.get(id)).filter((use): use is AudioClipUse => use?.medium === "source_audio");
  const position = new Map(video.map((use, i) => [use.clipUseId, i]));
  // The accepted trim authority is copied field for field; nothing is re-derived from the seconds range.
  const source = (use: VideoClipUse | AudioClipUse) => {
    const receipt = receipts.get(use.source.assetId), frameTimes = frameTables.get(use.source.assetId);
    check(receipt !== undefined, "source_receipt_missing", "Every compiled source needs its admitted receipt.");
    check(frameTimes !== undefined, "graph_replay_failed", "Every compiled source needs its admitted analysis timebase.");
    const { assetId, sourceHash, analysis, range, shotId, boundaryId, precision, startAuthority, endAuthority, timebase, support } = use.source;
    return { assetId, contentHash: sourceHash, analysis, receipt, range, trim: { shotId, boundaryId, precision, startAuthority, endAuthority, timebase, support }, frameTimes };
  };
  const drafts: ExecutionDagNodeDraft[] = [];
  const add = (draft: ExecutionDagNodeDraft): number => drafts.push(draft) - 1;
  const clipNodes = video.map((use, i) => {
    check(use.framing.state === "source_aspect_matches_output", "graph_obligation_unresolved", "Unresolved framing never compiles.");
    return add({ kind: "source_video_clip", inputs: [], clipUseId: use.clipUseId, position: i, source: source(use), output: span(use.output), mapping: use.mapping,
      framing: "source_aspect_matches_output" });
  });
  const audioNodes = audio.map(use => add({ kind: "linked_source_audio", inputs: [], clipUseId: use.clipUseId, linkedVideoClipUseId: use.linkedVideoClipUseId,
    position: position.get(use.linkedVideoClipUseId)!, source: source(use), output: { startTicks: use.output.startTicks, endTicks: use.output.endTicks }, mapping: use.mapping,
    gain: use.gain }));
  // Registered primitives only: a cut is sequencing lineage, a clip-scoped look depends on its clip, a whole-output look on the whole sequence.
  // One join carries at most one cut: V0 authorizes no choice between competing cuts, so a second is refused, never dropped.
  const cuts = new Map<string, string>(), clipLooks: { position: number; clipUseId: string; operation: ColorLook }[] = [], wholeLooks: ColorLook[] = [];
  for (const operation of graph.operations) {
    switch (operation.primitive) {
      case "cut_transition":
        check(!cuts.has(operation.target.fromClipUseId), "operation_not_executable", "Competing cut operations on one join are not executable in V0.");
        check(position.get(operation.target.toClipUseId) === (position.get(operation.target.fromClipUseId) ?? -2) + 1, "operation_not_executable",
          "A cut must name one adjacent output join.");
        cuts.set(operation.target.fromClipUseId, operation.operationId);
        break;
      case "color_look":
        if (operation.target.kind === "whole_output") wholeLooks.push(operation);
        else for (const clipUseId of operation.target.clipUseIds) clipLooks.push({ position: position.get(clipUseId)!, clipUseId, operation });
        break;
      default: refuse("operation_not_executable", "Unregistered operation primitive.");
    }
  }
  check(wholeLooks.length <= 1 && (wholeLooks.length === 0 || clipLooks.length === 0), "operation_not_executable", "V0 authorizes no stacking order for looks.");
  const effective = [...clipNodes];
  for (const look of [...clipLooks].sort((a, b) => a.position - b.position)) {
    check(effective[look.position] === clipNodes[look.position], "operation_not_executable", "V0 authorizes no stacking order for looks.");
    effective[look.position] = add({ kind: "color_look", inputs: [clipNodes[look.position]!], operationId: look.operation.operationId,
      target: { kind: "clip_use", clipUseId: look.clipUseId }, parameters: look.operation.parameters, extent: span(video[look.position]!.output) });
  }
  const durationTicks = graph.output.durationTicks, output = { durationTicks, frames: frame(durationTicks) };
  const sequence = add({ kind: "cut_sequence", inputs: effective, clipUseIds: video.map(use => use.clipUseId), output,
    joins: video.slice(0, -1).map((use, i) => ({ fromClipUseId: use.clipUseId, toClipUseId: video[i + 1]!.clipUseId, atTicks: use.output.endTicks,
      atFrame: frame(use.output.endTicks), transition: "cut" as const,
      operation: cuts.has(use.clipUseId) ? present(cuts.get(use.clipUseId)!) : missing("not_applicable", "v0_contiguous_placement_cut") })) });
  const whole = wholeLooks[0];
  const videoOut = whole === undefined ? sequence : add({ kind: "color_look", inputs: [sequence], operationId: whole.operationId, target: { kind: "whole_output" },
    parameters: whole.parameters, extent: span({ startTicks: 0, endTicks: durationTicks }) });
  const composition = add({ kind: "composition", inputs: [videoOut, ...audioNodes], output,
    audio: audio.map(use => ({ clipUseId: use.clipUseId, startTicks: use.output.startTicks, endTicks: use.output.endTicks })) });
  add({ kind: "final_encode", inputs: [composition], output: { resolution: profile.resolution, frameRate: profile.frameRate, frames: output.frames, durationTicks },
    encoding: { video: profile.video, audio: audio.length === 0 ? { state: "no_audio_stream" }
      : { state: "encoded", codecFamily: profile.audio.codecFamily, sampleRateHz: profile.audio.sampleRateHz, channelLayout: profile.audio.channelLayout } } });
  check(equal(representedOperations(drafts), expectedOperations(graph)), "operation_not_executable", "Every Gate-6 operation must be represented exactly in the DAG or refused.");
  const nodes = identifyDagNodes(drafts, settings), root = nodes.at(-1)!;
  const renderIdentity = identify("render_computation_identity_v0", "renderComputationId", { identityVersion: "render_computation_identity_v0",
    editGraph: admission.editGraph, admission: admissionRef, executionGrant: admission.executionGrant,
    sourceReceipts: admission.sources.map(s => s.receipt).sort((a, b) => compareText(a.objectId, b.objectId)), executor: admission.executor,
    renderIntent: admission.renderIntent, renderProfile: admission.renderProfile, policy: admission.policy, settings,
    root: { nodeId: root.nodeId, computationId: root.computationId }, nodes: nodes.map(n => ({ nodeId: n.nodeId, computationId: n.computationId })) });
  return parse(ExecutionDagSchema, identify("execution_dag_v0", "dagId", { ...header("ExecutionDag"), scope: admission.scope, admission: admissionRef,
    executionGrant: admission.executionGrant, editGraph: admission.editGraph, graph: admission.graph, renderIntent: admission.renderIntent,
    renderProfile: admission.renderProfile, policy: admission.policy, executor: admission.executor, settings, nodes, root: root.nodeId, renderIdentity,
    execution: "not_started_no_media_process_in_batch1", dispatch: { ...DISPATCH_NOT_CLAIMED,
      claimTarget: identify(CLAIM_TARGET, "claimTargetId", { reservationId: admission.budget.reservationId, operationId: admission.operationId, attempt: admission.attempt }),
      renderBinding: { renderComputationId: renderIdentity.renderComputationId } } }));
}

const DagRequestSchema = z.strictObject({ admission: ArtifactRefSchema });
export type ExecutionDagRequest = z.input<typeof DagRequestSchema>;
/** Only a replay-valid admission compiles: every authority, recheck, budget and frame rule is re-established first. */
export function buildExecutionDag(requestInput: unknown, artifacts: readonly SuppliedArtifact[]): ExecutionDag {
  const request = parse(DagRequestSchema, requestInput);
  const supplied = new SuppliedArtifacts(artifacts);
  const claimed = parse(ExecutionAdmissionSchema, supplied.exact(request.admission, "ExecutionAdmission", EDIT_EXECUTION_VERSION));
  const admission = validateExecutionAdmission(claimed, artifacts);
  const graph = parse(EditGraphSchema, supplied.exact(admission.editGraph, "EditGraph", "0.1.0"));
  const profile = parse(ExecutionRenderProfileSchema, supplied.exact(admission.renderProfile, "ExecutionRenderProfile", EDIT_EXECUTION_VERSION));
  const frameTables = new Map(admission.sources.map(s => [s.assetId,
    frameTimesOf(parse(FootageAnalysisSchema, supplied.exact(s.analysis, "FootageAnalysis", "1.0.0", "graph_replay_failed"), "graph_replay_failed").metadata.frameTimes)]));
  return compile(request.admission, admission, graph, profile, frameTables);
}
/** Compilation replay from the DAG's own admission; a rehashed DAG cannot change a node, dependency or identity. */
export function validateExecutionDag(input: unknown, artifacts: readonly SuppliedArtifact[]): ExecutionDag {
  const dag = parse(ExecutionDagSchema, input);
  check(equal(buildExecutionDag({ admission: dag.admission }, artifacts), dag), "dag_replay_mismatch", "The DAG contradicts deterministic compilation from its admission.");
  return structuredClone(dag);
}
