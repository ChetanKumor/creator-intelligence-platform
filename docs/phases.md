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

Phases 0, 1 and 2 are complete within their documented scopes. Phase 1 remains code complete and real-model verified with the explicitly approved, pinned SigLIP2 So400m NaFlex model on the existing CPU runtime. Phase 2 is CLOSED following its real-footage verification. Phase 2.6A is COMPLETE within its architecture-freeze and guarded-integration acceptance scope; Phase 2.6B is COMPLETE.

Phase 3 Audio Analyzer V0 is COMPLETE within its implemented/verified V0 scope at `5bfe1d0b26b4faecce4af658e6eeb8ef50cd9bd7`, as explicitly established by the owner. This includes speech, beats, RMS energy, internal structure, AudioFingerprint composition and the public AudioAnalysisProvider path. The earlier [Speech/ASR component report](phases/phase-3-speech-asr.md) remains historical evidence; its component-only phase status predates final closure. No multilingual ASR quality, WER, diarization, word alignment, professional music understanding, professional edit quality or generalization is implied.

Phase 4 Matcher V0 is AUTHORIZED / ACTIVE. Gate 0 implements the frozen plan-independent editorial runtime substrate and is accepted after independent source review plus full canonical verification. Gate 1 adds an internal plan-independent deterministic technical baseline over `sharpnessIndicator` and `unclippedPixelFraction`, preserving explicit missingness and ties; it is accepted at `607420b40efe93d100ad0a45cf438d6f6549922a`. Gate 2 adds the owned `EditorialSemanticComparison` primitive for explicit integrity-checked cosine comparison of compatible `normalized-mean-v1` embedding references through the injected vector-resolver seam; it is accepted at `ab3493a152d5eb82000b88130f8bb934eb39b538` after independent source review and canonical verification with 266 TypeScript tests, six media integration tests, 15 Python tests, workspace audit over 54 application TypeScript files plus nine explicit runtime adapters, 33 schema/synthetic fixture artifacts and exit 0. Gate 2 does not choose a reference target, rank candidates, combine semantic and technical scores, activate reference-style compatibility, execute models/media, or alter the public Matcher seam. Phase 4 is not closed and no reference-conditioned/audio matching quality, learned ranking, professional shot-selection quality or professional editing quality is claimed. See [current phase](CURRENT_PHASE.md) for scope and evidence. Phase 5+ remain not implemented and are not authorized by this gate. No dependency, model, public Matcher seam, global installation or system setting change is part of Gate 2.
