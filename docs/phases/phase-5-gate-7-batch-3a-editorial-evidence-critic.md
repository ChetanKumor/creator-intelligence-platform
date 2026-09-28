# Phase 5 Gate 7 Batch 3A — Editorial evidence surfaces and semantic critic foundation

Implementation and verification record. Status date 2026-09-27. Branch `phase/5-edit-planner-v0`; starting and current HEAD
`c74d5fe649ebe470ee0ea9bcb21cdfc4969641cb` ("docs: record gate 7 batch 2b owner acceptance"). All work is uncommitted and unstaged, for
independent owner review.

| Status | Value |
|---|---|
| Phase 5 Gate 7 Batch 3A implementation verification | **PASS** (final run 2, §18) |
| Actual synthetic rendered-media verification | **PASS** (O01–O08 on the pinned FFmpeg 9.0.1, §13) |
| Gate 7 Batch 3A owner acceptance | **OWNER-ACCEPTED** |
| Gate 7 overall | **NOT YET COMPLETE** |
| Real user footage | **NOT RUN** |
| Professional editing quality | **NOT VERIFIED** |
| Semantic critic | foundation and port only; the only implementation is a synthetic fixture critic, no model |

Evidence lives in the ignored `.local-runs/phase5-gate7/` (`batch3a-*`). Receipts are append-only: no earlier receipt was overwritten. The
final verification ran twice. Run 1 (`batch3a-final-*`) passed every gate. Run 2 (`batch3a-final2-*`) is authoritative, because the final
hostile pass (§12) added regressions and one critic repair after run 1.

## 1. Baseline

- Branch `phase/5-edit-planner-v0`, HEAD `c74d5fe649ebe470ee0ea9bcb21cdfc4969641cb`. One read-only `git ls-remote origin` confirmed the
  remote branch head is the same commit.
- Before any edit: nothing staged and no tracked modification. The 17 untracked owner files (`CLAUDE.md`, `gate5-*.txt`, `gate6-*.txt`,
  `gate7-*.txt`) were recorded by name, size and modification time only. Their contents were never read, hashed, modified, staged or deleted.
- Baseline receipt `batch3a-baseline.json` (`92903551c6703ebdf65031dacc97a02ddd79d4b2e4521dae9a845432e6aa47c3`) records:
  - SHA-256 of all 297 tracked files (every tracked file is protected);
  - the 17 owner files (metadata only);
  - the 496 earlier Gate-7 receipts;
  - the three authorized modifications (§2 and the narrow `docs/CURRENT_PHASE.md` update);
  - the upstream audit record (§5).

## 2. Owner authorization — PROTECTED_CHANGE_REQUIRED (raised before any protected byte changed)

The observation adapter must start the pinned FFmpeg, because that is the only way to decode the actual rendered H.264/AAC bytes. The
accepted workspace audit refuses any subprocess import in an unregistered file, and the accepted Batch-2B audit test pins the registered
adapter list. The failing evidence is in `batch3a-protected-change-evidence.json` and `batch3a-protected-change-evidence-full-message.json`.
Both come from a scratch copy of the accepted audit fixture; no tracked byte changed.

- The unregistered adapter makes the accepted audit fail with `Unregistered subprocess import in scripts/edit-observation-local.ts`.
- With the minimal registration, the audit prints `15 explicit local runtime adapters ...`, which the pinned B2B-A1 regex
  (`14 explicit ... edit-media-qc-local\.ts\)`) no longer matches.

The frozen invariant is the per-file subprocess capabilities (Batch-2B audit). The question and answer are recorded in
`batch3a-owner-authorization-and-plan.md`; the owner answered **"Approve both (Recommended)"**. Applied exactly, and nothing else:

| File | Change | SHA-256 before → after |
|---|---|---|
| `scripts/audit-workspace.mjs` | one `adapterPolicy` entry: `"scripts/edit-observation-local.ts": { imports: ["node:child_process", "node:crypto", "node:fs/promises", "node:path", "node:url"], process: "strict_spawn" }` | `253d9020…3378` → `2e0968cb…4956` |
| `tests/edit-render-audit.test.ts` | B2B-A1 line 48 only: count 14 → 15, `edit-observation-local.ts` appended | `399d945f…58b5` → `2126c94a…8c78c` |

No accepted Batch-2B defect was found. In particular, the upstream AAC `-c copy` boundary click (video-use #162) does not apply here:
Batch 2B trims decoded PCM and encodes the audio once.

## 3. Reconnaissance: what already existed, and what was reused

| Need | Accepted source | Decision |
|---|---|---|
| Rendered-output identity | `RenderExecutionReceipt` (output `contentHash`, `sizeBytes`, `outputArtifactId`, `receiptId`, `dagId`, `programId`, `renderComputationId`, EditGraph id and revision) | Reused as the only rendered-media identity. |
| Technical QC | `TechnicalMediaQcReceipt` (`qcReceiptId`, `verdict`, `qcScope`) | Reused. It must pass and link exactly (§9). |
| Source identity | staged objects (`stagedObjectId`, content hash, size) of the accepted render | Reused for source drill-downs. |
| Executed cuts | `compileRenderProgram` over the replay-validated DAG; DAG joins carry `atFrame` and `atTicks` | Reused. The plan is derived from the executed program, never from a plan's intention. |
| Time | output frames and samples; Gate-6 `ClockSchema` integer ticks (`packages/edit-graph/common.ts:18`) | Reused. No new time representation. |
| Transcript evidence | legacy `Transcript` / `SpeechRegion` (`packages/providers/index.ts:16-17`), accepted faster-whisper `SpeechRegionSchema` (`packages/audio-analyzer/speech-protocol.ts:62-79`), `AudioAnalysis.speechRegions` (`packages/contracts/audio.ts:15`) | Insufficient: region-level text in float seconds, with no word timing and no content binding. The smallest provider-neutral contract was added (§6). No bridge from the region-level worker was built, because one would fabricate word timing. |
| Content identity | `identify` / `checkIdentity`, `ArtifactRef`, `EvidenceRef` (JSON pointers), `supplied`, `EditorialArtifactMap` | Reused. |
| Confidence semantics | `DirectorUncertaintySchema` (`unknown` / `qualitative`, reason code, evidence references) | Reused. No new confidence framework. |
| Critic vocabulary | Architecture-v1 §18 `CriticReport` sketch: 22 dimensions; severities `info` / `minor` / `major` / `blocking` | Reused as frozen. |
| Cache identity | Architecture-v1 §22: decoded and sampled frames bind decoder and version | Applied (self-review D2). |
| Process supervision | `supervisePinnedProcess`, `completedProbeRun` (`scripts/edit-render-local.ts`), `PINNED_MEDIA_RUNTIME` | Reused unchanged. |

## 4. Frozen Architecture-v2 invariants honoured by this batch

- **EditGraph remains the sole authority.** Nothing is written into it, and a finding is data only (R34).
- **The critic inspects what was actually rendered.** The plan is re-derived from the validated DAG, the recompiled program must equal the
  receipt's `programId`, and observations decode the published bytes (R18, R19, O01–O03).
- **One observation binds exactly one media identity** (R23, R31, O04, O08).
- **Exact time, using accepted primitives only.** Output frames, samples and integer ticks. A tick instant is compared with a frame
  instant only by BigInt cross-products (R16, R24).
- **Technical QC and the semantic critic stay separate** (R19, R29, R35).
- **A transcript is never mandatory** (R12, R14, O03).
- **Drill-down only, never a whole-video scan.** Constant global set, hard windows and a review budget (R20, R21, R42, O04).
- **Pinned tools only.** No shell, no PATH lookup, no network, no provider and no free-form filter (R38, O04).
- **Future seams are left untouched.** No repair, GraphDiff, EditorialState, RevisionLedger, motion, composition, AudioGraph,
  HyperFrames, CapabilityRegistry, OTIO or OCIO, and no abstraction that exists only for them.

## 5. Upstream `browser-use/video-use` audit and licensing

- Repository: <https://github.com/browser-use/video-use>. Pinned commit `b877063835e6ea6e457124da7e28a0ae26691dc3` (resolved main;
  committed 2026-09-23T21:50:14-07:00). Inspected 2026-09-27 from a clone in the session scratch directory, never in the repository.
- **License:** MIT, "Copyright (c) 2026 Browser Use" (`LICENSE` sha256 `f77bf226b54339f5a8891f9edcfadf231c9cd9017a9aa3d9f566d4d6264b541d`).
  **No upstream code was copied or adapted.** Ideas were reimplemented from scratch in TypeScript against this repository's contracts, so no
  third-party notice is required.
- **Files inspected** (SHA-256 recorded in the baseline receipt): `README.md`, `SKILL.md`, `LICENSE`, `pyproject.toml`,
  `helpers/pack_transcripts.py`, `helpers/timeline_view.py`, `helpers/transcribe.py`, `helpers/transcribe_batch.py`, `helpers/render.py`.
- **Issues and PRs:** 166 listed (read-only GitHub REST listing). The bodies of 24 were read: #162, #163, #177, #165, #164, #64, #183,
  #161, #156, #134, #178, #95, #166, #167, #153, #39, #93, #188, #191, #142, #62, #143, #169, #184.

**Adapted ideas (reimplemented):**

- Phrase packing on silence and speaker change (`pack_transcripts.py`). Here it gives exact entry lineage and integer ticks, plus an entry
  limit (§6).
- Audio events alongside words.
- A compact text projection, explicitly labelled "projection only, not authority".
- On-demand drill-down around decisions (`timeline_view.py`). Here it is bounded windows of one media identity, never a scan loop.
- A waveform around cuts. Here it is frame-aligned RMS/peak bins from the exact decoded samples.
- Reviewing actual rendered boundaries: #64 (automated cut-boundary QA) and #161 ("derive … from the rendered segments, not the EDL").
  Here boundaries come from the executed RenderProgram.
- A small global sample (opening, interior, ending).
- Finite review.
- Technical checks kept apart from editorial critique.
- Evidence reuse. Upstream's transcript cache is keyed by file name: `helpers/transcribe.py` skips the upload when
  `transcripts/<video_stem>.json` exists. Open PR #165 proposes checking source and output fingerprints before reusing reviews. Here reuse
  is by computation identity, including the decoder build.
- #165: "a cache hit is not visual approval". Here a cache hit re-binds evidence to the new lineage and never approves anything.
- #162: an automatic boundary audio check. Here it is a settled RMS level step, reported as a measured signal, not a click detector.
  Batch 2B already re-encodes audio from decoded PCM (the approach of #163), so #162's defect does not apply.
- #134 and #188/#191: digital silence is a legitimate state. The no-speech path is first-class, and waveform bins are absolute Q15
  levels, never normalized to a window's maximum, so digital silence stays silence.
- #156: windows are clamped inside the output, and a decode must yield exactly the requested frames or be refused.

**Rejected ideas:**

- An EDL, `project.md` (#184) or file paths as authority. Upstream #93 is a path-traversal fix in the EDL's path resolution.
- A second renderer.
- A PATH-resolved `ffmpeg` or a shell `subprocess`.
- Raw filter strings, including filter strings that carry paths (cf. #143's Windows path escaping).
- Float `-ss` seeking.
- `-c copy` concatenation (#162, #62).
- ElevenLabs/Scribe or any paid provider.
- Transcript-first for all content.
- Universal padding, fades or grades (#177).
- Fixed "max 3" review loops.
- A self-referential repair loop.

## 6. New public contracts (`packages/edit-review/`, pure: no clock, filesystem, process or network)

All records are strict, content-identified (`<prefix>_<sha256 of canonical body>`) and `internal_pre_stable` 0.1.0. Refusals carry one of
33 owned `EDIT_REVIEW_ERROR_CODES`, and messages never carry a location. `REVIEW_HARD_LIMITS` are ceilings; an owner review policy chooses
values inside them. They are Batch-3A implementation policy, not architecture constants.

- **`TranscriptEvidence`** (`transcript_evidence_v0`).
  - Fields: source `{assetId, contentHash, durationTicks}` with the accepted `ClockSchema` ticks; `language`; producer `{producerId,
    producerVersion, computationBasis, mediaBasis}`, where `computationBasis` is one of `synthetic_stub`, `fresh_real_model`,
    `cached_real_model`, `human_annotation`, `unverified`; ordered entries `{kind word|audio_event, startTicks, endTicks, text,
    speakerId|null}`.
  - Refused: `start >= end`, entries past the duration, disorder, and overlapping words.
  - Bounds: at most 20,000 entries, 64-character words, 48-character audio-event labels and 262,144 text bytes.
- **`TranscriptPack`** (`transcript_pack_v0`). A deterministic phrase projection under a versioned `TRANSCRIPT_PACK_SEMANTICS` digest.
  - A phrase breaks, in this order of precedence, at a change between two known speakers, at a silence gap ≥ `silenceGapTicks` after the
    phrase's latest end, or at the entry limit (≤ 64).
  - Each phrase carries `breakBefore`, `entryStart/entryEnd`, `wordCount`, the entry indices of its audio events, its speaker and its text
    (audio events parenthesized).
  - Identity is the transcript evidence plus the grouping semantics.
  - `validateTranscriptPack` accepts a pack only if it replays exactly.
  - `renderTranscriptText` is the deterministic `[mm:ss.mmm–mm:ss.mmm] S1: …` projection, headed "projection only, not authority".
- **`EvidenceRequest` / `EvidenceSelection`** (`evidence_request_v0`, `evidence_selection_v0`, rule `evidence_routing_v0`).
  - Decisions: `speech_selection`, `retake_comparison`, `cut_boundary`, `reaction_relationship`, `visual_continuity`, `pacing`,
    `music_sync`, `global_review`.
  - Scope: one to four exact media identities, one interval of at most 240 frames, the evidence already available, and at most 8
    additional observations.
  - The speech-coverage profile routes transcript use. A missing transcript is never a refusal (`unavailable_proceeding_without_transcript`
    or `not_required`).
- **`ReviewPolicy`** (`review_policy_v0`). Owner-authored windows (boundary half-window, global window, interior samples) and a budget:
  observations, delivered frames, decoded pixel frames, evidence bytes, findings, explanation characters, review attempts, transcript
  characters and decode milliseconds.
- **`ReviewPlan`** (`review_plan_v0`). Derived by `planReview` from the replay-validated DAG, its artifacts, the success receipt, the
  passing technical QC and the policy.
  - It binds render, output, QC, media facts, inputs and segments, and every executed join exactly once: `atFrame`, `atTicks`, `atSample`,
    classification.
  - Items: one bounded window per reviewed cut, plus a constant global set.
- **`EditorialObservation`** (`editorial_observation_v0`). One media identity: a rendered output bound to its receipt and passing QC, or a
  staged source of that render.
  - Contents: an exact frame window with per-frame luma statistics and SHA-256, requested gray thumbnails (≤ 48 px edge), frame-aligned
    waveform bins, and optional transcript words with exact lineage and coverage.
  - Acquisition states how the result was obtained: pinned decode, synthetic test bytes, or reuse.
  - The computation identity (`editorial_observation_computation_v0`) binds only media content, request, decoder, semantics digest,
    observer and transcript join. It excludes lineage, scope and purpose.
- **`CriticFinding` / `CriticReport`** (`critic_finding_v0`, `critic_report_v0`).
  - Findings use the frozen 22 dimensions and four severities, and carry: the exact output, the reviewer implementation, the affected output
    range, the join, 1–8 resolvable evidence references into this review's observations, a bounded location-free explanation, Director
    uncertainty, and `repair: not_computed`.
  - The report binds plan, EditGraph, render, QC, attempt, observations, evidence basis, per-item coverage, all 22 dimension assessments and
    the budget used.
- **`SemanticCriticPort`.** `identity` plus `assess(frozen bounded input) → unknown`; the response is validated strictly.
- **Adapter:** `scripts/edit-observation-local.ts`, `observeReviewTargets` → `{observations, accounting}` (§8).

## 7. Cut derivation and the global set

- Every executed join of the program is derived once, in order, at its exact output frame, tick and sample. The classes are
  `source_change`, `same_source_discontinuous`, `look_change_only` and `continuous_source_join`.
- A continuous join is accounted for but not reviewed, so it can never become a phantom cut. A single clip has no boundary (R16, R17).
- Boundary window `[max(0, c−h), min(N, c+h))`, frames `{start, c−1, c, end−1}`.
- Global set, with `g1 = min(N, g)`:
  - opening `[0, g1)`;
  - `k` interior windows centred on `floor((j+1)·N/(k+1))` and clamped inside the output;
  - ending `[N−g1, N)`.
- Its size is `2 + k` whatever the output length (R20; each O01–O03 plan has 5 global items).
- Audio is requested only when samples per frame are an exact integer.
- A plan refuses any window over 64 MiB of decode output, and any projection over the budget (R21).

## 8. The local observation adapter (`scripts/edit-observation-local.ts`, strict_spawn)

- **Plan and snapshots.** The plan is re-derived from the DAG, receipt, QC and policy, and the supplied plan must equal it. Policy, targets
  and transcripts are privately snapshotted at entry (D7).
- **Pinned FFmpeg only.**
  - The tool root must be the absolute approved root (compared by realpath), and the binary must lie inside it.
  - The binary must be a regular file with the pinned SHA-256 and size.
  - The single `spawn` passes `shell: false`, `windowsHide`, `env` holding `SystemRoot` only, and the child's stdin ignored.
  - The accepted `supervisePinnedProcess` bounds every run by the policy timeout and bounds stdout to the expected byte count plus one.
- **Media located only by content identity.**
  - A rendered output is `render-outputs/<contentHash>.mp4`; a staged source is `staged-objects/<ownedKey>.bin`.
  - The realpath must stay inside the runtime root. Only a regular file is opened, and it is hashed through the held handle to equal the
    certified identity.
  - Each decode opens a fresh handle proven to be the same file object (dev/ino). After the decodes, the object is hashed again; a change
    is reported as `observation_media_changed`, never observed.
- **Argv from fixed tokens and integers only.** `-protocol_whitelist fd -f mov -fd 3 -i fd:`.
  - Video: `trim=start_frame:end_frame`, passthrough timing, raw yuv420p.
  - Audio: `atrim=start_sample:end_sample`, f32le at the native rate.
  - No time seeking; stdout must be exactly the requested bytes.
- **Budget before any process.** Delivered frames over all targets and decode work over all pending targets are checked before anything
  starts (D4). The work directory `render-work/observation-<random>` is removed afterwards.
- **Accounting:** targets, cache state (`not_supplied` | `consulted`, D9), hits, misses, decode processes, decoded frames and pixel frames,
  delivered frames, waveform bins, evidence bytes, per-process and wall milliseconds.

## 9. Technical QC and the semantic critic

- **Linkage checks.** A plan or review requires a technical QC that exists, has verdict `pass`, is linked to exactly this receipt and output,
  and whose expectation matches the recompiled program. Failures are `technical_qc_missing`, `technical_qc_failed` and
  `technical_qc_linkage_mismatch` (R19, O04).
- **The critic never re-runs, relabels or bypasses QC.** The report states
  `technical_qc_is_objective_media_correctness_critic_is_editorial_evidence_v0` (R29).
- **Deterministic checks are mechanical and uncalibrated.** They are always `info`, with fixed `unknown` uncertainty
  (`uncalibrated_mechanical_signal_not_an_editorial_judgment`):
  - `near_black_frames` (technical_quality): luma ≤ 32 on ≥ 90% of pixels, in runs over observed output frames, each run reported once;
  - `audio_level_step_at_cut` (sound): settled RMS bins at c−3/c−2 versus c+1/c+2, a step of at least 10× with the louder side ≥ 1036 Q15.
- **What the checks do not claim.** They do not measure taste, emotion, story, cinematic quality or pacing. A cut on the beat is still
  only `info` (O03).
- **Semantic findings come only through the port,** as `model_assessed`. They cannot claim a measurement, and every evidence and
  uncertainty reference must resolve inside this review's observations (R33, R35, R43).
- **No finding is not a pass.** Without a port the semantic critic is reported `not_computed` (R30, R37).

## 10. First red (tests first)

At red time `packages/edit-review/` and `scripts/edit-observation-local.ts` did not exist. The first red is typecheck exit 2
(`batch3a-first-red-typecheck.log`, `d6ada8b7…`): four TS2307 for the absent modules and their implicit-type cascade, plus one test-authoring
defect (TS4104). The TS4104 defect was corrected in the test only. The confirmed red (`batch3a-first-red-typecheck-after-test-correction.log`,
`f656e773…`) has only TS2307 ×4 and cascade errors on values imported from the absent modules. Details are in `batch3a-first-failure.md`.

Deviation from the recorded plan: the planned skeleton red was not run (§12, `batch3a-self-review-d9-and-process-deviations.md`).

## 11. Implementation runs and test-only corrections

The first run against the implementation was `batch3a-pure-initial-run.log`: 38 tests, 35 pass, 3 fail. The first media run was
`batch3a-media-initial-run.log`: 5 tests, 3 pass, 2 fail. Every failure was a test-authoring defect; the production behaviour observed was
correct. `batch3a-test-only-corrections.md` records all eight corrections; none weakens a requirement:

1. TS4104 in the support file.
2. The `LOCATION` regex narrowed so JSON pointers are not treated as locations.
3. The evidence-basis literal renamed to `actual_pinned_decodes_only`.
4. R07's mutation now shortens a word instead of creating an overlap.
5. R20 uses three 4 s uses, since the accepted planning fixture caps a trim at 4 s.
6. R38's vendor guard uses word boundaries.
7. R38 assembles the subprocess import text at run time, so the accepted audit does not flag the pure test.
8. O02's silent source moved from [2, 3) to [3, 4).

For item 8, the accepted Gate-5 bounded search finds no plan for those exact fixture bytes. It depends on content-hash order under the
accepted beam (`batch3a-o02-planner-probe.log`, `-probe-2.log`). This is accepted Gate-5 behaviour and was not modified.

## 12. Hostile self-review (RED → narrow repair → GREEN)

Findings were written down before each red: `batch3a-self-review-findings.md` for D1–D8, `batch3a-self-review-d9-and-process-deviations.md`
for D9, and `batch3a-self-review-final-pass-findings.md` for D10 and A1. Every red ran on the exact unrepaired bytes named in its log, and
sub-cases hidden by a first failing assertion were confirmed separately (`batch3a-selfreview-hidden-subcases.json`).

| # | Defect (red observed on unrepaired bytes) | Smallest repair | Test |
|---|---|---|---|
| D1 | Synthetic-bytes and real-decode observations of one request shared a computation identity; the cache served synthetic summaries under the real key. | The producing decoder (`pinned_ffmpeg` + digest, or `synthetic_test_bytes`) binds the identity. | R39 |
| D2 | Decodes by different FFmpeg builds shared an identity. | Same as D1. | R40 |
| D3 | A report re-identified for other output bytes still validated with the original findings. | Every finding binds its output and reviewer; the report refuses findings about other bytes. | R41 |
| D4 | Drill-downs exceeded the decoded-pixel and delivered-frame budgets. | Budgets are enforced over all observations and targets, before any process. | R42, O04 |
| D5 | A semantic finding's uncertainty cited a foreign artifact. | Uncertainty references are validated like evidence. | R43 |
| D6 | A path, URL or UNC path in a port explanation was accepted. | Explanations must be location-free. | R44 |
| D7 | Actual media: a decode bound widened mid-run was obeyed, and a swapped target produced a record for item 4 from item 0's bytes. | Private snapshots of policy, targets and transcripts. | O06 |
| D8 | A port widening the caller's `maxFindings` got 3 findings accepted under a budget of 2. | The critic reviews under a policy snapshot. | R45 |
| D9 | Without a cache, 5 misses were reported for 5 targets, and the cache state was never stated. | `cache: "not_supplied" \| "consulted"`; misses count only real lookups. | O07 |
| D10 | A port rewriting the caller's `attempt` from 2 to 1 got a report recording attempt 1, although attempt 2 was admitted. | `attempt` is snapshotted at entry. | R46 |

| # | Attempted red that could not be made red | Result |
|---|---|---|
| A1 | A mutable stand-in runtime, its root swapped mid-run to a copied root whose staged object holds other bytes under the same name | Refused `observation_media_mismatch`. Identical bytes found through a copied root give the same identity and result, because content identity, not location, is authority (O08, `batch3a-selfreview-a1-attempt.log`). |

Receipts:

- D1–D6: `batch3a-selfreview-d<n>-red.log` / `-green.log`;
- D7–D8: the same naming, under the addendum;
- D9: `batch3a-selfreview-d9-red.log` `1d605c1d…`, `-green.log` `c4e5bc6c…`;
- D10: `-red.log` `64fbd8ad…`, `-green.log` `20cdde0e…`.

Summaries are in `batch3a-self-review-summary.md` and `batch3a-self-review-final-pass-summary.md`.

**Process deviations** (`batch3a-self-review-d9-and-process-deviations.md`):

- D7's and D9's corrections were applied before their reds. Each was reverted exactly, verified by hash against the previous green bytes;
  the red then ran on the reverted bytes, and the correction was restored and verified by hash.
- The planned skeleton red was not run.

## 13. Synthetic actual-media verification (accepted Batch-2B path, pinned FFmpeg 9.0.1)

Sources are tiny, synthetic and generated with the accepted `generateSource`: 90 × 160 px libx264 video and PCM s16le stereo in MOV,
where a frequency-0 segment is digital silence. Each edit is rendered through the accepted chain (registration, claim, staging, lifecycle
observation, conformance, permit, pinned execution, publication, independent QC) to an H.264/AAC MP4: 180 × 320 px (width × height),
30 fps, 48 kHz stereo. The plan is then derived, and the
adapter decodes the published bytes. Every observation's `media` equals the receipt's output identity (O01).

| Test | Fixture | What the actual bytes showed |
|---|---|---|
| O01 | Speech-like two-shot (testsrc2 speech bursts; blue shot with answers), known synthetic transcript timing | One reviewed cut at frame 60. The boundary words are `cut` (clipped_end) and `yes` (whole). The waveform shows the burst before the cut and silence after it. A speech_selection routes to a bounded staged-source drill-down with exact source-timeline words. Findings: `audio_level_step_at_cut` at join 0 and the fixture critic's `trim_timing`. |
| O02 | Two-shot visual cut (testsrc2 → solid), control cut (identical solid pictures, 660 → 661 Hz), audio-boundary cut (tone → digital silence) | Cuts at frames 30/60/90, ticks 1e9·k and samples 48,000·k. The largest luma change in window 0 is exactly frame 30 (MAD 51,578 milli). At the control cut, frame 60 is not the largest change of its window (MAD 8,352 milli). An independent decode agrees: frame 29 is not solid, frame 30 is solid, and the band indices at 59/60 are 59/60. A level step is found only at join 2. The second pass is all cache hits with 0 decodes, and attempt 2 reuses the evidence under a new lineage. |
| O03 | No-speech montage (pulsed tones; a black shot) | music_sync routes to `not_required`, and no transcript exists anywhere. Findings, all `info`/measured: level step 27–33, near-black 30–60, level step 57–63. Semantic critic `not_computed`. |
| O04 | Refusals | Tool roots (relative, decoy, bin, bare name) are refused `observation_tool_unavailable`. A plan of another policy is `review_plan_mismatch`, and QC of another output is `technical_qc_linkage_mismatch`. A 1 ms decode bound gives `observation_decode_failed`, and a drill-down over budget gives `review_budget_exceeded`. Bytes appended after the identity check give `observation_media_changed`, bytes mutated before it give `observation_media_mismatch`, and a moved output gives `observation_media_missing`. No work directory is left behind, and the untouched second output observes cleanly. |
| O05 | Persisted evidence scan | 6 files, 1,499 strings, 0 location-like. |
| O06 | D7 regression | See §12. |
| O07 | D9 regression | No cache gives `not_supplied`, 0/0 and 2n decodes. A first cached pass gives `consulted`, 0 hits, n misses. A second gives n hits and 0 decodes. |
| O08 | A1 attempt | See §12. |

## 14. Measured performance and cost evidence (final run 2; synthetic fixtures; this machine)

Source: `batch3a-final2-metrics.json`, computed from the unchanged copy `batch3a-final2-media-evidence/` of run 2's persisted evidence.
Wall and process times are this machine's.

| Measure | O01 speech | O02 cuts (first pass) | O03 montage | O04 clean output |
|---|---|---|---|---|
| Output frames (180 × 320 px width × height, 30 fps) | 120 | 120 | 90 | 30 |
| Reviewed boundaries / joins | 1 / 1 | 3 / 3 | 2 / 2 | 0 / 0 |
| Global observations | 5 | 5 | 5 | 5 |
| Decode processes | 12 | 16 | 14 | 10 |
| Decoded frames (trim decodes from frame 0) | 450 | 600 | 419 | 150 |
| Decoded pixel frames | 25,920,000 | 34,560,000 | 24,134,400 | 8,640,000 |
| Delivered frames (thumbnails) | 13 | 21 | 17 | 9 |
| Waveform bins | 180 | 240 | 210 | 150 |
| Evidence bytes (canonical JSON) | 81,186 | 107,174 | 91,244 | 60,534 |
| FFmpeg per-process ms, sum / max | 437 / 47 | 573 / 46 | 487 / 41 | 350 / 41 |
| Observation-run wall ms | 8,695 | 11,560 | 10,149 | 7,314 |

Drill-downs:

- O01 source drill-down: 1 target, 2 decodes, 66 frames, 950,400 pixel frames, 12 bins, 5,516 bytes, 1,541 ms.
- O03 drill-down: 1 target, 2 decodes, 40 frames, 2,304,000 pixel frames, 3 delivered frames, 20 bins, 11,756 bytes, 1,574 ms.

Wall time covers the whole observation run, not only decoding: plan re-derivation, tool and media hashing, spawning, and record
validation. It was not broken down further.

Transcript (R10, a synthetic 2,000-word evidence):

- 100 phrases;
- raw `TranscriptEvidence` 180,709 bytes, `TranscriptPack` 33,161 bytes, text projection 16,817 bytes (canonical JSON / UTF-8 lengths);
- pack construction 19.056 ms.

O01's two fixture packs project to 338 and 295 text bytes. These are sizes, not a token or cost claim.

Cost: no model call, no paid API and no network I/O happened in any test. The only compute was the pinned local FFmpeg decode, which is
counted above. No token or cost saving is claimed: the sizes above are our own measurements, not upstream's claims.

## 15. Cache behaviour

- **Same identity, same reuse.** The same truthful dependencies give the same computation identity and reuse. Reuse re-binds the result to
  the new lineage (receipt, QC, plan item), with acquisition `reused_by_computation_identity_v0` and the original basis kept. A cache hit is
  not visual approval.
- **Changed dependencies, changed identity.** Content, interval, semantics digest, observer version, joined transcript and decoder build each
  change the identity (R27, R39, R40).
- **Lineage does not invalidate evidence.** Receipt, scope and project lineage are not in the identity, so a new attempt that publishes
  identical bytes reuses everything (O02).
- **Mismatch refused.** A cached entry is reused only under exactly the recomputed identity with equal media facts; otherwise
  `observation_cache_mismatch` (R28).
- **Measured in O02:**
  - first pass (cache consulted): 0 hits, 8 misses, 16 decodes, 11,560 ms;
  - second pass (same receipt): 8 hits, 0 misses, 0 decodes, 153 ms, identical results;
  - attempt 2 (a new receipt of the same bytes): 8 hits, 0 decodes, 130 ms, with `evidenceBasis` still `actual_pinned_decodes_only`.
- **Measured in O07:** without a cache the run reports `not_supplied` with 0 hits and 0 misses.
- **Known inefficiency.** For outputs shorter than the global window, the global items coincide (O04: 30 frames). Within one run they
  are decoded separately, because lookups precede decoding. This is bounded but not deduplicated.

## 16. Architecture-v2 compatibility and future seams

No accepted package, contract or schema changed. The only protected changes are the two authorized lines (§2). Batch 3A reads accepted
records and writes only its own. Seams left for later batches, and not implemented here:

- a finding's `repair: not_computed` is the hook for a future RepairPlan and GraphDiff;
- a computation identity that excludes lineage is the hook for future localized invalidation;
- `SemanticCriticPort` is the hook for a future model adapter under its own approved evaluation phase.

## 17. ARCHITECTURE_V2_TIMEBASE_GAP: YES (recorded, not modified)

- **Float seconds persist in accepted records.** Source-side time is floating seconds in accepted Gate-5/6 records and frozen contracts:
  - `SecondsSchema = z.number().finite().nonnegative()` (`packages/contracts/common.ts:8`);
  - `TimeRangeSchema { startSeconds, endSeconds }` (`packages/contracts/common.ts:17-19`);
  - EditGraph source ranges "stay exact Gate-5 seconds" (`packages/edit-graph/graph.ts:3`), with `range: TimeRangeSchema, precision:
    frame_pts_exact | source_seconds` (`packages/edit-graph/graph.ts:37`);
  - source frame-time tables are float arrays (`packages/edit-render/program.ts:78`).
- **What Gate 6 already guards.** Seconds are converted to integer ticks only when exact (`exactTicks`, `packages/edit-graph/common.ts:73`).
- **What Batch 3A stores.** Only integer frames, samples and ticks. Every comparison is exact rational. Its source frames come from the
  accepted RenderProgram.
- **Still open.** The gap must be resolved before repair or localized invalidation becomes authoritative. It is not permission to rewrite
  Gate 6 inside Batch 3A.

## 18. Final verification (run 2 on the final bytes; authoritative)

Driver: a scratch script running each gate sequentially from the project root. Summary `batch3a-final2-gates-summary.log`
(`bd02499e…2d53`), UTF-8 counts `batch3a-final2-counts.json` (`40e3e5d3…b237`), one log per gate `batch3a-final2-<gate>.log`. Started
16:38:26Z, finished 17:19:14Z. Test commands run under `node --import ./scripts/no-network.mjs --test`.

| Gate | Tests | Result | Seconds |
|---|---|---|---|
| `npm run typecheck` | — | PASS (exit 0) | 8.6 |
| `npm run build` | — | PASS (exit 0) | 10.0 |
| Batch-3A pure (`dist/tests/edit-review.test.js`) | 46 | **46/46** | 139.9 |
| Batch-3A actual media (`dist/tests/edit-review-media.integration.js`) | 8 | **8/8** | 236.4 |
| Batch-2B pure (`edit-render.test.js`) | 43 | 43/43 | 24.6 |
| Audit policy (`edit-render-audit.test.js`, `workspace-boundary.test.js`) | 10 | 10/10 | 35.2 |
| Batch-2B actual media (`edit-render-media.integration.js`) | 34 | 34/34 | 769.7 |
| Batch-2A (`edit-runtime.test.js`) | 130 | 130/130 | 103.1 |
| Batch-1 (`edit-execution.test.js`) | 81 | 81/81 | 386.9 |
| Gate 6 (`edit-graph.test.js`) | 79 | 79/79 | 86.7 |
| Gate 5 (`planning.test.js`) | 97 | 97/97 | 107.0 |
| Routing (`budgeted-perception-routing.test.js`) | 33 | 33/33 | 0.7 |
| Compatibility (the 16 accepted compatibility files) | 377 | 377/377 | 9.5 |
| Legacy seams (`contracts`, `integration`, `jobs`, `telemetry`) | 39 | 39/39 | 0.5 |
| Full safe suite (`npm test`: clean build + every `dist/tests/*.test.js`) | 932 | **932/932** (886 accepted + 46 Batch-3A) | 528.4 |
| `npm run audit:workspace` | — | PASS: 114 application files; 15 adapters, 9 subprocess-capable (now including `edit-observation-local.ts`); 5 test harness process files | 1.2 |
| `git diff --check` | — | PASS (no output) | 0.1 |

Every suite reports 0 fail, 0 cancelled, 0 skipped and 0 todo. The 13 Batch-3A and authorized files hashed identically before and after
the run (`batch3a-final2-source-hashes-before.txt` = `-after.txt`), and they match §21.

Run 1 (`batch3a-final-gates-summary.log`, counts `batch3a-final-run1-counts.json`) passed every gate on the bytes before the final hostile
pass: 45/45, 6/6 and 931/931 for the changed suites, with the other counts as above. It is kept unchanged as chronology.

## 19. Protected bytes, dependencies and network

- **Protected bytes.** `batch3a-preservation.json` shows the only tracked files changed among 297 are the two owner-authorized files and the
  narrow `docs/CURRENT_PHASE.md` update. Everything else is unchanged:
  - the gate groups: Gate 5, Gate 6, Batch 1, Batch 2A, the rest of Batch 2B, and the accepted `docs/phases` reports;
  - the 17 owner files (metadata only; contents never read);
  - the 496 earlier receipts;
  - nothing staged, and HEAD is `c74d5fe`.
- **Dependencies.** `package.json` and `package-lock.json` are byte-identical, and there is no new dependency. The package imports only
  `zod`, `node:crypto` and repository modules; the adapter imports only the node built-ins registered in §2. The workspace audit is PASS.
- **Network.** Every test ran under `scripts/no-network.mjs`. The session's only network operations were read-only and outside the
  repository's code:
  - `git ls-remote` of origin and of the upstream (baseline verification);
  - a `git clone` of the upstream into the scratch directory;
  - an anonymous GitHub REST listing of its issues and PRs.

## 20. Limitations and residuals

- **Synthetic evidence only.** Tone, testsrc2 and solid-colour fixtures, synthetic transcripts (`synthetic_stub`) and a synthetic fixture
  critic. There is no real footage, no human review and no model. Nothing here is evidence of editing quality.
- **Records are data, not unforgeable.** A caller-supplied cache subclass, or a coherently re-identified forged observation, passes schema
  validation, because identity is a content hash, not a signature. The critic re-verifies lineage and plan binding but not pixels, and it
  does not re-derive transcript words.
- **Adapter residuals:**
  - the pinned binary could be swapped between its verification and the spawn;
  - an in-place modify-then-restore during a decode (ABA) is not detected;
  - decode work grows with window position, because `trim` decodes from frame 0 and seeking by time is deliberately not used; this is
    bounded by `maxDecodedPixelFrames`;
  - a cache hit does not re-verify that the file is still present.
- **Uncalibrated deterministic checks.** The level-step rule does not detect clicks or phase discontinuities. Coverage is sampled
  boundaries and global windows only. The dimension assessment is per review, and per-item coverage is in `coverage.items`.
- **No durable attempt registry.** `attempt` is caller-declared; only its bound is checked.
- **Gate-5 fixture-order infeasibility.** The accepted Gate-5 planner's infeasibility can depend on fixture content-hash order (§11).
- **Untested paths.** Sources with compressed (AAC) audio are not exercised; only the rendered AAC output is decoded. `TranscriptEvidence`
  has no producer in the repository yet.
- **Test-level bounds.** The review policy values are acceptance-test implementation policy, not calibrated production bounds.

## 21. Files

Final source bytes: run 2 hashed them before and after its gates (`batch3a-final2-source-hashes-before.txt` / `-after.txt`).

| File | Kind | Lines | SHA-256 |
|---|---|---|---|
| `packages/edit-review/common.ts` | added | 89 | `37e97149a39d0ddbe1e4a14f6abe85f62015a1afcad04c9bf9d3f145b1710ca3` |
| `packages/edit-review/transcript.ts` | added | 147 | `c09d033bf0e11ab797b29302624ee24ad739acdeb6cda450fbf6cbb6752f7836` |
| `packages/edit-review/evidence.ts` | added | 75 | `8988438a0115746eac125e86c066261d0493033af2dc299539d25a3ea246c808` |
| `packages/edit-review/review.ts` | added | 196 | `b41a339fed4e417122266f94330eb9434a2cb4c14b1361213f950c362ea89466` |
| `packages/edit-review/observation.ts` | added | 340 | `c901dfd0c0d0e9357d890ed5b475ffa3df57e048fa4ce3ace163511152270e21` |
| `packages/edit-review/critic.ts` | added | 308 | `9b77368772c733ca2a25297177cfbb444984f2f4df71c9adb6a7e0a01cd04a83` |
| `packages/edit-review/index.ts` | added | 20 | `b7d470853fcdeb8298615fc25bba2f4b0a4290adc67864a6ece7179ebb02ef72` |
| `scripts/edit-observation-local.ts` | added (strict_spawn adapter) | 214 | `6577e095765d747fc344e1245c391799c93ca50d8561d32606a5a042024e5549` |
| `tests/edit-review.test.ts` | added (46 pure tests) | 855 | `7f5b3430ddb3e4f7c6c1d6c11e3ec5e81ebd5ec48bfcdc0dec24de7056545754` |
| `tests/edit-review-media.integration.ts` | added (8 actual-media tests) | 372 | `d54bd17bc5bd24c3176cd1e2a20e9fb32c1b38016196252000acde92c6eefe8d` |
| `tests/support/edit-review.ts` | added (pure support, synthetic fixture critic) | 166 | `e716c9a887f9caf7c94f546f25b17428257902aeb4e93a3e7f4409d536785557` |
| `scripts/audit-workspace.mjs` | modified, owner-authorized (+1 line) | — | `2e0968cb684e912a222e8a81221ff226c03cc28a8c514e2943998d66b4af4956` |
| `tests/edit-render-audit.test.ts` | modified, owner-authorized (1 line) | — | `2126c94ac8bd8900194c0fb4b03952c8b826eff5fa9fe1cf59589f83c7b9c78c` |
| `docs/phases/phase-5-gate-7-batch-3a-editorial-evidence-critic.md` | added (this report) | — | not self-hashed; see `batch3a-final-doc-hashes.txt` |
| `docs/CURRENT_PHASE.md` | modified (narrow status update) | — | see `batch3a-final-doc-hashes.txt` |

The package imports only `zod`, `node:crypto` and repository modules. New files use LF line endings, end with a final newline and have no
trailing whitespace (checked with a scratch hygiene script; `git diff --check` covers only tracked files).

## 22. Final status

Evidence for each PASS: the upstream audit is in §5 (baseline receipt `upstream`). Each other PASS is backed by the named tests (§11–§13,
§18) and the preservation receipt (§19).

| Status | Evidence |
|---|---|
| Upstream audit / licence | baseline receipt `upstream` record; `LICENSE` sha256 `f77bf226…`; no code copied (§5) |
| Architecture-v2 compatibility | §4; R01, R34; `batch3a-preservation.json` |
| Media identity binding | R18, R23, R25, R31; O01, O04, O08 |
| Transcript evidence / pack | R02–R10 |
| No-speech path | R06, R14; O03 |
| Evidence routing | R11–R15; O01, O03 |
| Boundary / editorial observation | R22–R26; O01–O04 |
| Actual rendered cut-boundary review | R16, R17; O02 (exact frames 30/60/90, independent decode) |
| Global review evidence | R20; O01–O03 (5 global items each) |
| QC / critic separation | R19, R29, R35; O04 |
| Deterministic critic | R30, R35; O01–O03 |
| Semantic critic port | R32, R33, R37, R43–R46; O01 (synthetic fixture critic) |
| Review budget | R21, R36, R42, R45, R46; O04 |
| Cache / reuse identities | R27, R28, R39, R40; O02, O07 |
| Actual synthetic rendered media | 8/8 in `batch3a-final2-batch3a-media.log` |
| Batch-2B regression | 43/43, 34/34, 10/10 (`batch3a-final2-*`) |
| Gate-6 regression | 79/79 (`batch3a-final2-gate6-regression.log`) |
| Protected bytes / dependencies | `batch3a-preservation.json` |

```text
UPSTREAM VIDEO-USE AUDIT:
PASS

UPSTREAM PINNED COMMIT:
b877063835e6ea6e457124da7e28a0ae26691dc3

LICENSE REVIEW:
PASS

ARCHITECTURE V2 COMPATIBILITY:
PASS

MEDIA IDENTITY BINDING:
PASS

ARCHITECTURE_V2_TIMEBASE_GAP:
YES

TRANSCRIPT EVIDENCE FOUNDATION:
PASS

TRANSCRIPT PACK:
PASS

NO-SPEECH EVIDENCE PATH:
PASS

EVIDENCE ROUTING:
PASS

BOUNDARY / EDITORIAL OBSERVATION:
PASS

ACTUAL RENDERED CUT-BOUNDARY REVIEW:
PASS

GLOBAL REVIEW EVIDENCE:
PASS

TECHNICAL-QC / SEMANTIC-CRITIC SEPARATION:
PASS

DETERMINISTIC CRITIC FOUNDATION:
PASS

SEMANTIC CRITIC PORT:
PASS

REVIEW BUDGET:
PASS

CACHE / REUSE IDENTITIES:
PASS

ACTUAL SYNTHETIC RENDERED-MEDIA VERIFICATION:
PASS

BATCH-2B REGRESSION:
PASS

GATE-6 EDITGRAPH REGRESSION:
PASS

PROTECTED PRIOR-GATE BYTES:
PASS

DEPENDENCY / LOCKFILE REVIEW:
PASS

PROTECTED_CHANGE_REQUIRED:
YES

PHASE 5 GATE 7 BATCH 3A IMPLEMENTATION VERIFICATION:
PASS

GATE 7 BATCH 3A OWNER ACCEPTANCE:
ACCEPTED

GATE 7 OVERALL:
NOT YET COMPLETE

REAL USER FOOTAGE:
NOT RUN

PROFESSIONAL EDITING QUALITY:
NOT VERIFIED

AUTOMATIC REPAIR:
NOT IMPLEMENTED

LOCALIZED RERENDER:
NOT IMPLEMENTED

EDITORIALSTATE:
NOT IMPLEMENTED

MOTION / COMPOSITION / AUDIO EXPANSION:
NOT IMPLEMENTED

HYPERFRAMES:
NOT INTEGRATED

MANUAL NLE:
NOT IMPLEMENTED

VIBE EDITING:
NOT YET COMPLETE
```

PROTECTED_CHANGE_REQUIRED is **YES** in this sense: it was raised before any protected byte changed, the owner approved it ("Approve both
(Recommended)"), and it was applied exactly as authorized (§2). No further protected change is required. The semantic critic port is PASS
as a port with a synthetic fixture implementation. No model critic exists.
