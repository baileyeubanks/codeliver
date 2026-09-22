import { NextResponse } from "next/server";

import { getAssetAccess, getProjectAccess } from "@/lib/access-control";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  assertAssetNotLocked,
  isAssetDeliveryLockedError,
} from "@/lib/delivery/lock";
import { getSupabase } from "@/lib/supabase";
import { detectFileType } from "@/lib/utils/media";
import {
  isStorageError,
  StorageError,
} from "@/lib/storage/errors";
import type { StorageRuntimeConfig } from "@/lib/storage/config";
import {
  BackendUnavailableError,
  isBackendUnavailableError,
} from "@/lib/api/backend";
import type { UploadSession } from "@/lib/tus/session";
import {
  isUploadOrchestrationError,
  UploadOrchestrationError,
} from "@/lib/tus/errors";
import type { UploadOrchestrator } from "@/lib/tus/orchestrator";

export interface UploadHttpError {
  status: number;
  code: string;
  message: string;
  retryAfter?: string;
}

export function assertUploadStorageConfigured(
  config: StorageRuntimeConfig,
): void {
  if (
    !config.providerWasExplicit ||
    !config.filesystemRoot ||
    !config.writeEnabled ||
    config.issues.length > 0
  ) {
    throw new StorageError(
      "STORAGE_NOT_CONFIGURED",
      "Upload storage is unavailable",
      true,
    );
  }
}

export function mapUploadError(error: unknown): UploadHttpError {
  if (isBackendUnavailableError(error)) {
    return {
      status: 503,
      code: "BACKEND_UNAVAILABLE",
      message: "Backend service is unavailable",
      retryAfter: "15",
    };
  }

  if (isUploadOrchestrationError(error)) {
    switch (error.code) {
      case "UPLOAD_NOT_FOUND":
        return { status: 404, code: error.code, message: error.message };
      case "UPLOAD_FORBIDDEN":
        return { status: 403, code: error.code, message: error.message };
      case "UPLOAD_INVALID":
        return { status: 400, code: error.code, message: error.message };
      case "UPLOAD_CONFLICT":
      case "UPLOAD_OFFSET":
      case "UPLOAD_STATE":
        return { status: 409, code: error.code, message: error.message };
      case "UPLOAD_CHECKSUM":
        return { status: 422, code: error.code, message: error.message };
      case "UPLOAD_QUOTA":
        return {
          status: 429,
          code: error.code,
          message: error.message,
          retryAfter: "60",
        };
      case "UPLOAD_BUSY":
        return {
          status: 423,
          code: error.code,
          message: error.message,
          retryAfter: "2",
        };
      case "UPLOAD_BACKPRESSURE":
        return {
          status: 503,
          code: "STORAGE_UNAVAILABLE",
          message: "Upload storage is unavailable",
          retryAfter: "15",
        };
    }
  }

  if (isStorageError(error)) {
    switch (error.code) {
      case "STORAGE_PATH_INVALID":
        return { status: 400, code: error.code, message: error.message };
      case "STORAGE_CONFLICT":
      case "STORAGE_OFFSET":
        return { status: 409, code: error.code, message: error.message };
      case "STORAGE_CHECKSUM":
        return { status: 422, code: error.code, message: error.message };
      case "STORAGE_CAPACITY":
        return {
          status: 507,
          code: error.code,
          message: error.message,
          retryAfter: "60",
        };
      case "STORAGE_NOT_CONFIGURED":
      case "STORAGE_NOT_READY":
      case "STORAGE_UNSUPPORTED":
        return {
          status: 503,
          code: "STORAGE_UNAVAILABLE",
          message: "Upload storage is unavailable",
          retryAfter: "15",
        };
    }
  }
  return {
    status: 500,
    code: "UPLOAD_FAILED",
    message: "Upload orchestration failed",
  };
}

export function jsonUploadError(
  error: unknown,
  headers: Record<string, string>
): NextResponse {
  const mapped = mapUploadError(error);
  return NextResponse.json(
    { error: mapped.message, code: mapped.code },
    {
      status: mapped.status,
      headers: {
        ...headers,
        "Cache-Control": "no-store",
        ...(mapped.retryAfter ? { "Retry-After": mapped.retryAfter } : {}),
      },
    }
  );
}

export async function requireOwnedUploadTarget(
  userId: string,
  projectId: string,
  folderId?: string
): Promise<void> {
  const supabase = getSupabase();
  const projectAccess = await getProjectAccess(
    projectId,
    userId,
    "editor",
    supabase,
  );
  if (!projectAccess.ok) {
    if (projectAccess.status >= 500) {
      throw new BackendUnavailableError("Upload project authority");
    }
    throw new UploadOrchestrationError(
      "UPLOAD_FORBIDDEN",
      "Project is unavailable for upload"
    );
  }

  if (folderId) {
    const { data: folder, error } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) {
      throw new BackendUnavailableError("Upload folder authority");
    }
    if (!folder) {
      throw new UploadOrchestrationError(
        "UPLOAD_FORBIDDEN",
        "Folder is unavailable for upload"
      );
    }
  }
}

export interface OwnedRevisionUploadTarget {
  version: number;
}

/**
 * Resolve revision lineage from canonical catalog state before allocating
 * storage. The expected-current id is persisted into the upload session and
 * checked again inside the final catalog transaction after the bytes commit.
 */
export async function requireOwnedRevisionUploadTarget(
  userId: string,
  projectId: string,
  assetId: string,
  expectedCurrentVersionId: string,
  filename: string,
): Promise<OwnedRevisionUploadTarget> {
  if (getSupabaseDataSchema() !== "co_production") {
    throw new BackendUnavailableError("Canonical revision upload authority");
  }
  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(assetId, userId, "editor", supabase);
  if (!assetAccess.ok) {
    if (assetAccess.status >= 500) {
      throw new BackendUnavailableError("Revision asset authority");
    }
    throw new UploadOrchestrationError(
      "UPLOAD_FORBIDDEN",
      "Asset is unavailable for revision upload",
    );
  }
  if (assetAccess.data.project_id !== projectId) {
    throw new UploadOrchestrationError(
      "UPLOAD_FORBIDDEN",
      "Asset is unavailable for revision upload",
    );
  }
  if (detectFileType(filename) !== assetAccess.data.file_type) {
    throw new UploadOrchestrationError(
      "UPLOAD_INVALID",
      "Revision file type does not match the asset",
    );
  }

  try {
    await assertAssetNotLocked(assetId, supabase);
  } catch (error) {
    if (isAssetDeliveryLockedError(error)) {
      throw new UploadOrchestrationError(
        "UPLOAD_CONFLICT",
        "Asset is part of a locked delivery",
      );
    }
    throw error;
  }

  const { data, error } = await supabase
    .from("versions")
    .select("id, version_number")
    .eq("asset_id", assetId)
    .eq("is_current", true)
    .limit(2);
  if (error) {
    throw new BackendUnavailableError("Revision current-version authority");
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new UploadOrchestrationError(
      "UPLOAD_STATE",
      "Asset does not have one canonical current version",
    );
  }
  const current = data[0] as { id?: unknown; version_number?: unknown };
  if (current.id !== expectedCurrentVersionId) {
    throw new UploadOrchestrationError(
      "UPLOAD_CONFLICT",
      "Asset current version changed before revision upload",
    );
  }
  if (
    !Number.isSafeInteger(current.version_number) ||
    Number(current.version_number) < 1 ||
    Number(current.version_number) >= Number.MAX_SAFE_INTEGER
  ) {
    throw new UploadOrchestrationError(
      "UPLOAD_STATE",
      "Asset current version number is invalid",
    );
  }
  return { version: Number(current.version_number) + 1 };
}

function uploadCatalogRpcFailure(error: unknown, revision: boolean): Error {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : null;
  switch (code) {
    case "42501":
      return new UploadOrchestrationError(
        "UPLOAD_FORBIDDEN",
        "Upload catalog authority denied",
      );
    case "22023":
      return new UploadOrchestrationError(
        "UPLOAD_STATE",
        revision
          ? "Committed upload is not valid for revision catalog attachment"
          : "Committed upload is not valid for V1 catalog attachment",
      );
    case "40001":
      return revision
        ? new UploadOrchestrationError(
            "UPLOAD_CONFLICT",
            "Asset current version changed before revision attachment",
          )
        : new BackendUnavailableError("Upload catalog transaction");
    case "23505":
      return new UploadOrchestrationError(
        "UPLOAD_CONFLICT",
        "Committed upload conflicts with existing catalog state",
      );
    case "23514":
      return revision
        ? new UploadOrchestrationError(
            "UPLOAD_CONFLICT",
            "Asset is part of a locked delivery",
          )
        : new BackendUnavailableError("Upload catalog transaction");
    default:
      return new BackendUnavailableError("Upload catalog transaction");
  }
}

function catalogTitleFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  const fallback = filename.trim() || "Untitled upload";
  return (stem || fallback).slice(0, 500).trim() || "Untitled upload";
}

export async function ensureCatalogAsset(
  orchestrator: UploadOrchestrator,
  session: UploadSession,
  userId: string
): Promise<Record<string, unknown> | null> {
  if (session.state !== "committed" || !session.objectKey) return null;
  const supabase = getSupabase();
  return orchestrator.reconcileCatalog(session.id, userId, async (current) => {
    if (getSupabaseDataSchema() !== "co_production") {
      throw new BackendUnavailableError("Canonical upload catalog");
    }
    const receipt = current.receipt;
    const isRevision = current.version > 1;
    if (
      current.scan?.verdict !== "clean" ||
      current.version < 1 ||
      !current.objectKey ||
      !current.computedSha256 ||
      !receipt ||
      receipt.provider !== current.provider ||
      receipt.objectKey !== current.objectKey ||
      receipt.size !== current.size ||
      receipt.sha256 !== current.computedSha256 ||
      typeof receipt.providerVersionId !== "string" ||
      !receipt.providerVersionId ||
      (isRevision &&
        (!current.assetId || !current.expectedCurrentVersionId)) ||
      (!isRevision && current.expectedCurrentVersionId != null)
    ) {
      throw new UploadOrchestrationError(
        "UPLOAD_STATE",
        isRevision
          ? "Committed upload is not clean and receipt-bound for revision catalog attachment"
          : "Committed upload is not clean and receipt-bound for V1 catalog attachment",
      );
    }

    // Locked-delivery guard (6.4): the only version-creation chokepoint
    // refuses to add a version to an asset frozen in a locked delivery.
    if (current.assetId) {
      try {
        await assertAssetNotLocked(current.assetId, supabase);
      } catch (error) {
        if (isAssetDeliveryLockedError(error)) {
          throw new UploadOrchestrationError(
            "UPLOAD_CONFLICT",
            "Asset is part of a locked delivery",
          );
        }
        throw error;
      }
    }

    const { data, error } = isRevision
      ? await supabase.rpc("attach_committed_upload_revision", {
          p_actor_id: userId,
          p_upload_id: current.id,
          p_asset_id: current.assetId,
          p_project_id: current.projectId,
          p_expected_current_version_id: current.expectedCurrentVersionId,
          p_expected_version_number: current.version,
          p_original_filename: current.filename,
          p_mime_type: current.mimeType,
          p_file_size: current.size,
          p_storage_provider: current.provider,
          p_storage_object_key: current.objectKey,
          p_storage_sha256: current.computedSha256,
          p_storage_provider_version_id: receipt.providerVersionId,
          p_storage_committed_at: receipt.committedAt,
        })
      : await supabase.rpc("attach_committed_upload_v1", {
          p_actor_id: userId,
          p_upload_id: current.id,
          p_expected_asset_id: current.assetId,
          p_project_id: current.projectId,
          p_folder_id: current.folderId,
          p_title: catalogTitleFromFilename(current.filename),
          p_file_type: detectFileType(current.filename),
          p_original_filename: current.filename,
          p_mime_type: current.mimeType,
          p_file_size: current.size,
          p_storage_provider: current.provider,
          p_storage_object_key: current.objectKey,
          p_storage_sha256: current.computedSha256,
          p_storage_provider_version_id: receipt.providerVersionId,
          p_storage_committed_at: receipt.committedAt,
        });
    if (error) {
      throw uploadCatalogRpcFailure(error, isRevision);
    }

    const rows = Array.isArray(data) ? data : [];
    const record = rows.length === 1 ? rows[0] : null;
    if (
      !record ||
      typeof record !== "object" ||
      typeof record.id !== "string" ||
      !record.id ||
      typeof record.version_id !== "string" ||
      !record.version_id ||
      record.version_number !== current.version ||
      (isRevision && record.id !== current.assetId) ||
      typeof record.file_url !== "string" ||
      record.file_url !== `/api/media/versions/${record.version_id}`
    ) {
      throw new BackendUnavailableError("Upload catalog transaction");
    }
    return record as Record<string, unknown> & {
      id: string;
      version_id: string;
    };
  });
}

export async function* requestBodyChunks(
  request: Request
): AsyncIterable<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      if (result.value.byteLength > 0) yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}
