import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";

export async function GET() {
  try {
    const { user, supabase } = await requireAuthWithClient();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let query = supabase.from("assets").select("*");
    if (getSupabaseDataSchema() === "public") {
      query = supabase
        .from("assets")
        .select("*, projects!inner(owner_id)")
        .eq("projects.owner_id", user.id);
    }
    const { data, error } = await query.order("updated_at", { ascending: false });

    if (error) {
      console.error("Assets API error:", error.message);
      return NextResponse.json(
        { error: "Assets are temporarily unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { items: data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Assets API exception:", error);
    return NextResponse.json(
      { error: "Assets are temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
