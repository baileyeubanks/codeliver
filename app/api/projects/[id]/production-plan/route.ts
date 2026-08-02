import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  parseProductionPlanInitialization,
  parseProductionPlanReceipt,
  parseProductionPlanSnapshot,
  PRODUCTION_PLAN_MAX_BYTES,
  ProductionPlanValidationError,
} from "@/lib/preproduction/production-plan";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function databaseError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (
    message.includes("preproduction_plan_version_conflict") ||
    message.includes("preproduction_idempotency_conflict")
  ) {
    return json({ error: "The production plan changed elsewhere. Reload before trying again." }, 409);
  }
  if (message.includes("preproduction_forbidden")) return json({ error: "Forbidden" }, 403);
  if (message.includes("preproduction_not_found")) return json({ error: "Project not found" }, 404);
  if (message.includes("production_plan_draft_")) {
    return json(
      {
        error:
          "An approved script must be converted through its governed production plan handoff.",
      },
      409,
    );
  }
  if (
    message.includes("preproduction_dependency_cycle") ||
    message.includes("invalid_preproduction")
  ) {
    return json({ error: "The production plan is invalid" }, 422);
  }
  return json({ error: "Production planning is temporarily unavailable" }, 503);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "Production planning is temporarily unavailable" }, 503);
  }

  const { id } = await params;
  const access = await getProjectAccess(id, user.id, "viewer", supabase);
  if (!access.ok) return json({ error: access.error }, access.status);

  const { data, error } = await supabase.rpc("get_project_production_plan", {
    p_project_id: id,
  });
  if (error) return databaseError(error);
  const snapshot = parseProductionPlanSnapshot(data);
  if (!snapshot) {
    return json({ error: "Production planning returned an invalid snapshot" }, 503);
  }
  return json(snapshot);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "Production planning is temporarily unavailable" }, 503);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Request must use application/json" }, 415);
  }

  const { id } = await params;
  const access = await getProjectAccess(id, user.id, "producer", supabase);
  if (!access.ok) return json({ error: access.error }, access.status);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > PRODUCTION_PLAN_MAX_BYTES) {
    return json({ error: "Production plan is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > PRODUCTION_PLAN_MAX_BYTES) {
    return json({ error: "Production plan is too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }

  let plan;
  try {
    plan = parseProductionPlanInitialization(body);
  } catch (error) {
    if (error instanceof ProductionPlanValidationError) {
      return json(
        { error: error.message, code: error.code, ...(error.field ? { field: error.field } : {}) },
        400,
      );
    }
    return json({ error: "Production plan is invalid" }, 400);
  }

  const { data, error } = await supabase.rpc("initialize_production_plan", {
    p_project_id: id,
    p_expected_plan_revision: plan.expectedPlanRevision,
    p_request_id: plan.requestId,
    p_plan: {
      title: plan.title,
      summary: plan.summary,
      tasks: plan.tasks,
      sourceDraftId: null,
      approvalNote: null,
    },
  });
  if (error) return databaseError(error);
  const receipt = parseProductionPlanReceipt(data);
  if (!receipt || receipt.projectId !== id) {
    return json({ error: "Production planning returned no durable receipt" }, 503);
  }
  return json(receipt, receipt.replayed ? 200 : 201);
}
