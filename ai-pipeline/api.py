import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from services.analyzer import analyze_clip
from services.grader import grade_clip, GradingError
from utils.ffmpeg import probe

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ClipVibe AI Pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi"}
DOWNLOAD_TIMEOUT = 120  # seconds


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    signed_url: str
    clip_id: str = ""


class GradeRequest(BaseModel):
    signed_url: str
    filters: str


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

    Returns the path to the temp file. Caller owns cleanup.

    Raises:
        HTTPException: If download fails or the file extension is unsupported.
    """
    parsed = urlparse(signed_url)
    ext = Path(parsed.path).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                signed_url, timeout=DOWNLOAD_TIMEOUT, follow_redirects=True
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to download video: HTTP {e.response.status_code}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to download video: {e}"
        )

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(resp.content)
        return tmp.name


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
    """
    tmp_path = await _download_to_temp(body.signed_url)

    try:
        result = analyze_clip(tmp_path, clip_id=body.clip_id)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error analyzing clip")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.post("/probe", response_model=ProbeResponse)
async def probe_clip(
    file: UploadFile = File(...),
):
    """Extract video metadata (duration, resolution, fps, codec) via FFprobe."""
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        content = await file.read()
        tmp.write(content)

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
    """Apply FFmpeg color grading filters to a clip and return the graded file.

    Accepts a Supabase signed URL + FFmpeg filter string, downloads the video,
    applies the filters, and streams back the graded file.
    """
    if not body.filters or not body.filters.strip():
        raise HTTPException(status_code=400, detail="filters must not be empty")

    tmp_path = await _download_to_temp(body.signed_url)

    try:
        output_path = grade_clip(tmp_path, body.filters)
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
