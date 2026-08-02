"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Send, X } from "lucide-react";
import { submitReviewComment } from "@/lib/review/submit-review-comment";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { Comment } from "@/lib/types/codeliver";

interface InlineReviewCommentProps {
  token: string;
  demoMode: boolean;
  projectId?: string;
  assetId: string;
  assetType: string;
  versionId?: string | null;
  reviewInviteId?: string | null;
  reviewerName: string;
  onReviewerNameChange: (value: string) => void;
  timecode: number | null;
  anchor: { x: number; y: number };
  persistedPin: { x: number; y: number } | null;
  parentId?: string | null;
  replyToName?: string | null;
  notice?: string;
  onCancel: () => void;
  onCommentCreated: (comment: Comment) => void;
}

export default function InlineReviewComment({
  token,
  demoMode,
  projectId,
  assetId,
  assetType,
  versionId,
  reviewInviteId,
  reviewerName,
  onReviewerNameChange,
  timecode,
  anchor,
  persistedPin,
  parentId,
  replyToName,
  notice,
  onCancel,
  onCommentCreated,
}: InlineReviewCommentProps) {
  const reviewerNameRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const initialReviewerNamePresent = useRef(Boolean(reviewerName.trim()));
  const [collectReviewerName, setCollectReviewerName] = useState(!initialReviewerNamePresent.current);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const horizontalSide = anchor.x > 56 ? "left" : "right";
  const verticalSide = anchor.y > 56 ? "above" : "below";
  const timeLabel = assetType === "video" && timecode != null ? formatTimeLong(timecode) : null;

  useEffect(() => {
    if (initialReviewerNamePresent.current) {
      commentRef.current?.focus();
    } else {
      reviewerNameRef.current?.focus();
    }
  }, []);

  async function submit() {
    if (!reviewerName.trim() || !body.trim() || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const comment = await submitReviewComment({
        token,
        demoMode,
        projectId,
        assetId,
        assetType,
        versionId,
        reviewInviteId,
        reviewerName,
        body,
        timecode,
        pin: persistedPin,
        parentId,
      });
      onCommentCreated(comment);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not post your comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="review-inline-comment"
      data-horizontal={horizontalSide}
      data-vertical={verticalSide}
      style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
      role="dialog"
      aria-label={
        replyToName
          ? `Reply to ${replyToName}${timeLabel ? ` at ${timeLabel}` : ""}`
          : timeLabel
            ? `Add a comment at ${timeLabel}`
            : "Add a comment to this frame"
      }
      aria-busy={submitting}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          <strong>{replyToName ? `Reply to ${replyToName}` : reviewerName.trim() || "Reviewer"}</strong>
          {timeLabel ? <span>{timeLabel}</span> : null}
        </div>
        <button type="button" onClick={onCancel} title="Cancel comment" aria-label="Cancel comment">
          <X size={14} />
        </button>
      </header>

      {collectReviewerName ? (
        <label>
          <span>Reviewer name</span>
          <input
            ref={reviewerNameRef}
            value={reviewerName}
            onChange={(event) => onReviewerNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && reviewerName.trim()) {
                event.preventDefault();
                setCollectReviewerName(false);
                commentRef.current?.focus();
              }
              if (event.key === "Escape") onCancel();
            }}
            placeholder="Your name"
            autoComplete="name"
          />
        </label>
      ) : null}

      <div className="review-inline-comment-entry">
        <input
          ref={commentRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape") onCancel();
          }}
          placeholder={replyToName ? `Reply to ${replyToName}...` : "Add a precise note..."}
          aria-label={replyToName ? `Reply to ${replyToName}` : "Comment"}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!reviewerName.trim() || !body.trim() || submitting}
          title="Send comment and continue playback"
          aria-label="Send comment and continue playback"
        >
          {submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
        </button>
      </div>

      {notice ? <p className="review-inline-comment-notice" role="status">{notice}</p> : null}

      {error ? (
        <p role="alert"><AlertCircle size={12} /> {error}</p>
      ) : null}
    </div>
  );
}
