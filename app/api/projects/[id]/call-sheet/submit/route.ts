import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  classifyProjectCallSheetDatabaseError,
  normalizeProjectCallSheetUuid,
  parseProjectCallSheetSubmitReceipt,
  parseProjectCallSheetSubmitRequest,
  PROJECT_CALL_SHEET_COMMAND_MAX_BYTES,
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
    projectId = normalizeProjectCallSheetUuid((await params).id, "projectId");
  } catch {
    return json({ error: "Project call sheet not found" }, 404);
  }
  let access: Awaited<ReturnType<typeof getProjectAccess>>;
  try {
    access = await getProjectAccess(projectId, user.id, "editor", supabase);
  } catch {
    return unavailable();
  }
  if (!access.ok) return projectAccessError(access.status);
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  ) {
    return json({ error: "Request must use application/json" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > PROJECT_CALL_SHEET_COMMAND_MAX_BYTES
  ) {
    return json({ error: "Project call sheet request is too large" }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > PROJECT_CALL_SHEET_COMMAND_MAX_BYTES) {
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
    command = parseProjectCallSheetSubmitRequest(body);
  } catch (error) {
    return validationError(error);
  }

  let result;
  try {
    result = await supabase.rpc("submit_project_call_sheet_revision", {
      p_project_id: projectId,
      p_expected_authority_version: command.expectedAuthorityVersion,
      p_call_sheet_revision_id: command.revisionId,
      p_request_id: command.requestId,
      p_note: command.note,
    });
  } catch {
    return unavailable();
  }
  if (result.error) {
    const mapped = classifyProjectCallSheetDatabaseError(result.error);
    return json({ error: mapped.error }, mapped.status);
  }
  const receipt = parseProjectCallSheetSubmitReceipt(result.data);
  if (
    !receipt ||
    receipt.projectId !== projectId ||
    receipt.callSheetRevisionId !== command.revisionId ||
    receipt.authorityVersion !== command.expectedAuthorityVersion + 1 ||
    receipt.requestId !== command.requestId
  ) {
    return unavailable();
  }
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
