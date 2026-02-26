import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const project = searchParams.get("project");

  let query = supabase
    .from("review_assets")
    .select("*, approval_gates(id, role_required, state, gate_order), timecoded_comments(count)")
    .eq("org_id", ORG_ID)
    .order("updated_at", { ascending: false });

  if (project) {
    query = query.eq("project_name", project);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  if (!payload.project_name || !payload.title) {
    return NextResponse.json({ error: "project_name and title are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("review_assets")
    .insert({
      org_id: ORG_ID,
      project_name: payload.project_name,
      title: payload.title,
      status: payload.status || "in_review",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }

  await supabase.from("review_events").insert({
    asset_id: data.id,
    event_type: "asset_created",
    payload: { project_name: payload.project_name, title: payload.title },
  });

  return NextResponse.json(data);
}
