import assert from "node:assert/strict";
import test from "node:test";

import {
  SPEECH_ADAPTER_VERSION,
  SPEECH_MODEL_BIN_SHA256,
  SPEECH_MODEL_REPO,
  SPEECH_MODEL_REVISION,
  SPEECH_MODEL_SET_SHA256,
  SPEECH_PROTOCOL_VERSION,
  SpeechAnalysisFailureSchema,
  SpeechAnalysisResponseSchema,
} from "../packages/audio-analyzer/speech-protocol.js";

const base = {
  protocolVersion:
    SPEECH_PROTOCOL_VERSION,

  operation:
    "transcribe" as const,

  toolVersion:
    SPEECH_ADAPTER_VERSION,

  model: {
    provider:
      "faster-whisper" as const,

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
      "cuda" as const,

    computeType:
      "float16" as const,
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
      {
        startSeconds:
          2,

        endSeconds:
          3,

        text:
          "Second region.",

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

test(
  "accepts a valid owned speech response",
  () => {
    assert.equal(
      SpeechAnalysisResponseSchema
        .parse(base)
        .value.regions.length,
      2,
    );
  },
);

test(
  "rejects overlapping speech regions",
  () => {
    const invalid = {
      ...base,

      value: {
        ...base.value,

        regions: [
          base.value.regions[0],
          {
            ...base.value.regions[1],
            startSeconds: 1,
          },
        ],
      },
    };

    assert.equal(
      SpeechAnalysisResponseSchema
        .safeParse(invalid)
        .success,
      false,
    );
  },
);

test(
  "rejects speech outside media duration",
  () => {
    const invalid = {
      ...base,

      value: {
        ...base.value,

        regions: [
          {
            ...base.value.regions[0],
            endSeconds: 11,
          },
        ],
      },
    };

    assert.equal(
      SpeechAnalysisResponseSchema
        .safeParse(invalid)
        .success,
      false,
    );
  },
);

test(
  "accepts sanitized speech failure",
  () => {
    const result =
      SpeechAnalysisFailureSchema.parse({
        protocolVersion:
          SPEECH_PROTOCOL_VERSION,

        error: {
          stage:
            "speech",

          code:
            "CUDA_UNAVAILABLE",

          diagnostic:
            "Local speech analysis failed.",
        },
      });

    assert.equal(
      result.error.code,
      "CUDA_UNAVAILABLE",
    );
  },
);
