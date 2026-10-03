# Phase 5 Gate 7 Batch 3D — Real-footage end-to-end acceptance

Batch 3D: **CODE COMPLETE / HARNESS READY — PENDING THE OWNER-LOCAL REAL-FOOTAGE RUN** (2026-09-30 to 2026-10-03, cloud session).

- The owner's ruling of 2026-09-30 (§9) authorized the smallest bounded protected change for the 3D-R01 gap. §10 adds an owner-local
  real-media lifecycle authority to the existing Batch-2B trusted execution boundary, beside the unchanged synthetic-fixture authority.
- 3D-R01 is now a permanent regression: RED on the pre-3D accepted bytes, GREEN after the change (§11). Twelve hostile lifecycle tests
  and four mutation checks cover the new authority (§12). The mismatched-DAG note is deferred, with its reason (§13).
- The owner-run real-footage harness is implemented (§14): a strict run manifest, admissibility checks, the owner-scoped chain, the
  runner and one bounded receipt. Its pure parts are tested in the cloud (§15).
- The cloud has no owner footage, pinned Windows FFmpeg or model cache. Nothing here is real-footage, real-render, real-model or
  editing-quality evidence.
- Architecture V2 remains **FROZEN**. Gate 7 is **NOT YET COMPLETE**.

§1-§8 below are the historical stop record of 2026-09-29, preserved unchanged. Its opening paragraph was:

> Batch 3D: **STOPPED — PROTECTED_CHANGE_OUTSIDE_3D_AUTHORIZATION** (2026-09-29, cloud session). The 3D real-footage harness was **not
> implemented**, because inspection found that the accepted trusted execution boundary cannot execute non-synthetic media without a
> protected Batch-2B change, which the Batch-3D authorization does not grant. This record preserves the evidence and names the smallest
> next owner decision. No accepted source, test, contract, schema, dependency or lockfile byte changed. Architecture V2 remains
> **FROZEN**. Gate 7 is **NOT YET COMPLETE**.

## 1. Baseline

- Remote `main` resolved to exactly `da9a73da5d349a6bd71678e65d4e079415043754` ("feat(editorial): complete Gate 7 Batch 3C conversational
  revision"), by `git fetch` and `git ls-remote`. `phase/5-edit-planner-v0` resolved to the same SHA.
- The remote branch `phase/5-gate7-3d-real-footage` already existed at that same SHA. The local branch was created from the exact
  verified SHA. `main` and `phase/5-edit-planner-v0` were not modified.
- Authorities read before inspection: `AGENTS.md`, `docs/CURRENT_PHASE.md`, and the Batch 2B, 3A, 3A-F, 3B and 3C records. The code
  inspected is listed in §3 and §4.

## 2. Cloud environment and baseline gates (unmodified accepted bytes)

The container's default Node was v22.22.2, outside the `engines` range, and was used for no gate. Node **v24.15.0** / npm **11.12.1**,
the owner's recorded versions, were installed with the container's nvm. `npm ci` installed the four locked packages; `package.json`
and `package-lock.json` are unchanged. Before this record was committed, the only network operations were the baseline Git reads and those
two toolchain installs. nvm's version listing also tried `iojs.org`, which the egress policy refused (403). Every test ran under
`scripts/no-network.mjs`.

| Gate | Command | Result |
|---|---|---|
| typecheck | `npm run typecheck` | PASS (exit 0) |
| build | `npm run build` | PASS (exit 0) |
| full safe suite | `node --import ./scripts/no-network.mjs --test --test-concurrency=1 dist/tests/*.test.js` | PASS: 1054/1054; 0 fail, cancelled, skipped or todo; 1624.6 s; exit 0 |
| workspace audit | `npm run audit:workspace` | PASS: 127 application files, 16 adapters |
| diff check | `git diff --check` | PASS (no output) |
| generated schemas (part of `verify`) | `node dist/scripts/export-schemas.js --check` | PASS: 33 artifacts, no drift |
| synthetic demo (part of `verify`) | `node --import ./scripts/no-network.mjs dist/samples/demo.js` | PASS (exit 0) |
| actual-media suites | `npm run test:media` | ENVIRONMENT_UNAVAILABLE_FOR_THIS_CHECK: `.tools/` (pinned Windows FFmpeg 9.0.1) is absent, and the render environment is `local_win32_x64` |
| Python suite | `npm run test:python` | ENVIRONMENT_UNAVAILABLE_FOR_THIS_CHECK: the owner's Windows `.venv` is absent |
| `npm run verify` | composite | ENVIRONMENT_UNAVAILABLE_FOR_THIS_CHECK as a whole: its media and Python steps cannot run here; every other step is a row above |

No substitute FFmpeg, runtime, model, venv or media was downloaded, generated or used.

The full-safe count equals the owner-accepted Batch-3C count (1054). `dist/` was built before the RED test file existed, and that
file, present in `tests/` for part of the run, was never compiled into `dist/` and is not in the count. Log SHA-256 (container-local, ignored):
`.local-runs/phase5-gate7/batch3d-baseline-full-safe.log` `3d15a9a9ec0bff1399d10bee7517a63ee8678b6eac71a11bea44597704661018`.

## 3. Finding: explicitly authorized real media cannot reach the accepted trusted execution boundary

### Exact behaviour

Every real render runs through `issueExecutablePermit` (`scripts/edit-render-local.ts:419`). A permit requires one post-claim,
post-stage lifecycle observation per admitted source:

- The observation must be a live `TrustedLifecycleObservation` handle (`scripts/edit-render-local.ts:424`). Its constructor needs a
  module-private symbol, so only `SyntheticFixtureLifecycleAuthority.observe` can mint one.
- `observe` answers only when the admitted MediaAsset has `origin === "synthetic"` and the analysis authorization is `synthetic` /
  `synthetic_generated`. Otherwise it throws `lifecycle_authority_scope_invalid` (`scripts/edit-render-fixture-authority-local.ts:130-132`).
- The pure binder parses lifecycle evidence only as `FixtureLifecycleObservation` (`packages/edit-render/authorize.ts:35,127`). That
  record requires `authorityScope: "synthetic_fixture_assets_only_v0"` and the fixture registry's implementation digest
  (`packages/edit-render/records.ts:231,235`).
- Every `ExecutablePermitBinding` states `lifecycleAuthority: "synthetic_fixture_registry_only_not_production_v0"`, and the schema admits
  no other value (`packages/edit-render/authorize.ts:55,185`). The execution-start and receipt builders re-parse the binding with that
  schema (`packages/edit-render/receipts.ts:181,405`).

Real footage cannot be relabelled to pass. The public contract gives real media the origin `creator_upload`, and the world model binds
`owner_supplied` analysis to `creator_upload` origin (`packages/world-model/index.ts:436`). The token resolver requires
`cached_real_model` provenance with `real_footage` media basis for non-synthetic analysis (`packages/editorial/resolve.ts:133-134`).
Registering owner footage with the fixture authority would therefore mean labelling real footage `synthetic`, which is fake evidence.

### Violated assumption and accepted invariant

- **3D assumption falsified.** "The accepted Gate 7 architecture, through existing media/runtime authority, can execute explicitly
  owner-authorized real media bytes."
- **Accepted invariant that blocks it** (Batch 2B, OWNER-ACCEPTED). `SyntheticFixtureLifecycleAuthority` is "the sole, current
  lifecycle authority". It "answers only for admitted assets whose MediaAsset origin is synthetic and whose analysis authorization is
  `synthetic_generated`, so it can never answer for a customer or user asset". Every binding says
  `synthetic_fixture_registry_only_not_production_v0` (Batch-2B record lines 233-246). "Production user-media lifecycle authority:
  **NOT VERIFIED**" (lines 12, 900-901).

### Failing evidence: first meaningful RED

`3D-R01` is a pure test over the unmodified accepted bytes. It failed on the missing real-media lifecycle contract, not on setup:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { MediaAssetSchema } from "../packages/contracts/common.js";
import { EditRenderError, ExecutablePermitBindingSchema, FIXTURE_AUTHORITY, FixtureLifecycleObservationSchema } from "../packages/edit-render/index.js";
import { TrustedLifecycleObservation } from "../scripts/edit-render-fixture-authority-local.js";

test("3D-R01 the trusted execution boundary can carry post-stage lifecycle evidence for an owner-authorized real source", () => {
  const realOrigins = MediaAssetSchema.shape.origin.options.filter(origin => origin !== "synthetic");
  assert.deepEqual(realOrigins, ["creator_upload"], "the public MediaAsset contract names exactly one real-media origin");
  // No caller can mint lifecycle evidence for the permit: only the synthetic-fixture authority's own query constructs the handle.
  assert.throws(() => new TrustedLifecycleObservation(Symbol("batch3d"), {} as never, "batch3d", () => undefined),
    (error: unknown) => error instanceof EditRenderError && error.code === "trust_handle_required");
  const bindingAuthorities = [...ExecutablePermitBindingSchema.shape.lifecycleAuthority.values];
  const observationScopes = [...FixtureLifecycleObservationSchema.shape.authorityScope.values];
  assert.ok(bindingAuthorities.some(authority => !authority.startsWith("synthetic_")),
    `an executable permit binding must be able to name a lifecycle authority for ${realOrigins.join(", ")} media; it admits only ${bindingAuthorities.join(", ")}`);
  assert.ok(observationScopes.some(scope => !scope.startsWith("synthetic_")),
    `permit lifecycle evidence must be able to cover ${realOrigins.join(", ")} media; its authority scope admits only ${observationScopes.join(", ")}`);
  assert.notEqual(FIXTURE_AUTHORITY.descriptor.eligibility, "synthetic_origin_and_synthetic_generated_authorization_only",
    "the only lifecycle authority answers solely for synthetic-origin, synthetic_generated assets");
});
```

The run passed the first two assertions (one real origin, `creator_upload`; no caller-minted handle) and failed at the third:

```text
✖ 3D-R01 the trusted execution boundary can carry post-stage lifecycle evidence for an owner-authorized real source (2.232011ms)
ℹ tests 1  ℹ pass 0  ℹ fail 1  ℹ cancelled 0  ℹ skipped 0  ℹ todo 0
AssertionError [ERR_ASSERTION]: an executable permit binding must be able to name a lifecycle authority for creator_upload media;
it admits only synthetic_fixture_registry_only_not_production_v0
```

A read-only probe of the same built bytes recorded the three frozen values: binding authorities
`[synthetic_fixture_registry_only_not_production_v0]`, observation scopes `[synthetic_fixture_assets_only_v0]`, and eligibility
`synthetic_origin_and_synthetic_generated_authorization_only`, with fixture digest `9fbf9b60…4a861`.

Chronology (append-only):

1. `batch3d-first-red-setup-failure-module-resolution.log`: the first attempt compiled into the session scratch directory, outside the
   repository, and failed resolving `zod`. That is harness setup, not a product RED.
2. `batch3d-first-red.log`: recompiled into the ignored `.test-artifacts/batch3d-red-dist/` and run; this is the RED above.

The RED test was not added to the committed suite: without an authorized repair it would stay red and break `npm test`. Its full
source is above. To reproduce locally, save it as `tests/edit-real-footage.test.ts`, run `npm run build`, then run
`node --import ./scripts/no-network.mjs --test dist/tests/edit-real-footage.test.js`; the expected result is FAIL with the message above.

| Evidence | SHA-256 |
|---|---|
| RED test source (run as `tests/edit-real-footage.test.ts`, then moved to the session scratchpad; not committed; embedded above) | `4e98879656d638201490f4a3775aa089543bc2bb559f52d6f011fc438ae37848` |
| `.local-runs/phase5-gate7/batch3d-first-red.log` (ignored, container-local) | `edf6de8049e123ecf4840291f7ef1ac6b255fff5565d1c16a68630d1b55bc0d7` |
| `.local-runs/phase5-gate7/batch3d-first-red-frozen-values.json` (ignored, container-local) | `d045990f49d4b26cfd1e410690bf00bcf25a6d8d1b7c0712407b2410132b6479` |
| `scripts/edit-render-local.ts` (accepted, unchanged) | `379e3bec5d1c703f6e7468240ed787ce1ab2cd22141dbe68cc97d918c0476abf` |
| `scripts/edit-render-fixture-authority-local.ts` (accepted, unchanged) | `6a6719a13cdba1c7eab34ab937c42066214ac3e9aba8eb2e4b62d874076a63cd` |
| `packages/edit-render/authorize.ts` (accepted, unchanged) | `860ff1e922ca454a392687a34496bfa25f1e25f5ec61e753c08a2f842a0725a2` |
| `packages/edit-render/records.ts` (accepted, unchanged) | `f3b717e49bf83645573d0d96334212ea613d48c9634e9eaff93532c8bf8eac2f` |

### Why a narrower 3D harness fix is insufficient

- **Reuse the fixture authority.** It refuses `creator_upload` / `owner_supplied` assets. Passing it requires relabelling real footage
  `synthetic`, which the world model and token resolver would also contradict. That is fake evidence.
- **A harness-local authority.** The permit accepts only `TrustedLifecycleObservation` instances, checked by private brand. The binder
  accepts only fixture-scoped records carrying the fixture digest, and the binding literal is frozen. No harness code can reach a permit
  without changing those accepted files.
- **Spawn FFmpeg from the harness.** That bypasses the one audited process-capable render adapter, the permit, receipts, QC linkage and
  the 3C render-then-QC-then-CAS publication. The result would not be the accepted pipeline.
- **Pre-render outside the pipeline, or skip rendering.** QC, observation and head publication require the accepted executor's own
  receipts. Running only the non-render steps would convert preparation success into end-to-end success, which is forbidden.

Enabling real media therefore needs a new real-media lifecycle authority inside the Batch-2B trusted boundary. That is a second media
lifecycle authority and a change to a frozen, owner-accepted binding, which the 3D authorization excludes ("use existing media/runtime
authority"; "do not create a second media-authority system").

## 4. Other real-footage constraints found (not the stop reason)

These do not require protected changes, but they determine which real footage could pass even after a lifecycle ruling.

- **V0 media semantics (fail closed; accepted Batch-2B limits).**
  - `compileRenderProgram` refuses VFR or other-rate timing (`source_frame_grid_unsupported`, `packages/edit-render/program.ts:122`).
    It also refuses a display aspect different from the output profile (`source_geometry_unsupported`, `:126`).
  - Staged-input conformance (`packages/edit-render/probe.ts:152-175`) requires:
    - a MOV/MP4 container with exactly one video stream, at most one audio stream and no other stream;
    - H.264 at the exact analysed size, SAR 1:1, yuv420p and no rotation;
    - every frame exactly on the output grid, starting at PTS 0, with the admitted frame table;
    - if linked audio is kept, AAC or PCM at exactly the output rate and layout, packets contiguous from PTS 0.
  - Typical phone footage (VFR, rotation metadata, 29.97 fps, HEVC, extra data tracks, AAC priming) will be refused. The practical V0
    path is conforming CFR H.264 footage with source audio excluded. If the owner transcodes footage beforehand, outside any harness,
    the authorized source is the derived file.
- **Analysis and construction chain.**
  - A real source needs the owner's real Phase-2 `FootageAnalysis` (SigLIP So400m, `cached_real_model`), produced locally by the
    accepted analyzer. Stub embeddings are refused for non-synthetic analysis. `MetadataSchema` bounds a source to 600 s.
  - Only test support assembles the Gate 1-5 chain into a revision-zero EditGraph; no script or sample calls `buildEditGraph`. No
    Director model exists, so direction and routing inputs over real footage would be deterministic fixtures, labelled as such, as in
    the accepted 3C media scenario. The owner should confirm that this evidence grade is acceptable.
- **Execution environment.** `RENDER_ENVIRONMENT` is `local_win32_x64` (`packages/edit-render/semantics.ts:36`), and the pinned runtime is
  `ffmpeg.exe`/`ffprobe.exe` under the approved tool root with digest re-verification (`scripts/edit-render-local.ts:51,104`).
  - From WSL, the run must use Windows Node through interop, as in earlier gates ("WSL exposed Windows Node v24.15.0").
  - Linux Node would report `unrecognized_environment`.

## 5. 3C hardening note: mismatched runtime DAG (source inspection only)

Neither `LocalEditingProject.execute` nor `issueExecutablePermit` checks that the runtime DAG is the authorized `childDag`. Both check
only that the call's DAG names the authorized child EditGraph artifact and that the head is current (`scripts/edit-editorial-local.ts:175-176`,
`scripts/edit-render-local.ts:437`). A different but genuinely admitted DAG of the same child graph can therefore obtain a permit and
render. Its impact and lock analysis may not match: `validateEditorialImpact` examined `childDag`'s program, not the executed DAG's.

Such an execution cannot gain current-project authority. QC runs against the authorized `childDag`
(`scripts/edit-editorial-local.ts:182`), and `buildQcReceipt` refuses a receipt whose `dagId` or render computation differs
(`packages/edit-render/qc.ts:134`). The exception propagates before the head CAS, so no head or state is published. Content-addressed
output bytes may still exist, non-authoritative, as the 3C record already states for a CAS loser.

This is recorded, not repaired, and not exercised: a hostile test needs the pinned runtime, which is absent here. Binding `execute` to
the exact authorized DAG would be a 3C change and needs the owner's decision.

## 6. Requested attack matrix D01-D40: disposition

No 3D harness, manifest or receipt was implemented, so the attacks on them were **NOT EXERCISED**. The cloud baseline suite re-ran the
accepted pure tests named below. Their actual-media counterparts (M01, M02) were **not** run here.

| Attacks | Disposition |
|---|---|
| D01-D08, D10 (manifest path, changed/wrong bytes, duplicates, symlink, directory search, URL, path in identity, mutation) | NOT EXERCISED: no harness. Accepted 2A staging hashes full bytes from one opened handle and gives staged objects content identity only; not re-run on real media. |
| D09 media/output Git-tracked | PASS for this session: `git ls-files` shows no media; `.local-runs/`, `.test-artifacts/`, `.tools/` and media extensions are ignored. |
| D11 VFR rounding, D12 off-authority trim | Accepted code refuses: `source_frame_grid_unsupported`, `source_trim_invalid`, 3C HC5/C36; pure tests re-run. |
| D13 state-only render | Accepted 3C N01 (pure, re-run); M01 media not run. |
| D14-D18 alternate state/head, stale head/graph/state | Accepted 3C HC1, E01, HR2, P02, HC4 (pure, re-run). |
| D19-D22 lock change, upstream shift, dropped lock, scope spill | Accepted 3C C03, K01, HC2, L01 (pure, re-run). |
| D23-D27 prose/JSON/fake plan/fake repair/OR1 | Accepted 3C HC3, A02/B02, I01, HC7, K01 and 3B OR1 (pure, re-run). |
| D28-D31 publish before/after failed render or QC, CAS loser | Accepted 3C M02 (media, not run here); E01 CAS (pure, re-run). |
| D32-D35 reuse claims and hash confusion in a 3D receipt | NOT EXERCISED: no 3D receipt. |
| D36-D37 GraphDiff 0.1 / EditGraph 0.3 reinterpretation | Accepted 3C J01/J02 (pure, re-run). |
| D38 absent real media classified as success | PASS: this record states NOT RUN / NOT READY throughout. |
| D39 arbitrary FFmpeg | PASS for this session: nothing substituted. Accepted `approvedRoot` / `reverifyPinned` refuse any other build. |
| D40 Gate 7 marked complete | PASS: Gate 7 remains NOT YET COMPLETE. |

## 7. Smallest next owner decision

1. **Recommended: authorize one bounded protected change inside 3D, an owner-local real-media lifecycle authority.** It would mirror
   the fixture authority's trust-handle pattern and would still not be a production service.
   - A new filesystem-only adapter (`process: none`). It is created from a strict, bounded, explicit local-run manifest (at most 16
     entries). It reuses the accepted `AuthorizedFootageSet` / `AuthorizedFootage` vocabulary: absolute path, SHA-256, size and
     `owner_supplied` authorization.
   - It registers each file by hashing one held handle: no recursion, globbing or URLs, and any mismatch fails closed. It answers only
     for admitted `creator_upload` / `owner_supplied` assets with exactly the registered bytes. It is re-queried at permit issuance and
     at execution start.
   - A separately identified observation record with its own authority scope and digest, in `packages/edit-render/records.ts`.
   - `packages/edit-render/authorize.ts` would accept either record kind. `lifecycleAuthority` would become an explicit enum whose
     synthetic member is unchanged, so existing synthetic bindings stay byte-identical.
   - `scripts/edit-render-local.ts` would accept either live handle class.
   - The adapter registered in `scripts/audit-workspace.mjs` (16 -> 17 adapters), with authorized pin updates.
   - Test-first pure, hostile and owner-local media tests.
2. **Alternative:** a separate lifecycle-authority batch before 3D, then 3D unchanged.
3. **Not recommended:** re-scope 3D to non-render real-footage steps. It cannot close Gate 7's real-media gap.

With option 1, the owner should also rule on:

- the §5 exact-DAG binding;
- deterministic-fixture direction over real analysis (§4);
- the footage conformance expectations (§4).

## 8. Owner-review manifest

- **Files added:** this record.
- **Files modified:** `docs/CURRENT_PHASE.md`: its title, one Current-ruling bullet and one Batch-3D section. Historical text is
  unchanged.
- **Protected accepted files modified:** none.
- **New dependencies:** none. **Lockfile changes:** none. **Media committed:** none.
- **Not committed:** the RED test file, moved out of the worktree after its run (source and SHA-256 in §3), plus the ignored,
  container-local `.test-artifacts/batch3d-red-dist/` and `.local-runs/phase5-gate7/batch3d-*` logs.

Architecture V2: **FROZEN**

Gate 7 Batch 3C: **OWNER-ACCEPTED** (baseline preserved)

Batch 3D implementation: **NOT COMPLETE — STOPPED (PROTECTED_CHANGE_OUTSIDE_3D_AUTHORIZATION)**

Real-footage harness: **NOT READY**

Real footage verified: **NO — BLOCKED BEFORE ANY LOCAL RUN**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING** (an owner ruling on §7 is required first)

Gate 7 overall: **NOT YET COMPLETE**

## 9. Owner ruling (2026-09-30) and write-access verification

The owner authorized "the smallest bounded protected change required inside Phase 5 Gate 7 Batch 3D to support explicitly
owner-authorized real media through the EXISTING trusted execution boundary", specifically for the 3D-R01 gap.

The ruling set these bounds:

- Change only the minimum required Batch-2B / render-authorization files.
- Preserve every historical synthetic semantic, and do not redesign the render architecture.
- Bypass nothing: admission, source grants, staging, claim ownership, lifecycle checks, conformance, `issueExecutablePermit`, the
  pinned FFmpeg runtime, technical QC, observation / critic, RepairPlan lineage, EditorialState, EditingHead, GraphDiff validation and
  CAS publication all stay in the path.
- No Director model: direction and planning inputs are deterministic, typed and labelled "deterministic verification input".
- No ingest normalization of any kind (no transcoding, VFR-to-CFR, codec or aspect conversion, rotation correction or silent audio
  removal). The runner inspects media and refuses it with the exact reason.

Write access was verified once, without creating a commit:

- `git ls-remote` showed `main` and `phase/5-gate7-3d-real-footage` at `da9a73da5d349a6bd71678e65d4e079415043754`.
- `git push --dry-run origin da9a73d…:refs/heads/phase/5-gate7-3d-real-footage` printed "Everything up-to-date" (exit 0).
- `git push --dry-run --porcelain origin HEAD:refs/heads/phase/5-gate7-3d-real-footage` printed `da9a73d..5d0ed6c Done` (exit 0).

The docs-only stop commit `5d0ed6c0d155190b59e5393d35c4dd57cf0da901` was never pushed. As the ruling allows, it is folded into the
single Batch-3D implementation commit. Its content survives unchanged as §1-§8 of this record.

## 10. The protected change: an owner-local real-media lifecycle authority

**Shape.** An explicit owner registration leads, step by step, to the pinned FFmpeg:

1. The registration names each source's exact relative path, SHA-256, size and authorization.
2. The authority verifies those bytes in full.
3. The accepted staging stores the admitted bytes.
4. A post-claim, post-stage lifecycle observation re-verifies them.
5. The observation is presented only as a live trusted handle.
6. The accepted `issueExecutablePermit` issues the permit.
7. The accepted pinned-FFmpeg segmented executor renders.

There is no second render path.

| File | Change |
|---|---|
| `packages/edit-render/owner-media.ts` (new, pure) | The registration schema, eligibility rule, observation record and builder. |
| `scripts/edit-render-owner-media-authority-local.ts` (new adapter, filesystem only, `process: none`) | Registers the declared files, answers post-stage queries, holds deletion and expiry state, and mints the live handle. |
| `packages/edit-render/authorize.ts` (protected) | The binder reads either observation kind, one authority per execution, and the binding literal became a two-member enum. |
| `packages/edit-render/index.ts` (protected) | Exports the additions. |
| `scripts/edit-render-local.ts` (protected) | `issueExecutablePermit` accepts either live handle class; record-only evidence is still refused. |
| `scripts/audit-workspace.mjs` | Registers the new adapter with an exact import allowlist and no process capability (16 -> 17 adapters). |

**Registration.** The registration reuses the accepted Phase-2 vocabulary unchanged:

- The `footage` field is the same `AuthorizedFootageSet` the accepted analyzer consumes.
- Every entry's `AuthorizedFootage` must be `owner_supplied` (`owner_created` or `permission_granted`) and belong to the set's creator
  and project.
- The owner's separate render authorization is an explicit marker:
  `{ statement: "owner_authorizes_local_render_of_exactly_the_declared_sources_v0", owner, renderIntents, authorizedAt, expiresAt }`.
  Analysis authorization never renders.

**Paths.** The accepted analyzer's path rule applies:

- A path is relative to the footage manifest's own directory.
- An absolute, drive, URL, share, device, traversal, pattern, empty, `.`/`..`, control-character or trailing-dot/space path is refused.
- A link anywhere in the resolved location is refused, and the real path must equal the requested path.
- No directory is ever listed, and nothing is globbed or downloaded.

**Byte verification.** Each file is hashed in full through one held handle. `lstat` and the opened handle must agree, the device and
inode must not change during the read, and the declared size and SHA-256 must match. The file is re-hashed in full on every
`verify` and `observe`. Paths never enter an identity: the registration digest excludes locations.

**Eligibility.** The authority answers only for an admitted source whose MediaAsset is `creator_upload` and whose analysis
authorization is `owner_supplied`, both binding exactly the admitted hash and size. The declared authorization must equal the admitted
one. The binder re-reads this provenance from the exact admitted records, so synthetic media can never carry owner-local evidence.

**State and query.**

- Deletion is recorded on request. Expiry starts at the owner's render-authorization expiry and can only shrink.
- `observe(call, staged)` verifies claim ownership and the staged receipt first. It then checks provenance and re-hashes the declared
  bytes inside a check window on the trusted runtime clock.
- It returns a `TrustedOwnerMediaLifecycleObservation`: private-symbol construction, `#token` brand, a record snapshot only as a copy,
  and `proves(record)` by session digest. `toJSON` throws.
- The handle re-queries current state (deletion, expiry, re-registered bytes) at permit issuance and at execution start, through the
  unchanged `reconfirm` calls.

**Binder.**

- The observation kind is read from `artifactType`. Anything that is not an `OwnerMediaLifecycleObservation` is parsed exactly as
  before, as a `FixtureLifecycleObservation`.
- One execution never mixes authorities.
- An owner observation must bind the source's exact size, analysis and staged object.
- `lifecycleAuthority` is `synthetic_fixture_registry_only_not_production_v0` (unchanged) or
  `owner_local_media_manifest_registry_not_production_v0` (new). A synthetic execution binds the same literal in the same shape, so its
  binding bytes are unchanged; 3D-L08 checks the literal, the shape and the fixture digest.

**Unchanged.** `FixtureLifecycleObservation`, the synthetic-fixture authority, GraphDiff 0.1.0/0.2.0, EditGraph 0.3.0/0.4.0, every
receipt schema and every Batch-2B fixture record.

| Protected file | Accepted SHA-256 (da9a73d) | Batch-3D SHA-256 |
|---|---|---|
| `packages/edit-render/authorize.ts` | `860ff1e922ca454a392687a34496bfa25f1e25f5ec61e753c08a2f842a0725a2` | `43bb22d5d1d44a09b5e8366717c48b2ca8b10f0bf462282e1ca3ff3662a0f44b` |
| `packages/edit-render/index.ts` | `3ff1f341a0b10c005aafcf4f55c43c6716699ff4d6ff664ba59ed25b08437fb7` | `1546b1cbff19448ac990e8fc4b90460856ebaa254e6e7ec8aa47c8f4fa7d99c6` |
| `scripts/edit-render-local.ts` | `379e3bec5d1c703f6e7468240ed787ce1ab2cd22141dbe68cc97d918c0476abf` | `57e4d4159520acdb9e9955a565303f42bf6fa38f1eea631b8b0eeb2a61e42b7b` |
| `scripts/audit-workspace.mjs` | `d658c3e9a46c948674a87d2376719d15107780ad042b4d029ffc8c93a81a2044` | `ca332755da42ae21d056f296a60ed16257961c5de3839c53267695d1894f364a` |

**Authorized pin updates.**

- `tests/edit-review.test.ts` R01: the three new hashes above, with the prior pins kept in a comment. The `packages/edit-render` file
  count goes from 11 to 12 (`owner-media.ts`).
- `tests/edit-render-audit.test.ts` B2B-A1: "16" becomes "17 explicit local runtime adapters". The subprocess-capable list is unchanged.

The new files are `owner-media.ts` (`64a757d5cdb5a321122c0a482469c0f473c7cd3f43e037c06c9479ba69b49483`) and the adapter
(`3a48d819bdb870bcaa4625d798badaa2e4fd690de48e1c9fa40b6c049428c83a`).

## 11. 3D-R01: RED preserved, GREEN

The §3 RED source read `.values` of the binding's zod literal, and zod 4 exposes no such property on an enum. The unchanged source
therefore fails mechanically against the repaired bytes (`TypeError: …lifecycleAuthority.values is not iterable`). It cannot serve as
the GREEN check.

That run is preserved as `batch3d-r01-original-unchanged-after-repair-mechanics.log` (`ca45cd43…bf31`). The permanent regression
`tests/edit-real-footage.test.ts` restates the same assertions with API-stable calls:

- `safeParse` of `ExecutablePermitBindingSchema.shape.lifecycleAuthority` for the synthetic literal, the owner literal and a
  near-miss;
- the unchanged fixture scope and eligibility;
- the new exports, read through the module namespace.

| Run | Bytes | Result | Log (container-local, ignored) |
|---|---|---|---|
| Permanent 3D-R01 on a detached worktree at `da9a73d` | accepted pre-3D | **RED**: "an executable permit binding must be able to name a lifecycle authority for creator_upload media" | `batch3d-r01-permanent-baseline-red.log` `aecf4b59…ba38` |
| Permanent 3D-R01 on the repaired tree | Batch 3D | **GREEN** | `batch3d-r01-permanent-green.log` `14de718f…4f57` |

## 12. Hostile lifecycle tests (`tests/edit-real-footage-lifecycle.test.ts`)

The tests run over opaque test bytes written to a test-owned directory. Registration declares those bytes `owner_supplied` only to
exercise the authority; they are not media.

| Owner-required case | Test |
|---|---|
| 1 owner real media accepted only with exact manifest identity | 3D-L01 |
| 2 wrong SHA refused | 3D-L02 |
| 3 changed bytes refused (after declaration, after registration, by replacement; originals never written) | 3D-L03 |
| 4 undeclared source refused | 3D-L04 |
| 5 network URL (and share, drive, absolute, traversal, pattern, device) refused | 3D-L05 |
| 6 directory discovery absent/refused (directory, missing file, link anywhere; nothing listed) | 3D-L06 |
| 7 fake creator_upload provenance refused (registration, eligibility, query and binder) | 3D-L07 |
| 8 synthetic fixture path unchanged; one execution never mixes authorities | 3D-L08 |
| 9 stale lifecycle observation refused | 3D-L09 |
| 10 deletion / expiry refused (current state and observation) | 3D-L10 |
| 11 wrong claim / staged receipt / staged object / size / authority refused | 3D-L11 |
| 12 serialized or constructed record cannot substitute for the live handle | 3D-L12 |

**Mutation checks** (`batch3d-lifecycle-mutation-checks.log` `0d24d01d…1fc9`). Each mutation was applied to a copy, built and run,
then reverted:

- M1: the binder drops the provenance re-check. Caught by L07.
- M2: the binder allows mixed authorities. Caught by L08.
- M3: the registry skips the SHA-256 comparison. Caught by L02 and L03.
- M4: the query skips the admitted-provenance check. Caught by L07.

M1 and M4 also broke the build through `noUnusedLocals`. The emitted JavaScript still ran, and the named test failed.

## 13. DAG hardening: DEFERRED WITH REASON

One focused source check was made, as ruled. `LocalEditingProject.execute` and `issueExecutablePermit` bind the runtime DAG only by
the authorized child graph's identity (`scripts/edit-editorial-local.ts:175-176`; the permit's `assertCurrent`).

A mismatched but genuinely admitted DAG of the same child graph cannot pass or publish:

- `execute` runs QC against the authorized `childDag` (`scripts/edit-editorial-local.ts:182`).
- `buildQcReceipt` refuses a receipt whose `dagId` or render computation differs (`packages/edit-render/qc.ts:134`).
- The refusal is thrown before the head CAS, so no EditingHead, EditorialState or current-project authority results, and no trust
  invariant is crossed.

Such an execution can only produce non-authoritative, content-addressed output bytes: wasted computation, as with a CAS loser.

Per the ruling this is **deferred as a hardening note**, not repaired. Binding `execute` to the exact authorized DAG would change 3C
code for no correctness gain, so no RED evidence exists and none was invented.

## 14. The owner-run real-footage harness

| File | Role |
|---|---|
| `tests/support/edit-real-footage.ts` | Pure core: no process, file, clock or network. It holds the run-manifest schema, admissibility checks, the exact output clock, candidate selection, trims, the owner-scoped chain, admission and DAG, the owner policies and the receipt schema. |
| `tests/edit-real-footage.local.ts` | The runner: owner-run only, and in neither default glob (`*.test.js`, `*-media.integration.js`). It imports no subprocess module; every process starts inside the accepted audited adapters. |
| `tests/edit-real-footage-harness.test.ts` | Cloud tests of the pure core and the runner's non-media steps (§15). |

**Run manifest** (strict; `Batch3DRealFootageRun` 0.1.0; kept in a git-ignored location). It carries no media and no identity of its
own:

```json
{
  "manifestType": "Batch3DRealFootageRun",
  "schemaVersion": "0.1.0",
  "footageManifest": "<absolute local path of the accepted Phase-2 AuthorizedFootageSet JSON>",
  "analysisJobId": "footage_<uuid of the accepted analyzer run over exactly that set>",
  "renderAuthorization": {
    "statement": "owner_authorizes_local_render_of_exactly_the_declared_sources_v0",
    "owner": { "kind": "owner", "actorId": "<owner id>" },
    "renderIntents": ["final"],
    "authorizedAt": "<UTC instant, millisecond precision, not in the future>",
    "expiresAt": "<UTC instant or null>"
  },
  "timeline": [
    { "entryId": "<AuthorizedFootageSet entry label: the clip that will be locked>", "candidateId": null },
    { "entryId": "<AuthorizedFootageSet entry label: the clip that will be trimmed>", "candidateId": null }
  ],
  "sourceAudio": "excluded",
  "outputResolution": null
}
```

- The `AuthorizedFootageSet` supplies each source's exact relative path, SHA-256, size, logical label (`entryId`) and owner
  provenance. It is the same file the accepted analyzer consumed.
- `candidateId: null` lets the harness choose deterministically: the longest admissible retained candidate, then the earliest, then by
  identity. An owner-named candidate must itself be admissible.
- `sourceAudio` is explicit: `"linked_identity"` or `"excluded"`. It is never inferred, and audio is never removed silently.
- `outputResolution` is optional. It must be even, at most 3840 and of the exact display aspect; the default is the first source's size.
- A manifest inside the repository must live under `.local-media/` or `.local-runs/`. The runner accepts only
  `--manifest <absolute local path>`.

**Admissibility.** Media is inspected, never repaired. `planOutput` and `selectTimeline` refuse with exact reasons before any media
work. The accepted graph, workload, render-program, conformance and QC rules remain the authority and refuse independently.

- **Analysis:**
  - not owner-supplied real media (`analysis_not_owner_real_media`);
  - not the frozen SigLIP2 So400m revision and embedding space (`analysis_not_frozen_semantic_model`: `google/siglip2-so400m-patch16-naflex`
    @ `cc24074f…`, `space_58bd790c…`);
  - authorization lacking `local_evaluation`;
  - analysis run not `succeeded`;
  - analysis not binding exactly the declared bytes and authorization.
- **Video stream:**
  - variable frame rate;
  - a frame table off its exact rational grid (the first offending frame is reported);
  - a codec other than H.264;
  - rotation;
  - non-square pixels;
  - frame-rate or display-aspect mismatch between the two sources;
  - an unsupported output size.
- **Audio:** linked audio requested for a source without audio.
- **Output clock:** a frame rate the exact output clock cannot represent.
- **Retained candidates:**
  - an endpoint that is not exactly representable on the output clock;
  - a duration that is not whole output frames;
  - selected frames that differ from the output frames;
  - audio boundaries that do not fall on whole samples;
  - for the trimmed clip, no two successive whole-frame, sample-exact trims.
- **Universe bound:** more than 32 retained candidates across the timeline analyses (`candidate_universe_exceeds_harness_bound`; see
  the limitations).

**Exact output clock.** The clock is the largest multiple of lcm(frame-rate numerator, 10^6) at or below 10^9 ticks per second. Every
output frame instant and every microsecond-rounded analyzer instant is then whole ticks: 999 000 000 for 30, 24, 30000/1001 and
60000/1001 fps, and 10^9 for 25 and 50 fps. A rate the clock cannot represent is refused.

**Chain.** Every accepted Gate 1-7 builder is used, with the owner's scope. Labels are derived from the supplied analysis, never asserted:

- `creator_upload` MediaAssets, `real_footage` media basis and `cached_real_model` computation basis appear only for owner-supplied
  frozen-model analyses. Synthetic analyses keep synthetic labels (3D-H05/H06).
- The candidate universe is exactly every retained candidate of the timeline analyses.
- Two ordered hard story nodes and one typed cut form deterministic verification input. The `DirectorProducerRun` basis is
  `synthetic_test`. A declared Director selection placeholder is selected and never executed, and there is no Director model run.
- Gate 5 chooses exactly the declared two-clip sequence.
- Gate 6 records the owner profile and attributed capability claims for the real V0 executor, which the pinned runtime probe verifies
  at execution.
- Each render attempt gets its own admission, with media grants citing the owner's render authorization. Source receipts carry the
  owner-local authority's full re-hash, taken after the grants.

**Trim.** The harness removes about half a second from the end of the unlocked clip, in whole admitted frames:

- at most a third of the clip, and on whole samples when audio is linked;
- a candidate-endpoint start moves to the first frame the parent already renders, so the kept picture starts where it did;
- nothing is snapped to a non-frame instant.

**Scenario order.** Every render uses the accepted boundary, and every head change uses the accepted editing project.

| # | Scenario | What the harness does |
|---|---|---|
| 1 | Manifest and source verification | Full re-hash of every declared source; the analyses bind exactly those bytes. |
| 2 | Source admissibility | See above. |
| 3 | Baseline render and QC | Owner-local lifecycle, permit, pinned FFmpeg, then independent technical QC. |
| 4 | Observation and critic | Pinned-FFmpeg decodes of review windows, then `runCriticReview`. There is no semantic critic port or model, so the semantic channel is `not_computed`. |
| 5 | EditingHead initialization | |
| 6 | State-only HARD_EXACT lock of clip 1 | Asserts no media process, no output change and the same graph. |
| 7 | Render failure | Trim proposal, then execution with a failure injected before assembly: `render_failed`, and the head does not move. |
| 8 | CAS loser | The same proposal with a concurrent state-only change during the render: `stale_editing_head`, and the concurrent head stays current. |
| 9 | Published trim | The trim re-proposed from the current head: GraphDiff, child graph, child render, QC and CAS publication. |
| 10 | Localized reuse | The locked clip's segment is reused by computation identity; exactly 2 render processes run (the changed segment and the assembly). |
| 11 | Locked-target refusal | A trim of clip 1: `hard_lock_conflict`, with no process. |
| 12 | Historical preference | A state-only preference about revision 0's clip 1. |
| 13 | Stale request refusal | Re-proposing the superseded request: `stale_editing_head`. |
| 14 | QC failure, last | A later trim renders; 4 bytes are appended to its own new output after QC fixes its identity: `qc_failed`, and the head does not move. The injected fault is recorded, and no later scenario reads that output. |

Critic findings are recorded, never manufactured. With zero findings the receipt states `execution PASS`, `actionableRepairFinding
NONE_OBSERVED` and `autoRepair NOT_EXERCISED_NO_VALID_FINDING`. With findings it states `OBSERVED` and
`NOT_EXERCISED_OUTSIDE_BATCH_3D_SCOPE`, and lists them in `evidence.json`.

**Receipt** (`Batch3DRealFootageReceipt` 0.1.0; canonical JSON; at most 256 KiB; strict schema). It contains:

- the Git HEAD, read from `.git`, or null (never invented); `clean` is null because no subprocess may run `git status`;
- the harness identity and `direction: deterministic_verification_input`;
- the run-manifest and footage-manifest SHA-256 and the registration digest;
- the pinned ffmpeg/ffprobe SHA-256;
- per source: entry label, asset identity, hash, size, analysis identity, analysis and MediaAsset refs, and the chosen candidate;
- the named records: root EditGraph / EditorialState / EditingHead, baseline DAG / RenderProgram / output SHA-256 / QC / observations,
  critic report, lock request / intent / head, EditorialRequest, intent, EditorialRevisionPlan, GraphDiff, child EditGraph /
  EditorialState / EditingHead / DAG / RenderProgram, reused and recomputed segment identities, child output SHA-256, child QC,
  preference head and final current head;
- the lock and stale refusal codes;
- per-phase process counts observed independently at the native spawn entry;
- the critic outcome;
- one status per scenario: PASS / FAIL / NOT_EXERCISED / UNAVAILABLE.

A dependent scenario cannot PASS without its prerequisite. The claims are fixed: `realFootageVerified: PENDING_OWNER_REVIEW` and
`NOT_VERIFIED` for professional editing quality, creative quality and autonomous Director. Wall-clock timings are kept apart in
`timings.json`. The full records are in `evidence.json`, without artifact byte arrays.

**Evidence location.** Everything goes under `.local-runs/phase5-gate7/b3d-<instant>-<nonce>/`, which is git-ignored:

- `receipt.json`, `evidence.json` and `timings.json`;
- `runtime/`: staged copies of the declared sources, `render-outputs/`, segment artifacts and `editing-control/`.

Delete that directory after review; the source files themselves are never written. The accepted runtime bounds its root path at 160
characters, so the repository's own path may be at most about 100 characters. A longer path is refused as `runtime_root_path_too_long`.

**Limitations (recorded, not solved in 3D).**

1. The accepted chain re-validates every retained candidate at each boundary. On this container, one current-head validation took
   about 5 s (root head) to 9 s (after the lock) at 22 retained candidates, and `authorize` took 61 s. `LocalEditingProject.execute`
   runs that validation twice after the post-stage lifecycle observation and before the permit, whose evidence may be at most 60 s old.
   The harness therefore refuses more than 32 retained candidates before any media work. Owners should authorize and analyze short
   clips (a few seconds each at the default proposal configuration). A run that still exceeds the window fails with the accepted
   `*_stale` code, recorded in the receipt.
2. The V0 render rules in §4 still apply. Typical phone footage (VFR, rotation, HEVC, extra tracks, 29.97 fps durations that are not
   whole frames, AAC priming) will be refused with the exact reason. Normalizing it is a separate owner decision.
3. The lifecycle authority is an owner-local verification registry, not a production user-media lifecycle service.
4. Review windows are sized to the accepted 64 MiB per-decode bound: 21 frames at 1080x1920, only 5 at 3840x2160. A 4K output may also
   exceed the accepted decoded-pixel budget, and observation then fails with `review_budget_exceeded`. For 4K sources, set
   `outputResolution` explicitly, for example to 1920x1080 or 1080x1920.

## 15. Cloud verification (Node v24.15.0; no media, runtime process, model or network)

| Gate | Result |
|---|---|
| Focused tests on the final bytes: `edit-real-footage.test.js`, `edit-real-footage-lifecycle.test.js`, `edit-real-footage-harness.test.js` | PASS: 21/21 (3D-R01, 3D-L01..L12, 3D-H01..H08). Log `batch3d-final3-focused.log` `85e8d5d6…987b`. |
| First focused run, adding `edit-render-audit.test.js` | PASS: 28/28 (the 21 above plus B2B-A1..A7). R01 frozen-file pin (`edit-review.test.js`): PASS. |
| `npm run typecheck` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |
| `npm run audit:workspace` | PASS: 128 application TypeScript files; 17 explicit local runtime adapters; subprocess-capable list unchanged |
| `git diff --check` | PASS (no output) |
| Full safe suite, run once: `node --import ./scripts/no-network.mjs --test --test-concurrency=1 dist/tests/*.test.js` | PASS: **1075/1075**; 0 fail, cancelled, skipped or todo; 1712.3 s; exit 0. This is the baseline 1054 plus 21 Batch-3D tests. Log `batch3d-final-full-safe.log` `5ad647b7…17b0`. |
| Actual-media suites, Python suite and `npm run verify` as a whole | ENVIRONMENT_UNAVAILABLE_FOR_THIS_CHECK (no pinned Windows FFmpeg, no venv) |

**Changes after the single full-suite run** (append-only; the full suite was not re-run, per the ruling).

Exercising the runner's refusal path in the cloud (no media) showed two receipt-truthfulness defects:

- An unread manifest was recorded with an all-zero placeholder hash. It is now `null` until the file is actually read.
- A schema refusal read only `ZodError`. It now names the failing fields and checks, never their values.

The runner was also given a shorter evidence directory and a clear pre-check, because the accepted runtime bounds its root path at 160
characters. The files touched were:

- `tests/edit-real-footage.local.ts`, which no test imports;
- the receipt schema's three manifest-hash fields in `tests/support/edit-real-footage.ts`;
- two added 3D-H08 assertions.

No accepted, protected or other suite-tested file changed. On the final bytes, typecheck, build, the workspace audit, `git diff --check`
and the three Batch-3D test files (21/21) all pass. A cloud run with an invalid manifest wrote a valid receipt containing:

- the run manifest's SHA-256;
- `null` for the unread footage manifest;
- `manifest_and_source_verification: FAIL`, naming the failing fields;
- every other scenario `NOT_EXERCISED`.

Focused cloud tests:

- 3D-R01: the regression.
- 3D-L01..L12: hostile lifecycle tests.
- 3D-H01..H08:
  - H01: manifest strictness and private locations;
  - H02: exact admissibility refusals, including the universe bound;
  - H03: the exact clock;
  - H04: candidate facts and exact trims, including 30000/1001 fps at 48 kHz;
  - H05: the synthetic chain to an executable program, with derived synthetic labels;
  - H06: a **structural** real-shaped fixture. Its vectors come from a test backend and are declared, not model output. It proves only
    that real labels are derived from real-labelled inputs and satisfy the owner-local eligibility rule;
  - H07: the runner's editorial steps without media: lock, exact trim proposal, localized authorization, lock refusal, preference and
    stale refusal;
  - H08: receipt bounds and fixed claims.

## 16. Owner-local run

Prerequisites on the owner's Windows machine:

- Node v24.15.0.
- The pinned `.tools/ffmpeg/ffmpeg-9.0.1-essentials_build`. From WSL, use Windows Node through interop; Linux Node reports
  `unrecognized_environment`.
- The accepted Phase-2 analyzer run with the frozen model (`npm run analyze-footage -- <AuthorizedFootageSet.json>`) over the
  authorized clips.

Commands:

```text
npm ci
npm run build
node --import ./scripts/no-network.mjs dist/tests/edit-real-footage.local.js --manifest <absolute path of the run manifest>
```

The runner prints one JSON line naming the receipt, whether it is valid, the scenario statuses and `allPassed`. It exits 0 only if the
receipt is valid and every scenario passed. Record `git status --porcelain` beside the receipt, because the runner cannot run Git.

## 17. Attack matrix D01-D40 after implementation

Cloud-exercised tests are named. Anything that needs real footage and the pinned runtime is **PENDING THE OWNER-LOCAL RUN**.

| Attacks | Disposition |
|---|---|
| D01-D08, D10 (manifest path, changed/wrong bytes, duplicates, symlink, directory search, URL, path in identity, mutation) | PASS (cloud, pure / filesystem): 3D-L01..L06, L03, H01. Identities never carry a path. |
| D09 media/output Git-tracked | PASS: evidence only under ignored `.local-runs/`; no media committed. |
| D11 VFR rounding, D12 off-authority trim | PASS (cloud): H02, H04 refuse; the accepted refusals are unchanged. |
| D13 state-only render; D14-D27 | Accepted 3C pure tests unchanged in the full suite; H07 exercises the harness path without media. Media half PENDING OWNER-LOCAL RUN. |
| D28-D31 publish before/after failed render or QC, CAS loser | Implemented as runner scenarios 7, 8 and 14; PENDING OWNER-LOCAL RUN. |
| D32-D35 reuse claims and hash confusion in the receipt | Receipt records the reused and recomputed segment identities from the accepted receipt and program; H08 enforces dependent statuses. Media half PENDING. |
| D36-D37 GraphDiff 0.1 / EditGraph 0.3 reinterpretation | Unchanged; the accepted tests stay in the full suite. |
| D38 absent real media classified as success | PASS: statuses are PASS/FAIL/NOT_EXERCISED/UNAVAILABLE; a missing runtime is UNAVAILABLE; the claims are fixed. |
| D39 arbitrary FFmpeg | PASS: only the accepted pinned root; nothing substituted. |
| D40 Gate 7 marked complete | PASS: NOT YET COMPLETE. |

## 18. Owner-review manifest (implementation)

- **Files added:**
  - `packages/edit-render/owner-media.ts`
  - `scripts/edit-render-owner-media-authority-local.ts`
  - `tests/edit-real-footage.test.ts`
  - `tests/edit-real-footage-lifecycle.test.ts`
  - `tests/edit-real-footage-harness.test.ts`
  - `tests/edit-real-footage.local.ts`
  - `tests/support/edit-real-footage.ts`
  - this record
- **Files modified:**
  - `packages/edit-render/authorize.ts`
  - `packages/edit-render/index.ts`
  - `scripts/edit-render-local.ts`
  - `scripts/audit-workspace.mjs`
  - `tests/edit-review.test.ts` (pins)
  - `tests/edit-render-audit.test.ts` (adapter count)
  - `docs/CURRENT_PHASE.md`
- **Protected accepted files modified:** `packages/edit-render/authorize.ts`, `packages/edit-render/index.ts`,
  `scripts/edit-render-local.ts`, `scripts/audit-workspace.mjs`, and the two pins, all under the 2026-09-30 ruling.
- **New dependencies:** none. **Lockfile changes:** none. **Media committed:** none.

Architecture V2: **FROZEN**

Protected 3D change: **IMPLEMENTED** (owner-local real-media lifecycle authority)

Batch 3D code: **COMPLETE**; harness **READY FOR THE OWNER-LOCAL RUN**

Real footage verified: **NO — PENDING OWNER LOCAL RUN**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**
