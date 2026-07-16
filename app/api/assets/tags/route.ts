import { NextRequest, NextResponse } from "next/server";
import { getAssetAccess, getProjectAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const DEFAULT_TAG_COLOR = "#3b82f6";
const TAG_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

type JsonObject = Record<string, unknown>;
type TagRow = {
  id: string;
  project_id: string;
  name?: string;
  color?: string;
  created_at?: string;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function accessFailureResponse(status: number) {
  return status >= 500
    ? errorResponse("Unable to process tag request", 500)
    : errorResponse("Resource not found", 404);
}

async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

async function findTag(
  tagId: string,
  projectId?: string,
): Promise<
  | { ok: true; tag: TagRow | null }
  | { ok: false; response: NextResponse }
> {
  let query = getSupabase()
    .from("tags")
    .select("id, project_id, name, color, created_at")
    .eq("id", tagId);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return {
      ok: false,
      response: errorResponse("Unable to process tag request", 500),
    };
  }

  return { ok: true, tag: (data as TagRow | null) ?? null };
}

async function authorizeAssignment(
  assetId: string,
  tagId: string,
  userId: string,
): Promise<
  | { ok: true; projectId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(assetId, userId, "editor", supabase);
  if (!assetAccess.ok) {
    return {
      ok: false,
      response: accessFailureResponse(assetAccess.status),
    };
  }

  const projectId = assetAccess.data.project_id;
  const tagResult = await findTag(tagId, projectId);
  if (!tagResult.ok) return tagResult;
  if (!tagResult.tag || tagResult.tag.project_id !== projectId) {
    return {
      ok: false,
      response: errorResponse("Resource not found", 404),
    };
  }

  return { ok: true, projectId };
}

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!isIdentifier(projectId)) {
    return errorResponse("Invalid request", 400);
  }

  const supabase = getSupabase();
  const projectAccess = await getProjectAccess(
    projectId,
    user.id,
    "viewer",
    supabase,
  );
  if (!projectAccess.ok) {
    return accessFailureResponse(projectAccess.status);
  }

  const { data, error } = await supabase
    .from("tags")
    .select("id, project_id, name, color, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    return errorResponse("Unable to load tags", 500);
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Invalid request", 400);
  }

  const hasAssignmentField = "asset_id" in body || "tag_id" in body;
  if (hasAssignmentField) {
    if (!isIdentifier(body.asset_id) || !isIdentifier(body.tag_id)) {
      return errorResponse("Invalid request", 400);
    }

    const assignmentAccess = await authorizeAssignment(
      body.asset_id,
      body.tag_id,
      user.id,
    );
    if (!assignmentAccess.ok) return assignmentAccess.response;

    const { error } = await getSupabase()
      .from("asset_tags")
      .upsert(
        { asset_id: body.asset_id, tag_id: body.tag_id },
        { onConflict: "asset_id,tag_id" },
      );

    if (error) {
      return errorResponse("Unable to update tag assignment", 500);
    }
    return NextResponse.json({ ok: true });
  }

  const projectId = body.project_id;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = body.color === undefined ? DEFAULT_TAG_COLOR : body.color;
  if (
    !isIdentifier(projectId) ||
    name.length < 1 ||
    name.length > 120 ||
    typeof color !== "string" ||
    !TAG_COLOR_PATTERN.test(color)
  ) {
    return errorResponse("Invalid request", 400);
  }

  const supabase = getSupabase();
  const projectAccess = await getProjectAccess(
    projectId,
    user.id,
    "editor",
    supabase,
  );
  if (!projectAccess.ok) {
    return accessFailureResponse(projectAccess.status);
  }

  const { data, error } = await supabase
    .from("tags")
    .insert({
      project_id: projectId,
      name,
      color,
    })
    .select("id, project_id, name, color, created_at")
    .single();

  if (error) {
    return errorResponse("Unable to create tag", 500);
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Invalid request", 400);
  }

  const hasAssignmentField = "asset_id" in body || "tag_id" in body;
  if (hasAssignmentField) {
    if (!isIdentifier(body.asset_id) || !isIdentifier(body.tag_id)) {
      return errorResponse("Invalid request", 400);
    }

    const assignmentAccess = await authorizeAssignment(
      body.asset_id,
      body.tag_id,
      user.id,
    );
    if (!assignmentAccess.ok) return assignmentAccess.response;

    const { error } = await getSupabase()
      .from("asset_tags")
      .delete()
      .eq("asset_id", body.asset_id)
      .eq("tag_id", body.tag_id);

    if (error) {
      return errorResponse("Unable to update tag assignment", 500);
    }
    return NextResponse.json({ ok: true });
  }

  if (!isIdentifier(body.id)) {
    return errorResponse("Invalid request", 400);
  }

  const tagResult = await findTag(body.id);
  if (!tagResult.ok) return tagResult.response;
  if (!tagResult.tag) {
    return errorResponse("Resource not found", 404);
  }

  const supabase = getSupabase();
  const projectAccess = await getProjectAccess(
    tagResult.tag.project_id,
    user.id,
    "editor",
    supabase,
  );
  if (!projectAccess.ok) {
    return accessFailureResponse(projectAccess.status);
  }

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", body.id)
    .eq("project_id", tagResult.tag.project_id);

  if (error) {
    return errorResponse("Unable to delete tag", 500);
  }

  return NextResponse.json({ ok: true });
}
