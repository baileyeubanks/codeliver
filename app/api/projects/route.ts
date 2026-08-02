import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { requireTeamRole } from "@/lib/middleware/rbac";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ManualProjectResponse {
  id: string;
  team_id: string | null;
  owner_id: string;
  name: string;
  description: string | null;
  status: string;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
  origin: "manual_project";
  request_id: string;
  replayed: boolean;
}

function manualProjectResponse(value: unknown): ManualProjectResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.owner_id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.status !== "string" ||
    typeof record.created_at !== "string" ||
    typeof record.updated_at !== "string" ||
    typeof record.request_id !== "string" ||
    record.origin !== "manual_project" ||
    typeof record.replayed !== "boolean"
  ) {
    return null;
  }
  if (
    (record.team_id !== null && typeof record.team_id !== "string") ||
    (record.description !== null && typeof record.description !== "string") ||
    (record.thumbnail_url !== null && typeof record.thumbnail_url !== "string")
  ) {
    return null;
  }
  return record as unknown as ManualProjectResponse;
}

function manualProjectError(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("manual_project_forbidden")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (normalized.includes("invalid_manual_project")) {
    return NextResponse.json({ error: "Project details are invalid" }, { status: 400 });
  }
  if (normalized.includes("manual_project_idempotency_conflict")) {
    return NextResponse.json(
      { error: "This creation request conflicts with an earlier project" },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: "The project could not be created" },
    { status: 503 },
  );
}

export async function GET() {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let query = supabase
      .from("projects")
      .select(
        "id, team_id, owner_id, name, description, status, thumbnail_url, created_at, updated_at, assets(id, status)",
      );
    if (getSupabaseDataSchema() === "public") {
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
      const teamAccess = await requireTeamRole(
        teamId,
        user.id,
        "admin",
        supabase,
      );
      if (!teamAccess.allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (isolated) {
      const requestId = typeof body.request_id === "string"
        ? body.request_id.trim().toLowerCase()
        : "";
      if (!UUID_PATTERN.test(requestId)) {
        return NextResponse.json(
          { error: "A valid project creation request_id is required" },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc(
        "create_manual_project_with_origin",
        {
          p_team_id: teamId,
          p_name: body.name.trim(),
          p_description:
            typeof body.description === "string"
              ? body.description.trim() || null
              : null,
          p_request_id: requestId,
        },
      );
      if (error) {
        console.error("Projects POST manual origin error:", error.message);
        return manualProjectError(error.message);
      }
      const project = manualProjectResponse(data);
      if (!project || project.owner_id !== user.id || project.request_id !== requestId) {
        console.error("Projects POST manual origin returned an invalid receipt");
        return NextResponse.json(
          { error: "The project could not be created" },
          { status: 503 },
        );
      }
      return NextResponse.json(project, { status: project.replayed ? 200 : 201 });
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
