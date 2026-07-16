import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { requireTeamRole } from "@/lib/middleware/rbac";

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
      const teamAccess = await requireTeamRole(teamId, user.id, "admin");
      if (!teamAccess.allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
