/**
 * Job management routes
 * Handles creation, querying, and downloading of grading jobs
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";
import { processJob } from "../services/videoProcessor.js";
import type { Mood } from "../../../shared/types/mood.js";

const router = Router();

// Validation schemas
const CreateJobSchema = z.object({
  mood: z.enum(["nostalgic", "cinematic", "hype", "chill", "dreamy", "energetic"]),
  clip_ids: z.array(z.string().uuid()).min(1).max(10),
});

/**
 * POST /api/jobs - Create a new grading job
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    // Validate request body
    const validation = CreateJobSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "Invalid request", 
        details: validation.error.flatten() 
      });
    }

    const { mood, clip_ids } = validation.data;
    const userId = (req as any).user.id;

    // Verify all clips belong to the user
    const { data: userClips, error: clipsError } = await supabase
      .from("clips")
      .select("id")
      .in("id", clip_ids)
      .eq("user_id", userId);

    if (clipsError) {
      return res.status(500).json({ error: "Failed to verify clips" });
    }

    if (!userClips || userClips.length !== clip_ids.length) {
      return res.status(403).json({ 
        error: "One or more clips not found or don't belong to you" 
      });
    }

    // Create job record in database
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: userId,
        mood,
        status: "queued",
        clip_ids,
        output_paths: [],
      })
      .select()
      .single();

    if (jobError || !job) {
      return res.status(500).json({ 
        error: "Failed to create job",
        details: jobError?.message 
      });
    }

    console.log(`Created job ${job.id} for user ${userId}`);

    // Start processing asynchronously (in real implementation, use BullMQ)
    // For now, process directly in background
    processJob({
      jobId: job.id,
      mood: mood as Mood,
      clipIds: clip_ids,
      userId,
    }).catch((error) => {
      console.error(`Job ${job.id} processing failed:`, error);
    });

    res.status(201).json({ 
      job_id: job.id,
      status: job.status,
      message: "Job created and processing started" 
    });

  } catch (error: any) {
    console.error("Create job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/jobs - List user's jobs
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ 
        error: "Failed to fetch jobs",
        details: error.message 
      });
    }

    // Return jobs with clip count
    const jobsWithMeta = jobs?.map((job) => ({
      ...job,
      clip_count: job.clip_ids.length,
    })) || [];

    res.json({ 
      jobs: jobsWithMeta,
      total: jobsWithMeta.length 
    });

  } catch (error: any) {
    console.error("List jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
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
