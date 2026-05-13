import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";
import { enqueueGradingJob } from "../services/jobQueue.js";
import {
  buildRateLimitHeaders,
  consumeJobCreationRateLimit,
  consumeSoundtrackGenRateLimit,
} from "../services/rateLimiters.js";
import { isResolutionKey, transcodeToBuffer, type ResolutionKey } from "../services/transcoder.js";

const router: RouterType = Router();

const CustomPacingInputSchema = z.object({
  speed: z.number().min(0.7).max(1.4),
  transition: z.string().min(1).max(32),
  transition_duration: z.number().min(0.1).max(2.0),
  audio_highpass: z.number().int().min(0).max(400),
  audio_lowpass: z.number().int().min(0).max(16000),
});

const CustomMoodInputSchema = z.object({
  lut_path: z.string().min(1).max(255),
  name: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(96).optional(),
  description: z.string().max(240).optional(),
  runtime: z.object({
    vignette: z.number().min(0).max(0.8),
    grain: z.number().int().min(0).max(25),
    halation: z.number().min(0).max(0.6),
    person_protection: z.number().min(0).max(1),
  }),
  pacing: CustomPacingInputSchema.optional(),
});

const AudioMixSchema = z.object({
  clip_volume: z.number().min(0).max(1.5),
  music_volume: z.number().min(0).max(1.5),
});

const CreateJobSchema = z.object({
  mood: z.enum(["nostalgic", "cinematic", "hype", "chill", "dreamy", "energetic"]),
  clip_ids: z.array(z.string().uuid()).min(1).max(10),
  generate_soundtrack: z.boolean().optional(),
  custom_mood: CustomMoodInputSchema.optional(),
  audio_mix: AudioMixSchema.optional(),
});

function normaliseClipIds(clipIds: string[]) {
  return [...new Set(clipIds)];
}

function orderByIds<T extends { id: string }>(items: T[], ids: string[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => itemsById.get(id)).filter(Boolean) as T[];
}

async function createSignedUrls(
  bucket: "clips" | "outputs",
  paths: string[],
  expiresIn: number,
  downloadNames?: (string | null)[]
) {
  return Promise.all(
    paths.map(async (storagePath, index) => {
      const downloadName = downloadNames?.[index];
      const options = downloadName ? { download: downloadName } : undefined;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, expiresIn, options);
      if (error || !data?.signedUrl) {
        return null;
      }

      return data.signedUrl;
    })
  );
}

function gradedDownloadName(fileName: string, mood: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : ".mp4";
  return `${base}-${mood}${ext}`;
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const parsedBody = CreateJobSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsedBody.error.flatten(),
      });
    }

    const user = (req as any).user;
    const rateLimit = consumeJobCreationRateLimit(user.id);
    res.set(buildRateLimitHeaders(rateLimit));

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "Too many grading jobs started. Please wait before creating another job.",
        code: "JOB_RATE_LIMITED",
        retry_after_seconds: rateLimit.retryAfterSeconds,
      });
    }

    const generateSoundtrack = Boolean(parsedBody.data.generate_soundtrack);
    if (generateSoundtrack) {
      const genLimit = consumeSoundtrackGenRateLimit(user.id);
      if (!genLimit.allowed) {
        return res.status(429).json({
          error: "Soundtrack generation limit reached for today. Try again later or use the curated library.",
          code: "SOUNDTRACK_GEN_RATE_LIMITED",
          retry_after_seconds: genLimit.retryAfterSeconds,
        });
      }
    }

    const clipIds = normaliseClipIds(parsedBody.data.clip_ids);

    const { data: clips, error: clipsError } = await supabase
      .from("clips")
      .select("id")
      .eq("user_id", user.id)
      .in("id", clipIds);

    if (clipsError) {
      return res.status(500).json({ error: clipsError.message });
    }

    if (!clips || clips.length !== clipIds.length) {
      return res.status(400).json({ error: "Some clips were not found or do not belong to you" });
    }

    const customMood = parsedBody.data.custom_mood ?? null;
    const audioMix = parsedBody.data.audio_mix ?? null;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        mood: parsedBody.data.mood,
        clip_ids: clipIds,
        status: "queued",
        output_paths: [],
        error_message: null,
        custom_mood: customMood,
        audio_mix: audioMix,
      })
      .select("*")
      .single();

    if (jobError || !job) {
      return res.status(500).json({ error: jobError?.message || "Failed to create job" });
    }

    await enqueueGradingJob({
      jobId: job.id,
      mood: parsedBody.data.mood,
      clipIds,
      generateSoundtrack,
      customMood: customMood ?? undefined,
      audioMix: audioMix ?? undefined,
    });

    return res.status(201).json({
      job_id: job.id,
      jobId: job.id,
      status: "queued",
      message: "Job created and processing started",
    });
  } catch (error: any) {
    console.error("Create job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    jobs: jobs || [],
    total: jobs?.length || 0,
  });
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const clipIds = Array.isArray(job.clip_ids) ? job.clip_ids : [];
    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];

    const { data: clips, error: clipsError } = await supabase
      .from("clips")
      .select("id, file_name, duration, storage_path")
      .eq("user_id", userId)
      .in("id", clipIds);

    if (clipsError) {
      return res.status(500).json({ error: clipsError.message });
    }

    const orderedClips = orderByIds(clips || [], clipIds);
    const originalUrls = await createSignedUrls(
      "clips",
      orderedClips.map((clip: any) => clip.storage_path),
      3600
    );
    const isComplete = job.status === "complete" && outputPaths.length > 0;
    const outputUrls = isComplete ? await createSignedUrls("outputs", outputPaths, 3600) : [];
    const downloadUrls = isComplete
      ? await createSignedUrls(
          "outputs",
          outputPaths,
          3600,
          orderedClips.map((clip: any) => gradedDownloadName(clip.file_name, job.mood))
        )
      : [];

    const assembledPath: string | null = job.assembled_path || null;
    const [assembledUrl, assembledDownloadUrl] = assembledPath
      ? await Promise.all([
          createSignedUrls("outputs", [assembledPath], 3600).then((urls) => urls[0]),
          createSignedUrls("outputs", [assembledPath], 3600, [`clipvibe-${job.mood}.mp4`]).then(
            (urls) => urls[0]
          ),
        ])
      : [null, null];

    return res.json({
      ...job,
      assembled_path: assembledPath,
      assembled_url: assembledUrl,
      assembled_download_url: assembledDownloadUrl,
      clips: orderedClips.map((clip: any, index: number) => ({
        id: clip.id,
        file_name: clip.file_name,
        duration: clip.duration,
        original_url: originalUrls[index] || null,
        output_url: outputUrls[index] || null,
        output_download_url: downloadUrls[index] || null,
      })),
      output_urls: outputUrls,
      original_urls: originalUrls,
    });
  } catch (error: any) {
    console.error("Get job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/download", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (job.status !== "complete") {
      return res.status(400).json({
        error: "Job not complete yet",
        status: job.status,
      });
    }

    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];
    if (outputPaths.length === 0 && !job.assembled_path) {
      return res.status(404).json({ error: "No output files available" });
    }

    const downloadUrls = await Promise.all(
      outputPaths.map(async (storagePath: string, index: number) => {
        const downloadName = `clip-${index + 1}-${job.mood}.mp4`;
        const { data } = await supabase.storage
          .from("outputs")
          .createSignedUrl(storagePath, 7200, { download: downloadName });
        return {
          clip_index: index + 1,
          url: data?.signedUrl || "",
          path: storagePath,
        };
      })
    );

    let assembledDownload: { url: string; path: string } | null = null;
    if (job.assembled_path) {
      const { data } = await supabase.storage
        .from("outputs")
        .createSignedUrl(job.assembled_path, 7200, { download: `clipvibe-${job.mood}.mp4` });
      assembledDownload = { url: data?.signedUrl || "", path: job.assembled_path };
    }

    return res.json({
      job_id: job.id,
      mood: job.mood,
      assembled: assembledDownload,
      download_urls: downloadUrls,
      expires_in: "2 hours",
    });
  } catch (error: any) {
    console.error("Download job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const RenderSchema = z.object({
  resolution: z.string(),
});

router.post("/:id/render", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const parsed = RenderSchema.safeParse(req.body);
    if (!parsed.success || !isResolutionKey(parsed.data.resolution)) {
      return res.status(400).json({ error: "Invalid resolution. Use 1080p, 720p, or 480p." });
    }
    const resolution: ResolutionKey = parsed.data.resolution;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, mood, assembled_path, status")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (job.status !== "complete" || !job.assembled_path) {
      return res.status(400).json({ error: "Job has no assembled output yet" });
    }

    const cachedPath = `${userId}/${id}/assembled-${resolution}.mp4`;
    const downloadName = `clipvibe-${job.mood}-${resolution}.mp4`;

    const cachedSigned = await supabase.storage
      .from("outputs")
      .createSignedUrl(cachedPath, 3600, { download: downloadName });

    if (cachedSigned.data?.signedUrl) {
      const head = await fetch(cachedSigned.data.signedUrl, { method: "HEAD" });
      if (head.ok) {
        return res.json({
          job_id: id,
          resolution,
          path: cachedPath,
          download_url: cachedSigned.data.signedUrl,
          cached: true,
        });
      }
    }

    const sourceSigned = await supabase.storage
      .from("outputs")
      .createSignedUrl(job.assembled_path, 600);
    if (sourceSigned.error || !sourceSigned.data?.signedUrl) {
      return res.status(500).json({ error: "Could not access source video" });
    }

    const sourceResponse = await fetch(sourceSigned.data.signedUrl);
    if (!sourceResponse.ok) {
      return res.status(500).json({ error: "Failed to download source video" });
    }
    const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());

    const transcoded = await transcodeToBuffer(sourceBuffer, resolution);

    const { error: uploadError } = await supabase.storage
      .from("outputs")
      .upload(cachedPath, transcoded, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (uploadError) {
      return res.status(500).json({ error: `Upload failed: ${uploadError.message}` });
    }

    const finalSigned = await supabase.storage
      .from("outputs")
      .createSignedUrl(cachedPath, 3600, { download: downloadName });

    return res.json({
      job_id: id,
      resolution,
      path: cachedPath,
      download_url: finalSigned.data?.signedUrl || "",
      cached: false,
    });
  } catch (error: any) {
    console.error("Render endpoint error:", error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("output_paths, assembled_path")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const outputPaths = Array.isArray(job.output_paths) ? job.output_paths : [];
    const pathsToRemove = [...outputPaths, ...(job.assembled_path ? [job.assembled_path] : [])];
    for (const resolution of ["1080p", "720p", "480p"] as const) {
      pathsToRemove.push(`${userId}/${id}/assembled-${resolution}.mp4`);
    }
    if (pathsToRemove.length > 0) {
      await supabase.storage.from("outputs").remove(pathsToRemove);
    }

    const { error: deleteError } = await supabase
      .from("jobs")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    return res.json({ message: "Job deleted successfully" });
  } catch (error: any) {
    console.error("Delete job error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
