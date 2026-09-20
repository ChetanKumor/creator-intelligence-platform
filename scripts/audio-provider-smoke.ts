import {
  BEAT_THIS_FINAL0_SHA256,
  LocalBeatAnalysisProvider,
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
    "Usage: audio-provider-smoke <project-wsl> <python-wsl> <audio-wsl> <checkpoint-wsl>",
  );
}

const provider =
  new LocalBeatAnalysisProvider({
    projectRootWsl,
    pythonPath,
    timeoutMilliseconds: 180_000,
  });

try {
  const result = await provider.analyze({
    protocolVersion: "1.0.0",
    operation: "beats",
    audioPath,
    checkpointPath,
    device: "cuda",
  });

  console.log(
    "provider       :",
    result.model.provider,
  );

  console.log(
    "adapter        :",
    result.toolVersion,
  );

  console.log(
    "checkpoint     :",
    result.model.checkpointSha256,
  );

  console.log(
    "checkpoint pin :",
    result.model.checkpointSha256 ===
      BEAT_THIS_FINAL0_SHA256,
  );

  console.log(
    "duration       :",
    result.audio.durationSeconds.toFixed(3),
  );

  console.log(
    "bpm            :",
    result.value.bpm?.toFixed(2) ?? "null",
  );

  console.log(
    "beats          :",
    result.value.beatsSeconds.length,
  );

  console.log(
    "downbeats      :",
    result.value.downbeatsSeconds.length,
  );

  console.log(
    "inference      :",
    result.performance.inferenceSeconds.toFixed(3),
    "s",
  );

  if (
    result.value.beatsSeconds.length === 0 ||
    result.value.downbeatsSeconds.length === 0 ||
    result.model.checkpointSha256 !==
      BEAT_THIS_FINAL0_SHA256
  ) {
    throw new Error(
      "Owned beat provider invariant failed.",
    );
  }

  console.log();
  console.log(
    "LOCAL BEAT ANALYSIS PROVIDER: PASS ✅",
  );
} finally {
  await provider.close();
}
