import { Router, Request, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";

const router = Router();

// ── Multer config: store files in memory, max 500 MB ────────────────────
const ALLOWED_MIMES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only mp4, mov, and webm are accepted."));
    }
  },
});

// ── Helper: call AI pipeline FFprobe endpoint for metadata ──────────────
async function extractMetadata(
  storagePath: string
): Promise<{ duration: number; width: number; height: number; fps: number }> {
  const pipelineUrl = process.env.AI_PIPELINE_URL || "http://localhost:8000";
  try {
    const response = await fetch(`${pipelineUrl}/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_path: storagePath }),
    });
    if (response.ok) {
      const data = await response.json();
      return {
        duration: data.duration ?? 0,
        width: data.width ?? 0,
        height: data.height ?? 0,
        fps: data.fps ?? 0,
      };
    }
  } catch {
    // AI pipeline unavailable — return zeroes; metadata can be filled later
  }
  return { duration: 0, width: 0, height: 0, fps: 0 };
}

// ── POST /api/upload — Upload video clip(s) ─────────────────────────────
router.post(
  "/",
  requireAuth,
  upload.array("files", 10), // up to 10 files per request
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const clips = [];

      for (const file of files) {
        const clipId = uuidv4();
        const ext = file.originalname.split(".").pop() ?? "mp4";
        const storagePath = `${user.id}/${clipId}.${ext}`;

        // 1. Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("clips")
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          return res
            .status(500)
            .json({ error: `Failed to upload ${file.originalname}` });
        }

        // 2. Extract metadata via AI pipeline (best-effort)
        const meta = await extractMetadata(storagePath);

        // 3. Insert clip record into DB
        const { data: clip, error: dbError } = await supabase
          .from("clips")
          .insert({
            id: clipId,
            user_id: user.id,
            file_name: file.originalname,
            storage_path: storagePath,
            file_size: file.size,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            fps: meta.fps,
          })
          .select()
          .single();

        if (dbError) {
          console.error("DB insert error:", dbError);
          // Clean up the storage file we just uploaded
          await supabase.storage.from("clips").remove([storagePath]);
          return res
            .status(500)
            .json({ error: `Failed to save record for ${file.originalname}` });
        }

        clips.push(clip);
      }

      res.status(201).json({ clips });
    } catch (err: any) {
      console.error("Upload error:", err);
      if (err.message?.includes("Invalid file type")) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;
