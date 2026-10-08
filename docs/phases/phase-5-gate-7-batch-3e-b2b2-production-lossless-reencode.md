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
