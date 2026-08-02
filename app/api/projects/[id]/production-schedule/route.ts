import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  classifyProjectProductionScheduleDatabaseError,
  normalizeProjectProductionScheduleUuid,
  parseProjectProductionScheduleAppendReceipt,
  parseProjectProductionScheduleAppendRequest,
  parseProjectProductionScheduleSnapshot,
  PROJECT_PRODUCTION_SCHEDULE_APPEND_MAX_BYTES,
  ProjectProductionScheduleValidationError,
} from "@/lib/preproduction/production-schedule";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function unavailable() {
  return json(
    { error: "Project production scheduling is temporarily unavailable" },
    503,
  );
}

function projectAccessError(status: number) {
  if (status === 403) return json({ error: "Forbidden" }, 403);
  if (status === 404) {
    return json({ error: "Project production schedule not found" }, 404);
  }
  return unavailable();
}

function databaseError(error: { code?: string; message?: string } | null) {
  const mapped = classifyProjectProductionScheduleDatabaseError(error);
  return json({ error: mapped.error }, mapped.status);
}

function validationError(error: unknown) {
  if (error instanceof ProjectProductionScheduleValidationError) {
    return json(
      {
        error: error.message,
        code: error.code,
        ...(error.field ? { field: error.field } : {}),
      },
      422,
    );
  }
  return json(
    { error: "The project production schedule request is invalid" },
    422,
  );
}

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";
}

async function projectIdFrom(params: Promise<{ id: string }>) {
  try {
    return normalizeProjectProductionScheduleUuid(
      (await params).id,
      "projectId",
    );
  } catch {
    return null;
  }
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

  const projectId = await projectIdFrom(params);
  if (!projectId) {
    return json({ error: "Project production schedule not found" }, 404);
  }
  let access: Awaited<ReturnType<typeof getProjectAccess>>;
  try {
    access = await getProjectAccess(projectId, user.id, "editor", supabase);
  } catch {
    return unavailable();
  }
  if (!access.ok) return projectAccessError(access.status);

  let result;
  try {
    result = await supabase.rpc("get_project_production_schedule", {
      p_project_id: projectId,
    });
  } catch {
    return unavailable();
  }
  if (result.error) return databaseError(result.error);
  const snapshot = parseProjectProductionScheduleSnapshot(result.data);
  if (!snapshot || snapshot.projectId !== projectId) return unavailable();
  return json(snapshot);
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

  const projectId = await projectIdFrom(params);
  if (!projectId) {
    return json({ error: "Project production schedule not found" }, 404);
  }
  let access: Awaited<ReturnType<typeof getProjectAccess>>;
  try {
    access = await getProjectAccess(projectId, user.id, "editor", supabase);
  } catch {
    return unavailable();
  }
  if (!access.ok) return projectAccessError(access.status);
  if (!isJsonRequest(request)) {
    return json({ error: "Request must use application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > PROJECT_PRODUCTION_SCHEDULE_APPEND_MAX_BYTES
  ) {
    return json({ error: "Project production schedule request is too large" }, 413);
  }
  const raw = await request.text();
  if (
    Buffer.byteLength(raw, "utf8") >
    PROJECT_PRODUCTION_SCHEDULE_APPEND_MAX_BYTES
  ) {
    return json({ error: "Project production schedule request is too large" }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }
  let command;
  try {
    command = parseProjectProductionScheduleAppendRequest(body);
  } catch (error) {
    return validationError(error);
  }

  let result;
  try {
    result = await supabase.rpc("append_project_production_schedule_revision", {
      p_project_id: projectId,
      p_expected_authority_version: command.expectedAuthorityVersion,
      p_base_revision_id: command.baseRevisionId,
      p_request_id: command.requestId,
      p_change_summary: command.changeSummary,
      p_content: command.content,
    });
  } catch {
    return unavailable();
  }
  if (result.error) return databaseError(result.error);
  const receipt = parseProjectProductionScheduleAppendReceipt(result.data);
  if (
    !receipt ||
    receipt.projectId !== projectId ||
    receipt.baseRevisionId !== command.baseRevisionId ||
    receipt.authorityVersion !== command.expectedAuthorityVersion + 1 ||
    receipt.requestId !== command.requestId
  ) {
    return unavailable();
  }
  return json(receipt, receipt.replayed ? 200 : 201);
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
