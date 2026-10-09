# Phase 5 / Gate 7 / Batch 3E-B2-B2 — production lossless re-encode

Date: 2026-10-08. Status: **BLOCKED at Checkpoint B — `3E_B2_B2_CHROMA_SEMANTICS_DECISION_REQUIRED`**.
No B2-B2 implementation commit or push. Production re-encode execution remains unwired. Gate 7 remains incomplete.

## Baseline and acceptance checkpoint

| Check | Fresh result |
| --- | --- |
| Branch | `phase/5-gate7-3e-production-hardening` |
| Initial local / tracking / live branch HEAD | `059754f47fb83ac1936824c4d9cfa7b725ea232b` |
| Initial main / origin/main / live main | `4f85b559c7eff2c24e221011f3ee1dd1466a111d` |
| Initial relation to main | 11 ahead / 0 behind |
| Initial tracked worktree / index / diff check | Clean / empty / PASS |
| Initial untracked files | Exactly the 18 owner-authorized historical artifacts; read-only SHA-256/size snapshot retained |
| B2-B1 owner-acceptance docs commit | `61b4bb1b8f9ea3efb57524fe76e107018fb2a468` |
| Acceptance publication | Local = tracking = live branch verified; main unchanged; 12 ahead / 0 behind |

Checkpoint A is complete. The separate acceptance commit changes only CURRENT_PHASE and the
[B2-B1 record](phase-5-gate-7-batch-3e-b2b1-lossless-canonical-reencode.md#owner-acceptance-2026-10-08).
It records **3E-B2-B1 OWNER-ACCEPTED** at the initial HEAD, for the pure contracts and generated-media research scope only.
No earlier failure, receipt or limitation was rewritten. No production or test file was changed by that checkpoint.

## Work attempted and unchanged production scope

Checkpoint B inspected the frozen re-encode plan/profile/0.3 derivation, strict Facts v1 schema, trusted held-byte fact extractor,
current process/resource conventions, compiler/publication/cache entry points, store naming, and owner registration/lifecycle seams.
The production APIs remain `canonicalizeLocalMedia`, `executePlan`, and `createOwnerMediaLifecycleAuthority`.

Fresh build: `npm.cmd run build` PASS, on the unchanged accepted production/test bytes. A bounded, generated-only instrument then
tested the mandatory chroma-siting precondition using the pinned runtime and the existing B2-B1 research encoder/reference.
It is **research evidence**, not execution through a new production canonicalizer or owner-media authority.

No production implementation was started after the chroma blocker was established. DIRECT, legacy N1 and typed exact-remux routes,
old profile/plan/derivation identities, the fixed B2-B1 profile/plan/0.3 contract, owner registration, renderer, execution permits and
60-second freshness semantics remain unchanged. No media object or computation record was published and no derived authorization
was issued. Source changes in the corpus are made only while constructing new generated fixture copies; every consumed original
fixture is checked unchanged before/after its operation. No owner footage, model, download or dependency is used.

## Evidence and exact experiment

`E = .local-runs/phase5-gate7/batch3e-b2b2-20261008/` (ignored). No generated media or local evidence enters Git.

| Artifact | SHA-256 / outcome |
| --- | --- |
| `chroma-preflight-1.mjs` | `68ed4302c29f1bc2437903c5e4172ff04f2374acfb79aa18f5566d580509d981` |
| `chroma-preflight-1-receipt.json` | `cb40527f2ac03bca7af09d1aa27ef8df86ff2672ff545751162b31eabe6788a8` |
| `chroma-preflight-1.log` | `a7a26b46e9b41876a0b90cbf1a992334f942fd2a8572a98909354e51640ffa20` |
| Instrument command | `node --import ./scripts/no-network.mjs .local-runs/phase5-gate7/batch3e-b2b2-20261008/chroma-preflight-1.mjs` |
| Final assertion | **RED, exit 1**: six outputs have zero sample error but fail the independent siting-position invariant |
| `preservation-final.json` | All 308 tracked production/test/schema/configuration files match the initial snapshot; all 18 historical files match hash and size; final local/tracking/live heads match |

The instrument generates three asymmetric 64x48 yuv420p frames (0.1 seconds at 30 fps), with nonconstant distinct Y/U/V planes.
The generated HEVC source encoder's QP 25 constructs input footage; it is not a canonical encode. Six new stream-copy fixture variants
declare each H.265 chroma-location type 0–5 through `hevc_metadata`. Single-thread pinned ffprobe observes stream and every decoded
frame; independent pinned `trace_headers` retains the VUI flag and top/bottom-field values. No pixel conversion is applied.

For left and center siting, the unchanged fixed B2-B1 research compiler encodes identity plus all seven D4 transforms. For the other
four declarations, it encodes identity. All **20** outputs pass the B2-B1 fresh exact Y/U/V oracle, fresh geometry/color/timing/profile
checks and pure 0.3 builder. The independent siting-position check passes **14/20** and fails **6/20**. This intentional failing final
assertion preserves the evidence; it is not a green production gate.

Every research canonical output uses the fixed libx264 QP 0 / medium / high444 / +yuv420p configuration: two encoder threads, one
decoder/filter/lookahead thread, no sliced threading, no B-frames, GOP 30, scene-cut 0. No new canonical argument or filter was added.
There is no scaling, range conversion, color conversion, audio encoding or quality fallback. Audio is absent in this corpus.

The extra observation children rehash the pinned executable before each spawn, use `shell:false`, a minimal environment, held read-only
source descriptors, fd-only input/output and exclusive new outputs; they impose 30-second process bounds, 2-second termination grace,
4-MiB stdout/stderr/output ceilings and output-size monitoring. The existing research encoder retains its documented finite research
bounds. These tiny fixtures use the existing all-frames test oracle; **they do not prove a production streaming memory bound**.

## Pinned runtime observations

Windows x64, Node 24.15.0; FFmpeg/ffprobe `9.0.1-essentials_build-www.gyan.dev`.

| Tool | SHA-256 | Bytes |
| --- | --- | ---: |
| ffmpeg | `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3` | 102856192 |
| ffprobe | `19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f` | 102652416 |

Pinned `-h full` lists `left`, `center`, `topleft`, `top`, `bottomleft`, `bottom`, and unspecified/unknown. Pinned h264_metadata and
hevc_metadata help constrain chroma_sample_loc_type to 0–5 (or -1 to leave it unchanged). The installed bitstream-filter documentation
describes this as chroma sample location, referencing the H.264/H.265 VUI definitions. No network research is performed.

The six explicitly declared variants are freshly observed as their respective locations on the stream and all three frames. Their
trusted **Facts v1 digests are identical**:
`c0fe728c6a088971ec93bddd9dd1a3fe63b43021ecac3cab81604f52daed5b5e`.
Their identity-transform plan IDs are likewise identical:
`canonical_reencode_plan_v1_1f683e6694de7773b8d8ad69d288a456ad0717f05235d934531abad4c304b472`.
This is an omitted semantic distinction, **not a computation-hash collision**: exact source hashes still distinguish computations.

The fixed encoder preserves the input's declared chroma location even when its D4 filters permute the chroma planes. It does not update
that declaration to match transformed chroma positions. Center remains center under all seven permutations and passes the position
check; identity preserves each of the six declarations. Left with vertical mirror also passes this finite test.

## Independent position invariant and counterexample

Chroma positions are interpreted on the luma sample grid, separately from byte equality. In half-luma units, a 4:2:0 sample `(u,v)`
with siting offset `(sx,sy)` occupies `(4u+sx,4v+sy)`. Left is `(0,1)`; center is `(1,1)`; top-left `(0,0)`; top `(1,0)`;
bottom-left `(0,2)`; bottom `(1,2)`. Apply the same full-resolution D4 coordinate transformation to that position, then subtract the
position of the independently permuted output chroma-plane index. This gives the required output siting without changing any sample.

For horizontal mirror, for example, the required horizontal offset is `2-sx`: source position `4u+sx` becomes
`2(W-1)-(4u+sx)`, while the output chroma index is `W/2-1-u`. A left-sited sample therefore needs right siting `(2,1)`, even though
the mirrored U/V arrays have exactly the expected bytes. Right siting is outside the six locations exposed by this pinned H.264 path.
Relabelling it as left changes interpretation; shifting/interpolating samples violates the accepted exact-sample policy.

| Left-sited source transform | Required offset (half-luma units) | Required location | Observed output | Exact samples | Siting check |
| --- | --- | --- | --- | --- | --- |
| rotate_90_ccw | `(1,2)` | bottom | left | zero errors | FAIL |
| rotate_180 | `(2,1)` | right, outside observed H.264 vocabulary | left | zero errors | FAIL |
| rotate_90_cw | `(1,0)` | top | left | zero errors | FAIL |
| mirror_horizontal | `(2,1)` | right, outside observed H.264 vocabulary | left | zero errors | FAIL |
| mirror_vertical | `(0,1)` | left | left | zero errors | PASS |
| transpose | `(1,0)` | top | left | zero errors | FAIL |
| transverse | `(1,2)` | bottom | left | zero errors | FAIL |

This check establishes a mathematical metadata/position conflict on generated bytes. It does not claim a human viewing study,
hardware playback proof or general color-rendering equivalence. It falsifies the assumption that decoded sample equality alone covers
the complete 4:2:0 display interpretation.

## Accepted-contract seam and required owner decision

`CanonicalMediaFacts 1.0.0` has no chroma-location observation. Its strict video/color schemas reject an added chromaLocation key;
`factsOf` does not request it and its SPS observer retains SAR/SEI but not chroma-location declarations. Profile v1, the frozen
ReencodePlan 1.0.0 and Derivation 0.3 likewise have no siting safety rule or evidence field. A pure 0.3 derivation can validate the
six freshly measured unsafe outputs above because sample/color/timing checks alone cannot express this missing invariant.

The new production authority requires a trusted, byte-bound observation of the declaration, decoded-frame interpretation and D4
position mapping, together with an explicit refusal policy. An unrecorded internal guard could reject observed mismatches, but would
leave the accepted 0.3 evidence unable to state or replay that mandatory semantic precondition. Adding metadata-changing output
arguments would also require reconciliation with the frozen fixed encode/computation semantics. Neither is silently selected here.

**Smallest owner decision:** authorize and specify an additive chroma-safety evidence/refusal contract and its binding to the frozen
re-encode derivation/computation. Decide whether an identity-bound companion internal evidence contract is sufficient, or a new version
of the accepted re-encode facts/plan/derivation is required. Preserve Profile v1 and v0.1/v0.2 identities. A bounded initial policy can
admit only cases whose independently required siting equals the pinned emitted siting and refuse unknown, conflicting, varying or
unrepresentable cases. This record proposes no new encoder setting, conversion, loss threshold or public-schema change.

The current production route still defers HEVC/D4. No unsafe preflight output becomes a trusted production derivative, registration,
cache object, computation record or authorization. No accepted contract is changed to make the experiment green.

## Gates not reached and remaining scope

- Checkpoint A: complete, with the separate pushed acceptance documentation commit.
- Checkpoint B: **BLOCKED** on the demonstrated mandatory chroma semantics gap.
- Checkpoints C–I: **NOT STARTED**. No production compiler, streaming verifier, bounded lossless ingest, 0.3 cache/publication,
  authorization/lifecycle integration or generated derived-source render/QC proof is claimed.
- Build: PASS on unchanged accepted bytes; the generated chroma precondition: **RED**, preserved above. Diff/preservation checks
  PASS: 308/308 tracked production/test/schema/configuration files and 18/18 historical artifacts unchanged; index empty. The full
  affected regression, typecheck, schema check and workspace audit were not run as B2-B2 gates.
- N1/B2-A1/B2-A2/B2-B1/B1A/B1B identities and source bytes remain frozen; their historical passing gates are not relabelled as fresh.
- Streaming memory, long-form resources, cache tampering/races, owner lifecycle and render proof remain unverified for B2-B2.
- No fresh 1080p/4K performance or production throughput measurement. The short B2-B1 historical measurements retain their limits.
- Container naming is unchanged (`.mp4` object names, ISO BMFF payload); the existing A2 MOV/PCM research does not supply a new B2-B2
  derived-source render proof. No container or renderer compatibility gate is advanced by this stop.

Only CURRENT_PHASE and this new phase record remain uncommitted for the B2-B2 stop. The separate B2-B1 acceptance is already pushed.
No B2-B2 commit is permitted while the required gate remains unresolved. No owner acceptance is claimed for B2-B2.

3E-C remains **NOT STARTED, NOT AUTHORIZED**: separately authorized owner-footage canonicalization/analysis, real derived-source
editing/rendering, multi-revision freshness and distinct physical multi-source evidence, subject to completed B2-B2 and its owner review.
Phase 6 remains **NOT STARTED, NOT AUTHORIZED**. No Director, deployment, merge or later-phase implementation.

## Checkpoint B chroma-safety continuation (2026-10-08)

**Status: CHROMA SAFETY CONTRACT IMPLEMENTED; OWNER REVIEW PENDING. B2-B2 is not complete.**
The original STOP record above and the 20-result RED receipt remain historical evidence, unchanged. The owner authorized this
narrow correction after that stop, explicitly withholding continuation of Checkpoints C-I pending the next owner review.

### Reconciled baseline and scope

Local, tracking and live branch started at `61b4bb1b8f9ea3efb57524fe76e107018fb2a468`, the separately pushed B2-B1 acceptance
documentation commit. Accepted B2-B1 implementation remains `059754f47fb83ac1936824c4d9cfa7b725ea232b`; main remains
`4f85b559c7eff2c24e221011f3ee1dd1466a111d`. Baseline relation: 12 ahead / 0 behind.
The existing unstaged CURRENT_PHASE change, new stop record, ignored evidence and 18 historical artifacts were preserved.
Only the changes listed below are authorized by this continuation:

| File | Narrow change |
| --- | --- |
| `packages/media-ingest/chroma.ts` | Pure siting coordinates, observations, conservative decision and mandatory new plan/derivation envelopes |
| `scripts/media-ingest-local.ts` | One import and an appended read-only held-byte chroma observer/admission witness |
| `tests/media-ingest-chroma.test.ts` | Independent position oracle, strict contracts, hostile joins and frozen behavior checks |
| `tests/media-ingest-chroma-media.integration.ts` | Generated-only measured source/output, exact pixels, carrier agreement and refusals |
| `tests/support/canonical-reencode-media.ts` | Appended closed, stream-copy fixture declaration helper; old encoder/decoder unchanged |
| `tests/support/canonical-plan-media.ts` | Appended tiny new-copy unknown/malformed container fixture helper |
| `tests/media-ingest.test.ts` | Add the pure chroma module to the exact inventory under the unchanged purity rules |
| `tests/media-ingest-reencode.test.ts` | Keep the old runtime SHA pin by removing exactly the authorized import/append before hashing |
| `docs/CURRENT_PHASE.md`, this record | Current ruling and append-only continuation evidence |

Facts 1.0.0, Profile v1, CanonicalizationPlan 1.0.0, ReencodePlan 1.0.0 and Derivations 0.1/0.2/0.3 are unchanged.
All old identity domains/parsers and the fixed encoder ID remain unchanged. Existing renderer/permit/freshness, owner-media,
store and cache contracts are untouched. DIRECT and exact-remux execution remain exactly the accepted implementation.
The new observer creates no canonical store or output, executes no video encode and issues no derived authorization.

### Raw evidence and effective interpretation

`CanonicalChromaObservation 1.0.0` binds exact content-addressed source hash/size, the complete original Facts v1 digest,
pinned observation method, codec/stream index, container track join and these separate carriers:

- The held ISO BMFF video sample entry: codec configuration and every child box name, length and payload SHA-256.
  Recognized children are the codec's single `avcC` or `hvcC`, `pasp`, `colr`, `btrt` and progressive `fiel` bytes (1,0).
  Unknown children are retained and REFUSE, including the generated `cloc` counterexample.
  `colr` contains no siting value in these measured fixtures. Raw nclx/nclc color declarations remain recorded; malformed,
  duplicate, unrecognized or contradictory tags refuse. nclx reserved bits must be zero. No container precedence is used to
  erase a conflicting interpretation carrier.
- Pinned `trace_headers` over the complete copied video stream: every observed SPS, chroma_format_idc, H.264 scan flag,
  VUI presence, chroma-location presence and raw top/bottom-field types. No omitted value is filled from a decoder label.
- Pinned single-thread ffprobe: stream chroma label and every decoded presentation-index/PTS/chroma label.
  The frame list must match the original measured timeline exactly. Missing, changing or contradictory reports fail closed.

All six explicit codepoints 0-5 were freshly observed for both H.264 and HEVC as left, center, topleft, top, bottomleft and bottom.
Source left fixtures explicitly carry flag 1/type 0; source center fixtures flag 1/type 1. The unchanged fixed libx264 output
preserves the reported label, but **left output omits the location flag**. Center output explicitly carries flag 1/type 1 on
every observed SPS. FFprobe also reports left for both tested sources with absent location signaling.

A reported left label is therefore **not** treated as an explicit declaration. No complete source-specific normative default
proof was established from the allowed local evidence. The alpha records `codec_default_not_established`, never substitutes
left or center for absence, and DEFERs. An incomplete/malformed raw SPS observation that cannot form the strict observation
record is an owned `probe_invalid` refusal; no implicit chroma-format or scan default is supplied.

The evidence method is `canonical_chroma_exact_bytes_v1`: pinned tools from the original stop table, all SPS plus all decoded
presentation labels and the held sample-entry inventory. It is an internal observation addition, not a changed Facts v1.
The effective interpretation for an admitted source is explicit type 1, agreeing center reports on the stream/every frame,
progressive yuv420p and no contradictory container carrier. No general camera or hardware interpretation is inferred.

### Independent geometry and alpha policy

In half-luma units a chroma-plane sample (u,v) occupies (4u+x,4v+y). Source positions are left=(0,1), center=(1,1),
topleft=(0,0), top=(1,0), bottomleft=(0,2), bottom=(1,2). The pure mapping is independent of FFmpeg:

| D4 element | Required destination offset | Left example |
| --- | --- | --- |
| identity | (x,y) | (0,1) left |
| rotate_90_ccw | (y,2-x) | (1,2) bottom |
| rotate_180 | (2-x,2-y) | (2,1) unrepresentable right |
| rotate_90_cw | (2-y,x) | (1,0) top |
| mirror_horizontal | (2-x,y) | (2,1) unrepresentable right |
| mirror_vertical | (x,2-y) | (0,1) left |
| transpose | (y,x) | (1,0) top |
| transverse | (2-y,2-x) | (1,2) bottom |

Tests verify all six positions for all eight elements and use an independent complete luma-grid oracle on a 14x10 asymmetric
tagged chroma plane, locating the sample after the accepted independent plane permutation. This detects horizontal/vertical
placement errors separately from sample values. The media corpus uses distinct, nonconstant Y/U/V patterns.

| Case, after all old profile/sample findings pass | Alpha result |
| --- | --- |
| Explicit center HEVC identity; explicit center H.264/HEVC with any of seven D4 elements | Eligible only with freshly agreeing carriers; output must explicitly remain center and pass full exact samples |
| H.264 identity / existing exact-remux cases | Existing authority; no re-encode plan or admission witness |
| Explicit left rotations, horizontal mirror, transpose, transverse | DEFER: required position is unrepresentable or differs from unchanged encoder signaling |
| Explicit left HEVC identity or left vertical mirror | DEFER: invariant position, but fixed H.264 type-zero output default remains unproven |
| Other four observed siting modes | DEFER: unverified alpha combination, differing fixed signaling or unrepresentable destination |
| Omitted/default/unknown/unspecified reports preventing interpretation | DEFER; no default assumption |
| Conflicting SPS/fields/stream/frame reports, malformed or unknown carrier, missing frame/PTS, stale byte/facts/method joins | REFUSE |
| Unexpected output siting or nonzero sample error | Verification failure, no valid new derivation |

The new planner first replays the frozen B2-B1 planner against complete original facts. It preserves every old DEFER/REFUSE
finding and never executes a supported subset. Center admission is conditional on these exact byte observations, not a universal
acceptance based on fixture labels. No output encoder setting, chroma relocation/resampling, pixel conversion, range conversion,
color conversion, audio encoding or quality fallback is introduced.

### Mandatory additive versioning and trust boundary

- `CanonicalChromaObservation 1.0.0`: `canonical_chroma_observation_v1`.
- `CanonicalChromaAdmission 1.0.0`: `canonical_chroma_admission_v1`; binds policy digest, source observation, exact transform,
  source/required positions, outcome/reason and expected unchanged output declaration.
- `CanonicalReencodePlan 1.1.0`: `canonical_reencode_plan_v2`; mandatory complete byte identity, original facts, chroma observation,
  unchanged nested sample plan 1.0.0, successful replayed admission, policy and fresh output/pixel/timing/audio requirements.
- Computation: `canonical_media_computation_v3`; binds complete new plan, exact source and pinned toolchain/profile. No caller
  project/user/path/time/entropy enters this identity.
- `CanonicalMediaDerivation 0.4.0`: `canonical_media_derivation_v3`; retains the unchanged complete scoped sample derivation 0.3,
  plus the new plan and exact-byte output observation. Explicit source/output basis, independently required position, observed
  position, zero-error sample method and full joins are mandatory.
- Declared gated semantics: `ci_canonical_chroma_gated_lossless_reencode 0.4.0`; digest binds the unchanged old sample semantics,
  this policy and mandatory verification. The encoder and pinned binary identities are unchanged. This descriptor specifies the
  new contract; a production compiler remains a later checkpoint.

| Bound identity | Value |
| --- | --- |
| Unchanged fixed encoder profile | `canonical_lossless_encode_profile_v1_b5a0d8d303c8f62a0d44fecc65b07221fedb1e4ae74d84a4dba66c4bb62a1dc4` |
| Alpha policy digest | `514341ad6a5d97ea9d79f82c470ac642f071f0cee6502fe6702ec5db16a632e3` |
| New declared gated semantics digest | `d95a6a30e96d2fe04804227fe307a7cab176d0b3fb6c0278d691e7a4b964acbf` |
| Final generated chroma receipt SHA-256 | `7880fe20cf3eeda99c3f83800cb81d602d400f57724369d799a534399722b11f` |

No optional key is added to a frozen schema. Old JSON remains valid in old parsers but cannot satisfy the new envelope.
Removing siting requirements and self-rehashing the plan still fails validation. Changing QP/profile fails the nested fixed policy.

Pure builders validate structure and replay; **self-consistent JSON is never observed-byte proof**.
`inspectCanonicalChromaLocalMedia` snapshots the existing closed request, requires original consent and authorized hash/size,
opens one held source anchor, obtains fresh original facts and additional carriers through pinned read-only fd processes,
reconfirms exact source bytes and returns a private admission witness only on successful admission.
The private constructor token and WeakMap reject JSON, legacy plans, fake prototypes and invented tokens. Returning a plan
snapshot cannot mutate the private witness. It is **not an execution permit** and cannot substitute for future fresh re-observation
from held bytes at execution/cache verification. Existing `canonicalizeLocalMedia` still DEFERs re-encode candidates and rejects
caller plans/argv. No new encoder, cache or publication entry point exists.

The original process supervisor and held-byte routines are unchanged: fresh descriptor per child, exact pinned binary rehash,
shell false, fd-only fixed argv, before/after source rehash and final anchor/name recheck, sanitized errors and bounded processes.
Observation bounds include existing 8-GiB source limit, 600-second probe timeouts, 16-MiB probe stdout, 64-MiB movie-header read,
4096 observed SPS records, 8192-character partial header line, 512-MiB total streamed header instrument output and 72000 ordered
chroma frame records. No complete decoded video is collected by this read-only observer. These are observation bounds,
**not a production frame-memory or capacity proof**. The tiny research sample oracle remains a test helper only.

### RED-to-GREEN evidence and gates

All evidence below is separate from the original `chroma-preflight-1*` artifacts under E.
Failed assertions and build diagnostics remain preserved; no failure receipt was rewritten.

| Receipt | Outcome |
| --- | --- |
| `chroma-03-pure-red.log`, skeleton/tests | 57 expected failures before contract behavior existed (58 total, one frozen control passed) |
| `chroma-09-media-red-refined.log`, exact test snapshot | 38 missing-observer failures; two independent controls passed (40 total); broad-catching fixture tests were corrected to avoid vacuous success |
| `chroma-12-media-green.log`, `chroma-15-diagnostic*` | 18 failures identified the actual HEVC progressive fiel carrier and missing trusted positive path |
| `chroma-17-fiel-red.log` | Focused new progressive-fiel regression RED before the narrow measured allowance |
| `chroma-25-carriers-red.log` | Container contradiction regression RED; the other failure was a short timing fixture that the frozen planner legitimately allowed to snap, replaced with its accepted true-VFR counterexample |
| `chroma-28-media-final.log` | 49/50; authorization test expected consent refusal for a malformed 1.1 record; corrected to separately prove malformed 1.1 and valid consentless 1.0 refusal |
| `chroma-35-freeze-red.log` | Detected that freezing a shallow descriptor affected legacy nested objects; fixed with owned deep copies, without changing any identity |
| `chroma-36-final-build.log` | Clean build PASS |
| `chroma-37-pure-final.log` | 65/65 PASS |
| `chroma-38-media-final.log` | 50/50 PASS; final generated receipt `.local-runs/phase5-gate7/chroma-safe-Hhvy6v/receipt.json` |
| `chroma-29-compatibility-final.log` | 384/384 PASS across the explicit 14-file pure regression set |
| `chroma-30-media-compatibility-final.log` | 80/80 PASS across five explicit generated-media suites |
| `chroma-43-preserved-boundaries-final.log` | 120/120 PASS final B2-B1/pixel/B1A/B1B boundary replay after the owned-copy correction (overlaps the 384, not added to distinct total) |
| `chroma-40-typecheck-final.log` | PASS |
| `chroma-41-audit-final.log` | PASS: 134 application TypeScript files, unchanged 18-adapter and 8-test-process allowlists |
| `chroma-42-schema-final.log` | PASS: all 33 existing exported schemas/synthetic artifacts unchanged |
| `chroma-44-preservation.json` | Exact original RED hashes, original stop prefix, historical files and frozen-source audit |

The 14-file pure command includes chroma's affected legacy surfaces: `media-ingest-reencode`, `media-ingest-pixel-reference`,
`media-ingest`, `media-ingest-local`, `media-ingest-profile`, `media-ingest-plan`, `media-ingest-matrix-carriers`,
`media-ingest-plan-record`, `owner-media-plan`, `owner-media-derived`, `owner-media-canonical`, `edit-render`,
`edit-render-audit`, `edit-review` (compiled test files, under `node --import ./scripts/no-network.mjs --test --test-concurrency=2`).
The media regression command uses concurrency 1 and exactly `media-ingest-reencode-media.integration`,
`media-ingest-n1-compat-media.integration`, `media-ingest-facts-media.integration`,
`media-ingest-plan-media.integration`, `media-ingest-plan-trust-media.integration`.
N1's exact source/output/computation/derivation/argv/cache goldens pass unchanged. Existing exact-remux refusal, mutation,
publication race, cache verification and audio/timing regressions pass; these remain evidence for the **old** route.

There are **579 distinct passing focused tests** (65 + 50 + 384 + 80), with no failed/skipped test in those final receipts.
An existing renderer fixture test reports that its optional filesystem-symlink subcase is not creatable here (EPERM); that
environment limitation is retained, not promoted to a newly proved case. No actual owner-footage runner or synthetic
`edit-real-footage-harness.test` was invoked.

The new 30 research source/output cases all preserve every Y/U/V sample: 15 center cases and 15 left cases.
Only the 15 center cases form valid new 0.4 structural derivations and pass the independent required-position check
(H.264 seven D4; HEVC identity plus seven D4). All 15 left research cases remain deferred: 12 non-invariant D4 cases require
a position different from the observed left label; the three position-invariant cases retain the unproven output default.
The metadata-retag counterexample preserves exact samples while failing new siting verification, with a passing center
control to rule out a vacuous negative. Other hostile tests cover missing evidence, frame/SPS changes, wrong PTS, unknown method,
stale hashes/facts, counterfeit witness, legacy/rehashed omission bypass, lossy policy edits and a changed U sample;
the preserved B2-B1 oracle tests also reject single Y/U/V errors and frame/geometry/format mutations.
Source hashes/sizes are reconfirmed before/after the generated operations. No consumed original is modified.

### Remaining work and final ruling

Checkpoint B's chroma contract is implemented for owner review. This does not complete B2-B2 or authorize Checkpoints C-I.
No owner-footage proof, hardware/browser playback proof, normative default-siting admission, cross-hardware determinism,
long-video capacity/throughput proof, production streaming pixel memory bound, new PCM-retiming proof or new derived-source
render/QC chain is claimed. Short 64x48 three-frame fixtures (0.1 seconds) prove this finite conditional policy, not general footage.
No performance SLA is inferred. Previously accepted B2-B1 performance limitations remain.

After the next owner review, B2-B2 still requires the fixed production compiler, bounded streaming sample verifier, resource
failure behavior, gated routing, fresh cache/publication verification, additive authorization/lifecycle integration using the
new mandatory contract, generated derived-source render/QC and final affected regressions. Defaults or other siting combinations
would require separately reviewed evidence; no encoder signaling change is requested or made in this checkpoint.
No outstanding accepted-identity or encoder-policy conflict remains for the conservative center-only alpha.

All 18 historical artifacts and original RED receipts remain untouched. Dependencies/lockfile, main, source footage,
renderer/permit/freshness semantics and protected architecture are unchanged. Commit/push is limited to the phase branch;
final local/tracking/live equality is recorded in the publication reconciliation receipt and final owner report.
Maximum publication status: **3E-B2-B2 CHROMA SAFETY CONTRACT IMPLEMENTED — PUSHED FOR OWNER REVIEW**.
3E-C and Phase 6 remain **NOT STARTED, NOT AUTHORIZED**.

## Checkpoint B owner acceptance (2026-10-08)

**Checkpoint B OWNER-ACCEPTED** at `d2ca72ffa38a38ed0b8a6597573e72ee049d2bb7`
(`feat(gate7): bind trusted chroma siting to lossless plans`).
The owner accepted CanonicalChromaObservation 1.0.0, CanonicalChromaAdmission 1.0.0, CanonicalReencodePlan 1.1.0,
CanonicalMediaDerivation 0.4.0 and chroma-safe computation identity v3, with the unchanged fixed B2-B1 QP-zero encode profile.
Only complete trusted explicit-center evidence is eligible; every other unsupported chroma case remains deferred or refused.

This separate documentation-only commit records owner acceptance. The original Checkpoint B STOP, original 20-result RED,
subsequent correction receipts, old identities and historical limitations above remain preserved. No execution or fresh media
verification is claimed by this acceptance checkpoint. Acceptance of B does not close the whole B2-B2 batch.

The same owner instruction authorizes **Checkpoints C–D only**: a fixed production compiler, bounded temporary prepublication
execution and independent bounded streaming exact-pixel plus fresh chroma/profile/timing/audio verification using generated media.
C–D are **AUTHORIZED, NOT STARTED** at this checkpoint. Checkpoints E–I are not authorized or started.
No production ingest routing, canonical store publication/cache, derived authorization/lifecycle, render handoff, owner footage,
new dependencies, model inference, deployment, publication or main merge is authorized. 3E-C and Phase 6 remain unauthorized.

Fresh C1 baseline: local = tracking = live branch `d2ca72ffa38a38ed0b8a6597573e72ee049d2bb7`;
main = origin/main = live main `4f85b559c7eff2c24e221011f3ee1dd1466a111d`; 13 ahead / 0 behind; tracked worktree/index clean.
All 18 historical untracked artifacts are snapshotted by SHA-256/size and preserved. Both pinned executables' full SHA-256 and
size match the accepted runtime. Evidence: `.local-runs/phase5-gate7/batch3e-b2b2-cd-20261008/00-baseline.json` and
`01-pinned-binaries.json`. The default command runner failed during setup before any shell started; read-only Git checks
completed through the approved sandbox override. No baseline drift or unexplained material change was found.

## Checkpoints C–D implementation and verification (2026-10-08)

**C–D implemented for owner review; B2-B2 and Gate 7 remain incomplete. STOP before E–I.**
This is production compiler/verifier code exercised on generated media only. It is not owner-footage verification,
a published canonical object, a derived authorization, or a production ingest/render route.

### Reconciled baseline and separate owner acceptance

- Initial local/tracking/live phase HEAD: `d2ca72ffa38a38ed0b8a6597573e72ee049d2bb7`, 13 ahead / 0 behind main;
  clean tracked worktree and index, all 18 historical untracked artifacts snapshotted.
- Checkpoint B owner-acceptance docs-only commit, pushed and independently reconciled first:
  `0fb3ca893d34949a03320de7053cfc461a5a0ea1` (`docs(gate7): accept B2-B2 chroma safety checkpoint`).
  C–D implementation baseline is that commit, 14 ahead / 0 behind.
- Main/local origin/main/live main: `4f85b559c7eff2c24e221011f3ee1dd1466a111d`. No main modification or merge.
- The accepted B identities, center-only policy, fixed profile and original STOP/correction evidence above remain unchanged.
  The original 32,133-byte phase-record prefix still hashes to
  `92f9991532d0d890c8dab3c43134d192854b290ea2959c0e02f5f17ceeba8384`.

### Closed compiler and fresh authority binding

`compileCanonicalLosslessLocalMedia` is read-only compiler inspection. `withCanonicalLosslessTemporary` executes the
same private typed compiler over a fresh authorized held source; `verifyCanonicalLosslessTemporary` performs verification.
Each first requires the existing trusted chroma admission witness, the consenting original 1.1.0 root, exact source hash/size,
fresh facts and all chroma carriers, a newly admitted Plan 1.1.0 equal to that witness, and execution-time held-byte reconfirmation.
Legacy sample Plan 1.0.0, serialized Plan 1.1.0, JSON, prototype-built handles and caller facts/argv/options cannot execute.
Admission remains a witness, not an execution permit. A source or named-object change invalidates the operation.

The original adapter's first 118,584 bytes remain exact, SHA-256
`f56abf2048e6991a67482cc806727b926b610c2e5a81545c91fc6ac8d8a92a66`.
DIRECT/N1/exact-remux and `canonicalizeLocalMedia` routing are unchanged. The addition has only two new audited spawn sites:
the closed encoder and the private descriptor-bound paired decoder helper. No accepted source-hash test is disabled;
additive accounting separately pins the old three spawn sites and the complete old prefix.

Actual HEVC identity invocation recorded in a generated-media proof (no audio, video index 0, time base 1/15360, 256 MiB budget):

```text
-hide_banner -nostdin -nostats -loglevel verbose -benchmark -copyts -filter_threads 1 -threads 1
-noautorotate -display_rotation:v:0 0 -protocol_whitelist fd -fd 3 -i fd: -map 0:0
-vf setsar=1,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709
-noautoscale -c:v libx264 -qp 0 -preset medium -profile:v high444 -pix_fmt +yuv420p -threads:v 2
-bf 0 -g 30 -sc_threshold 0 -x264-params lookahead-threads=1:sliced-threads=0 -a53cc 0 -udu_sei 0
-color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709 -fps_mode passthrough
-enc_time_base:v 1:15360 -video_track_timescale 15360 -map_metadata -1 -map_chapters -1
-avoid_negative_ts disabled -fflags +bitexact -fs 268435456 -f mp4 -protocol_whitelist fd -fd 4 fd:
```

The accepted profile identity remains
`canonical_lossless_encode_profile_v1_b5a0d8d303c8f62a0d44fecc65b07221fedb1e4ae74d84a4dba66c4bb62a1dc4`.
`+yuv420p` forbids implicit format conversion. There is no automatic scaling, rotation, `fps` filter, color/range conversion,
CRF choice, lossy fallback or added chroma-siting argument. `setsar`/`setparams` retain the accepted declarative recipe.

| Transform | Fixed D4 filter prefix |
| --- | --- |
| identity | none |
| rotate_90_ccw | transpose=cclock |
| rotate_180 | hflip,vflip |
| rotate_90_cw | transpose=clock |
| mirror_horizontal | hflip |
| mirror_vertical | vflip |
| transpose | transpose=cclock_flip |
| transverse | transpose=clock_flip |

`SELECT_AV_STREAMS` compiles explicit video/audio maps; `DECLARE_SQUARE_SAMPLE_ASPECT` is `setsar=1`.
`REBASE_TIMELINE_ZERO` uses the accepted per-stream offsets; `SNAP_VIDEO_TIMESTAMPS` uses the accepted exact
`settb=expr=1/<denominator>,setpts=N*<gridPeriodTicks>` and mux/encoder time bases. Frame mapping is presentation-index identity.
Audio maps add `-c:a copy`. Accepted AAC contiguous retiming/rebase uses a closed `setts` packet expression constructed from
fresh decoded sample counts and exact retained packet mapping, including accepted preroll; output packet payloads are independently hashed.
All five operations composed together, HEVC B-frame input with snap, AAC identity and PCM copy are proved. PCM copy retains MOV muxing;
other accepted cases use MP4. PCM RETIME is explicitly refused; no new PCM-retiming support is claimed.
An oversized or unfaithful compilation refuses rather than dropping an operation.

### Pinned children, exclusive bytes and source immutability

Full executable hashes are checked before every spawn, including independently for both decoders:

| Executable under `.tools/ffmpeg/ffmpeg-9.0.1-essentials_build/bin/` | Bytes | SHA-256 |
| --- | --- | --- |
| ffmpeg.exe | 102856192 | 72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3 |
| ffprobe.exe | 102652416 | 19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f |

All children use `shell:false`, pinned absolute executables, the existing minimal environment and approved tool-root cwd.
FFmpeg receives only inherited media descriptors and the fd protocol; no caller media path, shell command, PATH binary or network protocol.
Source anchors/readers are read-only, hash/size/dev/inode bound and reconfirm their named object. No production write/chmod/rename/delete
targets a source. Native descriptor-alias attack fails without changing source bytes. New generated fault-injection copies are deliberately
changed/replaced by the tests to prove refusal; they are not original owner footage or a runtime source-writing behavior.

Output is a new random scoped directory under the approved workspace `.local-runs`, with an exclusive `wx+` candidate.mp4/mov descriptor.
Default output budget is 256 MiB; accepted lower request bounds apply; hard maximum remains 8 GiB. Available storage must cover the budget.
`-fs`, 20 ms held-output monitoring, post-size/hash/reconfirmation and exact verification all apply. Exit zero alone is not success.
Encode stdout is capped at 64 KiB, diagnostic drain at 2 MiB; conversion diagnostics, pipe/process errors, oversize and timeouts refuse.
Existing request deadlines (maximum 1,800,000 ms), measurement deadlines and 10,000 ms termination grace remain controlling.

Incomplete outputs are unlinked only if their name still identifies the exclusively created inode; no replacement object is removed.
Only that owned empty directory may be removed, without recursive cleanup of owner data. Generated success/failure tests leave no candidate.
No canonical object, computation publication record, cache entry or derived authorization is created.

### Independent bounded streaming exact-pixel verification

`packages/media-ingest/pixels.ts` imports no test oracle, filesystem or process capability. It computes inverse integer D4 permutations
independently of the accepted test oracle's forward scatter. Every complete source/output frame is assembled from arbitrarily split chunks.
One source slot, one output slot and one expected slot are reused by presentation index; all Y/U/V samples are compared, then hashed.
No whole decoded-video buffer or frame-count-growing queue is retained. Swapped geometry for 90-degree transforms is checked independently.

The method remains `exact_yuv420p_planes_sha256_by_index_v1`. The UTF-8 canonical frame header binds method, frame index, literal yuv420p,
width/height and ordered Y/U/V names and lengths; its byte length is prefixed as u32 big-endian, then exact frame bytes are hashed with SHA-256.
The ordered sequence digest uses the exact accepted canonical JSON `{method,frameCount,frames:[{index,digest}]}` wire, incrementally hashed.
All eight mathematical cases, literal header wire and complete generated proofs equal the unchanged independent reference byte-for-byte.
Success requires zero total/maximum/per-plane sample error, equal counts/order/geometry/format and identical expected/output digests.

Two freshly hashed read-only descriptors and two independently hash-verified pinned decoders are used. A shared deadline begins before
both readers/pins/hooks and never resets for the companion. Decoder stdout is paused/backpressured, read in at most 64 KiB chunks;
stderr is continuously drained with a 2 MiB bound per child. Failure aborts both; kill is requested once and terminal close is required.
Paused failed stdout is destroyed after kill so unread buffered bytes cannot indefinitely prevent native close. Nonzero/signal/error exits,
missing spawn/terminal close, stalls, broken pipes, premature EOF, partial/truncated frames and even one surplus byte all refuse.
Actual hostile-child tests observe every encode/decode child close before refusal returns; missing-close controlled tests remain failures.

Explicit allocation/table bounds per active verification:

| Bound | Maximum |
| --- | --- |
| Full decoded frames | 3 (source + output + independent expected) |
| One even 8-bit yuv420p frame | 16,777,216 bytes; safe integer products, dimensions at most 16384 |
| Three decoded-frame slots | 50,331,648 bytes |
| Two stdout readable queues | 131,072 bytes each; high-water mark at most 65,536 |
| Conservative two transient reads | 65,536 bytes each |
| Binary ordered digest table | 72,000 frames × 96 = 6,912,000 bytes |
| Above sample/digest/queue/read buffers combined | **57,636,864 bytes**, plus small bounded headers/hash state |
| Verification JSON | 24 MiB UTF-8; three ordered digest arrays, each at most 72,000 entries |
| Each complete facts record | 16 MiB UTF-8; frame/fact and packet rows at most 144,000 |

Existing observer caps also remain: bounded probe/header diagnostics, 64 MiB movie-header inspection, bounded SPS rows/line assembly and
streamed carrier observations. The old held-byte hash readers remain bounded. One temporary permits one verification attempt, guarded
before the first await; concurrent/repeated proof construction refuses, and retained private proof entries are removed at callback closure.
These are application buffer and metadata cardinality bounds, not a hard cap or byte-accurate accounting for V8 heap, FFmpeg codec memory,
kernel pipe buffers or caller-retained review snapshots. Combined parent/child peak RSS is unmeasured; no fabricated total-process bound.

### Fresh source/output chroma, profile, timing and proof

Output is inspected as an internally generated held anchor using the existing trusted facts/carrier readers and parsers.
No owner-supplied root authorization is fabricated for output. The public source observer retains its original consent/identity boundary.
Fresh source admission must still equal the executed plan. Output facts, raw SPS, container carriers, stream and every frame must agree:
H.264, progressive 8-bit yuv420p, correct dimensions, limited BT.709 interpretation, square SAR, no residual display transform,
exact output frame count/PTS, and explicit type-1 center declaration with no relevant conflicting carrier.
Missing/default/left/other unsupported source siting never acquires an executable witness. Output bytes with perfect samples but explicit
left signaling fail; an actual process-level retag counterexample demonstrates this independently of source/output byte binding.

Fresh sample, timing, audio packet and output-profile measurements build the unchanged 0.3 derivation, then the unchanged mandatory 0.4
chroma derivation. Only then can a private scoped `VERIFIED_PREPUBLICATION` witness exist. Its snapshot rehashes both held objects and
expires with the exclusive temporary. Caller JSON/digests, failed encodes/decodes or self-consistent structural records cannot mint it.

### RED-first evidence, corrections and final gates

`E = .local-runs/phase5-gate7/batch3e-b2b2-cd-20261008/` (ignored). No generated media or local receipt is staged.

- C2: `03-c2-compiler-red.log`, 32 failures against the missing compiler, before implementation.
- C3: `05-c3-encode-red.log`, 28 failures against the missing executor, before implementation.
- D1: `14-d1-streaming-red-corrected.log`, missing pixel/paired-stream behavior fails 41 of 51 tests; negative configuration
  assertions that already rejected missing constructors are distinguished from meaningful GREEN evidence.
- D3: `24-d3-prepublication-red-corrected.log`, all 29 missing verifier/prepublication tests fail before implementation.
- Resource quota: `40-d4-proof-budget-red.log` demonstrates concurrent proof construction incorrectly succeeding;
  the guard before the first await and closure-time proof deletion fix it.
- All RED source snapshots and intermediate failing builds/fixtures remain preserved. Corrections include generated AV timecode
  construction, cleanup of a failed exclusive output, independent-oracle test calibration, an omitted audio-method tag, and native
  paused-pipe termination. The unchanged auditor rejected a `typeof spawn` type query; the addition now uses a structural child type.
- `38-d4-focused-pure.log` runs 26 suites: 785/788 pass; three failures are retained. Two audit cases are resolved by the structural
  type correction; the existing lifecycle path assertion is resolved with a canonical task-local TMP path instead of the Windows
  short-name temp alias. `47-corrected-pure-boundaries.log` reruns the affected suites plus pixels/process/pins: **91/91 PASS**.
  Together these receipts resolve every one of the 788 focused tests; no assertion, auditor or old golden is weakened.
- `49-final-media-regressions.log` has no terminal summary and is not counted as a completed gate. Its long-path N1 failures are
  reproduced by `52-legacy-path-diagnostic.log`: unchanged `store_location_invalid`, workspace too long for the accepted layout.
  The anomalous failed chroma-carrier attempt is retained. The unchanged suites then pass with a short canonical workspace TMP.
- `51-legacy-failures-recheck.log`: **75/75 PASS** (50 Checkpoint B chroma media + 25 B1B/N1 media), no failures/skips.
- `48-final-cd-media.log`: **93/93 PASS** (32 compiler + 28 encoder + 30 streaming/chroma proofs + 3 stress), no failures/skips.
- `41-d4-hostile-closure.log`: **17/17 PASS**, actual child/output attacks; these are also included in the final A2 trust suite.

- `54-final-remaining-media-regressions.log`: **133/133 PASS** (remaining seven legacy generated-media suites, including all 17
  appended C–D hostile cases), no failures/skips. The complete nine-suite media regression gate is **208/208 PASS**.
- `53-typecheck-confirmed.log`: `npm.cmd run typecheck` **PASS, exit 0**.
- `55-final-schemas-check.log`: exact `npm.cmd run schemas:check` **PASS, exit 0**, including a fresh clean build
  (`npm run clean` and TypeScript) and verification of all **33** unchanged schema/synthetic artifacts.
- `56-final-workspace-audit.log`: unchanged `npm.cmd run audit:workspace` **PASS, exit 0**: 135 application TypeScript files,
  18 explicit runtime adapters and the unchanged eight registered process-capable test files. Both full executable hashes reconfirmed.
- **1,089 distinct focused tests resolved PASS** across the 788-test pure gate and its affected-suite correction, 93 C–D media tests
  and 208 legacy media regressions. Overlapping reruns/17 hostile cases are not counted twice.

Receipt hashes (files under E; source RED snapshots and all intervening receipts are retained):

| Receipt | SHA-256 |
| --- | --- |
| `00-baseline.json` | `f0eda199485efd9c6c502facfdd4efc9f664467928b117aae0ef75da01482673` |
| `01-pinned-binaries.json` | `a3cae46cdb6c90672de97a64a4e7e8ab41a4aee9761aff2f577c1ebd9dea5618` |
| `03-c2-compiler-red.log` | `9c0db581b435b7a2a2c7b695775d68ab7e3fd964fbd79d52aa5000adb356edeb` |
| `05-c3-encode-red.log` | `74cd6d287e9d066f5c6ff36c8b701986db91920edcec4972be9b6144b9556007` |
| `14-d1-streaming-red-corrected.log` | `0eaa5bdac03b451e3f12a36313d0c757b49a4aa104864854b22b8f589746c0ac` |
| `24-d3-prepublication-red-corrected.log` | `69e42d770bec8b5718d2f22f4c351a048e5bc85f99c07026183dbfc8540b78fe` |
| `40-d4-proof-budget-red.log` | `af2dbea631ffb9d836f3c12741aebf71a61949aa4af7c29e4dfc40020c7cfeb8` |
| `38-d4-focused-pure.log` | `8d60775e1d69aa82fa6a19659e8527b72491b4b0b8f5c3ed74bbd2c1edfcad87` |
| `47-corrected-pure-boundaries.log` | `ad7ff0553f4f3b75e2f4f7bbee344c8ad7d0e6763298e163321a7621c466256d` |
| `48-final-cd-media.log` | `8bfe4742a52e68f47351c0dd07fc11d1ff34a692240e63cb3b107a416a1fcd3b` |
| `51-legacy-failures-recheck.log` | `7732244240db53ceb4004afe85154d530f8a7333d1dff0f3b9a672add0c897c3` |
| `52-legacy-path-diagnostic.log` | `497ffe5103bac00e31767ba35dc0cf48f8d7c3fcf5eaf7cc0e9bc57760b2f113` |
| `53-typecheck-confirmed.log` | `86054fef6d461178cfaef190e14832658004a8bec9afe95d7285940354351e00` |
| `54-final-remaining-media-regressions.log` | `aa984df478b4e7a43181b7533ce59a5f8a6e797ad401dbbe5471347cd984f801` |
| `55-final-schemas-check.log` | `5c0915fd040207d8920fbfe7caa091d449d899fe4e40f7dd77453ab293ca7d3e` |
| `56-final-workspace-audit.log` | `2585b6ad67784c7be8d7db16bb86ee5b55494f3d50273558cd39948763867a37` |

Focused pure scope covers media-ingest B1A/B1B, profile/plan/records/matrix/chroma/re-encode/reference, owner-media canonical/derived/plan,
renderer/audit/workspace boundaries, exact-time, execution/runtime/review and existing synthetic lifecycle/harness compatibility tests.
Only the previously accepted synthetic test harness is exercised; no actual owner-footage runner or model inference is used.
Media commands use `node --import ./scripts/no-network.mjs --test --test-concurrency=1` with the four new C–D media suites
and the nine affected legacy suites (re-encode, N1 compatibility, facts, plan, plan trust, chroma, ingest, owner canonical, render).
The final legacy reruns add TAP reporting and task-local TMP/TEMP; this changes neither test assertions nor production limits.

### Generated stress and measured memory

All media is generated asymmetric moving content. Independent test-only full-video reference decoding runs after verifier telemetry
and is not imported into production. Stress frame counts exceed the three live-frame slots; a 120-frame pure test also fixes slot count.

| Generated case (isolated stress run) | Encode ms | Complete verification ms | Frame buffers | Digest bytes | Sampled Node RSS peak bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| H.264 1920×1080, 16 frames, rotate_90_cw | 3065.003 | 10385.022 | 9331200 | 1536 | 187596800 |
| HEVC 3840×2160, 4 frames, identity | 3966.638 | 9732.608 | 37324800 | 384 | 190488576 |

Each decoded side contains 49,766,400 exact bytes; observed queue peaks are 98,304 bytes per decoder.
Receipts: `cd-stress-csHXII/receipt.json` and `cd-stress-Iv5N1n/receipt.json` under `.local-runs/phase5-gate7/`.
10 ms sampled Node RSS includes this test process and earlier fixture allocations and can miss brief peaks.
`process.resourceUsage().maxRSS` reports 360464 KiB for that complete Node stress process (fixture/oracle allocations included),
not an isolated verifier or combined codec-process peak. FFmpeg child RSS and combined pipeline peak were not reliably measured.

The final C–D repeat stress receipt also records 1080p encode/verification 2933.249/10668.161 ms and 4K 3875.414/27269.445 ms,
sampled Node RSS peaks 179974144/204996608 bytes and process maxRSS 363692 KiB; other regressions overlapped part of that run.
Those host observations are not an SLA or throughput extrapolation. Three fixed-profile repeats agree in full output byte hash,
exact ordered sample proof, output chroma and argv (isolated hash `d2024555f42ff60e18c246045a66251c56fe8e53c86fb394e0e9e0fad2b985b1`).
No 10-/15-minute, cross-hardware or hardware/browser playback claim is made.

### Diff/source preservation and remaining E–I

Final source accounting is retained in `E/58-final-source-preservation.json`: all 411 baseline files checked, **404 unchanged**
and exactly seven authorized existing paths changed (two phase docs, additive runtime, two additive-accounting tests,
append-only hostile tests and append-only generated AV helper). All **18** historical untracked artifacts retain exact hash/size.
All other 39 authoritative files/receipts remain exact; this phase record changes append-only.
Old runtime, A2 hostile tests (12,217 bytes) and research helper (17,807 bytes) remain exact at their pinned prefixes.
All frozen contracts, schemas, package/lockfile, renderer/authority and workspace auditor hashes remain exact.
Nine new source/test files are individually reviewed and hashed; working/staged diff checks are required before code commit.
The final Git reconciliation receipt records clean tracked state, preserved artifacts, main equality, only the phase-branch push
and local/tracking/live code HEAD equality. These statements describe C–D, not completion/acceptance of the whole B2-B2 batch.

Reviewed changed files consist only of the additive local compiler/verifier, pure pixels module, generated/adversarial tests, precise
additive source-pin accounting and these two phase documents. No package/lockfile, executable/licensing configuration, schema identity,
renderer/permit/freshness, existing ingest route, store/cache/lifecycle code or owner media is changed.

Known limits: conservative explicit-center eligibility only; fixed software profile; bounded short generated fixtures; unmeasured
combined native/parent RSS; no new PCM RETIME or long-video/cross-hardware capacity proof. Windows file-symlink creation can be EPERM;
actual directory-junction refusal and same-byte source-path replacement are covered, and the optional file-link limitation is retained.

Next separate authorization/review must cover E production ingest routing, F freshly verified publication/cache, G derived
authorization/lifecycle, H generated derived-source renderer/QC handoff, and I final affected batch closure.
No E–I integration is implemented here. B2-B2 is neither fully complete nor owner-accepted; Gate 7 remains incomplete.
Code publication is limited to `feat(gate7): implement chroma-gated lossless compiler and streaming verifier` on the existing phase branch.
Final code HEAD/local/tracking/live reconciliation is recorded in the code-publication receipt and owner report; no merge.

**3E-B2-B2 CHECKPOINTS C–D IMPLEMENTED — FOR OWNER REVIEW. STOP before E–I.**

## Checkpoints C–D owner acceptance (2026-10-08)

**C–D OWNER-ACCEPTED** at `96871381464eb6bc5064153faa724bf7a898f245`.
The owner reviewed and accepted the chroma-gated fixed lossless compiler and bounded streaming exact-pixel verifier within
the generated-media scope and limitations recorded above. This docs-only ruling introduces no new verification claim and
preserves every earlier STOP, RED receipt, failed gate and later correction.

Fresh E0 baseline: local/tracking/live phase HEAD all equal the accepted SHA; local/tracking/live main remain
`4f85b559c7eff2c24e221011f3ee1dd1466a111d`; 15 ahead / 0 behind main, clean tracked worktree/index, diff check PASS.
GitHub's independent commit comparison also reports identical phase HEAD and 15 ahead / 0 behind main.
All 18 historical untracked artifacts are snapshotted by exact SHA-256/size in the ignored
`.local-runs/phase5-gate7/batch3e-b2b2-ef-20261008/00-baseline.json`, alongside 402 tracked paths and 40 authoritative references.
The default command runner failed before process creation (`helper_unknown_error: setup refresh had errors`);
the separately auto-reviewed outside-sandbox read-only runner succeeded. No blocked test command was bypassed.

Only **E–F** are authorized, **NOT STARTED** at this acceptance checkpoint: trusted routing and freshly verified canonical
publication/cache returning a distinct non-authorizing result. No FootageAuthorizationDerived, owner registration, render permit
or lifecycle integration may be issued. **G–I, 3E-C and Phase 6 remain NOT STARTED, NOT AUTHORIZED.** B2-B2 and Gate 7 remain
incomplete. Publication is limited to the existing phase branch; main is not merged or modified.

## E–F E0 reuse decision (2026-10-08)

E–F implementation baseline is the separate acceptance-doc commit `ad5d8fe688c46ad2376789626bfd939a1415f075`;
the accepted implementation base is `96871381464eb6bc5064153faa724bf7a898f245`. Local/tracking/live acceptance HEAD agree,
main is unchanged, and the phase branch is now 16 ahead / 0 behind. This section is preliminary engineering evidence, not a passed gate.

Actual external source inspection (read-only; nothing is installed or vendored):

- [npm/cacache](https://github.com/npm/cacache): `lib/content/write.js`, `lib/content/read.js`, `lib/entry-index.js`, `package.json`,
  `LICENSE.md`; live main `6e8eb4d7e82694149c34fbb0fbe5441628fc1703`. Writes use `wx`, streaming integrity/size checks and
  `moveFile` with overwrite disabled. A per-process map coalesces destination moves; it is not cross-process media verification.
  Reads check SRI/size; the convenience read still concatenates large content. The index appends checksum-prefixed entries, skips
  damaged entries and permits replacement during compaction. These index semantics do not satisfy our corruption-refusal contract.
  ISC; inspected package 21.0.1 has ten direct runtime dependencies and disables Windows CI in template configuration. No maintained
  package's generic cache API can replace our held inode, authorization and full media checks.
- [OCI distribution-spec](https://github.com/opencontainers/distribution-spec): `spec.md`, `LICENSE`; live main
  `97274622c11112caa21efb8c52acca3c6b8fa7f1`. Useful features are digest-identified blobs, client byte verification, explicit media
  types and publishing blobs before the manifest. This is an HTTP protocol specification, not a secure local-file implementation;
  referenced blobs may be rejected when absent and subject references have separate ordering rules. Apache-2.0; no runtime dependency
  is needed to reuse the publication ordering concept.
- [Bazel remote-apis](https://github.com/bazelbuild/remote-apis): `README.md`,
  `build/bazel/remote/execution/v2/remote_execution.proto`, `LICENSE`; live main `6def1c5d27a527c400875c24ae8b1a160145d7e1`.
  The ActionCache and ContentAddressableStorage services separate a computation result from its digest/size blobs. The protocol requires
  servers to reject wrong digest/size uploads and clients to verify downloaded content. It does not assert media equivalence or owner
  authority; adopting the RPC stack would add irrelevant transport/protobuf dependencies. Apache-2.0. Live refs demonstrate accessible
  upstream snapshots; no independent maintenance or security audit of these projects is claimed.

| Requirement | Existing reusable implementation | Missing delta | New dependency needed? |
| --- | --- | --- | --- |
| Trusted routing | Profile v1 / ingest planner / read-once request | Bounded chroma branch over the existing anchor | No |
| Source authorization | Consenting root / held byte anchor | No bypass; use private snapshotted context | No |
| Exact encoding | C–D compiler and scoped executor | Extract private trusted source seam | No |
| Full sample verification | C–D paired streaming verifier | Private shared held-output core for cached bytes | No |
| No-overwrite store | A2/N1 objects/computations/pending layout | Held publication for new variant and precise pending cleanup | No |
| Computation record | Pure identified deterministic records | Compact strict 0.4 projection with a new record domain | No |
| Cache verification | A2/N1 corruption refusal / remeasurement | Rebuild complete 0.3/0.4 proof and compare projection | No |
| Lifecycle | Existing owner-media authority | Deferred to G, no changes | Out of scope |

Decision: reuse the existing store and C–D math/process supervision. Add only the missing compact contract, private held-byte seams,
typed non-authorizing result and routing/publication verification. No dependency or lockfile change. The old record helper's broad
best-effort unlink is not sufficient for E–F hostile pending replacement; any new record writer must retain the exclusive inode and
refuse cleanup failure. Existing N1/0.2 record domains and behavior remain frozen.

Container review: the frozen object function declares SHA-256 naming and returns `.mp4`; it does not encode a payload-format identity.
All accepted trusted readers use held descriptors with the pinned `mov` demuxer (ISO BMFF family), not filename-extension selection.
The fixed compiler deliberately emits MOV for PCM. E–F must separately measure the actual `ftyp` box and H.264 codec/profile,
retain truthful MOV/MP4 identity in the compact record, and verify real generated MOV under the frozen `.mp4` namespace. No future
derived-source reader is authorized here; G must use the measured payload identity rather than the suffix. New PCM RETIME remains deferred.

## E–F implementation and verification ledger (2026-10-08)

**Status at this entry: UNDER VERIFICATION, NO FEATURE COMMIT.** Only E–F are authorized.
Evidence prefix `E = .local-runs/phase5-gate7/batch3e-b2b2-ef-20261008/` is ignored; every original receipt remains in place.
The C–D accepted SHA is `96871381464eb6bc5064153faa724bf7a898f245`; the separate pushed acceptance-doc/E–F baseline SHA is
`ad5d8fe688c46ad2376789626bfd939a1415f075`. No main merge or later-phase implementation.

### Reused seams, precedence and authority

The ordinary `canonicalizeLocalMedia` still snapshots caller fields once, holds the original source anchor and derives fresh Profile v1
facts. DIRECT, REFUSE, legacy N1 and every exact-remux PLAN retain their accepted branches. Only DEFER reaches the existing B2-B1
bounded planner, then fresh center-only chroma admission and Plan 1.1.0. Unsupported original findings remain in the returned original
planning evaluation. Missing/default/left/other unproved siting defers; conflicting/unsupported carriers refuse. PCM RETIME explicitly
defers. No smaller model, new codec setting, pixel conversion, chroma relocation or audio encoder is selected by production.

A private source seam extracts the accepted scoped encoder body; it receives the already snapshotted request, original held source,
pinned context and freshly observed plan. It does not call multiple public helpers with the caller's request. A private held-source/
held-output core is extracted from C–D verification. Temporary verification still has its one-attempt guard and expiring witness;
stored-object verification never constructs an encoder temporary or accepts a caller proof. Pixel math, decoder argv, ordered digest
wire, source-prefix semantics, encoder argv/profile and original record identities stay unchanged.

The new result is the disjoint typed `PUBLISHED_VERIFIED_NOT_AUTHORIZED`, with `renderAuthority: not_registered`, identities, complete
fresh 0.3/0.4 structural evidence, compact record, cache/publication state and bounded verifier resource telemetry. It contains no
authorization, output path or filesystem handle. No existing application consumer outside tests calls this ingest entry point.
Owner-media registration, permit, renderer, execution claims and root-first lifecycle files are unchanged; G must establish authority.

### Compact immutable commitment, not cached proof

`packages/media-ingest/lossless-record.ts` adds pure `CanonicalLosslessComputationRecord` **0.4.0**, record identity domain
`canonical_lossless_computation_record_v1`. The computation remains the frozen **canonical_media_computation_v3**. The projection binds:
source hash/size/asset, facts digest and chroma-observation ID; full fresh-plan ID/version and fixed encode-profile/verification-policy IDs;
fixed 0.4 toolchain; actual output hash/size/asset; measured ftyp format, major/compatible brands and complete box hash; actual H.264
High 4:4:4 Predictive/yuv420p signaling; output facts/profile-evaluation commitments; complete ordered source/expected/output sequence
digests, geometry/transform/count/index mapping and mandatory zero per-plane/total/maximum error; exact video/audio timelines, copied
audio packet commitments, and the unchanged chroma-verification method/policy/positions/source-output observation IDs.

Strict schemas and exact canonical UTF-8 LF serialization reject missing/extra/rehashed incompatible fields. A fresh full Plan 1.1.0
is required to validate source/plan/computation joins. Output commitments only become acceptable when fresh held media independently
reproduces the whole projection. Creator/project/root authorization/paths/clock/derivation IDs are absent from the store value.
Each requesting root independently reestablishes authorization and consent; its complete derivation retains only its own lineage.

`35-record-size-proof.json` reuses the existing pure test fixture: **synthetic structural evidence only**. At 3 frames, full derivation
19,121 bytes versus compact record 4,073 bytes; at 2,000 frames, full derivation **651,154 bytes** versus compact record **4,076 bytes**.
The hard **262,144-byte** store limit is unchanged. Frame lists remain complete in fresh derivation evidence; the store retains their
ordered sequence commitments rather than truncating them. The compact shape has no frame/fact/chroma-row arrays; its only array is
at most sixteen four-byte compatible brands. Every record write/read also enforces the original hard byte bound.

### Cache and publication trust

Hit: fresh original root/consent and hash/size/inode; fresh facts/chroma and rebuilt plan/computation; strict compact record; exact held
content-addressed object hash/size/type; fresh raw ftyp/encoding/profile preflight; shared C–D full source/output Y/U/V decoder verification;
fresh complete source/output facts, every chroma carrier/frame, video PTS and audio payload/timing; rebuilt request-specific 0.3/0.4 evidence;
exact projected-record equality; then re-read the record, check its physical identity/bytes, reconfirm source/output/store and return the
non-authorizing snapshot. A valid hit starts **no encoder**. Stored frame digests/facts/authorization are never verification inputs.

Miss: accepted encoder into exclusive scoped bytes; full C–D verification; active private prepublication entry bound to that very temporary;
source/output/name reconfirmation; seal/sync; no-overwrite hard link; open the real winner and check expected bytes/size plus exact inode
when linked by this operation; independently repeat full media proof; compare compact projections; publish the compact record via the
existing helper's narrow held-inode extension; final object/source/store/record reconfirmation. Publication happens inside the callback
with the original handles alive. No detached JSON authorizes a link. The large temporary proof entry/reference is released after linking,
before winner verification; its capability is invalidated at closure. Read-only mode and SHA-256 names are never treated as immutability.

The existing objects/computations/pending layout and names remain. Store directories are identified and reconfirmed with traversal/link/
junction refusal. The added record writer uses wx+, sync, exact held inode/hash/length and no-overwrite linking, verifies a concurrent winner
and only unlinks its own still-identical pending inode. Cleanup failure/replacement refuses. Canonical objects/records are never repaired,
overwritten or garbage-collected. A missing object under an existing record is cache corruption. Compatible orphan objects are adopted
only after a new trusted encode and complete winner verification. Interruption after the object/before the record leaves a non-authorizing
orphan; these are separate operations, never claimed to be an atomic transaction or a new power-loss durability guarantee.

MOV/PCM: real generated MOV/PCM is published under the frozen SHA-256 `.mp4` object name and successfully reverified on a hit.
The record truthfully says MOV/`qt  `; readers use pinned fd-only ISO BMFF detection/demuxing, not the suffix. No namespace/accepted
identity changes, PCM retiming, hardware playback proof or future derived-source reader integration.

### Original RED, intermediate failures and corrections

- `01-e1-build.log`: one test-only TS property-inference failure, corrected in `02-e1-build-corrected.log` without production changes.
- `03-e1-routing-red.log`: **18 failures / 16 passes**, missing ordinary eligible route/publication/consent behavior on accepted code.
- `05-f1-record-red.log`: **24/24 failures** on the absent compact contract.
- `06-routing-record-build.log` compiles a private integration draft, not a passed routing/publication gate. The draft is retained as
  `07-private-runtime-draft.ts`; accepted runtime bytes were restored for baseline cache/publication RED. This chronology is explicit:
  the draft was prepared before that RED, while no draft media operation or publication was executed. Final-result routing and store
  tests share implementation dependencies; there is no intermediate result falsely claiming publication.
- `09-f3-f4-baseline-red.log`: cache/publication cases reject the absent behavior; 24 record tests also expose a synthetic fixture's
  extra output-identity fields. Those fixture failures are not counted as media-integrity findings. Correct fixture projection and the
  missing-record-ID test calibration give `11-f2-record-green.log`: **24/24 PASS**. Wrong-range/444 fixture construction is separated
  from canonical encoding so production conversion guards remain unchanged.
- `13-first-integration.log`: **75/78 PASS**. Retained failures: range conversion blocked at the canonical encoder (replace with a
  generated stream-copy range counterexample); test expected process_failed while shared EOF/verification refusal mapped to cache_corrupt
  (both refusal paths require all real child closes); case-sensitive derived-authorization error-message assertion (use owned error code).
- `14-corrected-build.log` / `16-typecheck.log`: test-only omitted-close wrapper event-spread typing failure; corrected in
  `19-corrected-supervision-build.log`. `20-affected-pure-corrected.log`: **147/147 PASS**.
- `21-final-ef-media.log`: **88/88 PASS**, no skips/failures. Includes direct/remux precedence, fourteen D4 cases, real output-oracle
  comparison, hits without encoder, per-request scope, plane/chroma/profile/PTS/audio attacks, wrong/missing/link-aliased objects,
  record races, identical concurrent computations, occupied destinations, record collision, owned pending replacement/cleanup refusal,
  permission/space syscall faults, source/temporary replacement, junction escape, interrupted object-before-record, orphan adoption,
  actual child failure/missing-close and deadline-before-spawn, plus genuine MOV/PCM miss/hit.
- `22-final-pure-regressions.log`: **810/812 PASS**, two failures preserved. The runtime-state assertion requires a temp root outside
  the repository; the first invocation set TMP inside it. The rerun uses canonical Windows Temp/ci-ef-20261008, without changing that
  test or production path rules. A1's audit source pin needs the exact one new E–F harness registration removed before the old hash
  comparison; the original expected digest remains. `23-final-legacy-media.log`: **304/304 PASS**, no failures/skips, including C–D
  93, legacy 208 and three synthetic revision-freshness cases. No owner-footage runner or model is executed.
- Independent later hostile review: `25-deep-record-red.log` proves bounded JSON can overflow recursive canonical serialization and
  yield unexpected_failure. The new 0.4 branch now strict-parses before canonical serialization; the old record branch is unchanged.
- `27-ftyp-brand-red.log` is a **real generated-media complete-proof counterexample**: flip the brand's high bit, independently rebuild
  valid 0.3/0.4 samples/chroma/timing evidence and an exact rehashed compact record. ASCII decoding masks the bit, mislabels raw bytes as
  isom and incorrectly accepts the hit. Preserve the fixture and refusal assertion. Latin-1 byte-preserving reads followed by strict
  ASCII-brand validation fix this implementation defect without changing any accepted identity/profile/namespace.
- `30-hostile-corrections-green.log`: the **same two original instruments PASS 2/2** after those minimal fixes. Permanent cache tests
  include deep JSON and independently reconstructed high-bit major/compatible-brand records; all-five timing/audio repair publication
  and cache reconstruction are added to the ordinary-route gate. Final reruns below must close these changes before commit.

### Bounds and remaining authority

All accepted C–D size/count/frame/queue/digest/diagnostic/facts/chroma/packet/termination limits remain. New limits are a leading ftyp box
of at most 80 bytes, at most sixteen compatible brands and five identified store directories; pending allocations are one scoped encoded
temporary plus one bounded computation-record pending file. Only paired pixel comparison has two simultaneous children per operation;
all additional observers are sequential. No extra decoder or compressed-video accumulation. After original legacy measurement, the new
lossless branch has a single monotonic request deadline (at most 1,800,000 ms), checked before every child spawn and before returning,
in addition to the existing per-query/supervision/grace bounds. Caller clock and authorization are read once, never reused from a cache.

The 57,636,864-byte figure remains the accepted per-verification pixel/digest/queue/read bound, not total RSS. Bounded schema/table clones,
parent/child native memory, kernel buffers and request-retained snapshots are additional. Combined peak RSS, long-video operational
capacity, hardware/browser playback and cross-machine encoded-byte reproducibility remain unproved. These are preserved C–D limits.
No new external dependency, package/lockfile change, owner-media lifecycle/permit change, owner footage or model inference.
G–I, 3E-C and Phase 6 remain NOT STARTED, NOT AUTHORIZED; B2-B2/Gate 7 remain incomplete.

## E–F final gates (2026-10-08)

**E–F IMPLEMENTED FOR OWNER REVIEW. All final implementation gates PASS; no owner acceptance of E–F/B2-B2/Gate 7 is implied.**

| Gate / receipt under E | Final outcome |
| --- | --- |
| `30-hostile-corrections-green.log` | Same original deep-JSON and complete-proof high-bit brand instruments: 2/2 PASS |
| `31-final-corrected-ef-media.log` | 92/92 PASS, zero failures/skips; full route, cache, publication, compound timing/audio and raw-brand regressions |
| `32-final-corrected-pure.log` | 812/812 PASS, zero failures/skips; full affected contract/authority/render/workspace gate, two isolated file workers |
| `23-final-legacy-media.log` | 304/304 PASS, zero failures/skips, retained full C–D/legacy/freshness run |
| `37-final-affected-legacy-recheck.log` | 47/47 PASS on corrected code: N1 goldens, exact remux and C–D complete verifier |
| `33-final-typecheck.log` | Exact `npm.cmd run typecheck`, exit 0 |
| `39-clean-build-schemas.log` | Exact `npm.cmd run schemas:check`, fresh clean TypeScript build and all 33 unchanged artifacts, exit 0 |
| `38-final-workspace-audit.log` | 136 application TS files / 18 adapters / 9 exact process harness registrations, exit 0 |
| `35-record-size-proof.json` | 2,000-frame synthetic full evidence 651,154 bytes; compact record 4,076 bytes; original limit 262,144 |
| `36-preservation-review.json` | All 18 historical hash/size pairs, 39 unchanged authoritative references, exact phase-history prefix and dependencies PASS |

**1,208 distinct tests** in the clean pure/E–F/legacy gate inventory (812 + 92 + 304). The 47-test recheck, byte-size fixture's
24-test rerun and two hostile instrument reruns overlap or strengthen these gates and are not added to that distinct count.
The earlier 810/812 run remains a failed receipt. Its environment assertion and exact auditor-accounting defect are resolved by the
clean full rerun, not by weakening a test, changing production path limits or regenerating an old expected hash.
Actual host Node is 24.15.0; both complete executable SHA-256 values exactly match the owner-pinned C–D hashes.

Final review covers the new pure record, request/held-object integration, real and hostile fixtures, exact inverse source-prefix
accounting, the single process-test registration and these phase documents. Original Facts/Profile/Plan/Reencode/Chroma/Pixels,
toolchain/encoder/digest semantics, package/lockfile, schemas, renderer/permits and owner-media authority/lifecycle remain frozen.
The final source/staged/publication receipt will record only explicitly staged E–F paths, all historical hashes and local/tracking/live
HEAD equality. Main remains `4f85b559c7eff2c24e221011f3ee1dd1466a111d`; only the existing phase branch may be pushed.
No generated media or ignored receipt enters Git. No owner footage is decoded and no pretrained model is loaded.

Known limits remain conservative explicit-center eligibility, fixed software QP-zero profile, generated-footage scope, unmeasured
combined parent/native peak RSS, unproved long-video operational capacity/hardware playback/cross-machine byte reproducibility,
and no new PCM RETIME. Real power-loss durability/atomic object-plus-record transaction is not claimed. Permission/quota/cleanup
syscall refusals are controlled fault injections; decoder and metadata/sample counterexamples use actual pinned subprocesses.
Malformed records and missing/tampered/incompatible objects refuse without repair; orphan objects remain non-authorizing and are not
garbage-collected. The result proves the held bytes at verification time, never ongoing file immutability or execution authority.

Remaining **G–I**: separately authorize derived FootageAuthorization/lifecycle registration for 0.4; generated registered-source
renderer/QC handoff; then full affected batch closure/owner review. None is started or authorized here. Owner footage/3E-C and
Phase 6 require separate authorization. **B2-B2 and Gate 7 remain incomplete. STOP after E–F phase-branch publication.**

## Owner-review repair — request output-byte budget (2026-10-08)

**OWNER FINDING CONFIRMED; REPAIR UNDER VERIFICATION. E–F are not owner-accepted.** Repair base local/tracking/live HEAD:
`2fec4adc658005237eb4cb34fc01376b0c3d53ee`; main remains `4f85b559c7eff2c24e221011f3ee1dd1466a111d`, 17 ahead / 0 behind.
The new ignored evidence directory is `.local-runs/phase5-gate7/batch3e-b2b2-ef-budget-repair-20261008/` (R below).
`R/00-baseline.json` snapshots all 407 tracked files, all 18 historical hash/size pairs and all 42 original E–F receipt/source files.
`R/01-runtime-before-repair.ts` preserves the exact unfixed runtime. No existing receipt is overwritten.

Actual source inspection confirms `withTrustedLosslessTemporary` uses the snapshotted `request.maxOutputBytes ??
CANONICAL_LOSSLESS_RUNTIME_BOUNDS.defaultOutputBytes` for compiler argv, live output monitoring and the final temporary-size check.
`executeLosslessStore` opens cached objects under the frozen 8 GiB hard bound and freshly verifies their complete media proof, but
the original cache-hit branch and shared `finish` omit the narrower per-request/default output bound. A valid record is not corrupt
merely because a different requesting operation has a smaller resource budget; that budget stays outside the computation identity.

Reuse decision: retain all existing request snapshots, C–D encoder/verifier, store, strict records and corruption refusal. Add only
the missing two-line inequality in the shared trusted `finish` boundary after full proof, record equality and byte/file reconfirmation.
Use existing `output_invalid`, matching the accepted output/resource refusals, outside the verifier's corruption-mapping catch.
No frozen schema, computation/record identity, default/hard bound, process behavior, dependency or authority change.

RED-first evidence: `R/02-red-test-build.log` PASS; `R/03-output-budget-red.log` **3 PASS / 2 FAIL** against unchanged runtime.
The new tests first publish valid generated bytes through the ordinary route, then request that same computation on cache hits:
30,563-byte output with 30,562-byte limit incorrectly returns `PUBLISHED_VERIFIED_NOT_AUTHORIZED`. Exact N, N+1 and the small
omitted-limit case pass. A separate genuine 268,435,457-byte BMFF file is first published/fully verified with an explicit matching
budget, and succeeds on the matching-budget hit, yet incorrectly succeeds again with no limit supplied (default 268,435,456).
Every tested hit/refusal attempt starts zero encoders, remeasures source/output pixels and chroma, preserves record bytes and verifies
the entire cached object's byte identity. `R/04-output-budget-red-test.ts` retains the unchanged RED test source.

The large default-boundary fixture appends a valid inert top-level `free` box to generated encoder output only after the real child
closes and before the runtime measures its held temporary. Both ordinary production verifications still run. Its nine small frames
are unchanged; it proves an actual container-byte boundary, not long-video capacity or large-video RSS. The test hashes this fixture
with one 65,536-byte read buffer rather than accumulating its compressed/container bytes. No owner media is used or modified.

`R/05-repair-build.log` PASS. Focused GREEN, full affected E–F/C–D/N1/exact-remux/authority tests, typecheck, clean build/schema,
workspace audit and final preservation review remain pending at this entry. Only the existing phase branch may receive the requested
`fix(gate7): enforce lossless cache-hit output budget` commit after all pass. **G–I remain NOT STARTED, NOT AUTHORIZED.**

## Owner-review budget repair final gates (2026-10-08)

**REPAIR IMPLEMENTED; ALL AFFECTED GATES PASS. E–F OWNER ACCEPTANCE REMAINS PENDING.** The original RED findings and the
verification-in-progress entry above remain unchanged. The correction is exactly two lines in `executeLosslessStore`'s shared
trusted `finish`: compare the actual held output size with `request.maxOutputBytes ?? CANONICAL_LOSSLESS_RUNTIME_BOUNDS.defaultOutputBytes`
and refuse excess via existing `output_invalid`. Equality is accepted. No new helper, contract, identity or dependency is needed.
The C–D encoder's argv/monitor/final byte checks remain exact. Cache corruption checks, complete fresh proof and final source/object/
record identity reconfirmation all precede this request-budget check, so invalid storage retains its original refusal precedence.

| Repair gate / receipt under R | Outcome |
| --- | --- |
| `03-output-budget-red.log` | Unfixed base: 3 PASS / 2 FAIL; explicit N−1 and above-default omitted-limit hits incorrectly succeed |
| `06-output-budget-green.log` | Same unchanged five tests: 5/5 PASS, zero skips; both wrong successes now refuse `output_invalid` |
| `07-full-ef-media.log` | 97/97 PASS, zero failures/skips; full routing, fresh media proof, corruption and publication-race gate |
| `08-full-affected-pure.log` | 812/812 PASS, zero failures/skips; 27 affected frozen-contract/authority/render/workspace suites |
| `09-full-legacy-media.log` | 304/304 PASS, zero failures/skips; C–D 93, accepted legacy 208 and real-clock generated freshness 3 |
| `10-typecheck.log` | `npm.cmd run typecheck`, exit 0 |
| `11-clean-build-schemas.log` | `npm.cmd run schemas:check`, fresh clean build and all 33 unchanged artifacts, exit 0 |
| `12-workspace-audit.log` | 136 application TS files / 18 adapters / unchanged 9 process-test registrations, exit 0 |

**1,213 distinct affected tests PASS** (812 + 97 + 304); the five focused GREEN cases are included in the full E–F gate and are not
double-counted. No selective rerun, skipped assertion or supervision weakening is used. The new RED tests alone fail as expected
on the original runtime. Live progress-log readers required a writer-compatible reader; that diagnostic issue did not affect test runs.
All media is generated. The existing structural lifecycle/authority tests use opaque fixture bytes/stub vectors; no owner-footage
runner or model inference is executed. All source/decoder/encoder observations use the accepted pinned runtime.

Boundary evidence: the actual prior publication is **30,563 bytes**. A **30,562** request refuses; **30,563** and **30,564** requests
return a freshly verified hit. Omission also accepts this smaller file. A second actual valid **268,435,457-byte** container succeeds
with its explicit matching budget on miss and hit, then refuses with omission against the accepted **268,435,456-byte** default.
Every hit attempt starts zero encoders, runs fresh source/output sample/chroma verification, keeps the computation identity unchanged,
and preserves object and record bytes. The large fixture uses whole-file SHA-256/size/dev/inode comparisons with one bounded read buffer;
its nine small frames plus inert BMFF padding establish only the container-byte boundary. Existing full audio/timing/chroma corruption
and reconstruction tests also pass; cached frame lists or records never become fresh proof.

Final review is recorded in `R/13-final-review.json`: only the runtime, append-only cache regressions and two phase records may change;
all 18 historical hash/size pairs and all 42 original E–F receipt/source files must match `R/00-baseline.json`. The phase history prefix,
all old cache test bodies, frozen contracts, toolchain, pixel math/digest wire, encoder profile, schemas, package/lockfile, permits and
owner-media authority/lifecycle remain preserved. Generated media and receipts stay ignored. Main remains
`4f85b559c7eff2c24e221011f3ee1dd1466a111d`. No original media is modified by the adapter or repair.

The authorized repair publication is `fix(gate7): enforce lossless cache-hit output budget` on
`phase/5-gate7-3e-production-hardening` only. `R/14-publication-receipt.json` and the final owner report record the new implementation
SHA and independently checked local/tracking/live equality after push. No main merge, new dependency, derived authorization, permit
or lifecycle integration. Preserved E–F/C–D operational limitations still apply. **STOP after repair publication/report; G–I remain
NOT STARTED, NOT AUTHORIZED, and E–F/B2-B2/Gate 7 are not owner-accepted by this repair.**

## Checkpoints E–F owner acceptance (2026-10-09)

**E–F OWNER-ACCEPTED** at `da3a01be7198c18879a256836d51f24575c30230`, including the accepted output-budget repair.
The owner accepts the existing canonical publication/cache implementation, fresh lossless verification and corrected output-byte
budget enforcement within their recorded generated-media scope and limitations. This documentation-only decision records the
owner's ruling; it adds no media evidence, reruns no completed repair and preserves every earlier failure, receipt and limitation.

Fresh baseline: local/tracking/live phase HEAD equal the accepted SHA; local/tracking/live main remain
`4f85b559c7eff2c24e221011f3ee1dd1466a111d`; tracked worktree and index clean. The 18 historical untracked artifacts, all 42 original
E–F evidence files and 16 repair evidence files are snapshotted in the ignored
`.local-runs/phase5-gate7/batch3e-b2b2-g-20261009/00-baseline.json`. Both pinned executable hashes match.

Only **Checkpoint G** is now authorized, **NOT STARTED** at this decision: the smallest safe explicit 0.4 derived declaration,
trusted existing-store verification and owner-media registration/lifecycle bridge. Publication of this acceptance must succeed
separately before G begins. `PUBLISHED_VERIFIED_NOT_AUTHORIZED` remains non-authorizing; no encode, cache or record supplies consent.
**H–I, renderer/QC integration, owner footage, 3E-C and Phase 6 remain NOT STARTED, NOT AUTHORIZED.** B2-B2 and Gate 7 remain
incomplete and are not owner-accepted as a whole. No main merge, deployment or dependency change is authorized.
