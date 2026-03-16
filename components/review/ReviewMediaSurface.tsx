"use client";

import type { MouseEventHandler, ReactNode, RefObject } from "react";
import { Layers3 } from "lucide-react";
import PlayerControls from "@/components/player/PlayerControls";
import VideoPlayer from "@/components/player/VideoPlayer";

interface ReviewMediaSurfaceProps {
  assetType: string;
  assetTitle: string;
  assetUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  pinMode: boolean;
  overlay: ReactNode;
  onFramePin?: (x: number, y: number) => void;
  onImagePin?: MouseEventHandler<HTMLDivElement>;
  timeline?: {
    label: string;
    countLabel: string;
    content: ReactNode;
  } | null;
  fallbackAction?: ReactNode;
}

export default function ReviewMediaSurface({
  assetType,
  assetTitle,
  assetUrl,
  videoRef,
  pinMode,
  overlay,
  onFramePin,
  onImagePin,
  timeline,
  fallbackAction,
}: ReviewMediaSurfaceProps) {
  if (assetType === "video" && assetUrl) {
    return (
      <>
        <div className="bg-black/90 p-3 sm:p-4">
          <VideoPlayer
            src={assetUrl}
            videoRef={videoRef}
            onFrameClick={pinMode ? onFramePin : undefined}
          >
            {overlay}
          </VideoPlayer>
        </div>

        <PlayerControls videoRef={videoRef} />

        {timeline ? (
          <div className="border-t border-[var(--border)]">
            <div className="flex items-center justify-between px-4 pt-3 text-xs text-[var(--muted)]">
              <span>{timeline.label}</span>
              <span>{timeline.countLabel}</span>
            </div>
            {timeline.content}
          </div>
        ) : null}
      </>
    );
  }

  if (assetType === "image" && assetUrl) {
    return (
      <div className="flex justify-center bg-black/90 p-3 sm:p-4">
        <div
          className={`relative inline-block overflow-hidden rounded-[var(--radius)] ${
            pinMode && onImagePin ? "cursor-crosshair" : ""
          }`}
          onClick={onImagePin}
        >
          <img
            src={assetUrl}
            alt={assetTitle}
            className="max-h-[78vh] w-auto max-w-full object-contain"
          />
          {overlay}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-12 text-center">
      <Layers3 size={28} className="mx-auto text-[var(--dim)]" />
      <h2 className="review-display mt-4 text-lg font-semibold text-[var(--ink)]">Preview not available</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        This file type does not have an in-browser review surface yet.
      </p>
      {fallbackAction ? <div className="mt-4">{fallbackAction}</div> : null}
    </div>
  );
}
