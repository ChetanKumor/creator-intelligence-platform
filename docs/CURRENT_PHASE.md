# Current Phase - Phase 4 Matcher V0 Active

Last updated: 2026-09-21

## Current ruling

- Phase 2: CLOSED (historical real-model and real-footage closure, 2026-09-15).
- Phase 2.6A Session 1 architecture: COMPLETE; frozen revision `editorial-architecture-0.1.0`.
- Phase 2.6A guarded TransNetV2 integration: COMPLETE.
- Phase 2.6A acceptance: PASS.
- Phase 2.6A overall: COMPLETE for the owner-authorized architecture-freeze and guarded detector-integration acceptance scope.
- Frozen editorial runtime subset: implemented under owner-authorized Phase 4 Gate 0. The broader historical Session 2 benchmark/metric/experiment backlog remains outside this gate.
- Phase 2.6B: COMPLETE. TransNetV2 verified on real authorized footage through the current application path.
- Phase 3 Audio Analyzer V0: COMPLETE within the implemented/verified V0 scope at `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, per explicit owner closure authorization. This supersedes the earlier component-only status below.
- Phase 4 Matcher V0: AUTHORIZED / ACTIVE. Gate 0 runtime implementation and focused checks PASS; full canonical verification and human diff review remain the next acceptance step. Matcher scoring is not implemented.
- Phase 5 and later: not implemented; no execution authorization from this gate.

## Phase 4 Gate 0 - runtime substrate

Execution base: `phase/4-matcher-v0`, HEAD `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, parent `1c336ca306b5585612095f6bf6274043a111c64b`; initially clean. No commit, push, merge or PR is part of this gate.

The internal `packages/editorial/` implements the frozen 0.1.0 common references/missingness, fixed taxonomy, tokens, pure supplied-artifact resolver, candidate/context/decision records, and timeline linkage validation. Public contracts and the Matcher provider seam remain frozen. Ranking records allow ties, partial judgment and explicit unjudged candidates; no ranking algorithm or quality result exists. Tokens retain embedding references, never vectors. Source PTS membership remains half-open, including borrowed support at the excluded end with zero interval distance.

Focused evidence: `npm.cmd run typecheck`, `npm.cmd run build`, and `node --import ./scripts/no-network.mjs --test dist/tests/editorial-common.test.js dist/tests/editorial-token.test.js dist/tests/editorial-decisions.test.js`: **75 passed, zero failed/skipped**. `npm.cmd run audit:workspace`: **52 application files / nine existing runtime adapters PASS**. Focused fixtures are synthetic data only; no provider, media decoder, model or GPU operation was invoked. Full `npm run verify` is deliberately deferred to review/acceptance, not claimed by this gate.

Two new-implementation regressions were preserved and corrected: a reidentified token could contradict its referenced semantic support, and borrowed cheap evidence could claim measured in-window flow. The resolver now revalidates token projections at consumption boundaries and checks eligible temporal comparison pairs. Failure logs, successful reruns and frozen SHA-256 checks are retained in ignored `.local-runs/phase4-gate0/`. Historical evidence files were not changed.

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

Next acceptance step: human review of the Phase 4 Gate 0 diff, followed by full canonical verification. The next implementation gate is Phase 4 Matcher V0 Gate 1: deterministic baseline ranking/scoring over owned features and synthetic hand-checkable evaluation. This session does not start Gate 1 or any later phase. Detector-default changes remain outside scope.

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

Phase 2 remains CLOSED; Phase 2.6A is COMPLETE within its accepted scope; Phase 2.6B is COMPLETE; Phase 3 Audio Analyzer V0 is COMPLETE within its verified V0 scope. Phase 4 Matcher V0 is AUTHORIZED / ACTIVE, with Gate 0 implementation and focused checks PASS pending human review and canonical acceptance. Gate 1 has not started. Phase 5+ are not implemented or authorized by this gate. No Matcher quality, Creative Ranker or Editorial Decision Graph result is claimed.
