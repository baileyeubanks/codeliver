import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request, { params }: { params: Promise<{ gateId: string }> }) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gateId } = await params;
  const payload = await req.json().catch(() => ({}));
  if (!payload.decision) {
    return NextResponse.json({ error: "Missing decision" }, { status: 400 });
  }

  // Insert decision
  const { data: decision, error: decErr } = await supabase
    .from("approval_decisions")
    .insert({
      gate_id: gateId,
      decision: payload.decision,
      note: payload.note || null,
    })
    .select()
    .single();

  if (decErr) {
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }

  // Update gate state
  const newState = payload.decision === "approved" ? "approved" : "needs_change";
  await supabase
    .from("approval_gates")
    .update({ state: newState })
    .eq("id", gateId);

  // Get the gate to find asset_id
  const { data: gate } = await supabase
    .from("approval_gates")
    .select("asset_id, role_required")
    .eq("id", gateId)
    .single();

  if (gate) {
    // Log event
    await supabase.from("review_events").insert({
      asset_id: gate.asset_id,
      event_type: `gate_${newState}`,
      payload: { gate_id: gateId, role: gate.role_required, decision: payload.decision },
    });

    // Check if all gates for this asset are approved → update asset status
    if (newState === "approved") {
      const { data: allGates } = await supabase
        .from("approval_gates")
        .select("state")
        .eq("asset_id", gate.asset_id);

      const allApproved = allGates?.every((g) => g.state === "approved");
      if (allApproved) {
        await supabase
          .from("review_assets")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", gate.asset_id);

        await supabase.from("review_events").insert({
          asset_id: gate.asset_id,
          event_type: "asset_approved",
          payload: { all_gates_cleared: true },
        });
      }
    }
  }

  return NextResponse.json(decision);
}
