import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOwnedAsset } from "@/lib/access-control";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import { normalizeReviewerEmail } from "@/lib/review-invites";
import {
  deriveShareIntent,
  normalizeShareIntent,
  resolveShareIntentDefaults,
} from "@/lib/sharing/share-intent";
import { getSupabase } from "@/lib/supabase";
import type { SharePermission } from "@/lib/types/codeliver";

function normalizeExpiresAt(expiresAt?: string | null, fallbackDays = 7) {
  if (!expiresAt) {
    return new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const value = expiresAt.length === 10 ? `${expiresAt}T23:59:59.999Z` : expiresAt;
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const { data, error } = await getSupabase()
    .from("review_invites")
    .select("*")
    .eq("asset_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: (data ?? []).map((invite) => ({
      ...invite,
      share_intent: deriveShareIntent({
        permissions: invite.permissions as SharePermission,
        downloadEnabled: invite.download_enabled,
        watermarkEnabled: invite.watermark_enabled,
      }),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const {
    share_intent,
    reviewer_email,
    reviewer_name,
    permissions,
    expires_at,
    watermark_enabled,
    watermark_text,
    download_enabled,
    max_views,
  } = await req.json();

  const token = crypto.randomBytes(16).toString("hex");
  const requestedIntent = normalizeShareIntent(share_intent) ?? "client_review";
  const defaults = resolveShareIntentDefaults(requestedIntent);
  const permission: SharePermission =
    permissions === "view" || permissions === "approve" || permissions === "comment"
      ? permissions
      : defaults.permissions;
  const normalizedExpiresAt = normalizeExpiresAt(expires_at, defaults.expiresInDays);
  const normalizedReviewerEmail = normalizeReviewerEmail(reviewer_email);
  const normalizedReviewerName = reviewer_name?.trim() || null;
  const watermarkEnabled =
    typeof watermark_enabled === "boolean" ? watermark_enabled : defaults.watermarkEnabled;
  const downloadEnabled =
    typeof download_enabled === "boolean" ? download_enabled : defaults.downloadEnabled;

  if (expires_at && !normalizedExpiresAt) {
    return NextResponse.json({ error: "Invalid expires_at value" }, { status: 400 });
  }

  if ((defaults.requiresReviewerEmail || permission === "approve") && !normalizedReviewerEmail) {
    return NextResponse.json(
      { error: "Approval links require a reviewer email" },
      { status: 400 },
    );
  }

  const { data, error } = await getSupabase()
    .from("review_invites")
    .insert({
      asset_id: id,
      token,
      permissions: permission,
      created_by: user.id,
      reviewer_email: normalizedReviewerEmail,
      reviewer_name: normalizedReviewerName,
      expires_at: normalizedExpiresAt,
      watermark_enabled: watermarkEnabled,
      watermark_text: watermark_text || normalizedReviewerName || normalizedReviewerEmail || null,
      download_enabled: downloadEnabled,
      max_views: typeof max_views === "number" && max_views > 0 ? max_views : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (normalizedReviewerEmail && data) {
    const asset = await getSupabase().from("assets").select("title").eq("id", id).single();
    if (asset.data) {
      const shareLink = `${getBaseUrl()}/review/${data.token}`;
      const emailPayload = emailTemplates.shareInvite({
        inviteeEmail: normalizedReviewerEmail,
        assetTitle: asset.data.title,
        shareLink,
        shareIntent: deriveShareIntent({
          permissions: data.permissions as SharePermission,
          downloadEnabled: data.download_enabled,
          watermarkEnabled: data.watermark_enabled,
        }),
        expiresAt: data.expires_at,
      });
      await sendEmail({ to: normalizedReviewerEmail, ...emailPayload });
    }
  }

  return NextResponse.json(
    {
      token: data.token,
      invite: {
        ...data,
        share_intent: deriveShareIntent({
          permissions: data.permissions as SharePermission,
          downloadEnabled: data.download_enabled,
          watermarkEnabled: data.watermark_enabled,
        }),
      },
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assetId } = await params;
  const assetAccess = await getOwnedAsset(assetId, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("review_invites")
    .delete()
    .eq("id", id)
    .eq("asset_id", assetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
