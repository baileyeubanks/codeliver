import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";

export async function GET() {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*, assets(id, status)")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Projects GET error:", error.message);
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    console.error("Projects GET exception:", e);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: body.name.trim(),
        description: body.description || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Projects POST error:", error.message, error.details, error.hint);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 500 }
      );
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    console.error("Projects POST exception:", e?.message || e);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
