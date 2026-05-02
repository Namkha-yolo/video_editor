import type { DashboardJob } from "./types";
import { formatDateTime, shortJobId, STATUS_LABEL } from "./utils";

interface JobCardProps {
  job: DashboardJob;
  preview: string | null;
  onReRun: (job: DashboardJob) => void;
  onNavigate: (path: string) => void;
  onRedownload: (job: DashboardJob) => void;
  onDelete: (job: DashboardJob) => void;
  isDeleting: boolean;
  isDownloading: boolean;
}

export function JobCard({
  job,
  preview,
  onReRun,
  onNavigate,
  onRedownload,
  onDelete,
  isDeleting,
  isDownloading,
}: JobCardProps) {
  const isComplete = job.status === "complete";
  const isInFlight = job.status === "queued" || job.status === "analyzing" || job.status === "grading";
  const showErrorTooltip = job.status === "failed" && Boolean(job.error_message);

  return (
    <div className="dashboard-row">
      <div className="dashboard-row-preview-wrap">
        {preview ? (
          <video
            src={preview}
            className="dashboard-row-preview"
            muted
            preload="metadata"
            playsInline
            onMouseEnter={(e) => void (e.currentTarget as HTMLVideoElement).play()}
            onMouseLeave={(e) => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
          />
        ) : (
          <div className="dashboard-row-preview dashboard-row-preview--empty">No preview</div>
        )}
      </div>

      <div className="dashboard-row-main">
        <div className="dashboard-row-top">
          <div className="dashboard-row-top-meta">
            <p className="dashboard-row-date">{formatDateTime(job.created_at)}</p>
            <span className="status-badge-wrap">
              <span className={`status-badge status-badge--${job.status}`}>{STATUS_LABEL[job.status]}</span>
              {showErrorTooltip && <span className="status-badge-tooltip">{job.error_message}</span>}
            </span>
          </div>
          <button
            type="button"
            className="dashboard-delete-job-btn"
            onClick={() => onDelete(job)}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
        <p className="dashboard-row-meta">
          Job #{shortJobId(job.id)} | {job.clip_ids.length} clip{job.clip_ids.length !== 1 ? "s" : ""}
        </p>
        {job.error_message && !showErrorTooltip && (
          <p className="dashboard-job-error">{job.error_message}</p>
        )}
      </div>

      <div className="dashboard-actions dashboard-actions--row">
        <button
          type="button"
          className="dashboard-action dashboard-action--primary"
          onClick={() => (isComplete ? onRedownload(job) : onNavigate(`/processing/${job.id}`))}
          disabled={isComplete && isDownloading}
        >
          {isComplete ? (isDownloading ? "Downloading..." : "Re-download") : isInFlight ? "View Progress" : "View Details"}
        </button>
        {isComplete && (
          <button
            type="button"
            className="dashboard-action dashboard-action--ghost"
            onClick={() => onNavigate(`/export/${job.id}`)}
          >
            Compare
          </button>
        )}
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
