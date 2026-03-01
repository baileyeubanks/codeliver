import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

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

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");
  const type = searchParams.get("type");

  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify ownership
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Reviewer stats mode
  if (type === "reviewers") {
    return getReviewerStats(supabase, projectId);
  }

  // Default: aggregate analytics
  return getAggregateAnalytics(supabase, projectId);
}

async function getAggregateAnalytics(
  supabase: ReturnType<typeof getSupabase>,
  projectId: string
) {
  // Total assets
  const { count: totalAssets } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  // Active reviews (assets with status in_review)
  const { count: activeReviews } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "in_review");

  // Comments this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: commentsThisWeek } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .in(
      "asset_id",
      (
        await supabase
          .from("assets")
          .select("id")
          .eq("project_id", projectId)
      ).data?.map((a: { id: string }) => a.id) ?? []
    )
    .gte("created_at", weekAgo.toISOString());

  // Approval decisions breakdown
  const { data: steps } = await supabase
    .from("approval_steps")
    .select("status, decided_at, created_at")
    .in(
      "asset_id",
      (
        await supabase
          .from("assets")
          .select("id")
          .eq("project_id", projectId)
      ).data?.map((a: { id: string }) => a.id) ?? []
    )
    .neq("status", "pending");

  const decisions: Record<string, number> = {};
  let totalApprovalMs = 0;
  let approvalCount = 0;

  for (const step of steps ?? []) {
    const s = step as { status: string; decided_at: string | null; created_at: string };
    decisions[s.status] = (decisions[s.status] || 0) + 1;
    if (s.decided_at) {
      const diff =
        new Date(s.decided_at).getTime() - new Date(s.created_at).getTime();
      totalApprovalMs += diff;
      approvalCount++;
    }
  }

  const avgApprovalHours =
    approvalCount > 0
      ? Math.round((totalApprovalMs / approvalCount / 3600000) * 10) / 10
      : 0;

  // Comments per day (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentComments } = await supabase
    .from("comments")
    .select("created_at")
    .in(
      "asset_id",
      (
        await supabase
          .from("assets")
          .select("id")
          .eq("project_id", projectId)
      ).data?.map((a: { id: string }) => a.id) ?? []
    )
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  const commentsPerDay: DayCount[] = [];
  const dayMap = new Map<string, number>();

  for (const c of recentComments ?? []) {
    const day = (c as { created_at: string }).created_at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  }

  // Fill in all 30 days
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    commentsPerDay.push({ date: key, count: dayMap.get(key) || 0 });
  }

  return NextResponse.json({
    total_assets: totalAssets ?? 0,
    active_reviews: activeReviews ?? 0,
    comments_this_week: commentsThisWeek ?? 0,
    avg_approval_hours: avgApprovalHours,
    comments_per_day: commentsPerDay,
    decisions,
  });
}

async function getReviewerStats(
  supabase: ReturnType<typeof getSupabase>,
  projectId: string
) {
  const { data: assetIds } = await supabase
    .from("assets")
    .select("id")
    .eq("project_id", projectId);

  const ids = assetIds?.map((a: { id: string }) => a.id) ?? [];

  if (ids.length === 0) {
    return NextResponse.json({ reviewers: [] });
  }

  // Get all approval steps for this project
  const { data: allSteps } = await supabase
    .from("approval_steps")
    .select("assignee_email, status, decided_at, created_at")
    .in("asset_id", ids);

  // Get all comments for this project
  const { data: allComments } = await supabase
    .from("comments")
    .select("author_email")
    .in("asset_id", ids);

  const reviewerMap = new Map<string, {
    decisions: number;
    approvals: number;
    totalResponseMs: number;
    responseCount: number;
    comments: number;
  }>();

  for (const row of (allSteps ?? []) as ReviewerRow[]) {
    if (!row.assignee_email) continue;
    const email = row.assignee_email;

    if (!reviewerMap.has(email)) {
      reviewerMap.set(email, {
        decisions: 0,
        approvals: 0,
        totalResponseMs: 0,
        responseCount: 0,
        comments: 0,
      });
    }

    const stats = reviewerMap.get(email)!;
    if (row.status !== "pending") {
      stats.decisions++;
      if (row.status === "approved" || row.status === "approved_with_changes") {
        stats.approvals++;
      }
      if (row.decided_at) {
        stats.totalResponseMs +=
          new Date(row.decided_at).getTime() -
          new Date(row.created_at).getTime();
        stats.responseCount++;
      }
    }
  }

  // Count comments per reviewer
  for (const c of (allComments ?? []) as { author_email: string | null }[]) {
    if (!c.author_email) continue;
    if (!reviewerMap.has(c.author_email)) {
      reviewerMap.set(c.author_email, {
        decisions: 0,
        approvals: 0,
        totalResponseMs: 0,
        responseCount: 0,
        comments: 0,
      });
    }
    reviewerMap.get(c.author_email)!.comments++;
  }

  const reviewers: ReviewerStat[] = [];
  for (const [email, stats] of reviewerMap) {
    reviewers.push({
      email,
      avg_response_hours:
        stats.responseCount > 0
          ? Math.round(
              (stats.totalResponseMs / stats.responseCount / 3600000) * 10
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

  return NextResponse.json({ reviewers });
}
