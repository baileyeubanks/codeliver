import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await getSupabase()
    .from("assets")
    .select("*, comments(count), approvals(id, status)")
    .eq("project_id", id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const { data, error } = await getSupabase()
    .from("assets")
    .insert({
      project_id: id,
      title: body.title,
      file_type: body.file_type || "video",
      file_url: body.file_url || null,
      thumbnail_url: body.thumbnail_url || null,
      file_size: body.file_size || null,
      duration_seconds: body.duration_seconds || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  await getSupabase().from("activity_log").insert({
    project_id: id,
    asset_id: data.id,
    actor_id: user.id,
    actor_name: user.email,
    action: "uploaded_asset",
    details: { asset_title: data.title },
  });

  return NextResponse.json(data, { status: 201 });
}
