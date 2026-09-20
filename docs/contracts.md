# Contract specification — 1.0.0

This document defines the frozen Phase 0 contracts. ReferenceFingerprint additionally supports separately registered [version 1.1.0](reference-contract-v11.md). Version 1.0.0 is unchanged; its required semantic roles have no unknown alternative. The new reference-specific version adds honest unknown roles/transitions and embedding references without broadening the shared primitives.

## Envelope and evolution

Every persisted core contract has `contractType` and an exact `schemaVersion: "1.0.0"`. Contract version is distinct from algorithm/model/adapter version, edit revision, and job state version. IDs are stable, opaque application identifiers (1–128 characters matching the documented schema pattern), never storage URLs or cookies. Production must allocate globally unique IDs; fixture IDs are readable synthetic labels.

All objects reject unknown fields, including nested provider payloads. All numbers are finite. UTC timestamps use exactly three fractional second digits and a `Z` suffix. `null` means explicitly unknown/not present; it never means a measured zero. Arrays preserve meaningful order. No generic extension map or arbitrary JSON payload is accepted.

`packages/contracts` is authoritative. `packages/domain` derives types with `z.infer`; it does not repeat handwritten types. `schemas/v1` contains generated Draft 2020-12 **structural** schemas with stable URN IDs. JSON Schema validates shape, scalar bounds, and discriminated alternatives. Zod refinements and input/state/telemetry validators additionally enforce cross-field and cross-record semantics. Consumers must run both levels. Snapshot drift checks prevent accidentally stale generated artifacts.

Evolution rules:

1. Preserve released version files and fixtures. Unknown versions fail closed; even `1.0.1` is rejected until explicitly registered.
2. An additive field/alternative requires a new minor version and deliberate reader support because existing strict readers reject extra fields.
3. Changed meaning, renamed/removed fields, incompatible units, or tighter semantics invalidating formerly valid data require a major version. Documentation-only corrections may use a patch without changing the accepted shape.
4. Add explicit, pure, tested migration functions and a version registry when a second version exists. Never guess versions or silently coerce them. Retain original bytes/version alongside migrated records for provenance when retention policy permits.
5. Algorithm improvements that preserve meaning/shape change producer/model/policy versions, not core contract versions. Benchmark gates decide whether those improvements are acceptable.

No migration framework is implemented before there is a second schema to migrate.

## Contract catalog

| Contract | Meaning and key invariants |
| --- | --- |
| `ReferenceFingerprint` | Reference asset identity; duration; rational fps; aspect ratio; ordered shot partition; hook/setup/build/reveal/hero/outro roles; composition, motion, quality, semantic tags; transition observations; structure, pacing, caption/style hints; provenance. Shot duration derives from its range. Pacing summaries must agree with the partition. |
| `ClipSegment` | Stable segment on an asset and a positive source range; shot, face/person presence, bounded pose tags, motion/composition/quality, semantic description, embedding references, provenance. Multiple segments may share an asset. Source bounds are checked against `MediaAsset`. |
| `AudioFingerprint` | Asset duration, nullable BPM/language/drop, strictly ordered beat/downbeat/phrase timestamps, energy points, non-overlapping speech ranges, provenance. Downbeats must be beats. Times must lie inside the asset. |
| `UniversalEditPlan` | Immutable plan identity and parent lineage; 15–30 s vertical output; rational fps and resolution; ordered clips with source ranges, positions, speed, transforms, gain, roles, transitions, explanations/confidence/decision IDs; music, captions, text overlays, color presets; planner provenance. |
| `DecisionEvent` | Scope, decision/slot/plan context, versioned features, all candidates actually considered with features and scores, winner, confidence, policy and model-run references. Winner must exist; IDs and feature names are unique. |
| `FeedbackEvent` | Exact action, plan/revision/render, optional decision ID, typed old/new values, nullable observed intervention time. Corrections require compatible value kinds and a decision. Accepted/downloaded actions require a render ID. |
| `CostEvent` | Scope, operation and retry attempt, provider/tool/model, duration, typed consumed units, integer `costInrMicros`, measured/estimated/synthetic basis. One event represents one operation attempt's complete cost. |
| `ModelRun` | Model/provider/adapter versions, owned input/output IDs, start/end, status, sanitized failure code. No prompt, transcript, response blob, token log, or secret is embedded. |
| `CreatorPreferenceEvent` | Evidence event IDs, contextual pairwise clip preference or bounded transition/language/pacing signal, derivation version, explicit/implicit evidence class. No fitted parameters or assumed universal preference. |
| `RenderResult` | Plan digest/revision and project/job/render identity, renderer/version/time; discriminated dry-run receipt, successful media object reference, or structured failure. A dry run has no media artifact. |
| `QCResult` | Independent QC identity, policy, active render/plan binding, typed expected/observed checks, derived outcome, and delivery gate. Missing media checks imply incomplete QC. |
| `JobState` | State, monotonic state version, retry attempt, edit revision, active plan/render/kind/intent, timestamps and stage-specific failure. Deliverable states require an actual media receipt kind. |
| `MediaAsset` | Minimal user-media catalog metadata: owner/project, kind, duration, opaque object ID, synthetic/creator origin, expiry/deletion metadata. No bytes or public URL. |
| `BenchmarkManifest` | Additional evaluation schema: versioned frozen inputs/labels, creator grouping, provenance/split, freeze time, and case digest. Prediction outputs are separate. |

Reference audio points to an `AudioFingerprint` rather than duplicating BPM/beats/drop fields. This preserves one interpretation of audio timestamps. Reference style/energy and quality values may be unknown. Unknown analyzer outputs should remain unknown rather than fabricated confidence or quality values.

## Time, layout, audio, and bounded effects

Source and output ranges are half-open `[startSeconds, endSeconds)`. Both endpoints are finite and nonnegative, and end is greater than start. Frame rates are rational numbers between 1 and 120 fps. The output resolution must satisfy the exact 9:16 ratio. Actual frame/sample quantization and codec-compatible dimensions will be adapter capability checks before Phase 6 rendering; Phase 0 does not claim frame-exact execution.

For each timeline clip:

```text
output duration = (source end - source start) / speed
output end      = output start + output duration
next start      = output end - outgoing dissolve duration
```

Cut duration is zero. The timeline starts at zero, has no undeclared gaps/overlaps, and ends at target duration within 0.000001 seconds. A dissolve is at most two seconds. Incoming plus outgoing transitions must be shorter than the clip, which prevents triple overlaps and fully consumed clips. The final transition is a cut. Ranges refer to selected source footage; overlap uses portions already inside those ranges and does not implicitly request extra source handles.

V1 speed is constant per clip in `[0.25, 4]`; speed ramps are not represented. Crop/transform is bounded to cover/contain, normalized focal point, and scale `[1, 4]`. `cover` fills output around that point; `contain` fits within output. Renderer conformance will freeze exact pixel rounding/padding before real execution. There is no editor-specific crop syntax.

Music has an explicit source range, output position, gain, and fades. It cannot exceed its asset or the timeline. It does not loop or time-stretch in V1. Source audio gain and music gain are explicit; audio presence in later QC must follow actual plan intent, allowing intentional silence. Captions have bounded text, language tags, placement, style, and output ranges. The language schema intentionally supports a small primary/script/region-tag subset, including `te`; it is not a full language-tag parser. Text is user content, not telemetry. Overlays are bounded text; effects are bounded neutral/warm/cool color presets. Unsupported renderer capabilities must fail explicitly.

## Validation boundaries

- Local contract parsing checks scalar bounds, time ordering, version, strict fields, timeline arithmetic, and internally consistent summaries.
- `validatePlanWithInputs` checks unique input IDs, source assets/project, segment membership and bounds, reference/audio identity/duration, selected clip decision/slot/plan correspondence, and selected media expiry/deletion at an injected `asOf` time.
- Telemetry checks prior decision/evidence existence, exact creator/project/job/environment scope, event/operation idempotency, current old-value correspondence, and chronological decision feedback.
- Job functions check allowed state edges, receipt/QC identity, media kind, render intent, and optimistic version advancement.

Schemas are not authorization checks. Future APIs/storage adapters must authenticate creators and verify project/object access before returning any metadata or bytes. Real workers must re-check retention immediately before access; an old validated plan is not a permanent capability.

## Decision and feedback semantics

Decision kinds are clip, transition, speed, trim, and caption selection. Candidate values are discriminated by kind. Scores are finite ranking values with meaning supplied by policy/feature-set versions; they are not assumed calibrated probabilities. Confidence is bounded `[0, 1]`. All actually considered candidates must be logged; V1 caps the list at 256 and must reject oversized events rather than silently drop candidates.

Corrections use the corresponding decision kind: `replaced` stores segment IDs; `trimmed` stores segment/source range; `transition_changed` stores cut/dissolve; `speed_changed` stores a ratio; `caption_changed` stores caption/content-revision IDs, language and style. Caption text is deliberately absent. Timing/transition/caption decisions should be logged separately when those algorithms are implemented. `accepted`, `rejected`, `regenerated`, and `downloaded` are outcome signals with no arbitrary old/new blob.

Feedback may select a new candidate that was not in the original considered set. The event must retain the old current value and the new chosen value. Repeated corrections form a reconstructable sequence. In-memory ingestion requires ordered decision feedback; a future durable consumer must buffer/reconcile delayed events instead of discarding them.

## Serialization and cost units

`canonicalSerialize` sorts object keys recursively in UTF-16 order, retains array order, and uses JSON finite-number/string encoding. It rejects undefined, functions, big integers, non-plain objects, accessors, sparse/extended arrays, symbols, and cycles. Negative zero serializes as zero. This is the project's deterministic convention, not a claim of full RFC 8785 compliance. Plan digests are SHA-256 over UTF-8 canonical bytes of a validated plan.

One INR equals **1,000,000 microrupees**. Event costs are nonnegative safe integers. Reporting sums via `BigInt`; unusually large totals require a decimal reporting adapter instead of unsafe number conversion. Estimated and measured costs remain distinguishable. Synthetic costs cannot be marked production or vice versa. Failed/retried operations still need cost events; missing billing is not a zero cost. Partial billing reconciliation/event correction semantics are deferred to durable telemetry design, not handled by mutating an existing event.
