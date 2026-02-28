import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabase()
    .from("activity_log")
    .select("*, projects!inner(owner_id)")
    .eq("projects.owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
