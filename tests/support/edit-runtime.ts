// Test-only Gate-7 Batch-2A helpers: a controlled runtime clock, isolated temporary runtime and source roots, deterministic
// real test bytes and clearly synthetic post-claim providers. No media, model, provider, subprocess or network execution;
// the bytes written here are opaque test bytes, never video.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SuppliedArtifact } from "../../packages/editorial/common.js";
import { reserve } from "../../packages/routing/index.js";
import { createRuntimeDispatchPolicy, type CapabilityRecheckRequest, type CapabilityRecheckResponse, type CapabilityRechecker, type LifecycleProvider,
  type LifecycleRequest, type LifecycleResponse, type RuntimeClock, type RuntimeRecheckRequest, type RuntimeRecheckResponse, type RuntimeRechecker } from "../../packages/edit-runtime/index.js";
import { createLocalEditRuntime, type LocalEditRuntime, type LocalEditRuntimeConfig } from "../../scripts/edit-runtime-local.js";
import { OPERATION, evidenceRef, mergeArtifacts, type BudgetChain } from "./edit-execution.js";
import { artifact, scope } from "./edit-graph.js";

export { scope };
/** Runtime-now for most tests: after the Batch-1 admission (01:00) and inside its execution grant window (until 02:00). */
export const RUNTIME_START = "2026-09-24T01:10:00.000Z";

/** A controlled runtime clock. Only the runtime reads it; no caller-claimed time is runtime truth. */
export class ManualRuntimeClock implements RuntimeClock {
  #milliseconds: number;
  constructor(start: string = RUNTIME_START) { this.#milliseconds = Date.parse(start); }
  now(): string { return new Date(this.#milliseconds).toISOString(); }
  set(at: string): void { this.#milliseconds = Date.parse(at); }
  advance(milliseconds: number): void { this.#milliseconds += milliseconds; }
}

/** Deterministic binary test bytes: SHA-256 counter-mode expansion of a seed. They are opaque bytes, not a media format. */
export function deterministicBytes(seed: string, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let block = 0, offset = 0; offset < length; block += 1, offset += 32) {
    const digest = createHash("sha256").update(`${seed}:${block}`).digest();
    bytes.set(digest.subarray(0, Math.min(32, length - offset)), offset);
  }
  return bytes;
}
export const sha256Hex = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------- isolated runtime roots (temporary, test-owned, removed after each test)
export interface EnvSource { assetId: string; bytes?: Uint8Array; name?: string }
export interface RuntimeEnvOptions {
  sources?: readonly EnvSource[];
  /** Extra execution-only mappings, e.g. deliberately invalid locations. */
  mapping?: readonly { assetId: string; path: string }[];
  extraAllowedRoots?: readonly string[];
  start?: string;
  maxSourceBytes?: number;
}
export interface RuntimeEnv {
  base: string; sourceRoot: string; runtimeRoot: string; clock: ManualRuntimeClock; runtime: LocalEditRuntime;
  sourcePath(name: string): string;
  /** Another adapter instance over the same roots: no in-memory state is shared with the first. */
  fresh(patch?: Partial<LocalEditRuntimeConfig>): Promise<LocalEditRuntime>;
  cleanup(): Promise<void>;
}
export async function runtimeEnv(options: RuntimeEnvOptions = {}): Promise<RuntimeEnv> {
  const base = await mkdtemp(join(tmpdir(), "gate7-b2a-"));
  const sourceRoot = join(base, "sources"), runtimeRoot = join(base, "runtime");
  await mkdir(sourceRoot);
  await mkdir(runtimeRoot);
  const mapping = [...(options.mapping ?? [])];
  for (const [index, source] of (options.sources ?? []).entries()) {
    const path = join(sourceRoot, source.name ?? `source_${index}.bin`);
    if (source.bytes !== undefined) await writeFile(path, source.bytes);
    mapping.push({ assetId: source.assetId, path });
  }
  const clock = new ManualRuntimeClock(options.start ?? RUNTIME_START);
  const config: LocalEditRuntimeConfig = { runtimeRoot, allowedSourceRoots: [sourceRoot, ...(options.extraAllowedRoots ?? [])], sources: mapping, clock,
    ...(options.maxSourceBytes === undefined ? {} : { maxSourceBytes: options.maxSourceBytes }) };
  const runtime = await createLocalEditRuntime(config);
  return { base, sourceRoot, runtimeRoot, clock, runtime, sourcePath: name => join(sourceRoot, name),
    fresh: patch => createLocalEditRuntime({ ...config, ...patch }), cleanup: () => rm(base, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------- forked, yet individually replay-valid, Gate-3 reservations (accepted reserve(), unmodified)
export interface ForkedReservation { history: SuppliedArtifact; value: ReturnType<typeof reserve>; artifact: SuppliedArtifact; artifacts: SuppliedArtifact[] }
/** Another immutable ReservationHistory for the same budget and allocation: Gate 3 replays each history independently. */
export function forkReservation(chain: BudgetChain, key: string, options: { prior?: { reservation: SuppliedArtifact; state: "active" | "released" }[];
  allocationIndex?: number; operationId?: string; attempt?: number } = {}): ForkedReservation {
  const allocation = options.allocationIndex === undefined ? chain.allocation : chain.allocations[options.allocationIndex]!;
  const history = artifact(`${key}_reservation_history`, "ReservationHistory", { version: "0.1.0", scope: chain.reservation.scope, budgetRef: chain.parent.artifact.ref,
    prior: (options.prior ?? []).map(p => ({ reservation: p.reservation.ref, state: p.state })) });
  const value = reserve({ scope: chain.reservation.scope, budget: chain.parent.value, budgetArtifact: chain.parent.artifact.ref, allocation: allocation.value,
    allocationArtifact: allocation.artifact.ref, historyArtifact: history.ref, operationId: options.operationId ?? OPERATION, attempt: options.attempt ?? 1 },
  mergeArtifacts(chain.artifacts, (options.prior ?? []).map(p => p.reservation), [history]));
  const reservation = artifact(`${key}_reservation`, "Reservation", value);
  return { history, value, artifact: reservation, artifacts: [history, reservation] };
}

// ---------------------------------------------------------------- synthetic, test-only post-claim providers (no external query, no probe)
export const lifecycleRecord = artifact("gate7b_synthetic_lifecycle_record", "Evidence", { scope, basis: "synthetic_current_lifecycle_record_not_an_external_query" });
export const capabilityRecord = artifact("gate7b_synthetic_capability_record", "Evidence", { scope, basis: "synthetic_post_claim_capability_record_not_a_probe" });
export const runtimeRecord = artifact("gate7b_synthetic_runtime_record", "Evidence", { scope, basis: "synthetic_post_claim_runtime_record_not_a_probe" });
export const RUNTIME_EVIDENCE: readonly SuppliedArtifact[] = [lifecycleRecord, capabilityRecord, runtimeRecord];
export const SYNTHETIC_OBSERVER = { kind: "synthetic_test", observerId: "synthetic_lifecycle_provider", version: "0.1.0",
  basis: "synthetic_test_lifecycle_provider_no_external_query_v0" } as const;
export const SYNTHETIC_CAPABILITY_CHECKER = { kind: "synthetic_test", checkerId: "synthetic_capability_rechecker", version: "0.1.0",
  basis: "synthetic_test_capability_rechecker_no_real_executor_probe_v0" } as const;
export const SYNTHETIC_RUNTIME_CHECKER = { kind: "synthetic_test", checkerId: "synthetic_runtime_rechecker", version: "0.1.0",
  basis: "synthetic_test_runtime_rechecker_no_real_runtime_probe_v0" } as const;

export class SyntheticLifecycleProvider implements LifecycleProvider {
  readonly requests: LifecycleRequest[] = [];
  constructor(private readonly patch: (request: LifecycleRequest) => Partial<LifecycleResponse> = () => ({})) {}
  async observe(request: LifecycleRequest): Promise<LifecycleResponse> {
    this.requests.push(structuredClone(request));
    return { scope: request.scope, assetId: request.assetId, contentHash: request.contentHash, lifecycle: { deletionRequestedAt: null, expiresAt: null },
      observer: SYNTHETIC_OBSERVER, evidence: [evidenceRef(lifecycleRecord)], ...this.patch(request) };
  }
}
export class SyntheticCapabilityRechecker implements CapabilityRechecker {
  readonly requests: CapabilityRecheckRequest[] = [];
  constructor(private readonly patch: (request: CapabilityRecheckRequest) => Partial<CapabilityRecheckResponse> = () => ({})) {}
  async recheck(request: CapabilityRecheckRequest): Promise<CapabilityRecheckResponse> {
    this.requests.push(structuredClone(request));
    return { executor: request.executor, environment: request.environment, checker: SYNTHETIC_CAPABILITY_CHECKER,
      outcome: { state: "available", requirements: request.requirements.map(r => ({ ...r, state: "AVAILABLE" as const })), evidence: [evidenceRef(capabilityRecord)] },
      ...this.patch(request) };
  }
}
export class SyntheticRuntimeRechecker implements RuntimeRechecker {
  readonly requests: RuntimeRecheckRequest[] = [];
  constructor(private readonly patch: (request: RuntimeRecheckRequest) => Partial<RuntimeRecheckResponse> = () => ({})) {}
  async recheck(request: RuntimeRecheckRequest): Promise<RuntimeRecheckResponse> {
    this.requests.push(structuredClone(request));
    return { executor: request.executor, environment: request.environment, runtime: request.runtime, encoding: request.encoding, renderIntent: request.renderIntent,
      renderProfile: request.renderProfile, checker: SYNTHETIC_RUNTIME_CHECKER, outcome: { state: "available", evidence: [evidenceRef(runtimeRecord)] }, ...this.patch(request) };
  }
}

/** Owner dispatch policy: recheck ages of at most 30 s and a 10 s preparation lifetime unless patched. */
export function dispatchPolicy(patch: Record<string, unknown> = {}) {
  return createRuntimeDispatchPolicy({ artifactType: "RuntimeDispatchPolicy", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope,
    author: { kind: "owner", actorId: "owner_synthetic" },
    freshness: { maxCapabilityRecheckAgeMilliseconds: 30_000, maxRuntimeRecheckAgeMilliseconds: 30_000, maxLifecycleObservationAgeMilliseconds: 30_000 },
    preparationLifetimeMilliseconds: 10_000, ...patch });
}
