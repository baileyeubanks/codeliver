import { apiError, apiJson } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import {
  getAssetAccess,
  PROJECT_ROLE_RANK,
} from "@/lib/access-control";
import {
  EDIT_DECISION_STATUSES,
  parseEditDecisionInput,
} from "@/lib/edit-decisions";
import { getSupabase } from "@/lib/supabase";
import { withAssetRouteBoundary } from "../../asset-route-boundary";

const NextResponse = { json: (body: Record<string, unknown>, init: ResponseInit = {}) =>
  "error" in body && !body.code ? apiError(String(body.error), init.status === 401 ? "UNAUTHORIZED" : init.status === 404 ? "NOT_FOUND" : init.status && init.status >= 500 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST", init.status ?? 400, init.headers) : apiJson(body, init) };
import type { EditDecisionStatus } from "@/lib/types/codeliver";
import { resolveAssetVersion } from "@/lib/versions";

function requestedVersion(req: Request) {
  return new URL(req.url).searchParams.get("version_id");
}

async function GETHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "viewer");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const versionLookup = await resolveAssetVersion({
    assetId: id,
    versionId: requestedVersion(req),
  });
  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  const { data, error } = await getSupabase()
    .from("edit_decisions")
    .select("*")
    .eq("asset_id", id)
    .eq("version_id", versionLookup.version.id)
    .order("start_seconds", { ascending: true });

  if (error) return apiError("Edit decisions are unavailable", "BACKEND_UNAVAILABLE", 503);
  return NextResponse.json({ items: data ?? [], version: versionLookup.version });
}

async function POSTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "reviewer");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseEditDecisionInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const bodyRecord = body as Record<string, unknown>;
  const versionLookup = await resolveAssetVersion({
    assetId: id,
    versionId: typeof bodyRecord.version_id === "string" ? bodyRecord.version_id : null,
  });
  if (!versionLookup.ok) {
    return NextResponse.json({ error: versionLookup.error }, { status: versionLookup.status });
  }

  const requestedStatus = bodyRecord.status;
  const canAccept = assetAccess.data.access_rank >= PROJECT_ROLE_RANK.editor;
  if (
    !canAccept &&
    (parsed.value.decision_type !== "cut" ||
      !["keyboard", "manual"].includes(parsed.value.source))
  ) {
    return NextResponse.json(
      { error: "Reviewers can only propose manual cut markers" },
      { status: 403 },
    );
  }
  const status: EditDecisionStatus =
    canAccept && requestedStatus === "accepted" ? "accepted" : "proposed";
  const supabase = getSupabase();
  const existing = await supabase
    .from("edit_decisions")
    .select("*")
    .eq("version_id", versionLookup.version.id)
    .eq("client_request_id", parsed.value.client_request_id)
    .maybeSingle();

  if (existing.error) return apiError("Edit decisions are unavailable", "BACKEND_UNAVAILABLE", 503);
  if (existing.data) return NextResponse.json(existing.data);

  const { data, error } = await supabase
    .from("edit_decisions")
    .insert({
      asset_id: id,
      version_id: versionLookup.version.id,
      review_invite_id: null,
      created_by: user.id,
      created_by_name: (user.email || "Project collaborator").slice(0, 120),
      ...parsed.value,
      status,
      metadata: {
        ...parsed.value.metadata,
        entry_surface: "internal_review",
      },
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicate = await supabase
        .from("edit_decisions")
        .select("*")
        .eq("version_id", versionLookup.version.id)
        .eq("client_request_id", parsed.value.client_request_id)
        .single();
      if (duplicate.data) return NextResponse.json(duplicate.data);
    }

    return apiError("Edit decision could not be created", "BACKEND_UNAVAILABLE", 503);
  }

  await supabase.from("activity_log").insert({
    project_id: assetAccess.data.project_id,
    asset_id: id,
    actor_id: user.id,
    actor_name: user.email,
    action: "recorded_edit_decision",
    details: {
      decision_id: data.id,
      decision_type: data.decision_type,
      start_seconds: data.start_seconds,
      version_id: data.version_id,
    },
  });

  return NextResponse.json(data, { status: 201 });
}

async function PATCHHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "editor");
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const decisionId = typeof body?.id === "string" ? body.id : "";
  const status = body?.status;
  if (!decisionId) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!EDIT_DECISION_STATUSES.includes(status as EditDecisionStatus)) {
    return NextResponse.json({ error: "Invalid edit decision status" }, { status: 400 });
  }

  const label = typeof body?.label === "string" ? body.label.trim() : undefined;
  if (label && label.length > 160) {
    return NextResponse.json({ error: "Edit decision label is too long" }, { status: 400 });
  }

  const updates: { status: EditDecisionStatus; label?: string | null } = {
    status: status as EditDecisionStatus,
  };
  if (label !== undefined) updates.label = label || null;

  const { data, error } = await getSupabase()
    .from("edit_decisions")
    .update(updates)
    .eq("id", decisionId)
    .eq("asset_id", assetId)
    .select("*")
    .maybeSingle();

  if (error) return apiError("Edit decision could not be updated", "BACKEND_UNAVAILABLE", 503);
  if (!data) return NextResponse.json({ error: "Edit decision not found" }, { status: 404 });

  return NextResponse.json(data);
}

export const GET = withAssetRouteBoundary(GETHandler);
export const POST = withAssetRouteBoundary(POSTHandler);
export const PATCH = withAssetRouteBoundary(PATCHHandler);
