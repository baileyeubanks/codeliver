import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import { normalizeReviewerEmail } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";

interface StepInput {
  role_label: string;
  assignee_email: string;
  step_order: number;
}

interface WorkflowRecord {
  id: string;
  asset_id: string;
  mode: string;
  status: string;
}

const WORKFLOW_MODES = new Set(["sequential", "parallel"]);

async function requestObject(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
}

function validSteps(value: unknown): value is StepInput[] {
  return (
    Array.isArray(value)
    && value.length > 0
    && value.length <= 50
    && value.every((step) => (
      step
      && typeof step === "object"
      && typeof step.role_label === "string"
      && step.role_label.trim().length > 0
      && step.role_label.length <= 120
      && typeof step.assignee_email === "string"
      && step.assignee_email.length <= 320
      && Number.isSafeInteger(step.step_order)
      && step.step_order >= 0
    ))
  );
}

async function authenticatedUser() {
  try {
    const user = await requireAuth();
    return user
      ? { user, response: null }
      : { user: null, response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
  } catch (error) {
    return {
      user: null,
      response: isBackendUnavailableError(error)
        ? backendUnavailable()
        : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503),
    };
  }
}

async function getWorkflowMutationAccess(workflowId: string, userId: string) {
  try {
    const supabase = getSupabase();
    const { data: workflow, error } = await supabase
      .from("approval_workflows")
      .select("id, asset_id, mode, status")
      .eq("id", workflowId)
      .maybeSingle();

    if (error) {
      return { ok: false as const, status: 500, error: "Approval workflow is unavailable" };
    }
    if (!workflow) {
      return {
        ok: false as const,
        status: 404,
        error: "Approval workflow not found",
      };
    }

    const assetAccess = await getAssetAccess(
      workflow.asset_id,
      userId,
      "producer",
      supabase,
    );
    if (!assetAccess.ok) return assetAccess;

    return { ok: true as const, data: workflow as WorkflowRecord };
  } catch {
    return { ok: false as const, status: 500, error: "Approval workflow is unavailable" };
  }
}

export async function GET(req: Request) {
  const auth = await authenticatedUser();
  if (auth.response) return auth.response;
  const user = auth.user;

  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("asset_id");
  if (!assetId)
    return apiError("asset_id is required", "INVALID_REQUEST", 400);

  try {
    const supabase = getSupabase();
    const assetAccess = await getAssetAccess(assetId, user.id, "viewer", supabase);
    if (!assetAccess.ok) {
      return apiError("Approval resource is unavailable", assetAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND", assetAccess.status >= 500 ? 503 : 404);
    }

  const { data: workflow, error: wErr } = await supabase
    .from("approval_workflows")
    .select("*")
    .eq("asset_id", assetId)
    .eq("status", "active")
    .maybeSingle();

  if (wErr)
    return backendUnavailable();
  if (!workflow) return apiJson({ workflow: null });

  const { data: steps, error: sErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("workflow_id", workflow.id)
    .order("step_order", { ascending: true });

  if (sErr)
    return backendUnavailable();

    return apiJson({ workflow: { ...workflow, steps: steps ?? [] } });
  } catch {
    return backendUnavailable();
  }
}

export async function POST(req: Request) {
  const auth = await authenticatedUser();
  if (auth.response) return auth.response;
  const user = auth.user;

  const body = await requestObject(req);
  if (!body) return apiError("Invalid request body", "INVALID_REQUEST", 400);
  const asset_id = typeof body.asset_id === "string" ? body.asset_id : "";
  const mode = typeof body.mode === "string" ? body.mode : "";
  const steps = body.steps;

  if (!asset_id || !WORKFLOW_MODES.has(mode) || !validSteps(steps))
    return apiError("asset_id, mode, and steps are required", "INVALID_REQUEST", 400);

  try {
    const supabase = getSupabase();
    const assetAccess = await getAssetAccess(asset_id, user.id, "producer", supabase);
    if (!assetAccess.ok) {
      return apiError("Approval resource is unavailable", assetAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND", assetAccess.status >= 500 ? 503 : 404);
    }

  const { data: workflow, error: wErr } = await supabase
    .from("approval_workflows")
    .insert({
      asset_id,
      mode,
      created_by: user.id,
      status: "active",
    })
    .select()
    .single();

  if (wErr)
    return backendUnavailable();

  const stepRows = steps.map((s) => ({
    asset_id,
    workflow_id: workflow.id,
    step_order: s.step_order,
    role_label: s.role_label,
    assignee_email: normalizeReviewerEmail(s.assignee_email),
    status: "pending",
  }));

  const { data: inserted, error: sErr } = await supabase
    .from("approvals")
    .insert(stepRows)
    .select();

  if (sErr)
    return backendUnavailable();

    return apiJson(
      { workflow: { ...workflow, steps: inserted } },
      { status: 201 },
    );
  } catch {
    return backendUnavailable();
  }
}

export async function PUT(req: Request) {
  const auth = await authenticatedUser();
  if (auth.response) return auth.response;
  const user = auth.user;

  const body = await requestObject(req);
  if (!body) return apiError("Invalid request body", "INVALID_REQUEST", 400);
  const workflow_id = typeof body.workflow_id === "string" ? body.workflow_id : "";
  const mode = body.mode === undefined
    ? undefined
    : typeof body.mode === "string" && WORKFLOW_MODES.has(body.mode)
      ? body.mode
      : null;
  const steps = body.steps === undefined
    ? undefined
    : validSteps(body.steps)
      ? body.steps
      : null;

  if (!workflow_id || mode === null || steps === null)
    return apiError("workflow_id is required", "INVALID_REQUEST", 400);

  const workflowAccess = await getWorkflowMutationAccess(workflow_id, user.id);
  if (!workflowAccess.ok) {
    return apiError("Approval workflow is unavailable", workflowAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND", workflowAccess.status >= 500 ? 503 : 404);
  }

  try {
    const supabase = getSupabase();
    const workflow = workflowAccess.data;

  if (mode) {
    const { error } = await supabase
      .from("approval_workflows")
      .update({ mode })
      .eq("id", workflow_id)
      .eq("asset_id", workflow.asset_id);
    if (error)
      return backendUnavailable();
  }

  if (steps?.length) {
    // Delete existing pending steps and re-insert
    const { error: delErr } = await supabase
      .from("approvals")
      .delete()
      .eq("workflow_id", workflow_id)
      .eq("asset_id", workflow.asset_id)
      .eq("status", "pending");

    if (delErr)
      return backendUnavailable();

    // Get the asset_id from the workflow
    const wf = workflow;

    if (wf) {
      const stepRows = steps.map((s) => ({
        asset_id: wf.asset_id,
        workflow_id,
        step_order: s.step_order,
        role_label: s.role_label,
        assignee_email: normalizeReviewerEmail(s.assignee_email),
        status: "pending",
      }));

      const { error: insErr } = await supabase
        .from("approvals")
        .insert(stepRows);

      if (insErr)
        return backendUnavailable();
    }
  }

  // Return updated workflow with steps
  const { data: updated, error: updatedError } = await supabase
    .from("approval_workflows")
    .select("*")
    .eq("id", workflow_id)
    .eq("asset_id", workflow.asset_id)
    .single();

  if (updatedError) return backendUnavailable();

  const { data: updatedSteps, error: updatedStepsError } = await supabase
    .from("approvals")
    .select("*")
    .eq("workflow_id", workflow_id)
    .eq("asset_id", workflow.asset_id)
    .order("step_order", { ascending: true });

    if (updatedStepsError) return backendUnavailable();

    return apiJson({
      workflow: { ...updated, steps: updatedSteps ?? [] },
    });
  } catch {
    return backendUnavailable();
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticatedUser();
  if (auth.response) return auth.response;
  const user = auth.user;

  const body = await requestObject(req);
  if (!body) return apiError("Invalid request body", "INVALID_REQUEST", 400);
  const workflow_id = typeof body.workflow_id === "string" ? body.workflow_id : "";

  if (!workflow_id)
    return apiError("workflow_id is required", "INVALID_REQUEST", 400);

  const workflowAccess = await getWorkflowMutationAccess(workflow_id, user.id);
  if (!workflowAccess.ok) {
    return apiError("Approval workflow is unavailable", workflowAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND", workflowAccess.status >= 500 ? 503 : 404);
  }

  try {
    const supabase = getSupabase();

  // Cascade delete handles steps via FK
  const { error } = await supabase
    .from("approval_workflows")
    .delete()
    .eq("id", workflow_id)
    .eq("asset_id", workflowAccess.data.asset_id);

  if (error)
    return backendUnavailable();

    return apiJson({ ok: true });
  } catch {
    return backendUnavailable();
  }
}
