import ctypes
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import re
import time


PROTOCOL_VERSION = "1.0.0"
ADAPTER_VERSION = \
    "faster-whisper-adapter-0.1.0"

MODEL_REPOSITORY = \
    "Systran/faster-whisper-small"

MODEL_REVISION = \
    "536b0662742c02347bc0e980a01041f333bce120"

MODEL_FILE_HASHES = {
    "config.json":
        "b55496ac7940a7ae47d2c01eab40edfd8701feec1229d9cce3b40014383fb828",

    "model.bin":
        "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671",

    "tokenizer.json":
        "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab",

    "vocabulary.txt":
        "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913",
}

MODEL_SET_SHA256 = \
    "1327706b2cad006266912ab307bcf5903f768c066af00dbc7c7b434cb2664d3b"

LANGUAGE_PATTERN = re.compile(
    r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
)


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


def model_set_digest(
    hashes: dict[str, str],
) -> str:
    payload = "".join(
        f"{name}:{hashes[name]}\n"
        for name in sorted(hashes)
    )

    return hashlib.sha256(
        payload.encode("utf-8")
    ).hexdigest()


def verify_model_directory(
    directory: Path,
) -> dict[str, str]:
    if not directory.is_dir():
        raise RuntimeError(
            "MODEL_UNREADABLE"
        )

    actual: dict[str, str] = {}

    for name, expected in \
            MODEL_FILE_HASHES.items():
        path = directory / name

        if not path.is_file():
            raise RuntimeError(
                "MODEL_UNREADABLE"
            )

        value = sha256_file(path)

        if value != expected:
            raise RuntimeError(
                "MODEL_IDENTITY_MISMATCH"
            )

        actual[name] = value

    if (
        model_set_digest(actual) !=
        MODEL_SET_SHA256
    ):
        raise RuntimeError(
            "MODEL_IDENTITY_MISMATCH"
        )

    return actual


def inspect_media(
    path: Path,
) -> dict[str, object]:
    if not path.is_file():
        raise RuntimeError(
            "MEDIA_UNREADABLE"
        )

    try:
        import av

        with av.open(str(path)) as container:
            audio_streams = [
                stream
                for stream in container.streams
                if stream.type == "audio"
            ]

            if not audio_streams:
                raise RuntimeError(
                    "NO_SPEECH"
                )

            duration = None

            if (
                container.duration is not None
                and container.duration > 0
            ):
                duration = (
                    float(container.duration) /
                    float(av.time_base)
                )

            if duration is None:
                candidates = []

                for stream in audio_streams:
                    if (
                        stream.duration is not None
                        and stream.time_base
                        is not None
                    ):
                        candidates.append(
                            float(
                                stream.duration *
                                stream.time_base
                            )
                        )

                if candidates:
                    duration = max(
                        candidates
                    )

    except RuntimeError:
        raise

    except Exception:
        raise RuntimeError(
            "MEDIA_UNREADABLE"
        ) from None

    if (
        duration is None or
        not math.isfinite(duration) or
        duration <= 0
    ):
        raise RuntimeError(
            "MEDIA_UNREADABLE"
        )

    return {
        "sha256":
            sha256_file(path),

        "durationSeconds":
            float(duration),
    }


def verify_cuda_runtime() -> None:
    try:
        ctypes.CDLL(
            "libcublas.so.12"
        )
        ctypes.CDLL(
            "libcudnn.so.9"
        )

    except OSError:
        raise RuntimeError(
            "CUDA_RUNTIME_UNAVAILABLE"
        ) from None

    try:
        import ctranslate2

        if (
            ctranslate2
            .get_cuda_device_count()
            < 1
        ):
            raise RuntimeError(
                "CUDA_UNAVAILABLE"
            )

    except RuntimeError:
        raise

    except Exception:
        raise RuntimeError(
            "CUDA_RUNTIME_UNAVAILABLE"
        ) from None


def validate_language(
    value,
):
    if value is None:
        return None

    if (
        not isinstance(value, str) or
        LANGUAGE_PATTERN.fullmatch(
            value
        ) is None
    ):
        raise RuntimeError(
            "SEGMENTS_INVALID"
        )

    return value


class SpeechRuntime:
    def __init__(self):
        self.model = None
        self.model_key = None

    def get_model(
        self,
        model_directory: Path,
        device: str,
        compute_type: str,
    ):
        verify_model_directory(
            model_directory
        )

        key = (
            str(
                model_directory.resolve()
            ),
            device,
            compute_type,
        )

        if (
            self.model is not None and
            self.model_key == key
        ):
            return self.model, 0.0

        if device == "cuda":
            verify_cuda_runtime()

        try:
            from faster_whisper import \
                WhisperModel

            started = \
                time.perf_counter()

            model = WhisperModel(
                str(model_directory),
                device=device,
                compute_type=compute_type,
                cpu_threads=4,
                local_files_only=True,
            )

            elapsed = (
                time.perf_counter() -
                started
            )

        except RuntimeError:
            raise

        except Exception:
            raise RuntimeError(
                "SPEECH_ANALYSIS_FAILED"
            ) from None

        self.model = model
        self.model_key = key

        return model, elapsed

    def analyze(
        self,
        request,
    ):
        media_path = Path(
            request["mediaPath"]
        ).resolve()

        model_directory = Path(
            request["modelDirectory"]
        ).resolve()

        device = request["device"]
        compute_type = \
            request["computeType"]

        requested_language = \
            request["language"]

        media = inspect_media(
            media_path
        )

        model, model_load_seconds = \
            self.get_model(
                model_directory,
                device,
                compute_type,
            )

        started = \
            time.perf_counter()

        try:
            segments_iter, info = \
                model.transcribe(
                    str(media_path),

                    beam_size=1,

                    temperature=0.0,

                    condition_on_previous_text=False,

                    vad_filter=False,

                    word_timestamps=False,

                    language=
                        requested_language,
                )

            raw_segments = list(
                segments_iter
            )

        except Exception:
            raise RuntimeError(
                "SPEECH_ANALYSIS_FAILED"
            ) from None

        inference_seconds = (
            time.perf_counter() -
            started
        )

        if inference_seconds <= 0:
            raise RuntimeError(
                "SPEECH_ANALYSIS_FAILED"
            )

        duration = float(
            media["durationSeconds"]
        )

        regions = []
        previous_end = 0.0

        for raw in raw_segments:
            text = str(
                raw.text
            ).strip()

            if not text:
                continue

            start = float(
                raw.start
            )
            end = float(
                raw.end
            )

            if (
                not math.isfinite(start) or
                not math.isfinite(end) or
                start < 0 or
                end <= start or
                end > duration + 1e-6 or
                (
                    regions and
                    start <
                    previous_end - 1e-6
                )
            ):
                raise RuntimeError(
                    "SEGMENTS_INVALID"
                )

            regions.append({
                "startSeconds":
                    start,

                "endSeconds":
                    end,

                "text":
                    text,

                # Do not misrepresent average
                # log probability as calibrated
                # confidence.
                "confidence":
                    None,
            })

            previous_end = end

        if not regions:
            raise RuntimeError(
                "NO_SPEECH"
            )

        language = \
            validate_language(
                getattr(
                    info,
                    "language",
                    None,
                )
            )

        if (
            language is None and
            requested_language is not None
        ):
            language = \
                validate_language(
                    requested_language
                )

        probability = getattr(
            info,
            "language_probability",
            None,
        )

        if probability is not None:
            probability = float(
                probability
            )

            if (
                not math.isfinite(
                    probability
                ) or
                probability < 0 or
                probability > 1
            ):
                raise RuntimeError(
                    "SEGMENTS_INVALID"
                )

        package_version = \
            importlib.metadata.version(
                "faster-whisper"
            )

        ctranslate2_version = \
            importlib.metadata.version(
                "ctranslate2"
            )

        return {
            "protocolVersion":
                PROTOCOL_VERSION,

            "operation":
                "transcribe",

            "toolVersion":
                ADAPTER_VERSION,

            "model": {
                "provider":
                    "faster-whisper",

                "packageVersion":
                    package_version,

                "ctranslate2Version":
                    ctranslate2_version,

                "repository":
                    MODEL_REPOSITORY,

                "revision":
                    MODEL_REVISION,

                "modelBinSha256":
                    MODEL_FILE_HASHES[
                        "model.bin"
                    ],

                "modelSetSha256":
                    MODEL_SET_SHA256,

                "device":
                    device,

                "computeType":
                    compute_type,
            },

            "media":
                media,

            "value": {
                "language":
                    language,

                "languageProbability":
                    probability,

                "regions":
                    regions,
            },

            "performance": {
                "modelLoadSeconds":
                    model_load_seconds,

                "inferenceSeconds":
                    inference_seconds,

                "realtimeFactor":
                    (
                        duration /
                        inference_seconds
                        if inference_seconds > 0
                        else None
                    ),
            },
        }


runtime = SpeechRuntime()


def failure(
    code: str,
):
    allowed = {
        "MEDIA_UNREADABLE",
        "MODEL_UNREADABLE",
        "MODEL_IDENTITY_MISMATCH",
        "CUDA_UNAVAILABLE",
        "CUDA_RUNTIME_UNAVAILABLE",
        "NO_SPEECH",
        "SEGMENTS_INVALID",
    }

    if code not in allowed:
        code = \
            "SPEECH_ANALYSIS_FAILED"

    return {
        "protocolVersion":
            PROTOCOL_VERSION,

        "error": {
            "stage":
                "speech",

            "code":
                code,

            "diagnostic":
                "Local speech analysis failed.",
        },
    }


def dispatch(
    request,
):
    if not isinstance(
        request,
        dict,
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    if (
        request.get(
            "protocolVersion"
        ) !=
        PROTOCOL_VERSION
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    if (
        request.get(
            "operation"
        ) !=
        "transcribe"
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    if not isinstance(
        request.get(
            "mediaPath"
        ),
        str,
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    if not isinstance(
        request.get(
            "modelDirectory"
        ),
        str,
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    if request.get(
        "device"
    ) not in (
        "cpu",
        "cuda",
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    if request.get(
        "computeType"
    ) not in (
        "float16",
        "float32",
        "int8",
        "int8_float16",
        "int8_float32",
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    language = request.get(
        "language"
    )

    if (
        language is not None and
        (
            not isinstance(
                language,
                str,
            ) or
            LANGUAGE_PATTERN.fullmatch(
                language
            ) is None
        )
    ):
        raise RuntimeError(
            "INTERCHANGE_INVALID"
        )

    return runtime.analyze(
        request
    )
