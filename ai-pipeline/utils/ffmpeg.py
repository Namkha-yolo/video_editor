"""FFmpeg/FFprobe utility wrappers for the ClipVibe AI pipeline.

Provides two main functions:
  - probe(): extract video metadata (resolution, fps, duration, codec)
  - apply_filters(): build and run FFmpeg color-grading filter chains

Supported filters: colorbalance, eq, colortemperature, curves, vignette, noise.
"""

import json
import logging
import shlex
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

FFPROBE_TIMEOUT = 30  # seconds
FFMPEG_TIMEOUT = 120  # seconds


def probe(file_path: str) -> dict:
    """Run ffprobe on a video file and return normalised metadata.

    Args:
        file_path: Path to the video file.

    Returns:
        A dict with keys: duration (float), width (int), height (int),
        fps (float), codec (str).

    Raises:
        FileNotFoundError: If *file_path* does not exist on disk.
        RuntimeError: If ffprobe is not installed or the file cannot be probed.
    """
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Video file not found: {file_path}")

    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        str(path),
    ]
    logger.debug("Running: %s", shlex.join(cmd))

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=FFPROBE_TIMEOUT,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "ffprobe not found. Please install FFmpeg: https://ffmpeg.org/download.html"
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"ffprobe timed out after {FFPROBE_TIMEOUT}s on {file_path}")

    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise RuntimeError(f"ffprobe failed (exit {result.returncode}): {stderr}")

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to parse ffprobe JSON output: {exc}")

    # Locate the first video stream.
    video_stream: dict | None = None
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            video_stream = stream
            break

    if video_stream is None:
        raise RuntimeError(f"No video stream found in {file_path}")

    # --- fps ---
    fps = _parse_frame_rate(video_stream.get("r_frame_rate", "0/1"))

    # --- duration ---
    duration = _extract_duration(video_stream, data.get("format", {}))

    # --- dimensions ---
    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))

    # --- codec ---
    codec = video_stream.get("codec_name", "unknown")

    metadata = {
        "duration": duration,
        "width": width,
        "height": height,
        "fps": fps,
        "codec": codec,
    }
    logger.info("Probed %s: %s", file_path, metadata)
    return metadata


def apply_filters(input_path: str, output_path: str, filter_string: str) -> bool:
    """Apply an FFmpeg video-filter chain and write the result to *output_path*.

    The audio stream is copied without re-encoding.

    Args:
        input_path:    Path to the source video file.
        output_path:   Path for the filtered output file.
        filter_string: A valid FFmpeg ``-vf`` filter string, e.g.
                       ``"eq=brightness=0.1:saturation=1.3,vignette=PI/4"``.

    Returns:
        True on success, False on failure.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-vf", filter_string,
        "-c:a", "copy",
        output_path,
    ]
    logger.info("Running: %s", shlex.join(cmd))

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT,
        )
    except FileNotFoundError:
        logger.error(
            "ffmpeg not found. Please install FFmpeg: https://ffmpeg.org/download.html"
        )
        return False
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg timed out after %ds on %s", FFMPEG_TIMEOUT, input_path)
        return False

    if result.returncode != 0:
        logger.error("ffmpeg failed (exit %d): %s", result.returncode, result.stderr.strip())
        return False

    logger.info("Filters applied successfully: %s -> %s", input_path, output_path)
    return True


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_frame_rate(rate_str: str) -> float:
    """Parse an ffprobe ``r_frame_rate`` fraction like ``"30/1"`` into a float."""
    try:
        num, den = rate_str.split("/")
        denominator = int(den)
        if denominator == 0:
            return 0.0
        return round(int(num) / denominator, 3)
    except (ValueError, ZeroDivisionError):
        logger.warning("Could not parse frame rate '%s', defaulting to 0.0", rate_str)
        return 0.0


def _extract_duration(video_stream: dict, fmt: dict) -> float:
    """Extract duration in seconds, preferring the stream value then format."""
    raw = video_stream.get("duration")
    if raw is None:
        raw = fmt.get("duration")
    if raw is None:
        # Some containers (e.g. MKV) store duration only in tags.
        tags = video_stream.get("tags", {})
        raw = tags.get("DURATION")  # format: HH:MM:SS.mmm
        if raw and ":" in str(raw):
            return _hms_to_seconds(raw)
    try:
        return round(float(raw), 3)
    except (TypeError, ValueError):
        logger.warning("Could not determine duration, defaulting to 0.0")
        return 0.0


def _hms_to_seconds(hms: str) -> float:
    """Convert ``HH:MM:SS.mmm`` to seconds."""
    parts = hms.split(":")
    try:
        hours = float(parts[0])
        minutes = float(parts[1])
        seconds = float(parts[2])
        return round(hours * 3600 + minutes * 60 + seconds, 3)
    except (IndexError, ValueError):
        return 0.0
