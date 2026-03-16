import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOwnedAsset } from "@/lib/access-control";
import { recordApprovalDecision } from "@/lib/approval-decisions";
import { createApprovalInvite, normalizeReviewerEmail } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const supabase = getSupabase();
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
    return NextResponse.json({ error: approvalsResult.error.message }, { status: 500 });
  }

  if (workflowResult.error) {
    return NextResponse.json({ error: workflowResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: approvalsResult.data,
    workflow_mode: workflowResult.data?.mode ?? null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json();
  const assigneeEmail = normalizeReviewerEmail(body.assignee_email);

  const { data, error } = await getSupabase()
    .from("approvals")
    .insert({
      asset_id: id,
      step_order: body.step_order || 1,
      role_label: body.role_label,
      assignee_email: assigneeEmail,
      assignee_id: body.assignee_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send approval request email
  if (data && assigneeEmail) {
    const asset = await getSupabase().from("assets").select("title, project_id").eq("id", id).single();
    const project = await getSupabase().from("projects").select("name").eq("id", asset.data?.project_id).single();

    if (asset.data && project.data) {
      try {
        const reviewInvite = await createApprovalInvite({
          assetId: id,
          reviewerEmail: assigneeEmail,
          reviewerName: body.assignee_name || null,
          createdBy: user.id,
        });
        const reviewUrl = `${getBaseUrl()}/review/${reviewInvite.token}`;
        const emailPayload = emailTemplates.approvalRequest(
          assigneeEmail,
          asset.data.title,
          project.data.name,
          reviewUrl
        );
        await sendEmail({ to: assigneeEmail, ...emailPayload });
      } catch (inviteError) {
        console.error("Failed to create approval invite", inviteError);
      }
    }
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getOwnedAsset(assetId, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = await req.json();

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
