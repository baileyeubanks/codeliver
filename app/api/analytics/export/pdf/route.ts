import { NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";

const MAX_REQUEST_URL_LENGTH = 2_048;
const MAX_EXPORT_ASSETS = 500;
const MAX_EXPORT_COMMENTS = 10_000;
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_QUERY_PARAMS = new Set(["project_id"]);

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, Authorization",
};

interface PdfAsset {
  id: string;
  title: string;
  status: string;
  file_type: string;
  created_at: string;
  duration_seconds: number | null;
}

interface PdfComment {
  id: string;
  asset_id: string;
  author_name: string;
  author_email: string | null;
  body: string;
  status: string;
  timecode_seconds: number | null;
  pin_x: number | null;
  pin_y: number | null;
  created_at: string;
}

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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeClassName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function unavailable() {
  return json({ error: "PDF export is temporarily unavailable" }, 503);
}

function tooLarge() {
  return json({ error: "Project is too large to export" }, 413);
}

function projectAccessFailure(status: number) {
  return status >= 500
    ? unavailable()
    : json({ error: "Project not found" }, 404);
}

function parseProjectId(req: Request): string | null {
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
  return projectIds.length === 1 && UUID_PATTERN.test(projectIds[0])
    ? projectIds[0]
    : null;
}

export async function GET(req: Request) {
  try {
    return await getPdfReport(req);
  } catch {
    return unavailable();
  }
}

async function getPdfReport(req: Request) {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const projectId = parseProjectId(req);
  if (!projectId) return json({ error: "Invalid export request" }, 400);

  const projectAccess = await getProjectAccess(
    projectId,
    user.id,
    "owner",
    supabase,
  );
  if (!projectAccess.ok) {
    return projectAccessFailure(projectAccess.status);
  }

  const { data: projectMetadata, error: projectError } = await supabase
    .from("projects")
    .select("description")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return unavailable();
  if (!projectMetadata) return json({ error: "Project not found" }, 404);

  const { data: assetData, error: assetsError } = await supabase
    .from("assets")
    .select("id, title, status, file_type, created_at, duration_seconds")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(MAX_EXPORT_ASSETS + 1);
  if (assetsError) return unavailable();
  if ((assetData?.length ?? 0) > MAX_EXPORT_ASSETS) return tooLarge();

  const assets = (assetData ?? []) as PdfAsset[];
  const assetIds = assets.map((asset) => asset.id);

  const commentsResult = assetIds.length > 0
    ? await supabase
        .from("comments")
        .select("id, asset_id, author_name, author_email, body, status, timecode_seconds, pin_x, pin_y, created_at")
        .in("asset_id", assetIds)
        .order("timecode_seconds", { ascending: true, nullsFirst: false })
        .limit(MAX_EXPORT_COMMENTS + 1)
    : { data: [], error: null };
  if (commentsResult.error) return unavailable();
  if ((commentsResult.data?.length ?? 0) > MAX_EXPORT_COMMENTS) {
    return tooLarge();
  }

  const comments = (commentsResult.data ?? []) as PdfComment[];

  const commentsByAsset = new Map<string, PdfComment[]>();
  for (const c of comments) {
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

  const projectName = projectAccess.data.name;
  const projectDescription =
    typeof projectMetadata.description === "string"
      ? projectMetadata.description
      : "";

  let assetRows = "";
  for (const asset of assets) {
    const assetComments = commentsByAsset.get(asset.id) ?? [];
    const openCount = assetComments.filter((c: { status: string }) => c.status === "open").length;
    const resolvedCount = assetComments.filter((c: { status: string }) => c.status === "resolved").length;

    assetRows += `
      <div class="asset-section">
        <div class="asset-header">
          <h2>${escapeHtml(asset.title)}</h2>
          <div class="asset-meta">
            <span class="badge badge-${safeClassName(asset.status)}">${escapeHtml(asset.status.replaceAll("_", " "))}</span>
            <span class="meta-text">${escapeHtml(asset.file_type)}</span>
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
                    <td><span class="badge badge-${safeClassName(c.status)}">${escapeHtml(c.status)}</span></td>
                    <td class="pin">${c.pin_x != null ? "Yes" : ""}</td>
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
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 400 700;
      font-display: swap;
      src: url('/fonts/inter-latin.woff2') format('woff2');
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
      letter-spacing: 0;
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
      Co-VideoPro Review Platform
    </div>
  </div>

  <div class="summary-bar">
    <div class="stat"><strong>${assets.length}</strong> asset${assets.length !== 1 ? "s" : ""}</div>
    <div class="stat"><strong>${comments.length}</strong> comment${comments.length !== 1 ? "s" : ""}</div>
    <div class="stat"><strong>${comments.filter((comment) => comment.status === "open").length}</strong> open</div>
    <div class="stat"><strong>${comments.filter((comment) => comment.status === "resolved").length}</strong> resolved</div>
  </div>

  ${assetRows}

  <div class="footer">
    Generated by Co-VideoPro — Content Co-op · ${now}
  </div>

  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
      Save as PDF
    </button>
  </div>
</body>
</html>`;

  if (new TextEncoder().encode(html).byteLength > MAX_EXPORT_BYTES) {
    return tooLarge();
  }

  return new NextResponse(html, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; script-src 'unsafe-inline'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
