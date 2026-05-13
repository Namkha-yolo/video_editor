"""Soundtrack library: load manifest, pick a track per mood, expose paths."""

from __future__ import annotations

import json
import logging
import random
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

MUSIC_DIR = Path(__file__).resolve().parent.parent / "music"
MANIFEST_PATH = MUSIC_DIR / "manifest.json"


class SoundtrackError(Exception):
    pass


@dataclass(frozen=True)
class Track:
    mood: str
    path: Path
    duration: float
    bpm: float
    energy: float
    kind: str  # "placeholder" or "curated" or "ai-matched"


def _load_manifest() -> dict:
    if not MANIFEST_PATH.is_file():
        return {}
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("soundtrack manifest unreadable: %s", exc)
        return {}


def list_tracks_for_mood(mood: str) -> list[Track]:
    data = _load_manifest()
    entries = data.get(mood, [])
    out: list[Track] = []
    for entry in entries:
        filename = entry.get("file")
        if not filename:
            continue
        path = MUSIC_DIR / filename
        if not path.is_file():
            continue
        out.append(
            Track(
                mood=mood,
                path=path,
                duration=float(entry.get("duration", 0.0)),
                bpm=float(entry.get("bpm", 0.0)),
                energy=float(entry.get("energy", 0.0)),
                kind=str(entry.get("kind", "curated")),
            )
        )
    return out


def pick_track_for_mood(mood: str, seed: int | None = None) -> Track | None:
    tracks = list_tracks_for_mood(mood)
    if not tracks:
        logger.info("no soundtrack tracks for mood=%s", mood)
        return None
    rng = random.Random(seed)
    return rng.choice(tracks)
