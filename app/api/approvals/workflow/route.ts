import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import { normalizeReviewerEmail } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";

interface StepInput {
  role_label: string;
  assignee_email: string;
  step_order: number;
}

interface WorkflowRecord {
  id: string;
  asset_id: string;
  mode: string;
  status: string;
}

async function getWorkflowMutationAccess(workflowId: string, userId: string) {
  const supabase = getSupabase();
  const { data: workflow, error } = await supabase
    .from("approval_workflows")
    .select("id, asset_id, mode, status")
    .eq("id", workflowId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, status: 500, error: error.message };
  }
  if (!workflow) {
    return {
      ok: false as const,
      status: 404,
      error: "Approval workflow not found",
    };
  }

  const assetAccess = await getAssetAccess(
    workflow.asset_id,
    userId,
    "producer",
    supabase,
  );
  if (!assetAccess.ok) return assetAccess;

  return { ok: true as const, data: workflow as WorkflowRecord };
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
  const assetAccess = await getAssetAccess(assetId, user.id, "viewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

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
  const assetAccess = await getAssetAccess(asset_id, user.id, "producer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

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
    assignee_email: normalizeReviewerEmail(s.assignee_email),
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

  const workflowAccess = await getWorkflowMutationAccess(workflow_id, user.id);
  if (!workflowAccess.ok) {
    return NextResponse.json({ error: workflowAccess.error }, { status: workflowAccess.status });
  }

  const supabase = getSupabase();
  const workflow = workflowAccess.data;

  if (mode) {
    const { error } = await supabase
      .from("approval_workflows")
      .update({ mode })
      .eq("id", workflow_id)
      .eq("asset_id", workflow.asset_id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (steps?.length) {
    // Delete existing pending steps and re-insert
    const { error: delErr } = await supabase
      .from("approvals")
      .delete()
      .eq("workflow_id", workflow_id)
      .eq("asset_id", workflow.asset_id)
      .eq("status", "pending");

    if (delErr)
      return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Get the asset_id from the workflow
    const wf = workflow;

    if (wf) {
      const stepRows = steps.map((s) => ({
        asset_id: wf.asset_id,
        workflow_id,
        step_order: s.step_order,
        role_label: s.role_label,
        assignee_email: normalizeReviewerEmail(s.assignee_email),
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
    .eq("asset_id", workflow.asset_id)
    .single();

  const { data: updatedSteps } = await supabase
    .from("approvals")
    .select("*")
    .eq("workflow_id", workflow_id)
    .eq("asset_id", workflow.asset_id)
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

  const workflowAccess = await getWorkflowMutationAccess(workflow_id, user.id);
  if (!workflowAccess.ok) {
    return NextResponse.json({ error: workflowAccess.error }, { status: workflowAccess.status });
  }

  const supabase = getSupabase();

  // Cascade delete handles steps via FK
  const { error } = await supabase
    .from("approval_workflows")
    .delete()
    .eq("id", workflow_id)
    .eq("asset_id", workflowAccess.data.asset_id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
