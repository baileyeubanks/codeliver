export type StorageErrorCode =
  | "STORAGE_NOT_CONFIGURED"
  | "STORAGE_NOT_READY"
  | "STORAGE_PATH_INVALID"
  | "STORAGE_CONFLICT"
  | "STORAGE_CAPACITY"
  | "STORAGE_CHECKSUM"
  | "STORAGE_OFFSET"
  | "STORAGE_UNSUPPORTED";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly retryable: boolean;

  constructor(
    code: StorageErrorCode,
    message: string,
    retryable = false
  ) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}
