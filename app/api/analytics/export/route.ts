import { NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";

const MAX_REQUEST_URL_LENGTH = 2_048;
const MAX_EXPORT_ASSETS = 500;
const MAX_EXPORT_ROWS = 10_000;
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_QUERY_PARAMS = new Set(["project_id", "format"]);
const ALLOWED_FORMATS = new Set(["csv", "json"]);

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, Authorization",
};

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

interface ApprovalRow {
  id: string;
  asset_id: string;
  assignee_email: string | null;
  role_label: string;
  status: string;
  decided_at: string | null;
  created_at: string;
}

type ExportRequest = {
  projectId: string;
  format: "csv" | "json";
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function invalidRequest() {
  return json({ error: "Invalid export request" }, 400);
}

function unavailable() {
  return json({ error: "Project export is temporarily unavailable" }, 503);
}

function tooLarge() {
  return json({ error: "Project is too large to export" }, 413);
}

function projectAccessFailure(status: number) {
  return status >= 500
    ? unavailable()
    : json({ error: "Project not found" }, 404);
}

function parseExportRequest(req: Request): ExportRequest | null {
  if (req.url.length > MAX_REQUEST_URL_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return null;
  }

  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key)) return null;
  }

  const projectIds = url.searchParams.getAll("project_id");
  const formats = url.searchParams.getAll("format");
  if (
    projectIds.length !== 1 ||
    !UUID_PATTERN.test(projectIds[0]) ||
    formats.length > 1 ||
    (formats.length === 1 && !ALLOWED_FORMATS.has(formats[0]))
  ) {
    return null;
  }

  return {
    projectId: projectIds[0],
    format: formats[0] === "json" ? "json" : "csv",
  };
}

export async function GET(req: Request) {
  try {
    const { user, supabase } = await requireAuthWithClient();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const input = parseExportRequest(req);
    if (!input) return invalidRequest();

    const projectAccess = await getProjectAccess(
      input.projectId,
      user.id,
      "owner",
      supabase,
    );
    if (!projectAccess.ok) {
      return projectAccessFailure(projectAccess.status);
    }

    const { data: assetData, error: assetsError } = await supabase
      .from("assets")
      .select("id, title, status, file_type, created_at")
      .eq("project_id", input.projectId)
      .order("created_at", { ascending: true })
      .limit(MAX_EXPORT_ASSETS + 1);
    if (assetsError) return unavailable();
    if ((assetData?.length ?? 0) > MAX_EXPORT_ASSETS) return tooLarge();

    const assets = (assetData ?? []) as AssetRow[];
    const assetIds = assets.map((asset) => asset.id);

    const commentsResult = assetIds.length
      ? await supabase
          .from("comments")
          .select(
            "id, asset_id, author_name, author_email, body, status, created_at",
          )
          .in("asset_id", assetIds)
          .order("created_at", { ascending: true })
          .limit(MAX_EXPORT_ROWS + 1)
      : { data: [], error: null };

    const approvalsResult = assetIds.length
      ? await supabase
          .from("approvals")
          .select(
            "id, asset_id, assignee_email, role_label, status, decided_at, created_at",
          )
          .in("asset_id", assetIds)
          .order("created_at", { ascending: true })
          .limit(MAX_EXPORT_ROWS + 1)
      : { data: [], error: null };

    if (commentsResult.error || approvalsResult.error) return unavailable();
    if (
      (commentsResult.data?.length ?? 0) > MAX_EXPORT_ROWS ||
      (approvalsResult.data?.length ?? 0) > MAX_EXPORT_ROWS
    ) {
      return tooLarge();
    }

    const comments = (commentsResult.data ?? []) as CommentRow[];
    const approvals = (approvalsResult.data ?? []) as ApprovalRow[];
    const projectName = projectAccess.data.name;
    const fileName = safeFileName(projectName);

    if (input.format === "json") {
      const payload = JSON.stringify(
        {
          project: { id: input.projectId, name: projectName },
          exported_at: new Date().toISOString(),
          assets,
          comments,
          approval_steps: approvals,
        },
        null,
        2,
      );
      if (byteLength(payload) > MAX_EXPORT_BYTES) return tooLarge();

      return new NextResponse(payload, {
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName}_report.json"`,
        },
      });
    }

    const lines: string[] = ["=== Assets ===", "ID,Name,Status,Type,Created"];
    for (const asset of assets) {
      lines.push(
        [
          asset.id,
          asset.title,
          asset.status,
          asset.file_type,
          asset.created_at,
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    lines.push("", "=== Comments ===");
    lines.push("ID,Asset ID,Author,Email,Status,Created,Body");
    for (const comment of comments) {
      lines.push(
        [
          comment.id,
          comment.asset_id,
          comment.author_name,
          comment.author_email,
          comment.status,
          comment.created_at,
          comment.body,
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    lines.push("", "=== Approval Steps ===");
    lines.push("ID,Asset ID,Reviewer,Role,Status,Decided At,Created");
    for (const approval of approvals) {
      lines.push(
        [
          approval.id,
          approval.asset_id,
          approval.assignee_email,
          approval.role_label,
          approval.status,
          approval.decided_at,
          approval.created_at,
        ]
          .map(csvEscape)
          .join(","),
      );
    }

    const csv = lines.join("\n");
    if (byteLength(csv) > MAX_EXPORT_BYTES) return tooLarge();

    return new NextResponse(csv, {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}_report.csv"`,
      },
    });
  } catch {
    return unavailable();
  }
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const formulaSafe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(formulaSafe)
    ? `"${formulaSafe.replace(/"/g, '""')}"`
    : formulaSafe;
}

function safeFileName(value: string) {
  return (
    value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") ||
    "project"
  );
}
