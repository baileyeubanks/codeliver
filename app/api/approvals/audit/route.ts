import type { NextResponse } from "next/server";

import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import { getSupabase } from "@/lib/supabase";
import type { ApprovalAuditEntry } from "@/lib/approvals/approval-machine";

interface ApprovalHistoryRow {
  id: string;
  approval_id: string;
  new_status: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
  approvals: {
    id: string;
    step_order: number;
    role_label: string;
  } | null;
}

/**
 * GET /api/approvals/audit?asset_id=… — Documenso-style audit trail for an
 * asset's approval workflow: who decided what, on which step, and when.
 * Sourced exclusively from persisted approval_history rows; actor name/email
 * and user agent are null/omitted because the record does not carry them.
 * Fails closed with structured errors when the backend is unavailable.
 */
export async function GET(req: Request): Promise<NextResponse> {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    return isBackendUnavailableError(error)
      ? backendUnavailable()
      : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503);
  }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("asset_id");
  if (!assetId) return apiError("asset_id is required", "INVALID_REQUEST", 400);

  try {
    const supabase = getSupabase();
    const assetAccess = await getAssetAccess(assetId, user.id, "viewer", supabase);
    if (!assetAccess.ok) {
      return apiError(
        "Approval resource is unavailable",
        assetAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND",
        assetAccess.status >= 500 ? 503 : 404,
      );
    }

    const { data, error } = await supabase
      .from("approval_history")
      .select("id, approval_id, new_status, changed_by, note, created_at, approvals!inner(id, asset_id, step_order, role_label)")
      .eq("approvals.asset_id", assetId)
      .order("created_at", { ascending: true });

    if (error) return backendUnavailable();

    const entries: ApprovalAuditEntry[] = ((data ?? []) as unknown as ApprovalHistoryRow[])
      .filter((row) => row.approvals)
      .map((row) => ({
        step_id: row.approval_id,
        step_order: row.approvals?.step_order ?? 0,
        role_label: row.approvals?.role_label ?? "",
        actor: {
          id: row.changed_by,
          name: null,
          email: null,
        },
        action: row.new_status as ApprovalAuditEntry["action"],
        note: row.note,
        decided_at: row.created_at,
      }));

    return apiJson({ asset_id: assetId, entries });
  } catch {
    return backendUnavailable();
  }
}
