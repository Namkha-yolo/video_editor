export type JobStatus =
  | "queued"
  | "analyzing"
  | "grading"
  | "assembling"
  | "complete"
  | "failed";

export interface Job {
  id: string;
  user_id: string;
  mood: string;
  status: JobStatus;
  clip_ids: string[];
  output_paths: string[];
  assembled_path: string | null;
  created_at: string;
  updated_at: string;
}
