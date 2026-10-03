# Phase 5 Gate 7 Batch 3D — Real-footage end-to-end acceptance

**Current status (2026-10-03 closure, §33-§38).** Real footage verification: **PASS — CANDIDATE FOR OWNER ACCEPTANCE** (owner-terminal
run 16/16, §36; final gates PASS, §37). Batch 3D owner acceptance: **PENDING INDEPENDENT OWNER REVIEW**. Gate 7: **NOT YET COMPLETE**.
Phase 6: **NOT STARTED**. The status line below and §1-§32 are preserved history.

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

## 19. Owner-local preflight (2026-10-03): NO_ADMISSIBLE_REAL_FOOTAGE_PAIR

The first owner-local session ran on the exact pushed SHA `d579a0e4430d689f69e84ee35dce098d3d75b818` and changed no code.

- **Environment.** Local and origin SHAs match, and the tracked worktree was clean. Windows Node is v24.15.0. The pinned `ffmpeg.exe` and
  `ffprobe.exe` match `semantics.ts:39-45`, and the `.venv` has Python 3.12.12.
- **Inputs.** The accepted set is `local-media/phase2-real/authorized-footage.json` (`5b339de0…3dc512`). Accepted job
  `footage_36099c27-da31-40da-a3ec-0f5fe666f3da` has `run.json` `2fabb8ec…`. All 9 declared sources re-hashed 9/9 before and after.
- **Result.** The committed `planOutput` refused all 81 (lock, trim) timelines; none rendered. Three independent blockers:
  1. **B1, candidate universe.** Every source retains 64-114 candidates, against the harness bound of 32.
  2. **B2, frame grid.** Every frame table is off the exact grid from frame 1. For 30/1 sources, 539 of 809 entries are off grid.
     - The analyzer stores ffprobe `best_effort_timestamp_time` text, which is microsecond-rounded (`0.033333`).
     - The accepted renderer requires the correctly rounded double of i × den / num (`packages/edit-render/program.ts:120-122`).
  3. **B3, location.** `privateLocationRefusal` refused `local-media/`, although `.gitignore:14` ignores it.
- **Evidence.** `.local-runs/phase5-gate7/batch3d-owner-local-preflight-20261003/` (`stop-record.json`, `SHA256SUMS.txt`).

## 20. Owner ruling R02 (2026-10-03)

The owner accepted the preflight as valid evidence and authorized the smallest bounded repair of B1-B3:

- **R02-A.** Exact frame times at the analyzer producer seam. No renderer tolerance; VFR and non-grid timestamps still fail;
  historical analyses stay immutable.
- **R02-B.** `local-media/` becomes an accepted git-ignored private location.
- **R02-C.** A new owner-authorized analysis with bounded proposal limits. `MAX_RETAINED_CANDIDATES = 32` stays unchanged.

Phase 6 is not authorized.

## 21. R02-A: exact frame times at the analyzer seam

**Two defects, each with its own RED.**

1. **Producer.** `python/reference_analyzer/media.py` built `frameTimes` from the microsecond text.
2. **Cache identity.** `scripts/footage-local.ts:96` memoized metadata under `footage-metadata-v1`, a key that does not bind the
   producer's timing semantics. The real cache held valid v1 memos with microsecond tables for Akshat and Deepinder
   (`r02a-stale-metadata-cache-probe.json`), so a producer repair alone would have been bypassed for them.

**Repair.**

- `media.py` requests the stream `time_base` and each frame's integer `best_effort_timestamp`.
- Each frame time is `float((ts - ts0) * Fraction(time_base))`. That is the correctly rounded double of the exact instant, as `secondsOf`
  computes it with one IEEE division.
- A timeline without integer timestamps or a valid time base fails closed (`MEDIA_UNREADABLE`).
- `footage-local.ts` reads metadata memos under `footage-metadata-v2`; v1 memos are never read.
- Unchanged: the renderer, the FootageAnalysis schema, `FOOTAGE_VERSION`, the 1 ms variable-rate flag formula and every historical
  analysis.

**Tests (RED on the unrepaired bytes `media.py` `62adcb7b…`, `footage-local.ts` `334d77d2…`).**

- `python/tests/test_footage_exact_time.py`, 8 tests:
  - Fake ffprobe answers mirror the pinned ffprobe's integer timestamps and six-decimal text.
  - 30/1, 60/1 and 30000/1001 were RED under two time bases each; the 25/1 and 50/1 controls passed.
  - Perturbed frame 7: RED (first off-grid frame 1, not 7). Variable rate: RED on the exact instant only.
  - Text-only (legacy) output: RED (silently accepted).
- `tests/footage-exact-time-media.integration.ts`:
  - Real clips from the pinned FFmpeg pass through `LocalFootageServices` → Python worker → pinned ffprobe, judged by the renderer's
    own predicate.
  - RED: 30, 60 and 30000/1001 off grid at frame 1; perturbed at 1; a seeded stale v1 memo read back at 1.
  - With the producer repaired but the key unchanged, only the stale-memo clip stayed RED. That isolates the cache defect.
- `python/tests/test_footage.py`: its fixture gained the integer `best_effort_timestamp` and `time_base` `1/1000000`, encoding the same
  instants as its existing text. Its assertions are unchanged.

**GREEN.** Python 13/13 (`r02a-step1-python-green.log`); media 1/1 (`r02a-green-media.log`).

**Cross-language check.** For every frame index below the 72,000-frame bound, at 30, 60, 30000/1001, 25, 50, 24000/1001, 60000/1001 and
24 fps, Python's `float(Fraction)` equals the built `secondsOf`. 576,000 instants, 0 mismatches (`r02a-cross-language-exactness.log`).

## 22. R02-B: `local-media/` is a private location

`privateLocationRefusal` now accepts `.local-media/`, `local-media/` and `.local-runs/`. Tracked locations are still refused, and outside
the repository the owner-path rule is unchanged.

- `tests/edit-real-footage-r02.test.ts` (3D-R02B) checks the three accepted locations, both path separators, five tracked locations
  (including look-alikes) refused, three outside paths, and that `.gitignore` lists all three locations.
- RED: exactly the two `local-media/` cases were refused. GREEN: 1/1.

## 23. Blocker 4, found before the analysis: unspecified sample aspect ratio

The accepted staged-input conformance requires `sample_aspect_ratio === "1:1"` (`packages/edit-render/probe.ts:157`). For a stream with an
unspecified SAR, ffprobe omits the field. The analyzer treats an unspecified SAR as square.

The accepted pure `evaluateInputConformance`, run over the pinned ffprobe output with the exact conformance entries and the repaired
frame tables (`conformance-preflight.json`):

| Sources | Verdict |
|---|---|
| Akshat, Deepinder, Ritesh, Robert, Iman | `source_video_nonconforming` |
| LukeRaw, MrBeastRaw | conforms |

The only fps- and aspect-compatible distinct pair (Akshat + Deepinder) would therefore fail at render preparation. LukeRaw (30/1) and
MrBeastRaw (30000/1001) cannot pair.

**Owner decision (2026-10-03):** "LukeRaw, two clips", a same-source timeline. The SAR rule is accepted Batch-2B behavior and was not
changed; changing it would be a protected change outside R02.

## 24. R02-C: a bounded analysis of LukeRaw

- **Footage set.** `local-media/phase2-real/batch3d-lukeraw-authorized-footage.json` (`36e5f35b…`) holds LukeRaw's accepted entry,
  content-identical; only the key order differs after schema parsing.
- **Config.** The default analyzer config with `maximumPerAsset` 16 and `maximumPerProject` 32: `footage-config-bounded.json` (`6a923910…`).
  Configuration identity `configuration_c7f27992…`; the default is `configuration_666cb36c…`.
- **No model compute, predicted first.** A replay of the accepted lattice functions with exact frame times predicted identical cheap (61) and
  semantic (4) frame selections, all cached (`r02c-cache-reuse-replay.json`).
- **Run.** Job `footage_85d87e22-56ea-423c-910a-96607cce9a78`: 4 frame-cache hits, 0 misses, 0 frames embedded, so no SigLIP inference;
  13 s; 16 candidates.
- **Analysis.** `footage_f2884bdb…` (file `10430a3b…`). Frozen model; `owner_supplied` / `permission_granted`; 457 frames exactly on the
  30/1 grid; 16 retained candidates.
- **Pre-harness admissibility** (committed pure core, `r02c-pre-harness-admissibility.json`): **PASS**.
  - Plan: 30/1 at 999,000,000 ticks/s, 1080x1920, audio excluded.
  - Candidates: frames 0-90 (`frame_pts_exact`) to lock and frames 74-164 (`source_seconds`) to trim. They overlap by 16 source frames:
    deterministic verification input, not an editorial choice.

## 25. Owner-local real-footage run (2026-10-03): 15/16 PASS; harness defect in scenario 14

The committed runner ran over the R02 bytes:

- Run manifest `run-manifest-lukeraw-2.json` (`ca44f382…`): exact owner template, `sourceAudio: "excluded"`, both timeline entries
  LukeRaw with `candidateId: null`.
- The first manifest file had its path mangled by shell escaping, was never used, and is kept as is.
- Evidence: `.local-runs/phase5-gate7/b3d-20261003T051625Z-0388/`. The receipt is **valid**; 2198 s; runner exit 1.

| Scenario | Result |
|---|---|
| Manifest and source verification; source admissibility | PASS (30/1 CFR on grid, clock 999,000,000) |
| Baseline render; technical QC; observation; critic | PASS: output `9c1c2ade…` (3,139,669 bytes), 2 segments + assembly, QC pass, 6 observations, 0 findings |
| EditingHead initialization; state-only HARD_EXACT lock | PASS: no media process for the lock |
| Render failure atomicity; CAS loser | PASS: `render_failed` without head movement; `stale_editing_head` with the concurrent head current |
| Published trim; localized reuse | PASS: 15 frames removed; child `461dab97…` (2,854,881 bytes), QC pass; locked segment `036197df…` reused, changed segment `96886f5d…` recomputed; 2 render processes |
| Locked-target refusal; historical preference; stale request | PASS: `hard_lock_conflict`; state-only; `stale_editing_head` |
| QC failure atomicity | **FAIL**: `EditRepairError: impact_input_invalid` |

These claims were checked against the actual bytes and records (`run-evidence-verification.json`):

- Both outputs exist with their recorded SHA-256 values, and the child output differs from the baseline.
- The segment dispositions and computation identities hold.
- The scenario-14 attempt started no media process, and the final head equals the preference head.

**Root cause (HARNESS_DEFECT, not repaired).**

- `LocalEditingProject.authorize` checks the parent DAG against the **current** head's graph (`scripts/edit-editorial-local.ts:161`,
  `packages/edit-repair/impact.ts:88-91`).
- Scenario 14 proposes a trim of revision 1, the published trim, but passes the revision-0 DAG: `parentDag: parent.v` at
  `tests/edit-real-footage.local.ts:445`.
- The accepted code refused fail-closed before any render. Lines 343, 355 and 377 are correct because their parents are revision 0.
- The cloud test 3D-H07 never authorized a second revision, so the defect stayed latent.

The smallest repair (not applied; it needs the owner's authorization):

- Keep the published child's validated DAG from scenario 9 and pass it as `parentDag` in scenario 14.
- Add a regression that authorizes a second revision from the published head without media.

QC-failure atomicity on real footage is therefore **not exercised** by this run. The accepted 3C M02 covers it on synthetic media.

## 26. Environment finding: 3D-L01 and the 8.3 temporary path

On this machine `TEMP` is the 8.3 alias `C:\Users\KOUSHI~1\AppData\Local\Temp`. The accepted 3D-L01 compares the authority's real paths
with unresolved `tmpdir()` paths (`tests/edit-real-footage-lifecycle.test.ts:125,163`).

| Run | Result | Log |
|---|---|---|
| Pristine `d579a0e` checkout in a separate scratch worktree, default `TEMP` | **FAIL** (the same assertion) | `l01-pristine-default-temp.log` |
| Current bytes, with `TEMP` set to the long real path | **PASS** | `l01-current-long-temp.log` |

The failure predates R02 and is environmental. It is recorded, not repaired.

## 27. Verification status and owner-review manifest (R02)

**Gates and focused tests.**

- Focused tests on the final bytes: Python suite 23/23; R02-A media 1/1; R02-B 1/1; footage core and local 18/18; audit policy and
  workspace boundary 10/10; Phase-2 footage media 2/2. 3D harness, lifecycle and R01: 20/21, with L01 the §26 environment failure.
- `npm run typecheck`, `npm run build`, `npm run audit:workspace` (128 files, 17 adapters) and `git diff --check`: PASS.
- The full safe suite and `npm run verify`: **NOT RUN**. The owner allowed them only after a stable real-footage path.

**Files.**

| Change | Files |
|---|---|
| Modified | `python/reference_analyzer/media.py` (`62adcb7b…` → `93b8f3cf…`), `scripts/footage-local.ts` (`334d77d2…` → `9513ccc1…`), `tests/support/edit-real-footage.ts` (`facd8214…` → `e63472a2…`), `python/tests/test_footage.py` (`00ecba98…` → `f88766f7…`) |
| Added | `python/tests/test_footage_exact_time.py` (`3fb18bd5…`), `tests/footage-exact-time-media.integration.ts` (`ad9254d6…`), `tests/edit-real-footage-r02.test.ts` (`1354f7da…`) |
| Docs | this addendum and `docs/CURRENT_PHASE.md` |

- Unchanged: the renderer, contracts, schemas, dependencies and lockfile, and every pinned file.
- No media is committed. Source bytes are unchanged: all 9 sources re-hashed 9/9 after the run.
- Evidence: `.local-runs/phase5-gate7/batch3d-r02-20261003/`.
- Nothing is committed or pushed. The owner allowed one repair commit only if the repair **and** the real-footage run succeed.

**Superseded statements** (kept above as written):

- §4 "The practical V0 path is conforming CFR H.264 footage with source audio excluded". Before R02-A, 30, 60 and 30000/1001 fps could not
  pass, and an explicit SAR 1:1 is also required (§23).
- §14 "A manifest inside the repository must live under `.local-media/` or `.local-runs/`". `local-media/` is accepted too (§22).
- §16 and §18 "Real footage verified: **NO — PENDING OWNER LOCAL RUN**". The run executed with 15/16 PASS (§25).

R02 repairs: **IMPLEMENTED** (uncommitted, pending owner review)

Real-footage run: **FAIL** (15/16 PASS; scenario 14 harness defect, not repaired)

Real footage verified: **FAIL — NOT A PASS CANDIDATE**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

## 28. Owner final-closure ruling (2026-10-03)

- **Decision 1.** The scenario-14 failure is a verification-harness defect. Repair only the harness; production authorization stays
  unchanged. The invariant: the current parent EditingHead graph, the parent DAG's graph and the prior passing render/QC all name one
  revision.
- **Decision 2.** The sample-aspect-ratio rule is deferred: `probe.ts` is not modified. The proof may use two ranges of the one LukeRaw
  source. Broad formats, distinct physical multi-source execution, non-square pixels and ingest normalization stay **NOT VERIFIED**.
- **Decision 3.** Run 3D-L01 unchanged, with `TEMP`/`TMP`/`TMPDIR` set to an ignored long-form directory.
- **Gating.** Any scenario failure stops the round: no full suite, no commit.

## 29. R02-D: the QC-failure harness parent repair

- **RED.** The preserved production refusal from the first R02 run: `impact_input_invalid`, with `qc_failure` render counts 0/0/0
  (`batch3d-final-20261003/r02d-red-evidence.txt`).
- **Repair** (harness only):
  - `revisionParent` in `tests/support/edit-real-footage.ts` returns the parent execution only when all of these name one exact graph and
    revision: the current head's graph binding, the context graph, the parent DAG, the prior render receipt (DAG and render computation)
    and the prior passing QC (receipt, DAG and render computation). Anything else is refused as `revision_parent_mismatch`.
  - The runner keeps the published trim's validated DAG, receipt and QC from scenario 9.
  - Scenario 14 authorizes and executes against them, and records the parent, the child, the render receipt, the QC receipt and the head
    before and after (`evidence.qcFailure`).
- **Regression.** 3D-R02D, added with the repair (before it no harness check existed). The published child is accepted after publication;
  the first R02 run's configuration (revision-0 DAG on a revision-1 head) is refused. The baseline is accepted before publication. A
  foreign receipt, a foreign QC, a failed QC and a context that is not the head's graph are refused.
- **Hashes.** Runner `80272f69…` → `1918bc08…`; support `e63472a2…` → `3ecbbc56…`; R02 tests `1354f7da…` → `394352af…`.

## 30. Controlled long-form temporary directory; 3D-L01 unchanged

| Item | Value |
|---|---|
| `TEMP` = `TMP` = `TMPDIR` | `C:\Users\KOUSHIK VARDHON\creator-intelligence-platform\.local-runs\test-temp`, ignored by `.gitignore:15` |
| `os.tmpdir()` | that exact path, equal to its real path, no `~` alias |
| 3D-L01 | **PASS** (1/1); the test file is byte-identical to `d579a0e` (`c97456b5…`) |

Evidence: `temp-environment.txt` and `l01-long-temp.log`.

Focused tests under that environment:

| Suite | Result |
|---|---|
| Batch-3D files (R01, L01-L12, H01-H08, R02B, R02D) | 23/23 |
| R02-A media | 1/1 |
| Python | 23/23 |
| Footage core and local, audit policy, workspace boundary | 28/28 |

## 31. Second R02 real-footage run (2026-10-03): 15/16; QC-failure refused at the permit (EVIDENCE_FRESHNESS)

**Inputs.** All reused byte-identical, with no new analysis and no model inference:

- run manifest `ca44f382…`, footage set `36e5f35b…`, config `6a923910…`;
- analysis `10430a3b…` from job `footage_85d87e22-…` (4/4 cache hits, 0 frames embedded);
- the 9 sources re-hashed 9/9 before and after.

**Run.** Evidence `.local-runs/phase5-gate7/b3d-20261003T062658Z-361b/`. The receipt is valid; 2440 s; runner exit 1.

**Verified independently** (`final-run-verification.json`):

- 15 scenarios PASS, every check identical to run 1.
- The baseline `9c1c2ade…` and the child `461dab97…` are byte-identical to run 1.
- The GraphDiff parent is revision 0, with one trim operation whose replacement equals the exact keep range.
- The child is a new revision-1 EditGraph 0.4.0.
- Reuse and recompute are truthful; the critic executed with 0 findings.

**Scenario 14** (`qc_failure_atomicity`): **FAIL**, `EditRenderError: runtime_probe_stale`.

- The R02-D repair worked: `project.authorize` accepted the published revision-1 DAG as parent.
- The refusal came later, inside `LocalEditingProject.execute`. `issueExecutablePermit` → `evaluateRealExecutionEvidence` found the
  runtime probe from `prepare` older than the 60 s window.
- `execute` runs `assertCurrent`, and the permit runs its own checks, before the freshness evaluation (`scripts/edit-editorial-local.ts:174-178`).
- The policy already uses the accepted maximum `Age.max(60_000)` (`packages/edit-render/records.ts:56`).
- No render started (`ffmpegRender` 0); the head did not move (final head = preference head); no corrupt output exists.

| Phase (s) | Revision 0 → 1 (scenario 9) | Revision 1 → 2 (scenario 14) |
|---|---|---|
| propose + child execution + authorize | 268.5 | 681.0 |
| `prepare` | 9.6 | 14.3 |
| `execute` | 90.8 (including render and QC) | 114.0 (stale before the permit) |

On this machine, the accepted pre-permit validation of a revision-2 child takes longer than the accepted 60 s evidence window.

**Category:** EVIDENCE_FRESHNESS. Not repaired: it needs a production performance change, a protected threshold change or a different
scenario design, all outside this ruling.

**Smallest harness-only option, for the owner.** Exercise QC-failure atomicity on a revision 0 → 1 attempt from the early head, as
scenarios 7 and 8 do. Use a distinct trim amount, so its output identity never collides with the published child. That pre-permit path
already passed three times per run.

## 32. Status (2026-10-03, after the second R02 run)

**Preserved history, in order:**

1. The first owner-local attempt: no admissible pair (§19).
2. The first R02 run: 15/16, QC-failure not exercised because of the harness parent-DAG defect (§25).
3. The second R02 run: 15/16, QC-failure authorized but refused stale at the permit (§31).

**Gates.**

- The full safe suite and `npm run verify`: **NOT RUN**; any scenario failure stops the round.
- Nothing is committed or pushed. Source bytes are unchanged.

**Limitations.** Each is **NOT VERIFIED**, or not implemented:

- the proof uses two timeline ranges of one physical LukeRaw source, so distinct physical multi-source execution is NOT VERIFIED;
- sample-aspect-ratio and non-square-pixel normalization: NOT VERIFIED;
- broad production ingest: NOT VERIFIED;
- VFR normalization: NOT implemented here;
- professional editing quality: NOT VERIFIED;
- the autonomous Director: NOT VERIFIED.

**Superseded statement.** §25's "The smallest repair (not applied; it needs the owner's authorization)". It was applied as R02-D under
the §28 ruling (§29).

R02 and R02-D repairs: **IMPLEMENTED** (uncommitted)

Real-footage run: **FAIL** (15/16; QC-failure atomicity not exercised, EVIDENCE_FRESHNESS)

Real footage verified: **FAIL — NOT A PASS CANDIDATE**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING**

Gate 7 overall: **NOT YET COMPLETE**

## 33. Owner ruling R02-E (2026-10-03)

The owner authorized §31's smallest harness-only option as **R02-E**: exercise QC-failure atomicity as its own revision 0 → 1 attempt,
with an exact trim distinct from the published one. No production file changed (§37). The accepted 60 s evidence window and the permit
checks are untouched, and §31's revision 1 → 2 observation stays a recorded limitation.

## 34. R02-E: QC failure as its own revision 0 → 1 attempt

**RED** (test first, on the R02-D harness bytes: support `3ecbbc56…`, runner `1918bc08…`).

- 3D-R02E (`tests/edit-real-footage-harness.test.ts`, then `039dcf36…`) builds both trims from the locked revision-0 head without
  media and compares every identity in one assertion.
- The build reported the API that did not exist yet (TS2554 for the fifth `trimRequest` argument; TS2339 for `revisionIdentity` and
  `distinctRevisionRefusal`) and still emitted JavaScript (`red-build.log`).
- The test failed on exactly four properties: `qcTrimStrictlySmaller`, `distinctReplacement`, `distinctChangedSegment` and
  `outputsCannotCollide` (`r02e-red.log`). Without `fewerThan` the QC attempt repeated the published trim. Its GraphDiff, child graph,
  DAG and render computation identities still differed, because they bind the request key, so those identities alone cannot show a
  distinct edit.
- The later assertions (`revisionIdentity`, `distinctRevisionRefusal`, `revisionParent`) could not run on the RED bytes.

**Repair** (harness only):

- `trimKeep` and `trimRequest` take an optional `fewerThan`: the trim then removes strictly fewer frames. `selectTimeline` admits a
  candidate only when both the published trim and that smaller trim exist.
- The QC-failure scenario now runs right after render-failure atomicity, and only from the locked revision-0 head
  (`qc_failure_parent_not_current` otherwise). It proposes the smaller trim (`b3d_trim_second_qc`), authorizes against the revision-0
  parent checked by `revisionParent`, and injects the 4-byte fault after QC fixes the output identity, as before.
- `revisionIdentity` collects one proposed revision's identities. `distinctRevisionRefusal` refuses the attempt
  (`qc_failure_child_not_distinct`) unless every identity differs from the published trim's edit and the locked segment stays reusable
  from the parent.
- The former last scenario, a revision 1 → 2 trim (`b3d_trim_second_c`), is removed. No scenario executes a revision 1 → 2 child now.

**GREEN.** 3D-R02E 1/1 (`r02e-green.log`). Support `3ecbbc56…` → `7c16e4a6…`; runner `1918bc08…` → `eba4254b…`; harness test
`039dcf36…` → `e0a45d8e…` (`2f9d854d…` at `d579a0e`).

**Process observation.** The harness test changed between the RED (`039dcf36…`) and the GREEN (`e0a45d8e…`). The RED bytes were not
preserved and the change was not recorded. Every later run used the GREEN bytes.

**Focused tests** (`TEMP` = `.local-runs\test-temp`): Batch-3D files 24/24 (3D-R02E added), R02-A media 1/1, Python 23/23, footage
core and local, audit policy and workspace boundary 28/28. `npm run typecheck`, `npm run audit:workspace` and `git diff --check`: PASS.
Evidence: `.local-runs/phase5-gate7/batch3d-r02e-20261003/`.

## 35. Third R02 run (2026-10-03): stopped by the Claude Code memory-pressure reaper

- The runner ran over the R02-E bytes (runner `eba4254b…`, support `7c16e4a6…`; `TEMP` = `.local-runs\test-temp`) as a Claude Code
  background shell: run directory `b3d-20261003T092935Z-bec5`, started 09:29:34Z.
- At about 15:12 local time, after the CAS-loser render, Claude Code's memory-pressure reaper stopped the shell while the session was
  idle. This is not a command failure. The runner never reached `finish()`: no receipt, evidence or timings were written.
- Afterwards no runner, FFmpeg or ffprobe process remained; free commit was 9.34 GB and free physical memory 4.26 GB.
- Its partial outputs are diagnostic only: `9c1c2ade…` (the baseline), `0361c3f6…` (the QC-failure attempt's output; its bytes are
  `930f06bc…` after the deliberate append) and `461dab97…`.
- It was not restarted from the session. Evidence: `batch3d-r02e-20261003/reaped-run.txt`.

## 36. Fourth R02 run (2026-10-03, owner terminal): 16/16 PASS

The owner ran the committed runner over the R02-E bytes in their own terminal, outside Claude Code.

- Evidence: `.local-runs/phase5-gate7/b3d-20261003T101716Z-bcfa/`. The receipt is **valid**, SHA-256
  `b646ea76d559622fb0a366a740ec491ab30c805d8ead3b14e19755f14bf8e65c`; runner exit 0 (`harness-run-owner.log`); about 27 min.
- Inputs, all reused byte-identical: run manifest `ca44f382…`, footage set `36e5f35b…`, analysis `footage_f2884bdb…` from job
  `footage_85d87e22-…` (4 frame-cache hits, 0 frames embedded). No analysis and no model inference ran. Pinned FFmpeg `72a489ec…`,
  ffprobe `19202b23…`. The 9 sources re-hashed 9/9 before and after.

| Scenario | Result |
|---|---|
| Manifest and source verification; source admissibility | PASS: the declared source re-hashed in full; 30/1 CFR on grid, 1080x1920, audio excluded, clock 999,000,000 |
| Baseline render; technical QC; observation; critic | PASS: output `9c1c2ade…` (3,139,669 bytes, 2 segments), QC pass, 6 observations, critic executed with 0 findings |
| EditingHead initialization; state-only HARD_EXACT lock | PASS: no media process for the lock |
| Render failure atomicity | PASS: `render_failed`; the head did not move |
| QC failure atomicity (R02-E) | PASS: a distinct 14-frame revision 0 → 1 trim rendered; its bytes changed after QC fixed their identity; QC failed; the head did not move |
| CAS loser | PASS: `stale_editing_head`; the concurrent head stayed current |
| Published trim; localized reuse | PASS: 15 frames removed through GraphDiff, child render, QC and CAS; child `461dab97…` (2,854,881 bytes), QC pass; locked segment reused, only the changed segment and the assembly ran |
| Locked-target refusal; historical preference; stale request | PASS: `hard_lock_conflict`; state-only; `stale_editing_head` |

**Verified independently** (`batch3d-r02e-20261003/final-run-verification.json`):

- The receipt is schema-valid with 16/16 PASS. Both outputs exist with their recorded SHA-256 values, differ from each other, and
  each QC pass is of its own output.
- The critic executed; its recorded findings equal its report (0); the semantic channel is `not_computed_no_semantic_critic_port`, so
  there is no actionable finding and no automatic repair.
- The GraphDiff exists; the child is a new revision-1 EditGraph 0.4.0; the published trim's prior is the baseline; reuse and
  recomputation are truthful.
- The lock started no process; the render failure, CAS loser, locked edit, stale request and preference behaved as the table says.

**QC-failure atomicity in detail.**

- Parent: the locked revision-0 head. Child: revision 1, 14 frames removed (published: 15); 166 output frames (published: 165).
- GraphDiff, child graph, render computation and changed segment all differ from the published trim; the locked segment is shared.
- The render started (2 FFmpeg render processes): segment 0 `reused_verified_prior_artifact`, segment 1 `computed_by_this_execution`.
- After QC established the output identity, 4 bytes were appended to that output (a deliberate verification fault). QC read the changed
  bytes: verdict `fail`, failed check `output_identity`; outcome `qc_failed`.
- The head before equals the head after. The corrupt output never became authoritative: its name `0361c3f6…` no longer matches its
  bytes `930f06bc…`.

**Not shown by this run.** No scenario executes a revision 1 → 2 child any more. §31 remains the only evidence on that path: the
accepted pre-permit validation took about 114 s against the 60 s window and was refused `runtime_probe_stale`, with no render and no
head movement.

## 37. Final repository gates (2026-10-03)

**First run on the final bytes** (`.local-runs/phase5-gate7/batch3d-final-gates-20261003/`, Claude Code session; `TEMP` = `TMP` =
`TMPDIR` = `.local-runs\test-temp`):

- `npm run typecheck`, `npm run build`, `npm run audit:workspace` (128 files, 17 adapters) and `git diff --check`: PASS.
- Full safe suite, `node --import ./scripts/no-network.mjs --test --test-concurrency=1 dist/tests/*.test.js` (49 files): 1078 tests,
  **1077 pass, 1 fail**, 0 cancelled, 0 skipped, 0 todo; 1855 s (`full-safe-suite.log`).
- The failure is the accepted Batch-2A test "runtime state stays inside isolated temporary roots, never tracked directories"
  (`tests/edit-runtime.test.ts:1335`). It requires the runtime root outside the repository, and `os.tmpdir()` was inside it. Category:
  ENVIRONMENT.

**Diagnostic** (`temp-conflict-diagnostic.txt`; the two tests only, no code change):

| `os.tmpdir()` | Batch-2A isolation | 3D-L01 |
|---|---|---|
| `C:\Users\KOUSHIK VARDHON\creator-intelligence-platform\.local-runs\test-temp` (long form, inside the repository) | FAIL | PASS |
| `C:\Users\KOUSHIK VARDHON\AppData\Local\Temp` (long form, outside) | PASS | PASS |
| `C:\Users\KOUSHI~1\AppData\Local\Temp` (8.3 alias, outside) | PASS | FAIL |

**Owner ruling (2026-10-03).** The 1077/1078 run is not a production-code failure. One corrected full-suite rerun is authorized with
exactly `C:\Users\KOUSHIK VARDHON\AppData\Local\Temp`, and no source change.

**Corrected full safe suite** (owner terminal). The runner `run-corrected-full-safe-suite.sh` runs the same command. It refuses to start
unless `os.tmpdir()` is exactly that path and its real path is that long form outside the repository, the 9 source hashes match, and
`dist/` is newer than every source.

- Attempt 1 (12:02:18Z, `full-safe-suite-corrected-longtemp.log`): **interrupted** after about 2.5 min, while
  `edit-editorial-hostile.test.js` was running. node:test printed "Interrupted while running"; there is no summary and no exit line.
  The 149 results before it are all passes. The log does not record the cause. It is not a result.
- Attempt 2 (12:15:27Z, `full-safe-suite-corrected-longtemp-attempt2.log`; its runner differs only in the log name):
  **1078 tests, 1078 pass**, 0 fail, 0 cancelled, 0 skipped, 0 todo; exit 0; 2321 s. Its header records `os.tmpdir()` and its real
  path as `C:\Users\KOUSHIK VARDHON\AppData\Local\Temp`, outside the repository, with HEAD `d579a0e` and source bytes 9/9.

**`npm run verify`** (owner terminal, `npm-verify-longtemp.log`). The log records `TEMP=C:\Users\KOUSHIK VARDHON\AppData\Local\Temp`; it
does not record `TMP`, `TMPDIR` or `os.tmpdir()`. Both temp-sensitive tests passed inside it, which needs a long-form temporary
directory outside the repository (diagnostic above).

| Stage | Result |
|---|---|
| typecheck | PASS |
| build (inside `npm test`) | PASS |
| `npm test` (default concurrency) | **1078/1078 PASS**; 0 fail, 0 cancelled, 0 skipped, 0 todo; 688 s |
| workspace audit | PASS: 128 files, 17 adapters |
| schema check | PASS: 33 schema and synthetic fixture artifacts |
| demo | PASS |
| `test:media` | **57/57 PASS**, including 3D-R02A; 322 s |
| `test:python` | **23/23 OK** |
| final line | `npm verify exit=0` |

`verify` runs neither the real-footage runner nor a footage analysis, and its SigLIP test uses generated tiny parameters, not the frozen
model. After §36, only these gates, the two-test diagnostic and the read-only closure checks ran.

**Closure checks** (read-only; `closure-checks-before-docs.txt` and `footage-rehash-closure.txt`):

- The 9 authorized footage files: **9/9 unchanged** (hash and size against the AuthorizedFootageSet; hash and mtime against the
  earlier receipt).
- The 9 changed or added code and test files: 9/9 equal to `final-source-sha256.txt`, the bytes every final gate ran. 3D-L01's test
  file is byte-identical to `d579a0e` (`c97456b5…`).
- Protected production files: all 31 TypeScript files under `packages/edit-render`, `packages/edit-runtime` and
  `packages/edit-execution`, and the three local render, QC and observation adapters, are byte-identical to `d579a0e`; no `packages/`
  file changed. `Age.max(60_000)` (`packages/edit-render/records.ts:56`) and `MAX_RECHECK_AGE_MILLISECONDS = 60_000`
  (`packages/edit-runtime/records.ts:204`) are unchanged.
- No dependency or lockfile change. Nothing under `.local-runs/`, `local-media/`, `.test-artifacts/` or `dist/` is tracked.

## 38. Status and owner-review manifest (2026-10-03, closure)

**Preserved history, in order:**

1. Cloud session: the accepted trusted execution boundary admitted only the synthetic-fixture lifecycle authority, and Batch 3D stopped
   (§1-§8); after the owner ruling, 3D-R01 and the harness (§9-§18).
2. Owner-local preflight: NO_ADMISSIBLE_REAL_FOOTAGE_PAIR (§19).
3. R02: exact frame times and metadata memo v2 (R02-A), `local-media/` (R02-B), a bounded LukeRaw analysis (R02-C) (§20-§24).
4. First R02 run: 15/16, the scenario-14 parent-DAG harness defect (§25).
5. R02-D, then the second run: 15/16, `runtime_probe_stale` on the revision 1 → 2 attempt (§28-§31).
6. R02-E (§33-§34); the third run, stopped by the Claude Code memory-pressure reaper (§35).
7. The fourth run, in the owner's terminal: **16/16 PASS**, receipt `b646ea76…` (§36).
8. First final safe suite: 1077/1078, one environmental TEMP-location failure (§37).
9. Corrected safe suite with `C:\Users\KOUSHIK VARDHON\AppData\Local\Temp`: attempt 1 interrupted, attempt 2 **1078/1078 PASS** (§37).
10. `npm run verify`: **PASS**, exit 0 (§37).

**Files** (SHA-256 at `d579a0e` → final):

| Change | File | SHA-256 |
|---|---|---|
| Modified | `python/reference_analyzer/media.py` | `62adcb7b…` → `93b8f3cf…` |
| Modified | `python/tests/test_footage.py` | `00ecba98…` → `f88766f7…` |
| Modified | `scripts/footage-local.ts` | `334d77d2…` → `9513ccc1…` |
| Modified | `tests/support/edit-real-footage.ts` | `facd8214…` → `7c16e4a6…` |
| Modified | `tests/edit-real-footage.local.ts` | `80272f69…` → `eba4254b…` |
| Modified | `tests/edit-real-footage-harness.test.ts` | `2f9d854d…` → `e0a45d8e…` |
| Added | `python/tests/test_footage_exact_time.py` | `3fb18bd5…` |
| Added | `tests/footage-exact-time-media.integration.ts` | `ad9254d6…` |
| Added | `tests/edit-real-footage-r02.test.ts` | `394352af…` |
| Docs | this record and `docs/CURRENT_PHASE.md` | recorded outside them, after their last edit |

- Unchanged and byte-identical to `d579a0e`: renderer exactness (`packages/edit-render/program.ts:120-122`), the `probe.ts`
  conformance authority (including SAR `1:1`), both 60 s ceilings, executable-permit authorization (`authorize.ts`) and the trusted
  runtime execution boundary. Contracts, schemas, dependencies, the lockfile and 3D-L01 are unchanged too.
- No media, receipt, manifest, model file or `.local-runs/` content is committed.
- This record and those bytes are committed once on `phase/5-gate7-3d-real-footage` as `fix(gate7): complete Batch 3D real-footage
  verification`; `main` is not modified.

**Limitations:**

- MULTI-REVISION REAL EXECUTION FRESHNESS: **LIMITATION OBSERVED / NOT FULLY VERIFIED** (§31; the 16/16 run executes no revision
  1 → 2 child).
- DISTINCT PHYSICAL MULTI-SOURCE EXECUTION: **NOT VERIFIED** (both timeline entries are ranges of one LukeRaw source).
- BROAD MEDIA INGEST: **NOT VERIFIED**.
- VFR NORMALIZATION: **NOT IMPLEMENTED** (variable and off-grid timelines still fail closed).
- NON-SQUARE-PIXEL / SAR NORMALIZATION: **NOT VERIFIED** (§23).
- PROFESSIONAL EDITING QUALITY: **NOT VERIFIED**.
- AUTONOMOUS DIRECTOR: **NOT VERIFIED** (the edits are deterministic verification input).

**Superseded statements** (kept above as written):

- The status line at the top of this record ("PENDING THE OWNER-LOCAL REAL-FOOTAGE RUN").
- §27 and §32 "Real footage verified: **FAIL — NOT A PASS CANDIDATE**", and §32 "Real-footage run: **FAIL** (15/16; …)". The fourth
  run passed 16/16 (§36).
- §27 and §32 "The full safe suite and `npm run verify`: **NOT RUN**". Both ran (§37).
- §27 and §32 "Nothing is committed or pushed". This closure commits once, as above.
- §31 "Smallest harness-only option, for the owner". It was applied as R02-E (§33-§34).

R02, R02-D and R02-E repairs: **IMPLEMENTED**

Real-footage run: **PASS** (16/16, owner terminal)

Real footage verification: **PASS — CANDIDATE FOR OWNER ACCEPTANCE**

Professional editing quality: **NOT VERIFIED**

Batch 3D owner acceptance: **PENDING INDEPENDENT OWNER REVIEW**

Gate 7 overall: **NOT YET COMPLETE**

Phase 6: **NOT STARTED**
