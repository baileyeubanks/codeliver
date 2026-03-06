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

  const { searchParams } = new URL(_req.url);
  const versionId = searchParams.get("version_id");
  const statusFilter = searchParams.get("status"); // open, resolved, all
  const priorityFilter = searchParams.get("priority"); // blocker, important, suggestion, praise, normal

  let query = getSupabase()
    .from("comments")
    .select("*")
    .eq("asset_id", id);

  if (versionId) query = query.eq("version_id", versionId);
  if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);
  if (priorityFilter) query = query.eq("priority", priorityFilter);

  const { data, error } = await query.order("timecode_seconds", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute progress stats
  const items = data || [];
  const resolved = items.filter((c) => c.status === "resolved").length;
  const total = items.length;

  return NextResponse.json({
    items,
    progress: {
      resolved,
      total,
      percentage: total > 0 ? Math.round((resolved / total) * 100) : 100,
    },
  });
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
      // Timecode support (single point or range)
      timecode_seconds: body.timecode_seconds ?? null,
      timecode_end: body.timecode_end ?? null,
      // Spatial pin position on video frame
      pin_x: body.pin_x ?? null,
      pin_y: body.pin_y ?? null,
      // Drawing annotation data (freehand, arrows, rectangles, etc.)
      annotation_data: body.annotation_data ?? [],
      // Frame screenshot captured at comment time
      frame_screenshot_url: body.frame_screenshot_url ?? null,
      // Frame number (for frame-accurate seeking)
      frame_number: body.frame_number ?? null,
      // Comment priority classification
      priority: body.priority ?? "normal",
      // Threading
      parent_id: body.parent_id ?? null,
      // Version-specific comment
      version_id: body.version_id ?? null,
      // Review session link
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
      details: {
        asset_title: asset.data.title,
        body: body.body.slice(0, 100),
        has_annotation: !!(body.annotation_data && body.annotation_data.length > 0),
        is_range: !!(body.timecode_seconds && body.timecode_end),
        priority: body.priority || "normal",
      },
    });

    // Update version comment count
    if (body.version_id) {
      await getSupabase().rpc("increment_comment_count", { vid: body.version_id }).catch(() => {});
    }

    // Send comment notification to asset owner
    const project = await getSupabase().from("projects").select("owner_id").eq("id", asset.data.project_id).single();
    if (project.data) {
      const owner = await getSupabase().auth.admin.getUserById(project.data.owner_id);
      if (owner.data?.user?.email && owner.data.user.id !== user?.id) {
        const reviewUrl = `${getBaseUrl()}/projects/${asset.data.project_id}/assets/${id}`;
        const priorityLabel = body.priority && body.priority !== "normal" ? ` [${body.priority.toUpperCase()}]` : "";
        const emailPayload = emailTemplates.commentNotification(
          owner.data.user.email,
          body.author_name || user?.email || "Anonymous",
          `${asset.data.title}${priorityLabel}`,
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

  const updateData: Record<string, unknown> = {};

  // Status update (resolve/unresolve)
  if (body.status) {
    updateData.status = body.status;
    if (body.status === "resolved") {
      updateData.resolved_by = user.id;
      updateData.resolved_at = new Date().toISOString();
    } else {
      updateData.resolved_by = null;
      updateData.resolved_at = null;
    }
  }

  // Priority update
  if (body.priority) {
    updateData.priority = body.priority;
  }

  // Body edit
  if (body.body) {
    updateData.body = body.body;
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .update(updateData)
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
