import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";
import type { Clip, JobStatus, Mood } from "@clipvibe/shared";
import { MOODS, formatMood } from "./dashboard/utils";
import "./ExportPage.css";

interface JobClip {
  id: string;
  file_name: string;
  duration: number | null;
  original_url: string | null;
  output_url: string | null;
}

interface JobDetail {
  id: string;
  status: JobStatus;
  mood: string;
  clip_ids: string[];
  error_message: string | null;
  clips: JobClip[];
}

function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function gradedFileName(clip: JobClip, mood: string) {
  const dotIndex = clip.file_name.lastIndexOf(".");
  const base = dotIndex > 0 ? clip.file_name.slice(0, dotIndex) : clip.file_name;
  const ext = dotIndex > 0 ? clip.file_name.slice(dotIndex) : ".mp4";
  return `${base}-${mood}${ext}`;
}

export default function ExportPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const setClips = useProjectStore((s) => s.setClips);
  const setSelectedMood = useProjectStore((s) => s.setSelectedMood);

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<JobDetail>(`/jobs/${jobId}`);
        if (cancelled) return;
        setJob(data);
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.response?.status === 404
            ? "Job not found."
            : err?.response?.data?.error || "Failed to load job."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const downloadableClips = useMemo(
    () => (job?.clips ?? []).filter((c) => Boolean(c.output_url)),
    [job]
  );

  async function handleDownloadAll() {
    if (!job || downloadableClips.length === 0) return;
    setDownloadingAll(true);
    try {
      for (const clip of downloadableClips) {
        if (!clip.output_url) continue;
        triggerDownload(clip.output_url, gradedFileName(clip, job.mood));
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } finally {
      setDownloadingAll(false);
    }
  }

  async function handleRerun() {
    if (!job) return;
    try {
      const { data } = await api.get<{ clips: Clip[] }>("/clips");
      const clipsById = new Map((data.clips || []).map((clip) => [clip.id, clip]));
      const matched = job.clip_ids
        .map((id) => clipsById.get(id))
        .filter((clip): clip is Clip => Boolean(clip));

      if (matched.length === 0) {
        setError("Original clips are no longer available. Upload them again to re-run.");
        return;
      }

      setClips(matched);
      if (MOODS.includes(job.mood as Mood)) {
        setSelectedMood(job.mood as Mood);
      }
      navigate("/mood");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not load clips for re-run.");
    }
  }

  if (loading) {
    return (
      <section className="export-page">
        <p className="export-message">Loading job…</p>
      </section>
    );
  }

  if (error || !job) {
    return (
      <section className="export-page">
        <h1 className="export-title">Export unavailable</h1>
        <p className="export-error">{error || "Job not found."}</p>
        <div className="export-actions">
          <button className="export-btn" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </section>
    );
  }

  if (job.status !== "complete") {
    return (
      <section className="export-page">
        <h1 className="export-title">Job not ready</h1>
        <p className="export-message">
          Status: <strong>{job.status}</strong>
          {job.error_message ? ` — ${job.error_message}` : ""}
        </p>
        <div className="export-actions">
          {job.status !== "failed" ? (
            <button className="export-btn" onClick={() => navigate(`/processing/${job.id}`)}>
              View Progress
            </button>
          ) : null}
          <button
            className="export-btn export-btn--secondary"
            onClick={() => navigate("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="export-page">
      <header className="export-header">
        <h1 className="export-title">Your {formatMood(job.mood)} clips</h1>
        <p className="export-subtitle">
          {downloadableClips.length} of {job.clips.length} clip
          {job.clips.length === 1 ? "" : "s"} ready to download
        </p>
      </header>

      <div className="export-toolbar">
        <button
          type="button"
          className="export-btn"
          onClick={handleDownloadAll}
          disabled={downloadableClips.length === 0 || downloadingAll}
        >
          {downloadingAll ? "Downloading…" : "Download All"}
        </button>
        <button type="button" className="export-btn export-btn--secondary" onClick={handleRerun}>
          Re-run with different mood
        </button>
        <button
          type="button"
          className="export-btn export-btn--ghost"
          onClick={() => navigate("/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>

      <div className="export-clip-list">
        {job.clips.map((clip, index) => (
          <article className="export-clip-card" key={clip.id}>
            <div className="export-clip-header">
              <div>
                <h2 className="export-clip-title">{clip.file_name}</h2>
                <p className="export-clip-meta">
                  Clip {index + 1} of {job.clips.length}
                </p>
              </div>
              <button
                type="button"
                className="export-btn"
                disabled={!clip.output_url}
                onClick={() =>
                  clip.output_url &&
                  triggerDownload(clip.output_url, gradedFileName(clip, job.mood))
                }
              >
                Download
              </button>
            </div>

            <div className="export-preview-row">
              <figure className="export-preview">
                <figcaption className="export-preview-label">Original</figcaption>
                {clip.original_url ? (
                  <video
                    className="export-video"
                    src={clip.original_url}
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <div className="export-preview-missing">Unavailable</div>
                )}
              </figure>
              <figure className="export-preview">
                <figcaption className="export-preview-label">Graded</figcaption>
                {clip.output_url ? (
                  <video
                    className="export-video"
                    src={clip.output_url}
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <div className="export-preview-missing">Unavailable</div>
                )}
              </figure>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
