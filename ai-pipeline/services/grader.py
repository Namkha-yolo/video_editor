"""Color-grading service for the ClipVibe AI pipeline.

Takes a video file and an FFmpeg filter string, applies the filters,
and returns the path to the graded output file.
"""

import logging
import tempfile
from pathlib import Path

from utils.ffmpeg import apply_filters, compute_ffmpeg_timeout, validate_video

logger = logging.getLogger(__name__)


class GradingError(Exception):
    """Raised when FFmpeg grading fails or produces invalid output."""


def grade_clip(file_path: str, filter_string: str) -> str:
    """Apply colour-grading filters to a video clip.

    Args:
        file_path:     Path to the source video file.
        filter_string: A valid FFmpeg ``-vf`` filter string, e.g.
                       ``"eq=brightness=0.1:saturation=1.3"``.

    Returns:
        Path to the graded output file.  The caller owns this file and is
        responsible for cleanup.

    Raises:
        FileNotFoundError: If *file_path* does not exist on disk.
        ValueError:        If *filter_string* is empty or whitespace-only.
        GradingError:      If FFmpeg fails or the output is missing/empty.
    """
    # --- validate inputs ---
    if not filter_string or not filter_string.strip():
        raise ValueError("filter_string must not be empty")

    # Validate file integrity, format, and duration
    metadata = validate_video(file_path)
    timeout = compute_ffmpeg_timeout(metadata["duration"])

    # --- create output temp file ---
    tmp = tempfile.NamedTemporaryFile(
        suffix="_graded.mp4", delete=False, prefix="clipvibe_"
    )
    output_path = tmp.name
    tmp.close()

    # --- apply filters ---
    logger.info(
        "Grading %s (%.1fs video, timeout=%ds) with filters: %s",
        file_path, metadata["duration"], timeout, filter_string,
    )
    success = apply_filters(file_path, output_path, filter_string, timeout=timeout)

    if not success:
        Path(output_path).unlink(missing_ok=True)
        raise GradingError(
            f"FFmpeg failed to apply filters to {file_path}"
        )

    # --- validate output ---
    out = Path(output_path)
    if not out.is_file() or out.stat().st_size == 0:
        out.unlink(missing_ok=True)
        raise GradingError(
            "Grading produced missing or zero-byte output"
        )

    logger.info("Graded clip written to %s", output_path)
    return output_path
