# Phase 1 Reference Analyzer V0

This is a local developer pipeline for media explicitly supplied by the owner. It does not acquire public media, upload pixels, run hosted inference, or implement any later phase. Code and synthetic-media verification are separate from pretrained-model verification.

## Local setup

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run setup:reference
npm.cmd run verify
```

`scripts/setup-reference.ps1` uses uv with `--no-bin --no-registry`. Runtime, package cache, virtual environment and binaries remain in `.tools/python`, `.uv-cache`, `.venv`, and `.tools/ffmpeg`. The lockfile is `uv.lock`; Python is pinned in `.python-version`. No activation or system PATH changes are required. The setup is Windows x64-specific. No model downloader is part of setup or verification.

| Dependency | Version | Source/license |
| --- | --- | --- |
| CPython | 3.12.12 | uv-managed python-build-standalone; Python Software Foundation license and bundled notices |
| FFmpeg + ffprobe | 9.0.1 essentials | [Gyan release](https://github.com/GyanD/codexffmpeg/releases/tag/9.0.1), [GPLv3 build policy](https://www.gyan.dev/ffmpeg/builds/) |
| PySceneDetect | 0.6.7.1 | PyPI, BSD-3-Clause |
| OpenCV headless | 4.12.0.88 | PyPI, Apache 2.0 with bundled notices |
| NumPy | 2.2.6 | PyPI, BSD-3-Clause with bundled notices |
| Pillow | 11.3.0 | PyPI, MIT-CMU |
| PyTorch | 2.8.0+cpu | Official PyTorch CPU wheel index, BSD-3-Clause with bundled notices |
| Transformers | 4.57.1 | PyPI, Apache 2.0 |
| jsonschema | 4.25.1 | PyPI, MIT |

The FFmpeg ZIP is 111,253,802 bytes (about 106 MiB), SHA-256 `fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9`. Setup checks the hash before extraction. Its license and build notices remain alongside the binaries. `scripts/reference-local.ts` resolves both executables at `.tools/ffmpeg/ffmpeg-9.0.1-essentials_build/bin/`; it never searches PATH for them. This local GPLv3 development dependency does not decide a future production media execution/distribution strategy.

CPU-only PyTorch honors the prohibition on CUDA installation. The provider contains a CUDA path and explicitly configured CPU fallback, but the installed environment runs CPU inference. No driver/toolkit was changed. Hardware observed: Ryzen 7 7435HS, 16 logical CPUs, approximately 23.69 GiB RAM, RTX 4050 Laptop 6141 MiB VRAM.

## Authorization and commands

The sidecar is a separate generated-schema-validated `AuthorizedReference` manifest. It contains the exact SHA-256, byte count, source type, authorization basis, allowed purposes, UTC date added, creator ID and project ID. It contains no local path. The manifest records the owner's attestation; the analyzer verifies its shape, permitted purpose and content binding.

For owner media use `sourceType: "owner_supplied"` and either `authorizationBasis: "owner_created"` or `"permission_granted"`, according to the actual authorization. Synthetic files use `sourceType: "synthetic"` and `authorizationBasis: "synthetic_generated"`. Analysis requires `local_reference_analysis`; benchmark evaluation additionally requires `local_evaluation`. Dates use three fractional digits and `Z`. IDs follow the existing owned ID schema. See `schemas/interchange/AuthorizedReference.schema.json` for the exact format. Do not copy a synthetic authorization onto real media.

```powershell
npm.cmd run build
npm.cmd run analyze-reference -- '.local-media\reference.mp4' '.local-media\reference.authorization.json' --model so400m --device cpu
npm.cmd run analyze-reference -- '<synthetic-file>' '<synthetic-authorization>' --stub --detector adaptive --benchmark '<benchmark-manifest>'
```

The integration suite generates tiny authorized videos, sidecars and benchmark manifests under `.test-artifacts/media-*/` and prints the evidence directory. Its successful CLI invocation leaves a reviewable run under `.local-runs/reference_*/`. These generated files are ignored. No media is committed.

Options: `--detector content|adaptive`, `--model base|so400m`, `--device cpu|cuda`, `--cpu-fallback`, `--stub`, `--benchmark <manifest>`. The stub is allowed only for synthetic authorization; its embedding space is distinct from SigLIP. The default uses the real Base provider and fails with `EMBEDDING_MODEL_UNAVAILABLE` if the pinned local weights are absent. A real-model smoke test is an explicit CLI invocation without `--stub` after separately approved weight provisioning. Normal tests never load pretrained weights.

## Pipeline and artifacts

1. Parse authorization, verify allowed purpose/date/source, stream SHA-256 and compare exact byte count/hash. Reject empty/nonregular/symlink/oversized files.
2. ffprobe obtains stream metadata and decoded presentation timestamps. Duration follows the video stream/tail frame, rather than assuming the audio track ends with it. Rotation and sample aspect ratio normalize display dimensions. Unsupported duration/frame-rate/resolution/container bounds fail explicitly.
3. A ShotDetector runs PySceneDetect ContentDetector or AdaptiveDetector. Both are evaluation candidates. Default Content threshold 27 and two-frame minimum is a baseline, not a universal quality claim. Adaptive uses threshold ratio 3 and minimum content value 27. Detector and ffprobe frame counts must agree. Cut indices map to actual PTS, including VFR; shots partition the entire normalized video clock.
4. Shots shorter than 0.75 seconds, or with too few interior frames, select the nearest midpoint frame. Longer shots select nearest 25/50/75-percentile timestamps. Ties choose the earlier actual frame. Boundary frames are excluded when there are at least three frames; duplicates collapse. At most three samples per shot are used.
5. FFmpeg selects exact decoded frame indices, applies rotation, square-pixel normalization and a maximum 512×512 bounding box. Batches of at most 500 selection indices keep command arguments within Windows limits. OpenCV measures grayscale mean, dark/bright fractions and Laplacian variance. Adjacent representative samples within the same shot additionally measure image difference and optical-flow magnitude, with comparison ID and time interval. These are raw measurements, not calibrated quality or camera/subject classifications. A second hash after sampling detects changed media before embedding cache writes.
6. The generic VideoEmbeddingProvider port batches requested reference samples. SigLIP runs locally at batch size one, 256 NaFlex patches by default. Frame embeddings are normalized; each shot is the normalized arithmetic mean of its normalized frame embeddings. Equal weighting is an explicit simple baseline because no evaluation supports another weighting yet. Degenerate/nonfinite/mixed-dimension vectors fail.
7. TypeScript constructs and validates ReferenceFingerprint 1.1.0. Roles, transitions, captions, composition, motion categories and semantic prose remain unknown/unassigned. Audio fingerprint ID is null. Raw measurements and additional structural statistics stay in the sidecar; they do not masquerade as semantic labels or quality probabilities.
8. Persist `analysis.json`, `evaluation.json`, and `run.json`, then atomically publish validated `ReferenceFingerprint.json` last. Failure runs retain available ModelRuns/CostEvents and sanitized stage codes. Paths and native stderr are execution context only.

Python exchanges generated `WorkerRequest`/`WorkerResponse` schemas over bounded JSON lines. It validates shape using those same JSON Schemas. TypeScript validates responses and semantic joins and owns final domain construction. Python contains no duplicate ReferenceFingerprint model.

The persistent Python worker keeps a loaded model available within a run. Embedding requests contain at most eight samples to bound response size and per-request inference time; the model still processes one image at a time. A CPU fallback persists for that model/revision/patch configuration for the rest of the worker lifetime. If earlier batches used CUDA, the sidecar reports `device: "mixed"`. Process requests time out; native tool calls use argument arrays, timeouts, local protocol/container allowlists, and hidden windows. The worker blocks socket/DNS activity and sets offline model flags; both model and image-processor loading require `local_files_only=True`, `trust_remote_code=False`, and no token. This is a local execution guard, not a hardened production OS sandbox.

## Cache and determinism

`.reference-cache/frames` holds selected PNGs. `.reference-cache/embeddings` stores checksummed normalized frame/shot vectors through `ArtifactCache`. `.reference-cache/models` is reserved for separately approved weights. Cache keys include content hash, selected sample IDs, model/revision, preprocessing implementation/library versions, patch count, device/fallback policy and aggregation version. Any change produces a different key/space ID. Malformed entries are treated as corrupt misses. Writes use temporary files and rename; interrupted temporary files are never read as cache entries.

Embedding references use opaque cache object IDs. `analysis.json` records the configuration, embedding batch ID and shot-to-reference mapping needed to resolve them. Changing dependencies or preprocessing requires an explicit implementation-version update and evaluation. Frame sampling and cache identity are structurally deterministic; operational times and model-run IDs vary. Floating-point embeddings are tested with numerical tolerances rather than cross-device bitwise promises. Cache-only operations report `device: null` and zero newly embedded frames.

The frames and embeddings directories can be cleared to force recomputation; no accepted source is modified. Keep model weights separate when clearing cache, because replacing them requires download authorization. Use only resolved project paths when clearing directories. No Redis, database or cloud cache exists.

## Telemetry and limitations

Every successful or failed attempted analysis stage emits a ModelRun and CostEvent. They retain tool/model revision, operation attempt, real wall-clock duration and applicable bytes/frame/video-second counts. Batch IDs avoid expanding core provenance beyond its limits. `analysis.json` adds device/fallback, cache counters, detailed pacing and measurement lineage. External API spend is measured as zero for local execution; infrastructure/electricity cost is explicitly unmeasured. Synthetic scopes remain separate from non-synthetic scopes. There is no accepted-Reel business metric.

All boundaries are detector predictions. Neither detector classifies transitions or semantic editing roles reliably enough here. No manually reviewed creator benchmark or semantic ground truth is present. No embedding-quality score is invented. Matching usefulness belongs to a later phase. HDR/color-management quality, unusual codecs/containers, highly irregular VFR and real phone footage need broader authorized evaluation; current integration covers generated MP4/MOV, right-angle rotation, VFR and fast cuts. No Phase 2 work is implemented.

## Local model provisioning and verification

The owner explicitly authorized [google/siglip2-so400m-patch16-naflex](https://huggingface.co/google/siglip2-so400m-patch16-naflex/tree/cc24074f717b612951c2dead130904ab9b65a81e) at revision `cc24074f717b612951c2dead130904ab9b65a81e`, Apache-2.0, for the first CPU verification. The approved download completed and its weight SHA-256 matched the official repository metadata. Weights are 4,542,792,928 bytes; the selected model/configuration/card files total 4,542,797,300 bytes. All files and the download receipt are inside `.reference-cache/models`. No tokenizer files are needed for image embeddings.

`scripts/download-so400m.py` is an explicit setup command for this approved revision only. It verifies repository identity, pinned revision, Apache-2.0 metadata, file sizes and the official LFS weight checksum. It is never called by setup, analysis or verification. Normal runtime continues to enforce offline loading. Base remains configurable at revision `b53b807d3a2d5e2b3911292f2d69e5341cdc064c`, but no Base weights were downloaded; select `--model so400m --device cpu` to use the verified cache. No global runtime, driver or CUDA changes were made.

`scripts/smoke-reference-model.py` is a separate, explicit offline CPU smoke command. It accepts a generated WorkerRequest and an output path under `.test-artifacts`, uses the actual provider and cached So400m weights, and records import/model-load/embedding timings plus Windows process memory observations. It stops if available physical memory or commit headroom falls below 1 GiB. It neither mocks pretrained weights nor downloads missing files. Provider timing observations are internal diagnostics; the narrow worker and frozen domain schemas are unchanged.

The real-model smoke and complete three-shot/nine-frame analyzer passed on CPU, followed by a run with all nine frame and three shot embeddings reused from cache. See [final verification](reference-verification.md) for commands, timings, memory counters and artifact links. So400m's pretrained operation is verified; useful quality improvement over Base and GPU execution remain unmeasured. Explicit CUDA requests still fail if unavailable unless CPU fallback is enabled; GPU setup was not attempted.
