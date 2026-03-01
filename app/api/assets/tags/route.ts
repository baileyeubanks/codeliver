import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Tag assignment: { asset_id, tag_id }
  if (body.asset_id && body.tag_id) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("asset_tags")
      .upsert(
        { asset_id: body.asset_id, tag_id: body.tag_id },
        { onConflict: "asset_id,tag_id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Tag creation: { project_id, name, color }
  const { project_id, name, color } = body;
  if (!project_id || !name) {
    return NextResponse.json(
      { error: "project_id and name are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tags")
    .insert({
      project_id,
      name,
      color: color || "#3b82f6",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Unassign tag from asset: { asset_id, tag_id }
  if (body.asset_id && body.tag_id) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("asset_tags")
      .delete()
      .eq("asset_id", body.asset_id)
      .eq("tag_id", body.tag_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Delete tag: { id }
  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Remove all associations first (cascade should handle this, but be explicit)
  await supabase.from("asset_tags").delete().eq("tag_id", id);

  const { error } = await supabase.from("tags").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
