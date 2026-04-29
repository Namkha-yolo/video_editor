"""Runtime config for the post-LUT FFmpeg flourishes (vignette, grain).

Colour signatures are baked into the .cube files; this only carries the
parts the pipeline needs to build the FFmpeg filter chain.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MoodRuntime:
    name: str
    lut_filename: str
    vignette: float
    grain: int


MOOD_RUNTIME: dict[str, MoodRuntime] = {
    "nostalgic": MoodRuntime("nostalgic", "nostalgic.cube", 0.5, 12),
    "cinematic": MoodRuntime("cinematic", "cinematic.cube", 0.6, 5),
    "hype": MoodRuntime("hype", "hype.cube", 0.3, 3),
    "chill": MoodRuntime("chill", "chill.cube", 0.2, 8),
    "dreamy": MoodRuntime("dreamy", "dreamy.cube", 0.4, 6),
    "energetic": MoodRuntime("energetic", "energetic.cube", 0.15, 2),
}

VALID_MOODS: tuple[str, ...] = tuple(MOOD_RUNTIME.keys())


def get_mood(name: str) -> MoodRuntime:
    if name not in MOOD_RUNTIME:
        raise ValueError(f"Unknown mood: {name!r}. Valid: {VALID_MOODS}")
    return MOOD_RUNTIME[name]
