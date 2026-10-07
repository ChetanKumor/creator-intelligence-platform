// B2-A2 RED: scope-free versioned computation records over A1 synthetic fact shapes, not media execution evidence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { checkIdentity } from "../packages/editorial/common.js";
import { canonicalComputationRecordOf } from "../packages/edit-render/owner-media.js";
import { composedSource, planChain } from "./support/canonical-facts.js";
import { root } from "./support/canonical-media.js";

test("A2-C-record v0.2 binds exact source, full plan, pinned toolchain and verified output, without authorization or scope", () => {
  const { derivation } = planChain(composedSource()), record = canonicalComputationRecordOf(derivation);
  assert.equal(record.record.artifactVersion, "0.2.0");
  assert.equal(record.record.computationId, derivation.computationId);
  assert.deepEqual(record.record.plan, derivation.plan); assert.deepEqual(record.record.toolchain, derivation.toolchain);
  assert.deepEqual(record.record.output, derivation.output);
  assert.ok(checkIdentity(record.record, "recordId", "canonical_computation_record_v1"));
  assert.equal(record.bytes, `${canonicalSerialize(record.record)}\n`);
  assert.doesNotMatch(record.bytes, /rootAuthorization|creatorId|projectId|dateAdded|derivationId|authorizationBasis|sourcePath/);
  const other = planChain(composedSource(), { rootAuthorization: root({ creatorId: "creator_record_other", projectId: "project_record_other" }) });
  assert.equal(canonicalComputationRecordOf(other.derivation).bytes, record.bytes);
});
