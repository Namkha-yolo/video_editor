from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

from utils.ffmpeg import apply_filters, compute_ffmpeg_timeout, validate_video

from .mood_grades import MoodRuntime, get_mood

logger = logging.getLogger(__name__)

LUT_DIR = Path(__file__).resolve().parent.parent / "luts"


class GradingError(Exception):
    pass


@dataclass(frozen=True)
class ExposureAdjustment:
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0


def _vignette_denominator(strength: float) -> int:
    n = round(8 - strength * 4)
    return max(4, min(8, n))


def _is_default_exposure(exposure: ExposureAdjustment) -> bool:
    return (
        abs(exposure.brightness) < 1e-3
        and abs(exposure.contrast - 1.0) < 1e-3
        and abs(exposure.saturation - 1.0) < 1e-3
    )


def build_filter_chain(mood: MoodRuntime, exposure: ExposureAdjustment) -> str:
    parts: list[str] = []

    if not _is_default_exposure(exposure):
        parts.append(
            f"eq=brightness={exposure.brightness:.3f}"
            f":contrast={exposure.contrast:.3f}"
            f":saturation={exposure.saturation:.3f}"
        )

    lut_path = LUT_DIR / mood.lut_filename
    if not lut_path.is_file():
        raise GradingError(f"LUT file not found: {lut_path}")

    # ':' is a separator inside FFmpeg filter args, escape it so absolute paths work.
    safe_path = str(lut_path).replace("\\", "/").replace(":", "\\:")
    parts.append(f"lut3d=file={safe_path}")

    if mood.vignette > 0:
        parts.append(f"vignette=PI/{_vignette_denominator(mood.vignette)}")

    if mood.grain > 0:
        parts.append(f"noise=c0s={mood.grain}:c0f=t")

    return ",".join(parts)


def grade_clip(
    file_path: str,
    mood_name: str,
    exposure: ExposureAdjustment | None = None,
) -> str:
    metadata = validate_video(file_path)
    timeout = compute_ffmpeg_timeout(metadata["duration"])

    mood = get_mood(mood_name)
    filter_string = build_filter_chain(mood, exposure or ExposureAdjustment())

    tmp = tempfile.NamedTemporaryFile(
        suffix="_graded.mp4", delete=False, prefix="clipvibe_"
    )
    output_path = tmp.name
    tmp.close()

    logger.info(
        "Grading %s (%.1fs, mood=%s, timeout=%ds): %s",
        file_path, metadata["duration"], mood.name, timeout, filter_string,
    )

    success = apply_filters(file_path, output_path, filter_string, timeout=timeout)
    if not success:
        Path(output_path).unlink(missing_ok=True)
        raise GradingError(f"FFmpeg failed to apply filters to {file_path}")

    out = Path(output_path)
    if not out.is_file() or out.stat().st_size == 0:
        out.unlink(missing_ok=True)
        raise GradingError("Grading produced missing or zero-byte output")

    logger.info("Graded clip written to %s", output_path)
    return output_path
