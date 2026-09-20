You are continuing development of the existing project:

creator-intelligence-platform

PHASE 0:
COMPLETE AND VERIFIED.

PHASE 1 — REFERENCE ANALYZER V0:
COMPLETE AND REAL-MODEL VERIFIED.

The existing real model is:

google/siglip2-so400m-patch16-naflex

Pinned revision:

cc24074f717b612951c2dead130904ab9b65a81e

The model is already stored project-locally and verified offline.

DO NOT redownload it.

You are now responsible ONLY for:

==================================================
PHASE 2 — FOOTAGE ANALYZER V0
==================================================

The objective is:

AUTHORIZED LOCAL RAW CREATOR FOOTAGE
            ↓
      FOOTAGE ANALYZER
            ↓
VALIDATED, REUSABLE ClipSegments

These ClipSegments will later become candidate inputs to the Matcher.

Do NOT start Phase 3.

Do NOT implement:

Audio Analyzer
Matcher
Edit Planner
Renderer
UI
Creator revision system
Training
Clip Ranker
Creator Memory
Trend Intelligence
Cloud infrastructure

Your task is to make raw footage understanding trustworthy,
reusable and economical.

==================================================
THE MOST IMPORTANT PHASE 2 PRINCIPLE
==================================================

RAW FOOTAGE ANALYSIS MUST BE REFERENCE-INDEPENDENT.

A creator may upload raw footage once and later use it with:

Reference A
Reference B
Reference C
Auto Edit
future editing styles

The raw media should NOT need to be re-analyzed for every reference.

Therefore:

DO NOT design:

raw footage + reference
        ↓
ClipSegments

Design:

raw footage
        ↓
reusable footage intelligence
        ↓
ClipSegments

and later:

ReferenceFingerprint
        +
ClipSegments
        ↓
Matcher

The Matcher belongs to Phase 4.

==================================================
SECOND CORE PRINCIPLE — DO NOT RE-EMBED OVERLAPS
==================================================

A naive implementation might generate 100 overlapping candidate segments
and run SigLIP independently for every candidate.

DO NOT DO THIS.

Expensive visual inference should happen at the FRAME / FEATURE-BANK level.

Preferred conceptual architecture:

raw video
   ↓
deterministic analysis frame selection
   ↓
SigLIP frame embeddings ONCE
   ↓
cached frame feature bank
   ↓
candidate window generation
   ↓
aggregate already-computed features
   ↓
ClipSegment embeddings / features

Likewise:

OpenCV quality measurements
motion measurements

should preferably be computed on reusable temporal samples and aggregated
into candidate segments where practical.

The number of candidate segments must not linearly multiply expensive model
inference.

This matters directly to future cost per accepted Reel.

==================================================
PHASE 0 + PHASE 1 ARE AUTHORITATIVE
==================================================

Before modifying anything, inspect the actual repository.

At minimum read:

README.md
docs/architecture.md
docs/contracts.md
docs/data-learning.md
docs/verification.md
docs/reference-verification.md

all Phase 0 contracts
all Phase 1 Reference Analyzer implementation
provider interfaces
embedding cache
Python interchange layer
telemetry
evaluation
tests
schemas
package manifests

Do not rely only on documentation.

Inspect implementation.

Re-run the existing verification suite before changing anything.

==================================================
FROZEN CONTRACT POLICY
==================================================

ReferenceFingerprint 1.0.0 and 1.1.0 are frozen.

Existing Phase 0 contracts are frozen unless an actual incompatibility is
proven.

ClipSegment must be inspected carefully.

Do NOT change ClipSegment simply because additional fields would be nice.

Prefer:

existing ClipSegment
+
separate internal analysis artifacts

where appropriate.

If the existing ClipSegment contract makes truthful Phase 2 implementation
impossible:

STOP.

Report:

1. exact incompatibility
2. runtime proof
3. why a sidecar/internal artifact cannot solve it
4. smallest versioned migration
5. compatibility impact

Do not silently evolve a frozen contract.

==================================================
AUTHORIZED MEDIA ONLY
==================================================

Analyze only:

- synthetic project-generated media
- media explicitly supplied by the project owner
- media explicitly designated as authorized

DO NOT:

scrape Instagram
scrape TikTok
scrape YouTube
download public creator videos
scan unrelated directories
access arbitrary user media
upload media to inference APIs

Do not commit real creator footage.

Reuse or extend the Phase 1 authorization/provenance mechanism rather than
inventing another unrelated system.

==================================================
ENVIRONMENT
==================================================

Phase 1 established:

uv-managed Python 3.12.12
project .venv
project-local FFmpeg 9.0.1
project-local ffprobe
PySceneDetect
OpenCV
NumPy
Pillow
Transformers
CPU-only PyTorch
local SigLIP2 So400m NaFlex

Re-check rather than assuming.

Do NOT:

install global Python
install global FFmpeg
modify PATH
install CUDA
install GPU drivers
replace PyTorch
download another large model

without explicit authorization.

The existing cached SigLIP2 So400m model IS authorized for Phase 2 use.

All model inference must remain local.

==================================================
PRIMARY QUESTION
==================================================

The Footage Analyzer must answer:

"What useful moments exist in this raw footage?"

It should help the future Matcher determine:

- what candidate moments are available?
- where do they begin/end?
- what do they visually contain?
- what kind of framing is present?
- how much visual motion exists?
- how technically usable are they?
- which candidates are semantically similar?
- which candidates are redundant?
- where is there insufficient usable footage?

But Phase 2 must NOT decide:

"which candidate should replace reference shot #5?"

That is Phase 4.

==================================================
TARGET PIPELINE
==================================================

Design around:

authorized raw video asset(s)
        ↓
authorization/provenance
        ↓
SHA-256 identity
        ↓
ffprobe metadata
        ↓
source-shot / take segmentation
        ↓
reusable temporal analysis lattice
        ↓
technical quality signals
        ↓
motion signals
        ↓
SigLIP frame embeddings
        ↓
frame feature bank
        ↓
candidate segment proposal
        ↓
candidate feature aggregation
        ↓
candidate deduplication / pruning
        ↓
ClipSegment builder
        ↓
existing runtime validation
        ↓
footage inventory artifact
        ↓
telemetry + evaluation
        ↓
reusable ClipSegments

==================================================
COMPONENT 1 — ASSET IDENTITY
==================================================

Reuse Phase 1 media identity and provenance patterns.

Every raw source asset should have:

stable SHA-256 identity
media metadata
analysis version
provider/model versions

The same bytes should be recognized as the same asset.

Do not use absolute local paths as permanent IDs.

Do not duplicate hashing logic if Phase 1 already provides a reusable
implementation.

Refactor shared functionality carefully if justified.

Phase 1 must continue passing unchanged.

==================================================
COMPONENT 2 — SOURCE SHOTS / TAKES
==================================================

Raw footage differs from an edited reference.

A reference shot boundary usually describes an EDIT.

Raw footage may contain:

one long camera take
multiple takes concatenated together
camera starts/stops
large motion shifts
dead time
usable moments within one continuous shot

Use Phase 1 scene-detection infrastructure where useful.

But DO NOT assume:

one detected scene = one candidate ClipSegment.

Scene detection should establish coarse temporal structure.

Candidate generation happens afterward.

==================================================
COMPONENT 3 — TEMPORAL ANALYSIS LATTICE
==================================================

Create a deterministic, bounded temporal sampling strategy for raw footage.

Its purpose is to compute reusable signals once.

For selected timestamps, potentially capture:

frame identity
timestamp
SigLIP embedding reference
sharpness
brightness/exposure
basic quality signals
motion measurements

Avoid unnecessary decoding passes.

Avoid embedding duplicate frames.

Sampling must:

be deterministic
be configuration-versioned
have explicit limits
work on short vertical clips
work on longer raw takes
preserve enough temporal detail for future candidate generation

Do not hardcode a giant fixed FPS without justification.

Choose a reasonable adaptive/bounded policy and document it.

==================================================
COMPONENT 4 — SIGLIP 2
==================================================

Reuse the already verified provider:

google/siglip2-so400m-patch16-naflex

revision:

cc24074f717b612951c2dead130904ab9b65a81e

DO NOT download Base.

DO NOT download another visual model.

Use the existing project-local model cache.

Critically:

REFERENCE embeddings and FOOTAGE embeddings must occupy the SAME compatible
embedding space.

Verify:

same model
same revision
same normalization policy
compatible preprocessing
same embedding dimension

The system must detect incompatible embedding spaces rather than silently
comparing them later.

The observed Phase 1 output dimension was 1152.

Verify this rather than merely hardcoding it.

==================================================
COMPONENT 5 — FRAME-LEVEL CACHE
==================================================

The expensive frame embedding should be reusable.

Cache identity should include enough information such as:

asset content hash
frame/sample identity
timestamp or deterministic sample key
model ID
model revision
preprocessing version

Do not recompute an embedding simply because the same frame participates in
multiple candidate segments.

A candidate's representation should be derived from cached frame features
where possible.

==================================================
COMPONENT 6 — MOTION SIGNALS
==================================================

Implement useful cheap motion analysis using existing local tooling.

OpenCV optical-flow / frame-difference style measurements are acceptable.

Capture measurable properties such as:

motion magnitude
temporal change
stability

if they can be measured reliably.

DO NOT claim:

camera pan
camera tilt
subject walking
subject spinning
zoom direction

unless the implementation genuinely supports and evaluates those claims.

V0 may expose coarse numeric motion signals rather than false semantic motion
labels.

Do NOT introduce V-JEPA in this phase unless a demonstrated blocker proves
the current architecture cannot function without it.

If richer motion semantics become necessary later, MotionProvider already
provides the seam.

==================================================
COMPONENT 7 — TECHNICAL QUALITY
==================================================

Generate bounded technical signals useful for future ranking.

Examples:

sharpness / blur
brightness
underexposure
overexposure
frame stability
possibly clipping or frozen-frame indicators

Keep technical quality separate from:

"aesthetic quality"

Do not create a fake universal aesthetic score.

Do not permanently discard footage because it scores slightly lower.

Some low-quality or unusual footage may be creatively intentional.

Only mark clearly unusable material when evidence is strong.

==================================================
COMPONENT 8 — PERSON / POSE INFORMATION
==================================================

Do NOT automatically add another heavy model.

First inspect whether Phase 2 can provide a strong reusable ClipSegment bank
using:

SigLIP
OpenCV
existing infrastructure

If person/pose information is required by the frozen ClipSegment contract but
cannot be honestly populated:

use its legitimate unknown/optional state.

If no legitimate unknown state exists and truth cannot be represented:

STOP and report the contract issue.

Do not fabricate pose information.

Do not download MediaPipe models or another vision model without explicit
approval.

Preserve a future provider seam for richer pose/person analysis if needed.

==================================================
COMPONENT 9 — CANDIDATE SEGMENT PROPOSAL
==================================================

This is a core Phase 2 capability.

A raw 8-second take may contain many potentially useful 0.5–3 second moments.

We need a bounded candidate bank.

Design a deterministic CandidateSegmentProposer.

It must NOT depend on a particular reference Reel.

Potential signals can include:

source-shot boundaries
duration
motion changes
quality stability
semantic-frame changes
temporal coverage

Consider multi-scale candidate durations.

Do NOT blindly generate every possible start/end pair.

That creates O(n²) candidate explosion.

Candidate proposal must be bounded by configuration.

The system should prioritize:

coverage
diversity
reasonable edit-length ranges

over generating thousands of nearly identical windows.

Document:

candidate duration policy
stride/anchor strategy
per-source-shot cap
per-asset cap

The exact initial values are V0 defaults, not immutable product truth.

==================================================
COMPONENT 10 — SEGMENT REPRESENTATION
==================================================

For every proposed candidate, derive a reusable representation.

Potentially aggregate:

semantic embeddings
motion signals
quality signals
duration
source metadata

Candidate semantic embeddings should be derived from already-computed frame
embeddings.

Do not rerun SigLIP specifically for every overlapping candidate.

For embedding aggregation:

use a deterministic documented policy.

If Phase 1 uses:

normalized frame embeddings
→ mean
→ normalization

reuse compatible semantics unless evaluation demonstrates a reason not to.

Maintain embedding-space provenance.

==================================================
COMPONENT 11 — CANDIDATE DEDUPLICATION
==================================================

Overlapping candidate generation can create near-duplicates.

Implement conservative candidate pruning/deduplication.

Possible inputs:

temporal overlap / IoU
embedding similarity
duration similarity
shared source frames

Do NOT use arbitrary magic thresholds without configuration/documentation.

Do not destroy diversity excessively.

The goal is:

50 useful candidates

rather than:

500 almost-identical candidates

not:

5 candidates that omit useful footage.

Record before/after candidate counts.

==================================================
COMPONENT 12 — CLIPSEGMENT BUILDER
==================================================

Providers must not construct final domain contracts directly.

Preferred architecture:

raw analysis providers
        ↓
internal analysis artifacts
        ↓
CandidateSegmentProposer
        ↓
CandidateFeatureAggregator
        ↓
ClipSegmentBuilder
        ↓
runtime validation
        ↓
validated ClipSegment[]

Keep TypeScript as the owner of final domain construction/validation unless
existing architecture strongly justifies otherwise.

Python should produce narrow versioned analysis artifacts.

Do not independently recreate all business-domain truth in Python.

==================================================
COMPONENT 13 — FOOTAGE INVENTORY
==================================================

Create a small internal/sidecar FootageInventory artifact if useful.

This is NOT yet the sufficiency gate.

It may summarize:

assets analyzed
total duration
source shots
candidate count
usable duration estimate
quality distribution
motion distribution
semantic diversity indicators
embedding space
analyzer version

This artifact helps Phase 4 later answer:

"Does this footage have enough material to recreate this reference?"

But actual reference-specific sufficiency belongs to the Matcher phase.

Do not claim sufficiency without a reference.

==================================================
COMPONENT 14 — CLI
==================================================

Provide a clear developer entry point conceptually like:

analyze-footage <authorized-manifest>

or the repository-consistent equivalent.

It should support one or multiple authorized raw assets.

It should:

validate authorization
hash assets
reuse caches
analyze
produce ClipSegments
produce FootageInventory if implemented
validate artifacts
record telemetry
print concise statistics

Example output:

assets analyzed
source duration
source shots
analysis frames
SigLIP cache hits/misses
raw candidate count
deduplicated candidate count
validated ClipSegments
analysis time

Do not print embedding vectors.

==================================================
COMPONENT 15 — MULTIPLE RAW CLIPS
==================================================

The creator will normally upload several raw clips.

Phase 2 must support an asset set such as:

clip_01.mp4
clip_02.mp4
clip_03.mp4
...

Each ClipSegment must retain stable source provenance.

Two files containing the same bytes should deduplicate by identity where
appropriate.

One bad clip should produce a clear per-asset failure rather than corrupt
successful analysis of every other asset, unless the job policy explicitly
requires atomic failure.

Design this deliberately.

==================================================
COMPONENT 16 — TELEMETRY / COST
==================================================

Use the existing Phase 0/1 telemetry system.

Record meaningful stages:

metadata
decode/sampling
shot detection
visual measurement
embedding
candidate proposal
aggregation
deduplication
validation

Record:

wall-clock runtime
frames sampled
embeddings calculated
cache hits/misses
candidate counts
model/provider/revision
device
external monetary API cost

Local API cost remains ₹0.

Do not claim local infrastructure has zero future production cost.

==================================================
COMPONENT 17 — PERFORMANCE BUDGETS
==================================================

We are ultimately targeting roughly ₹100 standard Reels.

Phase 2 should therefore make costs observable.

Add configuration/telemetry enabling us later to control:

maximum analysis samples
maximum candidates per asset
maximum candidates per project
timeouts
cache reuse

Do not prematurely optimize for production scale.

But prevent unbounded work.

No raw clip should accidentally generate tens of thousands of candidates.

==================================================
EVALUATION
==================================================

"Script completed" is NOT sufficient.

Create evaluation infrastructure for Footage Analyzer V0.

Measure what Phase 2 can honestly measure.

Examples:

schema-valid ClipSegment rate
deterministic candidate generation
candidate temporal coverage
candidate counts
cache reuse
runtime per source minute
analysis frames per source minute
embedding calls per source minute
deduplication ratio
failure isolation
embedding-space compatibility

For synthetic media with known structure:

evaluate temporal coverage and expected boundaries.

Do NOT invent:

"candidate quality = 93%"

without human-labelled truth.

Do NOT measure Matcher Top-1.

There is no Matcher yet.

==================================================
CANDIDATE COVERAGE TEST
==================================================

Create synthetic/raw-test media with known temporal regions.

The candidate generator should demonstrate that useful temporal regions are
represented without candidate explosion.

Define and document a measurable coverage concept.

For example:

whether every eligible temporal region has at least one sufficiently
overlapping candidate at relevant durations.

Use a defensible metric rather than visual intuition alone.

==================================================
REAL-MODEL VERIFICATION
==================================================

Unlike Phase 1, SigLIP weights are already locally available.

Phase 2 should therefore run a real-model smoke test using:

google/siglip2-so400m-patch16-naflex
revision cc24074f717b612951c2dead130904ab9b65a81e

offline.

Verify:

model loads from local cache
no model network access
real frame embeddings produced
dimension compatible with reference embeddings
candidate aggregation works
ClipSegments contain embedding references, not vectors
repeat run uses cache

If the existing CPU runtime is slow, measure it.

Do not change CUDA/GPU setup during Phase 2.

GPU optimization is a separate future performance task.

==================================================
SYNTHETIC MEDIA TESTS
==================================================

Use project-generated synthetic media to exercise cases such as:

multiple scene changes
one continuous long take
very short clip
dark section
blurred section
static section
moving section
duplicate asset
different resolution
portrait orientation
VFR if existing test infrastructure supports it
corrupt/unsupported media

Do not download test videos.

==================================================
OPTIONAL REAL CREATOR FOOTAGE
==================================================

If NO explicitly authorized real creator raw footage exists:

that must NOT block CODE COMPLETE.

Report:

REAL-FOOTAGE VERIFIED: NO

Synthetic + real-model verification is acceptable for code completion.

Real-footage evaluation will require the project owner to provide authorized
clips later.

Do not search the computer for footage.

==================================================
FAILURE MODEL
==================================================

Use explicit stage failures such as:

MEDIA_UNREADABLE
METADATA_EXTRACTION_FAILED
SOURCE_SEGMENTATION_FAILED
FRAME_EXTRACTION_FAILED
VISUAL_ANALYSIS_FAILED
EMBEDDING_MODEL_UNAVAILABLE
EMBEDDING_FAILED
CANDIDATE_PROPOSAL_FAILED
CANDIDATE_AGGREGATION_FAILED
CLIPSEGMENT_VALIDATION_FAILED

Do not reduce everything to:

FOOTAGE_ANALYSIS_FAILED

Per-asset diagnostics should not expose unnecessary absolute filesystem
information.

==================================================
CACHE DESIGN
==================================================

Reuse/refactor Phase 1 cache infrastructure where appropriate.

Important cache layers may include:

media identity
frame extraction/sample identity
frame semantic embedding
candidate aggregation artifact

Cache keys must include relevant versions/configuration.

Changing:

model revision
preprocessing
sampling policy
aggregation policy

must invalidate affected artifacts.

Do not let old embeddings masquerade as compatible new embeddings.

==================================================
DETERMINISM
==================================================

Given identical:

media bytes
analyzer version
configuration
model revision

expect stable:

asset identity
source boundaries within detector determinism
sample timestamps
candidate proposals
candidate IDs
cache keys
domain structure

Floating point inference may require numeric tolerance.

Do not claim cross-hardware bitwise equality where it cannot be guaranteed.

==================================================
SECURITY
==================================================

Treat uploaded media as untrusted.

No shell string construction with filenames.

Use process argument arrays.

Use explicit executable paths.

Use timeouts.

Prevent path traversal from manifests.

Do not execute metadata.

Do not follow arbitrary filesystem links without deliberate policy.

Do not recursively analyze directories unless explicitly designated.

==================================================
NO NEW HEAVY MODELS
==================================================

DO NOT introduce or download:

V-JEPA
MediaPipe model assets
SAM
CoTracker
Qwen-VL
another SigLIP
another embedding model
LLM video analysis

during this phase.

If you believe one is REQUIRED rather than merely desirable:

STOP.

Provide evidence showing why Phase 2 cannot meet its definition of done using
existing capabilities.

==================================================
DO NOT ADD
==================================================

Do not add:

Audio Analyzer
beat tracking
ASR
Telugu/Hindi speech
reference matching
Hungarian assignment
Edit Planner
rendering
FFmpeg edit generation
HyperFrames
creator UI
manual editor
creator feedback
training
ranker
Postgres
Redis
object storage
cloud
authentication
payments
Kubernetes
trend scraping

==================================================
PHASE 2 DEFINITION OF DONE
==================================================

CODE COMPLETE requires one coherent pipeline:

authorized raw footage
        ↓
stable identities
        ↓
metadata
        ↓
coarse source segmentation
        ↓
temporal feature lattice
        ↓
real or stub visual features
        ↓
reusable SigLIP frame embeddings
        ↓
candidate proposal
        ↓
candidate feature aggregation
        ↓
deduplication
        ↓
validated ClipSegment[]
        ↓
FootageInventory if implemented
        ↓
telemetry
        ↓
evaluation artifact

Additionally:

Phase 0 verification remains PASS.

Phase 1 verification remains PASS.

ReferenceFingerprint artifacts remain unchanged.

No frozen contract changes occur silently.

SigLIP frame work is cached.

Candidate generation is reference-independent.

Overlapping candidates do not cause redundant SigLIP inference.

Raw vectors are not embedded inside ClipSegment JSON.

Embedding-space compatibility with Phase 1 is validated.

Candidate generation is bounded.

No Phase 3 or Phase 4 code is introduced.

==================================================
FIRST ACTION — READ-ONLY AUDIT
==================================================

Before coding, perform a read-only audit.

Report:

CURRENT REPOSITORY STATE

PHASE 0 REGRESSION BASELINE

PHASE 1 REGRESSION BASELINE

CLIPSEGMENT CONTRACT COMPATIBILITY

REUSABLE PHASE 1 COMPONENTS

PYTHON / TYPESCRIPT BOUNDARY

SIGLIP EMBEDDING-COMPATIBILITY PLAN

TEMPORAL FEATURE-LATTICE PLAN

CANDIDATE SEGMENTATION PLAN

CANDIDATE BOUND / EXPLOSION CONTROL

CACHE PLAN

PROPOSED FILES

DEPENDENCIES

TEST PLAN

RISKS / BLOCKERS

Specifically answer:

1. Can the existing ClipSegment contract truthfully represent Phase 2
   outputs without migration?

2. Which Phase 1 media/cache/provider components should be reused rather than
   duplicated?

3. How will overlapping candidate windows avoid repeated SigLIP inference?

4. How will candidate proposal remain independent of the reference Reel?

5. What is the maximum theoretical candidate count under the proposed V0
   configuration for a typical 30-second raw asset?

6. How will reference and footage embedding-space compatibility be enforced?

==================================================
AUDIT STOP RULE
==================================================

If you find:

a frozen-contract blocker
a required global/system change
need for another large model
unclear dependency licensing
a Phase 1 regression

STOP after the audit.

Do not work around it dishonestly.

Otherwise proceed directly with implementation.

Project-local normal dependencies are allowed if their licenses are suitable
and they do not require system-wide modification.

No new model downloads are authorized.

==================================================
VERIFICATION
==================================================

Before declaring Phase 2 complete:

run the complete Phase 0 verification

run the complete Phase 1 verification

run all Phase 2 TypeScript tests

run all Phase 2 Python tests

run media integration tests

run the real cached So400m smoke/integration test

verify offline operation

verify cache reuse

verify no unexpected generated artifacts

verify no source media/model files are tracked as code artifacts

verify candidate upper bounds

verify ClipSegment schema validation

verify embedding-space identity against ReferenceFingerprint embeddings

==================================================
FINAL REPORT
==================================================

Report:

PHASE 2 STATUS

CODE COMPLETE:
YES / NO

REAL-MODEL VERIFIED:
YES / NO

REAL-FOOTAGE VERIFIED:
YES / NO

PHASE 0 REGRESSION:
PASS / FAIL

PHASE 1 REGRESSION:
PASS / FAIL

CONTRACT CHANGES:
normally NONE

FILES CREATED / MODIFIED

DEPENDENCIES

FOOTAGE ANALYZER PIPELINE

SOURCE SEGMENTATION

TEMPORAL FEATURE LATTICE

SIGLIP USAGE

EMBEDDING COMPATIBILITY

CANDIDATE GENERATION

CANDIDATE BOUNDS

DEDUPLICATION

CACHE REUSE

TELEMETRY

TEST RESULTS

SYNTHETIC MEDIA RESULTS

REAL-MODEL RESULTS

RUNTIME / MEMORY OBSERVATIONS

KNOWN LIMITATIONS

REAL-WORLD ITEMS STILL UNVERIFIED

WHAT WAS DELIBERATELY NOT BUILT

PROPOSED NEXT PHASE

The proposed next phase must ONLY be:

PHASE 3 — Audio Analyzer V0

Do not implement it.

Begin with the read-only audit.