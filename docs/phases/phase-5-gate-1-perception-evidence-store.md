# Phase 5 Gate 1 - Perception Evidence Store

Date: 2026-09-22. Owner-review repair verified: 2026-09-23. Scope: bounded internal runtime substrate and synthetic verification only.

Status: **ACCEPTED.** Independent owner review passed after the bounded non-discoverability repair. The implementation is committed and pushed at `93d7ce9d27cd66be9c71389c9ad03ca134ce8fc5`. Gate 2 is separately authorized and is not part of this Gate-1 implementation.

## Baseline and authority

The verified starting state was branch `phase/5-edit-planner-v0`, HEAD `9e4aea433123eeae85aefc1318200220e1bf0789` (`docs: freeze creative intelligence architecture v1`), with an empty `git status --short`. WSL exposed Windows Node `v24.15.0`, npm `11.12.1`, TypeScript `5.9.3` and WSL Python `3.14.4`. No environment configuration was changed.

The normative authority is [Creative Intelligence Architecture v1](phase-5-gate-0-creative-intelligence-architecture-v1.md), especially sections 4, 7, 21-26 and 28. This gate implements only the Perception evidence substrate. It does not implement ProjectWorldModel, budget/model routing, Director logic, planning, EditGraph, execution, Critic logic or media analysis.

Repository inspection confirmed that current `EmbeddingVectorCache` and footage memoization can treat malformed cache data as a miss and then repair/recompute through an execution path. Those released paths remain unchanged. They are not represented as satisfying this Gate-1 pure lookup boundary.

`docs/CURRENT_PHASE.md` was stale about Gate 0 still awaiting owner review, while Git records the accepted architecture freeze at the requested HEAD. The current-status document is corrected here without rewriting the Gate-0 document's historical verification chronology.

## Implementation

`packages/perception/` adds an internal, provider-neutral, strict Zod boundary:

- `ComputationIdentity` binds the identity version, operation, ordered exact inputs, source bytes/size and source support, producer implementation, applicable adapter, model availability and exact learned-model revision evidence, preprocessing, semantic configuration, semantic execution settings, output schema/space and determinism policy.
- `PerceptionAttempt` keeps operational attempt IDs/timestamps and success/failure lineage outside request identity.
- `PerceptionOutputSelection` explicitly pins one successful attempt and immutable output. Selection is never inferred from write order.
- `PerceptionArtifactEntry` binds the validated identity/key, exact dependencies, accepted-output availability, all attempt references, producer lifecycle evidence and scoped access bindings.
- `PerceptionEvidenceStore` is an immutable in-memory index over explicitly supplied entries and artifacts. It performs lookup and integrity validation only. Its API has no compute, provider, decoder, network, repair or fallback callback. Its maps are true private class fields and it exposes no unscoped snapshot or index-enumeration API.
- `PerceptionReuseReceipt` labels consumption as reuse and explicitly records `modelRunCreated: false`; it is not a `ModelRun` or `CostEvent`.

The store copies constructor inputs and lookup outputs. Callers cannot mutate accepted evidence through returned objects. All schemas reject unknown fields and bound arrays are capped.

Large outputs remain behind `ArtifactRef`. Core entry metadata contains no raw video/audio, vector arrays, masks, decoder buffers, provider responses, credentials, paths or shell commands.

## Computation identity

The exact formula is:

```text
perception_computation_v1_
  + sha256(canonicalSerialize(ComputationIdentitySchema.parse(identity)))
```

This uses the repository's canonical finite-JSON convention and `contentId(...)`; it does not change historical identity formulas.

The key includes:

- identity version and operation kind;
- ordered source/artifact inputs;
- source asset ID, SHA-256, byte size and whole/range/frame/sample support;
- range/timebase or frame/sample identity where applicable;
- exact consumed artifact references;
- producer ID, implementation version and implementation SHA-256;
- adapter ID/version when applicable, otherwise explicit `not_applicable`;
- model ID/provider/exact revision and immutable revision evidence for learned computation;
- explicit model `not_applicable` for model-free deterministic tools;
- preprocessing version/configuration digest when applicable;
- semantic configuration digest;
- an exact semantic-execution-settings evidence reference, which must bind device, precision, quantization, kernels and other runtime settings whenever they affect compatibility;
- output artifact type/version and semantic space when applicable;
- determinism kind and exact policy evidence.

The key excludes operational attempt noise: wall-clock timestamps, job/attempt IDs, temporary locations, hostnames, log paths, cache counters, runtime duration and performance-only hardware observations. Those values belong to attempt evidence. Unknown semantic equivalence is not ignored; it requires a different settings/policy artifact and therefore a different key.

Request identity and output identity remain separate. Multiple stochastic attempts can share one request key and retain distinct output references. Deterministic attempts with more than one distinct successful output fail with `DETERMINISTIC_OUTPUT_CONFLICT`.

## Lookup semantics

| Result | Behavior |
| --- | --- |
| `cache_hit` | Requires exact identity/key, active producer, eligible exact project/creator/purpose binding, valid dependencies, valid attempt lineage, explicit selection and output byte/type/version integrity. Returns an immutable output reference and reuse receipt. |
| `cache_miss` | No discoverable exact accepted output exists. Absent and foreign/revoked/expired evidence return the identical `not_computed` / `no_exact_computation` payload and perform no work. |
| `incompatible` | Independently discoverable related same-operation evidence shares a source/artifact anchor but differs semantically. Mismatch paths are inspectable without approximate reuse. |
| `failed_artifact` | Failed attempt evidence stays addressable and is never returned as successful evidence. Retry is outside the store. |
| `stale_or_retired` | Historical producer evidence remains represented but is not automatically reusable. No licensing/security override exists. |
| `unavailable` | Explicit unavailable or not-applicable output state is preserved. |
| `unsupported` | Explicit unsupported state is preserved and remains distinct from a miss. |
| integrity failure | Missing dependency, conflicting reference, bad digest, malformed payload/envelope, invalid selection or deterministic output conflict throws `PerceptionIntegrityError`. It is not converted to a miss and is not repaired. |

Completed-empty payloads are valid present artifacts and remain distinct from `not_computed`. `failed`, `unavailable`, `unsupported` and `not_applicable` keep the existing tagged missingness semantics.

Content equality never grants access. Before exposing that exact or related evidence exists, lookup requires an independently eligible binding for the exact project, creator and purpose. Foreign, revoked and expired entries are non-discoverable: they behave exactly like absent entries, cannot contribute incompatibility details, and their artifacts are not resolved or integrity-checked. This is a supplied index boundary, not a global cross-creator discovery service or a complete authorization lifecycle implementation.

## Compatibility with existing caches and telemetry

`embeddingCacheKey()` remains `cache_460cf164bff50f3c70dbd7024b9d67f98f371f1cdb4212238368120b0638f44a` for the frozen test vector. `embeddingSpaceId()` remains `space_e8c156d238b0c3486c30df69e1069c4a720de57a45943cbb4bf5ae2d4a1c500b`. Phase 1-4 cache/source files were not modified.

No legacy adapter is added. A later adapter must expose legacy repair/recompute as separately authorized execution rather than hiding it behind Gate-1 lookup.

Public `CostEvent` and `ModelRun` schemas and implementations are unchanged. A cache hit creates neither. Actual attempt accounting remains authoritative outside this store.

## First-failure evidence and corrections

The first test-first command was `npm run typecheck` before `packages/perception/` existed. The expected result was an unresolved new internal module. The actual first failure was earlier in the test harness:

```text
tests/perception-evidence-store.test.ts(191,386): error TS1005: ',' expected.
```

Falsified assumption: the inline source-range mutation parsed as valid TypeScript. The smallest correction extracted and narrowed the source input/timebase before constructing the mutation. The next run reached the intended red condition:

```text
tests/perception-evidence-store.test.ts(16,8): error TS2307: Cannot find module '../packages/perception/index.js' or its corresponding type declarations.
tests/perception-evidence-store.test.ts(241,37): error TS7006: Parameter 'value' implicitly has an 'any' type.
```

The implicit-any error was downstream of the unresolved import. Exact local evidence is preserved in ignored `.local-runs/phase5-gate1/first-failure.md`.

The first focused runtime run passed 19/21 tests. Two failed assumptions were corrected in tests: different object IDs do not imply different exact payload bytes, so the second stochastic fixture now contains different bytes; and the strict entry schema correctly rejects an incompatible output type before lookup, so the assertion now expects schema rejection. No production boundary was weakened to satisfy either test.

### Later owner-review privacy repair - 2026-09-23

Independent owner review, before acceptance, found that exact access mismatch and unscoped related-entry discovery leaked cache existence through `incompatible`, `accessBinding`, producer/integrity evidence, or result-kind differences. The unscoped public `snapshot()` accessor also exposed the complete index. This finding is later repair evidence and does not alter the first-failure chronology above.

The pre-repair 29-test focused run passed 21 and failed 8. The failures proved that foreign/revoked/expired exact and related entries were discoverable, inaccessible corrupt payloads raised an integrity error, and `snapshot()` remained public. The falsified assumption was that access checks performed after discovery were sufficient. The smallest repair filters exact and related candidates by inline eligible project/creator/purpose bindings before any evidence is exposed or artifact resolved, uses one identical miss constructor for absent and non-discoverable entries, removes `snapshot()`, and stores the index in true private fields. The exact red evidence is preserved separately in ignored `.local-runs/phase5-gate1/owner-review-privacy-red.md`.

## Tests and verification

The 29 Gate-1 tests cover deterministic keys; semantic changes to producer/configuration/model revision/preprocessing/settings/source range/output schema; model-free deterministic tools; exact hits; pure misses; related incompatibility; failed/unavailable/unsupported distinctions; completed-empty missingness; lifecycle policy; exact-byte corruption; deterministic conflicts; stochastic attempts and explicit selection; immutability; scope/purpose; strict fields/IDs/digests/dependencies; preserved embedding formulas; protected bytes; request/output separation; independently reproduced key formula; forged keys; artifact type/version integrity; foreign exact/related non-discoverability; revoked/expired exact/related non-discoverability; inaccessible corruption; and removal of unscoped enumeration.

Verification completed in the specified WSL environment:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| focused Gate-1 test | 29 passed, zero failed/skipped |
| editorial common + reference core + footage core + Gate-1 | 74 passed, zero failed/skipped |
| `npm test` | 332 passed, zero failed/skipped, under `scripts/no-network.mjs` |
| `node.exe --import ./scripts/no-network.mjs scripts/audit-workspace.mjs` | PASS; final count recorded below |
| `git diff --check` | PASS; final changed-path and preservation audit recorded below |

No `npm run verify`, media integration suite or Python suite was run. Those commands include media/Python surfaces unnecessary for this gate. No model, provider, decoder, media processing or network operation ran.

## Preservation and final audit

The final protected-file and changed-path audit shows only the new internal perception module/test, this Gate-1 record and `docs/CURRENT_PHASE.md`. Public contracts, providers, existing editorial/footage/reference/audio source, generated schemas, historical fixtures, dependency manifests and locks remain byte-identical to HEAD.

### Dated final verification - 2026-09-23

- Final `npm run typecheck` and `npm run build`: PASS.
- Focused Gate-1 suite: 29 passed, zero failed/skipped. Relevant editorial/reference/footage/Gate-1 regressions: 74 passed, zero failed/skipped.
- Final `npm test`: 332 passed, zero failed/skipped; network guard active.
- Static no-network workspace audit: PASS for 59 application TypeScript files and the unchanged nine explicit local runtime adapters.
- `git diff --check`: PASS. Separate trailing-whitespace/final-LF checks for all five untracked new files: PASS.
- The Gate-1 implementation delta contains one modified tracked file, `docs/CURRENT_PHASE.md`, and five intended untracked files: this record, three `packages/perception/*.ts` files and `tests/perception-evidence-store.test.ts`. The owner-supplied untracked `gate1-full-review.txt` remains read-only and unchanged.
- Protected-path Git diff is empty for contracts, providers, existing editorial/reference/footage/audio source, schemas, frozen fixtures and manifests/locks.
- The 14 selected Gate-0 protected SHA-256 values all match, including six public contract sources, providers, protected Phase-4 token/matcher source, `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock` and the frozen digest fixture.
- `package.json`, `package-lock.json`, `pyproject.toml` and `uv.lock` retain their accepted hashes; no dependency was added.
- No schema or fixture was generated or changed. No source-media or historical evidence file was changed.
- No model, provider, decoder, media, Python, network, commit, push, merge or PR operation occurred.

## Limits and unresolved items

This is an in-memory index over explicitly supplied immutable artifacts. It is not a database, object store, global deduplicator, scheduler, cache migration, retry policy, retention/deletion service or production authorization service. It does not adapt current caches or run perception. Related-evidence discovery is bounded to the same operation with a shared exact source/artifact anchor. Producer registrations, durable atomic publication and full lifecycle services remain future work.

Gate-1 implementation has no unresolved code/test blocker after the final audit passes. Owner acceptance is complete. The accepted implementation is committed and pushed at `93d7ce9d27cd66be9c71389c9ad03ca134ce8fc5`. The next gate is **ProjectWorldModel-lite**; it is separately owner-authorized and has not started in this Gate-1 record.
