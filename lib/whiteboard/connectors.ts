/**
 * Elbow connector geometry — pure SVG path computation for node-to-node
 * connectors. Routes leave the source card's right (or left) edge, travel
 * horizontally to a midpoint, then vertically, then horizontally into the
 * target's facing edge, with an arrowhead at the target.
 */

export interface ConnectorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowHead {
  /** Arrow tip (the attachment point on the target card edge). */
  tip: { x: number; y: number };
  /** Base corners of the arrowhead triangle. */
  left: { x: number; y: number };
  right: { x: number; y: number };
}

export const CONNECTOR_STUB_LENGTH = 28;
export const ARROWHEAD_LENGTH = 12;
export const ARROWHEAD_WIDTH = 9;

function centerY(rect: ConnectorRect): number {
  return rect.y + rect.height / 2;
}

/**
 * Compute an elbow path between two cards. Direction is chosen by relative
 * position: when the target sits left of the source the route exits left.
 * Returns an SVG path `d` string in world coordinates.
 */
export function elbowConnectorPath(from: ConnectorRect, to: ConnectorRect): string {
  const fromCy = centerY(from);
  const toCy = centerY(to);
  const forward = from.x + from.width <= to.x;
  const startX = forward ? from.x + from.width : from.x;
  const endX = forward ? to.x : to.x + to.width;
  const direction = forward ? 1 : -1;

  const stubStartX = startX + CONNECTOR_STUB_LENGTH * direction;
  const stubEndX = endX - CONNECTOR_STUB_LENGTH * direction;

  // When the cards overlap horizontally, a straight horizontal run between
  // stubs would invert; fall back to a symmetric mid-x elbow instead.
  const inverted = forward ? stubStartX > stubEndX : stubStartX < stubEndX;
  const midX = inverted ? (startX + endX) / 2 : stubStartX + (stubEndX - stubStartX) / 2;

  return [
    `M ${startX} ${fromCy}`,
    `L ${midX} ${fromCy}`,
    `L ${midX} ${toCy}`,
    `L ${endX} ${toCy}`,
  ].join(" ");
}

/** Arrowhead triangle at the target attachment point, pointing at the card. */
export function connectorArrowHead(from: ConnectorRect, to: ConnectorRect): ArrowHead {
  const forward = from.x + from.width <= to.x;
  const tipX = forward ? to.x : to.x + to.width;
  const tipY = centerY(to);
  const direction = forward ? 1 : -1;
  const baseX = tipX - ARROWHEAD_LENGTH * direction;
  return {
    tip: { x: tipX, y: tipY },
    left: { x: baseX, y: tipY - ARROWHEAD_WIDTH / 2 },
    right: { x: baseX, y: tipY + ARROWHEAD_WIDTH / 2 },
  };
}

/** Serialize an arrowhead as an SVG polygon `points` attribute value. */
export function arrowHeadPoints(head: ArrowHead): string {
  return `${head.tip.x},${head.tip.y} ${head.left.x},${head.left.y} ${head.right.x},${head.right.y}`;
}
