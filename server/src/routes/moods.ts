import { Router } from "express";

const router = Router();

// GET /api/moods - List available mood presets
router.get("/", async (_req, res) => {
  // TODO: Return mood presets from moodEngine service
  res.status(501).json({ error: "Not implemented" });
});

export default router;
