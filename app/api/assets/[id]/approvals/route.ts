import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getSupabase()
    .from("approvals")
    .select("*")
    .eq("asset_id", id)
    .order("step_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const { data, error } = await getSupabase()
    .from("approvals")
    .insert({
      asset_id: id,
      step_order: body.step_order || 1,
      role_label: body.role_label,
      assignee_email: body.assignee_email || null,
      assignee_id: body.assignee_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send approval request email
  if (data && body.assignee_email) {
    const asset = await getSupabase().from("assets").select("title, project_id").eq("id", id).single();
    const project = await getSupabase().from("projects").select("name").eq("id", asset.data?.project_id).single();

    if (asset.data && project.data) {
      const reviewUrl = `${getBaseUrl()}/projects/${asset.data.project_id}/assets/${id}`;
      const emailPayload = emailTemplates.approvalRequest(
        body.assignee_email,
        asset.data.title,
        project.data.name,
        reviewUrl
      );
      await sendEmail({ to: body.assignee_email, ...emailPayload });
    }
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const body = await req.json();

  const { data, error } = await getSupabase()
    .from("approvals")
    .update({
      status: body.status,
      decision_note: body.decision_note || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  const asset = await getSupabase().from("assets").select("project_id, title").eq("id", assetId).single();
  if (asset.data) {
    await getSupabase().from("activity_log").insert({
      project_id: asset.data.project_id,
      asset_id: assetId,
      actor_id: user.id,
      actor_name: user.email,
      action: body.status === "approved" ? "approved_asset" : "requested_changes",
      details: { asset_title: asset.data.title, role: data.role_label },
    });

    // Check if all approvals are done — auto-update asset status
    if (body.status === "approved") {
      const { data: allApprovals } = await getSupabase()
        .from("approvals")
        .select("status")
        .eq("asset_id", assetId);

      const allApproved = allApprovals?.every((a) => a.status === "approved");
      if (allApproved) {
        await getSupabase().from("assets").update({ status: "approved" }).eq("id", assetId);
      }
    }

    if (body.status === "changes_requested") {
      await getSupabase().from("assets").update({ status: "needs_changes" }).eq("id", assetId);
    }
  }

  return NextResponse.json(data);
}
