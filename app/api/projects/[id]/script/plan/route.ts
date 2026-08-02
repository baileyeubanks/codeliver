import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { normalizeProjectScriptUuid } from "@/lib/preproduction/project-script";
import {
  classifyProjectScriptPlanDatabaseError,
  parseProjectScriptPlanProposal,
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

async function handleGet(
  _request: Request,
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
  if (!access.ok) {
    return json(
      { error: access.status === 404 ? "Project script plan not found" : access.error },
      access.status,
    );
  }

  let result;
  try {
    result = await supabase.rpc("get_project_script_plan_proposal", {
      p_project_id: projectId,
    });
  } catch {
    return unavailable();
  }
  if (result.error) {
    const mapped = classifyProjectScriptPlanDatabaseError(result.error);
    return json({ error: mapped.error }, mapped.status);
  }
  const proposal = parseProjectScriptPlanProposal(result.data);
  if (!proposal || proposal.projectId !== projectId) return unavailable();
  return json(proposal);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await handleGet(request, context);
  } catch {
    return unavailable();
  }
}
