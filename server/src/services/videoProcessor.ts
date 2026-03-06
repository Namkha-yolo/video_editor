/**
 * Video Processing Orchestrator
 * Coordinates the entire video grading pipeline
 */
import fs from "fs/promises";
import path from "path";
import os from "os";
import axios from "axios";
import { supabase } from "../config/supabase.js";
import { generateGradingFilters, buildFallbackFilters } from "./moodEngine.js";
import type { Mood } from "../../../shared/types/mood.js";
import type { ClipAnalysis } from "../../../shared/types/clip.js";
import { io } from "../index.js";

const AI_PIPELINE_URL = process.env.AI_PIPELINE_URL || "http://localhost:8000";

interface ProcessJobParams {
  jobId: string;
  mood: Mood;
  clipIds: string[];
  userId: string;
}

interface ClipRecord {
  id: string;
  file_name: string;
  storage_path: string;
  user_id: string;
}

/**
 * Main orchestrator - processes a video grading job end-to-end
 */
export async function processJob(params: ProcessJobParams): Promise<void> {
  const { jobId, mood, clipIds, userId } = params;
  const tempDir = path.join(os.tmpdir(), `clipvibe-job-${jobId}`);

  try {
    console.log(`[Job ${jobId}] Starting processing...`);
    await fs.mkdir(tempDir, { recursive: true });

    // Update status to analyzing
    await updateJobStatus(jobId, "analyzing");
    io.to(`job:${jobId}`).emit("progress", { 
      status: "analyzing", 
      step: "Analyzing clips...",
      progress: 0 
    });

    // Step 1: Fetch clip records from DB
    const { data: clips, error: fetchError } = await supabase
      .from("clips")
      .select("*")
      .in("id", clipIds)
      .eq("user_id", userId);

    if (fetchError || !clips || clips.length === 0) {
      throw new Error(`Failed to fetch clips: ${fetchError?.message || "No clips found"}`);
    }

    console.log(`[Job ${jobId}] Found ${clips.length} clips`);

    // Step 2: Download clips from Supabase Storage
    const localClipPaths: { [clipId: string]: string } = {};
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i] as ClipRecord;
      console.log(`[Job ${jobId}] Downloading clip ${i + 1}/${clips.length}: ${clip.file_name}`);
      
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("clips")
        .download(clip.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download ${clip.file_name}: ${downloadError?.message}`);
      }

      const localPath = path.join(tempDir, `input-${clip.id}${path.extname(clip.file_name)}`);
      const buffer = Buffer.from(await fileData.arrayBuffer());
      await fs.writeFile(localPath, buffer);
      localClipPaths[clip.id] = localPath;

      io.to(`job:${jobId}`).emit("progress", {
        status: "analyzing",
        step: `Downloaded ${i + 1}/${clips.length} clips`,
        progress: (i + 1) / clips.length * 30
      });
    }

    // Step 3: Analyze each clip via AI pipeline
    const analyses: ClipAnalysis[] = [];
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i] as ClipRecord;
      const localPath = localClipPaths[clip.id];
      
      console.log(`[Job ${jobId}] Analyzing clip ${i + 1}/${clips.length}`);

      try {
        const formData = new FormData();
        const fileBuffer = await fs.readFile(localPath);
        const blob = new Blob([fileBuffer]);
        formData.append("file", blob, clip.file_name);

        const response = await axios.post(`${AI_PIPELINE_URL}/analyze`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 60000, // 60 second timeout
        });

        analyses.push({
          clip_id: clip.id,
          ...response.data,
        });

        io.to(`job:${jobId}`).emit("progress", {
          status: "analyzing",
          step: `Analyzed ${i + 1}/${clips.length} clips`,
          progress: 30 + (i + 1) / clips.length * 20
        });
      } catch (error: any) {
        console.error(`[Job ${jobId}] Analysis failed for ${clip.file_name}:`, error.message);
        // Use default values if analysis fails
        analyses.push({
          clip_id: clip.id,
          brightness: 0.5,
          contrast: 0.5,
          dominant_colors: ["#808080"],
          color_temperature: 5500,
        });
      }
    }

    console.log(`[Job ${jobId}] Analysis complete. Generating filters...`);

    // Step 4: Generate per-clip FFmpeg filters via Claude
    await updateJobStatus(jobId, "grading");
    io.to(`job:${jobId}`).emit("progress", { 
      status: "grading", 
      step: "Generating adaptive filters with Claude AI...",
      progress: 50 
    });

    let gradingResults;
    try {
      gradingResults = await generateGradingFilters(mood, analyses);
    } catch (error: any) {
      console.warn(`[Job ${jobId}] Claude API failed, using fallback filters:`, error.message);
      // Fallback: use preset-based filters
      gradingResults = analyses.map((analysis) => ({
        clip_id: analysis.clip_id,
        filters: buildFallbackFilters(mood),
      }));
    }

    console.log(`[Job ${jobId}] Filter generation complete. Applying grades...`);

    // Step 5: Apply FFmpeg filters to each clip
    const outputPaths: string[] = [];
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i] as ClipRecord;
      const inputPath = localClipPaths[clip.id];
      const filters = gradingResults.find((r) => r.clip_id === clip.id)?.filters || buildFallbackFilters(mood);
      
      console.log(`[Job ${jobId}] Grading clip ${i + 1}/${clips.length}: ${clip.file_name}`);

      try {
        const formData = new FormData();
        const fileBuffer = await fs.readFile(inputPath);
        const blob = new Blob([fileBuffer]);
        formData.append("file", blob, clip.file_name);
        formData.append("filters", filters);

        const response = await axios.post(`${AI_PIPELINE_URL}/grade`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000, // 2 minute timeout
          responseType: "arraybuffer",
        });

        // Save graded file locally
        const gradedPath = path.join(tempDir, `graded-${clip.id}${path.extname(clip.file_name)}`);
        await fs.writeFile(gradedPath, Buffer.from(response.data));

        // Upload to Supabase Storage outputs bucket
        const outputStoragePath = `${userId}/${jobId}/${clip.id}${path.extname(clip.file_name)}`;
        const gradedBuffer = await fs.readFile(gradedPath);
        
        const { error: uploadError } = await supabase.storage
          .from("outputs")
          .upload(outputStoragePath, gradedBuffer, {
            contentType: "video/mp4",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        outputPaths.push(outputStoragePath);

        io.to(`job:${jobId}`).emit("progress", {
          status: "grading",
          step: `Graded ${i + 1}/${clips.length} clips`,
          progress: 50 + (i + 1) / clips.length * 45
        });
      } catch (error: any) {
        console.error(`[Job ${jobId}] Grading failed for ${clip.file_name}:`, error.message);
        throw new Error(`Grading failed for ${clip.file_name}: ${error.message}`);
      }
    }

    // Step 6: Update job record with outputs
    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        status: "complete",
        output_paths: outputPaths,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError) {
      throw new Error(`Failed to update job: ${updateError.message}`);
    }

    console.log(`[Job ${jobId}] Processing complete!`);
    io.to(`job:${jobId}`).emit("progress", { 
      status: "complete", 
      step: "All clips graded successfully!",
      progress: 100,
      output_paths: outputPaths
    });

  } catch (error: any) {
    console.error(`[Job ${jobId}] Processing failed:`, error);
    
    // Update job status to failed
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    io.to(`job:${jobId}`).emit("progress", { 
      status: "failed", 
      error: error.message 
    });

    throw error;
  } finally {
    // Step 7: Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log(`[Job ${jobId}] Temp files cleaned up`);
    } catch (cleanupError) {
      console.error(`[Job ${jobId}] Cleanup failed:`, cleanupError);
    }
  }
}

/**
 * Helper: Update job status in database
 */
async function updateJobStatus(jobId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error(`Failed to update job ${jobId} status:`, error);
  }
}
