import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// GET /api/assets/:id/checklist — Generate revision checklist from comments
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get asset details
  const { data: asset } = await getSupabase()
    .from("assets")
    .select("id, title, project_id")
    .eq("id", id)
    .single();

  if (!asset)
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  // Get the latest version
  const { data: latestVersion } = await getSupabase()
    .from("versions")
    .select("id, version_number, file_url")
    .eq("asset_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  // Get all comments with revision-relevant data
  const { data: comments, error } = await getSupabase()
    .from("comments")
    .select(
      "id, body, timecode_seconds, timecode_end, pin_x, pin_y, annotation_data, frame_screenshot_url, status, priority, author_name, author_email, resolved_by, resolved_at, version_id, created_at"
    )
    .eq("asset_id", id)
    .order("timecode_seconds", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Build checklist items from comments
  const items = (comments || []).map((comment, index) => ({
    number: index + 1,
    id: comment.id,
    body: comment.body,
    timecode: comment.timecode_seconds,
    timecode_end: comment.timecode_end,
    timecode_display: comment.timecode_seconds
      ? formatTimecode(comment.timecode_seconds)
      : null,
    timecode_end_display: comment.timecode_end
      ? formatTimecode(comment.timecode_end)
      : null,
    is_range: !!(comment.timecode_seconds && comment.timecode_end),
    pin: comment.pin_x ? { x: comment.pin_x, y: comment.pin_y } : null,
    has_annotations: comment.annotation_data && Array.isArray(comment.annotation_data) && comment.annotation_data.length > 0,
    frame_screenshot_url: comment.frame_screenshot_url,
    priority: comment.priority || "normal",
    author: comment.author_name,
    author_email: comment.author_email,
    is_resolved: comment.status === "resolved",
    resolved_by: comment.resolved_by,
    resolved_at: comment.resolved_at,
    version_id: comment.version_id,
    created_at: comment.created_at,
  }));

  const resolved = items.filter((i) => i.is_resolved).length;
  const total = items.length;
  const blockers = items.filter((i) => i.priority === "blocker" && !i.is_resolved).length;
  const important = items.filter((i) => i.priority === "important" && !i.is_resolved).length;

  return NextResponse.json({
    asset: {
      id: asset.id,
      title: asset.title,
      project_id: asset.project_id,
    },
    version: latestVersion
      ? {
          id: latestVersion.id,
          number: latestVersion.version_number,
        }
      : null,
    progress: {
      resolved,
      total,
      percentage: total > 0 ? Math.round((resolved / total) * 100) : 100,
      blockers,
      important,
    },
    items,
    generated_at: new Date().toISOString(),
  });
}

// PATCH /api/assets/:id/checklist — Batch resolve/unresolve comments
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { comment_ids, action } = body;

  if (!comment_ids || !Array.isArray(comment_ids) || comment_ids.length === 0) {
    return NextResponse.json({ error: "comment_ids required" }, { status: 400 });
  }

  if (action === "resolve") {
    const { error } = await getSupabase()
      .from("comments")
      .update({
        status: "resolved",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .in("id", comment_ids)
      .eq("asset_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "unresolve") {
    const { error } = await getSupabase()
      .from("comments")
      .update({
        status: "open",
        resolved_by: null,
        resolved_at: null,
      })
      .in("id", comment_ids)
      .eq("asset_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await getSupabase().from("activity_log").insert({
    project_id: (await getSupabase().from("assets").select("project_id").eq("id", id).single()).data?.project_id,
    asset_id: id,
    actor_id: user.id,
    actor_name: user.email || "Unknown",
    action: action === "resolve" ? "resolved_comments" : "unreresolved_comments",
    details: { comment_count: comment_ids.length },
  });

  return NextResponse.json({ success: true, action, count: comment_ids.length });
}

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // Assuming 30fps
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}
