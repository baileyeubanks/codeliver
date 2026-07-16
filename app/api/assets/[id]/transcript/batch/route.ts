import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import {
  createSafeDemoTranscriptProvider,
  planTranscriptBatch,
  type TranscriptBudget,
} from "@/lib/transcript/core";
import {
  buildSafeDemoTranscriptRequest,
  durableMediaIntelligenceUnavailable,
  transcriptSourceFromVersion,
} from "@/lib/transcript/server";
import { resolveAssetVersion } from "@/lib/versions";

function response(body: unknown, init?: ResponseInit) {
  const result = NextResponse.json(body, init);
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return response({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "editor");
  if (!assetAccess.ok) return response({ error: assetAccess.error }, { status: assetAccess.status });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action === "execute") {
    return response(
      durableMediaIntelligenceUnavailable("Transcript batch execution"),
      { status: 503 },
    );
  }
  if (!body || body.action !== "plan") {
    return response(
      { error: "action must be plan or execute; durable execution is currently fail-closed" },
      { status: 400 },
    );
  }
  if (body.provider !== "safe-demo") {
    return response({ error: "Only safe-demo batch planning is available" }, { status: 501 });
  }
  if (!Array.isArray(body.version_ids) || body.version_ids.length === 0 || body.version_ids.length > 100) {
    return response({ error: "version_ids must contain between 1 and 100 exact version ids" }, { status: 400 });
  }
  if (body.version_ids.some((value) => typeof value !== "string" || !value.trim())) {
    return response({ error: "Every version id must be a non-empty string" }, { status: 400 });
  }
  const clientRequestId = typeof body.client_request_id === "string" ? body.client_request_id.trim() : "";
  if (!clientRequestId) return response({ error: "client_request_id is required" }, { status: 400 });
  const budgetRecord = body.budget as Record<string, unknown> | undefined;
  const budget: TranscriptBudget = {
    maxCostMicrounits: budgetRecord?.max_cost_microunits as number,
    maxLatencyMs: budgetRecord?.max_latency_ms as number,
  };
  const maxConcurrency = body.max_concurrency;
  if (!Number.isInteger(maxConcurrency)) {
    return response({ error: "max_concurrency must be an integer" }, { status: 400 });
  }

  try {
    const requests = [];
    for (const versionId of body.version_ids as string[]) {
      const versionLookup = await resolveAssetVersion({ assetId, versionId });
      if (!versionLookup.ok) {
        return response({ error: versionLookup.error, versionId }, { status: versionLookup.status });
      }
      const source = transcriptSourceFromVersion(versionLookup.version);
      requests.push(
        buildSafeDemoTranscriptRequest({
          source,
          clientRequestId: `${clientRequestId}:${versionId}`,
          budget,
        }),
      );
    }
    const plan = planTranscriptBatch({
      adapter: createSafeDemoTranscriptProvider(),
      requests,
      maxConcurrency: maxConcurrency as number,
      budget,
    });
    return response({
      plan,
      executionStarted: false,
      persistence: "not_written",
      sourceMediaMutation: false,
      externalProviderCall: false,
    });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Batch plan failed" }, { status: 400 });
  }
}
