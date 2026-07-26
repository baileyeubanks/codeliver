"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginStroke,
  endStroke,
  moveStroke,
  normalizePoint,
  type AnnotationTool,
} from "@/lib/review/annotation";
import type { AnnotationData } from "@/lib/types/codeliver";
import { DRAFT_STROKE_COLOR, REPLAY_STROKE_COLOR, paintAnnotations } from "./draw";

interface AnnotationCanvasProps {
  /** Draw mode on: the canvas eats pointer events and records strokes. */
  active: boolean;
  tool: AnnotationTool;
  /** Committed draft strokes for the comment being composed. */
  strokes: AnnotationData[];
  /** Saved drawings replayed from nearby comments (read-only). */
  replay?: AnnotationData[];
  onStroke?: (annotation: AnnotationData) => void;
}

/**
 * Pointer-drawn canvas absolutely positioned over the media frame (video or
 * image) inside the existing review overlay container. All strokes are
 * stored normalized 0-1, so the canvas only ever translates to pixels.
 */
export default function AnnotationCanvas({
  active,
  tool,
  strokes,
  replay = [],
  onStroke,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<AnnotationData | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      setSize({ width: container.clientWidth, height: container.clientHeight });
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    paintAnnotations(context, replay, size.width, size.height, REPLAY_STROKE_COLOR);
    paintAnnotations(context, strokes, size.width, size.height, DRAFT_STROKE_COLOR);
    if (draft) {
      paintAnnotations(context, [draft], size.width, size.height, DRAFT_STROKE_COLOR);
    }
  }, [size, strokes, replay, draft]);

  const pointFromEvent = useCallback((event: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return normalizePoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!active || event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft(beginStroke(tool, point));
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!active || !draft) return;
    const point = pointFromEvent(event);
    if (!point) return;
    setDraft((current) => (current ? moveStroke(current, point) : current));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!active || !draft) return;
    const point = pointFromEvent(event);
    const finished = endStroke(point ? moveStroke(draft, point) : draft);
    setDraft(null);
    if (finished) onStroke?.(finished);
  }

  return (
    <div
      ref={containerRef}
      data-annotation-canvas
      data-draw-active={active ? "true" : "false"}
      data-stroke-count={strokes.length}
      data-replay-count={replay.length}
      className={`absolute inset-0 ${active ? "cursor-crosshair touch-none" : "pointer-events-none"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDraft(null)}
      {...(active
        ? {
            onClick: (event: React.MouseEvent) => event.stopPropagation(),
          }
        : {})}
    >
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
    </div>
  );
}
