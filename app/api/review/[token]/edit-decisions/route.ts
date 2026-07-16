import { NextResponse } from "next/server";
import { parseExternalReviewEditDecision } from "@/lib/edit-decisions";
import { getReviewInviteByToken, inviteCanComment } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

const EXTERNAL_DECISION_SELECTION =
  "id, asset_id, version_id, review_invite_id, created_by_name, decision_type, source, status, start_seconds, end_seconds, label, confidence, client_request_id, created_at, updated_at";

function externalReviewerName(input: unknown, fallback: string | null) {
  const requested = typeof input === "string" ? input.trim() : "";
  return (requested || fallback || "Client reviewer").slice(0, 120);
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inviteLookup = await getReviewInviteByToken(token);

  if (!inviteLookup.ok) {
    return NextResponse.json({ error: inviteLookup.error }, { status: inviteLookup.status });
  }

  const { invite } = inviteLookup;
  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });

  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  const { data, error } = await getSupabase()
    .from("edit_decisions")
    .select(EXTERNAL_DECISION_SELECTION)
    .eq("asset_id", invite.asset_id)
    .eq("version_id", versionLookup.version.id)
    .or(`review_invite_id.eq.${invite.id},status.in.(accepted,applied)`)
    .order("start_seconds", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [], version: versionLookup.version });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const parsed = parseExternalReviewEditDecision(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
  }

  const inviteLookup = await getReviewInviteByToken(token);
  if (!inviteLookup.ok) {
    return NextResponse.json({ error: inviteLookup.error }, { status: inviteLookup.status });
  }

  const { invite } = inviteLookup;
  if (!inviteCanComment(invite)) {
    return NextResponse.json({ error: "This review link cannot add edit decisions" }, { status: 403 });
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });

  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  const supabase = getSupabase();
  const existing = await supabase
    .from("edit_decisions")
    .select(EXTERNAL_DECISION_SELECTION)
    .eq("version_id", versionLookup.version.id)
    .eq("review_invite_id", invite.id)
    .eq("client_request_id", parsed.value.client_request_id)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  if (existing.data) {
    return NextResponse.json(existing.data);
  }

  const reviewerName = externalReviewerName(
    body && typeof body === "object" ? (body as Record<string, unknown>).reviewer_name : null,
    invite.reviewer_name || invite.reviewer_email,
  );
  const { data, error } = await supabase
    .from("edit_decisions")
    .insert({
      asset_id: invite.asset_id,
      version_id: versionLookup.version.id,
      review_invite_id: invite.id,
      created_by: null,
      created_by_name: reviewerName,
      ...parsed.value,
      status: "proposed",
      metadata: {
        ...parsed.value.metadata,
        entry_surface: "public_review",
      },
    })
    .select(EXTERNAL_DECISION_SELECTION)
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicate = await supabase
        .from("edit_decisions")
        .select(EXTERNAL_DECISION_SELECTION)
        .eq("version_id", versionLookup.version.id)
        .eq("review_invite_id", invite.id)
        .eq("client_request_id", parsed.value.client_request_id)
        .single();

      if (duplicate.data) return NextResponse.json(duplicate.data);

      return NextResponse.json(
        { error: "This edit-decision request ID is already in use" },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const projectId = invite.assets?.projects?.id ?? null;
  await supabase.from("activity_log").insert({
    project_id: projectId,
    asset_id: invite.asset_id,
    actor_id: null,
    actor_name: reviewerName,
    action: "proposed_edit_decision",
    details: {
      decision_id: data.id,
      decision_type: data.decision_type,
      start_seconds: data.start_seconds,
      version_id: data.version_id,
      via: "review_link",
    },
  });

  return NextResponse.json(data, { status: 201 });
}
