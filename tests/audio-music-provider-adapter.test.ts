import assert from "node:assert/strict";
import test from "node:test";

import {
  MediaAssetSchema,
} from "../packages/contracts/index.js";

import {
  AUDIO_MUSIC_PROVIDER_ADAPTER_VERSION,
  BEAT_THIS_FINAL0_SHA256,
  MUSIC_PRIMITIVE_VERSION,
  STRUCTURE_ADAPTER_VERSION,
  STRUCTURE_MODEL_NAME,
  AudioMusicProviderAdapter,
  combineMusicAnalysis,
  type MusicAnalysis,
  type MusicAnalysisInput,
  type MusicAnalysisRuntime,
} from "../packages/audio-analyzer/index.js";

import type {
  AnalysisContext,
} from "../packages/providers/index.js";


const TIME_0 =
  "2026-09-21T00:00:00.000Z";

const TIME_1 =
  "2026-09-21T00:00:02.000Z";

const SOURCE_SHA =
  "e".repeat(64);

const STRUCTURE_SET_SHA =
  "f".repeat(64);


const context:
  AnalysisContext = {
    scope: {
      projectId:
        "project_music_adapter",

      jobId:
        "job_music_adapter",

      creatorId:
        "creator_music_adapter",

      environment:
        "synthetic",
    },

    operationId:
      "operation_music_adapter",

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
      "asset_music_adapter",

    projectId:
      context.scope.projectId,

    creatorId:
      context.scope.creatorId,

    kind:
      "video",

    objectId:
      "opaque_object_music_adapter",

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
          128,

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
          STRUCTURE_SET_SHA,

        checkpoints:
          Array.from(
            { length: 8 },

            (_, index) => ({
              filename:
                `checkpoint_${index}.pth`,

              sha256:
                String(index + 21)
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


test(
  "adapts execution-only media path into owned music analysis and emits a child ModelRun",
  async () => {
    const expectedPath =
      "/authorized/runtime/source.mp4";

    const expectedCheckpoint =
      "/models/beat-this/final0.ckpt";

    let resolverCalls =
      0;

    let observedInput:
      MusicAnalysisInput |
      null = null;

    const runtime:
      MusicAnalysisRuntime = {
        async analyze(
          input,
        ) {
          observedInput =
            input;

          return musicValue();
        },
      };

    const times = [
      TIME_0,
      TIME_1,
    ];

    const provider =
      new AudioMusicProviderAdapter(
        runtime,

        async (
          resolvedAsset,
        ) => {
          resolverCalls += 1;

          assert.equal(
            resolvedAsset.assetId,
            asset.assetId,
          );

          assert.equal(
            resolvedAsset.objectId,
            "opaque_object_music_adapter",
          );

          return expectedPath;
        },

        {
          beatCheckpointPath:
            expectedCheckpoint,

          beatDevice:
            "cuda",

          structureDevice:
            "cuda",
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
      await provider.analyzeMusic(
        asset,
        context,
      );

    assert.equal(
      resolverCalls,
      1,
    );

    assert.notEqual(
      expectedPath,
      asset.objectId,
    );

    assert.deepEqual(
      observedInput,
      {
        audioPath:
          expectedPath,

        beatCheckpointPath:
          expectedCheckpoint,

        beatDevice:
          "cuda",

        structureDevice:
          "cuda",
      },
    );

    assert.equal(
      result.value
        .primitives.beat.bpm,
      128,
    );

    assert.equal(
      result.modelRun.runId,
      "operation_music_adapter.model",
    );

    assert.equal(
      result.modelRun.provider,
      "local_music",
    );

    assert.equal(
      result.modelRun.model,
      "beat_this_rms_allin1",
    );

    assert.equal(
      result.modelRun
        .adapterVersion,
      AUDIO_MUSIC_PROVIDER_ADAPTER_VERSION,
    );

    assert.equal(
      result.modelRun.operation,
      "audio_analysis",
    );

    assert.deepEqual(
      result.modelRun.inputIds,
      [
        asset.assetId,
      ],
    );

    assert.deepEqual(
      result.modelRun.outputIds,
      [],
    );
  },
);


test(
  "resolver failure prevents any owned music runtime execution",
  async () => {
    let analysisCalled =
      false;

    const runtime:
      MusicAnalysisRuntime = {
        async analyze() {
          analysisCalled =
            true;

          return musicValue();
        },
      };

    const provider =
      new AudioMusicProviderAdapter(
        runtime,

        async () => {
          throw new Error(
            "MEDIA_RESOLUTION_FAILED",
          );
        },

        {
          beatCheckpointPath:
            "/models/beat-this/final0.ckpt",

          beatDevice:
            "cuda",

          structureDevice:
            "cuda",
        },

        {
          now() {
            return TIME_0;
          },
        },
      );

    await assert.rejects(
      provider.analyzeMusic(
        asset,
        context,
      ),

      /MEDIA_RESOLUTION_FAILED/,
    );

    assert.equal(
      analysisCalled,
      false,
    );
  },
);
