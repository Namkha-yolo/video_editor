import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import api from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";
import type { Clip, JobStatus } from "@clipvibe/shared";
import "./ProcessingPage.css";

interface JobDetailClip {
  id: string;
  file_name: string;
  duration: number;
  original_url: string | null;
  output_url: string | null;
}

interface JobDetailResponse {
  id: string;
  mood: string;
  status: JobStatus;
  clip_ids: string[];
  created_at: string;
  updated_at: string;
  error_message?: string | null;
  clips: JobDetailClip[];
}

interface JobProgressEvent {
  job_id: string;
  status: JobStatus;
  message?: string;
  clip_id?: string;
  clip_index?: number;
  total_clips?: number;
  output_paths?: string[];
  error?: string;
}

interface DisplayClip {
  id: string;
  title: string;
  progress: number;
  status: string;
}

const AUTO_REDIRECT_DELAY_MS = 1200;

function dedupeClips(clips: Clip[]) {
  return Array.from(new Map(clips.map((clip) => [clip.id, clip])).values());
}

function titleCaseStatus(status: JobStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "analyzing":
      return "Analyzing";
    case "grading":
      return "Grading";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function buildFallbackClips(clips: Clip[]): JobDetailClip[] {
  return dedupeClips(clips).map((clip) => ({
    id: clip.id,
    file_name: clip.file_name || "Untitled clip",
    duration: clip.duration,
    original_url: null,
    output_url: null,
  }));
}

function getCurrentClipIndex(progressEvent: JobProgressEvent | null) {
  return Math.max(0, (progressEvent?.clip_index ?? 1) - 1);
}

function deriveClipState(
  index: number,
  status: JobStatus,
  progressEvent: JobProgressEvent | null,
) {
  const currentIndex = getCurrentClipIndex(progressEvent);

  switch (status) {
    case "queued":
      return { progress: 0, status: "Queued" };
    case "analyzing":
      if (index < currentIndex) return { progress: 50, status: "Analyzed" };
      if (index === currentIndex) return { progress: 25, status: "Analyzing" };
      return { progress: 0, status: "Queued" };
    case "grading":
      if (index < currentIndex) return { progress: 100, status: "Graded" };
      if (index === currentIndex) return { progress: 75, status: "Grading" };
      return { progress: 50, status: "Ready to grade" };
    case "complete":
      return { progress: 100, status: "Complete" };
    case "failed":
      if (progressEvent?.status === "grading") {
        if (index < currentIndex) return { progress: 100, status: "Graded" };
        if (index === currentIndex) return { progress: 75, status: "Failed" };
        return { progress: 50, status: "Ready to grade" };
      }
      if (progressEvent?.status === "analyzing") {
        if (index < currentIndex) return { progress: 50, status: "Analyzed" };
        if (index === currentIndex) return { progress: 25, status: "Failed" };
        return { progress: 0, status: "Queued" };
      }
      return { progress: 0, status: "Failed" };
    default:
      return { progress: 0, status: "Queued" };
  }
}

function buildStatusMessage(
  status: JobStatus,
  clipCount: number,
  progressEvent: JobProgressEvent | null,
  errorMessage: string | null,
) {
  if (errorMessage) return errorMessage;
  if (progressEvent?.message) return progressEvent.message;

  switch (status) {
    case "queued":
      return "Your grading job is queued and waiting to start.";
    case "analyzing":
      return `Analyzing ${clipCount} clip${clipCount === 1 ? "" : "s"} before grading.`;
    case "grading":
      return `Applying the selected mood to ${clipCount} clip${clipCount === 1 ? "" : "s"}.`;
    case "complete":
      return "All clips are graded. Redirecting to export.";
    case "failed":
      return "The grading job failed before finishing.";
    default:
      return "Preparing your grading job.";
  }
}

export default function ProcessingPage() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const storedClips = useProjectStore((s) => s.clips);

  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [progressEvent, setProgressEvent] = useState<JobProgressEvent | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    if (!jobId) {
      setError("Missing job id.");
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get<JobDetailResponse>(`/jobs/${jobId}`);
      setJob(data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load job progress.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    if (!jobId) return;

    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      socket.emit("subscribe", jobId);
    });

    socket.on("progress", (event: JobProgressEvent) => {
      if (event.job_id !== jobId) return;

      setProgressEvent(event);
      setJob((current) =>
        current
          ? {
              ...current,
              status: event.status,
              error_message: event.error || current.error_message || null,
            }
          : current,
      );

      if (event.status === "complete" || event.status === "failed") {
        void loadJob();
      }
    });

    return () => {
      socket.emit("unsubscribe", jobId);
      socket.disconnect();
    };
  }, [jobId, loadJob]);

  const fallbackClips = useMemo(
    () => buildFallbackClips(storedClips),
    [storedClips],
  );
  const clips = job?.clips.length ? job.clips : fallbackClips;
  const jobStatus = job?.status ?? progressEvent?.status ?? "queued";
  const errorMessage =
    error || job?.error_message || progressEvent?.error || null;

  const clipItems = useMemo<DisplayClip[]>(
    () =>
      clips.map((clip, index) => {
        const derived = deriveClipState(index, jobStatus, progressEvent);
        return {
          id: clip.id,
          title: clip.file_name || `Clip ${index + 1}`,
          progress: derived.progress,
          status: derived.status,
        };
      }),
    [clips, jobStatus, progressEvent],
  );

  const overallProgress =
    clipItems.length > 0
      ? Math.round(
          clipItems.reduce((total, clip) => total + clip.progress, 0) /
            clipItems.length,
        )
      : 0;
  const completedClips = clipItems.filter(
    (clip) => clip.progress >= 100,
  ).length;
  const statusMessage = buildStatusMessage(
    jobStatus,
    clipItems.length,
    progressEvent,
    errorMessage,
  );

  useEffect(() => {
    if (!jobId || jobStatus !== "complete") return;

    const timeoutId = window.setTimeout(() => {
      navigate(`/export/${jobId}`, { replace: true });
    }, AUTO_REDIRECT_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [jobId, jobStatus, navigate]);

  if (!jobId) {
    return (
      <section className="processing-page">
        <div className="processing-card">
          <h1 className="processing-card__title">Missing job</h1>
          <p className="processing-card__subtitle">
            Open this page from the mood flow so a grading job can be tracked.
          </p>
          <div className="processing-actions">
            <button
              type="button"
              className="processing-action processing-action--primary"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="processing-page">
        <div className="processing-card processing-overview">
          <p className="processing-overview__eyebrow">Loading</p>
          <h1 className="processing-overview__value">Preparing job...</h1>
        </div>
      </section>
    );
  }

  return (
    <section className="processing-page">
      <div className="processing-page__grid">
        <div className="processing-page__column">
          <div className="processing-card processing-overview">
            <div className="processing-overview__header">
              <div>
                <p className="processing-overview__eyebrow">Overall progress</p>
                <h2
                  className={`processing-overview__value${
                    jobStatus === "failed"
                      ? " processing-overview__value--failed"
                      : ""
                  }`}
                >
                  {jobStatus === "failed"
                    ? titleCaseStatus(jobStatus)
                    : `${overallProgress}%`}
                </h2>
              </div>
              <div className="processing-overview__meta">
                <span>
                  {completedClips} of {clipItems.length} clips complete
                </span>
              </div>
            </div>

            <div className="processing-overview__progress">
              <div
                className={`processing-overview__progress-bar processing-overview__progress-bar--${jobStatus}`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          <div className="processing-card">
            <div className="processing-card__header">
              <div>
                <h2 className="processing-card__title">Clip queue</h2>
                <p className="processing-card__subtitle">
                  Live progress updates come from the active grading job.
                </p>
              </div>
            </div>

            {clipItems.length === 0 ? (
              <p className="processing-card__subtitle">
                No clips are attached to this job yet.
              </p>
            ) : (
              <div className="processing-clip-list">
                {clipItems.map((clip) => (
                  <article key={clip.id} className="processing-clip-card">
                    <div className="processing-clip-card__header">
                      <div className="processing-clip-card__meta">
                        <p className="processing-clip-card__title">
                          {clip.title}
                        </p>
                      </div>
                      <span className="processing-clip-card__status">
                        {clip.status}
                      </span>
                    </div>

                    <div className="processing-clip-card__progress">
                      <div
                        className={`processing-clip-card__progress-bar processing-clip-card__progress-bar--${jobStatus}`}
                        style={{ width: `${clip.progress}%` }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="processing-page__column">
          <div className="processing-card">
            <div className="processing-card__header">
              <div>
                <h2 className="processing-card__title">Job status</h2>
                <p className="processing-card__subtitle">
                  Mood: {job?.mood ?? "Unknown"}
                </p>
              </div>
            </div>

            <div className="processing-status-stack">
              <div
                className={`processing-status-badge processing-status-badge--${jobStatus}`}
              >
                {titleCaseStatus(jobStatus)}
              </div>
              <p className="processing-status-message">{statusMessage}</p>
            </div>

            <div className="processing-actions">
              {jobStatus === "complete" ? (
                <button
                  type="button"
                  className="processing-action processing-action--primary"
                  onClick={() => navigate(`/export/${jobId}`)}
                >
                  Open Export
                </button>
              ) : (
                <button
                  type="button"
                  className="processing-action processing-action--secondary"
                  onClick={() => void loadJob()}
                >
                  Refresh Status
                </button>
              )}

              <button
                type="button"
                className="processing-action processing-action--secondary"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
