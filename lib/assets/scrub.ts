/**
 * P26 Asset Library — hover-scrub mapping.
 * Maps a pointer position over a card's thumbnail to a clamped <video> seek
 * time. Pure and honest: the real video element seeks, no sprite fakes.
 */

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Horizontal pointer fraction across the thumbnail, clamped to [0, 1]. */
export function scrubFraction(pointerX: number, rectLeft: number, rectWidth: number): number {
  if (!Number.isFinite(pointerX) || !Number.isFinite(rectLeft)) return 0;
  if (!Number.isFinite(rectWidth) || rectWidth <= 0) return 0;
  return clamp01((pointerX - rectLeft) / rectWidth);
}

/** Fraction of a duration, clamped to [0, duration]. */
export function scrubTimeSeconds(fraction: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return clamp01(fraction) * durationSeconds;
}

/** One call from a pointermove handler to the video's next currentTime. */
export function scrubTimeForPointer(
  pointerX: number,
  rectLeft: number,
  rectWidth: number,
  durationSeconds: number,
): number {
  return scrubTimeSeconds(scrubFraction(pointerX, rectLeft, rectWidth), durationSeconds);
}
