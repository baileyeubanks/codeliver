"use client";

import {
  ArrowUpRight,
  Eraser,
  MessageSquarePlus,
  PenLine,
  Pencil,
  Square,
  X,
} from "lucide-react";
import type { AnnotationTool } from "@/lib/review/annotation";

interface AnnotationToolbarProps {
  drawMode: boolean;
  tool: AnnotationTool;
  strokeCount: number;
  onToggleDrawMode: () => void;
  onToolChange: (tool: AnnotationTool) => void;
  onClear: () => void;
  onAddComment: () => void;
}

const TOOLS: { id: AnnotationTool; label: string; icon: typeof ArrowUpRight }[] = [
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "freehand", label: "Freehand", icon: PenLine },
];

const buttonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * Floating draw-mode controls rendered inside the review overlay. Everything
 * stops propagation so toolbar taps never fall through to frame-pin clicks.
 */
export default function AnnotationToolbar({
  drawMode,
  tool,
  strokeCount,
  onToggleDrawMode,
  onToolChange,
  onClear,
  onAddComment,
}: AnnotationToolbarProps) {
  return (
    <div
      data-annotation-toolbar
      className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-black/70 p-1 shadow-lg backdrop-blur"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        data-draw-toggle
        aria-pressed={drawMode}
        title={drawMode ? "Exit draw mode" : "Draw on the frame"}
        aria-label={drawMode ? "Exit draw mode" : "Draw on the frame"}
        className={`${buttonClass} ${drawMode ? "bg-[var(--accent)] text-black hover:bg-[var(--accent)]" : ""}`}
        onClick={onToggleDrawMode}
      >
        <Pencil size={15} />
      </button>

      {drawMode ? (
        <>
          <span className="h-4 w-px bg-white/25" aria-hidden="true" />
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              data-draw-tool={id}
              aria-pressed={tool === id}
              title={label}
              aria-label={label}
              className={`${buttonClass} ${tool === id ? "bg-[var(--accent)] text-black hover:bg-[var(--accent)]" : ""}`}
              onClick={() => onToolChange(id)}
            >
              <Icon size={15} />
            </button>
          ))}
          <span className="h-4 w-px bg-white/25" aria-hidden="true" />
          <button
            type="button"
            data-draw-clear
            title="Clear strokes"
            aria-label="Clear strokes"
            className={buttonClass}
            disabled={strokeCount === 0}
            onClick={onClear}
          >
            <Eraser size={15} />
          </button>
          <button
            type="button"
            data-draw-comment
            title="Comment with this drawing"
            aria-label="Comment with this drawing"
            className={buttonClass}
            disabled={strokeCount === 0}
            onClick={onAddComment}
          >
            <MessageSquarePlus size={15} />
          </button>
          <button
            type="button"
            data-draw-exit
            title="Cancel draw mode (Esc)"
            aria-label="Cancel draw mode (Esc)"
            className={buttonClass}
            onClick={onToggleDrawMode}
          >
            <X size={15} />
          </button>
        </>
      ) : null}
    </div>
  );
}
