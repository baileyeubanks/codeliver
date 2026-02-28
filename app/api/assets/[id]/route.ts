import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await getSupabase()
    .from("assets")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Verify user owns the project this asset belongs to
  const { data: project, error: projectError } = await getSupabase()
    .from("projects")
    .select("owner_id")
    .eq("id", data.project_id)
    .single();

  if (projectError || !project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Verify user owns the asset's project
  const { data: asset } = await getSupabase()
    .from("assets")
    .select("project_id")
    .eq("id", id)
    .single();

  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const { data: project, error: projectError } = await getSupabase()
    .from("projects")
    .select("owner_id")
    .eq("id", asset.project_id)
    .single();

  if (projectError || !project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await getSupabase()
    .from("assets")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify user owns the asset's project
  const { data: asset } = await getSupabase()
    .from("assets")
    .select("project_id")
    .eq("id", id)
    .single();

  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const { data: project, error: projectError } = await getSupabase()
    .from("projects")
    .select("owner_id")
    .eq("id", asset.project_id)
    .single();

  if (projectError || !project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await getSupabase().from("assets").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
