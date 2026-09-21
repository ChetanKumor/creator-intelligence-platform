import json
import sys

from .worker import (
    dispatch,
    failure,
)


MAX_REQUEST_BYTES = 64 * 1024


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
                "INTERCHANGE_INVALID"
            )

        request = json.loads(
            raw_line
        )

        response = dispatch(
            request
        )

    except Exception as exc:
        code = str(exc)

        if (
            code ==
            "INTERCHANGE_INVALID"
        ):
            code = \
                "SPEECH_ANALYSIS_FAILED"

        response = failure(
            code
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
