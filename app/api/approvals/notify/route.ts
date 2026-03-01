import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, emailTemplates, getBaseUrl } from "@/lib/email";

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { approval_id, asset_id } = body as { approval_id: string; asset_id: string };

  if (!approval_id || !asset_id) {
    return NextResponse.json({ error: "approval_id and asset_id are required" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: step, error: stepErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", approval_id)
    .single();

  if (stepErr || !step) return NextResponse.json({ error: "Approval step not found" }, { status: 404 });
  if (!step.assignee_email) return NextResponse.json({ error: "No assignee email" }, { status: 400 });

  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("title, project_id")
    .eq("id", asset_id)
    .single();

  if (assetErr || !asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", asset.project_id)
    .single();

  const reviewUrl = `${getBaseUrl()}/projects/${asset.project_id}/assets/${asset_id}`;

  const emailPayload = emailTemplates.approvalRequest(
    step.assignee_email,
    asset.title,
    project?.name ?? "Project",
    reviewUrl
  );

  await sendEmail({ to: step.assignee_email, ...emailPayload });

  await supabase.from("activity_log").insert({
    project_id: asset.project_id,
    asset_id,
    actor_id: user.id,
    actor_name: user.email ?? "System",
    action: "approval_notification_sent",
    details: { assignee_email: step.assignee_email, role_label: step.role_label },
  });

  return NextResponse.json({ ok: true, sent_to: step.assignee_email });
}
