"""Video clip analyzer service for the ClipVibe AI pipeline.

Extracts visual properties from video clips: brightness, contrast,
dominant colors, and color temperature estimation.
"""

import logging
import uuid
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

MAX_SAMPLE_FRAMES = 20
KMEANS_CLUSTERS = 5
RESIZE_DIM = (100, 100)

# Color temperature mapping anchors (blue/red ratio -> Kelvin).
# ratio 0.8 -> 3000K (warm), 1.0 -> 5500K (neutral), 1.2 -> 8000K (cool)
TEMP_MIN_K = 2500
TEMP_MAX_K = 10000
TEMP_RATIO_LOW = 0.8
TEMP_RATIO_HIGH = 1.2


def _sample_frames(cap: cv2.VideoCapture) -> list[np.ndarray]:
    """Sample evenly-spaced frames from a video capture.

    Reads up to MAX_SAMPLE_FRAMES frames, spaced evenly across the video.
    Skips frames that fail to decode.
    """
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0:
        logger.warning("Could not determine frame count; reading sequentially")
        # Fallback: read every 30th frame until we hit MAX_SAMPLE_FRAMES
        frames: list[np.ndarray] = []
        idx = 0
        while len(frames) < MAX_SAMPLE_FRAMES:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok:
                break
            frames.append(frame)
            idx += 30
        return frames

    step = max(1, total_frames // MAX_SAMPLE_FRAMES)
    frame_indices = list(range(0, total_frames, step))[:MAX_SAMPLE_FRAMES]

    frames = []
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok:
            logger.debug("Failed to read frame at index %d", idx)
            continue
        frames.append(frame)

    return frames


def _compute_brightness(gray_frames: list[np.ndarray]) -> float:
    """Compute average normalized brightness across grayscale frames."""
    values = [np.mean(f) / 255.0 for f in gray_frames]
    return round(float(np.mean(values)), 4)


def _compute_contrast(gray_frames: list[np.ndarray]) -> float:
    """Compute average normalized contrast (std dev of luminance)."""
    values = [np.std(f) / 255.0 for f in gray_frames]
    return round(float(np.mean(values)), 4)


def _extract_dominant_colors(frames: list[np.ndarray], k: int = KMEANS_CLUSTERS) -> list[str]:
    """Extract dominant colors via k-means clustering on sampled frame pixels.

    Returns hex color strings sorted by cluster frequency (most dominant first).
    """
    pixels_list: list[np.ndarray] = []
    for frame in frames:
        small = cv2.resize(frame, RESIZE_DIM, interpolation=cv2.INTER_AREA)
        # OpenCV loads BGR; convert to RGB for hex output
        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        pixels_list.append(rgb.reshape(-1, 3))

    all_pixels = np.vstack(pixels_list).astype(np.float32)

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(
        all_pixels, k, None, criteria, attempts=3, flags=cv2.KMEANS_PP_CENTERS
    )

    # Count label frequencies and sort clusters by popularity
    label_counts = np.bincount(labels.flatten(), minlength=k)
    sorted_indices = np.argsort(-label_counts)

    hex_colors: list[str] = []
    for idx in sorted_indices:
        r, g, b = centers[idx].astype(int)
        r, g, b = np.clip([r, g, b], 0, 255)
        hex_colors.append(f"#{r:02X}{g:02X}{b:02X}")

    return hex_colors


def _estimate_color_temperature(frames: list[np.ndarray]) -> int:
    """Estimate color temperature in Kelvin from the blue/red channel ratio.

    Uses linear interpolation between anchor points:
      ratio 0.8 -> 3000K (warm), 1.0 -> 5500K (neutral), 1.2 -> 8000K (cool)
    """
    ratios: list[float] = []
    for frame in frames:
        # OpenCV BGR channel order
        blue = np.mean(frame[:, :, 0])
        red = np.mean(frame[:, :, 2])
        if red > 0:
            ratios.append(blue / red)

    if not ratios:
        return 5500  # neutral default

    avg_ratio = float(np.mean(ratios))

    # Linear interpolation: map [TEMP_RATIO_LOW, TEMP_RATIO_HIGH] -> [3000, 8000]
    # then clamp to [TEMP_MIN_K, TEMP_MAX_K]
    t = (avg_ratio - TEMP_RATIO_LOW) / (TEMP_RATIO_HIGH - TEMP_RATIO_LOW)
    kelvin = 3000 + t * (8000 - 3000)
    kelvin = max(TEMP_MIN_K, min(TEMP_MAX_K, kelvin))

    return round(kelvin)


def analyze_clip(file_path: str, clip_id: str = "") -> dict:
    """Analyze a video clip's visual properties.

    Args:
        file_path: Path to the video file on disk.
        clip_id: Optional identifier for the clip. If empty, a UUID is generated.

    Returns:
        A dict matching the ClipAnalysis schema:
            clip_id (str), brightness (float), contrast (float),
            dominant_colors (list[str]), color_temperature (int).

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the video cannot be opened or no frames are extracted.
    """
    if not clip_id:
        clip_id = str(uuid.uuid4())

    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Video file not found: {file_path}")

    logger.info("Analyzing clip %s: %s", clip_id, file_path)

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"Failed to open video: {file_path}")

    try:
        frames = _sample_frames(cap)
    finally:
        cap.release()

    if not frames:
        raise ValueError(f"No frames could be extracted from: {file_path}")

    logger.info("Sampled %d frames from %s", len(frames), file_path)

    gray_frames = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]

    brightness = _compute_brightness(gray_frames)
    contrast = _compute_contrast(gray_frames)
    dominant_colors = _extract_dominant_colors(frames)
    color_temperature = _estimate_color_temperature(frames)

    result: dict = {
        "clip_id": clip_id,
        "brightness": brightness,
        "contrast": contrast,
        "dominant_colors": dominant_colors,
        "color_temperature": color_temperature,
    }

    logger.info(
        "Analysis complete for %s: brightness=%.4f contrast=%.4f temp=%dK colors=%s",
        clip_id,
        brightness,
        contrast,
        color_temperature,
        dominant_colors,
    )

    return result
