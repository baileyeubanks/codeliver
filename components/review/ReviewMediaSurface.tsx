"use client";

import { useCallback, useState, type MouseEventHandler, type ReactNode, type RefObject } from "react";
import { Layers3 } from "lucide-react";
import FailOnStageCard from "@/components/player/FailOnStageCard";
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
    collapsed?: boolean;
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
  // VA-010: a failed source never unmounts the stage. The player, poster,
  // and transport stay in the tree; one quiet card rides on the dimmed frame.
  const mediaFailed = assetUrl != null && failedSource === assetUrl;
  const handlePlaybackError = useCallback(() => {
    if (assetUrl) setFailedSource(assetUrl);
  }, [assetUrl]);
  const retryPlayback = useCallback(() => {
    setFailedSource(null);
    setRetryAttempt((attempt) => attempt + 1);
  }, []);

  if (assetType === "video") {
    return (
      <div
        className="review-video-surface"
        data-stage-state={mediaFailed ? "failed" : undefined}
      >
        <div className="review-video-frame">
          {assetUrl ? (
            <VideoPlayer
              key={`${assetUrl}:${retryAttempt}`}
              src={assetUrl}
              poster={poster}
              videoRef={videoRef}
              onPlaybackError={handlePlaybackError}
              onFrameClick={annotationEnabled && !mediaFailed ? onFramePin : undefined}
              onPlaybackStart={onPlaybackStart}
              onCutMarker={onCutMarker}
              allowOverlayOverflow
            >
              {overlay}
              {mediaFailed ? (
                <FailOnStageCard onRetry={retryPlayback}>
                  {fallbackAction}
                </FailOnStageCard>
              ) : null}
            </VideoPlayer>
          ) : (
            <div className="review-stage-shell" data-stage-failed="true">
              <FailOnStageCard>{fallbackAction}</FailOnStageCard>
            </div>
          )}
        </div>

        <PlayerControls
          videoRef={videoRef}
          commentNavigation={commentNavigation}
          commentMarkers={commentMarkers}
          onCommentMarkerSelect={onCommentMarkerSelect}
          selectedCommentId={selectedCommentId}
        />

        {timeline ? (
          timeline.collapsed ? (
            <details className="review-timeline-help">
              <summary>{timeline.label}</summary>
              {timeline.content}
            </details>
          ) : (
            <div className="review-video-timeline border-t border-[var(--border)]">
              <div className="flex items-center justify-between px-4 pt-3 text-xs text-[var(--muted)]">
                <span>{timeline.label}</span>
                <span>{timeline.countLabel}</span>
              </div>
              {timeline.content}
            </div>
          )
        ) : null}
      </div>
    );
  }

  if (assetType === "image" && assetUrl) {
    if (mediaFailed) {
      return (
        <div className="flex justify-center bg-black/90 p-3 sm:p-4">
          <div className="review-stage-shell" data-stage-failed="true">
            <FailOnStageCard onRetry={retryPlayback}>{fallbackAction}</FailOnStageCard>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-center bg-black/90 p-3 sm:p-4">
        <div
          className={`relative inline-block overflow-hidden rounded-[var(--radius)] ${
            pinMode && onImagePin ? "cursor-crosshair" : ""
          }`}
          onClick={onImagePin}
        >
          <img
            key={`${assetUrl}:${retryAttempt}`}
            ref={imageRef}
            src={assetUrl}
            alt={assetTitle}
            onError={handlePlaybackError}
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
