# Data, feedback, and the future learning system

## Ownership and storage separation

The foundation is designed for legitimately uploaded creator content and consented feedback. There is no scraper, public-video downloader, cookie ingestion, copyrighted training dataset, or external data acquisition pipeline.

| Data class | Examples | Storage direction and lifecycle |
| --- | --- | --- |
| User media/content | Raw clips, optional reference/audio, renders, prompts, transcripts, caption text, semantic descriptions, embeddings | Object storage and protected project records; explicit creator access, expiry/deletion policies, and purpose controls. Derived content is not automatically anonymous. |
| Learning/decision events | Stable IDs, editing context, typed features, candidate scores, selected values, actions, evidence links | Separate append-oriented event/state tables with purpose-specific retention and deletion. No requirement to keep the raw video. |
| Operations/provenance | Model runs, provider/tool versions, operation costs, job failures, QC results | Structured operational records with sanitized codes and scoped retention. No raw model response or secret logging. |

`MediaAsset` records an opaque object ID separately from its stable asset ID. Expired or deletion-pending selected sources fail input validation. `null` expiry is an unassigned policy in this scaffold, not a promise of indefinite retention; a real upload service must assign a product policy before accepting media. No upload/retention service exists in Phase 0.

Deleting bytes must not require changing historical asset/segment IDs. Tombstones can retain minimal join metadata when allowed. Conversely, stable IDs do not make events anonymous or exempt them from deletion. Creator identifiers, embeddings, free text, and linked behavioral events require purpose and access controls.

## What is logged and why

| Record | What is retained | Future use |
| --- | --- | --- |
| DecisionEvent | What/where was decided, plan/revision/slot, reference/audio/memory IDs, versioned scalar/category features, candidates/scores, winner, confidence, policy/model versions | Reconstruct the original choice; compare ranking algorithms with the same available context. |
| FeedbackEvent | Action, render/plan/revision, optional decision, typed old/new values, nullable observed intervention time | Distinguish first acceptance, replacement, timing/transition/caption corrections, regeneration, rejection, and download. |
| CreatorPreferenceEvent | Contextual signal, exact evidence IDs, derivation version, explicit/implicit evidence class | Build inspectable creator/style preference features later without embedding a specific ML architecture today. |
| CostEvent | Job/project, operation attempt, provider/tool/model, duration, units, exact INR cost, measurement basis | Include preview/final attempts and failures in unit economics; route work using actual observed costs later. |
| ModelRun | Inputs/outputs by ID, model/adapter versions, timestamps and sanitized status | Diagnose regressions and compare outputs across model/provider changes without provider response formats in business JSON. |

The in-memory implementation parses and snapshots records, rejects conflicting repeated IDs, and deduplicates exact retries. It joins feedback to the same creator/project/job/environment and plan/revision, checks chronological correction order, and rejects stale old values. Mutating the caller's object or a returned snapshot cannot rewrite stored decisions. Durable transactions, access control, deletion, and export are intentionally not implemented.

Each meaningful production operation must eventually emit one complete cost record for its attempt, including failures. Model-run IDs join provider activity to decisions and costs. Missing prices/timers must remain missing or explicitly estimated, never fabricated measurements. The synthetic demo's zero-duration/zero-cost records are contract examples only.

## How a correction becomes training evidence

Suppose decision `D` selects segment A from a recorded candidate set. A creator replaces A with B in the same slot and editing context. Store the replacement with `decisionId = D`, old A, new B. `deriveReplacementPreference` emits the contextual relation **B preferred over A**, with the feedback event as evidence. This is a deterministic label transformation, not model training and not a universal creator preference.

Similarly, changing dissolve to cut preserves the removed transition; trimming preserves both source ranges; speed/caption changes preserve typed before/after values. Regeneration and rejection remain negative-quality signals for later interpretation. Acceptance is positive evidence, and downloading is a stronger candidate outcome signal. The raw actions are retained without hard-coded utility weights: exploration, accidental clicks, changing intent, and multiple revisions can affect interpretation.

Future training workflow:

1. Select purpose-authorized events within explicit retention/consent bounds; exclude synthetic fixtures from production datasets.
2. Join decisions, corrections, model/policy versions, and permitted derived features using stable IDs.
3. Produce versioned label tables for clip ranking, transition preference, timing, acceptance, creator preference, or style. Preserve evidence IDs, label policy version, and uncertainty; do not infer unsupported global labels.
4. Split by creator and, where needed, time/project to prevent leakage. Freeze evaluation sets and record manifests/digests separately from predictions.
5. Evaluate a candidate model against frozen benchmarks and real cohort outcomes before changing provider/ranking policy.
6. Deploy through owned interfaces in a future authorized phase; retain rollback provenance and monitor quality/cost together.

No dataset exporter, trainer, learned ranker, feature store, vector database, or production learner is built now. Embeddings stay behind references and immutable space IDs; giant arrays do not enter business/event JSON.

## Evaluation and economics

The registry defines evidence for reference-attribute accuracy, shot-boundary precision/recall/F1 under a declared tolerance, matching Top-1/Top-K, first-render acceptance, replacement rate, regeneration rate, intervention time, cost per accepted Reel, render success, and QC success. There is no arbitrary composite creative score.

Working Phase 0 calculations are limited to supplied labeled ranking results and explicit cost cohorts. Ranking outputs are separate from frozen benchmark cases. Empty labeled sets produce `null`; empty ranking predictions count as misses for labeled cases. The synthetic benchmark verifies integrity and creator-split behavior, not creative performance.

Cost per accepted Reel is defined as **all costs in a complete closed job cohort divided by distinct jobs explicitly accepted at least once**. The numerator includes rejected jobs and retry/failure costs. Repeated acceptance/download events do not inflate the denominator. A download alone does not manufacture an explicit acceptance. The caller must attest ledger completeness and closed outcomes; missing job cost coverage, open cohorts, or no acceptances produce an unavailable result. Synthetic and production scopes are isolated; estimates retain their basis. To inspect one accepted job's cost, use a one-job cohort covering every attempt.

First-render acceptance, replacement rate, and similar production metrics require explicit exposure/closed-cohort evidence. Their definitions exist, but no value is produced from synthetic events or from missing telemetry. Before production measurement, add the exposure/cohort records and protocols that establish their denominators. ₹100 pricing does not establish a viable compute budget without this evidence.

## Retention and deletion work required before real users

A production implementation must define separate media, derived-content, operational, and learning retention periods; consent/purpose records; creator/project authorization; deletion manifests and tombstones; cancellation of queued work on deleted assets; cache/embedding/backup handling; and lineage-based removal from future dataset snapshots. Jobs must re-check media availability before execution. Training consent is not implied by upload, acceptance, or download.

Learning events may remain useful after media deletion when policy permits retaining derived features and context. Some future training tasks will require explicitly consented retained media or re-upload; IDs cannot recreate deleted pixels. This limitation is preferable to making permanent raw-media storage a foundational dependency.
