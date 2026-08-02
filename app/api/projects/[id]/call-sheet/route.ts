import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  classifyProjectCallSheetDatabaseError,
  normalizeProjectCallSheetScheduleDayId,
  normalizeProjectCallSheetUuid,
  parseProjectCallSheetAppendReceipt,
  parseProjectCallSheetAppendRequest,
  parseProjectCallSheetSnapshot,
  PROJECT_CALL_SHEET_APPEND_MAX_BYTES,
  ProjectCallSheetValidationError,
} from "@/lib/preproduction/call-sheet";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function unavailable() {
  return json({ error: "Project call sheets are temporarily unavailable" }, 503);
}

function projectAccessError(status: number) {
  if (status === 403) return json({ error: "Forbidden" }, 403);
  if (status === 404) {
    return json({ error: "Project call sheet not found" }, 404);
  }
  return unavailable();
}

function databaseError(error: { code?: string; message?: string } | null) {
  const mapped = classifyProjectCallSheetDatabaseError(error);
  return json({ error: mapped.error }, mapped.status);
}

function validationError(error: unknown) {
  if (error instanceof ProjectCallSheetValidationError) {
    return json(
      {
        error: error.message,
        code: error.code,
        ...(error.field ? { field: error.field } : {}),
      },
      422,
    );
  }
  return json({ error: "The project call sheet request is invalid" }, 422);
}

function isJsonRequest(request: Request) {
  return (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() === "application/json"
  );
}

async function projectIdFrom(params: Promise<{ id: string }>) {
  try {
    return normalizeProjectCallSheetUuid((await params).id, "projectId");
  } catch {
    return null;
  }
}

function scheduleDayIdFrom(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const keys = [...searchParams.keys()];
    if (keys.length === 0) {
      return { ok: true as const, scheduleDayId: null };
    }
    if (
      keys.length !== 1 ||
      keys[0] !== "dayId" ||
      searchParams.getAll("dayId").length !== 1
    ) {
      return { ok: false as const, scheduleDayId: null };
    }
    return {
      ok: true as const,
      scheduleDayId: normalizeProjectCallSheetScheduleDayId(
        searchParams.get("dayId"),
        "dayId",
      ),
    };
  } catch {
    return { ok: false as const, scheduleDayId: null };
  }
}

async function handleGet(
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
  const daySelection = scheduleDayIdFrom(request);
  if (!projectId || !daySelection.ok) {
    return json({ error: "Project call sheet not found" }, 404);
  }
  const scheduleDayId = daySelection.scheduleDayId;
  let access: Awaited<ReturnType<typeof getProjectAccess>>;
  try {
    access = await getProjectAccess(projectId, user.id, "editor", supabase);
  } catch {
    return unavailable();
  }
  if (!access.ok) return projectAccessError(access.status);

  let result;
  try {
    result = await supabase.rpc("get_project_call_sheet", {
      p_project_id: projectId,
      p_schedule_day_id: scheduleDayId,
    });
  } catch {
    return unavailable();
  }
  if (result.error) return databaseError(result.error);
  const snapshot = parseProjectCallSheetSnapshot(result.data);
  if (
    !snapshot ||
    snapshot.projectId !== projectId ||
    (scheduleDayId !== null &&
      snapshot.selectedScheduleDayId !== scheduleDayId)
  ) {
    return unavailable();
  }
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
    return json({ error: "Project call sheet not found" }, 404);
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
    declaredLength > PROJECT_CALL_SHEET_APPEND_MAX_BYTES
  ) {
    return json({ error: "Project call sheet request is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > PROJECT_CALL_SHEET_APPEND_MAX_BYTES) {
    return json({ error: "Project call sheet request is too large" }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON" }, 400);
  }
  let command;
  try {
    command = parseProjectCallSheetAppendRequest(body);
  } catch (error) {
    return validationError(error);
  }

  let result;
  try {
    result = await supabase.rpc("append_project_call_sheet_revision", {
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
  const receipt = parseProjectCallSheetAppendReceipt(result.data);
  if (
    !receipt ||
    receipt.projectId !== projectId ||
    receipt.baseRevisionId !== command.baseRevisionId ||
    receipt.source.scheduleDayId !== command.content.scheduleDayId ||
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
