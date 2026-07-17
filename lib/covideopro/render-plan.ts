/**
 * Co‑ProVideo — sequence render PLAN (pure, client-safe).
 * Execution lives in ./render.ts (server-only, node builtins).
 */

import type { Sequence, SequenceClip } from "./record.ts";

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
