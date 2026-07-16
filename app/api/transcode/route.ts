import { NextRequest, NextResponse } from "next/server";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeExpectedSize(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function sourceFilename(nasPath: string, fallback: string | null): string {
  const filename = nasPath.replace(/\\/g, "/").split("/").pop();
  return filename || fallback || "source";
}

function pipelineErrorResponse(error: unknown) {
  if (!isMediaPipelineError(error)) {
    return NextResponse.json({ error: "Media pipeline is unavailable" }, { status: 503 });
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
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { asset_id?: unknown; version_id?: unknown };
  try {
    body = (await req.json()) as { asset_id?: unknown; version_id?: unknown };
  } catch {
    return NextResponse.json({ error: "Expected a JSON request body" }, { status: 400 });
  }
  if (typeof body.asset_id !== "string" || !body.asset_id) {
    return NextResponse.json({ error: "asset_id is required" }, { status: 400 });
  }
  if (body.version_id !== undefined && typeof body.version_id !== "string") {
    return NextResponse.json({ error: "version_id must be a string" }, { status: 400 });
  }

  const ownership = await getAssetAccess(body.asset_id, user.id, "editor");
  if (!ownership.ok) {
    return NextResponse.json({ error: ownership.error }, { status: ownership.status });
  }
  const versionLookup = await resolveAssetVersion({
    assetId: ownership.data.id,
    versionId: typeof body.version_id === "string" ? body.version_id : undefined,
  });
  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  const { data: asset, error } = await getSupabase()
    .from("assets")
    .select("id, project_id, nas_path, file_url, file_size, title")
    .eq("id", ownership.data.id)
    .maybeSingle();
  if (error || !asset) {
    return NextResponse.json({ error: "Asset source could not be resolved" }, { status: 404 });
  }
  if (typeof asset.nas_path !== "string" || !asset.nas_path.trim()) {
    return NextResponse.json(
      {
        error: "This version is not backed by a storage-adapter object key.",
        code: "VERSION_SOURCE_NOT_READY",
      },
      { status: 409 }
    );
  }
  if (versionLookup.version.file_url !== asset.file_url) {
    return NextResponse.json(
      {
        error: "The selected version is not the asset's current immutable source.",
        code: "VERSION_SOURCE_MISMATCH",
      },
      { status: 409 }
    );
  }

  try {
    const service = createMediaPipelineService();
    const job = await service.enqueue({
      assetId: asset.id,
      versionId: versionLookup.version.id,
      projectId: asset.project_id,
      source: {
        objectKey: asset.nas_path,
        filename: sourceFilename(asset.nas_path, asset.title),
        versionNumber: versionLookup.version.version_number,
        expectedSize: safeExpectedSize(versionLookup.version.file_size ?? asset.file_size),
        expectedSha256: null,
      },
    });
    return NextResponse.json(
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
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get("job_id");
  if (!jobId) return NextResponse.json({ error: "job_id is required" }, { status: 400 });

  try {
    const job = await createMediaPipelineService().get(jobId);
    if (!job) return NextResponse.json({ error: "Pipeline job not found" }, { status: 404 });
    const ownership = await getAssetAccess(job.assetId, user.id, "viewer");
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status });
    }
    return NextResponse.json({ job: toPublicMediaPipelineJob(job) });
  } catch (pipelineError) {
    return pipelineErrorResponse(pipelineError);
  }
}
