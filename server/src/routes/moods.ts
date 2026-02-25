import { Router } from "express";
import { getAllPresets } from "../services/moodEngine.js";

const router = Router();

// GET /api/moods - List available mood presets (public, no auth needed)
router.get("/", (_req, res) => {
  const presets = getAllPresets();
  res.json(presets);
});

export default router;
