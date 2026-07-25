import { arrowHeadPoints } from "@/lib/review/annotation";
import type { AnnotationData } from "@/lib/types/codeliver";

/** Draft strokes use the lime accent; saved replays use the review blue. */
export const DRAFT_STROKE_COLOR = "#156bff";
export const REPLAY_STROKE_COLOR = "#156bff";

/**
 * Shared canvas painter for the live overlay and the WebP rasterizer.
 * Coordinates arrive normalized (0-1) and are scaled to the target surface.
 * Every stroke gets a dark underlay so ink stays legible on any frame.
 */
export function paintAnnotations(
  context: CanvasRenderingContext2D,
  annotations: AnnotationData[],
  width: number,
  height: number,
  color: string,
): void {
  if (width <= 0 || height <= 0) return;

  const lineWidth = Math.max(2.5, Math.min(width, height) * 0.008);

  for (const annotation of annotations) {
    for (const pass of [
      { style: "rgba(0, 0, 0, 0.55)", width: lineWidth * 1.9 },
      { style: color, width: lineWidth },
    ]) {
      context.strokeStyle = pass.style;
      context.lineWidth = pass.width;
      context.lineCap = "round";
      context.lineJoin = "round";
      paintAnnotation(context, annotation, width, height);
    }
  }
}

function paintAnnotation(
  context: CanvasRenderingContext2D,
  annotation: AnnotationData,
  width: number,
  height: number,
): void {
  switch (annotation.kind) {
    case "freehand": {
      const { points } = annotation;
      if (points.length < 4) return;
      context.beginPath();
      context.moveTo(points[0] * width, points[1] * height);
      for (let index = 2; index + 1 < points.length; index += 2) {
        context.lineTo(points[index] * width, points[index + 1] * height);
      }
      context.stroke();
      return;
    }
    case "rectangle": {
      const x = Math.min(annotation.x, annotation.x + annotation.width);
      const y = Math.min(annotation.y, annotation.y + annotation.height);
      const w = Math.abs(annotation.width);
      const h = Math.abs(annotation.height);
      if (w <= 0 || h <= 0) return;
      context.beginPath();
      context.strokeRect(x * width, y * height, w * width, h * height);
      return;
    }
    case "arrow": {
      const [x1, y1, x2, y2] = annotation.points;
      if (Math.hypot(x2 - x1, y2 - y1) <= 0) return;
      context.beginPath();
      context.moveTo(x1 * width, y1 * height);
      context.lineTo(x2 * width, y2 * height);
      const [barbA, barbB] = arrowHeadPoints(x1, y1, x2, y2);
      context.moveTo(barbA.x * width, barbA.y * height);
      context.lineTo(x2 * width, y2 * height);
      context.moveTo(barbB.x * width, barbB.y * height);
      context.lineTo(x2 * width, y2 * height);
      context.stroke();
      return;
    }
    default:
      return;
  }
}
