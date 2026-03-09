import { Job, Queue, Worker } from "bullmq";
import { createRedisConnection, redis } from "../config/redis.js";
import { supabase } from "../config/supabase.js";
import { emitJobProgress } from "./jobEvents.js";
import { processGradingJob } from "./videoProcessor.js";
import type { Mood } from "../../../shared/types/mood.js";

export interface GradingJobPayload {
  jobId: string;
  mood: Mood;
  clipIds: string[];
}

export interface JobRunnerDependencies {
  processJob: (jobId: string, mood: Mood, clipIds: string[]) => Promise<unknown>;
  updateJobStatus: (jobId: string, status: "analyzing" | "failed", errorMessage?: string) => Promise<void>;
  emitProgress: typeof emitJobProgress;
}

export function createJobRunner(dependencies: JobRunnerDependencies) {
  return async function runJob(payload: GradingJobPayload) {
    const { jobId, mood, clipIds } = payload;

    try {
      await dependencies.updateJobStatus(jobId, "analyzing");
      dependencies.emitProgress({
        job_id: jobId,
        status: "analyzing",
        total_clips: clipIds.length,
        message: "Job started",
      });

      await dependencies.processJob(jobId, mood, clipIds);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Job processing failed";

      await dependencies.updateJobStatus(jobId, "failed", message);
      dependencies.emitProgress({
        job_id: jobId,
        status: "failed",
        total_clips: clipIds.length,
        error: message,
        message,
      });

      throw error;
    }
  };
}

async function updateJobStatus(
  jobId: string,
  status: "analyzing" | "failed",
  errorMessage?: string
) {
  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    error_message: errorMessage ?? null,
  };

  await supabase.from("jobs").update(updatePayload).eq("id", jobId);
}

const runJob = createJobRunner({
  processJob: processGradingJob,
  updateJobStatus,
  emitProgress: emitJobProgress,
});

let gradingQueue: Queue<GradingJobPayload> | null = null;
let worker: Worker<GradingJobPayload> | null = null;
let queueConnection: ReturnType<typeof createRedisConnection> | null = null;
let workerConnection: ReturnType<typeof createRedisConnection> | null = null;
let queueInitialization: Promise<void> | null = null;

async function initializeQueue() {
  if (queueInitialization) {
    return queueInitialization;
  }

  queueInitialization = (async () => {
    try {
      await redis.ping();

      queueConnection = createRedisConnection();
      workerConnection = createRedisConnection();

      gradingQueue = new Queue<GradingJobPayload>("grading-jobs", {
        connection: queueConnection as any,
      });

      worker = new Worker<GradingJobPayload>(
        "grading-jobs",
        async (job: Job<GradingJobPayload>) => runJob(job.data),
        {
          connection: workerConnection as any,
          concurrency: 2,
        }
      );

      worker.on("failed", (job, error) => {
        console.error(`Queue worker failed for job ${job?.id ?? "unknown"}:`, error.message);
      });

      worker.on("error", (error) => {
        console.error("Queue worker error:", error.message);
      });

      console.log("Job queue initialized with Redis");
    } catch {
      gradingQueue = null;
      worker = null;
      queueConnection = null;
      workerConnection = null;
      console.warn("Job queue not available - falling back to direct processing");
    }
  })();

  return queueInitialization;
}

initializeQueue().catch(() => {
  console.warn("Failed to initialize job queue");
});

export async function getGradingQueue() {
  await initializeQueue();
  return gradingQueue;
}

export async function enqueueGradingJob(payload: GradingJobPayload) {
  await initializeQueue();

  emitJobProgress({
    job_id: payload.jobId,
    status: "queued",
    total_clips: payload.clipIds.length,
    message: "Job queued",
  });

  if (gradingQueue) {
    try {
      await gradingQueue.add("grade", payload, {
        jobId: payload.jobId,
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 2,
      });

      return "queued";
    } catch (error) {
      console.warn("Queue add failed - falling back to direct processing");
    }
  }

  void runJob(payload).catch((error) => {
    console.error(`Direct job processing failed for ${payload.jobId}:`, error.message);
  });

  return "direct";
}

export async function shutdownJobQueue() {
  await worker?.close();
  await gradingQueue?.close();
  await workerConnection?.quit();
  await queueConnection?.quit();

  worker = null;
  gradingQueue = null;
  workerConnection = null;
  queueConnection = null;
}

export { gradingQueue };
