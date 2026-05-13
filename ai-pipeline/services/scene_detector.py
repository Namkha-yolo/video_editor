"""Scene detection wrapper around PySceneDetect."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class SceneDetectionError(Exception):
    pass


def detect_scenes(path: str, threshold: float = 27.0) -> list[tuple[float, float]]:
    """Detect content-based scene cut points.

    Returns a list of (start_seconds, end_seconds). Empty list means no cuts
    were detected (the clip is one continuous scene).
    """
    try:
        from scenedetect import detect, ContentDetector
    except ImportError as exc:
        raise SceneDetectionError("scenedetect is not installed") from exc

    try:
        scenes = detect(path, ContentDetector(threshold=threshold))
    except Exception as exc:
        raise SceneDetectionError(f"scene detection failed for {path}: {exc}") from exc

    return [(start.get_seconds(), end.get_seconds()) for start, end in scenes]


def primary_scene(path: str, threshold: float = 27.0) -> tuple[float, float] | None:
    """Return the longest detected scene, or None if no cuts were found."""
    scenes = detect_scenes(path, threshold)
    if not scenes:
        return None
    return max(scenes, key=lambda s: s[1] - s[0])
