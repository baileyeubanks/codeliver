"use client";

import { ChevronLeft, ChevronRight, GripVertical, MessageSquareText, Send, X } from "lucide-react";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { Comment } from "@/lib/types/codeliver";

interface AnchoredCommentCalloutProps {
  comment: Comment;
  threadNumber: number;
  replyCount: number;
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
  canReply,
  onClose,
  onPrevious,
  onNext,
  onReply,
}: AnchoredCommentCalloutProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const composing = useRef(false);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const horizontal = (comment.pin_x ?? 50) > 56 ? "left" : "right";
  const vertical = (comment.pin_y ?? 50) > 56 ? "above" : "below";

  function stopDragging() {
    drag.current = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stopDragging);
  }

  function move(event: PointerEvent) {
    const active = drag.current;
    if (!active) return;
    setOffset({ x: active.originX + event.clientX - active.x, y: active.originY + event.clientY - active.y });
  }

  function beginDragging(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    drag.current = { x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stopDragging, { once: true });
  }

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
      <span className="review-anchored-comment-leader" aria-hidden="true" />
      <div className="review-anchored-comment-card">
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
