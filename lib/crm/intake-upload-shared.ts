export const PUBLIC_INQUIRY_UPLOAD_SCHEMA_VERSION =
  "cco.public-inquiry-upload.v1" as const;

export const PUBLIC_INQUIRY_UPLOAD_MAX_FILES = 8;
export const PUBLIC_INQUIRY_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const PUBLIC_INQUIRY_UPLOAD_MAX_TOTAL_BYTES = 5 * 1024 * 1024 * 1024;
export const PUBLIC_INQUIRY_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export const PUBLIC_INQUIRY_UPLOAD_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type PublicInquiryUploadMimeType =
  (typeof PUBLIC_INQUIRY_UPLOAD_MIME_TYPES)[number];

const MIME_TYPE_SET = new Set<string>(PUBLIC_INQUIRY_UPLOAD_MIME_TYPES);

export function isPublicInquiryUploadMimeType(
  value: string,
): value is PublicInquiryUploadMimeType {
  return MIME_TYPE_SET.has(value.trim().toLowerCase());
}

export function formatIntakeUploadBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
