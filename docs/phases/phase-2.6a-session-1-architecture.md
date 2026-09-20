# Phase 2.6A Session 1 — Editorial architecture decision

Session started: 2026-09-15. Architecture freeze: 2026-09-16. Decision: **frozen for the Session 2 handoff**. Status: internal/pre-stable design, not an implemented or public contract.

> Final workspace gate, 2026-09-20: **FAIL; SESSION 2 READY: NO**. The 2026-09-16 design freeze remains scoped to the audited Phase 2 baseline. Later workspace drift is documented in the amendment below and supersedes the earlier readiness ruling.

## Scope and authority

The owner's Session 1 instruction authorizes architecture audit and design only. Phase 2 remains CLOSED. Session 2, Phase 2.6B, Phase 3, new perception models, audio/music processing, Creative Ranker, training, planning and graph implementation are not authorized by this document.

Read with the normative [contract specification](phase-2.6a-editorial-contracts.md) and [implementation handoff and gates](phase-2.6a-session-2-handoff.md). These three documents form architecture revision `editorial-architecture-0.1.0`. A change to a frozen choice requires a dated amendment identifying the affected contracts and gates; readiness does not authorize execution.

## Evidence and no-write audit

The audit completed before any repository write. It read `AGENTS.md`, `docs/CURRENT_PHASE.md`, the three footage documents, the Phase 2.5 closure specification, and final closure receipts and production sidecars. There is no `.git` metadata; no Git provenance is invented. `rg` is unavailable; scoped PowerShell enumeration and source reads were used instead.

| Evidence class | Finding |
| --- | --- |
| Current source, read-only | Existing candidate, measurement, semantic frame, embedding, aggregation, cache, run, serialization, evaluation and schema code inspected; reuse map below. |
| Current persisted artifacts | All 66 files listed by the final closure evidence index match their SHA-256 entries. All 872 persisted candidates have resolvable same-shot semantic support and matching nearest support distances. Counts: 343 `within_segment`, 529 `same_shot_context`; maximum 3.633333 seconds (floating-point value 3.633332999999997). |
| Historical fresh real-model evidence | Nine authorized real assets, 96 unique semantic frames, 1152 dimensions, 872 retained candidates. First run: 96 fresh frame operations. This session does not repeat inference. |
| Historical cached real-model evidence | Immediate and stable repeats: 96 frame hits, 872 aggregate hits, zero new inference or decoding. |
| Historical regression evidence | `npm.cmd run verify`: 83 TypeScript / 6 media / 11 Python tests, 33 generated artifacts, exit 0. These are preserved results, not fresh Session 1 test runs. |
| Historical review | Nine source reviews, 45 retained examples and 18 full provenance examples. Codex mechanical visual review; not an external human creative-quality score. |
| Missing evidence | No editorial labels, exposed alternative sets, editor preference judgments, final-edit alignments, benchmark splits, calibrated usability labels or challenger scores were established by Phase 2.5. |
| Assumption for design | Session 2 will consume explicitly supplied immutable analysis bundles; it will not discover footage or infer editing history. |

Sources: [closure report](../../.local-runs/phase2_5_resume_20260915/verification-report.md), [real receipt](../../.local-runs/phase2_5_resume_20260915/real-verification.json), [source audit](../../.local-runs/phase2_5_resume_20260915/final-source-audit.json), [review index](../../.local-runs/phase2_5_resume_20260915/review/review-index.json), [evidence index](../../.local-runs/phase2_5_resume_20260915/evidence-index.json).

The pinned model remains `google/siglip2-so400m-patch16-naflex`, revision `cc24074f717b612951c2dead130904ab9b65a81e`, CPU, 256 patches, dimension 1152, space `space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687`. No provider, preprocessing, guard, threshold or embedding identity change is proposed.

## Reuse map

Paths below are repository-relative. Existing files in this table are read-only dependencies of the new architecture.

| Surface | Current truth | Reuse / required new layer |
| --- | --- | --- |
| `packages/contracts/creative.ts` — `ClipSegmentSchema` | Frozen 1.0.0; `segmentId` equals candidate ID; source range, embedding refs, unknown domain labels, producer/model-run refs. No project or locality payload. | Keep unchanged. Optional link from a retained token to its validated ClipSegment. Never put cheap scores into its nullable quality probabilities. |
| `packages/footage-analyzer/protocol.ts` — `CandidateSchema` | Asset/shot/range/candidate ID, proposal version/config ID. | Reuse this exact value once in token identity; do not create a second proposal identity formula. |
| `candidates.ts` — `CandidateSegmentProposer` | Proposal ID binds config and ordered measurement IDs. Candidate ID binds asset, shot, source interval and proposal ID. | Preserve identity even if future feature representations change. A candidate ID alone is not a feature snapshot. |
| `protocol.ts` — `CheapEvidenceSchema`, `NumericSignalsSchema` | Raw measurements and IDs; nine aggregate signals; three temporal signals nullable. | Reference aggregate signal fields and contributing evidence, not a copied raw measurement bank. Wrap nulls with explicit reasons in the resolved view. |
| `packages/reference-analyzer/protocol.ts` — sample/measurement/shot/metadata | Actual PTS, frame index, comparison sample and elapsed time; source shots and VFR metadata. | Reuse timebase, measurement joins and units. Derive relative position without using rounded display FPS. |
| `protocol.ts` — `SemanticFrameSchema`; `frame-bank.ts` | Semantic frame ID is `sampleId`; PNG hash, source PTS/shot, selection reasons and EmbeddingRef. Duplicate PNGs may share embedding but retain temporal IDs. | Preserve temporal sample IDs, not only unique embedding IDs. |
| `packages/contracts/common.ts` — `EmbeddingReferenceSchema` | ID, object ID, space ID/version, dimensions, distance. Model/revision live in analysis config. | Reuse the exact ref object; resolve model/revision and implementation from immutable config evidence. No 1152-vector in token JSON. |
| `aggregation.ts` — `CandidateFeatureAggregator` | Provider-free, normalized mean of cached frame vectors. `aggregationId` binds candidate, frame refs, measurement IDs and `footage-evidence-v1`. | Preserve both aggregation version and embedding space version `normalized-mean-v1`; they describe different things. |
| `CandidateEvidenceSchema` | Semantic/cheap support, scalar semantic distance, contributing sample/measurement IDs, signals, aggregate ref. | Add per-support distances and typed missingness in a separate token; do not mutate this schema. |
| `packages/reference-analyzer/embeddings.ts` | Frame/aggregate keys bind source hash, ordered sample/embedding IDs, config, aggregation and `EMBEDDING_IMPLEMENTATION`; vector entries checksum and unit norm. | Read compatible immutable refs; retain existing cache formulas. Cache identity is not authorization or candidate identity. |
| `scripts/footage-local.ts`, `scripts/reference-local.ts` | Bounded, checksummed file caches and explicit safe local composition boundary. | Reuse conventions; future resolver accepts supplied artifacts and cannot call providers or repair cache misses. No new disk cache in Session 2. |
| `packages/footage-analyzer/index.ts` | Analysis ID binds asset/config/measurement IDs/semantic frames/aggregation IDs; does not bind project authorization or every serialized inventory field. | Bind exact analysis artifact hash plus producing job/run artifact. Same analysis ID can appear in different runs with different cache counts. |
| `scripts/analyze-footage.ts` | `run.json` contains job ID, status, model runs, costs, timings, cache and config; ClipSegments written last. No strict standalone run schema. | Require explicit bundle refs and a validated minimum run adapter. Presence of one file is not completion. Partial source runs stay explicitly partial. |
| `packages/domain/serialization.ts`, `features.ts` | Canonical sorted object keys, ordered arrays, finite JSON; `contentId` uses SHA-256. Not full RFC 8785. | Reuse without modifying. Distinguish canonical content IDs from exact-byte artifact hashes. |
| `scripts/export-schemas.ts` | TypeScript-owned strict Zod schemas; JSON Schema draft 2020-12; semantic refinements mandatory. Existing exporter hardcodes interchange version 1.0.0. | Separate editorial exporter and namespace for 0.1.0; do not relabel existing schemas or use the public 1.0.0 envelope helper. |
| `packages/evaluation/index.ts` | Frozen creator-split BenchmarkManifest, top-1/top-k metrics, cost cohorts, limited metric union. | Reuse canonical hashing and top-k helper when bounds/label semantics match. New editorial manifest and metric interfaces, no public union extension. |
| `packages/evaluation/reference.ts`, `footage.ts` | One-to-one boundary metrics, temporal region coverage, mechanical footage evaluation. | Reuse temporal IoU arithmetic; generic boundary matching is not a paired trim scorer. Mechanical coverage never becomes preference accuracy. |
| `packages/contracts/events.ts` | Frozen DecisionEvent: one winner, mandatory score/confidence and plan context, max 256 options. Feedback and preference events preserve some correction lineage. | New internal EditorialDecision supports abstention, incomplete inspection, multiple selection and tasks without a plan. Legacy refs optional; no automatic invention of rejection labels or reasons. |
| `packages/contracts/edit-plan.ts` | Plan ID/revision, clip instance ID, segment ID, source range, speed, output start, decision ID. | Optional exact timeline linkage reuses these keys without building or modifying a planner. |

## Architecture choices

1. **Add an internal representation and benchmark layer.** `packages/editorial/` consumes Phase 2 contracts; Phase 2 imports nothing from it. New records use `artifactType`, literal `artifactVersion: "0.1.0"`, and `stability: "internal_pre_stable"`.
2. **Keep references authoritative.** Tokens carry identity and small derived temporal/locality values. Raw measurements, model config, authorization and vector storage remain in existing immutable artifacts. A resolver validates every join. It must fail on contradictory identity; missing artifacts yield explicit missingness, never invented features.
3. **Bind the representation shown.** A decision records an immutable candidate set of token refs plus exact producing run/config references. It cannot silently resolve “latest candidate representation.” Token IDs bind the exact source bundle and therefore may differ between cold and warm runs even when candidate and analysis IDs match.
4. **Locality is data, not a quality label.** Half-open membership `[start,end)` is distinct from nonnegative interval distance. Two real borrowed supports are exactly at the excluded end and have zero distance. The support enum must never be derived from `distance === 0`. A borrowed vector cannot be described as in-window observation.
5. **Exposure and rejection are separate.** Available, presented, inspected, chosen and explicitly rejected alternatives are different sets. Available-but-unselected is not automatically a negative label. Closed forced-choice tasks may derive task-specific pairwise negatives using an explicit protocol; raw behavior remains unchanged.
6. **Labels are separate from input features.** Editor-explained reasons, confidence, final timeline survival and observed outcomes cannot enter prediction-time features. Prediction context is snapshotted before the decision; evaluation labels are frozen independently.
7. **Leakage prevention operates above candidates.** Split connected groups linked by project, declared creator scope, source family, exact source hash and known derivatives/re-encodes. Never split windows of one source across train/test. Missing family evidence prevents a generalization-ready release.
8. **Experiments consume a frozen benchmark.** Predeclare tasks, metrics, feature masks, eligible cohorts, resource measurement and KEEP/REJECT/INCONCLUSIVE rules. Optional channels remain absent. No ranking model or metric score is produced this session.
9. **Append-only decision history supports a later graph.** Ordered observations, parent decision/context refs, clip instance refs and replacement links suffice for later graph edges. There is no graph database, graph engine or event collector in this session or the Session 2 handoff.

## Backward compatibility and migration risks

| Risk | Required treatment |
| --- | --- |
| Strict public contracts reject new fields | Never append editorial fields to ClipSegment, DecisionEvent, FeedbackEvent, BenchmarkManifest or ReferenceFingerprint. New internal artifacts only. |
| Analysis/candidate IDs are not complete artifact digests | Resolve with exact-byte hash and run ref; reject conflicting ID-only retrieval. Do not change old ID formulas. |
| Borrowed support at zero distance | Preserve enum and exact PTS membership; add regression covering end-boundary support. |
| Cheap nulls lack a general reason enum | Derive `unavailable/no_eligible_temporal_pair` only from matching Phase 2 implementation and comparison evidence; otherwise `unavailable/legacy_reason_unknown`. Never zero-fill. |
| Sparse or missing sidecars | ClipSegment-only imports cannot claim fully hydrated tokens. Report unresolved evidence and exclude affected tasks. Never re-run a model as migration. |
| Existing cache is evictable | References alone do not guarantee retention. Benchmark releases need an artifact inventory and verified resolver availability; missing objects remain explicit. No cache copying is authorized here. |
| Legacy event implies only a winner | Preserve legacy semantics as observed; do not synthesize presentation order, inspection, rejections or editor explanations. Lossy export requires a future explicit adapter, not silent conversion. |
| Source permission is limited | Existing nine-asset permissions cover local analysis/evaluation. They do not establish training, publication, redistribution or editor-data consent. A new authorization reference is required for any new purpose. |
| Version drift | Reject unknown editorial versions. Migrations create new artifacts with `supersedes`/origin refs; never overwrite historical records. |

## Unresolved decisions and readiness

There are **no blocking architectural choices for the bounded Session 2 contract implementation**. These data/product decisions remain open and block their respective future executions:

- Recruitment, actual creator/source-family grouping and derivative-source review: needed before a real split can be declared leakage-safe. The nine sources share one verification project and cannot form independent train/test projects.
- Annotation rubric wording, reason-tag vocabulary, annotator agreement/adjudication and consent/retention policy: needed before collecting real labels. Store unresolved labels explicitly; no default truth.
- Real benchmark size, domain balance, split proportions and minimum independent group counts: needed before releasing a useful benchmark.
- Metric primary endpoints, task-specific tolerances, confidence interval protocol, resource budgets and minimum meaningful quality deltas: explicit required experiment configuration, not fabricated Session 1 constants.
- Future model/channel schemas and authorization, training protocol, reference-style rubric, and external timeline formats: deferred to their own approved phases. Reserved channel shapes are not implemented producers.

Session 2 is architecturally ready, **not started and not authorized to execute by this Session 1 instruction**. Phase 2.6A as a whole is not complete.


## Dated amendment ? final preservation gate, 2026-09-20

After the interrupted session resumed, the final SHA-256 comparison found changes outside this session in three protected Phase 2 files: `packages/footage-analyzer/index.ts`, `packages/footage-analyzer/protocol.ts`, and `scripts/footage-local.ts`. Current code introduces a TransNetV2 detector configuration and adapter path. Additional audio/TransNetV2 files also appeared. These changes were not made by this Session 1 work; their authorization and verification are outside its evidence. They were neither reverted nor executed. An added `.env` was inventoried by filename only; its contents were not read.

The original no-write architecture audit and contract designs remain evidence-backed for the captured baseline. However, the final current-workspace preservation gate fails. Earlier typecheck/source/schema-check passes apply to the earlier workspace and do not verify these later changes. Historical Phase 2 closure is not rescinded; current source equality to that baseline cannot be certified.

**Blocking unresolved decision:** establish the intended authoritative Phase 2 baseline/worktree and reconcile these externally introduced changes under a separate explicit scope before Session 2 implementation. Do not silently adopt the new detector/audio work into this architecture or restore files without authorization. No further implementation was attempted.

Final Session 1 ruling: architecture/contract documents delivered; **ARCHITECTURE AUDIT: FAIL** at final workspace reconciliation; all six contract/taxonomy designs READY against the recorded baseline; **PHASE 2 PRESERVED: NO** for the current workspace; **SESSION 2 READY: NO**. The assistant's changes remain documentation and audit receipts only.
