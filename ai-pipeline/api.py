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
from services.assembler import PACING, AssemblyError, assemble
from services.custom_mood import RecipeError, build_cube_string, recipe_from_dict
from services.grader import ExposureAdjustment, grade_clip, GradingError
from services.mood_grades import VALID_MOODS
from services.music_generator import GenerationError, generate_for_mood, is_available as generation_available
from services.scene_detector import SceneDetectionError, primary_scene
from services.sequencer import ClipFeatures, order_clips
from services.soundtrack import pick_track_for_mood
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


class CustomRuntime(BaseModel):
    vignette: float = 0.3
    grain: int = 5
    halation: float = 0.0
    person_protection: float = 0.4


class GradeRequest(BaseModel):
    signed_url: str
    mood: str
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0
    gain_r: float = 1.0
    gain_g: float = 1.0
    gain_b: float = 1.0
    enable_masking: bool = True
    custom_lut_url: str | None = None
    custom_runtime: CustomRuntime | None = None


class CustomMoodBuildRequest(BaseModel):
    recipe: dict
    size: int = 33


class ClipAnalysisInput(BaseModel):
    brightness: float
    contrast: float
    color_temperature: int


class CustomPacingInput(BaseModel):
    speed: float | None = None
    transition: str | None = None
    transition_duration: float | None = None
    audio_highpass: int | None = None
    audio_lowpass: int | None = None


class AssembleRequest(BaseModel):
    signed_urls: list[str]
    mood: str
    trim_to_primary_scene: bool = False
    scene_threshold: float = 27.0
    target_fps: int = 30
    auto_order: bool = False
    clip_analyses: list[ClipAnalysisInput] | None = None
    with_soundtrack: bool = False
    generate_soundtrack: bool = False
    soundtrack_duration: int = 30
    music_prompt: str | None = None
    custom_pacing: CustomPacingInput | None = None
    clip_volume: float | None = None
    music_volume: float | None = None


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


async def _download_lut_to_temp(signed_url: str) -> Path:
    """Download a .cube file from a signed URL to a temp path.

    LUTs are plain-text and small (a 33-cube at 6dp is ~2 MB max), so we
    can buffer the whole thing into memory before writing.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(signed_url, timeout=60, follow_redirects=True)
            response.raise_for_status()
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(status_code=400, detail=f"Failed to download custom LUT: {exc}")

    data = response.content
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="custom LUT exceeds 8 MB limit")
    if b"LUT_3D_SIZE" not in data[:512]:
        raise HTTPException(status_code=400, detail="downloaded file is not a valid .cube LUT")

    tmp = tempfile.NamedTemporaryFile(suffix=".cube", delete=False, prefix="clipvibe_custom_")
    tmp_path = Path(tmp.name)
    tmp.close()
    tmp_path.write_bytes(data)
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


def _trim_segment(input_path: str, start: float, end: float) -> str:
    """Re-encode a [start, end] segment of input_path to a new temp mp4."""
    import subprocess as _subprocess

    out = tempfile.NamedTemporaryFile(suffix="_trim.mp4", delete=False, prefix="clipvibe_")
    out_path = out.name
    out.close()
    duration = max(0.1, end - start)
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start:.3f}",
        "-i", input_path,
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        out_path,
    ]
    result = _subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        Path(out_path).unlink(missing_ok=True)
        raise RuntimeError(f"trim failed: {result.stderr.strip()[-200:]}")
    return out_path


@app.post("/assemble")
async def assemble_endpoint(body: AssembleRequest):
    if body.mood not in PACING:
        raise HTTPException(status_code=400, detail=f"unknown mood: {body.mood}")
    if not body.signed_urls:
        raise HTTPException(status_code=400, detail="no clips provided")
    if len(body.signed_urls) > 20:
        raise HTTPException(status_code=400, detail="too many clips (max 20)")

    signed_urls = list(body.signed_urls)
    analyses = body.clip_analyses
    if body.auto_order and analyses is not None and len(analyses) == len(signed_urls):
        features = [
            ClipFeatures(
                brightness=a.brightness,
                contrast=a.contrast,
                color_temperature=a.color_temperature,
            )
            for a in analyses
        ]
        order = order_clips(features, body.mood)
        signed_urls = [signed_urls[i] for i in order]
        logger.info("auto-ordered clips for mood=%s order=%s", body.mood, order)

    downloaded: list[str] = []
    trimmed: list[str] = []
    try:
        for url in signed_urls:
            downloaded.append(await _download_to_temp(url))

        if body.trim_to_primary_scene:
            for src in downloaded:
                try:
                    scene = primary_scene(src, threshold=body.scene_threshold)
                except SceneDetectionError as exc:
                    logger.warning("scene detection failed (%s); keeping full clip", exc)
                    scene = None
                if scene is None or (scene[1] - scene[0]) < 0.5:
                    trimmed.append(src)
                else:
                    trimmed.append(_trim_segment(src, scene[0], scene[1]))
            input_paths = trimmed
        else:
            input_paths = downloaded

        out_tmp = tempfile.NamedTemporaryFile(suffix="_assembled.mp4", delete=False, prefix="clipvibe_")
        output_path = out_tmp.name
        out_tmp.close()

        music_path: str | None = None
        generated_path: Path | None = None
        if body.generate_soundtrack:
            try:
                user_prompt = (body.music_prompt or "").strip() or None
                generated_path = generate_for_mood(
                    body.mood,
                    duration=body.soundtrack_duration,
                    prompt_override=user_prompt,
                )
                music_path = str(generated_path)
                logger.info(
                    "soundtrack: mood=%s source=generated path=%s prompt_override=%s",
                    body.mood, generated_path, bool(user_prompt),
                )
            except GenerationError as exc:
                logger.warning("soundtrack generation failed (%s); falling back to library", exc)

        if music_path is None and body.with_soundtrack:
            track = pick_track_for_mood(body.mood)
            if track is not None:
                music_path = str(track.path)
                logger.info("soundtrack: mood=%s source=library track=%s kind=%s", body.mood, track.path.name, track.kind)

        pacing_override = body.custom_pacing.model_dump(exclude_none=True) if body.custom_pacing else None
        assemble_kwargs: dict = {
            "target_fps": body.target_fps,
            "music_path": music_path,
            "pacing_override": pacing_override,
        }
        if body.clip_volume is not None:
            assemble_kwargs["clip_audio_volume"] = max(0.0, min(1.5, float(body.clip_volume)))
        if body.music_volume is not None:
            assemble_kwargs["music_volume"] = max(0.0, min(1.5, float(body.music_volume)))

        try:
            assemble(input_paths, output_path, body.mood, **assemble_kwargs)
        finally:
            if generated_path is not None:
                generated_path.unlink(missing_ok=True)

        cleanup = BackgroundTask(Path(output_path).unlink, missing_ok=True)
        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename="assembled.mp4",
            background=cleanup,
        )
    except AssemblyError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("unexpected error during assembly")
        raise HTTPException(status_code=500, detail=f"assembly failed: {exc}")
    finally:
        for p in downloaded:
            Path(p).unlink(missing_ok=True)
        for p in trimmed:
            if p not in downloaded:
                Path(p).unlink(missing_ok=True)


@app.post("/custom-mood/build")
async def build_custom_mood(body: CustomMoodBuildRequest):
    """Turn a structured LUT recipe into an Adobe Cube 1.0 .cube file.

    Caller (typically the server, after generating a recipe from a user
    prompt) sends a recipe dict matching the schema in
    services/custom_mood.py. We clamp out-of-range values, build the
    procedural LUT, and return the cube contents plus the resolved
    runtime config.
    """
    try:
        recipe = recipe_from_dict(body.recipe)
        cube = build_cube_string(recipe, size=max(9, min(33, int(body.size))))
    except RecipeError as exc:
        raise HTTPException(status_code=400, detail=f"invalid recipe: {exc}")
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"invalid recipe value: {exc}")
    except Exception as exc:
        logger.exception("custom-mood build failed")
        raise HTTPException(status_code=500, detail=f"build failed: {exc}")

    return {
        "name": recipe.name,
        "title": recipe.title,
        "description": recipe.description,
        "runtime": {
            "vignette": recipe.vignette,
            "grain": recipe.grain,
            "halation": recipe.halation,
            "person_protection": recipe.person_protection,
        },
        "pacing": {
            "speed": recipe.pacing.speed,
            "transition": recipe.pacing.transition,
            "transition_duration": recipe.pacing.transition_duration,
            "audio_highpass": recipe.pacing.audio_highpass,
            "audio_lowpass": recipe.pacing.audio_lowpass,
        },
        "cube": cube,
    }


@app.post("/grade")
async def grade(body: GradeRequest):
    if not body.custom_lut_url and body.mood not in VALID_MOODS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown mood: {body.mood!r}. Valid: {VALID_MOODS}",
        )

    exposure = ExposureAdjustment(
        brightness=body.brightness,
        contrast=body.contrast,
        saturation=body.saturation,
        gain_r=body.gain_r,
        gain_g=body.gain_g,
        gain_b=body.gain_b,
    )

    tmp_path = await _download_to_temp(body.signed_url)
    custom_lut_temp: Path | None = None

    try:
        if body.custom_lut_url:
            custom_lut_temp = await _download_lut_to_temp(body.custom_lut_url)

        runtime_overrides = body.custom_runtime.model_dump() if body.custom_runtime else None

        output_path = grade_clip(
            tmp_path,
            body.mood,
            exposure=exposure,
            enable_masking=body.enable_masking,
            custom_lut_path=str(custom_lut_temp) if custom_lut_temp else None,
            runtime_overrides=runtime_overrides,
        )
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
        if custom_lut_temp is not None:
            custom_lut_temp.unlink(missing_ok=True)
