import { publishedHlsPlaylistResponse } from "@/lib/media-pipeline/hls-http";
import {
  authorizeReviewerHlsPublication,
  refreshReviewGrant,
} from "@/lib/media-pipeline/reviewer-hls-authority";
import { reviewBackendUnavailable } from "@/lib/review/responses";
import { createStorageRuntime } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ admissionId: string }> },
) {
  const { admissionId } = await params;
  const authority = await authorizeReviewerHlsPublication(request, admissionId);
  if (!authority.ok) return authority.response;
  try {
    const response = await publishedHlsPlaylistResponse({
      publication: authority.publication,
      adapter: createStorageRuntime().adapter,
      vary: "Cookie",
    });
    return refreshReviewGrant(response, authority.setCookie);
  } catch {
    return refreshReviewGrant(reviewBackendUnavailable(), authority.setCookie);
  }
}
