// Relative import (not "@/...") so node:test can load this module directly.
import { DEFAULT_TIMECODE_FPS } from "../../components/player/timecode.ts";

/**
 * P16 — frame-accurate review player primitives. Pure functions so the frame
 * math, shuttle, loop-region cycle, and chapters model are unit-testable
 * without a DOM (the browser halves live in components/player/*).
 */

/** Transport preset ladder shared by the speed menu and the J/L shuttle. */
export const REVIEW_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Per-asset frame rate with the P16 default (24fps) when the asset carries no
 * honest metadata. Fractional rates (24000/1001) pass through untouched —
 * rounding 23.976 to 24 is the classic timecode-drift bug.
 */
export function resolveReviewFrameRate(fps?: number | null): number {
  return typeof fps === "number" && Number.isFinite(fps) && fps > 0
    ? fps
    : DEFAULT_TIMECODE_FPS;
}

/** Clamp a ±N frame step to the [0, duration] range. */
export function stepFrames(
  currentTime: number,
  frameDelta: number,
  fps: number,
  duration?: number,
): number {
  const frameDuration = 1 / resolveReviewFrameRate(fps);
  const base = Number.isFinite(currentTime) ? currentTime : 0;
  const max = typeof duration === "number" && Number.isFinite(duration) && duration > 0
    ? duration
    : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(0, base + frameDelta * frameDuration), max);
}

/**
 * J/K/L shuttle without fake reverse: HTML5 media elements cannot play
 * backwards, so J steps the rate down the preset ladder and L steps it up.
 * Rates between presets snap to the nearest preset before stepping.
 */
export function nextShuttleRate(
  currentRate: number,
  direction: -1 | 1,
  rates: readonly number[] = REVIEW_PLAYBACK_RATES,
): number {
  if (rates.length === 0) return 1;
  let nearest = 0;
  for (let i = 1; i < rates.length; i += 1) {
    if (Math.abs(rates[i] - currentRate) < Math.abs(rates[nearest] - currentRate)) {
      nearest = i;
    }
  }
  const next = Math.min(rates.length - 1, Math.max(0, nearest + direction));
  return rates[next];
}

export interface LoopRegion {
  inPoint: number | null;
  outPoint: number | null;
}

/**
 * A/B loop cycle: open region → set in → set out (sorted, so scrubbing
 * backwards between presses still yields a valid region) → clear.
 */
export function nextLoopRegion(region: LoopRegion, timeSeconds: number): LoopRegion {
  const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
  if (region.inPoint == null) return { inPoint: time, outPoint: null };
  if (region.outPoint == null) {
    return {
      inPoint: Math.min(region.inPoint, time),
      outPoint: Math.max(region.inPoint, time),
    };
  }
  return { inPoint: null, outPoint: null };
}

export function isLoopClosed(region: LoopRegion): boolean {
  return (
    region.inPoint != null &&
    region.outPoint != null &&
    region.outPoint > region.inPoint
  );
}

/**
 * Where the playhead must jump when it runs past the out point, or null when
 * no wrap is due. Pure boundary check; the video element performs the seek.
 */
export function loopWrapTarget(region: LoopRegion, currentTime: number): number | null {
  if (!isLoopClosed(region)) return null;
  return currentTime >= (region.outPoint as number) ? region.inPoint : null;
}

export interface ChapterComment {
  id?: string;
  timecode_seconds: number | null;
  status: string;
  body: string;
}

export interface ReviewChapterCue<T extends ChapterComment = ChapterComment> {
  /** 0-based integer frame of the cue start (Frame.io comment model). */
  startFrame: number;
  startSeconds: number;
  /** Start of the next cue, or the media duration for the last one. */
  endSeconds: number;
  label: string;
  status: string;
  comment: T;
}

/**
 * Vidstack-style chapters model: timed comments become ordered cue ranges so
 * the timeline can render them as pins without re-deriving order or ranges.
 * Untimed, non-finite, or negative-time comments are excluded.
 */
export function buildCommentChapters<T extends ChapterComment>(
  comments: readonly T[],
  durationSeconds: number,
  fps: number = DEFAULT_TIMECODE_FPS,
): ReviewChapterCue<T>[] {
  const safeFps = resolveReviewFrameRate(fps);
  const timed = comments
    .filter(
      (comment) =>
        typeof comment.timecode_seconds === "number" &&
        Number.isFinite(comment.timecode_seconds) &&
        comment.timecode_seconds >= 0,
    )
    .slice()
    .sort((a, b) => (a.timecode_seconds as number) - (b.timecode_seconds as number));

  const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;

  return timed.map((comment, index) => {
    const startSeconds = comment.timecode_seconds as number;
    const next = timed[index + 1];
    const endSeconds = next
      ? (next.timecode_seconds as number)
      : hasDuration
        ? durationSeconds
        : startSeconds;
    return {
      startFrame: Math.floor(startSeconds * safeFps),
      startSeconds,
      endSeconds,
      label: comment.body.trim(),
      status: comment.status,
      comment,
    };
  });
}
