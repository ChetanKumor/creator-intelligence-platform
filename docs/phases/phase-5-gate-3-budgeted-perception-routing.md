# Phase 5 Gate 3 — Budgeted perception / model routing

Date: 2026-09-23. Status: **OWNER-ACCEPTED** at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f` after independent owner review, bounded repair and final independent verification. Gate 4 is owner-authorized for bounded implementation but has not started.

## Baseline and scope

Work began on clean `phase/5-edit-planner-v0` at `91ea7491821b07a691c9c3c870c77cca223fdfba` (`docs: close project world model gate`). Gate 2 implementation is `2c9b80b49549d5c56b7cdb48d39aeb4d58d1bae2`. The accepted [Gate 0 architecture](phase-5-gate-0-creative-intelligence-architecture-v1.md), accepted [Gate 1](phase-5-gate-1-perception-evidence-store.md), accepted [Gate 2](phase-5-gate-2-project-world-model-lite.md), and current repository source govern this bounded internal control plane. Gate 4 was not started.

Only `packages/routing/index.ts`, `tests/budgeted-perception-routing.test.ts`, this report, and the bounded current-phase note are tracked Gate 3 edits. There are no dependency, public contract, provider, perception, world-model, editorial, analyzer, cache-formula, schema, or fixture edits.

## Test-first chronology

The focused test file preceded production code. `npm.cmd run typecheck` first failed because `../packages/routing/index.js` was missing. Exact output is preserved, without later overwrite, at ignored `.local-runs/phase5-gate3/first-failure.md`. After an initial focused green, self-review found that a fresh authorization lacked an exact selected-profile-to-computation join. Its test-first compiler failure is preserved separately at `.local-runs/phase5-gate3/self-review-failure.md`. The repair added exact computation identity, selected model/revision/adapter matching, and selection replay. Later focused tests tightened exact evaluation authorization, budget/reservation joins, and CostTrace joins.

## Internal representations and pure decisions

Strict, versioned internal schemas cover `ModelProfile`, `ComputeBudget`, `Reservation`, `ModelSelection`, `RoutingDecision`, and `CostTrace`. Unknown fields, unsafe/nonintegral limits, mutable revision aliases, duplicate candidate/child/reservation references, unresolved exact artifacts, and scope mismatches fail. Semantic IDs use repository canonical finite JSON and `contentId`; exact supplied bytes retain their separate SHA-256 artifact references. Declared sets are canonical, while the Gate 1 computation identity retains ordered inputs. Functions return defensive copies and keep no mutable registry.

`ModelProfile` binds provider-neutral model and immutable revision evidence, adapter version and implementation digest, capabilities/modalities, deployment, tier and quality evidence, context, latency/cost estimates with explicit missingness, resource and licensing evidence, commercial eligibility, availability and observation time. Synthetic tests use invented tier/economic numbers; no production quality or price is asserted. An exact, separately granted evaluation artifact must name model, revision, adapter and requested capability before its tier can establish eligibility.

`selectModel` evaluates only caller-supplied exact artifacts and policy. It records all candidates, eligible profiles, owned exclusion reason codes, estimates, snapshot, budget reference, input-view digest, deterministic cost/latency/profile-ID order, chosen availability, rationale and explicit fallback/escalation policy reference. Missing required estimate is not zero. No quality benchmark, automatic tier change, hidden fallback, or retry occurs. `routePerception` accepts a supplied result from an authorized Gate 1 lookup. An exact hit preserves the receipt, output and original selected attempt and claims no new ModelRun or selection. All non-hit states stay unavailable unless a cache miss has a separate exact computation identity, valid authorized budget, explicit active reservation set, replayable eligible selection, and passing supplied guard evidence. `fresh_compute_authorized` is permission for a future attempt only; it has no provider callback or execution hook.

`ComputeBudget` has finite, safe, nonnegative integer ceilings for CPU/GPU time, RAM/VRAM peaks, API and total INR micros, elapsed wall time, call count, render work, premium calls, retries and Director revisions. Zero forbids. It binds exact compute authorization, scope, tier, child allocation references and reservation policy. Explicit child allocations and supplied active reservations are checked against the parent. CPU/GPU time, spend, work and calls are cumulative; RAM/VRAM are parallel peaks; wall time is an elapsed ceiling checked per allocation. Reservation is an allocation record, never measured consumption. This pure check supplies no durable multiworker concurrency control.

The guard is a caller-supplied exact artifact with matching project/creator/purpose and declared pass/fail/unavailable status. Missing or failed guard evidence blocks authorization even with budget. No OS, GPU, network, model or provider probe is implemented. Current external capacity, grants, availability and active reservations must be rechecked at execution by a future separately authorized boundary.

`CostTrace` stores projected/authorized/reserved/observed fields separately and references the existing public CostEvent as the sole accounting event. It verifies exact supplied CostEvent and ModelRun bytes through existing schemas, operation/attempt, telemetry scope, selected model and run joins when present. Missing billing stays missing; no zero-valued public event is generated and no CostEvent amount is copied into another ledger. Reuse outcome binds the exact Gate 1 receipt output and selected attempt, disallows a new inference ModelRun, and does not charge historical inference again. A measured current retrieval CostEvent may be linked separately if actually supplied. Synthetic public cost evidence remains synthetic under the frozen schema.

## Verification and limits

Focused Gate 3 tests use synthetic fixtures only. Final local verification: `npm.cmd run typecheck` PASS; `npm.cmd run build` PASS; focused Gate 3 tests **16/16** PASS; Gate 1, Gate 2, telemetry, contracts and evaluation compatibility tests **100/100** PASS; `npm.cmd test` under the no-network guard **384/384** PASS with zero failures/skips; `npm.cmd run audit:workspace` PASS over 61 application TypeScript files and nine explicit local runtime adapters. `git diff --check` and the protected-path diff against HEAD PASS. Final `git status --short` contains only this report, `docs/CURRENT_PHASE.md`, `packages/routing/`, and the focused test file.

Gate 1 lookup, including its foreign/revoked/expired non-discoverability, remains the source of cache authority; a caller-supplied lookup result is not an independently authenticated store transcript. This module neither enumerates Gate 1 nor broadens Gate 2. Evaluation attestations are supplied evidence, not benchmark results; neither quality nor production pricing is established. The in-memory reservation validator cannot prevent a race between workers or prove a current machine/provider capacity snapshot.

No model load, inference, media decode, GPU work, provider call, external network call, or Python/media suite was run. At that implementation checkpoint, status was **implementation verification PASS; awaiting independent owner acceptance** and Gate 4 was not yet authorized. This statement is retained as historical chronology and is superseded by the owner-acceptance section below.

## Independent owner review repair

The preceding implementation PASS is historical local verification, not owner acceptance. Independent review found seven bounded correctness defects: generic compute grants did not constrain ceilings; child and reservation accounting conflated cumulative, concurrent peak and elapsed limits; fresh reservations did not cover the chosen profile; generic guard and availability payloads could be replayed; quality requirement and model evaluation were conflated; exact artifact type and semantic validator joins were incomplete; and CostTrace could attach unrelated operations or reuse inference charges. Routing output could also publish unvalidated optional authorization IDs. The owner-supplied untracked `gate3-owner-review.txt` was read and left untouched.

Tests for all owner findings were added before production repair. The first focused owner run is preserved at ignored `.local-runs/phase5-gate3/owner-review-red.md` (30 tests, 16 pass, 14 fail). An initial test-only `guard: undefined` compiler error under exact optional types is noted separately in `owner-review-fixture-compile.md`; the test omitted that property before the focused red capture. The child premium/retry test initially reached the independent peak defect first, so its fixtures were separated and a confirmed 16-pass/14-fail focused run was preserved in `owner-review-red-confirmed.md`. Earlier `first-failure.md` and `self-review-failure.md` remain untouched.

The bounded repair introduces an exact `ComputeAuthorization` artifact with scope, tier, all resource/work/spend ceilings, premium allowances, retry/revision ceilings and reservation-policy identity. Every budget consumer replays that authorization. Child cumulative limits, premium calls and retry/revision allowances aggregate; child RAM/VRAM and elapsed limits are per child. Reservations bind exact parent and declared child allocation refs plus an immutable supplied `ReservationHistory` ref. Historical reservations are replayed through exact bytes; cumulative limits count released and active history, while RAM/VRAM sum only active entries. A child allocation cannot be reserved twice. These pure validations cannot guarantee that a caller supplied a complete history or prevent a multiworker race.

Model selection now reads a distinct exact `QualityRequirement` and an exact `ModelEvaluation` constrained by a separately supplied `EvaluationAuthorization` naming the eligible model/revision/adapter/capability set. Typed model availability and snapshot artifacts bind model identity. Fresh routing replays exact budget, selection and reservation artifacts, verifies the chosen profile's required CPU/GPU time, RAM/VRAM, projected total/API cost, latency and call count against the reservation, and requires a typed `RoutingGuard` binding computation, capability, selection, chosen profile, reservation, resource evidence, check time and policy. Routing decisions retain exact authorization refs only in the fresh state; reuse ignores irrelevant fresh arguments and unavailable outputs do not publish unvalidated authority.

CostTrace replays exact budget, reservation and selection artifacts. Linked public telemetry must truthfully represent the selected operation, selected model and adapter; a ModelRun must agree with the trace outcome. Projections agree with the exact chosen profile estimates in this bounded policy. Reuse permits no public CostEvent because this gate has no truthful frozen public operation for current retrieval/validation billing. Missing billing remains missing, and historical inference cost is never copied or charged again.

After the first repair green, self-review exposed reuse of one declared child allocation and acceptance of a schema-valid forged prior reservation. Regression-first red evidence is preserved at `owner-repair-self-review-red.md` (33 tests, 30 pass, three fail); recursive prior-reservation replay, allocation single use and routing reader state invariants repaired them. A later regression for a CostEvent omitting the selected model and a failed ModelRun on a succeeded trace was preserved at `owner-repair-trace-red.md` (33 tests, 32 pass, one fail), then repaired. The focused suite passes 33/33 after these repairs.

The original pre-review verification counts above remain historical. Final owner-repair verification counts and path audit follow. At that intermediate checkpoint, status remained **implementation verification PASS; awaiting independent owner acceptance** and Gate 4 remained unauthorized. This was before the final independent closure review.

## Owner-repair final verification

On the unchanged `phase/5-edit-planner-v0` branch at `91ea7491821b07a691c9c3c870c77cca223fdfba`, final `npm.cmd run typecheck` and `npm.cmd run build` passed. The no-network focused Gate-3 suite passed **33/33**. Gate-1 and Gate-2 focused regressions passed **65/65**, and contracts, telemetry and evaluation regressions passed **35/35** (compatibility total **100/100**). The full safe `npm.cmd test` passed **401/401**, with zero failures, skips or cancellations. `npm.cmd run audit:workspace` passed across 61 application TypeScript files and nine local runtime adapters.

`git diff --check` passed. Read-only Git diff audits found no tracked changes in `packages/contracts/`, `packages/providers/index.ts`, `packages/editorial/`, `packages/perception/`, `packages/world-model/`, dependency manifests/locks, `tests/fixtures/`, analyzer paths or scripts. The changed-path audit shows only this Gate-3 module, its test, this report and `docs/CURRENT_PHASE.md`; pre-existing untracked `gate3-owner-review.txt` was left untouched. Ignored red receipts remain preserved. No commit or push occurred.

Adversarial review checked arbitrary budget minting, cumulative and concurrent accounting, declared child allocation joins, chosen-profile reservation coverage, generic guard replay, model-independent availability, separate requirement and evaluation, exact artifact types and replay, route state evidence, operation joins and reuse billing. The two newly found defects were regression-first repaired with the separate red receipts above. The pure supplied history does not prove that a caller supplied every real-world reservation or prevent concurrent workers from racing. No model, media, GPU, provider, Python or network operation was run. The earlier statement that a current retrieval CostEvent could be linked is superseded here: the frozen public operations cannot truthfully label it, so reuse CostTrace permits no public CostEvent in this gate.

At the end of the implementation/repair run, status was **implementation verification PASS; awaiting independent owner acceptance**. The next gate name was **Phase 5 Gate 4**, but it had not yet been authorized or started. Final owner acceptance occurred afterward and is recorded below.

## Owner acceptance

Independent owner closure review accepted Phase 5 Gate 3 at implementation commit `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`.

The final independent closure verification confirmed:

- typecheck PASS;
- build PASS;
- Gate-3 focused suite **33/33**;
- Gate-1 and Gate-2 compatibility **65/65**;
- contracts, telemetry and evaluation compatibility **35/35**;
- compatibility total **100/100**;
- full safe suite **401/401**, zero failures, skips or cancellations;
- no-network workspace audit PASS across 61 application TypeScript files and nine local runtime adapters;
- protected-path diff empty;
- `git diff --check` PASS;
- aggregate verification `FAIL_FLAG=0`;
- no model, media, GPU, provider, Python or network operation.

The implementation commit was amended before acceptance only to remove two trailing blank lines from the focused test file; no semantic implementation or test behavior changed.

Gate 3 is therefore **OWNER-ACCEPTED** at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f` within its bounded scope.

This acceptance does not claim production model quality, production pricing, live capacity measurement, durable multiworker reservation locking, Director quality, retrieval/search quality, sequence construction quality, or professional-edit quality.

**Phase 5 Gate 4 is owner-authorized for bounded implementation but has not started.**
