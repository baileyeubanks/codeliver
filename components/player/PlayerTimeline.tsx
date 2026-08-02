"use client";

import { useRef, useState, useCallback } from "react";
import { Scissors } from "lucide-react";
import { usePlayerStore } from "@/lib/stores/playerStore";

export interface TimelineComment {
  id?: string;
  timecode_seconds: number | null;
  status: string;
  body: string;
}

export interface PositionedTimelineComment {
  key: string;
  comment: TimelineComment;
  timeSeconds: number;
  positionPercent: number;
  offsetPixels: number;
  groupIndex: number;
  groupSize: number;
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
  onCommentActivate?: (comment: TimelineComment) => void;
  selectedCommentId?: string | null;
}

function getCommentMarkerAriaLabel(comment: TimelineComment, time: number) {
  const status = comment.status.trim() || "open";
  const body = comment.body.trim().replace(/\s+/g, " ");
  const summary = body ? `: ${body.slice(0, 96)}` : "";
  return `Comment at ${time.toFixed(1)} seconds, ${status}${summary}`;
}

function timelineMarkerOffset(
  positionPercent: number,
  groupIndex: number,
  groupSize: number,
) {
  const gap = 24;
  const offset = groupSize <= 1
    ? 0
    : positionPercent <= 3
      ? groupIndex * gap
      : positionPercent >= 97
        ? -(groupSize - 1 - groupIndex) * gap
        : (groupIndex - (groupSize - 1) / 2) * gap;
  return offset === 0 ? 0 : offset;
}

export function positionTimelineCommentMarkers(
  comments: readonly TimelineComment[],
  duration: number,
): PositionedTimelineComment[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const timed = comments.flatMap((comment, commentIndex) => {
    const timeSeconds = comment.timecode_seconds;
    if (typeof timeSeconds !== "number" || !Number.isFinite(timeSeconds)) return [];
    const clampedTime = Math.max(0, Math.min(duration, timeSeconds));
    const positionPercent = (clampedTime / duration) * 100;
    return [{
      comment,
      commentIndex,
      timeSeconds: clampedTime,
      positionPercent,
      groupKey: String(Math.round(clampedTime * 1000)),
    }];
  });
  const groups = new Map<string, typeof timed>();

  for (const marker of timed) {
    const group = groups.get(marker.groupKey) ?? [];
    group.push(marker);
    groups.set(marker.groupKey, group);
  }

  return timed.map((marker) => {
    const group = groups.get(marker.groupKey) ?? [marker];
    const groupIndex = group.indexOf(marker);
    return {
      key: marker.comment.id ?? `comment-${marker.commentIndex}-${marker.groupKey}`,
      comment: marker.comment,
      timeSeconds: marker.timeSeconds,
      positionPercent: marker.positionPercent,
      offsetPixels: timelineMarkerOffset(marker.positionPercent, groupIndex, group.length),
      groupIndex,
      groupSize: group.length,
    };
  });
}

export default function PlayerTimeline({
  comments = [],
  cutMarkers = [],
  onSeek,
  onCommentActivate,
  selectedCommentId,
}: PlayerTimelineProps) {
  const { currentTime, duration } = usePlayerStore();
  const barRef = useRef<HTMLDivElement>(null);
  const [hoveredMarkerKey, setHoveredMarkerKey] = useState<string | null>(null);
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

  const positionedComments = positionTimelineCommentMarkers(comments, duration);
  const hoveredMarker = hoveredMarkerKey
    ? positionedComments.find((marker) => marker.key === hoveredMarkerKey) ?? null
    : null;

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
        {positionedComments.map((marker) => {
          const { comment, timeSeconds, key, positionPercent, offsetPixels } = marker;
          const selected = Boolean(comment.id && comment.id === selectedCommentId);
          const markerLabel = `${getCommentMarkerAriaLabel(comment, timeSeconds)}${
            marker.groupSize > 1
              ? `, ${marker.groupIndex + 1} of ${marker.groupSize} at this time`
              : ""
          }`;
          return (
            <button
              key={key}
              type="button"
              className={`group absolute top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                selected ? "z-20 scale-110 ring-2 ring-[var(--accent)] ring-offset-1" : "z-10"
              }`}
              style={{ left: `calc(${positionPercent}% + ${offsetPixels}px)` }}
              data-comment-marker
              data-marker-group-size={marker.groupSize}
              data-selected={selected ? "true" : undefined}
              aria-current={selected ? "true" : undefined}
              onMouseEnter={(e) => {
                setHoveredMarkerKey(key);
                const bar = barRef.current;
                if (bar) {
                  const rect = bar.getBoundingClientRect();
                  setTooltipX(e.clientX - rect.left);
                }
              }}
              onMouseLeave={() => setHoveredMarkerKey(null)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                if (onCommentActivate) onCommentActivate(comment);
                else onSeek?.(timeSeconds);
              }}
              title={markerLabel}
              aria-label={markerLabel}
            >
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full border border-[var(--surface)] transition-transform group-hover:scale-125 ${
                  comment.status === "resolved"
                    ? "bg-[var(--green)]"
                    : "bg-[var(--orange)]"
                }`}
              />
            </button>
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
      {hoveredMarker && (
        <div
          className="absolute bottom-full mb-2 max-w-[240px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink)] shadow-lg"
          style={{ left: `${tooltipX}px`, transform: "translateX(-50%)" }}
        >
          <p className="line-clamp-2">
            {hoveredMarker.comment.body.slice(0, 60)}
            {hoveredMarker.comment.body.length > 60 ? "..." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
