/**
 * Job management routes
 * Handles creation, querying, and downloading of grading jobs
 */
import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";
import type { Mood } from "../../../shared/types/mood.js";
import { gradingQueue } from "../services/jobQueue.js";
import { processGradingJob } from "../services/videoProcessor.js";

const router: RouterType = Router();

// Validation schemas
const CreateJobSchema = z.object({
  mood: z.enum(["nostalgic", "cinematic", "hype", "chill", "dreamy", "energetic"]),
  clip_ids: z.array(z.string().uuid()).min(1).max(10),
});

/**
 * POST /api/jobs - Create a new grading job
 */
router.post("/", requireAuth, async (req, res) => {

  const { mood, clip_ids } = req.body;
  const user = (req as any).user;

  if (!mood || !clip_ids || !Array.isArray(clip_ids) || clip_ids.length === 0) {
    return res.status(500).json({ error: "Invalid request body" });
  }

  // Creating the job record in Supabase
  const {data: job, error } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      mood,
      clip_ids,
      status: "queued"
    })
    .select("*")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // If Redis/Queue available, use it. Otherwise process directly
  if (gradingQueue) {
    await gradingQueue.add("grade", {
      jobId: job.id,
      mood,
      clip_ids
    });
  } else {
    // Fallback: process directly without queue (for development/testing)
    console.log("⚠️  Processing job directly (no queue available)");
    processGradingJob(job.id, mood as Mood, clip_ids).catch((err) => {
      console.error("Direct processing error:", err);
    });
  }

  // Return the job ID to the client to let them know we've started processing
  res.status(200).json({ jobId: job.id });

});

/**
 * GET /api/jobs - List user's jobs
 */
router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ jobs });
});

/**
 * GET /api/jobs/:id - Get job status + outputs
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Fetch job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // If job is complete, generate signed URLs for outputs
    let outputUrls: string[] = [];
    if (job.status === "complete" && job.output_paths.length > 0) {
      outputUrls = await Promise.all(
        job.output_paths.map(async (path: string) => {
          const { data } = await supabase.storage
            .from("outputs")
            .createSignedUrl(path, 3600); // 1 hour expiry
          return data?.signedUrl || "";
        })
      );
    }

    // Fetch clip details
    const { data: clips } = await supabase
      .from("clips")
      .select("id, file_name, duration")
      .in("id", job.clip_ids);

    res.json({
      ...job,
      clips: clips || [],
      output_urls: outputUrls,
    });

  } catch (error: any) {
    console.error("Get job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/jobs/:id/download - Download graded clips
 */
router.get("/:id/download", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Fetch job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.status !== "complete") {
      return res.status(400).json({ 
        error: "Job not complete yet",
        status: job.status 
      });
    }

    if (job.output_paths.length === 0) {
      return res.status(404).json({ error: "No output files available" });
    }

    // Generate signed URLs with longer expiry for downloads
    const downloadUrls = await Promise.all(
      job.output_paths.map(async (path: string, index: number) => {
        const { data } = await supabase.storage
          .from("outputs")
          .createSignedUrl(path, 7200); // 2 hour expiry
        
        return {
          clip_index: index + 1,
          url: data?.signedUrl || "",
          path: path,
        };
      })
    );

    res.json({
      job_id: job.id,
      mood: job.mood,
      download_urls: downloadUrls,
      expires_in: "2 hours",
    });

  } catch (error: any) {
    console.error("Download job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/jobs/:id - Delete a job (optional cleanup)
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Verify ownership
    const { data: job } = await supabase
      .from("jobs")
      .select("output_paths")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Delete output files from storage
    if (job.output_paths.length > 0) {
      await supabase.storage
        .from("outputs")
        .remove(job.output_paths);
    }

    // Delete job record
    const { error: deleteError } = await supabase
      .from("jobs")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      return res.status(500).json({ error: "Failed to delete job" });
    }

    res.json({ message: "Job deleted successfully" });

  } catch (error: any) {
    console.error("Delete job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
