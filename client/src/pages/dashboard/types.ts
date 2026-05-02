import type { JobStatus } from "@clipvibe/shared";

export interface DashboardJob {
  id: string;
  mood: string;
  status: JobStatus;
  clip_ids: string[];
  created_at: string;
  updated_at: string;
  error_message?: string | null;
}

export interface JobsResponse {
  jobs: DashboardJob[];
}

export interface ClipsResponse {
  clips: any[];
}

export interface JobDetailResponse {
  id: string;
  clips: Array<{
    id: string;
    original_url: string | null;
  }>;
}

export interface JobDownloadResponse {
  job_id: string;
  mood: string;
  download_urls: Array<{
    clip_index: number;
    url: string;
    path: string;
  }>;
}

export type StatusFilter = "all" | "queued" | "analyzing" | "grading" | "complete" | "failed";
