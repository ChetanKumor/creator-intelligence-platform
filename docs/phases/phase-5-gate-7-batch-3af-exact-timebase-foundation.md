# Phase 5 Gate 7 Batch 3A-F — Exact timebase foundation

Implementation and verification record. Status date 2026-09-28. Branch `phase/5-edit-planner-v0`; implementation started from
`f0edbb3b05724ad41c062a82585846eba9e0a4d6` (Gate 7 Batch 3A, owner-accepted) and was independently reviewed while uncommitted and unstaged.
Gate 7 Batch 3A-F was subsequently OWNER-ACCEPTED and committed as `e0adc7e4f72cc5bfdb0965fb20094a5d74c4bf3a`.

| Status | Value |
|---|---|
| ARCHITECTURE_V2_TIMEBASE_GAP | **RESOLVED** (§4-§8) |
| Phase 5 Gate 7 Batch 3A-F implementation verification | **PASS** (final run, §18) |
| Gate 7 Batch 3A-F owner acceptance | **OWNER-ACCEPTED** |
| Gate 7 overall | **NOT YET COMPLETE** |
| Batch 3B | **NOT STARTED** |
| Real user footage | **NOT RUN** |

3A-F is the narrow foundation patch between Batch 3A and Batch 3B. It closes one thing: exact authoritative temporal semantics. Evidence lives in
the ignored `.local-runs/phase5-gate7/` (`batch3af-*`); receipts are append-only.

## 1. Baseline

- `git rev-parse` HEAD and `origin/phase/5-edit-planner-v0` and a read-only `git ls-remote origin`: all `f0edbb3b05724ad41c062a82585846eba9e0a4d6`.
- No tracked modification and nothing staged. The 17 untracked owner files (`CLAUDE.md`, `gate5-*.txt`, `gate6-*.txt`, `gate7-*.txt`) were recorded by
  name, size and modification time only; their contents were never read, hashed, modified, staged or deleted.
- Baseline receipt `batch3af-baseline.json` (`3d65a79bde243289ee2ffc085b18600b98a298b616ff00e7637f9dee70f18147`): SHA-256 of all 309 tracked files, the
  owner-file metadata, and the SHA-256 of all 600 earlier Gate-7 receipt files.
- Baseline invariants `batch3af-baseline-invariants.json` (`ec1a2583ac767032c5fa52fd31c3109ad278a523c72b14dbc7ed52cb08127411`), captured from a clean
  build of the unmodified baseline: six RenderProgram fixtures (frame and sample intervals, segment computation identities, argv digests) and two
  Batch-3A review chains (joins, windows, observation computation identities over a fixed output identity), plus the legacy EditGraph fixture.
- Pre-migration media evidence (the accepted code's last media run) copied unchanged to `batch3af-pre-migration-media-evidence/` (28 files).

## 2. Why this batch exists

Batch 3A recorded ARCHITECTURE_V2_TIMEBASE_GAP: YES. The accepted chain persisted source time as IEEE-754 seconds in the sole composition
authority and bound those floats into execution identities, while Architecture v1 already required "exact rational ticks/timebases with actual
PTS/frame/sample mappings". The next planned system (CriticFinding → RepairPlan → GraphDiff → new EditGraph revision → invalidation → localized
recomputation) must not mutate or diff float seconds. Concretely, at the baseline:

| Site | Float authority |
|---|---|
| `packages/edit-graph/graph.ts:37` | `source.range: TimeRangeSchema` — `{startSeconds, endSeconds}` doubles in every clip use. |
| `packages/edit-graph/common.ts:73` | `exactTicks`: `Math.round(seconds × tps)` then a float division check. |
| `packages/edit-execution/dag.ts:39,109` | the DAG copies the float range into every source node and binds it into computation identities. |
| `packages/edit-render/program.ts:113,125,129` | the render compiler takes its source timebase from float equality (`t === (i·den)/num`), float endpoint equality and float PTS membership. |

The FFmpeg boundary was already exact (integer `trim=start_frame`, `atrim=start_sample`, `settb=expr=den/num`), and timeline time was already
integer ticks on a declared clock.

Measured hazard of float frame time (P03, P10; `.test-artifacts/phase5-gate7-batch3af/drift.json`): over three hours, accumulating the NTSC frame
duration in doubles drifts by 2.7×10⁻⁸ s (30000/1001), 3.2×10⁻⁸ s (60000/1001) and 2.9×10⁻⁸ s (24000/1001); `floor(t × rate)` on the correctly
rounded frame instants mis-indexes 10,248 of 323,676 frames at 30000/1001 (the first at frame 15) and 21,136 of 258,941 at 24000/1001 (the first
at frame 3).

## 3. Owner authorization and protected changes

The owner prompt authorizes the smallest exact-time changes inside accepted temporal contracts. Two further decisions were raised before any
protected byte changed (`batch3af-owner-authorization-and-plan.md`):

1. **Protected test edits — "Approve pins+literals (Recommended)".** Every Gate-6/7 time-bearing file is hash-pinned by accepted tests (Batch-2B B01,
   Batch-3A R01, the Batch-2A freeze table, Batch-1 ACCEPTED_GATE_SURFACES, and chained test-file pins), and the import allowlists plus Batch-3A's
   package file counts leave exactly one placement for a shared vocabulary that adds no file and no import path: `packages/edit-graph/common.ts`,
   the accepted home of `ClockSchema`, `exactTicks` and `ceilDivide`. Approved: update only the SHA-256 values of files this batch changes, and
   translate float-range literals and forgeries in accepted tests to the exact representation, with no assertion removed or weakened.
2. **Gate 5 — "Defer Gate 5 (Recommended)".** Gate-5 planning floats stay upstream evidence, decoded exactly at the EditGraph seam and fail-closed.

`packages/contracts/common.ts` (`SecondsSchema`, `TimeRangeSchema`) is pinned by three accepted tests and stays frozen as the public legacy
interchange contract. No other protected change was needed; no PROTECTED_CHANGE_OUTSIDE_AUTHORIZATION arose.

## 4. Temporal inventory

Classification: **A** must migrate now (authoritative EditGraph/planning/render/identity time that would make 3B unsafe); **B** boundary
conversion (an external or public float contract that receives a derived value); **C** derived/display only; **D** safe to defer (upstream evidence
or a subsystem that does not consume it as composition authority).

| Field / type | File | Before | After | Authoritative? | Migrated now? | Boundary / display | Class |
|---|---|---|---|---|---|---|---|
| EditGraph `clipUses[].source.range` | `edit-graph/graph.ts` | `{startSeconds, endSeconds}` doubles | `{start, end}` canonical exact instants (`SourceRangeSchema`) | yes | **yes** | — | A |
| EditGraph `mapping.sourceStartTicks/EndTicks` | `edit-graph/graph.ts` | integer ticks, derived by a float round trip | integer ticks, derived by the exact legacy decoder; checked equal to the exact range | yes | **yes** (derivation) | — | A |
| EditGraph output ticks, `durationTicks`, `clock`, `frameRate`, cut `atTicks`, look `extents` | `edit-graph/graph.ts` | integers on a declared clock; rational rate | unchanged | yes | already exact | — | — |
| `exactTicks` | `edit-graph/common.ts` | `Math.round` + float division check | delegates to `decodeLegacySeconds` | decoder | **yes** | legacy entry | A |
| capability predicate `output_duration_seconds_ceiling` | `edit-graph/graph.ts` | integer ceiling of ticks/tps | unchanged | no | — | derived integer | C |
| UEP projection: range arithmetic and segment joins | `edit-graph/compatibility.ts` | read float range | `secondsOf(exact)` (identical doubles) | no | **yes** (source) | public UEP 1.0.0 float contract | B |
| UEP `durationTicks / tps`, `startTicks / tps`, `TIME_EPSILON_SECONDS` | `edit-graph/compatibility.ts` | derived doubles and frozen tolerance | unchanged | no | — | public contract replay | B |
| ExecutionDag `nodes[].source.range` (bound into computation identities) | `edit-execution/dag.ts` | float `TimeRangeSchema` | canonical exact `SourceRangeSchema`; DAG record 0.2.0 | yes (work identity) | **yes** | — | A |
| DAG `source.frameTimes.tableId` | `edit-execution/dag.ts` | identity of the analysis float table | unchanged (evidence identity, not arithmetic) | evidence join | — | — | C |
| DAG spans, joins, output, `settings.ticksPerSecond/frameRate` | `edit-execution/dag.ts` | integers / rational | unchanged | yes | already exact | — | — |
| admission render work: ticks, frames exact; `linkedSourceAudio.milliseconds` | `edit-execution/admission.ts`, `workload.ts` | integer; ceiling ms for accounting | unchanged | ms: no | — | accounting | C |
| freshness / age milliseconds, `epochMilliseconds` | `edit-execution`, `edit-runtime` | integer UTC wall-clock arithmetic | unchanged | wall-clock authority (not media time) | — | — | out of scope |
| RenderProgram compile input `SourceFacts.frameTimes` | `edit-render/program.ts` | float table used as timebase authority | legacy evidence decoded exactly once; exact grid `frame i = i / rate` | yes | **yes** | legacy entry | A |
| RenderProgram segments, joins, output, input grids | `edit-render/program.ts` | integers / rational | unchanged (already exact persisted) | yes | already exact | — | — |
| FFmpeg argv time arguments | `edit-render/ffmpeg.ts` | integer frames/samples, `settb=den/num`, `asettb=1/sr` | unchanged; no decimal time exists | no | — | final runtime boundary | B |
| `RENDER_SEMANTICS.bounds.maxDurationSeconds` | `edit-render/semantics.ts` | integer bound compared with ticks exactly | unchanged | bound | — | — | — |
| conformance: `pts × time_base` grid check; derived float table rendering | `edit-render/probe.ts` | exact BigInt check (authority) + `Number(pts·num)/den` for the identity join | unchanged | the exact check | — | derived rendering | B/C |
| QC exact duration; container `format.duration` (µs decimal from ffprobe) | `edit-render/qc.ts` | exact BigInt; external decimal compared with an integer tolerance | unchanged | exact check | — | external format | B |
| receipts: `audioMilliseconds`, wall/CPU ms | `edit-render/receipts.ts` | accounting | unchanged | no | — | accounting | C |
| Batch-3A transcript ticks, plan `atFrame/atTicks/atSample`, observation frames/samples/word ticks | `edit-review/*` | integers on declared rates | unchanged | yes | already exact | — | — |
| Batch-3A `renderTranscriptText` `[mm:ss.mmm]` | `edit-review/transcript.ts` | floored exact integer arithmetic | unchanged | no | — | display | C |
| Gate-5 `PlanningBoundary.sourceRange`, `BoundarySample.atSeconds`, world query range | `planning/common.ts`, `boundary.ts` | doubles | unchanged; decoded exactly at the EditGraph seam | planning evidence | no (owner: defer) | legacy upstream | D |
| Gate-5 `PlanningUse/Sequence.durationSeconds`, policy duration/trim seconds | `planning/common.ts`, `scoring.ts` | float sums and bounds | unchanged | heuristic objectives | no (owner: defer) | — | D |
| FootageAnalysis `frameTimes`, shots, samples, candidate ranges, `durationSeconds`, `fps` | `reference-analyzer/protocol.ts`, `footage-analyzer/protocol.ts` | µs-quantized doubles (ffprobe `%f`, rounded to 9 places); rational fps | unchanged (Phase-2 frozen MediaTruth) | evidence | no | legacy evidence | D |
| world-model support ranges, sample `atSeconds`, `ClockMap.errorSeconds` | `world-model/index.ts` | exact copies of analyzer doubles | unchanged | evidence | no | — | D |
| public contracts `SecondsSchema`, `TimeRangeSchema`, UEP/ClipSegment/MediaAsset/fingerprint seconds | `contracts/*.ts` | doubles (pinned by three tests) | unchanged | public legacy interchange | no | public boundary | B/D |

Every remaining float-second field relevant to project, edit or render semantics appears above, and each is derived, display-only,
external-boundary-only, or explicitly deferred upstream evidence that enters exact time only through the explicit legacy decoder.

## 5. Chosen canonical temporal semantics

### 5.1 One vocabulary, reused from the accepted conventions

The accepted exact time in the repository was already one idea used four ways: an integer count on a declared rate. Gate-6 output ticks at
`ClockSchema.ticksPerSecond`, Batch-1 and Batch-2B frames on a `FrameRateBounds` grid, Batch-2B samples at `sampleRateHz` and stream PTS at
`time_base`, Batch-3A transcript ticks — compared by BigInt cross-products (`frameIndexAt`, `ticksBeforeFrame`, `samplesPerFrame`). 3A-F names that
idea once, in `packages/edit-graph/common.ts`:

```ts
RateSchema     = { numerator, denominator }   // positive, ≤ 2^31−1 each, lowest terms; units per second (the accepted frame-rate orientation)
ExactTimeSchema = { value, rate }             // value: safe integer; denotes exactly value × denominator / numerator seconds
```

Constructors name the unit: `tickTime(ticks, ticksPerSecond)`, `frameTime(frame, frameRate)`, `sampleTime(sample, hz)`,
`timestampTime(pts, timeBase)`. Operations are exact: `compareTimes`, `sameInstant`, `addTimes`, `subtractTimes`, `canonicalTime`,
`convertTime(t, rate, "exact" | "floor" | "ceil")`, and half-open range helpers `durationOf`, `rangeContains`, `rangeIntersection`,
`rangesAdjacent`. Derived output: `secondsOf` (the correctly rounded double) and `formatSeconds` (exact decimal, floored). The only float entry is
`decodeLegacySeconds`. Persisted records keep their accepted integer fields and declare the rate once; only source ranges needed a new shape.

Batch 3A's helpers are not replaced: P11 proves `ticksBeforeFrame`, `ticksAfterFrame`, `samplesPerFrame` and Batch-1 `frameIndexAt` are exact
instances of the vocabulary over 4,000 deterministic cases. This is one vocabulary, not a fourth time system.

### 5.2 Canonicalization policy

The repository needs both distinctions, so both are explicit:

- **Rates have one spelling.** A rate is always in lowest terms (`60/2` is refused; constructors reduce). Frame rates, clocks and sample rates are
  meaningful units, and a frame index at 30000/1001 stays a frame index.
- **Instants compare by value.** `compareTimes` and `sameInstant` are exact cross-rate comparisons: frame 15 at 30 fps is sample 24,000 at 48 kHz
  (P07). Arithmetic on one shared rate stays on that rate; mixed-rate results are canonical.
- **Canonical instant form** is `{ value: n, rate: { numerator: d, denominator: 1 } }` with `gcd(n, d) = 1` (zero is `0` at `1/1`): exactly one
  spelling per rational number of seconds. `1/2 s` and `500/1000 s` both canonicalize to `{1, 2/1}`.
- **What is persisted canonically:** source media instants (`SourceInstantSchema` refuses a reducible spelling), because their frame identity is
  carried separately by the endpoint authority. Timeline positions remain rate-preserving integer ticks on the graph's declared clock, which is an
  owner-chosen, identity-bearing part of the output profile.

### 5.3 Nominal distinctions, kept small

Source media time and timeline time are different fields and different shapes: `source.range` is a canonical `SourceRange`, clip output is
`{startTicks, endTicks}` on the output clock, and `mapping` relates them. Frame and sample indices stay integers in named fields next to their
declared grid (`startFrame` with `frameRate`, `startSample` with `sampleRateHz`) and become exact time only through a named constructor. No
further type hierarchy was introduced.

### 5.4 Why this representation

- It is the accepted convention generalized, so every accepted persisted field stays valid and exact.
- A rational rate expresses 24000/1001, 30000/1001 and 60000/1001 frames, any sample rate, and any stream time base (`1/90000`, `1001/30000`)
  with no global clock that must divide everything.
- Safe-integer counts serialize losslessly through JSON, the canonical serializer, zod and content hashing; BigInt appears only inside arithmetic.
- Canonical source instants are independent of the output clock: the accepted Gate-6 test that the same source range survives a 1000-tick and a
  10⁹-tick clock still holds literally (`tests/edit-graph.test.ts`), now on exact values.

### 5.5 Rejected alternatives

- **One fixed global clock** (milliseconds, microseconds, nanoseconds, 90 kHz or flicks): none represents every accepted rate and time base; it
  would force a fourth time system and re-quantize source timestamps. Flicks (705,600,000/s) remain a good declared clock choice and are exercised
  in tests (P09, P10, P12-P14), not imposed.
- **Frame numbers as the authority for source time:** consumer footage may be VFR and candidate endpoints are not frame instants; frame identity
  stays in the endpoint authority instead.
- **`{value: bigint, rate: bigint}`:** JSON has no BigInt, so every record, hash and receipt would need a string encoding and a second parser;
  safe integers already bound every accepted duration (§5.6).
- **Keeping float seconds "exactly representable":** a persisted double is still a second authority for the same instant, and arithmetic on it
  drifts (P03); it cannot support GraphDiff.
- **A rational-arithmetic dependency:** the needed operations are a few BigInt cross-products; no dependency was added.
- **Changing `contracts/common.ts`:** public, pinned, and not EditGraph authority.

### 5.6 Integer safety

Counts are `Number.isSafeInteger`; every result is checked back into the safe range (`limit_exceeded`, never wrap: P10); rate components are
bounded by 2³¹−1 (the component size of media-framework rationals, so every stream time base and frame rate fits). At the largest accepted clock
(10⁹ ticks/s) safe integers cover more than 104 days, at flicks more than 147 days; V0 outputs are bounded to 600 s, Gate-5 options to 16 uses of
at most 600 s each, and a 10-hour 60000/1001 timeline on a flick clock is 25,401,600,000,000 ticks (P10). Cross products are BigInt.

## 6. Authoritative versus derived time

| Authoritative (exact) | Derived (never authority) |
|---|---|
| EditGraph source instants (canonical), output ticks, clock, frame rate, cut and look instants | `secondsOf`: UEP projection seconds, logs |
| DAG spans, joins, exact source range in computation identities | `formatSeconds`, transcript `[mm:ss.mmm]` text |
| RenderProgram frame and sample intervals, grid, duration ticks | the probe's float table rendering (identity join only) |
| QC and conformance exact PTS × time-base checks | accounting milliseconds |
| Batch-3A frames, samples, ticks | ffprobe's printed container duration (external) |

A derived double is always `secondsOf` of an exact value and is traceable to it; the legacy decoder guarantees the round trip is the identity
for every Gate-5 value the graph accepts (`secondsOf(decode(s)) === s`).

## 7. EditGraph migration (record version 0.2.0)

- `source.range` is `SourceRangeSchema`: canonical, nonnegative, non-empty exact instants.
- Construction decodes each Gate-5 boundary double exactly at the declared graph clock (`decodeLegacySeconds`), keeps the canonical instant,
  and keeps the integer mapping ticks. A value the clock cannot represent is refused `time_not_representable`, exactly as before (C02; 0.13 s at
  10 ticks/s).
- The structural check is exact: the mapping ticks at the graph clock must be the same instants as the source range (`sameInstant`).
- `EDIT_GRAPH_RECORD_VERSION = "0.2.0"` names the EditGraph record only; every other Gate-6 artifact keeps 0.1.0.
- Timeline time, transitions (cuts at exact joins), operations, identities and replay are otherwise unchanged. The EditGraph now contains no
  seconds-named field and no non-integer number (C01, P14).
- Out of scope and not implemented: multi-track, keyframes, MotionComposition, CompositionGraph, AudioGraph, multicam, speed ramps, nested
  sequences.

## 8. ExecutionDag and RenderProgram migration

- **ExecutionDag 0.2.0** (`EXECUTION_DAG_VERSION`): each source node carries the EditGraph's exact range field for field, and its computation
  identity binds the canonical exact range (C03). The runtime reads DAGs only at 0.2.0 (`packages/edit-runtime/validated.ts`).
- **RenderProgram** (schema unchanged, still 0.1.0): compilation receives exact time from the DAG. The admitted analysis frame table is decoded
  exactly once: entry *i* must be the correctly rounded double of frame *i*'s exact instant on the output grid (the accepted acceptance set,
  now stated exactly); after that no float is used as time. Frame-exact endpoints must name admitted frames whose exact grid instants equal the
  range endpoints; `source_seconds` selects the frames whose exact PTS lies in `[start, end)` via the explicit ceiling. Samples follow the
  selected frames by exact BigInt arithmetic, as before.
- **Trusted boundary:** unchanged. The FFmpeg compiler receives only integers and exact rationals (C05, P12); there is no decimal time argument to
  format. `RENDER_SEMANTICS`, and therefore the executor identity and the owner's accounting ruling, are byte-identical.
- **Preserved execution:** all six baseline programs have identical frame and sample intervals, segment computation identities, frame-table
  identities and argv digests (C06). On actual synthetic media the migrated chain renders byte-identical outputs: the canonical render
  `e38b21c6…` (147,717 bytes), all six look renders and the determinism pair equal the accepted code's last run (§18).

## 9. Batch-3A integration

Batch-3A code is unchanged. Its time was already exact; C07 proves joins (`atFrame`, `atTicks`, `atSample`), windows and observation
computation identities over a fixed output identity equal the baseline, and P11 proves its helpers are instances of the vocabulary.
On actual media, all 30 observation computation identities of O01-O03 and every rendered and source content hash equal the accepted
code's last run (§18).

## 10. Serialization, schema versioning and legacy compatibility

- Exact times are plain JSON objects of safe integers; JSON, canonical serialization, zod parsing and hashing round-trip them exactly, including
  `±(2⁵³−1)` counts and whole EditGraphs (P08).
- **Persisted forms changed:** EditGraph 0.1.0 → 0.2.0 and ExecutionDag 0.1.0 → 0.2.0. Nothing else.
- **Legacy policy (no silent reinterpretation):**
  - Gate-5 decisions (persisted float seconds) are accepted through the explicit exact decoder, fail-closed.
  - A legacy EditGraph 0.1.0 (the accepted baseline's own record, `tests/fixtures/edit-graph-0.1.0-float-seconds.json`) is refused with
    `graph_version_unsupported` ("… a legacy float-second graph is never reinterpreted. Rebuild it from its Gate-5 decision.") (C04); relabelled as
    0.2.0 it still never parses as exact time (P15); every execution and UEP reader refuses it by version (H07).
  - A legacy ExecutionDag is refused by version at the runtime reader (P15) and by the schema (`artifactVersion`, expected "0.2.0").
  - Migration path: deterministic reconstruction from the Gate-5 decision (the repository's replay authority). No record-rewriting migration
    exists, so no legacy record is rewritten; historic receipts are unchanged (§19).

## 11. Identity and cache consequences

| Identity | Consequence |
|---|---|
| EditGraph, DAG, admission-bound records, RenderProgram, receipts, ReviewPlan | New identities (their content now carries exact time or names a 0.2.0 record). Expected. |
| DAG node computation identities | Bind the canonical exact source range: one nanosecond of difference gives another identity (H08). They also keep the accepted Batch-1 conservative binding of the declared clock (P09): a clock change never shares a DAG node computation. |
| RenderProgram segment computation identities | Unchanged for every baseline fixture (C06) and clock-free (P09): identical selected frames and samples are identical rendered work (H08). |
| Batch-3A observation computation identities | Unchanged (C07). |
| Canonical instants | One identity per rational instant (P09, H04); reducible spellings and non-reduced rates are refused. |

Same semantic time gives the same work identity where the work is the same; different exact time never shares a DAG computation; no identity
depends on a float spelling.

## 12. VFR and source timestamps — documented seam

The accepted MediaTruth does not record exact stream timestamps: the Phase-2 analyzer writes `frameTimes` as ffprobe `best_effort_timestamp_time`
("%f", 6 decimals) minus the first, rounded to 9 places. The exact contract can represent them — `timestampTime(pts, timeBase)` denotes
`pts × time_base` exactly, and 1001 at `1/30000` is frame 1 of 30000/1001 (P13) — but no ingest rewrite was made. Consequences, all fail-closed:

- VFR sources are represented in the EditGraph by exact decoding of their recorded instants, never collapsed onto a CFR grid; V0 execution still
  refuses them (`source_frame_grid_unsupported`, accepted B13; a one-ulp deviation is refused too, H09).
- For real footage the recorded values are microsecond-quantized, so a graph binds the recorded instant, not the true PTS; V0 execution refuses
  such tables because they are not the exact grid rendering. Recording exact PTS and time base in MediaTruth is the future seam.
- Original bytes remain source authority; no CFR proxy is imposed as truth.

## 13. Audio sample mapping and frame alignment policy

- Samples: `sampleTime(n, hz)` is exact; sample 0, 1, 47,999 and 48,000 at 48 kHz are 0, 1/48000, 47999/48000 and 1 s; 441 samples at 44.1 kHz are
  exactly 480 at 48 kHz (P06).
- Frames to samples: exact only where the boundary is a whole sample (1600 samples per 30 fps frame at 48 kHz, 1470 at 44.1 kHz; five NTSC frames
  are 8008 samples at 48 kHz; one NTSC frame, 1601.6 samples, is refused) (P06, P12).
- Alignment: `convertTime` is `exact` (refuses `time_not_representable`), `floor` or `ceil`, validated before use; there is no nearest rounding and
  no default (P05, H01). The render compiler's only rounding is the documented ceiling of `source_seconds` membership.

## 14. Future seams (none implemented; each stated exactly by the primitive — P17)

- **GraphDiff:** TrimClip (+5 NTSC frames shortens the clip by exactly 117,717,600 flicks), SplitClip (adjacent halves summing exactly), MoveClip
  and InsertClip (exact tick shifts), ChangeTransitionDuration (12 versus 13 frames are distinct exact durations), UpdateKeyframeTime,
  ChangeAudioAutomationPoint.
- **Localized invalidation:** the changed region of an edit is an exact range; widening it to output frames uses an explicit floor/ceil (a 30000/1001
  head trim of frames 30-35 is exactly frames 60-70 at 60000/1001), with no epsilon, fuzzy equality or padding.
- **Motion / keyframes:** keyframe times are exact instants on the graph clock; the interpolation parameter at an output frame is an exact
  rational. Position, scale, rotation, opacity, masks, effect parameters, text, camera/light and beat-reactive motion all need only instants of
  this type; no motion clock is required.
- **HyperFrames boundary:** EditGraph exact time → motion compiler → explicit output FPS → `convertTime(t, fps, alignment)` → frame index. The frame
  index is a derived execution coordinate, never the graph's clock; no HyperFrames code or dependency was added.
- **Professional audio:** exact instant ↔ sample position at an explicit rate; automation points move by exact samples; cross-rate placement
  needs an explicit policy.
- **Preview and render:** both derive frame indices from the same exact time (a 15 fps preview frame is an explicit floor of the instant the 30 fps
  render uses exactly); there is no preview clock.

## 15. Test-first evidence (RED → GREEN)

- **First red** (`batch3af-first-failure.md`): `tests/edit-time.test.ts` C01-C07, typechecked against the accepted APIs, run on the unmodified
  production bytes: 7 tests, 3 pass, 4 fail (`batch3af-first-red.log`, `d57e65f6…`). C01 float seconds in the EditGraph; C02 float range instead of
  exact 13/100 and 197/100; C03 DAG still 0.1.0 with float seconds; C04 a legacy float graph parses and is accepted as current (replay reproduces
  it). Every hidden sub-case confirmed separately (`batch3af-first-red-subcases.json`, `4c2498d8…`). No broken import, missing fixture or
  environment red.
- **First green:** C01-C07 7/7 (`batch3af-first-green.log`, `7bc16669…`), then the A-M matrix P01-P18: 25/25 (`batch3af-impl-run2-time.log`).
- **Implementation-run failures, recorded:** the accepted Gate-6 purity guard refused a new comment in `edit-graph/common.ts` that named the media
  tool (`batch3af-impl-run1-gate6.log`); the comment was reworded. Every other failure in the accepted pure suites was a pin table
  (`batch3af-impl-run1-*.log`), updated last (§3, `batch3af-pin-updates.json`).
- **Accepted test translations:** `tests/edit-graph.test.ts` (source-range literals and forgeries, the UEP probe's derived seconds) and
  `tests/edit-execution.test.ts` (two forgeries and one literal) — same assertions on the exact representation.

## 16. Hostile self-review (T1-T23)

Findings written first (`batch3af-self-review-findings.md`); reds on the exact unrepaired bytes (`batch3af-selfreview-red.log`: 10 tests, 7 pass,
3 fail); hidden sub-cases confirmed separately (`batch3af-selfreview-hidden-subcases.json`); smallest repairs; green 10/10 and 35/35
(`batch3af-self-review-receipts.md`).

| # | Real defect | Repair | Test |
|---|---|---|---|
| H1 (T9) | `convertTime` treated any undeclared alignment as `ceil` (12/12 sub-cases). | The policy is validated first: exact, floor or ceil. | H01 |
| H2 (T12, T5) | Primitives trusted operands: a zero-numerator rate was silently ordered; fractional counts escaped as raw `RangeError` (90/90). | One operand check at every primitive entry. | H02 |
| H3 (T11) | Range helpers accepted reversed ranges (`durationOf` returned −1 s). | Range helpers require start ≤ end; the empty range stays valid. | H03 |

Attempted reds that held: T3 (H04), T5 precision beyond 2⁵³ with ties to even (H05, 3,002 cases), T13 absurd magnitudes (H06), T21 legacy refs
(H07), T17 nanosecond-apart work (H08), T19 one-ulp VFR (H09), T14 static compiler scan (H10). Covered by the implementation tests: T1 (C01,
P14), T2 (P08), T4 (P09), T6/T7 (P03), T8 (P06), T10 (P16: NaN, infinities, negatives never decode; the decoder equals the accepted Gate-6 rule on
18,000 cases), T15/T16 (C07, P11), T18 (recorded: the DAG node identity's conservative clock binding is accepted Batch-1 policy; the segment
identity is semantic), T20 (floats enter only at the two legacy decoders; the accepted coordinated-rehash test still refuses a forged range),
T22 (§19), T23 (P17). No async entry point was added, so no caller-owned state is read after an `await`.

## 17. Performance (P18; 100,000 operations each, this machine; `performance.json`)

Final run, after the H2 operand checks (`batch3af-final-test-artifacts/performance.json`): tick construction 1.45 µs, cross-rate comparison
0.90 µs, exact conversion 2.29 µs, range intersection 5.36 µs, canonicalization 0.77 µs, legacy decoding 4.75 µs, derived seconds 0.32 µs, JSON round
trip 1.92 µs. The bound asserted is 50 µs per
operation, which detects a catastrophic choice without tuning. The render compiler's legacy-table decode is one division per frame.

## 18. Final verification (authoritative)

Driver: a scratch script running each gate sequentially from the project root, one new log per gate (`batch3af-final-<gate>.log`), summary
`batch3af-final-gates-summary.log` (`191893fb24c02ad5f59ec07fb8b56298d7e9f0aea536c1b56c6320748337668d`), UTF-8 counts `batch3af-final-counts.json`
(`a284fd70914749e73d842eeb5fabfc3dad597c33d8cc0126fc979ce0aa5dea8d`). Started 05:23:08Z, finished 06:05:58Z. Test commands run under
`node --import ./scripts/no-network.mjs --test`. The sixteen changed or added source and test files hashed identically before and after the run
(`batch3af-final-source-hashes-before.txt` = `-after.txt` = `71b645ab034fb1a293079b59bb11370a8eecec278bc689d24861206a02a83534`).

| Gate | Tests | Result | Seconds |
|---|---|---|---|
| `npm run typecheck` | — | PASS (exit 0) | 10.6 |
| `npm run build` | — | PASS (exit 0) | 12.6 |
| 3A-F (`dist/tests/edit-time.test.js`) | 35 | **35/35** | 73.2 |
| Batch-3A pure (`edit-review.test.js`) | 46 | 46/46 | 201.4 |
| Batch-3A actual media (`edit-review-media.integration.js`) | 8 | 8/8 | 82.4 |
| Batch-2B pure (`edit-render.test.js`) | 43 | 43/43 | 35.3 |
| Audit policy (`edit-render-audit.test.js`, `workspace-boundary.test.js`) | 10 | 10/10 | 33.0 |
| Batch-2B actual media (`edit-render-media.integration.js`) | 34 | 34/34 | 203.9 |
| Batch-2A (`edit-runtime.test.js`) | 130 | 130/130 | 110.3 |
| Batch-1 (`edit-execution.test.js`) | 81 | 81/81 | 729.7 |
| Gate 6 (`edit-graph.test.js`) | 79 | 79/79 | 153.9 |
| Gate 5 (`planning.test.js`) | 97 | 97/97 | 186.1 |
| Routing (`budgeted-perception-routing.test.js`) | 33 | 33/33 | 0.8 |
| Compatibility (the accepted 16-file set) | 377 | 377/377 | 14.6 |
| Legacy seams (`contracts`, `integration`, `jobs`, `telemetry`) | 39 | 39/39 | 0.5 |
| Full safe suite (`npm test`: clean build + every `dist/tests/*.test.js`) | 967 | **967/967** (932 accepted + 35 3A-F) | 720.8 |
| `npm run audit:workspace` | — | PASS: 114 application files; 15 adapters, 9 subprocess-capable; 5 test harness process files | 1.2 |
| `git diff --check` | — | PASS (no output) | 0.1 |

Every suite reports 0 fail, 0 cancelled, 0 skipped and 0 todo. Durations differ from the Batch-3A record's run (Batch-2B media 204 s here and 770 s
there, Batch 1 730 s here and 387 s there) with machine load; the gates assert counts and outcomes.

**Actual media, against the accepted code's last media run** (`batch3af-final-media-comparison.json`,
`7dd6d9978d5f424d90f59773ebc215a84f9543bbaf077a48bdb488cdefe1a34b`; baseline copy `batch3af-pre-migration-media-evidence/`): the canonical render
`e38b21c69ad767a42ca812e5c032f4931dc8d3b0e16dc7c89218cca92dd1627a` (147,717 bytes) is identical; all six look renders are identical; the determinism
pair `e574236d5f36ebd9d625c57c5961b21d8391c65bd9545a4afada1322607eec15` (156,788 bytes) is identical; the O01-O03 observation computation identities
(14 + 8 + 8) and every rendered and source content hash are identical.

After the run only the two documents changed; `git diff --check` and the byte hygiene check were repeated on the final bytes (§19).

## 19. Protected bytes, dependencies, network, owner files

- **Preservation** (`batch3af-preservation.json`, `b3e4c93b1a1f0030e2e76594cf75e78d275acc31c3f7b9ccb5700dfffb5cde81`): HEAD `f0edbb3b…`, nothing staged.
  Of 309 tracked files exactly 15 changed, all expected (the nine production files, five accepted tests, `docs/CURRENT_PHASE.md`); 294 are unchanged,
  including `packages/contracts/*`, all Batch-3A code, Gate 5, the adapters and every accepted `docs/phases` report. All 600 earlier Gate-7 receipt files
  are unchanged. New untracked files: this report, `tests/edit-time.test.ts` and the legacy fixture (plus ignored `batch3af-*` receipts).
- **Dependencies:** none. `package.json` and `package-lock.json` are byte-identical. The vocabulary uses zod, the language's BigInt and repository
  modules only; the workspace audit is PASS with the unchanged 114-file count.
- **Network:** every test ran under `scripts/no-network.mjs`. The session's only network operations were read-only baseline checks: one
  `git fetch origin phase/5-edit-planner-v0` and one `git ls-remote origin`.
- **Owner files:** none touched. The 17 files were recorded by name, size and modification time only and are unchanged. The session harness
  supplied `CLAUDE.md`'s text as instructions at session start (it was not opened by any tool); the tracked `AGENTS.md` was read as the repository
  instructions. No owner file was opened, hashed, modified, renamed, staged or deleted.
- **No commit, stage, push, tag or history rewrite.**

## 20. Remaining gaps and residuals

- **Gate 5 is deferred** (owner decision): planning boundaries and heuristic duration sums remain floats, decoded exactly at the EditGraph seam.
  A Gate-5 duration bound evaluated by float sums could in principle differ from the exact graph duration at a threshold; it never enters the
  graph as time.
- **MediaTruth exact timestamps** are a documented seam (§12); real footage is not executable in V0 and was not run.
- **DAG node computation identities bind the declared clock** (accepted Batch-1 conservative policy); the semantic reuse identity is the segment
  identity.
- **Legacy graphs are refused, not migrated;** the supported path is reconstruction from the Gate-5 decision.
- **UEP 1.0.0** remains a public float contract receiving derived seconds.
- **Evidence is synthetic.** Nothing here establishes editing quality.

## 21. Files

Final bytes (hashed before and after the final run, §18). Tracked diff: 14 files, +297 −75 (production 9 files +258 −42; accepted tests 5 files
+39 −33), plus `docs/CURRENT_PHASE.md`.

| File | Kind | Lines | SHA-256 |
|---|---|---|---|
| `packages/edit-graph/common.ts` | modified: the exact-time vocabulary, `EDIT_GRAPH_RECORD_VERSION`, `graph_version_unsupported`, `exactTicks` delegates | 260 | `f50f916dc4bf1aaf1e28b5e0617ff99b6137957b4aa64cb3071e51774e9461f3` |
| `packages/edit-graph/graph.ts` | modified: exact canonical source range, exact decoding and checks, record 0.2.0, legacy refusal | 532 | `3948e3583edeb37b84feee9f0f0ab8de45c25edbcb4ac724c217ba758a020eea` |
| `packages/edit-graph/compatibility.ts` | modified: reads EditGraph 0.2.0; UEP seconds derived by `secondsOf` | 333 | `93d10fb4d1d658d5f26183e14b81a4aefbaba44a1bf9b58f93bb6eae5d22d96c` |
| `packages/edit-execution/common.ts` | modified: `EXECUTION_DAG_VERSION` | 133 | `f45a6e3a81303f3609c3a01918881e3da2eabe4a3682794f49237b0af5d69e3e` |
| `packages/edit-execution/dag.ts` | modified: exact source range, DAG 0.2.0, reads EditGraph 0.2.0 | 361 | `40e976e94cbe371d25b624b4e39c45f52a046eff4ca6f4a29d2e188f6db2f6e3` |
| `packages/edit-execution/admission.ts` | modified: reads EditGraph 0.2.0 (one line + import) | 357 | `d1fa1b90b5991fd495a6765c485123ba32b52cb332600adb06965dcf72f6d0a1` |
| `packages/edit-render/program.ts` | modified: exact grid decode, exact endpoints and membership | 218 | `f9bac88ad4afe2c55b1f975d6b217af29af933af1c4fd2a5f0de41c8ae8966b3` |
| `packages/edit-render/records.ts` | modified: reads EditGraph 0.2.0 (one line + import) | 250 | `7eece6e87dfc064f55028c91493953e820b0cfa6f121ba61cece970bdea5e1bc` |
| `packages/edit-runtime/validated.ts` | modified: reads ExecutionDag 0.2.0 (one line + import) | 76 | `153bace6f31cda5950f54d92920f7cef4afbdf2eaf3107900c7a0462194b595a` |
| `tests/edit-time.test.ts` | added: C01-C07, P01-P18, H01-H10 (35 tests) | 713 | `b9f7dd82ffffe14c80523df7e2f3fd02d0ea28647e77a09d666ad6e348fc3304` |
| `tests/fixtures/edit-graph-0.1.0-float-seconds.json` | added: the accepted baseline's own EditGraph 0.1.0 record | 405 | `aa5969d1e6c5744cd895895a3124be62d09b69c4806522e4bcf4e500394e0072` |
| `tests/edit-graph.test.ts` | modified (owner-approved): exact literals, forgeries, derived UEP probe seconds | 1222 | `bef2690b7cf54108ed97b17a01f835ec67bfd07db907eb3f277f483b13f91183` |
| `tests/edit-execution.test.ts` | modified (owner-approved): exact literals and forgeries; pin table | 1468 | `31251e7cb9eb181e5bf89c297286554315e0da2ff6755a471966479a62393254` |
| `tests/edit-render.test.ts` | modified (owner-approved): pin table only | 944 | `811473db6357b3a98ca20c0eb5dd8b7f8a4011bb159a0fb9263b94b3d7fc9b97` |
| `tests/edit-review.test.ts` | modified (owner-approved): pin table only | 855 | `16145c70da1eadbe688bb05d7858ae743e1b0c5de1ee5875c24e0d7d20342b21` |
| `tests/edit-runtime.test.ts` | modified (owner-approved): pin table only | 1827 | `244f4762104c4f4140437dd3c0fbae844bd68b22018c76dbc2ec2963f98e2460` |
| `docs/phases/phase-5-gate-7-batch-3af-exact-timebase-foundation.md` | added (this record) | — | not self-hashed |
| `docs/CURRENT_PHASE.md` | modified (narrow status update after verification) | — | hashed after its last edit |

The 22 pin-hash replacements are listed in `batch3af-pin-updates.json`; after them no pin in the four tables is stale. New and changed files use
LF, end with a final newline and have no trailing whitespace (byte-exact check).

## 22. Final status

Evidence for each status: §2 and C01-C04 (gap and first red); §5 and P01-P18 (contract); §7-§9, C05-C07, P12-P14 (migrations); §10, C04, P15, H07
(compatibility); §11, P09, H08 (identity); §12, P13, H09 (VFR seam); §14, P17 (future seams); §16 (hostile review); §18 (regression).

```text
BASELINE VERIFIED:
PASS

ARCHITECTURE V2 FROZEN:
YES

TEMPORAL INVENTORY:
PASS

CANONICAL EXACT TIME CONTRACT:
PASS

AUTHORITATIVE FLOAT-SECOND ELIMINATION:
PASS

EXACT RANGE SEMANTICS:
PASS

RATIONAL VIDEO RATE SUPPORT:
PASS

30000/1001 DRIFT TEST:
PASS

60000/1001 DRIFT TEST:
PASS

AUDIO SAMPLE ALIGNMENT:
PASS

LONG-TIMELINE DRIFT:
PASS

SERIALIZATION ROUNDTRIP:
PASS

CANONICALIZATION:
PASS

IDENTITY / CACHE SEMANTICS:
PASS

EDITGRAPH EXACT-TIME MIGRATION:
PASS

RENDERPROGRAM EXACT-TIME MIGRATION:
PASS

BATCH-3A TIME COMPATIBILITY:
PASS

VFR / SOURCE-TIMESTAMP SEMANTICS:
DOCUMENTED-SEAM

LEGACY COMPATIBILITY:
PASS

FUTURE GRAPHDIFF READINESS:
PASS

FUTURE LOCALIZED INVALIDATION READINESS:
PASS

FUTURE MOTION / KEYFRAME TIME READINESS:
PASS

FUTURE HYPERFRAMES TIMEBOUNDARY READINESS:
PASS

FUTURE PROFESSIONAL AUDIO TIME READINESS:
PASS

FUTURE PREVIEW / RENDER TIME READINESS:
PASS

HOSTILE TEMPORAL REVIEW:
PASS

BATCH 3A REGRESSION:
PASS

BATCH 2B REGRESSION:
PASS

GATE 6 REGRESSION:
PASS

GATE 5 REGRESSION:
PASS

FULL SAFE SUITE:
PASS
967/967

WORKSPACE AUDIT:
PASS

GIT DIFF CHECK:
PASS

OWNER FILE PROTECTION:
PASS

NEW DEPENDENCIES:
NONE

ARCHITECTURE_V2_TIMEBASE_GAP:
RESOLVED

PHASE 5 GATE 7 BATCH 3A-F IMPLEMENTATION VERIFICATION:
PASS

GATE 7 BATCH 3A-F OWNER ACCEPTANCE:
OWNER-ACCEPTED

GATE 7 OVERALL:
NOT YET COMPLETE

BATCH 3B:
NOT STARTED

AUTOMATIC REPAIR:
NOT IMPLEMENTED

LOCALIZED RERENDER:
NOT IMPLEMENTED

EDITORIALSTATE:
NOT IMPLEMENTED

MOTION / COMPOSITION IMPLEMENTATION:
NOT IMPLEMENTED

HYPERFRAMES:
NOT INTEGRATED

PROFESSIONAL AUDIOGRAPH:
NOT IMPLEMENTED

INTERACTIVE PREVIEW ENGINE:
NOT IMPLEMENTED

MANUAL NLE:
NOT IMPLEMENTED

VIBE EDITING:
NOT YET COMPLETE
```

VFR / SOURCE-TIMESTAMP SEMANTICS is DOCUMENTED-SEAM: the exact contract represents stream timestamps at an explicit time base and VFR is never
collapsed onto CFR, but the accepted MediaTruth does not yet record exact stream PTS (§12). Real user footage was not run; nothing here is evidence
of editing quality.
