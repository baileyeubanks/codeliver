import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import { normalizeReviewerEmail } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

interface StepInput {
  role_label: string;
  assignee_email: string;
  step_order: number;
}

const WORKFLOW_MODES = new Set(["sequential", "parallel"]);

async function requestObject(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
}

function validSteps(value: unknown): value is StepInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false;
  const orders = new Set<number>();
  const recipients = new Set<string>();
  return value.every((step) => {
    if (!step || typeof step !== "object") return false;
    const candidate = step as Record<string, unknown>;
    const role = typeof candidate.role_label === "string" ? candidate.role_label.trim() : "";
    const email = typeof candidate.assignee_email === "string"
      ? normalizeReviewerEmail(candidate.assignee_email)
      : null;
    const order = candidate.step_order;
    if (!role || role.length > 120 || !email || !email.includes("@") || email.length > 320
      || !Number.isSafeInteger(order) || (order as number) < 1 || (order as number) > 100
      || orders.has(order as number) || recipients.has(email)) return false;
    orders.add(order as number);
    recipients.add(email);
    return true;
  });
}

function normalizedSteps(steps: StepInput[]) {
  return steps.map((step) => ({
    step_order: step.step_order,
    role_label: step.role_label.trim(),
    assignee_email: normalizeReviewerEmail(step.assignee_email),
  }));
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

function workflowFailure(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("CVP_WORKFLOW_INPUT_INVALID") || message.includes("CVP_WORKFLOW_STEPS_INVALID"))
    return apiError("Approval workflow input is invalid", "INVALID_REQUEST", 400);
  if (message.includes("CVP_WORKFLOW_VERSION_NOT_FOUND"))
    return apiError("Approval version not found", "APPROVAL_VERSION_NOT_FOUND", 404);
  if (message.includes("CVP_WORKFLOW_VERSION_NOT_CURRENT"))
    return apiError("Approval workflows can only be created for the current version", "APPROVAL_VERSION_STALE", 409);
  if (message.includes("CVP_WORKFLOW_EXISTS"))
    return apiError("A different approval workflow already exists for this version", "APPROVAL_WORKFLOW_EXISTS", 409);
  return backendUnavailable();
}

export async function GET(req: Request) {
  const auth = await authenticatedUser();
  if (auth.response) return auth.response;
  const user = auth.user;
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("asset_id");
  const versionId = searchParams.get("version_id");
  if (!assetId || !versionId)
    return apiError("asset_id and version_id are required", "INVALID_REQUEST", 400);

  try {
    const supabase = getSupabase();
    const assetAccess = await getAssetAccess(assetId, user.id, "viewer", supabase);
    if (!assetAccess.ok)
      return apiError("Approval resource is unavailable", assetAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND", assetAccess.status >= 500 ? 503 : 404);
    const versionLookup = await resolveAssetVersion({ assetId, versionId, client: supabase });
    if (!versionLookup.ok)
      return apiError(versionLookup.error, "APPROVAL_VERSION_NOT_FOUND", versionLookup.status);
    const { data: workflow, error } = await supabase
      .from("approval_workflows")
      .select("*")
      .eq("asset_id", assetId)
      .eq("version_id", versionLookup.version.id)
      .maybeSingle();
    if (error) return backendUnavailable();
    if (!workflow) return apiJson({ workflow: null });
    const steps = await supabase
      .from("approvals")
      .select("*")
      .eq("workflow_id", workflow.id)
      .eq("asset_id", assetId)
      .eq("version_id", versionLookup.version.id)
      .order("step_order", { ascending: true });
    if (steps.error) return backendUnavailable();
    return apiJson({ workflow: { ...workflow, steps: steps.data ?? [] } });
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
  const assetId = typeof body.asset_id === "string" ? body.asset_id : "";
  const versionId = typeof body.version_id === "string" ? body.version_id : "";
  const mode = typeof body.mode === "string" ? body.mode : "";
  const steps = body.steps;
  if (!assetId || !versionId || !WORKFLOW_MODES.has(mode) || !validSteps(steps))
    return apiError("asset_id, version_id, mode, and valid unique steps are required", "INVALID_REQUEST", 400);

  try {
    const supabase = getSupabase();
    const assetAccess = await getAssetAccess(assetId, user.id, "producer", supabase);
    if (!assetAccess.ok)
      return apiError("Approval resource is unavailable", assetAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND", assetAccess.status >= 500 ? 503 : 404);
    const versionLookup = await resolveAssetVersion({ assetId, versionId, client: supabase });
    if (!versionLookup.ok)
      return apiError(versionLookup.error, "APPROVAL_VERSION_NOT_FOUND", versionLookup.status);
    const { data, error } = await supabase.rpc("create_version_approval_workflow", {
      p_asset_id: assetId,
      p_version_id: versionLookup.version.id,
      p_mode: mode,
      p_steps: normalizedSteps(steps),
      p_actor_id: user.id,
    });
    if (error) return workflowFailure(error);
    if (!data || typeof data !== "object" || Array.isArray(data)
      || !("workflow" in data) || typeof data.workflow !== "object" || !data.workflow)
      return backendUnavailable();
    return apiJson(
      { workflow: data.workflow },
      { status: "created" in data && data.created === true ? 201 : 200 },
    );
  } catch {
    return backendUnavailable();
  }
}

export async function PUT() {
  return apiError("Version-bound approval rounds are immutable", "METHOD_NOT_ALLOWED", 405);
}

export async function DELETE() {
  return apiError("Version-bound approval rounds are immutable", "METHOD_NOT_ALLOWED", 405);
}
