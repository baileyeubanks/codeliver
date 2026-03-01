import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify user has access to this asset's project
  const { data: asset } = await getSupabase()
    .from("assets")
    .select("project_id")
    .eq("id", id)
    .single();
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const { data: project } = await getSupabase()
    .from("projects")
    .select("owner_id")
    .eq("id", asset.project_id)
    .single();
  if (!project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .select("*")
    .eq("asset_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const user = await requireAuth();

  const { data, error } = await getSupabase()
    .from("comments")
    .insert({
      asset_id: id,
      body: body.body,
      author_name: body.author_name || user?.email || "Anonymous",
      author_email: body.author_email || user?.email || null,
      author_id: user?.id || null,
      timecode_seconds: body.timecode_seconds ?? null,
      pin_x: body.pin_x ?? null,
      pin_y: body.pin_y ?? null,
      parent_id: body.parent_id ?? null,
      review_id: body.review_id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  const asset = await getSupabase().from("assets").select("project_id, title").eq("id", id).single();
  if (asset.data) {
    await getSupabase().from("activity_log").insert({
      project_id: asset.data.project_id,
      asset_id: id,
      actor_id: user?.id || null,
      actor_name: body.author_name || user?.email || "Anonymous",
      action: "added_comment",
      details: { asset_title: asset.data.title, body: body.body.slice(0, 100) },
    });

    // Send comment notification to asset owner
    const project = await getSupabase().from("projects").select("owner_id").eq("id", asset.data.project_id).single();
    if (project.data) {
      const owner = await getSupabase().auth.admin.getUserById(project.data.owner_id);
      if (owner.data?.user?.email) {
        const reviewUrl = `${getBaseUrl()}/projects/${asset.data.project_id}/assets/${id}`;
        const emailPayload = emailTemplates.commentNotification(
          owner.data.user.email,
          body.author_name || user?.email || "Anonymous",
          asset.data.title,
          body.body,
          reviewUrl
        );
        await sendEmail({ to: owner.data.user.email, ...emailPayload });
      }
    }
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { data, error } = await getSupabase()
    .from("comments")
    .update({ status: body.status })
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
