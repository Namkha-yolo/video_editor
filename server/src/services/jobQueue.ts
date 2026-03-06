import { Queue, Worker, Job } from 'bullmq';
import { redis } from "../config/redis";
import { processGradingJob } from './videoProcessor';
import { io } from "../index";
import type { Mood } from '@clipvibe/shared';
import { supabase } from '../config/supabase';

let gradingQueue: Queue | null = null;
let worker: Worker | null = null;

// Try to initialize queue only if Redis is available
async function initializeQueue() {
  try {
    // Test Redis connection first
    await redis.ping();
    
    gradingQueue = new Queue('grading-jobs', {
      connection: redis as any,
    });

    worker = new Worker(
      'grading-jobs',
      async(job: Job) => {
          const { jobId, mood, clip_ids } = job.data;

          try {
              // Update progress via websocket
              io.to(`job:${jobId}`).emit("progress", { status: "processing"});
              
              // Update job status in the database to "processing"
              await supabase.from("jobs").update({ status: "processing" }).eq("id", jobId);
              
              // Doing to actual video processing
              await processGradingJob(jobId, mood as Mood, clip_ids);

              io.to(`job:${jobId}`).emit("progress", { status: "completed" });
          } catch (error: any) {
              console.error(`Error processing with jobId: ${jobId}:`, error);
              
              // update to the frontend that the job failed
              io.to(`job:${jobId}`).emit("progress", { status: "failed", error: error.message });
              
              // updated the job status in the database to failed
              await supabase.from("jobs").update({ status: "failed", error_message: error.message }).eq("id", jobId);

              throw error;
           }
      },
      { 
          connection: redis as any, 
          concurrency: 2
      }
    );
    
    // Handle worker errors gracefully
    worker.on('error', (error) => {
      console.error('Worker error:', error.message);
    });
    
    console.log("✅ Job queue initialized with Redis");
  } catch (error) {
    console.warn("⚠️  Job queue not available - using direct processing");
    gradingQueue = null;
    worker = null;
  }
}

// Initialize queue asynchronously
initializeQueue().catch(() => {
  console.warn("⚠️  Failed to initialize job queue");
});

export { gradingQueue };

