# Phase 5 Gate 7 Batch 3E-B2-A1 — Canonical media profile v1 and typed canonicalization plan (pure contract)

**Status (2026-10-05, §16).** 3E-B2-A1: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**. 3E-B1B: **OWNER-ACCEPTED** at `fc0e38a`. B2-A2 (runtime),
B2-B (re-encode) and 3E-C: **NOT STARTED** and not authorized by this batch. Gate 7: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.

Evidence: `.local-runs/phase5-gate7/batch3e-b2a1-20261005/` (ignored): numbered logs, receipts and the scratch instruments, kept unchanged.
Every fixture is a labelled synthetic facts record or an opaque label digest. No FFmpeg or ffprobe process, owner footage, model or network
was used, and no byte was written to a canonical store. The B2R research evidence was read only, including five of its generated media files,
scanned for the SEI identity (`instruments/sei-scan.mjs`).

## 1. Baseline, owner decisions and authorization

- After `git fetch`, the local and remote `phase/5-gate7-3e-production-hardening` resolved to `01a58d8769474c0a4b6d98fd7a9e77b558e96eee`,
  and `main` and `origin/main` to `4f85b559c7eff2c24e221011f3ee1dd1466a111d` (6 ahead, 0 behind). There were no tracked or staged changes;
  the owner's untracked files were left alone (`00-baseline-identity.log`).
- 3E-B2R, the read-only research into the real creator-media envelope, ran after the B1B acceptance commit `01a58d8` and changed no tracked
  file. Its evidence is `.local-runs/phase5-gate7/3e-b2r-20261005T1353Z/` (about 3.8 GB, ignored, not moved, not committed).
- The owner resolved B2R as D1-D15 and authorized B2-A1 as a **pure contract and planning** batch: a versioned CanonicalMediaProfile (D1),
  a typed canonicalization plan (D2), DIRECT meaning "satisfies the profile" under a new planner (D3), N1 frozen (D4), near-CFR snapping
  bounded by a quarter period (D5), true VFR deferred (D6), exact timeline-zero rebasing (D7), the payload-preserving audio retime within the
  proven bound (D8), held first frames refused (D9), only B2R-established informational SEI (D10), D4 orientation, HEVC 8-bit SDR and
  non-square SAR deferred to B2-B (D11-D13), a safe SDR colour envelope with an explicit BT.709 assumption and no invented range
  assumption (D14), and an extensible profile (D15).
- Authorized production files: `packages/media-ingest/{canonical,index}.ts` (existing) and `profile.ts`, `plan.ts` (new);
  `packages/edit-render/owner-media.ts` only if necessary (it was not, §9). `canonical.ts` was not needed either and is byte-identical.

## 2. The B2R evidence, verified before design (`01-b2r-checksums-verify.log`)

The B2R manifests were re-checked: 74 of the 75 entries of `SHA256SUMS.txt` match, and the one mismatch is `README.md`, which matches
`SHA256SUMS-addendum.txt` (7 of 7 match; the README's own addendum says it was updated after the first manifest). `e14d-*` is in neither
manifest and was hashed. The research media read for the SEI identity match the hashes B2R recorded. The underlying JSON, not only the
README, was read for every conclusion below.

| area | evidence | what it establishes | used as |
|---|---|---|---|
| DIRECT gaps | e01s, e04, e05, e05b, e00, e02 | the accepted DIRECT admits 0°-reading mirrors (M05 vflip, M09 rot180+hflip), translation, scale, shear, perspective and w ≠ 1 matrices (P01-P04, P07, P08), a container `clap` (CR01), interlace with explicit 1:1 (C09), PQ, HLG, BT.601 and BT.2020 tags (T02, T04, T05, C03, C06), and conflicting SAR declarations (e02 C01: VUI 4:3, `pasp` 1:1) | every one is refused or deferred by profile v1 |
| display matrix | e01s (23 fixtures) | the 9 coefficients are exact; ffprobe's `rotation` is lossy (−180 for hflip and rot180, 0 for vflip, 90 for rot90 and rot90+hflip); each of the 7 non-identity D4 matrices autorotates exactly as one transpose/flip filter; an identity `tkhd` exports no side data | the full-matrix model (§3) |
| clean aperture | e04 CR01 | stream side data "Frame Cropping"; decoded 300x170 while the stream declares 320x180; the accepted DIRECT admits it | `frame_cropping_present` and the declared/decoded geometry rule |
| exact vs near CFR | e03 | exact CFR is independent of the time base (A, B1-B3, B5, B6); 30000/1001 in 1/600 is quantized (B4, renderer refuses); jitter of 2 and 7 ms is within a quarter period at 30 fps (C1 0.06 P, C2 0.21 P), 12 ms is not (C3 0.36 P); the piecewise, low-light, 60→10 and gap shapes are VFR | exact = DIRECT; near → snap; VFR deferred |
| snap bound and rate set | e03 retimes, e03b, `instruments/timing.mjs` | snapping C1, C2 and H5 (B-frames) by stream copy is pixel-identical by index, CFR-exact and DIRECT (max shift 2.0 and 6.99 ms); B4 snaps after an exact 1/600 → 1/30000 rescale (max 0.83 ms); the classifier's finite rate set is 24000/1001, 24, 25, 30000/1001, 30, 48, 50, 60000/1001, 60, 100, 120000/1001, 120, chosen by least displacement as a fraction of the period, then list order | P/4 inclusive; exactly that rate set and rule; the declared rate is never a target (C2 declares 90000/1) |
| audio retime bound | e11, e07c | the asset_05 replica (−7 at frame 3, −2 more at frame 26) retimed contiguously by stream copy keeps every payload identical by index and classifies DIRECT; the maximum displacement is **9 samples**; owner asset_05 shows exactly −7/−2 at 44.1 kHz, asset_02 one +1 | the bound 9, exactly |
| informational SEI | e00, e04 SD01/SD02/SD04, e14d, `instruments/sei-scan.mjs` | the only H.264 side data is the x264 encoder-information user-data SEI, UUID `dc45e9bd-e6d9-48b7-962c-d820d923eeef` ("x264 - core 165 r3223", read from the research bytes), DIRECT with an explicit 1:1 and refused by N1; the HEVC fixtures carry the x265 one, `2ca2de09-b517-47db-bb55-a4fe7fc2fc4e` | the narrow allowlist (§4) |
| colour envelope | e05, e05b, e10, e13 | the pipeline converts no colour and labels a mixed output with the first segment's tags (e10); full range decodes as `yuvj420p` and is refused; the untagged C01 is DIRECT but its luma was never measured (instrument limit (a), `failed-experiments.log`); owner footage: 6 × tv/BT.709, 3 × all unset | BT.709 primaries/transfer/matrix, unspecified ones under an explicit assumption; **no range assumption** |
| stream dropping | e04 L01, L02b, L03; e11 | timecode (`tmcd`) and `mov_text` tracks make the strict probe refuse; `-map 0:v:0 -map 0:a:0 -c copy` keeps every A/V packet identical and classifies DIRECT; two audio tracks are refused | SELECT drops exactly those two classes; several A/V streams refuse |
| B-frames and edit lists | e03 H1-H5, G1-G4, e03b, e03c, e07r asset_07 | B-frame presentation timestamps are exact CFR with an edit list (H1, H2, asset_07 DIRECT); without one the start is the reorder delay (H3, 1024/15360 s); `-copyts` plus an exact tick subtraction rebases G1 and H3 pixel-identically; without `-copyts` the CLI double-shifts and the muxer hides frames (failed experiment e03b) | REBASE needs one exact common positive start; decoded presentation timestamps are authoritative, decode order never matters |

No stop condition fired: the rate set and the audio bound are both recoverable exactly, as above. B2R established **no** assumption for an
unspecified colour range, so profile v1 requires an explicit limited range (§4, §13).

## 3. CanonicalMediaFacts 1.0.0 (`packages/media-ingest/profile.ts`)

Typed, normalized observations of one file's exact bytes. B2-A2's trusted adapter will derive them; B2-A1 only reads them. No raw ffprobe
JSON, path or filesystem state is a fact.

- **Streams**, contiguous from index 0: video, audio, timecode (`tmcd`), subtitle (`mov_text` or other), data, attachment.
- **Video**: codec (`h264`, `hevc`, other); pixel format and declared bit depth; field order; the declared presentation size and the distinct
  decoded frame sizes; the container and bitstream SAR declarations, each unspecified or an exact ratio; the **full display matrix** (absent,
  nine 16.16/2.30 coefficients, or present but unreadable); the container clean aperture; colour range, primaries, transfer and matrix
  (unspecified is `null`); a closed side-data vocabulary (frame or stream carrier, kind, and the UUID of a user-data-unregistered SEI); the
  time base (1/timescale); the declared rate; whether decode order differs from presentation order; and every decoded presentation timestamp
  in presentation order.
- **Audio**: codec (`aac_lc`, `aac_other`, `pcm_s16le`, other), sample rate, channels, layout, time base, and every decoded frame's timestamp
  and sample count.
- A stream display matrix and a clean aperture are their own facts, never side-data entries; a frame-carried matrix is one. Side-data entries
  are distinct and in canonical order, decoded sizes are listed once.
- `videoTimelineDigestOf` and `audioTimelineDigestOf` are the digests of exact timestamp tables; `canonicalMediaFactsDigestOf` is the
  digest every evaluation, plan evidence and derivation binds.

`classifyDisplayMatrix` reads the nine coefficients only: absent; identity; one of the seven non-identity D4 elements (`rotate_90_ccw`,
`rotate_180`, `rotate_90_cw`, `mirror_horizontal`, `mirror_vertical`, `transpose`, `transverse`); unsupported with named features (a
non-D4 linear part as `scale`, `rotation`, `shear` or `singular`; `translation`; `perspective`; `non_unit_w`); or unknown. A vertical flip and
rot180 + hflip are the same `mirror_vertical`, and neither can read as identity.

## 4. CanonicalMediaProfile v1

`CANONICAL_MEDIA_PROFILE_V1.profileId` = `canonical_media_profile_v1_376754b913318b36c3e57de8192590b7f7d6380abd8d08c7e94f1759723dfafb`, the
content identity of exactly `CANONICAL_MEDIA_PROFILE_V1_SEMANTICS` (no path, time, scope, user, machine or random value). Any changed rule is
another profile (P15 changes every one of its leaves). It is the state ingest treats as truthful and safe, not an output render profile.

| dimension | v1 |
|---|---|
| streams | ISO BMFF; exactly one video; absent or exactly one audio; nothing else retained |
| video | H.264, `yuv420p`, 8-bit, 4:2:0, progressive; declared size = every decoded size, at most 16384; SAR explicitly 1:1 with agreeing declarations; display matrix absent or identity; no clean aperture |
| timing | decoded presentation timestamps strictly increasing; every retained stream starts at exactly zero; exact CFR at the declared rate from zero; 1-120 fps, numerator ≤ 120000, denominator ≤ 1001, ≤ 72000 frames, ≤ 600 s (the accepted B1 bounds) |
| colour | range `tv`; primaries, transfer and matrix BT.709, or unspecified under `interpreted_as_bt709_v1` (recorded as a finding); unspecified range: `none_not_established_by_b2r_explicit_tv_required` |
| side data | only the x264 encoder-information SEI on H.264 frames (and, for classifying the HEVC candidate, the x265 one on HEVC frames); anything else never conforms |
| audio | absent, or AAC LC or PCM s16le at 32, 44.1 or 48 kHz, mono or stereo, time base 1/rate, contiguous exact cumulative sample counts from the common zero |

## 5. The evaluation

`evaluateCanonicalProfileV1(facts)` is total. Invalid evidence is a REFUSE with `facts_invalid` and no digest. Every check is independent
and reported, each finding naming one dimension and one disposition from a closed table of 56 codes (`PROFILE_FINDING_RULES`). The outcome
is the worst disposition: any `refuse` → **REFUSE**; any deferral → **CANONICALIZABLE_REENCODE_DEFERRED**; any `exact_remux` →
**CANONICALIZABLE_EXACT_REMUX**; else **CONFORMS** (`allowed` findings record the BT.709 assumption and the informational SEI).

- Exact remux: `extra_non_av_stream`, `timeline_nonzero`, `sar_unspecified`, `near_cfr_snap_candidate`, `audio_small_timestamp_discontinuity`.
- Deferred re-encode (known future candidates, never malformed): `display_d4_non_identity`, `codec_hevc_8bit_sdr_candidate`,
  `sar_non_square`; temporal: `true_vfr`.
- Refused, among others: `interlaced`, `bit_depth_unsupported`, `chroma_subsampling_unsupported`, `color_range_full`,
  `color_range_unspecified`, `color_hdr`, `color_unsupported`, `display_matrix_unsupported`, `display_matrix_unknown`,
  `frame_cropping_present`, `geometry_declared_decoded_mismatch`, `sar_declarations_conflict`, `unknown_side_data`, `hdr_side_data_present`,
  `icc_profile_present`, `spatial_side_data_unsupported`, `held_first_frame_ambiguous`, `timing_malformed`, `timing_interval_below_minimum`,
  `frame_rate_declaration_mismatch`, `audio_av_start_mismatch`, `audio_timestamp_discontinuity_unsupported`, `multiple_video_streams`,
  `multiple_audio_streams`, `unsupported_stream`.
- Timing classes: exact (at the declared rate), near (the B2R rate set within P/4), held first frame (a first interval longer than one
  period before an exact or near tail: e07r assets 02/06), true VFR, malformed (non-increasing, never sorted), below the minimum interval
  (shorter than one period of 120 fps: e03 F1's one-tick pairs).
- `CANONICAL_PROFILE_EVALUATION_V1` (`4d358ce9…`) is the digest of the profile identity, the exact-remux envelope and the finding table.

## 6. CanonicalizationPlan v1 (`packages/media-ingest/plan.ts`)

A plan is immutable, versioned (`planVersion` 1.0.0), identity-bearing, path-free and time-free: `executionClass` `remux`, `encodeProfile`
`null`, the kept `streams` and an ordered subset of the closed vocabulary, each with exact typed parameters and never a command string.

| order | operation | parameters |
|---|---|---|
| 1 | `SELECT_AV_STREAMS` | the dropped streams: only `tmcd` timecode and `mov_text` subtitle, never a kept A/V stream |
| 2 | `REBASE_TIMELINE_ZERO` | the exact common start as a rational and one exact offset per kept stream in its own time base (t′ = t − t0) |
| 3 | `DECLARE_SQUARE_SAMPLE_ASPECT` | 1:1 and the accepted `unspecified_sample_aspect_ratio_is_square_pixel_v1` assumption |
| 4 | `SNAP_VIDEO_TIMESTAMPS` | frame count; source time base and the digest of the exact source table; target rate (B2R set); output time base (the source's when it holds the grid, else the least common multiple: B4 600 → 30000); grid period in ticks; maximum displacement and the approved bound P/4, both exact rationals |
| 5 | `RETIME_AUDIO_CONTIGUOUS` | sample rate; frame and sample counts; source start (the rebased audio's); the digest of the exact source frame table; maximum observed displacement and the approved bound 9 samples |

`CanonicalizationPlanSchema` refuses an unknown or arbitrary operation or field, a duplicate, any reordering (plans are never reordered),
another target profile or plan semantics, a dropped kept stream, an offset that is not exactly the common start, a snap rate outside the set,
another output time base or grid period, a widened or non-reduced bound, a retime above 9 samples or starting elsewhere, and a planId that
does not recompute.

**Identity.** `planId` (`canonicalization_plan_v1_…`) binds the plan type and version, the target profile identity, the plan semantics
(`CANONICALIZATION_PLAN_SEMANTICS`, digest `8b14f8a6…`, which includes the evaluation digest), the execution class, the kept streams and the
ordered operations with every parameter. It never binds source bytes, a path, user, project, time, attempt or random value: one semantic plan
applied to different bytes keeps one planId (L22), while the computation identity separates the bytes (§8). Where a mapping depends on the
source's exact timestamps (snap, retime), the plan binds the digest of that source table rather than the table, so two different temporal
mappings never share a planId.

## 7. The planner and combinations

`planCanonicalizationV1(facts)` takes only the facts and returns **DIRECT** (conforms; no plan), **PLAN**, **DEFER** (a known future
candidate) or **REFUSE**. Every operation and parameter is derived from the facts; no caller can request, omit or reorder one
(`revalidateCanonicalizationPlan(plan, facts)` is true only for the planner's own plan). Independent problems compose into one plan in the
canonical order (L07): timecode + unspecified SAR; offset + unspecified SAR; near-CFR + unspecified SAR; near-CFR + AAC defect; and all five
at once. Nothing in this layer is wired: `classifyCanonicalIngest` (B1) remains the production classifier (C01).

## 8. CanonicalMediaDerivation 0.2.0 and its derived authorization

- `CanonicalMediaDerivation` **0.1.0** is exactly the accepted N1 record (D01, D12, C08). **0.2.0** sits beside it
  (`CanonicalMediaPlanDerivationSchema`; `AnyCanonicalMediaDerivationSchema` reads either). It binds the source (asset, hash, size, the
  consenting 1.1.0 root authorization, the facts digest and its exact-remux evaluation), the full validated plan (and so its planId and target
  profile), the pinned plan toolchain, the output (asset, hash, size, facts digest), the verification and the root's scope.
- **Verification** (`exact_remux_verified_v1`, declared here, executed by B2-A2): the output's own evaluation CONFORMS; decoded frame content
  is identical by index; video packet payloads are identical unless DECLARE rewrote the parameter sets; audio packet payloads are identical by
  index; the exact temporal mapping is recorded (identity, rebase, snap or rebase then snap; identity, rebase, retime or rebase then retime),
  with the snapped output table checked against the plan's exact grid; the dropped streams are declared and equal the plan's. The schema
  also requires the plan's operations to be exactly those the recorded source findings require.
- **Builder.** `buildCanonicalMediaPlanDerivation` re-plans the source facts and accepts only that plan, requires the output facts to
  conform, and checks with both facts records that nothing but the plan's changes differs: every video property but the SAR (DECLARE) and the
  timeline, one output frame per source frame at exactly the plan's instant, and audio with its format, frames and sample counts at exactly the
  plan's positions.
- **Identities.** `canonical_media_computation_v1` binds exactly the source bytes, the plan and the toolchain (D03-D06, H14, H15).
  `canonical_media_derivation_v1` binds the completed record (D07). The v0 domains are unchanged and not reused (D12).
- **Toolchain.** `CANONICAL_PLAN_TOOLCHAIN` is its own canonicalizer (`ci_canonical_media_plan_canonicalizer` 0.2.0, digest `81b9f9b7…`,
  binding the profile, the plan semantics, the compilation rule and the verification methods) on exactly the N1 toolchain's pinned FFmpeg,
  ffprobe, runtime and environment. The N1 `CANONICALIZER_DESCRIPTOR` and toolchain are untouched, so no N1 identity moves.
- **Derived authorization.** `buildCanonicalPlanDerivedAuthorization` writes `derivedFrom.recipeId = planId`. The accepted field is an
  `IdSchema` naming the transformation that made the bytes; the planId names it exactly (more precisely than N1's version-free recipe id), and
  the derivation id is bound beside it. The public FootageAuthorization schemas are unchanged (C03).

## 9. What did not change

| fingerprint (`03-baseline-fingerprints.json` → `50-final-fingerprints.json`) | before | after |
|---|---|---|
| `N1_SEMANTICS` | `21aa304a…` | identical |
| `N1_ARGV_TEMPLATE` | `36626b4d…` | identical |
| `N1_RECIPE` | `032cef65…` | identical |
| `canonical_media_computation_v0` / `canonical_media_derivation_v0` (literals; N1 fixture chain `18bc3316…` / `930fb1d3…`) | as accepted | identical |
| `CANONICALIZER_DESCRIPTOR` / `CANONICAL_TOOLCHAIN` | `9e175dfc…` / `cc438b52…` | identical |
| FootageAuthorization schemas (`protocol.ts`, the two interchange schemas) | `c16bee57…`, `7d234ec0…`, `90039407…` | identical |
| canonical store constants, computation record identity | `2e8f117c…`, `canonical_computation_record_v0` | identical |
| owner render authorization statements, `OWNER_MEDIA_AUTHORITY_DIGEST` | as accepted, `0cd89b68…` | identical |
| permit binding literals | `owner_local_media_manifest_registry_not_production_v0`, `synthetic_fixture_registry_only_not_production_v0` | identical |
| 60 s evidence policy (`records.ts` `Age … max(60_000)`) | `f3b717e4…` | identical |

`git diff` against `01a58d8` touches only the files in §15. Unchanged: `packages/media-ingest/canonical.ts`, `packages/edit-render/*`
(renderer, probe, admission, permit, owner-media pure contract), `packages/footage-analyzer/protocol.ts`, `packages/contracts/*`, every
script and adapter (`scripts/media-ingest-local.ts`, the owner-media authority, `scripts/edit-render-local.ts`, `scripts/audit-workspace.mjs`),
`packages/edit-{execution,runtime,graph,editorial}/*`, `packages/{world-model,planning,director}/*`, `schemas/interchange/*`, `python/*`,
`package.json`, `package-lock.json` and `tsconfig.json`. No FFmpeg or ffprobe argv, spawn, strict_spawn registration or store behaviour
changed.

**Owner-media pure contract: unchanged (not necessary).** The registry's derivative entry still reads only CanonicalMediaDerivation 0.1.0
(C02). Accepting 0.2.0 there needs the adapter to verify a 0.2.0 computation record in the store at the same time, which is runtime wiring
(B2-A2). Widening only the pure schema would have changed the adapter's typed inputs, so it was left for B2-A2 (§14).

## 10. Tests

New, all pure (`tests/media-ingest-profile.test.ts`, `tests/media-ingest-plan.test.ts`, support `tests/support/canonical-facts.ts`):

- **Profile** P01-P17: conformance; interlace; non-square, unspecified and agreeing SAR; the seven D4 elements; 0°-reading mirrors and
  non-D4 matrices; clean aperture; unreadable matrices; PQ and HLG; 10-bit, 4:2:2, 4:4:4; full and unspecified range; BT.601, BT.2020, sRGB
  and log; the informational SEI; unknown side data; profile identity over every semantic leaf; the four deferred candidate classes with
  HEVC 10-bit/HDR refused (P16); every remaining code with its exact dimension and disposition (P17).
- **Facts** F01-F10: D4 classification, vflip and rot180+hflip, non-D4 features, exact CFR across time bases, near versus true VFR, true VFR
  never snapped, held first frame, B-frame reordering, malformed and minimum-interval timing.
- **Plan** L01-L22, **derivation** D01-D12, **compatibility** C01-C09 (the B1 classifier's frozen outputs, the unchanged owner-media
  contract, and byte pins of every protected surface at `01a58d8`), **hostile**
  H01-H18 (forged identity claims, hidden translation and crop, relabelled SEI, HDR, BT.601, VFR and held frames, removed, inserted and
  reordered operations, widened bounds, identities without source or plan, a plan without its profile, a derivation without verification,
  a changed N1).
- Allowlist change (owner-authorized): B1A-P01's media-ingest file list now includes `plan.ts` and `profile.ts`, under the same purity scan.

## 11. RED/GREEN history

1. **RED** (`10`-`14`): a `git archive 01a58d8` tree plus the new test files. `10` stopped on a test syntax error (fixed) and `11` on a test
   type annotation (fixed); both are kept. `13` (on `12`'s tree): 126 tests, 47 pass (C01, C03-C08, H18 and 39 B1A tests), 79 fail, every
   one on absent behaviour (`planCanonicalizationV1`, `evaluateCanonicalProfileV1`, `classifyDisplayMatrix`, `canonicalMediaProfileIdOf` and
   the v1 literals undefined; B1A-P01 on the absent files), except C09, which failed because `git archive` omits `package-lock.json`;
   `14` re-runs C09 with the baseline lockfile: PASS.
2. **GREEN 1** (`20`-`22`): the first implementation: B2-A1 86/86, B1A 87/87. Spot check (`23`): the C2-shaped snap at 7 ms in a 30 fps
   grid, B4 snapped in 1/30000 with 1/1200 s displacement, HEVC and vflip deferred, untagged range refused.
3. **Self-review hardening** (`24`, `25`), before any final run: `Object.hasOwn` instead of `in` for the finding-to-operation table
   (prototype names cannot reach it through the closed enums; defensive only); the bit-depth rule reads the profile semantics instead of a
   literal (same value); a new structural rule that a RETIME starts exactly where its rebased audio starts, with an H13 sub-case. 173/173.
4. **Mutation check 1** (`26`): 25 mutants, 24 killed, controls green. **M23 survived and is equivalent**: without a snap, a plan exists only
   if the source timeline is exact at its declared rate from its start, and the conforming output must keep the time base, rate and frame
   count, so the output table already equals the source table minus the rebase offset; the removed check is implied. It is kept as defence in
   depth.
5. **Coverage review**: 17 finding codes had no direct assertion, including the owner-required HEVC 8-bit SDR candidate. P16 and P17 were
   added. `27`/`28`: the build's type check and P17 (a `ReferenceError`) failed on a missing test import, test-only; fixed in `29`/`30`:
   88/88. No production byte changed after `24`.
6. **Mutation check 2 on the final test bytes** (`31`): 34 mutants (the 25, plus a changed N1 semantics, a relabelled N1 identity domain,
   container-first SAR conflicts, HEVC treated as unsupported, a source-only snap time base, a snapped mis-declared rate, an ignored hidden
   crop, no minimum interval and an unchecked retime start): **33 killed**, M23 equivalent as above, controls 88/88.
7. **Final RED on the final test bytes** (`32`-`34`): the `git archive 01a58d8` tree plus the baseline lockfile plus the four final test
   files, byte-identical (`32-final-red-tree.txt`). 175 tests: 95 pass (C01, C03-C09, H18 and 86 B1A tests), 80 fail, all on absent
   behaviour (every other B2-A1 test and B1A-P01).
8. **Final gates** (`40`-`53`), §12. The identity values quoted in this record were re-read from the final build (`52`).

## 12. Results

| gate | result | evidence |
|---|---|---|
| B2R evidence re-verified | 74/75 manifest entries plus 7/7 addendum (the README by the addendum) | `01` |
| B2-A1 (P01-P17, F01-F10, L01-L22, D01-D12, C01-C09, H01-H18) | **88/88 PASS** | `43-final-b2a1.log` |
| B1A (`media-ingest` with the B1A-P01 allowlist, `owner-media-derived`) | **87/87 PASS** | `44-final-b1a.log` (baseline `04`: 87/87) |
| B1B pure (`media-ingest-local`, `owner-media-canonical`) | **22/22 PASS** | `45-final-b1b-pure.log` (baseline `05`) |
| 3D owner-media (`edit-real-footage`, `-lifecycle`, `-harness`, `-r02`) | **24/24 PASS** | `46-final-owner3d.log` (baseline `06`) |
| Render pins (`edit-render` B96, `edit-review` R01, `edit-render-audit`) | **96/96 PASS** | `47-final-renderpins.log` (baseline `07`) |
| Final RED on the final test bytes | 175: 95 invariant passes, 80 absent-behaviour failures | `34` |
| Mutation check | 34 mutants: 33 killed, 1 equivalent | `31` (first run `26`) |
| typecheck | PASS | `40` |
| build | PASS | `41` |
| schema check | PASS | `51-final-schemas-check.log` |
| workspace audit | PASS: 132 application files, 18 adapters, 6 harness process files | `48` |
| `git diff --check`; new files scanned (no CR, tab or trailing space) | PASS | `49`; staged check at commit |
| Backward-compatibility fingerprints | 57 of 58 identical; the one difference is the additive `index.ts` (§9) | `03` → `50` |
| Test pin sweep (`[path, sha256]` pairs in `tests/`) | 153 pins (135 accepted + 18 new), 0 stale, 0 missing | `53` |

Dependencies and lockfile: **unchanged**. No owner footage, FFmpeg or ffprobe process, model, network, Python, full safe suite or
`npm run verify` was run (focused gates in the B2-A1 order).

## 13. Known limitations after B2-A1

- **Pure contract only.** No facts are derived from bytes, no plan is compiled or executed, no 0.2.0 derivation is measured, and no
  verification method is implemented. Every fixture is synthetic; nothing here is real-footage evidence.
- **The facts are trusted input.** The evaluation catches internal inconsistencies (claimed classes, declared versus decoded geometry,
  bit depth versus pixel format, relabelled SEI kinds), but a consistently forged facts record is undetectable in pure code. B2-A2's adapter
  must derive every fact from the exact bytes; the facts digest is what a verifier compares.
- **Unspecified colour range is refused.** B2R measured no untagged luma, so v1 assumes nothing for range. Expected consequence (from the
  e13 aggregate, not verified by running owner facts): the three owner assets with all colour fields unset (02, 05, 06) are refused by
  `color_range_unspecified`; asset_05, the only real retime case, is refused for that and not for its audio. An x264-default untagged
  encode is refused the same way. Expected for the others: the five N1 assets plan `DECLARE_SQUARE_SAMPLE_ASPECT`, asset_07 is DIRECT.
  An owner ruling or further evidence is needed before v1 could change this (a new profile version).
- **Short-clip rate choice.** For a few dozen frames, two canonical rates can both lie within P/4 (e03 B4 fits 30/1 as well as 30000/1001);
  the least-displacement rule chooses deterministically, as B2R's classifier did, and the displacement stays within the approved bound.
- **The informational SEI allowlist is exactly two encoder UUIDs**; other cameras' SEI is unknown and refused until evidenced.
- **Owner-media registry**: 0.2.0 derivations are not registrable yet (§9).
- **M23** is an equivalent mutant (§11); no test can distinguish it.
- Earlier limitations stay open: real derived-source rendering (3E-C), real-owner-footage revision 1 → 2 freshness, distinct physical
  multi-source execution, rotation, VFR, non-square SAR, HDR, 10-bit, HEVC and audio resampling: **NOT VERIFIED / NOT IMPLEMENTED**.

## 14. Work still required

**B2-A2 (runtime, not started):** derive CanonicalMediaFacts from exact bytes (decoded presentation timestamps, the full matrix, both SAR
declarations, decoded sizes, the SEI UUIDs, audio frames); compile the five operations into fixed argv in the pinned runtime with `-copyts`
discipline, exact time-base handling and no caller argv; implement and prove the three by-index digest methods; measure and publish 0.2.0
derivations into the canonical store with a 0.2.0 computation record; wire `canonicalizeLocalMedia` to the planner; register 0.2.0
derivatives in the owner-media registry and adapter; re-prove every operation on real media under the pinned FFmpeg.

**B2-B (re-encode, not started):** D4 orientation baking, HEVC 8-bit SDR → H.264, non-square SAR resampling, true VFR resampling
(`RESAMPLE_FRAME_TIMELINE` with an explicit mapping table) and their quality bars; HDR, 10-bit and colour management stay refused.

## 15. Files

| file | change | SHA-256 |
|---|---|---|
| `packages/media-ingest/profile.ts` | new: facts schema, profile v1, display-matrix and timeline classification, evaluation | `7e66f671cd7ca8d43b3d8197d54bb2936dfe3048eeb18ec98695203922d597b4` |
| `packages/media-ingest/plan.ts` | new: plan v1, planner, plan toolchain, CanonicalMediaDerivation 0.2.0, derived authorization | `29a5c4b8e0eacb0ddbdd6bc27909078e26d5482bf96b3de23a11780ef9a35f39` |
| `packages/media-ingest/index.ts` | additive exports (the accepted export statement byte-identical) | `1c76b1f70dd9978d09d60e8a27a38a600110cb9ec8201b9dadf306c8b5c6e582` |
| `tests/media-ingest-profile.test.ts` | new: P01-P17, F01-F10 | `3e862018d48ae602e274a1a99d2db0e13278e37849ba49b20101274197438fc7` |
| `tests/media-ingest-plan.test.ts` | new: L01-L22, D01-D12, C01-C09, H01-H18 | `fe2178236e1652387e763e014e5e624ce94a65353c4be87f37a25dd3d786fb75` |
| `tests/support/canonical-facts.ts` | new: labelled facts fixtures and the independent remux oracle | `d8f06403027339981bbc213d353cdda1b9bd0d8622958737a9e4587904d5fda7` |
| `tests/media-ingest.test.ts` | B1A-P01 allowlist: two new package files | `bb82a09b6141ab0fecbdbaaf041aa09c729af3360a77fe1c762d34a860cfbe94` |
| this record and `docs/CURRENT_PHASE.md` | documentation | not hashed into themselves |

`packages/media-ingest/canonical.ts` stays `f7b2cae9410625c426bd579ae43d93228eb0adbd053459221ba14320d8cc0332`.

## 16. Status

3E-B2-A1: **IMPLEMENTED — PUSHED FOR OWNER REVIEW** (commit `feat(gate7): add canonical media profile and plan` on
`phase/5-gate7-3e-production-hardening`; `main` not modified).

- B2-A2: **NOT STARTED**, not authorized by this batch. The new plan was not executed.
- B2-B: **NOT STARTED**. 3E-C: **NOT STARTED**.
- Gate 7 overall: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
