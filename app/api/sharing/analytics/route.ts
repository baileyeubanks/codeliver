import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getReviewInviteAccess } from "@/lib/access-control";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { getAuthorizedReviewInvite } from "@/lib/review-invites";
import {
  extractClientAddress,
  extractReviewAnalyticsToken,
  hashViewerAddress,
  normalizeShareAnalyticsInput,
} from "@/lib/sharing/share-analytics";
import { getSupabase } from "@/lib/supabase";

function invalidJson() {
  return NextResponse.json(
    { error: "Request body must be valid JSON" },
    { status: 400 },
  );
}

export async function GET(request: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const inviteId = searchParams.get("invite_id");
  if (!inviteId) {
    return NextResponse.json({ error: "invite_id is required" }, { status: 400 });
  }

  const inviteAccess = await getReviewInviteAccess(
    inviteId,
    user.id,
    "member",
  );
  if (!inviteAccess.ok) {
    return NextResponse.json(
      { error: inviteAccess.error },
      { status: inviteAccess.status },
    );
  }

  const { data, error } = await getSupabase()
    .from("share_analytics")
    .select("id, invite_id, viewed_at, duration_seconds, actions")
    .eq("invite_id", inviteId)
    .order("viewed_at", { ascending: false })
    .limit(1_000);

  if (error) {
    return NextResponse.json(
      { error: "Share analytics are temporarily unavailable" },
      { status: 503 },
    );
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalidJson();
  }

  const tokenResult = extractReviewAnalyticsToken(
    request,
    body as Record<string, unknown>,
  );
  if (!tokenResult.ok) {
    return NextResponse.json({ error: tokenResult.error }, { status: 401 });
  }

  const inputResult = normalizeShareAnalyticsInput(body);
  if (!inputResult.ok) {
    return NextResponse.json({ error: inputResult.error }, { status: 400 });
  }

  const inviteResult = await getAuthorizedReviewInvite(request, tokenResult.token);
  if (
    !inviteResult.ok ||
    inviteResult.invite.id !== inputResult.value.inviteId
  ) {
    return NextResponse.json(
      { error: "Invalid review authorization" },
      { status: 401 },
    );
  }

  let viewerIpHash: string | null;
  try {
    viewerIpHash = hashViewerAddress({
      address: extractClientAddress(request),
      inviteId: inputResult.value.inviteId,
    });
  } catch {
    return NextResponse.json(
      { error: "Analytics privacy controls are unavailable" },
      { status: 503 },
    );
  }

  const isolated = getSupabaseDataSchema() === "co_production";
  const { error } = await getSupabase()
    .from("share_analytics")
    .insert({
      invite_id: inputResult.value.inviteId,
      viewer_ip_hash: viewerIpHash,
      duration_seconds: inputResult.value.durationSeconds,
      actions: inputResult.value.actions,
      ...(isolated
        ? { client_request_id: inputResult.value.clientRequestId }
        : {}),
    });

  if (error?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (error) {
    return NextResponse.json(
      { error: "Share analytics could not be recorded" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, duplicate: false });
}
