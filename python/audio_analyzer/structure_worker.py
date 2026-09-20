from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time

import soundfile as sf
import torch

import allin1
import allin1.models.loaders as loaders


PROTOCOL_VERSION = "1.0.0"

ADAPTER_VERSION = (
    "allin1-structure-adapter-0.1.0"
)

MODEL_NAME = "harmonix-all"

MAX_REQUEST_BYTES = 64 * 1024


EXPECTED = {
    "harmonix-fold0":
        "harmonix-fold0-0vra4ys2.pth",

    "harmonix-fold1":
        "harmonix-fold1-3ozjhtsj.pth",

    "harmonix-fold2":
        "harmonix-fold2-gmgo0nsy.pth",

    "harmonix-fold3":
        "harmonix-fold3-i92b7m8p.pth",

    "harmonix-fold4":
        "harmonix-fold4-1bql5qo0.pth",

    "harmonix-fold5":
        "harmonix-fold5-x4z5zeef.pth",

    "harmonix-fold6":
        "harmonix-fold6-x7t226rq.pth",

    "harmonix-fold7":
        "harmonix-fold7-qwwskhg6.pth",
}


MODEL_DIR = Path(
    os.environ["AIO_MODEL_DIR"]
).resolve()

WORK_ROOT = Path(
    os.environ["AIO_WORK_ROOT"]
).resolve()

WORK_ROOT.mkdir(
    parents=True,
    exist_ok=True,
)


_checkpoint_cache = None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as source:
        for chunk in iter(
            lambda: source.read(
                1024 * 1024
            ),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def checkpoint_evidence():
    global _checkpoint_cache

    if _checkpoint_cache is not None:
        return _checkpoint_cache

    values = []

    for filename in EXPECTED.values():
        path = MODEL_DIR / filename

        if not path.is_file():
            raise RuntimeError(
                "CHECKPOINT_SET_INVALID"
            )

        values.append({
            "filename": filename,
            "sha256":
                sha256_file(path),
        })

    canonical = "\n".join(
        (
            item["filename"] +
            ":" +
            item["sha256"]
        )
        for item in values
    ).encode("utf-8")

    set_hash = hashlib.sha256(
        canonical
    ).hexdigest()

    _checkpoint_cache = (
        values,
        set_hash,
    )

    return _checkpoint_cache


def local_hf_hub_download(
    repo_id=None,
    filename=None,
    cache_dir=None,
    **kwargs,
):
    del cache_dir, kwargs

    if repo_id != "taejunkim/allinone":
        raise RuntimeError(
            "CHECKPOINT_SET_INVALID"
        )

    if filename not in EXPECTED.values():
        raise RuntimeError(
            "CHECKPOINT_SET_INVALID"
        )

    path = MODEL_DIR / filename

    if not path.is_file():
        raise RuntimeError(
            "CHECKPOINT_SET_INVALID"
        )

    return str(path)


loaders.hf_hub_download = (
    local_hf_hub_download
)


def audio_evidence(path: Path):
    if not path.is_file():
        raise RuntimeError(
            "AUDIO_UNREADABLE"
        )

    try:
        with sf.SoundFile(path) as source:
            sample_rate = int(
                source.samplerate
            )

            channels = int(
                source.channels
            )

            frames = int(
                source.frames
            )

    except Exception as exc:
        raise RuntimeError(
            "AUDIO_UNREADABLE"
        ) from exc

    if (
        sample_rate <= 0 or
        channels <= 0 or
        frames <= 0
    ):
        raise RuntimeError(
            "AUDIO_UNREADABLE"
        )

    return {
        "sha256":
            sha256_file(path),

        "durationSeconds":
            frames / sample_rate,

        "sampleRate":
            sample_rate,

        "channels":
            channels,
    }


def validate_segments(
    segments,
    duration,
):
    if not segments:
        raise RuntimeError(
            "STRUCTURE_EMPTY"
        )

    previous_start = -1.0
    previous_end = -1.0

    for segment in segments:
        start = segment["startSeconds"]
        end = segment["endSeconds"]

        if (
            start < 0 or
            end <= start or
            end > duration + 0.25
        ):
            raise RuntimeError(
                "STRUCTURE_INVALID"
            )

        if (
            previous_start >= 0 and
            start < previous_start
        ):
            raise RuntimeError(
                "STRUCTURE_INVALID"
            )

        if (
            previous_end >= 0 and
            start + 0.05 <
            previous_end
        ):
            raise RuntimeError(
                "STRUCTURE_INVALID"
            )

        previous_start = start
        previous_end = end

    if segments[0]["startSeconds"] > 0.25:
        raise RuntimeError(
            "STRUCTURE_INVALID"
        )

    if (
        segments[-1]["endSeconds"] <
        duration - 0.25
    ):
        raise RuntimeError(
            "STRUCTURE_INVALID"
        )


def analyze(request):
    audio = Path(
        request["audioPath"]
    ).resolve()

    device = request["device"]

    if (
        device == "cuda" and
        not torch.cuda.is_available()
    ):
        raise RuntimeError(
            "CUDA_UNAVAILABLE"
        )

    checkpoints, set_hash = (
        checkpoint_evidence()
    )

    audio_info = audio_evidence(
        audio
    )

    cache_key = (
        audio_info["sha256"][:24]
    )

    work_dir = (
        WORK_ROOT /
        cache_key
    )

    demix_dir = (
        work_dir /
        "demix"
    )

    spec_dir = (
        work_dir /
        "spec"
    )

    work_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    started = time.perf_counter()

    # stdout is the JSONL protocol channel.
    #
    # All-In-One invokes Demucs in a subprocess, so
    # contextlib.redirect_stdout() is insufficient:
    # the child inherits the process-level fd 1.
    #
    # Temporarily point fd 1 at stderr while upstream
    # inference runs. Restore it before emitting JSON.
    sys.stdout.flush()
    saved_stdout_fd = os.dup(1)

    try:
        os.dup2(2, 1)

        result = allin1.analyze(
            paths=str(audio),

            out_dir=None,

            model=MODEL_NAME,

            device=device,

            include_activations=False,

            include_embeddings=False,

            demix_dir=str(demix_dir),

            spec_dir=str(spec_dir),

            keep_byproducts=True,

            overwrite=True,

            multiprocess=False,
        )

        sys.stdout.flush()

    finally:
        os.dup2(
            saved_stdout_fd,
            1,
        )

        os.close(
            saved_stdout_fd
        )

    if device == "cuda":
        torch.cuda.synchronize()

    elapsed = (
        time.perf_counter() -
        started
    )

    segments = [
        {
            "startSeconds":
                float(segment.start),

            "endSeconds":
                float(segment.end),

            "label":
                str(segment.label),
        }
        for segment in result.segments
    ]

    validate_segments(
        segments,
        float(
            audio_info[
                "durationSeconds"
            ]
        ),
    )

    return {
        "protocolVersion":
            PROTOCOL_VERSION,

        "operation":
            "structure",

        "toolVersion":
            ADAPTER_VERSION,

        "model": {
            "provider":
                "all-in-one",

            "packageVersion":
                importlib.metadata.version(
                    "allin1"
                ),

            "modelName":
                MODEL_NAME,

            "checkpointCount":
                len(checkpoints),

            "checkpointSetSha256":
                set_hash,

            "checkpoints":
                checkpoints,

            "device":
                device,

            "torchVersion":
                torch.__version__,

            "cudaRuntime":
                torch.version.cuda,
        },

        "audio":
            audio_info,

        "value": {
            "segments":
                segments,
        },

        "performance": {
            "analysisSeconds":
                elapsed,
        },
    }


def failure(code):
    allowed = {
        "AUDIO_UNREADABLE",
        "CHECKPOINT_SET_INVALID",
        "CUDA_UNAVAILABLE",
        "STRUCTURE_EMPTY",
        "STRUCTURE_INVALID",
    }

    if code not in allowed:
        code = (
            "STRUCTURE_ANALYSIS_FAILED"
        )

    return {
        "protocolVersion":
            PROTOCOL_VERSION,

        "error": {
            "stage":
                "structure",

            "code":
                code,

            "diagnostic":
                "Local structure analysis failed.",
        },
    }


def dispatch(request):
    if not isinstance(
        request,
        dict,
    ):
        raise RuntimeError(
            "STRUCTURE_ANALYSIS_FAILED"
        )

    if (
        request.get(
            "protocolVersion"
        ) != PROTOCOL_VERSION
    ):
        raise RuntimeError(
            "STRUCTURE_ANALYSIS_FAILED"
        )

    if (
        request.get("operation")
        != "structure"
    ):
        raise RuntimeError(
            "STRUCTURE_ANALYSIS_FAILED"
        )

    if not isinstance(
        request.get("audioPath"),
        str,
    ):
        raise RuntimeError(
            "STRUCTURE_ANALYSIS_FAILED"
        )

    if request.get("device") not in (
        "cpu",
        "cuda",
    ):
        raise RuntimeError(
            "STRUCTURE_ANALYSIS_FAILED"
        )

    return analyze(request)


for raw_line in sys.stdin:
    try:
        if (
            len(
                raw_line.encode(
                    "utf-8"
                )
            ) >
            MAX_REQUEST_BYTES
        ):
            raise RuntimeError(
                "STRUCTURE_ANALYSIS_FAILED"
            )

        request = json.loads(
            raw_line
        )

        response = dispatch(
            request
        )

    except Exception as exc:
        response = failure(
            str(exc)
        )

    sys.stdout.write(
        json.dumps(
            response,
            allow_nan=False,
            separators=(",", ":"),
        )
        + "\n"
    )

    sys.stdout.flush()
