/**
 * Whiteboard viewport math — pure, DOM-free, unit-testable.
 *
 * Coordinate model: the canvas is an unbounded "world" plane. A viewport maps
 * world → screen with `screen = (world - viewport.origin) * viewport.zoom`.
 * Panning moves the origin; zooming scales around an anchored screen point so
 * the world point under the cursor stays put.
 */

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardViewport {
  /** World coordinate rendered at screen pixel (0, 0). */
  originX: number;
  originY: number;
  /** Screen pixels per world unit. 1 = 100%. */
  zoom: number;
}

export const MIN_VIEWPORT_ZOOM = 0.25;
export const MAX_VIEWPORT_ZOOM = 2.5;
export const DEFAULT_VIEWPORT_ZOOM = 1;
export const WHITEBOARD_GRID_SIZE = 16;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_VIEWPORT_ZOOM;
  return Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, zoom));
}

/** Convert a screen point (canvas-local pixels) into world coordinates. */
export function screenToWorld(
  viewport: WhiteboardViewport,
  point: WhiteboardPoint,
): WhiteboardPoint {
  return {
    x: point.x / viewport.zoom + viewport.originX,
    y: point.y / viewport.zoom + viewport.originY,
  };
}

/** Convert a world point into screen pixels for the given viewport. */
export function worldToScreen(
  viewport: WhiteboardViewport,
  point: WhiteboardPoint,
): WhiteboardPoint {
  return {
    x: (point.x - viewport.originX) * viewport.zoom,
    y: (point.y - viewport.originY) * viewport.zoom,
  };
}

/** Pan by a screen-space drag delta (e.g. pointer movement in pixels). */
export function panViewport(
  viewport: WhiteboardViewport,
  deltaScreenX: number,
  deltaScreenY: number,
): WhiteboardViewport {
  return {
    ...viewport,
    originX: viewport.originX - deltaScreenX / viewport.zoom,
    originY: viewport.originY - deltaScreenY / viewport.zoom,
  };
}

/**
 * Zoom around a cursor anchor: the world point under `anchorScreen` must map
 * back to the same screen point after zooming. `factor` multiplies the zoom
 * (e.g. 1.1 to zoom in one wheel notch, 1/1.1 to zoom out).
 */
export function zoomViewportAt(
  viewport: WhiteboardViewport,
  anchorScreen: WhiteboardPoint,
  factor: number,
): WhiteboardViewport {
  const nextZoom = clampZoom(viewport.zoom * factor);
  if (!Number.isFinite(factor) || factor <= 0 || nextZoom === viewport.zoom) {
    return { ...viewport, zoom: nextZoom };
  }
  const anchorWorld = screenToWorld(viewport, anchorScreen);
  return {
    originX: anchorWorld.x - anchorScreen.x / nextZoom,
    originY: anchorWorld.y - anchorScreen.y / nextZoom,
    zoom: nextZoom,
  };
}

/** Snap a single scalar to the nearest grid multiple. */
export function snapToGrid(value: number, gridSize = WHITEBOARD_GRID_SIZE): number {
  if (!Number.isFinite(value) || gridSize <= 0) return 0;
  return Math.round(value / gridSize) * gridSize;
}

/** Snap a point to the grid. */
export function snapPointToGrid(
  point: WhiteboardPoint,
  gridSize = WHITEBOARD_GRID_SIZE,
): WhiteboardPoint {
  return { x: snapToGrid(point.x, gridSize), y: snapToGrid(point.y, gridSize) };
}

/**
 * Deterministic hand-drawn rotation for a node id, in degrees, within ±1.6°.
 * Same id → same tilt, so cards don't dance on re-render.
 */
export function rotationForId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  // Map the hash into [-1.6, 1.6] with 0.2° steps.
  return Math.round((((hash % 17) / 16) * 3.2 - 1.6) * 5) / 5;
}
