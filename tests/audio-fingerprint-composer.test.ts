import assert from "node:assert/strict";
import test from "node:test";

import {
  MediaAssetSchema,
} from "../packages/contracts/index.js";

import {
  AUDIO_FINGERPRINT_COMPOSER_VERSION,
  AUDIO_STRUCTURE_PROJECTION_POLICY,
  BEAT_THIS_FINAL0_SHA256,
  MUSIC_PRIMITIVE_VERSION,
  STRUCTURE_ADAPTER_VERSION,
  STRUCTURE_MODEL_NAME,
  combineMusicAnalysis,
  composeAudioFingerprint,
  type MusicAnalysis,
} from "../packages/audio-analyzer/index.js";

import type {
  Transcript,
} from "../packages/providers/index.js";


const SOURCE_SHA =
  "a".repeat(64);

const CHECKPOINT_SET_SHA =
  "b".repeat(64);


function asset(
  durationSeconds = 20,
) {
  return MediaAssetSchema.parse({
    contractType:
      "MediaAsset",

    schemaVersion:
      "1.0.0",

    assetId:
      "asset_audio_test",

    projectId:
      "project_audio_test",

    creatorId:
      "creator_audio_test",

    kind:
      "video",

    objectId:
      "object_audio_test",

    durationSeconds,

    origin:
      "synthetic",

    retention: {
      expiresAt:
        null,

      deletionRequestedAt:
        null,
    },
  });
}


function music(
  durationSeconds = 20,
): MusicAnalysis {
  return combineMusicAnalysis(
    {
      contractType:
        "MusicPrimitiveAnalysis",

      schemaVersion:
        MUSIC_PRIMITIVE_VERSION,

      audio: {
        sha256:
          SOURCE_SHA,

        durationSeconds,

        sampleRate:
          48000,

        channels:
          2,
      },

      beat: {
        adapterVersion:
          "beat-this-adapter-0.1.0",

        provider:
          "beat-this",

        packageVersion:
          "0.0-test",

        checkpointSha256:
          BEAT_THIS_FINAL0_SHA256,

        device:
          "cuda",

        bpm:
          120,

        beatsSeconds: [
          0.5,
          1,
          1.5,
          2,
        ],

        downbeatsSeconds: [
          0.5,
          1.5,
        ],
      },

      energy: {
        adapterVersion:
          "rms-energy-adapter-0.1.0",

        algorithmVersion:
          "rms-db-p10-p95-v1",

        windowSeconds:
          0.5,

        hopSeconds:
          0.5,

        normalization: {
          lowDbfs:
            -40,

          highDbfs:
            -6,

          flat:
            false,
        },

        points: [
          {
            atSeconds:
              0,

            energy:
              0.2,
          },

          {
            atSeconds:
              0.5,

            energy:
              0.7,
          },

          {
            atSeconds:
              1,

            energy:
              0.9,
          },
        ],
      },
    },

    {
      protocolVersion:
        "1.0.0",

      operation:
        "structure",

      toolVersion:
        STRUCTURE_ADAPTER_VERSION,

      model: {
        provider:
          "all-in-one",

        packageVersion:
          "0.0-test",

        modelName:
          STRUCTURE_MODEL_NAME,

        checkpointCount:
          8,

        checkpointSetSha256:
          CHECKPOINT_SET_SHA,

        checkpoints:
          Array.from(
            { length: 8 },
            (_, index) => ({
              filename:
                `checkpoint_${index}.pth`,

              sha256:
                String(index + 1)
                  .padStart(
                    64,
                    "0",
                  ),
            }),
          ),

        device:
          "cuda",

        torchVersion:
          "test",

        cudaRuntime:
          "test",
      },

      audio: {
        sha256:
          SOURCE_SHA,

        durationSeconds,

        sampleRate:
          48000,

        channels:
          2,
      },

      value: {
        segments: [
          {
            startSeconds:
              0,

            endSeconds:
              8,

            label:
              "intro",
          },

          {
            startSeconds:
              8,

            endSeconds:
              durationSeconds,

            label:
              "verse",
          },
        ],
      },

      performance: {
        analysisSeconds:
          1,
      },
    },
  );
}


function transcript(
  overrides:
    Partial<Transcript> = {},
): Transcript {
  return {
    assetId:
      "asset_audio_test",

    language:
      "en",

    regions: [
      {
        startSeconds:
          1,

        endSeconds:
          2,

        text:
          "Hello.",

        confidence:
          null,
      },

      {
        startSeconds:
          3,

        endSeconds:
          4.5,

        text:
          "World.",

        confidence:
          null,
      },
    ],

    ...overrides,
  };
}


const createdAt =
  "2026-09-21T00:00:00.000Z";


test(
  "composes the frozen AudioFingerprint without inventing drop or phrase semantics",
  () => {
    const result =
      composeAudioFingerprint({
        asset:
          asset(),

        music:
          music(),

        transcript:
          transcript(),

        modelRunIds: [
          "run_music_test",
          "run_speech_test",
        ],

        createdAt,
      });

    assert.equal(
      result.assetId,
      "asset_audio_test",
    );

    assert.equal(
      result.durationSeconds,
      20,
    );

    assert.equal(
      result.bpm,
      120,
    );

    assert.deepEqual(
      result.beatsSeconds,
      [
        0.5,
        1,
        1.5,
        2,
      ],
    );

    assert.deepEqual(
      result.downbeatsSeconds,
      [
        0.5,
        1.5,
      ],
    );

    assert.equal(
      result.mainDropSeconds,
      null,
    );

    assert.deepEqual(
      result.phraseBoundariesSeconds,
      [],
    );

    assert.deepEqual(
      result.speechRegions,
      [
        {
          startSeconds:
            1,

          endSeconds:
            2,
        },

        {
          startSeconds:
            3,

          endSeconds:
            4.5,
        },
      ],
    );

    assert.equal(
      result.language,
      "en",
    );

    assert.equal(
      result.provenance.producer,
      "audio_fingerprint_composer",
    );

    assert.equal(
      result.provenance
        .producerVersion,
      AUDIO_FINGERPRINT_COMPOSER_VERSION,
    );

    assert.equal(
      AUDIO_STRUCTURE_PROJECTION_POLICY,
      "structure-not-projected-v1",
    );

  },
);


test(
  "fingerprint identity is deterministic and binds projected evidence",
  () => {
    const input = {
      asset:
        asset(),

      music:
        music(),

      transcript:
        transcript(),

      modelRunIds: [
        "run_music_test",
        "run_speech_test",
      ],

      createdAt,
    };

    const first =
      composeAudioFingerprint(
        input,
      );

    const second =
      composeAudioFingerprint({
        ...input,

        createdAt:
          "2026-09-21T01:00:00.000Z",
      });

    assert.equal(
      first.fingerprintId,
      second.fingerprintId,
    );

    const changed =
      composeAudioFingerprint({
        ...input,

        transcript:
          transcript({
            language:
              "te",
          }),
      });

    assert.notEqual(
      first.fingerprintId,
      changed.fingerprintId,
    );
  },
);


test(
  "rejects transcript evidence for another asset",
  () => {
    assert.throws(
      () =>
        composeAudioFingerprint({
          asset:
            asset(),

          music:
            music(),

          transcript:
            transcript({
              assetId:
                "asset_other",
            }),

          modelRunIds:
            [],

          createdAt,
        }),

      /TRANSCRIPT_ASSET_ID_MISMATCH/,
    );
  },
);


test(
  "accepts nearest-sample PCM duration quantization after canonical proxy alignment",
  () => {
    const canonicalDuration =
      13.523603;

    const sampleRate =
      48000;

    const nearestSampleDuration =
      Math.round(
        canonicalDuration *
        sampleRate,
      ) /
      sampleRate;

    const delta =
      Math.abs(
        nearestSampleDuration -
        canonicalDuration,
      );

    assert.ok(
      delta > 1e-6,
    );

    assert.ok(
      delta <
        (
          1e-6 +
          0.5 / sampleRate
        ),
    );

    const result =
      composeAudioFingerprint({
        asset:
          asset(
            canonicalDuration,
          ),

        music:
          music(
            nearestSampleDuration,
          ),

        transcript:
          transcript(),

        modelRunIds:
          [],

        createdAt,
      });

    assert.equal(
      result.durationSeconds,
      canonicalDuration,
    );
  },
);


test(
  "rejects music duration that disagrees with MediaAsset",
  () => {
    assert.throws(
      () =>
        composeAudioFingerprint({
          asset:
            asset(20),

          music:
            music(19),

          transcript:
            transcript(),

          modelRunIds:
            [],

          createdAt,
        }),

      /AUDIO_DURATION_MISMATCH/,
    );
  },
);


test(
  "frozen AudioFingerprint validation rejects speech outside the asset",
  () => {
    assert.throws(
      () =>
        composeAudioFingerprint({
          asset:
            asset(),

          music:
            music(),

          transcript:
            transcript({
              regions: [
                {
                  startSeconds:
                    19,

                  endSeconds:
                    21,

                  text:
                    "Outside.",

                  confidence:
                    null,
                },
              ],
            }),

          modelRunIds:
            [],

          createdAt,
        }),
    );
  },
);


test(
  "rejects duplicate provenance model-run identities",
  () => {
    assert.throws(
      () =>
        composeAudioFingerprint({
          asset:
            asset(),

          music:
            music(),

          transcript:
            transcript(),

          modelRunIds: [
            "run_same",
            "run_same",
          ],

          createdAt,
        }),

      /DUPLICATE_MODEL_RUN_ID/,
    );
  },
);
