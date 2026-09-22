"use client";

import { useCallback, useState, type MouseEventHandler, type ReactNode, type RefObject } from "react";
import { Layers3 } from "lucide-react";
import PlayerControls from "@/components/player/PlayerControls";
import type { TimelineComment } from "@/components/player/PlayerTimeline";
import VideoPlayer from "@/components/player/VideoPlayer";

interface ReviewMediaSurfaceProps {
  assetType: string;
  assetTitle: string;
  assetUrl: string | null;
  poster?: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  imageRef?: RefObject<HTMLImageElement | null>;
  pinMode: boolean;
  annotationEnabled?: boolean;
  overlay: ReactNode;
  onFramePin?: (x: number, y: number, timeSeconds: number) => void;
  onPlaybackStart?: () => void;
  commentNavigation?: {
    onPrevious: () => void;
    onNext: () => void;
    disabled: boolean;
  };
  commentMarkers?: TimelineComment[];
  onCommentMarkerSelect?: (comment: TimelineComment) => void;
  selectedCommentId?: string | null;
  onCutMarker?: (time: number) => void;
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
  poster,
  videoRef,
  imageRef,
  pinMode,
  annotationEnabled = false,
  overlay,
  onFramePin,
  onPlaybackStart,
  commentNavigation,
  commentMarkers,
  onCommentMarkerSelect,
  selectedCommentId,
  onCutMarker,
  onImagePin,
  timeline,
  fallbackAction,
}: ReviewMediaSurfaceProps) {
  const [previousSource, setPreviousSource] = useState(assetUrl);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  if (previousSource !== assetUrl) {
    setPreviousSource(assetUrl);
    setFailedSource(null);
  }
  const playbackFailed = assetType === "video" && failedSource === assetUrl;
  const handlePlaybackError = useCallback(() => {
    if (assetUrl) setFailedSource(assetUrl);
  }, [assetUrl]);
  const retryPlayback = useCallback(() => {
    setFailedSource(null);
    setRetryAttempt((attempt) => attempt + 1);
  }, []);

  if (assetType === "video" && assetUrl) {
    if (playbackFailed) {
      return (
        <div className="review-video-surface">
          <div className="review-video-frame flex min-h-64 items-center justify-center bg-black px-6 py-12 text-center">
            <div role="alert" className="max-w-sm">
              <h2 className="review-display text-lg font-semibold text-white">Playback unavailable</h2>
              <p className="mt-2 text-sm text-white/70">
                This version could not be loaded. Try again.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={retryPlayback}
                  aria-label="Retry playback"
                  className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                >
                  Retry playback
                </button>
                {fallbackAction ? <div>{fallbackAction}</div> : null}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="review-video-surface">
        <div className="review-video-frame">
          <VideoPlayer
            key={`${assetUrl}:${retryAttempt}`}
            src={assetUrl}
            poster={poster}
            videoRef={videoRef}
            onPlaybackError={handlePlaybackError}
            onFrameClick={annotationEnabled ? onFramePin : undefined}
            onPlaybackStart={onPlaybackStart}
            onCutMarker={onCutMarker}
            allowOverlayOverflow
          >
            {overlay}
          </VideoPlayer>
        </div>

        <PlayerControls
          videoRef={videoRef}
          commentNavigation={commentNavigation}
          commentMarkers={commentMarkers}
          onCommentMarkerSelect={onCommentMarkerSelect}
          selectedCommentId={selectedCommentId}
        />

        {timeline ? (
          <div className="review-video-timeline border-t border-[var(--border)]">
            <div className="flex items-center justify-between px-4 pt-3 text-xs text-[var(--muted)]">
              <span>{timeline.label}</span>
              <span>{timeline.countLabel}</span>
            </div>
            {timeline.content}
          </div>
        ) : null}
      </div>
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
            ref={imageRef}
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
