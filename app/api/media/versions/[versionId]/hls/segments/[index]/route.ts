import { apiError, backendUnavailable } from "@/lib/api/responses";
import {
  parseHlsSegmentIndex,
  publishedHlsSegmentResponse,
} from "@/lib/media-pipeline/hls-http";
import { authorizeViewerHlsPublication } from "@/lib/media-pipeline/viewer-hls-authority";
import { createStorageRuntime } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string; index: string }> },
) {
  const { versionId, index: rawIndex } = await params;
  const authority = await authorizeViewerHlsPublication(versionId);
  if (!authority.ok) return authority.response;
  const index = parseHlsSegmentIndex(rawIndex);
  if (index === null || !authority.publication.segments[index]) {
    return apiError("Media not found", "HLS_SEGMENT_NOT_FOUND", 404);
  }
  try {
    return await publishedHlsSegmentResponse({
      publication: authority.publication,
      adapter: createStorageRuntime().adapter,
      index,
      vary: "Cookie, Authorization",
    });
  } catch {
    return backendUnavailable();
  }
}
