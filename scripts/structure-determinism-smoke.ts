import {
  createHash,
} from "node:crypto";

import {
  LocalStructureAnalysisProvider,
} from "../packages/audio-analyzer/structure.js";

import type {
  StructureAnalysisResponse,
} from "../packages/audio-analyzer/protocol.js";


function canonical(
  result: StructureAnalysisResponse,
): string {
  return JSON.stringify({
    audioSha256:
      result.audio.sha256,

    checkpointSetSha256:
      result.model.checkpointSetSha256,

    modelName:
      result.model.modelName,

    segments:
      result.value.segments,
  });
}


function sha256(
  value: string,
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}


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

  const launch = {
    projectRootWsl,
    pythonPath,
    modelDirectoryWsl,
    workDirectoryWsl,

    timeoutMilliseconds:
      300_000,
  };

  console.log(
    "RUN 1 — worker A"
  );

  const providerA =
    new LocalStructureAnalysisProvider(
      launch,
    );

  let first:
    StructureAnalysisResponse;

  let second:
    StructureAnalysisResponse;

  try {
    first =
      await providerA.analyze({
        protocolVersion:
          "1.0.0",

        operation:
          "structure",

        audioPath,

        device:
          "cuda",
      });

    console.log(
      "RUN 2 — same worker A"
    );

    second =
      await providerA.analyze({
        protocolVersion:
          "1.0.0",

        operation:
          "structure",

        audioPath,

        device:
          "cuda",
      });

  } finally {
    await providerA.close();
  }

  console.log(
    "RUN 3 — fresh worker B"
  );

  const providerB =
    new LocalStructureAnalysisProvider(
      launch,
    );

  let third:
    StructureAnalysisResponse;

  try {
    third =
      await providerB.analyze({
        protocolVersion:
          "1.0.0",

        operation:
          "structure",

        audioPath,

        device:
          "cuda",
      });

  } finally {
    await providerB.close();
  }

  const canonical1 =
    canonical(first);

  const canonical2 =
    canonical(second);

  const canonical3 =
    canonical(third);

  const hash1 =
    sha256(canonical1);

  const hash2 =
    sha256(canonical2);

  const hash3 =
    sha256(canonical3);

  const sameWorker =
    canonical1 === canonical2;

  const freshWorker =
    canonical1 === canonical3;

  console.log();
  console.log(
    "segments run 1 :",
    first.value.segments.length,
  );

  console.log(
    "segments run 2 :",
    second.value.segments.length,
  );

  console.log(
    "segments run 3 :",
    third.value.segments.length,
  );

  console.log();

  console.log(
    "hash run 1     :",
    hash1,
  );

  console.log(
    "hash run 2     :",
    hash2,
  );

  console.log(
    "hash run 3     :",
    hash3,
  );

  console.log();

  console.log(
    "same worker    :",
    sameWorker,
  );

  console.log(
    "fresh worker   :",
    freshWorker,
  );

  console.log();

  console.log(
    "STRUCTURE"
  );

  console.log(
    "---------"
  );

  for (
    const [
      index,
      segment,
    ] of first.value.segments.entries()
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

  if (!sameWorker) {
    throw new Error(
      "STRUCTURE_NONDETERMINISTIC_SAME_WORKER",
    );
  }

  if (!freshWorker) {
    throw new Error(
      "STRUCTURE_NONDETERMINISTIC_FRESH_WORKER",
    );
  }

  console.log();
  console.log(
    "ALL-IN-ONE STRUCTURE DETERMINISM: PASS ✅"
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
