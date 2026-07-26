import { requireAuth } from "@/lib/auth";
import { INQUIRY_STATUSES } from "@/lib/covideopro/record";
import { getSupabase } from "@/lib/supabase";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";

const INQUIRY_COLUMNS =
  "id, owner_id, project_id, organization_id, contact_id, source, summary, received_at, status, created_at, updated_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;
type Supabase = ReturnType<typeof getSupabase>;

function errorResponse(error: string, status: number) {
  return apiError(error, status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : status >= 500 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST", status);
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

async function findOwnedRow(
  table: "organizations" | "contacts",
  id: string,
  userId: string,
  supabase: Supabase,
) {
  const label = table === "organizations" ? "Organization" : "Contact";
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) return { ok: false as const, response: errorResponse(`Unable to load the ${label.toLowerCase()}`, 500) };
  if (!data) return { ok: false as const, response: errorResponse(`${label} not found`, 404) };
  return { ok: true as const };
}

function optionalUuid(body: JsonObject, field: string): { ok: true; value: string | null } | { ok: false } {
  const value = body[field];
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return { ok: false };
  return { ok: true, value };
}

export async function GET(request: Request) {
  try {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const status = new URL(request.url).searchParams.get("status");
  if (status !== null && !(INQUIRY_STATUSES as readonly string[]).includes(status)) {
    return errorResponse("status is invalid", 400);
  }

  let query = getSupabase()
    .from("inquiries")
    .select(INQUIRY_COLUMNS)
    .eq("owner_id", user.id);
  if (status !== null) {
    query = query.eq("status", status);
  }
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Inquiries GET error:", error.message);
    return errorResponse("Unable to load inquiries", 500);
  }
  return apiJson({ items: data ?? [] });
  } catch {
    return backendUnavailable();
  }
}

/**
 * Mirrors addInquiry in lib/demo/workspace-store.ts: optionally links existing
 * organization/contact records, and creates them inline from the free-text
 * names when no ids are given. Everything stays owner-scoped.
 */
export async function POST(request: Request) {
  try {
  const user = await requireAuth();
  if (!user) return errorResponse("Unauthorized", 401);

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }

  if (typeof body.summary !== "string" || !body.summary.trim() || body.summary.trim().length > 10_000) {
    return errorResponse("An inquiry needs a summary.", 400);
  }
  if (
    body.source !== undefined &&
    body.source !== null &&
    (typeof body.source !== "string" || body.source.trim().length > 240)
  ) {
    return errorResponse("source is invalid", 400);
  }
  if (
    body.organizationName !== undefined &&
    body.organizationName !== null &&
    (typeof body.organizationName !== "string" || body.organizationName.trim().length > 240)
  ) {
    return errorResponse("organizationName is invalid", 400);
  }
  if (
    body.contactName !== undefined &&
    body.contactName !== null &&
    (typeof body.contactName !== "string" || body.contactName.trim().length > 240)
  ) {
    return errorResponse("contactName is invalid", 400);
  }
  if (
    body.contactEmail !== undefined &&
    body.contactEmail !== null &&
    (typeof body.contactEmail !== "string" ||
      body.contactEmail.trim().length < 3 ||
      body.contactEmail.trim().length > 320)
  ) {
    return errorResponse("contactEmail is invalid", 400);
  }
  const organizationId = optionalUuid(body, "organizationId");
  if (!organizationId.ok) return errorResponse("organizationId is invalid", 400);
  const contactId = optionalUuid(body, "contactId");
  if (!contactId.ok) return errorResponse("contactId is invalid", 400);

  const supabase = getSupabase();
  let linkedOrganizationId = organizationId.value;
  let linkedContactId = contactId.value;

  // Existing records must belong to the caller; foreign ids are 404s with
  // zero writes.
  if (linkedOrganizationId) {
    const organization = await findOwnedRow("organizations", linkedOrganizationId, user.id, supabase);
    if (!organization.ok) return organization.response;
  }
  if (linkedContactId) {
    const contact = await findOwnedRow("contacts", linkedContactId, user.id, supabase);
    if (!contact.ok) return contact.response;
  }

  if (!linkedOrganizationId && typeof body.organizationName === "string" && body.organizationName.trim()) {
    const { data: organization, error } = await supabase
      .from("organizations")
      .insert({ owner_id: user.id, name: body.organizationName.trim() })
      .select("id")
      .single();
    if (error || !organization) {
      console.error("Inquiries POST organization error:", error?.message);
      return errorResponse("The inquiry could not be created", 500);
    }
    linkedOrganizationId = organization.id as string;
  }

  if (!linkedContactId && typeof body.contactEmail === "string" && body.contactEmail.trim()) {
    const email = body.contactEmail.trim();
    const { data: contact, error } = await supabase
      .from("contacts")
      .insert({
        owner_id: user.id,
        organization_id: linkedOrganizationId,
        name: typeof body.contactName === "string" && body.contactName.trim()
          ? body.contactName.trim()
          : email,
        email,
        is_primary: true,
      })
      .select("id")
      .single();
    if (error || !contact) {
      console.error("Inquiries POST contact error:", error?.message);
      return errorResponse("The inquiry could not be created", 500);
    }
    linkedContactId = contact.id as string;
  }

  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      owner_id: user.id,
      project_id: null,
      organization_id: linkedOrganizationId,
      contact_id: linkedContactId,
      source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "direct",
      summary: body.summary.trim(),
      status: "new",
    })
    .select(INQUIRY_COLUMNS)
    .single();

  if (error) {
    console.error("Inquiries POST error:", error.message);
    return errorResponse("The inquiry could not be created", 500);
  }
  return apiJson(data, { status: 201 });
  } catch {
    return backendUnavailable();
  }
}
