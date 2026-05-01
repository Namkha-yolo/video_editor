import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";
import type { Clip, Mood } from "@clipvibe/shared";
import { JobGroupCard } from "./JobGroupCard";
import { StatusFilters } from "./StatusFilters";
import { ClipsPanel } from "./ClipsPanel";
import type {
  DashboardJob,
  JobsResponse,
  ClipsResponse,
  JobDetailResponse,
  StatusFilter,
} from "./types";
import { MOODS, formatDateTime } from "./utils";
import "./DashboardPage.css";

export default function DashboardPage() {
  const navigate = useNavigate();
  const setClips = useProjectStore((s) => s.setClips);
  const setSelectedMood = useProjectStore((s) => s.setSelectedMood);
  const setIsProjectActive = useProjectStore((s) => s.setIsProjectActive);
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [clipById, setClipById] = useState<Record<string, Clip>>({});
  const [previewUrlsByJob, setPreviewUrlsByJob] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMoodGroups, setExpandedMoodGroups] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingClipId, setDeletingClipId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [showClipsPanel, setShowClipsPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

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
      }),
    );

    const nextMap: Record<string, string[]> = {};
    detailResults.forEach((result) => {
      nextMap[result.jobId] = result.urls;
    });
    setPreviewUrlsByJob(nextMap);
  }, []);

  const loadDashboardData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);
      try {
        const [{ data: jobsData }, { data: clipsData }] = await Promise.all([
          api.get<JobsResponse>("/jobs"),
          api.get<ClipsResponse>("/clips"),
        ]);

        const fetchedJobs = jobsData.jobs || [];
        const clipMap: Record<string, Clip> = {};
        (clipsData.clips || []).forEach((clip) => {
          clipMap[clip.id] = clip;
        });

        setJobs(fetchedJobs);
        setClipById(clipMap);
        await fetchPreviewUrls(fetchedJobs);
        setLastUpdatedAt(new Date().toISOString());
      } catch (err: any) {
        setError(err?.response?.data?.error || "Failed to load job history.");
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [fetchPreviewUrls],
  );

  useEffect(() => {
    void loadDashboardData("initial");
  }, [loadDashboardData]);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [jobs],
  );

  const jobsWithExistingClips = useMemo(
    () => sortedJobs.filter((job) => job.clip_ids.some((clipId) => Boolean(clipById[clipId]))),
    [sortedJobs, clipById],
  );

  const allClips = useMemo(
    () =>
      Object.values(clipById).sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      ),
    [clipById],
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const searchableJobs = useMemo(() => {
    if (!normalizedSearch) return jobsWithExistingClips;

    return jobsWithExistingClips.filter((job) => {
      const fullId = job.id.toLowerCase();
      const shortId = job.id.slice(0, 8).toLowerCase();
      const mood = job.mood.toLowerCase();
      return (
        fullId.includes(normalizedSearch) ||
        shortId.includes(normalizedSearch) ||
        mood.includes(normalizedSearch)
      );
    });
  }, [jobsWithExistingClips, normalizedSearch]);

  const statusCounts = useMemo<Record<StatusFilter, number>>(() => {
    const counts: Record<StatusFilter, number> = {
      all: searchableJobs.length,
      queued: 0,
      analyzing: 0,
      grading: 0,
      complete: 0,
      failed: 0,
    };

    searchableJobs.forEach((job) => {
      counts[job.status] += 1;
    });

    return counts;
  }, [searchableJobs]);

  const filteredJobs = useMemo(() => {
    if (statusFilter === "all") return searchableJobs;
    return searchableJobs.filter((job) => job.status === statusFilter);
  }, [searchableJobs, statusFilter]);

  const jobsByMood = useMemo(() => {
    const grouped = filteredJobs.reduce<Record<string, DashboardJob[]>>((acc, job) => {
      acc[job.mood] = (acc[job.mood] || []).concat(job);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([mood, moodJobs]) => ({ mood, jobs: moodJobs }))
      .sort((a, b) => +new Date(b.jobs[0].created_at) - +new Date(a.jobs[0].created_at));
  }, [filteredJobs]);

  const expandableMoodKeys = useMemo(
    () => jobsByMood.filter((group) => group.jobs.length > 2).map((group) => group.mood),
    [jobsByMood],
  );

  const allGroupsExpanded = useMemo(
    () =>
      expandableMoodKeys.length > 0 &&
      expandableMoodKeys.every((mood) => Boolean(expandedMoodGroups[mood])),
    [expandableMoodKeys, expandedMoodGroups],
  );

  const hasAnyJobHistory = jobsWithExistingClips.length > 0;
  const hasNoFilteredResults = hasAnyJobHistory && filteredJobs.length === 0;
  const hasSearchOrFilter = Boolean(normalizedSearch) || statusFilter !== "all";
  const clipCount = allClips.length;
  const hasExpandableGroups = expandableMoodKeys.length > 0;

  const handleReRun = (job: DashboardJob) => {
    const matchedClips = job.clip_ids
      .map((clipId) => clipById[clipId])
      .filter((clip): clip is Clip => Boolean(clip));

    if (matchedClips.length === 0) {
      setError("Could not find clips for this job. Upload clips again before rerunning.");
      return;
    }

    setClips(matchedClips);
    setIsProjectActive(true);
    if (MOODS.includes(job.mood as Mood)) {
      setSelectedMood(job.mood as Mood);
    }
    navigate("/mood");
  };

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    await loadDashboardData("refresh");
  }, [loadDashboardData, refreshing]);

  const handleDeleteClip = useCallback(
    async (clipId: string) => {
      setDeletingClipId(clipId);
      try {
        await api.delete(`/clips/${clipId}`);
        setClipById((prev) => {
          const next = { ...prev };
          delete next[clipId];
          return next;
        });
        setError(null);
        await loadDashboardData("refresh");
      } catch (err: any) {
        setError(err?.response?.data?.error || "Failed to delete clip.");
      } finally {
        setDeletingClipId(null);
      }
    },
    [loadDashboardData],
  );

  const handleDeleteJob = useCallback(async (job: DashboardJob) => {
    setDeletingJobId(job.id);
    try {
      await api.delete(`/jobs/${job.id}`);
      setJobs((prev) => prev.filter((item) => item.id !== job.id));
      setPreviewUrlsByJob((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete job.");
    } finally {
      setDeletingJobId(null);
    }
  }, []);

  const toggleAllMoodGroups = useCallback(() => {
    const shouldExpandAll = !allGroupsExpanded;
    setExpandedMoodGroups((prev) => {
      const next = { ...prev };
      expandableMoodKeys.forEach((mood) => {
        next[mood] = shouldExpandAll;
      });
      return next;
    });
  }, [allGroupsExpanded, expandableMoodKeys]);

  const clearAllFilters = useCallback(() => {
    setStatusFilter("all");
    setSearchQuery("");
  }, []);

  const handleNewProject = useCallback(() => {
    setIsProjectActive(true);
    setClips([]);
    navigate("/upload");
  }, [navigate, setClips, setIsProjectActive]);

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
          {lastUpdatedAt && (
            <p className="dashboard-last-updated">Last updated {formatDateTime(lastUpdatedAt)}</p>
          )}
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="dashboard-top-btn dashboard-top-btn--secondary"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="dashboard-top-btn dashboard-top-btn--primary" onClick={handleNewProject}>
            New Project
          </button>
        </div>
      </div>

      <div className="dashboard-controls">
        <div className="dashboard-controls-row">
          <div className="dashboard-search-wrap">
            <label className="dashboard-search-label" htmlFor="dashboard-job-search">
              Search jobs
            </label>
            <input
              id="dashboard-job-search"
              type="text"
              className="dashboard-search-input"
              placeholder="Search by mood or job ID"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasExpandableGroups && (
            <button
              type="button"
              className="dashboard-action-btn dashboard-action-btn--secondary dashboard-expand-btn"
              onClick={toggleAllMoodGroups}
            >
              {allGroupsExpanded ? "Collapse groups" : "Expand groups"}
            </button>
          )}
        </div>
        <div className="dashboard-filters-section">
          <p className="dashboard-filters-label">Filter by status</p>
          <StatusFilters
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
            counts={statusCounts}
          />
        </div>
      </div>

      {error && <p className="dashboard-error">{error}</p>}

      {clipCount > 0 && (
        <div className="dashboard-clips-section">
          <button
            type="button"
            className="dashboard-clips-toggle"
            onClick={() => setShowClipsPanel(!showClipsPanel)}
            aria-expanded={showClipsPanel}
          >
            <span
              className={`dashboard-clips-toggle-icon${showClipsPanel ? " dashboard-clips-toggle-icon--open" : ""}`}
              aria-hidden="true"
            >
              {">"}
            </span>
            <span className="dashboard-clips-toggle-text">My Clips ({clipCount})</span>
          </button>
          {showClipsPanel && (
            <ClipsPanel
              clips={allClips}
              deletingClipId={deletingClipId}
              onDeleteClip={handleDeleteClip}
            />
          )}
        </div>
      )}

      {!hasAnyJobHistory ? (
        <div className="dashboard-empty">
          <h2>No jobs yet</h2>
          <p>Upload clips to start a new grading job. Jobs with deleted clips are hidden.</p>
          <button type="button" className="dashboard-top-btn dashboard-top-btn--primary" onClick={handleNewProject}>
            Upload Clips
          </button>
        </div>
      ) : hasNoFilteredResults ? (
        <div className="dashboard-empty dashboard-empty--filtered">
          <h2>No matching jobs</h2>
          <p>Try a different search term or reset filters to see all jobs.</p>
          {hasSearchOrFilter && (
            <button
              type="button"
              className="dashboard-action-btn dashboard-action-btn--secondary"
              onClick={clearAllFilters}
            >
              Clear search and filters
            </button>
          )}
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
                onDelete={handleDeleteJob}
                deletingJobId={deletingJobId}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
