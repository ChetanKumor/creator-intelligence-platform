# Phase 5 Gate 7 Batch 3E-B1B — Executable N1 canonicalization, trusted publication and derived-media lifecycle

**Status (2026-10-05, §14).** 3E-B1B: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**. 3E-B1A: **OWNER-ACCEPTED** at `2b2b49e`. 3E-C:
**NOT STARTED**. B2: **NOT STARTED**. Gate 7: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.

Evidence: `.local-runs/phase5-gate7/batch3e-b1b-20261005/` (ignored): numbered logs, receipts and the scratch instruments, kept unchanged.
Every run used generated synthetic media or opaque test bytes. No owner footage, model, network or canonical publication into the
repository's own store took place. Fixture authorizations declare generated or opaque bytes `owner_supplied` or `system_canonicalized`
only to exercise the adapters' own checks; they are not owner media, not real canonical FootageAnalysis and not real-model evidence.

## 1. Baseline, owner ruling and authorization

- After `git fetch`, the local and remote `phase/5-gate7-3e-production-hardening` resolved to
  `2b2b49e058de40d2cd166a9d8764947eb5dde6b7`, and `main` and `origin/main` to `4f85b559c7eff2c24e221011f3ee1dd1466a111d`. There were no
  tracked or staged changes; the owner's untracked files were left alone (`00-baseline-identity.log`).
- Owner ruling: **Gate 7 Batch 3E-B1A: OWNER-ACCEPTED** at `2b2b49e`. It is recorded by the documentation-only commit
  `afaa5d6309ad38818a0fe9fe3a6525a891ef8b71` (`docs(gate7): accept Batch 3E-B1A`; §15 of the B1A record and a new top bullet in
  `docs/CURRENT_PHASE.md`), pushed and verified against the live remote before B1B began.
- B1B was authorized as a bounded protected implementation: the new `scripts/media-ingest-local.ts`; the protected
  `scripts/edit-render-owner-media-authority-local.ts`, `packages/edit-render/owner-media.ts` and `packages/edit-render/authorize.ts`;
  `scripts/audit-workspace.mjs`; the tests and pins those changes require; documentation. `packages/edit-render/index.ts` was not needed
  and is unchanged; `packages/media-ingest/canonical.ts` (the accepted recipe and contract) is unchanged.

## 2. Stage 1: the accepted N1 recipe, proven on the exact pinned runtime (`02-stage1-receipt.md`)

No production byte changed for Stage 1. The research instrument (`stage1/stage1-n1-proof.mjs`) verified the pinned binaries through a held
handle and their `-version` banners with the accepted `parseVersionBanner`, then executed exactly `N1_ARGV_TEMPLATE`, with only its
`{input_fd}`, `{output_fd}` and `{max_output_bytes}` placeholders filled, under no shell and with fd-only handles.

| binary | SHA-256 | size | reported version |
|---|---|---|---|
| ffmpeg.exe | `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3` | 102,856,192 | 9.0.1-essentials_build-www.gyan.dev |
| ffprobe.exe | `19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f` | 102,652,416 | 9.0.1-essentials_build-www.gyan.dev |

- Three generated N1 fixtures (160x90 H.264 yuv420p, 30 fps, 60 frames, no B-frames, start 0, SAR unspecified, progressive, SDR, no side
  data): video only (MP4), 48 kHz stereo PCM (MOV) and 48 kHz stereo AAC (MP4). Each classified **NORMALIZE_N1** from its real probe; each
  output classified **DIRECT** under the unchanged renderer rule, with an explicit **1:1** SAR.
- Every Stage-1C invariant held for every fixture: bytes differ; codec, pixel format, frame count, exact rational frame instants, frame
  table, decoded frames, exact durations, stream layout, colour and field order unchanged; no side data; source unchanged. With audio,
  codec, rate, layout, every packet's payload, timing and side data, the exact audio instants and sample counts (96,000) and the A/V
  relationship were unchanged.
- **Determinism:** two runs into two fresh pending outputs were byte-identical. A second process regenerated every fixture (bit-identical
  sources) and reproduced every output hash, probe, classification and listing.
- The N1 recipe changed: **NO**. The B1A derivation expresses the verification truthfully: **no contract expansion was needed** (§3.3).

Stage-1 findings that shaped B1B:

1. **One held handle is unsound across children.** Children inherit the shared file pointer. A second probe through an already-used
   handle failed for one file and, worse, "succeeded" for two others, apparently by parsing from the trailing `moov` where the pointer rested. Every child therefore gets its
   own fresh verified handle (§3.2).
2. **The decoded-video listing differs only in its `#sar` line** (`0/1` source, `1/1` output). The DIRECT control's decoded digest equals
   the N1 output's.
3. **The stream-copied audio listing binds timing**: every packet's dts, pts, duration, size, payload MD5 and packet side data (the AAC
   priming packet at pts -1024 carries one 10-byte side-data element, the size of skip-samples data), plus extradata, time base, codec, rate and layout.
4. **What N1 changes in the bitstream**: the avcC SPS gains the 1:1 VUI aspect ratio (one byte longer); the PPS and the High-profile
   avcC extension bytes are kept; `h264_metadata` logs an informational "4 bytes left at end of AVCC header".
5. **x264's user-data-unregistered SEI is exported as frame side data**, so ordinary x264 encodes classify REFUSE
   (`frame_side_data_present`) under the accepted N1 rule (§11, §12).

## 3. The canonical-ingest adapter (`scripts/media-ingest-local.ts`)

The one production adapter allowed to canonicalize. `canonicalizeLocalMedia(request)` takes an absolute local source path, its
AuthorizedFootage record, the approved tool root, an explicit local workspace and a trusted clock (read once), plus optional owner bounds
that may only lower the hard ones and test-only hooks that grant nothing. Every caller field is read once, before any await.

### 3.1 Classification and the three outcomes

- The source path is an absolute local path (never a URL, share, device path, traversal or pattern), link-free in every component,
  resolving exactly where declared. It is opened once as the operation's **anchor** (lstat and handle identity equal), hashed through
  that handle and compared with the authorization (`source_mismatch`).
- The **source probe** is the pinned ffprobe over the exact verified bytes (§3.2). Its JSON is split into the renderer's strict probe and
  the ingest facts (field order, colour transfer, colour primaries), and the **accepted, unchanged `classifyCanonicalIngest`** decides.
  A probe of an unreadable file classifies through the same classifier as `probe_invalid`.
- **DIRECT** and **REFUSE** return at once and create nothing: no store directory, copy, transcode or remux (B1B-D01, B1B-R01, B1-24).
- **NORMALIZE_N1** proceeds only for a 1.1.0 root that carries `canonicalizationConsent`; otherwise `canonicalization_consent_required`,
  and still nothing is created.

### 3.2 Probe-to-bytes binding

- No pinned process ever opens a path. Each child inherits its **own fresh read-only handle**, opened here, verified to be the anchor's
  file object (device and inode) and to hash to exactly the expected bytes immediately before the spawn, and **re-hashed after exit**. A
  measurement of changed bytes is never evidence, whatever the process reported (`source_changed`, `output_invalid`, `cache_corrupt`).
- The source anchor stays open for the whole operation and is re-verified (name identity and full hash) before publication and before
  anything is returned. A source that is mutated, replaced or removed during the operation refuses (B1B-01, B1B-03, B1B-M02).
- The runtime is only the pinned build in the approved tool root, re-verified by full SHA-256 before every spawn. No PATH and no shell; the
  environment is `SystemRoot` only; the protocol whitelist is `fd`; the argv holds fixed tokens only. Every child's working directory is the
  approved tool root, and no argument names a file there.

### 3.3 The v0 verification methods (the accepted literals, first executed here)

- `pinned_runtime_decoded_frame_md5_v0`: the pinned FFmpeg's `framemd5` listing of the first video stream, decoded with passthrough frame
  timing in the demuxer's own time base (`-enc_time_base:v demux`). The digest is SHA-256 over the canonical form of the listing: the time
  base, codec, dimensions and every frame row (stream, dts, pts, duration, size, MD5). It excludes **only** the `#sar` header line,
  because declaring square pixels is N1's one intended change; the SAR is verified separately (source `0/1`, output `1/1`).
- `pinned_runtime_audio_packet_md5_v0`: the pinned FFmpeg's `framemd5` listing of the first audio stream **stream-copied** (`-c copy`).
  The digest binds extradata, time base, codec, rate and layout, and every packet's dts, pts, duration, size, payload MD5 and side data. A
  timestamp change can never pass on matching payloads (B1B-M06).
- Both parsers are strict: any unexpected header, row, CR, side-data shape or empty listing refuses (`digest_invalid`). The exact queries
  are exported as `CANONICAL_INGEST_QUERIES`; any change to them is a new method version.

### 3.4 Verification before trust (Stage-1C, every invariant named when it fails)

The output must: differ from the source; declare 1:1 (the source declared nothing); classify DIRECT under the unchanged rule; keep H.264,
yuv420p, geometry, rates, stream layout, field order and colour; keep the frame count, the exact rational instants, the time base and
start, and the frame table; decode to identical frames; keep exact per-stream durations and the format duration; add no side data
(none on video, exactly the source's elsewhere). With audio it must keep the codec, layout, channels and rate, every packet's payload and
timing, the exact audio instants and sample counts, the total samples and the A/V relationship. The accepted
`buildCanonicalMediaDerivation` then re-checks the classified facts and the digests, and only then is a derivation built.

### 3.5 The private canonical store and publication

- Layout (names only, in `owner-media.ts`): `<workspace>/.local-media/canonical-v0/{objects,computations,pending}`. The workspace is an
  explicit, link-free local directory. Each namespace is a real directory resolving exactly in place. The store never lives in the
  directory that holds the source and never holds a source (B1B-M05). Production passes the repository root, whose `.local-media/` is
  git-ignored; tests use isolated temporary workspaces. No test created a store under the repository.
- An object is named by its exact SHA-256 (`<hash>.mp4`). The scope-free **computation record** (`<sha256(computationId)>.json`,
  `canonicalComputationRecordOf`) holds exactly the derivation's computation, source bytes, classification, recipe, toolchain and verified
  output. It names no creator, project, root authorization, derivation or location, and it authorizes nothing.
- Publication order: source verified → source probe → classification → exclusive pending object (`wx+`) → the recipe → output complete
  and bounded → full hash → output probe → decoded and audio equivalence → derivation built → source re-verified → sealed read-only and
  re-hashed → the pending name must still be the verified object → hard link without overwrite → the published (or occupying) object
  re-read, re-hashed and re-probed (its probe must equal the verified output's) → record published without overwrite (an existing record
  must be byte-identical) → source re-verified → the derivation and derived authorization are returned.
- FFmpeg's `-fs` is a soft limit (Stage-2 measurement: 4,096 requested, 197,121 bytes written, 39 of 60 frames, exit 0); the adapter
  enforces its own bound after the run (`output_invalid`).

### 3.6 Cache semantics

- A **cache hit** is this computation's record plus its object. It never re-runs the recipe. It repeats every verification against the
  freshly verified source (object hash and size, probe, classification, decoded and audio digests, every invariant). It must reproduce
  exactly the recorded bytes, and only then builds **this caller's** derivation and derived authorization (B1-22).
- A tampered object, a non-canonical or re-identified record, or a record pointing at another computation's object refuses
  (`cache_corrupt`). Nothing is ever repaired or overwritten (B1-23, B1B-04).
- Cache identity is never authorization identity. Another project's consenting root over the same bytes gets the same computation and
  object but its own derivation, scope and derived authorization; without consent it gets nothing (B1B-M04).

### 3.7 Failure recovery

Every refusal carries one owned `CanonicalIngestError` code and never a location; an unexpected local failure becomes
`unexpected_failure` without its detail. Nothing unverified is ever linked, and pending objects are removed. Proven: FFmpeg non-zero
exit (a source truncated under the recipe → `process_failed`); a supervisor-killed timeout (`process_timeout`); an output past the byte
bound, which `-fs` lets FFmpeg write with exit 0, refused by the adapter's own bound (`output_invalid`); a cached object that fails its
probe (B1-23(d), `cache_corrupt` with the probe-failure message; for a fresh output the same branch reports `output_invalid`, which no
test drives); output bytes changed after verification (B1B-02, `output_invalid`); semantic mismatch (`verification_failed`, or `cache_corrupt` on a
hit); an occupied content name holding other bytes, left untouched (`publication_conflict`); two concurrent operations of one
computation, of which exactly one publishes and the other re-verifies (B1-21); tampered cache entries (B1-23, B1B-04); source changed or
disappeared (B1B-01, B1B-03, B1B-M02). The exported supervisor (`superviseCanonicalChild`, the accepted Batch-2B rule) and
`canonicalRunFailure` are driven by controlled stand-ins: never-started, non-zero, signalled, timed-out with and without close, errored
without close and overflowing runs are never evidence (B1B-S01).

## 4. Owner-media runtime wiring

### 4.1 The authority descriptor (`OWNER_MEDIA_AUTHORITY`)

The one authority now states its declared verified canonical derivatives and their lineage lifecycle. The `registration` (originals),
`scope`, `state`, `query` (full-byte re-verification at observation) and `discovery` entries are unchanged. New `derivatives` and
`lineage` entries were added, and the `eligibility` literal now reads
`creator_upload_origin_and_owner_supplied_or_declared_system_canonicalized_authorization_only`. The version stays `0.1.0`. The
implementation digest changes from `e154b61538988ed347210ced01fc4ea16a408500ca38a1511bd371edf28579c0` to
`0cd89b68e42aca92acdfba826dff4c1dfe471134506712f20188343cec0a2f37`. `OWNER_MEDIA_LIFECYCLE_AUTHORITY` (the permit binding literal) is
**unchanged**, and a derivative stays under the same lifecycle authority. The accepted tests that bind the descriptor were updated
RED-first: 3D-R01 (the eligibility literal) and B1A-O01 (the digest and the eligibility literal).

### 4.2 The observation's provenance: an additive variant, no version change

`OwnerMediaLifecycleObservation.provenance` is now `OwnerMediaObservedProvenanceSchema`, the union of the accepted original record
(`OwnerMediaProvenanceSchema`, unchanged and never widened) and B1A's `OwnerMediaDerivedProvenanceSchema` (`creator_upload`,
`system_canonicalized`, the root's asset, hash and size, `derivationId`, `recipeId`, the inherited basis). Every accepted observation keeps
its exact meaning, and a derived observation is never presented as owner-supplied. A new refinement refuses a derivative named as its own
root. Like any authority change, observations made before B1B name the earlier digest and are not accepted by the new binder.

### 4.3 The registry (`scripts/edit-render-owner-media-authority-local.ts`)

- **0.1.0** registrations read, register, observe and refuse exactly as before (B1B-L01; every 3D test unchanged and passing).
- **0.2.0**: (1) validate the registration (`ownerMediaCanonicalDeclarations`); (2) register and verify every declared original or root by
  the accepted path rule, through one held handle; (3) only then consider derivatives; (4) a derivative must point to an already registered
  root; (5) its bytes are resolved only from their content identity in `<canonical workspace>/.local-media/canonical-v0/objects/`, which is
  read and never created, link-free and exactly located; (6) they are re-hashed in full through one held handle; (7) they must be the
  derivation's output hash and size; (8) the derivation and derived authorization are revalidated against the registered root; (9) the
  store's computation record must hold exactly `canonicalComputationRecordOf(derivation)`. Only then is the derivative a registry entry.
- Step (9) closes registration-level forgery: a derivation with fabricated verification facts, every identity recomputed, refuses (B1B-L09).
  It is not a cryptographic attestation: a local actor who can write the private store can forge it, as with any local file.
- **Lifecycle:** root A and derivative B keep independent state. B's state is `effectiveDerivedLifecycle(A, B)`, computed at every query:
  a deletion request on either makes B unavailable, the earlier expiry governs, and B never outlives A (B1B-L06..L08). Each observation
  handle's re-query applies the same rule, so a root deleted after B was observed refuses at permit issuance and at execution start.
- **Observation:** a 0.1.0 registration reads provenance through the unchanged 1.0.0 check; a 0.2.0 one reads it by kind
  (`ownerMediaProvenanceKindOf`). The admitted bytes and authorization must be exactly the declared ones. For a derivative the lineage
  is revalidated: derived kind, exactly its registered root, derivation and recipe, and the root still the registered original carrying
  that authorization. B's own bytes are re-verified in full, the effective state is recorded, and A's bytes are not re-hashed (B1B-O01, O02).

## 5. Permit provenance (`packages/edit-render/authorize.ts`)

One import name and one call changed: the binder re-derives the admitted source's provenance with `ownerMediaProvenanceKindOf` instead
of the 1.0.0-only check, and compares it with the trusted observation as before. A 1.0.0 original yields exactly the accepted record
(B1B-P01). A derivative must match its admitted bytes, `system_canonicalized` authorization, root identity, `derivationId`, `recipeId` and
inherited basis (B1B-P02..P06). Permit ordering, freshness windows, the 60 s policy, claim, staging, media-grant and capability checks,
CAS, the render-before-permit rule and the binding literal are **unchanged**. A deleted, expired or stale root refuses at issuance before
any render, and nothing but a genuine permit starts a render (B1B-P07, P08, through the live boundary with a real pinned-runtime probe).

## 6. Workspace adapter registration

`scripts/audit-workspace.mjs` registers `scripts/media-ingest-local.ts` as `strict_spawn` with exactly `node:child_process` (spawn
only), `node:crypto`, `node:fs/promises`, `node:path` and `node:url`. It also registers the test-only generator
`tests/support/canonical-media-fixtures.ts` as a harness process file. The audit reports 18 adapters (was 17) and 6 harness process files
(was 5). Before registration the audit refused `Unregistered subprocess import in scripts/media-ingest-local.ts`, and the updated B2B-A1
literal was RED. A scratch run of 14 hostile variants of the adapter in an audit fixture (`15-audit-hostile-adapter.json`) refused every
one: exec, execFile and spawnSync imports, a renamed or namespace import, a shell, a missing literal `shell: false`, an inline command, an
indirect spawn, dynamic import, `node:https`, `node:perf_hooks`, `node:fs`, explicit `any`.

## 7. Tests

New (none existed before B1B; every one is RED on the B1A-accepted bytes, §8):

- `tests/media-ingest-media.integration.ts`, run by `npm run test:media`, generated media only:
  - B1B-M01: the exact template, run once.
  - B1-07, B1-08, B1-11 to B1-15, B1-20 to B1-24.
  - B1B-01 to B1B-04.
  - B1B-D01 and R01 (DIRECT and REFUSE create nothing).
  - B1B-M02 (the source disappears), M03 (consent and authorization), M04 (cache identity versus authorization identity), M05 (locations).
  - B1B-M06 (the method digests bind timing).
  - B1B-E01: a real canonical output registered beside its root, never outliving it.
- `tests/media-ingest-local.test.ts`, pure: B1B-S01 (supervision with stand-ins), B1B-S02 (the adapter's static boundary) and B1B-S03
  (every caller field read exactly once).
- `tests/owner-media-canonical.test.ts`, pure, opaque bytes and the structural chain: B1B-L01 to L10, O01, O02, D01, P01 to P06.
- `tests/owner-media-canonical-media.integration.ts`, live boundary with a real pinned-runtime probe: B1B-P07 and P08.
- Support:
  - `tests/support/canonical-media-fixtures.ts`: the test-only lavfi generator, plus an independent probe and independent listings.
  - `tests/support/owner-media-canonical.ts`: labelled structural fixtures.

Protected edits, each updated RED-first with the new accepted meaning:

- `tests/edit-real-footage.test.ts`: the 3D-R01 eligibility literal.
- `tests/owner-media-derived.test.ts`: the B1A-O01 digest and eligibility literal, and the title's "unchanged" wording.
- `tests/edit-render-audit.test.ts`: the B2B-A1 literal, 17 → 18 adapters.
- `tests/edit-review.test.ts`: R01's pin of `packages/edit-render/authorize.ts` (`43bb22d5…` → `c57accc5…`), updated last.

## 8. RED/GREEN history

Numbers are evidence files in the folder above. Every suite ran under `scripts/no-network.mjs` with the owner-ruled long-form `TEMP`.

1. **Stage 1** (`02`, `stage1/`): the accepted recipe proven (§2).
2. **RED, media** (`03`): a `git archive afaa5d6` tree plus an empty adapter skeleton plus the new media test files. 25/25 fail on absent
   behaviour (`canonicalizeLocalMedia` / `canonicalListingDigest` not defined).
3. **GREEN 1** (`04`): 22/25. Three findings:
   - (a) **production**: the adapter's probe requested `profile`. The renderer's strict probe vocabulary rejects "High 4:4:4
     Predictive", so a 4:4:4 source became REFUSE `probe_invalid` instead of the classifier's own `renderer_nonconforming`. `profile`,
     which the classifier never reads, was dropped from the query.
   - (b) **test-only**: the byte-bound case expected `verification_failed`. `-fs` is soft, and the adapter's own bound refuses the
     output as `output_invalid`; the expectation was corrected.
   - (c) B1B-E01 needs the registry (step 7).
   - The side-data invariant was then refined to "none on video, exactly the source's elsewhere, per stream".
4. **GREEN 2** (`05`): 24/25 (E01 pending). **Supervisor export and S01, S02** (`06`): 2/2.
5. **RED, lifecycle** (`07`, `07b`):
   - The first run (`07`) is not evidence. The structural fixtures were dated after the accepted analyzer's test clock, which refuses
     an authorization added after its clock, so every chain-based test failed while building fixtures. L09 and L10 passed vacuously,
     because every 0.2.0 registration was then refused.
   - Fixture dates were corrected and positive controls were added to L09 and L10 (test-only).
   - `07b`: 1 pass (the L01 invariant) and 18 fail on absent behaviour (`07b-red-lifecycle-reasons.json`).
6. **RED, descriptor pins** (`08`): 3D-R01 and B1A-O01 were updated first; 2/2 RED on the unchanged production.
7. **Owner-media wiring, GREEN** (`09`): 62/67. Every lifecycle, observation and descriptor test, P01, 3D-R01, B1A-O01 and both
   files' other tests pass. The 5 failures are the **permit RED**: P02-P06 are refused by the unchanged 1.0.0-only check in
   `authorize.ts`.
8. **Permit change, GREEN** (`10`): 19/19 pure; media 25/25.
9. **P07, P08** (`11`): 2/2. These were written after the implementation; their RED is in the final RED (item 13).
10. **Audit** (`12`, `13`):
    - The unchanged audit refused `Unregistered subprocess import in scripts/media-ingest-local.ts`.
    - B2B-A1 was updated first and was RED.
    - After registration: the audit passes, and the audit tests pass 10/10.
    - Hostile variants: 14/14 refused (`15`).
11. **Focused regressions on near-final bytes** (`14-*`): b1b 21/21, b1a 87/87, owner3d 24/24, runtime2a 339/339, editorial3e 54/54,
    footage 240/240.
12. **Hardening from the pre-final self-review**:
    - Every caller field of the request is read exactly once: the clock function is read once, and the purposes array and the limits
      object are copied.
    - Any unexpected local failure becomes the owned `unexpected_failure` code, with no location in its message.
    - Tests were added: L09(d), another project's derivation of the same bytes; P03, a derivative named as its own root;
      B1B-01(c) and B1B-02(b), bytes changed after a probe; S03, read-once; B1-23(d), a malformed cached object that fails its probe
      (the output probe-failure branch; by review, no earlier test reached it). Its assertion pins the probe-failure message, so it
      cannot pass by an earlier check.
    - **Process deviation, disclosed.** The read-once change was applied before S03 existed. Its RED (`23`) runs S03 on the exact
      reconstructed pre-hardening lines in a private `dist/` copy: RED (`clock.now`, `allowedPurposes` and `limits` each read twice),
      then GREEN on the final adapter.
    - The `unexpected_failure` conversion has no deterministic trigger and is **not exercised**. It only replaces the type and message
      of an otherwise unowned failure.
13. **Final RED on the final test bytes** (`19-final-red-*`): the `git archive afaa5d6` tree plus the adapter skeleton plus every new
    and protected-edited test file, byte-identical to the working tree (`19-final-red-tree.txt`).
    - Pure suites: 122 tests. 98 pass; every one is an accepted test or the L01 invariant. 24 fail, all on absent behaviour: every
      new B1B test except L01, plus exactly the four protected edits (3D-R01, B1A-O01, B2B-A1, R01).
    - Media suites: 27/27 fail.
    - Run `18` was an earlier, otherwise identical run on earlier test bytes; it is kept.
    - S03 and B1-23(d) were added after `19`, and B1-23(d)'s message assertion after `24`. The final-bytes RED is `27-final-red-*`
      (its tree is byte-identical to the final test files): pure 123 (98 pass, 25 fail, now with S03, the same failing set as `24`),
      media 27/27 fail (§9). `24-final-red-*` is kept.
14. **Mutation check** (`17`): 12/12 mutants killed, each by its expected test:
    - registry: record check, root-ignoring lifecycle, original-only observation;
    - observation: derived variant, own-root refinement;
    - permit: original-only provenance, unchecked provenance;
    - adapter: timing-free listing digest, consent, source bytes, decoded-frame invariant, store in the source's directory.
    - The adapter's other checks are layered (every next reader re-verifies, and so do the final reconfirmation and the accepted
      builder), so they were not mutated singly.
15. **Production receipt** (`16`), §9. **Final GREEN** (`20-*`, `24-*`, `27-*`), the checks (`21-*`, `24-*`, `27-*`) and the pin sweeps
    (`22`, `27`): §9.

## 9. Results

The production bytes are final from `19-final-build.log`. No later build changed the emitted JavaScript of any production file
(`24-emitted-production-identity.txt`, `27-emitted-production-identity.txt`):

- `24-final2-build.log` adds B1B-S03 and B1-23(d), and restores one space in a type alias of `owner-media.ts`.
- `27-final3-build.log` adds only B1-23(d)'s probe-failure message assertion. That build spanned a connected-standby period (Windows
  Kernel-Power 506 at 16:54, 507 at 18:33 local time) and exited 0.

All suites ran under `scripts/no-network.mjs` with the long-form `TEMP`, focused files at concurrency 2 and media at concurrency 1.

| gate | result | evidence |
|---|---|---|
| Pinned FFmpeg / ffprobe verified (SHA-256, size, version) | PASS | `02`, `stage1/run*/stage1-report.json` |
| N1 recipe empirically proven, unchanged | PASS: 3/3 fixtures, every invariant, 2-run and cross-process determinism | `02` |
| Production adapter receipt (real path, generated media) | 3 × NORMALIZE_N1 → DIRECT, SAR 1:1, byte-identical in 2 fresh stores, then a cache hit; DIRECT creates no store | `16` |
| B1B media (`media-ingest-media`, `owner-media-canonical-media`) | **27/27 PASS** | `27-final3-b1bmedia.log` (`24-final2-b1bmedia.log`: 27/27, before B1-23(d)'s message assertion; `20-final-b1bmedia.log`: 27/27, before B1-23(d)) |
| B1B pure (`media-ingest-local`, `owner-media-canonical`) | **22/22 PASS** (21 in `20-final-b1b`, before S03 existed) | `24-final2-b1b.log` |
| Final RED on the final test bytes (baseline tree) | pure 123: 98 pass / 25 fail; media 27/27 fail; every failure is absent behaviour | `27-final-red-*` (`24-final-red-*`: the same, before B1-23(d)'s message assertion; `19-final-red-*`: 122: 98 / 24, before S03) |
| Mutation check | **12/12 killed** | `17` |
| S03 late-fix RED / GREEN | RED on the reconstructed pre-hardening lines; GREEN on the final adapter | `23` |
| B1A (`media-ingest`, `owner-media-derived`) | **87/87 PASS** | `20-final-b1a.log` |
| 3D owner-media (`edit-real-footage`, `-lifecycle`, `-harness`, `-r02`) | **24/24 PASS** | `20-final-owner3d.log` |
| Render pins (`edit-render` B96, `edit-review` R01, `edit-render-audit` B2B-A1..A7) | **96/96 PASS** | `20-final-renderpins.log` |
| 2A runtime, execution, graph and repair | **339/339 PASS** | `20-final-runtime2a.log` |
| 3E-A and 3C editorial (`edit-editorial-validation` A01-A15 and parity, 3C pure) | **54/54 PASS** | `20-final-editorial3e.log` |
| Footage authorization, analyzer contracts and consumers (12 files) | **240/240 PASS** | `20-final-footage.log` |
| Batch-2B actual media (`edit-render-media.integration`, pinned FFmpeg, fixture authority) | **34/34 PASS** | `20-final-media2b.log` |
| 3E-A F2-F6 on synthetic media and the real clock (`edit-editorial-freshness-media.integration`) | **3/3 PASS** | `24-final2-freshness3e.log` |
| typecheck | PASS | `21-final-typecheck.log`, `24-final2-typecheck.log`, `27-final3-typecheck.log` |
| build | PASS | `19-final-build.log`, `24-final2-build.log`, `27-final3-build.log` |
| schema check | PASS: 33/33 verified, no schema changed | `21-final-schemas-check.log`, `27-final3-schemas-check.log` |
| workspace audit | PASS: 130 application files, 18 adapters, 6 harness process files | `21-final-workspace-audit.log`, `27-final3-workspace-audit.log` (identical output) |
| hostile audit variants of the new adapter | 14/14 refused | `15` |
| `git diff --check`; new files checked once staged | PASS | `21-final-diff-check.log`, `27-final3-diff-check.log`, `28-staged-diff-check.log` |
| pin sweep (`[path, sha256]` pairs in `tests/`) | 135 pins, 0 stale | `22`, `27-pin-sweep.json` |

- Dependencies and lockfile: **unchanged**. No owner footage, model, network, Python or full safe suite was run, and `npm run verify`
  was not run (focused gates per the B1B order).
- The 60 s policy, the permit's claim, freshness and CAS order, and the permit binding literal: **unchanged** (§5).

## 10. What did not change

`git diff` against `afaa5d6` changes only the files in §13. Unchanged, among others: `packages/media-ingest/*` (the accepted recipe,
template, semantics, classifier and derivation contract), `packages/footage-analyzer/protocol.ts` and every interchange schema,
`packages/edit-render/{probe,records,program,ffmpeg,semantics,receipts,localized,qc,common,index}.ts`, `scripts/edit-render-local.ts` and
every other adapter, `packages/edit-execution/*`, `packages/edit-runtime/*`, `packages/edit-graph/*`, `packages/edit-editorial/*`,
`packages/world-model/*`, `packages/planning/*`, `python/*`, `package.json`, `package-lock.json`, `tsconfig.json` and `.gitignore`.
Consequently the renderer, the staged-input conformance rule, the permit order, the 60 s freshness policy, the claim, staging,
media-grant, capability and CAS checks, the render-before-permit rule and the permit binding literal are byte-identical or unchanged in
meaning, and no dependency or lockfile changed.

## 11. Known limitations after B1B

- **No real derived source has been rendered end to end.** B1B proves byte canonicalization, canonical identity, the registry, the
  derived lifecycle and the permit's provenance logic. A canonical source needs its own FootageAnalysis (fresh frozen-model inference, 3E-C);
  B1B ran no SigLIP or TransNetV2, did not fabricate or relabel any analysis, and claims no real canonical FootageAnalysis.
- **Owner footage was not run.** Whether the five SAR-refused owner sources classify NORMALIZE_N1 is unknown: N1 also refuses any frame
  side data, and ordinary x264 encodes carry user-data SEI as frame side data (Stage-1 finding 5).
- **Synthetic scope.** The recipe is proven on 160x90 H.264 yuv420p without B-frames, 30 fps, two seconds, with MP4 or MOV containers and
  PCM or AAC stereo audio. B-frames, other rates, larger frames, edit-listed video and long sources were not exercised.
- **Cost.** Probe-to-bytes binding re-hashes the source in full before and after each of its four children and at three
  re-verifications, and re-hashes the pinned binary (about 100 MB) before every spawn. On large real sources this is slow; not measured.
- **The computation record is local evidence, not an attestation.** It blocks registration-level forgery of a derivation, not a local
  actor who can write the private store (§4.3).
- **The 0° display-matrix limitation is unchanged.** The renderer's DIRECT rule reads only a display matrix's angle, so a 1:1 source whose
  matrix reports 0° but encodes a mirror or flip classifies DIRECT. N1 itself refuses all side data. Recorded for B2; not solved here.
- **Earlier limitations stay open.** Real-owner-footage revision 1 → 2 freshness, distinct physical multi-source execution, broad
  ingest, VFR normalization, non-square SAR resampling, rotation, HDR, 10-bit, HEVC, audio resampling and professional editing quality:
  **NOT VERIFIED / NOT IMPLEMENTED**.

## 12. Research B2 needs

- The 0° display-matrix mirror and flip case under the DIRECT rule (§11).
- Frame side data N1 refuses today (x264 user-data SEI and any SEI real cameras emit), and which kinds are safe to carry or strip.
- Explicit non-square SAR resampling, rotation baking, VFR, B-frame and edit-list sources, HDR and 10-bit, HEVC, audio resampling.
- Verification cost on long, high-resolution sources (hashing and decoding budgets).

## 13. Files

| file | change | SHA-256 |
|---|---|---|
| `scripts/media-ingest-local.ts` | new: the one canonical-ingest adapter (strict_spawn) | `1f8a833ec745aad1399182f96ed501c1d324cea2f5a6b59637f99ffafec6d2c1` |
| `packages/edit-render/owner-media.ts` | protected: descriptor, observed-provenance union, canonical store names and computation record | `c7dae3aba73ba660d59f9707b0ff9a8ab6487b4ece928dcd1791fd5d18fbdaff` |
| `scripts/edit-render-owner-media-authority-local.ts` | protected: 0.2.0 registration, derivatives from the store, effective lifecycle, lineage at observation | `a1d0ebf485d5663119ce9c049ee76991a36c74c114e001681af4824cc6886993` |
| `packages/edit-render/authorize.ts` | protected: provenance re-derived by kind (one import, one call) | `c57accc5ff585ab85f833942b2a017c05ba0c903b24877d4e017905390da37ca` |
| `scripts/audit-workspace.mjs` | workspace: the 18th adapter and the 6th harness process file | `8f8d12c04c1791fab02fe674cd3bbdaf26aa43508449e3f2da72665560c3418b` |
| `tests/media-ingest-media.integration.ts` | new: B1B media tests | `3580b750c2f43a2b6e2253a65e8e063c5402dd22d8b234153a14ec41b746f62b` |
| `tests/media-ingest-local.test.ts` | new: B1B-S01 to S03 | `cb58511b5b68365120d39f0cf95222e5b7e6cf625bdd2c4a684dda3f22ce59ec` |
| `tests/owner-media-canonical.test.ts` | new: B1B-L01 to L10, O01, O02, D01, P01 to P06 | `4066d8b3a5edfed6dbacb37ec13ca5c55c271c118e4e13d62239a8e74eb9e90a` |
| `tests/owner-media-canonical-media.integration.ts` | new: B1B-P07, P08 (live boundary) | `7b88368496a2de7023f11358e8f1312ca8a86e0f8447dc413f79334b1eab2527` |
| `tests/support/canonical-media-fixtures.ts` | new: test-only lavfi generator and independent probe/listings | `b1067025b31058be308307b9b2134f12d2c57590f20f35a044d9b15cafe70cdf` |
| `tests/support/owner-media-canonical.ts` | new: labelled structural fixtures | `39bd6457a13398ed1aed8bbdd5bcfbc5d7d4761d4b1df95ed380920b4f86d5e4` |
| `tests/edit-real-footage.test.ts` | protected: 3D-R01 eligibility literal | `f51be58cbe13c119cdee34bba4ce30175d9a1d77cdefb56310045d102ee93b8b` |
| `tests/owner-media-derived.test.ts` | protected: B1A-O01 digest and eligibility literal | `5ba0142d153572f8ebe0b8aa434d3845bd1effeaf22d29db4306c00327559ea4` |
| `tests/edit-render-audit.test.ts` | protected: B2B-A1 18 adapters | `df9550d5d06481c985921e86a70887cb857de693873fb3779bcef5bbb43c0d6d` |
| `tests/edit-review.test.ts` | protected: R01 pin of authorize.ts | `f11dd597600f19339e290fb3508b3ed7c9cb4b6456c463d85006c4f89ea4c3bf` |
| this record and `docs/CURRENT_PHASE.md` | documentation | not hashed into themselves |

No dependency, lockfile, configuration, schema, interchange schema, accepted package outside `owner-media.ts` and `authorize.ts`, or other
adapter changed. The B1A files (`packages/media-ingest/*`, `packages/footage-analyzer/protocol.ts`) are byte-identical to `2b2b49e`.

## 14. Status

3E-B1B: **IMPLEMENTED — PUSHED FOR OWNER REVIEW** (commit `feat(gate7): execute canonical media normalization` on
`phase/5-gate7-3e-production-hardening`; `main` not modified).

- Real derived source rendered end to end: **NOT CLAIMED** (3E-C).
- Owner footage canonicalized: **NO**.
- 3E-C: **NOT STARTED** and not authorized by this batch. B2: **NOT STARTED**.
- Gate 7 overall: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
