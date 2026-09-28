/**
 * The semantic-critic foundation: an editorial review of one exact rendered output, kept structurally apart from technical QC.
 *
 * Technical QC answers whether the media executed correctly; it must already have passed for exactly this receipt and these bytes, and the
 * critic never re-runs, relabels or bypasses it. The critic answers whether the edit appears editorially problematic, only from bounded
 * evidence of this review: observations of the planned windows (and bounded drill-downs), and optional transcript packs.
 *
 * Findings follow the frozen Architecture-v1 CriticReport sketch: its dimension vocabulary and severities, non-empty evidence, output-clock
 * regions, and uncertainty with the accepted Director semantics (`unknown` or `qualitative`, never a number). Deterministic checks report
 * measured mechanical signals only (near-black frames, a settled audio level step across a cut), always as `info`, never as an editorial
 * verdict. Model-assessed findings come only through the provider-neutral port: it receives a deep-frozen copy of bounded evidence (no
 * capability, path, process or unbounded transcript), and its response is validated strictly; it can never claim a measurement. A finding
 * is data for later repair: nothing here mutates the EditGraph, repairs, renders, decodes or touches a file. No finding is not a pass.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, checkIdentity, equal, identify, type ArtifactRef, type SuppliedArtifact } from "../editorial/common.js";
import { DirectorUncertaintySchema } from "../director/common.js";
import { Nat, ScopeSchema, supplied } from "../edit-graph/common.js";
import { LocationFreeVersionSchema, PositiveSafeInt } from "../edit-execution/common.js";
import { REVIEW_HARD_LIMITS, REVIEW_IMPLEMENTATION, byteLengthOf, check, envelope, frozenCopy, guard, header, parse, refuse, ticksAfterFrame, ticksBeforeFrame } from "./common.js";
import { requireObservation, type EditorialObservation } from "./observation.js";
import { REVIEW_PURPOSES, planReview, type ReviewPlan, type ReviewPlanInput } from "./review.js";
import { phraseLines, requireTranscriptEvidence, validateTranscriptPack, type TranscriptEvidence, type TranscriptPack } from "./transcript.js";

/** The frozen Architecture-v1 CriticReport dimension vocabulary, in its order. */
export const CRITIC_DIMENSIONS = ["story", "material_selection", "coherence", "emotion", "reaction_timing", "pacing", "rhythm", "music_sync", "trim_timing", "continuity",
  "motion_continuity", "eye_trace", "subject_coverage", "visual_variety", "technical_quality", "reference_fidelity", "style", "sound", "graphics", "user_client_requirements",
  "over_editing", "under_editing"] as const;
export type CriticDimension = (typeof CRITIC_DIMENSIONS)[number];
export const CRITIC_SEVERITIES = ["info", "minor", "major", "blocking"] as const;
/** The only mechanically justified Batch-3A checks, each a fixed measurement rule. They are signals, never editorial judgments. */
export const DETERMINISTIC_CHECKS = {
  near_black_frames: { checkId: "near_black_frames", dimension: "technical_quality",
    rule: "luma_at_most_32_on_at_least_900_per_mille_of_pixels_runs_of_observed_output_frames_v0" },
  audio_level_step_at_cut: { checkId: "audio_level_step_at_cut", dimension: "sound",
    rule: "settled_rms_q15_bins_cut_minus3_minus2_vs_cut_plus1_plus2_step_at_least_10x_louder_at_least_1036_v0" },
} as const;
type CheckId = keyof typeof DETERMINISTIC_CHECKS;
const CHECK_IDS = Object.keys(DETERMINISTIC_CHECKS) as CheckId[];
const NEAR_BLACK_PER_MILLE = 900, AUDIBLE_RMS_Q15 = 1036, STEP_RATIO = 10;
/** A fresh copy each time: the fixed uncertainty of every measured signal (uncalibrated, and not an editorial judgment). */
const deterministicUncertainty = () => ({ state: "unknown" as const, reasonCode: "uncalibrated_mechanical_signal_not_an_editorial_judgment", evidenceRefs: [] });
const NO_REPAIR = { state: "not_computed", reasonCode: "repair_planning_not_in_gate7_batch3a" } as const;

const RangeSchema = z.strictObject({ startFrame: Nat, endFrame: PositiveSafeInt }).refine(r => r.endFrame > r.startFrame, "A non-empty output range.");
const ProducerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("deterministic_check"), checkId: z.enum(CHECK_IDS as [CheckId, ...CheckId[]]),
    rule: z.enum([DETERMINISTIC_CHECKS.near_black_frames.rule, DETERMINISTIC_CHECKS.audio_level_step_at_cut.rule]) }),
  z.strictObject({ kind: z.literal("semantic_critic"), criticId: IdSchema, version: LocationFreeVersionSchema, basis: z.enum(["synthetic_fixture", "model_adapter"]) }),
]);
const MeasurementSchema = z.strictObject({ quantity: z.enum(["observed_near_black_frames", "settled_rms_q15_before_after"]), values: z.array(z.number().int().safe()).min(1).max(4),
  unit: z.enum(["frames", "rms_q15"]) });
/** Free text never carries a location, URL or control character into a record (self-review D6). */
const locationFree = (text: string) => !/[\\]|\/\/|[A-Za-z]:\/|[\u0000-\u001f\u007f]/.test(text);
const ExplanationSchema = z.string().min(1).max(REVIEW_HARD_LIMITS.maxExplanationCharacters).refine(locationFree, "Explanations carry no location, URL or control character.");
/** The exact rendered output a finding is about, and the review implementation that produced or validated it (self-review D3). */
const FindingOutputSchema = z.strictObject({ outputArtifactId: IdSchema, contentHash: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: PositiveSafeInt });
const ReviewerSchema = z.strictObject({ implementationId: z.literal(REVIEW_IMPLEMENTATION.implementationId), version: z.literal(REVIEW_IMPLEMENTATION.version) });
const FindingBodySchema = z.strictObject({ output: FindingOutputSchema, reviewer: ReviewerSchema, dimension: z.enum(CRITIC_DIMENSIONS), severity: z.enum(CRITIC_SEVERITIES),
  basis: z.enum(["measured", "model_assessed"]), producer: ProducerSchema, affectedOutput: RangeSchema, joinIndex: Nat.nullable(), evidenceRefs: z.array(EvidenceRefSchema).min(1).max(8),
  measurement: MeasurementSchema.nullable(), explanation: ExplanationSchema, uncertainty: DirectorUncertaintySchema,
  repair: z.strictObject({ state: z.literal(NO_REPAIR.state), reasonCode: z.literal(NO_REPAIR.reasonCode) }) });
type FindingBody = z.infer<typeof FindingBodySchema>;
/** A measured finding comes only from a registered check, with its rule, dimension, measurement and fixed uncertainty; nothing else is measured. */
function findingIssues(f: FindingBody): string[] {
  const issues: string[] = [], measured = f.basis === "measured";
  if (measured !== (f.producer.kind === "deterministic_check") || measured !== (f.measurement !== null)) issues.push("Only a deterministic check measures, and it always does.");
  if (f.producer.kind === "deterministic_check") {
    const registered = DETERMINISTIC_CHECKS[f.producer.checkId];
    if (f.producer.rule !== registered.rule || f.dimension !== registered.dimension || f.severity !== "info" || !equal(f.uncertainty, deterministicUncertainty())) {
      issues.push("A measured finding carries exactly its check's rule, dimension, info severity and uncalibrated uncertainty.");
    }
  }
  return issues;
}
export const CriticFindingSchema = FindingBodySchema.extend({ findingId: IdSchema }).superRefine((f, ctx) => {
  for (const message of findingIssues(f)) ctx.addIssue({ code: "custom", message });
  if (!checkIdentity(f, "findingId", "critic_finding_v0")) ctx.addIssue({ code: "custom", message: "Critic finding identity mismatch." });
});
export type CriticFinding = z.infer<typeof CriticFindingSchema>;
type FindingOutput = z.infer<typeof FindingOutputSchema>;
/** Every finding names the exact output it is about and the review implementation that produced or validated it. */
const finding = (output: FindingOutput, body: Omit<FindingBody, "output" | "reviewer">): CriticFinding =>
  parse(CriticFindingSchema, identify("critic_finding_v0", "findingId", { output, reviewer: REVIEW_IMPLEMENTATION, ...body }), "critic_input_invalid");
const outputOf = (plan: ReviewPlan): FindingOutput => ({ outputArtifactId: plan.output.outputArtifactId, contentHash: plan.output.contentHash, sizeBytes: plan.output.sizeBytes });

const BASES = ["pinned_ffmpeg_decode_of_verified_held_object_v0", "synthetic_test_bytes_not_media_decode_v0"] as const;
const ReportBodySchema = z.strictObject({ ...envelope("CriticReport"), scope: ScopeSchema, plan: z.strictObject({ planId: IdSchema, policyId: IdSchema }),
  editGraph: z.strictObject({ editGraphId: IdSchema, revision: z.literal(0), artifact: ArtifactRefSchema }),
  render: z.strictObject({ receiptId: IdSchema, dagId: IdSchema, programId: IdSchema, renderComputationId: IdSchema, outputArtifactId: IdSchema, contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: PositiveSafeInt }),
  technicalQc: z.strictObject({ qcReceiptId: IdSchema, verdict: z.literal("pass"), qcScope: z.literal("technical_media_qc_only_not_semantic_or_editing_quality") }),
  separation: z.literal("technical_qc_is_objective_media_correctness_critic_is_editorial_evidence_v0"),
  attempt: z.strictObject({ attempt: PositiveSafeInt, maxAttempts: PositiveSafeInt }),
  observations: z.array(z.strictObject({ observationId: IdSchema, artifact: ArtifactRefSchema, computationId: IdSchema, itemIndex: Nat.nullable(), basis: z.enum(BASES) }))
    .max(REVIEW_HARD_LIMITS.maxObservations),
  evidenceBasis: z.enum(["actual_pinned_decodes_only", "includes_synthetic_test_bytes", "no_media_observed"]),
  coverage: z.strictObject({ items: z.array(z.strictObject({ itemIndex: Nat, purpose: z.enum(REVIEW_PURPOSES), joinIndex: Nat.nullable(), observed: z.boolean() }))
    .max(REVIEW_HARD_LIMITS.maxObservations), scope: z.literal("sampled_boundaries_and_global_windows_only_not_whole_output_v0") }),
  dimensions: z.array(z.strictObject({ dimension: z.enum(CRITIC_DIMENSIONS), assessment: z.enum(["not_computed", "deterministic_checks", "semantic_critic",
    "deterministic_checks_and_semantic_critic"]), reasonCode: IdSchema })).length(CRITIC_DIMENSIONS.length),
  semanticCritic: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("present"), criticId: IdSchema, version: LocationFreeVersionSchema,
    basis: z.enum(["synthetic_fixture", "model_adapter"]) }), z.strictObject({ state: z.literal("not_computed"), reasonCode: z.literal("no_semantic_critic_port_supplied") })]),
  findings: z.array(CriticFindingSchema).max(REVIEW_HARD_LIMITS.maxFindings),
  budget: z.strictObject({ observations: Nat, deliveredFrames: Nat, decodedPixelFrames: Nat, evidenceBytes: Nat, findings: Nat, transcriptCharacters: Nat }),
  implementation: z.strictObject({ implementationId: z.literal(REVIEW_IMPLEMENTATION.implementationId), version: z.literal(REVIEW_IMPLEMENTATION.version) }) });
export const CriticReportSchema = ReportBodySchema.extend({ reportId: IdSchema }).superRefine((r, ctx) => {
  if (!checkIdentity(r, "reportId", "critic_report_v0")) ctx.addIssue({ code: "custom", message: "Critic report identity mismatch." });
  if (!equal(r.dimensions.map(d => d.dimension), [...CRITIC_DIMENSIONS])) ctx.addIssue({ code: "custom", message: "Every dimension is assessed or explicitly not computed, in order." });
  if (r.budget.findings !== r.findings.length || r.budget.observations !== r.observations.length) ctx.addIssue({ code: "custom", message: "The budget accounts for this report." });
  if (r.attempt.attempt > r.attempt.maxAttempts) ctx.addIssue({ code: "custom", message: "Review attempts are bounded." });
  const output = { outputArtifactId: r.render.outputArtifactId, contentHash: r.render.contentHash, sizeBytes: r.render.sizeBytes };
  if (!r.findings.every(f => equal(f.output, output) && equal(f.reviewer, r.implementation))) ctx.addIssue({ code: "custom", message: "Every finding is about this report's exact output." });
});
export type CriticReport = z.infer<typeof CriticReportSchema>;

// ---------------------------------------------------------------- the provider-neutral semantic critic port
export interface SemanticCriticIdentity { readonly criticId: string; readonly version: string; readonly basis: "synthetic_fixture" | "model_adapter" }
/** What a semantic critic may see: bounded evidence of this review and exact identities; never a capability, path, process or raw media. */
export interface SemanticCriticInput {
  readonly output: { readonly outputArtifactId: string; readonly contentHash: string; readonly sizeBytes: number; readonly frames: number;
    readonly frameRate: { readonly numerator: number; readonly denominator: number }; readonly width: number; readonly height: number };
  readonly editGraph: { readonly editGraphId: string; readonly revision: 0 };
  readonly joins: readonly { readonly joinIndex: number; readonly atFrame: number; readonly classification: string; readonly review: string }[];
  readonly observations: readonly { readonly artifact: ArtifactRef; readonly observation: EditorialObservation }[];
  readonly transcripts: readonly { readonly transcriptEvidenceId: string; readonly packId: string; readonly text: string }[];
  readonly dimensions: readonly CriticDimension[];
  readonly limits: { readonly maxFindings: number; readonly maxExplanationCharacters: number };
}
/** A model-neutral critic boundary. An implementation returns structured findings only; the core validates them and owns the report. */
export interface SemanticCriticPort { readonly identity: SemanticCriticIdentity; assess(input: SemanticCriticInput): Promise<unknown> }
const PortIdentitySchema = z.strictObject({ criticId: IdSchema, version: LocationFreeVersionSchema, basis: z.enum(["synthetic_fixture", "model_adapter"]) });
const responseSchema = (limits: SemanticCriticInput["limits"], frames: number) => z.strictObject({
  dimensionsAssessed: z.array(z.enum(CRITIC_DIMENSIONS)).max(CRITIC_DIMENSIONS.length).refine(d => new Set(d).size === d.length, "Unique dimensions."),
  findings: z.array(z.strictObject({ dimension: z.enum(CRITIC_DIMENSIONS), severity: z.enum(CRITIC_SEVERITIES), joinIndex: Nat.nullable(),
    affectedOutput: RangeSchema.refine(r => r.endFrame <= frames, "Inside the output."), evidenceRefs: z.array(EvidenceRefSchema).min(1).max(8),
    explanation: ExplanationSchema.refine(v => v.length <= limits.maxExplanationCharacters, "Within the review's explanation bound."), uncertainty: DirectorUncertaintySchema }))
    .max(limits.maxFindings) });

// ---------------------------------------------------------------- the review
export interface CriticReviewInput extends ReviewPlanInput {
  observations: readonly EditorialObservation[];
  transcripts?: readonly { evidence: TranscriptEvidence; pack: TranscriptPack }[];
  port?: SemanticCriticPort;
  attempt: number;
}
const effectiveBasis = (o: EditorialObservation): (typeof BASES)[number] => o.acquisition.basis === "reused_by_computation_identity_v0" ? o.acquisition.reusedFrom!.basis
  : o.acquisition.basis;
/** Every observation must be of this plan's exact output (or of one of its staged inputs) and answer a planned item exactly, or be a bounded drill-down. */
function bindObservation(plan: ReviewPlan, o: EditorialObservation): void {
  const r = plan.render, m = o.media;
  if (m.kind === "rendered_output") {
    check(m.outputArtifactId === plan.output.outputArtifactId && m.contentHash === plan.output.contentHash && m.sizeBytes === plan.output.sizeBytes
      && m.receiptId === r.receiptId && m.qcReceiptId === plan.technicalQc.qcReceiptId && m.programId === r.programId && m.dagId === r.dagId
      && m.renderComputationId === r.renderComputationId && equal(m.editGraph, r.editGraph) && equal(o.facts, plan.facts), "observation_not_in_plan",
    "The observation is not of this review's exact rendered output.");
    if (o.planItem !== null) {
      const item = plan.items[o.planItem.itemIndex];
      check(item !== undefined && item.purpose === o.planItem.purpose && item.joinIndex === o.planItem.joinIndex && equal(item.request, o.request), "observation_not_in_plan",
        "The observation does not answer a planned item exactly.");
    }
  } else {
    const input = plan.inputs.find(i => i.inputSlot === m.inputSlot);
    check(input !== undefined && input.assetId === m.assetId && input.contentHash === m.contentHash && input.sizeBytes === m.sizeBytes
      && input.stagedObjectId === m.stagedObjectId && m.receiptId === r.receiptId && m.programId === r.programId && equal(o.facts, input.facts)
      && o.planItem === null, "observation_not_in_plan", "The observation is not of a staged input of this render.");
  }
}
/** Mechanical near-black runs over every observed output frame, each run reported once whatever windows observed it. */
function nearBlackFindings(plan: ReviewPlan, observations: readonly EditorialObservation[], artifacts: readonly SuppliedArtifact[]): CriticFinding[] {
  const dark = new Map<number, { observation: number; index: number }>();
  observations.forEach((o, oi) => { if (o.media.kind === "rendered_output") o.result.frames.forEach((f, fi) => {
    if (f.darkPerMille >= NEAR_BLACK_PER_MILLE && !dark.has(f.frame)) dark.set(f.frame, { observation: oi, index: fi }); }); });
  const frames = [...dark.keys()].sort((a, b) => a - b), runs: number[][] = [];
  for (const frame of frames) { const last = runs.at(-1); if (last !== undefined && last.at(-1) === frame - 1) last.push(frame); else runs.push([frame]); }
  const check_ = DETERMINISTIC_CHECKS.near_black_frames;
  return runs.map(run => {
    const start = run[0]!, end = run.at(-1)! + 1;
    return finding(outputOf(plan), { dimension: check_.dimension, severity: "info", basis: "measured", producer: { kind: "deterministic_check", checkId: check_.checkId, rule: check_.rule },
      affectedOutput: { startFrame: start, endFrame: end }, joinIndex: null,
      evidenceRefs: run.slice(0, 8).map(frame => { const at = dark.get(frame)!; return { artifact: artifacts[at.observation]!.ref, pointer: `/result/frames/${at.index}` }; }),
      measurement: { quantity: "observed_near_black_frames", values: [run.length, start, end], unit: "frames" },
      explanation: `Measured: ${run.length} observed output frames from ${start} to ${end - 1} have at least 90% of luma samples at code value 32 or below. Whether that is intended is an editorial question.`,
      uncertainty: deterministicUncertainty(), repair: NO_REPAIR });
  });
}
/** A settled level step across each reviewed cut: two frame-aligned bins on each side, one bin of guard against codec smear. */
function levelStepFindings(plan: ReviewPlan, observations: readonly EditorialObservation[], artifacts: readonly SuppliedArtifact[]): { findings: CriticFinding[]; covered: boolean } {
  const check_ = DETERMINISTIC_CHECKS.audio_level_step_at_cut, findings: CriticFinding[] = [];
  let covered = false;
  observations.forEach((o, oi) => {
    const item = o.planItem, waveform = o.result.waveform;
    if (item === null || item.purpose !== "cut_boundary" || item.joinIndex === null || waveform.state !== "present") return;
    const c = plan.joins[item.joinIndex]!.atFrame, b = c - o.request.window.startFrame, bins = waveform.bins;
    if (b - 3 < 0 || b + 2 >= bins.length) return;
    covered = true;
    const before = Math.floor((bins[b - 3]!.rmsQ15 + bins[b - 2]!.rmsQ15) / 2), after = Math.floor((bins[b + 1]!.rmsQ15 + bins[b + 2]!.rmsQ15) / 2);
    const louder = Math.max(before, after), quieter = Math.min(before, after);
    if (!(louder >= AUDIBLE_RMS_Q15 && louder >= STEP_RATIO * quieter)) return;
    findings.push(finding(outputOf(plan), { dimension: check_.dimension, severity: "info", basis: "measured", producer: { kind: "deterministic_check", checkId: check_.checkId, rule: check_.rule },
      affectedOutput: { startFrame: c - 3, endFrame: c + 3 }, joinIndex: item.joinIndex,
      evidenceRefs: [b - 3, b - 2, b + 1, b + 2].map(i => ({ artifact: artifacts[oi]!.ref, pointer: `/result/waveform/bins/${i}` })),
      measurement: { quantity: "settled_rms_q15_before_after", values: [before, after], unit: "rms_q15" },
      explanation: `Measured: the settled RMS level changes from ${before} to ${after} (Q15) across the cut at output frame ${c}. This is a mechanical signal, not an editorial judgment.`,
      uncertainty: deterministicUncertainty(), repair: NO_REPAIR }));
  });
  return { findings, covered };
}
/** Transcript text for the port: only phrases inside the edit's selected source ranges, bounded; the pack must replay from its evidence. */
function transcriptTexts(plan: ReviewPlan, supplied_: CriticReviewInput["transcripts"]): SemanticCriticInput["transcripts"] {
  return (supplied_ ?? []).map(({ evidence, pack }) => {
    const e = requireTranscriptEvidence(evidence), p = validateTranscriptPack(pack, e);
    const input = plan.inputs.find(i => i.assetId === e.source.assetId && i.contentHash === e.source.contentHash);
    check(input !== undefined, "transcript_source_mismatch", "The transcript describes no source of this render.");
    const tps = e.clock.ticksPerSecond, grid = input.facts.frameRate, segments = plan.segments.filter(s => s.contentHash === e.source.contentHash);
    const phrases = p.phrases.filter(ph => segments.some(s => ticksBeforeFrame(ph.startTicks, tps, s.sourceEndFrame, grid) && ticksAfterFrame(ph.endTicks, tps, s.sourceStartFrame, grid)));
    const head = `# TranscriptPack ${p.packId} | asset ${p.transcript.assetId} | ${phrases.length} of ${p.phrases.length} phrases inside the edit | projection only, not authority`;
    return { transcriptEvidenceId: e.transcriptEvidenceId, packId: p.packId, text: `${[head, ...phraseLines(p, phrases)].join("\n")}\n` };
  });
}
/**
 * Reviews one exact rendered output under the owner's bounded review policy: re-derives the plan (and with it the receipt and QC linkage),
 * binds every observation to it, runs the deterministic checks, optionally consults the semantic port, and returns a content-identified
 * report. It never mutates, repairs or re-renders anything; a failed port produces no finding.
 */
export async function runCriticReview(input: CriticReviewInput): Promise<CriticReport> {
  // The attempt admitted here is the attempt recorded, whatever the caller's object holds later (self-review D10).
  const attempt = input.attempt;
  check(Number.isSafeInteger(attempt) && attempt >= 1, "critic_input_invalid", "A review attempt is a positive integer.");
  // A private snapshot of the policy: a caller or port mutating its object during the review changes no bound (self-review D8).
  const policy = structuredClone(input.policy), plan = planReview({ ...input, policy }), b = policy.budget;
  check(attempt <= b.maxReviewAttempts, "review_attempts_exhausted", "The review attempts the owner allows are exhausted; no further review runs.");
  check(Array.isArray(input.observations), "critic_input_invalid", "Observations are a list.");
  check(input.observations.length <= b.maxObservations, "review_budget_exceeded", "More observations than the review budget allows.");
  const observations = input.observations.map(requireObservation);
  for (const o of observations) bindObservation(plan, o);
  check(new Set(observations.map(o => o.observationId)).size === observations.length, "critic_input_invalid", "An observation is supplied twice.");
  const answered = observations.flatMap(o => o.planItem === null ? [] : [o.planItem.itemIndex]);
  check(new Set(answered).size === answered.length, "critic_input_invalid", "A planned item is answered twice.");
  const artifacts = observations.map(o => supplied(o, o.observationId));
  const evidenceBytes = observations.reduce((n, o) => n + byteLengthOf(o), 0);
  check(evidenceBytes <= b.maxEvidenceBytes, "review_budget_exceeded", "The observed evidence exceeds the review's evidence-byte budget.");
  // Every observation counts against the review budget, drill-downs included (self-review D4).
  const deliveredFrames = observations.reduce((n, o) => n + o.acquisition.deliveredFrames, 0), decodedPixelFrames = observations.reduce((n, o) => n + o.acquisition.decodedPixelFrames, 0);
  check(deliveredFrames <= b.maxDeliveredFrames && decodedPixelFrames <= b.maxDecodedPixelFrames, "review_budget_exceeded",
    "The observations exceed the review's delivered-frame or decoded-pixel budget.");
  const nearBlack = nearBlackFindings(plan, observations, artifacts), steps = levelStepFindings(plan, observations, artifacts);
  const deterministic = [...nearBlack, ...steps.findings].sort((x, y) => x.affectedOutput.startFrame - y.affectedOutput.startFrame
    || (x.producer.kind === "deterministic_check" && y.producer.kind === "deterministic_check" ? (x.producer.checkId < y.producer.checkId ? -1 : 1) : 0));
  let semantic: CriticFinding[] = [], semanticDimensions = new Set<CriticDimension>(), transcriptCharacters = 0;
  let semanticCritic: z.infer<typeof ReportBodySchema>["semanticCritic"] = { state: "not_computed", reasonCode: "no_semantic_critic_port_supplied" };
  if (input.port !== undefined) {
    const identity = parse(PortIdentitySchema, { ...input.port.identity }, "critic_input_invalid");
    const transcripts = transcriptTexts(plan, input.transcripts);
    transcriptCharacters = transcripts.reduce((n, t) => n + t.text.length, 0);
    check(transcriptCharacters <= b.maxTranscriptCharacters, "review_budget_exceeded", "The transcript text exceeds the review's transcript budget.");
    const limits = { maxFindings: b.maxFindings, maxExplanationCharacters: b.maxExplanationCharacters };
    const portInput: SemanticCriticInput = frozenCopy({ output: { outputArtifactId: plan.output.outputArtifactId, contentHash: plan.output.contentHash, sizeBytes: plan.output.sizeBytes,
      frames: plan.facts.frames, frameRate: plan.facts.frameRate, width: plan.facts.width, height: plan.facts.height }, editGraph: plan.render.editGraph,
    joins: plan.joins.map(j => ({ joinIndex: j.joinIndex, atFrame: j.atFrame, classification: j.classification, review: j.review })),
    observations: observations.map((observation, i) => ({ artifact: artifacts[i]!.ref, observation })), transcripts, dimensions: [...CRITIC_DIMENSIONS], limits });
    let raw: unknown;
    try { raw = await input.port.assess(portInput); } catch { refuse("critic_port_failed", "The semantic critic port failed; a failed assessment yields no finding."); }
    const response = parse(responseSchema(limits, plan.facts.frames), raw, "critic_response_invalid");
    const map = new EditorialArtifactMap(artifacts);
    semantic = response.findings.map(f => {
      check(f.joinIndex === null || plan.joins[f.joinIndex]?.review === "reviewed", "critic_response_invalid", "A finding names a reviewed cut of this output or none.");
      // Evidence, and whatever the uncertainty cites, must point into the result of an observation of this review (self-review D5).
      for (const ref of [...f.evidenceRefs, ...f.uncertainty.evidenceRefs]) {
        check(artifacts.some(a => equal(a.ref, ref.artifact)) && ref.pointer.startsWith("/result/"), "critic_response_invalid",
          "Evidence must point into the result of an observation of this review.");
        guard("critic_response_invalid", () => map.resolve(ref));
      }
      return finding(outputOf(plan), { dimension: f.dimension, severity: f.severity, basis: "model_assessed", producer: { kind: "semantic_critic", ...identity }, affectedOutput: f.affectedOutput,
        joinIndex: f.joinIndex, evidenceRefs: f.evidenceRefs, measurement: null, explanation: f.explanation, uncertainty: f.uncertainty, repair: NO_REPAIR });
    });
    semanticDimensions = new Set(response.dimensionsAssessed);
    semanticCritic = { state: "present", ...identity };
  }
  const findings = [...deterministic, ...semantic];
  check(findings.length <= b.maxFindings, "review_budget_exceeded", "More findings than the review budget allows.");
  const technical = observations.some(o => o.media.kind === "rendered_output");
  const dimensions = CRITIC_DIMENSIONS.map(dimension => {
    const measured = (dimension === "technical_quality" && technical) || (dimension === "sound" && steps.covered), assessed = semanticDimensions.has(dimension);
    return measured && assessed ? { dimension, assessment: "deterministic_checks_and_semantic_critic" as const, reasonCode: "measured_signals_and_uncalibrated_semantic_assessment" }
      : measured ? { dimension, assessment: "deterministic_checks" as const, reasonCode: "measured_signals_only_not_an_editorial_verdict" }
        : assessed ? { dimension, assessment: "semantic_critic" as const, reasonCode: "uncalibrated_semantic_assessment" }
          : { dimension, assessment: "not_computed" as const, reasonCode: "no_producer_assessed_this_dimension_in_this_review" };
  });
  const bases = observations.map(effectiveBasis);
  const body = { ...header("CriticReport"), scope: plan.scope, plan: { planId: plan.planId, policyId: plan.policy.policyId },
    editGraph: { ...plan.render.editGraph, artifact: plan.render.editGraphArtifact },
    render: { receiptId: plan.render.receiptId, dagId: plan.render.dagId, programId: plan.render.programId, renderComputationId: plan.render.renderComputationId,
      outputArtifactId: plan.output.outputArtifactId, contentHash: plan.output.contentHash, sizeBytes: plan.output.sizeBytes },
    technicalQc: plan.technicalQc, separation: "technical_qc_is_objective_media_correctness_critic_is_editorial_evidence_v0" as const,
    attempt: { attempt, maxAttempts: b.maxReviewAttempts },
    observations: observations.map((o, i) => ({ observationId: o.observationId, artifact: artifacts[i]!.ref, computationId: o.computationId, itemIndex: o.planItem?.itemIndex ?? null,
      basis: bases[i]! })),
    evidenceBasis: observations.length === 0 ? "no_media_observed" as const : bases.every(x => x === "pinned_ffmpeg_decode_of_verified_held_object_v0")
      ? "actual_pinned_decodes_only" as const : "includes_synthetic_test_bytes" as const,
    coverage: { items: plan.items.map(item => ({ itemIndex: item.itemIndex, purpose: item.purpose, joinIndex: item.joinIndex, observed: answered.includes(item.itemIndex) })),
      scope: "sampled_boundaries_and_global_windows_only_not_whole_output_v0" as const },
    dimensions, semanticCritic, findings,
    budget: { observations: observations.length, deliveredFrames, decodedPixelFrames, evidenceBytes, findings: findings.length, transcriptCharacters },
    implementation: REVIEW_IMPLEMENTATION };
  return parse(CriticReportSchema, identify("critic_report_v0", "reportId", body), "critic_input_invalid");
}
