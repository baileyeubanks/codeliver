"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
} from "lucide-react";
import { usePlayerStore, formatTime } from "@/lib/stores/playerStore";

interface PlayerControlsProps {
  videoRef: RefObject<HTMLVideoElement | null>;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const SEEK_INTERVALS = [1, 2, 5, 10];
const SEEK_INTERVAL_STORAGE_KEY = "codeliver.review.seek-interval";

export default function PlayerControls({ videoRef }: PlayerControlsProps) {
  const {
    currentTime,
    duration,
    playing,
    muted,
    volume,
    playbackRate,
    seekStepSeconds,
    toggleMute,
    setMuted,
    setVolume,
    setPlaybackRate,
    setSeekStepSeconds,
  } = usePlayerStore();

  const [showRateMenu, setShowRateMenu] = useState(false);
  const [bufferedPct, setBufferedPct] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
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

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(ratio * duration);
    },
    [duration, seekTo],
  );

  const handleVolumeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = volumeRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setVolume(ratio);
    },
    [setVolume],
  );

  const handleFullscreen = useCallback(() => {
    const container = videoRef.current?.closest("[data-player-root]") as HTMLElement | null;
    const target = container ?? videoRef.current?.parentElement;
    if (!target) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      target.requestFullscreen();
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
    <div className="flex flex-col gap-3 rounded-b-[var(--radius)] bg-[var(--surface)] px-3 py-3 sm:px-4">
      {/* Progress bar */}
      <div
        ref={progressRef}
        className="group relative h-2 cursor-pointer rounded-full bg-[var(--surface-2)]"
        onClick={handleProgressClick}
      >
        {/* Buffered */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-[var(--dim)] opacity-40"
          style={{ width: `${bufferedPct}%` }}
        />
        {/* Progress */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-[var(--accent)] bg-[var(--surface)] opacity-0 transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {/* Time display */}
        <span className="order-last w-full text-xs tabular-nums text-[var(--muted)] sm:order-none sm:w-auto sm:min-w-[80px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="hidden flex-1 sm:block" />

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
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            title={muted || volume === 0 ? "Unmute (M)" : "Mute (M)"}
          >
            {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <div
            ref={volumeRef}
            className="h-1.5 w-16 cursor-pointer rounded-full bg-[var(--surface-2)]"
            onClick={handleVolumeClick}
          >
            <div
              className="h-full rounded-full bg-[var(--ink)]"
              style={{ width: `${(muted ? 0 : volume) * 100}%` }}
            />
          </div>
        </div>

        {/* Playback rate */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowRateMenu(!showRateMenu)}
            className="h-11 min-w-11 rounded-[var(--radius-sm)] px-2 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:h-8"
          >
            {playbackRate}x
          </button>
          {showRateMenu && (
            <div className="absolute bottom-full right-0 mb-2 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] shadow-lg">
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

        {/* Fullscreen */}
        <button
          type="button"
          onClick={handleFullscreen}
          className="grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:h-8 sm:w-8"
          title="Fullscreen (F)"
        >
          <Maximize size={18} />
        </button>
      </div>
    </div>
  );
}
