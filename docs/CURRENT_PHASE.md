# Current Phase - TransNetV2 Contract Integrated; Baseline Verification Blocked

Last updated: 2026-09-20

## Current ruling

Phase 2 code complete: YES

Guarded real-model smoke: PASS

Full real-model verification: PASS

Real-footage verification: PASS

Phase 2 final complete: YES

Phase 2 closure date: 2026-09-15

Final ruling: **A. PHASE 2 CLOSED - READY FOR PHASE 2.6**

Phase 2.6A Session 1: COMPLETE — started 2026-09-15; architecture audited and frozen for implementation handoff on 2026-09-16, under the owner's explicit Session 1-only instruction.

Phase 2.6A later TransNetV2 work: IMPLEMENTED / CONTRACT INTEGRATED. The 2026-09-20 receipt's six source hashes match the current files. Fresh typecheck, build, 86 TypeScript tests (including three TransNetV2 contract tests), six synthetic-media regressions and eleven Python tests pass. This work is subsequent to Session 1; it was not performed by the architecture-freeze session.

Phase 2.6A integration acceptance: BLOCKED, not fully verified complete. The established workspace audit fails on prohibited runtime imports in added audio workers; the same import rule also rejects the TransNetV2 wrapper. Generated FootageConfig and FootageAnalysis schemas do not match current TypeScript. These failures are preserved, not repaired or waived by this forensic task. Phase 2.6A as a whole is NOT COMPLETE.

Session 2 editorial-contract implementation: NOT STARTED; the handoff's proposed editorial files are absent. This distinct Session 2 scope must not be conflated with the later TransNetV2 work.

Phase 2.6B: NOT STARTED; not authorized.

Phase 3: NOT STARTED.

The Phase 2 PASS/closure statements above describe the preserved 2026-09-15 historical baseline, not acceptance of all later source. All 66 indexed closure artifacts still match. Relative to the 245-entry Session 1 snapshot, the pre-audit differences were three footage integration files and this document; additional architecture/audio/TransNetV2 files are separately inventoried. The architecture amendment's drift finding remains historical evidence. Its linked Session 1 verification.json is currently missing; baseline.json is present. No Git metadata exists in either the native or WSL view of this workspace.

PySceneDetect remains the footage default. TransNetV2 is explicitly selectable through the footage contract and a supplied LocalFootageServices launch configuration, but is not approved as default. The ordinary CLI currently supplies no TransNetV2 launch configuration; selecting it there fails explicitly with TRANSNETV2_NOT_CONFIGURED. MediaTruth frameTimes / timelineFromCuts remains the canonical timestamp authority. Reference-analyzer and SigLIP implementation hashes match the Session 1 baseline; no TransNetV2 coupling was found in the reference path.

Next prerequisite: resolve and verify the existing source-audit/schema failures under a bounded correction task. Next model execution gate, after acceptance and explicit authorization: authorized real-footage LocalFootageServices -> TransNetV2 execution without changing the default. No new pretrained inference was performed in this audit.

Unproven: real-footage TransNetV2 service execution, superiority over PySceneDetect, professional editing quality, broad generalization and full current-workspace acceptance. The historical GPU smoke used a synthetic 90-frame fixture. Its text log reports TensorFlow 2.15.0 / CUDA / RTX 4050 Laptop GPU, but is not a fresh run; the integration receipt does not hash that log or the Python worker. The reported rollback guard is not independently established by the retained receipt/logs.

See [2026-09-20 repository baseline audit](phases/phase-2.6a-repository-baseline-audit-20260920.md) for verification failures, provenance limits, worktree classification, publication prerequisites and local evidence. GitHub bootstrap is blocked: no existing Git repository/history, no configured WSL author email, and no GitHub CLI. No Git repository was initialized, no commit was made and nothing was uploaded.

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

Phase 2 remains historically CLOSED and Session 1 remains an architecture freeze. Later TransNetV2 integration is acknowledged separately, with current acceptance blocked as above. Session 2 editorial implementation requires separate authorization. Phase 2.6B and Phase 3 remain NOT STARTED and are not authorized by this audit. Do not change the detector default, integrate a model, process audio/music, implement a Creative Ranker or build an Editorial Decision Graph as part of repository reconciliation.
