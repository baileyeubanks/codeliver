import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import { hasRecordedAnalysisProvenance } from "@/lib/audio-analysis/core";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { withAssetRouteBoundary } from "../../../asset-route-boundary";
import {
  durableMediaIntelligenceUnavailable,
  transcriptSourceFromVersion,
} from "@/lib/transcript/server";
import { resolveAssetVersion } from "@/lib/versions";

function response(body: unknown, init?: ResponseInit) {
  const result = NextResponse.json(body, init);
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}

async function PATCHHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return response({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "editor");
  if (!assetAccess.ok) return response({ error: assetAccess.error }, { status: assetAccess.status });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const decisionId = typeof body?.decision_id === "string" ? body.decision_id.trim() : "";
  const versionId = typeof body?.version_id === "string" ? body.version_id.trim() : "";
  if (action !== "accept" && action !== "reject") {
    return response({ error: "action must be accept or reject" }, { status: 400 });
  }
  if (!decisionId || !versionId) {
    return response({ error: "decision_id and version_id are required" }, { status: 400 });
  }
  const versionLookup = await resolveAssetVersion({ assetId, versionId });
  if (!versionLookup.ok) return response({ error: versionLookup.error }, { status: versionLookup.status });

  const supabase = getSupabase();
  const current = await supabase
    .from("edit_decisions")
    .select("*")
    .eq("id", decisionId)
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .in("source", ["filler_scan", "silence_scan"])
    .maybeSingle();
  if (current.error) return response({ error: "Analysis decision data is unavailable", code: "BACKEND_UNAVAILABLE" }, { status: 503 });
  if (!current.data) return response({ error: "Analysis decision not found" }, { status: 404 });
  try {
    const source = transcriptSourceFromVersion(versionLookup.version);
    if (!hasRecordedAnalysisProvenance(current.data.metadata, source)) {
      return response({ error: "Analysis decision provenance is incomplete or stale" }, { status: 409 });
    }
  } catch (error) {
    return response(
      { error: "Invalid media version provenance", code: "INVALID_MEDIA_VERSION" },
      { status: 409 },
    );
  }

  const targetStatus = action === "accept" ? "accepted" : "rejected";
  if (current.data.status === targetStatus) {
    return response({ item: current.data, idempotentReplay: true, sourceMediaMutation: false });
  }
  if (current.data.status !== "proposed") {
    return response(
      { error: `Cannot ${action} a ${current.data.status} decision`, item: current.data },
      { status: 409 },
    );
  }

  return response(
    {
      ...durableMediaIntelligenceUnavailable(`Analysis decision ${action}`),
      item: current.data,
      requestedStatus: targetStatus,
      persistence: "not_written",
      transactionRequired: true,
      sourceMediaMutation: false,
    },
    { status: 503 },
  );
}

export const PATCH = withAssetRouteBoundary(PATCHHandler);
