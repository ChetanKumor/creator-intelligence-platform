import { CONTRACT_VERSION, QC_CHECKS, QCResultSchema, RenderResultSchema, TimestampSchema, UniversalEditPlanSchema } from "../contracts/index.js";
import type { QCResult, RenderResult, UniversalEditPlan } from "../domain/index.js";
import { planDigest } from "./index.js";

/** This independent seam inspects the plan/receipt only. It does not invent media observations. */
export function inspectPlanReceipt(planInput: UniversalEditPlan, receiptInput: RenderResult, options: { qcId: string; checkedAt: string }): QCResult {
  const plan = UniversalEditPlanSchema.parse(planInput);
  const receipt = RenderResultSchema.parse(receiptInput);
  const checkedAt = TimestampSchema.parse(options.checkedAt);
  if (checkedAt < receipt.completedAt || checkedAt < plan.metadata.createdAt) throw new Error("QC cannot precede the plan or render receipt.");
  const digestMatches = receipt.planDigest === planDigest(plan) && receipt.planId === plan.planId && receipt.planRevision === plan.revision && receipt.projectId === plan.projectId;
  const durationMatches = receipt.kind !== "failure" && (receipt.kind !== "dry_run" || (Math.abs(receipt.plannedDurationSeconds - plan.output.targetDurationSeconds) <= 0.000001 && receipt.plannedClipCount === plan.clips.length));
  const checks: QCResult["checks"] = QC_CHECKS.map((name) => {
    if (name === "plan_digest") return { name, status: digestMatches ? "passed" : "failed", expected: { unit: "boolean", value: true }, observed: { unit: "boolean", value: digestMatches }, reasonCode: digestMatches ? "plan_bound_to_receipt" : "plan_receipt_mismatch" };
    if (name === "timeline_duration") return { name, status: durationMatches ? "passed" : "failed", expected: { unit: "seconds", value: plan.output.targetDurationSeconds }, observed: receipt.kind === "dry_run" ? { unit: "seconds", value: receipt.plannedDurationSeconds } : receipt.kind === "failure" ? null : { unit: "seconds", value: plan.output.targetDurationSeconds }, reasonCode: durationMatches ? "plan_timing_consistent" : "render_receipt_invalid" };
    return { name, status: "not_checked", expected: null, observed: null, reasonCode: "requires_independent_media_probe" };
  });
  return QCResultSchema.parse({
    contractType: "QCResult", schemaVersion: CONTRACT_VERSION, qcId: options.qcId,
    renderId: receipt.renderId, projectId: plan.projectId, jobId: receipt.jobId, planId: plan.planId, planRevision: plan.revision,
    mode: "plan_only", policyVersion: "plan-qc-1.0.0", outcome: checks.some((check) => check.status === "failed") ? "failed" : "incomplete",
    deliveryAllowed: false, checks, checkedAt: options.checkedAt,
  });
}
