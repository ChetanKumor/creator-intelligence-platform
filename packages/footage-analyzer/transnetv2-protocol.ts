import { z } from "zod";

export const TRANSNETV2_PROTOCOL_VERSION =
  "1.0.0" as const;

export const TRANSNETV2_ADAPTER_VERSION =
  "transnetv2-detector-adapter-0.1.0" as const;

export const TRANSNETV2_SOURCE_COMMIT =
  "85cef72af9a916bdfd7cc94a670c9cdfbf12d1ed" as const;

export const TRANSNETV2_SOURCE_SHA256 =
  "f55b3a75727d1502438707ac15e8f6257a736817e713e2113e4b84176500ca65" as const;

export const TRANSNETV2_WEIGHT_SET_SHA256 =
  "00b40cfe38c3fd6fd6d278860d339eb347254e1559839688d870ad0389bf6d0a" as const;

const Sha256Schema =
  z.string().regex(/^[a-f0-9]{64}$/);

export const TransNetV2DetectionRequestSchema =
  z.strictObject({
    protocolVersion:
      z.literal(
        TRANSNETV2_PROTOCOL_VERSION,
      ),

    operation:
      z.literal("detect"),

    mediaPath:
      z.string().min(1).max(4096),

    ffmpegPath:
      z.string().min(1).max(4096),

    expectedFrameCount:
      z.number()
        .int()
        .positive()
        .max(72000),

    threshold:
      z.number()
        .finite()
        .min(0)
        .max(1),
  });

export const TransNetV2DetectionResponseSchema =
  z.strictObject({
    protocolVersion:
      z.literal(
        TRANSNETV2_PROTOCOL_VERSION,
      ),

    operation:
      z.literal("detect"),

    toolVersion:
      z.literal(
        TRANSNETV2_ADAPTER_VERSION,
      ),

    model:
      z.strictObject({
        provider:
          z.literal("transnetv2"),

        sourceCommit:
          z.literal(
            TRANSNETV2_SOURCE_COMMIT,
          ),

        sourceSha256:
          Sha256Schema,

        weightSetSha256:
          Sha256Schema,

        tensorflowVersion:
          z.string()
            .min(1)
            .max(80),

        device:
          z.literal("cuda"),

        gpuName:
          z.string()
            .min(1)
            .max(160),
      }),

    media:
      z.strictObject({
        expectedFrameCount:
          z.number()
            .int()
            .positive()
            .max(72000),

        decodedFrameCount:
          z.number()
            .int()
            .positive()
            .max(72000),
      }),

    config:
      z.strictObject({
        threshold:
          z.number()
            .finite()
            .min(0)
            .max(1),

        inputWidth:
          z.literal(48),

        inputHeight:
          z.literal(27),

        pixelFormat:
          z.literal("rgb24"),
      }),

    value:
      z.strictObject({
        cuts:
          z.array(
            z.number()
              .int()
              .positive(),
          )
            .max(999),

        sceneCount:
          z.number()
            .int()
            .positive()
            .max(1000),

        singlePredictionMin:
          z.number()
            .finite()
            .min(0)
            .max(1),

        singlePredictionMax:
          z.number()
            .finite()
            .min(0)
            .max(1),

        manyPredictionMin:
          z.number()
            .finite()
            .min(0)
            .max(1),

        manyPredictionMax:
          z.number()
            .finite()
            .min(0)
            .max(1),
      }),

    performance:
      z.strictObject({
        modelLoadSeconds:
          z.number()
            .finite()
            .nonnegative(),

        decodeSeconds:
          z.number()
            .finite()
            .nonnegative(),

        inferenceSeconds:
          z.number()
            .finite()
            .nonnegative(),
      }),
  })
  .superRefine(
    (
      response,
      ctx,
    ) => {
      if (
        response.media
          .decodedFrameCount !==
        response.media
          .expectedFrameCount
      ) {
        ctx.addIssue({
          code: "custom",
          path: [
            "media",
            "decodedFrameCount",
          ],
          message:
            "Decoded frame count must exactly match MediaTruth.",
        });
      }

      if (
        response.value.sceneCount !==
        response.value.cuts.length + 1
      ) {
        ctx.addIssue({
          code: "custom",
          path: [
            "value",
            "sceneCount",
          ],
          message:
            "Scene count must agree with cut count.",
        });
      }

      for (
        let index = 0;
        index <
        response.value.cuts.length;
        index += 1
      ) {
        const cut =
          response.value.cuts[index]!;

        if (
          cut >=
          response.media
            .expectedFrameCount
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "value",
              "cuts",
              index,
            ],
            message:
              "Cut is outside the decoded frame timeline.",
          });
        }

        if (
          index > 0 &&
          cut <=
          response.value
            .cuts[index - 1]!
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "value",
              "cuts",
              index,
            ],
            message:
              "Cut indices must increase strictly.",
          });
        }
      }
    },
  );

export const TransNetV2DetectionFailureSchema =
  z.strictObject({
    protocolVersion:
      z.literal(
        TRANSNETV2_PROTOCOL_VERSION,
      ),

    error:
      z.strictObject({
        stage:
          z.literal("detect"),

        code:
          z.enum([
            "MEDIA_UNREADABLE",
            "FRAME_COUNT_MISMATCH",
            "MODEL_PROVENANCE_INVALID",
            "CUDA_UNAVAILABLE",
            "TRANSNET_ANALYSIS_FAILED",
            "INTERCHANGE_INVALID",
          ]),

        diagnostic:
          z.literal(
            "Local TransNetV2 detection failed.",
          ),
      }),
  });

export type TransNetV2DetectionRequest =
  z.infer<
    typeof TransNetV2DetectionRequestSchema
  >;

export type TransNetV2DetectionResponse =
  z.infer<
    typeof TransNetV2DetectionResponseSchema
  >;
