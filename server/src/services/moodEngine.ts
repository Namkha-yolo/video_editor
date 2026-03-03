import Anthropic from "@anthropic-ai/sdk";
import type { Mood, MoodPreset } from "../../../shared/types/mood.js";
import type { ClipAnalysis } from "../../../shared/types/clip.js";

// ── Claude client ────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── 6 mood presets with baseline FFmpeg grading parameters ────────────────
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

// ── Helper: get all presets as an array ──────────────────────────────────
export function getAllPresets(): MoodPreset[] {
  return Object.values(moodPresets);
}

// ── Helper: get a single preset by mood name ────────────────────────────
export function getPreset(mood: Mood): MoodPreset {
  return moodPresets[mood];
}

// ── Per-clip grading result returned by Claude ──────────────────────────
export interface ClipGradingResult {
  clip_id: string;
  filters: string; // FFmpeg -vf filter chain string
}

// ── Build the prompt that asks Claude for per-clip FFmpeg filters ────────
function buildPrompt(mood: Mood, clips: ClipAnalysis[]): string {
  const preset = moodPresets[mood];

  const clipDescriptions = clips
    .map(
      (c, i) =>
        `Clip ${i + 1} (id: ${c.clip_id}):
  - Brightness: ${c.brightness}
  - Contrast: ${c.contrast}
  - Dominant colors: ${c.dominant_colors.join(", ")}
  - Color temperature: ${c.color_temperature}K`
    )
    .join("\n\n");

  return `You are a professional colorist. Your job is to generate FFmpeg filter chains that color grade video clips to achieve a specific mood.

TARGET MOOD: "${preset.label}" — ${preset.description}

BASELINE GRADING PARAMETERS FOR THIS MOOD:
- Temperature: ${preset.grading.temperature}K
- Saturation: ${preset.grading.saturation}
- Contrast: ${preset.grading.contrast}
- Brightness: ${preset.grading.brightness}
- Vignette: ${preset.grading.vignette}
- Grain: ${preset.grading.grain}

IMPORTANT: These are baseline values. You must ADAPT them per clip based on each clip's current visual properties. A dark clip needs different adjustments than a bright clip to reach the same mood. The goal is that all clips look cohesive after grading.

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

// ── Call Claude API and get per-clip FFmpeg filter chains ────────────────
export async function generateGradingFilters(
  mood: Mood,
  clips: ClipAnalysis[]
): Promise<ClipGradingResult[]> {
  const prompt = buildPrompt(mood, clips);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  // Extract text from Claude's response
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text response");
  }

  const rawText = textBlock.text.trim();

  // Parse JSON — Claude might wrap in ```json ... ```, so strip that
  const jsonStr = rawText.replace(/^```json?\s*/, "").replace(/\s*```$/, "");

  let results: ClipGradingResult[];
  try {
    results = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${rawText}`);
  }

  // Validate structure
  if (!Array.isArray(results)) {
    throw new Error("Claude response is not an array");
  }

  for (const r of results) {
    if (!r.clip_id || typeof r.filters !== "string") {
      throw new Error(
        `Invalid grading result — missing clip_id or filters: ${JSON.stringify(r)}`
      );
    }
  }

  return results;
}

// ── Fallback: build a filter chain from the preset alone (no Claude) ────
export function buildFallbackFilters(mood: Mood): string {
  const g = moodPresets[mood].grading;
  const parts: string[] = [
    `eq=brightness=${g.brightness}:contrast=${g.contrast}:saturation=${g.saturation}`,
    `colortemperature=temperature=${g.temperature}`,
  ];
  if (g.vignette > 0) {
    const vignetteAngle = Math.round((Math.PI / g.vignette) * 100) / 100;
    parts.push(`vignette=${vignetteAngle}`);
  }
  if (g.grain > 0) {
    parts.push(`noise=c0s=${g.grain}:c0f=t`);
  }
  return parts.join(",");
}
