"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Layers, SplitSquareHorizontal, X } from "lucide-react";
import type { Version } from "@/lib/types/codeliver";

interface VersionCompareProps {
  versionA: Version;
  versionB: Version;
  onClose: () => void;
}

type Mode = "side-by-side" | "overlay";

export default function VersionCompare({ versionA, versionB, onClose }: VersionCompareProps) {
  const [mode, setMode] = useState<Mode>("side-by-side");
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [syncedTime, setSyncedTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  // Sync playback between both videos
  const syncVideos = useCallback(() => {
    if (!videoARef.current || !videoBRef.current) return;
    const timeA = videoARef.current.currentTime;
    setSyncedTime(timeA);
    if (Math.abs(videoBRef.current.currentTime - timeA) > 0.2) {
      videoBRef.current.currentTime = timeA;
    }
  }, []);

  useEffect(() => {
    const videoA = videoARef.current;
    if (!videoA) return;
    videoA.addEventListener("timeupdate", syncVideos);
    return () => videoA.removeEventListener("timeupdate", syncVideos);
  }, [syncVideos]);

  function togglePlay() {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;

    if (playing) {
      a.pause();
      b.pause();
    } else {
      b.currentTime = a.currentTime;
      a.play();
      b.play();
    }
    setPlaying(!playing);
  }

  const left = versionA.version_number < versionB.version_number ? versionA : versionB;
  const right = versionA.version_number < versionB.version_number ? versionB : versionA;

  return (
    <div className="fixed inset-0 bg-[var(--bg)] z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Layers size={16} />
            Comparing v{left.version_number} → v{right.version_number}
          </h3>
          <div className="flex bg-[var(--bg)] rounded-lg p-0.5">
            <button
              onClick={() => setMode("side-by-side")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
                mode === "side-by-side"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              <SplitSquareHorizontal size={12} /> Side by Side
            </button>
            <button
              onClick={() => setMode("overlay")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
                mode === "overlay"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              <Layers size={12} /> Overlay
            </button>
          </div>
        </div>

        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)]">
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "side-by-side" ? (
          <div className="flex h-full">
            <div className="flex-1 flex flex-col items-center justify-center bg-black border-r border-[var(--border)] relative">
              <span className="absolute top-2 left-2 text-xs font-mono text-white/60 bg-black/50 px-2 py-0.5 rounded">
                v{left.version_number}
              </span>
              <video
                ref={videoARef}
                src={left.file_url}
                className="max-w-full max-h-full"
                onClick={togglePlay}
              />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center bg-black relative">
              <span className="absolute top-2 left-2 text-xs font-mono text-white/60 bg-black/50 px-2 py-0.5 rounded">
                v{right.version_number}
              </span>
              <video
                ref={videoBRef}
                src={right.file_url}
                className="max-w-full max-h-full"
                onClick={togglePlay}
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center bg-black relative">
            <video
              ref={videoARef}
              src={left.file_url}
              className="max-w-full max-h-full absolute"
              onClick={togglePlay}
            />
            <video
              ref={videoBRef}
              src={right.file_url}
              className="max-w-full max-h-full absolute"
              style={{ opacity: overlayOpacity }}
              onClick={togglePlay}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[var(--surface)]/90 rounded-lg px-4 py-2 border border-[var(--border)]">
              <span className="text-xs text-[var(--dim)]">v{left.version_number}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                className="w-32 accent-[var(--accent)]"
              />
              <span className="text-xs text-[var(--dim)]">v{right.version_number}</span>
            </div>
          </div>
        )}
      </div>

      {/* Transport */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-center">
        <button
          onClick={togglePlay}
          className="text-sm text-[var(--accent)] font-medium hover:underline"
        >
          {playing ? "Pause" : "Play"} synced
        </button>
      </div>
    </div>
  );
}
