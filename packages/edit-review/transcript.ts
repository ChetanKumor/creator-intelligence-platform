/**
 * Provider-neutral transcript evidence and its phrase pack.
 *
 * TranscriptEvidence is the smallest word/audio-event contract Batch 3A needs: the frozen public Transcript is segment-level, in floating
 * seconds and bound to no content hash, so it cannot carry exact word lineage. Each record binds the exact source bytes (asset and
 * content hash), states its producer (a synthetic stub, a model or a human, never a provider payload), and times every entry on the accepted
 * Gate-6 integer tick clock (`ClockSchema`); no second time representation exists. Entries are validated, never repaired or reordered.
 *
 * TranscriptPack is a deterministic projection for reasoning, not transcript truth: phrases group contiguous entries on a speaker change, a
 * bounded silence gap or an entry limit, and each keeps the exact entry range it came from. The text projection is a display of the pack,
 * not authority, and says so. Speech is optional: an empty transcript is a valid, first-class pack with no phrases.
 */
import { z } from "zod";
import { IdSchema, LanguageSchema } from "../contracts/common.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
import { ClockSchema, HashSchema, Nat } from "../edit-graph/common.js";
import { LocationFreeVersionSchema, PositiveSafeInt } from "../edit-execution/common.js";
import { REVIEW_HARD_LIMITS, check, digestOf, envelope, header, parse, parseCanonical, refuse } from "./common.js";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const WordTextSchema = z.string().min(1).max(REVIEW_HARD_LIMITS.maxEntryTextCharacters)
  .refine(v => v === v.trim() && !CONTROL.test(v), "Entry text is trimmed and carries no control characters.");
/** An audio event is a bare label (the pack adds the parentheses), e.g. `laughter`, `applause`. */
const EventTextSchema = z.string().regex(new RegExp(`^[A-Za-z0-9][A-Za-z0-9 _'-]{0,${REVIEW_HARD_LIMITS.maxAudioEventCharacters - 1}}$`));
const EntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("word"), startTicks: Nat, endTicks: Nat, text: WordTextSchema, speakerId: IdSchema.nullable() }),
  z.strictObject({ kind: z.literal("audio_event"), startTicks: Nat, endTicks: Nat, text: EventTextSchema, speakerId: IdSchema.nullable() }),
]);
export type TranscriptEntry = z.infer<typeof EntrySchema>;
/** Who produced the evidence, in the accepted editorial vocabulary: never a provider object, finish reason or payload. */
const ProducerSchema = z.strictObject({ producerId: IdSchema, producerVersion: LocationFreeVersionSchema,
  computationBasis: z.enum(["synthetic_stub", "fresh_real_model", "cached_real_model", "human_annotation", "unverified"]), mediaBasis: z.enum(["real_footage", "synthetic", "unverified"]) })
  .refine(p => p.computationBasis !== "synthetic_stub" || p.mediaBasis === "synthetic", "A synthetic stub describes synthetic media only.");
const SourceSchema = z.strictObject({ assetId: IdSchema, contentHash: HashSchema, durationTicks: PositiveSafeInt });
const BodyFields = { source: SourceSchema, clock: ClockSchema, language: LanguageSchema.nullable(), producer: ProducerSchema };
const InputSchema = z.strictObject({ ...BodyFields, entries: z.array(EntrySchema) });
type Body = z.infer<typeof InputSchema>;
/** Exact timing: start < end within the source, entries ordered by (start, end), and words never overlapping (an audio event may). */
function timingIssue(body: Body): string | undefined {
  let lastWordEnd = 0;
  for (const [i, e] of body.entries.entries()) {
    if (!(e.startTicks < e.endTicks)) return `Entry ${i} does not start before it ends.`;
    if (e.endTicks > body.source.durationTicks) return `Entry ${i} ends after the source.`;
    const previous = body.entries[i - 1];
    if (previous !== undefined && (e.startTicks < previous.startTicks || (e.startTicks === previous.startTicks && e.endTicks < previous.endTicks))) return `Entry ${i} is out of order.`;
    if (e.kind === "word") { if (e.startTicks < lastWordEnd) return `Word ${i} overlaps the previous word.`; lastWordEnd = e.endTicks; }
  }
  return undefined;
}
const textBytes = (body: Pick<Body, "entries">) => body.entries.reduce((n, e) => n + new TextEncoder().encode(e.text).length, 0);
const EvidenceBodySchema = z.strictObject({ ...envelope("TranscriptEvidence"), ...BodyFields, entries: z.array(EntrySchema).max(REVIEW_HARD_LIMITS.maxTranscriptEntries) });
export const TranscriptEvidenceSchema = EvidenceBodySchema.extend({ transcriptEvidenceId: IdSchema }).superRefine((v, ctx) => {
  const issue = timingIssue(v);
  if (issue !== undefined) ctx.addIssue({ code: "custom", message: issue });
  if (textBytes(v) > REVIEW_HARD_LIMITS.maxTranscriptTextBytes) ctx.addIssue({ code: "custom", message: "Transcript text exceeds its bound." });
  if (!checkIdentity(v, "transcriptEvidenceId", "transcript_evidence_v0")) ctx.addIssue({ code: "custom", message: "Transcript evidence identity mismatch." });
});
export type TranscriptEvidence = z.infer<typeof TranscriptEvidenceSchema>;
/** Builds content-identified evidence from a strict body; malformed timing, oversize input and unknown fields are refused, never repaired. */
export function createTranscriptEvidence(input: unknown): TranscriptEvidence {
  const entries = (input as { entries?: unknown } | null)?.entries;
  check(!Array.isArray(entries) || entries.length <= REVIEW_HARD_LIMITS.maxTranscriptEntries, "transcript_limit_exceeded", "Too many transcript entries.");
  const body = parse(InputSchema, input, "transcript_invalid");
  const issue = timingIssue(body);
  if (issue !== undefined) refuse("transcript_timing_invalid", issue);
  check(textBytes(body) <= REVIEW_HARD_LIMITS.maxTranscriptTextBytes, "transcript_limit_exceeded", "Transcript text exceeds its bound.");
  return parse(TranscriptEvidenceSchema, identify("transcript_evidence_v0", "transcriptEvidenceId", { ...header("TranscriptEvidence"), ...body }), "transcript_invalid");
}
export function requireTranscriptEvidence(value: unknown): TranscriptEvidence { return parseCanonical(TranscriptEvidenceSchema, value, "transcript_invalid"); }

// ---------------------------------------------------------------- the phrase pack
export const TRANSCRIPT_PACK_SEMANTICS = { version: "transcript_pack_v0", breakPrecedence: "speaker_change_then_silence_gap_then_entry_limit_v0",
  speakers: "break_only_when_both_speakers_known_and_different_v0", gap: "entry_start_minus_latest_phrase_end_at_least_threshold_v0",
  text: "space_joined_audio_events_parenthesized_v0" } as const;
const PackPolicySchema = z.strictObject({ silenceGapTicks: PositiveSafeInt, maxPhraseEntries: z.number().int().min(1).max(REVIEW_HARD_LIMITS.maxPhraseEntries) });
export type TranscriptPackPolicy = z.infer<typeof PackPolicySchema>;
const PhraseSchema = z.strictObject({ phraseIndex: Nat, startTicks: Nat, endTicks: PositiveSafeInt, speakerId: IdSchema.nullable(),
  breakBefore: z.enum(["transcript_start", "silence_gap", "speaker_change", "entry_limit"]), entryStart: Nat, entryEnd: PositiveSafeInt, wordCount: Nat,
  audioEventEntries: z.array(Nat).max(REVIEW_HARD_LIMITS.maxPhraseEntries), text: z.string().min(1).max(REVIEW_HARD_LIMITS.maxPhraseEntries * (REVIEW_HARD_LIMITS.maxEntryTextCharacters + 3)) });
const PackBodySchema = z.strictObject({ ...envelope("TranscriptPack"),
  transcript: z.strictObject({ transcriptEvidenceId: IdSchema, assetId: IdSchema, contentHash: HashSchema, ticksPerSecond: PositiveSafeInt, durationTicks: PositiveSafeInt }),
  semantics: z.strictObject({ version: z.literal(TRANSCRIPT_PACK_SEMANTICS.version), digest: z.literal(digestOf(TRANSCRIPT_PACK_SEMANTICS)), silenceGapTicks: PositiveSafeInt,
    maxPhraseEntries: z.number().int().min(1).max(REVIEW_HARD_LIMITS.maxPhraseEntries) }),
  entryCount: Nat, phrases: z.array(PhraseSchema).max(REVIEW_HARD_LIMITS.maxTranscriptEntries) });
export const TranscriptPackSchema = PackBodySchema.extend({ packId: IdSchema }).refine(v => checkIdentity(v, "packId", "transcript_pack_v0"), "Transcript pack identity mismatch.");
export type TranscriptPack = z.infer<typeof TranscriptPackSchema>;
type Phrase = z.infer<typeof PhraseSchema>;
/** Deterministic grouping. Every entry lands in exactly one phrase, in order; the phrase keeps its exact entry range. */
export function buildTranscriptPack(evidenceInput: unknown, policyInput: TranscriptPackPolicy): TranscriptPack {
  const evidence = requireTranscriptEvidence(evidenceInput), policy = parse(PackPolicySchema, policyInput, "transcript_invalid");
  const phrases: Phrase[] = [];
  let open: { entryStart: number; startTicks: number; endTicks: number; speakerId: string | null; breakBefore: Phrase["breakBefore"]; indices: number[] } | null = null;
  const close = () => {
    if (open === null) return;
    const entries = open.indices.map(i => evidence.entries[i]!);
    phrases.push({ phraseIndex: phrases.length, startTicks: open.startTicks, endTicks: open.endTicks, speakerId: open.speakerId, breakBefore: open.breakBefore,
      entryStart: open.entryStart, entryEnd: open.entryStart + open.indices.length, wordCount: entries.filter(e => e.kind === "word").length,
      audioEventEntries: open.indices.filter(i => evidence.entries[i]!.kind === "audio_event"),
      text: entries.map(e => e.kind === "audio_event" ? `(${e.text})` : e.text).join(" ") });
    open = null;
  };
  let reason: Phrase["breakBefore"] = "transcript_start";
  for (const [i, entry] of evidence.entries.entries()) {
    if (open !== null) {
      const speaker: boolean = entry.speakerId !== null && open.speakerId !== null && entry.speakerId !== open.speakerId;
      const gap: boolean = entry.startTicks - open.endTicks >= policy.silenceGapTicks, full: boolean = open.indices.length >= policy.maxPhraseEntries;
      const cause: Phrase["breakBefore"] | null = speaker ? "speaker_change" : gap ? "silence_gap" : full ? "entry_limit" : null;
      if (cause !== null) { close(); reason = cause; }
    }
    if (open === null) open = { entryStart: i, startTicks: entry.startTicks, endTicks: entry.endTicks, speakerId: entry.speakerId, breakBefore: reason, indices: [] };
    open.indices.push(i);
    open.endTicks = Math.max(open.endTicks, entry.endTicks);
    if (open.speakerId === null) open.speakerId = entry.speakerId;
  }
  close();
  const body = { ...header("TranscriptPack"), transcript: { transcriptEvidenceId: evidence.transcriptEvidenceId, assetId: evidence.source.assetId,
    contentHash: evidence.source.contentHash, ticksPerSecond: evidence.clock.ticksPerSecond, durationTicks: evidence.source.durationTicks },
    semantics: { version: TRANSCRIPT_PACK_SEMANTICS.version, digest: digestOf(TRANSCRIPT_PACK_SEMANTICS), ...policy }, entryCount: evidence.entries.length, phrases };
  return parse(TranscriptPackSchema, identify("transcript_pack_v0", "packId", body), "transcript_invalid");
}
/** A supplied pack is accepted only if it replays exactly from the supplied evidence under its own recorded policy. */
export function validateTranscriptPack(packInput: unknown, evidenceInput: unknown): TranscriptPack {
  const pack = parseCanonical(TranscriptPackSchema, packInput, "transcript_pack_mismatch");
  const replayed = buildTranscriptPack(evidenceInput, { silenceGapTicks: pack.semantics.silenceGapTicks, maxPhraseEntries: pack.semantics.maxPhraseEntries });
  check(equal(replayed, pack), "transcript_pack_mismatch", "The pack does not replay from this transcript evidence.");
  return pack;
}

// ---------------------------------------------------------------- the non-authoritative text projection
/** Milliseconds (floored) of a tick instant as `mm:ss.mmm`, or `hh:mm:ss.mmm` when the source lasts an hour or more. Exact integer arithmetic. */
function clockText(ticks: number, ticksPerSecond: number, hours: boolean): string {
  const ms = (BigInt(ticks) * 1000n) / BigInt(ticksPerSecond);
  const pad = (v: bigint, n: number) => v.toString().padStart(n, "0");
  const h = ms / 3_600_000n, m = (ms / 60_000n) % 60n, s = (ms / 1000n) % 60n, r = ms % 1000n;
  return hours ? `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(r, 3)}` : `${pad(ms / 60_000n, 2)}:${pad(s, 2)}.${pad(r, 3)}`;
}
/** One display line per phrase. The projection is derived from the pack for reasoning; it is never evidence of timing or text. */
export function phraseLines(pack: TranscriptPack, phrases: readonly Phrase[] = pack.phrases): string[] {
  const t = pack.transcript, hours = BigInt(t.durationTicks) >= 3600n * BigInt(t.ticksPerSecond);
  return phrases.map(p => `[${clockText(p.startTicks, t.ticksPerSecond, hours)}–${clockText(p.endTicks, t.ticksPerSecond, hours)}] ${p.speakerId ?? "UNKNOWN_SPEAKER"}: ${p.text}`);
}
export function renderTranscriptText(packInput: unknown): string {
  const pack = parse(TranscriptPackSchema, packInput, "transcript_invalid");
  const head = `# TranscriptPack ${pack.packId} | asset ${pack.transcript.assetId} | ${pack.phrases.length} phrases | projection only, not authority`;
  const lines = pack.phrases.length === 0 ? ["(no speech in this transcript evidence)"] : phraseLines(pack);
  return `${[head, ...lines].join("\n")}\n`;
}
