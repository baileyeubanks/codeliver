import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOwnedAsset } from "@/lib/access-control";
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
  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

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
  await getSupabase().from("assets").update({
    file_url: body.file_url,
    status: "in_review",
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  // ── Comment carry-forward: copy unresolved comments from previous version ──
  const prevVersion = nextVersion - 1;
  if (prevVersion >= 1) {
    const { data: unresolvedComments } = await getSupabase()
      .from("comments")
      .select("*")
      .eq("asset_id", id)
      .neq("status", "resolved")
      .is("parent_id", null); // Only top-level comments

    if (unresolvedComments && unresolvedComments.length > 0) {
      const carried = unresolvedComments.map((c) => ({
        asset_id: id,
        version_id: data.id,
        author_name: c.author_name,
        author_id: c.author_id,
        body: `[from v${prevVersion}] ${c.body}`,
        timecode_seconds: c.timecode_seconds,
        pin_x: c.pin_x,
        pin_y: c.pin_y,
        status: "open",
        is_team_only: c.is_team_only,
        is_external: c.is_external,
        metadata: { carried_from_version: prevVersion, original_comment_id: c.id },
      }));

      await getSupabase().from("comments").insert(carried);
    }
  }

  // ── Approval reset: invalidate all pending/approved approvals on new version ──
  await getSupabase()
    .from("approval_steps")
    .update({
      status: "pending",
      decided_at: null,
      decision_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("asset_id", id);

  // Log the version upload + approval reset in activity
  await getSupabase().from("activity_log").insert([
    {
      asset_id: id,
      actor_id: user.id,
      actor_name: user.email,
      action: "uploaded_version",
      details: { version_number: nextVersion, notes: body.notes },
    },
    {
      asset_id: id,
      actor_id: user.id,
      actor_name: user.email,
      action: "approvals_reset",
      details: { reason: "new_version", version_number: nextVersion },
    },
  ]);

  return NextResponse.json(data, { status: 201 });
}
