"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Send, X } from "lucide-react";
import { submitReviewComment } from "@/lib/review/submit-review-comment";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { Comment } from "@/lib/types/codeliver";

interface InlineReviewCommentProps {
  token: string;
  demoMode: boolean;
  assetId: string;
  reviewerName: string;
  onReviewerNameChange: (value: string) => void;
  timecode: number;
  pin: { x: number; y: number };
  onCancel: () => void;
  onCommentCreated: (comment: Comment) => void;
}

export default function InlineReviewComment({
  token,
  demoMode,
  assetId,
  reviewerName,
  onReviewerNameChange,
  timecode,
  pin,
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
  const horizontalSide = pin.x > 56 ? "left" : "right";
  const verticalSide = pin.y > 56 ? "above" : "below";

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
        assetId,
        assetType: "video",
        reviewerName,
        body,
        timecode,
        pin,
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
      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
      role="dialog"
      aria-label={`Add a comment at ${formatTimeLong(timecode)}`}
      aria-busy={submitting}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          <strong>{reviewerName.trim() || "Reviewer"}</strong>
          <span>{formatTimeLong(timecode)}</span>
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
          placeholder="Add a precise note..."
          aria-label="Comment"
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

      {error ? (
        <p role="alert"><AlertCircle size={12} /> {error}</p>
      ) : null}
    </div>
  );
}
