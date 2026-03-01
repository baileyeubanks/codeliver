import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

interface StepInput {
  role_label: string;
  assignee_email: string;
  step_order: number;
}

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("asset_id");
  if (!assetId)
    return NextResponse.json(
      { error: "asset_id is required" },
      { status: 400 }
    );

  const supabase = getSupabase();

  const { data: workflow, error: wErr } = await supabase
    .from("approval_workflows")
    .select("*")
    .eq("asset_id", assetId)
    .eq("status", "active")
    .maybeSingle();

  if (wErr)
    return NextResponse.json({ error: wErr.message }, { status: 500 });
  if (!workflow) return NextResponse.json({ workflow: null });

  const { data: steps, error: sErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("workflow_id", workflow.id)
    .order("step_order", { ascending: true });

  if (sErr)
    return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json({ workflow: { ...workflow, steps: steps ?? [] } });
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { asset_id, mode, steps } = body as {
    asset_id: string;
    mode: string;
    steps: StepInput[];
  };

  if (!asset_id || !mode || !steps?.length)
    return NextResponse.json(
      { error: "asset_id, mode, and steps are required" },
      { status: 400 }
    );

  const supabase = getSupabase();

  const { data: workflow, error: wErr } = await supabase
    .from("approval_workflows")
    .insert({
      asset_id,
      mode,
      created_by: user.id,
      status: "active",
    })
    .select()
    .single();

  if (wErr)
    return NextResponse.json({ error: wErr.message }, { status: 500 });

  const stepRows = steps.map((s) => ({
    asset_id,
    workflow_id: workflow.id,
    step_order: s.step_order,
    role_label: s.role_label,
    assignee_email: s.assignee_email,
    status: "pending",
  }));

  const { data: inserted, error: sErr } = await supabase
    .from("approvals")
    .insert(stepRows)
    .select();

  if (sErr)
    return NextResponse.json({ error: sErr.message }, { status: 500 });

  return NextResponse.json(
    { workflow: { ...workflow, steps: inserted } },
    { status: 201 }
  );
}

export async function PUT(req: Request) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workflow_id, mode, steps } = body as {
    workflow_id: string;
    mode?: string;
    steps?: StepInput[];
  };

  if (!workflow_id)
    return NextResponse.json(
      { error: "workflow_id is required" },
      { status: 400 }
    );

  const supabase = getSupabase();

  if (mode) {
    const { error } = await supabase
      .from("approval_workflows")
      .update({ mode })
      .eq("id", workflow_id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (steps?.length) {
    // Delete existing pending steps and re-insert
    const { error: delErr } = await supabase
      .from("approvals")
      .delete()
      .eq("workflow_id", workflow_id)
      .eq("status", "pending");

    if (delErr)
      return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Get the asset_id from the workflow
    const { data: wf } = await supabase
      .from("approval_workflows")
      .select("asset_id")
      .eq("id", workflow_id)
      .single();

    if (wf) {
      const stepRows = steps.map((s) => ({
        asset_id: wf.asset_id,
        workflow_id,
        step_order: s.step_order,
        role_label: s.role_label,
        assignee_email: s.assignee_email,
        status: "pending",
      }));

      const { error: insErr } = await supabase
        .from("approvals")
        .insert(stepRows);

      if (insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // Return updated workflow with steps
  const { data: updated } = await supabase
    .from("approval_workflows")
    .select("*")
    .eq("id", workflow_id)
    .single();

  const { data: updatedSteps } = await supabase
    .from("approvals")
    .select("*")
    .eq("workflow_id", workflow_id)
    .order("step_order", { ascending: true });

  return NextResponse.json({
    workflow: { ...updated, steps: updatedSteps ?? [] },
  });
}

export async function DELETE(req: Request) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workflow_id } = body as { workflow_id: string };

  if (!workflow_id)
    return NextResponse.json(
      { error: "workflow_id is required" },
      { status: 400 }
    );

  const supabase = getSupabase();

  // Cascade delete handles steps via FK
  const { error } = await supabase
    .from("approval_workflows")
    .delete()
    .eq("id", workflow_id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
