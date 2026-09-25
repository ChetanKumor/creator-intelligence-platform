/**
 * Verified content-addressed source staging, bound to a won claim. The bytes the runtime verifies are the bytes a future
 * renderer consumes: one opened source handle is read once, and each chunk is hashed and written to a private pending object
 * from the same buffer; only exactly the authorized hash and size is sealed, synced and published under its
 * content-addressed name with a no-overwrite primitive; the final object is then reopened and fully re-verified. The original
 * source path is never reopened for execution. A staged object is byte identity, never access authorization.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { MAX_STAGED_SOURCE_BYTES, RUNTIME_IMPLEMENTATION, STAGING_CHUNK_BYTES, check, guardAsync, header, ownedKey, parse, type EditRuntimeErrorCode } from "./common.js";
import { checkGrantWindow, runtimeNow, verifyClaim } from "./ledger.js";
import type { ByteReader, EditRuntime, PendingStagedObject } from "./ports.js";
import { createStagedSourceReceipt, stagedObjectIdOf, type StagedSourceReceipt } from "./records.js";
import { checkMediaGrantAt, requireCall, type RuntimeCall } from "./call.js";

interface Digest { contentHash: string; sizeBytes: number }
/**
 * Reads one handle positionally, never more than one byte past the expected length, hashing exactly the bytes read. When a
 * sink is given, the same buffer is written to it before the next read reuses the buffer.
 */
async function digest(reader: ByteReader, expectedSize: number, readCode: EditRuntimeErrorCode, sink?: PendingStagedObject): Promise<Digest> {
  const hash = createHash("sha256"), buffer = new Uint8Array(Math.min(STAGING_CHUNK_BYTES, expectedSize + 1));
  let total = 0;
  for (;;) {
    const target = buffer.subarray(0, Math.min(buffer.length, expectedSize + 1 - total));
    const count = await guardAsync(readCode, () => reader.read(target, total));
    check(Number.isSafeInteger(count) && count >= 0 && count <= target.length, readCode, "A reader returned an impossible byte count.");
    if (count === 0) break;
    const chunk = target.subarray(0, count);
    hash.update(chunk);
    if (sink !== undefined) await guardAsync("runtime_storage_unavailable", () => sink.write(chunk));
    total += count;
    if (total > expectedSize) break;
  }
  return { contentHash: hash.digest("hex"), sizeBytes: total };
}
/** Reopens a final content-addressed object and re-verifies it in full: a regular file, not a link, of exactly the expected bytes. */
export async function verifyStagedObject(runtime: EditRuntime, expected: Digest): Promise<void> {
  const opened = await guardAsync("staged_object_corrupt", () => runtime.staging.openFinal(ownedKey(stagedObjectIdOf(expected), "staged_source_object_v0")));
  check(opened.state !== "absent", "staged_object_missing", "The content-addressed staged object does not exist.");
  check(opened.state === "present", "staged_object_corrupt", `The staged object is unusable (${opened.state === "unusable" ? opened.reason : "unknown"}); it is never repaired.`);
  try {
    check(opened.reader.sizeBytes === expected.sizeBytes, "staged_object_corrupt", "The staged object does not have the authorized size; it is never repaired.");
    const observed = await digest(opened.reader, expected.sizeBytes, "staged_object_corrupt");
    check(observed.sizeBytes === expected.sizeBytes && observed.contentHash === expected.contentHash, "staged_object_corrupt",
      "The staged object's full bytes are not the authorized bytes; it is never overwritten or regenerated.");
  } finally { await opened.reader.close().catch(() => undefined); }
}
/** Copies exactly the authorized bytes from one opened handle into a sealed pending object and publishes it without overwriting. */
async function copyAndPublish(runtime: EditRuntime, reader: ByteReader, expected: Digest): Promise<"published" | "exists"> {
  let pending: PendingStagedObject | undefined;
  try {
    check(reader.sizeBytes === expected.sizeBytes, "source_size_mismatch", "The opened source does not have the authorized byte length.");
    pending = await guardAsync("runtime_storage_unavailable", () => runtime.staging.createPending());
    const sink = pending;
    const observed = await digest(reader, expected.sizeBytes, "source_unavailable", sink);
    check(observed.sizeBytes === expected.sizeBytes, "source_size_mismatch", "The bytes copied from the opened source do not have the authorized length.");
    check(observed.contentHash === expected.contentHash, "source_hash_mismatch", "The bytes copied from the opened source are not the authorized bytes.");
    await guardAsync("runtime_storage_unavailable", () => sink.seal());
    const outcome = await guardAsync("runtime_storage_unavailable", () => sink.publish(ownedKey(stagedObjectIdOf(expected), "staged_source_object_v0")));
    check(outcome === "published" || outcome === "exists", "runtime_storage_unavailable", "The staging store returned no publication outcome.");
    return outcome;
  } finally {
    // The pending name is private runtime garbage in every outcome; a published final object keeps its own name.
    if (pending !== undefined) await pending.discard().catch(() => undefined);
  }
}
const StageRequestSchema = z.strictObject({ assetId: IdSchema });
export async function stageClaimedSource(call: RuntimeCall, requestInput: unknown): Promise<StagedSourceReceipt> {
  const { dag, runtime, ownership } = requireCall(call);
  const request = parse(StageRequestSchema, requestInput);
  const { claim } = await verifyClaim(dag, runtime, ownership);
  const source = dag.admission.sources.find(s => s.assetId === request.assetId);
  check(source !== undefined, "source_not_admitted", "Only a source admitted by this exact DAG can be staged.");
  // Causal order first: a stage that would start before its claim refuses before any source is resolved, opened or published.
  const stagingStartedAt = runtimeNow(runtime);
  check(stagingStartedAt >= claim.claimedAt, "evidence_chronology_invalid", "Staging cannot start before the claim it is bound to.");
  checkGrantWindow(dag.grant, stagingStartedAt);
  checkMediaGrantAt(dag, source.assetId, stagingStartedAt);
  const expected = { contentHash: source.contentHash, sizeBytes: source.sizeBytes };
  check(expected.sizeBytes <= MAX_STAGED_SOURCE_BYTES, "limit_exceeded", "The admitted source exceeds the accepted local source limit.");
  const resolved = await guardAsync("source_unavailable", () => runtime.sources.resolve(source.assetId));
  const reader = await guardAsync("source_unavailable", () => runtime.sources.open(resolved));
  let publication: "published" | "exists";
  try { publication = await copyAndPublish(runtime, reader, expected); } finally { await reader.close().catch(() => undefined); }
  await verifyStagedObject(runtime, expected);
  // A clock rewound during the byte work can never date a receipt before its own start (and so never before its claim).
  const stagedAt = runtimeNow(runtime);
  check(stagedAt >= stagingStartedAt, "evidence_chronology_invalid", "Staging cannot complete before it started; the runtime clock ran backwards.");
  return createStagedSourceReceipt({ ...header("StagedSourceReceipt"), scope: dag.dag.scope,
    claim: { claimId: claim.claimId, claimTargetId: claim.claimTarget.claimTargetId }, attemptRegistration: claim.attemptRegistration, dag: claim.dag,
    admission: claim.admission, source: { assetId: source.assetId, sourceAccessReceipt: source.receipt }, expected,
    observed: { ...expected, hashScope: "exact_bytes_copied_from_one_opened_source_handle" },
    stagedObject: { stagedObjectId: stagedObjectIdOf(expected), publication: publication === "published" ? "published_by_this_stage" : "existing_object_reverified",
      verification: "reopened_final_object_full_sha256_and_size" },
    staging: { implementation: RUNTIME_IMPLEMENTATION, durability: runtime.staging.durability }, stagingStartedAt, stagedAt,
    basis: "claim_bound_same_handle_copy_hash_no_overwrite_publication_v0" });
}
