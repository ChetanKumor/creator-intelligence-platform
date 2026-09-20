# Phase 0 verification

This is the historical Phase 0 report. Current Phase 1 evidence, including the successful offline So400m verification, is recorded in [Phase 1 verification](reference-verification.md). Frozen Phase 0 source/schema/fixture hashes are now also regression tested.

The complete `npm.cmd run verify` command passed on 2026-09-13 with Node v24.15.0 and npm 11.12.1. No Phase 1 work was started.

| Check | Result |
| --- | --- |
| Strict TypeScript typecheck and clean compilation | Passed |
| Unit and integration tests | 47 passed; 0 failed, skipped, or pending |
| Application/workspace source audit | 20 TypeScript files passed |
| Generated schema/fixture drift | 21 artifacts verified: 14 schemas, 7 JSON fixtures |
| Synthetic demo | Passed; 4 DecisionEvents, 1 FeedbackEvent, 3 CostEvents, 0 model runs |
| QC evidence | 2 plan checks passed; 8 media checks unverified; outcome incomplete; delivery blocked; job remains QC |
| Lint | Not configured; strict compiler checks are configured and passed |

Pinned direct packages: Zod 4.1.12, TypeScript 5.9.3, and Node type definitions 24.10.0. A transitive type-only `undici-types` package is resolved in the lockfile; no HTTP client is used by application code.

## Commands

```powershell
npm.cmd run verify
node scripts/project-tree.mjs --write
```

`verify` runs strict typechecking, clean compilation, tests, the application import/workspace audit, generated-artifact drift checks, and the dry-run demo. No lint framework is configured. Network access is disabled in the test/demo processes by the preloaded guard.

## Evidence covered

- All 12 required contracts plus `MediaAsset` accept synthetic examples and reject unsupported exact versions and extra provider fields. `BenchmarkManifest` is also schema validated and content-digest verified.
- Edit-plan tests cover reversed/zero source ranges, negative/nonfinite timing, gaps, undeclared overlaps, illegal confidence/speed, target-duration mismatch, aspect ratio, captions, fades, duplicate IDs, parent lineage, and valid speed/dissolve arithmetic.
- Cross-record tests reject source ranges outside selected segments, project mismatch, missing/mismatched decision selection, and unavailable media.
- Serialization tests prove stable bytes across key order and parse/serialize round trips, stable plan digests, and rejection of lossy/executable object shapes. Two full synthetic pipeline runs produce identical canonical output.
- Distinct renderer implementations consume the same plan-only port; distinct vision identities return the same owned fingerprint shape. These are contract doubles, not quality parity claims for real providers.
- Telemetry preserves decisions, corrections and costs; deduplicates retries; rejects stale/cross-scope feedback and double billing; derives contextual replacement evidence; and snapshots model provenance.
- Jobs enforce stage failures, retries, monotonic state versions, revision reset, plan/render binding, separate preview/final QC, and the prohibition on promoting dry-run receipts.
- Evaluation tests use explicit labels and integer costs, prevent synthetic/production mixing and duplicate denominators, and return unavailable metrics for insufficient evidence. Frozen benchmark tampering and creator leakage fail.
- Network guard tests intercept requests, sockets, DNS, fetch, and listeners before I/O. Application source auditing permits only local imports, Zod, and Node crypto; it rejects network/subprocess imports, explicit `any`, dynamic imports, and hidden clock/random/environment inputs.

## Workspace evidence and limits

The starting directory was inspected and empty. The user explicitly authorized use of this existing isolated directory. All file-writing tools targeted this directory. npm configuration pins cache/log directories here, disables dependency scripts and update checks, and uses pinned packages with a local lockfile. The only authorized network operation was dependency retrieval from npm. Tests/demo require no network, API, secret, media download, server, cloud resource, or external account.

No Git operation, remote, push, commit, global installation, PATH/config change, or unrelated repository access was performed. Git/Python/rg were absent and were not installed. Build cleanup resolves and checks a fixed workspace `dist` path before deletion. The audit and project-tree tools refuse source-tree symlinks.

The workspace audit is evidence about this source tree and the actions taken; it is not an OS-wide filesystem monitor or a hardened security sandbox. Unrelated directories were not inspected for a global before/after diff. The network guard protects ordinary Node entry points used by this project; it is not a substitute for production worker network policy.

## Deliberate limitations

No actual video exists. The demo returns `RenderResult.kind = dry_run`, two passed plan/receipt checks, eight unchecked media checks, `QCResult.outcome = incomplete`, `deliveryAllowed = false`, and job state `QC`. Its acceptance event and zero costs are synthetic illustrations. Actual creative quality, performance, acceptance, production reliability, and ₹100 unit economics remain unmeasured.

In-memory data is not durable. Authentication, consent enforcement, production retention/deletion, queue leases, persistence, exposure/cohort collection, billing reconciliation, provider fault handling, Python schema conformance, frame/sample quantization, real media QC thresholds, capability/cost routing, and user interfaces remain future work. Interfaces and documented boundaries support those additions; they do not claim those systems already exist.

## Proposed local commit

Proposed title: `feat: establish Phase 0 creator intelligence foundation`

Contents: owned versioned contracts/types and JSON Schemas; validation/QC/job gates; provider ports and dry-run adapter; in-memory events/provenance; evaluation foundation; synthetic fixtures/demo; tests and local verification scripts; architecture/data/phase documentation; pinned project-local dependency configuration and lockfile. Exclude `node_modules`, `dist`, and `.npm-cache`.

No commit has been created. Git is unavailable on PATH. Any later commit requires the user's approval under the session's Git rule.
