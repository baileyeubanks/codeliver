import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { normalizeProjectScriptUuid } from "@/lib/preproduction/project-script";
import {
  classifyProjectScriptPlanDatabaseError,
  parseProjectScriptPlanDraftCommand,
  parseProjectScriptPlanDraftReceipt,
  PROJECT_SCRIPT_PLAN_COMMAND_MAX_BYTES,
} from "@/lib/preproduction/script-plan";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function unavailable() {
  return json({ error: "Script production planning is temporarily unavailable" }, 503);
}

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let auth: Awaited<ReturnType<typeof requireStaffWithClient>>;
  try {
    auth = await requireStaffWithClient();
  } catch {
    return unavailable();
  }
  const { user, staff, supabase } = auth;
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  try {
    if (getSupabaseDataSchema() !== "co_production") return unavailable();
  } catch {
    return unavailable();
  }

  let projectId: string;
  try {
    projectId = normalizeProjectScriptUuid((await params).id, "projectId");
  } catch {
    return json({ error: "Project script plan not found" }, 404);
  }
  let access: Awaited<ReturnType<typeof getProjectAccess>>;
  try {
    access = await getProjectAccess(projectId, user.id, "producer", supabase);
  } catch {
    return unavailable();
  }
  if (!access.ok) return json({ error: access.error }, access.status);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Request must use application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > PROJECT_SCRIPT_PLAN_COMMAND_MAX_BYTES) {
    return json({ error: "Script production plan request is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > PROJECT_SCRIPT_PLAN_COMMAND_MAX_BYTES) {
    return json({ error: "Script production plan request is too large" }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }
  const command = parseProjectScriptPlanDraftCommand(body);
  if (!command) return json({ error: "Script production plan request is invalid" }, 422);

  let result;
  try {
    result = await supabase.rpc("generate_project_script_plan_draft", {
      p_project_id: projectId,
      p_expected_authority_version: command.expectedAuthorityVersion,
      p_expected_script_revision_id: command.expectedScriptRevisionId,
      p_request_id: command.requestId,
    });
  } catch {
    return unavailable();
  }
  if (result.error) {
    const mapped = classifyProjectScriptPlanDatabaseError(result.error);
    return json({ error: mapped.error }, mapped.status);
  }
  const receipt = parseProjectScriptPlanDraftReceipt(result.data);
  if (
    !receipt
    || receipt.projectId !== projectId
    || receipt.scriptRevisionId !== command.expectedScriptRevisionId
    || receipt.requestId !== command.requestId
  ) return unavailable();
  return json(receipt, receipt.replayed ? 200 : 201);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await handlePost(request, context);
  } catch {
    return unavailable();
  }
}
