import { annotationPath } from "@/lib/review/annotation";
import type { AnnotationData } from "@/lib/types/codeliver";
import { DRAFT_STROKE_COLOR } from "./draw";

interface AnnotationThumbnailProps {
  annotations: AnnotationData[];
  className?: string;
}

/**
 * Small vector replay of a saved drawing for the selected-comment chip.
 * Paths are built in normalized 0-1 space against a unit viewBox, so the
 * thumbnail stays resolution-independent (and needs no raster round-trip).
 */
export default function AnnotationThumbnail({ annotations, className }: AnnotationThumbnailProps) {
  const paths = annotations
    .map((annotation) => annotationPath(annotation))
    .filter((path) => path.length > 0);

  if (paths.length === 0) return null;

  return (
    <svg
      data-annotation-thumbnail
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className={className ?? "h-12 w-20 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black"}
      role="img"
      aria-label={`Drawing with ${paths.length} stroke${paths.length === 1 ? "" : "s"}`}
    >
      {paths.map((path, index) => (
        <path
          key={index}
          d={path}
          fill="none"
          stroke={DRAFT_STROKE_COLOR}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
