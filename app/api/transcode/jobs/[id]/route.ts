import { NextRequest } from "next/server";

import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { isMediaPipelineError } from "@/lib/media-pipeline/errors";
import { createMediaPipelineService } from "@/lib/media-pipeline/service";
import { toPublicMediaPipelineJob } from "@/lib/media-pipeline/types";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (isMediaPipelineError(error)) {
    return apiError("Media pipeline request could not be completed", error.code, 409);
  }
  return apiError("Media pipeline is unavailable", "PIPELINE_UNAVAILABLE", 503);
}

async function authorize(id: string, userId: string) {
  const service = createMediaPipelineService();
  const job = await service.get(id);
  if (!job) return { service, job: null, response: apiError("Pipeline job not found", "JOB_NOT_FOUND", 404) };
  const ownership = await getAssetAccess(job.assetId, userId, "viewer");
  if (!ownership.ok) {
    if (ownership.status >= 500) {
      return { service, job: null, response: backendUnavailable() };
    }
    return {
      service,
      job: null,
      response: apiError("Asset not found", "ASSET_ACCESS_DENIED", ownership.status),
    };
  }
  return { service, job, response: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);
  try {
    const { id } = await params;
    const result = await authorize(id, user.id);
    if (result.response) return result.response;
    return apiJson({ job: toPublicMediaPipelineJob(result.job!) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);
  let body: { action?: unknown };
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return apiError("Expected a JSON request body", "INVALID_REQUEST", 400);
  }
  if (body.action !== "cancel" && body.action !== "retry") {
    return apiError("action must be cancel or retry", "INVALID_REQUEST", 400);
  }

  try {
    const { id } = await params;
    const result = await authorize(id, user.id);
    if (result.response) return result.response;
    const job =
      body.action === "cancel"
        ? await result.service.requestCancellation(id)
        : await result.service.requestRetry(id);
    return apiJson({ job: toPublicMediaPipelineJob(job) });
  } catch (error) {
    return errorResponse(error);
  }
}
