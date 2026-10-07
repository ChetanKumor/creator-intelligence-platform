# Current Phase - Phase 5 Gate 7 Batch 3E-B2-A2 (IMPLEMENTED; OWNER REVIEW PENDING; Gate 7 not yet complete)

Last updated: 2026-10-08

## Current ruling

- Phase 5 Gate 7 Batch 3E-B2-A2 (2026-10-08): **IMPLEMENTED; OWNER REVIEW PENDING**.
  - Continued from `9cd339534867260ec77461776a85f7c33ab0aa75`; no reset, history rewrite or duplicated acceptance checkpoint. The 18
    authorized historical untracked files remain byte-identical and excluded from the change set. Main remains `4f85b559c7eff2c24e221011f3ee1dd1466a111d`.
  - The existing ingest adapter now derives independent container/bitstream SAR, full matrix/carrier, crop, color, decoded PTS and audio
    sample facts from verified held bytes. Profile v1 controls DIRECT. The owner-authorized propagated-matrix clarification retains both
    carriers; independent/conflicting frame transforms still refuse. Unspecified range remains REFUSE.
  - A closed compiler executes the accepted ordered remux operations in one invocation. All M01-M10, including all five operations, pass
    two independent executions with identical bytes/derivations. B-frame snap, quantized 30000/1001 time-base expansion, mov_text selection,
    PCM retention and AAC rebase are also proved with generated media. No frame drop/duplication or audio encoding is requested.
  - Fresh output facts, exact temporal mappings, decoded-frame equality and required packet equality precede 0.2 derivation, no-overwrite
    publication, winning-object reverification, versioned computation record and fresh 1.1 authorization. Cache never supplies trusted facts
    or authorization. The existing owner-media authority registers 0.1/0.2 with the same root-first, one-level lifecycle and permit contract.
  - The legacy N1-only route preserves exact argv, output hashes, v0 computation/derivation identities and cache authorization; golden
    before/after media checks pass. Facts/Profile/Plan remain 1.0.0; the profile ID and all other accepted A1 semantics are unchanged.
    The only facts-schema addition is the owner's optional typed carrier evidence. Renderer, probe, permit, lifecycle authority,
    public schemas, dependencies and lockfile are unchanged. Audit adds only the new hostile test's process registration.
  - Final evidence: A2 **66/66** (52 media + 14 pure); **22/22** reviewed in-memory code mutants killed. A1 **88/88**, B1A **87/87**,
    B1B pure **22/22** and media **27/27**, 3D **24/24**, render pins **96/96**, editorial **54/54**, Batch 2B media **34/34**, 3E-A
    freshness media **3/3**. Final affected audit/plan/owner rerun **72/72**. Typecheck, build, schema check (33 artifacts), workspace audit
    (132 application files, 18 adapters, 7 test harness files) and diff check: PASS. Earlier RED/failures remain in the phase record.
  - Scope is generated synthetic media only. No owner footage, model inference or research-media execution. PCM retime is not claimed
    from its nondiscontinuous fixture; real-owner generalization and real derived-source end-to-end rendering remain unverified.
  - B2-B, 3E-C and Phase 6: **NOT STARTED**. Gate 7 remains **NOT YET COMPLETE**. B2-B's intended later alpha is only D4 orientation/mirror
    bake and HEVC 8-bit SDR to H.264, subject to separate owner review. True VFR and non-square SAR stay deferred.
  - Details: [Batch-3E-B2-A2 record](phases/phase-5-gate-7-batch-3e-b2a2-executable-typed-remux.md). This supersedes the historical open-work
    and stop statements below, which are preserved as the sequence of evidence and owner decisions.

- B2-A2 owner clarification (2026-10-07): the display-matrix carrier conflict below is **RESOLVED**. Complete pinned observations of
  exactly one stream matrix and an identical matrix on every decoded frame may represent one semantic transform. Both carriers remain
  in facts; missing, different, varying, multiple or independently conflicting geometry remains refused. D4 stays execution-deferred.
  The facts schema adds optional, fully typed carrier evidence; historical facts retain their previous behavior. Profile identity,
  versions, plan identities and N1 are unchanged. Continuation is from the preserved unstaged work, with RED tests for this narrow rule.

- Phase 5 Gate 7 Batch 3E-B2-A2 continuation (2026-10-07): **IN PROGRESS, STOPPED — 3E_B2_A2_ACCEPTED_CONTRACT_CONFLICT**.
  - Continues from the already completed B2-A1 acceptance checkpoint `9cd339534867260ec77461776a85f7c33ab0aa75`. The owner resolved the
    handoff condition for exactly 18 historical untracked local files; they remain untouched and excluded from the A2 change set.
  - Fresh focused B1B media baseline: **27/27 PASS**. A2 exact-byte fact tests: **15/15 RED** on absent behavior; after partial extraction
    implementation, **14/15 PASS**, with the D4 defer expectation failing. TypeScript compilation passes. No A2 commit or push.
  - A generated H.264 pair differs only in two bytes of the container track matrix. The pinned single-thread ffprobe reports the vertical
    flip both as a stream `Display Matrix` and as `3x3 displaymatrix` on every decoded frame. Full matrix and frame-carrier evidence are
    retained. The accepted A1 evaluator returns REFUSE (`display_d4_non_identity` plus `display_matrix_unsupported`); A2 requires D4 to
    DEFER while also requiring frame-matrix refusal. No observed evidence was omitted to manufacture DEFER. Owner reconciliation is required.
  - The inspection function is implemented locally but is not wired into production ingest routing. The plan compiler, execution,
    v0.2 publication/cache and owner-media integration are not implemented. Accepted A1/profile/N1 contracts and protected files are unchanged.
  - Evidence: `.local-runs/phase5-gate7/batch3e-b2a2-20261007/` (ignored), generated synthetic media only; no owner footage, network or model.
    Details and the exact unresolved decision: [Batch-3E-B2-A2 record](phases/phase-5-gate-7-batch-3e-b2a2-executable-typed-remux.md).
  - B2-B, 3E-C and Phase 6: **NOT STARTED**. Gate 7 remains **NOT YET COMPLETE**. No later phase is authorized by this work.

- Phase 5 Gate 7 Batch 3E-B2-A1 owner acceptance (2026-10-06, owner ruling).
  - Batch 3E-B2-A1: **OWNER-ACCEPTED** after independent owner review. Accepted SHA:
    `68195af2777753e29b442d5b8ada26dddeb81e72`.
  - Accepted contract (bullet below and §17 of the
    [Batch-3E-B2-A1 record](phases/phase-5-gate-7-batch-3e-b2a1-canonical-profile-and-plan.md)): CanonicalMediaProfile v1,
    CanonicalMediaFacts 1.0.0, CanonicalizationPlan 1.0.0 and CanonicalMediaDerivation 0.2.0; `canonical_media_computation_v1` and
    `canonical_media_derivation_v1`; the five-operation exact-remux vocabulary in its one order; a plan identity without the source
    identity and a computation identity with it; `recipeId` = planId for 0.2.0 derivations; full display-matrix evidence; an explicit
    limited-range profile with the explicit BT.709 assumption only for unspecified primaries, transfer and matrix; refusal of an
    unspecified colour range and of a held first frame; true VFR, non-square SAR, D4 orientation and HEVC 8-bit SDR deferred. N1 stays
    frozen.
  - The acceptance changes none of the B2-A1 §13 limitations: a pure contract only, no facts derived from bytes, no plan compiled or
    executed, synthetic fixtures only, an unspecified colour range refused.
  - In the same ruling the owner authorized **3E-B2-A2** (executable typed exact-remux canonicalization; no pixel-changing or
    re-encoding canonicalization), **NOT STARTED** at this checkpoint. Roadmap ruling: non-square SAR resampling and true-VFR resampling
    are not required before Gate 7 closes and stay deferred; future B2-B is scoped only to D4 orientation and mirror baking and HEVC
    8-bit SDR → canonical H.264, subject to later owner approval. B2-B and 3E-C: **NOT STARTED**. Gate 7 overall: **NOT YET
    COMPLETE**. Phase 6: **NOT STARTED**.
  - This supersedes "3E-B2-A1: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**" and "B2-A2, B2-B and 3E-C: **NOT STARTED**" in the bullet
    below, which is kept as written.
- Phase 5 Gate 7 Batch 3E-B2-A1: CanonicalMediaProfile v1 and the typed CanonicalizationPlan v1, a pure contract (2026-10-05; owner-authorized,
  contract and planning only, after the owner resolved the B2R research as decisions D1-D15).
  - **Start.** B2-A1 started from the verified `01a58d8` (local equal to remote; `main` `4f85b55` unchanged). 3E-B2R, the read-only research,
    ran after `01a58d8` and changed no tracked file; its evidence is `.local-runs/phase5-gate7/3e-b2r-20261005T1353Z/` (ignored). Every B2R
    conclusion B2-A1 uses was re-verified from the underlying evidence; the exact snap rate set and the 9-sample audio bound were both
    recoverable, and B2R established no assumption for an unspecified colour range.
  - **New, beside the accepted B1 contract and wired to nothing** (`packages/media-ingest/profile.ts`, `plan.ts`; additive `index.ts`):
    - CanonicalMediaFacts 1.0.0: typed observations of exact bytes, with decoded presentation timestamps, the full nine-coefficient display
      matrix, both SAR declarations, declared and decoded geometry, a closed side-data vocabulary and decoded audio frames.
    - CanonicalMediaProfile v1 (`canonical_media_profile_v1_376754b9…`): H.264 8-bit 4:2:0 progressive, explicit agreeing 1:1, no matrix
      or the identity, no clean aperture, exact CFR from a common zero, BT.709 limited range (unspecified primaries, transfer and matrix as
      BT.709 under an explicit assumption; an unspecified range is refused), only the x264 encoder SEI, contiguous AAC LC or PCM audio.
    - The total evaluation: CONFORMS, CANONICALIZABLE_EXACT_REMUX, CANONICALIZABLE_REENCODE_DEFERRED (D4 orientation, HEVC 8-bit SDR,
      non-square SAR, true VFR) or REFUSE, with 56 findings each naming its dimension.
    - CanonicalizationPlan v1: the closed, ordered vocabulary SELECT_AV_STREAMS, REBASE_TIMELINE_ZERO, DECLARE_SQUARE_SAMPLE_ASPECT,
      SNAP_VIDEO_TIMESTAMPS (≤ P/4, the B2R rate set), RETIME_AUDIO_CONTIGUOUS (≤ 9 samples). The planId binds the profile, the plan semantics
      and every parameter, never the source bytes. The planner derives DIRECT, PLAN, DEFER or REFUSE from the facts alone.
    - CanonicalMediaDerivation 0.2.0, with `canonical_media_computation_v1` (source bytes + plan + pinned plan toolchain) and
      `canonical_media_derivation_v1`; its derived authorization names the planId as `recipeId`.
  - **Unchanged.** N1 (semantics, argv template, recipe, the v0 identities), CanonicalMediaDerivation 0.1.0, the B1 classifier (still the
    production path), `canonical.ts`, the renderer, probe, admission, permit and the 60 s policy, the owner-media pure contract and every
    adapter, the FootageAuthorization schemas, dependencies and lockfile: before/after fingerprints identical.
  - **Results.** B2-A1 88/88. Final RED on the final test bytes: 175 tests, 95 invariant passes and 80 absent-behaviour failures. Mutation
    check: 34 mutants, 33 killed, 1 equivalent. B1A 87/87, B1B pure 22/22, 3D 24/24, render pins 96/96. typecheck, build, schema check
    (33/33), workspace audit (132 files, 18 adapters) and `git diff --check`: PASS. Test pins: 153, none stale.
  - **Not done.** No facts were derived from bytes, no plan was compiled or executed, and no owner footage, media process, model or network
    was used. 0.2.0 derivations are not registrable in the owner-media registry yet. That is B2-A2.
  - 3E-B2-A1: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**. B2-A2, B2-B and 3E-C: **NOT STARTED**. Gate 7: **NOT YET COMPLETE**. Phase 6:
    **NOT STARTED**.
  - This supersedes "3E-B2R …: **AUTHORIZED by the owner, NOT STARTED**" and "B2 implementation and 3E-C: **NOT STARTED**" in the B1B
    acceptance bullet below, which is kept as written.
  - Details: the [Batch-3E-B2-A1 record](phases/phase-5-gate-7-batch-3e-b2a1-canonical-profile-and-plan.md).
- Phase 5 Gate 7 Batch 3E-B1B owner acceptance (2026-10-05, owner ruling).
  - Batch 3E-B1B: **OWNER-ACCEPTED** after independent owner review. Accepted SHA:
    `fc0e38a5c354a6dfc7aa7e4f60d64bb56083c4b3`.
  - Accepted facts (bullet below and §15 of the
    [Batch-3E-B1B record](phases/phase-5-gate-7-batch-3e-b1b-executable-canonicalization.md)): the exact accepted N1 recipe,
    empirically proven on the pinned FFmpeg and ffprobe; NORMALIZE_N1 → DIRECT with an explicit 1:1 output SAR; exact frame count,
    frame table and timing preservation; decoded-video equality; the accepted audio payload and timing preservation; deterministic
    output; probe-to-bytes binding; no-overwrite publication and concurrent publication protection; cache re-verification and tamper
    refusal; the derived-media lifecycle with root → derivative lifecycle inheritance; derived provenance at observation; permit
    provenance. The 60 s freshness policy, the claim and CAS order, dependencies and lockfile are unchanged.
  - The acceptance changes none of the B1B §11 limitations: no real derived source rendered end to end, no owner footage
    canonicalized, synthetic scope only, verification cost on large sources unmeasured, the computation record is local evidence and
    not an attestation, the 0° display-matrix limitation of the DIRECT rule, and N1's refusal of ordinary x264 encodes for their
    user-data SEI frame side data. Real-owner-footage revision 1 → 2 freshness, distinct physical multi-source execution, broad
    ingest, VFR, non-square SAR resampling, rotation, HDR, 10-bit, HEVC and audio resampling: **NOT VERIFIED / NOT IMPLEMENTED**.
  - 3E-B2R (read-only research into the real creator-media envelope and the canonicalization architecture): **AUTHORIZED by the
    owner, NOT STARTED** at this checkpoint. B2 implementation and 3E-C: **NOT STARTED**. Gate 7 overall: **NOT YET COMPLETE**.
    Phase 6: **NOT STARTED**.
  - This supersedes "3E-B1B: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**" in the bullet below, which is kept as written.
- Phase 5 Gate 7 Batch 3E-B1B: executable N1 canonicalization, trusted publication and the derived-media lifecycle (2026-10-05; an
  owner-authorized, bounded protected implementation).
  - **Start.** B1B started from the verified `2b2b49e` (local equal to remote). Before any B1B work, the owner's B1A acceptance was
    recorded by the documentation-only commit `afaa5d6`, which was pushed and verified. `main` (`4f85b55`) is unchanged.
  - **Stage 1.** The accepted `N1_ARGV_TEMPLATE` was executed exactly on the pinned FFmpeg and ffprobe, whose SHA-256, size and version
    were verified. The fixtures were generated: video only, PCM and AAC.
    - Each source classified NORMALIZE_N1 from its real probe, and each output classified DIRECT with an explicit 1:1 SAR.
    - Every invariant held: decoded frames, exact frame and audio timing, packets, samples and durations unchanged, and no side data.
    - Outputs were byte-identical across two runs and across processes.
    - The recipe is unchanged, and no contract expansion was needed.
  - **New `scripts/media-ingest-local.ts`** (strict_spawn, the 18th registered adapter):
    - every child gets its own fresh handle, verified before and after (probe-to-bytes binding);
    - the accepted classifier decides, and DIRECT and REFUSE create nothing;
    - for N1, the accepted recipe runs, every Stage-1C invariant is verified, and the output is published content-addressed without
      overwrite into the private `.local-media/canonical-v0/`;
    - the v0 decoded-frame and audio-packet methods bind exact timing;
    - a scope-free computation record supports the cache: a hit is fully re-verified, and cache identity is never authorization.
  - **Owner-media wiring.**
    - `OWNER_MEDIA_AUTHORITY` states its declared verified canonical derivatives and their lineage lifecycle. Its digest changed from
      `e154b615…` to `0cd89b68…`; its version and the binding literal are unchanged.
    - The observation's provenance gains the derived variant, additively, with no version change.
    - The registry reads 0.1.0 exactly as before. It registers 0.2.0 originals first and only then each derivative, from its content
      address, re-hashed and record-checked.
    - B's lifecycle is computed from A's at every query.
    - `authorize.ts` re-derives provenance by kind. Nothing else in the permit changed.
  - **Results.** B1B: media 27/27, pure 22/22. Final RED on the final test bytes: every new test fails on absent behaviour. Mutation check
    12/12 killed. B1A 87/87, 3D 24/24, render pins 96/96, 2A 339/339, 3E-A and 3C 54/54 (plus F2-F6 media 3/3), footage 240/240, 2B
    actual media 34/34. typecheck, build, schema check (33/33), workspace audit (130 files, 18 adapters) and `git diff --check`
    all PASS. Dependencies and lockfile unchanged.
  - **Not done.** No owner footage, model or network. No real derived source rendered end to end (3E-C). The 0° display-matrix
    limitation is recorded for B2.
  - 3E-B1B: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**. 3E-C: **NOT STARTED**. Gate 7: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
  - This supersedes "3E-B1B: **AUTHORIZED by the owner, NOT STARTED**" in the B1A acceptance bullet below, which is kept as written.
  - Details: the [Batch-3E-B1B record](phases/phase-5-gate-7-batch-3e-b1b-executable-canonicalization.md).
- Phase 5 Gate 7 Batch 3E-B1A owner acceptance (2026-10-05, owner ruling).
  - Batch 3E-B1A: **OWNER-ACCEPTED** after independent owner review. Accepted SHA:
    `2b2b49e058de40d2cd166a9d8764947eb5dde6b7`.
  - Accepted contract (bullet below and §15 of the
    [Batch-3E-B1A record](phases/phase-5-gate-7-batch-3e-b1a-canonical-media-provenance.md)): AuthorizedFootage 1.0.0 kept exactly;
    the 1.1.0 root and `system_canonicalized` derived forms with one-level lineage and the dedicated `canonicalizationConsent` root
    field; `CanonicalMediaDerivation` with exact source and output identity and separate computation and derivation identities; the
    pure N1 classifier and the one bounded N1 recipe; one owner-media authority with the original path unchanged; the effective derived
    lifecycle; the derived-capable owner render authorization.
  - The acceptance changes none of the B1A §12 limitations. Nothing is executed yet: the N1 argv template and the verification methods
    are declared and unexecuted, and probe-to-bytes binding is not implemented. Real-owner-footage revision 1 → 2 freshness, distinct
    physical multi-source execution, broad ingest, SAR normalization on media and VFR normalization: **NOT VERIFIED / NOT
    IMPLEMENTED**.
  - 3E-B1B: **AUTHORIZED by the owner, NOT STARTED** at this checkpoint. 3E-C: **NOT STARTED**. Gate 7 overall: **NOT YET COMPLETE**.
    Phase 6: **NOT STARTED**.
  - This supersedes "3E-B1A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**" and "3E-B1B and 3E-C: **NOT STARTED**" in the bullet below,
    which is kept as written.
- Phase 5 Gate 7 Batch 3E-B1A, the derived-media provenance and canonical-ingest contract foundation (2026-10-04 to 2026-10-05;
  owner-authorized bounded protected scope: contract and pure logic only).
  - Started from the verified `86d2a100289587ce55cdf521a10a92a9312ab44b` (3E-A accepted) on `phase/5-gate7-3e-production-hardening`.
    `main` (`4f85b55`) is unchanged.
  - Owner rulings made during B1A, each before the bytes it governs changed:
    - B96 may import `media-ingest`, and R01's pin of `tests/edit-render.test.ts` is updated last;
    - FootageAnalysis stays 1.0.0;
    - the canonicalization consent is a dedicated root field, never an allowed purpose. A self-found red showed that consent as a
      purpose authorized world-model scopes labelled with it.
  - **AuthorizedFootage.**
    - 1.0.0 is kept exactly.
    - New in 1.1.0: a root form (owner-supplied, with `canonicalizationConsent`) and a derived form (`system_canonicalized`, with the
      inherited basis and scope, a subset of the root's purposes, and one-level lineage to its root, derivation and recipe).
    - `AuthorizedReference` and `MediaAsset` are unchanged.
  - **`packages/media-ingest`** (new) contains:
    - a pure DIRECT / NORMALIZE_N1 / REFUSE classifier that reuses the unchanged renderer evaluator and proves that the SAR is the only
      blocker with a square-pixel counterfactual;
    - one bounded N1 recipe and the pinned toolchain;
    - `CanonicalMediaDerivation`, with a computation identity (source bytes, recipe and toolchain only) and a derivation identity.
  - **The owner-media pure contract** gains OwnerMediaRegistration 0.2.0 derived declarations with full lineage rules, a
    derived-capable render statement, two provenance kinds, and the derived lifecycle rule. The original path (0.1.0, the provenance
    check), the adapter, the permit and the authority descriptor are unchanged.
  - **Results.**
    - B1A pure: 87/87. Final RED on the baseline: 87 tests, 8 invariants pass, 79 fail on absent behaviour. Mutation check: 17/17 killed.
    - Legacy suites: footage and authorization 240/240, 3D owner-media 24/24, render pins (B96, R01) 96/96, 2A runtime 339/339, 3E-A
      and 3C editorial 54/54.
    - typecheck, build, schema check (2 files regenerated, 33/33 verified), workspace audit (130 files, 17 adapters) and
      `git diff --check`: all PASS.
    - The full safe suite and `npm run verify` were not run.
  - **Not done.** No FFmpeg or ffprobe process, no owner media, no canonical bytes and no adapter change. That is B1B.
  - 3E-B1A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**. 3E-B1B and 3E-C: **NOT STARTED**. Gate 7: **NOT YET COMPLETE**. Phase 6:
    **NOT STARTED**.
  - This supersedes "3E-B and 3E-C implementation: **NOT STARTED**" in the 3E-A acceptance bullet below, for 3E-B1A only. That bullet
    is kept as written.
  - Details: the [Batch-3E-B1A record](phases/phase-5-gate-7-batch-3e-b1a-canonical-media-provenance.md).

- Phase 5 Gate 7 Batch 3E-A owner acceptance (2026-10-04, owner ruling).
  - Batch 3E-A: **OWNER-ACCEPTED** after independent owner review. Accepted SHA:
    `820e218e8213c20f7bd48b338c9d4e1c8b1396b2`.
  - Accepted properties (bullet below and §14 of the
    [Batch-3E-A record](phases/phase-5-gate-7-batch-3e-a-multi-revision-freshness.md)): the exact-byte successful-validation memo;
    one graph replay per immutable graph per top-level cold validation; A01-A15 PASS; F1-F6 PASS (synthetic media, real clock);
    refusal parity PASS. The 60 s policy, evidence timestamp semantics, permit order, current-head semantics and CAS semantics are
    unchanged.
  - The acceptance changes none of these limitations. Real-owner-footage revision 1 → 2 freshness: **NOT VERIFIED** (awaits 3E-C).
    Broad media ingest: **NOT IMPLEMENTED**. Distinct physical multi-source execution: **NOT VERIFIED**. SAR normalization and VFR
    normalization: **NOT IMPLEMENTED**.
  - 3E-B and 3E-C implementation: **NOT STARTED**. Gate 7 overall: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
  - This supersedes "3E-A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**" in the bullet below, which is kept as written.
- Phase 5 Gate 7 Batch 3E-A, multi-revision freshness and validation performance (2026-10-04; owner-authorized protected changes A1
  and A2).
  - Started from the verified 3E start `4f85b559c7eff2c24e221011f3ee1dd1466a111d` on `phase/5-gate7-3e-production-hardening`.
  - Changed: `scripts/edit-editorial-local.ts` (A1) and `packages/edit-editorial/state.ts` (A2).
    `packages/edit-graph/revision.ts` was not required and is unchanged.
  - Reproduced on source-built bytes, on a synthetic history:
    - an unchanged head was replayed in full on every `current()` (5 to 44 Gate-6 constructions);
    - one cold validation made 44 constructions for 4 unique graphs at depth 6.
  - **A1.** One in-memory, per-instance record of the last successful `current()` replay. It is reused only when the digest of every
    head-slot and artifact byte read by that call is identical. Every read, hash and head check still runs, and a failure is never
    stored.
  - **A2.** A call-scoped memo of successful graph validations inside one top-level validation. It is bound to the exact artifact list
    and records only the ancestors that validation replayed. No refusal and no refusal order changed.
  - Results:
    - 3E-A pure tests 16/16 (A01-A15 and the parity corpus P00-P17, with identical outcomes on the old and new bytes);
    - mutation reds: 11/11 expectations met;
    - F1-F6 PASS on synthetic media with the real clock;
    - synthetic depth 6: cold 44 → 4 constructions (25.1 s → 1.39 s), warm 44 → 0 (25.4 s → 94 ms);
    - revision 1 → 2 evidence age at the permit: 17,576 ms → 1,548 ms.
  - Gates:
    - typecheck and build;
    - legacy 3C and 3D 62/62;
    - legacy 2A/2B, graph, repair and review 435/435;
    - 3C media 4/4 and 2B media 34/34;
    - workspace audit and `git diff --check`.
    - The full safe suite and `npm run verify` were not run.
  - Unchanged: the 60 s ceiling, evidence timestamps and permit order; the capability, media-grant, claim, current-head and CAS checks;
    renderer admission, owner-media authority, MediaTruth, the FFmpeg adapters, schemas, dependencies and lockfile.
  - Multi-revision real-footage freshness: **NOT VERIFIED** (3E-C). Real-store latency after the repair: not measured.
  - 3E-A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**. 3E-B and 3E-C: **NOT STARTED**. Gate 7: **NOT YET COMPLETE**. Phase 6:
    **NOT STARTED**.
  - Details: the [Batch-3E-A record](phases/phase-5-gate-7-batch-3e-a-multi-revision-freshness.md).
- Phase 5 Gate 7 Batch 3D owner acceptance (2026-10-04, owner ruling).
  - Batch 3D: **OWNER-ACCEPTED** after independent owner review. Accepted implementation/closure SHA:
    `40591f6a77108b1d5d9b70789c17a09bbbb3c2bd`.
  - Evidence established before acceptance (closure bullet below and §36-§38 of the
    [Batch-3D record](phases/phase-5-gate-7-batch-3d-real-footage-e2e.md)): owner real-footage run 16/16 PASS, receipt SHA-256
    `b646ea76d559622fb0a366a740ec491ab30c805d8ead3b14e19755f14bf8e65c`; corrected full safe suite 1078/1078 PASS; `npm run verify`
    PASS. The run covers an actual real render, Technical QC, rendered-output observation, critic execution, an exact GraphDiff
    revision, localized reuse and recomputation, render-failure and QC-failure atomicity, CAS-loser protection, and current-head, lock
    and stale-request protections.
  - The acceptance changes none of these limitations. Multi-revision real execution freshness: **LIMITATION OBSERVED / NOT FULLY
    VERIFIED**. Distinct physical multi-source execution, broad creator-media ingest, non-square-pixel / SAR normalization,
    professional editing quality and the autonomous Director: **NOT VERIFIED**. VFR normalization: **NOT IMPLEMENTED**.
  - Gate 7 overall: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
  - This supersedes "Real footage verification: **PASS — CANDIDATE FOR OWNER ACCEPTANCE**" and "Batch 3D owner acceptance: **PENDING
    INDEPENDENT OWNER REVIEW**" in the closure bullet below, which is kept as written.
- Phase 5 Gate 7 Batch 3D closure (2026-10-03).
  - **R02-E** (owner-authorized, harness only): QC-failure atomicity runs as its own revision 0 → 1 attempt from the locked revision-0
    head, with an exact 14-frame trim distinct from the published 15-frame trim. RED first; regression 3D-R02E.
  - The third real-footage run (`b3d-20261003T092935Z-bec5`) was stopped by the Claude Code memory-pressure reaper: no receipt, not a
    result.
  - The fourth run, in the owner's terminal (`b3d-20261003T101716Z-bcfa`): **16/16 PASS**, receipt SHA-256
    `b646ea76d559622fb0a366a740ec491ab30c805d8ead3b14e19755f14bf8e65c`, independently verified, QC-failure atomicity included.
  - Final gates. The first full safe suite was 1077/1078; its one failure was environmental (`TEMP` inside the repository). With the
    owner-ruled `C:\Users\KOUSHIK VARDHON\AppData\Local\Temp`, the corrected suite's first attempt was interrupted without a result and
    its second passed **1078/1078**. `npm run verify`: **PASS** (exit 0): typecheck, build, 1078/1078 tests, audit, schema check, demo,
    media 57/57 and Python 23/23.
  - Footage 9/9 and changed code 9/9 unchanged; renderer, `probe.ts`, both 60 s ceilings, permit and runtime boundary byte-identical to
    `d579a0e`; no dependency or lockfile change.
  - Multi-revision real execution freshness: **LIMITATION OBSERVED / NOT FULLY VERIFIED**.
  - Distinct physical multi-source execution, broad media ingest, non-square-pixel / SAR normalization, professional editing quality
    and the autonomous Director: **NOT VERIFIED**. VFR normalization: **NOT IMPLEMENTED**.
  - Real footage verification: **PASS — CANDIDATE FOR OWNER ACCEPTANCE**.
  - Batch 3D owner acceptance: **PENDING INDEPENDENT OWNER REVIEW**. Gate 7: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
  - Details: §33-§38 of the [Batch-3D record](phases/phase-5-gate-7-batch-3d-real-footage-e2e.md). This supersedes the two "Real
    footage verified: **FAIL — NOT A PASS CANDIDATE**" bullets below and the earlier "Real-footage Gate 7 closure: **NOT YET RUN**".
- Phase 5 Gate 7 Batch 3D final-closure attempt (2026-10-03, owner ruling: Decisions 1-3).
  - **R02-D**, the scenario-14 harness parent-DAG repair, is implemented, with a RED from the first run and regression 3D-R02D.
  - 3D-L01 **PASS**, test bytes unchanged, under a controlled long-form `TEMP`/`TMP`/`TMPDIR` (`.local-runs\test-temp`).
  - Focused tests: 23/23 3D, 1/1 R02-A media, 23/23 Python, 28/28 footage and audit.
  - The second full real-footage run (`b3d-20261003T062658Z-361b`, valid receipt) ended **15/16**. Its outputs are byte-identical to the
    first run.
  - `qc_failure_atomicity` **FAIL** (`runtime_probe_stale`). The repaired parent authorization was accepted; then the accepted
    pre-permit validation of a revision-2 child (about 114 s) exceeded the accepted 60 s evidence window (EVIDENCE_FRESHNESS). No render
    started and the head did not move.
  - The full suite and `npm run verify`: **NOT RUN**. Nothing is committed. Real footage verified: **FAIL — NOT A PASS CANDIDATE**.
  - Batch 3D owner acceptance: **PENDING**. Phase 6: **NOT AUTHORIZED**.
  - Details: §28-§32 of the [Batch-3D record](phases/phase-5-gate-7-batch-3d-real-footage-e2e.md).
- Phase 5 Gate 7 Batch 3D owner-local run and R02 repair (2026-10-03).
  - Preflight on the exact SHA `d579a0e`: **NO_ADMISSIBLE_REAL_FOOTAGE_PAIR**, from three blockers. The owner ruling R02 authorized
    their smallest repair.
  - **R02-A:** exact frame times at the analyzer seam, including the metadata memo key. **R02-B:** `local-media/` accepted as a private
    location. **R02-C:** a bounded LukeRaw analysis with no SigLIP inference. All implemented RED-first and uncommitted.
  - A fourth blocker, an unspecified SAR against the accepted conformance rule, led to the owner decision "LukeRaw, two clips".
  - Real-footage run: **15/16 PASS**: baseline render, QC, critic, lock, failure atomicity, CAS loser, published trim, localized
    reuse and refusals.
  - `qc_failure_atomicity`: **FAIL**, from a harness defect (`tests/edit-real-footage.local.ts:445` passes the revision-0 DAG). Not
    repaired.
  - Real footage verified: **FAIL — NOT A PASS CANDIDATE**. Batch 3D owner acceptance: **PENDING**. Phase 6: **NOT AUTHORIZED**.
  - Details: §19-§27 of the [Batch-3D record](phases/phase-5-gate-7-batch-3d-real-footage-e2e.md). This supersedes "Real footage
    verified: NO — PENDING OWNER LOCAL RUN" below.
- Phase 5 Gate 7 Batch 3D (real-footage end-to-end acceptance): started from the verified `main`
  `da9a73da5d349a6bd71678e65d4e079415043754` on `phase/5-gate7-3d-real-footage`.
  - History: **STOPPED before implementation: PROTECTED_CHANGE_OUTSIDE_3D_AUTHORIZATION** (2026-09-29). The accepted trusted execution
    boundary admitted only the synthetic-fixture lifecycle authority (`synthetic_fixture_registry_only_not_production_v0`).
  - Owner ruling (2026-09-30): the smallest bounded protected change for that gap (3D-R01) is authorized.
  - Status: **CODE COMPLETE / HARNESS READY**. An owner-local real-media lifecycle authority now sits beside the unchanged synthetic
    one inside the existing Batch-2B boundary. 3D-R01 is RED on the pre-3D bytes and GREEN now. The owner-run harness, manifest and
    receipt are implemented.
  - Real footage verified: **NO — PENDING OWNER LOCAL RUN**. Batch 3D owner acceptance: **PENDING**.
  - Details: the [Batch-3D record](phases/phase-5-gate-7-batch-3d-real-footage-e2e.md).
  - This supersedes the "Batch 3D: NOT STARTED" statements below.
- Architecture V2: **FROZEN**. Gate 7 Batch 3A, Batch 3A-F and Batch 3B: **OWNER-ACCEPTED**.
- Phase 5 Gate 7 Batch 3C implementation verification: **PASS** (2026-09-29), from exact local and independently verified origin baseline
  `2686367e5566fea6accb965686c81e975e825eec`. Owner acceptance: **OWNER-ACCEPTED** (2026-09-29). Full safe suite: **1054/1054 PASS**; 3C pure: **38/38 PASS**;
  actual synthetic-media: **4/4 PASS**. Required regressions, workspace audit and protected-byte audit pass. Changes were unstaged and uncommitted at the implementation-verification checkpoint.
- Gate 7 overall: **NOT YET COMPLETE**. Batch 3D: **NOT STARTED**. Real-footage Gate 7 closure: **NOT YET RUN**. Vibe Editing: **NOT YET COMPLETE**.
- Earlier closure checkpoints below retain their historical authorization/status statements; the current Batch-3C ruling above supersedes their
  earlier "Batch 3C not started" statements.

- Phase 2: CLOSED (historical real-model and real-footage closure, 2026-09-15).
- Phase 2.6A Session 1 architecture: COMPLETE; frozen revision `editorial-architecture-0.1.0`.
- Phase 2.6A guarded TransNetV2 integration: COMPLETE.
- Phase 2.6A acceptance: PASS.
- Phase 2.6A overall: COMPLETE for the owner-authorized architecture-freeze and guarded detector-integration acceptance scope.
- Frozen editorial runtime subset: implemented under owner-authorized Phase 4 Gate 0. The broader historical Session 2 benchmark/metric/experiment backlog remains outside this gate.
- Phase 2.6B: COMPLETE. TransNetV2 verified on real authorized footage through the current application path.
- Phase 3 Audio Analyzer V0: COMPLETE within the implemented/verified V0 scope at `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, per explicit owner closure authorization. This supersedes the earlier component-only status below.
- Phase 4 Matcher V0: COMPLETE within its implemented and verified V0 scope. Gates 0–4 are accepted. Gate 4 adds the internal explicit-policy Matcher V0 dispatcher over the accepted technical baseline and evaluation-authorized reference-semantic ranking paths without score fusion, fallback, automatic mode selection, audio consumption or plan-bound `DecisionEvent` output.
- Phase 5 Edit Planner V0: Gates 0–4 are owner-accepted within their recorded bounded scopes. Gate 3 Budgeted Perception / Model Routing is accepted at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`. Gate 4 Canon v0 / Director Boundary is **OWNER-ACCEPTED** at `e99e98748ddc84d5932adb1c5ee1b22729d35a2f` after test-first implementation, adversarial self-review, independent owner review, two reproduced authority defects, bounded repairs, and final post-repair source inspection. No Director model execution or editing-quality verification has occurred. Gate 5 is **OWNER-ACCEPTED** at `d2ffc51` after implementation verification, independent source review, test-first owner repairs, final source-authority review, 97/97 focused Gate-5 tests, 377/377 compatibility tests, 546/546 full safe tests, workspace audit PASS, and 24/24 protected paths unchanged. Verification remains synthetic/offline and establishes no professional-editing-quality, real-footage-generalization, rendering, capability-execution, EditGraph, UEP, or public DecisionEvent claim. Gate 6 is not authorized or started at this closure checkpoint.
- Phase 5 Gate 6 EditGraph / capability / compatibility projection: owner-authorized from HEAD `49f93e28831965a010459df05f5abf4f393f68e6`. Gate 6 implementation verification: **PASS**. The independent owner review found three defects: capability availability was not semantically attested, execution readiness ignored budget feasibility, and UEP reference joins were overstated. They were repaired test-first. Post-owner-review verification: **PASS**. Gate 6 is **OWNER-ACCEPTED** at `0cb99b6` after final independent source review. Gate 7: **NOT AUTHORIZED at this closure checkpoint**.
- Phase 5 Gate 7 execution runtime: owner-authorized from HEAD `5ff5750af00e91bd6a226daf5841ec4dc3873819`. Batch 1 implementation verification, independent owner-review repair, and final hardening verification are **PASS**. Gate 7 Batch 1 is **OWNER-ACCEPTED** at `d55f0e1` after final independent source review. Gate 7 overall remains **NOT YET COMPLETE**. Batch 2 actual media rendering is **NOT AUTHORIZED at this closure checkpoint**. All Batch-1 evidence is synthetic/offline; no actual media rendering, FFmpeg execution, media QC, critic or repair execution has occurred.
- Phase 5 Gate 7 Batch 2A (runtime-safety foundation only): owner-authorized from HEAD `ae432248cd30e8465cd652f49b1e35f441af2e58`. Batch 2A implementation verification: **PASS**. Owner-review repair verification: **PASS**. Batch 2A owner acceptance: **OWNER-ACCEPTED** at `291a04e`. Actual FFmpeg execution: **NOT AUTHORIZED**. Gate 7 overall: **NOT YET COMPLETE**. Batch 2B is not authorized or started. All Batch-2A evidence is synthetic providers over opaque test bytes; no media, FFmpeg, Python, model or real-footage operation ran. One pre-work `git fetch` contacted the Git remote solely to verify the frozen baseline; Batch-2A runtime code and tests performed no network I/O and ran under `scripts/no-network.mjs`.
- Phase 5 Gate 7 Batch 2B (first truthful actual media execution through the EditGraph execution architecture; synthetic media only): owner-authorized from HEAD `d3c8302b40a5064ae0eb4408195dc35346ecc648`. Batch 2B implementation verification: **PASS** after the owner's accounting ruling (historically **FAIL**, deliberately fail-closed on one unmet frozen closure contract, Batch-2B requirement 10, measured runtime resource, cost and time accounting, while accounting was **PARTIAL**). Actual pinned-FFmpeg synthetic media execution: **PASS**. Independent technical media QC: **PASS**. Reservation-consumption accounting: **PASS** under the owner's local-execution ruling, scoped to the one pinned local executor: FFmpeg-reported CPU time and peak commit are accepted as attributed evidence, and total monetary cost is not applicable to local non-metered execution, which is not a zero cost (historically **PARTIAL**). Production user-media lifecycle authority: **NOT VERIFIED**. Real user footage: **NOT RUN**. Semantic editing quality: **NOT VERIFIED**. OWNER ACCEPTANCE: **OWNER-ACCEPTED**. Gate 7 overall: **NOT YET COMPLETE**. Batch 2B closure is committed at `74bbe1e7c05a59ac24c4d9113287ce3a32b61a6c`. Independent owner-review repair (three findings, test-first): trust-handle repair **PASS**, QC-liveness repair **PASS**, terminal-evidence repair **PASS**; implementation verification then remained **FAIL** while accounting was **PARTIAL**. Owner-review repair #2 (three further findings, test-first): policy-snapshot repair **PASS**, probe-completion repair **PASS**, exact-artifact-QC repair **PASS**; implementation verification then remained **FAIL** while accounting was **PARTIAL**. Owner-review repair #3 (three code findings, test-first, and one documentation finding): private-runtime-context repair **PASS**, QC-clock-binding repair **PASS**, process-termination-truth repair **PASS**, final-evidence-doc repair **PASS**; implementation verification then remained **FAIL** while accounting was **PARTIAL**. Owner accounting closure (2026-09-27, test-first, under the owner's ruling): accounting **PASS**, implementation verification **PASS**.
- Phase 5 Gate 7 Batch 3A (editorial evidence surfaces and semantic-critic foundation; synthetic media only): owner-authorized from HEAD `c74d5fe649ebe470ee0ea9bcb21cdfc4969641cb`, including two owner-authorized protected changes raised before modification (one workspace-audit adapter registration and the pinned Batch-2B audit count). Batch 3A implementation verification: **PASS**. Actual synthetic rendered-media verification: **PASS**. Semantic critic: port plus synthetic fixture critic only (no model). Real user footage: **NOT RUN**. Professional editing quality: **NOT VERIFIED**. ARCHITECTURE_V2_TIMEBASE_GAP: **YES** (recorded, not modified). Gate 7 Batch 3A owner acceptance: **OWNER-ACCEPTED**. Gate 7 overall: **NOT YET COMPLETE**.
- Phase 5 Gate 7 Batch 3A-F (exact timebase foundation; synthetic media only): owner-authorized from HEAD `f0edbb3b05724ad41c062a82585846eba9e0a4d6` to close ARCHITECTURE_V2_TIMEBASE_GAP only, with two owner decisions raised before any protected byte changed (approve hash-pin updates for changed files and float-literal translations in accepted tests; defer Gate-5 planning floats, decoded exactly at the EditGraph seam). Batch 3A-F implementation verification: **PASS**. ARCHITECTURE_V2_TIMEBASE_GAP: **RESOLVED** (the Batch-3A **YES** above was true when recorded). Real user footage: **NOT RUN**. Gate 7 Batch 3A-F owner acceptance: **OWNER-ACCEPTED**. Gate 7 overall: **NOT YET COMPLETE**. Batch 3B: **NOT STARTED**.
- Phase 5 Gate 7 Batch 3B (RepairPlan, typed GraphDiff, immutable EditGraph revisions, dependency-aware localized recomputation and truthful localized rerender/reuse; synthetic media only): owner-authorized from HEAD `db04f2ed97844bb149fc8f642b423c3adf56776e`; Architecture V2 **FROZEN**; no protected change outside the 3B authorization was needed. Independent owner source review (2026-09-29): one real blocker, OR1, was reproduced test-first and repaired at the execution boundary with `validateRepairLineage`. Before the repair, a revision whose GraphDiff was not backed by a validated RepairPlan lineage reached executable rendering. The owner accepted the repair. On the final repaired bytes: full safe suite **PASS** 1016/1016 (owner-run), workspace audit **PASS**, `git diff --check` **PASS**. The owner accepted the bounded revision-field widening of the internal pre-stable records, with no version-bump cascade; the known NB1-NB4 limitations remain documented. Batch 3B implementation verification: **PASS**. History: **PASS** on the implementation's bytes, then **INCOMPLETE** at the owner-review checkpoint while the full safe suite lacked a valid run. Real user footage: **NOT RUN**. Professional editing quality: **NOT VERIFIED**. Gate 7 Batch 3B owner acceptance: **OWNER-ACCEPTED** (2026-09-29; **PENDING** at the earlier checkpoints). Gate 7 overall: **NOT YET COMPLETE**. Batch 3C: **NOT STARTED**.

## Phase 5 Gate 7 Batch 3D - Real-footage end-to-end acceptance (code complete; owner-local run pending)

Authority: [Batch-3D record](phases/phase-5-gate-7-batch-3d-real-footage-e2e.md), the owner's bounded Batch-3D authorization, and the
owner ruling of 2026-09-30.

**History (2026-09-29).** Batch 3D stopped before implementation. Every real render passes `issueExecutablePermit`, which accepted
post-stage lifecycle evidence only from `SyntheticFixtureLifecycleAuthority`, and the frozen permit binding could name only
`synthetic_fixture_registry_only_not_production_v0`. The first meaningful RED, 3D-R01 (pure, on unmodified accepted bytes), failed on
exactly that missing contract. The stop record is preserved as §1-§8 of the Batch-3D record.

**Protected change (2026-09-30 ruling).**

- A new pure `packages/edit-render/owner-media.ts` and a filesystem-only adapter `scripts/edit-render-owner-media-authority-local.ts`.
- The owner registration reuses the accepted `AuthorizedFootageSet`: exact relative path, SHA-256 and size, `owner_supplied`
  provenance, and an explicit owner render authorization.
- The authority re-verifies the full bytes at every query and answers only for `creator_upload` / `owner_supplied` sources. Its live
  handle is re-queried at permit issuance and at execution start.
- `authorize.ts`, `index.ts` and `edit-render-local.ts` accept it beside the unchanged synthetic authority. The binding literal is a
  two-member enum, and one authority governs each execution.
- The audit registers the new adapter: 17 adapters.

**Evidence.**

- 3D-R01: RED on the pre-3D bytes, GREEN now.
- Twelve hostile lifecycle tests (3D-L01..L12) and four mutation checks.
- The mismatched-DAG note is **deferred**: QC against the authorized DAG blocks publication, so only non-authoritative computation
  results.

**Harness.**

- A strict run manifest with no media identity of its own.
- Admissibility inspected and refused with exact reasons, never repaired.
- An exact output clock, and an owner-scoped chain with derived provenance labels.
- Deterministic verification input only; no Director model.
- An owner-run runner covering the baseline render, QC, observation, critic, lock, failure atomicity, CAS loser, published exact trim,
  localized reuse, lock refusal, historical preference and stale refusal.
- One bounded receipt with fixed claims.

The harness refuses more than 32 retained candidates: the accepted per-boundary re-validation must fit the 60-second evidence window.

**Cloud.** No footage, pinned Windows FFmpeg or model cache is available. The actual-media, Python and `verify` gates are
ENVIRONMENT_UNAVAILABLE_FOR_THIS_CHECK; the other gates are in §15 of the record.

Batch 3D code: **COMPLETE**; harness **READY FOR THE OWNER-LOCAL RUN**

Real footage verified: **NO — PENDING OWNER LOCAL RUN**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

### Owner-local run and R02 repair (2026-10-03)

**Preflight.** On the exact SHA `d579a0e`, the committed `planOutput` refused all 81 timelines over the accepted Phase-2 corpus:

- every source retains more than 32 candidates;
- every frame table is microsecond-rounded and off the exact grid;
- `local-media/` was refused as a location.

**R02, authorized by the owner and implemented RED-first, uncommitted.**

- **R02-A.** `media.py` emits the correctly rounded double of each frame's exact integer timestamp in the stream time base, and
  `footage-local.ts` keys metadata memos `footage-metadata-v2`, so stale microsecond memos are never read.
  - 30, 60 and 30000/1001 fps CFR are now exact.
  - The 25 and 50 fps controls still pass.
  - Perturbed and variable timelines still fail.
  - The renderer is unchanged.
  - Python and JavaScript agree on all 576,000 instants checked.
- **R02-B.** `local-media/` is an accepted private location.
- **R02-C.** A bounded LukeRaw analysis (`maximumPerAsset` 16, `maximumPerProject` 32): job `footage_85d87e22-…`, 16 candidates, 4/4
  SigLIP cache hits, no model inference. `planOutput`: PASS.

**Blocker 4.** Akshat and Deepinder leave the SAR unspecified, which the accepted conformance rule refuses. The owner chose "LukeRaw,
two clips".

**Run** (`b3d-20261003T051625Z-0388`, valid receipt): **15/16 PASS**.

- Baseline `9c1c2ade…` and child `461dab97…` both pass QC.
- The locked segment was reused and the changed segment recomputed.
- Failure atomicity, the CAS loser and every refusal behaved as required.
- `qc_failure_atomicity` **FAIL**: the harness passes the revision-0 DAG when authorizing a revision of revision 1. The accepted code
  refused fail-closed, before any render. Not repaired; it needs an owner ruling.
- Environment: 3D-L01 fails on this machine's 8.3 `TEMP`, which a pristine `d579a0e` checkout also shows.
- The full safe suite and `npm run verify`: **NOT RUN** (gated on a stable real-footage path). Nothing is committed or pushed.

R02 repairs: **IMPLEMENTED** (uncommitted)

Real footage verified: **FAIL — NOT A PASS CANDIDATE**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

### Final-closure attempt (2026-10-03)

**Owner ruling.**

- Decision 1: repair only the scenario-14 harness defect.
- Decision 2: defer the SAR rule; a same-source LukeRaw proof is allowed, with explicit limitations.
- Decision 3: run 3D-L01 unchanged under a controlled long-form temporary directory.

**R02-D.** The harness now authorizes and executes scenario 14 against the published revision-1 DAG, receipt and QC, checked by
`revisionParent`. 3D-R02D is the regression.

**3D-L01.** PASS with unchanged bytes.

**Second full run** (`b3d-20261003T062658Z-361b`): **15/16**.

- Every one of the 15 is independently verified, and the outputs are byte-identical to the first run.
- Scenario 14's authorization succeeded, but `execute` refused at the permit with `runtime_probe_stale`. The revision-2 pre-permit
  validation (about 114 s) exceeds the accepted 60 s window.
- No render started and the head did not move.
- Category: EVIDENCE_FRESHNESS. Not repaired.

**Smallest option for the owner:** a harness-only redesign that exercises QC failure on a revision 0 → 1 attempt with a distinct trim.

**Gates and limitations.**

- The full suite and `npm run verify`: **NOT RUN**. Nothing is committed or pushed.
- Not verified: distinct physical multi-source execution, SAR and non-square normalization, broad ingest, professional editing quality and
  the autonomous Director. VFR normalization is not implemented here.

R02 and R02-D repairs: **IMPLEMENTED** (uncommitted)

Real footage verified: **FAIL — NOT A PASS CANDIDATE**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

### Closure: R02-E, the owner-terminal run and the final gates (2026-10-03)

**R02-E** (owner-authorized; harness only; no production file changed).

- QC-failure atomicity is its own revision 0 → 1 attempt from the locked revision-0 head, run right after render-failure atomicity.
- Its exact trim removes 14 frames, strictly fewer than the published 15, so its replacement, changed segment and output frame count
  differ from the published edit (`distinctRevisionRefusal`). `revisionParent` checks its parent.
- The former revision 1 → 2 QC-failure scenario is removed.
- 3D-R02E was RED on the R02-D harness bytes and is GREEN now. The test file changed between RED and GREEN, and the RED bytes were not
  preserved (§34 of the record). Focused: 3D 24/24, R02-A media 1/1, Python 23/23, footage and audit 28/28.

**Third run** (`b3d-20261003T092935Z-bec5`): stopped by the Claude Code memory-pressure reaper after the CAS-loser render. No receipt;
not a command failure; not a result.

**Fourth run, owner terminal** (`b3d-20261003T101716Z-bcfa`): **16/16 PASS**.

- Receipt valid, SHA-256 `b646ea76d559622fb0a366a740ec491ab30c805d8ead3b14e19755f14bf8e65c`; runner exit 0.
- Same inputs (manifest `ca44f382…`, analysis from job `footage_85d87e22-…`): no new analysis, no model inference.
- Baseline `9c1c2ade…` and child `461dab97…` pass QC. The locked segment is reused and the changed one recomputed. The critic ran with
  0 findings, and every refusal held.
- QC failure: the render started, and 4 bytes were appended after QC fixed the output identity. QC failed on `output_identity`, the
  outcome was `qc_failed`, the head did not move and the corrupt output never became authoritative.

**Final gates.**

- First full safe suite: 1077/1078. The one failure, the Batch-2A temp-isolation test, came from `TEMP` inside the repository
  (`.local-runs\test-temp`). Owner ruling: environmental; one corrected rerun with `C:\Users\KOUSHIK VARDHON\AppData\Local\Temp`.
- Corrected suite, owner terminal: attempt 1 interrupted after about 2.5 min (no summary, no failure recorded, cause not recorded);
  attempt 2 **1078/1078 PASS**, exit 0.
- `npm run verify`, owner terminal, same `TEMP`: **PASS**, exit 0. Typecheck, build, 1078/1078 tests, audit, 33 schema artifacts,
  demo, media 57/57, Python 23/23.
- Closure checks: footage 9/9 and code 9/9 unchanged. The renderer, `probe.ts`, both 60 s ceilings, the permit and the runtime boundary
  are byte-identical to `d579a0e`. No dependency or lockfile change.

**Not verified.**

- Multi-revision real execution freshness: **LIMITATION OBSERVED / NOT FULLY VERIFIED** (the 16/16 run executes no revision 1 → 2
  child).
- Distinct physical multi-source execution, broad media ingest, non-square-pixel / SAR normalization, professional editing quality and
  the autonomous Director: **NOT VERIFIED**.
- VFR normalization: **NOT IMPLEMENTED**.

R02, R02-D and R02-E repairs: **IMPLEMENTED** (committed with this update)

Real footage verification: **PASS — CANDIDATE FOR OWNER ACCEPTANCE**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING INDEPENDENT OWNER REVIEW**

Gate 7 overall: **NOT YET COMPLETE**

Phase 6: **NOT STARTED**

## Phase 5 Gate 7 Batch 3C - EditorialState and conversational revision (synthetic media only)

Authority: [Batch-3C implementation and verification record](phases/phase-5-gate-7-batch-3c-editorial-state-conversational-revision.md) and the owner's
explicit bounded Batch-3C authorization. Architecture V2 remains frozen. EditGraph is the sole composition authority; EditorialState stores durable
intent and constraints, with no duplicate timeline or render program.

The batch adds strict immutable EditorialState and typed state diffs; HARD_EXACT locks; soft liked/rejected preferences including exact ancestor
targets; one authoritative local EditingHead per configured scope; version-bound requests; a provider-neutral interpreter port with deterministic
fixtures; and a separate EditorialRevisionPlan origin. GraphDiff 0.2.0 and EditGraph revision 0.4.0 are explicit additions. Historical 3B readers and
the accepted OR1 repair lineage remain valid. The only physical edit primitive is the accepted exact source-range trim.

State-only actions advance state/head with the same graph and no rendering. Graph changes validate both revision origins against current state,
locks and dependency-derived scope, render and pass independent QC, then publish graph plus rebased state in one exclusive CAS. Alternate unlocked
states/heads, stale graph/state/head requests, scope spill, lock conflicts and a second concurrent CAS refuse. Failed render/QC never advances the head.

The five-turn no-speech synthetic scenario locks A, trims final clip B by exact 1/2 second, refuses a trim of A, records a grounded preference for G0,
then refuses a stale request. A's actual segment bytes are reused; B is actually recomputed; parent and child QC pass. No frontier language model,
real footage, taste learning or professional editing-quality claim is involved.

Verification: 38/38 pure 3C, 4/4 actual 3C media, full safe suite 1054/1054; all required 3B (including OR1), 3A-F, 3A, 2B, 2A, Batch 1, Gate 6, Gate 5,
routing, compatibility and legacy suites pass with zero failures, cancellations, skips or TODOs. Three real hostile-review defects have retained RED
and GREEN evidence. The linked record contains the C1-C40 attack matrix, exact artifact identities, four-slot current-head evidence, work accounting,
full gate receipts and owner-review manifest. No dependencies or lockfiles changed, no owner file was read/hashed/touched. At the implementation-verification
checkpoint, nothing was staged, committed or pushed.

Architecture V2: **FROZEN**

Gate 7 Batch 3A: **OWNER-ACCEPTED**

Gate 7 Batch 3A-F: **OWNER-ACCEPTED**

Gate 7 Batch 3B: **OWNER-ACCEPTED**

Gate 7 Batch 3C implementation verification: **PASS**

Gate 7 Batch 3C owner acceptance: **OWNER-ACCEPTED**

Full safe suite: **1054/1054 PASS**

Gate 7 overall: **NOT YET COMPLETE**

Batch 3D: **NOT STARTED**

Real-footage Gate 7 closure: **NOT YET RUN**

Independent owner source review: **PASS**. Owner acceptance: **OWNER-ACCEPTED** (2026-09-29). No later batch is started.

## Phase 5 Gate 7 Batch 3B - RepairPlan, typed GraphDiff, immutable EditGraph revisions and localized rerender (synthetic media only)

Authority: [Gate-7 Batch-3B implementation and verification record](phases/phase-5-gate-7-batch-3b-repair-graphdiff-localized-render.md). It is
governed by the accepted Batch-1, Batch-2A, Batch-2B, Batch-3A and Batch-3A-F records and by the owner's explicit Batch-3B-only authorization.
That authorization permits the smallest 3B-required changes to EditGraph, ExecutionDag, RenderProgram, runtime, review, tests and pin tables;
no protected change outside it was needed.

Current status (2026-09-29): Batch 3B implementation verification is **PASS**; owner acceptance is **OWNER-ACCEPTED**. See the owner acceptance
closure at the end of this section. Historical: at the 2026-09-28 checkpoint verification was **PASS**, acceptance was **PENDING**, and the work
was uncommitted and unstaged for independent owner review.

The batch establishes, on synthetic media only, one bounded repair cycle:

- **RepairPlan** (new pure package `packages/edit-repair/`): editorial intent bound to the exact parent graph and revision, the rendered output and
  receipt, passing Technical QC, the CriticReport and one exact finding with its evidence, the owner's RepairPolicy, the planner and a derived
  attempt. It holds typed trims only and never mutates. Proposals come through a model-neutral RepairPlannerPort whose output is untrusted data;
  the acceptance planner is a deterministic synthetic fixture rule, not a model.
- **Typed GraphDiff 0.1.0 and EditGraph revision 0.3.0** (`packages/edit-graph/revision.ts`): one registered operation (exact trim of a video
  clip use; linked audio follows), bound to one exact parent with compare-and-swap. Unregistered operations are refused. Application is pure,
  and every dependent field is re-derived by the accepted construction. EditGraph 0.2.0 keeps its exact root meaning, and a revision validates
  only by replaying its exact parent and GraphDiff.
- **Derived dependency impact**: the exact changed region, the DAG nodes preserved or invalidated, and the segments reusable or to recompute.
- **Localized execution with trusted reuse**: the SAME RenderProgram and executor semantics run as per-segment stage processes into lossless raw
  intermediates plus one assembly and encode, byte-identical to one-pass execution. A segment is reused only when a prior segmented receipt
  (RenderExecutionReceipt 0.2.0; 0.1.0 unchanged) with passing, exactly linked QC certifies it, its durable record agrees and its bytes re-verify.
  Absent means recompute; corrupt, substituted, forged or redirected state is refused.

Actual synthetic scenario (M01): source A has a black tail near the cut. The deterministic critic measured output frames [45, 60) as near-black;
the RepairPlan trimmed A to its first 1.5 s; the child revision was rendered with A's segment recomputed and B's reused. The result is a new
output (`ae334bf9…`, 127,628 bytes, different from the parent's `69452983…`), Technical QC PASS, a fresh observation and 0 near-black findings.

Evidence under `.local-runs/phase5-gate7/` (`batch3b-*`):
- the baseline and invariant receipts, and the first red on skeleton contracts;
- the first green;
- 14 hostile attacks, which found two self-found defects: D1, caller artifacts read after the planner's await, and D2, unverified planner
  uncertainty evidence;
- one regression found by triage, D3, where a 3B export confused the accepted Batch-2A import scanner;
- each defect with its red, one-file repair and green;
- the pins, updated last: 33 replacements plus one package-count literal, 0 stale;
- the final run.

Final verification (historical: the implementation's bytes, before the owner-review repair below; typecheck and build PASS; `batch3b-final-*`):

| Suite | Result |
|---|---|
| Batch-3B pure | 48/48 |
| Batch-3B actual media | 3/3 |
| 3A-F | 35/35 |
| Batch-3A pure | 46/46 |
| Batch-3A actual media | 8/8 |
| Batch-2B pure | 43/43 |
| Audit policy | 10/10 |
| Batch-2B actual media | 34/34 |
| Batch-2A | 130/130 |
| Batch-1 | 81/81 |
| Gate-6 | 79/79 |
| Gate-5 | 97/97 |
| Routing | 33/33 |
| Compatibility | 377/377 |
| Legacy seams | 39/39 |
| Full safe suite | 1015/1015 (967 accepted + 48 Batch-3B) |

- Workspace audit PASS (122 application files) and `git diff --check` PASS.
- Source bytes were unchanged during the run.
- The accepted Batch-2B and Batch-3A actual-media outputs are identical to the pre-3B run: canonical, determinism pair, six looks and 30
  observation computation identities.

No dependency, lockfile, public contract (`packages/contracts/`), owner file or earlier receipt changed; nothing is staged or committed. Real
user footage was not run; professional editing quality is not verified.

Status at the implementation checkpoint (2026-09-28; historical, superseded by the owner acceptance closure below):

Architecture V2: **FROZEN**

Gate 7 Batch 3A: **OWNER-ACCEPTED**

Gate 7 Batch 3A-F: **OWNER-ACCEPTED**

Gate 7 Batch 3B implementation verification: **PASS**

Gate 7 Batch 3B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Batch 3C: **NOT STARTED**

Independent owner-review repair (2026-09-29), recorded as §26 of the 3B record. The owner's independent source review found one blocker, OR1. No
execution-path check established RepairPlan provenance: a GraphDiff whose origin names no validated RepairPlan (an arbitrary diff, or a
fabricated, self-identified plan) produced a child that was admitted, permitted and rendered by the pinned FFmpeg.

- **RED.** The new media test M04 rendered every attack on the unchanged production bytes.
- **Repair.** `validateRepairLineage` in `packages/edit-repair/revision.ts` checks every revision down to the initial graph (plan -> diff compilation,
  plus the plan's replay from the exact parent render, finding, evidence, passing QC and owner policy). `issueExecutablePermit` in
  `scripts/edit-render-local.ts` now requires it for any revision.
- **GREEN.** 3B media 4/4 and 3B pure 49/49 (with R-LINEAGE). No schema, version or rendered byte changed. One accepted pin was updated last.
- **Residuals stated.** Admission still establishes graph authority only (a layering decision for the owner). Records are not signatures. The store
  bound is not atomic across concurrent executions. Segmented byte identity is proven for untagged synthetic sources only.
- **Final verification on the final bytes.** Every gate passed:
  - typecheck and build;
  - 49/49 3B pure, 4/4 3B media, 35/35 3A-F, 46/46 and 8/8 3A;
  - 43/43 and 34/34 2B, with the accepted media outputs identical;
  - 10/10 audit policy, 130/130 2A, 81/81 Batch 1, 79/79 Gate 6, 97/97 Gate 5;
  - 33/33 routing, 377/377 compatibility and 39/39 legacy;
  - workspace audit and `git diff --check`.

  The exception is the full safe suite. Its run was cut short by a Claude Code stop under critical memory pressure, and its orphaned remainder ended
  at 819 tests, 802 pass and 17 whole-file start-up failures. It is not a valid pass and has not been rerun without the owner's request.

Status at the owner-review checkpoint (2026-09-29; historical, superseded by the owner acceptance closure below):

Gate 7 Batch 3B post-owner-review verification: **INCOMPLETE** (full safe suite pending)

Gate 7 Batch 3B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Batch 3C: **NOT STARTED**

### Owner acceptance closure - 2026-09-29

The owner ran the missing full safe suite on the final repaired Batch-3B bytes: `npm test` **PASS** with exit code 0, 1016 tests, 1016 pass, and 0
fail, cancelled, skipped or todo. That is the implementation's 1015 plus the owner-review R-LINEAGE test. `npm run audit:workspace` passed and
`git diff --check` gave no output. This evidence is owner-run and reported by the owner; this session holds no receipt for it.

At the closure, typecheck and build passed again on the unchanged production and test bytes (`batch3b-closure-typecheck.log`,
`batch3b-closure-build.log`). Every production and test byte was identical to the final reviewed state; the closure changed documentation only.

Owner decision: Batch 3B implementation verification **PASS**; owner acceptance **OWNER-ACCEPTED**.

- **OR1 was a real blocker.** Before the repair, an arbitrary or fabricated repair lineage reached executable rendering: an arbitrary GraphDiff,
  or a self-identified plan addressing no finding, was admitted, permitted and rendered by the pinned FFmpeg. OR1 repaired the execution boundary:
  `issueExecutablePermit` requires `validateRepairLineage` for every revision, down to the initial graph. The owner accepted the repair.
- **Repair-authority ruling (accepted).** A revision may be structurally validated, admitted and staged without RepairPlan authorization at the
  lower layer, provided no executable media permit is issued until its complete repair lineage validates. Required execution chain:
  CriticFinding -> RepairPlan -> GraphDiff -> parent EditGraph -> child EditGraph -> admission/preparation -> `validateRepairLineage` -> executable
  permit -> media execution. Structural admission does not by itself mean an editorial repair is authorized.
- **Internal record-versioning ruling (accepted).** The bounded widening of the revision fields in the reviewed internal pre-stable records is
  accepted, with no nine-record version-bump cascade. It permits no silent change to a future stable or public interchange contract.
- **Known non-blocking limitations (accepted, preserved).**
  - NB1: segment-store capacity is fail-closed but not atomically reserved across concurrent executions.
  - NB2: segmented-render byte equivalence is verified only for the authorized synthetic V0 cases; it does not establish preservation of arbitrary
    professional color metadata.
  - NB3: process wall time excludes adapter and orchestration overhead, so it is not the full user-visible repair latency.
  - NB4: a legacy one-ULP temporal mismatch fails closed.

Historical PASS, INCOMPLETE, FAIL, PENDING and NOT READY statements earlier in this section and in the 3B record are kept as chronology and are
superseded by this closure. The 3B record's §27 records the same closure.

Architecture V2: **FROZEN**

Gate 7 Batch 3A: **OWNER-ACCEPTED**

Gate 7 Batch 3A-F: **OWNER-ACCEPTED**

Gate 7 Batch 3B implementation verification: **PASS**

Gate 7 Batch 3B owner acceptance: **OWNER-ACCEPTED**

Full safe suite: **PASS** (1016/1016)

Workspace audit: **PASS**

Git diff check: **PASS**

Gate 7 overall: **NOT YET COMPLETE**

Batch 3C: **NOT STARTED**

## Phase 5 Gate 7 Batch 3A-F - Exact timebase foundation (synthetic media only)

Authority: [Gate-7 Batch-3A-F implementation and verification record](phases/phase-5-gate-7-batch-3af-exact-timebase-foundation.md). It is governed by the
accepted Batch-1, Batch-2A, Batch-2B and Batch-3A records and by the owner's explicit 3A-F-only authorization, which is limited to closing
ARCHITECTURE_V2_TIMEBASE_GAP.

Current status (2026-09-28): implementation verification is **PASS**; owner acceptance is **OWNER-ACCEPTED** at `e0adc7e4f72cc5bfdb0965fb20094a5d74c4bf3a`.

The batch replaces float-second authority with one exact temporal vocabulary, an integer count of an explicit reduced rational rate, which is the
accepted convention (Gate-6 ticks, Batch-1/2B frames, Batch-2B samples and stream PTS, Batch-3A transcript ticks) named once in
`packages/edit-graph/common.ts`:

- **EditGraph 0.2.0.** Source ranges are canonical exact instants, decoded exactly from the Gate-5 boundary at the declared clock by the one
  explicit legacy decoder (the accepted `exactTicks` rule, proven equivalent). Timeline time stays integer ticks. A legacy float-second 0.1.0 graph
  is refused `graph_version_unsupported`, never reinterpreted.
- **ExecutionDag 0.2.0.** Source nodes carry, and computation identities bind, the canonical exact range.
- **RenderProgram** (schema unchanged). The admitted float frame table is legacy MediaTruth evidence, decoded exactly once against the output grid;
  endpoints and `source_seconds` membership are exact. The FFmpeg boundary already received only integers and exact rationals.
- **Preserved.** Every baseline program's frame and sample intervals, segment computation identities, frame tables and argv digests; Batch-3A
  joins, windows and observation computation identities; RENDER_SEMANTICS and the executor identity. Actual synthetic media through the migrated chain is byte-identical to the accepted code's last run: the canonical
  render `e38b21c6…` (147,717 bytes), all six look renders, the determinism pair and all 30 Batch-3A observation computation identities.
- **Owner decisions raised before modification.** Approve hash-pin updates for changed files and float-literal translations in accepted tests
  (22 pin replacements, 12 translated lines); defer Gate-5 planning floats (decoded exactly at the EditGraph seam).

Evidence under `.local-runs/phase5-gate7/` (`batch3af-*`): the baseline and invariant receipts, the first red (C01-C04 on the unmodified bytes,
every sub-case confirmed), three hostile self-review defects (H1 undeclared alignment rounding silently, H2 primitives trusting malformed
operands, H3 reversed ranges) each with red, repair and green, seven attempted reds that held, and the final run. Final verification (typecheck and build PASS): 35/35 3A-F, 46/46 pure
and 8/8 actual-media Batch-3A, 43/43 pure Batch-2B, 10/10 audit-policy, 34/34 actual-media Batch-2B, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6,
97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 967/967 full safe tests; workspace audit and `git diff --check` PASS; source
bytes unchanged during the run.

No dependency, lockfile, contract (`packages/contracts/`), Batch-3A code, owner file or earlier receipt changed; nothing is staged or committed.
Real user footage was not run. MediaTruth exact stream timestamps remain a documented seam.

Architecture V2: **FROZEN**

Gate 7 Batch 3A: **OWNER-ACCEPTED**

Architecture V2 Timebase Gap: **RESOLVED**

Gate 7 Batch 3A-F implementation verification: **PASS**

Gate 7 Batch 3A-F owner acceptance: **OWNER-ACCEPTED**

Gate 7 overall: **NOT YET COMPLETE**

Batch 3B: **NOT STARTED**

## Phase 5 Gate 7 Batch 3A - Editorial evidence surfaces and semantic critic foundation (synthetic media only)

Authority: [Gate-7 Batch-3A implementation and verification record](phases/phase-5-gate-7-batch-3a-editorial-evidence-critic.md). It is
governed by the accepted Batch-1, Batch-2A and Batch-2B records, which are frozen and unchanged, and by the owner's explicit Batch-3A-only
authorization.

Current status (2026-09-27): Batch 3A implementation verification is **PASS**. Owner acceptance is **OWNER-ACCEPTED** at `f0edbb3b05724ad41c062a82585846eba9e0a4d6`.

The batch adds a new pure package, `packages/edit-review/`, and one audited strict-spawn adapter, `scripts/edit-observation-local.ts`:

- **Transcript evidence and pack.** Provider-neutral `TranscriptEvidence`: words and audio events on the accepted integer tick clock,
  bound to exact source content. A deterministic `TranscriptPack` keeps exact lineage and has a non-authoritative text projection.
- **Routing seam.** A pure `EvidenceRequest` → `EvidenceSelection` seam; a transcript is never mandatory.
- **`ReviewPlan`.**
  - Derived from exactly what was executed, under an owner `ReviewPolicy` budget.
  - Every executed cut appears once, at its exact output frame, tick and sample. Continuous joins are accounted for but never reviewed.
  - Adds a constant global set.
- **`EditorialObservation`.** Bounded evidence of one exact media identity: a rendered output bound to its receipt and passing QC, or a
  staged source. Its computation identity binds content, request, decoder, semantics, observer and transcript join, and excludes lineage.
- **Critic foundation.**
  - Technical QC stays a separate, exactly linked authority.
  - Deterministic checks report only measured `info` signals: near-black frames, and a settled audio level step at a cut.
  - Model-assessed findings enter only through a provider-neutral port. Here that is a synthetic fixture critic, with no model.

The adapter decodes only the published output or a staged source:

- located by content identity and verified through held handles;
- decoded with the pinned FFmpeg over `fd`-only input, integer-only argv and exact bounded stdout;
- re-verified after decoding.

Two owner-authorized protected changes were raised before modification and applied exactly: one workspace-audit adapter registration, and
the pinned Batch-2B audit count 14 → 15.

Preserved under `.local-runs/phase5-gate7/` (`batch3a-*`):

- the first red;
- eight test-only corrections;
- ten hostile self-review defects (D1–D10), each with red, repair and green receipts;
- one attempted red that could not be made red (A1);
- three disclosed process deviations.

Final verification, run 2 on the final bytes:

- typecheck and build PASS;
- 46/46 pure Batch-3A, 8/8 Batch-3A actual-media, 43/43 pure Batch-2B, 10/10 audit-policy, 34/34 Batch-2B actual-media, 130/130
  Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 932/932 full safe
  tests PASS;
- workspace audit PASS and `git diff --check` PASS;
- of the 297 tracked files, only the two owner-authorized files and this narrow status update changed; the 17 owner files (metadata only)
  and the 496 earlier Gate-7 receipts are unchanged; manifests and lockfile are unchanged; nothing is staged.

ARCHITECTURE_V2_TIMEBASE_GAP: **YES**. Source-side time persists as floating seconds in accepted Gate-5/6 records
(`packages/contracts/common.ts:8,17-19`, `packages/edit-graph/graph.ts:3,37`). It is recorded, not modified, and must be resolved before
repair or localized invalidation becomes authoritative.

No test performed network access, and there was no dependency change, real footage, model or paid-provider operation. The session's only
network operations were read-only: the baseline `git ls-remote`, plus the upstream `browser-use/video-use` licensing review (a clone and an
issue listing, in the session scratch directory). Work remains uncommitted and unstaged.

Phase 5 Gate 7 Batch 3A implementation verification: **PASS**

Actual synthetic rendered-media verification: **PASS**

Real user footage: **NOT RUN**

Professional editing quality: **NOT VERIFIED**

Gate 7 Batch 3A owner acceptance: **OWNER-ACCEPTED**

Gate 7 overall: **NOT YET COMPLETE**

## Phase 5 Gate 7 Batch 2B - First truthful actual media execution (synthetic media only)

Authority: [Gate-7 Batch-2B implementation and verification record](phases/phase-5-gate-7-batch-2b-render-execution.md). It is governed by the accepted Batch-1 and Batch-2A records, which are frozen and unchanged, and by the owner's explicit Batch-2B-only authorization.

Current status (2026-09-27): reservation-consumption accounting is **PASS**, Batch 2B implementation verification is **PASS**, and after final independent owner source review Gate 7 Batch 2B is **OWNER-ACCEPTED**. Gate 7 overall remains **NOT YET COMPLETE**. The paragraphs and status lines below record the original closure and the three owner-review repairs in order. Their **FAIL** and **PARTIAL** were true when recorded, and the accounting-closure block at the end of this section supersedes them.

The batch adds a new pure package, `packages/edit-render/`, and three audited adapters:

- `scripts/edit-render-local.ts`, the trusted real-execution boundary. It probes the exact pinned FFmpeg 9.0.1 build and its capabilities after the claim, checks staged-input conformance over verified handles, issues the ephemeral, non-serializable `ExecutablePermit`, executes and publishes immutable content-addressed output.
- `scripts/edit-media-qc-local.ts`, the structurally separate technical QC.
- `scripts/edit-render-fixture-authority-local.ts`, the synthetic-fixture lifecycle authority.

Execution runs typed DAG → RenderProgram → allowlisted argv → `spawn(pinnedBinary, argv, { shell: false })` over inherited, verified staged handles and `fd`-only protocols. It produces success or failure receipts and independent technical-QC receipts. The workspace audit now enforces per-file subprocess capabilities. Nothing is written into the EditGraph, and no Batch-2A semantics changed: a synthetic DispatchPreparation still never authorizes FFmpeg.

The first red, the implementation reds and six hostile self-review defects are preserved under `.local-runs/phase5-gate7/` (`batch2b-*`). Each defect has red, repair and green receipts:

- the lifecycle authority was not re-queried at execution;
- a swapped pending output could be linked under its content hash;
- a declared aspect could stretch the picture;
- segment identities did not bind the executor;
- a staged object reachable through a junction was accepted;
- accounting bases did not name FFmpeg's Windows quantities.

Verification at the original closure (historical; the final verification follows owner-review repair #3 below):

- typecheck and build PASS;
- 40/40 pure Batch-2B, 10/10 audit-policy, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 883/883 full safe tests PASS;
- 22/22 actual-media integration tests PASS on the pinned FFmpeg and ffprobe;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed.

The canonical run renders two synthetic sources with a non-zero trim, a hard cut, a clip-scoped warm look and linked audio to a 180 × 320, 30 fps H.264/AAC MP4 (`e38b21c6…`, 147,717 bytes). QC passes all 14 checks: 120 frames on the exact grid and 192,000 samples. Every frame and every 10 ms audio window is verified against the exact source selection.

Accounting is PARTIAL:

- wall time and output bytes are measured;
- render work is derived;
- GPU, VRAM, API spend and model calls are not applicable;
- CPU time and peak memory are only FFmpeg-reported (win32 process times and PeakPagefileUsage);
- total cost is unavailable because no owner cost model exists.

Frozen Batch-2B requirement 10 requires measured resource, cost and time accounting, so implementation verification is deliberately **FAIL**. The smallest next owner decision is to rule on FFmpeg-reported CPU and peak-commit evidence, or authorize a trusted OS-level per-process measurement. It must also define a local compute cost model, or rule that total cost is not applicable to local execution.

No network access, dependency change, real footage or model operation occurred. Work remains uncommitted.

Gate 7 Batch 2B implementation verification: **FAIL**

Actual pinned-FFmpeg synthetic media execution: **PASS**

Independent technical media QC: **PASS**

Reservation-consumption accounting: **PARTIAL**

Production user-media lifecycle authority: **NOT VERIFIED**

Real user footage: **NOT RUN**

Semantic editing quality: **NOT VERIFIED**

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Independent owner-review repair (2026-09-26), recorded as an addendum to the Batch-2B report. The owner's source review found three defects in the final Batch-2B bytes. Each was reproduced test-first against the unrepaired bytes, with red receipts under `.local-runs/phase5-gate7/`, and repaired only in uncommitted Batch-2B files:

- **Trust handles (critical).** The trusted handles exposed their evidence records as mutable references. Through genuine handles, a caller turned genuinely nonconforming bytes into a permit and a successful real render, and bypassed freshness for runtime, capability, lifecycle and conformance evidence. Each handle now keeps a private snapshot and exposes only copies.
- **QC liveness (high).** QC could wait forever after its timeout, and read tool versions from runs that had not completed. It now settles after a bounded grace, reports unconfirmed termination, and uses only completed runs as evidence.
- **Terminal evidence (high).** An error after the durable execution start could escape as a raw exception, including after this execution had already published its output. A failure could also deny an output this execution had linked. Post-start errors now end in failure records at the stage they interrupted, and a failure after this execution's own link names that output (`linked_by_this_execution_unverified` / `published_by_this_execution_uncertified`). Where truthful process timing is impossible (the runtime clock running backwards during the process), the adapter raises the owned `execution_evidence_unrecordable` refusal before publication.

Verification after that repair (historical):

- typecheck and build PASS;
- 42/42 pure Batch-2B, 10/10 audit-policy, 28/28 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 885/885 full safe tests PASS;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed.

Accounting was not changed and remains PARTIAL. No network access, dependency change, commit or stage occurred.

Owner-review trust-handle repair: **PASS**

Owner-review QC-liveness repair: **PASS**

Owner-review terminal-evidence repair: **PASS**

Gate 7 Batch 2B implementation verification: **FAIL** (unchanged; accounting **PARTIAL**)

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Owner-review repair #2 (2026-09-26), recorded as a second addendum to the Batch-2B report. The owner's post-repair source review accepted the three repairs above and found three further defects. Each was reproduced test-first against the unrepaired bytes and repaired only in `scripts/edit-render-local.ts`, `scripts/edit-media-qc-local.ts` and the media tests:

- **Policy snapshot (critical).** A permit kept the caller's policy object. Widening its timeout or output bound after issuance let the render succeed under bounds the binding never authorized. The permit now keeps one private policy snapshot whose `policyId` the binding names, and execution checks that match.
- **Probe completion (high).** Timed-out, unconfirmed or signaled runs reporting exit 0 were accepted as trusted probe evidence. One strict completion rule now governs every runtime query, listing, version query and conformance probe.
- **Exact-artifact QC (high).** QC hashed one handle and reopened the pathname for its probes and decode. It now holds four handles proven to be one file object, inspects only through them, and re-hashes after inspection.

The report's "terminates" wording for timed-out children is corrected: the adapter requests termination and reports `process_termination_unconfirmed` when close is not observed, without OS-level proof of death.

Verification after repair #2 (historical):

- typecheck and build PASS;
- 42/42 pure Batch-2B, 10/10 audit-policy, 31/31 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 885/885 full safe tests PASS;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed; manifests and lockfile unchanged.

Accounting remains PARTIAL. No network access, dependency change, commit or stage occurred.

Owner-review policy-snapshot repair: **PASS**

Owner-review probe-completion repair: **PASS**

Owner-review exact-artifact-QC repair: **PASS**

Gate 7 Batch 2B implementation verification: **FAIL** (unchanged; accounting **PARTIAL**)

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Owner-review repair #3 (2026-09-26), recorded as a third addendum to the Batch-2B report. The owner's second post-repair source review accepted the six repairs above and found three further code defects and one documentation defect. Each code defect was reproduced test-first against the unrepaired bytes and repaired only in `scripts/edit-render-local.ts`, `scripts/edit-media-qc-local.ts` and the media tests:

- **Private runtime context (critical).** The permit kept the caller's `RuntimeCall` container. Putting another runtime into it after issuance let an expired permit execute (a runtime over the same root whose clock read inside the window), and a runtime over a copied root let a second permit execute an already-executed claim again. The permit now holds a private, frozen context read once at issuance (the exact DAG handle, runtime and claim ownership, and a private artifact copy); the caller's container is never retained.
- **QC clock binding (high).** QC receipts were timed by a caller-supplied clock, including one dated a year before the render it inspected. `clock` is removed from the QC input; QC time comes only from the inspected runtime's clock.
- **Process termination truth (high).** An error after a child had started was recorded as a spawn failure with termination confirmed. Both supervisors now track the spawn; after it, an error requests termination once and only an observed close confirms it. An unconfirmed render is `process_termination_unconfirmed` and publishes nothing, and QC marks the run incomplete.
- **Final evidence documentation.** The report's §3 counts and final source hash table now describe the final bytes, and earlier "final" tables and headings are labelled historical.

Final verification on the final bytes (after owner-review repair #3):

- typecheck and build PASS;
- 42/42 pure Batch-2B, 10/10 audit-policy, 34/34 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 885/885 full safe tests PASS;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed; manifests and lockfile unchanged;
- the canonical render is still byte-identical (`e38b21c6…`, 147,717 bytes), QC passes and accounting is PARTIAL.

Accounting remains PARTIAL. No network access, dependency change, commit or stage occurred.

Owner-review private-runtime-context repair: **PASS**

Owner-review QC-clock-binding repair: **PASS**

Owner-review process-termination-truth repair: **PASS**

Owner-review final-evidence-doc repair: **PASS**

Gate 7 Batch 2B implementation verification: **FAIL** (unchanged; accounting **PARTIAL**)

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Owner accounting closure (2026-09-27), recorded as a fourth addendum to the Batch-2B report. The owner ruled on the two decisions the original closure named, for Gate 7 Batch 2B local-development execution only. The accounting was changed test-first in `packages/edit-render/receipts.ts` only; renderer semantics, FFmpeg execution, QC, trust handles and process supervision are unchanged.

- **Attributed evidence, not relabelled.** FFmpeg's own win32 reports of CPU time (process user + kernel time) and peak memory (PeakPagefileUsage, peak private commit, not resident-set RAM) are accepted for exactly `cpuMilliseconds` and `peakRamBytes`. They stay labelled `ffmpeg_reported` with their exact bases, and are never labelled measured.
- **No invented cost.** Total monetary cost is `not_applicable` to this local, non-metered execution: no billable provider runs and no owner-authorized local cost model exists. The row carries no value; it is not a measured or estimated zero and does not mean local compute is free. GPU, VRAM, API spend and model calls stay `not_applicable`, proven by this executor's semantics (software codecs and filters only, fd-only protocols, no provider, no model).
- **Scoped to one executor.** The ruling names, by literal identity, the one pinned V0 executor build, the `local_win32_x64` environment and the pinned runtime. Any other executor, environment or runtime inherits none of it (those dimensions are unavailable, so it is at best PARTIAL). A metered cloud or production executor needs its own owner-approved cost model.
- **FAIL path unchanged.** A reservation exceeded by FFmpeg-reported CPU work still fails the accounting stage before publication.

Final verification on the final bytes (after the owner accounting closure):

- typecheck and build PASS;
- 43/43 pure Batch-2B, 10/10 audit-policy, 34/34 actual-media, 130/130 Batch-2A, 81/81 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 886/886 full safe tests PASS;
- the canonical actual-media execution, run one final time, reconciles to accounting PASS: the render is byte-identical (`e38b21c6…`, 147,717 bytes), QC passes 14/14 checks, and every dimension is within its reservation;
- workspace audit PASS and `git diff --check` PASS;
- 0/184 protected, 0/13 owner and 0/167 earlier-receipt files changed; manifests and lockfile unchanged.

No network access, dependency change, real footage, commit or stage occurred.

Reservation-consumption accounting: **PASS**

Gate 7 Batch 2B implementation verification: **PASS**

Actual pinned-FFmpeg synthetic media execution: **PASS**

Independent technical media QC: **PASS**

Production user-media lifecycle authority: **NOT VERIFIED**

Real user footage: **NOT RUN**

Semantic editing quality: **NOT VERIFIED**

Gate 7 Batch 2B owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

## Phase 5 Gate 7 Batch 2A - Durable runtime authority / atomic claim / verified source staging / dispatch recheck foundation

Authority: [Gate-7 Batch-2A implementation and verification record](phases/phase-5-gate-7-batch-2-render-runtime.md). It is governed by the accepted [Batch-1 record](phases/phase-5-gate-7-execution-runtime.md), which is frozen and unchanged, and by the owner's explicit Batch-2A-only authorization. Batch 2A is the mandatory runtime-safety checkpoint before any media process may start, and it starts none.

The workspace audit keeps `packages/` free of filesystem and clock access. The runtime therefore splits into a pure core, `packages/edit-runtime/` (records, rules and algorithms over narrow ports), and the local adapter `scripts/edit-runtime-local.ts` (system UTC clock, entropy, ledger, staging store and source locator). The adapter imports no `child_process` and launches nothing. The batch adds:

- a durable logical-attempt registry. An attempt slot is unique by project, creator, operation and attempt; purpose, budget, allocation, history and storage labels never mint another. Forked, individually replay-valid reservation histories cannot win a second slot, and an occupied slot that is corrupt stays consumed;
- an atomic execution claim on the unchanged Batch-1 `claimTargetId`. It is acquired by a synced record published through a no-overwrite hard link. Exactly one caller acquires and receives in-memory ownership; there is no release, timeout or steal;
- verified content-addressed staging. Bytes are copied and hashed from one opened source handle, published without overwrite under a `stagedObjectId` of content identity only, and fully re-verified. The original source path never re-enters;
- claim-bound runtime-now rechecks of the ExecutionGrant and media grants, a post-stage `SourceLifecycleObservation`, and post-claim capability and runtime recheck seams that are synthetic and test-only, and say so;
- a short-lived `DispatchPreparation` (`preparedAt ≤ now < validUntil`, clamped to every authority window) with deterministic replay and `mediaExecution: not_started`.

The first red, the test-only corrections and one self-review red receipt (a namespace-foreign ID addressed runtime state; repaired test-first) are preserved under `.local-runs/phase5-gate7/`. Verification:

- typecheck and build PASS;
- 116/116 focused Batch-2A, 81/81 Gate-7 Batch-1, 79/79 Gate-6, 97/97 Gate-5 and 33/33 routing tests PASS;
- 377/377 compatibility, 39/39 legacy-seam and 822/822 full safe tests PASS;
- workspace audit PASS;
- all protected and owner files unchanged; `git diff --check` PASS.

All evidence is synthetic, over opaque test bytes. No FFmpeg, ffprobe, media, Python, model, real-footage or network operation ran, and no public contract, render result, QC result, decision event or confidence was emitted. Work remains uncommitted.

Gate 7 Batch 2A implementation verification: **PASS**

Gate 7 Batch 2A owner acceptance: **PENDING**

Actual FFmpeg execution: **NOT AUTHORIZED IN BATCH 2A**

Gate 7 overall: **NOT YET COMPLETE**

Independent owner-review repair (2026-09-25), recorded as an addendum to the Batch-2A report. The owner review, `gate7-batch2a-owner-review.txt`, is preserved unedited. Four code findings were reproduced test-first against the unrepaired bytes: 11 regressions, each with its sub-cases confirmed separately, and four red receipts under `.local-runs/phase5-gate7/`. Each was repaired:

- **Freshness (critical).** A preparation could outlive the rechecks it rested on. Freshness is now one exclusive window, `observedAt <= now < observedAt + maxAge`. `validUntil` is also bounded by every lifecycle, capability and runtime freshness expiry, and each binding records its `freshUntil`.
- **Causal time.** A claim now requires `claimedAt >= registeredAt`. Staging checks its start against the claim before any source work, and requires completion at or after its start (`stagingStartedAt` is recorded). A clock rewound during any provider call refuses.
- **Future real-probe contract.** Strict typed provenance can now represent a future real lifecycle observation and real local probes, with exact implementation identity, and a typed preparation grade consistent with every binding. Batch 2A still produces and accepts only synthetic provenance: real-looking provenance refuses as `evidence_provenance_unsupported`, and no executable permit exists.
- **Observation timing.** Each check records `checkStartedAt`, `observedAt`, `checkCompletedAt` and `observedAtBasis`.
- **Artifact bound.** `MAX_RUNTIME_ARTIFACTS = 512`, from measured universes of 82–104 artifacts and about 240 extrapolated for 16 sources, is enforced before any artifact map and at every claim-bound call.

Two documentation findings were corrected:

- **Authority domain.** Claim exclusivity holds only among workers sharing one authoritative runtime ledger root. Two roots are two authority domains, and a distributed deployment needs one strongly consistent shared ledger.
- **Network wording.** The sentence above, "No FFmpeg, ffprobe, media, Python, model, real-footage or network operation ran", is superseded. One pre-work `git fetch` contacted the Git remote solely to verify the frozen baseline. Batch-2A runtime code and tests performed no network I/O and ran under `scripts/no-network.mjs`, and no provider contacted an external service. No fetch ran during the repair.

The workspace audit still does not enumerate the new adapter; the owner must decide its registration before any `child_process`-capable renderer adapter is accepted in Batch 2B. Verification: typecheck and build PASS; 130/130 focused Batch-2A, 81/81 Gate-7 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 836/836 full safe tests PASS; workspace audit PASS; all protected and owner files unchanged; `git diff --check` PASS. Work remains uncommitted.

Gate 7 Batch 2A owner-review repair verification: **PASS**

Gate 7 Batch 2A owner acceptance: **PENDING**

Actual FFmpeg execution: **NOT AUTHORIZED**

Gate 7 overall: **NOT YET COMPLETE**

### Owner acceptance closure — 2026-09-25

Gate 7 Batch 2A is **OWNER-ACCEPTED** at `291a04e` after final independent post-repair source review.

The four owner-review production findings were reproduced test-first and repaired: evidence-freshness expiry, causal runtime chronology, future real-probe provenance/observation timing, and the runtime artifact-universe bound.

The final accepted verification is 130/130 focused Batch-2A, 81/81 Gate-7 Batch-1, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 836/836 full safe tests, with typecheck, build, workspace audit, protected-byte comparison and `git diff --check` passing.

One pre-work Git fetch contacted origin solely to verify the frozen baseline. Batch-2A runtime code and tests performed no network I/O.

Historical `PENDING` and `uncommitted` statements earlier in this section are retained as chronology and are superseded by this closure.

Actual FFmpeg execution: **NOT AUTHORIZED**.

Gate 7 overall: **NOT YET COMPLETE**.

Batch 2B: **NOT AUTHORIZED at this closure checkpoint**.

## Phase 5 Gate 7 Batch 1 - Execution authority / admission / DAG / render identity

Authority: [Gate-7 Batch-1 implementation and verification record](phases/phase-5-gate-7-execution-runtime.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–6. The new internal `packages/edit-execution/` module is a separate EditGraph execution path; the legacy `Renderer.render(UniversalEditPlan)`, `RenderResult`, `QCResult` and `JobState` seams are untouched and never used as authority. It adds:

- an owner `ExecutionPolicy` and render profiles;
- explicit `ExecutionMediaGrant`s (analysis or evaluation authorization never renders; preview-only never authorizes final);
- per-source `SourceAccessReceipt`s rechecked for exact full-byte hash and size, the current MediaAsset identity and lifecycle, freshness and chronology;
- a fresh single-executor capability recheck through the unmodified Gate-6 attestation machinery;
- a separate execution budget and a Gate-3 reservation replayed exactly, never the Gate-5 planning budget;
- exact derived render work plus an attributed estimate;
- exact frame-grid conformance for both intents;
- an explicit `ExecutionGrant` and a single fail-closed `ExecutionAdmission`;
- a provider-neutral `ExecutionDag` with Merkle computation identities and a render computation identity that never collides between preview and final.

No plan, DecisionEvent, confidence, RenderResult or QCResult is produced, and no media, renderer, provider, model, subprocess or network operation runs. The first red and one self-review red receipt are preserved under `.local-runs/phase5-gate7/`. The self-review defect was evidence that postdated the grant binding it, repaired test-first. Verification:

- typecheck and build PASS;
- 51/51 focused Gate-7, 79/79 Gate-6 regression and 97/97 Gate-5 regression tests PASS;
- 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 676/676 full safe tests PASS;
- workspace audit PASS.

All evidence is synthetic. Work remains uncommitted.

Gate 7 Batch 1 implementation verification: **PASS**

Gate 7 overall: **NOT YET COMPLETE**

Actual media rendering: **NOT AUTHORIZED IN BATCH 1**

Owner acceptance: **PENDING**

Independent owner-review repair (2026-09-24 to 2026-09-25), recorded as an addendum to the Gate-7 report:

- **Encoding attestation.** A strict, attributed `ExecutionRuntimeAttestation` now proves the exact executor build, environment, runtime build and requested encoding. It is bound by the grant, checked for freshness, and its runtime identity binds every computation identity.
- **Trim authority.** DAG source nodes carry the exact Gate-6 trim authority and a scope-free frame-time table identity, both bound into the source computation identity. Computation identities carry no project, creator or analysis identity and are never access authorization.
- **Dispatch boundary.** Admission and DAG are eligibility only: `dispatch` stays `not_claimed` / `atomic_runtime_claim_required`, and the DAG names the claim key. The report specifies the Batch-2 atomic-claim invariant and one safe dispatch sequence.
- **Operations.** Competing cuts on one join are refused (CONFIRMED). Every operation is represented exactly in the DAG, or compilation refuses.
- **Self-found defects.** Two further defects were repaired: runtime evidence older than the graph's capability observation, and version labels able to carry a path, command or URL.
- **Evidence.** Six red receipts are preserved under `.local-runs/phase5-gate7/`. A test-only two-source chain covers multi-asset admission and DAG identity locality.
- **Verification.** Typecheck/build PASS. 72/72 focused, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 697/697 full safe tests PASS. Workspace audit PASS. All protected and owner files are unchanged. All evidence is synthetic. Work remains uncommitted.

Gate 7 Batch 1 post-owner-review verification: **PASS**

Gate 7 Batch 1 owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

Batch 2 actual media rendering: **NOT AUTHORIZED**

Final owner hardening (2026-09-25), recorded as a further addendum to the Gate-7 report:

- **Estimate.** The work estimate now binds the exact runtime identity and execution environment; a mismatch is `work_estimate_mismatch`.
- **Executor identity.** Gate-7 executor identities are execution-safe without modifying Gate 6. A selected executor whose Gate-6 version is a path, command or URL refuses with `executor_not_execution_safe`.
- **Claim target.** The atomic claim target is the reservation attempt only. `claimTargetId` derives from the reservation's Gate-3 content identity, the operation and the attempt, and excludes the render computation, which is a separate `renderBinding`.
- **Environment.** Node computation identities bind the execution environment.
- **Self-found defect.** The claim target first keyed a storage-named reservation reference; it was repaired test-first.
- **Batch-2 responsibilities.** Source TOCTOU (verified bytes must be the bytes consumed) and measured execution accounting are documented as Batch-2 responsibilities.
- **Evidence.** Five red receipts are preserved under `.local-runs/phase5-gate7/`.
- **Verification.** Typecheck/build PASS. 81/81 focused, 79/79 Gate-6, 97/97 Gate-5, 33/33 routing, 377/377 compatibility, 39/39 legacy-seam and 706/706 full safe tests PASS. Workspace audit PASS. All protected and owner files are unchanged. All evidence is synthetic. Work remains uncommitted.

Gate 7 Batch 1 final hardening verification: **PASS**

Gate 7 Batch 1: **OWNER-ACCEPTED** at `d55f0e1`

Gate 7 overall: **NOT YET COMPLETE**

Batch 2 actual media rendering: **NOT AUTHORIZED at this closure checkpoint**

## Phase 5 Gate 6 - EditGraph / capability / compatibility projection

Authority: [Gate-6 implementation and verification record](phases/phase-5-gate-6-editgraph-capability-compatibility.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–5. The new internal `packages/edit-graph/` module builds an `EditGraph` V0 only from a replay-valid chosen Gate-5 decision (tie, abstention and infeasibility are refused), keeps exact Gate-5 source ranges on an exact integer output-tick clock, binds typed operations only from supplied attributed resolutions, retains every deferred obligation, assesses supplied capability evidence in five explicit states, and reports UEP 1.0.0 compatibility. No truthful UEP success path exists under the frozen telemetry requirements, so every report is an explicit refusal and no plan, DecisionEvent or confidence is produced. First red, self-review reds and a fixture-correction receipt are preserved under ignored `.local-runs/phase5-gate6/`. Typecheck/build PASS; 65/65 focused, 97/97 Gate-5 regression, 377/377 compatibility and 611/611 full safe tests PASS; workspace audit PASS. All evidence is synthetic; no model, media, renderer, provider or network operation ran. Work remains uncommitted.

Independent owner-review repair (2026-09-24), recorded as an addendum to the Gate-6 report:

- **Capability attestation.** AVAILABLE now rests only on a typed, attributed `CapabilityAttestation`. It is bound to the exact scope, environment, observation time, executor build and capability. Snapshot declarations only index these attestations.
- **Readiness.** Capability readiness is reported separately from overall execution readiness. Overall readiness is always `not_execution_ready` with `budget_feasibility_unverified`. The Gate-5 planning budget is disclosed, never repurposed.
- **UEP joins.** ReferenceFingerprint 1.0.0 joins are validated only from exact supplied evidence and are otherwise reported unavailable. Every frozen plan-input validator dependency is classified explicitly, and `planInputEligibility` is `not_eligible` for every V0 graph.
- **Evidence.** Six owner and self-review red receipts are preserved under `.local-runs/phase5-gate6/`.
- **Verification.** Typecheck/build PASS. 79/79 focused, 97/97 Gate-5 regression, 377/377 compatibility and 625/625 full safe tests PASS. Workspace audit PASS. All 46 protected files and all owner files are unchanged.

Gate 6 implementation verification: **PASS**

Gate 6 post-owner-review verification: **PASS**

Gate 6: **OWNER-ACCEPTED** at `0cb99b6`

Gate 7: **NOT AUTHORIZED at this closure checkpoint**

## Phase 5 Gate 5 - Retrieval / sequence / boundary planning

Authority: [Gate-5 implementation and verification record](phases/phase-5-gate-5-retrieval-sequence-boundary-planning.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–4. Starting branch/HEAD were `phase/5-edit-planner-v0` / `7b82de13cb49022d2f08cef577f4cb7056274fd9`, with no tracked modifications. The new internal `packages/planning/` module binds exact direction/world/candidate/token/policy/budget/history snapshots, deterministic retrieval, evidence-authorized source boundaries, finite sequence search, full considered/pruned lineage and replay-validated PlanningDecision/runtime receipts. Initial red and three self-review red receipts are preserved under `.local-runs/phase5-gate5/`. Typecheck/build PASS; 56/56 focused tests, 377/377 compatibility tests and 505/505 full safe tests PASS; workspace audit PASS. Protected accepted code remains unchanged. All new evidence is synthetic; no model/media execution, calibrated quality/confidence, public DecisionEvent, EditGraph or UEP generation is claimed. Status: **implementation verification PASS; awaiting independent owner acceptance**. Work remains uncommitted. Gate 6 is not authorized.

## Phase 5 Gate 4 - Canon v0 / Director boundary

Authority: [Gate-4 implementation and verification record](phases/phase-5-gate-4-canon-director-boundary.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md) and Gates 1–3. The internal `packages/director/` module binds a small first-party Canon, explicit intent and candidate summaries, exact world/budget/model-selection artifacts, provider-neutral creative direction, grounding, and strong result outcomes. Independent owner-review regressions repaired constraint-subject authority and bound sanitized failed-result claims to the exact runtime-owned producer receipt. Final post-repair review confirmed 48/48 focused tests, 254/254 compatibility tests, 449/449 full safe tests, workspace audit PASS, protected-path preservation, and clean diff checks. Gate 4 is **OWNER-ACCEPTED** at `e99e98748ddc84d5932adb1c5ee1b22729d35a2f`. It establishes no Director-model or editing-quality claim. Gate 5 was not authorized or started at that acceptance checkpoint; its current status is recorded above.

## Phase 5 Gate 3 - Budgeted perception / model routing

Authority: [Gate-3 implementation and verification record](phases/phase-5-gate-3-budgeted-perception-routing.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). The bounded internal `packages/routing/` module validates pinned provider-neutral profiles, separately authorized capability evidence, exact compute budgets, explicit child/parallel reservations, supplied guard evidence, deterministic model selection, Gate-1 receipt reuse, future-compute authorization and CostTrace links to the frozen public ledger. It performs no model/media/provider/network operation. First red, owner-review red and subsequent self-review regression receipts are preserved under ignored `.local-runs/phase5-gate3/`. Gate 3 is **OWNER-ACCEPTED** at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`. At that checkpoint Gate 4 had been authorized but not started.

Independent owner review found bounded Gate-3 correctness defects despite the earlier green suite. Test-first owner red and confirmed red receipts, followed by separate self-review regression receipts, are preserved under `.local-runs/phase5-gate3/`. The repair binds exact compute ceilings, cumulative reservation history, declared child allocations, chosen-profile resource needs, typed guard/availability and quality evidence, exact routing artifact refs, and truthful CostTrace telemetry joins. Final independent closure verification accepted Gate 3 at `0239d7bfa7b99b95cf0984ccbd35add50e47fb7f`. Gate 4 had not started at the Gate-3 closure checkpoint.

## Phase 5 Gate 2 - ProjectWorldModel-lite

Authority: [Gate-2 implementation and verification record](phases/phase-5-gate-2-project-world-model-lite.md), governed by the accepted [Creative Intelligence Architecture v1](phases/phase-5-gate-0-creative-intelligence-architecture-v1.md). The bounded internal `packages/world-model/` substrate links explicitly supplied source evidence, observed facts, derived interpretations, exact legacy token snapshots and authorized Gate-1 reuse receipts. It supports pure immutable child publication, dependency invalidation and scoped bounded views with explicit coverage. Current `MediaAsset` retention is checked separately from historical source authorization at a caller-declared access time. It neither enumerates Gate-1 evidence nor performs perception, model, provider, decoder, media or network work.

The test-first compiler failure and later self-review failure are preserved under ignored `.local-runs/phase5-gate2/`. Independent owner review defects were reproduced in the preserved `owner-review-red.md` receipt (31 focused tests, 19 pass, 12 fail before repair), then repaired with focused regressions. The earlier pre-owner-review PASS remains historical evidence in the Gate-2 report. Gate 2 is **OWNER-ACCEPTED** at `2c9b80b49549d5c56b7cdb48d39aeb4d58d1bae2`. No real-footage Gate-2, production persistence, full current authorization service, narrative intelligence, or professional editing quality is claimed. Gate 3 is owner-authorized for bounded implementation but has not started.

Final independent owner review confirmed the first repair but found candidate-bound existence leakage, unresolved present uncertainty evidence, direct non-initial snapshot construction, and a membership-capacity contradiction. New test-first red evidence is preserved in `final-owner-review-red.md`; a corrected fixture rerun is preserved in `final-owner-review-red-confirmed.md`. The bounded repairs pass the focused Gate-2 suite (36/36). Gate 2 is **OWNER-ACCEPTED** at `2c9b80b49549d5c56b7cdb48d39aeb4d58d1bae2`. Gate 3 is owner-authorized for bounded implementation but has not started.

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

Phase 2 remains CLOSED; Phase 2.6A and Phase 2.6B are COMPLETE. Phase 3 Audio Analyzer V0 and Phase 4 Matcher V0 are COMPLETE within their accepted scopes. Phase 5 Gates 0–6 are owner-accepted within their bounded scopes.

Gate 7 Batch 1 is OWNER-ACCEPTED. Gate 7 Batch 2A is OWNER-ACCEPTED.

Gate 7 Batch 2B has completed its implementation, three independent owner-review repair rounds and the final owner accounting closure. Final verification is PASS for the pinned-FFmpeg synthetic execution path, independent technical media QC and reservation-consumption accounting. After final independent source review, Gate 7 Batch 2B is **OWNER-ACCEPTED** as of 2026-09-27.

This Batch-2B closure does not claim production user-media lifecycle authority, real-user-footage execution quality or semantic/professional editing quality.

Gate 7 overall remains **NOT YET COMPLETE**.

The next authorized implementation work has not started. Gate 7 Batch 3A — editorial evidence surfaces and critic foundation, including the bounded adaptations researched from `browser-use/video-use` — must begin only after the Batch-2B closure commit.

Update (2026-09-27, Gate 7 Batch 3A): Batch 3A was implemented from HEAD `c74d5fe` (after the Batch-2B closure commit) under the owner's Batch-3A-only authorization. Its implementation verification is **PASS** on synthetic media, and owner acceptance is **OWNER-ACCEPTED**. It claims no real-footage review, model critic, calibrated critique or professional editing quality. Nothing later is authorized or started: no RepairPlan/GraphDiff execution, automatic repair, localized rerender, EditorialState, RevisionLedger, motion/composition/AudioGraph expansion, HyperFrames, CapabilityRegistry, preview runtime, manual NLE or OTIO/OCIO work.
