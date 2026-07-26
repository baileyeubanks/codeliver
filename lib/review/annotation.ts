import type { AnnotationData } from "../types/codeliver";

/**
 * P17 annotation mode — pure stroke/vector math.
 *
 * All geometry lives in normalized 0-1 coordinates (Frame.io model), so a
 * drawing survives resolution changes and replays on any render size. This
 * module has no DOM/canvas access; the canvas layer under
 * components/review/annotation/ maps these primitives to pixels.
 */

export type AnnotationTool = "arrow" | "rectangle" | "freehand";

export interface NormalizedPoint {
  x: number;
  y: number;
}

/** Saved drawings replay while the playhead sits within this of the note. */
export const REPLAY_TOLERANCE_SECONDS = 0.5;

/** Strokes smaller than this (normalized units) are treated as mis-taps. */
export const MIN_STROKE_SPAN = 0.01;

/** Arrowhead length in normalized units. */
export const ARROW_HEAD_LENGTH = 0.04;

const ARROW_HEAD_ANGLE = Math.PI / 7;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Convert a pointer position inside the media surface to normalized
 * coordinates, clamped to the frame. Returns null when the surface reports
 * a non-positive size (layout not settled yet).
 */
export function normalizePoint(
  localX: number,
  localY: number,
  width: number,
  height: number,
): NormalizedPoint | null {
  if (!(width > 0) || !(height > 0)) return null;
  return { x: clamp01(localX / width), y: clamp01(localY / height) };
}

/** Seed an in-progress stroke for `tool` anchored at `point`. */
export function beginStroke(tool: AnnotationTool, point: NormalizedPoint): AnnotationData {
  switch (tool) {
    case "arrow":
      return { kind: "arrow", points: [point.x, point.y, point.x, point.y] };
    case "rectangle":
      // While dragging, width/height stay signed so the anchor is preserved;
      // endStroke normalizes to a positive box.
      return { kind: "rectangle", x: point.x, y: point.y, width: 0, height: 0 };
    case "freehand":
      return { kind: "freehand", points: [point.x, point.y] };
  }
}

/** Advance an in-progress stroke to the current pointer position. */
export function moveStroke(stroke: AnnotationData, point: NormalizedPoint): AnnotationData {
  switch (stroke.kind) {
    case "arrow":
      return { kind: "arrow", points: [stroke.points[0], stroke.points[1], point.x, point.y] };
    case "rectangle":
      return {
        kind: "rectangle",
        x: stroke.x,
        y: stroke.y,
        width: point.x - stroke.x,
        height: point.y - stroke.y,
      };
    case "freehand":
      return { kind: "freehand", points: [...stroke.points, point.x, point.y] };
    default:
      return stroke;
  }
}

function freehandLength(points: number[]): number {
  let length = 0;
  for (let index = 2; index + 1 < points.length; index += 2) {
    length += Math.hypot(points[index] - points[index - 2], points[index + 1] - points[index - 1]);
  }
  return length;
}

/**
 * Finalize a stroke. Returns null for empty/degenerate input so callers can
 * drop mis-taps instead of saving invisible ink. Rectangles are normalized
 * to positive width/height regardless of drag direction.
 */
export function endStroke(stroke: AnnotationData): AnnotationData | null {
  switch (stroke.kind) {
    case "arrow": {
      const [x1, y1, x2, y2] = stroke.points;
      if (Math.hypot(x2 - x1, y2 - y1) < MIN_STROKE_SPAN) return null;
      return stroke;
    }
    case "rectangle": {
      const x = Math.min(stroke.x, stroke.x + stroke.width);
      const y = Math.min(stroke.y, stroke.y + stroke.height);
      const width = Math.abs(stroke.width);
      const height = Math.abs(stroke.height);
      if (width < MIN_STROKE_SPAN || height < MIN_STROKE_SPAN) return null;
      return { kind: "rectangle", x, y, width, height };
    }
    case "freehand": {
      if (stroke.points.length < 4) return null;
      if (freehandLength(stroke.points) < MIN_STROKE_SPAN) return null;
      return stroke;
    }
    default:
      return null;
  }
}

/**
 * Two barb endpoints for an arrow from (x1, y1) to (x2, y2), each
 * `headLength` (normalized units) from the tip.
 */
export function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  headLength: number = ARROW_HEAD_LENGTH,
): [NormalizedPoint, NormalizedPoint] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const barb = (direction: number): NormalizedPoint => ({
    x: x2 - headLength * Math.cos(angle + direction * ARROW_HEAD_ANGLE),
    y: y2 - headLength * Math.sin(angle + direction * ARROW_HEAD_ANGLE),
  });
  return [barb(1), barb(-1)];
}

function formatCoordinate(value: number): string {
  // Stable, compact path output: 4 decimal places max, no trailing zeros.
  return String(Number(value.toFixed(4)));
}

/**
 * Build an SVG path `d` in normalized 0-1 space (pair with viewBox="0 0 1 1"
 * and vector-effect="non-scaling-stroke"). Arrowheads are included. Returns
 * "" for shapes that cannot render as a path (pin/text) or carry no ink.
 */
export function annotationPath(annotation: AnnotationData): string {
  switch (annotation.kind) {
    case "freehand": {
      const { points } = annotation;
      if (points.length < 4) return "";
      const segments = [`M ${formatCoordinate(points[0])} ${formatCoordinate(points[1])}`];
      for (let index = 2; index + 1 < points.length; index += 2) {
        segments.push(`L ${formatCoordinate(points[index])} ${formatCoordinate(points[index + 1])}`);
      }
      return segments.join(" ");
    }
    case "rectangle": {
      const x = Math.min(annotation.x, annotation.x + annotation.width);
      const y = Math.min(annotation.y, annotation.y + annotation.height);
      const width = Math.abs(annotation.width);
      const height = Math.abs(annotation.height);
      if (width <= 0 || height <= 0) return "";
      return [
        `M ${formatCoordinate(x)} ${formatCoordinate(y)}`,
        `h ${formatCoordinate(width)}`,
        `v ${formatCoordinate(height)}`,
        `h ${formatCoordinate(-width)}`,
        "Z",
      ].join(" ");
    }
    case "arrow": {
      const [x1, y1, x2, y2] = annotation.points;
      if (Math.hypot(x2 - x1, y2 - y1) < MIN_STROKE_SPAN) return "";
      const [barbA, barbB] = arrowHeadPoints(x1, y1, x2, y2);
      const tip = `${formatCoordinate(x2)} ${formatCoordinate(y2)}`;
      return [
        `M ${formatCoordinate(x1)} ${formatCoordinate(y1)} L ${tip}`,
        `M ${formatCoordinate(barbA.x)} ${formatCoordinate(barbA.y)} L ${tip}`,
        `M ${formatCoordinate(barbB.x)} ${formatCoordinate(barbB.y)} L ${tip}`,
      ].join(" ");
    }
    default:
      return "";
  }
}

/** True while the playhead is close enough to a note to replay its drawing. */
export function isNearTimecode(
  commentTimecode: number | null | undefined,
  playheadSeconds: number,
  tolerance: number = REPLAY_TOLERANCE_SECONDS,
): boolean {
  if (commentTimecode == null || !Number.isFinite(commentTimecode)) return false;
  return Math.abs(playheadSeconds - commentTimecode) <= tolerance;
}
