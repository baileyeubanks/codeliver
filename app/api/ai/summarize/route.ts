import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import {
  buildReviewSummaryPrompt,
  normalizeReviewSummaryRequest,
  parseAnthropicReviewResponse,
  parseReviewSummaryResult,
  prepareReviewComments,
  REVIEW_SUMMARY_MAX_COMMENTS,
} from "@/lib/ai/review-summary";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const MAX_REQUEST_BYTES = 4_096;
const PROVIDER_TIMEOUT_MS = 30_000;

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(value, { ...init, headers });
}

export async function POST(request: Request) {
  const user = await requireAuth();
  if (!user) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return noStoreJson({ error: "Request body is too large" }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  const input = normalizeReviewSummaryRequest(body);
  if (!input.ok) return noStoreJson({ error: input.error }, { status: 400 });

  const { assetId, versionId, mode } = input.value;
  const supabase = getSupabase();
  const access = await getAssetAccess(assetId, user.id, "member", supabase);
  if (!access.ok) {
    return noStoreJson({ error: access.error }, { status: access.status });
  }

  const { data: version, error: versionError } = await supabase
    .from("versions")
    .select("id")
    .eq("id", versionId)
    .eq("asset_id", assetId)
    .maybeSingle();
  if (versionError) {
    return noStoreJson({ error: "Version access could not be verified" }, { status: 500 });
  }
  if (!version) return noStoreJson({ error: "Version not found" }, { status: 404 });

  if (process.env.CODELIVER_AI_EXTERNAL_PROCESSING_ENABLED !== "true") {
    return noStoreJson(
      { error: "External AI processing is disabled for this environment" },
      { status: 503 },
    );
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return noStoreJson({ error: "AI service is not configured" }, { status: 503 });
  }

  const { data: commentRows, error: commentsError } = await supabase
    .from("comments")
    .select("body, status, timecode_seconds")
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .order("created_at", { ascending: true })
    .limit(REVIEW_SUMMARY_MAX_COMMENTS + 1);
  if (commentsError) {
    return noStoreJson({ error: "Review comments could not be loaded" }, { status: 500 });
  }

  const prepared = prepareReviewComments(commentRows ?? []);
  if (!prepared.ok) {
    const status = prepared.error.startsWith("Too many") || prepared.error.includes("limit")
      ? 413
      : 500;
    return noStoreJson({ error: prepared.error }, { status });
  }
  if (prepared.value.length === 0) {
    return noStoreJson(
      mode === "summary"
        ? {
            sentiment: "neutral",
            themes: [],
            action_items: [],
            summary: "No comments to summarize.",
          }
        : { suggestions: [] },
    );
  }

  const prompt = buildReviewSummaryPrompt(mode, prepared.value);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: mode === "summary" ? 1_024 : 1_536,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) {
      return noStoreJson({ error: "The AI provider rejected the request" }, { status: 502 });
    }

    const providerBody = await response.json().catch(() => null);
    const providerResult = parseAnthropicReviewResponse(providerBody);
    if (!providerResult.ok) {
      return noStoreJson({ error: providerResult.error }, { status: 502 });
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(providerResult.value.text);
    } catch {
      return noStoreJson({ error: "The AI provider returned invalid JSON" }, { status: 502 });
    }
    const result = parseReviewSummaryResult(decoded, mode, prepared.value.length);
    if (!result.ok) return noStoreJson({ error: result.error }, { status: 502 });

    return noStoreJson({
      ...result.value,
      scope: { asset_id: assetId, version_id: versionId },
      usage: {
        operation: "ai_generation",
        input_tokens: providerResult.value.inputTokens,
        output_tokens: providerResult.value.outputTokens,
        state: "observed_not_committed",
      },
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    console.error("AI review-summary request failed", error instanceof Error ? error.name : "unknown");
    return noStoreJson(
      { error: timedOut ? "The AI request timed out" : "AI review analysis failed" },
      { status: timedOut ? 504 : 500 },
    );
  }
}
