# Footage evaluation protocol

Evaluation distinguishes mechanical correctness from creative usefulness. Every retained candidate must pass frozen ClipSegment validation. Its persisted sidecar must also pass source-boundary, identity, configuration, feature-lineage, embedding-space, count and pruning-partition checks.

Temporal union coverage is the duration covered by any retained candidate divided by source duration. Maximum uncovered gap and represented source-shot counts accompany it. Measure this before pruning and after pruning, and protect coverage separately at each candidate duration scale. Union coverage alone does not prove that any requested edit duration can be reproduced.

For labeled synthetic regions, a region is represented if at least one retained candidate has intersection-over-union ≥ 0.5 with that interval. Coverage is represented regions divided by eligible labeled regions. The three-scene generated fixture labels all three one-second shots. A deterministic 30-second test also labels ten consecutive three-second regions. The 150-second static fixture tests adaptive sampling, temporal spread and duration allocation under the 64-candidate cap. The 600-second lattice test tests budget pressure and source-shot coverage; it does not claim exhaustive candidate coverage.

Source boundaries use the existing Phase 1 one-to-one matching metric with ±1-frame tolerance. The generated three-scene clip has exact boundaries at one and two seconds. Synthetic boundary precision/recall/F1 are evidence for that fixture only.

The complexity test explicitly constructs 200 overlapping candidate windows from 18 unique semantic frames. A counting deterministic provider must see exactly 18 frame operations before aggregation, no additional calls during aggregation, and zero new frame operations on repeat. An additional full-pipeline test changes only candidate limits and requires unchanged frame evidence and no new embeddings. Static identical images share an embedding while keeping separate timestamp identities. The source audit also prohibits provider invocation from the aggregator and reference-fingerprint dependencies from the footage package.

Report cheap frames, semantic requests, selected frames, exact unique image count, embeddings computed, frame and aggregate cache hits/misses, elapsed wall time, runtime per source minute, candidate counts before/after deduplication and validated ClipSegment rate. Exact ID/configuration equality is required for deterministic operations. Real floating-point inference uses finite-component, dimension, checksum and unit-norm checks with the released 1e-6 tolerance; cross-hardware bitwise equality is not claimed.

Synthetic integration exercises real local ffprobe, FFmpeg, PySceneDetect and OpenCV with deterministic stub embeddings. Fixtures cover scene changes, a 150-second static/dark take, a single-frame clip, moving/blurred material, different resolutions, portrait orientation, VFR, duplicates and corrupt/unsupported inputs. Existing Phase 1 integration retains phone-rotation and rapid-cut checks. Partial CLI success, safe paths, cache repair, authorization, source mutation, temporal lineage and multiple-asset/project bounds are tested.

Human usefulness, semantic matching quality, real creator-media coverage, reference-specific sufficiency and aesthetic quality remain unmeasured. They must not be inferred from schema validity, synthetic coverage, or local API spend. Cached real Phase 1 vectors demonstrate compatibility and aggregation but do not satisfy the fresh-model verification gate.

Run `npm.cmd run verify` for all offline regressions. See [the verification report](footage-verification.md) for measured results and the separate guarded real-model command.
