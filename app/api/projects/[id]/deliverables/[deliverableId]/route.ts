import { getProjectAccess } from "@/lib/access-control";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const POSITIVE_APPROVAL_STATUSES = new Set(["approved", "approved_with_changes"]);

// A workflow is only concluded when no step is still open or blocking.
const UNCONCLUDED_APPROVAL_STATUSES = new Set([
  "pending",
  "changes_requested",
  "rejected",
]);

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

/**
 * PATCH `status:"delivered"` is the locked-delivery command (promise 6.4):
 * it requires producer access, a positive approval on every bound asset, and
 * stamps locked_at/locked_by/delivered_at/approval_id in one guarded write.
 * After the lock, the deliverable's version set is immutable (DB trigger) and
 * post-lock uploads/edits on its assets are rejected by the lock guard.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const auth = await authenticatedUser();
  if ("response" in auth) return auth.response;

  try {
    const { id, deliverableId } = await params;
    const projectAccess = await getProjectAccess(id, auth.user.id, "producer");
    if (!projectAccess.ok) return accessFailure(projectAccess);

    let body: Record<string, unknown> | null = null;
    try {
      const parsed = await req.json();
      body =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      body = null;
    }
    if (!body || body.status !== "delivered") {
      return apiError(
        "Only the delivered lock command is supported",
        "INVALID_REQUEST",
        400,
      );
    }

    const supabase = getSupabase();

    const { data: deliverable, error: loadError } = await supabase
      .from("deliverables")
      .select("id, project_id, name, status, locked_at")
      .eq("id", deliverableId)
      .eq("project_id", id)
      .maybeSingle();
    if (loadError) return backendUnavailable();
    if (!deliverable) {
      return apiError("Deliverable not found", "DELIVERABLE_NOT_FOUND", 404);
    }
    if (deliverable.locked_at) {
      return apiError("This delivery is already locked", "DELIVERY_LOCKED", 409);
    }

    const { data: items, error: itemsError } = await supabase
      .from("deliverable_items")
      .select("id, asset_id, version_id")
      .eq("deliverable_id", deliverableId);
    if (itemsError) return backendUnavailable();
    if (!items || items.length === 0) {
      return apiError(
        "A delivery with no bound versions cannot be locked",
        "DELIVERY_EMPTY",
        409,
      );
    }

    // 6.3 evidence: every bound asset needs a concluded, positive approval
    // workflow before the delivery can lock — a positive step alongside a
    // pending or blocking step does not count. Approvals are asset-scoped
    // (not version-scoped); the residual gap is documented in
    // docs/strategy/co-produce-lifecycle-contract.md.
    const assetIds = [...new Set(items.map((item) => item.asset_id))];
    const { data: approvals, error: approvalsError } = await supabase
      .from("approvals")
      .select("id, asset_id, status, decided_at")
      .in("asset_id", assetIds);
    if (approvalsError) return backendUnavailable();

    const approvalsByAsset = new Map<string, NonNullable<typeof approvals>>();
    for (const assetId of assetIds) approvalsByAsset.set(assetId, []);
    for (const approval of approvals ?? []) {
      approvalsByAsset.get(approval.asset_id as string)?.push(approval);
    }
    const inconclusive = assetIds.filter((assetId) => {
      const steps = approvalsByAsset.get(assetId) ?? [];
      return (
        !steps.some((step) =>
          POSITIVE_APPROVAL_STATUSES.has(step.status as string),
        ) ||
        steps.some((step) =>
          UNCONCLUDED_APPROVAL_STATUSES.has(step.status as string),
        )
      );
    });
    if (inconclusive.length > 0) {
      return apiError(
        "Every asset in a locked delivery requires a concluded, positive approval workflow",
        "DELIVERY_APPROVAL_REQUIRED",
        409,
      );
    }
    const positiveApprovals = (approvals ?? []).filter((approval) =>
      POSITIVE_APPROVAL_STATUSES.has(approval.status as string),
    );
    const evidenceApproval = [...positiveApprovals].sort((left, right) =>
      String(right.decided_at ?? "").localeCompare(String(left.decided_at ?? "")),
    )[0];

    const now = new Date().toISOString();
    const { data: locked, error: lockError } = await supabase
      .from("deliverables")
      .update({
        status: "delivered",
        locked_at: now,
        locked_by: auth.user.id,
        delivered_at: now,
        approval_id: evidenceApproval.id,
        updated_at: now,
      })
      .eq("id", deliverableId)
      .eq("project_id", id)
      .is("locked_at", null)
      .select()
      .maybeSingle();
    if (lockError) return backendUnavailable();
    if (!locked) {
      return apiError("This delivery is already locked", "DELIVERY_LOCKED", 409);
    }

    // Audit receipt mirrors the share-service pattern: no lock without a
    // durable activity_log event, so a failed append rolls the lock back.
    const { error: auditError } = await supabase
      .from("activity_log")
      .insert({
        project_id: id,
        asset_id: assetIds.length === 1 ? assetIds[0] : null,
        actor_id: auth.user.id,
        actor_name: auth.user.email ?? "Workspace member",
        action: "delivery_locked",
        details: {
          deliverable_id: deliverableId,
          deliverable_name: deliverable.name,
          approval_id: evidenceApproval.id,
          item_count: items.length,
          asset_ids: assetIds,
          version_ids: items.map((item) => item.version_id),
          locked_at: now,
        },
      })
      .select("id, action");
    if (auditError) {
      await supabase
        .from("deliverables")
        .update({
          status: deliverable.status,
          locked_at: null,
          locked_by: null,
          delivered_at: null,
          approval_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliverableId)
        .eq("locked_at", now);
      return backendUnavailable();
    }

    return apiJson({ ...locked, items });
  } catch {
    return backendUnavailable();
  }
}
