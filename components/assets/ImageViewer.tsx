"use client";

import { useState, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export default function ImageViewer({
  url,
  alt,
  onImageClick,
}: {
  url: string;
  alt: string;
  onImageClick?: (x: number, y: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => {
      const next = prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [dragging, dragStart]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setDragging(false);

      // If barely moved, treat as click
      const dx = Math.abs(e.clientX - (dragStart.x + pan.x));
      const dy = Math.abs(e.clientY - (dragStart.y + pan.y));
      if (dx < 3 && dy < 3 && onImageClick && imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          onImageClick(x, y);
        }
      }
    },
    [dragging, dragStart, pan, onImageClick]
  );

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative bg-[var(--surface-2)] rounded-[var(--radius)] overflow-hidden">
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-[var(--surface)]/90 backdrop-blur-sm border border-[var(--border)] rounded-[var(--radius-sm)] p-1">
        <button
          onClick={() =>
            setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
          }
          className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded hover:bg-[var(--surface-2)] transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <span className="text-xs text-[var(--muted)] min-w-[3ch] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() =>
            setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
          }
          className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded hover:bg-[var(--surface-2)] transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <div className="w-px h-4 bg-[var(--border)]" />
        <button
          onClick={reset}
          className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] rounded hover:bg-[var(--surface-2)] transition-colors"
          title="Reset"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="relative w-full h-[70vh] flex items-center justify-center overflow-hidden select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDragging(false)}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        <img
          ref={imageRef}
          src={url}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-full object-contain transition-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transitionProperty: dragging ? "none" : "transform",
            transitionDuration: dragging ? "0ms" : "150ms",
          }}
        />
      </div>
    </div>
  );
}
