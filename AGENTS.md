# Creative Intelligence — Repository Instructions

## Mission

Creative Intelligence is an AI video-editing system intended to turn authorized real-world source footage into high-quality editable timelines.

The long-term system is not a single end-to-end model. It is expected to combine reusable pretrained perception with proprietary editorial decision intelligence.

Current development is evidence-driven and phase-gated.

Do not advance phases merely because code exists. A phase closes only when its explicit verification gates pass.

---

## Start-of-session protocol

Before making changes:

1. Read this `AGENTS.md`.
2. Read `docs/CURRENT_PHASE.md`.
3. Read every authoritative file referenced by `docs/CURRENT_PHASE.md`.
4. Inspect repository/worktree truth relevant to the requested task.
5. Distinguish:

   * proven repository state,
   * historical evidence,
   * assumptions,
   * missing evidence.

Repository artifacts and current executable evidence take precedence over stale conversation assumptions.

Do not rediscover already-proven work unless verification or regression requires it.

---

## Scope discipline

Work only on the requested phase/task.

Do not start a later phase without explicit authorization.

Do not introduce speculative architecture, refactors, models, dependencies or infrastructure merely because they may be useful later.

When a prompt identifies a frozen scope, treat anything outside it as out of scope.

---

## Evidence standard

Never convert:

* synthetic evidence into real-model evidence,
* cached evidence into fresh-inference evidence,
* schema validity into creative-quality evidence,
* preparation success into end-to-end success,
* heuristic metrics into calibrated probabilities,
* a test fixture into real-footage generalization.

Explicitly distinguish:

* synthetic/stub
* cached real-model
* fresh real-model
* real footage
* human-reviewed
* unverified

Claims must be traceable to commands, artifacts, tests, receipts or source state when possible.

---

## Creative Intelligence model rules

The current frozen Phase 2 semantic model is:

`google/siglip2-so400m-patch16-naflex`

Revision:

`cc24074f717b612951c2dead130904ab9b65a81e`

Device for the current verification path:

`CPU`

Observed real embedding dimension:

`1152`

Current real embedding space:

`space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687`

Do not silently:

* replace the model,
* change the revision,
* substitute a smaller checkpoint,
* alter preprocessing,
* reduce embedding dimensions,
* substitute stub embeddings for real verification,
* bypass memory/capacity guards.

Future models such as V-JEPA, PE, PE-AV, VideoPrism, DOVER, highlight models or proprietary Creative Rankers require their own approved evaluation phase.

---

## Memory and model safety

Large-model verification must honor repository capacity guards.

Never:

* bypass the guard,
* modify the Windows pagefile,
* change system memory settings,
* kill arbitrary user processes,
* reinterpret an unsafe preflight as a code failure.

If environment capacity is insufficient, stop the model operation and report the capacity condition.

---

## Source-media safety

Never modify authorized source-media bytes.

Preserve:

* source hashes,
* authorization provenance,
* asset identity,
* project/creator scope,
* source paths allowed by the repository contract.

Do not search unrelated user directories for footage.

Use only explicitly authorized media.

---

## Contract discipline

Frozen public contracts must remain frozen unless the task explicitly authorizes a contract change.

Prefer internal metadata or implementation changes over unnecessary public-contract changes.

If fresh evidence exposes an implementation defect:

1. identify the falsified assumption,
2. preserve failing evidence,
3. make the smallest valid correction,
4. add or strengthen a regression test,
5. rerun the affected gate,
6. record the resulting evidence.

No speculative cleanup while closing a verification gate.

---

## Testing

Run the smallest relevant tests during implementation.

Before declaring a phase complete, run every regression/gate required by that phase's authoritative specification.

Never hide:

* test failures,
* cache misses,
* provider calls,
* nondeterminism,
* reduced coverage,
* skipped verification,
* missing provenance.

If an existing result changes unexpectedly, investigate before updating expected values.

---

## Caching and provenance

Cache reuse is a first-class contract.

Model/cache identity must bind enough information to prevent incompatible embeddings from mixing, including model/revision/preprocessing/implementation identity where required by existing code.

Stub/synthetic embeddings must never contaminate real embedding spaces.

Preserve lineage from:

source asset
→ source range / shot
→ sampled frame
→ frame hash
→ measurements
→ embedding
→ aggregation
→ candidate
→ pruning/dedupe decision
→ final analysis artifact

Do not claim complete provenance when any required join remains missing.

---

## Git / workspace handling

First detect whether Git metadata actually exists.

If Git exists, record relevant branch/status/HEAD when required.

If this workspace has no Git metadata, do not treat that as an implementation defect and do not invent Git provenance.

Use the repository's existing source-hash, artifact and frozen-contract auditing mechanisms instead.

Never initialize Git solely to satisfy a verification prompt.

---

## Documentation

Historical verification evidence is append-only unless an existing repository convention explicitly says otherwise.

Do not rewrite earlier failures as if they never happened.

Update `docs/CURRENT_PHASE.md` when a phase materially changes state.

Phase-specific execution specifications belong under `docs/phases/`, not in this file.

Keep this file focused on stable rules.

---

## Architecture direction

Do not implement this direction unless the current phase explicitly authorizes it, but preserve the separation:

pretrained perception
→ editorial representation
→ proprietary Creative Ranker
→ transition intelligence
→ sequence planning
→ global edit evaluation
→ editable timeline
→ editor feedback / preference data

Open pretrained models are reusable perception components.

The intended proprietary moat is contextual editorial decision intelligence and the decision data generated by real editing behavior.

---

## Completion discipline

At the end of substantial work report:

* what was attempted,
* what changed,
* tests/gates run,
* evidence produced,
* unresolved blockers,
* exact phase status,
* whether the next phase is authorized.

Never start the next phase automatically.
