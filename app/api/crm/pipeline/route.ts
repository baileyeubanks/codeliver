import { NextRequest, NextResponse } from "next/server";
import { requireStaffWithClient } from "@/lib/auth/staff-client";
import { normalizeCrmUuid, PreProjectValidationError } from "@/lib/crm/preproject";
import { getSupabaseDataSchema } from "@/lib/data-authority";

const PIPELINE_STAGES = [
  "inquiry",
  "qualification",
  "discovery",
  "briefing",
  "proposal_requested",
  "proposal_sent",
  "won",
  "lost",
  "on_hold",
] as const;
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function parseCursor(value: string | null): { updatedAt: string; id: string } | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return null;
    const updatedAt = (decoded as { updatedAt?: unknown }).updatedAt;
    const id = normalizeCrmUuid((decoded as { id?: unknown }).id, "cursor.id");
    if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) return null;
    return { updatedAt: new Date(updatedAt).toISOString(), id };
  } catch {
    return null;
  }
}

function nextCursor(items: Array<Record<string, unknown>>) {
  const last = items.at(-1);
  if (!last || typeof last.updated_at !== "string" || typeof last.cursor_id !== "string") {
    return null;
  }
  return Buffer.from(
    JSON.stringify({ updatedAt: last.updated_at, id: last.cursor_id }),
    "utf8",
  ).toString("base64url");
}

export async function GET(request: NextRequest) {
  const { user, staff, supabase } = await requireStaffWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (getSupabaseDataSchema() !== "co_production") {
    return json({ error: "CRM authority is temporarily unavailable" }, 503);
  }

  let teamId: string;
  try {
    teamId = normalizeCrmUuid(request.nextUrl.searchParams.get("team_id"), "team_id");
  } catch (error) {
    const message = error instanceof PreProjectValidationError ? error.message : "team_id is invalid";
    return json({ error: message }, 400);
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return json({ error: "limit must be between 1 and 100" }, 400);
  }
  const stage = request.nextUrl.searchParams.get("stage");
  if (stage && !(PIPELINE_STAGES as readonly string[]).includes(stage)) {
    return json({ error: "stage is invalid" }, 400);
  }
  const cursorValue = request.nextUrl.searchParams.get("cursor");
  const cursor = parseCursor(cursorValue);
  if (cursorValue && !cursor) return json({ error: "cursor is invalid" }, 400);

  let query = supabase
    .from("preproject_pipeline")
    .select(
      "team_id, cursor_id, inquiry_id, inquiry_submitted_at, opportunity_id, opportunity_name, stage, probability_basis_points, expected_close_date, owner_id, authority_version, account_id, account_name, primary_contact_id, contact_name, brief_revision_id, brief_revision_number, brief_status, brief_content_hash, proposal_request_receipt_id, proposal_requested_at, activation_status, activation_authorization_receipt_id, activated_project_id, updated_at",
    )
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .order("cursor_id", { ascending: false })
    .limit(requestedLimit + 1);
  if (stage) query = query.eq("stage", stage);
  if (cursor) {
    query = query.or(
      `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},cursor_id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) return json({ error: "CRM pipeline is temporarily unavailable" }, 503);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = rows.length > requestedLimit;
  const items = rows.slice(0, requestedLimit);
  return json({ items, nextCursor: hasMore ? nextCursor(items) : null });
}
