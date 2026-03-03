import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";
import { gradingQueue } from "../services/jobQueue.js";

const router = Router();

// POST /api/jobs - Create a new grading job
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

  // Push the job to redis for worker to find
  await gradingQueue.add("grade", {
    jobId: job.id,
    mood,
    clip_ids
  });

  // Return the job ID to the client to let them know we've started processing
  res.status(200).json({ jobId: job.id });

});

// GET /api/jobs - List user's jobs
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

// GET /api/jobs/:id - Get job status + outputs
router.get("/:id", requireAuth, async (req, res) => {
  // TODO: Return job details with output download URLs
  res.status(501).json({ error: "Not implemented" });
});

// GET /api/jobs/:id/download - Download graded clips (zip)
router.get("/:id/download", requireAuth, async (req, res) => {
  // TODO: Generate zip of graded clips
  // TODO: Return signed download URL
  res.status(501).json({ error: "Not implemented" });
});

export default router;
