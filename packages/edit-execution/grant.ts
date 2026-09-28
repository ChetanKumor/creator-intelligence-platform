/**
 * The attributed work estimate and the explicit execution grant. Resource quantities that cannot be derived from the graph
 * (CPU, GPU, memory, elapsed time, cost) exist only as an attributed estimate bound to one exact graph, executor build,
 * encoding runtime build, execution environment, render profile, intent, policy and source set. Execution permission exists
 * only as an explicit owner or operator grant: it is never inferred from a graph, a capability state, prose, a legacy job
 * state, a planning budget or a plan.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { ArtifactRefSchema, checkIdentity, compareText, identify } from "../editorial/common.js";
import { HashSchema, Nat, evidenceSet } from "../edit-graph/common.js";
import { ActorSchema, ExecutionExecutorIdentitySchema, RenderIntentSchema, ScopeSchema, envelope, parse, refSet } from "./common.js";
import { RuntimeIdentitySchema } from "./runtime.js";

export const MAX_SOURCES = 16;
/** Attributed quantities in the units of the accepted Gate-3 ComputeBudget fields of the same names. */
const WorkQuantitiesSchema = z.strictObject({ cpuMilliseconds: Nat, gpuMilliseconds: Nat, peakRamBytes: Nat, peakVramBytes: Nat, wallClockMilliseconds: Nat,
  apiSpendInrMicros: Nat, totalCostInrMicros: Nat });
export const WORK_QUANTITIES = Object.keys(WorkQuantitiesSchema.shape) as (keyof z.infer<typeof WorkQuantitiesSchema>)[];
export const SourceIdentitySchema = z.strictObject({ assetId: IdSchema, contentHash: HashSchema });
export const SourceIdentitySetSchema = z.array(SourceIdentitySchema).min(1).max(MAX_SOURCES)
  .refine(v => new Set(v.map(s => s.assetId)).size === v.length, "Duplicate source asset.")
  .transform(v => [...v].sort((a, b) => compareText(a.assetId, b.assetId)));
const EstimateBodySchema = z.strictObject({
  ...envelope("ExecutionWorkEstimate"), scope: ScopeSchema,
  editGraph: ArtifactRefSchema, executor: ExecutionExecutorIdentitySchema, renderProfile: ArtifactRefSchema, renderIntent: RenderIntentSchema, policy: ArtifactRefSchema,
  // Resource use differs by runtime build and environment: the estimate names the exact runtime identity (never merely an attestation) and environment.
  runtime: RuntimeIdentitySchema, environment: IdSchema,
  sources: SourceIdentitySetSchema,
  estimate: WorkQuantitiesSchema,
  estimator: ActorSchema, basis: z.literal("attributed_estimate_not_measured"), estimatedAt: TimestampSchema, evidence: evidenceSet(8, 1),
});
export const ExecutionWorkEstimateSchema = EstimateBodySchema.extend({ estimateId: IdSchema })
  .refine(v => checkIdentity(v, "estimateId", "execution_work_estimate_v0"), "Execution work estimate identity mismatch.");
export type ExecutionWorkEstimate = z.infer<typeof ExecutionWorkEstimateSchema>;
export function createExecutionWorkEstimate(input: unknown): ExecutionWorkEstimate {
  return parse(ExecutionWorkEstimateSchema, identify("execution_work_estimate_v0", "estimateId", parse(EstimateBodySchema, input)));
}

const GrantBodySchema = z.strictObject({
  ...envelope("ExecutionGrant"), scope: ScopeSchema,
  editGraph: ArtifactRefSchema, graph: z.strictObject({ editGraphId: IdSchema, revision: Nat }),
  // Exactly one selected, execution-safe executor build and the environment its fresh capability evidence must describe.
  executor: ExecutionExecutorIdentitySchema, environment: IdSchema,
  renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema, policy: ArtifactRefSchema, capabilitySnapshot: ArtifactRefSchema,
  // The exact runtime-encoding attestation for this executor build and render profile; the work estimate is never capability evidence.
  runtimeAttestation: ArtifactRefSchema,
  budget: z.strictObject({ executionBudget: ArtifactRefSchema, allocation: ArtifactRefSchema, reservation: ArtifactRefSchema,
    meaning: z.literal("gate7_execution_budget_not_planning_budget") }),
  mediaGrants: refSet(2 * MAX_SOURCES), sourceReceipts: refSet(2 * MAX_SOURCES), workEstimate: ArtifactRefSchema,
  operationId: IdSchema, attempt: z.number().int().positive().safe(),
  issuedAt: TimestampSchema, expiresAt: TimestampSchema.nullable(),
  authorizer: ActorSchema, basis: z.literal("explicit_owner_or_operator_execution_authorization_v0"),
});
export const ExecutionGrantSchema = GrantBodySchema.extend({ grantId: IdSchema })
  .refine(v => v.expiresAt === null || v.expiresAt > v.issuedAt, "An execution grant must expire after it is issued.")
  .refine(v => checkIdentity(v, "grantId", "execution_grant_v0"), "Execution grant identity mismatch.");
export type ExecutionGrant = z.infer<typeof ExecutionGrantSchema>;
export function createExecutionGrant(input: unknown): ExecutionGrant {
  return parse(ExecutionGrantSchema, identify("execution_grant_v0", "grantId", parse(GrantBodySchema, input)));
}
