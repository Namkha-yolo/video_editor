import type { JobStatus } from "../../../shared/types/job.js";

export type JobProgressStatus = JobStatus | "queued";

export interface JobProgressEvent {
  job_id: string;
  status: JobProgressStatus;
  message?: string;
  clip_id?: string;
  clip_index?: number;
  total_clips?: number;
  output_paths?: string[];
  error?: string;
}

type JobEventEmitter = (room: string, event: string, payload: JobProgressEvent) => void;

let emitter: JobEventEmitter = () => {
  return;
};

export function setJobEventEmitter(nextEmitter: JobEventEmitter) {
  emitter = nextEmitter;
}

export function emitJobProgress(payload: JobProgressEvent) {
  emitter(`job:${payload.job_id}`, "progress", payload);
}
