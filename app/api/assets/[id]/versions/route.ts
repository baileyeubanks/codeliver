import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

async function verifyAssetAccess(assetId: string, userId: string) {
  const { data: asset } = await getSupabase()
    .from("assets")
    .select("project_id")
    .eq("id", assetId)
    .single();
  if (!asset) return { allowed: false, status: 404, error: "Asset not found" } as const;

  const { data: project } = await getSupabase()
    .from("projects")
    .select("owner_id")
    .eq("id", asset.project_id)
    .single();
  if (!project || project.owner_id !== userId) {
    return { allowed: false, status: 403, error: "Forbidden" } as const;
  }
  return { allowed: true } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await verifyAssetAccess(id, user.id);
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await getSupabase()
    .from("versions")
    .select("*")
    .eq("asset_id", id)
    .order("version_number", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const access = await verifyAssetAccess(id, user.id);
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();

  // Get next version number
  const { data: existing } = await getSupabase()
    .from("versions")
    .select("version_number")
    .eq("asset_id", id)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await getSupabase()
    .from("versions")
    .insert({
      asset_id: id,
      version_number: nextVersion,
      file_url: body.file_url,
      file_size: body.file_size || null,
      notes: body.notes || null,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update asset file_url to latest version
  await getSupabase().from("assets").update({ file_url: body.file_url }).eq("id", id);

  return NextResponse.json(data, { status: 201 });
}
