# Creator Intelligence Platform — Phases 0, 1 and 2

An isolated foundation for an autonomous creator editor. The company owns its creative contracts, decisions, plans, telemetry, and evaluation protocols. Provider and renderer choices remain adapters.

Phase 0 supplies the frozen foundation. Phase 1 provides the real-model-verified local Reference Analyzer. Phase 2 adds an authorized, reference-independent Footage Analyzer producing validated `ClipSegment` records, a reusable frame bank, provenance sidecars and a footage inventory. It separates cheap temporal measurements from bounded event-driven semantic selection and aggregates cached embeddings for overlapping candidates. Existing contracts and the pinned CPU SigLIP2 So400m space are preserved. Normal tests use deterministic stubs or tiny generated parameters. See [Phase 1 evidence](docs/reference-verification.md) and [Phase 2 status and final model gate](docs/footage-verification.md).

The original Phase 0 demonstration still uses authored synthetic metadata, a fixed edit recipe, and a dry-run receipt. It produces no rendered deliverable.

## Run locally

Prerequisite: Node **24.15.x or later within Node 24**, npm, and uv. The Phase 1 setup provisions Python **3.12.12**, `.venv`, and GPLv3 FFmpeg/ffprobe **9.0.1** within the project. It changes no system PATH, registry, driver or global Python installation. It downloads packages/tools, never model weights. See the [local setup, licenses and analyzer guide](docs/reference-analyzer.md).

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run setup:reference
npm.cmd run verify
npm.cmd run demo
npm.cmd run tree
```

Dependency installation uses the npm registry. Tests and the demo run without network access; a process-level guard blocks network entry points. All dependencies, npm cache, logs, generated JavaScript, and schema artifacts stay in this directory. Dependency lifecycle scripts are disabled. No global installation is needed.

`npm run verify` performs strict typechecking, a clean build, offline TypeScript tests, source/workspace audits, generated-artifact checks, the Phase 0 demo, real synthetic-media integration, and Python provider/interchange tests. The regular suite never requires pretrained weights. No lint tool is configured; strict TypeScript checks include unused locals/parameters, checked indexed access, and exact optional properties.

## What exists

- `packages/contracts`: strict, versioned Zod schemas. TypeScript domain types derive from them.
- `packages/domain`: domain types and canonical JSON serialization.
- `packages/validation`: input joins, media availability checks, plan digests, embedding-space compatibility, and independent plan QC.
- `packages/providers`: provider/storage/queue interfaces and one `DryRunRenderer`.
- `packages/telemetry`: validated in-memory snapshots and contextual replacement preference derivation.
- `packages/jobs`: pure state transitions, stage failures, retries, and delivery gates.
- `packages/evaluation`: benchmark integrity, creator split checks, labeled Top-1/Top-K, cost-cohort arithmetic, and definitions for later metrics.
- `samples`: synthetic fixtures and a tiny fixture planner/demo.
- `schemas/v1`: generated Draft 2020-12 structural JSON Schemas.
- `packages/reference-analyzer`: authorization, asset identity, timelines, samples, embedding cache/provider, pacing, builder, telemetry orchestration.
- `packages/footage-analyzer`: two adaptive lattices, reusable frame features, bounded candidates, aggregation, temporal coverage, validated ClipSegments and inventory.
- `python/reference_analyzer`: local ffprobe/PySceneDetect/FFmpeg/OpenCV/SigLIP primitives, with a process network guard.
- `schemas/v1.1` and `schemas/interchange`: reference evolution and generated narrow cross-language messages.

After building, use the verified local candidate with `npm.cmd run analyze-reference -- <local-file> <authorization-manifest> --model so400m --device cpu`. The configuration default remains Base, whose weights are absent; model loading fails explicitly when the selected pinned files are missing. `--stub` is restricted to a synthetic manifest. See [commands and authorization](docs/reference-analyzer.md), [contract migration](docs/reference-contract-v11.md), and [evaluation protocol](docs/reference-evaluation.md).

There are no empty web/API/worker applications. They gain directories when they gain executable behavior. The intended deployment remains a modular monolith plus analysis and render workers.

For raw footage, run `npm.cmd run analyze-footage -- <authorized-footage-manifest>`. This entry point defaults to the exact approved So400m revision and enforces the Windows capacity guard before fresh inference. `--stub` is available for generated synthetic media. See the [footage guide](docs/footage-analyzer.md) and [evaluation protocol](docs/footage-evaluation.md). Phase 3 has not been implemented.

## Read next

- [Architecture and decisions](docs/architecture.md)
- [Contract semantics and evolution](docs/contracts.md)
- [Data, feedback, retention, and future learning](docs/data-learning.md)
- [Phase boundaries](docs/phases.md)
- [Verification evidence and limitations](docs/verification.md)
- [Complete project tree](docs/project-tree.txt)

## Generated artifacts

```powershell
npm.cmd run schemas:generate
npm.cmd run schemas:check
```

These commands generate/check 33 artifacts: the original 21, six Phase 1 schemas and its 1.1.0 fixture, and five Phase 2 internal schemas. Never hand-edit generated files. Frozen Phase 0 schema/fixture/source hashes are regression tested. ReferenceFingerprint 1.0.0 and 1.1.0 remain frozen. Released versions require explicit evolution.

## Demonstration interpretation

The 20-second 1080×1920 plan uses four timeline clips from five available segments, synthetic music metadata, and a Telugu caption. The demo logs four decisions, three explicitly synthetic zero-cost operation records, and one **synthetic acceptance illustration**. It invokes no model and produces no MP4. Scores and confidence describe the fixed fixture recipe, not measured creative quality. No acceptance or cost business metric is inferred from the demo.
