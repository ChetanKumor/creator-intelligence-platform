# Current Phase - Phase 5 Gate 2 ProjectWorldModel-lite

Last updated: 2026-09-23

## Current ruling

- Phase 2: CLOSED (historical real-model and real-footage closure, 2026-09-15).
- Phase 2.6A Session 1 architecture: COMPLETE; frozen revision `editorial-architecture-0.1.0`.
- Phase 2.6A guarded TransNetV2 integration: COMPLETE.
- Phase 2.6A acceptance: PASS.
- Phase 2.6A overall: COMPLETE for the owner-authorized architecture-freeze and guarded detector-integration acceptance scope.
- Frozen editorial runtime subset: implemented under owner-authorized Phase 4 Gate 0. The broader historical Session 2 benchmark/metric/experiment backlog remains outside this gate.
- Phase 2.6B: COMPLETE. TransNetV2 verified on real authorized footage through the current application path.
- Phase 3 Audio Analyzer V0: COMPLETE within the implemented/verified V0 scope at `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, per explicit owner closure authorization. This supersedes the earlier component-only status below.
- Phase 4 Matcher V0: COMPLETE within its implemented and verified V0 scope. Gates 0–4 are accepted. Gate 4 adds the internal explicit-policy Matcher V0 dispatcher over the accepted technical baseline and evaluation-authorized reference-semantic ranking paths without score fusion, fallback, automatic mode selection, audio consumption or plan-bound `DecisionEvent` output.
- Phase 5 Edit Planner V0: Gate 0 architecture freeze is accepted at `9e4aea433123eeae85aefc1318200220e1bf0789`. Gate 1 Perception Evidence Store is ACCEPTED at `93d7ce9d27cd66be9c71389c9ad03ca134ce8fc5` after independent owner review. Gate 2 ProjectWorldModel-lite has bounded internal implementation and synthetic verification PASS from the clean `68eb90a7` baseline. Independent owner review found bounded defects, which were reproduced and repaired; Gate 2 awaits independent owner acceptance and is not yet accepted. Director, retrieval/search, sequence construction and `UniversalEditPlan` quality remain unimplemented/unverified. Gate 3 is not authorized.

## Phase 5 Gate 2 - ProjectWorldModel-lite

Authority: [Gate-2 implementation and verification record](phases/phase-5-gate-2-project-world-model-lite.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). The bounded internal `packages/world-model/` substrate links explicitly supplied source evidence, observed facts, derived interpretations, exact legacy token snapshots and authorized Gate-1 reuse receipts. It supports pure immutable child publication, dependency invalidation and scoped bounded views with explicit coverage. Current `MediaAsset` retention is checked separately from historical source authorization at a caller-declared access time. It neither enumerates Gate-1 evidence nor performs perception, model, provider, decoder, media or network work.

The test-first compiler failure and later self-review failure are preserved under ignored `.local-runs/phase5-gate2/`. Independent owner review defects were reproduced in the preserved `owner-review-red.md` receipt (31 focused tests, 19 pass, 12 fail before repair), then repaired with focused regressions. The earlier pre-owner-review PASS remains historical evidence in the Gate-2 report. Gate 2 remains **implementation verification PASS; awaiting independent owner acceptance**. No real-footage Gate-2, production persistence, full current authorization service, narrative intelligence, professional editing quality or Gate-3 authorization is claimed.

Final independent owner review confirmed the first repair but found candidate-bound existence leakage, unresolved present uncertainty evidence, direct non-initial snapshot construction, and a membership-capacity contradiction. New test-first red evidence is preserved in `final-owner-review-red.md`; a corrected fixture rerun is preserved in `final-owner-review-red-confirmed.md`. The bounded repairs pass the focused Gate-2 suite (36/36). Gate 2 is still **implementation verification PASS; awaiting independent owner acceptance**. Gate 3 remains unauthorized.

## Phase 5 Gate 1 - Perception Evidence Store

Authority: [Gate-1 implementation and verification record](phases/phase-5-gate-1-perception-evidence-store.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). Starting state was branch `phase/5-edit-planner-v0`, HEAD `9e4aea433123eeae85aefc1318200220e1bf0789` (`docs: freeze creative intelligence architecture v1`), with a clean worktree.

Gate 1 adds only the internal `packages/perception/` substrate: strict deterministic computation identity, exact dependency manifests, immutable attempt lineage, explicit accepted-output selection, lifecycle and scope eligibility, exact-byte artifact integrity, pure lookup results and reuse receipts that create no `ModelRun`. A deterministic tool uses explicit model `not_applicable`; learned computation requires exact revision evidence. Request identity remains distinct from output identity. Conflicting deterministic successful outputs are hard integrity failures.

Lookup returns explicit hit, miss, incompatible, failed, stale/retired, unavailable or unsupported states. Exact and related evidence is discoverable only through an eligible binding for the exact requested project, creator and purpose. Foreign, revoked and expired evidence returns the same miss payload as absent evidence, cannot contribute incompatibility details, and is not artifact-validated. No unscoped snapshot/index enumeration remains. Lookup has no computation/provider/decoder/network/repair/fallback hook. Existing reference/footage cache formulas and legacy repair behavior remain unchanged; no compatibility adapter falsely relabels them as Gate-1 compliant.

Independent owner review before acceptance found a bounded non-discoverability defect: inaccessible exact and related entries could reveal cache existence, and an unscoped snapshot exposed the index. The repair was verified on 2026-09-23 without broadening the gate. `npm run typecheck` and build PASS; 29 focused Gate-1 tests PASS; 74 focused perception/editorial/reference/footage cache tests PASS; the full safe non-media TypeScript suite passed 332/332 under the no-network guard. Final workspace/preservation commands, original first-failure chronology and later owner-review red evidence are recorded in the Gate-1 report. Public contracts, provider seams, Phase 1-4 source, dependencies, schemas and fixtures remain protected. No dependency, model, media, Python or network operation was introduced. Gate 1 is owner-accepted and committed/pushed at `93d7ce9d27cd66be9c71389c9ad03ca134ce8fc5`. Gate 2 ProjectWorldModel-lite is owner-authorized for bounded implementation but is not started by this acceptance record.

## Phase 5 Gate 0 - documentation-only architecture freeze

Authority: [Creative Intelligence Architecture v1 Freeze](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). The owner authorized this gate on 2026-09-22. Base HEAD is `2c8cdd1771dfc538f2ce6813b61ce592e210a30f` (`docs: close Phase 4 Matcher V0`), branch `phase/5-edit-planner-v0`, initially clean. Local `origin/main` matches HEAD; live GitHub state is not queried under the no-network verification restriction.

Scope is normative representations, authority, exact artifact/cache identities, compute/cost/model selection, provider-neutral Director direction, internal planning/edit/critic boundaries and A-to-B-to-C migration. Phase 4 source, public contracts, dependencies, schemas, fixtures and historical evidence are preserved. No runtime, LLM/provider connection, model/media operation, Perception Evidence Store or ProjectWorldModel implementation is authorized. UEP remains 1.0.0 with its actual 15-30 second limit; longer target edits require a later explicit compatibility gate.

Gate 0 documentation verification PASS on 2026-09-22: all 31 required sections and acceptance boundaries reviewed; `git diff --check` PASS; all 210 protected tracked files match the pre-edit SHA-256 baseline; all 28 frozen-manifest entries match; manifests/locks, source and generated artifacts unchanged. The inspected static workspace audit passed for 56 application TypeScript files and nine runtime adapters without executing those adapters. Document links, code fences and whitespace checks passed. The protected inventory digest and selected exact hashes are recorded in the Gate 0 specification. No application tests, media/model execution or network verification ran; historical regression results were not relabeled as fresh. The freeze was subsequently owner-reviewed and committed at `9e4aea433123eeae85aefc1318200220e1bf0789`; Gate 1 was separately authorized afterward.

## Phase 4 Gate 0 - runtime substrate

Execution base: `phase/4-matcher-v0`, HEAD `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, parent `1c336ca306b5585612095f6bf6274043a111c64b`; initially clean. No commit, push, merge or PR is part of this gate.

The internal `packages/editorial/` implements the frozen 0.1.0 common references/missingness, fixed taxonomy, tokens, pure supplied-artifact resolver, candidate/context/decision records, and timeline linkage validation. Public contracts and the Matcher provider seam remain frozen. Ranking records allow ties, partial judgment and explicit unjudged candidates; no ranking algorithm or quality result exists. Tokens retain embedding references, never vectors. Source PTS membership remains half-open, including borrowed support at the excluded end with zero interval distance.

Focused evidence: `npm.cmd run typecheck`, `npm.cmd run build`, and `node --import ./scripts/no-network.mjs --test dist/tests/editorial-common.test.js dist/tests/editorial-token.test.js dist/tests/editorial-decisions.test.js`: **75 passed, zero failed/skipped**. `npm.cmd run audit:workspace`: **52 application files / nine existing runtime adapters PASS**. Focused fixtures are synthetic data only; no provider, media decoder, model or GPU operation was invoked. Full `npm run verify` is deliberately deferred to review/acceptance, not claimed by this gate.

Two new-implementation regressions were preserved and corrected: a reidentified token could contradict its referenced semantic support, and borrowed cheap evidence could claim measured in-window flow. The resolver now revalidates token projections at consumption boundaries and checks eligible temporal comparison pairs. Failure logs, successful reruns and frozen SHA-256 checks are retained in ignored `.local-runs/phase4-gate0/`. Historical evidence files were not changed.

## Phase 4 Gate 1 - deterministic technical baseline

Accepted implementation commit: `607420b40efe93d100ad0a45cf438d6f6549922a`.

Gate 1 adds the internal `EditorialRankingPrediction` 0.1.0 artifact and a pure deterministic rule baseline over the exact validated `EditorialCandidateSet`. It uses only `sharpnessIndicator` and `unclippedPixelFraction`, with score `0.5 * sharpnessIndicator + 0.5 * unclippedPixelFraction`. Missing required features remain explicitly unavailable and never become zero. Equal scores remain explicit tie groups; lexical candidate ordering inside a tie is canonical serialization only, not editorial preference.

The prediction artifact remains separate from `EditorialDecision` / `TaskJudgment`, public `DecisionEvent`, plans and slots. It contains no invented winner, confidence, human judgment or editor explanation. No provider, LLM, model, embedding-vector comparison, media decode or runtime adapter executes in this gate. Semantic/reference/audio features are intentionally deferred.

Independent source review PASS. Canonical `npm run verify` PASS with **243 TypeScript tests, six media integration tests, 15 Python tests, 33 schema/synthetic fixture artifacts, workspace audit PASS, exit 0**. The canonical verification preserved exactly the intended three-file Gate 1 worktree before commit. No dependency or public Matcher seam change occurred.

Gate 1 establishes only a deterministic technical baseline suitable for later comparison. It does not establish semantic matching, narrative intelligence, reference-style matching, audio matching, learned ranking, professional shot selection or professional editing quality.

## Phase 4 Gate 2 - owned semantic comparison primitive

Accepted implementation commit: `ab3493a152d5eb82000b88130f8bb934eb39b538`.

Gate 2 adds the strict internal `EditorialSemanticComparison` value and `compareEditorialSemantics()` primitive. Two explicitly supplied `EmbeddingReference` values must share the same immutable embedding space, version, dimensions and distance function; Gate 2 additionally requires the existing owned `cosine` / `normalized-mean-v1` semantic space.

Vector access remains explicit through the injected `EditorialVectorResolver`. Resolved vectors are never persisted in the comparison value. Present vectors must match the declared dimensions, contain only finite values, have unit Euclidean norm within `1e-6`, and reproduce the released embedding identity formula from `objectId` plus the vector digest. Missing resolver evidence remains explicitly unavailable and is never converted to a zero vector. Incompatible spaces or malformed vectors fail closed.

The primitive computes deterministic cosine similarity in `[-1, 1]`, where larger values mean closer vectors in the shared semantic space. It does not remap similarity to `[0, 1]`, choose a candidate, choose a reference shot, combine semantic and technical scores, activate `reference_style_compatibility`, alter the public Matcher seam, or execute a provider/model/media path.

Independent source review PASS. Canonical `npm run verify` PASS with **266 TypeScript tests, six media integration tests, 15 Python tests, workspace audit over 54 application TypeScript files plus nine explicit runtime adapters, 33 schema/synthetic fixture artifacts, and exit 0**. Canonical receipt SHA-256: `c945e908837d34126603d2bb18956f610923b87cddda3f76943244d30f3a8bf3`. Verification preserved exactly the intended three-file Gate 2 worktree before commit.

Gate 2 establishes only that compatible owned embedding references can be explicitly resolved, integrity-checked and compared with deterministic cosine similarity. It does not establish semantic Matcher quality, reference matching quality, style compatibility, professional candidate ranking, narrative intelligence or professional editing quality.

## Phase 4 Gate 3 - evaluation-authorized reference semantic ranking

Accepted implementation commit: `8c3d22f96ab515d07c8d9ac0b81b849eb0e1b9ff`.

Gate 3 adds the internal `EditorialReferenceSemanticRankingPrediction` 0.1.0 artifact. It takes an exact validated `EditorialCandidateSet`, an explicitly supplied `ReferenceFingerprint` 1.1.0, an explicitly selected reference shot, the matching supplied `ReferenceAnalysis`, and an injected `EditorialVectorResolver`. The task remains `candidate_ranking`; `reference_style_compatibility` remains reserved and unused.

Gate 3 is evaluation-authorized only. The reference authorization and every candidate FootageAnalysis authorization must contain `local_evaluation`. Reference and candidate evidence must share project scope and creator scope. The reference fingerprint is bound to the supplied authorized content and analysis identity; the selected fingerprint embedding must agree with the same-shot ReferenceAnalysis embedding-batch reference when present. The embedding-batch identity is recomputed and checked. A selected reference shot with null semantic embedding remains explicitly unavailable, is never backfilled from ReferenceAnalysis, causes all candidates to remain unscored, and invokes no vector resolution.

Each candidate remains exactly once in the supplied universe. Candidate semantic evidence comes only from the validated EditorialToken semantic channel. Existing locality is preserved, including `within_segment` and `same_shot_context`; locality does not modify the score. Source semantic missingness remains explicit, while derived similarity becomes unavailable rather than zero. Present target/candidate embeddings are compared only through the accepted Gate 2 `compareEditorialSemantics()` primitive. Incompatible embedding spaces and malformed resolved vectors fail closed.

Ranking uses the raw Gate 2 cosine similarity in `[-1, 1]` only. Scores are not remapped, normalized, thresholded or combined with Gate 1 technical scores. Exact equal similarities remain explicit tie groups. Gate 3 performs no reference-shot auto-selection and records no winner, confidence, plan, slot, judgment, explanation or vectors.

Independent source review identified and corrected two bounded integrity issues before acceptance: ReferenceAnalysis embedding-batch identity is now checked against its exact ordered shot references, and candidate source semantic missingness is preserved separately from derived similarity missingness.

Canonical `npm run verify` PASS with **291 TypeScript tests, six media integration tests, 15 Python tests, workspace audit over 55 application TypeScript files plus nine explicit runtime adapters, 33 schema/synthetic fixture artifacts, and exit 0**. Canonical receipt SHA-256: `7cca9ff4b1ce9740df5490d2ed5a2eec4411b78fe12cc68d7bf90fa74e0ffc8b`. Verification preserved exactly the intended three-file Gate 3 implementation worktree before commit.

Gate 3 establishes only that an explicitly selected, locally evaluation-authorized reference shot can condition an exact candidate universe and produce deterministic raw-cosine semantic ranking evidence with explicit locality and missingness. It does not establish reference-style understanding, technical+semantic Matcher quality, audio matching, professional shot ranking, learned ranking, narrative intelligence or professional editing quality.

## Phase 4 Gate 4 - explicit-policy Matcher V0 and Phase 4 closure

Accepted implementation commit: `2e63f3ee0d373bf0a64d41319f570de4568d45d6`.

Gate 4 adds the internal `EditorialMatcherV0Prediction` 0.1.0 artifact and one explicit caller-selected Matcher V0 entry point. Its dispatch policy is `rule / explicit_matcher_mode / 0.1.0`. Exactly two modes are accepted: `technical_baseline` and `reference_semantic`.

`technical_baseline` delegates unchanged to the accepted Gate 1 `createEditorialRankingPrediction()` path. `reference_semantic` delegates unchanged to the accepted Gate 3 `createEditorialReferenceSemanticRankingPrediction()` path and therefore retains Gate 3 authorization, provenance, locality, missingness and embedding-compatibility requirements. Gate 4 does not reimplement either ranking algorithm.

There is no automatic mode selection and no fallback between modes. A missing or unavailable reference-semantic result remains unavailable rather than being rescued by the technical baseline. Gate 4 does not combine technical and semantic scores, normalize or remap them, introduce cross-mode tie-breaking, consume AudioFingerprint evidence, activate `reference_style_compatibility`, choose a reference shot, emit embedding vectors, or introduce a learned ranker.

The public `packages/providers/index.ts` Matcher seam remains unchanged. Gate 4 deliberately does not emit public `DecisionEvent` records because that contract requires real plan-bound `planId`, `slotId`, winner and confidence state that does not exist until planning. No fake plan, slot, winner, confidence, judgment or editor explanation is created.

Independent source review PASS. Source-review receipt SHA-256: `829dc11ff20ff88962962de29529d72fa47c4fb37a9dfacc9aab4a518d4c2a3a`. The preserved first-red receipt SHA-256 is `2c3828d5997a3130cbdb76256aa45c3af3d381ed345629c6973bee634c46e45c`.

Canonical `npm run verify` PASS with **303 TypeScript tests, six media integration tests, 15 Python tests, workspace audit over 56 application TypeScript files plus nine explicit runtime adapters, 33 schema/synthetic fixture artifacts, and exit 0**. Canonical receipt SHA-256: `6eff6a43201763ed28fb9016358f1736040e9149a996328ff3b95c4fe2609e19`. Verification preserved exactly the intended three-file Gate 4 implementation worktree before commit.

A separate real-evidence preflight found **three technical-smoke-eligible footage runs but zero authorized real reference runs and zero exact compatible reference-semantic pairs**. It also found zero previously persisted real EditorialToken or EditorialCandidateSet files, so the closure smoke did not falsely claim that those internal artifacts already existed. Preflight receipt SHA-256: `a8b8a16843307ef88cf71a4b96136016d9c02199a8385ef5fcacf385d4a8479a`.

The final real-evidence Gate 4 smoke used the strongest eligible persisted real footage run, `.local-runs/footage_36099c27-da31-40da-a3ec-0f5fe666f3da`, whose `run.json` SHA-256 is `2fabb8ecd170c8ba5d4688bdb624cf5b4265162fbf3dc81f57c5dbc642694e58`. The run is succeeded and contains 108 model-run provenance records, nine owner-supplied real FootageAnalysis snapshots, and exactly **872 retained candidates**.

The smoke deterministically hydrated **872 EditorialToken artifacts** and one exact `retained` EditorialCandidateSet in memory from that persisted real evidence, then executed Gate 4 in `technical_baseline` mode. Gate 4 returned **872 candidate results, 872 scored candidates, zero unscored candidates and 872 score groups**. Its nested ranking was exactly equal to direct Gate 1 execution, repeated Gate 4 execution reproduced the same prediction identity, and Gate 4 validator recomputation reproduced the same full prediction. The injected semantic vector resolver was called **zero times**.

The real-evidence smoke performed no fresh model inference, embedding-vector resolution, media decoding or audio consumption and ran under the repository no-network guard. Smoke harness SHA-256: `a423eee1ea3502b6c7ec6ac66ae93221f941c0b1c0bc07fa3c117459bb280a02`. Smoke receipt SHA-256: `98530a8a4ff49b0b0a77595013a900ce081c4862f1bcc0692caf38779695bca4`.

A real `reference_semantic` Gate 4 smoke was deliberately **not executed** because the preflight found no authorized compatible real reference pair. No authorization, creator/project scope, reference evidence or vectors were fabricated to manufacture a passing result. The reference-semantic dispatch path remains covered by the canonical deterministic Gate 4 tests and the accepted Gate 3 evaluation-authorized implementation, but this Phase 4 closure does not claim real-reference execution or reference-matching quality.

Phase 4 therefore closes only the Matcher V0 engineering scope established by these gates: a validated internal candidate substrate, a deterministic technical baseline, an owned semantic-comparison primitive, evaluation-authorized explicit-reference semantic ranking, and a single explicit-policy dispatcher that preserves those policies without inventing planning state. It does **not** establish professional shot-selection quality, technical+semantic fusion quality, audio-aware matching, reference-style understanding, broad-domain generalization, narrative intelligence, sequence planning, learned ranking or professional editing quality.

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

Gate 0 acceptance is complete: independent source review PASS and canonical `npm run verify` PASS with 223 TypeScript tests, six media integration tests, 15 Python tests, 33 schema/synthetic fixture artifacts, and exit 0. The next implementation gate is Phase 4 Matcher V0 Gate 1: deterministic baseline ranking/scoring over owned features and synthetic hand-checkable evaluation. This session does not start Gate 1 or any later phase. Detector-default changes remain outside scope.

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

Phase 2 remains CLOSED; Phase 2.6A is COMPLETE within its accepted scope; Phase 2.6B is COMPLETE; Phase 3 Audio Analyzer V0 is COMPLETE within its verified V0 scope; and Phase 4 Matcher V0 is COMPLETE within the implemented/verified V0 scope documented above. Gates 0–4 are accepted. Phase 5 Gate 0 is accepted. Phase 5 Gate 1 is owner-accepted and committed/pushed at `93d7ce9d27cd66be9c71389c9ad03ca134ce8fc5`. Gate 2 ProjectWorldModel-lite is implemented and locally verified but awaits owner review; all later gates remain unauthorized.
