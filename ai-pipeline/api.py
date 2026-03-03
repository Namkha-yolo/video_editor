import logging
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=ClipAnalysisResponse)
async def analyze(
    file: UploadFile = File(...),
    clip_id: str = Form(""),
):
    """Analyze a video clip's visual properties (brightness, colors, contrast).

    Accepts a video file via multipart upload and returns a ClipAnalysis
    with brightness, contrast, dominant colors, and color temperature.
    """
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
        result = analyze_clip(tmp_path, clip_id=clip_id)
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
async def grade(
    file: UploadFile = File(...),
    filters: str = Form(...),
):
    """Apply FFmpeg color grading filters to a clip and return the graded file."""
    # --- validate extension ---
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # --- validate filters ---
    if not filters or not filters.strip():
        raise HTTPException(status_code=400, detail="filters must not be empty")

    # --- save upload to temp file ---
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        content = await file.read()
        tmp.write(content)

    try:
        output_path = grade_clip(tmp_path, filters)
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
