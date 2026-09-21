import {
  MediaAssetSchema,
} from "../packages/contracts/index.js";

import {
  LocalAudioFingerprintProvider,
} from "./audio-local.js";


const EXPECTED_DURATION =
  13.523603;


async function main():
  Promise<void> {
  const [
    projectRootWsl,
    beatPythonPath,
    structurePythonPath,
    speechPythonPath,
    musicAudioPathWsl,
    speechMediaPathWsl,
    beatCheckpointPathWsl,
    structureModelDirectoryWsl,
    structureWorkDirectoryWsl,
    speechModelDirectoryWsl,
    cublasLibraryWsl,
    cudnnLibraryWsl,
  ] = process.argv.slice(2);

  if (
    !projectRootWsl ||
    !beatPythonPath ||
    !structurePythonPath ||
    !speechPythonPath ||
    !musicAudioPathWsl ||
    !speechMediaPathWsl ||
    !beatCheckpointPathWsl ||
    !structureModelDirectoryWsl ||
    !structureWorkDirectoryWsl ||
    !speechModelDirectoryWsl ||
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
        "project_creator_intelligence_phase2_5",

      creatorId:
        "creator_phase2_5_local_verification",

      kind:
        "video",

      objectId:
        "object_chrisraw_authorized",

      durationSeconds:
        EXPECTED_DURATION,

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
        asset.projectId,

      jobId:
        "job_phase3_audio_fingerprint_real",

      creatorId:
        asset.creatorId,

      environment:
        "production" as const,
    },

    operationId:
      "operation_phase3_audio_fingerprint_real",

    attempt:
      1,
  };

  let musicResolverCalls =
    0;

  let speechResolverCalls =
    0;

  const clock = {
    now() {
      return new Date()
        .toISOString();
    },
  };

  const provider =
    new LocalAudioFingerprintProvider({
      music: {
        projectRootWsl,

        primitivePythonPath:
          beatPythonPath,

        structurePythonPath,

        structureModelDirectoryWsl,

        structureWorkDirectoryWsl,

        beatCheckpointPathWsl,

        beatDevice:
          "cuda",

        structureDevice:
          "cuda",

        async resolveMediaPath(
          resolvedAsset,
        ) {
          musicResolverCalls +=
            1;

          if (
            resolvedAsset.assetId !==
              asset.assetId ||
            resolvedAsset.objectId !==
              asset.objectId
          ) {
            throw new Error(
              "MUSIC_ASSET_IDENTITY_CHANGED",
            );
          }

          return musicAudioPathWsl;
        },
      },

      speech: {
        projectRootWsl,

        pythonPath:
          speechPythonPath,

        cudaLibraryPathsWsl: [
          cublasLibraryWsl,
          cudnnLibraryWsl,
        ],

        modelDirectoryWsl:
          speechModelDirectoryWsl,

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
          speechResolverCalls +=
            1;

          if (
            resolvedAsset.assetId !==
              asset.assetId ||
            resolvedAsset.objectId !==
              asset.objectId
          ) {
            throw new Error(
              "SPEECH_ASSET_IDENTITY_CHANGED",
            );
          }

          return speechMediaPathWsl;
        },
      },

      clock,
    });

  try {
    console.log(
      "=== REAL PUBLIC AUDIOANALYSISPROVIDER REQUEST ===",
    );

    const result =
      await provider.analyze(
        asset,
        context,
      );

    const fingerprint =
      result.value;

    if (
      musicResolverCalls !== 1 ||
      speechResolverCalls !== 1
    ) {
      throw new Error(
        "MEDIA_RESOLVER_COUNT_INVALID",
      );
    }

    if (
      fingerprint.assetId !==
      asset.assetId
    ) {
      throw new Error(
        "FINGERPRINT_ASSET_ID_INVALID",
      );
    }

    if (
      fingerprint.durationSeconds !==
      EXPECTED_DURATION
    ) {
      throw new Error(
        "FINGERPRINT_DURATION_INVALID",
      );
    }

    /*
     * Speech-heavy footage may legitimately have
     * no detected musical beat. Empty beat evidence
     * is successful evidence, not analyzer failure.
     */
    if (
      fingerprint.beatsSeconds.length ===
        0 &&
      (
        fingerprint.bpm !== null ||
        fingerprint.downbeatsSeconds.length !==
          0
      )
    ) {
      throw new Error(
        "EMPTY_BEAT_EVIDENCE_INVALID",
      );
    }

    if (
      fingerprint.energy.length <
      1
    ) {
      throw new Error(
        "NO_ENERGY_EVIDENCE",
      );
    }

    if (
      fingerprint.speechRegions.length <
      1
    ) {
      throw new Error(
        "NO_SPEECH_EVIDENCE",
      );
    }

    if (
      fingerprint.mainDropSeconds !==
      null ||
      fingerprint
        .phraseBoundariesSeconds
        .length !== 0
    ) {
      throw new Error(
        "UNOWNED_STRUCTURE_SEMANTICS_PROJECTED",
      );
    }

    if (
      result.modelRun.provider !==
        "audio_analyzer" ||
      result.modelRun.operation !==
        "audio_analysis" ||
      result.modelRun.status !==
        "succeeded" ||
      result.modelRun.errorCode !==
        null
    ) {
      throw new Error(
        "PARENT_MODELRUN_INVALID",
      );
    }

    if (
      result.modelRun.outputIds.length !==
        1 ||
      result.modelRun.outputIds[0] !==
        fingerprint.fingerprintId
    ) {
      throw new Error(
        "PARENT_OUTPUT_ID_INVALID",
      );
    }

    if (
      fingerprint.provenance
        .modelRunIds.length !==
        3 ||
      !fingerprint.provenance
        .modelRunIds.includes(
          result.modelRun.runId,
        )
    ) {
      throw new Error(
        "FINGERPRINT_PROVENANCE_INVALID",
      );
    }

    console.log(
      "contract          :",
      fingerprint.contractType,
    );

    console.log(
      "fingerprint id    :",
      fingerprint.fingerprintId,
    );

    console.log(
      "asset id          :",
      fingerprint.assetId,
    );

    console.log(
      "duration          :",
      fingerprint.durationSeconds,
    );

    console.log(
      "bpm               :",
      fingerprint.bpm,
    );

    console.log(
      "beats             :",
      fingerprint.beatsSeconds.length,
    );

    console.log(
      "downbeats         :",
      fingerprint.downbeatsSeconds.length,
    );

    console.log(
      "energy points     :",
      fingerprint.energy.length,
    );

    console.log(
      "speech regions    :",
      fingerprint.speechRegions.length,
    );

    console.log(
      "language          :",
      fingerprint.language,
    );

    console.log(
      "main drop         :",
      fingerprint.mainDropSeconds,
    );

    console.log(
      "phrase boundaries :",
      fingerprint
        .phraseBoundariesSeconds.length,
    );

    console.log(
      "model runs        :",
      fingerprint.provenance
        .modelRunIds.join(","),
    );

    console.log(
      "parent run        :",
      result.modelRun.runId,
    );

    console.log(
      "music resolver    :",
      musicResolverCalls,
    );

    console.log(
      "speech resolver   :",
      speechResolverCalls,
    );

    console.log();

    console.log(
      "REAL PUBLIC AUDIOFINGERPRINT: PASS",
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
