import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json();
  const { invite_id, asset_id } = body;

  if (!invite_id || !asset_id) {
    return NextResponse.json({ error: "invite_id and asset_id required" }, { status: 400 });
  }

  // Get invite to check watermark settings
  const { data: invite, error: inviteError } = await getSupabase()
    .from("review_invites")
    .select("*")
    .eq("id", invite_id)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (!invite.watermark_enabled) {
    // No watermark needed, return original asset URL
    const { data: asset } = await getSupabase()
      .from("assets")
      .select("file_url")
      .eq("id", asset_id)
      .single();

    return NextResponse.json({ url: asset?.file_url, watermarked: false });
  }

  // For watermarked content, return the original URL with watermark metadata
  // In production, this would generate a server-side watermarked version
  const { data: asset } = await getSupabase()
    .from("assets")
    .select("file_url")
    .eq("id", asset_id)
    .single();

  return NextResponse.json({
    url: asset?.file_url,
    watermarked: true,
    watermark_text: invite.watermark_text || invite.reviewer_email || "CONFIDENTIAL",
    watermark_opacity: 0.3,
  });
}
