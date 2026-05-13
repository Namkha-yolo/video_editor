"""User-defined moods: validate a LUT recipe and build a .cube from it.

Pattern: an LLM (server-side) generates a structured recipe matching this
schema; the recipe is sent here to be turned into a real 3D LUT via the
existing procedural pipeline in scripts/build_luts.py. Out-of-range
values are clamped rather than rejected so a slightly-off LLM response
still produces a usable LUT.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from build_luts import MoodGrade, apply_grade  # noqa: E402

logger = logging.getLogger(__name__)


class RecipeError(Exception):
    pass


CURVE_LEN = 5
CONTRAST_RANGE = (0.5, 1.5)
TINT_RANGE = (-0.1, 0.1)
SATURATION_RANGE = (0.4, 1.8)
VIBRANCE_RANGE = (0.6, 1.4)
SKIN_STRENGTH_RANGE = (0.0, 1.0)
VIGNETTE_RANGE = (0.0, 0.8)
GRAIN_RANGE = (0, 25)
HALATION_RANGE = (0.0, 0.6)
PERSON_PROTECTION_RANGE = (0.0, 1.0)
SPEED_RANGE = (0.7, 1.4)
TRANSITION_DURATION_RANGE = (0.1, 2.0)
AUDIO_HIGHPASS_RANGE = (0, 400)
AUDIO_LOWPASS_RANGE = (0, 16000)

VALID_TRANSITIONS = frozenset({
    "fade", "fadeblack", "fadewhite",
    "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown",
    "circleopen", "circleclose",
    "horzopen", "horzclose", "vertopen", "vertclose",
    "dissolve", "pixelize", "radial",
    "smoothleft", "smoothright", "smoothup", "smoothdown",
    "zoomin",
})
DEFAULT_TRANSITION = "fade"


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _normalise_curve(curve: list) -> tuple:
    if not isinstance(curve, (list, tuple)) or len(curve) != CURVE_LEN:
        raise RecipeError(f"curve must have {CURVE_LEN} points, got {len(curve) if hasattr(curve, '__len__') else type(curve).__name__}")
    clamped = [_clamp(float(v), 0.0, 1.0) for v in curve]
    # Enforce monotonic non-decreasing so the LUT doesn't fold back on itself.
    for i in range(1, CURVE_LEN):
        if clamped[i] < clamped[i - 1]:
            clamped[i] = clamped[i - 1]
    return tuple(clamped)


def _normalise_triple(values: list, lo: float, hi: float, label: str) -> tuple:
    if not isinstance(values, (list, tuple)) or len(values) != 3:
        raise RecipeError(f"{label} must be a 3-element list [r, g, b]")
    return tuple(_clamp(float(v), lo, hi) for v in values)


@dataclass(frozen=True)
class CustomPacing:
    speed: float
    transition: str
    transition_duration: float
    audio_highpass: int
    audio_lowpass: int


@dataclass(frozen=True)
class CustomRecipe:
    name: str
    title: str
    description: str
    mood_grade: MoodGrade
    vignette: float
    grain: int
    halation: float
    person_protection: float
    pacing: CustomPacing


def recipe_from_dict(payload: dict) -> CustomRecipe:
    """Coerce an LLM-generated recipe into a validated, clamped CustomRecipe.

    Missing fields fall back to sensible neutral defaults. Out-of-range
    values are clamped to the allowed range.
    """
    if not isinstance(payload, dict):
        raise RecipeError("recipe must be a JSON object")

    raw_name = str(payload.get("name") or "custom").strip().lower().replace(" ", "-")
    name = "".join(ch for ch in raw_name if ch.isalnum() or ch in "-_")[:32] or "custom"
    title = str(payload.get("title") or name.replace("-", " ").title())[:64]
    description = str(payload.get("description") or "")[:240]

    identity_curve = [0.0, 0.25, 0.5, 0.75, 1.0]
    curve_r = _normalise_curve(payload.get("curve_r") or identity_curve)
    curve_g = _normalise_curve(payload.get("curve_g") or identity_curve)
    curve_b = _normalise_curve(payload.get("curve_b") or identity_curve)

    contrast = _clamp(float(payload.get("contrast", 1.0)), *CONTRAST_RANGE)
    shadow_tint = _normalise_triple(payload.get("shadow_tint") or [0.0, 0.0, 0.0], *TINT_RANGE, "shadow_tint")
    highlight_tint = _normalise_triple(payload.get("highlight_tint") or [0.0, 0.0, 0.0], *TINT_RANGE, "highlight_tint")
    saturation = _clamp(float(payload.get("saturation", 1.0)), *SATURATION_RANGE)
    vibrance = _clamp(float(payload.get("vibrance", 1.0)), *VIBRANCE_RANGE)
    skin_strength = _clamp(float(payload.get("skin_strength", 0.5)), *SKIN_STRENGTH_RANGE)

    vignette = _clamp(float(payload.get("vignette", 0.3)), *VIGNETTE_RANGE)
    grain = int(_clamp(int(payload.get("grain", 5)), *GRAIN_RANGE))
    halation = _clamp(float(payload.get("halation", 0.0)), *HALATION_RANGE)
    person_protection = _clamp(
        float(payload.get("person_protection", 0.4)), *PERSON_PROTECTION_RANGE
    )

    speed = _clamp(float(payload.get("speed", 1.0)), *SPEED_RANGE)
    transition_raw = str(payload.get("transition") or DEFAULT_TRANSITION).strip().lower()
    transition = transition_raw if transition_raw in VALID_TRANSITIONS else DEFAULT_TRANSITION
    transition_duration = _clamp(
        float(payload.get("transition_duration", 0.6)), *TRANSITION_DURATION_RANGE
    )
    audio_highpass = int(_clamp(int(payload.get("audio_highpass", 0)), *AUDIO_HIGHPASS_RANGE))
    audio_lowpass = int(_clamp(int(payload.get("audio_lowpass", 0)), *AUDIO_LOWPASS_RANGE))

    pacing = CustomPacing(
        speed=speed,
        transition=transition,
        transition_duration=transition_duration,
        audio_highpass=audio_highpass,
        audio_lowpass=audio_lowpass,
    )

    mood = MoodGrade(
        name=name,
        title=title,
        curve_r=curve_r,
        curve_g=curve_g,
        curve_b=curve_b,
        contrast=contrast,
        shadow_tint=shadow_tint,
        highlight_tint=highlight_tint,
        saturation=saturation,
        vibrance=vibrance,
        skin_strength=skin_strength,
    )
    return CustomRecipe(
        name=name,
        title=title,
        description=description,
        mood_grade=mood,
        vignette=vignette,
        grain=grain,
        halation=halation,
        person_protection=person_protection,
        pacing=pacing,
    )


def build_cube_string(recipe: CustomRecipe, size: int = 33) -> str:
    """Build a complete Adobe Cube 1.0 .cube file string from a recipe."""
    grid = np.linspace(0.0, 1.0, size, dtype=np.float32)
    r, g, b = np.meshgrid(grid, grid, grid, indexing="ij")
    rgb = np.stack([r, g, b], axis=-1).transpose(2, 1, 0, 3)
    lut = apply_grade(rgb, recipe.mood_grade).reshape(-1, 3)

    lines = [
        f'TITLE "{recipe.title}"',
        f"LUT_3D_SIZE {size}",
        "DOMAIN_MIN 0.0 0.0 0.0",
        "DOMAIN_MAX 1.0 1.0 1.0",
    ]
    for sample in lut:
        lines.append(f"{sample[0]:.6f} {sample[1]:.6f} {sample[2]:.6f}")
    return "\n".join(lines) + "\n"
