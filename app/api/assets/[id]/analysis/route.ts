import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import {
  analyzeTranscript,
  audioAnalysisTelemetry,
  DEFAULT_AUDIO_ANALYSIS_BUDGET,
  type AudioAnalysisBudget,
} from "@/lib/audio-analysis/core";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
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

function versionIdFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function analysisBudget(value: unknown): AudioAnalysisBudget {
  if (value === undefined) return DEFAULT_AUDIO_ANALYSIS_BUDGET;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("budget must be an object");
  }
  const record = value as Record<string, unknown>;
  const budget: AudioAnalysisBudget = {
    maxEstimatedLatencyMs: record.max_estimated_latency_ms as number,
    maxInputTokens: record.max_input_tokens as number,
    maxCandidates: record.max_candidates as number,
    maxCostMicrounits: record.max_cost_microunits as number,
  };
  if (
    !Number.isInteger(budget.maxEstimatedLatencyMs) ||
    !Number.isInteger(budget.maxInputTokens) ||
    !Number.isInteger(budget.maxCandidates) ||
    !Number.isInteger(budget.maxCostMicrounits)
  ) {
    throw new TypeError("Every analysis budget value must be an integer");
  }
  return Object.freeze(budget);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return response({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "viewer");
  if (!assetAccess.ok) return response({ error: assetAccess.error }, { status: assetAccess.status });

  const versionId = versionIdFrom(new URL(req.url).searchParams.get("version_id"));
  if (!versionId) {
    return response(
      { error: "version_id is required; analysis decisions never float across media versions" },
      { status: 400 },
    );
  }
  const versionLookup = await resolveAssetVersion({ assetId, versionId });
  if (!versionLookup.ok) return response({ error: versionLookup.error }, { status: versionLookup.status });

  const { data, error } = await getSupabase()
    .from("edit_decisions")
    .select("*")
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .in("source", ["filler_scan", "silence_scan"])
    .order("start_seconds", { ascending: true });
  if (error) return response({ error: error.message }, { status: 500 });

  return response({
    items: data ?? [],
    version: versionLookup.version,
    sourceMediaMutation: false,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return response({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const assetAccess = await getAssetAccess(assetId, user.id, "editor");
  if (!assetAccess.ok) return response({ error: assetAccess.error }, { status: assetAccess.status });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    (body.action !== "preview" && body.action !== "record_proposals" && body.action !== "enqueue")
  ) {
    return response({ error: "action must be preview, enqueue, or record_proposals" }, { status: 400 });
  }
  const versionId = versionIdFrom(body.version_id);
  if (!versionId) return response({ error: "version_id is required" }, { status: 400 });
  const versionLookup = await resolveAssetVersion({ assetId, versionId });
  if (!versionLookup.ok) return response({ error: versionLookup.error }, { status: versionLookup.status });

  try {
    const source = transcriptSourceFromVersion(versionLookup.version);
    const parsedTranscript = parseTranscriptDocument(body.transcript);
    if (!parsedTranscript.ok) {
      return response({ error: "Invalid transcript document", details: parsedTranscript.errors }, { status: 400 });
    }
    const transcript = parsedTranscript.value;
    if (!isSameTranscriptSource(transcript.source, source)) {
      return response({ error: "Transcript is not bound to the requested media version" }, { status: 409 });
    }
    const run = analyzeTranscript({
      transcript,
      budget: analysisBudget(body.budget),
    });

    if (body.action === "preview") {
      return response({
        analysis: run,
        telemetry: audioAnalysisTelemetry(run),
        persistence: "not_written",
        sourceMediaMutation: false,
      });
    }

    if (body.action === "enqueue") {
      return response(
        {
          ...durableMediaIntelligenceUnavailable("Audio-analysis enqueue"),
          analysisRunId: run.runId,
          sourceChecksumPresent: source.mediaSha256 !== null,
        },
        { status: 503 },
      );
    }

    if (transcript.provenance.provider.providerId !== "safe-demo") {
      return response(
        {
          error: "Current proposal recording is limited to server-verifiable safe-demo replay documents",
          nextAuthority: "durable trusted transcript revisions",
        },
        { status: 409 },
      );
    }
    if (!Array.isArray(body.candidate_ids) || body.candidate_ids.length === 0) {
      return response({ error: "candidate_ids must select at least one previewed candidate" }, { status: 400 });
    }
    const selectedIds = new Set(
      body.candidate_ids.filter((value): value is string => typeof value === "string"),
    );
    if (selectedIds.size !== body.candidate_ids.length) {
      return response({ error: "candidate_ids must be unique strings" }, { status: 400 });
    }
    const candidates = run.candidates.filter((candidate) => selectedIds.has(candidate.id));
    if (candidates.length !== selectedIds.size) {
      return response({ error: "One or more candidate ids are not in the deterministic preview" }, { status: 409 });
    }

    return response(
      {
        ...durableMediaIntelligenceUnavailable("Analysis proposal persistence"),
        analysisRunId: run.runId,
        validatedCandidateIds: candidates.map((candidate) => candidate.id),
        persistence: "not_written",
        transactionRequired: true,
        sourceChecksumPresent: source.mediaSha256 !== null,
        sourceMediaMutation: false,
      },
      { status: 503 },
    );
  } catch (error) {
    return response(
      { error: error instanceof Error ? error.message : "Audio analysis failed" },
      { status: 400 },
    );
  }
}
