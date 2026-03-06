import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const AI_MODEL = process.env.AI_MODEL || "claude-sonnet-4-20250514";

// POST /api/assets/:id/summary — AI-powered review session summary
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  // Get asset info
  const { data: asset } = await getSupabase()
    .from("assets")
    .select("id, title, project_id")
    .eq("id", id)
    .single();

  if (!asset)
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  // Get all comments
  const { data: comments } = await getSupabase()
    .from("comments")
    .select("body, timecode_seconds, timecode_end, status, priority, author_name, created_at")
    .eq("asset_id", id)
    .order("created_at", { ascending: true });

  if (!comments || comments.length === 0) {
    return NextResponse.json({
      summary: "No comments to summarize.",
      themes: [],
      action_items: [],
      priority_order: [],
    });
  }

  // Get approval decisions
  const { data: approvals } = await getSupabase()
    .from("approvals")
    .select("decision, comment, decided_by_name, decided_at")
    .eq("asset_id", id);

  // Format comments for AI analysis
  const commentText = comments
    .map((c, i) => {
      const tc = c.timecode_seconds ? `[${formatTC(c.timecode_seconds)}${c.timecode_end ? ` → ${formatTC(c.timecode_end)}` : ""}]` : "[General]";
      const status = c.status === "resolved" ? " ✅" : "";
      const priority = c.priority && c.priority !== "normal" ? ` [${c.priority.toUpperCase()}]` : "";
      return `${i + 1}. ${tc}${priority}${status} (${c.author_name}): ${c.body}`;
    })
    .join("\n");

  const approvalText = approvals && approvals.length > 0
    ? `\n\nAPPROVAL DECISIONS:\n${approvals.map((a) => `- ${a.decided_by_name}: ${a.decision}${a.comment ? ` — "${a.comment}"` : ""}`).join("\n")}`
    : "";

  const systemPrompt = `You are a review session analyst for a video/content review platform. Summarize the review feedback into actionable intelligence.

Return ONLY valid JSON:
{
  "summary": "2-3 sentence executive summary of the review session",
  "themes": [
    {"theme": "theme name", "comment_count": number, "description": "brief description"}
  ],
  "action_items": [
    {"action": "specific action to take", "priority": "blocker|important|suggestion", "timecode": "HH:MM:SS or null", "source_comments": [comment_numbers]}
  ],
  "priority_order": ["ordered list of actions by importance"],
  "sentiment": "positive|neutral|mixed|negative",
  "sentiment_detail": "1 sentence on overall reviewer sentiment",
  "approval_status": "approved|changes_requested|pending|mixed",
  "estimated_revision_time": "rough estimate in hours"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `ASSET: ${asset.title}\n\nREVIEW COMMENTS:\n${commentText}${approvalText}\n\nSummarize this review session.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "AI error", detail: err }, { status: 500 });
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] || "{}");
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ summary: text, themes: [], action_items: [], priority_order: [] });
  }
}

function formatTC(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
