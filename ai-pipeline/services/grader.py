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
    gain_r: float = 1.0
    gain_g: float = 1.0
    gain_b: float = 1.0


def _vignette_denominator(strength: float) -> int:
    n = round(8 - strength * 4)
    return max(4, min(8, n))


def _is_default_eq(exposure: ExposureAdjustment) -> bool:
    return (
        abs(exposure.brightness) < 1e-3
        and abs(exposure.contrast - 1.0) < 1e-3
        and abs(exposure.saturation - 1.0) < 1e-3
    )


def _is_default_wb(exposure: ExposureAdjustment) -> bool:
    return (
        abs(exposure.gain_r - 1.0) < 1e-3
        and abs(exposure.gain_g - 1.0) < 1e-3
        and abs(exposure.gain_b - 1.0) < 1e-3
    )


def _escape_lut_path(lut_path: Path) -> str:
    # ':' separates FFmpeg filter args; escape it so absolute paths survive.
    return str(lut_path).replace("\\", "/").replace(":", "\\:")


def _build_pre_lut_chain(exposure: ExposureAdjustment) -> list[str]:
    parts: list[str] = []
    if not _is_default_wb(exposure):
        parts.append(
            f"colorchannelmixer=rr={exposure.gain_r:.3f}"
            f":gg={exposure.gain_g:.3f}"
            f":bb={exposure.gain_b:.3f}"
        )
    if not _is_default_eq(exposure):
        parts.append(
            f"eq=brightness={exposure.brightness:.3f}"
            f":contrast={exposure.contrast:.3f}"
            f":saturation={exposure.saturation:.3f}"
        )
    return parts


def _build_post_lut_chain(mood: MoodRuntime) -> list[str]:
    parts: list[str] = []
    if mood.vignette > 0:
        parts.append(f"vignette=PI/{_vignette_denominator(mood.vignette)}")
    if mood.grain > 0:
        parts.append(f"noise=c0s={mood.grain}:c0f=t")
    return parts


_HALATION_BRANCH = (
    "curves=all='0/0 0.55/0 0.85/0.45 1/1',"
    "colorbalance=rh=0.4:gh=-0.10:bh=-0.45,"
    "gblur=sigma=20:steps=2"
)


def _grading_subgraph(
    mood,
    exposure,
    lut_filter,
    pre,
    post,
    *,
    input_label,
    output_label,
    glow_input_label,
    glow_output_label,
    main_label,
):
    if mood.halation <= 0.0:
        graded = ",".join(pre + [lut_filter] + post)
        return [f"{input_label}{graded}{output_label}"]

    main_chain = ",".join(pre + [lut_filter] + [f"split=2{main_label}[{glow_input_label}]"])
    glow_chain = f"[{glow_input_label}]{_HALATION_BRANCH}[{glow_output_label}]"
    blend = f"{main_label}[{glow_output_label}]blend=all_mode=addition:all_opacity={mood.halation:.3f}"
    if post:
        blend += "," + ",".join(post)
    blend += output_label
    return [f"{input_label}{main_chain}", glow_chain, blend]


def build_filter_spec(mood, exposure, mask_path=None):
    lut_path = LUT_DIR / mood.lut_filename
    if not lut_path.is_file():
        raise GradingError(f"LUT file not found: {lut_path}")

    pre = _build_pre_lut_chain(exposure)
    lut_filter = f"lut3d=file={_escape_lut_path(lut_path)}"
    post = _build_post_lut_chain(mood)

    has_halation = mood.halation > 0.0
    has_mask = mask_path is not None

    if not has_halation and not has_mask:
        return ",".join(pre + [lut_filter] + post), False

    if has_halation and not has_mask:
        chains = _grading_subgraph(
            mood, exposure, lut_filter, pre, post,
            input_label="[0:v]",
            output_label="[v]",
            glow_input_label="bright",
            glow_output_label="glow",
            main_label="[main]",
        )
        return ";".join(chains), True

    chains = ["[0:v]split=2[orig][forgrad]"]
    chains.extend(
        _grading_subgraph(
            mood, exposure, lut_filter, pre, post,
            input_label="[forgrad]",
            output_label="[graded]",
            glow_input_label="m_bright",
            glow_output_label="m_glow",
            main_label="[m_main]",
        )
    )
    chains.append("[1:v]format=gray[maskg]")
    chains.append("[orig][graded][maskg]maskedmerge[v]")
    return ";".join(chains), True


def grade_clip(file_path, mood_name, exposure=None, *, enable_masking=True):
    metadata = validate_video(file_path)
    timeout = compute_ffmpeg_timeout(metadata["duration"])

    mood = get_mood(mood_name)
    exposure = exposure or ExposureAdjustment()

    mask_path = None
    if enable_masking and mood.person_protection > 1e-3:
        from .segmenter import extract_person_mask_video, SegmentationError

        mask_tmp = tempfile.NamedTemporaryFile(
            suffix="_mask.mp4", delete=False, prefix="clipvibe_"
        )
        mask_path = mask_tmp.name
        mask_tmp.close()
        try:
            extract_person_mask_video(
                file_path,
                mask_path,
                protection_strength=mood.person_protection,
            )
        except SegmentationError as exc:
            Path(mask_path).unlink(missing_ok=True)
            mask_path = None
            logger.warning("Person segmentation failed (%s); falling back to global grade", exc)

    filter_string, is_complex = build_filter_spec(mood, exposure, mask_path=mask_path)

    out_tmp = tempfile.NamedTemporaryFile(
        suffix="_graded.mp4", delete=False, prefix="clipvibe_"
    )
    output_path = out_tmp.name
    out_tmp.close()

    logger.info(
        "Grading %s (%.1fs, mood=%s, mask=%s, timeout=%ds)",
        file_path, metadata["duration"], mood.name, bool(mask_path), timeout,
    )

    try:
        success = apply_filters(
            file_path,
            output_path,
            filter_string,
            timeout=timeout,
            complex_filter=is_complex,
            extra_inputs=[mask_path] if mask_path else None,
        )
    finally:
        if mask_path:
            Path(mask_path).unlink(missing_ok=True)

    if not success:
        Path(output_path).unlink(missing_ok=True)
        raise GradingError(f"FFmpeg failed to apply filters to {file_path}")

    out = Path(output_path)
    if not out.is_file() or out.stat().st_size == 0:
        out.unlink(missing_ok=True)
        raise GradingError("Grading produced missing or zero-byte output")

    return output_path
