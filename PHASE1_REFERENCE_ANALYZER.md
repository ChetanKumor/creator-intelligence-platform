You are continuing development of an existing project:

creator-intelligence-platform

PHASE 0 IS COMPLETE AND VERIFIED.

You are now responsible for:

PHASE 1 — REFERENCE ANALYZER V0

This is the first real Creative Intelligence layer.

Do NOT redesign the entire system.
Do NOT start Phase 2.
Do NOT build the footage analyzer, matcher, planner, renderer, UI, API,
cloud infrastructure, training pipeline, creator memory, or trend system.

Your job in this session is to make ONE capability excellent:

AUTHORIZED LOCAL REFERENCE VIDEO
        ↓
REFERENCE ANALYZER
        ↓
VALIDATED ReferenceFingerprint v1.0.0

==================================================
FIRST PRINCIPLE
==================================================

The Reference Analyzer must answer:

"What editing grammar does this reference video contain?"

It must NOT merely describe the video.

It should extract enough structured information that a future Matcher can ask:

- how many shots exist?
- where are the cuts?
- how long is each shot?
- how does pacing evolve?
- which frames visually represent each shot?
- what does each shot semantically resemble?
- how much motion exists?
- what is the visual structure of the reference?
- where are hook/build/reveal-like regions IF we have sufficient evidence?
- what information remains unknown?

Unknown is always better than fabricated.

DO NOT generate confident semantic values when the available models cannot
support them.

==================================================
PHASE 0 IS AUTHORITATIVE
==================================================

Before editing anything, read the actual repository.

At minimum inspect:

README.md
docs/architecture.md
docs/contracts.md
docs/data-learning.md
docs/verification.md
docs/project-tree.txt

existing package manifests
existing TypeScript contracts
runtime schemas
provider interfaces
telemetry
evaluation package
fixtures
tests

Do not rely only on documentation.

Compare documentation to the actual code and schemas.

ReferenceFingerprint v1.0.0 and the other Phase 0 contracts are considered
FROZEN unless a genuine blocker is discovered.

Prefer additive implementation around the contracts.

If you believe a frozen contract must change:

STOP.

Explain:
- exact incompatibility
- why an adapter cannot solve it
- smallest proposed migration
- backward-compatibility impact

Do not silently modify frozen contracts.

==================================================
KNOWN ENVIRONMENT HISTORY
==================================================

The previous Phase 0 session reported:

Node/npm available.

Python, Git, TypeScript, and rg were not globally available on PATH.
TypeScript was installed project-locally.

This information may now be stale.

Re-check the environment.

Phase 1 will probably require Python and FFmpeg/ffprobe.

DO NOT install:
- Python globally
- FFmpeg globally
- GPU drivers
- CUDA
- system packages
- system PATH modifications

without explicit authorization.

If a required system dependency is absent:

STOP and report exactly what is missing.

Do not redesign the architecture simply to avoid a missing dependency.

Project-local Python virtual environments and project-local packages are
allowed ONLY if a Python interpreter is already available.

==================================================
MEDIA SAFETY / DATA ETHICS
==================================================

Only analyze media explicitly supplied locally by the project owner.

DO NOT:

- scrape Instagram
- scrape TikTok
- scrape YouTube
- download public Reels
- use cookies
- acquire training datasets
- access unrelated personal media
- recursively scan the user's machine
- upload reference media to external inference APIs

Phase 1 must work with:

authorized local files only.

Tests must use synthetic media/fixtures or explicitly designated test media.

Do not put real creator media into Git.

==================================================
NETWORK RULE
==================================================

Unit tests and normal verification must require ZERO network access.

Model weights and Python/npm package downloads are different from runtime
network inference.

Before downloading any large pretrained model weights:

REPORT:

- exact model
- source
- license
- approximate download size if known
- why it is needed
- expected local hardware requirements

and request approval if the weights are not already cached.

DO NOT use the Hugging Face hosted inference API.

SigLIP must run locally.

==================================================
TARGET PIPELINE
==================================================

Design Phase 1 around this conceptual pipeline:

authorized reference.mp4
        ↓
asset hashing + provenance
        ↓
media metadata
        ↓
shot boundary detection
        ↓
shot timeline
        ↓
deterministic representative-frame sampling
        ↓
cheap visual/technical analysis
        ↓
SigLIP 2 semantic embeddings
        ↓
shot-level aggregation
        ↓
pacing / structural features
        ↓
ReferenceFingerprint builder
        ↓
existing runtime schema validator
        ↓
telemetry + ModelRun records
        ↓
evaluation artifacts
        ↓
ReferenceFingerprint.json

Do NOT let any provider bypass the existing validation layer.

==================================================
COMPONENT 1 — ASSET IDENTITY / PROVENANCE
==================================================

For every analyzed reference:

compute a stable content hash such as SHA-256.

Create/derive:

assetId
contentHash
file size
analyzer version
timestamps
media metadata
model/provider versions

Do not use the full local filesystem path as permanent identity.

Local path may exist only as ephemeral execution context.

The same exact media analyzed twice should be identifiable as the same asset.

Design caching around content identity.

==================================================
COMPONENT 2 — MEDIA METADATA
==================================================

Prefer ffprobe for authoritative media metadata if available.

Extract at minimum when supported:

duration
width
height
fps
frame count if reliable
codec
rotation/orientation
aspect ratio
whether an audio stream exists

Normalize phone-video rotation correctly.

Do not infer BPM, lyrics, beats, language, or detailed audio structure.

Those belong to Phase 3.

If ReferenceFingerprint contains audio fields that Phase 1 cannot know,
represent them using the existing contract's legitimate unknown/unmeasured
state.

NEVER manufacture values merely to satisfy a schema.

==================================================
COMPONENT 3 — SHOT DETECTION
==================================================

Use a dedicated ShotDetector abstraction.

Preferred V0 implementation:

PySceneDetect

Candidate detector configurations should include at least:

ContentDetector
AdaptiveDetector

Do NOT declare one universally superior without evidence.

Create an evaluation seam so we can later compare detectors on manually
labelled Reel boundaries.

Output deterministic shot boundaries:

shotId
start
end
duration

Enforce invariants:

start >= 0
end > start
shots ordered
no impossible overlap
final boundary <= media duration within tolerance

Fast-cut vertical video is our primary future domain.

Do not optimize only for cinematic long-form footage.

==================================================
COMPONENT 4 — REPRESENTATIVE FRAME SAMPLING
==================================================

Do NOT embed every frame.

For each detected shot, select a small deterministic set of representative
frames.

A reasonable V0 policy may use:

very short shot:
    midpoint

longer shot:
    approximately 25%
    50%
    75%

but derive the exact policy from duration and avoid frames directly adjacent
to transitions where possible.

Cap sampled frames per shot.

Record sampling timestamps.

The same input/configuration should result in the same selected timestamps.

==================================================
COMPONENT 5 — CHEAP VISUAL SIGNALS
==================================================

Use inexpensive deterministic/local analysis before expensive models.

OpenCV is appropriate for things such as:

brightness/exposure signals
sharpness/blur signal
basic frame statistics
motion magnitude
frame-to-frame change

Be conservative.

Separating:

camera motion

from:

subject motion

is NOT trivial.

If V0 cannot reliably distinguish them, record only what can actually be
measured or mark fields unknown.

Do not invent:

"camera_pan_left"

just because optical flow magnitude is high.

==================================================
COMPONENT 6 — SIGLIP 2
==================================================

Implement SigLIP behind the existing provider abstractions.

It must NOT leak Hugging Face-specific structures into:

ReferenceFingerprint

or other core contracts.

Preferred QUALITY candidate:

google/siglip2-so400m-patch16-naflex

Preferred LIGHTER candidate:

google/siglip2-base-patch16-naflex

Do not assume the larger model wins.

Architecture must make them interchangeable through configuration.

The larger model should only become the default after evidence shows useful
quality improvement at acceptable latency/memory/cost.

For every representative frame:

produce a normalized semantic embedding.

Then define and document a deterministic shot-level aggregation strategy.

Possible V0:

normalize each frame embedding
→ mean/weighted aggregation
→ normalize resulting shot embedding

but benchmark/justify the exact approach.

IMPORTANT:

Do NOT place large embedding vectors directly inside
ReferenceFingerprint JSON.

The fingerprint should contain an EmbeddingRef such as:

provider
model
modelRevision
embeddingId
dimension if contract supports it

Actual vectors should live in a local embedding artifact/cache abstraction.

The cache key should include enough information to prevent incompatible
reuse, e.g.:

asset content hash
shot/sample identity
model ID
model revision
preprocessing configuration

Changing model/preprocessing must invalidate the appropriate cache.

==================================================
COMPONENT 7 — SEMANTIC LABELS
==================================================

SigLIP may also be evaluated for bounded zero-shot classification.

Potential bounded vocabularies:

shot size:
close-up
medium
full-body
wide

visual energy:
low
medium
high

coarse composition/category signals

But this is OPTIONAL.

Only add semantic labels where:

- vocabulary is explicit
- confidence is retained
- evaluation is possible
- unknown is supported

Do NOT use an LLM to create arbitrary prose for every shot in Phase 1.

Do NOT pretend SigLIP alone understands the complete edit.

Semantic embeddings are more important than pretty descriptions.

==================================================
COMPONENT 8 — PACING / EDITING STRUCTURE
==================================================

Compute deterministic structural statistics from the shot timeline.

Examples:

shot count
average shot length
median shot length
cut density
minimum/maximum shot duration
shot-duration distribution
opening pacing
middle pacing
ending pacing
relative pacing changes

If the existing contract supports it appropriately, derive defensible
structural signals.

Be extremely careful with labels such as:

HOOK
BUILD
REVEAL
HERO
OUTRO

These are semantic editing roles.

Do NOT assign them merely based on timeline position.

If there is insufficient evidence in V0:

use unknown/unassigned.

We can improve semantic-role understanding later.

==================================================
COMPONENT 9 — REFERENCE FINGERPRINT BUILDER
==================================================

Create one clear builder/orchestrator responsible for converting analyzer
outputs into:

ReferenceFingerprint v1.0.0

Providers should not construct business-domain objects directly.

Preferred direction:

providers produce narrow analysis results
        ↓
ReferenceAnalyzer orchestrates
        ↓
ReferenceFingerprintBuilder
        ↓
existing schema validation
        ↓
accepted artifact

The validated contract remains the boundary.

==================================================
COMPONENT 10 — MODEL RUN + TELEMETRY
==================================================

Use the Phase 0 telemetry foundation.

For meaningful analysis operations record:

provider
model/tool
model/version
operation
wall-clock duration
device if appropriate
units such as frames/shots
external monetary cost

For local models:

external API cost can legitimately be ₹0.

But still record:

execution time
number of samples
model used

Do not pretend local compute has zero real-world infrastructure cost forever.

We simply do not yet have production infrastructure economics.

==================================================
COMPONENT 11 — CACHING
==================================================

Analysis must be repeatable without recomputing expensive embeddings.

Create a simple local artifact cache abstraction.

V0 may use the filesystem.

It must be:

content-addressed where appropriate
model/version-aware
safe to clear
outside tracked source artifacts where appropriate
documented

Do not build Redis/S3/Postgres caching yet.

Do not create infrastructure.

==================================================
COMPONENT 12 — CLI / DEVELOPER ENTRY POINT
==================================================

Provide one clean local developer command conceptually similar to:

analyze-reference <local-file> <authorized-manifest>

Exact command shape may follow repository conventions.

It should:

verify authorization/provenance metadata
hash media
analyze
validate
write fingerprint artifact
write run metadata
print concise summary

Example summary:

asset
duration
shots detected
representative frames
embedding model
runtime
fingerprint validation
cache hits/misses

Do not output massive vectors to the terminal.

==================================================
COMPONENT 13 — AUTHORIZED MEDIA MANIFEST
==================================================

Create a minimal provenance/authorization sidecar format if Phase 0 does not
already provide one.

It should record enough to demonstrate why this media is permitted for local
development/evaluation.

For example conceptually:

asset
sourceType
authorizationBasis
allowedPurpose
dateAdded

Do not turn this into a huge legal-management system.

If this requires changing a frozen contract, keep it separate from the
ReferenceFingerprint.

==================================================
EVALUATION — CRITICAL
==================================================

Phase 1 is NOT successful because:

"the script ran."

Create a real evaluation foundation.

Support a manually-labelled reference benchmark manifest.

For shot boundaries, support metrics such as:

precision
recall
F1
timing error

using an explicitly documented boundary tolerance.

The tolerance must account for frame rate.

Do not hide detector errors by choosing a huge tolerance.

Also measure:

schema-valid fingerprint rate
runtime per source minute
number of sampled frames
embedding cache hit rate
analysis determinism where realistically possible

For semantic classification:

do not report accuracy unless ground-truth labels actually exist.

For embeddings:

do not invent an "embedding quality score."

Matching quality will ultimately be measured in Phase 4.

==================================================
BENCHMARK PHILOSOPHY
==================================================

We have NO proprietary training dataset.

That is fine.

Training data is not required for Phase 1.

Evaluation data IS required.

Create infrastructure so we can later place authorized benchmark references
under an ignored/local media directory while committing only safe manifests
or synthetic fixtures when appropriate.

We eventually want a small manually reviewed reference set.

But do NOT download it yourself.

==================================================
SYNTHETIC TESTING
==================================================

Tests must NOT require large model downloads.

Unit tests should mock/stub expensive providers.

Create deterministic tests covering:

asset hashing
shot timeline validation
frame timestamp selection
embedding reference creation
cache key behavior
fingerprint builder
schema validation
telemetry integration
failure propagation
unsupported/corrupt media behavior where practical

For scene detector integration tests:

use a tiny synthetic/generated sample ONLY if the necessary local media tools
already exist.

Do not install global tools just for a test.

==================================================
REAL MODEL SMOKE TEST
==================================================

A real SigLIP smoke test should be separate from unit tests.

It must be explicitly invoked.

If model weights are already cached and environment is capable:

run it.

If not:

report exactly what is needed.

Do NOT mark the entire Phase complete based purely on mocked embeddings if the
real integration has never been tested.

Instead distinguish:

CODE COMPLETE

from:

REAL-MODEL VERIFIED

==================================================
FAILURE MODEL
==================================================

Failures must be explicit.

Examples:

MEDIA_UNREADABLE
METADATA_EXTRACTION_FAILED
SHOT_DETECTION_FAILED
FRAME_EXTRACTION_FAILED
EMBEDDING_MODEL_UNAVAILABLE
EMBEDDING_FAILED
FINGERPRINT_VALIDATION_FAILED

Do not collapse everything into:

REFERENCE_ANALYSIS_FAILED

Preserve stage and useful diagnostics without leaking secrets/local paths.

==================================================
DETERMINISM
==================================================

Where practical, the same:

media
analyzer version
configuration
provider/model revision

should produce the same:

shot boundaries
sample timestamps
fingerprint structure
cache keys

Floating-point embeddings may not be bit-identical across all hardware.

Do not promise impossible cross-device bitwise equality.

Instead define what is expected to be structurally deterministic and what may
use numeric tolerance.

==================================================
SECURITY
==================================================

Treat media as untrusted input.

Avoid shell string construction from media filenames.

Never let model-generated text become shell commands.

Use process argument arrays where external tools are called.

Use timeouts.

Avoid arbitrary traversal outside the explicitly supplied media path.

Do not automatically execute embedded metadata.

==================================================
PERFORMANCE
==================================================

Do not optimize prematurely.

But instrument enough to answer later:

How long does one 30-second Reel take to analyze?

Where is time spent?

How many frames did we embed?

How often did cache hit?

Do NOT process every frame with SigLIP.

==================================================
DO NOT ADD YET
==================================================

Do NOT add:

V-JEPA unless there is a demonstrated Phase 1 requirement
MediaPipe unless demonstrably required
LLM semantic narration
ASR
beat detection
Telugu/Hindi speech analysis
creator preference models
custom training
vector database
Postgres
Redis
S3
BullMQ
Kubernetes
cloud deployment
UI
payments
authentication
Footage Analyzer
Matcher
Edit Planner
FFmpeg rendering pipeline

Those belong to later phases.

Phase 1 should remain sharp and measurable.

==================================================
QUALITY MODEL POLICY
==================================================

Do not choose SigLIP2 So400m merely because it is larger.

Implement model configurability.

Our later benchmark should compare at least:

SigLIP2 Base NaFlex
vs
SigLIP2 So400m NaFlex

on:

retrieval/matching usefulness when Phase 4 exists
latency
memory
cost

For now:

So400m NaFlex is the quality candidate.
Base NaFlex is the lighter candidate.

If the current hardware cannot safely run So400m:

do not force it.

Report the hardware limitation.

==================================================
PHASE 1 DEFINITION OF DONE
==================================================

Phase 1 is CODE COMPLETE only when:

authorized local reference input
        ↓
stable asset identity
        ↓
media metadata
        ↓
shot boundaries
        ↓
representative samples
        ↓
visual signals
        ↓
embedding references
        ↓
structural/pacing features
        ↓
ReferenceFingerprint v1.0.0
        ↓
runtime validation
        ↓
telemetry
        ↓
evaluation artifact

works through one coherent orchestrator.

Additionally:

- Phase 0 tests still pass.
- New Phase 1 tests pass.
- no frozen contract was silently broken.
- expensive model calls are provider-isolated.
- raw embeddings are not in domain JSON.
- model artifacts are not committed.
- authorized media is not committed.
- unit tests require no internet.
- no Phase 2 work was introduced.

REAL-MODEL VERIFIED is a separate status.

It requires at least one authorized local reference successfully processed
through the actual SigLIP provider.

If no authorized sample/model weights/environment exists:

report this honestly as pending.

==================================================
FIRST ACTION — DO NOT CODE IMMEDIATELY
==================================================

First perform a READ-ONLY audit.

Report concisely:

CURRENT REPO STATE

PHASE 0 INTEGRATION POINTS

ENVIRONMENT
- Node
- Python
- FFmpeg
- ffprobe
- available CPU/GPU information if safely discoverable
- project-local package managers

FROZEN CONTRACT COMPATIBILITY

PROPOSED PHASE 1 FILES

DEPENDENCIES

MODEL PLAN

CACHE PLAN

TEST PLAN

RISKS / BLOCKERS

Pay particular attention to the Python boundary.

Phase 0 is primarily TypeScript.

For Phase 1, Python is likely appropriate for media/ML.

Design the smallest clean boundary between:

Python analysis

and

TypeScript-owned contracts/validation.

Do not duplicate domain truth independently in both languages if avoidable.

JSON Schema should remain a language-neutral contract boundary.

After the audit:

If all necessary local prerequisites already exist and no major premise is
invalid, proceed.

If Python, FFmpeg, or another required system dependency is missing:

STOP.

Tell me exactly what needs to be installed/configured and why.

Do not install it yourself.

If a large SigLIP model download is required:

STOP before downloading the model and ask for authorization.

==================================================
IMPLEMENTATION PHILOSOPHY
==================================================

Build the smallest system that gives us trustworthy reference intelligence.

Not the system that looks most impressive.

The eventual company moat is not:

PySceneDetect
SigLIP
OpenCV

Those are replaceable primitives.

Our durable assets are:

our ReferenceFingerprint semantics
our analysis/evaluation discipline
our matcher
our behavioral learning data
our editing grammar
our creator preference intelligence

Therefore every external model must remain replaceable.

==================================================
FINAL VERIFICATION REPORT
==================================================

When finished, report:

PHASE 1 STATUS

CODE COMPLETE:
YES / NO

REAL-MODEL VERIFIED:
YES / NO

PHASE 0 REGRESSION:
PASS / FAIL

FILES CREATED / MODIFIED

DEPENDENCIES

REFERENCE ANALYZER PIPELINE

SIGLIP CONFIGURATION

CACHE DESIGN

TELEMETRY

TEST RESULTS

BENCHMARK / EVALUATION STATUS

KNOWN LIMITATIONS

REAL WORLD ITEMS STILL UNVERIFIED

CONTRACT CHANGES
should normally be NONE

WHAT WAS DELIBERATELY NOT BUILT

PROPOSED NEXT PHASE

The proposed next phase must only be:

PHASE 2 — Footage Analyzer V0

Do NOT implement Phase 2.

Begin with the read-only audit.