"""Per-mood post-LUT FFmpeg config and masking strength."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MoodRuntime:
    name: str
    lut_filename: str
    vignette: float
    grain: int
    halation: float = 0.0
    person_protection: float = 0.0


MOOD_RUNTIME: dict[str, MoodRuntime] = {
    "nostalgic": MoodRuntime("nostalgic", "nostalgic.cube", 0.5, 12),
    "cinematic": MoodRuntime("cinematic", "cinematic.cube", 0.6, 5, halation=0.45, person_protection=0.55),
    "hype": MoodRuntime("hype", "hype.cube", 0.3, 3, person_protection=0.85),
    "chill": MoodRuntime("chill", "chill.cube", 0.2, 8, person_protection=0.30),
    "dreamy": MoodRuntime("dreamy", "dreamy.cube", 0.4, 6, halation=0.30, person_protection=0.40),
    "energetic": MoodRuntime("energetic", "energetic.cube", 0.15, 2, person_protection=0.55),
}

VALID_MOODS: tuple[str, ...] = tuple(MOOD_RUNTIME.keys())


def get_mood(name: str) -> MoodRuntime:
    if name not in MOOD_RUNTIME:
        raise ValueError(f"Unknown mood: {name!r}. Valid: {VALID_MOODS}")
    return MOOD_RUNTIME[name]
