import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  getAssetAccess,
  PROJECT_ROLE_RANK,
} from "@/lib/access-control";

const ASSET_STATUSES = new Set([
  "draft",
  "in_review",
  "approved",
  "needs_changes",
  "final",
  "processing",
  "ready",
  "failed",
]);

async function readPatchBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "viewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const { data, error } = await supabase
    .from("assets")
    .select(
      "id, project_id, folder_id, title, file_type, file_url, thumbnail_url, proxy_url, file_size, duration_seconds, status, metadata, position, uploaded_by, created_at, updated_at",
    )
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const versions = await supabase
    .from("versions")
    .select(
      "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at",
    )
    .eq("asset_id", id)
    .order("is_current", { ascending: false })
    .order("version_number", { ascending: false });

  if (versions.error) {
    return NextResponse.json(
      { error: "Asset versions are temporarily unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ...data,
    current_version: versions.data?.[0] ?? null,
    version_count: versions.data?.length ?? 0,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await readPatchBody(req);
  if (!body) {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }
  const assetAccess = await getAssetAccess(id, user.id, "editor", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 500) {
      return NextResponse.json({ error: "title is invalid" }, { status: 400 });
    }
    updates.title = body.title.trim();
  }
  if (body.folder_id !== undefined) {
    if (body.folder_id !== null && typeof body.folder_id !== "string") {
      return NextResponse.json({ error: "folder_id is invalid" }, { status: 400 });
    }
    if (body.folder_id !== null) {
      const folder = await supabase
        .from("folders")
        .select("id")
        .eq("id", body.folder_id)
        .eq("project_id", assetAccess.data.project_id)
        .maybeSingle();
      if (folder.error) {
        return NextResponse.json(
          { error: "The destination folder could not be verified" },
          { status: 503 },
        );
      }
      if (!folder.data) {
        return NextResponse.json({ error: "folder_id is invalid" }, { status: 400 });
      }
    }
    updates.folder_id = body.folder_id;
  }
  if (body.position !== undefined) {
    if (!Number.isInteger(body.position) || Number(body.position) < 0) {
      return NextResponse.json({ error: "position is invalid" }, { status: 400 });
    }
    updates.position = body.position;
  }
  if (body.metadata !== undefined) {
    if (
      !body.metadata ||
      typeof body.metadata !== "object" ||
      Array.isArray(body.metadata) ||
      JSON.stringify(body.metadata).length > 65_536
    ) {
      return NextResponse.json({ error: "metadata is invalid" }, { status: 400 });
    }
    updates.metadata = body.metadata;
  }
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !ASSET_STATUSES.has(body.status)
    ) {
      return NextResponse.json({ error: "status is invalid" }, { status: 400 });
    }
    if (assetAccess.data.access_rank < PROJECT_ROLE_RANK.producer) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    updates.status = body.status;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("assets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "The asset could not be updated" },
      { status: 503 },
    );
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "admin", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const { error } = await supabase
    .from("assets")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "The asset could not be removed" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
