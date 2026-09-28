/**
 * A replay-validated ExecutionDag handle. Runtime authority starts only from an exact accepted Batch-1 DAG that passes full
 * deterministic replay (admission, grant, sources, capability, runtime, budget and reservation) in this process. The handle
 * is an in-process capability: it cannot be constructed, copied or deserialized outside this module, and it carries only the
 * immutable validated values. It is never persisted and grants nothing by itself: the durable registry and claim do.
 */
import { z } from "zod";
import { ArtifactRefSchema, equal, type ArtifactRef, type SuppliedArtifact } from "../editorial/common.js";
import { EDIT_EXECUTION_VERSION, ExecutionAdmissionSchema, ExecutionGrantSchema, ExecutionMediaGrantSchema, validateExecutionDag, type ExecutionAdmission,
  type ExecutionDag, type ExecutionGrant, type ExecutionMediaGrant } from "../edit-execution/index.js";
import { EXECUTION_DAG_VERSION } from "../edit-execution/common.js";
import { MAX_RUNTIME_SOURCES, RuntimeArtifacts, check, guard, parse, refuse } from "./common.js";
import { attemptSlot, type AttemptSlot } from "./records.js";

const CONSTRUCTION = Symbol("validated-execution-dag");
function frozen<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.freeze(item);
    for (const child of Object.values(item)) freeze(child);
  };
  freeze(copy);
  return copy;
}
export interface ValidatedMediaGrant { readonly assetId: string; readonly ref: ArtifactRef; readonly value: ExecutionMediaGrant }
interface Fields { dagRef: ArtifactRef; dag: ExecutionDag; admissionRef: ArtifactRef; admission: ExecutionAdmission; grantRef: ArtifactRef; grant: ExecutionGrant;
  mediaGrants: ValidatedMediaGrant[]; slot: AttemptSlot }
export class ValidatedExecutionDag {
  readonly #validated = true;
  readonly dagRef: ArtifactRef;
  readonly dag: ExecutionDag;
  readonly admissionRef: ArtifactRef;
  readonly admission: ExecutionAdmission;
  readonly grantRef: ArtifactRef;
  readonly grant: ExecutionGrant;
  readonly mediaGrants: readonly ValidatedMediaGrant[];
  /** The logical attempt this DAG would execute: its project and creator, and its claim target's operation and attempt. */
  readonly slot: AttemptSlot;
  constructor(construction: symbol, fields: Fields) {
    if (construction !== CONSTRUCTION) refuse("execution_dag_invalid", "A validated DAG is produced only by openValidatedDag.");
    const value = frozen(fields);
    this.dagRef = value.dagRef; this.dag = value.dag; this.admissionRef = value.admissionRef; this.admission = value.admission;
    this.grantRef = value.grantRef; this.grant = value.grant; this.mediaGrants = value.mediaGrants; this.slot = value.slot;
    Object.freeze(this);
  }
  static is(value: unknown): value is ValidatedExecutionDag {
    return typeof value === "object" && value !== null && #validated in value;
  }
}
export function requireValidated(value: unknown): ValidatedExecutionDag {
  check(ValidatedExecutionDag.is(value), "execution_dag_invalid", "Runtime work needs a DAG replay-validated by openValidatedDag in this process.");
  return value;
}

const RequestSchema = z.strictObject({ dag: ArtifactRefSchema });
/** Full deterministic replay of an exact supplied ExecutionDag, then the exact admission, grant and media grants it names. */
export function openValidatedDag(requestInput: unknown, artifacts: readonly SuppliedArtifact[]): ValidatedExecutionDag {
  const request = parse(RequestSchema, requestInput, "execution_dag_invalid");
  const supplied = new RuntimeArtifacts(artifacts);
  const value = supplied.exact(request.dag, "ExecutionDag", EXECUTION_DAG_VERSION, "execution_dag_invalid");
  const dag = guard("execution_dag_invalid", () => validateExecutionDag(value, artifacts));
  check(dag.dispatch.state === "not_claimed" && dag.dispatch.requirement === "atomic_runtime_claim_required", "execution_dag_invalid",
    "Only an unclaimed DAG that still requires an atomic runtime claim can gain runtime authority.");
  const admission = parse(ExecutionAdmissionSchema, supplied.exact(dag.admission, "ExecutionAdmission", EDIT_EXECUTION_VERSION, "execution_dag_invalid"), "execution_dag_invalid");
  const target = dag.dispatch.claimTarget;
  check(equal(admission.scope, dag.scope) && admission.budget.reservationId === target.reservationId && admission.operationId === target.operationId
    && admission.attempt === target.attempt, "execution_dag_invalid", "The claim target must be the admitted reservation attempt.");
  const grant = parse(ExecutionGrantSchema, supplied.exact(admission.executionGrant, "ExecutionGrant", EDIT_EXECUTION_VERSION, "execution_dag_invalid"), "execution_dag_invalid");
  check(admission.sources.length <= MAX_RUNTIME_SOURCES, "limit_exceeded", "Too many admitted sources.");
  const mediaGrants = admission.sources.map(source => ({ assetId: source.assetId, ref: source.mediaGrant,
    value: parse(ExecutionMediaGrantSchema, supplied.exact(source.mediaGrant, "ExecutionMediaGrant", EDIT_EXECUTION_VERSION, "execution_dag_invalid"), "execution_dag_invalid") }));
  const slot = attemptSlot({ projectId: dag.scope.projectId, creatorId: dag.scope.creatorId, operationId: target.operationId, attempt: target.attempt });
  return new ValidatedExecutionDag(CONSTRUCTION, { dagRef: request.dag, dag, admissionRef: dag.admission, admission, grantRef: admission.executionGrant, grant,
    mediaGrants, slot });
}
