"use client";

import {
  MapPin,
  Square,
  Pencil,
  ArrowUpRight,
  Type,
  Undo2,
  Redo2,
  Trash2,
} from "lucide-react";
import {
  useAnnotationStore,
  ANNOTATION_COLORS,
} from "@/lib/stores/annotationStore";
import type { AnnotationType } from "@/lib/types/codeliver";

const TOOLS: { type: AnnotationType; icon: typeof MapPin; label: string }[] = [
  { type: "pin", icon: MapPin, label: "Pin" },
  { type: "rectangle", icon: Square, label: "Rectangle" },
  { type: "freehand", icon: Pencil, label: "Freehand" },
  { type: "arrow", icon: ArrowUpRight, label: "Arrow" },
  { type: "text", icon: Type, label: "Text" },
];

export default function AnnotationToolbar() {
  const {
    activeTool,
    color,
    opacity,
    setActiveTool,
    setColor,
    setOpacity,
    undo,
    redo,
    canUndo,
    canRedo,
    clearAnnotations,
  } = useAnnotationStore();

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2">
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        {TOOLS.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            onClick={() => setActiveTool(activeTool === type ? null : type)}
            className={`rounded-[var(--radius-sm)] p-2 transition-colors ${
              activeTool === type
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            }`}
            title={label}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-[var(--border)]" />

      {/* Color swatches */}
      <div className="flex items-center gap-1.5">
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
              color === c ? "border-[var(--ink)]" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-[var(--border)]" />

      {/* Opacity slider */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--dim)]">Opacity</span>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.1"
          value={opacity}
          onChange={(e) => setOpacity(parseFloat(e.target.value))}
          className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-[var(--surface-2)] accent-[var(--accent)]"
        />
        <span className="w-7 text-xs tabular-nums text-[var(--muted)]">
          {Math.round(opacity * 100)}%
        </span>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-[var(--border)]" />

      {/* Undo / Redo / Clear */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo()}
          className="rounded-[var(--radius-sm)] p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-30"
          title="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          className="rounded-[var(--radius-sm)] p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-30"
          title="Redo"
        >
          <Redo2 size={16} />
        </button>
        <button
          onClick={clearAnnotations}
          className="rounded-[var(--radius-sm)] p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--red)]"
          title="Clear all annotations"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
