"use client";

import { useRef, useEffect, useCallback, type ReactNode, type RefObject } from "react";
import Hls from "hls.js";
import { usePlayerStore } from "@/lib/stores/playerStore";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onTimeUpdate?: (time: number) => void;
  onFrameClick?: (x: number, y: number) => void;
  children?: ReactNode;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

export default function VideoPlayer({
  src,
  poster,
  onTimeUpdate,
  onFrameClick,
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
    setCurrentTime,
    setDuration,
    setPlaying,
    togglePlay,
    toggleMute,
    setPlaybackRate,
  } = usePlayerStore();

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

  // Click on video: pause + fire coordinate callback
  const handleVideoClick = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      const video = videoRef.current;
      if (!video) return;

      const rect = video.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;

      video.pause();
      onFrameClick?.(xPct, yPct);
    },
    [videoRef, onFrameClick],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;

      const video = videoRef.current;
      if (!video) return;

      const frameDuration = 1 / frameRate;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
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
          video.currentTime = Math.max(0, video.currentTime - frameDuration);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + frameDuration);
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
  }, [videoRef, frameRate, playbackRate, togglePlay, toggleMute, setPlaybackRate]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-[var(--radius)] bg-black"
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
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto h-full w-full">{children}</div>
      </div>
    </div>
  );
}
