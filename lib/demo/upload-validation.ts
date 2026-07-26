/**
 * Demo upload validation. The file picker's `accept` attribute is only a
 * hint — drag-drop, programmatic selection, and "All Files" overrides all
 * bypass it. Every file destined for the local workspace is validated here
 * before a byte is stored: first against the accepted type list, then
 * against the file's actual magic bytes so a renamed `.txt` cannot check in
 * as media.
 */

export type UploadClaim = "video" | "audio" | "image" | "document";

export type UploadValidation =
  | { ok: true; claim: UploadClaim }
  | { ok: false; reason: string };

interface UploadCandidate {
  name?: string;
  type?: string;
  slice(start: number, end: number): Blob;
}

const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const VIDEO_EXTENSIONS = new Set([
  "3g2", "3gp", "asf", "avi", "f4v", "flv", "m2ts", "m2v", "m4v", "mkv",
  "mov", "mp4", "mpeg", "mpg", "mts", "ogv", "ts", "webm", "wmv",
]);

const AUDIO_EXTENSIONS = new Set([
  "aac", "aif", "aiff", "alac", "amr", "ape", "au", "caf", "flac", "m4a",
  "mid", "midi", "mp3", "oga", "ogg", "opus", "ra", "wav", "weba", "wma",
]);

const IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "heic", "heif", "ico", "jfif", "jpeg", "jpg", "png",
  "svg", "tif", "tiff", "webp",
]);

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const SNIFF_LENGTH = 64;

function fileExtension(name: string | undefined): string {
  if (!name) return "";
  const normalized = name.split(/[?#]/, 1)[0]?.trim().toLowerCase() ?? "";
  const dot = normalized.lastIndexOf(".");
  return dot >= 0 ? normalized.slice(dot + 1) : "";
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let index = start; index < start + length && index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

type SniffedKind = UploadClaim | "text" | "unknown";

/** Magic-byte identification of the file's actual contents. */
export function sniffUploadKind(bytes: Uint8Array): SniffedKind {
  if (bytes.length === 0) return "unknown";

  // Documents
  if (ascii(bytes, 0, 4) === "%PDF") return "document";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "document"; // PK zip (.docx)
  if (
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
  ) return "document"; // OLE compound (.doc)

  // Images
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "image";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image";
  if (ascii(bytes, 0, 4) === "GIF8") return "image";
  if (ascii(bytes, 0, 2) === "BM") return "image";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image";

  // Audio / video containers
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).trim().toLowerCase();
    if (brand.startsWith("m4a") || brand.startsWith("m4b")) return "audio";
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif"].includes(brand)) return "image";
    return "video"; // mp4/mov/m4v family
  }
  if (
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  ) return "video"; // EBML (webm/mkv)
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 3) === "AVI") return "video";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "audio";
  if (ascii(bytes, 0, 4) === "OggS") return "audio";
  if (ascii(bytes, 0, 4) === "fLaC") return "audio";
  if (ascii(bytes, 0, 3) === "ID3") return "audio";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio"; // mp3/aac frame sync

  // Text-like: every sampled byte is printable ASCII or common whitespace.
  let textLike = true;
  for (const byte of bytes) {
    const printable = (byte >= 0x20 && byte <= 0x7e)
      || byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (!printable) {
      textLike = false;
      break;
    }
  }
  return textLike ? "text" : "unknown";
}

/** What the file claims to be, from MIME type then extension. */
export function claimUploadKind(
  file: UploadCandidate,
  options: { allowDocuments?: boolean } = {},
): UploadClaim | null {
  const mimeType = (file.type ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (options.allowDocuments && DOCUMENT_MIME_TYPES.has(mimeType)) return "document";

  const extension = fileExtension(file.name);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (options.allowDocuments && DOCUMENT_EXTENSIONS.has(extension)) return "document";
  return null;
}

export function acceptedUploadTypesLabel(options: { allowDocuments?: boolean } = {}): string {
  return options.allowDocuments
    ? "video, audio, image, PDF, DOC, or DOCX"
    : "video, audio, or image";
}

/**
 * Validates one selected file. Rejects types outside the accepted list and
 * files whose real bytes contradict what they claim to be.
 */
export async function validateDemoUpload(
  file: UploadCandidate,
  options: { allowDocuments?: boolean } = {},
): Promise<UploadValidation> {
  const name = file.name || "This file";
  const claim = claimUploadKind(file, options);
  if (!claim) {
    return {
      ok: false,
      reason: `${name} isn't a supported file type. Accepted: ${acceptedUploadTypesLabel(options)}.`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, SNIFF_LENGTH).arrayBuffer());
  } catch {
    // Unreadable bytes — fall through and let the decode/inspection step
    // report honestly rather than inventing a verdict here.
    return { ok: true, claim };
  }

  const sniffed = sniffUploadKind(bytes);
  if (sniffed === "unknown") return { ok: true, claim };
  if (sniffed === claim) return { ok: true, claim };
  // SVG is legitimately text (XML markup) — verify the markup before
  // accepting it under an image claim.
  if (sniffed === "text" && claim === "image") {
    const head = ascii(bytes, 0, bytes.length).toLowerCase();
    if (head.includes("<svg") || head.includes("<?xml")) return { ok: true, claim };
  }
  // A text file carrying a media/document extension is never acceptable.
  // A different real media signature (png renamed .mp4) is a mismatch too.
  return {
    ok: false,
    reason: sniffed === "text"
      ? `${name} contains text, not ${claim} data — the file doesn't match its extension.`
      : `${name} contains ${sniffed} data, not ${claim} — the file doesn't match its extension.`,
  };
}
