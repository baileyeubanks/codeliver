import { isBackendUnavailableError } from "@/lib/api/backend";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";
import { createApprovalInvite } from "@/lib/review-invites";

export async function POST(req: Request) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth();
  } catch (error) {
    return isBackendUnavailableError(error)
      ? backendUnavailable()
      : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503);
  }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "INVALID_REQUEST", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Invalid request body", "INVALID_REQUEST", 400);
  }
  const { approval_id, asset_id } = body as { approval_id: string; asset_id: string };

  if (!approval_id || !asset_id) {
    return apiError("approval_id and asset_id are required", "INVALID_REQUEST", 400);
  }

  try {
    const supabase = getSupabase();
    const assetAccess = await getAssetAccess(
      asset_id,
      user.id,
      "producer",
      supabase,
    );
    if (!assetAccess.ok) {
      return apiError(
        assetAccess.status >= 500 ? "Approval service is unavailable" : "Approval resource not found",
        assetAccess.status >= 500 ? "BACKEND_UNAVAILABLE" : "APPROVAL_NOT_FOUND",
        assetAccess.status >= 500 ? 503 : 404,
      );
    }

  const { data: step, error: stepErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", approval_id)
    .eq("asset_id", asset_id)
    .single();

    if (stepErr) return backendUnavailable();
    if (!step) return apiError("Approval step not found", "APPROVAL_NOT_FOUND", 404);
    if (!step.assignee_email) return apiError("No assignee email", "INVALID_APPROVAL", 400);

  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("title, project_id")
    .eq("id", asset_id)
    .single();

    if (assetErr) return backendUnavailable();
    if (!asset) return apiError("Asset not found", "ASSET_NOT_FOUND", 404);

    const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name")
    .eq("id", asset.project_id)
    .single();

    if (projectError) return backendUnavailable();
    if (!project) return apiError("Project not found", "PROJECT_NOT_FOUND", 404);
    const reviewInvite = await createApprovalInvite({
    assetId: asset_id,
    reviewerEmail: step.assignee_email,
    createdBy: user.id,
  });
  const reviewUrl = `${getBaseUrl()}/review/${reviewInvite.token}`;

  const emailPayload = emailTemplates.approvalRequest(
    step.assignee_email,
    asset.title,
    project?.name ?? "Project",
    reviewUrl
  );

    await sendEmail({ to: step.assignee_email, ...emailPayload });

    const { error: activityError } = await supabase.from("activity_log").insert({
    project_id: asset.project_id,
    asset_id,
    actor_id: user.id,
    actor_name: user.email ?? "System",
    action: "approval_notification_sent",
    details: { assignee_email: step.assignee_email, role_label: step.role_label },
  });

    if (activityError) return backendUnavailable();
    return apiJson({ ok: true, sent_to: step.assignee_email });
  } catch {
    return backendUnavailable();
  }
}
