# Phase 3 Speech/ASR Component

Date: 2026-09-21

## Ruling

**COMPLETE at component scope.**

The Speech/ASR component is implementation-complete and verified with the pinned real model on authorized real footage through the frozen public `SpeechProvider` application contract.

This ruling does **not** close all of Phase 3 Audio Analyzer V0.

## Frozen public seam

The existing provider contract was preserved:

`SpeechProvider.transcribe(asset, context) -> AnalysisResult<Transcript>`

No public `SpeechProvider`, `Transcript`, `SpeechRegion`, `MediaAsset` or `ModelRun` contract was widened to carry execution paths or model-specific metadata.

`MediaAsset.objectId` remains object identity. The local filesystem path is supplied through an explicit execution-only resolver.

## Runtime path

`SpeechProvider`
→ `SpeechProviderAdapter`
→ `LocalSpeechProvider`
→ `LocalSpeechAnalysisProvider`
→ `SpeechWorker`
→ owned `python/speech_analyzer`
→ faster-whisper
→ CTranslate2 CUDA
→ validated internal response
→ `Transcript` + `ModelRun`.

The Python process is persistent so repeated requests can reuse the loaded model.

Model loading is offline-only. Model identity is verified before inference.

## Verified model identity

- repository: `Systran/faster-whisper-small`
- revision: `536b0662742c02347bc0e980a01041f333bce120`
- faster-whisper: `1.2.1`
- CTranslate2: `4.8.2`
- device: CUDA
- compute type: `float16`
- GPU: NVIDIA GeForce RTX 4050 Laptop GPU
- model-set SHA-256: `1327706b2cad006266912ab307bcf5903f768c066af00dbc7c7b434cb2664d3b`
- `model.bin` SHA-256: `3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671`

The owned runtime verifies the pinned model files before loading them.

## Real-footage evidence

Authorized source:

- file: `ChrisRaw.mp4`
- SHA-256: `5bd959cd99ab5b8c3bc7ceb19c70898a1eb4c852cd159fccd502b024177af3f0`
- duration: 13.523603 seconds

Direct owned-provider proof:

- device: CUDA
- compute type: float16
- detected language: English
- language probability: 0.998046875
- regions: 1
- first inference model load: 0.967 seconds
- first inference: 1.185 seconds
- reported realtime factor: 11.416
- transcript: `[0.000 -> 1.640] Jason Pargin says,`

The immediate second request used the same persistent worker:

- second model load: `0`
- second inference: 0.659 seconds
- transcript identical: YES
- model reused: YES

## Frozen public-provider proof

The real application seam also passed:

- provider: `local_speech`
- model: `faster-whisper-small`
- model revision: pinned revision above
- adapter: `faster-whisper-adapter-0.1.0`
- operation: `speech`
- asset ID preserved
- execution-only resolver called exactly once
- one validated transcript region returned
- CUDA execution completed successfully

## Validation and safety

The component provides:

- strict TypeScript request/response/failure schemas;
- ordered, non-overlapping and in-bounds speech regions;
- sanitized failure codes;
- bounded worker input/output;
- drained, non-persisted native stderr;
- offline Hugging Face/model loading flags;
- explicit CUDA runtime checks;
- complete pinned model-file identity verification;
- no silent CPU fallback;
- no filesystem path encoded into `MediaAsset`;
- no fake calibrated confidence.

Per-region `confidence` remains `null`. Average log probability is not represented as calibrated confidence.

## Final repository verification

Canonical `npm run verify` passed after the implementation:

- TypeScript tests: 99 passed, 0 failed, 0 skipped;
- media integration tests: 6 passed, 0 failed, 0 skipped;
- Python tests: 15 passed;
- workspace audit: PASS;
- application TypeScript files audited: 44;
- explicit local runtime adapters audited: 9;
- generated schema/synthetic fixture artifacts checked: 33;
- synthetic demo: PASS;
- schema drift check: PASS.

The final public `SpeechProvider` real-CUDA smoke also passed separately.

## Limits

This component does not prove:

- Hindi, Telugu or other multilingual recognition quality on real authorized footage;
- word error rate or benchmark superiority;
- noisy event/wedding audio robustness;
- multi-speaker diarization;
- word-level timestamp/alignment quality;
- WhisperX integration;
- broad-domain transcription quality;
- that `faster-whisper-small` is the final production checkpoint.

The current model is the verified implementation checkpoint for this component. Model-quality benchmarking and any checkpoint upgrade require separate evidence.

## Phase status

Speech/ASR: **COMPLETE**.

Phase 3 Audio Analyzer V0 overall: **ACTIVE / NOT YET CLOSED**.
