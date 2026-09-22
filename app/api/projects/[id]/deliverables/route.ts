import { getProjectAccess } from "@/lib/access-control";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const DELIVERABLE_COLUMNS =
  "id, project_id, name, spec, source_version_id, status, qc_notes, delivered_at, locked_at, locked_by, approval_id, created_at, updated_at";
const DELIVERABLE_ITEM_COLUMNS =
  "id, deliverable_id, asset_id, version_id, sha256, created_at";

async function authenticatedUser() {
  try {
    const user = await requireAuth();
    return user ? { user } : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
  } catch {
    return { response: backendUnavailable() };
  }
}

function accessFailure(access: { status: number; error: string }) {
  if (access.status >= 500) return backendUnavailable();
  return apiError(access.error, "PROJECT_NOT_FOUND", access.status);
}

async function readBody(request: Request) {
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
  const auth = await authenticatedUser();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(id, auth.user.id, "viewer");
    if (!projectAccess.ok) return accessFailure(projectAccess);

    const { data, error } = await getSupabase()
      .from("deliverables")
      .select(DELIVERABLE_COLUMNS)
      .eq("project_id", id)
      .order("created_at", { ascending: true });
    if (error) return backendUnavailable();

    const rows = data ?? [];
    let items: Record<string, unknown>[] = [];
    if (rows.length > 0) {
      const itemsResult = await getSupabase()
        .from("deliverable_items")
        .select(DELIVERABLE_ITEM_COLUMNS)
        .in("deliverable_id", rows.map((row) => row.id));
      if (itemsResult.error) return backendUnavailable();
      items = itemsResult.data ?? [];
    }

    return apiJson({
      deliverables: rows.map((row) => ({
        ...row,
        items: items.filter((item) => item.deliverable_id === row.id),
      })),
    });
  } catch {
    return backendUnavailable();
  }
}

interface DeliverableItemInput {
  asset_id: string;
  version_id: string;
  sha256: string | null;
}

function parseItems(value: unknown): DeliverableItemInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const items: DeliverableItemInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.asset_id !== "string" ||
      !candidate.asset_id ||
      typeof candidate.version_id !== "string" ||
      !candidate.version_id
    ) {
      return null;
    }
    if (candidate.sha256 !== undefined && candidate.sha256 !== null && typeof candidate.sha256 !== "string") {
      return null;
    }
    items.push({
      asset_id: candidate.asset_id,
      version_id: candidate.version_id,
      sha256: typeof candidate.sha256 === "string" ? candidate.sha256 : null,
    });
  }
  return items;
}

function parseSpec(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const spec: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (typeof field === "string" || typeof field === "boolean" || typeof field === "number") {
      spec[key] = field;
    }
  }
  return spec;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticatedUser();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(id, auth.user.id, "editor");
    if (!projectAccess.ok) return accessFailure(projectAccess);

    const body = await readBody(req);
    if (!body) {
      return apiError("Request body must be a JSON object", "INVALID_REQUEST", 400);
    }
    if (
      typeof body.name !== "string" ||
      body.name.trim().length < 1 ||
      body.name.trim().length > 240
    ) {
      return apiError("name is invalid", "INVALID_REQUEST", 400);
    }
    const spec = parseSpec(body.spec);
    if (!spec) return apiError("spec is invalid", "INVALID_REQUEST", 400);
    const items = parseItems(body.items);
    if (!items) return apiError("items is invalid", "INVALID_REQUEST", 400);
    if (
      body.source_version_id !== undefined &&
      body.source_version_id !== null &&
      typeof body.source_version_id !== "string"
    ) {
      return apiError("source_version_id is invalid", "INVALID_REQUEST", 400);
    }

    const supabase = getSupabase();

    // Items may only bind versions that belong to assets inside this project.
    if (items.length > 0) {
      const assetIds = [...new Set(items.map((item) => item.asset_id))];
      const assetsResult = await supabase
        .from("assets")
        .select("id")
        .eq("project_id", id)
        .in("id", assetIds);
      if (assetsResult.error) return backendUnavailable();
      const projectAssetIds = new Set((assetsResult.data ?? []).map((row) => row.id));
      if (assetIds.some((assetId) => !projectAssetIds.has(assetId))) {
        return apiError("items bind assets outside this project", "INVALID_REQUEST", 400);
      }

      const versionsResult = await supabase
        .from("versions")
        .select("id, asset_id")
        .in("id", [...new Set(items.map((item) => item.version_id))]);
      if (versionsResult.error) return backendUnavailable();
      const versionAsset = new Map(
        (versionsResult.data ?? []).map((row) => [row.id, row.asset_id]),
      );
      if (items.some((item) => versionAsset.get(item.version_id) !== item.asset_id)) {
        return apiError("items bind versions that do not belong to their asset", "INVALID_REQUEST", 400);
      }
    }

    const { data: deliverable, error: insertError } = await supabase
      .from("deliverables")
      .insert({
        project_id: id,
        created_by: auth.user.id,
        name: body.name.trim(),
        spec,
        source_version_id: typeof body.source_version_id === "string" ? body.source_version_id : null,
        status: "specced",
      })
      .select(DELIVERABLE_COLUMNS)
      .single();
    if (insertError || !deliverable) return backendUnavailable();

    let insertedItems: Record<string, unknown>[] = [];
    if (items.length > 0) {
      const itemsResult = await supabase
        .from("deliverable_items")
        .insert(
          items.map((item) => ({
            deliverable_id: deliverable.id,
            asset_id: item.asset_id,
            version_id: item.version_id,
            sha256: item.sha256,
          })),
        )
        .select(DELIVERABLE_ITEM_COLUMNS);
      if (itemsResult.error) {
        await supabase.from("deliverables").delete().eq("id", deliverable.id);
        return backendUnavailable();
      }
      insertedItems = itemsResult.data ?? [];
    }

    return apiJson({ ...deliverable, items: insertedItems }, { status: 201 });
  } catch {
    return backendUnavailable();
  }
}
