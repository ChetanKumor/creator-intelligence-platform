# Phase 5 Gate 7 — Execution runtime, Batch 1: execution authority, admission, DAG and render identity

Date: 2026-09-24

Gate 7 Batch 1 implementation verification: **PASS**

Gate 7 overall: **NOT YET COMPLETE**

Actual media rendering: **NOT YET AUTHORIZED IN BATCH 1**

Owner acceptance: **PENDING**

## Baseline and authority

- Branch `phase/5-edit-planner-v0`; required and observed HEAD `5ff5750af00e91bd6a226daf5841ec4dc3873819` (`docs: close edit graph capability gate`); accepted Gate-6 implementation `0cb99b6`.
- Tracked and staged state was clean. The eight untracked owner files (`CLAUDE.md`, `gate5-final-owner-diff.txt`, `gate5-owner-source-review.txt`, `gate5-postrepair-owner-review.txt`, `gate5-recon.txt`, `gate6-final-owner-review.txt`, `gate6-owner-source-review.txt`, `gate7-recon.txt`) are preserved without edits or staging.
- Before any edit, `.local-runs/phase5-gate7/baseline.json` (SHA-256 `0c7e4710d3abfd48fd30769c06559984af6824ae520d519fdd2c100e7c1ecc34`) recorded the SHA-256 of all 250 tracked files (manifest `c1e3e58fbefa461030c8e7dfefd448e36095383c09d81aeaff1e93338f5265a8`), 136 protected files, the eight owner files and 130 earlier Phase-5 receipts.
- The owner's Gate-7 reconnaissance capture stopped at its first full-file dump because a shell `printf` format was read as an option. That is not a repository defect; the capture was neither repaired nor rerun, and the repository source was read directly.
- Authority: the owner's explicit Gate-7 **Implementation Batch 1 only** authorization, the accepted [Creative Intelligence Architecture v1](phase-5-gate-0-creative-intelligence-architecture-v1.md) (sections 7, 9, 10, 15, 18 and 21–30) and the accepted [Gate-6 record](phase-5-gate-6-editgraph-capability-compatibility.md). Also read: `packages/edit-graph/`, `packages/planning/`, `packages/routing/index.ts`, `packages/world-model/index.ts`, the frozen contracts (`common`, `events`, `execution`, `job`, `edit-plan`), `packages/validation/{index,qc}.ts`, `packages/providers/{index,dry-run-renderer}.ts`, `packages/jobs/index.ts`, `packages/telemetry/index.ts`, the local footage and reference adapters, `tests/support/footage-media.ts` and the named Gate-3/5/6, integration, jobs and telemetry tests.

## Architectural ruling applied

Gate 7 does not force an EditGraph through UniversalEditPlan. The legacy seam `Renderer.render(UniversalEditPlan)`, `DryRunRenderer`, `RenderResult`, `QCResult` and `JobState` transitions stay untouched and are neither reused nor accepted as authority. Batch 1 adds a separate internal EditGraph execution path in the new module `packages/edit-execution/`. It fabricates no plan, plan ID, plan revision, DecisionEvent or confidence, and it weakens no validator.

Batch 1 answers one question: given one accepted EditGraph, what exact evidence must exist before a runtime may even attempt rendering, and what deterministic work graph would it execute? The flow is:

1. validated EditGraph;
2. fresh source authority;
3. explicit render authorization;
4. fresh executor capability recheck;
5. separate execution budget and immutable reservation;
6. deterministic workload proof;
7. execution admission;
8. provider-neutral execution DAG;
9. render computation identity.

Batch 1 stops before executing that DAG. No media process starts.

## Files owned by this batch

| File | Responsibility |
| --- | --- |
| `packages/edit-execution/common.ts` | Envelopes, 52 owned refusal codes, exact supplied-artifact reads, scoped supporting evidence, pure UTC epoch arithmetic |
| `packages/edit-execution/policy.ts` | Owner-authored `ExecutionPolicy` and `ExecutionRenderProfile` |
| `packages/edit-execution/source.ts` | `ExecutionMediaGrant` and `SourceAccessReceipt` |
| `packages/edit-execution/grant.ts` | Attributed `ExecutionWorkEstimate` and explicit `ExecutionGrant` |
| `packages/edit-execution/workload.ts` | Exact frame-grid conformance and derived render work |
| `packages/edit-execution/admission.ts` | `ExecutionAdmission`: the single fail-closed boundary, plus replay validation |
| `packages/edit-execution/dag.ts` | Provider-neutral `ExecutionDag`, node computation identity and the render computation identity |
| `packages/edit-execution/index.ts` | Internal entry points |
| `tests/support/edit-execution.ts` | Synthetic Gate-7 fixtures over the accepted Gate-4/5/6 chain |
| `tests/edit-execution.test.ts` | 51 focused tests: 43 required-area tests and 8 adversarial self-review tests |
| This report and `docs/CURRENT_PHASE.md` | Batch-1 record and a narrow status update |

No existing production file, test, fixture, public contract, provider seam, validator, job, telemetry, routing, planning, EditGraph, dependency or lockfile changed. Nothing was staged, committed, pushed, merged or submitted as a PR.

## Artifacts and semantics

Every Gate-7 artifact is internal (`0.1.0`, `internal_pre_stable`), strict (unknown fields fail), content-identified (its ID hashes every other field), finite, canonical where fields are declared sets, and immutable. Supplied artifacts must already be in canonical form. Every artifact must declare the graph's exact scope: project, creator and purpose.

### Execution policy and render profiles

`ExecutionPolicy` (owner-authored) fixes the V0 rules as literals: a single selected executor with fresh evidence, a per-source full-byte and lifecycle recheck, exact frame-grid conformance for **both** intents (no preview relaxation), derived work plus an attributed estimate, a separate execution budget with a replayed reservation, and typed DAG nodes. It also sets two owner freshness bounds: `maxSourceReceiptAgeMilliseconds` and `maxCapabilityEvidenceAgeMilliseconds` (1 ms to 7 days).

`ExecutionRenderProfile` (owner-authored) declares:

- the intent (`preview` or `final`), resolution and frame rate;
- video `h264` / `yuv420p` / `deterministic_constant_quality_v0`;
- audio `graph_linked_source_audio_v0` / `aac` / 44.1 or 48 kHz / mono or stereo.

Dimensions must be even, and the rate must be 1–240 fps. The encoding vocabulary is a registered enum of owned identifiers, so a command string, filter description, path or shell fragment cannot be expressed.

### Execution media grant

`ExecutionMediaGrant` is the only render permission for a source. It binds:

- the exact scope (project, creator and purpose);
- the literal `render_authorized_source_media_v0`;
- the exact `assetId` and expected source `contentHash`;
- an explicit, canonical set of render intents: `preview`, `final`, or both;
- the owner actor and scoped issuance evidence;
- `issuedAt` and an optional `expiresAt`.

Footage analysis authorization (`allowedPurposes` limited to `local_footage_analysis` and `local_evaluation`) is a different artifact type and never authorizes rendering. A preview-only grant never authorizes a final render. A grant for another asset, hash, project, creator or purpose fails. No Director text is read anywhere in Gate 7.

### Execution-time source recheck

For every unique source of the graph, keyed by asset, one `SourceAccessReceipt` is required. All clip uses of one asset must name the same exact source hash and FootageAnalysis. The receipt is supplied by a later runtime adapter; the core opens, reads and hashes nothing, and no path is domain authority. The receipt binds:

- the scope, the exact EditGraph and the render intent;
- the `assetId`, the exact current `MediaAsset` artifact and the exact `FootageAnalysis`;
- the media grant it checked;
- the expected hash and size (from the accepted analysis), and the observed full-byte hash and size (`hashScope: full_source_bytes`);
- `checkedAt`, the resolver build (`resolverId`, `version`, `implementationDigest`), an owner or operator attester, and scoped evidence.

Admission requires all of these:

- the receipt names the graph's exact analysis;
- the current MediaAsset is the same asset, in the exact project and creator (no identical-hash rescue across scopes), of kind `video`, and equal to the pinned Gate-5 MediaAsset in every field except `retention`;
- the expected hash and size equal the accepted analysis (`contentHash`, `authorization.sizeBytes`), and the observed values equal them;
- deletion is not requested, and the source is unexpired at both `checkedAt` and admission;
- `checkedAt` is no later than admission and no later than the execution grant's issuance;
- `checkedAt` is no earlier than the graph's pinned Gate-5 `accessAsOf` and within the policy freshness bound; the pinned access time alone never passes;
- the media grant is valid at admission, was issued no later than the check and no later than the execution grant, and covers the requested intent.

### Fresh capability recheck

The Gate-6 capability schemas and functions are reused unmodified: `CapabilitySnapshot`, `CapabilityAttestation`, `CapabilityRequirement`, `bindSnapshotAttestations` and `assessRequirement`. The grant names a new snapshot and exactly one executor build. Admission requires:

- the exact scope, and the environment named by the grant;
- a snapshot identity different from the graph's planning-time observation;
- `asOf` no earlier than the graph's capability observation, no later than admission or the grant's issuance, and within the policy bound;
- canonical attestations bound exactly by the accepted Gate-6 binding;
- the selected `executorId`, `version` and `implementationDigest` present in the snapshot;
- every graph requirement assessed AVAILABLE for that one executor, against attestations observed no earlier than the graph's observation and within the policy bound.

PARTIAL, UNAVAILABLE, UNSUPPORTED and FAILED each refuse with their own code. When every requirement is AVAILABLE somewhere but on no single executor, the refusal is `capability_split_across_executors`. The executor is chosen only by the explicit grant, never by prose or by Gate-6 eligibility.

### Separate execution budget and reservation

The grant binds an execution `ComputeBudget`, an allocation and a Gate-3 `Reservation`, with the literal meaning `gate7_execution_budget_not_planning_budget`. The Gate-5 planning budget named by the graph is disclosed in the admission and never used. Admission refuses with `planning_budget_reused` when any of these holds:

- the execution budget or allocation is the planning budget by object ID, bytes or budget identity;
- the execution budget or allocation rests on the planning budget's `ComputeAuthorization`;
- the execution budget's allocation tree contains the planning budget.

The budget and allocation are replayed through the accepted Gate-3 `budget()` and must be in scope. The reservation must hold exactly the granted budget and allocation, and the grant's `operationId` and `attempt`. It is then replayed through the accepted Gate-3 `reserve()` from its own budget, allocation and history refs, and must equal that replay exactly.

### Workload derivation and attributed estimate

Admission derives exact values from the graph and the render profile: output duration (ticks), output frames, resolution, pixel-frames, linked-source-audio ticks and milliseconds, unique source assets, video and audio clip uses, operation count and render intent. Linked-audio milliseconds are the exact duration rounded up for accounting only. Arithmetic uses arbitrary precision and refuses with `limit_exceeded` beyond the safe-integer range.

CPU and GPU milliseconds, peak RAM and VRAM, wall-clock time, API spend and total cost are never invented. They come only from an attributed `ExecutionWorkEstimate` (`attributed_estimate_not_measured`, owner or operator estimator, scoped evidence). The estimate binds the exact graph, executor build, render profile, intent, policy and source set. Derived frames, pixel-frames and audio milliseconds, and every estimated quantity, must fit the reservation; anything that exceeds it refuses admission, and nothing is lowered to fit.

### Frame and time conformance

The graph's `frameAlignment: not_asserted` is not changed. For the requested render profile, every declared output instant must lie on the frame grid: every clip start and end, every look extent and cut position, and the total duration. An instant `t` on a clock of `T` ticks per second is on a `n/d` fps grid exactly when `t·n` is divisible by `T·d`, in arbitrary-precision integer arithmetic. Otherwise the refusal is `output_frame_alignment_unproven`; no boundary is rounded. The render frame rate must equal the graph's exact declared rational. V0 applies the rule to both preview and final: the optional preview relaxation was not implemented, and refusing is the conservative choice.

### Execution grant

`ExecutionGrant` is the explicit execution permission, attributed to an owner or operator with a stated basis. It binds:

- the exact EditGraph ref, identity and revision;
- one executor build and its environment;
- the render intent, render profile and policy;
- the fresh capability snapshot;
- the execution budget, allocation and reservation;
- the media grants and source receipts;
- the work estimate;
- the `operationId` and `attempt`;
- `issuedAt` and an optional `expiresAt`.

Nothing infers permission from an EditGraph, `capability_ready`, prose, a legacy job state, a Gate-5 budget, a UEP or a dry-run receipt.

### Execution admission

`admitExecution({ executionGrant, admittedAt }, artifacts)` is the single fail-closed boundary. The admission time is supplied, never read from a clock. The first failing rule refuses with one owned code, and there is no partial or conditional result. In order, admission requires:

1. an exact, canonical execution grant, with admission inside its window;
2. the graph in the same scope, with the identity and revision the grant names, passing full Gate-6 semantic replay (`validateEditGraph`) with no unresolved obligation, deferred hard check or framing;
3. an in-scope policy and render profile whose intent matches the grant, compatible with the graph: the exact frame rate, the same aspect, and for final the exact resolution (a preview may only scale down);
4. exact frame-grid conformance and derived work;
5. media grants and source receipts as above;
6. the fresh capability recheck;
7. the separate execution budget and the replayed reservation;
8. the estimate binding and chronology;
9. derived and estimated work fitting the reservation.

The admitted record lists each source's grant, receipt, MediaAsset and analysis, each requirement's attestation and observation time, the budget refs with the disclosed planning budget, the derived workload with its estimate ref, and the frame conformance. It also carries the literals `publicContracts: none_emitted_no_plan_render_result_qc_result_decision_event_or_confidence` and `mediaExecution: not_started_in_batch1`. `validateExecutionAdmission` replays the whole admission from its own grant and time, so a rehashed or relabeled admission fails.

### Execution DAG

`buildExecutionDag({ admission }, artifacts)` first replays the admission, so only a replay-valid admission compiles. The DAG is provider-neutral: every node is a typed, bounded record, and no command, filter, script, path, URL or prose field exists. The node kinds are:

| Node | Inputs | Carries |
| --- | --- | --- |
| `source_video_clip` | none | clip-use occurrence, position, asset, source hash, analysis, receipt, exact source range and precision, output ticks and frames, exact identity mapping, framing |
| `linked_source_audio` | none | clip-use occurrence, linked video use, position, source, exact range, output ticks, mapping, unity gain |
| `color_look` | its clip (clip-scoped) or the sequence (whole-output) | operation ID, target, look and intensity, extent in ticks and frames |
| `cut_sequence` | each clip, or that clip's look, once and in order | clip-use order; each join's ticks, frame and `cut`, plus the explicit cut operation ID or `v0_contiguous_placement_cut` |
| `composition` | the video output, then each linked audio use | audio placement and output duration and frames |
| `final_encode` | the composition | encoding settings (or `no_audio_stream`) and output resolution, rate, frames and duration |

The DAG also records the admission, grant, graph, executor, intent, profile, policy and settings, and the literal `execution: not_started_no_media_process_in_batch1`. Structural parsing enforces typed topology: exact arity, input kinds, earlier-only inputs, a single final root and full reachability. Unknown node kinds and unregistered primitives refuse. `validateExecutionDag` recompiles from the DAG's own admission, so reordered, pruned, detached or relabeled nodes cannot survive even a coordinated rehash.

### Computation identity and render computation identity

Each node has two identities:

- `nodeId` is the occurrence identity: the node's full content, including lineage and input node IDs.
- `computationId` hashes exactly the semantic inputs that affect the node's bytes. It includes the input nodes' computation IDs, Merkle-style, and the DAG semantics version, render intent and executor build. Occurrence lineage (clip-use, operation and receipt IDs, and positions) is excluded.

What each node kind binds:

- **Source clip:** the source hash, exact range and precision, the exact mapping and clock, the frame count, the framing, and the resolution, frame rate and pixel format.
- **Linked audio:** the source, range, mapping, duration, gain, sample rate and channel layout.
- **Look:** its input, parameters, frame count, resolution and pixel format.
- **Sequence:** the ordered inputs and the join frames.
- **Composition:** its inputs and the absolute audio placement.
- **Encode:** its input, encoding and output.

A clip's rendered frames do not depend on where it sits in the output, so a clip's identity excludes its absolute position, and repeated uses of one candidate share a computation identity while keeping distinct node IDs. Operations are separate dependent nodes: a graded clip's identity is the look node's, which binds the clip's identity. The tests prove, with a white-box re-identification, that moving one clip's range changes only that clip, the sequence, the composition and the encode. A clip-scoped look depends only on its clip. A whole-output look consumes the sequence, so any clip change widens to it.

The render computation identity (`renderIdentity.renderComputationId`) binds:

- the exact EditGraph, admission and execution grant;
- the canonical source receipts;
- the executor build, render intent, render profile, policy and settings;
- the root, and every node's `nodeId` and `computationId`.

No cache or persistence service exists; only identity semantics.

### Preview and final separation

The intent is bound into every node's computation identity, the render profile, the admission and the render identity. A preview at the final resolution shares no node computation identity with the final render. The tests show that the admission, every node and the render identity differ.

### Refusal semantics

All 52 codes are owned; foreign failures map onto owned codes without hiding owned ones:

| Area | Codes |
| --- | --- |
| Input and time | `input_invalid`, `scope_mismatch`, `limit_exceeded`, `execution_grant_window_invalid`, `evidence_postdates_admission`, `evidence_postdates_execution_grant` |
| Graph | `graph_replay_failed`, `graph_binding_mismatch`, `graph_obligation_unresolved`, `graph_source_inconsistent` |
| Profile and frames | `render_profile_incompatible`, `render_intent_mismatch`, `output_frame_alignment_unproven` |
| Media grants | `media_grant_missing`, `media_grant_invalid`, `media_grant_window_invalid`, `render_intent_not_granted` |
| Source receipts and assets | `source_receipt_missing`, `source_receipt_invalid`, `source_receipt_stale`, `source_analysis_mismatch`, `source_hash_mismatch`, `source_size_mismatch`, `media_asset_mismatch`, `media_asset_foreign_scope`, `media_asset_not_video`, `source_deletion_requested`, `source_expired` |
| Capability | `capability_snapshot_invalid`, `capability_snapshot_stale`, `capability_environment_mismatch`, `executor_not_in_snapshot`, `executor_version_mismatch`, `executor_digest_mismatch`, `capability_partial`, `capability_unavailable`, `capability_unsupported`, `capability_failed`, `capability_split_across_executors` |
| Budget and work | `execution_budget_missing`, `execution_budget_invalid`, `planning_budget_reused`, `reservation_missing`, `reservation_invalid`, `reservation_attempt_mismatch`, `reservation_allocation_mismatch`, `work_estimate_missing`, `work_estimate_mismatch`, `workload_exceeds_reservation` |
| Replay and DAG | `admission_replay_mismatch`, `dag_replay_mismatch`, `operation_not_executable` |

## Test-first and self-review chronology

Receipts are under ignored `.local-runs/phase5-gate7/`; no receipt was overwritten.

| Step | Evidence | Result |
| --- | --- | --- |
| Baseline | `baseline.json` | 250 tracked, 136 protected, 8 owner files and 130 earlier receipts hashed; tracked and staged clean |
| First red | `batch1-first-failure.md`, log `first-red-typecheck.log` (SHA-256 `6f0555e6525fe01cef4ca68ab870cbc12878bcebd239e73618932fbb03c02a74`) | `npm.cmd run typecheck` exit 2; `TS2307` for the absent `packages/edit-execution/{index,dag}.js`; tests preceded production code. The log also showed one test-authoring defect unrelated to the missing module (`TS6133`, an unused import), removed as a test-only correction before production code was written |
| First execution | `initial-build.log`, `initial-focused-run.log` | Build PASS; 43/43 focused tests on the first run |
| Self-review red | `self-review-chronology-red.md`; `self-review-run.log` (SHA-256 `4881cdf17e2c2843fe43b51ed70c71b731060cecbc14156a74539fbc58a2b921`); `self-review-chronology-subcases.log` (SHA-256 `6bf1ac8e08beb9f7b524455efacde8fc25301cc4d06c15e2b408f7d1b98f9271`); pre-repair hashes in `self-review-prerepair-production-hashes.log` | 8 attacks, 7 already refused / 1 genuine defect. A source receipt, capability snapshot or work estimate claiming a time after the execution grant that binds it by content identity was admitted. Each sub-case was confirmed separately against the unrepaired build |
| Repair | `self-review-repair-build.log`, `self-review-repaired.log` | New code `evidence_postdates_execution_grant`: receipts, the snapshot, the estimate and (explicitly) media grants must not postdate the grant's issuance; the earlier admission-time checks still run first; 8/8 |
| Post-repair focused | `post-self-review-focused.log` | 51/51 |

The media-grant sub-case in that regression was added with the repair. Before the repair it was already refused, but only as `media_grant_window_invalid` through the receipt check; it now fails earlier with the specific code.

Attacks rejected without repair, each a regression test:

- grant substitution: a media grant swapped for another, two grants for one source, an admission rebound to another grant;
- identical hash in another project or creator;
- stale receipts, including one predating the pinned Gate-5 access time, and future-dated evidence;
- a MediaAsset swapped under the receipt's exact reference, and a current MediaAsset differing in duration, object, origin, asset or kind;
- capability evidence observed before the graph's observation, including inside a new snapshot;
- a declaration borrowed from another executor build;
- the same executor ID with another version or digest;
- video and color proven on different executors;
- the planning budget as the execution budget or allocation, renamed, wrapped as a child or as a sibling under its authorization;
- reservations for another attempt, operation, allocation or budget, or with inflated work;
- underestimated or relabeled admissions;
- overflowing, negative and fractional arithmetic;
- a boundary exactly half a frame off, and an NTSC grid;
- a preview profile, admission or DAG relabeled final;
- reordered, pruned and detached DAG nodes;
- command, path, URL and filter fields injected into raw schemas;
- Director prose naming `ffmpeg`, `-filter_complex`, `rm -rf`, `curl`, a URL, `shell`, an executor and `grant final`;
- UEP, RenderResult, DecisionEvent and JobState artifacts offered as authority.

A read-only walk of the compiled import graph (`runtime-import-closure.log`) confirms that the core reaches only `zod` and `node:crypto` externally, and no provider, job, telemetry, QC or adapter module. The static source closure (`transitive-import-closure.log`) also lists `packages/providers/index.ts`, reached only through an existing type-only import in `packages/reference-analyzer/embeddings.ts`; it is erased at compile time and is the same chain the accepted Gate-6 module has.

## Final verification

All test runs used `scripts/no-network.mjs`. Evidence is under `.local-runs/phase5-gate7/`.

| Command / check | Result | Local evidence |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `final-typecheck.log` |
| `npm.cmd run build` | PASS | `final-build.log` |
| Focused `dist/tests/edit-execution.test.js` | 51/51 PASS | `final-focused.log` |
| Gate-6 regression `dist/tests/edit-graph.test.js` | 79/79 PASS | `final-gate6-regression.log` |
| Gate-5 regression `dist/tests/planning.test.js` | 97/97 PASS | `final-gate5-regression.log` |
| Routing and budget `dist/tests/budgeted-perception-routing.test.js` | 33/33 PASS | `final-routing-regression.log` |
| Accepted 16-file compatibility set (as in Gates 5 and 6) | 377/377 PASS | `final-compatibility.log`, `final-compatibility-files.log` |
| Legacy seams: `contracts`, `integration`, `jobs`, `telemetry` | 39/39 PASS | `final-legacy-seams.log` |
| `npm.cmd test` (build plus every `dist/tests/*.test.js`) | 676/676 PASS (625 accepted plus 51 new) | `final-full-safe-suite.log` |
| `npm.cmd run audit:workspace` | PASS: 86 application TypeScript files (78 plus 8 new) and 9 runtime adapters | `final-workspace-audit.log` |

Every run had zero failed, skipped, cancelled or todo tests. No FFmpeg, ffprobe, media integration, Python, real-model, real-footage or network operation ran. All evidence is synthetic.

## Preservation and workspace checks

These ran after the documentation edits; the evidence is `final-protected-byte-comparison.json` and `final-workspace.log`.

| Check | Result |
| --- | --- |
| Branch / HEAD / staged | `phase/5-edit-planner-v0` / `5ff5750af00e91bd6a226daf5841ec4dc3873819` / nothing staged |
| Tracked SHA-256 against `baseline.json` | 250/250 accounted for; only the authorized `docs/CURRENT_PHASE.md` differs; none missing or added |
| Protected files | 136/136 byte-identical, covering `packages/{contracts,providers,validation,jobs,routing,edit-graph,planning,director,world-model,perception,telemetry,editorial,domain,footage-analyzer,reference-analyzer,audio-analyzer,evaluation}/`, `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `tests/fixtures/`, `samples/fixtures/`, `tests/support/`, the accepted Gate-6 and Gate-5 and routing tests, the Gate-0 and Gate-6 documents, `AGENTS.md` and `scripts/` |
| Owner files | All eight unchanged in size and SHA-256 |
| Earlier receipts | All 130 unchanged |
| `git diff --check` | PASS |
| New files | LF line endings, a final newline and no trailing whitespace |
| Relative links | All links in this report and `docs/CURRENT_PHASE.md` resolve |

Two focused tests also pin fifteen frozen legacy surfaces and eleven accepted Gate-3 and Gate-6 surfaces by SHA-256:

- the nine contract files, `packages/providers/{index,dry-run-renderer}.ts`, `packages/validation/{index,qc}.ts`, `packages/jobs/index.ts` and `packages/telemetry/index.ts`;
- `packages/routing/index.ts`, the seven `packages/edit-graph` files, `tests/edit-graph.test.ts`, `tests/support/edit-graph.ts` and the Gate-6 report.

## Remaining limitations

Batch 1 establishes only its bounded internal authority, admission, DAG and identity semantics over synthetic evidence. It does not establish rendering, executor conformance, pixel or audio correctness, media QC, critic quality, repair, production latency or cost, or any creative, story, emotion, continuity, professional or human-level quality.

- **Attributed evidence.** Receipts, attestations and estimates are attributed, not verified. The core cannot tell a truthful resolver from a lying one. A receipt proves source state only as of its `checkedAt`, within the policy freshness bound. A revocation, deletion request or byte change after that check is invisible until the Batch-2 runtime rechecks immediately before starting media work.
- **Supplied admission time.** The admission time is supplied, not read. Batch 2 must supply the actual time at the execution boundary.
- **No durable ledger.** One reservation authorizes one operation attempt, but Batch 1 is pure validation with no durable ledger. As in Gate 3, which claims no multi-worker lock, a runtime ledger is needed to stop two admissions from citing the same reservation.
- **Encoding support is not attested.** Render-profile encoding settings are bound into every identity, but the accepted Gate-6 capability vocabulary has no output-encoding predicate. Executor support for the encoding is therefore owner- or operator-asserted through the grant and estimate bindings, not attested. Extending the vocabulary would change frozen Gate-6 schemas.
- **Narrow V0 coverage.** One registered encoding vocabulary; the same frame rate for preview and final (a preview may only scale down); no preview relaxation of frame exactness; no stacked looks. Only the two Gate-6 primitives compile, and multi-asset graphs were not exercised by the single-asset synthetic chain.
- **Out of scope.** No FFmpeg or any other adapter, media QC, critic, repair, EditGraph revision, UEP projection, RenderResult, QCResult, JobState or DecisionEvent integration is implemented.

PHASE 5 GATE 7 BATCH 1 IMPLEMENTATION VERIFICATION: PASS

GATE 7 OVERALL: NOT YET COMPLETE

ACTUAL MEDIA RENDERING: NOT AUTHORIZED IN BATCH 1

OWNER ACCEPTANCE: PENDING

## Independent owner-review repair — 2026-09-24 to 2026-09-25

This section is appended. The Batch-1 sections above are historical and were not rewritten. Where this repair changes them, the "Superseded statements" list below names each one. The owner review, `gate7-batch1-owner-review.txt`, is preserved unedited and unstaged. The synthetic execution chronology in the tests stays on 2026-09-24; the repair work continued on the local date 2026-09-25.

Gate 7 Batch 1 post-owner-review verification: **PASS**

Gate 7 Batch 1 owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Batch 2 actual media rendering: **NOT AUTHORIZED**

### Baseline and constraints

- Branch `phase/5-edit-planner-v0` and HEAD `5ff5750af00e91bd6a226daf5841ec4dc3873819` were unchanged throughout; nothing is staged, committed or pushed.
- Before any repair edit, `.local-runs/phase5-gate7/owner-review-baseline.json` (SHA-256 `49f992b89900505eb12ede47ff7fc7110dc17ab291ea9008ef272adcc4a27a77`) recorded 250 tracked files, 136 protected files, nine owner files and 159 earlier receipts. The nine owner files are the eight listed above plus `gate7-batch1-owner-review.txt`. The baseline also recorded the untracked Batch-1 work files.
- The pre-repair production bytes equal the owner's capture: `owner-review-prerepair-production-hashes.log` (SHA-256 `68ad1e30e2328d4f1b6568f230602a1ed827ba681c0eb97c74117f548c967263`).
- No accepted Gate 1–6 byte, public contract, provider seam, validator, job, telemetry, dependency or lockfile changed, and no finding needed a Gate-6 change. No FFmpeg, ffprobe, media, Python, model, real-footage, network or subprocess operation ran. All evidence is synthetic.

### Findings and outcomes

| # | Finding | Source | Outcome | Red receipt (under `.local-runs/phase5-gate7/`) |
| --- | --- | --- | --- | --- |
| 1 | Output encoding was never attested | Owner blocker 1 | CONFIRMED; repaired | `owner-review-encoding-attestation-red.md` |
| 2 | The DAG dropped source trim and timebase authority | Owner blocker 2 | CONFIRMED; repaired | `owner-review-source-trim-authority-red.md` |
| 3 | Nothing marked admission as eligibility rather than an exclusive dispatch right | Owner blocker 3 | CONFIRMED; the boundary is now explicit. The claim itself belongs to Batch 2 | `owner-review-dispatch-boundary-red.md` |
| 4 | Of two accepted cut operations on one join, one silently disappeared | Owner blocker 4 | CONFIRMED: Gate 6 permits the state. Repaired | `owner-review-duplicate-cut-red.md` |
| 5 | Runtime evidence older than the graph's own capability observation was admitted | Self-found while writing the owner's runtime attacks | CONFIRMED; repaired | `owner-review-runtime-predates-graph-red.md` |
| 6 | Runtime and Batch-1 resolver version labels could carry a path, command or URL | Self-found in the adversarial pass | CONFIRMED; repaired | `owner-review-location-free-identity-red.md` |

The five owner-review regressions were written before any repair and run together against the exact unrepaired bytes: 0 pass, 5 fail (`owner-review-red-run.log`). After the blocker 1–4 repairs they passed 5/5 (`owner-review-repair-green-run.log`). Findings 5 and 6 each followed the same order: regression first, a red run against the then-current bytes, a separate receipt, then the smallest repair. Every sub-case of finding 6 was confirmed individually against the unrepaired build (`owner-review-location-free-identity-subcases.log`).

### Blocker 1 — a strict runtime encoding attestation

The new `packages/edit-execution/runtime.ts` defines `ExecutionRuntimeAttestation`, an internal `0.1.0` artifact that is strict and content-identified. It binds:

- the scope, the environment and `observedAt`;
- the exact executor build: `executorId`, `version` and `implementationDigest`;
- the encoding runtime identity (`runtimeId`, `version`, `implementationDigest`). This is an owned identifier and never a path, command or URL (finding 6);
- exactly the render profile's encoding: video `h264` / `yuv420p` / `deterministic_constant_quality_v0`, and audio `graph_linked_source_audio_v0` / `aac` / 44.1 or 48 kHz / mono or stereo;
- an owner or operator attester and the literal basis `attester_supplied_runtime_check_results_no_probe`;
- a typed outcome: `available` with licensing purposes, conformance evidence and configuration evidence; `unavailable` with a reason code, next check time and evidence; or `failed` with a failure code and an attempt no later than the observation.

`ExecutionGrant` binds exactly one attestation as `runtimeAttestation`. Admission checks it after the capability recheck and before the budget, in this order:

1. The exact attestation is supplied (`runtime_attestation_missing`, `runtime_attestation_invalid`) and is in the exact scope (`scope_mismatch`).
2. It names the grant's environment, the grant's executor build and exactly the profile's encoding (`runtime_attestation_mismatch`).
3. It was observed no later than admission (`evidence_postdates_admission`) and no later than the grant's issuance (`evidence_postdates_execution_grant`).
4. It was observed no earlier than the graph's capability observation and within the policy's capability-evidence age (`runtime_attestation_stale`).
5. Its outcome is not `failed` (`runtime_attestation_failed`), not `unavailable`, and licensed for the scope purpose (`runtime_attestation_unavailable`).
6. Its evidence is supplied, declares the exact scope and is not an authority artifact (`runtime_attestation_invalid`). None of it may be evidence of a non-available attestation in the snapshot (`runtime_attestation_invalid`).

This adds six owned codes, 58 in total. The admission records `runtime { attestation, identity, observedAt }`. The DAG settings carry the runtime identity, and every node's computation identity binds it, so another runtime build is other work.

The work estimate is never the attestation or its evidence. The Gate-6 capability schemas stay unmodified. The attestation is attributed, not probed: the core cannot tell a truthful attester from a lying one.

### Blocker 2 — exact source trim authority in the DAG

Every `source_video_clip` and `linked_source_audio` node now carries `trim`, copied field for field from the accepted Gate-6 `ClipUse.source`: `shotId`, `boundaryId`, `precision`, `startAuthority`, `endAuthority`, `timebase` and `support`. It is never rebuilt from seconds, and a `source_seconds` trim keeps its weaker authority explicitly. Structural parsing enforces the accepted Gate-5 construction:

- precision follows the two endpoint kinds;
- the timebase is the node's own analysis at `/metadata/frameTimes`;
- every endpoint's evidence is in the node's own analysis;
- a `frame_pts` endpoint points at its own `/metadata/frameTimes/<index>` and lies inside the table;
- a `candidate_endpoint` names the matching side: `startSeconds` for the start, `endSeconds` for the end.

Each source node also carries `frameTimes { count, tableId }`, a scope-free content identity of the exact frame-time table that the timebase resolves to. Compilation computes it from the admitted FootageAnalysis, and replay recomputes it.

The source computation identity binds:

- the content hash, the seconds range and the precision;
- each endpoint's kind and frame index;
- `frameTimes`.

It deliberately leaves the evidence references, the analysis reference, `shotId`, `boundaryId` and `support` in the occurrence identity only.

**This departs from the intended repair written in the red receipt**, which named the endpoint and timebase evidence. A FootageAnalysis carries its `authorization.projectId` and `creatorId`. Binding its reference would therefore put project and creator identity into computation identities, which the owner ruled out. Binding the frame-table content still separates every change of the decoded frames selected. The regression's two tables of 40 and 60 frames get different table identities and different end-frame indices (20 and 40), so the clip computations differ.

### Blocker 3 — eligibility is not exclusive dispatch

`ExecutionAdmission.dispatch` and `ExecutionDag.dispatch` are the strict literals `{ state: "not_claimed", requirement: "atomic_runtime_claim_required" }`; no other state is representable. The DAG adds the exact claim key `{ reservation, operationId, attempt, renderComputationId }`. No claimed, lease, lock, worker or started field exists. A legacy `JobState` or `RenderResult`, an extra request field or a Gate-3 reservation replay cannot supply a claim.

A Batch-1 admission is **eligibility**: one exact attempt may be dispatched if, and only if, a later runtime claims it. Admission is replayable and identical on every replay. A second grant over the same reservation attempt is also admitted, with a different render computation identity (tested). Exclusive dispatch is therefore a separate, later act.

**Batch-2 atomic-claim invariant** (specified here, not implemented in Batch 1):

- A claim is durable and exclusive per reservation attempt `(reservation, operationId, attempt)`.
- The first successful claim records the exact `renderComputationId` and DAG it will execute. Every later claim of the same attempt fails, whether it names the same render computation or another, and that worker must not dispatch.
- Only the claim holder starts a media process, and only for the claimed render computation.
- Source, capability and time are rechecked around the claim: at admission replay at the actual current time just before claiming, and again after winning the claim, before any media process starts.

**One exact safe Batch-2 sequence:**

1. Collect evidence: per-source media grants and fresh source receipts, a fresh capability snapshot, a fresh runtime attestation, an attributed work estimate, and a Gate-3 reservation for a new operation attempt.
2. Issue the content-addressed `ExecutionGrant` naming exactly those references; nothing it names may postdate its `issuedAt`.
3. Admit at the actual current time, then compile the DAG from the replay-valid admission.
4. Claim atomically and durably by `(reservation, operationId, attempt)`, recording the `renderComputationId`. If the attempt is already claimed, stop without dispatching.
5. After winning the claim and before any media process, recheck at the actual current time: replay admission (grant window and freshness); re-verify every source's full-byte hash and lifecycle; recheck capability and runtime availability. These dispatch-time records are separate and bound to the claim. They are never inserted into the grant: a content-addressed grant cannot gain a receipt created after it, and a rebuilt grant is a different grant needing its own admission, DAG and attempt.
6. If any recheck fails, do not dispatch; the claimed attempt ends without media work. A retry is a new attempt with its own reservation, grant, admission and claim.
7. Dispatch exactly the claimed render computation on the attested executor and runtime build.

### Blocker 4 — every operation represented exactly, or refused

Gate 6 accepts a graph with two resolved `cut_transition` operations on one adjacent join: finding 4 is CONFIRMED, and `validateEditGraph` returns the graph unchanged. V0 authorizes neither a choice between them nor a merge. Admission therefore refuses any join carrying more than one cut with `operation_not_executable`.

Compilation repeats that refusal and requires each cut to name one adjacent output join. Before identifying nodes, it also checks an exact-representation invariant: the multiset of operation targets in the DAG must equal the graph's, otherwise `operation_not_executable`. A target is each cut on its join, and each look on each clip it names or on the whole output. No operation can silently disappear.

### Mandatory coverage — two distinct sources

`tests/support/edit-execution-chains.ts` is test-only and built solely from accepted Gate 1–6 APIs. It produces a replay-valid graph over two sources, A (`asset_fff…`) then B (`asset_111…`), so the timeline order and the canonical asset order differ. The tests prove:

- distinct asset IDs and content hashes, and independent analyses that each name their own asset and hash;
- a separate media grant, MediaAsset and receipt for each source, each binding its own source;
- canonical source order B, A in the admission, the estimate, the grant's declared sets and the render identity, independent of timeline order;
- each DAG source node names its own asset's receipt, analysis, hash and timebase;
- cross-wiring refuses: a receipt naming the other source's grant, analysis, MediaAsset or hash, or relabeled to the other asset; a receipt or grant supplied for only one source; grants with swapped hashes; a mismatched estimate; and substituted analysis bytes;
- foreign-scope rescue refuses: a foreign-project receipt or grant, a foreign-project or foreign-creator MediaAsset, and another project's analysis of B's exact bytes;
- new bytes for A change A's computation, the sequence, the composition, the encode and the render identity. B's computation stays unchanged; its occurrence changes only through its new graph-bound receipt;
- a white-box move of A's trim changes exactly A and its dependents, while B keeps both identities.

These tests passed on their first execution against the repaired bytes, so no red was produced or fabricated. The accepted analysis contract derives the asset ID from the content hash. One asset ID with two hashes, or one hash under two asset IDs, therefore cannot form a chain at all: FootageAnalysis parsing refuses it, as tested.

### Additional hard attacks

Every attack below refuses or holds. Each is a regression test.

**Runtime attestation**

- Another executor ID, version or digest; another environment; another sample rate or channel layout.
- An unregistered codec, pixel format or encoding profile, refused both at creation and as supplied bytes.
- An `unavailable`, `failed` or unlicensed outcome.
- Evidence of an unavailable or failed capability check reused as proof.
- The work estimate, snapshot, a media grant or a receipt used as the attestation or as its evidence; foreign or unsupplied evidence.
- An observation postdating the grant or admission, or stale by policy age (exactly at the bound still admits).
- An observation older than the graph's capability observation (finding 5).
- A path, command or URL in the version (finding 6).
- Another runtime build changes every computation identity.

**Source authority**

- A changed start frame, end frame, or frame-table content or length changes the computation, and replay refuses.
- `frame_pts_exact` stripped alone refuses structurally; stripped coherently, replay refuses. A `source_seconds` trim cannot be upgraded.
- Another timebase pointer and a frame beyond the table refuse structurally.
- Another analysis alone refuses structurally. A coherent rebase to another analysis keeps the computation, changes the occurrence, and replay refuses.
- Another clip's boundary refuses.
- Removing the authority or the frame table, then rehashing everything, refuses.
- Gate-6 graph forgeries of the same kinds refuse as `graph_replay_failed`.
- Linked-audio trims are carried and bound exactly.
- A variable-frame-rate table is bound by its exact PTS content.

**Dispatch**

- An admission or DAG replayed twice stays `not_claimed`, and no field implies permission.
- Any other dispatch state, or an extra dispatch field, is unrepresentable even rehashed.
- A claim key naming another render computation refuses structurally; one naming another reservation or attempt fails replay.
- A legacy `JobState` or `RenderResult` changes nothing and cannot be passed as a claim.
- A reservation replay yields the same reservation.

**Operations**

- Duplicate cuts.
- A cut dropped from its join, or a join naming a foreign operation.
- An unknown operation beside valid ones, in the graph, in the DAG and as a node draft.
- Exact representation across five graphs, including a cut beside a clip look on two clips.

### Cache identity boundary

Computation identities bind no project, creator, purpose, scope, analysis or receipt identity:

- no DAG node or setting has a scope, project, creator or purpose field (tested);
- the analysis and receipt references stay in the occurrence identity only. The coherent rebase to another analysis keeps the computation identity (tested).

Identical work can therefore be recognized across projects. **A `computationId` is never access authorization.** Any future cache hit must separately prove current authorized scope and source access for the execution that requests it. No cache or persistence service exists.

### Preview and final

Unchanged. The intent binds every node computation identity, the admission and the render identity. The runtime attestation is intent-agnostic evidence about encoding semantics and creates no shared identity.

### Files changed by this repair

| File | Change |
| --- | --- |
| `packages/edit-execution/runtime.ts` | New: `ExecutionRuntimeAttestation` |
| `packages/edit-execution/common.ts` | Six runtime codes; the attestation is an authority type; `LocationFreeVersionSchema` |
| `packages/edit-execution/grant.ts` | `runtimeAttestation` |
| `packages/edit-execution/admission.ts` | Runtime admission, operation executability, `runtime` and `dispatch` records |
| `packages/edit-execution/dag.ts` | `trim`, `frameTimes`, runtime settings and identity, `dispatch` with claim key, duplicate-cut refusal, exact-representation invariant |
| `packages/edit-execution/source.ts` | The resolver version uses the location-free label |
| `packages/edit-execution/index.ts` | Runtime exports |
| `tests/edit-execution.test.ts` | 21 owner-review tests: 5 regressions, 4 coverage and 12 hard-attack tests; 72 in total |
| `tests/support/edit-execution.ts` | Synthetic runtime attestation fixture |
| `tests/support/edit-execution-chains.ts` | New, test-only chain builder: custom frame tables and several sources |

Existing Batch-1 tests changed only where the repaired shape requires it:

- the DAG preservation test compares `trim` instead of `precision`;
- `shiftClip` also moves the frame authority coherently, to frames 10 and 30;
- `resealDag` recomputes the claim key, and the preview-relabel forgery now uses it;
- the import allowlist adds `../planning/common.js`;
- the Director-prose test allows `/` only in strict JSON-pointer values under `pointer` keys, which are the Gate-5 evidence pointers of the trim authority, and still forbids it everywhere else.

### Chronology and receipts

No receipt was overwritten. All paths are under `.local-runs/phase5-gate7/`.

| Step | Evidence | Result |
| --- | --- | --- |
| Baseline | `owner-review-baseline.json`, `owner-review-prerepair-production-hashes.log` | As above |
| Owner reds | `owner-review-red-run.log` (SHA-256 `e8356ea518dd6c4b4a15612ef72a51acf794793949734db910cd8bc992e46840`); four red receipts and their diagnostic logs | 5 regressions, 0 pass |
| Blockers 1–4 repaired | `owner-review-repair-green-run.log` (SHA-256 `6a6c9393481d23c6442ed91da62c7c73a89fb3d9c6d806007b092633a6349246`) | 5/5. The whole focused file then ran 56/56; that run was shown on the console only, not logged |
| Coverage and attacks | `owner-review-coverage-first-run.log` (SHA-256 `d2c8ad9e059b78f0c1f7adf56e23ac8fa1dcc6c7dbc2df93f24bae2d03cb8c9f`), copied unchanged from the session scratch log of that run | 69/69 on first execution, with 4 coverage and 9 hard-attack tests |
| Finding 5 red | `owner-review-runtime-predates-graph-red.md` (SHA-256 `1c89487c18262aab105a350586a67d34c6c55b1cde9dc4d61f25a815e9855e41`); run log `5dd458e4b479b59b7170407b3e8154dfc32ff24bb2e3c94063dd0fc8ed36b57e` | Admitted before repair |
| Finding 5 repaired | `owner-review-runtime-predates-graph-repair-focused-run.log` | 70/70 |
| Finding 6 red | `owner-review-location-free-identity-red.md` (SHA-256 `3feb21837bbc177df9d30dfbb3f0aac3895b5329236518d147734d6d6ad37484`); run log `00d9df709bbbff1ee522650c4bc6ffcd7be1ccd75f158ccaa91ac9a13825442a`; sub-cases `c308519ff5439018340254a13c904a1cf29430eb0593bc06716777eb9589160a` | Every path, command and URL label accepted and admitted before repair |
| Finding 6 repaired | `owner-review-location-free-identity-repair-focused-run.log` | 72/72, with the linked-audio coverage test added before it |

A read-only walk of the compiled import graph (`owner-review-final-runtime-import-closure.log`, SHA-256 `6c550ae99e979dc2b4118dc2a4063c0bb3a1752211985609a7fbaaea12b0e359`) finds 50 runtime modules, only `zod` and `node:crypto` externally, and no provider, job, telemetry, QC or script module. Batch 1 had 49; the new module is `runtime.js`. The Batch-1 closure log is truncated after its first module lines: its count, externals and empty flag list are intact, but its full module list is not. It is left as it is. `packages/validation/index.js` is reached, as before, only through the accepted `footage-analyzer/protocol.js` import that Batch-1 `admission.ts` already had.

### Post-owner-review verification

All test runs used `scripts/no-network.mjs`.

| Command / check | Result | Local evidence (SHA-256) |
| --- | --- | --- |
| `npm run typecheck` | PASS | `owner-review-final-typecheck.log` |
| `npm run build` | PASS | `owner-review-final-build.log` |
| Focused `dist/tests/edit-execution.test.js` | 72/72 PASS | `owner-review-final-focused.log` (`e61ec22f73383af737f3380271696b920306261cff3da8d8c1e31ad037a72941`) |
| Gate-6 regression `dist/tests/edit-graph.test.js` | 79/79 PASS | `owner-review-final-gate6-regression.log` (`9883b7a49fddaae6fa9332d1216ddd8ecbdee6e2e90f1522d779d8869c35b9b0`) |
| Gate-5 regression `dist/tests/planning.test.js` | 97/97 PASS | `owner-review-final-gate5-regression.log` (`0562b31075c7b3da00544a72af55dc3b29bf0a6659acc591bc64511884534dcf`) |
| Routing and budget `dist/tests/budgeted-perception-routing.test.js` | 33/33 PASS | `owner-review-final-routing-regression.log` (`6f16fc251e708a1d1ef66fdf231c53f307b2fd103b5c9eb6cf2e7a1a8a944ebb`) |
| Accepted 16-file compatibility set | 377/377 PASS | `owner-review-final-compatibility.log` (`339703ceac5c07d7494619d91789f1412beddc0f92ba3fafaee73da54454887c`) |
| Legacy seams: `contracts`, `integration`, `jobs`, `telemetry` | 39/39 PASS | `owner-review-final-legacy-seams.log` (`136fdb51f2ff539b0780d3db919992d0b8b8355ec90633146a3ae8231f4f181a`) |
| `npm test` (build plus every `dist/tests/*.test.js`) | 697/697 PASS (625 accepted plus 72 Gate-7) | `owner-review-final-full-safe-suite.log` (`47f0dd3ab1b173daebc7b3812fe9c0903ad58d3a2868606a877a0c5ee16d34e9`) |
| `npm run audit:workspace` | PASS: 87 application TypeScript files (86 plus `runtime.ts`) and 9 runtime adapters | `owner-review-final-workspace-audit.log` (`b7698e9b22c96d155f774c80250db964922f796794d9354cfb876ba24ad4b2c6`) |

Every run had zero failed, skipped, cancelled or todo tests. No FFmpeg, ffprobe, media integration, Python, real-model, real-footage or network operation ran.

The final production bytes are:

| File | SHA-256 |
| --- | --- |
| `admission.ts` | `84ec3fb8118b9a3b247510ac707626cef9ebae21fbd5e6617c87d0b9f49b4a5d` |
| `common.ts` | `6676abbbbf1f97d75deb7c28802930024821cd9592143740f37356634af3929d` |
| `dag.ts` | `91e6e09c276ec785fbf1606a6a79c8d4b2eec968cacf7e22818c52ee5d87a21b` |
| `grant.ts` | `34c43b95b7a7d191dda4118adf4ddaaf992be23607d4879956af33d762dbdd90` |
| `index.ts` | `d1e0ec87c18ac77457f1c3e5b81691718483e3cfe0d2c96ae5dc97536ab16980` |
| `policy.ts` | `3732c5e30bae7f19a8d9ca65c240014c73274d242ab7004c68e582d0ee393a9b` (unchanged) |
| `runtime.ts` | `261ea07f55889671d4166f932907514a4f5371f902ad010e726d176207af89c2` |
| `source.ts` | `d6d78941984d37dd9f58c4b7c9486f9278c7d4fbce26e9fba86c43072085d944` |
| `workload.ts` | `11f627f572e306f7f4a90ab0feeb1131d18e6947cdb4f121156045f1783c62ee` (unchanged) |

All are under `packages/edit-execution/`.

### Preservation and workspace checks

These ran after the documentation edits. The evidence is `owner-review-final-protected-byte-comparison.json` and `owner-review-final-workspace.log`.

| Check | Result |
| --- | --- |
| Branch / HEAD / staged | `phase/5-edit-planner-v0` / `5ff5750af00e91bd6a226daf5841ec4dc3873819` / nothing staged |
| Tracked SHA-256 against `owner-review-baseline.json` | 250/250 accounted for. Only the authorized `docs/CURRENT_PHASE.md` differs; none missing or added |
| Protected files | 136/136 byte-identical |
| Owner files | All nine unchanged in size and SHA-256 |
| Earlier receipts | All 159 unchanged |
| `git diff --check` | PASS |
| Work files | LF line endings, a final newline and no trailing whitespace |
| Relative links | All links in this report and `docs/CURRENT_PHASE.md` resolve |

### Superseded statements

Each statement below, in the Batch-1 sections above, is superseded as described. The original text stays as a historical record.

1. "Files owned by this batch" lists "52 owned refusal codes" for `common.ts` and "51 focused tests". Now there are 58 codes and 72 tests. `packages/edit-execution/runtime.ts` and `tests/support/edit-execution-chains.ts` are also owned.
2. "Execution-time source recheck" gives the resolver build as (`resolverId`, `version`, `implementationDigest`). Its `version` is now the location-free label.
3. "Execution grant" lists what the grant binds. It now also binds exactly one runtime attestation.
4. "Execution admission": the order now also checks operation executability right after graph replay, and the runtime attestation after the capability recheck. The admitted record also carries `runtime` and `dispatch`.
5. "Execution DAG" table: `source_video_clip` carries "exact source range and precision", and `linked_source_audio` "source, exact range". Both now carry the exact range, `trim` and `frameTimes`. `cut_sequence` refuses duplicate cuts. "The DAG also records …": it also records `dispatch` with the claim key.
6. "Computation identity" says it binds the "DAG semantics version, render intent and executor build". It now also binds the encoding runtime build.
7. The bound fields for the source clip ("the source hash, exact range and precision") and for linked audio ("the source, range …") now also include each endpoint's kind and frame index and the frame-time table content.
8. "No cache or persistence service exists; only identity semantics." This still holds, and a computation identity is never access authorization.
9. "All 52 codes are owned" now reads 58.
10. Remaining limitations, "No durable ledger … a runtime ledger is needed to stop two admissions from citing the same reservation." This is replaced by the explicit dispatch boundary and the Batch-2 atomic-claim invariant above. The ledger itself remains unimplemented.
11. Remaining limitations, "Encoding support is not attested … not attested." Encoding support is now covered by the attributed runtime attestation; it is still attributed, not probed.
12. Remaining limitations, "multi-asset graphs were not exercised by the single-asset synthetic chain." They are now exercised by the test-only two-asset chain.
13. The Batch-1 "Final verification" figures (51/51 focused, 676/676 full, 86 application files) are historical. The current figures are above.

### Remaining limitations and open observations

- **Attributed, not verified.** The runtime attestation, source receipts and work estimate are attributed. The core runs no probe and cannot detect a false attestation.
- **No claim yet.** The Batch-2 atomic claim, ledger and dispatch-time rechecks are specified, not implemented. Batch 2 is not authorized.
- **Open observation: executor version.** The accepted Gate-6 `ExecutorIdentitySchema.version` is free text (`VersionLabelSchema`), and Gate 7 carries the executor identity verbatim into the grant, admission and DAG. Tightening it would change a frozen Gate-6 surface or add a Gate-7 admission rule, so it was left unchanged for an owner decision.
- **Open observation: estimate binding.** The work estimate binds the executor build but not the runtime identity; the grant binds both explicitly.
- **Synthetic coverage.** Multi-asset coverage is synthetic and test-only; no real footage was used.
- **V0 bounds unchanged.** One encoding vocabulary; no stacked looks; competing cuts are refused rather than resolved. No FFmpeg or other adapter, media QC, critic, repair, UEP, RenderResult, QCResult, JobState or DecisionEvent integration.

PHASE 5 GATE 7 BATCH 1 POST-OWNER-REVIEW VERIFICATION: PASS

GATE 7 BATCH 1 OWNER ACCEPTANCE: PENDING

GATE 7 OVERALL: NOT YET COMPLETE

BATCH 2 ACTUAL MEDIA RENDERING: NOT AUTHORIZED

## Final owner hardening — 2026-09-25

This section is appended. The sections above are historical and were not rewritten; the superseded statements are listed below. The final owner review, `gate7-batch1-postrepair-owner-review.txt`, is preserved unedited and unstaged.

Gate 7 Batch 1 final hardening verification: **PASS**

Gate 7 Batch 1 owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Batch 2 actual media rendering: **NOT AUTHORIZED**

### Baseline and constraints

- Branch `phase/5-edit-planner-v0` and HEAD `5ff5750af00e91bd6a226daf5841ec4dc3873819` were unchanged throughout; nothing is staged, committed or pushed.
- Before any edit, `.local-runs/phase5-gate7/final-owner-baseline.json` (SHA-256 `b75d014be325bb86f7a9bb803d577970afad85911fc301f7e12c1c17bcb03972`) recorded 250 tracked files, 136 protected files, ten owner files and 199 earlier receipts. The ten owner files are the nine listed above plus `gate7-batch1-postrepair-owner-review.txt`. The baseline also recorded the untracked Gate-7 work files.
- The pre-repair production bytes equal the owner's capture: `final-owner-prerepair-production-hashes.log` (SHA-256 `56fd8214fe8d6cce65c032ebd66cf567cc6dde4b369b057466205c48167b4d46`).
- No accepted Gate 1–6 byte, public contract or dependency changed, and no fix needed a Gate-6 change. No FFmpeg, ffprobe, media, Python, model, real-footage, network or subprocess operation ran. All evidence is synthetic.

### Findings and outcomes

| # | Finding | Source | Outcome | Red receipt (under `.local-runs/phase5-gate7/`) |
| --- | --- | --- | --- | --- |
| 1 | The work estimate bound neither the runtime build nor the execution environment | Final owner finding 1 | CONFIRMED; repaired | `final-owner-estimate-runtime-environment-red.md` |
| 2 | A Gate-6 free-text executor version reached Gate-7 execution authority and DAG state | Final owner finding 2 | CONFIRMED; repaired without changing Gate 6 | `final-owner-executor-version-boundary-red.md` |
| 3 | The four-field `claimKey` was not the atomic uniqueness key | Final owner finding 3 | CONFIRMED; repaired | `final-owner-claim-target-red.md` |
| 4 | Node computation identities did not bind the execution environment | Final owner finding 4 | CONFIRMED; repaired | `final-owner-environment-computation-red.md` |
| 5 | The claim target keyed a storage-named reservation reference instead of the reservation | Self-found in the adversarial review of the finding-3 repair | CONFIRMED; repaired | `final-owner-claim-target-content-red.md` |

The four owner regressions were written first and run together against the exact unrepaired bytes: 0 pass, 4 fail (`final-owner-red-run.log`). Each failed at its first sub-case, so every sub-case was confirmed separately against the same build with a read-only diagnostic. The first run of the executor diagnostic failed on a script import defect, `supplied is not a function`. That log is preserved and is not product evidence; the corrected rerun is `final-owner-executor-version-boundary-diagnostic-rerun.log`.

After the finding 1–4 repairs the regressions passed 4/4, and the focused file passed 76/76 (`final-owner-repair-focused-run.log`). The four adversarial test groups then passed on their first run. Writing the reservation-relabel attack exposed finding 5, which went test-first through its own red receipt and repair; the focused file then passed 81/81.

### Finding 1 — the estimate binds the exact runtime and environment

`ExecutionWorkEstimate` now also binds `runtime`, the exact `RuntimeIdentity` (`runtimeId`, `version`, `implementationDigest`), and `environment`. Its existing bindings are unchanged: graph, executor build, render profile, intent, policy and source set. Admission requires the estimate's runtime to equal the admitted runtime identity and its environment to equal the grant's; any mismatch is `work_estimate_mismatch`.

The binding is to the runtime identity, never to an attestation reference. The same runtime build re-attested later keeps its estimate, and an estimate made before the runtime attestation was observed remains legitimate: chronology alone does not invalidate a correctly bound identity. Both cases are tested. The estimate stays attributed, not measured, and is never capability evidence. The test support now creates each estimate only after the exact runtime identity and environment are known.

### Finding 2 — execution-safe executor identity at the Gate-7 boundary

The Gate-7-owned `ExecutionExecutorIdentitySchema` has three fields:

- `executorId`: the existing `IdSchema`;
- `version`: `LocationFreeVersionSchema`;
- `implementationDigest`: `HashSchema`.

It types the selected executor in the grant, estimate, runtime attestation, admission, DAG, DAG settings and render identity.

Admission checks the selected executor before anything else reads the grant. An identity that the Gate-6 schema accepts but the Gate-7 schema refuses is ineligible for execution and refuses with the new owned code `executor_not_execution_safe`, making 59 codes in total. The selected Gate-6 snapshot executor must still equal that safe identity exactly.

Gate 6 is unchanged and the snapshot is not rewritten; an unsafe executor that is not selected does not invalidate a safe selected one (tested).

- **Refused:** paths, Windows paths, URLs, commands, whitespace, quotes, separators, a drive colon, a leading dot and a non-ASCII hyphen, both at artifact creation and as supplied bytes.
- **Accepted:** `0.1.0`, `ffmpeg-9.0.1` and `renderer_v1+cpu`.

### Findings 3 and 5 — the claim target is the reservation attempt only

`ExecutionDag.dispatch` is now:

```
state: not_claimed
requirement: atomic_runtime_claim_required
claimTarget: { claimTargetId, reservationId, operationId, attempt }
renderBinding: { renderComputationId }
```

`claimTargetId` is content-identified under the namespace `execution_claim_target_v0` from exactly `{ reservationId, operationId, attempt }`. `reservationId` is the reservation's Gate-3 content identity, which the admission now also records beside the exact reservation reference.

This is a deliberate refinement of the preferred shape (finding 5). Identifying the reservation by its `ArtifactRef` made the target depend on a storage `objectId` and on the byte form. The same reservation relabeled, or supplied as non-canonical bytes, admitted with a different target, so one attempt could have been claimed twice.

Structural parsing recomputes `claimTargetId` and requires `renderBinding` to name the DAG's own render computation. Replay from the admission fixes the reservation, operation and attempt. No claim is implemented; the state stays `not_claimed`, and no claimed, lease, started, worker or permission field exists. The tests show:

- the same attempt and render replays identically;
- the same attempt with another render (a re-grant, a preview, another environment) keeps the same target and changes the render binding;
- another attempt, operation or reservation changes the target;
- a relabeled or reformatted copy of one reservation keeps the target;
- a render mutation, coherently resealed, leaves the target untouched and still fails replay;
- a target identity derived with the render computation is structurally invalid.

### Finding 4 — node computation identities bind the environment

`ExecutionDagSettings.environment` is taken from the admission and bound through the common node computation, so every node's computation and occurrence identity differs across environments, as does the render identity. V0 invents no environment-equivalence policy: a different environment always means different identities. Replay enforces that the settings' environment equals the admission's; a relabeled and fully resealed DAG, or a relabeled admission, is refused (tested). Identical settings and environment still yield deterministic identities.

### Batch-2 invariants (documented, not implemented)

1. **Atomic claim.** Uniqueness is on `claimTargetId` only, or equivalently the exact `(reservationId, operationId, attempt)` tuple, by compare-and-set or a unique constraint. The first winner records `renderBinding.renderComputationId` and the DAG identity; every later claimant of the same target fails, whatever render computation it presents. A preview and a final render of one reservation attempt therefore share one target; rendering both takes two attempts.
2. **Reservation ledger.** The durable ledger must be the only source of reservation history, so each execution budget, operation and attempt has at most one reservation. Otherwise a forked history mints a second reservation with its own `reservationId` and claim target. Gate 3 claims no multi-worker lock.
3. **Source TOCTOU.** The bytes verified immediately after winning the claim must be the bytes the renderer consumes. Never hash a path, close it and reopen the same mutable path to render. Batch 2 must use an execution-safe mechanism, such as a verified immutable content-addressed staging object or another exact claim-bound source handle; the exact design belongs to Batch 2.
4. **Runtime budget.** The attributed work estimate is only pre-dispatch admission evidence. Batch 2 must measure actual work, cost and latency, and must enforce and record reservation consumption; an estimate is not measured usage.
5. **Rechecks.** After winning the claim and before media starts, recheck the grant time window, source identity and lifecycle, capability and runtime state against the actual runtime context.

This refines the safe sequence in the owner-review section above:

1. Collect fresh evidence and a Gate-3 reservation for a new attempt.
2. Issue the content-addressed grant.
3. Admit at the actual time and compile the DAG.
4. Claim `claimTargetId` atomically and durably, recording the render binding; stop if the target is already claimed.
5. Recheck grant time, sources, capability and runtime. Stage the verified source bytes as the immutable, claim-bound objects the renderer will read. None of this is written back into the grant.
6. If any check fails, the attempt ends without media work.
7. Dispatch exactly the claimed render computation on the attested executor, runtime and environment, and record measured consumption.

### Files changed by this hardening

| File | Change |
| --- | --- |
| `packages/edit-execution/common.ts` | `ExecutionExecutorIdentitySchema`; `executor_not_execution_safe` |
| `packages/edit-execution/grant.ts` | The estimate binds `runtime` and `environment`; the grant and estimate use the execution-safe executor |
| `packages/edit-execution/runtime.ts` | The attestation uses the execution-safe executor |
| `packages/edit-execution/admission.ts` | Executor safety check; the estimate's runtime and environment check; `reservationId` in the budget record |
| `packages/edit-execution/dag.ts` | Environment in the settings and every computation; execution-safe executor; `claimTarget` and `renderBinding` |
| `tests/edit-execution.test.ts` | 5 final-owner regressions (4 owner, 1 self-found) and 4 hard-attack tests; 81 in total |
| `tests/support/edit-execution.ts` | Environment option; fresh attestations for another environment; each estimate made after its runtime and environment are known |

`tests/support/edit-execution-chains.ts` is unchanged (`dcd3aadde2cee9c18cef2f665474a067a0361a303b06fce2e2156680a649f2f6`).

Existing tests changed only where a repair changes an expected shape:

- the owner-review dispatch regression and two dispatch hard-attack tests now use `claimTarget` and `renderBinding`;
- `resealDag` recomputes the render binding;
- the first admission test's budget record includes `reservationId`;
- after finding 5, the finding-3 regression's expected target field changed from `reservation` to `reservationId`. Its rule is unchanged: the same target across re-grants, a different render binding.

### Chronology and receipts

No receipt was overwritten. All paths are under `.local-runs/phase5-gate7/`.

| Step | Evidence (SHA-256) | Result |
| --- | --- | --- |
| Baseline | `final-owner-baseline.json`, `final-owner-prerepair-production-hashes.log` | As above |
| Owner reds | `final-owner-red-run.log` (`d034c05fa8b8ed5f7179f118625c977f1e51b98a2dda87d12a3e5120c9cf0d63`); four receipts; diagnostic logs per finding | 4 regressions, 0 pass |
| Findings 1–4 repaired | `final-owner-repair-focused-run.log` (`051e1f6ac96fb4250ce1f5fb16352017d8c80ee36bc216b6c595031a9fdc3a1c`), copied unchanged from its session scratch log | 76/76 |
| Adversarial tests | `final-owner-attacks-first-run.log` (`ebe9638575d2915a2c9d1d43804454804f9c72ff02801da8e7e0d30b03cf3efd`), copied unchanged from its session scratch log | 8/8 on first run: 4 regressions, 4 hard-attack tests |
| Finding 5 red | `final-owner-claim-target-content-red.md` (`6809206cde22fe0989a55da98e59df38b3a0b187092b9639a2c16950c11c9454`); run log `b9cf446ab931edf50038aae8c008dfb5de67d7fa516e5d8e42220a886a256e92`; sub-cases `final-owner-claim-target-content-subcases.log` | Relabeled and reformatted copies admitted with different targets |
| Finding 5 repaired | `final-owner-claim-target-content-repair-focused-run.log` (`1b928c90468747347a0f2dce403ef2177a641db7b513760e259d1978c3a28ba5`) | 81/81 |

The compiled import closure (`final-hardening-runtime-import-closure.log`) is byte-identical to the owner-review closure: 50 runtime modules, only `zod` and `node:crypto` external, and no provider, job, telemetry, QC or script module.

### Final hardening verification

All test runs used `scripts/no-network.mjs`.

| Command / check | Result | Local evidence (SHA-256) |
| --- | --- | --- |
| `npm run typecheck` | PASS | `final-hardening-typecheck.log` |
| `npm run build` | PASS | `final-hardening-build.log` |
| Focused `dist/tests/edit-execution.test.js` | 81/81 PASS | `final-hardening-focused.log` (`51662aaac456748b859b70e459e7b300d11b70a4feb381f32643c12917845293`) |
| Gate-6 regression | 79/79 PASS | `final-hardening-gate6-regression.log` (`8256ee7487dc56bc2ae281f5b742989a3925e3011a61fd90de6452c330084497`) |
| Gate-5 regression | 97/97 PASS | `final-hardening-gate5-regression.log` (`b362c18cd8f2a7d7868f580e3b2fc8a55074838620629af2428f2ae7dab7c972`) |
| Routing and budget | 33/33 PASS | `final-hardening-routing-regression.log` (`8a6fd02d7d8350b79d0058e6594e2796166f166056ca3f1dae1569e4738d3588`) |
| Accepted 16-file compatibility set | 377/377 PASS | `final-hardening-compatibility.log` (`4abe3366fc336b21915c246e6a441fabe921336f8ccb900ee7534ee115cf08cc`) |
| Legacy seams: `contracts`, `integration`, `jobs`, `telemetry` | 39/39 PASS | `final-hardening-legacy-seams.log` (`f5d69612cbfbaa7b767b38ffe21d895ef932d8a5be3dc0524ebe759cdacfb9eb`) |
| `npm test` | 706/706 PASS (625 accepted plus 81 Gate-7) | `final-hardening-full-safe-suite.log` (`8f58f89d9a747762c1db365fbf80873ce3f2315fc5d86c93306f9b0cc9e2ae23`) |
| `npm run audit:workspace` | PASS: 87 application TypeScript files and 9 runtime adapters | `final-hardening-workspace-audit.log` (`b7698e9b22c96d155f774c80250db964922f796794d9354cfb876ba24ad4b2c6`) |

Every run had zero failed, skipped, cancelled or todo tests.

The final bytes are:

| File | SHA-256 |
| --- | --- |
| `packages/edit-execution/admission.ts` | `5e6bfe47433f4ff736f5fdd129c4c4ead3440f55f5a070b457dc30818fe9a5d5` |
| `packages/edit-execution/common.ts` | `68d99ee67122bc723f2e758a6b4137fe0f3047dd15124f18e0006dc89451be7d` |
| `packages/edit-execution/dag.ts` | `3cbb2971b8aaf1385c8cf0d42b7975442886f569fd126b5034b9cb4144734d8b` |
| `packages/edit-execution/grant.ts` | `3e7c6cb787f1c977955804921c81d41cbc1fd92fcedf74aac390857f8ca736c2` |
| `packages/edit-execution/index.ts` | `d1e0ec87c18ac77457f1c3e5b81691718483e3cfe0d2c96ae5dc97536ab16980` (unchanged) |
| `packages/edit-execution/policy.ts` | `3732c5e30bae7f19a8d9ca65c240014c73274d242ab7004c68e582d0ee393a9b` (unchanged) |
| `packages/edit-execution/runtime.ts` | `3db1353b95352eb6d30b7e19f47905563cbd1801423a810d86d45a1552fdcdb3` |
| `packages/edit-execution/source.ts` | `d6d78941984d37dd9f58c4b7c9486f9278c7d4fbce26e9fba86c43072085d944` (unchanged) |
| `packages/edit-execution/workload.ts` | `11f627f572e306f7f4a90ab0feeb1131d18e6947cdb4f121156045f1783c62ee` (unchanged) |
| `tests/edit-execution.test.ts` | `e62f457ff05533a45fe525764214b25aa374723729073c98dd63194822a76c63` |
| `tests/support/edit-execution.ts` | `bf1ace12b2b26ed46694ccf0243ed3993475366279c36fc9b66bba1c857e3828` |
| `tests/support/edit-execution-chains.ts` | `dcd3aadde2cee9c18cef2f665474a067a0361a303b06fce2e2156680a649f2f6` (unchanged) |

### Preservation and workspace checks

These ran after the documentation edits. The evidence is `final-hardening-protected-byte-comparison.json` and `final-hardening-workspace.log`.

| Check | Result |
| --- | --- |
| Branch / HEAD / staged | `phase/5-edit-planner-v0` / `5ff5750af00e91bd6a226daf5841ec4dc3873819` / nothing staged |
| Tracked SHA-256 against `final-owner-baseline.json` | 250/250 accounted for. Only the authorized `docs/CURRENT_PHASE.md` differs; none missing or added |
| Protected files | 136/136 byte-identical |
| Owner files | All ten unchanged in size and SHA-256 |
| Earlier receipts | All 199 unchanged |
| `git diff --check` | PASS |
| Work files | LF line endings, a final newline and no trailing whitespace |
| Relative links | All links in this report and `docs/CURRENT_PHASE.md` resolve |

### Superseded statements

Each statement below is superseded as described; the original text stays as a historical record.

1. Owner-review section, "Blocker 3": "The DAG adds the exact claim key `{ reservation, operationId, attempt, renderComputationId }`." It is replaced by `claimTarget { claimTargetId, reservationId, operationId, attempt }` and a separate `renderBinding`.
2. Owner-review section, the Batch-2 invariant "A claim is durable and exclusive per reservation attempt `(reservation, operationId, attempt)`", and step 4 of its safe sequence. The claim is now on `claimTargetId`, identified from `(reservationId, operationId, attempt)`. Step 5 also gains the source-TOCTOU staging requirement.
3. Owner-review section, "Blocker 1": "the exact executor build: `executorId`, `version` and `implementationDigest`". The attestation's executor identity is now the execution-safe identity.
4. Owner-review section, "Open observation: executor version … left unchanged for an owner decision." This is resolved at the Gate-7 boundary; Gate 6 is still unchanged.
5. Owner-review section, "Open observation: estimate binding." This is resolved: the estimate binds the exact runtime identity and environment.
6. Batch-1 "Workload derivation and attributed estimate": "The estimate binds the exact graph, executor build, render profile, intent, policy and source set." It now also binds the runtime identity and environment.
7. Batch-1 "Computation identity", and the owner-review statement "It now also binds the encoding runtime build". Every node now also binds the execution environment.
8. Owner-review "Cache identity boundary": "Identical work can therefore be recognized across projects." This still holds within one execution environment; V0 never shares work across environments.
9. The owner-review counts (58 owned codes; 72/72 focused and 697/697 full tests) are historical. The current figures are 59 codes and the results above.
10. Batch-1 and owner-review "Execution admission" order: the selected executor's safety is now checked first, before anything else reads the grant.

### Remaining limitations and open observations

- **Attributed evidence.** Runtime attestations, receipts and estimates are still attributed, not verified.
- **Batch 2.** The atomic claim, reservation ledger, source TOCTOU staging, measured accounting and dispatch-time rechecks are specified here, not implemented. Batch 2 is not authorized.
- **Identifier alphabet.** The accepted repository-wide `IdSchema`, which the owner fixed as the Gate-7 `executorId` type and which the runtime ID also uses, admits `:` and `.`. A drive-relative form such as `C:ffmpeg.exe` therefore remains representable in an ID. It still cannot contain a separator, whitespace or `//`. Left unchanged.
- **Scope of coverage.** All coverage is synthetic; no real footage was used.

PHASE 5 GATE 7 BATCH 1 FINAL HARDENING VERIFICATION: PASS

GATE 7 BATCH 1 OWNER ACCEPTANCE: OWNER-ACCEPTED at `d55f0e1`

GATE 7 OVERALL: NOT YET COMPLETE

BATCH 2 ACTUAL MEDIA RENDERING: NOT AUTHORIZED at this closure checkpoint

## Independent owner acceptance closure — 2026-09-25

Gate 7 Batch 1 is **OWNER-ACCEPTED** at implementation commit `d55f0e1` after independent final source review.

The accepted Batch-1 boundary establishes a fail-closed internal EditGraph execution foundation:

- explicit render-media authorization distinct from analysis/evaluation authorization;
- fresh full-byte source identity and lifecycle receipts;
- fresh single-executor capability evidence;
- exact runtime/encoding attestation;
- execution-safe Gate-7 executor identity without changing the frozen Gate-6 contract;
- a separate execution budget and replay-valid Gate-3 reservation;
- work estimates bound to the exact executor, runtime and environment;
- exact output frame-grid conformance;
- provider-neutral typed execution DAG construction;
- preserved source trim/timebase authority;
- deterministic per-node and overall render computation identities;
- execution-environment-bound computation identities;
- exact operation accounting, with ambiguous competing operations refused rather than dropped;
- an atomic claim target derived from the Gate-3 reservation content identity, operation and attempt, with `renderComputationId` kept as a separate binding;
- explicit `not_claimed / atomic_runtime_claim_required` dispatch state.

Final accepted verification evidence:

- typecheck: PASS
- build: PASS
- Gate-7 focused: 81/81 PASS
- Gate-6 regression: 79/79 PASS
- Gate-5 regression: 97/97 PASS
- routing/budget regression: 33/33 PASS
- accepted compatibility set: 377/377 PASS
- legacy seams: 39/39 PASS
- full safe suite: 706/706 PASS
- workspace audit: PASS
- protected-byte comparison: PASS
- git diff --check: PASS

This acceptance remains synthetic/offline. It does **not** establish:

- actual FFmpeg/media execution;
- render correctness on real footage;
- professional editing quality;
- media QC correctness;
- critic or automatic-repair quality;
- measured runtime/cost/latency;
- production concurrency correctness.

Batch 2 must still establish, before any media subprocess may dispatch:

1. one durable authoritative reservation/claim ledger;
2. atomic exclusivity on the exact attempt claim target;
3. protection against forked reservation histories;
4. immediate claim-bound authority/capability/runtime rechecks;
5. source TOCTOU protection so the verified bytes are exactly the bytes consumed;
6. measured execution and reservation-consumption accounting.

GATE 7 BATCH 1:
OWNER-ACCEPTED

ACCEPTED IMPLEMENTATION:
d55f0e1

GATE 7 OVERALL:
NOT YET COMPLETE

BATCH 2:
NOT AUTHORIZED AT THIS CLOSURE CHECKPOINT
