import { NextResponse } from "next/server";
import { getOwnedReviewInvite } from "@/lib/access-control";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const inviteId = searchParams.get("invite_id");
  if (!inviteId) return NextResponse.json({ error: "invite_id required" }, { status: 400 });

  const inviteAccess = await getOwnedReviewInvite(inviteId, user.id);
  if (!inviteAccess.ok) {
    return NextResponse.json({ error: inviteAccess.error }, { status: inviteAccess.status });
  }

  const { data, error } = await getSupabase()
    .from("share_analytics")
    .select("*")
    .eq("invite_id", inviteId)
    .order("viewed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { invite_id, viewer_ip_hash, duration_seconds, actions } = body;

  if (!invite_id) return NextResponse.json({ error: "invite_id required" }, { status: 400 });

  const { data: invite, error: inviteError } = await getSupabase()
    .from("review_invites")
    .select("id")
    .eq("id", invite_id)
    .maybeSingle();

  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 });
  if (!invite) return NextResponse.json({ error: "Review invite not found" }, { status: 404 });

  // Record analytics event
  const { error: analyticsError } = await getSupabase()
    .from("share_analytics")
    .insert({
      invite_id,
      viewer_ip_hash: viewer_ip_hash || null,
      duration_seconds: duration_seconds || 0,
      actions: actions || {},
    });

  if (analyticsError) return NextResponse.json({ error: analyticsError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
