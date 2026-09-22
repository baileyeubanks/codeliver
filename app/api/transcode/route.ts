import { NextRequest } from "next/server";

import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import {
  createMediaPipelineService,
} from "@/lib/media-pipeline/service";
import {
  isMediaPipelineError,
} from "@/lib/media-pipeline/errors";
import { toPublicMediaPipelineJob } from "@/lib/media-pipeline/types";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";

import { buildManagedTranscodeSource } from "@/app/api/transcode/source-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pipelineErrorResponse(error: unknown) {
  if (!isMediaPipelineError(error)) {
    return apiError("Media pipeline is unavailable", "PIPELINE_UNAVAILABLE", 503);
  }
  const status =
    error.code === "PIPELINE_NOT_CONFIGURED" ||
    error.code === "PIPELINE_STORAGE_NOT_READY"
      ? 503
      : error.code === "PIPELINE_SOURCE_INVALID" ||
          error.code === "PIPELINE_SOURCE_CHANGED" ||
          error.code === "PIPELINE_SOURCE_MISSING" ||
          error.code === "PIPELINE_SOURCE_RECEIPT_REQUIRED"
        ? 409
        : 400;
  return apiError("Media pipeline request could not be completed", error.code, status);
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  let body: { asset_id?: unknown; version_id?: unknown };
  try {
    body = (await req.json()) as { asset_id?: unknown; version_id?: unknown };
  } catch {
    return apiError("Expected a JSON request body", "INVALID_REQUEST", 400);
  }
  if (typeof body.asset_id !== "string" || !body.asset_id) {
    return apiError("asset_id is required", "INVALID_REQUEST", 400);
  }
  if (body.version_id !== undefined && typeof body.version_id !== "string") {
    return apiError("version_id must be a string", "INVALID_REQUEST", 400);
  }

  const ownership = await getAssetAccess(body.asset_id, user.id, "editor");
  if (!ownership.ok) {
    if (ownership.status >= 500) return backendUnavailable();
    return apiError("Asset not found", "ASSET_ACCESS_DENIED", ownership.status);
  }
  const versionLookup = await resolveAssetVersion({
    assetId: ownership.data.id,
    versionId: typeof body.version_id === "string" ? body.version_id : undefined,
  });
  if (!versionLookup.ok) {
    return apiError(versionLookup.error, "VERSION_NOT_FOUND", versionLookup.status);
  }

  let assetResult;
  try { assetResult = await getSupabase()
    .from("assets")
    .select("id, project_id, nas_path, file_url, file_size")
    .eq("id", ownership.data.id)
    .maybeSingle(); } catch { return backendUnavailable(); }
  const { data: asset, error } = assetResult;
  if (error) return apiError("Asset source could not be resolved", "BACKEND_UNAVAILABLE", 503);
  if (!asset) {
    return apiError("Asset source could not be resolved", "ASSET_NOT_FOUND", 404);
  }
  if (typeof asset.nas_path !== "string" || !asset.nas_path.trim()) {
    return apiError(
      "This version is not backed by a storage-adapter object key.",
      "VERSION_SOURCE_NOT_READY",
      409,
    );
  }
  if (versionLookup.version.file_url !== asset.file_url) {
    return apiError(
      "The selected version is not the asset's current immutable source.",
      "VERSION_SOURCE_MISMATCH",
      409,
    );
  }

  let receiptResult;
  try {
    receiptResult = await getSupabase()
      .from("versions")
      .select(
        "id, asset_id, version_number, file_size, storage_provider, storage_object_key, storage_sha256, storage_provider_version_id, storage_committed_at, original_filename",
      )
      .eq("id", versionLookup.version.id)
      .eq("asset_id", asset.id)
      .maybeSingle();
  } catch {
    return backendUnavailable();
  }
  if (receiptResult.error) {
    return apiError(
      "Version source could not be resolved",
      "BACKEND_UNAVAILABLE",
      503,
    );
  }
  const sourceResult = buildManagedTranscodeSource({
    asset,
    selectedVersion: versionLookup.version,
    receiptRow: receiptResult.data,
  });
  if (!sourceResult.ok) {
    return apiError(sourceResult.message, sourceResult.code, 409);
  }

  try {
    const service = createMediaPipelineService();
    const job = await service.enqueue({
      assetId: asset.id,
      versionId: versionLookup.version.id,
      projectId: asset.project_id,
      source: sourceResult.source,
    });
    return apiJson(
      {
        job: toPublicMediaPipelineJob(job),
        worker_url: "/api/transcode/worker",
      },
      { status: 202 }
    );
  } catch (pipelineError) {
    return pipelineErrorResponse(pipelineError);
  }
}

export async function GET(req: NextRequest) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);
  const jobId = req.nextUrl.searchParams.get("job_id");
  if (!jobId) return apiError("job_id is required", "INVALID_REQUEST", 400);

  try {
    const job = await createMediaPipelineService().get(jobId);
    if (!job) return apiError("Pipeline job not found", "JOB_NOT_FOUND", 404);
    const ownership = await getAssetAccess(job.assetId, user.id, "viewer");
    if (!ownership.ok) {
      if (ownership.status >= 500) return backendUnavailable();
      return apiError("Asset not found", "ASSET_ACCESS_DENIED", ownership.status);
    }
    return apiJson({ job: toPublicMediaPipelineJob(job) });
  } catch (pipelineError) {
    return pipelineErrorResponse(pipelineError);
  }
}
