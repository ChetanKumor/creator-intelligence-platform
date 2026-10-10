# Gate 7 Batch 3E-C: owner-authorized prepared-source attempt

Date: 2026-10-10.

**3E-C BLOCKED — EXACT REMAINING OWNER DECISION.** The owner has since chosen the route (section P): an owner-supplied
camera-original HEVC clip. 3E-C waits for that clip.

The owner authorized one bounded route: prepare a short center-sited HEVC clip from genuine asset_01 footage and a matching H.264 clip
from asset_03, then run the unchanged 0.4 → 0.3 → fresh SigLIP2 → R0/R1/R2 path. The route required the actual chroma siting of
asset_01 to be established and the conversion proved with pixels before any clip was made. The codec declaration was established
(normative left). The pre-registered pixel test could not corroborate it: the measured chroma/luma alignment of both originals is
far from left and from center and varies across the frame. Per the approved scope and the pre-registered rules, the run stopped
before any media was prepared. Nothing was encoded, canonicalized, registered, analysed by a model or rendered. Gate 7 remains
incomplete; Phase 6 is not started or authorized.

Evidence (ignored, local only): `.local-runs/phase5-gate7/b3ec-prepared-20261010/`, receipts `00`–`08` (index `07`), scripts
beside them, private decoded samples in `chroma-private/`. Owner file names are not quoted; assets use their Phase-2 manifest-order labels.

## A. Baseline and source authority

- Started at local `e1bac8190037ee293cd5ff1fe8a873149f17d9a0` (the probe record); main `4f85b559c7eff2c24e221011f3ee1dd1466a111d`.
  Tracked tree clean; the 21 owner untracked files unchanged. AGENTS.md and the untracked CLAUDE.md are byte-identical.
- Probe receipts re-verified: all 48 files named by `09-evidence-index.json` re-hash exactly; the probe cache still holds exactly
  262 files / 30,980,770 bytes.
- Sources were resolved only through the Phase-2 AuthorizedFootageSet (manifest order): asset_01 `entry_ac768615…`,
  86,178,096 bytes, `2992bd1e…ed0de29`; asset_03 `entry_790893a8…`, 50,785,072 bytes, `1299ab9d…a4b5`. Both records are
  AuthorizedFootage 1.0.0, `owner_supplied`, `permission_granted`, purposes analysis and evaluation only.
- Pinned FFmpeg `72a489ec…` and ffprobe `19202b23…` were re-verified by every step that ran them (`02`, `03`, `04`, `06`).

## B. Rights, scope and consent

- The owner answered four explicit questions at 2026-10-10T06:18:51.998Z (`00-owner-authorization.json`, verbatim):
  - **Rights:** "Yes, rights confirmed": the owner's permission covers private local derivative clips, their analysis and rendered
    edits; nothing is published.
  - **Basis:** "Prepared roots admissible": no owner-frozen 3E-C acceptance specification exists; the untracked draft's prohibitions
    (lossy conversion, retagging, altering files for eligibility) bind the accepted pipeline, not a disclosed upstream preparation.
  - **Scope:** "Approve exactly as listed", including the stop rules (any refusal, failed chroma proof or guard refusal is a STOP).
  - **Storage/compute:** "Approve as stated" (git-ignored local storage only, retained until the owner decides; CPU only under the
    unchanged guard; laptop on AC).
- Approved but **not written**, because no prepared bytes exist: the A root (1.1.0, `owner_supplied`/`permission_granted`,
  canonicalization consent), the B root (1.0.0), the A′ derived record and the derived-capable render authorization (actor
  `owner_gate7_3ec_local`, intent `final`, expiring 2026-10-17T06:18:51.998Z). The old Phase-2 records are untouched.
- Precision note: the approval question called A′'s record "canonicalizer-issued". In the accepted 0.4 flow the canonicalizer
  returns `PUBLISHED_VERIFIED_NOT_AUTHORIZED`, and the derived record is an explicit declaration built only from that verified
  publication (the accepted G/H pattern). This was not exercised.

## C. Prepared sources

**NOT CREATED.** The windows were fixed in advance from the fresh SigLIP2 analyses' shot boundaries (`01`): A = asset_01 frames
[314, 494) inside its single detected shot; B = asset_03 frames [345, 525), centred on its shortest interior shot and spanning two
real cuts. Geometry would have been 960×544 (exact 2:1, 30:17 kept). No clip was encoded.

## D. Chroma-position establishment (the stop)

The rules were written before any pixel measurement (`01-chroma-preregistration.json`, SHA-256 `1b39d2d7…`, bound by hash in `02`
before `04` ran). The instrument (`chroma_phase.py`, `d3732bb2…`) correlates chroma gradient magnitude with Keys-cubic-interpolated
luma gradient magnitude at hypothesised sample positions; it uses only symmetric operations.

| Rule | Result |
|---|---|
| R1 declaration | Both originals: exactly one SPS observed, VUI present, `chroma_loc_info_present_flag = 0` → normative H.264 type 0 (left). ffprobe reports `left` on the stream and on all 809 / 891 frames; BT.709, limited range. Re-hash unchanged. **PASS** |
| R2 generated validation | 3 scenes × left/center/topleft × raw and lossy libx264 CRF 20: **18/18**, maximum error 0.037 luma px. **PASS** |
| R2 real-content controls | asset_01, 6 frames × ±0.25 chroma-sample shifts: Δφh −0.085 to −0.299 and +0.349 to +0.430 against ∓0.50 ± 0.10; 2/12 within tolerance. **FAIL** |
| R3 actual source siting | asset_01 (18 frames): φh median −0.805 (IQR −0.886 to −0.754; 3 frames at the −1.0 grid floor), φv median 0.777. Required φh within 0.15 of 0 and ≥ 0.35 from 0.5; φv within 0.15 of 0.5. **STOP** |
| R4–R6 calibration, prepared pixels, prepared declaration | **NOT RUN** (stopped first) |

asset_03 (informational, B keeps its siting): φh median −0.683, φv median 0.578.

**Post-hoc diagnostic** (`05`, labelled not a decision input; the verdict stands). The step-04 grid floor (−1.0) truncated some
curves, so the same instrument was re-run on twelve of the decoded samples with a [−4, 4] grid:

- asset_01 (6 frames): full-frame peaks −0.70 to −0.92 (median −0.83); left half −0.48 to −0.65, right half −1.15 to −1.32
  (≈0.7 px apart); the ±0.25 controls then land within 0.15 of expectation (worst error 0.152).
- asset_03 (6 frames): full-frame peaks −0.58 to −1.30 (median −0.64); left half −1.22 to −1.43, right half −0.53 to −1.31; the
  controls are erratic (worst error 0.336).
- The real-content correlation curves are nearly flat. At φ = −2, −1.5, −1, −0.5, 0, 0.5 and 1, asset_01 frame 314 gives
  0.5460, 0.5595, 0.5625, 0.5598, 0.5462, 0.5280, 0.5018 (peak 0.5626 at −0.897); asset_03 frame 345 gives
  0.3024, 0.3092, 0.3114, 0.3126, 0.3092, 0.3047, 0.2959. On generated scenes the same instrument peaks at 0.69–0.80.

Interpretation: on these originals the instrument has too little co-located luma/chroma edge contrast to resolve the 0.5 px
difference between left and center. Where it has some (asset_01), it points to a misalignment that varies across the frame
(consistent with lateral chromatic aberration or upstream processing), not to a standard siting. The actual siting therefore cannot be
established, and the declared left siting is not corroborated by pixels. A left→center conversion could not be proven to yield
genuine center-sited samples; if asset_01's measured alignment were real, the output would sit near φh ≈ 0.5 + s/2 ≈ 0.1 output px
(an estimate, not measured), which is not center. Per the approved scope and rule R7, the run stopped before preparation.

## E–M. Not run

0.4 derivation, 0.3 registration and lifecycle, fresh SigLIP2 inference, candidates, R0/R1/R2, freshness/CAS and security negatives:
**NOT RUN**. No production, test, schema, dependency or pin changed, so no regression was required; the 2,153-case inventory stays
historical.

R2 gap, recorded for a later run: the owner-local runner ends after the published R1 trim and its refusals. A real R2 needs one
further published localized revision from the actual current head, through the same propose → authorize → prepare → execute → QC
→ CAS path that 3E-A F2 uses synthetically. That is the smallest harness addition (RED first). It was not implemented.

## N. Resources (measured)

| Quantity | Value | Class |
|---|---:|---|
| Source observation (hash, SPS trace, frame labels), both files | 18.1 s | MEASURED |
| Estimator validation, 18 generated cases | 299.5 s (mean 13.9 s per case) | MEASURED |
| Sampled decode + estimates + controls (36 frames) | 619.9 s; decodes 10.2 s and 6.9 s | MEASURED |
| Post-hoc wide-grid diagnostic (12 frames, with controls) | 513.7 s | MEASURED |
| Private decoded samples | 2 × 56,401,920 bytes | MEASURED |
| Whole evidence directory at the preservation audit | 112,955,084 bytes | MEASURED |
| Model, encode, canonicalization, render | none run | — |

All steps were single-process CPU work (numpy and the pinned FFmpeg). No memory guard was involved because no model ran. The laptop
was on AC (status 2) when work started and on battery (status 1) during and after the post-hoc diagnostic; no heavyweight processing
ran on battery. Per-process memory was not sampled for these light steps (NOT MEASURED).

## O. Preservation

- `06-preservation.json` (verdict **FAIL**, preserved unchanged): approved originals re-hash exactly, 21 owner untracked files exact,
  git unchanged, nothing prepared/registered/analysed/rendered, no leftover task process. Three metadata checks failed by exactly 1 ms.
- Self-found instrument defect: `06` truncated integer nanoseconds, while the probe's Node audit used rounded milliseconds.
  `06b-preservation-method-correction.json` re-measures with the probe's exact method and records raw nanosecond witnesses
  (e.g. 905.754 ms → `.906` versus `.905`): **PASS** for the Phase-2 listing (12 entries), the other seven files (metadata only, never
  opened) and the global `.reference-cache` (298 / 1,284 / 9 / 3 entries, newest mtimes equal). `06c` corrects 06b's wording of the
  rounding mechanism; its checks are unaffected.
- `07-evidence-index.json` indexes 25 files (112,938,282 bytes) with SHA-256 and re-scans the 23 non-private files for 18 owner
  file-name forms: zero hits.
- Adversarial self-review (by the implementer, not an independent agent): the rules were hash-bound before measurement; validation
  and measurement used identical instrument bytes; the wide-grid diagnostic does not re-decide; no threshold changed; only the two
  approved originals were opened, read-only; no record, clip, model run or render exists; the grid-floor, mtime-format and wording
  defects above are disclosed.

## P. Remaining owner decision

The owner was offered four routes:

1. **Supply an untouched camera or device original HEVC clip whose every SPS explicitly signals center siting** (4–8 s, 8-bit
   4:2:0, progressive, SDR, limited range, CFR, square pixels), plus a renderer-conforming second source. The unchanged accepted
   admission then decides eligibility from the explicit declaration, with no preparation and no siting inference. **Recommended.**
2. Explicitly rule that the normative H.264 declaration alone establishes source siting for preparation, waiving the pre-registered
   pixel rules R2/R3/R5 for this run. The clip could not then be described as center-sited by pixel evidence. **Not recommended.**
3. Name another authorized original (exact file and scope) for the same pre-registered test. Its outcome is unknown.
4. Re-scope 3E-C, for example real R0 → R1 → R2 on untouched originals via the accepted 0.2 exact remux (no pixel change). That
   needs canonicalization consent for those originals, a new runner run form (harness work) and acceptance that real 0.4 stays
   unproven.

**Owner decision** (2026-10-10T08:10:26.535Z, `08-owner-publication-and-route.json`): route 1, camera-original HEVC, and docs-only
publication of this record. Preparation from asset_01 is not pursued; the approved-but-unwritten records and render authorization are
not used. Open item for the next run: a renderer-conforming second source at the new clip's frame rate and display aspect (the
approved asset_03 recipe assumed 960×544 and 30:17, so it needs re-confirmation once the clip's geometry is known).

STOP at this checkpoint. No self-acceptance; Gate 7 incomplete; Phase 6 NOT STARTED, NOT AUTHORIZED. No main merge, no deployment.
