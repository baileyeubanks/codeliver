"use client";

import {
  Captions,
  Clock3,
  Film,
  Maximize2,
  MessageCircle,
  Scissors,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./CockpitReviewTimeline.module.css";

export interface CockpitReviewTimelineSourceMedia {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
}

export interface CockpitReviewTimelineComment {
  id: string;
  timeSeconds: number;
  label?: string;
  status?: "open" | "resolved";
}

export interface CockpitReviewTimelineCutDecision {
  id: string;
  timeSeconds: number;
  label?: string;
  status?: "proposed" | "accepted" | "rejected" | "applied";
}

export interface CockpitReviewTimelineMarkerActivation {
  id: string;
  kind: "comment" | "cut-decision";
  timeSeconds: number;
}

export interface CockpitReviewTimelineProps {
  durationSeconds: number;
  currentTimeSeconds?: number;
  sourceMedia?: readonly CockpitReviewTimelineSourceMedia[];
  comments?: readonly CockpitReviewTimelineComment[];
  cutDecisions?: readonly CockpitReviewTimelineCutDecision[];
  showAnalysisLanes?: boolean;
  audioLaneLabel?: string;
  titleLaneLabel?: string;
  title?: string;
  className?: string;
  onSeek?: (timeSeconds: number) => void;
  onMarkerActivate?: (marker: CockpitReviewTimelineMarkerActivation) => void;
}

export interface CockpitReviewTimelineTick {
  seconds: number;
  positionPercent: number;
  label: string;
}

export const COCKPIT_TIMELINE_ZOOM_LEVELS = [1, 2, 3, 4] as const;

type CockpitTimelineZoom = (typeof COCKPIT_TIMELINE_ZOOM_LEVELS)[number];
type CockpitTimelineZoomAction = "zoom-in" | "zoom-out" | "fit";
type CockpitTimelineLane = "source-media" | "audio-analysis" | "titles" | "comments" | "cut-decisions";

interface NormalizedSourceMedia extends CockpitReviewTimelineSourceMedia {
  positionPercent: number;
  widthPercent: number;
}

interface NormalizedComment extends CockpitReviewTimelineComment {
  positionPercent: number;
}

interface NormalizedCutDecision extends CockpitReviewTimelineCutDecision {
  positionPercent: number;
}

const EMPTY_SOURCE_MEDIA: readonly CockpitReviewTimelineSourceMedia[] = [];
const EMPTY_COMMENTS: readonly CockpitReviewTimelineComment[] = [];
const EMPTY_CUT_DECISIONS: readonly CockpitReviewTimelineCutDecision[] = [];

function normalizeDuration(durationSeconds: number) {
  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 0;
}

function clampTimelineTime(timeSeconds: number, durationSeconds: number) {
  if (!Number.isFinite(timeSeconds) || durationSeconds <= 0) return 0;
  return Math.min(durationSeconds, Math.max(0, timeSeconds));
}

export function getTimelinePositionPercent(
  timeSeconds: number,
  durationSeconds: number,
) {
  const duration = normalizeDuration(durationSeconds);
  if (duration === 0 || !Number.isFinite(timeSeconds)) return 0;
  return (clampTimelineTime(timeSeconds, duration) / duration) * 100;
}

export function formatTimelineTime(timeSeconds: number, durationSeconds = timeSeconds) {
  const safeTime = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0);
  const wholeSeconds = Math.floor(safeTime);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const showHours = Math.max(safeTime, durationSeconds) >= 3600;

  return showHours
    ? [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":")
    : `${String(Math.floor(wholeSeconds / 60)).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function niceTickInterval(rawInterval: number) {
  if (!Number.isFinite(rawInterval) || rawInterval <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
  const normalized = rawInterval / magnitude;
  const step = normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10;
  return step * magnitude;
}

export function normalizeTimelineZoom(zoom: number): CockpitTimelineZoom {
  return COCKPIT_TIMELINE_ZOOM_LEVELS.reduce((closest, level) =>
    Math.abs(level - zoom) < Math.abs(closest - zoom) ? level : closest
  );
}

export function getNextTimelineZoom(
  currentZoom: number,
  action: CockpitTimelineZoomAction,
): CockpitTimelineZoom {
  if (action === "fit") return 1;
  const normalizedZoom = normalizeTimelineZoom(currentZoom);
  const currentIndex = COCKPIT_TIMELINE_ZOOM_LEVELS.indexOf(normalizedZoom);
  const offset = action === "zoom-in" ? 1 : -1;
  const nextIndex = Math.min(
    COCKPIT_TIMELINE_ZOOM_LEVELS.length - 1,
    Math.max(0, currentIndex + offset),
  );
  return COCKPIT_TIMELINE_ZOOM_LEVELS[nextIndex];
}

export function buildTimelineTicks(
  durationSeconds: number,
  zoom: number,
): CockpitReviewTimelineTick[] {
  const duration = normalizeDuration(durationSeconds);
  if (duration === 0) return [];

  const normalizedZoom = normalizeTimelineZoom(zoom);
  const targetTickCount = 5 + normalizedZoom * 4;
  const interval = niceTickInterval(duration / Math.max(1, targetTickCount - 1));
  const ticks: CockpitReviewTimelineTick[] = [];

  for (let seconds = 0; seconds <= duration && ticks.length < 64; seconds += interval) {
    const normalizedSeconds = Math.min(duration, Number(seconds.toFixed(6)));
    ticks.push({
      seconds: normalizedSeconds,
      positionPercent: getTimelinePositionPercent(normalizedSeconds, duration),
      label: formatTimelineTime(normalizedSeconds, duration),
    });
  }

  const lastTick = ticks.at(-1);
  if (!lastTick || Math.abs(lastTick.seconds - duration) > 0.000001) {
    ticks.push({
      seconds: duration,
      positionPercent: 100,
      label: formatTimelineTime(duration, duration),
    });
  }

  return ticks;
}

function normalizeSourceMedia(
  sourceMedia: readonly CockpitReviewTimelineSourceMedia[],
  durationSeconds: number,
): NormalizedSourceMedia[] {
  if (durationSeconds <= 0) return [];

  return sourceMedia.flatMap((media) => {
    if (
      !media.id ||
      !media.label.trim() ||
      !Number.isFinite(media.startSeconds) ||
      !Number.isFinite(media.endSeconds) ||
      media.endSeconds <= media.startSeconds ||
      media.endSeconds <= 0 ||
      media.startSeconds >= durationSeconds
    ) {
      return [];
    }

    const startSeconds = clampTimelineTime(media.startSeconds, durationSeconds);
    const endSeconds = clampTimelineTime(media.endSeconds, durationSeconds);
    if (endSeconds <= startSeconds) return [];

    const positionPercent = getTimelinePositionPercent(startSeconds, durationSeconds);
    return [{
      ...media,
      startSeconds,
      endSeconds,
      positionPercent,
      widthPercent: getTimelinePositionPercent(endSeconds, durationSeconds) - positionPercent,
    }];
  });
}

function normalizeComments(
  comments: readonly CockpitReviewTimelineComment[],
  durationSeconds: number,
): NormalizedComment[] {
  if (durationSeconds <= 0) return [];
  return comments.flatMap((comment) => {
    if (
      !comment.id ||
      !Number.isFinite(comment.timeSeconds) ||
      comment.timeSeconds < 0 ||
      comment.timeSeconds > durationSeconds
    ) {
      return [];
    }
    return [{
      ...comment,
      positionPercent: getTimelinePositionPercent(comment.timeSeconds, durationSeconds),
    }];
  });
}

function normalizeCutDecisions(
  cutDecisions: readonly CockpitReviewTimelineCutDecision[],
  durationSeconds: number,
): NormalizedCutDecision[] {
  if (durationSeconds <= 0) return [];
  return cutDecisions.flatMap((decision) => {
    if (
      !decision.id ||
      !Number.isFinite(decision.timeSeconds) ||
      decision.timeSeconds < 0 ||
      decision.timeSeconds > durationSeconds
    ) {
      return [];
    }
    return [{
      ...decision,
      positionPercent: getTimelinePositionPercent(decision.timeSeconds, durationSeconds),
    }];
  });
}

function markerEdge(positionPercent: number) {
  if (positionPercent <= 0) return "start";
  if (positionPercent >= 100) return "end";
  return "middle";
}

function joinMarkerLabel(
  kind: "Comment" | "Cut decision",
  label: string | undefined,
  timeSeconds: number,
  durationSeconds: number,
  status: string,
) {
  const detail = label?.trim() ? `: ${label}` : "";
  return `${kind}${detail} at ${formatTimelineTime(timeSeconds, durationSeconds)}, ${status}`;
}

export default function CockpitReviewTimeline({
  durationSeconds,
  currentTimeSeconds,
  sourceMedia = EMPTY_SOURCE_MEDIA,
  comments = EMPTY_COMMENTS,
  cutDecisions = EMPTY_CUT_DECISIONS,
  showAnalysisLanes = false,
  audioLaneLabel = "Waveform pending",
  titleLaneLabel = "Title pass pending",
  title = "Review timeline",
  className,
  onSeek,
  onMarkerActivate,
}: CockpitReviewTimelineProps) {
  const duration = normalizeDuration(durationSeconds);
  const [zoom, setZoom] = useState<CockpitTimelineZoom>(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  const normalizedSourceMedia = useMemo(
    () => normalizeSourceMedia(sourceMedia, duration),
    [duration, sourceMedia],
  );
  const normalizedComments = useMemo(
    () => normalizeComments(comments, duration),
    [comments, duration],
  );
  const normalizedCutDecisions = useMemo(
    () => normalizeCutDecisions(cutDecisions, duration),
    [cutDecisions, duration],
  );

  const lanes: CockpitTimelineLane[] = [];
  if (normalizedSourceMedia.length > 0) lanes.push("source-media");
  if (showAnalysisLanes && normalizedSourceMedia.length > 0) {
    lanes.push("audio-analysis", "titles");
  }
  if (normalizedComments.length > 0) lanes.push("comments");
  if (normalizedCutDecisions.length > 0) lanes.push("cut-decisions");

  const ticks = useMemo(() => buildTimelineTicks(duration, zoom), [duration, zoom]);
  const hasCurrentTime = duration > 0 &&
    currentTimeSeconds !== undefined &&
    Number.isFinite(currentTimeSeconds);
  const currentTime = hasCurrentTime
    ? clampTimelineTime(currentTimeSeconds, duration)
    : 0;
  const timelineHeight = Math.min(280, Math.max(156, 132 + lanes.length * 34));
  const timelineStyle = {
    "--timeline-height": `${timelineHeight}px`,
    "--timeline-lane-count": lanes.length,
  } as CSSProperties;

  const applyZoom = useCallback((nextZoom: number) => {
    const normalizedZoom = normalizeTimelineZoom(nextZoom);
    const viewport = viewportRef.current;
    const centerRatio = viewport && viewport.scrollWidth > 0
      ? (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth
      : 0.5;

    setZoom(normalizedZoom);
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const nextViewport = viewportRef.current;
      if (!nextViewport) return;
      if (normalizedZoom === 1) {
        nextViewport.scrollTo({ left: 0, behavior: "auto" });
        return;
      }
      nextViewport.scrollLeft = Math.max(
        0,
        centerRatio * nextViewport.scrollWidth - nextViewport.clientWidth / 2,
      );
    });
  }, []);

  const activateMarker = useCallback((marker: CockpitReviewTimelineMarkerActivation) => {
    onSeek?.(marker.timeSeconds);
    onMarkerActivate?.(marker);
  }, [onMarkerActivate, onSeek]);

  const durationLabel = duration > 0
    ? formatTimelineTime(duration, duration)
    : "Duration unavailable";
  const timeReadout = duration > 0 && hasCurrentTime
    ? `${formatTimelineTime(currentTime, duration)} / ${durationLabel}`
    : duration > 0
      ? `${durationLabel} total`
      : durationLabel;

  return (
    <section
      className={[styles.timeline, className].filter(Boolean).join(" ")}
      style={timelineStyle}
      aria-label={title}
      data-zoom={zoom}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <Clock3 size={14} aria-hidden="true" />
          <h2>{title}</h2>
        </div>
        <span className={styles.timeReadout}>{timeReadout}</span>
      </header>

      {lanes.length > 0 ? (
        <div className={styles.desktopStage}>
          <div className={styles.labelColumn} aria-hidden="true">
            <span className={styles.rulerLabel}>Time</span>
            {lanes.map((lane) => (
              <span className={styles.laneLabel} key={lane}>
                {lane === "source-media" ? <Film size={13} /> : null}
                {lane === "audio-analysis" ? <Volume2 size={13} /> : null}
                {lane === "titles" ? <Captions size={13} /> : null}
                {lane === "comments" ? <MessageCircle size={13} /> : null}
                {lane === "cut-decisions" ? <Scissors size={13} /> : null}
                {lane === "source-media" ? "Source media" : null}
                {lane === "audio-analysis" ? "Audio" : null}
                {lane === "titles" ? "Titles" : null}
                {lane === "comments" ? "Comments" : null}
                {lane === "cut-decisions" ? "Cut decisions" : null}
              </span>
            ))}
          </div>

          <div className={styles.viewport} ref={viewportRef} tabIndex={0} aria-label="Timeline tracks">
            <div className={styles.canvas} style={{ width: `${zoom * 100}%` }}>
              <div className={styles.ruler} aria-hidden="true">
                {ticks.map((tick) => (
                  <span
                    key={tick.seconds}
                    className={styles.tick}
                    data-edge={markerEdge(tick.positionPercent)}
                    style={{ left: `${tick.positionPercent}%` }}
                  >
                    <i />
                    {tick.label}
                  </span>
                ))}
              </div>

              {normalizedSourceMedia.length > 0 ? (
                <div className={`${styles.lane} ${styles.sourceLane}`} data-lane="source-media" aria-label="Source media">
                  {normalizedSourceMedia.map((media) => (
                    <span
                      className={styles.sourceSegment}
                      key={media.id}
                      style={{
                        left: `${media.positionPercent}%`,
                        width: `${media.widthPercent}%`,
                      }}
                      title={media.label}
                    >
                      <Film size={11} aria-hidden="true" />
                      <span>{media.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              {showAnalysisLanes && normalizedSourceMedia.length > 0 ? (
                <>
                  <div className={`${styles.lane} ${styles.audioLane}`} data-lane="audio-analysis" aria-label="Audio analysis">
                    <span className={styles.analysisStatus}>
                      <Volume2 size={11} aria-hidden="true" />
                      {audioLaneLabel}
                    </span>
                  </div>

                  <div className={`${styles.lane} ${styles.titleLane}`} data-lane="titles" aria-label="Title analysis">
                    <span className={styles.analysisStatus}>
                      <Captions size={11} aria-hidden="true" />
                      {titleLaneLabel}
                    </span>
                  </div>
                </>
              ) : null}

              {normalizedComments.length > 0 ? (
                <div className={`${styles.lane} ${styles.commentLane}`} data-lane="comments" aria-label="Comments">
                  {normalizedComments.map((comment) => {
                    const status = comment.status ?? "open";
                    return (
                      <button
                        className={`${styles.marker} ${styles.commentMarker}`}
                        key={comment.id}
                        type="button"
                        data-edge={markerEdge(comment.positionPercent)}
                        data-status={status}
                        style={{ left: `${comment.positionPercent}%` }}
                        aria-label={joinMarkerLabel(
                          "Comment",
                          comment.label,
                          comment.timeSeconds,
                          duration,
                          status,
                        )}
                        title={joinMarkerLabel(
                          "Comment",
                          comment.label,
                          comment.timeSeconds,
                          duration,
                          status,
                        )}
                        onClick={() => activateMarker({
                          id: comment.id,
                          kind: "comment",
                          timeSeconds: comment.timeSeconds,
                        })}
                      >
                        <MessageCircle size={12} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {normalizedCutDecisions.length > 0 ? (
                <div className={`${styles.lane} ${styles.cutLane}`} data-lane="cut-decisions" aria-label="Cut decisions">
                  {normalizedCutDecisions.map((decision) => {
                    const status = decision.status ?? "proposed";
                    return (
                      <button
                        className={`${styles.marker} ${styles.cutMarker}`}
                        key={decision.id}
                        type="button"
                        data-edge={markerEdge(decision.positionPercent)}
                        data-status={status}
                        style={{ left: `${decision.positionPercent}%` }}
                        aria-label={joinMarkerLabel(
                          "Cut decision",
                          decision.label,
                          decision.timeSeconds,
                          duration,
                          status,
                        )}
                        title={joinMarkerLabel(
                          "Cut decision",
                          decision.label,
                          decision.timeSeconds,
                          duration,
                          status,
                        )}
                        onClick={() => activateMarker({
                          id: decision.id,
                          kind: "cut-decision",
                          timeSeconds: decision.timeSeconds,
                        })}
                      >
                        <Scissors size={12} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {hasCurrentTime ? (
                <span
                  className={styles.playhead}
                  style={{ left: `${getTimelinePositionPercent(currentTime, duration)}%` }}
                  aria-hidden="true"
                >
                  <i />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.desktopEmpty}>No timeline data</div>
      )}

      <div className={styles.mobileSummary} aria-label={`${title} summary`}>
        <div className={styles.mobileTime}>
          <Clock3 size={15} aria-hidden="true" />
          <span>
            <strong>{durationLabel}</strong>
            <small>{hasCurrentTime ? `${formatTimelineTime(currentTime, duration)} current` : "Total duration"}</small>
          </span>
        </div>
        {lanes.length > 0 ? (
          <ul className={styles.mobileCounts}>
            {normalizedSourceMedia.length > 0 ? <li>{normalizedSourceMedia.length} source</li> : null}
            {showAnalysisLanes && normalizedSourceMedia.length > 0 ? <li>audio pending</li> : null}
            {showAnalysisLanes && normalizedSourceMedia.length > 0 ? <li>titles pending</li> : null}
            {normalizedComments.length > 0 ? <li>{normalizedComments.length} comments</li> : null}
            {normalizedCutDecisions.length > 0 ? <li>{normalizedCutDecisions.length} cuts</li> : null}
          </ul>
        ) : (
          <span className={styles.mobileEmpty}>No timeline data</span>
        )}
      </div>

      <footer className={styles.controls} aria-label="Timeline zoom controls">
        <button
          className={styles.iconButton}
          type="button"
          onClick={() => applyZoom(getNextTimelineZoom(zoom, "zoom-out"))}
          disabled={duration === 0 || zoom === COCKPIT_TIMELINE_ZOOM_LEVELS[0]}
          aria-label="Zoom out timeline"
          title="Zoom out timeline"
        >
          <ZoomOut size={15} aria-hidden="true" />
        </button>
        <input
          className={styles.zoomSlider}
          type="range"
          min={COCKPIT_TIMELINE_ZOOM_LEVELS[0]}
          max={COCKPIT_TIMELINE_ZOOM_LEVELS.at(-1)}
          step={1}
          value={zoom}
          disabled={duration === 0}
          onChange={(event) => applyZoom(Number(event.target.value))}
          aria-label="Timeline zoom"
          aria-valuetext={`${zoom}x`}
        />
        <button
          className={styles.iconButton}
          type="button"
          onClick={() => applyZoom(getNextTimelineZoom(zoom, "zoom-in"))}
          disabled={duration === 0 || zoom === COCKPIT_TIMELINE_ZOOM_LEVELS.at(-1)}
          aria-label="Zoom in timeline"
          title="Zoom in timeline"
        >
          <ZoomIn size={15} aria-hidden="true" />
        </button>
        <span className={styles.zoomValue} aria-hidden="true">{zoom}x</span>
        <button
          className={styles.fitButton}
          type="button"
          onClick={() => applyZoom(getNextTimelineZoom(zoom, "fit"))}
          disabled={duration === 0}
          aria-pressed={zoom === 1}
        >
          <Maximize2 size={14} aria-hidden="true" />
          Fit
        </button>
      </footer>
    </section>
  );
}
