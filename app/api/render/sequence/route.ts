import { mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { NextRequest } from "next/server";

import { renderConcatPlan } from "@/lib/covideopro/render.ts";
import type { ConcatPlanEntry } from "@/lib/covideopro/render-plan.ts";
import { apiError, apiJson } from "@/lib/api/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demo/local sequence render. Accepts an already-validated concat plan whose
 * files must resolve under public/demo (traversal-guarded), renders with the
 * installed ffmpeg, and returns the public URL + probed duration.
 */

interface PlanBodyEntry {
  file: string;
  inSeconds: number;
  outSeconds: number;
}

function demoSourceRoot(): string {
  return resolve(process.cwd(), "public", "demo");
}

function guardDemoFile(file: string): string | null {
  if (typeof file !== "string" || file.length === 0 || file.includes("\0")) return null;
  const resolved = resolve(demoSourceRoot(), file.replace(/^\/+/, ""));
  return resolved.startsWith(`${demoSourceRoot()}${sep}`) ? resolved : null;
}

export async function POST(req: NextRequest) {
  let body: { plan?: PlanBodyEntry[]; outName?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request", "RENDER_REQUEST_INVALID", 400);
  }

  const entries = Array.isArray(body.plan) ? body.plan : [];
  if (entries.length === 0 || entries.length > 200) {
    return apiError("A render needs 1–200 plan entries.", "RENDER_PLAN_INVALID", 400);
  }

  const plan: ConcatPlanEntry[] = [];
  for (const entry of entries) {
    const file = guardDemoFile(entry?.file ?? "");
    if (!file) {
      return apiError("Render sources must live under the demo media root.", "RENDER_SOURCE_FORBIDDEN", 403);
    }
    if (
      typeof entry.inSeconds !== "number" ||
      typeof entry.outSeconds !== "number" ||
      !(entry.outSeconds > entry.inSeconds) ||
      entry.inSeconds < 0
    ) {
      return apiError("Plan entries need valid in/out seconds.", "RENDER_PLAN_INVALID", 400);
    }
    plan.push({
      clip: {
        id: "render-plan",
        sequence_id: "render",
        asset_id: "render",
        version_id: null,
        select_id: null,
        track_index: 0,
        timeline_in_seconds: 0,
        timeline_out_seconds: entry.outSeconds - entry.inSeconds,
        source_in_seconds: entry.inSeconds,
        source_out_seconds: entry.outSeconds,
      },
      file,
    });
  }

  const outName = (body.outName ?? "sequence-render").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80) || "sequence-render";
  const rendersDir = join(demoSourceRoot(), "renders");
  mkdirSync(rendersDir, { recursive: true });
  const outPath = join(rendersDir, `${outName}.mp4`);

  try {
    const result = await renderConcatPlan(plan, outPath);
    return apiJson({
      url: `/demo/renders/${outName}.mp4`,
      durationSeconds: result.durationSeconds,
    });
  } catch {
    return apiError("Render failed in this environment.", "RENDER_UNAVAILABLE", 503);
  }
}
