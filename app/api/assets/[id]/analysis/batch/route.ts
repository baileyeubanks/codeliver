import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import {
  DEFAULT_AUDIO_ANALYSIS_BUDGET,
  planAudioAnalysisBatch,
  type AudioAnalysisBudget,
} from "@/lib/audio-analysis/core";
import { requireAuth } from "@/lib/auth";
import {
  isSameTranscriptSource,
  parseTranscriptDocument,
} from "@/lib/transcript/core";
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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return response({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "editor");
  if (!assetAccess.ok) return response({ error: assetAccess.error }, { status: assetAccess.status });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action === "execute") {
    return response(
      durableMediaIntelligenceUnavailable("Audio-analysis batch execution"),
      { status: 503 },
    );
  }
  if (!body || body.action !== "plan") {
    return response(
      { error: "action must be plan or execute; durable execution is currently fail-closed" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.transcripts) || body.transcripts.length === 0 || body.transcripts.length > 100) {
    return response({ error: "transcripts must contain between 1 and 100 documents" }, { status: 400 });
  }
  const maxConcurrency = body.max_concurrency;
  if (!Number.isInteger(maxConcurrency)) {
    return response({ error: "max_concurrency must be an integer" }, { status: 400 });
  }
  const budgetRecord = body.budget as Record<string, unknown> | undefined;
  const budget: AudioAnalysisBudget = budgetRecord
    ? {
        maxEstimatedLatencyMs: budgetRecord.max_estimated_latency_ms as number,
        maxInputTokens: budgetRecord.max_input_tokens as number,
        maxCandidates: budgetRecord.max_candidates as number,
        maxCostMicrounits: budgetRecord.max_cost_microunits as number,
      }
    : DEFAULT_AUDIO_ANALYSIS_BUDGET;

  try {
    const transcripts = body.transcripts.map((value) => {
      const parsed = parseTranscriptDocument(value);
      if (!parsed.ok) throw new TypeError(`Invalid transcript: ${parsed.errors.join("; ")}`);
      return parsed.value;
    });
    for (const transcript of transcripts) {
      if (transcript.source.assetId !== assetId) throw new TypeError("Batch transcript belongs to another asset");
      const versionLookup = await resolveAssetVersion({ assetId, versionId: transcript.source.versionId });
      if (!versionLookup.ok) throw new TypeError(versionLookup.error);
      const source = transcriptSourceFromVersion(versionLookup.version);
      if (!isSameTranscriptSource(source, transcript.source)) {
        throw new TypeError("Batch transcript source identity is stale or mismatched");
      }
    }
    const plan = planAudioAnalysisBatch({
      transcripts,
      maxConcurrency: maxConcurrency as number,
      budget,
    });
    return response({
      plan,
      executionStarted: false,
      persistence: "not_written",
      sourceMediaMutation: false,
    });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Analysis batch plan failed" }, { status: 400 });
  }
}
