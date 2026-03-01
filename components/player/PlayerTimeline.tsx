"use client";

import { useRef, useState, useCallback } from "react";
import { usePlayerStore } from "@/lib/stores/playerStore";

interface TimelineComment {
  timecode_seconds: number | null;
  status: string;
  body: string;
}

interface PlayerTimelineProps {
  comments?: TimelineComment[];
  onSeek?: (time: number) => void;
}

export default function PlayerTimeline({ comments = [], onSeek }: PlayerTimelineProps) {
  const { currentTime, duration } = usePlayerStore();
  const barRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipX, setTooltipX] = useState(0);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = barRef.current;
      if (!bar || duration === 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek?.(ratio * duration);
    },
    [duration, onSeek],
  );

  const timedComments = comments.filter(
    (c) => c.timecode_seconds !== null && c.timecode_seconds !== undefined,
  );

  return (
    <div className="relative px-4 py-2">
      {/* Timeline bar */}
      <div
        ref={barRef}
        className="relative h-3 cursor-pointer rounded-full bg-[var(--surface-2)]"
        onClick={handleBarClick}
      >
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${progress}%` }}
        />

        {/* Current position indicator */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--accent)]"
          style={{ left: `${progress}%` }}
        />

        {/* Comment markers */}
        {timedComments.map((comment, idx) => {
          const tc = comment.timecode_seconds as number;
          const pos = duration > 0 ? (tc / duration) * 100 : 0;
          return (
            <div
              key={idx}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos}%` }}
              onMouseEnter={(e) => {
                setHoveredIndex(idx);
                const bar = barRef.current;
                if (bar) {
                  const rect = bar.getBoundingClientRect();
                  setTooltipX(e.clientX - rect.left);
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSeek?.(tc);
              }}
            >
              <div
                className={`h-2.5 w-2.5 cursor-pointer rounded-full border border-[var(--surface)] transition-transform hover:scale-125 ${
                  comment.status === "resolved"
                    ? "bg-[var(--green)]"
                    : "bg-[var(--orange)]"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredIndex !== null && timedComments[hoveredIndex] && (
        <div
          className="absolute bottom-full mb-2 max-w-[240px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink)] shadow-lg"
          style={{ left: `${tooltipX}px`, transform: "translateX(-50%)" }}
        >
          <p className="line-clamp-2">
            {timedComments[hoveredIndex].body.slice(0, 60)}
            {timedComments[hoveredIndex].body.length > 60 ? "..." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
