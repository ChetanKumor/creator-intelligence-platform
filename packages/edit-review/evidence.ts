/**
 * The evidence request / selection seam: an editorial consumer states which decision it is making, over which exact media and interval, and
 * what evidence already exists; a pure, deterministic rule answers which evidence that decision needs, and at most a bounded number of
 * additional observations. It calls no model, starts no process and reads nothing. A transcript is never mandatory: speech decisions without
 * one proceed on frames and audio and say so, and visual or music-driven decisions never ask for one.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { checkIdentity, identify } from "../editorial/common.js";
import { HashSchema, Nat } from "../edit-graph/common.js";
import { PositiveSafeInt } from "../edit-execution/common.js";
import { REVIEW_HARD_LIMITS, envelope, header, isSortedUnique, parse, parseCanonical, sortedUnique } from "./common.js";

export const EVIDENCE_DECISIONS = ["speech_selection", "retake_comparison", "cut_boundary", "reaction_relationship", "visual_continuity", "pacing", "music_sync",
  "global_review"] as const;
const SPEECH_DECISIONS: readonly string[] = ["speech_selection", "retake_comparison"];
const NEVER_TRANSCRIPT: readonly string[] = ["music_sync", "visual_continuity"];
const MediaRefSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("rendered_output"), outputArtifactId: IdSchema, contentHash: HashSchema }),
  z.strictObject({ kind: z.literal("staged_source"), assetId: IdSchema, contentHash: HashSchema }),
]);
const IntervalSchema = z.strictObject({ startFrame: Nat, endFrame: PositiveSafeInt })
  .refine(v => v.endFrame > v.startFrame && v.endFrame - v.startFrame <= REVIEW_HARD_LIMITS.maxObservationWindowFrames, "A bounded, non-empty frame interval.");
const RequestFields = {
  decision: z.enum(EVIDENCE_DECISIONS), media: z.array(MediaRefSchema).min(1).max(4), interval: IntervalSchema,
  available: z.strictObject({
    transcript: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("absent") }),
      z.strictObject({ state: z.literal("present"), transcriptEvidenceId: IdSchema, speechCoveragePerMille: z.number().int().min(0).max(1000) })]),
    observationIds: z.array(IdSchema).max(REVIEW_HARD_LIMITS.maxObservations).refine(ids => new Set(ids).size === ids.length, "Unique observation IDs."),
  }),
  maxAdditionalObservations: z.number().int().min(0).max(REVIEW_HARD_LIMITS.maxAdditionalObservations),
};
export const EvidenceRequestSchema = z.strictObject({ ...envelope("EvidenceRequest"), ...RequestFields, requestId: IdSchema })
  .refine(v => checkIdentity(v, "requestId", "evidence_request_v0"), "Evidence request identity mismatch.");
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>;
export function createEvidenceRequest(input: unknown): EvidenceRequest {
  const body = parse(z.strictObject(RequestFields), input, "evidence_request_invalid");
  return parse(EvidenceRequestSchema, identify("evidence_request_v0", "requestId", { ...header("EvidenceRequest"), ...body }), "evidence_request_invalid");
}

const SelectedRequestSchema = z.strictObject({ window: z.strictObject({ startFrame: Nat, endFrame: PositiveSafeInt }), frames: z.array(Nat).max(REVIEW_HARD_LIMITS.maxFramesPerObservation)
  .refine(isSortedUnique, "Sorted, unique frames."), audio: z.enum(["none", "window"]) });
export const EvidenceSelectionSchema = z.strictObject({ ...envelope("EvidenceSelection"), request: IdSchema, decision: z.enum(EVIDENCE_DECISIONS),
  profile: z.enum(["speech_heavy", "mixed", "visual_music_driven"]),
  transcript: z.discriminatedUnion("use", [z.strictObject({ use: z.literal("transcript_pack"), transcriptEvidenceId: IdSchema }), z.strictObject({ use: z.literal("not_required") }),
    z.strictObject({ use: z.literal("unavailable_proceeding_without_transcript") })]),
  reuse: z.array(IdSchema).max(REVIEW_HARD_LIMITS.maxObservations),
  observations: z.array(z.strictObject({ media: Nat, content: z.enum(["frames_and_waveform", "waveform"]), request: SelectedRequestSchema }))
    .max(REVIEW_HARD_LIMITS.maxAdditionalObservations),
  rule: z.literal("evidence_routing_v0"), selectionId: IdSchema })
  .refine(v => checkIdentity(v, "selectionId", "evidence_selection_v0"), "Evidence selection identity mismatch.");
export type EvidenceSelection = z.infer<typeof EvidenceSelectionSchema>;
/**
 * evidence_routing_v0. Profile: no transcript, or speech on under 10 % of the media, is visual/music-driven; at least half is speech-heavy;
 * anything between is mixed. The pack is used for speech decisions whenever a transcript exists, and for other decisions only when the
 * material is not visual/music-driven (never for music sync or visual continuity). A speech decision uses a waveform window beside the
 * pack; every other need is frames plus waveform. Available observations are reused and nothing new is requested; otherwise at most
 * `maxAdditionalObservations`, one per listed medium, over exactly the requested interval.
 */
export function selectEvidence(requestInput: unknown): EvidenceSelection {
  const r = parseCanonical(EvidenceRequestSchema, requestInput, "evidence_request_invalid"), t = r.available.transcript;
  const profile = t.state === "absent" || t.speechCoveragePerMille < 100 ? "visual_music_driven" as const : t.speechCoveragePerMille >= 500 ? "speech_heavy" as const : "mixed" as const;
  const speech = SPEECH_DECISIONS.includes(r.decision);
  const transcript = t.state === "present"
    ? (speech || (profile !== "visual_music_driven" && !NEVER_TRANSCRIPT.includes(r.decision)) ? { use: "transcript_pack" as const, transcriptEvidenceId: t.transcriptEvidenceId }
      : { use: "not_required" as const })
    : speech ? { use: "unavailable_proceeding_without_transcript" as const } : { use: "not_required" as const };
  const content = transcript.use === "transcript_pack" && speech ? "waveform" as const : "frames_and_waveform" as const;
  const { startFrame, endFrame } = r.interval;
  const frames = content === "waveform" ? [] : sortedUnique([startFrame, startFrame + Math.floor((endFrame - startFrame - 1) / 2), endFrame - 1]);
  const count = r.available.observationIds.length > 0 ? 0 : Math.min(r.maxAdditionalObservations, r.media.length);
  const observations = Array.from({ length: count }, (_, media) => ({ media, content, request: { window: { startFrame, endFrame }, frames, audio: "window" as const } }));
  return parse(EvidenceSelectionSchema, identify("evidence_selection_v0", "selectionId", { ...header("EvidenceSelection"), request: r.requestId, decision: r.decision, profile,
    transcript, reuse: [...r.available.observationIds], observations, rule: "evidence_routing_v0" as const }), "evidence_request_invalid");
}
