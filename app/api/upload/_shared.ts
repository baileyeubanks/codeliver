import { NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
import { getSupabase } from "@/lib/supabase";
import { detectFileType } from "@/lib/utils/media";
import { isStorageError } from "@/lib/storage/errors";
import type { UploadSession } from "@/lib/tus/session";
import type { TenantAuthority } from "@/lib/tenant-authority";
import { mapMediaIngestRouteError } from "@/lib/media-pipeline/ingest-route-integration";
import {
  isUploadOrchestrationError,
  UploadOrchestrationError,
} from "@/lib/tus/errors";
import type { UploadOrchestrator } from "@/lib/tus/orchestrator";
export { requestBodyChunks } from "@/lib/tus/http";

export interface UploadHttpError {
  status: number;
  message: string;
  retryAfter?: string;
}

export function mapUploadError(error: unknown): UploadHttpError {
  if (isUploadOrchestrationError(error)) {
    switch (error.code) {
      case "UPLOAD_NOT_FOUND":
        return { status: 404, message: error.message };
      case "UPLOAD_FORBIDDEN":
        return { status: 403, message: error.message };
      case "UPLOAD_INVALID":
        return { status: 400, message: error.message };
      case "UPLOAD_CONFLICT":
      case "UPLOAD_OFFSET":
      case "UPLOAD_STATE":
        return { status: 409, message: error.message };
      case "UPLOAD_CHECKSUM":
        return { status: 422, message: error.message };
      case "UPLOAD_QUOTA":
        return { status: 429, message: error.message, retryAfter: "60" };
      case "UPLOAD_BUSY":
        return { status: 423, message: error.message, retryAfter: "2" };
      case "UPLOAD_BACKPRESSURE":
        return { status: 503, message: error.message, retryAfter: "15" };
    }
  }

  if (isStorageError(error)) {
    switch (error.code) {
      case "STORAGE_PATH_INVALID":
        return { status: 400, message: error.message };
      case "STORAGE_CONFLICT":
      case "STORAGE_OFFSET":
        return { status: 409, message: error.message };
      case "STORAGE_CHECKSUM":
        return { status: 422, message: error.message };
      case "STORAGE_CAPACITY":
        return { status: 507, message: error.message, retryAfter: "60" };
      case "STORAGE_NOT_CONFIGURED":
      case "STORAGE_NOT_READY":
      case "STORAGE_UNSUPPORTED":
        return { status: 503, message: error.message, retryAfter: "15" };
    }
  }
  return { status: 500, message: "Upload orchestration failed" };
}

export function jsonUploadError(
  error: unknown,
  headers: Record<string, string>
): NextResponse {
  const mapped = mapUploadError(error);
  return NextResponse.json(
    { error: mapped.message },
    {
      status: mapped.status,
      headers: {
        ...headers,
        ...(mapped.retryAfter ? { "Retry-After": mapped.retryAfter } : {}),
      },
    }
  );
}

export function jsonMediaIngestUploadError(
  error: unknown,
  headers: Record<string, string>
): NextResponse {
  const mapped = mapMediaIngestRouteError(error);
  return NextResponse.json(
    { error: mapped.message },
    {
      status: mapped.status,
      headers: {
        ...headers,
        ...(mapped.retryAfter ? { "Retry-After": mapped.retryAfter } : {}),
      },
    }
  );
}

export async function requireOwnedUploadTarget(
  userId: string,
  projectId: string,
  folderId?: string
): Promise<{
  projectId: string;
  folderId: string | null;
  tenantAuthority: TenantAuthority;
}> {
  const supabase = getSupabase();
  const projectAccess = await getProjectAccess(
    projectId,
    userId,
    "editor",
    supabase,
  );
  if (!projectAccess.ok) {
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
    if (error || !folder) {
      throw new UploadOrchestrationError(
        "UPLOAD_FORBIDDEN",
        "Folder is unavailable for upload"
      );
    }
  }
  return {
    projectId: projectAccess.data.id,
    folderId: folderId ?? null,
    tenantAuthority: projectAccess.data.tenant_authority,
  };
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
