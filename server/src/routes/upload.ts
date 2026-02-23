import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// POST /api/upload - Upload video clip(s)
router.post("/", requireAuth, async (req, res) => {
  // TODO: Accept file upload
  // TODO: Validate format/size
  // TODO: Upload to Supabase Storage
  // TODO: Extract metadata (FFprobe)
  // TODO: Generate thumbnail
  // TODO: Save clip record to DB
  res.status(501).json({ error: "Not implemented" });
});

export default router;
