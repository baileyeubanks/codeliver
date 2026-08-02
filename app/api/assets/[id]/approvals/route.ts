import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  getAssetAccess,
  projectTenantAuthority,
  PROJECT_ROLE_RANK,
} from "@/lib/access-control";
import { recordApprovalDecision } from "@/lib/approval-decisions";
import {
  createPrivilegedApprovalInviteAfterAuthorization,
  normalizeReviewerEmail,
  resolvePrivilegedApprovalAssigneeEmailAfterAuthorization,
} from "@/lib/review-invites";
import {
  dispatchTransactionalNotification,
  notificationChannelStatus,
} from "@/lib/notifications/transactional";
import { resolveAssetVersion } from "@/lib/versions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getAssetAccess(id, user.id, "viewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const requestedVersionId = new URL(req.url).searchParams.get("version_id");
  const versionLookup = await resolveAssetVersion({
    assetId: id,
    versionId: requestedVersionId,
    client: supabase,
  });
  if (!versionLookup.ok) {
    return NextResponse.json(
      { error: versionLookup.error },
      { status: versionLookup.status >= 500 ? 503 : versionLookup.status },
    );
  }

  const [approvalsResult, workflowResult] = await Promise.all([
    supabase
      .from("approvals")
      .select("*")
      .eq("asset_id", id)
      .eq("version_id", versionLookup.version.id)
      .order("step_order", { ascending: true }),
    supabase
      .from("approval_workflows")
      .select("mode")
      .eq("asset_id", id)
      .eq("version_id", versionLookup.version.id)
      .maybeSingle(),
  ]);

  if (approvalsResult.error) {
    return NextResponse.json(
      { error: "Approvals could not be loaded" },
      { status: 503 },
    );
  }

  if (workflowResult.error) {
    return NextResponse.json(
      { error: "Approval workflow could not be loaded" },
      { status: 503 },
    );
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
    version_id: versionLookup.version.id,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
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

  const requestedVersionId =
    typeof body.version_id === "string" && body.version_id.trim()
      ? body.version_id.trim()
      : null;
  const versionLookup = await resolveAssetVersion({
    assetId: id,
    versionId: requestedVersionId,
    client: supabase,
  });
  if (!versionLookup.ok) {
    return NextResponse.json(
      { error: versionLookup.error },
      { status: versionLookup.status >= 500 ? 503 : versionLookup.status },
    );
  }
  if (!versionLookup.version.is_current) {
    return NextResponse.json(
      { error: "Approval steps can only be added to the current media version" },
      { status: 409 },
    );
  }

  let verifiedEmail = assigneeEmail;
  if (assigneeId) {
    const verification =
      await resolvePrivilegedApprovalAssigneeEmailAfterAuthorization({
        assigneeId,
        expectedEmail: verifiedEmail,
      });
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }
    verifiedEmail = verification.email;
  }

  const existingWorkflow = await supabase
    .from("approval_workflows")
    .select("id")
    .eq("asset_id", id)
    .eq("version_id", versionLookup.version.id)
    .eq("status", "active")
    .maybeSingle();
  if (existingWorkflow.error) {
    return NextResponse.json(
      { error: "The approval workflow could not be loaded" },
      { status: 503 },
    );
  }

  let workflowId = existingWorkflow.data?.id ?? null;
  if (!workflowId) {
    const createdWorkflow = await supabase
      .from("approval_workflows")
      .insert({
        asset_id: id,
        version_id: versionLookup.version.id,
        mode: "sequential",
        created_by: user.id,
        status: "active",
      })
      .select("id")
      .single();
    if (createdWorkflow.error || !createdWorkflow.data) {
      return NextResponse.json(
        { error: "The approval workflow could not be created" },
        { status: 503 },
      );
    }
    workflowId = createdWorkflow.data.id;
  }

  const { data, error } = await supabase
    .from("approvals")
    .insert({
      asset_id: id,
      version_id: versionLookup.version.id,
      workflow_id: workflowId,
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

  let notificationDelivery: ReturnType<typeof notificationChannelStatus> | null = null;
  if (data && verifiedEmail) {
    const project = await supabase
      .from("projects")
      .select("name, owner_id, team_id")
      .eq("id", assetAccess.data.project_id)
      .maybeSingle();

    if (!project.error && project.data) {
      try {
        const reviewInvite =
          await createPrivilegedApprovalInviteAfterAuthorization({
            authorizedClient: supabase,
            assetId: id,
            versionId: versionLookup.version.id,
            approvalId: data.id,
            reviewerEmail: verifiedEmail,
            reviewerName:
              typeof body.assignee_name === "string"
                ? body.assignee_name.trim().slice(0, 120) || null
                : null,
            createdBy: user.id,
          });
        const notification = await dispatchTransactionalNotification({
          client: supabase,
          tenantId: projectTenantAuthority(project.data).key,
          actorId: user.id,
          actorName: user.email ?? "Co-VideoPro producer",
          eventType: "approval_requested",
          idempotencyKey: `approval-request:${data.id}`,
          channels: ["email"],
          recipient: {
            userId: assigneeId,
            name:
              typeof body.assignee_name === "string"
                ? body.assignee_name.trim().slice(0, 120) || null
                : null,
            email: verifiedEmail,
          },
          message: {
            title: `Approval requested for ${assetAccess.data.title}`,
            body: `${project.data.name} has a new version ready for your approval.`,
            actionUrl: `/review/${reviewInvite.token}`,
          },
          projectId: assetAccess.data.project_id,
          assetId: id,
        });
        if (
          !notification.ok &&
          "code" in notification &&
          notification.code === "notification_queue_unavailable"
        ) {
          return NextResponse.json(
            { error: notification.error, code: notification.code },
            { status: 503 },
          );
        }
        notificationDelivery = notificationChannelStatus(notification, "email");
      } catch (inviteError) {
        console.error("Failed to create approval invite", inviteError);
      }
    }
  }

  return NextResponse.json({ ...data, notification_delivery: notificationDelivery }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
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
  const versionId =
    typeof body.version_id === "string" && body.version_id.trim()
      ? body.version_id.trim()
      : null;
  if (!versionId) {
    return NextResponse.json(
      { error: "The media version being approved is required" },
      { status: 400 },
    );
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
    .select("id, version_id, assignee_id, assignee_email")
    .eq("id", body.id)
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .maybeSingle();

  if (approvalError) {
    return NextResponse.json(
      { error: "Approval step could not be loaded" },
      { status: 503 },
    );
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
    versionId,
    approvalId: body.id,
    status: body.status,
    decisionNote: body.decision_note,
    actor: {
      id: user.id,
      name: user.email ?? "Internal reviewer",
    },
  }, supabase);

  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.statusCode });
  }

  return NextResponse.json({
    approval: decision.data,
    asset_status: decision.assetStatus,
  });
}
