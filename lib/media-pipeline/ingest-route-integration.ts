import { createHash } from "node:crypto";

// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { CO_PRODUCTION_DATA_SCHEMA, getSupabaseDataSchema } from "../data-authority.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { projectTenantAuthority, type TenantAuthority } from "../tenant-authority.ts";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import { isUploadOrchestrationError, UploadOrchestrationError } from "../tus/errors.ts";
import type { UploadSession } from "../tus/session";
// @ts-expect-error Node's native TypeScript test runner requires explicit extensions.
import * as mediaIngestAuthority from "./ingest-authority.ts";
import type {
  MediaIngestRecord,
  MediaIngestRpcClient,
} from "./ingest-authority";

const {
  assertMediaIngestPublication,
  cancelMediaIngestSession,
  createMediaIngestSession,
  MediaIngestAuthorityError,
  parseMediaIngestRecord,
  parseMediaIngestTenantKey,
  recordMediaIngestProgress,
} = mediaIngestAuthority;

const SHA256_PATTERN = /^(?:sha256:)?[0-9a-f]{64}$/i;
const UPLOAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUOTA_HOLDING_STATES = new Set([
  "receiving",
  "verifying",
  "quarantined",
  "committed",
  "rejected",
  "failed",
]);
const MEDIA_INGEST_SELECT_COLUMNS = [
  "schema_version",
  "id",
  "created_by",
  "tenant_kind",
  "tenant_id",
  "project_id",
  "folder_id",
  "idempotency_key",
  "intent_fingerprint",
  "quota_reservation_ref",
  "quota_reserved_bytes",
  "quota_consumed_at",
  "source_filename",
  "source_size",
  "source_mime_type",
  "source_expected_sha256",
  "upload_offset",
  "upload_completed_at",
  "state",
  "available_at",
  "source_observed_size",
  "source_observed_sha256",
  "source_verified_at",
  "scan_state",
  "scan_engine",
  "scan_receipt_hash",
  "scan_subject_sha256",
  "scanned_at",
  "transcode_state",
  "transcode_receipt_hash",
  "transcode_ready_at",
  "publication_state",
  "publication_enabled",
  "work_stage",
  "work_attempt_count",
  "verify_attempt_count",
  "scan_attempt_count",
  "transcode_attempt_count",
  "max_work_attempts",
  "lease_worker_id",
  "lease_owner",
  "leased_at",
  "lease_expires_at",
  "lease_fence",
  "failure_code",
  "failed_at",
  "cancelled_at",
  "cancelled_by",
  "created_at",
  "updated_at",
].join(", ");

interface MediaIngestReadQuery {
  select(columns: string): MediaIngestReadQuery;
  eq(column: string, value: unknown): MediaIngestReadQuery;
  maybeSingle(): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}

export interface MediaIngestRouteClient extends MediaIngestRpcClient {
  from(table: string): MediaIngestReadQuery;
}

export interface MediaIngestRouteError {
  status: number;
  message: string;
  retryAfter?: string;
}

export function isCoProductionMediaIngestAuthority(): boolean {
  return getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA;
}

export function canonicalMediaIngestTenant(project: {
  owner_id: string;
  team_id?: string | null;
}): TenantAuthority {
  return projectTenantAuthority(project);
}

export function normalizeFullSourceSha256(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!SHA256_PATTERN.test(normalized)) {
    throw new UploadOrchestrationError(
      "UPLOAD_INVALID",
      "A full-source SHA-256 intent is required"
    );
  }
  return normalized.replace(/^sha256:/, "");
}

export function durableUploadQuotaReservationRef(
  session: UploadSession
): string {
  if (
    !UPLOAD_ID_PATTERN.test(session.id) ||
    !QUOTA_HOLDING_STATES.has(session.state) ||
    !session.expectedSha256 ||
    session.size < 1 ||
    session.offset < 0 ||
    session.offset > session.size
  ) {
    throw new UploadOrchestrationError(
      "UPLOAD_BACKPRESSURE",
      "Durable upload quota reservation is unavailable",
      true
    );
  }
  return `upload-session:${session.id.toLowerCase()}`;
}

function deterministicRequestUuid(
  purpose: "progress" | "cancel",
  components: readonly string[]
): string {
  const digest = createHash("sha256")
    .update(["cco.media-ingest-route.v1", purpose, ...components].join("\u001f"))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function mediaIngestProgressRequestId(input: {
  authoritySessionId: string;
  expectedOffset: number;
  nextOffset: number;
  chunkSha256: string;
}): string {
  const chunkSha256 = normalizeFullSourceSha256(input.chunkSha256);
  return deterministicRequestUuid("progress", [
    input.authoritySessionId.trim().toLowerCase(),
    String(input.expectedOffset),
    String(input.nextOffset),
    chunkSha256,
  ]);
}

export function mediaIngestCancelRequestId(
  authoritySessionId: string
): string {
  return deterministicRequestUuid("cancel", [
    authoritySessionId.trim().toLowerCase(),
  ]);
}

export async function createBoundMediaIngestAuthority(
  client: MediaIngestRouteClient,
  input: {
    tenantKey: string;
    projectId: string;
    folderId?: string | null;
    idempotencyKey: string;
    filename: string;
    size: number;
    mimeType: string;
    expectedSha256: string;
    quotaReservationRef: string;
  }
): Promise<MediaIngestRecord> {
  return createMediaIngestSession(client, {
    tenantKey: input.tenantKey,
    projectId: input.projectId,
    folderId: input.folderId,
    idempotencyKey: input.idempotencyKey,
    filename: input.filename,
    size: input.size,
    mimeType: input.mimeType,
    expectedSha256: input.expectedSha256,
    quotaReservationRef: input.quotaReservationRef,
  });
}

export async function readBoundMediaIngestAuthority(
  client: MediaIngestRouteClient,
  input: {
    tenantKey: string;
    projectId: string;
    authoritySessionId: string;
  }
): Promise<MediaIngestRecord> {
  const tenant = parseMediaIngestTenantKey(input.tenantKey);
  const result = await client
    .from("media_ingest_sessions")
    .select(MEDIA_INGEST_SELECT_COLUMNS)
    .eq("id", input.authoritySessionId)
    .eq("tenant_kind", tenant.tenantKind)
    .eq("tenant_id", tenant.tenantId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (result.error) {
    throw new UploadOrchestrationError(
      "UPLOAD_BACKPRESSURE",
      "Media ingest authority is unavailable",
      true
    );
  }
  if (!result.data || typeof result.data !== "object") {
    throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
  }
  const row = result.data as Record<string, unknown>;
  const record = parseMediaIngestRecord({
    ...row,
    session_id: row.id,
    replayed: false,
  });
  if (
    record.id !== input.authoritySessionId.trim().toLowerCase() ||
    record.tenantKey !== tenant.tenantKey ||
    record.projectId !== input.projectId.trim().toLowerCase()
  ) {
    throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
  }
  return record;
}

export function assertBoundMediaIngestSession(
  session: UploadSession,
  authority: MediaIngestRecord
): void {
  if (
    session.mediaIngestAuthoritySessionId !== authority.id ||
    session.projectId !== authority.projectId ||
    session.folderId !== authority.folderId ||
    session.filename !== authority.filename ||
    session.mimeType !== authority.mimeType ||
    session.size !== authority.size ||
    session.expectedSha256 !== authority.expectedSha256 ||
    authority.quotaReservationRef !==
      `upload-session:${session.id.toLowerCase()}`
  ) {
    throw new UploadOrchestrationError(
      "UPLOAD_STATE",
      "Upload authority binding does not match durable session state"
    );
  }
}

export async function recordObservedMediaIngestProgress(
  client: MediaIngestRouteClient,
  input: {
    tenantKey: string;
    authoritySessionId: string;
    expectedOffset: number;
    nextOffset: number;
    chunkSha256: string;
  }
): Promise<MediaIngestRecord> {
  return recordMediaIngestProgress(client, {
    tenantKey: input.tenantKey,
    sessionId: input.authoritySessionId,
    requestId: mediaIngestProgressRequestId(input),
    expectedOffset: input.expectedOffset,
    nextOffset: input.nextOffset,
    chunkSha256: input.chunkSha256,
  });
}

export async function reconcileBoundMediaIngestProgress(
  client: MediaIngestRouteClient,
  input: {
    tenantKey: string;
    session: UploadSession;
    authority: MediaIngestRecord;
  }
): Promise<MediaIngestRecord> {
  if (input.authority.uploadOffset === input.session.offset) {
    return input.authority;
  }
  const lastPartOffset = input.session.lastPartOffset ?? null;
  const lastPartSha256 = input.session.lastPartSha256;
  if (
    lastPartOffset !== null &&
    lastPartSha256 &&
    input.authority.uploadOffset === lastPartOffset &&
    input.session.offset > lastPartOffset
  ) {
    return recordObservedMediaIngestProgress(client, {
      tenantKey: input.tenantKey,
      authoritySessionId: input.authority.id,
      expectedOffset: lastPartOffset,
      nextOffset: input.session.offset,
      chunkSha256: lastPartSha256,
    });
  }
  throw new UploadOrchestrationError(
    "UPLOAD_STATE",
    "Upload progress requires reconciliation"
  );
}

export async function cancelMediaIngestBeforeCleanup<T>(
  client: MediaIngestRouteClient,
  input: {
    tenantKey: string;
    authoritySessionId: string;
  },
  cleanup: () => Promise<T>
): Promise<{ authority: MediaIngestRecord; cleanup: T }> {
  const authority = await cancelMediaIngestSession(client, {
    tenantKey: input.tenantKey,
    sessionId: input.authoritySessionId,
    requestId: mediaIngestCancelRequestId(input.authoritySessionId),
  });
  const cleanupResult = await cleanup();
  return { authority, cleanup: cleanupResult };
}

export async function runMediaIngestPublicationGate<T>(
  authority: MediaIngestRecord,
  publish: () => Promise<T>
): Promise<T> {
  assertMediaIngestPublication(authority);
  return publish();
}

export function mediaIngestPublicationReady(
  authority: MediaIngestRecord
): boolean {
  try {
    assertMediaIngestPublication(authority);
    return true;
  } catch (error) {
    if (
      error instanceof MediaIngestAuthorityError &&
      error.code === "publication_blocked"
    ) {
      return false;
    }
    throw error;
  }
}

export function mediaIngestClientState(
  authority: MediaIngestRecord
): "receiving" | "processing" | "quarantined" | "committed" | "failed" | "aborted" {
  switch (authority.state) {
    case "receiving":
      return "receiving";
    case "quarantined":
      return "quarantined";
    case "ready":
      return mediaIngestPublicationReady(authority) ? "committed" : "processing";
    case "failed":
      return "failed";
    case "cancelled":
      return "aborted";
    default:
      return "processing";
  }
}

export function mapMediaIngestRouteError(
  error: unknown
): MediaIngestRouteError {
  if (error instanceof MediaIngestAuthorityError) {
    switch (error.code) {
      case "invalid_input":
        return { status: 400, message: "Upload request is invalid" };
      case "publication_blocked":
      case "invalid_transition":
      case "stale_fence":
      case "lease_expired":
        return { status: 409, message: "Upload is still processing" };
      case "rpc_failed":
      case "invalid_response":
        return {
          status: 503,
          message: "Upload service is unavailable",
          retryAfter: "15",
        };
    }
  }
  if (isUploadOrchestrationError(error)) {
    switch (error.code) {
      case "UPLOAD_NOT_FOUND":
      case "UPLOAD_FORBIDDEN":
        return { status: 404, message: "Upload not found" };
      case "UPLOAD_INVALID":
        return { status: 400, message: "Upload request is invalid" };
      case "UPLOAD_CONFLICT":
      case "UPLOAD_OFFSET":
      case "UPLOAD_STATE":
        return { status: 409, message: "Upload state conflict" };
      case "UPLOAD_CHECKSUM":
        return { status: 422, message: "Upload checksum could not be verified" };
      case "UPLOAD_QUOTA":
        return {
          status: 429,
          message: "Upload quota is unavailable",
          retryAfter: "60",
        };
      case "UPLOAD_BUSY":
        return {
          status: 423,
          message: "Upload is busy",
          retryAfter: "2",
        };
      case "UPLOAD_BACKPRESSURE":
        return {
          status: 503,
          message: "Upload service is unavailable",
          retryAfter: "15",
        };
    }
  }
  return { status: 500, message: "Upload request could not be completed" };
}
