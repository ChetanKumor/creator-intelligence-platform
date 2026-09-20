import { JobStateSchema, ProcessingStageSchema, QCResultSchema, RenderResultSchema, TimestampSchema } from "../contracts/index.js";
import type { JobFailure, JobState, JobStatus, QCResult, RenderResult } from "../domain/index.js";

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  UPLOADED: ["ANALYZING_REFERENCE", "ANALYZING_FOOTAGE"],
  ANALYZING_REFERENCE: ["ANALYZING_FOOTAGE"],
  ANALYZING_FOOTAGE: ["ANALYZING_AUDIO", "MATCHING"],
  ANALYZING_AUDIO: ["MATCHING"],
  MATCHING: ["PLANNING"],
  PLANNING: ["RENDERING_PREVIEW"],
  RENDERING_PREVIEW: ["QC"],
  QC: ["PREVIEW_READY", "COMPLETE"],
  PREVIEW_READY: ["REVISION_REQUESTED", "RENDERING_FINAL"],
  REVISION_REQUESTED: ["MATCHING", "PLANNING"],
  RENDERING_FINAL: ["QC"],
  COMPLETE: [], FAILED: [],
};
function checkedTime(job: JobState, at: string): string {
  const timestamp = TimestampSchema.parse(at);
  if (timestamp < job.updatedAt) throw new Error("Job timestamps cannot move backwards.");
  return timestamp;
}
export interface TransitionContext { readonly at: string; readonly planId?: string; readonly render?: RenderResult; readonly qc?: QCResult }

export function transitionJob(input: JobState, next: JobStatus, context: TransitionContext): JobState {
  const job = JobStateSchema.parse(input);
  const at = checkedTime(job, context.at);
  if (!transitions[job.state].includes(next)) throw new Error(`Illegal job transition: ${job.state} -> ${next}`);
  const result: JobState = { ...job, state: next, stateVersion: job.stateVersion + 1, updatedAt: at };
  if (next === "REVISION_REQUESTED") {
    result.revision += 1;
    result.activePlanId = null;
    result.activeRenderId = null;
    result.activeRenderKind = null;
    result.renderIntent = null;
  }
  if (next === "RENDERING_PREVIEW" || next === "RENDERING_FINAL") {
    if (next === "RENDERING_FINAL" && context.planId !== undefined && context.planId !== job.activePlanId) throw new Error("Final rendering must use the plan that passed preview QC.");
    result.activePlanId = context.planId ?? job.activePlanId;
    result.activeRenderId = null;
    result.activeRenderKind = null;
    result.renderIntent = next === "RENDERING_PREVIEW" ? "preview" : "final";
  }
  if (next === "QC") {
    const render = RenderResultSchema.parse(context.render);
    if (render.kind === "failure" || render.projectId !== job.projectId || render.jobId !== job.jobId || render.planId !== job.activePlanId || render.planRevision !== job.revision || render.completedAt > at) throw new Error("QC requires a successful or simulated render receipt for the active plan.");
    result.activeRenderId = render.renderId;
    result.activeRenderKind = render.kind;
  }
  if (next === "PREVIEW_READY" || next === "COMPLETE") {
    if (job.activeRenderKind !== "media") throw new Error("Delivery requires a media render; dry-run receipts cannot be promoted.");
    const qc = QCResultSchema.parse(context.qc);
    if (qc.projectId !== job.projectId || qc.jobId !== job.jobId || qc.planId !== job.activePlanId || qc.planRevision !== job.revision || qc.renderId !== job.activeRenderId || qc.checkedAt > at || !qc.deliveryAllowed) throw new Error("Delivery requires passing independent media QC for the active render.");
    if ((next === "COMPLETE" && job.renderIntent !== "final") || (next === "PREVIEW_READY" && job.renderIntent !== "preview")) throw new Error("QC destination must match render intent.");
  }
  return JobStateSchema.parse(result);
}

export function failJob(input: JobState, failure: JobFailure): JobState {
  const job = JobStateSchema.parse(input);
  if (ProcessingStageSchema.parse(job.state) !== failure.stage) throw new Error("Failure stage must match the active stage.");
  return JobStateSchema.parse({ ...job, state: "FAILED", stateVersion: job.stateVersion + 1, failure, updatedAt: checkedTime(job, failure.failedAt) });
}
export function retryJob(input: JobState, at: string): JobState {
  const job = JobStateSchema.parse(input);
  if (job.state !== "FAILED" || job.failure === null || !job.failure.retryable) throw new Error("Job has no retryable failure.");
  return JobStateSchema.parse({ ...job, state: job.failure.stage, stateVersion: job.stateVersion + 1, attempt: job.attempt + 1, failure: null, updatedAt: checkedTime(job, at) });
}
