/**
 * The narrow ports through which the pure Batch-2A runtime core meets the outside world: a runtime clock, ownership-token
 * entropy, a durable ledger with one atomic no-overwrite publication primitive, a content-addressed staging store, an
 * execution-only source locator and three synthetic post-claim providers. A port can move bytes and report time; it can
 * never interpret an identifier as a location or an invocation, and nothing here starts a process.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { ArtifactRefSchema, type ArtifactRef } from "../editorial/common.js";
import { HashSchema, evidenceSet } from "../edit-graph/common.js";
import { ExecutionExecutorIdentitySchema, RenderIntentSchema, type ExecutionExecutorIdentity, type RenderIntent } from "../edit-execution/common.js";
import { RuntimeEncodingSchema, RuntimeIdentitySchema, type RuntimeIdentity } from "../edit-execution/runtime.js";
import { MAX_RUNTIME_EVIDENCE, ScopeSchema, type LedgerNamespace, type Scope, type StorageDurability } from "./common.js";
import { CapabilityCheckerSchema, CapabilityRecheckOutcomeSchema, LifecycleObserverSchema, LifecycleStateSchema, RuntimeCheckerSchema,
  RuntimeRecheckOutcomeSchema } from "./records.js";

/** Runtime truth for every Batch-2A time: exact UTC milliseconds, `YYYY-MM-DDTHH:mm:ss.sssZ`. Never a caller-claimed timestamp. */
export interface RuntimeClock { now(): string }
/** A fresh 256-bit ownership token (64 lowercase hex characters) for each acquired claim. */
export interface RuntimeEntropy { ownershipToken(): string }

export type StoredRead = { state: "absent" } | { state: "present"; bytes: Uint8Array }
  | { state: "unusable"; reason: "symbolic_link" | "directory" | "not_regular_file" | "oversized" | "changed_during_read" };
/** Durable runtime authority. Keys are owned 64-hex content digests; no caller string ever becomes a storage name. */
export interface RuntimeLedger {
  readonly durability: StorageDurability;
  /**
   * Publishes complete, already-synced bytes under an owned key if and only if no record exists there, atomically: exactly
   * one concurrent publisher of a key observes `published`; every other observes `exists`. Never overwrites, never deletes.
   */
  publishExclusive(namespace: LedgerNamespace, key: string, bytes: Uint8Array): Promise<"published" | "exists">;
  read(namespace: LedgerNamespace, key: string, maximumBytes: number): Promise<StoredRead>;
}

/** Positional reads over one opened handle; `sizeBytes` is that handle's size when it was opened. */
export interface ByteReader {
  readonly sizeBytes: number;
  read(target: Uint8Array, position: number): Promise<number>;
  close(): Promise<void>;
}
/** A private, runtime-owned pending object. Only a sealed object can be published, and only under a no-overwrite primitive. */
export interface PendingStagedObject {
  write(bytes: Uint8Array): Promise<void>;
  /** Syncs the bytes, makes the object read-only and closes it. */
  seal(): Promise<void>;
  publish(key: string): Promise<"published" | "exists">;
  /** Removes only this pending name; a published final object keeps its own name. */
  discard(): Promise<void>;
}
export type StagedObjectOpen = { state: "absent" } | { state: "present"; reader: ByteReader }
  | { state: "unusable"; reason: "symbolic_link" | "directory" | "not_regular_file" | "changed_during_read" };
/** An execution-only location of a verified final object, for a future renderer; never persisted or serialized. */
export interface StagedObjectLocation { readonly localPath: string }
export interface StagingStore {
  readonly durability: StorageDurability;
  createPending(): Promise<PendingStagedObject>;
  openFinal(key: string): Promise<StagedObjectOpen>;
  locate(key: string): StagedObjectLocation;
}
/** An adapter-owned, opaque resolution of one admitted asset; its location never leaves the adapter. */
export interface ResolvedSource { readonly assetId: string }
export interface SourceLocator {
  resolve(assetId: string): Promise<ResolvedSource>;
  /** Opens exactly the resolved file, or refuses if another file now sits at its location. */
  open(resolved: ResolvedSource): Promise<ByteReader>;
}
export interface EditRuntime {
  readonly clock: RuntimeClock;
  readonly entropy: RuntimeEntropy;
  readonly ledger: RuntimeLedger;
  readonly staging: StagingStore;
  readonly sources: SourceLocator;
}

// ---------------------------------------------------------------- post-claim providers; responses are untrusted and parsed strictly
/**
 * A provider may report the instant its observation applies (`observedAt`); it must then lie inside the check window the runtime
 * clock measured around the call. The provenance may name a future real observation or probe, which Batch 2A refuses as unsupported.
 */
export interface LifecycleRequest { scope: Scope; assetId: string; contentHash: string; mediaAsset: ArtifactRef }
export const LifecycleResponseSchema = z.strictObject({ scope: ScopeSchema, assetId: IdSchema, contentHash: HashSchema, lifecycle: LifecycleStateSchema,
  observer: LifecycleObserverSchema, evidence: evidenceSet(MAX_RUNTIME_EVIDENCE, 1), observedAt: TimestampSchema.optional() });
export type LifecycleResponse = z.input<typeof LifecycleResponseSchema>;
export interface LifecycleProvider { observe(request: LifecycleRequest): Promise<LifecycleResponse> }

export interface CapabilityRecheckRequest { scope: Scope; executor: ExecutionExecutorIdentity; environment: string; requirements: { requirementId: string; capabilityId: string }[] }
export const CapabilityRecheckResponseSchema = z.strictObject({ executor: ExecutionExecutorIdentitySchema, environment: IdSchema, checker: CapabilityCheckerSchema,
  outcome: CapabilityRecheckOutcomeSchema, observedAt: TimestampSchema.optional() });
export type CapabilityRecheckResponse = z.input<typeof CapabilityRecheckResponseSchema>;
export interface CapabilityRechecker { recheck(request: CapabilityRecheckRequest): Promise<CapabilityRecheckResponse> }

export interface RuntimeRecheckRequest { scope: Scope; executor: ExecutionExecutorIdentity; environment: string; runtime: RuntimeIdentity;
  encoding: z.infer<typeof RuntimeEncodingSchema>; renderIntent: RenderIntent; renderProfile: ArtifactRef }
export const RuntimeRecheckResponseSchema = z.strictObject({ executor: ExecutionExecutorIdentitySchema, environment: IdSchema, runtime: RuntimeIdentitySchema,
  encoding: RuntimeEncodingSchema, renderIntent: RenderIntentSchema, renderProfile: ArtifactRefSchema, checker: RuntimeCheckerSchema, outcome: RuntimeRecheckOutcomeSchema,
  observedAt: TimestampSchema.optional() });
export type RuntimeRecheckResponse = z.input<typeof RuntimeRecheckResponseSchema>;
export interface RuntimeRechecker { recheck(request: RuntimeRecheckRequest): Promise<RuntimeRecheckResponse> }
