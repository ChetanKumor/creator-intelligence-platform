/** The explicit context of one claim-bound Batch-2A step, and the runtime-now media-grant rule every step shares. */
import { equal, type SuppliedArtifact } from "../editorial/common.js";
import { check, checkArtifactUniverse } from "./common.js";
import type { ClaimOwnership } from "./ledger.js";
import type { EditRuntime } from "./ports.js";
import { requireValidated, type ValidatedExecutionDag } from "./validated.js";

export interface RuntimeCall {
  readonly dag: ValidatedExecutionDag;
  readonly runtime: EditRuntime;
  /** The in-memory proof held only by the caller that acquired the claim. */
  readonly ownership: ClaimOwnership;
  readonly artifacts: readonly SuppliedArtifact[];
}
const PORTS = ["clock", "entropy", "ledger", "staging", "sources"] as const;
export function requireCall(call: RuntimeCall): { dag: ValidatedExecutionDag; runtime: EditRuntime; ownership: unknown; artifacts: readonly SuppliedArtifact[] } {
  check(call !== null && typeof call === "object", "input_invalid", "A runtime step needs its explicit call context.");
  const dag = requireValidated(call.dag);
  const runtime: unknown = call.runtime;
  check(runtime !== null && typeof runtime === "object" && PORTS.every(port => (runtime as Record<string, unknown>)[port] !== null
    && typeof (runtime as Record<string, unknown>)[port] === "object"), "input_invalid", "A runtime with a clock, entropy, ledger, staging store and source locator is required.");
  // The supplied-artifact universe is bounded before any claim-bound step reads the ledger or builds an artifact map.
  checkArtifactUniverse(call.artifacts);
  return { dag, runtime: call.runtime, ownership: call.ownership, artifacts: call.artifacts };
}
/** The exact Batch-1 media grant of an admitted source, rechecked at runtime-now; the original grant is never rewritten. */
export function checkMediaGrantAt(dag: ValidatedExecutionDag, assetId: string, at: string): void {
  const media = dag.mediaGrants.find(m => m.assetId === assetId), admitted = dag.admission.sources.find(s => s.assetId === assetId);
  check(media !== undefined && admitted !== undefined, "media_grant_invalid", "Every admitted source needs its exact media grant.");
  const grant = media.value;
  check(equal(grant.scope, dag.dag.scope), "scope_mismatch", "A media grant for another project, creator or purpose never authorizes this execution.");
  check(grant.source.assetId === assetId && grant.source.contentHash === admitted.contentHash, "media_grant_invalid", "The media grant names another source or content hash.");
  check(grant.renderIntents.includes(dag.dag.renderIntent), "media_grant_invalid", "The media grant does not authorize this render intent.");
  check(grant.issuedAt <= at && (grant.expiresAt === null || at < grant.expiresAt), "media_grant_expired", "The media grant is not valid at runtime-now.");
}
