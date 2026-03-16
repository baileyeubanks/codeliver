import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";

export async function GET() {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*, projects!inner(owner_id)")
      .eq("projects.owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Activity API error:", error.message);
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
