import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const CONTACT_COLUMNS =
  "id, organization_id, owner_id, name, email, role, is_primary, created_at, updated_at";
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
    return errorResponse("Contact id is invalid", 400);
  }

  const { data, error } = await getSupabase()
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Contacts GET [id] error:", error.message);
    return errorResponse("Unable to load the contact", 500);
  }
  if (!data) return errorResponse("Contact not found", 404);
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorResponse("Contact id is invalid", 400);
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
  if (body.email !== undefined) {
    if (
      typeof body.email !== "string" ||
      body.email.trim().length < 3 ||
      body.email.trim().length > 320
    ) {
      return errorResponse("email is invalid", 400);
    }
    updates.email = body.email.trim();
  }
  if (body.role !== undefined) {
    if (
      body.role !== null &&
      (typeof body.role !== "string" || body.role.length > 240)
    ) {
      return errorResponse("role is invalid", 400);
    }
    updates.role = typeof body.role === "string" ? body.role.trim() || null : null;
  }
  if (body.is_primary !== undefined) {
    if (typeof body.is_primary !== "boolean") {
      return errorResponse("is_primary is invalid", 400);
    }
    updates.is_primary = body.is_primary;
  }

  let organizationChecked = false;
  let organizationId: string | null = null;
  if (body.organization_id !== undefined) {
    if (body.organization_id === null) {
      organizationId = null;
      organizationChecked = true;
    } else if (typeof body.organization_id === "string" && UUID_PATTERN.test(body.organization_id)) {
      organizationId = body.organization_id;
      organizationChecked = true;
    } else {
      return errorResponse("organization_id is invalid", 400);
    }
  }

  if (Object.keys(updates).length === 0 && !organizationChecked) {
    return errorResponse("No supported fields to update", 400);
  }

  const supabase = getSupabase();
  if (organizationChecked && organizationId) {
    // Reassigning a contact requires owning the destination organization; a
    // foreign one is a 404 with zero writes.
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (organizationError) {
      console.error("Contacts PATCH organization check error:", organizationError.message);
      return errorResponse("The contact could not be updated", 500);
    }
    if (!organization) return errorResponse("Organization not found", 404);
  }
  if (organizationChecked) {
    updates.organization_id = organizationId;
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(CONTACT_COLUMNS);

  if (error) {
    console.error("Contacts PATCH error:", error.message);
    return errorResponse("The contact could not be updated", 500);
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return errorResponse("Contact not found", 404);
  return NextResponse.json(row);
}
