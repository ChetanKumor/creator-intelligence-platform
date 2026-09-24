# Phase 5 Gate 6 — EditGraph, capability and compatibility projection

Date: 2026-09-24

Status: **implementation verification PASS; awaiting independent owner acceptance**.

OWNER ACCEPTANCE: PENDING. GATE 7: NOT AUTHORIZED.

## Baseline and authority

- Branch `phase/5-edit-planner-v0`; required and observed HEAD `49f93e28831965a010459df05f5abf4f393f68e6` (`docs: close retrieval sequence planning gate`); accepted Gate-5 implementation `d2ffc51`.
- Local and remote were synchronized at the start: `git ls-remote origin refs/heads/phase/5-edit-planner-v0` returned the same SHA as the local branch and its tracking ref. No fetch, pull or other remote write was performed.
- Tracked and staged state was clean. Five untracked owner files were present and are preserved without edits or staging: `CLAUDE.md`, `gate5-final-owner-diff.txt`, `gate5-owner-source-review.txt`, `gate5-postrepair-owner-review.txt`, `gate5-recon.txt`.
- Workspace observation: the authorization described `CLAUDE.md` as an empty file. The observed file is 7,034 bytes and byte-identical to `AGENTS.md` (both SHA-256 `bf6fabca05d260c81d67a160f9d85a816797430424554325f27d72dbdf5f5ba4`); Claude Code loaded it as repository instructions. It was not edited, staged or deleted, and its origin is not attributed here.
- The owner's Gate-6 instruction explicitly authorizes this gate only. Gate 7 is not authorized.
- Read before implementation: `AGENTS.md`, `docs/CURRENT_PHASE.md`, the [Gate-0 architecture](phase-5-gate-0-creative-intelligence-architecture-v1.md) (sections 3–4, 14–17, 19, 21–27, 30), the [Gate-5 report](phase-5-gate-5-retrieval-sequence-boundary-planning.md) and every `packages/planning/` source file, `packages/contracts/{edit-plan,events,common,creative,reference-v11,execution,audio,job,index}.ts`, `packages/providers/index.ts`, `packages/validation/{index,qc}.ts`, `packages/telemetry/index.ts`, `packages/director/{index,common}.ts`, the world-model grounded-support path, `packages/editorial/{common,resolve}.ts`, the footage metadata protocol and its Python producer, `scripts/audit-workspace.mjs`, `scripts/no-network.mjs`, and the tests for UEP validation, DecisionEvent, telemetry, integration, planning and workspace boundaries.

The authority split holds: perception observes, the world model remembers, the Director expresses typed intent, Gate 5 chooses ordered source uses and exact source ranges. Gate 6 only represents one replay-valid chosen decision as an editable graph, binds typed operations from supplied resolutions, assesses supplied capability evidence and classifies UEP compatibility. It retrieves, searches, trims, selects, renders, previews, critiques, repairs and executes nothing.

## Files owned by this gate

| File | Responsibility |
| --- | --- |
| `packages/edit-graph/common.ts` | Envelopes, owned error codes, exact/canonical artifact reads, exact output-tick encoding |
| `packages/edit-graph/profile.ts` | Owner-authored `EditOutputProfile` and `EditGraphPolicy` |
| `packages/edit-graph/capability.ts` | `CapabilitySnapshot`, requirement predicates, five-state assessment |
| `packages/edit-graph/resolution.ts` | Attributed `TechniqueResolution` for one exact deferred obligation |
| `packages/edit-graph/graph.ts` | `EditGraph` V0 schema, deterministic construction, structural invariants, semantic replay |
| `packages/edit-graph/compatibility.ts` | UEP 1.0.0 compatibility report, refusal and node-mapping sidecar |
| `packages/edit-graph/index.ts` | Internal entry points |
| `tests/support/edit-graph.ts` | Synthetic Gate-6 fixtures over the accepted Gate-4/5 chain, plus a parameterized chain copy |
| `tests/edit-graph.test.ts` | 65 focused tests, including all self-review regressions |
| This report and `docs/CURRENT_PHASE.md` | Gate-6 record and narrow status update |

No existing production file, test, fixture, public contract, provider seam, validator, telemetry module, dependency or lockfile changed. Nothing was staged, committed, pushed, merged or submitted as a PR.

## EditGraph V0

`EditGraph` (internal, `0.1.0`, content identity `edit_graph_v0`) is built only by `buildEditGraph` and validated only by `validateEditGraph`, which reconstructs the graph from its own exact inputs and requires equality. It records:

- scope, `revision: 0`, parent `not_applicable / initial_graph`, change set `initial_graph / entire_output` (V0 implements no revision or update transaction);
- lineage to the exact `PlanningDecision`, search run, alternatives manifest, context, chosen option, `CreativeDirectionGraph`, world snapshot, world view and candidate universe;
- `sourceAccess`: source authorization/retention is established by the pinned Gate-5 world view at its supplied `accessAsOf` only and must be rechecked immediately before execution;
- the exact owner output profile and graph policy refs, plus the output geometry, frame rate, clock and total duration;
- typed tracks, unique clip-use occurrences, typed operations, dependency edges, retained obligations, carried-forward deferred Gate-5 checks, bound resolutions, capability requirements and assessments, unresolved requirements and executability.

Construction first reads the claimed decision structurally (so foreign Gate-6 inputs fail before replay work), then replays Gate-5 semantics with `validatePlanningDecision`. A `tie`, `abstained` or `infeasible` outcome is refused with `planning_outcome_not_chosen`; no winner is ever selected or invented. The chosen option must be a retained, generated option of the exact replay-valid manifest.

## Output clock and time mapping

Source time and output time are separate authorities. Each clip use keeps the exact Gate-5 `PlanningBoundary` range in source seconds, its `boundaryId`, precision (`frame_pts_exact` or `source_seconds`), endpoint authorities, timebase and world-view support pointer. Output time is an integer tick count on the owner profile clock (`ticksPerSecond` 1–1,000,000,000). A source instant is accepted only when `round(seconds × tps) / tps` decodes to the identical Gate-5 number; otherwise construction refuses with `time_not_representable`. Nothing is rounded, extended, FPS-multiplied or upgraded in precision.

V0 places uses contiguously from zero with constant-speed identity mapping (rate 1/1). Each mapping records the exact source endpoints on the output grid, and the output length equals the source length exactly. Output frame alignment is explicitly `not_asserted`. Structural checks reject gaps, overlaps, negative or empty ranges, unsafe integers and any mapping that no longer encodes its exact source instants.

## Tracks

- `track_video_primary` (order 0) holds one video use per Gate-5 use, in the chosen order, with `overlap: forbidden`. Repeated candidates keep distinct occurrence identities bound to distinct Gate-5 `useId`s.
- `track_source_audio_primary` (order 1) exists only when the owner policy says `linked_identity` and the source analysis reports an audio stream. Each audio use mirrors its video use exactly (range, output, mapping, planning use) at unity gain. Otherwise each video use records `absent_in_source` (from `/metadata/hasAudio`) or `excluded_by_policy`.
- Framing is resolved only when the analysis display aspect (`/metadata/aspectRatio`) equals the output aspect. Otherwise framing is `unresolved`; no crop, fit or focal point is invented, and the graph is non-executable.
- No music, graphics or caption track exists in V0: no typed V0 operation can truthfully supply that content.

## Typed operations and technique resolutions

Only a typed Director intention plus an explicitly supplied `TechniqueResolution` can authorize an operation. A resolution is owner- or editor-attributed, has no free-text field, and binds the exact decision, direction, obligation node pointer and intention kind. Director prose is never read.

| Typed intention | V0 resolution |
| --- | --- |
| `color_intention` (mood m) | `color_look` with look = m, integer intensity per mille, whole output (unbound whole-edit intentions only) or exact occurrences of the bound candidate |
| `transition_intention` `clear_change` | `cut_transition` at one exact adjacent join |
| `transition_intention` `soften_change` / `contrast` | none; stays unresolved |
| `graphics_intention`, `sound_design_intention`, `technique_intention`, operational `music_relationship` | none; stays unresolved |

Resolutions are rejected (`technique_resolution_invalid`) for a different decision or direction, another node pointer, a Gate-5 source/editorial node, a mismatched kind or mood, uses outside the chosen sequence or the bound candidate, non-adjacent joins, duplicates, inactive or undetermined alternatives, and overlapping color looks (V0 authorizes no stacking order). Unknown primitives and fields fail strict parsing.

## Obligations and deferred checks

Every Gate-5 `deferredObligations` record appears exactly once with its priority, requirement IDs, direction pointer, Gate-5 reason, applicability and disposition:

- applicability `active`, `inactive_alternative` (another choice of its Director branch was selected by the chosen sources) or `undetermined_alternative` (no choice selected; V0 never chooses a Director alternative);
- disposition `bound_to_operation` (a typed operation exists; this is not a claim of creative satisfaction), `unresolved` (`technique_resolution_not_supplied` or `alternative_branch_undetermined`), or `not_applicable` (`unselected_alternative_choice`).

All Gate-5 checks whose state is `deferred` are carried forward with an exact pointer into the manifest. A node check follows its obligation. Every other deferred check (requirement, constraint, exclusion, relationship, branch) is `not_verified_in_v0`; hard ones block execution and soft ones remain recorded. There is no optional-operation relaxation policy, so soft obligations also block.

## CapabilityGraph V0

A `CapabilitySnapshot` is supplied evidence, never a probe: scope, environment, `asOf`, and executors with exact id, version and implementation digest. Each declaration names one owned capability (`timeline_video_clip`, `timeline_source_audio`, `transition_cut`, `color_look`), a status (`available` with proof evidence; `unavailable` with reason, next-check time and evidence; `failed` with attempt evidence), supported predicates and licensing purposes. Every evidence artifact must resolve and declare the exact snapshot scope. The snapshot bytes must already be canonical so proof pointers address exactly the declaration used.

Requirements are derived only from the represented graph. The video requirement covers identity time mapping, framing, source endpoint precision, rotation, frame timing, codec, output aspect, frame rate, width, height, duration ceiling and clip count; audio, cut and each color operation have their own predicates.

| State | Per-executor meaning |
| --- | --- |
| `AVAILABLE` | Declared available, licensed for the scope purpose, and every predicate proven |
| `PARTIAL` | Declared available but some predicates unmet; the unmet predicates are listed; not executable |
| `UNAVAILABLE` | Declared but unconfigured, unverified, resource-blocked, inaccessible or license-ineligible |
| `UNSUPPORTED` | The executor declares no such capability |
| `FAILED` | The supplied capability-check attempt failed |

A requirement's summary state is the best executor state by the documented precedence (AVAILABLE, PARTIAL, UNAVAILABLE, FAILED, UNSUPPORTED); all per-executor findings are retained. Proof binds the requirement, executor identity, snapshot ref and an exact pointer to the declaration (its evidence, supported limits and licensing). Capability is never inferred from an executor name. Declaration evidence is bound exactly but its content is not attested.

## Executability

A graph is `executable` only when nothing is unresolved, every requirement is `AVAILABLE`, and at least one single executor is `AVAILABLE` for every requirement. All such executors are listed; none is selected. Requirements proven only on different executors yield `no_single_executor_covers_graph`. Every graph carries `permission: not_granted`; an executable graph also carries `recheck: required_immediately_before_execution`. Capability proof is not permission to execute, and Gate 7 must recheck both capability and source access.

## UEP compatibility boundary

`UniversalEditPlan` 1.0.0 was read from source: exact `9:16` aspect with matching resolution, frame rate 1–120 within the frozen rational bounds, target duration 15–30 seconds inclusive without tolerance, 1–120 contiguous clips with a one-microsecond timeline tolerance, speed 0.25–4, cut or dissolve up to two seconds with the last clip ending on a cut, at most one music range, 120 captions, 32 text overlays and 16 neutral/warm/cool color presets. `validatePlanWithInputs` additionally requires, for every clip, a plan-bound `DecisionEvent` (plan, revision, slot, a `clip_segment` winner equal to the clip's segment) and parses references only as `ReferenceFingerprint` 1.0.0. Each clip also requires a public `segmentId`, a `role`, a numeric `confidence` and a `decisionId`; the plan requires `createdAt`.

`assessUepCompatibility` first replays the graph, then reports 17 fixed dimensions. The lossless timeline subset (obligations, operation subset, output profile, duration, clip count, framing, time mapping, source audio, transitions, effects and the replayed frozen timeline arithmetic) is classified separately from executability, clip identity, clip role, reference, telemetry and plan metadata. Every finding carries subjects and exact evidence pointers.

**No truthful UEP success path exists under the current frozen requirements.** Gate-5 uncertainty is `bounded_heuristic_uncalibrated`, so no meaningful clip or event confidence exists. The Gate-5 decision is sequence-level, with no per-slot complete candidate list, scalar scores, event time or event scope. The report therefore always ends in `outcome: refused` with `plan: not_produced` and `decisionEvents: not_emitted`, and its schema has no success variant. No plan, plan ID, clip ID, DecisionEvent, confidence or creation time is fabricated, and supplied public DecisionEvents do not change the refusal. A later explicitly authorized telemetry/confidence gate would be required.

- Duration: a graph outside 15–30 seconds (tested at 2, 32 and 60 seconds) is refused with `output_duration_outside_uep_range` and never truncated; 16 and exactly 30 seconds are inside the subset.
- Reference: an export may name a required reference. `ReferenceFingerprint` 1.0.0 is version-compatible (its asset and project joins remain for the frozen validator, which is never reached). 1.1.0 is refused with `reference_version_incompatible` and never coerced. Other artifact types are refused.
- Segment identity is available only through a token's verified public `ClipSegment`; the accepted synthetic tokens carry none. Clip roles are projected only for exact story-beat names `hook`, `setup` and `build`.
- The sidecar binds the exact graph ref and revision and maps every clip use, operation and obligation exactly once: video uses to clip indexes, linked audio to clip gain, in-subset color looks to effect indexes, cuts to `transitionOut`, contrast looks and unresolved obligations to `not_projectable`, and bound or inactive obligations to `outside_uep`.

## Identity, replay and provider neutrality

Every output identity binds its full content: decision and manifest lineage, chosen option, direction, exact source ranges and authorities, output profile and clock, graph policy, resolutions, capability snapshot and, for reports, projection policy and reference. Sets are canonical and ordered sequences keep their order. There is no ambient clock, randomness, environment, filesystem, network, process, provider, model, decoder, renderer or FFmpeg use. The core imports only zod, accepted internal modules and frozen public schemas used for reading. Validators replay semantics, so coordinated rehashing of graphs and reports is rejected.

Owned error codes: `input_invalid`, `scope_mismatch`, `planning_outcome_not_chosen`, `planning_lineage_invalid`, `technique_resolution_invalid`, `capability_snapshot_invalid`, `time_not_representable`, `limit_exceeded`, `graph_replay_mismatch`, `report_replay_mismatch`. Report refusals use owned finding codes, including `graph_not_executable`, `unresolved_operation_obligation`, `deferred_check_not_verified`, `operation_not_in_uep_subset`, `output_aspect_not_uep`, `output_frame_rate_outside_uep`, `output_duration_outside_uep_range`, `framing_not_representable`, `segment_identity_unavailable`, `clip_role_not_representable`, `reference_version_incompatible`, `reference_type_unsupported`, `missing_truthful_decision_telemetry`, `missing_meaningful_confidence` and `plan_created_at_unavailable`.

## Test-first and self-review chronology

Receipts are under ignored `.local-runs/phase5-gate6/`; no receipt was overwritten.

| Step | Evidence | Result |
| --- | --- | --- |
| Baseline | `baseline.json` | 240 tracked files and 44 protected files hashed; owner files hashed; tracked/staged clean |
| First red | `first-failure.md` (SHA-256 `d188a71276856c9dfc6439beae68c775096e21329f16d67f406eb873ae437cb6`) | `npm.cmd run typecheck` exit 2, TS2307 missing `packages/edit-graph/index.js`; tests preceded production code |
| First execution | `initial-focused-run.log` | 51/52; the failure was a test-authoring defect: the audit regex `/node:/` matched the TypeScript annotation `node: DirectionNode`; narrowed to quoted specifiers (the allowlist already rejects `node:` imports); no production change |
| First green | `first-green-focused.log` | 52/52 |
| Self-review red | `self-review-red.md` (SHA-256 `0f6d6294efe6883a67bc845cf0b9975a41770d0a833aa3848dcb76925d26a025`) | 10 attacks, 7 pass / 3 fail with production unchanged: non-canonical snapshot bytes misbound proof pointers (diagnostic shows each AVAILABLE pointer resolving to the other executor), foreign/unscoped capability evidence proved availability, and source-access currency was undisclosed |
| Repairs | `self-review-repaired.log` | Canonical supplied Gate-6 artifacts, scoped capability evidence, `sourceAccess` disclosure; 9/10 |
| Fixture correction | `self-review-resolution-fixture-red.md` (SHA-256 `9f219f70fdff3186351a2540852a6f77ec41297ea0d73fcf2913f6322396a713`) | The resolution sub-case (never reached in the first red run) reversed an already-descending pair, so its "non-canonical" bytes were canonical. After correcting the test, the exact pre-repair line was temporarily restored: the corrected attack failed (reordered bytes accepted); the line was restored byte-identically (graph.ts SHA-256 unchanged) |
| Post-repair green | `post-repair-focused.log` | 62/62 |
| Round-2 red | `self-review-round2-red.md` (SHA-256 `e1389f479c273531f52e2f4c62b4e0a369f35b10d6c09eb3cbc63a195f2349c2`) | 3 attacks, 2 pass / 1 fail: report findings were bounded at 256 while a valid graph can carry 2,048 hard deferred checks, so a 300-edge direction made report construction throw |
| Repair | `post-round2-focused.log` | Finding bounds raised to the graph maxima; 65/65 |

Attacks rejected without repair include: coordinated rehash of a widened range and of an equal-duration substitute candidate (structurally valid, rejected by replay), source/output clock confusion and reclocking, negative, empty and overflowing time, forged chosen options (including a tied option and a coordinated search receipt), capability upgraded, borrowed from another declaration, moved to another snapshot or executor digest, declared for another primitive, unknown primitives or capabilities in raw artifacts, dropped or relabeled obligations, dropped or duplicated sidecar mappings, a report rebound to another graph, a coordinated report forgery relabeling a 32-second duration, confidence or event injection into the request, supplied DecisionEvents, Director prose naming commands or executors, missing Gate-5 lineage artifacts and revision forgery. All evidence is synthetic.

## Final verification

| Command / check | Result | Local evidence |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `final-typecheck.log` |
| `npm.cmd run build` | PASS | `final-build.log` |
| `node --import ./scripts/no-network.mjs --test dist/tests/edit-graph.test.js` | 65/65 PASS; zero failed/skipped/cancelled | `final-focused.log` |
| Gate-5 regression `dist/tests/planning.test.js` under the guard | 97/97 PASS | `final-gate5-regression.log` |
| Accepted 16-file compatibility set under the guard | 377/377 PASS | `final-compatibility.log`, `final-compatibility-files.log` |
| `npm.cmd test` | 611/611 PASS (546 accepted + 65 new); includes build and the no-network guard | `final-full-safe-suite.log` |
| `npm.cmd run audit:workspace` | PASS: 78 application TypeScript files (71 + 7 new) and 9 existing runtime adapters | `final-workspace-audit.log` |

The compatibility set is `director-boundary`, `world-model`, `budgeted-perception-routing`, `perception-evidence-store`, `editorial-common`, `editorial-token`, `editorial-decisions`, `editorial-ranking`, `editorial-semantic`, `editorial-reference-ranking`, `editorial-matcher`, `contracts`, `integration`, `serialization`, `telemetry` and `evaluation`, the same set accepted at Gate 5. No media, Python, real-model, real-footage, renderer, FFmpeg or network suite was run; the audit reads Python policy as text only.

Coverage of the 35 required areas: chosen lineage (1); tie, abstained and infeasible refusals (2–4); forged chosen options (5); exact source range and precision (6); separate output clock and unrepresentable timing (7); distinct repeated occurrences (8); overlap, gap and reused-identity rejection (9); retained obligations (10); prose (11); AVAILABLE, PARTIAL, UNAVAILABLE (unconfigured and license), UNSUPPORTED and FAILED (12–16); wrong requirement, executor, snapshot and scope (17); unresolved hard and soft operations (18); absent proof (19); identity binding (20); deterministic replay and permutation (21); foreign scope for every Gate-6 input (22); source-bound mutation (23); UEP subset classification with a frozen-schema oracle (24); rich and unresolved operations (25); 32- and 60-second refusal without truncation (26); aspect and frame-rate refusal (27); reference 1.1.0 refusal (28); missing telemetry, no DecisionEvent and no confidence (29–31); exact sidecar binding (32); frozen public bytes (33); import boundaries (34); and no Gate-7 object (35).

The oracle test uses the frozen `UniversalEditPlanSchema` only as an arithmetic check of the timeline-subset classification. Placeholders fill exactly the fields the report marks unavailable, and the probe is never validated with inputs, emitted or treated as a projection.

## Preservation and workspace checks

Run after the documentation edits; evidence in `final-protected-byte-comparison.json` and `final-workspace.log`.

| Check | Result |
| --- | --- |
| Branch / HEAD / staged | `phase/5-edit-planner-v0` / `49f93e28831965a010459df05f5abf4f393f68e6` / nothing staged |
| Tracked SHA-256 vs `baseline.json` | 240/240 tracked files accounted for; only the authorized `docs/CURRENT_PHASE.md` differs; none missing or added |
| Protected paths | 44/44 byte-identical: `packages/contracts/`, `packages/providers/index.ts`, `packages/perception/`, `packages/world-model/`, `packages/routing/`, `packages/director/`, `packages/planning/`, `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `tests/fixtures/`, `samples/fixtures/`, `tests/support/` (the new `tests/support/edit-graph.ts` is untracked and outside the baseline) |
| Owner files | All five unchanged in size and SHA-256 |
| `git diff --check` | PASS, exit 0 |
| New-file whitespace | No trailing whitespace, LF line endings and a final newline in all ten new files |
| Relative links | All links in this report and `docs/CURRENT_PHASE.md` resolve |

The focused test `public contracts, provider seams, validators and telemetry remain byte-identical` separately pins all nine `packages/contracts/*.ts` files, `packages/providers/index.ts`, `packages/validation/{index,qc}.ts` and `packages/telemetry/index.ts` to their baseline SHA-256 values.

## Remaining limits

Gate 6 establishes only its bounded internal representation, capability and compatibility semantics over synthetic evidence. It does not establish professional or human-level editing quality, real-footage behavior, render correctness, pixel or audio-mix equivalence, executor conformance, critic quality, production latency or cost, or global optimality.

V0 limits: initial revisions only; contiguous cuts at constant identity speed; no dissolves, speed changes, crops, transforms, keyframes, masks, music, captions or graphics; two resolvable primitives; no resolution of graphics, sound, technique, music or non-`clear_change` transitions; no choice among Director alternatives; no verification of deferred requirement, constraint, relationship or branch semantics (hard ones block); no optional-operation relaxation; framing only when source and output aspects are equal; capability evidence content is bound but not attested; UEP projection always refuses under current telemetry requirements; reference asset/project joins are not evaluated. Gate 7 must recheck capability and source access immediately before any execution.

PHASE 5 GATE 6 IMPLEMENTATION VERIFICATION: PASS

OWNER ACCEPTANCE: PENDING

GATE 7: NOT AUTHORIZED

## Independent owner-review repair — 2026-09-24

Status: **post-owner-review verification PASS; awaiting independent owner acceptance**.

This addendum records the bounded repair of the three owner findings and the required plan-input validator audit. The chronology, receipts and counts above remain historical evidence for the original implementation; where this addendum states different semantics it supersedes them (see *Superseded statements*). Branch and HEAD remain `phase/5-edit-planner-v0` at `49f93e28831965a010459df05f5abf4f393f68e6`. The uncommitted Gate-6 implementation was preserved and repaired in place. Nothing was staged, committed, pushed, merged or submitted as a PR, and Gate 7 was not started.

Exactly these untracked Gate-6 files changed: `packages/edit-graph/{capability,graph,compatibility,index}.ts`, `tests/edit-graph.test.ts`, `tests/support/edit-graph.ts` and this report. `packages/edit-graph/{common,profile,resolution}.ts` are byte-identical. The only tracked edit remains `docs/CURRENT_PHASE.md`, limited to its narrow Gate-6 status text. No public contract, validator, telemetry module, provider seam, accepted Gate 1–5 production file, dependency or lockfile changed. The six owner files remain untouched and unstaged: `CLAUDE.md`, `gate5-final-owner-diff.txt`, `gate5-owner-source-review.txt`, `gate5-postrepair-owner-review.txt`, `gate5-recon.txt` and `gate6-owner-source-review.txt`.

### Owner reds and self-review reds

Paths are relative to ignored `.local-runs/phase5-gate6/`. Each receipt was created separately; no earlier receipt was overwritten. Before any edit, `owner-review-baseline.json` (SHA-256 `ae37f51edf6a17956167a686c2c3600b481bdbd1ea75e09fb4ccce631283a53c`) inventoried 240 tracked files, 46 protected files under the extended protected prefixes, 16 untracked files and 26 earlier receipts. `owner-review-prerepair-production-hashes.log` pins the pre-repair production bytes. The five owner regression tests (four receipts) were run red against those exact bytes.

| Receipt (SHA-256) | Genuine result before its repair |
| --- | --- |
| `owner-review-capability-attestation-red.md` (`4bcce4375d536267635c39ea046309ffc790c6f070cb89b55309171e92e156d7`) | 1 test, 1 failure: a same-scope Evidence artifact that attests nothing about any executor proved `color_look` AVAILABLE and the graph executable (`{"color":"AVAILABLE","ready":true}`) |
| `owner-review-budget-readiness-red.md` (`0c2dde40a1b4e53314f9bde75e160ca8802ffb5bfcf31293dc776037b9a85580`) | 1 test, 1 failure: a capability-proven graph reported `executable` although no artifact proved execution-budget feasibility |
| `owner-review-uep-input-joins-red.md` (`9afc60d85aacd768e1276d96d54ef0163e2b71a199ed4d62e0c63a056054e8ff`) | 2 tests, 2 failures: a ReferenceFingerprint 1.0.0 with no join evidence, and one with a foreign-project reference asset supplied, both reported `reference: compatible` |
| `owner-review-audit-plan-inputs-red.md` (`66e59e00da943eb49fcd959b8396dabe013b1e3e91b46e1abb492b671c23d8fd`) | 1 test, 1 failure: the report had no clip-asset-join, validation-time-access or plan-input-eligibility classification |
| `owner-review-self-review-segment-joins-red.md` (`2043a5a2639cea93507cee2720adb51c5bebbdcf1a92aa735570b6370623d60e`) | After the owner repairs were green (70/70, `owner-review-postrepair-focused.log`): 1 test, 1 failure. Without supplied ClipSegments, the segment-to-asset and source-containment joins were only implied through `clip_identity`, and no dimension stated them unverified |
| `owner-review-self-review-join-exactness-red.md` (`252bbf76b63ba0e6c626c175af69a5853e7a041d7d7c8eee76780d56d96e81b3`) | 1 test, 1 failure: join evidence supplied beside a refused 1.1.0 reference, or behind an asset join for another asset, was recorded in the report without being resolved or type-checked |

Both self-review regressions were written and run red before their repair. `owner-review-self-review-repaired.log` records 2/2 after it, and `owner-review-post-self-review-focused.log` records 79/79 with the attack battery added.

### Finding 1 — capability availability is attested, not self-declared

A snapshot declaration is now only an index `{capabilityId, attestation}` to one exact `CapabilityAttestation` (internal `0.1.0`, content identity `capability_attestation_v0`). It carries no status, support set or licensing of its own, and strict parsing rejects any such field. The attestation binds:

- scope, environment and `observedAt`;
- the exact executor build (`executorId`, `version`, `implementationDigest`) and the `capabilityId`;
- the attester (an `owner` or `operator` actor) and the literal basis `attester_supplied_check_results_no_probe`;
- exactly one typed outcome:
  - `available`: supported predicates, licensing purposes, and three evidence sets, each with a literal meaning: conformance (`every_declared_support_passed_attested_checks`), configuration (`executor_configured_in_environment`) and resources (`required_resources_present_at_observation`);
  - `unavailable`: a reason (`unconfigured`, `unverified`, `resource_blocked`, `permission_unavailable` or `inaccessible`), a next-check time and evidence;
  - `failed`: a failure code, plus the attempt time (no later than `observedAt`) and its evidence.

Binding fails closed with `capability_snapshot_invalid` (`scope_mismatch` for scope) unless every declared attestation meets all of these conditions:

- it is supplied exactly and is already canonical;
- it matches the snapshot on scope, environment, executor build and capability;
- its `observedAt` is no later than the snapshot `asOf`.

Supporting evidence must resolve and declare the snapshot scope. It may not itself be a `CapabilityAttestation` or `CapabilitySnapshot`, and one evidence artifact may not back both an available and a non-available attestation in the same snapshot.

State comes only from the typed outcome:

- FAILED from `failed`;
- UNAVAILABLE from `unavailable`, or from licensing that excludes the scope purpose;
- PARTIAL or AVAILABLE from the attested supports.

Each executor assessment records both the exact snapshot declaration pointer and the attestation ref. Gate 6 still runs no check, probe, executor, process, environment, filesystem or network operation. It does not verify what an evidence artifact says: conformance is attributed to the attester, never invented.

### Finding 2 — capability readiness is not execution readiness

`executability.state` has exactly one value, `not_execution_ready`. The parts of the readiness record are:

- `executability.capability` separately reports either `capability_ready` or `capability_not_ready`. `capability_ready` lists every executor AVAILABLE for all requirements, and none is selected. `capability_not_ready` carries its blockers: unresolved requirements, non-AVAILABLE requirements or `no_single_executor_covers_graph`.
- `executability.budget` is always `unverified` / `budget_feasibility_unverified`. It records the replayed Gate-5 `PlanningContext.computeBudget` ref with the literal meaning `gate5_planning_authorization_not_execution_budget`, so the planning budget is disclosed but never repurposed. No CPU, GPU, RAM, cost or timing figure is invented.
- The overall blocking list is the capability blockers plus `budget_feasibility_unverified` / `execution_budget`.
- `permission: not_granted` and `recheck: required_immediately_before_execution` hold on every graph.

The UEP dimension now reads capability readiness only. It is renamed `graph_capability_readiness` (finding `graph_capability_not_ready`). Budget feasibility concerns execution, not the plan contract, so it is not a UEP dimension.

### Finding 3 and the plan-input audit — UEP joins

The projection request and the report both carry `referenceJoins`: either missing, or exact refs `{asset: MediaAsset 1.0.0, audio: availability(AudioFingerprint 1.0.0)}`. Every supplied join ref must resolve to exactly that type and version, even when it cannot make the reference compatible; otherwise the input is `input_invalid`. Join evidence without a reference, and audio join evidence for a reference without audio, are also `input_invalid`. For a ReferenceFingerprint 1.0.0:

| Supplied evidence | Classification |
| --- | --- |
| No join evidence, an asset join for another asset, a missing audio join, or an audio join for another fingerprint | `unavailable`: `reference_join_evidence_unavailable` |
| Asset outside the plan project or creator | `incompatible`: `reference_asset_foreign_scope`. The frozen validator joins the project; the creator join is the repository scope rule and only ever refuses more |
| Asset not video, or duration differing by more than 1 µs | `incompatible`: `reference_asset_mismatch` |
| Audio fingerprint of another asset, or of another duration | `incompatible`: `reference_audio_mismatch` |
| Exact in-scope video asset of equal duration, plus the named audio when the reference has one | `compatible` |

1.1.0 remains `reference_version_incompatible` and is never coerced; other artifact types remain `reference_type_unsupported`.

The report now has 20 fixed dimensions and classifies every frozen plan-input validator dependency. `timelineSubset` (the unchanged lossless editable-timeline classification) is kept separate from the new derived `planInputEligibility`. That field is `eligible` only when every plan-input dimension is compatible, and it is `not_eligible` for every V0 graph:

| Validator dependency | V0 dimension and result |
| --- | --- |
| Clip segment identity | `clip_identity`: compatible only through a token's verified public ClipSegment; otherwise `segment_identity_unavailable` |
| Clip asset existence, project join and video kind | `clip_asset_joins`, replayed from the exact MediaAssets pinned by the Gate-5 world query. An unpinned asset gives `clip_asset_join_evidence_unavailable`, a foreign one `clip_asset_foreign_scope`, and a non-video one `clip_asset_not_video` |
| ClipSegment-to-asset join, segment inside the asset, clip range inside the segment | `clip_segment_joins`. A missing segment (or unpinned asset) gives `clip_segment_join_unverified`; a violation gives `clip_segment_join_invalid` |
| Retention, deletion and expiry at validation time | `validation_time_access`: always `unavailable`, `validation_time_access_unverified`. Gate 6 holds only the pinned Gate-5 `accessAsOf` (evidence `/sourceAccess`) |
| Reference asset, duration and audio joins | `reference`, as above |
| Music asset and fingerprint joins | Not applicable: V0 graphs have no music track, so a projected plan's music is null |
| Plan-bound DecisionEvents and meaningful confidence | `telemetry`: always unavailable |
| Plan creation time | `plan_metadata`: always unavailable |

The telemetry refusal is unchanged: every outcome is `refused`, with `plan: not_produced` and `decisionEvents: not_emitted`. The frozen-schema oracle still classifies only the timeline subset.

Some branches cannot be reached by replay-valid lineage:

- The replayed Gate-2 world query already requires pinned MediaAssets to be in the same project and creator, unexpired at `accessAsOf`, and equal in duration to their analysis.
- The editorial resolver fixes a ClipSegment to its candidate's asset and range, and Gate-5 trims stay inside the candidate.

The foreign-asset, unpinned-asset and segment-violation branches are therefore fail-closed defenses that the synthetic chain cannot reach. The non-video branch is reachable, because no earlier gate checks `MediaAsset.kind`, and it is tested.

### Adversarial self-review

Every attack below is a regression test. `owner-review-self-review-attack-reasons.log` additionally records the owned code and message for each capability attack, confirming that each is rejected by the intended check rather than incidentally.

- **Capability.** Each of these is rejected:
  - unrelated same-scope evidence, whether as a self-declared status or offered as the attestation;
  - an attestation for another executor id, version, digest, environment or capability, from a foreign scope, or observed after the snapshot;
  - a proof borrowed by another executor, a dangling attestation, or an attestation used as another attestation's evidence;
  - status, supports or licensing restated in the snapshot;
  - unavailable or failed evidence reused as available, including another executor's failed attempt;
  - reordered attestation evidence bytes.

  Split single-polarity evidence stays valid, and an UNAVAILABLE attestation stays UNAVAILABLE.
- **Readiness.** Strict parsing rejects these forged states: `execution_ready`, `executable`, `permission: granted`, a relaxed recheck, an empty blocking list, a verified budget, a relabeled budget meaning and a missing budget ref. A substituted budget ref is structurally consistent but fails Gate-5 replay (`graph_replay_mismatch`).
- **UEP.** The tests cover:
  - a 1.0.0 reference without joins;
  - a foreign project or creator;
  - duration, kind, audio-asset and audio-duration mismatches;
  - exact compatible joins with and without audio, and malformed join evidence;
  - unsupplied segments, a non-video pinned asset and validation-time access;
  - a 1.1.0 reference and telemetry;
  - a coordinated report forgery marking access verified (`report_replay_mismatch`) and a forged `planInputEligibility: eligible` (schema rejection).

  No DecisionEvent, confidence or plan is produced.

### Test and test-support changes

`tests/support/edit-graph.ts` changes (test-only):

1. New scope-bearing synthetic Evidence artifacts `gate6_configuration`, `gate6_resources` and `gate6_unavailability`, and new exports `ENVIRONMENT`, `configuration`, `resources`, `unavailability` and `unavailableRefs`.
2. `declaration()` still returns a test-side claim. The new `attestation(claim, identity, patch)` turns a claim into an attributed `CapabilityAttestation` (`operator_synthetic`, `observedAt` = `TIME6`) and records its exact bytes. `executorBody()` now emits `{capabilityId, attestation}` declarations.
3. `snapshotAttestations()` and `graphInputs()` supply exactly the attestations a snapshot references, plus the new evidence artifacts.
4. `reportOf()` takes an optional `referenceJoins`. It defaults to `unavailable` / `reference_join_evidence_not_supplied` when a reference is present, and otherwise to `not_applicable` / `no_reference_required`.
5. `variantDirectionFixture()` gains `assetKind` (default `video`). The existing byte-for-byte test still proves the unpatched chain identical to the accepted fixture.

`tests/edit-graph.test.ts` changes:

- Readiness assertions read capability readiness separately and expect overall `not_execution_ready` with the budget blocker. Forged readiness objects use the new shape.
- The UNAVAILABLE (`unconfigured`) case uses distinct unavailability evidence, as the single-polarity rule requires.
- Dimension names and codes follow the renames. The 16-second dimension map adds the new dimensions and refusal reasons.
- The 1.0.0 reference expectation is `unavailable` without joins and `compatible` with exact in-scope joins.
- The import allowlist adds the frozen, read-only `../contracts/audio.js`.
- Four titles now say capability-ready instead of executable.
- 14 tests were added (5 owner regressions, 2 self-review regressions and 7 attack tests), for 79 in total.

### Superseded statements

These statements in the sections above describe the original implementation and are superseded:

- the CapabilityGraph V0 description of snapshot-declared status, supports and licensing, and "declaration evidence is bound exactly but its content is not attested";
- the whole Executability section: no V0 graph is `executable`;
- "17 fixed dimensions" and the separation list in the UEP section;
- "ReferenceFingerprint 1.0.0 is version-compatible" and "reference asset/project joins are not evaluated";
- the finding code `graph_not_executable`, now `graph_capability_not_ready`;
- the 65-test count in the files table.

Otherwise the remaining limits stand. In addition, attestation content is attributed rather than verified, and budget feasibility is always unverified.

### Post-owner-review verification

| Command / check | Result | Local evidence |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `owner-review-final-typecheck.log` |
| `npm.cmd run build` | PASS | `owner-review-final-build.log` |
| Gate-6 focused tests under `scripts/no-network.mjs` | 79/79 PASS | `owner-review-final-focused.log` |
| Gate-5 regression `dist/tests/planning.test.js` under the guard | 97/97 PASS | `owner-review-final-gate5-regression.log` |
| Same 16-file compatibility set under the guard | 377/377 PASS | `owner-review-final-compatibility.log`, `owner-review-final-compatibility-files.log` |
| `npm.cmd test` | 625/625 PASS (611 before plus 14 new); includes the build and the no-network guard | `owner-review-final-full-safe-suite.log` |
| `npm.cmd run audit:workspace` | PASS: 78 application TypeScript files and 9 runtime adapters | `owner-review-final-workspace-audit.log` |
| SHA-256 comparison against `owner-review-baseline.json`, before and after the final documentation edits | PASS. HEAD is unchanged and nothing is staged. All 240 tracked files are accounted for, and only the authorized `docs/CURRENT_PHASE.md` differs. All 46 protected files are unchanged: `packages/{contracts,perception,world-model,routing,director,planning,validation,telemetry}/`, `packages/providers/index.ts`, `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`, `tests/fixtures/`, `samples/fixtures/` and `tests/support/{planning,editorial,footage,fixtures}.ts`. All six owner files and all 26 earlier receipts are unchanged. Only the seven authorized untracked Gate-6 files differ | `owner-review-final-protected-byte-comparison.json`, `owner-review-closing-protected-byte-comparison.json` |
| `git diff --check`, whitespace and line endings of every changed file, relative links | PASS | `owner-review-closing-workspace.log` |

An intermediate post-documentation run (`owner-review-final-workspace.log`, `owner-review-final-protected-byte-comparison-after-docs.json`) also passed. It preceded one final wording correction in this addendum and was kept rather than overwritten. Every test run has zero failures, skips, cancellations or todos. No media, Python, real-model, real-footage, renderer, FFmpeg or network suite ran. All evidence is synthetic.

PHASE 5 GATE 6 POST-OWNER-REVIEW VERIFICATION: PASS

OWNER ACCEPTANCE: PENDING

GATE 7: NOT AUTHORIZED
