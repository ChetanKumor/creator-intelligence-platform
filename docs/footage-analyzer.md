# Phase 2: local Footage Analyzer V0

The analyzer turns an explicitly authorized local asset set into validated, reusable `ClipSegment` records. It accepts no reference fingerprint. TypeScript owns authorization, identity, selection, candidate construction, validation and telemetry; the existing Python worker supplies ffprobe, PySceneDetect, FFmpeg, OpenCV and the pinned SigLIP provider. Phase 3 is outside this implementation.

The authoritative requirements are [PHASE2_FOOTAGE_ANALYZER.md](../PHASE2_FOOTAGE_ANALYZER.md), supplemented by the owner's final architectural corrections and implementation authorization. In particular, semantic sampling is event driven, cheap samples and semantic samples are separate, and fresh inference is a final verification gate. See [verification](footage-verification.md) for current evidence.

## Run an authorized asset set

Use the existing project environment; no new packages, models or system changes are needed. After `npm.cmd run build`:

```powershell
npm.cmd run analyze-footage -- path/to/authorized-footage.json
npm.cmd run analyze-footage -- path/to/synthetic-footage.json --stub
npm.cmd run analyze-footage -- path/to/authorized-footage.json --config path/to/full-config.json
```

The default is the approved CPU So400m configuration. `--stub` requires synthetic authorization for every analyzed asset. `--config` takes the complete generated [FootageConfig schema](../schemas/interchange/FootageConfig.schema.json); unknown fields and unsupported model configurations fail validation. Candidate-only configuration changes reuse selected frame embeddings.

An asset set has this structure. The hash and byte size must be computed from the explicitly supplied file; the authorization must describe its actual provenance. Placeholder values below are explanatory.

```json
{
  "manifestType": "AuthorizedFootageSet",
  "schemaVersion": "1.0.0",
  "creatorId": "creator_example",
  "projectId": "project_example",
  "assets": [{
    "entryId": "entry_take_01",
    "path": "take_01.mp4",
    "authorization": {
      "manifestType": "AuthorizedFootage",
      "schemaVersion": "1.0.0",
      "contentHash": "<64-character SHA-256>",
      "sizeBytes": 12345,
      "sourceType": "owner_supplied",
      "authorizationBasis": "owner_created",
      "allowedPurposes": ["local_footage_analysis", "local_evaluation"],
      "dateAdded": "2026-09-13T00:00:00.000Z",
      "creatorId": "creator_example",
      "projectId": "project_example"
    }
  }]
}
```

Authorization reuses Phase 1's source/basis consistency rules. Its purpose must include `local_footage_analysis`, creator/project scope must match, and future dates fail. SHA-256 and byte length must match before decoding. Identity is checked again after extraction to detect source mutation. The CLI resolves only named relative files beneath the manifest directory. Traversal, network paths, Windows device names, filesystem links and junction parents are rejected. It does not enumerate media directories. Tool execution uses explicit executable paths and argument arrays without a shell.

Duplicate bytes are analyzed once. Unique assets are processed in content-ID order. A bad authorization, missing/corrupt/unsupported file, timeout or provider failure produces a sanitized per-asset failure; successful assets survive. A worker that fails is closed before the next asset. Partial jobs write their successful results and exit 1; fully successful jobs exit 0.

## Two bounded lattices

The cheap policy `shot-budget-pts-v1` targets four samples per source second, capped at 480 per asset by default. It reserves at least one available actual-PTS frame per source shot and allocates the remaining budget by temporal interval size. Frames lie near equal temporal bin centers, with deterministic earlier-frame ties. Short footage is denser; long footage lowers density and reports `reducedCheapResolution`. It does not fail because the four-sample target is unaffordable. A budget smaller than the number of source shots produces an explicit minimum-coverage failure.

The semantic policy `events-coverage-v1` selects from these cheap samples. It reserves one frame near each shot midpoint, then considers broad temporal coverage and local peaks in frame difference, optical-flow changes, exposure changes and log-sharpness changes. It requests coverage anchors on approximately eight-second intervals; that is a maximum-gap target, not a semantic FPS. Coverage receives reserved capacity before novelty peaks; remaining coverage requests use a deterministic farthest-gap rule. Event candidates are scored by threshold-relative change, with a default 0.5-second separation. Static footage requests fewer samples and the selector never fills its budget with arbitrary extra frames.

| Semantic control | Default |
| --- | --- |
| Maximum selected frames per asset | 32 |
| Temporal coverage target | 8 seconds |
| Minimum event separation | 0.5 seconds |
| Frame-difference threshold | 0.06 of grayscale range |
| Brightness-change threshold | 0.12 of grayscale range |
| Log-sharpness change threshold | 1 |
| Optical-flow-rate change threshold | 0.04 after normalizing by the 512-pixel analysis scale |

These thresholds are configurable V0 heuristics, not calibrated quality claims. Thirty-two frames bound cold CPU work while preserving room for shot and change anchors. The earlier Phase 1 nine-frame cold pipeline spent 25.364 seconds in its embedding stage, including imports and loading. A simple linear extrapolation is about 90 seconds for 32 frames; it motivates a conservative ceiling and is not a Phase 2 throughput measurement. New measurements must replace that estimate. Static repeated pixels can need just one expensive operation even when several temporal samples are retained.

`semanticSamplesRequested`, `semanticSamplesSelected`, `semanticSamplesEmbedded`, `uniqueSemanticFrames` and per-frame `selectionReasons` are persisted. Budget pressure reports `reducedSemanticCoverage`. `cheapFramesAnalyzed` and `semanticFramesEmbedded` are separate in evaluation and CLI telemetry. No semantic selection depends on candidate counts or a reference.

Configuration permits up to 3,000 cheap samples and 256 semantic samples. The inherited local media limits remain: at most approximately ten minutes, 72,000 decoded frames, 1–120 fps, bounded resolution and 8 GiB per file; a manifest contains at most 16 entries. The default worker-operation timeout is 180 seconds and per-asset analysis deadline is 900 seconds. Source metadata and coarse scene detection still inspect the source timeline; sparse sampling does not make those passes independent of source duration. Shared FFmpeg extraction uses bounded batches of 500 and a balanced selection expression to avoid parser-depth failure on dense requests.

## Reusable features and candidates

OpenCV measures normalized brightness, dark/bright pixel fractions, Laplacian variance, grayscale frame difference and Farneback flow magnitude. Temporal measurements retain the previous sample ID and actual elapsed seconds, and reset at source-shot boundaries. Candidate motion averages only pairs whose two endpoints lie inside the candidate. Bounded sharpness, unclipped-pixel and stability indicators are descriptive numeric transforms; they are not aesthetic judgments or probabilities. Nothing is discarded for low technical scores.

The frame feature bank hashes extracted PNG bytes, aliases exact duplicate images, and invokes the shared cached embedding helper only for missing unique selected images. It retains every temporal sample identity even when images share an embedding. The exact model is `google/siglip2-so400m-patch16-naflex` at `cc24074f717b612951c2dead130904ab9b65a81e`, CPU, 256 NaFlex patches, existing 512-pixel preprocessing, image inference batch size one. Installed configuration is checksum checked against the existing download receipt. Observed vector dimensions must agree with that configuration and with `assertCompatibleEmbeddingSpaces`; 1152 is observed evidence, not a provider constant.

Candidate proposal `coverage-multiscale-v1` uses 0.5, 1, 2 and 3-second windows within coarse shots. A shot shorter than 0.5 seconds contributes its whole duration. Defaults are 64 candidates per shot, 256 per asset and 1,024 per project. These are configurable guardrails; accepted configuration maxima are 256/1,024/4,096. Project quota is allocated among unique authorized assets before analysis, so a failed asset may leave unused quota. Windows never cross a source-shot boundary.

Duration allocation begins with a balanced mix, then prioritizes the longest duration when needed to cover long takes, retaining shorter scales where capacity permits. Uniform temporal anchors precede change peaks and largest-gap fills. Where affordable, anchor spacing gives a same-duration target window a candidate at IoU ≥ 0.5. The system measures actual union coverage and remaining gaps; hard budgets cannot guarantee exhaustive coverage at every duration for every source.

`CandidateFeatureAggregator` has no provider dependency. It aggregates normalized cached frame vectors by mean followed by normalization, using the same released Phase 1 semantic space. It averages cheap measurements separately. If a short candidate contains no selected frame, it borrows the nearest frame from the same source shot and explicitly records `same_shot_context` plus semantic context distance. This approximation is visible to later consumers.

Deduplication measures coverage first. Defaults require same asset/shot, temporal IoU ≥ 0.85, cosine similarity ≥ 0.995, duration ratio ≥ 0.9 and centers within 0.25 seconds. It removes a candidate only when union coverage at its duration scale is preserved. Similar imagery at distant times stays available. Removed candidates retain evidence and a link to a retained representative. Conservative settings may remove zero candidates.

## Artifacts and future learning joins

Each `.local-runs/footage_<UUID>/` contains `ClipSegments.json`, `FootageInventory.json`, `evaluation.json`, `run.json` and `assets/<analysisId>.json`. ClipSegments are written after all sidecars. Interrupted writes cannot be interpreted as a completed segment bank merely from the presence of an inventory.

The frozen ClipSegment 1.0.0 contract is unchanged. Embeddings are object references; person, pose, face, framing, semantic descriptions and semantic motion labels remain unknown/unassigned. Uncalibrated technical measurements live in sidecars, so domain quality probabilities remain null. No vectors enter domain or analysis JSON. Vector cache entries are separate internal artifacts.

For future creator feedback, retain the candidate ID and the producing analysis/run provenance. Candidate IDs bind source asset, source interval, coarse shot and proposal configuration/evidence. The analysis sidecar joins those IDs to contributing semantic frame IDs, cheap sample IDs, measurement IDs, embedding references, aggregation ID/version, full configuration and embedding implementation versions. The original media does not need to be re-analyzed to recover those joins. A candidate may be represented under multiple later semantic configurations; the producing analysis ID/run provenance identifies the representation actually shown. This phase does not implement feedback collection or training.

The inventory summarizes successful assets, duplicates, failures, duration, both lattice counts, embedding space, candidate counts and coverage before/after pruning. Reference-specific sufficiency is explicitly null. Each attempted stage records existing validated ModelRun/CostEvent telemetry. API spend is ₹0; infrastructure cost is unmeasured.

Metadata, source cuts and cheap measurements reuse checksummed local artifacts. A cheap-cache hit also validates the referenced PNG hashes; missing or corrupt PNGs are re-extracted. Frame cache identity binds source bytes, extracted image identity, model/revision, preprocessing and implementation configuration. Changing only proposal settings does not invalidate it. Aggregations bind contributing embedding IDs and the normalized-mean policy. Existing Phase 1 key and space formulas are preserved. Footage memo entries use the shared bounded file cache with a 16 MiB per-entry limit, enough for the allowed cheap-sample ceiling.

## Final real-model gate

Normal tests are offline and never load the large pretrained model. The explicit final smoke command checks capacity first, generates authorized synthetic input only when safe, uses a fresh empty embedding cache, validates real frame/candidate vectors against Phase 1, and verifies a cached repeat:

```powershell
node --import ./scripts/no-network.mjs dist/scripts/smoke-footage-model.js
```

The existing 1 GiB available physical-memory/commit runtime reserve is retained. A preflight additionally requires the observed Phase 1 peak process commit (10,670,182,400 bytes) plus that reserve, and 3 GiB available physical memory. It reads Windows counters; it does not change pagefiles, PATH, drivers or installed packages. If unsafe, the smoke exits with a `PENDING ENVIRONMENT CAPACITY` receipt and never enters the provider. A guard stop during inference is also reported as environment capacity, not an established source regression. See [evaluation](footage-evaluation.md) and [verification](footage-verification.md).
