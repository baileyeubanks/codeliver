import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const inviteId = searchParams.get("invite_id");
  if (!inviteId) return NextResponse.json({ error: "invite_id required" }, { status: 400 });

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

  // Update view count on the invite
  const { data: invite } = await getSupabase()
    .from("review_invites")
    .select("view_count")
    .eq("id", invite_id)
    .single();

  if (invite) {
    await getSupabase()
      .from("review_invites")
      .update({
        view_count: (invite.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", invite_id);
  }

  return NextResponse.json({ ok: true });
}
