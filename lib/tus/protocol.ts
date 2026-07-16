// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { UploadOrchestrationError } from "./errors.ts";

export const TUS_VERSION = "1.0.0";
export const TUS_EXTENSIONS = "creation,termination,checksum";

const MAX_METADATA_HEADER_BYTES = 16 * 1024;
const MAX_METADATA_VALUE_BYTES = 2 * 1024;
const METADATA_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function parseUploadMetadata(header: string | null): Record<string, string> {
  if (!header) return {};
  if (Buffer.byteLength(header) > MAX_METADATA_HEADER_BYTES) {
    throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload metadata is too large");
  }

  const result: Record<string, string> = {};
  for (const rawPair of header.split(",")) {
    const pair = rawPair.trim();
    if (!pair) continue;
    const separator = pair.indexOf(" ");
    const key = separator === -1 ? pair : pair.slice(0, separator);
    const encoded = separator === -1 ? "" : pair.slice(separator + 1).trim();
    if (!METADATA_KEY_PATTERN.test(key) || Object.hasOwn(result, key)) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload metadata key is invalid");
    }
    if (encoded && (!BASE64_PATTERN.test(encoded) || encoded.length % 4 !== 0)) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload metadata is not valid base64");
    }
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.byteLength > MAX_METADATA_VALUE_BYTES) {
      throw new UploadOrchestrationError("UPLOAD_INVALID", "Upload metadata value is too large");
    }
    try {
      result[key] = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
    } catch {
      throw new UploadOrchestrationError(
        "UPLOAD_INVALID",
        "Upload metadata is not valid UTF-8"
      );
    }
  }
  return result;
}

export function parseUploadChecksum(header: string | null): string | undefined {
  if (!header) return undefined;
  const [algorithm, encoded, ...extra] = header.trim().split(/\s+/);
  if (algorithm !== "sha256" || !encoded || extra.length > 0 || !BASE64_PATTERN.test(encoded)) {
    throw new UploadOrchestrationError(
      "UPLOAD_INVALID",
      "Upload-Checksum must use sha256 with a base64 digest"
    );
  }
  const digest = Buffer.from(encoded, "base64");
  if (digest.byteLength !== 32) {
    throw new UploadOrchestrationError("UPLOAD_INVALID", "SHA-256 checksum length is invalid");
  }
  return digest.toString("hex");
}

export function tusHeaders(
  maxUploadBytes: bigint,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    "Tus-Resumable": TUS_VERSION,
    "Tus-Version": TUS_VERSION,
    "Tus-Extension": TUS_EXTENSIONS,
    "Tus-Checksum-Algorithm": "sha256",
    "Tus-Max-Size": maxUploadBytes.toString(),
    "Cache-Control": "no-store",
    "Access-Control-Expose-Headers":
      "Location, Upload-Offset, Upload-Length, Upload-State, Upload-SHA256, Upload-Asset, Tus-Resumable, Tus-Version, Tus-Extension, Tus-Max-Size, Tus-Checksum-Algorithm",
    "Access-Control-Allow-Headers":
      "Content-Type, Content-Length, Upload-Offset, Upload-Length, Upload-Metadata, Upload-Checksum, Tus-Resumable, X-Requested-With",
    "Access-Control-Allow-Methods": "POST, HEAD, PATCH, DELETE, OPTIONS",
    ...extra,
  };
}
