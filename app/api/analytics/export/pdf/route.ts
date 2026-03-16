import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

/**
 * PDF-ready HTML Comment Report
 *
 * GET /api/analytics/export/pdf?project_id=xxx
 *
 * Returns an HTML page that the browser can print to PDF (Cmd+P → Save as PDF).
 * Includes all comments with timecodes, approval status, and project metadata.
 */

function formatTimecode(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");

  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("id, title, status, file_type, created_at, duration_seconds")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const assetIds = (assets ?? []).map((a: { id: string }) => a.id);

  const { data: comments } = assetIds.length > 0
    ? await supabase
        .from("comments")
        .select("id, asset_id, author_name, author_email, body, status, timecode_seconds, pin_x, pin_y, created_at")
        .in("asset_id", assetIds)
        .order("timecode_seconds", { ascending: true, nullsFirst: false })
    : { data: [] };

  const commentsByAsset = new Map<string, typeof comments>();
  for (const c of comments ?? []) {
    const existing = commentsByAsset.get(c.asset_id) ?? [];
    existing.push(c);
    commentsByAsset.set(c.asset_id, existing);
  }

  const now = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const projectName = (project as { name: string }).name;
  const projectDescription = (project as { description?: string }).description || "";

  let assetRows = "";
  for (const asset of (assets ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    file_type: string;
    created_at: string;
    duration_seconds?: number;
  }>) {
    const assetComments = commentsByAsset.get(asset.id) ?? [];
    const openCount = assetComments.filter((c: { status: string }) => c.status === "open").length;
    const resolvedCount = assetComments.filter((c: { status: string }) => c.status === "resolved").length;

    assetRows += `
      <div class="asset-section">
        <div class="asset-header">
          <h2>${escapeHtml(asset.title)}</h2>
          <div class="asset-meta">
            <span class="badge badge-${asset.status}">${asset.status.replace("_", " ")}</span>
            <span class="meta-text">${asset.file_type}</span>
            ${asset.duration_seconds ? `<span class="meta-text">${formatTimecode(asset.duration_seconds)}</span>` : ""}
            <span class="meta-text">${assetComments.length} comment${assetComments.length !== 1 ? "s" : ""}</span>
            <span class="meta-text">${openCount} open · ${resolvedCount} resolved</span>
          </div>
        </div>

        ${assetComments.length === 0
          ? '<p class="no-comments">No comments on this asset.</p>'
          : `<table class="comments-table">
              <thead>
                <tr>
                  <th style="width: 30px">#</th>
                  <th style="width: 90px">Timecode</th>
                  <th style="width: 120px">Author</th>
                  <th>Comment</th>
                  <th style="width: 70px">Status</th>
                  <th style="width: 50px">Pin</th>
                </tr>
              </thead>
              <tbody>
                ${assetComments.map((c: {
                  timecode_seconds: number | null;
                  author_name: string;
                  body: string;
                  status: string;
                  pin_x?: number | null;
                  pin_y?: number | null;
                }, i: number) => `
                  <tr class="${c.status === 'resolved' ? 'resolved' : ''}">
                    <td class="num">${i + 1}</td>
                    <td class="timecode">${formatTimecode(c.timecode_seconds)}</td>
                    <td class="author">${escapeHtml(c.author_name)}</td>
                    <td class="body">${escapeHtml(c.body)}</td>
                    <td><span class="badge badge-${c.status}">${c.status}</span></td>
                    <td class="pin">${c.pin_x != null ? "📌" : ""}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>`
        }
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(projectName)} — Comment Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 40px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #000;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .report-header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .report-header .subtitle {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    .report-header .brand {
      text-align: right;
      font-size: 10px;
      color: #888;
    }
    .report-header .brand strong {
      font-size: 13px;
      color: #1a1a1a;
      display: block;
      margin-bottom: 2px;
    }

    .summary-bar {
      display: flex;
      gap: 24px;
      background: #f5f5f5;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 24px;
      font-size: 11px;
    }
    .summary-bar .stat { }
    .summary-bar .stat strong { font-weight: 600; }

    .asset-section {
      margin-bottom: 28px;
      page-break-inside: avoid;
    }
    .asset-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e0e0e0;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .asset-header h2 {
      font-size: 14px;
      font-weight: 600;
    }
    .asset-meta {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .meta-text {
      font-size: 10px;
      color: #888;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-open { background: #fff3cd; color: #856404; }
    .badge-resolved { background: #d4edda; color: #155724; }
    .badge-in_review { background: #cce5ff; color: #004085; }
    .badge-draft { background: #e2e3e5; color: #383d41; }
    .badge-approved { background: #d4edda; color: #155724; }
    .badge-needs_changes { background: #f8d7da; color: #721c24; }
    .badge-final { background: #d4edda; color: #155724; }

    .comments-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .comments-table th {
      background: #f8f8f8;
      text-align: left;
      padding: 6px 8px;
      font-weight: 600;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #666;
      border-bottom: 1px solid #e0e0e0;
    }
    .comments-table td {
      padding: 8px;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: top;
    }
    .comments-table tr.resolved td {
      opacity: 0.5;
    }
    .comments-table .num { color: #999; font-weight: 600; }
    .comments-table .timecode {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 10px;
      color: #0066cc;
    }
    .comments-table .author { font-weight: 500; }
    .comments-table .body { line-height: 1.6; }
    .comments-table .pin { text-align: center; }

    .no-comments {
      color: #999;
      font-style: italic;
      padding: 12px 0;
    }

    .footer {
      margin-top: 40px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 9px;
      color: #aaa;
    }

    @media print {
      body { padding: 20px; }
      .asset-section { page-break-inside: avoid; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <h1>${escapeHtml(projectName)}</h1>
      <div class="subtitle">Comment Report — ${now}</div>
      ${projectDescription ? `<div class="subtitle">${escapeHtml(projectDescription)}</div>` : ""}
    </div>
    <div class="brand">
      <strong>Content Co-op</strong>
      Co-Deliver Review Platform
    </div>
  </div>

  <div class="summary-bar">
    <div class="stat"><strong>${(assets ?? []).length}</strong> asset${(assets ?? []).length !== 1 ? "s" : ""}</div>
    <div class="stat"><strong>${(comments ?? []).length}</strong> comment${(comments ?? []).length !== 1 ? "s" : ""}</div>
    <div class="stat"><strong>${(comments ?? []).filter((c: { status: string }) => c.status === "open").length}</strong> open</div>
    <div class="stat"><strong>${(comments ?? []).filter((c: { status: string }) => c.status === "resolved").length}</strong> resolved</div>
  </div>

  ${assetRows}

  <div class="footer">
    Generated by Co-Deliver — Content Co-op · ${now}
  </div>

  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
      📄 Save as PDF
    </button>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
