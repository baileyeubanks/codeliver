interface MediaPointInput {
  localX: number;
  localY: number;
  containerWidth: number;
  containerHeight: number;
  mediaWidth: number;
  mediaHeight: number;
}

interface ShortcutPolicyInput {
  key: string;
  insideControl: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

export function projectPointIntoMedia({
  localX,
  localY,
  containerWidth,
  containerHeight,
  mediaWidth,
  mediaHeight,
}: MediaPointInput): { x: number; y: number } | null {
  if (
    ![localX, localY, containerWidth, containerHeight, mediaWidth, mediaHeight].every(Number.isFinite) ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    mediaWidth <= 0 ||
    mediaHeight <= 0
  ) {
    return null;
  }

  const mediaRatio = mediaWidth / mediaHeight;
  const containerRatio = containerWidth / containerHeight;
  const renderedWidth = mediaRatio > containerRatio
    ? containerWidth
    : containerHeight * mediaRatio;
  const renderedHeight = mediaRatio > containerRatio
    ? containerWidth / mediaRatio
    : containerHeight;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;
  const mediaX = localX - offsetX;
  const mediaY = localY - offsetY;

  if (mediaX < 0 || mediaY < 0 || mediaX > renderedWidth || mediaY > renderedHeight) {
    return null;
  }

  return {
    x: (mediaX / renderedWidth) * 100,
    y: (mediaY / renderedHeight) * 100,
  };
}

export function normalizeReviewSeekStep(seconds: number): number {
  if (!Number.isFinite(seconds)) return 1;
  return Math.min(10, Math.max(1, Math.round(seconds)));
}

export function normalizeReviewShortcutKey(key: string): string {
  return key === "Space" || key === "Spacebar" ? " " : key;
}

export function shouldIgnoreReviewShortcut(input: ShortcutPolicyInput): boolean {
  const key = normalizeReviewShortcutKey(input.key);
  return Boolean(
    input.defaultPrevented ||
    input.isComposing ||
    input.altKey ||
    input.ctrlKey ||
    input.metaKey ||
    input.insideControl ||
    (input.repeat && (key === " " || key.toLowerCase() === "k" || key === "ArrowDown")),
  );
}
