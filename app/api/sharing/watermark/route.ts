import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { getReviewInviteByToken } from "@/lib/review-invites";
import { extractReviewAnalyticsToken } from "@/lib/sharing/share-analytics";
import { resolveAssetVersion } from "@/lib/versions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Request body must be an object", "INVALID_REQUEST", 400);
  }

  const tokenResult = extractReviewAnalyticsToken(
    request,
    body as Record<string, unknown>,
  );
  if (!tokenResult.ok) {
    return apiError("Invalid review authorization", "UNAUTHORIZED", 401);
  }

  let inviteResult;
  try { inviteResult = await getReviewInviteByToken(tokenResult.token); } catch { return apiError("Review authorization is unavailable", "BACKEND_UNAVAILABLE", 503); }
  if (!inviteResult.ok) {
    return apiError("Invalid review authorization", "UNAUTHORIZED", 401);
  }
  const invite = inviteResult.invite;
  if (
    (body.invite_id !== undefined && body.invite_id !== invite.id) ||
    (body.asset_id !== undefined && body.asset_id !== invite.asset_id)
  ) {
    return apiError("Invalid review authorization", "UNAUTHORIZED", 401);
  }

  let versionLookup;
  try { versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  }); } catch { return apiError("Review media is unavailable", "BACKEND_UNAVAILABLE", 503); }
  if (!versionLookup.ok) {
    return apiError("Review media is unavailable", "VERSION_NOT_FOUND", 404);
  }

  if (invite.watermark_enabled) {
    return apiJson(
      {
        error: "Server-side watermark delivery is not configured",
        code: "WATERMARK_UNAVAILABLE",
        watermark_required: true,
        delivery_ready: false,
      },
      { status: 503 },
    );
  }

  return apiJson({
    url: versionLookup.version.file_url,
    version_id: versionLookup.version.id,
    watermarked: false,
    watermark_required: false,
  });
}
