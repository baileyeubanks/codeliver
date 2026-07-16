import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAssetComment } from "@/lib/access-control";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import { demoReviewPayload } from "@/lib/review/demoReview";
import { inviteCanComment, getReviewInviteByToken } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
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
    return NextResponse.json(
      { error: "Comment timing or point coordinates are invalid" },
      { status: 400 },
    );
  }

  if (process.env.NODE_ENV !== "production" && token === "demo") {
    if (!body.body?.trim()) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }

    return NextResponse.json(
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
    return NextResponse.json(
      { error: inviteLookup.error },
      { status: inviteLookup.status }
    );
  }

  const { invite } = inviteLookup;
  if (!inviteCanComment(invite)) {
    return NextResponse.json({ error: "This review link cannot add comments" }, { status: 403 });
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });
  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  if (body.parent_id) {
    const parent = await getAssetComment(body.parent_id, invite.asset_id);
    if (!parent.ok) {
      return NextResponse.json({ error: parent.error }, { status: parent.status });
    }

    if (parent.data.visibility !== "external") {
      return NextResponse.json(
        { error: "Replies must stay within the external review thread" },
        { status: 400 },
      );
    }

    if (parent.data.version_id !== versionLookup.version.id) {
      return NextResponse.json(
        { error: "Replies must stay on the same media version" },
        { status: 400 },
      );
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  return NextResponse.json(data, { status: 201 });
}
