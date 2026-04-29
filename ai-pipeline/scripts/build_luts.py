"""Generate mood LUTs as Adobe Cube 1.0 files.

    python scripts/build_luts.py            # 33-cube LUTs to ../luts/
    python scripts/build_luts.py --size 17  # smaller cubes
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Rec. 709 luminance coefficients
LUM_R, LUM_G, LUM_B = 0.2126, 0.7152, 0.0722


@dataclass(frozen=True)
class MoodGrade:
    name: str
    title: str
    lift_rgb: tuple[float, float, float]
    gain_rgb: tuple[float, float, float]
    contrast: float
    saturation: float
    black_lift: float


MOODS: tuple[MoodGrade, ...] = (
    MoodGrade(
        name="nostalgic",
        title="ClipVibe Nostalgic - faded warm vintage",
        lift_rgb=(0.04, 0.03, 0.02),
        gain_rgb=(1.00, 0.99, 0.95),
        contrast=0.92,
        saturation=0.85,
        black_lift=0.04,
    ),
    MoodGrade(
        name="cinematic",
        title="ClipVibe Cinematic - teal/orange split",
        lift_rgb=(-0.01, 0.01, 0.04),
        gain_rgb=(1.05, 1.01, 0.96),
        contrast=1.25,
        saturation=0.88,
        black_lift=0.0,
    ),
    MoodGrade(
        name="hype",
        title="ClipVibe Hype - vibrant punchy",
        lift_rgb=(0.01, 0.0, 0.0),
        gain_rgb=(1.03, 1.01, 1.0),
        contrast=1.30,
        saturation=1.40,
        black_lift=0.0,
    ),
    MoodGrade(
        name="chill",
        title="ClipVibe Chill - soft cool",
        lift_rgb=(0.0, 0.01, 0.02),
        gain_rgb=(0.99, 1.0, 1.0),
        contrast=0.88,
        saturation=0.92,
        black_lift=0.03,
    ),
    MoodGrade(
        name="dreamy",
        title="ClipVibe Dreamy - lifted pastel",
        lift_rgb=(0.05, 0.04, 0.06),
        gain_rgb=(1.00, 0.99, 1.01),
        contrast=0.78,
        saturation=0.78,
        black_lift=0.06,
    ),
    MoodGrade(
        name="energetic",
        title="ClipVibe Energetic - warm vivid",
        lift_rgb=(0.02, 0.01, 0.0),
        gain_rgb=(1.06, 1.03, 0.97),
        contrast=1.20,
        saturation=1.30,
        black_lift=0.0,
    ),
)


def power_contrast(values: np.ndarray, strength: float) -> np.ndarray:
    if abs(strength - 1.0) < 1e-6:
        return values
    centered = values * 2.0 - 1.0
    abs_c = np.abs(centered)
    new_abs = abs_c ** (1.0 / strength)
    out = np.sign(centered) * new_abs
    return (out + 1.0) * 0.5


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * LUM_R + rgb[..., 1] * LUM_G + rgb[..., 2] * LUM_B


def apply_grade(rgb: np.ndarray, mood: MoodGrade) -> np.ndarray:
    out = power_contrast(rgb, mood.contrast)

    if mood.black_lift > 0:
        out = mood.black_lift + out * (1.0 - mood.black_lift)

    lum = luminance(out)
    shadow_mask = np.clip(1.0 - lum * 2.0, 0.0, 1.0)[..., None]
    lift = np.array(mood.lift_rgb, dtype=np.float32)
    out = out + lift * shadow_mask

    lum = luminance(out)
    highlight_mask = np.clip((lum - 0.5) * 2.0, 0.0, 1.0)[..., None]
    gain = np.array(mood.gain_rgb, dtype=np.float32)
    out = out * (1.0 + (gain - 1.0) * highlight_mask)

    lum = luminance(out)[..., None]
    out = lum + (out - lum) * mood.saturation

    return np.clip(out, 0.0, 1.0)


def build_lut(mood: MoodGrade, size: int) -> np.ndarray:
    grid = np.linspace(0.0, 1.0, size, dtype=np.float32)
    r, g, b = np.meshgrid(grid, grid, grid, indexing="ij")
    rgb = np.stack([r, g, b], axis=-1)
    # Cube format wants R varying fastest in the flat output, so B (axis 2) becomes the outermost.
    rgb = rgb.transpose(2, 1, 0, 3)
    return apply_grade(rgb, mood).reshape(-1, 3)


def write_cube(path: Path, mood: MoodGrade, lut: np.ndarray) -> None:
    size = round(lut.shape[0] ** (1.0 / 3.0))
    lines = [
        f'TITLE "{mood.title}"',
        f"LUT_3D_SIZE {size}",
        "DOMAIN_MIN 0.0 0.0 0.0",
        "DOMAIN_MAX 1.0 1.0 1.0",
    ]
    for sample in lut:
        lines.append(f"{sample[0]:.6f} {sample[1]:.6f} {sample[2]:.6f}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=33)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "luts",
    )
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    for mood in MOODS:
        lut = build_lut(mood, args.size)
        path = args.out / f"{mood.name}.cube"
        write_cube(path, mood, lut)
        print(f"wrote {path} ({lut.shape[0]} entries)")


if __name__ == "__main__":
    main()
