/**
 * Co-VideoPro — sequence render: concat plan + ffmpeg execution.
 * Pure plan builder (testable) + server-side render with ffprobe verification.
 * Design: docs/superpowers/specs/2026-07-17-sequence-review-render-design.md
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Sequence, SequenceClip } from "./record.ts";

const execFileAsync = promisify(execFile);

export interface ConcatPlanEntry {
  clip: SequenceClip;
  file: string;
}

export type ConcatPlan = ConcatPlanEntry[] | { error: string };

/** Ordered, validated render plan. Rejects gaps/overlaps and missing files. */
export function buildConcatPlan(
  sequence: Pick<Sequence, "id" | "fps">,
  clips: SequenceClip[],
  resolveFile: (assetId: string) => string | null,
): ConcatPlan {
  const ordered = clips
    .filter((clip) => clip.sequence_id === sequence.id)
    .sort((a, b) => a.timeline_in_seconds - b.timeline_in_seconds);
  if (ordered.length === 0) return { error: "Sequence has no clips to render." };

  let cursor = 0;
  for (const clip of ordered) {
    if (Math.abs(clip.timeline_in_seconds - cursor) > 0.01) {
      return { error: "Timeline is not contiguous for rendering (gap or overlap)." };
    }
    cursor = clip.timeline_out_seconds;
  }

  const plan: ConcatPlanEntry[] = [];
  for (const clip of ordered) {
    const file = resolveFile(clip.asset_id);
    if (!file) return { error: "Every clip needs a playable source file before rendering." };
    plan.push({ clip, file });
  }
  return plan;
}

function buildRenderArgs(plan: ConcatPlanEntry[], outPath: string): string[] {
  const args: string[] = ["-y"];
  for (const entry of plan) {
    args.push(
      "-ss", String(entry.clip.source_in_seconds),
      "-t", String(entry.clip.source_out_seconds - entry.clip.source_in_seconds),
      "-i", entry.file,
    );
  }
  const labels = plan.map((_, index) => `[${index}:v][${index}:a]`).join("");
  args.push(
    "-filter_complex", `${labels}concat=n=${plan.length}:v=1:a=1[v][a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-movflags", "+faststart",
    outPath,
  );
  return args;
}

/** Render the plan with ffmpeg (per-input seek + concat filter), verify with ffprobe. */
export async function renderConcatPlan(
  plan: ConcatPlanEntry[],
  outPath: string,
  { ffmpegPath = "ffmpeg", ffprobePath = "ffprobe" }: { ffmpegPath?: string; ffprobePath?: string } = {},
): Promise<RenderResult> {
  await execFileAsync(ffmpegPath, buildRenderArgs(plan, outPath), { maxBuffer: 16 * 1024 * 1024 });
  return { durationSeconds: await probeDurationSeconds(ffprobePath, outPath) };
}

async function probeDurationSeconds(ffprobePath: string, file: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration)) throw new Error("ffprobe could not read the rendered duration.");
  return duration;
}

export interface RenderResult {
  durationSeconds: number;
}
