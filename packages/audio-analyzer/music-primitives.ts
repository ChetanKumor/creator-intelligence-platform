import { z } from "zod";

import {
  BEAT_ADAPTER_VERSION,
  ENERGY_ADAPTER_VERSION,
  ENERGY_ALGORITHM_VERSION,
  BeatAnalysisResponseSchema,
  EnergyAnalysisResponseSchema,
  type BeatAnalysisResponse,
  type EnergyAnalysisResponse,
} from "./protocol.js";

import {
  BEAT_THIS_FINAL0_SHA256,
  LocalBeatAnalysisProvider,
} from "./beat.js";

import {
  LocalEnergyAnalysisProvider,
} from "./energy.js";

export const MUSIC_PRIMITIVE_VERSION = "0.1.0";

const Sha256Schema =
  z.string().regex(/^[a-f0-9]{64}$/);

const SecondsSchema =
  z.number().finite().nonnegative();

export const MusicPrimitiveAnalysisSchema =
  z.strictObject({
    contractType:
      z.literal("MusicPrimitiveAnalysis"),

    schemaVersion:
      z.literal(MUSIC_PRIMITIVE_VERSION),

    audio: z.strictObject({
      sha256: Sha256Schema,

      durationSeconds:
        z.number()
          .finite()
          .positive()
          .max(86400),

      sampleRate:
        z.number()
          .int()
          .positive()
          .max(384000),

      channels:
        z.number()
          .int()
          .positive()
          .max(32),
    }),

    beat: z.strictObject({
      adapterVersion:
        z.literal(BEAT_ADAPTER_VERSION),

      provider:
        z.literal("beat-this"),

      packageVersion:
        z.string()
          .min(1)
          .max(80),

      checkpointSha256:
        z.literal(
          BEAT_THIS_FINAL0_SHA256,
        ),

      device:
        z.enum(["cpu", "cuda"]),

      bpm:
        z.number()
          .finite()
          .min(20)
          .max(400)
          .nullable(),

      beatsSeconds:
        z.array(SecondsSchema)
          .min(1)
          .max(50000),

      downbeatsSeconds:
        z.array(SecondsSchema)
          .max(15000),
    }),

    energy: z.strictObject({
      adapterVersion:
        z.literal(ENERGY_ADAPTER_VERSION),

      algorithmVersion:
        z.literal(
          ENERGY_ALGORITHM_VERSION,
        ),

      windowSeconds:
        z.literal(0.5),

      hopSeconds:
        z.literal(0.5),

      normalization: z.strictObject({
        lowDbfs:
          z.number().finite(),

        highDbfs:
          z.number().finite(),

        flat:
          z.boolean(),
      }),

      points:
        z.array(
          z.strictObject({
            atSeconds:
              SecondsSchema,

            energy:
              z.number()
                .finite()
                .min(0)
                .max(1),
          }),
        )
          .min(1)
          .max(50000),
    }),
  })
  .superRefine((analysis, ctx) => {
    const duration =
      analysis.audio.durationSeconds;

    for (
      let index = 0;
      index <
      analysis.beat.beatsSeconds.length;
      index += 1
    ) {
      const value =
        analysis.beat.beatsSeconds[
          index
        ]!;

      if (value > duration) {
        ctx.addIssue({
          code: "custom",
          path: [
            "beat",
            "beatsSeconds",
            index,
          ],
          message:
            "Beat exceeds audio duration.",
        });
      }
    }

    for (
      let index = 0;
      index <
      analysis.energy.points.length;
      index += 1
    ) {
      const value =
        analysis.energy.points[
          index
        ]!.atSeconds;

      if (value > duration) {
        ctx.addIssue({
          code: "custom",
          path: [
            "energy",
            "points",
            index,
          ],
          message:
            "Energy point exceeds audio duration.",
        });
      }
    }
  });

export type MusicPrimitiveAnalysis =
  z.infer<
    typeof MusicPrimitiveAnalysisSchema
  >;

export function combineMusicPrimitives(
  beatRaw: BeatAnalysisResponse,
  energyRaw: EnergyAnalysisResponse,
): MusicPrimitiveAnalysis {
  const beat =
    BeatAnalysisResponseSchema.parse(
      beatRaw,
    );

  const energy =
    EnergyAnalysisResponseSchema.parse(
      energyRaw,
    );

  if (
    beat.audio.sha256 !==
    energy.audio.sha256
  ) {
    throw new Error(
      "AUDIO_IDENTITY_MISMATCH",
    );
  }

  if (
    Math.abs(
      beat.audio.durationSeconds -
      energy.audio.durationSeconds,
    ) > 1e-6
  ) {
    throw new Error(
      "AUDIO_DURATION_MISMATCH",
    );
  }

  if (
    beat.audio.sampleRate !==
      energy.audio.sampleRate ||
    beat.audio.channels !==
      energy.audio.channels
  ) {
    throw new Error(
      "AUDIO_FORMAT_MISMATCH",
    );
  }

  return MusicPrimitiveAnalysisSchema.parse({
    contractType:
      "MusicPrimitiveAnalysis",

    schemaVersion:
      MUSIC_PRIMITIVE_VERSION,

    audio: {
      sha256:
        beat.audio.sha256,

      durationSeconds:
        beat.audio.durationSeconds,

      sampleRate:
        beat.audio.sampleRate,

      channels:
        beat.audio.channels,
    },

    beat: {
      adapterVersion:
        beat.toolVersion,

      provider:
        beat.model.provider,

      packageVersion:
        beat.model.packageVersion,

      checkpointSha256:
        beat.model.checkpointSha256,

      device:
        beat.model.device,

      bpm:
        beat.value.bpm,

      beatsSeconds:
        beat.value.beatsSeconds,

      downbeatsSeconds:
        beat.value.downbeatsSeconds,
    },

    energy: {
      adapterVersion:
        energy.toolVersion,

      algorithmVersion:
        energy.config.version,

      windowSeconds:
        energy.config.windowSeconds,

      hopSeconds:
        energy.config.hopSeconds,

      normalization:
        energy.normalization,

      points:
        energy.value.energy,
    },
  });
}

export interface MusicPrimitiveInput {
  readonly audioPath: string;
  readonly checkpointPath: string;
  readonly device: "cpu" | "cuda";
}

export interface LocalMusicPrimitiveLaunch {
  readonly projectRootWsl: string;
  readonly pythonPath: string;
}

export class LocalMusicPrimitiveProvider {
  private readonly beat:
    LocalBeatAnalysisProvider;

  private readonly energy:
    LocalEnergyAnalysisProvider;

  constructor(
    config: LocalMusicPrimitiveLaunch,
  ) {
    this.beat =
      new LocalBeatAnalysisProvider({
        projectRootWsl:
          config.projectRootWsl,

        pythonPath:
          config.pythonPath,

        timeoutMilliseconds:
          180_000,
      });

    this.energy =
      new LocalEnergyAnalysisProvider({
        projectRootWsl:
          config.projectRootWsl,

        pythonPath:
          config.pythonPath,

        timeoutMilliseconds:
          60_000,
      });
  }

  async analyze(
    input: MusicPrimitiveInput,
  ): Promise<MusicPrimitiveAnalysis> {
    const beat =
      await this.beat.analyze({
        protocolVersion: "1.0.0",
        operation: "beats",
        audioPath:
          input.audioPath,
        checkpointPath:
          input.checkpointPath,
        device:
          input.device,
      });

    const energy =
      await this.energy.analyze({
        protocolVersion: "1.0.0",
        operation: "energy",
        audioPath:
          input.audioPath,
      });

    return combineMusicPrimitives(
      beat,
      energy,
    );
  }

  async close(): Promise<void> {
    await this.beat.close();
    await this.energy.close();
  }
}
