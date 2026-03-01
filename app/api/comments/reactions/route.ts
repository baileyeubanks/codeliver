import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const commentId = searchParams.get("comment_id");

  if (!commentId) {
    return NextResponse.json(
      { error: "comment_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase()
    .from("comment_reactions")
    .select("*")
    .eq("comment_id", commentId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reactions: data });
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { comment_id, emoji } = body as {
    comment_id?: string;
    emoji?: string;
  };

  if (!comment_id || !emoji) {
    return NextResponse.json(
      { error: "comment_id and emoji are required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabase()
    .from("comment_reactions")
    .upsert(
      {
        comment_id,
        user_id: user.id,
        emoji,
      },
      { onConflict: "comment_id,user_id,emoji" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reaction: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { comment_id, emoji } = body as {
    comment_id?: string;
    emoji?: string;
  };

  if (!comment_id || !emoji) {
    return NextResponse.json(
      { error: "comment_id and emoji are required" },
      { status: 400 }
    );
  }

  const { error } = await getSupabase()
    .from("comment_reactions")
    .delete()
    .eq("comment_id", comment_id)
    .eq("user_id", user.id)
    .eq("emoji", emoji);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
