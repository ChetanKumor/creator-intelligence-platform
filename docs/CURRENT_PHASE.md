# Current Phase - Phase 5 Gate 7 Batch 2B First Truthful Actual Media Execution (synthetic media)

Last updated: 2026-09-27

## Current ruling

- Phase 2: CLOSED (historical real-model and real-footage closure, 2026-09-15).
- Phase 2.6A Session 1 architecture: COMPLETE; frozen revision `editorial-architecture-0.1.0`.
- Phase 2.6A guarded TransNetV2 integration: COMPLETE.
- Phase 2.6A acceptance: PASS.
- Phase 2.6A overall: COMPLETE for the owner-authorized architecture-freeze and guarded detector-integration acceptance scope.
- Frozen editorial runtime subset: implemented under owner-authorized Phase 4 Gate 0. The broader historical Session 2 benchmark/metric/experiment backlog remains outside this gate.
- Phase 2.6B: COMPLETE. TransNetV2 verified on real authorized footage through the current application path.
- Phase 3 Audio Analyzer V0: COMPLETE within the implemented/verified V0 scope at `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, per explicit owner closure authorization. This supersedes the earlier component-only status below.
- Phase 4 Matcher V0: COMPLETE within its implemented and verified V0 scope. Gates 0–4 are accepted. Gate 4 adds the internal explicit-policy Matcher V0 dispatcher over the accepted technical baseline and evaluation-authorized reference-semantic ranking paths without score fusion, fallback, automatic mode selection, audio consumption or plan-bound `DecisionEvent` output.
- Phase 5 Edit Planner V0: Gates 0–4 are owner-accepted within their recorded bounded scopes. Gate 3 Budgeted Perception / Model Routing is accepted at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`. Gate 4 Canon v0 / Director Boundary is **OWNER-ACCEPTED** at `e99e98748ddc84d5932adb1c5ee1b22729d35a2f` after test-first implementation, adversarial self-review, independent owner review, two reproduced authority defects, bounded repairs, and final post-repair source inspection. No Director model execution or editing-quality verification has occurred. Gate 5 is **OWNER-ACCEPTED** at `d2ffc51` after implementation verification, independent source review, test-first owner repairs, final source-authority review, 97/97 focused Gate-5 tests, 377/377 compatibility tests, 546/546 full safe tests, workspace audit PASS, and 24/24 protected paths unchanged. Verification remains synthetic/offline and establishes no professional-editing-quality, real-footage-generalization, rendering, capability-execution, EditGraph, UEP, or public DecisionEvent claim. Gate 6 is not authorized or started at this closure checkpoint.
- Phase 5 Gate 6 EditGraph / capability / compatibility projection: owner-authorized from HEAD `49f93e28831965a010459df05f5abf4f393f68e6`. Gate 6 implementation verification: **PASS**. The independent owner review found three defects: capability availability was not semantically attested, execution readiness ignored budget feasibility, and UEP reference joins were overstated. They were repaired test-first. Post-owner-review verification: **PASS**. Gate 6 is **OWNER-ACCEPTED** at `0cb99b6` after final independent source review. Gate 7: **NOT AUTHORIZED at this closure checkpoint**.
- Phase 5 Gate 7 execution runtime: owner-authorized from HEAD `5ff5750af00e91bd6a226daf5841ec4dc3873819`. Batch 1 implementation verification, independent owner-review repair, and final hardening verification are **PASS**. Gate 7 Batch 1 is **OWNER-ACCEPTED** at `d55f0e1` after final independent source review. Gate 7 overall remains **NOT YET COMPLETE**. Batch 2 actual media rendering is **NOT AUTHORIZED at this closure checkpoint**. All Batch-1 evidence is synthetic/offline; no actual media rendering, FFmpeg execution, media QC, critic or repair execution has occurred.
- Phase 5 Gate 7 Batch 2A (runtime-safety foundation only): owner-authorized from HEAD `ae432248cd30e8465cd652f49b1e35f441af2e58`. Batch 2A implementation verification: **PASS**. Owner-review repair verification: **PASS**. Batch 2A owner acceptance: **OWNER-ACCEPTED** at `291a04e`. Actual FFmpeg execution: **NOT AUTHORIZED**. Gate 7 overall: **NOT YET COMPLETE**. Batch 2B is not authorized or started. All Batch-2A evidence is synthetic providers over opaque test bytes; no media, FFmpeg, Python, model or real-footage operation ran. One pre-work `git fetch` contacted the Git remote solely to verify the frozen baseline; Batch-2A runtime code and tests performed no network I/O and ran under `scripts/no-network.mjs`.
- Phase 5 Gate 7 Batch 2B (first truthful actual media execution through the EditGraph execution architecture; synthetic media only): owner-authorized from HEAD `d3c8302b40a5064ae0eb4408195dc35346ecc648`. Batch 2B implementation verification: **PASS** after the owner's accounting ruling (historically **FAIL**, deliberately fail-closed on one unmet frozen closure contract, Batch-2B requirement 10, measured runtime resource, cost and time accounting, while accounting was **PARTIAL**). Actual pinned-FFmpeg synthetic media execution: **PASS**. Independent technical media QC: **PASS**. Reservation-consumption accounting: **PASS** under the owner's local-execution ruling, scoped to the one pinned local executor: FFmpeg-reported CPU time and peak commit are accepted as attributed evidence, and total monetary cost is not applicable to local non-metered execution, which is not a zero cost (historically **PARTIAL**). Production user-media lifecycle authority: **NOT VERIFIED**. Real user footage: **NOT RUN**. Semantic editing quality: **NOT VERIFIED**. OWNER ACCEPTANCE: **OWNER-ACCEPTED**. Gate 7 overall: **NOT YET COMPLETE**. Batch 2B closure is committed at `74bbe1e7c05a59ac24c4d9113287ce3a32b61a6c`. Independent owner-review repair (three findings, test-first): trust-handle repair **PASS**, QC-liveness repair **PASS**, terminal-evidence repair **PASS**; implementation verification then remained **FAIL** while accounting was **PARTIAL**. Owner-review repair #2 (three further findings, test-first): policy-snapshot repair **PASS**, probe-completion repair **PASS**, exact-artifact-QC repair **PASS**; implementation verification then remained **FAIL** while accounting was **PARTIAL**. Owner-review repair #3 (three code findings, test-first, and one documentation finding): private-runtime-context repair **PASS**, QC-clock-binding repair **PASS**, process-termination-truth repair **PASS**, final-evidence-doc repair **PASS**; implementation verification then remained **FAIL** while accounting was **PARTIAL**. Owner accounting closure (2026-09-27, test-first, under the owner's ruling): accounting **PASS**, implementation verification **PASS**.

## Phase 5 Gate 7 Batch 2B - First truthful actual media execution (synthetic media only)

Authority: [Gate-7 Batch-2B implementation and verification record](phases/phase-5-gate-7-batch-2b-render-execution.md). It is governed by the accepted Batch-1 and Batch-2A records, which are frozen and unchanged, and by the owner's explicit Batch-2B-only authorization.

Current status (2026-09-27): reservation-consumption accounting is **PASS**, Batch 2B implementation verification is **PASS**, and after final independent owner source review Gate 7 Batch 2B is **OWNER-ACCEPTED**. Gate 7 overall remains **NOT YET COMPLETE**. The paragraphs and status lines below record the original closure and the three owner-review repairs in order. Their **FAIL** and **PARTIAL** were true when recorded, and the accounting-closure block at the end of this section supersedes them.

The batch adds a new pure package, `packages/edit-render/`, and three audited adapters:

- `scripts/edit-render-local.ts`, the trusted real-execution boundary. It probes the exact pinned FFmpeg 9.0.1 build and its capabilities after the claim, checks staged-input conformance over verified handles, issues the ephemeral, non-serializable `ExecutablePermit`, executes and publishes immutable content-addressed output.
- `scripts/edit-media-qc-local.ts`, the structurally separate technical QC.
- `scripts/edit-render-fixture-authority-local.ts`, the synthetic-fixture lifecycle authority.

Execution runs typed DAG → RenderProgram → allowlisted argv → `spawn(pinnedBinary, argv, { shell: false })` over inherited, verified staged handles and `fd`-only protocols. It produces success or failure receipts and independent technical-QC receipts. The workspace audit now enforces per-file subprocess capabilities. Nothing is written into the EditGraph, and no Batch-2A semantics changed: a synthetic DispatchPreparation still never authorizes FFmpeg.

The first red, the implementation reds and six hostile self-review defects are preserved under `.local-runs/phase5-gate7/` (`batch2b-*`). Each defect has red, repair and green receipts:

- the lifecycle authority was not re-queried at execution;
- a swapped pending output could be linked under its content hash;
- a declared aspect could stretch the picture;
- segment identities did not bind the executor;
- a staged object reachable through a junction was accepted;
- accounting bases did not name FFmpeg's Windows quantities.

Verification at the original closure (historical; the final verification follows owner-review repair #3 below):

- typecheck and build PASS;
- 40/40 pure Batch-2B, 10/10 audit-policy, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 883/883 full safe tests PASS;
- 22/22 actual-media integration tests PASS on the pinned FFmpeg and ffprobe;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed.

The canonical run renders two synthetic sources with a non-zero trim, a hard cut, a clip-scoped warm look and linked audio to a 180 × 320, 30 fps H.264/AAC MP4 (`e38b21c6…`, 147,717 bytes). QC passes all 14 checks: 120 frames on the exact grid and 192,000 samples. Every frame and every 10 ms audio window is verified against the exact source selection.

Accounting is PARTIAL:

- wall time and output bytes are measured;
- render work is derived;
- GPU, VRAM, API spend and model calls are not applicable;
- CPU time and peak memory are only FFmpeg-reported (win32 process times and PeakPagefileUsage);
- total cost is unavailable because no owner cost model exists.

Frozen Batch-2B requirement 10 requires measured resource, cost and time accounting, so implementation verification is deliberately **FAIL**. The smallest next owner decision is to rule on FFmpeg-reported CPU and peak-commit evidence, or authorize a trusted OS-level per-process measurement. It must also define a local compute cost model, or rule that total cost is not applicable to local execution.

No network access, dependency change, real footage or model operation occurred. Work remains uncommitted.

Gate 7 Batch 2B implementation verification: **FAIL**

Actual pinned-FFmpeg synthetic media execution: **PASS**

Independent technical media QC: **PASS**

Reservation-consumption accounting: **PARTIAL**

Production user-media lifecycle authority: **NOT VERIFIED**

Real user footage: **NOT RUN**

Semantic editing quality: **NOT VERIFIED**

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Independent owner-review repair (2026-09-26), recorded as an addendum to the Batch-2B report. The owner's source review found three defects in the final Batch-2B bytes. Each was reproduced test-first against the unrepaired bytes, with red receipts under `.local-runs/phase5-gate7/`, and repaired only in uncommitted Batch-2B files:

- **Trust handles (critical).** The trusted handles exposed their evidence records as mutable references. Through genuine handles, a caller turned genuinely nonconforming bytes into a permit and a successful real render, and bypassed freshness for runtime, capability, lifecycle and conformance evidence. Each handle now keeps a private snapshot and exposes only copies.
- **QC liveness (high).** QC could wait forever after its timeout, and read tool versions from runs that had not completed. It now settles after a bounded grace, reports unconfirmed termination, and uses only completed runs as evidence.
- **Terminal evidence (high).** An error after the durable execution start could escape as a raw exception, including after this execution had already published its output. A failure could also deny an output this execution had linked. Post-start errors now end in failure records at the stage they interrupted, and a failure after this execution's own link names that output (`linked_by_this_execution_unverified` / `published_by_this_execution_uncertified`). Where truthful process timing is impossible (the runtime clock running backwards during the process), the adapter raises the owned `execution_evidence_unrecordable` refusal before publication.

Verification after that repair (historical):

- typecheck and build PASS;
- 42/42 pure Batch-2B, 10/10 audit-policy, 28/28 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 885/885 full safe tests PASS;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed.

Accounting was not changed and remains PARTIAL. No network access, dependency change, commit or stage occurred.

Owner-review trust-handle repair: **PASS**

Owner-review QC-liveness repair: **PASS**

Owner-review terminal-evidence repair: **PASS**

Gate 7 Batch 2B implementation verification: **FAIL** (unchanged; accounting **PARTIAL**)

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Owner-review repair #2 (2026-09-26), recorded as a second addendum to the Batch-2B report. The owner's post-repair source review accepted the three repairs above and found three further defects. Each was reproduced test-first against the unrepaired bytes and repaired only in `scripts/edit-render-local.ts`, `scripts/edit-media-qc-local.ts` and the media tests:

- **Policy snapshot (critical).** A permit kept the caller's policy object. Widening its timeout or output bound after issuance let the render succeed under bounds the binding never authorized. The permit now keeps one private policy snapshot whose `policyId` the binding names, and execution checks that match.
- **Probe completion (high).** Timed-out, unconfirmed or signaled runs reporting exit 0 were accepted as trusted probe evidence. One strict completion rule now governs every runtime query, listing, version query and conformance probe.
- **Exact-artifact QC (high).** QC hashed one handle and reopened the pathname for its probes and decode. It now holds four handles proven to be one file object, inspects only through them, and re-hashes after inspection.

The report's "terminates" wording for timed-out children is corrected: the adapter requests termination and reports `process_termination_unconfirmed` when close is not observed, without OS-level proof of death.

Verification after repair #2 (historical):

- typecheck and build PASS;
- 42/42 pure Batch-2B, 10/10 audit-policy, 31/31 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 885/885 full safe tests PASS;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed; manifests and lockfile unchanged.

Accounting remains PARTIAL. No network access, dependency change, commit or stage occurred.

Owner-review policy-snapshot repair: **PASS**

Owner-review probe-completion repair: **PASS**

Owner-review exact-artifact-QC repair: **PASS**

Gate 7 Batch 2B implementation verification: **FAIL** (unchanged; accounting **PARTIAL**)

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Owner-review repair #3 (2026-09-26), recorded as a third addendum to the Batch-2B report. The owner's second post-repair source review accepted the six repairs above and found three further code defects and one documentation defect. Each code defect was reproduced test-first against the unrepaired bytes and repaired only in `scripts/edit-render-local.ts`, `scripts/edit-media-qc-local.ts` and the media tests:

- **Private runtime context (critical).** The permit kept the caller's `RuntimeCall` container. Putting another runtime into it after issuance let an expired permit execute (a runtime over the same root whose clock read inside the window), and a runtime over a copied root let a second permit execute an already-executed claim again. The permit now holds a private, frozen context read once at issuance (the exact DAG handle, runtime and claim ownership, and a private artifact copy); the caller's container is never retained.
- **QC clock binding (high).** QC receipts were timed by a caller-supplied clock, including one dated a year before the render it inspected. `clock` is removed from the QC input; QC time comes only from the inspected runtime's clock.
- **Process termination truth (high).** An error after a child had started was recorded as a spawn failure with termination confirmed. Both supervisors now track the spawn; after it, an error requests termination once and only an observed close confirms it. An unconfirmed render is `process_termination_unconfirmed` and publishes nothing, and QC marks the run incomplete.
- **Final evidence documentation.** The report's §3 counts and final source hash table now describe the final bytes, and earlier "final" tables and headings are labelled historical.

Final verification on the final bytes (after owner-review repair #3):

- typecheck and build PASS;
- 42/42 pure Batch-2B, 10/10 audit-policy, 34/34 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 885/885 full safe tests PASS;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed; manifests and lockfile unchanged;
- the canonical render is still byte-identical (`e38b21c6…`, 147,717 bytes), QC passes and accounting is PARTIAL.

Accounting remains PARTIAL. No network access, dependency change, commit or stage occurred.

Owner-review private-runtime-context repair: **PASS**

Owner-review QC-clock-binding repair: **PASS**

Owner-review process-termination-truth repair: **PASS**

Owner-review final-evidence-doc repair: **PASS**

Gate 7 Batch 2B implementation verification: **FAIL** (unchanged; accounting **PARTIAL**)

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Owner accounting closure (2026-09-27), recorded as a fourth addendum to the Batch-2B report. The owner ruled on the two decisions the original closure named, for Gate 7 Batch 2B local-development execution only. The accounting was changed test-first in `packages/edit-render/receipts.ts` only; renderer semantics, FFmpeg execution, QC, trust handles and process supervision are unchanged.

- **Attributed evidence, not relabelled.** FFmpeg's own win32 reports of CPU time (process user + kernel time) and peak memory (PeakPagefileUsage, peak private commit, not resident-set RAM) are accepted for exactly `cpuMilliseconds` and `peakRamBytes`. They stay labelled `ffmpeg_reported` with their exact bases, and are never labelled measured.
- **No invented cost.** Total monetary cost is `not_applicable` to this local, non-metered execution: no billable provider runs and no owner-authorized local cost model exists. The row carries no value; it is not a measured or estimated zero and does not mean local compute is free. GPU, VRAM, API spend and model calls stay `not_applicable`, proven by this executor's semantics (software codecs and filters only, fd-only protocols, no provider, no model).
- **Scoped to one executor.** The ruling names, by literal identity, the one pinned V0 executor build, the `local_win32_x64` environment and the pinned runtime. Any other executor, environment or runtime inherits none of it (those dimensions are unavailable, so it is at best PARTIAL). A metered cloud or production executor needs its own owner-approved cost model.
- **FAIL path unchanged.** A reservation exceeded by FFmpeg-reported CPU work still fails the accounting stage before publication.

Final verification on the final bytes (after the owner accounting closure):

- typecheck and build PASS;
- 43/43 pure Batch-2B, 10/10 audit-policy, 34/34 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 886/886 full safe tests PASS;
- the canonical actual-media execution, run one final time, reconciles to accounting PASS: the render is byte-identical (`e38b21c6…`, 147,717 bytes), QC passes 14/14 checks, and every dimension is within its reservation;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed; manifests and lockfile unchanged.

No network access, dependency change, real footage, commit or stage occurred.

Reservation-consumption accounting: **PASS**

Gate 7 Batch 2B implementation verification: **PASS**

Actual pinned-FFmpeg synthetic media execution: **PASS**

Independent technical media QC: **PASS**

Production user-media lifecycle authority: **NOT VERIFIED**

Real user footage: **NOT RUN**

Semantic editing quality: **NOT VERIFIED**

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

## Phase 5 Gate 7 Batch 2A - Durable runtime authority / atomic claim / verified source staging / dispatch recheck foundation

Authority: [Gate-7 Batch-2A implementation and verification record](phases/phase-5-gate-7-batch-2-render-runtime.md). It is governed by the accepted [Batch-1 record](phases/phase-5-gate-7-execution-runtime.md), which is frozen and unchanged, and by the owner's explicit Batch-2A-only authorization. Batch 2A is the mandatory runtime-safety checkpoint before any media process may start, and it starts none.

The workspace audit keeps `packages/` free of filesystem and clock access. The runtime therefore splits into a pure core, `packages/edit-runtime/` (records, rules and algorithms over narrow ports), and the local adapter `scripts/edit-runtime-local.ts` (system UTC clock, entropy, ledger, staging store and source locator). The adapter imports no `child_process` and launches nothing. The batch adds:

- a durable logical-attempt registry. An attempt slot is unique by project, creator, operation and attempt; purpose, budget, allocation, history and storage labels never mint another. Forked, individually replay-valid reservation histories cannot win a second slot, and an occupied slot that is corrupt stays consumed;
- an atomic execution claim on the unchanged Batch-1 `claimTargetId`. It is acquired by a synced record published through a no-overwrite hard link. Exactly one caller acquires and receives in-memory ownership; there is no release, timeout or steal;
- verified content-addressed staging. Bytes are copied and hashed from one opened source handle, published without overwrite under a `stagedObjectId` of content identity only, and fully re-verified. The original source path never re-enters;
- claim-bound runtime-now rechecks of the ExecutionGrant and media grants, a post-stage `SourceLifecycleObservation`, and post-claim capability and runtime recheck seams that are synthetic and test-only, and say so;
- a short-lived `DispatchPreparation` (`preparedAt ≤ now < validUntil`, clamped to every authority window) with deterministic replay and `mediaExecution: not_started`.

The first red, the test-only corrections and one self-review red receipt (a namespace-foreign ID addressed runtime state; repaired test-first) are preserved under `.local-runs/phase5-gate7/`. Verification:

- typecheck and build PASS;
- 116/116 focused Batch-2A, 81/81 Gate-7 Batch-1, 79/79 Gate-6, 97/97 Gate-5 and 33/33 routing tests PASS;
- 377/377 compatibility, 39/39 legacy-seam and 822/822 full safe tests PASS;
- workspace audit PASS;
- all protected and owner files unchanged; `git diff --check` PASS.

All evidence is synthetic, over opaque test bytes. No FFmpeg, ffprobe, media, Python, model, real-footage or network operation ran, and no public contract, render result, QC result, decision event or confidence was emitted. Work remains uncommitted.

Gate 7 Batch 2A implementation verification: **PASS**

Gate 7 Batch 2A owner acceptance: **PENDING**

Actual FFmpeg execution: **NOT AUTHORIZED IN BATCH 2A**

Gate 7 overall: **NOT YET COMPLETE**

Independent owner-review repair (2026-09-25), recorded as an addendum to the Batch-2A report. The owner review, `gate7-batch2a-owner-review.txt`, is preserved unedited. Four code findings were reproduced test-first against the unrepaired bytes: 11 regressions, each with its sub-cases confirmed separately, and four red receipts under `.local-runs/phase5-gate7/`. Each was repaired:

- **Freshness (critical).** A preparation could outlive the rechecks it rested on. Freshness is now one exclusive window, `observedAt <= now < observedAt + maxAge`. `validUntil` is also bounded by every lifecycle, capability and runtime freshness expiry, and each binding records its `freshUntil`.
- **Causal time.** A claim now requires `claimedAt >= registeredAt`. Staging checks its start against the claim before any source work, and requires completion at or after its start (`stagingStartedAt` is recorded). A clock rewound during any provider call refuses.
- **Future real-probe contract.** Strict typed provenance can now represent a future real lifecycle observation and real local probes, with exact implementation identity, and a typed preparation grade consistent with every binding. Batch 2A still produces and accepts only synthetic provenance: real-looking provenance refuses as `evidence_provenance_unsupported`, and no executable permit exists.
- **Observation timing.** Each check records `checkStartedAt`, `observedAt`, `checkCompletedAt` and `observedAtBasis`.
- **Artifact bound.** `MAX_RUNTIME_ARTIFACTS = 512`, from measured universes of 82–104 artifacts and about 240 extrapolated for 16 sources, is enforced before any artifact map and at every claim-bound call.

Two documentation findings were corrected:

- **Authority domain.** Claim exclusivity holds only among workers sharing one authoritative runtime ledger root. Two roots are two authority domains, and a distributed deployment needs one strongly consistent shared ledger.
- **Network wording.** The sentence above, "No FFmpeg, ffprobe, media, Python, model, real-footage or network operation ran", is superseded. One pre-work `git fetch` contacted the Git remote solely to verify the frozen baseline. Batch-2A runtime code and tests performed no network I/O and ran under `scripts/no-network.mjs`, and no provider contacted an external service. No fetch ran during the repair.

The workspace audit still does not enumerate the new adapter; the owner must decide its registration before any `child_process`-capable renderer adapter is accepted in Batch 2B. Verification: typecheck and build PASS; 130/130 focused Batch-2A, 81/81 Gate-7 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 836/836 full safe tests PASS; workspace audit PASS; all protected and owner files unchanged; `git diff --check` PASS. Work remains uncommitted.

Gate 7 Batch 2A owner-review repair verification: **PASS**

Gate 7 Batch 2A owner acceptance: **PENDING**

Actual FFmpeg execution: **NOT AUTHORIZED**

Gate 7 overall: **NOT YET COMPLETE**

### Owner acceptance closure — 2026-09-25

Gate 7 Batch 2A is **OWNER-ACCEPTED** at `291a04e` after final independent post-repair source review.

The four owner-review production findings were reproduced test-first and repaired: evidence-freshness expiry, causal runtime chronology, future real-probe provenance/observation timing, and the runtime artifact-universe bound.

The final accepted verification is 130/130 focused Batch-2A, 81/81 Gate-7 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 836/836 full safe tests, with typecheck, build, workspace audit, protected-byte comparison and `git diff --check` passing.

One pre-work Git fetch contacted origin solely to verify the frozen baseline. Batch-2A runtime code and tests performed no network I/O.

Historical `PENDING` and `uncommitted` statements earlier in this section are retained as chronology and are superseded by this closure.

Actual FFmpeg execution: **NOT AUTHORIZED**.

Gate 7 overall: **NOT YET COMPLETE**.

Batch 2B: **NOT AUTHORIZED at this closure checkpoint**.

## Phase 5 Gate 7 Batch 1 - Execution authority / admission / DAG / render identity

Authority: [Gate-7 Batch-1 implementation and verification record](phases/phase-5-gate-7-execution-runtime.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–6. The new internal `packages/edit-execution/` module is a separate EditGraph execution path; the legacy `Renderer.render(UniversalEditPlan)`, `RenderResult`, `QCResult` and `JobState` seams are untouched and never used as authority. It adds:

- an owner `ExecutionPolicy` and render profiles;
- explicit `ExecutionMediaGrant`s (analysis or evaluation authorization never renders; preview-only never authorizes final);
- per-source `SourceAccessReceipt`s rechecked for exact full-byte hash and size, the current MediaAsset identity and lifecycle, freshness and chronology;
- a fresh single-executor capability recheck through the unmodified Gate-6 attestation machinery;
- a separate execution budget and a Gate-3 reservation replayed exactly, never the Gate-5 planning budget;
- exact derived render work plus an attributed estimate;
- exact frame-grid conformance for both intents;
- an explicit `ExecutionGrant` and a single fail-closed `ExecutionAdmission`;
- a provider-neutral `ExecutionDag` with Merkle computation identities and a render computation identity that never collides between preview and final.

No plan, DecisionEvent, confidence, RenderResult or QCResult is produced, and no media, renderer, provider, model, subprocess or network operation runs. The first red and one self-review red receipt are preserved under `.local-runs/phase5-gate7/`. The self-review defect was evidence that postdated the grant binding it, repaired test-first. Verification:

- typecheck and build PASS;
- 51/51 focused Gate-7, 79/79 Gate-6 regression and 97/97 Gate-5 regression tests PASS;
- 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 676/676 full safe tests PASS;
- workspace audit PASS.

All evidence is synthetic. Work remains uncommitted.

Gate 7 Batch 1 implementation verification: **PASS**

Gate 7 overall: **NOT YET COMPLETE**

Actual media rendering: **NOT AUTHORIZED IN BATCH 1**

Owner acceptance: **PENDING**

Independent owner-review repair (2026-09-24 to 2026-09-25), recorded as an addendum to the Gate-7 report:

- **Encoding attestation.** A strict, attributed `ExecutionRuntimeAttestation` now proves the exact executor build, environment, runtime build and requested encoding. It is bound by the grant, checked for freshness, and its runtime identity binds every computation identity.
- **Trim authority.** DAG source nodes carry the exact Gate-6 trim authority and a scope-free frame-time table identity, both bound into the source computation identity. Computation identities carry no project, creator or analysis identity and are never access authorization.
- **Dispatch boundary.** Admission and DAG are eligibility only: `dispatch` stays `not_claimed` / `atomic_runtime_claim_required`, and the DAG names the claim key. The report specifies the Batch-2 atomic-claim invariant and one safe dispatch sequence.
- **Operations.** Competing cuts on one join are refused (CONFIRMED). Every operation is represented exactly in the DAG, or compilation refuses.
- **Self-found defects.** Two further defects were repaired: runtime evidence older than the graph's capability observation, and version labels able to carry a path, command or URL.
- **Evidence.** Six red receipts are preserved under `.local-runs/phase5-gate7/`. A test-only two-source chain covers multi-asset admission and DAG identity locality.
- **Verification.** Typecheck/build PASS. 72/72 focused, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 697/697 full safe tests PASS. Workspace audit PASS. All protected and owner files are unchanged. All evidence is synthetic. Work remains uncommitted.

Gate 7 Batch 1 post-owner-review verification: **PASS**

Gate 7 Batch 1 owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Batch 2 actual media rendering: **NOT AUTHORIZED**

Final owner hardening (2026-09-25), recorded as a further addendum to the Gate-7 report:

- **Estimate.** The work estimate now binds the exact runtime identity and execution environment; a mismatch is `work_estimate_mismatch`.
- **Executor identity.** Gate-7 executor identities are execution-safe without modifying Gate 6. A selected executor whose Gate-6 version is a path, command or URL refuses with `executor_not_execution_safe`.
- **Claim target.** The atomic claim target is the reservation attempt only. `claimTargetId` derives from the reservation's Gate-3 content identity, the operation and the attempt, and excludes the render computation, which is a separate `renderBinding`.
- **Environment.** Node computation identities bind the execution environment.
- **Self-found defect.** The claim target first keyed a storage-named reservation reference; it was repaired test-first.
- **Batch-2 responsibilities.** Source TOCTOU (verified bytes must be the bytes consumed) and measured execution accounting are documented as Batch-2 responsibilities.
- **Evidence.** Five red receipts are preserved under `.local-runs/phase5-gate7/`.
- **Verification.** Typecheck/build PASS. 81/81 focused, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 706/706 full safe tests PASS. Workspace audit PASS. All protected and owner files are unchanged. All evidence is synthetic. Work remains uncommitted.

Gate 7 Batch 1 final hardening verification: **PASS**

Gate 7 Batch 1: **OWNER-ACCEPTED** at `d55f0e1`

Gate 7 overall: **NOT YET COMPLETE**

Batch 2 actual media rendering: **NOT AUTHORIZED at this closure checkpoint**

## Phase 5 Gate 6 - EditGraph / capability / compatibility projection

Authority: [Gate-6 implementation and verification record](phases/phase-5-gate-6-editgraph-capability-compatibility.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–5. The new internal `packages/edit-graph/` module builds an `EditGraph` V0 only from a replay-valid chosen Gate-5 decision (tie, abstention and infeasibility are refused), keeps exact Gate-5 source ranges on an exact integer output-tick clock, binds typed operations only from supplied attributed resolutions, retains every deferred obligation, assesses supplied capability evidence in five explicit states, and reports UEP 1.0.0 compatibility. No truthful UEP success path exists under the frozen telemetry requirements, so every report is an explicit refusal and no plan, DecisionEvent or confidence is produced. First red, self-review reds and a fixture-correction receipt are preserved under ignored `.local-runs/phase5-gate6/`. Typecheck/build PASS; 65/65 focused, 97/97 Gate-5 regression, 377/377 compatibility and 611/611 full safe tests PASS; workspace audit PASS. All evidence is synthetic; no model, media, renderer, provider or network operation ran. Work remains uncommitted.

Independent owner-review repair (2026-09-24), recorded as an addendum to the Gate-6 report:

- **Capability attestation.** AVAILABLE now rests only on a typed, attributed `CapabilityAttestation`. It is bound to the exact scope, environment, observation time, executor build and capability. Snapshot declarations only index these attestations.
- **Readiness.** Capability readiness is reported separately from overall execution readiness. Overall readiness is always `not_execution_ready` with `budget_feasibility_unverified`. The Gate-5 planning budget is disclosed, never repurposed.
- **UEP joins.** ReferenceFingerprint 1.0.0 joins are validated only from exact supplied evidence and are otherwise reported unavailable. Every frozen plan-input validator dependency is classified explicitly, and `planInputEligibility` is `not_eligible` for every V0 graph.
- **Evidence.** Six owner and self-review red receipts are preserved under `.local-runs/phase5-gate6/`.
- **Verification.** Typecheck/build PASS. 79/79 focused, 97/97 Gate-5 regression, 377/377 compatibility and 625/625 full safe tests PASS. Workspace audit PASS. All 46 protected files and all owner files are unchanged.

Gate 6 implementation verification: **PASS**

Gate 6 post-owner-review verification: **PASS**

Gate 6: **OWNER-ACCEPTED** at `0cb99b6`

Gate 7: **NOT AUTHORIZED at this closure checkpoint**

## Phase 5 Gate 5 - Retrieval / sequence / boundary planning

Authority: [Gate-5 implementation and verification record](phases/phase-5-gate-5-retrieval-sequence-boundary-planning.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–4. Starting branch/HEAD were `phase/5-edit-planner-v0` / `7b82de13cb49022d2f08cef577f4cb7056274fd9`, with no tracked modifications. The new internal `packages/planning/` module binds exact direction/world/candidate/token/policy/budget/history snapshots, deterministic retrieval, evidence-authorized source boundaries, finite sequence search, full considered/pruned lineage and replay-validated PlanningDecision/runtime receipts. Initial red and three self-review red receipts are preserved under `.local-runs/phase5-gate5/`. Typecheck/build PASS; 56/56 focused tests, 377/377 compatibility tests and 505/505 full safe tests PASS; workspace audit PASS. Protected accepted code remains unchanged. All new evidence is synthetic; no model/media execution, calibrated quality/confidence, public DecisionEvent, EditGraph or UEP generation is claimed. Status: **implementation verification PASS; awaiting independent owner acceptance**. Work remains uncommitted. Gate 6 is not authorized.

## Phase 5 Gate 4 - Canon v0 / Director boundary

Authority: [Gate-4 implementation and verification record](phases/phase-5-gate-4-canon-director-boundary.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–3. The internal `packages/director/` module binds a small first-party Canon, explicit intent and candidate summaries, exact world/budget/model-selection artifacts, provider-neutral creative direction, grounding, and strong result outcomes. Independent owner-review regressions repaired constraint-subject authority and bound sanitized failed-result claims to the exact runtime-owned producer receipt. Final post-repair review confirmed 48/48 focused tests, 254/254 compatibility tests, 449/449 full safe tests, workspace audit PASS, protected-path preservation, and clean diff checks. Gate 4 is **OWNER-ACCEPTED** at `e99e98748ddc84d5932adb1c5ee1b22729d35a2f`. It establishes no Director-model or editing-quality claim. Gate 5 was not authorized or started at that acceptance checkpoint; its current status is recorded above.

## Phase 5 Gate 3 - Budgeted perception / model routing

Authority: [Gate-3 implementation and verification record](phases/phase-5-gate-3-budgeted-perception-routing.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). The bounded internal `packages/routing/` module validates pinned provider-neutral profiles, separately authorized capability evidence, exact compute budgets, explicit child/parallel reservations, supplied guard evidence, deterministic model selection, Gate-1 receipt reuse, future-compute authorization and CostTrace links to the frozen public ledger. It performs no model/media/provider/network operation. First red, owner-review red and subsequent self-review regression receipts are preserved under ignored `.local-runs/phase5-gate3/`. Gate 3 is **OWNER-ACCEPTED** at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`. At that checkpoint Gate 4 had been authorized but not started.

Independent owner review found bounded Gate-3 correctness defects despite the earlier green suite. Test-first owner red and confirmed red receipts, followed by separate self-review regression receipts, are preserved under `.local-runs/phase5-gate3/`. The repair binds exact compute ceilings, cumulative reservation history, declared child allocations, chosen-profile resource needs, typed guard/availability and quality evidence, exact routing artifact refs, and truthful CostTrace telemetry joins. Final independent closure verification accepted Gate 3 at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`. Gate 4 had not started at the Gate-3 closure checkpoint.

## Phase 5 Gate 2 - ProjectWorldModel-lite

Authority: [Gate-2 implementation and verification record](phases/phase-5-gate-2-project-world-model-lite.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). The bounded internal `packages/world-model/` substrate links explicitly supplied source evidence, observed facts, derived interpretations, exact legacy token snapshots and authorized Gate-1 reuse receipts. It supports pure immutable child publication, dependency invalidation and scoped bounded views with explicit coverage. Current `MediaAsset` retention is checked separately from historical source authorization at a caller-declared access time. It neither enumerates Gate-1 evidence nor performs perception, model, provider, decoder, media or network work.

The test-first compiler failure and later self-review failure are preserved under ignored `.local-runs/phase5-gate2/`. Independent owner review defects were reproduced in the preserved `owner-review-red.md` receipt (31 focused tests, 19 pass, 12 fail before repair), then repaired with focused regressions. The earlier pre-owner-review PASS remains historical evidence in the Gate-2 report. Gate 2 is **OWNER-ACCEPTED** at `2c9b80b49549d5c56b7cdb48d39aeb4d58d1bae2`. No real-footage Gate-2, production persistence, full current authorization service, narrative intelligence, or professional editing quality is claimed. Gate 3 is owner-authorized for bounded implementation but has not started.

Final independent owner review confirmed the first repair but found candidate-bound existence leakage, unresolved present uncertainty evidence, direct non-initial snapshot construction, and a membership-capacity contradiction. New test-first red evidence is preserved in `final-owner-review-red.md`; a corrected fixture rerun is preserved in `final-owner-review-red-confirmed.md`. The bounded repairs pass the focused Gate-2 suite (36/36). Gate 2 is **OWNER-ACCEPTED** at `2c9b80b49549d5c56b7cdb48d39aeb4d58d1bae2`. Gate 3 is owner-authorized for bounded implementation but has not started.

## Phase 5 Gate 1 - Perception Evidence Store

Authority: [Gate-1 implementation and verification record](phases/phase-5-gate-1-perception-evidence-store.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). Starting state was branch `phase/5-edit-planner-v0`, HEAD `9e4aea433123eeae85aefc1318200220e1bf0789` (`docs: freeze creative intelligence architecture v1`), with a clean worktree.

Gate 1 adds only the internal `packages/perception/` substrate: strict deterministic computation identity, exact dependency manifests, immutable attempt lineage, explicit accepted-output selection, lifecycle and scope eligibility, exact-byte artifact integrity, pure lookup results and reuse receipts that create no `ModelRun`. A deterministic tool uses explicit model `not_applicable`; learned computation requires exact revision evidence. Request identity remains distinct from output identity. Conflicting deterministic successful outputs are hard integrity failures.

Lookup returns explicit hit, miss, incompatible, failed, stale/retired, unavailable or unsupported states. Exact and related evidence is discoverable only through an eligible binding for the exact requested project, creator and purpose. Foreign, revoked and expired evidence returns the same miss payload as absent evidence, cannot contribute incompatibility details, and is not artifact-validated. No unscoped snapshot/index enumeration remains. Lookup has no computation/provider/decoder/network/repair/fallback hook. Existing reference/footage cache formulas and legacy repair behavior remain unchanged; no compatibility adapter falsely relabels them as Gate-1 compliant.

Independent owner review before acceptance found a bounded non-discoverability defect: inaccessible exact and related entries could reveal cache existence, and an unscoped snapshot exposed the index. The repair was verified on 2026-09-23 without broadening the gate. `npm run typecheck` and build PASS; 29 focused Gate-1 tests PASS; 74 focused perception/editorial/reference/footage cache tests PASS; the full safe non-media TypeScript suite passed 332/332 under the no-network guard. Final workspace/preservation commands, original first-failure chronology and later owner-review red evidence are recorded in the Gate-1 report. Public contracts, provider seams, Phase 1-4 source, dependencies, schemas and fixtures remain protected. No dependency, model, media, Python or network operation was introduced. Gate 1 is owner-accepted and committed/pushed at `93d7ce9d27cd66be9c71389c9ad03ca134ce8fc5`. Gate 2 ProjectWorldModel-lite is owner-authorized for bounded implementation but is not started by this acceptance record.

## Phase 5 Gate 0 - documentation-only architecture freeze

Authority: [Creative Intelligence Architecture v1 Freeze](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). The owner authorized this gate on 2026-09-22. Base HEAD is `2c8cdd1771dfc538f2ce6813b61ce592e210a30f` (`docs: close Phase 4 Matcher V0`), branch `phase/5-edit-planner-v0`, initially clean. Local `origin/main` matches HEAD; live GitHub state is not queried under the no-network verification restriction.

Scope is normative representations, authority, exact artifact/cache identities, compute/cost/model selection, provider-neutral Director direction, internal planning/edit/critic boundaries and A-to-B-to-C migration. Phase 4 source, public contracts, dependencies, schemas, fixtures and historical evidence are preserved. No runtime, LLM/provider connection, model/media operation, Perception Evidence Store or ProjectWorldModel implementation is authorized. UEP remains 1.0.0 with its actual 15-30 second limit; longer target edits require a later explicit compatibility gate.

Gate 0 documentation verification PASS on 2026-09-22: all 31 required sections and acceptance boundaries reviewed; `git diff --check` PASS; all 210 protected tracked files match the pre-edit SHA-256 baseline; all 28 frozen-manifest entries match; manifests/locks, source and generated artifacts unchanged. The inspected static workspace audit passed for 56 application TypeScript files and nine runtime adapters without executing those adapters. Document links, code fences and whitespace checks passed. The protected inventory digest and selected exact hashes are recorded in the Gate 0 specification. No application tests, media/model execution or network verification ran; historical regression results were not relabeled as fresh. The freeze was subsequently owner-reviewed and committed at `9e4aea433123eeae85aefc1318200220e1bf0789`; Gate 1 was separately authorized afterward.

## Phase 4 Gate 0 - runtime substrate

Execution base: `phase/4-matcher-v0`, HEAD `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, parent `1c336ca306b5585612095f6bf6274043a111c64b`; initially clean. No commit, push, merge or PR is part of this gate.

The internal `packages/editorial/` implements the frozen 0.1.0 common references/missingness, fixed taxonomy, tokens, pure supplied-artifact resolver, candidate/context/decision records, and timeline linkage validation. Public contracts and the Matcher provider seam remain frozen. Ranking records allow ties, partial judgment and explicit unjudged candidates; no ranking algorithm or quality result exists. Tokens retain embedding references, never vectors. Source PTS membership remains half-open, including borrowed support at the excluded end with zero interval distance.

Focused evidence: `npm.cmd run typecheck`, `npm.cmd run build`, and `node --import ./scripts/no-network.mjs --test dist/tests/editorial-common.test.js dist/tests/editorial-token.test.js dist/tests/editorial-decisions.test.js`: **75 passed, zero failed/skipped**. `npm.cmd run audit:workspace`: **52 application files / nine existing runtime adapters PASS**. Focused fixtures are synthetic data only; no provider, media decoder, model or GPU operation was invoked. Full `npm run verify` is deliberately deferred to review/acceptance, not claimed by this gate.

Two new-implementation regressions were preserved and corrected: a reidentified token could contradict its referenced semantic support, and borrowed cheap evidence could claim measured in-window flow. The resolver now revalidates token projections at consumption boundaries and checks eligible temporal comparison pairs. Failure logs, successful reruns and frozen SHA-256 checks are retained in ignored `.local-runs/phase4-gate0/`. Historical evidence files were not changed.

## Phase 4 Gate 1 - deterministic technical baseline

Accepted implementation commit: `607420b40efe93d100ad0a45cf438d6f6549922a`.

Gate 1 adds the internal `EditorialRankingPrediction` 0.1.0 artifact and a pure deterministic rule baseline over the exact validated `EditorialCandidateSet`. It uses only `sharpnessIndicator` and `unclippedPixelFraction`, with score `0.5 * sharpnessIndicator + 0.5 * unclippedPixelFraction`. Missing required features remain explicitly unavailable and never become zero. Equal scores remain explicit tie groups; lexical candidate ordering inside a tie is canonical serialization only, not editorial preference.

The prediction artifact remains separate from `EditorialDecision` / `TaskJudgment`, public `DecisionEvent`, plans and slots. It contains no invented winner, confidence, human judgment or editor explanation. No provider, LLM, model, embedding-vector comparison, media decode or runtime adapter executes in this gate. Semantic/reference/audio features are intentionally deferred.

Independent source review PASS. Canonical `npm run verify` PASS with **243 TypeScript tests, six media integration tests, 15 Python tests, 33 schema/synthetic fixture artifacts, workspace audit PASS, exit 0**. The canonical verification preserved exactly the intended three-file Gate 1 worktree before commit. No dependency or public Matcher seam change occurred.

Gate 1 establishes only a deterministic technical baseline suitable for later comparison. It does not establish semantic matching, narrative intelligence, reference-style matching, audio matching, learned ranking, professional shot selection or professional editing quality.

## Phase 4 Gate 2 - owned semantic comparison primitive

Accepted implementation commit: `ab3493a152d5eb82000b88130f8bb934eb39b538`.

Gate 2 adds the strict internal `EditorialSemanticComparison` value and `compareEditorialSemantics()` primitive. Two explicitly supplied `EmbeddingReference` values must share the same immutable embedding space, version, dimensions and distance function; Gate 2 additionally requires the existing owned `cosine` / `normalized-mean-v1` semantic space.

Vector access remains explicit through the injected `EditorialVectorResolver`. Resolved vectors are never persisted in the comparison value. Present vectors must match the declared dimensions, contain only finite values, have unit Euclidean norm within `1e-6`, and reproduce the released embedding identity formula from `objectId` plus the vector digest. Missing resolver evidence remains explicitly unavailable and is never converted to a zero vector. Incompatible spaces or malformed vectors fail closed.

The primitive computes deterministic cosine similarity in `[-1, 1]`, where larger values mean closer vectors in the shared semantic space. It does not remap similarity to `[0, 1]`, choose a candidate, choose a reference shot, combine semantic and technical scores, activate `reference_style_compatibility`, alter the public Matcher seam, or execute a provider/model/media path.

Independent source review PASS. Canonical `npm run verify` PASS with **266 TypeScript tests, six media integration tests, 15 Python tests, workspace audit over 54 application TypeScript files plus nine explicit runtime adapters, 33 schema/synthetic fixture artifacts, and exit 0**. Canonical receipt SHA-256: `c945e908837d34126603d2bb18956f610923b87cddda3f76943244d30f3a8bf3`. Verification preserved exactly the intended three-file Gate 2 worktree before commit.

Gate 2 establishes only that compatible owned embedding references can be explicitly resolved, integrity-checked and compared with deterministic cosine similarity. It does not establish semantic Matcher quality, reference matching quality, style compatibility, professional candidate ranking, narrative intelligence or professional editing quality.

## Phase 4 Gate 3 - evaluation-authorized reference semantic ranking

Accepted implementation commit: `8c3d22f96ab515d07c8d9ac0b81b849eb0e1b9ff`.

Gate 3 adds the internal `EditorialReferenceSemanticRankingPrediction` 0.1.0 artifact. It takes an exact validated `EditorialCandidateSet`, an explicitly supplied `ReferenceFingerprint` 1.1.0, an explicitly selected reference shot, the matching supplied `ReferenceAnalysis`, and an injected `EditorialVectorResolver`. The task remains `candidate_ranking`; `reference_style_compatibility` remains reserved and unused.

Gate 3 is evaluation-authorized only. The reference authorization and every candidate FootageAnalysis authorization must contain `local_evaluation`. Reference and candidate evidence must share project scope and creator scope. The reference fingerprint is bound to the supplied authorized content and analysis identity; the selected fingerprint embedding must agree with the same-shot ReferenceAnalysis embedding-batch reference when present. The embedding-batch identity is recomputed and checked. A selected reference shot with null semantic embedding remains explicitly unavailable, is never backfilled from ReferenceAnalysis, causes all candidates to remain unscored, and invokes no vector resolution.

Each candidate remains exactly once in the supplied universe. Candidate semantic evidence comes only from the validated EditorialToken semantic channel. Existing locality is preserved, including `within_segment` and `same_shot_context`; locality does not modify the score. Source semantic missingness remains explicit, while derived similarity becomes unavailable rather than zero. Present target/candidate embeddings are compared only through the accepted Gate 2 `compareEditorialSemantics()` primitive. Incompatible embedding spaces and malformed resolved vectors fail closed.

Ranking uses the raw Gate 2 cosine similarity in `[-1, 1]` only. Scores are not remapped, normalized, thresholded or combined with Gate 1 technical scores. Exact equal similarities remain explicit tie groups. Gate 3 performs no reference-shot auto-selection and records no winner, confidence, plan, slot, judgment, explanation or vectors.

Independent source review identified and corrected two bounded integrity issues before acceptance: ReferenceAnalysis embedding-batch identity is now checked against its exact ordered shot references, and candidate source semantic missingness is preserved separately from derived similarity missingness.

Canonical `npm run verify` PASS with **291 TypeScript tests, six media integration tests, 15 Python tests, workspace audit over 55 application TypeScript files plus nine explicit runtime adapters, 33 schema/synthetic fixture artifacts, and exit 0**. Canonical receipt SHA-256: `7cca9ff4b1ce9740df5490d2ed5a2eec4411b78fe12cc68d7bf90fa74e0ffc8b`. Verification preserved exactly the intended three-file Gate 3 implementation worktree before commit.

Gate 3 establishes only that an explicitly selected, locally evaluation-authorized reference shot can condition an exact candidate universe and produce deterministic raw-cosine semantic ranking evidence with explicit locality and missingness. It does not establish reference-style understanding, technical+semantic Matcher quality, audio matching, professional shot ranking, learned ranking, narrative intelligence or professional editing quality.

## Phase 4 Gate 4 - explicit-policy Matcher V0 and Phase 4 closure

Accepted implementation commit: `2e63f3ee0d373bf0a64d41319f570de4568d45d6`.

Gate 4 adds the internal `EditorialMatcherV0Prediction` 0.1.0 artifact and one explicit caller-selected Matcher V0 entry point. Its dispatch policy is `rule / explicit_matcher_mode / 0.1.0`. Exactly two modes are accepted: `technical_baseline` and `reference_semantic`.

`technical_baseline` delegates unchanged to the accepted Gate 1 `createEditorialRankingPrediction()` path. `reference_semantic` delegates unchanged to the accepted Gate 3 `createEditorialReferenceSemanticRankingPrediction()` path and therefore retains Gate 3 authorization, provenance, locality, missingness and embedding-compatibility requirements. Gate 4 does not reimplement either ranking algorithm.

There is no automatic mode selection and no fallback between modes. A missing or unavailable reference-semantic result remains unavailable rather than being rescued by the technical baseline. Gate 4 does not combine technical and semantic scores, normalize or remap them, introduce cross-mode tie-breaking, consume AudioFingerprint evidence, activate `reference_style_compatibility`, choose a reference shot, emit embedding vectors, or introduce a learned ranker.

The public `packages/providers/index.ts` Matcher seam remains unchanged. Gate 4 deliberately does not emit public `DecisionEvent` records because that contract requires real plan-bound `planId`, `slotId`, winner and confidence state that does not exist until planning. No fake plan, slot, winner, confidence, judgment or editor explanation is created.

Independent source review PASS. Source-review receipt SHA-256: `829dc11ff20ff88962962de29529d72fa47c4fb37a9dfacc9aab4a518d4c2a3a`. The preserved first-red receipt SHA-256 is `2c3828d5997a3130cbdb76256aa45c3af3d381ed345629c6973bee634c46e45c`.

Canonical `npm run verify` PASS with **303 TypeScript tests, six media integration tests, 15 Python tests, workspace audit over 56 application TypeScript files plus nine explicit runtime adapters, 33 schema/synthetic fixture artifacts, and exit 0**. Canonical receipt SHA-256: `6eff6a43201763ed28fb9016358f1736040e9149a996328ff3b95c4fe2609e19`. Verification preserved exactly the intended three-file Gate 4 implementation worktree before commit.

A separate real-evidence preflight found **three technical-smoke-eligible footage runs but zero authorized real reference runs and zero exact compatible reference-semantic pairs**. It also found zero previously persisted real EditorialToken or EditorialCandidateSet files, so the closure smoke did not falsely claim that those internal artifacts already existed. Preflight receipt SHA-256: `a8b8a16843307ef88cf71a4b96136016d9c02199a8385ef5fcacf385d4a8479a`.

The final real-evidence Gate 4 smoke used the strongest eligible persisted real footage run, `.local-runs/footage_36099c27-da31-40da-a3ec-0f5fe666f3da`, whose `run.json` SHA-256 is `2fabb8ecd170c8ba5d4688bdb624cf5b4265162fbf3dc81f57c5dbc642694e58`. The run is succeeded and contains 108 model-run provenance records, nine owner-supplied real FootageAnalysis snapshots, and exactly **872 retained candidates**.

The smoke deterministically hydrated **872 EditorialToken artifacts** and one exact `retained` EditorialCandidateSet in memory from that persisted real evidence, then executed Gate 4 in `technical_baseline` mode. Gate 4 returned **872 candidate results, 872 scored candidates, zero unscored candidates and 872 score groups**. Its nested ranking was exactly equal to direct Gate 1 execution, repeated Gate 4 execution reproduced the same prediction identity, and Gate 4 validator recomputation reproduced the same full prediction. The injected semantic vector resolver was called **zero times**.

The real-evidence smoke performed no fresh model inference, embedding-vector resolution, media decoding or audio consumption and ran under the repository no-network guard. Smoke harness SHA-256: `a423eee1ea3502b6c7ec6ac66ae93221f941c0b1c0bc07fa3c117459bb280a02`. Smoke receipt SHA-256: `98530a8a4ff49b0b0a77595013a900ce081c4862f1bcc0692caf38779695bca4`.

A real `reference_semantic` Gate 4 smoke was deliberately **not executed** because the preflight found no authorized compatible real reference pair. No authorization, creator/project scope, reference evidence or vectors were fabricated to manufacture a passing result. The reference-semantic dispatch path remains covered by the canonical deterministic Gate 4 tests and the accepted Gate 3 evaluation-authorized implementation, but this Phase 4 closure does not claim real-reference execution or reference-matching quality.

Phase 4 therefore closes only the Matcher V0 engineering scope established by these gates: a validated internal candidate substrate, a deterministic technical baseline, an owned semantic-comparison primitive, evaluation-authorized explicit-reference semantic ranking, and a single explicit-policy dispatcher that preserves those policies without inventing planning state. It does **not** establish professional shot-selection quality, technical+semantic fusion quality, audio-aware matching, reference-style understanding, broad-domain generalization, narrative intelligence, sequence planning, learned ranking or professional editing quality.

## Phase 3 closure reconciliation

The owner explicitly establishes the final Phase 3 commit above as locally committed, pushed, independently verified on GitHub, and fast-forwarded/verified on remote main. Those publication facts are owner-supplied authority; this Gate 0 session verifies the local base and does not repeat remote or model execution.

Verified V0 scope includes local SpeechProvider with pinned faster-whisper CUDA, Beat This CUDA, RMS energy, All-In-One Harmonix CUDA structure, AudioFingerprint composition, public AudioAnalysisProvider execution, deterministic provenance, authorized real-footage execution, empty-beat semantics, and canonical regressions. Current source includes the composer and public provider path. The structure projection policy still leaves `mainDropSeconds` null and phrase boundaries empty; internal structure execution does not imply those public music semantics have been established.

This reconciliation makes no multilingual ASR, WER, diarization, word-alignment, professional music-understanding, professional edit-quality or generalization claim. The earlier Speech/ASR report below remains historical component evidence.

## Preserved Phase 3 Speech/ASR component evidence

Status: **COMPLETE at component scope**.

The owned speech path is now:

`SpeechProvider.transcribe(MediaAsset, AnalysisContext)`
→ execution-only media resolver
→ `LocalSpeechProvider`
→ persistent TypeScript worker
→ owned Python worker
→ pinned faster-whisper
→ CTranslate2 CUDA
→ validated `Transcript`
→ validated `ModelRun`.

Verified runtime:

- Model repository: `Systran/faster-whisper-small`.
- Revision: `536b0662742c02347bc0e980a01041f333bce120`.
- faster-whisper: `1.2.1`.
- CTranslate2: `4.8.2`.
- Device: NVIDIA GeForce RTX 4050 Laptop GPU.
- Compute type: `float16`.
- Model set SHA-256: `1327706b2cad006266912ab307bcf5903f768c066af00dbc7c7b434cb2664d3b`.
- Authorized real-footage proof: `ChrisRaw.mp4`, SHA-256 `5bd959cd99ab5b8c3bc7ceb19c70898a1eb4c852cd159fccd502b024177af3f0`, duration 13.523603 seconds.
- Real public-provider result: English detected; one validated region `[0.000, 1.640]`, text `Jason Pargin says,`.
- Persistent-worker repeat reused the already-loaded model (`modelLoadSeconds = 0`) and returned the same transcript.
- Media `objectId` remains identity only; filesystem resolution is explicitly injected at the execution boundary.
- Region confidence remains `null`; Whisper log-probability is not mislabeled as calibrated confidence.

Final component verification:

- frozen public `SpeechProvider` real CUDA smoke: PASS;
- 99 TypeScript tests: PASS;
- six media integration tests: PASS;
- 15 Python tests: PASS;
- workspace audit: 44 application TypeScript files and nine explicit local runtime adapters: PASS;
- 33 generated schema/synthetic fixture artifacts: PASS;
- synthetic demo: PASS;
- no network-dependent model loading in the owned runtime.

Limits:

- this proof does not establish multilingual accuracy, WER, diarization, word-level alignment, noisy-event robustness or professional transcription quality;
- Hindi/Telugu and other target languages remain unverified on real authorized footage;
- WhisperX alignment/diarization is not part of this component;
- `faster-whisper-small` is the verified current component model, not a claim that it is the final production-quality checkpoint;
- completion of this component does not by itself close all of Phase 3.

Authority: [Phase 3 Speech/ASR report](phases/phase-3-speech-asr.md).

Current detector default: **PySceneDetect** (content, threshold 27, minSceneFrames 2, adaptiveThreshold 3). TransNetV2 is integrated and explicitly selectable, not yet default. The ordinary CLI supplies no TransNetV2 launch configuration and still fails explicitly with TRANSNETV2_NOT_CONFIGURED if selected without that configuration. No silent fallback was added.

Phase 2.6B gate: **PASS**. Nine authorized, unchanged H.264 sources (302.338072 seconds / 11,888 frames, including two VFR assets) completed fresh CUDA TransNetV2 inference through LocalFootageServices, producing 36 complete MediaTruth timelines. All nine cached repeats match exactly. A real VFR asset additionally completed fresh `analyzeFootage` execution, yielding 65 validated ClipSegments, then an identical full analysis repeat with zero detector/semantic calls and zero decoding. The owner explicitly authorized the existing ignored nine-source corpus in place.

The pinned source/weights match, and actual worker responses plus NVIDIA compute-process observations identify TensorFlow 2.15.0 on the RTX 4050 Laptop GPU. No silent fallback or CPU fallback occurred. PySceneDetect remains default. Fresh PySceneDetect comparison yields 36 shots, with three one-frame boundary differences across two assets; detector superiority is unproven.

Fresh evidence exposed one bounded telemetry defect: the 139-character TransNet provenance string exceeded the frozen 80-character ModelRun version field. Successful TransNet telemetry now binds the complete string through a 75-character SHA-256 label; full provenance remains in timings/cache. The failing evidence and regression are preserved. No public contract, detector/cache identity, MediaTruth, reference analyzer, SigLIP or candidate behavior changed.

Post-inference `npm.cmd run verify` passed: 92 TypeScript / six media / eleven Python tests, workspace audit and 33 generated artifacts, plus synthetic demo; zero failures/skips. Full application runtime was 40.752 seconds; cached repeat 0.564 seconds. Four genuine SigLIP embeddings were reused; normal cheap-frame repair decoded 55 sampled PNG frames, with no raw RGB dumps. A verification-only zero-decoding assertion and a sandbox EPERM repeat failure remain preserved separately from the successful final repeat.

Authority: [Phase 2.6B real-footage report](phases/phase-2.6b-real-footage.md); ignored machine receipt `.local-runs/phase2_6b_20260920/final-receipt.json`. Initial baseline was `b9068bca8e432974c0c9491200556827b4e9443b` on `phase/2.6b-real-footage`.

Gate 0 acceptance is complete: independent source review PASS and canonical `npm run verify` PASS with 223 TypeScript tests, six media integration tests, 15 Python tests, 33 schema/synthetic fixture artifacts, and exit 0. The next implementation gate is Phase 4 Matcher V0 Gate 1: deterministic baseline ranking/scoring over owned features and synthetic hand-checkable evaluation. This session does not start Gate 1 or any later phase. Detector-default changes remain outside scope.

## Preserved Phase 2.6A acceptance context

Fresh acceptance: `npm.cmd run verify` exited 0 on 2026-09-20: typecheck/build, 89 TypeScript tests (86 existing plus three boundary regressions), six media regressions, eleven Python tests, workspace audit (42 application files / nine explicit adapters), 33 generated schema/fixture checks and synthetic demo PASS. No skipped tests. No pretrained model download or new pretrained inference. Media tests use synthetic footage/stub embeddings; Python tests include generated tiny parameters/mocks.

The previously failing package subprocess imports were moved to the existing scripts runtime boundary, including their local audio composition callers. Worker behavior, provider identity checks and audio sequencing are preserved. The package import policy was not relaxed; reverse imports from packages into scripts now fail explicitly. Generated FootageConfig and FootageAnalysis schemas were regenerated from their unchanged TypeScript contracts; only the detector union changed in the JSON outputs.

All six historical TransNetV2 source hashes matched the recovery baseline. Four still match exactly; the relocated wrapper and LocalFootageServices import differ only by verified import paths. All 66 indexed closure artifacts, 43 protected source/contract/dependency files, and all nine authorized media hashes/sizes match. MediaTruth frameTimes / timelineFromCuts remains canonical; TransNetV2 returns cut/frame indices and provenance, never canonical timestamps. Reference-analyzer and frozen SigLIP source remain unchanged.

Git was initialized with an intentional pre-repair recovery baseline, `07eaf2c35779edf5c7febd1151dbe163522038d6`. That commit preserves the two known failures and is not a green release. Repairs were made on `fix/phase-2.6a-acceptance`; publication is gated on the green repair commit and a final sanitized tracked/history audit. Private evidence remains local and excluded.

Historical failures remain in the [repository baseline audit](phases/phase-2.6a-repository-baseline-audit-20260920.md) and unchanged earlier architecture amendments. Their readiness/tooling findings describe those earlier sessions. The missing Session 1 verification.json remains missing; it was not reconstructed. See the [acceptance repair report](phases/phase-2.6a-acceptance-repair-20260920.md) for current gates, source relocation identities, limits and local evidence.

At Phase 2.6A closure, real-footage TransNetV2 service execution was unproven; Phase 2.6B now supplies separate fresh evidence above. Superiority over PySceneDetect, professional editing quality and broad-domain generalization remain unproven. The retained historical GPU smoke used a synthetic 90-frame fixture; its receipt does not bind the GPU log or Python-worker hash, and the claimed rollback guard remains independently unverified. Its historical evidence is not rewritten.

## Frozen model

- Model: `google/siglip2-so400m-patch16-naflex`
- Revision: `cc24074f717b612951c2dead130904ab9b65a81e`
- Device: CPU; CPU fallback false; max patches 256; preprocessing unchanged.
- Observed real dimension: 1152.
- Real embedding space: `space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687`.

## Final real-footage evidence

The exact fresh capacity preflight passed at 2026-09-15T11:05:20.533715+00:00: available commit 17,660,952,576 bytes against 11,743,924,224 required; physical memory 14,234,771,456 bytes against 3,221,225,472 required. Production inference completed under the unchanged runtime guard.

- Nine authorized H.264 MP4 sources; 302.338072 seconds; 36 detected shots; 1,227 cheap measurements.
- 99 semantic frames requested / 96 selected / 96 unique PNGs, unchanged from preparation.
- 0 pre-existing real frame-cache hits + 96 fresh real frame operations = all 96 required embeddings. All are valid 1152-d vectors in the frozen real space.
- First real run 172.876 seconds; immediate repeat 5.285 seconds; stable repeat after regressions 5.155 seconds.
- Both repeats: 96 real frame-cache hits, zero new inference, zero frame misses, 872 aggregate hits, zero aggregate misses and zero decoding.
- 2,126 uncapped candidate demand / 872 bounded / 872 retained / 0 removed. No pairs satisfy all frozen geometric dedupe predicates; thresholds unchanged.
- After-pruning coverage 300.838071 / 302.338072 seconds = 99.503866%; maximum gap 0.266667 seconds; 36/36 shots represented. Before/after and per-scale coverage unchanged.
- All 872 aggregate representations mechanically checked without provider inference. Full persisted provenance PASS for 18 examples, two per asset.
- Review artifacts: nine source overviews, 12 semantic sheets, 45 retained examples and two dedupe examples. Codex mechanical visual review PASS across all nine assets; no external creative-quality score claimed.
- Full regressions PASS: 83 TypeScript / 6 media / 11 Python; 33 generated artifacts; source, frozen-contract and provider audits. Stable ID/configuration/set/coverage equality PASS.
- Source-media hashes and prepared PNG hashes unchanged. No implementation, model, dependency, threshold, frozen-contract or system setting change. No unresolved implementation defect.

The earlier successful guarded smoke used a synthetic fixture and remains separately preserved. This completed nine-source run supplies the previously missing real-footage evidence. Historical blocked receipts remain unchanged.

## Limits

This mostly podcast/interview/seated presentation set does not establish broad-domain generalization, professional editing/aesthetic quality, creator preferences, narrative/action/emotional intelligence, reference style or trends. Real shot-boundary ground truth remains unverified. Sparse same-shot semantic context is explicit: 529 candidates borrow context, with maximum distance 3.633333 seconds.

## Authoritative files and evidence

Current Session 1 architecture authority (internal/pre-stable, revision `editorial-architecture-0.1.0`):

- [Architecture decision and reuse audit](phases/phase-2.6a-session-1-architecture.md).
- [Editorial taxonomy and proposed token/decision/benchmark/metric/ablation interfaces](phases/phase-2.6a-editorial-contracts.md).
- [Exact Session 2 files, invariants, risks and testing gates](phases/phase-2.6a-session-2-handoff.md).
- Earlier Session 1 checks (before later workspace drift): read-only typecheck, workspace/provider audit and all 33 existing generated artifacts PASS; 66 indexed closure artifact hashes match; all 872 persisted locality joins match (343 inside / 529 borrowed, including two zero-distance end-boundary borrowed supports). No fresh inference or creative-quality evaluation.
- [Session 1 source snapshot](../.local-runs/phase2_6a_session1_20260915/baseline.json). The previously linked `verification.json` is missing from disk; earlier documentation claims about that receipt are not fresh verification.

Preserved Phase 2 closure authority and evidence:

- `AGENTS.md` (now present; replaces the earlier empty `AGENT.md`).
- `docs/footage-analyzer.md`
- `docs/footage-evaluation.md`
- `docs/footage-verification.md` - append-only historical results and final dated closure section.
- `docs/phases/phase-2.5-final-closure.md`
- [Final verification report](../.local-runs/phase2_5_resume_20260915/verification-report.md)
- [Real verification receipt](../.local-runs/phase2_5_resume_20260915/real-verification.json)
- [Final source audit](../.local-runs/phase2_5_resume_20260915/final-source-audit.json)
- [Retained review index](../.local-runs/phase2_5_resume_20260915/review/review-index.json)
- [Preserved guarded smoke](../.local-runs/phase2_5_resume_20260915/successful-smoke-receipt.json)

## Stop condition

Phase 2 remains CLOSED; Phase 2.6A and Phase 2.6B are COMPLETE. Phase 3 Audio Analyzer V0 and Phase 4 Matcher V0 are COMPLETE within their accepted scopes. Phase 5 Gates 0–6 are owner-accepted within their bounded scopes.

Gate 7 Batch 1 is OWNER-ACCEPTED. Gate 7 Batch 2A is OWNER-ACCEPTED.

Gate 7 Batch 2B has completed its implementation, three independent owner-review repair rounds and the final owner accounting closure. Final verification is PASS for the pinned-FFmpeg synthetic execution path, independent technical media QC and reservation-consumption accounting. After final independent source review, Gate 7 Batch 2B is **OWNER-ACCEPTED** as of 2026-09-27.

This Batch-2B closure does not claim production user-media lifecycle authority, real-user-footage execution quality or semantic/professional editing quality.

Gate 7 overall remains **NOT YET COMPLETE**.

The next authorized implementation work has not started. Gate 7 Batch 3A — editorial evidence surfaces and critic foundation, including the bounded adaptations researched from `browser-use/video-use` — must begin only after the Batch-2B closure commit.
