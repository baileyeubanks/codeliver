import type { FileType } from "@/lib/types/codeliver";

const VIDEO_EXT = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv", "3gp"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "heic", "heif"]);
const AUDIO_EXT = new Set(["mp3", "wav", "aac", "ogg", "flac", "m4a", "wma", "aiff"]);
const DOC_EXT = new Set(["pdf", "doc", "docx", "txt", "rtf", "ppt", "pptx", "xls", "xlsx", "csv"]);

export function detectFileType(filename: string): FileType {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (DOC_EXT.has(ext)) return "document";
  return "other";
}

export function isPlayable(fileType: FileType): boolean {
  return fileType === "video" || fileType === "audio";
}

export function isPreviewable(fileType: FileType): boolean {
  return fileType === "video" || fileType === "image" || fileType === "audio" || fileType === "document";
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

export function generateThumbnailUrl(fileUrl: string, time?: number): string {
  // For Supabase storage, we can append transform params
  // For external URLs, return as-is
  if (!fileUrl) return "";
  return fileUrl;
}

const SUPPORTED_VIDEO = ["video/mp4", "video/webm", "video/quicktime"];
const SUPPORTED_IMAGE = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

export function isBrowserPlayable(mimeType: string): boolean {
  return SUPPORTED_VIDEO.includes(mimeType);
}

export function isBrowserViewable(mimeType: string): boolean {
  return SUPPORTED_IMAGE.includes(mimeType) || mimeType === "application/pdf";
}
