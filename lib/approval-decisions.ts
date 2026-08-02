import type { ApprovalDecision } from "@/lib/types/codeliver";
import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
} from "@/lib/data-authority";
import { deliverSignedWebhook } from "@/lib/security/webhook-delivery";
import { enqueueWebhookOutboxDelivery } from "@/lib/security/webhook-outbox";
import { recoverWebhookSecret } from "@/lib/security/webhook-secret";
import { getSupabase, type DataSupabaseClient } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

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
  versionId?: string | null;
  approvalId: string;
  status: ApprovalDecision;
  decisionNote?: string | null;
  actor: DecisionActor;
}

export async function recordApprovalDecision(
  {
    assetId,
    versionId,
    approvalId,
    status,
    decisionNote,
    actor,
  }: RecordApprovalDecisionInput,
  client?: DataSupabaseClient,
) {
  if (status === "pending") {
    return {
      ok: false as const,
      statusCode: 400,
      error: "Invalid approval status",
    };
  }

  const supabase = client ?? getSupabase();

  if (!versionId) {
    return {
      ok: false as const,
      statusCode: 400,
      error: "The media version being approved is required",
    };
  }

  const versionLookup = await resolveAssetVersion({
    assetId,
    versionId,
    client: supabase,
  });
  if (!versionLookup.ok) {
    return {
      ok: false as const,
      statusCode: versionLookup.status >= 500 ? 503 : versionLookup.status,
      error:
        versionLookup.status >= 500
          ? "Approval version could not be evaluated"
          : versionLookup.error,
    };
  }
  if (!versionLookup.version.is_current) {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval request is for an earlier version",
    };
  }

  const { data: approval, error: approvalError } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", approvalId)
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .maybeSingle();

  if (approvalError) {
    return {
      ok: false as const,
      statusCode: 503,
      error: "Approval step could not be loaded",
    };
  }

  if (!approval) {
    return {
      ok: false as const,
      statusCode: 404,
      error: "Approval step not found",
    };
  }

  if (!approval.workflow_id) {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval step is not bound to a versioned workflow",
    };
  }

  if (approval.status !== "pending") {
    return {
      ok: false as const,
      statusCode: 409,
      error: "This approval step has already been decided",
    };
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("approval_workflows")
    .select("id, mode, version_id")
    .eq("id", approval.workflow_id)
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .eq("status", "active")
    .maybeSingle();

  if (workflowError) {
    return {
      ok: false as const,
      statusCode: 503,
      error: "Approval workflow could not be evaluated",
    };
  }

  if (workflow?.mode === "sequential") {
    const { data: pendingSteps, error: pendingError } = await supabase
      .from("approvals")
      .select("id")
      .eq("asset_id", assetId)
      .eq("version_id", versionId)
      .eq("workflow_id", workflow.id)
      .eq("status", "pending")
      .order("step_order", { ascending: true });

    if (pendingError) {
      return {
        ok: false as const,
        statusCode: 503,
        error: "Approval workflow could not be evaluated",
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

  const decidedAt = new Date().toISOString();
  const { data: updatedApproval, error: updateError } = await supabase
    .from("approvals")
    .update({
      status,
      decision_note: decisionNote || null,
      decided_at: decidedAt,
    })
    .eq("id", approvalId)
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .select()
    .single();

  if (updateError) {
    return {
      ok: false as const,
      statusCode: 503,
      error: "Approval decision could not be recorded",
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
    .eq("asset_id", assetId)
    .eq("version_id", versionId);

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
        .eq("id", approval.workflow_id)
        .eq("asset_id", assetId)
        .eq("version_id", versionId);
    }
  } else if (CHANGE_REQUEST_STATUSES.has(status)) {
    await supabase.from("assets").update({ status: "needs_changes" }).eq("id", assetId);
    assetStatus = "needs_changes";
  }

  // Queue managed-schema events before returning; legacy schemas retain their
  // direct-delivery compatibility path.
  const webhookEvent = allApproved
    ? "review.completed"
    : APPROVED_STATUSES.has(status)
      ? "asset.approved"
      : "asset.changes_requested";

  const webhookEmission = emitPrivilegedApprovalWebhookAfterAuthorization(
    supabase,
    assetId,
    webhookEvent,
    `approval:${approvalId}:${status}:${webhookEvent}`,
    decidedAt,
    {
      asset_id: assetId,
      asset_title: asset.data?.title,
      approval_id: approvalId,
      decision: status,
      decided_by: actor.name,
      all_approved: allApproved,
      asset_status: assetStatus,
    },
  );
  if (getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA) {
    await webhookEmission.catch((error) =>
      console.error("[webhooks] Queue authority error:", error),
    );
  } else {
    void webhookEmission.catch((error) =>
      console.error("[webhooks] Emission error:", error),
    );
  }

  return {
    ok: true as const,
    data: updatedApproval,
    assetStatus,
  };
}

/**
 * Emit webhook events to the owning team's active webhooks that subscribe to this event type.
 * Managed-schema callers await queue attempts; failures remain non-blocking to
 * the approval response until approval mutation and outbox insertion share one RPC.
 */
async function emitPrivilegedApprovalWebhookAfterAuthorization(
  authorizedClient: DataSupabaseClient,
  assetId: string,
  event: string,
  deliveryIntentKey: string,
  occurredAt: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Resolve authority from persisted relationships only: asset -> project -> team.
  const { data: asset, error: assetError } = await authorizedClient
    .from("assets")
    .select("project_id, projects(team_id, owner_id)")
    .eq("id", assetId)
    .single();

  if (assetError || !asset) return;

  const project = Array.isArray(asset.projects)
    ? asset.projects[0]
    : asset.projects;
  let teamId = project?.team_id ?? null;
  if (getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA) {
    if (!teamId) return;
  } else {
    teamId = null;
    const projectOwnerId = project?.owner_id;
    if (!projectOwnerId) return;
    const privilegedClient = getSupabase();
    const { data: owningTeams, error: teamError } = await privilegedClient
      .from("teams")
      .select("id")
      .eq("owner_id", projectOwnerId)
      .limit(2);
    if (teamError || owningTeams?.length !== 1 || !owningTeams[0]?.id) return;
    teamId = owningTeams[0].id;
  }

  await deliverPrivilegedApprovalWebhookAfterAuthorization(
    teamId,
    event,
    deliveryIntentKey,
    occurredAt,
    data,
  );
}

async function deliverPrivilegedApprovalWebhookAfterAuthorization(
  expectedTeamId: string,
  event: string,
  deliveryIntentKey: string,
  occurredAt: string,
  data: Record<string, unknown>,
): Promise<void> {
  const privilegedClient = getSupabase();

  // Find owning-team webhooks that subscribe to this event (empty events = all events).
  const { data: webhooks, error: webhooksError } = await privilegedClient
    .from("webhooks")
    .select("*")
    .eq("team_id", expectedTeamId)
    .eq("active", true);

  if (webhooksError) {
    throw new Error("Owning-team webhook endpoints could not be loaded");
  }
  if (!webhooks || webhooks.length === 0) return;

  const payload = {
    event,
    timestamp: occurredAt,
    data,
  };

  for (const webhook of webhooks) {
    // Check if webhook subscribes to this event
    const events = webhook.events as string[];
    if (events.length > 0 && !events.includes(event)) continue;

    const idempotencyKey = `${deliveryIntentKey}:${webhook.id}`.toLowerCase();
    if (getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA) {
      try {
        await enqueueWebhookOutboxDelivery(privilegedClient, {
          webhookId: webhook.id,
          expectedTeamId,
          event,
          idempotencyKey,
          payload,
        });
      } catch (error) {
        console.error("[webhooks] Endpoint queue error:", webhook.id, error);
      }
      continue;
    }

    try {
      const result = await deliverSignedWebhook({
        url: webhook.url,
        secret: recoverWebhookSecret(webhook as Record<string, unknown>),
        event,
        deliveryId: `legacy:${idempotencyKey}`,
        attempt: 1,
        payload,
      });

      // Log delivery
      await privilegedClient.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        event,
        payload,
        response_code: result.responseCode,
      });
    } catch {
      // Log failed delivery
      await privilegedClient.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        event,
        payload,
        response_code: 0,
      });
    }
  }
}
