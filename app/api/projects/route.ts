import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { requireTeamRole } from "@/lib/middleware/rbac";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROJECT_LIST_COLUMNS =
  "id, team_id, owner_id, name, description, status, thumbnail_url, created_at, updated_at, assets(id, status)";
const PROJECT_LIST_COLUMNS_WITH_RECORD =
  "id, team_id, owner_id, name, description, status, stage, organization_id, primary_contact_id, thumbnail_url, created_at, updated_at, assets(id, status)";
const MAX_PROJECT_BODY_BYTES = 100_000;

async function readProjectBody(request: Request): Promise<
  | { body: Record<string, unknown> }
  | { response: ReturnType<typeof apiError> }
> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PROJECT_BODY_BYTES)
  ) {
    return {
      response: apiError("Project body is too large", "INVALID_REQUEST", 400),
    };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      response: apiError("Project body must be an object", "INVALID_REQUEST", 400),
    };
  }
  return { body };
}

export async function GET() {
  let auth: Awaited<ReturnType<typeof requireAuthWithClient>>;
  try {
    auth = await requireAuthWithClient();
  } catch {
    return backendUnavailable();
  }
  const { user, supabase } = auth;
  if (!user) {
    return apiError("Authentication required", "AUTH_REQUIRED", 401);
  }

  try {
    const isolated = getSupabaseDataSchema() === "co_production";
    let query = supabase
      .from("projects")
      .select(isolated ? PROJECT_LIST_COLUMNS_WITH_RECORD : PROJECT_LIST_COLUMNS);
    if (!isolated) {
      query = query.eq("owner_id", user.id);
    }
    const { data, error } = await query
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Projects GET failed");
      return backendUnavailable();
    }
    return apiJson({ items: data ?? [] });
  } catch {
    console.error("Projects GET failed");
    return backendUnavailable();
  }
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireAuthWithClient>>;
  try {
    auth = await requireAuthWithClient();
  } catch {
    return backendUnavailable();
  }
  const { user, supabase } = auth;
  if (!user) {
    return apiError("Authentication required", "AUTH_REQUIRED", 401);
  }

  try {
    const parsed = await readProjectBody(req);
    if ("response" in parsed) return parsed.response;
    const { body } = parsed;

    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 240) {
      return apiError("Project name is required", "INVALID_REQUEST", 400);
    }
    if (
      body.description !== undefined &&
      body.description !== null &&
      (typeof body.description !== "string" || body.description.length > 10_000)
    ) {
      return apiError("Project description is invalid", "INVALID_REQUEST", 400);
    }
    const isolated = getSupabaseDataSchema() === "co_production";
    const teamId = isolated && typeof body.team_id === "string" ? body.team_id : null;
    if (isolated && body.team_id !== undefined && !teamId) {
      return apiError("team_id is invalid", "INVALID_REQUEST", 400);
    }
    if (teamId) {
      const teamAccess = await requireTeamRole(teamId, user.id, "admin");
      if (teamAccess.status === 503) {
        return backendUnavailable();
      }
      if (!teamAccess.allowed) {
        return apiError("Forbidden", "FORBIDDEN", 403);
      }
    }

    // Operating-record links live only in the co_production schema. The caller
    // may attach their own organization/contact at creation; anything else is
    // indistinguishable from a record that does not exist (404). `stage` is
    // never accepted from the body — it moves only through transition
    // validators (see the inquiry convert route).
    let organizationId: string | null = null;
    let primaryContactId: string | null = null;
    if (isolated) {
      if (body.organization_id !== undefined && body.organization_id !== null) {
        if (typeof body.organization_id !== "string" || !UUID_PATTERN.test(body.organization_id)) {
          return apiError("organization_id is invalid", "INVALID_REQUEST", 400);
        }
        organizationId = body.organization_id;
      }
      if (body.primary_contact_id !== undefined && body.primary_contact_id !== null) {
        if (typeof body.primary_contact_id !== "string" || !UUID_PATTERN.test(body.primary_contact_id)) {
          return apiError("primary_contact_id is invalid", "INVALID_REQUEST", 400);
        }
        primaryContactId = body.primary_contact_id;
      }
      if (organizationId) {
        const { data: organization, error: organizationError } = await supabase
          .from("organizations")
          .select("id")
          .eq("id", organizationId)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (organizationError) {
          console.error("Projects POST organization lookup failed");
          return backendUnavailable();
        }
        if (!organization) {
          return apiError("Organization not found", "ORGANIZATION_NOT_FOUND", 404);
        }
      }
      if (primaryContactId) {
        const { data: contact, error: contactError } = await supabase
          .from("contacts")
          .select("id")
          .eq("id", primaryContactId)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (contactError) {
          console.error("Projects POST contact lookup failed");
          return backendUnavailable();
        }
        if (!contact) {
          return apiError("Contact not found", "CONTACT_NOT_FOUND", 404);
        }
      }
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: body.name.trim(),
        description:
          typeof body.description === "string"
            ? body.description.trim() || null
            : null,
        ...(teamId ? { team_id: teamId } : {}),
        ...(organizationId ? { organization_id: organizationId } : {}),
        ...(primaryContactId ? { primary_contact_id: primaryContactId } : {}),
      })
      .select()
      .single();

    if (error) {
      console.error("Projects POST failed");
      return backendUnavailable();
    }
    if (!data) return backendUnavailable();
    return apiJson(data as Record<string, unknown>, { status: 201 });
  } catch {
    console.error("Projects POST failed");
    return backendUnavailable();
  }
}
