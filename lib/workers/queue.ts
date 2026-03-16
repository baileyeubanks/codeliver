/**
 * Transcode Job Queue — backed by Supabase `transcode_jobs` table.
 *
 * Simple pull-based queue: worker polls for pending jobs, claims one,
 * processes it, and marks it complete or failed.
 */

import { getSupabase } from "@/lib/supabase";

export interface TranscodeJob {
  id: string;
  asset_id: string;
  version_id: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  input_path: string;
  output_hls_path: string | null;
  output_thumbnail_path: string | null;
  output_waveform_path: string | null;
  duration_seconds: number | null;
  resolution: string | null;
  codec: string | null;
  fps: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/**
 * Enqueue a new transcode job for an asset.
 */
export async function enqueueTranscode(params: {
  assetId: string;
  versionId?: string;
  inputPath: string;
}): Promise<TranscodeJob | null> {
  const { data, error } = await getSupabase()
    .from("transcode_jobs")
    .insert({
      asset_id: params.assetId,
      version_id: params.versionId || null,
      input_path: params.inputPath,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("[queue] Failed to enqueue transcode:", error);
    return null;
  }

  // Update asset status to processing
  await getSupabase()
    .from("assets")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", params.assetId);

  return data as TranscodeJob;
}

/**
 * Claim the next pending job (atomic: sets status to processing).
 */
export async function claimNextJob(): Promise<TranscodeJob | null> {
  // Find oldest pending job
  const { data: pending } = await getSupabase()
    .from("transcode_jobs")
    .select()
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!pending) return null;

  // Atomically claim it
  const { data, error } = await getSupabase()
    .from("transcode_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("status", "pending") // Ensure no race condition
    .select()
    .single();

  if (error || !data) return null;
  return data as TranscodeJob;
}

/**
 * Mark a job as completed with output paths and media info.
 */
export async function completeJob(
  jobId: string,
  result: {
    hlsPath?: string;
    thumbnailPath?: string;
    waveformPath?: string;
    duration?: number;
    resolution?: string;
    codec?: string;
    fps?: number;
  }
): Promise<void> {
  await getSupabase()
    .from("transcode_jobs")
    .update({
      status: "completed",
      output_hls_path: result.hlsPath || null,
      output_thumbnail_path: result.thumbnailPath || null,
      output_waveform_path: result.waveformPath || null,
      duration_seconds: result.duration || null,
      resolution: result.resolution || null,
      codec: result.codec || null,
      fps: result.fps || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Mark a job as failed with an error message.
 */
export async function failJob(
  jobId: string,
  errorMessage: string
): Promise<void> {
  await getSupabase()
    .from("transcode_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}
