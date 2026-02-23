import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/clips - List user's uploaded clips
router.get("/", requireAuth, async (req, res) => {
  // TODO: Query clips for authenticated user
  res.status(501).json({ error: "Not implemented" });
});

// DELETE /api/clips/:id - Remove a clip
router.delete("/:id", requireAuth, async (req, res) => {
  // TODO: Delete clip from storage + DB
  res.status(501).json({ error: "Not implemented" });
});

export default router;
