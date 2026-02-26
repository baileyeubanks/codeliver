import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("approval_gates")
    .select("*, approval_decisions(*)")
    .eq("asset_id", id)
    .order("gate_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch gates" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const payload = await req.json().catch(() => ({}));

  if (!payload.roles || !Array.isArray(payload.roles) || payload.roles.length === 0) {
    return NextResponse.json({ error: "roles array is required" }, { status: 400 });
  }

  const gates = payload.roles.map((role: string, i: number) => ({
    asset_id: id,
    role_required: role,
    gate_order: i + 1,
  }));

  const { data, error } = await supabase
    .from("approval_gates")
    .insert(gates)
    .select();

  if (error) {
    return NextResponse.json({ error: "Failed to create gates" }, { status: 500 });
  }

  await supabase.from("review_events").insert({
    asset_id: id,
    event_type: "gates_created",
    payload: { roles: payload.roles },
  });

  return NextResponse.json({ items: data ?? [] });
}
