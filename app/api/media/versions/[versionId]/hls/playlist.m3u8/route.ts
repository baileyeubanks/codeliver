import { backendUnavailable } from "@/lib/api/responses";
import { publishedHlsPlaylistResponse } from "@/lib/media-pipeline/hls-http";
import { authorizeViewerHlsPublication } from "@/lib/media-pipeline/viewer-hls-authority";
import { createStorageRuntime } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params;
  const authority = await authorizeViewerHlsPublication(versionId);
  if (!authority.ok) return authority.response;
  try {
    return await publishedHlsPlaylistResponse({
      publication: authority.publication,
      adapter: createStorageRuntime().adapter,
      vary: "Cookie, Authorization",
    });
  } catch {
    return backendUnavailable();
  }
}
