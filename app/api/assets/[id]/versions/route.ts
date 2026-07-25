import { apiError, apiJson } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import { normalizeMediaReference } from "@/lib/security/media-reference";
import { getSupabase } from "@/lib/supabase";
import { withAssetRouteBoundary } from "../../asset-route-boundary";

const NextResponse = { json: (body: Record<string, unknown>, init: ResponseInit = {}) =>
  "error" in body && !body.code ? apiError(String(body.error), init.status === 401 ? "UNAUTHORIZED" : init.status === 404 ? "NOT_FOUND" : init.status && init.status >= 500 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST", init.status ?? 400, init.headers) : apiJson(body, init) };

async function GETHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getAssetAccess(id, user.id, "viewer");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const { data, error } = await getSupabase()
    .from("versions")
    .select(
      "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at",
    )
    .eq("asset_id", id)
    .order("version_number", { ascending: false });

  if (error) return apiError("Asset versions are unavailable", "BACKEND_UNAVAILABLE", 503);
  return NextResponse.json({ items: data });
}

async function POSTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "editor");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  let body: Record<string, unknown>;
  try {
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  let fileUrl: string;
  let thumbnailUrl: string | null = null;
  try {
    fileUrl = normalizeMediaReference(body.file_url, "file_url");
    if (body.thumbnail_url !== undefined && body.thumbnail_url !== null) {
      thumbnailUrl = normalizeMediaReference(body.thumbnail_url, "thumbnail_url");
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Media URL is invalid", code: "INVALID_REQUEST" },
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
  const notes = body.notes === undefined || body.notes === null ? null : body.notes;
  if (notes !== null && (typeof notes !== "string" || notes.length > 2_000)) {
    return NextResponse.json({ error: "notes is invalid" }, { status: 400 });
  }
  const resolution =
    body.resolution === undefined || body.resolution === null
      ? null
      : body.resolution;
  if (
    resolution !== null &&
    (typeof resolution !== "string" || resolution.length > 64)
  ) {
    return NextResponse.json({ error: "resolution is invalid" }, { status: 400 });
  }

  // Get next version number
  const { data: existing } = await getSupabase()
    .from("versions")
    .select("id, version_number")
    .eq("asset_id", id)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version_number ?? 0) + 1;
  const previousVersionId = existing?.[0]?.id ?? null;

  const { data, error } = await getSupabase()
    .from("versions")
    .insert({
      asset_id: id,
      version_number: nextVersion,
      file_url: fileUrl,
      file_size: fileSize,
      notes: typeof notes === "string" ? notes.trim() || null : null,
      uploaded_by: user.id,
      is_current: false,
      thumbnail_url: thumbnailUrl,
      duration_seconds: durationSeconds,
      resolution,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    return NextResponse.json(
      { error: "A new version was added at the same time; refresh and retry" },
      { status: 409 },
    );
  }
  if (error || !data) {
    return NextResponse.json(
      { error: "The version could not be created" },
      { status: 503 },
    );
  }

  const currentReset = await getSupabase()
    .from("versions")
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq("asset_id", id);
  if (currentReset.error) {
    return NextResponse.json(
      { error: "The version could not be activated" },
      { status: 503 },
    );
  }
  const currentUpdate = await getSupabase()
    .from("versions")
    .update({ is_current: true, updated_at: new Date().toISOString() })
    .eq("id", data.id);
  if (currentUpdate.error) {
    if (previousVersionId) {
      await getSupabase()
        .from("versions")
        .update({ is_current: true, updated_at: new Date().toISOString() })
        .eq("id", previousVersionId);
    }
    return NextResponse.json(
      { error: "The version could not be activated" },
      { status: 503 },
    );
  }

  // Update asset file_url to latest version
  const assetUpdate = await getSupabase()
    .from("assets")
    .update({
      file_url: fileUrl,
      file_size: fileSize,
      duration_seconds:
        durationSeconds ?? assetAccess.data.duration_seconds ?? null,
      status: "in_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (assetUpdate.error) {
    return NextResponse.json(
      { error: "The asset could not be advanced to the new version" },
      { status: 503 },
    );
  }

  // ── Comment carry-forward: copy unresolved comments from previous version ──
  const prevVersion = nextVersion - 1;
  if (previousVersionId) {
    const { data: unresolvedComments } = await getSupabase()
      .from("comments")
      .select(
        "author_name, author_email, author_id, body, rich_body, timecode_seconds, frame_number, pin_x, pin_y, mentions, visibility",
      )
      .eq("asset_id", id)
      .eq("version_id", previousVersionId)
      .neq("status", "resolved")
      .is("parent_id", null); // Only top-level comments

    if (unresolvedComments && unresolvedComments.length > 0) {
      const carried = unresolvedComments.map((c) => ({
        asset_id: id,
        version_id: data.id,
        review_id: null,
        review_invite_id: null,
        author_name: c.author_name,
        author_email: c.author_email,
        author_id: c.author_id,
        body: `[from v${prevVersion}] ${c.body}`,
        rich_body: c.rich_body,
        timecode_seconds: c.timecode_seconds,
        frame_number: c.frame_number,
        pin_x: c.pin_x,
        pin_y: c.pin_y,
        mentions: c.mentions ?? [],
        status: "open",
        visibility: c.visibility ?? "internal",
      }));

      await getSupabase().from("comments").insert(carried);
    }
  }

  // ── Approval reset: invalidate all pending/approved approvals on new version ──
  await getSupabase()
    .from("approvals")
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
      details: { version_number: nextVersion, notes },
    },
    {
      asset_id: id,
      actor_id: user.id,
      actor_name: user.email,
      action: "approvals_reset",
      details: { reason: "new_version", version_number: nextVersion },
    },
  ]);

  return NextResponse.json({ ...data, is_current: true }, { status: 201 });
}

export const GET = withAssetRouteBoundary(GETHandler);
export const POST = withAssetRouteBoundary(POSTHandler);
