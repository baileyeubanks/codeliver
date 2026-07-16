import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getProjectAccess } from "@/lib/access-control";
import { normalizeMediaReference } from "@/lib/security/media-reference";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projectAccess = await getProjectAccess(id, user.id, "viewer", supabase);
  if (!projectAccess.ok) {
    return NextResponse.json({ error: projectAccess.error }, { status: projectAccess.status });
  }

  try {
    const { data, error } = await supabase
      .from("assets")
      .select(
        "id, project_id, folder_id, title, file_type, file_url, thumbnail_url, proxy_url, file_size, duration_seconds, status, metadata, position, uploaded_by, created_at, updated_at, comments(count), approvals(id, status, step_order, role_label, assignee_email), versions(count)",
      )
      .eq("project_id", id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Failed to load assets" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projectAccess = await getProjectAccess(id, user.id, "editor", supabase);
  if (!projectAccess.ok) {
    return NextResponse.json({ error: projectAccess.error }, { status: projectAccess.status });
  }

  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const fileType = body.file_type ?? "video";
    if (!title || title.length > 500) {
      return NextResponse.json(
        { error: "title must contain 1-500 characters" },
        { status: 400 },
      );
    }
    if (!["video", "image", "audio", "document", "other"].includes(fileType)) {
      return NextResponse.json({ error: "file_type is invalid" }, { status: 400 });
    }
    let fileUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    try {
      if (body.file_url !== undefined && body.file_url !== null) {
        fileUrl = normalizeMediaReference(body.file_url, "file_url");
      }
      if (body.thumbnail_url !== undefined && body.thumbnail_url !== null) {
        thumbnailUrl = normalizeMediaReference(
          body.thumbnail_url,
          "thumbnail_url",
        );
      }
    } catch (urlError) {
      return NextResponse.json(
        {
          error:
            urlError instanceof Error ? urlError.message : "Media URL is invalid",
        },
        { status: 400 },
      );
    }
    const fileSize = body.file_size ?? null;
    if (
      fileSize !== null &&
      (!Number.isSafeInteger(fileSize) || Number(fileSize) < 0)
    ) {
      return NextResponse.json({ error: "file_size is invalid" }, { status: 400 });
    }
    const durationSeconds = body.duration_seconds ?? null;
    if (
      durationSeconds !== null &&
      (typeof durationSeconds !== "number" ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds < 0 ||
        durationSeconds > 604_800)
    ) {
      return NextResponse.json(
        { error: "duration_seconds is invalid" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("assets")
      .insert({
        project_id: id,
        title,
        file_type: fileType,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl,
        file_size: fileSize,
        duration_seconds: durationSeconds,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Asset creation error:", error.message);
      return NextResponse.json(
        { error: "The asset could not be created" },
        { status: 503 },
      );
    }

    // Log activity (don't fail if this errors)
    await supabase.from("activity_log").insert({
      project_id: id,
      asset_id: data.id,
      actor_id: user.id,
      actor_name: user.email,
      action: "uploaded_asset",
      details: { asset_title: data.title },
    }).then(() => {}, () => {});

    return NextResponse.json(data, { status: 201 });
  } catch (e: unknown) {
    console.error("Asset POST exception:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }
}
