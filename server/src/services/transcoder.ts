import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

const RESOLUTIONS = {
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
  "480p": { width: 854, height: 480 },
} as const;

export type ResolutionKey = keyof typeof RESOLUTIONS;

export function isResolutionKey(value: unknown): value is ResolutionKey {
  return typeof value === "string" && value in RESOLUTIONS;
}

export function resolutionLabel(key: ResolutionKey): string {
  return key;
}

export async function transcodeToBuffer(
  source: Buffer,
  resolution: ResolutionKey,
  timeoutMs = 300_000
): Promise<Buffer> {
  const { width, height } = RESOLUTIONS[resolution];
  const tag = crypto.randomBytes(6).toString("hex");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `clipvibe-${tag}-`));
  const inputPath = path.join(tmpDir, "in.mp4");
  const outputPath = path.join(tmpDir, `out-${resolution}.mp4`);

  try {
    await fs.writeFile(inputPath, source);
    await runFfmpeg(inputPath, outputPath, width, height, timeoutMs);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function runFfmpeg(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const filter =
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

    const args = [
      "-y",
      "-i", inputPath,
      "-vf", filter,
      "-c:v", "libx264",
      "-crf", "23",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "192k",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args);
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderr.split("\n").slice(-8).join("\n").trim();
      reject(new Error(`ffmpeg exited ${code}: ${tail}`));
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
