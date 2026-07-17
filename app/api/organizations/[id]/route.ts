import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const ORGANIZATION_COLUMNS =
  "id, owner_id, name, industry, website, notes, created_at, updated_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as JsonObject)
      : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorResponse("Organization id is invalid", 400);
  }

  const { data, error } = await getSupabase()
    .from("organizations")
    .select(ORGANIZATION_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Organizations GET [id] error:", error.message);
    return errorResponse("Unable to load the organization", 500);
  }
  if (!data) return errorResponse("Organization not found", 404);
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorResponse("Organization id is invalid", 400);
  }
  const body = await readJsonObject(req);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }

  // Allowlisted fields only: id/owner_id/created_at from the body are ignored.
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 240
    ) {
      return errorResponse("name is invalid", 400);
    }
    updates.name = body.name.trim();
  }
  for (const [field, maxLength] of [
    ["industry", 240],
    ["website", 500],
    ["notes", 10_000],
  ] as const) {
    if (body[field] !== undefined) {
      if (
        body[field] !== null &&
        (typeof body[field] !== "string" || (body[field] as string).length > maxLength)
      ) {
        return errorResponse(`${field} is invalid`, 400);
      }
      updates[field] =
        typeof body[field] === "string"
          ? (body[field] as string).trim() || null
          : null;
    }
  }
  if (Object.keys(updates).length === 0) {
    return errorResponse("No supported fields to update", 400);
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from("organizations")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(ORGANIZATION_COLUMNS);

  if (error) {
    console.error("Organizations PATCH error:", error.message);
    return errorResponse("The organization could not be updated", 500);
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return errorResponse("Organization not found", 404);
  return NextResponse.json(row);
}
