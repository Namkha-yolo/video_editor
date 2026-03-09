import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;

    const { data: clips, error } = await supabase
      .from("clips")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      clips: clips || [],
      total: clips?.length || 0,
    });
  } catch (error: any) {
    console.error("List clips error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select("id, storage_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (clipError || !clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    const { error: storageError } = await supabase.storage.from("clips").remove([clip.storage_path]);
    if (storageError) {
      return res.status(500).json({ error: storageError.message });
    }

    const { error: deleteError } = await supabase
      .from("clips")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.json({ message: "Clip deleted successfully" });
  } catch (error: any) {
    console.error("Delete clip error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
