import { z } from "zod";
import { IdSchema, TimestampSchema, envelope } from "./common.js";

export const JOB_STATUSES = ["UPLOADED", "ANALYZING_REFERENCE", "ANALYZING_FOOTAGE", "ANALYZING_AUDIO", "MATCHING", "PLANNING", "RENDERING_PREVIEW", "QC", "PREVIEW_READY", "REVISION_REQUESTED", "RENDERING_FINAL", "COMPLETE", "FAILED"] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export const ProcessingStageSchema = z.enum(["UPLOADED", "ANALYZING_REFERENCE", "ANALYZING_FOOTAGE", "ANALYZING_AUDIO", "MATCHING", "PLANNING", "RENDERING_PREVIEW", "QC", "RENDERING_FINAL"]);
export const JobFailureSchema = z.strictObject({
  stage: ProcessingStageSchema,
  code: IdSchema,
  message: z.string().min(1).max(300),
  retryable: z.boolean(),
  failedAt: TimestampSchema,
});
export const JobStateSchema = z.strictObject({
  ...envelope("JobState"),
  jobId: IdSchema,
  projectId: IdSchema,
  state: JobStatusSchema,
  stateVersion: z.number().int().nonnegative().safe(),
  attempt: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  activePlanId: IdSchema.nullable(),
  activeRenderId: IdSchema.nullable(),
  activeRenderKind: z.enum(["dry_run", "media"]).nullable(),
  renderIntent: z.enum(["preview", "final"]).nullable(),
  failure: JobFailureSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((job, ctx) => {
  if (job.updatedAt < job.createdAt) ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Job timestamps must be monotonic." });
  if ((job.state === "FAILED") !== (job.failure !== null)) ctx.addIssue({ code: "custom", path: ["failure"], message: "Only failed jobs carry a stage-specific failure." });
  if (job.failure !== null && (job.failure.failedAt < job.createdAt || job.failure.failedAt > job.updatedAt)) ctx.addIssue({ code: "custom", path: ["failure", "failedAt"], message: "Failure timestamp must be within job lifetime." });
  if (["RENDERING_PREVIEW", "RENDERING_FINAL", "QC", "PREVIEW_READY", "COMPLETE"].includes(job.state) && (job.activePlanId === null || job.renderIntent === null)) ctx.addIssue({ code: "custom", path: ["activePlanId"], message: "Rendering stages require a plan and render intent." });
  if (["QC", "PREVIEW_READY", "COMPLETE"].includes(job.state) && job.activeRenderId === null) ctx.addIssue({ code: "custom", path: ["activeRenderId"], message: "QC and completed stages require a render ID." });
  if ((job.activeRenderId === null) !== (job.activeRenderKind === null)) ctx.addIssue({ code: "custom", path: ["activeRenderKind"], message: "Render ID and kind must be recorded together." });
  if (["PREVIEW_READY", "COMPLETE"].includes(job.state) && job.activeRenderKind !== "media") ctx.addIssue({ code: "custom", path: ["activeRenderKind"], message: "Deliverable states require a media render." });
  if (["RENDERING_PREVIEW", "PREVIEW_READY"].includes(job.state) && job.renderIntent !== "preview") ctx.addIssue({ code: "custom", path: ["renderIntent"], message: "Preview stages require preview intent." });
  if (["RENDERING_FINAL", "COMPLETE"].includes(job.state) && job.renderIntent !== "final") ctx.addIssue({ code: "custom", path: ["renderIntent"], message: "Final stages require final intent." });
});
