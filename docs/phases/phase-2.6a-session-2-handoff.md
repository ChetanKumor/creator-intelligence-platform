# Phase 2.6A Session 2 — implementation handoff, not execution authorization

Architecture revision: `editorial-architecture-0.1.0`, frozen 2026-09-16 by Session 1 (started 2026-09-15). Read the [architecture decision](phase-2.6a-session-1-architecture.md) and [normative interfaces](phase-2.6a-editorial-contracts.md) first.

**SESSION 2 READY: NO. SESSION 2 STARTED: NO.** The design is internally ready against its captured baseline, but the 2026-09-20 final preservation check found externally introduced Phase 2 detector changes and additional audio/TransNetV2 files. Resolve the baseline/worktree mismatch described in the architecture amendment before implementation. A separate explicit instruction is required. No Phase 2.6B, Phase 3, model integration, Creative Ranker, training, audio/music processing, UI, benchmark recruitment or graph engine is included in this handoff.

## Exact implementation files

Create these files only after Session 2 authorization. Do not create a second public-contract registry or modify Phase 2 source files.

| File | Responsibility |
| --- | --- |
| `packages/editorial/common.ts` | Internal 0.1.0 envelope, availability, evidence refs, producer provenance, exact digest and identity conventions; reuse existing primitives and canonical serialization. |
| `packages/editorial/taxonomy.ts` | Fixed versioned task registry, task refs, input/outcome/type compatibility and reserved task validation. |
| `packages/editorial/token.ts` | Token and future-slot schemas, derived temporal getters, locality and cheap-missingness validations. |
| `packages/editorial/resolve.ts` | Pure adapter over explicitly supplied parsed artifacts and byte/hash metadata; bind candidate, analysis, run, configuration, ClipSegment, authorization and feature evidence. No disk discovery, model backend or cache repair. |
| `packages/editorial/decision.ts` | Candidate sets, contexts, options, observations, judgments, decision and timeline-linkage schemas; cross-record graph-compatible checks, without a graph engine. |
| `packages/editorial/benchmark.ts` | Case/project manifest schemas, artifact inventory, purpose and grouping evidence checks, deterministic leakage-component validation, freeze validation and task coverage. |
| `packages/editorial/experiment.ts` | Feature/ranker configuration declarations, experiment resources and challenger protocol/result schemas. No model/ranker implementation. |
| `packages/editorial/index.ts` | Explicit exports of new internal schemas/types/validators only. |
| `packages/evaluation/editorial.ts` | Metric protocol/report schemas, task-specific prediction validation and deterministic metric functions over supplied labels/predictions. No inference or invented labels. |
| `scripts/export-editorial-schemas.ts` | Independent draft-2020-12 exporter/checker with internal 0.1.0 URNs; does not change old exporter outputs. |
| `tests/support/editorial.ts` | Deterministic synthetic builders and a bounded read-only real-sidecar adapter fixture helper; no private source bytes in fixtures. |
| `tests/editorial-contracts.test.ts` | Strict schemas, missingness/versioning, identity, references, candidate-set and option validation. |
| `tests/editorial-token.test.ts` | Provider-free conversion, cheap support, locality edge cases and temporal/embedding joins. |
| `tests/editorial-decisions.test.ts` | Exposure/rejection separation, task judgments, context ordering, trim/reorder/replace/final-link semantics and legacy limitations. |
| `tests/editorial-benchmark.test.ts` | Purpose eligibility, creator/project/family/hash leakage, draft/frozen state, coverage and label-input isolation. |
| `tests/editorial-metrics.test.ts` | Hand-computable preference/ranking/classification/trim/next-shot/sequence cases, ties, missing predictions and zero denominators. |
| `tests/editorial-experiments.test.ts` | Resource missingness/deltas, comparison eligibility, KEEP/REJECT/INCONCLUSIVE prerequisites. |

Generate these **12** new structural schemas, all under `schemas/editorial/0.1.0/`:

1. `EditorialTaskTaxonomy.schema.json`
2. `EditorialToken.schema.json`
3. `EditorialCandidateSet.schema.json`
4. `EditorialContext.schema.json`
5. `EditorialDecision.schema.json`
6. `EditorialTimelineLinkage.schema.json`
7. `EditorialBenchmarkCase.schema.json`
8. `EditorialBenchmark.schema.json`
9. `EditorialMetricProtocol.schema.json`
10. `EditorialMetricReport.schema.json`
11. `EditorialExperiment.schema.json`
12. `EditorialChallengerDecision.schema.json`

Use `$id: urn:creator-intelligence:editorial:<ArtifactType>:0.1.0`. Export embedded supporting schemas through their parent records. Mark structural interchange versus mandatory semantic validation in `$comment`. Do not use the old interchange exporter's hardcoded 1.0.0 path/URN rule.

Existing files permitted for Session 2 integration: `package.json` (add editorial schema generation/check commands and append the editorial check to `verify`, without weakening existing commands or changing dependencies), `docs/CURRENT_PHASE.md` (state/evidence), and `docs/project-tree.txt` (regenerate through the inspected `scripts/project-tree.mjs --write`). No package-lock/uv.lock/dependency changes are expected. Add `docs/phases/phase-2.6a-session-2-verification.md` for append-only new results.

Do not edit `packages/contracts/`, `packages/domain/`, `packages/footage-analyzer/`, `packages/reference-analyzer/`, Python/model code, frozen schemas/fixtures, old evaluation modules or historical Phase 2 evidence. Reuse via imports. If a new requirement seems to demand those edits, document the incompatibility and stop that change rather than silently expanding Session 2 scope.

## Ordered implementation gates

1. Validate the Session 1 design and preserve a source/frozen-file baseline. Confirm exact file paths and installed build conventions. Implement common contracts and taxonomy, then token/reference adapters.
2. Add decision/context and task judgment validation. Reject inconsistent cross-record IDs and temporal relationships. Add no event collector or UI.
3. Add benchmark and grouping validators. Synthetic multi-project fixtures exercise split isolation; real Phase 2.5 artifacts remain one project and cannot supply independent split labels.
4. Add pure metric and experiment contracts/functions. Hand-computable synthetic outcomes prove arithmetic only. No real preference score or challenger result without real eligible inputs.
5. Export only the new schemas, run focused new tests, then the unchanged complete offline regression suite plus the new schema check. Preserve and explain increased test/artifact counts.
6. Perform the explicit read-only real-sidecar adapter check below. Record new evidence and readiness without advancing phases automatically.

## Explicit invariants and test matrix

| ID | Invariant / counterexample that must be tested |
| --- | --- |
| I01 | Frozen Phase 0/1/2 source/public schemas, model/revision/1152 real space and guards unchanged. New code cannot call an embedding provider, decoder, network client or model loader. |
| I02 | Candidate ID and proposal ID copied unchanged; project/source hash/config/analysis/run/authorization must agree. Same candidate represented by different snapshots cannot resolve as “latest.” |
| I03 | Exact-byte artifact hashes checked separately from canonical IDs. Reordered object keys preserve content ID; ordered arrays change it; reordered sets canonicalize. Unknown versions/fields, non-finite values, duplicate IDs and cross-project refs fail. |
| I04 | Tokens contain no vectors or raw measurement banks. Existing EmbeddingRef fields preserved; mismatched dimensions/model/revision/implementation/space fail. Stub and real evidence cannot mix. |
| I05 | All semantic temporal frame IDs survive, including distinct sample IDs sharing PNG/embedding IDs. Support list equality and nearest distance verified, with `[start,end)` membership. |
| I06 | Test inside support, distant same-shot support, equal-distance earlier-frame tie, different-shot rejection and **frame exactly at excluded end: borrowed support with distance zero**. No distance-based reclassification. |
| I07 | Cheap motion requires both comparison endpoints inside candidate and actual elapsed PTS. Test one-frame/borrowed cheap support and every nullable signal; measured zero remains present, missing never becomes zero. |
| I08 | Derived candidate/shot duration, source fractions and shot offsets agree with source PTS. VFR time comparisons do not use rounded FPS. First/last shot neighbors are not applicable. |
| I09 | Every feature, including absent future slots and derived locality, has a producer/config/source-evidence declaration. Future slots reject present payloads in 0.1.0. Failed states require error evidence. |
| I10 | Explicit candidate rejection differs from unselected, unpresented and uninspected. A completed pairwise preference can label a loser without making it absolutely unusable. Sequence alternatives may share candidates without contradictory candidate rejections. |
| I11 | Presentation order is recorded or explicitly missing. Re-presentation uses ordered observations. Selected/rejected and chosen/rejected-option sets are disjoint subsets; ties and abstentions are legal. |
| I12 | Observed outcomes, explicit judgments and editor reasons remain separate. Imported legacy winner-only evidence cannot manufacture inspection/rejection/reasons/confidence. |
| I13 | Previous context is temporally/ordinally prior; no current/future labels, explanations or final survival enter feature projections. Final linkage added later creates new history and no cyclic hash reference. |
| I14 | Trim preserves candidate identity and bounds; extension beyond candidate fails. Moment intervals may differ from candidate windows but need exact asset/hash/shot. Reorder preserves use IDs; replace identifies old/new uses; repeated candidate use is distinguishable. |
| I15 | Final survival requires declared final revision and grounded mapping. Incomplete/estimated alignment, missing timeline and download-only feedback cannot become exact survival or rejection labels. |
| I16 | Project, creator-mode, source-family, derivative and exact-hash grouping constraints propagate transitively. Same-source disjoint windows, cross-project re-encodes, multi-creator projects and different hashes in one family cannot leak. Unknown family evidence blocks frozen eligibility. |
| I17 | Missing training/export/annotation permissions are not inferred from existing local-evaluation permission. A reference resolves a real authorization; a schema-valid placeholder is not permission. |
| I18 | Benchmark IDs bind labels/config/splits/taxonomy/case snapshots. Label corrections create new versions; no test-label tuning. Counters derive from cases, including unjudged/abstained/failed and locality strata. |
| I19 | Metrics check task/case/input-snapshot equality. Test ties, partial ranking, multiple acceptable trims, empty cohorts, no positives/negatives, bad/foreign predictions, missing predictions and invalid probability sums. |
| I20 | Project-macro and case-weighted outputs remain distinct; component-level uncertainty never counts overlapping candidates as independent samples. Unspecified/insufficient uncertainty is unavailable. |
| I21 | Challenger comparisons require compatible paired cohorts/protocols and explicit resource scopes. Signed delta direction, zero-baseline relative delta and missing memory/compute are handled without invented zeros. All three verdict paths are tested against explicit policies. |
| I22 | No generalization/creative-quality claim from structural schemas, synthetic fixtures, cached features or old mechanical review. No production labels or final edits fabricated. |

### Read-only real adapter gate (Session 2)

Supply the final Phase 2.5 first-run bundle explicitly: `.local-runs/footage_36099c27-da31-40da-a3ec-0f5fe666f3da/`. Validate all nine analysis artifacts and 872 retained candidates through the new adapter, preserving 343 inside/529 borrowed supports, maximum distance 3.633333 seconds and the two end-boundary zero-distance borrowed cases. Preserve all candidate/proposal/aggregation/embedding IDs. Reference cached vectors only if separately required for reference integrity; no model load or cache repair. Missing referenced objects are a reported gate condition, never permission to infer anew.

Do not persist these nine sources as a labeled benchmark or call them train/test data. Persist only an adapter audit receipt under a new Session 2 local-run directory. Synthetic fixtures may model multiple projects and task decisions but must retain synthetic provenance.

### Commands after implementation

Run the smallest relevant compiled `tests/editorial-*.test.js` subset during development. Once ready:

```powershell
npm.cmd run typecheck
npm.cmd run test
node dist/scripts/export-editorial-schemas.js --check
npm.cmd run verify
```

`verify` must retain all existing Phase 0/1/2 gates and gain the new schema check. Avoid redundant reruns after the full suite passes unless a subsequent change warrants them. The prior baseline is 83 TypeScript / 6 media / 11 Python and 33 generated artifacts; new counts must be reported accurately. No fresh real-model gate is necessary for a provider-free contract adapter.

## Session 1 validation record

Session 1 produced documentation only after a no-write source/evidence audit. It mechanically verified the 66 indexed historical artifact hashes and all 872 persisted semantic-locality joins, including two zero-distance borrowed supports. The first ad hoc Python receipt reader assumed UTF-8 and stopped on a legacy UTF-16 receipt; an encoding-aware read completed successfully. This was an audit-reader issue; no source or historical receipt was changed.

The first documentation-link check also stopped on the not-yet-written Session 1 verification receipt linked from CURRENT_PHASE. The audit was ordered to create that receipt before the final link check. Neither audit-harness failure was a Phase 2 implementation defect; no failed check is counted as a pass.

Before the first write, a 245-file SHA-256 snapshot covered repository source/contracts/tests/schemas/docs, root configuration, final closure evidence and the three final production bundles. Final Session 1 preservation and documentation checks are recorded in the new `.local-runs/phase2_6a_session1_20260915/` receipts. Historical full-regression results remain separate from the new read-only checks. No test implementation, generated schema, model operation or benchmark score belongs to Session 1.

Final preservation result on 2026-09-20: FAIL against the initial snapshot. Earlier read-only checks are historical within this interrupted session; no claim is made that they validate the subsequently changed source. The final receipt lists the drift and keeps Session 2 blocked.
