import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import {
  selectPublishedExport,
  type PipelineExportArtifact,
} from "@/lib/media-pipeline/export";
import { getSupabase } from "@/lib/supabase";
import { assertSafeRegularFile, resolveExistingRoot, resolvePathInsideRoot } from "@/lib/storage/path-safety";
import { createStorageRuntime } from "@/lib/storage/runtime";
import { resolveAssetVersion } from "@/lib/versions";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { withAssetRouteBoundary } from "../../asset-route-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_ARTIFACTS = new Set<PipelineExportArtifact>([
  "source",
  "hls_manifest",
  "pipeline_manifest",
  "thumbnail",
  "waveform",
  "captions",
]);

function safeFilename(value: string): string {
  const normalized = value.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim();
  return normalized.slice(0, 180) || "download";
}

function parseArtifact(value: string | null): PipelineExportArtifact | null {
  const artifact = value ?? "source";
  return EXPORT_ARTIFACTS.has(artifact as PipelineExportArtifact)
    ? (artifact as PipelineExportArtifact)
    : null;
}

async function resolvePublishedFile(objectKey: string): Promise<{ path: string; size: number }> {
  const storage = createStorageRuntime();
  if (
    (storage.config.provider !== "local" && storage.config.provider !== "ccnas") ||
    !storage.config.filesystemRoot
  ) {
    throw new Error("Published export delivery requires a configured filesystem storage adapter");
  }
  const root = await resolveExistingRoot(storage.config.filesystemRoot);
  const candidate = resolvePathInsideRoot(root, objectKey);
  await assertSafeRegularFile(candidate);
  const path = await realpath(candidate);
  const relation = relative(root, path);
  if (!relation || relation === ".." || relation.startsWith(".." + sep)) {
    throw new Error("Published export object escaped its storage root");
  }
  await assertSafeRegularFile(path);
  const file = await stat(path);
  if (!file.isFile()) throw new Error("Published export object is not a regular file");
  return { path, size: file.size };
}

async function GETHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const { id } = await params;
  const ownership = await getAssetAccess(id, user.id, "member");
  if (!ownership.ok) {
    if (ownership.status >= 500) return backendUnavailable();
    return apiError("Asset not found", "ASSET_ACCESS_DENIED", ownership.status);
  }

  const artifact = parseArtifact(req.nextUrl.searchParams.get("artifact"));
  if (!artifact) {
    return apiError("Unsupported export artifact", "INVALID_REQUEST", 400);
  }
  const versionLookup = await resolveAssetVersion({
    assetId: id,
    versionId: req.nextUrl.searchParams.get("version_id"),
  });
  if (!versionLookup.ok) {
    return apiError(versionLookup.error, "VERSION_NOT_FOUND", versionLookup.status);
  }

  let assetResult;
  try { assetResult = await getSupabase()
    .from("assets")
    .select("id, title, file_type, status, metadata")
    .eq("id", id)
    .maybeSingle(); } catch { return backendUnavailable(); }
  const { data: asset, error } = assetResult;
  if (error) return backendUnavailable();
  if (!asset) {
    return apiError("Asset not found", "ASSET_NOT_FOUND", 404);
  }
  const selection = selectPublishedExport(asset.metadata, versionLookup.version.id, artifact);
  if (!selection.ok) {
    return apiError("The requested export is unavailable", selection.code, 409);
  }

  let file: { path: string; size: number };
  try {
    file = await resolvePublishedFile(selection.artifact.objectKey);
  } catch {
    return apiError("Published export object is unavailable", "PUBLISHED_OBJECT_UNAVAILABLE", 404);
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const streamUrl =
    "/api/assets/" +
    encodeURIComponent(id) +
    "/export?version_id=" +
    encodeURIComponent(versionLookup.version.id) +
    "&artifact=" +
    encodeURIComponent(artifact) +
    "&download=1";

  if (!download) {
    return apiJson({
      assetId: id,
      title: asset.title,
      fileType: asset.file_type,
      version: versionLookup.version.version_number,
      artifact: selection.artifact.artifact,
      fileSize: file.size,
      sha256: selection.artifact.sha256,
      delivery: "authenticated_stream",
      downloadUrl: streamUrl,
      status: asset.status,
    });
  }

  await getSupabase().from("activity_log").insert({
    asset_id: id,
    actor_id: user.id,
    actor_name: user.email,
    action: "downloaded_published_artifact",
    details: {
      version_id: versionLookup.version.id,
      version_number: versionLookup.version.version_number,
      artifact: selection.artifact.artifact,
      sha256: selection.artifact.sha256,
    },
  });

  const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": selection.artifact.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": "attachment; filename=\"" + safeFilename(selection.artifact.filename) + "\"",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withAssetRouteBoundary(GETHandler);
