import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// POST /api/pipeline — Create CoDeliver project from CoScript script
// This is the bridge: Script approved → Production project created
export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    script_id,
    script_title,
    script_content,
    script_hook,
    script_type,
    platform,
    client_name,
    project_name,
  } = body;

  if (!script_content?.trim()) {
    return NextResponse.json(
      { error: "script_content required" },
      { status: 400 }
    );
  }

  const db = getSupabase();

  // 1. Create the CoDeliver project
  const { data: project, error: projectError } = await db
    .from("projects")
    .insert({
      owner_id: user.id,
      name: project_name || `${script_title || "Untitled"} — Production`,
      description: `Auto-created from CoScript. Script type: ${script_type || "video_script"}. Platform: ${platform || "youtube"}.`,
      status: "active",
    })
    .select()
    .single();

  if (projectError) {
    return NextResponse.json(
      { error: "Failed to create project", detail: projectError.message },
      { status: 500 }
    );
  }

  // 2. Create a placeholder asset for the production video
  const { data: asset, error: assetError } = await db
    .from("assets")
    .insert({
      project_id: project.id,
      title: script_title || "Production Video",
      description: `Script content:\n\n${script_content.slice(0, 500)}...`,
      status: "pending",
      review_status: "draft",
      script_id: script_id || null,
      script_content: script_content,
      file_type: "video",
    })
    .select()
    .single();

  if (assetError) {
    return NextResponse.json(
      { error: "Failed to create asset", detail: assetError.message },
      { status: 500 }
    );
  }

  // 3. Log the pipeline activity
  await db.from("activity_log").insert({
    project_id: project.id,
    asset_id: asset.id,
    actor_id: user.id,
    actor_name: user.email || "System",
    action: "pipeline_created",
    details: {
      source: "coscript",
      script_id,
      script_type,
      platform,
      client_name,
    },
  });

  return NextResponse.json(
    {
      project: {
        id: project.id,
        name: project.name,
      },
      asset: {
        id: asset.id,
        title: asset.title,
      },
      pipeline: {
        source: "coscript",
        script_id,
        status: "ready_for_upload",
        next_step:
          "Upload raw footage to the asset, then begin the review cycle",
      },
    },
    { status: 201 }
  );
}

// GET /api/pipeline — List pipeline connections (scripts linked to production)
export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabase()
    .from("assets")
    .select(
      `
      id,
      title,
      script_id,
      script_content,
      review_status,
      status,
      project_id,
      projects:project_id (id, name),
      created_at,
      updated_at
    `
    )
    .not("script_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data || [] });
}
