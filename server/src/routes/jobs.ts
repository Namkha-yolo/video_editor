import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";
import { enqueueGradingJob } from "../services/jobQueue.js";
import { buildRateLimitHeaders, consumeJobCreationRateLimit } from "../services/rateLimiters.js";

const router: RouterType = Router();

const CreateJobSchema = z.object({
  mood: z.enum(["nostalgic", "cinematic", "hype", "chill", "dreamy", "energetic"]),
  clip_ids: z.array(z.string().uuid()).min(1).max(10),
});

function normaliseClipIds(clipIds: string[]) {
  return [...new Set(clipIds)];
}

function orderByIds<T extends { id: string }>(items: T[], ids: string[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => itemsById.get(id)).filter(Boolean) as T[];
}

async function createSignedUrls(bucket: "clips" | "outputs", paths: string[], expiresIn: number) {
  return Promise.all(
    paths.map(async (storagePath) => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
      if (error || !data?.signedUrl) {
        return null;
      }

      return data.signedUrl;
    })
  );
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsedBody = CreateJobSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
      });
    }

    const user = (req as any).user;
    const rateLimit = consumeJobCreationRateLimit(user.id);
    res.set(buildRateLimitHeaders(rateLimit));

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "Too many grading jobs started. Please wait before creating another job.",
        code: "JOB_RATE_LIMITED",
        retry_after_seconds: rateLimit.retryAfterSeconds,
      });
    }

    const clipIds = normaliseClipIds(parsedBody.data.clip_ids);

    const { data: clips, error: clipsError } = await supabase
      .from("clips")
      .select("id")
      .eq("user_id", user.id)
      .in("id", clipIds);

    if (clipsError) {
      return res.status(500).json({ error: clipsError.message });
    }

    if (!clips || clips.length !== clipIds.length) {
      return res.status(400).json({ error: "Some clips were not found or do not belong to you" });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        mood: parsedBody.data.mood,
        clip_ids: clipIds,
        status: "queued",
        output_paths: [],
        error_message: null,
      })
      .select("*")
      .single();

    if (jobError || !job) {
      return res.status(500).json({ error: jobError?.message || "Failed to create job" });
    }

    await enqueueGradingJob({
      jobId: job.id,
      mood: parsedBody.data.mood,
      clipIds,
    });

    return res.status(201).json({
      job_id: job.id,
      jobId: job.id,
      status: "queued",
      message: "Job created and processing started",
    });
  } catch (error: any) {
    console.error("Create job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

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

  return res.status(200).json({
    jobs: jobs || [],
    total: jobs?.length || 0,
  });
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const clipIds = Array.isArray(job.clip_ids) ? job.clip_ids : [];
    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];

    const { data: clips, error: clipsError } = await supabase
      .from("clips")
      .select("id, file_name, duration, storage_path")
      .eq("user_id", userId)
      .in("id", clipIds);

    if (clipsError) {
      return res.status(500).json({ error: clipsError.message });
    }

    const orderedClips = orderByIds(clips || [], clipIds);
    const originalUrls = await createSignedUrls(
      "clips",
      orderedClips.map((clip: any) => clip.storage_path),
      3600
    );
    const outputUrls =
      job.status === "complete" && outputPaths.length > 0
        ? await createSignedUrls("outputs", outputPaths, 3600)
        : [];

    return res.json({
      ...job,
      clips: orderedClips.map((clip: any, index: number) => ({
        id: clip.id,
        file_name: clip.file_name,
        duration: clip.duration,
        original_url: originalUrls[index] || null,
        output_url: outputUrls[index] || null,
      })),
      output_urls: outputUrls,
      original_urls: originalUrls,
    });
  } catch (error: any) {
    console.error("Get job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/download", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

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
        status: job.status,
      });
    }

    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];
    if (outputPaths.length === 0) {
      return res.status(404).json({ error: "No output files available" });
    }

    const downloadUrls = await Promise.all(
      outputPaths.map(async (storagePath: string, index: number) => {
        const { data } = await supabase.storage.from("outputs").createSignedUrl(storagePath, 7200);
        return {
          clip_index: index + 1,
          url: data?.signedUrl || "",
          path: storagePath,
        };
      })
    );

    return res.json({
      job_id: job.id,
      mood: job.mood,
      download_urls: downloadUrls,
      expires_in: "2 hours",
    });
  } catch (error: any) {
    console.error("Download job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("output_paths")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];
    if (outputPaths.length > 0) {
      await supabase.storage.from("outputs").remove(outputPaths);
    }

    const { error: deleteError } = await supabase
      .from("jobs")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.json({ message: "Job deleted successfully" });
  } catch (error: any) {
    console.error("Delete job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
