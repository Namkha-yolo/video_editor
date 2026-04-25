export type Mood =
  | "nostalgic"
  | "cinematic"
  | "hype"
  | "chill"
  | "dreamy"
  | "energetic";

export interface MoodGrading {
  temperature: number;
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
  grain: number;
}

export interface MoodPreset {
  name: Mood;
  label: string;
  description: string;
  color: string;
  grading: MoodGrading;
}

export interface CustomMoodPreset {
  id: string;
  label: string;
  description?: string;
  color?: string;
  grading: MoodGrading;
}

export interface MoodOption {
  value: Mood;
  label: string;
  color: string;
  borderColor: string;
  icon: string;
  description: string;
}

export const moods: MoodOption[] = [
  {
    value: "nostalgic",
    label: "Nostalgic",
    color: "bg-violet-50 text-violet-700",
    borderColor: "border-violet-400",
    icon: "🌅",
    description: "Warm tones, slow fades",
  },
  {
    value: "cinematic",
    label: "Cinematic",
    color: "bg-sky-50 text-sky-700",
    borderColor: "border-sky-400",
    icon: "🎬",
    description: "Dramatic, high contrast",
  },
  {
    value: "hype",
    label: "Hype",
    color: "bg-red-50 text-red-700",
    borderColor: "border-red-400",
    icon: "⚡",
    description: "Fast cuts, energy",
  },
  {
    value: "chill",
    label: "Chill",
    color: "bg-emerald-50 text-emerald-700",
    borderColor: "border-emerald-400",
    icon: "🍃",
    description: "Soft, relaxed, lo-fi",
  },
  {
    value: "dreamy",
    label: "Dreamy",
    color: "bg-purple-50 text-purple-700",
    borderColor: "border-purple-400",
    icon: "✨",
    description: "Pastel tints, soft glow",
  },
  {
    value: "energetic",
    label: "Energetic",
    color: "bg-amber-50 text-amber-700",
    borderColor: "border-amber-400",
    icon: "🔥",
    description: "Warm highlights, sharp, vibrant",
  },
];

