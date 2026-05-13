import type { DashboardJob } from "./types";
import { formatDate, formatMood } from "./utils";
import { JobCard } from "./JobCard";

interface JobGroup {
  mood: string;
  jobs: DashboardJob[];
}

interface JobGroupCardProps {
  group: JobGroup;
  isExpanded: boolean;
  previewUrlsByJob: Record<string, string[]>;
  onToggleExpand: (mood: string) => void;
  onReRun: (job: DashboardJob) => void;
  onNavigate: (path: string) => void;
  onRedownload: (job: DashboardJob) => void;
  onDelete: (job: DashboardJob) => void;
  deletingJobId: string | null;
  downloadingJobId: string | null;
}

export function JobGroupCard({
  group,
  isExpanded,
  previewUrlsByJob,
  onToggleExpand,
  onReRun,
  onNavigate,
  onRedownload,
  onDelete,
  deletingJobId,
  downloadingJobId,
}: JobGroupCardProps) {
  const visibleJobs = isExpanded ? group.jobs : group.jobs.slice(0, 2);

  return (
    <article className="dashboard-group-card">
      <div className="dashboard-group-header">
        <div>
          <p className="dashboard-group-mood">{formatMood(group.mood)}</p>
          <p className="dashboard-group-meta">
            {group.jobs.length} run{group.jobs.length !== 1 ? "s" : ""} | last
            on {formatDate(group.jobs[0].created_at)}
          </p>
        </div>
        {group.jobs.length > 2 && (
          <button
            type="button"
            className="dashboard-group-toggle"
            onClick={() => onToggleExpand(group.mood)}
          >
            {isExpanded ? `Show less` : `Show all ${group.jobs.length} runs`}
          </button>
        )}
      </div>

      <div className="dashboard-group-list">
        {visibleJobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            preview={previewUrlsByJob[job.id]?.[0] || null}
            onReRun={onReRun}
            onNavigate={onNavigate}
            onRedownload={onRedownload}
            onDelete={onDelete}
            isDeleting={deletingJobId === job.id}
            isDownloading={downloadingJobId === job.id}
          />
        ))}
      </div>
    </article>
  );
}
