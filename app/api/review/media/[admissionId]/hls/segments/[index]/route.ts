import {
  parseHlsSegmentIndex,
  publishedHlsSegmentResponse,
} from "@/lib/media-pipeline/hls-http";
import {
  authorizeReviewerHlsPublication,
  refreshReviewGrant,
} from "@/lib/media-pipeline/reviewer-hls-authority";
import {
  reviewBackendUnavailable,
  reviewError,
} from "@/lib/review/responses";
import { createStorageRuntime } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ admissionId: string; index: string }> },
) {
  const { admissionId, index: rawIndex } = await params;
  const authority = await authorizeReviewerHlsPublication(request, admissionId);
  if (!authority.ok) return authority.response;
  const index = parseHlsSegmentIndex(rawIndex);
  if (index === null || !authority.publication.segments[index]) {
    return refreshReviewGrant(
      reviewError("Media not found", "REVIEW_MEDIA_NOT_FOUND", 404),
      authority.setCookie,
    );
  }
  try {
    const response = await publishedHlsSegmentResponse({
      publication: authority.publication,
      adapter: createStorageRuntime().adapter,
      index,
      vary: "Cookie",
    });
    return refreshReviewGrant(response, authority.setCookie);
  } catch {
    return refreshReviewGrant(reviewBackendUnavailable(), authority.setCookie);
  }
}
