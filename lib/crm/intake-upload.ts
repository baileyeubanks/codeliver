import { createHash, timingSafeEqual } from "node:crypto";

import {
  isPublicInquiryUploadMimeType,
  PUBLIC_INQUIRY_UPLOAD_MAX_BYTES,
  PUBLIC_INQUIRY_UPLOAD_SCHEMA_VERSION,
  type PublicInquiryUploadMimeType,
} from "./intake-upload-shared";
import { PreProjectValidationError } from "./preproject";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORM_KEY_PATTERN = /^ifm_[0-9a-f]{64}$/;
const IDEMPOTENCY_PATTERN = /^[a-z0-9][a-z0-9._:-]{15,127}$/;
const CAPABILITY_PATTERN = /^iatb_[0-9a-f]{64}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PREFIXED_SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

export const PUBLIC_INQUIRY_UPLOAD_STATES = [
  "authorized",
  "receiving",
  "verifying",
  "quarantined",
  "committed",
  "rejected",
  "failed",
  "cancelled",
  "bound",
] as const;

export type PublicInquiryUploadState =
  (typeof PUBLIC_INQUIRY_UPLOAD_STATES)[number];

export interface PublicInquiryUploadIntent {
  schemaVersion: typeof PUBLIC_INQUIRY_UPLOAD_SCHEMA_VERSION;
  formKey: string;
  idempotencyKey: string;
  capabilityToken: string;
  filename: string;
  mimeType: PublicInquiryUploadMimeType;
  size: number;
  expectedSha256: string;
}

export interface PublicInquiryUploadAuthority {
  authorityId: string;
  teamId: string;
  formKey: string;
  uploadSessionId: string | null;
  filename: string;
  mimeType: PublicInquiryUploadMimeType;
  size: number;
  uploadOffset: number;
  state: PublicInquiryUploadState;
  expectedSha256: string;
  computedSha256: string | null;
  scanVerdict: "pending" | "clean" | "infected" | "error" | null;
  expiresAt: string;
  replayed: boolean;
}

function invalid(code: string, message: string, field?: string): never {
  throw new PreProjectValidationError(code, message, field);
}

function printable(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") invalid("invalid_upload", `${field} is invalid`, field);
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    invalid("invalid_upload", `${field} is invalid`, field);
  }
  return normalized;
}

export function normalizePublicInquiryUploadCapability(value: unknown): string {
  const capability = printable(value, "upload capability", 132);
  if (!CAPABILITY_PATTERN.test(capability)) {
    invalid("invalid_upload_capability", "Upload capability is invalid");
  }
  return capability;
}

export function hashPublicInquiryUploadCapability(value: unknown): `sha256:${string}` {
  const capability = normalizePublicInquiryUploadCapability(value);
  return `sha256:${createHash("sha256").update(capability, "utf8").digest("hex")}`;
}

export function publicInquiryUploadCapabilityMatches(
  capabilityToken: unknown,
  expectedHash: string,
): boolean {
  if (!PREFIXED_SHA256_PATTERN.test(expectedHash)) return false;
  const observed = hashPublicInquiryUploadCapability(capabilityToken);
  return timingSafeEqual(Buffer.from(observed), Buffer.from(expectedHash));
}

export function parsePublicInquiryUploadIntent(input: {
  formKey: unknown;
  idempotencyKey: unknown;
  capabilityToken: unknown;
  filename: unknown;
  mimeType: unknown;
  size: unknown;
  expectedSha256: unknown;
}): PublicInquiryUploadIntent {
  const formKey = printable(input.formKey, "formKey", 68).toLowerCase();
  if (!FORM_KEY_PATTERN.test(formKey)) {
    invalid("invalid_form_key", "Upload form is invalid", "formKey");
  }

  const idempotencyKey = printable(
    input.idempotencyKey,
    "idempotencyKey",
    128,
  ).toLowerCase();
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    invalid(
      "invalid_idempotency_key",
      "Upload request key is invalid",
      "idempotencyKey",
    );
  }

  const filename = printable(input.filename, "filename", 512);
  const mimeType = printable(input.mimeType, "mimeType", 160).toLowerCase();
  if (!isPublicInquiryUploadMimeType(mimeType)) {
    invalid("unsupported_upload_type", "This file type is not accepted", "mimeType");
  }
  if (
    !Number.isSafeInteger(input.size) ||
    Number(input.size) <= 0 ||
    Number(input.size) > PUBLIC_INQUIRY_UPLOAD_MAX_BYTES
  ) {
    invalid("invalid_upload_size", "Upload size is outside the intake limit", "size");
  }
  const expectedSha256 = printable(input.expectedSha256, "sha256", 64).toLowerCase();
  if (!SHA256_PATTERN.test(expectedSha256)) {
    invalid("invalid_upload_checksum", "Upload checksum must be a SHA-256 digest", "sha256");
  }

  return {
    schemaVersion: PUBLIC_INQUIRY_UPLOAD_SCHEMA_VERSION,
    formKey,
    idempotencyKey,
    capabilityToken: normalizePublicInquiryUploadCapability(input.capabilityToken),
    filename,
    mimeType,
    size: Number(input.size),
    expectedSha256,
  };
}

function rpcRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}

export function parsePublicInquiryUploadAuthority(
  value: unknown,
): PublicInquiryUploadAuthority | null {
  const row = rpcRow(value);
  if (!row) return null;
  const authorityId = row.authority_id;
  const teamId = row.team_id;
  const formKey = row.form_key;
  const uploadSessionId = row.upload_session_id;
  const filename = row.filename;
  const mimeType = row.mime_type;
  const size = Number(row.size_bytes);
  const uploadOffset = Number(row.upload_offset);
  const state = row.upload_state;
  const expectedSha256 = row.expected_sha256;
  const computedSha256 = row.computed_sha256;
  const scanVerdict = row.scan_verdict;
  const expiresAt = row.expires_at;
  if (
    typeof authorityId !== "string" ||
    !UUID_PATTERN.test(authorityId) ||
    typeof teamId !== "string" ||
    !UUID_PATTERN.test(teamId) ||
    typeof formKey !== "string" ||
    !FORM_KEY_PATTERN.test(formKey) ||
    (uploadSessionId !== null &&
      (typeof uploadSessionId !== "string" || !UUID_PATTERN.test(uploadSessionId))) ||
    typeof filename !== "string" ||
    !filename ||
    typeof mimeType !== "string" ||
    !isPublicInquiryUploadMimeType(mimeType) ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > PUBLIC_INQUIRY_UPLOAD_MAX_BYTES ||
    !Number.isSafeInteger(uploadOffset) ||
    uploadOffset < 0 ||
    uploadOffset > size ||
    typeof state !== "string" ||
    !(PUBLIC_INQUIRY_UPLOAD_STATES as readonly string[]).includes(state) ||
    typeof expectedSha256 !== "string" ||
    !SHA256_PATTERN.test(expectedSha256) ||
    (computedSha256 !== null &&
      (typeof computedSha256 !== "string" || !SHA256_PATTERN.test(computedSha256))) ||
    (scanVerdict !== null &&
      !["pending", "clean", "infected", "error"].includes(String(scanVerdict))) ||
    typeof expiresAt !== "string" ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    typeof row.replayed !== "boolean"
  ) {
    return null;
  }
  return {
    authorityId: authorityId.toLowerCase(),
    teamId: teamId.toLowerCase(),
    formKey,
    uploadSessionId: uploadSessionId?.toLowerCase() ?? null,
    filename,
    mimeType,
    size,
    uploadOffset,
    state: state as PublicInquiryUploadState,
    expectedSha256,
    computedSha256: computedSha256 as string | null,
    scanVerdict: scanVerdict as PublicInquiryUploadAuthority["scanVerdict"],
    expiresAt: new Date(expiresAt).toISOString(),
    replayed: row.replayed,
  };
}

export function publicInquiryUploadStorageEvidence(input: {
  provider: string;
  objectKey: string | null;
  size: number;
  sha256: string | null;
  committedAt: string | null;
}): `sha256:${string}` | null {
  if (!input.objectKey || !input.sha256) return null;
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        provider: input.provider,
        objectKey: input.objectKey,
        size: input.size,
        sha256: input.sha256,
        committedAt: input.committedAt,
      }),
      "utf8",
    )
    .digest("hex")}`;
}
