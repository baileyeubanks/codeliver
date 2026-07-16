"use client";

import { useCallback, useRef, useEffect, type ReactNode, type RefObject } from "react";
import Hls from "hls.js";
import { normalizeReviewShortcutKey, projectPointIntoMedia, shouldIgnoreReviewShortcut } from "@/lib/review/player-policy";
import { usePlayerStore } from "@/lib/stores/playerStore";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  onFrameClick?: (x: number, y: number, timeSeconds: number) => void;
  onCutMarker?: (time: number) => void;
  children?: ReactNode;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

export default function VideoPlayer({
  src,
  poster,
  onTimeUpdate,
  onFrameClick,
  onCutMarker,
  children,
  videoRef: externalRef,
}: VideoPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? internalRef;
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    playing,
    muted,
    volume,
    playbackRate,
    frameRate,
    seekStepSeconds,
    setCurrentTime,
    setDuration,
    setPlaying,
    setMuted,
    toggleMute,
    setPlaybackRate,
  } = usePlayerStore();

  const playWithMutedFallback = useCallback((video: HTMLVideoElement) => {
    void video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      void video.play().catch(() => setPlaying(false));
    });
  }, [setMuted, setPlaying]);

  // Attach HLS or native source
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = src.endsWith(".m3u8");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, videoRef]);

  // Sync playback state to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [playing, videoRef, setPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
  }, [volume, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);

  // Sync video events to store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [videoRef, setCurrentTime, setDuration, setPlaying, onTimeUpdate]);

  function handleVideoClick() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      playWithMutedFallback(video);
    } else {
      video.pause();
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || !onFrameClick) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const point = projectPointIntoMedia({
      localX: e.clientX - rect.left,
      localY: e.clientY - rect.top,
      containerWidth: rect.width,
      containerHeight: rect.height,
      mediaWidth: video.videoWidth || rect.width,
      mediaHeight: video.videoHeight || rect.height,
    });

    if (!point) return;

    video.pause();
    onFrameClick(point.x, point.y, video.currentTime);
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const insideControl = target?.closest(
        "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='slider']",
      );
      const key = normalizeReviewShortcutKey(e.key);
      if (shouldIgnoreReviewShortcut({
        key,
        insideControl: Boolean(insideControl),
        defaultPrevented: e.defaultPrevented,
        isComposing: e.isComposing,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
      })) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      const frameDuration = 1 / frameRate;

      switch (key) {
        case " ":
        case "k":
          e.preventDefault();
          if (video.paused) {
            playWithMutedFallback(video);
          } else {
            video.pause();
          }
          break;
        case "j":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "l":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - seekStepSeconds);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + seekStepSeconds);
          break;
        case "ArrowDown":
          if (!onCutMarker) break;
          e.preventDefault();
          onCutMarker(video.currentTime);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            containerRef.current?.requestFullscreen();
          }
          break;
        case "[": {
          e.preventDefault();
          const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
          const idx = rates.indexOf(playbackRate);
          if (idx > 0) setPlaybackRate(rates[idx - 1]);
          break;
        }
        case "]": {
          e.preventDefault();
          const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
          const idx = rates.indexOf(playbackRate);
          if (idx < rates.length - 1) setPlaybackRate(rates[idx + 1]);
          break;
        }
        case ",":
          e.preventDefault();
          video.pause();
          video.currentTime = Math.max(0, video.currentTime - frameDuration);
          break;
        case ".":
          e.preventDefault();
          video.pause();
          video.currentTime = Math.min(video.duration, video.currentTime + frameDuration);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [videoRef, frameRate, playbackRate, seekStepSeconds, toggleMute, setPlaybackRate, playWithMutedFallback, onCutMarker]);

  return (
    <div
      ref={containerRef}
      data-player-root
      tabIndex={0}
      role="group"
      aria-label="Review media player"
      className="relative w-full overflow-hidden rounded-[var(--radius)] bg-black outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      <video
        ref={videoRef}
        poster={poster}
        className="h-full w-full cursor-pointer"
        onClick={handleVideoClick}
        playsInline
        preload="metadata"
      />
      {/* Overlay container for annotation canvas / frame indicator */}
      <div
        data-review-overlay
        className={`absolute inset-0 ${onFrameClick ? "cursor-crosshair" : "pointer-events-none"}`}
        onClick={onFrameClick ? handleOverlayClick : undefined}
      >
        <div className="h-full w-full">{children}</div>
      </div>
    </div>
  );
}
