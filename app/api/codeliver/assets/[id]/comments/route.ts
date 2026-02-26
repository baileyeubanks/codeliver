import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("timecoded_comments")
    .select("*")
    .eq("asset_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const payload = await req.json().catch(() => ({}));

  if (!payload.at || !payload.body) {
    return NextResponse.json({ error: "Missing comment fields (at, body)" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("timecoded_comments")
    .insert({
      asset_id: id,
      version_id: payload.version_id || null,
      timecode: payload.at,
      body: payload.body,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }

  await supabase.from("review_events").insert({
    asset_id: id,
    event_type: "comment_added",
    payload: { comment_id: data.id, timecode: payload.at },
  });

  return NextResponse.json(data);
}
