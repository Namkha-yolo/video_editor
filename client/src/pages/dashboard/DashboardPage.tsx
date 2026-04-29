import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";
import { toast } from "@/store/toastStore";
import type { Clip, Mood } from "@clipvibe/shared";
import { JobGroupCard } from "./JobGroupCard";
import { StatusFilters } from "./StatusFilters";
import { ClipsPanel } from "./ClipsPanel";
import type { DashboardJob, JobsResponse, ClipsResponse, JobDetailResponse, StatusFilter } from "./types";
import { MOODS, formatDateTime } from "./utils";
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
      })
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
    [fetchPreviewUrls]
  );

  useEffect(() => {
    void loadDashboardData("initial");
  }, [loadDashboardData]);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [jobs]
  );

  const jobsWithExistingClips = useMemo(
    () => sortedJobs.filter((job) => job.clip_ids.some((clipId) => Boolean(clipById[clipId]))),
    [sortedJobs, clipById]
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const searchableJobs = useMemo(() => {
    if (!normalizedSearch) return jobsWithExistingClips;

    return jobsWithExistingClips.filter((job) => {
      const fullId = job.id.toLowerCase();
      const shortId = job.id.slice(0, 8).toLowerCase();
      const mood = job.mood.toLowerCase();
      return fullId.includes(normalizedSearch) || shortId.includes(normalizedSearch) || mood.includes(normalizedSearch);
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

  const visibleMoodKeys = useMemo(() => jobsByMood.map((group) => group.mood), [jobsByMood]);

  const allGroupsExpanded = useMemo(
    () => visibleMoodKeys.length > 0 && visibleMoodKeys.every((mood) => Boolean(expandedMoodGroups[mood])),
    [visibleMoodKeys, expandedMoodGroups]
  );

  const hasAnyJobHistory = jobsWithExistingClips.length > 0;
  const hasNoFilteredResults = hasAnyJobHistory && filteredJobs.length === 0;
  const hasSearchOrFilter = Boolean(normalizedSearch) || statusFilter !== "all";

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

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    await loadDashboardData("refresh");
  }, [loadDashboardData, refreshing]);

  const handleDeleteClip = useCallback(async (clipId: string) => {
    setDeletingClipId(clipId);
    try {
      await api.delete(`/clips/${clipId}`);
      setClipById((prev) => {
        const next = { ...prev };
        delete next[clipId];
        return next;
      });
      toast.success("Clip deleted.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete clip.");
    } finally {
      setDeletingClipId(null);
    }
  }, []);

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
      toast.success("Job deleted.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to delete job.");
    } finally {
      setDeletingJobId(null);
    }
  }, []);

  const toggleAllMoodGroups = useCallback(() => {
    const shouldExpandAll = !allGroupsExpanded;
    setExpandedMoodGroups((prev) => {
      const next = { ...prev };
      visibleMoodKeys.forEach((mood) => {
        next[mood] = shouldExpandAll;
      });
      return next;
    });
  }, [allGroupsExpanded, visibleMoodKeys]);

  const clearAllFilters = useCallback(() => {
    setStatusFilter("all");
    setSearchQuery("");
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
          {lastUpdatedAt && <p className="dashboard-last-updated">Last updated {formatDateTime(lastUpdatedAt)}</p>}
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="dashboard-action-btn dashboard-action-btn--secondary"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="dashboard-new-btn" onClick={() => navigate("/upload")}>
            + New Project
          </button>
        </div>
      </div>

      <div className="dashboard-controls">
        <div className="dashboard-controls-row">
          <div className="dashboard-search-wrap">
            <label className="dashboard-search-label" htmlFor="dashboard-job-search">Search jobs</label>
            <input
              id="dashboard-job-search"
              type="text"
              className="dashboard-search-input"
              placeholder="Search by mood or job ID"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="dashboard-action-btn dashboard-action-btn--secondary"
            onClick={toggleAllMoodGroups}
            disabled={jobsByMood.length === 0}
          >
            {allGroupsExpanded ? "Collapse all moods" : "Expand all moods"}
          </button>
        </div>
        <div className="dashboard-filters-section">
          <p className="dashboard-filters-label">Filter by Status:</p>
          <StatusFilters activeFilter={statusFilter} onFilterChange={setStatusFilter} counts={statusCounts} />
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

      {!hasAnyJobHistory ? (
        <div className="dashboard-empty">
          <svg className="dashboard-empty__art" width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
            <rect x="10" y="28" width="60" height="42" rx="5" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.35)" strokeWidth="2"/>
            <rect x="10" y="16" width="60" height="16" rx="4" fill="rgba(59,130,246,0.18)" stroke="rgba(59,130,246,0.35)" strokeWidth="2"/>
            <line x1="21" y1="16" x2="17" y2="32" stroke="rgba(27,180,216,0.55)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="33" y1="16" x2="29" y2="32" stroke="rgba(27,180,216,0.55)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="45" y1="16" x2="41" y2="32" stroke="rgba(27,180,216,0.55)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="57" y1="16" x2="53" y2="32" stroke="rgba(27,180,216,0.55)" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M32 44 L32 62 L54 53 Z" fill="rgba(27,180,216,0.35)" stroke="rgba(27,180,216,0.65)" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <h2>No jobs yet</h2>
          <p>Upload clips and choose a mood to create your first grading job.</p>
          <button type="button" className="dashboard-new-btn" onClick={() => navigate("/upload")}>
            Upload Clips
          </button>
        </div>
      ) : hasNoFilteredResults ? (
        <div className="dashboard-empty dashboard-empty--filtered">
          <svg className="dashboard-empty__art" width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
            <circle cx="34" cy="34" r="20" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.35)" strokeWidth="2.5"/>
            <line x1="48" y1="48" x2="66" y2="66" stroke="rgba(59,130,246,0.45)" strokeWidth="3.5" strokeLinecap="round"/>
            <line x1="27" y1="27" x2="41" y2="41" stroke="rgba(239,68,68,0.55)" strokeWidth="2" strokeLinecap="round"/>
            <line x1="41" y1="27" x2="27" y2="41" stroke="rgba(239,68,68,0.55)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <h2>No matching jobs</h2>
          <p>Try a different search term or reset your filters to see all jobs.</p>
          {hasSearchOrFilter && (
            <button type="button" className="dashboard-action-btn dashboard-action-btn--secondary" onClick={clearAllFilters}>
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
