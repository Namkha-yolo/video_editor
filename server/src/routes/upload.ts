import { Router, Request, Response, type Router as RouterType } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";

const router: RouterType = Router();

const ALLOWED_MIMES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_FILE_SIZE = 500 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error("Invalid file type. Only mp4, mov, and webm are accepted."));
  },
});

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

async function extractMetadata(
  file: Express.Multer.File
): Promise<{ duration: number; width: number; height: number; fps: number }> {
  const pipelineUrl = process.env.AI_PIPELINE_URL || "http://localhost:8000";

  try {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([toArrayBuffer(file.buffer)], { type: file.mimetype }),
      file.originalname
    );

    const response = await fetch(`${pipelineUrl}/probe`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      return { duration: 0, width: 0, height: 0, fps: 0 };
    }

    const data = await response.json();
    return {
      duration: data.duration ?? 0,
      width: data.width ?? 0,
      height: data.height ?? 0,
      fps: data.fps ?? 0,
    };
  } catch {
    return { duration: 0, width: 0, height: 0, fps: 0 };
  }
}

router.post(
  "/",
  requireAuth,
  upload.array("files", 10),
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
        const extension = file.originalname.split(".").pop() ?? "mp4";
        const storagePath = `${user.id}/${clipId}.${extension}`;

        const { error: uploadError } = await supabase.storage.from("clips").upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

        if (uploadError) {
          return res.status(500).json({ error: `Failed to upload ${file.originalname}` });
        }

        const metadata = await extractMetadata(file);
        const { data: clip, error: dbError } = await supabase
          .from("clips")
          .insert({
            id: clipId,
            user_id: user.id,
            file_name: file.originalname,
            storage_path: storagePath,
            file_size: file.size,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            fps: metadata.fps,
          })
          .select()
          .single();

        if (dbError || !clip) {
          await supabase.storage.from("clips").remove([storagePath]);
          return res.status(500).json({ error: `Failed to save record for ${file.originalname}` });
        }

        clips.push(clip);
      }

      return res.status(201).json({ clips });
    } catch (error: any) {
      console.error("Upload error:", error);

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Maximum size is 500MB." });
      }

      if (error.message?.includes("Invalid file type")) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;
