# Creative Intelligence — PHASE 2.5 FINAL CLOSURE

You are executing **Creative Intelligence — PHASE 2.5 FINAL CLOSURE ONLY**.

This is an evidence-driven verification and closure session.

Do NOT start Phase 2.6.

Do NOT start Phase 3.

Do NOT integrate V-JEPA, PE, PE-AV, VideoPrism, DOVER, Q-Align, TRINITY, FilmGPT concepts, Creative Ranker work, transition intelligence, audio intelligence, preference learning, sequence planning or any other new research architecture in this session.

The only objective is:

> Complete the remaining real-footage verification gates for the existing Phase 2 implementation using the exact frozen SigLIP2 configuration, and determine whether Phase 2 can be formally closed.

---

# 0. AUTHORITATIVE CONTEXT

Before doing anything else, read and obey:

1. `AGENTS.md`
2. `docs/CURRENT_PHASE.md`
3. `docs/footage-analyzer.md`
4. `docs/footage-evaluation.md`
5. `docs/footage-verification.md`
6. this file

Repository truth and current persisted artifacts override stale assumptions in this prompt.

Do not repeat already-proven work unless this specification explicitly requires a regression or repeatability check.

---

# 1. CURRENT VERIFIED STATE

Phase 0 regression:

`PASS`

Phase 1 regression:

`PASS`

Phase 2 regression:

`PASS`

Phase 2 code complete:

`YES`

Real-model guarded smoke:

`PASS`

Real-footage final verification:

`PENDING`

Phase 2 final complete:

`NO`

Phase 2.6:

`NOT STARTED`

Phase 3:

`NOT STARTED`

---

# 2. FROZEN MODEL CONFIGURATION

Model:

`google/siglip2-so400m-patch16-naflex`

Revision:

`cc24074f717b612951c2dead130904ab9b65a81e`

Device:

`CPU`

CPU fallback:

`false`

Max patches:

`256`

Expected real embedding dimension:

`1152`

Expected real embedding space:

`space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687`

Use the existing repository production provider path.

Do not alter this configuration.

---

# 3. SUCCESSFUL GUARDED REAL-MODEL SMOKE — ALREADY PROVEN

The official guarded smoke command was executed successfully:

`node --import ./scripts/no-network.mjs dist/scripts/smoke-footage-model.js`

Observed result:

`status: PASS`

Fresh inference attempted:

`true`

Offline:

`true`

Model:

`google/siglip2-so400m-patch16-naflex`

Revision:

`cc24074f717b612951c2dead130904ab9b65a81e`

Device:

`cpu`

Observed dimension:

`1152`

First run:

* 3 semantic samples requested
* 3 semantic samples selected
* 3 semantic samples embedded
* 0 frame cache hits
* 3 frame cache misses
* embedding cache hit rate 0
* runtime approximately 30.812 seconds
* 12 valid candidates
* schema-valid ClipSegment rate 1.0

Immediate repeat:

* 3 semantic samples selected
* 0 new semantic embeddings
* 3 frame cache hits
* 0 frame cache misses
* embedding cache hit rate 1.0
* runtime approximately 58 ms
* zero unnecessary new inference

Observed guarded memory result:

* `safeToLoad: true`
* process private bytes approximately 6,127,349,760
* peak pagefile bytes approximately 10,687,549,440
* peak working set approximately 2,060,152,832
* guarded operation finished successfully

This proves:

* the exact frozen real SigLIP2 model loads successfully,
* real inference succeeds,
* real vectors have dimension 1152,
* the real embedding path works,
* the real frame cache works,
* an immediate repeat avoids unnecessary inference.

IMPORTANT:

This successful smoke used the repository's controlled synthetic fixture.

Therefore:

REAL-MODEL SMOKE VERIFIED:

`YES`

FULL NINE-ASSET REAL-FOOTAGE MODEL PATH VERIFIED:

`NO`

Do not relabel the smoke fixture as real creator-footage verification.

Do not rerun the smoke merely for discovery.

A fresh capacity preflight before the larger real-footage model load is still required.

---

# 4. CURRENT REAL-FOOTAGE STATE

Authorized real assets:

`9`

Media:

`9 H.264 MP4 files`

Total source duration:

`302.338072 seconds`

Observed footage domain:

* mostly podcast/interview material
* seated talking-head footage
* one seated watch/product presentation
* mix of portrait and landscape
* existing crops, overlays and black bars present in some sources

Source orientation:

* 4 landscape
* 5 portrait

Source resolutions span approximately:

* portrait: 720×1280 through 1440×2560
* landscape: 1920×1072 / 1080 / 1088

Frame-rate characteristics:

* 7 CFR sources around 29.97, 30 or 60 fps
* 2 valid VFR sources around 59.9 fps

Detected source shots:

`36`

Ground-truth shot-boundary accuracy on this real set:

`UNVERIFIED`

Original source bytes:

`UNCHANGED`

---

# 5. REAL PREPARATION ALREADY PASSED

Cheap lattice:

* 1,227 measurements
* approximately 4 samples per source second
* default cap 480 per asset
* all 36 detected shots represented
* no reduced-resolution assets
* maximum cheap-sample gap approximately 0.266934 seconds

Semantic lattice:

* requested: 99
* selected: 96
* unique selected PNG images: 96
* real embeddings previously produced in the real-footage run: 0
* default semantic cap: 32 per asset
* no reduced semantic coverage
* maximum semantic gap approximately 7.700154 seconds

Selection reason counts:

* source-shot anchors: 36
* temporal coverage: 58
* visual-change events: 25
* motion-change events: 5
* exposure-change events: 0
* sharpness-change events: 2

Reason counts may overlap.

Candidate proposals:

* uncapped demand: 2,126
* bounded proposals: 872
* all 872 remain within detected source-shot boundaries
* duration 0.5s: 279
* duration 1s: 261
* duration 2s: 189
* duration 3s: 140
* 3 shorter-shot whole-duration windows
* 4 assets reached the 64-per-shot ceiling
* no asset reached 256-per-asset ceiling
* project did not reach 1,024-project ceiling

Coverage before pruning:

`99.503866%`

Maximum uncovered gap before pruning:

`0.266667 seconds`

Retained count:

`UNVERIFIED`

Semantic dedupe removals:

`UNVERIFIED`

Coverage after pruning:

`UNVERIFIED`

---

# 6. PRIOR DEFECT ALREADY RESOLVED

Real preparation exposed a valid VFR metadata issue affecting:

* `LukeRaw2.mp4`
* `ChrisRaw.mp4`

The fix:

* preserved exact source timing / PTS,
* preserved exact source FPS provenance,
* added optional internal `frameRateApproximation`,
* emitted a bounded display fraction,
* changed no frozen public contracts,
* added regression coverage.

Do not revisit or redesign this fix unless current evidence falsifies it.

---

# 7. NON-NEGOTIABLE RULES

1. DO NOT bypass the capacity guard.

2. DO NOT change the model.

3. DO NOT change the model revision.

4. DO NOT substitute a smaller SigLIP2 model.

5. DO NOT change the expected embedding dimension.

6. DO NOT use stub/synthetic embeddings as evidence for the real-footage run.

7. DO NOT silently alter preprocessing.

8. DO NOT alter NaFlex patch settings to make the run cheaper.

9. DO NOT change public/frozen contracts merely to make verification pass.

10. DO NOT tune semantic thresholds using these nine videos.

11. DO NOT tune deduplication thresholds using these nine videos.

12. DO NOT change Windows pagefile or machine virtual-memory configuration.

13. DO NOT kill arbitrary user processes.

14. DO NOT modify source-media bytes.

15. DO NOT search unrelated user directories for additional media.

16. DO NOT call synthetic evidence real-footage evidence.

17. DO NOT call cached Phase 1 vectors fresh Phase 2 inference.

18. DO NOT call preparation success end-to-end verification.

19. DO NOT infer creative quality from schema validity.

20. DO NOT claim broad-domain generalization from this footage set.

21. DO NOT start Phase 2.6.

22. DO NOT start Phase 3.

23. Preserve provenance for every important result.

24. If a premise in this specification is false at current repository state, report the discrepancy and follow repository truth.

---

# 8. PHASE A — NO-WRITE FORENSIC BASELINE

Before modifying source:

Record the current repository/workspace state.

If Git metadata exists, capture:

* `git rev-parse HEAD`
* `git status --porcelain`
* current branch

If Git metadata does not exist:

* do not initialize Git,
* do not treat absence of Git as a defect,
* use the repository's existing source-hash/frozen-file auditing mechanism.

Record:

* relevant Phase 2 / 2.5 source files
* current verification documentation
* latest smoke receipt
* exact model configuration
* model revision
* provider configuration
* Python version
* Torch version
* Transformers version
* Pillow version
* FFmpeg version
* whether model files are already cached locally
* current real-footage manifest
* authorization state
* source hashes
* prepared semantic-frame hashes
* existing real embedding cache directories
* aggregate cache directories
* latest Phase 2.5 run directory

Explicitly distinguish:

`REAL SIGLIP2 ARTIFACTS`

from

`STUB / SYNTHETIC ARTIFACTS`

Audit the cache-key / embedding-space logic sufficiently to prove that synthetic 8-dimensional vectors cannot enter the real 1152-dimensional embedding namespace.

Required evidence should cover, where applicable:

* model identity
* revision
* mode/provider identity
* preprocessing identity
* implementation identity
* embedding dimensions
* embedding space ID
* frame-content identity

If real and synthetic embedding spaces could collide:

STOP.

Return:

`PHASE 2 IMPLEMENTATION DEFECT REMAINS`

and document the exact collision path.

Do not proceed to real-footage inference until the namespace separation is mechanically proven.

---

# 9. PHASE B — FRESH CAPACITY PREFLIGHT

Before loading SigLIP2 for the nine real assets, rerun the repository's exact capacity preflight.

Capture:

* timestamp
* commit limit
* total committed
* available commit headroom
* required commit headroom
* available physical memory
* required physical memory
* historical Phase 1 peak process commit
* runtime reserve
* guard verdict

Also record sufficiently detailed process-level memory diagnostics to explain failure if blocked.

Do NOT terminate processes automatically.

Do NOT change system settings.

If capacity is unsafe:

HALT before model load.

Return:

`CAPACITY RESULT: BLOCKED`

Then produce a concise table:

| Process / subsystem | Observed evidence | Repo-owned? | Safe for user to close manually? | Potential memory release | Confidence |
| ------------------- | ----------------: | ----------- | -------------------------------- | -----------------------: | ---------- |

Do not make code changes because the environment lacks memory.

Final ruling in this situation:

`C. PHASE 2 STILL BLOCKED BY ENVIRONMENT CAPACITY`

If capacity is safe:

continue.

---

# 10. PHASE C — VERIFY THE SUCCESSFUL SMOKE RECEIPT

Do not rerun the synthetic smoke solely for rediscovery.

Inspect the most recent persisted successful smoke artifact/receipt and verify that it records:

* real SigLIP provider
* exact frozen model
* exact revision
* CPU
* 1152 dimensions
* fresh inference attempted
* first-run cache misses
* cached-repeat hits
* zero unnecessary repeat inference
* guarded operation success

If persisted receipt contradicts the manually observed PASS:

STOP and report the discrepancy.

If consistent:

record:

`GUARDED REAL-MODEL SMOKE: PASS`

Then proceed.

---

# 11. PHASE D — FULL REAL SEMANTIC EMBEDDING RUN

Execute the normal production Phase 2 real-footage analysis using the nine already-authorized real assets.

Use the already prepared semantic-frame selection.

Expected semantic input:

* 99 requested
* 96 selected
* 96 unique PNG frame images

Do not change selection rules.

Do not reduce the semantic set merely to make inference cheaper.

Measure and persist:

* semantic samples requested
* semantic samples selected
* unique frame hashes
* valid pre-existing real-cache hits
* fresh real provider operations
* cache misses
* cache writes
* provider failures
* embedding failures
* total model inference runtime
* per-frame timing if available
* process memory before model load
* peak working set
* process private memory
* process/pagefile commit
* system available physical memory
* system available commit
* guard behavior

Invariant:

For every required unique selected real semantic frame:

`valid real cache hit OR fresh real provider operation`

must account for its real embedding.

Prove:

`valid_real_cache_hits + fresh_real_provider_operations == unique_required_real_embeddings`

Do not require exactly 96 provider operations if valid, compatible real-cache entries already exist.

Every real semantic embedding must satisfy:

* model = exact frozen model
* revision = exact frozen revision
* dimensions = 1152
* finite values
* compatible normalization
* correct real embedding space
* correct source frame identity

Any vector with wrong dimensions or incompatible space is invalid and must not silently participate in aggregation.

If real inference fails due to environment capacity:

stop safely and classify correctly.

If real inference fails due to provider/source defect:

record the failing evidence and follow the defect procedure.

---

# 12. PHASE E — REAL EMBEDDING CACHE REPEAT

Immediately rerun the same real-footage analysis with unchanged configuration.

Measure:

First run:

* provider operations
* frame-cache hits/misses
* aggregate-cache hits/misses
* decoded frames
* semantic embeddings
* runtime

Repeat:

* provider operations
* frame-cache hits/misses
* aggregate-cache hits/misses
* decoded frames
* semantic embeddings
* runtime

Desired result:

`0 unnecessary fresh SigLIP2 operations on the repeat`

All valid reusable embeddings must come from the real compatible cache.

If provider operations unexpectedly occur:

investigate:

* cache-key drift
* frame hash drift
* model identity drift
* revision drift
* preprocessing identity drift
* implementation version drift
* corrupted cache artifacts
* incompatible vector metadata

Do not hide cache misses.

Do not weaken cache identity to make the repeat pass.

---

# 13. PHASE F — REAL CANDIDATE AGGREGATION

Run the existing `CandidateFeatureAggregator` over the real 1152-dimensional frame representations.

No new provider inference is allowed from the aggregator itself.

Complete previously missing evidence:

* candidates before deduplication
* retained candidates
* pruned candidates
* candidates per asset
* candidates per source shot
* candidates per duration scale
* semantic support type
* semantic context distance
* contributing semantic frame IDs
* contributing cheap sample IDs
* contributing measurement IDs
* aggregation IDs
* aggregation versions
* real embedding references
* aggregate cache hits/misses

Verify every candidate remains within its detected source-shot boundary unless the frozen contract explicitly permits otherwise.

Verify the aggregator never invokes the provider.

---

# 14. PHASE G — REAL SEMANTIC DEDUPLICATION

Run the actual semantic deduplication using real SigLIP2 candidate representations.

Use the frozen configured deduplication settings.

Do NOT tune thresholds on this footage.

Capture:

* threshold configuration
* temporal IoU threshold
* cosine-similarity threshold
* duration-ratio threshold
* center-distance threshold
* eligible pair count
* geometry-filtered pair count
* semantic comparisons
* similarity distribution summary
* removed candidates
* retained candidates
* coverage-protected decisions
* representative links

Generate examples for:

1. highest-similarity retained pair
2. lowest-similarity pruned pair, if any
3. coverage-protected duplicate candidate, if any
4. identical/near-identical visual content retained because it occurs at meaningfully different times, if any

If zero candidates are removed:

state that honestly.

Do not interpret zero removals as failure if no pairs satisfy all frozen dedupe predicates.

---

# 15. PHASE H — COVERAGE AFTER PRUNING

Measure final retained-candidate coverage.

Report:

* source duration
* covered duration
* temporal union coverage after pruning
* maximum uncovered gap after pruning
* represented detected source shots
* source-shot count
* coverage by duration scale where the existing evaluation contract requires it

Compare with pre-pruning evidence:

Pre-pruning coverage:

`99.503866%`

Pre-pruning maximum uncovered gap:

`0.266667 seconds`

Any unexpected regression must be explained.

Do not modify dedupe rules solely to make coverage look better.

---

# 16. PHASE I — COMPLETE REPRESENTATION PROVENANCE

The previous real-footage session proved partial lineage only.

This phase must determine whether complete representation lineage now exists.

For at least:

`2 retained candidates per real asset`

where available,

mechanically prove:

source asset
→ authorization
→ source SHA-256
→ source metadata
→ detected source shot
→ candidate source interval
→ proposal configuration
→ cheap sample IDs
→ cheap measurements
→ selected semantic frame IDs
→ semantic frame PNG hashes
→ exact real SigLIP2 embedding references
→ real embedding cache objects
→ embedding space
→ aggregation ID/version
→ candidate ID
→ semantic support type
→ dedupe decision
→ retained/pruned state
→ final analysis artifact
→ producing run/configuration

If any required join is missing:

`FULL PROVENANCE: FAIL`

Do not infer joins from timestamps when stable IDs are expected.

Do not claim complete provenance unless the joins are mechanically recoverable from persisted artifacts.

---

# 17. PHASE J — HUMAN REVIEW ARTIFACTS

Update/generate review artifacts for the completed REAL aggregated result.

The previous review sheets were preliminary and unaggregated.

Produce reviewable material for:

* all source overviews
* selected semantic frames
* retained candidate examples
* pruned candidate examples
* dedupe examples
* sampling reasons
* candidate ranges
* shot membership
* cheap technical measurements
* semantic support
* aggregation/provenance references

At minimum inspect enough retained candidates across all nine assets to detect obvious mechanical failures.

Human review in this phase is ONLY checking:

* time ranges are sensible
* proposals are actually from the intended source
* sampling appears temporally distributed
* obvious cuts/crops/overlays are represented plausibly
* aggregation does not produce nonsensical joins
* retained candidates remain reviewable and source-grounded

Do NOT claim:

* professional editing quality
* aesthetic quality
* creator preference understanding
* broader action understanding
* trend understanding
* narrative intelligence
* reference-style understanding
* emotional editing intelligence

The nine videos are mostly podcast/interview/seated talking-head footage and do NOT establish general performance for:

* weddings
* travel
* gym
* sports
* fashion
* dance
* cinematic montage
* dynamic product advertisements
* event highlight films
* music-video editing
* current short-form trends

Explicitly preserve this limitation.

---

# 18. PHASE K — REGRESSION VERIFICATION

Run the repository's required complete verification.

Preserve at least the previously passing baseline:

* 83 TypeScript tests
* 6 media integration tests
* 11 Python tests

plus any directly relevant new regression test only if fresh evidence required a real implementation correction.

Verify:

* Phase 0 regression
* Phase 1 regression
* Phase 2 regression
* generated-artifact checks
* source audit
* frozen-contract checks
* model/provider audit where existing repository tooling requires it

No unexplained regression is acceptable.

If test totals change:

explain exactly why.

Do not casually update expected test counts.

---

# 19. PHASE L — REPEATABILITY / DETERMINISM

From the stable real-cache state, run the completed real-footage analysis again as required by the verification contract.

Compare:

* source hashes
* source metadata identity
* configuration IDs
* proposal configuration IDs
* selected semantic frame IDs
* selected frame hashes
* embedding space IDs
* embedding references
* aggregation IDs
* candidate IDs
* retained candidate set
* pruned candidate set
* dedupe representative links
* coverage
* maximum gap
* provider operations
* frame-cache behavior
* aggregate-cache behavior

Require deterministic equality wherever the existing contract expects deterministic results.

Real floating-point inference does NOT require cross-hardware bitwise equality unless the repository already claims that property.

Explain any legitimate nondeterminism.

Unexpected ID/set/configuration drift must be investigated before closure.

---

# 20. DEFECT PROCEDURE

This session is primarily verification.

Code changes are permitted ONLY when fresh real evidence exposes a genuine implementation defect.

For every such change:

1. State the falsified assumption.

2. Preserve the failing evidence.

3. Identify the smallest affected surface.

4. Make the minimum valid correction.

5. Add or strengthen a regression test.

6. Rerun the smallest affected gate.

7. Rerun all required final regressions.

8. Record changed files.

9. Record evidence proving the correction.

10. Preserve historical failure evidence.

Do NOT perform:

* speculative refactors
* cleanup unrelated to closure
* architecture redesign
* dependency upgrades
* new model integration
* performance tuning unrelated to a verified blocker
* threshold tuning
* UI work
* Phase 2.6 work
* Phase 3 work

---

# 21. PHASE 2 FINAL-CLOSURE CRITERIA

Phase 2 may be marked final complete ONLY if all of the following are true:

1. Phase 2 code complete.

2. Guarded fresh real-model SigLIP2 smoke PASS.

3. Full real-footage model-backed run completes successfully.

4. All required real semantic frames have compatible real embeddings.

5. Real cache reuse is proven.

6. Candidate aggregation uses real 1152-dimensional representations.

7. Aggregator performs zero model inference.

8. Semantic dedupe executes using real representations.

9. Retained/pruned counts are known.

10. Coverage after pruning is known.

11. Full required provenance passes.

12. Real retained-candidate review artifacts exist.

13. Relevant regressions pass.

14. Stable repeat/cache behavior passes.

15. No unresolved implementation defect remains.

16. No environment-capacity blocker remains for the completed run.

Do not lower these requirements merely to close the phase.

---

# 22. FINAL STATUS OUTPUT FORMAT

At the end, output exactly this structure:

# PHASE 2 STATUS

CODE COMPLETE:
YES / NO

GUARDED REAL-MODEL SMOKE:
PASS / FAIL

FULL REAL-MODEL VERIFIED:
YES / NO

REAL-FOOTAGE VERIFIED:
YES / NO

PHASE 2 FINAL COMPLETE:
YES / NO

MODEL:
...

REVISION:
...

DEVICE:
...

OBSERVED REAL DIMENSION:
...

REAL EMBEDDING SPACE:
...

REAL ASSETS:
...

TOTAL REAL SOURCE DURATION:
...

SOURCE SHOTS:
...

CHEAP MEASUREMENTS:
...

REAL SEMANTIC FRAMES:
requested / selected / valid cache hits / fresh embedded / total represented

FRESH REAL PROVIDER OPERATIONS:
...

CACHED REPEAT PROVIDER OPERATIONS:
...

FIRST REAL RUN RUNTIME:
...

CACHED REPEAT RUNTIME:
...

PEAK MEMORY / COMMIT:
...

CANDIDATES:
uncapped demand / before dedupe / retained / removed

COVERAGE BEFORE PRUNING:
...

COVERAGE AFTER PRUNING:
...

MAXIMUM UNCOVERED GAP AFTER PRUNING:
...

REAL SEMANTIC DEDUPE:
PASS / FAIL

FULL PROVENANCE:
PASS / FAIL

REAL EMBEDDING CACHE:
PASS / FAIL

AGGREGATE CACHE:
PASS / FAIL

REPEATABILITY:
PASS / FAIL

REGRESSIONS:
...

HUMAN REVIEW:
...

DOMAIN LIMITATIONS:
...

IMPLEMENTATION DEFECTS FOUND:
...

BLOCKERS:
...

FILES CHANGED:
...

COMMITS:
...

GIT / WORKSPACE STATUS:
...

DOCUMENTATION UPDATED:
...

---

# 23. FINAL RULING

Then output:

## RULING

Choose exactly ONE:

### A. PHASE 2 CLOSED — READY FOR PHASE 2.6

Use only if every mandatory closure gate passes.

### B. PHASE 2 IMPLEMENTATION DEFECT REMAINS

Use when real evidence reveals a code/contract/cache/provenance defect that remains unresolved.

### C. PHASE 2 STILL BLOCKED BY ENVIRONMENT CAPACITY

Use when the guarded real-footage model run cannot safely execute because current system capacity remains insufficient.

### D. PHASE 2 REAL-MODEL PATH WORKS BUT REAL-FOOTAGE VERIFICATION REMAINS INCOMPLETE

Use when the real model works but one or more required real-footage closure gates remain incomplete for reasons other than a known unresolved implementation defect or capacity blocker.

Do not choose A unless all mandatory real-model, real-footage, cache, aggregation, dedupe, provenance, review, repeatability and regression gates pass.

---

# 24. DOCUMENTATION UPDATE

Before finishing:

Update the repository's authoritative current-state documentation.

At minimum update:

`docs/CURRENT_PHASE.md`

and the appropriate dated verification section in:

`docs/footage-verification.md`

Preserve previous historical verification results.

Do not rewrite historical blocked runs as successes.

If Phase 2 closes:

`docs/CURRENT_PHASE.md`

must state clearly:

* Phase 2 final complete: YES
* Phase 2 closure date
* final model/revision
* final real-footage evidence summary
* Phase 2.6 authorized status remains dependent on explicit next instruction

Do not begin Phase 2.6 automatically.

---

# 25. STOP CONDITION

If the final ruling is:

`A. PHASE 2 CLOSED — READY FOR PHASE 2.6`

STOP.

Do not:

* install V-JEPA
* evaluate VideoPrism
* integrate DOVER
* build Creative Ranker
* implement Editorial Tokens
* build transition intelligence
* add music intelligence
* start reference-style modeling
* build a planner
* train anything

Those belong to a separate Phase 2.6 specification.

The purpose of this session is to leave Phase 2 with a clean, auditable, evidence-backed closure — nothing more.
