import { apiError, apiJson } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess, PROJECT_ROLE_RANK } from "@/lib/access-control";
import { recordApprovalDecision } from "@/lib/approval-decisions";
import { normalizeReviewerEmail } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { withAssetRouteBoundary } from "../../asset-route-boundary";

const NextResponse = { json: (body: Record<string, unknown>, init: ResponseInit = {}) =>
  "error" in body && !body.code ? apiError(String(body.error), init.status === 401 ? "UNAUTHORIZED" : init.status === 404 ? "NOT_FOUND" : init.status && init.status >= 500 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST", init.status ?? 400, init.headers) : apiJson(body, init) };

async function GETHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(id, user.id, "viewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }
  const versionId = new URL(req.url).searchParams.get("version_id");
  if (!versionId) return apiError("version_id is required", "INVALID_REQUEST", 400);

  const [approvalsResult, workflowResult] = await Promise.all([
    supabase
      .from("approvals")
      .select("*")
      .eq("asset_id", id)
      .eq("version_id", versionId)
      .order("step_order", { ascending: true }),
    supabase
      .from("approval_workflows")
      .select("mode")
      .eq("asset_id", id)
      .eq("version_id", versionId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (approvalsResult.error) {
    return apiError("Approval data is unavailable", "BACKEND_UNAVAILABLE", 503);
  }

  if (workflowResult.error) {
    return apiError("Approval data is unavailable", "BACKEND_UNAVAILABLE", 503);
  }

  const actorEmail = normalizeReviewerEmail(user.email);
  const canSeeAssignee =
    assetAccess.data.access_rank >= PROJECT_ROLE_RANK.member;
  const items = (approvalsResult.data ?? []).map((approval) => {
    if (canSeeAssignee) return approval;
    const assignedToMe =
      approval.assignee_id === user.id ||
      (actorEmail !== null &&
        normalizeReviewerEmail(approval.assignee_email) === actorEmail);
    return {
      ...approval,
      assignee_id: null,
      assignee_email: null,
      assigned_to_me: assignedToMe,
    };
  });

  return NextResponse.json({
    items,
    workflow_mode: workflowResult.data?.mode ?? null,
  });
}

async function POSTHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(id, user.id, "producer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }
  return apiError(
    "Create the immutable version approval round through /api/approvals/workflow",
    "METHOD_NOT_ALLOWED",
    405,
  );
}

async function PATCHHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(assetId, user.id, "reviewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Approval decision body must be an object" },
      { status: 400 },
    );
  }
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Approval step id is required" }, { status: 400 });
  }
  if (typeof body.version_id !== "string" || !body.version_id) {
    return NextResponse.json({ error: "version_id is required" }, { status: 400 });
  }
  if (body.status !== "approved" && body.status !== "changes_requested") {
    return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
  }
  if (
    body.decision_note !== undefined &&
    body.decision_note !== null &&
    (typeof body.decision_note !== "string" || body.decision_note.length > 5_000)
  ) {
    return NextResponse.json({ error: "decision_note is invalid" }, { status: 400 });
  }

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .select("id, assignee_id, assignee_email")
    .eq("id", body.id)
    .eq("asset_id", assetId)
    .eq("version_id", body.version_id)
    .maybeSingle();

  if (approvalError) {
    return apiError("Approval step could not be loaded", "BACKEND_UNAVAILABLE", 503);
  }
  if (!approval) {
    return NextResponse.json({ error: "Approval step not found" }, { status: 404 });
  }

  const actorEmail = normalizeReviewerEmail(user.email);
  const assigneeEmail = normalizeReviewerEmail(approval.assignee_email);
  const isAssignedReviewer =
    approval.assignee_id === user.id ||
    (actorEmail !== null && assigneeEmail === actorEmail);

  if (!isAssignedReviewer) {
    return NextResponse.json(
      { error: "This approval step is assigned to another reviewer" },
      { status: 403 },
    );
  }

  const decision = await recordApprovalDecision({
    assetId,
    versionId: body.version_id,
    approvalId: body.id,
    status: body.status,
    decisionNote: body.decision_note,
    actor: {
      id: user.id,
      name: user.email ?? "Internal reviewer",
    },
  });

  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.statusCode });
  }

  return NextResponse.json({
    approval: decision.data,
    asset_status: decision.assetStatus,
  });
}

export const GET = withAssetRouteBoundary(GETHandler);
export const POST = withAssetRouteBoundary(POSTHandler);
export const PATCH = withAssetRouteBoundary(PATCHHandler);
