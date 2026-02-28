import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabase()
    .from("assets")
    .select("*, projects!inner(owner_id)")
    .eq("projects.owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
