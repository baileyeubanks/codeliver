export interface CalloutPoint {
  x: number;
  y: number;
}

export interface CalloutRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Returns the nearest card edge to an immutable frame point. The returned
 * coordinates are relative to the frame point, which lets SVG keep following
 * a card while it is dragged without ever changing its persisted pin. */
export function leaderEndpoint(anchor: CalloutPoint, card: CalloutRect): CalloutPoint {
  const x = Math.min(card.right, Math.max(card.left, anchor.x));
  const y = Math.min(card.bottom, Math.max(card.top, anchor.y));
  // Clamping independently is the nearest point on an axis-aligned card,
  // including a corner when the anchor sits diagonally outside it.
  return { x: x - anchor.x, y: y - anchor.y };
}

export function clampCalloutDrag(
  current: CalloutPoint,
  desired: CalloutPoint,
  card: CalloutRect,
  viewport: { width: number; height: number },
  inset = 8,
): CalloutPoint {
  const deltaX = desired.x - current.x;
  const deltaY = desired.y - current.y;
  const constrainedX = Math.min(viewport.width - inset - card.right, Math.max(inset - card.left, deltaX));
  const constrainedY = Math.min(viewport.height - inset - card.bottom, Math.max(inset - card.top, deltaY));
  return { x: current.x + constrainedX, y: current.y + constrainedY };
}
