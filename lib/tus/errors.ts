export type UploadErrorCode =
  | "UPLOAD_NOT_FOUND"
  | "UPLOAD_FORBIDDEN"
  | "UPLOAD_INVALID"
  | "UPLOAD_CONFLICT"
  | "UPLOAD_OFFSET"
  | "UPLOAD_CHECKSUM"
  | "UPLOAD_QUOTA"
  | "UPLOAD_BACKPRESSURE"
  | "UPLOAD_BUSY"
  | "UPLOAD_STATE";

export class UploadOrchestrationError extends Error {
  readonly code: UploadErrorCode;
  readonly retryable: boolean;

  constructor(code: UploadErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "UploadOrchestrationError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isUploadOrchestrationError(
  error: unknown
): error is UploadOrchestrationError {
  return error instanceof UploadOrchestrationError;
}
