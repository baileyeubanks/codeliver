"use client";

import { useCallback, useRef, useEffect, type ReactNode, type RefObject } from "react";
import Hls, { type ErrorData, type Events } from "hls.js";
import { normalizeReviewShortcutKey, projectPointIntoMedia, shouldIgnoreReviewShortcut } from "@/lib/review/player-policy";
import { nextShuttleRate, stepFrames } from "@/lib/review/frame-review";
import { usePlayerStore } from "@/lib/stores/playerStore";

/**
 * A staff-only or cold playlist can stall before metadata and never fire
 * an error event, which holds a black readyState-0 frame. Past the paint
 * budget the stage fails soft instead of waiting.
 */
export const STALL_WATCHDOG_MS = 2_000;

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  onPlaybackStart?: () => void;
  onPlaybackError?: () => void;
  onFrameClick?: (x: number, y: number, timeSeconds: number) => void;
  onCutMarker?: (time: number) => void;
  sourceNonce?: number;
  resumeTime?: number | null;
  allowOverlayOverflow?: boolean;
  children?: ReactNode;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

export default function VideoPlayer({
  src,
  poster,
  onTimeUpdate,
  onPlaybackStart,
  onPlaybackError,
  onFrameClick,
  onCutMarker,
  sourceNonce = 0,
  resumeTime = null,
  allowOverlayOverflow = false,
  children,
  videoRef: externalRef,
}: VideoPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? internalRef;
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceGenerationRef = useRef(0);
  const reportedFailureGenerationRef = useRef<number | null>(null);

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
    setBufferedEnd,
  } = usePlayerStore();

  const playWithMutedFallback = useCallback((video: HTMLVideoElement) => {
    void video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      void video.play().catch(() => setPlaying(false));
    });
  }, [setMuted, setPlaying]);

  const reportPlaybackFailure = useCallback((sourceGeneration: number) => {
    if (
      sourceGeneration !== sourceGenerationRef.current ||
      reportedFailureGenerationRef.current === sourceGeneration
    ) {
      return;
    }

    reportedFailureGenerationRef.current = sourceGeneration;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBufferedEnd(0);
    onPlaybackError?.();
  }, [onPlaybackError, setBufferedEnd, setCurrentTime, setDuration, setPlaying]);

  // Attach HLS or native source
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sourceGeneration = sourceGenerationRef.current + 1;
    sourceGenerationRef.current = sourceGeneration;
    reportedFailureGenerationRef.current = null;
    let sourceIsActive = true;
    const reportActiveFailure = () => {
      if (sourceIsActive) reportPlaybackFailure(sourceGeneration);
    };
    const handleNativeError = () => reportActiveFailure();
    video.addEventListener("error", handleNativeError);
    const restoreTime = () => {
      if (resumeTime != null && Number.isFinite(resumeTime) && video.duration > 0) {
        video.currentTime = Math.min(Math.max(0, resumeTime), video.duration);
      }
    };
    video.addEventListener("loadedmetadata", restoreTime, { once: true });

    const stallWatchdog = window.setTimeout(() => {
      if (
        sourceIsActive &&
        video.readyState < HTMLMediaElement.HAVE_METADATA &&
        !video.error
      ) {
        reportActiveFailure();
      }
    }, STALL_WATCHDOG_MS);
    const clearStallWatchdog = () => window.clearTimeout(stallWatchdog);
    video.addEventListener("loadedmetadata", clearStallWatchdog, { once: true });

    const isHls = src.split(/[?#]/, 1)[0].toLowerCase().endsWith(".m3u8");
    if (isHls && Hls.isSupported()) {
      const hls = new Hls();
      const handleHlsError = (_event: Events.ERROR, data: ErrorData) => {
        const status = data.response?.code;
        if (data.fatal || status === 401 || status === 403) reportActiveFailure();
      };
      hls.on(Hls.Events.ERROR, handleHlsError);
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;

      return () => {
        sourceIsActive = false;
        if (sourceGenerationRef.current === sourceGeneration) sourceGenerationRef.current += 1;
        window.clearTimeout(stallWatchdog);
        video.removeEventListener("error", handleNativeError);
        video.removeEventListener("loadedmetadata", restoreTime);
        video.removeEventListener("loadedmetadata", clearStallWatchdog);
        hls.off(Hls.Events.ERROR, handleHlsError);
        hls.destroy();
        if (hlsRef.current === hls) hlsRef.current = null;
      };
    } else {
      video.src = src;
      video.load();
    }

    return () => {
      sourceIsActive = false;
      if (sourceGenerationRef.current === sourceGeneration) sourceGenerationRef.current += 1;
      window.clearTimeout(stallWatchdog);
      video.removeEventListener("error", handleNativeError);
      video.removeEventListener("loadedmetadata", restoreTime);
      video.removeEventListener("loadedmetadata", clearStallWatchdog);
    };
  }, [src, sourceNonce, resumeTime, videoRef, reportPlaybackFailure]);

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
      // A/B loop: wrap back to the in point once the playhead passes the
      // out point. Read the store snapshot so this listener stays stable.
      const { loopIn, loopOut } = usePlayerStore.getState();
      if (loopIn != null && loopOut != null && loopOut > loopIn && video.currentTime >= loopOut) {
        video.currentTime = loopIn;
        return;
      }
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handlePlay = () => {
      setPlaying(true);
      onPlaybackStart?.();
    };
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    video.removeEventListener("progress", handleProgress);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [videoRef, setCurrentTime, setDuration, setBufferedEnd, setPlaying, onTimeUpdate, onPlaybackStart]);

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
    if (
      !video || !onFrameClick ||
      video.readyState < HTMLMediaElement.HAVE_METADATA ||
      video.videoWidth <= 0 || video.videoHeight <= 0
    ) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const point = projectPointIntoMedia({
      localX: e.clientX - rect.left,
      localY: e.clientY - rect.top,
      containerWidth: rect.width,
      containerHeight: rect.height,
      mediaWidth: video.videoWidth,
      mediaHeight: video.videoHeight,
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
          // J/L shuttle: HTML5 media cannot play in reverse, so J steps
          // the rate down the preset ladder instead of faking reverse.
          setPlaybackRate(nextShuttleRate(playbackRate, -1));
          break;
        case "l":
          e.preventDefault();
          setPlaybackRate(nextShuttleRate(playbackRate, 1));
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
          setPlaybackRate(nextShuttleRate(playbackRate, -1));
          break;
        }
        case "]": {
          e.preventDefault();
          setPlaybackRate(nextShuttleRate(playbackRate, 1));
          break;
        }
        case ",":
        case "<": {
          e.preventDefault();
          video.pause();
          const framesBack = e.shiftKey || key === "<" ? 10 : 1;
          video.currentTime = stepFrames(video.currentTime, -framesBack, frameRate, video.duration);
          break;
        }
        case ".":
        case ">": {
          e.preventDefault();
          video.pause();
          const framesForward = e.shiftKey || key === ">" ? 10 : 1;
          video.currentTime = stepFrames(video.currentTime, framesForward, frameRate, video.duration);
          break;
        }
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
      className={`relative w-full ${allowOverlayOverflow ? "overflow-visible" : "overflow-hidden"} rounded-[var(--radius)] bg-black outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black`}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="h-full w-full cursor-pointer rounded-[var(--radius)]"
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
