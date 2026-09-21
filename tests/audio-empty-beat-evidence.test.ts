import assert from "node:assert/strict";
import test from "node:test";

import {
  BEAT_ADAPTER_VERSION,
  BEAT_THIS_FINAL0_SHA256,
  ENERGY_ADAPTER_VERSION,
  ENERGY_ALGORITHM_VERSION,
  BeatAnalysisResponseSchema,
  combineMusicPrimitives,
} from "../packages/audio-analyzer/index.js";


const AUDIO_SHA =
  "a".repeat(64);


function emptyBeatEvidence() {
  return {
    protocolVersion:
      "1.0.0" as const,

    operation:
      "beats" as const,

    toolVersion:
      BEAT_ADAPTER_VERSION,

    model: {
      provider:
        "beat-this" as const,

      packageVersion:
        "1.1.0",

      checkpointSha256:
        BEAT_THIS_FINAL0_SHA256,

      device:
        "cuda" as const,

      torchVersion:
        "2.3.1+cu121",

      cudaRuntime:
        "12.1",
    },

    audio: {
      sha256:
        AUDIO_SHA,

      durationSeconds:
        13.523604166666667,

      sampleRate:
        48000,

      channels:
        2,

      peak:
        0.5,

      rms:
        0.1,
    },

    value: {
      bpm:
        null,

      beatsSeconds:
        [],

      downbeatsSeconds:
        [],
    },

    performance: {
      modelLoadSeconds:
        1,

      inferenceSeconds:
        1,

      realtimeFactor:
        13.5,
    },
  };
}


function energyEvidence() {
  return {
    protocolVersion:
      "1.0.0" as const,

    operation:
      "energy" as const,

    toolVersion:
      ENERGY_ADAPTER_VERSION as
        typeof ENERGY_ADAPTER_VERSION,

    audio: {
      sha256:
        AUDIO_SHA,

      durationSeconds:
        13.523604166666667,

      sampleRate:
        48000,

      channels:
        2,

      peak:
        0.5,

      rms:
        0.1,
    },

    config: {
      version:
        ENERGY_ALGORITHM_VERSION as
          typeof ENERGY_ALGORITHM_VERSION,

      windowSeconds:
        0.5 as const,

      hopSeconds:
        0.5 as const,
    },

    normalization: {
      lowDbfs:
        -40,

      highDbfs:
        -6,

      flat:
        false,
    },

    value: {
      energy: [
        {
          atSeconds:
            0.25,

          energy:
            0.5,
        },
      ],
    },

    performance: {
      analysisSeconds:
        0.1,

      realtimeFactor:
        135,
    },
  };
}


test(
  "preserves non-silent no-beat inference as successful nullable evidence",
  () => {
    const beat =
      BeatAnalysisResponseSchema.parse(
        emptyBeatEvidence(),
      );

    assert.equal(
      beat.value.bpm,
      null,
    );

    assert.deepEqual(
      beat.value.beatsSeconds,
      [],
    );

    assert.deepEqual(
      beat.value.downbeatsSeconds,
      [],
    );

    const primitives =
      combineMusicPrimitives(
        beat,
        energyEvidence(),
      );

    assert.equal(
      primitives.beat.bpm,
      null,
    );

    assert.deepEqual(
      primitives.beat.beatsSeconds,
      [],
    );

    assert.deepEqual(
      primitives.beat.downbeatsSeconds,
      [],
    );
  },
);


test(
  "still rejects a downbeat when no corresponding beat exists",
  () => {
    const invalid = {
      ...emptyBeatEvidence(),

      value: {
        bpm:
          null,

        beatsSeconds:
          [],

        downbeatsSeconds: [
          1,
        ],
      },
    };

    assert.equal(
      BeatAnalysisResponseSchema
        .safeParse(invalid)
        .success,
      false,
    );
  },
);
