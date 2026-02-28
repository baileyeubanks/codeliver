import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { asset_id } = await req.json();
  if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });

  // Get all comments for this asset
  const { data: comments } = await getSupabase()
    .from("comments")
    .select("body, author_name, timecode_seconds, status")
    .eq("asset_id", asset_id)
    .order("created_at", { ascending: true });

  if (!comments || comments.length === 0) {
    return NextResponse.json({ summary: "No comments to summarize." });
  }

  const commentText = comments
    .map((c) => {
      const time = c.timecode_seconds ? `[${Math.floor(c.timecode_seconds / 60)}:${String(Math.floor(c.timecode_seconds % 60)).padStart(2, "0")}]` : "";
      return `${c.author_name} ${time}: ${c.body} (${c.status})`;
    })
    .join("\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Summarize these review comments into a concise executive brief. Group by theme, note any action items, and highlight unresolved issues.\n\nComments:\n${commentText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }

  const data = await response.json();
  const summary = data.content?.[0]?.text ?? "Could not generate summary.";

  return NextResponse.json({ summary });
}
