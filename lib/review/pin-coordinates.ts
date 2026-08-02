export function reviewPinPercentToNormalized(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value / 100));
}

export function reviewPinNormalizedToPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value >= 0 && value <= 1) return value * 100;

  // Preserve display compatibility for any pre-normalization records.
  if (value >= 0 && value <= 100) return value;
  return undefined;
}
