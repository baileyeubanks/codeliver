import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import {
  composeAcceptedEditDecisions,
  hasRecordedAnalysisProvenance,
  type RecordedAnalysisEditDecision,
} from "@/lib/audio-analysis/core";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { transcriptSourceFromVersion } from "@/lib/transcript/server";
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
  if (!body || body.action !== "preview") {
    return response(
      { error: "action must be preview; this endpoint never renders or publishes media" },
      { status: 400 },
    );
  }
  const versionId = typeof body.version_id === "string" ? body.version_id.trim() : "";
  if (!versionId) return response({ error: "version_id is required" }, { status: 400 });
  const versionLookup = await resolveAssetVersion({ assetId, versionId });
  if (!versionLookup.ok) return response({ error: versionLookup.error }, { status: versionLookup.status });

  const { data, error } = await getSupabase()
    .from("edit_decisions")
    .select("id, asset_id, version_id, status, decision_type, start_seconds, end_seconds, metadata")
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .eq("status", "accepted")
    .in("source", ["filler_scan", "silence_scan"])
    .order("start_seconds", { ascending: true });
  if (error) return response({ error: error.message }, { status: 500 });

  try {
    const source = transcriptSourceFromVersion(versionLookup.version);
    if ((data ?? []).some((item) => !hasRecordedAnalysisProvenance(item.metadata, source))) {
      return response({ error: "Analysis decision provenance is incomplete or stale" }, { status: 409 });
    }
    const decisions: RecordedAnalysisEditDecision[] = (data ?? []).map((item) => ({
      id: item.id,
      assetId: item.asset_id,
      versionId: item.version_id,
      status: item.status,
      decisionType: item.decision_type,
      startSeconds: item.start_seconds,
      endSeconds: item.end_seconds,
    }));
    const composition = composeAcceptedEditDecisions(source, decisions);
    return response({
      composition,
      renderStarted: false,
      publicationAllowed: false,
      sourceMediaMutation: false,
    });
  } catch (compositionError) {
    return response(
      { error: compositionError instanceof Error ? compositionError.message : "Composition preview failed" },
      { status: 409 },
    );
  }
}
