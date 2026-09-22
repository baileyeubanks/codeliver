"use client";

import { ChevronLeft, ChevronRight, GripVertical, MessageSquareText, Send, X } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { Comment } from "@/lib/types/codeliver";
import AnchoredLeaderLine from "@/components/review/AnchoredLeaderLine";
import { useCalloutDrag } from "@/components/review/useCalloutDrag";

interface AnchoredCommentCalloutProps {
  comment: Pick<Comment, "id" | "author_name" | "body" | "timecode_seconds" | "pin_x" | "pin_y">;
  threadNumber: number;
  replyCount: number;
  replies: Array<Pick<Comment, "id" | "author_name" | "body">>;
  canReply: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReply: (body: string) => Promise<void>;
}

/** A view-only anchor with a movable conversation card. Dragging never mutates
 * pin_x/pin_y, which remain the immutable frame coordinates on the comment. */
export default function AnchoredCommentCallout({
  comment,
  threadNumber,
  replyCount,
  replies,
  canReply,
  onClose,
  onPrevious,
  onNext,
  onReply,
}: AnchoredCommentCalloutProps) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const composing = useRef(false);
  const anchorRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { offset, beginDragging } = useCalloutDrag(cardRef);
  const horizontal = (comment.pin_x ?? 50) > 56 ? "left" : "right";
  const vertical = (comment.pin_y ?? 50) > 56 ? "above" : "below";

  async function submitReply() {
    if (!reply.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await onReply(reply.trim());
      setReply("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      ref={anchorRef}
      className="review-anchored-comment"
      data-horizontal={horizontal}
      data-vertical={vertical}
      style={{
        left: `${comment.pin_x}%`,
        top: `${comment.pin_y}%`,
        "--callout-drag-x": `${offset.x}px`,
        "--callout-drag-y": `${offset.y}px`,
      } as CSSProperties}
      role="dialog"
      aria-label={`Comment ${threadNumber} at ${formatTimeLong(comment.timecode_seconds ?? 0)}`}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="review-anchored-comment-pin" aria-hidden="true">{threadNumber}</span>
      <AnchoredLeaderLine anchorRef={anchorRef} cardRef={cardRef} refreshKey={`${offset.x}:${offset.y}`} className="review-anchored-comment-leader" />
      <div ref={cardRef} className="review-anchored-comment-card">
        <header>
          <button type="button" className="review-anchored-comment-drag" onPointerDown={beginDragging} aria-label="Move comment card">
            <GripVertical size={15} />
          </button>
          <div>
            <strong>{comment.author_name || "Reviewer"}</strong>
            <span>{formatTimeLong(comment.timecode_seconds ?? 0)}</span>
          </div>
          <nav aria-label="Comment navigation">
            <button type="button" onClick={onPrevious} aria-label="Previous comment"><ChevronLeft size={15} /></button>
            <button type="button" onClick={onNext} aria-label="Next comment"><ChevronRight size={15} /></button>
            <button type="button" onClick={onClose} aria-label="Close comment"><X size={15} /></button>
          </nav>
        </header>
        <p>{comment.body}</p>
        <div className="review-anchored-comment-thread"><MessageSquareText size={12} /> {replyCount} {replyCount === 1 ? "reply" : "replies"}</div>
        {replies.length ? <ol className="review-anchored-comment-replies">{replies.map((item) => <li key={item.id}><strong>{item.author_name || "Reviewer"}</strong><span>{item.body}</span></li>)}</ol> : null}
        {canReply ? (
          <div className="review-anchored-comment-reply">
            <textarea
              value={reply}
              rows={2}
              onChange={(event) => setReply(event.target.value)}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={() => { composing.current = false; }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) {
                  event.preventDefault();
                  void submitReply();
                }
              }}
              placeholder="Reply to this note"
              aria-label="Reply to selected comment"
            />
            <button type="button" disabled={!reply.trim() || sending} onClick={() => void submitReply()} aria-label="Send reply">
              <Send size={14} />
            </button>
          </div>
        ) : null}
        {error ? <p className="review-anchored-comment-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
