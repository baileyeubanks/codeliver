"use client";

import { useRef, useState, useCallback } from "react";
import { Scissors } from "lucide-react";
import { usePlayerStore } from "@/lib/stores/playerStore";

interface TimelineComment {
  timecode_seconds: number | null;
  status: string;
  body: string;
}

interface PlayerTimelineProps {
  comments?: TimelineComment[];
  cutMarkers?: Array<{
    id: string;
    time: number;
    status?: "proposed" | "accepted" | "rejected" | "applied";
    pending?: boolean;
  }>;
  onSeek?: (time: number) => void;
}

function getCommentMarkerAriaLabel(comment: TimelineComment, timeSeconds: number) {
  const timeLabel = Number.isFinite(timeSeconds)
    ? `${timeSeconds.toFixed(1)} seconds`
    : "unknown time";
  const statusLabel = comment.status.trim() || "open";
  const body = comment.body.trim().replace(/\s+/g, " ");

  return body
    ? `Comment at ${timeLabel}, ${statusLabel}: ${body}`
    : `Comment at ${timeLabel}, ${statusLabel}`;
}

export default function PlayerTimeline({ comments = [], cutMarkers = [], onSeek }: PlayerTimelineProps) {
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
            <button
              key={idx}
              type="button"
              className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 appearance-none cursor-pointer rounded-full border border-[var(--surface)] p-0 transition-transform hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                comment.status === "resolved"
                  ? "bg-[var(--green)]"
                  : "bg-[var(--orange)]"
              }`}
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
              aria-label={getCommentMarkerAriaLabel(comment, tc)}
            />
          );
        })}

        {cutMarkers.map((marker) => {
          const pos = duration > 0 ? Math.max(0, Math.min(100, (marker.time / duration) * 100)) : 0;
          const status = marker.pending ? "saving" : marker.status ?? "proposed";
          return (
            <button
              key={marker.id}
              type="button"
              className={`absolute top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] border border-white/80 text-white shadow-sm transition-transform hover:scale-110 ${
                marker.pending
                  ? "bg-[var(--muted)] opacity-70 motion-safe:animate-pulse"
                  : marker.status === "accepted"
                    ? "bg-[var(--green)]"
                    : marker.status === "applied"
                      ? "bg-[var(--purple)]"
                      : "bg-[var(--accent)]"
              }`}
              style={{ left: `${pos}%` }}
              onClick={(event) => {
                event.stopPropagation();
                onSeek?.(marker.time);
              }}
              title={`Cut decision at ${marker.time.toFixed(1)} seconds · ${status}`}
              aria-label={`Cut decision at ${marker.time.toFixed(1)} seconds, ${status}`}
            >
              <Scissors size={10} />
            </button>
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
