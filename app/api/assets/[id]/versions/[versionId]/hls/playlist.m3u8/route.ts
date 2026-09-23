import { backendUnavailable } from "@/lib/api/responses";
import { publishedHlsPlaylistResponse } from "@/lib/media-pipeline/hls-http";
import { authorizeAssetHlsRead } from "@/lib/media-pipeline/staff-hls-authority";
import { createStorageRuntime } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;
  const authority = await authorizeAssetHlsRead(id, versionId);
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
