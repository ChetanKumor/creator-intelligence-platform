# Phase 5 Gate 7 Batch 3B — RepairPlan, typed GraphDiff, immutable EditGraph revisions, dependency-aware localized recomputation

Implementation and verification record. Status date 2026-09-29 (owner acceptance closure, §27). Branch `phase/5-edit-planner-v0`; implementation
started from `db04f2ed97844bb149fc8f642b423c3adf56776e` (Gate 7 Batch 3A-F, owner-accepted). It stayed uncommitted and unstaged for independent owner
review until the owner acceptance closure.

| Status | Value |
|---|---|
| Architecture V2 | **FROZEN** |
| Gate 7 Batch 3A / 3A-F | **OWNER-ACCEPTED** |
| Phase 5 Gate 7 Batch 3B implementation verification | **PASS** (§27: final repaired bytes, full safe suite 1016/1016). History: **PASS** on the implementation's bytes (§22), then **INCOMPLETE** at the owner-review checkpoint (§26.6) |
| Gate 7 Batch 3B owner acceptance | **OWNER-ACCEPTED** (2026-09-29, §27; **PENDING** at the earlier checkpoints) |
| Full safe suite / workspace audit / `git diff --check` | **PASS** 1016/1016 / **PASS** / **PASS** (final repaired bytes, owner-run, §27) |
| Gate 7 overall | **NOT YET COMPLETE** |
| Batch 3C | **NOT STARTED** |
| Real user footage | **NOT RUN** (synthetic authorized media only) |
| Professional editing quality | **NOT VERIFIED** |

Batch 3B establishes, on synthetic media only, the chain:
rendered output → Technical QC → observation → semantic critic → CriticFinding → RepairPlan → validated GraphDiff → new immutable EditGraph
revision → dependency impact → new ExecutionDag and RenderProgram → reuse of provably identical computation plus recomputation of what changed →
new output → Technical QC → new observation. Evidence lives in the ignored `.local-runs/phase5-gate7/` (`batch3b-*`); receipts are append-only.

## 1. Baseline

- HEAD = `origin/phase/5-edit-planner-v0` = `db04f2ed97844bb149fc8f642b423c3adf56776e`; no tracked modification; nothing staged.
- Baseline receipt `batch3b-baseline.json` (`860a09059a77b25b3684b007e52049c5d7f7910bd3a900efe3e543a2aa860686`): SHA-256 of all 312 tracked files,
  the 17 untracked owner files by name, size and modification time only (never read, hashed, modified, staged or deleted), the SHA-256 of all 676
  earlier Gate-7 receipt files, Node v24.15.0 and the pinned FFmpeg digest `72a489ec…6aa3`.
- Baseline invariants `batch3b-baseline-invariants.json` (`d76c430d58291fe5bf58969edcc5a0611062e836f0270b346cd4d8ec6a05f190`), captured from a clean build
  of the unmodified baseline: for four revision-0 chains (`cut_ab`, `clip_look_ab`, `whole_look_ab`, `three_abc`) the EditGraph id and bytes, DAG id,
  RenderProgram id, argv digest and every segment computation identity. Test F01 asserts all of them unchanged after 3B.

## 2. Authorization and protected changes

The 3B specification authorizes the smallest changes required to EditGraph, ExecutionDag, RenderProgram, runtime, review, tests and pin tables for
RepairPlan, GraphDiff, revision semantics, dependency impact, DAG/program revision propagation, trusted localized reuse and repair receipts. Every
accepted-file change below is of that kind (§5, §24). **PROTECTED_CHANGE_OUTSIDE_3B_AUTHORIZATION: none was needed.** No owner file was touched.

## 3. Architecture V2 invariants kept

- The EditGraph remains the only composition authority. A RepairPlan, CriticFinding, ExecutionDag or RenderProgram is never authority; a DAG and
  program are compiled only from a validated (child) graph, never patched.
- The only mutation path is CriticFinding → RepairPlan → typed GraphDiff → pure application against one exact parent → new immutable revision.
  No critic, planner or model can mutate anything: a planner returns data through a port and the core validates it (§6, R01, R32).
- Exact time only (§9): no floats, epsilons or milliseconds carry authority anywhere in 3B.
- Execution still goes through the accepted admission, claim, staging, lifecycle, runtime and conformance probes, permit, pinned FFmpeg (re-verified
  by digest before every spawn), no-overwrite publication, receipts, independent Technical QC and the Batch-3A review. There is no second renderer:
  segmented execution runs the SAME RenderProgram under the SAME `RENDER_SEMANTICS` (unchanged file, unchanged executor identity and owner
  accounting ruling).
- No EditorialState, RevisionLedger, motion, HyperFrames, GSAP, Lottie, Three.js, AudioGraph, preview, manual NLE, OTIO/OCIO or generative media (K01,
  R34).

## 4. Reconnaissance (before any production change)

Recorded in `batch3b-plan.md`. Revision > 0 was blocked by literal `revision: 0` schemas at ten sites (EditGraph 0.2.0 root fields; ExecutionGrant,
ExecutionAdmission, ExecutionDag, RenderProgram, ExecutablePermitBinding, receipts, ReviewPlan, EditorialObservation and CriticReport graph references),
and an accepted Gate-6 test requires EditGraph 0.2.0 to keep refusing `revision: 1`. Execution was one pinned FFmpeg process per claim with no
intermediate artifact, so no segment work could be reused. Two scratch feasibility probes (kept as `batch3b-feasibility-probe{1,2}.{mjs,log}`, logs
`e6430c0c…` and `6658a8d5…`) showed that per-segment stage processes writing raw planar yuv420p frames and raw float samples, followed by one assembly
process (square-pixel assertion, concatenation, whole-output look, time bases and the identical encode tail), reproduce the accepted one-pass bytes
exactly in 5/5 cases: a plain cut, clip looks, a whole-output look, one source used twice and a repair-shaped child with one segment reused.

## 5. Revision and version strategy

| Record | Version | Change |
|---|---|---|
| EditGraph | **0.2.0 unchanged** | Still exactly the Gate-5-replayed root (revision 0, parent `not_applicable`, change set `initial_graph`); still refuses `revision: 1` (Gate-6 test and C01). Legacy float-second 0.1.0 is still refused (`graph_version_unsupported`). |
| EditGraph revision | **0.3.0 new** | Same composition body; `revision ≥ 1` (at most 256); `parent: {state: "present", editGraph: exact ArtifactRef, editGraphId, revision}` (the parent ref's version is 0.2.0 for revision 0, else 0.3.0); `changeSet: {kind: "graph_diff", graphDiff: exact ArtifactRef, graphDiffId}`. Validated only by replay (§8). |
| GraphDiff | **0.1.0 new** | `packages/edit-graph/revision.ts` (§7). |
| RepairPolicy, RepairPlan, DependencyImpact | **0.1.0 new** | `packages/edit-repair/` (§6, §10). |
| LocalizedExecutionPlan, SegmentArtifactRecord | **0.1.0 new** | `packages/edit-render/localized.ts` (§12-§13). |
| RenderExecutionReceipt / RenderExecutionFailure | **0.2.0 new** (segmented) | 0.1.0 keeps its exact one-process meaning. 0.2.0 records every process, each segment's computed or reused intermediate and its verification, which staged sources were consumed, and the per-process measurements whose aggregate the accepted accounting rule replays. `AnyRenderExecutionReceiptSchema` (0.1.0 ∪ 0.2.0) is accepted by Technical QC, the review and the observation adapter. |
| ExecutionGrant, ExecutionAdmission, ExecutionDag, RenderProgram, ExecutablePermitBinding, TechnicalMediaQcReceipt, ReviewPlan, EditorialObservation, CriticReport | **unchanged versions** | Their graph reference's `revision` widens from the literal 0 to a non-negative integer. The referenced EditGraph's own record version (0.2.0 or 0.3.0) says whether it is a root or a revision; admission and DAG validation dispatch on it. Every revision-0 record is byte-identical to the baseline (F01). **Disclosed for owner review:** this admits records at revision > 0 under the same version numbers rather than minting new versions; no existing record's meaning changes. |

Accepted historic receipts and reports are not rewritten.

## 6. RepairPlan, repair policy and the planner port (`packages/edit-repair/`)

**RepairPolicy** (owner-authored, content-identified): allowed typed actions (`trim_clip_source_range`), allowed finding producers
(`deterministic_check`, `semantic_critic`), and a budget: operations, clips touched, exact affected output duration, exact source time removed per
operation, repair attempts, explanation characters and plan bytes, each inside hard ceilings (16 operations, 16 clips, 8 attempts, 400 characters,
262,144 bytes).

**RepairPlan** (content-identified `repair_plan_v0_…`) binds: scope; the exact parent EditGraph (ref, id, revision); the render (receipt id and version,
DAG, program, render computation, output artifact id, content hash and size); the passing Technical-QC receipt; the CriticReport (exact ref) and the
exact finding (id, dimension, severity, basis, producer kind, affected output frames, join); the finding's evidence references; the policy; the planner
identity; the attempt (derived: parent revision + 1, bounded by the policy); a bounded location-free rationale (the accepted Batch-3A explanation
rule); typed actions `{action: "trim_clip_source_range", clipUseId, keep: exact SourceRange}`; the derived effect (clips touched, removed output
frames, affected output interval in ticks, exact affected duration); the planner's uncertainty; and the literal outcome
`proposal_only_repair_not_established_until_new_rendered_evidence_v0`. A plan answers why (finding and evidence), what (typed actions) and under which
authority; it is never a mutation, and a repair is established only by new rendered evidence. Shell commands, paths, filter strings, JSON patches,
code and float seconds are unrepresentable (A04, R02).

**Planning** (`planRepair`) validates and snapshots everything before the planner runs. That covers:
- the DAG handle and the exact graph and revision it executed, with the graph replayed;
- the receipt and program;
- QC: missing → `technical_qc_missing`; not a QC receipt → `technical_qc_invalid`; failed verdict → `technical_qc_failed`, checked before
  linkage → `technical_qc_linkage_mismatch`;
- the critic report of exactly this output, revision and QC;
- the finding;
- every evidence reference, resolved inside observations the report lists;
- the policy: scope, producer, attempts.

The **RepairPlannerPort** receives a deep-frozen, bounded, location-free copy: the finding, its resolved evidence, the parent's exact clip and segment
mapping, frame rate, allowed actions and limits. It is called once, and its response is untrusted data. The response must be exactly
`{rationale, actions, uncertainty}`; actions must be registered; each trim must pass the EditGraph's own trim rule against the exact parent; the
budget must hold; the trim must remove output the finding names (`repair_action_unrelated_to_finding`); and uncertainty may cite only the finding's own
evidence (§16, D2). `validateRepairPlan` re-derives the plan from its bindings and recorded proposal without any planner. The acceptance planner is a
deterministic synthetic fixture rule in `tests/support/edit-repair.ts` (`synthetic_boundary_trim_fixture_planner`), never a model; no provider is a
dependency.

## 7. GraphDiff (`packages/edit-graph/revision.ts`)

- **Typed, canonical, content-identified** (`graph_diff_v0_…`), `semantics: "typed_graph_diff_v0"`, scope-bound, at most 16 operations, at most one
  per node. The registered union has one member, `trim_clip_source_range {clipUseId, expected: {range}, replacement: {range}}`. Operation names are
  read before parsing, so a JSON patch, pointer path or future operation is refused `graph_diff_operation_unsupported`, never ignored or partly
  applied (B01, R03/R30).
- **Parent-bound, revision-bound, compare-and-swap:** `parent: {editGraph: exact ArtifactRef, editGraphId, revision}` must equal the supplied parent's
  exact ref (its bytes), id and revision (`graph_diff_parent_mismatch`: another graph, revision or parent bytes, a stale diff after a newer revision,
  re-application to the child). Each operation's `expected.range` must equal the parent clip's exact range (`graph_diff_expected_mismatch`). No merge,
  no best effort.
- **Origin:** `{kind: "repair_plan", repairPlan: exact ref, repairPlanId}`. This is provenance at the graph layer; the repair layer proves it (§8).
- **Trim semantics** (shared with planning via `trimSelectionOf`):
  - Only a video clip use of the exact parent can be trimmed; linked audio follows by derivation and is never a target (`graph_diff_target_invalid`).
  - The replacement must be a real change (`graph_diff_noop`) and lie inside the parent's range (`graph_diff_outside_authorized_range`).
  - It must be canonical, positive, non-reversed exact time (`graph_diff_invalid`).
  - A changed endpoint must be exactly representable on the graph clock (`time_not_representable`) and must be an admitted source frame: the exact
    legacy decoding of one entry of the clip's own analysis frame table, compared with `sameInstant` (`graph_diff_endpoint_not_a_frame`). Nothing is
    snapped. A changed endpoint gains `frame_pts` authority citing `/metadata/frameTimes/<i>`; an unchanged endpoint keeps its authority.
  - Asset, content hash, analysis, boundary, shot and lineage are unchanged (D01).
- **Application is pure:** no clock, file, network, randomness or model; the parent object is never mutated (C01 deep-frozen parent, R29). The accepted
  construction (`constructEditGraphBody`) is re-run with the per-use exact source selections. Everything dependent is derived, never supplied:
  - placements, with downstream clips shifting and duration changing;
  - linked audio;
  - the cut's `atTicks` and join, operation identity and bound obligation;
  - clip-look extents and whole-output extents;
  - requirements, including the output-duration ceiling;
  - assessments, dependencies, readiness and identity (E01-E03, D04).

## 8. Root versus child validation (replay)

`validateAnyEditGraph` dispatches on record version:
- **0.2.0** replays from the Gate-5 decision exactly as accepted.
- **0.3.0** parses the revision schema, loads the exact parent and GraphDiff artifacts (bytes bound by their refs), validates the parent recursively
  down to the Gate-5 root, re-applies the diff and requires the result to be identical.

A child whose parent ref, diff, operation, derived timeline fields or operation extents change, or whose identity is coordinated-rehashed, is refused
structurally or by replay (`graph_replay_mismatch`) (F02, F03, R08/R12, R14). A child is not required to equal the original Gate-5 decision; it is
required to be exactly one authorized typed diff away from a valid parent.

`validateRepairRevision` additionally proves repair lineage from supplied bytes only:
- the child replays;
- its GraphDiff's origin is an exactly supplied RepairPlan;
- compiling that plan against that parent gives exactly that GraphDiff (`graph_diff_mismatch`, `repair_lineage_invalid`).

The plan's own bindings to the render, QC, report and evidence are proven by `validateRepairPlan`.

## 9. Exact time

All 3B time uses the 3A-F vocabulary: `ExactTime {value, rate}`, `canonicalTime`, `compareTimes`, `sameInstant`, `convertTime(exact)`,
`durationOf`, `tickTime` and `frameTime`. Budgets are exact durations; plan effects are exact durations and integer ticks and frames; the changed
region is integer ticks and frames on the exact output grid (`frameIndexAt`); the only floats are the legacy frame-table decode inside the
EditGraph's frame-authority check (`decodeLegacySeconds` plus `sameInstant`). Float time in a GraphDiff or proposal is refused (B01, A04, R09).

## 10. Dependency impact and exact changed region (`deriveDependencyImpact`)

The impact is derived from the exact parent and child graphs, their DAGs and programs, and the GraphDiff. It refuses a child of another diff, a DAG
of another graph or a program of another DAG (G04). It records:
- per-track clip changes: `unchanged`, `source_changed` or `placement_shifted`;
- operations, matched by the obligation they were resolved from;
- the exact changed region, basis `first_changed_output_instant_to_end_contiguous_track_v0`. That is the first output instant where parent and child
  content can differ, computed from clip source and placement and operation extents, and conservatively extended to the end of both outputs
  because the V0 track is contiguous;
- every DAG node matched one to one: `computation_preserved` exactly when the computation identity is equal;
- globals: the sequence, composition and final encode, with the whole-output assembly always recomputed;
- segment decisions: reusable exactly when the identical segment computation identity exists in the parent program;
- retired parent segments and counts.

Tail trim of A in `cut_ab` (G01): parent region [1.5 s, 4 s) = frames [45, 120); child region [1.5 s, 3.5 s) = frames [45, 105). DAG: video 0, audio 0,
cut sequence, composition and final encode changed; video 1 and audio 1 preserved; B's node id changes while its computation identity is preserved.
Segments: 0 recompute, 1 reusable. Head trim of the interior clip of `three_abc` (G02): A unchanged and reusable, B recomputed, C shifted and reusable.
The region starts at frame 30. The B→C join moves from frame 60 to 54 and the A→B join stays at 30. The root computation changes. A whole-output
look (G03) marks its DAG node and every global node changed, while the untouched segment stays reusable, because the look is applied only in the
assembly (R27).

## 11. Computation identity

The accepted identities are unchanged and lineage-free. A segment computation identity binds executor semantics, executor, runtime, environment,
intent, source content hash and frame table, the exact frame and sample interval, the clip look and the output resolution, frame rate and pixel
format. It never binds placement or the whole-output look. So B keeps `render_segment_computation_v0_6a157fab…` as a revision-0 segment and after A
is trimmed (H01). Another runtime build or other source bytes give another identity (H02). The render computation identity and the DAG root
computation change for the child (H01). The output audio layout and rate are not in the segment identity, but the conformance probe requires the
staged source's layout and rate to equal the program's. Reuse additionally requires the certified intermediate's exact byte shape, including channels
and rate (§13).

## 12. Localized recomputation — what "localized rerender" means in 3B

For one permit, `executeAuthorizedSegmentedRender` runs the program as:
- **segment stages**: one pinned FFmpeg process per segment to compute. It reads the segment's one verified staged source (fd only) and runs
  exactly the one-pass segment chain (I04 checks the argv against the one-pass argv). It writes the segment's exact rendered frames as raw
  planar yuv420p (frames × W × H × 1.5 bytes) and its linked samples as raw little-endian float (samples × channels × 4 bytes), each to one pending
  fd-only artifact bounded to its exact byte count (I05). Intermediates are lossless; nothing is encoded twice;
- **one assembly**: every segment's verified intermediate in timeline order (fd only), `setsar=1/1` per input, the one-pass concatenation,
  whole-output look, time bases, output audio format and the identical encode tail (I04). The final encode always runs.

Nothing is byte-patched and no final receipt, QC or observation is ever reused for a new hash.

Localized means that only segments whose computation identity is not certified are recomputed. In the scenario that is one stage process (A)
instead of two, while B's intermediate is reused. It does not mean the final output is patched or that less than the whole output is encoded.
Segmented and one-pass execution of the same program are byte-identical, proven on actual media for the parent and the child (M01).

## 13. Trusted segment reuse

- **Plan** (`planLocalizedExecution`, pure). A segment is reused only when a prior **segmented** (0.2.0) success receipt certifies the identical segment
  computation. That prior must be in the same scope, executor, runtime, environment, intent, renderer semantics and segmented-execution semantics
  digest, and its independent Technical QC must pass and link exactly (receipt, render computation, DAG, program, output identity, observed
  identity, scope). The certified intermediate must be exactly this program's byte shape. Anything else refuses `segment_reuse_authority_invalid`:
  failed or missing QC, QC of another receipt, a one-pass receipt, another scope, or a re-identified receipt that no longer matches its QC (I02, R22,
  R26). No prior means everything is computed.
- **Store** (runtime-owned, under the claim's runtime root):
  - `render-segments/<sha256>.yuv|.f32` are immutable, content-addressed and sealed read-only.
  - `render-segment-records/<segment-computation-hex>.json` holds one durable `SegmentArtifactRecord` per computation. The trusted adapter
    publishes it once, without overwrite, after the stage completed and its outputs verified. It binds computation, intermediate-format digest,
    executor, runtime, environment, intent, exact shape, byte identities and production evidence (start, claim, program, position, argv digest,
    FFmpeg digest).
  - Both namespaces must be real directories resolving exactly under the runtime root; a link or junction is refused `segment_store_invalid` (M03).
- **Verification before the execution start** (stage `segment_verification`; the claim is not consumed):
  - for each planned reuse the durable record must be intact (canonical bytes, self-identified; otherwise `segment_artifact_corrupt`);
  - it must be exactly the certification and this program's shape and execution identity (`segment_artifact_mismatch`);
  - its bytes are verified by exact size and full SHA-256 through the handle the assembly will inherit (mutated or substituted →
    `segment_artifact_corrupt`, M02);
  - an absent record or artifact is not a hit: the segment is recomputed and counted as `reuseUnavailable` (M02).
- **Bounds:** at most 4 GiB of new intermediates per execution and 32 GiB of store (hard; owner options may only lower them). The per-execution bound
  is checked from exact byte shapes before the store is read (`segment_store_bound_exceeded`, stage `reuse_planning`, M03). Both bounds are checked
  again at `segment_verification`, once unavailable reuses and the store's current size are known and still before any process runs. There is no
  eviction; a full store refuses.
- **After every process:**
  - staged sources are verified in full before the start and through a fresh handle before each consuming stage, and re-hashed after its exit;
  - every intermediate the assembly read is re-hashed after its exit; a change → `segment_input_mutated_during_execution` with nothing published
    (M03);
  - a computed intermediate is published only while its pending name is still the verified object, and an existing content-addressed name must
    hold identical bytes;
  - an existing durable record naming other bytes for the same computation → `segment_artifact_conflict` (a non-reproducible computation or an
    altered store).
- **Failure recovery:** pending intermediates are never trusted and are removed; reused intermediates stay immutable; a failure record (0.2.0) states
  the stage, the processes that ran, the verified segments and truthfully whether an output was linked. A final receipt exists only after a completed
  assembly, verified publication and accounting.
- **Residual (disclosed):** a caller-supplied prior receipt and QC are records, not signatures. What makes reuse safe is that the durable record and
  the bytes live in the runtime root, which the trusted adapter alone writes. Anyone able to write that root can forge a coherent record plus bytes;
  that is the same trust domain as the accepted runtime's staged objects and outputs.

## 14. Actual synthetic repair scenario (M01) and the final actual-media acceptance receipt

Synthetic authorized media only, generated per run by the accepted pinned-FFmpeg fixture generator. Source A is a `testsrc2` pattern with a
440 Hz tone and a black tail from 1.5 s; the black tail comes from the option-gated `blackFromSeconds` addition to the accepted generator, whose
output is unchanged when the option is absent. Source B is a solid colour with a 660 Hz tone. The parent is A[0 s, 2 s) → cut → B[1 s, 3 s): 120
frames at 30 fps, 180×320. Every render goes through the accepted chain (registration, claim, staging, lifecycle, runtime and conformance probes,
permit, pinned FFmpeg, publication, independent QC) as its own claimed attempt. The critic is the accepted deterministic `near_black_frames` check
over actual decodes, including a whole-output drill-down observation. No speech or transcript is involved.

Final-run evidence: `batch3b-final-m01-repair.json` (sha256 `38bb1da8f75191e7084aa093063733dab35be49782df3497ba565c2baeec1acc`), a copy of the run's
`.test-artifacts/phase5-gate7-batch3b/m01-repair.json`.

| Item | Final-run value |
|---|---|
| Parent EditGraph | version **0.2.0**, revision **0**, `edit_graph_v0_cb4f061cd7e1cd35d9fbc13edac714c272af8474d3338cfa2a5bff72ae710056` |
| Parent DAG / program / render computation | `execution_dag_v0_b670a54c…62d9` / `render_program_v0_35f7feb7…f2e9` / `render_computation_identity_v0_44409f6a…b181` |
| Parent final output | `694529831955ecffd81ae6bc6e4e161d656d0065724f79b03343beab35fa42d3`, 137,307 bytes (segmented, all segments computed); the accepted one-pass render of the same graph produced the identical object (`existing_output_reverified`) |
| Parent Technical QC | `technical_media_qc_receipt_v0_d2ce86de…6ff5`: PASS |
| Parent CriticFinding | `critic_finding_v0_ca5fd2e960077ea40f78d83ebc2a7d746f2cfbb9f734bf857661a88a9c4261b5`: `near_black_frames`, measured, output frames **[45, 60)**; evidence is 8 frame references in `editorial_observation_v0_47b43399…0974`; report `critic_report_v0_72aa6063…18e6` over 7 observations of exactly these bytes |
| RepairPlan | `repair_plan_v0_d4009cf2234ef370e5da8c29a02d137a405d99e60dfc750d42d4bfa92e12edbb`: attempt 1 of 2; keep A's source [0, 3/2 s); removed output frames [45, 60); affected output [1.5 s, 4 s), exact duration 5/2 s |
| GraphDiff | `graph_diff_v0_a1e369f3d0ce0ad08bbebfaf3bc7d293723cad360eb4bf9ba511012c06079c5c`: one `trim_clip_source_range`, expected [0, 2 s) → replacement [0, 3/2 s) |
| Child EditGraph | version **0.3.0**, revision **1**, `edit_graph_v0_a319078c8c51e54c5e5658f878479a3548a429955eea996641bb611f266eb765`; parent = the exact 0.2.0 graph above (sha256 `4ee72af7…e13e`), revision 0. Validated through its whole lineage (`validateRepairRevision`) |
| Exact changed region | parent [1,500,000,000, 4,000,000,000) ticks = frames [45, 120); child [1,500,000,000, 3,500,000,000) ticks = frames [45, 105) (impact `dependency_impact_v0_42df1e2c…5e1b`) |
| Child DAG / program / render computation | `execution_dag_v0_e67ce15c…5e9a` / `render_program_v0_6446c678…ee2e` / `render_computation_identity_v0_a23b7d4b…fe55` |
| Segments recomputed | position 0: `render_segment_computation_v0_cc553b0988df4a21fa5336fd726a501bdadf9d8bfe40967a6bcb7707337e58a9` (A, 45 frames), computed by one stage process and published (record `segment_artifact_record_v0_3aad573c…2124`) |
| Segments reused | position 1: `render_segment_computation_v0_eb7282391a6df40497a4e145010ebae12468f2b7aa13cf5b5d4f838f3ca02213` (B), the same identity as the parent's position 1. It reused exactly the parent's verified intermediate: record `segment_artifact_record_v0_66218c61…04c7`, video `c09862d9…d132` (5,184,000 bytes), audio `09f74900…5a32` (768,000 bytes), re-verified in full. Retired: the parent's position-0 identity `…5b64295c…3363` |
| Child final output | `ae334bf9fbe530caf5b8552890d854d677826130b88325b4bb3a87eb727a2b0a`, 127,628 bytes: **differs from the parent**; the accepted one-pass render of the child graph produced the identical object |
| Child Technical QC | `technical_media_qc_receipt_v0_8f70da3f…1a39`: PASS (a new receipt, never the parent's) |
| Child post-repair observation | 7 new observations of exactly `ae334bf9…2b0a` (`editorial_observation_v0_11000255…`, `…15915500…`, `…86df6010…`, `…cc922338…`, `…41d6ffd1…`, `…da93bde9…`, `…11647420…`), including a whole-output drill-down; report `critic_report_v0_2c99bc8d…3417`: **0** near-black findings anywhere in the output |

Decoding the child's actual bytes shows 105 frames: output frames 0-44 are source A frames 0-44 (none solid) and frames 45-104 are source B frames
30-89 (solid). The dominant audio tone switches from 440 Hz to 660 Hz at 1.5 s. The deterministic defect is no longer present. Everything beyond
this mechanical check (editorial quality) is not claimed.

M02 and M03, also actual media, prove on real files:
- an absent intermediate is recomputed, and the output is byte-identical;
- a mutated, substituted or forged intermediate or record is refused before the execution start, with nothing published;
- a junction-redirected store is refused;
- the owner's per-execution bound refuses before any process runs;
- an intermediate changed between verification and assembly is refused after the assembly exits, with nothing published.

## 15. Second acceptance scenario (pure)

Repairing one interior clip of the three-clip `three_abc` edit (head trim of B from [30, 60) to [36, 60) source frames), G02 and G01 prove:
- unrelated segment work is reusable: A unchanged, C only shifted;
- downstream placement is recomputed: C moves 0.2 s earlier and the duration becomes 2.8 s;
- the affected join moves exactly, from frame 60 to 54 (ticks 2,000,000,000 → 1,800,000,000), while the A→B join stays at frame 30;
- the root computation changes.

## 16. RED/GREEN history

Every receipt below is under `.local-runs/phase5-gate7/` and was written once.

1. **First RED, before any production behaviour** (`batch3b-first-failure.md`): the 3B pure suite (then 34 tests) ran 0 pass / 34 fail against
   skeleton contracts whose functions threw "not implemented" (`batch3b-first-red.log`, `b0447b99…`). The media suite failed 3/3 the same way
   (`batch3b-first-red-media.log`, `e67983c9…`). F01's sub-cases were confirmed equal to the baseline invariants on the unmodified build
   (`batch3b-first-red-f01-subcases.log`, `3d0d9959…`). K01's first red came from skeleton comment wording ("subprocess." matched its purity
   regex); the wording was changed and disclosed.
2. **Implementation, then first GREEN** (`batch3b-first-green.md`): pure 34/34 (`batch3b-first-green-pure.log`, `ced97692…`) and media 3/3
   (`batch3b-first-green-media.log`, `1410fba0…`) at one source state (`batch3b-first-green-source-hashes.txt`, `7a2482e8…`). Test corrections
   between RED and GREEN are disclosed there; none weakens an expectation:
   - A02's failed-QC case now uses a genuinely failed QC receipt and adds the flipped-verdict forgery (`technical_qc_invalid`);
   - B02 and F02 supply a foreign parent with its own valid chain, because two fixture chains hold different bytes under the same ids and can
     never be supplied together;
   - F02 asserts that its structural forgeries are refused by the revision schema itself.
3. **Hostile review** (§17): 14 attack tests, written after the first GREEN, ran against the unrepaired build: 46/48
   (`batch3b-hostile-red.log`, `fde4b2ae…`). Two defects were self-found, each with its own RED receipt
   (`batch3b-hostile-d1-artifacts-after-await-red.md`, `batch3b-hostile-d2-uncertainty-evidence-red.md`):
   - **D1:** caller artifacts were read after the planner's await;
   - **D2:** planner uncertainty evidence was never checked.

   One-file repair (`packages/edit-repair/plan.ts`), GREEN 48/48 (`batch3b-hostile-green-pure.log`, `ac68fea1…`) and media 3/3
   (`batch3b-hostile-green-media.log`, `00e74acf…`) (`batch3b-hostile-d1-d2-green.md`).
4. **Regression triage** of every accepted suite before the final run (`batch3b-regression-triage-summary.txt`). The four accepted pin tables failed
   as expected (Batch 1, 2A test 03, 2B B01, 3A R01). One real regression was found:
   - **D3:** 3B's in-place `export` of `EditGraphBodySchema` made the accepted Batch-2A import-closure scanner read `"join_from", "` as an
     import (2A test 103).
   - RED `batch3b-regression-d3-2a-red.log` (`07f6d879…`) with receipt `batch3b-regression-d3-import-scan-red.md`.
   - Repair: restore the accepted declaration line and export it with a separate statement; the accepted test is unchanged.
   - GREEN `batch3b-regression-d3-2a-green.log` (`96a5778d…`) with receipt `batch3b-regression-d3-import-scan-green.md`.
   - Under the 3B code the accepted 2B and 3A actual-media outputs were identical to the pre-3B snapshot.
5. **Coverage strengthening** (test-only, after the hostile GREEN): G02 now also asserts the second acceptance scenario's exact join movement and
   root-computation change, and M01 persists the parent's and child's observation ids. Both passed in the D3 GREEN build.
6. **Pins last**, from final bytes, in chain order Batch 1 → 2A → 2B → 3A (`batch3b-pin-update.json`): 33 SHA-256 replacements in the four
   accepted pin tables, plus the 3A package-count literal (render 10 → 11, graph 7 → 8, for the two new 3B modules). A re-check found 0 stale of
   114 pins (`batch3b-pin-check.json`). No other line of an accepted test changed.
7. **Final run** (§22).

## 17. Hostile self-review (R1-R34)

Attacks were written after the first GREEN and run against the unrepaired build (`batch3b-hostile-red.log`, 48 tests: 46 pass, 2 fail).

| Item | Attack | Result |
|---|---|---|
| R1 | critic output mutates the graph | R01: planning over deep-frozen graph, receipt, QC, report and observations leaves them byte-identical; only `edit-graph/revision.ts` and `edit-repair/revision.ts` call `applyGraphDiff`; `edit-review` cannot reach the mutation path. No defect. |
| R2 | RepairPlan mutates arbitrary fields | R02: an extra action field, a top-level patch, an unregistered action or a float keep is not a plan and never compiles; a plan compiles only to typed trims. No defect. |
| R3, R30 | arbitrary JSON pointer; future operation silently ignored | B01, R03: JSON-patch shapes and future operations are refused whole on create and on apply, never partly applied; a pointer field is invalid. No defect. |
| R4, R5, R6 | wrong graph; newer revision; applied twice | B02, C02, C03, R04: parent, revision and bytes bound; a stale diff and re-application to the child are refused; a plan for revision 0 never compiles against revision 1 or another graph; a plan re-identified with another output, finding region or attempt does not replay. No defect. |
| R7 | repair extends source authority | D02, A04: refused (`graph_diff_outside_authorized_range`, `repair_action_invalid`). No defect. |
| R8 | repair changes content hash | D01, R08: the child keeps asset and hash; a substituted source field in an operation is invalid; a forged child with another hash is refused. No defect. |
| R9 | float time | B01, A04, R08: float, seconds and millisecond forms are refused. No defect. |
| R10 | frame misalignment | D03: off-frame and unrepresentable endpoints are refused; nothing is snapped. No defect. |
| R11 | sample misalignment | Not reachable with V0 grids: fixtures express integer frame rates, and at 30 fps every frame is exactly 1,600 samples at 48 kHz (1,470 at 44.1 kHz). The accepted program compiler refuses any non-sample-exact boundary (`audio_sample_boundary_not_exact`). D04 proves the exact samples of the repaired child: 0..72,000 and 48,000..144,000. No defect; not attacked at runtime. |
| R12 | linked video and audio diverge | D04, R08: linked audio mirrors the repaired clip exactly; a forged divergent child is refused. No defect. |
| R13, R14, R15 | stale cut, effect extent, duration | E01, E02, F02, R14: re-derived; forgeries refused. No defect. |
| R16, R17 | coordinated rehash; replay ignores parent bytes | F02, F03: refused by replay or exact parent bytes. No defect. |
| R18, R19 | unchanged segment invalidated; changed segment reused | G01-G03, H01, I01, M01. No defect. |
| R20, R21 | cache path substitution; bytes changed after validation | M02 (substituted and mutated bytes, forged record), M03 (junction-redirected store, bytes mutated between verification and assembly). No defect. |
| R22 | identity matches but runtime or executor differ | H02, R22: identities differ; a record of another runtime is a mismatch; a prior of another executor certifies nothing. No defect. |
| R23, R24, R25 | stale final receipt, old QC, old observation reused | R23: the child's repair refuses the parent's receipt, QC, report and observations; M01: new receipt, QC and observations of the new hash. No defect. |
| R26 | content changed, hash or receipt did not | R26: an output identity that is not its bytes is not a receipt; a coherent rewrite no longer matches its QC. The accepted QC re-probes and re-hashes independently. No defect. |
| R27 | whole-output effect under-invalidated | G03, R27: the look node and all globals recompute; the look runs only in the assembly, never in a stage. No defect. |
| R28 | shift treated as content change, or vice versa | G01, G02, H01: shifted segments stay reusable and changed ones recompute. No defect. |
| R29 | new revision aliases parent | C01, R29: scribbling every field of the child, a plan or a validated plan leaves the parent, diff and inputs unchanged. No defect. |
| R31 | budget exceeded by many small operations | A03: operations, clips, trim, affected output, explanation and plan bytes bounded. No defect. |
| R32 | provider output smuggles instructions | A04: commands, filters, shell fields, paths, URLs and control characters are refused. **Defect D2 (self-found):** planner uncertainty evidence was never checked, so an invented evidence reference was recorded as provenance. Repaired (§16). |
| R33 | unbounded retry or review loop | A06, R33: attempts derive from the lineage and are bounded; the planner is called exactly once; nothing retries. No defect. |
| R34 | RevisionLedger or EditorialState implemented | K01. No defect. |
| sweep | caller state read after an await | **Defect D1 (self-found):** `planRepair` passed the caller's artifact array to the trim check after the planner's await. Repaired (§16). The segmented adapter snapshots its options at entry and reads only permit-private state afterwards. |

## 18. Performance (measured on this machine, final run; no extrapolation)

All numbers are from `batch3b-final-m01-repair.json`. "Adapter wall" is the test's clock around one execution call, covering verification,
hashing, publication and every process. "Process wall" is the receipt's measured spawn-to-exit time summed over its processes.

| Measure | Parent (segmented, cold) | Child (segmented, 1 reuse) | Parent one-pass | Child one-pass |
|---|---|---|---|---|
| Segments / reused / recomputed | 2 / 0 / 2 | 2 / **1** / **1** | — | — |
| Segments eligible for reuse (derived impact) | — | 1 of 2 | — | — |
| Reuse ratio; cache hits / misses (planned reuse unavailable) | 0‰; 0 / 0 | **500‰; 1 / 0** | — | — |
| FFmpeg processes | 3 (2 stages + assembly) | **2 (1 stage + assembly)** | 1 | 1 |
| Adapter wall | 1,047 ms | 784 ms | 400 ms | 374 ms |
| Process wall (sum) | 352 ms (47 + 45 + 260) | 294 ms (56 + 238) | — | — |
| FFmpeg-reported CPU (sum) / peak commit (max) | 328 ms / 42,076 KiB | 297 ms / 41,720 KiB | — | — |
| Intermediate bytes written by stages | 11,904,000 | 4,464,000 | 0 | 0 |
| Intermediate bytes reused (verified, not rewritten) | 0 | 5,952,000 | — | — |
| Bytes hashed for verification | 35,712,000 | 25,296,000 | — | — |
| Final output bytes | 137,307 | 127,628 | 137,307 (identical object) | 127,628 (identical object) |
| Technical QC | 534 ms | 535 ms | — | — |
| Observation (7 decodes) | 1,219 ms | 1,209 ms | — | — |

Decoded frames and samples are not measured. The derived lower bounds:
- the child's one stage renders 45 frames and 72,000 samples, where the parent's two stages rendered 120 frames;
- each assembly decodes the whole output's raw intermediates (105 or 120 frames) and encodes the whole output.

FFmpeg's own `-benchmark` reported 0 ms CPU for the two short parent stage processes; that is recorded as reported.

**Reading, stated plainly:**
- Localized reuse removed one of two stage processes and 5,952,000 bytes of recomputation.
- At this tiny synthetic scale (4 s, 180×320), segmented execution is still about twice as slow end to end as one-pass execution. Raw
  intermediates, full SHA-256 verification (several times each) and an extra process cost more than the one 2-second segment saved.
- Reuse is therefore demonstrated as correct and measured, not as a speed-up. Whether it pays off for longer or heavier segments is not measured
  here and is not claimed.

## 19. Accounting

The accepted accounting rule and the owner's local-execution ruling are unchanged. A segmented receipt's measurements are the aggregate of its own
processes: wall-clock and FFmpeg-reported CPU times sum over the sequential processes, and the FFmpeg-reported peak is the largest single process peak
(a missing report stays missing). The receipt schema recomputes the aggregate and the accounting from the listed processes, so a relabelled value
fails. **Disclosed interpretation for owner review:** applying the owner's ruling (which names one executor build, environment and runtime) to a
multi-process execution of that same build, with sums and a maximum as above.

Reuse is never zero cost. The receipt records, per segment, the bytes hashed and the verification time, and the reuse summary counts:
- segments reused, computed, and planned reuses that were unavailable;
- stage and assembly processes and the reuse ratio;
- verification bytes hashed and intermediate bytes written;
- reuse verification milliseconds.

The derived work dimensions (frames, pixel frames, audio) remain the whole output's, because the assembly decodes and encodes the whole output. How
many bytes FFmpeg itself reads is not measured (unavailable).

## 20. Limitations and residuals

- Synthetic media only; the repair planner is a deterministic fixture rule, not a model; no semantic-critic model ran. Professional editing quality,
  real-footage generalization and autonomous repair quality are not claimed.
- One repair primitive (exact trim of a video clip use); linked audio follows. No second primitive was needed; the optional color-look primitive was
  not implemented.
- The GraphDiff origin is provenance at the graph layer: admission requires graph replay, not repair lineage. `validateRepairRevision` proves the
  plan-to-diff lineage when required. A diff made directly by code (tests' mechanical diffs) is still bound by every graph authority rule.
- Segment reuse requires a prior segmented receipt and the durable record in the same runtime root; the trust residual is described in §13. A durable
  record replaced by a different record for the same computation refuses reuse from the older certification (fail closed) rather than recomputing.
- Performance at this tiny synthetic scale favours one-pass execution (§18). Raw intermediates are large (86,400 bytes per 180×320 frame) and bounded
  by §13's limits; there is no eviction.
- Downstream records keep their versions with a widened revision field (§5, disclosed).
- `RENDER_IMPLEMENTATION` (`gate7_batch2b_edit_render` 0.1.0) remains the recorder identity of every edit-render record, including the new segmented
  records. The segmented strategy is identified by its own semantics digest `SEGMENT_EXECUTION_SEMANTICS_DIGEST`.

## 21. Future seams (not implemented)

- More typed GraphDiff operations (the union and the repair actions are registries): each needs its own validated semantics and impact rules.
- Editor-origin GraphDiffs (a second origin kind) with their own authority rules; Batch 3C's version-aware conversational interaction builds on the
  compare-and-swap semantics here.
- Multi-step autonomous repair loops on the bounded single cycle and derived attempts.
- Store eviction and cross-root reuse would each need their own trust design.

## 22. Final verification (historical: the implementation's bytes, before the owner-review repair; see §26)

Sequential run under `node --import ./scripts/no-network.mjs --test`, started 2026-09-28T15:21:30Z and finished 16:14:25Z, HEAD
`db04f2ed97844bb149fc8f642b423c3adf56776e`.
- Summary: `batch3b-final-gates-summary.log` (`571baf84f06a3c681bd12c72f7cdfe898d43485cdadb65e0d8925879b3dd4af2`); each gate has its own
  `batch3b-final-<gate>.log`.
- The 39 changed or added non-owner files hashed identically before and after the run: `batch3b-final-source-hashes-before.txt` =
  `batch3b-final-source-hashes-after.txt` = `18a1b0568db0694291a51f191623c06bff8adaa673e3b7e15a7528d1b08514e2`.

| Gate | Tests | Result | Seconds |
|---|---|---|---|
| `npm run typecheck` | — | PASS (exit 0) | 13 |
| `npm run build` | — | PASS (exit 0) | 15 |
| **3B pure** (`edit-repair.test.js`) | 48 | **48/48** | 306 |
| **3B actual media** (`edit-repair-media.integration.js`) | 3 | **3/3** | 97 |
| 3A-F (`edit-time.test.js`) | 35 | 35/35 | 81 |
| Batch-3A pure (`edit-review.test.js`) | 46 | 46/46 | 231 |
| Batch-3A actual media (`edit-review-media.integration.js`) | 8 | 8/8 | 84 |
| Batch-2B pure (`edit-render.test.js`) | 43 | 43/43 | 38 |
| Batch-2B actual media (`edit-render-media.integration.js`) | 34 | 34/34 | 219 |
| Audit policy (`edit-render-audit.test.js`, `workspace-boundary.test.js`) | 10 | 10/10 | 35 |
| Batch-2A (`edit-runtime.test.js`) | 130 | 130/130 | 124 |
| Batch-1 (`edit-execution.test.js`) | 81 | 81/81 | 727 |
| Gate 6 (`edit-graph.test.js`) | 79 | 79/79 | 161 |
| Gate 5 (`planning.test.js`) | 97 | 97/97 | 206 |
| Routing (`budgeted-perception-routing.test.js`) | 33 | 33/33 | 1 |
| Compatibility (the accepted 16-file set) | 377 | 377/377 | 16 |
| Legacy seams (`contracts`, `integration`, `jobs`, `telemetry`) | 39 | 39/39 | 1 |
| **Full safe suite** (`npm test`: clean build + every `dist/tests/*.test.js`) | 1015 | **1015/1015** (967 accepted + 48 Batch-3B) | 817 |
| `npm run audit:workspace` | — | PASS: 122 application files (114 + the 8 new 3B modules); 15 adapters, 9 subprocess-capable (unchanged set); 5 test harness process files | 1 |
| `git diff --check` | — | PASS (no output) | 0 |

Every suite reports 0 fail, 0 cancelled, 0 skipped and 0 todo.

**Accepted actual media under the 3B code** (`batch3b-final-media-comparison.json`,
`ad73cb35676778401ad1939224683fdd9802c160bf03727e54632be82146fece`; pre-3B snapshot `batch3b-pre-regression-test-artifacts/`) is identical to the
accepted code's last run:
- every content hash of the canonical render and the determinism pair;
- all six look renders;
- all 30 Batch-3A observation computation identities (14 + 8 + 8) with their rendered and source content hashes.

## 23. Protected bytes, dependencies, network, owner files

- **Preservation** (`batch3b-final-preservation.json`, `3db047bbde5449432e66bfbe16669b3f30db2481f859b4e0ff1051ce9fe3cba7`), taken after
  `CURRENT_PHASE.md` was written:
  - HEAD `db04f2ed…` and nothing staged.
  - Of 312 tracked files exactly 28 changed, all in the expected set: 21 production files, 2 test support files, 4 accepted test files (pins and
    one count literal only) and `docs/CURRENT_PHASE.md`. The other 284 are unchanged, including `packages/contracts/*`,
    `packages/edit-render/semantics.ts` and `probe.ts`, the runtime package, Gate 5 and every accepted `docs/phases` report.
  - All 676 earlier Gate-7 receipt files are unchanged.
- **New untracked files:** this report, `packages/edit-graph/revision.ts`, `packages/edit-render/localized.ts`, `packages/edit-repair/` (6 files),
  `tests/edit-repair.test.ts`, `tests/edit-repair-media.integration.ts` and `tests/support/edit-repair.ts`, plus ignored `batch3b-*` receipts.
- **Dependencies:** none. `package.json` and `package-lock.json` are byte-identical. The new code uses zod, `node:crypto` (pure packages) and the
  adapter's already-granted Node modules.
- **Network:** every test ran under `scripts/no-network.mjs`. No model, provider or paid service is used or required.
- **Owner files:** the 17 owner files (`CLAUDE.md`, `gate5-*.txt`, `gate6-*.txt`, `gate7-*.txt`) are unchanged by name, size and modification
  time. They were only `lstat`ed, never opened, read, hashed, modified, staged or deleted.

## 24. Files (historical: the implementation's final bytes; §26.7 lists the owner-review changes)

| File | Change | Lines | SHA-256 |
|---|---|---|---|
| `packages/edit-execution/admission.ts` | modified: graph reference revision widened; validates 0.2.0 or 0.3.0 by record version | 360 | `548b0248bffa51887e9f38155d5e5a30e1712a5146af04fdfe097da30e3ab972` |
| `packages/edit-execution/dag.ts` | modified: graph reference revision widened; reads 0.2.0 or 0.3.0 by record version | 362 | `22f6fe539f935f7054e67c2e4a54cf84f4781eb09c96276a71c3563984ea86d7` |
| `packages/edit-execution/grant.ts` | modified: graph reference revision widened | 61 | `5b2c53676327f5c353a4aedfc6f0017ee009ced11d3d11539850c5d8da004828` |
| `packages/edit-execution/workload.ts` | modified: accepts either EditGraph record (type only) | 65 | `599cbabff5fba8cfc968c51236bc1b71189d1a65716ad7b91d4d0471e770f325` |
| `packages/edit-graph/common.ts` | modified: revision record version and eight GraphDiff refusal codes | 268 | `dc191f3bde02fb4ef63d3b615403271f281095ad22a3630e2641988997b43968` |
| `packages/edit-graph/graph.ts` | modified: construction takes exact per-use source selections; body schema shared with 0.3.0; 0.3.0 refusal message | 560 | `1ab3927412a52e59550e9c019032a0e02156a64fd95e3452b185d58031110da6` |
| `packages/edit-graph/index.ts` | modified: exports the revision API | 14 | `fdfb2cfd98dbb6d0c2e9f35b8339df8b586cb85652d8b3b7174bf5fb098796bf` |
| `packages/edit-graph/revision.ts` | **added**: GraphDiff 0.1.0, EditGraph revision 0.3.0, pure application, trim rule, replay | 191 | `218f1bc9ed9e85a09d63ef8d222fd2a1b82b99a9262ddaeb4cb92fa02660d9bd` |
| `packages/edit-render/authorize.ts` | modified: binding revision widened | 194 | `860ff1e922ca454a392687a34496bfa25f1e25f5ec61e753c08a2f842a0725a2` |
| `packages/edit-render/common.ts` | modified: eight segment refusal codes | 101 | `b449777d5bf9800ae109e8f2a3185128691d724e5eeefa1747b31316f097e549` |
| `packages/edit-render/ffmpeg.ts` | modified: one-pass compiler factored into shared chains (argv byte-identical); stage and assembly compilers | 161 | `fc7937654bca17cf5c4005ea730aba0801559fee84eee6ca41a419ec9f24f98a` |
| `packages/edit-render/index.ts` | modified: exports | 36 | `3ff1f341a0b10c005aafcf4f55c43c6716699ff4d6ff664ba59ed25b08437fb7` |
| `packages/edit-render/localized.ts` | **added**: segmented-execution semantics, intermediate shapes, durable segment records, reuse plan | 196 | `51c3bbf3a5cc2576295074b4953e54604333cd9bfdcc1cc67baa8c4fbda80551` |
| `packages/edit-render/program.ts` | modified: binding revision widened | 218 | `f0f927b7c4b6b730125d6d13fb488ab7e96a611661251ba7ce9f60340ac3d7e5` |
| `packages/edit-render/qc.ts` | modified: accepts either receipt version | 144 | `c45108b328ec989d088b91f5c7f9581bab9a6c22da3cb315b0283bc754e7d855` |
| `packages/edit-render/receipts.ts` | modified: RenderExecutionReceipt / Failure 0.2.0 (segmented) and builders; revision widened | 544 | `d2648db64db5375fe39ffa2c4190a10e65381311a96a8d2607f06019a80e0678` |
| `packages/edit-render/records.ts` | modified: reads either EditGraph record | 251 | `6e9f43e90b21af5fd42c3dfcc48b7f4fcc0b261f3adba5b31c40235214ab1e2b` |
| `packages/edit-repair/common.ts` | **added**: envelopes, hard limits, 27 owned refusal codes | 65 | `814e87a805ec60ed9ea50883a790dae2c014ac7e93659c9d527ca2a9bb6b0c37` |
| `packages/edit-repair/impact.ts` | **added**: derived DependencyImpact | 169 | `d965de043db585b13084906d1eabe159d1e7f104e4257da0c9043ce536fb24fa` |
| `packages/edit-repair/index.ts` | **added**: exports | 12 | `04b900ab37495ccc369d6fa6eb4535c393d43166010501665d93573eb5fb2c4a` |
| `packages/edit-repair/plan.ts` | **added**: RepairPlan, model-neutral planner port, planning and replay validation | 261 | `c0c8f06f0ec6261b09630c8fcf37b49992a9a9b7b4ba829fabd7ab5d0850bfe9` |
| `packages/edit-repair/policy.ts` | **added**: RepairPolicy | 28 | `c4192e8242a741b0d5de77a31fbc2e95e3e885f93668de2e0d2418ff0b7ae856` |
| `packages/edit-repair/revision.ts` | **added**: plan → GraphDiff compilation, application, repair-lineage validation | 53 | `5a56a66958826523be5e6ae7b3ea55173d23a197c9e8b9174d1d1459025b169a` |
| `packages/edit-review/critic.ts` | modified: revision widened | 308 | `511d92ed193bd325d99dba8a917e68420dda0fac31e2da33a4b7c3c0ae3904df` |
| `packages/edit-review/observation.ts` | modified: revision widened | 340 | `01440603efdf451108a0f6085230425b59dd3bf6f6022601b463bd1c72fa8f15` |
| `packages/edit-review/review.ts` | modified: accepts either receipt version; revision widened | 196 | `c63b5151e1f4451c497b8aba71ee964e8fe18863f71de158c91b11066da46b30` |
| `scripts/edit-media-qc-local.ts` | modified: QC accepts either receipt version | 194 | `b8705fe2c8b118a98ed8058c0faa4a7a6b6874adb646eb052c3a3f539c9836e0` |
| `scripts/edit-observation-local.ts` | modified: observation accepts either receipt version (type) | 214 | `53ed81687c29d480d4a5d459239b59b72d862e8a5c3f04830f2d58777a423aa1` |
| `scripts/edit-render-local.ts` | modified: segmented execution with trusted segment reuse (same permit, runtime, publication, receipts) | 964 | `ea6382e399f06bee39ff0ae4801f413abb47df9a5ad149a9d8edd16dae5db5fc` |
| `tests/edit-execution.test.ts` | modified: 3 pin replacements | 1468 | `648d494a27d757a2b5fb10505aaf8d138b3e58da3b6d5104fadcc13fdff1cbe1` |
| `tests/edit-render.test.ts` | modified: 5 pin replacements | 944 | `2f1af7c6ee3ccac9dffdde4f5cb964915d02dc926ceecd190140e5363b2a8439` |
| `tests/edit-repair-media.integration.ts` | **added**: 3 actual-media tests (M01-M03) | 288 | `0242ea08bec3119b6256ba2fb3c4ace2544b5e407484258188b35b0ffeeab104` |
| `tests/edit-repair.test.ts` | **added**: 48 pure tests (A-K, R hostile) | 877 | `3f5f2d587b4c91eed43b8eb06925aa8ed7fb72c49d887d122eb8dfe7ae7e3992` |
| `tests/edit-review.test.ts` | modified: 19 pin replacements and the package-count literal | 856 | `d87d35b4cbc9eb76f101a55f4e5006f9e1ff7bfb339335778e8b34640d7f9b0b` |
| `tests/edit-runtime.test.ts` | modified: 6 pin replacements | 1827 | `6df3b58eebef05223927c071fab66d770a39d5440d24b1634b67d082201be816` |
| `tests/support/edit-render-media.ts` | modified: option-gated black tail for the fixture generator (unchanged without the option) | 146 | `dd97eb64dc5ce12f024a4a50ef925caca81fe1557dcb52f2a8df573299d43e61` |
| `tests/support/edit-repair.ts` | **added**: fixture planner (not a model), reviewed chains, revision DAGs, on-paper segmented chain | 179 | `52ba8d537b4fd2da1b67634683191308999968c086108ea5f5ac349a73495f93` |
| `tests/support/edit-review.ts` | modified: exports its chain builders for reuse (order of operations unchanged) | 177 | `2cff6bfdda55e4fb4c5d2c6ffb99535f7c9f7de83fd389e3fc9f5f2a8c89a2b6` |

Documents: this report (new) and `docs/CURRENT_PHASE.md` (modified: new title line, one ruling bullet, one Batch-3B section; earlier sections
unchanged). Their final hashes are recorded in the closing receipt `batch3b-final-docs.sha256`, not in this report.

## 25. Final status (historical: the implementation checkpoint of 2026-09-28; superseded by §27)

| Item | Status |
|---|---|
| Baseline verified | PASS |
| Architecture V2 frozen | YES |
| Phase 5 Gate 7 Batch 3B implementation verification | **PASS** |
| Gate 7 Batch 3B owner acceptance | **PENDING** |
| Gate 7 overall | **NOT YET COMPLETE** |
| Batch 3C | **NOT STARTED** |
| Real user footage | NOT RUN |
| Professional editing quality | NOT VERIFIED |
| EditorialState, full RevisionLedger, conversational revision, motion / composition, professional AudioGraph, interactive preview, manual NLE | NOT IMPLEMENTED |
| HyperFrames | NOT INTEGRATED |
| Vibe editing | NOT YET COMPLETE |

Batch 3B stops here for independent owner review. No Batch-3C work was started.

## 26. Independent owner-review repair - 2026-09-29

An independent owner source review of the bytes above found one blocker. At the start of the review all 40 changed or added non-owner files hashed
exactly as `batch3b-final-source-hashes-post-docs.txt`. The blocker was reproduced test-first and repaired, and the rest of this record was
re-verified. Owner acceptance remains **PENDING**. Receipts are new, under `.local-runs/phase5-gate7/` (`batch3b-ownerreview-*`); no earlier receipt
was changed.

### 26.1 Finding OR1 (blocker): the repair authority chain could be bypassed

The only supported mutation chain (§3) is validated CriticFinding -> validated RepairPlan -> validated GraphDiff -> validated parent -> child.
On the bytes above, no execution-path check established RepairPlan provenance:
- the GraphDiff origin was only shape-checked (§7);
- execution admission validates a 0.3.0 graph by graph replay only (§20);
- `validateRepairRevision` checked diff = compile(plan, parent) over a schema-parsed plan but never replayed the plan's bindings, and no production
  code called it or `validateRepairPlan`;
- `issueExecutablePermit` issued a permit for any admitted revision.

The 3B tests themselves rendered children whose GraphDiff origin names a RepairPlan that exists nowhere (`PLAN_REF` in M02/M03).

RED (`batch3b-ownerreview-or1-red.md`): the new media test M04, run on the unchanged production bytes, got a permit and a real pinned-FFmpeg render
for every attack:
- an arbitrary GraphDiff, with and without the genuine parent bindings;
- a fabricated, self-identified plan that compiles exactly to its GraphDiff but addresses no finding (it rendered a new output, `fa0930ec...`);
- the genuine child under another owner policy, or with no lineage;
- a root graph carrying a spurious lineage.

### 26.2 Repair (the smallest the frozen layering allows)

Execution admission (`edit-execution`) sits below the repair layer, and accepted tests pin its import allowlist, so it cannot validate a RepairPlan.
The ExecutablePermit is the only object that authorizes FFmpeg, and its adapter may import the repair layer.

- `packages/edit-repair/revision.ts` and `index.ts`: `validateRepairLineage(child, artifacts, steps)` proves a revision's complete lineage down to its
  initial graph. At every revision it requires `validateRepairRevision` (the GraphDiff is exactly the compilation of its supplied plan against the
  exact parent) and `validateRepairPlan` against `steps[k - 1]`, the exact render of that parent: its validated DAG and artifacts, receipt, passing
  QC, critic report, the finding's observations and the owner's repair policy.
- `scripts/edit-render-local.ts` `issueExecutablePermit`: new optional `repair` input, read once before any await. A revision gets a permit only if
  the lineage of its exact admitted graph validates. An initial graph carrying a lineage is refused `input_invalid`.

No schema, record version, admission, graph, DAG, program, receipt or QC changed, and revision-0 paths are untouched. No rendered byte changed:
M01's parent `69452983...42d3`, child `ae334bf9...2b0a`, segment identities and intermediates are identical before and after.

GREEN (`batch3b-ownerreview-or1-green.md`):
- 3B media 4/4: every M04 case is refused with its exact code, nothing is published, and the genuine lineage is permitted.
- 3B pure 49/49: 48 plus R-LINEAGE, which covers an arbitrary diff, a fabricated plan, a foreign policy, another render's bindings, a missing step,
  and revision 2 validated down to the root.

Test changes: M01-M03 pass the genuine lineage, and M02/M03 derive their child through the genuine chain; `PLAN_REF` remains only as M04's attack.
Pins were updated last, with one replacement in 3A R01 (`tests/edit-review.test.ts`: `scripts/edit-render-local.ts` -> `530eb8d0...`). A sweep of
every `["path", "sha256"]` pin in all 60 test files found 0 stale of 135.

Measured cost: a revision permit now replays its whole lineage (several Gate-5 replays). M01 took 36.5 s, against 21.2 s before the repair.

### 26.3 Residuals after the repair (stated, not closed)

- Graph validation and admission still accept a revision whose origin is not a validated plan. They establish graph authority only: such a revision
  can be admitted, claimed and staged, but it is never permitted to execute. Enforcing repair provenance at admission needs an owner decision on
  package layering.
- Receipts, QC receipts and observations are records, not signatures (as in §13 and §20). A fully fabricated but coherent parent-render record set
  replays.
- The planner identity inside a plan is recorded, not authenticated. Authority comes from the owner policy and the exact finding.

### 26.4 Other review results

- **Documentation.** §5 listed TechnicalMediaQcReceipt among records whose graph revision widened. It has no graph revision: its schema is
  unchanged, and only its input accepts receipt 0.1.0 or 0.2.0.
- **Limitation (source reading; not demonstrated).** The 32 GiB store bound (§13, "hard") is a check made before each execution, not an atomic
  reservation. Executions that share one runtime root and pass it concurrently can exceed it by up to their new intermediates (at most 4 GiB each);
  later executions refuse. A planned demonstration was not run because of the memory condition in 26.6.
- **Limitation.** Segmented and one-pass output are proven byte-identical only for the untagged synthetic sources. Raw intermediates carry no
  per-frame color metadata, and staged-input conformance does not constrain color tags. Tagged footage is not verified.
- **Limitation.** Process wall time is the sum of strictly sequential process walls, and the peak is the largest single-process peak. Adapter
  verification time between processes is recorded per segment, but the reservation timeout does not bound it.
- **Limitation.** A changed trim endpoint is located in the frame table by float equality and then decided exactly. An ulp-different table float
  refuses (fail-closed).
- **Ruling requested.** Nine downstream records widened `revision` from `literal(0)` under unchanged versions. This is a compatible widening:
  revision-0 bytes are unchanged, old strict readers refuse revision > 0 and never misinterpret it, and revision >= 1 by itself identifies a 0.3.0
  graph. No version bump is required if the owner accepts that compatibility policy.
- **Not independently re-verified.** The localized-rerender process count (§12) rests on the adapter's own receipt and on source reading: only
  computed segments get a stage, and a reused segment's staged source is `not_opened_not_consumed`. A planned spawn-level check was not run because
  of the memory condition in 26.6.

### 26.5 Superseded statements

- §3, "The only mutation path is CriticFinding -> RepairPlan -> typed GraphDiff -> ...": true for execution only after this repair.
- §5, the TechnicalMediaQcReceipt entry in the "unchanged versions" row: it has no graph revision field.
- §13, "32 GiB of store (hard ...)": hard for sequential executions only.
- §14, "Validated through its whole lineage (validateRepairRevision)": that function does not replay the plan's bindings. The complete lineage check
  is `validateRepairLineage`, which the permit now requires.
- §20, "admission requires graph replay, not repair lineage ... when required": execution now requires it.
- §22-§25 describe the implementation's bytes and run and are historical; 26.6 is the current record.

### 26.6 Final verification on the final bytes (2026-09-28T19:02:27Z-19:42:13Z): INCOMPLETE

Receipt: `batch3b-ownerreview-final-completion.md`. Source bytes were unchanged during the run: before = after =
`3aae746a34e9fa87a2f53637ba7a177fb5d4be44f902208166321574515ecead` (40 files).

| Gate | Result |
|---|---|
| typecheck / build | PASS / PASS |
| 3B pure / 3B actual media | 49/49 / 4/4 |
| 3A-F | 35/35 |
| Batch-3A pure / actual media | 46/46 / 8/8 |
| Batch-2B pure / actual media | 43/43 / 34/34 |
| Accepted 2B and 3A media outputs against the pre-review snapshot | identical: canonical, determinism pair, six looks, 30 observation computation identities |
| Audit policy | 10/10 |
| Batch-2A / Batch-1 | 130/130 / 81/81 |
| Gate 6 / Gate 5 | 79/79 / 97/97 |
| Routing / compatibility (16 files) / legacy seams | 33/33 / 377/377 / 39/39 |
| **Full safe suite (`npm test`)** | **FAIL, not a valid run: 819 tests, 802 pass, 17 fail** |
| Workspace audit / `git diff --check` | PASS / PASS |

**Full safe suite.** About 10 s after `npm test` started, Claude Code stopped the background shell because the machine was critically low on
memory (measured commit headroom: 1.76 GB of 40.1 GB). Its already-running subtree continued as orphans until it finished. All 17 failures are whole
test files that ended at start-up in 63-296 ms with `'test failed'` and no assertion output; about 197 expected tests never ran. Eight of those
files passed as their own gates in this same run. The compiled import closures of the other nine reach none of the files this review changed.
No out-of-memory message was logged, so the cause is not proven.

The full safe suite has therefore **not passed on the final bytes**. It has not been rerun, pending the owner's go-ahead.

### 26.7 Files changed by the owner review

| File | Change | SHA-256 |
|---|---|---|
| `packages/edit-repair/revision.ts` | `validateRepairLineage`, `RepairLineageStep` | `26a6d53e1aeae8f89cda58b899b3f61f796b137b4f87cdbc6e7da84acf4b56c6` |
| `packages/edit-repair/index.ts` | exports | `7a1dcdc4a2f6850c167f5e1bf9c2ba73705968d3616a0dbaeb089b0eef8be4c4` |
| `scripts/edit-render-local.ts` | permit gate | `530eb8d05584e010f1d39310129b9e3aee8acdc3d1b7945982a6128de3bf8515` |
| `tests/edit-repair-media.integration.ts` | M04, lineage for M01-M03 | `f3a5744aa2c949bd5563509e6a5022ea6b3ca22c952636d111659c40ef8c2fe4` |
| `tests/edit-repair.test.ts` | R-LINEAGE | `28dcea4ad05ea573daa1df601810f2a6a64a59943fc00223d717715340257d21` |
| `tests/edit-review.test.ts` | one pin (accepted 3A test) | `8d5d6c7dc544534a9e872eaeac954fc31bf9e6b18322fa8dc89db8ab949566f9` |

Also changed: this record (§26 appended; the §0 status row and the §22/§24 headings relabelled historical) and `docs/CURRENT_PHASE.md`. The
closing receipt `batch3b-ownerreview-final-docs.sha256` records their hashes. No dependency, lockfile, contract, owner file or earlier receipt
changed. Nothing is staged, committed or pushed.

### 26.8 Status (historical: the owner-review checkpoint of 2026-09-29; superseded by §27)

| Item | Status |
|---|---|
| OR1 repair authority chain (execution) | repaired; RED and GREEN recorded |
| Batch 3B implementation verification after the repair | **INCOMPLETE** (full safe suite pending a valid run) |
| Gate 7 Batch 3B owner acceptance | **PENDING** |
| Gate 7 overall | **NOT YET COMPLETE** |
| Batch 3C | **NOT STARTED** |

## 27. Owner acceptance closure - 2026-09-29 (authoritative)

This section supersedes the review state in §26.6 and §26.8 and the implementation checkpoint in §22-§25. Those sections are kept as chronology.

**Evidence closing the verification.** The owner ran the missing full safe suite on the final repaired bytes described in §26.7:
- `npm test`: **PASS**, exit code 0; 1016 tests, 1016 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo;
- `npm run audit:workspace`: **PASS**;
- `git diff --check`: **PASS** (no output).

The 1016 tests are the implementation's 1015 (§22) plus the owner-review R-LINEAGE test; M04 is actual media and is not part of `npm test`. This
evidence is owner-run and reported by the owner; this session holds no receipt for it.

At the closure, typecheck and build passed again (`.local-runs/phase5-gate7/batch3b-closure-typecheck.log`, `batch3b-closure-build.log`). All
production and test bytes were identical to the final reviewed state (§26.6, 38 files); the closure changed only this record and
`docs/CURRENT_PHASE.md`.

**Owner decision.** Implementation verification **PASS**; owner acceptance **OWNER-ACCEPTED**. The OR1 repair is accepted.

- **OR1 was a real blocker.** Before the repair, an arbitrary or fabricated repair lineage reached executable rendering (§26.1). The repair made
  the execution boundary require `validateRepairLineage`, which validates every revision down to the initial graph (§26.2).
- **Repair authority (owner ruling).** A revision may be structurally validated, admitted and staged without RepairPlan authorization at the
  lower layer, provided no executable media permit is issued until its complete repair lineage validates. Required execution chain:
  CriticFinding -> RepairPlan -> GraphDiff -> parent EditGraph -> child EditGraph -> admission/preparation -> `validateRepairLineage` -> executable
  permit -> media execution. Structural admission does not by itself mean an editorial repair is authorized. The admission residual in §26.3 is
  therefore accepted.
- **Internal record versioning (owner ruling).** The bounded widening of the revision fields in the reviewed internal pre-stable records (§5,
  §26.4) is accepted, with no nine-record version-bump cascade. It permits no silent change to a future stable or public interchange contract.
- **Known non-blocking limitations, accepted and kept:**
  - NB1: segment-store capacity is fail-closed but not atomically reserved across concurrent executions.
  - NB2: segmented-render byte equivalence is verified only for the authorized synthetic V0 cases; it does not establish preservation of arbitrary
    professional color metadata.
  - NB3: process wall time excludes adapter and orchestration overhead, so it is not the full user-visible repair latency.
  - NB4: a legacy one-ULP temporal mismatch fails closed.

The record-versus-signature and planner-identity residuals (§26.3) remain as stated. Real user footage was not run, and professional editing
quality is not verified.

| Item | Status |
|---|---|
| Architecture V2 | **FROZEN** |
| Gate 7 Batch 3A | **OWNER-ACCEPTED** |
| Gate 7 Batch 3A-F | **OWNER-ACCEPTED** |
| Gate 7 Batch 3B implementation verification | **PASS** |
| Gate 7 Batch 3B owner acceptance | **OWNER-ACCEPTED** |
| OR1 authority repair | **OWNER-ACCEPTED** |
| Full safe suite | **PASS** (1016/1016) |
| Workspace audit | **PASS** |
| Git diff check | **PASS** |
| Gate 7 overall | **NOT YET COMPLETE** |
| Batch 3C | **NOT STARTED** |
| Real user footage | **NOT RUN** |
| Professional editing quality | **NOT VERIFIED** |
