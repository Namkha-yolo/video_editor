"""Generate placeholder soundtrack stubs and write the music manifest.

These stubs are NOT shippable music — they're recognisably-different
sine + tremolo tones, one per mood, used so the assembly pipeline and
CI smoke tests can run end-to-end before real tracks are dropped in.

To replace placeholders with real tracks:
  1. Drop the new files into ai-pipeline/music/
  2. Update manifest.json with their filename, duration, bpm, and energy
  3. Optionally re-run scripts/extract_track_features.py (todo) to
     recompute features

    python scripts/generate_placeholder_tracks.py
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MUSIC_DIR = ROOT / "music"

# (freq_hz, tremolo_hz, tremolo_depth, echo_delay_ms, target_bpm, target_energy)
MOOD_SYNTH: dict[str, dict] = {
    "nostalgic": {"freq": 220.0, "tremolo_f": 3.5, "tremolo_d": 0.4, "echo": 600, "duration": 30,
                  "bpm": 78, "energy": 0.25},
    "cinematic": {"freq": 174.61, "tremolo_f": 0.6, "tremolo_d": 0.3, "echo": 900, "duration": 30,
                  "bpm": 70, "energy": 0.30},
    "hype":      {"freq": 330.0, "tremolo_f": 8.5, "tremolo_d": 0.55, "echo": 120, "duration": 30,
                  "bpm": 138, "energy": 0.85},
    "chill":     {"freq": 196.0, "tremolo_f": 2.0, "tremolo_d": 0.35, "echo": 1000, "duration": 30,
                  "bpm": 72, "energy": 0.28},
    "dreamy":    {"freq": 261.63, "tremolo_f": 1.6, "tremolo_d": 0.5, "echo": 1400, "duration": 30,
                  "bpm": 68, "energy": 0.22},
    "energetic": {"freq": 392.0, "tremolo_f": 6.5, "tremolo_d": 0.45, "echo": 200, "duration": 30,
                  "bpm": 126, "energy": 0.75},
}


def _build_filter(cfg: dict) -> str:
    return (
        f"sine=frequency={cfg['freq']}:duration={cfg['duration']},"
        f"tremolo=f={cfg['tremolo_f']}:d={cfg['tremolo_d']},"
        f"aecho=0.6:0.7:{cfg['echo']}:0.3,"
        "volume=0.4"
    )


def generate_track(mood: str, cfg: dict, out_dir: Path, force: bool = False) -> Path:
    out_path = out_dir / f"{mood}.m4a"
    if out_path.exists() and not force:
        return out_path

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", _build_filter(cfg),
        "-c:a", "aac", "-b:a", "96k",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"failed to synth {mood}: {result.stderr.strip().splitlines()[-3:]}")
    return out_path


def write_manifest(out_dir: Path, generated: dict[str, Path]) -> None:
    manifest: dict[str, list[dict]] = {}
    for mood, path in generated.items():
        cfg = MOOD_SYNTH[mood]
        manifest[mood] = [
            {
                "file": path.name,
                "duration": float(cfg["duration"]),
                "bpm": float(cfg["bpm"]),
                "energy": float(cfg["energy"]),
                "kind": "placeholder",
            }
        ]
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=MUSIC_DIR)
    parser.add_argument("--force", action="store_true", help="regenerate even if files exist")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    generated: dict[str, Path] = {}
    for mood, cfg in MOOD_SYNTH.items():
        path = generate_track(mood, cfg, args.out, force=args.force)
        generated[mood] = path
        print(f"wrote {path}")

    write_manifest(args.out, generated)
    print(f"wrote {args.out / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
