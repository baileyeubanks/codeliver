"use client";

import { useState } from "react";
import { Droplets } from "lucide-react";

interface WatermarkConfigProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  text: string;
  onTextChange: (text: string) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
}

const POSITIONS = ["center", "top-left", "top-right", "bottom-left", "bottom-right", "tiled"] as const;

export default function WatermarkConfig({
  enabled,
  onToggle,
  text,
  onTextChange,
  opacity = 30,
  onOpacityChange,
}: WatermarkConfigProps) {
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("center");

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        <Droplets size={14} className="text-[var(--muted)]" />
        <span className="text-sm text-[var(--ink)]">Enable watermark</span>
      </label>

      {enabled && (
        <div className="pl-6 space-y-3">
          <div>
            <label className="text-xs text-[var(--dim)] block mb-1">Watermark text</label>
            <input
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Reviewer email or custom text"
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--dim)] block mb-1">Position</label>
            <div className="flex flex-wrap gap-1">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosition(pos)}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${
                    position === pos
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {pos.replace("-", " ")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--dim)] block mb-1">
              Opacity: {opacity}%
            </label>
            <input
              type="range"
              min={10}
              max={80}
              value={opacity}
              onChange={(e) => onOpacityChange?.(parseInt(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
