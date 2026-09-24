# Phase 5 Gate 5 — Retrieval, sequence and boundary planning

Date: 2026-09-24

Status: **implementation verification PASS; awaiting independent owner acceptance**.

OWNER ACCEPTANCE: PENDING. GATE 6: NOT AUTHORIZED.

## Baseline and authority

- Branch: `phase/5-edit-planner-v0`.
- Required and observed starting HEAD: `7b82de13cb49022d2f08cef577f4cb7056274fd9` (Gate-4 closure).
- Accepted Gate-4 implementation: `e99e98748ddc84d5932adb1c5ee1b22729d35a2f`.
- No tracked modifications at the starting checkpoint. The existing untracked owner file `gate5-recon.txt` is preserved without staging or editing.
- The owner explicitly authorized this Gate-5 task. The earlier Gate-5 authorization statements in historical closure records describe their own checkpoints.
- Read `AGENTS.md`, `CURRENT_PHASE.md` and its authoritative references, the [Gate-0 architecture](phase-5-gate-0-creative-intelligence-architecture-v1.md), and the accepted implementation/report sources for [Gate 1](phase-5-gate-1-perception-evidence-store.md), [Gate 2](phase-5-gate-2-project-world-model-lite.md), [Gate 3](phase-5-gate-3-budgeted-perception-routing.md), and [Gate 4](phase-5-gate-4-canon-director-boundary.md).

Gate-0 sections 13–16, 19, 21–25 govern direction, retrieval/search, PlanningDecision, compatibility, provider neutrality, recomputation and failure semantics. The baseline contains the required source-boundary evidence, strict artifact resolver and accepted Gate-1–4 APIs. No architecture premise required changing a protected contract or importing a later gate.

The authority split remains: perception observes; world memory retains factual evidence; Director supplies intent; search explores bounded alternatives; this planner decides ordered source uses and exact supported ranges. Capability negotiation, editable operations, validation for execution, rendering, critique and learning remain separate.

## Files owned by this gate

| File | Responsibility |
| --- | --- |
| `packages/planning/common.ts` | Versioned strict records, explicit policy, canonical identities and exact in-memory artifacts |
| `packages/planning/context.ts` | Exact Gate-4/request/world/universe/token/budget joins and preceding-use validation |
| `packages/planning/retrieval.ts` | Deterministic inventory and inclusion/exclusion over the supplied universe |
| `packages/planning/boundary.ts` | Supported candidate/sample/PTS boundary proposals |
| `packages/planning/scoring.ts` | Occurrence identity, sequence state, named components and constraint checks |
| `packages/planning/search.ts` | Finite deterministic beam search and complete bounded generated-option manifest |
| `packages/planning/index.ts` | Internal entry points, runtime receipt, PlanningDecision and semantic replay |
| `tests/support/planning.ts` | Separate synthetic fixture using actual accepted Gate-1–4 constructors/validators |
| `tests/planning.test.ts` | Happy path, outcome semantics, adversarial regressions and scope checks |
| This report | Architecture reconciliation, chronology, verification and limitations |
| `docs/CURRENT_PHASE.md` | Narrow current Gate-5 status update |

No existing production file, existing test, fixture, public contract, dependency or lockfile is changed. No Git staging, commit, push, merge or PR is performed.

## Context and explicit policy

All new artifacts use internal version `0.1.0`. A `PlanningContext` binds exact type/version/object/digest refs for scope, CreativeDirectionGraph, DirectorRequest, world snapshot, WorldView and its complete supplied query/access time, candidate universe and every token, PlanningPolicy, Gate-3 ComputeBudget, previous decisions and ordered preceding occurrences. Director lineage transitively binds intent, Canon, candidate summary, model-selection evidence and the existing selection-only capability snapshot.

No ambient time, randomness, environment, filesystem, network, provider or model input is consulted. The source core is synchronous, deterministic and takes explicitly supplied artifacts. Exact bytes and semantic identities are both checked. No additional evidence discovery or recomputation occurs.

Policy values are supplied, finite and identity-bearing: duration minimum/preferred/maximum, trim bounds, reuse, retrieval/boundary caps, search limits, ordered objectives, missingness handling, epsilon, deterministic enumeration and stopping. Prose never supplies numeric authorization. Contradictory limits and unknown fields/versions fail closed.

Supported safety ceilings are:

| Dimension | Maximum |
| --- | ---: |
| Pinned candidates / direction nodes | 256 / 256 |
| Included candidates per direction node | 64 |
| Boundary evidence points / proposals per candidate | 16 / 32 |
| Sequence depth / frontier width | 16 / 32 |
| Generated successors / manifest entries | 2,048 / 2,048 |
| Retained alternatives | 256 |
| Uses per candidate, including supplied preceding uses | 16 |
| Supplied duration / trim numeric ceiling | 600 source seconds |
| Direct previous decisions / preceding uses | 8 / 32 |
| Recursive replay contexts / nesting | 32 / 8 |

Expanded-state and retention bounds must fit the supplied manifest limit. V0 supports deterministic canonical or reverse-canonical action enumeration; there is no stochastic seed or random call. The exact enumeration policy is included in every descendant identity.

## Retrieval

Retrieval records every candidate in the exact pinned universe for a requested known direction node. Inclusion requires an explicit exact Director candidate link, compatibility with the node's candidate scope, accessible grounded support in the pinned view, and space under the supplied retrieval cap. A candidate merely present in another supplied artifact cannot enter.

Entries preserve candidate/token, node and requirement IDs, factual evidence refs, technical features and their locality, missing feature evidence, and an inclusion/exclusion reason. Reasons include `not_bound_to_direction`, `outside_direction_scope`, `world_support_unavailable` and `retrieval_limit`. Bounded exclusion makes no negative quality claim.

The only technical feature signals consumed are the existing sharpness, unclipped-pixel and stability indicators. Their extent is explicitly `candidate_snapshot_not_trim_recomputed`, including same-shot contextual evidence when that is the token's actual support. No embedding, learned relevance, calibrated confidence or semantic prediction is manufactured. Phase-4 predictions are not consumed in V0; their absence is recorded as `not_computed`.

## Exact source boundaries

Each boundary binds candidate and exact token, asset/hash/analysis, trusted GroundedSupport and its view pointer, exact candidate range, source shot, timebase, endpoint authorities, available sample/hash evidence, precision, policy and uncertainty.

The proposal domain is the full candidate range plus pairs from a bounded set of actual sampled source PTS. V0 requires grounded support containing the whole candidate before generating its trims. Candidate endpoints are retained; interior points come only from supplied cheap/semantic sample evidence whose frame index matches `metadata.frameTimes` exactly. The generator never divides a desired duration to invent a source timestamp. It performs no decode or fresh analysis.

Every selected interval is positive and within the candidate, grounded support and source shot for the same analysis/source hash. `frame_pts_exact` means both endpoints equal actual supplied frame PTS. An endpoint supported only by an exact candidate range remains `source_seconds`; no FPS multiplication or Director prose upgrades it. Actual PTS outside the declared bounded proposal set still cannot be injected as a generated option. Boundary merit remains unverified.

## Sequence state, scoring and constraints

A use has a unique occurrence ID derived from context, parent option, position, candidate boundary and direction node. Reuse creates another occurrence. Sequence identity is ordered. State retains uses, exact boundaries, preceding occurrence, summed source duration, covered nodes, reuse counts, hard checks, soft findings, component values and explicit missingness. These are internal source-use decisions with no tracks, output timestamps, operation IDs or public slots.

The supplied ordered objective list can select:

- `direction_coverage`: number of structurally covered nodes;
- `hard_requirement_coverage`: hard include/output requirements structurally addressed by covered hard nodes;
- `duration_deviation`: absolute difference from the supplied preferred duration;
- `repetition_count`: repetitions including supplied preceding uses;
- `mean_sharpness`, `mean_unclipped_pixels`, `mean_stability`: means of available candidate snapshot indicators, not recomputed trim measurements.

There is no scalar quality score. Each component records evidence refs and `declared_objective_not_confidence`. If any contributing technical signal is absent, that component is missing. Missingness is never imputed as zero. `block` prevents extension; `abstain` permits exploration but prevents a final choice when a feasible considered option retains unknown objective evidence.

Exact lexicographic comparison provides a transitive frontier ordering. Present values precede unknown values only for bounded frontier scheduling, with canonical option IDs for remaining scheduling ties. Final ties compare every component against the exact best option using the supplied epsilon and retain every tied ID; an ID is never used to invent a final winner. A tie exceeding the retention bound causes abstention.

Checks enforce duration, per-use trims, reuse, hard node/requirement coverage, declared intended order, required-node dependencies and mutually exclusive complete branch choices. Unsupported creative relationship measurements remain unknown soft findings. Missing hard exclusions remain unknown and force abstention. Blocking Director findings cannot disappear. Coverage is explicitly structural; factual semantic satisfaction, capability feasibility, rendered quality, reaction correctness, continuity and synchronization are not asserted.

## Search and considered alternatives

Search starts with an empty root, enumerates included node/candidate/boundary actions deterministically, and expands a bounded beam. Every generated successor, including rejected ones, consumes one expansion/manifest unit. Each retained frontier has at most the supplied width. Search stops at maximum depth, the generated-state limit or an empty frontier.

Every actually generated option remains in the manifest with parent, ordinal, full component/missingness/constraint state, and separate expansion and final-retention dispositions. Reasons include `hard_constraint`, `duration_bound`, `candidate_reuse_bound`, `frontier_limit`, `search_limit`, `incomplete_required_evidence`, `incomplete_sequence`, `depth_bound` and `options_limit`. Exclusion from future expansion does not erase an already feasible terminal alternative. Ungenerated possibilities are never called considered. `exhaustive` and `globalOptimality` are always false.

## Runtime receipt and PlanningDecision

`runPlanning` produces retrievals, boundary sets, the manifest, an internal budget trace, `PlanningSearchRun`, `PlanningDecision` and exact supplied-artifact records. No caller outcome parameter exists. The receipt binds request/context, policy, manifests, seed policy, stopping reason, work count, outcome, budget and owned producer version.

The decision implements Gate-0 semantics: planningDecisionId/version/scope, searchRun, contextSnapshot, direction, candidateUniverse, alternativesConsidered, scoresAndMissingness, policy, constraintsChecked, outcome, uncertainty, evidenceRefs, budgetTrace and previousDecisions. Exactly one outcome is retained:

- `chosen(optionId)`: a real generated and retained feasible option;
- `tie(optionIds)`: nonempty generated/retained tied options with no winner;
- `abstained(reasonCode)`: missing required/objective evidence, an unresolved search limit or a tie that cannot fit the retention bound;
- `infeasible(no_feasible_considered_sequence)`: no feasible option in this bounded considered set, without claiming a globally infeasible edit.

Empty search cannot choose. Missing source support produces required-evidence abstention. Infeasibility/abstention have no chosen field. Uncertainty is `bounded_heuristic_uncalibrated`, with considered-set feasibility, deferred execution assessment and unverified creative quality.

Schema parsing is structural/identity validation, not an execution attestation. Consumers use `validatePlanningDecision`, `validatePlanningSearchRun` or the relevant replay validator. These recompute the exact operation and compare results; altered hashes, scores, pruning reasons, considered options or coordinated receipt/decision outcomes cannot pass by reidentification alone. Prior decisions are recursively replayed with scope and exact-byte checks. A preceding occurrence must come from an actual chosen prior option with the same exact candidate/token; a tie cannot authorize a made-up preceding winner. This is planning history, not evidence that an edit executed.

## Budget, identity and compatibility

The planner replays Gate-3 budget authorization, requires the same scope and positive CPU/elapsed-time/RAM authorization, and binds the exact grant and budget. Its internal trace reports deterministic generated-state work. Elapsed time, resource use and cost are explicitly unmeasured/unavailable. No fabricated ModelRun or CostEvent is emitted. Frozen `planning` telemetry requires measurements absent from this pure operation, so export is deferred. A future runtime must enforce measured deadline/resource spending; these finite work bounds do not prove compliance with a measured millisecond ceiling.

All output identities bind the context and policy. Transitive exact refs bind world/view/access query, source analysis and PTS/sample evidence, candidate universe/token snapshots, Director lineage, objective order and missingness, search/trim/reuse/tie bounds, enumeration, budget and prior planning history. Candidate binding sets and unordered ref sets are canonicalized; candidate/artifact input permutation does not affect set semantics. Ordered uses, ordered objectives and ordered preceding-use context remain order-sensitive. There is no persistent cache or hidden global memo; bounded history memoization is local to one replay invocation.

Public `DecisionEvent` still requires concrete plan/revision/slot, a complete compatible candidate list, winner and meaningful confidence. Those are unavailable here. There is no event export, fabricated identity or confidence, no schema change, and no change to the legacy Matcher/EditPlanner/LLMProvider seams. UEP remains frozen, including its actual 15–30 second limit. Internal source-duration policy does not change that compatibility contract.

No EditGraph, capability/technique execution, UEP projection, renderer, preview, FFmpeg, critic, repair or QC implementation is introduced. Tests and the source audit enforce absence of those dependencies from the planning core. Existing compatibility tests may exercise the previously accepted synthetic pipeline; that is regression coverage of existing code, not Gate-5 export or rendering.

## Test-first and self-review chronology

Receipts under ignored `.local-runs/phase5-gate5/` are local evidence, not committed artifacts:

1. `baseline.json`: pre-edit branch/HEAD, clean tracked state, SHA-256 for all 230 tracked files and owner evidence.
2. `first-failure.md`: immutable initial `npm.cmd run typecheck`, exit 2, TS2307 because `packages/planning/index.js` did not exist. Tests preceded production code.
3. Initial focused green: 36/36 under the no-network guard.
4. `self-review-scope-red.md`: 3 tests, 2 pass / 1 fail. A candidate-scoped node incorrectly retrieved another referenced candidate. Repair enforces the exact node scope and records `outside_direction_scope`.
5. `self-review-adversarial-red.md`: 15 tests, 14 pass / 1 fail. The new two-candidate synthetic fixture retained one-candidate coverage. Repair uses the accepted pure coverage helper over its actual candidate union. No protected fixture changed.
6. Intermediate focused green: 55/55, retained in `focused-tests.log`.
7. `self-review-missing-support-red.md`: 1 test, 0 pass / 1 fail. An empty supported-action set caused by missing source support incorrectly claimed considered-set infeasibility. Repair retains unknown required evidence through abstention.
8. Each repair passed its targeted regression before the final gates below.

The happy path uses an actual synthetic Gate-1 store lookup/reuse receipt, Gate-2 world/view, Gate-3 authorization/selection and Gate-4 request/direction/grounding/producer artifacts. It exercises deterministic retrieval, multiple supported trims/sequences, bounded search and exact replay. Separate fixtures prove all four outcomes. All evidence is synthetic; no media, model, network, GPU or Python operation supplies this result.

## Final verification

| Command / check | Result | Local evidence |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `typecheck.log` |
| `npm.cmd run build` | PASS | `build.log` |
| `node --import ./scripts/no-network.mjs --test dist/tests/planning.test.js` | 56/56 PASS; zero failed/skipped/cancelled | `focused-final.log` |
| No-network focused compatibility run, 16 files below | 377/377 PASS; zero failed/skipped/cancelled | `compatibility.log`, `compatibility-files.log` |
| `npm.cmd test` | 505/505 PASS; zero failed/skipped/cancelled; includes build and no-network guard | `full-safe-suite.log` |
| `npm.cmd run audit:workspace` | PASS: 71 application TS files; 9 existing runtime adapters statically checked | `workspace-audit.log` |
| Protected SHA-256 comparison | 24/24 protected files identical; 229/229 other baseline files preserved after excluding the authorized current-phase edit; owner evidence unchanged | `baseline.json`, `protected-byte-comparison.json` |
| `git diff --check` and additional new-file whitespace check | PASS | `final-workspace.log` |

Compatibility files are `director-boundary`, `world-model`, `budgeted-perception-routing`, `perception-evidence-store`, `editorial-common`, `editorial-token`, `editorial-decisions`, `editorial-ranking`, `editorial-semantic`, `editorial-reference-ranking`, `editorial-matcher`, `contracts`, `integration`, `serialization`, `telemetry`, and `evaluation` (each `dist/tests/<name>.test.js`). Contracts and integration cover existing validation and the existing synthetic pipeline. This run is separate from the Gate-5 focused count and overlaps the full safe suite.

No `test:media`, `test:python`, model, real-footage or network suite was run. The workspace audit reads the existing Python offline policy as text; it does not execute Python.

The protected comparison includes individual before/after SHA-256 values for every requested protected path: contracts, providers/index, editorial token/matcher, perception, world-model/index, routing/index, manifests/locks and test fixtures. The broader pre-edit inventory covers all 230 tracked files; only the authorized `docs/CURRENT_PHASE.md` edit differs. The owner recon hash remains `8023b8a7678f3a3e7f005d61ca3bb654749d34c7bc54229f6b834e808665a557`. Historical reports and existing source/tests are unchanged.

Final Git state remains on the required branch and HEAD, with no staged changes: modified `docs/CURRENT_PHASE.md`; ten new Gate-5 files enumerated above; and the pre-existing untracked `gate5-recon.txt`. Local logs, generated build output and safe-test scratch artifacts are ignored. `git diff --check` covers the tracked diff; the ten new files also receive an explicit trailing-whitespace check. Relative report links resolve. No commit, push, merge or PR was made.

PHASE 5 GATE 5 IMPLEMENTATION VERIFICATION: PASS

OWNER ACCEPTANCE: PENDING

GATE 6: NOT AUTHORIZED

## Remaining limits

V0 uses exact candidate links and a small deterministic beam, not learned semantic retrieval or global optimization. Unsupported hard exclusions require abstention. Candidate-level technical values are not trim-level reanalysis. Source duration is not output timeline duration. Search bounds can omit better alternatives. Scoring is uncalibrated; no creative/professional quality, real-footage generalization, executed edit or measured performance/cost is claimed. Persistent cache, production admission/measurement, semantic negative evidence, plan/use export binding, capability negotiation and execution remain outside this gate.

Independent owner acceptance remains pending. Gate 6 requires separate explicit authorization.

## Independent owner-review repair — 2026-09-24

Status: **implementation verification PASS; awaiting independent owner acceptance**.

This addendum records the narrowly scoped repair of the two owner findings. Earlier chronology, receipts and verification counts above remain historical evidence for the original implementation. The responsibility semantics below supersede the original blanket treatment of hard node coverage. Branch and HEAD remain `phase/5-edit-planner-v0` at `7b82de13cb49022d2f08cef577f4cb7056274fd9`; the existing uncommitted implementation is preserved.

Exactly six existing Gate-5 files change during this repair: `packages/planning/common.ts`, `packages/planning/scoring.ts`, `packages/planning/search.ts`, `packages/planning/boundary.ts`, `tests/planning.test.ts`, and this report. `docs/CURRENT_PHASE.md` retains its pre-repair bytes and pending-owner status. The two owner files, `gate5-recon.txt` and `gate5-owner-source-review.txt`, remain untouched and unstaged.

### Owner reds and additional adversarial evidence

All receipt paths below are relative to `.local-runs/phase5-gate5/`. Each was created separately; no existing receipt was overwritten.

| Receipt | Genuine result before its repair |
| --- | --- |
| `owner-review-baseline.json` | Required branch/HEAD and pre-repair SHA-256 inventory for 28 existing implementation, documentation, owner-evidence and receipt files; accepted tracked bytes matched the previous verification |
| `owner-review-cross-gate-red.md` | 1 test, 1 failure: a valid source/story node plus a hard whole-edit graphics intention without candidates produced `infeasible` instead of a usable source decision |
| `owner-review-boundary-accounting-red.md` | 1 test, 1 failure: one emitted full-range option referenced two distinct endpoints, but `evidencePointsUsed` reported four |
| `owner-review-obligation-lineage-red.md` | 4 tests, 4 failures: required explicit deferral, associated requirement/relationship lineage, preservation during missing support, and separation of bound operation source coverage from execution |
| `owner-review-self-review-responsibility-red.md` | After the first seven owner tests passed: 6 tests, 3 passed / 3 failed. A bound operation forced a duplicate source use; an operation tag incorrectly deferred a hard source exclusion; a mixed branch claimed completion despite deferred creative intentions |

The two required owner reds and the additional four-test lineage red preceded production edits. The three further defects were repaired only after their new regressions and separate red receipt. During test authoring, an intermediate build reported TS6133 for a replay-validator import whose intended test had not yet been added; completing that test resolved the test-only compiler failure. No production defect was inferred from it. The final targeted responsibility/authority run passed 20/20 tests before the complete verification below.

### Source responsibility and deferred creative obligations

The planner uses declared candidate bindings and the accepted typed intention discriminator. It never reads prose or missing source availability to decide responsibility:

- A node with no candidate binding retains a `no_source_binding` deferred obligation. Its absence of candidates does not create a pending source-use requirement or a fake use.
- The typed transition, sound-design, graphics, color, technique and music-relationship intentions retain an `operation_intention` deferred obligation when bound to candidates. Their declared source bindings are checked separately. An existing use of the exact candidate/token within the declared scope can satisfy that source-binding check; it cannot satisfy the creative operation.
- Source/story node coverage, required source dependencies, intended source order, trims, duration and reuse remain Gate-5 constraints. Other source/story nodes retain their own occurrence-purpose coverage. A different candidate cannot stand in for a bound operation's source target.
- Source-bound hard exclusions remain unknown and require abstention, including when attached to a typed operation. Only an exclusion tied entirely to unbound intentions is deferred. Blocking Director findings still block. Required candidates lacking factual/world support still yield `abstained(required_evidence_missing)`, including an empty supported-action set.

Each sequence and the overall alternatives manifest now require a canonical, unique `deferredObligations` list. Every record contains the node ID, original priority, associated requirement IDs, exact graph artifact and node pointer, deferral reason, and literal values `state: deferred`, `capabilityAssessment: not_performed`, and `executionAssessment: deferred`. Unknown fields, duplicate nodes, satisfaction claims and execution/capability authority fail strict schemas. The same manifest-level list survives empty, abstained and infeasible searches.

Associated include requirements/constraints and relationships retain deferred checks. Bound source coverage remains a separate pass/pending check. Hard-requirement coverage does not count a requirement with deferred creative obligations as fully covered. Mixed branches retain pending checks for incomplete source portions and deferred checks for remaining creative obligations; mutually exclusive source selections still fail. All conditional deferred nodes remain in the manifest, including alternative choices not selected for a source use. The exact parent graph preserves their branch applicability and relationships for a later consumer.

The search accepts a source sequence once its owned constraints are satisfied; `deferred` is neither a pass nor a source-completeness blocker. No capability assessment, executor authority, operation or later-gate graph is produced. A future authorized Gate 6 must resolve and enforce the retained graph obligations.

Deferred records participate in sequence and manifest identity. PlanningDecision and its runtime receipt bind that exact manifest. Regressions remove records, soften priority, substitute node pointers, and coordinate new sequence/manifest/receipt/decision hashes; semantic replay rejects the mutations. Removal from an otherwise empty manifest is also rejected against complete valid input artifacts. These checks prove that a caller cannot turn deferral into satisfaction or erase it by reidentification.

### Boundary evidence accounting

`evidencePointsUsed` now equals the cardinality of the distinct source timestamps appearing as start or end points of emitted boundary options. This counts actual referenced endpoint evidence, including candidate endpoints and sampled/frame PTS, once per timestamp within the exact candidate/source set. With four available evidence points and `maxOptionsPerCandidate = 1`, the full-range option reports two used points.

`evidencePointsAvailable` keeps its prior meaning: the candidate's two endpoints plus all available distinct interior sampled points in this proposal domain, before point or option limits. Proposal generation, precision authority and truncation logic are unchanged; no extra option is emitted to inflate usage. Tests cover point and option caps, complete versus truncated proposal sets, missing support with zero options, and rejection of a reidentified false usage count. Existing source/hash/token/shot/frame authority attacks continue to run.

### Post-repair verification

| Command / check | Result | New local evidence |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `owner-review-typecheck.log` |
| `npm.cmd run build` | PASS | `owner-review-build.log` |
| Gate-5 focused tests under `scripts/no-network.mjs` | 71/71 PASS, including 15 added repair regressions | `owner-review-focused.log` |
| Same 16-file compatibility set under `scripts/no-network.mjs` | 377/377 PASS | `owner-review-compatibility.log`; original `compatibility-files.log` preserved |
| `npm.cmd test` | 520/520 PASS; includes build and no-network guard | `owner-review-full-safe-suite.log` |
| `npm.cmd run audit:workspace` | PASS: 71 application TypeScript files and 9 existing runtime adapters | `owner-review-workspace-audit.log` |
| SHA-256 comparison | 24/24 protected files unchanged; all 229 accepted tracked files other than the pre-existing current-phase edit unchanged; current-phase edit preserved exactly during repair | `owner-review-protected-byte-comparison.json` |
| Repair preservation | Exactly six intended files changed; both owner text files and all 15 previously existing local receipts/logs unchanged | `owner-review-baseline.json`, `owner-review-protected-byte-comparison.json` |
| `git diff --check` and new-file whitespace check | PASS; no staged files; branch/HEAD unchanged | `owner-review-final-workspace.log` |

All three test runs have zero failures, skips, cancellations or todos. Verification remains synthetic and offline. No media, Python, real-model or real-footage suite was run. The audit's Python-policy check reads existing source text only. Existing and added tests reject public `DecisionEvent`, fabricated plan/slot identities, and later-gate graph/UEP output; the source audit rejects filesystem, provider, network, process and hidden clock/random/environment inputs in the planning core. No Gate-6 implementation or authority is introduced.

Final Git status retains the pre-existing modified `docs/CURRENT_PHASE.md`, the ten untracked Gate-5 implementation/test/report files, and the two untracked owner text files. New receipts, test output and build artifacts remain ignored. Nothing was staged, committed, pushed, merged or submitted as a PR.

The remaining limits above still apply. Deferred obligations are unresolved creative requirements, not proof of capability or execution. A bounded source-sequence choice does not establish full-edit feasibility or creative quality.

PHASE 5 GATE 5 POST-OWNER-REVIEW VERIFICATION: PASS

OWNER ACCEPTANCE: PENDING

GATE 6: NOT AUTHORIZED

## Final owner authority repair — 2026-09-24

Status: **implementation verification PASS; awaiting independent owner acceptance**.

The final owner finding falsified the preceding repair's blanket interpretation of an empty candidate list as a later-gate obligation. This addendum supersedes that interpretation and its exclusion rule. Earlier reports, counts and red receipts remain historical evidence. The prior prose-ownership test had encoded the same incorrect expectation for an unbound `story_beat`; that expectation is explicitly corrected in this repair.

The baseline is still `phase/5-edit-planner-v0` at `7b82de13cb49022d2f08cef577f4cb7056274fd9`. Exactly four existing files change in this repair: `packages/planning/scoring.ts`, the internal call in `packages/planning/search.ts`, `tests/planning.test.ts`, and this report. No schema, boundary-generation/accounting code, retrieval code, public contract or dependency changes. `docs/CURRENT_PHASE.md` retains its existing bytes and pending-owner status.

### Test-first evidence

New evidence is under `.local-runs/phase5-gate5/`; no previous file was overwritten.

| Evidence | Observed result before repair |
| --- | --- |
| `final-owner-baseline.json` | SHA-256 inventory of 42 existing Gate-5 files, receipts and owner text files; all previously verified tracked/implementation bytes matched; `CLAUDE.md` metadata recorded without reading contents |
| `owner-review-unbound-source-authority-red.md` | Three new tests, three failures before production edits: hard unbound story returned chosen; unbound source exclusion returned chosen; soft unbound story appeared as a deferred operation |
| `final-owner-first-green.log` | First repair: 20/20 targeted tests passed before further adversarial review |
| `final-owner-self-review-source-authority-red.md` | 21 tests, 18 passed / 3 failed: two real source-authority defects and one test-fixture canonical-ordering error |
| `final-owner-self-review-source-authority-confirmed-red.md` | After correcting only the fixture ordering and adding an operation-origin dependency test: 22 tests, 19 passed / 3 failed. Required unbound source dependency was called infeasible; an inactive alternative's include constraint vetoed a complete alternative; an operation deferred its required source dependency |
| `final-owner-self-review-mixed-branch-red.md` | One test, one failure: an unselected mixed branch deferred a hard source choice and allowed a winner |
| `final-owner-self-review-empty-dependency-red.md` | One test, one failure: an empty operation/source-dependency search reported infeasible rather than missing required evidence |
| `final-owner-repaired-targeted.log` | All 46 targeted ownership, branch, dependency, exclusion, replay and existing authority regressions passed after the bounded repairs |

The fixture-ordering failure was a rejected invalid test input, not a production defect. Every production defect above has preserved executable red evidence predating its correction. All source and operation intention cases use valid accepted Gate-4 graph constructors and the existing synthetic Gate-1/2/3 evidence chain.

### Corrected ownership and missing evidence

Ownership is determined by the accepted typed intention, never by prose or by an empty candidate list:

- `narrative_objective`, `story_beat`, `emotional_progression`, `sequence_intention`, `shot_role_intention`, `pacing_target` and `reaction_relationship` remain Gate-5 source/editorial obligations. An applicable unbound node produces an exact direction-backed constraint with `state: unknown` and `reasonCode: source_binding_unavailable`. It never enters `deferredObligations`.
- A hard unbound source obligation prevents a winner and yields `abstained(required_evidence_missing)`. A soft unbound source obligation remains an unknown soft finding and is nonblocking unless an explicit hard include or required dependency makes its fulfillment necessary. No candidate or source use is fabricated.
- Only the typed transition, sound-design, graphics, color, technique and operational music-relationship intentions produce deferred records. The existing `no_source_binding` reason now describes an unbound operation only. Bound operations retain separate exact source-binding checks and may share the already-selected exact source. Execution and capability assessment remain deferred/not performed.
- An exclusion is deferrable only when all its associated typed obligations are unbound operations. Any associated source/editorial obligation, or any bound source target, keeps missing negative/source evidence blocking. A hard source/content exclusion cannot become nonblocking through an empty candidate list or through operation words in its description. Global exclusion enforcement is preserved.

Hard `mustInclude` requirements and constraints attached to unbound source nodes retain unknown evidence. A `requires` edge keeps its source dependency in Gate 5 even when the originating intention is a deferred operation. A required source dependency with absent binding is unknown, including when the target node's own priority is soft; an available but unselected required source remains pending. Any operational relationship assessment stays separately deferred.

A source alternative becomes inactive only after an actual mutually exclusive source choice. Without such a choice, a mixed branch cannot delegate its hard source selection to Gate 6. Once a complete source alternative is selected, other branches' include constraints do not veto it; their exact conditional direction remains bound. An all-operation branch can still retain deferred execution obligations without fake clip uses. V0 can abstain when an unresolved mixed branch lacks source authority; this does not claim that every possible full edit is infeasible.

Empty searches remain auditable through the exact context, direction and decision evidence references, with required-evidence abstention for missing hard source authority and required source dependencies. There is no invented empty sequence. Tests verify exact direction resolution and replay in this case.

### Identity, replay and preserved boundaries

Unknown source checks remain identity-bearing sequence/manifest content. Tests remove checks, relabel them as passing and substitute direction pointers, then coordinate new sequence, manifest, receipt and decision hashes; replay rejects each mutation. Existing deferred-record mutation tests still reject removal, satisfaction claims and fabricated capability/execution authority. `deferredObligations` contains only the six accepted operation intention kinds; all seven source/editorial kinds are attacked at both hard and soft priorities.

Candidate/token/source/frame authority, bounded search, missing technical evidence, source-support abstention, per-occurrence identity and genuine ties remain intact. The previous `evidencePointsUsed` repair is unchanged. No public `DecisionEvent`, EditGraph, TechniqueGraph, CapabilityGraph, UEP, executor or media/model/provider operation is introduced.

### Workspace anomaly

`CLAUDE.md` was present and untracked at this repair's initial inspection. No applicable repository instruction required opening it, so its contents were not read. It was not edited, staged, deleted or committed. Its origin remains unexplained and is not attributed to this repair. Only filesystem metadata and Git tracking status are recorded for it; no content-hash claim is made.

`gate5-recon.txt`, `gate5-owner-source-review.txt` and `gate5-postrepair-owner-review.txt` remain separate owner evidence and are preserved without edits or staging.

### Final owner-repair verification

| Command / check | Result | New local evidence |
| --- | --- | --- |
| `npm.cmd run typecheck` | PASS | `final-owner-typecheck.log` |
| `npm.cmd run build` | PASS | `final-owner-build.log` |
| Gate-5 focused tests under `scripts/no-network.mjs` | 97/97 PASS; 26 added authority regressions, plus one corrected prior expectation | `final-owner-focused.log` |
| Same 16-file compatibility set under `scripts/no-network.mjs` | 377/377 PASS | `final-owner-compatibility.log`; original `compatibility-files.log` unchanged |
| `npm.cmd test` | 546/546 PASS; includes build and no-network guard | `final-owner-full-safe-suite.log` |
| `npm.cmd run audit:workspace` | PASS: 71 application TypeScript files and 9 existing runtime adapters | `final-owner-workspace-audit.log` |
| Protected SHA-256 comparison | 24/24 protected files identical; 229/230 original tracked files unchanged, with only the pre-existing current-phase edit differing from HEAD | `final-owner-protected-byte-comparison.json` |
| Repair preservation | Exactly four intended files changed; all 28 pre-existing local receipts/artifacts, all three owner text files and the pre-repair current-phase bytes unchanged | `final-owner-baseline.json`, `final-owner-protected-byte-comparison.json` |
| `git diff --check` and explicit new-file whitespace check | PASS; no staged changes; required branch/HEAD preserved | `final-owner-final-workspace.log` |

All final test runs have zero failures, skips, cancellations or todos. No media, Python, model or real-footage suite was run; the audit reads Python policy source without executing Python. Verification is synthetic and offline, with no creative-quality, executed-edit or global-optimality claim.

Final Git status retains the pre-existing modified `docs/CURRENT_PHASE.md`, ten untracked Gate-5 implementation/test/report files, three untracked owner text files, and the separately reported untracked `CLAUDE.md`. Its recorded size and last-write metadata are unchanged; its contents remain unread. Local verification receipts and generated output remain ignored. No staging, commit, push, merge or PR occurred. Owner acceptance is pending and Gate 6 remains unauthorized.

PHASE 5 GATE 5 FINAL OWNER-REPAIR VERIFICATION: PASS

OWNER ACCEPTANCE: PENDING

GATE 6: NOT AUTHORIZED
