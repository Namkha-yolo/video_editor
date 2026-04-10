import type { JobStatus, Mood } from "@clipvibe/shared";

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  analyzing: "Analyzing",
  grading: "Grading",
  complete: "Complete",
  failed: "Error",
};

export const MOODS: Mood[] = ["nostalgic", "cinematic", "hype", "chill", "dreamy", "energetic"];

export function formatMood(mood: string) {
  return mood.charAt(0).toUpperCase() + mood.slice(1);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function shortJobId(id: string) {
  return id.slice(0, 8);
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
