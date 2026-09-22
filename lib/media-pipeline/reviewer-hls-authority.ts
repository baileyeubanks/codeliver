import {
  selectPublishedHlsPublication,
  type PublishedHlsPublication,
} from "@/lib/media-pipeline/hls-delivery";
import { authorizeReviewMedia } from "@/lib/review/admission-authority";
import { validateReviewReadRequest } from "@/lib/review/request-boundary";
import {
  reviewBackendUnavailable,
  reviewError,
} from "@/lib/review/responses";
import { getSupabase } from "@/lib/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReviewerHlsAuthorityResult =
  | {
      ok: true;
      publication: PublishedHlsPublication;
      setCookie: string;
    }
  | { ok: false; response: Response };

export function refreshReviewGrant(response: Response, setCookie: string): Response {
  response.headers.set("Set-Cookie", setCookie);
  return response;
}

export async function authorizeReviewerHlsPublication(
  request: Request,
  admissionId: string,
): Promise<ReviewerHlsAuthorityResult> {
  let refreshedCookie: string | null = null;
  try {
    const boundary = validateReviewReadRequest(request);
    if (!boundary.ok) {
      return {
        ok: false,
        response: reviewError(
          "Review media request is not allowed",
          boundary.code,
          boundary.status,
        ),
      };
    }

    const authority = await authorizeReviewMedia(request, admissionId);
    if (!authority.ok) {
      return {
        ok: false,
        response: reviewError(
          authority.status === 404
            ? "Media not found"
            : "Review media is unavailable",
          authority.code,
          authority.status,
        ),
      };
    }
    refreshedCookie = authority.setCookie;
    const { claims } = authority;
    if (
      claims.admissionId !== admissionId ||
      !UUID_PATTERN.test(claims.assetId) ||
      !UUID_PATTERN.test(claims.versionId)
    ) {
      return {
        ok: false,
        response: refreshReviewGrant(
          reviewError("Media not found", "REVIEW_MEDIA_NOT_FOUND", 404),
          refreshedCookie,
        ),
      };
    }

    const assetResult = await getSupabase()
      .from("assets")
      .select("id, metadata")
      .eq("id", claims.assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (assetResult.error) {
      return {
        ok: false,
        response: refreshReviewGrant(reviewBackendUnavailable(), refreshedCookie),
      };
    }
    if (!assetResult.data) {
      return {
        ok: false,
        response: refreshReviewGrant(
          reviewError("Media not found", "REVIEW_MEDIA_NOT_FOUND", 404),
          refreshedCookie,
        ),
      };
    }

    const publication = selectPublishedHlsPublication({
      assetId: claims.assetId,
      assetMetadata: assetResult.data.metadata,
      versionId: claims.versionId,
      versionAssetId: claims.assetId,
    });
    if (!publication) {
      return {
        ok: false,
        response: refreshReviewGrant(
          reviewError("Media not found", "REVIEW_MEDIA_NOT_FOUND", 404),
          refreshedCookie,
        ),
      };
    }
    return { ok: true, publication, setCookie: refreshedCookie };
  } catch {
    const response = reviewBackendUnavailable();
    return {
      ok: false,
      response: refreshedCookie
        ? refreshReviewGrant(response, refreshedCookie)
        : response,
    };
  }
}
