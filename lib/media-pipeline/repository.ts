/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { getSupabase } from "../supabase.ts";

import type { MediaPipelineJob } from "./types.ts";

export interface MediaPipelineRepository {
  recordQueued(job: MediaPipelineJob): Promise<void>;
  recordRunning(job: MediaPipelineJob): Promise<void>;
  recordRetry(job: MediaPipelineJob): Promise<void>;
  recordTerminal(job: MediaPipelineJob): Promise<void>;
  publish(job: MediaPipelineJob): Promise<void>;
}

function pipelinePublication(job: MediaPipelineJob): Record<string, unknown> {
  return {
    schemaVersion: 1,
    pipelineVersion: "co-deliver-media-pipeline/v1",
    status: "published",
    jobId: job.id,
    versionId: job.versionId,
    projectId: job.projectId,
    source: {
      objectKey: job.source.objectKey,
      filename: job.source.filename,
      size: job.sourceSize,
      sha256: job.sourceSha256,
      versionNumber: job.source.versionNumber,
    },
    scan: job.scan,
    probe: job.probe,
    artifacts: job.artifacts,
    publishedAt: job.publishedAt ?? new Date().toISOString(),
  };
}

export class SupabaseMediaPipelineRepository implements MediaPipelineRepository {
  async recordQueued(job: MediaPipelineJob): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from("transcode_jobs").upsert(
      {
        id: job.id,
        asset_id: job.assetId,
        version_id: job.versionId,
        input_path: job.source.objectKey,
        status: "pending",
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error("Could not persist media pipeline queue projection: " + error.message);

    const update = await supabase.rpc("project_version_media_pipeline_status", {
      p_asset_id: job.assetId,
      p_version_id: job.versionId,
      p_status: "processing",
    });
    if (update.error) throw new Error("Could not mark asset as processing: " + update.error.message);
  }

  async recordRunning(job: MediaPipelineJob): Promise<void> {
    const { error } = await getSupabase()
      .from("transcode_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) throw new Error("Could not mark media pipeline job as processing: " + error.message);
  }

  async recordRetry(job: MediaPipelineJob): Promise<void> {
    const { error } = await getSupabase()
      .from("transcode_jobs")
      .update({
        status: "pending",
        error_message: job.failure?.message ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) throw new Error("Could not record media pipeline retry: " + error.message);
  }

  async recordTerminal(job: MediaPipelineJob): Promise<void> {
    const status = job.status === "cancelled" ? "cancelled" : "failed";
    const { error } = await getSupabase()
      .from("transcode_jobs")
      .update({
        status,
        error_message: job.failure?.message ?? null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) throw new Error("Could not persist media pipeline terminal state: " + error.message);

    if (job.status === "failed" || job.status === "quarantined") {
      const update = await getSupabase().rpc("project_version_media_pipeline_status", {
        p_asset_id: job.assetId,
        p_version_id: job.versionId,
        p_status: "failed",
      });
      if (update.error) throw new Error("Could not mark failed media asset: " + update.error.message);
    }
  }

  async publish(job: MediaPipelineJob): Promise<void> {
    if (!job.artifacts || !job.probe || !job.sourceSha256 || job.sourceSize === null) {
      throw new Error("Media pipeline publication is missing verified derivatives");
    }
    const supabase = getSupabase();
    const assetUpdate = await supabase.rpc("publish_version_media_derivatives", {
      p_asset_id: job.assetId,
      p_version_id: job.versionId,
      p_publication: pipelinePublication(job),
      p_duration_seconds: job.probe.durationSeconds || 0,
    });
    if (assetUpdate.error) {
      throw new Error("Could not publish media derivatives: " + assetUpdate.error.message);
    }

    const queueUpdate = await supabase
      .from("transcode_jobs")
      .update({
        status: "completed",
        output_hls_path: job.artifacts.hls.manifest.objectKey,
        output_thumbnail_path: job.artifacts.thumbnail?.objectKey ?? null,
        output_waveform_path: job.artifacts.waveform.objectKey,
        duration_seconds: job.probe.durationSeconds || null,
        resolution:
          job.probe.width && job.probe.height
            ? String(job.probe.width) + "x" + String(job.probe.height)
            : null,
        codec: job.probe.videoCodec ?? job.probe.audioCodec,
        fps: job.probe.frameRate,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (queueUpdate.error) {
      throw new Error("Could not complete media pipeline queue projection: " + queueUpdate.error.message);
    }

    await supabase.from("activity_log").insert({
      project_id: job.projectId,
      asset_id: job.assetId,
      action: "media_pipeline_published",
      details: {
        version_id: job.versionId,
        job_id: job.id,
        source_sha256: job.sourceSha256,
        derivative_count:
          job.artifacts.hls.segments.length +
          6 +
          (job.artifacts.thumbnail ? 1 : 0),
      },
    });
  }
}

export class NoopMediaPipelineRepository implements MediaPipelineRepository {
  async recordQueued(): Promise<void> {}
  async recordRunning(): Promise<void> {}
  async recordRetry(): Promise<void> {}
  async recordTerminal(): Promise<void> {}
  async publish(): Promise<void> {}
}
