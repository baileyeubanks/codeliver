import { apiError, apiJson } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import {
  getAssetAccess,
  getAssetComment,
  PROJECT_ROLE_RANK,
} from "@/lib/access-control";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import { getSupabase } from "@/lib/supabase";
import { withAssetRouteBoundary } from "../../asset-route-boundary";
import { resolveAssetVersion } from "@/lib/versions";

const NextResponse = { json: (body: Record<string, unknown>, init: ResponseInit = {}) =>
  "error" in body && !body.code ? apiError(String(body.error), init.status === 401 ? "UNAUTHORIZED" : init.status === 403 ? "FORBIDDEN" : init.status === 404 ? "NOT_FOUND" : init.status && init.status >= 500 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST", init.status ?? 400, init.headers) : apiJson(body, init) };

function authenticatedAuthorName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  for (const key of ["full_name", "name", "display_name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  return (user.email || "Team reviewer").slice(0, 120);
}

async function GETHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getAssetAccess(id, user.id, "viewer");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const versionLookup = await resolveAssetVersion({
    assetId: id,
    versionId: new URL(req.url).searchParams.get("version_id"),
  });
  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .select("*")
    .eq("asset_id", id)
    .eq("version_id", versionLookup.version.id)
    .order("created_at", { ascending: true });

  if (error) return apiError("Comments are unavailable", "BACKEND_UNAVAILABLE", 503);
  return NextResponse.json({ items: data });
}

async function POSTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getAssetAccess(id, user.id, "reviewer");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Comment body must be an object" }, { status: 400 });
  }
  if (
    typeof body.body !== "string" ||
    !body.body.trim() ||
    body.body.trim().length > 10_000
  ) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }
  if (
    body.timecode_seconds !== undefined &&
    body.timecode_seconds !== null &&
    (typeof body.timecode_seconds !== "number" ||
      !Number.isFinite(body.timecode_seconds) ||
      body.timecode_seconds < 0 ||
      body.timecode_seconds > 604_800)
  ) {
    return NextResponse.json({ error: "timecode_seconds is invalid" }, { status: 400 });
  }
  for (const field of ["pin_x", "pin_y"] as const) {
    const value = body[field];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
    ) {
      return NextResponse.json({ error: `${field} is invalid` }, { status: 400 });
    }
  }
  if (body.parent_id !== undefined && body.parent_id !== null && typeof body.parent_id !== "string") {
    return NextResponse.json({ error: "parent_id is invalid" }, { status: 400 });
  }
  const authorName = authenticatedAuthorName(user);

  const versionLookup = await resolveAssetVersion({
    assetId: id,
    versionId: typeof body.version_id === "string" ? body.version_id : null,
  });
  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
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

    if (parent.data.version_id !== versionLookup.version.id) {
      return NextResponse.json(
        { error: "Replies must stay on the same media version" },
        { status: 400 },
      );
    }
  }

  const { data, error } = await getSupabase()
    .from("comments")
    .insert({
      asset_id: id,
      version_id: versionLookup.version.id,
      body: body.body.trim(),
      author_name: authorName,
      author_email: user.email || null,
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

  if (error) return apiError("Comment could not be created", "BACKEND_UNAVAILABLE", 503);

  const asset = await getSupabase().from("assets").select("project_id, title").eq("id", id).single();
  if (asset.data) {
    await getSupabase().from("activity_log").insert({
      project_id: asset.data.project_id,
      asset_id: id,
      actor_id: user.id,
      actor_name: authorName,
      action: "added_comment",
      details: {
        asset_title: asset.data.title,
        body: body.body.slice(0, 100),
        version_id: versionLookup.version.id,
      },
    });

    const project = await getSupabase().from("projects").select("owner_id").eq("id", asset.data.project_id).single();
    if (project.data && project.data.owner_id !== user.id) {
      const owner = await getSupabase().auth.admin.getUserById(project.data.owner_id);
      if (owner.data?.user?.email) {
        const reviewUrl = `${getBaseUrl()}/projects/${asset.data.project_id}/assets/${id}`;
        const emailPayload = emailTemplates.commentNotification(
          owner.data.user.email,
          authorName,
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

async function PATCHHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: assetId } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getAssetAccess(assetId, user.id, "reviewer");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json();
  if (typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "Comment id is required" }, { status: 400 });
  }

  const requestedVersionId =
    typeof body.version_id === "string"
      ? body.version_id
      : new URL(req.url).searchParams.get("version_id");
  const versionLookup = await resolveAssetVersion({
    assetId,
    versionId: requestedVersionId,
  });
  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  const { data: comment, error: commentError } = await getSupabase()
    .from("comments")
    .select("id, asset_id, version_id, author_id, visibility, status")
    .eq("id", body.id)
    .eq("asset_id", assetId)
    .eq("version_id", versionLookup.version.id)
    .maybeSingle();

  if (commentError) {
    return apiError("Comment could not be loaded", "BACKEND_UNAVAILABLE", 503);
  }
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const isAuthor = comment.visibility === "internal" && comment.author_id === user.id;
  const canModerate = assetAccess.data.access_rank >= PROJECT_ROLE_RANK.editor;
  if (!isAuthor && !canModerate) {
    return NextResponse.json({ error: "You cannot edit this comment" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  const includesBody = Object.prototype.hasOwnProperty.call(body, "body");
  const includesStatus = Object.prototype.hasOwnProperty.call(body, "status");

  if (includesBody) {
    if (!isAuthor) {
      return NextResponse.json(
        { error: "Only the comment author can edit comment text" },
        { status: 403 },
      );
    }
    if (typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }
    updates.body = body.body.trim();
  }

  if (includesStatus) {
    const nextStatus = body.status;
    if (nextStatus !== "open" && nextStatus !== "resolved" && nextStatus !== "archived") {
      return NextResponse.json({ error: "Invalid comment status" }, { status: 400 });
    }
    updates.status = nextStatus;
    updates.resolved_by = nextStatus === "resolved" ? user.id : null;
    updates.resolved_at = nextStatus === "resolved" ? new Date().toISOString() : null;
  }

  if (!includesBody && !includesStatus) {
    return NextResponse.json({ error: "No supported comment changes were provided" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  let updateQuery = getSupabase()
    .from("comments")
    .update(updates)
    .eq("id", body.id)
    .eq("asset_id", assetId)
    .eq("version_id", versionLookup.version.id);

  if (!canModerate) {
    updateQuery = updateQuery.eq("author_id", user.id);
  }

  const { data, error } = await updateQuery.select().maybeSingle();

  if (error) return apiError("Comment could not be updated", "BACKEND_UNAVAILABLE", 503);
  if (!data) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  return NextResponse.json(data);
}

export const GET = withAssetRouteBoundary(GETHandler);
export const POST = withAssetRouteBoundary(POSTHandler);
export const PATCH = withAssetRouteBoundary(PATCHHandler);
