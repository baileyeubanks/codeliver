import crypto from "crypto";
import { NextResponse } from "next/server";
import { projectTenantAuthority } from "@/lib/access-control";
import { getAssetComment } from "@/lib/access-control";
import {
  dispatchTransactionalNotification,
} from "@/lib/notifications/transactional";
import {
  DEMO_REVIEW_VERSION_ID,
  demoReviewPayload,
} from "@/lib/review/demoReview";
import {
  getAuthorizedReviewInvite,
  inviteCanComment,
  reviewInviteErrorPayload,
} from "@/lib/review-invites";
import {
  isExternalReviewThreadForInvite,
  replySourceFromParent,
} from "@/lib/review/thread-policy";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";
import { toPublicReviewComment } from "@/lib/review/public-dto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const isDemoReview = process.env.NODE_ENV !== "production" && token === "demo";
  const body = await req.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid comment request" }, { status: 400 });
  }

  const commentBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!commentBody || commentBody.length > 10_000) {
    return NextResponse.json(
      { error: "Comment body must be between 1 and 10000 characters" },
      { status: 400 },
    );
  }

  const requestedAuthorName =
    typeof body.author_name === "string"
      ? body.author_name.trim().slice(0, 120)
      : "";
  const parentId =
    body.parent_id == null
      ? null
      : typeof body.parent_id === "string" && body.parent_id.trim()
        ? body.parent_id.trim()
        : undefined;
  if (parentId === undefined) {
    return NextResponse.json({ error: "Invalid comment thread" }, { status: 400 });
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
      pinX <= (isDemoReview ? 100 : 1) &&
      typeof pinY === "number" &&
      Number.isFinite(pinY) &&
      pinY >= 0 &&
      pinY <= (isDemoReview ? 100 : 1));

  if (!hasValidTimecode || !hasValidPinPair) {
    return NextResponse.json(
      { error: "Comment timing or point coordinates are invalid" },
      { status: 400 },
    );
  }

  if (isDemoReview) {
    let demoReplySource = {
      timecodeSeconds: timecode,
      pinX,
      pinY,
    };

    if (parentId) {
      const parent = demoReviewPayload.comments.find((comment) => comment.id === parentId);
      if (!parent) {
        return NextResponse.json({ error: "Comment thread not found" }, { status: 404 });
      }
      if (parent.parent_id) {
        return NextResponse.json(
          { error: "Replies must target an original comment" },
          { status: 400 },
        );
      }

      demoReplySource = replySourceFromParent({
        timecodeSeconds: parent.timecode_seconds,
      });
    }

    return NextResponse.json(
      toPublicReviewComment({
        id: `demo-comment-${crypto.randomUUID()}`,
        review_id: null,
        review_invite_id: demoReviewPayload.invite.id,
        asset_id: demoReviewPayload.asset.id,
        version_id: DEMO_REVIEW_VERSION_ID,
        parent_id: parentId,
        author_name:
          requestedAuthorName ||
          demoReviewPayload.reviewer_name ||
          demoReviewPayload.reviewer_email ||
          "Demo reviewer",
        author_email: demoReviewPayload.reviewer_email,
        author_id: null,
        body: commentBody,
        rich_body: null,
        timecode_seconds: demoReplySource.timecodeSeconds,
        frame_number: null,
        pin_x: demoReplySource.pinX,
        pin_y: demoReplySource.pinY,
        mentions: [],
        status: "open",
        visibility: "external",
        resolved_by: null,
        resolved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      { status: 201 },
    );
  }

  const inviteLookup = await getAuthorizedReviewInvite(req, token);

  if (!inviteLookup.ok) {
    return NextResponse.json(
      reviewInviteErrorPayload(inviteLookup),
      { status: inviteLookup.status }
    );
  }

  const { invite } = inviteLookup;
  if (!inviteCanComment(invite)) {
    return NextResponse.json({ error: "This review link cannot add comments" }, { status: 403 });
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

  let replySource = {
    timecodeSeconds: timecode,
    pinX,
    pinY,
  };

  if (parentId) {
    const parent = await getAssetComment(parentId, invite.asset_id);
    if (!parent.ok) {
      return NextResponse.json({ error: parent.error }, { status: parent.status });
    }

    // External discussion is private to the review link that created it. Do
    // not reveal whether a different invite has a thread at this asset/version.
    if (
      !isExternalReviewThreadForInvite({
        audience: parent.data.visibility,
        reviewInviteId: parent.data.review_invite_id,
        inviteId: invite.id,
      })
    ) {
      return NextResponse.json({ error: "Comment thread not found" }, { status: 404 });
    }

    if (parent.data.parent_id) {
      return NextResponse.json(
        { error: "Replies must target an original comment" },
        { status: 400 },
      );
    }

    if (parent.data.version_id !== versionLookup.version.id) {
      return NextResponse.json(
        { error: "Replies must stay on the same media version" },
        { status: 400 },
      );
    }

    replySource = replySourceFromParent({
      timecodeSeconds: parent.data.timecode_seconds,
    });
  }

  const reviewerName =
    requestedAuthorName ||
    invite.reviewer_name ||
    invite.reviewer_email ||
    "Anonymous";

  if (!invite.reviewer_name && requestedAuthorName) {
    await getSupabase()
      .from("review_invites")
      .update({ reviewer_name: requestedAuthorName })
      .eq("id", invite.id);
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .insert({
      asset_id: invite.asset_id,
      version_id: versionLookup.version.id,
      body: commentBody,
      author_name: reviewerName,
      author_email: invite.reviewer_email || null,
      author_id: null,
      timecode_seconds: replySource.timecodeSeconds,
      pin_x: replySource.pinX,
      pin_y: replySource.pinY,
      parent_id: parentId,
      review_id: null,
      review_invite_id: invite.id,
      visibility: "external",
    })
    .select(
      "id, asset_id, version_id, parent_id, author_name, body, timecode_seconds, frame_number, pin_x, pin_y, status, resolved_at, created_at, updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Comment could not be saved" },
      { status: 503 },
    );
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
        body: commentBody.slice(0, 100),
        via: "review_link",
        version_id: versionLookup.version.id,
        review_invite_id: invite.id,
      },
    });

    const project = await getSupabase()
      .from("projects")
      .select("owner_id, team_id")
      .eq("id", asset.data.project_id)
      .single();

    if (project.data) {
      const owner = await getSupabase().auth.admin.getUserById(project.data.owner_id);
      if (owner.data?.user?.email) {
        const notification = await dispatchTransactionalNotification({
          client: getSupabase(),
          tenantId: projectTenantAuthority(project.data).key,
          actorId: project.data.owner_id,
          actorName: `External reviewer: ${reviewerName}`,
          eventType: "comment_added",
          idempotencyKey: `review-comment-owner:${data.id}`,
          channels: ["in_app", "email"],
          recipient: {
            userId: project.data.owner_id,
            email: owner.data.user.email,
          },
          message: {
            title: `New client comment on ${asset.data.title}`,
            body: `${reviewerName}: ${commentBody.slice(0, 500)}`,
            actionUrl: `/projects/${asset.data.project_id}/assets/${invite.asset_id}`,
          },
          projectId: asset.data.project_id,
          assetId: invite.asset_id,
          preferenceMode: "recipient",
        });
        if (
          !notification.ok &&
          "code" in notification &&
          notification.code === "notification_queue_unavailable"
        ) {
          // The comment is already durable. A notification outage must not invite a retry
          // that creates a second client comment.
          console.error("Comment persisted but notification queue is unavailable", {
            commentId: data.id,
            notificationCode: notification.code,
            reviewInviteId: invite.id,
          });
        }
      }
    }
  }

  return NextResponse.json(
    toPublicReviewComment(data as Record<string, unknown>),
    { status: 201 },
  );
}
