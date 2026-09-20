# Phase 2.6A acceptance repair — 2026-09-20

Ruling: **PASS** for the explicitly authorized architecture-freeze and guarded TransNetV2 integration acceptance. Phase 2 remains historically CLOSED. Session 2 editorial implementation, Phase 2.6B execution and Phase 3 remain NOT STARTED and are not authorized by this report.

## Recovery and root causes

The owner explicitly authorized Git initialization. The reviewed 170-file source inventory was committed on main as `07eaf2c35779edf5c7febd1151dbe163522038d6`, `chore: establish pre-github project baseline`, before implementation repairs. This is an intentional recovery commit containing the two known failures, not a green release. Repository-local identity is ChetanKumor, `chetankumor9@gmail.com`. Local automatic line-ending conversion is disabled to preserve source bytes. No prior Git history existed.

Fresh reproductions preserved both failures. The workspace audit permits only Zod and node:crypto in application packages. Three audio workers imported node:child_process, while the TransNetV2 wrapper imported node:child_process and node:path and accessed process environment. These were actual subprocess dependencies, not typing-only imports. Local audio providers also constructed those workers transitively from package code. The existing architecture assigns process/filesystem composition to scripts, as already implemented by reference-local and footage-local.

The schema exporter explicitly identifies TypeScript-owned Zod contracts as authoritative. The already-integrated footage detector union accepted explicit TransNetV2 configuration, but the two generated JSON schemas still exposed only the previous PySceneDetect branch. No source contract correction or version change was needed.

## Bounded repair

- Relocated the beat, energy and structure workers into `scripts/audio-beat-worker.ts`, `scripts/audio-energy-worker.ts` and `scripts/audio-structure-worker.ts`.
- Relocated their five existing local provider/composition classes into `scripts/audio-local.ts`. Contracts, provider interfaces, constants, schemas and pure combination functions remain in `packages/audio-analyzer`. Runtime consumers now import the local adapter; package barrels do not re-export runtime classes. These are internal import-location changes, not public interchange changes.
- Relocated the TransNetV2 wrapper into `scripts/transnetv2-local.ts`; updated only the corresponding imports in footage-local and its existing smoke entry point.
- Extended the existing local-adapter audit to those five named scripts with the same dependency and no-shell policy. The application import allowlist remains unchanged. Added an explicit prohibition against package/sample imports into scripts, so relocation cannot hide reverse runtime coupling.
- Added three regression tests using isolated synthetic source trees. They prove allowed contract/adapter separation, rejection of direct subprocess and reverse adapter imports, and retained network-import/no-shell checks for every relocated adapter.
- Ran the canonical `npm.cmd run schemas:generate`. Only FootageConfig and FootageAnalysis changed: detector became an anyOf containing the exact previous detector schema plus the strict TransNetV2 kind/threshold branch. Mechanical comparison confirms all other fields and schema identifiers/versions are identical.
- Updated CURRENT_PHASE and regenerated the project tree. No dependency, Python implementation, model, timing, detector-selection or audio feature change.

## Verification

`npm.cmd run verify` completed with exit 0 at 2026-09-20T09:32:51.226Z.

| Gate | Result |
| --- | --- |
| Typecheck and build | PASS |
| TypeScript tests | 89 PASS, zero failed/skipped: 86 existing plus three boundary regressions |
| Existing TransNetV2 footage contract tests | All three PASS within the TypeScript suite |
| Reference/core/local/migration/frozen-contract regressions | PASS within the existing suite |
| Workspace audit | PASS: 42 application files and nine explicit local adapters |
| Generated schema/fixture verification | 33 PASS |
| Synthetic contract demo | PASS; incomplete media QC remains explicit |
| Media regressions | Six PASS, zero failed/skipped; synthetic media and stub embeddings |
| Python tests | Eleven PASS; mocks/generated tiny parameters, not new pretrained inference |
| Historical closure-artifact hashes | 66/66 match |
| Protected source/contracts/dependencies | 43/43 match Session 1 snapshot |
| Authorized source media | Nine/nine source hashes and sizes match; bytes untouched |

The focused pre-suite run also passed all three TransNetV2 tests and all three new boundary tests. An auxiliary preservation script initially addressed the FootageAnalysis property as `config` rather than `configuration` and stopped; correcting that audit lookup completed the read-only comparison. No application change resulted from this harness error.

## Source identity and historical evidence

All six integration-receipt SHA-256 values matched the recovery baseline before repair. After repair, the integration test, footage index, footage protocol and TransNetV2 protocol remain byte-identical. The remaining two are fully explained:

| Current path | Previous SHA-256 | Current SHA-256 | Change |
| --- | --- | --- | --- |
| scripts/footage-local.ts | 33b328d43ea4c03bb29b5e09c5e42e933cb280c041d8beb0a5c27549942bfa37 | 334d77d278861ce9d9bb1f8eda445d3c89fa67ee38a7c168db6a049d6b5e88ec | One wrapper import path |
| scripts/transnetv2-local.ts | e04cbbf39c1659326c1abda1181c31911886ce1519c3d10c58e38b2007902d2b | e49ba7156d023a4d49a82bb7355f976b85bea2ad86b48c3a94869d1909a9f95b | Relocated from packages/footage-analyzer/transnetv2.ts; one protocol import path |

The three audio worker files also match their baseline bytes after substituting only their protocol import path. All five relocated provider/composition class bodies match exactly. This preserves request validation, timeouts, output limits, sanitized errors, close behavior, model/checkpoint identity validation, and primitive-close-before-structure sequencing. No audio/model smoke entry point was executed.

Historical real-model receipts remain historical evidence, not fresh inference after relocation. No model was downloaded or newly run. The historical GPU smoke used synthetic media, has limited receipt binding, and does not establish real-footage LocalFootageServices execution or rollback-guard proof. The missing Session 1 verification.json remains missing. Earlier failures and receipts were not rewritten.

## Architecture invariants and next gate

1. PySceneDetect remains the default: content / 27 / two-frame minimum / adaptive threshold 3.
2. TransNetV2 remains opt-in and requires an explicit launch configuration. No silent fallback; the ordinary CLI still reports TRANSNETV2_NOT_CONFIGURED without it.
3. MediaTruth frameTimes/timelineFromCuts remains the canonical timestamp authority; its implementation is unchanged.
4. TransNetV2 provides cut/frame indices and provenance, not canonical timeline timestamps. Its protocol and Python implementation are unchanged.
5. Reference analyzer source, adapters and schemas remain isolated and unchanged.
6. SigLIP2 remains google/siglip2-so400m-patch16-naflex at cc24074f717b612951c2dead130904ab9b65a81e, CPU, 256 patches, observed dimension 1152 and the existing real embedding space. Guards and preprocessing are unchanged.
7. No new model, audio/music capability, Creative Ranker, Editorial Decision Graph, Phase 2.6B implementation or Phase 3 work was introduced.

Next engineering gate, requiring separate execution authorization: authorized real-footage LocalFootageServices -> TransNetV2 execution before any detector-default change. No superiority, professional editing quality or broad-domain generalization is claimed.

## Local evidence and publication exclusions

New logs and receipts are retained under excluded `.local-runs/github-baseline-audit-20260920/`: `pre-repair-resume-source-audit.json`, `repair-before-audit.{json,log}`, `repair-before-schemas.{json,log}`, `repair-after-audit.{json,log}`, `acceptance-full.{json,log}`, and `acceptance-preservation.json`. Historical evidence remains local; this report records conclusions without publishing media or receipts.

The initial sanitized scan found a probable credential only in excluded .env, no probable source-candidate secrets, no source candidate at least 10 MiB, and no candidate media/model binaries. Existing exclusions cover environment files, .local-runs, local-media, test artifacts, tools, caches, virtual environments, generated builds/media, weights and datasets. Final staged/history security and size checks remain mandatory immediately before publication. No secrets were printed.
