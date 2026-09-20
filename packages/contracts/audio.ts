import { z } from "zod";
import { EnergyPointSchema, IdSchema, LanguageSchema, ProvenanceSchema, SecondsSchema, TimeRangeSchema, checkTimestamps, envelope } from "./common.js";

export const AudioFingerprintSchema = z.strictObject({
  ...envelope("AudioFingerprint"),
  fingerprintId: IdSchema,
  assetId: IdSchema,
  durationSeconds: z.number().positive().max(86400),
  bpm: z.number().min(20).max(400).nullable(),
  beatsSeconds: z.array(SecondsSchema).max(50000),
  downbeatsSeconds: z.array(SecondsSchema).max(15000),
  energy: z.array(EnergyPointSchema).max(50000),
  mainDropSeconds: SecondsSchema.nullable(),
  phraseBoundariesSeconds: z.array(SecondsSchema).max(15000),
  speechRegions: z.array(TimeRangeSchema).max(10000),
  language: LanguageSchema.nullable(),
  provenance: ProvenanceSchema,
}).superRefine((audio, ctx) => {
  for (const field of ["beatsSeconds", "downbeatsSeconds", "phraseBoundariesSeconds"] as const) {
    checkTimestamps(audio[field], audio.durationSeconds, ctx, field);
  }
  checkTimestamps(audio.energy.map((point) => point.atSeconds), audio.durationSeconds, ctx, "energy");
  if (audio.mainDropSeconds !== null && audio.mainDropSeconds > audio.durationSeconds) {
    ctx.addIssue({ code: "custom", path: ["mainDropSeconds"], message: "Drop is outside the audio." });
  }
  audio.downbeatsSeconds.forEach((beat, index) => {
    if (!audio.beatsSeconds.some((candidate) => Math.abs(candidate - beat) <= 0.000001)) {
      ctx.addIssue({ code: "custom", path: ["downbeatsSeconds", index], message: "A downbeat must also be a beat." });
    }
  });
  audio.speechRegions.forEach((region, index) => {
    if (region.endSeconds > audio.durationSeconds || (index > 0 && region.startSeconds < (audio.speechRegions[index - 1]?.endSeconds ?? 0))) {
      ctx.addIssue({ code: "custom", path: ["speechRegions", index], message: "Speech regions must be ordered, non-overlapping, and inside the audio." });
    }
  });
});
