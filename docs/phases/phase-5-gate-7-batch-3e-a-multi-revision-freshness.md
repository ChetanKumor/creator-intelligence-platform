# Phase 5 Gate 7 Batch 3E-A — Multi-revision freshness and validation performance

**Current status (2026-10-04, §14).** 3E-A: **OWNER-ACCEPTED** at `820e218e8213c20f7bd48b338c9d4e1c8b1396b2`. The §12 limitations
are unchanged. Gate 7: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**. The status line below is preserved history.

**Status (2026-10-04).** 3E-A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW** (§13). Gate 7: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
3E-B and 3E-C: **NOT STARTED**.

Evidence: `.local-runs/phase5-gate7/batch3e-a-20261004/` (ignored). It holds numbered logs, receipts, and the scratch instruments,
copied unchanged. Everything here is synthetic: synthetic editorial chains, synthetic stores, and pinned FFmpeg over generated
fixtures. No owner footage, no model and no network were used. Timings are informational and are not production latency.

## 1. Baseline and authorization

- After `git fetch`: the local branch, the remote branch, `main` and `origin/main` all resolved to
  `4f85b559c7eff2c24e221011f3ee1dd1466a111d`. There were no tracked or staged changes, and the owner's untracked files were left alone.
- The owner authorized two bounded protected changes. **A1** is an exact-identity memo of a successful validation at the current-head
  boundary. **A2** is a semantics-preserving repair of the superlinear cold validation.
- Authorized production files: `scripts/edit-editorial-local.ts`, plus `packages/edit-editorial/state.ts` and
  `packages/edit-graph/revision.ts` only if required.
- Changed: `scripts/edit-editorial-local.ts` (A1) and `packages/edit-editorial/state.ts` (A2).
- **`packages/edit-graph/revision.ts` is unchanged.** It was not required (§5).
- No accepted test, hash pin, schema, dependency or lockfile changed (§11).

## 2. The audit finding, reproduced from current source-built bytes

`dist/` was rebuilt from the exact `4f85b55` source (`npm run build`, 21 s) before any measurement. The compiled hashes are in
`02-baseline-dist-hashes.log`.

The scratch instrument (`instrument-chain-3e-a.mjs`, `instrument-measure-3e-a.mjs`) works as follows:

- It builds one synthetic history over the accepted two-source editorial fixture: lock, trim, preference, trim, preference, trim.
- It writes that history in the exact `LocalEditingProject` store layout.
- It counts structure with test-only wrappers, and no production hook was added:
  - one `EditGraphPolicySchema.parse` per Gate-6 graph construction (each construction replays Gate 5);
  - one `AnyGraphDiffSchema.parse` per GraphDiff application;
  - builtin `open`/`createHash` calls, through `syncBuiltinESMExports`, as the accepted `observeMediaSpawns` does.

`03-red-structural-measurement-baseline.jsonl`:

| state depth | unique graphs | cold `current()`: constructions (time) | warm second `current()` |
|---|---|---|---|
| 1 | 1 | 5 (2.5 s) | 5 (2.4 s) |
| 2 | 2 | 11 (6.0 s) | 11 (6.2 s) |
| 3 | 2 | 15 (8.5 s) | 15 (8.4 s) |
| 4 | 3 | 24 (14.3 s) | 24 (14.2 s) |
| 5 | 3 | 32 (18.5 s) | 32 (17.3 s) |
| 6 | 4 | 44 (25.1 s); one revision applied 14 times, the root rebuilt 19 times | 44 (25.4 s) |

- **Warm repeat (A).** An unchanged exact head is replayed in full on every call.
- **Cold complexity (B).** `validateEditorialState` replays each *state* ancestor once; 3E-A09 already passes on these bytes. At every
  level, though, it validates *graph* chains again:
  - its own graph;
  - again inside `applyEditorialStateDiff`;
  - twice inside `rebaseEditorialState`;
  - once more inside `createRootEditorialState`.

  Each `validateAnyEditGraph` of revision r replays the chain r..0 down to the Gate-5 root. `current()` also validates the head graph
  separately. A synthetic construction costs about 0.57 s; the earlier read-only audit measured a real store at slot 4 at 62.3 s.

## 3. RED tests on the unmodified production bytes

New file `tests/edit-editorial-validation.test.ts` (with `tests/support/edit-editorial-chains.ts`). Structural counts, never wall-clock,
decide every assertion.

- **05**, full run on unmodified production: 15 tests, 12 pass, 3 fail. These are exactly the designed reds:
  - **3E-A01**: the warm `current()` made 24 constructions; expected 0.
  - **3E-A10**: depth 6 gave `{ constructions: 40, root: 18, revisions: 3, maxPerRevision: 13 }`; expected `{ 4, 1, 3, 1 }`.
  - **3E-A11**: the pure path made 4/9/13/21/29/40 constructions and `current()` 5/11/15/24/32/44; expected 1/2/2/3/3/4.
- The security invariants that the repair must keep pass on the same bytes: A02-A09, A12-A14 and the parity corpus P00-P17.
- **07**: the final A06, A07 and A13, and the new A15, pass on the unmodified bytes.
- **10**: the final test bytes reproduce the three reds identically (see `red-receipt-addendum-final-test-bytes.md`).
- Receipts: `red-receipt-A-warm-repeat.md` and `red-receipt-B-cold-complexity.md`.

## 4. A1: exact-identity reuse at the current-head boundary (`scripts/edit-editorial-local.ts`)

- Each `LocalEditingProject` holds one `#replayed` record, in memory only: `{ proof, graph, state }`. It is never serialized, never
  read from the store, never accepted from a caller, and never shared between instances.
- `current()` performs every read exactly as before, on every call:
  - every head slot, with ownership and linkage checks;
  - every artifact, with its digest check;
  - the artifact map;
  - the head/graph/state binding and transition checks.
- The **proof** is the SHA-256 of `canonicalSerialize({ root, scope key, the digests of every head-slot byte string in order, the
  digest of every artifact's bytes })`. All of it comes from bytes read in that same call.
- Only when the proof is exactly equal is the graph-and-state replay skipped. The memo is then answered with defensive copies, and the
  head checks still run.
- A miss replays in full. The record is written only after the whole `current()` succeeds, so a failure is never remembered. The bound
  is one record, and the stale-head path is unchanged.
- Proven by A01-A08: reuse of an unchanged head with every read kept; any changed slot byte (latest or earlier) misses; replaced,
  re-encoded or missing artifacts are refused fail-closed; an appended slot is replayed on its own; linkage forgeries keep their exact
  refusal; no failure is reused, including a failure after a successful replay; the record is private to one instance, root and scope;
  stale-head refusals are unchanged.

## 5. A2: one replay per immutable graph inside one top-level validation (`packages/edit-editorial/state.ts`)

**Mechanism.** While an exported validator of `state.ts` runs, a call-scoped memo records successful graph validations. The exported
validators are `graphForTarget`, `createRootEditorialState`, `applyEditorialStateDiff`, `rebaseEditorialState`,
`validateEditorialState` and the new `validateGraphAndState`.

- The memo is bound to that exact artifact list. Each entry is keyed by the content digest of the validated graph.
- Each entry is recorded together with every ancestor that validation replayed.
- Only an input whose canonical content equals a recorded graph reuses it.

**Why recording ancestors is sound.** A revision validates only by replaying its exact parent, named by reference and SHA-256, down to
the Gate-5 root. So every graph reached through `parent.editGraph` has itself validated over the same list. The schema transforms are
idempotent sorts.

**Lifetime.** The scope opens at the outermost call and is cleared in `finally`. Validation is synchronous, so no caller code runs inside
it. No scope opener is exported.

**Why the refusal order is unchanged.**

- Every reuse point sits exactly where `validateAnyEditGraph` stood, with identical argument evaluation.
- A reuse skips only a validation that would have succeeded with the same value.
- Recording can never refuse: it builds the same `EditorialArtifactMap` that the validation just built, inside a guard.

**Head graph and state together.** `validateGraphAndState(graphRef, stateRef, artifacts)` lets `current()` and `#commit` validate the
head graph and then the state inside one scope. It runs in the original order (map, graph lookup, graph, state lookup, state), with the
original errors.

**Why `revision.ts` was not required.** Within a single `validateAnyEditGraph` call, the chain recursion is linear and visits each
ancestor once. The duplication was entirely in `state.ts` and `current()`.

**Proof.** A09-A14 cover:

- state ancestors replayed once;
- each graph ancestor constructed exactly once (depth 6: 4 constructions for 4 unique graphs);
- no repeat at any depth from 1 to 6;
- a forged state ancestor at every depth, and a forged graph ancestor at every revision, still refused;
- a forged graph named by a valid-looking state refused, in pure validation and at the current head;
- reuse never outliving its call (a list damaged in place after a success still refuses);
- impossible ancestry refused exactly as before.

## 6. Self-found defect before the first green, and process disclosures

**Self-found defect.** The first prepared A2 draft recorded ancestors through `artifactMap()`. That function carries the 1024-artifact
budget check, which `validateAnyEditGraph` lacks, so the draft could have introduced or reordered an `editorial_budget_exceeded`
refusal. It was repaired before any production byte changed. Regression 3E-A15 passes on the accepted bytes and is red against the
re-introduced defect (mutant `A2-self-found-budget-defect`). See `receipt-self-found-budget-defect.md`.

**Hardening, same review.** The memo key is the digest of the *validated* graph, not of the caller's input. A non-plain input therefore
cannot plant a wrong entry for later genuine lookups in the same call.

**Process disclosures (nothing rewritten):**

- **RED run 05 used an earlier revision of the test file.** Its compiled bytes were overwritten and its source hash was not recorded.
  The reds were re-run on the final bytes (run 10).
- **Media baseline 08 exposed two test defects, not product defects.**
  - F3 matched a regex against an `EditRenderError` message, but the code lives in `.code`. The actual refusal was the freshness refusal.
  - F4 shared one evidence set across cases. On the slow pre-fix bytes it aged past 60 s, so `runtime_probe_stale` preempted the
    intended codes.
  - Both tests were corrected: a code predicate, and a freshly authorized attempt per case. Baseline 11 then reran the media file on
    the unmodified bytes.
- **The machine slept on critical battery from 11:23 to 12:56 IST**, according to the Windows power log.
  - The sleep stretched run 11's real 61 s F3 wait to about 93 minutes, which expired the 1-hour execution grant. That F3 result is
    environmental and is not counted.
  - F3 was rerun on AC (12): PASS on the unmodified bytes.
- **The first mutation run (16) produced no results.** The harness passed an absolute Windows path to `--import`. Attempt 2 (16b)
  produced all results.

## 7. Results

- **15-green-pure-tests.log**: **16/16 PASS** (A01-A15 and parity), 350 s. For comparison, the first-revision suite (15 tests, before
  A15 existed) took 1,495 s on the old bytes (05).
- **Refusal parity**: the P00-P17 corpus gives the identical outcome table on the old and new bytes, warm and cold:
  - stale request;
  - changed slots (both accepted and refused cases);
  - missing and changed artifacts;
  - wrong graph parent and wrong state parent;
  - invalid GraphDiff and invalid EditorialStateDiff;
  - hard-lock and target-rebase corruption;
  - foreign-scope slot;
  - missing middle slot and incomplete artifact list;
  - CAS loser, a head moved by another instance, and an appended next head.
- **16b mutation reds**: 11 mutants, all expectations met.
  - Nine are killed:
    - A1: head-revision proof; latest-slot-only proof; memo stored before the head checks; memo shared by instances; reuse returning
      memo objects; store keeping caller objects.
    - A2: no ancestor recording; memo outliving its call; the self-found budget defect.
  - Two equivalent mutants survive, as predicted: a proof without artifact digests, because artifact bytes are already refused by the
    per-read digest check before the memo is consulted; and a memo ignoring the artifact-list binding, because no reachable call
    validates over a different list within one scope. Both are kept as defense in depth.

## 8. Freshness F1-F6 (`tests/edit-editorial-freshness-media.integration.ts`, real system clock)

| | unmodified bytes | after 3E-A |
|---|---|---|
| F1 revision 0 → 1 publishes | PASS (inside F2-F5 setups, 08/11/12) | PASS (22); accepted 3C-M01/M02: 4/4 PASS (23) |
| F2 true revision 1 → 2 with fresh evidence | PASS, evidence age at permit **17,576 ms** (08) | PASS, **1,548 ms** (22) |
| F3 evidence really aged > 60 s | PASS, `runtime_probe_stale` (12) | PASS (22) |
| F4 evidence of another claim / DAG | PASS (11) | PASS (22) |
| F5 head moved / CAS loser | PASS (11) | PASS (22) |
| F6 no render before a valid permit | PASS (11, 12) | PASS (22) |

F2 measures `permitBinding.authorizedAt - min(observedAt)` over the runtime, capability, lifecycle and conformance evidence; no time
is faked or moved. F4 covers four bindings:

- the call of another revision → `editorial_execution_graph_mismatch`;
- the runtime probe of another claim → `claim_mismatch`;
- lifecycle observations of another claim → `lifecycle_observation_invalid`;
- conformance of another claim → `input_conformance_invalid`.

Capability, media-grant and lifecycle-expiry mismatches remain covered by the accepted Batch-2B suites (§10). The synthetic F2 also
passes on the old bytes, because its history is too small to exceed 60 s. Real-media F2 is deferred to 3E-C.

## 9. Performance evidence (synthetic; informational)

`21-green-structural-measurement.jsonl`, on the same chain as §2:

| depth | unique graphs | cold `current()` before → after | warm `current()` before → after |
|---|---|---|---|
| 1 | 1 | 5 → **1** construction; 2.5 s → 0.32 s | 5 → **0**; 2.4 s → 68 ms |
| 2 | 2 | 11 → **2**; 6.0 s → 0.63 s | 11 → **0**; 6.2 s → 76 ms |
| 4 | 3 | 24 → **3**; 14.3 s → 0.99 s | 24 → **0**; 14.2 s → 73 ms |
| 6 | 4 | 44 → **4**; 25.1 s → 1.39 s | 44 → **0**; 25.4 s → 94 ms |

- **Warm calls still read and hash every byte.** File opens are 72-111 and bytes read 325,027-554,433, identical to cold and to the
  baseline. SHA-256 operations are 226-342 warm against 2,214-10,913 cold.
- **The duplicates avoided at depth 6 (cold `current()`) are 40 constructions.** Before: 25 GraphDiff applications (one revision applied
  14 times) and 19 root builds. After: 3 and 1, that is, 22 repeat applications and 18 repeat root builds avoided.
- **Second revision, synthetic media (F2):**

  | | before | after |
  |---|---|---|
  | `prepare` | 3,770 ms | 2,310 ms |
  | first `assertCurrent` | 7,891 ms | 127 ms |
  | permit `assertCurrent` | 8,023 ms | 125 ms |
  | `execute` | 32,598 ms | 3,057 ms |
  | head transition | 14,973 ms | 1,669 ms |
  | evidence age at permit | 17,576 ms | 1,548 ms |

## 10. Regressions and gates

- Typecheck: PASS. Build: PASS. Only `dist/scripts/edit-editorial-local.js` and `dist/packages/edit-editorial/state.js` changed.
  `revision.js`, `graph.js`, `plan.js` and `request.js` are byte-identical to the baseline (14).
- Legacy 3C and 3D (pure): **62/62 PASS** (17). Files: `edit-editorial`, `-contracts`, `-head`, `-hostile`, `edit-real-footage`,
  `-harness`, `-lifecycle`, `-r02`.
- Legacy 2A/2B, graph, repair and review (pure): **435/435 PASS** (18). Files: `edit-render`, `edit-runtime`, `edit-execution`,
  `edit-render-audit`, `edit-graph`, `edit-repair`, `edit-review`, including every accepted hash pin and package-count test.
- Legacy 3C media (F1, render/QC/CAS failures): **4/4 PASS** (23), covering `3C-M01` and `3C-M02-render`/`-qc`/`-cas`.
- Legacy 2B media (trusted execution): **34/34 PASS** (24), the accepted `edit-render-media.integration` suite, including the M23
  freshness and trust-handle attacks.
- Workspace audit: PASS. 128 application files and 17 adapters, the same counts as the 3D closure (19).
- `git diff --check`: PASS.
- The full safe suite and `npm run verify` were **not run** in this session: the owner's order asked for focused gates.

## 11. What did not change

`20-protected-bytes-vs-HEAD.log` (`git diff --quiet HEAD`): **UNCHANGED** for the following.

- The packages `edit-render` (including `records.ts`, `authorize.ts`, `probe.ts` and `owner-media.ts`), `edit-runtime`,
  `edit-execution`, `edit-graph` (including `revision.ts` and `graph.ts`), `edit-repair`, `edit-review`, `contracts`,
  `footage-analyzer` and `reference-analyzer`.
- The `edit-editorial` modules other than `state.ts`.
- `schemas/`.
- The local adapters `edit-render-local`, `edit-media-qc-local`, `edit-observation-local`, `edit-runtime-local`, both lifecycle
  authorities, and `audit-workspace.mjs`.
- `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.npmrc`, `AGENTS.md`, and all previous docs.

Consequences:

- The 60 s ceiling (`Age = z.number().int().min(1).max(60_000)`) is unchanged.
- Evidence timestamps are unchanged; evidence is minted only by the unchanged probes.
- Permit order is unchanged: `execute` still runs `assertCurrent`, then the permit's own `assertCurrent`, then the evidence evaluation.
- Capability, media-grant, claim, current-head and CAS checks are unchanged, as are render-before-permit, exact time, renderer
  admission, owner-media authority, MediaTruth and the FFmpeg/ffprobe adapters.

## 12. Known limitations after 3E-A

- The real-store latency after the repair is **not measured** here. The prompt limits performance evidence to synthetic stores, and
  real-owner-media F2 is deferred to 3E-C.
- **Remaining cold cost: one Gate-5 replay per unique graph.**
  - About 0.33 s per synthetic graph. The earlier audit's real per-construction cost suggests a few seconds for a real head at slot 4.
  - The A1 memo makes repeats free only within one `LocalEditingProject` instance. A newly opened instance pays one cold replay.
- **Authorize-time validation is unchanged.**
  - `authorize` → `validateRevisionLineage`, `validateEditorialRevisionPlan` and `validateEditorialImpact` (in `plan.ts`, unauthorized)
    still validate graph chains across separate top-level calls. `state.ts` calls inside them benefit, but the calls do not share a
    scope.
  - This happens before any evidence exists, so it never ages evidence.
- `initialize` still validates its root graph three times. That is constant and root-only.
- **Exotic objects are out of the trust model.** The pure validators assume plain-data inputs (proxies and accessors), as the accepted
  validators already did. The current-head boundary passes only freshly read and parsed data.
- The new media file is part of `npm run test:media` and `npm run verify`. It adds a few minutes, including F3's real 61 s wait.
- Open from earlier batches: distinct physical multi-source execution, broad ingest, SAR/non-square pixels, professional editing quality
  and the autonomous Director are **NOT VERIFIED**. VFR normalization is **NOT IMPLEMENTED**.
- Multi-revision *real-footage* execution freshness remains **NOT VERIFIED**, pending 3E-C. The synthetic structural repair is
  verified here.

## 13. Status

3E-A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW** (commit `fix(gate7): harden multi-revision freshness` on
`phase/5-gate7-3e-production-hardening`; `main` not modified).

Gate 7 overall: **NOT YET COMPLETE**

Phase 6: **NOT STARTED**

## 14. Owner acceptance (2026-10-04)

The owner independently reviewed Batch 3E-A and ruled: **Gate 7 Batch 3E-A: OWNER-ACCEPTED**. Accepted SHA:
`820e218e8213c20f7bd48b338c9d4e1c8b1396b2`.

- The accepted properties are the ones recorded above:
  - the exact-byte successful-validation memo (A1, §4);
  - one graph replay per immutable graph per top-level cold validation (A2, §5);
  - A01-A15 PASS and refusal parity PASS (§7);
  - F1-F6 PASS on synthetic media with the real clock (§8);
  - the 60 s policy, evidence timestamp semantics, permit order, current-head semantics and CAS semantics unchanged (§11).
- This acceptance is recorded by a documentation-only commit. No code, test, schema, dependency, lockfile, evidence or media byte
  changed, and no gate was rerun for it.
- The §12 limitations are unchanged:
  - real-owner-footage revision 1 → 2 freshness is **NOT VERIFIED** and awaits 3E-C;
  - broad media ingest is **NOT IMPLEMENTED**;
  - distinct physical multi-source execution is **NOT VERIFIED**;
  - SAR normalization and VFR normalization are **NOT IMPLEMENTED**.

**Superseded statements** (kept above as written): the top-of-record status and §13 "3E-A: **IMPLEMENTED — PUSHED FOR OWNER
REVIEW**".

3E-A owner acceptance: **OWNER-ACCEPTED** (2026-10-04)

3E-B and 3E-C implementation: **NOT STARTED**

Gate 7 overall: **NOT YET COMPLETE**

Phase 6: **NOT STARTED**
