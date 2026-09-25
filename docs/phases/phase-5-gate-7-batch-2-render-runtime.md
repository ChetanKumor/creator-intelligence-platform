# Phase 5 Gate 7 — Batch 2A: durable runtime authority, atomic claim, verified immutable source staging and claim-bound dispatch recheck foundation

Date: 2026-09-25

Gate 7 Batch 1: **OWNER-ACCEPTED** at `d55f0e1` (frozen; [Batch-1 report](phase-5-gate-7-execution-runtime.md) unchanged)

Gate 7 Batch 2A implementation verification: **PASS**

Gate 7 Batch 2A owner acceptance: **PENDING**

Actual FFmpeg execution: **NOT AUTHORIZED IN BATCH 2A**

Gate 7 overall: **NOT YET COMPLETE**

Batch 2A is a runtime-safety foundation only. It proves runtime authority and local storage safety over synthetic evidence and opaque test bytes. It proves nothing about rendering, pixel or audio correctness, A/V sync, FFmpeg conformance, real-media compatibility, media QC, critic or repair quality, story, pacing or professional editing quality. Staging bytes is not rendering them.

## Baseline and authority

- Branch `phase/5-edit-planner-v0`. Required and observed HEAD `ae432248cd30e8465cd652f49b1e35f441af2e58` (`docs: accept gate 7 execution batch 1`), equal to `origin/phase/5-edit-planner-v0` after a fetch; ahead/behind 0/0. Tracked and staged worktree clean.
- Accepted Batch-1 implementation `d55f0e1c8dd966c1147a08788edc26b7728139f0`; Batch-1 acceptance closure `ae43224`.
- The eleven owner files are preserved unedited and unstaged: `CLAUDE.md`, `gate5-final-owner-diff.txt`, `gate5-owner-source-review.txt`, `gate5-postrepair-owner-review.txt`, `gate5-recon.txt`, `gate6-final-owner-review.txt`, `gate6-owner-source-review.txt`, `gate7-recon.txt`, `gate7-batch1-owner-review.txt`, `gate7-batch1-postrepair-owner-review.txt` and `gate7-batch1-final-owner-review.txt`.
- Before any edit, `.local-runs/phase5-gate7/batch2a-baseline.json` recorded the SHA-256 of all 263 tracked files, 149 protected files (every accepted production package including `packages/edit-execution/`, dependency manifests and lockfiles, fixtures, `tests/support/`, the accepted Gate-5/6/7 tests, the Gate-0/6/7 documents, `AGENTS.md` and `scripts/`), the eleven owner files and the 105 earlier Gate-7 receipts.
- Authority: the owner's explicit **Gate 7 Batch 2A only** authorization; the accepted [Batch-1 record](phase-5-gate-7-execution-runtime.md), including its Batch-2 invariants and safe sequence; the accepted [Creative Intelligence Architecture v1](phase-5-gate-0-creative-intelligence-architecture-v1.md) and [Gate-6 record](phase-5-gate-6-editgraph-capability-compatibility.md). Also read: `AGENTS.md`, `docs/CURRENT_PHASE.md`, all of `packages/edit-execution/`, `packages/routing/index.ts`, `packages/editorial/common.ts`, `packages/domain/serialization.ts`, `scripts/reference-local.ts`, `scripts/audit-workspace.mjs`, `scripts/no-network.mjs`, `tests/edit-execution.test.ts`, `tests/support/{edit-execution,edit-execution-chains,edit-graph}.ts`, `tests/workspace-boundary.test.ts`, `package.json` and `tsconfig.json`.

## Repository truth that conflicted with the authorization, and how it was resolved

The authorization preferred a new package `packages/edit-runtime/` that "MAY use node:fs". The accepted, protected workspace audit (`scripts/audit-workspace.mjs`, a required gate) allows only `zod` and `node:crypto` as external imports under `packages/`, and forbids `new Date`, `Date.now` and `process.env` there: application packages are pure, and side effects live only in explicit local adapters under `scripts/` (for example `reference-local.ts` and `footage-local.ts`). A filesystem import in `packages/edit-runtime/` would therefore fail `npm run audit:workspace`.

This changes no safety invariant, and the authorization allows file names to follow a strongly justified repository convention, so the batch follows the convention instead of weakening the audit:

- `packages/edit-runtime/` is the **pure runtime core**. It holds every record, rule, check and algorithm (registration, claim, same-handle copy-and-hash, verification, rechecks, preparation), and imports only `zod`, `node:crypto` and accepted internal modules. It reaches the outside world only through narrow ports (`ports.ts`).
- `scripts/edit-runtime-local.ts` is the **local adapter**: the system UTC clock, ownership-token entropy, the durable ledger, the staging store and the source locator. It imports only `node:crypto`, `node:fs/promises`, `node:path` and the core.

The audit's list of runtime adapters is hard-coded in the protected audit script, so the new adapter is not in it. Its import allowlist and its prohibitions (no `child_process`, no spawn/exec/execFile/fork, no network or media names) are enforced instead by focused tests 99–103. Registering it in the audit would need an authorized change to a protected script, so it is left for an owner decision.

## What Batch 2A answers

Once a replay-valid Batch-1 `ExecutionDag` is eligible to execute: exactly one runtime owns the logical attempt, a forked reservation history cannot create a second spendable execution, and a future renderer can consume only exactly the authorized bytes, verified after the claim. The flow is:

1. validated `ExecutionDag` (full Batch-1 replay, in process);
2. authoritative logical-attempt registration;
3. authoritative reservation binding;
4. atomic claim;
5. claim-bound runtime-now authority checks;
6. open the exact authorized source;
7. copy and hash the same opened bytes into staging;
8. content-addressed, no-overwrite publication;
9. reverify the staged bytes;
10. post-stage current source-lifecycle observation;
11. post-claim capability recheck evidence;
12. post-claim runtime recheck evidence;
13. `DispatchPreparation`;
14. stop.

No media subprocess can start in Batch 2A: no production code path launches a process.

## Files

| File | Responsibility |
| --- | --- |
| `packages/edit-runtime/common.ts` | 57 owned refusal codes; envelopes; limits; owned storage keys; exact supplied artifacts and scoped evidence; pure UTC millisecond arithmetic |
| `packages/edit-runtime/records.ts` | Strict, versioned, content-identified records: `AttemptSlot`, `AttemptRegistration`, `ExecutionClaim`, `StagedSourceReceipt`, `SourceLifecycleObservation`, `DispatchCapabilityRecheck`, `DispatchRuntimeRecheck`, `RuntimeDispatchPolicy`, `DispatchPreparation`; `stagedObjectIdOf` |
| `packages/edit-runtime/ports.ts` | The runtime ports and the three synthetic provider seams |
| `packages/edit-runtime/validated.ts` | `openValidatedDag` and the in-process `ValidatedExecutionDag` handle |
| `packages/edit-runtime/ledger.ts` | Attempt registration, the atomic claim, `ClaimOwnership` and the claim-bound check every later step makes |
| `packages/edit-runtime/call.ts` | The explicit call context of a claim-bound step and the runtime-now media-grant rule |
| `packages/edit-runtime/staging.ts` | Same-handle copy and hash, no-overwrite publication, full re-verification, `StagedSourceReceipt` |
| `packages/edit-runtime/recheck.ts` | Post-stage lifecycle observation; post-claim capability and runtime rechecks |
| `packages/edit-runtime/dispatch.ts` | `DispatchPreparation`, its replay and current-time confirmation; the execution-only `PreparedStagedSourceHandle` |
| `packages/edit-runtime/index.ts` | Internal entry points |
| `scripts/edit-runtime-local.ts` | Local adapter: clock, entropy, ledger, staging store, source locator |
| `tests/edit-runtime.test.ts` | 116 focused tests: 95 over the required areas 1–107 (some tests cover adjacent areas together), 2 local-adapter checks and 19 adversarial self-review tests |
| `tests/support/edit-runtime.ts` | Controlled clock, isolated temporary roots, deterministic test bytes, forked reservations, synthetic providers, owner dispatch policy |
| `tests/support/edit-runtime-chains.ts` | Test-only real-byte chain builder (see "Real-byte test chain") |
| This report and `docs/CURRENT_PHASE.md` | Batch-2A record and a narrow status update |

No accepted production file, test, fixture, public contract, provider seam, validator, job, telemetry, routing, planning, EditGraph, Batch-1 edit-execution file, dependency manifest or lockfile changed. The frozen Batch-1 report is unchanged. Nothing was staged, committed, pushed, merged or submitted as a PR.

## Runtime records

Every Batch-2A record is internal (`0.1.0`, `internal_pre_stable`) and strict: unknown fields fail. Each is content-identified (its ID hashes every other field), finite and immutable. Declared sets are canonical. No record holds a filesystem location, URL, filename, command, argument list or executable name. Persisted records are exactly their canonical JSON (the repository's `canonicalSerialize`) plus one newline.

Six runtime-produced records bind the runtime implementation identity `{ implementationId: "gate7_batch2a_edit_runtime", version: "0.1.0" }`: the registration, the claim, the staged receipt, the lifecycle observation and both rechecks. The registration, the claim and the staged receipt also bind the storage durability the adapter provides. The owner dispatch policy is owner-authored, and a preparation binds the records that carry these identities.

## 1. Durable logical-attempt registry

### AttemptSlot: exact uniqueness identity

```
attemptSlotId = content identity "execution_attempt_slot_v0" of { projectId, creatorId, operationId, attempt }
```

Nothing else is part of uniqueness. The execution budget, allocation, reservation, reservation history, purpose and every storage label are bound by the winning registration, but none can mint another slot.

- **Why `budgetId` is not uniqueness.** One logical operation attempt must not become executable twice merely by constructing another execution budget, another allocation or another reservation over them. If the budget were part of the key, a second budget would create a second slot for the same `(project, creator, operation, attempt)`, and so a second spendable execution.
- **Why purpose cannot mint an attempt.** Purpose is part of the scope bound by the winning registration. A second registration for the same slot with another purpose refuses (`attempt_registration_conflict`). A claim whose DAG is in another purpose than the registration also refuses.

### AttemptRegistration

`registerAttempt({ reservation }, artifacts, runtime)` reads the exact supplied `Reservation` (it must be canonical). It replays the reservation through the accepted Gate-3 `reserve()` from its own budget, allocation and history references, and requires exact equality. It then derives the slot. The record binds:

- the attempt slot;
- the full scope, including purpose;
- the execution `budgetId` and budget artifact;
- the allocation `budgetId` and allocation artifact;
- the reservation's Gate-3 content identity `reservationId` and its history;
- the first artifact reference the reservation was observed under (provenance only);
- `registeredAt` from the runtime clock;
- the registrar implementation and durability;
- the basis `first_replay_valid_gate3_reservation_owns_attempt_slot_v0`.

`registerDagAttempt(dag, …)` registers the exact reservation a replay-validated DAG was admitted under.

For one slot:

| Presented | Outcome |
| --- | --- |
| The same semantic reservation (same scope, budget, allocation and `reservationId`), under any storage label or byte form | `observed_existing`: the authoritative record, unchanged |
| Another purpose | `attempt_registration_conflict` |
| Another execution budget | `attempt_registration_conflict` |
| Another allocation (another allocation `budgetId`) | `attempt_registration_conflict` |
| Another reservation from a forked history, or from an allocation artifact of identical content under another label | `reservation_fork_conflict` |
| `attempt + 1` with a new truthful Gate-3 reservation | a new, independent slot |
| Another operation, project or creator | a new, independent slot |

Storage labels are never semantic authority. The reservation's identity is its Gate-3 `reservationId`, and the ledger key is the slot digest. Neither the reservation's `ArtifactRef.objectId`, a filename, a JSON form nor any caller label can create a second registration.

### Persistence and crash semantics

The slot is acquired with the ledger's one atomic primitive (described under "Durable records and storage"): the complete, synced record is published under the slot's owned key with a no-overwrite hard link. Exactly one concurrent publisher wins. The winner's record is complete when its name appears, so a process crash leaves either no owner or a complete owner record.

An occupied slot whose record is empty, truncated, malformed, schema-invalid, non-canonical, oversized, a link or a directory, or of another slot or identity, fails closed as `attempt_registration_corrupt`: consumed runtime authority, never "no registration". It is never deleted, repaired, stolen or released, and no other reservation can win it. A retry needs `attempt + 1`.

## 2. Reservation-fork prevention

A Gate-3 `ReservationHistory` is explicitly supplied, immutable evidence. Two histories for the same budget and allocation therefore each replay validly, with different `reservationId`s (the history reference is part of the reservation's content identity). Batch 2A does not treat any supplied history as global truth. The durable registry is the single authority on which reservation owns a logical attempt.

The test-only fork attack (tests 07 and 07b) builds Fork A and Fork B: the same project, creator, operation and attempt, the same budget and allocation, and two independent histories. Both reservations individually pass accepted Gate-3 replay, and both yield replay-valid Batch-1 DAGs with different claim targets.

1. Fork A registers.
2. Fork B's registration refuses with `reservation_fork_conflict`.
3. Fork B's claim refuses with `reservation_not_authoritative` before any claim state exists.
4. Fork A then acquires its claim.

Presenting Fork B after the claim, or rewriting the registration file after the claim, gains nothing either (adversarial test A05).

## 3. Durable atomic execution claim

### Before a claim

Only after all of the following may a claim be attempted:

- exact Batch-1 DAG replay;
- an in-process `ValidatedExecutionDag` with `dispatch.state = not_claimed` and `requirement = atomic_runtime_claim_required`, whose claim target is the admitted reservation attempt;
- the slot registered, with this DAG's `reservationId` as the winner, in the same scope, budget and allocation.

The atomic dispatch key is the unchanged Batch-1 `dag.dispatch.claimTarget.claimTargetId`. The claim target's `reservationId`, `operationId` and `attempt` must match the registration.

### ExecutionClaim

The claim binds:

- `claimTargetId`, `reservationId`, `operationId` and `attempt`;
- the `attemptSlotId` and `registrationId`;
- `renderComputationId`;
- the DAG (`dagId` and artifact), the ExecutionAdmission (`admissionId` and artifact) and the ExecutionGrant (`grantId` and artifact);
- the claimant `workerId`;
- `claimedAt` from the runtime clock;
- the runtime implementation and durability;
- an owner proof: the SHA-256 of a fresh 256-bit ownership token;
- the basis `first_exclusive_publication_owns_claim_target_v0`.

At claim time, runtime-now must be at or after the admission and inside the ExecutionGrant window, or the claim refuses before any publication.

### Uniqueness

- `claimTargetId` is the only uniqueness key; `renderComputationId` is never part of it.
- Exactly one caller **acquires**.
- Every later acquisition of the same target refuses with `claim_already_acquired`, whether it is the same render computation, another render, another DAG, a preview or final re-grant, the same worker or another.
- Acquisition is not idempotent: a matching desired record never makes a second caller an owner.

### Ownership

Only the acquiring call returns a `ClaimOwnership`. It is an in-memory capability that cannot be constructed, copied or deserialized outside the core, and it holds the ownership token. Every later step (staging, lifecycle, rechecks, preparation) requires it and verifies it against the durable claim's owner proof. `observeExecutionClaim` returns the immutable winning record, never ownership.

### Crash, poison and no release

If the winning process ends, its ownership ends with it, and the target stays consumed. There is no release, delete, steal, reclaim, unlock or timeout API (tests 16 and 30 scan the exported names). An empty, truncated or malformed claim record keeps the target consumed and fails closed as `claim_record_corrupt`; it is never deleted, repaired, overwritten or reclaimed. A retry needs `attempt + 1`.

## 4. Durable records and storage

### The publication primitive (local adapter)

1. Write the complete bytes to a private pending file created exclusively (`wx`) under a random name.
2. Sync the file (`FileHandle.sync`).
3. Close it.
4. Publish it by `link(pending, final)`. A hard link never overwrites: it fails with `EEXIST` if the final name exists.
5. Remove the pending name.

Staged objects are additionally made read-only before linking. Nothing is ever implemented as `exists()` then `write()`, and no in-memory mutex is the authority.

A platform probe (scratch only) confirmed on this machine that a second `link` to an existing name fails with `EEXIST` and leaves the first bytes intact, and that a 16-way `link` race yields exactly one winner.

### Reading an occupied record

Every read:

- rejects a directory, link or non-regular file;
- enforces the 64 KiB record bound;
- opens the file, and requires the opened handle to be the same file (`dev`, `ino`) found by `lstat`;
- decodes strict UTF-8;
- requires exactly canonical JSON plus a newline;
- parses the strict schema, which verifies content identity;
- checks that the record belongs to the owned key it was read from.

Anything else fails closed.

### Owned keys and layout

Runtime state lives under one explicit runtime root, which is execution-only configuration and never domain authority. The root must be an existing local directory, not a link, and its resolved path is at most 160 characters. It holds five fixed namespaces:

- `attempt-registrations/<64 hex>.json`
- `execution-claims/<64 hex>.json`
- `staged-objects/<64 hex>.bin`
- `ledger-pending/<32 hex>.pending`
- `staging-pending/<32 hex>.pending`

Every name derives from an owned content digest of exactly the expected namespace (`execution_attempt_slot_v0`, `execution_claim_target_v0` or `staged_source_object_v0`). No raw project, creator, operation, asset, worker, file or path string ever becomes a name. An ID containing colons and dots, which `IdSchema` allows, never shapes a name; the self-review repair also refuses an ID of another namespace (see "Test-first and self-review chronology"). Lookups are direct by key; nothing scans a tree.

### Local-development durability guarantee

Record and object bytes are synced before their name is published. The directory entry is not synced: opening a directory for sync fails with `EPERM` on this platform (probed). A process crash therefore leaves either no final name or a complete, synced record. Power-loss durability of a *just-published* name is **not** claimed: after a power loss, the name of a record published moments before could be absent. The registration, the claim and the staged receipt each bind this guarantee as the literal `file_bytes_synced_before_publication_directory_entry_not_synced_v0`.

## 5. Execution-only source locator

`createLocalSourceLocator({ allowedRoots, sources, maxSourceBytes })` maps an admitted `assetId` to one configured candidate path. That mapping is execution-only configuration, never source authority.

- **Where the core allows it.** The core resolves only a source admitted by the exact validated DAG (`source_not_admitted` otherwise).
- **Location form.** Allowed roots must be explicit, existing local directories. A location must be an absolute, drive-qualified local path; a URL, UNC, device-namespace, relative or drive-relative path, traversal segment or NUL refuses (`source_location_invalid`).
- **File checks.** The candidate must exist (`source_unavailable`) and must not be a final link component (`source_symlink`) or a directory or other non-regular file (`source_not_regular`). It must be non-empty (`source_empty`) and within the configured size bound, which is at most the accepted 8 GiB source limit (`limit_exceeded`).
- **Containment.** The real location, after resolving every link and junction, must lie inside an allowed root (`source_outside_allowed_root`), so a parent junction escaping the root is refused.
- **Identity through open.** Resolution records the file identity (`dev`, `ino`), and opening refuses if another file now sits at the location (`source_changed`).

No source path is persisted in any Batch-2A record, and no runtime error message carries a location.

## 6. Real-byte test chain

Existing synthetic fixtures carry content hashes that are not the SHA-256 of any bytes, and the accepted test chain builder fixes the authorized size at one byte. Batch 2A neither mocks hashing nor weakens a receipt rule. `tests/support/edit-runtime-chains.ts` is a parameterized copy of the accepted test-only builder. It adds only `sizeBytes`, and test 37 proves that without it the copy reproduces the accepted builder byte for byte.

The tests create deterministic binary bytes (SHA-256 counter-mode expansion of a seed), compute their real SHA-256 and build the whole accepted chain from it. The FootageAnalysis uses exactly that hash, the asset is `asset_<contentHash>`, and `authorization.sizeBytes` is the actual length. MediaAsset, world model, planning, EditGraph, Batch-1 admission and DAG all stay replay-valid through accepted APIs only.

| Source | Seed | Length (bytes) | Real SHA-256 = FootageAnalysis `contentHash` |
| --- | --- | --- | --- |
| A (single-source DAGs) | `gate7-batch2a-source-a` | 2,621,443 (three 1 MiB staging chunks) | `f976f72b13438b4dd2c08ed20466ebf9a68a794a0a33947f87501c2170b9da8c` |
| B1 (two-source DAG) | `gate7-batch2a-source-b1` | 1,500,007 | `443bb5be203ae3f7179259ab620c39e1d95d014f2dd0d1202c24de60a6593917` |
| B2 (two-source DAG) | `gate7-batch2a-source-b2` | 900,001 | `960655ecd3a643d595ad8463f1dbdc2bdfe3c60b6537e5907d22a690d3abded2` |

The digests were recomputed independently of the tests, from the same seed expansion. Tests 35–37 assert, over the actual chain, that the hash equals `contentHash`, that the asset is `asset_<contentHash>`, that the length equals `authorization.sizeBytes`, and that the chain replays through the Batch-1 DAG.

The bytes are opaque test bytes, not video.

## 7. Verified content-addressed staging

### Algorithm (`stageClaimedSource`)

1. Prove claim ownership and the claim's binding to this DAG, and check that the registration is still authoritative.
2. Require the source to be admitted by the exact DAG.
3. Recheck the ExecutionGrant and the source's media grant at runtime-now.
4. Resolve, then open, the one source handle; require its size to equal the admitted size.
5. Create a private pending object.
6. Read the **same handle** positionally in 1 MiB chunks, never more than one byte past the admitted length. Each chunk is hashed and written to the pending object from the same buffer before the next read.
7. Compare the observed SHA-256 and byte count with the admitted hash and size. On a mismatch, refuse (`source_hash_mismatch` or `source_size_mismatch`), discard the pending object and publish nothing.
8. Sync the pending object, make it read-only, close it, and publish it under its content-addressed name with the no-overwrite primitive.
9. Close the source handle and remove the pending name.
10. Reopen the final object and verify it independently: a regular file, not a link, of exactly the admitted size and full-byte SHA-256.

The original path is never reopened for execution: a future renderer can use only the verified staged object. Test 48 proves that the source is opened exactly once, that the reads are contiguous (0, 1 MiB, 2 MiB, end of file) and that the staged bytes are exactly the bytes read.

### No-overwrite publication

If another stage already published the same object, publication reports `exists`. The final object is then reopened and fully verified before reuse (`existing_object_reverified`). A corrupt existing final object fails closed (`staged_object_corrupt`): it is never overwritten, repaired or regenerated under the same ID, and its inode and bytes are unchanged (tests 56 and 57). A pending file, even one named like a final object, is never a final object (test 59).

### stagedObjectId

```
stagedObjectId = content identity "staged_source_object_v0" of { stagingVersion, contentHash, sizeBytes }
```

It never derives from a path, basename, mtime, filename, caller object ID or project path. The byte object may be reused across claims, but a `stagedObjectId` is **never** access authorization: every claim needs its own authorization and its own receipt.

### StagedSourceReceipt

The receipt binds:

- the scope, the ExecutionClaim (`claimId` and `claimTargetId`) and the AttemptRegistration;
- the ExecutionDag and ExecutionAdmission;
- the `assetId` and the exact Batch-1 SourceAccessReceipt;
- the expected hash and size, and the observed hash and size, with the scope `exact_bytes_copied_from_one_opened_source_handle`;
- the `stagedObjectId`, its publication and its verification;
- the staging implementation and durability;
- `stagedAt` from the runtime clock (never before the claim) and its basis.

It exists only for exactly the expected bytes, and it holds no path, URL, command or filename.

### Concurrency and crash

- **Concurrency.** Eight concurrent stages of the same authorized bytes (test 58) all return the same `stagedObjectId`: exactly one `published_by_this_stage` and seven `existing_object_reverified`, one verified final object, and no pending leftovers.
- **Crash.** An interrupted copy (a port fault injected on the second read, test 60) publishes nothing and leaves no pending object. A pending file left by a hard crash stays inert garbage, and a later stage publishes and verifies its own final object. Pending cleanup is confined to the runtime's own pending name; no sweeping cleanup exists.

## 8. Source TOCTOU guarantee and its residual boundary

### Protected (tests 49, 50, 61–64, A08 and A09)

- A stale or wrong path mapping, or a source replaced before staging: the hash or size mismatch refuses.
- A source replaced between resolution and open: `source_changed`.
- An in-place mutation during the copy: the hash of exactly the bytes copied refuses.
- Replacement or deletion of the original path after staging: the staged bytes, `stagedObjectId` and preparation are unaffected, and dispatch points only at the staged object.
- A corrupt or tampered staged object: detected by full re-verification before a preparation, with no fallback to the intact original.
- On this platform, replacing the source path while its one handle was open was refused by the OS (`EPERM`, test A08 diagnostic). Either way the staged bytes stayed the authorized bytes.

### Residual boundary (stated, not solved)

Portable Node filesystem APIs cannot stop a hostile process running as the same OS user. Such a process can clear the read-only attribute and rewrite a staged object, or rewrite ledger records. Content identity and full re-hashing detect any change up to the last verification, but not a change made after that verification and before or during a future renderer's read.

The objective Batch 2A meets is narrower: after staging, the original source path is no longer the byte source, and every step re-verifies the staged bytes. Batch 2B must either strengthen the hand-off (for example, re-verify immediately before spawn, hold the object open with sharing that denies writes, or verify the bytes actually consumed) or scope its local-development guarantee truthfully. Ledger records are verified on every read but are not filesystem-protected. The claimant `workerId` is an owned label, not an authenticated principal; in-process ownership is the `ClaimOwnership` capability.

Two further platform notes:

- **File symlinks.** They cannot be created without the symlink privilege on this machine. Test 44 therefore refuses a directory junction as the final link component and reports the file-symlink attempt as `not_creatable_without_symlink_privilege`. The file-symlink branch uses the same `lstat` check.
- **File identity.** The `dev`/`ino` comparison is only as strong as the filesystem's file identity; FAT-family volumes may report none.

## 9. Claim-bound runtime clock

`RuntimeClock.now()` supplies every runtime time: `registeredAt`, `claimedAt`, `stagedAt`, the lifecycle and recheck `observedAt` values, and `preparedAt`. A caller-claimed timestamp is never runtime truth. The local adapter reads system UTC time; tests use a controlled clock. A malformed clock refuses (`input_invalid`), and a clock that runs backwards across the claim refuses (`evidence_chronology_invalid`). Timestamp arithmetic is exact UTC milliseconds, verified by round-trip across leap years, centuries and the representable range (test A19).

## 10. Post-claim execution-grant and media-grant rechecks

The runtime rechecks the exact Batch-1 authority without mutating it. The ExecutionGrant window is rechecked at the claim, at each stage and at `preparedAt`; the media grants at each stage and at `preparedAt`:

- **ExecutionGrant.** It is replay-valid (from the validated DAG), and runtime-now is inside its window (`execution_grant_expired`).
- **Claim binding.** The claim binds this DAG and render computation, the registration remains authoritative, and the reservation, operation and attempt are exact.
- **Media grants.** Every source's exact ExecutionMediaGrant matches the source asset and hash and the execution scope, allows this exact render intent, and is inside its window (`media_grant_expired` for a grant that expired after the Batch-1 admission).

## 11. Post-stage SourceLifecycleObservation

The observation binds:

- the scope and the ExecutionClaim;
- the StagedSourceReceipt (`stagedSourceReceiptId` and `stagedAt`);
- the admitted `assetId` and `contentHash`, the exact Batch-1 MediaAsset lineage and the SourceAccessReceipt;
- the current `deletionRequestedAt` and `expiresAt`;
- `observedAt` from the runtime clock, taken before the provider call;
- the observer (identifier, version and a basis that can only be `synthetic_test_lifecycle_provider_no_external_query_v0`);
- the recorder implementation, scoped evidence and its basis.

The provider response is parsed as untrusted input; a response of another scope, asset or hash refuses. Batch 2A queried **no** real external lifecycle source.

A preparation requires every observation to be:

- at or after the claim and at or after that source's `stagedAt`, and no later than `preparedAt`;
- within the policy age;
- free of any deletion request (`lifecycle_deleted`);
- unexpired at `preparedAt` (`lifecycle_expired`).

It is observed after staging, so a long stage cannot hide a deletion request or expiry that happened meanwhile.

## 12. Post-claim capability and runtime recheck seams

**DispatchCapabilityRecheck** binds:

- the claim, `claimTargetId`, DAG and `renderComputationId`;
- the observed executor build and environment, and `observedAt`;
- the checker identity, whose basis can only be `synthetic_test_capability_rechecker_no_real_executor_probe_v0`;
- a typed outcome (`available` with per-requirement findings, `unavailable` or `failed`), its evidence and its basis.

**DispatchRuntimeRecheck** binds:

- the claim, DAG and `renderComputationId`;
- the executor, environment, `RuntimeIdentity`, exact encoding semantics, render intent and render profile;
- `observedAt`;
- the checker identity, whose basis can only be `synthetic_test_runtime_rechecker_no_real_runtime_probe_v0`;
- a typed outcome and its evidence.

Both are observed after the claim on the runtime clock. The synthetic providers probe nothing and say so. A provider or record claiming a real probe cannot be represented (test A14). Pre-claim Batch-1 evidence cannot substitute: a Batch-1 CapabilitySnapshot or ExecutionRuntimeAttestation offered as a recheck is the wrong artifact, a recheck relabeled to the Batch-1 observation time is stale, and authority artifacts are never admitted as evidence (tests 76, 81 and A15). Batch 2B must replace both seams with real pinned probes before execution.

## 13. Dispatch policy and DispatchPreparation

### RuntimeDispatchPolicy (owner-authored, content-identified)

The core has no implicit defaults; the owner states every bound. The recommended defaults are the values the tests use.

| Bound | Configurable range | Recommended default (used in the tests) |
| --- | --- | --- |
| Maximum capability recheck age | 1 ms – 60 s | 30 s |
| Maximum runtime recheck age | 1 ms – 60 s | 30 s |
| Maximum lifecycle observation age | 1 ms – 60 s | 30 s |
| Preparation lifetime | 1 ms – 30 s | 10 s |

Exactly at a maximum age passes; one millisecond older refuses (tests 77 and 82).

### DispatchPreparation

A preparation exists only when all of these pass at one runtime-now `preparedAt`:

- the exact DAG replay (the in-process validated handle);
- the authoritative registration, with this reservation as its winner;
- the valid immutable winning claim, proven by its ownership and binding this DAG and render computation;
- the ExecutionGrant and every media grant valid at `preparedAt`;
- exactly one valid StagedSourceReceipt per admitted source, with every staged object re-verified in full now;
- a fresh post-stage lifecycle observation per source, with no deletion request and no expiry;
- fresh, AVAILABLE post-claim capability and runtime rechecks for the exact executor, runtime build, environment, encoding, intent, profile and admitted requirement set.

It binds:

- `preparationId` and the scope;
- the registration, the claim (`claimId`, `claimTargetId`, `claimedAt`) and the claim target;
- the DAG, admission and grant;
- `renderComputationId`, render intent and profile;
- the executor, runtime and environment;
- the policy;
- per source: hash, size, `stagedObjectId`, staged receipt, lifecycle observation and media grant;
- both rechecks;
- `preparedAt` and `validUntil`, and `validity: prepared_at_inclusive_valid_until_exclusive_v0`;
- `evidenceGrade: synthetic_post_claim_rechecks_not_real_probes_batch2a`;
- `mediaExecution: not_started`;
- no public contract, and no filesystem location.

### Validity window

The window is `preparedAt ≤ now < validUntil`: `validUntil` itself is expired. `validUntil` is the earliest of `preparedAt` + lifetime, the ExecutionGrant expiry, every media-grant expiry and every retention expiry, so a preparation never outlives an authority window. Tests 66, 68 and 72 show it clamped to exactly the grant, media and retention expiries.

`confirmDispatchPreparationCurrent` replays and then applies the window on the runtime clock. It is current one millisecond before `validUntil` and refuses at `validUntil` (`dispatch_preparation_expired`, tests 96 and 97). An expired preparation releases nothing: the claim stays owned and unchanged, a second acquisition still refuses, and a new preparation needs new post-claim rechecks (test 98).

### Replay

`replayDispatchPreparation` recomputes the preparation deterministically at its own `preparedAt` from its own evidence references. It re-reads the ledger and re-verifies the staged bytes. A coordinated rewrite and re-identification of the validity window, preparation time, claim, render computation, staged object or executor fails with `dispatch_preparation_replay_mismatch`; an unidentified or extra-field edit fails as `dispatch_preparation_invalid` (tests 95 and A17). The request order never changes the preparation (test A16).

`PreparedStagedSourceHandle` is the execution-only hand-off for Batch 2B: the asset, the `stagedObjectId` and the verified staged object's local path. It is produced only after verification, cannot be constructed elsewhere, throws on serialization and is never persisted.

## 14. Owned refusal codes

All 57 codes are owned, and there is no partial authorization:

| Area | Codes |
| --- | --- |
| Input, time and replay | `input_invalid`, `scope_mismatch`, `limit_exceeded`, `execution_dag_invalid`, `evidence_chronology_invalid`, `evidence_postdates_preparation` |
| Runtime storage | `runtime_root_invalid`, `runtime_storage_corrupt`, `runtime_storage_unavailable` |
| Registry | `reservation_invalid`, `attempt_registration_missing`, `attempt_registration_conflict`, `attempt_registration_corrupt`, `reservation_fork_conflict`, `reservation_not_authoritative` |
| Claim | `claim_ownership_required`, `claim_already_acquired`, `claim_record_corrupt`, `claim_missing`, `claim_mismatch` |
| Source | `source_not_admitted`, `source_location_invalid`, `source_outside_allowed_root`, `source_not_regular`, `source_symlink`, `source_unavailable`, `source_changed`, `source_empty`, `source_hash_mismatch`, `source_size_mismatch` |
| Staging | `staged_object_corrupt`, `staged_object_missing`, `staged_object_mismatch`, `staged_source_missing`, `staged_source_invalid` |
| Lifecycle | `lifecycle_observation_missing`, `lifecycle_observation_invalid`, `lifecycle_stale`, `lifecycle_deleted`, `lifecycle_expired` |
| Grants | `execution_grant_expired`, `media_grant_expired`, `media_grant_invalid` |
| Capability recheck | `capability_recheck_missing`, `capability_recheck_invalid`, `capability_recheck_mismatch`, `capability_recheck_stale`, `capability_recheck_unavailable` |
| Runtime recheck | `runtime_recheck_missing`, `runtime_recheck_invalid`, `runtime_recheck_mismatch`, `runtime_recheck_stale`, `runtime_recheck_unavailable` |
| Preparation | `dispatch_policy_invalid`, `dispatch_preparation_invalid`, `dispatch_preparation_replay_mismatch`, `dispatch_preparation_expired` |

## 15. Test-first and self-review chronology

Receipts are under ignored `.local-runs/phase5-gate7/`. No earlier receipt was overwritten.

| Step | Evidence (SHA-256) | Result |
| --- | --- | --- |
| Baseline | `batch2a-baseline.json` (`2518d2997c5da6cd7a64c2a66d5be69bf4f5a8a18c4fa1f17a46b7a1074fab35`) | 263 tracked, 149 protected, 11 owner files, 105 earlier Gate-7 receipts; tracked and staged clean |
| First red | `batch2a-first-failure.md` (`8b8e2b64c089c8597708b8e32f120ca78496c5f919a0a87ae062580c784003a9`); `batch2a-first-red-typecheck.log` (`1b86e2bed44a1a72ea3e5646b1bd77441010714e1df1c62769539fcfd1f8410e`) | Tests and support written before any production file. `npm.cmd run typecheck` exit 2: `TS2307` × 6 for the absent runtime core and adapter, cascading `TS18046` × 4 and `TS7006` × 27, and `TS1308` × 2 |
| Test-only correction | recorded in the first-failure receipt | `TS1308` was a test-authoring defect: `await` inside a synchronous arrow in test 30. The arrow became `async` before any production code was written |
| First execution | `batch2a-initial-build.log`, `batch2a-initial-focused-run.log` (`bd134409f20c2f6c1be300b177cfabd6d790b339561dfd16840e1189470d5895`) | 92/97 on the first run; the five failures were test-authoring defects (listed below) |
| First green | `batch2a-corrected-build.log`, `batch2a-first-green-focused-run.log` (`4cfc428326377496df4383a6d0ad156e14ca56eec7de55204c55fa51282613e0`) | 97/97 |
| Adversarial first run | `batch2a-adversarial-prerepair-hashes.log` (`eebe050c28c0c628d8dbe944ebcdb777306d1a3b36b572ad6d246027d997b2f2`); `batch2a-adversarial-first-run.log` (`17158225000036cc711cea357892afbc2181790aa3dcd20e8aab684d8426d8a4`) | 19 adversarial tests A01–A19 against the unrepaired bytes: 116 tests, 115 pass. 18 attacks were already refused; A01 exposed one genuine defect |
| Self-review red | `batch2a-namespace-key-red.md` (`032e28f834e940c2f27bafbb9dd5756e7c5cc93679c9d586808c836daef2e887`); `batch2a-namespace-key-subcases.log` (`129813c050b1965e2f535f680cda1a68d26b6c665fd94f8a430f5d9a63e72a97`) | See the self-review defect below; every sub-case confirmed separately against the unrepaired build |
| Repair | `batch2a-namespace-key-repair-build.log`, `batch2a-namespace-key-repair-focused-run.log` (`648fddbfaf1156280149dfe933d2ed89167fb9c70bbf2ac579087351393b3c82`) | 116/116 |
| Static prohibition search | `batch2a-static-prohibition.log` (`bea97cdb007435fbb62072cd537700773164a0902d162b9e9ccb10a95d36a2d6`) | Zero occurrences in production Batch-2A code (see "Verification") |

**The five first-execution failures.** Each was a correct production refusal or record, so no production red is claimed for them. All were corrected test-only, and no assertion about production semantics changed:

- **09.** Two `HALF_LIMITS` allocations have identical content, so they share one allocation `budgetId`. The fixture now uses distinct content, and keeps the identical-content, other-label case as a `reservation_fork_conflict` sub-case.
- **11.** The support helper supplied the prior reservation twice (a duplicate object ID).
- **79.** The single-requirement graph made `slice(1)` empty. It is replaced by a substituted requirement and an extra requirement, and an empty set is refused when the recheck is recorded.
- **92–93.** The location-key scan matched `renderProfile`.
- **104–107.** The key scan matched `attemptSlotId`.

**The self-review defect: a namespace-foreign ID addressed runtime state.** `ownedKey` accepted any `prefix_<64 hex>`. A caller could therefore pass `execution_claim_v0_<hex>`, `attempt_registration_v0_<hex>`, `x_<hex>` or `execution_attempt_slot_v0_<hex>` to `observeExecutionClaim`. Each resolved to the same claim file: a legitimate-looking `null` when absent, and a false `claim_record_corrupt` for a valid claim. No write path was affected, since every publication key is derived internally from validated identities, so no authority could be gained or poisoned.

The smallest repair: `ownedKey(id, namespace)` now requires the exact owned namespace (`execution_attempt_slot_v0`, `execution_claim_target_v0` or `staged_source_object_v0`) and refuses anything else as `input_invalid`, and every core call site passes its namespace. The test path helpers now also pass the namespace, a call-site change the repair requires; no assertion changed.

**Attacks refused without repair, each now a regression test (A02–A19):**

- ledger and staging keys that traverse, are absolute or URL-like, or are unbounded, and unknown namespaces;
- an occupied registration that is a link, a directory, oversized, another slot's valid record, of broken identity or non-canonical;
- a claim filed under another target's name;
- a fork presented, or the registration rewritten, after the claim;
- a claim record replaced by another acquisition's;
- a claim before its admission or after its grant;
- a source replaced between resolution and open, or while it is being copied;
- an in-place mutation during the copy;
- identical bytes under an unadmitted asset, or outside every root;
- staged-receipt forgeries (object identity, coordinated rehash, another DAG, extra, duplicate or location-bearing receipts);
- future-dated evidence and a stale lifecycle;
- a synthetic provider claiming a real probe;
- foreign, unsupplied or authority evidence;
- omitted references and request reordering;
- forged or serialized capabilities;
- a malformed or backward clock;
- UTC arithmetic.

## 16. Verification

All test runs used `scripts/no-network.mjs`. The gates ran sequentially from one script; their exit codes and durations are in `batch2a-final-gates-summary.log` (`6096481b826ba17dc286b8fbc152d61db82cd09026def2758c9030d07e8cb8fc`).

| Command / check | Result | Local evidence (SHA-256) |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `batch2a-final-typecheck.log` |
| `npm.cmd run build` | PASS | `batch2a-final-build.log` |
| Focused `dist/tests/edit-runtime.test.js` | 116/116 PASS | `batch2a-final-focused.log` (`a8639a3e5ebf0847be20fccf82336e965ea984bc96bb7b0ef3d10a30fc9ae9d9`) |
| Gate-7 Batch-1 regression `dist/tests/edit-execution.test.js` | 81/81 PASS | `batch2a-final-gate7-batch1-regression.log` (`f06d405ff89029b67364d73122663f6d2391c6531c3b0b0bae64cd1ef5dd4f08`) |
| Gate-6 regression `dist/tests/edit-graph.test.js` | 79/79 PASS | `batch2a-final-gate6-regression.log` (`2cb692b52b2239e6845eb5d01f1807d1d2cb7e17cba424a08a1baa8709bf7dc0`) |
| Gate-5 regression `dist/tests/planning.test.js` | 97/97 PASS | `batch2a-final-gate5-regression.log` (`636d9f60e50af09e3ce30298f69c68d48246d1f3ccf5740cd86879dab8516ec9`) |
| Routing and budget `dist/tests/budgeted-perception-routing.test.js` | 33/33 PASS | `batch2a-final-routing-regression.log` (`2a58d7699a89c559b98a0db30a142971ad4c4489a534b9a9c2d05f33ad69c09e`) |
| Accepted 16-file compatibility set (as in Gates 5, 6 and 7 Batch 1) | 377/377 PASS | `batch2a-final-compatibility.log` (`c6bc7bb4ba77e05cf38b38acbbf14401c3a46811472243b9916a90cc515b7672`); files in `batch2a-final-compatibility-files.log` |
| Legacy seams: `contracts`, `integration`, `jobs`, `telemetry` | 39/39 PASS | `batch2a-final-legacy-seams.log` (`dd9cd51c1c4fafa1cf86cc9f6c156cb98aec3d261404d7b006d10cec8939c96f`) |
| `npm.cmd test` (build plus every `dist/tests/*.test.js`) | 822/822 PASS (706 accepted plus 116 Batch-2A) | `batch2a-final-full-safe-suite.log` (`2c79c3aa444abe03e04151d75a0301b544db87be98c6380d0ce7be6a1513685c`) |
| `npm.cmd run audit:workspace` | PASS: 97 application TypeScript files (87 plus 10 core files) and 9 runtime adapters | `batch2a-final-workspace-audit.log` (`083f05dd23822efd7b8386047467361641c973f8cd2c3e0a36fca536d078bd4f`) |

Every run had zero failed, skipped, cancelled or todo tests. The focused run printed two platform diagnostics:

- a file symbolic link is not creatable without the symlink privilege (the junction final component was refused);
- replacing the source path while its one handle was open was refused by the platform (`EPERM`), and the staged bytes stayed the authorized bytes.

**Static prohibition search.** A literal search over the ten core files and the adapter (`batch2a-static-prohibition.log`) found zero occurrences of `node:child_process`, `spawn(`, `exec(`, `execFile(`, `fork(`, `ffmpeg`, `ffprobe`, `filter_complex`, `http://`, `https://`, `.exec(`, `child_process`, `worker_threads`, `node:net` and `node:http`. Filesystem APIs appear only in the adapter.

Tests 99–103 enforce the same statically:

- **Imports.** The core imports only `zod`, `node:crypto` and accepted internal modules; the adapter imports only `node:crypto`, `node:fs/promises`, `node:path` and the core.
- **Calls.** There is no spawn, exec, execFile, fork, fetch or eval call.
- **Compiled closure.** The compiled import closure reaches externals `node:crypto` and `zod` (core), plus `node:fs/promises` and `node:path` (adapter). It reaches no provider seam and no script other than the adapter.

No FFmpeg, ffprobe, media integration, Python, CUDA, real-model, real-footage or network operation ran. All evidence is synthetic providers over opaque test bytes.

**Final bytes:**

| File | SHA-256 |
| --- | --- |
| `packages/edit-runtime/call.ts` | `2a452019f074c58d2e4ddb2c7a9e091a5b9ef0ede126d7a70e14c48e3a0691e9` |
| `packages/edit-runtime/common.ts` | `b408c2ec6b58b1cfc219f0969a00192107021345266d25b24fa4b0a010b86def` |
| `packages/edit-runtime/dispatch.ts` | `38920ceee74d2086f16d2e9f2c53cdd5a3781fcc93023264cb24c6bb570694eb` |
| `packages/edit-runtime/index.ts` | `5bb3ff66b011dd836dc99c09dbd878d22d563b4b3ea011b7d18235b49b93db5d` |
| `packages/edit-runtime/ledger.ts` | `c951d6bdeec0adc2a540464231005927bd8fae0f9981a7372b6505ab3e08bc26` |
| `packages/edit-runtime/ports.ts` | `03c82e2208428ca68c651a7e2f1f2b4dc644339818ecb39b461a8a790d666974` |
| `packages/edit-runtime/recheck.ts` | `868858573fb29b49ae19696434e53de05a8aee3e1e754386c22ba9e60b07cd2a` |
| `packages/edit-runtime/records.ts` | `3abd8f03892512bb6220a90a980452c30a598b220f7b7c72737528c892f42b0f` |
| `packages/edit-runtime/staging.ts` | `ef0e0694081a683d74b256bd3b8ee61da986972bea00cc65e3e9d2a8aaddac51` |
| `packages/edit-runtime/validated.ts` | `c01b39d19475bb21c3d8653a06cfc2278dd9dbdfd6337217305d5ebd6cf7e14a` |
| `scripts/edit-runtime-local.ts` | `016ae90284b4181909e2dc0ffa79d0824c596d41166af376fc65282f24bc0546` |
| `tests/edit-runtime.test.ts` | `bfa7029b26f310c9936629db7e760e4a09ab17c1fcb6f133fb9a8d764e196057` |
| `tests/support/edit-runtime.ts` | `994fe3e32fee313c283180a9ecf0749a272195ef92248137f720d027006594fe` |
| `tests/support/edit-runtime-chains.ts` | `f963438e468c9c375451960eb3bc4bd9513f1fca8ef801b0cc12711cd8ba8297` |

## 17. Preservation and workspace checks

These ran after the documentation edits. The evidence is `batch2a-final-protected-byte-comparison.json` (`989b563285f2aa1deb413cfcf25918669345a009475fc5b516b9b91d97442c3b`) and `batch2a-final-workspace.log` (`ee240a733b4837c9991212d5242acb8efc38373c7920da7b0c5faccb368b4a2f`).

| Check | Result |
| --- | --- |
| Branch / HEAD / origin / ahead-behind / staged | `phase/5-edit-planner-v0` / `ae432248cd30e8465cd652f49b1e35f441af2e58` / same / 0-0 / nothing staged |
| Tracked SHA-256 against `batch2a-baseline.json` | 263/263 accounted for. Only the authorized `docs/CURRENT_PHASE.md` differs; none missing |
| Protected files | 149/149 byte-identical, including every `packages/edit-execution/` file, `packages/{contracts,providers,validation,jobs,routing,edit-graph,planning,director,world-model,perception,telemetry}/`, `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, the existing `tests/support/` and `scripts/` files, and the frozen Batch-1 report |
| Owner files | All eleven unchanged in size and SHA-256 |
| Earlier Gate-7 receipts | All 105 unchanged; the Batch-2A receipts are new files |
| `git diff --check` | PASS |
| New files | LF line endings, a final newline, no trailing whitespace, no byte-order mark |
| Relative links | Every link in this report and in `docs/CURRENT_PHASE.md` resolves |
| Temporary runtime roots | None left behind; every test root was an isolated OS temporary directory removed after its test |

Focused test 03 also pins, by SHA-256, the nine accepted `packages/edit-execution/` files and `packages/routing/index.ts`. It pins `packages/edit-graph/index.ts`, `packages/editorial/common.ts` and `packages/domain/serialization.ts`, the Batch-1 tests and test support, and the frozen Batch-1 report.

The only tracked change is `docs/CURRENT_PHASE.md`. The new files are the ten core files, the adapter, the focused test file, its two support files and this report.

## 18. The Batch-2B hand-off (documented, not implemented)

### Safe sequence

1. Validate the Batch-1 DAG (full replay).
2. Record the authoritative AttemptRegistration.
3. Acquire the atomic ExecutionClaim.
4. Stage the exact bytes.
5. Observe the post-stage lifecycle.
6. Run a post-claim **real** capability probe.
7. Run a post-claim **real** pinned runtime and encoding probe.
8. Verify the staged objects again.
9. Create a short-lived DispatchPreparation.
10. Validate the preparation at Batch-2B runtime-now (`confirmDispatchPreparationCurrent`).
11. Verify the staged byte objects immediately before execution.
12. Spawn only the pinned, registered executor and runtime.
13. Consume only the staged sources.
14. Measure the actual work.
15. Create an execution receipt.
16. Run independent QC on the actual media.

No original source path may re-enter after staging.

### Frozen Batch-2B requirements

Batch 2B may not spawn the encoder until it implements and verifies:

1. the exact winning ExecutionClaim;
2. the authoritative AttemptRegistration;
3. a fresh, valid DispatchPreparation;
4. a real post-claim executor and capability probe;
5. a real post-claim pinned runtime and encoding probe;
6. full staged-object verification immediately before execution;
7. an owned registry mapping validated executor and runtime IDs to the fixed local implementation;
8. no interpretation of any ID or prose as a command or path;
9. consumption of staged sources only;
10. measured runtime resource, cost and time accounting;
11. an immutable success or failure execution receipt;
12. independent QC of the actual media.

### Future runtime registry rule

`executorId` and `runtimeId` are opaque owned identifiers. They are never a filesystem path, an executable name, a shell command or a URL. Batch 2B must map an owned, validated executor or runtime identity to a preconfigured implementation through a fixed internal registry, never from a string ID to an execution of that string. Batch 2A defines no registry and launches nothing; it builds no media argument list, filter graph, shell fragment or command placeholder.

## 19. Remaining limitations

- **Synthetic evidence only.** The lifecycle, capability and runtime providers are synthetic and test-only. No real external lifecycle source, executor probe or runtime probe exists, and every preparation says so (`evidenceGrade`).
- **Opaque bytes.** The test bytes are not video. Nothing was decoded, encoded, rendered or checked for media correctness. Staging does not equal rendering.
- **Durability.** Power-loss durability of a just-published name is not claimed (the directory entry is not synced).
- **Same-user hostility.** It is outside the local-development guarantee (see "Residual boundary").
- **Not an authenticated principal.** The claimant `workerId` is a label. In-process ownership is the `ClaimOwnership` capability, which ends with its process.
- **Audit coverage.** The workspace audit does not list the new adapter; focused tests enforce its prohibitions instead.
- **Not claimed.** No FFmpeg, ffprobe, Python, CUDA, model, real footage, media integration or network operation ran. No public UEP, RenderResult, QCResult, DecisionEvent, JobState or confidence was emitted. Nothing here establishes rendering quality, conformance, A/V sync, pixel correctness, real-media compatibility, professional editing, story, pacing, critic or repair quality.

PHASE 5 GATE 7 BATCH 2A IMPLEMENTATION VERIFICATION: PASS

GATE 7 BATCH 2A OWNER ACCEPTANCE: PENDING

ACTUAL FFMPEG EXECUTION: NOT AUTHORIZED IN BATCH 2A

GATE 7 OVERALL: NOT YET COMPLETE

## Independent owner-review repair — 2026-09-25

This section is appended. The sections above are historical and were not rewritten; where this repair changes them, the "Superseded statements" list below names each statement. The owner review, `gate7-batch2a-owner-review.txt`, is preserved unedited and unstaged.

Gate 7 Batch 2A owner-review repair verification: **PASS**

Gate 7 Batch 2A owner acceptance: **PENDING**

Actual FFmpeg execution: **NOT AUTHORIZED**

Gate 7 overall: **NOT YET COMPLETE**

### Baseline and constraints

- Branch `phase/5-edit-planner-v0` and HEAD `ae432248cd30e8465cd652f49b1e35f441af2e58` were unchanged throughout. `origin/phase/5-edit-planner-v0` was read locally as the same SHA, 0/0. **No new `git fetch` ran during this repair.** Nothing is staged, committed or pushed.
- Before any repair edit, `batch2a-owner-repair-baseline.json` (`045cfaecaaa75b3b7aff88f7acd96bf603f166548a80f22e5396a01f2f4b60a9`) recorded:
  - 263 tracked files and 149 protected files;
  - 12 owner files: the eleven listed above plus `gate7-batch2a-owner-review.txt`;
  - the 136 earlier Gate-7 receipts;
  - the 16 Batch-2A work files.
- The unrepaired production bytes are listed in `batch2a-owner-review-prerepair-hashes.log` (`f4e1722d965ea80f558bde94e08ec1a1592d696beb00224effb876bd6c1bed75`); they equal the final bytes recorded above.
- Only uncommitted Batch-2A files, their tests and support, this report and `docs/CURRENT_PHASE.md` changed. No accepted Gate 1–7 Batch-1 production byte, public contract, dependency or lockfile changed, and no finding required an earlier-gate change.
- No FFmpeg, ffprobe, Python, media, model, real footage, external provider, network or subprocess operation ran. No real probe exists.

### Findings and outcomes

| # | Owner finding | Outcome | Red receipt (under `.local-runs/phase5-gate7/`) |
| --- | --- | --- | --- |
| 1 | CRITICAL: a DispatchPreparation outlived the freshness of the rechecks it rested on | CONFIRMED for all three evidence classes; repaired | `batch2a-owner-freshness-window-red.md` (`548bf226bf39b138a5bfa95cb6b27f0d7a0031f2efa8b1818838038a5838cef6`) |
| 2 | Causal clock order was incomplete | CONFIRMED (registration to claim, claim to staging start, staging start to completion); repaired | `batch2a-owner-causal-time-red.md` (`3c69e9b5aa5dd0326629961ee9e03823960fbc04ff8641c4a7a7197888ee66a2`) |
| 3 | The Batch-2B probe contract was synthetic-only, and observation time was a pre-call instant | CONFIRMED (all five contract shapes unrepresentable; each provider-call rewind undetected); contract repaired, with no probe implemented | `batch2a-owner-real-probe-contract-red.md` (`e9ec6cf0bb8d9d6a63bfd3728f763d0d7aaf48cfd92a7956a8d2d5fd22f5057c`) |
| 4 | The supplied-artifact universe was unbounded | CONFIRMED at all nine entry points; repaired | `batch2a-owner-artifact-bound-red.md` (`10fa6131e336f4964aee794d093c73e4a0ce7b73dc1a613f81e7672a281b49df`) |
| 5 | Evidence truth: local ledger authority domain | CONFIRMED as a documentation defect; corrected below; focused test OR5 added | Not a code defect: OR5 passed on the unrepaired bytes |
| 6 | Evidence truth: network wording | CONFIRMED as a documentation defect; corrected below | Not a code defect |

All eleven regressions were written before any repair and run together against the exact unrepaired bytes: 126 tests, 115 pass, 11 fail (`batch2a-owner-review-red-run.log`, `12baa7e478b025adc0c1259e9e00e63097e6500b699c32d4b939ecd63af38ea4`). The eleven are:

- tests 77 and 82 (the exclusive boundary);
- OR1 for capability, runtime and lifecycle;
- OR2a, OR2b and OR2c;
- OR3a and OR3c;
- OR4.

Each stopped at its first failing assertion, so every sub-case was confirmed separately against the same unrepaired build with a read-only diagnostic over isolated temporary roots (`batch2a-owner-review-subcases.log`, `1391fec7223f15140c12da1b8640a96a0a4af5e89faa5842327e0a4fac5010e1`). After the repairs the focused file passed 126/126 on its first run (`batch2a-owner-review-repair-focused-run.log`, `7bc4151057245cbfffacf10e0098907946f4972d303de7aecbb765ff29496c59`).

### Finding 1 — one exclusive freshness window, and a preparation bounded by it

**The rule.** Evidence observed at `observedAt` under a maximum age `maxAge` is fresh exactly while `observedAt <= now < observedAt + maxAge`. Freshness expiry is exclusive, like every window end in Batch 2A. The same rule governs the lifecycle observation, the capability recheck and the runtime recheck.

**Preparation.** `preparedAt` must lie inside every required evidence window (`lifecycle_stale`, `capability_recheck_stale`, `runtime_recheck_stale`). `validUntil` is now the minimum of:

- `preparedAt` + `preparationLifetimeMilliseconds`;
- the ExecutionGrant `expiresAt`, if finite;
- every ExecutionMediaGrant `expiresAt`, if finite;
- every lifecycle retention `expiresAt`, if finite;
- every lifecycle observation's `observedAt` + `maxLifecycleObservationAgeMilliseconds`;
- the capability recheck's `observedAt` + `maxCapabilityRecheckAgeMilliseconds`;
- the runtime recheck's `observedAt` + `maxRuntimeRecheckAgeMilliseconds`.

`validUntil` stays exclusive, so `preparedAt <= now < validUntil` alone can never admit evidence older than its policy.

**Explicit bindings.** Each evidence binding in the preparation now records its `freshUntil`. The schema refuses any preparation whose `validUntil` exceeds a binding's `freshUntil`, even coherently re-identified.

**Boundary (tests OR1 × 3, 77, 82).** Evidence 29,999 ms old under a 30 s maximum age prepares with `validUntil = observedAt + 30 s`:

- one millisecond before it, the preparation is current;
- at it and one millisecond after it, the preparation is expired;
- a new preparation at or after it is stale.

Before the repair, confirmation at an evidence age of 30,001 ms **succeeded**, because the preparation window ran to `preparedAt` + 10 s.

### Finding 2 — causal lower bounds between runtime events

- **Claim.** It requires `claimedAt >= registration.registeredAt`, besides the admission and grant rules (`evidence_chronology_invalid`; OR2a).
- **Staging start.** Staging reads `stagingStartedAt` first and requires `stagingStartedAt >= claim.claimedAt` before any source resolution, open, copy or publication (OR2b: zero resolves, zero opens, nothing published).
- **Staging completion.** After the byte work, staging requires `stagedAt >= stagingStartedAt`, and therefore `>= claimedAt` (OR2c: a clock rewound during the copy leaves no receipt).
- **Receipts and preparations.** `StagedSourceReceipt` now records `stagingStartedAt`, and the schema requires `stagingStartedAt <= stagedAt`. A preparation requires `stagingStartedAt >= claimedAt`.
- **Checks.** Every lifecycle, capability and runtime check starts no earlier than its claim, and a lifecycle check no earlier than its staged source. A clock that runs backwards during a provider call refuses (OR3c).

The runtime clock is a **trusted local runtime dependency**. These causal lower bounds prevent already-observed runtime events from being rewound relative to each other; they do not make the runtime immune to arbitrary hostile wall-clock manipulation.

### Finding 3 — a future-capable, strict provenance contract that Batch 2A cannot use

**Contract shapes.** Each evidence record's provenance is a strict discriminated union:

| Record | Batch-2A variant | Future contract shape (representable; never produced or accepted in Batch 2A) |
| --- | --- | --- |
| SourceLifecycleObservation `observer` | `{ kind: synthetic_test, observerId, version, basis: synthetic_test_lifecycle_provider_no_external_query_v0 }` | `{ kind: real_authoritative_observation, observerId, version, implementationDigest, basis: authoritative_media_lifecycle_record_query_v0 }` |
| DispatchCapabilityRecheck `checker` | `{ kind: synthetic_test, checkerId, version, basis: synthetic_test_capability_rechecker_no_real_executor_probe_v0 }` | `{ kind: real_local_probe, checkerId, version, implementationDigest, basis: pinned_local_executor_capability_probe_v0 }` |
| DispatchRuntimeRecheck `checker` | `{ kind: synthetic_test, checkerId, version, basis: synthetic_test_runtime_rechecker_no_real_runtime_probe_v0 }` | `{ kind: real_local_probe, checkerId, version, implementationDigest, basis: pinned_local_runtime_encoding_probe_v0 }` |

Versions are location-free labels, digests are 64 hex, and unknown fields fail. A real kind without its exact identity (for example, no implementation digest) is not representable, and neither is a synthetic kind carrying extra real-looking fields (OR8).

**Preparation grade.** `evidenceGrade` is the typed enum `synthetic_post_claim_rechecks_not_real_probes_batch2a | real_post_claim_probe_evidence_v0`. Every evidence binding records its `provenance` kind. The schema requires the grade to name exactly the provenance of every binding: all synthetic, or `real_local_probe` for both rechecks and `real_authoritative_observation` for every lifecycle observation.

**What Batch 2A produces and accepts.** Only the synthetic variant and the synthetic grade. With the owned code `evidence_provenance_unsupported` (58 codes in total), Batch 2A refuses:

- a provider response claiming a well-formed real provenance, when the evidence is recorded;
- a caller-built, re-identified record with real provenance, when a preparation is made.

A re-identified real-grade preparation fails replay (`dispatch_preparation_replay_mismatch`), because replay recomputes the grade from the actual records (OR3a). No factory, adapter or validation path in Batch 2A can produce or accept the real variant. Batch 2B must add that separately owner-reviewed trusted path, and must require real capability and runtime probe provenance before any media subprocess. Batch 2A creates no executable permit.

**Observation timing.** Each check runs inside a window the runtime clock measures around the provider call, and each record now carries:

- `checkStartedAt`, read before the call;
- `checkCompletedAt`, read after it, and never before `checkStartedAt`;
- `observedAt`, the instant the observation applies;
- `observedAtBasis`.

The instant and its basis work as follows:

- **Provider-reported.** A provider may report its own `observedAt`. It must lie inside `[checkStartedAt, checkCompletedAt]`, and it is recorded as `provider_reported_within_check_window`.
- **Not reported.** A provider that reports none (every Batch-2A synthetic provider) is recorded at `observedAt = checkStartedAt` with basis `check_started_lower_bound`: a conservative lower bound, never presented as an exact observation instant. With the controlled test clock, a synthetic check's three instants are equal.
- **How a preparation uses them.** It applies causal lower bounds to `checkStartedAt`, the upper bound (`<= preparedAt`) to `checkCompletedAt`, and the freshness window to `observedAt` (OR6).

### Finding 4 — a bounded supplied-artifact universe

`MAX_RUNTIME_ARTIFACTS = 512` is enforced before any `EditorialArtifactMap` is built: in `RuntimeArtifacts`, and so in `openValidatedDag` and `registerAttempt` before any Batch-1 or Gate-3 replay, and at the runtime call boundary of every claim-bound step. Exactly 512 are accepted; 513 refuse as `limit_exceeded` at all nine entry points (OR4). A 513-element duplicate set is refused by the bound before duplicate detection. Artifact order never changes a preparation. Unreferenced foreign or padding artifacts up to the bound grant nothing (OR9).

The value is measured, not guessed:

- **Measured** (`batch2a-owner-artifact-universe-measurement.log`, `053495f0239796424ece266e7cc369d26fd5f06fe580ce782339f3ff71207755`; `batch2a-owner-artifact-universe-sixteen-sources.log`, `396542bdd42472ce3e5099cf7f465faaf4ad15664263d2d6ea7e4591a6605477`):
  - accepted Batch-1 admission and DAG fixtures carry 82–88 artifacts, and 104 over four sources (about eight more per source);
  - the largest Batch-2A preparation call in the focused tests carries 98.
- **Extrapolated.** The accepted test chain builder cannot produce a chosen plan over 8 or 16 sources, so the Batch-1 maximum of 16 sources is extrapolated: about 200 artifacts, and about 240 with every Batch-2A record.
- **Headroom.** 512 is more than twice that ceiling. No accepted earlier-gate artifact schema changed.

### Finding 5 — the local ledger authority domain (documentation correction)

The filesystem claim proves exclusivity only among contenders that share the **same** authoritative runtime ledger root:

- local V0 has **one configured authoritative ledger root per authority domain**;
- every local worker or process that can execute the same project's work **must** use that shared root;
- two independent roots are two independent authority domains, and must not be used concurrently for the same logical work;
- local-root exclusivity is not a multi-host, cloud or global-lock claim;
- a future distributed deployment requires one strongly consistent shared implementation of the `RuntimeLedger` claim primitive.

The semantic AttemptSlot and claimTarget invariants are unchanged. Tests 31 and OR5 prove that adapters over the same root contend correctly: exactly one winner. OR5 also shows that an isolated second root grants the same target independently. It documents the limitation and is not a production concurrency guarantee.

### Finding 6 — network provenance (documentation correction)

- **Before work.** One pre-work `git fetch` of `origin/phase/5-edit-planner-v0` contacted the Git remote, solely to verify the frozen baseline and synchronization. It is part of this batch's provenance and is not erased.
- **Runtime and tests.** Batch-2A runtime code and test execution performed no network I/O. Every runtime and test gate ran under `scripts/no-network.mjs`, and no lifecycle, capability or runtime provider contacted an external service.
- **This repair.** No `git fetch` or other network operation ran.

### Audit coverage (unchanged limitation)

The protected, hard-coded workspace audit still does not enumerate `scripts/edit-runtime-local.ts`. Focused tests 99–103 statically inspect its imports, calls and compiled closure. This repair does not broaden into an audit rewrite. **Before any `child_process`-capable renderer adapter is accepted in Batch 2B, the owner must separately decide and authorize its workspace-audit registration and policy.**

### Test changes

Existing tests changed only where a finding changes the contract. None was weakened:

- **Tests 77 and 82** move to the owner-mandated exclusive boundary: one millisecond before the maximum age passes; exactly at it and after it refuse. This is stricter than the previous inclusive boundary.
- **Tests 69, 76, 81 and A12** forge timestamps coherently through `retime`, which moves every instant a check record carries. The forgeries stay attacks of the same kind, and the expected refusal codes are unchanged.
- **Test 95** keeps its extended-`validUntil` forgery. It is now refused structurally (`dispatch_preparation_invalid`), even coherently re-identified. A shortened-by-one-millisecond reseal is added, which only replay can object to.
- **Support.** The synthetic provider constants in `tests/support/edit-runtime.ts` carry `kind: synthetic_test`, which the repaired contract requires.

New tests: OR1 × 3, OR2a–c, OR3a, OR3c, OR4 and OR5 (written before the repair), and the hard attacks OR6–OR9 (written after it). The focused file now has 130 tests.

### Hard attacks after the repair

OR6–OR9 passed on their first run (`batch2a-owner-review-attacks-first-run.log`, `aa817bffde924faa8dcba0ee2bc6118d862aa269846450ef709daa46b1ee3d75`; 130/130). They cover:

- provider-reported instants inside and outside the check window, the lower-bound default, and freshness running from the observation instant;
- staged receipts forged to start before the claim or to complete before they start;
- grade/provenance mismatches, and pseudo-synthetic or vague real provenance;
- a foreign padded universe at the bound.

Together with the regressions above, the prompt's attack list is covered:

- fresh-then-stale evidence of each class, with exact boundaries;
- a clock rewind at each causal step and during each provider call;
- real provenance represented but refused, and a provider or caller relabeling;
- the artifact bound, bound + 1, reordering, and duplicate and foreign sets;
- two instances over one root with exactly one winner.

No new genuine defect was found, so no further red is claimed.

### Chronology and receipts

No receipt was overwritten. All paths are under `.local-runs/phase5-gate7/`.

| Step | Evidence (SHA-256) | Result |
| --- | --- | --- |
| Baseline | `batch2a-owner-repair-baseline.json` (`045cfaecaaa75b3b7aff88f7acd96bf603f166548a80f22e5396a01f2f4b60a9`) | As above; no fetch |
| Artifact measurement | `batch2a-owner-artifact-universe-measurement.log`, `batch2a-owner-artifact-universe-sixteen-sources.log` | 82–104 measured; 512 chosen |
| Owner reds | `batch2a-owner-review-prerepair-hashes.log`; `batch2a-owner-review-red-build.log`; `batch2a-owner-review-red-run.log` (`12baa7e478b025adc0c1259e9e00e63097e6500b699c32d4b939ecd63af38ea4`); `batch2a-owner-review-subcases.log` (`1391fec7223f15140c12da1b8640a96a0a4af5e89faa5842327e0a4fac5010e1`); four receipts | 126 tests, 115 pass, 11 fail; every sub-case confirmed separately |
| Repair | `batch2a-owner-review-repair-build.log`, `batch2a-owner-review-repair-focused-run.log` (`7bc4151057245cbfffacf10e0098907946f4972d303de7aecbb765ff29496c59`) | 126/126 |
| Hard attacks | `batch2a-owner-review-attacks-build.log`, `batch2a-owner-review-attacks-first-run.log` (`aa817bffde924faa8dcba0ee2bc6118d862aa269846450ef709daa46b1ee3d75`) | 130/130 on first run; no new defect |
| Static prohibition search | `batch2a-owner-repair-static-prohibition.log` (`5178bd17de33ee16a390a9f9354db73d97340f6c0b615106402aca2cd67aa9fc`) | Zero occurrences in the ten core files and the adapter |

### Owner-repair verification

All test runs used `scripts/no-network.mjs`. The gates ran sequentially from one script; exit codes and durations are in `batch2a-owner-repair-final-gates-summary.log` (`fd0ac4000007eb94c0d748f48e2288b2e8aa9f43b6f95b04f5c79864a14449dd`).

| Command / check | Result | Local evidence (SHA-256) |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `batch2a-owner-repair-final-typecheck.log` |
| `npm.cmd run build` | PASS | `batch2a-owner-repair-final-build.log` |
| Focused `dist/tests/edit-runtime.test.js` | 130/130 PASS | `batch2a-owner-repair-final-focused.log` (`2af496d145cdc87eac814f8cd6871e7d587a0b8e3254f8200fbb0f055953f0ee`) |
| Gate-7 Batch-1 regression | 81/81 PASS | `batch2a-owner-repair-final-gate7-batch1-regression.log` (`27c19e001c0641132d29c67a13a9a09cbd6e2512ceb756787d46d243d4b9b332`) |
| Gate-6 regression | 79/79 PASS | `batch2a-owner-repair-final-gate6-regression.log` (`a6be35ab0ea26583d38641e95c297636e0e2559d62327f93ae111b5d6a35e2b3`) |
| Gate-5 regression | 97/97 PASS | `batch2a-owner-repair-final-gate5-regression.log` (`20db76ad9527d7bd6e5cfc1679fff0b5cfda1308983bd00e28a5fa36e800c1c1`) |
| Routing and budget | 33/33 PASS | `batch2a-owner-repair-final-routing-regression.log` (`e0a3e3a6e8eaf45cf61cb6f7a82f98740935b47388046f922d09f2c723a071be`) |
| Accepted 16-file compatibility set | 377/377 PASS | `batch2a-owner-repair-final-compatibility.log` (`fe9341d8842b7986a5f4ee9c68e39855c3bab34578e7f50d6848c02296e848f3`) |
| Legacy seams: `contracts`, `integration`, `jobs`, `telemetry` | 39/39 PASS | `batch2a-owner-repair-final-legacy-seams.log` (`b1974b38c422344507f4434069ab8a27cfdba377c7965be23461ad067cc69864`) |
| `npm.cmd test` | 836/836 PASS (706 accepted plus 130 Batch-2A) | `batch2a-owner-repair-final-full-safe-suite.log` (`0df2f8967d4779ce41f682676ae864f63be475990511cacdd8e6106a53ed08b7`) |
| `npm.cmd run audit:workspace` | PASS: 97 application TypeScript files and 9 runtime adapters | `batch2a-owner-repair-final-workspace-audit.log` (`083f05dd23822efd7b8386047467361641c973f8cd2c3e0a36fca536d078bd4f`) |

Every run had zero failed, skipped, cancelled or todo tests. The focused run printed the two earlier platform diagnostics, and OR5's documented limitation that two isolated roots are independent authority domains. No FFmpeg, ffprobe, media integration, Python, CUDA, real-model, real-footage or external-provider operation ran, and no `git fetch` or other network operation ran during this repair.

**Final bytes after the repair:**

| File | SHA-256 | Since the Batch-2A final bytes |
| --- | --- | --- |
| `packages/edit-runtime/call.ts` | `40b1b80e5e98820223e1ef825867728165750b59dbbb695b6ab0cda4f55f40ee` | changed |
| `packages/edit-runtime/common.ts` | `3e03458c434445523cda89bddb097cd383991edfa874eed3fff3c3609dfcbeb4` | changed |
| `packages/edit-runtime/dispatch.ts` | `f0a75e7fe0dac3173d15d88344f50803758cd990a615822dfdc52091dfcff0c7` | changed |
| `packages/edit-runtime/index.ts` | `4b0b9ca65caf88d34e1d7c5121f9df1a23181af9a08aafdb688cd51fe68faf0f` | changed |
| `packages/edit-runtime/ledger.ts` | `b12cceb87896e98a16a2f3be47027c61529d3313a412d077b559bd745e3b8303` | changed |
| `packages/edit-runtime/ports.ts` | `0ffb89cb6ebad7bf99c61beb132fdd01a7246f8921bf1730c101c436f9ccbedb` | changed |
| `packages/edit-runtime/recheck.ts` | `646c6e235068237d889888ec88a1681241f76e0eff714dd82bda3315b0c36e96` | changed |
| `packages/edit-runtime/records.ts` | `ca9093398cba8bc3d7652a0dbf0189d63936fcb7f15df4fd0b3dab900380190e` | changed |
| `packages/edit-runtime/staging.ts` | `5fcc677b643f1b9efe78087d585a071a29eda9e8884f1ab775adfeb32e7404c3` | changed |
| `packages/edit-runtime/validated.ts` | `c01b39d19475bb21c3d8653a06cfc2278dd9dbdfd6337217305d5ebd6cf7e14a` | unchanged |
| `scripts/edit-runtime-local.ts` | `016ae90284b4181909e2dc0ffa79d0824c596d41166af376fc65282f24bc0546` | unchanged |
| `tests/edit-runtime.test.ts` | `eb94e7881e3c85ea2f24a3301b78277d1d5eff62430abae01b850e54c56f5be8` | changed |
| `tests/support/edit-runtime.ts` | `f2878c11dbfc758af78b059f1b05143eed8744f8b68513541aad7cf93209de0d` | changed |
| `tests/support/edit-runtime-chains.ts` | `f963438e468c9c375451960eb3bc4bd9513f1fca8ef801b0cc12711cd8ba8297` | unchanged |

### Owner-repair preservation and workspace checks

These ran after the documentation edits. The evidence is `batch2a-owner-repair-protected-byte-comparison.json` (`398caab51832a9c1fe648b0f460fd265d9bc9648ba6539b4a386d5d24e660783`), against `batch2a-owner-repair-baseline.json`; a closing re-check after the last report edit is `batch2a-owner-repair-protected-byte-comparison-rerun.json`.

| Check | Result |
| --- | --- |
| Branch / HEAD / local origin ref / staged | `phase/5-edit-planner-v0` / `ae432248cd30e8465cd652f49b1e35f441af2e58` / same, 0-0 / nothing staged |
| Tracked SHA-256 against the repair baseline | 263/263 accounted for. Only the authorized `docs/CURRENT_PHASE.md` differs; none missing |
| Protected files | 149/149 byte-identical, including every `packages/edit-execution/` file, the other accepted production packages, `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, the existing `tests/support/` and `scripts/` files and the frozen Batch-1 report |
| Owner files | All twelve unchanged in size and SHA-256, including `gate7-batch2a-owner-review.txt` |
| Earlier Gate-7 receipts | All 136 unchanged; 29 new owner-repair receipts |
| Changed work files | Nine core files, the focused tests, `tests/support/edit-runtime.ts`, this report and `docs/CURRENT_PHASE.md`. `validated.ts`, the adapter and the chain builder are unchanged |
| `git diff --check` | PASS |
| New and changed files | LF line endings, a final newline, no trailing whitespace, no byte-order mark |
| Relative links | Every link in this report and in `docs/CURRENT_PHASE.md` resolves |
| Temporary runtime roots | None left behind |

### Superseded statements

Each statement below, in the sections above, is superseded as described. The original text stays as the historical record.

1. "Files": "116 focused tests …". There are now 130: 95 over the required areas 1–107, 2 local-adapter checks, 19 adversarial self-review tests and 14 owner-review repair tests.
2. §3: "At claim time, runtime-now must be at or after the admission and inside the ExecutionGrant window". It must now also be at or after the registration's `registeredAt`.
3. §3 and §4: "Exactly one caller **acquires**" and "Exactly one concurrent publisher wins". These hold among contenders sharing one authoritative runtime ledger root, one local authority domain (Finding 5); they are not a global lock.
4. §7, algorithm: "Recheck the ExecutionGrant and the source's media grant at runtime-now" (step 3). The stage now first reads `stagingStartedAt` and requires it to be at or after the claim, before any source work; it later requires `stagedAt >= stagingStartedAt`.
5. §7, StagedSourceReceipt: "`stagedAt` from the runtime clock (never before the claim)". The receipt also binds `stagingStartedAt`, and `stagingStartedAt <= stagedAt`.
6. §9: "a clock that runs backwards across the claim refuses". A clock that runs backwards also refuses across registration and claim, across the claim and the staging start, during the copy and during every provider call.
7. §11: "`observedAt` from the runtime clock, taken before the provider call". It is replaced by the check-window timing model (`checkStartedAt`, `observedAt`, `checkCompletedAt`, `observedAtBasis`).
8. §11: "the observer (identifier, version and a basis that can only be `synthetic_test_lifecycle_provider_no_external_query_v0`)". The observer is a typed provenance union. A future `real_authoritative_observation` is representable, and Batch 2A accepts only `synthetic_test`.
9. §11: "at or after the claim and at or after that source's `stagedAt`, and no later than `preparedAt`; within the policy age". These bounds now apply to the check window (start after the claim and staging; completion no later than `preparedAt`), and freshness is the exclusive window from `observedAt`.
10. §12: "the checker identity, whose basis can only be `synthetic_test_capability_rechecker_no_real_executor_probe_v0`", the same statement for the runtime checker, and "A provider or record claiming a real probe cannot be represented (test A14)". Real-probe provenance (`real_local_probe`, with exact implementation identity) is now representable, and Batch 2A refuses it as `evidence_provenance_unsupported`. Test A14 still refuses a mislabeled synthetic provenance, as invalid.
11. §13: "Exactly at a maximum age passes; one millisecond older refuses (tests 77 and 82)". Freshness is exclusive: exactly at the maximum age refuses.
12. §13, validity window: "`validUntil` is the earliest of `preparedAt` + lifetime, the ExecutionGrant expiry, every media-grant expiry and every retention expiry". It is now also bounded by every lifecycle, capability and runtime freshness expiry, and each binding records its `freshUntil`.
13. §13, DispatchPreparation binds "`evidenceGrade: synthetic_post_claim_rechecks_not_real_probes_batch2a`". The grade is now a typed enum consistent with per-binding provenance, and Batch 2A produces only the synthetic grade.
14. §14: "All 57 codes are owned". There are now 58, adding `evidence_provenance_unsupported`.
15. §16: "No FFmpeg, ffprobe, media integration, Python, CUDA, real-model, real-footage or network operation ran", and §19, "Not claimed": "No FFmpeg, ffprobe, Python, CUDA, model, real footage, media integration or network operation ran". Corrected as follows. One pre-work `git fetch` contacted the Git remote solely to verify the frozen baseline. Batch-2A runtime code and tests performed no network I/O, all ran under `scripts/no-network.mjs`, and no provider contacted an external service. The media and model statements stand.
16. §16: the verification figures (116/116 focused, 822/822 full) are historical. The current figures are in "Owner-repair verification".
17. "Repository truth …" and §19, "Audit coverage". Still true. Batch 2B additionally requires a separate owner decision on workspace-audit registration before any `child_process`-capable adapter is accepted.

### Remaining limitations and blockers before Batch 2B

- **Synthetic evidence.** All evidence is still synthetic providers over opaque test bytes. The real provenance variants are contract shapes only; no real lifecycle source, executor probe or runtime probe exists.
- **Trusted local clock.** The runtime clock is trusted. Causal bounds catch rewinds between observed runtime events, not a consistently falsified clock.
- **Local authority domain.** Local exclusivity holds within one shared ledger root. A distributed deployment needs one strongly consistent shared `RuntimeLedger`.
- **Unchanged from Batch 2A.** Power-loss durability of a just-published name is not claimed, and same-user hostility is outside the guarantee.
- **Before Batch 2B spawns anything.** Every earlier frozen requirement still applies, plus:
  - a separately owner-reviewed trusted adapter that alone may produce and accept real probe provenance;
  - real `real_local_probe` capability and runtime rechecks and a real lifecycle observation;
  - staged-object verification immediately before spawning, with the same-user window addressed or scoped;
  - the workspace-audit decision for the renderer adapter;
  - measured accounting;
  - an execution receipt;
  - independent QC of the actual media;
  - owner acceptance of Batch 2A.

PHASE 5 GATE 7 BATCH 2A OWNER-REPAIR VERIFICATION: PASS

GATE 7 BATCH 2A OWNER ACCEPTANCE: PENDING

ACTUAL FFMPEG EXECUTION: NOT AUTHORIZED

GATE 7 OVERALL: NOT YET COMPLETE
