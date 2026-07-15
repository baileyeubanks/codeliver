import { NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import {
  PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
  PORTFOLIO_LIMITS,
  InMemoryPortfolioAnalyticsExecutionLedger,
  PortfolioAnalyticsError,
  SupabasePortfolioAnalyticsSource,
  deriveM2OwnerPortfolioPrincipal,
  executePortfolioAnalytics,
  parsePortfolioAnalyticsQuery,
} from "@/lib/portfolio-analytics";

export const runtime = "nodejs";

const executionLedger = new InMemoryPortfolioAnalyticsExecutionLedger();

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const advertisedBytes = Number(contentLength);
    if (!Number.isSafeInteger(advertisedBytes) || advertisedBytes < 0) {
      throw new PortfolioAnalyticsError("INVALID_QUERY", "Invalid Content-Length", 400);
    }
    if (advertisedBytes > PORTFOLIO_LIMITS.maxRequestBytes) {
      throw new PortfolioAnalyticsError("RESOURCE_LIMIT", "Portfolio query body is too large", 413);
    }
  }

  if (!request.body) {
    throw new PortfolioAnalyticsError("INVALID_QUERY", "JSON body required", 400);
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PORTFOLIO_LIMITS.maxRequestBytes) {
        await reader.cancel();
        throw new PortfolioAnalyticsError("RESOURCE_LIMIT", "Portfolio query body is too large", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof PortfolioAnalyticsError) throw error;
    throw new PortfolioAnalyticsError("INVALID_QUERY", "Body must be valid UTF-8 JSON", 400);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new PortfolioAnalyticsError("INVALID_QUERY", "Body must be valid JSON", 400);
  }
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof PortfolioAnalyticsError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          recovery: error.recovery,
          ...(error.details ? { details: error.details } : {}),
        },
        contractVersion: PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
      },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("Portfolio analytics query failed", { error: "unexpected" });
  return NextResponse.json(
    {
      error: {
        code: "SOURCE_FAILURE",
        message: "Portfolio analytics source unavailable",
        recovery: "Retry later; if the failure persists, provide the receipt or trace identifier to support.",
      },
      contractVersion: PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
    },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const { user, supabase } = await requireAuthWithClient();
  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          recovery: "Sign in and retry the same request.",
        },
        contractVersion: PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const query = parsePortfolioAnalyticsQuery(await readBoundedJson(request));
    const result = await executePortfolioAnalytics(
      deriveM2OwnerPortfolioPrincipal(user.id),
      query,
      new SupabasePortfolioAnalyticsSource(supabase),
      executionLedger,
    );
    console.info("Portfolio analytics receipt", {
      receiptId: result.receipt.receiptId,
      traceId: result.receipt.traceId,
      snapshotId: result.receipt.snapshotId,
      acceptedFactCount: result.receipt.acceptedFactCount,
      duplicateFactCount: result.receipt.duplicateFactCount,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Analytics-Contract": PORTFOLIO_ANALYTICS_CONTRACT_VERSION,
        "X-Analytics-Receipt": result.receipt.receiptId,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
