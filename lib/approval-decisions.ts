import type { ApprovalDecision } from "@/lib/types/codeliver";
import { deliverSignedWebhook } from "@/lib/security/webhook-delivery";
import { recoverWebhookSecret } from "@/lib/security/webhook-secret";
import { getSupabase } from "@/lib/supabase";

interface DecisionActor {
  id?: string | null;
  name: string | null;
}

interface RecordApprovalDecisionInput {
  assetId: string;
  versionId: string;
  approvalId: string;
  reviewInviteId?: string | null;
  status: ApprovalDecision;
  decisionNote?: string | null;
  actor: DecisionActor;
}

interface DecisionRpcResult {
  approval: Record<string, unknown>;
  asset_status: string;
  asset_title: string;
  all_approved: boolean;
  workflow_completed: boolean;
  webhook_event: "asset.approved" | "asset.changes_requested" | "review.completed";
}

function decisionFailure(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("CVP_APPROVAL_STATUS_INVALID")) {
    return { ok: false as const, statusCode: 400, error: "Invalid approval status" };
  }
  if (
    message.includes("CVP_APPROVAL_NOT_FOUND") ||
    message.includes("CVP_APPROVAL_ASSET_NOT_FOUND") ||
    message.includes("CVP_APPROVAL_VERSION_NOT_FOUND")
  ) {
    return { ok: false as const, statusCode: 404, error: "Approval step not found" };
  }
  if (message.includes("CVP_APPROVAL_WORKFLOW_INACTIVE")) {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval workflow is no longer active",
    };
  }
  if (message.includes("CVP_APPROVAL_VERSION_NOT_CURRENT")) {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval link belongs to an older version",
    };
  }
  if (message.includes("CVP_APPROVAL_INVITE_MISMATCH")) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This review link is not bound to this approval step",
    };
  }
  if (message.includes("CVP_APPROVAL_STEP_NOT_ACTIVE")) {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval step is not active yet",
    };
  }
  if (message.includes("CVP_APPROVAL_ALREADY_DECIDED")) {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval step has already been decided",
    };
  }
  return {
    ok: false as const,
    statusCode: 500,
    error: "Approval service is unavailable",
  };
}

function isDecisionRpcResult(value: unknown): value is DecisionRpcResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<DecisionRpcResult>;
  return Boolean(
    result.approval &&
    typeof result.approval === "object" &&
    typeof result.asset_status === "string" &&
    typeof result.asset_title === "string" &&
    typeof result.all_approved === "boolean" &&
    typeof result.workflow_completed === "boolean" &&
    (result.webhook_event === "asset.approved" ||
      result.webhook_event === "asset.changes_requested" ||
      result.webhook_event === "review.completed"),
  );
}

export async function recordApprovalDecision({
  assetId,
  versionId,
  approvalId,
  reviewInviteId,
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
  const { data, error } = await supabase.rpc(
    "record_version_approval_decision",
    {
      p_asset_id: assetId,
      p_version_id: versionId,
      p_approval_id: approvalId,
      p_review_invite_id: reviewInviteId ?? null,
      p_status: status,
      p_decision_note: decisionNote?.trim() || null,
      p_actor_id: actor.id || null,
      p_actor_name: actor.name || "Unknown reviewer",
    },
  );

  if (error) return decisionFailure(error);
  if (!isDecisionRpcResult(data)) return decisionFailure(null);

  // The RPC has committed history and activity before any external event can
  // leave the process. Delivery failures remain observable but cannot undo a
  // durable approval decision.
  emitWebhookEvents(assetId, data.webhook_event, {
    asset_id: assetId,
    version_id: versionId,
    asset_title: data.asset_title,
    approval_id: approvalId,
    decision: status,
    decided_by: actor.name,
    all_approved: data.all_approved,
    asset_status: data.asset_status,
  }).catch((err) => console.error("[webhooks] Emission error:", err));

  return {
    ok: true as const,
    data: data.approval,
    assetStatus: data.asset_status,
  };
}

/**
 * Emit webhook events to the owning team's active webhooks that subscribe to this event type.
 * Fire-and-forget — failures are logged but don't block the response.
 */
async function emitWebhookEvents(
  assetId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  // Resolve authority from persisted relationships only: asset -> project owner -> team.
  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("project_id, projects(owner_id)")
    .eq("id", assetId)
    .single();

  if (assetError || !asset) return;

  const project = Array.isArray(asset.projects)
    ? asset.projects[0]
    : asset.projects;
  const projectOwnerId = project?.owner_id;

  if (!projectOwnerId) return;

  const { data: owningTeams, error: teamError } = await supabase
    .from("teams")
    .select("id")
    .eq("owner_id", projectOwnerId)
    .limit(2);

  // Projects have no direct team_id, so ambiguous owner-to-team mappings must fail closed.
  if (teamError || owningTeams?.length !== 1 || !owningTeams[0]?.id) return;

  // Find owning-team webhooks that subscribe to this event (empty events = all events).
  const { data: webhooks } = await supabase
    .from("webhooks")
    .select("*")
    .eq("team_id", owningTeams[0].id)
    .eq("active", true);

  if (!webhooks || webhooks.length === 0) return;

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  for (const webhook of webhooks) {
    // Check if webhook subscribes to this event
    const events = webhook.events as string[];
    if (events.length > 0 && !events.includes(event)) continue;

    try {
      const result = await deliverSignedWebhook({
        url: webhook.url,
        secret: recoverWebhookSecret(webhook as Record<string, unknown>),
        event,
        payload,
      });

      // Log delivery
      await supabase.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        event,
        payload,
        response_code: result.responseCode,
      });
    } catch {
      // Log failed delivery
      await supabase.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        event,
        payload,
        response_code: 0,
      });
    }
  }
}
