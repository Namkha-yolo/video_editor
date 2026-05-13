"""Generate mood LUTs as Adobe Cube 1.0 files.

    python scripts/build_luts.py            # 33-cube LUTs to ../luts/
    python scripts/build_luts.py --size 17  # smaller cubes
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

LUM_R, LUM_G, LUM_B = 0.2126, 0.7152, 0.0722


def luminance(rgb):
    return rgb[..., 0] * LUM_R + rgb[..., 1] * LUM_G + rgb[..., 2] * LUM_B


def smoothstep(edge0, edge1, x):
    width = max(edge1 - edge0, 1e-10)
    t = np.clip((x - edge0) / width, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def rgb_to_hsv(rgb):
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]

    maxc = np.max(rgb, axis=-1)
    minc = np.min(rgb, axis=-1)
    delta = maxc - minc

    v = maxc
    s = np.where(maxc > 1e-10, delta / np.maximum(maxc, 1e-10), 0.0)

    delta_safe = np.where(delta > 1e-10, delta, 1.0)
    rc = (maxc - r) / delta_safe
    gc = (maxc - g) / delta_safe
    bc = (maxc - b) / delta_safe

    h = np.zeros_like(maxc)
    achromatic = delta <= 1e-10
    h = np.where((maxc == r) & ~achromatic, bc - gc, h)
    h = np.where((maxc == g) & ~achromatic, 2.0 + rc - bc, h)
    h = np.where((maxc == b) & ~achromatic, 4.0 + gc - rc, h)
    h = (h * 60.0) % 360.0

    return np.stack([h, s, v], axis=-1)


def hsv_to_rgb(hsv):
    h = hsv[..., 0]
    s = hsv[..., 1]
    v = hsv[..., 2]

    c = v * s
    h_prime = (h / 60.0) % 6.0
    x = c * (1.0 - np.abs((h_prime % 2.0) - 1.0))

    sector = (np.floor(h_prime).astype(np.int32)) % 6
    zeros = np.zeros_like(h)

    r = np.choose(sector, [c, x, zeros, zeros, x, c])
    g = np.choose(sector, [x, c, c, x, zeros, zeros])
    b = np.choose(sector, [zeros, zeros, x, c, c, x])

    m = v - c
    return np.stack([r + m, g + m, b + m], axis=-1)


def per_channel_curve(rgb, curve_r, curve_g, curve_b):
    xp = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
    r = np.interp(rgb[..., 0], xp, np.asarray(curve_r))
    g = np.interp(rgb[..., 1], xp, np.asarray(curve_g))
    b = np.interp(rgb[..., 2], xp, np.asarray(curve_b))
    return np.stack([r, g, b], axis=-1)


def power_contrast(rgb, strength):
    if abs(strength - 1.0) < 1e-6:
        return rgb
    centered = rgb * 2.0 - 1.0
    abs_c = np.abs(centered)
    new_abs = abs_c ** (1.0 / strength)
    out = np.sign(centered) * new_abs
    return (out + 1.0) * 0.5


def split_tone(rgb, shadow_tint, highlight_tint, shadow_end=0.4, highlight_start=0.6):
    lum = luminance(rgb)
    shadow_mask = (1.0 - smoothstep(0.0, shadow_end, lum))[..., None]
    highlight_mask = smoothstep(highlight_start, 1.0, lum)[..., None]

    s_tint = np.array(shadow_tint, dtype=np.float32)
    h_tint = np.array(highlight_tint, dtype=np.float32)

    return rgb + s_tint * shadow_mask + h_tint * highlight_mask


def saturation(rgb, amount):
    if abs(amount - 1.0) < 1e-6:
        return rgb
    lum = luminance(rgb)[..., None]
    return lum + (rgb - lum) * amount


def vibrance(rgb, amount):
    if abs(amount - 1.0) < 1e-6:
        return rgb
    lum = luminance(rgb)[..., None]
    maxc = np.max(rgb, axis=-1, keepdims=True)
    minc = np.min(rgb, axis=-1, keepdims=True)
    current_sat = (maxc - minc) / np.maximum(maxc, 1e-10)
    weight = 1.0 - current_sat
    effective = 1.0 + (amount - 1.0) * weight
    return lum + (rgb - lum) * effective


def skin_protect(rgb_after, rgb_before, hue_center=20.0, hue_width=50.0, sat_max=0.7, strength=1.0):
    if strength < 1e-6:
        return rgb_after

    hsv_before = rgb_to_hsv(rgb_before)
    h_before = hsv_before[..., 0]
    s_before = hsv_before[..., 1]

    hue_dist = np.minimum(np.abs(h_before - hue_center), 360.0 - np.abs(h_before - hue_center))
    half = max(hue_width * 0.5, 1e-3)
    hue_mask = 1.0 - smoothstep(half * 0.5, half, hue_dist)
    sat_mask = 1.0 - smoothstep(sat_max, sat_max + 0.2, s_before)

    mask = (hue_mask * sat_mask * strength)[..., None]
    return rgb_after * (1.0 - mask) + rgb_before * mask


def hue_band_shift(rgb, hue_center, hue_width, hue_shift=0.0, sat_shift=0.0, lum_shift=0.0):
    hsv = rgb_to_hsv(rgb)
    h = hsv[..., 0]
    s = hsv[..., 1]
    v = hsv[..., 2]

    hue_dist = np.minimum(np.abs(h - hue_center), 360.0 - np.abs(h - hue_center))
    half = max(hue_width * 0.5, 1e-3)
    mask = 1.0 - smoothstep(half * 0.5, half, hue_dist)

    h_new = (h + hue_shift * mask) % 360.0
    s_new = np.clip(s + sat_shift * mask, 0.0, 1.0)
    v_new = np.clip(v + lum_shift * mask, 0.0, 1.0)

    return hsv_to_rgb(np.stack([h_new, s_new, v_new], axis=-1))


@dataclass(frozen=True)
class HueShift:
    hue_center: float
    hue_width: float
    hue_shift: float = 0.0
    sat_shift: float = 0.0
    lum_shift: float = 0.0


@dataclass(frozen=True)
class MoodGrade:
    name: str
    title: str

    curve_r: tuple = (0.0, 0.25, 0.5, 0.75, 1.0)
    curve_g: tuple = (0.0, 0.25, 0.5, 0.75, 1.0)
    curve_b: tuple = (0.0, 0.25, 0.5, 0.75, 1.0)

    contrast: float = 1.0

    shadow_tint: tuple = (0.0, 0.0, 0.0)
    highlight_tint: tuple = (0.0, 0.0, 0.0)
    shadow_end: float = 0.4
    highlight_start: float = 0.6

    saturation: float = 1.0
    vibrance: float = 1.0

    skin_strength: float = 0.0
    skin_hue_center: float = 20.0
    skin_hue_width: float = 50.0

    hue_shifts: tuple = field(default_factory=tuple)


def apply_grade(rgb, mood):
    rgb = per_channel_curve(rgb, mood.curve_r, mood.curve_g, mood.curve_b)
    rgb = power_contrast(rgb, mood.contrast)
    rgb = split_tone(rgb, mood.shadow_tint, mood.highlight_tint, mood.shadow_end, mood.highlight_start)

    rgb_pre_sat = rgb
    rgb = vibrance(rgb, mood.vibrance)
    rgb = saturation(rgb, mood.saturation)

    rgb = skin_protect(
        rgb, rgb_pre_sat,
        hue_center=mood.skin_hue_center,
        hue_width=mood.skin_hue_width,
        strength=mood.skin_strength,
    )

    for shift in mood.hue_shifts:
        rgb = hue_band_shift(
            rgb,
            hue_center=shift.hue_center,
            hue_width=shift.hue_width,
            hue_shift=shift.hue_shift,
            sat_shift=shift.sat_shift,
            lum_shift=shift.lum_shift,
        )

    return np.clip(rgb, 0.0, 1.0)


MOODS = (
    MoodGrade(
        name="nostalgic",
        title="ClipVibe Nostalgic",
        curve_r=(0.06, 0.30, 0.55, 0.78, 0.97),
        curve_g=(0.05, 0.27, 0.50, 0.74, 0.95),
        curve_b=(0.03, 0.22, 0.43, 0.66, 0.92),
        contrast=0.92,
        shadow_tint=(0.04, 0.02, -0.01),
        highlight_tint=(0.04, 0.02, -0.03),
        saturation=0.85,
        vibrance=0.95,
        skin_strength=0.5,
    ),
    MoodGrade(
        name="cinematic",
        title="ClipVibe Cinematic",
        curve_r=(0.0, 0.22, 0.50, 0.78, 1.0),
        curve_g=(0.0, 0.23, 0.50, 0.77, 1.0),
        curve_b=(0.02, 0.27, 0.50, 0.73, 0.97),
        contrast=1.20,
        shadow_tint=(-0.02, 0.01, 0.05),
        highlight_tint=(0.06, 0.02, -0.04),
        saturation=0.88,
        vibrance=1.10,
        skin_strength=0.65,
    ),
    MoodGrade(
        name="hype",
        title="ClipVibe Hype",
        curve_r=(0.0, 0.20, 0.50, 0.80, 1.0),
        curve_g=(0.0, 0.20, 0.50, 0.80, 1.0),
        curve_b=(0.0, 0.20, 0.50, 0.80, 1.0),
        contrast=1.30,
        shadow_tint=(0.01, 0.0, 0.0),
        highlight_tint=(0.02, 0.01, 0.0),
        saturation=1.40,
        vibrance=1.20,
        skin_strength=0.80,
    ),
    MoodGrade(
        name="chill",
        title="ClipVibe Chill",
        curve_r=(0.02, 0.24, 0.48, 0.72, 0.97),
        curve_g=(0.03, 0.25, 0.50, 0.74, 0.98),
        curve_b=(0.05, 0.28, 0.52, 0.76, 0.99),
        contrast=0.88,
        shadow_tint=(0.0, 0.01, 0.04),
        highlight_tint=(0.0, 0.02, 0.04),
        saturation=0.92,
        vibrance=1.05,
        skin_strength=0.4,
        hue_shifts=(
            HueShift(hue_center=210.0, hue_width=80.0, sat_shift=0.10, lum_shift=0.03),
        ),
    ),
    MoodGrade(
        name="dreamy",
        title="ClipVibe Dreamy",
        curve_r=(0.07, 0.32, 0.56, 0.78, 0.98),
        curve_g=(0.06, 0.30, 0.54, 0.77, 0.98),
        curve_b=(0.08, 0.32, 0.56, 0.78, 1.0),
        contrast=0.78,
        shadow_tint=(0.05, 0.03, 0.06),
        highlight_tint=(0.02, 0.0, 0.04),
        saturation=0.78,
        vibrance=1.10,
        skin_strength=0.6,
    ),
    MoodGrade(
        name="energetic",
        title="ClipVibe Energetic",
        curve_r=(0.01, 0.23, 0.50, 0.78, 1.0),
        curve_g=(0.0, 0.22, 0.50, 0.77, 0.99),
        curve_b=(0.0, 0.20, 0.47, 0.72, 0.96),
        contrast=1.20,
        shadow_tint=(0.02, 0.01, 0.0),
        highlight_tint=(0.06, 0.03, -0.03),
        saturation=1.30,
        vibrance=1.15,
        skin_strength=0.70,
        hue_shifts=(
            HueShift(hue_center=100.0, hue_width=80.0, hue_shift=-8.0, sat_shift=0.08),
        ),
    ),
)


def build_lut(mood, size):
    grid = np.linspace(0.0, 1.0, size, dtype=np.float32)
    r, g, b = np.meshgrid(grid, grid, grid, indexing="ij")
    rgb = np.stack([r, g, b], axis=-1)
    rgb = rgb.transpose(2, 1, 0, 3)
    return apply_grade(rgb, mood).reshape(-1, 3)


def write_cube(path, mood, lut):
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


def main():
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
