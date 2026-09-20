import {
  LocalStructureAnalysisProvider,
} from "./audio-local.js";

async function main():
  Promise<void> {
  const [
    projectRootWsl,
    pythonPath,
    audioPath,
    modelDirectoryWsl,
    workDirectoryWsl,
  ] = process.argv.slice(2);

  if (
    !projectRootWsl ||
    !pythonPath ||
    !audioPath ||
    !modelDirectoryWsl ||
    !workDirectoryWsl
  ) {
    throw new Error(
      "USAGE_INVALID",
    );
  }

  const provider =
    new LocalStructureAnalysisProvider({
      projectRootWsl,
      pythonPath,
      modelDirectoryWsl,
      workDirectoryWsl,

      timeoutMilliseconds:
        300_000,
    });

  try {
    const result =
      await provider.analyze({
        protocolVersion:
          "1.0.0",

        operation:
          "structure",

        audioPath,

        device:
          "cuda",
      });

    console.log(
      "provider       :",
      result.model.provider,
    );

    console.log(
      "model          :",
      result.model.modelName,
    );

    console.log(
      "checkpoints    :",
      result.model.checkpointCount,
    );

    console.log(
      "checkpoint set :",
      result.model
        .checkpointSetSha256,
    );

    console.log(
      "device         :",
      result.model.device,
    );

    console.log(
      "duration       :",
      result.audio.durationSeconds,
    );

    console.log(
      "segments       :",
      result.value.segments.length,
    );

    console.log();

    for (
      const [
        index,
        segment,
      ] of
        result.value.segments.entries()
    ) {
      console.log(
        String(index + 1)
          .padStart(2, "0"),
        segment.startSeconds
          .toFixed(3),
        "->",
        segment.endSeconds
          .toFixed(3),
        segment.label,
      );
    }

    console.log();

    console.log(
      "analysis sec   :",
      result.performance
        .analysisSeconds
        .toFixed(3),
    );

    console.log();

    console.log(
      "OWNED STRUCTURE PROVIDER: PASS ✅",
    );

  } finally {
    await provider.close();
  }
}

main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "UNKNOWN_FAILURE",
    );

    process.exitCode = 1;
  },
);
