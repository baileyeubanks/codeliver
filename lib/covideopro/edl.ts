/**
 * Webster — EDL (CMX 3600) export for sequence handoff to Premiere/Resolve.
 * Pure generator: sequence + ordered clips → standards-readable EDL text.
 * The truthful handoff answer to NLE panels (COVIDEOPRO_ENTERPRISE_BENCHMARK.md).
 */

import type { Sequence, SequenceClip } from "./record.ts";

export function secondsToTimecode(seconds: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(seconds * safeFps));
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(frames)}`;
}

export interface EdlClipContext {
  clip: SequenceClip;
  /** Reel name (source asset), max 8 chars for strict CMX readers. */
  reel: string;
  clipName: string;
}

/** Ordered single-track EDL (V1). Multi-track timelines flatten in track order. */
export function generateEdl(
  sequence: Pick<Sequence, "name" | "fps">,
  clips: EdlClipContext[],
): string {
  const fps = Math.max(1, Math.round(sequence.fps));
  const ordered = [...clips].sort(
    (a, b) => a.clip.track_index - b.clip.track_index || a.clip.timeline_in_seconds - b.clip.timeline_in_seconds,
  );

  const lines = [
    `TITLE: ${sequence.name.slice(0, 70)}`,
    "FCM: NON-DROP FRAME",
    "",
  ];

  ordered.forEach((entry, index) => {
    const event = String(index + 1).padStart(3, "0");
    const reel = entry.reel.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).padEnd(8, " ").slice(0, 8);
    const sourceIn = secondsToTimecode(entry.clip.source_in_seconds, fps);
    const sourceOut = secondsToTimecode(entry.clip.source_out_seconds, fps);
    const recordIn = secondsToTimecode(entry.clip.timeline_in_seconds, fps);
    const recordOut = secondsToTimecode(entry.clip.timeline_out_seconds, fps);
    lines.push(
      `${event}  ${reel} V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`,
      `* FROM CLIP NAME: ${entry.clipName}`,
      ...(entry.clip.select_id ? [`* SELECT: ${entry.clip.select_id}`] : []),
    );
  });

  return `${lines.join("\n")}\n`;
}

/** Download helper for browser surfaces. */
export function edlFilename(sequence: Pick<Sequence, "name">): string {
  const base = sequence.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "sequence";
  return `${base}.edl`;
}
