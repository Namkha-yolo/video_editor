"""Download MediaPipe model weights into ai-pipeline/models/.

    python scripts/download_models.py
"""

from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path


MODELS = {
    "selfie_segmenter_landscape.tflite": (
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
        "selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite"
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "models",
    )
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    for filename, url in MODELS.items():
        target = args.out / filename
        if target.is_file() and target.stat().st_size > 0:
            print(f"skip {filename} ({target.stat().st_size} bytes)")
            continue
        print(f"downloading {url} -> {target}")
        urllib.request.urlretrieve(url, target)
        print(f"  {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
