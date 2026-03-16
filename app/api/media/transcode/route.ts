/**
 * Transcode API
 *
 * POST /api/media/transcode — Trigger transcode for an asset
 *   body: { assetId, inputPath, versionId? }
 *
 * GET /api/media/transcode?assetId=... — Get transcode status
 *
 * POST /api/media/transcode?action=process — Process next pending job (worker endpoint)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { enqueueTranscode, claimNextJob } from "@/lib/workers/queue";
import { processJob } from "@/lib/workers/transcode";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action");

  // Worker endpoint: process next pending job
  if (action === "process") {
    const job = await claimNextJob();
    if (!job) {
      return NextResponse.json({ message: "No pending jobs" });
    }

    // Process asynchronously — don't block the response
    processJob(job).catch((err) =>
      console.error("[transcode] Async process error:", err)
    );

    return NextResponse.json({
      message: "Processing started",
      jobId: job.id,
      assetId: job.asset_id,
    });
  }

  // Enqueue new transcode job
  const body = await req.json();
  const { assetId, inputPath, versionId } = body;

  if (!assetId || !inputPath) {
    return NextResponse.json(
      { error: "assetId and inputPath required" },
      { status: 400 }
    );
  }

  const job = await enqueueTranscode({ assetId, inputPath, versionId });
  if (!job) {
    return NextResponse.json(
      { error: "Failed to enqueue job" },
      { status: 500 }
    );
  }

  // Auto-trigger processing
  processJob(job).catch((err) =>
    console.error("[transcode] Async process error:", err)
  );

  return NextResponse.json({
    message: "Transcode queued and processing",
    job,
  });
}

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assetId = req.nextUrl.searchParams.get("assetId");
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (jobId) {
    const { data } = await getSupabase()
      .from("transcode_jobs")
      .select()
      .eq("id", jobId)
      .single();

    return NextResponse.json({ job: data });
  }

  if (assetId) {
    const { data } = await getSupabase()
      .from("transcode_jobs")
      .select()
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ job: data });
  }

  // List recent jobs
  const { data } = await getSupabase()
    .from("transcode_jobs")
    .select()
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ jobs: data ?? [] });
}
