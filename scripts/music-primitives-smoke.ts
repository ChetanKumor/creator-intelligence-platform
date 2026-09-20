import {
  LocalMusicPrimitiveProvider,
  MusicPrimitiveAnalysisSchema,
} from "../packages/audio-analyzer/index.js";

const [
  projectRootWsl,
  pythonPath,
  audioPath,
  checkpointPath,
] = process.argv.slice(2);

if (
  projectRootWsl === undefined ||
  pythonPath === undefined ||
  audioPath === undefined ||
  checkpointPath === undefined
) {
  throw new Error(
    "Usage: music-primitives-smoke <project-wsl> <python-wsl> <audio-wsl> <checkpoint-wsl>",
  );
}

const provider =
  new LocalMusicPrimitiveProvider({
    projectRootWsl,
    pythonPath,
  });

try {
  const first =
    await provider.analyze({
      audioPath,
      checkpointPath,
      device: "cuda",
    });

  const second =
    await provider.analyze({
      audioPath,
      checkpointPath,
      device: "cuda",
    });

  MusicPrimitiveAnalysisSchema.parse(
    first,
  );

  MusicPrimitiveAnalysisSchema.parse(
    second,
  );

  const deterministic =
    JSON.stringify(first) ===
    JSON.stringify(second);

  console.log(
    "contract       :",
    first.contractType,
  );

  console.log(
    "version        :",
    first.schemaVersion,
  );

  console.log(
    "audio sha      :",
    first.audio.sha256,
  );

  console.log(
    "duration       :",
    first.audio.durationSeconds
      .toFixed(3),
  );

  console.log(
    "sample rate    :",
    first.audio.sampleRate,
  );

  console.log(
    "channels       :",
    first.audio.channels,
  );

  console.log(
    "beat provider  :",
    first.beat.provider,
  );

  console.log(
    "bpm            :",
    first.beat.bpm
      ?.toFixed(2) ?? "null",
  );

  console.log(
    "beats          :",
    first.beat.beatsSeconds.length,
  );

  console.log(
    "downbeats      :",
    first.beat.downbeatsSeconds.length,
  );

  console.log(
    "energy algo    :",
    first.energy.algorithmVersion,
  );

  console.log(
    "energy points  :",
    first.energy.points.length,
  );

  console.log(
    "same source    :",
    first.audio.sha256.length === 64,
  );

  console.log(
    "deterministic  :",
    deterministic,
  );

  if (
    first.beat.beatsSeconds.length === 0 ||
    first.energy.points.length === 0 ||
    !deterministic
  ) {
    throw new Error(
      "Music primitive invariants failed.",
    );
  }

  console.log();
  console.log(
    "MUSIC PRIMITIVE ANALYSIS: PASS ✅",
  );
} finally {
  await provider.close();
}
