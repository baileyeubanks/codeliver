import { createHash } from "node:crypto";

import type { MediaPipelineJob, MediaPipelineStage } from "./types";

export interface MediaPipelineMetric {
  name:
    | "media_pipeline_jobs_total"
    | "media_pipeline_stage_duration_ms"
    | "media_pipeline_bytes_total"
    | "media_pipeline_failures_total"
    | "media_pipeline_queue_depth";
  value: number;
  labels: Record<string, string>;
}

export interface MediaPipelineMetricSink {
  emit(metric: MediaPipelineMetric): void | Promise<void>;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export class ConsoleMediaPipelineMetricSink implements MediaPipelineMetricSink {
  emit(metric: MediaPipelineMetric): void {
    console.info(
      "[media-pipeline]",
      JSON.stringify({
        metric: metric.name,
        value: metric.value,
        labels: metric.labels,
      })
    );
  }
}

export function jobMetricLabels(
  job: Pick<MediaPipelineJob, "projectId" | "status" | "stage">,
  provider: string,
  stage: MediaPipelineStage = job.stage
): Record<string, string> {
  return {
    provider,
    project: hash(job.projectId),
    stage,
    status: job.status,
  };
}

export async function emitMetric(
  sink: MediaPipelineMetricSink,
  metric: MediaPipelineMetric
): Promise<void> {
  try {
    await sink.emit(metric);
  } catch {
    // Telemetry must never stop a media job.
  }
}
