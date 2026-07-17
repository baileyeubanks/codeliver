import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { requireTeamRole } from "@/lib/middleware/rbac";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROJECT_LIST_COLUMNS =
  "id, team_id, owner_id, name, description, status, thumbnail_url, created_at, updated_at, assets(id, status)";
const PROJECT_LIST_COLUMNS_WITH_RECORD =
  "id, team_id, owner_id, name, description, status, stage, organization_id, primary_contact_id, thumbnail_url, created_at, updated_at, assets(id, status)";

export async function GET() {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      console.error("Projects GET error:", error.message);
      return NextResponse.json(
        { error: "Projects are temporarily unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("Projects GET exception:", e);
    return NextResponse.json(
      { error: "Projects are temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 240) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }
    if (
      body.description !== undefined &&
      body.description !== null &&
      (typeof body.description !== "string" || body.description.length > 10_000)
    ) {
      return NextResponse.json({ error: "Project description is invalid" }, { status: 400 });
    }
    const isolated = getSupabaseDataSchema() === "co_production";
    const teamId = isolated && typeof body.team_id === "string" ? body.team_id : null;
    if (isolated && body.team_id !== undefined && !teamId) {
      return NextResponse.json({ error: "team_id is invalid" }, { status: 400 });
    }
    if (teamId) {
      const teamAccess = await requireTeamRole(teamId, user.id, "admin");
      if (!teamAccess.allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
          return NextResponse.json({ error: "organization_id is invalid" }, { status: 400 });
        }
        organizationId = body.organization_id;
      }
      if (body.primary_contact_id !== undefined && body.primary_contact_id !== null) {
        if (typeof body.primary_contact_id !== "string" || !UUID_PATTERN.test(body.primary_contact_id)) {
          return NextResponse.json({ error: "primary_contact_id is invalid" }, { status: 400 });
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
          console.error("Projects POST organization check error:", organizationError.message);
          return NextResponse.json(
            { error: "The project could not be created" },
            { status: 503 },
          );
        }
        if (!organization) {
          return NextResponse.json({ error: "Organization not found" }, { status: 404 });
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
          console.error("Projects POST contact check error:", contactError.message);
          return NextResponse.json(
            { error: "The project could not be created" },
            { status: 503 },
          );
        }
        if (!contact) {
          return NextResponse.json({ error: "Contact not found" }, { status: 404 });
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
      console.error("Projects POST error:", error.message, error.details, error.hint);
      return NextResponse.json(
        { error: "The project could not be created" },
        { status: 503 }
      );
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: unknown) {
    console.error("Projects POST exception:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
