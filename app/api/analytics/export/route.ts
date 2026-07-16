import { NextResponse } from "next/server";
import { getProjectAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

interface AssetRow {
  id: string;
  title: string;
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

  const projectAccess = await getProjectAccess(
    projectId,
    user.id,
    "member",
    supabase,
  );
  if (!projectAccess.ok) {
    return NextResponse.json(
      { error: projectAccess.error },
      { status: projectAccess.status },
    );
  }

  // Fetch all project data
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, title, status, file_type, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const assetIds = (assets ?? []).map((a: AssetRow) => a.id);

  const { data: comments, error: commentsError } = assetIds.length > 0
    ? await supabase
        .from("comments")
        .select("id, asset_id, author_name, author_email, body, status, created_at")
        .in("asset_id", assetIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  const { data: approvalSteps, error: approvalsError } = assetIds.length > 0
    ? await supabase
        .from("approvals")
        .select("id, asset_id, assignee_email, role_label, status, decided_at, created_at")
        .in("asset_id", assetIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  const queryError = assetsError ?? commentsError ?? approvalsError;
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const projectName = projectAccess.data.name;
  const fileName = safeFileName(projectName);

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
        "Content-Disposition": `attachment; filename="${fileName}_report.json"`,
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
      [a.id, csvEscape(a.title), a.status, a.file_type, a.created_at].join(",")
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
      "Content-Disposition": `attachment; filename="${fileName}_report.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  const formulaSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (
    formulaSafe.includes(",") ||
    formulaSafe.includes('"') ||
    formulaSafe.includes("\n")
  ) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
}
