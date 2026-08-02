import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import { normalizeReviewerEmail } from "@/lib/review-invites";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

interface StepInput {
  role_label: string;
  assignee_email: string;
  step_order: number;
}

interface WorkflowRecord {
  id: string;
  asset_id: string;
  version_id: string;
  mode: string;
  status: string;
}

async function getWorkflowMutationAccess(workflowId: string, userId: string) {
  const supabase = getSupabase();
  const { data: workflow, error } = await supabase
    .from("approval_workflows")
    .select("id, asset_id, version_id, mode, status")
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

  if (workflow.status !== "active") {
    return {
      ok: false as const,
      status: 409,
      error: "This approval workflow belongs to a completed or superseded media version",
    };
  }

  const versionLookup = await resolveAssetVersion({
    assetId: workflow.asset_id,
    versionId: workflow.version_id,
    client: supabase,
  });
  if (!versionLookup.ok || !versionLookup.version.is_current) {
    return {
      ok: false as const,
      status: 409,
      error: "Approval workflows can only be edited for the current media version",
    };
  }

  return { ok: true as const, data: workflow as WorkflowRecord };
}

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get("asset_id");
  const requestedVersionId = searchParams.get("version_id");
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

  const versionLookup = await resolveAssetVersion({
    assetId,
    versionId: requestedVersionId,
    client: supabase,
  });
  if (!versionLookup.ok) {
    return NextResponse.json(
      { error: versionLookup.error },
      { status: versionLookup.status >= 500 ? 503 : versionLookup.status },
    );
  }

  const { data: workflow, error: wErr } = await supabase
    .from("approval_workflows")
    .select("*")
    .eq("asset_id", assetId)
    .eq("version_id", versionLookup.version.id)
    .maybeSingle();

  if (wErr)
    return NextResponse.json({ error: wErr.message }, { status: 500 });
  if (!workflow) return NextResponse.json({ workflow: null });

  const { data: steps, error: sErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("workflow_id", workflow.id)
    .eq("asset_id", assetId)
    .eq("version_id", versionLookup.version.id)
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
    version_id?: string;
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

  const requestedVersionId =
    typeof body.version_id === "string" && body.version_id.trim()
      ? body.version_id.trim()
      : null;
  const versionLookup = await resolveAssetVersion({
    assetId: asset_id,
    versionId: requestedVersionId,
    client: supabase,
  });
  if (!versionLookup.ok) {
    return NextResponse.json(
      { error: versionLookup.error },
      { status: versionLookup.status >= 500 ? 503 : versionLookup.status },
    );
  }
  if (!versionLookup.version.is_current) {
    return NextResponse.json(
      { error: "Approval workflows can only be created for the current media version" },
      { status: 409 },
    );
  }

  const existingWorkflow = await supabase
    .from("approval_workflows")
    .select("id")
    .eq("asset_id", asset_id)
    .eq("version_id", versionLookup.version.id)
    .eq("status", "active")
    .maybeSingle();
  if (existingWorkflow.error) {
    return NextResponse.json(
      { error: "Approval workflow could not be evaluated" },
      { status: 503 },
    );
  }
  if (existingWorkflow.data) {
    return NextResponse.json(
      { error: "An approval workflow already exists for this media version" },
      { status: 409 },
    );
  }

  const { data: workflow, error: wErr } = await supabase
    .from("approval_workflows")
    .insert({
      asset_id,
      version_id: versionLookup.version.id,
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
    version_id: versionLookup.version.id,
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
      .eq("asset_id", workflow.asset_id)
      .eq("version_id", workflow.version_id);
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
      .eq("version_id", workflow.version_id)
      .eq("status", "pending");

    if (delErr)
      return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Get the asset_id from the workflow
    const wf = workflow;

    if (wf) {
      const stepRows = steps.map((s) => ({
        asset_id: wf.asset_id,
        version_id: wf.version_id,
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
    .eq("version_id", workflow.version_id)
    .single();

  const { data: updatedSteps } = await supabase
    .from("approvals")
    .select("*")
    .eq("workflow_id", workflow_id)
    .eq("asset_id", workflow.asset_id)
    .eq("version_id", workflow.version_id)
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
    .eq("asset_id", workflowAccess.data.asset_id)
    .eq("version_id", workflowAccess.data.version_id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
