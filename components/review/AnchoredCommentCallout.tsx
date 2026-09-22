"use client";

import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, MessageSquareText, Send, X } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { Comment, CommentAttachment } from "@/lib/types/codeliver";
import AnchoredLeaderLine from "@/components/review/AnchoredLeaderLine";
import { useCalloutDrag } from "@/components/review/useCalloutDrag";
import AttachmentPreview from "@/components/comments/AttachmentPreview";
import { REVIEW_IMAGE_ACCEPT, uploadReviewImageAttachment, validateReviewImage } from "@/lib/review/image-attachments-client";

interface AnchoredCommentCalloutProps {
  comment: Pick<Comment, "id" | "author_name" | "body" | "timecode_seconds" | "pin_x" | "pin_y" | "attachments">;
  threadNumber: number;
  replyCount: number;
  replies: Array<Pick<Comment, "id" | "author_name" | "body" | "attachments">>;
  canReply: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReply: (body: string) => Promise<{ id: string }>;
  versionId?: string | null;
  attachmentEndpoint?: string;
  onAttachmentCreated?: (commentId: string, attachment: CommentAttachment) => void;
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
  versionId,
  attachmentEndpoint,
  onAttachmentCreated,
}: AnchoredCommentCalloutProps) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [persistedReplyId, setPersistedReplyId] = useState<string | null>(null);
  const attachmentKey = useRef<string | null>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const anchorRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { offset, beginDragging } = useCalloutDrag(cardRef);
  const horizontal = (comment.pin_x ?? 50) > 56 ? "left" : "right";
  const vertical = (comment.pin_y ?? 50) > 56 ? "above" : "below";

  async function submitReply() {
    if ((!reply.trim() && !persistedReplyId) || sending) return;
    setSending(true);
    setError("");
    try {
      let replyId = persistedReplyId;
      if (!replyId) {
        const created = await onReply(reply.trim());
        replyId = created.id;
        if (!attachment) { setReply(""); return; }
        setPersistedReplyId(replyId);
      }
      if (!attachment || !attachmentEndpoint || !versionId) throw new Error("Image attachments are unavailable for this review version.");
      attachmentKey.current ??= crypto.randomUUID();
      const saved = await uploadReviewImageAttachment({ endpoint: attachmentEndpoint, commentId: replyId, versionId, idempotencyKey: attachmentKey.current, file: attachment });
      onAttachmentCreated?.(replyId, saved);
      setReply(""); setAttachment(null); setPersistedReplyId(null); attachmentKey.current = null;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save your reply."); }
    finally { setSending(false); }
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
        {comment.attachments?.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}
        <div className="review-anchored-comment-thread"><MessageSquareText size={12} /> {replyCount} {replyCount === 1 ? "reply" : "replies"}</div>
        {replies.length ? <ol className="review-anchored-comment-replies">{replies.map((item) => <li key={item.id}><strong>{item.author_name || "Reviewer"}</strong><span>{item.body}</span>{item.attachments?.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}</li>)}</ol> : null}
        {canReply ? (
          <div className="review-anchored-comment-reply">
            {!attachmentEndpoint ? null : <><input ref={attachmentInput} type="file" accept={REVIEW_IMAGE_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; const invalid = file ? validateReviewImage(file) : null; if (invalid) { setAttachment(null); setError(invalid); return; } setAttachment(file); attachmentKey.current = null; setError(""); }} /><button type="button" className="review-anchored-comment-image" onClick={() => attachmentInput.current?.click()} aria-label="Attach image"><ImagePlus size={13} /></button></>}
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
