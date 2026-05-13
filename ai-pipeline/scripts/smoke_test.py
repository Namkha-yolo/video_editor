"""Grade a synthetic clip with every mood. Used by CI."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.grader import grade_clip, ExposureAdjustment  # noqa: E402
from services.mood_grades import VALID_MOODS  # noqa: E402


def make_test_video(path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", "testsrc2=duration=1:size=320x180:rate=10",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-t", "1",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def main() -> int:
    failures: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "test.mp4"
        make_test_video(source)

        exposure = ExposureAdjustment(
            brightness=-0.02, contrast=1.04, gain_r=1.05, gain_g=1.0, gain_b=0.95
        )

        for mood in VALID_MOODS:
            print(f"grading {mood}...")
            try:
                out = grade_clip(str(source), mood, exposure=exposure)
                size = Path(out).stat().st_size
                if size <= 0:
                    failures.append(f"{mood}: empty output")
                else:
                    print(f"  ok ({size} bytes)")
                Path(out).unlink(missing_ok=True)
            except Exception as exc:
                failures.append(f"{mood}: {exc}")
                print(f"  FAIL {exc}")

    if failures:
        print(f"\nFAIL ({len(failures)}):")
        for line in failures:
            print(f"  {line}")
        return 1

    print(f"\nPASS ({len(VALID_MOODS)} moods)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
