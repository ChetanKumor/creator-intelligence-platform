import {
  LocalTransNetV2Detector,
} from "./transnetv2-local.js";


async function main():
  Promise<void> {
  const [
    projectRootWsl,
    pythonPathWsl,
    repositoryPathWsl,
    weightsPathWsl,
    mediaPath,
    ffmpegPath,
    frameCountText,
  ] = process.argv.slice(2);

  if (
    !projectRootWsl ||
    !pythonPathWsl ||
    !repositoryPathWsl ||
    !weightsPathWsl ||
    !mediaPath ||
    !ffmpegPath ||
    !frameCountText
  ) {
    throw new Error(
      "USAGE_INVALID",
    );
  }

  const expectedFrameCount =
    Number(
      frameCountText,
    );

  if (
    !Number.isSafeInteger(
      expectedFrameCount,
    ) ||
    expectedFrameCount <= 0
  ) {
    throw new Error(
      "FRAME_COUNT_INVALID",
    );
  }


  const detector =
    new LocalTransNetV2Detector({
      projectRootWsl,
      pythonPathWsl,
      repositoryPathWsl,
      weightsPathWsl,

      timeoutMilliseconds:
        300_000,
    });


  try {
    const result =
      await detector.detect({
        protocolVersion:
          "1.0.0",

        operation:
          "detect",

        mediaPath,

        ffmpegPath,

        expectedFrameCount,

        threshold:
          0.5,
      });


    console.log(
      "provider        :",
      result.model.provider,
    );

    console.log(
      "adapter         :",
      result.toolVersion,
    );

    console.log(
      "source commit   :",
      result.model
        .sourceCommit,
    );

    console.log(
      "source sha      :",
      result.model
        .sourceSha256,
    );

    console.log(
      "weight set      :",
      result.model
        .weightSetSha256,
    );

    console.log(
      "tensorflow      :",
      result.model
        .tensorflowVersion,
    );

    console.log(
      "device          :",
      result.model.device,
    );

    console.log(
      "gpu             :",
      result.model.gpuName,
    );

    console.log();

    console.log(
      "expected frames :",
      result.media
        .expectedFrameCount,
    );

    console.log(
      "decoded frames  :",
      result.media
        .decodedFrameCount,
    );

    console.log(
      "scene count     :",
      result.value
        .sceneCount,
    );

    console.log(
      "cuts            :",
      JSON.stringify(
        result.value.cuts,
      ),
    );

    console.log();

    console.log(
      "model load sec  :",
      result.performance
        .modelLoadSeconds
        .toFixed(3),
    );

    console.log(
      "decode sec      :",
      result.performance
        .decodeSeconds
        .toFixed(3),
    );

    console.log(
      "inference sec   :",
      result.performance
        .inferenceSeconds
        .toFixed(3),
    );


    if (
      result.media
        .decodedFrameCount !==
      expectedFrameCount
    ) {
      throw new Error(
        "FRAME_ALIGNMENT_FAILED",
      );
    }


    const near = (
      target:
        number,
    ) =>
      result.value.cuts.some(
        (
          cut,
        ) =>
          Math.abs(
            cut -
            target,
          ) <= 1,
      );


    if (
      expectedFrameCount ===
        90 &&
      (
        !near(30) ||
        !near(60)
      )
    ) {
      throw new Error(
        "HARD_CUT_SMOKE_FAILED",
      );
    }


    console.log();

    console.log(
      "TRANSNETV2 OWNED PROVIDER: PASS ✅"
    );

  } finally {
    await detector.close();
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

    process.exitCode =
      1;
  },
);
