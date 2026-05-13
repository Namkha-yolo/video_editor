import { createHash, randomBytes } from "crypto";
import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";

const router: RouterType = Router();

const CreateShareSchema = z.object({
  job_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120).optional(),
  allow_download: z.boolean().optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createShareToken() {
  return randomBytes(32).toString("base64url");
}

function appOrigin(req: any) {
  const configuredOrigin = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL;
  const origin = configuredOrigin || req.get("origin") || `${req.protocol}://${req.get("host")}`;
  return origin.replace(/\/+$/, "");
}

function orderByIds<T extends { id: string }>(items: T[], ids: string[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => itemsById.get(id)).filter(Boolean) as T[];
}

async function createSignedOutputUrls(paths: string[], expiresIn: number) {
  return Promise.all(
    paths.map(async (storagePath) => {
      const { data, error } = await supabase.storage
        .from("outputs")
        .createSignedUrl(storagePath, expiresIn);

      if (error || !data?.signedUrl) {
        return null;
      }

      return data.signedUrl;
    })
  );
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsedBody = CreateShareSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
      });
    }

    const userId = (req as any).user.id;
    const { job_id: jobId, title, allow_download, expires_at } = parsedBody.data;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, user_id, status, output_paths")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.status !== "complete") {
      return res.status(400).json({ error: "Only completed jobs can be shared" });
    }

    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];
    if (outputPaths.length === 0) {
      return res.status(400).json({ error: "This job has no rendered outputs to share" });
    }

    const token = createShareToken();
    const tokenHash = hashToken(token);

    const { data: share, error: shareError } = await supabase
      .from("shares")
      .insert({
        user_id: userId,
        job_id: jobId,
        token_hash: tokenHash,
        title: title || null,
        allow_download: allow_download ?? true,
        expires_at: expires_at || null,
      })
      .select("id, job_id, title, allow_download, expires_at, created_at")
      .single();

    if (shareError || !share) {
      return res.status(500).json({ error: shareError?.message || "Failed to create share link" });
    }

    const shareUrl = `${appOrigin(req)}/share/${token}`;

    return res.status(201).json({
      share,
      token,
      share_url: shareUrl,
    });
  } catch (error: any) {
    console.error("Create share error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/:token", async (req, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 32) {
      return res.status(404).json({ error: "Share link not found" });
    }

    const { data: share, error: shareError } = await supabase
      .from("shares")
      .select("id, job_id, title, allow_download, expires_at, revoked_at, created_at")
      .eq("token_hash", hashToken(token))
      .maybeSingle();

    if (shareError) {
      return res.status(500).json({ error: shareError.message });
    }

    if (!share || share.revoked_at) {
      return res.status(404).json({ error: "Share link not found" });
    }

    if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: "Share link has expired" });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, user_id, mood, status, clip_ids, output_paths")
      .eq("id", share.job_id)
      .single();

    if (jobError || !job || job.status !== "complete") {
      return res.status(404).json({ error: "Shared export not found" });
    }

    const clipIds = Array.isArray(job.clip_ids) ? job.clip_ids : [];
    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];

    const { data: clips, error: clipsError } = await supabase
      .from("clips")
      .select("id, file_name, duration")
      .eq("user_id", job.user_id)
      .in("id", clipIds);

    if (clipsError) {
      return res.status(500).json({ error: clipsError.message });
    }

    const orderedClips = orderByIds(clips || [], clipIds);
    const outputUrls = await createSignedOutputUrls(outputPaths, 3600);

    return res.json({
      id: share.id,
      title: share.title,
      mood: job.mood,
      allow_download: share.allow_download,
      created_at: share.created_at,
      expires_at: share.expires_at,
      clips: orderedClips.map((clip: any, index: number) => ({
        id: clip.id,
        file_name: clip.file_name,
        duration: clip.duration,
        output_url: outputUrls[index] || null,
      })),
      url_expires_in_seconds: 3600,
    });
  } catch (error: any) {
    console.error("Get public share error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
