import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

interface BrandCheckResult {
  overall_score: number;
  categories: {
    name: string;
    status: "pass" | "fail" | "warning";
    score: number;
    details: string;
  }[];
  issues: {
    category: string;
    severity: "high" | "medium" | "low";
    description: string;
    timecode_seconds?: number;
  }[];
  summary: string;
}

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { asset_id } = body as { asset_id?: string };

  if (!asset_id) {
    return NextResponse.json({ error: "asset_id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch asset details
  const { data: asset, error: assetErr } = await supabase
    .from("assets")
    .select("id, name, file_type, project_id")
    .eq("id", asset_id)
    .single();

  if (assetErr || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const assetData = asset as {
    id: string;
    name: string;
    file_type: string;
    project_id: string;
  };

  // Fetch recent comments for additional context
  const { data: comments } = await supabase
    .from("comments")
    .select("body, author_name")
    .eq("asset_id", asset_id)
    .order("created_at", { ascending: false })
    .limit(20);

  const commentContext = (comments ?? [])
    .map((c: { body: string; author_name: string }) => `${c.author_name}: ${c.body}`)
    .join("\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 503 }
    );
  }

  const prompt = `You are a brand compliance checker for creative assets. Analyze this asset and its feedback.

Asset: "${assetData.name}" (${assetData.file_type})
Recent feedback:
${commentContext || "No comments yet."}

Evaluate the asset across these categories: colors, typography, logo, composition.
For each category, determine if it passes, fails, or needs a warning.
Rate each 0-100 and provide an overall score.

Respond ONLY with valid JSON matching this structure:
{
  "overall_score": <number 0-100>,
  "categories": [
    { "name": "colors", "status": "pass|fail|warning", "score": <number>, "details": "<string>" },
    { "name": "typography", "status": "pass|fail|warning", "score": <number>, "details": "<string>" },
    { "name": "logo", "status": "pass|fail|warning", "score": <number>, "details": "<string>" },
    { "name": "composition", "status": "pass|fail|warning", "score": <number>, "details": "<string>" }
  ],
  "issues": [
    { "category": "<string>", "severity": "high|medium|low", "description": "<string>" }
  ],
  "summary": "<one paragraph summary>"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `AI API error: ${errText}` },
        { status: 502 }
      );
    }

    const aiResult = await response.json();
    const text =
      aiResult.content?.[0]?.type === "text"
        ? aiResult.content[0].text
        : "";

    // Parse the JSON from AI response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const brandResult = JSON.parse(jsonMatch[0]) as BrandCheckResult;

    // Store result
    const { data: check, error: insertErr } = await supabase
      .from("brand_checks")
      .insert({
        asset_id,
        results: brandResult as unknown as Record<string, unknown>,
        score: brandResult.overall_score,
      })
      .select("id, score, results, created_at")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ brand_check: check });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Brand check failed: ${message}` },
      { status: 500 }
    );
  }
}
