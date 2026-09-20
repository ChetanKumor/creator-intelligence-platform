import {
  createHash,
} from "node:crypto";

import {
  LocalMusicAnalysisProvider,
} from "./audio-local.js";


function hashJson(
  value: unknown,
): string {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(value),
    )
    .digest("hex");
}


async function main():
  Promise<void> {
  const [
    projectRootWsl,
    primitivePythonPath,
    structurePythonPath,
    audioPath,
    beatCheckpointPath,
    structureModelDirectoryWsl,
    structureWorkDirectoryWsl,
  ] = process.argv.slice(2);

  if (
    !projectRootWsl ||
    !primitivePythonPath ||
    !structurePythonPath ||
    !audioPath ||
    !beatCheckpointPath ||
    !structureModelDirectoryWsl ||
    !structureWorkDirectoryWsl
  ) {
    throw new Error(
      "USAGE_INVALID",
    );
  }

  const provider =
    new LocalMusicAnalysisProvider({
      projectRootWsl,

      primitivePythonPath,

      structurePythonPath,

      structureModelDirectoryWsl,

      structureWorkDirectoryWsl,
    });

  const result =
    await provider.analyze({
      audioPath,

      beatCheckpointPath,

      beatDevice:
        "cuda",

      structureDevice:
        "cuda",
    });

  console.log(
    "contract         :",
    result.contractType,
  );

  console.log(
    "version          :",
    result.schemaVersion,
  );

  console.log(
    "audio sha        :",
    result.primitives
      .audio.sha256,
  );

  console.log(
    "duration         :",
    result.primitives
      .audio.durationSeconds,
  );

  console.log();

  console.log(
    "BEAT EVIDENCE"
  );

  console.log(
    "-------------"
  );

  console.log(
    "provider         :",
    result.primitives
      .beat.provider,
  );

  console.log(
    "bpm              :",
    result.primitives
      .beat.bpm,
  );

  console.log(
    "beats            :",
    result.primitives
      .beat.beatsSeconds.length,
  );

  console.log(
    "downbeats        :",
    result.primitives
      .beat.downbeatsSeconds.length,
  );

  console.log();

  console.log(
    "ENERGY EVIDENCE"
  );

  console.log(
    "---------------"
  );

  console.log(
    "algorithm        :",
    result.primitives
      .energy.algorithmVersion,
  );

  console.log(
    "points           :",
    result.primitives
      .energy.points.length,
  );

  console.log();

  console.log(
    "STRUCTURE EVIDENCE"
  );

  console.log(
    "------------------"
  );

  console.log(
    "provider         :",
    result.structure
      .model.provider,
  );

  console.log(
    "model            :",
    result.structure
      .model.modelName,
  );

  console.log(
    "checkpoint set   :",
    result.structure
      .model.checkpointSetSha256,
  );

  console.log(
    "sections         :",
    result.structure
      .value.segments.length,
  );

  console.log();

  for (
    const [
      index,
      section,
    ] of
      result.structure
        .value.segments
        .entries()
  ) {
    console.log(
      String(index + 1)
        .padStart(2, "0"),

      section.startSeconds
        .toFixed(3),

      "->",

      section.endSeconds
        .toFixed(3),

      section.label,
    );
  }

  console.log();

  console.log(
    "identity match   :",
    result.primitives
      .audio.sha256 ===
      result.structure
        .audio.sha256,
  );

  console.log(
    "duration match   :",
    Math.abs(
      result.primitives
        .audio.durationSeconds -
      result.structure
        .audio.durationSeconds,
    ) <= 1e-6,
  );

  console.log(
    "sample rate match:",
    result.primitives
      .audio.sampleRate ===
      result.structure
        .audio.sampleRate,
  );

  console.log(
    "channels match   :",
    result.primitives
      .audio.channels ===
      result.structure
        .audio.channels,
  );

  console.log();

  console.log(
    "evidence hash    :",
    hashJson({
      audio:
        result.primitives.audio,

      beat:
        result.primitives.beat,

      energy:
        result.primitives.energy,

      structure: {
        model:
          result.structure.model,

        segments:
          result.structure
            .value.segments,
      },
    }),
  );

  console.log();

  console.log(
    "phrase mapping   : NOT PERFORMED"
  );

  console.log(
    "main drop        : NOT DERIVED"
  );

  console.log();

  console.log(
    "OWNED MUSIC ANALYSIS: PASS ✅"
  );
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
