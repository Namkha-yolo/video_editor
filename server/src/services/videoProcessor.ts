// TODO: Clip analysis via FFprobe (brightness, colors, metadata)
// TODO: Apply FFmpeg color grading filters (from moodEngine output)
// TODO: Upload graded clips to Supabase Storage
// TODO: Generate before/after thumbnails

import { supabase } from "../config/supabase";
import type { Mood } from '@clipvibe/shared';

export async function processGradingJob(jobId: string, mood: Mood, clipIds: string[]) {

    // Fetch clip details from Supabase
    const { data: clips, error } = await supabase
        .from('clips')
        .select("*")
        .in("id", clipIds);

    if (error || ! clips) {
        throw new Error("Could not find clips for this job");
    }

    const analyses = [];
    const results: string[] = [];
    const pipelineUrl = process.env.AI_PIPELINE_URL || "http://localhost:8000";

    for (const clip of clips) {
        // Generate signed URL for the original clip
        const { data: urlData, error: urlError } = await supabase.storage
            .from("clips")
            .createSignedUrl(clip.storage_path, 3600); // URL valid for 1hr

        if (urlError || !urlData) {
            throw new Error(`Failed to generate signed URL for clip ${clip.id}`);
        }

        console.log(`Sending clip ${clip.id} for processing with mood ${mood} to AI Pipeline, video URL: ${urlData.signedUrl} `);
        const analyzeRes = await fetch(`${pipelineUrl}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                clip_id: clip.id,
                file_url: urlData.signedUrl                
            }),
        });

        if (!analyzeRes.ok) {
            throw new Error(`AI Pipeline analyze failed for clip ${clip.id}`);
        }

        const analysisData = await analyzeRes.json();
        analyses.push(analysisData);
        
        // TODO: Mood Engine: Send analysis to calude to get ffmpeg filter params
        // TODO: Grade: Call AI pipeline POST /grade

        // Temperary end processing result, just to simulate the workflow
        results.push(`${clip.id}_graded.mp4`);
    }

    // Update job record in supabase's db to "complete"
    await supabase
        .from('jobs')
        .update({ 
            status: "complete",
            output_paths: results,
            updated_at: new Date().toISOString() 
        })
        .eq('id', jobId);

}
