# Gate 7 Batch 3E-C: owner-authorized real-media probe

Date: 2026-10-10.

**3E-C PARTIAL / BLOCKED — OWNER ACTION REQUIRED.**

The owner authorized a bounded probe of two real Phase-2 originals: read-only identity/eligibility inspection and genuine frozen
SigLIP2 CPU inference. Both ran and are evidenced below. No authorized real file can produce a genuine 0.4 derivative under the
accepted contract, so canonicalization, registration, R0/R1/R2 rendering and QC were not run. Gate 7 remains incomplete; Phase 6 is
not started or authorized.

Evidence (ignored, local only): `.local-runs/phase5-gate7/b3ec-real-20261010/`, indexed with SHA-256 in `09-evidence-index.json`.
Analyzer jobs: `.local-runs/footage_de88ce30-0507-4f38-999c-cd560846f257/` (fresh) and
`.local-runs/footage_8062474e-840d-4d29-889d-83ec8fc3f92f/` (cache repeat). Owner file names are not quoted; assets use their
Phase-2 manifest-order labels.

## A. Baseline

- Started at local/tracking/live `ece60ae72a9b316055699bd4459a928c730dd64a`; main `4f85b559c7eff2c24e221011f3ee1dd1466a111d`.
- The R01/harness owner acceptance was published first as docs-only `2a6eb427a4c94c6eec8c37fefbad173c7290995a`, with local, tracking
  and live equal. Its read-only audit is `.local-runs/phase5-gate7/b3ec-r01-acceptance-20261010/01`–`04`.
- The probe ran at `2a6eb42` with a clean tracked tree and the 21 owner untracked files unchanged (`08`). `dist/` was rebuilt cleanly
  from that HEAD first (`03-build.json`, exit 0).
- Pins (`02-preflight.json`): FFmpeg `72a489ec…`, ffprobe `19202b23…`. The frozen model files match the local download receipt:
  `model.safetensors` 4,542,792,928 bytes, `11a61a2068800d5f4f35cb041c1fea25de86ce87725e4c97a9ed046d0b22c076` (equal to the official
  LFS SHA); `config.json` `c633dded…`; `preprocessor_config.json` `1125703e…`.
- Runtime: Python 3.12.12, torch 2.8.0+cpu, transformers 4.57.1, safetensors 0.8.0, numpy 2.2.6, opencv-python-headless 4.12.0.88,
  Pillow 11.3.0, scenedetect 0.6.7.1, Node 24.15.0.

## B. Source authorization

- Discovery was metadata-only (`00`). The Creative Intelligence Assets workspace holds third-party stock video (64 Pexels clips, all
  recorded as H.264 4K/8K), a public research dataset and audio. It holds no owner footage. The owner originals are the nine Phase-2
  files, authorized only for `local_footage_analysis` and `local_evaluation`.
- Owner decision 1, at the single checkpoint: "Fresh probe only" for asset_01 (`2992bd1e…`) and asset_03 (`1299ab9d…`). That means
  read-only SHA-256 plus the accepted inspection, the 0.4 outcome recorded, no canonicalization or render, and a docs-only blocked
  status.
- Owner decision 2: also run the genuine frozen SigLIP2 CPU inference probe on the same exact files under the existing capacity
  guards; preserve bytes and contracts; never present `EXISTING_PATH` as canonicalization success; then identify the smallest
  practical route to one eligible real HEVC source. A prepared clip may be evaluated only if the owner approves it explicitly, it is
  labelled truthfully and it passes the existing checks.
- The authority used is the existing Phase-2 records, unchanged: AuthorizedFootage 1.0.0, `owner_supplied`, `permission_granted`,
  creator `creator_phase2_5_local_verification`, project `project_creator_intelligence_phase2_5`. No canonicalization consent and no
  render authorization was written.
- The two-entry set `local-media/phase2-real/b3ec-probe-authorized-footage.json` (1,328 bytes, `e4b1392e…`) copies the two entries
  verbatim (`05`). It grants nothing new.

## C. Media eligibility (fresh, `04-source-facts.json`)

| | asset_01 | asset_03 |
|---|---|---|
| Bytes / SHA-256 (full re-hash equals authorization) | 86,178,096 / `2992bd1e…ed0de29` | 50,785,072 / `1299ab9d…a4b5` |
| Video | H.264, 1920×1088 declared = coded, yuv420p 8-bit, progressive | same |
| Colour | explicit limited range, BT.709 primaries/transfer/matrix | same |
| SAR / display matrix | unspecified in container and bitstream / absent | same |
| Timing | 30/1 CFR, time base 1/90000, 809 frames, no reordering | 30/1, 891 frames |
| Audio | AAC-LC stereo 44.1 kHz, 1,161 frames, 1,188,864 samples | 1,279 frames, 1,309,696 samples |
| Profile v1 | `CANONICALIZABLE_EXACT_REMUX` (`sar_unspecified` → `exact_remux`) | same |
| v1 remux plan | `PLAN`: `DECLARE_SQUARE_SAMPLE_ASPECT` (not executed) | same |
| **0.4 route** | **`EXISTING_PATH`** (`existing_exact_remux_or_direct_authority`), no plan | same |
| Chroma admission API | refused `canonicalization_consent_required` before any process | same |

- The accepted inspection used three pinned processes per file (`source_facts`, `source_packets`, `source_headers`), with walls of
  19.3 s and 13.7 s.
- The 0.4 planner plans only HEVC or D4-matrix sources (`reencode.ts:108`). Chroma planning returns this route before reading any
  chroma carrier (`chroma.ts:171`).
- No genuine 0.4 derivative can be made from either file, and no rule was changed. As originals, unspecified SAR is also their only
  V0-renderer blocker, per the accepted classification recorded in B2R (historical; no render-side conformance probe was run here).
  Only the accepted v1 exact remux (a 0.2 plan derivation) would repair that, and the 0.3 lossless registration admits only 0.4
  derivatives.
- Attempt 1 of the facts script failed at module link time, because one export lives in `profile.js`. It opened no file and started
  no process; its log is kept as `04-source-facts.log`.

## D–E. Canonicalization and registration

**NOT RUN.** There is no eligible 0.4 source, and canonicalization was not authorized. `EXISTING_PATH` is a refusal of the 0.4 path,
not canonicalization success.

## F. Frozen SigLIP2 inference

- **Identity:** `google/siglip2-so400m-patch16-naflex`, revision `cc24074f717b612951c2dead130904ab9b65a81e`, device `cpu`, no CPU
  fallback, `maxPatches` 256.
- **Implementation:** `siglip-local-1`, `rgb-square-pixels-512-v1`, transformers 4.57.1, torch 2.8.0, slow image processor, batch 1.
- **Space:** the computed space equals the frozen `space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687`.
  The configuration is `DEFAULT_FOOTAGE_CONFIG`, `configuration_666cb36cc829a0ae4b84b3380102cb538fd7e525d644d226014bd242cfb4b77f`.
- **Method:** the accepted `analyzeFootage`, `LocalFootageServices` and CLI persistence projection, unchanged. Isolated new frame and
  embedding cache roots under the evidence directory are the accepted constructor parameters. An observational timer wraps
  `backend.embed` and forwards arguments and results unchanged.
- **No contamination and no network:** the global caches are untouched (298/1,284 entries, newest 2026-10-03). The run used the
  no-network guard, HF offline mode and `local_files_only`.

**Fresh run** `footage_de88ce30-…`: succeeded with 2 assets and 0 failures.
- Coverage: 56.67 s of source, 6 shots, 228 cheap frames and 14 semantic samples.
- **14 fresh embeddings** (0 cache hits, 14 misses), computed on CPU.
- Every vector is 1152-dimensional, unit-norm (maximum error 1.1e-16), checksum-valid and in the frozen space (`06`, `08`).
- Analyses: asset_03 `footage_1e04e50eacf1c27f9487c42cd9887988259eda2c4ac496f4c4fc159a57026502` (9 frames, 140 retained candidates);
  asset_01 `footage_85d35105eda3c1fd035ed7561b834ac929a8799b46cbd4404a46e963680776fd` (5 frames, 64 retained).
- Inventory: `inventory_8344020d662639d4beb8f9940faf38285dc877dcc3aed1845b2cbd24292896d8`.
- The 131/59 aggregate "hits" are reuse of the 14 aggregates computed inside this run. The isolated cache went from 0 to 34 entries:
  14 frame vectors, 14 aggregates and 6 memos (`06b`).

**Repeat run** `footage_8062474e-…`: cached real-model evidence.
- 14/14 hits and 0 embeddings. There was no backend call, no worker process and no guarded operation; wall time 2.3 s.
- Analysis and inventory IDs are identical to the fresh run. The only field that differs is the per-run counter
  `inventory.semanticSamplesEmbedded` (9→0, 5→0) (`08b`).
- Telemetry still emits embedding-stage ModelRuns on full hits, so ModelRun records alone are not inference evidence.

**Capacity guard:** the accepted guard was active.
- The preflight read `safeToLoad: true` (commit 16.18 GB, physical 7.18 GB).
- The sampler read 15.40 GB free commit and 6.21 GB free physical just before the loading batch. Both exceed the 11.74 GB and
  3.22 GB thresholds.
- `capacity.json` keeps only the last guarded batch, which ran with the model already resident. Its `safeToLoad: false` describes that
  state and is not a refusal. The load-time decision is not persisted separately; that it passed is inferred from the code and the
  successful load.

**Integrity:** the source bytes were re-hashed after each run and are unchanged. The schema-validated artifacts carry
asset → shot → frame hash → measurement → embedding → aggregation → candidate. These are analyses of **original** bytes. They are not
derivative analyses and cannot stand in for one.

## G. Editorial input

- There are 204 retained candidates, which exceeds the harness bound of 32, so the runner would refuse with
  `candidate_universe_exceeds_harness_bound`.
- A real run must set bounded proposal options before analysis (the R01 precedent) and analyze the actual execution bytes.
- No EditGraph or DAG was built. Selection is not a creative ranker.

## H–J. R0, R1, R2

**NOT RUN.** The runner is still the accepted 16-scenario R0 → R1 harness. No real R2 scenario exists yet.

## K. Security

- No code changed.
- Observed: consent gating (the chroma API refused without consent and started zero processes), analyzer re-hashes before and after
  sampling, and cache isolation.
- No new negatives were run. Every accepted residual limit still applies.

## L. Performance (fresh run on battery power, 48–55%, no Kernel-Power events)

| Quantity | Value | Class |
|---|---:|---|
| Driver wall / analyzer runtime | 115,382 ms / 113,789 ms | MEASURED |
| Metadata / detect / sample, asset_03 | 8,534 / 6,708 / 14,316 ms | MEASURED |
| Metadata / detect / sample, asset_01 | 8,280 / 4,266 / 17,555 ms | MEASURED |
| Embed batch incl. torch import + model load, 9 frames | 39,637 ms | MEASURED |
| Embed batch, model resident, 5 frames | 13,377 ms (about 2.7 s/frame) | MEASURED; per frame ESTIMATED |
| Import + load share | about 15.6 s | ESTIMATED by subtraction |
| Worker peak commit (PeakPagefileUsage) | 10,686,369,792 B | SELF-REPORTED by the worker from OS counters |
| Worker peak working set | 2,202,304,512 B | MEASURED (OS peak counter, read at about 1.6 s intervals) |
| Worker max private bytes / CPU time | 6,267,367,424 B / about 127.5 s | MEASURED by sampling |
| ffprobe / ffmpeg children | peak working set ≤ 40.3 MB; CPU 5.6–11.6 s each | MEASURED by sampling |
| Lowest free physical / commit during the run | 3,809,685,504 / 9,049,825,280 B | MEASURED by sampling |
| Repeat wall | 2,314 ms | MEASURED |
| New local storage | probe cache 30,980,770 B; jobs 1,234,595 + 1,233,842 B | MEASURED |

GPU was not used (CPU torch build). Timings on battery may be throttled. Nothing here extrapolates to long or 4K footage, and no
render, canonicalization or QC was measured.

## M. Regression

No production or test code changed, and no test suite was rerun in this checkpoint. The R01 coverage (2,153 distinct / 2,156
instances) was verified read-only for the acceptance and is historical. Any harness change must rerun the full required inventory.

## N. Preservation

- Approved source bytes are unchanged after both runs.
- The other seven Phase-2 files were not opened. Their sizes equal the manifest and their mtimes predate this session (metadata only;
  no earlier mtime record exists). The only file added to the media directory is the probe manifest.
- Global caches, pins, model files, schemas, dependencies and history are unchanged. Owner untracked files: 21, unchanged.
- No task process remains, and nothing was terminated.

## O. Publication

Docs-only: this record plus a prepended CURRENT_PHASE ruling. Only the phase branch is pushed. No media, frames, embeddings, private
manifests or owner file names are published. No main merge and no deployment.

## P. Verdict and remaining requirements

**3E-C PARTIAL / BLOCKED — OWNER ACTION REQUIRED.**

| Gate | State |
|---|---|
| C01 two authorized distinct originals | Analysis/evaluation only; canonicalization consent and render authorization not granted |
| C02 eligible real 0.4 derivative | **BLOCKED**: no eligible source (`EXISTING_PATH`) |
| C03 fresh frozen inference + cache repeat | Done on originals only; the registered derivative bytes still need their own fresh run |
| C04 candidates / selection | 204 > 32; bounded proposal configuration needed before analysis |
| C05–C08 graph, R0/R1/R2, QC, localized reuse | NOT RUN; real R2 runner scenario not implemented |
| C09 security negatives on real lineage | NOT RUN |
| C10 render-stage resources | NOT MEASURED |
| C11 human review | NOT DONE |
| C12 full regression after harness changes | NOT RUN (no change yet) |

**Smallest practical route to one eligible real HEVC source.** This is identification only; nothing was prepared.

1. **Camera original.** The owner records one 4–8 s HEVC clip and authorizes its hash plus the accepted chroma admission. That needs a
   1.1.0 root carrying canonicalization consent, because the API requires it.
   - It is eligible only if every SPS signals center chroma siting (`chroma_loc_info_present_flag=1`, type 1), with agreeing stream and
     frame labels.
   - It must also be 8-bit 4:2:0, progressive, SDR, BT.709 or unset primaries/transfer/matrix with explicit limited range, CFR, and
     use only hvcC/pasp/colr/btrt/fiel entries.
   - Consumer encoders usually omit siting (DEFER `source_default_unproven`) or signal left (DEFER `fixed_output_default_unproven`).
     The outcome is unknown until the clip is inspected.
2. **Owner-approved prepared clip** (deterministic, no code change). Prepare one 5–8 s video-only clip from asset_01 with the pinned
   FFmpeg 9.0.1 build (libx265 present):
   - Use an exact frame-index window, and resample the chroma from the source's normative unsignalled left siting to center positions.
   - Encode libx265 Main 8-bit 4:2:0, 30/1 CFR, explicit SAR 1:1, explicit BT.709 limited range, chromaloc 1.
   - A metadata-only `hevc_metadata` retag is **not** acceptable for genuine footage. It is valid for the synthetic H fixtures only
     because their siting is defined by construction.
   - Label it `prepared_from_genuine_footage`, with a receipt giving the source hash, frame range, exact argv, tool hashes and output
     hash. It gets a new owner root with canonicalization consent and render authorization, and is never presented as camera-original.
   - It must independently pass the unchanged admission and stay within the accepted lossless output bound (256 MiB by default);
     failure is a recorded refusal.
   - The accepted 0.4 verifier checks carrier agreement and exact samples, not whether the declared siting matches the actual sample
     phase. The preparation receipt must therefore prove the siting conversion separately (a pixel-reference check).
3. **Second source.** A two-source render also needs a renderer-conforming source at 30/1 and 30:17. No authorized original matches.
   The smallest options are a second prepared clip from asset_03 with the same recipe (a second 0.4 derivative on a distinct genuine
   root), or an owner-recorded conforming H.264 original at the same rate and aspect.

STOP at this probe checkpoint. No self-acceptance; Gate 7 incomplete; Phase 6 NOT STARTED, NOT AUTHORIZED.
