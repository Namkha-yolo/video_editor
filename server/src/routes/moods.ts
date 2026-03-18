import { Router, type Router as RouterType } from "express";
import { getAllPresets } from "../services/moodEngine.js";

const router: RouterType = Router();

// GET /api/moods - List available mood presets (public, no auth needed)
router.get("/", (_req, res) => {
  const presets = getAllPresets();
  res.json(presets);
});

export default router;
