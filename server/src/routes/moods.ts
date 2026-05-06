import { Router, type Router as RouterType } from "express";
import { getAllPresets } from "../services/moodEngine.js";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";

const router: RouterType = Router();

// GET /api/moods - List available mood presets (public, no auth needed)
router.get("/", (_req, res) => {
  const presets = getAllPresets();
  res.json(presets);
});

// GET /api/moods/custom - Get user's saved custom mood presets
router.get("/custom", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { data, error } = await supabase.auth.admin.getUserById(user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const presets = (data.user?.user_metadata?.custom_moods as unknown[]) ?? [];
    return res.json({ presets });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/moods/custom - Replace the full list of custom mood presets
router.put("/custom", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { presets } = req.body as { presets: unknown[] };

    if (!Array.isArray(presets)) {
      return res.status(400).json({ error: "presets must be an array" });
    }

    if (presets.length > 20) {
      return res.status(400).json({ error: "Maximum 20 custom presets allowed" });
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { custom_moods: presets },
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ presets });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
