/**
 * The typed RenderProgram: the exact V0 execution semantics of one replay-validated ExecutionDag, as finite, bounded, prose-free
 * data. It is compiled deterministically from the validated DAG and the admitted analysis frame tables, never from an EditGraph,
 * Director text, metadata or a caller string, and a separate trusted compiler turns it into FFmpeg arguments. Each segment carries
 * its own computation identity (source bytes, exact frame and sample intervals, look, output settings, semantics, executor, runtime
 * and environment) so that a future segment-level dependency analysis can reuse unaffected work; the whole program has its own identity.
 * Anything the V0 semantics cannot execute exactly is refused, never approximated or ignored.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, compareText, equal, identify, type SuppliedArtifact } from "../editorial/common.js";
import { FrameRateBoundsSchema, HashSchema, Nat, ResolutionBoundsSchema } from "../edit-graph/common.js";
import { LookSchema } from "../edit-graph/resolution.js";
import type { ExecutionAdmission, ExecutionDag, ExecutionDagNode } from "../edit-execution/index.js";
import { ExecutionExecutorIdentitySchema, PositiveSafeInt, RenderIntentSchema } from "../edit-execution/common.js";
import { VideoEncodingSchema } from "../edit-execution/policy.js";
import { RuntimeIdentitySchema } from "../edit-execution/runtime.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { RuntimeArtifacts } from "../edit-runtime/common.js";
import { stagedObjectIdOf } from "../edit-runtime/records.js";
import { requireValidated, type ValidatedExecutionDag } from "../edit-runtime/validated.js";
import { MAX_RENDER_SOURCES, check, envelope, guard, header, parse, refuse } from "./common.js";
import { frameTableIdOf } from "./probe.js";
import { RENDER_SEMANTICS, RENDER_SEMANTICS_DIGEST, requireLook } from "./semantics.js";

const KNOWN_KINDS: readonly string[] = ["source_video_clip", "linked_source_audio", "color_look", "cut_sequence", "composition", "final_encode"];
const LookStateSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }),
  z.strictObject({ state: z.literal("clip"), look: LookSchema, intensityPerMille: z.number().int().min(0).max(1000) })]);
const SegmentVideoSchema = z.strictObject({ precision: z.enum(["frame_pts_exact", "source_seconds"]),
  selection: z.enum(["authoritative_frame_interval_v0", "pts_membership_half_open_v0"]), startFrame: Nat, endFrame: PositiveSafeInt, frames: PositiveSafeInt })
  .refine(v => v.endFrame - v.startFrame === v.frames && (v.precision === "frame_pts_exact") === (v.selection === "authoritative_frame_interval_v0"),
    "A segment selects exactly its frames, by the rule its precision allows.");
const SegmentAudioSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }),
  z.strictObject({ state: z.literal("linked"), startSample: Nat, endSample: PositiveSafeInt }).refine(v => v.endSample > v.startSample, "Linked audio is non-empty.")]);
const SegmentSchema = z.strictObject({ position: Nat, input: Nat, clipUseId: IdSchema, clipComputationId: IdSchema, video: SegmentVideoSchema, audio: SegmentAudioSchema,
  look: LookStateSchema, segmentComputationId: IdSchema });
const InputSchema = z.strictObject({ input: Nat, assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, stagedObjectId: IdSchema,
  video: z.strictObject({ frameCount: PositiveSafeInt, tableId: IdSchema, width: PositiveSafeInt, height: PositiveSafeInt, grid: FrameRateBoundsSchema }),
  audio: z.discriminatedUnion("required", [z.strictObject({ required: z.literal(false) }),
    z.strictObject({ required: z.literal(true), sampleRateHz: z.union([z.literal(44100), z.literal(48000)]), channelLayout: z.enum(["mono", "stereo"]), requiredSamples: PositiveSafeInt })]) });
const OutputAudioSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }),
  z.strictObject({ state: z.literal("encoded"), codecFamily: z.literal("aac"), sampleRateHz: z.union([z.literal(44100), z.literal(48000)]), channelLayout: z.enum(["mono", "stereo"]) })]);
const ProgramBodySchema = z.strictObject({
  ...envelope("RenderProgram"),
  semantics: z.strictObject({ version: z.literal(RENDER_SEMANTICS.semanticsVersion), digest: HashSchema }),
  executor: ExecutionExecutorIdentitySchema, runtime: RuntimeIdentitySchema, environment: IdSchema,
  binding: z.strictObject({ dagId: IdSchema, renderComputationId: IdSchema, editGraphId: IdSchema, revision: z.literal(0), renderIntent: RenderIntentSchema }),
  output: z.strictObject({ resolution: ResolutionBoundsSchema, frameRate: FrameRateBoundsSchema, ticksPerSecond: PositiveSafeInt, frames: PositiveSafeInt, durationTicks: PositiveSafeInt,
    video: VideoEncodingSchema, audio: OutputAudioSchema, container: z.literal("mp4") }),
  inputs: z.array(InputSchema).min(1).max(MAX_RENDER_SOURCES),
  segments: z.array(SegmentSchema).min(1).max(RENDER_SEMANTICS.bounds.maxClips),
  joins: z.array(z.strictObject({ atFrame: PositiveSafeInt, transition: z.literal("cut") })).max(RENDER_SEMANTICS.bounds.maxClips - 1),
  wholeOutputLook: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }),
    z.strictObject({ state: z.literal("applied"), look: LookSchema, intensityPerMille: z.number().int().min(0).max(1000) })]),
});
type ProgramBody = z.infer<typeof ProgramBodySchema>;
function programIssues(p: ProgramBody): string[] {
  const issues: string[] = [];
  if (p.semantics.digest !== RENDER_SEMANTICS_DIGEST) issues.push("The program names other executor semantics.");
  if (!p.inputs.every((input, i) => input.input === i && (i === 0 || compareText(p.inputs[i - 1]!.assetId, input.assetId) < 0))) issues.push("Inputs are unique slots in canonical asset order.");
  if (!p.inputs.every(input => input.stagedObjectId === stagedObjectIdOf({ contentHash: input.contentHash, sizeBytes: input.sizeBytes }))) issues.push("A staged object identity is not the input's byte identity.");
  if (!p.segments.every((s, i) => s.position === i && s.input < p.inputs.length)) issues.push("Segments are in timeline order and name listed inputs.");
  if (p.segments.reduce((n, s) => n + s.video.frames, 0) !== p.output.frames) issues.push("The segments must cover exactly the output frames.");
  let at = 0;
  if (!p.joins.every((j, i) => { at += p.segments[i]!.video.frames; return j.atFrame === at; }) || p.joins.length !== p.segments.length - 1) issues.push("Joins lie exactly between segments.");
  const linked = p.segments.filter(s => s.audio.state === "linked").length;
  if (!(linked === 0 ? p.output.audio.state === "none" : linked === p.segments.length && p.output.audio.state === "encoded")) issues.push("Audio is linked on every segment or none.");
  if (p.wholeOutputLook.state === "applied" && p.segments.some(s => s.look.state !== "none")) issues.push("V0 authorizes no stacking order for looks.");
  return issues;
}
export const RenderProgramSchema = ProgramBodySchema.extend({ programId: IdSchema }).superRefine((program, ctx) => {
  if (!checkIdentity(program, "programId", "render_program_v0")) ctx.addIssue({ code: "custom", message: "Render program identity mismatch." });
  for (const message of programIssues(program)) ctx.addIssue({ code: "custom", message });
});
export type RenderProgram = z.infer<typeof RenderProgramSchema>;

// ---------------------------------------------------------------- deterministic compilation
export interface SourceFacts { frameTimes: readonly number[]; width: number; height: number }
type Node<K extends ExecutionDagNode["kind"]> = Extract<ExecutionDagNode, { kind: K }>;
function single<K extends ExecutionDagNode["kind"]>(nodes: readonly ExecutionDagNode[], kind: K): Node<K> {
  const found = nodes.filter((n): n is Node<K> => n.kind === kind);
  check(found.length === 1, "render_program_invalid", `Exactly one ${kind} node.`);
  return found[0]!;
}
/**
 * Compiles from DAG data. Every vocabulary item is rechecked here even though accepted replay already bounds it: an unknown node
 * kind, codec, look or transition refuses, and so does any source timing V0 cannot execute exactly.
 */
export function compileRenderProgramFromDag(input: { dag: ExecutionDag; admission: ExecutionAdmission; sources: ReadonlyMap<string, SourceFacts> }): RenderProgram {
  const { dag, admission } = input, s = dag.settings;
  for (const node of dag.nodes) check(KNOWN_KINDS.includes((node as { kind: string }).kind), "render_program_unsupported", "An unregistered DAG node kind is never executed.");
  check(s.video.codecFamily === "h264" && s.video.pixelFormat === "yuv420p" && s.video.encodingProfile === "deterministic_constant_quality_v0", "render_program_unsupported",
    "Only the registered V0 video encoding is executable.");
  check(s.audio.policy === "graph_linked_source_audio_v0" && s.audio.codecFamily === "aac" && (s.audio.sampleRateHz === 44100 || s.audio.sampleRateHz === 48000)
    && (s.audio.channelLayout === "mono" || s.audio.channelLayout === "stereo"), "render_program_unsupported", "Only the registered V0 audio encoding is executable.");
  const { numerator: num, denominator: den } = s.frameRate, sequence = single(dag.nodes, "cut_sequence"), encode = single(dag.nodes, "final_encode");
  single(dag.nodes, "composition");
  for (const join of sequence.joins) check((join.transition as string) === "cut", "render_program_unsupported", "Only hard cuts are executable in V0.");
  const looks = dag.nodes.filter((n): n is Node<"color_look"> => n.kind === "color_look");
  for (const look of looks) requireLook(look.parameters.look, look.parameters.intensityPerMille);
  const clips = new Map(dag.nodes.filter((n): n is Node<"source_video_clip"> => n.kind === "source_video_clip").map(n => [n.clipUseId, n]));
  const audioByVideo = new Map(dag.nodes.filter((n): n is Node<"linked_source_audio"> => n.kind === "linked_source_audio").map(n => [n.linkedVideoClipUseId, n]));
  const sr = s.audio.sampleRateHz;
  const drafts = sequence.clipUseIds.map((clipUseId, position) => {
    const node = clips.get(clipUseId);
    check(node !== undefined, "render_program_invalid", "Every sequenced clip use has its source node.");
    check(node.mapping.kind === "constant_speed_identity" && node.mapping.rate.numerator === 1 && node.mapping.rate.denominator === 1, "render_program_unsupported",
      "Only constant-speed identity mapping is executable in V0.");
    const facts = input.sources.get(node.source.assetId);
    check(facts !== undefined && facts.frameTimes.length === node.source.frameTimes.count && frameTableIdOf(facts.frameTimes) === node.source.frameTimes.tableId,
      "source_timebase_mismatch", "The admitted frame table is not the one the DAG binds.");
    // V0 executes only sources whose every decoded frame lies exactly on the output grid from zero: never retimed, dropped or repeated.
    check(facts.frameTimes.every((t, i) => t === (i * den) / num), "source_frame_grid_unsupported",
      "Variable or other-rate source timing is refused: V0 executes only constant-rate sources exactly on the output frame grid.");
    // V0 only scales. The admitted pixel geometry (which conformance proves square-pixel and unrotated on the staged bytes) must
    // already have the output's display aspect, whatever aspect the analysis declares; anything else would be stretched.
    check(facts.width * encode.output.resolution.height === facts.height * encode.output.resolution.width, "source_geometry_unsupported",
      "A source whose pixel geometry lacks the output display aspect is refused, never stretched.");
    const { trim, range } = node.source, outFrames = node.output.endFrame - node.output.startFrame;
    let startFrame: number, endFrame: number;
    const precision = trim.precision;
    if (precision === "frame_pts_exact") {
      check(trim.startAuthority.kind === "frame_pts" && trim.endAuthority.kind === "frame_pts", "source_trim_invalid", "Frame-exact precision needs frame endpoints.");
      startFrame = trim.startAuthority.frameIndex; endFrame = trim.endAuthority.frameIndex;
      check(facts.frameTimes[startFrame] === range.startSeconds && facts.frameTimes[endFrame] === range.endSeconds, "source_trim_invalid",
        "The authoritative frame endpoints do not denote the admitted range.");
    } else {
      // The weaker precision stays weaker: exactly the admitted frames whose PTS lies in [start, end), never promoted to frame authority.
      const first = (seconds: number) => { const i = facts.frameTimes.findIndex(t => t >= seconds); return i < 0 ? facts.frameTimes.length : i; };
      startFrame = first(range.startSeconds); endFrame = first(range.endSeconds);
    }
    check(startFrame >= 0 && endFrame > startFrame && endFrame - startFrame === outFrames, "source_trim_invalid",
      "The selected source frames must be exactly the clip's output frames: nothing is dropped, repeated or retimed.");
    const video = { precision, selection: precision === "frame_pts_exact" ? "authoritative_frame_interval_v0" as const : "pts_membership_half_open_v0" as const,
      startFrame, endFrame, frames: outFrames };
    const linked = audioByVideo.get(clipUseId);
    let audio: z.infer<typeof SegmentAudioSchema> = { state: "none" };
    if (linked !== undefined) {
      check(equal(linked.source, node.source) && equal(linked.mapping, node.mapping) && linked.output.startTicks === node.output.startTicks
        && linked.output.endTicks === node.output.endTicks, "render_program_invalid", "Linked audio must share its video clip's exact trim and placement.");
      const a = BigInt(startFrame) * BigInt(den) * BigInt(sr), b = BigInt(endFrame) * BigInt(den) * BigInt(sr);
      check(a % BigInt(num) === 0n && b % BigInt(num) === 0n, "audio_sample_boundary_not_exact", "The selected frames do not start and end on exact audio samples.");
      audio = { state: "linked", startSample: Number(a / BigInt(num)), endSample: Number(b / BigInt(num)) };
    }
    const clipLook = looks.find(l => l.target.kind === "clip_use" && l.target.clipUseId === clipUseId);
    const look: z.infer<typeof LookStateSchema> = clipLook === undefined ? { state: "none" }
      : { state: "clip", look: clipLook.parameters.look, intensityPerMille: clipLook.parameters.intensityPerMille };
    return { position, node, video, audio, look };
  });
  const linkedCount = drafts.filter(d => d.audio.state === "linked").length;
  check(linkedCount === 0 || linkedCount === drafts.length, "audio_coverage_unsupported",
    "V0 never synthesizes silence: linked source audio must cover every clip or none.");
  const encoded = encode.encoding.audio;
  check(linkedCount === 0 ? encoded.state === "no_audio_stream" : encoded.state === "encoded" && encoded.sampleRateHz === sr && encoded.channelLayout === s.audio.channelLayout,
    "render_program_invalid", "The final encode's audio contradicts the linked audio.");
  const whole = looks.find(l => l.target.kind === "whole_output");
  const out = encode.output;
  check(equal(out.frameRate, s.frameRate) && out.resolution.width % 2 === 0 && out.resolution.height % 2 === 0 && out.resolution.width <= RENDER_SEMANTICS.bounds.maxWidth
    && out.resolution.height <= RENDER_SEMANTICS.bounds.maxHeight && out.durationTicks <= RENDER_SEMANTICS.bounds.maxDurationSeconds * s.ticksPerSecond, "render_program_unsupported",
  "The output is outside the V0 executor bounds.");
  const admitted = new Map(admission.sources.map(source => [source.assetId, source]));
  const assets = [...new Set(drafts.map(d => d.node.source.assetId))].sort(compareText);
  check(assets.length <= MAX_RENDER_SOURCES && assets.every(id => admitted.has(id)), "render_program_invalid", "Every input is an admitted source.");
  const inputs = assets.map((assetId, slot) => {
    const source = admitted.get(assetId)!, facts = input.sources.get(assetId)!, uses = drafts.filter(d => d.node.source.assetId === assetId);
    check(uses.every(d => d.node.source.contentHash === source.contentHash), "render_program_invalid", "Every use of an input names its admitted bytes.");
    const first = uses[0]!.node;
    const required = uses.filter(d => d.audio.state === "linked").map(d => (d.audio as { endSample: number }).endSample);
    return { input: slot, assetId, contentHash: source.contentHash, sizeBytes: source.sizeBytes, stagedObjectId: stagedObjectIdOf({ contentHash: source.contentHash, sizeBytes: source.sizeBytes }),
      video: { frameCount: first.source.frameTimes.count, tableId: first.source.frameTimes.tableId, width: facts.width, height: facts.height, grid: { numerator: num, denominator: den } },
      audio: required.length === 0 ? { required: false as const }
        : { required: true as const, sampleRateHz: sr, channelLayout: s.audio.channelLayout, requiredSamples: Math.max(...required) } };
  });
  const segments = drafts.map(d => {
    const inputSlot = assets.indexOf(d.node.source.assetId);
    const computation = { semantics: RENDER_SEMANTICS_DIGEST, executor: dag.executor, runtime: s.runtime, environment: s.environment, renderIntent: dag.renderIntent,
      source: { contentHash: d.node.source.contentHash, tableId: d.node.source.frameTimes.tableId }, video: d.video, audio: d.audio, look: d.look,
      output: { resolution: out.resolution, frameRate: out.frameRate, pixelFormat: s.video.pixelFormat } };
    return { position: d.position, input: inputSlot, clipUseId: d.node.clipUseId, clipComputationId: d.node.computationId, video: d.video, audio: d.audio, look: d.look,
      segmentComputationId: identify("render_segment_computation_v0", "segmentComputationId", { computation }).segmentComputationId };
  });
  const body = { ...header("RenderProgram"), semantics: { version: RENDER_SEMANTICS.semanticsVersion, digest: RENDER_SEMANTICS_DIGEST }, executor: dag.executor, runtime: s.runtime,
    environment: s.environment, binding: { dagId: dag.dagId, renderComputationId: dag.renderIdentity.renderComputationId, editGraphId: dag.graph.editGraphId, revision: 0 as const,
      renderIntent: dag.renderIntent },
    output: { resolution: out.resolution, frameRate: out.frameRate, ticksPerSecond: s.ticksPerSecond, frames: out.frames, durationTicks: out.durationTicks, video: s.video,
      audio: linkedCount === 0 ? { state: "none" as const } : { state: "encoded" as const, codecFamily: "aac" as const, sampleRateHz: sr, channelLayout: s.audio.channelLayout },
      container: "mp4" as const },
    inputs, segments, joins: sequence.joins.map(j => ({ atFrame: j.atFrame, transition: "cut" as const })),
    wholeOutputLook: whole === undefined ? { state: "none" as const } : { state: "applied" as const, look: whole.parameters.look, intensityPerMille: whole.parameters.intensityPerMille } };
  return parse(RenderProgramSchema, identify("render_program_v0", "programId", body), "render_program_invalid");
}
/** Compiles from a DAG replay-validated in this process, reading only the exact admitted FootageAnalysis frame tables and geometry. */
export function compileRenderProgram(validated: ValidatedExecutionDag, artifacts: readonly SuppliedArtifact[]): RenderProgram {
  const v = requireValidated(validated), supplied = new RuntimeArtifacts(artifacts);
  const sources = new Map(v.admission.sources.map(source => {
    const analysis = guard("execution_dag_invalid", () => FootageAnalysisSchema.parse(supplied.exact(source.analysis, "FootageAnalysis", "1.0.0", "execution_dag_invalid")));
    check(analysis.assetId === source.assetId && analysis.contentHash === source.contentHash, "execution_dag_invalid", "The admitted analysis names another source.");
    return [source.assetId, { frameTimes: analysis.metadata.frameTimes, width: analysis.metadata.width, height: analysis.metadata.height }] as const;
  }));
  return compileRenderProgramFromDag({ dag: v.dag, admission: v.admission, sources });
}
/** A supplied program is accepted only in canonical form with a valid identity. */
export function requireProgram(value: unknown): RenderProgram {
  const program = parse(RenderProgramSchema, value, "render_program_invalid");
  if (!equal(program, value)) refuse("render_program_invalid", "The program is not in canonical form.");
  return program;
}
