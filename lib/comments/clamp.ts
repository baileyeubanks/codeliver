// Pure clamp-threshold logic for long comment bodies.

/** Comments longer than this many rendered lines get clamped. */
export const CLAMP_LINE_THRESHOLD = 3;

/**
 * Approximate characters per line in the comments rail at its typical width.
 * Used only to decide whether the clamp UI appears; the actual visual clamp
 * is CSS (`line-clamp-3`).
 */
export const CLAMP_CHARS_PER_LINE = 72;

/** Estimate how many rendered lines `text` wraps to. */
export function estimateLineCount(
  text: string,
  charsPerLine: number = CLAMP_CHARS_PER_LINE,
): number {
  if (!text) return 0;
  const width = Math.max(1, charsPerLine);
  return text
    .split("\n")
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / width)),
      0,
    );
}

/** Whether a body exceeds the clamp threshold and needs Show more/less. */
export function shouldClamp(
  text: string,
  charsPerLine: number = CLAMP_CHARS_PER_LINE,
): boolean {
  return estimateLineCount(text, charsPerLine) > CLAMP_LINE_THRESHOLD;
}
