import { NextResponse } from "next/server";
import {
  canInviteCompleteReview,
  normalizeReviewCompletionReviewerName,
  parseReviewCompletionRequest,
  toPublicReviewCompletion,
} from "@/lib/review/completion";
import {
  getAuthorizedReviewInvite,
  reviewInviteErrorPayload,
} from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const inviteLookup = await getAuthorizedReviewInvite(request, token);

  if (!inviteLookup.ok) {
    return NextResponse.json(
      reviewInviteErrorPayload(inviteLookup),
      { status: inviteLookup.status },
    );
  }

  const requestBody = parseReviewCompletionRequest(
    await request.json().catch(() => null),
  );
  if (!requestBody.ok) {
    return NextResponse.json({ error: requestBody.error }, { status: 400 });
  }

  const { invite } = inviteLookup;
  if (!canInviteCompleteReview(invite)) {
    return NextResponse.json(
      { error: "This review link cannot mark a review complete" },
      { status: 403 },
    );
  }

  const reviewerName = normalizeReviewCompletionReviewerName({
    requestedReviewerName: requestBody.reviewerName,
    invite,
  });
  if (!reviewerName) {
    return NextResponse.json(
      { error: "Enter your reviewer name before completing the review" },
      { status: 400 },
    );
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });
  if (!versionLookup.ok) {
    return NextResponse.json(
      {
        error:
          versionLookup.status >= 500
            ? "Review media is temporarily unavailable"
            : versionLookup.error,
      },
      { status: versionLookup.status >= 500 ? 503 : versionLookup.status },
    );
  }

  const { data, error } = await getSupabase().rpc("complete_review_invite", {
    p_review_invite_id: invite.id,
    p_asset_id: invite.asset_id,
    p_version_id: versionLookup.version.id,
    p_reviewer_name: reviewerName,
    p_note: requestBody.note,
  });
  const record = Array.isArray(data) ? data[0] : data;

  if (error || !record || typeof record !== "object") {
    return NextResponse.json(
      { error: "Review completion is temporarily unavailable" },
      { status: 503 },
    );
  }

  const created = (record as { created?: unknown }).created === true;
  return NextResponse.json(
    {
      completion: toPublicReviewCompletion(record as Record<string, unknown>),
      created,
    },
    { status: created ? 201 : 200 },
  );
}
