import Anthropic from "@anthropic-ai/sdk";
import type { CustomMoodPreset, Mood, MoodPreset } from "../../../shared/types/mood.js";
import type { ClipAnalysis } from "../../../shared/types/clip.js";
import { reserveClaudeRateLimit } from "./rateLimiters.js";

export type MoodInput = Mood | CustomMoodPreset;

export const moodPresets: Record<Mood, MoodPreset> = {
  nostalgic: {
    name: "nostalgic",
    label: "Nostalgic",
    description: "Warm tones, soft contrast, faded highlights",
    color: "#D4A574",
    grading: {
      temperature: 6500,
      saturation: 0.85,
      contrast: 0.9,
      brightness: 0.05,
      vignette: 0.5,
      grain: 12,
    },
  },
  cinematic: {
    name: "cinematic",
    label: "Cinematic",
    description: "Cool shadows, high contrast, desaturated",
    color: "#4A6FA5",
    grading: {
      temperature: 4800,
      saturation: 0.8,
      contrast: 1.3,
      brightness: -0.05,
      vignette: 0.6,
      grain: 5,
    },
  },
  hype: {
    name: "hype",
    label: "Hype",
    description: "High saturation, vibrant, punchy contrast",
    color: "#FF6B6B",
    grading: {
      temperature: 5800,
      saturation: 1.4,
      contrast: 1.25,
      brightness: 0.08,
      vignette: 0.3,
      grain: 3,
    },
  },
  chill: {
    name: "chill",
    label: "Chill",
    description: "Soft tones, low contrast, gentle warmth",
    color: "#7EC8AC",
    grading: {
      temperature: 5600,
      saturation: 0.9,
      contrast: 0.85,
      brightness: 0.03,
      vignette: 0.2,
      grain: 8,
    },
  },
  dreamy: {
    name: "dreamy",
    label: "Dreamy",
    description: "Pastel tints, lifted shadows, soft glow",
    color: "#B490CA",
    grading: {
      temperature: 5400,
      saturation: 0.75,
      contrast: 0.8,
      brightness: 0.1,
      vignette: 0.4,
      grain: 6,
    },
  },
  energetic: {
    name: "energetic",
    label: "Energetic",
    description: "Warm highlights, boosted saturation, sharp",
    color: "#FFB347",
    grading: {
      temperature: 6200,
      saturation: 1.3,
      contrast: 1.15,
      brightness: 0.06,
      vignette: 0.15,
      grain: 2,
    },
  },
};

export function getAllPresets(): MoodPreset[] {
  return Object.values(moodPresets);
}

export function getPreset(mood: Mood): MoodPreset {
  return moodPresets[mood];
}

export interface ClipGradingResult {
  clip_id: string;
  filters: string;
}

export interface GenerateGradingFiltersOptions {
  requesterId?: string;
  now?: () => number;
  reserveClaudeCapacity?: (requesterId: string, now?: number) => unknown;
  anthropicClient?: {
    messages: {
      create: (payload: Record<string, unknown>) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>;
    };
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  return new Anthropic({ apiKey });
}

function isCustomMoodPreset(mood: MoodInput): mood is CustomMoodPreset {
  return typeof mood === "object" && mood !== null && "grading" in mood;
}

function resolveMoodPreset(mood: MoodInput): MoodPreset | CustomMoodPreset {
  return isCustomMoodPreset(mood) ? mood : moodPresets[mood];
}

function getVignetteDenominator(strength: number) {
  return clamp(Math.round(8 - strength * 4), 4, 8);
}

function buildPrompt(mood: MoodInput, clips: ClipAnalysis[]): string {
  const preset = resolveMoodPreset(mood);

  const clipDescriptions = clips
    .map(
      (clip, index) =>
        `Clip ${index + 1} (id: ${clip.clip_id}):\n  - Brightness: ${clip.brightness}\n  - Contrast: ${clip.contrast}\n  - Dominant colors: ${clip.dominant_colors.join(", ")}\n  - Color temperature: ${clip.color_temperature}K`
    )
    .join("\n\n");

  return `You are a professional colorist. Your job is to generate FFmpeg filter chains that color grade video clips to achieve a specific mood.

TARGET MOOD: "${preset.label}" - ${preset.description}

BASELINE GRADING PARAMETERS FOR THIS MOOD:
- Temperature: ${preset.grading.temperature}K
- Saturation: ${preset.grading.saturation}
- Contrast: ${preset.grading.contrast}
- Brightness: ${preset.grading.brightness}
- Vignette: ${preset.grading.vignette}
- Grain: ${preset.grading.grain}

IMPORTANT: These are baseline values. You must adapt them per clip based on each clip's current visual properties. A dark clip needs different adjustments than a bright clip to reach the same mood. The goal is that all clips look cohesive after grading.

HERE ARE THE CLIPS TO GRADE:

${clipDescriptions}

For each clip, return an FFmpeg -vf filter chain string that will transform it to match the "${preset.label}" mood. Use these FFmpeg filters:
- eq=brightness=X:contrast=X:saturation=X (brightness: -1.0 to 1.0, contrast: 0.0 to 2.0, saturation: 0.0 to 3.0)
- colortemperature=temperature=X (in Kelvin, 1000-10000)
- colorbalance=rs=X:gs=X:bs=X:rm=X:gm=X:bm=X:rh=X:gh=X:bh=X (each -1.0 to 1.0)
- vignette=PI/X (smaller X = stronger vignette, use 4 to 8 range)
- noise=c0s=X:c0f=t (grain strength 0-30)

Chain filters with commas. Example: eq=brightness=0.1:saturation=1.3,colortemperature=temperature=5500,vignette=PI/4,noise=c0s=10:c0f=t

Respond with ONLY a JSON array, no markdown, no explanation. Each element must have "clip_id" and "filters" keys:
[
  { "clip_id": "abc-123", "filters": "eq=brightness=0.05:contrast=1.2:saturation=0.85,colortemperature=temperature=6500,vignette=PI/5,noise=c0s=12:c0f=t" }
]`;
}

export async function generateGradingFilters(
  mood: MoodInput,
  clips: ClipAnalysis[],
  options: GenerateGradingFiltersOptions = {}
): Promise<ClipGradingResult[]> {
  if (clips.length === 0) {
    return [];
  }

  const requesterId = options.requesterId || "anonymous";
  const now = options.now?.() ?? Date.now();
  (options.reserveClaudeCapacity || reserveClaudeRateLimit)(requesterId, now);

  const anthropic = options.anthropicClient || getAnthropicClient();
  const prompt = buildPrompt(mood, clips);
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text response");
  }

  const rawText = (textBlock.text || "").trim();
  if (!rawText) {
    throw new Error("Claude returned an empty text response");
  }
  const jsonText = rawText.replace(/^```json?\s*/, "").replace(/\s*```$/, "");

  let results: ClipGradingResult[];
  try {
    results = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${rawText}`);
  }

  if (!Array.isArray(results)) {
    throw new Error("Claude response is not an array");
  }

  for (const result of results) {
    if (!result.clip_id || typeof result.filters !== "string") {
      throw new Error(
        `Invalid grading result - missing clip_id or filters: ${JSON.stringify(result)}`
      );
    }
  }

  return results;
}

export function buildAdaptiveFallbackFilters(mood: MoodInput, clip: ClipAnalysis): string {
  const grading = resolveMoodPreset(mood).grading;
  const brightnessAdjustment = clamp((0.5 - clip.brightness) * 0.35, -0.15, 0.15);
  const contrastAdjustment = clamp((0.5 - clip.contrast) * 0.4, -0.2, 0.2);
  const saturationAdjustment = clamp((0.55 - clip.contrast) * 0.15, -0.1, 0.1);
  const temperatureTarget = clamp(
    Math.round(grading.temperature + (grading.temperature - clip.color_temperature) * 0.25),
    1000,
    10000
  );
  const vignetteDenominator = getVignetteDenominator(grading.vignette);
  const parts = [
    `eq=brightness=${round(clamp(grading.brightness + brightnessAdjustment, -1, 1))}:contrast=${round(
      clamp(grading.contrast + contrastAdjustment, 0, 2)
    )}:saturation=${round(clamp(grading.saturation + saturationAdjustment, 0, 3))}`,
    `colortemperature=temperature=${temperatureTarget}`,
  ];

  if (grading.vignette > 0) {
    parts.push(`vignette=PI/${vignetteDenominator}`);
  }

  if (grading.grain > 0) {
    parts.push(`noise=c0s=${grading.grain}:c0f=t`);
  }

  return parts.join(",");
}

export function buildFallbackFilters(mood: MoodInput): string {
  const grading = resolveMoodPreset(mood).grading;

  return buildAdaptiveFallbackFilters(mood, {
    clip_id: "fallback",
    brightness: 0.5,
    contrast: 0.5,
    dominant_colors: [],
    color_temperature: grading.temperature,
  });
}
