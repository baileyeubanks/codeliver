import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, commentId } = await params;
  const payload = await req.json().catch(() => ({}));

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (payload.state) updates.state = payload.state;
  if (payload.body) updates.body = payload.body;

  const { data, error } = await supabase
    .from("timecoded_comments")
    .update(updates)
    .eq("id", commentId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }

  await supabase.from("review_events").insert({
    asset_id: id,
    event_type: payload.state === "resolved" ? "comment_resolved" : "comment_updated",
    payload: { comment_id: commentId, state: payload.state },
  });

  return NextResponse.json(data);
}
