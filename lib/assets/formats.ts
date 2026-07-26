/**
 * P26 Asset Library — format download matrix shaping.
 * Honest availability: only formats backed by a real file are downloadable;
 * everything else reports "Not produced for this asset".
 */

import {
  LIBRARY_FORMAT_KEYS,
  type LibraryFormatEntry,
  type LibraryFormatKey,
} from "./types";

export const NOT_PRODUCED_REASON = "Not produced for this asset";

export const LIBRARY_FORMAT_LABELS: Record<LibraryFormatKey, string> = {
  master: "Master",
  web: "Web",
  vertical: "Vertical 9:16",
  square: "Square 1:1",
  captioned: "Captioned",
  clean: "Clean (no captions)",
  audio_only: "Audio only",
  thumbnail: "Thumbnail",
  transcript: "Transcript",
};

/**
 * One row per canonical format, in order. Seed entries win; any format the
 * seed does not mention is filled in as not produced — never silently absent.
 */
export function formatMatrixFor(entries: LibraryFormatEntry[]): LibraryFormatEntry[] {
  const byKey = new Map(entries.map((entry) => [entry.format, entry]));
  return LIBRARY_FORMAT_KEYS.map(
    (key) => byKey.get(key) ?? { format: key, available: false, reason: NOT_PRODUCED_REASON },
  );
}

export function downloadableFormats(entries: LibraryFormatEntry[]): LibraryFormatEntry[] {
  return formatMatrixFor(entries).filter((entry) => entry.available);
}

export function isFormatAvailable(entry: LibraryFormatEntry): boolean {
  return entry.available;
}

/** Truthful byte formatting: 1024-based, one decimal for MB and up. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Truthful duration formatting: m:ss, rounded to the nearest second. */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "";
  }
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Short checksum preview for the manifest view (full hash stays in title). */
export function shortChecksum(sha256: string, length = 16): string {
  return sha256.slice(0, Math.max(0, length));
}
