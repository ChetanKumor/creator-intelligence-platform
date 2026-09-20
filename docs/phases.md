# Authorized scope and sequence

## Phase 0 boundary

Phase 0 establishes owned contracts/types, validation, canonical serialization, provider ports, local telemetry, job/QC gates, synthetic fixtures, a dry-run contract demonstration, evaluation interfaces and small evidence-based calculations, documentation, and deterministic tests.

It does not implement media analyzers, matching/planning algorithms, real rendering, production infrastructure, custom training, or a creator interface. The fixture planner follows a fixed authored recipe; it is not a matcher or an autonomous editor implementation.

| Phase | Objective |
| --- | --- |
| 0 — Foundation | Contracts, validation, telemetry, evaluation skeleton and offline verification. |
| 1 — Reference Analyzer V0 | Turn authorized local reference media into a validated `ReferenceFingerprint` using replaceable analysis components, provenance, costs, and labeled synthetic/authorized evaluation. |
| 2 — Footage Analyzer V0 | Segment creator uploads into useful, validated `ClipSegment` records. |
| 3 — Audio Analyzer V0 | Produce validated beats, energy, phrases, speech regions and optional language. |
| 4 — Matcher V0 | Rank eligible segments using owned features and record complete decision context. |
| 5 — Edit Planner V0 | Build valid, explainable 15–30 second `UniversalEditPlan` outputs from owned analysis/matching. |
| 6 — Renderer V0 + QC | Execute through a deterministic adapter and independently probe actual media before delivery. |
| 7 — End-to-end test | Evaluate actual autonomous edits with explicit quality/cost criteria. |
| 8 — Creator revision interface | Apply natural-language corrections and record meaningful feedback. |
| 9 — Real-user feedback | Collect legitimate creator outcomes under explicit data/retention policies. |
| 10 — First proprietary ranker | Train/evaluate an initial clip ranker from authorized contextual labels. |
| 11 — Creator memory | Use inspectable, scoped behavioral preferences in future edits. |
| 12 — Style intelligence | Learn reusable style families with evaluation and provenance. |
| 13 — Trend intelligence | Explore authorized trend understanding without introducing scraping as a core dependency. |

Phases 0, 1 and 2 are authorized. Phase 1 remains code complete and real-model verified with the explicitly approved, pinned SigLIP2 So400m NaFlex model on the existing CPU runtime. Phase 2 implements the reference-independent Footage Analyzer, with fresh real inference as a guarded final verification gate. See [Phase 2 verification](footage-verification.md) for its exact completion status and environment measurements. No global video/ML installation, pagefile, PATH, driver or PyTorch change is authorized. Phase 3 and all later implementations remain out of scope.
