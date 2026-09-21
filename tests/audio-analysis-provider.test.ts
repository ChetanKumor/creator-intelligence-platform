import assert from "node:assert/strict";
import test from "node:test";

import {
  MediaAssetSchema,
  ModelRunSchema,
} from "../packages/contracts/index.js";

import {
  AUDIO_ANALYSIS_PROVIDER_VERSION,
  BEAT_THIS_FINAL0_SHA256,
  MUSIC_PRIMITIVE_VERSION,
  STRUCTURE_ADAPTER_VERSION,
  STRUCTURE_MODEL_NAME,
  AudioFingerprintAnalysisProvider,
  combineMusicAnalysis,
  type AudioMusicProvider,
  type MusicAnalysis,
} from "../packages/audio-analyzer/index.js";

import type {
  AnalysisContext,
  SpeechProvider,
  Transcript,
} from "../packages/providers/index.js";


const SOURCE_SHA =
  "c".repeat(64);

const STRUCTURE_SHA =
  "d".repeat(64);

const TIME =
  "2026-09-21T00:00:00.000Z";


const context:
  AnalysisContext = {
    scope: {
      projectId:
        "project_audio_provider",

      jobId:
        "job_audio_provider",

      creatorId:
        "creator_audio_provider",

      environment:
        "synthetic",
    },

    operationId:
      "operation_audio_provider",

    attempt:
      1,
  };


const asset =
  MediaAssetSchema.parse({
    contractType:
      "MediaAsset",

    schemaVersion:
      "1.0.0",

    assetId:
      "asset_audio_provider",

    projectId:
      context.scope.projectId,

    creatorId:
      context.scope.creatorId,

    kind:
      "video",

    objectId:
      "object_audio_provider",

    durationSeconds:
      20,

    origin:
      "synthetic",

    retention: {
      expiresAt:
        null,

      deletionRequestedAt:
        null,
    },
  });


function musicValue():
  MusicAnalysis {
  return combineMusicAnalysis(
    {
      contractType:
        "MusicPrimitiveAnalysis",

      schemaVersion:
        MUSIC_PRIMITIVE_VERSION,

      audio: {
        sha256:
          SOURCE_SHA,

        durationSeconds:
          20,

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
          "test",

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
        ],

        downbeatsSeconds: [
          0.5,
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
            -5,

          flat:
            false,
        },

        points: [
          {
            atSeconds:
              0,

            energy:
              0.1,
          },

          {
            atSeconds:
              0.5,

            energy:
              0.8,
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
          "test",

        modelName:
          STRUCTURE_MODEL_NAME,

        checkpointCount:
          8,

        checkpointSetSha256:
          STRUCTURE_SHA,

        checkpoints:
          Array.from(
            { length: 8 },

            (_, index) => ({
              filename:
                `model_${index}.pth`,

              sha256:
                String(index + 11)
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

        durationSeconds:
          20,

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
              10,

            label:
              "intro",
          },

          {
            startSeconds:
              10,

            endSeconds:
              20,

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


function transcript():
  Transcript {
  return {
    assetId:
      asset.assetId,

    language:
      "en",

    regions: [
      {
        startSeconds:
          2,

        endSeconds:
          3,

        text:
          "Speech.",

        confidence:
          null,
      },
    ],
  };
}


function childRun(
  runId:
    string,

  operation:
    "audio_analysis" |
    "speech",

  scope =
    context.scope,
) {
  return ModelRunSchema.parse({
    contractType:
      "ModelRun",

    schemaVersion:
      "1.0.0",

    runId,

    scope,

    provider:
      operation ===
        "speech"
        ? "speech_test"
        : "music_test",

    model:
      operation ===
        "speech"
        ? "speech_model"
        : "music_model",

    modelVersion:
      "test-1",

    adapterVersion:
      "test-1",

    operation,

    inputIds: [
      asset.assetId,
    ],

    outputIds:
      [],

    startedAt:
      TIME,

    endedAt:
      TIME,

    status:
      "succeeded",

    errorCode:
      null,
  });
}


test(
  "orchestrates music then speech and returns the frozen AudioAnalysisProvider result",
  async () => {
    const events:
      string[] = [];

    const observedOperationIds:
      string[] = [];

    const music:
      AudioMusicProvider = {
        id:
          "music_test",

        version:
          "test-1",

        async analyzeMusic(
          observedAsset,
          childContext,
        ) {
          events.push(
            "music",
          );

          observedOperationIds.push(
            childContext.operationId,
          );

          assert.equal(
            observedAsset.assetId,
            asset.assetId,
          );

          return {
            value:
              musicValue(),

            modelRun:
              childRun(
                `${childContext.operationId}.model`,
                "audio_analysis",
              ),
          };
        },
      };

    const speech:
      SpeechProvider = {
        id:
          "speech_test",

        version:
          "test-1",

        async transcribe(
          observedAsset,
          childContext,
        ) {
          /*
           * This assertion proves speech is
           * entered only after music completed.
           */
          assert.deepEqual(
            events,
            [
              "music",
            ],
          );

          events.push(
            "speech",
          );

          observedOperationIds.push(
            childContext.operationId,
          );

          assert.equal(
            observedAsset.assetId,
            asset.assetId,
          );

          return {
            value:
              transcript(),

            modelRun:
              childRun(
                `${childContext.operationId}.model`,
                "speech",
              ),
          };
        },
      };

    const times = [
      "2026-09-21T00:00:00.000Z",
      "2026-09-21T00:00:03.000Z",
    ];

    const provider =
      new AudioFingerprintAnalysisProvider(
        music,
        speech,
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
      await provider.analyze(
        asset,
        context,
      );

    assert.deepEqual(
      events,
      [
        "music",
        "speech",
      ],
    );

    assert.deepEqual(
      observedOperationIds,
      [
        "operation_audio_provider.music",
        "operation_audio_provider.speech",
      ],
    );

    assert.equal(
      result.value.assetId,
      asset.assetId,
    );

    assert.equal(
      result.value.bpm,
      120,
    );

    assert.deepEqual(
      result.value.speechRegions,
      [
        {
          startSeconds:
            2,

          endSeconds:
            3,
        },
      ],
    );

    assert.equal(
      result.value.mainDropSeconds,
      null,
    );

    assert.deepEqual(
      result.value
        .phraseBoundariesSeconds,
      [],
    );

    assert.equal(
      result.modelRun.runId,
      "operation_audio_provider.model",
    );

    assert.equal(
      result.modelRun.provider,
      "audio_analyzer",
    );

    assert.equal(
      result.modelRun
        .adapterVersion,
      AUDIO_ANALYSIS_PROVIDER_VERSION,
    );

    assert.equal(
      result.modelRun.operation,
      "audio_analysis",
    );

    assert.deepEqual(
      result.modelRun.outputIds,
      [
        result.value
          .fingerprintId,
      ],
    );

    assert.deepEqual(
      result.value.provenance
        .modelRunIds,
      [
        "operation_audio_provider.music.model",
        "operation_audio_provider.speech.model",
        "operation_audio_provider.model",
      ],
    );
  },
);


test(
  "rejects a child ModelRun from another scope before starting the next heavy provider",
  async () => {
    let speechCalled =
      false;

    const music:
      AudioMusicProvider = {
        id:
          "music_test",

        version:
          "test-1",

        async analyzeMusic(
          _asset,
          childContext,
        ) {
          return {
            value:
              musicValue(),

            modelRun:
              childRun(
                `${childContext.operationId}.model`,
                "audio_analysis",
                {
                  ...context.scope,

                  jobId:
                    "job_other",
                },
              ),
          };
        },
      };

    const speech:
      SpeechProvider = {
        id:
          "speech_test",

        version:
          "test-1",

        async transcribe() {
          speechCalled =
            true;

          return {
            value:
              transcript(),

            modelRun:
              childRun(
                "unused_speech_run",
                "speech",
              ),
          };
        },
      };

    const provider =
      new AudioFingerprintAnalysisProvider(
        music,
        speech,
        {
          now() {
            return TIME;
          },
        },
      );

    await assert.rejects(
      provider.analyze(
        asset,
        context,
      ),

      /CHILD_MODELRUN_SCOPE_MISMATCH/,
    );

    assert.equal(
      speechCalled,
      false,
    );
  },
);


test(
  "rejects duplicate child run identities rather than producing ambiguous provenance",
  async () => {
    const duplicate =
      "run_duplicate";

    const music:
      AudioMusicProvider = {
        id:
          "music_test",

        version:
          "test-1",

        async analyzeMusic() {
          return {
            value:
              musicValue(),

            modelRun:
              childRun(
                duplicate,
                "audio_analysis",
              ),
          };
        },
      };

    const speech:
      SpeechProvider = {
        id:
          "speech_test",

        version:
          "test-1",

        async transcribe() {
          return {
            value:
              transcript(),

            modelRun:
              childRun(
                duplicate,
                "speech",
              ),
          };
        },
      };

    const provider =
      new AudioFingerprintAnalysisProvider(
        music,
        speech,
        {
          now() {
            return TIME;
          },
        },
      );

    await assert.rejects(
      provider.analyze(
        asset,
        context,
      ),

      /DUPLICATE_MODEL_RUN_ID/,
    );
  },
);


test(
  "propagates music failure and never starts speech",
  async () => {
    let speechCalled =
      false;

    const music:
      AudioMusicProvider = {
        id:
          "music_test",

        version:
          "test-1",

        async analyzeMusic() {
          throw new Error(
            "MUSIC_ANALYSIS_FAILED",
          );
        },
      };

    const speech:
      SpeechProvider = {
        id:
          "speech_test",

        version:
          "test-1",

        async transcribe() {
          speechCalled =
            true;

          return {
            value:
              transcript(),

            modelRun:
              childRun(
                "unused_speech_run",
                "speech",
              ),
          };
        },
      };

    const provider =
      new AudioFingerprintAnalysisProvider(
        music,
        speech,
        {
          now() {
            return TIME;
          },
        },
      );

    await assert.rejects(
      provider.analyze(
        asset,
        context,
      ),

      /MUSIC_ANALYSIS_FAILED/,
    );

    assert.equal(
      speechCalled,
      false,
    );
  },
);
