/**
 * The review plan: which windows of one exact rendered output are observed, derived only from what was actually executed.
 *
 * The program is recompiled from the replay-validated DAG and must be the program the success receipt names; the technical-QC receipt must
 * pass and be linked to exactly that receipt and those output bytes. Every executed join of the program is classified exactly once, and every
 * join that is a visible cut gets one bounded window around its exact output frame; a join between provably continuous frames of the same
 * content with the same look is accounted for but never reviewed as a cut. A small deterministic global set (opening, a fixed number of
 * interior samples, ending) is added whose size never grows with the output. Output time is the accepted program frame grid, DAG ticks and
 * exact sample indices; nothing here introduces another time representation. Windows are observation requests, never whole-video scans.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { ArtifactRefSchema, checkIdentity, equal, identify, type SuppliedArtifact } from "../editorial/common.js";
import { FrameRateBoundsSchema, HashSchema, Nat, ScopeSchema } from "../edit-graph/common.js";
import { LookSchema } from "../edit-graph/resolution.js";
import { PositiveSafeInt, RenderIntentSchema } from "../edit-execution/common.js";
import type { ExecutionDagNode } from "../edit-execution/index.js";
import { RenderExecutionReceiptSchema, TechnicalMediaQcReceiptSchema, compileRenderProgram, requireProgram, type RenderExecutionReceipt, type RenderProgram,
  type TechnicalMediaQcReceipt } from "../edit-render/index.js";
import { requireValidated, type ValidatedExecutionDag } from "../edit-runtime/validated.js";
import { REVIEW_HARD_LIMITS, check, envelope, guard, header, isSortedUnique, parse, parseCanonical, sortedUnique } from "./common.js";

// ---------------------------------------------------------------- observation requests and media facts (shared with observations)
export const ObservationRequestSchema = z.strictObject({ window: z.strictObject({ startFrame: Nat, endFrame: PositiveSafeInt }),
  frames: z.array(Nat).max(REVIEW_HARD_LIMITS.maxFramesPerObservation), audio: z.enum(["none", "window"]) })
  .refine(r => r.window.endFrame > r.window.startFrame && r.window.endFrame - r.window.startFrame <= REVIEW_HARD_LIMITS.maxObservationWindowFrames,
    "A non-empty window of at most the hard window bound.")
  .refine(r => isSortedUnique(r.frames) && r.frames.every(f => f >= r.window.startFrame && f < r.window.endFrame), "Sorted, unique frames inside the window.");
export type ObservationRequest = z.infer<typeof ObservationRequestSchema>;
/** `unverified` audio: the accepted chain never established this source's audio facts (it is not linked in the program). */
const AudioFactsSchema = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }), z.strictObject({ state: z.literal("unverified") }),
  z.strictObject({ state: z.literal("present"), sampleRateHz: z.union([z.literal(44100), z.literal(48000)]), channels: z.union([z.literal(1), z.literal(2)]) })]);
export const MediaFactsSchema = z.strictObject({ frames: PositiveSafeInt, frameRate: FrameRateBoundsSchema, width: PositiveSafeInt, height: PositiveSafeInt, audio: AudioFactsSchema });
export type MediaFacts = z.infer<typeof MediaFactsSchema>;
/** Samples per frame on this media's exact grids, or null when a frame boundary is not an exact sample. */
export function samplesPerFrame(facts: MediaFacts): number | null {
  if (facts.audio.state !== "present") return null;
  const scaled = BigInt(facts.audio.sampleRateHz) * BigInt(facts.frameRate.denominator), num = BigInt(facts.frameRate.numerator);
  return scaled % num === 0n ? Number(scaled / num) : null;
}
/** The exact raw bytes one decode of `frames` yuv420p frames yields: the full luma plane plus two subsampled chroma planes. */
export const yuv420pFrameBytes = (width: number, height: number) => width * height + 2 * Math.ceil(width / 2) * Math.ceil(height / 2);

// ---------------------------------------------------------------- the owner review policy
const WindowsSchema = z.strictObject({ boundaryHalfWindowFrames: z.number().int().min(1).max(REVIEW_HARD_LIMITS.maxBoundaryHalfWindowFrames),
  globalWindowFrames: z.number().int().min(1).max(REVIEW_HARD_LIMITS.maxGlobalWindowFrames), interiorSamples: z.number().int().min(0).max(REVIEW_HARD_LIMITS.maxInteriorSamples) });
const bounded = (maximum: number, minimum = 1) => z.number().int().min(minimum).max(maximum);
const BudgetSchema = z.strictObject({ maxObservations: bounded(REVIEW_HARD_LIMITS.maxObservations), maxDeliveredFrames: bounded(REVIEW_HARD_LIMITS.maxDeliveredFrames),
  maxDecodedPixelFrames: bounded(REVIEW_HARD_LIMITS.maxDecodedPixelFrames), maxEvidenceBytes: bounded(REVIEW_HARD_LIMITS.maxEvidenceBytes),
  maxFindings: bounded(REVIEW_HARD_LIMITS.maxFindings), maxExplanationCharacters: bounded(REVIEW_HARD_LIMITS.maxExplanationCharacters),
  maxReviewAttempts: bounded(REVIEW_HARD_LIMITS.maxReviewAttempts), maxTranscriptCharacters: bounded(REVIEW_HARD_LIMITS.maxTranscriptCharacters, 0),
  maxDecodeMilliseconds: bounded(REVIEW_HARD_LIMITS.maxDecodeMilliseconds) });
const PolicyFields = { scope: ScopeSchema, author: z.strictObject({ kind: z.literal("owner"), actorId: IdSchema }), windows: WindowsSchema, budget: BudgetSchema };
export const ReviewPolicySchema = z.strictObject({ ...envelope("ReviewPolicy"), ...PolicyFields, policyId: IdSchema })
  .refine(v => checkIdentity(v, "policyId", "review_policy_v0"), "Review policy identity mismatch.");
export type ReviewPolicy = z.infer<typeof ReviewPolicySchema>;
/** The owner's finite review bounds. Attempts are bounded explicitly; nothing here loops, repairs or re-renders. */
export function createReviewPolicy(input: unknown): ReviewPolicy {
  const body = parse(z.strictObject(PolicyFields), input, "review_policy_invalid");
  return parse(ReviewPolicySchema, identify("review_policy_v0", "policyId", { ...header("ReviewPolicy"), ...body }), "review_policy_invalid");
}

// ---------------------------------------------------------------- joins: every executed join exactly once, classified from the program
const JOIN_CLASSIFICATIONS = ["source_change", "same_source_discontinuous", "look_change_only", "continuous_source_join"] as const;
export interface ClassifiedJoin { joinIndex: number; atFrame: number; classification: (typeof JOIN_CLASSIFICATIONS)[number]; review: "reviewed" | "not_reviewed_continuous_source" }
/**
 * Classifies every join of an executed program. A join is a visible cut unless both sides are the same content, the frames are contiguous
 * (the first frame after the join is the source successor of the last frame before it), the looks are equal and the linked audio is
 * contiguous: then the rendered frames and samples simply continue, and reviewing it as a cut would invent a phantom boundary.
 */
export function classifyProgramJoins(programInput: RenderProgram): ClassifiedJoin[] {
  const program = guard("review_plan_invalid", () => requireProgram(programInput));
  return program.joins.map((join, joinIndex) => {
    const a = program.segments[joinIndex]!, b = program.segments[joinIndex + 1]!;
    const sameContent = program.inputs[a.input]!.contentHash === program.inputs[b.input]!.contentHash;
    const contiguousAudio = a.audio.state === "none" ? b.audio.state === "none" : b.audio.state === "linked" && a.audio.endSample === b.audio.startSample;
    const classification = !sameContent ? "source_change" as const : a.video.endFrame !== b.video.startFrame || !contiguousAudio ? "same_source_discontinuous" as const
      : !equal(a.look, b.look) ? "look_change_only" as const : "continuous_source_join" as const;
    return { joinIndex, atFrame: join.atFrame, classification, review: classification === "continuous_source_join" ? "not_reviewed_continuous_source" as const : "reviewed" as const };
  });
}

// ---------------------------------------------------------------- the plan
const SegmentSchema = z.strictObject({ position: Nat, inputSlot: Nat, contentHash: HashSchema, sourceStartFrame: Nat, sourceEndFrame: PositiveSafeInt, outputStartFrame: Nat,
  outputEndFrame: PositiveSafeInt, audio: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }),
    z.strictObject({ state: z.literal("linked"), startSample: Nat, endSample: PositiveSafeInt })]),
  look: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }), z.strictObject({ state: z.literal("clip"), look: LookSchema,
    intensityPerMille: z.number().int().min(0).max(1000) })]) });
export type PlanSegment = z.infer<typeof SegmentSchema>;
const InputSchema = z.strictObject({ inputSlot: Nat, assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, stagedObjectId: IdSchema, facts: MediaFactsSchema });
const JoinSchema = z.strictObject({ joinIndex: Nat, atFrame: PositiveSafeInt, atTicks: PositiveSafeInt, atSample: Nat.nullable(), fromClipUseId: IdSchema, toClipUseId: IdSchema,
  graphOperation: IdSchema.nullable(), classification: z.enum(JOIN_CLASSIFICATIONS), review: z.enum(["reviewed", "not_reviewed_continuous_source"]) });
export const REVIEW_PURPOSES = ["cut_boundary", "global_opening", "global_interior", "global_ending"] as const;
const ItemSchema = z.strictObject({ itemIndex: Nat, purpose: z.enum(REVIEW_PURPOSES), joinIndex: Nat.nullable(), request: ObservationRequestSchema });
export type ReviewItem = z.infer<typeof ItemSchema>;
const PlanBodySchema = z.strictObject({ ...envelope("ReviewPlan"), scope: ScopeSchema, policy: z.strictObject({ policyId: IdSchema }),
  render: z.strictObject({ receiptId: IdSchema, dagId: IdSchema, programId: IdSchema, renderComputationId: IdSchema, editGraph: z.strictObject({ editGraphId: IdSchema,
    revision: z.literal(0) }), editGraphArtifact: ArtifactRefSchema, renderIntent: RenderIntentSchema }),
  output: z.strictObject({ outputArtifactId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, container: z.literal("mp4") }),
  technicalQc: z.strictObject({ qcReceiptId: IdSchema, verdict: z.literal("pass"), qcScope: z.literal("technical_media_qc_only_not_semantic_or_editing_quality") }),
  facts: MediaFactsSchema, inputs: z.array(InputSchema).min(1).max(16), segments: z.array(SegmentSchema).min(1).max(16), joins: z.array(JoinSchema).max(15),
  items: z.array(ItemSchema).max(REVIEW_HARD_LIMITS.maxObservations),
  projection: z.strictObject({ observations: Nat, deliveredFrames: Nat, decodedPixelFrames: Nat, waveformBins: Nat }), semantics: z.literal("review_plan_v0") });
export const ReviewPlanSchema = PlanBodySchema.extend({ planId: IdSchema }).superRefine((plan, ctx) => {
  if (!checkIdentity(plan, "planId", "review_plan_v0")) ctx.addIssue({ code: "custom", message: "Review plan identity mismatch." });
  if (!plan.items.every((item, i) => item.itemIndex === i && item.request.window.endFrame <= plan.facts.frames)) ctx.addIssue({ code: "custom", message: "Items are indexed and inside the output." });
});
export type ReviewPlan = z.infer<typeof ReviewPlanSchema>;
export function requirePlan(value: unknown): ReviewPlan { return parseCanonical(ReviewPlanSchema, value, "review_plan_invalid"); }

export interface ReviewPlanInput { dag: ValidatedExecutionDag; artifacts: readonly SuppliedArtifact[]; receipt: RenderExecutionReceipt;
  qc: TechnicalMediaQcReceipt | undefined; policy: ReviewPolicy }
type CutSequence = Extract<ExecutionDagNode, { kind: "cut_sequence" }>;
/**
 * Derives the review plan of one exact rendered output from what was executed: the replay-validated DAG, its recompiled program (which
 * must be the receipt's), the success receipt and its passing, linked technical QC, under the owner's review policy.
 */
export function planReview(input: ReviewPlanInput): ReviewPlan {
  const v = guard("input_invalid", () => requireValidated(input.dag)), dag = v.dag;
  const policy = parseCanonical(ReviewPolicySchema, input.policy, "review_policy_invalid");
  check(equal(policy.scope, dag.scope), "scope_mismatch", "The review policy belongs to another scope.");
  const receipt = parse(RenderExecutionReceiptSchema, input.receipt, "render_receipt_invalid");
  check(receipt.dag.dagId === dag.dagId && receipt.renderComputationId === dag.renderIdentity.renderComputationId && equal(receipt.scope, dag.scope)
    && receipt.editGraph.editGraphId === dag.graph.editGraphId, "render_receipt_mismatch", "The execution receipt is not of this DAG.");
  const program = guard("input_invalid", () => compileRenderProgram(v, input.artifacts));
  check(program.programId === receipt.program.programId, "program_mismatch", "The receipt names another program than the one this DAG executes.");
  check(input.qc !== undefined && input.qc !== null, "technical_qc_missing", "No technical-QC receipt: nothing is reviewed before technical QC.");
  const qc = parse(TechnicalMediaQcReceiptSchema, input.qc, "technical_qc_missing");
  check(qc.verdict === "pass", "technical_qc_failed", "Technical QC did not pass: a failed render is not reviewed editorially.");
  const out = receipt.output;
  check(qc.execution.receiptId === receipt.receiptId && qc.execution.renderComputationId === receipt.renderComputationId && qc.execution.dagId === receipt.dag.dagId
    && qc.execution.programId === receipt.program.programId && equal(qc.scope, receipt.scope)
    && equal(qc.output, { outputArtifactId: out.outputArtifactId, contentHash: out.contentHash, sizeBytes: out.sizeBytes })
    && equal(qc.observedIdentity, { contentHash: out.contentHash, sizeBytes: out.sizeBytes }), "technical_qc_linkage_mismatch",
  "The technical-QC receipt is not of this receipt and these exact output bytes.");
  const audio = program.output.audio;
  check(qc.expectation.frames === program.output.frames && equal(qc.expectation.resolution, program.output.resolution) && equal(qc.expectation.frameRate, program.output.frameRate)
    && qc.expectation.audio.state === (audio.state === "encoded" ? "encoded" : "none"), "technical_qc_linkage_mismatch", "The QC expectation is not this program's output.");
  const facts: MediaFacts = { frames: program.output.frames, frameRate: program.output.frameRate, width: program.output.resolution.width, height: program.output.resolution.height,
    audio: audio.state === "encoded" ? { state: "present", sampleRateHz: audio.sampleRateHz, channels: audio.channelLayout === "stereo" ? 2 : 1 } : { state: "none" } };
  const inputs = program.inputs.map(i => ({ inputSlot: i.input, assetId: i.assetId, contentHash: i.contentHash, sizeBytes: i.sizeBytes, stagedObjectId: i.stagedObjectId,
    facts: { frames: i.video.frameCount, frameRate: i.video.grid, width: i.video.width, height: i.video.height,
      audio: i.audio.required ? { state: "present" as const, sampleRateHz: i.audio.sampleRateHz, channels: i.audio.channelLayout === "stereo" ? 2 as const : 1 as const }
        : { state: "unverified" as const } } }));
  let at = 0;
  const segments = program.segments.map(s => {
    const outputStartFrame = at; at += s.video.frames;
    return { position: s.position, inputSlot: s.input, contentHash: program.inputs[s.input]!.contentHash, sourceStartFrame: s.video.startFrame, sourceEndFrame: s.video.endFrame,
      outputStartFrame, outputEndFrame: at, audio: s.audio, look: s.look };
  });
  const sequence = dag.nodes.find((n): n is CutSequence => n.kind === "cut_sequence");
  const classified = classifyProgramJoins(program);
  check(sequence !== undefined && sequence.joins.length === classified.length && sequence.joins.every((j, i) => j.atFrame === classified[i]!.atFrame), "review_plan_invalid",
    "The DAG joins are not the program joins.");
  const spf = samplesPerFrame(facts);
  const joins = classified.map((c, i) => {
    const j = sequence.joins[i]!;
    return { joinIndex: c.joinIndex, atFrame: c.atFrame, atTicks: j.atTicks, atSample: spf === null ? null : c.atFrame * spf, fromClipUseId: j.fromClipUseId,
      toClipUseId: j.toClipUseId, graphOperation: j.operation.state === "present" ? j.operation.value : null, classification: c.classification, review: c.review };
  });
  const n = facts.frames, { boundaryHalfWindowFrames: h, globalWindowFrames: g, interiorSamples: k } = policy.windows, g1 = Math.min(n, g);
  const audioOf = (): "none" | "window" => spf === null ? "none" : "window";
  const drafts: Omit<ReviewItem, "itemIndex">[] = [];
  for (const join of joins) {
    if (join.review !== "reviewed") continue;
    const c = join.atFrame, start = Math.max(0, c - h), end = Math.min(n, c + h);
    drafts.push({ purpose: "cut_boundary", joinIndex: join.joinIndex, request: { window: { startFrame: start, endFrame: end }, frames: sortedUnique([start, c - 1, c, end - 1]), audio: audioOf() } });
  }
  drafts.push({ purpose: "global_opening", joinIndex: null, request: { window: { startFrame: 0, endFrame: g1 }, frames: sortedUnique([0, Math.floor((g1 - 1) / 2), g1 - 1]), audio: audioOf() } });
  const interior = sortedUnique(Array.from({ length: k }, (_, j) => Math.floor(((j + 1) * n) / (k + 1))));
  for (const p of interior) {
    const start = Math.min(Math.max(p - Math.floor(g / 2), 0), n - g1);
    drafts.push({ purpose: "global_interior", joinIndex: null, request: { window: { startFrame: start, endFrame: start + g1 }, frames: [p], audio: audioOf() } });
  }
  drafts.push({ purpose: "global_ending", joinIndex: null, request: { window: { startFrame: n - g1, endFrame: n }, frames: sortedUnique([n - g1, n - g1 + Math.floor((g1 - 1) / 2), n - 1]),
    audio: audioOf() } });
  const items = drafts.map((d, itemIndex) => ({ itemIndex, ...d, request: parse(ObservationRequestSchema, d.request, "review_plan_invalid") }));
  const frameBytes = yuv420pFrameBytes(facts.width, facts.height), pixels = facts.width * facts.height;
  for (const item of items) {
    const frames = item.request.window.endFrame - item.request.window.startFrame;
    check(frames * frameBytes <= REVIEW_HARD_LIMITS.maxDecodeOutputBytes, "review_budget_exceeded", "A planned window exceeds the decoded-output bound.");
  }
  const projection = { observations: items.length, deliveredFrames: items.reduce((s, i) => s + i.request.frames.length, 0),
    decodedPixelFrames: items.reduce((s, i) => s + i.request.window.endFrame * pixels, 0),
    waveformBins: items.reduce((s, i) => s + (i.request.audio === "window" ? i.request.window.endFrame - i.request.window.startFrame : 0), 0) };
  const b = policy.budget;
  check(projection.observations <= b.maxObservations && projection.deliveredFrames <= b.maxDeliveredFrames && projection.decodedPixelFrames <= b.maxDecodedPixelFrames,
    "review_budget_exceeded", "The planned review exceeds the owner's review budget.");
  const body = { ...header("ReviewPlan"), scope: dag.scope, policy: { policyId: policy.policyId },
    render: { receiptId: receipt.receiptId, dagId: dag.dagId, programId: program.programId, renderComputationId: receipt.renderComputationId,
      editGraph: { editGraphId: dag.graph.editGraphId, revision: 0 as const }, editGraphArtifact: dag.editGraph, renderIntent: receipt.renderIntent },
    output: { outputArtifactId: out.outputArtifactId, contentHash: out.contentHash, sizeBytes: out.sizeBytes, container: "mp4" as const },
    technicalQc: { qcReceiptId: qc.qcReceiptId, verdict: "pass" as const, qcScope: qc.qcScope }, facts, inputs, segments, joins, items, projection,
    semantics: "review_plan_v0" as const };
  return parse(ReviewPlanSchema, identify("review_plan_v0", "planId", body), "review_plan_invalid");
}
