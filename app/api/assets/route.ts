import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";

export async function GET() {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("assets")
      .select("*, projects!inner(owner_id)")
      .eq("projects.owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Assets API error:", error.message);
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    return NextResponse.json({ items: [] });
  }
}
