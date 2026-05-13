"""Assemble three synthetic clips through every mood. Used by CI."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.assembler import PACING, assemble  # noqa: E402


def make_test_clip(path: Path, source: str, duration: int = 2) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"{source}=duration={duration}:size=320x180:rate=30",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-shortest",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def main() -> int:
    failures: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        clip_paths: list[str] = []
        for i, source in enumerate(("testsrc2", "smptebars", "rgbtestsrc")):
            p = tmp_dir / f"clip_{i}.mp4"
            make_test_clip(p, source)
            clip_paths.append(str(p))

        for mood in PACING:
            print(f"assembling {mood}...")
            out_path = tmp_dir / f"out_{mood}.mp4"
            try:
                assemble(clip_paths, str(out_path), mood)
                size = out_path.stat().st_size
                if size <= 0:
                    failures.append(f"{mood}: empty output")
                else:
                    print(f"  ok ({size} bytes)")
            except Exception as exc:
                failures.append(f"{mood}: {exc}")
                print(f"  FAIL {exc}")

    if failures:
        print(f"\nFAIL ({len(failures)}):")
        for line in failures:
            print(f"  {line}")
        return 1

    print(f"\nPASS ({len(PACING)} moods)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
