import { Router, type Router as RouterType } from "express";
import { supabase } from "../config/supabase.js";

const router: RouterType = Router();

const SHARE_URL_TTL_SECONDS = 7 * 24 * 3600;

router.get("/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, mood, clip_ids, assembled_path, status, created_at")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return res.status(404).json({ error: "Not found" });
    }

    if (job.status !== "complete" || !job.assembled_path) {
      return res.status(404).json({ error: "This reel isn't ready to share yet." });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("outputs")
      .createSignedUrl(job.assembled_path, SHARE_URL_TTL_SECONDS);

    if (signedError || !signed?.signedUrl) {
      return res.status(500).json({ error: "Could not generate share URL" });
    }

    return res.json({
      job_id: job.id,
      mood: job.mood,
      clip_count: Array.isArray(job.clip_ids) ? job.clip_ids.length : 0,
      assembled_url: signed.signedUrl,
      created_at: job.created_at,
    });
  } catch (error: any) {
    console.error("Share route error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
