/**
 * Collision-aware overlay positioning (flip + shift) shared by every
 * popover/menu in the app. Pure math, unit-tested in
 * tests/overlay-position.test.ts — no DOM access here.
 */

export type OverlaySide = "bottom" | "top";
export type OverlayAlign = "start" | "end";

export interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface OverlayPositionInput {
  anchor: OverlayRect;
  overlay: { width: number; height: number };
  viewport: { width: number; height: number };
  /** Preferred side of the anchor; flips when there is no room. */
  side?: OverlaySide;
  /** Which anchor edge the overlay aligns to. */
  align?: OverlayAlign;
  /** Gap between anchor and overlay. */
  offset?: number;
  /** Minimum distance kept from every viewport edge. */
  padding?: number;
}

export interface OverlayPosition {
  top: number;
  left: number;
  side: OverlaySide;
}

export function computeOverlayPosition({
  anchor,
  overlay,
  viewport,
  side = "bottom",
  align = "end",
  offset = 8,
  padding = 8,
}: OverlayPositionInput): OverlayPosition {
  const spaceBelow = viewport.height - anchor.top - anchor.height;
  const spaceAbove = anchor.top;

  let resolvedSide = side;
  if (side === "bottom" && overlay.height + offset + padding > spaceBelow && spaceAbove > spaceBelow) {
    resolvedSide = "top";
  } else if (side === "top" && overlay.height + offset + padding > spaceAbove && spaceBelow > spaceAbove) {
    resolvedSide = "bottom";
  }

  const top = resolvedSide === "bottom"
    ? anchor.top + anchor.height + offset
    : anchor.top - overlay.height - offset;
  const left = align === "end"
    ? anchor.left + anchor.width - overlay.width
    : anchor.left;

  return {
    side: resolvedSide,
    top: Math.round(clamp(top, padding, viewport.height - overlay.height - padding)),
    left: Math.round(clamp(left, padding, viewport.width - overlay.width - padding)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
