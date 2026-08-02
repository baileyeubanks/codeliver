import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";
import { normalizeMediaReference } from "@/lib/security/media-reference";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projectAccess = await getProjectAccess(id, user.id, "viewer", supabase);
  if (!projectAccess.ok) {
    return NextResponse.json(
      { error: projectAccess.error },
      { status: projectAccess.status },
    );
  }
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, team_id, owner_id, name, description, status, thumbnail_url, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projectAccess = await getProjectAccess(id, user.id, "producer", supabase);
  if (!projectAccess.ok) {
    return NextResponse.json(
      { error: projectAccess.error },
      { status: projectAccess.status },
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Project body must be an object" },
      { status: 400 },
    );
  }
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 240
    ) {
      return NextResponse.json({ error: "name is invalid" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (
      body.description !== null &&
      (typeof body.description !== "string" || body.description.length > 10_000)
    ) {
      return NextResponse.json({ error: "description is invalid" }, { status: 400 });
    }
    updates.description =
      typeof body.description === "string"
        ? body.description.trim() || null
        : null;
  }
  if (body.status !== undefined) {
    if (!["active", "archived", "completed"].includes(body.status as string)) {
      return NextResponse.json({ error: "status is invalid" }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.thumbnail_url !== undefined) {
    try {
      updates.thumbnail_url =
        body.thumbnail_url === null
          ? null
          : normalizeMediaReference(body.thumbnail_url, "thumbnail_url");
    } catch (thumbnailError) {
      return NextResponse.json(
        {
          error:
            thumbnailError instanceof Error
              ? thumbnailError.message
              : "thumbnail_url is invalid",
        },
        { status: 400 },
      );
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "The project could not be updated" },
      { status: 503 },
    );
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projectAccess = await getProjectAccess(id, user.id, "owner", supabase);
  if (!projectAccess.ok) {
    return NextResponse.json(
      { error: projectAccess.error },
      { status: projectAccess.status },
    );
  }
  const { error } = await supabase
    .from("projects")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "The project could not be archived" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, status: "archived" });
}
