from __future__ import annotations

import logging
import threading
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
SELFIE_MODEL_PATH = MODEL_DIR / "selfie_segmenter_landscape.tflite"

SEGMENTATION_INTERVAL = 6
SEGMENTATION_INPUT_SIZE = (256, 144)

_segmenter_lock = threading.Lock()
_segmenter = None


class SegmentationError(Exception):
    pass


def _get_segmenter():
    global _segmenter
    if _segmenter is not None:
        return _segmenter
    with _segmenter_lock:
        if _segmenter is not None:
            return _segmenter
        if not SELFIE_MODEL_PATH.is_file():
            raise SegmentationError(
                f"Selfie segmenter model not found at {SELFIE_MODEL_PATH}. "
                "Run scripts/download_models.py first."
            )
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        base = mp_python.BaseOptions(model_asset_path=str(SELFIE_MODEL_PATH))
        options = vision.ImageSegmenterOptions(
            base_options=base,
            output_category_mask=False,
            output_confidence_masks=True,
        )
        _segmenter = vision.ImageSegmenter.create_from_options(options)
    return _segmenter


def _segment_frame_bgr(bgr_small: np.ndarray) -> np.ndarray:
    import mediapipe as mp

    rgb = cv2.cvtColor(bgr_small, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = _get_segmenter().segment(mp_image)
    confidence = np.asarray(result.confidence_masks[0].numpy_view())
    if confidence.ndim == 3:
        confidence = confidence[..., 0]
    return (np.clip(confidence, 0.0, 1.0) * 255.0).astype(np.uint8)


def _warp_mask(prev_mask, prev_gray, curr_gray):
    flow = cv2.calcOpticalFlowFarneback(
        prev_gray, curr_gray, None,
        pyr_scale=0.5, levels=3, winsize=15,
        iterations=3, poly_n=5, poly_sigma=1.2, flags=0,
    )
    h, w = prev_mask.shape
    grid_x = np.tile(np.arange(w, dtype=np.float32), (h, 1))
    grid_y = np.tile(np.arange(h, dtype=np.float32).reshape(-1, 1), (1, w))
    map_x = grid_x - flow[..., 0]
    map_y = grid_y - flow[..., 1]
    return cv2.remap(prev_mask, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def extract_person_mask_video(input_path, output_path, protection_strength=1.0):
    if protection_strength <= 1e-3:
        raise ValueError("protection_strength must be > 0")

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise SegmentationError(f"Cannot open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if src_w <= 0 or src_h <= 0:
        cap.release()
        raise SegmentationError(f"Invalid video dimensions: {src_w}x{src_h}")

    seg_w, seg_h = SEGMENTATION_INPUT_SIZE
    scale = min(seg_w / src_w, seg_h / src_h, 1.0)
    work_w = max(2, int(round(src_w * scale)))
    work_h = max(2, int(round(src_h * scale)))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (src_w, src_h), isColor=True)
    if not writer.isOpened():
        cap.release()
        raise SegmentationError(f"Cannot open mask writer at {output_path}")

    last_mask = None
    last_gray = None
    frame_idx = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            small = cv2.resize(frame, (work_w, work_h), interpolation=cv2.INTER_AREA)
            small_gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

            if last_mask is None or frame_idx % SEGMENTATION_INTERVAL == 0:
                person = _segment_frame_bgr(small)
            else:
                person = _warp_mask(last_mask, last_gray, small_gray)

            last_mask = person
            last_gray = small_gray

            full = cv2.resize(person, (src_w, src_h), interpolation=cv2.INTER_LINEAR)
            attenuated = (full.astype(np.float32) * protection_strength).clip(0, 255)
            graded_mask = (255.0 - attenuated).clip(0, 255).astype(np.uint8)

            writer.write(cv2.merge([graded_mask, graded_mask, graded_mask]))
            frame_idx += 1
    finally:
        cap.release()
        writer.release()

    if frame_idx == 0:
        Path(output_path).unlink(missing_ok=True)
        raise SegmentationError("No frames decoded from input video")

    return output_path
