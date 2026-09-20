import {
  LocalEnergyAnalysisProvider,
} from "../packages/audio-analyzer/index.js";

const [
  projectRootWsl,
  pythonPath,
  audioPath,
] = process.argv.slice(2);

if (
  projectRootWsl === undefined ||
  pythonPath === undefined ||
  audioPath === undefined
) {
  throw new Error(
    "Usage: audio-energy-smoke <project-wsl> <python-wsl> <audio-wsl>",
  );
}

const provider =
  new LocalEnergyAnalysisProvider({
    projectRootWsl,
    pythonPath,
    timeoutMilliseconds: 60_000,
  });

try {
  const first =
    await provider.analyze({
      protocolVersion: "1.0.0",
      operation: "energy",
      audioPath,
    });

  const second =
    await provider.analyze({
      protocolVersion: "1.0.0",
      operation: "energy",
      audioPath,
    });

  const values =
    first.value.energy.map(
      (point) => point.energy,
    );

  const deterministic =
    JSON.stringify(first.value) ===
    JSON.stringify(second.value);

  const minimum =
    Math.min(...values);

  const maximum =
    Math.max(...values);

  const mean =
    values.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / values.length;

  console.log(
    "adapter       :",
    first.toolVersion,
  );

  console.log(
    "algorithm     :",
    first.config.version,
  );

  console.log(
    "window        :",
    first.config.windowSeconds,
    "s",
  );

  console.log(
    "points        :",
    values.length,
  );

  console.log(
    "energy min    :",
    minimum.toFixed(4),
  );

  console.log(
    "energy max    :",
    maximum.toFixed(4),
  );

  console.log(
    "energy mean   :",
    mean.toFixed(4),
  );

  console.log(
    "normalization :",
    first.normalization.lowDbfs
      .toFixed(2),
    "→",
    first.normalization.highDbfs
      .toFixed(2),
    "dBFS",
  );

  console.log(
    "flat          :",
    first.normalization.flat,
  );

  console.log(
    "analysis      :",
    first.performance.analysisSeconds
      .toFixed(3),
    "s",
  );

  console.log(
    "realtime      :",
    first.performance.realtimeFactor
      ?.toFixed(2),
    "x",
  );

  console.log(
    "deterministic :",
    deterministic,
  );

  console.log();
  console.log(
    "first 10:",
    first.value.energy
      .slice(0, 10)
      .map((point) => ({
        t: Number(
          point.atSeconds.toFixed(3),
        ),
        e: Number(
          point.energy.toFixed(3),
        ),
      })),
  );

  if (
    values.length === 0 ||
    minimum < 0 ||
    maximum > 1 ||
    !deterministic
  ) {
    throw new Error(
      "Energy analysis invariant failed.",
    );
  }

  console.log();
  console.log(
    "OWNED ENERGY ANALYSIS: PASS ✅",
  );
} finally {
  await provider.close();
}
