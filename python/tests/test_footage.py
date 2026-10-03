"""Footage reuses the real OpenCV measurement/interchange and guarded local worker."""
import json
from pathlib import Path
import tempfile
import unittest
from fractions import Fraction
from unittest.mock import patch

import cv2
import jsonschema
import numpy as np
from reference_analyzer.media import StageFailure, sample, metadata
from reference_analyzer.capacity import capacity_report, guarded_footage_inference, RESERVE_BYTES, SO400M_OBSERVED_PEAK_COMMIT_BYTES

ROOT = Path(__file__).resolve().parents[2]


class FootagePrimitivesTests(unittest.TestCase):
    def test_large_vfr_rationals_preserve_exact_rate_and_pts_without_changing_public_fps_bounds(self):
        base = ROOT / ".test-artifacts/python"
        base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as directory:
            media = Path(directory) / "synthetic-vfr.mp4"
            media.write_bytes(b"Generated metadata fixture; no real footage required.")
            times = [0, 0.016667, 0.035, 0.051667]
            for rate in ["813600000/13567271", "36000000/601049", "30000/1001"]:
                stream = {"codec_type": "video", "codec_name": "h264", "duration": "0.070000", "avg_frame_rate": rate, "r_frame_rate": "60/1", "width": 1440, "height": 2558, "sample_aspect_ratio": "1:1", "time_base": "1/1000000"}
                frames = [{"best_effort_timestamp": round(t * 1_000_000), "best_effort_timestamp_time": str(t), "duration_time": "0.018333"} for t in times]
                responses = [json.dumps({"streams": [stream]}).encode(), json.dumps({"frames": frames}).encode(), b"ffprobe version 9.0.1 test"]
                with patch("reference_analyzer.media.tool", side_effect=responses):
                    response = metadata({"mediaPath": str(media), "ffprobePath": "explicit-test-ffprobe"})
                value = response["value"]
                self.assertEqual(value["frameTimes"], times)
                self.assertEqual(value["frameCount"], 4)
                self.assertTrue(value["variableFrameRate"])
                self.assertLessEqual(value["fps"]["numerator"], 120000)
                self.assertLessEqual(value["fps"]["denominator"], 1001)
                if rate == "30000/1001":
                    self.assertEqual(value["fps"], {"numerator": 30000, "denominator": 1001})
                    self.assertNotIn("frameRateApproximation", value)
                else:
                    provenance = value["frameRateApproximation"]
                    self.assertEqual(Fraction(provenance["sourceFrameRate"]), Fraction(rate))
                    self.assertEqual(provenance["sourceField"], "avg_frame_rate")
                    error = abs(Fraction(rate) - Fraction(value["fps"]["numerator"], value["fps"]["denominator"]))
                    self.assertAlmostEqual(provenance["absoluteErrorFramesPerSecond"], float(error))
                    self.assertLess(float(error), 0.001)
                schema = json.loads((ROOT / "schemas/interchange/WorkerResponse.schema.json").read_text(encoding="utf8"))
                jsonschema.Draft202012Validator(schema).validate({"protocolVersion": "1.0.0", "operation": "metadata", **response})

    def test_exposure_blur_and_motion_are_measured_once_with_temporal_lineage(self):
        base = ROOT / ".test-artifacts/python"
        base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as directory:
            path = Path(directory)
            media = path / "synthetic.mp4"
            media.write_bytes(b"Synthetic test extraction supplied below; OpenCV measurements remain real.")
            rng = np.random.default_rng(7)
            sharp = rng.integers(0, 256, (64, 64, 3), dtype=np.uint8)
            blurred = cv2.GaussianBlur(sharp, (15, 15), 5)
            images = [np.zeros_like(sharp), sharp, blurred, np.roll(sharp, 5, axis=1), sharp]
            samples = [{"sampleId": "sample_" + format(i, "064x"), "shotId": "shot_a" if i < 4 else "shot_b", "frameIndex": i, "atSeconds": i * 0.25} for i in range(5)]

            def extract(arguments, stage):
                self.assertEqual(stage, "sample")
                self.assertIsInstance(arguments, list)
                for i, pixels in enumerate(images, 1):
                    self.assertTrue(cv2.imwrite(arguments[-1] % i, pixels))
                return b""

            with patch("reference_analyzer.media.tool", side_effect=extract) as calls:
                response = sample({"mediaPath": str(media), "frameRoot": str(path / "frames"), "ffmpegPath": "explicit-test-ffmpeg", "samples": samples})
            self.assertEqual(calls.call_count, 1)
            values = response["value"]
            self.assertEqual(values[0]["darkPixelFraction"], 1)
            self.assertGreater(values[1]["laplacianVariance"], values[2]["laplacianVariance"] * 10)
            self.assertGreater(values[3]["frameDifferenceMean"], 0)
            self.assertGreater(values[3]["opticalFlowMeanPixels"], 0)
            self.assertEqual(values[3]["comparisonSampleId"], samples[2]["sampleId"])
            self.assertEqual(values[3]["comparisonIntervalSeconds"], 0.25)
            self.assertIsNone(values[4]["comparisonSampleId"])
            schema = json.loads((ROOT / "schemas/interchange/WorkerResponse.schema.json").read_text(encoding="utf8"))
            jsonschema.Draft202012Validator(schema).validate({"protocolVersion": "1.0.0", "operation": "sample", **response})

    def test_capacity_policy_uses_observed_peak_plus_the_existing_guard_reserve(self):
        threshold = SO400M_OBSERVED_PEAK_COMMIT_BYTES + RESERVE_BYTES
        self.assertFalse(capacity_report({"availableCommitBytes": threshold - 1, "availablePhysicalBytes": 8 * RESERVE_BYTES})["safeToLoad"])
        self.assertTrue(capacity_report({"availableCommitBytes": threshold, "availablePhysicalBytes": 3 * RESERVE_BYTES})["safeToLoad"])
        self.assertEqual(capacity_report({"availableCommitBytes": threshold, "availablePhysicalBytes": 3 * RESERVE_BYTES})["runtimeGuardReserveBytes"], 1024**3)

    def test_unsafe_capacity_prevents_entering_inference_without_loading_any_model(self):
        entered = False
        low = {"availableCommitBytes": 5 * RESERVE_BYTES, "availablePhysicalBytes": 7 * RESERVE_BYTES}
        with patch("reference_analyzer.capacity.memory", return_value=low), patch("reference_analyzer.capacity.persist_report") as persist:
            with self.assertRaises(StageFailure) as error:
                with guarded_footage_inference(True):
                    entered = True
            self.assertEqual(error.exception.code, "EMBEDDING_ENVIRONMENT_CAPACITY")
            self.assertFalse(entered)
            self.assertEqual(persist.call_args.args[0]["status"], "pending_environment_capacity")

    def test_loaded_model_still_obeys_runtime_reserve(self):
        low = {"availableCommitBytes": RESERVE_BYTES - 1, "availablePhysicalBytes": 7 * RESERVE_BYTES}
        with patch("reference_analyzer.capacity.memory", return_value=low), patch("reference_analyzer.capacity.persist_report"):
            with self.assertRaises(StageFailure):
                with guarded_footage_inference(False):
                    self.fail("Unsafe inference must not start.")
