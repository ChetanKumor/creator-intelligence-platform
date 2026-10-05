# Phase 5 Gate 7 Batch 3E-B1A — Derived media provenance and canonical-ingest contract foundation

**Status (2026-10-05, §14).** 3E-B1A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW**. 3E-B1B (filesystem registry and adapter, FFmpeg
canonicalization): **NOT STARTED**. 3E-C: **NOT STARTED**. Gate 7: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.

Evidence: `.local-runs/phase5-gate7/batch3e-b1a-20261004/` (ignored). It holds numbered logs, receipts and the scratch instruments,
copied unchanged. B1A is contract and pure logic only:

- No FFmpeg or ffprobe process, owner media, model, network, canonical publication or new dependency.
- Every hash in the tests is a digest of a label, never of real bytes.
- The one real-shaped chain (B1A-PL02) is the accepted 3D structural fixture: opaque test bytes, a test embedding backend, and the
  accepted pure analyzer.

## 1. Baseline and authorization

- After `git fetch`, the local and remote `phase/5-gate7-3e-production-hardening` resolved to
  `86d2a100289587ce55cdf521a10a92a9312ab44b`, and `main` and `origin/main` to `4f85b559c7eff2c24e221011f3ee1dd1466a111d`. There were
  no tracked or staged changes, and the owner's untracked files were left alone (`00-baseline-identity.log`).
- Authorized production files: `packages/footage-analyzer/protocol.ts`, a new `packages/media-ingest/` (`canonical.ts`, `index.ts`), the
  pure contract `packages/edit-render/owner-media.ts`, and the generated interchange schemas that follow from them.
- B0 rulings D1-D15 apply, as given in the B1A prompt.

## 2. Owner rulings made during B1A

Each was raised before the affected bytes changed (`01-owner-rulings-and-determinations.md`, `11-…`, `13-…`).

1. **B96 import boundary: allow `media-ingest`.**
   - Accepted test B96 (`tests/edit-render.test.ts`) limits every `packages/edit-render` file to a fixed list of internal packages,
     and R01 SHA-pins that test file.
   - Ruling: add exactly `media-ingest` to B96's allowlist, and update R01's pin last, from the final bytes.
   - `owner-media.ts` then holds the one complete derived-declaration validator, and `CanonicalMediaDerivation` lives in media-ingest.
2. **D9: FootageAnalysis stays 1.0.0.**
   - `docs/contracts.md` rule 2 is met by the record that gains the alternatives: AuthorizedFootage gains the 1.1.0 forms.
   - Precedent: `b9068bc` (the Phase 2.6A acceptance repair) kept FootageAnalysis 1.0.0 when a nested `anyOf` alternative was added
     to it.
3. **D5 representation (self-found, §8.3): consent is a dedicated root field.**
   - D5 taken literally put `local_media_canonicalization` in the root's `allowedPurposes`. A concrete red showed that this consent
     then authorized world-model scopes labelled with it.
   - Ruling: the 1.1.0 root carries `canonicalizationConsent: "local_media_canonicalization"` in its own field. `allowedPurposes`
     keeps exactly the 1.0.0 vocabulary in every form.

D4 needed no ruling. Repository semantics make `authorizationBasis` the rights basis: "according to the actual authorization",
`docs/reference-analyzer.md:35`. `sourceType` carries the byte origin. Inheriting the root's basis is therefore consistent, and there
was no `3E_B1A_AUTHORIZATION_BASIS_CONFLICT`.

## 3. AuthorizedFootage 1.1.0 (`packages/footage-analyzer/protocol.ts`)

`FootageAuthorizationSchema` is the union of three forms. Each form is identified by `schemaVersion` and `sourceType`.

| form | version | sourceType | purposes | consent | lineage |
|---|---|---|---|---|---|
| 1.0.0, exactly as accepted (`FootageAuthorizationV1Schema`) | 1.0.0 | `synthetic` / `owner_supplied` | analysis, evaluation | none | none |
| root | 1.1.0 | `owner_supplied` | analysis, evaluation | `canonicalizationConsent` required | none |
| derived | 1.1.0 | `system_canonicalized` | a subset of its root's | none (strict) | `derivedFrom { rootAuthorization, derivationId, recipeId }` |

- **1.0.0 is unchanged.**
  - The definition is the accepted one, renamed only.
  - Every accepted 1.0.0 record parses to exactly itself (B1A-01).
  - 1.0.0 rejects `system_canonicalized`, the consent (as a purpose or a field) and any lineage (B1A-02..04).
  - The shared `AuthorizedReference` contract is untouched.
- **Root.**
  - Owner-supplied media with an owner rights basis and the owner's explicit consent to local canonicalization.
  - An owner who does not consent keeps using 1.0.0. A 1.1.0 root without the consent field is not an authorization.
- **Derived.** Every rule below is enforced by the derived schema itself:
  - bytes distinct from the root;
  - exactly the root's rights basis, creator and project;
  - never dated before the root;
  - purposes a subset of the root's;
  - no consent field;
  - its root is a root form, so depth is exactly one;
  - a synthetic root cannot exist in 1.1.0, so no real derived record can come from one.
- **Consumers are unchanged.** World model, editorial resolver, analyzer and admission branch only on `sourceType === "synthetic"`. A
  derived record therefore maps to `creator_upload` / `real_footage`, as D7 requires.

## 4. CanonicalMediaDerivation (`packages/media-ingest/canonical.ts`)

A versioned internal record (`CanonicalMediaDerivation` 0.1.0, `internal_pre_stable`). It binds the following:

- **Source:** asset, content hash, size, and the full 1.1.0 root authorization.
- **Classification:** the exact N1 result: reason, assumption `unspecified_sample_aspect_ratio_is_square_pixel_v1`, the digest of the
  classified probe and facts, and the video and audio facts.
- **Recipe:** one of the bounded `CANONICAL_RECIPES`. There is exactly one: `canonical_n1_square_sample_aspect` 0.1.0, with its
  parameters, its `semanticsDigest` (over `N1_SEMANTICS`) and its `argvTemplateDigest` (over `N1_ARGV_TEMPLATE`, by the renderer's
  `argvDigestOf` convention).
- **Toolchain:** the canonicalizer's identity and digest, the pinned FFmpeg and ffprobe SHA-256, sizes and versions, the pinned runtime
  identity and the render environment. Anything else is refused.
- **Output:** asset, hash, size, the output probe digest, and the verification facts B1 requires:
  - the output classifies DIRECT with a 1:1 SAR;
  - it has the same frame count and frame-time table;
  - its decoded frames have the same digest;
  - its audio is either absent or stream-copied with the same samples and packet digest.
- **Scope:** the root's creator and project.

**Two identities.**

- The **computation identity** is known before execution. It is `contentId("canonical_media_computation_v0", { source bytes identity,
  recipe, toolchain })`. Nothing else can enter it: no time, path, temporary name, attempt, user, scope or random value (B1A-D02 and
  B1A-H17).
- The **derivation identity** describes the completed, verified result. It binds every recorded field, including the computation, the
  output and the scope.
- The record holds no path separator and no instant other than the root authorization's own `dateAdded` (B1A-D03).

**Builders.**

- `buildCanonicalMediaDerivation` accepts only these inputs:
  - an N1 source;
  - an output that classifies DIRECT with identical video and audio facts;
  - equal decoded-frame digests;
  - audio copied exactly when the source has audio (B1A-D04).
- `buildCanonicalDerivedAuthorization` builds the derived 1.1.0 record from a valid derivation only (B1A-D07).

**The argv template is declared, not executed.** It follows the renderer's fd-only conventions: copy streams, set the H.264 SAR with
`h264_metadata`, strip metadata, mux bitexact MP4, no filter, no re-encode. B1B executes it under the pinned FFmpeg. Any change is a
new recipe version.

## 5. Pure N1 classification

`classifyCanonicalIngest({ probe, facts })` is total and deterministic, and returns exactly DIRECT, NORMALIZE_N1 or REFUSE.

- **The probe.** It is the renderer's own strict vocabulary. It is re-validated through the unchanged `parseProbeJson`, and
  `canonicalSerialize` first refuses non-JSON, accessors and cycles.
- **The facts.** These are what the renderer's probe does not carry: field order, colour transfer and colour primaries, as a strict
  record.
- **Order.** Checks run as follows:
  - evidence;
  - stream layout, read by the renderer's evaluator;
  - geometry (at most 16,384);
  - frame rate: declared, 1-120 fps, numerator at most 120,000, denominator at most 1,001;
  - frame count (at most 72,000) and duration (at most 600 s), the accepted analysis bounds;
  - audio parameters (mono or stereo, a declared rate, more than 0 samples);
  - the **unchanged** `evaluateInputConformance`;
  - the SAR;
  - the square-pixel counterfactual;
  - the N1-only conditions.
- **DIRECT** is exactly the accepted renderer rule on the source's own geometry, grid and audio.
- **NORMALIZE_N1** requires all of the following:
  - the SAR is absent;
  - the renderer refuses the unchanged probe;
  - the renderer **admits the same probe with only an explicit 1:1 SAR**, so the SAR is proved to be the only renderer blocker;
  - no stream or frame side data;
  - progressive scan;
  - SDR transfer and primaries (BT.709, BT.601 and sRGB families, or unspecified).
- **REFUSE** carries a reason, a basis (`invalid_input`, `deferred_to_b2` or `outside_b1_bounds`), the renderer's reason for the
  source and its square-pixel counterfactual, and the evidence digest. Malformed evidence never throws.
- **Covered by B1A-15..27 and N01..N03:** explicit 1:1 (DIRECT), unspecified SAR (N1), explicit non-square and malformed SAR,
  rotation, mirror and every display matrix, stereo, spherical and HDR side data, VFR, an off-grid frame or a non-zero start, HEVC,
  10-bit and non-yuv420p, interlaced or unknown field order, extra streams or containers, nonconforming audio, zero and malformed
  probes, out-of-bounds rate, count, duration and geometry, HDR or wide-gamut colour, determinism, and non-mutation.

## 6. The pure owner-media contract (`packages/edit-render/owner-media.ts`)

The local adapter is unchanged, and so are `OWNER_MEDIA_AUTHORITY`, the permit binding literal, `authorize.ts`, `records.ts` and
`probe.ts`.

- **The original path accepts exactly what it accepted before** (B1A-O01..O03).
  - Under the widened shared union, `OwnerMediaRegistrationSchema` (0.1.0), `ownerMediaDeclarations` and `checkOwnerMediaProvenance` now
    read AuthorizedFootage 1.0.0 explicitly.
  - Their accepted set, refusal codes and messages are those of the baseline. The 0.1.0 digest (`18fcc06d…`) and the authority digest
    (`e154b615…`) are frozen from the unmodified build.
  - The 0.1.0 declaration rules moved into one helper, which both versions share.
- **OwnerMediaRegistration 0.2.0** declares originals (1.0.0 or 1.1.0 root) and canonical derivatives. A derivative names no location:
  the canonical store (B1B, `.local-media/canonical-v0/`) is content-addressed. A derivative is refused unless all of these hold:
  - it is declared beside its root (B1A-28);
  - its lineage root deep-equals the declared root's authorization (B1A-29);
  - the derivation's source is exactly the root's bytes, asset and authorization (B1A-30);
  - its output is exactly the derivative's bytes and asset (B1A-31);
  - both identities recompute, and the lineage names exactly that derivation and recipe (B1A-32);
  - the recipe and toolchain are registered and pinned (B1A-33, B1A-34);
  - creator, project and basis equal the root's and the set's (B1A-35);
  - the root carries the consent (B1A-36);
  - depth is one, and a root is never a derivative (B1A-37);
  - every entry identity is distinct, there is at most one derivative per root and recipe, and no hash is declared twice;
  - the authorization is truly derived: an owner_supplied relabelling is refused (B1A-14, B1A-38).
- **Render authorization variants.**
  - `OwnerRenderAuthorizationSchema`, the original statement, is unchanged and never covers a derivative.
  - The additive `OwnerCanonicalRenderAuthorizationSchema` states `owner_authorizes_local_render_of_exactly_the_declared_sources_and_their_declared_verified_canonical_derivatives_v0`.
    It is required whenever a derivative is declared, and it covers only declared originals and declared, lineage-verified derivatives.
  - `ownerMediaCanonicalDeclarations` returns that render scope. It reads a 0.1.0 registration exactly as `ownerMediaDeclarations`
    does (B1A-R01..R04).
- **Two provenance kinds.** `ownerMediaProvenanceKindOf` gives:
  - ORIGINAL: `creator_upload` with an owner-supplied 1.0.0 or 1.1.0 root authorization;
  - DERIVED: `creator_upload` with a `system_canonicalized` authorization that names its root and derivation;
  - a refusal for everything else (B1A-K01..K03).
  - `OwnerMediaProvenanceSchema`, the record inside the unchanged observation, is not widened.
- **Lifecycle.** `effectiveDerivedLifecycle(root, derived)` returns the earliest deletion request and the earliest expiry.
  - It returns the observation's lifecycle shape, so the adapter in B1B applies its trusted clock to it.
  - It is pure and clock-free. It is total over all 81 null, early and late combinations, and strict about its inputs (B1A-39..44).
  - A derivative never outlives its root.

## 7. Generated interchange schemas

`npm run schemas:generate` (`19-schemas-generate.log`) changed exactly two files.

- `AuthorizedFootage.schema.json` → `7d234ec0…`. It is now `anyOf [1.0.0, root, derived]`.
- `FootageAnalysis.schema.json` → `90039407…`. Its `authorization` is the same `anyOf`, and `artifactVersion` stays `1.0.0`.

B1A-01 checks what the change preserved:

- the first form of both files hashes to the frozen 1.0.0 structure (`38ed16e2…`);
- FootageAnalysis outside `authorization` hashes to its frozen baseline (`09249ab1…`).

`AuthorizedFootageSet` (its `authorization` is `unknown`), `AuthorizedReference` and every other interchange schema, every `schemas/v1`
file and every fixture are byte-identical.

The exporter gives every interchange schema the fixed `$id` suffix `:1.0.0`, an interchange-namespace convention: FootageConfig is
`analyzerVersion` 0.2.0 under the same suffix. The `AuthorizedFootage` `$id` therefore still ends in `:1.0.0` while it lists the 1.1.0
forms. The exporter was not changed.

## 8. RED/GREEN history

1. **Baseline** (unmodified bytes):
   - footage and authorization 240/240, render pins 96/96, 2A runtime 339/339 (`03-baseline-*`);
   - 3D owner-media 23/24 under the 8.3 `TEMP` alias: 3D-L01, an environmental failure, preserved;
   - 3D owner-media 24/24 under the owner-ruled long-form `TEMP` (`03b-…`).
2. **First RED** (`05`-`07`). The production bytes were the baseline plus an empty media-ingest skeleton (`export {};`):
   - 84 tests: 8 pass, exactly the designed invariants B1A-01..04, O01..O03 and P01;
   - 76 fail on absent behaviour.
3. **Self-found defect: the purpose label** (`10`-`13`).
   - With consent as an allowed purpose, the world model's `linkEditorialToken` **authorized** the scope purpose
     `local_media_canonicalization` over a 1.1.0 root chain. The 1.0.0 control refused it.
   - Regressions B1A-PL01 (property) and PL02 (end to end, whichever consenting representation the schema accepts) were written
     first. Both were RED on the unrepaired bytes (2/2 fail).
   - The owner ruled the dedicated field. Repair: in `protocol.ts` the root keeps the 1.0.0 purposes and requires
     `canonicalizationConsent`. `canonical.ts` and `owner-media.ts` read the field. GREEN.
4. **Test-only corrections** (no production change):
   - B1A-27 called `refused()` on a valid N1 probe (`09`).
   - B1A-27 passed an explicit `undefined` through a default parameter (`15`).
   - Two hostile assertions were added after GREEN, for rules that existed from the first implementation: a derivative reusing an
     original's entry identity, and a second derivative per root and recipe.
5. **Final RED on the final test bytes.** The tree is `git archive HEAD` plus the empty skeleton plus only the new test files,
   compiled under `.test-artifacts/`:
   - First (`20`-`21`): 86 tests, 8 pass (the same invariants), 78 fail.
   - B1A-A01 (§10) was then added, so it was repeated (`28`-`29`): 87 tests, 8 pass, 79 fail.
   - It was repeated once more on the final bytes (`37`-`38`), after a hostile path literal in B1A-H16 was changed to a neutral
     synthetic path: 87 tests, 8 pass, 79 fail.
   - Every failure is absent behaviour (`38-final3-red-baseline-reasons.json`): 66 absent exports, 9 positive controls that need 1.1.0,
     and PL01, PL02, D05 and R01, which assert behaviour the baseline lacks.

## 9. Protected test edits (owner ruling 1)

- `tests/edit-render.test.ts` B96: the allowlist gains exactly one alternative, `|media-ingest`.
  - `18-b96-allowlist-red-green.json` shows the change is necessary and sufficient. The accepted allowlist refuses exactly
    `packages/edit-render/owner-media.ts: ../media-ingest/canonical.js`, and the new one refuses nothing.
  - B96's purity scan is extended to media-ingest by B1A-P01.
- `tests/edit-review.test.ts` R01: the pin of `tests/edit-render.test.ts` changes from `9f3ee736…` to `a8848d03…`, updated last.
- A sweep of every `[path, sha256]` pin in `tests/` found 135 pins and 0 stale.

## 10. Results

The final production bytes were built in `22-final-build.log`. The same production bytes were rebuilt after test-only changes, in
`27-final2-build.log` and `36-final3-build.log`. Every suite ran under `scripts/no-network.mjs`, with concurrency 2 and the long-form
`TEMP`.

| gate | result | baseline (86d2a10) | evidence |
|---|---|---|---|
| B1A pure: `media-ingest` and `owner-media-derived` | **87/87 PASS** | — (the B1A tests are new; see the RED rows) | `39-final3-b1a.log` |
| First RED (baseline plus an empty skeleton) | 84: 8 invariants pass, 76 fail on absent behaviour | — | `06`, `07` |
| Final RED (final test bytes on a `git archive HEAD` tree) | 87: 8 invariants pass, 79 fail on absent behaviour | — | `37`, `38` |
| Purpose-label regressions PL01 and PL02 on the unrepaired bytes | 2/2 fail (RED); PASS after the ruling | — | `12`, `13`, `39` |
| Mutation check: one B1A rule removed per mutant | **17/17 killed**, on the final build and again earlier (`31`) | — | `40` |
| Footage authorization, analyzer contracts and consumers (12 files, below) | **240/240 PASS** | 240/240 | `23-final-footage.log` |
| 3D owner-media (`edit-real-footage`, `-lifecycle`, `-harness`, `-r02`) | **24/24 PASS** | 24/24 (long-form `TEMP`) | `23-final-owner3d.log` |
| Render pins (`edit-render` with B96, `edit-review` with R01, `edit-render-audit`) | **96/96 PASS** | 96/96 | `23-final-renderpins.log` |
| 2A runtime, execution, graph and repair (with the closure test 103) | **339/339 PASS** | 339/339 | `23-final-runtime2a.log` |
| 3E-A (`edit-editorial-validation` A01-A15 and parity) and 3C pure | **54/54 PASS** | 3E-A record: 16/16 and 38/38 | `23-final-editorial3e.log` |
| typecheck | PASS | | `41` (also `32`) |
| build | PASS | PASS | `36` (also `22`, `27`) |
| schema generation and check | 2 files changed; 33/33 verified | | `19`, `42` (also `25`, `33`) |
| workspace audit | PASS: 130 application files (+2), 17 adapters | 128 and 17 | `43` (also `24`, `34`) |
| `git diff --check` | PASS; new files are LF, with no trailing whitespace | | `44` (also `26`, `35`) |

- The 12 footage files: `footage-core`, `footage-local`, `reference-core` (including the frozen Phase-0 digests), the TransNetV2
  footage contract and application, `contracts`, `serialization`, `workspace-boundary`, `world-model`, `editorial-matcher`,
  `editorial-reference-ranking` and `planning`.
- The full safe suite, `npm run verify`, the media suites and Python were **not run**. The prompt asks for focused gates. B1A touches no
  media, process, model or Python code.
- **B1A-A01** (FootageAnalysis stays exact-content-bound for every authorization form) was added after the first final run
  (`23-final-b1a.log`, 86/86). It is included in the final RED (`38`) and the final GREEN (`39`). The other final suites (`23-final-*`)
  ran on identical production bytes; only B1A test files changed after them.
- **The mutation check** (`40-mutants-final3.mjs`) transpiles each mutated source into a private copy of the final `dist/` under
  `.test-artifacts/`. Each of these removals was caught by at least one named test:
  - the 1.0.0 pin of the original check, and the 1.0.0 reader of the 0.1.0 registration;
  - root-authorization equality;
  - the derivative entry-identity rule, and the one-derivative-per-recipe rule;
  - the derived-capable statement requirement;
  - root expiry, and root deletion, in the lifecycle;
  - the derived purpose subset, and derived basis equality;
  - consent moved back into the purposes;
  - the computation-identity check;
  - recipe membership, and the toolchain pin;
  - the square-pixel counterfactual;
  - the N1 side-data rule;
  - decoded-frame equality.

## 11. What did not change

`git diff` against `86d2a10` changes only the files listed in §13. Unchanged:

- `AuthorizedReference` and the reference analyzer; `MediaAsset` and `packages/contracts`;
- the world model, admission (`packages/edit-execution`), `packages/edit-runtime`, `edit-graph`, `edit-editorial` and `planning`;
- `probe.ts`, `authorize.ts`, `records.ts`, `semantics.ts` and `index.ts` of edit-render;
- every script and adapter, including `scripts/edit-render-owner-media-authority-local.ts`, `scripts/edit-render-local.ts`,
  `scripts/audit-workspace.mjs` and `scripts/export-schemas.ts`;
- `tests/edit-render-audit.test.ts` and every 3D test;
- `python/`, `package.json`, `package-lock.json`, `tsconfig.json` and `.gitignore`.

Consequently:

- The owner-media authority descriptor, its eligibility literal, the permit binding literal and the observation record are
  byte-identical.
- No adapter can register, observe or render a derivative in B1A.
- `scripts/media-ingest-local.ts` does not exist.

## 12. Known limitations after B1A

- **Nothing is executed.** There is no canonical byte, FFmpeg run, probe of owner media or canonical store. The N1 argv template and
  the verification digest methods are declared and unexecuted. B1B must run them and may revise them under a new recipe version.
- **Probe-to-bytes binding is B1B's.** The classification binds the digest of the probe and facts it classified, and the derivation
  binds its output probe digest. Pure code cannot prove that those probes were taken from the exact source and output bytes.
- **DIRECT inherits the renderer rule exactly** (B1A-N02). That rule reads only the angle of display-matrix side data, so a 1:1 source
  whose display matrix reports 0° (for example a vertical flip) is DIRECT. N1 refuses any side data. Not verified on media; a
  candidate for B2.
- **Purpose-label consumers.** World-model, planning and perception gates still accept any free-form scope purpose present in
  `allowedPurposes`. B1A removes the consent from that vocabulary (PL01, PL02) and changes no gate.
- **The interchange `$id`** of `AuthorizedFootage` keeps the exporter's `:1.0.0` suffix (§7).
- **Docs not updated here.** `docs/footage-analyzer.md` still documents only the 1.0.0 authorization; it was outside B1A's authorized
  documentation.
- **Open from earlier batches.** Real-owner-footage revision 1 → 2 freshness (3E-C), distinct physical multi-source execution, broad
  ingest, SAR normalization on media, VFR normalization and professional editing quality are **NOT VERIFIED / NOT IMPLEMENTED**.

**Protected changes B1B still requires** (none is made or authorized here):

- **Owner-media adapter** (`scripts/edit-render-owner-media-authority-local.ts`): read registrations through
  `ownerMediaCanonicalDeclarations`. Register a derivative only after its root. Resolve derivative bytes in the content-addressed store
  `.local-media/canonical-v0/` and re-verify them in full. Answer a derivative's lifecycle with `effectiveDerivedLifecycle`, so a root
  deletion or expiry invalidates the derivative.
- **The authority's descriptor** (`OWNER_MEDIA_AUTHORITY`): the eligibility string changes and with it the digest. 3D-R01 asserts the
  current literal, and B1A-O01 freezes the digest.
- **The observation's provenance** (`OwnerMediaProvenanceSchema` inside `OwnerMediaLifecycleObservationSchema`): it must carry the
  derived kind.
- **The permit** (`authorize.ts`): recompute provenance with `ownerMediaProvenanceKindOf` instead of the 1.0.0-only check. The binding
  literal stays one.
- **A new media-ingest adapter** (`scripts/media-ingest-local.ts`): pinned ffprobe and FFmpeg under the declared N1 template, the
  verification digests, and canonical publication. This means a new `strict_spawn` registration in `scripts/audit-workspace.mjs`, which
  also changes B2B-A1's "17 adapters" literal.
- **Probe-to-bytes binding:** classify only probes taken through the verified handle of the exact source and output.
- **The edit-render index** (R01-pinned): export the derived-capable names only if B1B needs them there.

## 13. Files

| file | change | SHA-256 |
|---|---|---|
| `packages/footage-analyzer/protocol.ts` | AuthorizedFootage 1.0.0 kept exactly; 1.1.0 root and derived forms; union | `c16bee57b8b671e233b9afb149bb85415769f6ae8d1d410df45c7c468f7baf7d` |
| `packages/media-ingest/canonical.ts` | new: classifier, recipes, toolchain, CanonicalMediaDerivation, builders | `f7b2cae9410625c426bd579ae43d93228eb0adbd053459221ba14320d8cc0332` |
| `packages/media-ingest/index.ts` | new: explicit named exports | `d12974a3e2ed5c0749e1882a327d5543dff8d2aca4f488f506ef8f42463a9374` |
| `packages/edit-render/owner-media.ts` | original path pinned to 1.0.0; 0.2.0 derived declarations, render variant, provenance kinds, lifecycle | `5074b2467ec67258826a819e2cd007d610cb870534dc428b1c379a25e1ef1313` |
| `schemas/interchange/AuthorizedFootage.schema.json` | regenerated | `7d234ec046f823891e9f1bddc55e99070ce37999138012f9e061cc5b390c6933` |
| `schemas/interchange/FootageAnalysis.schema.json` | regenerated | `90039407505bc1a5b98caf3d17f4f6a1ad30696f7eb68982716d065553526ab7` |
| `tests/media-ingest.test.ts` | new: Parts 1-3, derivation, purpose regressions, purity | `e62275c287bd27515cb9e449aa9b17d3e5b09aee54f542ebf055dbc3b53bbaf3` |
| `tests/owner-media-derived.test.ts` | new: Part 4, lifecycle, render variants, provenance kinds, hostile corpus | `b4d411e2c360d16459761a2334c0c4e027cfe8b2ccd739fe2b8d5d6cddd07cfb` |
| `tests/support/canonical-media.ts` | new: pure fixtures | `6c838e6abc235c4ef2213c9bfb6a0f2fcebacf60bb587a9e03a2db3be7b355ac` |
| `tests/edit-render.test.ts` | protected: B96 allowlist `+media-ingest` | `a8848d039e1f5d15deb00024f43219c9304552dfc88f916c13038c9bf5fe172a` |
| `tests/edit-review.test.ts` | protected: R01 pin of `tests/edit-render.test.ts` | `3b26142ff711d584139d53e78fcbac3fd0d46e3b103ec86bf2ec31790383cd71` |
| this record and `docs/CURRENT_PHASE.md` | documentation | not hashed into themselves |

No dependency, lockfile, configuration, script, adapter or accepted production byte outside this table changed.

## 14. Status

3E-B1A: **IMPLEMENTED — PUSHED FOR OWNER REVIEW** (commit `feat(gate7): add canonical media provenance foundation` on
`phase/5-gate7-3e-production-hardening`; `main` not modified).

3E-B1B: **NOT STARTED** (not authorized by this batch). Gate 7 overall: **NOT YET COMPLETE**. Phase 6: **NOT STARTED**.
