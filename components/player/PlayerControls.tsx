"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import styles from "./PlayerControls.module.css";
import { useOverlay } from "@/components/overlay/useOverlay";
import {
  Play,
  Pause,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  MessageSquareText,
} from "lucide-react";
import { usePlayerStore } from "@/lib/stores/playerStore";
import { nextLoopRegion } from "@/lib/review/frame-review";
import { formatSmpteTimecode } from "@/components/player/timecode";

interface PlayerControlsProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  commentNavigation?: {
    onPrevious: () => void;
    onNext: () => void;
    disabled: boolean;
  };
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_INTERVALS = [1, 2, 5, 10];
const SEEK_INTERVAL_STORAGE_KEY = "codeliver.review.seek-interval";

export default function PlayerControls({ videoRef, commentNavigation }: PlayerControlsProps) {
  const {
    currentTime,
    duration,
    playing,
    muted,
    volume,
    playbackRate,
    frameRate,
    seekStepSeconds,
    loopIn,
    loopOut,
    toggleMute,
    setMuted,
    setVolume,
    setPlaybackRate,
    setSeekStepSeconds,
    setLoopRegion,
  } = usePlayerStore();

  const [showRateMenu, setShowRateMenu] = useState(false);
  const [bufferedPct, setBufferedPct] = useState(0);
  const rateButtonRef = useRef<HTMLButtonElement>(null);
  const [rateMenuOverlayRef, rateMenuOverlayStyle] = useOverlay({
    open: showRateMenu,
    onClose: () => setShowRateMenu(false),
    anchorRef: rateButtonRef,
    side: "top",
    align: "end",
    offset: 8,
  });


  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const loopClosed = loopIn != null && loopOut != null && loopOut > loopIn && duration > 0;
  const loopLabel = loopClosed
    ? "Loop A-B set — press again to clear"
    : loopIn != null
      ? "Loop in point set — press at the out point"
      : "Loop — set in point at the playhead";

  const handleLoopCycle = useCallback(() => {
    const next = nextLoopRegion({ inPoint: loopIn, outPoint: loopOut }, currentTime);
    setLoopRegion(next.inPoint, next.outPoint);
  }, [loopIn, loopOut, currentTime, setLoopRegion]);
  const handleTogglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play().catch(() => {
        video.muted = true;
        setMuted(true);
        void video.play().catch(() => undefined);
      });
    } else {
      video.pause();
    }
  }, [setMuted, videoRef]);

  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(duration, time));
    },
    [videoRef, duration],
  );

  const handleFullscreen = useCallback(() => {
    const container = videoRef.current?.closest(".review-video-surface") as HTMLElement | null;
    const target = container ?? videoRef.current?.parentElement;
    if (!target) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      if (target.requestFullscreen) {
        void target.requestFullscreen().catch(() => {
          const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
          try { video?.webkitEnterFullscreen?.(); } catch { /* A new gesture may be required. */ }
        });
      } else {
        const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        try { video?.webkitEnterFullscreen?.(); } catch { /* A new gesture may be required. */ }
      }
    }
  }, [videoRef]);

  useEffect(() => {
    const storedInterval = Number(window.localStorage.getItem(SEEK_INTERVAL_STORAGE_KEY));
    if (SEEK_INTERVALS.includes(storedInterval)) setSeekStepSeconds(storedInterval);
  }, [setSeekStepSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function updateBufferedRange(event: Event) {
      const media = event.currentTarget as HTMLVideoElement;
      if (media.buffered.length === 0 || media.duration <= 0) {
        setBufferedPct(0);
        return;
      }
      const end = media.buffered.end(media.buffered.length - 1);
      setBufferedPct(Math.min(100, (end / media.duration) * 100));
    }

    video.addEventListener("progress", updateBufferedRange);
    video.addEventListener("loadedmetadata", updateBufferedRange);
    return () => {
      video.removeEventListener("progress", updateBufferedRange);
      video.removeEventListener("loadedmetadata", updateBufferedRange);
    };
  }, [videoRef]);

  return (
    <div className={styles.controls} aria-label="Video controls">
      <div className={styles.seekTrack} style={{ "--progress": `${progress}%`, "--buffered": `${bufferedPct}%` } as CSSProperties}>
        {loopClosed ? (
          <span data-loop-region className={styles.loopRegion} style={{ left: `${((loopIn as number) / duration) * 100}%`, width: `${(((loopOut as number) - (loopIn as number)) / duration) * 100}%` }} />
        ) : null}
        <input
          className={styles.seek}
          type="range"
          min={0}
          max={Number.isFinite(duration) && duration > 0 ? duration : 0}
          step={1 / frameRate}
          value={Number.isFinite(currentTime) ? currentTime : 0}
          disabled={!Number.isFinite(duration) || duration <= 0}
          aria-label="Seek video"
          aria-valuetext={`${formatSmpteTimecode(currentTime, frameRate)} of ${formatSmpteTimecode(duration, frameRate)}`}
          onChange={(event) => seekTo(Number(event.target.value))}
        />
      </div>

      {/* Controls row */}
      <div className={styles.row}>
        {/* Transport */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => seekTo(currentTime - seekStepSeconds)}
            className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:h-8 sm:w-8"
            title={`Seek back ${seekStepSeconds}s (Arrow Left)`}
            aria-label={`Seek back ${seekStepSeconds} seconds`}
          >
            <SkipBack size={18} />
          </button>

          <button
            type="button"
            onClick={handleTogglePlayback}
            className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)] sm:h-9 sm:w-9"
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <button
            type="button"
            onClick={() => seekTo(currentTime + seekStepSeconds)}
            className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:h-8 sm:w-8"
            title={`Seek forward ${seekStepSeconds}s (Arrow Right)`}
            aria-label={`Seek forward ${seekStepSeconds} seconds`}
          >
            <SkipForward size={18} />
          </button>

          {commentNavigation ? (
            <div className="ml-1 flex items-center gap-0.5 border-l border-[var(--border)] pl-1" aria-label="Comment navigation">
              <button
                type="button"
                onClick={commentNavigation.onPrevious}
                disabled={commentNavigation.disabled}
                className="grid h-11 min-w-11 place-items-center rounded-[var(--radius-sm)] px-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:min-w-8"
                title="Previous comment"
                aria-label="Previous comment"
              >
                <MessageSquareText size={13} />
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                onClick={commentNavigation.onNext}
                disabled={commentNavigation.disabled}
                className="grid h-11 min-w-11 place-items-center rounded-[var(--radius-sm)] px-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:min-w-8"
                title="Next comment"
                aria-label="Next comment"
              >
                <MessageSquareText size={13} />
                <SkipForward size={14} />
              </button>
            </div>
          ) : null}
        </div>

        {/* Time display */}
        <span
          data-transport-timecode
          className={styles.timecode}
        >
          {formatSmpteTimecode(currentTime, frameRate)} / {formatSmpteTimecode(duration, frameRate)}
        </span>

        <div className={styles.spacer} />

        <select
          aria-label="Keyboard seek interval"
          title="Arrow key seek interval"
          value={seekStepSeconds}
          onChange={(event) => {
            const seconds = Number(event.target.value);
            setSeekStepSeconds(seconds);
            window.localStorage.setItem(SEEK_INTERVAL_STORAGE_KEY, String(seconds));
          }}
          className="h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs font-medium text-[var(--muted)] outline-none transition-colors hover:text-[var(--ink)] focus:border-[var(--accent)] sm:h-8"
        >
          {SEEK_INTERVALS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}s
            </option>
          ))}
        </select>

        {/* Volume */}
        <div className={styles.volume}>
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            title={muted || volume === 0 ? "Unmute (M)" : "Mute (M)"}
          >
            {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            className={styles.volumeSlider} aria-label="Volume"
            onChange={(event) => { setVolume(Number(event.target.value)); setMuted(false); }} />
        </div>

        {/* Playback rate */}
        <div className="relative">
          <button
            ref={rateButtonRef}
            type="button"
            aria-expanded={showRateMenu}
            aria-label="Playback speed"
            onClick={() => setShowRateMenu(!showRateMenu)}
            className="h-11 min-w-11 rounded-[var(--radius-sm)] px-2 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:h-8"
          >
            {playbackRate}x
          </button>
          {showRateMenu && (
            <div
              ref={rateMenuOverlayRef}
              style={rateMenuOverlayStyle}
              className="z-[60] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] shadow-lg"
            >
              {PLAYBACK_RATES.map((rate) => (
                <button
                  type="button"
                  key={rate}
                  onClick={() => {
                    setPlaybackRate(rate);
                    setShowRateMenu(false);
                  }}
                  className={`block w-full px-4 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-2)] ${
                    rate === playbackRate ? "text-[var(--accent)]" : "text-[var(--ink)]"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* A/B loop */}
        <button
          type="button"
          onClick={handleLoopCycle}
          aria-label={loopLabel}
          title={loopLabel}
          className={`grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-2)] sm:h-8 sm:w-8 ${
            loopIn != null ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          <Repeat size={18} />
        </button>

        {/* Fullscreen */}
        <button
          type="button"
          onClick={handleFullscreen}
          className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:h-8 sm:w-8"
          aria-label="Fullscreen"
          title="Fullscreen (F)"
        >
          <Maximize size={18} />
        </button>
      </div>
    </div>
  );
}
