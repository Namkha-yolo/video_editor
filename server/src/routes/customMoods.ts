import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { supabase } from "../config/supabase.js";
import {
  generateMoodRecipe,
  isAvailable as moodGenAvailable,
  MoodGenerationError,
} from "../services/claudeMoodGenerator.js";
import {
  buildRateLimitHeaders,
  consumeCustomMoodRateLimit,
} from "../services/rateLimiters.js";

const router: RouterType = Router();

const CreateCustomMoodSchema = z.object({
  prompt: z.string().min(1).max(500),
});

interface CustomMoodBuildResponse {
  name: string;
  title: string;
  description: string;
  runtime: {
    vignette: number;
    grain: number;
    halation: number;
    person_protection: number;
  };
  pacing: {
    speed: number;
    transition: string;
    transition_duration: number;
    audio_highpass: number;
    audio_lowpass: number;
  };
  cube: string;
}

router.post("/", requireAuth, async (req, res) => {
  try {
    if (!moodGenAvailable()) {
      return res.status(503).json({
        error: "Custom mood generation is not configured. Set ANTHROPIC_API_KEY on the server.",
        code: "CUSTOM_MOOD_UNAVAILABLE",
      });
    }

    const parsed = CreateCustomMoodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }

    const user = (req as any).user;
    const limit = consumeCustomMoodRateLimit(user.id);
    res.set(buildRateLimitHeaders(limit));
    if (!limit.allowed) {
      return res.status(429).json({
        error: "Custom mood generation limit reached. Try again later or pick a preset mood.",
        code: "CUSTOM_MOOD_RATE_LIMITED",
        retry_after_seconds: limit.retryAfterSeconds,
      });
    }

    const prompt = parsed.data.prompt;

    let recipe;
    try {
      recipe = await generateMoodRecipe(prompt);
    } catch (err) {
      if (err instanceof MoodGenerationError) {
        return res.status(502).json({ error: err.message });
      }
      throw err;
    }

    const pipelineUrl = process.env.AI_PIPELINE_URL || "http://localhost:8000";
    const buildResponse = await fetch(`${pipelineUrl}/custom-mood/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe, size: 33 }),
    });

    if (!buildResponse.ok) {
      const text = await buildResponse.text().catch(() => "");
      return res.status(500).json({
        error: `LUT build failed: ${text || buildResponse.statusText}`,
      });
    }

    const buildResult = (await buildResponse.json()) as CustomMoodBuildResponse;
    if (!buildResult?.cube || typeof buildResult.cube !== "string") {
      return res.status(500).json({ error: "LUT build returned no cube data" });
    }

    const promptHash = crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16);
    const lutPath = `${user.id}/custom-moods/${promptHash}.cube`;

    const { error: uploadError } = await supabase.storage
      .from("outputs")
      .upload(lutPath, Buffer.from(buildResult.cube, "utf-8"), {
        contentType: "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ error: `Failed to upload LUT: ${uploadError.message}` });
    }

    return res.status(201).json({
      lut_path: lutPath,
      name: buildResult.name,
      title: buildResult.title,
      description: buildResult.description,
      runtime: buildResult.runtime,
      pacing: buildResult.pacing,
    });
  } catch (err: any) {
    console.error("Custom mood creation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
