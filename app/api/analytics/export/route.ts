import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

interface AssetRow {
  id: string;
  name: string;
  status: string;
  file_type: string;
  created_at: string;
}

interface CommentRow {
  id: string;
  asset_id: string;
  author_name: string;
  author_email: string | null;
  body: string;
  status: string;
  created_at: string;
}

interface StepRow {
  id: string;
  asset_id: string;
  assignee_email: string | null;
  role_label: string;
  status: string;
  decided_at: string | null;
  created_at: string;
}

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");
  const format = searchParams.get("format") || "csv";

  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify ownership
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch all project data
  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, status, file_type, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const assetIds = (assets ?? []).map((a: AssetRow) => a.id);

  const { data: comments } = assetIds.length > 0
    ? await supabase
        .from("comments")
        .select("id, asset_id, author_name, author_email, body, status, created_at")
        .in("asset_id", assetIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const { data: approvalSteps } = assetIds.length > 0
    ? await supabase
        .from("approval_steps")
        .select("id, asset_id, assignee_email, role_label, status, decided_at, created_at")
        .in("asset_id", assetIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const projectName = (project as { name: string }).name;

  if (format === "json") {
    const jsonData = {
      project: { id: projectId, name: projectName },
      exported_at: new Date().toISOString(),
      assets: assets ?? [],
      comments: comments ?? [],
      approval_steps: approvalSteps ?? [],
    };

    return new NextResponse(JSON.stringify(jsonData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${projectName}_report.json"`,
      },
    });
  }

  // CSV format
  const lines: string[] = [];

  // Assets section
  lines.push("=== Assets ===");
  lines.push("ID,Name,Status,Type,Created");
  for (const a of (assets ?? []) as AssetRow[]) {
    lines.push(
      [a.id, csvEscape(a.name), a.status, a.file_type, a.created_at].join(",")
    );
  }

  lines.push("");
  lines.push("=== Comments ===");
  lines.push("ID,Asset ID,Author,Email,Status,Created,Body");
  for (const c of (comments ?? []) as CommentRow[]) {
    lines.push(
      [
        c.id,
        c.asset_id,
        csvEscape(c.author_name),
        c.author_email ?? "",
        c.status,
        c.created_at,
        csvEscape(c.body),
      ].join(",")
    );
  }

  lines.push("");
  lines.push("=== Approval Steps ===");
  lines.push("ID,Asset ID,Reviewer,Role,Status,Decided At,Created");
  for (const s of (approvalSteps ?? []) as StepRow[]) {
    lines.push(
      [
        s.id,
        s.asset_id,
        s.assignee_email ?? "",
        csvEscape(s.role_label),
        s.status,
        s.decided_at ?? "",
        s.created_at,
      ].join(",")
    );
  }

  const csv = lines.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${projectName}_report.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
