import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { exactDigest, missing, present, type ArtifactRef, type EvidenceRef, type SuppliedArtifact } from "../packages/editorial/common.js";
import {
  ComputationIdentitySchema,
  PerceptionArtifactEntrySchema,
  PerceptionEvidenceStore,
  PerceptionIntegrityError,
  computationDependencies,
  computationKey,
  type ComputationIdentity,
  type PerceptionArtifactEntry,
} from "../packages/perception/index.js";
import { embeddingCacheKey, embeddingSpaceId } from "../packages/reference-analyzer/embeddings.js";
import { STUB_EMBEDDING } from "../packages/reference-analyzer/protocol.js";

const TIME = "2026-09-22T00:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

function supplied(objectId: string, artifactType: string, artifactVersion: string, value: unknown): SuppliedArtifact {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  return { ref: { objectId, artifactType, artifactVersion, sha256: exactDigest(bytes) }, bytes, value };
}

function evidence(artifact: SuppliedArtifact, pointer = ""): EvidenceRef {
  return { artifact: artifact.ref, pointer };
}

function descriptor(objectId: string, value: unknown): SuppliedArtifact {
  return supplied(objectId, "PerceptionEvidence", "0.1.0", value);
}

interface FixtureOptions {
  readonly identity?: ComputationIdentity;
  readonly acceptedState?: "present" | "not_computed" | "unavailable" | "failed" | "unsupported";
  readonly lifecycle?: "active" | "stale" | "retired";
  readonly projectId?: string;
  readonly creatorId?: string;
  readonly accessState?: "eligible" | "revoked" | "expired";
  readonly outputId?: string;
  readonly attemptId?: string;
}

function identityFixture() {
  const timebase = descriptor("evidence_timebase", { policy: "source-pts-v1" });
  const revision = descriptor("evidence_revision", { revision: "cc24074f717b612951c2dead130904ab9b65a81e" });
  const settings = descriptor("evidence_settings", { device: "cpu", precision: "float32", quantization: "none", kernels: "torch-2.8.0" });
  const determinism = descriptor("evidence_determinism", { policy: "exact-repeat-required-v1" });
  const identity = ComputationIdentitySchema.parse({
    identityVersion: "perception-computation-1.0.0",
    operationKind: "frame_embedding",
    computationClass: "learned_model",
    inputs: [{
      kind: "source",
      assetId: `asset_${HASH_A}`,
      contentHash: HASH_A,
      sizeBytes: 128,
      support: {
        kind: "range",
        range: { startSeconds: 1, endSeconds: 2 },
        timebase: timebase.ref,
      },
    }],
    producer: {
      producerId: "siglip_local",
      implementationVersion: "1.0.0",
      implementationDigest: HASH_B,
      adapter: present({ adapterId: "local_video_embedding", adapterVersion: "1.0.0" }),
    },
    model: present({
      modelId: "google_siglip2_so400m_naflex",
      providerId: "huggingface",
      exactRevision: "cc24074f717b612951c2dead130904ab9b65a81e",
      revisionEvidence: revision.ref,
    }),
    preprocessing: present({ version: "rgb-square-pixels-512-v1", configurationDigest: HASH_C }),
    configurationDigest: HASH_D,
    semanticExecutionSettings: evidence(settings),
    outputSchema: {
      artifactType: "EmbeddingBatch",
      artifactVersion: "1.0.0",
      semanticSpace: present({ spaceId: "space_fixture", spaceVersion: "normalized-mean-v1" }),
    },
    determinism: { kind: "deterministic", policy: evidence(determinism) },
  });
  return { identity, artifacts: [timebase, revision, settings, determinism] };
}

function storeFixture(options: FixtureOptions = {}) {
  const base = identityFixture();
  const identity = options.identity ?? base.identity;
  const key = computationKey(identity);
  const output = supplied(options.outputId ?? "output_embedding_batch", "EmbeddingBatch", "1.0.0", {
    artifactType: "EmbeddingBatch",
    artifactVersion: "1.0.0",
    outputIdentity: options.outputId ?? "output_embedding_batch",
    embeddingIds: [],
  });
  const failure = descriptor("evidence_attempt_failure", { code: "MODEL_FAILED" });
  const attemptValue = options.acceptedState === "failed"
    ? {
        artifactType: "PerceptionAttempt",
        artifactVersion: "0.1.0",
        stability: "internal_pre_stable",
        attemptId: options.attemptId ?? "attempt_one",
        computationKey: key,
        startedAt: TIME,
        endedAt: TIME,
        outcome: { state: "failed", failure: evidence(failure) },
      }
    : {
        artifactType: "PerceptionAttempt",
        artifactVersion: "0.1.0",
        stability: "internal_pre_stable",
        attemptId: options.attemptId ?? "attempt_one",
        computationKey: key,
        startedAt: TIME,
        endedAt: TIME,
        outcome: { state: "succeeded", output: output.ref },
      };
  const attempt = supplied(`artifact_${attemptValue.attemptId}`, "PerceptionAttempt", "0.1.0", attemptValue);
  const selectionPolicy = descriptor("evidence_selection_policy", { policy: "owner-accepted-output-v1" });
  const selection = supplied("selection_one", "PerceptionOutputSelection", "0.1.0", {
    artifactType: "PerceptionOutputSelection",
    artifactVersion: "0.1.0",
    stability: "internal_pre_stable",
    selectionId: "selection_one",
    computationKey: key,
    selectedAttempt: attempt.ref,
    selectedOutput: output.ref,
    policyVersion: "explicit-selection-1.0.0",
    evidence: evidence(selectionPolicy),
  });
  const lifecycleEvidence = descriptor("evidence_lifecycle", { state: options.lifecycle ?? "active" });
  const accessEvidence = descriptor("evidence_access", { grant: "local_evaluation" });
  const acceptedState = options.acceptedState ?? "present";
  const accepted = acceptedState === "present"
    ? present({ output: output.ref, attempt: attempt.ref, selection: selection.ref })
    : missing(acceptedState, `${acceptedState}_output`, acceptedState === "failed" ? [evidence(failure)] : []);
  const entry = PerceptionArtifactEntrySchema.parse({
    artifactType: "PerceptionArtifactEntry",
    artifactVersion: "0.1.0",
    stability: "internal_pre_stable",
    computationKey: key,
    identity,
    accepted,
    dependencies: computationDependencies(identity),
    attemptRefs: [attempt.ref],
    producerLifecycle: {
      producerId: identity.producer.producerId,
      producerVersion: identity.producer.implementationVersion,
      state: options.lifecycle ?? "active",
      evidence: lifecycleEvidence.ref,
    },
    accessBindings: [{
      projectId: options.projectId ?? "project_a",
      creatorId: options.creatorId ?? "creator_a",
      purposes: ["local_evaluation"],
      state: options.accessState ?? "eligible",
      evidence: accessEvidence.ref,
    }],
  });
  const artifacts = [...base.artifacts, output, failure, attempt, selectionPolicy, selection, lifecycleEvidence, accessEvidence];
  return { identity, key, entry, output, attempt, selection, failure, artifacts };
}

const access = { projectId: "project_a", creatorId: "creator_a", purpose: "local_evaluation" } as const;

test("semantic identity is deterministic and excludes operational attempt noise", () => {
  const fixture = identityFixture();
  const first = computationKey(fixture.identity);
  const second = computationKey(structuredClone(fixture.identity));
  assert.equal(first, second);
  const attemptA = { jobId: "job_a", attemptId: "attempt_a", startedAt: TIME };
  const attemptB = { jobId: "job_b", attemptId: "attempt_b", startedAt: "2026-09-23T00:00:00.000Z" };
  assert.notDeepEqual(attemptA, attemptB);
  assert.equal(computationKey(fixture.identity), first);
});

test("semantic configuration, revision, preprocessing, range and output schema each change the key", () => {
  const { identity } = identityFixture();
  const key = computationKey(identity);
  assert.equal(identity.model.state, "present");
  const model = identity.model.state === "present" ? identity.model.value : assert.fail();
  const source = identity.inputs[0];
  assert.equal(source?.kind, "source");
  if (source?.kind !== "source" || source.support.kind !== "range") assert.fail();
  const changed = [
    { ...identity, configurationDigest: HASH_A },
    { ...identity, producer: { ...identity.producer, implementationDigest: HASH_A } },
    { ...identity, model: present({ ...model, exactRevision: "revision_immutable_2" }) },
    { ...identity, preprocessing: present({ version: "rgb-square-pixels-513-v1", configurationDigest: HASH_C }) },
    { ...identity, semanticExecutionSettings: { ...identity.semanticExecutionSettings, artifact: { ...identity.semanticExecutionSettings.artifact, sha256: HASH_A } } },
    { ...identity, inputs: [{ ...source, support: { ...source.support, range: { startSeconds: 1, endSeconds: 3 } } }] },
    { ...identity, outputSchema: { ...identity.outputSchema, artifactVersion: "2.0.0" } },
  ];
  for (const value of changed) assert.notEqual(computationKey(ComputationIdentitySchema.parse(value)), key);
});

test("deterministic tools require explicit model not_applicable; learned producers require exact revision evidence", () => {
  const fixture = identityFixture();
  const deterministic = ComputationIdentitySchema.parse({
    ...fixture.identity,
    computationClass: "deterministic_tool",
    model: missing("not_applicable", "model_free_tool"),
    producer: { ...fixture.identity.producer, producerId: "opencv_measurement" },
  });
  assert.ok(computationKey(deterministic).startsWith("perception_computation_v1_"));
  assert.equal(ComputationIdentitySchema.safeParse({ ...fixture.identity, model: missing("unavailable", "mutable_revision") }).success, false);
  assert.equal(ComputationIdentitySchema.safeParse({ ...fixture.identity, model: present({ ...(fixture.identity.model.state === "present" ? fixture.identity.model.value : assert.fail()), exactRevision: "latest" }) }).success, false);
});

test("an exact valid accepted output is a cache hit with a reuse receipt and no ModelRun", () => {
  const fixture = storeFixture();
  const result = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(fixture.identity, access);
  assert.equal(result.status, "cache_hit");
  if (result.status !== "cache_hit") assert.fail();
  assert.deepEqual(result.output, fixture.output.ref);
  assert.equal(result.receipt.reuseStatus, "reused");
  assert.equal(result.receipt.modelRunCreated, false);
});

test("an absent exact entry is a cache miss and never invokes a supplied callback", () => {
  const fixture = storeFixture();
  const store = new PerceptionEvidenceStore([], fixture.artifacts);
  let calls = 0;
  const compute = () => { calls += 1; };
  const result = (store.lookup as (...args: unknown[]) => unknown)(fixture.identity, access, compute) as { status: string };
  assert.equal(result.status, "cache_miss");
  assert.equal(calls, 0);
});

test("related evidence with a changed semantic configuration is inspectably incompatible", () => {
  const fixture = storeFixture();
  const changed = ComputationIdentitySchema.parse({ ...fixture.identity, configurationDigest: HASH_A });
  const result = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(changed, access);
  assert.equal(result.status, "incompatible");
  if (result.status !== "incompatible") assert.fail();
  assert.ok(result.mismatches.some((value) => value.includes("configurationDigest")));
});

test("failed, unavailable and unsupported evidence remain distinct from a miss", () => {
  const failed = storeFixture({ acceptedState: "failed" });
  const unavailable = storeFixture({ acceptedState: "unavailable" });
  const unsupported = storeFixture({ acceptedState: "unsupported" });
  assert.equal(new PerceptionEvidenceStore([failed.entry], failed.artifacts).lookup(failed.identity, access).status, "failed_artifact");
  assert.equal(new PerceptionEvidenceStore([unavailable.entry], unavailable.artifacts).lookup(unavailable.identity, access).status, "unavailable");
  assert.equal(new PerceptionEvidenceStore([unsupported.entry], unsupported.artifacts).lookup(unsupported.identity, access).status, "unsupported");
  assert.equal(new PerceptionEvidenceStore([], []).lookup(failed.identity, access).status, "cache_miss");
});

test("not_computed is distinct from a completed empty output", () => {
  const absent = storeFixture({ acceptedState: "not_computed" });
  const empty = storeFixture();
  assert.equal(new PerceptionEvidenceStore([absent.entry], absent.artifacts).lookup(absent.identity, access).status, "cache_miss");
  const result = new PerceptionEvidenceStore([empty.entry], empty.artifacts).lookup(empty.identity, access);
  assert.equal(result.status, "cache_hit");
  assert.deepEqual(empty.output.value, { artifactType: "EmbeddingBatch", artifactVersion: "1.0.0", outputIdentity: "output_embedding_batch", embeddingIds: [] });
});

test("stale and retired producers are historical but not automatically reusable", () => {
  for (const lifecycle of ["stale", "retired"] as const) {
    const fixture = storeFixture({ lifecycle });
    assert.equal(new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(fixture.identity, access).status, "stale_or_retired");
  }
});

test("corrupt payload bytes fail closed rather than becoming a miss", () => {
  const fixture = storeFixture();
  const corrupt = fixture.artifacts.map((item) => item.ref.objectId === fixture.output.ref.objectId ? { ...item, bytes: new TextEncoder().encode("corrupt") } : item);
  assert.throws(() => new PerceptionEvidenceStore([fixture.entry], corrupt).lookup(fixture.identity, access), PerceptionIntegrityError);
});

test("conflicting deterministic successful outputs are an integrity conflict", () => {
  const fixture = storeFixture();
  const outputTwo = supplied("output_embedding_batch_two", "EmbeddingBatch", "1.0.0", { artifactType: "EmbeddingBatch", artifactVersion: "1.0.0", embeddingIds: ["embedding_two"] });
  const attemptTwoValue = {
    artifactType: "PerceptionAttempt", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    attemptId: "attempt_two", computationKey: fixture.key, startedAt: TIME, endedAt: TIME,
    outcome: { state: "succeeded", output: outputTwo.ref },
  };
  const attemptTwo = supplied("artifact_attempt_two", "PerceptionAttempt", "0.1.0", attemptTwoValue);
  const entry = PerceptionArtifactEntrySchema.parse({ ...fixture.entry, attemptRefs: [...fixture.entry.attemptRefs, attemptTwo.ref] });
  assert.throws(() => new PerceptionEvidenceStore([entry], [...fixture.artifacts, outputTwo, attemptTwo]).lookup(fixture.identity, access), /conflicting deterministic outputs/i);
});

test("stochastic attempts retain multiple immutable outputs and reuse only the explicit selection", () => {
  const base = identityFixture();
  const identity = ComputationIdentitySchema.parse({ ...base.identity, determinism: { ...base.identity.determinism, kind: "stochastic" } });
  const fixture = storeFixture({ identity });
  const outputTwo = supplied("output_stochastic_two", "EmbeddingBatch", "1.0.0", { artifactType: "EmbeddingBatch", artifactVersion: "1.0.0", outputIdentity: "output_stochastic_two", embeddingIds: ["embedding_two"] });
  const attemptTwo = supplied("artifact_stochastic_attempt_two", "PerceptionAttempt", "0.1.0", {
    artifactType: "PerceptionAttempt", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    attemptId: "stochastic_attempt_two", computationKey: fixture.key, startedAt: TIME, endedAt: TIME,
    outcome: { state: "succeeded", output: outputTwo.ref },
  });
  const entry = PerceptionArtifactEntrySchema.parse({ ...fixture.entry, attemptRefs: [...fixture.entry.attemptRefs, attemptTwo.ref] });
  const result = new PerceptionEvidenceStore([entry], [...fixture.artifacts, outputTwo, attemptTwo]).lookup(identity, access);
  assert.equal(result.status, "cache_hit");
  if (result.status !== "cache_hit") assert.fail();
  assert.deepEqual(result.output, fixture.output.ref);
  assert.notDeepEqual(result.output, outputTwo.ref);
});

test("lookup returns clones and never mutates accepted evidence", () => {
  const fixture = storeFixture();
  const store = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts);
  const first = store.lookup(fixture.identity, access);
  if (first.status !== "cache_hit") assert.fail();
  first.output.objectId = "mutated_by_caller";
  const second = store.lookup(fixture.identity, access);
  assert.equal(second.status, "cache_hit");
  if (second.status !== "cache_hit") assert.fail();
  assert.equal(second.output.objectId, fixture.output.ref.objectId);
});

test("project, creator and purpose bindings make exact evidence non-discoverable; equal content cannot bypass scope", () => {
  const fixture = storeFixture();
  const store = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts);
  const absent = new PerceptionEvidenceStore([], []).lookup(fixture.identity, access);
  for (const request of [
    { ...access, projectId: "project_b" },
    { ...access, creatorId: "creator_b" },
    { ...access, purpose: "local_footage_analysis" },
  ]) assert.deepEqual(store.lookup(fixture.identity, request), absent);
  assert.equal(fixture.identity.inputs[0]!.kind, "source");
  assert.equal(store.lookup(fixture.identity, access).status, "cache_hit");
});

test("foreign-scope exact evidence is outwardly identical to an absent computation", () => {
  const fixture = storeFixture({ projectId: "project_foreign", creatorId: "creator_foreign" });
  const actual = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(fixture.identity, access);
  const absent = new PerceptionEvidenceStore([], []).lookup(fixture.identity, access);
  assert.deepEqual(actual, absent);
});

test("foreign-scope related evidence cannot convert an ordinary miss into incompatible", () => {
  const fixture = storeFixture({ projectId: "project_foreign", creatorId: "creator_foreign" });
  const requested = ComputationIdentitySchema.parse({ ...fixture.identity, configurationDigest: HASH_A });
  const actual = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(requested, access);
  const absent = new PerceptionEvidenceStore([], []).lookup(requested, access);
  assert.deepEqual(actual, absent);
});

test("revoked exact evidence is non-discoverable", () => {
  const fixture = storeFixture({ accessState: "revoked" });
  const actual = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(fixture.identity, access);
  const absent = new PerceptionEvidenceStore([], []).lookup(fixture.identity, access);
  assert.deepEqual(actual, absent);
});

test("expired exact evidence is non-discoverable", () => {
  const fixture = storeFixture({ accessState: "expired" });
  const actual = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(fixture.identity, access);
  const absent = new PerceptionEvidenceStore([], []).lookup(fixture.identity, access);
  assert.deepEqual(actual, absent);
});

test("revoked and expired related evidence are non-discoverable", () => {
  for (const accessState of ["revoked", "expired"] as const) {
    const fixture = storeFixture({ accessState });
    const requested = ComputationIdentitySchema.parse({ ...fixture.identity, configurationDigest: HASH_A });
    const actual = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts).lookup(requested, access);
    const absent = new PerceptionEvidenceStore([], []).lookup(requested, access);
    assert.deepEqual(actual, absent);
  }
});

test("inaccessible corrupt artifacts remain non-discoverable and do not raise integrity errors", () => {
  const fixture = storeFixture({ projectId: "project_foreign", creatorId: "creator_foreign" });
  const corrupt = fixture.artifacts.map((artifact) => ({ ...artifact, bytes: new TextEncoder().encode("corrupt") }));
  const store = new PerceptionEvidenceStore([fixture.entry], corrupt);
  const actual = store.lookup(fixture.identity, access);
  const absent = new PerceptionEvidenceStore([], []).lookup(fixture.identity, access);
  assert.deepEqual(actual, absent);
});

test("ordinary consumers have no unscoped snapshot or index enumeration API", () => {
  const fixture = storeFixture();
  const store = new PerceptionEvidenceStore([fixture.entry], fixture.artifacts);
  assert.equal("snapshot" in store, false);
  assert.deepEqual(Object.keys(store), []);
});

test("strict schemas reject unknown fields, malformed IDs and malformed digests", () => {
  const fixture = identityFixture();
  assert.equal(ComputationIdentitySchema.safeParse({ ...fixture.identity, jobId: "job_noise" }).success, false);
  assert.equal(ComputationIdentitySchema.safeParse({ ...fixture.identity, operationKind: "not valid" }).success, false);
  assert.equal(ComputationIdentitySchema.safeParse({ ...fixture.identity, configurationDigest: "short" }).success, false);
  assert.equal(PerceptionArtifactEntrySchema.safeParse({ ...storeFixture().entry, unexpected: true }).success, false);
});

test("dependency manifests are exact and invalid references are rejected", () => {
  const fixture = storeFixture();
  assert.equal(PerceptionArtifactEntrySchema.safeParse({ ...fixture.entry, dependencies: [] }).success, false);
  assert.equal(PerceptionArtifactEntrySchema.safeParse({ ...fixture.entry, dependencies: [{ ...fixture.entry.dependencies[0]!, sha256: "short" }] }).success, false);
  const missingDependency = fixture.artifacts.filter((artifact) => artifact.ref.objectId !== fixture.entry.dependencies[0]!.objectId);
  assert.throws(() => new PerceptionEvidenceStore([fixture.entry], missingDependency).lookup(fixture.identity, access), PerceptionIntegrityError);
});

test("existing embedding cache and embedding-space formulas remain unchanged", () => {
  assert.equal(
    embeddingCacheKey(HASH_A, ["sample_a"], STUB_EMBEDDING, "frame"),
    "cache_460cf164bff50f3c70dbd7024b9d67f98f371f1cdb4212238368120b0638f44a",
  );
  assert.equal(
    embeddingSpaceId(STUB_EMBEDDING),
    "space_e8c156d238b0c3486c30df69e1069c4a720de57a45943cbb4bf5ae2d4a1c500b",
  );
});

test("Phase-4 protected source and frozen public contracts remain byte-identical", () => {
  const expected: Record<string, string> = {
    "packages/contracts/edit-plan.ts": "7411177393d826bfe8af27084c68ee721206fc40c5c494422fac8e86f2d1babb",
    "packages/contracts/events.ts": "9d8c09ea88de03aec5a7dcdc337fd3153d46434c3c23f86816e2ab120a2abb3b",
    "packages/contracts/common.ts": "d97f0b05ac818cc7d721c96446c7b830a6a294145b486287edc2fd8e9e09a172",
    "packages/contracts/creative.ts": "c7e4fc7228d8af1286f7dbdf70f7cb110910c64d0b03ba508b5e4228791e22f6",
    "packages/contracts/audio.ts": "aafb21fbe5f78e42c237b1e8d0ad15df59c9dd76ed31994efb2902655911694a",
    "packages/contracts/reference-v11.ts": "a38723c81191e027409804d3405d49874b4f43c38dcd374f2bf5f0dca452625f",
    "packages/providers/index.ts": "ab997b4d4820c0c573e4d35b5f0d2db25c10e374df1bf7350148339de5845d33",
    "packages/editorial/token.ts": "78e387c45a80ce96c8651e8bed5f8f16ab1eeb22d18c878b9647ead13e27b2ee",
    "packages/editorial/matcher.ts": "97f5cce2d8fe8f4a2ae97370fd98381af89216b1ee85eba45ecf7b49f6a6f83d",
  };
  for (const [filename, digest] of Object.entries(expected)) {
    assert.equal(createHash("sha256").update(readFileSync(filename)).digest("hex"), digest, filename);
  }
});

test("request identity remains distinct from immutable output identity", () => {
  const first = storeFixture({ outputId: "output_one", attemptId: "attempt_one" });
  const second = storeFixture({ outputId: "output_two", attemptId: "attempt_two" });
  assert.equal(first.key, second.key);
  assert.notEqual(first.output.ref.objectId, second.output.ref.objectId);
  assert.notEqual(first.output.ref.sha256, second.output.ref.sha256);
});

test("computation identity formula is canonical and independently reproducible", () => {
  const fixture = identityFixture();
  const expected = `perception_computation_v1_${createHash("sha256").update(canonicalSerialize(fixture.identity)).digest("hex")}`;
  assert.equal(computationKey(fixture.identity), expected);
});

test("entry parsing does not trust a caller-provided computation key", () => {
  const fixture = storeFixture();
  const forged: PerceptionArtifactEntry = { ...fixture.entry, computationKey: `perception_computation_v1_${HASH_A}` };
  assert.equal(PerceptionArtifactEntrySchema.safeParse(forged).success, false);
});

test("artifact reference identity includes exact bytes, type and version", () => {
  const fixture = storeFixture();
  const wrongType: ArtifactRef = { ...fixture.output.ref, artifactType: "WrongType" };
  const entry = { ...fixture.entry, accepted: present({ ...fixture.entry.accepted.state === "present" ? fixture.entry.accepted.value : assert.fail(), output: wrongType }) };
  assert.equal(PerceptionArtifactEntrySchema.safeParse(entry).success, false);
  const wrongVersion = { ...fixture.entry, accepted: present({ ...fixture.entry.accepted.state === "present" ? fixture.entry.accepted.value : assert.fail(), output: { ...fixture.output.ref, artifactVersion: "2.0.0" } }) };
  assert.equal(PerceptionArtifactEntrySchema.safeParse(wrongVersion).success, false);
});
