import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import statistics
import sys
import time

import numpy as np
import soundfile as sf
import torch
from beat_this.inference import File2Beats


PROTOCOL_VERSION = "1.0.0"
ADAPTER_VERSION = "beat-this-adapter-0.1.0"
MAX_REQUEST_BYTES = 64 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def signal_stats(path: Path):
    peak = 0.0
    sum_sq = 0.0
    count = 0

    with sf.SoundFile(path) as source:
        sample_rate = int(source.samplerate)
        channels = int(source.channels)
        frames = int(source.frames)

    for block in sf.blocks(
        path,
        blocksize=262144,
        dtype="float32",
        always_2d=True,
    ):
        peak = max(peak, float(np.max(np.abs(block))))

        values = block.astype(np.float64)

        sum_sq += float(np.sum(values * values))
        count += values.size

    rms = math.sqrt(sum_sq / count) if count else 0.0

    duration = (
        frames / sample_rate
        if sample_rate > 0
        else 0.0
    )

    return {
        "sampleRate": sample_rate,
        "channels": channels,
        "durationSeconds": duration,
        "peak": peak,
        "rms": rms,
    }


def strictly_increasing(values):
    return all(
        right > left
        for left, right in zip(values, values[1:])
    )


class BeatRuntime:
    def __init__(self):
        self.tracker = None
        self.tracker_key = None
        self.checkpoint_hashes = {}

    def checkpoint_hash(self, checkpoint: Path) -> str:
        key = str(checkpoint)

        value = self.checkpoint_hashes.get(key)

        if value is None:
            value = sha256_file(checkpoint)
            self.checkpoint_hashes[key] = value

        return value

    def get_tracker(
        self,
        checkpoint: Path,
        device: str,
    ):
        key = (str(checkpoint), device)

        if self.tracker is not None and self.tracker_key == key:
            return self.tracker, 0.0

        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA_UNAVAILABLE")

        if device == "cuda":
            torch.cuda.empty_cache()

        start = time.perf_counter()

        tracker = File2Beats(
            checkpoint_path=str(checkpoint),
            device=device,
            float16=False,
            dbn=False,
        )

        if device == "cuda":
            torch.cuda.synchronize()

        elapsed = time.perf_counter() - start

        self.tracker = tracker
        self.tracker_key = key

        return tracker, elapsed

    def analyze(self, request):
        audio = Path(request["audioPath"]).resolve()
        checkpoint = Path(request["checkpointPath"]).resolve()
        device = request["device"]

        if not audio.is_file():
            raise RuntimeError("AUDIO_UNREADABLE")

        if not checkpoint.is_file():
            raise RuntimeError("CHECKPOINT_UNREADABLE")

        stats = signal_stats(audio)

        if stats["peak"] <= 0.0 or stats["rms"] <= 0.0:
            raise RuntimeError("AUDIO_SILENT")

        tracker, model_load_seconds = self.get_tracker(
            checkpoint,
            device,
        )

        start = time.perf_counter()

        beats, downbeats = tracker(str(audio))

        if device == "cuda":
            torch.cuda.synchronize()

        inference_seconds = time.perf_counter() - start

        beats = [float(value) for value in beats]
        downbeats = [float(value) for value in downbeats]

        duration = float(stats["durationSeconds"])

        if not beats:
            raise RuntimeError("NO_BEATS")

        if not strictly_increasing(beats):
            raise RuntimeError("BEATS_NOT_MONOTONIC")

        if downbeats and not strictly_increasing(downbeats):
            raise RuntimeError("DOWNBEATS_NOT_MONOTONIC")

        if any(
            value < 0 or value > duration + 0.25
            for value in beats
        ):
            raise RuntimeError("BEATS_OUT_OF_BOUNDS")

        if any(
            value < 0 or value > duration + 0.25
            for value in downbeats
        ):
            raise RuntimeError("DOWNBEATS_OUT_OF_BOUNDS")

        intervals = [
            right - left
            for left, right in zip(beats, beats[1:])
            if right > left
        ]

        bpm = (
            60.0 / statistics.median(intervals)
            if intervals
            else None
        )

        return {
            "protocolVersion": PROTOCOL_VERSION,
            "operation": "beats",
            "toolVersion": ADAPTER_VERSION,

            "model": {
                "provider": "beat-this",
                "packageVersion": importlib.metadata.version(
                    "beat-this"
                ),
                "checkpointSha256": self.checkpoint_hash(
                    checkpoint
                ),
                "device": device,
                "torchVersion": torch.__version__,
                "cudaRuntime": torch.version.cuda,
            },

            "audio": {
                "sha256": sha256_file(audio),
                **stats,
            },

            "value": {
                "bpm": bpm,
                "beatsSeconds": beats,
                "downbeatsSeconds": downbeats,
            },

            "performance": {
                "modelLoadSeconds": model_load_seconds,
                "inferenceSeconds": inference_seconds,
                "realtimeFactor": (
                    duration / inference_seconds
                    if inference_seconds > 0
                    else None
                ),
            },
        }


runtime = BeatRuntime()


def failure(code):
    allowed = {
        "AUDIO_UNREADABLE",
        "CHECKPOINT_UNREADABLE",
        "AUDIO_SILENT",
        "CUDA_UNAVAILABLE",
        "NO_BEATS",
        "BEATS_NOT_MONOTONIC",
        "DOWNBEATS_NOT_MONOTONIC",
        "BEATS_OUT_OF_BOUNDS",
        "DOWNBEATS_OUT_OF_BOUNDS",
    }

    if code not in allowed:
        code = "BEAT_ANALYSIS_FAILED"

    return {
        "protocolVersion": PROTOCOL_VERSION,
        "error": {
            "stage": "beats",
            "code": code,
            "diagnostic": "Local beat analysis failed.",
        },
    }


def dispatch(request):
    if not isinstance(request, dict):
        raise RuntimeError("INTERCHANGE_INVALID")

    if request.get("protocolVersion") != PROTOCOL_VERSION:
        raise RuntimeError("INTERCHANGE_INVALID")

    if request.get("operation") != "beats":
        raise RuntimeError("INTERCHANGE_INVALID")

    if not isinstance(request.get("audioPath"), str):
        raise RuntimeError("INTERCHANGE_INVALID")

    if not isinstance(request.get("checkpointPath"), str):
        raise RuntimeError("INTERCHANGE_INVALID")

    if request.get("device") not in ("cpu", "cuda"):
        raise RuntimeError("INTERCHANGE_INVALID")

    return runtime.analyze(request)


for raw_line in sys.stdin:
    try:
        if len(raw_line.encode("utf-8")) > MAX_REQUEST_BYTES:
            raise RuntimeError("INTERCHANGE_INVALID")

        request = json.loads(raw_line)
        response = dispatch(request)

    except Exception as exc:
        code = str(exc)

        if code == "INTERCHANGE_INVALID":
            code = "BEAT_ANALYSIS_FAILED"

        response = failure(code)

    sys.stdout.write(
        json.dumps(
            response,
            allow_nan=False,
            separators=(",", ":"),
        )
        + "\n"
    )

    sys.stdout.flush()
