# Phase 5 / Gate 7 / Batch 3E-B2-B1 — lossless canonical re-encode contract

Date: 2026-10-08. Status: **IMPLEMENTED; OWNER REVIEW PENDING**. Required regression and staged review gates pass.
Scope: pure additive contracts, independent sample verification, generated-media research. **No production re-encode execution.**
No owner footage, network research, model inference, dependency change, delivery-quality compromise or later phase work.

## 1. Baseline and owner ruling

| Checkpoint | SHA / result |
| --- | --- |
| Requested and observed baseline, local/tracking/live | `871cd69301e60e46ebfc64ffc44baef7067fd8e9` |
| Baseline parent | `9cd339534867260ec77461776a85f7c33ab0aa75` |
| Main, origin/main and live main | `4f85b559c7eff2c24e221011f3ee1dd1466a111d` |
| Initial relation to main | 9 ahead, 0 behind |
| Initial tracked/staged work | Clean; exactly the 18 owner-listed historical untracked files |
| A2 owner-acceptance documentation commit | `c4c448028bb9d772702d36023632bf54da3927dc` |
| Acceptance commit publication | Same branch pushed; local = tracking = live verified before B1 work |

Branch: `phase/5-gate7-3e-production-hardening`. No merge or reset. The acceptance commit changed only CURRENT_PHASE and the
[A2 phase record](phase-5-gate-7-batch-3e-b2a2-executable-typed-remux.md#owner-acceptance-2026-10-08). It records owner acceptance of
production Profile v1, trusted exact-byte extraction, typed exact-remux execution, 0.2 records, cache/publication, owner-media 0.2,
frozen N1, and the narrow propagated-matrix-carrier clarification. Historical evidence was preserved.

The current owner ruling prohibits **all generational image-quality loss in canonicalization**. QP-zero lossless is the only selected
re-encode mode. CRF, perceptual similarity and quality-versus-storage thresholds are not canonical policies. Original bytes stay immutable;
a later production output must be a new content-addressed derivative with one-level root lineage in the existing store.

Accepted authorities inspected: AGENTS, CURRENT_PHASE, B1A/B1B phase records and code, the A1 Profile/Facts/Plan/0.2 record, A2 runtime,
generated-media tests and historical B2R evidence referenced by A1. This batch does not rerun B2R owner-media research. The facts/evaluator,
all exact-remux repair rules, N1 definitions and runtime routing remain unchanged.

## 2. Evidence locations and runtime

`E = .local-runs/phase5-gate7/batch3e-b2b1-20261008/` (ignored, local evidence only). Full receipts retain argv, stderr, hashes,
facts, pixel digests and measured durations. Tracked tests/harnesses reproduce the experiments; generated media is never committed.
Final media-suite receipts are in the corresponding ignored `b2b1-generated-*` test directories. Mutation runs have their own receipts.

| Evidence | Claim / outcome |
| --- | --- |
| `E/00-baseline.json` | Baseline and hashes of all tracked files and 18 historical artifacts |
| `E/01-x264-help.log` | Actual pinned libx264 option and pixel-format inventory |
| `E/02-baseline-build.log` | Baseline build PASS |
| `E/03-*`, `04-*`, `05-*` | Initial direct-TS import failure; compiled reference RED (9 failures), then 11/11 GREEN |
| `E/06-pilot.*`, `pilot/` | HEVC identity and seven D4 transforms, two executions each; independent pixels and fresh facts |
| `E/08-profiles.*` | Raw fixture metadata negotiation failure, retained as failed evidence |
| `E/09-profiles.*`, `profiles-v2/receipt.json`, encoder JSONs | Five lossless configurations, small/1080p twice; initial 4K twice |
| `E/11-contract-red*` | Pure contract RED: 36 missing-behavior failures and one invariant control |
| `E/12-4k-medium.*`, `profiles-v2/4k-medium-receipt.json` | Additional medium/two-thread 4K proof, two runs |
| `E/13-*`, `14-*`, `15-*` | Unused-import compile failure; emitted JS 37/37; then corrected clean build |
| `E/17-media.log` | 23/27 pass; four timestamp-snap experiments reject incompatible `-r` plus passthrough |
| `E/19-pure.log` | 72/73; test used planning outcome name instead of the actual profile outcome enum |
| `E/20-media.log` | Corrected timestamp-only compiler, 27/27 PASS |
| `E/21-final-profile.*`, `final-profile/receipt.json` | Final fixed profile including filter_threads=1; small/1080p/4K twice |
| `E/24-*`, `28-*` | Controlled in-memory mutations and reviewed follow-up; earlier setup failures/survivals preserved |
| `E/27-media.log` | Final media suite 28/28 PASS, including fresh evidence versus a cached receipt |
| `E/30-pure-final.log` | Final pure suite 77/77 PASS |

Pinned tools, rehashed before each new research child:

| Tool | Version | SHA-256 | Bytes |
| --- | --- | --- | ---: |
| ffmpeg | `9.0.1-essentials_build-www.gyan.dev` | `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3` | 102856192 |
| ffprobe | same | `19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f` | 102652416 |

Windows x64, Node 24.15.0; existing TypeScript/Zod installation, no downloads. Actual encoder is libx264 (core 165 r3223).
Fresh semantic fact observation remains the accepted single-thread authoritative extractor. The new research helper starts absolute pinned
executables without a shell, with read-only held input descriptors, exclusive new output descriptors, fd-only inputs, bounded stdout/stderr,
120-second child timeout and termination grace. It accepts only test-registered generated inputs. Output cap is 256 MiB per experiment.
Existing-output/source aliases fail at exclusive creation; source hashes are checked before/after. This is test support, not an ingest API.

## 3. Independent D4 semantics

Origin is the top-left; `(x,y)` is a **source** sample, `w,h` are that plane's dimensions. No interpolation is involved.

| Element | Destination `(dx,dy)` | Output luma geometry | Empirically matched FFmpeg filter |
| --- | --- | --- | --- |
| rotate_90_ccw | `(y, w-1-x)` | H × W | `transpose=cclock` |
| rotate_180 | `(w-1-x, h-1-y)` | W × H | `hflip,vflip` |
| rotate_90_cw | `(h-1-y, x)` | H × W | `transpose=clock` |
| mirror_horizontal | `(w-1-x, y)` | W × H | `hflip` |
| mirror_vertical | `(x, h-1-y)` | W × H | `vflip` |
| transpose | `(y, x)` | H × W | `transpose=cclock_flip` |
| transverse | `(h-1-y, w-1-x)` | H × W | `transpose=clock_flip` |

The filter names are experimental results, not the reference definition. `tests/support/canonical-pixel-reference.ts` has no FFmpeg or
process dependency. It parses tightly packed Y (`W*H`), U and V (each `W/2*H/2`) independently and applies the coordinate permutation to
each plane with its own dimensions. It requires even positive geometry and exact byte length. Seven manually enumerated 4×2 Y / 2×1 U/V
fixtures independently check the reference, including chroma. Larger asymmetric fixtures distinguish every direction/axis and every frame.

Exactly one semantic matrix is consumed. A stream matrix identically propagated to every decoded frame remains one transform, with both
evidence carriers retained in source facts. Frame-only, missing, varying, conflicting or multiple matrices refuse under unchanged v1 rules.
Autorotation is disabled and the input display-rotation carrier is overridden to identity before manual baking. Fresh output facts require
identity/absent transform. No scale, crop, pad, resample or color conversion filter is present. Codec-internal block padding does not remove
or introduce displayed samples; equality is over the complete freshly decoded display geometry.

## 4. Exact pixel verification

Method: `exact_yuv420p_planes_sha256_by_index_v1`. For each presentation index `i`:

1. Bind method, index, literal pixel format, width, height, and ordered Y/U/V plane names and lengths in canonical UTF-8 JSON.
2. Prefix the header with its unsigned 32-bit big-endian byte length.
3. SHA-256 the prefix, header, then exact Y, U and V bytes in that order.
4. SHA-256 canonical JSON `{method, frameCount, frames:[{index,digest},...]}` for the sequence. Frame order is identity-bound.

An independent literal-header test checks the wire format. Metadata/PTS are excluded from pixel bytes and verified separately. Geometry and
pixel format cannot disappear from a digest. Full source, independently expected and output frame-digest arrays are retained in 0.3 evidence.
The verifier additionally compares **every byte**, counts errors per Y/U/V plane, and measures maximum absolute sample error.

Acceptance is simultaneous: **sampleMismatchCount=0**, **maximumAbsoluteSampleError=0**, each plane count zero and exact digest equality.
There is no similarity threshold. HEVC identity compares output to decoded source. D4/HEVC+D4 compares output to independently permuted
source planes. It never asserts that rotated output bytes equal untransformed source bytes. Each original presentation index maps to exactly
one output presentation index; drop, duplicate and reorder attacks fail. Records alone are not media attestations: B2-B2 must freshly remeasure
held source/output bytes, including on cache hits, before constructing or accepting a record.

## 5. Generated corpus and results

`calibrationFrames` defines an even 64×48, nine-frame sequence with distinct quadrant/corner/interior values, 1/2-sample lines, smooth
luma/chroma gradients, deterministic high-detail patterns and moving asymmetric regions. Every frame differs and U/V are nonconstant.
The fixture generator encodes test sources at QP 25 as H.264 or HEVC; this constructs input bytes and is not canonicalization. The oracle
always starts from those **decoded source bytes**, never the pre-source-encode raw image. The canonical encoder always uses QP 0.

Additional A2 fixture generators supply 160×90 / 36-frame testsrc2, AAC and PCM, exact nonzero starts, near-CFR jitter, timecode selection,
unspecified SAR and HEVC B-frames. Container matrices are changed only in new generated fixture copies. Bounded resolution stress uses the
same rich pattern at 1920×1080 / 30 frames (1 second) and 3840×2160 / six frames (0.2 seconds), video only. These are synthetic full-resolution
measurements, not natural/owner-footage generalization.

Final media suite:

- All seven D4 elements for **both H.264 and HEVC**, two independent executions each: exact samples, counts, geometry, SAR, color, output
  timing, fresh profile conformance and identical output bytes/facts/derivations.
- HEVC identity and explicit limited BT.709: exact decoded Y/U/V. HEVC unspecified description with explicit limited range: exact pixels,
  source null descriptions retained, output explicit BT.709, two independent runs.
- SELECT+D4, REBASE+D4, SNAP+D4, AAC+HEVC identity, AAC RETIME+D4, SELECT+REBASE+D4, HEVC+D4+SNAP, HEVC+all five repairs+D4,
  PCM copy+SELECT+D4 and HEVC B-frames+SNAP+D4: all pass twice. No video frame is dropped/duplicated/generated/blended.
- The unchanged renderer `parseProbeJson` / `evaluateInputConformance` accepts every measured canonical output, including audio when
  present. Pinned FFmpeg independently decodes the lossless H.264. This proves current software conformance/decodability, not browser or
  hardware-decoder compatibility, nor a production derived-source render lifecycle that B2-B2 has not implemented.
- Source alias/existing-output refusal and cached-receipt attacks pass. A valid previous record cannot approve fresh different pixel samples
  or a residual display matrix.

## 6. Fixed lossless profile and negotiated media

Profile: `CanonicalLosslessEncodeProfile 1.0.0`

`canonical_lossless_encode_profile_v1_b5a0d8d303c8f62a0d44fecc65b07221fedb1e4ae74d84a4dba66c4bb62a1dc4`

Exact tested configuration (placeholders are derived from fresh facts/the typed plan; never caller argv):

```text
-hide_banner -nostdin -nostats -loglevel verbose -benchmark
-copyts -filter_threads 1 -threads 1 -noautorotate -display_rotation:v:0 0
-protocol_whitelist fd -fd 3 -i fd:
-map 0:<videoIndex> [ -map 0:<audioIndex> -c:a copy ]
-vf <D4 if any>,setsar=1,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709,<PTS repairs if any>
-noautoscale -c:v libx264 -qp 0 -preset medium -profile:v high444
-pix_fmt +yuv420p -threads:v 2 -bf 0 -g 30 -sc_threshold 0
-x264-params lookahead-threads=1:sliced-threads=0 -a53cc 0 -udu_sei 0
-color_range tv -color_primaries bt709 -color_trc bt709 -colorspace bt709
-fps_mode passthrough -enc_time_base:v 1:<outputTimeBaseDenominator>
-video_track_timescale <outputTimeBaseDenominator> [ -bsf:a <accepted exact setts> ]
-map_metadata -1 -map_chapters -1 -avoid_negative_ts disabled -fflags +bitexact
-fs 268435456 -f <mp4 for video/AAC; mov for PCM>
-protocol_whitelist fd -fd 4 fd:
```

Empty filter placeholders and their commas are omitted. There is one bounded encode process per plan. Process safety/logging limits are
research bounds, not new domain argv inputs. The profile binds codec, QP-zero mode, preset, H.264 profile, pixel format, decode/encode/filter/
lookahead threading, GOP, metadata, explicit signaling, timing/mux policy and reproducibility domain. Remaining libx264 defaults are fixed by
the exact binary and preset. `high444` enables the H.264 lossless profile; it **does not change the sample format to 4:4:4**. Fresh facts and raw
decodes remain 8-bit yuv420p. `+yuv420p` disables automatic format conversion; `-noautoscale` disables automatic scaling. Verbose negotiated
graphs and exact bytes show no inserted conversion. `setparams` and `setsar` change interpretation metadata only; zero pixel error is separately
required. Explicit limited BT.709 source stays explicit limited BT.709. Unspecified accepted primaries/transfer/matrix stay null in source facts
and are marked `interpreted_as_bt709_v1`; the output writes canonical BT.709 without pretending it came from the camera.
**Unspecified color range remains REFUSE**, never inferred from luma.

Timing uses only parameters produced by the unchanged v1 planner. REBASE subtracts its integer offset in the original time base. SNAP sets
the filter time base to the plan denominator and writes presentation frame `N` to `N*gridPeriodTicks`. Passthrough retains the one-to-one
sample mapping. There is no `fps` filter or `-r` override. Exact output PTS/table/rate are verified. Audio is stream-copied; where authorized,
the existing packet/sample-duration `setts` semantics preserve preroll and tail durations. Packet payload digests by index must match.
PCM copying/selection is proved; **PCM retiming is not newly claimed**. No audio resampling, encoding, padding, trimming, remixing or gain.

## 7. Determinism, alternatives tried, and performance

All serious candidates were QP-zero lossless. Small and 1080p fixtures ran twice for ultrafast/two threads, veryfast/one, veryfast/two,
veryfast/four, and medium/two. The bounded 4K fixture ran twice for veryfast/two and medium/two. Each configuration repeated identical bytes,
fresh facts and exact pixels. Thread policy is part of identity: differing thread counts can change output bytes even when size/pixels agree.
No claim of thread-count interchangeability or cross-hardware reproducibility is made.

Selected medium/two reduced 1080p output from 55,113,737 bytes (veryfast) or 61,147,213 (ultrafast) to 36,283,983, while total encode-plus-verify
time was better than veryfast in these measurements. It retained exact equality. One-thread encoding was slower; four threads was faster for
veryfast but gave no size benefit. This is a bounded empirical selection, not an exhaustive optimizer or a claim that one thread is required.

Final configuration, two executions per fixture, including fixed filter_threads=1 and full new derivation verification:

| Fixture | Source bytes | Output bytes | Ratio | Encode ms (runs 1 / 2) | Encode fps | Encode time / media time | Verify ms (runs 1 / 2) |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| 64×48, 9 frames, 0.3 s | 14,599 | 30,562 | 2.0934× | 72.65 / 47.04 | 123.88 / 191.34 | 0.242 / 0.157 | 926.59 / 735.99 |
| 1920×1080, 30 frames, 1 s | 19,338,391 | 36,283,983 | 1.8763× | 3254.03 / 3314.55 | 9.22 / 9.05 | 3.254 / 3.315 | 6177.20 / 6597.53 |
| 3840×2160, 6 frames, 0.2 s | 15,091,995 | 30,508,050 | 2.0215× | 2939.67 / 2957.86 | 2.04 / 2.03 | 14.698 / 14.789 | 4898.84 / 4882.33 |

Verification time includes fresh output facts, independent source/output raw decodes, full byte comparison/digests, exact identities and
derivation validation; source fact extraction precedes encoding and is not included. Timing is wall time on this machine, not a throughput
promise. FFmpeg `-benchmark` maxrss telemetry is retained, but no independently calibrated system/whole-verifier peak-memory claim is made.

Repeated final output SHA-256:

| Fixture | Both runs |
| --- | --- |
| small | `5fae8421b12292440f1594a3cd4ee599662740c09038d047d85d362318aa47be` |
| 1080p | `0eb81b10209653fd67eaa9131773795e7e5abb73f2c23453b8f991d4936a08bb` |
| 4K | `f008570e39393b90c26e8ac6166491846ca5a8a60c5a9802a16ab4f40ffc1d16` |

Proven reproducibility domain: **same machine, same pinned build, source bytes, full plan and fixed profile**. No cross-CPU, cross-OS,
cross-build, hardware-decoder, long-duration or concurrent-ingest performance proof. Full-resolution stress files are large: offline working
storage and verification cost need explicit capacity planning. The architecture already accepts a bounded `limits.maxOutputBytes`; B2-B2
must use an explicit lossless allocation within existing hard ceilings, refuse exhaustion and never retry lossy. The remux default
`2*source+1MiB` is not a general lossless size guarantee and must not be assumed. These finite experiments establish feasibility, not a
production capacity commitment. Owner review of the operational cost is still pending.

Rejected/failed experiments are retained: missing raw fixture color metadata prevented negotiation with automatic conversion disabled;
the fixture generator now declares metadata before its source encoding. `-r` plus passthrough was rejected by FFmpeg and removed; exact PTS
filters alone passed all timing cases. Neither failure was solved with a scaler, fps resampler or relaxed sample comparison. Ultrafast and
veryfast remain measured lossless alternatives, not selected contracts. CRF mutation output is deliberately invalid hostile evidence only.

## 8. Additive contract and truthful derivation

New file: `packages/media-ingest/reencode.ts`, with additive index exports. It has no process, filesystem, clock, network or cache authority.

- `CanonicalReencodePlan 1.0.0`, identity domain `canonical_reencode_plan_v1`, execution class `lossless_video_reencode_audio_copy`.
  It binds the frozen target profile, exact source codec/geometry, output geometry, D4 semantic, pixel format, selected streams, reused typed
  v1 repairs, source/output color interpretation, exact source/output timing digests and the full fixed encode profile. No argv or caller
  profile is accepted. The original v1 evaluation runs first and all refusal/deferred findings remain controlling.
- A private hypothetical H.264/identity projection is used **only** to obtain existing repair parameters from the unchanged v1 planner.
  The original facts/evaluation remain the source authority and are retained. The projection is not observed evidence, never published and
  cannot hide an unsupported finding. DIRECT/N1/remux-only inputs return `EXISTING_PATH`.
- Computation domain `canonical_media_computation_v2` binds source asset/hash/size, complete plan and pinned toolchain. Paths, scope,
  user, date, time and randomness do not enter it. Authorization is separate.
- `CanonicalMediaDerivation 0.3.0`, exported as `CanonicalReencodeDerivationSchema`, identity domain `canonical_media_derivation_v2`.
  It retains the consenting original root, source exact identity/full facts/digest/evaluation, complete plan/profile/toolchain, output exact
  identity/full fresh facts/digest/evaluation, source/expected/output ordered pixel digests and zero-error measures, exact geometry/format/
  frame mapping, video/audio timing digests and retained audio payload proof. Validators replay the original evaluation and plan and check
  actual recorded output conformance. D4 claims equality to the independently transformed expected samples, not unchanged source samples.
- Candidate toolchain canonicalizer: `ci_canonical_lossless_reencode` / `0.3.0`; semantics/implementation descriptor digest
  `38ff61fefad05618d051a50b8642cd3297fe9aa4c895539c11be2ac0181b29d3`.

CanonicalMediaProfile v1, CanonicalizationPlan 1.0.0, derivation 0.1/0.2, old identity domains, old derivation union, N1 semantics/argv/recipe,
golden outputs and routing are unchanged. Pure byte pins guard their source modules. No production ingest/publication/authorization/store/
owner-lifecycle code was modified. Workspace audit adds exactly the new test subprocess helper; the existing purity test adds the new pure
module under unchanged restrictions. No renderer, permit, freshness, public schema, dependency or lock change.

## 9. Adversarial gates and regression ledger

Pure negatives include 10-bit, PQ, HLG, BT.2020, full/unspecified range, 4:2:2, 4:4:4, interlace, unknown side data, crop/clean aperture,
odd/conflicting geometry, conflicting SAR, held-first ambiguity, and matrices with translation, arbitrary rotation, scale, shear or perspective.
True VFR and non-square SAR remain DEFER. Supported HEVC/D4 does not mask any second finding. No negative yields an executable plan.

Hostile record/reference tests cover one-sample Y/U/V errors, omitted format/geometry, wrong rotation/mirror/transpose, double application,
residual matrices, dropped/duplicated/reordered frames, wrong audio payload, cached facts/evaluation, arbitrary argv/profile, lossy QP,
toolchain/source tampering, and path/time injection. An independent literal digest header checks format/geometry binding.

Mutation accounting: 28 mutations reviewed; 23 initial kills. Three D4 mutations initially failed setup because emitted indentation differed;
those were not counted. The initial unknown-range deletion and permissive encode-profile guard survived because other validation still
refused. Follow-up targets an actual null-to-tv assumption and adds a self-hashed plan attack isolating the fixed-profile guard. All five
follow-ups are genuine test failures with the transform applied. Final **28/28 killed**, no worktree/dist mutation. Earlier logs remain.

`33-a1.log` records 87/88: the audit's whole-file hash correctly detected the newly authorized single test-helper registration. C08 now
requires exactly that addition, reverses it in memory, and still compares against the original A2 audit hash; every production/old-contract
pin stays unchanged. `42-a1.log` is 88/88 PASS. This is a test-boundary accounting update, not a runtime permission expansion.

Automatic approval review twice blocked the nine-test synthetic `edit-real-footage-harness.test.js` because its name resembles the prohibited
owner-footage runner. Source inspection shows in-memory text fixtures and an injected test backend; no real media/model execution. At that
checkpoint it remained unrun pending explicit clarification; the actual `edit-real-footage.local.js` owner-footage harness is not invoked. Earlier approval-service
usage/network errors also prevented commands from executing; those are not test failures or passes.

`38-owner-media.log` retains the Windows TEMP short-name/long-name mismatch (14/15). Using the same process-local long TEMP convention
as prior gates, `44-owner-media-longpath.log` passes all 15 without a production/test-code change. No historical owner-footage harness is run.

| Gate | Evidence under E | Result |
| --- | --- | --- |
| B2-B1 focused pure | `30-pure-final.log`, `48-pure-final.log` | 77/77 PASS; reviewed typed clean-aperture case also passes |
| B2-B1 generated media | `27-media.log` | 28/28 PASS |
| In-memory mutations | `24-mutations.json`, `28-mutations.json` and individual logs | 28/28 reviewed kills |
| B2-A2 pure | `31-a2-pure.log` | 14/14 PASS |
| B2-A2 facts/execution/trust media | `32-a2-media.log` | 50/50 PASS |
| B2-A1 | `42-a1.log` | 88/88 PASS |
| B1A | `34-b1a.log` | 87/87 PASS |
| B1B pure | `35-b1b-pure.log` | 22/22 PASS |
| B1B generated media | `36-b1b-media.log` | 27/27 PASS |
| N1 golden (completes A2 total 66/66) | `37-n1-golden.log` | 2/2 PASS |
| Synthetic owner-media compatibility | `44-owner-media-longpath.log`, `52-owner-authorized-synthetic.log` | 24/24 PASS (15 + explicitly authorized 9); earlier block retained above |
| Renderer/probe/review/audit pins | `39-render-pins.log` | 96/96 PASS |
| Typecheck | `45-typecheck.log` | PASS |
| Final clean build | `47-build-final.log` | PASS |
| Schema check | `49-schema-check.log` | PASS: 33 schema and synthetic fixture artifacts unchanged |
| Workspace audit | `46-workspace-audit.log` | PASS: 133 application files, 18 unchanged runtime adapters, 8 registered test process files |
| Preservation | `43-preservation.json` | Every original tracked file checked; only six authorized paths differ, including A2 acceptance docs; all 18 historical files unchanged |

Prior staged-diff checkpoint: all 12 explicit paths reviewed completely; cached/working diff checks PASS. No generated media, `.local-runs`,
owner media, private paths, protected runtime changes, dependencies or lock changes are staged. Rechecking every baseline file still finds
only the six authorized existing-file changes listed above, and all 18 historical files remain byte-identical. Local/tracking/live remain
`c4c448028bb9d772702d36023632bf54da3927dc`, 10 ahead/0 behind main; local/tracking/live main remains the recorded baseline SHA.
At that checkpoint there were 506 passing tests plus 28 reviewed mutation kills. The nine-test synthetic file remained unrun pending the
owner's explicit reply to the approval-review clarification. No B2-B1 commit or push was made with that gate unresolved.

Final owner-authorized regression closure (2026-10-08): the owner explicitly authorized exactly
`node --test dist/tests/edit-real-footage-harness.test.js`. Before execution, the installed TypeScript 5.9.3 compiler emitted the project
entirely in memory; all 269 compiled JavaScript modules matched their existing bytes, including the named test. No source, executable or
staged implementation was rewritten. `51-authorized-test-identity.json` records source SHA-256
`e0a45d8e15a871b153cef8ad7bc5bd5ffec5cae2bea94dd039413cad51cc8df3` and compiled SHA-256
`8ea7d1b2eeceeb96cef04d139801ccd6bba42eff6a1a18b2c12b5aa18f5042c5`.

The first authorized invocation lost its tool session after seven observed passes, with no final status available and no process remaining;
it is not counted as a complete result. Repeating the **same authorized command** returned exit 0, **9/9 PASS**, zero failures, cancellations
or skips, duration 205334.8634 ms. Raw tool output is preserved in `52-owner-authorized-synthetic.log`. No real footage, model inference,
network execution, production rendering or full owner-footage harness was run. The existing 77/77 pure and 28/28 media logs were rechecked;
all required regressions now total **515 passing tests**, plus **28 reviewed mutation kills**. The complete staged diff was reviewed again;
no verification threshold or contract was weakened, and no lossy canonical profile was introduced. Only the final documentation checkpoint
changes after the already-reviewed staged implementation. B2-B1 is eligible for the owner's explicitly authorized commit and branch push;
owner acceptance of B2-B1 and authorization of B2-B2 remain separate.

## 10. Exact B2-B2 remaining scope and boundary

B2-B2 is **not started or authorized by this batch**. After owner review/authorization, its implementation must:

1. Add the new class inside the existing `canonicalizeLocalMedia` authority, deriving original facts and the closed plan from held exact
   source bytes. Preserve all legacy DIRECT/N1/remux routes and identities. Caller facts, plans, argv and profiles stay forbidden.
2. Implement the fixed profile and tested D4/PTS/audio mappings in one bounded invocation, with no quality fallback, no hidden conversion,
   read-only source descriptors and explicit lossless resource bounds. Refuse unsupported/budget-exceeding work.
3. Stream/bound the independent canonical Y/U/V verification method for production-scale media; retain fresh full semantic/timing/audio
   verification before publication and on every cache read. Derive records from measured bytes, never cached quality assertions.
4. Add versioned 0.3 computation/publication/cache records and owner-media registration/derived-authorization support. Use the existing
   no-overwrite content-addressed store, root-first one-level lifecycle and fresh authorization; `recipeId` names the new complete plan ID.
   Keep old records valid and their identities unchanged. No second store, media-truth authority or lifecycle authority.
5. Prove failures, races, mutation/sealing, cache recomputation, exact resource exhaustion and actual derived-source renderer lifecycle with
   generated media, then the separately authorized owner gates. Any required change to an accepted identity returns to owner review.

The image-quality policy is fully specified: zero Y/U/V error and exact expected-frame digests, with no lossy option. Operational deployment,
capacity thresholds, long-form/owner-footage generalization and production cache/lifecycle execution remain future evidence, not B1 claims.

3E-C: **NOT STARTED**. Phase 6: **NOT STARTED**. Gate 7: **NOT YET COMPLETE**. No merge to main.
