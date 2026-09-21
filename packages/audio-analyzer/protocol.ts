import { z } from "zod";

export const AUDIO_PROTOCOL_VERSION = "1.0.0";
export const BEAT_ADAPTER_VERSION = "beat-this-adapter-0.1.0";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const SecondsSchema = z.number().finite().nonnegative();

export const BeatAnalysisRequestSchema = z.strictObject({
  protocolVersion: z.literal(AUDIO_PROTOCOL_VERSION),
  operation: z.literal("beats"),
  audioPath: z.string().min(1).max(4096),
  checkpointPath: z.string().min(1).max(4096),
  device: z.enum(["cpu", "cuda"]),
});

export type BeatAnalysisRequest =
  z.infer<typeof BeatAnalysisRequestSchema>;

const BeatModelSchema = z.strictObject({
  provider: z.literal("beat-this"),
  packageVersion: z.string().min(1).max(80),
  checkpointSha256: Sha256Schema,
  device: z.enum(["cpu", "cuda"]),
  torchVersion: z.string().min(1).max(80),
  cudaRuntime: z.string().min(1).max(80).nullable(),
});

const BeatAudioEvidenceSchema = z.strictObject({
  sha256: Sha256Schema,
  durationSeconds: z.number().finite().positive().max(86400),
  sampleRate: z.number().int().positive().max(384000),
  channels: z.number().int().positive().max(32),
  peak: z.number().finite().nonnegative(),
  rms: z.number().finite().nonnegative(),
});

const BeatValueSchema = z.strictObject({
  bpm: z.number().finite().min(20).max(400).nullable(),
  beatsSeconds: z.array(SecondsSchema).max(50000),
  downbeatsSeconds: z.array(SecondsSchema).max(15000),
});

const PerformanceSchema = z.strictObject({
  modelLoadSeconds: z.number().finite().nonnegative(),
  inferenceSeconds: z.number().finite().positive(),
  realtimeFactor: z.number().finite().positive().nullable(),
});

export const BeatAnalysisResponseSchema = z.strictObject({
  protocolVersion: z.literal(AUDIO_PROTOCOL_VERSION),
  operation: z.literal("beats"),
  toolVersion: z.literal(BEAT_ADAPTER_VERSION),
  model: BeatModelSchema,
  audio: BeatAudioEvidenceSchema,
  value: BeatValueSchema,
  performance: PerformanceSchema,
}).superRefine((result, ctx) => {
  const beats = result.value.beatsSeconds;
  const downbeats = result.value.downbeatsSeconds;
  const duration = result.audio.durationSeconds;

  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i]!;
    if (beat > duration) {
      ctx.addIssue({
        code: "custom",
        path: ["value", "beatsSeconds", i],
        message: "Beat is outside the analyzed audio.",
      });
    }

    if (i > 0 && beat <= beats[i - 1]!) {
      ctx.addIssue({
        code: "custom",
        path: ["value", "beatsSeconds", i],
        message: "Beats must be strictly increasing.",
      });
    }
  }

  for (let i = 0; i < downbeats.length; i += 1) {
    const downbeat = downbeats[i]!;

    if (downbeat > duration) {
      ctx.addIssue({
        code: "custom",
        path: ["value", "downbeatsSeconds", i],
        message: "Downbeat is outside the analyzed audio.",
      });
    }

    if (i > 0 && downbeat <= downbeats[i - 1]!) {
      ctx.addIssue({
        code: "custom",
        path: ["value", "downbeatsSeconds", i],
        message: "Downbeats must be strictly increasing.",
      });
    }

    if (!beats.some((beat) => Math.abs(beat - downbeat) <= 1e-6)) {
      ctx.addIssue({
        code: "custom",
        path: ["value", "downbeatsSeconds", i],
        message: "Every downbeat must resolve to a detected beat.",
      });
    }
  }

  if (result.audio.peak <= 0 || result.audio.rms <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["audio"],
      message: "Successful beat analysis cannot claim silent audio.",
    });
  }
});

export const BeatAnalysisFailureSchema = z.strictObject({
  protocolVersion: z.literal(AUDIO_PROTOCOL_VERSION),
  error: z.strictObject({
    stage: z.literal("beats"),
    code: z.enum([
      "AUDIO_UNREADABLE",
      "CHECKPOINT_UNREADABLE",
      "AUDIO_SILENT",
      "CUDA_UNAVAILABLE",
      "NO_BEATS",
      "BEATS_NOT_MONOTONIC",
      "DOWNBEATS_NOT_MONOTONIC",
      "BEATS_OUT_OF_BOUNDS",
      "DOWNBEATS_OUT_OF_BOUNDS",
      "BEAT_ANALYSIS_FAILED",
    ]),
    diagnostic: z.literal("Local beat analysis failed."),
  }),
});

export type BeatAnalysisResponse =
  z.infer<typeof BeatAnalysisResponseSchema>;

export type BeatAnalysisFailure =
  z.infer<typeof BeatAnalysisFailureSchema>;


export const ENERGY_ADAPTER_VERSION =
  "rms-energy-adapter-0.1.0";

export const ENERGY_ALGORITHM_VERSION =
  "rms-db-p10-p95-v1";

export const EnergyAnalysisRequestSchema = z.strictObject({
  protocolVersion: z.literal(AUDIO_PROTOCOL_VERSION),
  operation: z.literal("energy"),
  audioPath: z.string().min(1).max(4096),
});

export const EnergyAnalysisResponseSchema = z.strictObject({
  protocolVersion: z.literal(AUDIO_PROTOCOL_VERSION),
  operation: z.literal("energy"),
  toolVersion: z.literal(ENERGY_ADAPTER_VERSION),

  audio: z.strictObject({
    sha256: Sha256Schema,
    durationSeconds: z.number().finite().positive().max(86400),
    sampleRate: z.number().int().positive().max(384000),
    channels: z.number().int().positive().max(32),
    peak: z.number().finite().nonnegative(),
    rms: z.number().finite().nonnegative(),
  }),

  config: z.strictObject({
    version: z.literal(ENERGY_ALGORITHM_VERSION),
    windowSeconds: z.literal(0.5),
    hopSeconds: z.literal(0.5),
  }),

  normalization: z.strictObject({
    lowDbfs: z.number().finite(),
    highDbfs: z.number().finite(),
    flat: z.boolean(),
  }),

  value: z.strictObject({
    energy: z.array(
      z.strictObject({
        atSeconds: SecondsSchema,
        energy: z.number().finite().min(0).max(1),
      }),
    ).min(1).max(50000),
  }),

  performance: z.strictObject({
    analysisSeconds: z.number().finite().positive(),
    realtimeFactor: z.number().finite().positive().nullable(),
  }),
}).superRefine((result, ctx) => {
  const points = result.value.energy;
  const duration = result.audio.durationSeconds;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;

    if (point.atSeconds > duration) {
      ctx.addIssue({
        code: "custom",
        path: ["value", "energy", index, "atSeconds"],
        message: "Energy timestamp is outside analyzed audio.",
      });
    }

    if (
      index > 0 &&
      point.atSeconds <= points[index - 1]!.atSeconds
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["value", "energy", index, "atSeconds"],
        message: "Energy timestamps must increase strictly.",
      });
    }
  }

  if (result.audio.peak <= 0 || result.audio.rms <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["audio"],
      message: "Successful energy analysis cannot claim silent audio.",
    });
  }
});

export const EnergyAnalysisFailureSchema = z.strictObject({
  protocolVersion: z.literal(AUDIO_PROTOCOL_VERSION),
  error: z.strictObject({
    stage: z.literal("energy"),
    code: z.enum([
      "AUDIO_UNREADABLE",
      "AUDIO_SILENT",
      "ENERGY_ANALYSIS_FAILED",
    ]),
    diagnostic: z.literal("Local energy analysis failed."),
  }),
});

export type EnergyAnalysisRequest =
  z.infer<typeof EnergyAnalysisRequestSchema>;

export type EnergyAnalysisResponse =
  z.infer<typeof EnergyAnalysisResponseSchema>;

export type EnergyAnalysisFailure =
  z.infer<typeof EnergyAnalysisFailureSchema>;


export const STRUCTURE_ADAPTER_VERSION =
  "allin1-structure-adapter-0.1.0";

export const STRUCTURE_MODEL_NAME =
  "harmonix-all";

export const StructureAnalysisRequestSchema =
  z.strictObject({
    protocolVersion:
      z.literal(AUDIO_PROTOCOL_VERSION),

    operation:
      z.literal("structure"),

    audioPath:
      z.string().min(1).max(4096),

    device:
      z.enum(["cpu", "cuda"]),
  });

export const StructureAnalysisResponseSchema =
  z.strictObject({
    protocolVersion:
      z.literal(AUDIO_PROTOCOL_VERSION),

    operation:
      z.literal("structure"),

    toolVersion:
      z.literal(STRUCTURE_ADAPTER_VERSION),

    model: z.strictObject({
      provider:
        z.literal("all-in-one"),

      packageVersion:
        z.string().min(1).max(80),

      modelName:
        z.literal(STRUCTURE_MODEL_NAME),

      checkpointCount:
        z.literal(8),

      checkpointSetSha256:
        Sha256Schema,

      checkpoints:
        z.array(
          z.strictObject({
            filename:
              z.string().min(1).max(160),

            sha256:
              Sha256Schema,
          }),
        ).length(8),

      device:
        z.enum(["cpu", "cuda"]),

      torchVersion:
        z.string().min(1).max(80),

      cudaRuntime:
        z.string().min(1).max(80).nullable(),
    }),

    audio: z.strictObject({
      sha256:
        Sha256Schema,

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

    value: z.strictObject({
      segments:
        z.array(
          z.strictObject({
            startSeconds:
              SecondsSchema,

            endSeconds:
              SecondsSchema,

            label:
              z.string()
                .min(1)
                .max(40),
          }),
        )
          .min(1)
          .max(2048),
    }),

    performance: z.strictObject({
      analysisSeconds:
        z.number()
          .finite()
          .positive(),
    }),
  })
  .superRefine((result, ctx) => {
    const segments =
      result.value.segments;

    const duration =
      result.audio.durationSeconds;

    for (
      let index = 0;
      index < segments.length;
      index += 1
    ) {
      const segment =
        segments[index]!;

      if (
        segment.endSeconds <=
        segment.startSeconds
      ) {
        ctx.addIssue({
          code: "custom",
          path: [
            "value",
            "segments",
            index,
          ],
          message:
            "Structure segment must have positive duration.",
        });
      }

      if (
        segment.endSeconds >
        duration + 0.25
      ) {
        ctx.addIssue({
          code: "custom",
          path: [
            "value",
            "segments",
            index,
            "endSeconds",
          ],
          message:
            "Structure segment exceeds audio duration tolerance.",
        });
      }

      if (index > 0) {
        const previous =
          segments[index - 1]!;

        if (
          segment.startSeconds + 0.05 <
          previous.endSeconds
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "value",
              "segments",
              index,
              "startSeconds",
            ],
            message:
              "Structure segments overlap.",
          });
        }

        if (
          segment.startSeconds <
          previous.startSeconds
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "value",
              "segments",
              index,
              "startSeconds",
            ],
            message:
              "Structure segments must be ordered.",
          });
        }
      }
    }

    const first = segments[0];
    const last =
      segments[segments.length - 1];

    if (
      first !== undefined &&
      first.startSeconds > 0.25
    ) {
      ctx.addIssue({
        code: "custom",
        path: [
          "value",
          "segments",
          0,
          "startSeconds",
        ],
        message:
          "Structure analysis must cover track start.",
      });
    }

    if (
      last !== undefined &&
      last.endSeconds <
      duration - 0.25
    ) {
      ctx.addIssue({
        code: "custom",
        path: [
          "value",
          "segments",
          segments.length - 1,
          "endSeconds",
        ],
        message:
          "Structure analysis must cover track end.",
      });
    }
  });

export const StructureAnalysisFailureSchema =
  z.strictObject({
    protocolVersion:
      z.literal(AUDIO_PROTOCOL_VERSION),

    error: z.strictObject({
      stage:
        z.literal("structure"),

      code: z.enum([
        "AUDIO_UNREADABLE",
        "CHECKPOINT_SET_INVALID",
        "CUDA_UNAVAILABLE",
        "STRUCTURE_EMPTY",
        "STRUCTURE_INVALID",
        "STRUCTURE_ANALYSIS_FAILED",
      ]),

      diagnostic:
        z.literal(
          "Local structure analysis failed.",
        ),
    }),
  });

export type StructureAnalysisRequest =
  z.infer<
    typeof StructureAnalysisRequestSchema
  >;

export type StructureAnalysisResponse =
  z.infer<
    typeof StructureAnalysisResponseSchema
  >;

export type StructureAnalysisFailure =
  z.infer<
    typeof StructureAnalysisFailureSchema
  >;
