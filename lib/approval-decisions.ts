import type { ApprovalDecision } from "@/lib/types/codeliver";
import { getSupabase } from "@/lib/supabase";

const APPROVED_STATUSES = new Set<ApprovalDecision>([
  "approved",
  "approved_with_changes",
]);

const CHANGE_REQUEST_STATUSES = new Set<ApprovalDecision>([
  "changes_requested",
  "rejected",
]);

interface DecisionActor {
  id?: string | null;
  name: string | null;
}

interface RecordApprovalDecisionInput {
  assetId: string;
  approvalId: string;
  status: ApprovalDecision;
  decisionNote?: string | null;
  actor: DecisionActor;
}

export async function recordApprovalDecision({
  assetId,
  approvalId,
  status,
  decisionNote,
  actor,
}: RecordApprovalDecisionInput) {
  if (status === "pending") {
    return {
      ok: false as const,
      statusCode: 400,
      error: "Invalid approval status",
    };
  }

  const supabase = getSupabase();

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", approvalId)
    .eq("asset_id", assetId)
    .maybeSingle();

  if (approvalError) {
    return {
      ok: false as const,
      statusCode: 500,
      error: approvalError.message,
    };
  }

  if (!approval) {
    return {
      ok: false as const,
      statusCode: 404,
      error: "Approval step not found",
    };
  }

  if (approval.status !== "pending") {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval step has already been decided",
    };
  }

  const { data: workflow } = await supabase
    .from("approval_workflows")
    .select("id, mode")
    .eq("id", approval.workflow_id)
    .eq("status", "active")
    .maybeSingle();

  if (workflow?.mode === "sequential") {
    const { data: pendingSteps, error: pendingError } = await supabase
      .from("approvals")
      .select("id")
      .eq("asset_id", assetId)
      .eq("workflow_id", workflow.id)
      .eq("status", "pending")
      .order("step_order", { ascending: true });

    if (pendingError) {
      return {
        ok: false as const,
        statusCode: 500,
        error: pendingError.message,
      };
    }

    if (pendingSteps?.[0]?.id !== approvalId) {
      return {
        ok: false as const,
        statusCode: 409,
        error: "This approval step is not active yet",
      };
    }
  }

  const { data: updatedApproval, error: updateError } = await supabase
    .from("approvals")
    .update({
      status,
      decision_note: decisionNote || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .select()
    .single();

  if (updateError) {
    return {
      ok: false as const,
      statusCode: 500,
      error: updateError.message,
    };
  }

  await supabase.from("approval_history").insert({
    approval_id: approvalId,
    old_status: approval.status,
    new_status: status,
    changed_by: actor.id || null,
    note: decisionNote || null,
  });

  const asset = await supabase
    .from("assets")
    .select("project_id, title, status")
    .eq("id", assetId)
    .single();

  if (asset.data) {
    await supabase.from("activity_log").insert({
      project_id: asset.data.project_id,
      asset_id: assetId,
      actor_id: actor.id || null,
      actor_name: actor.name || "Unknown reviewer",
      action: APPROVED_STATUSES.has(status) ? "approved_asset" : "requested_changes",
      details: {
        asset_title: asset.data.title,
        role: updatedApproval.role_label,
        decision: status,
      },
    });
  }

  const { data: allApprovals } = await supabase
    .from("approvals")
    .select("status")
    .eq("asset_id", assetId);

  const allApproved =
    (allApprovals?.length ?? 0) > 0 &&
    allApprovals?.every((item) =>
      APPROVED_STATUSES.has(item.status as ApprovalDecision)
    );

  let assetStatus = asset.data?.status ?? null;

  if (allApproved) {
    await supabase.from("assets").update({ status: "approved" }).eq("id", assetId);
    assetStatus = "approved";
    if (approval.workflow_id) {
      await supabase
        .from("approval_workflows")
        .update({ status: "completed" })
        .eq("id", approval.workflow_id);
    }
  } else if (CHANGE_REQUEST_STATUSES.has(status)) {
    await supabase.from("assets").update({ status: "needs_changes" }).eq("id", assetId);
    assetStatus = "needs_changes";
  }

  return {
    ok: true as const,
    data: updatedApproval,
    assetStatus,
  };
}
