# Phase 5 Gate 7 Batch 2B — First truthful actual media execution through the EditGraph execution architecture

Implementation and verification record. Status date 2026-09-27. Branch `phase/5-edit-planner-v0`; starting and current HEAD
`d3c8302b40a5064ae0eb4408195dc35346ecc648`. All work is uncommitted and unstaged, for independent owner review.

| Status | Value |
|---|---|
| Phase 5 Gate 7 Batch 2B implementation verification | **PASS** after the owner's accounting ruling (fourth addendum); historically **FAIL**, deliberately fail-closed on frozen Batch-2B requirement 10 (§14, §28) |
| Actual pinned-FFmpeg synthetic media execution | **PASS** |
| Independent actual-media QC | **PASS** |
| Reservation-consumption accounting | **PASS** under the owner's local-execution ruling (fourth addendum); historically **PARTIAL** (§14) |
| Production user-media lifecycle authority | **NOT VERIFIED** |
| Real user footage | **NOT RUN** |
| Semantic editing quality | **NOT VERIFIED** |
| Gate 7 Batch 2B owner acceptance | **PENDING** |
| Gate 7 overall | **NOT YET COMPLETE** |

Historical (the original closure and owner-review repairs #1–#3). The owner's accounting ruling resolved exactly the blocker described in
this paragraph and in §14; the fourth addendum records the closure and why implementation verification is now PASS.

The FAIL is not a failed render. Actual media executed through the whole accepted authority chain, and independent technical QC
passed. Every acceptance-critical test passes. What fails is one owner-frozen closure contract that this batch cannot satisfy
truthfully. The accepted Batch-2A record lists, as frozen Batch-2B requirement 10, "measured runtime resource, cost and time
accounting". Wall time and output bytes are measured, render work is derived, and GPU, VRAM, API spend and model calls are proven not
applicable. But CPU time and peak memory exist only as FFmpeg's own report, and total cost has no owner-authorized cost model.
Accounting is therefore PARTIAL. The owner's Batch-2B rule is: "If the owner-defined Batch-2B closure requires full reconciliation
and the implementation cannot achieve it: FINAL BATCH-2B IMPLEMENTATION VERIFICATION MUST NOT CLAIM FULL PASS." Under that rule the
implementation verification is FAIL. §14 names the exact blocker and the smallest owner decision that resolves it.

Evidence lives in the ignored `.local-runs/phase5-gate7/` (`batch2b-*`). Earlier runs are kept unchanged as chronology.

- §1–§28 are the original closure record. Where they say "final", they mean the original closure bytes and the `batch2b-closure-*` /
  `batch2b-final-media-evidence/` set, which is now historical. The one exception is §3, which carries the current files, counts and
  the authoritative final source hash table.
- Three owner-review repair addenda and the owner accounting-closure addendum follow, as chronology.
- The final bytes are those after the owner accounting closure. Their final verification is at the end of the fourth addendum
  (`batch2b-accountingclosure-*`, `batch2b-accountingclosure-media-evidence/`).

## 1. Baseline

- Branch `phase/5-edit-planner-v0`; HEAD `d3c8302b40a5064ae0eb4408195dc35346ecc648` ("docs: accept gate 7 batch 2a runtime safety").
  History as expected: `291a04e`, `ae43224`, `d55f0e1`, `5ff5750`.
- Before any edit: nothing staged and no tracked modification. Thirteen untracked owner files: `CLAUDE.md`, four `gate5-*.txt`,
  two `gate6-*.txt` and six `gate7-*.txt`.
- Baseline receipt: `batch2b-baseline.json` (`202d7b8b7bc20afe9e2050b4ae4e2fadbc7b30d972b554984d49d1f389ae59e6`). It records SHA-256
  for:
  - all 278 tracked files;
  - the 184-file protected set: every tracked file under the accepted packages (`contracts`, `providers`, `validation`, `jobs`,
    `routing`, `edit-graph`, `planning`, `director`, `world-model`, `perception`, `telemetry`, `editorial`, `domain`,
    `footage-analyzer`, `reference-analyzer`, `audio-analyzer`, `evaluation`, `edit-execution`, `edit-runtime`), manifests and
    locks, `tsconfig.json`, `.gitignore`, `.npmrc`, `tests/fixtures/`, `samples/`, `tests/support/`, the accepted gate test files,
    `docs/phases/`, `AGENTS.md` and `scripts/`;
  - the 13 owner files (hash and size);
  - the 167 earlier Gate-7 receipts.
- The two owner-authorized modifications were recorded separately with their baseline hashes: `scripts/audit-workspace.mjs`
  `e1a02ac94b4355a368667fc3e4109e720fd63a17fba632ba124abad5176def5f` and `docs/CURRENT_PHASE.md`
  `2b0272c23189abd1983515eea322ed71c88d65250aff2e02b78ce7d5c384dded`.

## 2. Actual runtime identity

Re-established by the final run's trusted probe (M01, `batch2b-final-media-evidence/m01-runtime-probe.json`) and independently by
read-only hashing.

| | ffmpeg | ffprobe |
|---|---|---|
| Configured path | `.tools/ffmpeg/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe` | `.tools/ffmpeg/ffmpeg-9.0.1-essentials_build/bin/ffprobe.exe` |
| Resolved path | `<project>\.tools\ffmpeg\ffmpeg-9.0.1-essentials_build\bin\ffmpeg.exe` | `<project>\.tools\ffmpeg\ffmpeg-9.0.1-essentials_build\bin\ffprobe.exe` |
| File | regular file, no reparse point, 102,856,192 bytes | regular file, no reparse point, 102,652,416 bytes |
| SHA-256 | `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3` | `19202b23c0043f15ad1b7bce2344f406fd52bd6efd8f995ce02e7392a1cec52f` |
| Reported version | `9.0.1-essentials_build-www.gyan.dev` | `9.0.1-essentials_build-www.gyan.dev` |

- **Build.** 58 configure flags (digest `a36a0c87d31993ba78748656adf9e72ee709ac5496db7c7c61a5a47895ad7b34`), including the required
  `--enable-gpl` and `--enable-libx264`.
- **Encoders.** The selected encoders `libx264` and `aac` are present in the build's own listings.
- **Filters.** The required filters are present: `trim`, `setpts`, `scale`, `setsar`, `format`, `split`, `concat`, `settb`, `atrim`,
  `asetpts`, `asplit`, `aformat` and `asettb`. The looks add `null`, `colorchannelmixer` and `eq`.
- **Other components.** `mov` demuxer, `h264`, `aac` and `pcm_s16le` decoders, `mp4` muxer, `fd` input and output protocols. The
  component inventory digest is `b719a9b8dd74634e62f5b725f13d6db9f861c3b1afcac99714be738b8dfb4fe5`.
- **Hardware components not used.** The build also contains hardware components (NVENC, AMF, D3D11VA, VAAPI and others). None is
  requested: no `-hwaccel` and no hardware encoder or filter appears in any argv.
- **Approved tool root.** `<project>/.tools/ffmpeg/ffmpeg-9.0.1-essentials_build`. A tool root is accepted only when its real path
  equals the approved root's real path. Each binary must resolve inside it, be a regular file opened as the very object `lstat`
  found, and match the pinned SHA-256 and size.
- **No PATH fallback.**
  - Neither `ffmpeg` nor `ffprobe` exists on this machine's PATH (checked read-only).
  - Every spawn uses the verified absolute path. The child environment is `{ SystemRoot }` only, with no `PATH`.
  - M01 prepends a decoy directory containing `ffmpeg.exe` to PATH and shows that missing, relative, bare-name, decoy, `bin` and
    parent tool roots are all refused (`runtime_config_invalid`) before any process starts.
  - The audit forbids an inline executable string in any `spawn` of the two process adapters.

## 3. Files

New (untracked):

| Path | Purpose / why required |
|---|---|
| `packages/edit-render/common.ts` | Owned refusal codes (`EDIT_RENDER_ERROR_CODES`), envelopes, limits, check timing, ephemeral session proofs. |
| `packages/edit-render/semantics.ts` | `RenderExecutorSemanticsV0` (fixed FFmpeg mapping, digest = executor identity), pinned runtime identity, `color_look_executor_v0`, finite Gate-6 capability map. |
| `packages/edit-render/probe.ts` | Strict parsers for the runtime's reports and ffprobe JSON; the V0 staged-input conformance rule. |
| `packages/edit-render/program.ts` | Typed, identity-bearing `RenderProgram` and its deterministic compiler from the validated DAG. |
| `packages/edit-render/ffmpeg.ts` | Trusted deterministic RenderProgram → argv compiler (`-fd` hand-off, `fd`-only protocols, generated filter graph). |
| `packages/edit-render/records.ts` | Real-evidence records (runtime probe, capability probe, staged-input conformance, fixture lifecycle observation) and the owner's real-execution policy. |
| `packages/edit-render/authorize.ts` | `evaluateRealExecutionEvidence` → `ExecutablePermitBinding` (all rechecks at runtime-now; bounded `validUntil`). |
| `packages/edit-render/receipts.ts` | Execution start, success receipt, failure record, reservation-consumption accounting (with the owner's local-execution ruling, scoped to the one pinned executor), output identity, bounds. |
| `packages/edit-render/qc.ts` | Technical-QC expectation from the DAG, 14 ordered checks, QC receipt. |
| `packages/edit-render/index.ts` | Barrel. |
| `scripts/edit-render-local.ts` | The trusted real-execution boundary: pinned runtime/capability probe, staged-input conformance, `ExecutablePermit`, execution, publication. |
| `scripts/edit-media-qc-local.ts` | Structurally separate technical-QC adapter (own pinning, re-hash, ffprobe, full decode). |
| `scripts/edit-render-fixture-authority-local.ts` | The synthetic-fixture lifecycle authority (filesystem only, no process). |
| `tests/edit-render.test.ts` | 43 pure Batch-2B tests (no subprocess, no media). |
| `tests/edit-render-media.integration.ts` | 34 actual-media integration tests (M01–M34). |
| `tests/edit-render-audit.test.ts` | 7 per-file audit-policy tests. |
| `tests/support/edit-render.ts` | Replay-valid chains naming the real executor, pinned runtime and environment. |
| `tests/support/edit-render-media.ts` | Test-only synthetic fixture generation and decoded-evidence helpers (frame-number band, tone windows). |
| `docs/phases/phase-5-gate-7-batch-2b-render-execution.md` | This record. |

Modified:

| Path | Why |
|---|---|
| `scripts/audit-workspace.mjs` | Owner-authorized: per-file subprocess capabilities (§21). |
| `docs/CURRENT_PHASE.md` | Owner-authorized narrow status update after verification. |

Final source SHA-256 — authoritative. These are the final bytes after the owner accounting closure, on which the fourth addendum's
final verification ran; the table is also `batch2b-accountingclosure-final-source-hashes.txt`. This report is not hashed into itself.
The repair-#3 values of the rows this closure changed are kept, labelled historical, in the fourth addendum.
```
1a4e738c90af2f9882ca5b7ed8a70bf72f72b327c7470e568c15e57ba8f4f60e  packages/edit-render/common.ts
f1c32dc1f5b53367e6f28eca17db673ed6fcef2ee639147e8198a3fa5b9c8ca1  packages/edit-render/semantics.ts
db2c965fa5161ef406245a764ee07ab0c8c02cb381f7e6b230390f72e9d6cc04  packages/edit-render/probe.ts
f86a9dd8f721d795933ac82eef5c910b217ac3fd0b10db785f370f8815da03d7  packages/edit-render/program.ts
faf05bc9ac945f667fb1bab94e09f71da8ce0b2efd31d0795d8846227aaadee8  packages/edit-render/ffmpeg.ts
ae91364dd5db69f2137c2c77dec072743b238e70ab0893c4aa28b2ef7d16d9dc  packages/edit-render/records.ts
c704c00ddedf60cf193fe34a9a58c1673ea81f9b60559490a4a1dfa38768a1f1  packages/edit-render/authorize.ts
3dae749fa5f032e70a27401ae8e202aa983ca15c99c73050d29d14067aac32ef  packages/edit-render/receipts.ts
233ab09650e2ba6a630312c4558ec52f8f95af869a84deeb4aa1548d26a9a661  packages/edit-render/qc.ts
af2297d171c22651a772658f541e2efc39e514fdbb904ee2bbd6c05deed2821f  packages/edit-render/index.ts
06adc9fff0f583f602a87407ab0ad96c9d3442946a79680cb7adfc188c469e0c  scripts/edit-render-local.ts
0d9833dfc3f42b644544f58e0ba5c47e6d40078358049b143046f1bd031103af  scripts/edit-media-qc-local.ts
6a6719a13cdba1c7eab34ab937c42066214ac3e9aba8eb2e4b62d874076a63cd  scripts/edit-render-fixture-authority-local.ts
253d9020e1a5fec574742880c0681f694032dbb958f35af0388945257bcf3378  scripts/audit-workspace.mjs
7f576087f36215ce39ff8188a7a0fa10e6b461c25658c8b3a77ced15e729f282  tests/edit-render.test.ts
9d9338d4815f135d1c0b3949d1e2612290e1f3be81cdf9eac2e5a4be41ce6449  tests/edit-render-media.integration.ts
399d945f71d3a9cb259f926486c8f85fb56ea5c20f18adc82e90d7dfbbf458b5  tests/edit-render-audit.test.ts
e0e3a8734713520ebef83eeb6b107c6ad875450d236003629a0bfea8b97e17c3  tests/support/edit-render.ts
ba71a8491c35c852de8d8fe8bae90783594fdce279c4034ba63d0f79afa4307e  tests/support/edit-render-media.ts
ebc8db7f6abc82bd724497262049539f565152ab73d8cbc350a9fba02c9c1e8e  docs/CURRENT_PHASE.md
```

Historical — original closure source SHA-256, before the owner-review repairs; superseded by the table above and kept as chronology:
```
37e5e3ad0cf822cd2ae3d5520ed022e3f4421600f6a6c80a3c107012b035a773  packages/edit-render/common.ts
f1c32dc1f5b53367e6f28eca17db673ed6fcef2ee639147e8198a3fa5b9c8ca1  packages/edit-render/semantics.ts
db2c965fa5161ef406245a764ee07ab0c8c02cb381f7e6b230390f72e9d6cc04  packages/edit-render/probe.ts
f86a9dd8f721d795933ac82eef5c910b217ac3fd0b10db785f370f8815da03d7  packages/edit-render/program.ts
faf05bc9ac945f667fb1bab94e09f71da8ce0b2efd31d0795d8846227aaadee8  packages/edit-render/ffmpeg.ts
ae91364dd5db69f2137c2c77dec072743b238e70ab0893c4aa28b2ef7d16d9dc  packages/edit-render/records.ts
c704c00ddedf60cf193fe34a9a58c1673ea81f9b60559490a4a1dfa38768a1f1  packages/edit-render/authorize.ts
b02a37476e23c88c155f82de969ebc9d107b4ebd3e90ef2c7e2011bf9499fb8e  packages/edit-render/receipts.ts
233ab09650e2ba6a630312c4558ec52f8f95af869a84deeb4aa1548d26a9a661  packages/edit-render/qc.ts
f0177e39eedf6d8f4912d66a5f7241c94951c65089053431c659338aca2bdebd  packages/edit-render/index.ts
cce85182198fe504d2f58acc9d0a5cad003e0c4b541c67a6d8ad40a2ae9d90d4  scripts/edit-render-local.ts
5d7a9d29e6858cedc2b7e68e30c89009c4e004d75920aced5a449d5acb7c9bf2  scripts/edit-media-qc-local.ts
a66fcbb46c1deba57d2c8f330da8950449d6feebf39b517743ba306e52702eb9  scripts/edit-render-fixture-authority-local.ts
253d9020e1a5fec574742880c0681f694032dbb958f35af0388945257bcf3378  scripts/audit-workspace.mjs
2cbc26a2b913d2458a4a30d36c7ad0d71575dc3331e68f2e37f3a9b7fdf69818  tests/edit-render.test.ts
4d044675f5fc83a66707f02d6ff70cac9e2888a7a8f5faa46d5dff7b1d8bda92  tests/edit-render-media.integration.ts
399d945f71d3a9cb259f926486c8f85fb56ea5c20f18adc82e90d7dfbbf458b5  tests/edit-render-audit.test.ts
e0e3a8734713520ebef83eeb6b107c6ad875450d236003629a0bfea8b97e17c3  tests/support/edit-render.ts
ba71a8491c35c852de8d8fe8bae90783594fdce279c4034ba63d0f79afa4307e  tests/support/edit-render-media.ts
84728077fbc757da15c01ed4a1a553a0ef9208574d4e37793d8e64e63358bae9  docs/CURRENT_PHASE.md
```

## 4. Authority flow (as implemented)

```
EditGraph (accepted Gate 6; never mutated)
→ ExecutionAdmission, ExecutionDag (accepted Batch 1; replay-validated by openValidatedDag)
→ AttemptRegistration (registerDagAttempt) → ExecutionClaim (acquireExecutionClaim; in-memory ClaimOwnership)
→ StagedSourceReceipt per source (stageClaimedSource: verified content-addressed staged bytes)            [accepted Batch 2A]
→ real current evidence                                                                                        [Batch 2B]
    SyntheticFixtureLifecycleAuthority.observe → TrustedLifecycleObservation (post-claim, post-stage)
    probePinnedMediaRuntime → TrustedMediaRuntime (RealRuntimeProbe + RealCapabilityProbe; post-claim)
    probeStagedInputs → TrustedInputConformance (pinned ffprobe over the verified staged handle)
→ issueExecutablePermit: live handles only; lifecycle re-queried; evaluateRealExecutionEvidence rechecks claim
    ownership and registration, execution grant and media grants at runtime-now, re-verifies every staged object, recompiles and
    compares the RenderProgram, checks every record's binding, provenance, outcome, chronology and exclusive freshness
    → ExecutablePermitBinding (data) inside a non-serializable ExecutablePermit (bounded validUntil, single use)
→ executeAuthorizedRender: permit current; claim, grants and lifecycle rechecked; pinned FFmpeg re-verified by digest; every
    staged object opened inside the runtime-owned namespace and verified through the handle it hands over
→ RenderProgram (compileRenderProgram) → argv (compileFfmpegArguments) → durable no-overwrite RenderExecutionStart
→ spawn(pinned ffmpeg, argv, { shell: false }) with inherited verified descriptors
→ inputs re-hashed after exit; private output verified, sealed read-only, pending identity proven, no-overwrite
    content-addressed publication → RenderExecutionReceipt (or RenderExecutionFailure)
→ runTechnicalMediaQc (separate adapter, own pinning) → TechnicalMediaQcReceipt
```

## 5. Batch-2A preservation

- **Synthetic evidence never authorizes FFmpeg.**
  - The accepted `DispatchPreparation` is untouched and still synthetic-grade (`synthetic_post_claim_rechecks_not_real_probes_batch2a`).
  - No Batch-2B path accepts it. B02 builds one through the unchanged accepted path. It shows that every synthetic Batch-2A record
    and the preparation itself fail the Batch-2B real-evidence schemas (`runtime_probe_invalid`, `capability_probe_invalid`,
    `lifecycle_observation_invalid`). It also shows that a synthetic provenance kind cannot be relabelled into a Batch-2B record.
  - The Batch-2B records admit only real provenance variants, and even those need a live trust handle (§6).
- **Accepted files unchanged.**
  - `recheck.ts`, `dispatch.ts` and every other accepted Batch-2A semantic file are byte-identical.
  - B01 pins 26 accepted Batch-1/Batch-2A files by SHA-256, including all ten `packages/edit-runtime/` files and
    `scripts/edit-runtime-local.ts`, and shows that `packages/edit-runtime/` still has exactly ten files.
  - The final protected-byte comparison (§22) shows 0 of 184 protected files changed.
- **Frozen requirement 3 ("a fresh, valid DispatchPreparation").** It is met by the equivalent real-evidence structure, the
  `ExecutablePermitBinding`. The accepted `DispatchPreparation` is synthetic-only by construction. The owner's Batch-2B instruction
  forbids widening `recheck.ts`/`dispatch.ts` from "synthetic only" to "synthetic or real", and forbids a synthetic preparation from
  ever authorizing FFmpeg. The binding performs the same rechecks with real evidence and is equally fresh, claim-bound and bounded.
- **The remaining frozen requirements** are met as documented in §4 and §7–§15, except requirement 10 (§14).

## 6. Real provenance

- **Records are data.** A `RealRuntimeProbe`, `RealCapabilityProbe`, `StagedInputConformance` or `FixtureLifecycleObservation`
  (`real_local_probe` / `real_authoritative_observation`) is strict, content-identified JSON. Anyone who can build valid JSON can build
  one. None of them authorizes anything by itself.
- **Ephemeral proof.**
  - Each trusted adapter call creates a fresh 256-bit token held only in memory. The record carries `sha256(token)`.
  - The handle (`TrustedMediaRuntime`, `TrustedInputConformance`, `TrustedLifecycleObservation`) keeps the token in an ECMAScript
    `#private` field. Its constructor requires a module-private symbol, and `toJSON` throws.
  - `issueExecutablePermit` accepts evidence only as live handles (`X.is(h)` checks the private brand, so spreads, clones, JSON round
    trips and `Object.create(prototype)` fail) that `prove` their exact records.
  - The `ExecutablePermit` holds its state in a `#private` field. The state is reachable only through a reader installed by the
    class's static block inside the adapter module, so no caller can reset `consumed` or read the call, program or root. The permit
    throws `permit_not_serializable` on serialization.
  - M10 exercises forged, serialized, cloned and prototype-built permits and handles: all refuse (`permit_required` /
    `trust_handle_required`), and the genuine permit executes exactly once (`permit_consumed` afterwards).
- **Fixture lifecycle authority.**
  - `SyntheticFixtureLifecycleAuthority` is the sole, current lifecycle authority for fixtures it generated. It creates its own fresh
    `synthetic-fixtures-<random>` directory and registers only plain-named regular files read inside it, by the SHA-256 of the bytes
    it read (B80): a name escaping the directory is refused, and so would be a file link wherever the platform lets this user create
    one (here creation fails with EPERM, as B80 records). It keeps deletion and expiry state in memory.
  - It answers only for admitted assets whose MediaAsset origin is synthetic and whose analysis authorization is
    `synthetic_generated`, so it can never answer for a customer or user asset or accept an external identity.
  - Its query window is measured on the trusted runtime clock after claim and staging (B81).
  - After self-review D1, the observation handle can re-query the same registry. The permit issuer and the executor both re-query it
    at runtime-now: a deletion or an ended retention recorded after the observation refuses (M20).
  - Its records say `authorityScope: synthetic_fixture_assets_only_v0`, and every binding says
    `lifecycleAuthority: synthetic_fixture_registry_only_not_production_v0`.
  - It proves the mechanism, not a production service. It cannot prove that the bytes in its directory are synthetic: it trusts only
    its own fresh directory and synthetic-labelled admitted assets.
- **Real runtime probe.** After the claim, the adapter verifies the approved root and both binaries. Only a byte-for-byte pinned
  build is ever asked anything (`-version`, `-buildconf`, `-encoders`, `-decoders`, `-filters`, `-muxers`, `-demuxers`,
  `-protocols`). Availability requires the pinned digests, sizes and versions, the admitted environment, runtime identity and
  executor, and `libx264`, `aac` and the required build flags (B40).
- **Real capability probe.** Every admitted requirement is assessed with its exact Gate-6 predicates against the finite map and the
  build's own listings. Unknown IDs are `capability_unknown`, unmet predicates are `predicate_unsupported`, and missing components
  report their kind (B41, M06).

## 7. RenderProgram

- **Schema.** `RenderProgram` (`render_program_v0`) is strict, finite and prose-free:
  - `semantics` {version, digest};
  - `executor`, `runtime`, `environment`;
  - `binding` {dagId, renderComputationId, editGraphId, revision 0, renderIntent};
  - `output` {resolution, frameRate, ticksPerSecond, frames, durationTicks, video encoding, audio none|encoded aac rate/layout,
    container mp4};
  - `inputs` (at most 16; canonical asset order; `stagedObjectId` must equal the content identity; video frame count, table
    identity, geometry, grid; audio requirement);
  - `segments` (at most 16; position, input slot, clipUseId, clipComputationId; video {precision, selection, startFrame, endFrame,
    frames}; audio none | linked {startSample, endSample}; look none | clip {look, intensityPerMille}; `segmentComputationId`);
  - `joins` (hard cuts at exact frames);
  - `wholeOutputLook`.
- **Schema refinements.** The current semantics digest; canonical slots; segments covering exactly the output frames; joins exactly
  between segments; linked audio on all segments or none; no look stacking.
- **Identity.**
  - The program identity is a content identity over everything above.
  - Each segment carries its own computation identity: semantics digest, executor (added by D4), runtime, environment, render
    intent, source content hash and frame-table identity, exact video and audio intervals, look and output settings. This is the
    unit a future segment-level dependency analysis and reuse can key on.
  - Output content identity (`render_output_artifact_v0` over the bytes) is separate from render computation identity (M03 shows two
    attempts with different computation identities publishing one content identity) and from authorization.
- **Compiler.** `compileRenderProgram` reads only the replay-validated DAG and the exact admitted FootageAnalysis frame tables and
  geometry. It rechecks every vocabulary item even though accepted replay bounds it. Supported node kinds:
  `source_video_clip`, `linked_source_audio`, `color_look`, `cut_sequence`, `composition`, `final_encode`.
- **Refusals (never ignored, approximated or replaced by a no-op).**
  - An unregistered node kind, a non-cut transition, a non-V0 codec, pixel format, profile or audio policy, or an unknown look:
    `render_program_unsupported`.
  - A frame table other than the one the DAG binds: `source_timebase_mismatch`.
  - A source not exactly on the output grid from zero (VFR or another rate): `source_frame_grid_unsupported`.
  - Pixel geometry without the output's display aspect: `source_geometry_unsupported` (D3).
  - Endpoints that do not denote the admitted range, or a selection that is not exactly the clip's output frames:
    `source_trim_invalid`.
  - Linked audio not on exact sample boundaries: `audio_sample_boundary_not_exact`.
  - Linked audio on some but not all clips: `audio_coverage_unsupported`.
  - Output outside the V0 bounds (3840 × 3840, 600 s, 16 clips): `render_program_unsupported`.
- **Permit binding.** At permit time a supplied program must equal the deterministic compilation (`render_program_mismatch`, B68).

## 8. Process safety

- **One spawn function per process adapter.** It calls `spawn(verifiedBinary.path, [...argv], { shell: false, windowsHide: true,
  cwd: privateWorkDir, env: { SystemRoot }, stdio: ["ignore", "pipe", "pipe", ...inheritedVerifiedHandles] })`.
- **The audit enforces it.** In `strict_spawn` adapters: only a named `spawn` import, only direct calls, the executable never an
  inline string, template or concatenation, and a literal, unique, spread-free `shell: false`. `exec`, `execSync`, `execFile`
  (strict adapters), `execFileSync`, `spawnSync`, `fork`, `eval`, `require`, `new Function`, dynamic import and `process.binding` are
  rejected (§21).
- **No arbitrary command.** The argv comes only from `compileFfmpegArguments(RenderProgram)`: fixed tokens plus integers. B21 plants a
  hostile asset ID containing `;movie=C:/...[out]` and it is refused as `render_program_invalid`. No ID or metadata ever enters FFmpeg
  syntax. The generated filter graph is checked token by token against a fixed grammar, and quotes, backslashes, `$`, `|`, spaces,
  `movie`, `subtitles`, `drawtext`, `file`, `http`, `sendcmd` and `zmq` are absent.
- **No network or protocol input.** Every input is `-protocol_whitelist fd -f mov -fd N -i fd:` and the output is `-protocol_whitelist
  fd -f mp4 -fd N fd:`. No path, URL or protocol name appears (B20). Tests run under `scripts/no-network.mjs`.
- **No stdin interaction.** `-nostdin` plus `stdio[0] = "ignore"`.
- **Bounds.**
  - At most 16 sources, 256 argv entries and a 16 KiB filter graph.
  - stdout capture: 64 KiB for renders, 1 MiB for runtime queries, 16 MiB for probe JSON.
  - stderr capture: 256 KiB. Records carry at most 12 sanitized excerpt lines of 160 characters.
  - The output-byte bound is `-fs` plus post-exit verification.
- **Timeout.** `min(policy.process.maxWallClockMilliseconds ≤ 600 000, reservation.wallClockMilliseconds)`; no caller supplies it
  (B88). On timeout the adapter *requests* termination of the child (`ChildProcess.kill`) and waits a bounded 10 s for `close`. If
  close is observed, the result is `process_timeout`. If it is not, the adapter reports `process_termination_unconfirmed`. Either way
  it publishes nothing, records failure evidence and leaves the claim consumed (M15). It does not claim OS-level proof that the process
  is dead, and it does not kill a process tree (pinned FFmpeg runs as one process). This is an explicit local-development residual.
  (Corrected per owner review 2; see the second addendum.) An `error` reported after the child started is never a spawn failure and
  never confirms termination: termination is requested and only an observed `close` confirms it (added per owner review 3; see the
  third addendum).

## 9. Media semantics

- **Staged bytes only.** FFmpeg reads only inherited handles to verified staged objects. The original source path never re-enters
  (M12, M14).
- **Source timing.** V0 executes only sources whose every decoded frame lies exactly on the output grid `i × den / num` from zero.
  Staged-input conformance proves this on the actual staged bytes: exact rational PTS grid, frame count, table identity and start PTS
  0. Anything else is refused: a VFR table (M06, B13), and bytes whose timestamps contradict the admitted CFR table (M07,
  `source_timebase_mismatch`). This batch executes no VFR exactly; VFR is refused.
- **frame_pts_exact.** `trim=start_frame=S:end_frame=E` over the decoded frame sequence, where S and E are the DAG's authoritative
  endpoint frame indices. The compiler checks that `frameTimes[S]` and `frameTimes[E]` denote the admitted range. No `-ss`/`-t`
  seeking is used.
- **source_seconds.** The weaker precision stays weaker: exactly the frames whose PTS lies in `[start, end)` (half-open membership),
  never promoted to frame authority (`selection: pts_membership_half_open_v0`). M09 shows range [0.05, 2.05) s rendering source frames
  2–61.
- **Cuts.** Segments in timeline order, each `setpts=PTS-STARTPTS`, joined by `concat` (hard cut at the exact join frame). An input
  used twice is split explicitly.
- **Linked audio.** `atrim=start_sample=a:end_sample=b,asetpts=PTS-STARTPTS`, where `a = S × den × sr / num` and `b = E × den × sr / num`
  must be exact integers. It shares the video clip's exact trim, placement and order. Audio is linked on every clip or none; silence
  is never synthesized. Conformance requires the source audio to be AAC or PCM at exactly the output rate and layout, contiguous from
  sample 0, and long enough (B50, M08).
- **Composition.** `concat=n=N:v=1:a=0|1` → optional whole-output look → `settb=expr=den/num` (video) and
  `aformat=fltp:rate:layout,asettb=expr=1/rate` (audio).
- **Final encode.** `libx264 -preset medium -crf 18 -pix_fmt yuv420p -threads 1`, `-fps_mode passthrough` (exact input grid, no
  retime), `aac -b:a 128k -ar rate -ac 1|2`, `-map_metadata -1 -map_chapters -1 -fflags +bitexact -flags:v +bitexact -flags:a
  +bitexact`, `-filter_threads 1 -filter_complex_threads 1`, one decoder thread per input.
- **Geometry.** Only scaling (`bicubic+accurate_rnd+full_chroma_int+bitexact`) to the output resolution, and only when the admitted
  square-pixel, unrotated geometry already has the output display aspect (D3).
- **Deterministic metadata.** Metadata and chapters are stripped and bitexact flags set, so no creation time or encoder string enters
  the file.
- **Determinism evidence (and its limit).** M03 renders the same edit twice under two attempts and gets identical bytes
  (`e574236d…`, 156,788 bytes). M05 shows intensity 0 byte-identical to neutral. Identical outputs across repeated runs were observed
  within this runtime, program, inputs and environment. No byte identity is claimed across FFmpeg versions, encoder builds or
  environments.

## 10. Colour-look semantics (`color_look_executor_v0`; not professionally calibrated)

With intensity p in per mille of full strength (0..1000):

| Look | Filters | At p = 1000 |
|---|---|---|
| `neutral` (any p) | `null` (explicit identity) | identity |
| any look at p = 0 | `null` | identity |
| `warm` | `scale=flags=F,format=pix_fmts=gbrp,colorchannelmixer=rr=(1+p/10000):gg=1.0000:bb=(1−p/10000),scale=flags=F,format=pix_fmts=yuv420p` | rr 1.1000, bb 0.9000 |
| `cool` | same with rr = 1 − p/10000, bb = 1 + p/10000 | rr 0.9000, bb 1.1000 |
| `contrast` | `eq=contrast=(1+3p/10000)` | 1.3000 |

- Every number is an exact four-place decimal built from integers; no floating point enters an argument.
- The target is exact: `whole_output` applies after `concat`; a clip-use look applies inside its segment only. No stacking order is
  authorized, so both together refuse.
- The same inputs, look, intensity and semantics always produce the same RenderProgram.
- M05 renders every look plus the intensity boundaries on actual media: warm at 0 is byte-identical to neutral, and the four
  full-intensity looks are four distinct outputs. These are deterministic V0 execution semantics, not calibrated grades.

## 11. TOCTOU

- **Source TOCTOU (prevented).** FFmpeg never consumes the original path. Batch 2A staged the bytes content-addressed from one opened
  handle; Batch 2B consumes only the staged object. Changing or deleting the original after staging changes nothing (M14 shows
  byte-identical output after the original was rewritten and removed).
- **Staged-object TOCTOU (prevented or detected).**
  - Each staged object is opened only where its real path is the runtime root's real path joined with its owned relative location
    (D5). That makes it a regular file, not a link, opened as the very object `lstat` found. Its size and full SHA-256 are verified
    through that handle, and the same handle is inherited by FFmpeg (`-fd N`), so FFmpeg does not open a path at all.
  - A rename over the path cannot redirect the handle. On this platform the read-only staged object also makes the rename fail with
    EPERM (M13).
  - A staging namespace replaced by a directory junction is refused, even over identical bytes (M22). A file symbolic link cannot be
    created by this user (`EPERM`, recorded in M22 and B80); if one could be, the regular-file check refuses it.
  - Tampering before the permit is refused (B67). Tampering after the permit and before execution is refused before any process
    starts (M12).
  - Every input is re-hashed through its own handle after exit: an in-place change during execution fails and publishes nothing
    (M13: `changed_after_verification`).
- **Residual (documented, not hidden).**
  - Node on Windows cannot open a file with a deny-write share mode. The same user can therefore clear the read-only attribute and
    rewrite the staged object in place between verification and FFmpeg's read.
  - That is detected after exit, not prevented. FFmpeg may already have consumed the changed bytes, but the run fails and nothing is
    published.
  - The pinned binaries are verified by digest and then spawned by path, so a same-user swap in between is not detected.
  - A same-user swap of the pending output name between the pre-link identity check and the hard link is not prevented. The post-link
    inode check then fails closed.
- **Scope.** No claim is made about power-loss durability of a just-published name, or about processes running as the same user
  with hostile intent beyond these detections.

## 12. Output publication

```
exclusive private pending file (render-pending/<128-bit random>.mp4, opened "wx+")
→ FFmpeg writes through the inherited handle (-fs bound)
→ exit 0, inputs unchanged → size > 0 and ≤ derived bound → full SHA-256 through the same handle
→ chmod 0444 and fsync through the handle → accounting not FAIL
→ pending name proven to still be that very object (same volume and file identity, regular file)   [D2]
→ hard link to render-outputs/<sha256>.mp4 (no overwrite) → reopen and fully re-verify → receipt
```

- **New output.** Published (`published_by_this_execution`, M02).
- **Exact existing output.** The existing object is reopened and fully re-verified, never overwritten (`existing_output_reverified`,
  M03).
- **Corrupt occupied output.** Fails closed as storage corruption; the occupant is never overwritten, repaired or deleted (M17).
- **Pending name swapped or removed during the run.** Nothing is linked and the private name is cleaned
  (`output_publication_corrupt` / `output_missing`, M21, D2).
- **Output namespace.** Rendered outputs live in their own namespace, not `staged-objects/`.
- **Temporary files.** Temporary and working files are never caller-selected, never persisted and cleaned on every handled failure
  (M15, M21). A hard crash can leave inert garbage in `render-pending/` or `render-work/`, which has no authority; there is no automatic
  sweep.

## 13. Execution receipts

- **Durable start.** `RenderExecutionStart` is published no-overwrite under the claim target before the process starts. It consumes
  the claim's single execution: a retry needs attempt + 1 (M02, M15, M19).
- **Success receipt** (`RenderExecutionReceipt`, `render_execution_receipt_v0`). Each field is a truth claim:
  - scope; logical operation and attempt; AttemptRegistration; ExecutionClaim; claim target; DAG; EditGraph identity and revision;
    admission; execution grant;
  - render computation; render intent; render profile; executor; environment; RuntimeIdentity;
  - the actual FFmpeg SHA-256, reported version and build-configuration digest; the ffprobe SHA-256 and version;
  - renderer semantics version and digest; RenderProgram identity; encoding and profile;
  - the permit binding (id, authorizedAt, validUntil); the execution start;
  - exact inputs (asset, stagedObjectId, content hash, size), each verified by a fresh-handle full SHA-256 before spawn and after exit
    and handed over as the same verified handle;
  - process: spawnedAt, completedAt, exit code 0, no signal, not timed out, the timeout used, the output bound, the argv digest and
    count;
  - measurements, reservation ceilings, derived work and replayed accounting;
  - output artifact identity, content hash, size, container and publication outcome, verified by reopening;
  - bounded diagnostics; recorder implementation;
  - `qc: not_performed_by_renderer_independent_technical_qc_required`.
- **Failure record** (`RenderExecutionFailure`). It is structurally separate: the same lineage, plus stage, owned failure code and
  authority, whether execution started, the start, per-input verification state, re-verification state, process evidence when a
  process ran, timing, diagnostic digest, the accounting available before failure, and `output: none_published`. It can never carry an
  output identity (B87).
- **Schema invariants.**
  - The schemas recompute accounting from the raw measurements, so relabelled coverage or status fails (B87).
  - A timeout record must show a timed-out process.
  - A process implies a recorded start.
  - Success requires exit 0, no signal and no timeout.
- **What is never persisted.** No record holds a local path, temporary or final path, argv, command string, URL or secret. The argv
  is evidenced only by its digest. The final evidence scan found 0 location-like strings in 1,878 recorded strings; M02 asserts this
  on every actual record.
- **Diagnostics.** Sanitized excerpt lines keep FFmpeg's context-pointer labels (for example `[libx264 @ 0000014b…]`). These are
  process-local addresses of an exited child: they are not a location or a secret, but they make the excerpt run-specific.
- **Persistence.** Receipts are immutable, content-identified records returned to the caller. The adapter durably persists the
  execution start and the content-addressed output; durable receipt storage is not part of this batch.

## 14. Accounting (original closure; historical — the current accounting is in the fourth addendum)

> Historical. This section records the original closure's PARTIAL accounting and its blocker. The owner has since ruled on both
> decisions listed at its end, and the fourth addendum records the resulting accounting: PASS under the ruling, scoped to the one pinned
> local executor.

Final canonical run (M02; `batch2b-final-media-evidence/m02-canonical.json`), against the exact accepted reservation replayed through
the admission:

| Dimension | Value | Coverage | Evidence / basis | Reserved | Within |
|---|---|---|---|---|---|
| wallClockMilliseconds | 1,048 | measured | adapter monotonic clock, spawn to exit | 900,000 | yes |
| cpuMilliseconds | 328 | ffmpeg_reported | FFmpeg `-benchmark` win32 GetProcessTimes user + kernel | 600,000 | yes |
| peakRamBytes | 46,309,376 | ffmpeg_reported | FFmpeg `-benchmark` "maxrss" = win32 PeakPagefileUsage (peak private commit, not a resident-set peak) | 8,000,000,000 | yes |
| gpuMilliseconds | 0 | not_applicable | software codecs and filters only; no hardware device requested | 0 | yes |
| peakVramBytes | 0 | not_applicable | same | 0 | yes |
| apiSpendInrMicros | 0 | not_applicable | local pinned process, `fd`-only protocols, no provider or API | 0 | yes |
| totalCostInrMicros | — | **unavailable** | no owner-defined local compute cost model | 1,000,000 | — |
| modelCalls | 0 | not_applicable | no model invoked | 0 | yes |
| frames | 120 | derived | accepted DAG output frames (QC decoded 120) | 100,000 | yes |
| pixelFrames | 6,912,000 | derived | frames × 180 × 320 | 100,000,000,000 | yes |
| audioMilliseconds | 4,000 | derived | linked samples 192,000 at 48 kHz (QC decoded 192,000) | 3,600,000 | yes |
| outputBytes | 147,717 | measured | exact verified output bytes | — | — |

- **Status rule.** PASS only if every dimension is measured, derived or not applicable and within its reservation.
- **Result: RESERVATION-CONSUMPTION ACCOUNTING: PARTIAL.** The dimensions not truthfully reconcilable are:
  - `cpuMilliseconds`: FFmpeg-reported, not independently measured;
  - `peakRamBytes`: FFmpeg-reported peak pagefile usage, not an independent resident-memory measurement;
  - `totalCostInrMicros`: unavailable.
- **FAIL path.** A reservation exceeded by reported work fails with `reservation_consumption_exceeded` and accounting FAIL, without
  publication (M19, B86). Accounting provenance cannot be caller-forged (B87).
- **Exact blocker (why the implementation verification is FAIL).**
  - Frozen Batch-2B requirement 10 (accepted Batch-2A record, "Frozen Batch-2B requirements") requires measured runtime resource,
    cost and time accounting.
  - Node exposes no per-child CPU or memory counters on Windows. The only trustworthy child evidence available without a new tool is
    FFmpeg's self-report, which the owner requires to be labelled `ffmpeg_reported`, not measured.
  - No owner-authorized cost model exists to derive `totalCostInrMicros`.
  - Inventing prices, amortization or a zero cost, or equating wall time with money, is forbidden.
- **Why fail-closed.** The implementation keeps the gap visible and records it as PARTIAL instead of relabelling it.
- **Smallest next owner decision or repair.**
  1. Rule whether FFmpeg-reported CPU time and peak pagefile usage are acceptable evidence for those dimensions, or authorize a trusted
     OS-level per-process measurement mechanism (for example Windows job-object accounting) in a separate bounded repair.
  2. Define a local compute cost model, or rule that `totalCostInrMicros` is not applicable to local execution.

## 15. Independent technical QC

- **Separate adapter.** `scripts/edit-media-qc-local.ts` is a separate adapter. It imports nothing from the renderer and trusts no
  success claim.
- **Own pinning.** It re-verifies the approved root and the ffprobe and ffmpeg digests and sizes itself.
- **Locates by content identity.** It finds the published object only by its content identity and re-hashes it.
- **Inspection.** Over a fresh verified handle (`-fd 3 fd:`, `fd`-only whitelist) it:
  - probes streams and format with the pinned ffprobe;
  - probes every decoded frame's PTS and samples;
  - fully decodes with the pinned ffmpeg (`-xerror -err_detect explode -f null`).
- **Expectations.** They come from the accepted DAG's final encode and composition, never from the receipt or program.
- **Checks, in order.**
  - `output_identity` (hash and size equal the receipt);
  - `probe_output` (strict JSON schema; malformed or unexpected structure fails);
  - `container_format`;
  - `stream_layout` (exactly one video; audio present or absent as expected; no other stream);
  - `video_codec` (h264), `video_geometry` (w × h, SAR 1:1), `video_pixel_format` (yuv420p);
  - `video_frame_rate` (r and avg), `video_frame_count` (decoded frames), `video_frame_grid` (every PTS exactly `i/fps`);
  - `audio_format` (aac, rate, channels, layout), `audio_samples` (decoded samples);
  - `container_duration` (stream duration exact; container duration within 1,000 µs);
  - `complete_decode` (exit 0 and no error lines).
- **Receipt.** Scope `technical_media_qc_only_not_semantic_or_editing_quality`.
- **Why exit status is not QC.** An exit 0 proves only that FFmpeg ended. QC fails a truncated file, a damaged payload that still
  parses, wrong geometry, rate, frame count, duration, audio presence, rate or layout, a corrupt container and altered bytes (M18),
  each by its own check. The final canonical QC passed all 14 checks.

## 16. Synthetic actual-media run (canonical M02, original closure run; historical — the output bytes are unchanged in every later run)

- **Sources.** Tiny deterministic lavfi fixtures, generated with the pinned FFmpeg into the fixture authority's directory. This is
  generation, not EditGraph execution. The sources then enter the normal chain: registration, MediaAsset, FootageAnalysis, graph,
  admission, DAG, registration, claim, staging.
  - A: moving `testsrc2`, 90 × 160, 30 fps CFR, 4 s, 120 frames, H.264 yuv420p without B-frames in MOV, with 48 kHz stereo PCM
    carrying 440 Hz until its 1.5 s instant and 550 Hz after. SHA-256 `ab75a43c…aeef0`, 828,811 bytes.
  - B: solid `0x3060c0`, same format, 660 Hz until 1 s, 880 Hz until 2.5 s, 990 Hz after. SHA-256 `629605a9…c7cd5d`, 776,487 bytes.
  - Every generated frame carries its own frame number in a black/white binary band.
- **Graph.** A [0, 2) s, then B [1, 3) s (non-zero trim), frame-exact endpoints, an explicit hard cut, a warm look (intensity 500) on
  clip 0, and linked source audio.
- **Profile.** final, 180 × 320, 30 fps, h264 / yuv420p / `deterministic_constant_quality_v0`, aac 48 kHz stereo.
- **Execution.**
  - DAG `execution_dag_v0_c1e72f08…34f6`; render computation `…43f7a00a…8890`; program `render_program_v0_7524187d…9a52`.
  - Permit binding `…f20dbb7c…547f`: authorizedAt 10:03:24.845Z, validUntil 10:03:34.845Z (bounded by the 10 s permit lifetime;
    every freshness window extended beyond it).
  - Start at 10:03:25.059Z; process 10:03:25.078Z → 10:03:26.126Z, exit 0.
- **Output.** SHA-256 `e38b21c69ad767a42ca812e5c032f4931dc8d3b0e16dc7c89218cca92dd1627a`, 147,717 bytes, artifact
  `render_output_artifact_v0_fb029df2…0f48`, `published_by_this_execution`.
- **QC.** `pass`, 14/14 checks: 1 video + 1 audio stream, 180 × 320, 120 decoded frames on the exact 1/30 grid, container duration
  4.000000 s, 192,000 decoded audio samples, clean full decode.
- **Frame truth.** Every output frame's band reads A 0–59 then B 30–89 (the non-zero trim), with A's moving pattern for 60 frames then
  B's solid colour for 60. No frame is dropped, repeated or shifted, and the cut is exactly at frame 60.
- **Audio truth.** Classifying the 400 decoded 10 ms windows gives 440 Hz from 0.00 s, 550 Hz from 1.50 s, 880 Hz from 2.00 s and
  990 Hz from 3.50 s. B's pre-trim 660 Hz never plays. Linked audio follows the same selection and stays aligned across the cut and
  to the end, with no drift.
- **Accounting** as in §14 (PARTIAL). The EditGraph bytes are unchanged by execution.

## 17. First red

Test-first, before any production file existed (`batch2b-first-failure.md`, `b9c08399c2adb26cb5cb8a31a4a1dc58a4044ebe898a7e6e09b2e3807dffaf2f`):

- `npm.cmd run typecheck`, exit 2 (`batch2b-first-red-typecheck.log`, `b6c9f9d2…`).
- Seven TS2307 errors: the Batch-2B core and adapters did not exist.
- Three test-authoring defects were corrected test-only before any production code:
  - an `await` in a synchronous arrow;
  - an untyped array.
- Confirmed red after the correction (`batch2b-first-red-typecheck-after-test-correction.log`, `6647563e…`): exit 2 with TS2307 × 7.
- This proved there was no trusted permit, typed RenderProgram or FFmpeg compiler, no real-evidence record, no execution receipt and
  no QC receipt.

## 18. Reds and repairs (chronology; separate from the final-green evidence)

Implementation reds before the first green:

| Step | Receipt | Result |
|---|---|---|
| Initial pure run | `batch2b-initial-pure-run.log` | 35/38; B68 test forged an inconsistent program (test corrected to assert both invalid and schema-valid mismatch), B96 static check refined, SAFE_LINE draft flaw (`:` excluded) repaired |
| Pure run 2 | `batch2b-pure-run-2.log` | 37/38 (B87 asserted a key the explicit `none_published` field carries; test corrected) |
| Pure first green | `batch2b-pure-first-green.log` | 38/38 |
| Media initial | `batch2b-media-initial-run.log` | 0/19: the pinned build lists decoder `acelp.kelvin`; the listing parser refused dotted names |
| Red → repair | `batch2b-listing-name-red-run.log` → `batch2b-listing-name-repair-run.log` | red, then 38/38 (names may contain `.`) |
| Media run 2 | `batch2b-media-run-2.log` | 0/19: FFmpeg 9 prints a blank line and "Exiting with exit code 0" after `-buildconf` |
| Red → repair | `batch2b-buildconf-trailer-red-run.log` → `batch2b-buildconf-trailer-repair-run.log` | red, then 38/38 (flag block ends at the first blank line; only that exact trailer tolerated) |
| Media run 3 | `batch2b-media-run-3.log` | 10/19: test support did not pass the attempt to the grant (support fix) |
| Media first green | `batch2b-media-run-4.log` | 19/19 |
| Audit policy | `batch2b-audit-initial-run.log` → `batch2b-audit-run-2.log` | 9/10 (test expected the wrong message for an unprefixed specifier) → 10/10 |

Hostile self-review after the first green (`batch2b-self-review-findings.md`, recorded before each red):

| # | Attack | Red regression and red receipt | Repair | Post-repair proof |
|---|---|---|---|---|
| D1 | Deletion or expiry recorded after the lifecycle observation, before or after the permit | M20; `batch2b-selfreview-media-red.log` (render ran and published after deletion) | Observation handle re-queries the registry; re-queried at permit issue and at execution start | `batch2b-selfreview-d1-d2-d5-repair-run.log`, then `batch2b-selfreview-m20-test-correction-run.log` (M20 test used one logical attempt three times; corrected to attempts 1–3) |
| D2 | Pending output name replaced with foreign bytes, or removed, while FFmpeg runs | M21; same red receipt (foreign bytes linked as `<contentHash>.mp4`) | Pending name must still be the verified object before linking; else `output_publication_corrupt` / `output_missing`, name cleaned | `batch2b-selfreview-d1-d2-d5-repair-run.log` |
| D3 | Declared aspect disagrees with real geometry → silent stretch | B18; `batch2b-selfreview-pure-red.log` (stretched source compiled) | Compiler refuses `source_geometry_unsupported`; semantics descriptor gains `framing` | `batch2b-selfreview-d3-d4-repair-run.log` (40/40) |
| D4 | Another executor build shares segment identities | B19; same pure red (segment identity unchanged) | Executor bound into every segment computation | `batch2b-selfreview-d3-d4-repair-run.log` |
| D5 | Staging namespace replaced by a junction to identical bytes | M22; media red (render ran through the junction) | Staged object must resolve inside the runtime-owned namespace | `batch2b-selfreview-d1-d2-d5-repair-run.log` |
| D6 | Accounting bases did not name what FFmpeg reports on Windows | B86; `batch2b-selfreview-d6-red.log` | Bases name GetProcessTimes user + kernel and PeakPagefileUsage | `batch2b-selfreview-d6-repair-run.log` (40/40) |

- Each red test stopped at its first failing sub-case. M20's expiry and pre-permit-deletion sub-cases and M21's removed-name sub-case
  exercise the same missing mechanisms; their pre-repair behaviour is stated from the code.
- Tests strengthened in the same review:
  - M02 and M09: frame-number band and tone windows; location-free actual records.
  - M18: damaged payload and unexpected audio.
- Full media rerun after D1–D5: 22/22 (`batch2b-media-selfreview-full-run.log`). It predates D6 and is not final evidence; its outputs
  are kept in `batch2b-selfreview-media-evidence/`.

## 19. Adversarial attack matrix (original closure bytes; historical)

All results below are from the original closure bytes: pure suite 40/40 (`batch2b-closure-pure-batch2b.log`), actual-media suite
22/22 (`batch2b-closure-media-suite.log`), audit-policy 10/10 (`batch2b-closure-audit-policy-tests.log`). Every test named below also
passes on the final bytes (third addendum), and the addenda add M23–M34.

| # | Attack | Expected | Actual (test) |
|---|---|---|---|
| 1 | Synthetic Batch-2A DispatchPreparation | cannot execute | refused; no input accepts it (B02) |
| 2 | Caller-forged `real_local_probe` record | cannot execute | records need a live handle: `trust_handle_required` (M10); relabelled synthetic kind invalid (B02) |
| 3 | Caller-forged `real_authoritative_observation` | cannot execute | `trust_handle_required` (M10); record-only lifecycle refused (B02) |
| 4 | Persistent real records without ephemeral proof | cannot execute | `trust_handle_required` / `evidence_session_mismatch` (M10) |
| 5 | Wrong claim ownership | refuse | `runtime:claim_ownership_required` (B61, B81) |
| 6 | Registration changed / foreign | refuse | another claim's ownership refused; foreign staged receipt `claim_mismatch` (B61) |
| 7 | Stale execution grant | refuse | `runtime:execution_grant_expired` (B62) |
| 8 | Exact execution-grant expiry boundary | expired at expiresAt | valid at −1 ms, refused at expiresAt (B62) |
| 9 | Stale media grant | refuse | `runtime:media_grant_expired` (B62) |
| 10 | Exact media-grant expiry boundary | expired at expiresAt | valid at −1 ms, refused at expiresAt (B62) |
| 11 | Stale lifecycle observation | refuse | `lifecycle_stale` exactly at the window end (B63) |
| 12 | Lifecycle deleted after staging | refuse | `lifecycle_deleted` at binding (B64); after the permit, before execution: refused at execution start, nothing spawned (M20) |
| 13 | Lifecycle expires after staging | refuse | `lifecycle_expired`; retention bounds validUntil (B64); expiry set after the permit refused at execution (M20) |
| 14 | Stale capability observation | refuse | `capability_probe_stale` (B63) |
| 15 | Stale runtime observation | refuse | `runtime_probe_stale` (B63) |
| 16 | Permit used exactly at validUntil | expired | binding refused at validUntil (B60); actual permit refused at validUntil with no process and no start record (M11) |
| 17 | Wrong ffmpeg digest | runtime unavailable | `runtime_binary_mismatch` (B40, B65); the adapter never queries a non-pinned build |
| 18 | Wrong ffmpeg version | unavailable | `runtime_version_mismatch` (B40) |
| 19 | Wrong ffprobe digest | unavailable | `runtime_binary_mismatch` (B40) |
| 20 | PATH substitution | never used | decoy `ffmpeg.exe` first on PATH; tool roots refused; spawn uses the verified absolute path with no PATH in the env (M01) |
| 21 | Binary outside approved tool root | refuse | missing, relative, bare-name, decoy, `bin`, parent roots: `runtime_config_invalid` (M01) |
| 22 | Required encoder unavailable | unavailable | listing without libx264: `encoder_unavailable` (B40) |
| 23 | Required filter unavailable | unavailable | missing colorchannelmixer: `filter_unavailable`; missing concat: `capability_unavailable` (B41, B65) |
| 24 | Unknown capabilityId | refuse | `capability_unknown`, UNAVAILABLE (B41) |
| 25 | Malicious ID with shell metacharacters | never alters syntax | forged asset ID `…;movie=C:/…[out]` refused `render_program_invalid`; IDs never appear in argv (B21) |
| 26 | Malicious metadata string | never alters syntax | only integers and fixed tokens in the graph; grammar-checked token by token (B21) |
| 27 | Attempted command injection | impossible | argv array only, `shell: false`, no command string (B20, audit A2–A5) |
| 28 | Attempted filtergraph injection | impossible | no caller string reaches `-filter_complex`; forbidden tokens absent (B21) |
| 29 | `shell: true` | rejected | audit rejects every non-false shell spelling (A2, A5) |
| 30 | exec / execSync | rejected | audit rejects the imports and names (A2, A3, A5); pure core has none (B96) |
| 31 | Arbitrary executable | impossible | only the pinned verified binary; audit forbids inline executables (M01, A2) |
| 32 | URL / network input | impossible | `-protocol_whitelist fd`, `-fd N fd:`; no URL or path in argv (B20); no-network guard |
| 33 | stdin command interaction | impossible | `-nostdin`, stdin `ignore` (B20, adapter) |
| 34 | Original source changes after staging | no effect | byte-identical output after the original was rewritten (M14) |
| 35 | Original source deleted after staging | no effect | renders from the staged object (M14, B67) |
| 36 | Staged object tampered before permit | refuse | `runtime:staged_object_corrupt` at binding (B67) |
| 37 | Staged object tampered after permit, before spawn | refuse / detect | refused before any process (M12); latest-moment in-place mutation detected after exit, nothing published (M13) |
| 38 | Staged object replaced | refuse | rename over the path refused (EPERM) and cannot redirect the verified handle (M13); namespace replaced by a junction refused (M22) |
| 39 | Staged object becomes a symlink | refuse | file symlink not creatable by this user (EPERM recorded); reparse-point containment refuses a junction even over identical bytes (M22) |
| 40 | Fallback to original source | never | original deleted or tampered: staged bytes or refusal only (M12, M14) |
| 41 | Unsupported DAG node | refuse | `render_program_unsupported` (B17) |
| 42 | Unsupported operation | refuse | a non-cut transition or unknown look: `render_program_unsupported` (B17) |
| 43 | Unknown encoding | refuse | `render_program_unsupported` (B17) |
| 44 | Exact single clip | exact | B10; M08 silent single clip QC pass |
| 45 | Exact non-zero source trim | exact frames | B source frames 30–89 exactly, read back from the frame band (M02); compiler intervals (B11) |
| 46 | Multi-source hard cut | exact | cut exactly at output frame 60 (M02) |
| 47 | Exact output frame count | 120 | QC decoded 120 frames on the exact grid (M02) |
| 48 | CFR exact case | exact | M02, M09 |
| 49 | VFR / irregular timestamps | refuse | VFR refused by the real capability probe and compiler, nothing spawned (M06); irregular bytes: `source_timebase_mismatch` (M07, B50, B13) |
| 50 | Linked audio, single clip | exact | 96,000 samples; tone switch at the exact trimmed offset (M09) |
| 51 | Linked audio, multi-clip | exact, aligned | 440/550/880/990 Hz windows exactly per selection, no pre-trim audio (M02) |
| 52 | Missing required audio | refuse | `source_audio_missing` → `input_conformance_failed` (M08, B50) |
| 53 | Graph requiring no audio | video only | no audio stream mapped; QC pass with 0 audio streams (M08, B14, B22) |
| 54 | Neutral look | identity | `null` (B07); rendered (M05) |
| 55 | Warm look | fixed gains | B07; rendered, distinct (M05) |
| 56 | Cool look | fixed gains | B07; rendered, distinct (M05) |
| 57 | Contrast look | fixed gain | B07; rendered, distinct (M05) |
| 58 | Colour intensity boundaries | 0 = identity, 1000 = full | warm at 0 byte-identical to neutral; 1000 distinct (M05, B07) |
| 59 | Whole-output look | after concat | M05, B11 |
| 60 | Clip-scoped look | inside its segment only | M02 (clip 0 only), M05 |
| 61 | Spawn failure | failure evidence | `spawn_failed`, claim consumed, no output (M15) |
| 62 | Nonzero FFmpeg exit | failure evidence | `process_nonzero_exit` (M15, M13) |
| 63 | Timeout | request termination, wait bounded, fail | `process_timeout` (close observed), `timedOut` true, claim consumed, no output (M15); `process_termination_unconfirmed` if close never comes |
| 64 | Partial temp output after failure | no authority, cleaned | `render-pending/` empty after every handled failure (M15, M21) |
| 65 | Output missing despite exit 0 | fail | `output_missing`, exit 0 recorded, nothing published (M21) |
| 66 | Oversized output | never published | `output_oversized` (M16) |
| 67 | Temp-file collision attack | never published | 128-bit random name created exclusively (`wx+`); pending name replaced with foreign bytes: `output_publication_corrupt`, nothing linked, name cleaned (M21) |
| 68 | New output publication | publish | `published_by_this_execution` (M02) |
| 69 | Exact existing output | reverify | `existing_output_reverified` (M03) |
| 70 | Corrupt occupied output | fail closed | `output_publication_corrupt`, occupant untouched (M17) |
| 71 | No overwrite | never | occupied object and start record never overwritten (M17, M02) |
| 72 | Filesystem path in receipt | never | 0 location-like strings in 1,878 recorded strings; asserted on every actual record (M02, B60, B87) |
| 73 | Malformed ffprobe output | fail | `probe_output_invalid` (B50); QC fails (B91) |
| 74 | Corrupt container | QC fail | `probe_output`, `complete_decode` (M18) |
| 75 | Wrong resolution | QC fail | `video_geometry` (M18) |
| 76 | Wrong FPS | QC fail | `video_frame_rate` (+ count, grid) (M18) |
| 77 | Wrong frame count | QC fail | `video_frame_count` (M18) |
| 78 | Wrong duration | QC fail | `container_duration` (M18, B90) |
| 79 | Unexpected audio | QC fail | `stream_layout` against a no-audio DAG (M18, B90) |
| 80 | Missing audio | QC fail | `stream_layout` (M18) |
| 81 | Wrong sample rate | QC fail | `audio_format`, `audio_samples` (M18) |
| 82 | Wrong channel layout | QC fail | `audio_format` (M18) |
| 83 | Decode failure | QC fail | damaged payload in a parseable container: `complete_decode` (M18) |
| 84 | Output hash mismatch between receipt and QC | QC fail | `output_identity` (M18) |
| 85 | Preview/final separation | distinct | separate computations, claims and outputs; the same attempt cannot render both (M04, B15) |
| 86 | Output content identity ≠ render computation identity | distinct | two computations publish one content identity (M03) |
| 87 | Changing runtime changes execution identity | changes | render computation, program and segment identities all change (B19) |
| 88 | Changing renderer semantics changes identity | changes | executor digest changes computation, program and segment identities (B19); a non-current semantics digest refuses (B15) |
| 89 | No EditGraph mutation after execution | unchanged | graph bytes identical before and after (M02, B97) |
| 90 | Wall time recorded | measured | M19, M02 |
| 91 | Output bytes recorded | measured | M19 |
| 92 | Local / no-API path records API spend truthfully | 0, not_applicable | M19, B86 |
| 93 | CPU-only path does not invent GPU use | 0, not_applicable | M19, B86 |
| 94 | Unavailable metrics remain unavailable | unavailable | `totalCostInrMicros` unavailable; no benchmark → cpu/ram unavailable (M19, B86) |
| 95 | Reservation ceiling exceeded | fail | `reservation_consumption_exceeded`, accounting FAIL, nothing published (M19, B86) |
| 96 | Accounting provenance caller-forged | refuse | relabelled coverage or status fails the receipt schema (B87) |

Self-review additions: D1 (M20), D2 (M21), D3 (B18), D4 (B19), D5 (M22) and D6 (B86).

## 20. Test counts (original closure bytes; historical — the final counts are in §3 and the third addendum)

| Suite | Command / files | tests | pass | fail | skipped | cancelled | todo | Receipt |
|---|---|---|---|---|---|---|---|---|
| PURE BATCH-2B | `dist/tests/edit-render.test.js` | 40 | 40 | 0 | 0 | 0 | 0 | `batch2b-closure-pure-batch2b.log` |
| AUDIT POLICY (new 7 + accepted boundary 3) | `edit-render-audit.test.js`, `workspace-boundary.test.js` | 10 | 10 | 0 | 0 | 0 | 0 | `batch2b-closure-audit-policy-tests.log` |
| BATCH-2A REGRESSION | `edit-runtime.test.js` | 130 | 130 | 0 | 0 | 0 | 0 | `batch2b-closure-batch2a-regression.log` |
| BATCH-1 REGRESSION | `edit-execution.test.js` | 81 | 81 | 0 | 0 | 0 | 0 | `batch2b-closure-batch1-regression.log` |
| GATE-6 | `edit-graph.test.js` | 79 | 79 | 0 | 0 | 0 | 0 | `batch2b-closure-gate6-regression.log` |
| GATE-5 | `planning.test.js` | 97 | 97 | 0 | 0 | 0 | 0 | `batch2b-closure-gate5-regression.log` |
| ROUTING | `budgeted-perception-routing.test.js` | 33 | 33 | 0 | 0 | 0 | 0 | `batch2b-closure-routing-regression.log` |
| COMPATIBILITY | the accepted 16-file set (`batch2b-closure-compatibility-files.log`) | 377 | 377 | 0 | 0 | 0 | 0 | `batch2b-closure-compatibility.log` |
| LEGACY | `contracts`, `integration`, `jobs`, `telemetry` | 39 | 39 | 0 | 0 | 0 | 0 | `batch2b-closure-legacy-seams.log` |
| FULL SAFE SUITE | `npm.cmd test` (build + every `dist/tests/*.test.js`) | 883 | 883 | 0 | 0 | 0 | 0 | `batch2b-closure-full-safe-suite.log` |
| ACTUAL-MEDIA INTEGRATION | `dist/tests/edit-render-media.integration.js` (pinned FFmpeg/ffprobe) | 22 | 22 | 0 | 0 | 0 | 0 | `batch2b-closure-media-suite.log` |
| WORKSPACE AUDIT | `npm.cmd run audit:workspace` | — | PASS | — | — | — | — | `batch2b-closure-workspace-audit.log` |

All runs used the original closure bytes and `scripts/no-network.mjs`. The full safe suite (883) is the accepted Batch-2A total (836) plus the 40 pure Batch-2B and 7 audit-policy tests: every accepted historical test is present and passing, nothing is skipped, and the safe suite contains no actual-media test (0 `M` tests; media runs only in `*-media.integration.js`). Step timings (`batch2b-closure-gates-summary.log`):

```
typecheck exit=0 seconds=10.8
build exit=0 seconds=12.5
media-suite exit=0 seconds=571.1
batch2a-regression exit=0 seconds=137
routing-regression exit=0 seconds=1.2
compatibility exit=0 seconds=15.7
legacy-seams exit=0 seconds=0.5
gate6-regression exit=0 seconds=200.8
gate5-regression exit=0 seconds=258.2
pure-batch2b exit=0 seconds=39.3
audit-policy-tests exit=0 seconds=33.1
batch1-regression exit=0 seconds=805.5
full-safe-suite exit=0 seconds=728.9
final-typecheck exit=0 seconds=8.3
final-build exit=0 seconds=9
workspace-audit exit=0 seconds=1.2
git-diff-check exit=0 seconds=0.1
```

## 21. Workspace audit

`scripts/audit-workspace.mjs` (owner-authorized) replaces the single global adapter allowlist, which let every listed adapter import
`node:child_process`, with per-file capabilities.

| Adapter | Imports | Process capability |
|---|---|---|
| `reference-local.ts`, `transnetv2-local.ts`, `audio-beat-worker.ts`, `audio-energy-worker.ts`, `audio-structure-worker.ts` | accepted ceiling | legacy: `spawn`/`execFile` only |
| `audio-speech-worker.ts` (already spawned its worker but was not enumerated; now registered) | accepted ceiling | legacy |
| `analyze-reference.ts`, `footage-local.ts`, `analyze-footage.ts`, `audio-local.ts` | accepted ceiling minus `node:child_process` | none |
| `edit-runtime-local.ts` (Batch 2A, now registered) | `node:crypto`, `node:fs/promises`, `node:path` | none |
| `edit-render-fixture-authority-local.ts` | `node:crypto`, `node:fs/promises`, `node:path` | none |
| `edit-render-local.ts` | `node:child_process`, `node:crypto`, `node:fs/promises`, `node:path`, `node:perf_hooks`, `node:url` | strict_spawn |
| `edit-media-qc-local.ts` | `node:child_process`, `node:crypto`, `node:fs/promises`, `node:path`, `node:url` | strict_spawn |

- **All adapters.**
  - Subprocess functions are imported by name only.
  - Forbidden everywhere: `exec`, `execSync`, `execFileSync`, `spawnSync`, `fork`, `eval`, `require`, `new Function`, dynamic import
    and `process.binding`/`dlopen`.
  - A `shell` key, however spelled (identifier, string, literal computed key or shorthand), may only be `false`.
- **strict_spawn adapters.**
  - `spawn` only, never renamed or aliased, called directly.
  - The executable is a verified value (identifier or property), never a literal, template or concatenation.
  - The options object is literal, has no spread and no computed key, and has exactly one `shell: false`.
- **Everywhere else.** No other file under `packages/`, `samples/`, `scripts/` or `tests/` may import `child_process`. Registered test
  harness files: `workspace-boundary.test.ts`, `reference-media.integration.ts`, `support/footage-media.ts`,
  `support/edit-render-media.ts`, `edit-render-audit.test.ts`.
- **Preserved prohibitions.** Network clients, dynamic import, hidden `Date`/random/`process.env` in application packages, explicit
  `any` and unapproved dependencies.
- **Tests.** `tests/edit-render-audit.test.ts` (7 tests) mutates one file at a time in a copied fixture. Every forbidden construct
  above fails with its own message, and unmodified adapters and a `.exec` RegExp property are not over-flagged. The accepted
  `workspace-boundary.test.ts` (3 tests) still passes unchanged.
- **Final audit.** PASS: "14 explicit local runtime adapters with per-file capabilities (subprocess-capable: reference-local.ts,
  transnetv2-local.ts, audio-beat-worker.ts, audio-energy-worker.ts, audio-structure-worker.ts, audio-speech-worker.ts,
  edit-render-local.ts, edit-media-qc-local.ts), the 5 registered test harness process files, no subprocess import anywhere else".

## 22. Protected-byte proof

The final comparison (`batch2b-closure-preservation.json`, `05ade537393fc2b40236bce6b322189f519302925644401a5c3d5fe1d1c10026`) re-hashed every file
recorded in `batch2b-baseline.json` after all verification and documentation.

- **Verdict:** PASS.
- **Git state:**
  - branch and HEAD unchanged (`d3c8302b40a5064ae0eb4408195dc35346ecc648`);
  - nothing staged;
  - tracked-file set unchanged (278 files).
- **Tracked files changed against the baseline:** only the two owner-authorized modifications,
  `docs/CURRENT_PHASE.md` and `scripts/audit-workspace.mjs`.
- **Protected set:** 0/184 changed.
- **Owner evidence files:** 0/13 changed (hash and size).
- **Earlier Gate-7 receipts:** 167 files, 0 changed.

Protected set by accepted gate (`batch2b-closure-preservation-groups.log`):

| Group | Files | Changed |
|---|---|---|
| Gate-5 (packages/planning, tests/planning.test.ts) | 8 | 0 |
| Gate-6 (packages/edit-graph, tests/edit-graph.test.ts) | 8 | 0 |
| Gate-7 Batch-1 (packages/edit-execution, tests/edit-execution.test.ts) | 10 | 0 |
| Gate-7 Batch-2A (packages/edit-runtime, scripts/edit-runtime-local.ts, tests/edit-runtime.test.ts) | 12 | 0 |
| Manifests and locks (package.json, package-lock.json, pyproject.toml, uv.lock) | 4 | 0 |
| Accepted reports (docs/phases/*) | 17 | 0 |
| Accepted test support (tests/support/*, tracked) | 10 | 0 |
| All other protected | 115 | 0 |

Owner-authorized modifications, reviewed separately:

- `scripts/audit-workspace.mjs` e1a02ac94b4355a368667fc3e4109e720fd63a17fba632ba124abad5176def5f → 253d9020e1a5fec574742880c0681f694032dbb958f35af0388945257bcf3378.
  - This is the per-file subprocess-capability policy of §21 (+84 / −7 lines).
  - Every earlier check, message and prohibition is retained.
- `docs/CURRENT_PHASE.md` 2b0272c23189abd1983515eea322ed71c88d65250aff2e02b78ce7d5c384dded → 84728077fbc757da15c01ed4a1a553a0ef9208574d4e37793d8e64e63358bae9.
  - This is the narrow status update made after verification (+65 / −3 lines): the title and date, one ruling bullet, a new Batch-2B
    section and one stop-condition sentence.
  - All historical text is unchanged.

## 23. Dependency proof

- `package.json` and `package-lock.json` are byte-identical to the baseline (both in the protected set, §22).
- The workspace audit's manifest check passes (`zod` only; `@types/node`, `typescript` dev).
- No `npm install`, `npm ci`, Python install or tool download was run: no such command appears anywhere in the session.

## 24. Network proof

- **Network activity: none.**
  - No `git fetch`, `pull` or `push`, no install and no download ran in this batch; the session transcript contains no such command.
  - Every test ran under `scripts/no-network.mjs`.
  - Every FFmpeg and ffprobe invocation in the renderer, probes and QC whitelists only the `fd` protocol.
- Fixture generation reads lavfi sources and writes a local file.

## 25. `git diff --check`

- `git diff --check`: exit 0, empty output (`batch2b-closure-git-diff-check.log`, 0 bytes). It covers the two tracked modifications.
- The 19 new untracked files (including this report) were scanned separately: no trailing whitespace, no tab, no carriage return,
  and every file ends with a newline.

## 26. Git status at the original closure (historical)

```
$ git status -sb
## phase/5-edit-planner-v0...origin/phase/5-edit-planner-v0
 M docs/CURRENT_PHASE.md
 M scripts/audit-workspace.mjs
?? CLAUDE.md
?? docs/phases/phase-5-gate-7-batch-2b-render-execution.md
?? gate5-final-owner-diff.txt
?? gate5-owner-source-review.txt
?? gate5-postrepair-owner-review.txt
?? gate5-recon.txt
?? gate6-final-owner-review.txt
?? gate6-owner-source-review.txt
?? gate7-batch1-final-owner-review.txt
?? gate7-batch1-owner-review.txt
?? gate7-batch1-postrepair-owner-review.txt
?? gate7-batch2a-owner-review.txt
?? gate7-batch2a-postrepair-owner-review.txt
?? gate7-recon.txt
?? packages/edit-render/
?? scripts/edit-media-qc-local.ts
?? scripts/edit-render-fixture-authority-local.ts
?? scripts/edit-render-local.ts
?? tests/edit-render-audit.test.ts
?? tests/edit-render-media.integration.ts
?? tests/edit-render.test.ts
?? tests/support/edit-render-media.ts
?? tests/support/edit-render.ts
$ git diff --cached --name-only
(empty: nothing staged)
$ git rev-list --count d3c8302b40a5064ae0eb4408195dc35346ecc648..HEAD
0
```

- **Nothing is staged, committed, pushed or merged.**
  - HEAD is still `d3c8302b40a5064ae0eb4408195dc35346ecc648`, with 0 commits beyond it.
  - The branch shows no divergence from its last-known upstream, and no fetch was performed.
- **Modified:** `docs/CURRENT_PHASE.md` and `scripts/audit-workspace.mjs`.
- **Untracked from this batch:**
  - `packages/edit-render/`;
  - the three `scripts/edit-*` adapters;
  - the three `tests/edit-render*` test files;
  - two test-support files;
  - this report.
- **Untracked owner evidence, untouched:** the thirteen owner evidence files (`CLAUDE.md` and twelve `gate*-*.txt` captures).

## 27. Limitations

- **Lifecycle authority.** Production user-media lifecycle authority is not verified. The fixture authority proves the mechanism for
  synthetic fixtures only.
- **Scope not exercised.**
  - Real customer or user footage was not run. No semantic, aesthetic or editing-quality verification was done.
  - Not implemented: a Critic, automatic repair, revision state (EditorialState, RevisionIntent, RevisionScope, ChangeBudget,
    GraphDiff), locks, an incremental or segment render cache, conversational editing, a professional UI, OTIO, MCP or third-party
    editors.
- **Media semantics.** VFR sources and any source not exactly on the output grid from zero are refused; exact VFR conformance is not
  implemented. Sources with a different display aspect are refused. No retiming, reframing, fades or silence synthesis exist.
- **Residual staged-object and binary TOCTOU** (§11). Same-user in-place mutation after verification is detected after exit, not
  prevented. Same-user binary swap between digest verification and spawn is not detected. The same-user pending-name swap race is
  narrowed and fails closed.
- **Accounting dimensions not independently measured.** CPU time and peak memory are FFmpeg-reported (win32 GetProcessTimes; win32
  PeakPagefileUsage, not resident memory), and total cost is unavailable (§14). Accounting is PARTIAL. (Status superseded by the
  owner's accounting ruling: the FFmpeg reports remain attributed, not independently measured, and total cost is now not applicable
  to this local execution; see the fourth addendum.)
- **Evidence handling.** Receipts are returned to the caller, not durably stored (the start record and output are durable). Unexpected
  I/O exceptions after the start record propagate as exceptions, with the claim consumed and nothing published unless the output was
  already linked. Diagnostic excerpts keep FFmpeg's process-local pointer labels.
- **Local authority domain and trusted local clock.** Unchanged from Batch 2A.
- **Determinism.** Byte identity was observed only within one runtime, program, input set and environment.
- **Graph-intent boundary.** The receipts bind graph identity and revision; nothing was written into the EditGraph.

## 28. State at the original closure (historical — the current status block ends the third addendum)

PHASE 5 GATE 7 BATCH 2B IMPLEMENTATION VERIFICATION:
FAIL

ACTUAL PINNED-FFMPEG SYNTHETIC MEDIA EXECUTION:
PASS

INDEPENDENT ACTUAL-MEDIA QC:
PASS

RESERVATION-CONSUMPTION ACCOUNTING:
PARTIAL

PRODUCTION USER-MEDIA LIFECYCLE AUTHORITY:
NOT VERIFIED

REAL USER FOOTAGE:
NOT RUN

SEMANTIC EDITING QUALITY:
NOT VERIFIED

GATE 7 BATCH 2B OWNER ACCEPTANCE:
PENDING

GATE 7 OVERALL:
NOT YET COMPLETE

## Addendum — independent owner-review repair (2026-09-26)

The independent owner source review of the final bytes above found three defects. They were repaired test-first, and only in
current, uncommitted Batch-2B files. Every step has a receipt in `.local-runs/phase5-gate7/` (`batch2b-owner-*`,
`batch2b-ownerrepair-*`):

- the findings were recorded before any red (`batch2b-owner-review-findings.md`);
- the pre-repair bytes of every in-scope file are preserved in `batch2b-owner-review-prerepair-source/`.

No accepted file changed. Reservation-consumption accounting was deliberately not touched and remains PARTIAL.

### Finding 1 (critical) — mutable trusted-evidence handle state

**Defect.** The handles exposed their evidence as public object references:

- `TrustedMediaRuntime.runtimeProbe` and `TrustedMediaRuntime.capabilityProbe`;
- `TrustedInputConformance.record`;
- `TrustedLifecycleObservation.record`.

`Object.freeze(this)` is shallow, and `proves()` compared a caller-reachable record with another reference to the same object. A
caller holding a genuine handle could mutate its record in place, recompute the content identity coherently, and have the handle
certify the result. This is distinct from the forged, cloned and prototype-built handles M10 already refused.

**Red.**

- B82 (`batch2b-owner-f1-pure-red.log`): a genuine lifecycle handle certified its own record after the recorded deletion was erased
  and the record re-identified.
- M23 recorded every sub-case before asserting (`batch2b-owner-f1-media-red.log`; observations
  `batch2b-owner-f1-red-m23-observations.json`):
  - a genuinely nonconforming conformance (variable-rate bytes under an admitted constant-rate table), mutated to `conforms`,
    produced **a permit and a successful real FFmpeg execution**;
  - runtime, capability, lifecycle and conformance evidence made stale by the clock and then re-timed through the genuine handle each
    produced a permit (a freshness bypass for all four classes).

**Repair.**

- Each handle now keeps a private `structuredClone` snapshot, taken when the trusted probe or query constructs it.
- The public getters (`runtimeProbe`, `capabilityProbe`, `record`) return fresh copies.
- `proves()` compares against the private snapshot and the session proof.
- The issuer builds the evidence bundle only from snapshot copies.
- Unchanged: `toJSON` still throws; plain JSON, cloned and prototype-built handles remain non-authoritative (M10).

**Green.**

- B82: pure suite 41/41, then 42/42.
- M10 and M23 (`batch2b-owner-f1-media-green.log`):
  - the mutated conformance is refused (`input_conformance_failed`);
  - every re-timed class stays stale (`runtime_probe_stale`, `capability_probe_stale`, `lifecycle_stale`, `input_conformance_stale`);
  - coherently re-identified copies are not certified;
  - the genuine evidence still authorizes and renders.

**Trust boundary.** These guarantees hold against callers that construct data or hold genuine handles. They do not hold against
in-process code that redefines the adapter modules' exported classes or prototypes.

### Finding 2 (high) — QC process timeout could wait forever

**Defect.** The QC runner killed the child at its timeout but settled only on a later `close` or `error`. Its fixed `-version`
queries parsed stdout without checking exit status, spawn error, overflow or termination.

**Step 0 (behaviour-preserving extraction).** The existing supervision and version logic became `superviseQcProcess(child, limits)`
and `reportedVersionOf(run, tool)`. They take an already-spawned child or a completed run, so no executable enters the QC API. The
pinned-binary, `shell: false`, minimal-environment and strict-spawn audit rules are unchanged. The unrepaired extracted bytes are
preserved in `batch2b-owner-f2-extracted-unrepaired-edit-media-qc-local.ts.txt` (`fdc7718e…`).

**Red** (`batch2b-owner-f2-red.log`):

- M24: a controlled stand-in child that never closes left supervision still pending 2 s after a 50 ms timeout;
- M25: a version was read from nonzero-exit, spawn-error, overflow, timeout and unconfirmed-termination runs.

**Repair.**

- At the timeout the child is asked to terminate. If it has not closed within the bounded grace (`QC_PROCESS_LIMITS`: 120 s timeout,
  10 s grace), supervision settles with `terminationConfirmed: false`. It never waits forever.
- A synchronous spawn failure becomes a spawn error of that run.
- One rule defines a run that counts: exit 0, no spawn error, overflow or timeout, and confirmed termination. That rule gates:
  - tool versions (anything else fails closed as `qc_tool_unavailable`);
  - the probe and decode evidence (an incomplete run yields no probe output and no successful decode exit, so QC fails).

**Green** (`batch2b-owner-f2-green.log`): M24, M25, M02 (QC passes on actual media) and M18 (every QC attack still fails).

### Finding 3 (high) — terminal evidence after the durable execution start

**Defect.** Reachable escapes, found before the red:

- the exported `afterInputsVerified` callback failing after the durable start produced a raw exception, with the claim consumed and no
  evidence;
- a runtime clock stepped back after the start made success-receipt certification throw *after* this execution had already published
  its output, again as a raw exception;
- by reading the code: after this execution's own link, the verification-failure branches emitted `output: none_published`, which is
  false.

Filesystem failures in the output stat, hash, chmod, fsync, pending-name check, link and final-reopen regions are either guarded or not
locally provokable. A closed inherited descriptor makes `spawn` throw synchronously (`EBADF`, probed), but no caller can reach the
adapter's private handles.

**Red** (`batch2b-owner-f3-red.log`; observations `batch2b-owner-f3-red-m26-post-start-failure.json` and
`batch2b-owner-f3-red-m27-post-publication-terminal-evidence.json`):

- M26: a raw `Error` escaped;
- M27: a raw `EditRenderError` escaped with `abd7b61b….mp4` published.

**Repair** (option A, within Batch 2B):

- **Truthful output state.** The failure record's `output` is either `none_published` or
  `{ state: "linked_by_this_execution_unverified" | "published_by_this_execution_uncertified", contentHash, sizeBytes, meaning }`.
  - A failure names an output only for a started execution whose process exited 0, for the bytes it measured.
  - That happens only at the stage where certification stopped: `publication` (unverified) or the new `receipt_certification` stage
    (verified).
  - Such a record never denies an output this execution published (B89).
- **Every post-start error ends in a failure record.** After the durable start, an error ends in a failure record at the stage it
  interrupted. A non-owned error carries the new owned code `execution_interrupted`. After this execution's own link, failures name
  the linked output.
- **Chronology guards.**
  - A spawn-time reading earlier than the start fails before any process spawns (`evidence_chronology_invalid`).
  - A recording-time reading earlier than completion yields a `receipt_certification` failure that names the verified, published
    output (M27).
- **Owned refusal where truthful evidence is impossible.** A runtime clock running backwards *while the process runs* leaves no
  truthful process timing. The adapter then raises the owned `execution_evidence_unrecordable` refusal before anything is published
  (M28). The same refusal is raised if a failure record itself cannot be built.
- **Instrumentation hook.** `RenderInstrumentation` is documented as test-only and grants nothing; its failure now ends in a truthful
  failure record (M26).
- **Residuals.**
  - Power loss or process death produces no receipt.
  - Unexpected failures before the durable start (claim not consumed) may still surface as exceptions.
  - There is no job-recovery subsystem.

**Green** (`batch2b-owner-f3-pure-green.log` 42/42, `batch2b-owner-f3-media-green.log`, `batch2b-owner-f3-m28-run.log`): B89,
M26, M27, M28 and the unchanged M02, M15, M17 and M21.

### Superseded statements in this report

- §13 and §27, "Unexpected I/O exceptions after the start record propagate as exceptions": superseded by Finding 3. Post-start errors
  end in failure records; the remaining residuals are listed above.
- §13, the failure record "can never carry an output identity" and states `output: none_published`: superseded. A failure still
  carries no output artifact identity and states `none_published` when nothing was linked. After this execution's own link, it names
  the linked content identity as unverified or uncertified.
- §6, handle evidence: the records are now private snapshots exposed only as copies (Finding 1).
- §8 and §15, QC: QC processes are now bounded by timeout plus grace (Finding 2).
- §3, §19 and §20, counts: pure Batch-2B 40 → 42; actual-media 22 → 28; full safe 883 → 885.

### Final verification after the owner-review repair (bytes of that repair; historical, superseded by the third addendum)

| Suite | tests | pass | fail | skipped | cancelled | todo | Receipt |
|---|---|---|---|---|---|---|---|
| Pure Batch-2B | 42 | 42 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-pure-batch2b.log` |
| Audit-policy (7 new + 3 accepted boundary) | 10 | 10 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-audit-policy-tests.log` |
| Actual-media integration (pinned FFmpeg/ffprobe) | 28 | 28 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-media-suite.log` |
| Batch-2A regression | 130 | 130 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-batch2a-regression.log` |
| Batch-1 regression | 81 | 81 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-batch1-regression.log` |
| Gate-6 | 79 | 79 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-gate6-regression.log` |
| Gate-5 | 97 | 97 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-gate5-regression.log` |
| Routing | 33 | 33 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-routing-regression.log` |
| Compatibility | 377 | 377 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-compatibility.log` |
| Legacy seams | 39 | 39 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-legacy-seams.log` |
| Full safe suite (`npm.cmd test`; no media test inside) | 885 | 885 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair-full-safe-suite.log` |

- **Other checks.** Typecheck and build PASS. Workspace audit PASS. `git diff --check` PASS (empty).
- **Protected bytes** (`batch2b-ownerrepair-preservation.json`, `cc002162bcb22e8be109a8cf756cebf31ec83948145833cbe96d34452e06e5d7`):
  PASS.
  - 0/184 protected files, 0/13 owner evidence files and 0/167 earlier receipts changed.
  - The only tracked changes are the two owner-authorized files (`scripts/audit-workspace.mjs` and `docs/CURRENT_PHASE.md`); the audit
    script is unchanged by this repair.
  - Nothing is staged, and HEAD is still `d3c8302b40a5064ae0eb4408195dc35346ecc648`.
- **Final media evidence** (`batch2b-ownerrepair-media-evidence/`).
  - 0 location-like strings in 2,300 recorded strings.
  - The canonical M02 render is byte-identical to the pre-repair final run (`e38b21c69ad767a42ca812e5c032f4931dc8d3b0e16dc7c89218cca92dd1627a`,
    147,717 bytes).
  - QC `pass`, accounting `PARTIAL`.
- **Network, dependencies, commits.** No network access, dependency change, commit, stage or push.
- **New owner file.** A new untracked owner review capture, `gate7-batch2b-owner-source-review.txt`, appeared during this review. It
  was not created, read, modified or staged by this work. The 13 baseline owner files are unchanged.

OWNER-REVIEW TRUST-HANDLE REPAIR:
PASS

OWNER-REVIEW QC-LIVENESS REPAIR:
PASS

OWNER-REVIEW TERMINAL-EVIDENCE REPAIR:
PASS

ACTUAL PINNED-FFMPEG SYNTHETIC MEDIA EXECUTION:
PASS

INDEPENDENT TECHNICAL MEDIA QC:
PASS

RESERVATION-CONSUMPTION ACCOUNTING:
PARTIAL

PHASE 5 GATE 7 BATCH 2B IMPLEMENTATION VERIFICATION:
FAIL (unchanged: fail-closed on frozen requirement 10 while accounting is PARTIAL)

GATE 7 BATCH 2B OWNER ACCEPTANCE:
PENDING

GATE 7 OVERALL:
NOT YET COMPLETE

## Second addendum — owner-review repair #2 (2026-09-26)

The independent post-repair source review accepted the three earlier repairs (private trusted-evidence snapshots, bounded QC liveness,
post-start terminal evidence) and found three further defects. Each was reproduced red on the unrepaired bytes and repaired narrowly,
test-first, in `scripts/edit-render-local.ts`, `scripts/edit-media-qc-local.ts` and `tests/edit-render-media.integration.ts` only.

- The findings were recorded before any red (`batch2b-owner-review-2-findings.md`).
- The pre-repair bytes of every in-scope file are preserved in `batch2b-owner-review-2-prerepair-source/`.
- No package, accepted file or accounting semantics changed; accounting remains PARTIAL.

### Finding 1 (critical) — the real-execution policy was mutable after permit issuance

**Defect.** `issueExecutablePermit` validated the caller's policy, and the binding recorded its `policyId`, but the permit kept the
caller's very object. `executeAuthorizedRender` later read that object to derive the output byte bound (`output.maxOutputBytes`) and the
process timeout (`process.maxWallClockMilliseconds`). The freshness windows and `permitLifetimeMilliseconds` are consumed only at
issuance (the binding's `validUntil` is fixed), so they are not reread.

**Red.** M29 recorded every sub-case before asserting (`batch2b-owner2-f1-red.log`; observations
`batch2b-owner2-f1-red-m29-observations.json`):

- a permit issued under a 1 ms process bound, whose caller object was then widened, **succeeded** (the bound policy gives
  `process_timeout`);
- a permit issued under a 10,000-byte output bound, whose caller object was then widened and coherently re-identified, **succeeded** (the
  bound policy gives `output_oversized`);
- invalid values written into the caller object after issuance reached execution and produced a raw `input_invalid` refusal;
- the issuance-only fields, mutated after issuance, had no effect (confirming they are not reread).

**Repair.**

- At issuance the adapter takes one private `structuredClone` snapshot of the policy, once.
- The evaluation validates that snapshot (canonical form and content identity), and the binding names its `policyId`.
- The permit keeps only the snapshot; the caller's object is never retained.
- At execution the snapshot must parse and its `policyId` must equal `binding.policy.policyId`, or the result is
  `permit_validation`/`permit_required`.

**Green.** M29 (`batch2b-owner2-f1-green.log`) gives `process_timeout` and `output_oversized` under the bound policy. Invalid caller
mutations are ignored and the render succeeds. M11, M15 and M16 are unchanged.

### Finding 2 (high) — timed-out or unconfirmed probe runs could count as trusted evidence

**Defect.** The runtime probe's fixed queries (`-version`, `-buildconf`, the component listings, the ffprobe `-version`) accepted a run
on `spawnError === null`, `exitCode === 0` and no overflow alone. Staged-input conformance checked only overflow, spawn error and exit
code.

**Step 0 (behaviour-preserving).** The existing rule was extracted into one exported predicate, `completedProbeRun(outcome)`, over a
run's outcome fields; no executable enters any API. The unrepaired extracted bytes are preserved in
`batch2b-owner2-f2-extracted-unrepaired-edit-render-local.ts.txt` (`12de4fa2…`).

**Red.** M30 (`batch2b-owner2-f2-red.log`): a timed-out run with exit 0, an unconfirmed termination with exit 0, and a signaled run with
exit 0 were all accepted.

**Repair.** A run is trusted evidence only if all of these hold:

- no spawn error;
- exit 0;
- no signal;
- not timed out;
- termination confirmed;
- no stdout overflow.

The one rule serves every fixed runtime query, component listing and version query, and the staged-input conformance probe. A timed-out
run is never evidence, even if it later reports exit 0. QC's rule for its own runs has the same meaning: exit 0 excludes a signal, and it
also requires no timeout and confirmed termination.

**Green** (`batch2b-owner2-f2-green.log`): M30, plus the real probes and conformance M01, M06, M07 and M08.

### Finding 3 (high) — QC identity and QC probes/decode were not bound to one file object

**Defect.** QC hashed `render-outputs/<contentHash>.mp4` through one handle, closed it, then reopened the pathname for the stream probe,
the frame probe and the full decode. A pathname replacement in between let `observedIdentity` describe one object while the technical
observations described another.

**Step 0 (behaviour-preserving).** A test-only `instrumentation.afterIdentityEstablished` point was added to `runTechnicalMediaQc`. The
instrumented unrepaired bytes are preserved in `batch2b-owner2-f3-instrumented-unrepaired-edit-media-qc-local.ts.txt` (`dec8950a…`).

**Red.** M31 (`batch2b-owner2-f3-red.log`; observations `batch2b-owner2-f3-red-m31-observations.json`):

- after identity, the pathname was replaced by a compatible object (same container, streams and frame structure, damaged coded
  payload). The unrepaired QC produced a receipt claiming the published output's identity with a `complete_decode` failure that came
  from the other object;
- after identity, the held object was changed in place. The receipt kept the pre-change identity, with no re-verification after
  inspection.

**Repair.**

- QC opens the published object once and holds four handles: one for identity and one for each inspecting child.
- Each handle is proven to be the same regular file object (same volume and file identity) before inspection starts. A change during
  acquisition fails closed.
- The identity is hashed through the held object.
- The stream probe, frame probe and full decode each read their own held handle. The pathname is never reopened.
- After inspection the held object is re-hashed. Bytes changed in place are reported as what they now are, so `output_identity` fails.
- Every handle is closed in `finally`.

**Green** (`batch2b-owner2-f3-green.log`):

- M31: after a pathname swap QC still inspects the held object (pass, claimed identity); an in-place change fails (`output_identity`,
  `complete_decode`);
- M02 passes QC;
- M18's attacks still fail.

**Residual.** Node cannot open files deny-write on Windows. Same-user code that changes the held bytes and restores them before the
post-inspection re-hash could go undetected.

### Documentation correction

§8 and attack 63 said the adapter "terminates" a timed-out child. The truthful statement is that the adapter requests termination
(`ChildProcess.kill`) and waits a bounded 10 s for `close`. If close is not observed it reports `process_termination_unconfirmed`
and publishes nothing, without claiming OS-level proof that the process is dead. Both passages were corrected in place, and the
correction is recorded here. No Windows Job Object or process manager was added; this remains an explicit local-development residual.

### Considered in the restricted final review and not changed

The permit also retains the caller's `RuntimeCall`. Its members are accepted trusted objects (the replay-validated DAG handle, the
runtime and the in-memory claim ownership):

- execution re-verifies each of them (claim ownership and registration, execution and media grants, lifecycle);
- every authority window is already fixed in the binding's `validUntil`;
- a runtime object's ledger and render store share one root.

Swapping them therefore cannot widen authority beyond the binding, and no red could be produced, so no change was made.

> Superseded by the third addendum (owner-review repair #3, Finding 1). This conclusion was wrong. M32 reproduced an expired permit
> executing through a runtime substituted into the caller's container, and a second execution of one claim over a copied runtime root.
> The paragraph above is kept unchanged as chronology.

### Final verification after owner-review repair #2 (bytes of that repair; historical, superseded by the third addendum)

| Suite | tests | pass | fail | skipped | cancelled | todo | Receipt |
|---|---|---|---|---|---|---|---|
| Pure Batch-2B | 42 | 42 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-pure-batch2b.log` |
| Audit-policy (7 new + 3 accepted boundary) | 10 | 10 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-audit-policy-tests.log` |
| Actual-media integration (pinned FFmpeg/ffprobe) | 31 | 31 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-media-suite.log` |
| Batch-2A regression | 130 | 130 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-batch2a-regression.log` |
| Batch-1 regression | 81 | 81 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-batch1-regression.log` |
| Gate-6 | 79 | 79 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-gate6-regression.log` |
| Gate-5 | 97 | 97 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-gate5-regression.log` |
| Routing | 33 | 33 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-routing-regression.log` |
| Compatibility | 377 | 377 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-compatibility.log` |
| Legacy seams | 39 | 39 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-legacy-seams.log` |
| Full safe suite (`npm.cmd test`; no media test inside) | 885 | 885 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair2-full-safe-suite.log` |

- **Other checks.** Typecheck and build PASS. Workspace audit PASS. `git diff --check` PASS (empty).
- **Protected bytes** (`batch2b-ownerrepair2-preservation.json`, `0160700f77b72cbcc48c3ae769e27d4ac080c678169e2e923fb3e659cbd0dd73`):
  PASS.
  - 0/184 protected files, 0/13 owner evidence files and 0/167 earlier receipts changed.
  - The only tracked changes are the two owner-authorized files; nothing is staged; HEAD is `d3c8302b40a5064ae0eb4408195dc35346ecc648`.
  - `package.json` and `package-lock.json` are byte-identical to the baseline.
- **Final media evidence** (`batch2b-ownerrepair2-media-evidence/`).
  - 0 location-like strings in 2,310 recorded strings.
  - The canonical M02 render is still byte-identical (`e38b21c69ad767a42ca812e5c032f4931dc8d3b0e16dc7c89218cca92dd1627a`, 147,717 bytes).
  - QC `pass`, accounting `PARTIAL`.
- **Network, dependencies, commits.** No network access, dependency change, commit, stage or push.
- **New owner file.** A further untracked owner review capture, `gate7-batch2b-postrepair-owner-review.txt`, is present. It was not
  created, read, modified or staged by this work. The 13 baseline owner files are unchanged.

OWNER-REVIEW POLICY-SNAPSHOT REPAIR:
PASS

OWNER-REVIEW PROBE-COMPLETION REPAIR:
PASS

OWNER-REVIEW EXACT-ARTIFACT-QC REPAIR:
PASS

PREVIOUS TRUST-HANDLE REPAIR:
PASS

PREVIOUS QC-LIVENESS REPAIR:
PASS

PREVIOUS TERMINAL-EVIDENCE REPAIR:
PASS

ACTUAL PINNED-FFMPEG SYNTHETIC MEDIA EXECUTION:
PASS

INDEPENDENT TECHNICAL MEDIA QC:
PASS

RESERVATION-CONSUMPTION ACCOUNTING:
PARTIAL

PHASE 5 GATE 7 BATCH 2B IMPLEMENTATION VERIFICATION:
FAIL (unchanged: fail-closed on frozen requirement 10 while accounting is PARTIAL)

GATE 7 BATCH 2B OWNER ACCEPTANCE:
PENDING

GATE 7 OVERALL:
NOT YET COMPLETE

## Third addendum — owner-review repair #3 (2026-09-26)

The owner's second post-repair source review accepted the six earlier repairs and found three further code defects and one
documentation-integrity defect. Each code defect was reproduced red on the unrepaired bytes before its repair, then repaired narrowly and
test-first in `scripts/edit-render-local.ts`, `scripts/edit-media-qc-local.ts` and `tests/edit-render-media.integration.ts` only.

- The findings were recorded before any red (`batch2b-owner-review-3-findings.md`).
- The pre-repair bytes of every in-scope file are preserved in `batch2b-owner-review-3-prerepair-source/`.
- No package, accepted file or accounting semantics changed; accounting remains PARTIAL.

### Finding 1 (critical) — the ExecutablePermit retained the caller-owned RuntimeCall

**Defect.** The permit state kept `input.call`, the caller's own container. Execution re-read its `runtime`, `dag` and `ownership` for
every execution-time check: the permit window (on that runtime's clock), the claim recheck, the grant windows, the render store that
holds the durable start record, the staged-input location and every recorded instant. `requireCall` checks only the ports' shape, and
`verifyClaim` binds the ownership to the durable claim, not to a runtime instance.

**Red.** M32 recorded every sub-case before asserting (`batch2b-owner3-f1-red.log`; observations
`batch2b-owner3-f1-red-m32-observations.json`). Each replacement was made in the caller's container after the permit was issued.

| Sub-case | Unrepaired outcome |
|---|---|
| The issuing runtime's clock advanced past `validUntil`; `runtime` replaced by another `LocalEditRuntime` over the same root, ledger and staging namespace, whose separate clock still reads inside the window | **succeeded**: the expired permit executed and published |
| Only the clock port replaced (the genuine runtime's other ports in another object) | **succeeded** |
| Two permits of one claim; the runtime root copied before the claim's execution was recorded; the first permit executed; the second presented with a runtime over the copy | **succeeded**: the claim's single execution ran twice (start records: 4 in the issuing root, 3 in the copy) |
| `dag` replaced by another claimed DAG | refused at `authority_recheck` (`claim_mismatch`); nothing started |
| `ownership` replaced by another claim's ownership | refused at `authority_recheck` (`claim_mismatch`); nothing started |
| `dag` and `ownership` replaced together by another coherent claim of the same caller | succeeded: the recheck validated the other claim, not the permit's own |
| `artifacts` removed | a raw `input_invalid` exception after the permit was consumed |

**Repair.** At issuance the adapter reads the caller's container once and builds a private, frozen permit context:

- the exact replay-validated DAG handle, runtime object and claim-ownership handle read from it;
- a private `structuredClone` copy of the supplied artifacts (data that cannot be cloned is refused as `input_invalid`);
- the context is validated again as held.

Evidence evaluation, the permit state and every execution-time recheck use only that context. The permit never retains the caller's
container, and the caller's object is not frozen or otherwise touched.

**Green.** M32 (`batch2b-owner3-f1-green.log`; observations `batch2b-owner3-f1-green-m32-observations.json`):

- both stale-clock substitutions are refused `permit_expired` at `permit_validation`, before any start record;
- the second permit of the executed claim is refused `execution_already_started`;
- every member replacement has no effect, and the legitimate renders succeed;
- 5 start records, all in the issuing root, and none in the copy.

M10, M11, M20 and M29 are unchanged.

**Scope of the guarantee.** The permit holds the exact runtime object used at issuance, and the permit window is measured on that
runtime's clock. That runtime is the caller-configured, accepted Batch-2A runtime:

- its objects carry no brand, so a caller that configures a runtime with another clock *before* issuance times the whole chain by that
  clock;
- the internals of the accepted runtime's port objects are outside this repair.

### Finding 2 (high) — technical QC was timed by a caller-supplied clock

**Defect.** `runTechnicalMediaQc` took a `clock` beside the runtime and timed `checkStartedAt`, `observedAt` and `checkCompletedAt` from
it.

**Red.** M33 (`batch2b-owner3-f2-red.log`; observations `batch2b-owner3-f2-red-m33-observations.json`). With the genuine runtime, a
caller clock one year later and then one year earlier timed both QC receipts. Both passed, and one was dated a year before the render it
inspected.

**Repair.**

- `clock` is removed from the QC input: `runTechnicalMediaQc({ dag, receipt, runtime, toolRoot, instrumentation? })`.
- QC time comes only from `runtime.clock`, the runtime whose store QC inspects, with the same exact-UTC-milliseconds validation.
- Every call site was updated, and manual-clock tests configure the runtime's clock.
- QC remains technical evidence only and grants nothing.

**Green.** M33 (`batch2b-owner3-f2-green.log`; observations `batch2b-owner3-f2-green-m33-observations.json`): both receipts are timed
by the runtime clock, whatever the caller passes. M04 and M31 are unchanged. The unbranded-runtime scope stated under Finding 1 applies
equally here.

### Finding 3 (high) — an error after spawn was reported as a spawn failure with termination confirmed

**Defect.** Both supervisors finished on the child's `error` event as a spawn error with termination confirmed. Node also emits `error`
after a successful spawn, for example when the termination request itself fails, and the child may still be running:

- the render path reported `spawn_failed` for a process that had started and whose termination was never observed;
- an error while the child ran requested no termination at all.

**Step 0 (behaviour-preserving).** The renderer's supervision became the exported `supervisePinnedProcess(child, limits, started)`, and
its failure classification became `processFailureCodeOf(run)`.

- Unchanged: the pinned binary, `shell: false`, the minimal environment, bounded capture, the 10 s grace and no PATH lookup.
- No executable enters any API.
- The extracted unrepaired bytes are preserved in `batch2b-owner3-f3-extracted-unrepaired-edit-render-local.ts.txt` (`d6a9127d…`).
- M02 (canonical bytes unchanged), M15 and M30 passed on them (`batch2b-owner3-step0-regression.log`).

**Red.** M34 (`batch2b-owner3-f3-red.log`; observations `batch2b-owner3-f3-red-m34-observations.json`) drove controlled stand-in
children through both supervisors:

- **Spawned, timed out, termination requested, `error` emitted, never closed** (the owner's case): both reported a spawn error with
  termination confirmed, and the renderer classified it `spawn_failed`.
- **The same, with a later close:** the same untruthful record.
- **Spawned, `error` while running, never closed:** both reported a spawn error with termination confirmed, and no termination was
  requested.
- **Never spawned:** a spawn failure, as expected.

**Repair.** Both supervisors track the child's `spawn` event.

- **Before spawn,** an `error` is a spawn failure: no process exists.
- **After spawn,** an `error` proves nothing about termination:
  - it is recorded (`errorAfterSpawn`);
  - termination is requested once (a timeout and an error share one request);
  - the bounded grace runs, and only an observed `close` confirms termination.
- **Render classification, in order:**
  - a child that never started → `spawn_failed`;
  - a started child whose close was not observed → `process_termination_unconfirmed`, timed out or not; nothing is published;
  - then `process_timeout`;
  - a closed run with an error after spawn → `execution_interrupted`;
  - then a signal, then a nonzero exit.
- **Evidence rules.** `completedProbeRun` and QC's completion rule reject any run with an error after spawn. QC reports an unconfirmed run
  with `terminationConfirmed: false`, so its version query fails closed and its probe and decode evidence are absent.
- **Not added:** Windows Job Objects or any process manager.

**Green.** Receipt `batch2b-owner3-f3-green.log`; observations `batch2b-owner3-f3-green-m34-observations.json`:

- M34;
- M24, M25 and M30, each with one added error-after-spawn case;
- real-process M02 and M15: timeout, nonzero exit and a real spawn failure keep their codes, and the real spawn failure still records no
  process.

### Finding 4 — documentation and evidence integrity

**Defect.** §3 still stated 40 pure and 22 actual-media tests, and its "Final source SHA-256" block listed the original closure
hashes. Other tables and headings labelled "final" also predated the repairs.

**Repair.**

- §3 now carries the current counts and the authoritative final source hash table of the final bytes after this repair. The original
  closure table is kept beneath it, labelled historical. This report is not hashed into itself.
- Relabelled in place as historical, with nothing else rewritten:
  - the evidence pointer under the status table;
  - the headings of §16, §19, §20, §26 and §28, and the opening sentences of §19 and §20;
  - the first and second addenda's verification headings.
- §8 gained one marked sentence on errors after spawn.
- The second addendum's statement about the retained `RuntimeCall` is kept, followed by a pointer to this addendum.
- `docs/CURRENT_PHASE.md` names its earlier verification blocks as historical and states the final status.

### Superseded statements in this report

- **Second addendum, "Considered in the restricted final review and not changed".** Superseded by Finding 1. The conclusion that
  swapping the `RuntimeCall` members could not widen authority, and that no red could be produced, was wrong. M32 reproduced an expired
  permit executing, and a second execution of one claim over a copied root.
- **§3 counts and final hash table.** Updated; the original values are kept, labelled historical.
- **"Final" labels in §1–§28 and in the first and second addenda.** They name the bytes of their own time; the final bytes are below.

### Restricted final hostile review

The review was limited, as instructed, to four questions.

- **Permit-owned context immutability.**
  - The context is a frozen object created at issuance. It is reachable only through the permit's private state, which only the
    adapter module can read, and nothing returns it.
  - Its DAG and ownership handles are the accepted branded, frozen objects; the runtime is the frozen accepted local runtime object; the
    artifacts are a frozen private copy.
  - Every execution-time check reads the context: the permit window, claim, grants, lifecycle, start record, staged inputs and recorded
    instants. No caller-reachable member is read after issuance.
  - A container whose members are getters is read once, and the held context is validated again.
  - Nuance, probed on Node 24.15.0: a supplied artifact whose bytes view a `SharedArrayBuffer` is cloned as shared memory. Artifact
    content is read only during issuance and never at execution, so this has no effect after issuance.
- **QC trusted-clock binding.**
  - QC reads `runtime.clock` once and uses it for both timing fields; no other time source enters the QC receipt.
  - The runtime is the one whose store QC inspects. As for the renderer, an unbranded runtime object configured with another clock is
    outside the trust model.
- **Post-spawn termination truth.**
  - A real spawn failure (no `spawn` event) remains `spawn_failed` with no process evidence (M15).
  - After spawn, no `error` settles a run: only `close` or the bounded grace does, and the grace always reports
    `terminationConfirmed: false`.
  - The render classifies an unconfirmed run before any other process outcome. Every process failure returns before output
    verification, so nothing is published, and the private pending name is removed in `finally`.
  - Residual (unchanged): a child whose termination is unconfirmed may still be running. There is no OS-level proof of termination and
    no process manager.
- **Report hash/count consistency.**
  - §3's counts (42 pure, 34 actual-media) equal the final receipts.
  - §3's final hash table equals `batch2b-ownerrepair3-final-source-hashes.txt`, including the final `docs/CURRENT_PHASE.md`, and was
    re-checked against the working tree after this documentation was written.
  - No other table in this report is labelled final without naming its time.

### Final verification after owner-review repair #3 (bytes of that repair; historical, superseded by the fourth addendum)

| Suite | tests | pass | fail | skipped | cancelled | todo | Receipt |
|---|---|---|---|---|---|---|---|
| Pure Batch-2B | 42 | 42 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-pure-batch2b.log` |
| Audit-policy (7 new + 3 accepted boundary) | 10 | 10 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-audit-policy-tests.log` |
| Actual-media integration (pinned FFmpeg/ffprobe) | 34 | 34 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-media-suite.log` |
| Batch-2A regression | 130 | 130 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-batch2a-regression.log` |
| Batch-1 regression | 81 | 81 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-batch1-regression.log` |
| Gate-6 | 79 | 79 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-gate6-regression.log` |
| Gate-5 | 97 | 97 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-gate5-regression.log` |
| Routing | 33 | 33 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-routing-regression.log` |
| Compatibility | 377 | 377 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-compatibility.log` |
| Legacy seams | 39 | 39 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-legacy-seams.log` |
| Full safe suite (`npm test`; 0 media tests inside) | 885 | 885 | 0 | 0 | 0 | 0 | `batch2b-ownerrepair3-full-safe-suite.log` |

- **Other checks.**
  - Typecheck and build PASS; workspace audit PASS; `git diff --check` PASS (empty).
  - Step timings are in `batch2b-ownerrepair3-gates-summary.log`.
  - The full safe suite ran alone, after every other suite had finished.
- **Protected bytes** (`batch2b-ownerrepair3-preservation.json`, `a05b0ffe2f23a80ff6820a3ac41ed721d1eb98fc79e44f7c3d228b4caf410439`,
  taken after verification and before this documentation): PASS.
  - 0/184 protected files, 0/13 owner evidence files and 0/167 earlier receipts changed.
  - The only tracked changes are the two owner-authorized files. The audit script is unchanged by this repair (`253d9020…`).
  - Nothing is staged, and HEAD is `d3c8302b40a5064ae0eb4408195dc35346ecc648`.
  - `package.json` and `package-lock.json` are byte-identical to the baseline.
- **Later owner files.** Three untracked Batch-2B owner review captures postdate the baseline: `gate7-batch2b-owner-source-review.txt`,
  `gate7-batch2b-postrepair-owner-review.txt` and `gate7-batch2b-postrepair2-owner-review.txt`.
  - Their hashes and sizes were recorded at the start of this repair (`batch2b-owner3-owner-files-at-start.json`), and they are
    unchanged.
  - This work only hashed them: none was created, modified or staged.
- **Final media evidence** (`batch2b-ownerrepair3-media-evidence/`, 19 files, all from the final media run).
  - The same location scan as before found 0 location-like strings in 2,341 recorded strings
    (`batch2b-ownerrepair3-media-evidence-scan.json`).
  - The canonical M02 render is still byte-identical (`e38b21c69ad767a42ca812e5c032f4931dc8d3b0e16dc7c89218cca92dd1627a`,
    147,717 bytes).
  - QC `pass`, accounting `PARTIAL`.
- **Network, dependencies, commits.** No network access, dependency change, commit, stage or push.

OWNER-REVIEW PRIVATE-RUNTIME-CONTEXT REPAIR:
PASS

OWNER-REVIEW QC-CLOCK-BINDING REPAIR:
PASS

OWNER-REVIEW PROCESS-TERMINATION-TRUTH REPAIR:
PASS

OWNER-REVIEW FINAL-EVIDENCE-DOC REPAIR:
PASS

PREVIOUS SIX OWNER-REVIEW REPAIRS:
PASS

ACTUAL PINNED-FFMPEG SYNTHETIC MEDIA EXECUTION:
PASS

INDEPENDENT TECHNICAL MEDIA QC:
PASS

RESERVATION-CONSUMPTION ACCOUNTING:
PARTIAL

PHASE 5 GATE 7 BATCH 2B IMPLEMENTATION VERIFICATION:
FAIL (unchanged: fail-closed on frozen requirement 10 while accounting is PARTIAL)

GATE 7 BATCH 2B OWNER ACCEPTANCE:
PENDING

GATE 7 OVERALL:
NOT YET COMPLETE

## Fourth addendum — owner accounting closure (2026-09-27)

The owner accepted all ten owner-review repairs and ruled on the two accounting decisions §14 named, for Gate 7 Batch 2B
local-development execution only. This closure changed the accounting and nothing else, test-first.

- `scripts/edit-render-local.ts`, `scripts/edit-media-qc-local.ts` and `packages/edit-render/semantics.ts` are byte-identical to repair #3.
- Renderer semantics, FFmpeg execution, QC, trust handles and process supervision were not touched.
- The ruling and plan were recorded before any red (`batch2b-accounting-closure-plan.md`).
- The pre-change bytes are preserved in `batch2b-accounting-closure-prechange-source/`.

### The owner's ruling

| Dimension | Coverage | Basis |
|---|---|---|
| wallClockMilliseconds | measured | the adapter's monotonic execution timing |
| outputBytes | measured | exact verified output bytes |
| cpuMilliseconds | ffmpeg_reported, accepted | FFmpeg's win32 process-time report (user + kernel), attributed to FFmpeg; never relabelled measured |
| peakRamBytes | ffmpeg_reported, accepted | FFmpeg's win32 PeakPagefileUsage (peak private committed memory); not independently measured resident-set RAM |
| gpuMilliseconds, peakVramBytes | not_applicable | software CPU codecs and filters only; no hardware acceleration requested |
| apiSpendInrMicros | not_applicable | entirely local: pinned media runtime, fd-only media protocols, no external provider or API |
| modelCalls | not_applicable | the renderer invokes no model |
| frames, pixelFrames, audioMilliseconds | derived | the existing deterministic derivation from the accepted program and DAG |
| totalCostInrMicros | not_applicable | local non-metered execution: no billable provider execution and no owner-authorized local hardware, electricity or amortization cost model |

Accounting may be PASS only if every required dimension has truthful coverage. `ffmpeg_reported` is accepted only for the two named
dimensions. Every measured, reported or derived dimension must be within its reservation ceiling. Every not-applicable dimension must be
proven inapplicable to this exact executor, and no monetary cost may be fabricated. The rule is scoped to the local pinned executor and
environment; it is not a global weakening.

### Red (pre-change bytes)

- **Pure** (`batch2b-accounting-red-pure.log`).
  - B86: the pinned local executor was PARTIAL, with total cost `unavailable`.
  - B92: every other executor build, executor, environment and runtime inherited the not-applicable GPU, VRAM, API and model rows
    unconditionally, and no record named a ruling.
  - B87, whose relabel-to-PASS case now uses a genuinely PARTIAL record, passed, as expected.
- **Media** (`batch2b-accounting-red-media.log`; observations `batch2b-accounting-red-m19-observations.json` and
  `batch2b-accounting-red-m02-canonical.json`).
  - M02 and M19 were PARTIAL.
  - M19's exceeded-CPU sub-case already failed the accounting stage with nothing published.
- **Hidden sub-cases.** These were confirmed separately, over the unchanged build and a real canonical receipt
  (`batch2b-accounting-red-subcases.json`):
  - the canonical record was PARTIAL, with the `_v0` rule and total cost unavailable;
  - without FFmpeg's report it was PARTIAL, and with an exceeded CPU ceiling it was FAIL;
  - a receipt relabelled to another executor while keeping its accounting still parsed.

### Change

The change is in `packages/edit-render/receipts.ts`; `packages/edit-render/index.ts` only adds exports.

- **Execution identity.** Accounting now takes the execution identity (executor build, environment, runtime) from one of three places:
  - the program, in `deriveAccounting`, the adapter's pre-publication check (its call is unchanged);
  - the permit binding, when a receipt is built;
  - the record itself, when a schema replays it.
- **Literal pins.** The ruling names its execution by literal identity:
  - executor `ci_ffmpeg_render_executor` 0.1.0, implementation digest `a54c51380f6cb315d904c991867a5c99f380fd9ed4af4d2e846017d31898fe48`,
    which is the digest of the V0 semantics (software codecs and filters only, fd-only protocols);
  - environment `local_win32_x64`;
  - runtime `ffmpeg_gyan_essentials_win64` `9.0.1-essentials_build-www.gyan.dev` (`72a489ec…`).

  The live executor, environment and runtime constants are not referenced, so a changed executor build, semantics, environment or
  runtime does not inherit the ruling.
- **Under the ruling.**
  - CPU time and peak commit stay `ffmpeg_reported`, with their exact bases, and are accepted.
  - GPU, VRAM, API spend and model calls keep their existing not-applicable rows.
  - Total cost is `not_applicable` with no value.
- **Without the ruling.**
  - GPU, VRAM, API spend, model calls and total cost are `unavailable`, with no value.
  - FFmpeg's reports are not accepted.
  - The accounting is at best PARTIAL.
- **Status.**
  - FAIL on any exceeded ceiling, whatever the coverage.
  - PASS only if every dimension is measured or derived, or, under the ruling only, not applicable or FFmpeg-reported for exactly CPU
    time and peak commit.
  - Otherwise PARTIAL.
- **Record fields.** Every record now names the ruling it applied (`ruling`), and the status-rule identifier is `_v1` because the rule
  changed. Records made before this closure carry the `_v0` rule and are historical.
- **Unchanged:** the dimensions, units, and the values and bases of every other row; the ceilings, the work derivation and FAIL.

### Green

- Pure 43/43 (`batch2b-accounting-green-pure.log`).
- M02, M18 and M19 (`batch2b-accounting-green-media.log`; `batch2b-accounting-green-m19-observations.json`).

### The owner's seven test points

1. **The canonical local execution reconciles to PASS.** M02 and the final canonical run, M19 and B86.
2. **`cpuMilliseconds` stays `ffmpeg_reported`,** with its basis unchanged: B86 and M19.
3. **`peakRamBytes` stays `ffmpeg_reported`** with the PeakPagefileUsage meaning (basis
   `ffmpeg_benchmark_maxrss_win32_peak_pagefile_usage_self_reported_v0`): B86 and M19.
4. **`totalCostInrMicros` is `not_applicable` and never numeric zero.** Value `null`, `withinReservation` `null` and an explicit
   not-zero basis: B86, B92 and M19.
5. **API, GPU, VRAM and model calls are `not_applicable` only for the proven local CPU-only executor.** B86 asserts the executor's own
   semantics facts (no hardware, fd-only in and out). B92 shows that every other execution gets `unavailable`.
6. **An exceeded FFmpeg-reported CPU reservation still produces accounting FAIL and prevents publication.** M19 runs it first, so no
   earlier output can occupy the identity. It fails at stage `accounting` (`reservation_consumption_exceeded`) with
   `output: none_published`, an empty output store and the claim consumed. B86 covers the same at the pure level.
7. **A future or different executor cannot reuse the local total-cost ruling.** In B92, another executor build, executor, environment
   and runtime each give total cost `unavailable` and PARTIAL. A receipt relabelled to another executor while keeping the local PASS
   fails its own schema.

### Final accounting (the final canonical run, `batch2b-accountingclosure-final-canonical-m02.json`)

| Dimension | Value | Coverage | Evidence / basis | Reserved | Within |
|---|---|---|---|---|---|
| wallClockMilliseconds | 1,032 | measured | adapter monotonic clock, spawn to exit | 900,000 | yes |
| cpuMilliseconds | 313 | ffmpeg_reported (accepted) | FFmpeg `-benchmark`: win32 GetProcessTimes user + kernel | 600,000 | yes |
| peakRamBytes | 46,206,976 | ffmpeg_reported (accepted) | FFmpeg `-benchmark` "maxrss" = win32 PeakPagefileUsage (peak private commit), not resident-set RAM | 8,000,000,000 | yes |
| gpuMilliseconds | 0 | not_applicable | software codecs and filters only; no hardware device requested | 0 | yes |
| peakVramBytes | 0 | not_applicable | same | 0 | yes |
| apiSpendInrMicros | 0 | not_applicable | local pinned process, fd-only protocols, no provider or API | 0 | yes |
| totalCostInrMicros | no value | not_applicable | local non-metered execution: no billable provider and no owner cost model; not a zero | 1,000,000 | — |
| modelCalls | 0 | not_applicable | no model invoked | 0 | yes |
| frames | 120 | derived | accepted DAG output frames (QC decoded 120) | 100,000 | yes |
| pixelFrames | 6,912,000 | derived | frames × 180 × 320 | 100,000,000,000 | yes |
| audioMilliseconds | 4,000 | derived | linked samples 192,000 at 48 kHz (QC decoded 192,000) | 3,600,000 | yes |
| outputBytes | 147,717 | measured | exact verified output bytes | — | — |

The status is **PASS**, with ruling `owner_local_non_metered_pinned_executor_ruling_v0` and rule
`pass_only_if_every_dimension_is_measured_derived_not_applicable_or_owner_ruled_ffmpeg_reported_and_within_its_reservation_v1`. The
output is byte-identical to every earlier canonical run (`e38b21c69ad767a42ca812e5c032f4931dc8d3b0e16dc7c89218cca92dd1627a`, 147,717
bytes, `published_by_this_execution`), and QC passed 14/14 checks.

- **FFmpeg's reports are accepted attributed evidence, not measurements.** CPU time is FFmpeg's own win32 report of its process user and
  kernel time. Peak memory is FFmpeg's own win32 PeakPagefileUsage, which is peak private committed memory, not resident-set RAM. Both
  stay labelled `ffmpeg_reported` with those exact bases. The owner accepts them as the evidence for these two dimensions of this
  executor. The adapter did not independently measure either.
- **Local total monetary cost is not applicable, not zero.** No billable provider runs, and no owner-authorized local hardware,
  electricity or amortization cost model exists. The row has no value. It is not a measured ₹0 or an estimated ₹0, and it does not mean
  local compute is free. API spend keeps its accepted `0, not_applicable` row: no API is invoked, so API spend is exactly zero. That row
  is not an estimate of the execution's monetary cost.
- **Production and cloud executors need an owner-approved cost model.** A metered cloud or production executor must account
  `totalCostInrMicros` with its own owner-approved pricing or cost model. It cannot inherit this ruling: any other executor build,
  environment or runtime gets `unavailable` and at best PARTIAL (B92).
- **Frozen requirement 10.** The accepted Batch-2A record's frozen requirement 10 asks for measured runtime resource, cost and time
  accounting. For this local executor, the owner's ruling defines which evidence satisfies it:
  - measured wall time and output bytes;
  - FFmpeg's attributed CPU time and peak commit;
  - derived render work;
  - proven not-applicable GPU, VRAM, API, model and monetary-cost dimensions.

  The final bytes prove exactly that, so implementation verification is PASS under the ruling. This is not a claim that CPU time or
  memory were independently measured.

### Superseded statements in this report

- **Header status table and FAIL paragraph.** The table now shows the current state; the paragraph is kept, labelled historical.
- **§14.** Labelled historical, including its PARTIAL table and blocker.
- **§27, accounting limitation.** The status is superseded; the attribution statement still holds.
- **§3 counts and hash table.** Pure Batch-2B tests 42 → 43. The repair-#3 values of the rows this closure changed are historical:
  - `packages/edit-render/receipts.ts` `6c588b081fa36e0cc79e8f752c726931b59bb5c296ac09478b5e9870f5d75281`;
  - `packages/edit-render/index.ts` `462a86bc3d8e01afea9f37000cb665ed36494a9c7c637fb624f9fad5d7204f6d`;
  - `tests/edit-render.test.ts` `17a5e6063788119b1e85b10068d3274976eb9678853cd05ba273878335c79862`;
  - `tests/edit-render-media.integration.ts` `6b650365280301b70f5d0d1664d921d3380b49b09eac7b2471600139275d9b90`;
  - `docs/CURRENT_PHASE.md` `8e294999dfcc52401176e52883ec018568c40abd7761ff64ad1780ca59f627f6`.
- **Third addendum's final verification heading.** Labelled historical.
- **§19, attack 94** ("`totalCostInrMicros` unavailable"). Under the ruling, the pinned local execution's total cost is not applicable;
  any other execution's stays unavailable (B92).

### Restricted hostile review of the accounting change

- **No relabelling.** CPU time and peak commit keep coverage `ffmpeg_reported` and their exact bases. Missing FFmpeg reports stay
  `unavailable` and PARTIAL.
- **No invented cost.** Total cost has no value in every case, and no price, amortization or zero is introduced.
- **No global weakening.**
  - `ffmpeg_reported` is accepted only for the two named dimensions, and only for the ruled execution.
  - Any other execution degrades to `unavailable`.
  - An exceeded ceiling FAILs whatever the coverage.
- **No automatic inheritance.** The ruling's identity is literal. If the V0 semantics, executor, environment or runtime change, B86, M02
  and M19 turn PARTIAL until an owner ruling covers the new execution.
- **Replay.** Both receipt schemas recompute accounting from the record's own measurements, ceilings, work and execution identity, so a
  relabelled ruling, status, coverage or executor fails.
- **Residual.** CPU time and peak commit remain FFmpeg's self-report about its own process, not an OS-level measurement by the adapter.
  The owner accepts them only as attributed evidence for this executor.

### Final verification after the owner accounting closure (final bytes)

| Suite | tests | pass | fail | skipped | cancelled | todo | Receipt |
|---|---|---|---|---|---|---|---|
| Pure Batch-2B | 43 | 43 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-pure-batch2b.log` |
| Audit-policy (7 new + 3 accepted boundary) | 10 | 10 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-audit-policy-tests.log` |
| Actual-media integration (pinned FFmpeg/ffprobe) | 34 | 34 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-media-suite.log` |
| Batch-2A regression | 130 | 130 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-batch2a-regression.log` |
| Batch-1 regression | 81 | 81 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-batch1-regression.log` |
| Gate-6 | 79 | 79 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-gate6-regression.log` |
| Gate-5 | 97 | 97 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-gate5-regression.log` |
| Routing | 33 | 33 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-routing-regression.log` |
| Compatibility | 377 | 377 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-compatibility.log` |
| Legacy seams | 39 | 39 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-legacy-seams.log` |
| Full safe suite (`npm test`; 0 media tests inside) | 886 | 886 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-full-safe-suite.log` |
| Final canonical actual-media execution (M02, run alone, last) | 1 | 1 | 0 | 0 | 0 | 0 | `batch2b-accountingclosure-final-canonical.log` |

- **Other checks.**
  - Typecheck and build PASS; workspace audit PASS; `git diff --check` PASS (empty).
  - Step timings are in `batch2b-accountingclosure-gates-summary.log`.
  - The full safe suite ran alone, after every other suite had finished.
- **Protected bytes** (`batch2b-accountingclosure-preservation.json`,
  `ef224a731ace85af29d72e918b466a631def12f9e94005a49741c0d22288a979`, taken after verification and before this documentation): PASS.
  - 0/184 protected files, 0/13 owner evidence files and 0/167 earlier receipts changed.
  - The only tracked changes are the two owner-authorized files. The audit script is unchanged (`253d9020…`).
  - Nothing is staged, and HEAD is `d3c8302b40a5064ae0eb4408195dc35346ecc648`.
  - `package.json` and `package-lock.json` are byte-identical to the baseline.
- **Later owner files.** The three untracked Batch-2B owner review captures are unchanged (hash and size, against
  `batch2b-owner3-owner-files-at-start.json`). This work only hashed them.
- **Media evidence.**
  - The full-suite set (`batch2b-accountingclosure-media-evidence/`) has 19 files, all from that run, with 0 location-like strings in
    2,354 recorded strings (`batch2b-accountingclosure-media-evidence-scan.json`).
  - The final canonical record has 0 location-like strings in 485.
- **Network, dependencies, footage, commits.** No network access, dependency change, real footage, commit, stage or push.

RESERVATION-CONSUMPTION ACCOUNTING:
PASS

PHASE 5 GATE 7 BATCH 2B IMPLEMENTATION VERIFICATION:
PASS

ACTUAL PINNED-FFMPEG SYNTHETIC MEDIA EXECUTION:
PASS

INDEPENDENT TECHNICAL MEDIA QC:
PASS

PRODUCTION USER-MEDIA LIFECYCLE AUTHORITY:
NOT VERIFIED

REAL USER FOOTAGE:
NOT RUN

SEMANTIC EDITING QUALITY:
NOT VERIFIED

GATE 7 BATCH 2B OWNER ACCEPTANCE:
PENDING

GATE 7 OVERALL:
NOT YET COMPLETE

## Final owner acceptance — 2026-09-27

Independent owner review of the final Batch-2B source and accounting closure is complete.

The owner accepts the final implementation evidence and closes Phase 5 Gate 7 Batch 2B within its explicitly bounded scope.

### Final owner ruling

- Phase 5 Gate 7 Batch 2B implementation verification: **PASS**
- Actual pinned-FFmpeg synthetic media execution: **PASS**
- Independent technical media QC: **PASS**
- Reservation-consumption accounting: **PASS**
- Owner-review trust-handle repair: **PASS**
- Owner-review QC-liveness repair: **PASS**
- Owner-review terminal-evidence repair: **PASS**
- Owner-review policy-snapshot repair: **PASS**
- Owner-review probe-completion repair: **PASS**
- Owner-review exact-artifact-QC repair: **PASS**
- Owner-review private-runtime-context repair: **PASS**
- Owner-review QC-clock-binding repair: **PASS**
- Owner-review process-termination-truth repair: **PASS**
- Owner-review final-evidence-documentation repair: **PASS**
- Gate 7 Batch 2B owner acceptance: **OWNER-ACCEPTED**

### Scope that remains deliberately unclaimed

- Production user-media lifecycle authority: **NOT VERIFIED**
- Real user footage through this Batch-2B execution path: **NOT RUN**
- Semantic/professional editing quality: **NOT VERIFIED**
- Gate 7 overall: **NOT YET COMPLETE**

The owner's accounting ruling remains scoped only to the exact pinned local Batch-2B executor/environment/runtime identity recorded in this report. FFmpeg-reported CPU time and PeakPagefileUsage remain attributed `ffmpeg_reported` evidence, not independently measured values. Local `totalCostInrMicros` remains `not_applicable` with no numeric value; this does not mean local compute is free. Future production or metered executors require their own accounting policy.

All earlier `PENDING`, `PARTIAL` and `FAIL` statements remain preserved as historical chronology. This final owner-acceptance section supersedes them for the current Batch-2B state.

No later Gate 7 batch is accepted or implemented by this closure.
