/**
 * Webster — sequence render EXECUTION (server-only).
 * Plan building lives in ./render-plan.ts (client-safe).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ConcatPlanEntry } from "./render-plan.ts";

const execFileAsync = promisify(execFile);

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

/** Render the plan with ffmpeg (per-input seek + concat filter), verify with ffprobe. */
export async function renderConcatPlan(
  plan: ConcatPlanEntry[],
  outPath: string,
  { ffmpegPath = "ffmpeg", ffprobePath = "ffprobe" }: { ffmpegPath?: string; ffprobePath?: string } = {},
): Promise<RenderResult> {
  await execFileAsync(ffmpegPath, buildRenderArgs(plan, outPath), { maxBuffer: 16 * 1024 * 1024 });
  return { durationSeconds: await probeDurationSeconds(ffprobePath, outPath) };
}
