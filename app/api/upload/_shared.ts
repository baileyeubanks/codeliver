import { NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
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

export async function ensureCatalogAsset(
  orchestrator: UploadOrchestrator,
  session: UploadSession,
  userId: string
): Promise<Record<string, unknown> | null> {
  if (session.state !== "committed" || !session.objectKey) return null;
  const supabase = getSupabase();
  return orchestrator.reconcileCatalog(session.id, userId, async (current) => {
    if (current.assetId) {
      const { data } = await supabase
        .from("assets")
        .select("*")
        .eq("id", current.assetId)
        .eq("project_id", current.projectId)
        .maybeSingle();
      if (data) return data as Record<string, unknown> & { id: string };
    }

    const { data: existing } = await supabase
      .from("assets")
      .select("*")
      .eq("project_id", current.projectId)
      .eq("nas_path", current.objectKey)
      .limit(1)
      .maybeSingle();
    if (existing) return existing as Record<string, unknown> & { id: string };

    const fileType = detectFileType(current.filename);
    const fileUrl =
      current.provider === "ccnas"
        ? `/api/media/stream?path=${encodeURIComponent(current.objectKey!)}`
        : null;
    const { data, error } = await supabase
      .from("assets")
      .insert({
        title: current.filename.replace(/\.[^.]+$/, ""),
        file_type: fileType,
        file_url: fileUrl,
        project_id: current.projectId,
        folder_id: current.folderId,
        status: "ready",
        nas_path: current.objectKey,
        file_size: current.size,
        uploaded_by: userId,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(error?.message || "Asset catalog write failed");
    }
    return data as Record<string, unknown> & { id: string };
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
