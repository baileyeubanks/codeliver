import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAssetComment, getOwnedAsset } from "@/lib/access-control";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import { getSupabase } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
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
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json();
  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  if (body.parent_id) {
    const parent = await getAssetComment(body.parent_id, id);
    if (!parent.ok) {
      return NextResponse.json({ error: parent.error }, { status: parent.status });
    }

    if (parent.data.visibility !== "internal") {
      return NextResponse.json(
        { error: "Replies must stay within the same review audience" },
        { status: 400 },
      );
    }
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .insert({
      asset_id: id,
      body: body.body.trim(),
      author_name: body.author_name || user.email || "Anonymous",
      author_email: body.author_email || user.email || null,
      author_id: user.id,
      timecode_seconds: body.timecode_seconds ?? null,
      pin_x: body.pin_x ?? null,
      pin_y: body.pin_y ?? null,
      parent_id: body.parent_id ?? null,
      review_id: null,
      review_invite_id: null,
      visibility: "internal",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const asset = await getSupabase().from("assets").select("project_id, title").eq("id", id).single();
  if (asset.data) {
    await getSupabase().from("activity_log").insert({
      project_id: asset.data.project_id,
      asset_id: id,
      actor_id: user.id,
      actor_name: body.author_name || user.email || "Anonymous",
      action: "added_comment",
      details: { asset_title: asset.data.title, body: body.body.slice(0, 100) },
    });

    const project = await getSupabase().from("projects").select("owner_id").eq("id", asset.data.project_id).single();
    if (project.data) {
      const owner = await getSupabase().auth.admin.getUserById(project.data.owner_id);
      if (owner.data?.user?.email) {
        const reviewUrl = `${getBaseUrl()}/projects/${asset.data.project_id}/assets/${id}`;
        const emailPayload = emailTemplates.commentNotification(
          owner.data.user.email,
          body.author_name || user.email || "Anonymous",
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: assetId } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getOwnedAsset(assetId, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json();
  const nextStatus = body.status;

  if (nextStatus !== "open" && nextStatus !== "resolved" && nextStatus !== "archived") {
    return NextResponse.json({ error: "Invalid comment status" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .update({
      status: nextStatus,
      resolved_by: nextStatus === "resolved" ? user.id : null,
      resolved_at: nextStatus === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", body.id)
    .eq("asset_id", assetId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
