import type { AnnotationData } from "@/lib/types/codeliver";
import { DRAFT_STROKE_COLOR, paintAnnotations } from "./draw";

/**
 * Rasterize normalized strokes to a WebP data-URI for the comment payload
 * (canvas.toDataURL("image/webp", 0.8)). The vector JSON stays the source of
 * truth; this raster is the portable preview. Returns null when rasterizing
 * is impossible (SSR, zero-size, or a canvas failure) so submit can proceed
 * with the vector payload alone.
 */
export function rasterizeAnnotations(
  annotations: AnnotationData[],
  width: number,
  height: number,
): string | null {
  if (annotations.length === 0 || typeof document === "undefined") return null;
  if (!(width > 0) || !(height > 0)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const context = canvas.getContext("2d");
  if (!context) return null;

  paintAnnotations(context, annotations, canvas.width, canvas.height, DRAFT_STROKE_COLOR);

  try {
    return canvas.toDataURL("image/webp", 0.8);
  } catch {
    return null;
  }
}
