# Phase 5 Gate 4 — Canon v0 / Director boundary

Date: 2026-09-23. Status: **implementation verification PASS; awaiting independent owner acceptance**. This is an internal boundary gate. It neither executes a Director model nor establishes editing quality. Phase 5 Gate 5 is not authorized by this record.

## Baseline and authority

Before editing, installed Visual Studio Git reported branch `phase/5-edit-planner-v0`, HEAD `b32bf73cbe2c80ebbcc5e87d9e09acbfed523e58`, no tracked changes, and only the expected untracked owner artifact `gate4-recon.txt`. That artifact was read as owner evidence and left untouched. Gate 3 was owner-accepted at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`.

The accepted [Creative Intelligence Architecture v1](phase-5-gate-0-creative-intelligence-architecture-v1.md), accepted [Gate 1](phase-5-gate-1-perception-evidence-store.md), [Gate 2](phase-5-gate-2-project-world-model-lite.md), [Gate 3](phase-5-gate-3-budgeted-perception-routing.md), and current source are authoritative. No protected public contract, legacy provider seam, EditorialToken, perception, world-model, routing, dependency, fixture, or frozen architecture file changed.

Tracked Gate-4 additions are `packages/director/common.ts`, `packages/director/canon.ts`, `packages/director/index.ts`, `tests/director-boundary.test.ts`, this report, and the bounded `docs/CURRENT_PHASE.md` update. The implementation remains uncommitted.

## Test-first chronology and self-review

The first focused test preceded the production module. `npm.cmd run typecheck` failed because `../packages/director/index.js` was absent; dependent implicit-type diagnostics followed. The genuine output is preserved without overwrite at `.local-runs/phase5-gate4/first-failure.md`.

After initial green, adversarial self-review added regressions before each repair. The first self-review receipt, `.local-runs/phase5-gate4/self-review-red.md`, records 25 focused tests, 19 pass and six fail. It exposed mutable nested Canon data, ignored Canon selection fields and inapplicable domain, order-sensitive graph identity, schema-only prior-direction acceptance, and foreign optional/diagnostic evidence. The second receipt, `self-review-second-red.md`, records 28 tests, 25 pass and three fail: false unresolved subjects, a partially grounded hypothesis with no factual grounding, and success with no eligible Gate-3 model. The third receipt, `self-review-third-red.md`, records 31 tests, 27 pass and four fail: ungrounded optional ID views, contradictory failure missingness, and abstention findings absent from or inconsistent with grounding. All receipts are ignored local evidence; prior red results remain intact. The pre-owner-review focused suite passed 35/35.

Independent owner review then found two further authority gaps in this uncommitted implementation. Regression tests preceded both production repairs. `.local-runs/phase5-gate4/owner-review-red.md` records the first confirmed red run: 38 focused tests, 35 pass and three fail because invented constraint subjects, hard constraints opposing hard intent, and undisclosed soft contradictions were accepted. `.local-runs/phase5-gate4/owner-review-second-red.md` records the second confirmed red run: 44 focused tests, 35 pass and nine fail; the additional six failures show that proposal failure code, stage, retryability, affected refs, dependency failures, and same-scope evidence could all change without changing the producer receipt. The earlier first-red and three self-review-red receipts were not overwritten. A later scope probe for nonfailed failure missingness passed because the existing validator already checks those evidence refs; its preserved green control is `owner-review-adjacent-green.md`. The final focused suite after repair and adjacent attacks passes **48/48**.

## Canon v0

Ten compact first-party entries are authored in this gate. Their six categories are narrative grammar, pacing, continuity, coverage, music, and restraint. They express contextual guidance such as structure, cause/reaction, visual variety, pacing, music intention, continuity, subject coverage, and avoiding over-editing. These are editorial principles, not empirical claims about any project.

Each strict entry binds a stable key/version and semantic ID, first-party authorship/source revision, an internal ownership basis, applicable domains, category, typed prerequisites, compatible/conflicting entry keys, failure modes, and explicit missingness for external license, rubrics, examples, and recipes. The internal ownership statement is first-party authorship in this repository revision; it is not an independent external license attestation. No example, external license, TechniqueGraph operation, or executor recipe is claimed. The exported catalogue is deeply immutable and exact selected entry content is checked against it.

Canon selection is explicit and nonempty. `CanonView` sorts the declared set, binds exact `ArtifactRef` type/version/bytes, scope/domain, selection policy, digest, and semantic view ID. Unknown, altered, foreign-domain, conflicting, and `latest` entries fail. A requested conflicting entry is never silently removed. Semantic content identity remains separate from exact-byte artifact identity, including when different JSON bytes parse to the same entry.

## Intent and candidate summary

`IntentSpec` records only explicit author, revision/parent, goal, domain, audience, output requirements, and must-include/exclude requirements. Requirement IDs are unique and typed hard/soft. Intent prose is untrusted content, including timestamp-looking prose; it is never a fact, budget grant, access grant, or source range. Exact parent and scope are replayed for revisions.

`DirectorCandidateSummary` names an exact accepted `EditorialCandidateSet`, exact token snapshots, world snapshot/view, explicit candidate entries, declared coverage, and exact omission inventory. It reuses accepted candidate-set semantic validation and requires membership in the pinned world. It neither retrieves, ranks, chooses, nor truncates candidates. A summary or candidate set that omits part of its declared universe forces an explicit blocking finding in direction; success cannot claim complete coverage from it.

## Director request and routing authority

The strict `DirectorRequest` carries every Gate-0 conceptual field. Exact supplied `IntentSpec`, Canon view, candidate summary, world snapshot/view, ComputeBudget, and ModelSelection are semantically replayed. `queryWorld` checks the pinned world view and current caller-declared access; `validateCandidateSet` and world links bind candidate IDs to exact token snapshots. Gate-3 budget authorization and model selection are replayed, including chosen-profile eligibility. Selection capability is `director_reasoning`, scope and budget match the request, and `inputViewDigest` binds the preselection request inputs without a circular selection/request ID.

The capability snapshot states `selection_only_no_execution`; it grants no executor access. Audio/music, reference grammar, and EditingDNA are explicitly missing in this v0 boundary. Present audio/reference ID views are rejected because no accepted Gate-4 semantic source could prove their IDs. Prior-direction revisions require an exact revision-scope artifact, budget allowance, matching world/candidate universe, and semantic replay of the prior request and graph. No ambient selection, fallback, retry, retrieval, clock, randomness, filesystem, process, or network input exists.

## Creative direction and hypotheses

`CreativeDirectionGraph` has 13 owned typed intention families: narrative objective, story beat, emotional progression, sequence intention, shot role, pacing, reaction relationship, music relationship, transition, sound design, graphics, color, and technique intention. Nodes carry ID, hard/soft priority, bounded scope, exact candidate/token references, factual evidence refs, Canon keys, creative hypothesis refs, requirement IDs, and explicit qualitative/unknown uncertainty. The graph binds exact request, world snapshot, candidate universe, revision, and parent.

Edges express editorial relationships, not source chronology. All referenced nodes must exist; ID collections are canonical and unique. Dependency/order cycles and conflicting hard constraints fail. Soft conflicts require explicit unresolved findings. Alternative branches name sorted, disjoint choices with explicit mutual-exclusion links; cross-choice dependencies fail. Findings must correspond to actual missing hard requirements, soft conflicts, candidate omissions, world incompleteness, or supplied intent. Unknown or foreign candidates, token snapshots, Canon entries, hypotheses, or factual evidence fail.

Independent owner-review repair restricts every `CreativeConstraint.subjectId` to an exact requirement ID in the supplied `IntentSpec`. Output and must-include requirements have `include` polarity; must-exclude requirements have `exclude` polarity. An opposing hard creative constraint fails even when a separate node structurally addresses the requirement. An opposing soft constraint survives only with an explicit nonblocking `soft_conflict` finding. Candidate IDs and arbitrary opaque IDs have no constraint-subject authority. Existing candidate/token validation is unchanged.

No graph field carries trusted `sourceStartSeconds`, `sourceEndSeconds`, `sourceRange`, frame/sample index, PTS, timecode, `outputStartSeconds`, clip operation, filter graph, path, URL, plan ID, or slot ID. Strict parsing rejects those structured fields at multiple levels. A quoted timestamp in a description remains untrusted text. A music beat ID cannot be asserted while the audio evidence view is unavailable. Technique nodes refer only to Canon intention; no TechniqueGraph or executable recipe exists.

`CreativeHypothesis` is a separate creative artifact. Direct factual grounding resolves only through the authorized world view; prior hypotheses remain creative dependencies and cannot become ObservedFact or DerivedObservation. World snapshots are not mutated.

## Result, grounding, and authority

The owned grounding report is recomputed from exact request/direction refs. It inventories verified candidate/token bindings, authorized factual evidence, selected Canon keys, creative hypotheses, optional IDs, and unresolved findings, with `grounded`, `partially_grounded`, or `unresolved` reference status. This status verifies reference integrity and disclosure, not creative merit or fact accuracy.

`DirectorResult` is built from a strict creative proposal plus separately supplied runtime refs. A synthetic-test or human-authored internal producer receipt binds request, selection, direction, grounding, and outcome; model output cannot author these fields. Successful/partial direction requires an eligible Gate-3 selection. Success requires a valid nonempty direction and no blocking finding. Partial requires a direction and explicit unresolved findings. Abstained has no direction and exact unresolved reasons. Failed has no direction and a sanitized failure. Invalid/foreign directions cannot be relabeled successful. Failure evidence is scoped. Numeric model self-confidence has no calibrated-probability field.

Independent owner-review repair makes the internal producer receipt attest the exact sanitized failure value as well. `failed` receipts require a present failure; every nonfailed receipt requires `not_applicable`. Result construction compares the proposal failure to that exact receipt, then checks its diagnostic refs against scope. A schema-valid, same-scope failure mutation cannot become trusted runtime failure without a different runtime-owned receipt. Abstention remains distinct from failure. The receipt represents only Gate-4 internal synthetic-test or human-authored boundary evidence; it is not a public ModelRun, CostEvent, or actual model execution record.

The frozen public `OperationSchema` has no truthful Director operation. Gate 4 therefore keeps `modelRun` and `costTrace` explicitly missing, emits no `CostEvent`, `ModelRun`, public `DecisionEvent`, fake plan, revision/slot winner, or billing claim, and performs no model call. A future actual-model adapter and truthful telemetry mapping require separate authorization.

## Verification and limits

Under the repository no-network guard, focused Gate-4 tests pass **48/48**; focused Gate-1/2/3, editorial common/token/candidate/matcher, contracts, telemetry, and evaluation regressions pass **254/254**; `npm.cmd test` passes **449/449** safe TypeScript tests with no failure, skip, or cancellation. `npm.cmd run typecheck`, `npm.cmd run build`, `node --import ./scripts/no-network.mjs scripts/audit-workspace.mjs`, and `npm.cmd run audit:workspace` pass. The workspace audit covers 64 application TypeScript files and nine explicit local runtime adapters. `git diff --check` passes.

All 16 protected paths are byte-identical to HEAD. Fifteen supplied SHA-256 strings match directly. The supplied `packages/contracts/edit-plan.ts` string has **65** hexadecimal characters, so it cannot be a SHA-256 digest; the actual 64-character digest is `7411177393d826bfe8af27084c68ee721206fc40c5c494422fac8e86f2d1babb`, and Git confirms the file matches HEAD exactly. This prompt-evidence discrepancy is recorded rather than changing the protected file or claiming the malformed value matched.

No model, pretrained inference, provider, media decode, GPU, Python/media suite, real footage, or external network operation was run. Fixtures are synthetic. The gate proves strict boundary behavior under supplied artifacts, not current production authorization, actual Director model eligibility, semantic satisfaction of prose requirements, creative quality, professional editing quality, or live multiworker budget safety. Hard requirement “addressed” means a structurally bound direction node or exclusion constraint; it is not a human quality judgment. Exact external runtime supply and current access/capacity rechecks remain obligations of later execution boundaries.

**Phase 5 Gate 4: implementation verification PASS; awaiting independent owner acceptance.** Gate 5 is not started or authorized by this implementation record.

Next gate name only: **Phase 5 Gate 5 — Retrieval / sequence / exact boundary planning**.
