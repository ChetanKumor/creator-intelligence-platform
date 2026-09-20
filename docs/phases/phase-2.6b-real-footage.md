# Phase 2.6B — real-footage TransNetV2 verification

Ruling: **PASS**. Phase 2 CLOSED; Phase 2.6A COMPLETE; Phase 2.6B COMPLETE; Phase 3 NOT STARTED. PySceneDetect remains the default. Execution: 2026-09-20 UTC; closure documented 2026-09-21 local date.

## Baseline and authorized scope

Branch: `phase/2.6b-real-footage`. Baseline/main: `b9068bca8e432974c0c9491200556827b4e9443b`, initially clean. The owner explicitly approved using the existing ignored nine-source Phase 2 corpus in place after discovery found it outside the expected asset-workspace location. No footage was moved, copied into the repository, renamed, published or changed. Original authorization, project/creator scope, nine SHA-256 values and 761,576,627 total bytes match before and after execution.

Nine H.264 MP4 sources: **302.338072 seconds, 11,888 frames, seven CFR and two VFR assets**. Fresh metadata came through the existing ffprobe/MediaTruth worker. Safe identities below are SHA-256 prefixes; complete hashes follow. The set remains mostly podcast/interview/seated presentation footage.

## Actual execution path

`scripts/verify-transnetv2-footage.ts` composes the existing services with an explicit launch configuration. The full application gate traverses `analyzeFootage -> FootageServices.open -> LocalFootageServices -> media.detect({kind: transnetv2, threshold: 0.5}) -> LocalTransNetV2Detector -> WSL python -m transnet_detector -> TensorFlow TransNetV2 predict_frames -> integer cuts -> timelineFromCuts(metadata.frameTimes) -> validated analysis and ClipSegments`.

The ordinary `analyze-footage.ts` CLI remains unchanged and does not supply a TransNet launch configuration. The verifier is the explicit runtime composition for this gate. Its observation wrappers call the actual owned provider unchanged; they do not supply detections. All nine assets completed the LocalFootageServices timeline seam. The VFR asset `5bd959cd99ab` additionally completed the full application with **65 validated ClipSegments**, then repeated with identical complete analysis output.

The first full application attempt exposed the telemetry defect below. Existing successful corpus evidence was retained. Ignored continuation harnesses reran only the affected full application gate; their hashes and artifacts are in the final receipt. This report does not claim that the initial monolithic verifier exited successfully.

## Fresh provider and CUDA evidence

All nine first-pass detection cache keys were absent and each call produced one actual owned provider response. Decoded frame counts equal MediaTruth frame counts. Every response identifies `transnetv2`, `cuda`, TensorFlow **2.15.0**, and **NVIDIA GeForce RTX 4050 Laptop GPU**. Independent GPU samples identify the owned Python worker PID in the NVIDIA compute-process list during execution. At most one GPU compute process was observed; workers were closed between stages. There was no observed CUDA OOM, CPU fallback or PySceneDetect substitution.

- Adapter: `transnetv2-detector-adapter-0.1.0`.
- Source commit: `85cef72af9a916bdfd7cc94a670c9cdfbf12d1ed`.
- Source SHA-256: `f55b3a75727d1502438707ac15e8f6257a736817e713e2113e4b84176500ca65`.
- Weight-set SHA-256: `00b40cfe38c3fd6fd6d278860d339eb347254e1559839688d870ad0389bf6d0a`.
- Python **3.11.16**; installed TensorFlow distribution **2.15.0.post1**, runtime reports **2.15.0**. All three weight files rehashed and matched; upstream inference source clean. No update or download.

The corrected full application performed a second independent fresh inference on `5bd959cd99ab`. Its cuts and complete model provenance match the first corpus inference exactly. Its detection telemetry names TransNetV2 and records success; the canonical shots agree with the provider cuts. This establishes the requested application-path proof beyond a low-level provider smoke.

## MediaTruth, determinism and comparison

Every produced timeline was mechanically checked for integer/increasing/in-range cut indices, unique cuts, first boundary zero, final boundary duration, positive ordered shots, no gaps/overlaps and exact cut-to-`frameTimes` correspondence. TransNet supplies no canonical timestamps. Both real VFR timelines pass. Full application VFR cut **26** maps to **0.456675 s**, yielding **[0, 0.456675)** and **[0.456675, 13.523602)**. Existing synthetic VFR and invalid-partition regressions also pass.

All nine cached repeats return identical cuts, complete shots and provider-version strings with zero new TransNet calls. The independent fresh VFR application run agrees with its earlier fresh corpus inference. Its full cached repeat is identical in analysis/configuration/candidate data; telemetry job IDs and measured timings legitimately differ.

PySceneDetect was run freshly on the same nine bytes with unchanged content threshold 27, minimum scene length 2 and adaptive threshold 3. Each baseline operation traversed the existing Python detector. Both detectors produce **36 shots**. They agree exactly on seven assets; three boundaries across two assets differ by one frame, each **0.016667 s**. There is no suitable labeled boundary truth: **DETECTOR QUALITY SUPERIORITY: UNPROVEN**.

| SHA-256 prefix | Duration s | Frames | TransNet cuts | PySceneDetect cuts | Shots, each | Detector elapsed s, TN / PS |
| --- | ---: | --- | --- | --- | ---: | --- |
| 2992bd1e8875 | 26.966667 | 809 | [] | [] | 1 | 24.971 / 5.238 |
| 5bd959cd99ab | 13.523602 | 810 VFR | [26] | [26] | 2 | 9.888 / 8.175 |
| 1299ab9d283b | 29.7 | 891 | [37, 413, 458, 878] | [37, 413, 458, 878] | 5 | 7.175 / 5.349 |
| 45ecd27e50f8 | 35.3 | 2118 | [141, 767, 1329, 1587] | [140, 767, 1328, 1587] | 5 | 19.460 / 12.530 |
| f2219f5b0b77 | 15.233333 | 457 | [] | [] | 1 | 3.422 / 2.939 |
| 1a1de6da70ff | 45.224237 | 2712 VFR | [418] | [417] | 2 | 40.746 / 27.290 |
| 178b45bf2320 | 24.190833 | 725 | [239, 437, 602] | [239, 437, 602] | 4 | 1.763 / 2.117 |
| d68437959fc2 | 52.1 | 1563 | [322, 353, 529, 608, 793, 795] | [322, 353, 529, 608, 793, 795] | 7 | 16.250 / 9.221 |
| e59b0a675d4d | 60.0994 | 1803 | [186, 232, 712, 756, 832, 876, 1477, 1523] | [186, 232, 712, 756, 832, 876, 1477, 1523] | 9 | 27.153 / 10.452 |

TransNet canonical interior timestamps in seconds (all timelines additionally start at zero and end at the asset duration):

| SHA-256 prefix | Canonical interior boundaries |
| --- | --- |
| 2992bd1e8875 | none |
| 5bd959cd99ab | 0.456675 |
| 1299ab9d283b | 1.233333, 13.766667, 15.266667, 29.266667 |
| 45ecd27e50f8 | 2.35, 12.783333, 22.15, 26.45 |
| f2219f5b0b77 | none |
| 1a1de6da70ff | 6.990139 |
| 178b45bf2320 | 7.974633, 14.581233, 20.086733 |
| d68437959fc2 | 10.733333, 11.766667, 17.633333, 20.266667, 26.433333, 26.5 |
| e59b0a675d4d | 6.2, 7.733333, 23.733333, 25.2, 27.733333, 29.2, 49.233333, 50.766667 |

PySceneDetect timestamps are identical except `45ecd27e50f8`: 2.333333 and 22.133333 instead of 2.35 and 22.15; and `1a1de6da70ff`: 6.973472 instead of 6.990139. Full per-detector shots, indices and timestamps are retained in the ignored receipt.

## Minimal defect correction and preserved failures

Fresh full application evidence falsified the assumption that the complete detector provenance string fits the frozen telemetry version field: the string is **139 characters**, while `VersionLabelSchema` permits 80. Detection completed, but telemetry validation then raised a sanitized `CLIPSEGMENT_VALIDATION_FAILED`. The failing real output and an independently failing synthetic regression remain preserved.

Only successful TransNet detection telemetry now uses `contentId("transnetv2", version)`, a deterministic 75-character SHA-256 label. Full provenance remains in stage timings, detection cache and provider responses. No public schema, cache key, detector threshold, provider behavior, MediaTruth code, reference analyzer, SigLIP or candidate logic changed. The regression fails before this correction and passes after it.

Two later verification/environment failures remain explicit: a harness incorrectly required zero cheap-frame repair after an otherwise successful application run; normal repair decoded **55 sampled PNG frames**, while all four semantic embeddings were genuine cache hits. A sandboxed repeat then encountered `EPERM` reading frame-cache files and failed closed. Running the repeat with the same authorized filesystem access as the fresh execution passed. No filesystem permissions or system settings were modified. Raw RGB detector streams remained in memory; no persistent raw RGB dumps were created.

## Cache and failure behavior

The unchanged TransNet key binds media SHA-256, detector kind/configuration, frame count, adapter version, source commit/SHA, weight-set SHA, FFmpeg version and RGB 48x27 passthrough implementation. Its namespace differs from PySceneDetect. Entries are bounded and checksummed; repeat output equality and zero provider calls prove compatible reuse. The full application reused four real 1152-dimensional SigLIP embeddings in the frozen space and 65 candidate aggregates. No fresh semantic inference or stub substitution occurred. An unsafe SigLIP preflight was respected.

Three new synthetic tests cover the real provenance-label defect, sanitized application propagation of ten detector/worker error classes without fallback or downstream sampling, and rejection of malformed frame counts/cuts, CPU responses and provider timestamp payloads. They are controlled failure/contract evidence, not pretrained or real-footage evidence. They do not claim every OS timeout/crash mode was physically induced. Actual service lifecycle closed the owned workers; failure branches retain sanitized codes.

## Resource observations

Nine-source detector calls totaled **150.828 s**: **127.391 s decode**, **14.989 s inference**, plus model load/IPC/cache overhead. Cold model load was **3.552 s**, counted once for that worker; subsequent responses repeat the recorded cold-load value. First-asset inference including initial TensorFlow warm-up was **5.917 s**; subsequent per-asset inference ranged **0.496–2.006 s**. PySceneDetect detector calls totaled **83.311 s**. These timings are observations, not a controlled speed benchmark.

Corrected full application: **40.752 s**, including fresh detector work and 55-frame cheap-cache repair. Full cached repeat: **0.564 s**, zero detector/semantic provider calls and zero decoding. Nine-source timeline cache repeats likewise performed no provider calls.

Sampled system GPU use peaked at **2,028 MiB** in the corpus attempt and **1,612 MiB** in the corrected application; minimum reported free GPU memory was 3,893 / 4,309 MiB. Approximate owned-worker peak RSS was **1,609,973,760 / 1,594,400,768 bytes**. WSL reported per-process GPU bytes as unavailable, so system memory must not be attributed wholly to the model. A transient duplicate process-command observation occurred during subprocess launch; only one NVIDIA compute PID was present. No profiler subsystem was added.

## Final regression and preservation gate

`npm.cmd run verify` completed with exit **0** at **2026-09-20T19:37:52.5451891Z** after fresh application verification.

| Gate | Result |
| --- | --- |
| Typecheck/build | PASS |
| TypeScript tests | **92 PASS**, zero failed/skipped: previous 89 plus three new TransNet application/contract tests |
| Media regressions | **6 PASS**, including reference and VFR coverage |
| Python tests | **11 PASS**, synthetic/mocked/tiny-parameter evidence |
| Workspace audit | **42 application files / 9 explicit runtime adapters PASS** |
| Generated schemas/fixtures | **33 PASS** |
| Synthetic demo | PASS; synthetic scope and incomplete media QC remain explicit |
| Frozen contracts/reference/MediaTruth/SigLIP/candidate/provider/schema/dependency source | Unchanged against baseline |
| Default detector | PySceneDetect unchanged |

## Evidence, limits and next gate

Machine-readable receipt: ignored `.local-runs/phase2_6b_20260920/final-receipt.json`. It binds source and evidence hashes, safe asset identities, all fresh/cached/baseline boundaries, model/CUDA evidence, resources, failures and regression results. Prior blocked preflight and failed attempts remain unchanged. No private media, model, environment, cache or local receipt belongs in the commit.

Complete source SHA-256 identities:

- `2992bd1e8875b0f1b949875d1c4364aad5c418668e961d7b7be4db573ed0de29`
- `5bd959cd99ab5b8c3bc7ceb19c70898a1eb4c852cd159fccd502b024177af3f0`
- `1299ab9d283b22634d24ff819e1ce7bef5eebaf0f87dedc08c7efa523e7ab4b5`
- `45ecd27e50f88f11729481d6ed325dfc327c0a199eb32ab3951a9d53e0784be7`
- `f2219f5b0b7798b3d7574c96492048aa6dfb14100d94a7ee73b7576faeba5d49`
- `1a1de6da70ffd4761f7859025f4df5c7aecd86e51a5d638096e0da5ef1a3e10c`
- `178b45bf2320621c15207aaf5063ec41b64df3f37c34874ec86264bee7b12d21`
- `d68437959fc275082da887b80177a97bb60709acbc565253f5b84f38a27ecf30`
- `e59b0a675d4d9615a64f39a1d48360109e5835bd23c8159d74cd0d3169b0f93c`

Limitations: this corpus does not establish broad-domain generalization; no professional editing-quality claim; no narrative/emotion-quality claim; no creator-preference claim; detector superiority remains unproven without suitable labeled boundary ground truth. All nine assets have current service/timeline evidence; one real VFR asset additionally has complete fresh application and cached-repeat evidence. Semantic inference was cached real-model evidence, not a new SigLIP gate.

Next gate requires separate owner authorization. No detector-default change, merge to main, editorial-contract implementation or Phase 3 execution is authorized by this closure.
