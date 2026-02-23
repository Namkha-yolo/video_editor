export type JobStatus =
  | "queued"
  | "analyzing"
  | "grading"
  | "complete"
  | "failed";

export interface Job {
  id: string;
  user_id: string;
  mood: string;
  status: JobStatus;
  clip_ids: string[];
  output_paths: string[];
  created_at: string;
  updated_at: string;
}
