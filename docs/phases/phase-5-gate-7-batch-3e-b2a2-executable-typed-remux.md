# Phase 5 Gate 7 Batch 3E-B2-A2 — Executable typed exact-remux canonicalization

**Current status (2026-10-08): OWNER-ACCEPTED at `871cd69301e60e46ebfc64ffc44baef7067fd8e9`.** See the acceptance checkpoint below.
The earlier status and evidence remain preserved as history.

**Status (2026-10-08): IMPLEMENTED; OWNER REVIEW PENDING. All required verification gates pass.**

The final implementation commit and push receipt are reported separately. Gate 7 remains incomplete. B2-B, 3E-C and Phase 6 have not started.

The baseline through "Intentional worktree files" sections below preserve the earlier extraction checkpoint and its stop verbatim.
They describe that historical checkpoint. The owner resolution and completed implementation sections that follow supersede its open
work and decision request; no failure has been rewritten as a success.

## Baseline and inherited work

This continues the owner-controlled session from `9cd339534867260ec77461776a85f7c33ab0aa75`, the already completed documentation-only
B2-A1 acceptance checkpoint. Accepted A1 implementation: `68195af2777753e29b442d5b8ada26dddeb81e72`. Main remains
`4f85b559c7eff2c24e221011f3ee1dd1466a111d`. No history was reset, rewritten or repaired.

The tracked tree and index were clean at handoff. The owner explicitly resolved the initial handoff stop for exactly 18 historical,
untracked files (`CLAUDE.md` and the named earlier gate review captures). Those files are excluded from A2 and remain untouched.
No inherited A2 implementation existed. All current A2 edits are intentionally created, uncommitted work from this continuation.

## Work attempted

Read and reconciled the accepted A1 and B1B records, relevant B1A material, current phase, implementation, test support and B2R instruments.
The B2R research directory was read only. No research or owner media was executed. The new fixtures are generated from lavfi.

The focused accepted B1B media baseline passed **27/27** under the repository no-network guard, before production edits. The new A2
facts suite first failed **15/15** on the absent `inspectCanonicalLocalMedia` export. Partial trusted extraction was then implemented
inside the existing adapter, without changing the accepted profile, facts schema, planner or N1 contracts.

The local inspection API accepts the same source, authorization and runtime inputs as ingest, with no caller facts, plans or commands.
It measures through fresh verified held descriptors and rechecks object identity, byte size and hash. Its observations include:

- independent container `pasp` values and bitstream SPS values from the pinned `trace_headers` instrument;
- the full nine-coefficient display matrix;
- container clean-aperture evidence and an independent decoded-output geometry check where cropping is present;
- color range, primaries, transfer and matrix separately, with unspecified values preserved;
- exact user-data SEI UUIDs and carrier, with other SEI kept unknown;
- decoded video PTS, decode reordering, decoded audio PTS and sample counts;
- explicit single-thread ffprobe decoding, following the B2R HEVC side-data finding.

This is partial implementation, not completed production integration. The existing production `canonicalizeLocalMedia` routing still
uses B1 classification. A2 plan execution, v0.2 publication/cache and owner-media compatibility are not implemented.

## Preserved failures and corrections

Evidence is under `.local-runs/phase5-gate7/batch3e-b2a2-20261007/` (ignored). Generated fixtures remain under `.local-runs/a2tmp/`.
Earlier logs are preserved:

| Evidence | Result |
|---|---|
| `01-baseline-build.log` | Accepted baseline build PASS |
| `02-b1b-media-baseline.log` | B1B media 27/27 PASS |
| `03-facts-red-build.log`, `04-facts-red.log` | New tests compile; 15/15 fail on absent extraction |
| `05-generated-header-trace.log`, `06-generated-frames.json` | Pinned SPS/UUID and decoded-carrier instrument checks on generated media |
| `07-facts-build.log` | TypeScript nullable-stderr error; corrected with guarded access |
| `08-facts-first-green.log` | 11/15; incorrect fixture matrix offset, fixture color declaration and missing decoded-crop observation |
| `09-facts-build.log`, `10-facts-green.log` | Compilation PASS; 14/15; D4 DEFER expectation still fails |
| `11-runtime-red-build.log` | Initial execution-test family compiles; it has not been run RED or GREEN |
| `12-display-carrier-build.log` | Compilation PASS after recognizing the exact frame-side-data label |
| `12-display-carrier-conflict.mjs`, `13-display-carrier-conflict.log`, `13-display-carrier-conflict.json` | Paired generated-byte reproduction below |
| `14-facts-conflict-confirmation.log` | 14/15 PASS; the D4 routing expectation remains failing |
| `15-historical-preservation.json` | All 18 authorized historical files match their handoff SHA-256 values |
| `16-display-carrier-raw.json` | Independent pinned single-thread probe: all 36 decoded frames carry the matrix |

The early fixture fixes did not alter the accepted B1B generator's defaults or arguments. A separate A2 generator was added.
The new execution-test family covers M01-M10 and a B-frame snap, but no claimed execution proof follows merely from those test bytes.

## Reproduced contract conflict

The reproduction uses newly generated 160x90, 36-frame, explicit BT.709 limited-range H.264, with informational SEI removed. A test-only
copy changes the track matrix from identity to vertical flip. The files have equal byte size and differ only at byte offsets 21058 and
21059. Both sources remain unchanged across two independent trusted observations each, and the repeated facts are identical.

| Observation | Identity control | Container-only vertical flip |
|---|---|---|
| Full stream matrix | absent in ffprobe output | `[65536, 0, 0, 0, -65536, 0, 0, 0, 1073741824]` |
| ffprobe convenience rotation | no transform | 0 degrees |
| Decoded frame side data | absent | `3x3 displaymatrix` on every frame |
| Typed frame evidence | absent | `{carrier: "frame", kind: "display_matrix", seiUuid: null}` |
| Accepted A1 evaluation | CONFORMS | REFUSE |
| Accepted A1 planner | DIRECT | REFUSE |

The flip produces both findings under the unchanged accepted source:

1. `display_d4_non_identity` / `deferred_reencode` (`profile.ts`, the full-matrix check).
2. `display_matrix_unsupported` / `refuse` (`profile.ts`, the frame-side-data check).

The accepted evaluation gives refusal precedence over deferral. A separately labelled **synthetic counterfactual**, which omits the
observed frame matrix, produces DEFER. It is not accepted as a truthful observation and is never used for ingest.

Receipt SHA-256 (`13-display-carrier-conflict.json`):
`54b2227dbcbe0d6fb09483cfb9489a1244cb781c6110aec611f16d4cf9891592`.

The A2 task requires D4 nonidentity to DEFER (R05), and also explicitly requires frame display matrices to remain non-informational and
nonconforming. The frozen A1 source implements the latter rule. The pinned runtime exposes both carriers for this container-only case.
Silently suppressing the decoded frame carrier, weakening A1's refusal, or changing the required DEFER outcome would choose an
unapproved interpretation. Implementation stopped at the required accepted-contract conflict condition.

**Owner decision needed:** define the treatment of decoded frame matrices propagated from a container matrix. Either the observed
frame carrier continues to force REFUSE for this D4 case, or the owner authorizes an evidenced distinction between container propagation
and independently frame-carried orientation. A permitted distinction needs an explicit evidence rule; matching convenience angles or
assuming an unknown frame entry is informational cannot supply one.

## Verification and unchanged scope

Fresh evidence is synthetic media on the pinned local FFmpeg/ffprobe only. No owner footage, model inference or network was used.
The A1 profile identity, schema versions, ordered operation vocabulary, plan/computation/derivation identities, N1 semantics/template/
recipe, legacy identity domains, renderer, permit, lifecycle authority, protected files, dependencies and lockfile are unchanged.

The A2 inspection path is tested only to the stated 14/15 result. Compiler/runtime, verification/publication/cache, authorization and
owner-media gates remain open. The remaining A1/B1A/B1B/3D/3E-A/2B regressions, final schema check and workspace audit have not run.
The phase is not complete, not committed, not pushed and not owner-accepted. No later phase is started or authorized here.

## Intentional worktree files

- `scripts/media-ingest-local.ts`: partial held-byte fact extraction and request/binding checks.
- `tests/support/canonical-media-fixtures.ts`: additive generated A2 fixtures; B1B generator unchanged.
- `tests/support/canonical-plan-media.ts`: generated-only matrix, SAR and crop patching.
- `tests/media-ingest-facts-media.integration.ts`: F01-F15, with F05 still failing.
- `tests/media-ingest-plan-media.integration.ts`: initial execution proof tests, not run.
- `docs/CURRENT_PHASE.md` and this record: current stop and preserved evidence.

All remain unstaged. The 18 authorized historical untracked files are preserved separately and are not part of this list.

## Owner resolution: propagated matrix carriers (2026-10-07)

The owner accepted the preceding failure as evidence-carrier ambiguity. The preceding stop and evidence are historical, preserved here.
The narrow ruling permits one semantic transform only when exactly one stream matrix is repeated, coefficient for coefficient, on
every expected decoded frame under the pinned observation method, invariant throughout the sequence and without a conflicting second
geometric source. Both observations must remain in facts. Independent frame matrices are still refused.

The additive optional `displayMatrixCarriers` fact retains the complete stream matrix list and the complete decoded-frame matrix lists
by presentation index. Its method is `ffprobe_9_0_1_threads_1_matrix_carriers_v1`; the evaluator recomputes the equality and completeness
conditions rather than trusting a caller-supplied propagation flag. Historical facts without this evidence still refuse frame matrices.
Unknown side data and cropping prevent propagation qualification. Identity receives normal identity handling; nonidentity D4 defers;
translation, scale, shear, perspective, arbitrary rotation and non-unit-w remain refused. No matrix pixels are processed.

The empirical authority is the container-only two-byte mutation and independent 36-of-36 frame observation above. Toolchain:

- FFmpeg 9.0.1 essentials: SHA-256 `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3`.
- ffprobe 9.0.1 essentials: SHA-256 `19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f`.
- Single-thread decoder observation (`-threads 1`), full stream and frame side-data JSON; fresh verified descriptor for every pass.
- Independent raw receipt `16-display-carrier-raw.json`: SHA-256 `8843413e2043b91ad2a753aac579824b313daf12cb29d61dcc5a0b80d8845574`.

`18-matrix-red.log` records 3 failing newly authorized outcomes and 6 passing refusal controls before implementation. The focused pure
carrier/profile suite passes in `20-matrix-profile-green.log`. The facts suite reruns in `21-facts-green.log`, retaining every carrier
across two fresh observations. Profile/version identities and all N1 semantics remain unchanged. This is a carrier clarification,
not admission of general frame orientation or authorization for B2-B.

## Completed A2 implementation

The production entry point now derives facts from the authorized exact source bytes, evaluates CanonicalMediaProfile v1, and returns
DIRECT, legacy NORMALIZE_N1, PLAN, DEFER or REFUSE. DIRECT requires profile CONFORMS. The request is a closed source/authorization/runtime
surface: unknown keys, including facts, output facts, classification, matrices, operations, plans and argv, are rejected. Source and
output facts are never supplied by a production caller. No renderer admission, permit, public authorization or lifecycle rule changes.

The accepted Facts, Profile and Plan versions remain 1.0.0; plan derivations are 0.2.0. The profile identity remains
`canonical_media_profile_v1_376754b913318b36c3e57de8192590b7f7d6380abd8d08c7e94f1759723dfafb`.
The only A1 fact-schema addition is the optional, typed matrix-carrier evidence expressly authorized in the owner ruling above.
The plan vocabulary, order, parameters, identity rules and profile limits are unchanged. `plan.ts`, `canonical.ts` and the public
authorization schema are unchanged. An absent range remains REFUSE; the BT.709 assumption never supplies a range.

### Exact-byte observations

Every subprocess uses a fresh held descriptor joined to the anchor's device/inode and freshly verified size/hash. The pinned executable
is rehashed immediately before spawning. Instrumentation precedes the final verification; results are accepted only after source/output
object and byte reverification. Owner paths do not become subprocess arguments. No shell, PATH fallback or caller argv is available.

The adapter independently parses each video track's `pasp` sample-entry box and observes every SPS through the pinned `trace_headers`
bitstream instrument. It joins the two by exact track ID and retains disagreements. All full matrix coefficients and every observed
decoded-frame matrix carrier survive extraction. Container `clap` and ffprobe Frame Cropping must agree; an independent no-autorotate
decoded listing measures the resulting cropped dimensions. Declared/decoded differences cannot be admitted.

The fixed ffprobe query observes color range, primaries, transfer and matrix separately on streams and decoded frames. Unknown remains
unknown. It uses `-threads 1` for authoritative side data, following B2R e14c/e14d. The streaming header instrument binds exact 16-byte SEI
UUIDs; only the accepted x264 UUID/carrier qualifies, and other payload types or missing/unrecognized evidence refuse. Video PTS are the
decoded presentation sequence; DTS differences establish reordering, not VFR. Audio frames retain integer PTS and decoded sample counts.
Packet position/size/PTS/DTS/duration observations are joined to the same held bytes for subsequent content and timing verification.

### Closed compiler and empirical execution

The private compiler reparses the closed plan and compares it with a fresh replan. It produces one bounded stream-copy invocation:

| Operation | Execution and verification |
|---|---|
| SELECT_AV_STREAMS | Explicit maps of the planned video/audio only; exact dropped tmcd/mov_text set verified |
| REBASE_TIMELINE_ZERO | `-copyts` plus integer `setts` subtraction in each original time base; no implicit shift or trimming |
| DECLARE_SQUARE_SAMPLE_ASPECT | `h264_metadata=sample_aspect_ratio=1/1`; no pixel resampling; a legacy-qualifying DECLARE-only source uses N1 |
| SNAP_VIDEO_TIMESTAMPS | `setts` with explicit time base, `prescale=1`, and grid rounding; one source presentation frame per slot; passthrough frame policy |
| RETIME_AUDIO_CONTIGUOUS | Measured packet sample durations and cumulative previous output duration; compressed payload/order unchanged |

The target grid and rebase arithmetic come from the accepted rational plan. Only its twelve rates, inclusive P/4 displacement and
9-sample audio bound apply. No video or audio encoding is requested. AAC preroll is retained at its exact mapped instant and never
invented as a presented frame. Explicit measured packet durations preserve a complete final AAC frame instead of implicitly trimming
its tail. A balanced expression describes duration runs within the fixed 24,000-character argv ceiling. Unsupported/unbounded compilation
fails closed; the runtime cannot add an operation or widen the plan.

B2R e03c established `-copyts` rebase; e03/e11 established timestamp-filter behavior. New generated experiments in `26-compiler-experiment.log`
and `27-compiler-experiment.log` resolved the all-five AAC tail-duration problem before production integration. `28-setts-cumulative.json`
established cumulative-duration expression behavior. E14 proves quantized 30000/1001 input in a 1/600 time base snaps to 1/30000 in one
invocation using prescaling. E16 uses MOV for PCM, within the accepted ISO BMFF family, because this pinned MP4 muxer loses mono PCM's
layout declaration. The store's existing content-addressed object naming is unchanged.

All M01-M10 cases are semantically constructible and pass. Each of the following executes twice independently in separate stores, with
equal output bytes, computation identities and derivations, fresh output CONFORMS, independent decoded-frame and audio-packet listings,
and exactly one write invocation per plan:

| Case | Proven operations |
|---|---|
| M01 | SELECT |
| M02 | REBASE |
| M03 | SNAP |
| M04 | RETIME_AUDIO (AAC) |
| M05 | SELECT + DECLARE |
| M06 | REBASE + DECLARE |
| M07 | DECLARE + SNAP |
| M08 | SNAP + RETIME_AUDIO |
| M09 | SELECT + REBASE + DECLARE + SNAP |
| M10 | All five |
| E12 | B-frame SNAP, preserving presentation order |
| E14 | Quantized 30000/1001 SNAP with time-base expansion |
| E15 | SELECT dropping mov_text |
| E16 | SELECT retaining PCM with its format/layout |
| E17 | REBASE retaining AAC, including its complete sample tail |

M10 is a generated common-start source, not a fabricated fact record. The source's decoded AAC start includes the now-presented leading
packet; video begins at exactly the same rational instant. Independent tiny video/audio jitter and unspecified SAR require the other
operations, while a tmcd stream requires selection. Source/output facts, frame counts and every audio frame's sample count are measured.
The first attempted fixture did not have a common start and was rejected; its RED evidence remains.

### Legacy N1

When the frozen classifier yields NORMALIZE_N1 and the profile plan contains only DECLARE, execution enters the existing N1 block.
Its semantics, argv template, recipe, computation v0, derivation v0, authorization and store/cache rules remain unchanged. Independent
pre-integration golden measurements in `29-n1-golden.json`, repeated in `39-n1-after-integration.json` and the two committed golden
regressions, prove unchanged source/output hashes, complete identities, exact invocation and cache authorization for silent and AAC
sources. Existing B1B stereo-PCM coverage also passes. No old computation record is migrated or invalidated.

### Verification, publication and cache

The decoded-video digest binds raw codec, pixel format, bit depth, decoded dimensions, frame count and each index/size/MD5 row. The listing
dimensions and count must agree with fresh facts. Packet digests read each indexed payload directly through another verified held handle,
binding method, codec, count, index, size and MD5 under SHA-256. Timing is separately verified with integer facts. Video packet equality is
claimed only without DECLARE; with DECLARE, the derivation explicitly records rewritten parameter sets. Audio payload equality is always
required when audio is retained. The unchanged A1 builder independently checks exact video/audio temporal mapping, format, sample count,
stream selection and fresh profile conformance before creating a measured 0.2 derivation.

Publication uses the existing `.local-media/canonical-v0/` authority: fully verified pending output, read-only seal and sync, no-overwrite
hard link, reopen/hash/fresh facts/full verification of the winning object, then a no-overwrite computation record. Identical concurrent
executions produce one publisher and one independently verified loser. The 0.2 computation record binds source bytes and facts digest,
full plan, pinned toolchain and verified output. It contains no path, project, authorization or lifecycle state. The 0.1 record bytes and
identity domain remain unchanged.

A cache hit repeats exact source verification, output rehash, fresh output facts, conformance, media content and temporal verification,
and record comparison/reread. Only canonical bytes are reused. Authorization is freshly derived from this caller's consenting root.
Tampered/conflicting objects and records fail closed and are never repaired in place. Failed processes, partial output, timeout,
source/output mutation or replacement, wrong payload/grid/frame count and substituted computations produce no trusted authorization.

### Owner-media integration and scope

The existing registration accepts derivations 0.1 and 0.2. It requires the declared root first, exact root/output identity and authorization,
full valid plan and target profile, computation/derivation identities, exact computation record and a canonical-object rehash. The derived
authorization's recipeId must equal planId for 0.2. One-level lineage and the existing root-to-derived lifecycle apply unchanged: either
deletion invalidates derivative access; the earlier expiry governs. M09 registers actual newly produced bytes and proves root deletion
invalidates derivative access. Structural registration tests additionally use clearly labelled opaque synthetic bytes.

Production changes are limited to the ingest adapter, profile carrier clarification, owner-media contract and owner-media adapter. The
only audit change registers the hostile-child integration test in the existing test harness list; production process/import capabilities
are unchanged. No protected renderer/probe/permit/lifecycle code, dependencies, lockfile, public schema, model or later-phase code changes.
The positive B1B generated fixtures now opt into explicit profile color; their generator defaults and legacy N1 arguments remain unchanged.
A1's historical "not wired yet" assertions were updated only for the newly authorized integration and the exact audit registration pin.

## Continued RED, failure and regression evidence

All logs below are in the same ignored evidence directory. Actual media is newly generated synthetic media, run with the no-network guard.
No real/owner footage, research media, network service or model inference is represented by these results.

| Evidence | Result and correction |
|---|---|
| `22-plan-execution-red.log` | 11 RED: absent plan runtime and the initial invalid common-start fixture |
| `25-compiler-experiment.log` | Experiment import-location error; corrected without changing accepted contracts |
| `26-compiler-experiment.log` | Ten classes succeed; all-five output lost 768 tail samples, so it was not accepted |
| `27-compiler-experiment.log` | All eleven initial classes preserve exact mappings and two-run bytes after explicit durations |
| `32-record-red.log` | Versioned plan record absent: RED |
| `34-runtime-first-green.log` | Initial runtime/record family 12/12 PASS |
| `36-owner-red.log` | Three absent 0.2 registration failures and one refusal control |
| `38-trust-owner-green.log` | Fixture-store placement and malformed consent-test issues; corrected in tests |
| `41-b1b-regression.log` | Corrupt source threw at the new observer; restored fail-closed REFUSE before observation |
| `45-select-pcm-proof.log` | Subtitle frame lacks an A/V index; PCM MP4 layout loss; corrected typed frame selection and fixed MOV output |
| `49-additional-media-proof.log` | All-five, mov_text, PCM selection and AAC rebase 4/4 PASS |
| `50-pure-regressions.log` | Two obsolete A1 not-wired assertions fail; updated for explicitly authorized A2 wiring |
| `52-a2-focused-media.log` | 51/51 PASS before the final caller-injection assertion and pre-spawn verification review |
| `53-pure-regressions.log` | 211/211 PASS: A1 88, B1A 87, B1B pure 22, A2 pure 14 |
| `55-b1b-media-regressions.log` | 27/27 PASS |
| `56-owner-render-editorial-regressions.log` | 174/174 PASS: 3D 24, render pins 96, editorial 54 |
| `57-render-freshness-media-regressions.log` | 37/37 PASS: Batch 2B actual-media 34, 3E-A freshness actual-media 3 |
| `60-a2-final-media.log` | 56/56 PASS: final A2 media 52 plus owner registration 4 |
| `63-owner-root-green.log`, `64-root-mutation-kill.log` | Strengthened direct missing-root reference test passes and kills the weakened root rule |
| `65-typecheck.log` | PASS |
| `66-workspace-audit.log`, `67-workspace-audit.log` | New hostile test required registration; one-list-entry correction; audit PASS |
| `69-build.log`, `71-schema-check.log` | Clean build PASS; 33 schema and synthetic fixture artifacts verified unchanged |
| `72-audit-registration-regressions.log` | Final affected plan/audit/owner suite 72/72 PASS |
| `73-reviewed-mutations.json` | 22/22 code mutants killed after the explicit review below |
| `73-historical-preservation.json` | All 18 authorized historical untracked files still match their handoff hashes |

The first in-memory mutation harness attempt (`58-*`) failed before test loading because a Windows absolute path was used as an ESM
import URL; it is not counted as a kill. The corrected `61-*` run applied every transform. Two application/test failures (snap bound and
misrouting a multi-operation plan through N1) were initially marked for manual review because they raised owned validation errors rather
than ERR_ASSERTION. Both are real test kills. One missing-root mutant initially survived because an empty manifest failed a different
schema rule; the direct missing-root reference assertion above closes that test gap. No production weakening was made.

The final mutation review covers caller facts, matrix collapse/general frame admission, unspecified range, both displacement bounds,
operation omission/order, computation source/plan binding, output conformance, decoded/video/audio payload checks, root/recipe checks,
N1 routing in both directions, authorized source bytes, cached facts and cached authorization. `68-hash-mutation.log` additionally replaces
fresh hashing with a cached inode hash: all four source/output/sealed/cache-tamper tests detect missing rejection. These transforms affect
only the Node loader's in-memory source, never the worktree or compiled files. Hostile subprocess tests independently attack wrong pixels,
audio payload, grid, omitted snap, dropped frames and process failure.

Final A2 accounting: 52 actual-media tests (16 facts/routing, 15 execution classes, 19 trust/hostile, 2 N1 golden regressions) and 14 pure
tests (9 carrier, 1 computation record, 4 owner-media), all passing. The final owner test strengthening is separately green in `63-*`
and again in `72-*`. The build, schema check, audit and diff check pass. The complete production diff was read and checked for protected
changes and private/source media. Staging is restricted to explicit A2 source/test/documentation paths.

**AUTHORIZED HISTORICAL UNTRACKED FILES TOUCHED: NO.** No owner artifact, generated media, `.local-runs` output or research evidence is
part of the implementation change set. B2-A1 acceptance remains the existing `9cd3395` commit; N1 history and identities are preserved.

## Limitations and next boundary

- Evidence is generated synthetic media on the pinned Windows FFmpeg/ffprobe build. Owner-footage generalization and real derived-source
  end-to-end rendering remain unverified. The old owner-footage harness was not run.
- Fact/packet/listing output, container metadata, source/output sizes, process time and compiled argv remain bounded. Large-source
  verification cost and every possible ISO BMFF sample-entry variant are not established; missing or unsupported evidence fails closed.
- Actual audio retiming proof is AAC. PCM selection/retention is proved; the attempted PCM retime fixture did not exhibit a decoded timing
  defect and is not claimed as retime proof. The pre-existing N1 mono-PCM MP4 layout refusal remains unchanged.
- Explicit limited range remains required; unspecified range, independent frame transforms, crop, interlace, HDR, unknown side data and
  unsupported color remain refused. True VFR and explicit non-square SAR remain deferred.
- B2-B's intended separately reviewed alpha scope remains only D4 orientation/mirror pixel baking and HEVC 8-bit SDR to H.264. Neither is
  implemented or started here. 3E-C requires subsequent owner direction/review; Phase 6 and Gate 7 completion are not authorized by A2.

## Owner acceptance (2026-10-08)

The owner accepted Batch 3E-B2-A2 at `871cd69301e60e46ebfc64ffc44baef7067fd8e9`:

- production-enforced CanonicalMediaProfile v1 and trusted exact-byte fact extraction;
- exact-remux plan execution and v0.2 derivation/computation records;
- cache/publication semantics and owner-media 0.2 integration;
- frozen N1 compatibility;
- the narrow propagated-display-matrix evidence clarification: one stream matrix repeated identically on every decoded frame is one
  semantic transform with both carriers recorded; independent, incomplete, varying or conflicting frame transforms remain refused.

This is a documentation-only acceptance checkpoint. No production code, test or historical evidence is changed and no additional
verification is claimed. All limitations above remain. The owner separately authorizes B2-B1 generated-media research, exact independent
D4 verification and pure additive lossless re-encode contracts. Lossy canonical video encoding is not authorized. B2-B1 has not started
at this checkpoint; B2-B2 production execution, 3E-C and Phase 6 are not started or authorized. Gate 7 remains not yet complete.
