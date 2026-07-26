import { apiError, apiJson } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess, PROJECT_ROLE_RANK } from "@/lib/access-control";
import { recordApprovalDecision } from "@/lib/approval-decisions";
import { createApprovalInvite, normalizeReviewerEmail } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import { withAssetRouteBoundary } from "../../asset-route-boundary";

const NextResponse = { json: (body: Record<string, unknown>, init: ResponseInit = {}) =>
  "error" in body && !body.code ? apiError(String(body.error), init.status === 401 ? "UNAUTHORIZED" : init.status === 404 ? "NOT_FOUND" : init.status && init.status >= 500 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST", init.status ?? 400, init.headers) : apiJson(body, init) };

async function GETHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(id, user.id, "viewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const [approvalsResult, workflowResult] = await Promise.all([
    supabase
      .from("approvals")
      .select("*")
      .eq("asset_id", id)
      .order("step_order", { ascending: true }),
    supabase
      .from("approval_workflows")
      .select("mode")
      .eq("asset_id", id)
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

async function POSTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(id, user.id, "producer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Approval step body must be an object" },
      { status: 400 },
    );
  }
  const assigneeEmail = normalizeReviewerEmail(body.assignee_email);
  const assigneeId =
    typeof body.assignee_id === "string" && body.assignee_id.trim()
      ? body.assignee_id.trim()
      : null;
  const roleLabel =
    typeof body.role_label === "string" ? body.role_label.trim() : "";
  const stepOrder = body.step_order ?? 1;
  if (!roleLabel || roleLabel.length > 120) {
    return NextResponse.json({ error: "role_label is invalid" }, { status: 400 });
  }
  if (!Number.isInteger(stepOrder) || stepOrder < 1 || stepOrder > 100) {
    return NextResponse.json({ error: "step_order is invalid" }, { status: 400 });
  }
  if (!assigneeEmail && !assigneeId) {
    return NextResponse.json(
      { error: "An assignee email or user id is required" },
      { status: 400 },
    );
  }
  let verifiedEmail = assigneeEmail;
  if (assigneeId) {
    const assigneeLookup = await supabase.auth.admin.getUserById(assigneeId);
    const accountEmail = normalizeReviewerEmail(
      assigneeLookup.data?.user?.email,
    );
    if (assigneeLookup.error || !assigneeLookup.data?.user) {
      return NextResponse.json({ error: "Assignee was not found" }, { status: 400 });
    }
    if (verifiedEmail && accountEmail !== verifiedEmail) {
      return NextResponse.json(
        { error: "Assignee id and email do not match" },
        { status: 400 },
      );
    }
    verifiedEmail = accountEmail;
  }

  const { data, error } = await supabase
    .from("approvals")
    .insert({
      asset_id: id,
      step_order: stepOrder,
      role_label: roleLabel,
      assignee_email: verifiedEmail,
      assignee_id: assigneeId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "The approval step could not be created" },
      { status: 503 },
    );
  }

  // Send approval request email
  if (data && verifiedEmail) {
    const asset = await supabase.from("assets").select("title, project_id").eq("id", id).single();
    const project = await supabase.from("projects").select("name").eq("id", asset.data?.project_id).single();

    if (asset.data && project.data) {
      try {
        const reviewInvite = await createApprovalInvite({
          assetId: id,
          reviewerEmail: verifiedEmail,
          reviewerName:
            typeof body.assignee_name === "string"
              ? body.assignee_name.trim().slice(0, 120) || null
              : null,
          createdBy: user.id,
        });
        const reviewUrl = `${getBaseUrl()}/review/${reviewInvite.token}`;
        const emailPayload = emailTemplates.approvalRequest(
          verifiedEmail,
          asset.data.title,
          project.data.name,
          reviewUrl
        );
        await sendEmail({ to: verifiedEmail, ...emailPayload });
      } catch (inviteError) {
        console.error("Failed to create approval invite", inviteError);
      }
    }
  }

  return NextResponse.json(data, { status: 201 });
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
