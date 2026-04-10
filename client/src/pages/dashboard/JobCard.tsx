import type { DashboardJob } from "./types";
import { formatDateTime, shortJobId, STATUS_LABEL } from "./utils";

interface JobCardProps {
  job: DashboardJob;
  preview: string | null;
  onReRun: (job: DashboardJob) => void;
  onNavigate: (path: string) => void;
}

export function JobCard({ job, preview, onReRun, onNavigate }: JobCardProps) {
  const isComplete = job.status === "complete";
  const isInFlight = job.status === "queued" || job.status === "analyzing" || job.status === "grading";

  return (
    <div className="dashboard-row">
      <div className="dashboard-row-preview-wrap">
        {preview ? (
          <video src={preview} className="dashboard-row-preview" muted preload="metadata" playsInline />
        ) : (
          <div className="dashboard-row-preview dashboard-row-preview--empty">No preview</div>
        )}
      </div>

      <div className="dashboard-row-main">
        <div className="dashboard-row-top">
          <p className="dashboard-row-date">{formatDateTime(job.created_at)}</p>
          <span className={`status-badge status-badge--${job.status}`}>{STATUS_LABEL[job.status]}</span>
        </div>
        <p className="dashboard-row-meta">
          Job #{shortJobId(job.id)} | {job.clip_ids.length} clip{job.clip_ids.length !== 1 ? "s" : ""}
        </p>
        {job.error_message && <p className="dashboard-job-error">{job.error_message}</p>}
      </div>

      <div className="dashboard-actions dashboard-actions--row">
        <button
          type="button"
          className="dashboard-action dashboard-action--primary"
          onClick={() => onNavigate(isComplete ? `/export/${job.id}` : `/processing/${job.id}`)}
        >
          {isComplete ? "Re-download" : isInFlight ? "View Progress" : "View Details"}
        </button>
        <button
          type="button"
          className="dashboard-action dashboard-action--ghost"
          onClick={() => onReRun(job)}
        >
          Re-run Mood
        </button>
      </div>
    </div>
  );
}
