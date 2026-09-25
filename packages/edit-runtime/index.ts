/**
 * Phase 5 Gate 7 Batch 2A: the runtime-safety foundation between an eligible Batch-1 ExecutionDag and any future media work.
 * A durable logical-attempt registry, an atomic execution claim, verified content-addressed source staging, claim-bound
 * post-stage and post-claim evidence and a short-lived DispatchPreparation. This core is pure over narrow ports; the local
 * filesystem and clock adapter is scripts/edit-runtime-local.ts. Nothing here decodes, encodes or renders media, starts a
 * process, reaches a network or emits a public plan, render result, QC result, decision event or confidence.
 */
export { EDIT_RUNTIME_ERROR_CODES, EDIT_RUNTIME_VERSION, EditRuntimeError, LEDGER_NAMESPACES, MAX_RUNTIME_ARTIFACTS, MAX_RUNTIME_EVIDENCE, MAX_RUNTIME_RECORD_BYTES,
  MAX_RUNTIME_SOURCES, MAX_STAGED_SOURCE_BYTES, OWNED_NAMESPACES, RUNTIME_IMPLEMENTATION, STAGING_CHUNK_BYTES, STORAGE_DURABILITY, freshUntil, isFresh, ownedKey,
  timestampAt, type EditRuntimeErrorCode, type LedgerNamespace, type OwnedNamespace, type StorageDurability } from "./common.js";
export type { ByteReader, CapabilityRecheckRequest, CapabilityRecheckResponse, CapabilityRechecker, EditRuntime, LifecycleProvider, LifecycleRequest, LifecycleResponse,
  PendingStagedObject, ResolvedSource, RuntimeClock, RuntimeEntropy, RuntimeLedger, RuntimeRecheckRequest, RuntimeRecheckResponse, RuntimeRechecker, SourceLocator,
  StagedObjectLocation, StagedObjectOpen, StagingStore, StoredRead } from "./ports.js";
export { AttemptRegistrationSchema, AttemptSlotSchema, DispatchCapabilityRecheckSchema, DispatchPreparationSchema, DispatchRuntimeRecheckSchema, EVIDENCE_GRADES,
  ExecutionClaimSchema, MAX_PREPARATION_LIFETIME_MILLISECONDS, MAX_RECHECK_AGE_MILLISECONDS, OBSERVED_AT_BASES, RuntimeDispatchPolicySchema, SYNTHETIC_EVIDENCE_GRADE,
  SYNTHETIC_TEST_PROVENANCE, SourceLifecycleObservationSchema, StagedSourceReceiptSchema, attemptSlot, createRuntimeDispatchPolicy, stagedObjectIdOf,
  type AttemptRegistration, type AttemptSlot, type DispatchCapabilityRecheck, type DispatchPreparation, type DispatchRuntimeRecheck, type ExecutionClaim,
  type RuntimeDispatchPolicy, type SourceLifecycleObservation, type StagedSourceReceipt } from "./records.js";
export { ValidatedExecutionDag, openValidatedDag, type ValidatedMediaGrant } from "./validated.js";
export { ClaimOwnership, acquireExecutionClaim, observeAttemptRegistration, observeExecutionClaim, registerAttempt, registerDagAttempt, type AcquiredClaim,
  type AttemptRegistrationResult } from "./ledger.js";
export type { RuntimeCall } from "./call.js";
export { stageClaimedSource } from "./staging.js";
export { observeSourceLifecycle, recheckDispatchCapability, recheckDispatchRuntime } from "./recheck.js";
export { PreparedStagedSourceHandle, confirmDispatchPreparationCurrent, prepareDispatch, replayDispatchPreparation, type DispatchPreparationRequest,
  type PreparedDispatch } from "./dispatch.js";
