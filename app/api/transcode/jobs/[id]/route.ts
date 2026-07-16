import { NextRequest, NextResponse } from "next/server";

import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { isMediaPipelineError } from "@/lib/media-pipeline/errors";
import { createMediaPipelineService } from "@/lib/media-pipeline/service";
import { toPublicMediaPipelineJob } from "@/lib/media-pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (isMediaPipelineError(error)) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
  }
  return NextResponse.json({ error: "Media pipeline is unavailable" }, { status: 503 });
}

async function authorize(id: string, userId: string) {
  const service = createMediaPipelineService();
  const job = await service.get(id);
  if (!job) return { service, job: null, response: NextResponse.json({ error: "Pipeline job not found" }, { status: 404 }) };
  const ownership = await getAssetAccess(job.assetId, userId, "viewer");
  if (!ownership.ok) {
    return {
      service,
      job: null,
      response: NextResponse.json({ error: ownership.error }, { status: ownership.status }),
    };
  }
  return { service, job, response: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const result = await authorize(id, user.id);
    if (result.response) return result.response;
    return NextResponse.json({ job: toPublicMediaPipelineJob(result.job!) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { action?: unknown };
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ error: "Expected a JSON request body" }, { status: 400 });
  }
  if (body.action !== "cancel" && body.action !== "retry") {
    return NextResponse.json({ error: "action must be cancel or retry" }, { status: 400 });
  }

  try {
    const { id } = await params;
    const result = await authorize(id, user.id);
    if (result.response) return result.response;
    const job =
      body.action === "cancel"
        ? await result.service.requestCancellation(id)
        : await result.service.requestRetry(id);
    return NextResponse.json({ job: toPublicMediaPipelineJob(job) });
  } catch (error) {
    return errorResponse(error);
  }
}
