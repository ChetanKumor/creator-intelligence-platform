import json
import math
import re
from fractions import Fraction
from pathlib import Path
import subprocess
import tempfile

import cv2
import numpy as np
import scenedetect
from scenedetect import SceneManager, open_video
from scenedetect.detectors import ContentDetector, AdaptiveDetector

FORMATS = "mov,matroska,webm,avi"


class StageFailure(Exception):
    def __init__(self, stage, code, diagnostic):
        super().__init__(diagnostic)
        self.stage, self.code, self.diagnostic = stage, code, diagnostic


def tool(arguments, stage, timeout=120):
    try:
        result = subprocess.run(arguments, stdin=subprocess.DEVNULL, capture_output=True,
                                timeout=timeout, shell=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise StageFailure(stage, {"metadata": "METADATA_EXTRACTION_FAILED", "sample": "FRAME_EXTRACTION_FAILED"}[stage],
                           "Media tool unavailable or timed out.") from exc
    if result.returncode != 0 or len(result.stdout) > 32 * 1024 * 1024:
        raise StageFailure(stage, {"metadata": "METADATA_EXTRACTION_FAILED", "sample": "FRAME_EXTRACTION_FAILED"}[stage], "Media tool rejected input or exceeded output limit.")
    return result.stdout


def allowed_media(filename):
    if filename.startswith(("\\\\", "//")):
        raise StageFailure("metadata", "MEDIA_UNREADABLE", "Network media paths are not supported.")
    path = Path(filename)
    if not path.is_absolute() or not path.is_file() or path.is_symlink():
        raise StageFailure("metadata", "MEDIA_UNREADABLE", "An explicitly supplied regular local file is required.")
    if path.suffix.lower() not in {".mp4", ".mov", ".mkv", ".webm", ".avi"}:
        raise StageFailure("metadata", "MEDIA_UNSUPPORTED", "Unsupported media container extension.")
    return str(path)


def metadata(request):
    media = allowed_media(request["mediaPath"])
    base = [request["ffprobePath"], "-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", FORMATS]
    data = json.loads(tool(base + ["-show_entries", "stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_aspect_ratio,duration:stream_tags=rotate:stream_side_data=rotation:format=duration", "-of", "json", media], "metadata"))
    video = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), None)
    if video is None:
        raise StageFailure("metadata", "MEDIA_UNSUPPORTED", "No video stream exists.")
    duration_hint = float(video.get("duration", data.get("format", {}).get("duration", "nan")))
    fps_source = "avg_frame_rate"
    fps = Fraction(video.get(fps_source, "0/1"))
    if fps <= 0:
        fps_source = "r_frame_rate"
        fps = Fraction(video.get(fps_source, "0/1"))
    width, height = int(video["width"]), int(video["height"])
    if not math.isfinite(duration_hint) or not 0 < duration_hint <= 600.1 or not 1 <= float(fps) <= 120 or max(width, height) > 16384 or width * height > 40_000_000:
        raise StageFailure("metadata", "MEDIA_UNSUPPORTED", "Video exceeds duration, frame-rate or resolution limits.")
    frames_data = json.loads(tool(base + ["-select_streams", "v:0", "-read_intervals", "%+601", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time,duration_time,pkt_duration_time", "-of", "json", media], "metadata"))
    frames = frames_data.get("frames", [])
    if not 1 <= len(frames) <= 72000:
        raise StageFailure("metadata", "MEDIA_UNREADABLE", "No usable decoded frame timeline.")
    pts = [float(frame["best_effort_timestamp_time"]) for frame in frames]
    times = [round(value - pts[0], 9) for value in pts]
    tail_duration = float(frames[-1].get("duration_time", frames[-1].get("pkt_duration_time", 1 / float(fps))))
    if tail_duration <= 0:
        tail_duration = 1 / float(fps)
    duration = round(times[-1] + tail_duration, 9)
    # Prefer exact stream duration when it agrees with the decoded final frame.
    if times[-1] < duration_hint <= duration + 1 / float(fps):
        duration = duration_hint
    rotation = float(next((side["rotation"] for side in video.get("side_data_list", []) if "rotation" in side), video.get("tags", {}).get("rotate", 0))) % 360
    if rotation not in (0, 90, 180, 270):
        raise StageFailure("metadata", "MEDIA_UNSUPPORTED", "Non-right-angle rotation is unsupported.")
    sar = video.get("sample_aspect_ratio", "1:1")
    sample_aspect = Fraction(sar.replace(":", "/")) if sar not in ("N/A", "0:1") else Fraction(1)
    if not Fraction(1, 16) <= sample_aspect <= 16:
        raise StageFailure("metadata", "MEDIA_UNSUPPORTED", "Unsupported sample aspect ratio.")
    display_width, display_height = round(width * sample_aspect), height
    ratio = Fraction(width, height) * sample_aspect
    if rotation in (90, 270):
        display_width, display_height, ratio = display_height, display_width, 1 / ratio
    output_fps, approximation = fps, {}
    if fps.numerator > 120000 or fps.denominator > 1001:
        # Preserve the frozen FrameRate bounds without losing the exact source
        # rate. Timing and VFR detection continue to use original PTS/rate.
        # A denominator <= 1000 also bounds the numerator <= 120000 at 120 fps.
        output_fps = fps.limit_denominator(1000)
        approximation = {"frameRateApproximation": {"policy": "bounded-rational-v1", "sourceField": fps_source,
                         "sourceFrameRate": str(fps.numerator) + "/" + str(fps.denominator),
                         "absoluteErrorFramesPerSecond": float(abs(fps - output_fps))}}
    version = tool([request["ffprobePath"], "-version"], "metadata").decode("utf8").splitlines()[0].split()[2]
    return {"value": {"durationSeconds": duration, "width": display_width, "height": display_height,
            "codedWidth": width, "codedHeight": height, "fps": {"numerator": output_fps.numerator, "denominator": output_fps.denominator},
            "frameCount": len(frames), "frameTimes": times, "codec": video["codec_name"], "rotation": int(rotation),
            "aspectRatio": {"width": ratio.numerator, "height": ratio.denominator},
            "hasAudio": any(stream.get("codec_type") == "audio" for stream in data.get("streams", [])),
            "variableFrameRate": any(abs((b-a) - 1 / float(fps)) > 0.001 for a, b in zip(times, times[1:])), **approximation}, "toolVersion": version}


def detect(request):
    video = open_video(allowed_media(request["mediaPath"]), backend="opencv")
    manager = SceneManager()
    config = request["config"]
    detector = ContentDetector(threshold=config["threshold"], min_scene_len=config["minSceneFrames"]) if config["kind"] == "content" else AdaptiveDetector(adaptive_threshold=config["adaptiveThreshold"], min_content_val=config["threshold"], min_scene_len=config["minSceneFrames"])
    manager.add_detector(detector)
    try:
        decoded = manager.detect_scenes(video, show_progress=False)
        if decoded != request["frameCount"]:
            raise StageFailure("detect", "SHOT_DETECTION_FAILED", "Detector and ffprobe disagree about decoded frame count.")
        scenes = manager.get_scene_list(start_in_scene=True)
        return {"value": [scene[0].get_frames() for scene in scenes[1:]], "toolVersion": scenedetect.__version__}
    finally:
        capture = getattr(video, "_cap", None)
        if capture is not None:
            capture.release()


def frame_selection_expression(indices):
    # FFmpeg's expression parser rejects a long left-associated sum, even when
    # the command is below Windows' length limit. Keep expression depth O(log n).
    if len(indices) == 1:
        return "eq(n\\,%d)" % indices[0]
    middle = len(indices) // 2
    return "(" + frame_selection_expression(indices[:middle]) + "+" + frame_selection_expression(indices[middle:]) + ")"


def sample(request):
    media = allowed_media(request["mediaPath"])
    root = Path(request["frameRoot"]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    samples = request["samples"]
    if any(not re.fullmatch(r"sample_[a-f0-9]{64}", item["sampleId"]) for item in samples):
        raise StageFailure("sample", "FRAME_EXTRACTION_FAILED", "Invalid frame artifact identity.")
    if len({item["frameIndex"] for item in samples}) != len(samples):
        raise StageFailure("sample", "FRAME_EXTRACTION_FAILED", "Duplicate frame indices are not supported.")
    samples = sorted(samples, key=lambda item: item["frameIndex"])
    # Batches keep argument length below Windows limits. Each batch decodes at most once.
    for offset in range(0, len(samples), 500):
        batch = samples[offset:offset + 500]
        select = frame_selection_expression([item["frameIndex"] for item in batch])
        filters = "select=" + select + ",scale=trunc(iw*sar/2)*2:ih,setsar=1,scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2"
        with tempfile.TemporaryDirectory(prefix="extract-", dir=root) as temporary:
            pattern = str(Path(temporary) / "%06d.png")
            tool([request["ffmpegPath"], "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-format_whitelist", FORMATS,
                  "-threads", "1", "-i", media, "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", filters, "-fps_mode", "passthrough", "-frames:v", str(len(batch)), "-threads", "1", pattern], "sample")
            for index, item in enumerate(batch, 1):
                source = Path(temporary) / ("%06d.png" % index)
                if not source.is_file():
                    raise StageFailure("sample", "FRAME_EXTRACTION_FAILED", "Requested representative frame could not be decoded.")
                source.replace(root / (item["sampleId"] + ".png"))
    measurements, previous = [], {}
    for item in samples:
        image = cv2.imread(str(root / (item["sampleId"] + ".png")))
        if image is None:
            raise StageFailure("sample", "FRAME_EXTRACTION_FAILED", "Extracted frame is unreadable.")
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        earlier = previous.get(item["shotId"])
        difference, flow, comparison, interval = None, None, None, None
        if earlier is not None:
            prior_gray, prior_item = earlier
            prior_gray = cv2.resize(prior_gray, (gray.shape[1], gray.shape[0]))
            difference = float(np.abs(gray.astype(np.float32) - prior_gray.astype(np.float32)).mean() / 255)
            field = cv2.calcOpticalFlowFarneback(prior_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            flow = float(np.linalg.norm(field, axis=2).mean())
            comparison, interval = prior_item["sampleId"], item["atSeconds"] - prior_item["atSeconds"]
        measurements.append({"sampleId": item["sampleId"], "brightnessMean": float(gray.mean() / 255), "darkPixelFraction": float((gray < 5).mean()),
                             "brightPixelFraction": float((gray > 250).mean()), "laplacianVariance": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
                             "comparisonSampleId": comparison, "comparisonIntervalSeconds": interval, "frameDifferenceMean": difference, "opticalFlowMeanPixels": flow})
        previous[item["shotId"]] = (gray, item)
    return {"value": measurements, "toolVersion": "opencv-" + cv2.__version__ + "+ffmpeg-9.0.1"}
