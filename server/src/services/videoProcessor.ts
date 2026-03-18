import { supabase } from "../config/supabase.js";
import { emitJobProgress } from "./jobEvents.js";
import {
  buildAdaptiveFallbackFilters,
  generateGradingFilters,
  type ClipGradingResult,
} from "./moodEngine.js";
import { ClaudeRateLimitError } from "./rateLimiters.js";
import type { Mood } from "../../../shared/types/mood.js";
import type { ClipAnalysis } from "../../../shared/types/clip.js";

interface ClipRecord {
  id: string;
  user_id: string;
  file_name: string;
  storage_path: string;
}

interface SupabaseErrorLike {
  message: string;
}

interface SignedUrlResult {
  data: { signedUrl: string } | null;
  error: SupabaseErrorLike | null;
}

interface UploadResult {
  error: SupabaseErrorLike | null;
}

interface ProcessorSupabase {
  from(table: "clips"): {
    select(columns: string): {
      in(column: string, values: string[]): Promise<{ data: ClipRecord[] | null; error: SupabaseErrorLike | null }>;
    };
  };
  from(table: "jobs"): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<unknown>;
    };
  };
  storage: {
    from(bucket: "clips" | "outputs"): {
      createSignedUrl(path: string, expiresIn: number): Promise<SignedUrlResult>;
      upload(
        path: string,
        body: Buffer,
        options: { contentType: string; upsert: boolean }
      ): Promise<UploadResult>;
      remove(paths: string[]): Promise<unknown>;
    };
  };
}

export interface VideoProcessorDependencies {
  supabaseClient: ProcessorSupabase;
  fetchImpl: typeof fetch;
  pipelineUrl: string;
  emitProgress: typeof emitJobProgress;
  generateFilters: typeof generateGradingFilters;
  buildFallback: typeof buildAdaptiveFallbackFilters;
  now: () => string;
}

function getDependencies(
  overrides: Partial<VideoProcessorDependencies> = {}
): VideoProcessorDependencies {
  return {
    supabaseClient: supabase as unknown as ProcessorSupabase,
    fetchImpl: fetch,
    pipelineUrl: process.env.AI_PIPELINE_URL || "http://localhost:8000",
    emitProgress: emitJobProgress,
    generateFilters: generateGradingFilters,
    buildFallback: buildAdaptiveFallbackFilters,
    now: () => new Date().toISOString(),
    ...overrides,
  };
}

function normaliseClipOrder(clips: ClipRecord[], clipIds: string[]) {
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const orderedClips = clipIds.map((clipId) => clipsById.get(clipId)).filter(Boolean) as ClipRecord[];

  if (orderedClips.length !== clipIds.length) {
    throw new Error("Could not find clips for this job");
  }

  return orderedClips;
}

function buildOutputPath(jobId: string, clip: ClipRecord) {
  const extension = clip.file_name.split(".").pop() || "mp4";
  return `${clip.user_id}/${jobId}/${clip.id}-graded.${extension}`;
}

function createFallbackAnalyses(clips: ClipRecord[]): ClipAnalysis[] {
  return clips.map((clip) => ({
    clip_id: clip.id,
    brightness: 0.5,
    contrast: 0.5,
    dominant_colors: [],
    color_temperature: 5500,
  }));
}

async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  return text || `${response.status} ${response.statusText}`;
}

async function requestAnalysis(
  jobId: string,
  clip: ClipRecord,
  signedUrl: string,
  index: number,
  total: number,
  dependencies: VideoProcessorDependencies
) {
  dependencies.emitProgress({
    job_id: jobId,
    status: "analyzing",
    clip_id: clip.id,
    clip_index: index,
    total_clips: total,
    message: `Analyzing clip ${index} of ${total}`,
  });

  const response = await dependencies.fetchImpl(`${dependencies.pipelineUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clip_id: clip.id,
      signed_url: signedUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Analyze failed for clip ${clip.id}: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as ClipAnalysis;
}

function mergeGradingResults(
  mood: Mood,
  analyses: ClipAnalysis[],
  generatedResults: ClipGradingResult[],
  buildFallback: typeof buildAdaptiveFallbackFilters
) {
  const generatedByClipId = new Map(generatedResults.map((result) => [result.clip_id, result.filters]));

  return analyses.map((analysis) => ({
    clip_id: analysis.clip_id,
    filters: generatedByClipId.get(analysis.clip_id) || buildFallback(mood, analysis),
  }));
}

async function resolveGradingResults(
  mood: Mood,
  analyses: ClipAnalysis[],
  requesterId: string,
  dependencies: VideoProcessorDependencies,
  jobId: string
) {
  try {
    const generatedResults = await dependencies.generateFilters(mood, analyses, {
      requesterId,
    });
    return mergeGradingResults(mood, analyses, generatedResults, dependencies.buildFallback);
  } catch (error: any) {
    const fallbackResults = analyses.map((analysis) => ({
      clip_id: analysis.clip_id,
      filters: dependencies.buildFallback(mood, analysis),
    }));

    const message =
      error instanceof ClaudeRateLimitError
        ? `Claude rate limit reached, using fallback grading filters. Retry after ${error.retryAfterSeconds}s.`
        : `Claude unavailable, using fallback grading filters: ${error.message}`;

    dependencies.emitProgress({
      job_id: jobId,
      status: "analyzing",
      total_clips: analyses.length,
      message,
    });

    return fallbackResults;
  }
}

async function requestGrade(
  jobId: string,
  clip: ClipRecord,
  signedUrl: string,
  filters: string,
  index: number,
  total: number,
  dependencies: VideoProcessorDependencies
) {
  dependencies.emitProgress({
    job_id: jobId,
    status: "grading",
    clip_id: clip.id,
    clip_index: index,
    total_clips: total,
    message: `Grading clip ${index} of ${total}`,
  });

  const response = await dependencies.fetchImpl(`${dependencies.pipelineUrl}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signed_url: signedUrl,
      filters,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grade failed for clip ${clip.id}: ${await readErrorMessage(response)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function processGradingJob(
  jobId: string,
  mood: Mood,
  clipIds: string[],
  overrides: Partial<VideoProcessorDependencies> = {}
) {
  const dependencies = getDependencies(overrides);
  const uploadedOutputPaths: string[] = [];

  try {
    const { data: clips, error } = await dependencies.supabaseClient
      .from("clips")
      .select("id, user_id, file_name, storage_path")
      .in("id", clipIds);

    if (error || !clips) {
      throw new Error(error?.message || "Could not find clips for this job");
    }

    const orderedClips = normaliseClipOrder(clips, clipIds);
    const signedClips = await Promise.all(
      orderedClips.map(async (clip) => {
        const { data, error: signedUrlError } = await dependencies.supabaseClient.storage
          .from("clips")
          .createSignedUrl(clip.storage_path, 3600);

        if (signedUrlError || !data?.signedUrl) {
          throw new Error(`Failed to generate signed URL for clip ${clip.id}`);
        }

        return {
          clip,
          signedUrl: data.signedUrl,
        };
      })
    );

    let analyses: ClipAnalysis[] = [];

    try {
      for (const [index, signedClip] of signedClips.entries()) {
        analyses.push(
          await requestAnalysis(
            jobId,
            signedClip.clip,
            signedClip.signedUrl,
            index + 1,
            signedClips.length,
            dependencies
          )
        );
      }
    } catch (error: any) {
      dependencies.emitProgress({
        job_id: jobId,
        status: "analyzing",
        total_clips: signedClips.length,
        message: `AI analysis unavailable, using fallback analysis: ${error.message}`,
      });

      analyses = createFallbackAnalyses(orderedClips);
    }

    const gradingResults = await resolveGradingResults(
      mood,
      analyses,
      orderedClips[0]?.user_id || jobId,
      dependencies,
      jobId
    );
    const filtersByClipId = new Map(gradingResults.map((result) => [result.clip_id, result.filters]));

    await dependencies.supabaseClient
      .from("jobs")
      .update({
        status: "grading",
        error_message: null,
        updated_at: dependencies.now(),
      })
      .eq("id", jobId);

    const outputPaths: string[] = [];

    for (const [index, signedClip] of signedClips.entries()) {
      const filters = filtersByClipId.get(signedClip.clip.id) || dependencies.buildFallback(mood, analyses[index]);
      const gradedVideo = await requestGrade(
        jobId,
        signedClip.clip,
        signedClip.signedUrl,
        filters,
        index + 1,
        signedClips.length,
        dependencies
      );
      const outputPath = buildOutputPath(jobId, signedClip.clip);
      const { error: uploadError } = await dependencies.supabaseClient.storage
        .from("outputs")
        .upload(outputPath, gradedVideo, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload graded clip ${signedClip.clip.id}: ${uploadError.message}`);
      }

      uploadedOutputPaths.push(outputPath);
      outputPaths.push(outputPath);
    }

    await dependencies.supabaseClient
      .from("jobs")
      .update({
        status: "complete",
        output_paths: outputPaths,
        error_message: null,
        updated_at: dependencies.now(),
      })
      .eq("id", jobId);

    dependencies.emitProgress({
      job_id: jobId,
      status: "complete",
      total_clips: outputPaths.length,
      output_paths: outputPaths,
      message: "Job complete",
    });

    return outputPaths;
  } catch (error) {
    if (uploadedOutputPaths.length > 0) {
      await dependencies.supabaseClient.storage.from("outputs").remove(uploadedOutputPaths);
    }

    throw error;
  }
}
