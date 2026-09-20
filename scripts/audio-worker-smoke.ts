import { BeatWorker } from "./audio-beat-worker.js";

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
    "Usage: audio-worker-smoke <project-wsl> <python-wsl> <audio-wsl> <checkpoint-wsl>",
  );
}

const worker = new BeatWorker({
  projectRootWsl,
  pythonPath,
  timeoutMilliseconds: 180_000,
});

try {
  console.log("=== REQUEST 1 ===");

  const first = await worker.request({
    protocolVersion: "1.0.0",
    operation: "beats",
    audioPath,
    checkpointPath,
    device: "cuda",
  });

  console.log(
    "model load :",
    first.performance.modelLoadSeconds.toFixed(3),
    "s",
  );

  console.log(
    "inference  :",
    first.performance.inferenceSeconds.toFixed(3),
    "s",
  );

  console.log(
    "beats      :",
    first.value.beatsSeconds.length,
  );

  console.log(
    "downbeats  :",
    first.value.downbeatsSeconds.length,
  );

  console.log();

  console.log("=== REQUEST 2 — SAME WORKER ===");

  const second = await worker.request({
    protocolVersion: "1.0.0",
    operation: "beats",
    audioPath,
    checkpointPath,
    device: "cuda",
  });

  console.log(
    "model load :",
    second.performance.modelLoadSeconds.toFixed(3),
    "s",
  );

  console.log(
    "inference  :",
    second.performance.inferenceSeconds.toFixed(3),
    "s",
  );

  console.log(
    "beats      :",
    second.value.beatsSeconds.length,
  );

  console.log(
    "downbeats  :",
    second.value.downbeatsSeconds.length,
  );

  const deterministic =
    JSON.stringify(first.value) ===
    JSON.stringify(second.value);

  const reused =
    second.performance.modelLoadSeconds === 0;

  console.log();
  console.log("deterministic :", deterministic);
  console.log("model reused  :", reused);

  if (!deterministic || !reused) {
    throw new Error(
      "Persistent worker invariants failed.",
    );
  }

  console.log();
  console.log(
    "PERSISTENT AUDIO WORKER: PASS ✅",
  );
} finally {
  await worker.close();
}
