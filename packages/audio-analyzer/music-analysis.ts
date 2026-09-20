import {
  z,
} from "zod";

import {
  MusicPrimitiveAnalysisSchema,
  LocalMusicPrimitiveProvider,
  type MusicPrimitiveAnalysis,
} from "./music-primitives.js";

import {
  StructureAnalysisResponseSchema,
  type StructureAnalysisResponse,
} from "./protocol.js";

import {
  LocalStructureAnalysisProvider,
} from "./structure.js";


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


export interface LocalMusicAnalysisLaunch {
  readonly projectRootWsl:
    string;

  readonly primitivePythonPath:
    string;

  readonly structurePythonPath:
    string;

  readonly structureModelDirectoryWsl:
    string;

  readonly structureWorkDirectoryWsl:
    string;
}


/*
 * One heavy CUDA model at a time.
 *
 * Primitive provider owns Beat This.
 * It is fully closed before All-In-One
 * is launched.
 *
 * This intentionally trades some model
 * reload latency for bounded 6 GB VRAM
 * behavior during the first production
 * architecture.
 */
export class LocalMusicAnalysisProvider {
  constructor(
    private readonly config:
      LocalMusicAnalysisLaunch,
  ) {}

  async analyze(
    input:
      MusicAnalysisInput,
  ): Promise<
    MusicAnalysis
  > {
    const primitiveProvider =
      new LocalMusicPrimitiveProvider({
        projectRootWsl:
          this.config
            .projectRootWsl,

        pythonPath:
          this.config
            .primitivePythonPath,
      });

    let primitives:
      MusicPrimitiveAnalysis;

    try {
      primitives =
        await primitiveProvider
          .analyze({
            audioPath:
              input.audioPath,

            checkpointPath:
              input
                .beatCheckpointPath,

            device:
              input.beatDevice,
          });

    } finally {
      await primitiveProvider
        .close();
    }

    const structureProvider =
      new LocalStructureAnalysisProvider({
        projectRootWsl:
          this.config
            .projectRootWsl,

        pythonPath:
          this.config
            .structurePythonPath,

        modelDirectoryWsl:
          this.config
            .structureModelDirectoryWsl,

        workDirectoryWsl:
          this.config
            .structureWorkDirectoryWsl,

        timeoutMilliseconds:
          300_000,
      });

    let structure:
      StructureAnalysisResponse;

    try {
      structure =
        await structureProvider
          .analyze({
            protocolVersion:
              "1.0.0",

            operation:
              "structure",

            audioPath:
              input.audioPath,

            device:
              input.structureDevice,
          });

    } finally {
      await structureProvider
        .close();
    }

    return combineMusicAnalysis(
      primitives,
      structure,
    );
  }
}
