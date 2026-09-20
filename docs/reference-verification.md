# Phase 1 final verification — 2026-09-14

**CODE COMPLETE: YES. REAL-MODEL VERIFIED: YES. PHASE 0 REGRESSION: PASS.**

The approved Phase 1 implementation works through one coherent local pipeline with real, pinned SigLIP2 So400m NaFlex embeddings on the existing CPU-only runtime. The offline provider smoke, complete authorized synthetic-reference analysis, embedding artifact checks and repeat cache reuse all passed. Base was not downloaded. No global installation, system PATH/registry change, CUDA/driver setup, PyTorch replacement or remote inference was performed. Phase 2 has not started.

| Required status | Result |
| --- | --- |
| Phase 1 final status | Code complete and real-model verified through local CLI, runtime-validated fingerprint, run metadata and evaluation artifacts. |
| Phase 0 regression | All 47 original tests pass. The original dry-run demo still ends at incomplete media QC with delivery blocked. |
| Contract migration status | Additive ReferenceFingerprint 1.1.0 and explicit 1.0.0 → 1.1.0 migration. Frozen 1.0.0 source/schema/fixture bytes pass digest checks. Known roles/transitions are preserved, absent embeddings become null, and no automatic downgrade exists. Global role/transition schemas retain their original meaning. |
| Python environment | uv-managed Python 3.12.12 under `.tools/python`; project `.venv`; pinned dependencies in `pyproject.toml` and `uv.lock`. PyTorch 2.8.0+cpu. No global install, PATH/registry change, CUDA/driver installation or admin setup. |
| FFmpeg / ffprobe status | Project-local Gyan 9.0.1 essentials build, GPLv3; pinned ZIP checksum verified. Both binaries resolve through explicit project paths. See the setup guide for source, license, archive size and hash. |
| Reference analyzer pipeline | Authorization → SHA-256 → ffprobe → PySceneDetect → deterministic samples → OpenCV measurements → VideoEmbeddingProvider/cache → pacing → TypeScript 1.1.0 builder/validation → ModelRun/CostEvent/evaluation. Python returns narrow generated-schema-validated results. |
| Test results | `npm.cmd run verify` exited 0: 65 TypeScript tests, 4 real media integration tests and 6 Python tests; no failed or skipped tests. Strict compilation, workspace audit and 28 generated schema/fixture drift checks pass. |
| Synthetic media integration result | Both ContentDetector and AdaptiveDetector achieved precision/recall/F1 = 1 with ±1-frame tolerance and zero timing error on the generated three-scene vertical reference. Repeated analysis used 9/9 cached embeddings. Fast 0.2-second shots, rotation, VFR and corrupt/unsupported inputs are also exercised. |
| SigLIP provider status | Both pinned candidates configurable. Real So400m weights loaded offline and generated normalized 1152-dimensional embeddings on CPU. Normal tests retain deterministic stubs/tiny generated parameters and do not require pretrained files. |
| Model + exact revision | `google/siglip2-so400m-patch16-naflex`, `cc24074f717b612951c2dead130904ab9b65a81e`, from the official Google Hugging Face repository, Apache-2.0. |
| Model download size | 4,542,792,928 weight bytes; 4,542,797,300 bytes including the selected configuration/model-card files. All files reside under `.reference-cache/models`. |
| Device used | CPU, FP32, batch size one, 256 NaFlex patches; unchanged PyTorch 2.8.0+cpu, no CUDA build. |
| Remaining Phase 1 blockers | None for the Phase 1 definition of done. Creator-media quality and GPU behavior remain evaluation limits. |

The final run audited 27 application TypeScript files and the two explicit local runtime adapters. There are 20 generated JSON Schemas and eight safe JSON fixtures. The frozen-file regression independently protects seven original contract source files plus the 14 original schemas and seven original JSON fixtures. Unit/demo processes use the Node network guard; the Python worker/tests set offline model policy and reject sockets/DNS. Normal verification needs no network or model download.

## Real-model evidence

The downloaded model card declares Apache-2.0 at the [exact official revision](https://huggingface.co/google/siglip2-so400m-patch16-naflex/blob/cc24074f717b612951c2dead130904ab9b65a81e/README.md). The local [download receipt](../.reference-cache/models/so400m-download-receipt.json) records sizes and SHA-256 values. The weight digest matched the official LFS metadata: `11a61a2068800d5f4f35cb041c1fea25de86ce87725e4c97a9ed046d0b22c076`. Download plus validation took 936.01 seconds. No Base model or tokenizer files were acquired.

The [offline provider smoke](../.test-artifacts/so400m-verification/provider-smoke.json) used actual pretrained parameters and the existing SiglipProvider with socket/DNS blocking and `local_files_only=True`. It generated one normalized 1152-dimensional vector; the loaded full image/text model contains 1,135,670,962 parameters. Only image features are computed.

The full analyzer processed the generated, authorized 3-second vertical reference with 30 decoded frames, three shots and nine representative samples. It wrote [ReferenceFingerprint.json](../.local-runs/reference_831a8898-2ed9-4569-9a9c-0b28156f62d0/ReferenceFingerprint.json), [analysis.json](../.local-runs/reference_831a8898-2ed9-4569-9a9c-0b28156f62d0/analysis.json), [evaluation.json](../.local-runs/reference_831a8898-2ed9-4569-9a9c-0b28156f62d0/evaluation.json) and [run.json](../.local-runs/reference_831a8898-2ed9-4569-9a9c-0b28156f62d0/run.json). Runtime validation accepted ReferenceFingerprint 1.1.0. Six ModelRuns and six CostEvents were revalidated. Boundary precision/recall/F1 were 1 at ±1 frame (0.1 seconds) with zero timing error on this controlled fixture.

The [repeat analysis](../.local-runs/reference_652c0eac-cd90-4278-883b-d2a1d1c18dfd/analysis.json) reused nine of nine frame embeddings and three of three shot embeddings, with zero misses and zero newly embedded frames. Shot structures, embedding references and fingerprint identity matched. New run IDs/timestamps remain expected operational differences.

The [pipeline verification receipt](../.test-artifacts/so400m-verification/pipeline-verification.json) records checks of all nine frame vectors and three shot vectors. Each cache artifact has 1152 finite components, unit norm within 1e-6, and a valid content checksum. Fingerprint JSON contains references only; raw vectors remain in `.reference-cache/embeddings`. The model cache contains only the approved So400m repository.

| Runtime / memory observation | Measured value |
| --- | --- |
| Provider smoke library imports | 11.685 seconds |
| Model/processor initialization | 0.607 seconds |
| First single-frame embedding | 11.829 seconds |
| Total provider smoke | 25.226 seconds |
| Full analyzer, first run | 28.160 seconds; embedding stage 25.364 seconds; 0 frame hits / 9 misses, 0 shot hits / 3 misses |
| Full analyzer, repeat | 2.311 seconds; embedding-cache stage 0.020 seconds; 9 frame hits / 0 misses, 3 shot hits / 0 misses |
| Smoke peak resident working set | 2,037,411,840 bytes, about 1.90 GiB |
| Smoke private usage at completion | 6,108,274,688 bytes, about 5.69 GiB |
| Windows smoke peak process commit (`PeakPagefileUsage`) | 10,670,182,400 bytes, about 9.94 GiB |
| Physical RAM / available RAM after smoke | 23.69 GiB total / 6.56 GiB available |

The safetensors loader uses mapped/lazy access, so first embedding includes first-use work beyond the model-initialization timer. Full analyzer stage timing includes imports, loading, inference, normalization and cache writes. The first analyzer run had an empty embedding cache but followed the standalone smoke, which may warm OS file caches. Memory counters describe the one-frame smoke process; peak full-CLI memory was not separately measured. [Windows documents these counters](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters_ex) as working-set and process-commit observations; commit should be interpreted alongside resident working set. The smoke's 1 GiB available-memory/commit guard did not trigger. No OOM, device fallback or model fallback occurred. These are observations on this fixture and machine, not general throughput or memory guarantees.

Reproduce the full authorized-reference run after building (the repeat uses the same command):

```powershell
node --import ./scripts/no-network.mjs dist/scripts/analyze-reference.js '.test-artifacts/media-JmFz4w/synthetic video & (local).mp4' '.test-artifacts/media-JmFz4w/authorization.json' --model so400m --device cpu --benchmark '.test-artifacts/media-JmFz4w/benchmark.json'
.venv\Scripts\python.exe -B scripts/smoke-reference-model.py .test-artifacts/so400m-verification/provider-request.json .test-artifacts/so400m-verification/provider-smoke-repeat.json
npm.cmd run verify
```

## Synthetic regression evidence

The final regular media integration evidence is under [`.test-artifacts/media-cPj8XS`](../.test-artifacts/media-cPj8XS/). It contains generated media, its authorization manifest, the frozen synthetic benchmark, selected PNGs, cache entries, and Content/Adaptive fingerprint/evaluation artifacts. The earlier [`.test-artifacts/media-JmFz4w`](../.test-artifacts/media-JmFz4w/) fixture supplies the reference for the real-model verification above. Regular media integration uses explicitly identified deterministic stub embeddings.

Each real local operation retains elapsed time and work units; external API spend is zero, while infrastructure cost remains explicitly unmeasured. No raw vectors or source paths are persisted in the fingerprint. Generated evidence directories and model/cache artifacts are ignored source-control artifacts.

Tests cover migration/version dispatch, unknown roles/transitions, nullable embedding references, hashing, authorization and content binding, metadata/interchange parsing, shot partitions, actual-PTS deterministic sampling, cache keys/invalidation/corruption, normalized aggregation, pacing, benchmark integrity/tolerance, fingerprint joins, telemetry, media mutation detection, stage-specific failures, local process paths, bounded embedding requests, and network-free execution. The six Python tests include the real installed SigLIP API exercised with deterministic tiny generated parameters; no pretrained model is involved.

## Implementation inventory

| Area | Created or modified |
| --- | --- |
| Contracts and provider boundary | New `packages/contracts/reference-v11.ts`; additive exports/types in `packages/contracts/index.ts` and `packages/domain/index.ts`; backward-compatible defaulted generics in `packages/providers/index.ts`. |
| Reference analyzer | New `packages/reference-analyzer/{protocol,features,embeddings,models,index}.ts` and `packages/evaluation/reference.ts`. |
| Python worker | New `python/reference_analyzer/{__init__,__main__,offline,media,siglip}.py`; tests in `python/tests/test_siglip.py`. No Python ReferenceFingerprint model. |
| Local execution/setup | New `scripts/reference-local.ts`, `scripts/analyze-reference.ts`, `scripts/setup-reference.ps1`, `scripts/test-python.py`, `pyproject.toml`, `.python-version`, and `uv.lock`; explicit `scripts/download-so400m.py` and `scripts/smoke-reference-model.py` support approved provisioning and separate offline measurement. |
| Verification artifacts | New migration/core/local/media tests, frozen digest fixture, v1.1 fixture/schema and narrow interchange schemas. Updated schema exporter, workspace audit and project-tree script. |
| Project documentation/configuration | Updated `package.json`, `.gitignore`, README, architecture/contracts/phases/verification docs and project tree. Added this report, setup/analyzer guide, migration guide and evaluation protocol. Existing npm dependency pins remain unchanged. |

Direct runtime pins: PySceneDetect 0.6.7.1, OpenCV headless 4.12.0.88, NumPy 2.2.6, Pillow 11.3.0, PyTorch 2.8.0+cpu, Transformers 4.57.1 and jsonschema 4.25.1. [Setup and dependency details](reference-analyzer.md) include sources/licenses and the local tooling layout. [Contract migration](reference-contract-v11.md) documents the exact diff and compatibility. [Evaluation protocol](reference-evaluation.md) documents boundary matching and evidence limits.

Cache identity binds media SHA-256, sample identity, model/revision, patch/preprocessing configuration, device/fallback policy, implementation versions and aggregation. Normalized frame vectors and normalized mean shot vectors live behind checksummed local artifact references. Cache-only runs report no compute device; mixed CPU/GPU execution is explicit in the sidecar. Provider IPC batches contain at most eight images, with model inference batch size one.

## Limits and scope

Pretrained embeddings are verified, but real GPU memory/latency, manually reviewed creator benchmark quality, superiority over Base and matching usefulness remain unmeasured. Synthetic boundary scores establish behavior on controlled fixtures only. Roles, transition types, camera/subject motion categories, captions, semantic regions and unsupported audio analysis remain unknown/unassigned. Raw brightness/blur/flow measurements are not calibrated quality probabilities. Broader phone/HDR/codec/VFR coverage remains future evaluation work.

No creator media was acquired. No hosted inference, paid service, footage analyzer, matcher, planner, renderer implementation, UI, API, cloud infrastructure, training, creator memory or trend system was added. Existing Phase 0 seams remain as before. If the owner separately elects to proceed, the proposed next phase is **Phase 2 — Footage Analyzer V0**; no Phase 2 work is authorized or started here.
