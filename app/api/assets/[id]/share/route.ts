import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { reviewer_email } = await req.json();
  const token = crypto.randomBytes(16).toString("hex");

  const { data, error } = await getSupabase()
    .from("review_invites")
    .insert({
      asset_id: id,
      token,
      permissions: "comment",
      created_by: user.id,
      reviewer_email: reviewer_email || null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send share invitation email if email provided
  if (reviewer_email && data) {
    const asset = await getSupabase().from("assets").select("title").eq("id", id).single();
    if (asset.data) {
      const shareLink = `${getBaseUrl()}/review/${data.token}`;
      const emailPayload = emailTemplates.shareInvite(reviewer_email, asset.data.title, shareLink);
      await sendEmail({ to: reviewer_email, ...emailPayload });
    }
  }

  return NextResponse.json({ token: data.token });
}
