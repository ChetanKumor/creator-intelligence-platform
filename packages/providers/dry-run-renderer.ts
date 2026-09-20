import { CONTRACT_VERSION, RenderResultSchema, UniversalEditPlanSchema } from "../contracts/index.js";
import type { RenderResult, UniversalEditPlan } from "../domain/index.js";
import { planDigest } from "../validation/index.js";
import type { Renderer } from "./index.js";

export class DryRunRenderer implements Renderer {
  readonly id = "dry_run_renderer";
  readonly version = "1.0.0";
  readonly mode = "dry_run" as const;
  constructor(private readonly context: { readonly renderId: string; readonly jobId: string; readonly now: () => string }) {}

  async render(input: UniversalEditPlan): Promise<RenderResult> {
    const plan = UniversalEditPlanSchema.parse(input);
    return RenderResultSchema.parse({
      contractType: "RenderResult", schemaVersion: CONTRACT_VERSION,
      renderId: this.context.renderId, projectId: plan.projectId, jobId: this.context.jobId,
      planId: plan.planId, planRevision: plan.revision, planDigest: planDigest(plan),
      renderer: this.id, rendererVersion: this.version, completedAt: this.context.now(),
      kind: "dry_run", status: "simulated", plannedDurationSeconds: plan.output.targetDurationSeconds, plannedClipCount: plan.clips.length,
    });
  }
}
