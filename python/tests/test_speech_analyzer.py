import tempfile
from pathlib import Path
import unittest

from speech_analyzer.worker import (
    MODEL_SET_SHA256,
    dispatch,
    failure,
    model_set_digest,
    verify_model_directory,
)


class SpeechAnalyzerTests(
    unittest.TestCase
):
    def test_model_set_digest_is_frozen(
        self,
    ):
        hashes = {
            "config.json":
                "b55496ac7940a7ae47d2c01eab40edfd8701feec1229d9cce3b40014383fb828",

            "model.bin":
                "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671",

            "tokenizer.json":
                "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab",

            "vocabulary.txt":
                "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913",
        }

        self.assertEqual(
            model_set_digest(
                hashes
            ),
            MODEL_SET_SHA256,
        )

    def test_missing_model_fails_closed(
        self,
    ):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(
                RuntimeError,
                "^MODEL_UNREADABLE$",
            ):
                verify_model_directory(
                    Path(root)
                )

    def test_unknown_failure_is_sanitized(
        self,
    ):
        value = failure(
            "/secret/path/internal"
        )

        self.assertEqual(
            value["error"]["code"],
            "SPEECH_ANALYSIS_FAILED",
        )

        self.assertEqual(
            value["error"]["diagnostic"],
            "Local speech analysis failed.",
        )

    def test_invalid_request_fails_before_runtime(
        self,
    ):
        with self.assertRaisesRegex(
            RuntimeError,
            "^INTERCHANGE_INVALID$",
        ):
            dispatch({
                "protocolVersion":
                    "wrong",
            })


if __name__ == "__main__":
    unittest.main()
