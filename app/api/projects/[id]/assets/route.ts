import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getOwnedProject } from "@/lib/access-control";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projectAccess = await getOwnedProject(id, user.id, supabase);
  if (!projectAccess.ok) {
    return NextResponse.json({ error: projectAccess.error }, { status: projectAccess.status });
  }

  try {
    const { data, error } = await supabase
      .from("assets")
      .select("*, comments(count), approvals(id, status)")
      .eq("project_id", id)
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: data ?? [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projectAccess = await getOwnedProject(id, user.id, supabase);
  if (!projectAccess.ok) {
    return NextResponse.json({ error: projectAccess.error }, { status: projectAccess.status });
  }

  try {
    const body = await req.json();

    const { data, error } = await supabase
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

    if (error) {
      console.error("Asset creation error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log activity (don't fail if this errors)
    await supabase.from("activity_log").insert({
      project_id: id,
      asset_id: data.id,
      actor_id: user.id,
      actor_name: user.email,
      action: "uploaded_asset",
      details: { asset_title: data.title },
    }).then(() => {}).catch(() => {});

    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    console.error("Asset POST exception:", e?.message);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }
}
