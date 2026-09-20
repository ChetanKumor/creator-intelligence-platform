import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from contextlib import contextmanager


PROTOCOL_VERSION = "1.0.0"

ADAPTER_VERSION = (
    "transnetv2-detector-adapter-0.1.0"
)

SOURCE_COMMIT = (
    "85cef72af9a916bdfd7cc94a670c9cdfbf12d1ed"
)

EXPECTED_WEIGHTS = {
    "saved_model.pb":
        "8ac2a52c5719690d512805b6eaf5ce12097c1d8860b3d9de245dcbbc3100f554",

    "variables/variables.data-00000-of-00001":
        "b8c9dc3eb807583e6215cabee9ca61737b3eb1bceff68418b43bf71459669367",

    "variables/variables.index":
        "8b99e28b4ad11372d9a1ad9703298c2e370df14859da4245fdbe818e92dd403f",
}


REPO = Path(
    os.environ["TRANSNET_REPO"]
).resolve()

WEIGHTS = Path(
    os.environ["TRANSNET_WEIGHTS"]
).resolve()


class StageFailure(Exception):
    def __init__(
        self,
        code,
    ):
        super().__init__(code)
        self.code = code


@contextmanager
def silence_upstream_stdout():
    # stdout belongs exclusively to JSONL.
    # Native libraries/subprocesses may bypass
    # contextlib.redirect_stdout, so redirect fd 1.
    sys.stdout.flush()

    saved = os.dup(1)

    try:
        os.dup2(
            2,
            1,
        )

        yield

        sys.stdout.flush()

    finally:
        os.dup2(
            saved,
            1,
        )

        os.close(
            saved
        )


def sha256_file(path):
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda:
                handle.read(
                    8 * 1024 * 1024
                ),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def run_text(args):
    try:
        result = subprocess.run(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=True,
        )
    except Exception as exc:
        raise StageFailure(
            "MODEL_PROVENANCE_INVALID"
        ) from exc

    try:
        return (
            result.stdout
            .decode(
                "utf-8",
                errors="strict",
            )
            .strip()
        )
    except Exception as exc:
        raise StageFailure(
            "MODEL_PROVENANCE_INVALID"
        ) from exc


def verify_source():
    commit = run_text([
        "git",
        "-C",
        str(REPO),
        "rev-parse",
        "HEAD",
    ])

    if commit != SOURCE_COMMIT:
        raise StageFailure(
            "MODEL_PROVENANCE_INVALID"
        )

    source = (
        REPO /
        "inference" /
        "transnetv2.py"
    )

    if not source.is_file():
        raise StageFailure(
            "MODEL_PROVENANCE_INVALID"
        )

    try:
        subprocess.run(
            [
                "git",
                "-C",
                str(REPO),
                "diff",
                "--quiet",
                "--",
                "inference/transnetv2.py",
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
            check=True,
        )
    except Exception as exc:
        raise StageFailure(
            "MODEL_PROVENANCE_INVALID"
        ) from exc

    return sha256_file(source)


def verify_weights():
    combined = hashlib.sha256()

    for relative in sorted(
        EXPECTED_WEIGHTS
    ):
        path = WEIGHTS / relative

        if not path.is_file():
            raise StageFailure(
                "MODEL_PROVENANCE_INVALID"
            )

        actual = sha256_file(path)

        if (
            actual !=
            EXPECTED_WEIGHTS[relative]
        ):
            raise StageFailure(
                "MODEL_PROVENANCE_INVALID"
            )

        combined.update(
            relative.encode("utf-8")
        )
        combined.update(b"\0")
        combined.update(
            actual.encode("ascii")
        )
        combined.update(b"\n")

    return combined.hexdigest()


def is_windows_path(value):
    return bool(
        re.match(
            r"^[A-Za-z]:[\\/]",
            value,
        )
    )


def convert_wslpath(mode, value):
    try:
        result = subprocess.run(
            [
                "wslpath",
                mode,
                value,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
            check=True,
        )
    except Exception as exc:
        raise StageFailure(
            "MEDIA_UNREADABLE"
        ) from exc

    converted = result.stdout.strip()

    if not converted:
        raise StageFailure(
            "MEDIA_UNREADABLE"
        )

    return converted


def execution_paths(
    ffmpeg_path,
    media_path,
):
    if is_windows_path(
        ffmpeg_path
    ):
        executable = convert_wslpath(
            "-u",
            ffmpeg_path,
        )

        media = (
            media_path
            if is_windows_path(
                media_path
            )
            else convert_wslpath(
                "-w",
                media_path,
            )
        )

        return executable, media

    media = (
        convert_wslpath(
            "-u",
            media_path,
        )
        if is_windows_path(
            media_path
        )
        else media_path
    )

    return (
        ffmpeg_path,
        media,
    )


_model = None
_model_load_seconds = 0.0
_source_sha256 = None
_weight_set_sha256 = None
_tensorflow_version = None
_gpu_name = None


def ensure_model():
    global _model
    global _model_load_seconds
    global _source_sha256
    global _weight_set_sha256
    global _tensorflow_version
    global _gpu_name

    if _model is not None:
        return

    _source_sha256 = verify_source()
    _weight_set_sha256 = (
        verify_weights()
    )

    try:
        import tensorflow as tf
    except Exception as exc:
        raise StageFailure(
            "TRANSNET_ANALYSIS_FAILED"
        ) from exc

    gpus = (
        tf.config
        .list_physical_devices(
            "GPU"
        )
    )

    if not gpus:
        raise StageFailure(
            "CUDA_UNAVAILABLE"
        )

    try:
        tf.config.experimental\
            .set_memory_growth(
                gpus[0],
                True,
            )
    except RuntimeError:
        pass

    details = (
        tf.config.experimental
        .get_device_details(
            gpus[0]
        )
    )

    _gpu_name = str(
        details.get(
            "device_name",
            "",
        )
    )

    if not _gpu_name:
        raise StageFailure(
            "CUDA_UNAVAILABLE"
        )

    _tensorflow_version = (
        tf.__version__
    )

    sys.path.insert(
        0,
        str(
            REPO /
            "inference"
        ),
    )

    try:
        with silence_upstream_stdout():
            from transnetv2 import (
                TransNetV2,
            )

            started = (
                time.perf_counter()
            )

            _model = TransNetV2(
                model_dir=str(
                    WEIGHTS
                ),
            )

            _model_load_seconds = (
                time.perf_counter() -
                started
            )

    except StageFailure:
        raise

    except Exception as exc:
        raise StageFailure(
            "TRANSNET_ANALYSIS_FAILED"
        ) from exc


def validate_request(request):
    if not isinstance(
        request,
        dict,
    ):
        raise StageFailure(
            "INTERCHANGE_INVALID"
        )

    if (
        request.get(
            "protocolVersion"
        ) != PROTOCOL_VERSION or
        request.get(
            "operation"
        ) != "detect"
    ):
        raise StageFailure(
            "INTERCHANGE_INVALID"
        )

    media_path = request.get(
        "mediaPath"
    )

    ffmpeg_path = request.get(
        "ffmpegPath"
    )

    expected = request.get(
        "expectedFrameCount"
    )

    threshold = request.get(
        "threshold"
    )

    if (
        not isinstance(
            media_path,
            str,
        ) or
        not media_path or
        len(media_path) > 4096 or
        not isinstance(
            ffmpeg_path,
            str,
        ) or
        not ffmpeg_path or
        len(ffmpeg_path) > 4096
    ):
        raise StageFailure(
            "INTERCHANGE_INVALID"
        )

    if (
        isinstance(
            expected,
            bool,
        ) or
        not isinstance(
            expected,
            int,
        ) or
        expected < 1 or
        expected > 72000
    ):
        raise StageFailure(
            "INTERCHANGE_INVALID"
        )

    if (
        isinstance(
            threshold,
            bool,
        ) or
        not isinstance(
            threshold,
            (int, float),
        ) or
        not 0 <= float(
            threshold
        ) <= 1
    ):
        raise StageFailure(
            "INTERCHANGE_INVALID"
        )

    return (
        media_path,
        ffmpeg_path,
        expected,
        float(threshold),
    )


def decode_video(
    media_path,
    ffmpeg_path,
    expected_frames,
):
    executable, media = (
        execution_paths(
            ffmpeg_path,
            media_path,
        )
    )

    command = [
        executable,

        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",

        "-threads",
        "1",

        "-i",
        media,

        "-map",
        "0:v:0",

        "-an",
        "-sn",
        "-dn",

        "-vf",
        (
            "scale="
            "48:27:"
            "flags=bilinear,"
            "format=rgb24"
        ),

        "-fps_mode",
        "passthrough",

        "-f",
        "rawvideo",

        "-pix_fmt",
        "rgb24",

        "pipe:1",
    ]

    started = (
        time.perf_counter()
    )

    try:
        result = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300,
            check=False,
        )
    except Exception as exc:
        raise StageFailure(
            "MEDIA_UNREADABLE"
        ) from exc

    elapsed = (
        time.perf_counter() -
        started
    )

    if (
        result.returncode != 0
    ):
        raise StageFailure(
            "MEDIA_UNREADABLE"
        )

    frame_bytes = (
        48 *
        27 *
        3
    )

    payload = result.stdout

    if (
        len(payload) == 0 or
        len(payload) %
        frame_bytes != 0
    ):
        raise StageFailure(
            "FRAME_COUNT_MISMATCH"
        )

    decoded = (
        len(payload) //
        frame_bytes
    )

    if (
        decoded !=
        expected_frames
    ):
        raise StageFailure(
            "FRAME_COUNT_MISMATCH"
        )

    return (
        payload,
        decoded,
        elapsed,
    )


def detect(request):
    (
        media_path,
        ffmpeg_path,
        expected,
        threshold,
    ) = validate_request(
        request
    )

    ensure_model()

    try:
        import numpy as np

        (
            payload,
            decoded,
            decode_seconds,
        ) = decode_video(
            media_path,
            ffmpeg_path,
            expected,
        )

        frames = (
            np.frombuffer(
                payload,
                dtype=np.uint8,
            )
            .reshape(
                (
                    decoded,
                    27,
                    48,
                    3,
                )
            )
        )

        started = (
            time.perf_counter()
        )

        with silence_upstream_stdout():
            (
                single,
                many,
            ) = (
                _model.predict_frames(
                    frames
                )
            )

        inference_seconds = (
            time.perf_counter() -
            started
        )

        single = (
            np.asarray(
                single,
                dtype=np.float32,
            )
            .reshape(-1)
        )

        many = (
            np.asarray(
                many,
                dtype=np.float32,
            )
            .reshape(-1)
        )

        if (
            single.shape !=
            (decoded,) or
            many.shape !=
            (decoded,)
        ):
            raise StageFailure(
                "FRAME_COUNT_MISMATCH"
            )

        if (
            not np.isfinite(
                single
            ).all() or
            not np.isfinite(
                many
            ).all()
        ):
            raise StageFailure(
                "TRANSNET_ANALYSIS_FAILED"
            )

        if (
            float(single.min()) < 0 or
            float(single.max()) > 1 or
            float(many.min()) < 0 or
            float(many.max()) > 1
        ):
            raise StageFailure(
                "TRANSNET_ANALYSIS_FAILED"
            )

        with silence_upstream_stdout():
            scenes = (
                _model
                .predictions_to_scenes(
                    single,
                    threshold=threshold,
                )
            )

        scenes = np.asarray(
            scenes,
            dtype=np.int64,
        )

        if (
            scenes.ndim != 2 or
            scenes.shape[1] != 2 or
            len(scenes) < 1
        ):
            raise StageFailure(
                "TRANSNET_ANALYSIS_FAILED"
            )

        cuts = [
            int(value)
            for value in
            scenes[1:, 0]
        ]

        if (
            len(cuts) > 999 or
            any(
                cut <= 0 or
                cut >= decoded
                for cut in cuts
            ) or
            any(
                right <= left
                for left, right in zip(
                    cuts,
                    cuts[1:],
                )
            )
        ):
            raise StageFailure(
                "TRANSNET_ANALYSIS_FAILED"
            )

        return {
            "protocolVersion":
                PROTOCOL_VERSION,

            "operation":
                "detect",

            "toolVersion":
                ADAPTER_VERSION,

            "model": {
                "provider":
                    "transnetv2",

                "sourceCommit":
                    SOURCE_COMMIT,

                "sourceSha256":
                    _source_sha256,

                "weightSetSha256":
                    _weight_set_sha256,

                "tensorflowVersion":
                    _tensorflow_version,

                "device":
                    "cuda",

                "gpuName":
                    _gpu_name,
            },

            "media": {
                "expectedFrameCount":
                    expected,

                "decodedFrameCount":
                    decoded,
            },

            "config": {
                "threshold":
                    threshold,

                "inputWidth":
                    48,

                "inputHeight":
                    27,

                "pixelFormat":
                    "rgb24",
            },

            "value": {
                "cuts":
                    cuts,

                "sceneCount":
                    len(cuts) + 1,

                "singlePredictionMin":
                    float(
                        single.min()
                    ),

                "singlePredictionMax":
                    float(
                        single.max()
                    ),

                "manyPredictionMin":
                    float(
                        many.min()
                    ),

                "manyPredictionMax":
                    float(
                        many.max()
                    ),
            },

            "performance": {
                "modelLoadSeconds":
                    float(
                        _model_load_seconds
                    ),

                "decodeSeconds":
                    float(
                        decode_seconds
                    ),

                "inferenceSeconds":
                    float(
                        inference_seconds
                    ),
            },
        }

    except StageFailure:
        raise

    except Exception as exc:
        raise StageFailure(
            "TRANSNET_ANALYSIS_FAILED"
        ) from exc


def failure(code):
    return {
        "protocolVersion":
            PROTOCOL_VERSION,

        "error": {
            "stage":
                "detect",

            "code":
                code,

            "diagnostic":
                "Local TransNetV2 detection failed.",
        },
    }


for line in sys.stdin:
    try:
        if (
            len(line) >
            2 * 1024 * 1024
        ):
            raise StageFailure(
                "INTERCHANGE_INVALID"
            )

        request = json.loads(
            line
        )

        response = detect(
            request
        )

    except StageFailure as exc:
        response = failure(
            exc.code
        )

    except Exception:
        response = failure(
            "INTERCHANGE_INVALID"
        )

    sys.stdout.write(
        json.dumps(
            response,
            allow_nan=False,
            separators=(",", ":"),
        ) +
        "\n"
    )

    sys.stdout.flush()
