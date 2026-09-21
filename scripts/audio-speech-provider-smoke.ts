import {
  LocalSpeechAnalysisProvider,
  SPEECH_MODEL_BIN_SHA256,
  SPEECH_MODEL_REPO,
  SPEECH_MODEL_REVISION,
  SPEECH_MODEL_SET_SHA256,
  SPEECH_PROTOCOL_VERSION,
  type SpeechAnalysisRequest,
} from "./audio-local.js";


function stableValue(
  value: unknown,
): string {
  return JSON.stringify(
    value,
  );
}


async function main():
  Promise<void> {
  const [
    projectRootWsl,
    pythonPathWsl,
    modelDirectoryWsl,
    mediaPathWsl,
    cublasLibraryWsl,
    cudnnLibraryWsl,
    expectedMediaSha256,
  ] = process.argv.slice(2);

  if (
    !projectRootWsl ||
    !pythonPathWsl ||
    !modelDirectoryWsl ||
    !mediaPathWsl ||
    !cublasLibraryWsl ||
    !cudnnLibraryWsl ||
    !expectedMediaSha256
  ) {
    throw new Error(
      "USAGE_INVALID",
    );
  }

  if (
    !/^[a-f0-9]{64}$/.test(
      expectedMediaSha256,
    )
  ) {
    throw new Error(
      "MEDIA_SHA_INVALID",
    );
  }

  const provider =
    new LocalSpeechAnalysisProvider({
      projectRootWsl,

      pythonPath:
        pythonPathWsl,

      cudaLibraryPathsWsl: [
        cublasLibraryWsl,
        cudnnLibraryWsl,
      ],

      timeoutMilliseconds:
        300_000,
    });

  const request:
    SpeechAnalysisRequest = {
    protocolVersion:
      SPEECH_PROTOCOL_VERSION,

    operation:
      "transcribe" as const,

    mediaPath:
      mediaPathWsl,

    modelDirectory:
      modelDirectoryWsl,

    device:
      "cuda" as const,

    computeType:
      "float16" as const,

    language:
      null,
  };

  try {
    console.log(
      "=== FIRST PROVIDER REQUEST ===",
    );

    const first =
      await provider.analyze(
        request,
      );

    if (
      first.media.sha256 !==
      expectedMediaSha256
    ) {
      throw new Error(
        "MEDIA_IDENTITY_MISMATCH",
      );
    }

    if (
      first.model.repository !==
        SPEECH_MODEL_REPO ||
      first.model.revision !==
        SPEECH_MODEL_REVISION ||
      first.model.modelBinSha256 !==
        SPEECH_MODEL_BIN_SHA256 ||
      first.model.modelSetSha256 !==
        SPEECH_MODEL_SET_SHA256
    ) {
      throw new Error(
        "MODEL_IDENTITY_MISMATCH",
      );
    }

    if (
      first.model.device !==
        "cuda" ||
      first.model.computeType !==
        "float16"
    ) {
      throw new Error(
        "CUDA_IDENTITY_MISMATCH",
      );
    }

    if (
      first.value.regions.length <
      1
    ) {
      throw new Error(
        "NO_SPEECH",
      );
    }

    console.log(
      "provider         :",
      first.model.provider,
    );

    console.log(
      "model repo       :",
      first.model.repository,
    );

    console.log(
      "model revision   :",
      first.model.revision,
    );

    console.log(
      "model set sha    :",
      first.model.modelSetSha256,
    );

    console.log(
      "media sha        :",
      first.media.sha256,
    );

    console.log(
      "device           :",
      first.model.device,
    );

    console.log(
      "compute type     :",
      first.model.computeType,
    );

    console.log(
      "language         :",
      first.value.language,
    );

    console.log(
      "language prob    :",
      first.value.languageProbability,
    );

    console.log(
      "regions          :",
      first.value.regions.length,
    );

    console.log(
      "model load sec   :",
      first.performance
        .modelLoadSeconds
        .toFixed(3),
    );

    console.log(
      "inference sec    :",
      first.performance
        .inferenceSeconds
        .toFixed(3),
    );

    console.log(
      "realtime factor  :",
      first.performance
        .realtimeFactor
        ?.toFixed(3) ??
        "null",
    );

    console.log();

    console.log(
      "=== FIRST REGIONS ===",
    );

    for (
      const region of
      first.value.regions.slice(
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
      "=== SECOND PROVIDER REQUEST ===",
    );

    const second =
      await provider.analyze(
        request,
      );

    if (
      second.performance
        .modelLoadSeconds !== 0
    ) {
      throw new Error(
        "MODEL_NOT_REUSED",
      );
    }

    if (
      stableValue(
        second.value,
      ) !==
      stableValue(
        first.value,
      )
    ) {
      throw new Error(
        "NONDETERMINISTIC_TRANSCRIPT",
      );
    }

    if (
      second.media.sha256 !==
      first.media.sha256
    ) {
      throw new Error(
        "MEDIA_IDENTITY_CHANGED",
      );
    }

    if (
      stableValue(
        second.model,
      ) !==
      stableValue(
        first.model,
      )
    ) {
      throw new Error(
        "MODEL_IDENTITY_CHANGED",
      );
    }

    console.log(
      "second model load:",
      second.performance
        .modelLoadSeconds,
    );

    console.log(
      "second inference :",
      second.performance
        .inferenceSeconds
        .toFixed(3),
    );

    console.log(
      "transcript stable:",
      "YES",
    );

    console.log(
      "model reused     :",
      "YES",
    );

    console.log();
    console.log(
      "SPEECH APPLICATION SEAM: PASS",
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
