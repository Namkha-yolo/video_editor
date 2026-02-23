import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// POST /api/jobs - Create a new grading job
router.post("/", requireAuth, async (req, res) => {
  // TODO: Validate request (clip_ids + mood)
  // TODO: Create job record in DB
  // TODO: Enqueue job in BullMQ
  // TODO: Return job ID
  res.status(501).json({ error: "Not implemented" });
});

// GET /api/jobs - List user's jobs
router.get("/", requireAuth, async (req, res) => {
  // TODO: Query jobs for authenticated user
  res.status(501).json({ error: "Not implemented" });
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
