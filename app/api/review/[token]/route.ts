import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: invite, error } = await getSupabase()
    .from("review_invites")
    .select("*, assets(*, projects(name))")
    .eq("token", token)
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: "Invalid or expired review link" }, { status: 404 });
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "This review link has expired" }, { status: 410 });
  }

  // Get comments for this asset
  const { data: comments } = await getSupabase()
    .from("comments")
    .select("*")
    .eq("asset_id", invite.asset_id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    asset: invite.assets,
    comments: comments ?? [],
    permissions: invite.permissions,
  });
}
