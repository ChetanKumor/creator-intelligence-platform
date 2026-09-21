import { z } from "zod";

export const SPEECH_PROTOCOL_VERSION =
  "1.0.0";

export const SPEECH_ADAPTER_VERSION =
  "faster-whisper-adapter-0.1.0";

export const SPEECH_MODEL_REPO =
  "Systran/faster-whisper-small";

export const SPEECH_MODEL_REVISION =
  "536b0662742c02347bc0e980a01041f333bce120";

export const SPEECH_MODEL_BIN_SHA256 =
  "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671";

export const SPEECH_MODEL_SET_SHA256 =
  "1327706b2cad006266912ab307bcf5903f768c066af00dbc7c7b434cb2664d3b";

const Sha256Schema =
  z.string().regex(/^[a-f0-9]{64}$/);

const LanguageSchema =
  z.string().regex(
    /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
  );

const SecondsSchema =
  z.number().finite().nonnegative();

export const SpeechAnalysisRequestSchema =
  z.strictObject({
    protocolVersion:
      z.literal(SPEECH_PROTOCOL_VERSION),

    operation:
      z.literal("transcribe"),

    mediaPath:
      z.string().min(1).max(4096),

    modelDirectory:
      z.string().min(1).max(4096),

    device:
      z.enum(["cpu", "cuda"]),

    computeType:
      z.enum([
        "float16",
        "float32",
        "int8",
        "int8_float16",
        "int8_float32",
      ]),

    language:
      LanguageSchema.nullable(),
  });

export const SpeechRegionSchema =
  z.strictObject({
    startSeconds:
      SecondsSchema,

    endSeconds:
      z.number().finite().positive(),

    text:
      z.string().min(1).max(4000),

    confidence:
      z.number()
        .finite()
        .min(0)
        .max(1)
        .nullable(),
  });

export const SpeechAnalysisResponseSchema =
  z.strictObject({
    protocolVersion:
      z.literal(SPEECH_PROTOCOL_VERSION),

    operation:
      z.literal("transcribe"),

    toolVersion:
      z.literal(SPEECH_ADAPTER_VERSION),

    model: z.strictObject({
      provider:
        z.literal("faster-whisper"),

      packageVersion:
        z.string().min(1).max(80),

      ctranslate2Version:
        z.string().min(1).max(80),

      repository:
        z.literal(SPEECH_MODEL_REPO),

      revision:
        z.literal(SPEECH_MODEL_REVISION),

      modelBinSha256:
        z.literal(SPEECH_MODEL_BIN_SHA256),

      modelSetSha256:
        z.literal(SPEECH_MODEL_SET_SHA256),

      device:
        z.enum(["cpu", "cuda"]),

      computeType:
        z.enum([
          "float16",
          "float32",
          "int8",
          "int8_float16",
          "int8_float32",
        ]),
    }),

    media: z.strictObject({
      sha256:
        Sha256Schema,

      durationSeconds:
        z.number()
          .finite()
          .positive()
          .max(86400),
    }),

    value: z.strictObject({
      language:
        LanguageSchema.nullable(),

      languageProbability:
        z.number()
          .finite()
          .min(0)
          .max(1)
          .nullable(),

      regions:
        z.array(
          SpeechRegionSchema,
        ).max(10000),
    }),

    performance: z.strictObject({
      modelLoadSeconds:
        z.number()
          .finite()
          .nonnegative(),

      inferenceSeconds:
        z.number()
          .finite()
          .positive(),

      realtimeFactor:
        z.number()
          .finite()
          .positive()
          .nullable(),
    }),
  }).superRefine((result, ctx) => {
    const regions =
      result.value.regions;

    const duration =
      result.media.durationSeconds;

    for (
      let index = 0;
      index < regions.length;
      index += 1
    ) {
      const region =
        regions[index]!;

      if (
        region.endSeconds <=
        region.startSeconds
      ) {
        ctx.addIssue({
          code: "custom",
          path: [
            "value",
            "regions",
            index,
          ],
          message:
            "Speech region must have positive duration.",
        });
      }

      if (
        region.endSeconds >
        duration + 1e-6
      ) {
        ctx.addIssue({
          code: "custom",
          path: [
            "value",
            "regions",
            index,
          ],
          message:
            "Speech region is outside analyzed media.",
        });
      }

      if (
        index > 0 &&
        region.startSeconds <
          regions[index - 1]!
            .endSeconds - 1e-6
      ) {
        ctx.addIssue({
          code: "custom",
          path: [
            "value",
            "regions",
            index,
          ],
          message:
            "Speech regions must be ordered and non-overlapping.",
        });
      }
    }
  });

export const SpeechAnalysisFailureSchema =
  z.strictObject({
    protocolVersion:
      z.literal(SPEECH_PROTOCOL_VERSION),

    error: z.strictObject({
      stage:
        z.literal("speech"),

      code: z.enum([
        "MEDIA_UNREADABLE",
        "MODEL_UNREADABLE",
        "MODEL_IDENTITY_MISMATCH",
        "CUDA_UNAVAILABLE",
        "CUDA_RUNTIME_UNAVAILABLE",
        "NO_SPEECH",
        "SEGMENTS_INVALID",
        "SPEECH_ANALYSIS_FAILED",
      ]),

      diagnostic:
        z.literal(
          "Local speech analysis failed.",
        ),
    }),
  });

export type SpeechAnalysisRequest =
  z.infer<
    typeof SpeechAnalysisRequestSchema
  >;

export type SpeechAnalysisResponse =
  z.infer<
    typeof SpeechAnalysisResponseSchema
  >;

export type SpeechAnalysisFailure =
  z.infer<
    typeof SpeechAnalysisFailureSchema
  >;
