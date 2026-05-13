"""On-demand soundtrack generation via Replicate text-to-music models.

Per-mood prompt templates drive the model; generated tracks are returned
as local mp3 paths that the assembler can mix in. Failures bubble up as
GenerationError so callers can fall back to the curated library.
"""

from __future__ import annotations

import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)


class GenerationError(Exception):
    pass


@dataclass(frozen=True)
class MoodPrompt:
    prompt: str
    bpm_hint: int


MOOD_PROMPTS: dict[str, MoodPrompt] = {
    "nostalgic": MoodPrompt(
        prompt="warm acoustic guitar fingerpicking, soft piano chords, gentle strings, vintage 70s singer-songwriter instrumental, intimate, contemplative",
        bpm_hint=78,
    ),
    "cinematic": MoodPrompt(
        prompt="epic orchestral film score, sweeping strings and brass, slow dramatic build, Hans Zimmer style, instrumental",
        bpm_hint=70,
    ),
    "hype": MoodPrompt(
        prompt="high energy EDM festival anthem, punchy four-on-the-floor kick, big synth lead, rolling bassline, instrumental",
        bpm_hint=128,
    ),
    "chill": MoodPrompt(
        prompt="lo-fi hip hop beat, mellow jazzy electric piano, soft drums, warm bass, vinyl crackle, relaxed instrumental",
        bpm_hint=72,
    ),
    "dreamy": MoodPrompt(
        prompt="ethereal ambient soundscape, shimmering synth pads, slow attack, reverb-drenched, weightless, instrumental",
        bpm_hint=68,
    ),
    "energetic": MoodPrompt(
        prompt="upbeat indie pop instrumental, bright pluck synth melody, driving drum kit, bouncy bass, optimistic",
        bpm_hint=120,
    ),
}


DEFAULT_MODEL = os.environ.get(
    "REPLICATE_MUSIC_MODEL",
    "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
)
MIN_DURATION = 5
MAX_DURATION = 60
DEFAULT_DURATION = 30
DOWNLOAD_TIMEOUT_SEC = 120


def is_available() -> bool:
    return bool(os.environ.get("REPLICATE_API_TOKEN", "").strip())


def _replicate_module():
    try:
        import replicate  # noqa: WPS433 - dynamic import keeps the dep optional
    except ImportError as exc:
        raise GenerationError("replicate package not installed") from exc
    return replicate


def _extract_audio_bytes(output) -> bytes:
    """Replicate SDKs return either a file-like object, a URL string, or a list."""
    if hasattr(output, "read"):
        return output.read()
    if isinstance(output, (list, tuple)):
        if not output:
            raise GenerationError("replicate returned an empty output list")
        return _extract_audio_bytes(output[0])
    if isinstance(output, (str, bytes)):
        url = output if isinstance(output, str) else output.decode("utf-8", errors="ignore")
        try:
            response = httpx.get(url, timeout=DOWNLOAD_TIMEOUT_SEC, follow_redirects=True)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise GenerationError(f"failed to download generated audio: {exc}") from exc
        return response.content
    raise GenerationError(f"unexpected replicate output type: {type(output)!r}")


def generate_for_mood(
    mood: str,
    duration: int = DEFAULT_DURATION,
    prompt_override: str | None = None,
) -> Path:
    if mood not in MOOD_PROMPTS:
        raise GenerationError(f"unknown mood for generation: {mood}")
    if not is_available():
        raise GenerationError("REPLICATE_API_TOKEN is not set")

    duration = max(MIN_DURATION, min(MAX_DURATION, int(duration)))
    prompt = prompt_override or MOOD_PROMPTS[mood].prompt

    replicate = _replicate_module()
    logger.info("generating soundtrack mood=%s duration=%ds model=%s", mood, duration, DEFAULT_MODEL.split(":")[0])

    try:
        output = replicate.run(
            DEFAULT_MODEL,
            input={
                "prompt": prompt,
                "duration": duration,
                # stereo-large = text-to-music. The melody variants expect an
                # input_audio file and underperform in text-only mode.
                "model_version": "stereo-large",
                "output_format": "mp3",
                "normalization_strategy": "loudness",
                # Tighter sampling = cleaner output that follows the prompt.
                "classifier_free_guidance": 5,
                "temperature": 0.85,
                "top_k": 250,
            },
        )
    except Exception as exc:
        raise GenerationError(f"replicate run failed: {exc}") from exc

    data = _extract_audio_bytes(output)
    if len(data) < 4096:
        raise GenerationError(f"generated audio is suspiciously small ({len(data)} bytes)")

    out_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, prefix="clipvibe_gen_")
    out_path = Path(out_tmp.name)
    out_tmp.close()
    out_path.write_bytes(data)

    logger.info("generated track saved %s (%d bytes)", out_path, out_path.stat().st_size)
    return out_path
