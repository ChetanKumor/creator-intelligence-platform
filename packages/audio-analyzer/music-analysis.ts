import {
  z,
} from "zod";

import {
  MusicPrimitiveAnalysisSchema,
  type MusicPrimitiveAnalysis,
} from "./music-primitives.js";

import {
  StructureAnalysisResponseSchema,
  type StructureAnalysisResponse,
} from "./protocol.js";

export const MUSIC_ANALYSIS_VERSION =
  "0.1.0";


export const MusicAnalysisSchema =
  z.strictObject({
    contractType:
      z.literal("MusicAnalysis"),

    schemaVersion:
      z.literal(
        MUSIC_ANALYSIS_VERSION,
      ),

    primitives:
      MusicPrimitiveAnalysisSchema,

    structure:
      StructureAnalysisResponseSchema,
  })
  .superRefine(
    (
      analysis,
      ctx,
    ) => {
      const primitiveAudio =
        analysis.primitives.audio;

      const structureAudio =
        analysis.structure.audio;

      if (
        primitiveAudio.sha256 !==
        structureAudio.sha256
      ) {
        ctx.addIssue({
          code: "custom",

          path: [
            "structure",
            "audio",
            "sha256",
          ],

          message:
            "Structure evidence must resolve to the same source audio.",
        });
      }

      if (
        Math.abs(
          primitiveAudio
            .durationSeconds -
          structureAudio
            .durationSeconds,
        ) > 1e-6
      ) {
        ctx.addIssue({
          code: "custom",

          path: [
            "structure",
            "audio",
            "durationSeconds",
          ],

          message:
            "Structure duration must match primitive evidence.",
        });
      }

      if (
        primitiveAudio.sampleRate !==
        structureAudio.sampleRate
      ) {
        ctx.addIssue({
          code: "custom",

          path: [
            "structure",
            "audio",
            "sampleRate",
          ],

          message:
            "Structure sample rate must match primitive evidence.",
        });
      }

      if (
        primitiveAudio.channels !==
        structureAudio.channels
      ) {
        ctx.addIssue({
          code: "custom",

          path: [
            "structure",
            "audio",
            "channels",
          ],

          message:
            "Structure channel count must match primitive evidence.",
        });
      }
    },
  );


export type MusicAnalysis =
  z.infer<
    typeof MusicAnalysisSchema
  >;


export function combineMusicAnalysis(
  primitiveRaw:
    MusicPrimitiveAnalysis,

  structureRaw:
    StructureAnalysisResponse,
): MusicAnalysis {
  const primitives =
    MusicPrimitiveAnalysisSchema.parse(
      primitiveRaw,
    );

  const structure =
    StructureAnalysisResponseSchema.parse(
      structureRaw,
    );

  return MusicAnalysisSchema.parse({
    contractType:
      "MusicAnalysis",

    schemaVersion:
      MUSIC_ANALYSIS_VERSION,

    primitives,

    structure,
  });
}


export interface MusicAnalysisInput {
  readonly audioPath: string;

  readonly beatCheckpointPath:
    string;

  readonly beatDevice:
    "cpu" | "cuda";

  readonly structureDevice:
    "cpu" | "cuda";
}
