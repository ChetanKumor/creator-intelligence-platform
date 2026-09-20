import { canonicalSerialize } from "../packages/domain/serialization.js";
import { runSyntheticPipeline } from "./pipeline.js";

const result = await runSyntheticPipeline();
process.stdout.write(`${canonicalSerialize({
  mode: result.mode,
  note: "No media, model calls, creator actions, or measured business metrics. The acceptance event is synthetic. Media QC remains incomplete.",
  render: result.render, qc: result.qc, job: result.job, telemetry: result.events, modelRuns: result.modelRuns,
})}\n`);
