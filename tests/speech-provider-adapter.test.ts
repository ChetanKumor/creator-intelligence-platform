import assert from "node:assert/strict";
import test from "node:test";

import {
  MediaAssetSchema,
} from "../packages/contracts/index.js";

import {
  SpeechProviderAdapter,
  type SpeechAnalysisProvider,
} from "../packages/audio-analyzer/speech.js";

import {
  SPEECH_ADAPTER_VERSION,
  SPEECH_MODEL_BIN_SHA256,
  SPEECH_MODEL_REPO,
  SPEECH_MODEL_REVISION,
  SPEECH_MODEL_SET_SHA256,
  SPEECH_PROTOCOL_VERSION,
  type SpeechAnalysisRequest,
  type SpeechAnalysisResponse,
} from "../packages/audio-analyzer/speech-protocol.js";


const asset =
  MediaAssetSchema.parse({
    contractType:
      "MediaAsset",

    schemaVersion:
      "1.0.0",

    assetId:
      "asset_speech_test",

    projectId:
      "project_speech_test",

    creatorId:
      "creator_speech_test",

    kind:
      "video",

    objectId:
      "object_speech_test",

    durationSeconds:
      10,

    origin:
      "synthetic",

    retention: {
      expiresAt:
        null,

      deletionRequestedAt:
        null,
    },
  });


const context = {
  scope: {
    projectId:
      "project_speech_test",

    jobId:
      "job_speech_test",

    creatorId:
      "creator_speech_test",

    environment:
      "synthetic" as const,
  },

  operationId:
    "operation_speech_test",

  attempt:
    1,
};


function response():
  SpeechAnalysisResponse {
  return {
    protocolVersion:
      SPEECH_PROTOCOL_VERSION,

    operation:
      "transcribe",

    toolVersion:
      SPEECH_ADAPTER_VERSION,

    model: {
      provider:
        "faster-whisper",

      packageVersion:
        "1.2.1",

      ctranslate2Version:
        "4.8.2",

      repository:
        SPEECH_MODEL_REPO,

      revision:
        SPEECH_MODEL_REVISION,

      modelBinSha256:
        SPEECH_MODEL_BIN_SHA256,

      modelSetSha256:
        SPEECH_MODEL_SET_SHA256,

      device:
        "cuda",

      computeType:
        "float16",
    },

    media: {
      sha256:
        "a".repeat(64),

      durationSeconds:
        10,
    },

    value: {
      language:
        "en",

      languageProbability:
        0.99,

      regions: [
        {
          startSeconds:
            0,

          endSeconds:
            1.5,

          text:
            "Hello world.",

          confidence:
            null,
        },
      ],
    },

    performance: {
      modelLoadSeconds:
        1,

      inferenceSeconds:
        2,

      realtimeFactor:
        5,
    },
  };
}


test(
  "adapts owned speech analysis into the frozen SpeechProvider contract",
  async () => {
    let observed:
      SpeechAnalysisRequest |
      null = null;

    const analysis:
      SpeechAnalysisProvider = {
        async analyze(
          input,
        ) {
          observed =
            input;

          return response();
        },

        async close() {},
      };

    const times = [
      "2026-09-21T00:00:00.000Z",
      "2026-09-21T00:00:02.000Z",
    ];

    const provider =
      new SpeechProviderAdapter(
        analysis,

        async (
          resolvedAsset,
        ) => {
          assert.equal(
            resolvedAsset
              .objectId,
            "object_speech_test",
          );

          return (
            "/execution-only/" +
            "speech-test.mp4"
          );
        },

        {
          modelDirectory:
            "/models/pinned",

          device:
            "cuda",

          computeType:
            "float16",

          language:
            null,
        },

        {
          now() {
            const value =
              times.shift();

            assert.ok(value);

            return value;
          },
        },
      );

    const result =
      await provider.transcribe(
        asset,
        context,
      );

    assert.deepEqual(
      result.value,
      {
        assetId:
          "asset_speech_test",

        language:
          "en",

        regions: [
          {
            startSeconds:
              0,

            endSeconds:
              1.5,

            text:
              "Hello world.",

            confidence:
              null,
          },
        ],
      },
    );

    assert.deepEqual(
      observed,
      {
        protocolVersion:
          "1.0.0",

        operation:
          "transcribe",

        mediaPath:
          "/execution-only/speech-test.mp4",

        modelDirectory:
          "/models/pinned",

        device:
          "cuda",

        computeType:
          "float16",

        language:
          null,
      },
    );

    assert.equal(
      result.modelRun
        .provider,
      "local_speech",
    );

    assert.equal(
      result.modelRun
        .model,
      "faster-whisper-small",
    );

    assert.equal(
      result.modelRun
        .modelVersion,
      SPEECH_MODEL_REVISION,
    );

    assert.equal(
      result.modelRun
        .adapterVersion,
      SPEECH_ADAPTER_VERSION,
    );

    assert.equal(
      result.modelRun
        .operation,
      "speech",
    );

    assert.deepEqual(
      result.modelRun
        .inputIds,
      [
        "asset_speech_test",
      ],
    );

    assert.deepEqual(
      result.modelRun
        .outputIds,
      [],
    );

    assert.equal(
      result.modelRun
        .status,
      "succeeded",
    );
  },
);


test(
  "uses explicit language configuration without inventing a path from objectId",
  async () => {
    const analysis:
      SpeechAnalysisProvider = {
        async analyze(
          input,
        ) {
          assert.equal(
            input.language,
            "te",
          );

          assert.equal(
            input.mediaPath,
            "/resolved/by-owner.mp4",
          );

          return {
            ...response(),

            value: {
              ...response().value,

              language:
                "te",
            },
          };
        },

        async close() {},
      };

    const provider =
      new SpeechProviderAdapter(
        analysis,

        async () =>
          "/resolved/by-owner.mp4",

        {
          modelDirectory:
            "/models/pinned",

          device:
            "cuda",

          computeType:
            "float16",

          language:
            "te",
        },

        {
          now() {
            return (
              "2026-09-21T00:00:00.000Z"
            );
          },
        },
      );

    const result =
      await provider.transcribe(
        asset,
        context,
      );

    assert.equal(
      result.value.language,
      "te",
    );
  },
);


test(
  "propagates sanitized owned-worker failure codes",
  async () => {
    const analysis:
      SpeechAnalysisProvider = {
        async analyze() {
          throw new Error(
            "CUDA_UNAVAILABLE",
          );
        },

        async close() {},
      };

    const provider =
      new SpeechProviderAdapter(
        analysis,

        async () =>
          "/resolved/media.mp4",

        {
          modelDirectory:
            "/models/pinned",

          device:
            "cuda",

          computeType:
            "float16",

          language:
            null,
        },

        {
          now() {
            return (
              "2026-09-21T00:00:00.000Z"
            );
          },
        },
      );

    await assert.rejects(
      provider.transcribe(
        asset,
        context,
      ),

      /CUDA_UNAVAILABLE/,
    );
  },
);
