import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const CONTACT_COLUMNS =
  "id, organization_id, owner_id, name, email, role, is_primary, created_at, updated_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;
type Supabase = ReturnType<typeof getSupabase>;

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

/**
 * A contact may only attach to an organization the caller owns. A missing or
 * foreign organization is indistinguishable from one that does not exist.
 */
async function findOwnedOrganization(organizationId: string, userId: string, supabase: Supabase) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) return { ok: false as const, response: errorResponse("Unable to load the organization", 500) };
  if (!data) return { ok: false as const, response: errorResponse("Organization not found", 404) };
  return { ok: true as const };
}

export async function GET(request: Request) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const organizationId = new URL(request.url).searchParams.get("organization_id");
  const supabase = getSupabase();
  if (organizationId !== null) {
    if (!UUID_PATTERN.test(organizationId)) {
      return errorResponse("organization_id is invalid", 400);
    }
    const organization = await findOwnedOrganization(organizationId, user.id, supabase);
    if (!organization.ok) return organization.response;
  }

  let query = supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("owner_id", user.id);
  if (organizationId !== null) {
    query = query.eq("organization_id", organizationId);
  }
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Contacts GET error:", error.message);
    return errorResponse("Unable to load contacts", 500);
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }

  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 240
  ) {
    return errorResponse("Contact name is required", 400);
  }
  if (
    typeof body.email !== "string" ||
    body.email.trim().length < 3 ||
    body.email.trim().length > 320
  ) {
    return errorResponse("Contact email is invalid", 400);
  }
  if (
    body.role !== undefined &&
    body.role !== null &&
    (typeof body.role !== "string" || body.role.length > 240)
  ) {
    return errorResponse("role is invalid", 400);
  }
  if (body.is_primary !== undefined && typeof body.is_primary !== "boolean") {
    return errorResponse("is_primary is invalid", 400);
  }

  let organizationId: string | null = null;
  if (body.organization_id !== undefined && body.organization_id !== null) {
    if (typeof body.organization_id !== "string" || !UUID_PATTERN.test(body.organization_id)) {
      return errorResponse("organization_id is invalid", 400);
    }
    organizationId = body.organization_id;
  }

  const supabase = getSupabase();
  if (organizationId) {
    // Verify ownership before any write: a foreign organization_id is a 404
    // with zero mutations.
    const organization = await findOwnedOrganization(organizationId, user.id, supabase);
    if (!organization.ok) return organization.response;
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      owner_id: user.id,
      organization_id: organizationId,
      name: body.name.trim(),
      email: body.email.trim(),
      role: typeof body.role === "string" ? body.role.trim() || null : null,
      is_primary: body.is_primary === true,
    })
    .select(CONTACT_COLUMNS)
    .single();

  if (error) {
    console.error("Contacts POST error:", error.message);
    return errorResponse("The contact could not be created", 500);
  }
  return NextResponse.json(data, { status: 201 });
}
