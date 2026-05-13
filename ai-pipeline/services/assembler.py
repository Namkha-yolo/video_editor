"""Multi-clip assembly: per-mood pacing, xfade transitions, audio polish."""

from __future__ import annotations

import json
import logging
import shlex
import subprocess
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


class AssemblyError(Exception):
    pass


@dataclass(frozen=True)
class PacingProfile:
    speed: float
    transition: str
    transition_duration: float
    audio_highpass: int = 0
    audio_lowpass: int = 0


PACING: dict[str, PacingProfile] = {
    "nostalgic": PacingProfile(0.95, "fade", 0.7, audio_lowpass=9000),
    "cinematic": PacingProfile(1.00, "fade", 0.8),
    "hype":      PacingProfile(1.15, "fadewhite", 0.25, audio_highpass=100),
    "chill":     PacingProfile(0.90, "fade", 1.0, audio_lowpass=10000),
    "dreamy":    PacingProfile(0.85, "fadeblack", 1.5, audio_lowpass=8000),
    "energetic": PacingProfile(1.10, "slideleft", 0.3, audio_highpass=80),
}


@dataclass(frozen=True)
class ClipMeta:
    duration: float
    width: int
    height: int
    has_audio: bool


def get_pacing(mood: str) -> PacingProfile:
    if mood not in PACING:
        raise AssemblyError(f"unknown mood: {mood}")
    return PACING[mood]


def _probe_clip(path: str) -> ClipMeta:
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", "-show_format", path,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if out.returncode != 0:
        raise AssemblyError(f"ffprobe failed for {path}: {out.stderr.strip()}")
    data = json.loads(out.stdout)
    streams = data.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    if v is None:
        raise AssemblyError(f"no video stream in {path}")
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    duration = float(v.get("duration") or data.get("format", {}).get("duration") or 0.0)
    return ClipMeta(duration, int(v.get("width", 0)), int(v.get("height", 0)), has_audio)


def _video_chain(input_idx: int, label: str, speed: float, w: int, h: int, fps: int) -> str:
    base = (
        f"[{input_idx}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,"
        f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}"
    )
    if abs(speed - 1.0) > 1e-3:
        base += f",setpts={1.0 / speed:.6f}*PTS"
    return f"{base}[{label}]"


def _audio_chain(input_idx: int, label: str, speed: float, highpass: int, lowpass: int) -> str:
    parts: list[str] = []
    if abs(speed - 1.0) > 1e-3:
        parts.append(f"atempo={speed:.4f}")
    if highpass > 0:
        parts.append(f"highpass=f={highpass}")
    if lowpass > 0:
        parts.append(f"lowpass=f={lowpass}")
    parts.append("loudnorm=I=-16:TP=-1.5:LRA=11")
    return f"[{input_idx}:a]" + ",".join(parts) + f"[{label}]"


def build_filter_graph(
    metas: list[ClipMeta],
    audio_input_indices: list[int],
    pacing: PacingProfile,
    target_w: int,
    target_h: int,
    target_fps: int,
) -> tuple[str, float]:
    n = len(metas)
    speed = pacing.speed
    paced_durations = [m.duration / speed for m in metas]
    shortest = min(paced_durations)
    fade = min(pacing.transition_duration, max(0.1, shortest * 0.4))

    chains: list[str] = []
    for i in range(n):
        chains.append(_video_chain(i, f"v{i}", speed, target_w, target_h, target_fps))
        chains.append(
            _audio_chain(audio_input_indices[i], f"a{i}", speed, pacing.audio_highpass, pacing.audio_lowpass)
        )

    if n == 1:
        chains.append("[v0]null[v]")
        chains.append("[a0]anull[a]")
        return ";".join(chains), paced_durations[0]

    v_prev = "v0"
    offset = 0.0
    for i in range(1, n):
        offset += paced_durations[i - 1] - fade
        out_label = "v" if i == n - 1 else f"xv{i}"
        chains.append(
            f"[{v_prev}][v{i}]xfade=transition={pacing.transition}"
            f":duration={fade:.3f}:offset={offset:.3f}[{out_label}]"
        )
        v_prev = out_label

    a_prev = "a0"
    for i in range(1, n):
        out_label = "a" if i == n - 1 else f"xa{i}"
        chains.append(f"[{a_prev}][a{i}]acrossfade=d={fade:.3f}[{out_label}]")
        a_prev = out_label

    total = sum(paced_durations) - fade * (n - 1)
    return ";".join(chains), total


def assemble(
    input_paths: list[str],
    output_path: str,
    mood: str,
    *,
    target_resolution: tuple[int, int] | None = None,
    target_fps: int = 30,
    timeout: int = 900,
    music_path: str | None = None,
    music_volume: float = 0.22,
    clip_audio_volume: float = 0.9,
) -> str:
    if not input_paths:
        raise AssemblyError("no clips to assemble")
    pacing = get_pacing(mood)
    metas = [_probe_clip(p) for p in input_paths]

    if target_resolution is None:
        sizes = Counter((m.width, m.height) for m in metas if m.width and m.height)
        target_w, target_h = sizes.most_common(1)[0][0] if sizes else (1280, 720)
    else:
        target_w, target_h = target_resolution

    cmd: list[str] = ["ffmpeg", "-y"]
    audio_input_indices: list[int] = []
    input_idx = 0
    for path, meta in zip(input_paths, metas):
        cmd += ["-i", path]
        video_idx = input_idx
        input_idx += 1
        if meta.has_audio:
            audio_input_indices.append(video_idx)
        else:
            cmd += [
                "-f", "lavfi",
                "-t", f"{meta.duration:.3f}",
                "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            ]
            audio_input_indices.append(input_idx)
            input_idx += 1

    graph, total = build_filter_graph(metas, audio_input_indices, pacing, target_w, target_h, target_fps)

    final_audio_label = "[a]"
    if music_path:
        cmd += ["-stream_loop", "-1", "-i", music_path]
        music_idx = input_idx
        input_idx += 1
        graph += (
            f";[{music_idx}:a]volume={music_volume:.3f}[music_v]"
            f";[a]volume={clip_audio_volume:.3f}[clip_v]"
            f";[clip_v][music_v]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a_out]"
        )
        final_audio_label = "[a_out]"

    cmd += [
        "-filter_complex", graph,
        "-map", "[v]",
        "-map", final_audio_label,
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path,
    ]

    logger.info(
        "assembling %d clips mood=%s target=%dx%d@%d total=%.2fs music=%s",
        len(input_paths), mood, target_w, target_h, target_fps, total, bool(music_path),
    )
    logger.debug("ffmpeg cmd: %s", shlex.join(cmd))

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise AssemblyError(f"ffmpeg assembly timed out after {timeout}s")

    if result.returncode != 0:
        tail = (result.stderr or "").strip().splitlines()[-20:]
        raise AssemblyError("ffmpeg assembly failed:\n" + "\n".join(tail))

    out = Path(output_path)
    if not out.is_file() or out.stat().st_size == 0:
        out.unlink(missing_ok=True)
        raise AssemblyError("assembly produced missing or zero-byte output")

    return output_path
