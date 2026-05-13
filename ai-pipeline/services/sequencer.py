"""Mood-aware clip ordering based on per-clip visual analysis.

Three strategies are selected by mood:
- arc_up: ascending visual intensity (hype, energetic) — energy builds
- arc_down: descending visual intensity (dreamy, chill) — wind-down arc
- smooth: greedy nearest-neighbour in feature space (cinematic, nostalgic)
  — minimises adjacent tonal jumps so cuts feel continuous
"""

from __future__ import annotations

from dataclasses import dataclass

ARC_UP_MOODS = frozenset({"hype", "energetic"})
ARC_DOWN_MOODS = frozenset({"dreamy", "chill"})

TEMP_MIN_K = 2500
TEMP_MAX_K = 10000


@dataclass(frozen=True)
class ClipFeatures:
    brightness: float
    contrast: float
    color_temperature: int


def _temp_norm(kelvin: int) -> float:
    return max(0.0, min(1.0, (kelvin - TEMP_MIN_K) / (TEMP_MAX_K - TEMP_MIN_K)))


def _intensity(f: ClipFeatures) -> float:
    # Heuristic visual-energy proxy used for arc ordering.
    return f.brightness * 0.55 + f.contrast * 0.45


def _distance(a: ClipFeatures, b: ClipFeatures) -> float:
    db = a.brightness - b.brightness
    dc = a.contrast - b.contrast
    dt = _temp_norm(a.color_temperature) - _temp_norm(b.color_temperature)
    return (db * db + dc * dc + dt * dt) ** 0.5


def _centroid(features: list[ClipFeatures]) -> ClipFeatures:
    n = len(features)
    b = sum(f.brightness for f in features) / n
    c = sum(f.contrast for f in features) / n
    t = sum(f.color_temperature for f in features) / n
    return ClipFeatures(brightness=b, contrast=c, color_temperature=int(t))


def _order_smooth(features: list[ClipFeatures]) -> list[int]:
    n = len(features)
    if n <= 1:
        return list(range(n))

    centroid = _centroid(features)
    remaining = set(range(n))
    start = min(remaining, key=lambda i: _distance(features[i], centroid))
    order = [start]
    remaining.discard(start)

    while remaining:
        last = features[order[-1]]
        nearest = min(remaining, key=lambda i: _distance(last, features[i]))
        order.append(nearest)
        remaining.discard(nearest)

    return order


def order_clips(features: list[ClipFeatures], mood: str) -> list[int]:
    """Return indices into the original list giving the recommended play order."""
    if len(features) <= 1:
        return list(range(len(features)))
    if mood in ARC_UP_MOODS:
        return sorted(range(len(features)), key=lambda i: _intensity(features[i]))
    if mood in ARC_DOWN_MOODS:
        return sorted(range(len(features)), key=lambda i: -_intensity(features[i]))
    return _order_smooth(features)
