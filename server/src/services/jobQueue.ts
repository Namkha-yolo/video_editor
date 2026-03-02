import { Queue, Worker, Job } from 'bullmq';
import { redis } from "../config/redis";
import { processGradingJob } from './videoProcessor';
import { io } from "../index";
import type { Mood } from '@clipvibe/shared';


// Define the queue, where the server will push new jobs here
export const gradingQueue = new Queue('grading', {
  connection: redis as any,
});

// Define the worker, which will process jobs from the queue
 const worker = new Worker(
    'grading-jobs',
    async(job: Job) => {
        const { jobId, mood, clipIds } = job.data;

        try {
            // Update progress via websocket
            io.to(`job:${jobId}`).emit("progress", { status: "processing"});
            
            // Doing to actual video processing
            await processGradingJob(jobId, mood as Mood, clipIds);

            io.to(`job:${jobId}`).emit("progress", { status: "completed" });
        } catch (error) {
            console.error(`Error processing with jobId: ${jobId}:`, error);
            throw error;
         }
    },
    { 
        connection: redis as any, 
        concurrency: 2
    }
 )

