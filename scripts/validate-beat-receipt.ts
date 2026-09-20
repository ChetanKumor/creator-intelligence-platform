import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BeatAnalysisFailureSchema,
  BeatAnalysisResponseSchema,
} from "../packages/audio-analyzer/protocol.js";

const input = process.argv[2];

if (input === undefined) {
  throw new Error("Usage: validate-beat-receipt <receipt.json>");
}

const filename = resolve(input);
const info = await lstat(filename);

if (
  !info.isFile() ||
  info.isSymbolicLink() ||
  info.size <= 0 ||
  info.size > 16 * 1024 * 1024
) {
  throw new Error("Invalid beat receipt.");
}

const raw: unknown = JSON.parse(
  await readFile(filename, "utf8"),
);

const failure = BeatAnalysisFailureSchema.safeParse(raw);

if (failure.success) {
  console.log(
    `BEAT RECEIPT: FAILURE (${failure.data.error.code})`,
  );
  process.exitCode = 1;
} else {
  const result = BeatAnalysisResponseSchema.parse(raw);

  console.log("protocol   :", result.protocolVersion);
  console.log("adapter    :", result.toolVersion);
  console.log("provider   :", result.model.provider);
  console.log("device     :", result.model.device);
  console.log("duration   :", result.audio.durationSeconds);
  console.log("bpm        :", result.value.bpm);
  console.log("beats      :", result.value.beatsSeconds.length);
  console.log("downbeats  :", result.value.downbeatsSeconds.length);
  console.log(
    "checkpoint :",
    result.model.checkpointSha256,
  );
  console.log();
  console.log("TYPESCRIPT OWNED INTERCHANGE: PASS ✅");
}
