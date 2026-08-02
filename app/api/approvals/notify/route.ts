import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess, projectTenantAuthority } from "@/lib/access-control";
import { getSupabase } from "@/lib/supabase";
import {
  dispatchTransactionalNotification,
  notificationChannelStatus,
} from "@/lib/notifications/transactional";
import { createApprovalInvite } from "@/lib/review-invites";
import { resolveAssetVersion } from "@/lib/versions";

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { approval_id, asset_id } = body as { approval_id: string; asset_id: string };

  if (!approval_id || !asset_id) {
    return NextResponse.json({ error: "approval_id and asset_id are required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(
    asset_id,
    user.id,
    "producer",
    supabase,
  );
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const { data: step, error: stepErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", approval_id)
    .eq("asset_id", asset_id)
    .single();

  if (stepErr || !step) return NextResponse.json({ error: "Approval step not found" }, { status: 404 });
  if (!step.assignee_email) return NextResponse.json({ error: "No assignee email" }, { status: 400 });
  if (!step.version_id) {
    return NextResponse.json(
      { error: "This approval step is not bound to a media version" },
      { status: 409 },
    );
  }

  const versionLookup = await resolveAssetVersion({
    assetId: asset_id,
    versionId: step.version_id,
    client: supabase,
  });
  if (!versionLookup.ok || !versionLookup.version.is_current) {
    return NextResponse.json(
      { error: "Approval notices can only be sent for the current media version" },
      { status: 409 },
    );
  }

  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("title, project_id")
    .eq("id", asset_id)
    .single();

  if (assetErr || !asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name, owner_id, team_id")
    .eq("id", asset.project_id)
    .single();
  if (projectError || !project) {
    return NextResponse.json(
      { error: "Project notification authority is unavailable" },
      { status: 503 },
    );
  }

  const reviewInvite = await createApprovalInvite({
    assetId: asset_id,
    versionId: versionLookup.version.id,
    approvalId: approval_id,
    reviewerEmail: step.assignee_email,
    createdBy: user.id,
  });
  const notification = await dispatchTransactionalNotification({
    client: supabase,
    tenantId: projectTenantAuthority(project).key,
    actorId: user.id,
    actorName: user.email ?? "Co-VideoPro producer",
    eventType: "approval_requested",
    idempotencyKey: `approval-notify:${reviewInvite.id}`,
    channels: ["email"],
    recipient: { email: step.assignee_email },
    message: {
      title: `Approval requested for ${asset.title}`,
      body: `${project.name} has a version ready for your approval as ${step.role_label}.`,
      actionUrl: `/review/${reviewInvite.token}`,
    },
    projectId: asset.project_id,
    assetId: asset_id,
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
  const deliveryStatus = notificationChannelStatus(notification, "email");
  const accepted = deliveryStatus === "sent" || deliveryStatus === "queued";

  return NextResponse.json(
    { ok: accepted, sent_to: step.assignee_email, delivery_status: deliveryStatus },
    { status: accepted ? (deliveryStatus === "queued" ? 202 : 200) : 503 },
  );
}
