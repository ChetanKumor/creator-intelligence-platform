import hashlib
import json
import math
from pathlib import Path
import sys
import time

import numpy as np
import soundfile as sf


PROTOCOL_VERSION = "1.0.0"
ADAPTER_VERSION = "rms-energy-adapter-0.1.0"
ALGORITHM_VERSION = "rms-db-p10-p95-v1"

WINDOW_SECONDS = 0.5
HOP_SECONDS = 0.5

MAX_REQUEST_BYTES = 64 * 1024
MAX_POINTS = 50000


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as source:
        for chunk in iter(
            lambda: source.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def analyze(audio: Path):
    if not audio.is_file():
        raise RuntimeError("AUDIO_UNREADABLE")

    start = time.perf_counter()

    with sf.SoundFile(audio) as source:
        sample_rate = int(source.samplerate)
        channels = int(source.channels)
        frames = int(source.frames)

        if (
            sample_rate <= 0 or
            channels <= 0 or
            frames <= 0
        ):
            raise RuntimeError("AUDIO_UNREADABLE")

        duration = frames / sample_rate

        window_frames = max(
            1,
            round(WINDOW_SECONDS * sample_rate),
        )

        times = []
        rms_values = []

        peak = 0.0
        total_square = 0.0
        total_samples = 0
        frame_cursor = 0

        while True:
            block = source.read(
                window_frames,
                dtype="float32",
                always_2d=True,
            )

            if len(block) == 0:
                break

            values = block.astype(
                np.float64,
                copy=False,
            )

            block_peak = float(
                np.max(np.abs(values))
            )

            peak = max(peak, block_peak)

            squares = values * values

            block_sum_square = float(
                np.sum(squares)
            )

            block_count = values.size

            total_square += block_sum_square
            total_samples += block_count

            block_rms = math.sqrt(
                block_sum_square / block_count
            )

            center_seconds = (
                frame_cursor + len(block) / 2
            ) / sample_rate

            times.append(
                min(center_seconds, duration)
            )

            rms_values.append(block_rms)

            frame_cursor += len(block)

    if not rms_values:
        raise RuntimeError("AUDIO_UNREADABLE")

    overall_rms = math.sqrt(
        total_square / total_samples
    )

    if peak <= 0.0 or overall_rms <= 0.0:
        raise RuntimeError("AUDIO_SILENT")

    if len(rms_values) > MAX_POINTS:
        raise RuntimeError("ENERGY_ANALYSIS_FAILED")

    dbfs = np.asarray([
        20.0 * math.log10(max(value, 1e-8))
        for value in rms_values
    ], dtype=np.float64)

    low_dbfs = float(
        np.percentile(dbfs, 10)
    )

    high_dbfs = float(
        np.percentile(dbfs, 95)
    )

    flat = (
        high_dbfs - low_dbfs
    ) < 3.0

    points = []

    if flat:
        for at_seconds, rms in zip(
            times,
            rms_values,
        ):
            energy = (
                0.0 if rms <= 1e-8 else 0.5
            )

            points.append({
                "atSeconds": at_seconds,
                "energy": energy,
            })

    else:
        span = high_dbfs - low_dbfs

        for at_seconds, value_dbfs in zip(
            times,
            dbfs,
        ):
            energy = (
                value_dbfs - low_dbfs
            ) / span

            energy = float(
                np.clip(energy, 0.0, 1.0)
            )

            points.append({
                "atSeconds": at_seconds,
                "energy": energy,
            })

    analysis_seconds = (
        time.perf_counter() - start
    )

    return {
        "protocolVersion": PROTOCOL_VERSION,
        "operation": "energy",
        "toolVersion": ADAPTER_VERSION,

        "audio": {
            "sha256": sha256_file(audio),
            "durationSeconds": duration,
            "sampleRate": sample_rate,
            "channels": channels,
            "peak": peak,
            "rms": overall_rms,
        },

        "config": {
            "version": ALGORITHM_VERSION,
            "windowSeconds": WINDOW_SECONDS,
            "hopSeconds": HOP_SECONDS,
        },

        "normalization": {
            "lowDbfs": low_dbfs,
            "highDbfs": high_dbfs,
            "flat": flat,
        },

        "value": {
            "energy": points,
        },

        "performance": {
            "analysisSeconds": analysis_seconds,
            "realtimeFactor": (
                duration / analysis_seconds
                if analysis_seconds > 0
                else None
            ),
        },
    }


def failure(code):
    allowed = {
        "AUDIO_UNREADABLE",
        "AUDIO_SILENT",
        "ENERGY_ANALYSIS_FAILED",
    }

    if code not in allowed:
        code = "ENERGY_ANALYSIS_FAILED"

    return {
        "protocolVersion": PROTOCOL_VERSION,
        "error": {
            "stage": "energy",
            "code": code,
            "diagnostic":
                "Local energy analysis failed.",
        },
    }


for raw_line in sys.stdin:
    try:
        if (
            len(raw_line.encode("utf-8"))
            > MAX_REQUEST_BYTES
        ):
            raise RuntimeError(
                "ENERGY_ANALYSIS_FAILED"
            )

        request = json.loads(raw_line)

        if (
            not isinstance(request, dict) or
            request.get("protocolVersion")
                != PROTOCOL_VERSION or
            request.get("operation")
                != "energy" or
            not isinstance(
                request.get("audioPath"),
                str,
            )
        ):
            raise RuntimeError(
                "ENERGY_ANALYSIS_FAILED"
            )

        response = analyze(
            Path(
                request["audioPath"]
            ).resolve()
        )

    except Exception as exc:
        response = failure(str(exc))

    sys.stdout.write(
        json.dumps(
            response,
            allow_nan=False,
            separators=(",", ":"),
        )
        + "\n"
    )

    sys.stdout.flush()
