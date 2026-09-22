import { z } from "zod";
import { canonicalSerialize } from "../domain/serialization.js";
import {
  ArtifactRefSchema,
  EditorialArtifactMap,
  EvidenceRefSchema,
  exactDigest,
  missing,
  type ArtifactRef,
  type Missing,
  type SuppliedArtifact,
} from "../editorial/common.js";
import {
  ComputationIdentitySchema,
  PerceptionAccessRequestSchema,
  PerceptionArtifactEntrySchema,
  PerceptionAttemptSchema,
  PerceptionOutputSelectionSchema,
  PerceptionReuseReceiptSchema,
  computationKey,
  type ComputationIdentity,
  type PerceptionAccessRequest,
  type PerceptionArtifactEntry,
  type PerceptionAttempt,
  type PerceptionReuseReceipt,
} from "./identity.js";

export class PerceptionIntegrityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PerceptionIntegrityError";
  }
}

export type PerceptionLookupResult =
  | { readonly status: "cache_hit"; readonly computationKey: string; readonly output: ArtifactRef; readonly receipt: PerceptionReuseReceipt }
  | { readonly status: "cache_miss"; readonly computationKey: string; readonly missing: Missing }
  | { readonly status: "incompatible"; readonly computationKey: string; readonly mismatches: readonly string[] }
  | { readonly status: "failed_artifact"; readonly computationKey: string; readonly failure: Missing; readonly failedAttemptRefs: readonly ArtifactRef[] }
  | { readonly status: "stale_or_retired"; readonly computationKey: string; readonly producerState: "stale" | "retired"; readonly evidence: ArtifactRef }
  | { readonly status: "unavailable"; readonly computationKey: string; readonly missing: Missing }
  | { readonly status: "unsupported"; readonly computationKey: string; readonly missing: Missing };

function relationAnchors(identity: ComputationIdentity): Set<string> {
  return new Set(identity.inputs.map((input) => input.kind === "source"
    ? canonicalSerialize(["source", input.assetId, input.contentHash, input.sizeBytes])
    : canonicalSerialize(["artifact", input.role, input.artifact])));
}

function related(left: ComputationIdentity, right: ComputationIdentity): boolean {
  if (left.operationKind !== right.operationKind) return false;
  const anchors = relationAnchors(left);
  return [...relationAnchors(right)].some((anchor) => anchors.has(anchor));
}

function eligibleBinding(entry: PerceptionArtifactEntry, access: PerceptionAccessRequest) {
  return entry.accessBindings.find((binding) =>
    binding.projectId === access.projectId
    && binding.creatorId === access.creatorId
    && binding.purposes.includes(access.purpose)
    && binding.state === "eligible");
}

function miss(computationKeyValue: string): PerceptionLookupResult {
  return { status: "cache_miss", computationKey: computationKeyValue, missing: missing("not_computed", "no_exact_computation") };
}

function differencePaths(left: unknown, right: unknown, path = "identity", output: string[] = []): string[] {
  if (output.length >= 64 || canonicalSerialize(left) === canonicalSerialize(right)) return output;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) {
    output.push(path);
    return output;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) output.push(`${path}.length`);
    for (let index = 0; index < Math.min(left.length, right.length) && output.length < 64; index += 1) {
      differencePaths(left[index], right[index], `${path}[${index}]`, output);
    }
    return output;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(leftRecord, key) || !Object.hasOwn(rightRecord, key)) output.push(`${path}.${key}`);
    else differencePaths(leftRecord[key], rightRecord[key], `${path}.${key}`, output);
    if (output.length >= 64) break;
  }
  return output;
}

export class PerceptionEvidenceStore {
  readonly #entries = new Map<string, PerceptionArtifactEntry>();
  readonly #artifacts = new Map<string, SuppliedArtifact>();

  constructor(entryInputs: readonly unknown[], artifactInputs: readonly SuppliedArtifact[]) {
    for (const input of entryInputs) {
      const entry = PerceptionArtifactEntrySchema.parse(input);
      if (this.#entries.has(entry.computationKey)) throw new PerceptionIntegrityError("DUPLICATE_COMPUTATION_KEY", "A computation key has more than one index entry.");
      this.#entries.set(entry.computationKey, structuredClone(entry));
    }
    for (const input of artifactInputs) {
      const ref = ArtifactRefSchema.parse(input.ref);
      if (this.#artifacts.has(ref.objectId)) throw new PerceptionIntegrityError("DUPLICATE_ARTIFACT_OBJECT_ID", "A supplied artifact object ID is duplicated.");
      this.#artifacts.set(ref.objectId, structuredClone({ ...input, ref }));
    }
  }

  private artifact(refInput: ArtifactRef): { readonly supplied: SuppliedArtifact; readonly value: unknown } {
    const ref = ArtifactRefSchema.parse(refInput);
    const supplied = this.#artifacts.get(ref.objectId);
    if (supplied === undefined) throw new PerceptionIntegrityError("ARTIFACT_MISSING", `Required immutable artifact is missing: ${ref.objectId}`);
    try {
      if (canonicalSerialize(supplied.ref) !== canonicalSerialize(ref)) throw new Error("Conflicting artifact identity.");
      if (exactDigest(supplied.bytes) !== ref.sha256) throw new Error("Exact artifact hash mismatch.");
      const value = new EditorialArtifactMap([supplied]).get(ref);
      return { supplied, value };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown artifact integrity failure.";
      throw new PerceptionIntegrityError("ARTIFACT_INTEGRITY_FAILURE", `${ref.objectId}: ${message}`);
    }
  }

  private parseArtifact<T>(ref: ArtifactRef, schema: z.ZodType<T>): T {
    const value = this.artifact(ref).value;
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new PerceptionIntegrityError("ARTIFACT_SCHEMA_MISMATCH", `Artifact payload schema mismatch: ${ref.objectId}`);
    return parsed.data;
  }

  private resolveEvidence(input: unknown): unknown {
    const evidence = EvidenceRefSchema.parse(input);
    const supplied = this.artifact(evidence.artifact).supplied;
    try {
      return new EditorialArtifactMap([supplied]).resolve(evidence);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown evidence integrity failure.";
      throw new PerceptionIntegrityError("EVIDENCE_INTEGRITY_FAILURE", `${evidence.artifact.objectId}: ${message}`);
    }
  }

  private attempts(entry: PerceptionArtifactEntry): PerceptionAttempt[] {
    return entry.attemptRefs.map((ref) => {
      const attempt = this.parseArtifact(ref, PerceptionAttemptSchema);
      if (attempt.computationKey !== entry.computationKey) throw new PerceptionIntegrityError("ATTEMPT_IDENTITY_MISMATCH", "Attempt does not belong to the indexed computation.");
      if (attempt.outcome.state === "failed") this.resolveEvidence(attempt.outcome.failure);
      else this.artifact(attempt.outcome.output);
      return attempt;
    });
  }

  lookup(identityInput: unknown, accessInput: unknown): PerceptionLookupResult {
    const identity = ComputationIdentitySchema.parse(identityInput);
    const access = PerceptionAccessRequestSchema.parse(accessInput);
    const key = computationKey(identity);
    const exactEntry = this.#entries.get(key);
    const exactBinding = exactEntry === undefined ? undefined : eligibleBinding(exactEntry, access);
    if (exactEntry === undefined || exactBinding === undefined) {
      // Ineligible entries are deliberately indistinguishable from absent entries.
      // Discovery uses only inline scope state and never resolves inaccessible payloads.
      const candidates = [...this.#entries.values()].filter((candidate) =>
        candidate.computationKey !== key
        && eligibleBinding(candidate, access) !== undefined
        && related(identity, candidate.identity));
      if (candidates.length === 0) return miss(key);
      const mismatches = [...new Set(candidates.flatMap((candidate) => differencePaths(identity, candidate.identity)))].sort();
      return { status: "incompatible", computationKey: key, mismatches: mismatches.length === 0 ? ["identity"] : mismatches };
    }
    const entry = exactEntry;
    if (canonicalSerialize(entry.identity) !== canonicalSerialize(identity)) {
      throw new PerceptionIntegrityError("COMPUTATION_KEY_COLLISION", "Computation key resolves to a different semantic identity.");
    }

    this.artifact(exactBinding.evidence);
    this.artifact(entry.producerLifecycle.evidence);
    if (entry.producerLifecycle.state !== "active") {
      return {
        status: "stale_or_retired",
        computationKey: key,
        producerState: entry.producerLifecycle.state,
        evidence: structuredClone(entry.producerLifecycle.evidence),
      };
    }

    const attempts = this.attempts(entry);
    if (entry.accepted.state !== "present") {
      for (const evidence of entry.accepted.evidenceRefs) this.resolveEvidence(evidence);
      const failedAttemptRefs = entry.attemptRefs.filter((_, index) => attempts[index]?.outcome.state === "failed");
      if (entry.accepted.state === "failed" || (entry.accepted.state === "not_computed" && failedAttemptRefs.length > 0)) {
        const failure = entry.accepted.state === "failed" ? entry.accepted : missing("failed", "attempt_failed", attempts.filter((attempt) => attempt.outcome.state === "failed").map((attempt) => (attempt.outcome as Extract<PerceptionAttempt["outcome"], { state: "failed" }>).failure));
        return { status: "failed_artifact", computationKey: key, failure, failedAttemptRefs: structuredClone(failedAttemptRefs) };
      }
      if (entry.accepted.state === "unsupported") return { status: "unsupported", computationKey: key, missing: structuredClone(entry.accepted) };
      if (entry.accepted.state === "unavailable" || entry.accepted.state === "not_applicable") return { status: "unavailable", computationKey: key, missing: structuredClone(entry.accepted) };
      return { status: "cache_miss", computationKey: key, missing: structuredClone(entry.accepted) };
    }

    for (const dependency of entry.dependencies) this.artifact(dependency);
    const succeeded = attempts.filter((attempt): attempt is PerceptionAttempt & { outcome: { state: "succeeded"; output: ArtifactRef } } => attempt.outcome.state === "succeeded");
    const outputIdentities = new Set(succeeded.map((attempt) => canonicalSerialize(attempt.outcome.output)));
    if (entry.identity.determinism.kind === "deterministic" && outputIdentities.size > 1) {
      throw new PerceptionIntegrityError("DETERMINISTIC_OUTPUT_CONFLICT", "Identical deterministic computation has conflicting deterministic outputs.");
    }

    const accepted = entry.accepted.value;
    const selectedIndex = entry.attemptRefs.findIndex((ref) => canonicalSerialize(ref) === canonicalSerialize(accepted.attempt));
    const selectedAttempt = attempts[selectedIndex];
    if (selectedAttempt?.outcome.state !== "succeeded" || canonicalSerialize(selectedAttempt.outcome.output) !== canonicalSerialize(accepted.output)) {
      throw new PerceptionIntegrityError("ACCEPTED_ATTEMPT_MISMATCH", "Accepted output does not match its successful attempt.");
    }
    const selection = this.parseArtifact(accepted.selection, PerceptionOutputSelectionSchema);
    this.resolveEvidence(selection.evidence);
    if (selection.computationKey !== key || canonicalSerialize(selection.selectedAttempt) !== canonicalSerialize(accepted.attempt) || canonicalSerialize(selection.selectedOutput) !== canonicalSerialize(accepted.output)) {
      throw new PerceptionIntegrityError("OUTPUT_SELECTION_MISMATCH", "Output selection does not bind the accepted attempt and output.");
    }
    this.artifact(accepted.output);
    const receipt = PerceptionReuseReceiptSchema.parse({
      receiptType: "PerceptionReuseReceipt",
      receiptVersion: "0.1.0",
      computationKey: key,
      output: accepted.output,
      selectedAttempt: accepted.attempt,
      selection: accepted.selection,
      scope: access,
      reuseStatus: "reused",
      modelRunCreated: false,
    });
    return { status: "cache_hit", computationKey: key, output: structuredClone(accepted.output), receipt };
  }
}
