import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  normalizeProductionUuid,
  parseProductionPlanSnapshot,
  parseProductionTaskMutation,
  parseProductionTaskMutationReceipt,
  PRODUCTION_TASK_MUTATION_MAX_BYTES,
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
    message.includes("preproduction_task_version_conflict") ||
    message.includes("preproduction_idempotency_conflict")
  ) {
    return json({ error: "This task changed elsewhere. The latest plan has been reloaded." }, 409);
  }
  if (message.includes("preproduction_forbidden")) return json({ error: "Forbidden" }, 403);
  if (message.includes("preproduction_not_found")) return json({ error: "Task not found" }, 404);
  if (
    message.includes("preproduction_invalid_transition") ||
    message.includes("invalid_preproduction")
  ) {
    return json({ error: "This task cannot move to the requested state" }, 422);
  }
  return json({ error: "Production task authority is temporarily unavailable" }, 503);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "Production task authority is temporarily unavailable" }, 503);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Request must use application/json" }, 415);
  }

  const routeParams = await params;
  let taskId: string;
  try {
    taskId = normalizeProductionUuid(routeParams.taskId, "task_id");
  } catch {
    return json({ error: "Task not found" }, 404);
  }

  const access = await getProjectAccess(routeParams.id, user.id, "viewer", supabase);
  if (!access.ok) return json({ error: access.error }, access.status);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > PRODUCTION_TASK_MUTATION_MAX_BYTES
  ) {
    return json({ error: "Task update is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > PRODUCTION_TASK_MUTATION_MAX_BYTES) {
    return json({ error: "Task update is too large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }

  let mutation;
  try {
    mutation = parseProductionTaskMutation(body);
  } catch (error) {
    if (error instanceof ProductionPlanValidationError) {
      return json(
        { error: error.message, code: error.code, ...(error.field ? { field: error.field } : {}) },
        400,
      );
    }
    return json({ error: "Task update is invalid" }, 400);
  }

  const snapshotResult = await supabase.rpc("get_project_production_plan", {
    p_project_id: routeParams.id,
  });
  if (snapshotResult.error) return databaseError(snapshotResult.error);
  const snapshot = parseProductionPlanSnapshot(snapshotResult.data);
  if (!snapshot) {
    return json({ error: "Production task authority returned an invalid snapshot" }, 503);
  }
  if (!snapshot.tasks.some((task) => task.id === taskId)) {
    return json({ error: "Task not found" }, 404);
  }

  const { data, error } = await supabase.rpc("mutate_production_task", {
    p_task_id: taskId,
    p_expected_version: mutation.expectedVersion,
    p_request_id: mutation.requestId,
    p_patch: mutation.patch,
  });
  if (error) return databaseError(error);
  const receipt = parseProductionTaskMutationReceipt(data);
  if (!receipt || receipt.projectId !== routeParams.id || receipt.taskId !== taskId) {
    return json({ error: "Production task authority returned no durable receipt" }, 503);
  }
  return json(receipt);
}
