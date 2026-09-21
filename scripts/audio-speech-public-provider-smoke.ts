import {
  MediaAssetSchema,
} from "../packages/contracts/index.js";

import {
  LocalSpeechProvider,
  SPEECH_ADAPTER_VERSION,
  SPEECH_MODEL_REVISION,
} from "./audio-local.js";


async function main():
  Promise<void> {
  const [
    projectRootWsl,
    pythonPathWsl,
    modelDirectoryWsl,
    mediaPathWsl,
    cublasLibraryWsl,
    cudnnLibraryWsl,
  ] = process.argv.slice(2);

  if (
    !projectRootWsl ||
    !pythonPathWsl ||
    !modelDirectoryWsl ||
    !mediaPathWsl ||
    !cublasLibraryWsl ||
    !cudnnLibraryWsl
  ) {
    throw new Error(
      "USAGE_INVALID",
    );
  }

  const asset =
    MediaAssetSchema.parse({
      contractType:
        "MediaAsset",

      schemaVersion:
        "1.0.0",

      assetId:
        "asset_chrisraw",

      projectId:
        "project_phase3_speech",

      creatorId:
        "creator_authorized_test",

      kind:
        "video",

      objectId:
        "object_chrisraw",

      durationSeconds:
        13.523603,

      origin:
        "creator_upload",

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
        "project_phase3_speech",

      jobId:
        "job_phase3_speech",

      creatorId:
        "creator_authorized_test",

      environment:
        "production" as const,
    },

    operationId:
      "operation_phase3_speech",

    attempt:
      1,
  };

  let resolverCalls = 0;

  const clockValues = [
    "2026-09-21T00:00:00.000Z",
    "2026-09-21T00:00:02.000Z",
  ];

  const provider =
    new LocalSpeechProvider({
      projectRootWsl,

      pythonPath:
        pythonPathWsl,

      cudaLibraryPathsWsl: [
        cublasLibraryWsl,
        cudnnLibraryWsl,
      ],

      modelDirectoryWsl,

      device:
        "cuda",

      computeType:
        "float16",

      language:
        null,

      timeoutMilliseconds:
        300_000,

      async resolveMediaPath(
        resolvedAsset,
      ) {
        resolverCalls += 1;

        if (
          resolvedAsset.assetId !==
            asset.assetId ||
          resolvedAsset.objectId !==
            asset.objectId
        ) {
          throw new Error(
            "ASSET_IDENTITY_CHANGED",
          );
        }

        return mediaPathWsl;
      },

      clock: {
        now() {
          const value =
            clockValues.shift();

          if (!value) {
            throw new Error(
              "CLOCK_EXHAUSTED",
            );
          }

          return value;
        },
      },
    });

  try {
    console.log(
      "=== PUBLIC SPEECHPROVIDER REQUEST ===",
    );

    const result =
      await provider.transcribe(
        asset,
        context,
      );

    if (
      resolverCalls !== 1
    ) {
      throw new Error(
        "MEDIA_RESOLVER_COUNT_INVALID",
      );
    }

    if (
      result.value.assetId !==
      asset.assetId
    ) {
      throw new Error(
        "TRANSCRIPT_ASSET_ID_INVALID",
      );
    }

    if (
      result.value.regions.length <
      1
    ) {
      throw new Error(
        "NO_TRANSCRIPT_REGIONS",
      );
    }

    if (
      result.modelRun.provider !==
        "local_speech" ||
      result.modelRun.model !==
        "faster-whisper-small" ||
      result.modelRun.modelVersion !==
        SPEECH_MODEL_REVISION ||
      result.modelRun.adapterVersion !==
        SPEECH_ADAPTER_VERSION ||
      result.modelRun.operation !==
        "speech" ||
      result.modelRun.status !==
        "succeeded" ||
      result.modelRun.errorCode !==
        null
    ) {
      throw new Error(
        "MODELRUN_IDENTITY_INVALID",
      );
    }

    if (
      result.modelRun.inputIds.length !==
        1 ||
      result.modelRun.inputIds[0] !==
        asset.assetId
    ) {
      throw new Error(
        "MODELRUN_INPUT_INVALID",
      );
    }

    console.log(
      "provider         :",
      result.modelRun.provider,
    );

    console.log(
      "model            :",
      result.modelRun.model,
    );

    console.log(
      "model revision   :",
      result.modelRun.modelVersion,
    );

    console.log(
      "adapter          :",
      result.modelRun.adapterVersion,
    );

    console.log(
      "operation        :",
      result.modelRun.operation,
    );

    console.log(
      "asset id         :",
      result.value.assetId,
    );

    console.log(
      "language         :",
      result.value.language,
    );

    console.log(
      "regions          :",
      result.value.regions.length,
    );

    console.log(
      "resolver calls   :",
      resolverCalls,
    );

    console.log();

    console.log(
      "=== TRANSCRIPT REGIONS ===",
    );

    for (
      const region of
      result.value.regions.slice(
        0,
        5,
      )
    ) {
      console.log(
        `[${region.startSeconds.toFixed(3)} -> ${region.endSeconds.toFixed(3)}] ${region.text}`,
      );
    }

    console.log();

    console.log(
      "PUBLIC SPEECHPROVIDER CUDA: PASS",
    );

  } finally {
    await provider.close();
  }
}


main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : "UNKNOWN_FAILURE",
    );

    process.exitCode = 1;
  },
);
