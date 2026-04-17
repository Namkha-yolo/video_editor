import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";
import type { Clip, Mood } from "@clipvibe/shared";
import { JobGroupCard } from "./JobGroupCard";
import { StatusFilters } from "./StatusFilters";
import { ClipsPanel } from "./ClipsPanel";
import type { DashboardJob, JobsResponse, ClipsResponse, JobDetailResponse, StatusFilter } from "./types";
import { MOODS } from "./utils";
import "./DashboardPage.css";

export default function DashboardPage() {
  const navigate = useNavigate();
  const setClips = useProjectStore((s) => s.setClips);
  const setSelectedMood = useProjectStore((s) => s.setSelectedMood);

  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [clipById, setClipById] = useState<Record<string, Clip>>({});
  const [previewUrlsByJob, setPreviewUrlsByJob] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMoodGroups, setExpandedMoodGroups] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingClipId, setDeletingClipId] = useState<string | null>(null);
  const [showClipsPanel, setShowClipsPanel] = useState(false);

  const fetchPreviewUrls = useCallback(async (jobList: DashboardJob[]) => {
    if (jobList.length === 0) {
      setPreviewUrlsByJob({});
      return;
    }

    const detailResults = await Promise.all(
      jobList.map(async (job) => {
        try {
          const { data } = await api.get<JobDetailResponse>(`/jobs/${job.id}`);
          const urls = data.clips
            .map((clip) => clip.original_url)
            .filter((url): url is string => Boolean(url))
            .slice(0, 3);
          return { jobId: job.id, urls };
        } catch {
          return { jobId: job.id, urls: [] };
        }
      })
    );

    const nextMap: Record<string, string[]> = {};
    detailResults.forEach((result) => {
      nextMap[result.jobId] = result.urls;
    });
    setPreviewUrlsByJob(nextMap);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setLoading(true);
      setError(null);
      try {
        const [{ data: jobsData }, { data: clipsData }] = await Promise.all([
          api.get<JobsResponse>("/jobs"),
          api.get<ClipsResponse>("/clips"),
        ]);

        if (!isMounted) return;

        const fetchedJobs = jobsData.jobs || [];
        const clipMap: Record<string, Clip> = {};
        (clipsData.clips || []).forEach((clip) => {
          clipMap[clip.id] = clip;
        });

        setJobs(fetchedJobs);
        setClipById(clipMap);
        await fetchPreviewUrls(fetchedJobs);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.response?.data?.error || "Failed to load job history.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadDashboardData();
    return () => { isMounted = false; };
  }, [fetchPreviewUrls]);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [jobs]
  );

  const jobsWithExistingClips = useMemo(
    () => sortedJobs.filter((job) => job.clip_ids.some((clipId) => Boolean(clipById[clipId]))),
    [sortedJobs, clipById]
  );

  const filteredJobs = useMemo(() => {
    if (statusFilter === "all") return jobsWithExistingClips;
    return jobsWithExistingClips.filter((job) => job.status === statusFilter);
  }, [jobsWithExistingClips, statusFilter]);

  const jobsByMood = useMemo(() => {
    const grouped = filteredJobs.reduce<Record<string, DashboardJob[]>>((acc, job) => {
      acc[job.mood] = (acc[job.mood] || []).concat(job);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([mood, moodJobs]) => ({ mood, jobs: moodJobs }))
      .sort((a, b) => +new Date(b.jobs[0].created_at) - +new Date(a.jobs[0].created_at));
  }, [filteredJobs]);

  const handleReRun = (job: DashboardJob) => {
    const matchedClips = job.clip_ids
      .map((clipId) => clipById[clipId])
      .filter((clip): clip is Clip => Boolean(clip));

    if (matchedClips.length === 0) {
      setError("Could not find clips for this job. Upload clips again before rerunning.");
      return;
    }

    setClips(matchedClips);
    if (MOODS.includes(job.mood as Mood)) {
      setSelectedMood(job.mood as Mood);
    }
    navigate("/mood");
  };

  const handleDeleteClip = useCallback(async (clipId: string) => {
    setDeletingClipId(clipId);
    try {
      await api.delete(`/clips/${clipId}`);
      setClipById((prev) => {
        const next = { ...prev };
        delete next[clipId];
        return next;
      });
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete clip.");
    } finally {
      setDeletingClipId(null);
    }
  }, []);

  if (loading) {
    return (
      <section className="dashboard-page">
        <h1 className="dashboard-title">Job History</h1>
        <p className="dashboard-subtitle">Loading your recent grading jobs...</p>
      </section>
    );
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-header-left">
          <h1 className="dashboard-title">Job History</h1>
          <p className="dashboard-subtitle">
            {filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""} across {jobsByMood.length} mood{jobsByMood.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button type="button" className="dashboard-new-btn" onClick={() => navigate("/upload")}>
          + New Project
        </button>
      </div>

      <div className="dashboard-controls">
        <div className="dashboard-filters-section">
          <p className="dashboard-filters-label">Filter by Status:</p>
          <StatusFilters activeFilter={statusFilter} onFilterChange={setStatusFilter} />
        </div>
      </div>

      {error && <p className="dashboard-error">{error}</p>}

      {Object.values(clipById).length > 0 && (
        <div className="dashboard-clips-section">
          <button
            type="button"
            className="dashboard-clips-toggle"
            onClick={() => setShowClipsPanel(!showClipsPanel)}
            aria-expanded={showClipsPanel}
          >
            <span className="dashboard-clips-toggle-icon">{showClipsPanel ? "▼" : "▶"}</span>
            <span className="dashboard-clips-toggle-text">
              My Clips ({Object.values(clipById).length})
            </span>
          </button>
          {showClipsPanel && (
            <ClipsPanel
              clips={Object.values(clipById)}
              deletingClipId={deletingClipId}
              onDeleteClip={handleDeleteClip}
            />
          )}
        </div>
      )}

      {filteredJobs.length === 0 ? (
        <div className="dashboard-empty">
          <h2>No jobs yet</h2>
          <p>Upload clips to start a new grading job. Jobs with deleted clips are hidden.</p>
          <button type="button" className="dashboard-new-btn" onClick={() => navigate("/upload")}>
            Upload Clips
          </button>
        </div>
      ) : (
        <div className="dashboard-jobs-section">
          <div className="dashboard-list">
            {jobsByMood.map((group) => (
              <JobGroupCard
                key={group.mood}
                group={group}
                isExpanded={expandedMoodGroups[group.mood] || false}
                previewUrlsByJob={previewUrlsByJob}
                onToggleExpand={(mood) =>
                  setExpandedMoodGroups((prev) => ({ ...prev, [mood]: !prev[mood] }))
                }
                onReRun={handleReRun}
                onNavigate={navigate}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
