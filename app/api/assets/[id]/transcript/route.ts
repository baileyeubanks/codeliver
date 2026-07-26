import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/responses";
import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { withAssetRouteBoundary } from "../../asset-route-boundary";
import {
  createSafeDemoTranscriptProvider,
  invokeTranscriptProvider,
  transcriptFromLegacyRow,
  transcriptTelemetry,
  type LegacyTranscriptionRow,
  type TranscriptBudget,
} from "@/lib/transcript/core";
import {
  buildSafeDemoTranscriptRequest,
  durableMediaIntelligenceUnavailable,
  transcriptSourceFromVersion,
} from "@/lib/transcript/server";
import { resolveAssetVersion } from "@/lib/versions";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function explicitVersionId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseBudget(body: Record<string, unknown>): TranscriptBudget | undefined {
  if (body.budget === undefined) return undefined;
  if (!body.budget || typeof body.budget !== "object" || Array.isArray(body.budget)) {
    throw new TypeError("budget must be an object");
  }
  const budget = body.budget as Record<string, unknown>;
  return {
    maxCostMicrounits: budget.max_cost_microunits as number,
    maxLatencyMs: budget.max_latency_ms as number,
  };
}

async function GETHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "viewer");
  if (!assetAccess.ok) {
    return noStoreJson({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const versionId = explicitVersionId(new URL(req.url).searchParams.get("version_id"));
  if (!versionId) {
    return noStoreJson(
      { error: "version_id is required; transcript reads never float to the current version" },
      { status: 400 },
    );
  }
  const versionLookup = await resolveAssetVersion({ assetId, versionId });
  if (!versionLookup.ok) {
    return noStoreJson({ error: versionLookup.error }, { status: versionLookup.status });
  }

  let source;
  try {
    source = transcriptSourceFromVersion(versionLookup.version);
  } catch (error) {
    return noStoreJson(
      { error: "Invalid media version", code: "INVALID_REQUEST" },
      { status: 409 },
    );
  }

  const { data, error } = await getSupabase()
    .from("transcriptions")
    .select("id, asset_id, version_id, language, status, created_at, segments")
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return apiError("Transcript data is unavailable", "BACKEND_UNAVAILABLE", 503);
  if (!data) {
    return noStoreJson({ transcript: null, source, version: versionLookup.version });
  }

  try {
    const transcript = transcriptFromLegacyRow(data as LegacyTranscriptionRow, source);
    return noStoreJson({
      transcript,
      telemetry: transcriptTelemetry(transcript),
      version: versionLookup.version,
      storageFormat: "legacy_row_adapted",
    });
  } catch (conversionError) {
    return noStoreJson(
      {
        error: "Stored transcript is invalid",
        code: "INVALID_TRANSCRIPT",
        transcriptId: data.id,
      },
      { status: 422 },
    );
  }
}

async function POSTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return noStoreJson({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "editor");
  if (!assetAccess.ok) {
    return noStoreJson({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return noStoreJson({ error: "Transcript request body must be an object" }, { status: 400 });
  }
  if (body.action === "enqueue") {
    return noStoreJson(
      durableMediaIntelligenceUnavailable("Transcript enqueue"),
      { status: 503 },
    );
  }
  if (body.action !== "preview") {
    return noStoreJson(
      { error: "action must be preview or enqueue; durable enqueue is currently fail-closed" },
      { status: 400 },
    );
  }
  if (body.provider !== "safe-demo") {
    return noStoreJson(
      {
        error: "Only the network-free safe-demo provider is installed",
        availableProviders: ["safe-demo"],
        externalProviderCallsEnabled: false,
      },
      { status: 501 },
    );
  }
  const versionId = explicitVersionId(body.version_id);
  if (!versionId) {
    return noStoreJson(
      { error: "version_id is required; transcript previews must bind to one exact media version" },
      { status: 400 },
    );
  }
  const clientRequestId =
    typeof body.client_request_id === "string" ? body.client_request_id : "";
  const versionLookup = await resolveAssetVersion({ assetId, versionId });
  if (!versionLookup.ok) {
    return noStoreJson({ error: versionLookup.error }, { status: versionLookup.status });
  }

  try {
    const source = transcriptSourceFromVersion(versionLookup.version);
    const request = buildSafeDemoTranscriptRequest({
      source,
      clientRequestId,
      languageTag: typeof body.language_tag === "string" ? body.language_tag : null,
      budget: parseBudget(body),
    });
    const result = await invokeTranscriptProvider(
      createSafeDemoTranscriptProvider(),
      request,
      {
        operation: "preview",
        explicitUserAction: true,
        credentialsPresent: false,
        allowNetwork: false,
        budgetReservationId: null,
      },
    );
    return noStoreJson({
      transcript: result.transcript,
      estimate: result.estimate,
      telemetry: transcriptTelemetry(result.transcript),
      persistence: "not_written",
      sourceMediaMutation: false,
      externalProviderCall: false,
    });
  } catch (error) {
    return noStoreJson(
      { error: "Transcript preview failed", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }
}

export const GET = withAssetRouteBoundary(GETHandler);
export const POST = withAssetRouteBoundary(POSTHandler);
