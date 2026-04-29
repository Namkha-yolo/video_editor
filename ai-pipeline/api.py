import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from services.analyzer import analyze_clip
from services.grader import ExposureAdjustment, grade_clip, GradingError
from services.mood_grades import VALID_MOODS
from utils.ffmpeg import probe

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ClipVibe AI Pipeline")

import os as _os

_cors_origins = [
    origin.strip()
    for origin in (_os.environ.get("CORS_ALLOWED_ORIGINS") or "").split(",")
    if origin.strip()
]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi"}
DOWNLOAD_TIMEOUT = 300  # seconds — generous for large files
MAX_DOWNLOAD_SIZE = 500 * 1024 * 1024  # 500 MB


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    signed_url: str
    clip_id: str = ""


class ProbeRequest(BaseModel):
    signed_url: str


class GradeRequest(BaseModel):
    signed_url: str
    mood: str
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class ClipAnalysisResponse(BaseModel):
    clip_id: str
    brightness: float
    contrast: float
    dominant_colors: list[str]
    color_temperature: int


class ProbeResponse(BaseModel):
    duration: float
    width: int
    height: int
    fps: float
    codec: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _download_to_temp(signed_url: str) -> str:
    """Download a video from a signed URL to a temp file.

    Streams the download to handle large files without excessive memory use.
    Enforces a MAX_DOWNLOAD_SIZE limit.

    Returns the path to the temp file. Caller owns cleanup.

    Raises:
        HTTPException: If download fails, file is too large, or extension is unsupported.
    """
    parsed = urlparse(signed_url)
    ext = Path(parsed.path).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    tmp_path = None
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "GET", signed_url, timeout=DOWNLOAD_TIMEOUT, follow_redirects=True
            ) as resp:
                resp.raise_for_status()

                # Check Content-Length header if available
                content_length = resp.headers.get("content-length")
                if content_length and int(content_length) > MAX_DOWNLOAD_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"File too large ({int(content_length)} bytes). Max: {MAX_DOWNLOAD_SIZE} bytes",
                    )

                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                    tmp_path = tmp.name
                    downloaded = 0
                    async for chunk in resp.aiter_bytes(chunk_size=1024 * 1024):
                        downloaded += len(chunk)
                        if downloaded > MAX_DOWNLOAD_SIZE:
                            raise HTTPException(
                                status_code=400,
                                detail=f"File too large (>{MAX_DOWNLOAD_SIZE} bytes). Download aborted.",
                            )
                        tmp.write(chunk)

    except httpx.HTTPStatusError as e:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to download video: HTTP {e.response.status_code}",
        )
    except httpx.RequestError as e:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
        raise HTTPException(
            status_code=400, detail=f"Failed to download video: {e}"
        )
    except HTTPException:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
        raise

    return tmp_path


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=ClipAnalysisResponse)
async def analyze(body: AnalyzeRequest):
    """Analyze a video clip's visual properties (brightness, colors, contrast).

    Accepts a Supabase signed URL, downloads the video, and returns a
    ClipAnalysis with brightness, contrast, dominant colors, and color
    temperature.

    Validates the video file before processing (corrupt, empty, too long).
    """
    tmp_path = await _download_to_temp(body.signed_url)

    try:
        result = analyze_clip(tmp_path, clip_id=body.clip_id)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        # Covers: corrupt file, no video stream, too long, no frames extracted
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error analyzing clip")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.post("/probe", response_model=ProbeResponse)
async def probe_clip(body: ProbeRequest):
    """Extract video metadata (duration, resolution, fps, codec) via FFprobe."""
    tmp_path = await _download_to_temp(body.signed_url)

    try:
        metadata = probe(tmp_path)
        return metadata
    except (FileNotFoundError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error probing clip")
        raise HTTPException(status_code=500, detail=f"Probe failed: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.post("/grade")
async def grade(body: GradeRequest):
    if body.mood not in VALID_MOODS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown mood: {body.mood!r}. Valid: {VALID_MOODS}",
        )

    exposure = ExposureAdjustment(
        brightness=body.brightness,
        contrast=body.contrast,
        saturation=body.saturation,
    )

    tmp_path = await _download_to_temp(body.signed_url)

    try:
        output_path = grade_clip(tmp_path, body.mood, exposure=exposure)
        cleanup = BackgroundTask(Path(output_path).unlink, missing_ok=True)
        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename="graded_output.mp4",
            background=cleanup,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except GradingError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error grading clip")
        raise HTTPException(status_code=500, detail=f"Grading failed: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)
