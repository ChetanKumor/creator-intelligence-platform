"""Gate 7 Batch 3D R02-A: the footage metadata producer emits each decoded frame's exact source instant.

The accepted renderer admits a source only when every legacy frameTimes entry is the correctly rounded double of frame i's exact
instant i x den / num (packages/edit-render/program.ts:120-122). JavaScript computes that double with one IEEE division, exactly as
float(Fraction(...)) does here. ffprobe prints *_time fields at microsecond precision, so only the integer best_effort_timestamp and the
stream time_base carry the instant. Each case feeds the producer what the pinned ffprobe prints for one video stream (the integer
timestamps and their six-decimal text): genuine constant-rate timelines must land exactly on the grid, while a perturbed, variable or
legacy-shaped (text-only) timeline still fails.
"""
from fractions import Fraction
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from reference_analyzer.media import StageFailure, metadata

ROOT = Path(__file__).resolve().parents[2]


def exact(i, fps):
    """Frame i's instant on the grid as the correctly rounded double: what the renderer's secondsOf returns."""
    return float(Fraction(i * fps.denominator, fps.numerator))


def first_off_grid(times, fps):
    return next((i for i, t in enumerate(times) if t != exact(i, fps)), None)


def probe(rate, time_base, ticks, legacy=False):
    """The pinned ffprobe's three answers for one H.264 stream: stream entries, decoded frames and the version line."""
    tb, fps = Fraction(time_base), Fraction(rate)
    stream = {"index": 0, "codec_type": "video", "codec_name": "h264", "width": 64, "height": 36, "avg_frame_rate": rate, "r_frame_rate": rate,
              "sample_aspect_ratio": "1:1", "duration": "%.6f" % float((ticks[-1] - ticks[0]) * tb + 1 / fps)}
    frames = [{"best_effort_timestamp_time": "%.6f" % float(t * tb), "duration_time": "%.6f" % float(1 / fps)} for t in ticks]
    if not legacy:
        stream["time_base"] = time_base
        for frame, t in zip(frames, ticks):
            frame["best_effort_timestamp"] = t
    return [json.dumps({"streams": [stream]}).encode(), json.dumps({"frames": frames}).encode(), b"ffprobe version 9.0.1-essentials_build-www.gyan.dev"]


class ExactFrameTimeTests(unittest.TestCase):
    def setUp(self):
        base = ROOT / ".test-artifacts/python"
        base.mkdir(parents=True, exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=base)
        self.media = Path(self.directory.name) / "exact-time.mp4"
        self.media.write_bytes(b"Generated metadata fixture; no real footage required.")

    def tearDown(self):
        self.directory.cleanup()

    def produce(self, outputs):
        with patch("reference_analyzer.media.tool", side_effect=outputs):
            return metadata({"mediaPath": str(self.media), "ffprobePath": "explicit-test-ffprobe"})["value"]

    def assert_exact_cfr(self, rate, cases, count):
        fps = Fraction(rate)
        for time_base, step in cases:
            with self.subTest(rate=rate, time_base=time_base):
                value = self.produce(probe(rate, time_base, [i * step for i in range(count)]))
                self.assertEqual(Fraction(value["fps"]["numerator"], value["fps"]["denominator"]), fps)
                self.assertEqual(value["frameCount"], count)
                self.assertFalse(value["variableFrameRate"])
                off = first_off_grid(value["frameTimes"], fps)
                self.assertIsNone(off, "frame %s at %r s is not exactly frame %s on the %s grid" % (off, None if off is None else value["frameTimes"][off], off, rate))

    def test_true_30fps_cfr_lands_exactly_on_the_frame_grid(self):
        self.assert_exact_cfr("30/1", [("1/90000", 3000), ("1/15360", 512)], 91)

    def test_true_60fps_cfr_lands_exactly_on_the_frame_grid(self):
        self.assert_exact_cfr("60/1", [("1/90000", 1500), ("1/15360", 256)], 181)

    def test_true_30000_1001_cfr_lands_exactly_on_the_frame_grid(self):
        self.assert_exact_cfr("30000/1001", [("1/30000", 1001), ("1/90000", 3003)], 91)

    def test_25fps_control_stays_exactly_on_the_frame_grid(self):
        self.assert_exact_cfr("25/1", [("1/12800", 512), ("1/90000", 3600)], 76)

    def test_50fps_control_stays_exactly_on_the_frame_grid(self):
        self.assert_exact_cfr("50/1", [("1/12800", 256), ("1/90000", 1800)], 151)

    def test_one_perturbed_timestamp_leaves_the_grid_at_exactly_that_frame(self):
        fps, ticks = Fraction(30), [i * 3000 for i in range(91)]
        ticks[7] += 1  # One 1/90000 s tick: inside the producer's 1 ms variable-rate tolerance, yet not frame 7's instant.
        value = self.produce(probe("30/1", "1/90000", ticks))
        self.assertFalse(value["variableFrameRate"], "the variable-rate tolerance is unchanged; the exact grid is what refuses this frame")
        self.assertEqual(first_off_grid(value["frameTimes"], fps), 7)
        self.assertEqual(value["frameTimes"][7], float(Fraction(21001, 90000)))
        self.assertTrue(all(t == exact(i, fps) for i, t in enumerate(value["frameTimes"]) if i != 7))

    def test_variable_frame_rate_stays_variable_and_off_the_grid(self):
        fps, ticks = Fraction(30), [0]
        for i in range(1, 91):
            ticks.append(ticks[-1] + (4000 if i % 2 else 2000))
        value = self.produce(probe("30/1", "1/90000", ticks))
        self.assertTrue(value["variableFrameRate"])
        self.assertEqual(first_off_grid(value["frameTimes"], fps), 1)
        self.assertEqual(value["frameTimes"][1], float(Fraction(4000, 90000)))

    def test_text_only_timestamps_fail_closed_instead_of_being_reinterpreted(self):
        with self.assertRaises(StageFailure) as failure:
            self.produce(probe("30/1", "1/90000", [i * 3000 for i in range(91)], legacy=True))
        self.assertEqual((failure.exception.stage, failure.exception.code), ("metadata", "MEDIA_UNREADABLE"))


if __name__ == "__main__":
    unittest.main()
