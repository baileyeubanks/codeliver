import crypto from "crypto";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { getAssetComment } from "@/lib/access-control";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import { demoReviewPayload } from "@/lib/review/demoReview";
import { inviteCanComment, getReviewInviteByToken } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

function reviewError(error: string, status: number, code = "REVIEW_REQUEST_INVALID") {
  if (status >= 500) return backendUnavailable();
  return apiError(error, code, status);
}

async function postComment(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reviewError("Comment request must be JSON.", 400);
  }
  const timecode = body.timecode_seconds == null ? null : body.timecode_seconds;
  const pinX = body.pin_x == null ? null : body.pin_x;
  const pinY = body.pin_y == null ? null : body.pin_y;
  const hasValidTimecode =
    timecode == null || (typeof timecode === "number" && Number.isFinite(timecode) && timecode >= 0);
  const hasValidPinPair =
    (pinX == null && pinY == null) ||
    (typeof pinX === "number" &&
      Number.isFinite(pinX) &&
      pinX >= 0 &&
      pinX <= 100 &&
      typeof pinY === "number" &&
      Number.isFinite(pinY) &&
      pinY >= 0 &&
      pinY <= 100);

  if (!hasValidTimecode || !hasValidPinPair) {
    return reviewError("Comment timing or point coordinates are invalid", 400);
  }

  if (process.env.NODE_ENV !== "production" && token === "demo") {
    if (!body.body?.trim()) {
      return reviewError("Comment body is required", 400);
    }

    return apiJson(
      {
        id: `demo-comment-${crypto.randomUUID()}`,
        review_id: null,
        review_invite_id: demoReviewPayload.invite.id,
        asset_id: demoReviewPayload.asset.id,
        version_id: null,
        parent_id: body.parent_id ?? null,
        author_name:
          body.author_name?.trim() ||
          demoReviewPayload.reviewer_name ||
          demoReviewPayload.reviewer_email ||
          "Demo reviewer",
        author_email: demoReviewPayload.reviewer_email,
        author_id: null,
        body: body.body.trim(),
        rich_body: null,
        timecode_seconds: timecode,
        frame_number: null,
        pin_x: pinX,
        pin_y: pinY,
        mentions: [],
        status: "open",
        visibility: "external",
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { status: 201 },
    );
  }

  const inviteLookup = await getReviewInviteByToken(token);

  if (!inviteLookup.ok) {
    return reviewError(inviteLookup.error, inviteLookup.status, "REVIEW_INVITE_UNAVAILABLE");
  }

  const { invite } = inviteLookup;
  if (!inviteCanComment(invite)) {
    return reviewError("This review link cannot add comments", 403, "REVIEW_COMMENT_FORBIDDEN");
  }

  if (!body.body?.trim()) {
    return reviewError("Comment body is required", 400);
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });
  if (!versionLookup.ok) {
    return reviewError(versionLookup.error, versionLookup.status, "REVIEW_VERSION_UNAVAILABLE");
  }

  if (body.parent_id) {
    const parent = await getAssetComment(body.parent_id, invite.asset_id);
    if (!parent.ok) {
      return reviewError(parent.error, parent.status, "REVIEW_COMMENT_UNAVAILABLE");
    }

    if (parent.data.visibility !== "external") {
      return reviewError("Replies must stay within the external review thread", 400);
    }

    if (parent.data.version_id !== versionLookup.version.id) {
      return reviewError("Replies must stay on the same media version", 400);
    }
  }

  const reviewerName =
    body.author_name?.trim() ||
    invite.reviewer_name ||
    invite.reviewer_email ||
    "Anonymous";

  if (!invite.reviewer_name && body.author_name?.trim()) {
    await getSupabase()
      .from("review_invites")
      .update({ reviewer_name: body.author_name.trim() })
      .eq("id", invite.id);
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .insert({
      asset_id: invite.asset_id,
      version_id: versionLookup.version.id,
      body: body.body.trim(),
      author_name: reviewerName,
      author_email: invite.reviewer_email || null,
      author_id: null,
      timecode_seconds: timecode,
      pin_x: pinX,
      pin_y: pinY,
      parent_id: body.parent_id ?? null,
      review_id: null,
      review_invite_id: invite.id,
      visibility: "external",
    })
    .select()
    .single();

  if (error) {
    return backendUnavailable();
  }

  const asset = await getSupabase()
    .from("assets")
    .select("project_id, title")
    .eq("id", invite.asset_id)
    .single();

  if (asset.data) {
    await getSupabase().from("activity_log").insert({
      project_id: asset.data.project_id,
      asset_id: invite.asset_id,
      actor_id: null,
      actor_name: reviewerName,
      action: "added_comment",
      details: {
        asset_title: asset.data.title,
        body: body.body.slice(0, 100),
        via: "review_link",
        version_id: versionLookup.version.id,
      },
    });

    const project = await getSupabase()
      .from("projects")
      .select("owner_id")
      .eq("id", asset.data.project_id)
      .single();

    if (project.data) {
      const owner = await getSupabase().auth.admin.getUserById(project.data.owner_id);
      if (owner.data?.user?.email) {
        const reviewUrl = `${getBaseUrl()}/projects/${asset.data.project_id}/assets/${invite.asset_id}`;
        const emailPayload = emailTemplates.commentNotification(
          owner.data.user.email,
          reviewerName,
          asset.data.title,
          body.body,
          reviewUrl
        );
        await sendEmail({ to: owner.data.user.email, ...emailPayload });
      }
    }
  }

  return apiJson(data ?? {}, { status: 201 });
}

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return await postComment(req, context);
  } catch {
    return backendUnavailable();
  }
}
