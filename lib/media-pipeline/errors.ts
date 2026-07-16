export type MediaPipelineErrorCode =
  | "PIPELINE_NOT_CONFIGURED"
  | "PIPELINE_STORAGE_NOT_READY"
  | "PIPELINE_STORAGE_POLICY_BLOCKED"
  | "PIPELINE_ENCRYPTION_POLICY_BLOCKED"
  | "PIPELINE_SOURCE_RECEIPT_REQUIRED"
  | "PIPELINE_SOURCE_INVALID"
  | "PIPELINE_SOURCE_MISSING"
  | "PIPELINE_SOURCE_CHANGED"
  | "PIPELINE_SOURCE_TOO_LARGE"
  | "PIPELINE_UNSUPPORTED_MEDIA"
  | "PIPELINE_QUARANTINED"
  | "PIPELINE_QUARANTINE_PENDING"
  | "PIPELINE_QUARANTINE_ERROR"
  | "PIPELINE_CANCELLED"
  | "PIPELINE_BACKPRESSURE"
  | "PIPELINE_FFMPEG_UNAVAILABLE"
  | "PIPELINE_FFMPEG_FAILED"
  | "PIPELINE_TIMEOUT"
  | "PIPELINE_STATE_CORRUPT"
  | "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID"
  | "PIPELINE_JOB_NOT_FOUND"
  | "PIPELINE_JOB_CONFLICT"
  | "PIPELINE_PUBLISH_FAILED";

export class MediaPipelineError extends Error {
  readonly code: MediaPipelineErrorCode;
  readonly retryable: boolean;

  constructor(code: MediaPipelineErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "MediaPipelineError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isMediaPipelineError(error: unknown): error is MediaPipelineError {
  return error instanceof MediaPipelineError;
}

export function publicPipelineErrorMessage(error: MediaPipelineError): string {
  switch (error.code) {
    case "PIPELINE_STORAGE_NOT_READY":
      return "Media storage is not ready for pipeline processing.";
    case "PIPELINE_STORAGE_POLICY_BLOCKED":
      return "Media storage does not satisfy this pipeline's placement policy.";
    case "PIPELINE_ENCRYPTION_POLICY_BLOCKED":
      return "Media storage does not satisfy this pipeline's encryption policy.";
    case "PIPELINE_SOURCE_RECEIPT_REQUIRED":
      return "This version is missing an authoritative storage receipt.";
    case "PIPELINE_SOURCE_MISSING":
      return "The version source is no longer available.";
    case "PIPELINE_SOURCE_CHANGED":
      return "The version source changed after ingest validation.";
    case "PIPELINE_SOURCE_TOO_LARGE":
      return "The source exceeds this worker's configured processing limit.";
    case "PIPELINE_UNSUPPORTED_MEDIA":
      return "This version does not contain supported video or audio streams.";
    case "PIPELINE_QUARANTINED":
    case "PIPELINE_QUARANTINE_PENDING":
      return "This version remains quarantined until its security scan clears.";
    case "PIPELINE_CANCELLED":
      return "Media processing was cancelled.";
    case "PIPELINE_BACKPRESSURE":
      return "The media worker is at capacity. The job remains queued.";
    case "PIPELINE_FFMPEG_UNAVAILABLE":
      return "The local media processor is unavailable.";
    case "PIPELINE_TIMEOUT":
      return "The media processor timed out and will retry when eligible.";
    default:
      return error.message.replace(/(?:\/[^\s]+){2,}/g, "[redacted path]");
  }
}
