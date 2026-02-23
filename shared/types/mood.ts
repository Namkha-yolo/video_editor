export type Mood =
  | "nostalgic"
  | "cinematic"
  | "hype"
  | "chill"
  | "dreamy"
  | "energetic";

export interface MoodPreset {
  name: Mood;
  label: string;
  description: string;
  color: string;
  grading: {
    temperature: number;
    saturation: number;
    contrast: number;
    brightness: number;
    vignette: number;
    grain: number;
  };
}
