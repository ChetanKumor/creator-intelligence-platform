# Repository baseline audit — 2026-09-20

Ruling: **BLOCKED — no existing Git repository, no configured author email, GitHub CLI unavailable, and current verification gates fail.** Nothing was committed, published or uploaded. No Git metadata was created. Application implementation, reference analyzer, model configuration and detector defaults were not changed.

## Phase ruling and chronology

| Scope | Current evidence-backed ruling |
| --- | --- |
| Phase 2 | Historically CLOSED on 2026-09-15. All 66 indexed closure artifacts still match SHA-256. This does not accept later source changes. |
| Phase 2.6A Session 1 architecture | Design freeze COMPLETE, 2026-09-16, following the 2026-09-15 start. Its documentation remains separate from subsequent integration. |
| Later TransNetV2 integration | IMPLEMENTED / CONTRACT INTEGRATED; current baseline acceptance BLOCKED by workspace-audit and generated-schema failures. Not fully verified complete. |
| Session 2 editorial-contract implementation | NOT STARTED: proposed editorial package, tests and schema directory are absent. TransNetV2 work does not implement this handoff. |
| Phase 2.6A as a whole | NOT COMPLETE. |
| Phase 2.6B | NOT STARTED on available evidence; not executed or authorized by this task. |
| Phase 3 | NOT STARTED on available evidence; not executed or authorized by this task. |

The TransNetV2 integration receipt was created/modified at 2026-09-20T04:16:18Z. The later Session 1 amendment and original CURRENT_PHASE text acknowledged external drift but did not adopt its verification. File modification chronology alone does not establish authorization or success. This audit reconciles those documents against source hashes and fresh safe regressions.

Immediate prerequisite: a separately bounded correction must resolve the existing runtime-import policy violations and stale generated schemas without weakening verification. The next model execution gate remains **authorized real-footage LocalFootageServices -> TransNetV2 execution without changing PySceneDetect as default**. No such execution occurred here.

## Original repository state

Native working directory: `C:/Users/KOUSHIK VARDHON/creator-intelligence-platform`.

WSL working directory: `/mnt/c/Users/KOUSHIK VARDHON/creator-intelligence-platform`.

No `.git` file/directory exists at the project or inspected native ancestors. Windows has no Git executable on PATH or at the checked standard installation path. Git in Ubuntu reports `not a git repository` for the requested worktree/root/status/branch/HEAD/log/remote/tag commands. Thus original HEAD, current HEAD, branch, tags, index and remotes are unavailable, not empty verified Git histories. Historical closure and Session 1 records also explicitly describe the absence of Git metadata.

Ubuntu `git config user.name` and `git config user.email` returned no configured values. No email was invented. Repository-local author configuration cannot be established without a repository. Required future author name: `ChetanKumor`; no attribution/co-author trailer is to be added. No historical commits were rewritten.

`gh --version` and `gh auth status` failed because `gh` is absent in Ubuntu; it is also absent on the native PATH/checked standard installation path. No account, repository-existence check, visibility or remote HEAD equality was established. No remote was created. The requested authenticated-account workflow was not replaced with another account or connector.

## Worktree classification

There is no Git index, so these are comparisons to `.local-runs/phase2_6a_session1_20260915/baseline.json`, not invented Git modified/untracked statuses. All 245 snapshot entries were checked. Before this task's edits, four differed and none was missing:

| Existing changed path | Classification |
| --- | --- |
| `packages/footage-analyzer/index.ts` | Later detector integration; matches integration receipt. Preserve. |
| `packages/footage-analyzer/protocol.ts` | Later detector contract; matches receipt; generated schemas stale. Preserve. |
| `scripts/footage-local.ts` | Later explicit service integration; matches receipt. Preserve. |
| `docs/CURRENT_PHASE.md` | Stale/incomplete state summary; corrected in this task. |

Additional files absent from that snapshot:

| Exact paths or explicitly enumerated members | Classification |
| --- | --- |
| `docs/phases/phase-2.6a-session-1-architecture.md`, `docs/phases/phase-2.6a-editorial-contracts.md`, `docs/phases/phase-2.6a-session-2-handoff.md` | Architecture authority and historical amendments; preserve. |
| `packages/footage-analyzer/transnetv2-protocol.ts`, `packages/footage-analyzer/transnetv2.ts`, `tests/transnetv2-footage-contract.test.ts` | Later integration; six-file receipt and contract tests support current bytes. Release acceptance still blocked. |
| `python/transnet_detector/__init__.py`, `python/transnet_detector/__main__.py`, `scripts/transnetv2-provider-smoke.ts` | Provider support; present and inspected; not bound by the integration receipt's six source hashes. Preserve with provenance limitation. |
| `packages/audio-analyzer/beat.ts`, `energy-worker.ts`, `energy.ts`, `index.ts`, `music-analysis.ts`, `music-primitives.ts`, `protocol.ts`, `structure-worker.ts`, `structure.ts`, `worker.ts` | Existing additional audio work; no acceptance or authorization inferred from this TransNetV2 audit. Preserve, do not stage implicitly. All abbreviated members in this row are under `packages/audio-analyzer/`. |
| `python/audio_analyzer/__init__.py`, `__main__.py`, `energy_worker.py`, `structure_worker.py` | Existing audio workers, outside this task's integration acceptance. All abbreviated members are under `python/audio_analyzer/`. |
| `scripts/audio-energy-smoke.ts`, `audio-provider-smoke.ts`, `audio-worker-smoke.ts`, `music-analysis-smoke.ts`, `music-primitives-smoke.ts`, `structure-determinism-smoke.ts`, `structure-provider-smoke.ts`, `validate-beat-receipt.ts` | Existing audio diagnostics; not executed here. All abbreviated members are under `scripts/`. |
| `.env` | Private environment file; probable provider credential detected by sanitized scan; excluded, untouched and never staged. |

Existing local caches, environments, generated builds/test artifacts, authorized media and `.local-runs` are local-only data, not source candidates. No source was discarded or adopted into an unexplained baseline commit.

This task changes only `.gitignore`, `scripts/project-tree.mjs`, `docs/project-tree.txt`, `docs/CURRENT_PHASE.md`, and this new report. Local-only audit scripts/receipts are under `.local-runs/github-baseline-audit-20260920/`. The normal build regenerated the fixed `dist/` directory after its existing cleanup target/guard was inspected; normal synthetic tests generated local artifacts. No source media was changed.

## TransNetV2 evidence and limits

Receipt: `.local-runs/transnetv2/footage-integration-v2.json`, version `transnetv2-footage-integration-v2`, status `contract_integrated`. It asserts typecheck/build/contract tests/footage-reference regressions/owned-provider success, `referenceAnalyzerModified: false`, MediaTruth timestamp authority and PySceneDetect default.

All six receipt hashes match current bytes:

| Path | SHA-256 |
| --- | --- |
| `packages/footage-analyzer/transnetv2-protocol.ts` | `fa2f53bf93af1077c0015c0d97b3990c3789f52a3fb5b905d3f53bf7a18cea48` |
| `packages/footage-analyzer/transnetv2.ts` | `e04cbbf39c1659326c1abda1181c31911886ce1519c3d10c58e38b2007902d2b` |
| `packages/footage-analyzer/protocol.ts` | `990b179663715f7072688a4c5c2837f4810d8dead11b8cce96c92801a62cf75f` |
| `packages/footage-analyzer/index.ts` | `79300f23a9c052f0212f64c20bd64255fa891c47acf0bb9d4ab190155bb518e4` |
| `scripts/footage-local.ts` | `33b328d43ea4c03bb29b5e09c5e42e933cb280c041d8beb0a5c27549942bfa37` |
| `tests/transnetv2-footage-contract.test.ts` | `dff54de01273ae733757fe172ff8c0fe07b55a02c107d3dbf2fa584949c616a9` |

Provider identity:

- Adapter: `transnetv2-detector-adapter-0.1.0`.
- Upstream source commit: `85cef72af9a916bdfd7cc94a670c9cdfbf12d1ed` (not this project's HEAD).
- Upstream source SHA-256: `f55b3a75727d1502438707ac15e8f6257a736817e713e2113e4b84176500ca65`.
- Weight-set SHA-256: `00b40cfe38c3fd6fd6d278860d339eb347254e1559839688d870ad0389bf6d0a`.

`owned-provider-after-integration.txt` was created at 04:16:02Z and modified at 04:16:16Z on 2026-09-20. It records TensorFlow 2.15.0, CUDA, NVIDIA GeForce RTX 4050 Laptop GPU, 90/90 frames, cuts [30,60], three scenes and PASS. The local fixture is synthetic (`hard-cuts-90f.mp4`), not authorized real-footage service execution. Historical model load/decode/inference times are 3.784/0.094/5.469 seconds.

This is historical real-model smoke evidence, not a fresh model run or a cached real-footage run. The receipt has no embedded creation timestamp, repository source commit, Python-worker hash, GPU-log digest or rollback-guard attestation. Filesystem times are observations, not authenticated execution times. No retained independent proof of the reported rollback guard was found. Current external weight/source files were not independently located/rehash-verified from a recorded launch location; runtime provenance enforcement was inspected in source. No download, CUDA/model load or new pretrained inference was performed.

The limited receipt remains source-consistent. Its PASS assertions do not imply the wider workspace audit or generated-artifact gate passed; fresh checks demonstrate those gates fail now.

## Frozen invariants

1. **MediaTruth timestamps preserved.** `packages/footage-analyzer/index.ts` calls `timelineFromCuts(identity.assetId, metadata, result.cuts)`. The unchanged shared function resolves boundaries from `metadata.frameTimes[index]` and duration, not rounded FPS or provider timestamps.
2. **Detector outputs indices.** The strict TransNetV2 response carries ordered positive cut/frame indices, bounded frame counts and provenance, with no canonical timestamp payload. Python requires decoded frame count equality and uses FFmpeg passthrough frame cadence.
3. **Reference isolated.** No TransNetV2 reference was found in the reference analyzer/worker/composition path. Captured reference and SigLIP source hashes match the Session 1 baseline. The reference detector schema rejects TransNetV2; the footage union accepts it.
4. **Default preserved.** Footage defaults remain content detector / threshold 27 / minSceneFrames 2 / adaptiveThreshold 3 (PySceneDetect).
5. **Explicit availability, limited wiring.** LocalFootageServices accepts an optional TransNetV2 launch configuration. The normal analyze-footage CLI does not supply it. Selecting TransNetV2 without it raises `TRANSNETV2_NOT_CONFIGURED`; CLI configuration alone is not a ready deployment path.
6. **No silent fallback found.** TransNet errors close/reset the failed worker and rethrow. There is no automatic PySceneDetect substitution on that branch. This is source inspection plus existing regression evidence, not a newly executed failed TransNet worker experiment.
7. **Embedding identity preserved.** Frozen SigLIP2 So400m revision `cc24074f717b612951c2dead130904ab9b65a81e`, CPU, 256 patches, observed dimension 1152 and real space `space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687` remain unchanged. Snapshot hashes and compatibility/cache regressions support this; no fresh pretrained inference is claimed.
8. **Provenance enforced at integration.** Cache key binds detector/source content/frame count, adapter/source commit/source SHA/weight set, FFmpeg and preprocessing identity. LocalFootageServices checks returned source/weight identities against the frozen constants. Python checks upstream commit, source cleanliness and individual weight hashes before loading. This does not remove the receipt limitations above.

## Fresh verification

All commands used the existing Node 24.15.0 / npm 11.12.1 installation. No dependencies were installed. The verification harness preserves stdout/stderr and exit/timing receipts locally.

| Check | Result |
| --- | --- |
| `npm.cmd run verify` | FAIL, exit 1 at workspace audit; earlier typecheck/build/tests passed. |
| `npm.cmd run typecheck` (within verify) | PASS. |
| `npm.cmd run build` (within verify -> test) | PASS. Only generated `dist/` was rebuilt. |
| All compiled TypeScript tests under no-network guard | 86 PASS, zero failed/skipped; historical 83 + three TransNetV2 contract tests. Includes footage/reference/frozen-contract/embedding regressions. |
| `scripts/audit-workspace.mjs` | FAIL on `node:child_process` in `packages/audio-analyzer/energy-worker.ts`. |
| Supplemental read-only import inventory | Also rejects `node:child_process` in audio `structure-worker.ts`, audio `worker.ts`, and footage `transnetv2.ts`; the latter also imports disallowed `node:path`. Existing allowlist unchanged. |
| `node dist/scripts/export-schemas.js --check` | FAIL at `schemas/interchange/FootageConfig.schema.json`. |
| Supplemental schema byte comparison | `FootageConfig` and `FootageAnalysis` drift; `FootageInventory` matches. No schema was regenerated to conceal drift. |
| Synthetic demo under no-network guard | PASS; deliberately incomplete media QC, no creative-quality claim. |
| Both media integration test files under no-network guard | 6 PASS, zero failed/skipped. Real local media tools with synthetic footage/stub embeddings; no pretrained TransNetV2 run. |
| `npm.cmd run test:python` | 11 PASS. Includes generated tiny model parameters/mocks, not pretrained-model verification. |
| Historical closure evidence index | 66/66 byte hashes match. |
| Six integration receipt source hashes | 6/6 match. |

Because verify stops on the first failure, the later schema/demo/media/Python gates were run separately. A first ad hoc PowerShell hash-report command had a pipeline syntax error before executing; the corrected comparison and persisted audit completed. The initial sandbox WSL inventory returned access denied; the approved read-only WSL check succeeded. Neither condition was treated as an application failure or hidden.

## Publication security and large objects

A bounded heuristic scan covered 170 current text files, including the root environment file, without printing matched values. One probable provider secret was found in `.env` (excluded). No candidate-source finding outside `.env` was found. This is not a comprehensive secret-free certification. There is no Git index/history to scan, so **no claim of a clean tracked-file/history scan is made** and no `SECRET IN HISTORY` condition is invented.

No source-candidate file was at least 10 MiB; no model/media/archive/binary candidate was found outside the deliberately excluded local directories. Git object sizes/history cannot be audited because no object database exists. Private media, cached models and environments remain excluded; no automatic history cleaning was attempted.

Existing ignore rules already covered `.env`, `.env.*` with `.env.example` exception, `.local-runs`, `.local-media`, `.test-artifacts`, tools/caches/environments, common video and model formats. They did not exclude the actual `local-media/` directory, alternative virtualenv names, TensorFlow checkpoint files or common audio formats. This task adds those narrow publication exclusions plus model-cache/weights/checkpoints/dataset/generated-media directories without duplicating existing lines.

The existing tree generator used an explicit exclusion list and would enumerate private `local-media/` and `.env`. Its exclusion filter was corrected, then the tree was regenerated through `node scripts/project-tree.mjs --write`. The tree reflects current audio/TransNetV2 source, phase documents and AGENTS, while omitting local/private/generated material. Tree presence is inventory, not acceptance of the audio work.

## Evidence and next action

Local-only evidence directory: `.local-runs/github-baseline-audit-20260920/`.

- `source-audit.json`: original inventory/hashes, all snapshot differences/additions, six integration joins, 66 historical joins and sanitized security findings.
- `verify.log` / `verify.json`: typecheck/build/86-test pass and workspace-audit failure.
- `schemas.log` / `schemas.json`: preserved generated-artifact failure.
- `supplemental.json`: complete relevant runtime-import inventory and three-schema comparison.
- `media.log` / `media.json`, `python.log` / `python.json`, `demo.log` / `demo.json`: separately executed remaining gates.
- `final-source-audit.json`, `final-preservation.json`, `publication-checks.json`: final inventory, preservation and publication checks.

The older Session 1 `verification.json` linked by the phase docs is absent. Its `baseline.json` exists and was used; a missing historical receipt was not reconstructed or invented.

To unblock source control, identify/restore the intended Git checkout, or explicitly authorize initializing a new repository here. Preserve the original directory and all work. Configure the owner's intentional email in the Git environment; do not infer an address. Install GitHub CLI in that environment and run `gh auth login` interactively; do not provide tokens to the assistant. Then recheck identity, the full intended publication set, secrets/history/large blobs and authenticated-account repository existence before creation or push. Current implementation gate failures require a separate bounded correction; this audit deliberately did not change application code or relax audits.

Future workflow after a verified baseline is accepted and normally pushed to a private remote: `main` represents the last verified accepted gate. Update verified main, create the bounded `phase/2.6b-real-footage` branch, implement only the explicitly authorized gate, verify, commit as ChetanKumor without attribution trailers, push evidence and merge only after external gate review/acceptance. No branch was created in this task and no later phase was started. No CI, deployment workflow or repository bureaucracy was added.
