import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import api from "@/lib/api";
import "./ProcessingPage.css";

type Status = "queued" | "analyzing" | "grading" | "complete" | "failed";

interface ProgressEvent {
  job_id: string;
  status: Status;
  message?: string;
  clip_id?: string;
  clip_index?: number;
  total_clips?: number;
  error?: string;
  output_paths?: string[];
}

interface JobStateResponse {
  id: string;
  status: Status;
  error_message: string | null;
  clip_ids: string[];
}

const STATUS_LABEL: Record<Status, string> = {
  queued: "Queued",
  analyzing: "Analyzing clips",
  grading: "Grading clips",
  complete: "Complete",
  failed: "Failed",
};

function computeProgress(event: ProgressEvent): number {
  const total = Math.max(1, event.total_clips ?? 1);
  const index = event.clip_index ?? 0;
  switch (event.status) {
    case "queued":
      return 0;
    case "analyzing":
      return Math.min(50, Math.round(5 + (index / total) * 45));
    case "grading":
      return Math.min(99, Math.round(50 + (index / total) * 50));
    case "complete":
      return 100;
    case "failed":
      return 0;
  }
}

export default function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let socket: Socket | null = null;

    async function init() {
      try {
        const { data } = await api.get<JobStateResponse>(`/jobs/${jobId}`);
        if (cancelled) return;

        if (data.status === "complete") {
          navigate(`/export/${jobId}`, { replace: true });
          return;
        }

        setProgress({
          job_id: data.id,
          status: data.status,
          total_clips: data.clip_ids.length,
          error: data.error_message ?? undefined,
        });

        socket = io({ path: "/socket.io" });
        socket.on("connect", () => {
          socket?.emit("subscribe", jobId);
        });
        socket.on("progress", (event: ProgressEvent) => {
          if (cancelled || event.job_id !== jobId) return;
          setProgress(event);
          if (event.status === "complete") {
            navigate(`/export/${jobId}`, { replace: true });
          }
        });
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.error || "Failed to load job.");
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit("unsubscribe", jobId);
        socket.disconnect();
      }
    };
  }, [jobId, navigate]);

  const percent = useMemo(() => (progress ? computeProgress(progress) : 0), [progress]);

  if (error) {
    return (
      <section className="processing-page">
        <h1 className="processing-title">Couldn't load this job</h1>
        <p className="processing-error">{error}</p>
        <button className="processing-btn" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </button>
      </section>
    );
  }

  if (!progress) {
    return (
      <section className="processing-page">
        <p className="processing-message">Loading job…</p>
      </section>
    );
  }

  if (progress.status === "failed") {
    return (
      <section className="processing-page">
        <h1 className="processing-title">Grading failed</h1>
        <p className="processing-error">
          {progress.error || progress.message || "Something went wrong while grading."}
        </p>
        <div className="processing-actions">
          <button className="processing-btn" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </section>
    );
  }

  const clipLabel =
    progress.clip_index && progress.total_clips
      ? `Clip ${progress.clip_index} of ${progress.total_clips}`
      : progress.total_clips
        ? `${progress.total_clips} clip${progress.total_clips === 1 ? "" : "s"}`
        : null;

  return (
    <section className="processing-page">
      <h1 className="processing-title">Processing your clips</h1>
      <p className="processing-status">{STATUS_LABEL[progress.status]}</p>
      {clipLabel ? <p className="processing-clip-label">{clipLabel}</p> : null}

      <div className="processing-progress-track" aria-label="Job progress">
        <div className="processing-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="processing-percent">{percent}%</p>

      {progress.message ? <p className="processing-message">{progress.message}</p> : null}
    </section>
  );
}
