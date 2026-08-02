import { NextResponse } from "next/server";
import {
  getAuthorizedReviewInvite,
  reviewInviteErrorPayload,
} from "@/lib/review-invites";
import { extractReviewAnalyticsToken } from "@/lib/sharing/share-analytics";
import { resolveAssetVersion } from "@/lib/versions";

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return noStore({ error: "Request body must be an object" }, { status: 400 });
  }

  const tokenResult = extractReviewAnalyticsToken(
    request,
    body as Record<string, unknown>,
  );
  if (!tokenResult.ok) {
    return noStore({ error: tokenResult.error }, { status: 401 });
  }

  const inviteResult = await getAuthorizedReviewInvite(request, tokenResult.token);
  if (!inviteResult.ok) {
    return noStore(
      inviteResult.status === 401
        ? reviewInviteErrorPayload(inviteResult)
        : { error: "Invalid review authorization" },
      { status: inviteResult.status === 401 ? 401 : inviteResult.status },
    );
  }
  const invite = inviteResult.invite;
  if (
    (body.invite_id !== undefined && body.invite_id !== invite.id) ||
    (body.asset_id !== undefined && body.asset_id !== invite.asset_id)
  ) {
    return noStore({ error: "Invalid review authorization" }, { status: 401 });
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });
  if (!versionLookup.ok) {
    return noStore({ error: "Review media is unavailable" }, { status: 404 });
  }

  if (invite.watermark_enabled) {
    return noStore(
      {
        error: "Server-side watermark delivery is not configured",
        watermark_required: true,
        delivery_ready: false,
      },
      { status: 503 },
    );
  }

  return noStore({
    url: `/api/review/${encodeURIComponent(tokenResult.token)}/media`,
    version_id: versionLookup.version.id,
    watermarked: false,
    watermark_required: false,
  });
}
