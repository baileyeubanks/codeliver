import { NextRequest, NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const BULK_ACTIONS = new Set(["move", "tag", "delete", "restore"]);
const MAX_BULK_ASSETS = 500;

type BulkAction = "move" | "tag" | "delete" | "restore";
type JsonObject = Record<string, unknown>;
type Supabase = ReturnType<typeof getSupabase>;

type AssetProjectRow = {
  id: string;
  project_id: string;
};

type BulkAccessResult =
  | { ok: true; assetIds: string[]; projectId: string }
  | { ok: false; response: NextResponse };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function accessFailureResponse(status: number) {
  return status >= 500
    ? errorResponse("Unable to process bulk asset request", 500)
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

function isBulkAction(value: unknown): value is BulkAction {
  return typeof value === "string" && BULK_ACTIONS.has(value);
}

async function authorizeBulkAssets(
  assetIds: string[],
  userId: string,
  supabase: Supabase,
): Promise<BulkAccessResult> {
  const { data, error } = await supabase
    .from("assets")
    .select("id, project_id")
    .in("id", assetIds);

  if (error) {
    return {
      ok: false,
      response: errorResponse("Unable to process bulk asset request", 500),
    };
  }

  const assets = (data ?? []) as AssetProjectRow[];
  const returnedIds = new Set(assets.map((asset) => asset.id));
  if (
    assets.length !== assetIds.length ||
    assetIds.some((assetId) => !returnedIds.has(assetId))
  ) {
    return {
      ok: false,
      response: errorResponse("Resource not found", 404),
    };
  }

  const projectIds = new Set(assets.map((asset) => asset.project_id));
  if (projectIds.size !== 1) {
    return {
      ok: false,
      response: errorResponse("Invalid asset selection", 400),
    };
  }

  const projectId = projectIds.values().next().value;
  if (!isIdentifier(projectId)) {
    return {
      ok: false,
      response: errorResponse("Resource not found", 404),
    };
  }

  const projectAccess = await getProjectAccess(
    projectId,
    userId,
    "editor",
    supabase,
  );
  if (!projectAccess.ok) {
    return {
      ok: false,
      response: accessFailureResponse(projectAccess.status),
    };
  }

  return { ok: true, assetIds, projectId };
}

async function validateDestination(
  table: "folders" | "tags",
  id: string,
  projectId: string,
  supabase: Supabase,
) {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: errorResponse("Unable to process bulk asset request", 500),
    };
  }
  if (!data) {
    return {
      ok: false as const,
      response: errorResponse("Resource not found", 404),
    };
  }

  return { ok: true as const };
}

async function updateAssets(
  assetIds: string[],
  projectId: string,
  updates: Record<string, unknown>,
  supabase: Supabase,
) {
  const { data, error } = await supabase
    .from("assets")
    .update(updates)
    .eq("project_id", projectId)
    .in("id", assetIds)
    .select("id");

  return !error && (data ?? []).length === assetIds.length;
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  const body = await readJsonObject(request);
  if (!body || !isBulkAction(body.action) || !Array.isArray(body.asset_ids)) {
    return errorResponse("Invalid request", 400);
  }

  if (
    body.asset_ids.length < 1 ||
    body.asset_ids.length > MAX_BULK_ASSETS ||
    !body.asset_ids.every(isIdentifier)
  ) {
    return errorResponse("Invalid request", 400);
  }

  const action = body.action;
  const assetIds = Array.from(new Set(body.asset_ids));
  let folderId: string | null = null;
  let tagId: string | null = null;

  if (action === "move") {
    if (body.folder_id !== undefined && body.folder_id !== null) {
      if (!isIdentifier(body.folder_id)) {
        return errorResponse("Invalid request", 400);
      }
      folderId = body.folder_id;
    }
  }

  if (action === "tag") {
    if (!isIdentifier(body.tag_id)) {
      return errorResponse("Invalid request", 400);
    }
    tagId = body.tag_id;
  }

  const supabase = getSupabase();
  const access = await authorizeBulkAssets(assetIds, user.id, supabase);
  if (!access.ok) return access.response;

  if (action === "move" && folderId) {
    const destination = await validateDestination(
      "folders",
      folderId,
      access.projectId,
      supabase,
    );
    if (!destination.ok) return destination.response;
  }

  if (action === "tag" && tagId) {
    const destination = await validateDestination(
      "tags",
      tagId,
      access.projectId,
      supabase,
    );
    if (!destination.ok) return destination.response;
  }

  switch (action) {
    case "move": {
      const updated = await updateAssets(
        access.assetIds,
        access.projectId,
        { folder_id: folderId },
        supabase,
      );
      if (!updated) {
        return errorResponse("Unable to update assets", 500);
      }
      return NextResponse.json({
        ok: true,
        message: `Moved ${access.assetIds.length} asset(s)`,
      });
    }

    case "tag": {
      const rows = access.assetIds.map((asset_id) => ({
        asset_id,
        tag_id: tagId,
      }));
      const { error } = await supabase
        .from("asset_tags")
        .upsert(rows, { onConflict: "asset_id,tag_id" });

      if (error) {
        return errorResponse("Unable to update assets", 500);
      }
      return NextResponse.json({
        ok: true,
        message: `Tagged ${access.assetIds.length} asset(s)`,
      });
    }

    case "delete": {
      const updated = await updateAssets(
        access.assetIds,
        access.projectId,
        { deleted_at: new Date().toISOString() },
        supabase,
      );
      if (!updated) {
        return errorResponse("Unable to update assets", 500);
      }
      return NextResponse.json({
        ok: true,
        message: `Deleted ${access.assetIds.length} asset(s)`,
      });
    }

    case "restore": {
      const updated = await updateAssets(
        access.assetIds,
        access.projectId,
        { deleted_at: null },
        supabase,
      );
      if (!updated) {
        return errorResponse("Unable to update assets", 500);
      }
      return NextResponse.json({
        ok: true,
        message: `Restored ${access.assetIds.length} asset(s)`,
      });
    }
  }
}
