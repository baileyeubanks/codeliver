import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import crypto from "crypto";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const token = crypto.randomBytes(16).toString("hex");

  const { data, error } = await getSupabase()
    .from("review_invites")
    .insert({
      asset_id: id,
      token,
      permissions: "comment",
      created_by: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token: data.token });
}
