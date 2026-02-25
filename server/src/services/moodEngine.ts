import type { Mood, MoodPreset } from "../../../shared/types/mood.js";

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
