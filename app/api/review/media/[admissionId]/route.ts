import {
  normalizeManagedVersionMediaRecord,
  serveManagedVersionMedia,
} from "@/lib/media/managed-version-response";
import { authorizeReviewMedia } from "@/lib/review/admission-authority";
import { validateReviewReadRequest } from "@/lib/review/request-boundary";
import {
  reviewBackendUnavailable,
  reviewError,
} from "@/lib/review/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serve(
  request: Request,
  { params }: { params: Promise<{ admissionId: string }> },
  headOnly: boolean,
) {
  const boundary = validateReviewReadRequest(request);
  if (!boundary.ok) {
    return reviewError(
      "Review media request is not allowed",
      boundary.code,
      boundary.status,
    );
  }

  const { admissionId } = await params;
  const authority = await authorizeReviewMedia(request, admissionId);
  if (!authority.ok) {
    return reviewError(
      authority.status === 404
        ? "Media not found"
        : "Review media is unavailable",
      authority.code,
      authority.status,
    );
  }
  const media = normalizeManagedVersionMediaRecord({
    id: authority.media.version_id,
    asset_id: authority.media.asset_id,
    file_size: authority.media.file_size,
    storage_provider: authority.media.storage_provider,
    storage_object_key: authority.media.storage_object_key,
    storage_sha256: authority.media.storage_sha256,
    storage_provider_version_id:
      authority.media.storage_provider_version_id,
    original_filename: authority.media.original_filename,
    mime_type: authority.media.mime_type,
  });
  if (!media) return reviewBackendUnavailable();

  const response = await serveManagedVersionMedia({
    request,
    media,
    headOnly,
    allowDownload: authority.media.download_enabled,
    denyNonInlineWithoutDownload: true,
    vary: "Cookie, Range",
  });
  response.headers.set("Set-Cookie", authority.setCookie);
  return response;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ admissionId: string }> },
) {
  try {
    return await serve(request, context, false);
  } catch {
    return reviewBackendUnavailable();
  }
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ admissionId: string }> },
) {
  try {
    return await serve(request, context, true);
  } catch {
    return reviewBackendUnavailable();
  }
}
