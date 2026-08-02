import { NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";

const MAX_REQUEST_URL_LENGTH = 2_048;
const MAX_ANALYTICS_ASSETS = 1_000;
const MAX_ANALYTICS_EVENTS = 10_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_QUERY_PARAMS = new Set(["project_id", "type"]);

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, Authorization",
};

type DataClient = Awaited<
  ReturnType<typeof requireAuthWithClient>
>["supabase"];

interface DayCount {
  date: string;
  count: number;
}

interface ReviewerRow {
  assignee_email: string;
  status: string;
  decided_at: string | null;
  created_at: string;
}

interface ReviewerStat {
  email: string;
  avg_response_hours: number;
  approval_rate: number;
  total_comments: number;
  total_decisions: number;
}

type AnalyticsRequest = {
  projectId: string;
  type: "aggregate" | "reviewers";
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function invalidRequest() {
  return json({ error: "Invalid analytics request" }, 400);
}

function unavailable() {
  return json({ error: "Project analytics are temporarily unavailable" }, 503);
}

function projectAccessFailure(status: number) {
  return status >= 500
    ? unavailable()
    : json({ error: "Project not found" }, 404);
}

function parseAnalyticsRequest(req: Request): AnalyticsRequest | null {
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
  const types = url.searchParams.getAll("type");
  if (
    projectIds.length !== 1 ||
    !UUID_PATTERN.test(projectIds[0]) ||
    types.length > 1 ||
    (types.length === 1 && types[0] !== "reviewers")
  ) {
    return null;
  }

  return {
    projectId: projectIds[0],
    type: types[0] === "reviewers" ? "reviewers" : "aggregate",
  };
}

export async function GET(req: Request) {
  try {
    const { user, supabase } = await requireAuthWithClient();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const input = parseAnalyticsRequest(req);
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

    const { data: assetRows, error: assetError } = await supabase
      .from("assets")
      .select("id, status")
      .eq("project_id", input.projectId)
      .limit(MAX_ANALYTICS_ASSETS + 1);
    if (assetError) return unavailable();
    if ((assetRows?.length ?? 0) > MAX_ANALYTICS_ASSETS) {
      return json({ error: "Project is too large to analyze" }, 413);
    }

    const assets = (assetRows ?? []) as Array<{ id: string; status: string }>;
    const assetIds = assets.map((asset) => asset.id);

    if (input.type === "reviewers") {
      return getReviewerStats(supabase, assetIds);
    }

    return getAggregateAnalytics(supabase, assets, assetIds);
  } catch {
    return unavailable();
  }
}

async function getAggregateAnalytics(
  supabase: DataClient,
  assets: Array<{ id: string; status: string }>,
  assetIds: string[],
) {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const commentsResult = assetIds.length
    ? await supabase
        .from("comments")
        .select("created_at")
        .in("asset_id", assetIds)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: true })
        .limit(MAX_ANALYTICS_EVENTS + 1)
    : { data: [], error: null };

  const approvalsResult = assetIds.length
    ? await supabase
        .from("approvals")
        .select("status, decided_at, created_at")
        .in("asset_id", assetIds)
        .neq("status", "pending")
        .limit(MAX_ANALYTICS_EVENTS + 1)
    : { data: [], error: null };

  if (commentsResult.error || approvalsResult.error) return unavailable();
  if (
    (commentsResult.data?.length ?? 0) > MAX_ANALYTICS_EVENTS ||
    (approvalsResult.data?.length ?? 0) > MAX_ANALYTICS_EVENTS
  ) {
    return json({ error: "Project is too large to analyze" }, 413);
  }

  const comments = (commentsResult.data ?? []) as Array<{ created_at: string }>;
  const approvals = (approvalsResult.data ?? []) as Array<{
    status: string;
    decided_at: string | null;
    created_at: string;
  }>;
  const commentsThisWeek = comments.filter(
    (comment) => new Date(comment.created_at).getTime() >= weekAgo.getTime(),
  ).length;

  const decisions: Record<string, number> = {};
  let totalApprovalMs = 0;
  let approvalCount = 0;

  for (const approval of approvals) {
    decisions[approval.status] = (decisions[approval.status] || 0) + 1;
    if (approval.decided_at) {
      const responseMs =
        new Date(approval.decided_at).getTime() -
        new Date(approval.created_at).getTime();
      if (Number.isFinite(responseMs) && responseMs >= 0) {
        totalApprovalMs += responseMs;
        approvalCount++;
      }
    }
  }

  const avgApprovalHours =
    approvalCount > 0
      ? Math.round((totalApprovalMs / approvalCount / 3_600_000) * 10) / 10
      : 0;

  const dayMap = new Map<string, number>();
  for (const comment of comments) {
    const day = comment.created_at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  }

  const commentsPerDay: DayCount[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    commentsPerDay.push({ date: key, count: dayMap.get(key) || 0 });
  }

  return json({
    total_assets: assets.length,
    active_reviews: assets.filter((asset) => asset.status === "in_review").length,
    comments_this_week: commentsThisWeek,
    avg_approval_hours: avgApprovalHours,
    comments_per_day: commentsPerDay,
    decisions,
  });
}

async function getReviewerStats(supabase: DataClient, assetIds: string[]) {
  if (assetIds.length === 0) return json({ reviewers: [] });

  const { data: allSteps, error: stepsError } = await supabase
    .from("approvals")
    .select("assignee_email, status, decided_at, created_at")
    .in("asset_id", assetIds)
    .limit(MAX_ANALYTICS_EVENTS + 1);

  const { data: allComments, error: commentsError } = await supabase
    .from("comments")
    .select("author_email")
    .in("asset_id", assetIds)
    .limit(MAX_ANALYTICS_EVENTS + 1);

  if (stepsError || commentsError) return unavailable();
  if (
    (allSteps?.length ?? 0) > MAX_ANALYTICS_EVENTS ||
    (allComments?.length ?? 0) > MAX_ANALYTICS_EVENTS
  ) {
    return json({ error: "Project is too large to analyze" }, 413);
  }

  const reviewerMap = new Map<
    string,
    {
      decisions: number;
      approvals: number;
      totalResponseMs: number;
      responseCount: number;
      comments: number;
    }
  >();

  function reviewer(email: string) {
    const existing = reviewerMap.get(email);
    if (existing) return existing;
    const created = {
      decisions: 0,
      approvals: 0,
      totalResponseMs: 0,
      responseCount: 0,
      comments: 0,
    };
    reviewerMap.set(email, created);
    return created;
  }

  for (const row of (allSteps ?? []) as ReviewerRow[]) {
    if (!row.assignee_email) continue;
    const stats = reviewer(row.assignee_email);
    if (row.status === "pending") continue;

    stats.decisions++;
    if (row.status === "approved" || row.status === "approved_with_changes") {
      stats.approvals++;
    }
    if (row.decided_at) {
      const responseMs =
        new Date(row.decided_at).getTime() - new Date(row.created_at).getTime();
      if (Number.isFinite(responseMs) && responseMs >= 0) {
        stats.totalResponseMs += responseMs;
        stats.responseCount++;
      }
    }
  }

  for (const comment of (allComments ?? []) as Array<{
    author_email: string | null;
  }>) {
    if (comment.author_email) reviewer(comment.author_email).comments++;
  }

  const reviewers: ReviewerStat[] = [];
  for (const [email, stats] of reviewerMap) {
    reviewers.push({
      email,
      avg_response_hours:
        stats.responseCount > 0
          ? Math.round(
              (stats.totalResponseMs / stats.responseCount / 3_600_000) * 10,
            ) / 10
          : 0,
      approval_rate:
        stats.decisions > 0
          ? Math.round((stats.approvals / stats.decisions) * 100)
          : 0,
      total_comments: stats.comments,
      total_decisions: stats.decisions,
    });
  }

  return json({ reviewers });
}
