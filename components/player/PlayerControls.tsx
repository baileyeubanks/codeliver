"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { usePlayerStore, formatTime } from "@/lib/stores/playerStore";

interface PlayerControlsProps {
  videoRef: RefObject<HTMLVideoElement | null>;
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export default function PlayerControls({ videoRef }: PlayerControlsProps) {
  const {
    currentTime,
    duration,
    playing,
    muted,
    volume,
    playbackRate,
    frameRate,
    togglePlay,
    toggleMute,
    setVolume,
    setPlaybackRate,
  } = usePlayerStore();

  const [showRateMenu, setShowRateMenu] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const frameDuration = 1 / frameRate;

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

  // Buffered range (first range)
  const video = videoRef.current;
  let bufferedPct = 0;
  if (video && video.buffered.length > 0 && duration > 0) {
    bufferedPct = (video.buffered.end(video.buffered.length - 1) / duration) * 100;
  }

  return (
    <div className="flex flex-col gap-2 rounded-b-[var(--radius)] bg-[var(--surface)] px-4 py-3">
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
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-[var(--accent)] bg-white opacity-0 transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Transport */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => seekTo(currentTime - 10)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            title="Skip back 10s (J)"
          >
            <SkipBack size={18} />
          </button>

          <button
            onClick={() => seekTo(currentTime - frameDuration)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            title="Frame back (ArrowLeft)"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            onClick={togglePlay}
            className="rounded-[var(--radius-sm)] p-2 text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <button
            onClick={() => seekTo(currentTime + frameDuration)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            title="Frame forward (ArrowRight)"
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={() => seekTo(currentTime + 10)}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            title="Skip forward 10s (L)"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Time display */}
        <span className="min-w-[80px] text-xs tabular-nums text-[var(--muted)]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* Volume */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            title="Toggle mute (M)"
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
            onClick={() => setShowRateMenu(!showRateMenu)}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            {playbackRate}x
          </button>
          {showRateMenu && (
            <div className="absolute bottom-full right-0 mb-2 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] shadow-lg">
              {PLAYBACK_RATES.map((rate) => (
                <button
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
          onClick={handleFullscreen}
          className="rounded-[var(--radius-sm)] p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          title="Fullscreen (F)"
        >
          <Maximize size={18} />
        </button>
      </div>
    </div>
  );
}
